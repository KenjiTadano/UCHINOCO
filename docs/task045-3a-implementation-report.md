# Task045-3a 実装報告書 — 注文・決済機能 DB / Security 基盤

実施日: 2026-09-18

---

## 1. 変更ファイル

| ファイル | 種別 |
|---|---|
| `supabase/migrations/20260918120000_create_orders.sql` | 新規 |
| `lib/supabase/admin.ts` | 新規 |
| `lib/album-guard.ts` | 新規 |
| `tests/orders-security.test.mjs` | 新規 |
| `app/(app)/pets/[petId]/album/[albumId]/actions.ts` | 更新 |
| `lib/supabase/database.types.ts` | 更新 |
| `.env.example` | 更新 |

---

## 2. migration 名

`20260918120000_create_orders.sql`

---

## 3. orders schema

| カラム | 型 | 備考 |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| owner_user_id | uuid NOT NULL | → auth.users ON DELETE RESTRICT |
| album_id | uuid NOT NULL | → albums ON DELETE RESTRICT |
| pet_id | uuid NOT NULL | → pets ON DELETE RESTRICT |
| status | text NOT NULL DEFAULT 'pending' | CHECK in (pending/paid/cancelled/failed) |
| product_id | text NOT NULL | |
| product_name | text NOT NULL | |
| product_size | text NOT NULL | |
| product_cover_type | text NOT NULL | |
| product_cover_type_label | text NOT NULL | |
| pages | integer NOT NULL | CHECK > 0 |
| subtotal | integer NOT NULL | CHECK >= 0 |
| shipping_fee | integer NOT NULL | CHECK >= 0 |
| total | integer NOT NULL | CHECK >= 0 AND = subtotal + shipping_fee |
| shipping_option_id | text NOT NULL | |
| shipping_option_name | text NOT NULL | |
| shipping_last_name | text NOT NULL | |
| shipping_first_name | text NOT NULL | |
| shipping_postal_code | text NOT NULL | |
| shipping_prefecture | text NOT NULL | |
| shipping_city | text NOT NULL | |
| shipping_address1 | text NOT NULL | |
| shipping_address2 | text | nullable |
| shipping_phone | text NOT NULL | |
| stripe_checkout_session_id | text UNIQUE | nullable |
| stripe_payment_intent_id | text | nullable |
| created_at | timestamptz NOT NULL | |
| updated_at | timestamptz NOT NULL | set_updated_at() trigger |
| paid_at | timestamptz | nullable |
| cancelled_at | timestamptz | nullable |

---

## 4. constraints

- `status CHECK (status IN ('pending', 'paid', 'cancelled', 'failed'))`
- `pages CHECK (pages > 0)`
- `subtotal CHECK (subtotal >= 0)`
- `shipping_fee CHECK (shipping_fee >= 0)`
- `total CHECK (total >= 0 AND total = subtotal + shipping_fee)` — 金額不整合をDB層で拒否
- `stripe_checkout_session_id UNIQUE` — 二重課金防止

---

## 5. indexes

| インデックス名 | カラム | 用途 |
|---|---|---|
| `orders_owner_created_idx` | (owner_user_id, created_at DESC) | 注文一覧ページ |
| `orders_album_idx` | (album_id) | album→注文参照 |
| `orders_album_pending_unique` | (album_id) WHERE status='pending' | 重複pending防止 (partial unique) |

---

## 6. RLS

- `ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY`
- ポリシー: `orders: owner select` — `USING (owner_user_id = auth.uid())`
- INSERT / UPDATE / DELETE ポリシーは一切なし

---

## 7. direct DML 制限

```sql
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated, anon;
```

PostgRESTを通じた直接INSEt/UPDATE/DELETEは実行不可。  
service role経由のServer Actionのみが書き込みを行う。

---

## 8. admin client

`lib/supabase/admin.ts`

- `import "server-only"` — Client Componentからのimportをビルド時に拒否
- `SUPABASE_SERVICE_ROLE_KEY` 使用（`NEXT_PUBLIC_` プレフィックスなし）
- `autoRefreshToken: false`, `persistSession: false`（ステートレスサーバー利用）
- `.env.example` に `SUPABASE_SERVICE_ROLE_KEY=` を追加

---

## 9. service role 使用境界

service roleを使用するのは以下のみ:

1. **注文作成 Server Action** (Task045-3b): `lib/supabase/admin.ts` の `createAdminClient()` 経由でorders INSERT
2. **Stripe webhook handler** (Task045-3c): status更新 (paid/failed/cancelled)、paid_at・stripe_payment_intent_id保存

通常の写真/pet/albumUIでは引き続き `lib/supabase/server.ts` の `createClient()` (user session + RLS) を使用。

**service roleを認可の代わりに使わない**。Server Action自身で以下を事前検証:
- `auth.getUser()` (認証済み確認)
- album ownership (`owner_user_id === user.id`)
- pet ownership (`owner_user_id === user.id`)
- `album.pet_id === route petId`

---

## 10. Album ordered guard

`lib/album-guard.ts` に純粋関数 `isAlbumEditable(status)` を追加。  
`app/(app)/pets/[petId]/album/[albumId]/actions.ts` の全mutation Actionで使用:

| アクション | guard呼出 |
|---|---|
| updateAlbumTitle | `assertAlbumEditable(ctx.album)` |
| removeAlbumPhoto | `assertAlbumEditable(ctx.album)` |
| addAlbumPhoto | `assertAlbumEditable(ctx.album)` |
| reorderAlbumPhotos | `assertAlbumEditable(ctx.album)` |
| deleteAlbum | `assertAlbumEditable(ctx.album)` |

`status === 'ordered'` の場合 `err("注文済みのアルバムは編集できません。")` を返却。  
`draft` は従来どおり編集可能。UIでのボタン非表示と二重で保護。

---

## 11. Stripe metadata 方針

次Task用として migration コメントに記録:

```
Stripe Checkout Session metadata: { order_id, album_id }
Stripe PaymentIntent metadata:    { order_id }
PII (氏名/住所/電話) は Stripe metadata に入れない。
```

`stripe_payment_intent_id` は Task045-3c webhook 時に保存。  
`payment_intent.payment_failed` では `PaymentIntent metadata.order_id` で order を特定する。

---

## 12. Security tests

`tests/orders-security.test.mjs` — 21件全パス

| テスト | 検証内容 |
|---|---|
| A | owner select RLS ポリシー存在確認 |
| B | 全件SELECTポリシーなし確認 |
| C | authenticated REVOKE INSERT |
| D | authenticated REVOKE UPDATE |
| E | authenticated REVOKE DELETE |
| F | anon アクセス不可（RLS + REVOKE） |
| G | partial unique index 存在確認 |
| H | paid後も新pending作成可能（partial index scope） |
| I | total = subtotal + shipping_fee CHECK |
| J | negative price CHECK |
| K | invalid status CHECK |
| L | album FK ON DELETE RESTRICT |
| M | pet FK ON DELETE RESTRICT |
| N | ordered album title 編集拒否 |
| O | ordered album photo add 拒否 |
| P | ordered album photo remove 拒否 |
| Q | ordered album reorder 拒否 |
| R | ordered album delete 拒否 |
| S | draft album は編集可能 (3件) |

---

## 13. typecheck

```
npx tsc --noEmit → エラーなし
```

---

## 14. lint

```
npm run lint → 0 errors, 0 warnings
```

---

## 15. build

```
npm run build → 成功（全ページ build 完了）
```

---

## 16. git diff --check

```
git diff --check → 出力なし（whitespaceエラーなし）
```

---

## 17. git status --short

```
 M .env.example
 M app/(app)/pets/[petId]/album/[albumId]/actions.ts
 M lib/supabase/database.types.ts
 M package-lock.json
 M package.json
?? .claude/
?? docs/UCHINOCO_v1.1_UI_Design.pdf
?? lib/album-guard.ts
?? lib/supabase/admin.ts
?? supabase/migrations/20260918120000_create_orders.sql
?? tests/orders-security.test.mjs
```

commit / push / merge 未実施。Remote Supabase 操作未実施。Stripe 接続未実施。

---

## 18. Task045-3b への注意点

1. **admin client の使用**: `import { createAdminClient } from "@/lib/supabase/admin"` — Server Actionファイル内のみ
2. **事前検証必須**: `createAdminClient()` 呼び出し前に必ず `auth.getUser()`, album/pet ownership, `album.pet_id === petId` を `createClient()` (user session) で検証する
3. **金額・商品の再計算**: `PHOTOBOOK_PRODUCTS`, `calcPrice()`, `SHIPPING_OPTIONS` からサーバー側で再計算。Clientからの `subtotal`/`total`/`product_name` 等を信用しない
4. **album.status は 'draft' のまま orders INSERT**: `paid` Webhook受信後に `ordered` へ変更
5. **pending 重複防止**: INSERT前に `orders_album_pending_unique` partial indexが存在するため、二重注文はDB制約で弾かれる。Server Action側でも事前チェック推奨（ユーザー向けエラーメッセージのため）
6. **stripe_checkout_session_id**: Stripe Checkout Session作成後 (Task045-3b後半) に UPDATE で保存
7. **`checkout.test.mjs`**: 既存の `.mjs` + TypeScript型注釈混在によるNode.jsパースエラーが存在（今回の変更とは無関係）
