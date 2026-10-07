import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlements, resolvePlan, type UserEntitlements, type UserPlan } from "@/lib/entitlements";

type SubscriptionRow = { status: string };

function untyped(client: SupabaseClient) {
  return client as SupabaseClient;
}

export async function loadUserPlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPlan> {
  const { data } = await untyped(supabase)
    .from("user_subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return resolvePlan({
    subscriptionStatus: (data as SubscriptionRow | null)?.status ?? null,
    devOverride: process.env.UCHINOCO_DEV_PLAN_OVERRIDE,
    nodeEnv: process.env.NODE_ENV,
  });
}

export async function loadUserEntitlements(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserEntitlements> {
  return getUserEntitlements(await loadUserPlan(supabase, userId));
}

export async function loadPetOwnerEntitlements(
  supabase: SupabaseClient,
  petId: string,
): Promise<{ ownerUserId: string; entitlements: UserEntitlements } | null> {
  const { data: pet } = await untyped(supabase)
    .from("pets")
    .select("owner_user_id")
    .eq("id", petId)
    .maybeSingle();
  const ownerUserId = (pet as { owner_user_id?: string } | null)?.owner_user_id;
  if (!ownerUserId) return null;
  return {
    ownerUserId,
    entitlements: await loadUserEntitlements(supabase, ownerUserId),
  };
}
