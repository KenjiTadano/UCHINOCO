# Task047-3 実装報告書 — MockPrintProvider + ProdigiProvider skeleton

作成日: 2026-09-18  
ステータス: 実装完了（Remote Supabase 未適用 / commit 未実施 / 実 API 通信なし）

---

## 1. 変更ファイル

| ファイル | 種別 |
|---|---|
| `lib/print/types.ts` | 更新 |
| `lib/print/errors.ts` | 新規 |
| `lib/print/product-mapping.ts` | 新規 |
| `lib/print/provider-factory.ts` | 新規 |
| `lib/print/print-job.ts` | 新規 |
| `lib/print/providers/mock.ts` | 新規 |
| `lib/print/providers/prodigi-config.ts` | 新規 |
| `lib/print/providers/prodigi-request-builder.ts` | 新規 |
| `lib/print/providers/prodigi-status.ts` | 新規 |
| `lib/print/providers/prodigi.ts` | 新規 |
| `tsconfig.json` | `allowImportingTsExtensions: true` 追加 |
| `package.json` / `package-lock.json` | `server-only` devDep 追加 |
| `tests/print-provider.test.mjs` | 新規（32 件） |

---

## 2. PrintProvider interface 変更

既存 4 型（`PrintProvider` / `PrintOrderParams` / `PrintJobResult` / `PrintJobStatus`）は維持。

**追加:**

```typescript
export type PrintProviderName = "mock" | "prodigi" | "gelato" | "fujifilm";

export type PrintAsset = {
  type: "cover" | "content" | "book";
  url: string;
};

// PrintOrderParams に追加
idempotencyKey?: string;

// 将来の provider 原価見積もり用（ユーザー請求額と混同しない）
export type ProviderQuote = {
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
};
```

---

## 3. ProviderName

```typescript
export type PrintProviderName = "mock" | "prodigi" | "gelato" | "fujifilm";
```

---

## 4. product mapping

`lib/print/product-mapping.ts`

```typescript
// 意図的に空 — 推測 SKU は入れない
export const PRODUCT_MAPPING: ProviderProductMapping[] = [];
```

`getProviderProductId(productId, pages, provider)` インターフェースのみ実装済み。  
実 SKU は Prodigi Sandbox / Gelato Catalog API 確認後に登録予定。

---

## 5. MockPrintProvider

`lib/print/providers/mock.ts` — `server-only` なし（テスト直接 import 可能）

| `behavior` (constructor param) | `submitOrder` | `getJobStatus` |
|---|---|---|
| `"success"` (default) | `{ status: "submitted", providerOrderId: "mock-{key}-submitted" }` | `{ status: "submitted" }` |
| `"fail"` | `throw ProviderRequestError` | `{ status: "failed" }` |
| `"timeout"` | `throw ProviderTimeoutError` | — |
| `"processing"` | — | `{ status: "processing" }` |
| `"shipped"` | — | `{ status: "shipped", trackingNumber: "MOCK-TRACK-001" }` |

`cancelJob`: 常に成功（no-op）。  
`providerOrderId` の形式: `mock-{idempotencyKey ?? orderId}-submitted`（テストで assert 可能な確定値）。

---

## 6. ProdigiProvider skeleton

`lib/print/providers/prodigi.ts` — `import "server-only"`

`submitOrder`:
1. `getProviderProductId()` → null → `throw ProviderProductUnavailableError`
2. `buildProdigiOrderRequest()` で payload 構築（純粋関数）
3. `throw ProviderNotConfiguredError("実装未完")` — fetch は未実装

`getJobStatus` / `cancelJob`: 同様に stub (ProviderNotConfiguredError)。

---

## 7. Prodigi config

`lib/print/providers/prodigi-config.ts` — `import "server-only"`

| 環境 | `PRODIGI_ENV` | Base URL |
|---|---|---|
| Sandbox (default) | `sandbox` または未設定 | `https://api.sandbox.prodigi.com` |
| Live | `live` | `https://api.prodigi.com` |
| 無効値 | その他 | `throw Error("Invalid PRODIGI_ENV: ...")` |

`PRODIGI_API_KEY` が未設定なら `ProviderNotConfiguredError` を throw。ログに API Key を出力しない。

---

## 8. request builder

`lib/print/providers/prodigi-request-builder.ts` — 純粋関数、`server-only` なし

`buildProdigiOrderRequest(params, providerProductId, assets)`:

- `sku` は引数から取得（関数内に SKU 定数を一切埋め込まない）
- `merchantReference = idempotencyKey ?? orderId`
- `countryCode: "JP"` 固定
- `attributes.pageCount = params.pages`
- `console.*` 出力なし（PII ログ禁止）

---

## 9. asset type

```typescript
export type PrintAsset = { type: "cover" | "content" | "book"; url: string };
```

signed URL 生成・PDF 生成は未実装（Task047-4 予定）。

---

## 10. error model

`lib/print/errors.ts` — `server-only` なし（テスト直接 import 可能）

| クラス | `code` |
|---|---|
| `PrintProviderError` | 基底クラス |
| `ProviderNotConfiguredError` | `"PROVIDER_NOT_CONFIGURED"` |
| `ProviderProductUnavailableError` | `"PRODUCT_UNAVAILABLE"` |
| `ProviderRequestError` | `"REQUEST_FAILED"` |
| `ProviderTimeoutError` | `"TIMEOUT"` |

**注**: TypeScript parameter properties（`public readonly x` in constructor）は使用しない。Node.js `--experimental-strip-types` の strip-only mode が TypeScript 変換をサポートしないため、通常の代入に書き直している。

---

## 11. status normalization

`lib/print/providers/prodigi-status.ts` — 純粋関数、`server-only` なし

```typescript
const PRODIGI_STATUS_MAP: Record<string, PrintJobStatus["status"]> = {
  // Unconfirmed — populate after Sandbox verification
};
```

未知の status は `"processing"` にフォールバック（誤って `failed`/`cancelled` にしない安全設計）。  
Sandbox 確認後に実 status 値を登録予定。

---

## 12. provider factory

`lib/print/provider-factory.ts` — `import "server-only"`

```typescript
getPrintProvider("mock")     → MockPrintProvider
getPrintProvider("prodigi")  → ProdigiProvider
getPrintProvider("gelato")   → throw ProviderNotConfiguredError
getPrintProvider("fujifilm") → throw ProviderNotConfiguredError
```

`getDefaultPrintProvider()`: `process.env.PRINT_PROVIDER ?? "mock"`。無効値は `throw Error`。

---

## 13. PRINT_PROVIDER

デフォルト: `"mock"`。Production でも明示的な指定がなければ mock のまま（live provider へ自動切替なし）。有効値: `mock | prodigi | gelato | fujifilm`。

---

## 14. idempotency

`PrintOrderParams.idempotencyKey?: string` で明示的 idempotency key をサポート。  
Mock Provider の `providerOrderId` に `idempotencyKey` を反映（テスト可能な形式）。

---

## 15. cost model

`ProviderQuote` 型（`subtotal / shipping / total / currency`）を定義のみ。  
`orders.total`（ユーザー請求額）と Provider 原価を型で分離。実取得は未実装。

---

## 16. security

| 項目 | 状態 |
|---|---|
| `PRODIGI_API_KEY` server-only | `prodigi-config.ts` に `import "server-only"` |
| `NEXT_PUBLIC_` プレフィックス | なし |
| request builder console 出力 | なし（PII ログ禁止） |
| `PRINT_PROVIDER` default | `"mock"` |
| `provider_order_id` Client 返却 | なし |

---

## 17. tests

`tests/print-provider.test.mjs` — **32 件全パス**

### テスト戦略

`server-only` を持つモジュール（`prodigi-config.ts` / `prodigi.ts` / `provider-factory.ts`）は Node.js テスト環境から直接 import できないため、`readFile` でソースを読み込む structural テストとして実装。

純粋関数モジュール（`errors.ts` / `mock.ts` / `product-mapping.ts` / `prodigi-request-builder.ts` / `prodigi-status.ts`）は直接 import して関数テスト。

| テスト | 方式 |
|---|---|
| A–C (factory) | structural (readFile) |
| D–F (Prodigi config) | structural (readFile) |
| G (SKU null) | 関数テスト + structural |
| H (mapping 空) | 関数テスト |
| I–J (request builder) | 関数テスト + structural |
| K–O (mock behavior) | 関数テスト |
| P (idempotencyKey) | 関数テスト |
| Q (server-only) | structural (readFile) |
| R–S (Gelato/Fujifilm) | structural (readFile) |
| T (status fallback) | 関数テスト + structural |
| + (error classes) | 関数テスト |

### tsconfig.json 変更理由

`allowImportingTsExtensions: true` を追加。`lib/print/` の内部インポートに `.ts` 拡張子を付与することで Node.js ESM resolver との互換性を確保。`noEmit: true` が前提条件を満たす。

---

## 18. typecheck / lint / build

- `npx tsc --noEmit` → **0 errors**
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → 成功

---

## 19. node tests 総数

```
node --test tests/*.mjs → 300 tests, 300 pass, 0 fail
```

| ファイル | 件数 |
|---|---|
| 既存テスト群 | 268 |
| print-provider.test.mjs | 32 |
| 合計 | **300** |

---

## 20. git status --short

```
 M lib/print/types.ts
 M package-lock.json / package.json
 M tsconfig.json
?? lib/print/errors.ts / product-mapping.ts / provider-factory.ts / print-job.ts
?? lib/print/providers/ (mock / prodigi / prodigi-config / prodigi-request-builder / prodigi-status)
?? tests/print-provider.test.mjs
?? docs/task047-product-mapping-research.md / task047-3-implementation-report.md
```

commit / push 未実施。実 API 通信なし。Prodigi Sandbox 未接続。

---

## 21. 実 API 接続前に必要な情報

| # | 必要情報 | 取得方法 |
|---|---|---|
| 1 | Prodigi 正方形 SKU | `GET https://api.sandbox.prodigi.com/v4.0/products?category=photobooks` |
| 2 | JP 向け利用可否 + min/max ページ | `GET .../products/{SKU}?destinationCountryCode=JP` |
| 3 | Gelato photobook productUid | `POST /v3/catalogs/{uid}/products:search` (210×210 フィルタ) |
| 4 | Gelato JP 対応 + validPageCounts | `GET /v3/products/{productUid}` |
| 5 | Prodigi 実 status 文字列 | Sandbox 注文レスポンスから確認して `PRODIGI_STATUS_MAP` に登録 |

SKU 確定後の作業: `PRODUCT_MAPPING` 登録 → `ProdigiProvider.submitOrder` fetch 実装 → `getJobStatus` 実装。
