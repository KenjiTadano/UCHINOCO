# Task046-1 設計レビュー — 印刷用データ固定・印刷会社連携

作成日: 2026-09-18  
ステータス: 設計のみ（コード変更・migration・Remote 操作なし）

---

## 背景・課題

Task045 までで以下を実装済み:

- `albums` / `album_photos` / `orders` テーブル
- Stripe Checkout Session 作成・webhook 処理
- `orders.status = paid` / `albums.status = ordered`
- paid 後の Album 編集禁止 (Server Action guard + RLS)

**現在の課題:**  
支払い後に「どの写真をどの順番で印刷するか」が永続化されていない。  
`album_photos` は将来の編集で変わる可能性があり、注文時点の内容を確実に再現できない。

---

## 1. 推奨 order_photos schema

```sql
-- 考え方:
--   photo_id は nullable (ユーザーが後で写真を削除してもレコードを保持)
--   original_path / thumbnail_path は注文時点のスナップショット (FK 非依存)
--   position が印刷順の正式記録

create table public.order_photos (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete restrict,
  photo_id       uuid references public.photos(id) on delete set null, -- 削除後も行を保持
  position       integer not null check (position >= 0),

  -- ストレージスナップショット (写真削除後も印刷に使える)
  original_path  text not null,
  thumbnail_path text,

  -- メタデータスナップショット (印刷会社への付帯情報用)
  taken_at       timestamptz,
  caption        text,

  created_at     timestamptz not null default now(),

  unique (order_id, position)  -- 同一注文内で position 重複禁止
);

create index order_photos_order_position_idx
  on public.order_photos (order_id, position);
```

### スナップショットすべき項目

| カラム | 理由 |
|---|---|
| `original_path` | 写真削除後も印刷処理で参照できる |
| `thumbnail_path` | 注文確認 UI で表示できる |
| `taken_at` | 印刷会社へのメタデータ |
| `caption` | 将来的なページレイアウト機能用 |

### 参照 (FK) で十分な項目

| カラム | 理由 |
|---|---|
| `photo_id` | 削除後は NULL になるが、path snapshot があるので印刷は可能。注文確認 UI での詳細リンク用に保持 |

---

## 2. snapshot 対象

| 情報 | 場所 | 方針 |
|---|---|---|
| 印刷写真リスト (順番) | `order_photos` 新設 | ✅ 新規スナップショット必須 |
| 写真ストレージパス | `order_photos.original_path` | ✅ 写真削除耐性のためスナップショット |
| アルバムタイトル | `orders.album_title_snapshot` 追加 | ✅ 注文確認 UI・印刷表紙用 |
| 商品情報 | `orders.product_*` | 実装済み |
| 配送先住所 | `orders.shipping_*` | 実装済み |
| 価格 | `orders.subtotal/shipping_fee/total` | 実装済み |
| カバー写真 | `order_photos` の `position = 0` が事実上のカバー | 別カラム不要 |

`orders` テーブルに **`album_title_snapshot text`** カラムを追加するだけで足りる。

---

## 3. snapshot タイミング

**推奨: C — payment success webhook 時**

| 案 | タイミング | 問題点 |
|---|---|---|
| A. Checkout 開始時 | pending order 作成前 | Stripe 画面移動後に Album を編集できる → 内容が古くなる |
| B. pending order 作成時 | `createCheckoutSession` 内 | 同上。Stripe 画面で数分かかる間に別タブ編集が可能 |
| **C. 支払い成功 webhook 時** | `mark_order_paid` RPC 実行時 | ✅ `albums.status = 'ordered'` と同じトランザクションでスナップショット → 以降の編集は locked |

**実装方針:**  
`mark_order_paid` RPC を拡張し、同一トランザクション内で以下を原子的に実行:

1. `orders.status = 'paid'`
2. `orders.album_title_snapshot = (SELECT title FROM albums WHERE id = v_album_id)`
3. `INSERT INTO order_photos SELECT ... FROM album_photos WHERE album_id = v_album_id`
4. `albums.status = 'ordered'`

---

## 4. race condition 対策

**シナリオ:**

```
ユーザーA: checkout 開始 → Stripe 画面へ移動
ユーザーA (別タブ): album 写真を追加・削除
ユーザーA: Stripe で支払い完了
webhook 受信 → どの状態をスナップショットするか？
```

**推奨: 「webhook 時点の album_photos を採用」**

理由:
- `mark_order_paid` が `orders FOR UPDATE` ロックを取得した上で、album_photos INSERT と `albums.status = 'ordered'` を同一トランザクション内で完結させるため一貫性が保たれる
- ユーザーが支払い直前まで album を自由に編集できる UX を尊重している
- 支払い直前の最新状態がユーザーの意図した内容である

**懸念がある場合の v2 案:**  
pending order 作成時に `album_photos` のハッシュ（写真 ID の順序付きリスト）を保存し、webhook 時に変化していた場合はユーザーへ通知する。ただし v1 では不要。

---

## 5. Storage 戦略

| 案 | 概要 | メリット | デメリット |
|---|---|---|---|
| A. 削除禁止 | 注文済み写真を物理削除不可 | シンプル | UX が悪い (写真を整理できない) |
| B. soft delete | `photos.deleted_at` を追加 | 柔軟 | スキーマ変更大、複雑 |
| **C. 注文専用 bucket へコピー** | 支払い時に `order-photos` bucket へ original をコピー | 完全に独立、写真削除自由 | コスト・処理時間増加 |
| **D. path snapshot のみ + 削除ガード** | `order_photos.original_path` に保存、Server Action でガード | シンプル | ガードを外すと破損リスク |

**v1 推奨: D (path snapshot + Server Action 削除ガード)**

- `order_photos.original_path` に注文時点のパスを保存
- 写真削除 Server Action で `order_photos` を検索し、`paid` 状態の注文が参照していれば削除を拒否
- ユーザー向けメッセージ: 「この写真はご注文済みのアルバムに含まれているため削除できません」

**将来 (v2) 推奨: C (bucket コピー)**  
印刷フロー安定後に `order-photos` private bucket へコピーし、削除制限を解除。

---

## 6. Photo delete 方針

```
写真削除 Server Action の判定ロジック (v1):

1. 削除対象 photo_id を order_photos で検索
2. 関連 order が status IN ('pending', 'paid') → 削除拒否
3. status IN ('cancelled', 'failed') のみ参照 → 削除許可
4. order_photos に存在しない → 通常通り削除
```

`ON DELETE RESTRICT` は使わない（エラーメッセージをユーザー向けにカスタマイズできないため）。Server Action 側でガードする。

---

## 7. original 取得方法 (印刷処理)

| 方法 | 概要 | リスク |
|---|---|---|
| A. signed URL を provider へ渡す | 短い処理なら有効 | provider が非同期の場合、URL 期限切れで失敗 |
| **B. サーバーで download → provider へ upload** | 信頼性高い | 処理負荷増加 |
| C. provider が pull するためのオープン URL | 設計簡単 | 秘密情報が URL に含まれるとセキュリティリスク |

**推奨: B (サーバー経由 download → upload)**

理由: signed URL の有効期限問題を完全に回避。印刷品質に影響するため、ダウンロード失敗を確実に検知・リトライできる。

```
webhook paid → print job 作成 →
  for each order_photo:
    supabase.storage.from("pet-photos").download(original_path)
    → upload to provider API
```

サーバーサイド限定処理（Server Action または API Route + service role）。

---

## 8. print_jobs の要否

**必要。orders テーブルとの分離を推奨。**

理由:
- 1 注文で印刷 job が複数回走る可能性がある (失敗 → 再試行)
- 印刷ステータスは財務ステータス (paid) とは独立したライフサイクル
- provider ごとのデータ (provider_order_id, tracking_number) を orders に混入させない

```sql
create table public.print_jobs (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  provider          text not null,           -- 'mockprint' | 'fujifilm' | etc.
  idempotency_key   text not null unique,    -- 二重送信防止
  provider_order_id text unique,             -- provider 側の ID (取得後に UPDATE)
  status            text not null default 'queued'
    check (status in ('queued','submitted','processing','shipped','failed','cancelled')),
  submitted_at      timestamptz,
  shipped_at        timestamptz,
  failed_at         timestamptz,
  error_code        text,
  tracking_number   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index print_jobs_order_idx on public.print_jobs (order_id);
```

---

## 9. status 設計

**推奨: orders / print_jobs を分離した 2 テーブル管理**

```
orders.status (財務):
  pending → paid          (terminal)
  pending → cancelled     (terminal)
  pending → failed        (terminal)

print_jobs.status (物流):
  queued → submitted → processing → shipped   (terminal)
                                 ↘ failed     (→ retry で新 job 作成)
```

| 案 | 評価 |
|---|---|
| orders.status に printing / shipped 追加 | ✗ 財務 status が汚染される。既存 webhook idempotency が壊れるリスク |
| **print_jobs.status で分離** | ✅ 関心分離。orders は財務状態のみ。print_jobs は何度でも再作成可能 |

---

## 10. provider abstraction

```typescript
// lib/print/types.ts (server-only)

export type PrintOrderItem = {
  position: number;
  storagePath: string;   // original_path のスナップショット
};

export type PrintOrderParams = {
  orderId: string;       // idempotency key のベース
  productId: string;
  pages: number;
  coverType: "soft" | "hard";
  items: PrintOrderItem[];
  recipient: {
    lastName: string;
    firstName: string;
    postalCode: string;
    prefecture: string;
    city: string;
    address1: string;
    address2?: string;
    phone: string;
  };
};

export type PrintJobResult = {
  providerOrderId: string;
  status: "submitted" | "queued";
};

export interface PrintProvider {
  submitOrder(params: PrintOrderParams): Promise<PrintJobResult>;
  getJobStatus(providerOrderId: string): Promise<{
    status: string;
    trackingNumber?: string;
  }>;
  cancelJob(providerOrderId: string): Promise<void>;
}
```

Provider 実装は `lib/print/providers/` 以下に分離。  
本番は環境変数 `PRINT_PROVIDER=fujifilm` 等で切り替え。  
`MockPrintProvider` を開発・テスト用に実装する。

---

## 11. provider payload

### orders テーブルから使うもの

| フィールド | 用途 |
|---|---|
| `product_size`, `product_cover_type` | 製本仕様 |
| `pages` | ページ数 |
| `shipping_last_name`, `shipping_first_name` | 配送先氏名 |
| `shipping_postal_code` ～ `shipping_phone` | 配送先住所 |
| `id` | idempotency key のベース |

### order_photos テーブルから使うもの

| フィールド | 用途 |
|---|---|
| `original_path` → download → upload | 印刷用画像 |
| `position` | ページ順 |
| `taken_at`, `caption` | 将来のページデザイン機能用 |

---

## 12. privacy

| 情報 | 扱い |
|---|---|
| 氏名・住所・電話 | provider API 送信時のみ使用。ログに出力しない |
| 写真 | provider への転送は HTTPS のみ。signed URL をログに残さない |
| `provider_order_id` | `print_jobs` テーブルに保存。Client API レスポンスに返さない |
| `tracking_number` | ユーザーへ表示可能（配送情報）。ログは最小限 |

**ログに出してよいもの:** `order_id`, `print_job.id`, `event_type`, `status`

---

## 13. retry 設計

```
print_jobs.idempotency_key = '{order_id}-attempt-{N}'

retry フロー:
1. 既存 print_job を idempotency_key で確認
2. status = 'submitted' / 'processing' → getJobStatus のみ (新規送信しない)
3. status = 'failed' → N を +1 して新規 print_job 作成
4. provider_order_id が既に存在 → getJobStatus を呼ぶ
```

---

## 14. idempotency

- **idempotency_key**: `order_id + attempt_number` の組み合わせ（例: `ord_xxxx-attempt-1`）
- provider 送信前に `idempotency_key` で既存 job を DB 検索
- 存在すれば `provider_order_id` を使って status を問い合わせ、新規作成しない
- provider が独自の idempotency key ヘッダーをサポートする場合はそれを使う

---

## 15. timeout 対策

```
タイムアウト時のフロー:

1. provider API を呼び出し → timeout
2. print_job.status を 'submitted' のまま保持 (失敗扱いにしない)
3. バックグラウンドで provider_order_id の存在を確認
   - 存在する → provider 側では受け付けられていた → status を更新
   - 存在しない → 未受付 → 再送可能 (idempotency_key で dedup)
4. 二重印刷防止: idempotency_key により provider 側でも dedup される
```

---

## 16. order history との関係

| 情報 | 信頼源 | UI での用途 |
|---|---|---|
| 支払い状態 | `orders.status` | 注文確認ページ（実装済み） |
| 印刷・配送状態 | `print_jobs.status` | 将来の注文一覧・配送状況 |

**ユーザー向け表示の優先度:**

| 状態 | 表示 |
|---|---|
| `orders.status = paid` | 「ご注文確定」 |
| `print_jobs.status = processing` | 「印刷中」 |
| `print_jobs.status = shipped` | 「発送済み・追跡番号: XXX」 |
| `print_jobs.status = failed` | 「印刷エラー（運営が対応中）」 |

**v1 では `print_jobs` を UI に出す必要はない。** `orders.status = paid` 表示のみで十分。

---

## 17. delete policy

| 対象 | 方針 | 理由 |
|---|---|---|
| `orders` | 永続保持 (DELETE 不可) | 財務記録・配送記録 |
| `order_photos` | 永続保持 (DELETE 不可) | 印刷の証跡 |
| `photos`（注文参照あり） | Server Action で削除ガード | 印刷処理中に original が消えないよう |
| `albums` | `ON DELETE RESTRICT`（現在の orders FK） | 注文済みアルバムは削除不可 |
| `pets` | `ON DELETE RESTRICT`（現在の orders FK） | 注文済みペットは削除不可 |
| `auth.users` | `ON DELETE RESTRICT`（現在の orders FK） | 注文済みユーザーは削除不可 |
| 配送住所 | `orders` テーブル内スナップショットなので自動保持 | |
| `print_jobs` | 保持（retry の証跡） | |

**ユーザーアカウント削除リクエストへの対応（将来）:**  
未配送注文が存在する間は技術的に削除不可。注文完了後は氏名→`[削除済み]`・住所→`[削除済み]` に匿名化する方針を将来策定する。

---

## 18. migration 案 (次 Task 用)

### ① orders テーブルへのカラム追加

```sql
alter table public.orders
  add column album_title_snapshot text;
```

### ② order_photos テーブル新設 + RLS

```sql
create table public.order_photos (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete restrict,
  photo_id       uuid references public.photos(id) on delete set null,
  position       integer not null check (position >= 0),
  original_path  text not null,
  thumbnail_path text,
  taken_at       timestamptz,
  caption        text,
  created_at     timestamptz not null default now(),
  unique (order_id, position)
);

create index order_photos_order_position_idx
  on public.order_photos (order_id, position);

alter table public.order_photos enable row level security;

create policy "order_photos: owner select"
  on public.order_photos for select
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_photos.order_id
         and o.owner_user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.order_photos from authenticated, anon;
```

### ③ print_jobs テーブル新設

```sql
create table public.print_jobs (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  provider          text not null,
  idempotency_key   text not null unique,
  provider_order_id text unique,
  status            text not null default 'queued'
    check (status in ('queued','submitted','processing','shipped','failed','cancelled')),
  submitted_at      timestamptz,
  shipped_at        timestamptz,
  failed_at         timestamptz,
  error_code        text,
  tracking_number   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index print_jobs_order_idx on public.print_jobs (order_id);

-- print_jobs は UI 非公開。ユーザーにはアクセスさせない。
alter table public.print_jobs enable row level security;
revoke all on public.print_jobs from authenticated, anon;
```

### ④ mark_order_paid RPC の拡張（概要）

```sql
-- 既存 mark_order_paid に以下を追加（新 migration として置換）:
-- 1. orders.album_title_snapshot の更新
-- 2. order_photos の INSERT (album_photos から)
-- (既存の status/paid_at/albums.status 更新は維持)

update public.orders
   set album_title_snapshot = (
         select title from public.albums where id = v_album_id
       )
 where id = p_order_id;

insert into public.order_photos
  (order_id, photo_id, position, original_path, thumbnail_path, taken_at, caption)
select
  p_order_id,
  ap.photo_id,
  ap.position,
  ph.storage_path,
  ph.thumbnail_path,
  ph.taken_at,
  ph.caption
from public.album_photos ap
join public.photos ph on ph.id = ap.photo_id
where ap.album_id = v_album_id
order by ap.position;
```

---

## 19. security

| 項目 | 設計 |
|---|---|
| `order_photos` SELECT | RLS で `orders.owner_user_id = auth.uid()` のみ |
| `order_photos` INSERT/UPDATE/DELETE | `REVOKE from authenticated, anon` — webhook/service_role のみ |
| `print_jobs` 全操作 | `REVOKE ALL from authenticated, anon` — UI 非公開 |
| provider callback 認証 | webhook secret 検証（Stripe 方式に準じる） |
| service role 使用範囲 | `mark_order_paid` RPC 呼び出し（webhook のみ）+ print job 作成 |
| signed URL | ログに出さない。有効期限を最小限に |
| IDOR | `order_photos` は orders 経由で `owner_user_id` を照合 |
| `provider_order_id` 露出 | Client API レスポンスに含めない |
| PII in print_jobs | `print_jobs` に住所・氏名を保存しない（orders から参照） |

---

## 20. v1 で実装する最小範囲 (Task046-2)

| 項目 | 優先度 | 内容 |
|---|---|---|
| `order_photos` テーブル作成 | **必須** | migration + RLS |
| `orders.album_title_snapshot` 追加 | **必須** | migration |
| `mark_order_paid` RPC 拡張 | **必須** | order_photos INSERT + title snapshot を原子的に |
| 写真削除ガード (Server Action) | **必須** | paid 注文参照中の写真削除を拒否 |
| `print_jobs` テーブル作成 | **推奨** | 構造だけ作っておく（integration はまだ） |
| `lib/print/types.ts` 定義 | **推奨** | provider 決定前に型を固める |

---

## 21. 後回しにするもの

| 項目 | タイミング |
|---|---|
| 実際の印刷会社 API 連携 | 印刷会社決定後（Task047+） |
| print job 自動投入（webhook から） | 印刷会社決定後 |
| retry / status polling cron | 印刷会社決定後 |
| tracking 番号のユーザー表示 | 発送フロー確定後 |
| 注文一覧ページ | Task046+ |
| photo 削除後の `order-photos` bucket コピー（v2） | 印刷フロー安定後 |
| ユーザーアカウント削除の匿名化 | 法的要件確定後 |
| 印刷品質（DPI / color profile）仕様 | 印刷会社決定後 |

---

## 22. 最大のリスク

| リスク | 深刻度 | 対策 |
|---|---|---|
| **写真削除による印刷不可** | 高 | v1: 削除ガード。v2: bucket コピー |
| **PII（住所・氏名・写真）の漏洩** | 高 | server-only API 呼び出し。ログ禁止。HTTPS 必須 |
| **provider API timeout による二重印刷** | 中 | idempotency_key による dedup |
| **race condition でのスナップショット漏れ** | 中 | mark_order_paid の FOR UPDATE ロックで十分 |
| **Storage path 命名変更** | 低 | order_photos.original_path スナップショットで吸収 |
| **mark_order_paid RPC 拡張で既存 webhook 破損** | 中 | 拡張前に既存テスト 198 件で regression 確認必須 |

---

## 23. 次 Task の分割案

### Task046-2: DB 基盤（migration のみ）

- `order_photos` テーブル + RLS
- `print_jobs` テーブル
- `orders.album_title_snapshot` 追加
- `mark_order_paid` RPC 拡張（order_photos INSERT + title snapshot）
- 写真削除 Server Action ガード
- `database.types.ts` 更新
- security tests 追加

### Task046-3: 印刷データ確認 UI

- 注文完了ページで `order_photos` を表示（印刷プレビュー）
- `album_title_snapshot` の表示
- 注文一覧ページ `/pets/[petId]/orders`

### Task047: 印刷会社 API 連携（印刷会社決定後）

- `lib/print/providers/` 実装（MockProvider + 実 Provider）
- webhook → print_job 自動作成
- retry / status polling
- tracking 番号のユーザー表示
