import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlusUpsell } from "@/app/(app)/_components/plus-upsell";
import { createClient } from "@/lib/supabase/server";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { parseAnnualYear } from "@/lib/annual-album";
import { preparePassiveAnnualCandidate } from "@/lib/passive-annual-candidate-server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { AnnualCandidateOpenForm } from "./annual-candidate-open-form";

export default async function AnnualCandidatePage({ params }: { params: Promise<{ petId: string; year: string }> }) {
  const { petId, year: rawYear } = await params;
  const year = parseAnnualYear(rawYear);
  if (!year) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: pet } = await supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", user.id).maybeSingle();
  if (!pet) notFound();
  const entitlements = await loadUserEntitlements(supabase, user.id);
  if (!entitlements.canUseAnnualMemory) {
    return (
      <main className="app-page grid gap-6">
        <Link className="app-back-link" href={`/pets/${petId}/album`}>アルバムへ戻る</Link>
        <PlusUpsell
          title={`${year}年の思い出を残す`}
          description="Year in Reviewと長期の年間履歴はUCHINOCO PLUSで利用できます。既に作成済みのアルバムや印刷物はそのまま残ります。"
          returnTo={`/pets/${petId}/album/year/${year}`}
        />
      </main>
    );
  }
  const candidate = await preparePassiveAnnualCandidate({ supabase, userId: user.id, petId, petName: pet.name, year });
  if (!candidate) notFound();
  const { data: cover } = await supabase.from("photos").select("id, storage_path, thumbnail_path").eq("id", candidate.coverPhotoId).eq("pet_id", petId).maybeSingle();
  const urls = cover ? await createListImageUrls(supabase, [cover]) : null;
  const coverUrl = cover && urls ? urls.signedUrlByPath.get(listImagePath(cover)) ?? null : null;
  return (
    <main className="app-page grid gap-6">
      <Link className="app-back-link" href={`/pets/${petId}/album`}>アルバムへ戻る</Link>
      <header className="grid gap-2">
        <p className="ds-editorial">{year} · YEAR IN REVIEW</p>
        <h1 className="ds-display">{year}年の思い出、できています</h1>
        <p className="ds-body text-muted">{candidate.photoCount}枚から、季節ごとのBest ShotとStoryをまとめました。</p>
      </header>
      {coverUrl ? <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-photo)] bg-[var(--color-surface-warm)]"><Image src={coverUrl} alt={`${candidate.title}の年間アルバム候補`} fill className="object-cover" unoptimized /></div> : null}
      <section className="grid gap-3 rounded-[var(--radius-medium)] border border-[var(--color-border)] bg-white p-5">
        <p className="ds-label">AIがまとめました · 未確認</p>
        <h2 className="ds-heading">{candidate.title}</h2>
        <p className="ds-caption">{candidate.seasons.map((season) => season.label).join(" · ")} · {candidate.selectedPhotoIds.length}枚を選定</p>
        <p className="ds-caption">開くまでは正式Draftを作りません。月ごとのアルバムは変更されません。</p>
      </section>
      <AnnualCandidateOpenForm petId={petId} year={year} fingerprint={candidate.fingerprint} />
    </main>
  );
}
