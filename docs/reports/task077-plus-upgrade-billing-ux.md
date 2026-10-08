# Task077 PLUS Upgrade & Billing UX

- Date: 2026-10-08
- Branch: `feature/task077-plus-upgrade-billing-ux`
- Base: `origin/main` at `649e6bdd1e0d31f459bc21c222752b9d248a0920`

## Existing

- `lib/entitlements.ts` defines FREE/PLUS entitlements. Only `active` and `trialing` grant PLUS; other subscription statuses resolve to FREE.
- Task071's `user_subscriptions` stores `stripe_customer_id`, `stripe_subscription_id`, status, `current_period_end`, and `cancel_at_period_end`. Authenticated users may select only their own row. Stripe synchronization is restricted to the service-role RPC.
- `app/(app)/plus/actions.ts` already created Stripe Checkout subscriptions with server `STRIPE_PLUS_PRICE_ID`, `mode: "subscription"`, user metadata, stored customer ID when available, and email fallback otherwise. Success/cancel returns went through `/plus`; the success URL itself did not grant PLUS.
- `/api/stripe/webhook` handles `checkout.session.completed` by retrieving the subscription and syncing it. It also handles `customer.subscription.created`, `.updated`, and `.deleted`; status-to-plan updates happen in the subscription RPC. The database retains existing pets/photos/albums/family rows during downgrade.
- Existing analytics use `upgrade_viewed`, `upgrade_started`, `subscription_activated`, and `subscription_canceled`.
- Existing PlusUpsell gates covered second pet, family invitations, annual memories, anniversary history/growth, and advanced search. Album regeneration retained a server entitlement guard but its FREE screen lacked a useful upgrade prompt.
- There was no Customer Portal action or Billing page. The generic `(app)` layout redirected to `/login` without preserving the requested URL.

## Added

- `/pricing` now displays FREE/PLUS and the confirmed `¥680/月`, uses current server entitlements to show upgrade vs manage-plan UI, and records the existing `upgrade_viewed` event for signed-in FREE users.
- A shared `PlusUpgradeCta` calls the existing Checkout server action. Client form values do not supply plan, amount, or Stripe Price ID. Signup/login/email confirmation preserve a safe allowlisted return path.
- Checkout start checks auth before Stripe configuration, uses only `STRIPE_PLUS_PRICE_ID`, and redirects unauthenticated users through login back to the selected upgrade route. Existing `past_due`, `unpaid`, `incomplete`, or `paused` subscriptions with a Stripe customer are not replaced by another subscription Checkout; the user is directed to Billing/Portal.
- `/settings/billing` displays FREE/PLUS from `loadUserEntitlements`, subscription status, and the DB-synced period end when available. It is outside the generic `(app)` layout so its own auth guard can preserve `/settings/billing` as the login return path; it explicitly reuses AppShell, BottomNavigation, and the photo-analysis runner.
- Customer Portal sessions are generated server-side from the authenticated user's own RLS-protected stored customer ID. No client customer ID is accepted. Missing customer data and Portal/API failures show generic safe messages.
- FREE PlusUpsell surfaces now use the shared CTA and include “今はFREEのまま使う”. Album regeneration adds a FREE paywall prompt while retaining the existing server action entitlement check. The home profile menu links to Billing.
- Checkout return state is based on the database entitlement only. Before the webhook arrives, the page says it is checking and refreshes at most six times at 2.5-second intervals. It only says PLUS is available when `loadUserEntitlements` returns PLUS. Return views use the existing `upgrade_viewed` event with a distinct dedupe key; no new analytics schema/event was introduced.

## Webhook and authority

Required Production webhook subscriptions for Task077.1 are:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The first retrieves the attached subscription; the three subscription events sync status/period/customer/subscription IDs. `user_subscriptions` plus the webhook RPC remain the plan source of truth. Checkout query params and success URLs never change entitlements.

## Restricted Key permissions

This code path uses these Stripe API capabilities and corresponding Restricted Key permissions should be verified in Stripe Dashboard:

- Checkout Session create: Checkout Sessions `Write`
- Webhook's subscription lookup after Checkout: Subscriptions `Read`
- Billing Portal session create: Billing Portal Sessions `Write`
- Billing Portal customer association: Customers `Read`

Checkout uses an existing stored customer ID or `customer_email` (no direct Customer create/read call in the app). If Stripe requires Customer `Write` for Checkout's customer creation behavior with this restricted key, grant only that permission after confirming the exact API error. Do not replace the restricted key with a full-access secret. No key value was read or logged.

## Analytics

Existing event names are preserved: `upgrade_viewed` (Pricing/Plus page and return), `upgrade_started` (Checkout session created), `subscription_activated`/`subscription_canceled` (webhook facts). There is no dedicated checkout-return event in the Task074 schema; the return is distinguished by its dedupe key without introducing a client-authoritative purchase event or storing personal/payment data.

## Security and Print

- Entitlements and all existing server/RLS checks remain authoritative. Tests verify the server guards for pet count, family invites, annual memories, advanced search, and album regeneration.
- Billing selection is filtered by `user.id`; Portal Customer ID comes only from that row.
- The Checkout action accepts no client price/amount/plan. PLUS activates only through webhook-backed DB status.
- Production Print remains disabled by `lib/print/commerce-readiness.ts`'s default and existing fail-closed gates. No Print purchase CTA was enabled.
- No Stripe secrets, customer IDs, payment details, or new analytics PII are rendered or logged.

## Verification

- `node --test tests/*.test.mjs`: 987 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; `/settings/billing` appears as a dynamic route.
- `npm run lint`: 0 errors, 12 warnings in unrelated pre-existing files.
- `git diff --check`: passed.
- Task077 focused tests cover Pricing/CTA, auth allowlist, server Price ID and metadata, webhook-only upgrade, bounded return refresh, requested Plus gates, Portal ownership/fail-safe behavior, downgrade data retention, Print-disabled default, and secret leakage.
- Local Browser at 375/390/430 checked Pricing 200, ¥680, CTA and footer, with no horizontal overflow.
- Unauthenticated Pricing Upgrade submitted the existing server action and redirected to `/login?next=/plus?next=/settings/billing`; no Stripe Checkout/payment was created.
- Direct unauthenticated `/settings/billing` returned to `/login?next=/settings/billing`. Signup/Login forms retain the safe hidden `next` value.
- An authenticated FREE/PLUS user session was not available in the shared browser, so rendered Billing plan states and Portal interaction were validated structurally/build-time, not through a logged-in E2E. No Production checkout, payment, or cancellation was attempted.

## Remaining Production steps (Task077.1)

1. Confirm Production `STRIPE_PLUS_PRICE_ID` points to the active `UCHINOCO PLUS / ¥680 monthly` Price without revealing the secret value.
2. Confirm the restricted key has the endpoint permissions listed above; use least privilege and review Stripe's exact error if a permission is missing.
3. Enable/configure Customer Portal in Stripe Dashboard for payment-method update, subscription view, and cancellation; verify `Billing Portal Sessions: Write` and customer read access.
4. Configure the four webhook event subscriptions above on the correct Production endpoint, confirm signing secret is configured without exposing it, then run the agreed real Subscription Checkout → webhook → Portal → cancel → FREE E2E. Production billing was not exercised in Task077.
5. Provide an authenticated test account for browser checks of FREE Billing, PLUS Billing, and the six gated surfaces; no test account credentials were available to this run.
