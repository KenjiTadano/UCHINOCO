# Task085.3.2 — Print Preview Runtime Configuration

Status: local verification PASS; browser acceptance pending. Task085.3.1 remains HOLD until print confirmation renders successfully. Task085.4 has not started.

## Root cause and environment presence

Read-only Vercel project environment metadata shows NEXT_PUBLIC_SUPABASE_URL configured for both Preview and Production, while SUPABASE_SERVICE_ROLE_KEY is configured only for Production. No values were retrieved, compared, copied or changed. Project configuration metadata describes the current scopes, rather than independently dumping an immutable deployment's runtime environment. The existing failing Preview runtime exception, combined with its working authenticated Supabase routes, corroborates the missing service-role configuration for that Preview.

The observed path is print page → inspectAlbumPrint → imageFacts → createAdminClient. The latter throws if either variable is absent. Production has the required key configured, but key presence alone does not prove Production print acceptance; no order or checkout test was performed there.

## Dependency assessment and minimal fix

Classification B, with an environment scope difference triggering the symptom: print's original-image inspection unnecessarily uses a service-role client. It downloads the effective cover/frame originals to probe dimensions/orientation and assess existing print quality; it does not need privileged writes. The current Storage SELECT policy in the family-sharing migration permits authenticated users to read pet-photos for accessible pets. Existing owner validation and photo metadata reads already use the authenticated client. Thus the inspection can use that same client and enforce Storage RLS, including secondary pets.

imageFacts now receives the verified owner's Supabase client from its three existing callers (inspection, PDF preparation, checkout quality assessment). Source selection, original bytes, raster/orientation probing, quality gates and missing/broken-image handling are unchanged. Denied reads remain unavailable quality facts; no admin fallback is added. Album/pet/owner checks are retained. Privileged print-files writes and order/finalization operations still use their existing server-only paths and configuration; this fix does not claim that PDF generation/payment works without those separate credentials.

No environment configuration change, bucket visibility change, RLS migration, credential exposure, generation/Safety/subset/Recovery change or performance optimization is included.

## Tests and verification

Added four regression tests executing the actual inspection action with explicit I/O doubles: primary/secondary originals use the authenticated Storage client without admin construction; unauthenticated/missing-owned-album requests cannot download; RLS-denied reads stay unavailable without privileged retry; all image-fact callers reuse the owned client and privileged PDF upload remains intact. These doubles do not substitute for deployed RLS/browser acceptance.

1185/1185 full tests PASS. TypeScript PASS. Lint: 0 errors / 12 existing warnings. Build PASS; git diff --check PASS.

## Browser acceptance / persistence

Pending the Git Integration Preview for this fix. Verify Preview CTA pending/disabled → print confirmation UI, no runtime/console error; inspect quality/snapshot state without generating PDF, starting checkout or ordering. Compare album/draft status, revision, spread/frame hash, accepted-event count and order count read-only before/after. Preserve real identifiers, images and raw runtime evidence only in ignored local outputs.

## Performance and limitations

The earlier print draft.version sample of 19,503 ms remains a separate performance observation. This change does not address query latency or claim a performance improvement. Task085.4 should later include Login/navigation/Preview/Print, after this acceptance and user review. Genuine No-Crop/imageFit=contain remains UNVERIFIED due to fixture absence. No artificial fixture, main merge or Production deployment is authorized here.
