# Task078.2.3 — Background Analysis Completion & Auto-Resume Reliability

- Date: 2026-10-10
- Branch: `feature/task078-2-3-background-analysis-auto-resume`
- Base: `0571a1f` (`origin/main` at task start)
- Status: **PARTIAL / Production row-level diagnosis and acceptance remain blocked**
- Production verdict: **NOT VERIFIED**. No production behavior change was deployed from this branch.

## Production Observation

The shared authenticated Production page showed `24 / 28枚` during multiple read-only observations between 00:14 and 00:25 UTC. It remained at 24/28 for over ten minutes. The visible setup selected all pets, the recent three-month period, and 24P. This was not the 48P Dataset A scenario, so it does not prove the user's 24/28-at-48P example.

Two same-origin `GET /api/photo-analysis` checks returned HTTP 200 with `ready: true`, `waitMs: 1000`, and `stage: "semantic"`. GET does not claim or run a work item; `changed: false`, `visionCalled: false`, and `analysisFailed: false` are expected for this read-only lookup. The browser briefly showed the app-shell organizing status, but these observations do not prove that the semantic item belongs to the four unready source photos or that any work completed.

The browser recorded repeated `ERR_ABORTED` requests to the Album preparation Server Action. Those events alone do not distinguish client cancellation from a server/action failure. No manual analysis POST, photo mutation, album creation, or page-condition change was initiated.

The shared Production session exposes only aggregate readiness. Vercel Runtime Logs and read-only access to the corresponding `photos`, `photo_ai_analyses`, and `photo_analysis_results` rows were unavailable. Therefore the remaining four photos cannot yet be classified by row, queue state, semantic/geometry result, analysis version, or fingerprint. No Production root cause is claimed.

## Code Findings And Changes

- The authenticated app layout mounts `AIAnalysisRunner` globally, not only on Home. The current source route therefore does not explain the stall as a Home-only runner.
- The runner previously stopped after a transient request exception without scheduling another attempt. It now retries with a capped delay and periodically rechecks a stopped queue while the page remains visible.
- The queue previously reported a wait for any unclaimable failed/processing row, including terminal errors and exhausted attempts. Retryable wait time was then discarded by the API's work lookup. The queue now distinguishes retryable work from terminal work, preserves the wait through the API response, and lets the runner resume at that time.
- Readiness now emits the `albumPreparation` structured log with `totalSource`, `ready`, `pending`, terminal `failed`, `stale`, `staleVersion`, `staleFingerprint`, `missingSemantic`, `missingGeometry`, `queueMissing`, `eligibleReady`, `requiredEligible`, `runnerWorkCount`, `lastProgressAt`, and `queueStatusAvailable`. It contains no photo IDs, user IDs, captions, or other PII. `runnerWorkCount` is the count of distinct source-photo rows whose queue or analysis timestamp advanced since the frozen intent start; `lastProgressAt` is the newest such timestamp.
- Queue-state lookup is diagnostic only: if it fails, existing readiness evaluation continues and the log marks the queue status unavailable.
- Stored-input inspection now records version/fingerprint and semantic/geometry gaps for diagnosis. Generation behavior and the current all-source readiness gate remain unchanged. In particular, readiness does not yet advance on `eligibleReady >= requiredEligible`, and terminally failed source photos are not yet excluded from generation. Those behavioral changes are deferred until the Production rows establish whether they are appropriate and preserve the quality/page-budget contract.

## Production Row Classification

| Category | Result |
| --- | --- |
| Ready | Aggregate screen says 24/28; DB-level row classification unavailable |
| Pending | Unknown for the remaining four |
| Failed / retryable / terminal | Unknown |
| Stale version / stale fingerprint | Unknown |
| Missing semantic / missing geometry | Unknown |
| Queue row missing | Unknown |
| Remaining four reconciled individually | Not done; no row-level access |

The aggregate queue GET found semantic work in the authenticated account, but it cannot be safely matched to the four unready photos without the new production log or authorized row-level evidence.

## Auto-Resume Acceptance

- Preparation route mounted the global runner: verified from the local layout; the Production UI briefly displayed its organizing indicator.
- Queue work was discoverable by a read-only Production GET: verified, but not correlated to the four unready photos.
- Automatic queue work completion, counter change from 24/28, automatic Album generation, and Preview arrival: **not verified**.
- Production deployment of this branch and its new structured log: not performed. Do not merge to `main` without authorization.

## Regression And Verification

- `node --test tests/*.test.mjs`: 1,021 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors, 12 warnings in existing unrelated files.
- `npm run build`: passed with Next.js 16.4.0.
- Focused Task078.2.1 / Task078.2.2 / photo-intake / photo-analysis-queue tests: passed.
- `git diff --check`: passed for tracked changes and the untracked report.

No synchronous Vision work was added to album generation. Stored analysis remains batched in groups of 200; existing 80-second generation budget, intent ID/idempotency, duplicate prevention, and 24/48/72P behavior were not changed.

## Next Evidence Required

Deploy this feature branch to an authorized Production-equivalent environment or provide the new `albumPreparation` Runtime Log record for the affected intent. If row-level inspection is used instead, provide only redacted aggregate findings for the four photos: queue status/attempts/error class, current semantic and geometry status, stored/current versions, stored/current fingerprint match, and latest progress time. Then determine whether enough quality-eligible photos exist, change the smallest relevant behavior, and verify automatic generation through Preview with the same frozen conditions.

## Git And Worktree

No commit, push, deployment, or merge was performed. Existing unrelated Legal/Pricing/Billing/public-test edits and the Task078.3 report were preserved.