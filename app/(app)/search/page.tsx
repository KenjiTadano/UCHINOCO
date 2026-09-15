import { SearchScreen } from "./_components/search-screen";
import type { SearchParams } from "@/lib/search-state";

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <SearchScreen params={await searchParams} />;
}
