# Task047-5 最終修正 実装報告書

## 1. migration名

`20260918170000_print_pipeline_claim_separation.sql`

既存の `20260918160000_print_pipeline.sql` は変更せず、新規migrationとして追加。

---

## 2. preparation_started_at

`print_jobs` テーブルに `preparation_started_at timestamptz null` を追加。

**役割**: worker が job を claim した時刻を記録する「クレームトークン」。  
claim 時に `now()` をセット。success または failure 完了時に `null` へリセット。

---

## 3. prepared_at の意味

**変更後の意味**: PDF生成 + print-files バケットへの cover/content アップロード完了後にのみセットされる「準備完了マーカー」。

- claim 時は `null` のまま
- 成功後のみ `completionTime` がセットされる
- `prepared_at != null` = 準備完了を保証

---

## 4. atomic claim

Supabase クライアントの単一 UPDATE で atomic に実行:

```ts
.update({ preparation_started_at: now, updated_at: now })
.eq("id", printJobId)
.eq("status", "queued")
.is("prepared_at", null)
.or(`preparation_started_at.is.null,preparation_started_at.lt.${leaseExpiry}`)
.select("id, order_id, preparation_started_at")
.maybeSingle()
```

PostgreSQL の行ロック付き UPDATE のため、同時実行しても 1 worker のみが `claimed !== null` を受け取る。select → update の 2 段階なし。

---

## 5. lease timeout

定数: `LEASE_TIMEOUT_MINUTES = 15`（export 済み、テスト可能）

`leaseExpiry = now - 15min` を計算し、OR 条件に含める。  
`preparation_started_at < leaseExpiry` の job は再 claim 可能 → crash 後の永久 lock なし。

---

## 6. stale worker 対策

claim 時に返却された `claimed.preparation_started_at` を `claimedAt` として保持。  
completion update 時に:

```ts
.eq("preparation_started_at", claimedAt)
```

を条件に追加。Worker A のリースが切れて Worker B が再 claim した後、遅延した A が完了しても B の DB 状態を上書きできない（0 rows updated）。

---

## 7. success

PDF生成 + カバー/コンテンツアップロード完了後:

```ts
.update({
  cover_file_path: cover.path,
  content_file_path: content.path,
  prepared_at: completionTime,      // ← 初めてセット
  preparation_started_at: null,     // ← クリア
  updated_at: completionTime,
})
.eq("id", printJobId)
.eq("preparation_started_at", claimedAt)  // stale worker guard
```

---

## 8. failure

catch ブロック:

```ts
.update({
  status: "failed",
  failed_at: now,
  error_code: safeCode,
  prepared_at: null,                // ensure
  preparation_started_at: null,     // クリア
  updated_at: now,
})
.eq("id", printJobId)
```

error_code は `SAFE_ERROR_CODES` ホワイトリストでサニタイズ済み。

---

## 9. retry

呼び出し元が既存 row を:

```sql
status = 'queued', failed_at = null, error_code = null, preparation_started_at = null
```

へリセットすることで同一 row を再利用。pipeline 内部では `INSERT` は行わない。

---

## 10. provider validation

`20260918170000_print_pipeline_claim_separation.sql` に追加:

```sql
alter table public.print_jobs
  add constraint print_jobs_provider_check
    check (provider in ('mock', 'prodigi', 'gelato', 'fujifilm'));
```

`mark_order_paid` で `p_provider` に任意文字列が渡されても、INSERT 時に制約違反でトランザクション全体が失敗。

---

## 11. tests

### 新規追加テスト (W〜AH, 12件)

| ラベル | 内容 |
|--------|------|
| W (新A) | claim時 prepared_at はnull |
| X (新B) | claim時 preparation_started_at が入る |
| Y (新C) | 成功後 prepared_at が入る |
| Z (新D) | 成功後 preparation_started_at null |
| AA (新E) | failure後両方null |
| AB (新F) | 同時claimは1workerのみ (atomic UPDATE + maybeSingle) |
| AC (新G) | stale claim再取得可能 (leaseExpiry条件) |
| AD (新H) | fresh claim再取得不可 |
| AE (新I) | crash想定で永久lockしない (LEASE_TIMEOUT_MINUTES定数) |
| AF (新J) | invalid provider拒否 (migration CHECK constraint) |
| AG (新K) | valid provider 4種許可 |
| AH (新L) | retryは既存job再利用 (INSERT print_jobs なし) |

### 既存テスト (A〜V, 23件)

変更なし。全アサーション通過確認済み。

---

## 12. node tests 総数

**357件** (345件 + 12件追加)

```
# tests 357
# pass 357
# fail 0
```

---

## 13. typecheck / lint / build

| 検証 | 結果 |
|------|------|
| `npx tsc --noEmit` | ✅ エラーなし |
| `npm run lint` | ✅ エラーなし |
| `npm run build` | ✅ ビルド成功 |
| `git diff --check` | ✅ 警告なし |

---

## 14. git status --short

```
M app/api/stripe/webhook/route.ts
 M lib/print/pdf/errors.ts
 M lib/supabase/database.types.ts
?? docs/UCHINOCO_v1.1_UI_Design.pdf
?? docs/task047-5-implementation-report.md
?? docs/task047-5-final-fix-implementation-report.md
?? lib/print/pdf/print-file-store.ts
?? lib/print/pdf/supabase-image-loader.ts
?? lib/print/pipeline/
?? supabase/migrations/20260918160000_print_pipeline.sql
?? supabase/migrations/20260918170000_print_pipeline_claim_separation.sql
?? tests/print-pipeline.test.mjs
```

commit / push / merge 未実施。Remote Supabase 操作未実施。Provider API 実通信未実施。
