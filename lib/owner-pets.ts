import type { SupabaseClient } from "@supabase/supabase-js";
import { toAvatarSignedUrlMap } from "@/lib/pet-avatars";
import type { PetSwitcherPet } from "@/app/(app)/_components/pet-switcher";

type PetRow = {
  id: string;
  name: string;
  avatar_url: string | null;
};

/**
 * Pets visible to the authenticated user in stable create order. RLS includes
 * owned pets and explicitly shared family pets.
 * Shared by 02 / 03 / 04 pet switcher rows.
 */
export async function loadOwnerPetsForSwitcher(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<{ pets: PetSwitcherPet[]; error: Error | null }> {
  // Keep the established call signature while RLS derives the visible set.
  void ownerUserId;
  const { data, error } = await supabase
    .from("pets")
    .select("id, name, avatar_url")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return { pets: [], error: new Error(error.message) };
  }

  const rows = (data ?? []) as PetRow[];
  const avatarPaths = Array.from(
    new Set(rows.flatMap((p) => (p.avatar_url ? [p.avatar_url] : []))),
  );

  const avatarUrlsResult = avatarPaths.length
    ? await supabase.storage.from("pet-avatars").createSignedUrls(avatarPaths, 3600)
    : { data: [], error: null };

  const avatarUrlByPath = avatarUrlsResult.error
    ? new Map<string, string>()
    : toAvatarSignedUrlMap(avatarPaths, avatarUrlsResult.data ?? []);

  const pets: PetSwitcherPet[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    avatarUrl:
      p.avatar_url && avatarUrlByPath.has(p.avatar_url)
        ? (avatarUrlByPath.get(p.avatar_url) ?? null)
        : null,
  }));

  return { pets, error: null };
}
