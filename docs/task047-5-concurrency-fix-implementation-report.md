# Task047-5 Security/Concurrency修正 実装報告書

## 概要

failure update に stale worker guard が欠けていた問題を修正。
success / failure 両方で同一の lease ownership ルールを適用。

---

## 問題

Worker A が claim → 15分経過 → Worker B が stale lease を再 claim。  
その後 Worker A が処理失敗した場合、従来の failure update は:

```ts
.eq("id", printJobId)  // のみ
```

だったため、Worker B が処理中でも `status = 'failed'` へ上書き可能だった。

---

## 修正内容

### `lib/print/pipeline/prepare-print-job.ts`

`catch` ブロックの failure update に `.eq("preparation_started_at", claimedAt)` を追加:

```ts
await admin
  .from("print_jobs")
  .update({
    status: "failed",
    failed_at: ...,
    error_code: safeCode,
    prepared_at: null,
    preparation_started_at: null,
    updated_at: ...,
  })
  .eq("id", printJobId)
  .eq("preparation_started_at", claimedAt);  // ← 追加
```

stale worker の場合は 0 rows updated。元の処理エラーは `throw` を維持。

---

## success / failure 対称性

| 操作 | guard条件 |
|------|-----------|
| success update | `.eq("id", printJobId)` + `.eq("preparation_started_at", claimedAt)` |
| failure update | `.eq("id", printJobId)` + `.eq("preparation_started_at", claimedAt)` |

両方で同一の lease ownership ルールを適用。

---

## 新規テスト（AI〜AL, 4件）

| ラベル | 内容 |
|--------|------|
| AI | stale worker success は更新不可 — success update に claimedAt guard あり |
| AJ | stale worker failure も更新不可 — success/failure 両方に guard あり（出現回数 >= 2） |
| AK | current worker failure はfailedへ更新可能 — guard は id AND claimedAt |
| AL | stale worker failure が新 worker の preparation_started_at をclearしない |

---

## Verification

| 検証 | 結果 |
|------|------|
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ |
| `npm run build` | ✅ |
| `node --test tests/*.mjs` | ✅ 361件全通過 |
| `git diff --check` | ✅ |

---

## git status --short

```
M app/api/stripe/webhook/route.ts
 M lib/print/pdf/errors.ts
 M lib/supabase/database.types.ts
?? docs/task047-5-concurrency-fix-implementation-report.md
?? docs/task047-5-final-fix-implementation-report.md
?? docs/task047-5-implementation-report.md
?? lib/print/pdf/print-file-store.ts
?? lib/print/pdf/supabase-image-loader.ts
?? lib/print/pipeline/
?? supabase/migrations/20260918160000_print_pipeline.sql
?? supabase/migrations/20260918170000_print_pipeline_claim_separation.sql
?? tests/print-pipeline.test.mjs
```

commit / push / merge 未実施。Remote Supabase 操作未実施。Provider API 実通信未実施。
