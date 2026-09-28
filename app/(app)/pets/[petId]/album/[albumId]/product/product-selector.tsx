"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PHOTOBOOK_PRODUCTS,
  calcPrice,
  formatPrice,
  getPageOptions,
} from "@/lib/photobook-products";
import { OrderFlowHeader } from "../../_components/order-flow-header";
import { OrderFlowSteps } from "../../_components/order-flow-steps";
import { PhotobookCoverMock } from "../../_components/photobook-cover-mock";

type Props = {
  petId: string;
  albumId: string;
  petName: string;
  albumTitle: string;
  photoCount: number;
  coverUrls: string[];
  printSnapshotId?: string | null;
};

/**
 * PDF p14 07.4 フォトブック商品選択 — 忠実再現
 * オプション（ギフト等）は現行ロジックに無いため非表示
 */
export function ProductSelector({
  petId,
  albumId,
  petName,
  albumTitle,
  photoCount,
  coverUrls,
  printSnapshotId = null,
}: Props) {
  const [selectedProductId, setSelectedProductId] = useState(PHOTOBOOK_PRODUCTS[0].id);
  const [selectedPages, setSelectedPages] = useState(PHOTOBOOK_PRODUCTS[0].basePages);
  /** PDF p14 options — UI only (not charged by Stripe yet) */
  const [giftWrap, setGiftWrap] = useState(true);
  const [messageCard, setMessageCard] = useState(false);

  const selectedProduct =
    PHOTOBOOK_PRODUCTS.find((p) => p.id === selectedProductId) ?? PHOTOBOOK_PRODUCTS[0];
  const pageOptions = getPageOptions(selectedProduct);
  const price = calcPrice(selectedProduct, selectedPages);
  const OPTION_GIFT = 500;
  const OPTION_MSG = 300;
  const optionsTotal = (giftWrap ? OPTION_GIFT : 0) + (messageCard ? OPTION_MSG : 0);
  const displayTotal = price + optionsTotal;
  const tooManyPhotos = photoCount > selectedPages;
  const coverSrc = coverUrls[0] ?? null;

  function handleProductChange(productId: string) {
    const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === productId);
    if (!product) return;
    setSelectedProductId(productId);
    setSelectedPages(product.basePages);
  }

  const snapshotQuery = printSnapshotId ? `&snapshot=${encodeURIComponent(printSnapshotId)}` : "";
  const checkoutHref = `/pets/${petId}/album/${albumId}/checkout?product=${selectedProductId}&pages=${selectedPages}${snapshotQuery}`;

  return (
    <main className="of-page">
      <OrderFlowHeader title="フォトブックを注文" backHref={`/pets/${petId}/album/${albumId}`} />
      <div className="of-step-wrap">
        <OrderFlowSteps current={1} />
      </div>

      <div className="of-body of-body-with-sticky">
        {/* Hero: angled book mock + copy — PDF p14 */}
        <section className="of-hero">
          <div className="of-hero-books" aria-hidden={coverSrc ? undefined : true}>
            <div className="of-hero-book of-hero-book-back">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverSrc} alt="" className="size-full object-cover" />
              ) : (
                <div className="size-full bg-[#e5d8d0]" />
              )}
            </div>
            <div className="of-hero-book of-hero-book-mid">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverSrc} alt="" className="size-full object-cover" />
              ) : (
                <div className="size-full bg-[#e5d8d0]" />
              )}
            </div>
            <div className="of-hero-book of-hero-book-front">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverSrc}
                  alt={`${petName}のフォトブック`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-[#e5d8d0] text-[10px] text-[#8a7a74]">
                  PHOTO
                </div>
              )}
            </div>
          </div>
          <div className="of-hero-copy">
            <p className="of-hero-lead">
              大切な思い出を、
              <br />
              ずっと手元に。
            </p>
            <p className="of-hero-sub">
              高品質なフォトブックで、
              <br />
              特別な時間をカタチに。
            </p>
          </div>
        </section>

        {/* 3-product comparison */}
        <section aria-labelledby="product-heading">
          <h2 id="product-heading" className="of-section-label">
            商品を選択
          </h2>
          <div
            role="radiogroup"
            aria-labelledby="product-heading"
            className="mt-2.5 grid grid-cols-3 gap-[7px]"
          >
            {PHOTOBOOK_PRODUCTS.map((product) => {
              const selected = product.id === selectedProductId;
              return (
                <label
                  key={product.id}
                  className={`of-product-card ${selected ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="product"
                    value={product.id}
                    checked={selected}
                    onChange={() => handleProductChange(product.id)}
                    className="sr-only"
                  />
                  {selected ? (
                    <span className="of-product-check" aria-label="選択中">
                      ✓
                    </span>
                  ) : null}
                  <PhotobookCoverMock src={coverSrc} alt="" size="xs" className="mx-auto" />
                  <p className="of-product-name">{product.name}</p>
                  <p className="of-product-tag">{product.tagline}</p>
                  <p className="of-product-price">{formatPrice(product.basePrice)}</p>
                  <p className="of-product-spec">
                    {product.size}
                    <br />
                    {product.basePages}ページ〜
                    <br />
                    {product.coverTypeLabel}
                  </p>
                </label>
              );
            })}
          </div>
        </section>

        {/* Page count — thin segment chips */}
        <section aria-labelledby="pages-heading">
          <h2 id="pages-heading" className="of-section-label">
            ページ数を選択
          </h2>
          <div
            role="radiogroup"
            aria-labelledby="pages-heading"
            className="mt-2.5 flex flex-wrap gap-2"
          >
            {pageOptions.map((pages) => {
              const selected = pages === selectedPages;
              const extra =
                pages > selectedProduct.basePages
                  ? calcPrice(selectedProduct, pages) - selectedProduct.basePrice
                  : 0;
              return (
                <label
                  key={pages}
                  className={`of-page-chip ${selected ? "is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="pages"
                    value={pages}
                    checked={selected}
                    onChange={() => setSelectedPages(pages)}
                    className="sr-only"
                  />
                  <span className="of-page-chip-mark" aria-hidden="true">
                    {selected ? "✓" : ""}
                  </span>
                  <span>
                    {pages}ページ
                    {extra > 0 ? (
                      <span className="of-page-chip-extra"> +{formatPrice(extra)}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          {tooManyPhotos ? (
            <p role="status" className="mt-2 text-[11px] leading-snug text-[#8a5a16]">
              アルバムに{photoCount}枚あります。{selectedPages}ページだと多めです。
            </p>
          ) : null}
        </section>

        {/* Options — PDF p14 structure (display only; Stripe未課金) */}
        <section aria-labelledby="options-heading">
          <h2 id="options-heading" className="of-section-label">
            オプション
          </h2>
          <ul className="mt-2.5 grid gap-2">
            <li>
              <label className="of-option-row">
                <input
                  type="checkbox"
                  checked={giftWrap}
                  onChange={(e) => setGiftWrap(e.target.checked)}
                  className="size-4 accent-[var(--of-accent)]"
                />
                <span aria-hidden="true" className="text-[12px] text-[var(--of-muted)]">□</span>
                <span className="flex-1 text-[13px]">ギフトラッピング</span>
                <span className="of-price text-[13px]">+{formatPrice(OPTION_GIFT)}</span>
              </label>
            </li>
            <li>
              <label className="of-option-row">
                <input
                  type="checkbox"
                  checked={messageCard}
                  onChange={(e) => setMessageCard(e.target.checked)}
                  className="size-4 accent-[var(--of-accent)]"
                />
                <span aria-hidden="true" className="text-[12px] text-[var(--of-muted)]">✉</span>
                <span className="flex-1 text-[13px]">メッセージカードをつける</span>
                <span className="of-price text-[13px]">+{formatPrice(OPTION_MSG)}</span>
              </label>
            </li>
          </ul>
        </section>

        <p className="sr-only">
          {albumTitle} / {photoCount}枚
        </p>
      </div>

      {/* Sticky footer — PDF p14 measured CTA h=51 */}
      <div className="of-sticky">
        <div className="of-sticky-total">
          <span>合計金額</span>
          <span className="text-right">
            <span className="of-price text-[20px]" aria-live="polite">
              {formatPrice(displayTotal)}
            </span>
            <span className="mt-0.5 block text-[10px] font-normal" style={{ color: "var(--of-muted)" }}>
              （税込・送料は次画面）
            </span>
          </span>
        </div>
        <Link href={checkoutHref} className="of-cta">
          注文内容を確認する →
        </Link>
      </div>
    </main>
  );
}
