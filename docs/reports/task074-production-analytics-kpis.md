# Task074 Production Analytics & Monetization KPIs

## Existing analytics audit

The existing append-only `album_analytics_events` model remains the source of truth for album quality. It already records generation, view, acceptance, edit mutations, decoration decisions, print preview, checkout start, new-photo suggestion and placement. Direct Accept and Edit Distance continue to use the Task060/061 definitions in `lib/album-analytics.ts` and `lib/album-quality.ts`; no parallel album events were introduced.

The previous gap was cross-product measurement: payment/subscription, Search and Family had no shared privacy-bounded event table or production-wide server aggregate. `/dev/album-quality` also reads only the current user's album events and intentionally remains a quality-debug view.

## KPI definitions

- **Direct Accept Rate:** distinct generated draft versions accepted with `DIRECT_ACCEPT` / distinct generated draft versions.
- **Edit Distance:** the existing weighted Task060 definition (swap 3, layout 2, crop/text 1, stamp/decoration/background 0.5), averaged at acceptance.
- **Album Completion:** generated → viewed → accepted using distinct draft/album identities.
- **Print Funnel:** accepted → print preview → checkout started → payment success → print order/job created. Fulfillment readiness is counted from real `print_jobs`; no shipped/delivered event is fabricated.
- **FREE → PLUS:** upgrade viewed → checkout started for upgrade → subscription activated. Active user plan breakdown is based on recent `auth.users.last_sign_in_at` and current subscription truth.
- **Search Value:** opened, result opened, empty. Query text is never persisted.
- **Family Value:** invite sent, invite accepted, family photo batch added, activity viewed.

Each rate carries its numerator, denominator and sample. `n < 10` is `insufficient data`; no improvement/regression conclusion is produced from a small sample. MRR and LTV remain unavailable because revenue/cohort inputs are not estimated.

## Event taxonomy and write safety

`lib/product-analytics.ts` centrally defines stable snake_case cross-product event names. `album_analytics_events` remains unchanged for existing album events. New `product_analytics_events` is append-only for authenticated clients: own INSERT only, no SELECT/UPDATE/DELETE grant. A unique `(user_id, event_type, event_key)` partial index deduplicates webhook/retry-sensitive events.

`recordProductAnalyticsEvent` treats analytics as best effort. Constraint, network or duplicate errors never fail the primary product action; `23505` is success-equivalent. Subscription/payment events derive dedupe keys from verified Stripe event/session identifiers through SHA-256 and never store raw payment data.

## Privacy boundary

The application recursively rejects forbidden analytics payload keys. The database additionally allows only an empty payload or aggregate `photo_count`, and rejects email, names, captions, search text, URLs/paths, payment/shipping data, invite tokens, credentials and photo IDs. Search links record only the fact that an owned result was opened. No external analytics vendor was added.

## Aggregation and internal view

`get_production_kpis(p_since)` performs aggregation inside PostgreSQL for 7 days, 30 days or all time. Execute permission belongs only to `service_role`; individual rows are not fetched into the browser. `/dev/metrics` calls it from a Server Component after normal authentication. In production it returns Not Found unless the authenticated UUID is present in server-only `UCHINOCO_INTERNAL_USER_IDS`.

The view shows Album Quality, monetization, Print, Search and Family cards with sample size and insufficient-data state. It does not expose user IDs or event rows.

## Migration and remote verification

- Applied migration: `20261007160000_production_analytics_kpis.sql`.
- Local/remote migration history: matched after apply; pending migrations: 0.
- Database types regenerated from the linked remote project.
- Service-only aggregate RPC: PASS.
- Aggregate fixture delta: exactly +1.
- Duplicate event: rejected with `23505`.
- Forbidden payload: rejected with `23514`; persisted forbidden rows: 0.
- Fixture cleanup: PASS.

## Event coverage

- PLUS page/view and successful checkout-session creation.
- Verified Stripe subscription activation/cancellation.
- Verified print payment and print-job creation boundary.
- Search open, empty and owned photo result open.
- Family invite send/accept, member photo batch and family activity view.

Existing `print_preview_opened`, `checkout_started`, album acceptance and all detailed edit events remain in the existing album event table.

## Verification

- Task074 focused tests: 10 passed / 0 failed.
- Full suite: 970 passed / 0 failed.
- TypeScript (`npx tsc --noEmit`): passed.
- Production build (`next build --webpack`): passed.
- Task074 scoped ESLint: passed with one non-code warning because `.env.example` has no matching ESLint configuration; errors: 0.
- `git diff --check`: passed.
- `npm audit --audit-level=high`: existing dependency tree reports 8 high and 1 critical advisory (including Next.js 16.3.5, `sharp`, `brace-expansion`, `braces` and `source-map-js`). No dependency update was mixed into Task074.
- Known environment warning: Node.js is running through Rosetta 2 on Apple Silicon; the build completed successfully.

## Remaining issues

- Production access to `/dev/metrics` requires configuring `UCHINOCO_INTERNAL_USER_IDS`; absence safely denies everyone.
- Historical Search/Family/subscription/payment events are not inferred or backfilled.
- MRR/LTV and shipped/delivered KPIs remain intentionally unavailable.
- Product event counts are operational funnel events, not attribution or cohort analysis.
- The dependency advisories above should be remediated in a dedicated dependency-update task with regression verification before production release.
