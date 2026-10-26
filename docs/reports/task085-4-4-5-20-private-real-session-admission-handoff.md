# Task085.4.4.5.20 — Private Real-Session Admission Handoff

Status: B — HOLD. Real-session Preview handoff failed closed before proposal publication. No release re-authorization recommendation.

## Blocker and implementation

The previously authorized release did not have a real-session operational admission path. The new server-only Edit integration uses a fresh authenticated request, verifies album ownership, canonical pet, owned membership and eligible photo sources, signs the authorized sources, rechecks the session and creates an opaque proposal. No public API, enrollment UI, browser credential extraction or Service Role is added.

A private operator stages an immutable intent bound to an observed exact source SHA, environment, sin1, two fixed five-minute epochs and at most two approved slots. Each slot is create-only and limited to 8 KiB in the approved private Preview Blob store. The application receives only short-lived, exact-object PUT/HEAD grants. The store-wide credential is not installed in the application.

The operator verifies app-signed proposals and seals all slots atomically into the existing finite manifest format. The runtime validates the manifest digest, app proposal signatures and a separate operator signature against public keys pinned in the deployment intent. This is a new trust boundary: the sealed manifest is installed through runtime control rather than a literal manifest value in deployment environment configuration. It requires explicit review with the new candidate, and is not covered by the old release authorization.

Arming keeps reuse OFF. Only a complete verified seal can be enabled. OFF and all validation failures use the fresh authorized path. The legacy gate remains unchanged when the new handoff flag is disabled. No Production operation has been performed.

## Scope and exact candidate

Implementation changes are limited to the Edit server integration, two handoff modules, a private operator command, the official Blob dependency/lockfile and focused tests. Existing unrelated reports are preserved.

New exact application candidate: `953dd8f6b094c09b978b4b08ffad9bd43356323a`. The old authorized candidate is not silently replaced. All 1,242 tests, TypeScript, lint (zero errors / 12 existing warnings), build retry and diff checks were repeated at this SHA.

## Preview acceptance

Actual Preview: exact application SHA `953dd8f6b094c09b978b4b08ffad9bd43356323a`, configured sin1, runtime audit sin1, Service Role absent. The existing authenticated comparison-host session was reused without cookie/token extraction. Edit rendered normally with 12 body-card links.

The one-shot fixed trial was armed with reuse OFF. The document request produced `handoff-failed`, count 0 / bindingCount 0 / buildMatch true / epochMatch true. No opaque proposal was published and no manifest was sealed or enabled. Control was explicitly returned to OFF. The trial was not extended or replaced.

Root cause: the official Blob SDK serializes `vercel-blob-allow-overwrite` and `vercel-blob-add-random-suffix` as the strings `false`; the application adapter incorrectly required the strings `0`. It therefore rejected the legitimate bounded PUT grant before publishing. A private read-only grant probe confirmed the false/false/8192 policy; the exact HEAD grant returned 404. This is an implementation compatibility defect, not an authorization failure or justification to relax the policy.

The mocked adapter fixture used the same incorrect representation, so its passing test did not catch this real SDK contract mismatch. A follow-up must validate actual SDK-produced grants, preserve strict false/false policy and retest with a new exact SHA and separately staged fixed trial. This report does not present the current candidate as release-ready.

NOT REACHED: manifest accepted, ON seed, ON reuse, post-seal OFF fresh acceptance and wrong-canonical-pet browser acceptance. No source lease was seeded. Automated wrong-pet/scope tests passed; browser acceptance is not claimed.

The approved private Preview store has been created, with no application connection or payload objects at the provisioning checkpoint. Additional temporary-project credential provisioning was initially rejected by automatic approval review. The user then explicitly approved that additional scope. An empty, undeployed temporary project now holds only the dedicated private store credential in development scope. The credential is kept in ignored private local state and never displayed or installed in the application. Only two exact-path, bounded, deadline-limited PUT/HEAD grants are installed in the comparison branch Preview. No broad Preview or Production credential scope is changed.

## Tests and privacy

Node 24 verification checkpoint: all 1,242 tests passed; TypeScript passed; lint had zero errors and 12 existing warnings. The 21 focused tests cover authorization order, changed session/source sets, scope mismatch, wrong build/environment/region, fixed epochs, slot/binding limits, duplicate/concurrent publication, signature tampering, all-or-none sealing and the server adapter. Operator syntax and diff checks passed.

The initial permitted build completed compilation but stopped on a known security advisory affecting the installed Next.js version. The unchanged build retry passed. The dependency advisory remains a known limitation; no upgrade or suppression is included in this task.

Audit output is restricted to outcomes, counts, environment/region and build/epoch match booleans. Proposal payloads exclude credentials, signed URLs, raw paths and user/photo/album/pet identifiers. Private operator state and grants remain local-only. The local generated client scan covered 98 JavaScript files: zero dedicated credential-value matches and zero handoff secret-name/private-key-marker matches. Runtime audit extraction used a fixed allowlist. Full remote protected-JS and DOM/RSC leakage scans remain UNVERIFIED; they are not represented as PASS.

## Remaining work and recommendation

Correct the strict SDK boolean representation check and add an actual SDK grant-contract regression fixture, then run a separately staged fixed Preview trial and remaining privacy checks before release re-authorization review. Natural credential refresh remains UNVERIFIED unless observed without manipulation.

Decision: HOLD. No Production deploy, main merge/push, Production Runtime Cache write or canary extension is authorized by this checkpoint.

## Exact diff / rollback / stop

The application commit contains eight files: Edit route argument wiring, existing canary adapter integration, private core, private server adapter, private operator command, focused tests, package manifest and lockfile. No lazy-loading experiment, RPC, UI, generation, Safety or persistence algorithm change is included. The additional official Blob dependency is used by the private operator; no store-wide token is shipped to the application.

Default handoff remains OFF without explicit server environment enable. Production has not been enabled or deployed. Rollback for this Preview trial is control OFF, comparison alias restoration and removal of the dedicated Preview settings/deployments and disposable external resources. The old Production release authorization does not cover this SHA or new trust boundary.

Next recommendation: HOLD; repair the grant-contract defect before any new real-session trial or release review. Do not proceed to Production, RPC, client optimization or redesign.

## Cleanup and final state

Control OFF was confirmed before cleanup. The comparison alias was restored; eight dedicated branch-scoped Preview environment records and two exact-SHA Preview deployments were removed. The dedicated private store, undeployed temporary credential project and trial control were removed. Production deployment identity and Production environment metadata were unchanged across cleanup. No user-owned local working files were removed; private evidence remains ignored and local-only. No remote trial credential scope remains active.

At the end of the real Edit observation: 25 images, zero broken, zero pending and no page horizontal overflow. This confirms failure fallback kept the observed page usable; it does not substitute for ON seed/reuse acceptance.

Application code was not changed after the failed fixed trial and no second trial was started. The compatibility defect remains explicitly identified in the candidate rather than silently repaired or released.
