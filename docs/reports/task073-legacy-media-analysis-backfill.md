# Task073 Legacy Media / Analysis Backfill

## Audit counts

Remote production data was audited in read-only batches of 5. No IDs, user data, paths, captions, or signed URLs were printed.

| Classification | Count before small verification |
|---|---:|
| Eligible photos | 57 |
| Thumbnail missing | 24 |
| Preview missing | 57 |
| Any media missing | 57 |
| No analysis row | 0 |
| Current semantic row missing overallScore | 57 |
| Old semantic version only | 0 |
| Current Subject Geometry missing | 2 |
| Legacy metadata/fingerprint | 0 |
| Requires external analysis for some missing result | 2 |
| Fully ready | 0 |

The first controlled analysis batch attempted at most 5 items: 4 were updated and 1 failed in isolation. A second run with a one-item cap updated 0 items and isolated the same failing candidate; the audit then reported 53 remaining overallScore rows. Existing successful rows were not duplicated.

## Media backfill

The existing user-triggered `PhotoThumbnailBackfill` remains the media execution path. It:

- uses batches of 5 and stable `created_at + id` cursor ordering;
- generates the same 400px WebP thumbnail and 1600px WebP preview as normal upload;
- uploads directly from the browser to private Storage with signed upload tokens;
- validates size, MIME, path, owner and pet scope before DB finalize;
- skips an existing valid thumbnail/preview and keeps originals unchanged;
- isolates per-item failures and supports rerun.

Task073 adds an aggregate audit instead of starting media conversion automatically. Remote media was not bulk-generated.

## Analysis backfill

`legacy-backfill.ts` separates current, compatible legacy, deterministically recoverable, and external-analysis-required states. It does not call OpenAI.

The controlled score recovery requires all of:

- current semantic success row;
- current source fingerprint;
- current valid Subject Geometry result;
- readable original bytes;
- deterministic current technical scoring.

It combines stored semantic + stored geometry + locally measured technical signals through the existing `buildPhotoIntelligence` scoring logic. It only adds `overallScore` to the same validated semantic payload. No semantic labels, crop geometry, version, fingerprint, album, or print data are changed.

## Score / geometry policy

- If all six canonical score axes already exist, `computeOverallScore` can recover deterministically.
- If stored semantic and geometry exist, original bytes may be downloaded once to recover technical signals and the score without Vision.
- Missing inputs are never replaced with guessed values.
- Geometry is accepted only when `parseStoredGeometry` validates stored coordinates.
- A center-crop UI fallback is never persisted as analysis truth.
- Old versions may be classified compatible for reporting, but are not relabeled as current.
- Two photos lacking current geometry remain external-analysis candidates; Task073 did not invoke Vision for them.

## Batch model and cost protection

- Default batch: 5; hard maximum: 10.
- The audit itself uses keyset pagination on `created_at + id`; reruns are safe because completed score rows are skipped.
- Dry-run is the default; writes require explicit `--apply-analysis`.
- Apply also requires an explicit item cap (default 5, maximum 10).
- Failed items do not roll back or block successful items.
- Existing overallScore rows are skipped on rerun.
- Analysis recovery downloads an original only for a missing, otherwise recoverable score.
- Audit probes deterministic preview objects but creates no signed URLs.
- No full-library Vision, Smart Crop, Story, Album, or Candidate regeneration occurs.

## Integrations

Recovered `overallScore` stays in the existing current `photo_analysis_results` payload, so Best Shot, Memory Search, Annual eligibility, Anniversary comparison, and Album Candidate readers pick it up through their existing queries. Existing materialized, accepted, ordered, and finalized albums and all print snapshots remain unchanged.

## Migration status

No Task073 migration was needed. Existing photos, Storage buckets, analysis table, unique identity, and private access policies were reused. Task072 migration remains the latest remote migration; pending migrations are zero.

## Remote verification

- Read-only aggregate audit: passed, 57 photos, batch size 5.
- Controlled deterministic score recovery: 4 success / 1 isolated failure.
- Rerun check: 0 duplicate updates; missing count decreased from 57 to 53.
- Vision/API calls: 0.
- Media mutations: 0.
- Album/order/print mutations: 0.
- Keyset-cursor dry-run after implementation: passed with the same 57-photo aggregate and no duplicate/omitted rows.

## Verification

- Full test suite: 960 passed / 0 failed.
- TypeScript (`npx tsc --noEmit`): passed.
- Production build (`next build --webpack`): passed.
- Task073 scoped ESLint: passed.
- `git diff --check`: passed.
- Known environment warning: Next.js reported that the current x86-64 Node.js is running through Rosetta 2 on Apple Silicon; it did not affect the build result.

The isolated failure is intentionally left pending because its source could not meet the deterministic recovery requirements. No guessed score was stored.

## Remaining issues

- 53 scores remain to be processed in later bounded batches after review.
- 2 photos require a separately approved analysis run because current Subject Geometry is unavailable.
- 24 thumbnails and 57 previews remain for user-triggered browser backfill; automatically downloading all originals was intentionally avoided.
- Storage `info` audit is per eligible photo; this is acceptable for an operator dry-run but should not be used on a request path or run at unbounded scale.

## Safety

No commit or push was performed. No bulk Vision operation, album regeneration, print mutation, order mutation, or destructive media operation was performed.
