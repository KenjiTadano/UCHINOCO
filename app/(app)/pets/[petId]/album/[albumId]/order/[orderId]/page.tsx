import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/photobook-products";
import { getOrderStatusMessage } from "@/lib/webhook-helpers";
import {
  getShortOrderId,
  getOrderDisplayTitle,
  getOrderPhotoDisplayPath,
  hasOrderPhotoPreview,
} from "@/lib/order-helpers";

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
      "id, owner_user_id, album_id, pet_id, status, product_name, product_size, product_cover_type_label, pages, subtotal, shipping_fee, total, shipping_prefecture, created_at, album_title_snapshot, cover_original_path_snapshot",
    )
    .eq("id", orderId)
    .eq("owner_user_id", user.id)
    .eq("album_id", albumId)
    .eq("pet_id", petId)
    .maybeSingle();

  if (!order) notFound();

  // Album title fallback + pet name (parallel — minimize current album dependency)
  const [{ data: album }, { data: pet }] = await Promise.all([
    supabase
      .from("albums")
      .select("id, title")
      .eq("id", albumId)
      .eq("owner_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("pets")
      .select("id, name")
      .eq("id", petId)
      .eq("owner_user_id", user.id)
      .maybeSingle(),
  ]);

  // Cover: use snapshot (pet-photos private bucket), never current album_photos
  let coverSignedUrl: string | null = null;
  const coverPath = order.cover_original_path_snapshot;
  if (coverPath) {
    const { data: coverData } = await supabase.storage
      .from("pet-photos")
      .createSignedUrl(coverPath, 3600);
    coverSignedUrl = coverData?.signedUrl ?? null;
  }

  // order_photos: only for paid orders — snapshot is the truth, not album_photos
  type OrderPhoto = {
    id: string;
    position: number;
    original_path: string;
    thumbnail_path: string | null;
    taken_at: string | null;
    caption: string | null;
  };
  let orderPhotos: OrderPhoto[] = [];
  const photoUrlMap = new Map<string, string>();

  if (hasOrderPhotoPreview(order.status)) {
    const { data: rawPhotos } = await supabase
      .from("order_photos")
      .select("id, position, original_path, thumbnail_path, taken_at, caption")
      .eq("order_id", orderId)
      .order("position", { ascending: true });

    orderPhotos = rawPhotos ?? [];

    if (orderPhotos.length > 0) {
      // Prefer thumbnails; fall back to originals for photos without thumbnails
      const thumbnailPaths: string[] = [];
      const originalPaths: string[] = [];
      for (const p of orderPhotos) {
        if (p.thumbnail_path) thumbnailPaths.push(p.thumbnail_path);
        else originalPaths.push(p.original_path);
      }

      if (thumbnailPaths.length > 0) {
        const { data } = await supabase.storage
          .from("pet-photo-thumbnails")
          .createSignedUrls(thumbnailPaths, 3600);
        for (const item of data ?? []) {
          const url = item.signedUrl;
          const p = item.path;
          if (url && p) photoUrlMap.set(p, url);
        }
      }
      if (originalPaths.length > 0) {
        const { data } = await supabase.storage
          .from("pet-photos")
          .createSignedUrls(originalPaths, 3600);
        for (const item of data ?? []) {
          const url = item.signedUrl;
          const p = item.path;
          if (url && p) photoUrlMap.set(p, url);
        }
      }
    }
  }

  const displayTitle = getOrderDisplayTitle(order.album_title_snapshot, album?.title);
  const statusMessage = getOrderStatusMessage(order.status);
  const shortOrderId = getShortOrderId(order.id);

  return (
    <main className="app-page">
      <div className="flex items-center justify-between">
        <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}`}>
          アルバムへ戻る
        </Link>
        <Link href="/account/orders" className="ds-focus text-xs text-muted hover:text-foreground">
          注文履歴
        </Link>
      </div>

      {/* Cover — snapshot priority, never current album_photos */}
      <section>
        <div className="relative mx-auto aspect-[3/4] max-w-[160px] overflow-hidden rounded-md bg-surface-warm shadow-[2px_4px_8px_0_rgba(0,0,0,0.12)]">
          {coverSignedUrl ? (
            <Image
              src={coverSignedUrl}
              alt={`${displayTitle}の表紙`}
              fill
              sizes="160px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="size-full bg-surface-warm" />
          )}
          <div
            className="absolute inset-y-0 left-0 w-2.5 bg-black/[0.14]"
            aria-hidden="true"
          />
        </div>
        <div className="mt-4 px-1">
          {pet?.name && <p className="ds-caption">{pet.name}</p>}
          <p className="ds-editorial mt-0.5">ORDER</p>
          <h1 className="mt-1 text-xl font-semibold">{displayTitle}</h1>
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
            <dt className="text-muted">注文日</dt>
            <dd>{new Date(order.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</dd>
          </div>
          <div className="flex justify-between border-t pt-2.5">
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

      {/* order_photos preview — paid orders only, snapshot is truth */}
      {hasOrderPhotoPreview(order.status) && orderPhotos.length > 0 && (
        <section aria-labelledby="photos-heading">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 id="photos-heading" className="app-section-title">
              この注文に含まれる写真
            </h2>
            <p className="ds-caption">{orderPhotos.length}枚</p>
          </div>
          <ul className="grid grid-cols-3 gap-1.5">
            {orderPhotos.map((photo, i) => {
              const { path } = getOrderPhotoDisplayPath(photo);
              const src = photoUrlMap.get(path);
              return (
                <li key={photo.id} className="relative aspect-square overflow-hidden rounded-lg bg-surface-warm">
                  {src ? (
                    <Image
                      src={src}
                      alt={photo.caption ?? `${displayTitle}の写真 ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 33vw, 160px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                  <span
                    className="absolute left-1 top-1 rounded bg-black/40 px-1 text-[10px] text-white"
                    aria-hidden="true"
                  >
                    {photo.position + 1}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="ds-caption mt-3">
            注文確定時点の写真順序で表示しています。実際の印刷レイアウトとは異なる場合があります。
          </p>
        </section>
      )}

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
          印刷・製本には数営業日いただきます。
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
          お支払い完了後、このページが更新されます。
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
          再度お試しいただくか、別のお支払い方法をお試しください。
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
      <Link
        href={`/pets/${petId}/album/${albumId}/product`}
        className="mt-3 inline-block text-xs font-medium underline underline-offset-2"
      >
        注文内容へ戻る
      </Link>
    </div>
  );
}
