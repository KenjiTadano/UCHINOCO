import { buildSceneGroups } from "../photo-grouping/group.ts";
import { selectBestShot } from "../best-shot/select.ts";
import { visualPairKey } from "../best-shot/score.ts";
import type { EditorialPhoto } from "../album-draft/editorial.ts";
import type { storedGenerationInputs, GenerationSourcePhoto } from "./stored-inputs.ts";

export function rankStoredAlbumInputs(inputs: ReturnType<typeof storedGenerationInputs>, sources: GenerationSourcePhoto[], petIds: string[]): EditorialPhoto[] {
  const sourceById = new Map(sources.map((photo) => [photo.id, photo]));
  const intelligence = new Map(inputs.grouping.map((photo) => [photo.photoId, photo.intelligence]));
  return petIds.flatMap((petId) =>
    buildSceneGroups(inputs.grouping.filter((photo) => sourceById.get(photo.photoId)?.pet_id === petId)).flatMap((group) => {
      const selection = selectBestShot(
        {
          id: group.id,
          scene: group.scene,
          activity: group.activity,
          tags: group.tags,
          groupConfidence: group.groupConfidence,
          warnings: group.warnings,
          visualSimilarity: Object.fromEntries(group.pairs.map((pair) => [visualPairKey(pair.photoA, pair.photoB), pair.visualScore])),
          geometrySimilarity: Object.fromEntries(group.pairs.map((pair) => [visualPairKey(pair.photoA, pair.photoB), pair.geometryScore])),
        },
        group.members.map((member) => ({ photoId: member.photoId, relativeUniqueness: member.relativeUniqueness, intelligence: intelligence.get(member.photoId) ?? null, sharpness: inputs.sharpness.get(member.photoId) ?? 62 })),
      );
      return selection.ranking.map((candidate) => ({ photoId: candidate.photoId, petId, groupId: group.id, timeline: group.startedAt, scene: group.scene, activity: group.activity, candidate, confidence: selection.confidence }));
    }),
  );
}
