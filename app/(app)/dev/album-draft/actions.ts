"use server";

import { analyzeSmartCropPhoto } from "../smart-crop/actions";
import { buildPetAlbumStory } from "../album-story/actions";
import type { AlbumPeriodInput } from "@/lib/album-candidates/types";
import { albumDraftCacheKey, getAlbumDraftCache, setAlbumDraftCache } from "@/lib/album-draft/cache";
import { buildAlbumDraft } from "@/lib/album-draft/draft";
import { albumDraftFingerprint } from "@/lib/album-draft/fingerprint";
import type { AlbumDraftResult, AlbumSpreadDraft } from "@/lib/album-draft/types";
import type { LayoutPhotoInput } from "@/lib/smart-layout/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AlbumDraftRun = {
  ok: boolean;
  message: string | null;
  petId: string | null;
  draft: AlbumDraftResult | null;
  spreads: AlbumSpreadDraft[];
};

function configFingerprint() {
  return albumDraftFingerprint();
}

function emptyRun(message: string): AlbumDraftRun {
  return { ok: false, message, petId: null, draft: null, spreads: [] };
}

/** Turn the month's story spreads into cropped layout drafts. Does not write a database row. */
export async function buildPetAlbumDraft(petId: string, periodInput: AlbumPeriodInput, options?: { storedOnly?: boolean; dateRange?: { start: string; end: string }; allowedPhotoIds?: string[] }): Promise<AlbumDraftRun> {
  if (!UUID_PATTERN.test(petId)) return emptyRun("不正なIDです。");
  const storyRun = await buildPetAlbumStory(petId, periodInput, { allowLargeImageDegrade: true, ...options });
  if (!storyRun.ok || !storyRun.story) return emptyRun(storyRun.message ?? "ストーリーの取得に失敗しました。");

  const photoIds = [...new Set(storyRun.story.spreads.flatMap((spread) => spread.photoIds))];
  const analyses = await Promise.all(photoIds.map((photoId) => analyzeSmartCropPhoto(petId, photoId, { allowLargeImageDegrade: true, storedOnly: options?.storedOnly })));
  const photos: LayoutPhotoInput[] = [];
  for (let index = 0; index < analyses.length; index++) {
    const analysis = analyses[index];
    const photoId = photoIds[index];
    if (!analysis.ok || !analysis.analysis) {
      return emptyRun(analysis.message ?? `写真の解析に失敗しました（${photoId}）。`);
    }
    const preview = analysis.previewUrl ?? analysis.thumbnailUrl ?? analysis.imageUrl;
    if (!preview) return emptyRun(`Preview URLがありません（${photoId}）。`);
    photos.push({
      photoId,
      imageUrl: analysis.imageUrl ?? preview,
      previewUrl: preview,
      analysis: analysis.analysis,
    });
  }

  const key = albumDraftCacheKey(
    storyRun.story.spreads.map((spread) => spread.id),
    photoIds,
    configFingerprint(),
  );
  const cached = getAlbumDraftCache(key);
  const draft =
    cached ??
    buildAlbumDraft({
      period: storyRun.story.period,
      spreads: storyRun.story.spreads,
      photos,
    });
  if (!cached) setAlbumDraftCache(key, draft);

  return {
    ok: true,
    message: null,
    petId,
    draft,
    spreads: draft.spreads,
  };
}
