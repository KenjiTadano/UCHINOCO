# Task076.1 Production Deploy & Stripe Website Verification

- Date: 2026-10-08
- Production site: https://www.uchinoco.app
- Task076 implementation: `c580824` (`feat: add public website for stripe onboarding`)
- Production code commit on main: `879976837edf5e0beb37eab1f847649945ca894d`
- Task076.1 report commit on main / origin/main: `431946eae2a07f4ee013483236cfec39d7c7bc5b`
- Branch: `feature/task076-public-website-stripe-onboarding`

## Git state

Task076 implementation commit `c580824` is an ancestor of both local `main` and `origin/main`. Integration was linear/fast-forward, so no distinct merge commit was created. Task076.1's report-only commit `431946e` was pushed to `origin/main`; local and origin main now match. The existing untracked Japanese-named `docs/` directory was present and left untouched.

## Production deployment

GitHub deployment record `6933717360` is `Production`, targets SHA `879976837edf5e0beb37eab1f847649945ca894d`, and has status `success` / “Deployment has completed” at 2026-10-08 10:59:37 UTC. Its deployment URL is `https://uchinoco-kemu49k2x-tadanokenjis-projects.vercel.app`.

The canonical domain returned HTTP/2 200 from Vercel and rendered the Task076 public landing page. The production deployment target URL and GitHub status were confirmed; direct Vercel Dashboard inspection and opening the target URL were blocked by Vercel SSO in this browser session. Thus the provider status record is successful, while independent alias mapping in the Dashboard was not directly inspected.

After the report-only main push, the six public routes were rechecked and again returned 200; `/home` and `/search` still redirected to `/login`.

## Public routes and authentication

Production unauthenticated requests returned 200 for `/`, `/pricing`, `/contact`, `/legal`, `/privacy`, and `/terms`. `/` remained at the root and did not redirect to login. Unauthenticated `/home` and `/search` redirected to `/login` (307 followed by login page 200).

The six public pages contain page titles, descriptions, canonical URLs, and Open Graph titles. Production `/robots.txt` allows the public pages and disallows auth, app, dev, and API paths. Shared footer links provide Pricing, Privacy, Terms, Contact, Legal, and Login.

## Content and mobile

The public pages explain UCHINOCO as a pet photo organization and AI Album service; distinguish FREE and PLUS; say Production Print orders are not currently accepted; do not show an unconfirmed PLUS price; and do not publish an unconfirmed email, personal name, or address.

All six public routes were checked at widths 375, 390, and 430 CSS pixels (18 route/viewport combinations). Every request returned 200, document width matched the viewport, the mobile header login link was visible, and the footer was present.

The URL suitable to enter in Stripe’s “Business website” field is `https://www.uchinoco.app`. The site is publicly accessible and identifies the service, features, plan policy, and legal/contact pages. Stripe acceptance is not guaranteed: the Contact page has no confirmed contact channel or response estimate, and operator/seller disclosures remain pending verification.

## Print safety

`lib/print/commerce-readiness.ts` defaults `PRINT_COMMERCE_MODE` to `disabled`. Unconfirmed provider/product/spec/price gates keep external fulfillment and live Print checkout fail-closed. The public site has no active Print purchase CTA and clearly identifies Print as unavailable/preparing. Production’s explicit environment-variable value could not be read without Vercel Dashboard access; the code default and release gates were verified.

## Automated verification

- `node --test tests/*.test.mjs`: 979 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm run lint`: 0 errors; 12 warnings in unrelated existing files.
- `git diff --check`: passed.

## Remaining items

- Confirm `PRINT_COMMERCE_MODE=disabled` explicitly in Vercel Production (the code default is disabled).
- Confirm the production deployment’s canonical-domain alias in Vercel Dashboard; Dashboard/target access requires an authenticated Vercel session.
- Have the operator confirm and publish a real inquiry channel and response estimate, and complete seller identity/location and sales/subscription/cancellation/refund disclosures before relying on Stripe review or enabling paid sales.
- Stripe form submission remains a user action.
