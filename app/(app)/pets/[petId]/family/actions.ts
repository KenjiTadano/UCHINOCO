"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { analyticsEventKey, recordProductAnalyticsEvent } from "@/lib/product-analytics-server";
import { createClient } from "@/lib/supabase/server";

export type InviteState = {
  message: string | null;
  inviteUrl: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function untyped(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as SupabaseClient;
}

export async function createFamilyInvite(
  _state: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const petId = String(formData.get("petId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!UUID_PATTERN.test(petId) || !email || email.length > 254) {
    return { message: "メールアドレスを確認してください。", inviteUrl: null };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: "ログイン状態を確認してください。", inviteUrl: null };
  const entitlements = await loadUserEntitlements(supabase as unknown as SupabaseClient, user.id);
  if (!entitlements.canUseFamilySharing) {
    return { message: "家族の新規招待はUCHINOCO PLUSで利用できます。", inviteUrl: null };
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(token);
  const { error } = await untyped(supabase).rpc("create_pet_family_invite", {
    p_pet_id: petId,
    p_email: email,
    p_token_hash: tokenHash,
  });
  if (error) {
    return {
      message: error.code === "23505" ? "このメールアドレスには招待済みです。" : "招待を作成できませんでした。",
      inviteUrl: null,
    };
  }
  await recordProductAnalyticsEvent({
    supabase: untyped(supabase), userId: user.id, eventType: "family_invite_sent",
    eventKey: await analyticsEventKey(`family-invite-sent:${user.id}:${petId}:${Date.now()}`),
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  revalidatePath(`/pets/${petId}/family`);
  return {
    message: "招待リンクを作成しました。7日以内に家族へ共有してください。",
    inviteUrl: `${siteUrl}/family/invite/${token}`,
  };
}

export async function revokeFamilyInvite(formData: FormData) {
  const petId = String(formData.get("petId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!UUID_PATTERN.test(petId) || !UUID_PATTERN.test(inviteId)) return;
  const supabase = await createClient();
  await untyped(supabase).rpc("revoke_pet_family_invite", { p_invite_id: inviteId });
  revalidatePath(`/pets/${petId}/family`);
}

export async function removeFamilyMember(formData: FormData) {
  const petId = String(formData.get("petId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!UUID_PATTERN.test(petId) || !UUID_PATTERN.test(userId)) return;
  const supabase = await createClient();
  await untyped(supabase).rpc("remove_pet_family_member", {
    p_pet_id: petId,
    p_user_id: userId,
  });
  revalidatePath(`/pets/${petId}/family`);
}

export async function markFamilyActivitySeen(formData: FormData) {
  const petId = String(formData.get("petId") ?? "");
  if (!UUID_PATTERN.test(petId)) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await untyped(supabase).rpc("mark_pet_family_activity_seen", { p_pet_id: petId });
  if (!error) await recordProductAnalyticsEvent({ supabase: untyped(supabase), userId: user.id, eventType: "family_activity_viewed" });
  revalidatePath("/home");
  revalidatePath(`/pets/${petId}/family`);
  redirect(`/pets/${petId}`);
}

export async function acceptFamilyInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (token.length < 40 || token.length > 160) {
    redirect("/home?error=招待を確認できませんでした");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/family/invite/${token}`)}`);
  const tokenHash = await sha256(token);
  const { data, error } = await untyped(supabase).rpc("accept_pet_family_invite", {
    p_token_hash: tokenHash,
  });
  if (error || typeof data !== "string") {
    redirect("/home?error=招待を確認できませんでした");
  }
  await recordProductAnalyticsEvent({
    supabase: untyped(supabase), userId: user.id, eventType: "family_invite_accepted",
    eventKey: await analyticsEventKey(`family-invite-accepted:${user.id}:${data}`),
  });
  revalidatePath("/home");
  redirect(`/pets/${data}?message=家族の共有に参加しました`);
}
