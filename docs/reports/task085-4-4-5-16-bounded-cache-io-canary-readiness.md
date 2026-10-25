# Task085.4.4.5.16 — Bounded Cache I/O & Canary Capacity Readiness

## Decision

**B — Shared latency budget PASS; Production canary HOLD because the current candidate does not enforce a hard capacity/admission bound.**

The optional session/cache processing path now has one 150ms monotonic deadline. Slow operations no longer receive independent one-second allowances. Fault tests retained the fresh authorized map and measured a maximum of about153ms; the real Preview cohort measured p75 14ms, max26ms. Visible-fetch tails remained lower with reuse. However, a 1% allocation alone cannot bound key count, and the proposed finite admission manifest is not implemented in the activation path. A concrete conservative cap is designed below rather than treating unknown capacity as sufficient headroom.

Heading p75 also worsened by16.6% in this small cohort. It is reported without attributing the full change to cache work or adding a speculative route fix. No Production activation, cache storage, deployment, RPC or client optimization occurred.

## Source and scope

Reference reuse candidate: `ac3e5e742da20bb6b2858448ba4443a7719b710f`. Readiness-control reference: `88036a843315df53d2b96f3ea5c082d6bb9a2d69`. Shared-budget application commit: `5b13ff09d6b6c4026207db761d885d4436ff33b9`.

Changed only the optional lease/adapter budget, reason enums and tests. The existing Preview-only runtime control remained default OFF and Production-impossible. No fresh authorization, owner/RLS, canonical pet, membership, source identity, AES-GCM, URL TTL, renderer, crop/contain, revision/clientSeq or mutation pipeline was removed or weakened. The existing 100-item and64KiB plaintext limits remain bypass conditions. No package dependency was added.

The first edit attempt was not executed because automatic approval review hit its usage limit. After the user resumed, approval succeeded and the changes below were actually implemented and verified.

## Shared deadline

`optional-cache-budget.ts` creates one deadline using `performance.now()`, with a150ms allowance. The adapter creates it before optional `getSession()` and passes the same object into the lease helper. Parsing, key derivation/encryption/validation and get/set consume the same remaining time; there is no reset between operations.

Get has priority. On a miss, if less than50ms remains, return the existing fresh authorized map with `seed-skipped-budget` and do not start set. Check again after encryption. A successful get that used about115ms skipped the write. A late/hung get prevents set entirely. Deadline exhaustion during reused-entry validation also falls back.

Runtime-control lookup has a **separate200ms fail-OFF budget**, common to both comparison arms. It is not part of the claimed150ms lease budget. Nominal worst optional control+lease wait is therefore up to350ms plus local work/scheduling, not150ms for the whole route. Fresh auth, DB, original signing and image transfer remain outside this optional lease budget.

### Outcome taxonomy

Allowlisted aggregate reasons: `reuse`, `seed`, `seed-skipped-budget`, `get-timeout`, `set-timeout`, `cache-error`, `cache-unavailable`, `invalid-entry`, `disabled`; an optional session stall is separately `session-timeout`. SDK/API unavailability is distinct from a store operation rejecting. Provider errors without a reliable typed availability code are classified as `cache-error`, not guessed from error text. No error payload, ID, URL, token, object path or cache-key digest is logged.

### Abort behavior

The budget invokes operations with an AbortSignal and aborts on deadline. A cooperative test store actually stopped its pending operation. The installed official Runtime Cache get/set interface has **no AbortSignal option**; its adapter cannot cancel the real underlying SDK operation. `getSession()` similarly has no signal in this call. This is an explicit SDK limitation, not claimed physical cancellation. [Official Runtime Cache API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)

No private SDK transport or global fetch override was introduced. Timed-out non-abortable work can finish later; attached promise handlers avoid unhandled rejection, the returned fresh map cannot be changed by that completion, and every later cache read still checks binding, expiry and lease age. A late set can leave a cache entry but cannot extend application reuse beyond its original validity. Event-loop stalls cannot be preempted by a JavaScript timer; this is a bounded async wait with measured scheduling tolerance, not a real-time CPU guarantee.

## Failure latency verification

Synthetic, non-Production tests; n=5 per main case, real monotonic wall timing. Max assertion allows150ms+100ms scheduling tolerance for loaded CI, while the isolated measured max was152.59ms. Values are optional processing only, not route latency.

| Case | p75 ms | max ms | Outcome / behavior |
| --- | --- | --- | --- |
| Slow get | 151.29 | 152.59 | get-timeout; no set |
| Hung get | 150.98 | 151.32 | get-timeout |
| Get rejection | 0.26 | 0.88 | cache-error |
| Slow successful get, ~115ms | 117.19 | 117.40 | seed-skipped-budget; set never starts |
| Miss + slow set | 151.48 | 151.83 | set-timeout, shared remainder |
| Hung set | 150.25 | 150.97 | set-timeout |
| Set rejection | 0.30 | 1.19 | cache-error |
| Provider-like unavailable rejection | 0.10 | 0.16 | cache-error; no inferred provider code |
| Corrupted entry | 0.11 | 0.27 | invalid-entry |
| Normal seed | 0.14 | 0.61 | seed, original fresh map returned |
| Actual adapter SDK unavailable (n=1) | 0.18 | 0.18 | cache-unavailable |
| Actual adapter session hang (n=1) | 149.90 | 149.90 | session-timeout |

The table is from the isolated five-repeat fault cohort. Actual adapter SDK-unavailable and session-timeout cases additionally passed with fresh fallback and the shared max bound; the SDK case is an unavailable API, not removal of an installed package. Pathological timeout p75 is intentionally near150ms, not≤50ms. The≤50ms typical-p75 target was met by the real normal-use cohort below; it is not claimed for injected hangs.

All failure cases return the identical fresh map; no blank, wrong-source, unauthorized or near-expiry replacement. Existing isolation tests cover owner/session/bucket/path/variant and corrupt/expired binding. Expiry validation now accounts for elapsed processing time to retain the30-second freshness margin. Shared budget includes prior session work; a test spent110ms there and proved no new set allowance was granted.

Concurrent cold seeds, window changes, synthetic credential refresh, eviction/capacity rejection and late set completion tests passed. Concurrent valid seeds may still overwrite each other and reduce stability; no atomic single-writer guarantee was added. Write skip does not prevent the next request using its normal fresh path.

## Preview comparison protocol

40 formal Edit document loads: 20 OFF/Baseline +20 ON/Candidate matched pairs, same build/host/authenticated session/real24P fixture/380×715. Balanced B→C then C→B pairs were implemented as B,C,C,B,B,C,C,B… . No artificial cache clear, logout, save, replacement or fixture mutation.

This is a **same-build fresh-path control**, not an exact old-budget-vs-new-budget A/B deployment comparison. OFF retains the pre-reuse authorized source path. The runtime-control fetch is common to both arms; the old query label is attribution only and cannot enable reuse when control is OFF. Differences in controller and source-map behavior from earlier tasks are disclosed; historical numbers are not substituted for this experiment. All first-load/cold-like observations were retained. Source observers were separate per arm, URLs compared only in memory; evidence contains anonymous ordinals/numeric fields.

All40 requests matched their expected control state in runtime logs. OFF: zero lease invocations. ON: 18 reuse,2 seed; no timeout, skip, cache error or invalid-entry event. Optional adapter duration p50/p75/max: **13/14/26ms**. SDK memory-fallback warnings: zero. Normal-p75 and shared-max gates PASS. No physical HTTP reduction or actual cross-instance transition is inferred from these logs.

| Edit metric, ms | OFF p50 / p75 / max | ON p50 / p75 / max |
| --- | --- | --- |
| Heading observed | 1040.6 / 1180.9 / 3102.4 | 1118.9 / 1377.5 / 1956.5 |
| Document load | 1076.8 / 1485.6 / 5464.0 | 1148.0 / 1393.3 / 1973.6 |
| Slowest viewport resource duration | 32.4 / 39.3 / 2373.5 | 28.1 / 33.3 / 68.0 |
| Heading→visible responseEnd gap | 8.2 / 18.9 / 2346.0 | 3.4 / 14.0 / 43.2 |
| Heading→visible load gap | 19.2 / 33.8 / 2349.1 | 17.0 / 27.1 / 43.8 |

Visible fetch >1s and visible image-load gap >1s: **4/20→0/20**. Both arms zero viewport-fetch >3s/>5s. ON exact reuse occurred in18/19 post-first documents, one source change at a new window. OFF exact reuse10/19; changed9/19. The budget did not erase the observed reuse benefit, but these small cohorts do not prove a Production effect or CDN cache HIT.

Heading p75 was **+16.65%**, not a no-regression PASS. Candidate pre-draft Auth p75 was159ms versus92ms; body metadata449ms versus360ms; combined draft-cover-signing702ms versus541ms. Cache itself maxed at26ms. These observed differences do not identify a causal regression or justify speculative server changes. Parallel stage timings are not added together. Cache signing and image delivery remain distinct.

All40 loads had12 body cards, zero broken images, zero console errors, no horizontal overflow, no ambiguous image mapping. No renderer/source-quality change. Natural Auth refresh remains **UNVERIFIED**: no forced refresh/token manipulation and no credential was read from the browser. Synthetic transition tests remain PASS. Genuine No-Crop browser acceptance remains **UNVERIFIED due to fixture absence**.

## Runtime kill switch

The unchanged readiness control was exercised repeatedly throughout this same deployment. OFF new requests logged control=false and zero cache-path calls, even with the old candidate query label. ON enabled only Edit; last transition was ON→OFF, and final Baseline20 again had no cache path. Production remains hard-disabled; Page Editor/Preview are not enabled by this control.

This verifies new server requests after observed control propagation, not instantaneous global consistency or retroactive rewriting of open documents. No redeploy occurred between toggles. Previously issued browser URLs retain their original expiry. The separate control200ms fail-OFF budget is disclosed above. Test config and read credential were branch-scoped Preview only, never Production/Service Role.

## Capacity observability findings

The documented formal surface is Vercel Dashboard → Observability → Runtime Cache, including cache size and eviction activity. Hobby storage is team-shared and subject to early LRU eviction; Preview and Production cache environments are separated. A quota read must be scoped to the correct team, environment and region before calling bytes “available.” [Runtime Cache storage and eviction](https://vercel.com/docs/caching/runtime-cache)

The CLI public API inventory exposed343 routes/468 endpoints; no Runtime Cache occupancy/eviction/remaining-quota endpoint was found in that inventory. An artifacts-cache usage endpoint is a different service and was not used as a proxy. This does not prove no private/provider API exists. No Production secret/value or signed source was acquired to probe it. Live Production quota/headroom was not obtained through an authenticated Dashboard in this task.

Operational verification method: record timestamped numeric quota, occupancy and eviction from the official Dashboard for the applicable team/region/environment; establish other projects' normal/high-water usage and keep a reserve; repeat before and during a canary. If that surface cannot provide a reliable free-byte figure, do not infer headroom from a hit rate, TTL, free plan or successful seed.

## Conservative cap design (not deployed)

Percentage allocation alone is insufficient. Even two enrolled owners can create arbitrarily many source-set/session/build bindings within five minutes by navigation/editing/credential changes. Runtime Cache get/set has no documented atomic compare-and-set/admission counter; a get+increment+set counter is not a hard maximum under concurrent requests. Do not introduce an unsafe approximate counter or a path-only/unscoped slot cache.

Proposed finite trial:

- Edit only, default OFF; allocation at most1% **and** explicit closed enrollment of at most2 authenticated sessions, one approved album/source set each.
- An immutable activation manifest contains at most **4 exact opaque HMAC bindings**: each session's same object/variant set for current and next five-minute window. Keep owner/session/bucket/path/variant in the existing binding; never replace it with an unscoped shared slot key.
- Manifest valid only through the end of the next window (≤10minutes), one application build and one approved runtime region. No new source set, album, refreshed credential or changed window is admitted unless it is already one of those four exact bindings. Such requests retain the fresh authorized path.
- No replacement/addition/rolling extension to the activation manifest. OFF is allowed anytime. After trial ends, wait the full remaining lease horizon before a separately authorized new manifest. Count prior still-live keys before re-enrollment; do not call a newly named trial a clean capacity slate.
- A trusted admission step must create and freeze the finite manifest after fresh auth/owner checks, without logging IDs/URLs/tokens/binding hashes. Production storage/manifest handling needs explicit approval. Do not use client-supplied bindings as authorization.

Logical ciphertext bound:4×approximately85.4KiB = **~342KiB**, plus key/provider serialization metadata. Assign at most1MiB planning allowance for this single trial; it is not a measured provider-overhead guarantee or a cache quota. The observed19-object24P map from the preceding task was~22.3KB ciphertext; 48/72P may be larger but cannot exceed the unchanged per-map cap when admitted. Oversize albums always bypass and remain correct. Multi-Pet does not loosen admission or source isolation.

Reserve policy: never allocate “all remaining bytes.” Before live enrollment, reserve at least90% of verified free space for other projects and uncertainty; the trial allowance must be the smaller of1MiB and10% of verified free space. If available space cannot be verified, only the finite-key logical bound can be claimed, not that the team reserve is satisfied. Do not silently enable an open percentage cohort in that situation.

**Current enforcement gap:** this candidate implements the shared deadline but not immutable-manifest admission. Its percentage control is not a hard capacity bound. The proposal is feasible without an online atomic counter only if the finite manifest cannot rotate/add bindings during the trial. A later implementation and concurrency/admission tests are required before marking capacity bounded in a deployable canary. This is a concrete cap design and work item, not a fabricated capacity PASS. Hence Decision B.

Capacity rejection/eviction remains a fresh authorized fallback and preserves image identity/auth/correctness; repeated misses can still consume optional budget. Short TTL is not a retention/forensic-erasure guarantee.

## Verification, privacy and cleanup

Final tests **1234/1234 PASS**. TypeScript PASS; lint zero errors/12 existing warnings; build PASS on unchanged ordinary retry; diff check PASS. Initial build again stopped at the installed dependency advisory check; no dependency upgrade or suppression was mixed into this task. Two final adapter fault tests were added after the Preview application commit; application code/build remained identical. Updated older tests assert the new reason names and shared deadline instead of the obsolete two-second expectation.

Client bundle string scan found zero control-token variable, lease-log label, cipher string or deadline-error string. No raw runtime logs/URLs/token values were written to canonical evidence. Protected remote-JS exhaustive scan was not performed and is not labeled PASS. Numeric evidence and local helpers remain ignored under `outputs/task085-4-4-5-16/`.

Comparison alias restored to original candidate. The new dedicated non-personal Global Config and exact-branch Preview control variables were removed after OFF and metadata verification. Existing user files/reports and local evidence were retained. No Production deployment, region/env/secret/cache configuration, DB/Storage mutation, cache purge, branch deletion, checkout/order/PDF or main push/merge.

## Final recommendation

Shared max-wait budget: PASS. Normal optional-I/O p75: PASS. Fault fallback/security tests: PASS. Reuse benefit regression check: retained in this cohort. Runtime OFF behavior: PASS. Heading p75: worsened and unresolved. Natural refresh: UNVERIFIED. Production capacity: finite cap designed, **not enforced by current candidate**.

**B — HOLD.** Do not launch an unrestricted or percentage-only Production canary. A future readiness step must implement/test finite admission, verify reserve/headroom or agree an isolated provider allocation, and resolve/characterize the observed heading distribution. Production encrypted payload storage still requires explicit approval. Stop here; no automatic Production canary, RPC, Task085.5 or UI redesign.
