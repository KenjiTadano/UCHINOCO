# UCHINOCO Production Recovery Runbook

## Purpose and authority

This runbook covers recovery of the UCHINOCO Production application, Supabase database, private Storage, Auth, and Stripe state. It does not contain credentials. Only an authorized operator with access to the Vercel, Supabase, and Stripe projects may execute recovery.

Never reset the Production database as a troubleshooting shortcut. Never restore Production merely to test this procedure. Rehearse restores in a separate staging project.

## 1. Triage and decide whether to stop writes

1. Record the incident start time in UTC and JST.
2. Check the current Vercel Production deployment, runtime error rate, affected routes, Supabase project health, Auth availability, Storage availability, and Stripe webhook delivery status.
3. Stop or restrict writes when continued writes could increase data loss, duplicate payments, duplicate orders, or irreversible album mutations.
4. Keep Print commerce disabled whenever provider or payment integrity is uncertain.
5. Do not rotate credentials until the impact and dependent services are identified. If credential exposure is suspected, follow the provider rotation procedure immediately after containing writes.

## 2. Confirm migration and release state

From a clean checkout of the commit currently deployed to Production:

```sh
git status --short
git rev-parse HEAD
npx supabase migration list
npx supabase db push --dry-run
```

Record the deployed Git commit, latest remote migration version, and whether the migration histories match. Do not push a migration during triage unless the incident commander has approved the exact change and rollback plan.

## 3. Confirm backup and PITR before restore

In the Supabase Dashboard or supported CLI:

```sh
npx supabase backups list --project-ref <production-project-ref>
```

Verify and record:

- scheduled backup availability and latest successful backup time;
- retention period;
- PITR availability and enabled status;
- earliest and latest restorable timestamps;
- the operator account authorized to restore;
- the desired recovery point before the first known bad write.

If no usable backup or PITR point is confirmed, do not start a restore. Escalate to Supabase Support and preserve current evidence.

## 4. Rehearse in staging

1. Create or select an isolated staging Supabase project.
2. Restore or copy the selected recovery point into staging using the supported Supabase workflow.
3. Apply only migrations that belong after the restored point and before the target deployed commit.
4. Configure staging-only Auth redirects, private buckets, and non-production Stripe credentials.
5. Run validation before approving a Production restore.

Never connect a staging restore to the Production Stripe webhook, Production provider order API, or Production email sender.

## 5. Production restore

Only after staging validation and explicit incident approval:

1. Announce the write freeze window.
2. Capture the final pre-restore timestamp and current deployment commit.
3. Start the Supabase-supported backup or PITR restore to the approved timestamp.
4. Do not run concurrent schema changes, backfills, photo analysis, album materialization, Stripe replay, or provider fulfillment during restore.
5. Wait for Supabase to report the project healthy before re-enabling application traffic.

## 6. Post-restore validation

Validate with isolated test accounts, not a real user's mutable data:

- Auth: signup confirmation redirect, login, session refresh, logout;
- RLS: owner, family member, non-member, and revoked-member boundaries;
- data: pets, photos, captions, favorites, album drafts, accepted/finalized albums, print snapshots, orders, subscriptions, and family membership;
- Storage: `pet-avatars`, `pet-photos`, `pet-photo-thumbnails`, and `print-files` remain private; signed URL read works only for an authorized user;
- media integrity: database paths resolve to expected private objects and no public URL was persisted;
- albums: active draft/version relationship, immutable accepted/ordered/finalized state, and print fingerprint consistency;
- Stripe: subscription and order rows match Stripe's authoritative state; do not infer paid status from redirect URLs;
- webhook: signature verification and idempotent delivery succeed with a safe test event;
- Vercel: required Production environment variables are present and runtime errors remain clear.

Do not automatically delete database rows that reference a missing Storage object. Record and repair inconsistencies through an audited process.

## 7. Resume service

1. Re-enable reads first if they were restricted.
2. Re-enable writes after Auth, RLS, Storage, album mutation, and Stripe integrity checks pass.
3. Keep Print purchase disabled until payment, immutable print snapshot, and provider fulfillment checks pass.
4. Monitor Production 5xx, Auth errors, Supabase failures, webhook failures, duplicate activity, and order state transitions.
5. Record the restored timestamp, validation evidence, affected data window, and follow-up actions without including secrets or personal data.

## 8. Abort conditions

Stop recovery and escalate when any of the following occurs:

- the recovery point is not independently confirmed;
- Production and staging project references are ambiguous;
- a restore would overwrite newer valid writes without an approved reconciliation plan;
- Auth user IDs no longer match profile/ownership records;
- private Storage authorization or signed URL boundaries fail;
- Stripe paid/order state cannot be reconciled safely;
- accepted, ordered, finalized, or printed albums would be mutated unexpectedly.
