"use server";

import OpenAI from "openai";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  selectAlbumPhotos,
  generateFallbackTitle,
  type AlbumCandidate,
} from "@/lib/album-selection";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function createAlbumDraft(
  petId: string,
  _prev: CreateAlbumState,
  formData: FormData,
): Promise<CreateAlbumState> {
  if (!UUID_PATTERN.test(petId)) return { error: "無効なリクエストです。" };

  const rawPeriod = formData.get("period");
  const period: Period = PERIOD_OPTIONS.includes(rawPeriod as Period)
    ? (rawPeriod as Period)
    : "3months";

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "認証エラーが発生しました。再度ログインしてください。" };

  // Pet ownership
  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (petError || !pet) return { error: "ペット情報を取得できませんでした。" };

  const { from: periodFrom, to: periodTo } = computePeriod(period);

  // Fetch photo candidates (primary scope) with AI analysis
  const [photosResult, analysesResult] = await Promise.all([
    supabase
      .from("photos")
      .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at, timeline_at, favorite, caption")
      .eq("pet_id", pet.id)
      .eq("uploader_user_id", user.id)
      .gte("timeline_at", periodFrom.toISOString())
      .lte("timeline_at", periodTo.toISOString())
      .order("timeline_at", { ascending: false })
      .limit(200),
    supabase
      .from("photo_ai_analyses")
      .select("photo_id, activity, scene, emotion, tags")
      .eq("status", "completed"),
  ]);

  if (photosResult.error) return { error: "写真の取得中にエラーが発生しました。" };
  const rawPhotos = photosResult.data ?? [];

  if (rawPhotos.length === 0) {
    return { error: "この期間に写真がありません。別の期間を選んでください。" };
  }

  const analysisMap = new Map(
    (analysesResult.data ?? []).map((a) => [a.photo_id, a]),
  );

  const candidates: AlbumCandidate[] = rawPhotos.map((p) => {
    const ai = analysisMap.get(p.id);
    return {
      ...p,
      activity: ai?.activity ?? null,
      scene: ai?.scene ?? null,
      emotion: ai?.emotion ?? null,
      tags: ai?.tags ?? null,
    };
  });

  const selected = selectAlbumPhotos(candidates);

  if (selected.length === 0) {
    return { error: "アルバムに追加できる写真が見つかりませんでした。" };
  }

  // Generate title
  const label = periodLabel(period, periodFrom);
  let title = generateFallbackTitle(pet.name, periodFrom, periodTo);

  if (process.env.OPENAI_API_KEY) {
    try {
      const topActivities = [
        ...new Set(selected.map((p) => p.activity).filter(Boolean)),
      ].slice(0, 3) as string[];
      const topScenes = [
        ...new Set(selected.map((p) => p.scene).filter(Boolean)),
      ].slice(0, 3) as string[];
      const topTags = [
        ...new Set(selected.flatMap((p) => p.tags ?? [])),
      ].slice(0, 5);

      const openai = new OpenAI();
      const resp = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          store: false,
          messages: [
            {
              role: "system",
              content:
                "ペットのフォトアルバムの短いタイトルを日本語で1つだけ出力してください。感情的で温かみのある表現を使い、30文字以内にしてください。タイトルのみ出力し、説明や記号は不要です。",
            },
            {
              role: "user",
              content: `ペット名: ${pet.name}, 期間: ${label}, 活動: ${topActivities.join("・")}, 場所: ${topScenes.join("・")}, タグ: ${topTags.join("・")}`,
            },
          ],
          max_tokens: 40,
          temperature: 0.7,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 8000),
        ),
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
      pet_id: pet.id,
      title,
      status: "draft",
      period_from: periodFrom.toISOString(),
      period_to: periodTo.toISOString(),
      cover_photo_id: selected[0].id,
    })
    .select("id")
    .single();

  if (albumError || !album) return { error: "アルバムの作成に失敗しました。" };

  // Insert album_photos
  const albumPhotosData = selected.map((photo, index) => ({
    album_id: album.id,
    photo_id: photo.id,
    position: index,
    selected_by: "ai" as const,
  }));

  const { error: photosInsertError } = await supabase
    .from("album_photos")
    .insert(albumPhotosData);

  if (photosInsertError) {
    // Cleanup orphaned album
    await supabase.from("albums").delete().eq("id", album.id);
    return { error: "写真の登録に失敗しました。もう一度お試しください。" };
  }

  redirect(`/pets/${petId}/album/${album.id}`);
}
