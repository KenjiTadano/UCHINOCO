# Task047-5 実装報告書 — 印刷ジョブ生成パイプライン基盤

作成日: 2026-09-18  
ステータス: 実装完了（Remote Supabase 未適用 / commit 未実施 / 実 API 通信なし）

---

## 1. 変更ファイル

| ファイル | 種別 |
|---|---|
| `supabase/migrations/20260918160000_print_pipeline.sql` | 新規 |
| `lib/print/pdf/errors.ts` | 更新（`PrintFileUploadError` / `SAFE_ERROR_CODES` 追加） |
| `lib/print/pdf/supabase-image-loader.ts` | 新規 |
| `lib/print/pdf/print-file-store.ts` | 新規 |
| `lib/print/pipeline/prepare-print-job.ts` | 新規 |
| `app/api/stripe/webhook/route.ts` | 更新（`p_provider` 引数追加） |
| `lib/supabase/database.types.ts` | 更新（`print_jobs` 3列追加 / `mark_order_paid` 引数更新） |
| `tests/print-pipeline.test.mjs` | 新規（23 件） |

---

## 2. migration

`supabase/migrations/20260918160000_print_pipeline.sql`

- `print_jobs` に `cover_file_path text` / `content_file_path text` / `prepared_at timestamptz` を追加
- `mark_order_paid` RPC を 4-param 版に置換（`p_provider text default 'mock'`）
- print_jobs INSERT（queued）を同一トランザクションに追加（`ON CONFLICT (idempotency_key) DO NOTHING`）
- 旧 3-param 版の EXECUTE 権限を全ロールから REVOKE
- `print-files` private bucket を作成（`public=false`、`application/pdf` のみ）

---

## 3. print_jobs queue 生成

支払い成功 Webhook → `mark_order_paid` → 同一 SQL トランザクション内で:

```sql
INSERT INTO public.print_jobs (order_id, provider, idempotency_key, status)
VALUES (p_order_id, p_provider, 'print-order:' || p_order_id::text, 'queued')
ON CONFLICT (idempotency_key) DO NOTHING;
```

---

## 4. atomicity

`mark_order_paid` 内の処理順:
1. `orders FOR UPDATE`（ロック）
2. status / session_id binding チェック
3. `albums FOR UPDATE`（ロック）+ cover snapshot
4. `order_photos` INSERT（snapshot）
5. `orders` UPDATE（paid + snapshot）
6. `albums` UPDATE（ordered）
7. `print_jobs` INSERT（queued） ← 新規

全て同一 PL/pgSQL トランザクション。PDF 生成・Storage upload はトランザクション外の別パイプラインで実行。

---

## 5. provider 選択

Webhook が `process.env.PRINT_PROVIDER ?? "mock"` を読み取り、`p_provider` として `mark_order_paid` に渡す。DB 関数が env を読まず、Client が provider を指定できない。`PRINT_PROVIDER` は環境変数で管理者が設定する。

---

## 6. SupabaseImageLoader

`lib/print/pdf/supabase-image-loader.ts`（`import "server-only"`）

- `PrintImageLoader` interface を実装
- `createAdminClient()` 経由で `pet-photos` private bucket から download
- エラー / データなし → `ImageLoadError` throw
- パスをログに出力しない

---

## 7. print-files bucket

`print-files` private bucket（`public=false`）。`application/pdf` 専用。50MB 制限。`service_role` のみアクセス可（RLS policy 不要 — service_role は RLS をバイパス）。

---

## 8. Storage policy

`print-files` に対して `CREATE POLICY` なし。`authenticated`/`anon` は INSERT / SELECT / DELETE 不可。

---

## 9. PrintFileStore

`lib/print/pdf/print-file-store.ts`（`import "server-only"`）

```typescript
interface PrintFileStore {
  save(orderId: string, file: GeneratedPrintFile): Promise<StoredPrintFile>;
}
class SupabasePrintFileStore implements PrintFileStore { ... }
```

`upsert: true` で再実行安全。失敗時は `PrintFileUploadError` throw。

---

## 10. prepare pipeline

`lib/print/pipeline/prepare-print-job.ts`（`import "server-only"`）

```
preparePrintJob(printJobId) →
  1. atomic claim (prepared_at IS NULL UPDATE)
  2. order + product 読込
  3. order_photos position ASC
  4. buildPrintDocument
  5. generatePrintPdfs (SupabaseImageLoader)
  6. SupabasePrintFileStore.save × 2
  7. print_jobs.cover/content_file_path 更新
```

`album_photos` は一切使用しない。

---

## 11. asset path 保存

`print_jobs.cover_file_path` / `content_file_path` に PDF パスを保存。Provider submit 時に再生成不要。

---

## 12. internal processing state

`print_jobs.prepared_at timestamptz`（nullable）のみ追加。status enum は変更しない。

- `prepared_at IS NULL` = 未処理
- `prepared_at IS NOT NULL` = PDF 生成・保存済み

status enum に「preparing」などを追加すると Provider status（processing）と混同するリスクがあるため、最小追加を選択。

---

## 13. failure

catch ブロック:
1. `error.code` を `SAFE_ERROR_CODES` セットで検証（allowlist）
2. 不明コードは `"PDF_GENERATION_FAILED"` にフォールバック
3. `print_jobs` に `status=failed`, `failed_at`, `error_code` を保存
4. `prepared_at = null` にリセット（retry 可能にする）
5. エラーを再 throw

PII / Storage パス / スタックトレースを DB に保存しない。

---

## 14. retry

`prepared_at = null` にリセットすることで、再実行時に `IS NULL` ガードが通る。  
同一 order に対して新しい `print_jobs` row は作らない（idempotency_key UNIQUE）。  
PDF が既に `print-files` に存在する場合: `upsert: true` で上書き（べき等）。

---

## 15. concurrency

```typescript
await admin.from("print_jobs")
  .update({ prepared_at: now(), updated_at: now() })
  .eq("id", printJobId)
  .eq("status", "queued")
  .is("prepared_at", null)   // ← atomic claim
  .select("id, order_id")
  .maybeSingle();
```

`maybeSingle()` が null を返した場合（0 rows updated）= 既に別 worker がクレーム済み → エラー throw。

---

## 16. Mock integration

`buildPrintDocument` が `original_path` を持つ `PrintPage.item` を生成。これが `MockImageLoader` または `SupabaseImageLoader` の `load(path)` に渡る。`MockPrintProvider.submitOrder` のために `PrintOrderParams.items` に `storagePath` が含まれる構造は既存の `document-types.ts` / `document-builder.ts` で対応済み。

---

## 17. DPI warning

`generatePrintPdfs` の `warnings: DpiWarning[]` を `PrepareResult.warnings` として返却。DB には保存しない。将来の運営ダッシュボード / ログ監視用。PII を含まない。

---

## 18. security

| 項目 | 状態 |
|---|---|
| pipeline server-only | `import "server-only"` on all pipeline files |
| Client provider 指定不可 | `PRINT_PROVIDER` は env var、webhook で読む |
| PII ログなし | `console.*` なし |
| print-files authenticated アクセス | なし（no policy = no access） |
| print_jobs Client 書き込み | REVOKE ALL from authenticated, anon（既存） |
| error_code sanitized | SAFE_ERROR_CODES whitelist |
| Storage パス非公開 | signed URL なし、サービスロールのみ |

---

## 19. tests

`tests/print-pipeline.test.mjs` — **23 件全パス**（structural 大多数 + 純粋関数テスト）

---

## 20. typecheck / lint / build

- `tsc --noEmit` → **0 errors**
- `npm run lint` → 0 errors, 0 warnings
- `npm run build` → 成功

---

## 21. node tests 総数

```
node --test tests/*.mjs → 345 tests, 345 pass, 0 fail
```

---

## 22. git status --short

```
 M app/api/stripe/webhook/route.ts
 M lib/print/pdf/errors.ts
 M lib/supabase/database.types.ts
?? lib/print/pdf/print-file-store.ts
?? lib/print/pdf/supabase-image-loader.ts
?? lib/print/pipeline/
?? supabase/migrations/20260918160000_print_pipeline.sql
?? tests/print-pipeline.test.mjs
```

commit / push / merge 未実施。Remote Supabase 未操作。Provider API 実通信なし。

---

## 23. Task047-6 で必要なもの

| 項目 | 内容 |
|---|---|
| Webhook から pipeline 自動起動 | paid 後に `preparePrintJob` を非同期で呼ぶ仕組み（Supabase Edge Function / cron / API Route） |
| Provider submit 実装 | `print_jobs.status = submitted` / Provider API 呼び出し実装 |
| Prodigi / Gelato SKU 確定 | `PRODUCT_MAPPING` 登録 → `ProdigiProvider.submitOrder` 完成 |
| `preparePrintJob` の API Route / cron | 手動または定期実行のトリガー |
| 日本語フォント | 表紙タイトルテキスト対応（Noto Sans JP 等） |
| `bleedMm` 確定 | Prodigi Sandbox でブリード仕様確認後に設定 |
| `print_jobs` モニタリング | failed job の管理画面 / アラート |
