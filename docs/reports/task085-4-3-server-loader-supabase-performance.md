# Task085.4.3 — Global Server Loader / Supabase Performance

Status: phase-one measurements retained below; follow-up local verification PASS, controlled Preview comparison pending. Overall acceptance remains HOLD. No Production deployment or Task085.4.4 work.

## Scope and invariants

Only request-local loader scheduling/reuse is changed. Authentication, RLS, owner/route-pet/membership validation, generation, Recovery, subset, crop/contain semantics, image delivery, save/revision/clientSeq and print quality policy remain unchanged. No global/cross-owner cache, migration, Suspense/prefetch/router-cache or client-render optimization is added.

## Baseline and method

Detailed baseline instrumentation commit: `d1db728ddc8363c0b8399e26788566b11281f1a6`. Auth trace adds fixed-category Supabase physical HTTP observations below fetch memoization, plus Home/Print stage spans. No IDs, URLs, query strings, headers, credentials or result bodies are recorded by these measurements. All runtime evidence and real fixture data are local-only under ignored outputs.

The same existing real 24P album is used with the same IAB browser session and 380×715 viewport. UI-ready is observed when the destination's main content marker is visibly laid out. It does not imply every image has decoded or report LCP. Initial exploratory observations that returned during loading are excluded. Actual Link navigation is measured separately from reload. Runtime logs are correlated by request identity, route category and bounded browser time windows; prefetch/cache hits are not counted as fresh loaders. Browser tooling adds observation overhead. Three samples are a small cohort, not a p95 claim.

## Home

Previously, recent RPC → today → Best Shot → anniversary (including another today read, then ten historical years) → counts → albums → active versions → passive candidates → family RPC → URLs were awaited serially.

After authenticated RLS-visible pets resolve, independent recent/today/history/counts/albums/previous candidate/annual candidate/family reads start together. Today's exact 12-photo result is shared with anniversary and Best Shot. Anniversary history starts independently of today's resolution; exact-day two-query/per-year limits and existing stored signal requirements remain unchanged. Current passive candidate still depends on current album/active-version eligibility. Hero priority is evaluated with every original input after resolution; nothing is dropped or replaced with an approximation.

Critical/deferred classification: hero can depend on anniversary/history, active albums, passive candidates, growth comparison, Best Shot, family activity and recent-photo fallback. These remain critical under the current priority policy. Lower recent gallery, album summary and pet summary are conceptually deferred candidates, but this task does not stream them or change visible priority. Their reads are scheduled independently; full progressive rendering remains out of scope.

Query delta from today reuse is exactly two photo SELECT attempts per populated-pet request; no unsafe broad historical query or new RPC/migration substitutes for the bounded historical reads. Twenty historical SELECT attempts remain parallel and may remain a bottleneck.

## Album Complete / Preview / Edit

Complete still uses the original ordered album photo metadata for cover/count/memory days and the same entitlements/suggestions. It no longer loads an order banner that Complete never renders, or calls full readDraft merely to obtain the active version for analytics/Print availability. The request context supplies that version once; suggestion version lookup reuses it. Missing draft/legacy Preview behavior remains available. Independent entitlements, pet labels, suggestion, list and version reads overlap.

Preview and Edit preserve Task085.2 request context/active draft/cover reuse. Independent album/pet validations overlap through the same authenticated RLS client; both must pass before data is returned. Ordered Edit redirect and owner-only editing remain enforced.

## Print

A server-only inspection module shares existing inspection logic between GET and Action entry points. Actions retain independent authoritative owned-album validation and loadActiveDraft; trusted loaded context is not accepted from an Action argument. The GET path validates owner and route pet, loads one active draft, reads its cover once, and reuses that exact version/revision/cover for UI and snapshot inspection. Cover URLs reuse draft URLs, signing missing cover photos only.

Original photo identities/paths, original download, raster/orientation probe, font readiness, quality issues, previous snapshot comparison and ordered/paid source rules remain. Original bytes are never replaced with thumbnail/preview bytes. Image facts, font reads and previous snapshot reads overlap. Generate/checkout write paths retain snapshot validation and persistence; no checkout/order is executed during acceptance.

Stages include owned album, readDraft, cover, cover URL resolution, photos/input, snapshot, image facts/download, raster/orientation, fonts, quality and previous snapshot. Existing readDraft traces retain version/spreads/elements/preview URLs.

## Verification / pending acceptance

Executable tests cover today dataset reuse with bounded history, independent Home scheduling and unchanged hero inputs/family-owner boundaries, shared Print version/revision/cover, effective secondary-photo original inspection, preserved quality blocker, wrong owner/pet refusal and ordered-source handling. Existing Complete/legacy tests verify no full draft/order SELECT on Complete and unchanged legacy fallback.

Before/After measurements and their limitations follow below. Targets are goals, not achieved results merely because code or tests passed.

## Measured Before cohort

Three successful visible-main samples per route, same real album, browser session and 380×715 viewport; runtime region hnd1:

- Home reload: 6,450 / 7,104 / 6,149ms; median 6,450ms. Server lifecycle 5,961 / 6,609 / 5,590ms. Physical REST HTTP 28 each, plus 2 read RPC HTTP each; REST adapter attempts 30 each. Repeated today reads were already physically memoized: removing them reduces logical attempts, not necessarily physical HTTP.
- Album list → Complete: 7,047 / 11,213 / 8,307ms; median 8,307ms. Server lifecycle 6,720 / 10,925 / 7,868ms. Physical REST HTTP 19 each, including existing analytics writes.
- Complete → Preview: 6,108 / 5,977 / 4,041ms; median 5,977ms. Server lifecycle 5,687 / 5,564 / 3,630ms. Physical REST HTTP 12 each, including existing analytics writes.
- Preview → Edit list: 4,799 / 3,983 / 3,767ms; median 3,983ms. Server lifecycle 4,201 / 3,561 / 3,338ms. Physical REST HTTP 11 each.
- Edit list → Page Editor: 4,280 / 5,722 / 3,986ms; median 4,280ms. Server lifecycle 3,569 / 5,221 / 3,437ms. Physical REST HTTP 17 each, including existing analytics writes.
- Preview → Print: 11,802 / 11,012 / 7,174ms; median 11,012ms. These reached the Print main UI. Detailed baseline Print traces hit the per-request output cap (252 matching diagnostic entries plus other entries); final loader/quality stages are missing. Baseline physical REST observations 17 / 16 / 17 are **lower bounds**, not complete query totals. No complete Print server duration is claimed from these traces. Prior logical 26 SELECT baseline must not be presented as a physical HTTP count.

Before Home stages across the three samples: pets 250–266ms, recent 253–315ms, today 741–787ms, Best Shot 0–1ms (no today's photo in this fixture), anniversary/history 892–938ms, album SELECT 754–812ms, active versions 271–827ms, previous passive candidate 314–810ms, family RPC 273–761ms. Most of these independent stages previously accumulated serially. Historical reads are parallel within anniversary, not ten serial years.

The updated diagnostic path reports per-request physical SELECT/HEAD, write, RPC and Storage counts separately in one `Server loader requests` summary, and reduces repetitive per-photo output. This avoids mixing analytics writes with SELECT counts and avoids the observed Print output cap. Counts contain no identifiers or paths. A localhost HTTP test verifies method/category separation and request isolation.

## Current Preview / acceptance gate

Final comparison application/diagnostic HEAD: `9b2ffc9f47aed6b65622edc07246f985b5bf515c`, Git Integration deployment READY and SHA matched. It follows loader commit `9baa0de08db3a73b91101d4a195610eaf3b2c9ce`. The immutable Preview was successfully accessed through the user-authenticated Chrome session. Eighteen After normal-route measurements are complete. No overall performance PASS is claimed.

Correction to the measurement instructions: AuthLayout redirects an already authenticated visitor from Login to Home. Asking the user to revisit Login three times without logout could not produce three new sign-in submissions. This was an incorrect agent instruction, not a user failure. In addition, the user operated Chrome while the initial capture was attached to IAB. Some earlier exploratory captures used 418×773; Chrome was 671×744 when initially inspected. Neither is substituted for controlled 380×715 Login pairs. One actual After sign-in is visible in runtime logs: signInWithPassword 496ms, Login Action 510ms. Its browser submit→Home E2E cannot be reconstructed reliably because Chrome capture was attached afterward. **Three genuine Login E2E pairs remain UNMEASURED.** No credentials were read and no logout was performed. No further login is requested in this investigation.

A read-only attempt to reuse the existing branch-alias session encountered `ERR_TOO_MANY_REDIRECTS`. Its runtime trace shows ten Home→Login round trips: Home's authoritative getUser HTTP status 403 while a claims/JWKS request returned 200. Existing AuthLayout redirects valid claims to Home, while App/Home require getUser. Those auth/redirect branches are unchanged by this task. The exact reason for the alias session's 403 and whether it predates this deployment remain unverified; it is an observed access issue, not attributed to loader changes without evidence. No cookies were cleared, auth checks weakened or extra deploy attempted to bypass it. The immutable deployment's fresh Login remains the acceptance path. This issue must be resolved or explicitly classified before final acceptance.

Final local verification on the comparison source: **1197/1197 tests PASS**, TypeScript PASS, lint 0 errors / 12 existing warnings, build PASS, git diff --check PASS. New/updated tests preserve legacy fallback, shared draft version and cover, original/secondary-photo quality inspection, quality blockers, owner/pet denial, hero inputs and bounded history. Read-only runtime persistence comparison is recorded below; no save mutation was performed during this measurement. Genuine No-Crop browser acceptance remains **UNVERIFIED due to fixture absence**.

Task085.4.3 is not marked PASS. Main/Production and Task085.4.4 are untouched. Inherited uncommitted reports/evidence from earlier tasks are preserved separately.

## After normal-route measurements

After used the user's logged-in **Chrome** session at explicitly verified 380×715. Before used **IAB** at 380×715. Chrome did not have the baseline host session when checked. Consequently the strict same-browser Before/After requirement is **not satisfied**. The following are descriptive cohorts, not a controlled causal UI improvement percentage. Both deployments used the same real album and hnd1 runtime region. Every timed sample reached its visible destination main UI and matched one fresh server request after excluding an adjacent prior-request completion; no sample here is claimed as a prefetch/cache-only hit.

Three After UI-ready values / median, milliseconds:

- Home reload: 3,837 / 2,945 / 3,945; median **3,837** (Before 6,450).
- Album list → Complete: 4,351 / 3,922 / 4,082; median **4,082** (Before 8,307).
- Complete → Preview: 5,755 / 4,615 / 8,484; median **5,755** (Before 5,977).
- Preview → Edit list: 4,414 / 4,448 / 3,969; median **4,414** (Before 3,983).
- Edit list → Page Editor: 6,435 / 5,103 / 3,744; median **5,103** (Before 4,280).
- Preview → Print: 8,887 / 6,536 / 7,132; median **7,132** (Before 11,012).

Server lifecycle Before → After medians, milliseconds (browser paint/transport excluded): Home **5,961 → 3,358**; Complete **7,868 → 3,394**; Preview **5,564 → 5,029**; Edit **3,561 → 3,466**; Page Editor **3,569 → 3,827**; Print Before NM due to truncated traces, After **6,655**. These are still different deployment/time cohorts; neither host variance nor cache warmth is eliminated. Page Editor code was unchanged; its mixed latency result is not classified as either a proven regression or proven absence of regression.

### Query counts and physical HTTP

After per-request method-aware totals were complete in all 18 matched requests; no missing summary is treated as zero. GET and HEAD are counted as SELECT HTTP attempts, not actual SQL executions; analytics INSERTs are listed separately. Read RPC HTTP is another category. No EXPLAIN or database-internal execution count is claimed.

- Home: REST adapter SELECT attempts **30 → 28**; physical SELECT HTTP **28 → 28**; read RPC HTTP **2 → 2**; writes 0. Today's duplicate was already fetch-memoized at the network layer. Critical-path scheduling, not a two-request physical reduction, explains the intended benefit.
- Complete: Before 19 physical REST HTTP including the existing one analytics INSERT; After **10 SELECT + 1 analytics INSERT**. With that known existing write separated, SELECT **18 → 10**. The removed full-draft branch and unused order read account for the eight-read reduction.
- Preview: Before 12 physical REST HTTP including one analytics INSERT; After **11 SELECT + 1 analytics INSERT**. SELECT unchanged.
- Edit: **11 SELECT → 11 SELECT**, no write. Independent validation scheduling changes, not query removal.
- Page Editor: Before 17 physical REST HTTP including one analytics INSERT; After **16 SELECT + 1 analytics INSERT**. SELECT unchanged; Page Editor itself was not optimized.
- Print: previous logical baseline **26 SELECT** was documented by prior source/counting work; the current Before physical logs are incomplete and only lower bounds. After is **14 physical SELECT + 1 analytics INSERT** per request. Do not subtract 14 from the old logical 26 and call that a measured physical-network reduction.

After Storage HTTP, first/second/third sample: Home 1/1/1; Complete 2/0/2; Preview 10/0/9; Edit 0/0/0; Page Editor 2/2/0; Print 28/19/19. These include signing and/or original downloads; they are not all image downloads. Cache warmth varies substantially. Print still inspects the 19 effective originals. No image quality policy was changed.

### Serial structure

Source-level phase boundaries, excluding authentication and counting optional/no-op awaits as phases: Home previously had 13 ordered boundaries (pets, recent, today, Best Shot, anniversary, counts, albums, versions, current candidate, previous candidate, annual candidate, family, URLs). The new DAG has at most five logical layers: pets → independent reads → dependent analysis/active versions → current-candidate decision → display URL generation. This is a source-level dependency count, not a claim of five SQL or physical network roundtrips.

Complete replaces serial entitlement/labels/suggestion/order/list/full-draft work with parallel independent branches, followed by ordered photo metadata/URLs and analytics; no full draft assembly remains in Complete. Print GET full readDraft invocations **2 → 1**, and its UI/snapshot share the same cover/version/revision. Image facts, fonts and previous snapshot overlap. Preview/Edit album and pet validation layers **2 → 1**; their dependent draft and cover reads remain. No revision is mixed across two active-version reads in the new Print GET path.

## Remaining bottlenecks and goals

- Home: After pets 279–865ms; anniversary 858–1,542ms; albums+active-version branch 873–1,630ms; display URLs 303–855ms. The independent group overlaps, but bounded history still contributes 20 SELECTs. Median UI **3.84s**, so the ≤3s goal is not yet met.
- Complete: server median **3.39s**, UI **4.08s**; this is materially lower in the observed cohort, with objective SELECT reduction. The low-three-second UI goal is not yet consistently met.
- Preview: draft URL stage **817 / 1,971 / 4,306ms** across samples; the 8,484ms UI sample corresponds to **4,306ms** in draft.preview-urls, with nine Storage HTTP operations. This isolates a major remaining URL-delivery/cache-miss path; it is not attributed to crop math or Auth. The ~3s goal is not met.
- Edit: readDraft **1,734 / 1,790 / 1,890ms**; owner/pet queries can take 812–824ms even when parallel; cover 290–793ms. Median server 3.47s and UI 4.41s. No SELECT reduction was expected; UI improvement is not established.
- Page Editor: no loader change in this task, same SELECT count; mixed 3.74–6.44s UI. Browser/host/cache differences prevent a regression conclusion.
- Print: owned album 534–1,079ms; readDraft **2,227–4,175ms**; cover 275–301ms; original-photo metadata 288–312ms; full image facts **1,147–1,997ms**; fonts **48–1,999ms**; previous snapshot 315–1,433ms. Snapshot build 3–5ms, final quality evaluation 1–2ms, raster/orientation probes round to 0ms individually. Fonts/image facts/previous snapshot overlap and must not be summed. Median UI **7.13s**; the ≤4s goal is not met. Quality inspection is retained.

No speculative fix, image quality reduction, global cache or migration was applied after these results. Task085.4.4 has not started.

## Phase-one correctness / decision

All 18 timed After normal-route navigations reached main content through a fresh logged-in session; no fresh-session auth loop or error page was observed. Print showed 12 spreads / 24 pages, the same 14 sparse-layout warnings, no blocking issue, and a disabled order button because no snapshot exists. PDF generation, checkout and order buttons were not pressed.

Read-only database comparison against the earlier recorded fixture state: album draft, active draft editing, revision **6**, identical spreads/frames content digest, accepted events **1**, orders **0**. No generation/subset/Recovery mutation, draft save or artificial No-Crop fixture was performed. Full browser save/crop/cover/Elements acceptance was not repeated; existing regression tests and prior acceptance apply, with no new browser-write PASS claimed.

An additional Print-back smoke check was excluded: the test expected Edit-list content, but Print's existing back link leads to Page Editor. The 60s automation wait and subsequent browser attachment loss are a test/control limitation, not a measured route-loading time or demonstrated application failure. The final attempt to reset Chrome's temporary viewport could not be confirmed after that attachment loss; no browser cookie/session reset was attempted.

**Overall: HOLD.** Objective Complete SELECT reduction and observed Home/Complete server gains are recorded, but key UI targets remain unmet, strict same-browser comparison and three Login E2E pairs are absent, and the separate branch-alias 403/redirect issue remains unresolved. Genuine No-Crop remains **UNVERIFIED due to fixture absence**, not FAIL or PASS. No main merge, Production deploy, extra acceptance deploy or Task085.4.4 work. No code changes were made during this After-measurement turn; this report update is local and uncommitted.

## Follow-up implementation after HOLD

No generation, Safety, subset, crop/contain, mutation/revision or print quality rule is changed.

Home historical reads now use one bounded ordered batch per timestamp branch over the same ten exact-day ranges. Each branch fetches at most 60 metadata rows in its batch. Complete day buckets retain their first six; a potentially truncated final bucket and older unresolved buckets use the original per-day six-row queries in parallel. Thus a dense recent year cannot starve an older year, and there is no serial ten-year search. Empty history requires **2 SELECTs instead of 20**. Normal dense history uses at most 20 HTTP attempts total; a batch-error fallback is bounded at 22 total. At most two query layers per branch; dense data can transfer more metadata than before (up to 114 rows per branch versus 60 previously), a documented bounded tradeoff. Downstream per-year photos and ordering are unchanged. No RPC/migration or broad unbounded history scan is introduced.

Tests compare complete returned objects against the old independent per-year loader for empty, sparse, dense, timestamp ties, taken/created fallback, secondary pets, outside pets, seeded random histories and partial failures. Today's dataset remains shared; historical and stored-signal stages now have explicit request-correlated names.

The existing AlbumRequestContext now coalesces photo metadata by ID for this authenticated request only, including concurrent/overlapping sets. readDraft uses it for existing photo paths; Print inspection reuses those same records and fetches only missing IDs. The returned client draft schema is unchanged. Action callers without a request context retain their original authoritative read path.

Print loads one active version and starts its cover query alongside readDraft using that pinned version. URL signing is not a dependency of the cover row read. UI and inspection still share the same version/revision/cover; source originals, Storage RLS, fonts, quality checks and snapshot validation remain intact. Source metadata queries removed by reuse do not imply original downloads are skipped.

Follow-up local verification: **1204/1204 tests PASS**, TypeScript PASS, lint 0 errors / 12 existing warnings, build PASS, git diff --check PASS. Controlled runtime timings/query counts are pending the Git Integration Preview; no target is marked achieved from tests alone. Earlier cross-browser UI cohorts remain descriptive only. The already authenticated Chrome phase-one deployment can serve as the follow-up baseline within the same browser/viewport if the connection is available; no credentials/session transfer will be used.
