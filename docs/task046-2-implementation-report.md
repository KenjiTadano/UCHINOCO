# Task046-2 実装報告書 — 印刷用注文 snapshot DB 基盤 + Security Hardening

作成日: 2026-09-18  
ステータス: 実装完了（Remote Supabase 未適用 / commit 未実施）

---

## 1. migration 名

| ファイル | 内容 |
|---|---|
| `supabase/migrations/20260918140000_order_snapshot_print_jobs.sql` | orders snapshot columns / order_photos / print_jobs / DB mutation guard / mark_order_paid 拡張 / Storage DELETE policy |
| `supabase/migrations/20260918150000_albums_status_guard.sql` | albums.status 直接変更禁止トリガー |

---

## 2. orders snapshot columns

```sql
alter table public.orders
  add column album_title_snapshot         text,
  add column cover_photo_id_snapshot      uuid,       -- NOT FK（写真削除後も保持）
  add column cover_original_path_snapshot text;
```

`cover_photo_id_snapshot` は `photos` テーブルへの FK を持たない。理由: 元写真が削除されても注文 snapshot を永続保持するため。

---

## 3. order_photos schema

```sql
create table public.order_photos (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete restrict,
  photo_id       uuid references public.photos(id) on delete set null,  -- 写真削除後も行保持
  position       integer not null check (position >= 0),
  original_path  text not null,
  thumbnail_path text,
  taken_at       timestamptz,
  caption        text,
  created_at     timestamptz not null default now(),
  unique (order_id, position)
);
create index order_photos_order_position_idx on public.order_photos (order_id, position);
```

---

## 4. print_jobs schema

```sql
create table public.print_jobs (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  provider          text not null,
  idempotency_key   text not null unique,
  provider_order_id text unique,
  status            text not null default 'queued'
    check (status in ('queued','submitted','processing','shipped','failed','cancelled')),
  submitted_at timestamptz, shipped_at timestamptz, failed_at timestamptz,
  error_code text, tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS ENABLE + REVOKE ALL from authenticated, anon（UI 非公開）
```

---

## 5. mark_order_paid 拡張

同一トランザクション内での処理順:

1. `orders FOR UPDATE`（ロック）
2. status / session_id binding チェック（既存）
3. `albums FOR UPDATE` → title / cover_photo_id 取得
4. `photos` から cover_original_path 取得
5. `order_photos` INSERT（album_photos × photos の snapshot）
6. `orders` UPDATE: paid + album_title_snapshot + cover_* + paid_at + stripe 情報
7. `albums` UPDATE: status = 'ordered'

**冪等性**: 既に `orders.status = 'paid'` なら早期 return → `order_photos` は再 INSERT されない。`UNIQUE(order_id, position)` でも重複防止。

---

## 6. Album row lock

`mark_order_paid` 内で `albums FOR UPDATE` を取得。concurrent な Server Action の `album_photos` trigger（`assert_album_mutable`）が同じロックを待つ → `mark_order_paid` commit 後に `ordered` を検出 → 例外を発生。

---

## 7. DB mutation guard

### album_photos トリガー

```sql
create trigger album_photos_check_mutable
  before insert or update or delete on public.album_photos
  for each row execute function public.check_album_photos_mutable();
```

`check_album_photos_mutable`（SECURITY DEFINER）が `albums.status` を読み、`ordered` なら例外。INSERT/UPDATE/DELETE すべてをカバー。

### albums title トリガー

```sql
create trigger albums_title_check_mutable
  before update of title on public.albums
  for each row execute function public.check_album_title_mutable();
```

`OLD.status = 'ordered'` のときタイトル変更を拒否。

### albums status トリガー（Security Hardening）

```sql
create trigger albums_status_check_mutable
  before update of status on public.albums
  for each row execute function public.check_album_status_mutable();
```

`(select auth.uid()) is not null`（認証済みユーザー直接操作）なら全 status 変更を拒否。`auth.uid() = null`（service_role webhook）は許可 → `mark_order_paid` が `draft → ordered` に変更可能。将来の server-side archival（`ordered → archived`）も許可。

---

## 8. race condition 対策

`mark_order_paid` が `albums FOR UPDATE` を保持 → concurrent な `album_photos` 操作のトリガーが同じロックを待つ → `mark_order_paid` commit → `ordered` 検出 → トリガー例外。Server Action の `isAlbumEditable()` guard と DB トリガーの二重保護。

---

## 9. cover snapshot

`albums.cover_photo_id` → `photos.storage_path` を取得して `cover_original_path_snapshot` に保存。`cover_photo_id` が null なら両スナップショットも null。

---

## 10. photo snapshot

`mark_order_paid` 内で `album_photos JOIN photos` から全フィールドを `order_photos` に INSERT。`ORDER BY ap.position` で印刷順序を固定。

---

## 11. idempotency

- `v_status = 'paid'` なら早期 return（`order_photos` 再 INSERT なし）
- `UNIQUE(order_id, position)` で万一の重複も制約で防止

---

## 12. photo delete guard

`deletePhoto` Server Action（`getOwnedPhotoContext` 後、DB DELETE 前）に追加:

```typescript
const { count: orderedCount } = await supabase
  .from("order_photos")
  .select("id", { count: "exact", head: true })
  .eq("photo_id", photo.id);

if ((orderedCount ?? 0) > 0) {
  return {
    success: false,
    message: "この写真はご注文済みのアルバムに含まれているため削除できません。",
  };
}
```

RLS により自分の paid 注文のみ参照。pending 注文は `order_photos` 行を持たないためガードに引っかからない。

---

## 13. Storage delete 経路確認結果

**脆弱性を発見・修正済み:**

既存の `pet-photos` DELETE ポリシーは `order_photos` 参照チェックがなく、Client から直接 Storage DELETE が可能だった（`supabase.storage.from("pet-photos").remove([path])` で paid order の original を削除できた）。

**修正内容（migration 内で policy を差し替え）:**

```sql
-- paid order_photos が参照するパスの直接削除を禁止
and not exists (
  select 1 from public.order_photos op
  join public.orders o on o.id = op.order_id
  where op.original_path = name and o.status = 'paid'
)
-- paid order の cover snapshot も保護
and not exists (
  select 1 from public.orders o
  where o.cover_original_path_snapshot = name and o.status = 'paid'
)
```

---

## 14. RLS

| テーブル | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `order_photos` | `orders.owner_user_id = auth.uid()` via JOIN | REVOKE from authenticated, anon |
| `print_jobs` | なし（REVOKE ALL） | REVOKE ALL from authenticated, anon |

---

## 15. provider types

`lib/print/types.ts`（`import "server-only"`）

- `PrintProvider` interface: `submitOrder / getJobStatus / cancelJob`
- `PrintOrderParams`: orderId, productId, pages, coverType, items[], recipient
- `PrintOrderItem`: position, storagePath, takenAt, caption
- `PrintJobResult` / `PrintJobStatus`

実 provider 実装は `lib/print/providers/`（Task047+）。

---

## 16. security tests

| ファイル | 件数 |
|---|---|
| `tests/order-snapshot.test.mjs` | 27 件（A–T + 追加） |
| `tests/albums-status-guard.test.mjs` | 15 件（A–K + 追加） |

---

## 17. existing regression

既存 225 件（Task046-2 実装後）すべて維持。

---

## 18. typecheck / lint / build

- `npx tsc --noEmit` → **0 errors**（`.next` なしで通過）
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → 成功

---

## 19. node tests 総数

```
node --test tests/*.mjs → 240 tests, 240 pass, 0 fail
```

| ファイル | 件数 |
|---|---|
| 既存テスト群 | 198 |
| order-snapshot.test.mjs | 27 |
| albums-status-guard.test.mjs | 15 |
| 合計 | **240** |

---

## 20. git status --short

```
 M app/(app)/pets/[petId]/photos/[photoId]/actions.ts
 M lib/supabase/database.types.ts
?? lib/print/
?? supabase/migrations/20260918140000_order_snapshot_print_jobs.sql
?? supabase/migrations/20260918150000_albums_status_guard.sql
?? tests/albums-status-guard.test.mjs
?? tests/order-snapshot.test.mjs
```

commit / push / merge 未実施。Remote Supabase 未操作。印刷会社 API 接続なし。

---

## 21. Remote 未適用 migration

| migration | 内容 |
|---|---|
| `20260918140000_order_snapshot_print_jobs.sql` | order_photos / print_jobs / DB guard / mark_order_paid 拡張 |
| `20260918150000_albums_status_guard.sql` | albums.status 直接変更禁止 |

両ファイルとも `supabase db push` 未実施。

---

## 22. Task046-3 への注意点

1. **migration 適用順**: `20260918140000` → `20260918150000` の順で適用が必要。`mark_order_paid` が `order_photos` テーブルを参照するため、`20260918140000` を先に適用すること
2. **webhook テスト**: `stripe listen --forward-to localhost:3000/api/stripe/webhook` で実際の paid 遷移を確認し、`order_photos` が正しく生成されることを検証
3. **`reorder_album_photos` RPC**: `album_photos` UPDATE トリガーが発火する。ordered album への reorder は DB 例外となる（Server Action が `"並び替えの保存に失敗しました。"` を返す）
4. **注文完了ページへの order_photos 追加**: Task046-3 で `order_photos` を使った印刷確認プレビューを実装予定
5. **print_jobs の注文投入**: Task047 以降で `mark_order_paid` webhook から `print_jobs` への自動投入を実装
6. **albums.status guard と future archival**: `ordered → archived` は service_role（auth.uid() = null）からは実行可能。将来の server-side archival Server Action は `createAdminClient()` 経由で実施すること
