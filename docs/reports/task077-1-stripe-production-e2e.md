# Task077.1 Stripe Production Subscription E2E

- Date: 2026-10-09
- Branch: `feature/task077-1-stripe-production-e2e`
- Base/main: `b94daa0d26dd5ce109bfb638883377de3ac646c2`
- Result: **NO-GO / production charge not attempted**

## Production baseline

Task077 commit `5e6fc43` is an ancestor of current `main`; local main and origin/main were synchronized before creating this branch. GitHub records a Production deployment for main SHA `b94daa0d26dd5ce109bfb638883377de3ac646c2` with status `success`.

At branch creation, the worktree contained a pre-existing untracked Japanese-named `docs/` directory. It was preserved and not staged; thus the worktree was not strictly clean at start.

Production `https://www.uchinoco.app/pricing` returned 200 and displayed FREE/PLUS and `¥680/月`. `/settings/billing` returned to `/login?next=/settings/billing` without authentication; protected `/home` also returned to `/login`. These checks verify the public UI and auth boundary only; they do not prove a production Price or live Checkout configuration.

## Access and safety boundary

The Stripe Dashboard browser session was unauthenticated. Stripe CLI authentication was available but its selected context was a sandbox, with no live account authorized. A live Product/Price query was rejected because the CLI was in sandbox mode. Vercel CLI was unavailable and the Vercel Dashboard session also requires sign-in.

Therefore no Vercel Production environment values or presence checks could be read, including `STRIPE_SECRET_KEY`, `STRIPE_PLUS_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PRINT_COMMERCE_MODE`, and `PRINT_PROVIDER`. No secret values were displayed or recorded. The code defaults Print commerce to `disabled` and the provider fallback to `mock`; explicit Production environment settings remain unverified.

## Required checks not completed

- **Product / Price:** Production Product `UCHINOCO PLUS`, active `¥680/month` Price, and mapping to Production `STRIPE_PLUS_PRICE_ID` were not verified. The public page label is not evidence of Stripe live configuration.
- **Restricted Key:** Production Restricted Key status and permissions were not verified. Required API access remains Checkout Sessions `Write`, Subscriptions `Read`, Billing Portal Sessions `Write`, Customers `Read`; add Customers `Write` only if a concrete Checkout error requires it. No full-access key change was made.
- **Webhook:** Production endpoint and its four event subscriptions were not inspected or changed. Required events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Signing-secret equality with Production configuration is unverified.
- **Customer Portal:** Production configuration was not inspected or enabled. App code provides a server-side portal session using the authenticated user's stored customer ID; dashboard permissions/configuration are unverified.
- **FREE test account / Checkout:** No Production FREE test account session was available. Checkout was not started; no payment or card data was entered.
- **Webhook delivery / Supabase sync:** No Production subscription/webhook was created; no delivery, DB status, PLUS entitlement, period end, or cancellation state was observed.
- **Portal / cancellation / downgrade:** Not attempted. No Production customer, subscription, or user data was changed or deleted.
- **Production logs:** Vercel/Stripe logs were inaccessible without Dashboard authentication; no log-level production verification was possible.

## Automated verification

- `node --test tests/*.test.mjs`: 987 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors; 12 warnings in existing unrelated files.
- `npm run build`: passed.
- `git diff --check`: passed.

## Decision and remaining steps

**NO-GO.** Do not infer a successful live subscription from the public price label or deployment status. No live charge was attempted because the necessary live Stripe/Vercel access and a safe Production FREE test account were unavailable.

To resume Task077.1, authenticate directly to the Production Stripe and Vercel Dashboards (do not paste secrets into chat). Verify the live Product/Price and environment names without exposing values; confirm least-privilege Restricted Key permissions; ensure the four webhook events and signing secret are configured; enable the Customer Portal capabilities; then use a dedicated FREE test account and the account owner's explicitly approved payment method to perform one live subscription, portal, cancellation, webhook, and downgrade cycle. Confirm existing pets/photos/albums/family data remain present. Record only event/status outcomes and redacted identifiers.
