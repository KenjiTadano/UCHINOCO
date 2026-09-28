import { recallPrintPdf } from "@/lib/album-print/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ petId: string; albumId: string }>;
};

export async function GET(request: Request, { params }: Props) {
  const { petId, albumId } = await params;
  const fingerprint = new URL(request.url).searchParams.get("fingerprint") ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("ログインが必要です。", { status: 401 });
  const { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .eq("pet_id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!album || !fingerprint) return new Response("見つかりません。", { status: 404 });

  const cached = recallPrintPdf(albumId, fingerprint);
  const bytes = cached ?? (await storedPdf(supabase, albumId, fingerprint));
  if (!bytes) return new Response("PDFがまだありません。", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=\"uchinoco-print.pdf\"",
      "Cache-Control": "private, no-store",
    },
  });
}

async function storedPdf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  albumId: string,
  fingerprint: string,
) {
  const { data } = await supabase
    .from("album_print_snapshots")
    .select("pdf_path")
    .eq("album_id", albumId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();
  if (!data?.pdf_path) return null;
  const admin = createAdminClient();
  const downloaded = await admin.storage.from("print-files").download(data.pdf_path);
  if (downloaded.error || !downloaded.data) return null;
  return new Uint8Array(await downloaded.data.arrayBuffer());
}
