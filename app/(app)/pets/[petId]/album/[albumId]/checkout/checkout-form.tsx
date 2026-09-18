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
import { OrderFlowSteps } from "../../_components/order-flow-steps";
import { PhotobookCoverMock } from "../../_components/photobook-cover-mock";

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
  showCancelMessage?: boolean;
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
  showCancelMessage = false,
}: Props) {
  const [addr, setAddr] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const shipping = shippingOptions[0];
  const total = subtotal + shipping.price;
  const photosTooMany = photoCount > pages;
  const coverSrc = coverUrls[0] ?? null;
  const displayTitle = albumTitle || "（タイトル未設定）";

  function setField(field: keyof ShippingAddress, value: string) {
    setAddr((prev) => ({ ...prev, [field]: value }));
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

  function inputAria(field: keyof AddressErrors) {
    const err = errors[field];
    return {
      "aria-invalid": err ? ("true" as const) : undefined,
      "aria-describedby": err ? `${field}-error` : undefined,
    };
  }

  return (
    <main className="app-page-order">
      <div className="flex items-center gap-3">
        <Link
          className="app-back-link shrink-0"
          href={`/pets/${petId}/album/${albumId}/product?product=${productId}&pages=${pages}`}
        >
          戻る
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold tracking-tight">
          注文内容の確認
        </h1>
        <span className="w-10 shrink-0" aria-hidden="true" />
      </div>

      <OrderFlowSteps current={2} />

      {showCancelMessage ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-surface px-4 py-3 text-sm"
        >
          お支払いは完了していません。配送先を確認のうえ、再度「支払いへ進む」からお進みください。
        </div>
      ) : null}

      {/* Product summary — PDF 08.1 */}
      <section
        aria-labelledby="order-product-heading"
        className="grid gap-5 rounded-xl bg-surface-warm/70 px-4 py-5 sm:grid-cols-[auto_1fr] sm:gap-6 sm:px-6 sm:py-6"
      >
        <div className="flex justify-center sm:justify-start">
          <PhotobookCoverMock
            src={coverSrc}
            alt={`${displayTitle}の表紙`}
            size="lg"
            hardCover
          />
        </div>
        <div className="min-w-0">
          <p className="ds-caption">{petName}</p>
          <h2 id="order-product-heading" className="mt-1 text-lg font-semibold tracking-tight">
            {displayTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            大切な思い出が詰まった1冊をお届けします。
          </p>
          <ul className="mt-4 grid gap-2 text-sm">
            <li className="flex gap-2">
              <span className="w-16 shrink-0 text-muted">商品</span>
              <span className="font-medium">{productName}</span>
            </li>
            <li className="flex gap-2">
              <span className="w-16 shrink-0 text-muted">ページ</span>
              <span>{pages}ページ</span>
            </li>
            <li className="flex gap-2">
              <span className="w-16 shrink-0 text-muted">サイズ</span>
              <span>{productSize}</span>
            </li>
            <li className="flex gap-2">
              <span className="w-16 shrink-0 text-muted">カバー</span>
              <span>{coverTypeLabel}</span>
            </li>
          </ul>
          <Link
            href={`/pets/${petId}/album/${albumId}/product?product=${productId}&pages=${pages}`}
            className="ds-focus mt-4 inline-flex min-h-11 items-center text-sm font-medium text-brand-terracotta-strong"
          >
            仕様を変更する →
          </Link>
        </div>
      </section>

      {photosTooMany ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-4 text-sm"
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
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="grid gap-9">
        {/* Shipping address — editorial grouping, not admin form dump */}
        <fieldset className="grid gap-5">
          <legend className="text-base font-semibold tracking-tight">お届け先</legend>
          <p className="text-sm leading-relaxed text-muted -mt-2">
            フォトブックをお届けする住所をご入力ください。
          </p>

          <p aria-live="polite" className="sr-only" role="status">
            {submitAttempted && hasAddressErrors(errors)
              ? `${Object.keys(errors).length}件の入力エラーがあります`
              : ""}
          </p>

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
              {errors.lastName ? (
                <p id="lastName-error" className="text-xs text-danger" role="alert">
                  {errors.lastName}
                </p>
              ) : null}
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
              {errors.firstName ? (
                <p id="firstName-error" className="text-xs text-danger" role="alert">
                  {errors.firstName}
                </p>
              ) : null}
            </div>
          </div>

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
            {errors.postalCode ? (
              <p id="postalCode-error" className="text-xs text-danger" role="alert">
                {errors.postalCode}
              </p>
            ) : null}
          </div>

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
            {errors.prefecture ? (
              <p id="prefecture-error" className="text-xs text-danger" role="alert">
                {errors.prefecture}
              </p>
            ) : null}
          </div>

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
            {errors.city ? (
              <p id="city-error" className="text-xs text-danger" role="alert">
                {errors.city}
              </p>
            ) : null}
          </div>

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
            {errors.address1 ? (
              <p id="address1-error" className="text-xs text-danger" role="alert">
                {errors.address1}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="address2" className="text-sm font-medium">
              建物名・部屋番号 <span className="app-optional">任意</span>
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
            {errors.phone ? (
              <p id="phone-error" className="text-xs text-danger" role="alert">
                {errors.phone}
              </p>
            ) : null}
          </div>
        </fieldset>

        {/* Shipping method */}
        <section aria-labelledby="shipping-heading">
          <h2 id="shipping-heading" className="mb-3 text-base font-semibold tracking-tight">
            配送方法
          </h2>
          <div className="rounded-lg border border-border/80 bg-surface px-4 py-4">
            <p className="text-sm font-medium">{shipping.name}</p>
            <p className="ds-caption mt-1">{shipping.description}</p>
            <p className="ds-caption">{shipping.estimatedDays}</p>
            <p className="mt-2 text-sm font-semibold">{formatPrice(shipping.price)}</p>
          </div>
        </section>

        {/* Payment — PDF 08.2 feel without replacing Stripe Checkout */}
        <section aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="mb-3 text-base font-semibold tracking-tight">
            お支払い方法
          </h2>
          <div className="rounded-lg border border-brand-terracotta/40 bg-surface px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">クレジットカード</p>
                <p className="ds-caption mt-1">
                  次の画面の Stripe Checkout で安全にお支払いいただけます。
                </p>
              </div>
              <span
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-[5px] border-brand-terracotta bg-surface"
                aria-hidden="true"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Apple Pay / Google Pay など、ご利用可能な決済手段は Stripe 画面で選択できます。
          </p>
        </section>

        {/* Amount breakdown */}
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="mb-4 text-base font-semibold tracking-tight">
            注文概要
          </h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">フォトブック（{productName}）</dt>
              <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">送料（{shipping.name}）</dt>
              <dd className="tabular-nums">{formatPrice(shipping.price)}</dd>
            </div>
            <div className="app-order-divider" />
            <div className="flex items-end justify-between gap-4 pt-1">
              <dt className="text-sm text-muted">合計金額</dt>
              <dd className="text-right">
                <span className="app-price-accent text-2xl">{formatPrice(total)}</span>
                <span className="mt-0.5 block text-xs text-muted">税込</span>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            ※ 参考価格です。実際の請求金額はご注文確定時にご確認ください。
          </p>
        </section>

        <div className="grid gap-3">
          <p aria-live="polite" className="sr-only">
            {isPending ? "Stripeの決済画面へ移動しています" : ""}
          </p>
          {actionError ? (
            <p role="alert" className="app-error text-sm">
              {actionError}
            </p>
          ) : null}
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
            <p className="text-center text-xs leading-relaxed text-muted">
              次の画面で Stripe の決済画面へ移動します。
              <br />
              注文することで、利用規約に同意したものとみなされます。
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
