import { PHOTO_GROUPING_CONFIG, PHOTO_GROUPING_VERSION } from "./config.ts";
import { cachedPhotoPair } from "./pair.ts";
import { sceneAndActivity } from "./semantic.ts";
import { capturedMs } from "./time.ts";
import type {
  GroupingPhoto,
  PhotoPairSimilarity,
  PhotoSceneGroup,
  SceneGroupMember,
} from "./types.ts";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function groupKey(photoIds: string[]) {
  let hash = 2166136261;
  for (const id of [...photoIds].sort()) {
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 124;
  }
  return `g${(hash >>> 0).toString(16)}`;
}

function allowsJoin(pair: PhotoPairSimilarity) {
  if (pair.blocks.length > 0) return false;
  if (pair.overall >= PHOTO_GROUPING_CONFIG.join) return true;
  const cfg = PHOTO_GROUPING_CONFIG;
  if (pair.overall < cfg.probable) return false;
  const strict =
    pair.visualScore >= cfg.probableMinVisual &&
    pair.semanticScore >= cfg.probableMinSemantic &&
    pair.timeScore >= cfg.probableMinTime;
  if (strict) return true;
  return (
    pair.timeScore >= cfg.movedMinTime &&
    pair.backgroundScore >= cfg.movedMinBackground &&
    pair.semanticScore >= cfg.movedMinSemantic &&
    pair.visualScore >= cfg.movedMinVisual
  );
}

function visualMedoid(members: GroupingPhoto[], version: string) {
  if (members.length === 1) return members[0];
  let best = members[0];
  let bestScore = -1;
  for (const candidate of members) {
    const others = members.filter((member) => member.photoId !== candidate.photoId);
    const mean =
      others.reduce(
        (sum, member) => sum + cachedPhotoPair(candidate, member, version).visualScore,
        0,
      ) / others.length;
    if (mean > bestScore) {
      best = candidate;
      bestScore = mean;
    }
  }
  return best;
}

function canAttach(photo: GroupingPhoto, members: GroupingPhoto[], version: string) {
  const anchor = visualMedoid(members, version);
  const toAnchor = cachedPhotoPair(photo, anchor, version);
  if (!allowsJoin(toAnchor)) return false;
  for (const member of members) {
    const pair = cachedPhotoPair(photo, member, version);
    if (pair.blocks.length > 0) return false;
    if (pair.overall < PHOTO_GROUPING_CONFIG.minMember) return false;
  }
  return true;
}

function displayRepresentative(members: GroupingPhoto[]) {
  return [...members].sort((a, b) => {
    const scoreA = a.intelligence?.overallScore ?? -1;
    const scoreB = b.intelligence?.overallScore ?? -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.photoId.localeCompare(b.photoId);
  })[0];
}

function relativeUniqueness(photo: GroupingPhoto, members: GroupingPhoto[], version: string) {
  const others = members.filter((member) => member.photoId !== photo.photoId);
  if (others.length === 0) return 100;
  const meanDistance =
    others.reduce((sum, member) => {
      const pair = cachedPhotoPair(photo, member, version);
      return sum + (100 - pair.visualScore);
    }, 0) / others.length;
  return Math.round(Math.min(100, Math.max(0, meanDistance * 1.6)));
}

function majorityTag(members: GroupingPhoto[], vocabulary: string[]) {
  const counts = new Map<string, number>();
  for (const member of members) {
    const hit = member.intelligence?.tags.find((tag) => vocabulary.includes(tag));
    if (!hit) continue;
    counts.set(hit, (counts.get(hit) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [tag, count] of counts) {
    if (count > bestCount) {
      best = tag;
      bestCount = count;
    }
  }
  return bestCount >= Math.ceil(members.length / 2) ? best : undefined;
}

function sharedTags(members: GroupingPhoto[]) {
  const counts = new Map<string, number>();
  for (const member of members) {
    for (const tag of new Set(member.intelligence?.tags ?? [])) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const need = members.length === 1 ? 1 : Math.ceil(members.length / 2);
  return [...counts.entries()]
    .filter(([, count]) => count >= need)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([tag]) => tag);
}

function isBurst(members: GroupingPhoto[], version: string) {
  if (members.length < 2) return false;
  const ordered = [...members].sort((a, b) => capturedMs(a.capturedAt) - capturedMs(b.capturedAt));
  for (let i = 1; i < ordered.length; i++) {
    const gap = capturedMs(ordered[i].capturedAt) - capturedMs(ordered[i - 1].capturedAt);
    const visual = cachedPhotoPair(ordered[i - 1], ordered[i], version).visualScore;
    if (gap > PHOTO_GROUPING_CONFIG.burstMaxGapMs || visual < PHOTO_GROUPING_CONFIG.burstMinVisual) {
      return false;
    }
  }
  return true;
}

function ambiguousAgainst(photo: GroupingPhoto, previous: GroupingPhoto[], version: string) {
  if (previous.length === 0) return false;
  const anchor = visualMedoid(previous, version);
  const pair = cachedPhotoPair(photo, anchor, version);
  if (pair.blocks.length > 0) return false;
  return (
    pair.overall >= PHOTO_GROUPING_CONFIG.ambiguousLow &&
    pair.overall < PHOTO_GROUPING_CONFIG.join &&
    !allowsJoin(pair)
  );
}

function toGroup(
  members: GroupingPhoto[],
  version: string,
  ambiguous: boolean,
  boundary?: PhotoPairSimilarity,
  blocking?: PhotoPairSimilarity,
): PhotoSceneGroup {
  const ordered = [...members].sort(
    (a, b) => capturedMs(a.capturedAt) - capturedMs(b.capturedAt) || a.photoId.localeCompare(b.photoId),
  );
  const pairs: PhotoPairSimilarity[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      pairs.push(cachedPhotoPair(ordered[i], ordered[j], version));
    }
  }
  const overalls = pairs.map((pair) => pair.overall);
  const mean = overalls.length ? overalls.reduce((sum, value) => sum + value, 0) / overalls.length : 100;
  const min = overalls.length ? Math.min(...overalls) : 100;
  const confidence =
    ordered.length === 1 ? 1 : Math.round(clamp01(mean / 100 * 0.7 + min / 100 * 0.3) * 100) / 100;
  const representative = displayRepresentative(ordered);
  const tags = sharedTags(ordered);
  const labels = sceneAndActivity(tags);
  const burst = isBurst(ordered, version);
  const warnings = ambiguous ? ["AMBIGUOUS_GROUP"] : [];
  const scene = labels.scene ?? majorityTag(ordered, ["home", "outdoors", "travel", "cafe", "park"]);
  const activity =
    labels.activity ??
    majorityTag(ordered, ["sleeping", "playing", "eating", "looking_camera", "cuddling", "walking"]);

  let reason = "ほかの写真と同じ場面とは判断しませんでした。";
  if (ordered.length > 1 && burst) {
    reason = "数秒以内の連写で、構図も見た目も近い写真です。";
  } else if (ordered.length > 1) {
    reason = "同じ時間帯で、見た目と場面のタグが揃った写真です。";
  } else if (ambiguous) {
    reason = "近い候補はありましたが、確信が足りないので分けました。";
  }

  const groupMembers: SceneGroupMember[] = ordered.map((member) => ({
    photoId: member.photoId,
    capturedAt: member.capturedAt,
    overallScore: member.intelligence?.overallScore ?? null,
    relativeUniqueness: relativeUniqueness(member, ordered, version),
    representative: member.photoId === representative.photoId,
  }));

  return {
    id: groupKey(ordered.map((member) => member.photoId)),
    photoIds: ordered.map((member) => member.photoId),
    representativePhotoId: representative.photoId,
    startedAt: ordered[0].capturedAt,
    endedAt: ordered[ordered.length - 1].capturedAt,
    scene,
    activity,
    similarityScore: ordered.length === 1 ? 100 : Math.round(mean),
    groupConfidence: confidence,
    tags,
    reason,
    analysisVersion: version,
    burst,
    warnings,
    members: groupMembers,
    pairs,
    boundaryPair: boundary,
    blockingPair: blocking && blocking !== boundary ? blocking : undefined,
  };
}

/**
 * Time-ordered grouping.
 * A photo joins only when it matches the visual medoid and every current member.
 * That stops a chain of near neighbors from swallowing a different scene.
 */
export function buildSceneGroups(
  photos: GroupingPhoto[],
  version = PHOTO_GROUPING_VERSION,
): PhotoSceneGroup[] {
  const sorted = [...photos].sort(
    (a, b) => capturedMs(a.capturedAt) - capturedMs(b.capturedAt) || a.photoId.localeCompare(b.photoId),
  );
  const clusters: Array<{
    members: GroupingPhoto[];
    ambiguous: boolean;
    boundary?: PhotoPairSimilarity;
    blocking?: PhotoPairSimilarity;
  }> = [];
  for (const photo of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current || !canAttach(photo, current.members, version)) {
      const previous = current?.members[current.members.length - 1];
      const boundary = previous ? cachedPhotoPair(previous, photo, version) : undefined;
      const anchor = current ? visualMedoid(current.members, version) : undefined;
      const blocking =
        anchor && previous && anchor.photoId !== previous.photoId
          ? cachedPhotoPair(anchor, photo, version)
          : undefined;
      const ambiguous = boundary ? ambiguousAgainst(photo, current?.members ?? [], version) : false;
      clusters.push({ members: [photo], ambiguous, boundary, blocking });
    } else {
      current.members.push(photo);
    }
  }
  return clusters.map((cluster) =>
    toGroup(cluster.members, version, cluster.ambiguous, cluster.boundary, cluster.blocking),
  );
}
