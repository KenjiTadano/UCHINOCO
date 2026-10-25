import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRouteReadContext } from "@/lib/album-persistence/route-read-context";
import { loadRouteDraft } from "@/lib/album-persistence/load-route-draft";
import { proposeSourceAdmission } from "@/lib/album-persistence/signed-source-lease";
import { admissionScope, plannedAdmissionWindow, type FiniteAdmission } from "@/lib/album-persistence/finite-source-admission";

/** Read-only bootstrap: enrollment is not installed by this page. No URLs/IDs in its DTO. */
export default async function AdmissionPage({ params }: { params: Promise<{ petId: string; albumId: string }> }) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.SOURCE_REUSE_ADMISSION || !process.env.VERCEL_GIT_COMMIT_SHA || !process.env.VERCEL_REGION) notFound();
  const { petId, albumId } = await params, db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const [{ data: album }, { data: pet }] = await Promise.all([
    db.from("albums").select("id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id").eq("id", albumId).eq("pet_id", petId).eq("owner_user_id", user.id).maybeSingle(),
    db.from("pets").select("id").eq("id", petId).eq("owner_user_id", user.id).maybeSingle(),
  ]);
  if (!album || !pet) notFound();
  const context = createRouteReadContext(db, user.id, album, false);
  const { draft } = await loadRouteDraft(db, context, true);
  const { data: { session } } = await db.auth.getSession();
  if (!draft || !session || session.user.id !== user.id) notFound();
  const m: FiniteAdmission = { version: 1, trial: "task17-finite-trial", build: process.env.VERCEL_GIT_COMMIT_SHA, region: process.env.VERCEL_REGION, startWindow: plannedAdmissionWindow(), groups: [] };
  const group = proposeSourceAdmission(new Map(Object.entries(draft.previewUrls)), { verifiedUserId: user.id, sessionUserId: session.user.id, accessToken: session.access_token, sessionExpiresAt: (session.expires_at ?? 0) * 1000, scope: admissionScope(process.env.VERCEL_PROJECT_ID ?? "uchinoco", m, albumId) }, m.startWindow);
  if (!group) return <main><h1>Admission unavailable</h1><p>Current source/session cannot support the finite trial.</p></main>;
  m.groups = [group];
  return <main><h1>Finite admission preparation</h1><p>Read-only proposal. Not enrolled.</p><output id="finite-admission-proposal" hidden>{JSON.stringify(m)}</output></main>;
}
