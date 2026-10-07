"use server";

import { groupPetPhotos } from "../photo-grouping/actions";
import { bestShotConfigFingerprint } from "@/lib/best-shot/config";
import { bestShotCacheKey, getBestShotCache, setBestShotCache } from "@/lib/best-shot/cache";
import { selectBestShot } from "@/lib/best-shot/select";
import { visualPairKey } from "@/lib/best-shot/score";
import type { BestShotGroupInput, BestShotPhoto, BestShotResult } from "@/lib/best-shot/types";
import { getPhotoIntelligenceCache } from "@/lib/photo-intelligence/cache";
import { intelligenceMemoryKey } from "@/lib/photo-analysis/keys";
import { createClient } from "@/lib/supabase/server";
import type { GroupingGroupView } from "../photo-grouping/actions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BestShotGroupView = {
  group: GroupingGroupView;
  selection: BestShotResult;
};

export type BestShotRunResult = {
  ok: boolean;
  message: string | null;
  petId: string | null;
  groups: BestShotGroupView[];
};

function configFingerprint() {
  return bestShotConfigFingerprint();
}

function emptyRun(message: string): BestShotRunResult {
  return { ok: false, message, petId: null, groups: [] };
}

/** Rank each scene group. Reuses Task052 groups and does not write a database row. */
export async function selectPetBestShots(petId: string, options?: { storedOnly?: boolean; allowLargeImageDegrade?: boolean; dateRange?: { start: string; end: string }; allowedPhotoIds?: string[] }): Promise<BestShotRunResult> {
  if (!UUID_PATTERN.test(petId)) return emptyRun("不正なIDです。");
  const grouped = await groupPetPhotos(petId, options);
  if (!grouped.ok) return emptyRun(grouped.message ?? "グループ化に失敗しました。");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyRun("ログインが必要です。");

  const { data: rows } = await supabase.from("photos").select("id, storage_path, updated_at, content_hash").eq("pet_id", petId).eq("uploader_user_id", user.id).limit(40);

  const byId = new Map<string, { sharpness: number; intelligence: BestShotPhoto["intelligence"] }>();
  for (const row of rows ?? []) {
    const hit = getPhotoIntelligenceCache(intelligenceMemoryKey(row));
    if (!hit) continue;
    byId.set(row.id, {
      sharpness: hit.parts.sharpness,
      intelligence: {
        overallScore: hit.intelligence.overallScore,
        expression: hit.intelligence.expression,
        petVisibility: hit.intelligence.petVisibility,
        technicalQuality: hit.intelligence.technicalQuality,
        composition: hit.intelligence.composition,
        memoryValue: hit.intelligence.memoryValue,
        confidence: hit.intelligence.confidence,
        tags: hit.intelligence.tags,
        warnings: hit.intelligence.warnings,
        status: hit.intelligence.status,
      },
    });
  }

  const fingerprint = configFingerprint();
  const groups = grouped.groups.map((group) => {
    const key = bestShotCacheKey(group.id, group.photoIds, fingerprint);
    const cached = getBestShotCache(key);
    if (cached) return { group, selection: cached };
    const visualSimilarity: Record<string, number> = {};
    const geometrySimilarity: Record<string, number> = {};
    for (const pair of group.pairs) {
      const key = visualPairKey(pair.photoA, pair.photoB);
      visualSimilarity[key] = pair.visualScore;
      geometrySimilarity[key] = pair.geometryScore;
    }
    const input: BestShotGroupInput = {
      id: group.id,
      scene: group.scene,
      activity: group.activity,
      tags: group.tags,
      groupConfidence: group.groupConfidence,
      warnings: group.warnings,
      visualSimilarity,
      geometrySimilarity,
    };
    const photos: BestShotPhoto[] = group.members.map((member) => {
      const known = byId.get(member.photoId);
      return {
        photoId: member.photoId,
        intelligence: known?.intelligence ?? null,
        relativeUniqueness: member.relativeUniqueness,
        sharpness: known?.sharpness ?? 62,
      };
    });
    const selection = selectBestShot(input, photos);
    setBestShotCache(key, selection);
    return { group, selection };
  });

  return { ok: true, message: null, petId, groups };
}
