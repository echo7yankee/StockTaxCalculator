import Stripe from 'stripe';
import * as Sentry from '@sentry/node';

// Typed wrapper so callers can distinguish "Stripe API call failed" from
// "Stripe not configured" (which returns null) and from other unrelated errors.
export class StripeCheckoutError extends Error {
  readonly cause: unknown;
  readonly stripeCode: string | undefined;
  readonly stripeType: string | undefined;
  constructor(cause: unknown) {
    const code = (cause as { code?: string })?.code;
    const type = (cause as { type?: string })?.type;
    super(`Stripe checkout creation failed${code ? ` (${code})` : ''}`);
    this.name = 'StripeCheckoutError';
    this.cause = cause;
    this.stripeCode = code;
    this.stripeType = type;
  }
}

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe | null {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function getStripeInstance(): Stripe | null {
  return getStripeClient();
}

export function isStripeEnabled(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export interface CreateCheckoutArgs {
  userId: string;
  email: string;
  name?: string;
  applyLaunchCoupon: boolean;
}

export async function createStripeCheckoutSession(
  args: CreateCheckoutArgs,
): Promise<{ url: string } | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) return null;

  const clientUrl = process.env.CLIENT_URL || 'https://investax.app';
  const launchCouponId = process.env.STRIPE_LAUNCH_COUPON_ID;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: args.email,
    client_reference_id: args.userId,
    // Always create a Stripe Customer object on successful checkout. Without
    // this, one-time payments leave session.customer = null, the webhook
    // handler stores stripeCustomerId = NULL, and we lose customer-level
    // grouping in the Stripe dashboard (lifetime value, repeat-purchase
    // tracking, support lookup by email). Year-2 analytics depend on it.
    customer_creation: 'always',
    metadata: {
      user_id: args.userId,
      discount_code: args.applyLaunchCoupon && launchCouponId ? 'LAUNCH2026' : '',
    },
    success_url: `${clientUrl}/upload?welcome=1`,
    cancel_url: `${clientUrl}/pricing?canceled=1`,
  };

  if (args.applyLaunchCoupon && launchCouponId) {
    params.discounts = [{ coupon: launchCouponId }];
  }

  // Capture Stripe SDK errors at the source so they're tagged consistently
  // (regardless of which caller invokes this). The route then converts the
  // typed wrapper into a user-facing 502 without recapturing.
  let session;
  try {
    session = await stripe.checkout.sessions.create(params);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { service: 'stripe', op: 'checkout.create' },
      extra: {
        userId: args.userId,
        applyLaunchCoupon: args.applyLaunchCoupon,
        priceId,
      },
    });
    throw new StripeCheckoutError(err);
  }
  if (!session.url) return null;
  return { url: session.url };
}
