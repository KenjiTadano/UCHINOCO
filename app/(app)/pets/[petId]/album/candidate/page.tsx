import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { preparePassiveCandidate } from "@/lib/passive-album-candidate-server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { CandidateOpenForm } from "./candidate-open-form";
import { currentTokyoMonth, parseTokyoMonthKey } from "@/lib/album-monthly-lifecycle";

export default async function PassiveAlbumCandidatePage({ params, searchParams }: { params: Promise<{ petId: string }>; searchParams: Promise<{ month?: string }> }) {
  const [{ petId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: pet } = await supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet) notFound();
  const month = parseTokyoMonthKey(query.month) ?? currentTokyoMonth();
  const candidate = await preparePassiveCandidate({ supabase, userId: user.id, petId, petName: pet.name, monthKey: month.key });
  if (!candidate) notFound();
  const { data: cover } = candidate.coverPhotoId
    ? await supabase.from("photos").select("id, storage_path, thumbnail_path").eq("id", candidate.coverPhotoId).eq("pet_id", petId).maybeSingle()
    : { data: null };
  const urls = cover ? await createListImageUrls(supabase, [cover]) : null;
  const coverUrl = cover && urls ? urls.signedUrlByPath.get(listImagePath(cover)) ?? null : null;

  return (
    <main className="app-page grid gap-6">
      <Link className="app-back-link" href={`/pets/${petId}/album`}>アルバムへ戻る</Link>
      <header className="grid gap-2">
        <p className="ds-editorial">AI ALBUM · UNREVIEWED</p>
        <h1 className="ds-display">{month.key === currentTokyoMonth().key ? "今月のアルバム、できています" : `${month.month}月のアルバム、できています`}</h1>
        <p className="ds-body text-muted">{candidate.photoCount}枚の思い出から、Best Shot・Story・Layoutをまとめました。</p>
      </header>
      {coverUrl ? <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-photo)] bg-[var(--color-surface-warm)]"><Image src={coverUrl} alt={`${pet.name}の今月のアルバム候補`} fill className="object-cover" unoptimized /></div> : null}
      <section className="grid gap-2 rounded-[var(--radius-medium)] border border-[var(--color-border)] bg-white p-5" aria-labelledby="candidate-title">
        <p className="ds-label">AIがまとめました · 未確認</p>
        <h2 id="candidate-title" className="ds-heading">{candidate.title}</h2>
        <p className="ds-caption">開くまでは正式な編集Draftを作りません。新しい写真が増えた場合は、最新の候補を安全に作り直します。</p>
      </section>
      <CandidateOpenForm petId={petId} fingerprint={candidate.fingerprint} monthKey={month.key} />
    </main>
  );
}
