import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { ProductSelector } from "./product-selector";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function AlbumProductPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  // IDOR: album ownership + petId route match (both required)
  const { data: album } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, title")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (!album) notFound();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!pet) notFound();

  // Photo count + cover photos — fetched in parallel
  const [{ count: photoCount }, { data: albumCoverPhotos }] = await Promise.all([
    supabase
      .from("album_photos")
      .select("photo_id", { count: "exact", head: true })
      .eq("album_id", albumId),
    supabase
      .from("album_photos")
      .select("photo_id")
      .eq("album_id", albumId)
      .order("position", { ascending: true })
      .limit(3),
  ]);

  const coverPhotoIds = (albumCoverPhotos ?? []).map((ap) => ap.photo_id);

  const { data: coverPhotos } = await supabase
    .from("photos")
    .select("id, storage_path, thumbnail_path")
    .in("id", coverPhotoIds.length > 0 ? coverPhotoIds : ["00000000-0000-0000-0000-000000000000"]);

  const signedUrlsResult = await createListImageUrls(supabase, coverPhotos ?? []);
  const photoById = new Map((coverPhotos ?? []).map((p) => [p.id, p]));

  const coverUrls = coverPhotoIds
    .map((id) => {
      const photo = photoById.get(id);
      return photo ? signedUrlsResult.signedUrlByPath.get(listImagePath(photo)) : undefined;
    })
    .filter(Boolean) as string[];

  return (
    <ProductSelector
      petId={petId}
      albumId={albumId}
      petName={pet.name}
      albumTitle={album.title}
      photoCount={photoCount ?? 0}
      coverUrls={coverUrls}
    />
  );
}
