"use server";

import { selectPetAlbumCandidates } from "../album-candidates/actions";
import { selectPetBestShots } from "../best-shot/actions";
import type { AlbumPeriodInput } from "@/lib/album-candidates/types";
import { albumStoryFingerprint } from "@/lib/album-story/config";
import { albumStoryCacheKey, getAlbumStoryCache, setAlbumStoryCache } from "@/lib/album-story/cache";
import { buildAlbumStory } from "@/lib/album-story/group";
import type { AlbumStoryResult, StorySceneInput, StorySpread } from "@/lib/album-story/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StoryPhotoCard = {
  photoId: string;
  role: "primary" | "secondary";
  thumbUrl: string | null;
};

export type StorySpreadCard = StorySpread & {
  photos: StoryPhotoCard[];
};

export type AlbumStoryRun = {
  ok: boolean;
  message: string | null;
  petId: string | null;
  story: AlbumStoryResult | null;
  spreads: StorySpreadCard[];
};

function configFingerprint() {
  return albumStoryFingerprint();
}

function emptyRun(message: string): AlbumStoryRun {
  return { ok: false, message, petId: null, story: null, spreads: [] };
}

/** Group the month's selected scenes into spreads. Does not write a database row. */
export async function buildPetAlbumStory(petId: string, periodInput: AlbumPeriodInput, options?: { storedOnly?: boolean; allowLargeImageDegrade?: boolean; dateRange?: { start: string; end: string }; allowedPhotoIds?: string[] }): Promise<AlbumStoryRun> {
  if (!UUID_PATTERN.test(petId)) return emptyRun("不正なIDです。");
  const candidates = await selectPetAlbumCandidates(petId, periodInput, options);
  if (!candidates.ok || !candidates.result) return emptyRun(candidates.message ?? "候補の取得に失敗しました。");

  const shots = await selectPetBestShots(petId, options);
  const memoryByPhoto = new Map<string, number>();
  if (shots.ok) {
    for (const group of shots.groups) {
      for (const candidate of group.selection.ranking) {
        memoryByPhoto.set(candidate.photoId, candidate.scores.memoryValue);
      }
    }
  }

  const thumbs = new Map<string, string | null>();
  const scenes: StorySceneInput[] = candidates.selected.map((card) => {
    thumbs.set(card.primaryPhotoId, card.primaryThumbUrl);
    if (card.secondaryPhotoId) thumbs.set(card.secondaryPhotoId, card.secondaryThumbUrl);
    return {
      groupId: card.groupId,
      startedAt: card.startedAt,
      scene: card.scene,
      activity: card.activity,
      tags: card.tags,
      sceneScore: card.sceneScore,
      mustKeep: card.mustKeep,
      bestShot: card.bestShot,
      memoryValue: memoryByPhoto.get(card.primaryPhotoId) ?? card.sceneScore,
      primaryPhotoId: card.primaryPhotoId,
      secondaryPhotoId: card.secondaryPhotoId,
    };
  });

  const period = candidates.result.period;
  const key = albumStoryCacheKey(
    petId,
    period,
    scenes.map((scene) => scene.groupId),
    configFingerprint(),
  );
  const cached = getAlbumStoryCache(key);
  const story = cached ?? buildAlbumStory({ period, scenes });
  if (!cached) setAlbumStoryCache(key, story);

  return {
    ok: true,
    message: null,
    petId,
    story,
    spreads: story.spreads.map((spread) => ({
      ...spread,
      photos: spread.photoIds.map((photoId) => ({
        photoId,
        role: spread.secondaryPhotoIds.includes(photoId) ? "secondary" : "primary",
        thumbUrl: thumbs.get(photoId) ?? null,
      })),
    })),
  };
}
