import Link from "next/link";
import { PhotobookCoverMock } from "./photobook-cover-mock";

export type OrderShippedInfo = {
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: string | null;
};

type Props = {
  albumTitle: string;
  petName?: string | null;
  coverUrl?: string | null;
  shipping: OrderShippedInfo;
  homeHref?: string;
};

/** PDF p18 発送完了 — SNS未実装のため非表示。データがある項目のみ表示 */
export function OrderShippedPanel({
  albumTitle,
  petName,
  coverUrl,
  shipping,
  homeHref = "/home",
}: Props) {
  const hasDetail =
    Boolean(shipping.carrier) ||
    Boolean(shipping.trackingNumber) ||
    Boolean(shipping.estimatedDelivery);

  return (
    <div className="of-body gap-5">
      <div className="text-center">
        <h2 className="text-[20px] font-medium leading-snug tracking-tight text-[#3a2f2b]">
          フォトブックを発送しました！
        </h2>
        <p className="of-muted mt-2">
          {petName
            ? `まもなく、${petName}の思い出がご自宅に届きます。`
            : "まもなく、大切な思い出がご自宅に届きます。"}
        </p>
      </div>

      <div className="relative flex flex-col items-center py-3">
        <div className="pointer-events-none absolute inset-x-8 top-2 bottom-2 rounded-full bg-[#efe6df]/80 blur-2xl" aria-hidden="true" />
        <PhotobookCoverMock src={coverUrl} alt={`${albumTitle}の表紙`} size="lg" priority />
        <p className="relative mt-3 rounded-full border border-[#b95d47]/45 bg-white px-3 py-1 text-[11px] text-[#b95d47]">
          たくさんの思い出をありがとう！
        </p>
      </div>

      {hasDetail ? (
        <section className="of-block overflow-hidden" aria-labelledby="ship-status-heading">
          {shipping.trackingUrl ? (
            <a
              href={shipping.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-between gap-2 border-b border-[#eadfd8] px-4 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#91412f]"
            >
              <span id="ship-status-heading">配送状況を確認</span>
              <span aria-hidden="true">›</span>
            </a>
          ) : (
            <p id="ship-status-heading" className="border-b border-[#eadfd8] px-4 py-3 text-[13px] font-medium">
              配送状況
            </p>
          )}
          <dl className="divide-y divide-[#eadfd8] px-4 text-[13px]">
            {shipping.carrier ? (
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-[#8a7a74]">配送会社</dt>
                <dd>{shipping.carrier}</dd>
              </div>
            ) : null}
            {shipping.trackingNumber ? (
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-[#8a7a74]">お問い合わせ番号</dt>
                <dd className="font-mono text-[12px]">{shipping.trackingNumber}</dd>
              </div>
            ) : null}
            {shipping.estimatedDelivery ? (
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-[#8a7a74]">お届け予定日</dt>
                <dd>{shipping.estimatedDelivery}</dd>
              </div>
            ) : null}
          </dl>
          <p className="of-muted px-4 pb-3">※ 反映に時間がかかる場合があります。</p>
        </section>
      ) : null}

      <Link href={homeHref} className="of-cta">
        ホームに戻る
      </Link>
    </div>
  );
}
