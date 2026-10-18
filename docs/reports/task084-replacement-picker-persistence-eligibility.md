# Task084 — Replacement Picker Persistence Eligibility Alignment

## Root cause and read-only investigation (2026-10-16 JST)

The loader allowed photos from the union of the Album's primary pet and album_pets, with same uploader/owner filtering. overrideFramePhoto and overrideCover instead required photo.pet_id === album.pet_id. This prevented an owned secondary pet's photo from being saved even though the Picker offered it.

The acceptance reproduction selected the second visible candidate ordered by taken_at descending. Reconstructing that same candidate from persisted records confirmed: album exists=true, photo exists=true, uploader matches Album owner=true, primary pet matches=false, album_pets membership=true, Album pet count=2. This is a read-only reconstruction of the recorded selection; the original failed request did not emit a per-predicate diagnostic. No sensitive identifiers or signed URLs are included here.

The database family-sharing migration already validates draft photo membership through album_pets. It does not require the primary pet exclusively. The server action's narrower check therefore disagreed with both the Picker and DB membership contract.

## Original save rejection paths

- Invalid frame/photo UUID, unauthenticated user, missing/inaccessible frame or spread/Album linkage.
- Missing/inaccessible Album or photo, primary-pet mismatch, uploader mismatch (combined pre-RPC rejection).
- RPC error, including database membership/ownership/RLS/trigger rejection.
- RPC missing/conflict results, and failed draft reload after persistence.
- Revision/client sequence handling remains in the existing RPC and editor save queue.

The observed eligibility failure corresponds to the primary-pet predicate. It occurs before the frame RPC; it is not a crop safety or subset rejection.

## Fix

canUsePhotoInAlbum is the shared pure authorization predicate used by candidate filtering and both frame/cover photo mutations. The server derives its context from the owned Album, album_pets and owned pets; missing membership, query errors or an unowned linked pet fail closed. The primary pet must also be present in album_pets, matching DB membership authority. No client-provided pet集合 is trusted.

Candidate queries retain same-uploader filtering and the existing recent-80 cap plus explicitly-added Album photo backfill. Candidates are filtered through the same helper before URL generation. Album membership means allowed pet membership, not mandatory membership in album_photos or the generated selected subset. Generation-unused photos remain eligible when their ownership/pet conditions pass. Shared/family uploader photos are not newly authorized.

Server authentication, Album ownership, photo uploader ownership, authoritative membership validation and the DB RPC remain. Frame replacement now also checks that the frame's draft is currently active before saving. Existing cover active-version checks remain. Optimistic rendering, crop/layout math, save queue, error/retry/navigation behavior are unchanged. No generator, Safety threshold, Task081, Task078, or database migration changed.

## Tests and verification

- New behavioral helper tests: owned primary/secondary pet, generation-unused, wrong owner/uploader/pet, missing context/photo and empty membership.
- Actual server action execution with deterministic Supabase double: all displayed candidates pass overrideFramePhoto and reach persistence RPC; outside-pet/wrong-uploader/missing-photo/stale-version requests are rejected without RPC.
- Existing cover persistence harness updated to supply real membership reads; its save/revalidation/reload behavior remains tested.
- Existing single-pet source assertion updated to shared eligibility; security assertions retained.
- node --test tests/*.test.mjs: 1150 PASS, 0 FAIL.
- npx tsc --noEmit: PASS.
- npm run build: PASS.
- npm run lint: PASS (0 errors, 12 existing warnings).
- git diff --check: PASS.

## Acceptance

Preview/browser persistence acceptance remains pending. Mocked RPC success is not evidence of live DB persistence or reload consistency. After Git Integration Preview is ready, repeat the same Body Edit scenario and compare /edit, Preview and reload. Then resume cover identity, background/elements and a genuine contain fixture. Final Integration Acceptance remains NOT PASS until those checks complete. No main merge or Production deployment.

### Preview handoff — 2026-10-16 JST

- Feature branch commit/push: dd5e5141b5e356602489e34a0c93b87b8b54fffc.
- Git Integration Preview: https://preview.example.test
- Deployment deployment-fixture: READY, target Preview, Git commit SHA matches exactly.
- Opening the same acceptance Album's /pages/edit?spread=0 redirected to /login. Browser persistence acceptance is blocked pending user login; no password/session was copied between deployments. No live save success claimed yet.
- Read-only lookup of the same owner's active drafts found zero effective NO_CROP layouts. Genuine contain browser fixture remains unavailable; not marked PASS and no DB fixture was fabricated.
- This handoff note is a local report-only addition after the deployed commit. Main merge and Production deployment remain prohibited.

### Acceptance resumed — 2026-10-18 JST

Task084 secondary-pet replacement scenario: PASS.

- Logged-in same Album, /pages/edit?spread=0. A transient ERR_NETWORK_CHANGED affected the first tab; a fresh tab recovered. Initial editor load and route transitions were slow (tens of seconds), but completed.
- Read-only target eligibility: Album/photo exist, same uploader/owner, secondary pet differs from primary, allowed album_pets membership=true, pet count=2.
- Picker second item was confirmed to be the same target used in the earlier failure. Selected it through the UI; local main/thumbnail matched immediately.
- Save indicator progressed 保存中 -> 保存済み, without error. Read-only active-draft check confirmed replacement persisted, frame revision=4/clientSeq=4. No raw Server Action response or network RPC trace captured; persisted frame change is evidence the write completed, not an invented response payload.
- 完了 navigated to /edit. First body thumbnail matched Editor photo/crop/imageFit/layout exactly, before and after reload.
- Preview body main matched those values before and after reload.
- Screenshots: outputs/task084-acceptance/body-list-after-reload.png and body-preview-after-reload.png.
- No application code changed during acceptance. Remaining integration checks are recorded below as they complete.

### Remaining integration checks — 2026-10-18 JST

Cover identity: PASS. Changed the cover to a different Picker photo; local photo changed immediately, 保存中 -> 保存済み without error, then 戻る reached /edit. Read-only cover row and photo thumbnail-path lookup confirmed the saved selected photo and actual displayed thumbnail match. Both /edit hero/cover thumbnail matched, including after reload. Actual Preview route was confirmed before comparing its cover; it matched the same path before and after reload. Screenshot: outputs/task084-acceptance/cover-preview-after-reload.png. An early attempted Preview navigation was still on /edit when inspected, so that sample was excluded; later direct Preview navigation and reload supplied valid evidence.

Background: PASS. Changed first spread left background from white to pale sage. Editor main/thumbnail immediately agreed (rgb(237,241,233) left, white right), 保存済み. /edit and Preview matched before and after reload. Preview main/thumbnail backgrounds agreed. Screenshot: outputs/task084-acceptance/body-background-after-reload.png.

Elements: NOT VERIFIED. On first spread E_1_RIGHT_WIDE, テキスト then 肉球 stamp attempts were refused with この見開きには空いている配置場所がありません。 No element was created or persisted. The existing addElement path requires an unoccupied polish caption/decoration slot; no code/placement guard was changed or bypassed. This is a fixture/placement limitation, not evidence of a successful elements sync test. Needs a spread with an available supported slot for full elements acceptance.

No-Crop contain: still NOT VERIFIED. Current same-owner active-draft read-only lookup found no effective FINAL_NO_CROP layout. No database data or generation layout was fabricated to force contain. Fit zoom controls are not a substitute for imageFit=contain evidence.

Final Integration Acceptance remains NOT PASS because elements/contain browser checks remain incomplete. Task084's original secondary-pet persistence regression is resolved in the tested Preview. No application code change, commit, push, main merge or Production deployment during this resumed acceptance. Report additions are local and uncommitted.

### Fixture discovery follow-up — 2026-10-18 JST

Supersedes the earlier Elements fixture limitation: current-owner discovery found 13 supported spreads among 12 active drafts/109 spreads. Existing Album album-fixture-01 spread index0, L01, had caption bottom-center and free decoration slots. Normal UI text/tape additions saved and matched Editor main/thumbnail, /edit, Preview and reload: Elements synchronization PASS. No code or direct DB writes used to create the fixture. Current effective contain/FINAL_NO_CROP fixture count remains 0, all effective layouts recognized; No-Crop browser acceptance UNVERIFIED (fixture absent), not FAIL. See final-integration-acceptance.md for status definitions, evidence and visual limitation.


Privacy note (2026-10-19): all fixture identifiers/URLs in this report are synthetic
examples. PNGs, discovery JSON and original report copies under outputs/ are
local-only, ignored by Git, and are not distributed with this canonical report.
