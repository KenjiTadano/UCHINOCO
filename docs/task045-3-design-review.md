# Task045-3 設計レビュー

## 前提

- Task044: `albums` / `album_photos` 実装済み
- Task045-1: 商品選択・価格計算 UI 実装済み
- Task045-2: 注文確認・配送先入力・サーバー価格再計算 実装済み
- 現在の `albums.status = 'draft'`
- 今回はコード変更・migration 作成・Stripe 接続・Remote Supabase 操作なし

---

## 1. 推奨 orders schema

```sql
create table public.orders (
  id                       uuid         primary key default gen_random_uuid(),
  owner_user_id            uuid         not null references auth.users(id) on delete restrict,
  album_id                 uuid         not null references public.albums(id) on delete restrict,
  pet_id                   uuid         not null references public.pets(id) on delete restrict,

  -- ステータス
  status                   text         not null default 'pending'
                             check (status in ('pending', 'paid', 'cancelled', 'failed')),

  -- 商品 snapshot（注文時点の値を保存）
  product_id               text         not null,
  product_name             text         not null,
  product_size             text         not null,
  product_cover_type       text         not null,
  product_cover_type_label text         not null,
  pages                    integer      not null,

  -- 金額 snapshot（サーバー計算値のみ。Client 送信値は使用禁止）
  subtotal                 integer      not null,
  shipping_fee             integer      not null,
  total                    integer      not null,

  -- 配送オプション snapshot
  shipping_option_id       text         not null,
  shipping_option_name     text         not null,

  -- 配送先住所 snapshot（個人情報）
  shipping_last_name       text         not null,
  shipping_first_name      text         not null,
  shipping_postal_code     text         not null,
  shipping_prefecture      text         not null,
  shipping_city            text         not null,
  shipping_address1        text         not null,
  shipping_address2        text,
  shipping_phone           text         not null,

  -- Stripe
  stripe_checkout_session_id  text      unique,
  stripe_payment_intent_id    text,

  -- タイムスタンプ
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now(),
  paid_at                  timestamptz,
  cancelled_at             timestamptz
);

create index orders_owner_album_idx on public.orders (owner_user_id, album_id, created_at desc);
create index orders_stripe_session_idx on public.orders (stripe_checkout_session_id);

-- Idempotency: 同一 album に pending 注文は 1 件まで
create unique index orders_album_pending_unique
  on public.orders (album_id)
  where status = 'pending';
```

---

## 2. 補助テーブル（order_photos）

**Task045-3 では作らない。**

理由：
- 印刷会社 API は未定（Task046+）
- `albums.status = 'ordered'` で編集を UI 上ブロックすれば v1 として十分
- 印刷会社 API 仕様が確定してから snapshot 形式を決めた方が migration の手戻りがない

**Task046+ で追加する場合の想定形：**

```sql
create table public.order_photos (
  order_id   uuid    not null references public.orders(id) on delete cascade,
  photo_id   uuid    not null references public.photos(id) on delete restrict,
  position   integer not null,
  primary key (order_id, photo_id)
);
```

---

## 3. status 設計

**4 値のみ（Task045-3 スコープ）：**

| status | 意味 | 遷移元 |
|---|---|---|
| `pending` | 注文作成済み、Stripe Checkout 未完了 | 初期値 |
| `paid` | webhook で支払い確定 | pending |
| `cancelled` | ユーザー離脱 / セッション期限切れ / 明示キャンセル | pending |
| `failed` | 決済失敗（カード拒否等） | pending |

`printing` / `shipped` は Task046+ で migration 追加。
`payment_pending` は `pending` と役割が被るため不要。
`paid` と `cancelled`/`failed` の区別は UX 上重要（再決済可否のメッセージが変わる）。

---

## 4. 金額 snapshot

**サーバー側で再計算した値のみ orders に保存。Client から受け取る金額は一切信用しない。**

```typescript
// Server Action 内
const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === productId);
const shipping = getShippingOption(shippingOptionId) ?? getDefaultShipping();
const subtotal = calcPrice(product, pages);    // サーバー計算
const total = subtotal + shipping.price;       // サーバー計算
// → そのまま orders に INSERT + Stripe line_items に渡す
```

Stripe へ渡す `unit_amount` も同じサーバー計算値。Client から送られた金額フィールドはすべて無視する。

---

## 5. 商品 snapshot

`product_id` だけでなく、注文時点の名前・サイズ・カバー種別・ページ数を snapshot として orders に保存する。

理由：将来 `PHOTOBOOK_PRODUCTS` の内容が変わっても（価格改定、商品廃止）、過去注文の表示・印刷指示が壊れない。

保存するフィールド：`product_id`, `product_name`, `product_size`, `product_cover_type`, `product_cover_type_label`, `pages`

---

## 6. Album snapshot（Album lock）

**推奨：paid webhook 時に albums.status で lock する（Option A）**

| イベント | albums.status | orders.status |
|---|---|---|
| 注文作成（pending） | `draft` のまま（変更しない） | `pending` |
| 支払い失敗 | `draft` のまま | `failed` |
| セッション期限切れ | `draft` のまま | `cancelled` |
| 支払い確定（webhook） | `ordered` へ更新 | `paid` |

理由：
- pending 作成時にロックすると、cancel/fail → draft 戻しのロジックが複雑になる
- paid 後に `albums.status = 'ordered'` にすれば UI 上の編集を全行程でブロックできる
- `album_photos` は paid 時点の状態を使って印刷する = webhook タイミングで確定

リスク：pending → paid の間にユーザーが album を編集できる。
許容理由：v1 では印刷会社 API がない。Task046 で `order_photos` snapshot を追加する際に同時対処する。

---

## 7. Shipping address 保存方法

- orders テーブルに `shipping_*` カラムとして snapshot 保存
- `profiles` テーブルには保存しない（ユーザーが明示的に選択した場合のみ将来検討）
- ログ出力（`console.log`、モニタリング等）に住所データを含めない
- URL に含めない（Task045-2 で実装済み）
- Stripe Session の `customer_address` には渡さない（Stripe 側での保存を避ける）

---

## 8. Stripe Checkout flow

```
checkout-form（Client）
  ↓ 「支払いへ進む」submit
  ↓ router.push → /checkout/payment

payment/page.tsx（Server Component）
  ↓ Server Action: createCheckoutSession(productId, pages, address, albumId, petId)

createCheckoutSession（Server Action）
  ↓ 1. auth.uid() 確認
  ↓ 2. album ownership + petId 確認（IDOR 防止）
  ↓ 3. product + pages validation（改ざん防止）
  ↓ 4. サーバー側金額再計算
  ↓ 5. pending order が既存か確認（Idempotency）
       → 既存あり: Stripe session が有効なら URL 再利用
       → 既存なし / 期限切れ: pending を cancelled に更新 → 新規作成
  ↓ 6. orders に pending INSERT（snapshot 込み）
  ↓ 7. Stripe Checkout Session 作成
       success_url = /pets/[petId]/album/[albumId]/order/[orderId]?session_id={CHECKOUT_SESSION_ID}
       cancel_url  = /pets/[petId]/album/[albumId]/checkout
  ↓ 8. orders.stripe_checkout_session_id UPDATE
  ↓ redirect(session.url)  ← Stripe ホスティングページへ

Stripe 決済完了
  ↓ webhook → /api/stripe/webhook
  ↓ orders.status = 'paid', paid_at = now()
  ↓ albums.status = 'ordered'
  ↓ Stripe success_url へリダイレクト

order complete page（Server Component）
  ↓ orderId で orders を SELECT（owner_user_id + pet_id で IDOR 確認）
  ↓ order.status を DB から読んで表示
     paid      → 「ご注文ありがとうございます」
     それ以外  → 「支払い確認中です」（webhook 到達待ち）
```

**Stripe Checkout Session は Server Action 内のみで作成。Client には session.url は渡さない（redirect のみ）。**

---

## 9. webhook flow

**エンドポイント：`/api/stripe/webhook`（Next.js Route Handler）**

```
POST /api/stripe/webhook
  ↓ 1. Stripe-Signature ヘッダー検証（stripe.webhooks.constructEvent）
       → 失敗時: 400 を返す（処理しない）
  ↓ 2. event.type 分岐

checkout.session.completed（payment_status === 'paid'）:
  → stripe_checkout_session_id で orders を検索
  → status = 'paid', paid_at = now(), stripe_payment_intent_id = ... をセット
  → albums.status = 'ordered' へ更新（service_role）
  → 200 を返す

checkout.session.expired:
  → stripe_checkout_session_id で orders を検索
  → status = 'cancelled', cancelled_at = now() をセット
  → albums.status は変更しない（draft のまま）
  → 200 を返す

payment_intent.payment_failed:
  → stripe_payment_intent_id で orders を検索
  → status = 'failed' をセット
  → albums.status は変更しない（draft のまま）
  → 200 を返す

その他:
  → 200 を返す（エラーにしない — Stripe がリトライしてしまうため）
```

**最小必須 3 イベント：**
1. `checkout.session.completed` — 決済確定の唯一の信頼源
2. `checkout.session.expired` — 離脱・タイムアウト
3. `payment_intent.payment_failed` — カード拒否等

`checkout.session.completed` では `payment_status !== 'paid'` の場合は paid 扱いにしない。

---

## 10. Idempotency

Partial unique index で構造的に保証する：

```sql
create unique index orders_album_pending_unique
  on public.orders (album_id)
  where status = 'pending';
```

**Server Action の処理フロー：**

```
既存 pending order を SELECT（album_id = ?, owner_user_id = auth.uid()）
  あり → Stripe session が有効か確認（stripe.checkout.sessions.retrieve で expires_at 確認）
           有効: session.url へ redirect（新規作成しない）
           無効: pending order を 'cancelled' に UPDATE → 新規フローへ
  なし → orders INSERT → Stripe session 作成 → redirect
```

---

## 11. 支払い失敗

```
payment_intent.payment_failed webhook
  → orders.status = 'failed'
  → albums.status = 変更なし（draft のまま）
  → Stripe cancel_url に戻る（= /checkout ページ）
```

UI 上は「支払いに失敗しました。もう一度お試しください。」と再試行リンクを表示。
`failed` order は Idempotency の再利用対象にしない（新規 pending order を作成する）。

---

## 12. キャンセル / セッション期限切れ

```
checkout.session.expired webhook
  → orders.status = 'cancelled', cancelled_at = now()
  → albums.status = 変更なし（draft のまま）
```

ユーザーが cancel_url（`/checkout`）に戻った時点では webhook がまだ届いていない可能性がある。
→ Server Action の Idempotency ロジックで Stripe session の有効期限を確認し、期限切れなら pending order を `cancelled` に更新してから新規フローを開始する。
→ これにより `orders_album_pending_unique` index の制約に引っかかることなく再注文できる。

---

## 13. albums.status との関係

| イベント | albums.status | 備考 |
|---|---|---|
| アルバム作成 | `draft` | |
| 注文作成（pending） | `draft` のまま | 編集ブロックしない |
| 支払い失敗 | `draft` のまま | 再注文可能 |
| セッション期限切れ | `draft` のまま | 再注文可能 |
| 支払い確定（webhook） | `ordered` | 編集ブロック開始 |
| 将来の印刷完了 | `archived` 等 | Task046+ |

`ready` は Task045-3 では使わない。Task046 以降で印刷会社送信前チェック完了を表す段階として空けておく。

`albums.status = 'ordered'` のアルバムへの編集操作は、Server Action / Server Component で拒否する（`403` または `notFound()`）。

---

## 14. RLS

```sql
alter table public.orders enable row level security;

-- ユーザーは自分の注文のみ SELECT
create policy "orders: owner select"
  on public.orders for select
  using (owner_user_id = auth.uid());

-- Server Action（user JWT）から INSERT
create policy "orders: owner insert"
  on public.orders for insert
  with check (owner_user_id = auth.uid());

-- UPDATE ポリシーなし（webhook の service_role のみが UPDATE できる）
-- DELETE ポリシーなし
```

`orders.status` や `orders.total` をユーザーが直接 UPDATE できないことを RLS で構造的に保証する。

---

## 15. service_role の使用範囲

**使う場所：`/api/stripe/webhook` のみ**

```typescript
// webhook handler 内のみ
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // ← NEXT_PUBLIC_ なし。server-only
);
```

**絶対に禁止する実装：**
- `SUPABASE_SERVICE_ROLE_KEY` を `NEXT_PUBLIC_` プレフィックスで定義する
- Client Component や `"use client"` ファイルで service_role client を使う
- Server Action（通常の注文作成フロー）で service_role を使う（user JWT で十分）

webhook は `/api/` Route Handler として実装し、Server Action とは完全に分離する。

---

## 16. IDOR

すべての orders クエリに必須：

```typescript
// Server Component（order complete ページ等）
const { data: order } = await supabase
  .from("orders")
  .select(...)
  .eq("id", orderId)
  .eq("owner_user_id", user.id)  // 必須
  .eq("pet_id", petId)           // 必須（route param 照合）
  .maybeSingle();

if (!order) notFound();
```

webhook では `stripe_checkout_session_id` で検索する（Stripe からの信頼できるイベント）。
ただし `stripe.webhooks.constructEvent` の署名検証が必須で、これが IDOR 防止の代わりになる。

---

## 17. 注文完了画面

**URL：`/pets/[petId]/album/[albumId]/order/[orderId]`**

- Stripe success_url に `?session_id={CHECKOUT_SESSION_ID}` を含める（Stripe が自動展開）
- 完了画面では `session_id` を信頼せず、必ず `orderId` で DB から `orders` を再取得して `status` を確認する
- `order.status = 'paid'` → 確定メッセージ表示
- `order.status = 'pending'` → 「支払い確認中…」（webhook 遅延対応）
- `order.status = 'cancelled'` / `'failed'` → エラーメッセージ + 再試行リンク

```tsx
// 絶対に禁止:
if (searchParams.session_id) {
  showSuccessMessage(); // URL だけで paid 判定 → 禁止
}

// 正しい:
const order = await fetchOrderFromDB(orderId, userId, petId);
if (order.status === "paid") { /* 確定表示 */ }
```

---

## 18. 注文履歴

**Task045-3 初期版の最小限実装：**

アルバム詳細ページ（`/pets/[petId]/album/[albumId]`）に最新注文の状態バッジを追加する程度で十分。

```typescript
const { data: latestOrder } = await supabase
  .from("orders")
  .select("id, status, created_at, total")
  .eq("album_id", albumId)
  .eq("owner_user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

専用の注文履歴ページ（`/orders` 等）は Task046+ に持ち越し。
理由：印刷状態（printing/shipped）が実装されてから一覧として意味をなす。

---

## 19. 将来の印刷会社連携

`provider_order_id` 等の印刷会社 API 向けカラムは **Task045-3 では追加しない**。

理由：印刷会社 API 仕様が未確定のまま設計すると migration の手戻りが大きい。
Task046 で印刷会社が決まった時点で `alter table orders add column provider_order_id text` を追加すれば足りる。

Task045-3 で `status = 'paid'` まで持たせれば、Task046 で `paid → printing → shipped` への遷移追加は容易。

---

## 20. Task045-3 を何段階に分けるか

| ステップ | 内容 | Remote 操作 |
|---|---|---|
| **045-3a** | orders migration + RLS + partial unique index | local migration のみ |
| **045-3b** | Server Action（createCheckoutSession）+ Stripe Checkout Session 作成 + redirect | Stripe test mode のみ |
| **045-3c** | webhook Route Handler + signature 検証 + orders/albums status 更新 | Stripe test mode のみ |
| **045-3d** | order complete page + アルバム詳細への注文状態バッジ + テスト | なし |

各ステップで `tsc / lint / build / git diff --check` を通してからマージ。
Remote Supabase への migration 適用タイミングは別途確認する。

---

## 21. 最大の security リスク

### 第 1 位：webhook の Stripe 署名検証なし

`/api/stripe/webhook` に署名検証なしで実装すると、攻撃者が任意の POST を送り `orders.status = 'paid'` に書き換えられる。

```typescript
// 必須実装
const sig = req.headers.get("stripe-signature")!;
const rawBody = await req.text(); // json() は禁止（署名が壊れる）
const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
```

### 第 2 位：`SUPABASE_SERVICE_ROLE_KEY` の Client 側漏洩

`NEXT_PUBLIC_` プレフィックスで定義するとクライアントバンドルに含まれ、全 RLS を bypass される。webhook handler 以外では絶対に使用しない。

### 第 3 位：クライアント送信金額の trust

`checkout-form.tsx` が `subtotal` や `total` を Server Action に渡して Stripe に使う実装は禁止。`productId` と `pages` のみを受け取り、サーバーで再計算する。

### 第 4 位：order complete ページでの URL 信頼

`?payment_status=success` や `?session_id=...` だけを見て paid 判定することは禁止。必ず DB から order を取得して `status` を確認する。

---

## 22. 実装前に決める未確定事項

| 項目 | 内容 | 判断が必要なタイミング |
|---|---|---|
| 消費税の扱い | 表示価格に内税含むか別途課税か | 045-3a 前 |
| Stripe test mode の key 管理 | `.env.local` の命名規則（`_TEST` サフィックス等） | 045-3b 前 |
| webhook secret の管理 | Stripe CLI local forwarding 用 vs production 用の切り替え方法 | 045-3c 前 |
| cancel_url の挙動 | Stripe 離脱後に /checkout へ戻った時、pending order をどう扱うか | 045-3b 前 |
| Stripe Checkout の言語設定 | `locale: 'ja'` を Session に渡すか | 045-3b 前 |
| `order_photos` の必要性 | 印刷会社 API 仕様確定後でよいか、先に snapshot テーブルを作るか | 046a 前 |
| 返金フロー | 自動返金か手動対応か（Stripe refund API 使用有無） | Task046+ |
| 注文メール通知 | Stripe の自動メールを使うか、独自送信するか | Task046+ |
