# Task085.4.4 — RSC / Progressive Navigation Performance

## Status

Acceptance in progress. No Production deployment or main integration. Task085.5 is out of scope.

## Changes

Authorization precedes all private content. Public loading boundaries contain no private identity. Preview delivers the authorized cover, then first body spread, nearby rail, remaining rail. All phases use the existing renderer, source policy, request context and active version. Fresh version/cover revision checks reject concurrent changes with an explicit reload error.

The edit list delivers active-draft metadata and cover before body URL completion, with explicit thumbnail placeholders. Page Editor defers candidates and suggestions without changing editor state or save queues. Complete provides a verified hero before supplementary data. Print shows a disabled shell while the unchanged inspection runs; quality, source identity, snapshot and order eligibility checks remain mandatory.

Home hero inputs remain unchanged because they determine priority/Best Shot. Loading boundaries enable default Next Link partial prefetch; no forced global prefetch and no history.back substitution.

## Measurement protocol

Same authenticated browser, fixed Preview host, 380×715, existing real 24P fixture. Three valid samples per route. Milliseconds measure browser action to observed DOM marker; fully-ready means data delivery completed, not image decode completion. Shell and primary are reported separately. Original runtime evidence remains local-only in ignored outputs. No real identifiers, hosts, signed URLs or credentials belong in this report.

Before medians: Home 3332; Complete 2885; Preview 5815; edit list 5243; Page Editor 7422; Print 7538 ms. One Complete sample was excluded because source-route readiness was not confirmed. Loading text observed only at primary completion is not counted as an earlier shell.

## Verification

- All 1218 tests PASS.
- TypeScript PASS.
- Lint: 0 errors, 12 existing warnings.
- Production build PASS.
- Diff check PASS.

## Known limitations / pending acceptance

After measurements, server lifecycle, HTTP counts, payload and prefetch/cache evidence are pending. Progressive deliveries currently serialize full view snapshots in three phases, so payload reduction is not claimed. Extra revision checks intentionally trade DB reads for consistency. Browser resource metrics are cumulative and require deltas; unavailable baseline payload bytes must remain unmeasured.

Genuine No-Crop/imageFit=contain browser acceptance remains UNVERIFIED due to fixture absence. Existing regression tests cover contain rendering semantics; no artificial DB/layout fixture is created.
