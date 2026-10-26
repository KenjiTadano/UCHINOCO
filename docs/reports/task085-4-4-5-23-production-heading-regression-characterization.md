# Task085.4.4.5.23 — Production Heading Regression Characterization

## Decision

**HOLD — characterization incomplete; no Production re-trial recommendation.**

The leading explanation in the observed samples is remote auth/DB/signing variance, rather than a large control/admission/cache delay. This is a provisional classification D, not proof that the previous Production regression was measurement noise. The required 30 valid OFF/ON matched pairs were **not achieved**. The cache-executed subset itself has a heading p75 regression above 10%, so neither the heading gate nor maintained tail benefit can be declared PASS.

Production remained `b23a8fceaf202753ffe78f0ab874850f8711259c`, READY, sin1, with reuse OFF. There was no Production deployment, ON request, Runtime Cache write, cohort addition, migration, save, or image-policy change.

## Source and diagnostic scope

- Behavioral baseline: `b23a8fceaf202753ffe78f0ab874850f8711259c`.
- Exact Preview diagnostic SHA: `63c299269ce13708bcb0941882ad53c08c8953fd`.
- Same diagnostic source/build commit, formal deployment, authenticated browser session, approved album/source set, sin1 runtime, and Edit document route for all samples.
- Fixed observed viewport: **430 × 807**. This was not the historical 380 × 715 viewport; historical absolute browser numbers are not a matched comparison.
- Diagnostic changes only: request-local anonymous trace, allowlisted timing spans, SDK-fetch response-resolution observer, and a Preview-only DOM timing observer. The authorization, admission, cache algorithm/deadlines, signing, renderer, and source/loading policy were not optimized.
- Server instrumentation requires both Preview environment and an explicit server flag. The client observer requires a build flag, installed only on the dedicated Preview branch. No diagnostic source is proposed for Production release.

The anonymous trace is shared by App Layout, Pet Layout, Edit loader and helpers through request-scoped React cache/AsyncLocalStorage. It contains no user context. Live parent/page trace correlation was verified. Events are buffered outside optional cache operations. The fetch observer returns the original Response without consuming or cloning it.

The client records native navigation/heading/structure/load/visible-image times to a hidden numeric DOM output. It does not inspect cookies, tokens, URL strings or image identities, issue requests, call decode, change loading priority, or block readiness. Heading is an observed DOM-ready marker after animation frames, **not a paint measurement**. Load can precede that observation. No hydration errors were observed.

## Protocol and why the cohort is incomplete

Measurement date: 2026-10-26. One fixed, contiguous two-epoch Preview trial was used; its duration was not extended.

1. One opaque create-only proposal was published and verified: proposal-created, one proposal, two bindings, matching build/environment/region/epochs.
2. Operator seal succeeded; manifest was published OFF.
3. Balanced order: odd pairs OFF → ON; even pairs ON → OFF. Adjacent equal-arm samples reused the control setting, not the browser response. Every sample was an intentional document reload.
4. Both samples were obtained for pairs 1–22. One additional OFF observation for pair 23 is excluded from all matched statistics.
5. At the next ON attempt, the fixed manifest had expired. The operator refused the operation. It was not bypassed, re-enrolled, extended or replaced with another trial.

There are **22 control-state matched pairs**, not 30. More importantly, control ON does not establish cache execution:

- Pairs 1–6: ON executed cache, seed 1 / reuse 5.
- Pairs 7–22: ON returned **admission-denied** and the fresh authorized map; no cache get/set occurred.
- OFF: disabled 22 / cache get/set 0.

All 44 matched browser traces correlate to server events. The first denial occurred before the epoch transition, so the transition alone does not explain its onset. The allowlisted diagnostic identifies the finite admission predicate as false but does not distinguish session binding from source-set/binding mismatch. Credential refresh, source-set change, or another binding input change is **unconfirmed**. No token/session extraction was performed. A stable browser login is not evidence of a stable credential-derived binding.

The denied samples cannot be counted as reuse-performance evidence. They provide an observational admission/fallback cohort, not a deliberately configured admission-only arm. No separate control-only arm was added: OFF already performs the remote control and sealed-manifest checks. Thus the original request for 30 valid reuse matched pairs remains unmet.

## Browser distributions

All times below are milliseconds. p50 is the median; p75 is nearest-rank. Statistics do not establish significance at these sample sizes.

For all 22 control-state pairs, OFF / ON:

- Heading p50: **1182.5 / 1124.5**; p75 **1477 / 1311**; max **1835 / 1884**.
- Document load p50: **1185.5 / 1131**; p75 **1590 / 1322**; max **3035 / 3691**.
- Visible image completion p50: **1183 / 1151.5**; p75 **1588 / 1335**; max **2950 / 3647**.
- Heading → visible completion p50: **0.5 / 17.5**; p75 **20 / 24**; max **1666 / 2029**.
- Heading → visible gap >1s: **1 / 1**; >3s: **0 / 0**; >5s: **0 / 0**.
- Absolute navigation → visible completion >3s: **0 / 1**; >5s: **0 / 0**. Absolute >1s is 17 / 20 and mostly includes server delivery, not an image-only tail.
- ON heading faster in **10/22 pairs**. Paired ON-minus-OFF heading delta: median **+54.5**, p75 **+277**, max **+519**.
- Every sampled ready state had **12 body cards, 0 pending visible images, 0 broken visible images**. No browser console error was observed.

The pooled heading p75 is 11.2% lower on ON, but **16/22 ON requests did not execute reuse**. It is not a valid PASS for the cache feature.

### Actual cache-executed subset: six pairs

OFF / ON:

- Heading p50 **1227.5 / 1163.5**; p75 **1284 / 1518**, **+18.2%**; max **1477 / 1618**.
- Visible completion p75 **1508 / 2351**; max **2950 / 3647**.
- ON has one >1s post-heading gap; OFF has one. Tail reduction is not demonstrated.
- Two ON requests had Storage activity; no matched OFF request did. These are not all URL-warm matched samples.
- Restricting to the four cache-executed pairs with Storage HTTP observer count 0 on both sides gives heading p75 **1245 / 1124**. Four pairs are insufficient for acceptance, and post-hoc selection is not a substitute for the planned cohort.

### Admission-denied subset: sixteen pairs

OFF / ON heading p50 **1146.5 / 1124.5**; p75 **1565 / 1262**; max **1835 / 1884**. These requests validate fail-closed behavior and bound admission processing; they do not validate Runtime Cache latency or source reuse benefit.

## Server stages and correlation

Each span uses monotonic wall time. Nested/parallel stages are **not added** to obtain a critical path. App/Pet/Page auth spans substantially overlap. `draft.elements` encloses parallel element-group reads. Photo/signing figures below sum separate invocations only as descriptive per-request work, not as an additive critical-path model.

For all 22 OFF / ON control-state pairs, p75 (max):

- Route total: **861.5 (1385.1) / 924.5 (1351.9)**.
- Page auth: **105.9 (355.4) / 112.2 (340.4)**.
- Album authorization read: **89.0 (273.7) / 80.2 (217.6)**.
- Canonical pet read: **78.6 (354.4) / 58.3 (107.4)**.
- Pet-layout ownership read: **93.0 (200.4) / 76.9 (256.9)**.
- Draft total: **443.3 (878.1) / 466.6 (940.4)**.
- Version: **65.4 (106.4) / 67.7 (617.6)**.
- Spreads: **65.9 (98.8) / 71.4 (626.4)**.
- Parallel element-group envelope: **145.3 (701.6) / 196.5 (417.4)**.
- Photo-read work: **134.5 (671.4) / 118.4 (154.8)**.
- Signing work: **2.1 (2.8) / 2.0 (220.8)**.
- Cover read: **70.9 (295.1) / 59.3 (97.1)**.
- Cover URL resolution: **69.0 (275.1) / 54.9 (78.5)**.
- Remote control: **16 (19) / 18 (31)**.
- Handoff adapter: **16.8 (19.9) / 20.5 (32.4)**.
- Intent parse: **0.336 (0.409) / 0.334 (1.783)**.
- Seal verification: **0.733 (1.227) / 0.709 (1.566)**.
- Configured admission parse: **0.059 (0.169) / 0.060 (0.179)**.

Normal trial requests had no separate `album_pets` query. The existing canonical route/album validation remains; membership was exercised during the separately authorized handoff. A zero membership-call count means not called in that loader path, not a newly removed check.

For the **six cache-executed ON samples only**:

- Remote control p50/p75/max: **15.5 / 17 / 18**.
- Optional processing: **19 / 20 / 30**.
- Session read: **0.414 / 0.475 / 0.513**.
- Exact finite admission predicate: **0.076 / 0.083 / 0.088**.
- Cache get: **11.128 / 12.107 / 12.109**.
- Cache set: called once, **10.656**.
- No timeout, cache-error, cache-unavailable, or invalid-entry outcome was recorded. This does not replace failure-injection coverage.

Correlation is descriptive, not causal: paired heading delta versus route-duration delta has Pearson r **0.905** across 22 pairs; versus optional-duration delta **0.126**. The latter mixes denied and executed samples and cannot establish absence of cache cost.

Concrete examples:

- Pair 5 ON: heading **1518**, route **1010**, auth **238.5**, signing **145.5**, optional cache **18**. Its OFF heading was **1044**, auth **101.2**, signing **2.1**, optional **0**. The large difference is not accounted for by the 18ms cache span alone.
- Pair 16 OFF: heading **1835**, element-group envelope **701.6**, optional **0**.
- Pair 17 ON, admission-denied: heading **1601**, spreads **626.4**, optional **1**.
- Pair 22 ON, admission-denied: heading **1657**, version **617.6**, optional **1**.

Browser heading minus the request trace's final layout/route endpoint has p75 **516.9 / 505.1**. This subtraction crosses clock origins and excludes work before trace creation; it is only an uninstrumented elapsed-gap estimate. It cannot be labeled hydration, Proxy, transport, or serialization time.

### HTTP observability limitation

The observer sees SDK fetch invocations until fetch resolves. Each formal request has five Auth fetch-observer invocations, not five proven physical wire requests. SDK/Next internal dedup can occur below the observer. DB and Storage counts likewise are observer counts, not packet captures or SQL execution counts. No physical Auth-count regression claim is made.

Storage observer count: OFF **0/22 active**; ON **2/22 active**, two calls in each active request. Both active requests are in the six cache-executed samples. Signing duration and image-transfer duration are distinct. Provider CDN HIT/MISS and image-response timing are not established by this task.

## Warmth, correctness and security

- Setup/arming document loads were excluded from the cohort. They were cold-like candidates only, not proven fresh instances.
- No artificial cache purge, session/token manipulation, source replacement, save, or fixture mutation occurred.
- Six real cache outcomes are separately classified from sixteen admission-denied fresh fallbacks.
- The first admission denial preceded the epoch boundary. The second epoch contains no successful cache reuse; epoch-transition performance is **UNVERIFIED**.
- Natural credential refresh is **UNVERIFIED**. It is a possible binding-change explanation, not an observed fact.
- Frame/crop/contain/source-delivery logic is unchanged; no broken image or blank-card regression was observed. Genuine No-Crop browser coverage remains **UNVERIFIED due to fixture absence**.
- Fresh auth, owner/RLS, canonical pet, membership/source authorization, expiry margin, AES-GCM, finite admission, runtime OFF and fresh fallback were retained. No Service Role was introduced.
- The UI control marker records only control state. Future measurement must require a correlated seed/reuse result before labeling a sample cache-ON.
- Diagnostic output is allowlisted anonymous stage enums, random request traces, numeric durations/counts and outcome enums. It contains no raw errors, private IDs, URL/path/query, cookie, credential, source map or token. Private operator evidence is ignored/local-only and is not committed.

## Verification and cleanup

At exact diagnostic SHA, using Node 24:

- `node --test tests/*.test.mjs`: **1267/1267 PASS**.
- `npx tsc --noEmit`: **PASS**.
- `npm run lint`: **0 errors / 12 existing warnings**.
- `npm run build`: **PASS on unchanged retry**. Initial run stopped at the existing Next security advisory gate; it was not suppressed or upgraded as part of this investigation.
- `git diff --check`: **PASS**.

Diagnostic tests cover Preview-only activation, concurrent trace isolation, buffering, private-error discard, source-loading-policy invariance and exact Response preservation. Existing authorization/cache/persistence tests remain intact.

After expiry, Preview control was explicitly OFF. A fresh request rendered 12 body cards with no broken/pending visible images. Cleanup completed:

- Comparison alias restored to its original target.
- Ten branch-scoped Preview configuration records removed.
- Three disposable diagnostic Preview deployments removed.
- Dedicated opaque object/private store, undeployed credential project and runtime control removed.
- Production deployment and environment metadata match both the task-start snapshot and cleanup before/after snapshots. Production stayed READY / sin1 / same SHA, reuse OFF.
- No existing user evidence, branch or original work files were deleted.

## Recommendation

**Continue HOLD.** The data supports remote I/O variance as a substantial contributor, and does not show a large control/admission or optional-cache latency problem in the observed requests. It does not establish that the Production +20.4% result was variance, nor that reuse passes the heading/tail gates.

Before any future release review, a separately bounded non-Production follow-up needs to identify the admission-denied input category using privacy-safe booleans/enums, distinguish stable browser session from stable admission binding, and obtain at least 30 genuinely cache-executed matched pairs with comparable Storage activity. The fixed-window measurement schedule also needs to fit before expiry; this run's manual management/observation overhead exhausted it. Do not weaken finite admission or extend this manifest to fill missing samples.

No cache removal/redesign, loader/React rewrite, image policy, RPC, DB change or Production re-trial is justified by this incomplete cohort. This task stops at the characterization report.
