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
import { OrderFlowHeader } from "../../_components/order-flow-header";
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

type CheckoutView = "confirm" | "pay";

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
  printSnapshotId?: string | null;
  spreadCount?: number | null;
  previewHref?: string;
};

/**
 * PDF p15 08.1 + p16 08.2
 * confirm → pay の2画面。Stripe Checkout Session は維持。
 */
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
  printSnapshotId = null,
  spreadCount = null,
  previewHref,
}: Props) {
  const [view, setView] = useState<CheckoutView>("confirm");
  const [addr, setAddr] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [editingAddress, setEditingAddress] = useState(true);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [payMethod, setPayMethod] = useState<"card" | "apple" | "google" | "paidy">("card");

  const shipping = shippingOptions[0];
  const total = subtotal + shipping.price;
  const photosTooMany = photoCount > pages;
  const coverSrc = coverUrls[0] ?? null;
  const displayTitle = albumTitle || "（タイトル未設定）";
  const productBack = `/pets/${petId}/album/${albumId}/product?product=${productId}&pages=${pages}${printSnapshotId ? `&snapshot=${printSnapshotId}` : ""}`;
  const addressReady = !hasAddressErrors(validateAddress(addr)) && !editingAddress;

  function setField(field: keyof ShippingAddress, value: string) {
    setAddr((prev) => ({ ...prev, [field]: value }));
    if (submitAttempted && field !== "address2" && errors[field as keyof AddressErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof AddressErrors];
        return next;
      });
    }
  }

  function saveAddress(): boolean {
    setSubmitAttempted(true);
    const errs = validateAddress(addr);
    setErrors(errs);
    if (hasAddressErrors(errs)) {
      document.getElementById(Object.keys(errs)[0])?.focus();
      return false;
    }
    setEditingAddress(false);
    return true;
  }

  function goToPayment() {
    const errs = validateAddress(addr);
    if (hasAddressErrors(errs)) {
      setEditingAddress(true);
      setSubmitAttempted(true);
      setErrors(errs);
      document.getElementById(Object.keys(errs)[0])?.focus();
      return;
    }
    setEditingAddress(false);
    setView("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePay() {
    setActionError(null);
    const errs = validateAddress(addr);
    if (hasAddressErrors(errs)) {
      setView("confirm");
      setEditingAddress(true);
      setErrors(errs);
      return;
    }
    const formData = new FormData();
    formData.set("lastName", addr.lastName);
    formData.set("firstName", addr.firstName);
    formData.set("postalCode", addr.postalCode);
    formData.set("prefecture", addr.prefecture);
    formData.set("city", addr.city);
    formData.set("address1", addr.address1);
    formData.set("address2", addr.address2);
    formData.set("phone", addr.phone);
    if (printSnapshotId) formData.set("printSnapshotId", printSnapshotId);

    startTransition(async () => {
      const result = await createCheckoutSession(petId, albumId, productId, pages, formData);
      if (result?.error) setActionError(result.error);
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
    <main className="of-page">
      <OrderFlowHeader
        title={view === "confirm" ? "注文内容の確認" : "お支払い"}
        backHref={view === "confirm" ? productBack : undefined}
        onBack={view === "pay" ? () => setView("confirm") : undefined}
        backLabel={view === "pay" ? "確認へ戻る" : "商品選択へ戻る"}
      />
      <div className="of-step-wrap">
        <OrderFlowSteps current={2} />
      </div>

      <div className="of-body gap-4">
        {showCancelMessage ? (
          <div role="status" className="of-block px-3 py-2.5 text-[12px] text-[#5c4d47]">
            お支払いは完了していません。内容を確認のうえ、再度お進みください。
          </div>
        ) : null}

        {photosTooMany ? (
          <div role="alert" className="rounded-[12px] border border-danger/30 bg-danger-soft px-3 py-3 text-[12px] text-danger">
            <p className="font-medium">写真枚数がページ数を超えています</p>
            <div className="mt-2 flex gap-3">
              <Link href={`/pets/${petId}/album/${albumId}`} className="underline">写真を編集</Link>
              <Link href={productBack} className="underline">プランを変更</Link>
            </div>
          </div>
        ) : null}

        {view === "confirm" ? (
          <>
            {/* Product — PDF p15 */}
            <section className="of-block-warm grid grid-cols-[88px_1fr] gap-3 p-3.5">
              <PhotobookCoverMock src={coverSrc} alt={`${displayTitle}の表紙`} size="md" />
              <div className="min-w-0">
                <p className="text-[10px] text-[#8a7a74]">{petName}</p>
                <h2 className="mt-0.5 text-[13px] font-semibold leading-snug">{displayTitle}</h2>
                <p className="mt-1 text-[10px] leading-relaxed text-[#8a7a74]">
                  大切な思い出が詰まった1冊をお届けします。
                </p>
                <ul className="mt-2 space-y-1 text-[11px] text-[#5c4d47]">
                  <li className="flex gap-1.5"><span className="text-[#b95d47]" aria-hidden="true">▣</span>{productName}</li>
                  <li className="flex gap-1.5"><span className="text-[#b95d47]" aria-hidden="true">▤</span>{pages}ページ</li>
                  <li className="flex gap-1.5"><span className="text-[#b95d47]" aria-hidden="true">▢</span>{productSize}</li>
                  <li className="flex gap-1.5"><span className="text-[#b95d47]" aria-hidden="true">▭</span>{coverTypeLabel}</li>
                  <li className="flex gap-1.5"><span className="text-[#b95d47]" aria-hidden="true">#</span>数量 1</li>
                  {spreadCount != null ? (
                    <li className="flex gap-1.5" data-testid="checkout-spread-count">
                      <span className="text-[#b95d47]" aria-hidden="true">▦</span>見開き {spreadCount}
                    </li>
                  ) : null}
                </ul>
                {previewHref ? (
                  <Link href={previewHref} className="of-link mt-1 inline-block underline" data-testid="checkout-preview-link">
                    最終プレビューを見る
                  </Link>
                ) : null}
                <div className="mt-1.5 flex justify-end">
                  <Link href={productBack} className="of-link underline">仕様を変更する ›</Link>
                </div>
              </div>
            </section>

            {/* Shipping */}
            <section>
              <h2 className="of-section-label mb-2">お届け先</h2>
              {addressReady ? (
                <div className="of-block px-3.5 py-3">
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f4ece6] text-[13px]" aria-hidden="true">⌂</span>
                    <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                      <p className="font-medium">{addr.lastName} {addr.firstName}</p>
                      <p className="of-muted mt-0.5">
                        〒{addr.postalCode}<br />
                        {addr.prefecture}{addr.city}{addr.address1}
                        {addr.address2 ? ` ${addr.address2}` : ""}
                      </p>
                    </div>
                    <button type="button" className="of-link shrink-0 self-start" onClick={() => setEditingAddress(true)}>変更</button>
                  </div>
                </div>
              ) : (
                <div className="of-block grid gap-2.5 p-3.5">
                  <div className="grid grid-cols-2 gap-2">
                    <AddrField id="lastName" label="姓" error={errors.lastName}>
                      <input id="lastName" className="app-input" autoComplete="family-name" value={addr.lastName} onChange={(e) => setField("lastName", e.target.value)} {...inputAria("lastName")} placeholder="山田" />
                    </AddrField>
                    <AddrField id="firstName" label="名" error={errors.firstName}>
                      <input id="firstName" className="app-input" autoComplete="given-name" value={addr.firstName} onChange={(e) => setField("firstName", e.target.value)} {...inputAria("firstName")} placeholder="太郎" />
                    </AddrField>
                  </div>
                  <AddrField id="postalCode" label="郵便番号" error={errors.postalCode}>
                    <input id="postalCode" className="app-input max-w-[10rem]" autoComplete="postal-code" inputMode="numeric" value={addr.postalCode} onChange={(e) => setField("postalCode", e.target.value)} {...inputAria("postalCode")} placeholder="123-4567" />
                  </AddrField>
                  <AddrField id="prefecture" label="都道府県" error={errors.prefecture}>
                    <select id="prefecture" className="app-input max-w-[12rem]" autoComplete="address-level1" value={addr.prefecture} onChange={(e) => setField("prefecture", e.target.value)} {...inputAria("prefecture")}>
                      <option value="">選択してください</option>
                      {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </AddrField>
                  <AddrField id="city" label="市区町村" error={errors.city}>
                    <input id="city" className="app-input" autoComplete="address-level2" value={addr.city} onChange={(e) => setField("city", e.target.value)} {...inputAria("city")} placeholder="渋谷区" />
                  </AddrField>
                  <AddrField id="address1" label="番地" error={errors.address1}>
                    <input id="address1" className="app-input" autoComplete="address-line1" value={addr.address1} onChange={(e) => setField("address1", e.target.value)} {...inputAria("address1")} placeholder="道玄坂1-2-3" />
                  </AddrField>
                  <AddrField id="address2" label="建物名" optional>
                    <input id="address2" className="app-input" autoComplete="address-line2" value={addr.address2} onChange={(e) => setField("address2", e.target.value)} placeholder="202号室" />
                  </AddrField>
                  <AddrField id="phone" label="電話番号" error={errors.phone}>
                    <input id="phone" type="tel" className="app-input" autoComplete="tel" value={addr.phone} onChange={(e) => setField("phone", e.target.value)} {...inputAria("phone")} placeholder="090-1234-5678" />
                  </AddrField>
                  <button type="button" className="of-cta-outline mt-1" onClick={() => saveAddress()}>
                    お届け先を確定する
                  </button>
                </div>
              )}
            </section>

            {/* Payment preview — Stripe */}
            <section>
              <h2 className="of-section-label mb-2">お支払い方法</h2>
              <div className="of-block px-3.5 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f4ece6] text-[10px] font-medium" aria-hidden="true">CARD</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">クレジットカード</p>
                    <p className="of-muted mt-0.5">Stripeで安全にお支払い</p>
                  </div>
                  <button type="button" className="of-link shrink-0" onClick={goToPayment}>変更</button>
                </div>
              </div>
            </section>

            {/* Amount */}
            <section>
              <h2 className="of-section-label mb-2">注文概要</h2>
              <div className="of-block px-3.5 py-3">
                <dl className="grid gap-2.5 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a7a74]">フォトブック（{productName}）</dt>
                    <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a7a74]">送料（{shipping.name}）</dt>
                    <dd className="tabular-nums">{formatPrice(shipping.price)}</dd>
                  </div>
                  <div className="of-divider" />
                  <div className="flex items-end justify-between gap-3">
                    <dt>合計金額</dt>
                    <dd className="text-right">
                      <span className="of-price text-[22px]">{formatPrice(total)}</span>
                      <span className="mt-0.5 block text-[10px] text-[#8a7a74]">（税込）</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            <div className="grid gap-2 pt-1">
              <button type="button" className="of-cta" disabled={photosTooMany} onClick={goToPayment}>
                注文を確定する →
              </button>
              <p className="text-center text-[10px] leading-relaxed text-[#8a7a74]">
                注文することで、
                <Link href="/terms" className="underline">利用規約</Link>
                に同意したものとみなされます。
              </p>
            </div>
          </>
        ) : (
          <>
            {/* PDF p16 payment methods */}
            <section>
              <h2 className="of-section-label mb-2">お支払い方法</h2>
              <div className="of-block overflow-hidden" role="radiogroup" aria-label="お支払い方法">
                {(
                  [
                    { id: "card" as const, label: "クレジットカード", note: "Stripe Checkout でカード情報を入力" },
                    { id: "apple" as const, label: "Apple Pay", note: "Stripe画面で選択できます" },
                    { id: "google" as const, label: "Google Pay", note: "Stripe画面で選択できます" },
                    { id: "paidy" as const, label: "あと払い (Paidy)", note: "ご利用可能な場合 Stripe で表示" },
                  ] as const
                ).map((m, i) => (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-[#eadfd8]" : ""} ${payMethod === m.id ? "bg-[#fdfbfa]" : ""}`}
                  >
                    <input
                      type="radio"
                      name="payMethod"
                      value={m.id}
                      checked={payMethod === m.id}
                      onChange={() => setPayMethod(m.id)}
                      className="mt-1 size-4 accent-[#b95d47]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">{m.label}</span>
                        {m.id === "card" && payMethod === "card" ? (
                          <span className="text-[11px] text-[#b95d47]">選択中</span>
                        ) : null}
                      </span>
                      <span className="of-muted mt-0.5 block">{m.note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h2 className="of-section-label mb-2">注文内容</h2>
              <div className="of-block grid grid-cols-[54px_1fr] gap-3 p-3.5">
                <PhotobookCoverMock src={coverSrc} alt="" size="xs" />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-snug">{displayTitle}</p>
                  <p className="of-muted mt-1">
                    {productName} / {pages}ページ
                    <br />
                    {productSize} / {coverTypeLabel}
                  </p>
                  <button type="button" className="of-link mt-1 underline" onClick={() => setView("confirm")}>
                    内容を変更する ›
                  </button>
                </div>
              </div>
            </section>

            <div className="flex items-end justify-between gap-3">
              <p className="text-[13px]">合計金額</p>
              <div className="text-right">
                <p className="of-price text-[22px]">{formatPrice(total)}</p>
                <p className="text-[10px] text-[#8a7a74]">（税込・送料込み）</p>
              </div>
            </div>

            <div className="grid gap-2">
              <p aria-live="polite" className="sr-only">
                {isPending ? "Stripeの決済画面へ移動しています" : ""}
              </p>
              {actionError ? (
                <p role="alert" className="app-error text-[12px]">{actionError}</p>
              ) : null}
              <button
                type="button"
                className="of-cta"
                disabled={photosTooMany || isPending}
                onClick={handlePay}
              >
                {isPending ? "処理中…" : "🔒 今すぐ支払う"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function AddrField({
  id,
  label,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-[12px] font-medium">
        {label}{" "}
        {optional ? <span className="app-optional">任意</span> : <span className="app-required">必須</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[11px] text-danger" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
