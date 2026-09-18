import Link from "next/link";
import { PhotobookCoverMock } from "./photobook-cover-mock";

export type OrderShippedInfo = {
  /** Carrier display name — omit when unknown */
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  /** Human-readable estimated delivery date */
  estimatedDelivery?: string | null;
};

type Props = {
  albumTitle: string;
  petName?: string | null;
  coverUrl?: string | null;
  shipping: OrderShippedInfo;
  homeHref?: string;
};

/**
 * PDF 08.4 発送完了 UI.
 * Presentational only — render when print_jobs.status is known to be shipped.
 * Missing fields are simply not shown (no placeholders).
 */
export function OrderShippedPanel({
  albumTitle,
  petName,
  coverUrl,
  shipping,
  homeHref = "/home",
}: Props) {
  const hasTrackingLink = Boolean(shipping.trackingUrl);
  const hasAnyDetail =
    Boolean(shipping.carrier) ||
    Boolean(shipping.trackingNumber) ||
    Boolean(shipping.estimatedDelivery);

  return (
    <section aria-labelledby="shipped-heading" className="grid gap-8">
      <header className="text-center">
        <p className="ds-editorial">SHIPPED</p>
        <h1 id="shipped-heading" className="mt-3 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          フォトブックを発送しました
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
          {petName
            ? `まもなく、${petName}の思い出がご自宅に届きます。`
            : "まもなく、大切な思い出がご自宅に届きます。"}
        </p>
      </header>

      <div className="flex flex-col items-center gap-4">
        <PhotobookCoverMock
          src={coverUrl}
          alt={`${albumTitle}の表紙`}
          size="hero"
          hardCover
        />
        <p className="max-w-xs text-center text-sm text-muted">
          {albumTitle}
        </p>
      </div>

      {hasAnyDetail ? (
        <div className="rounded-xl border border-border/80 bg-surface px-4 py-4 sm:px-5">
          {hasTrackingLink ? (
            <a
              href={shipping.trackingUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="ds-focus mb-4 flex min-h-11 items-center justify-between gap-3 border-b border-border/70 pb-3 text-sm font-medium text-brand-terracotta-strong"
            >
              <span>配送状況を確認</span>
              <span aria-hidden="true">→</span>
            </a>
          ) : (
            <p className="mb-4 border-b border-border/70 pb-3 text-sm font-medium">
              配送状況
            </p>
          )}

          <dl className="grid gap-3 text-sm">
            {shipping.carrier ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">配送会社</dt>
                <dd className="text-right font-medium">{shipping.carrier}</dd>
              </div>
            ) : null}
            {shipping.trackingNumber ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">お問い合わせ番号</dt>
                <dd className="text-right font-mono text-[13px]">
                  {shipping.trackingNumber}
                </dd>
              </div>
            ) : null}
            {shipping.estimatedDelivery ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">お届け予定日</dt>
                <dd className="text-right font-medium">{shipping.estimatedDelivery}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-4 text-xs text-muted">
            ※ 反映に時間がかかる場合があります。
          </p>
        </div>
      ) : null}

      <Link href={homeHref} className="app-button-primary w-full text-center">
        ホームに戻る
      </Link>
    </section>
  );
}
