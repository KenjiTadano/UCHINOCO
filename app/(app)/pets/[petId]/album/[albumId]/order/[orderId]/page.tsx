import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createListImageUrls, listImagePath } from "@/lib/photo-list-images";
import { formatPrice } from "@/lib/photobook-products";
import { getOrderStatusMessage } from "@/lib/webhook-helpers";
import { AlbumCoverCollage } from "../../../_components/album-cover-collage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ petId: string; albumId: string; orderId: string }>;
};

export default async function OrderCompletePage({ params }: Props) {
  const { petId, albumId, orderId } = await params;

  if (!UUID_RE.test(petId) || !UUID_RE.test(albumId) || !UUID_RE.test(orderId)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/login");

  // IDOR: all four fields must match — session_id query param is never used as auth.
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, owner_user_id, album_id, pet_id, status, product_name, product_size, product_cover_type_label, pages, subtotal, shipping_fee, total, shipping_prefecture, created_at",
    )
    .eq("id", orderId)
    .eq("owner_user_id", user.id)
    .eq("album_id", albumId)
    .eq("pet_id", petId)
    .maybeSingle();

  if (!order) notFound();

  // Album title
  const { data: album } = await supabase
    .from("albums")
    .select("id, title")
    .eq("id", albumId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  // Cover photos (up to 3 by position)
  const { data: coverRows } = await supabase
    .from("album_photos")
    .select("photo_id")
    .eq("album_id", albumId)
    .order("position", { ascending: true })
    .limit(3);

  const coverIds = (coverRows ?? []).map((r) => r.photo_id);

  const { data: coverPhotos } = await supabase
    .from("photos")
    .select("id, storage_path, thumbnail_path")
    .in("id", coverIds.length > 0 ? coverIds : ["00000000-0000-0000-0000-000000000000"]);

  const signedResult = await createListImageUrls(supabase, coverPhotos ?? []);
  const photoById = new Map((coverPhotos ?? []).map((p) => [p.id, p]));
  const coverUrls = coverIds
    .map((id) => {
      const photo = photoById.get(id);
      return photo ? signedResult.signedUrlByPath.get(listImagePath(photo)) : undefined;
    })
    .filter(Boolean) as string[];

  const statusMessage = getOrderStatusMessage(order.status);
  const shortOrderId = order.id.slice(-8).toUpperCase();

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}`}>
        アルバムへ戻る
      </Link>

      {/* Cover */}
      <section>
        <AlbumCoverCollage urls={coverUrls} petName="" />
        <div className="mt-3 px-1">
          <p className="ds-editorial">ORDER</p>
          <h1 className="mt-1 text-xl font-semibold">
            {album?.title || "（タイトル未設定）"}
          </h1>
        </div>
      </section>

      {/* Status banner */}
      <OrderStatusBanner
        status={order.status}
        message={statusMessage}
        petId={petId}
        albumId={albumId}
        orderId={orderId}
      />

      {/* Order summary */}
      <section aria-labelledby="order-summary-heading" className="app-card-flat">
        <h2 id="order-summary-heading" className="mb-4 text-sm font-medium text-muted">
          注文内容
        </h2>
        <dl className="grid gap-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">注文番号</dt>
            <dd className="font-mono font-medium">{shortOrderId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">商品</dt>
            <dd className="font-medium">{order.product_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">サイズ</dt>
            <dd>{order.product_size}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">カバー</dt>
            <dd>{order.product_cover_type_label}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">ページ数</dt>
            <dd>{order.pages}ページ</dd>
          </div>
          <div className="flex justify-between border-t pt-2.5">
            <dt className="text-muted">商品小計</dt>
            <dd>{formatPrice(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">送料</dt>
            <dd>{formatPrice(order.shipping_fee)}</dd>
          </div>
          <div className="flex items-center justify-between border-t pt-2.5">
            <dt className="font-semibold">合計</dt>
            <dd className="text-xl font-semibold">{formatPrice(order.total)}</dd>
          </div>
          {order.shipping_prefecture && (
            <div className="flex justify-between border-t pt-2.5">
              <dt className="text-muted">配送先</dt>
              <dd>{order.shipping_prefecture}</dd>
            </div>
          )}
        </dl>
      </section>

      {order.status === "paid" && (
        <Link
          href={`/pets/${petId}/album/${albumId}`}
          className="app-button-secondary flex items-center justify-center"
        >
          アルバムへ戻る
        </Link>
      )}
    </main>
  );
}

type BannerProps = {
  status: string;
  message: string;
  petId: string;
  albumId: string;
  orderId: string;
};

function OrderStatusBanner({ status, message, petId, albumId, orderId }: BannerProps) {
  if (status === "paid") {
    return (
      <div className="rounded-xl border border-success/30 bg-success-soft px-4 py-4">
        <p className="ds-editorial mb-1">CONFIRMED</p>
        <p className="text-base font-semibold">{message}</p>
        <p className="ds-caption mt-1">
          ご注文の確認メールをお送りしました。印刷・製本には数営業日いただきます。
        </p>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-xl border border-border px-4 py-4">
        <p className="ds-editorial mb-1">PROCESSING</p>
        <p className="text-base font-semibold">{message}</p>
        <p className="ds-caption mt-1">
          お支払い完了後、このページが自動的に更新されます。
        </p>
        <a
          href={`/pets/${petId}/album/${albumId}/order/${orderId}`}
          className="mt-3 inline-block text-xs font-medium underline underline-offset-2"
        >
          再読み込み
        </a>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-4">
        <p className="ds-editorial mb-1 text-danger">FAILED</p>
        <p className="text-base font-semibold text-danger">{message}</p>
        <p className="ds-caption mt-1 text-danger/80">
          お支払い情報を確認できませんでした。再度お試しください。
        </p>
        <Link
          href={`/pets/${petId}/album/${albumId}/product`}
          className="mt-3 inline-block text-xs font-medium text-danger underline underline-offset-2"
        >
          再注文する
        </Link>
      </div>
    );
  }

  // cancelled or unknown
  return (
    <div className="rounded-xl border border-border px-4 py-4">
      <p className="ds-editorial mb-1">CANCELLED</p>
      <p className="text-base font-semibold">{message}</p>
    </div>
  );
}
