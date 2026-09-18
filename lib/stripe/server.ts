import "server-only";

import Stripe from "stripe";

/**
 * Returns a Stripe client configured with STRIPE_SECRET_KEY.
 * Throws clearly if the key is missing so callers fail before touching the DB.
 *
 * Use ONLY in:
 *   - Order creation Server Action (Task045-3b)
 *   - Stripe webhook handler (Task045-3c)
 *
 * Never expose STRIPE_SECRET_KEY to Client Components or logs.
 */
export function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}

/** True when STRIPE_SECRET_KEY is present in environment. */
export function hasStripeKey(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
