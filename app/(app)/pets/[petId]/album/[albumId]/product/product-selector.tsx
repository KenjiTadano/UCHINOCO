"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PHOTOBOOK_PRODUCTS,
  calcPrice,
  formatPrice,
  getPageOptions,
} from "@/lib/photobook-products";
import { AlbumCoverCollage } from "../../_components/album-cover-collage";

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

  function handleProductChange(productId: string) {
    const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === productId);
    if (!product) return;
    setSelectedProductId(productId);
    setSelectedPages(product.basePages);
  }

  return (
    <main className="app-page">
      <Link className="app-back-link" href={`/pets/${petId}/album/${albumId}`}>
        アルバムへ戻る
      </Link>

      {/* Album header with cover preview */}
      <section>
        <AlbumCoverCollage urls={coverUrls} petName={petName} />
        <div className="mt-3 px-1">
          <p className="ds-editorial">PHOTOBOOK</p>
          <h1 className="mt-1 text-xl font-semibold">{albumTitle || "（タイトル未設定）"}</h1>
          <p className="ds-caption mt-0.5">{photoCount}枚の写真</p>
        </div>
      </section>

      {/* Product selection */}
      <section aria-labelledby="product-heading">
        <h2 id="product-heading" className="app-section-title mb-4">
          フォトブックを選ぶ
        </h2>

        <div
          role="radiogroup"
          aria-labelledby="product-heading"
          className="grid gap-3 lg:grid-cols-3"
        >
          {PHOTOBOOK_PRODUCTS.map((product) => {
            const isSelected = product.id === selectedProductId;
            return (
              <label
                key={product.id}
                className={`ds-focus relative flex cursor-pointer gap-4 rounded-2xl border-2 p-4 transition-colors lg:flex-col lg:gap-3 lg:p-5 ${
                  isSelected
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface hover:border-primary/40"
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

                {/* Book cover mockup — album photo with cover-type styling */}
                <div
                  className={`w-20 shrink-0 overflow-hidden rounded-sm lg:w-full ${
                    product.coverType === "hard"
                      ? "shadow-[2px_3px_0_0_rgba(0,0,0,0.12),4px_6px_6px_0_rgba(0,0,0,0.08)]"
                      : ""
                  }`}
                  aria-hidden="true"
                >
                  <div className="relative aspect-[3/4]">
                    {coverUrls[0] ? (
                      // Plain <img> — URL is already signed, no optimization needed
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverUrls[0]}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="size-full bg-surface-warm" />
                    )}
                    {/* Hard cover gloss tint */}
                    {product.coverType === "hard" && (
                      <div className="absolute inset-0 bg-black/[0.07]" aria-hidden="true" />
                    )}
                    {/* Book spine */}
                    <div
                      className={`absolute inset-y-0 left-0 ${
                        product.coverType === "hard"
                          ? "w-2.5 bg-black/[0.18]"
                          : "w-1.5 bg-black/[0.08]"
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {/* Product info */}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 lg:justify-start">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold leading-snug">{product.name}</p>
                    {isSelected && (
                      <span
                        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                        aria-label="選択中"
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{product.tagline}</p>
                  <div className="mt-0.5 space-y-0.5 text-xs text-muted">
                    <p>{product.size}</p>
                    <p>{product.coverTypeLabel}</p>
                    <p>{product.basePages}ページ〜</p>
                  </div>
                  <p className="mt-1 text-base font-semibold">
                    {formatPrice(product.basePrice)}
                    <span className="ml-0.5 text-xs font-normal text-muted">〜</span>
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Page count selection */}
      <section aria-labelledby="pages-heading">
        <h2 id="pages-heading" className="app-section-title mb-3">
          ページ数
        </h2>
        <p className="app-description mb-3">
          {selectedProduct.basePages}ページから
          {selectedProduct.maxPages}ページまで選べます。
          {selectedProduct.extraPagePrice > 0 && (
            <span>
              {" "}
              {formatPrice(selectedProduct.extraPagePrice)}/10ページ追加。
            </span>
          )}
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
                className={`ds-focus min-h-11 cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary-soft font-semibold text-primary"
                    : "border-border bg-surface hover:border-primary/40"
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
                <span>{pages}ページ</span>
                {extraCost > 0 && (
                  <span className="ml-1.5 text-xs text-muted">+{formatPrice(extraCost)}</span>
                )}
              </label>
            );
          })}
        </div>

        {/* Photo count advisory — informational only, no hard block */}
        {tooManyPhotos && (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning"
          >
            アルバムに{photoCount}枚の写真があります。{selectedPages}ページに対して写真が多めです。ページ数を増やすか、アルバムから写真を減らすことをおすすめします。
          </p>
        )}
      </section>

      {/* Price summary */}
      <section aria-labelledby="price-heading" className="app-card-flat">
        <h2 id="price-heading" className="mb-4 text-sm font-medium text-muted">
          注文内容
        </h2>
        <dl className="grid gap-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">商品</dt>
            <dd className="font-medium">{selectedProduct.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">サイズ</dt>
            <dd>{selectedProduct.size}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">カバー</dt>
            <dd>{selectedProduct.coverTypeLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">ページ数</dt>
            <dd>{selectedPages}ページ</dd>
          </div>
          <div className="mt-1 flex items-center justify-between border-t pt-3">
            <dt className="font-semibold">小計</dt>
            <dd aria-live="polite" className="text-xl font-semibold">
              {formatPrice(price)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          ※ 送料・消費税は次のステップで確認できます
        </p>
      </section>

      {/* CTA — go to checkout */}
      <Link
        href={`/pets/${petId}/album/${albumId}/checkout`}
        className="app-button-primary w-full text-center"
      >
        注文内容を確認する
      </Link>
    </main>
  );
}
