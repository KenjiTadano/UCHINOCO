import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlusUpsell } from "@/app/(app)/_components/plus-upsell";
import { EmptyState, PageHeader } from "@/app/_components/ui";
import { loadAnniversaryMemory } from "@/lib/anniversary-memories";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { createClient } from "@/lib/supabase/server";

type AnniversaryPageProps = { params: Promise<{ petId: string }> };

function photoLabel(value: string | null, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export default async function AnniversaryPage({ params }: AnniversaryPageProps) {
  const { petId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_user_id, name, birthday, adoption_date")
    .eq("id", petId)
    .maybeSingle();
  if (petError || !pet) notFound();

  const entitlements = await loadUserEntitlements(supabase, pet.owner_user_id);

  const memory = await loadAnniversaryMemory({
    supabase,
    pets: [pet],
    selectedPetIds: [pet.id],
    includeHistory: entitlements.canUseOnThisDayHistory,
  });
  const photos = [
    ...memory.todayPhotos,
    ...memory.pastByYear.flatMap((group) => group.photos),
  ];
  const urls = await createListImageUrls(supabase, photos);
  const event = memory.events[0] ?? null;
  const comparison = memory.growthComparison;
  const hasMemory = Boolean(event || memory.pastByYear.length || comparison);

  return (
    <main className="app-page space-y-8">
      <Link className="app-back-link" href={`/pets/${pet.id}`}>{pet.name}の思い出へ戻る</Link>
      <PageHeader
        eyebrow="ANNIVERSARY"
        title={event?.kind === "birthday"
          ? `今日は${pet.name}の誕生日`
          : event?.kind === "adoption" && event.years && event.years > 0
            ? `${pet.name}を迎えて${event.years}年`
            : `${pet.name}の記念日`}
        description="時間を重ねてきた、大切な日の思い出です。"
      />

      {!hasMemory ? (
        <EmptyState
          title="今日の記念日はまだありません"
          description="誕生日やお迎え日、過去の同日写真がある日に思い出をお届けします。"
          action={<Link className="app-button-secondary" href={`/pets/${pet.id}`}>思い出を見る</Link>}
        />
      ) : null}

      {!entitlements.canUseOnThisDayHistory ? (
        <PlusUpsell
          title="もっと昔の同じ日を見る"
          description="複数年のOn This Dayと成長比較はUCHINOCO PLUSで振り返れます。今日の記念日はFREEでも表示されます。"
          returnTo={`/pets/${pet.id}/anniversary`}
        />
      ) : null}

      {comparison ? (
        <section id="growth" className="space-y-4 scroll-mt-24">
          <div>
            <p className="app-eyebrow">GROWTH MEMORY</p>
            <h2 className="ds-heading">{comparison.yearsAgo}年前はこんな姿でした</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { photo: comparison.before, label: `${comparison.yearsAgo}年前` },
              { photo: comparison.after, label: "今日" },
            ].map(({ photo, label }) => {
              const src = urls.signedUrlByPath.get(listImagePath(photo));
              return (
                <Link key={photo.id} href={`/pets/${pet.id}/photos/${photo.id}`} className="ds-focus group min-w-0">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-photo bg-surface-warm">
                    {src ? <Image src={src} alt={`${pet.name}の${label}の写真`} fill sizes="(max-width: 640px) 50vw, 280px" className="object-cover transition-transform group-hover:scale-[1.02]" unoptimized /> : null}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted">{photoLabel(photo.taken_at ?? photo.created_at, label)}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {memory.pastByYear.length ? (
        <section className="space-y-6">
          <div>
            <p className="app-eyebrow">ON THIS DAY</p>
            <h2 className="ds-heading">同じ日の思い出</h2>
          </div>
          {memory.pastByYear.map((group) => (
            <div key={group.yearsAgo} className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">{group.yearsAgo}年前</h3>
              <div className="grid grid-cols-3 gap-2">
                {group.photos.map((photo) => {
                  const src = urls.signedUrlByPath.get(listImagePath(photo));
                  return (
                    <Link key={photo.id} href={`/pets/${pet.id}/photos/${photo.id}`} aria-label={`${group.yearsAgo}年前の写真を見る`} className="ds-focus relative aspect-square overflow-hidden rounded-photo bg-surface-warm">
                      {src ? <Image src={src} alt={`${pet.name}の${group.yearsAgo}年前の思い出`} fill sizes="(max-width: 640px) 33vw, 180px" className="object-cover" unoptimized /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-foreground">記念日の記録</h2>
        <dl className="grid gap-3 text-sm">
          {pet.birthday ? <div><dt className="text-muted">誕生日</dt><dd className="font-medium text-foreground">{pet.birthday.replaceAll("-", ".")}</dd></div> : null}
          {pet.adoption_date ? <div><dt className="text-muted">お迎え日</dt><dd className="font-medium text-foreground">{pet.adoption_date.replaceAll("-", ".")}</dd></div> : null}
        </dl>
      </section>

      {memory.pastByYear.length ? (
        <Link className="app-button-secondary w-full" href={`/pets/${pet.id}/album/new`}>この日の思い出をアルバムにする</Link>
      ) : null}
    </main>
  );
}
