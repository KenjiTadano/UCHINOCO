"use server";

import { selectPetBestShots } from "../best-shot/actions";
import { albumCandidateFingerprint } from "@/lib/album-candidates/config";
import { albumCandidateCacheKey, getAlbumCandidateCache, setAlbumCandidateCache } from "@/lib/album-candidates/cache";
import { AlbumPeriodError, resolveAlbumPeriod } from "@/lib/album-candidates/period";
import { selectAlbumCandidates } from "@/lib/album-candidates/select";
import { describePrimaryStyle } from "@/lib/album-candidates/style";
import type { AlbumCandidateResult, AlbumCandidateScene, AlbumPeriodInput, AlbumSceneInput } from "@/lib/album-candidates/types";
import { geometryMemoryKey } from "@/lib/photo-analysis/keys";
import { getSmartCropCache } from "@/lib/smart-crop/cache";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AlbumCandidateCard = AlbumCandidateScene & {
  primaryThumbUrl: string | null;
  secondaryThumbUrl: string | null;
  bestShot: number;
  memberCount: number;
  memberPhotoIds: string[];
};

export type AlbumCandidateRun = {
  ok: boolean;
  message: string | null;
  petId: string | null;
  sourcePhotoCount: number;
  result: AlbumCandidateResult | null;
  selected: AlbumCandidateCard[];
  rejected: AlbumCandidateCard[];
};

function configFingerprint() {
  return albumCandidateFingerprint();
}

function emptyRun(message: string): AlbumCandidateRun {
  return {
    ok: false,
    message,
    petId: null,
    sourcePhotoCount: 0,
    result: null,
    selected: [],
    rejected: [],
  };
}

function pairVisual(pairs: { photoA: string; photoB: string; visualScore: number }[], a: string, b: string) {
  const pair = pairs.find((item) => (item.photoA === a && item.photoB === b) || (item.photoA === b && item.photoB === a));
  return pair?.visualScore ?? 50;
}

/** Choose album scenes from Task053 best shots. Does not write a database row. */
export async function selectPetAlbumCandidates(petId: string, periodInput: AlbumPeriodInput, options?: { storedOnly?: boolean; allowLargeImageDegrade?: boolean; dateRange?: { start: string; end: string }; allowedPhotoIds?: string[] }): Promise<AlbumCandidateRun> {
  if (!UUID_PATTERN.test(petId)) return emptyRun("不正なIDです。");
  let period;
  try {
    period = resolveAlbumPeriod(periodInput);
  } catch (error) {
    if (error instanceof AlbumPeriodError) return emptyRun(error.message);
    throw error;
  }
  const shots = await selectPetBestShots(petId, options);
  if (!shots.ok) return emptyRun(shots.message ?? "選定の準備に失敗しました。");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyRun("ログインが必要です。");

  const photoQuery = supabase.from("photos").select("id, storage_path, updated_at, content_hash").eq("pet_id", petId).eq("uploader_user_id", user.id);
  const rangedPhotoQuery = options?.dateRange ? photoQuery.gte("timeline_at", options.dateRange.start).lte("timeline_at", options.dateRange.end) : photoQuery;
  let rows = [] as NonNullable<Awaited<typeof rangedPhotoQuery>["data"]>;
  if (options?.dateRange) {
    for (let offset = 0; ; offset += 200) {
      const page = await rangedPhotoQuery.order("id", { ascending: true }).range(offset, offset + 199);
      if (page.error || !page.data) return emptyRun("写真を読み込めませんでした。");
      rows.push(...page.data);
      if (page.data.length < 200) break;
    }
  } else {
    const result = await rangedPhotoQuery.limit(40);
    rows = result.data ?? [];
  }
  const storageById = new Map((rows ?? []).map((row) => [row.id, row]));

  const scenes: AlbumSceneInput[] = shots.groups.map(({ group, selection }) => {
    const primary = selection.ranking.find((candidate) => candidate.photoId === selection.primaryPhotoId);
    const secondary = selection.secondaryPhotoId ? selection.ranking.find((candidate) => candidate.photoId === selection.secondaryPhotoId) : undefined;
    const source = storageById.get(selection.primaryPhotoId);
    const analysis = source ? getSmartCropCache(geometryMemoryKey(source)) : null;
    const style = describePrimaryStyle(analysis, group.tags);
    const scores = primary?.scores;
    return {
      groupId: group.id,
      startedAt: group.startedAt,
      endedAt: group.endedAt,
      scene: group.scene,
      activity: group.activity,
      tags: group.tags,
      groupConfidence: group.groupConfidence,
      warnings: [...new Set([...group.warnings, ...selection.warnings])],
      selectionConfidence: selection.confidence,
      memberCount: group.photoIds.length,
      primary: {
        photoId: selection.primaryPhotoId,
        bestShot: scores?.overall ?? 0,
        memoryValue: scores?.memoryValue ?? 0,
        expression: scores?.expression ?? 0,
        petVisibility: scores?.petVisibility ?? 0,
        relativeUniqueness: scores?.relativeUniqueness ?? 0,
        sceneRepresentativeness: scores?.sceneRepresentativeness ?? 0,
        composition: scores?.composition ?? 0,
        framing: style.framing,
        placement: style.placement,
        orientation: style.orientation,
      },
      secondary:
        secondary && selection.secondaryPhotoId
          ? {
              photoId: selection.secondaryPhotoId,
              bestShot: secondary.scores.overall,
              memoryValue: secondary.scores.memoryValue,
              visualSimilarityToPrimary: pairVisual(group.pairs, selection.primaryPhotoId, selection.secondaryPhotoId),
            }
          : undefined,
    };
  });

  const availablePhotoCount = shots.groups.reduce((sum, item) => sum + item.group.photoIds.length, 0);
  const fingerprint = configFingerprint();
  const key = albumCandidateCacheKey(
    petId,
    period,
    scenes.map((scene) => scene.groupId),
    fingerprint,
  );
  const cached = getAlbumCandidateCache(key);
  const result = cached ?? selectAlbumCandidates({ scenes, availablePhotoCount, period });
  if (!cached) setAlbumCandidateCache(key, result);

  const thumbs = new Map<string, string | null>();
  const inputById = new Map(scenes.map((scene) => [scene.groupId, scene]));
  const membersById = new Map(shots.groups.map(({ group }) => [group.id, group.photoIds]));
  for (const { group } of shots.groups) {
    for (const member of group.members) thumbs.set(member.photoId, member.thumbUrl);
  }
  const withThumbs = (scene: AlbumCandidateScene): AlbumCandidateCard => ({
    ...scene,
    primaryThumbUrl: thumbs.get(scene.primaryPhotoId) ?? null,
    secondaryThumbUrl: scene.secondaryPhotoId ? (thumbs.get(scene.secondaryPhotoId) ?? null) : null,
    bestShot: inputById.get(scene.groupId)?.primary.bestShot ?? 0,
    memberCount: inputById.get(scene.groupId)?.memberCount ?? 1,
    memberPhotoIds: membersById.get(scene.groupId) ?? [],
  });

  return {
    ok: true,
    message: null,
    petId,
    sourcePhotoCount: availablePhotoCount,
    result,
    selected: result.selectedScenes.map(withThumbs),
    rejected: result.rejectedScenes.map(withThumbs),
  };
}
