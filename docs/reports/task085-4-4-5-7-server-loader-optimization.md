# Task085.4.4.5.7 — Server loader parallelization and request-local reuse

## Status and baseline

**HOLD — implementation and live save acceptance verified; overall performance/regression acceptance is incomplete.** Required Preview Print cannot run without forbidden credential addition; tail and control variance remain. No Production adoption is recommended from this task alone.

Production baseline: `2dc0b3e9c0fb48aa59b409bdcfffd0a59ef1ff87`, configured sin1. Dedicated comparison branch starts at that exact source. Baseline comparison commit `54f2425cf0c2fe222eed359da215f03cb5ffd97b` changes this report only; its application tree and lockfile match Production. Candidate commit `9eef1ff7844f9a1b2705766e3f57863b0a183a52` is deployed through Git Integration to a dedicated Preview, READY and SHA-matched, configured sin1. No inference of Function runtime region is made from ingress/edge log region. Production and the ordinary development Preview alias were not changed. Final read-only Production check remains READY at the original baseline SHA; only the authorized fixture background edit/restore changed shared application data, with identity hashes and order count unchanged.

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

Actual Auth HTTP, SELECT HTTP and Storage HTTP counts are not exposed by the minimal baseline diagnostics; they remain unmeasured rather than inferred. Preview runtime stage timing was collected separately below. Parent layout logical auth call sites are unchanged; helper reuse does not prove an equivalent reduction in Auth HTTP.

## Observability

New server stage logs are Preview-only and contain static stage names and durationMs only. Existing draft stage timing remains. No route IDs, photo IDs, paths, URLs, credentials or error payloads are added. Return-boundary is a loader-ready marker, not an RSC serialization/send measurement. No claim of request correlation or transport timing is inferred from this marker.

## Local verification

- Full suite: **1179/1179 PASS**, zero failures/skips.
- TypeScript: PASS.
- Lint: zero errors, 12 existing warnings.
- Diff whitespace check: PASS.
- Final-source build: PASS on ordinary retry with identical configuration. The initial invocation compiled successfully but exited 1 after the installed Next tool emitted a SecurityFatalError advisory. No dependency upgrade, suppression flag, or security configuration change was made. The advisory remains a separate known limitation and is not resolved by a successful retry.

New regression coverage includes same-request version/eligibility sharing; fail-closed ownership/membership; request isolation; remembered and in-flight photo path reuse; secondary-pet candidates and rejection predicates; selected-photo cap recovery; shared saved-Preview short circuit and wrong canonical route rejection; 24/48/72-page draft/cover assembly with reset/effective identities; unchanged contain/layout ranking; and metadata-only Complete / safe analytics scheduling. Existing cover persistence and renderer tests remain enabled.

## Browser performance acceptance

Same fixed comparison host, authenticated browser session, existing real 24P fixture, 380×715. Five routes × six document loads × two cohorts = 60 samples; baseline first, candidate second. This is a sequential cohort comparison, not interleaved or a statistically controlled attribution experiment. Deployment and cache warmth/time-window variance remain limitations.

The measurement uses external wall-clock navigation start → visible route heading, then load event and image/card observations. Browser performance timing was unavailable in the automation read-only scope. These are **heading-ready proxies**, not paint, hydration completion, verified usability, SQL execution time, or exact first-byte timing. Observer/automation overhead is included. Load event is not treated as fully-ready.

Heading-observed medians (baseline → candidate):

- Preview: 2,479.5 → 1,794 ms, 27.6% lower.
- Edit: 1,252 → 1,085 ms, 13.3% lower.
- Page Editor: 1,609 → 1,223.5 ms, 24.0% lower.
- Complete: 1,337 → 1,056 ms, 21.0% lower.
- Home control: 1,262.5 → 1,509 ms, 19.5% higher. Home source is unchanged; this comparison cannot establish code regression or prove absence of regression.

Outliers: baseline Preview sample 5 hit the selector deadline around 4,305 ms and load was observed at 4,456 ms; candidate sample 6 hit the selector deadline around 5,000 ms and load was observed at 5,006 ms. These heading samples are censored observations, not exact successful heading-ready times. They are retained, not discarded; their upper-tail position does not change the medians. Other successful heading maxima: Edit 1,511 → 1,339; Page Editor 2,406 → 1,741; Complete 1,402 → 1,473; Home 2,506 → 1,819 ms. Tail elimination is not proven.

Load-observed medians: Preview 2,484.5 → 1,799; Edit 1,346 → 2,123.5; Page Editor 1,613.5 → 1,243.5; Complete 1,383.5 → 1,062; Home 1,269.5 → 1,539.5 ms. Edit has several roughly two-second post-heading gaps; it must not be labelled fully-ready improvement. Three supplementary candidate Edit probes observed all 12 body cards and all 25 images complete at heading, with heading/load 1,436/1,458, 1,050/1,067, 797/809 ms. The earlier gap did not reproduce in those probes; its cause remains unproven. No speculative UI fix was added.

All 60 samples reported zero complete-but-broken images and no document horizontal overflow. Some intentionally lazy/offscreen images were not complete at load; no claim of all-image completion is made from load event alone.

## Runtime stage evidence

Read-only runtime log windows contain 25 baseline and 24 candidate requests with parsed Album stages. Some extra verification navigations are included, so these pooled stage distributions are not a one-to-one browser pair distribution. B1 safe data parser is used; no string execution. No error-level records appear in either captured window.

Candidate pooled stage medians/max (ms; n):

- pre-draft auth 68/295 (24), album 73/118 (12), pet 65/191 (12).
- active version 78/177 (24).
- saved Preview bundle 845/2,519 (6).
- Edit draft-cover-signing 441/674 (6).
- Page Editor draft 494/666, candidates 709/934, suggestion 85/153 (six each); these overlap and must not be summed.
- body metadata 334/2,278 (12), cover 64/122 (12), union signing 84/359 (12).
- draft elements group 202/2,170 (18), spreads 76/135 (18).
- candidate context 122/262 and candidate photos 69/112 (six each).
- analytics scheduling/return boundary markers 0 ms; these are marker costs only, not delivered analytics or RSC send latency.

Baseline pooled draft elements median/max 133/1,116, version 45/194, spreads 45/81, preview URLs 55/398 ms (25 each). Candidate Page Editor URL stage median/max 0/384 (6). Signing cache hit/miss and physical HTTP counts are unavailable; zero duration is not classified as a proven cache hit. No artificial cache clear was used and no cold/warm cohort is invented.

Candidate Complete requests have version metadata and return stages without draft spread/elements/preview-URL stages, confirming removal of its full draft read. Candidate Preview avoids legacy list-image stage; the six candidate detail.list-image-urls records belong to Complete. Preview tail includes a 2,170 ms parallel element-read group; individual table time and exact critical-path attribution are unavailable. Remote metadata waiting remains a plausible residual, not proof that all remaining latency is DB.

## Correctness and save acceptance

PASS with the existing owner fixture:

- Page Editor, 12 body list cards, Preview body and 14 rail tabs render; no blank-image failures or overflow were observed.
- Existing secondary-pet photograph is present in the replacement Picker. No replacement was committed merely for fixture testing.
- Wrong canonical route-pet Preview returns 404 with no album content.
- Safe left-background change warm → white: local saving → saved, Back → Edit → Preview → reload retains white. Restore white → warm, saved, Back and Preview confirm warm again.
- Read-only DB comparison: active revision 15 → 16 → 17; background clientSeq 9 → 10 → 11 and background revision 9 → 10 → 11. Frame, spread and cover hashes remain identical throughout; 12 spreads, one accepted event and zero orders remain unchanged. No photo/crop/layout/cover identity mutation or stale rollback occurred.

Automated coverage verifies rejected ownership/membership/uploader predicates, shared-reader Preview branch preservation, no-draft legacy source boundary, reset/effective identities and 24/48/72-page assembly. A second browser account for live family/wrong-owner acceptance was not available: **UNVERIFIED in browser**, not substituted with an owner session. Mutation Actions remain byte-unchanged from baseline; no render context becomes a mutation authorization token.

Evidence is local-only under the ignored task outputs directory: browser samples, runtime windows/parsed stages, deployment metadata, before/changed/restored read-only state, verification logs and restored Edit screenshot. These private JSON/image files are not Git additions. Canonical report contains no real fixture identity, host, credential or signed URL.

### Print environment limitation

Exact Production Print source requires a server-only credential absent from the comparison Preview. This task explicitly forbids adding Service Role access. Therefore candidate Print browser regression is **UNVERIFIED due to environment parity limitation**; no secret is added, no Print workaround is mixed into the task, and no order/checkout/PDF is executed. Default Print read path remains unchanged, but that fact alone is not a browser PASS.

Genuine No-Crop browser coverage remains **UNVERIFIED due to fixture absence**; no artificial DB/layout fixture is created.

## Decision

**HOLD for full acceptance.** Implementation/local verification and the requested live background save/restore are successful; four target heading medians improve and fall within the indicative ranges. However Print Preview remains environment-blocked; Home control median and Edit load-event variance need controlled follow-up, and Preview still has a five-second tail. Those observations are not hidden by the median.

RPC need is not settled solely by this sample. The bounded loader changes reduce unnecessary work; the remaining Preview metadata-read tail supports considering further remote-boundary investigation before a Snapshot/RPC prototype, but physical HTTP counts and controlled control-route evidence are still missing. This is not permission to start a new task. No Task085.4.4.6, Task085.5 or Production release is executed.
