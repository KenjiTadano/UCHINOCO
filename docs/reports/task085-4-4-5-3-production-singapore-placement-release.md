# Task085.4.4.5.3 — Production Singapore placement release

Status: pre-release verification PASS; Production deployment/acceptance pending.

## Baseline and scope

Read-only preflight confirms Production READY, source/main `6a8170312dc544392d84d2d7a7be356fc785b471`, configured region `iad1`. Production environment and Secret metadata unchanged from the preceding acceptance. Private deployment/rollback evidence remains local-only under ignored outputs; no credentials were retrieved or recorded.

This candidate starts at that exact Production source. The only runtime/config change is root `vercel.json` with `regions: ["sin1"]`. No application, diagnostic, package, lockfile, auth, RLS, image, generation, Recovery, or print-quality change is included. Existing performance/comparison branches and local modifications are excluded.

## Verification

On the exact region-only candidate: tests 1161/1161 PASS; TypeScript PASS; lint PASS (0 errors, 12 pre-existing warnings); Next.js 16.4.0 production build PASS; git diff --check PASS. Build uses synthetic public environment placeholders, not Production credentials. Exact staged net diff is limited to this report and vercel.json. Application/package/lockfile trees remain byte-identical to baseline.

## Release and rollback

Use main Git Integration only, never manual deployment or Preview promotion. Require READY, exact deployed Git SHA, Production domain assignment, and configured `sin1`. Actual process region remains UNVERIFIED unless existing runtime output proves VERCEL_REGION; ingress is not evidence. No diagnostic will be added.

The immediately preceding READY Production iad1 deployment is the rollback baseline. Hobby permits rollback to the immediately previous Production; rollback requires the existing approval procedure. No data/schema migration or data rollback is involved. Instant Rollback disables automatic Production-domain assignment; restoring normal auto-deploy would require explicit undo-rollback/promotion approval. Do not delete comparison deployments, branch-scoped Secret, or branches.

## Acceptance plan

After deployment, check authenticated Home, Preview, edit list, Page Editor, reachable Complete, and Print with the existing real 24P fixture. Check all spread images/thumbnails, identity/crop/background/elements, secondary-pet candidate, reset controls, and reload. Perform one safe background change, confirm save and navigation/persistence, then restore it; compare revision/clientSeq and unchanged frame/photo/crop/layout identity read-only. Never execute PDF, checkout, or order. Print inspection and blocking state must remain unchanged.

Collect approximately three browser samples per route without adding diagnostics. Distinguish automation-observed E2E bounds from unavailable exact shell/Primary/full markers. Investigate Preview >5s, Print >10s, >30s, incomplete delivery, or errors; security/save/runtime failure means HOLD.

## Known limitations

Genuine No-Crop/imageFit=contain browser acceptance: **UNVERIFIED due to fixture absence**. Wrong-owner live browser acceptance: UNVERIFIED without a second account. Neither is relabelled PASS. Actual process region may remain UNVERIFIED on this unchanged Production source.

Production acceptance and next recommendation: pending. No automatic follow-on task.

Configuration reference: [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region).
