# Task047 事前調査: 印刷会社 商品 SKU マッピング

作成日: 2026-09-18  
最終更新: 2026-09-18  
ステータス: 調査中（実 SKU 未確定 / コード実装保留）

---

## 方針

- **推測 SKU をコードへ入れない**
- 実 SKU / productUid が確認できたものだけ `lib/print/product-mapping.ts` に登録する
- 未確定商品は `null`
- `getProviderProductId(productId, pages, provider)` のインターフェースは先に固定する

---

## UCHINOCO 内部商品

| id | 名称 | サイズ | カバー | ページ範囲 | ステップ |
|---|---|---|---|---|---|
| `standard` | スタンダード | 180×180mm | ソフトカバー | 20〜40ページ | 10 |
| `premium` | プレミアム | 210×210mm | ハードカバー | 30〜60ページ | 10 |
| `premium-plus` | プレミアムプラス | 210×210mm | ハードカバー | 40〜80ページ | 10 |

---

## Prodigi

### 現状

- SKU 構造は公開ドキュメントで判明しているが、正方形（Square）サイズの具体 SKU は未確認
- ページ数は SKU に含まれず、注文時に `pageCount` パラメータとして別途指定する仕様
  （ベース価格は最初の 24 ページを含む。min/max ページ数は SKU ごとに Product Details / Sandbox で確認が必要）
- 公開 API ドキュメントで確認できる SKU 例: `BOOK-FE-A4-P-HARD-G`（A4 縦 ハードカバー グロス）

### 未確定（要 Sandbox / Dashboard 確認）

- Square 21×21cm Hardcover の SKU
- Square 21×21cm Layflat の SKU
- Square 18×18cm Softcover の SKU（standard 相当）
- `destinationCountryCode=JP` での利用可否
- 正方形サイズの min/max ページ数制限

### エンドポイント

| 環境 | Base URL |
|---|---|
| **Sandbox** | `https://api.sandbox.prodigi.com` |
| Live | `https://api.prodigi.com` |

> **注意**: Sandbox API Key で Live エンドポイントを使用しないこと。SKU 確認はすべて Sandbox で行う。

### 確認手順

1. Prodigi Sandbox アカウント作成（https://dashboard.prodigi.com）
2. **Sandbox** API キー取得（Live キーと混在させない）
3. 以下を実行:

```bash
# 写真集 SKU 一覧を取得（Sandbox エンドポイントを使用）
curl -X GET "https://api.sandbox.prodigi.com/v4.0/products?page=1&pageSize=100&category=photobooks" \
  -H "X-API-Key: {SANDBOX_API_KEY}"

# 正方形 SKU を絞り込む（レスポンスから SQ / SQUARE を grep）
```

4. 取得した SKU に対して日本向け確認・min/max ページ確認:

```bash
curl -X GET "https://api.sandbox.prodigi.com/v4.0/products/{SKU}?destinationCountryCode=JP" \
  -H "X-API-Key: {SANDBOX_API_KEY}"
```

### 登録予定マッピング（確認後に記入）

| UCHINOCO 商品 | 候補タイプ | Prodigi SKU | 最小ページ | 最大ページ | JP 対応 |
|---|---|---|---|---|---|
| `premium` | Square Hard | **未確定** | — | — | — |
| `premium-plus` | Square Hard / Layflat | **未確定** | — | — | — |
| `standard` | Square Soft | **未確定** | — | — | — |

---

## Gelato

### 現状

- 公式 API ドキュメント（https://docs.gelato.com）確認済み
- Product Catalog API から `productUid` を取得できる
- 認証: `X-API-KEY` ヘッダー

### 確認手順

**Step 1: Catalog 一覧取得**

```bash
curl -X GET "https://product.gelatoapis.com/v3/catalogs" \
  -H "X-API-KEY: {API_KEY}"
```

Photobook の `catalogUid` を確認する。

**Step 2: Photobook 候補を検索**

```bash
curl -X POST "https://product.gelatoapis.com/v3/catalogs/{catalogUid}/products:search" \
  -H "X-API-KEY: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "attributeFilters": {
      "Format": ["210 x 210 mm"],
      "CoverType": ["Hardcover"]
    }
  }'
```

`Format` / `CoverType` のフィルタキーは実際のレスポンスに合わせて調整する。

**Step 3: 個別商品の詳細確認**

```bash
curl -X GET "https://product.gelatoapis.com/v3/products/{productUid}" \
  -H "X-API-KEY: {API_KEY}"
```

確認ポイント:
- `supportedCountries` に `JP` が含まれること
- `validPageCounts` の範囲（30〜60、40〜80 をカバーできるか）

### 登録予定マッピング（確認後に記入）

| UCHINOCO 商品 | Gelato productUid | validPageCounts | JP 対応 |
|---|---|---|---|
| `standard` | **未確定** | — | — |
| `premium` | **未確定** | — | — |
| `premium-plus` | **未確定** | — | — |

---

## 富士フイルム

商品コード体系未調査。契約先・提供形態未確定のため今回はスコープ外。

---

## 設計（インターフェース確定済み）

```typescript
// lib/print/product-mapping.ts — 実装は SKU 確定後
export type ProviderName = "prodigi" | "gelato" | "fujifilm";

export type ProviderProductId = {
  prodigi?: string | null;
  gelato?: string | null;
  fujifilm?: string | null;
};

// ページ数が SKU に含まれる provider（Gelato 等）に対応するため配列構造を維持
export type ProductVariant = {
  pages: number;
  providers: ProviderProductId;
};

// 未確定の場合は null を設定する（推測値禁止）
export const PRODUCT_MAPPING: Record<string, ProductVariant[]> = {
  // SKU 確定後に登録
};

export function getProviderProductId(
  productId: string,
  pages: number,
  provider: ProviderName,
): string | null {
  const variant = PRODUCT_MAPPING[productId]?.find((v) => v.pages === pages);
  return variant?.providers[provider] ?? null;
}
```

**注**: ページ数が SKU に含まれない Provider（Prodigi 方式）の場合は、全ページ数のエントリに同じ SKU を登録するか、pages を `*` 扱いするヘルパーを追加する。実際の API 仕様確認後に判断する。

---

## 次のアクション

| # | アクション | 状態 |
|---|---|---|
| 1 | Prodigi Sandbox アカウント作成 | ⬜ 未着手 |
| 2 | `GET /v4.0/products` で正方形 SKU 取得 | ⬜ 未着手 |
| 3 | JP 向け利用可否・min/max ページ確認 | ⬜ 未着手 |
| 4 | Gelato アカウント作成 | ⬜ 未着手 |
| 5 | `GET /v3/catalogs` で catalogUid 取得 | ⬜ 未着手 |
| 6 | `products:search` で 210×210 候補取得 | ⬜ 未着手 |
| 7 | `GET /v3/products/{productUid}` で JP 対応・validPageCounts 確認 | ⬜ 未着手 |
| 8 | 確認済み SKU / productUid のみ `lib/print/product-mapping.ts` に登録 | ⬜ SKU 確定後 |

---

## 実装予定ファイル（SKU 確定後）

```
lib/print/product-mapping.ts     — provider SKU マッピング config（インターフェースのみ先行）
lib/print/providers/
  prodigi.ts                     — Prodigi PrintProvider 実装
  gelato.ts                      — Gelato PrintProvider 実装
  mock.ts                        — 開発用 MockProvider
```

`lib/print/types.ts` の `PrintProvider` インターフェースは Task046-2 で実装済み。
