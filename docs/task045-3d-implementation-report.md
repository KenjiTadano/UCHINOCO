# Task045-3d 実装報告書 — フォトブック注文フロー Integration / UX 最終確認

実施日: 2026-09-18

---

## 1. 注文フロー全体

```
Album Detail
  ↓ フォトブックにする
/pets/[petId]/album/[albumId]/product
  ↓ 注文内容を確認する (?product=&pages=)
/pets/[petId]/album/[albumId]/checkout
  ↓ 支払いへ進む (Server Action: createCheckoutSession)
Stripe Checkout (外部)
  ↓ 支払い成功 → success_url
/pets/[petId]/album/[albumId]/order/[orderId]
  ↓ アルバムへ戻る
/pets/[petId]/album/[albumId]

Stripe キャンセル → cancel_url:
/pets/[petId]/album/[albumId]/checkout?product=&pages=&cancelled=1

Stripe webhook:
  checkout.session.completed → mark_order_paid RPC
    → orders.status = paid
    → albums.status = ordered
```

404 になる導線なし。全リンク確認済み。

---

## 2. 修正ファイル

| ファイル | 修正内容 |
|---|---|
| `app/(app)/pets/[petId]/album/[albumId]/checkout/page.tsx` | `cancelled?: string` を searchParams に追加、`showCancelMessage` を CheckoutForm へ渡す |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/checkout-form.tsx` | `showCancelMessage` prop 追加・表示、`aria-live` pending 状態追加 |
| `app/(app)/pets/[petId]/album/[albumId]/order/[orderId]/page.tsx` | pet 名前並列取得、`AlbumCoverCollage` に `pet?.name` 渡す、cancelled バナーに「注文内容へ戻る」CTA 追加 |
| `tests/flow-integration.test.mjs` | 新規 24 件 |

---

## 3. navigation

| 遷移 | URL / 仕組み |
|---|---|
| Album Detail → Product | `/product` Link（album.status !== "ordered" のときのみ表示） |
| Product → Checkout | `?product=&pages=` クエリ引き継ぎ |
| Checkout → Stripe | Server Action → `redirect(session.url)` |
| Stripe success → Order Complete | `success_url = /order/[orderId]?session_id={CHECKOUT_SESSION_ID}` |
| Stripe cancel → Checkout | `cancel_url = /checkout?product=&pages=&cancelled=1` |
| Order Complete paid → Album | 「アルバムへ戻る」Link |
| failed → 再注文 | 「再注文する」→ `/product` |
| cancelled → 再注文 | 「注文内容へ戻る」→ `/product` |
| pending → 再読み込み | `<a href=".../order/${orderId}">再読み込み</a>` |

---

## 4. cancel UX

Stripe の cancel_url から戻った際の `?cancelled=1` を処理。

- `checkout/page.tsx` が `cancelled === "1"` を検出
- `showCancelMessage={true}` を CheckoutForm へ渡す
- CheckoutForm が neutral なメッセージを表示:

> 「お支払いは完了していません。配送先を確認のうえ、再度「支払いへ進む」からお進みください。」

- 「失敗」「キャンセル」「カード拒否」などの alarming な語を使わない
- `payment_intent.payment_failed`（order complete の `failed` 状態）とは明確に異なる文言

---

## 5. error UX

全エラーメッセージの確認結果。技術的すぎる文言・秘密情報・DB 内部名なし。

| エラー種別 | ユーザー向けメッセージ |
|---|---|
| Stripe 未設定 | 「決済サービスが設定されていません。管理者にお問い合わせください。」 |
| 未認証 | 「ログインが必要です。」 |
| album ownership 失敗 | 「アルバムが見つかりません。」 |
| ordered album から注文開始 | 「このアルバムは注文を開始できない状態です。」 |
| invalid product | 「選択した商品が見つかりません。」 |
| invalid pages | 「ページ数が正しくありません。」 |
| address 不正 | 「配送先の入力内容を確認してください。」 |
| 写真枚数超過 | 「写真枚数（N枚）がページ数（Nページ）を超えています。写真を減らすか…」 |
| Stripe Session 作成失敗 | 「決済セッションの作成に失敗しました。しばらくしてから再度お試しください。」 |
| 注文処理中（concurrent） | 「注文処理が進行中です。しばらくしてから再度お試しください。」 |

---

## 6. loading / double submit

- `useTransition` + `startTransition` で Server Action を非同期呼び出し
- `isPending === true` 中:
  - ボタン `disabled={true}`
  - ラベル「処理中…」に変更
  - `aria-live="polite"` で SR に「Stripeの決済画面へ移動しています」をアナウンス
- `actionError` state で再試行可能なエラーメッセージを表示（`role="alert"`）
- 二重クリック: `disabled` 属性により物理的に防止

---

## 7. product UX

- 商品選択: `role="radiogroup"` + radio input (`sr-only`)、選択商品にチェックマーク + border highlight
- ページ選択: pill 形式 radio、選択中は primary color、追加費用を `+¥800` 形式で表示
- 写真超過警告: `role="status" aria-live="polite"` で advisory 表示（ハードブロックなし）
- 価格サマリー: `dd[aria-live="polite"]` でリアルタイム更新
- CTA: `注文内容を確認する` → `?product=&pages=` クエリで checkout へ

---

## 8. checkout UX

- 表示順序: 商品サマリー → 写真超過警告（条件付き）→ 配送先フォーム → 配送方法 → CTA
- クライアント検証: `validateAddress()` で submit 時に検証
- サーバー検証: Server Action 側でも `validateAddress()` を独立して実行（クライアント bypass 対策）
- エラーフォーカス: `document.getElementById(firstField)?.focus()` で最初のエラーへ移動
- `aria-invalid` + `aria-describedby`: `inputAria()` ヘルパーで全フィールドに設定
- 住所は URL に入れない — FormData で Server Action へ直接送信

---

## 9. order complete UX

| status | ヘッダー | メッセージ | CTA |
|---|---|---|---|
| `paid` | `CONFIRMED` | 「ご注文ありがとうございます」 | アルバムへ戻る |
| `pending` | `PROCESSING` | 「お支払いを確認しています」 | 再読み込み |
| `failed` | `FAILED` | 「お支払いを確認できませんでした」 | 再注文する → `/product` |
| `cancelled` | `CANCELLED` | 「この注文はキャンセルされました」 | 注文内容へ戻る → `/product` |

- `ds-editorial` スタイルのヘッダーでエディトリアル感維持
- `session_id` query param は表示に一切使用しない（DB の `order.status` を信頼源）
- pet 名取得バグ修正: `AlbumCoverCollage` に `pet?.name` を渡す（`""` → 正式名称）
- 注文番号: `order.id.slice(-8).toUpperCase()` で短縮表示
- 配送先: `shipping_prefecture`（都道府県のみ）を表示

---

## 10. ordered album UX

`album.status === "ordered"` の場合:

**非表示 / 無効化する要素:**
- フォトブックにするボタン
- AlbumTitleForm（タイトル編集）
- 写真を追加リンク
- AlbumPhotoControls（並び替え・削除）
- AlbumDeleteControl（アルバム削除）

**表示する要素:**
- 「注文済み」バナー（bg-success-soft）
- 最新注文ページへのリンク（`latestOrder` が存在する場合）
- アルバムカバー・タイトル・写真プレビュー（読み取り専用）

Server Action guard（`isAlbumEditable`）は変更なしで維持。UI 非表示と二重保護。

---

## 11. mobile (390px)

- `app-page` クラス (`max-w-xl px-4 py-8`): 390px で適切な余白
- Bottom Navigation: `pb-[calc(6rem+env(safe-area-inset-bottom))]` で CTA が nav に隠れない
- form input: `app-input` クラスで full-width
- 商品カード: 横並び (`flex gap-4`) でモバイルに最適化、デスクトップは `lg:flex-col lg:grid-cols-3`
- 価格テキスト: `text-xl font-semibold` で wrap しにくい設計

---

## 12. desktop (1280px)

- `max-w-xl` で中央配置 → EC 管理画面感なし
- `ds-editorial` テキスト（CHECKOUT / ORDER / PHOTOBOOK / ALBUM）でエディトリアル感
- 商品選択: `lg:grid-cols-3` で 3 列グリッド
- PHOTO FIRST / WARM MINIMAL / EDITORIAL デザイン維持

---

## 13. accessibility

| 項目 | 実装状況 |
|---|---|
| CTA 44px 以上 | `min-h-11` (44px) 以上確認済み |
| input label | 全フィールドに `<label htmlFor>` |
| `aria-invalid` | `inputAria()` ヘルパーで設定 |
| `aria-describedby` | `inputAria()` ヘルパーでエラー ID 参照 |
| `focus-visible` | `ds-focus` クラス (outline ring) |
| loading state | `isPending` で disabled + テキスト変更 |
| disabled state | `disabled={photosTooMany \|\| isPending}` |
| status message `aria-live` | 検証エラー件数・pending 状態をアナウンス |
| error announcement | `role="alert"` でエラー即時通知 |
| semantic heading | `<h1>` アルバムタイトル、`<h2>` セクション見出し |
| button/link 用途 | submit → `<button type="submit">`、ページ遷移 → `<Link>` |

---

## 14. security regression

Task045-3a〜3c の全 security guard を確認、劣化なし。

| 項目 | guard |
|---|---|
| direct orders DML 禁止 | `REVOKE INSERT/UPDATE/DELETE FROM authenticated, anon` |
| album/pet ownership | `.eq("owner_user_id", user.id)` (Server Action + page) |
| IDOR (petId/albumId) | 全 4 フィールド照合 (order page) |
| server price calculation | `calcPrice()` + `getDefaultShipping()` のみ使用 |
| album_id binding | webhook: `orderCheck.album_id === albumId` |
| session_id binding | mark_order_paid RPC: `v_session_id = p_stripe_session_id` |
| webhook signature | `constructEvent()` 失敗 → 400 |
| status transition | `.eq("status","pending")` guard + `isAllowedStatusTransition()` |
| paid album edit lock | `isAlbumEditable("ordered") === false` |
| PII URL 禁止 | cancel_url / success_url に address フィールドなし |

---

## 15. migration 一覧

```
supabase/migrations/ (Remote apply 未実施 — local files のみ)

Task044:
  20260918000001_albums.sql          — albums + album_photos テーブル

Task045-3a:
  20260918120000_create_orders.sql   — orders テーブル + RLS + indexes

Task045-3c:
  20260918130000_mark_order_paid.sql — mark_order_paid atomic RPC
```

依存順: `albums` → `orders` (orders が albums を参照) → `mark_order_paid` (orders + albums を操作) で正常。

---

## 16. tests

`tests/flow-integration.test.mjs` — **24 件追加**

| テスト | 内容 |
|---|---|
| A | Album Detail → Product route 確認 |
| B | Product → Checkout クエリ引き継ぎ |
| C (3件) | cancel_url: `cancelled=1` / checkout route / product+pages 保持 |
| D (2件) | success_url / cancel_url に PII フィールドなし |
| E (2件) | paid CTA メッセージ + アルバム戻りリンク |
| F (2件) | failed retry CTA + failed/cancelled メッセージ相違 |
| G (2件) | cancelled CTA + キャンセル文言 |
| H (2件) | pending 再読み込み CTA + 確認文言 |
| I (2件) | ordered album 編集 UI 非表示 + Server Action guard |
| J (4件) | security regression (total計算 / server config / address非URL / status遷移) |
| その他 | cancel message 中立性 / migration 依存順 |

---

## 17. typecheck / lint / build

- `npx tsc --noEmit` → **0 errors**（`.next` なしで通過）
- `npm run lint` → **0 errors, 0 warnings**
- `npm run build` → **成功**
- `git diff --check` → 出力なし

---

## 18. node tests 総数

```
node --test tests/*.mjs → 198 tests, 198 pass, 0 fail
```

| ファイル | 件数 |
|---|---|
| album.test.mjs | 12 |
| checkout.test.mjs | 40 |
| checkout-session.test.mjs | 42 |
| flow-integration.test.mjs | 24（新規） |
| orders-security.test.mjs | 21 |
| photo-list-data.test.mjs | 既存 |
| photo-pets.test.mjs | 既存 |
| photobook-products.test.mjs | 既存 |
| webhook.test.mjs | 38 |

---

## 19. git status --short

```
 M app/(app)/pets/[petId]/album/[albumId]/checkout/checkout-form.tsx
 M app/(app)/pets/[petId]/album/[albumId]/checkout/page.tsx
 M app/(app)/pets/[petId]/album/[albumId]/order/[orderId]/page.tsx
?? tests/flow-integration.test.mjs
```

commit / push / merge 未実施。Remote Supabase 操作未実施。Stripe 実通信未実施。

---

## 20. 自宅 PC で必要な作業一覧

| 優先度 | 作業 | 詳細 |
|---|---|---|
| 必須 | `.env.local` 作成 | `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` を設定 |
| 必須 | Supabase migration 適用 | `supabase start` → `supabase db reset`（全 migration を local DB に適用） |
| 必須 | 実決済フロー確認 | Stripe test モードで checkout → webhook → paid → album ordered を通しテスト |
| 必須 | Stripe CLI | `brew install stripe/stripe-cli/stripe` → `stripe listen --forward-to localhost:3000/api/stripe/webhook` |
| 推奨 | 注文完了メール | paid 時の確認メール送信（未実装） |
| 推奨 | 注文一覧ページ | `/account/orders` または `/pets/[petId]/orders`（未実装） |
| 将来 | 印刷 API 連携 | 印刷サービスへの注文データ送信（未実装） |
| 将来 | `order_photos` テーブル | 印刷用写真リスト永続化（未実装） |
