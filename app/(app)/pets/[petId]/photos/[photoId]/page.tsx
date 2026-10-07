import { isTerminalAnalysisError } from "@/lib/photo-analysis-policy";
import type { SupabaseClient } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatTokyoDateTime, formatTokyoDateTimeInput, photoTimestamp } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";
import { createPhotoPreviewUrls } from "@/lib/photo-image-delivery";
import { AiAnalysisButton } from "./ai-analysis-button";
import { PhotoDeleteControl } from "./photo-delete-control";
import { PhotoEditControls } from "./photo-edit-controls";
import { PhotoPetControls } from "./photo-pet-controls";
import { getPhotoPetOptions } from "@/lib/photo-pets";
import { recordProductAnalyticsEvent } from "@/lib/product-analytics-server";

export const maxDuration = 60;

type PhotoDetailPageProps = {
  params: Promise<{ petId: string; photoId: string }>;
  searchParams: Promise<{ source?: string }>;
};

type PhotoAiAnalysis = {
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  error_code: string | null;
  description: string | null;
  tags: string[];
  activity: string | null;
  scene: string | null;
  emotion: string | null;
  contains_pet: boolean | null;
  model: string | null;
  prompt_version: string | null;
  analyzed_at: string | null;
};

export default async function PhotoDetailPage({ params, searchParams }: PhotoDetailPageProps) {
  const { petId, photoId } = await params;
  const { source } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const [petResult, photoResult] = await Promise.all([
    supabase.from("pets").select("id, name, owner_user_id, avatar_url").eq("id", petId).maybeSingle(),
    supabase.from("photos").select("id, pet_id, uploader_user_id, storage_path, thumbnail_path, taken_at, created_at, caption, favorite").eq("id", photoId).eq("pet_id", petId).maybeSingle(),
  ]);
  const { data: pet, error: petError } = petResult;
  const { data: photo, error: photoError } = photoResult;

  if (petError || photoError || !pet || !photo || photo.pet_id !== pet.id) {
    notFound();
  }

  const analysisClient = supabase as unknown as SupabaseClient;
  const [photoPreviewUrls, analysisResult, relationsResult, ownedPetsResult] = await Promise.all([
    createPhotoPreviewUrls(supabase, [photo], true, false, user.id),
    analysisClient.from("photo_ai_analyses").select("status, attempts, error_code, description, tags, activity, scene, emotion, contains_pet, model, prompt_version, analyzed_at").eq("photo_id", photo.id).maybeSingle(),
    supabase.rpc("get_photo_pets", { p_photo_id: photo.id }),
    supabase.from("pets").select("id, name, avatar_url").eq("owner_user_id", user.id).order("name").order("id"),
  ]);
  const ownedPets = ownedPetsResult.data ?? [];
  const avatarPaths = [...new Set([pet.avatar_url, ...ownedPets.map((item) => item.avatar_url)].filter((path): path is string => Boolean(path)))];
  const avatarResult = avatarPaths.length ? await supabase.storage.from("pet-avatars").createSignedUrls(avatarPaths, 3600) : { data: [] };
  const avatarUrls = new Map((avatarResult.data ?? []).map((item) => [item.path, item.signedUrl]));
  const primaryPet = { id: pet.id, name: pet.name, avatarUrl: avatarUrls.get(pet.avatar_url ?? "") ?? null };
  const photoPetOptions = getPhotoPetOptions(
    pet.id,
    relationsResult.data ?? [],
    ownedPets.map((item) => ({
      id: item.id,
      name: item.name,
      avatarUrl: avatarUrls.get(item.avatar_url ?? "") ?? null,
    })),
  );
  const photoPreviewUrl = photoPreviewUrls.get(photo.id);
  const analysis = analysisResult.data as PhotoAiAnalysis | null;
  const displayedTimestamp = photoTimestamp(photo);
  const canEditPhoto = photo.uploader_user_id === user.id;
  const canDeletePhoto = canEditPhoto || pet.owner_user_id === user.id;
  const canEditRelations = canEditPhoto && pet.owner_user_id === user.id;
  if (source === "search") {
    await recordProductAnalyticsEvent({ supabase: supabase as unknown as SupabaseClient, userId: user.id, eventType: "search_result_opened" });
  }

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${pet.id}`}>
        {pet.name}の思い出へ戻る
      </Link>

      {!photoPreviewUrl ? (
        <p role="alert" className="app-error">
          写真を表示できませんでした。
        </p>
      ) : (
        <div className="app-photo-frame aspect-square">
          <Image className="size-full object-contain" src={photoPreviewUrl} alt={`${pet.name}の思い出写真`} fill sizes="(max-width: 640px) 100vw, 576px" loading="eager" unoptimized />
        </div>
      )}

      <div className="grid gap-3 px-1 text-sm">
        <p className="text-xs text-muted">{formatTokyoDateTime(displayedTimestamp)}</p>
        {photo.caption ? <p className="whitespace-pre-wrap break-words leading-relaxed">{photo.caption}</p> : null}
      </div>

      {canEditRelations ? <PhotoPetControls primaryPet={primaryPet} photoId={photo.id} {...photoPetOptions} unavailable={Boolean(relationsResult.error || ownedPetsResult.error)} /> : null}

      {canEditPhoto ? <PhotoEditControls petId={pet.id} photoId={photo.id} caption={photo.caption} favorite={photo.favorite} takenAtInputValue={formatTokyoDateTimeInput(displayedTimestamp)} takenAtUsesCreatedAt={!photo.taken_at} /> : null}

      <section className="app-card-flat flex flex-col gap-4" aria-labelledby="ai-analysis-heading">
        <h2 id="ai-analysis-heading" className="text-sm font-medium text-muted">
          写真の情報
        </h2>

        {analysisResult.error ? (
          <p role="alert" className="text-sm text-danger">
            AI解析結果を取得できませんでした。
          </p>
        ) : !analysis ? (
          <>
            <p className="text-sm text-muted">この写真は順番に整理されます。</p>
          </>
        ) : analysis.status === "pending" || analysis.status === "processing" ? (
          <p role="status" className="text-sm text-muted">
            写真を整理しています…
          </p>
        ) : analysis.status === "failed" ? (
          <>
            <p className="text-sm text-muted">写真は保存されています。{analysis.attempts >= 3 || isTerminalAnalysisError(analysis.error_code) ? "この写真の自動整理を停止しました。" : "時間をおいて整理を再試行します。"}</p>
            {canEditPhoto && analysis.attempts < 3 && !isTerminalAnalysisError(analysis.error_code) ? <AiAnalysisButton petId={pet.id} photoId={photo.id} retry /> : null}
          </>
        ) : (
          <div className="grid gap-4 text-sm">
            <div>
              <h3 className="text-muted">写真の説明</h3>
              <p className="mt-1 whitespace-pre-wrap">{analysis.description}</p>
            </div>

            {analysis.tags.length > 0 ? (
              <div>
                <h3 className="text-muted">タグ</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {analysis.tags.map((tag) => (
                    <li key={tag} className="app-tag">
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <dl className="grid gap-2">
              <div className="flex gap-2">
                <dt className="text-muted">アクティビティ</dt>
                <dd>{analysis.activity ?? "不明"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted">シーン</dt>
                <dd>{analysis.scene ?? "不明"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted">雰囲気</dt>
                <dd>{analysis.emotion ?? "不明"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted">ペット</dt>
                <dd>{analysis.contains_pet === true ? "写っています" : analysis.contains_pet === false ? "確認できません" : "不明"}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {canDeletePhoto ? <PhotoDeleteControl petId={pet.id} photoId={photo.id} /> : null}
    </main>
  );
}
