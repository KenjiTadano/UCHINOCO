# UCHINOCO v1.1 Task045-1 実装報告書

## 概要

| 項目 | 内容 |
|------|------|
| タスク | Task045-1: フォトブック商品選択・価格UI実装 |
| ブランチ | `main` (Task044に継続実装) |
| 実施日 | 2026-09-18 |
| 種別 | 新機能（DB変更なし、ローカルconfig + UI） |

---

## 1. 変更ファイル一覧

| ファイル | 種別 | 変更の主旨 |
|----------|------|-----------|
| `lib/photobook-products.ts` | 新規 | 商品定義・価格計算・ページ選択ロジック |
| `app/(app)/pets/[petId]/album/_components/album-cover-collage.tsx` | 新規 | AlbumCoverCollage 共通コンポーネント |
| `app/(app)/pets/[petId]/album/[albumId]/product/page.tsx` | 新規 | 商品選択ページ Server Component |
| `app/(app)/pets/[petId]/album/[albumId]/product/product-selector.tsx` | 新規 | 商品選択UI Client Component |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/page.tsx` | 新規 | 注文確認プレースホルダー |
| `app/(app)/pets/[petId]/album/[albumId]/page.tsx` | 更新 | 「フォトブックにする」CTA追加 + 共通AlbumCoverCollage使用 |
| `app/(app)/pets/[petId]/album/page.tsx` | 更新 | 共通AlbumCoverCollage使用・重複削除 |
| `tests/photobook-products.test.mjs` | 新規 | 商品・価格計算・制約の単体テスト |

---

## 2. 商品データ構造

`lib/photobook-products.ts` に型付き定数として定義。DB・APIへの移行を想定した構造。

```typescript
type PhotobookProduct = {
  id: string;
  name: string;
  tagline: string;
  size: string;
  coverType: "soft" | "hard";
  coverTypeLabel: string;
  basePages: number;
  maxPages: number;
  basePrice: number;
  extraPagePrice: number;  // PAGE_STEP(10)ページごとの追加料金
};

export const PAGE_STEP = 10;
```

**ユーティリティ関数:**
- `calcPrice(product, pages)` — 表示用価格計算（注文確定時はサーバー再計算が必要）
- `getPageOptions(product)` — `basePages`〜`maxPages` を `PAGE_STEP` 刻みで返す
- `formatPrice(yen)` — `¥2,980` 形式にフォーマット

---

## 3. 商品プラン（暫定仕様）

| プラン | サイズ | カバー | ベースページ | 最大ページ | ベース価格 | 追加料金/10p |
|--------|--------|--------|------------|----------|----------|------------|
| スタンダード | 180 × 180mm | ソフト | 20 | 40 | ¥2,980 | +¥800 |
| プレミアム | 210 × 210mm | ハード | 30 | 60 | ¥4,980 | +¥1,000 |
| プレミアムプラス | 210 × 210mm | ハード | 40 | 80 | ¥6,980 | +¥1,200 |

価格・仕様は暫定。将来API/DBへ移行する際は `PhotobookProduct` 型をインターフェースとして使用。

---

## 4. Album detail CTA

`app/(app)/pets/[petId]/album/[albumId]/page.tsx` にページプレビューと編集セクションの間に配置:

```tsx
<Link
  href={`/pets/${petId}/album/${albumId}/product`}
  className="app-button-primary flex items-center justify-center gap-2"
  aria-label={`${album.title || "このアルバム"}をフォトブックにする`}
>
  フォトブックにする
</Link>
```

---

## 5. 商品選択UI

Route: `/pets/[petId]/album/[albumId]/product`

- Server Component (`product/page.tsx`): auth + IDOR + 写真数 + カバーURL取得
- Client Component (`product-selector.tsx`): 商品選択・ページ数選択・価格サマリー

**レイアウト:**
- モバイル(390px): 商品カード1カラム（水平レイアウト: 表紙左・情報右）
- デスクトップ(lg:): 商品カード3カラム（垂直レイアウト: 表紙上・情報下）

**状態管理:**
```
selectedProductId: useState → 商品変更時にselectedPagesをbasePageにリセット
selectedPages: useState → ページ数変更で価格リアルタイム更新
```

---

## 6. サイズ

商品プランにサイズを含めて固定（180mm / 210mm）。価格サマリーに表示。

---

## 7. カバー

商品プランごとにカバー種別を固定（ソフト/ハード）。

**Book cover mockup:**
- アルバムの先頭写真を書影に使用 → 「自分の写真が本になる」体験
- ソフトカバー: 薄いスパイン (`w-1.5 bg-black/[0.08]`)
- ハードカバー: 太いスパイン (`w-2.5 bg-black/[0.18]`) + グロスオーバーレイ + ドロップシャドウ

---

## 8. ページ数

`getPageOptions(product)` でベースページ〜最大ページをPAGE_STEP刻みで表示。

- 商品変更時: 自動的にそのプランのbasePageにリセット
- 追加ページ料金をラベル内に表示: `30ページ +¥800`
- 選択中はハイライト表示（`border-primary bg-primary-soft text-primary`）

---

## 9. 価格計算

```typescript
calcPrice(product, pages):
  extraSteps = Math.max(0, Math.floor((pages - basePages) / PAGE_STEP))
  return basePrice + extraSteps * extraPagePrice
```

**注意:** UI表示価格は参考値。注文確定時はサーバー側で再計算必須。

---

## 10. 写真枚数制約

```typescript
tooManyPhotos = photoCount > selectedPages
```

`tooManyPhotos === true` の場合: `role="status" aria-live="polite"` の警告メッセージを表示。

- 自動削除は行わない
- ハードブロックしない（選択・注文進行可能）
- ページ数増加か写真削減をユーザーに案内

---

## 11. Price summary

`<section aria-labelledby="price-heading">` 内に `<dl>` で表示:

| 項目 |
|------|
| 商品名 |
| サイズ |
| カバー種別 |
| ページ数 |
| 小計（aria-live="polite" でリアルタイム更新） |

送料・消費税は「次のステップで確認できます」と案内（Task045-2で実装）。

---

## 12. 次画面CTA

```tsx
<Link href={`/pets/${petId}/album/${albumId}/checkout`} className="app-button-primary w-full">
  注文内容を確認する
</Link>
```

`min-h-11`（44px）はapp-button-primaryに含まれる。

---

## 13. Security / IDOR

| チェック箇所 | 検証内容 |
|------------|---------|
| `product/page.tsx` | `owner_user_id = user.id` + `pet_id = petId` |
| `checkout/page.tsx` | `owner_user_id = user.id` + `pet_id = petId` |

商品選択画面でもIDOR検査を省略しない。DBには書き込まないがページアクセス自体がアルバム情報を露出するため。

---

## 14. Mobile (390px)

- 商品カード: 1カラム縦積み、水平レイアウト（書影左20px + 情報右）
- ページ数ボタン: `flex flex-wrap gap-2` — 自然に折り返し
- 価格サマリー + CTA: `app-page` の `pb-[calc(6rem+env(safe-area-inset-bottom))]` でBottom Nav非重複

---

## 15. Desktop (1280px)

- 商品カード: `lg:grid-cols-3` で3カラム表示
- 各カードが垂直レイアウト（書影上 + 情報下）に切り替わる
- `app-page max-w-xl` でコンテンツ幅制限、SaaS dashboard感なし

---

## 16. Accessibility

| 要素 | 対応 |
|------|------|
| 商品ラジオグループ | `role="radiogroup"` + `aria-labelledby` |
| ページ数ラジオグループ | `role="radiogroup"` + `aria-labelledby` |
| 書影 | `aria-hidden="true"` (装飾用) |
| アルバムカバー画像 | `alt=""` (装飾、主画像のみペット名alt) |
| 価格変更 | 小計 `<dd>` に `aria-live="polite"` |
| 写真数警告 | `role="status"` + `aria-live="polite"` |
| CTA | `app-button-primary` → `min-h-11`(44px) ✓ |
| 選択チェック | 選択中カードに `aria-label="選択中"` バッジ |
| フォーカス | `ds-focus` (focus-visible outline) |

---

## 17. Tests

ファイル: `tests/photobook-products.test.mjs`

| テストID | 内容 |
|---------|------|
| A | 初期商品はstandard (list[0]) / 3商品 / id一意 |
| B | 各商品のbasePages/maxPages/coverType/basePriceが正しい |
| C | getPageOptions: standard=[20,30,40], premium=[30,40,50,60] など |
| D | calcPrice: basePages→basePrice / extraStep計算 / negative→noDiscount |
| E | 写真数制約ロジック (tooManyPhotos条件) |
| F | 他人albumアクセス不可 (構造的テスト) |
| G | 別petId route不可 (構造的テスト) |
| H | checkout route存在 (構造的テスト) |
| formatPrice | ¥2,980 / ¥6,980 / ¥0 フォーマット |

---

## 18. typecheck / lint / build

```
npx tsc --noEmit  → エラー 0件
npm run lint      → exit 0
npm run build     → 全28ルートのビルド成功
  新規: /pets/[petId]/album/[albumId]/product
        /pets/[petId]/album/[albumId]/checkout
git diff --check  → whitespace issue なし
```

---

## 19. git status --short

```
 M app/(app)/pets/[petId]/album/[albumId]/page.tsx
 M app/(app)/pets/[petId]/album/page.tsx
 M package-lock.json       ← task043以前からのpre-existing変更
 M package.json            ← 同上
?? app/(app)/pets/[petId]/album/[albumId]/checkout/
?? app/(app)/pets/[petId]/album/[albumId]/product/
?? app/(app)/pets/[petId]/album/_components/
?? lib/photobook-products.ts
?? tests/photobook-products.test.mjs
```

---

## 20. Task045-2への注意点

1. **商品選択状態の永続化** — 現状はClient stateのみ。Task045-2の注文確認画面でproduct/pages選択を引き継ぐ場合、URLパラメータ (`?product=premium&pages=30`) またはsession storageを使用。

2. **サーバー再計算** — `calcPrice()` は表示専用。注文確定時は必ずサーバー側で `PHOTOBOOK_PRODUCTS` から同じロジックで再計算し、UIの金額を信頼源にしないこと。

3. **`albums.status` 変更タイミング** — Task045-1では `status = "draft"` のまま。商品選択→注文確認→支払い完了の流れで `"ready"` → `"ordered"` へ遷移させる実装をTask045-2/3で行う。

4. **checkout/page.tsx のプレースホルダー** — 現在「まもなく実装」メッセージのみ。Task045-2で配送先入力・送料計算・支払いフォームに置き換える。

5. **AlbumCoverCollage共通化完了** — `album/_components/album-cover-collage.tsx` が正式な共有場所。今後アルバム関連の新ページを作る場合はこちらをimportする。

6. **書影書影mockのalt** — `aria-hidden="true"` の装飾画像。将来、印刷プレビュー等で商品イメージ画像が用意された場合はaltテキストを追加する。
