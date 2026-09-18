"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PHOTOBOOK_PRODUCTS,
  calcPrice,
  formatPrice,
  getPageOptions,
} from "@/lib/photobook-products";
import { OrderFlowSteps } from "../../_components/order-flow-steps";
import { PhotobookCoverMock } from "../../_components/photobook-cover-mock";

type Props = {
  petId: string;
  albumId: string;
  petName: string;
  albumTitle: string;
  photoCount: number;
  coverUrls: string[];
};

export function ProductSelector({
  petId,
  albumId,
  petName,
  albumTitle,
  photoCount,
  coverUrls,
}: Props) {
  const [selectedProductId, setSelectedProductId] = useState(PHOTOBOOK_PRODUCTS[0].id);
  const [selectedPages, setSelectedPages] = useState(PHOTOBOOK_PRODUCTS[0].basePages);

  const selectedProduct =
    PHOTOBOOK_PRODUCTS.find((p) => p.id === selectedProductId) ?? PHOTOBOOK_PRODUCTS[0];
  const pageOptions = getPageOptions(selectedProduct);
  const price = calcPrice(selectedProduct, selectedPages);
  const tooManyPhotos = photoCount > selectedPages;
  const coverSrc = coverUrls[0] ?? null;

  function handleProductChange(productId: string) {
    const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === productId);
    if (!product) return;
    setSelectedProductId(productId);
    setSelectedPages(product.basePages);
  }

  return (
    <main className="app-page-order">
      <div className="flex items-center gap-3">
        <Link
          className="app-back-link shrink-0"
          href={`/pets/${petId}/album/${albumId}`}
        >
          戻る
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold tracking-tight">
          フォトブックを注文
        </h1>
        <span className="w-10 shrink-0" aria-hidden="true" />
      </div>

      <OrderFlowSteps current={1} />

      {/* Hero: completed photobook visual */}
      <section
        aria-labelledby="product-hero-heading"
        className="grid gap-5 rounded-xl bg-surface-warm/70 px-4 py-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:px-8 sm:py-8"
      >
        <div className="flex justify-center">
          <PhotobookCoverMock
            src={coverSrc}
            alt={`${albumTitle || petName}のフォトブック`}
            size="hero"
            hardCover={selectedProduct.coverType === "hard"}
            priority
          />
        </div>
        <div className="text-center sm:text-left">
          <p className="ds-editorial">PHOTOBOOK</p>
          <h2 id="product-hero-heading" className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {albumTitle || "（タイトル未設定）"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            大切な思い出を、ずっと手元に。高品質なフォトブックで、特別な時間をカタチに。
          </p>
          <p className="ds-caption mt-3">
            {petName}　・　{photoCount}枚の写真
          </p>
        </div>
      </section>

      {/* Product comparison */}
      <section aria-labelledby="product-heading">
        <h2 id="product-heading" className="mb-5 text-base font-semibold tracking-tight">
          商品を選択
        </h2>

        <div
          role="radiogroup"
          aria-labelledby="product-heading"
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          {PHOTOBOOK_PRODUCTS.map((product) => {
            const isSelected = product.id === selectedProductId;
            return (
              <label
                key={product.id}
                className={`ds-focus relative flex cursor-pointer flex-col gap-2 rounded-lg border px-2 py-3 transition-colors sm:gap-3 sm:px-3 sm:py-4 ${
                  isSelected
                    ? "border-brand-terracotta bg-surface"
                    : "border-border/80 bg-surface hover:border-brand-terracotta/40"
                }`}
              >
                <input
                  type="radio"
                  name="product"
                  value={product.id}
                  checked={isSelected}
                  onChange={() => handleProductChange(product.id)}
                  className="sr-only"
                />

                {isSelected ? (
                  <span
                    className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-brand-terracotta text-[10px] font-semibold text-white"
                    aria-label="選択中"
                  >
                    ✓
                  </span>
                ) : null}

                <div className="mx-auto" aria-hidden="true">
                  <PhotobookCoverMock
                    src={coverSrc}
                    alt=""
                    size="sm"
                    hardCover={product.coverType === "hard"}
                  />
                </div>

                <div className="grid gap-1 text-center">
                  <p className="text-[13px] font-semibold leading-snug sm:text-sm">
                    {product.name}
                  </p>
                  <p className="line-clamp-2 text-[10px] leading-snug text-muted sm:text-[11px]">
                    {product.tagline}
                  </p>
                  <p className="app-price-accent mt-1 text-sm sm:text-base">
                    {formatPrice(product.basePrice)}
                    <span className="ml-0.5 text-[10px] font-normal text-muted">〜</span>
                  </p>
                  <div className="mt-1 space-y-0.5 text-[10px] leading-snug text-muted sm:text-[11px]">
                    <p>{product.size}</p>
                    <p>
                      {product.basePages}ページ〜 / {product.coverTypeLabel}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Page count */}
      <section aria-labelledby="pages-heading">
        <h2 id="pages-heading" className="mb-3 text-base font-semibold tracking-tight">
          ページ数を選択
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          {selectedProduct.basePages}ページから{selectedProduct.maxPages}ページまで選べます。
          {selectedProduct.extraPagePrice > 0 ? (
            <span>
              {" "}
              {formatPrice(selectedProduct.extraPagePrice)}/10ページ追加。
            </span>
          ) : null}
        </p>

        <div
          role="radiogroup"
          aria-labelledby="pages-heading"
          className="flex flex-wrap gap-2"
        >
          {pageOptions.map((pages) => {
            const isSelected = pages === selectedPages;
            const extraCost =
              pages > selectedProduct.basePages
                ? calcPrice(selectedProduct, pages) - selectedProduct.basePrice
                : 0;
            return (
              <label
                key={pages}
                className={`ds-focus inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${
                  isSelected
                    ? "border-brand-terracotta bg-brand-terracotta-soft font-medium text-brand-terracotta-strong"
                    : "border-border bg-surface hover:border-brand-terracotta/40"
                }`}
              >
                <input
                  type="radio"
                  name="pages"
                  value={pages}
                  checked={isSelected}
                  onChange={() => setSelectedPages(pages)}
                  className="sr-only"
                />
                {isSelected ? (
                  <span aria-hidden="true" className="text-xs">
                    ✓
                  </span>
                ) : null}
                <span>{pages}ページ</span>
                {extraCost > 0 ? (
                  <span className="text-xs text-muted">+{formatPrice(extraCost)}</span>
                ) : null}
              </label>
            );
          })}
        </div>

        {tooManyPhotos ? (
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning"
          >
            アルバムに{photoCount}枚の写真があります。{selectedPages}
            ページに対して写真が多めです。ページ数を増やすか、アルバムから写真を減らすことをおすすめします。
          </p>
        ) : null}
      </section>

      {/* Summary + CTA */}
      <section aria-labelledby="price-heading" className="grid gap-5 pt-2">
        <div className="app-order-divider" />
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="price-heading" className="text-sm text-muted">
              合計金額
            </h2>
            <p className="ds-caption mt-1">
              {selectedProduct.name}　・　{selectedPages}ページ
            </p>
          </div>
          <div className="text-right">
            <p aria-live="polite" className="app-price-accent text-2xl">
              {formatPrice(price)}
            </p>
            <p className="ds-caption mt-0.5">税込・送料は次の画面で確認</p>
          </div>
        </div>

        <Link
          href={`/pets/${petId}/album/${albumId}/checkout?product=${selectedProductId}&pages=${selectedPages}`}
          className="app-button-primary w-full text-center"
        >
          注文内容を確認する
        </Link>
      </section>
    </main>
  );
}
