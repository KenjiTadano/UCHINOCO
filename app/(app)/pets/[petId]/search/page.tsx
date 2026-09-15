import { SearchScreen } from "@/app/(app)/search/_components/search-screen";
import type { SearchParams } from "@/lib/search-state";

export default async function PetSearchPage({ params, searchParams }: {
  params: Promise<{ petId: string }>; searchParams: Promise<SearchParams>;
}) {
  const [{ petId }, query] = await Promise.all([params, searchParams]);
  return <SearchScreen params={query} contextPetId={petId} />;
}
