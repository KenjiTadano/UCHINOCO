import { createHash } from "node:crypto";

export type PlacementMode = "EXISTING_SPREAD" | "INSERT_AFTER" | "APPEND";

export type PlacementSpread = {
  id: string;
  position: number;
  role: string;
  density: string;
  storyStartedAt: string | null;
  frameCount: number;
  edited: boolean;
};

export type PlacementPhoto = {
  id: string;
  petId: string;
  takenAt: string;
  orientation: "portrait" | "landscape" | "square";
  bestShotScore: number | null;
  crop: { x: number; y: number; scale: number };
};

export type PhotoPlacementCandidate = {
  id: string;
  kind: PlacementMode;
  anchorSpreadId: string | null;
  insertPosition: number;
  layoutId: "L01" | "L01b" | "L06" | "L07";
  frameId: string;
  score: number;
  reason: string;
  crop: { x: number; y: number; scale: number };
};

function dayDistance(left: string, right: string | null) {
  if (!right) return 3650;
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) / 86_400_000;
}

export function rankPhotoPlacements(photo: PlacementPhoto, spreads: PlacementSpread[]): PhotoPlacementCandidate[] {
  const eligible = spreads
    .filter((spread) => ["STORY", "GRID"].includes(spread.role))
    .map((spread) => {
      const days = dayDistance(photo.takenAt, spread.storyStartedAt);
      const sameDay = days < 1 ? 48 : days < 3 ? 30 : days < 14 ? 14 : 0;
      const role = spread.role === "STORY" ? 8 : 5;
      return { spread, score: sameDay + role };
    })
    .sort((a, b) => b.score - a.score || a.spread.position - b.spread.position);

  const result: PhotoPlacementCandidate[] = [];
  const existing = eligible.find(({ spread }) => !spread.edited && spread.frameCount === 3);
  if (existing) {
    const layoutId = photo.orientation === "portrait" ? "L06" : "L07";
    result.push({ id: `existing-${existing.spread.id}`, kind: "EXISTING_SPREAD", anchorSpreadId: existing.spread.id,
      insertPosition: existing.spread.position, layoutId, frameId: layoutId === "L06" ? "L06-c" : "L07-d",
      score: Math.round((existing.score + 40 + (photo.bestShotScore ?? 50) * 0.1) * 100) / 100,
      reason: dayDistance(photo.takenAt, existing.spread.storyStartedAt) < 1 ? "同じ日のページへ自然に追加" : "近いStoryのページへ追加", crop: photo.crop });
  }

  const adjacent = eligible[0];
  if (adjacent) {
    const layoutId = photo.orientation === "portrait" ? "L01b" : "L01";
    result.push({ id: `after-${adjacent.spread.id}`, kind: "INSERT_AFTER", anchorSpreadId: adjacent.spread.id,
      insertPosition: adjacent.spread.position + 1, layoutId, frameId: layoutId === "L01b" ? "L01b-hero" : "L01-hero",
      score: Math.round((adjacent.score + 20 + (photo.bestShotScore ?? 50) * 0.1) * 100) / 100,
      reason: adjacent.spread.edited ? "編集済みページを守り、その直後に新しいページを追加" : "同じStoryの直後に新しいページを追加", crop: photo.crop });
  }

  const lastPosition = spreads.reduce((max, spread) => Math.max(max, spread.position), -1);
  const fallbackLayoutId = photo.orientation === "portrait" ? "L01b" : "L01";
  result.push({
    id: "append-end",
    kind: "APPEND",
    anchorSpreadId: null,
    insertPosition: lastPosition + 1,
    layoutId: fallbackLayoutId,
    frameId: fallbackLayoutId === "L01b" ? "L01b-hero" : "L01-hero",
    score: Math.round(((photo.bestShotScore ?? 50) * 0.1 + 5) * 100) / 100,
    reason: "安全なStory anchorがないため最後に追加",
    crop: photo.crop,
  });
  return result.slice(0, 3);
}

export function placementFingerprint(albumId: string, draftVersionId: string, photoId: string, plan: Pick<PhotoPlacementCandidate, "kind" | "anchorSpreadId" | "layoutId">) {
  return createHash("sha256").update([albumId, draftVersionId, photoId, plan.kind, plan.anchorSpreadId ?? "", plan.layoutId].join("|")).digest("hex");
}

export function spreadHasManualEdits(spread: {
  userLayoutId: string | null;
  frames: Array<{ userPhotoId: string | null; userCrop: unknown }>;
  texts: Array<{ overrideMode?: string }>;
  decorations: Array<{ overrideMode?: string }>;
  elements: unknown[];
  backgrounds: Record<string, { backgroundId: string | null }>;
}) {
  return Boolean(
    spread.userLayoutId
    || spread.frames.some((frame) => frame.userPhotoId || frame.userCrop)
    || spread.texts.some((item) => item.overrideMode && item.overrideMode !== "inherit")
    || spread.decorations.some((item) => item.overrideMode && item.overrideMode !== "inherit")
    || spread.elements.length
    || Object.values(spread.backgrounds).some((item) => item.backgroundId),
  );
}
