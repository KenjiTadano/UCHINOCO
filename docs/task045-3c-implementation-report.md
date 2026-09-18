# Task045-3c 実装報告書 — webhook + 注文確定 + 注文完了ページ

実施日: 2026-09-18

---

## 1. LayoutProps エラー原因

`tsconfig.json` の `include` に `.next/types/**/*.ts` が含まれており、Next.js ビルド時に生成される `.next/types/routes.d.ts` 内の `LayoutProps` グローバル型を参照していた。

Task045-3b の調査中に `rm -rf .next` を実行したため、この自動生成型が失われ TypeScript エラーが発生。`npm run build` で `.next` が再生成されると型が復元され、エラーが消えていた。

**根本的修正**: 3つのレイアウトファイルの `LayoutProps<"/">` を `{ children: React.ReactNode }` に変更。`.next` ディレクトリ有無に依存しない。いずれのレイアウトも `params` を使用していないため安全に置き換え可能。

---

## 2. LayoutProps 修正

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `app/layout.tsx` | `LayoutProps<"/">` | `{ children: React.ReactNode }` |
| `app/(app)/layout.tsx` | `LayoutProps<"/">` | `{ children: React.ReactNode }` |
| `app/(auth)/layout.tsx` | `LayoutProps<"/">` | `{ children: React.ReactNode }` |

---

## 3. 変更ファイル

| ファイル | 種別 |
|---|---|
| `app/layout.tsx` | 更新（LayoutProps修正） |
| `app/(app)/layout.tsx` | 更新（LayoutProps修正） |
| `app/(auth)/layout.tsx` | 更新（LayoutProps修正） |
| `supabase/migrations/20260918130000_mark_order_paid.sql` | 新規 |
| `lib/webhook-helpers.ts` | 新規（純粋関数） |
| `app/api/stripe/webhook/route.ts` | 新規 |
| `app/(app)/pets/[petId]/album/[albumId]/order/[orderId]/page.tsx` | 新規 |
| `app/(app)/pets/[petId]/album/[albumId]/page.tsx` | 更新（注文状態表示） |
| `lib/supabase/database.types.ts` | 更新（mark_order_paid RPC型追加） |
| `tests/webhook.test.mjs` | 新規（33件） |
| `docs/task045-3b-implementation-report.md` | 新規（3b報告書） |

---

## 4. order complete route

`app/(app)/pets/[petId]/album/[albumId]/order/[orderId]/page.tsx`

- `params` の全UUIDを `UUID_RE` で検証
- `auth.getUser()` → 未認証は `/login` へ
- orders クエリ: `.eq("id", orderId).eq("owner_user_id", user.id).eq("album_id", albumId).eq("pet_id", petId)` — 4フィールド全一致
- `session_id` query param は表示に一切使用しない
- `order.status` を信頼源として表示

---

## 5. ownership / IDOR

```
orders.id       = orderId   (URLパラメータ)
owner_user_id   = user.id   (認証済みユーザー)
album_id        = albumId   (URLパラメータ)
pet_id          = petId     (URLパラメータ)
```

4条件いずれか不一致 → `notFound()` (404)

---

## 6. webhook route

`app/api/stripe/webhook/route.ts`

- `export const runtime = "nodejs"` — Edge Runtime 禁止
- `await request.text()` — 生 body (JSON parse 前) で署名検証
- `export async function POST(request: Request): Promise<Response>`

---

## 7. signature verification

```
1. body = await request.text()
2. sig = request.headers.get("stripe-signature")
   → なし: 400
3. STRIPE_WEBHOOK_SECRET 確認
   → なし: 500 (設定不足)
4. stripe.webhooks.constructEvent(body, sig, secret)
   → throw: 400 "Invalid signature"
5. 検証成功 → createAdminClient() を呼ぶ
```

署名検証成功前に DB 操作なし。

---

## 8. checkout.session.completed 処理

1. `session.payment_status !== "paid"` → 200 skip (無料注文等)
2. `session.metadata.order_id` / `album_id` を取得・UUID検証
3. `extractPaymentIntentId(session.payment_intent)` で PaymentIntent ID を文字列化
4. `adminClient.rpc("mark_order_paid", { p_order_id, p_stripe_session_id, p_payment_intent_id })`
5. DB エラー → 500

---

## 9. checkout.session.expired 処理

```sql
adminClient.from("orders")
  .update({ status: "cancelled", cancelled_at: ..., updated_at: ... })
  .eq("id", orderId)
  .eq("status", "pending")  -- paid orders are NEVER downgraded
```

`album.status` は変更しない（draft のまま）。

---

## 10. payment_intent.payment_failed 処理

```sql
adminClient.from("orders")
  .update({ status: "failed", updated_at: ... })
  .eq("id", orderId)
  .eq("status", "pending")  -- paid orders are NEVER changed
```

`album.status` は変更しない。

---

## 11. atomic update

`supabase/migrations/20260918130000_mark_order_paid.sql`

```sql
create or replace function public.mark_order_paid(
  p_order_id uuid, p_stripe_session_id text, p_payment_intent_id text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_album_id uuid; v_status text;
begin
  select album_id, status into v_album_id, v_status
    from public.orders where id = p_order_id for update;
  if not found then return; end if;          -- 不明order → no-op
  if v_status = 'paid' then return; end if;  -- 冪等
  if v_status <> 'pending' then return; end if; -- 遷移不可
  update public.orders set status='paid', paid_at=now(), ... where id=p_order_id;
  update public.albums set status='ordered', ... where id=v_album_id;
end;
$$;
revoke execute on function public.mark_order_paid(uuid,text,text) from public, anon, authenticated;
grant  execute on function public.mark_order_paid(uuid,text,text) to service_role;
```

`FOR UPDATE` でロックし、2つの UPDATE を同一トランザクション内で実行。

---

## 12. webhook idempotency

- `mark_order_paid` は `v_status = 'paid'` チェックで冪等 (同一 completed イベント再送でも paid_at は書き直さない)
- expired/payment_failed は `.eq("status", "pending")` フィルタで安全に再送可能

---

## 13. status transition

| from \ to | pending | paid | failed | cancelled |
|---|---|---|---|---|
| **pending** | - | ✅ RPC | ✅ `.eq(pending)` | ✅ `.eq(pending)` |
| **paid** | ✅ (元に戻せない) | ✅ (no-op) | ✗ | ✗ |
| **failed** | - | ✗ | - | - |
| **cancelled** | - | ✗ | - | - |

paid → failed/cancelled: `.eq("status", "pending")` フィルタで DB 側が保護。
failed/cancelled → paid: mark_order_paid の `v_status <> 'pending'` ガードで保護。

---

## 14. album.status 更新

`mark_order_paid` RPC 内で `albums.status = 'ordered'` に更新。orders と同一トランザクション。

expired/failed では album は draft のまま変更しない。

---

## 15. PaymentIntent 保存

```typescript
export function extractPaymentIntentId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as {id: unknown}).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}
```

string / PaymentIntent object / null を安全に処理。

---

## 16. PII ログ対策

ログに出力するのは:
- `event.id`
- `event.type`
- `order_id`

氏名・住所・電話番号・Stripe event 全文は出力しない。

---

## 17. Album detail 表示

`app/(app)/pets/[petId]/album/[albumId]/page.tsx` の更新:

1. latestOrder クエリ (status in pending/paid/failed, 最新1件) を追加
2. `album.status === "ordered"` の場合:
   - "注文済み" バナー + 注文ページリンクを表示
   - AlbumTitleForm / 写真追加 / AlbumPhotoControls / AlbumDeleteControl / フォトブックにするボタン を非表示
   - "この注文が確定後は編集できません" のメモ
3. `latestOrder?.status === "pending"` の場合: "お支払い確認中" バナー
4. `latestOrder?.status === "failed"` の場合: "お支払い失敗" バナー + 再注文リンク

---

## 18. Tests

`tests/webhook.test.mjs` — **33件全パス**

| テスト | 内容 |
|---|---|
| A | invalid signature → 400 (structural) |
| B | missing signature → 400 (structural) |
| C | completed + paid → isAllowedStatusTransition("pending","paid") |
| D | completed + unpaid → スキップ (structural) |
| E | order paid → album ordered (structural: RPC atomic) |
| F | completed 再送 → idempotent (structural: mark_order_paid) |
| G | expired pending → isAllowedStatusTransition("pending","cancelled") |
| H | expired paid → isAllowedStatusTransition("paid","cancelled")=false |
| I | payment_failed pending → isAllowedStatusTransition("pending","failed") |
| J | payment_failed paid → isAllowedStatusTransition("paid","failed")=false |
| K | PaymentIntent ID 抽出 (extractPaymentIntentId) |
| L | metadata album_id 存在チェック (structural) |
| M | 他人order → notFound (structural) |
| N | 別petId → notFound (structural) |
| O | 別albumId → notFound (structural) |
| P | session_id だけでは paid 表示しない (structural) |
| Q-T | status メッセージ (getOrderStatusMessage 純粋関数) |
| + 追加 | getOrderIdFromMetadata, extractPaymentIntentId, isUUID 等 |

---

## 19. typecheck / lint / build

- `npx tsc --noEmit` → **0 errors**（`.next` なし状態でも通過）
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → 成功

---

## 20. node tests

```
node --test tests/*.mjs → 168 tests, 168 pass, 0 fail
```

| ファイル | 件数 |
|---|---|
| album.test.mjs | 12 |
| checkout.test.mjs | 40 |
| checkout-session.test.mjs | 42 |
| orders-security.test.mjs | 21 |
| webhook.test.mjs | 33 |
| 他 | 20 |

---

## 21. git diff check

`git diff --check` → 出力なし

---

## 22. git status --short

```
M  .env.example
M  app/(app)/layout.tsx / app/(auth)/layout.tsx / app/layout.tsx
M  app/(app)/pets/[petId]/album/[albumId]/checkout/checkout-form.tsx
D  app/(app)/pets/[petId]/album/[albumId]/checkout/payment/page.tsx
M  app/(app)/pets/[petId]/album/[albumId]/page.tsx
M  lib/supabase/database.types.ts
M  package-lock.json / package.json
M  tests/checkout.test.mjs
?? checkout/actions.ts, order/[orderId]/, api/stripe/
?? lib/checkout-session-helpers.ts, lib/stripe/, lib/webhook-helpers.ts
?? supabase/migrations/20260918130000_mark_order_paid.sql
?? tests/checkout-session.test.mjs, tests/webhook.test.mjs
```

commit / push / merge 未実施。Remote Supabase 未操作。Production Stripe 未実施。

---

## 23. Remote 未適用 migration

`supabase/migrations/20260918130000_mark_order_paid.sql` はファイル作成のみ。

Remote apply (`supabase db push`) は会社 PC 環境のため実施していない。

---

## 24. Task045-3d に残す内容

1. **ローカル Supabase での migration 動作確認**: `supabase start` + `supabase db reset` で全 migration を適用し、`mark_order_paid` RPC の実際の動作を確認
2. **Stripe CLI での webhook ローカルテスト**: `stripe listen --forward-to localhost:3000/api/stripe/webhook` で実際のイベントフローを確認
3. **注文完了後の印刷 API 連携**: 印刷サービス API への注文データ送信
4. **注文一覧ページ**: `/pets/[petId]/orders` または `/account/orders` でのユーザー注文履歴
5. **email 通知**: 注文確定時のメール送信
6. **order_photos テーブル**: 印刷用の写真リスト永続化
