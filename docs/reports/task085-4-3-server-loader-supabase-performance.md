# Task085.4.3 — Global Server Loader / Supabase Performance

Status: implementation and local verification in progress; Preview Before/After acceptance pending. No Production deployment or Task085.4.4 work.

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

Before/After route timings, physical HTTP counts, serial depth and security/persistence results will be appended after runtime acceptance. Targets are goals, not achieved results until measured.
