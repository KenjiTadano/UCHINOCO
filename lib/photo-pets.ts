import type { Database } from "@/lib/supabase/database.types";

export type PhotoPetRelation = Database["public"]["Functions"]["get_photo_pets"]["Returns"][number];
export type PhotoPetOption = { id: string; name: string; avatarUrl: string | null };

// Primary is a registration anchor, not evidence of appearing in a photo.
// Add future confirmed-AI support here only with its confirmation API/UI.
export function getPhotoPetOptions(
  primaryPetId: string,
  relations: PhotoPetRelation[],
  ownedPets: PhotoPetOption[],
) {
  const appearingIds = new Set(relations
    .filter((relation) => relation.source === "user" && relation.confirmed_by_user)
    .map((relation) => relation.pet_id));
  const unavailableIds = new Set([primaryPetId, ...relations.map((relation) => relation.pet_id)]);
  return {
    appearing: ownedPets.filter((pet) => pet.id !== primaryPetId && appearingIds.has(pet.id)),
    candidates: ownedPets.filter((pet) => !unavailableIds.has(pet.id)),
  };
}
