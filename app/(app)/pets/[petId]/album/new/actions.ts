"use server";

import OpenAI from "openai";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPetAlbumDraft } from "@/app/(app)/dev/album-draft/actions";
import { createClient } from "@/lib/supabase/server";
import { buildDraftSavePayload, toPersistableSpread } from "@/lib/album-persistence/payload";
import { scopeAlbumPhotos, generateFallbackTitle, type AlbumCandidate } from "@/lib/album-selection";
import type { Json } from "@/lib/supabase/database.types";
import { loadCoverEditor } from "@/app/(app)/album-draft-service";
import { buildAlbumCompositionPlan } from "@/lib/album-draft/composition";
import { formatAlbumPeriodLabels } from "@/lib/album-cover-title";
import { recordAlbumAnalyticsEvent } from "@/lib/album-analytics-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateAlbumState = {
  error: string | null;
};

const PERIOD_OPTIONS = ["3months", "6months", "1year", "all"] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

function computePeriod(period: Period): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  if (period === "3months") from.setMonth(from.getMonth() - 3);
  else if (period === "6months") from.setMonth(from.getMonth() - 6);
  else if (period === "1year") from.setFullYear(from.getFullYear() - 1);
  else from.setFullYear(2000); // "all" — far past
  return { from, to };
}

function periodLabel(period: Period, from: Date): string {
  if (period === "3months") return "最近3か月";
  if (period === "6months") return "最近半年";
  if (period === "1year") return "最近1年";
  const y = from.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric" });
  return `${y}〜`;
}

export async function createAlbumDraft(petId: string, _prev: CreateAlbumState, formData: FormData): Promise<CreateAlbumState> {
  if (!UUID_PATTERN.test(petId)) return { error: "無効なリクエストです。" };

  const rawPeriod = formData.get("period");
  const period: Period = PERIOD_OPTIONS.includes(rawPeriod as Period) ? (rawPeriod as Period) : "3months";

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "認証エラーが発生しました。再度ログインしてください。" };

  const { data: pets, error: petsError } = await supabase.from("pets").select("id, name, birthday, adoption_date").eq("owner_user_id", user.id).order("created_at", { ascending: true });
  if (petsError || !pets) return { error: "ペット情報を取得できませんでした。" };
  const routePet = pets.find((item) => item.id === petId);
  if (!routePet) return { error: "ペット情報を取得できませんでした。" };

  const selection = String(formData.get("petSelection") ?? petId);
  const selectedPets = selection === "all" ? pets : pets.filter((item) => item.id === selection);
  if (selectedPets.length === 0) return { error: "アルバムに含めるペットを選択してください。" };
  const anchorPet = selection === "all" ? routePet : selectedPets[0];

  const { from: periodFrom, to: periodTo } = computePeriod(period);

  const photoResults = await Promise.all(
    selectedPets.map(async (selectedPet) => {
      const pageSize = 200;
      const petPhotos = [];
      for (let offset = 0; ; offset += pageSize) {
        const result = await supabase
          .from("photos")
          .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at, timeline_at, favorite, caption")
          .eq("pet_id", selectedPet.id)
          .gte("timeline_at", periodFrom.toISOString())
          .lte("timeline_at", periodTo.toISOString())
          .order("timeline_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (result.error) return { error: result.error, data: null };
        petPhotos.push(...(result.data ?? []));
        if (selectedPets.length === 1 || (result.data?.length ?? 0) < pageSize) {
          return { error: null, data: petPhotos };
        }
      }
    }),
  );
  if (photoResults.some((result) => result.error)) {
    return { error: "写真の取得中にエラーが発生しました。" };
  }
  const rawPhotos = photoResults.flatMap((result) => result.data ?? []);

  if (rawPhotos.length === 0) {
    return { error: "この期間に写真がありません。別の期間を選んでください。" };
  }

  const analysesResult = await supabase
    .from("photo_ai_analyses")
    .select("photo_id, activity, scene, emotion, tags")
    .in(
      "photo_id",
      rawPhotos.map((photo) => photo.id),
    )
    .eq("status", "completed");
  const analysisMap = new Map((analysesResult.data ?? []).map((analysis) => [analysis.photo_id, analysis]));

  const candidates: AlbumCandidate[] = rawPhotos.map((photo) => {
    const ai = analysisMap.get(photo.id);
    return {
      ...photo,
      timeline_at: photo.timeline_at ?? photo.created_at,
      activity: ai?.activity ?? null,
      scene: ai?.scene ?? null,
      emotion: ai?.emotion ?? null,
      tags: ai?.tags ?? null,
    };
  });

  const scopedCandidates = scopeAlbumPhotos(
    candidates,
    selectedPets.map((item) => item.id),
    periodFrom,
    periodTo,
  );
  const petsWithPhotos = new Set(scopedCandidates.map((photo) => photo.pet_id));
  const draftRuns = await Promise.all(
    selectedPets
      .filter((selectedPet) => petsWithPhotos.has(selectedPet.id))
      .map((selectedPet) =>
        buildPetAlbumDraft(
          selectedPet.id,
          {
            type: "custom",
            start: periodFrom.toISOString(),
            end: periodTo.toISOString(),
          },
          { dateRange: { start: periodFrom.toISOString(), end: periodTo.toISOString() } },
        ),
      ),
  );
  const failedDraft = draftRuns.find((run) => !run.ok || !run.draft);
  if (failedDraft) {
    return { error: failedDraft.message ?? "アルバムのレイアウト生成に失敗しました。" };
  }
  const persistableSpreads = draftRuns.flatMap((run) => run.spreads.map(toPersistableSpread));
  const layoutPhotoIds = [...new Set(persistableSpreads.flatMap((spread) => spread.assignments.map((assignment) => assignment.photoId)))];
  const candidateById = new Map(scopedCandidates.map((photo) => [photo.id, photo]));
  const selected = layoutPhotoIds.map((photoId) => candidateById.get(photoId)).filter((photo): photo is AlbumCandidate => Boolean(photo));
  if (selectedPets.length > 1) selected.sort((left, right) => left.timeline_at.localeCompare(right.timeline_at));

  if (selected.length === 0) {
    return { error: "アルバムに追加できる写真が見つかりませんでした。" };
  }
  const coverPhotoId = persistableSpreads.flatMap((spread) => spread.assignments).find((assignment) => assignment.role === "hero")?.photoId ?? selected[0].id;

  // Generate title
  const label = periodLabel(period, periodFrom);
  const petNames = selectedPets.map((item) => item.name);
  const displayPetName = selectedPets.length > 1 ? "すべてのペット" : petNames[0];
  let title = generateFallbackTitle(displayPetName, periodFrom, periodTo);

  if (process.env.OPENAI_API_KEY) {
    try {
      const topActivities = [...new Set(selected.map((p) => p.activity).filter(Boolean))].slice(0, 3) as string[];
      const topScenes = [...new Set(selected.map((p) => p.scene).filter(Boolean))].slice(0, 3) as string[];
      const topTags = [...new Set(selected.flatMap((p) => p.tags ?? []))].slice(0, 5);

      const openai = new OpenAI();
      const resp = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          store: false,
          messages: [
            {
              role: "system",
              content: "ペットのフォトアルバムの短いタイトルを日本語で1つだけ出力してください。感情的で温かみのある表現を使い、30文字以内にしてください。タイトルのみ出力し、説明や記号は不要です。",
            },
            {
              role: "user",
              content: `ペット名: ${petNames.join("・")}, 期間: ${label}, 活動: ${topActivities.join("・")}, 場所: ${topScenes.join("・")}, タグ: ${topTags.join("・")}`,
            },
          ],
          max_tokens: 40,
          temperature: 0.7,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      const candidate = resp.choices[0]?.message?.content?.trim();
      if (candidate && candidate.length > 0 && candidate.length <= 50) {
        title = candidate;
      }
    } catch {
      // rule-based fallback already set
    }
  }

  // Insert album
  const { data: album, error: albumError } = await supabase
    .from("albums")
    .insert({
      owner_user_id: user.id,
      pet_id: anchorPet.id,
      title,
      status: "draft",
      period_from: periodFrom.toISOString(),
      period_to: periodTo.toISOString(),
    })
    .select("id")
    .single();

  if (albumError || !album) return { error: "アルバムの作成に失敗しました。" };

  const otherPets = selectedPets.filter((item) => item.id !== anchorPet.id);
  if (otherPets.length > 0) {
    const albumPetsClient = supabase as unknown as SupabaseClient;
    const { error: petLinksError } = await albumPetsClient.from("album_pets").insert(otherPets.map((item) => ({ album_id: album.id, pet_id: item.id })));
    if (petLinksError) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムに含めるペットの登録に失敗しました。" };
    }
  }

  // Insert album_photos
  const albumPhotosData = selected.map((photo, index) => ({
    album_id: album.id,
    photo_id: photo.id,
    position: index,
    selected_by: "ai" as const,
  }));

  const { error: photosInsertError } = await supabase.from("album_photos").insert(albumPhotosData);

  if (photosInsertError) {
    // Cleanup orphaned album
    await supabase.from("albums").delete().eq("id", album.id);
    return { error: "写真の登録に失敗しました。もう一度お試しください。" };
  }

  const { error: coverError } = await supabase.from("albums").update({ cover_photo_id: coverPhotoId }).eq("id", album.id).eq("owner_user_id", user.id);
  if (coverError) {
    await supabase.from("albums").delete().eq("id", album.id);
    return { error: "アルバムの表紙を登録できませんでした。もう一度お試しください。" };
  }

  if (selectedPets.length === 1) {
    const selectedPet = selectedPets[0];
    const composition = buildAlbumCompositionPlan(
      draftRuns.flatMap((run) => run.spreads),
      {
        title,
        petName: selectedPet.name,
        period: formatAlbumPeriodLabels(periodFrom.toISOString(), periodTo.toISOString()).coverDateLabel,
        periodStart: periodFrom.toISOString(),
        periodEnd: periodTo.toISOString(),
        events: [...(selectedPet.birthday ? [{ kind: "birthday" as const, date: selectedPet.birthday.slice(0, 10) }] : []), ...(selectedPet.adoption_date ? [{ kind: "adoption" as const, date: selectedPet.adoption_date.slice(0, 10) }] : [])],
      },
    );
    const savedDraft = await supabase.rpc("save_album_draft_version", {
      p_album_id: album.id,
      p_payload: buildDraftSavePayload(persistableSpreads, [], composition, {
        generation_photo_ids: scopedCandidates.map((photo) => photo.id).sort(),
      }) as unknown as Json,
    });
    if (savedDraft.error) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムの初稿を保存できませんでした。もう一度お試しください。" };
    }
    const savedCover = await loadCoverEditor(album.id, {
      aiPhotoId: coverPhotoId,
      aiTitle: title,
      aiSubtitle: label,
    });
    if (!savedCover.ok) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムの表紙を準備できませんでした。もう一度お試しください。" };
    }
  }

  const { data: activeVersion } = await supabase.from("album_draft_versions").select("id").eq("album_id", album.id).eq("is_active", true).maybeSingle();
  await recordAlbumAnalyticsEvent({
    supabase,
    userId: user.id,
    albumId: album.id,
    draftVersionId: activeVersion?.id ?? null,
    eventType: "album_generated",
    eventKey: activeVersion?.id ?? album.id,
    eventData: { photo_count: selected.length, pet_count: selectedPets.length, spread_count: persistableSpreads.length },
  });

  redirect(`/pets/${anchorPet.id}/album/${album.id}?view=complete`);
}
