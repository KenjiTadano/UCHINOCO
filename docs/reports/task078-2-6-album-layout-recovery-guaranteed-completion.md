# Task078.2.6 — Album Layout Recovery & Guaranteed Completion

- Date: 2026-10-10
- Branch: `feature/task078-2-6-album-layout-recovery`
- Base: `c5be6fd` (Task078.2.5 on `main`)
- Status: **Implemented and locally verified; Production acceptance pending**

## Root Cause

`buildEditorialDraft` previously built candidate layouts for each spread and then filtered out every `unusable` result. If one spread had no remaining safe candidate, the entire Album threw immediately. The generation action translated that internal layout failure into a request to change page count or period even when eligible capacity had already passed. Candidate scoring also exhaustively considered the entire matching layout catalog when the shortlist lacked a strict-tier result, while a strict-tier result that later failed crop gates could prevent evaluation of other candidates.

## Recovery Architecture

Each spread now starts with up to 6 ranked, count-matched templates. When no candidate clears the existing crop/layout gates, it evaluates up to 8 additional ranked templates plus up to 3 registered safe-fallback variants for that density. The fallback layouts are persisted in the editorial registry so Viewer/Preview reconstruction uses the same geometry.

If layout candidates remain unsafe, recovery proceeds in bounded order:

1. Reassign Hero/secondary roles up to 3 times; existing layout assignment still evaluates photo-to-frame permutations.
2. Replace a photo with up to 8 globally bounded same-scene candidates supplied by generation. Replacements must be non-alternate and technical quality >= 25. Only failed spreads are considered, candidate preview URLs are requested only after the initial recovery pass fails, and selected Album photos are updated to the recovered IDs.
3. Reduce density by moving one secondary photo from an unsafe spread to an adjacent spread. Reflow is limited to one neighbor and two directional attempts, keeps the spread/page count unchanged, and rejects duplicate photo IDs.
4. Re-run the whole-book Rhythm Audit and its existing bounded repair passes. Crop/layout gates remain in force; no unsafe candidate is promoted to usable.

The generation POST still performs no synchronous Vision work. Existing Best Shot ranking, 200-photo metadata batching, 80-second budget guard, Multi-Pet handling, 24/48/72P spread count, persistence/intent idempotency, and Preview-first navigation remain intact.

## Safe Fallbacks

Registered Print-safe and gutter-safe fallback templates now cover 1–6 photos per spread, with mirrored variants to support alternating composition. Single-photo fallbacks include a portrait-scale page treatment and a centered landscape treatment with editorial margins; they do not require full-bleed crop. They use the same normal crop safety and persistence/Preview pipeline as other layouts. The tests verify template registration, exact frame count, gutter clearance, crop gate pass, and Preview layout lookup.

Fallback is not a license to ignore source-image safety. A photo whose ears/face are already clipped in the source cannot be repaired by changing its frame; same-scene eligible replacement is attempted instead. If all bounded eligible candidates still fail, the system returns a generic actionable recovery without exposing crop/template terminology.

## Whole-Book Recovery And Telemetry

Rhythm Audit remains active after per-spread recovery. Safety is evaluated before Rhythm optimization. The existing whole-book repair pass count is now sourced from the explicit recovery config.

`albumLayoutRecovery` is emitted as an aggregate structured event with `spreadCount`, `initialUnsafeSpreadCount`, `templateFallbackCount`, `photoReassignmentCount`, `bestShotReplacementCount`, `densityFallbackCount`, `adjacentReflowCount`, `safeFallbackUsedCount`, and `unrecoveredCount`. It contains no photo, album, pet, or user IDs. Candidate bounds are explicit in `lib/album-draft/config.ts`; `layoutCandidateCount` records attempted layouts for the existing generation performance log.

## Capacity Recommendation

The minimum eligibility contract remains unchanged (24P 12, 48P 24, 72P 36). Recommendation ranges are separate: 24P recommends 12–23 eligible photos, 48P recommends 36–59, and 72P recommends 60+. Thus 24 eligible photos can still create 48P, but 48P is no longer labeled “おすすめ” at its minimum boundary. Capacity availability remains server-authoritative.

## Regression And Verification

- `node --test tests/*.test.mjs`: 1,031 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors, 12 existing warnings in unrelated files.
- `npm run build`: passed with Next.js 16.4.0.
- `git diff --check`: passed for tracked changes; the report is checked after creation.
- Focused Task078.2 Editorial, 2.1 performance, 2.2 readiness, capacity, runner, fallback, replacement, reflow, duplicate-photo, low-quality, crop-safety, Rhythm, and Preview-first tests passed.

## Production Acceptance

Production was not deployed or modified in this task. The layout-recovery pipeline and its `albumLayoutRecovery` logs therefore have not been verified against the reported real Production Album. After deployment, verify the capacity-pass case completes through Preview without asking the user to change page count or period, and inspect aggregate recovery counters. Do not claim Production acceptance based on local tests.

## Remaining Limitations

- Best Shot replacement is bounded to up to 8 ranked same-scene candidates from the already analyzed eligible pool; it does not invoke Vision or reanalyze source bytes.
- Adjacent reflow only moves one secondary photo across one neighboring spread and preserves total spread count. Wider multi-spread reflow is not attempted.
- If every bounded safe layout, role assignment, same-scene replacement, and adjacent reflow still fails, the flow provides “別の写真を見直す”, “写真を追加”, and lower-priority “作成条件を変更” actions. This is a genuine system-side exhaustion case, not a capacity-pass guarantee for unusable source photos.
- Production latency/cost impact is not measured; local synthetic Task078.2.1 performance regressions pass.

## Git

No commit, push, deployment, or merge was performed. Changes remain on `feature/task078-2-6-album-layout-recovery`.
