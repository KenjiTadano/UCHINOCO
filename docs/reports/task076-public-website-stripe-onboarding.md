# Task076 Public Website / Stripe Onboarding Readiness

- Date: 2026-10-08
- Branch: `feature/task076-public-website-stripe-onboarding`
- Base: `origin/main` at `566b812159a645e8d96e99f14e279c7414e78271`
- Implementation commit: `c580824`

## Summary

Replaced the root authentication redirect with an unauthenticated public landing page. Added public Pricing, Contact, and Legal pages; connected Privacy and Terms to a shared public header/footer; and added canonical, Open Graph, Twitter, and robots metadata. Existing favicon remains in use.

## Public pages and Stripe suitability

- `/`: explains UCHINOCO, photo intake and AI organization, best shots, AI Album, search, Year in Review, family sharing, PLUS, and current Print status. Logged-in visitors receive an app CTA; visitors without a session receive signup and login links.
- `/pricing`: presents FREE and PLUS features. It does not publish a PLUS amount because a production price is not verified.
- `/contact`: publishes the service name and guidance for bugs, billing, and account/data requests. No email or other contact channel is published because a production contact address is not confirmed; response timing is explicitly pending.
- `/legal`: lists the seller, location, contact, price, additional charges, payment, timing, provision, cancellation, refund, and subscription fields. Unverified operator/legal details remain marked for operator confirmation. No personal name or address was exposed.
- `/privacy` and `/terms`: remain public, now use the shared navigation, no longer advertise an unverified email, and clarify that Production Print orders are not currently accepted.

Public pages render without login. However, the current contact method and legally verified seller information are not yet available, so Stripe website suitability is **partially prepared, not fully cleared**. The public site does not claim that a photobook can currently be ordered.

## Pricing and Print

FREE features reflect current entitlements, including photo addition, Photo Intelligence, UCHINOCO NOW, AI Album creation/editing, basic search, and Print preview/data preparation. Physical Production Print purchase is identified as unavailable/preparing. PLUS features are listed without an invented amount; price and application conditions remain under confirmation.

## Authentication and indexing

`/` no longer redirects. The existing `(app)` layout still redirects unauthenticated `/home` and `/search` requests to `/login`; signup/login routes are unchanged. Robots allows the public pages and disallows app, auth, dev, and API paths.

## Verification

- `node --test tests/*.test.mjs`: 979 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm run lint`: 0 errors; 12 existing warnings in unrelated files.
- `git diff --check`: passed.
- Local browser: `/`, `/pricing`, `/contact`, `/legal`, `/privacy`, `/terms` returned HTTP 200 without a session.
- Local browser: unauthenticated `/home` and `/search` redirected to `/login`.
- Mobile browser: all six public pages checked at 375, 390, and 430 CSS pixels; no horizontal overflow. Header login link, canonical links, and Open Graph titles were present.
- Secret/price/Print-claim assertions are included in `tests/task076-public-website.test.mjs`.

## Production and remaining items

At verification time `https://www.uchinoco.app` still redirected to `/login`. This branch was not merged or deployed, as required; production behavior therefore remains unchanged. A production-domain check after an approved deployment is still required.

Before treating the website as fully Stripe-ready or starting paid sales, the operator must confirm and publish the contact channel and response estimate, seller identity and publishable address, legally reviewed sales/subscription/cancellation/refund terms, and production price/charges/payment timing. Production Print provider and availability must also be confirmed before displaying an order CTA. These values were intentionally not inferred or fabricated.
