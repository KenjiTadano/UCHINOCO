# Task045-3b 実装報告書 — Stripe Checkout Session 作成フロー

実施日: 2026-09-18

---

## 1. 変更ファイル

| ファイル | 種別 |
|---|---|
| `tests/checkout.test.mjs` | 修正（TS型注釈除去） |
| `lib/stripe/server.ts` | 新規 |
| `lib/checkout-session-helpers.ts` | 新規（純粋関数、テスト可能） |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/actions.ts` | 新規 |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/checkout-form.tsx` | 更新 |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/payment/page.tsx` | 削除 |
| `tests/checkout-session.test.mjs` | 新規 |
| `.env.example` | 更新 |
| `package.json` / `package-lock.json` | stripe パッケージ追加 |

---

## 2. checkout.test.mjs 修正

`.mjs` ファイルは `--experimental-strip-types` の対象外のため、Node.js が TypeScript 型注釈をパースできずエラーになっていた。

修正内容: 2箇所の `const addr: typeof EMPTY_ADDRESS = {` から `: typeof EMPTY_ADDRESS` を削除。

結果: 40件全パス（修正前 fail 1）。

---

## 3. Stripe client

`lib/stripe/server.ts`

- `import "server-only"` — Client Component からのビルド時 import を拒否
- `createStripeClient()` — `STRIPE_SECRET_KEY` 確認後に `new Stripe(key)` を返す。キーなしなら例外
- `hasStripeKey()` — ブール値でキー存在確認（Server Action の fail-fast 用）
- Stripe v22 を使用
- `.env.example` に `STRIPE_SECRET_KEY=` / `STRIPE_WEBHOOK_SECRET=` を追加（値は commit しない）

---

## 4. Server Action

`app/(app)/pets/[petId]/album/[albumId]/checkout/actions.ts`

`createCheckoutSession(petId, albumId, productId, pages, formData)`

戻り値: `{ error: string }` | `never`（成功時は `redirect()` が throw するため返らない）

---

## 5. auth / ownership

1. `hasStripeKey()` — fail-fast、DB 書き込み前にキー確認
2. `userClient.auth.getUser()` — 未認証拒否
3. `UUID_RE.test(petId || albumId)` — 基本パラメータ検証
4. `albums` クエリ: `.eq("id", albumId).eq("owner_user_id", user.id).eq("pet_id", petId)` — IDOR 防止
5. `album.owner_user_id !== user.id` / `album.pet_id !== petId` — 二重確認
6. `pets` クエリ: `.eq("id", petId).eq("owner_user_id", user.id)` — ペット ownership

---

## 6. Album status check

`album.status !== "draft"` → `{ error: "このアルバムは注文を開始できない状態です。" }`

ordered/archived/ready の album から新規注文を開始不可。

---

## 7. product/pages validation

- `PHOTOBOOK_PRODUCTS.find(p => p.id === productId)` — 未知の productId 拒否
- `getPageOptions(product).includes(pages)` + `Number.isInteger(pages)` — 無効ページ数拒否

---

## 8. address validation

`formData` から各フィールドを抽出・trim した後、`validateAddress()` でサーバー側再検証。Client バリデーションのみに依存しない。

---

## 9. photo capacity

`userClient.from("album_photos").select(count).eq("album_id", albumId)` でサーバー側から再取得。

`photoCount > pages` → `{ error: "写真枚数が…" }`

---

## 10. price recalculation

```ts
const subtotal = calcPrice(product, pages);   // PHOTOBOOK_PRODUCTS から
const shipping = getDefaultShipping();         // SHIPPING_OPTIONS から
// total は buildOrderSnapshot 内で subtotal + shipping.price として計算
```

Client から `subtotal` / `shippingFee` / `total` を受け取らない。

---

## 11. pending idempotency

同一 `album_id` の `status='pending'` order を事前チェック:

| ケース | 対応 |
|---|---|
| A. `stripe_checkout_session_id` あり、session が `open` | `redirect(session.url)` — 新規 order 作成なし |
| B. `stripe_checkout_session_id` あり、session が `expired`/`complete` | order を `cancelled` に更新 → 新規 order 作成 |
| Stripe 取得失敗 | order を `cancelled` に更新 → 新規 order 作成 |
| C. `stripe_checkout_session_id` なし、作成から 60 秒未満 | `{ error: "注文処理が進行中です" }` — 二重作成防止 |
| C. `stripe_checkout_session_id` なし、60 秒以上経過 | order を `cancelled` に更新 → 新規 order 作成 |

---

## 12. orders snapshot

`buildOrderSnapshot()` (`lib/checkout-session-helpers.ts`) で構築。全フィールド:
- `owner_user_id`, `album_id`, `pet_id`, `status: "pending"`
- product snapshot (id/name/size/cover_type/cover_type_label/pages)
- price snapshot (subtotal/shipping_fee/total) — サーバー計算値のみ
- shipping snapshot (option_id/option_name)
- address snapshot (shipping_* 全フィールド) — `address2` が空文字なら `null` に変換

---

## 13. Stripe Session

```ts
stripe.checkout.sessions.create({
  mode: "payment",
  locale: "ja",
  line_items: [
    { price_data: { currency: "jpy", product_data: { name: "スタンダード 20ページ" }, unit_amount: subtotal }, quantity: 1 },
    { price_data: { currency: "jpy", product_data: { name: "標準配送" }, unit_amount: shippingFee }, quantity: 1 },
  ],
  payment_intent_data: { metadata: { order_id } },
  metadata: { order_id, album_id },
  success_url: ...,
  cancel_url: ...,
})
```

line_items の合計 = subtotal + shipping_fee = `orders.total` で一致保証。

---

## 14. metadata

| 対象 | 内容 |
|---|---|
| Checkout Session metadata | `{ order_id, album_id }` — PII なし |
| PaymentIntent metadata | `{ order_id }` — PII なし |

氏名・住所・電話は metadata に絶対に含めない（`lib/checkout-session-helpers.ts` の純粋関数でテスト済み）。

---

## 15. success/cancel URL

```
success_url: {SITE_URL}/pets/{petId}/album/{albumId}/order/{orderId}?session_id={CHECKOUT_SESSION_ID}
cancel_url:  {SITE_URL}/pets/{petId}/album/{albumId}/checkout?product={productId}&pages={pages}&cancelled=1
```

- cancel_url に住所フィールドは含まない
- `NEXT_PUBLIC_SITE_URL` 環境変数を使用（fallback: `http://localhost:3000`）

---

## 16. Session ID 保存

Stripe Session 作成成功後:
```ts
adminClient.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id)
```

保存後に `redirect(session.url)` でリダイレクト。Client に session object を返さない。

---

## 17. Stripe 未設定時

`hasStripeKey()` チェックが `createAdminClient()` より前にあるため、キーなし環境では DB に一切書き込まない。

`{ error: "決済サービスが設定されていません。管理者にお問い合わせください。" }` を返却。

---

## 18. Session 失敗時処理

Stripe Session 作成に失敗した場合（例外 catch）:
1. `adminClient.from("orders").update({ status: "failed" }).eq("id", order.id)`
2. `{ error: "決済セッションの作成に失敗しました…" }` を返却

`pending` のまま放置しない。履歴として `failed` レコードを残す。

---

## 19. Security

service role (`createAdminClient`) を使用する操作:
- pending order の `status` 更新 (cancelled)
- `orders` INSERT
- `stripe_checkout_session_id` / `status` UPDATE

service role 使用前に user client + `auth.getUser()` で全ての ownership / validation を完了済み。service role を認可の代わりに使っていない。

---

## 20. Tests

`node --test tests/*.mjs` → **135件全パス**

| ファイル | 件数 |
|---|---|
| album.test.mjs | 12 |
| checkout.test.mjs | 40（修正後） |
| checkout-session.test.mjs | 42（新規） |
| orders-security.test.mjs | 21 |
| photo-list-data.test.mjs | 既存 |
| photo-pets.test.mjs | 既存 |
| photobook-products.test.mjs | 既存 |

checkout-session.test.mjs: A〜R 全テスト（うち structural テスト + 純粋関数テスト）

---

## 21. typecheck / lint / build

- `npx tsc --noEmit` → 既存の `LayoutProps` 型エラー3件（git stash で確認済み、pre-existing）。今回の変更による新規エラーなし。
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → 成功
- `git diff --check` → 出力なし

---

## 22. git status --short

```
 M .env.example
 M app/(app)/pets/[petId]/album/[albumId]/checkout/checkout-form.tsx
 D app/(app)/pets/[petId]/album/[albumId]/checkout/payment/page.tsx
 M package-lock.json
 M package.json
 M tests/checkout.test.mjs
?? app/(app)/pets/[petId]/album/[albumId]/checkout/actions.ts
?? lib/checkout-session-helpers.ts
?? lib/stripe/
?? tests/checkout-session.test.mjs
```

commit / push / merge 未実施。Remote Supabase 操作未実施。Stripe 実課金未実施。

---

## 23. Task045-3c への注意点

1. **成功 URL のページ実装**: `/pets/[petId]/album/[albumId]/order/[orderId]` (注文完了ページ) が未実装。Stripe から redirect された際の 404 を防ぐため、3c で最優先実装が必要。

2. **webhook handler**: `STRIPE_WEBHOOK_SECRET` を使用した `stripe.webhooks.constructEvent()` での署名検証が必須。`payment_intent.succeeded` で `orders.status = 'paid'`, `paid_at = now()`, `stripe_payment_intent_id` を保存し、`albums.status = 'ordered'` に変更。

3. **`stripe_payment_intent_id`**: webhook の `payment_intent.payment_failed` では `PaymentIntent metadata.order_id` で order を特定し、`status = 'failed'` に更新。

4. **webhook route**: `POST /api/stripe/webhook` として実装。`body` は raw bytes が必要なため `request.body` ではなく `request.arrayBuffer()` または `request.text()` を使用。Next.js App Router では `export const config = { api: { bodyParser: false } }` に相当する `export const runtime = "nodejs"` を設定。

5. **album.status の 'ordered' 更新**: 現在 `createCheckoutSession` では album.status は変更しない（payment webhook で変更）。webhook 未実装のため ordered 状態には遷移しない。

6. **成功ページのセキュリティ**: `orderId` の ownership 確認 (`owner_user_id = user.id`) を必ず行うこと。`session_id` query param は Stripe session の確認に使用するのみで信頼しない。
