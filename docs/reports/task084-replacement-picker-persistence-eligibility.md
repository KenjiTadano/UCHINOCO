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
