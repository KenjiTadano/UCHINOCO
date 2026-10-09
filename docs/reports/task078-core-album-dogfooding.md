# Task078 Core Album Experience / Dogfooding

- Date: 2026-10-09
- Branch: `feature/task078-core-album-dogfooding`
- Base: latest `origin/main` at `b94daa0d26dd5ce109bfb638883377de3ac646c2`
- Task077.2: its branch existed, but its merge to main was not present at Task078 start. No cross-task merge was performed.
- Product verdict: **C — NOT READY (real-photo acceptance not demonstrated)**

## Dogfooding access and dataset

No dedicated authenticated test account or loose real pet-photo dataset was available in this workspace/session. The shared production browser was at the login page; workspace image search found app/UI/blank-album screenshots and illustrations, not a suitable 30–100-photo dogfooding dataset. UI screenshots/blank book assets are not valid photo inputs for judging photo selection or emotional value.

No photo was uploaded, no production user data was read, and no Vision/OpenAI request, Print generation, or production write was initiated for this audit. Dataset A (30–40), B (60–80), C (~100), user-mandatory photos, paid-intent answers, and all human album ratings are **not run / not measured**.

## Existing pipeline audit

| Stage | Input → output | Method / fallback | User action and failure state |
| --- | --- | --- | --- |
| Photo upload | JPEG/PNG/WebP/HEIC/HEIF → original plus browser-generated WebP thumbnail/preview and `photos` row | Client EXIF extraction, SHA-256 duplicate key, HEIC-to-JPEG conversion; signed direct Storage uploads. Server revalidates owner, object path, size, MIME, derivative metadata, date, and hash. | Up to 10 photos per upload; select/camera/drop; optional date/favorite; explicit save. Invalid/conversion/upload/DB errors are surfaced per batch; saved photo is not rolled back if analysis queue enqueue fails. |
| Thumbnail / preview | selected file → 400px thumbnail and preview paths | Browser canvas WebP generation; derivative failure falls back to original upload, with missing derivative paths saved as null. | User sees selected preview, upload progress, duplicate/failure count. |
| Photo Intelligence / intake | saved photo + current version/fingerprint → semantic tags/scores and subject geometry rows | Authenticated app-shell runner alternates semantic and Photo Intelligence work; bounded to four work items per work window and resumes on visit/visibility. Stored version/fingerprint results are reused. Vision failure yields documented fallback/warnings where possible; queue/config failures stop the runner without deleting photos. | Runs after visit in the background; “AI is organizing” status; user does not wait to browse. Missing configuration leaves work pending/stopped. |
| Technical / visual scoring | photo pixels/geometry and Vision result → technical flags and score axes | Deterministic luma/resolution/sharpness/exposure/noise plus Vision expression, visibility, memory, uniqueness; absent/failed Vision uses conservative fallback scores and warnings; corrupt/black images are low quality. | No required edit; score is internal to selection. |
| Duplicate / scene grouping | ordered photos, timestamps, semantic tags, subject geometry, JPEG descriptors → scene groups and pair similarities | Deterministic time/semantic/visual thresholds, medoid and all-member checks prevent chaining unrelated scenes. Pair/descriptor caches are versioned. Missing descriptors degrade similarity; stored-only mode does not download originals to manufacture descriptors. | Automatic. Ambiguous groups carry warnings; preparation failures stop generation with a safe message. |
| Best Shot | scene group and each member's Photo Intelligence/technical scores → primary/secondary/alternate ranking | Deterministic weighted score, sharpness lift, quality/confidence penalties, similarity/pose checks, stable tie-break. Missing Intelligence uses defaults; singleton groups pass through as primary. | Automatic. |
| Album Candidate | selected scenes + event/time/diversity evidence → up to the configured scene/photo budget | Deterministic ranking and diversity penalties; high-value scenes can be must-keep. Current monthly passive candidate starts at 12 photos and waits until current version semantic + geometry are available for all period photos. No album rows are written before open. | Album list/Home may show unreviewed candidate. User opens to materialize; stale/protected candidates are suppressed. |
| Story / Grouping | selected scene cards, chronology, scene/activity/tags, Best Shot values → story spreads, density/role/reasons | Deterministic time/semantic/event/visual coherence rules, photo budget, chain-break handling and chronology. No freeform story facts are generated. | Automatic; invalid/empty candidate returns generation error. |
| Layout / crop | story spreads plus geometry → layout assignment, crop and frame quality tier | Deterministic layout scoring/permutation, role/variety/orientation/rhythm and strict/fallback/unusable tiers. Smart Crop is deterministic from stored geometry; cache miss can invoke Vision. Missing key, large image, Vision failure or parsing failure uses center fallback with warning; hard crop safety can make a spread unusable. | Automatic initial layout; later optional editor overrides. |
| Whole-album quality audit | pipeline audit input → blocking/nonblocking issue list and score | Deterministic `assessAlbumGeneration` checks period, duplicates, broken images, crop safety, story/layout drift and quality. **Current callsite is the dev Album E2E action only; normal production `createAlbumDraft` does not invoke this whole-album audit.** Per-spread layout/crop gates still run. | Not shown as an overall acceptance gate in normal creation. This limits production-level observability and is a P1 follow-up. |
| Cover / Decoration | selected Hero, title/period, story role/whitespace/event and user overrides → saved cover and optional decoration recommendation | Cover starts from selected Hero (fallback first selected photo) and rule-generated title with optional short OpenAI title request/fallback. Decoration recommendation is rule-based, offers CLEAN first, and abstains on low confidence, Hero/Grid/Quiet pages or user-owned elements/backgrounds. | Cover/editor/decoration are optional; decorations are not required for album completion. |
| Viewer / Editor | active persisted Draft + signed preview URLs → complete/preview/editor views | Viewer reads saved AI layout/crop/elements. Editor changes are user overrides persisted via guarded RPC/revision; opening editor does not regenerate or call Vision. | User may accept directly (“このままでOK”) or edit. Missing draft/read errors are surfaced; empty/manual changes do not silently overwrite AI state. |
| Print Preview | saved Draft + cover + print spec → print quality inspection, PDF and immutable snapshot on explicit PDF creation | Deterministic geometry/font/image/collision/safe-area checks; blocking issues prevent PDF/order action. PDF generation and snapshot are explicit user operations. Production Print remains disabled; no order is placed here. | User opens Print Preview and chooses PDF; error/issues are displayed. |

## KPI / experience measurements

- Dataset: **none**. No count of photos by type, resolution, or scene was recorded.
- Time to Album, click count, user inputs, AI wait, manual selections/editor visits: **not measured**.
- Editor necessity A/B/C, important/missing photos, bad selections and reasons: **not assessed**.
- Photo Selection / Duplicate Control / Story-Rhythm / Layout / Crop / Cover / Decoration / Editing Effort / Emotional Value / Overall scores: **N/A — no real Album was generated or viewed**.
- PASS/WARN/FAIL for the ten human-review categories: **NOT ASSESSED**. No synthetic fixture is substituted for user photo quality.
- Direct Accept: existing Task074 metric derives `DIRECT_ACCEPT` from persisted edit distance on accept; no dogfooding event was recorded. Page-level direct accept was not measured.
- New Photo Suggestion → selective add → Smart Placement → Viewer: existing route/code was audited but not exercised.
- Monthly/Annual candidates: existing flow/code was audited but not exercised.
- Print Preview/PDF: not opened; no PDF or purchase was generated.
- Performance/cost: no API/Vision calls were initiated by this Task078 run; production call counts, egress, generation latency and cost remain unknown.

## Finding and change

**P1, fixed:** Best Shot read Photo Intelligence metadata using a hard `.limit(40)` even when date-ranged Grouping produced more members. Photos after the first 40 could be scored with neutral/default Intelligence values (and default sharpness), skewing Dataset B/C scene ranking. The lookup now uses the unique IDs from all grouped members in 200-photo query batches and fails safely if metadata retrieval fails. `BEST_SHOT_VERSION` was bumped to invalidate selection/cache fingerprints. No image/API work is added by this change.

**P1, follow-up:** `assessAlbumGeneration` is only connected to the dev E2E audit path, not the regular production creation action. Existing per-spread safety checks remain, but a whole-book audit is not an enforced production generation gate. Do not wire stricter blocking behavior without real-photo evidence and a tested user-facing fallback.

## Product verdict

**C — NOT READY for the Task078 acceptance claim.** This is an evidence verdict, not a claim that generated albums are visually bad: there is no real-photo Dataset A/B/C, authenticated Viewer/Editor/Print session, user acceptance, or measured Direct Accept. The Task058 reports also mark authenticated real-Album review incomplete. “写真を入れるだけで良いアルバムになり、ほとんど直さなくてよい” has not been demonstrated, so READY would be unsupported.

## Automated verification

- `node --test tests/*.test.mjs`: 988 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors, 12 warnings in unrelated existing files.
- `npm run build`: passed.
- `git diff --check`: passed.

## Remaining steps

Use a dedicated test account/pet and user-approved real photo set; do not use a production user's existing photo library without consent. Include the requested 30–40, 60–80, and ~100 photo groups and mark user-mandatory images before generation. Run through candidate readiness, Viewer, optional Editor, Print Preview only; do not order. Capture click/time/wait/edit/Direct Accept, missing/bad selection reasons, all ten ratings, and costs. Revisit the generation-wide audit gate only after these observations.
