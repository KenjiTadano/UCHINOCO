# Task083.1 — Editorial Photo Density Rebalancing

Date: 2026-10-16 (Asia/Tokyo)
Status: local implementation; Preview Acceptance not performed. No commit, push, merge, or deployment.

## Root cause

The planner allocates a minimum of one photo per spread, then distributes extra photos according to a variable-density rhythm. Candidate layouts must match that spread's existing photo count. Consequently ranking cannot turn a one-photo story into a two-photo story. The original blank-page audit accepts factual date text as sufficient content; it does not measure editorial photo density. E_CLOSING also previously had no final-position restriction.

The observed 24P album has 19 photo assignments distributed across 17 occupied pages and seven date-only facing pages. The relevant sparse layouts were E_1_LEFT_WIDE, E_1_RIGHT_FULL (twice), E_CLOSING (twice), E_QUIET and E_1_RIGHT_WIDE.

## Text classification

Added lib/album-draft/editorial-density.ts. Classification distinguishes none, dateOnly, meaningfulCaption, title/event and userProvided. Explicit provenance can identify title/event or userProvided; dates alone remain dateOnly even with provenance. Multiple date-only lines do not become meaningful merely because the date was repeated. Nonempty substantive caption/story strings are meaningful.

Generation now derives captionAvailable from the real source caption in all three layout-input construction paths instead of setting it to true universally. Factual dates no longer receive the prominent-caption ranking bonus. Existing date/caption persistence and BLANK_PAGE safety behavior are unchanged. The current generation text map contains photo-derived strings; the classifier's provenance parameter supports explicit title/event/user input without inventing such content for existing albums.

## Closing rule

Within buildEditorialDraft, normal and recovery candidate stages exclude templates whose editorialRole is closing unless the story is the final story. An intermediate preserved E_CLOSING cannot bypass the rule. Only the last spread may use E_CLOSING, so it occurs at most once. The template and its renderer/geometry remain available. The exception is permission to remain sparse, not a requirement to choose Closing or suppress an otherwise safe density improvement.

The legacy public candidateDrafts helper has no album position argument; album-wide enforcement occurs in buildEditorialDraft, where the final story is known.

## Redistribution algorithm

The quality pass runs after Recovery and the existing whole-book blocking audit establish a completed safe baseline. Failed quality candidates leave that baseline untouched. No additional input or unused photos are introduced.

- Receivers: single-photo stories with date-only text, processed in stable story order.
- Donors: at least three photos, nearest chronological distance first, then spread distance and index. Consider at most four donors per receiver and two secondary photos per donor.
- Existing primary photos stay in their stories, preserving factual caption anchors. Candidates requiring a stronger incoming photo to replace the receiver's primary are conservatively skipped. Lower-ranked donor secondaries are considered first, with photo-ID tie-breaking internally only.
- Require complete timeline/group metadata, matching pet sets, retention of the moved photo's pet in the donor, and same group or matching known scene/activity.
- Recompute both story time ranges and group IDs. Reject chronological overlap/order violations across the resulting story sequence. Unrelated pre-existing overlaps can conservatively prevent a move.
- Preserve the exact photo-ID multiset. Primary/secondary lists are rebuilt without duplicates or additional photos.
- Reject source clipping using the existing sourceSubjectClipped predicate. Re-evaluate both changed stories through evaluateSpreadLayoutCandidates/buildSpreadDraft using the shared crop, gutter, hero, frame and subject-visibility gates.
- Compare safe pair combinations. Require fewer date-only pages, more photo-occupied pages, and no blocking issue from the existing whole-book audit. Rank qualifying combinations by layout score with deterministic layout-ID tie-breaking. A success is committed only after all checks pass.

The pass leaves meaningful-caption single spreads alone. It does not fabricate captions, reuse photos, weaken safety, change the selected subset, or modify lib/album-draft/selection.ts.

## Bounded work / budget

MAX_REBALANCE_ATTEMPTS = 12 per buildEditorialDraft invocation. Each pair attempt evaluates at most three existing layouts per changed story (at most 72 additional layout evaluations total), and at most nine safe pair combinations. Early exits retain the original completed composition. The existing generation 80-second budget and subset budget checks remain unchanged; no synchronous Vision or new network call was added.

This is a fixed-count deterministic search, not exhaustive optimization. A safe candidate beyond the shortlist may be missed. The measured synthetic full planner run was approximately 155ms locally; this is not a production latency guarantee. Real 24/48/72P latency and the existing 80-second boundary still require Preview runtime acceptance.

## Editorial quality diagnostics

albumLayoutRecovery.editorialDensity contains:

- photoOccupiedPageCount
- emptyPhotoPageCount
- dateOnlyPageCount
- meaningfulTextOnlyPageCount
- singlePhotoSpreadCount
- closingSparseSpreadCount
- rebalanceAttemptCount
- rebalanceSuccessCount
- initialDateOnlyPageCount
- finalDateOnlyPageCount
- rebalanceFailureReasonCounts

Failure counters include noSafeDonor, chronologyConstraint, petBalanceConstraint, sceneConstraint, cropSafety, sourceClipping, templateIncompatibility, boundedSearchExhausted. Counters describe rejected attempts or receivers; they are not mutually exclusive album outcomes. A donor count below three is reported as noSafeDonor. The diagnostics contain no photo, pet, story, or user IDs. They use the existing recovery log and are included in draft metadata as editorial_density, without adding a separate recurring production log stream.

Photo-frame matching work metrics include the quality-pass evaluations; failure-time matching diagnostics are also retained. Final per-spread photo counts and fallback usage reflect the chosen final composition.

## Before / after fixture

Added tests/task083-editorial-density.test.mjs. The representative 24P fixture uses the observed count pattern [1,2,3,1,2,2,1,1,3,1,1,1], 19 unique photos, date-only text, and synthetic geometry evaluated by the real Safety evaluator.

Before: 12 spreads, 19 photos, 17 photo-occupied pages, seven empty-photo/date-only pages, seven single-photo spreads.

After: 12 spreads, identical 19-photo set, 19 photo-occupied pages, five empty-photo/date-only pages, five single-photo spreads, zero meaningful-text-only pages, zero sparse Closing spreads. Two attempts / two successful moves; unrecoveredCount = 0. The remaining five receivers have no donor with three or more photos (noSafeDonor = 5).

This fixture is NOT a copy of the user's real photo analyses, captions, dates or Multi-Pet grouping. It proves a safe 7→5 path for the equivalent count pattern, not that the real album will reach five. Same-day/same-pet/compatible-scene synthetic inputs deliberately make the density improvement possible. Real inputs may retain more sparse pages because chronology, pet, scene or crop constraints reject moves. Existing saved albums are not rewritten.

## Tests / verification

Twelve new tests cover text classification (including explicit provenance and repeated dates), safe 1+3→2+2, rejected unsafe candidates and preservation of the original baseline, meaningful captions, chronology/pet/scene constraints, bounded search, full 19-photo/24P completion, final Closing allowance, real crop rejection, source clipping rejection, repeated full-planner determinism, and intermediate preserved Closing rejection.

- node --test tests/*.test.mjs: 1,138 PASS / 0 FAIL, Node v22.23.2.
- npx tsc --noEmit: PASS.
- npm run lint: PASS, 0 errors / 12 existing warnings.
- npm run build: PASS.
- git diff --check: PASS.

Existing Task081 subset/monotonic tests and Task078 Recovery/No-Crop tests are included in the full suite. Safety thresholds, BLANK_PAGE safety, subset search, and Vision behavior were not modified.

## Remaining limitations

Density is best effort; five is an arithmetic lower bound for 19 unique photos under current one-page photo geometry, not a hard acceptance gate. Metadata or safety constraints can keep the result above five. A primary-preserving, pet-set-preserving, chronology-preserving search is intentionally conservative; broader regrouping and global optimization are out of scope. Missing provenance cannot recover the semantic origin of a previously flattened text string.

Preview Acceptance, real-photo density outcome, production runtime budget, and visual preservation remain unverified. Stop before Preview Acceptance; do not treat local results as deployment or user acceptance.
