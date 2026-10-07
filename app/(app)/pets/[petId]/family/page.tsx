import Image from "next/image";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { PlusUpsell } from "@/app/(app)/_components/plus-upsell";
import { PageHeader } from "@/app/_components/ui";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { createClient } from "@/lib/supabase/server";
import { FamilyInviteForm } from "./invite-form";
import { markFamilyActivitySeen, removeFamilyMember, revokeFamilyInvite } from "./actions";

export default async function FamilyPage({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const client = supabase as unknown as SupabaseClient;
  const { data: pet } = await client.from("pets").select("id,name,owner_user_id").eq("id", petId).maybeSingle();
  if (!pet) notFound();
  const isOwner = pet.owner_user_id === user.id;
  const ownerEntitlements = await loadUserEntitlements(client, pet.owner_user_id);
  const [{ data: members }, { data: invites }, { data: activityRows }] = await Promise.all([
    client.from("pet_family_members").select("user_id,role,created_at").eq("pet_id", petId).order("created_at"),
    isOwner
      ? client.from("pet_family_invites").select("id,invitee_email,status,expires_at,created_at").eq("pet_id", petId).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
    client.from("photos").select("id,pet_id,uploader_user_id,storage_path,thumbnail_path,taken_at,created_at").eq("pet_id", petId).neq("uploader_user_id", user.id).order("created_at", { ascending: false }).limit(12),
  ]);
  const activity = activityRows ?? [];
  const urls = await createListImageUrls(supabase, activity);

  return (
    <main className="app-page grid gap-6">
      <Link className="app-back-link" href={`/pets/${petId}`}>{pet.name}の思い出へ戻る</Link>
      <PageHeader title={`${pet.name}の家族`} />

      {activity.length ? (
        <section className="grid gap-3" aria-labelledby="family-new-heading">
          <div>
            <p className="text-xs font-semibold tracking-wider text-primary">FAMILY NEW</p>
            <h2 id="family-new-heading" className="text-lg font-semibold">家族が追加した新しい写真</h2>
          </div>
          <ul className="grid grid-cols-3 gap-1.5">
            {activity.map((photo) => {
              const src = urls.signedUrlByPath.get(listImagePath(photo));
              if (!src) return null;
              return <li key={photo.id}><Link href={`/pets/${petId}/photos/${photo.id}`} className="ds-focus relative block aspect-square overflow-hidden rounded-xl"><Image src={src} alt={`${pet.name}の家族の思い出`} fill className="object-cover" sizes="33vw" unoptimized /></Link></li>;
            })}
          </ul>
          <form action={markFamilyActivitySeen}>
            <input type="hidden" name="petId" value={petId} />
            <button type="submit" className="app-button-secondary min-h-11">確認済みにして思い出へ戻る</button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-3" aria-labelledby="family-members-heading">
        <h2 id="family-members-heading" className="text-lg font-semibold">共有メンバー</h2>
        <ul className="grid gap-2">
          {(members ?? []).map((member, index) => (
            <li key={member.user_id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="text-sm">{member.role === "OWNER" ? "オーナー" : `家族 ${index}`}</span>
              {isOwner && member.role === "MEMBER" ? (
                <form action={removeFamilyMember}>
                  <input type="hidden" name="petId" value={petId} />
                  <input type="hidden" name="userId" value={member.user_id} />
                  <button type="submit" className="ds-focus min-h-11 px-3 text-sm text-danger">共有を解除</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && ownerEntitlements.canUseFamilySharing ? (
        <section className="grid gap-3" aria-labelledby="family-invite-heading">
          <h2 id="family-invite-heading" className="text-lg font-semibold">家族を招待</h2>
          <FamilyInviteForm petId={petId} />
          {(invites ?? []).some((invite) => invite.status === "PENDING") ? (
            <ul className="grid gap-2">
              {(invites ?? []).filter((invite) => invite.status === "PENDING").map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-muted">{invite.invitee_email}</span>
                  <form action={revokeFamilyInvite}>
                    <input type="hidden" name="petId" value={petId} />
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button type="submit" className="ds-focus min-h-11 px-3 text-danger">取消</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : isOwner ? (
        <PlusUpsell
          title="家族と一緒に思い出を残す"
          description="新しい家族の招待はUCHINOCO PLUSで利用できます。既存の共有写真やメンバーは削除されません。"
          returnTo={`/pets/${petId}/family`}
        />
      ) : ownerEntitlements.canUseFamilySharing ? (
        <p className="rounded-xl bg-surface-warm p-4 text-sm text-muted">写真の追加と共有アルバムの閲覧ができます。ペット情報の編集・注文はオーナーのみ行えます。</p>
      ) : (
        <p className="rounded-xl bg-surface-warm p-4 text-sm text-muted">共有中の思い出は引き続き閲覧できます。オーナーのPLUSが再開されるまで新しい写真の追加はできません。</p>
      )}
    </main>
  );
}
