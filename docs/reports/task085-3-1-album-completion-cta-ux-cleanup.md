# Task085.3.1 — Album Completion CTA UX Cleanup

Status: Task085.3 image-delivery acceptance completed first; CTA implementation and local tests now complete, final verification PASS; new Preview browser acceptance pending. Task085.4 is not started.

## Existing completion CTA behavior

`album-complete-screen.tsx` renders two equally styled `ai-complete-primary` controls: a Preview Link (“アルバムを見る”) and a native Server Action form (“このままでOK”). Secondary edit and print links follow. Draft edit currently targets `/pages/edit`; the requested new completion edit target is the existing `/edit` list.

The “このままでOK” form calls `acceptAlbumDraft` in `analytics-actions.ts`. Its path is:

1. Validate route UUID syntax.
2. Authenticate and verify album owner + route pet.
3. Read the active draft.
4. Read the first generation event for that version to calculate time-to-accept.
5. Record `album_accepted` with edit metrics and version event key.
6. Redirect to Album Preview.

The Action does not save draft content, change album status, finalize a print snapshot, create an order, or take payment. Do not confuse it with persisted draft completion. However, `album_accepted` is semantically significant: migrations for passive materialization and suggested-photo additions consult this event as a protection/finalization signal. It must not be silently removed or converted into a simple Preview-view event.

The form has no explicit disabled/pending UI, client click handler, or action error feedback component. Duplicate analytics events are tolerated by `recordAlbumAnalyticsEvent` (unique violation 23505 is accepted), but this is not proof that double requests cannot occur. Invalid ownership/album returns without a UI message; unauthenticated users redirect to login; unhandled read/action failures use framework behavior. These are source findings, not live click results.

## Existing order and print implementation

The product and checkout routes exist. Print Preview is implemented and has blocking/stale checks, snapshot generation, and an order-start control disabled while pending or when no valid snapshot exists. `startAlbumCheckout` is the existing gated path from print to product/checkout. A draft Preview order CTA must preserve this path; relabeling a link to the completion screen as “注文へ進む” would be misleading, and linking straight to an unfinalized checkout would bypass the intended draft print flow.

No new payment, purchase, print generation, migration, authorization bypass, or placeholder route is planned. Browser acceptance must stop before an actual purchase/payment.

## Initial plan (implementation recorded below)

- Completion: one filled Primary “アルバムを確認する” linking to Preview; secondary “写真・レイアウトを編集する” linking to `/edit`; secondary “印刷イメージを確認する” using existing print route when available. Remove the completion-screen acceptance form.
- Preview: one order-intent Primary and “編集を続ける” linking to `/edit`. Preserve the existing acceptance event at this explicit confirmation point, with existing server authorization; continue through the implemented draft print guard. Legacy/non-draft order behavior must remain valid.
- Preserve the cover-edit link's destination independently if general editHref changes to `/edit`; its current construction assumes an editHref ending in `/pages/edit` and must be checked.
- Add clear pending/error/retry behavior for any relocated acceptance form, without altering save/revision/clientSeq or introducing checkout operations.

This initial plan was implemented after Task085.3 acceptance and the old button live checks; final wiring and results are recorded below.

## Original live acceptance checklist

Before change: old button enabled state, click/redirect, pending state, repeat-click behavior, analytics effect, absence of draft/order/status mutation, retained draft identity, and error behavior where safely testable. Do not manufacture a Production failure or rewrite DB state to simulate one.

After change: completion → Preview → edit → `/edit` → Preview, one clear Primary, correct print/order guard, same persisted content/secondary-pet identity after reload, and no console/runtime errors. Part A's real image-source / dimensions / crop / geometry / fallback and reload acceptance must finish first. Genuine No-Crop remains UNVERIFIED due to fixture absence; no artificial fixture is created.

## Verification

The initial source investigation did not change application code. Subsequent implementation verification is recorded below; Task085.3's earlier 1176-test result is not used as a substitute.


## Old button live check (before code change)

The existing completion screen showed both equally styled Primary controls. “このままでOK” was enabled and its click reached Preview. A state observation during the wait still showed the old screen without an explicit loading label. A second click attempt was not dispatched because the target had already disappeared during route transition; this is not evidence of a reliable pending lock or concurrent duplicate-request prevention.

Read-only state comparison before and after this old-CTA click: album status remained draft; active draft status remained editing; revision remained 6; full spread/frame content hash remained identical; order count remained 0. This fixture already had an accepted event; the version's accepted-event count remained 1, consistent with the existing idempotent key/unique-violation handling. No purchase was made. A real server/network failure was not manufactured on the existing album; source findings and isolated failure tests cover those cases.

## Implemented CTA flow

Completion removes the acceptance form and acceptAction prop entirely. It now has one filled Primary “アルバムを確認する” linking directly to Preview, and neutral/outline “写真・レイアウトを編集する” (`/edit`) / “印刷イメージを確認する” (existing print route when available). Existing regenerate control remains visually subordinate. Header edit also uses the same existing `/edit` route.

Draft Preview receives the bound owner-authorized `acceptAlbumForOrder` Server Action. Its “この内容で注文へ進む” form records the existing accepted event and redirects to `/print`, where the existing quality/snapshot checks remain required before product/checkout. A short explanation tells the user that print confirmation comes before order details. Nothing creates or pays for an order at this new CTA. Legacy non-draft Preview retains the existing product link with the clearer label. If a draft action binding is missing, show an explicit reload error rather than silently skip acceptance or take the wrong route.

Preview's “編集を続ける” links to `/edit`. Cover Editor href is now passed explicitly, avoiding the former string replacement assumption that general editHref ends in `/pages/edit`. Geometry, image delivery, crop, save/revision/clientSeq, subset, Recovery, auth and eligibility are unchanged.

`AlbumOrderIntentCta` uses useActionState for pending/disabled feedback and visible retryable errors. Both transport failures and application/acceptance-write failures yield an explicit message; Next's framework redirects are rethrown using the documented Next 16 API rather than swallowed as generic errors. The existing legacy acceptance export still defaults to Preview and arbitrary destination strings cannot form external redirects. Its new destination can only select the fixed existing print route. No checkout, payment, print-quality threshold or database migration is added.

## Local tests / verification

Five focused regression tests cover actual Server Action execution with I/O doubles: owner/pet filters and analytics before fixed print redirect; legacy destination/default and malicious destination; invalid identity / missing album / draft / failed read / failed event write / login redirect; one completion Primary and exact labels/routes; pending/disabled/error/retry state and transport vs framework redirects. Existing route-loader fixture is updated for the relocated Action binding.

1181/1181 full tests PASS; TypeScript PASS; lint 0 errors / 12 existing warnings. Final build and diff check / browser UX acceptance are recorded below when complete. These checks do not claim that general app latency is solved. Preview latency remains a separate Task085.4 concern after review.

Final local verification: 1181/1181 tests PASS; npx tsc --noEmit PASS; lint 0 errors / 12 existing warnings; build PASS; git diff --check PASS. Authenticated new-CTA browser acceptance remains pending deployment/login.

The `/edit` list Back and Done hrefs are also aligned to Preview, so the requested completion → Preview → edit → list → Back → Preview loop works through the in-app control. Body/Cover Editor still flush pending saves before returning to the list; no save queue or revision behavior is changed. A final navigation contract check covers both list targets.
