"use server";

import OpenAI from "openai";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectPetBestShots } from "@/app/(app)/dev/best-shot/actions";
import { analyzeSmartCropPhoto } from "@/app/(app)/dev/smart-crop/actions";
import { parseAlbumSetup } from "@/lib/album-setup";
import { planEditorialAlbum, buildEditorialDraft, editorialPageText, EDITORIAL_VERSION, type EditorialPhoto } from "@/lib/album-draft/editorial";
import type { LayoutPhotoInput } from "@/lib/smart-layout/types";
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

export async function createAlbumDraft(petId: string, _prev: CreateAlbumState, formData: FormData): Promise<CreateAlbumState> {
  if (!UUID_PATTERN.test(petId)) return { error: "無効なリクエストです。" };


  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "認証エラーが発生しました。再度ログインしてください。" };

  const { data: pets, error: petsError } = await supabase.from("pets").select("id, name, birthday, adoption_date").eq("owner_user_id", user.id).order("created_at", { ascending: true });
  if (petsError || !pets) return { error: "ペット情報を取得できませんでした。" };
  if (!pets.some((item) => item.id === petId)) return { error: "ペット情報を取得できませんでした。" };

  let setup;
  try { setup = parseAlbumSetup(formData, pets.map(pet => pet.id)); }
  catch (error) { return { error: error instanceof Error ? error.message : "作成条件を確認してください。" }; }
  const selectedPets = pets.filter(pet => setup.petIds.includes(pet.id));
  const anchorPet = selectedPets.find(pet => pet.id === petId) ?? selectedPets[0];
  const { from: periodFrom, to: periodTo } = setup;

  const photoResults = await Promise.all(
    selectedPets.map(async (selectedPet) => {
      const pageSize = 200;
      const petPhotos = [];
      for (let offset = 0; ; offset += pageSize) {
        const result = await supabase
          .from("photos")
          .select("id, pet_id, storage_path, thumbnail_path, taken_at, created_at, timeline_at, favorite, caption")
          .eq("pet_id", selectedPet.id)
          .eq("uploader_user_id", user.id)
          .gte("timeline_at", periodFrom.toISOString())
          .lte("timeline_at", periodTo.toISOString())
          .order("timeline_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (result.error) return { error: result.error, data: null };
        petPhotos.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < pageSize) {
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

  const analysisMap = new Map<string, { activity: string | null; scene: string | null; emotion: string | null; tags: string[] | null }>();
  for (let offset=0; offset<rawPhotos.length; offset+=200) {
    const result = await supabase.from("photo_ai_analyses").select("photo_id, activity, scene, emotion, tags").in("photo_id", rawPhotos.slice(offset,offset+200).map(photo=>photo.id)).eq("status","completed");
    if (result.error) return { error: "写真の解析情報を取得できませんでした。" };
    for (const row of result.data ?? []) analysisMap.set(row.photo_id,row);
  }

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
  const candidateById = new Map(scopedCandidates.map(photo=>[photo.id,photo]));
  const rankedPhotos: EditorialPhoto[] = [];
  for (const pet of selectedPets) {
    if (!scopedCandidates.some(photo=>photo.pet_id===pet.id)) continue;
    const run = await selectPetBestShots(pet.id, { dateRange: { start: periodFrom.toISOString(), end: periodTo.toISOString() }, allowedPhotoIds: scopedCandidates.filter(photo=>photo.pet_id===pet.id).map(photo=>photo.id), allowLargeImageDegrade: true });
    if (!run.ok) return { error: run.message ?? "写真選定に失敗しました。" };
    for (const {group,selection} of run.groups) for (const candidate of selection.ranking) {
      const photo=candidateById.get(candidate.photoId);
      if (photo) rankedPhotos.push({ photoId:photo.id, petId:pet.id, groupId:group.id, timeline:photo.timeline_at, scene:group.scene, activity:group.activity, candidate, confidence:selection.confidence });
    }
  }
  let plan;
  try { plan=planEditorialAlbum(rankedPhotos,setup.pageCount); }
  catch (error) { return { error:error instanceof Error ? error.message : "写真選定に失敗しました。" }; }
  const layoutPhotos: LayoutPhotoInput[] = [];
  for (let offset=0; offset<plan.selected.length; offset+=4) {
    const batch=plan.selected.slice(offset,offset+4);
    const results=await Promise.all(batch.map(photo=>analyzeSmartCropPhoto(photo.petId,photo.photoId,{allowLargeImageDegrade:true})));
    for (let index=0; index<results.length; index++) {
      const result=results[index], photo=batch[index];
      const preview=result.previewUrl ?? result.thumbnailUrl ?? result.imageUrl;
      if (!result.ok || !result.analysis || !preview) return { error:result.message ?? "写真の配置情報を取得できませんでした。" };
      layoutPhotos.push({photoId:photo.photoId,analysis:result.analysis,imageUrl:result.imageUrl ?? preview,previewUrl:preview,bestShot:{candidate:photo.candidate,confidence:photo.confidence},captionAvailable:true});
    }
  }
  const textByStory: Record<string,string> = {};
  for (const story of plan.spreads) if (story.photoIds.length===1) {
    const photo=candidateById.get(story.photoIds[0])!;
    textByStory[story.id] = editorialPageText(photo.timeline_at,photo.caption);
  }
  let editorial;
  try { editorial=buildEditorialDraft(plan.spreads,layoutPhotos,textByStory); }
  catch (error) { return { error:error instanceof Error ? error.message : "レイアウト生成に失敗しました。" }; }
  const persistableSpreads=editorial.spreads.map(toPersistableSpread);
  const selected=plan.selected.map(photo=>candidateById.get(photo.photoId)!);
  const coverPhotoId=[...plan.selected].sort((a,b)=>b.candidate.scores.overall-a.candidate.scores.overall)[0].photoId;

  // Generate title
  const label = setup.label;
  const petNames = selectedPets.map((item) => item.name);
  const displayPetName = petNames.join("・");
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

  {
    const composition = buildAlbumCompositionPlan(
      editorial.spreads,
      {
        title,
        petName: displayPetName,
        period: formatAlbumPeriodLabels(periodFrom.toISOString(), periodTo.toISOString()).coverDateLabel,
        periodStart: periodFrom.toISOString(),
        periodEnd: periodTo.toISOString(),
        events: [],
      },
    );
    composition.items = composition.items.filter(item => item.kind === "spread");
    const savedDraft = await supabase.rpc("save_album_draft_version", {
      p_album_id: album.id,
      p_payload: buildDraftSavePayload(persistableSpreads, [], composition, {
        editorial_version: EDITORIAL_VERSION,
        requested_body_pages: setup.pageCount,
        selected_pet_ids: setup.petIds,
        rhythm_audit: editorial.audit,
        rhythm_audit_before: editorial.beforeAudit,
        generation_photo_ids: scopedCandidates.map((photo) => photo.id).sort(),
      }) as unknown as Json,
    });
    if (savedDraft.error) {
      await supabase.from("albums").delete().eq("id", album.id);
      return { error: "アルバムの初稿を保存できませんでした。もう一度お試しください。" };
    }
    const { data: savedSpreads, error: savedSpreadsError } = await supabase.from("album_draft_spreads").select("id, story_spread_id").eq("draft_version_id", String(savedDraft.data));
    if (savedSpreadsError || !savedSpreads || savedSpreads.length !== setup.pageCount/2) {
      await supabase.from("albums").delete().eq("id",album.id);
      return {error:"アルバムのページを確認できませんでした。"};
    }
    const textRows=savedSpreads.filter(spread=>textByStory[spread.story_spread_id]).map(spread=>({draft_spread_id:spread.id,slot_id:"gutter-note",kind:"caption",ai_text:textByStory[spread.story_spread_id],ai_style_id:"editorial",override_mode:"inherit"}));
    if (textRows.length) {
      const {error:textError}=await supabase.from("album_draft_text_elements").insert(textRows);
      if (textError) {
        await supabase.from("albums").delete().eq("id",album.id);
        return {error:"日付・キャプションを保存できませんでした。もう一度お試しください。"};
      }
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

  redirect(`/pets/${anchorPet.id}/album/${album.id}?view=preview`);
}
