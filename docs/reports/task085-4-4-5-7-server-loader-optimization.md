# Task085.4.4.5.7 — Server loader parallelization and request-local reuse

## Status and baseline

**HOLD — implementation locally verified; browser performance and save acceptance in progress.** No performance PASS or next-task decision is claimed.

Production baseline: `2dc0b3e9c0fb48aa59b409bdcfffd0a59ef1ff87`, configured sin1. Dedicated comparison branch starts at that exact source. Baseline comparison commit `54f2425cf0c2fe222eed359da215f03cb5ffd97b` changes this report only; its application tree and lockfile match Production. Candidate application changes are still local while baseline measurements await login.

No Production deployment, main integration, RPC, schema, RLS, Service Role addition, UI, image policy, generation, Recovery, subset, or mutation-contract change. Unrelated worktree changes are preserved and excluded from this task.

## Exact changes

- `route-read-context.ts`: render-only closure holding verified user/authorized album, active-version Promise, album-pet membership Promise, owner-only replacement eligibility Promise, and loaded/in-flight photo metadata. No global or cross-request cache. Photo reads use serial batches of at most 64 IDs; concurrent calls share registered in-flight IDs. Candidate records seed the same metadata map. Mutation Actions never receive this context.
- `load-route-draft.ts`: resolve one active version, read body metadata and same-version cover concurrently, then resolve the deduplicated union of AI/reset and effective/user frame/cover identities. Cover URL lookup remains restricted to cover identities; body photographs do not become cover fallback candidates. Existing assembly, layout rankings, crop, elements, backgrounds and contain semantics are retained.
- Edit: independent owner-filtered album and canonical route-pet reads run concurrently; both checks must succeed before rendering. Ordered-album redirect and existing renderer/props remain.
- Page Editor: draft, candidate loading and suggestion loading run concurrently after authorization. Internal render candidate helper shares eligibility and photo records; the public mutation service is unchanged. Recent-photo limit and explicitly selected album photographs are retained. Secondary pets remain eligible; wrong uploader/outside pet fail closed.
- Page Editor analytics uses Next `after`, with an already-created authenticated server client captured outside the callback. No untracked fire-and-forget Promise; existing analytics failure/deduplication policy remains.
- Complete: active-version metadata replaces the full draft read; legacy photo/day summary, entitlements, accepted state, order guards, pet labels and CTA props remain.
- Saved-draft Preview: RLS album/canonical-pet checks precede the saved-draft path, which returns before unnecessary legacy photos, entitlement, suggestion, extra pet-label and latest-order reads. No owner-only restriction is introduced for shared readers. Missing draft still follows the existing legacy branch.
- URL helpers accept the same-request verified user to avoid helper auth repetition. Default callers, including mutation and Print callers, preserve their existing fresh behavior.

## Dependency graph and query evidence

These are source/dependency models, **not physical HTTP measurements**. Layout/proxy reads, analytics writes, SDK retries, and storage operations are separate. Larger books or candidate cap misses can add bounded photo batches.

Edit baseline: auth → album → pet → version → spreads → five parallel element-group reads → body photo paths/signing → cover → cover paths/signing.

Candidate: auth → parallel(album, pet) → version → parallel(body metadata, cover) → deduplicated photo paths/signing → render. For a nonempty book within one photo batch: 12 → 11 logical SELECTs, approximately 8 → 5 remote DB dependency layers (auth excluded). Cover shares the active version and photo path request.

Saved Preview candidate: auth → canonical album → route pet → version → parallel(body metadata, cover) → union photo paths/signing → analytics → render. Core draft route has 11 logical SELECTs within one batch. Legacy prelude is skipped. The supplied baseline source model was 23 SELECTs / 16 layers; runtime counts and exact branch-specific analytics overhead remain to be measured. Candidate core DB path is approximately six layers, excluding auth and analytics.

Page Editor baseline serializes draft → analytics → candidate pipeline → suggestion. Candidate branches overlap after route authorization; version and membership are shared, candidate records avoid their previous path re-SELECT, overlapping body metadata requests share in-flight IDs. Exact route count depends on suggestion early exits, recent-photo coverage, and timing of candidate seeding versus draft signing. No fixed runtime count is claimed from call-site counts.

Complete no longer reads spreads, frames, four additional element/background groups, or draft-body photo paths/signing merely to decide whether a draft exists. Suggestion may reuse album, membership and active version. Exact SELECT/layer counts remain branch-dependent; the requested approximate 21/14 → 14/11 model is a target, not measured evidence.

Actual Auth HTTP, SELECT HTTP, Storage HTTP and server timings are pending browser/runtime acceptance. Parent layout logical auth call sites are unchanged; helper reuse does not prove an equivalent reduction in Auth HTTP.

## Observability

New server stage logs are Preview-only and contain static stage names and durationMs only. Existing draft stage timing remains. No route IDs, photo IDs, paths, URLs, credentials or error payloads are added. Return-boundary is a loader-ready marker, not an RSC serialization/send measurement. No claim of request correlation or transport timing is inferred from this marker.

## Local verification

- Full suite: **1179/1179 PASS**, zero failures/skips.
- TypeScript: PASS.
- Lint: zero errors, 12 existing warnings.
- Diff whitespace check: PASS.
- Final-source build: PASS on ordinary retry with identical configuration. The initial invocation compiled successfully but exited 1 after the installed Next tool emitted a SecurityFatalError advisory. No dependency upgrade, suppression flag, or security configuration change was made. The advisory remains a separate known limitation and is not resolved by a successful retry.

New regression coverage includes same-request version/eligibility sharing; fail-closed ownership/membership; request isolation; remembered and in-flight photo path reuse; secondary-pet candidates and rejection predicates; selected-photo cap recovery; shared saved-Preview short circuit and wrong canonical route rejection; 24/48/72-page draft/cover assembly with reset/effective identities; unchanged contain/layout ranking; and metadata-only Complete / safe analytics scheduling. Existing cover persistence and renderer tests remain enabled.

## Browser acceptance and remaining work

A dedicated fixed comparison Preview is Ready, configured sin1 and baseline-SHA matched. Login is confirmed; no repeated logout or host change is required. Baseline measurements have started after successful login; candidate acceptance follows. After login, measure Edit, Page Editor, Complete and Preview at least six samples each, with Home regression control, using the same fixture/session/380×715 viewport. Report observation overhead separately from browser paint/TTFB when unavailable.

Owner flow, secondary-pet candidate identity, cover/body/reset/crop/layout identity, reload, and safe background save → Back → Preview → reload → restore still require browser evidence. Unit coverage is not substituted for live family/wrong-owner account coverage.

### Print environment limitation

Exact Production Print source requires a server-only credential absent from the comparison Preview. This task explicitly forbids adding Service Role access. Therefore candidate Print browser regression is **UNVERIFIED due to environment parity limitation**; no secret is added, no Print workaround is mixed into the task, and no order/checkout/PDF is executed. Default Print read path remains unchanged, but that fact alone is not a browser PASS.

Genuine No-Crop browser coverage remains **UNVERIFIED due to fixture absence**; no artificial DB/layout fixture is created.

## Decision

HOLD pending performance/correctness/save acceptance and explicit resolution or acceptance of the Print environment limitation. No measured speedup, tail reduction, or RPC/client optimization recommendation is asserted yet. Production remains unchanged. Do not advance automatically to Task085.4.4.6 or Task085.5.
