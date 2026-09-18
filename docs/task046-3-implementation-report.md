# Task046-3 実装報告書 — 注文履歴 + 印刷内容プレビュー UI

作成日: 2026-09-18  
ステータス: 実装完了（Remote Supabase 未適用 / commit 未実施）

---

## 1. 変更ファイル

| ファイル | 種別 |
|---|---|
| `app/(app)/account/orders/page.tsx` | 新規（注文履歴一覧） |
| `app/(app)/album/page.tsx` | 更新（「注文履歴」テキストリンク追加） |
| `app/(app)/pets/[petId]/album/[albumId]/order/[orderId]/page.tsx` | 更新（snapshot 対応 + order_photos preview） |
| `lib/order-helpers.ts` | 新規（純粋ヘルパー関数） |
| `tests/order-history.test.mjs` | 新規（28 件） |

---

## 2. 注文履歴 route

`/account/orders` — 全ペット横断の注文履歴ページ。

- Server Component（`app/(app)/account/orders/page.tsx`）
- `auth.getUser()` → 未認証は `/login` へ
- `orders` クエリ: `.eq("owner_user_id", user.id)` + RLS 二重フィルタ
- 並び順: `created_at DESC`
- 初期 LIMIT: 20（将来 cursor/offset pagination へ拡張可能な構造）

---

## 3. navigation

Album TOP (`app/(app)/album/page.tsx`) の `app-back-link` 行を flex コンテナに変更し、右端に `注文履歴` テキストリンクを追加。

```tsx
<div className="flex items-start justify-between">
  <Link className="app-back-link" href="/home">ホームへ戻る</Link>
  <Link href="/account/orders" className="ds-focus text-xs text-muted hover:text-foreground">
    注文履歴
  </Link>
</div>
```

Bottom Navigation は変更なし（主役にしすぎない方針）。

---

## 4. history query

```typescript
const { data: rawOrders } = await supabase
  .from("orders")
  .select("id, album_title_snapshot, product_name, product_size, product_cover_type_label, pages, total, status, created_at, cover_original_path_snapshot, pet_id, album_id")
  .eq("owner_user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(20);
```

pet 名は `pets(id, name)` を別途クエリし `Map<petId, name>` で参照（JOIN 型推論の複雑さを回避）。

---

## 5. snapshot title

`lib/order-helpers.ts` の `getOrderDisplayTitle(snapshotTitle, fallback)`:

| 条件 | 表示 |
|---|---|
| `album_title_snapshot` が存在 | snapshot を使用（注文時点のタイトル） |
| snapshot が null / 空文字 | 現在の `album.title` を fallback |
| 両方 null / 空 | 「（タイトル未設定）」 |

注文一覧・詳細ページの両方で適用。

---

## 6. snapshot cover

**旧実装**: `album_photos` JOIN `photos` → `AlbumCoverCollage`（現在の写真を使用）  
**新実装**: `cover_original_path_snapshot` → `supabase.storage.from("pet-photos").createSignedUrl(coverPath, 3600)` → 単体カバー画像

- サーバーサイドのみで signed URL 生成（3600 秒有効）
- `cover_original_path_snapshot` が null の場合はプレースホルダー表示
- `album_photos` への依存を完全に排除

---

## 7. status UI

### 一覧ページ

| status | ラベル | スタイル |
|---|---|---|
| `paid` | `ご注文確定` | `text-success` |
| `pending` | `お支払い確認中` | `text-muted` |
| `failed` | `お支払い未完了` | `text-danger/70` |
| `cancelled` | `キャンセル` | `text-danger/70` |

### 詳細ページ（OrderStatusBanner）

| status | ヘッダー | 追加情報 |
|---|---|---|
| `paid` | `CONFIRMED` | 製本・印刷に数営業日いただく旨 |
| `pending` | `PROCESSING` | 再読み込みリンク |
| `failed` | `FAILED` | `再注文する` → `/product` |
| `cancelled` | `CANCELLED` | `注文内容へ戻る` → `/product` |

赤い管理 badge ではなく editorial テキストスタイルで表示。

---

## 8. order detail

既存の OrderStatusBanner・注文サマリーカードを維持しつつ以下を変更:

1. **カバー表示**: `cover_original_path_snapshot` の signed URL で単体書籍カバー画像（3/4 アスペクト比、書籍脊のシャドウ付き）
2. **タイトル**: `album_title_snapshot` 優先
3. **注文番号**: `getShortOrderId()` → `#XXXXXXXX`（UUID 末尾 8 文字大文字）
4. **注文日**: 注文サマリーカード内に追加
5. **配送先**: `shipping_prefecture`（都道府県）のみ表示
6. **「注文履歴」リンク**: 右上に追加（`/account/orders` へ）

---

## 9. order_photos preview

paid orders のみ表示（`hasOrderPhotoPreview("paid") === true`）:

```typescript
const { data: rawPhotos } = await supabase
  .from("order_photos")
  .select("id, position, original_path, thumbnail_path, taken_at, caption")
  .eq("order_id", orderId)
  .order("position", { ascending: true });
```

- 現在の `album_photos` は一切使用しない（注文 snapshot が信頼源）
- 3カラム editorial grid
- 左上に position + 1 のページ番号バッジ
- 写真数を `{N}枚` で表示
- 「注文確定時点の写真順序」旨の注釈

---

## 10. signed URL

| 対象 | bucket | method | 有効期限 |
|---|---|---|---|
| カバー画像（一覧・詳細） | `pet-photos` | `createSignedUrl` | 3600秒 |
| order_photos thumbnail | `pet-photo-thumbnails` | `createSignedUrls` | 3600秒 |
| order_photos original（thumb なし） | `pet-photos` | `createSignedUrls` | 3600秒 |

- Storage path をクライアントに直接返さない
- signed URL をログに出力しない
- ownership 確認後にのみ生成

---

## 11. thumbnail fallback

`getOrderPhotoDisplayPath(photo)`:

```typescript
if (photo.thumbnail_path) {
  return { path: photo.thumbnail_path, bucket: "pet-photo-thumbnails" };
}
return { path: photo.original_path, bucket: "pet-photos" };
```

- thumbnail が存在すれば `pet-photo-thumbnails` bucket を優先
- null の場合のみ original（`pet-photos`）を使用
- original の大量一括読み込みを回避

---

## 12. order summary

注文詳細で表示する情報:

| 項目 | ソース |
|---|---|
| 注文番号 | `orders.id`（短縮形） |
| 注文日 | `orders.created_at` |
| 商品 | `orders.product_name` |
| サイズ | `orders.product_size` |
| カバー | `orders.product_cover_type_label` |
| ページ数 | `orders.pages` |
| 商品小計 | `orders.subtotal` |
| 送料 | `orders.shipping_fee` |
| 合計 | `orders.total` |
| 配送先 | `orders.shipping_prefecture`（都道府県のみ） |

---

## 13. PII 表示方針

**表示しないもの**: `shipping_last_name` / `shipping_first_name` / `shipping_address1` / `shipping_address2` / `shipping_phone`

**表示するもの**: `shipping_prefecture`（都道府県のみ）

氏名・住所全文・電話番号は EC 管理画面的な表示にならないよう省略。配送確認は印刷会社経由で行う想定。

---

## 14. failed / cancelled / pending

| status | order_photos | CTA |
|---|---|---|
| `failed` | なし（snapshot 未作成） | 再注文する → `/product` |
| `cancelled` | なし（snapshot 未作成） | 注文内容へ戻る → `/product` |
| `pending` | なし（webhook 未到達） | 再読み込み |
| `paid` | あり → preview 表示 | アルバムへ戻る |

注: albums.status が `ordered` の場合はアルバム詳細から「フォトブックにする」が非表示になるため、再注文 CTA は ordered でない場合のみ実質的に機能する。

---

## 15. empty state

```tsx
{orders.length === 0 && (
  <div className="py-10 text-center">
    <p className="text-muted">まだ注文したフォトブックはありません</p>
    <Link href="/album" className="app-button-secondary mx-auto mt-6 inline-flex">
      アルバムを見る
    </Link>
  </div>
)}
```

---

## 16. mobile (390px)

- 一覧: `w-14 h-20` の書籍カバー画像 + 右テキスト（1カラム）
- `app-page` クラスで Bottom Nav との重なりなし
- テキストは `truncate` で長タイトルの折り返しを防止

---

## 17. desktop (1280px)

- `max-w-xl` 中央配置でエディトリアルリスト
- テーブル・管理画面感なし
- PHOTO FIRST / WARM MINIMAL / EDITORIAL デザイン維持

---

## 18. accessibility

| 項目 | 実装 |
|---|---|
| カバー alt | `"${displayTitle}の表紙"` |
| status 色のみでない表現 | テキストラベル + 色を併用 |
| Link hit area | `ds-focus` + `min-h-11` |
| 写真 alt | caption or `"${title}の写真 ${i+1}"` |
| semantic heading | `<h1>` 注文タイトル / `<h2>` 各セクション |
| focus-visible | `ds-focus` クラス全 Link に適用 |

---

## 19. security / IDOR

| チェック | 実装 |
|---|---|
| 一覧: owner filter | `.eq("owner_user_id", user.id)` + RLS |
| 詳細: IDOR | `id + owner_user_id + album_id + pet_id` 全 4 フィールド照合 |
| order_photos RLS | `orders.owner_user_id = auth.uid()` 経由で照合 |
| signed URL | ownership 確認後のみ生成 |
| Storage path | Client に直接返さない |

---

## 20. tests

`tests/order-history.test.mjs` — **28 件全パス**

| テスト | 内容 |
|---|---|
| A | owner filter structural |
| B | RLS による他ユーザー非表示 structural |
| C | created_at DESC structural |
| D | getOrderDisplayTitle: snapshot 優先（4パターン） |
| E | cover snapshot 使用 structural |
| F | 4-field IDOR structural |
| G | hasOrderPhotoPreview: paid のみ true |
| H | position ASC structural |
| I | getOrderPhotoDisplayPath: thumbnail 優先 |
| J | thumbnail null → original fallback |
| K-M | hasOrderPhotoPreview: pending/failed/cancelled = false |
| N | hasOrderPhotoPreview: paid = true |
| O | getShortOrderId: #XXXXXXXX 形式 2件 |
| P | PII 非表示 structural |
| Q | empty state structural |
| R | failed/cancelled retry CTA structural 2件 |
| S | ordered album retry 不可 structural |
| T | signed URL ownership 後生成 2件 |
| + | getOrderStatusLabel 4件 / formatOrderDate 1件 |

---

## 21. typecheck / lint / build

- `npx tsc --noEmit` → **0 errors**（`.next` なしで通過）
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → 成功

TypeScript の `createSignedUrls` 戻り値の `item.path` / `item.signedUrl` が `string | null` に型付けされるため、ローカル変数に一度代入して null ガードを実施。

---

## 22. node tests 総数

```
node --test tests/*.mjs → 268 tests, 268 pass, 0 fail
```

| ファイル | 件数 |
|---|---|
| 既存テスト群（Task045-3x + 046-2x） | 240 |
| order-history.test.mjs | 28 |
| 合計 | **268** |

---

## 23. git status --short

```
 M app/(app)/album/page.tsx
 M app/(app)/pets/[petId]/album/[albumId]/order/[orderId]/page.tsx
?? app/(app)/account/
?? lib/order-helpers.ts
?? tests/order-history.test.mjs
```

commit / push / merge 未実施。Remote Supabase 未操作。印刷会社 API 接続なし。

---

## 24. 自宅 PC で必要な確認

| 優先度 | 作業 |
|---|---|
| 必須 | `supabase db reset` で migration 20260918140000 → 20260918150000 を適用 |
| 必須 | Stripe CLI テスト支払い → webhook → `order_photos` 生成を E2E 確認 |
| 必須 | `/account/orders` に実注文データが表示されることを確認 |
| 必須 | paid 注文詳細ページで order_photos grid が表示されることを確認 |
| 必須 | `cover_original_path_snapshot` から書籍カバー画像が表示されることを確認 |
| 推奨 | 注文なし状態の empty state 表示確認 |
| 推奨 | failed / cancelled 状態の UI 確認 |
| 推奨 | 390px・1280px の表示確認 |
