# Task077.2 Billing Cancellation State UX

- Date: 2026-10-09
- Branch: `feature/task077-2-billing-cancellation-state-ux`
- Base/main: `b94daa0d26dd5ce109bfb638883377de3ac646c2`
- Commit: `370c1e0` (`fix: clarify scheduled subscription cancellation`)
- Push: pending at report creation; pushed to the same feature branch after this report commit.

## Issue and cause

The Billing page already read `status`, `current_period_end`, and `cancel_at_period_end` from the authenticated user's `user_subscriptions` row. It only used `status` for “契約状態”; for an active period-end cancellation, that remained “有効”. Although the date label changed to “利用終了予定日”, it did not clearly say renewal would stop or that PLUS remained available through the date.

## Display rules and implementation

Added `getBillingSubscriptionPresentation` as a pure display helper. The Webhook-synchronized database remains the source of truth; Billing does not call Stripe directly.

- PLUS, `cancel_at_period_end=false`: status “有効”; with a valid period end, label “次回更新日”.
- PLUS, `cancel_at_period_end=true`: status “解約予定”; with a valid period end, label “利用終了日” and “この日まではPLUSをご利用いただけます”. “次回更新日” is not returned or rendered.
- FREE: retains existing FREE plan UI and shows no subscription date even if stale subscription fields are present.
- Missing/invalid `current_period_end`: no date label/value; scheduled cancellation status remains “解約予定”, without an invented date or date-specific notice.

The scheduled-cancellation notice uses a restrained warning surface and `role="status"`/`aria-live="polite"`; meaning is conveyed in text, not color alone. The existing “支払い・契約を管理” Customer Portal button remains visible for PLUS when a stored Stripe customer is available. No in-app resume behavior was added.

## Tests and browser verification

- Added five focused tests for active renewal, period-end cancellation, FREE/stale flag, null/invalid period end, and Portal action retention.
- Full suite: 992 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: 0 errors; 12 existing warnings in unrelated files.
- `npm run build`: passed.
- `git diff --check`: passed.
- Local Browser at 375, 390, and 430px showed the unauthenticated `/settings/billing` route returning to `/login?next=/settings/billing` with no horizontal overflow. No authenticated test session was available, so the full Billing visual state was not browser-rendered; the PLUS/FREE states and exact text are covered by local fixture tests.

## Git status

Implementation commit: `370c1e0`. The implementation and this report are pushed to `origin/feature/task077-2-billing-cancellation-state-ux`. Main was not merged or changed by Task077.2.
