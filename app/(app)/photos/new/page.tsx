import { PetActionSelector } from "../../_components/pet-action-selector";
import { safeAppReturnPath } from "@/lib/app-return-path";

export default async function SelectPetForPhotoPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <PetActionSelector
      mode="photo"
      returnTo={safeAppReturnPath(params.returnTo) ?? undefined}
    />
  );
}
