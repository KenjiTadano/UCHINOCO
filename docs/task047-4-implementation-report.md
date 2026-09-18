# Task047-4 実装報告書 — 印刷用 PDF 生成基盤

作成日: 2026-09-18  
ステータス: 実装完了（Remote Supabase 未適用 / commit 未実施 / 実 API 通信なし）

---

## 1. PDF library

**pdf-lib v1.17.1** を採用。  
理由: 純粋 JavaScript（Node.js / ブラウザ両対応）、DOM 非依存、カスタムページサイズ、JPEG/PNG 埋め込み、マルチページ対応、`server-only` なしでテストから直接 import 可能。

---

## 2. 変更ファイル

| ファイル | 種別 |
|---|---|
| `lib/photobook-products.ts` | 更新（`printWidthMm` / `printHeightMm` / `bleedMm` 追加） |
| `lib/print/document-types.ts` | 新規 |
| `lib/print/document-builder.ts` | 新規 |
| `lib/print/layout/units.ts` | 新規 |
| `lib/print/layout/fit.ts` | 新規 |
| `lib/print/pdf/errors.ts` | 新規 |
| `lib/print/pdf/image-loader.ts` | 新規 |
| `lib/print/pdf/pdf-generator.ts` | 新規 |
| `package.json` / `package-lock.json` | pdf-lib 追加 |
| `tests/print-layout.test.mjs` | 新規（22 件） |

---

## 3. document model

`lib/print/document-types.ts` — `server-only` なし

```typescript
PrintDocumentSpec  // orderId, title, productId, printWidthMm/Hmm, bleedMm, cover, pages, totalPageCount
PrintPage          // pageNumber (1-indexed), item: PrintPageItem | null
PrintPageItem      // photoId, imagePath, sourceWidthPx/Hpx (null = resolved at generation), fit
PrintCover         // imagePath, titleText, fit
GeneratedPrintFile // type, filename (PII-free), mimeType, bytes, pageCount
PrintGenerationResult // cover: GeneratedPrintFile, content: GeneratedPrintFile
DpiWarning         // photoId, imagePath, estimatedDpi, threshold
```

---

## 4. page model

`PrintPage.item = null` → blank page（写真なし）。  
`buildPrintDocument` が 1 photo/page で割り付け、余りは blank。

---

## 5. page size

```typescript
// lib/photobook-products.ts
printWidthMm: 180,   // standard
printHeightMm: 180,  // standard (square)
bleedMm: 0,          // provider 仕様確認待ち（hard-coded値禁止）
```

PDF ページサイズ（points）= `mmToPoints(widthMm + bleedMm * 2)` で計算。  
`mmToPoints`: `(mm / 25.4) * 72`。

---

## 6. fit / crop

`lib/print/layout/fit.ts` — 純粋関数

| 関数 | 動作 |
|---|---|
| `calculateContainRect` | 全体が収まるようスケール → 中央配置（letterbox/pillarbox） |
| `calculateCoverRect` | 全面を埋めるようスケール → 中央でクロップ（x/y が負 = クロップ領域） |

v1 レイアウト:
- カバー: `cover` fit（全面使用）
- コンテンツページ: `contain` fit + 8mm マージン（no-bleed 時）

---

## 7. cover PDF

- `cover_original_path_snapshot` から画像をロード → `calculateCoverRect` で全面配置
- タイトルテキストは **v1 省略**（日本語フォント未埋め込み → 文字化け回避）
- カバーファイル名: `orders/{orderId}/cover.pdf`（PII なし）
- カバー PDF は 1 ページ固定

---

## 8. content PDF

- `order_photos` のみを source に使用（`album_photos` は参照しない）
- `position ASC` 順にページ割り当て
- 写真なしのページは白ページ（drawing なし）
- コンテンツファイル名: `orders/{orderId}/content.pdf`

---

## 9. page count 処理

`orders.pages` が `totalPageCount` を決定。  
`orderPhotos.length <= pages` が必須（builder でチェック）。  
photos 不足分は blank page で補完（写真複製しない）。

---

## 10. blank page

`PrintPage.item = null` として表現。  
pdf-lib でページのみ追加し、drawing は実施しない → 白ページになる。

---

## 11. DPI

```typescript
estimateDpi(pixelDimension, printDimensionMm) = round(pixel / (mm / 25.4))
DPI_WARNING_THRESHOLD = 200
DPI_RECOMMENDED = 300
```

- DPI < 200 → `DpiWarning` を `warnings[]` に追加（生成は止めない）
- 画素数はロード時に pdf-lib の `PDFImage.width/height` から取得
- photos schema に pixel 寸法カラムなし → 画像バイトから取得

---

## 12. image loader

`lib/print/pdf/image-loader.ts` — `server-only` なし

```typescript
interface PrintImageLoader { load(path): Promise<Uint8Array | null> }
class MockImageLoader implements PrintImageLoader  // テスト用
```

実 Supabase Storage ローダーは Task047-5 で実装予定。

---

## 13. generated result

```typescript
GeneratedPrintFile {
  type: "cover" | "content" | "book";
  filename: string;   // "orders/{orderId}/cover.pdf" — PII なし
  mimeType: "application/pdf";
  bytes: Uint8Array;  // PDF バイナリ（ログ禁止）
  pageCount: number;
}
```

Provider layer がここから Storage upload / API 送信を行う（Task047-5）。

---

## 14. filename

`orders/{orderId}/cover.pdf` / `orders/{orderId}/content.pdf`  
氏名・ペット名・住所・電話は含まない。

---

## 15. font 対応

v1 制限: **日本語フォント未埋め込み**。  
- pdf-lib の StandardFonts（Helvetica）は ASCII のみ対応
- 日本語タイトルをカバーに入れると文字化けするため、v1 では省略
- 解決策: CJK フォント（例: Noto Sans JP）のサブセット埋め込みを Task047-5 で検討
- フォントバイナリはリポジトリに追加しない

---

## 16. error model

`lib/print/pdf/errors.ts` — `server-only` なし

| クラス | `code` |
|---|---|
| `PrintGenerationError` | 基底クラス |
| `ImageLoadError` | `"IMAGE_LOAD_FAILED"` |
| `InvalidImageError` | `"INVALID_IMAGE"` |
| `PhotoCountExceededError` | `"PHOTO_COUNT_EXCEEDED"` |
| `PdfGenerationError` | `"PDF_GENERATION_FAILED"` |

`PrintProviderError` とは責務分離（Provider API エラー vs. PDF 生成エラー）。

---

## 17. security

- `pdf-generator.ts`: `server-only` なし（pdf-lib は pure JS、秘密情報なし）
- 画像バイト・PDF バイト・ストレージパスをログに出力しない
- Provider 名（prodigi / gelato）を pdf-generator に含まない
- 一時ファイル生成は `/tmp` のみ（Repository に PDF バイナリを commit しない）
- PII のないファイル名（`orders/{orderId}/xxx.pdf`）

---

## 18. tests

`tests/print-layout.test.mjs` — **22 件全パス**

| テスト | 内容 |
|---|---|
| A (3件) | mmToPoints 変換 |
| B–E | calculateContainRect / calculateCoverRect（landscape/portrait）|
| F | buildPrintDocument: pages.length === totalPageCount |
| G | photo 順序保持 |
| H | blank page 補完 |
| I | photoCount > pages でエラー |
| J | orderPhotos のみ参照（structural） |
| K | filename に PII なし |
| L | cover_original_path_snapshot → cover.imagePath |
| M | album_title_snapshot → cover.titleText / title |
| N | pdf-generator に provider 名なし（structural） |
| O | JPEG magic byte 検出（structural + routing 確認） |
| P | PNG embed: generatePrintPdfs 成功 |
| Q | 無効画像 → InvalidImageError |
| R | 低 DPI → DpiWarning |
| S | %PDF magic bytes 確認 |
| T | generated content pageCount === spec.pages.length |

---

## 19. typecheck / lint / build

- `npx tsc --noEmit` → **0 errors**
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → 成功

---

## 20. node tests 総数

```
node --test tests/*.mjs → 322 tests, 322 pass, 0 fail
```

| ファイル | 件数 |
|---|---|
| 既存テスト群 | 300 |
| print-layout.test.mjs | 22 |
| 合計 | **322** |

---

## 21. git status --short

```
 M lib/photobook-products.ts
 M package-lock.json / package.json
?? lib/print/document-builder.ts / document-types.ts
?? lib/print/layout/ (units.ts / fit.ts)
?? lib/print/pdf/ (errors.ts / image-loader.ts / pdf-generator.ts)
?? tests/print-layout.test.mjs
?? docs/task047-4-implementation-report.md
```

commit / push 未実施。実 API 通信なし。Remote Supabase 未操作。

---

## 22. Task047-5 への残課題

| 項目 | 内容 |
|---|---|
| Supabase Storage ローダー | `SupabaseImageLoader implements PrintImageLoader` — service_role で `pet-photos` から download |
| print-files bucket | `orders/{orderId}/cover.pdf` / `content.pdf` を upload する専用バケット作成 |
| 日本語フォント | CJK サブセットフォント（Noto Sans JP 等）の埋め込み — バイナリは CDN 取得またはライセンス確認後 |
| bleedMm 設定 | Prodigi Sandbox 仕様確認後に各商品の bleedMm を更新 |
| Prodigi cover template | 正式な表紙 PDF 仕様（背表紙幅・裏表紙含む）は Sandbox 確認後 |
| print_jobs INSERT | `generatePrintPdfs` 完了後に `print_jobs` レコードを作成する Server Action / webhook 連携 |
| pixel dimensions schema | `photos` テーブルへの `image_width_px` / `image_height_px` カラム追加の検討（DPI 事前チェック用） |
