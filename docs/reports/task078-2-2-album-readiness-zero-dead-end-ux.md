# Task078.2.2 Album Readiness, Auto-Resume & Zero Dead-End UX

- Date: 2026-10-09
- Branch: `feature/task078-2-2-album-readiness-zero-dead-end-ux`
- Base/main at start: `1eb8123b71c7b2ee164d668bad68201098bd9515`
- Git integration: feature-branch commit and main merge/push authorized by the user. Production deployment and real-photo verification remain pending.
- Unrelated Pricing/Legal/Billing/public-test changes present at start were preserved and are not part of this task.

## Before And UX Problem

The creation form used total pet-library counts and found missing current analyses only after submission. Its response asked users to return Home, wait for unexplained preparation, and manually repeat creation. No creation intent survived that interruption. Photo shortage, transient failures, and analysis pending were presented as form errors rather than distinct actionable states. Photo upload accepted a validated `returnTo` but successful submission always returned to the pet timeline instead of the originating setup.

## Architecture And Readiness Model

`checkAlbumReadiness` authenticates the caller, verifies the route pet and every selected pet through owned IDs, validates setup and frozen request time, fetches selected-period photos in 200-photo pages, and reuses the Task078.2.1 current-version/fingerprint semantic/geometry batch loader. Only aggregate readiness data is returned to the client; no images, captions, storage paths, or provider errors are returned.

Readiness distinguishes:

- `ready`: enough eligible photos and saved analyses to proceed.
- `preparing`: enough source photos but some preparation is pending; progress is ready / total.
- `shortage`: source photos or post-ranking eligible photos cannot fill the requested budget; exact deficit and a 24/48P smaller-budget alternative are supplied when viable.
- `action_required`: invalid setup, inaccessible pet, terminal analysis failure, or expired sign-in; concrete conditions/photo/login/list actions are shown.
- `unavailable`: temporary read/server failure; client retries before showing a recovery action.

When all analyses are ready, the same deterministic Grouping/Best Shot policy is used to check page-budget eligibility. Creation still revalidates ownership/setup/readiness; the UI is not an authorization or safety boundary.

## State Machine And Auto Resume

Setup checking → ready or preparing or actionable shortage → creation intent → preparing with automatic checks → generating → complete → Preview. Temporary failures retry within bounds; exhausted or permanent failures expose concrete recovery actions. No pending response instructs users to visit Home and press Create again.

The tab's sessionStorage keeps only selected pet IDs, period/custom dates, page count, request timestamp, an intent UUID, route pet, and phase. The intent TTL is 30 minutes. Relative periods are calculated using the intent timestamp in both preflight and generation, so polling/reload do not silently change the range.

- Double submission: an in-memory execution lock and pending intent suppress client duplicates.
- Server idempotence: the validated intent UUID is used as the album primary key. Concurrent inserts cannot create two rows for the same intent. A ready persisted draft with the matching conditions key and cover returns its existing Preview.
- Reload: a valid same-route/owned-pet intent resumes checks. Invalid, expired, corrupted, or foreign-pet session state is discarded/not submitted.
- Back navigation: leaving preparation stops this component's checks; the tab intent can resume on return. An in-flight Server Action is not cancelled by navigation. If its response is missed, the same-ID lookup can recover its finished draft.
- Cancel: the explicit setup/waiting cancel clears the intent. Generation navigation is labelled “一覧へ”, not an unimplemented server cancellation.
- New setup: successful completion clears the intent before Preview navigation. Condition changes before intent creation invalidate old readiness results; during preparation, users explicitly cancel/unlock before changing conditions.
- Partial persistence: an existing incomplete same-ID album is treated as in progress while it is younger than 150 seconds. A stale incomplete record requires an actionable recovery rather than automatically creating another album or deleting data. No general distributed job table/migration was introduced.

## Recovery And Copy Design

`RecoveryState` standardizes title, plain-language description, optional numeric progress, primary/secondary actions and 44px controls. Progress has `role="status"`, `aria-live="polite"`, and text meaning independent of color. Pending preparation displays “アルバムを準備しています” and “24 / 32枚”; generation displays “アルバムを作っています”. Internal processing names are not used in these messages.

Photo shortage supplies “あと7枚” plus Photo Add and a smaller-page option. Photo Add saves the originating intent, uses a safe setup return path, and successful upload returns to that setup. Changing to a smaller viable budget preserves an existing creation intent and continues automatically; without an intent it simply changes the selected budget.

Preflight retries at most three total attempts with short delays; active preparation has at most 180 automatic checks, five seconds apart (plus request time). Generation transport/retryable/in-progress responses have at most three automatic retries using the same ID; in-progress rechecks wait 60 seconds. Retry exhaustion gives a same-screen recheck/list path. Preparation budget or TTL exhaustion requires an explicit recheck/condition change; there is no infinite polling.

Unexpected creation exceptions are mapped to generic typed recovery without raw exception text; Next framework control-flow exceptions are rethrown. Creation and Album/Viewer error boundaries provide in-place retry/list actions rather than asserting a network fault. Sign-in expiry offers “ログインして続ける”.

## Performance And Analytics Boundaries

Task078.2.1 invariants remain: no creation POST Vision/original download, 200-photo stored-analysis reuse, sixteen phase logs, request-local Crop cache, bounded Rhythm repairs, pre-persistence 80-second margin, and route `maxDuration=120`. Readiness does not run the analysis API; the existing bounded app-shell runner continues background preparation.

Existing `album_generated` and accept analytics are retained. New preparation event names were not inserted because the database event allowlist would require a schema change; no fake analytics events or PII payloads were introduced.

## Verification

- Full tests: 1018 passed, 0 failed.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: 0 errors; 12 pre-existing unrelated warnings.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Added eight focused tests for ready/pending/terminal state, source/ranked shortage and page fallback, intent auto-resume/execution lock, bounded retries/exhaustion, owner-scoped preflight, server ID/key binding, stale/reload intent, actionable/mobile structures, and validated photo-upload return.
- Existing Task078.2 and Task078.2.1 page-budget, Preview First, layout/crop/Rhythm, performance, and all-member Best Shot tests continue to pass.

Headless Chrome used a temporary local-only client fixture with injected adapters, not an authenticated Production account. Verified ready CTA, shortage→24P selection, preparation→automatic generation, reload during preparation, single generation invocation, completion intent cleanup, explicit cancellation cleanup, transient retry recovery, and retry exhaustion with a recheck action. Preparation and shortage/CTA screens had no horizontal overflow at 375/390/430px; screenshots were visually inspected. The fixture route was deleted before final build; no auth bypass/test endpoint is shipped. Browser tooling was installed outside the repository and no project dependency was added.

## Zero Dead-End Guidelines For Task080

1. Prevent foreseeable invalid operations with a server-authoritative preflight and visible reasons; do not use an unexplained disabled button.
2. Separate “not enough user input” from “system still processing”. Only the first should require input changes.
3. Save a bounded, owner/route-bound intent before interruptible work. Freeze relative conditions and use an idempotent server identifier when retrying writes.
4. Automatically resume when a verifiable state becomes ready. Do not confuse a successful request/redirect with successful persistence.
5. Retry transient work silently within explicit budgets, then offer a recovery action. Never loop indefinitely or increase external-analysis work to hide a stuck state.
6. Every permanent or exhausted state needs a local retry/recheck/condition action and a safe exit; copy alone is not recovery.
7. Returning from an input detour must return to the originating intent. Completion and explicit cancellation must clear it.
8. Expose useful progress and plain-language state, not internal component/service names. Keep logs/analytics structured and privacy bounded.

## Remaining Issues And Production Status

Production real-photo acceptance is pending. The local fixture verifies client behavior but does not prove real queue completion, distributed insert races, durable partial-write recovery, or authenticated photo upload→setup→Preview against Production. Session intent is tab-scoped, not a durable cross-device job; closing the tab stops client auto-resume. The existing bounded runner can take longer than the preparation check budget for an entirely unanalysed 30–40-photo dataset; the UI then offers a same-screen recheck rather than increasing Vision throughput. Measure that long-wait experience in Production before claiming all real-photo scenarios fully accepted.

No data deletion, Print order, Stripe operation, Vision request, or Production write was performed for verification. User-authorized main integration excludes unrelated working-tree changes.
