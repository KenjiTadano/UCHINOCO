# Task045-2 実装報告書

## 概要

チェックアウト画面（注文確認・配送先入力）の実装。商品選択ページからクエリパラメータで引き継いだ商品・ページ数をサーバーサイドで検証し、配送先フォームで住所を入力して支払い画面プレースホルダーへ遷移する。

---

## 実装ファイル一覧

### 新規作成

| ファイル | 役割 |
|---|---|
| `lib/photobook-shipping.ts` | 配送オプション設定（将来のキャリアAPI移行ポイント） |
| `lib/checkout-validation.ts` | 住所バリデーション純粋関数（テスト可能に分離） |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/checkout-form.tsx` | 注文確認・配送先フォーム（Client Component） |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/payment/page.tsx` | 支払い画面プレースホルダー（Task045-3 用） |
| `tests/checkout.test.mjs` | チェックアウトロジックのユニットテスト |

### 更新

| ファイル | 変更内容 |
|---|---|
| `app/(app)/pets/[petId]/album/[albumId]/product/product-selector.tsx` | CTA の href に `?product=...&pages=...` クエリパラメータを付与 |
| `app/(app)/pets/[petId]/album/[albumId]/checkout/page.tsx` | プレースホルダーから実装に全面書き直し |

---

## 主要な設計決定

### 1. クエリパラメータのサーバーサイド検証

`checkout/page.tsx` は `searchParams`（`product`, `pages`）をサーバーで検証する。不正値は即 `redirect` でプロダクト選択ページへ戻す。クライアントが送信した金額は一切信用せず、`calcPrice(product, pagesNum)` でサーバー側再計算する。

```typescript
const product = PHOTOBOOK_PRODUCTS.find((p) => p.id === (productParam ?? ""));
if (!product) redirect(`/pets/${petId}/album/${albumId}/product`);

const pagesNum = Number.isInteger(Number(pagesParam)) ? parseInt(pagesParam!, 10) : NaN;
if (!getPageOptions(product).includes(pagesNum)) redirect(...);

const subtotal = calcPrice(product, pagesNum); // サーバーで再計算
```

### 2. 住所を URL に含めない

`CheckoutForm` の `handleSubmit` は `e.preventDefault()` でデフォルト GET 送信をブロックし、`router.push('/checkout/payment')` でアドレスなしで遷移する。住所は React `useState` のみに存在する。

### 3. IDOR 防止

`checkout/page.tsx` と `checkout/payment/page.tsx` の両方で：
- `.eq("owner_user_id", user.id)` — 認証ユーザーがアルバムを所有することを確認
- `.eq("pet_id", petId)` — ルートパラメータのペット ID と一致することを確認

### 4. 写真枚数超過のハードブロック

`photosTooMany = photoCount > pages` が true のとき、「支払いへ進む」ボタンを `disabled` にする。商品選択ページでは advisory（警告のみ）だったが、チェックアウトではハードブロック。

### 5. 配送オプションの設定ファイル分離

`lib/photobook-shipping.ts` に `ShippingOption` 型と `SHIPPING_OPTIONS` 配列を定義。現在は標準配送 ¥550 の 1 択。将来のキャリア API 移行時はこのファイルのみ変更する。

---

## バリデーション仕様

### 住所フィールド

| フィールド | 必須 | バリデーション |
|---|---|---|
| lastName（姓） | 必須 | 空文字不可 |
| firstName（名） | 必須 | 空文字不可 |
| postalCode（郵便番号） | 必須 | ハイフン除去後 `/^\d{7}$/` |
| prefecture（都道府県） | 必須 | 空文字不可 |
| city（市区町村） | 必須 | 空文字不可 |
| address1（番地） | 必須 | 空文字不可 |
| address2（建物名） | 任意 | バリデーションなし |
| phone（電話番号） | 必須 | ハイフン・空白除去後 `/^0\d{9,10}$/` |

### アクセシビリティ

- `aria-invalid="true"` + `aria-describedby="{field}-error"` でスクリーンリーダーと紐付け
- `aria-live="polite"` でエラー件数をライブアナウンス
- バリデーション失敗時に最初のエラーフィールドへ `focus()` を移動
- `autoComplete` 属性でブラウザオートフィル対応
- 都道府県は 47 都道府県の `<select>` で正確性を保証

---

## テスト内容（tests/checkout.test.mjs）

| セクション | テスト内容 |
|---|---|
| A | 有効な productId / pages がチェックアウトへ正しく渡される |
| B | 改ざんされた productId（"hacked", 空文字, SQLインジェクション）は undefined |
| C | 改ざんされた pages（999999, 0, NaN, 20.5）はページオプションに含まれない |
| D | サーバーが product+pages から価格を再計算（standard 20p=2980, premium 40p=5980 等） |
| E | 配送オプション（standard ¥550、デフォルト取得、不明 id は undefined） |
| F | 合計 = 小計 + 送料（standard 20p + standard = 3530 等） |
| G | 空アドレスは全必須フィールドにエラー、address2 はエラーなし |
| H | 郵便番号バリデーション（7桁有効、6桁/8桁無効等） |
| I | address2 なし/あり どちらも有効 |
| J | photoCount > pages → photosTooMany=true、≤ pages → false |
| K | IDOR: owner_user_id + pet_id の両方を .eq() で検証（構造的テスト） |
| L | albumのpet_idとルートのpetIdが一致しない場合 notFound（構造的テスト） |
| M | 住所は URL パラメータに含まれない（構造的テスト） |
| N | Task045-2 では DB への INSERT/UPDATE/DELETE なし（構造的テスト） |
| Phone | 電話番号バリデーション（ハイフンあり/なし/11桁有効、0始まり以外無効等） |

---

## 検証結果

```
npx tsc --noEmit       → エラーなし
npm run lint           → エラー0件、警告0件
npm run build          → ビルド成功（全ルート正常）
git diff --check       → whitespace エラーなし
```

---

## 変更なし（スコープ外）

- `albums.status` は `draft` のまま変更なし
- DB への INSERT / UPDATE / DELETE なし
- Stripe 統合なし（Task045-3 以降）
- Remote Supabase 操作なし

---

## git status --short

```
 M app/(app)/pets/[petId]/album/[albumId]/checkout/page.tsx
 M app/(app)/pets/[petId]/album/[albumId]/product/product-selector.tsx
 M package-lock.json
 M package.json
?? app/(app)/pets/[petId]/album/[albumId]/checkout/checkout-form.tsx
?? app/(app)/pets/[petId]/album/[albumId]/checkout/payment/
?? docs/UCHINOCO_v1.1_UI_Design.pdf
?? lib/checkout-validation.ts
?? lib/photobook-shipping.ts
?? tests/checkout.test.mjs
```

commit / push / merge は未実施。
