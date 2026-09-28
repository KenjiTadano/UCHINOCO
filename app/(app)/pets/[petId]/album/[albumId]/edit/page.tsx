import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { buildCoverTitleLines } from "@/lib/album-cover-title";
import { buildAlbumPreviewSpreads } from "@/lib/album-preview-spreads";
import {
  AlbumEditScreen,
  type AlbumEditPageEntry,
} from "./album-edit-screen";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export default async function AlbumEditPage({ params }: Props) {
  const { petId, albumId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const { data: album, error: albumError } = await supabase
    .from("albums")
    .select("id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .eq("pet_id", petId)
    .maybeSingle();

  if (albumError || !album) notFound();
  if (album.status === "ordered") {
    redirect(`/pets/${petId}/album/${albumId}`);
  }

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name, owner_user_id")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!pet) notFound();

  const { data: rawAlbumPhotos } = await supabase
    .from("album_photos")
    .select("album_id, photo_id, position")
    .eq("album_id", albumId)
    .order("position", { ascending: true });

  const albumPhotos = rawAlbumPhotos ?? [];
  const photoIds = albumPhotos.map((ap) => ap.photo_id);

  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, thumbnail_path, caption, taken_at")
    .in("id", photoIds.length > 0 ? photoIds : ["00000000-0000-0000-0000-000000000000"]);

  const photoById = new Map((photos ?? []).map((p) => [p.id, p]));
  const photosForUrls = albumPhotos
    .map((ap) => photoById.get(ap.photo_id))
    .filter(Boolean) as Array<{
    id: string;
    storage_path: string;
    thumbnail_path: string | null;
  }>;

  const { signedUrlByPath } = await createListImageUrls(supabase, photosForUrls);

  const ordered = albumPhotos
    .map((ap) => {
      const photo = photoById.get(ap.photo_id);
      if (!photo) return null;
      const src = signedUrlByPath.get(listImagePath(photo)) ?? null;
      return {
        photo_id: ap.photo_id,
        src,
        caption: photo.caption ?? null,
        taken_at: photo.taken_at ?? null,
      };
    })
    .filter(Boolean) as Array<{
    photo_id: string;
    src: string | null;
    caption: string | null;
    taken_at: string | null;
  }>;

  const analysesResult = await supabase
    .from("photo_ai_analyses")
    .select("photo_id, activity, scene, tags, description")
    .in(
      "photo_id",
      photoIds.length > 0 ? photoIds : ["00000000-0000-0000-0000-000000000000"],
    )
    .eq("status", "completed");

  const analysisByPhotoId = new Map(
    (analysesResult.data ?? []).map((a) => [a.photo_id, a]),
  );

  const periodMonthLabel = formatMonthLabel(album.period_to ?? album.period_from);
  const coverDateLabel = formatCoverDate(album.period_to ?? album.period_from);
  const lines = buildCoverTitleLines(pet.name, album.title ?? "", periodMonthLabel);

  const coverSrc =
    (album.cover_photo_id
      ? ordered.find((p) => p.photo_id === album.cover_photo_id)?.src
      : null) ??
    ordered.find((p) => p.src)?.src ??
    null;

  const spreads = buildAlbumPreviewSpreads(
    ordered
      .filter((p) => p.src)
      .map((p) => {
        const ai = analysisByPhotoId.get(p.photo_id);
        return {
          src: p.src as string,
          alt: `${pet.name}の思い出`,
          caption: p.caption,
          taken_at: p.taken_at,
          activity: ai?.activity ?? null,
          scene: ai?.scene ?? null,
          description: ai?.description ?? null,
          tags: ai?.tags ?? null,
        };
      }),
    {
      petName: pet.name,
      periodMonthLabel,
    },
  );

  const pages = buildEditPageEntries(spreads);
  const pageCount = Math.max(1 + spreads.length * 2, pages.length > 1 ? 3 : 1);

  const base = `/pets/${petId}/album/${albumId}`;

  return (
    <AlbumEditScreen
      petName={pet.name}
      coverSrc={coverSrc}
      dateLabel={coverDateLabel}
      titlePrefix={lines.prefix}
      titleMain={lines.main}
      pageCount={pageCount}
      pages={pages}
      selectedPageId="cover"
      backHref={`${base}?view=complete`}
      previewHref={`${base}?view=preview`}
      coverChangeHref={`${base}/cover/edit`}
      addPhotosHref={`${base}/add`}
      titleEditHref={base}
      doneHref={`${base}?view=complete`}
      pageEditHref={`${base}/pages/edit`}
    />
  );
}

function buildEditPageEntries(spreads: ReturnType<typeof buildAlbumPreviewSpreads>): AlbumEditPageEntry[] {
  const pages: AlbumEditPageEntry[] = [
    {
      kind: "cover",
      id: "cover",
      label: "1 表紙",
    },
  ];

  let pageNum = 2;
  spreads.forEach((spread, i) => {
    const end = pageNum + 1;
    pages.push({
      kind: "spread",
      id: `spread-${i}`,
      label: `${pageNum} - ${end}`,
      spread,
    });
    pageNum = end + 1;
  });

  return pages;
}

function formatCoverDate(iso: string | null): string {
  if (!iso) {
    const now = new Date();
    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}.${m}`;
}

function formatMonthLabel(iso: string | null): string {
  if (!iso) return "今月";
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
  });
}
