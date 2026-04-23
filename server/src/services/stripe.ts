import Stripe from 'stripe';

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

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) return null;
  return { url: session.url };
}
