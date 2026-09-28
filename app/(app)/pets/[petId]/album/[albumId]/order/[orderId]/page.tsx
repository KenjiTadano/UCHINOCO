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
import { OrderFlowHeader } from "../../../_components/order-flow-header";
import { OrderFlowSteps } from "../../../_components/order-flow-steps";
import { PhotobookCoverMock } from "../../../_components/photobook-cover-mock";
import {
  OrderProductionProgress,
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

type ShippedOverlay = OrderShippedInfo & { active: boolean };

/** PDF p17 / p18 order complete */
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
    supabase.from("albums").select("id, title").eq("id", albumId).eq("owner_user_id", user.id).maybeSingle(),
    supabase.from("pets").select("id, name").eq("id", petId).eq("owner_user_id", user.id).maybeSingle(),
  ]);

  let coverSignedUrl: string | null = null;
  if (order.cover_original_path_snapshot) {
    const { data } = await supabase.storage
      .from("pet-photos")
      .createSignedUrl(order.cover_original_path_snapshot, 3600);
    coverSignedUrl = data?.signedUrl ?? null;
  }

  type OrderPhoto = {
    id: string;
    position: number;
    original_path: string;
    thumbnail_path: string | null;
    caption: string | null;
  };
  let orderPhotos: OrderPhoto[] = [];
  const photoUrlMap = new Map<string, string>();

  if (hasOrderPhotoPreview(order.status)) {
    const { data: rawPhotos } = await supabase
      .from("order_photos")
      .select("id, position, original_path, thumbnail_path, caption")
      .eq("order_id", orderId)
      .order("position", { ascending: true });
    orderPhotos = rawPhotos ?? [];
    if (orderPhotos.length > 0) {
      const thumbs = orderPhotos.filter((p) => p.thumbnail_path).map((p) => p.thumbnail_path!);
      const originals = orderPhotos.filter((p) => !p.thumbnail_path).map((p) => p.original_path);
      if (thumbs.length > 0) {
        const { data } = await supabase.storage.from("pet-photo-thumbnails").createSignedUrls(thumbs, 3600);
        for (const item of data ?? []) {
          if (item.signedUrl && item.path) photoUrlMap.set(item.path, item.signedUrl);
        }
      }
      if (originals.length > 0) {
        const { data } = await supabase.storage.from("pet-photos").createSignedUrls(originals, 3600);
        for (const item of data ?? []) {
          if (item.signedUrl && item.path) photoUrlMap.set(item.path, item.signedUrl);
        }
      }
    }
  }

  const displayTitle = getOrderDisplayTitle(order.album_title_snapshot, album?.title);
  const statusMessage = getOrderStatusMessage(order.status);
  const shortOrderId = getShortOrderId(order.id);
  const productionPhase: ProductionPhase = order.status === "paid" ? "preparing" : "received";
  const orderedLabel = new Date(order.created_at).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });

  const shippedOverlay: ShippedOverlay = { active: false };

  if (order.status === "paid" && shippedOverlay.active) {
    return (
      <main className="of-page">
        <OrderFlowHeader title="注文完了（発送完了後）" backHref={`/pets/${petId}/album/${albumId}`} />
        <div className="of-step-wrap"><OrderFlowSteps current={3} /></div>
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
    <main className="of-page">
      <OrderFlowHeader
        title={order.status === "paid" ? "注文完了（制作中）" : "ご注文状況"}
        backHref={`/pets/${petId}/album/${albumId}`}
      />
      {(order.status === "paid" || order.status === "pending") && (
        <div className="of-step-wrap"><OrderFlowSteps current={3} /></div>
      )}

      {order.status === "paid" ? (
        <div className="of-body gap-5">
          {/* PDF p17 hero thank-you */}
          <section className="text-center">
            <h2 className="font-serif text-[21px] font-medium leading-snug tracking-tight text-[#3a2f2b]">
              {statusMessage}！
            </h2>
            <p className="mx-auto mt-2 max-w-[260px] text-[12px] leading-relaxed text-[#8a7a74]">
              大切な思い出を、心を込めて
              <br />
              フォトブックに仕上げています。
            </p>
          </section>

          <div className="flex items-center justify-center gap-3 px-2">
            <PetIllustration />
            <p className="max-w-[140px] text-left font-serif text-[11px] leading-relaxed text-[#b95d47]">
              {pet?.name ? `${pet.name}の` : ""}
              思い出がカタチになります
              <br />
              楽しみにお待ちください！
            </p>
          </div>

          <OrderProductionProgress phase={productionPhase} orderedLabel={orderedLabel} />

          <p className="text-center text-[12px] leading-relaxed text-[#5c4d47]">
            ただいま制作準備中です。発送が完了しましたら、アプリとメールでお知らせします。
          </p>

          <Link href="/account/orders" className="of-cta-outline">
            注文履歴を見る
          </Link>

          <section className="of-block-warm flex items-center gap-3 p-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] bg-[#e5d8d0]">
              {coverSignedUrl ? (
                <Image src={coverSignedUrl} alt="" fill className="object-cover" unoptimized />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-snug text-[#3a2f2b]">
                次はどんな思い出を
                <br />
                残しましょう？
              </p>
              <Link href={`/pets/${petId}/photos/new`} className="of-link mt-1.5 inline-flex rounded-full border border-[#b95d47] px-3 py-1 text-[11px] no-underline">
                写真を追加する →
              </Link>
            </div>
          </section>

          <details className="text-[12px]">
            <summary className="of-section-label cursor-pointer list-none">
              注文詳細 <span className="font-normal text-[#8a7a74]">{shortOrderId}</span>
            </summary>
            <dl className="of-block mt-2 grid gap-2 px-3.5 py-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-[#8a7a74]">商品</dt><dd>{order.product_name}</dd></div>
              <div className="flex justify-between"><dt className="text-[#8a7a74]">ページ</dt><dd>{order.pages}ページ</dd></div>
              <div className="flex justify-between"><dt className="text-[#8a7a74]">合計</dt><dd className="of-price">{formatPrice(order.total)}</dd></div>
            </dl>
            {orderPhotos.length > 0 ? (
              <ul className="mt-2 grid grid-cols-3 gap-1">
                {orderPhotos.map((photo, i) => {
                  const { path } = getOrderPhotoDisplayPath(photo);
                  const src = photoUrlMap.get(path);
                  return (
                    <li key={photo.id} className="relative aspect-square overflow-hidden rounded-[6px] bg-[#f4ece6]">
                      {src ? (
                        <Image
                          src={src}
                          alt={photo.caption ?? `${displayTitle}の写真 ${i + 1}`}
                          fill
                          sizes="120px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </details>
        </div>
      ) : (
        <div className="of-body">
          <div className="flex flex-col items-center gap-3 text-center">
            <PhotobookCoverMock src={coverSignedUrl} alt={`${displayTitle}の表紙`} size="md" />
            <h2 className="text-[15px] font-medium">{displayTitle}</h2>
          </div>
          <StatusBanner status={order.status} message={statusMessage} petId={petId} albumId={albumId} orderId={orderId} />
          <dl className="of-block grid gap-2.5 px-3.5 py-3 text-[13px]">
            <div className="flex justify-between"><dt className="text-[#8a7a74]">注文番号</dt><dd className="font-mono text-[12px]">{shortOrderId}</dd></div>
            <div className="flex justify-between"><dt className="text-[#8a7a74]">合計</dt><dd className="of-price">{formatPrice(order.total)}</dd></div>
          </dl>
        </div>
      )}
    </main>
  );
}

function PetIllustration() {
  return (
    <svg viewBox="0 0 120 80" className="h-[70px] w-[105px] shrink-0 text-[#b95d47]" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="42" cy="52" rx="24" ry="15" />
      <circle cx="32" cy="36" r="12" />
      <circle cx="24" cy="26" r="4" />
      <circle cx="38" cy="24" r="4" />
      <path d="M28 38h8" />
      <ellipse cx="86" cy="54" rx="18" ry="13" />
      <circle cx="90" cy="38" r="10" />
      <path d="M84 32c0-5 3-8 6-8M96 32c0-5-2-7-5-7" />
      <path d="M87 40h6M90 42v2" />
      <path d="M60 28c1.5-3 4.5-3 6 0-1.5.8-3 .8-6 0Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StatusBanner({
  status, message, petId, albumId, orderId,
}: { status: string; message: string; petId: string; albumId: string; orderId: string }) {
  if (status === "pending") {
    return (
      <div className="of-block px-4 py-4 text-center">
        <p className="text-[15px] font-medium">{message}</p>
        <p className="of-muted mt-2">お支払い完了後、このページが更新されます。</p>
        <a href={`/pets/${petId}/album/${albumId}/order/${orderId}`} className="of-link mt-3 justify-center">再読み込み</a>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="rounded-[12px] border border-danger/30 bg-danger-soft px-4 py-4 text-center">
        <p className="text-[15px] font-medium text-danger">{message}</p>
        <Link href={`/pets/${petId}/album/${albumId}/product`} className="mt-3 inline-flex min-h-11 items-center text-[13px] font-medium text-danger underline">再注文する</Link>
      </div>
    );
  }
  return (
    <div className="of-block px-4 py-4 text-center">
      <p className="text-[15px] font-medium">{message}</p>
      <Link href={`/pets/${petId}/album/${albumId}/product`} className="of-link mt-3 justify-center">注文内容へ戻る</Link>
    </div>
  );
}
