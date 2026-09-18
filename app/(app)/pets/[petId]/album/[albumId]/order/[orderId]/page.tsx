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
import { OrderFlowSteps } from "../../../_components/order-flow-steps";
import { PhotobookCoverMock } from "../../../_components/photobook-cover-mock";
import {
  OrderProductionProgress,
  getProductionPhaseCopy,
  type ProductionPhase,
} from "../../../_components/order-production-progress";
import {
  OrderShippedPanel,
  type OrderShippedInfo,
} from "../../../_components/order-shipped-panel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ petId: string; albumId: string; orderId: string }>;
};

/**
 * Optional shipping overlay for future Provider wiring.
 * print_jobs is not readable by authenticated clients (RLS revoked),
 * so this page never invents shipped state from client queries.
 * When a trusted server path later supplies shipped info, pass it here.
 */
type ShippedOverlay = OrderShippedInfo & { active: boolean };

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

  // Provider未接続: do not claim shipping. paid → preparing only.
  const productionPhase: ProductionPhase =
    order.status === "paid" ? "preparing" : "received";
  const productionCopy = getProductionPhaseCopy(productionPhase);
  const orderedLabel = new Date(order.created_at).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });

  // Shipped UI is ready but inactive until a trusted source supplies status.
  const shippedOverlay: ShippedOverlay = { active: false };

  if (order.status === "paid" && shippedOverlay.active) {
    return (
      <main className="app-page-order">
        <div className="flex items-center gap-3">
          <Link className="app-back-link shrink-0" href={`/pets/${petId}/album/${albumId}`}>
            戻る
          </Link>
          <h1 className="flex-1 text-center text-base font-semibold tracking-tight">
            注文完了（発送完了）
          </h1>
          <Link
            href="/account/orders"
            className="ds-focus shrink-0 text-xs text-muted hover:text-foreground"
          >
            履歴
          </Link>
        </div>
        <OrderFlowSteps current={3} />
        <OrderShippedPanel
          albumTitle={displayTitle}
          petName={pet?.name}
          coverUrl={coverSignedUrl}
          shipping={shippedOverlay}
        />
      </main>
    );
  }

  return (
    <main className="app-page-order">
      <div className="flex items-center gap-3">
        <Link className="app-back-link shrink-0" href={`/pets/${petId}/album/${albumId}`}>
          戻る
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold tracking-tight">
          {order.status === "paid" ? "注文完了" : "ご注文状況"}
        </h1>
        <Link
          href="/account/orders"
          className="ds-focus shrink-0 text-xs text-muted hover:text-foreground"
        >
          履歴
        </Link>
      </div>

      {(order.status === "paid" || order.status === "pending") && (
        <OrderFlowSteps current={3} />
      )}

      {order.status === "paid" ? (
        <PaidCompleteView
          displayTitle={displayTitle}
          petName={pet?.name}
          coverSignedUrl={coverSignedUrl}
          statusMessage={statusMessage}
          productionPhase={productionPhase}
          productionCopy={productionCopy}
          orderedLabel={orderedLabel}
          shortOrderId={shortOrderId}
          order={order}
          orderPhotos={orderPhotos}
          photoUrlMap={photoUrlMap}
          petId={petId}
        />
      ) : (
        <>
          <section className="flex flex-col items-center gap-4 text-center">
            <PhotobookCoverMock
              src={coverSignedUrl}
              alt={`${displayTitle}の表紙`}
              size="lg"
              hardCover
            />
            {pet?.name ? <p className="ds-caption">{pet.name}</p> : null}
            <p className="ds-editorial">ORDER</p>
            <h2 className="text-xl font-semibold tracking-tight">{displayTitle}</h2>
          </section>

          <OrderStatusBanner
            status={order.status}
            message={statusMessage}
            petId={petId}
            albumId={albumId}
            orderId={orderId}
          />

          <OrderSummaryCard
            shortOrderId={shortOrderId}
            createdAt={order.created_at}
            productName={order.product_name}
            productSize={order.product_size}
            coverTypeLabel={order.product_cover_type_label}
            pages={order.pages}
            subtotal={order.subtotal}
            shippingFee={order.shipping_fee}
            total={order.total}
            shippingPrefecture={order.shipping_prefecture}
          />
        </>
      )}
    </main>
  );
}

type OrderRow = {
  product_name: string;
  product_size: string;
  product_cover_type_label: string;
  pages: number;
  subtotal: number;
  shipping_fee: number;
  total: number;
  shipping_prefecture: string | null;
  created_at: string;
};

type OrderPhoto = {
  id: string;
  position: number;
  original_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  caption: string | null;
};

function PaidCompleteView({
  displayTitle,
  petName,
  coverSignedUrl,
  statusMessage,
  productionPhase,
  productionCopy,
  orderedLabel,
  shortOrderId,
  order,
  orderPhotos,
  photoUrlMap,
  petId,
}: {
  displayTitle: string;
  petName?: string | null;
  coverSignedUrl: string | null;
  statusMessage: string;
  productionPhase: ProductionPhase;
  productionCopy: { title: string; body: string };
  orderedLabel: string;
  shortOrderId: string;
  order: OrderRow;
  orderPhotos: OrderPhoto[];
  photoUrlMap: Map<string, string>;
  petId: string;
}) {
  return (
    <>
      {/* PDF 08.3 — thank you + visual */}
      <section className="grid gap-6 text-center">
        <div>
          <p className="ds-editorial">THANK YOU</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {statusMessage}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            大切な思い出を、心を込めてフォトブックに仕上げる準備を進めています。
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <PhotobookCoverMock
            src={coverSignedUrl}
            alt={`${displayTitle}の表紙`}
            size="hero"
            hardCover
            priority
          />
          <div>
            {petName ? <p className="ds-caption">{petName}</p> : null}
            <p className="mt-1 text-base font-medium">{displayTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {petName
                ? `${petName}の思い出がカタチになります。楽しみにお待ちください。`
                : "思い出がカタチになります。楽しみにお待ちください。"}
            </p>
          </div>
        </div>
      </section>

      <OrderProductionProgress phase={productionPhase} orderedLabel={orderedLabel} />

      <div className="text-center">
        <p className="text-sm font-medium">{productionCopy.title}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          {productionCopy.body}
        </p>
      </div>

      <Link
        href="/account/orders"
        className="app-button-secondary w-full text-center"
      >
        注文履歴を見る
      </Link>

      <OrderSummaryCard
        shortOrderId={shortOrderId}
        createdAt={order.created_at}
        productName={order.product_name}
        productSize={order.product_size}
        coverTypeLabel={order.product_cover_type_label}
        pages={order.pages}
        subtotal={order.subtotal}
        shippingFee={order.shipping_fee}
        total={order.total}
        shippingPrefecture={order.shipping_prefecture}
      />

      {orderPhotos.length > 0 ? (
        <section aria-labelledby="photos-heading">
          <div className="mb-4 flex items-baseline gap-2">
            <h2 id="photos-heading" className="text-base font-semibold tracking-tight">
              この注文に含まれる写真
            </h2>
            <p className="ds-caption">{orderPhotos.length}枚</p>
          </div>
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {orderPhotos.map((photo, i) => {
              const { path } = getOrderPhotoDisplayPath(photo);
              const src = photoUrlMap.get(path);
              return (
                <li
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-md bg-surface-warm"
                >
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
      ) : null}

      <section className="rounded-xl bg-surface-warm/70 px-4 py-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <p className="text-sm leading-relaxed">
          次はどんな思い出を残しましょう？
        </p>
        <Link
          href={`/pets/${petId}/photos/new`}
          className="ds-focus mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-terracotta-strong sm:mt-0"
        >
          写真を追加する →
        </Link>
      </section>
    </>
  );
}

function OrderSummaryCard({
  shortOrderId,
  createdAt,
  productName,
  productSize,
  coverTypeLabel,
  pages,
  subtotal,
  shippingFee,
  total,
  shippingPrefecture,
}: {
  shortOrderId: string;
  createdAt: string;
  productName: string;
  productSize: string;
  coverTypeLabel: string;
  pages: number;
  subtotal: number;
  shippingFee: number;
  total: number;
  shippingPrefecture: string | null;
}) {
  return (
    <section aria-labelledby="order-summary-heading">
      <h2 id="order-summary-heading" className="mb-4 text-base font-semibold tracking-tight">
        注文内容
      </h2>
      <dl className="grid gap-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">注文番号</dt>
          <dd className="font-mono font-medium">{shortOrderId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">注文日</dt>
          <dd>
            {new Date(createdAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
          </dd>
        </div>
        <div className="app-order-divider" />
        <div className="flex justify-between gap-4">
          <dt className="text-muted">商品</dt>
          <dd className="font-medium">{productName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">サイズ</dt>
          <dd>{productSize}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">カバー</dt>
          <dd>{coverTypeLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">ページ数</dt>
          <dd>{pages}ページ</dd>
        </div>
        <div className="app-order-divider" />
        <div className="flex justify-between gap-4">
          <dt className="text-muted">商品小計</dt>
          <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">送料</dt>
          <dd className="tabular-nums">{formatPrice(shippingFee)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1">
          <dt className="font-medium">合計</dt>
          <dd className="app-price-accent text-xl">{formatPrice(total)}</dd>
        </div>
        {shippingPrefecture ? (
          <>
            <div className="app-order-divider" />
            <div className="flex justify-between gap-4">
              <dt className="text-muted">配送先</dt>
              <dd>{shippingPrefecture}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </section>
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
  if (status === "pending") {
    return (
      <div className="rounded-xl border border-border px-4 py-5 text-center">
        <p className="ds-editorial mb-2">PROCESSING</p>
        <p className="text-base font-semibold">{message}</p>
        <p className="ds-caption mt-2">
          お支払い完了後、このページが更新されます。
        </p>
        <a
          href={`/pets/${petId}/album/${albumId}/order/${orderId}`}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
        >
          再読み込み
        </a>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-5 text-center">
        <p className="ds-editorial mb-2 text-danger">FAILED</p>
        <p className="text-base font-semibold text-danger">{message}</p>
        <p className="ds-caption mt-2 text-danger/80">
          再度お試しいただくか、別のお支払い方法をお試しください。
        </p>
        <Link
          href={`/pets/${petId}/album/${albumId}/product`}
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-danger underline underline-offset-2"
        >
          再注文する
        </Link>
      </div>
    );
  }

  // cancelled or unknown
  return (
    <div className="rounded-xl border border-border px-4 py-5 text-center">
      <p className="ds-editorial mb-2">CANCELLED</p>
      <p className="text-base font-semibold">{message}</p>
      <Link
        href={`/pets/${petId}/album/${albumId}/product`}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
      >
        注文内容へ戻る
      </Link>
    </div>
  );
}
