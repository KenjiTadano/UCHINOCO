"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/photobook-products";
import { createCheckoutSession } from "./actions";
import {
  validateAddress,
  hasAddressErrors,
  EMPTY_ADDRESS,
  type ShippingAddress,
  type AddressErrors,
} from "@/lib/checkout-validation";
import { type ShippingOption } from "@/lib/photobook-shipping";
import { AlbumCoverCollage } from "../../_components/album-cover-collage";

// prettier-ignore
const PREFECTURES = [
  "北海道",
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

type Props = {
  petId: string;
  albumId: string;
  petName: string;
  albumTitle: string;
  coverUrls: string[];
  photoCount: number;
  productId: string;
  productName: string;
  productSize: string;
  coverTypeLabel: string;
  pages: number;
  subtotal: number;
  shippingOptions: ShippingOption[];
};

export function CheckoutForm({
  petId,
  albumId,
  petName,
  albumTitle,
  coverUrls,
  photoCount,
  productId,
  productName,
  productSize,
  coverTypeLabel,
  pages,
  subtotal,
  shippingOptions,
}: Props) {
  const [addr, setAddr] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const shipping = shippingOptions[0];
  const total = subtotal + shipping.price;
  const photosTooMany = photoCount > pages;

  function setField(field: keyof ShippingAddress, value: string) {
    setAddr((prev) => ({ ...prev, [field]: value }));
    // Clear per-field error as the user corrects input
    if (submitAttempted && field !== "address2") {
      const key = field as keyof AddressErrors;
      if (errors[key]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitAttempted(true);
    setActionError(null);

    const errs = validateAddress(addr);
    setErrors(errs);

    if (hasAddressErrors(errs)) {
      const firstField = Object.keys(errs)[0];
      document.getElementById(firstField)?.focus();
      return;
    }

    // Address is sent to the Server Action via FormData — never via URL (PII protection).
    const formData = new FormData();
    formData.set("lastName", addr.lastName);
    formData.set("firstName", addr.firstName);
    formData.set("postalCode", addr.postalCode);
    formData.set("prefecture", addr.prefecture);
    formData.set("city", addr.city);
    formData.set("address1", addr.address1);
    formData.set("address2", addr.address2);
    formData.set("phone", addr.phone);

    startTransition(async () => {
      const result = await createCheckoutSession(petId, albumId, productId, pages, formData);
      if (result?.error) {
        setActionError(result.error);
      }
      // On success, createCheckoutSession calls redirect() → navigation handled by Next.js
    });
  }

  /** Convenience: returns aria-invalid + aria-describedby for a validated field */
  function inputAria(field: keyof AddressErrors) {
    const err = errors[field];
    return {
      "aria-invalid": err ? ("true" as const) : undefined,
      "aria-describedby": err ? `${field}-error` : undefined,
    };
  }

  return (
    <main className="app-page">
      <Link
        className="app-back-link"
        href={`/pets/${petId}/album/${albumId}/product?product=${productId}&pages=${pages}`}
      >
        商品選択へ戻る
      </Link>

      {/* Album cover + header */}
      <section>
        <AlbumCoverCollage urls={coverUrls} petName={petName} />
        <div className="mt-3 px-1">
          <p className="ds-editorial">CHECKOUT</p>
          <h1 className="mt-1 text-xl font-semibold">{albumTitle || "（タイトル未設定）"}</h1>
        </div>
      </section>

      {/* Order summary */}
      <section aria-labelledby="order-heading" className="app-card-flat">
        <h2 id="order-heading" className="mb-4 text-sm font-medium text-muted">
          注文内容
        </h2>
        <dl className="grid gap-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">商品</dt>
            <dd className="font-medium">{productName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">サイズ</dt>
            <dd>{productSize}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">カバー</dt>
            <dd>{coverTypeLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">ページ数</dt>
            <dd>{pages}ページ</dd>
          </div>
          <div className="flex justify-between border-t pt-2.5">
            <dt className="text-muted">商品小計</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">送料（{shipping.name}）</dt>
            <dd>{formatPrice(shipping.price)}</dd>
          </div>
          <div className="flex items-center justify-between border-t pt-2.5">
            <dt className="font-semibold">合計</dt>
            <dd className="text-xl font-semibold">{formatPrice(total)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          ※ 参考価格です。実際の請求金額はご注文確定時にご確認ください。
        </p>
      </section>

      {/* Photo count — hard block at checkout (vs advisory in product selection) */}
      {photosTooMany && (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-4 text-sm"
        >
          <p className="font-medium text-danger">写真枚数がページ数を超えています</p>
          <p className="mt-1 text-sm text-danger/80">
            アルバムに {photoCount} 枚の写真があります。{pages}{" "}
            ページのプランには収まりきらない場合があります。写真を減らすか、ページ数の多いプランをお選びください。
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href={`/pets/${petId}/album/${albumId}`}
              className="ds-focus text-xs font-medium text-danger underline underline-offset-2"
            >
              写真を編集する
            </Link>
            <Link
              href={`/pets/${petId}/album/${albumId}/product`}
              className="ds-focus text-xs font-medium text-danger underline underline-offset-2"
            >
              プランを変更する
            </Link>
          </div>
        </div>
      )}

      {/* Shipping address form */}
      <form onSubmit={handleSubmit} noValidate className="grid gap-7">
        <fieldset className="grid gap-5">
          <legend className="app-section-title">配送先</legend>

          {/* Screen-reader validation status */}
          <p aria-live="polite" className="sr-only" role="status">
            {submitAttempted && hasAddressErrors(errors)
              ? `${Object.keys(errors).length}件の入力エラーがあります`
              : ""}
          </p>

          {/* 氏名 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="lastName" className="text-sm font-medium">
                姓 <span className="app-required">必須</span>
              </label>
              <input
                id="lastName"
                type="text"
                required
                autoComplete="family-name"
                value={addr.lastName}
                onChange={(e) => setField("lastName", e.target.value)}
                {...inputAria("lastName")}
                className="app-input"
                placeholder="山田"
              />
              {errors.lastName && (
                <p id="lastName-error" className="text-xs text-danger" role="alert">
                  {errors.lastName}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="firstName" className="text-sm font-medium">
                名 <span className="app-required">必須</span>
              </label>
              <input
                id="firstName"
                type="text"
                required
                autoComplete="given-name"
                value={addr.firstName}
                onChange={(e) => setField("firstName", e.target.value)}
                {...inputAria("firstName")}
                className="app-input"
                placeholder="太郎"
              />
              {errors.firstName && (
                <p id="firstName-error" className="text-xs text-danger" role="alert">
                  {errors.firstName}
                </p>
              )}
            </div>
          </div>

          {/* 郵便番号 */}
          <div className="grid gap-1.5">
            <label htmlFor="postalCode" className="text-sm font-medium">
              郵便番号 <span className="app-required">必須</span>
            </label>
            <input
              id="postalCode"
              type="text"
              required
              autoComplete="postal-code"
              inputMode="numeric"
              value={addr.postalCode}
              onChange={(e) => setField("postalCode", e.target.value)}
              {...inputAria("postalCode")}
              className="app-input max-w-44"
              placeholder="123-4567"
            />
            {errors.postalCode && (
              <p id="postalCode-error" className="text-xs text-danger" role="alert">
                {errors.postalCode}
              </p>
            )}
          </div>

          {/* 都道府県 */}
          <div className="grid gap-1.5">
            <label htmlFor="prefecture" className="text-sm font-medium">
              都道府県 <span className="app-required">必須</span>
            </label>
            <select
              id="prefecture"
              required
              autoComplete="address-level1"
              value={addr.prefecture}
              onChange={(e) => setField("prefecture", e.target.value)}
              {...inputAria("prefecture")}
              className="app-input max-w-52"
            >
              <option value="">選択してください</option>
              {PREFECTURES.map((pref) => (
                <option key={pref} value={pref}>
                  {pref}
                </option>
              ))}
            </select>
            {errors.prefecture && (
              <p id="prefecture-error" className="text-xs text-danger" role="alert">
                {errors.prefecture}
              </p>
            )}
          </div>

          {/* 市区町村 */}
          <div className="grid gap-1.5">
            <label htmlFor="city" className="text-sm font-medium">
              市区町村 <span className="app-required">必須</span>
            </label>
            <input
              id="city"
              type="text"
              required
              autoComplete="address-level2"
              value={addr.city}
              onChange={(e) => setField("city", e.target.value)}
              {...inputAria("city")}
              className="app-input"
              placeholder="渋谷区"
            />
            {errors.city && (
              <p id="city-error" className="text-xs text-danger" role="alert">
                {errors.city}
              </p>
            )}
          </div>

          {/* 番地 */}
          <div className="grid gap-1.5">
            <label htmlFor="address1" className="text-sm font-medium">
              番地 <span className="app-required">必須</span>
            </label>
            <input
              id="address1"
              type="text"
              required
              autoComplete="address-line1"
              value={addr.address1}
              onChange={(e) => setField("address1", e.target.value)}
              {...inputAria("address1")}
              className="app-input"
              placeholder="道玄坂1-2-3"
            />
            {errors.address1 && (
              <p id="address1-error" className="text-xs text-danger" role="alert">
                {errors.address1}
              </p>
            )}
          </div>

          {/* 建物名（任意） */}
          <div className="grid gap-1.5">
            <label htmlFor="address2" className="text-sm font-medium">
              建物名・部屋番号{" "}
              <span className="app-optional">任意</span>
            </label>
            <input
              id="address2"
              type="text"
              autoComplete="address-line2"
              value={addr.address2}
              onChange={(e) => setField("address2", e.target.value)}
              className="app-input"
              placeholder="UCHINOCOビル 202号室"
            />
          </div>

          {/* 電話番号 */}
          <div className="grid gap-1.5">
            <label htmlFor="phone" className="text-sm font-medium">
              電話番号 <span className="app-required">必須</span>
            </label>
            <input
              id="phone"
              type="tel"
              required
              autoComplete="tel"
              value={addr.phone}
              onChange={(e) => setField("phone", e.target.value)}
              {...inputAria("phone")}
              className="app-input"
              placeholder="090-1234-5678"
            />
            {errors.phone && (
              <p id="phone-error" className="text-xs text-danger" role="alert">
                {errors.phone}
              </p>
            )}
          </div>
        </fieldset>

        {/* 配送方法 */}
        <section aria-labelledby="shipping-heading">
          <h2 id="shipping-heading" className="app-section-title mb-3">
            配送方法
          </h2>
          <div className="app-card-flat">
            <p className="text-sm font-semibold">{shipping.name}</p>
            <p className="ds-caption mt-0.5">{shipping.description}</p>
            <p className="ds-caption">{shipping.estimatedDays}</p>
            <p className="mt-2 text-sm font-semibold">{formatPrice(shipping.price)}</p>
          </div>
        </section>

        {/* CTA */}
        <div className="grid gap-2">
          {actionError && (
            <p role="alert" className="app-error text-sm">
              {actionError}
            </p>
          )}
          <button
            type="submit"
            disabled={photosTooMany || isPending}
            className="app-button-primary w-full"
          >
            {isPending ? "処理中…" : "支払いへ進む"}
          </button>
          {photosTooMany ? (
            <p className="text-center text-sm text-danger">
              写真枚数を調整してからご注文ください。
            </p>
          ) : (
            <p className="text-center text-xs text-muted">
              次の画面でStripeの決済画面へ移動します
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
