"use server";

import { createClient } from "@/lib/supabase/server";
import { analyzePhotoIntelligence } from "../photo-intelligence/actions";
import { analyzeSmartCropPhoto } from "../smart-crop/actions";
import {
  descriptorCacheKey,
  getDescriptorCache,
  setDescriptorCache,
} from "@/lib/photo-grouping/descriptor-cache";
import { PHOTO_GROUPING_VERSION } from "@/lib/photo-grouping/config";
import { buildSceneGroups } from "@/lib/photo-grouping/group";
import type { GroupingPhoto, PhotoSceneGroup } from "@/lib/photo-grouping/types";
import { descriptorFromJpeg } from "@/lib/photo-grouping/visual";
import { getPhotoIntelligenceCache } from "@/lib/photo-intelligence/cache";
import { PHOTO_INTELLIGENCE_SEMANTIC, SUBJECT_GEOMETRY, SUBJECT_GEOMETRY_VERSION } from "@/lib/photo-analysis/constants";
import { sourceFingerprint } from "@/lib/photo-analysis/fingerprint";
import { geometryMemoryKey, intelligenceMemoryKey } from "@/lib/photo-analysis/keys";
import { noteAnalysisTrace } from "@/lib/photo-analysis/trace";
import { PHOTO_INTELLIGENCE_VERSION } from "@/lib/photo-intelligence/config";
import { getSmartCropCache } from "@/lib/smart-crop/cache";
import type { SmartCropPhotoAnalysis } from "@/lib/smart-crop/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GroupingPrepareResult = {
  ok: boolean;
  message: string | null;
  photoId: string | null;
  intelligenceCached: boolean;
  visualReady: boolean;
};

export type GroupingMemberView = PhotoSceneGroup["members"][number] & {
  thumbUrl: string | null;
};

export type GroupingGroupView = Omit<PhotoSceneGroup, "members"> & {
  members: GroupingMemberView[];
};

export type GroupingRunResult = {
  ok: boolean;
  message: string | null;
  petId: string | null;
  photoCount: number;
  groups: GroupingGroupView[];
};

function emptyPrepare(message: string): GroupingPrepareResult {
  return {
    ok: false,
    message,
    photoId: null,
    intelligenceCached: false,
    visualReady: false,
  };
}

async function ownedPhoto(petId: string, photoId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, photo: null };
  const { data: photo } = await supabase
    .from("photos")
    .select("id, pet_id, uploader_user_id, storage_path, thumbnail_path, taken_at, created_at, updated_at, content_hash")
    .eq("id", photoId)
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .maybeSingle();
  if (!photo || photo.uploader_user_id !== user.id) return { supabase, user, photo: null };
  return { supabase, user, photo };
}

/** Load keeper tags, crop geometry, and a visual descriptor. Does not write a database row. */
export async function prepareGroupingPhoto(
  petId: string,
  photoId: string,
): Promise<GroupingPrepareResult> {
  if (!UUID_PATTERN.test(petId) || !UUID_PATTERN.test(photoId)) {
    return emptyPrepare("不正なIDです。");
  }
  const { supabase, user, photo } = await ownedPhoto(petId, photoId);
  if (!user) return emptyPrepare("ログインが必要です。");
  if (!photo) return emptyPrepare("写真を読み込めませんでした。");

  const intelligenceKey = intelligenceMemoryKey(photo);
  const fingerprint = sourceFingerprint(photo);
  const cachedIntelligence = getPhotoIntelligenceCache(intelligenceKey);
  if (cachedIntelligence) {
    noteAnalysisTrace({
      photoId: photo.id,
      analysisType: PHOTO_INTELLIGENCE_SEMANTIC,
      version: PHOTO_INTELLIGENCE_VERSION,
      fingerprint,
      cacheSource: "memory",
      status: cachedIntelligence.intelligence.warnings.includes("VISION_ANALYSIS_FAILED") ? "fallback" : "success",
      visionCalled: false,
      createdAt: null,
    });
  } else {
    const analyzed = await analyzePhotoIntelligence(petId, photoId, false);
    if (!analyzed.ok) return emptyPrepare(analyzed.message ?? "撮れ高評価に失敗しました。");
  }

  const cropKey = geometryMemoryKey(photo);
  let analysis: SmartCropPhotoAnalysis | null = getSmartCropCache(cropKey);
  if (analysis) {
    noteAnalysisTrace({
      photoId: photo.id,
      analysisType: SUBJECT_GEOMETRY,
      version: SUBJECT_GEOMETRY_VERSION,
      fingerprint,
      cacheSource: "memory",
      status: "success",
      visionCalled: false,
      createdAt: null,
    });
  } else {
    const crop = await analyzeSmartCropPhoto(petId, photoId);
    analysis = crop.analysis;
  }

  const descriptorKey = descriptorCacheKey(photo.id, photo.storage_path, PHOTO_GROUPING_VERSION);
  let cachedDescriptor = getDescriptorCache(descriptorKey);
  if (cachedDescriptor === undefined) {
    const { data: blob, error } = await supabase.storage.from("pet-photos").download(photo.storage_path);
    if (error || !blob) return emptyPrepare("写真をダウンロードできませんでした。");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const boxes = (analysis?.pets ?? []).map((pet) => pet.bbox);
    const descriptor =
      blob.type === "image/jpeg" || bytes[0] === 0xff ? descriptorFromJpeg(bytes, boxes) : null;
    setDescriptorCache(descriptorKey, descriptor);
    cachedDescriptor = descriptor;
  }

  return {
    ok: true,
    message: null,
    photoId: photo.id,
    intelligenceCached: Boolean(cachedIntelligence),
    visualReady: cachedDescriptor !== null,
  };
}

/** Group the pet's recent photos. Caller should prepare them first so this stays fast. */
export async function groupPetPhotos(petId: string): Promise<GroupingRunResult> {
  if (!UUID_PATTERN.test(petId)) {
    return { ok: false, message: "不正なIDです。", petId: null, photoCount: 0, groups: [] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "ログインが必要です。", petId: null, photoCount: 0, groups: [] };
  }

  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, pet_id, uploader_user_id, storage_path, thumbnail_path, taken_at, created_at, updated_at, content_hash")
    .eq("pet_id", petId)
    .eq("uploader_user_id", user.id)
    .order("taken_at", { ascending: true })
    .limit(40);
  if (error || !rows) {
    return { ok: false, message: "写真を読み込めませんでした。", petId, photoCount: 0, groups: [] };
  }

  const photos: GroupingPhoto[] = [];
  for (const row of rows) {
    const descriptorHit = getDescriptorCache(
      descriptorCacheKey(row.id, row.storage_path, PHOTO_GROUPING_VERSION),
    );
    const intelligenceHit = getPhotoIntelligenceCache(intelligenceMemoryKey(row));
    if (descriptorHit === undefined || !intelligenceHit) {
      await prepareGroupingPhoto(petId, row.id);
    }
    const intelligence = getPhotoIntelligenceCache(intelligenceMemoryKey(row));
    const analysis = getSmartCropCache(geometryMemoryKey(row));
    const visual = getDescriptorCache(
      descriptorCacheKey(row.id, row.storage_path, PHOTO_GROUPING_VERSION),
    );
    photos.push({
      photoId: row.id,
      capturedAt: row.taken_at ?? row.created_at,
      width: analysis?.width ?? intelligence?.signals.width ?? 0,
      height: analysis?.height ?? intelligence?.signals.height ?? 0,
      intelligence: intelligence?.intelligence ?? null,
      analysis,
      visual: visual ?? null,
    });
  }

  const thumbPaths = rows.flatMap((row) => (row.thumbnail_path ? [row.thumbnail_path] : []));
  const originalPaths = rows.flatMap((row) => (row.thumbnail_path ? [] : [row.storage_path]));
  const [thumbs, originals] = await Promise.all([
    thumbPaths.length
      ? supabase.storage.from("pet-photo-thumbnails").createSignedUrls(thumbPaths, 3600)
      : Promise.resolve({ data: [] }),
    originalPaths.length
      ? supabase.storage.from("pet-photos").createSignedUrls(originalPaths, 3600)
      : Promise.resolve({ data: [] }),
  ]);
  const urlByPath = new Map<string, string>();
  for (const item of [...(thumbs.data ?? []), ...(originals.data ?? [])]) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  }
  const thumbById = new Map(
    rows.map((row) => [row.id, urlByPath.get(row.thumbnail_path ?? row.storage_path) ?? null]),
  );

  const groups = buildSceneGroups(photos).map((group) => ({
    ...group,
    members: group.members.map((member) => ({
      ...member,
      thumbUrl: thumbById.get(member.photoId) ?? null,
    })),
  }));

  return { ok: true, message: null, petId, photoCount: photos.length, groups };
}
