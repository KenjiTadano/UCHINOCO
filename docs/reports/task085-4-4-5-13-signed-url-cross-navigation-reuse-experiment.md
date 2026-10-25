# Task085.4.4.5.13 — Signed URL Cross-Navigation Reuse Experiment

## Decision

**Case A: bounded Preview experiment PASS; signed-source reuse optimization candidate. No Production release authorization or execution.**

The experiment increased exact-source reuse and reduced the observed visible-image tail. Evidence is encouraging but limited: only two baseline fetch tails occurred, one on the first formal document. This does not establish a population-level causal effect or justify immediate Production adoption. No RPC, client rewrite, image-loading experiment or follow-on task was started.

## Authorization and fixed source

The user explicitly approved encrypted existing signed URL maps in Vercel Preview Runtime Cache for at most five minutes. The earlier automatic approval rejection was resolved by this destination-specific approval; it is not an outstanding blocker.

Application baseline: `9eef1ff7844f9a1b2705766e3f57863b0a183a52`. Experiment build: `ac3e5e742da20bb6b2858448ba4443a7719b710f`. Both arms used the same experiment deployment, differing only in the Preview-only opt-in query. Baseline executes the unchanged authorized URL path. No Task5.11 lazy/low-priority/preload changes were included. Runtime configured region was sin1. No Service Role was present in this deployment.

## Design and security model

Existing signing TTL remains 3600 seconds and existing process-local reuse remains approximately 50 minutes. The experiment runs *after* fresh authentication, owner/route-pet/membership checks, RLS photo metadata reads and the existing authorized signing helper. It substitutes only an already valid signed source of the same authorized object and delivery variant. It deliberately does not skip fresh authorization or reduce SDK signing work, to isolate source stability from loader changes.

The official server-only Runtime Cache API stores AES-256-GCM ciphertext. A session-derived server key and HMAC binding isolate verified user, current authenticated session, project/build namespace, authorized object set, bucket, path, endpoint/source type, transform variant and five-minute time window. No access token, Service Role, plaintext URL map, path, identity or credential is written to cache keys or diagnostics. SDK key hashing is overridden to retain the opaque 256-bit HMAC; cache display names are blank. Other sessions/users cannot use the same binding/key.

Every read independently checks binding, source identity/variant, size, age, current session expiry, signed-source expiry and at least 30 seconds of freshness margin. Lease duration is at most five minutes and can be shorter at a time-window boundary. Cache TTL is not a forensic erasure guarantee. Invalid/corrupt/expired/near-expiry entries or cache errors fall back to the original fresh authorized map. Cache calls have bounded waits. The gate is exact experiment branch + Preview + explicit candidate mode; Production is disabled.

No layout, crop, frame, revision or photo-ID state is cached. Current photo IDs receive URLs only after exact authorized object/variant matching. No global unscoped cache, public bucket, manual token minting, new secret, Service Role, URL-expiry extension or cache purge was introduced. Hobby capacity is team-shared; ciphertext and session-specific bindings were required for this approved destination.

## Protocol

Measured 80 formal document loads in one authenticated browser/session, one host, the same real 24P fixture and 380×715 viewport:

- Edit: 30 Baseline + 30 Candidate, 30 matched pairs. Odd pairs Baseline→Candidate, even pairs Candidate→Baseline.
- Page Editor: 10 Candidate supplementary documents interspersed during the first ten pairs.
- Preview: 10 Candidate supplementary documents during the next ten pairs; native Body selection was exercised.

No artificial cache clear, forced image reload, extra image object, save or data mutation. Two later Edit documents checked completed application-image identity/geometry; they are excluded from performance statistics. Additional route authorization smoke is also excluded.

Separate in-memory source observers were used per cohort; comparison is to that cohort's preceding navigation chain (including its supplementary routes). Raw URLs were compared only in transient memory, never saved or printed. Candidate supplementary routes are smoke/distribution checks, not matched auxiliary baseline comparisons. The same browser cache is shared between arms, so cross-arm warming and temporal variance remain limitations. The first formal document is retained. Fresh-instance/CDN-cold status was not proven.

Native resource/load observations came from the existing privacy-safe diagnostic output. No decode() call was made. Numeric resource timings, anonymous ordinals, groups and viewport state only were saved locally. Reported quantiles use nearest-rank p50/p75, not interpolation. Heading is an observer timestamp, not a paint timestamp; native load may precede heading observation. Gap metrics clamp completed-before-heading values to zero and do not imply missing work.

## Edit results (milliseconds)

| Metric | Baseline p50 / p75 / max | Candidate p50 / p75 / max |
| --- | --- | --- |
| Heading observed | 901.5 / 985.6 / 2302.0 | 893.7 / 1003.5 / 1143.5 |
| Document load | 835.9 / 931.3 / 4061.2 | 785.4 / 893.9 / 2540.5 |
| Slowest viewport resource duration | 24.0 / 28.9 / 1872.6 | 22.1 / 31.8 / 781.1 |
| Heading→viewport responseEnd gap | 0 / 5.3 / 1750.9 | 0 / 6.8 / 764.4 |
| Heading→viewport image load gap | 14.8 / 26.5 / 1759.6 | 11.1 / 16.1 / 769.1 |

Across 29 post-first Edit documents per arm, each containing 19 distinct authorized objects:

- Baseline: 209/551 exact reused objects (37.9%); 342/551 changed-source objects (62.1%). At document level, 11 exact-reuse and 18 changed-source documents.
- Candidate: 551/551 exact reused objects (100%); zero changed-source objects. 29 exact-reuse documents.
- Visible fetch duration >1s: 2/30→0/30. >3s and >5s: zero in both arms.
- Heading→viewport image-load gap >1s: 2/30→0/30. >3s and >5s: zero in both arms.
- Candidate slowest visible fetch improved in 15/30 pairs, not a majority. Typical durations were already very small. Fetch p75 was 2.9ms higher; heading p75 was 17.9ms (1.8%) higher. No material heading regression is demonstrated, but improvement is chiefly in observed tails, not broad median gains.
- Excluding the first formal pair, >1s fetch remained 1/29→0/29. Thus the result is not solely the first document, but statistical certainty remains low.

### Tail samples

Baseline Edit sample 1: slowest visible original resource 1872.6ms, heading→visible load gap 1736.0ms, load after responseEnd 3.4ms. This is a first-seen source, not evidence of source regeneration.

Baseline Edit sample 4: changed signed source for the same object/variant with advanced expiry; slowest visible original resource 1765.7ms, heading→visible load gap 1759.6ms, post-response load 8.7ms. Candidate had no >1s viewport fetch/load gap.

Baseline sample 13 had document load 2230.0ms but did not meet the viewport-tail criteria. Offscreen/document-load delay must not be presented as visible-image failure.

## Server correlation and cache proof

All 80 formal documents were represented in safe stage groups (640 numeric stage entries). Timestamp windows correlate stages to samples; logical stages are not physical HTTP counts.

Candidate Edit: 28 lease reuses + 2 seeds. Preview: 10 reuses. Page Editor: 10 reuses and 10 `size-or-age-disabled` outcomes on additional reader calls. These disabled calls retained the fresh path; they are not silently counted as shared-cache hits. Overall: 48 reuse, 2 seed, 10 disabled. Lease duration overhead p50 11ms, p75 12ms, max 66ms. Runtime Cache in-memory-fallback warnings: zero.

Official Runtime Cache API use and successful encrypted lease reads are established. Instance migration was not deliberately forced; same-runtime vs cross-instance physical placement of individual requests remains UNVERIFIED. No claim of browser/CDN cache HIT follows from lease reuse.

Edit signing helper: Baseline p50/p75/max 38/57/326ms, Candidate 50/67/243ms. Combined draft-cover-signing stage: Baseline 262/318/861ms, Candidate 262/346/473ms. This is not a signing-cost optimization; fresh signing still runs. The two baseline visible tails greatly exceed their post-response load gaps, supporting delivery/fetch completion rather than demonstrated decode/render delay.

## Auxiliary routes and source stability

Page Editor (10): heading p50/p75/max 856.6/1012.1/1398.8ms; load 875.1/1040.3/1420.9ms; viewport image-load gap 2.8/3.1/4.4ms. Resource entries were present but native recorded durations were zero in all samples. This is a rounded browser timing observation, not proof of zero transfer or cache HIT. Seven documents had mixed source reuse, including a same-object/same-variant source difference between cover usages outside the reused body map. It remains a scope limitation; no broken image or visual mismatch was observed.

Preview (10): heading 970.8/1073.3/1448.9ms; load 807.0/1091.4/1469.7ms; viewport resource duration 0/12.3/18.8ms; Body-selection-relative image-load gap 7.6/29.0/33.4ms. All ten source classifications were exact reuse. Body readiness is anchored to body observation, not the operator's click delay.

## Provider observability

CDN response headers (`cache-control`, age, x-cache, provider cache status) remain UNAVAILABLE on the supported observation surface. No extra HEAD/fetch probe was introduced. Same URL, zero recorded duration or transfer size is not treated as a cache HIT. Actual provider-cache state and decode duration remain UNVERIFIED. Server signing duration and image resource duration are explicitly separate metrics.

## Correctness and security

All 80 formal samples: zero broken images, zero console errors, no horizontal overflow, no ambiguous image ordinal mapping. Every Edit sample had all 12 body-card links. Edit kept 21 generated image preloads; Page Editor 19; Preview 2. No lazy/priority change was mixed in.

A completed two-document check of all 21 application signed images confirmed the same underlying source/variant, natural dimensions, object-fit, object-position, transform/origin, rendered CSS dimensions and loading/priority attributes. Wrong route-pet smoke returned 404 with no album imagery. Same logged-in owner and Multi-Pet real fixture rendered throughout.

Automated isolation tests cover different owner/session/bucket/path/variant, expired/near-expiry entries, corruption/binding mismatch, provider error/timeout and stale-provider lifetime. Production disablement and exact branch gate are tested. Wrong-owner browser account and unauthenticated fresh-session browser coverage were not run in this task; automated coverage is not relabeled as browser PASS. Genuine No-Crop/contain browser acceptance remains **UNVERIFIED due to fixture absence**. No save was required or performed.

Local client bundle scan found zero occurrences of the lease log label, lease namespace, AES cipher string or Service Role variable name. New adapter is server-only; no credential value was acquired for diagnostics. Remote protected JavaScript exhaustive scan was not performed and remains UNVERIFIED.

## Verification and evidence

At experiment application HEAD: 1204/1204 node tests PASS; TypeScript PASS; lint zero errors/12 existing warnings; build PASS; diff check PASS. An initial build encountered the installed Next advisory check; the unchanged ordinary retry passed. No dependency upgrade or advisory suppression was performed. Next remains 16.4.0; only the pinned official Runtime Cache server SDK and its lockfile additions were introduced.

Numeric evidence and local measurement helpers are ignored under `outputs/task085-4-4-5-13/`. No real IDs, raw URLs, paths, credentials or raw runtime logs are included in this canonical report. Local original evidence is retained, not deleted.

## Cleanup and recommendation

The comparison alias was restored to its original candidate after measurement. Production/main, Production region, Production secret, DB and Storage were untouched. Leases expire within five minutes and the experiment branch remains opt-in; no broad provider cache purge or branch deletion was performed.

Recommend retaining this as an experimental optimization candidate, with a separate explicit release review if desired. Tail improvement is observed, but only one non-first baseline tail supports the post-warm comparison; typical fetch p75 did not improve and Page Editor cover-source reuse is not comprehensive. The crypto/provider dependency and extra cache I/O must be weighed against that limited benefit. Do not claim causality, provider cache HIT, physical signing reduction or Production readiness from reuse alone. Stop here; no Production release, RPC, Task085.5 or UI redesign.
