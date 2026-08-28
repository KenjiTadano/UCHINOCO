import type { SupabaseClient } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatTokyoDateTime, photoTimestamp } from "@/lib/photo-timeline";
import { createClient } from "@/lib/supabase/server";
import { AiAnalysisButton } from "./ai-analysis-button";
import { PhotoDeleteControl } from "./photo-delete-control";
import { PhotoEditControls } from "./photo-edit-controls";

export const maxDuration = 60;

type PhotoDetailPageProps = {
  params: Promise<{ petId: string; photoId: string }>;
};

type PhotoAiAnalysis = {
  status: "pending" | "processing" | "completed" | "failed";
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

export default async function PhotoDetailPage({
  params,
}: PhotoDetailPageProps) {
  const { petId, photoId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const [petResult, photoResult] = await Promise.all([
    supabase
      .from("pets")
      .select("id, name, owner_user_id")
      .eq("id", petId)
      .eq("owner_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("photos")
      .select(
        "id, pet_id, storage_path, taken_at, created_at, caption, favorite",
      )
      .eq("id", photoId)
      .eq("pet_id", petId)
      .maybeSingle(),
  ]);
  const { data: pet, error: petError } = petResult;
  const { data: photo, error: photoError } = photoResult;

  if (
    petError ||
    photoError ||
    !pet ||
    !photo ||
    pet.owner_user_id !== user.id ||
    photo.pet_id !== pet.id
  ) {
    notFound();
  }

  const analysisClient = supabase as unknown as SupabaseClient;
  const [signedPhotoResult, analysisResult] = await Promise.all([
    supabase.storage.from("pet-photos").createSignedUrl(photo.storage_path, 3600),
    analysisClient
      .from("photo_ai_analyses")
      .select(
        "status, description, tags, activity, scene, emotion, contains_pet, model, prompt_version, analyzed_at",
      )
      .eq("photo_id", photo.id)
      .maybeSingle(),
  ]);
  const { data: signedPhoto, error: signedPhotoError } = signedPhotoResult;
  const analysis = analysisResult.data as PhotoAiAnalysis | null;
  const displayedTimestamp = photoTimestamp(photo);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-6 py-12">
      <Link className="text-sm underline" href={`/pets/${pet.id}`}>
        {pet.name}の思い出へ戻る
      </Link>

      <header>
        <p className="text-sm text-zinc-500">{pet.name}</p>
        <h1 className="mt-1 text-2xl font-semibold">思い出写真</h1>
      </header>

      {signedPhotoError || !signedPhoto?.signedUrl ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          写真を表示できませんでした。
        </p>
      ) : (
        <div className="relative aspect-square overflow-hidden rounded bg-zinc-100">
          <Image
            className="size-full object-contain"
            src={signedPhoto.signedUrl}
            alt={`${pet.name}の思い出写真`}
            fill
            sizes="(max-width: 640px) 100vw, 576px"
            loading="eager"
            unoptimized
          />
        </div>
      )}

      <dl className="grid gap-4 rounded border border-zinc-200 p-4 text-sm">
        <div>
          <dt className="text-zinc-500">撮影日時</dt>
          <dd className="mt-1">{formatTokyoDateTime(displayedTimestamp)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">お気に入り</dt>
          <dd className="mt-1">
            {photo.favorite ? "お気に入りに登録済み" : "お気に入りではありません"}
          </dd>
        </div>
        {photo.caption ? (
          <div>
            <dt className="text-zinc-500">キャプション</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">{photo.caption}</dd>
          </div>
        ) : (
          <div>
            <dt className="text-zinc-500">キャプション</dt>
            <dd className="mt-1 text-zinc-500">未設定</dd>
          </div>
        )}
      </dl>

      <PhotoEditControls
        petId={pet.id}
        photoId={photo.id}
        caption={photo.caption}
        favorite={photo.favorite}
      />

      <section className="flex flex-col gap-4 rounded border border-zinc-200 p-4" aria-labelledby="ai-analysis-heading">
        <h2 id="ai-analysis-heading" className="text-lg font-semibold">
          AI解析
        </h2>

        {analysisResult.error ? (
          <p role="alert" className="text-sm text-red-700">
            AI解析結果を取得できませんでした。
          </p>
        ) : !analysis ? (
          <>
            <p className="text-sm text-zinc-600">AI解析はまだありません</p>
            <AiAnalysisButton petId={pet.id} photoId={photo.id} />
          </>
        ) : analysis.status === "pending" || analysis.status === "processing" ? (
          <p role="status" className="text-sm text-zinc-600">
            AI解析中...
          </p>
        ) : analysis.status === "failed" ? (
          <>
            <p className="text-sm text-red-700">AI解析に失敗しました</p>
            <AiAnalysisButton petId={pet.id} photoId={photo.id} retry />
          </>
        ) : (
          <div className="grid gap-4 text-sm">
            <div>
              <h3 className="text-zinc-500">AIの説明</h3>
              <p className="mt-1 whitespace-pre-wrap">{analysis.description}</p>
            </div>

            {analysis.tags.length > 0 ? (
              <div>
                <h3 className="text-zinc-500">タグ</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {analysis.tags.map((tag) => (
                    <li key={tag} className="rounded-full bg-zinc-100 px-2.5 py-1">
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <dl className="grid gap-2">
              <div className="flex gap-2">
                <dt className="text-zinc-500">アクティビティ</dt>
                <dd>{analysis.activity ?? "不明"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500">シーン</dt>
                <dd>{analysis.scene ?? "不明"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500">雰囲気</dt>
                <dd>{analysis.emotion ?? "不明"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500">ペット</dt>
                <dd>
                  {analysis.contains_pet === true
                    ? "写っています"
                    : analysis.contains_pet === false
                      ? "確認できません"
                      : "不明"}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <PhotoDeleteControl petId={pet.id} photoId={photo.id} />
    </main>
  );
}
