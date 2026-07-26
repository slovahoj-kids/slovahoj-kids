// api/create-checkout-session.js
// Creates a real Stripe Checkout Session for a subscription plan, using
// plain fetch() calls to the Stripe API (no npm packages required, to match
// the rest of this project's dependency-free /api functions).
//
// SECURITY: the browser only sends a plan id ('1_month' or '3_months'),
// never a price or amount. The actual Stripe Price ID is looked up
// server-side from a fixed whitelist below, so nobody can tamper with the
// request to pay a different (lower) amount than the real price.

const PLAN_TO_PRICE_ID = {
  '1_month': 'price_1TxOLtRLZSrXJTd8qfLBwkAL',   // SlovAhoj Kids — 1 місяць, €15/month
  '3_months': 'price_1TxOO8RLZSrXJTd8Ymad2RSM',  // SlovAhoj Kids — 3 місяці, €35/3 months
};

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return response.status(500).json({ error: 'Stripe is not configured on the server.' });
  }

  const body = request.body || {};
  const planId = body.planId;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  // Rewardful affiliate tracking id from the browser, if any. Optional,
  // stored only as opaque metadata — never trusted for anything
  // security-sensitive (it doesn't affect price, access, etc).
  const referral = typeof body.referral === 'string' ? body.referral.slice(0, 100) : '';

  const priceId = PLAN_TO_PRICE_ID[planId];
  if (!priceId) {
    return response.status(400).json({ error: 'Unknown plan.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'A valid email is required.' });
  }

  const origin = request.headers.origin || `https://${request.headers.host}`;

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('customer_email', email);
  params.set('success_url', `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/?payment=cancelled`);
  params.set('allow_promotion_codes', 'true');
  if (referral) {
    params.set('client_reference_id', referral);
    params.set('metadata[rewardful_referral]', referral);
    params.set('subscription_data[metadata][rewardful_referral]', referral);
  }

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error('Stripe Checkout session creation failed:', data);
      return response.status(502).json({ error: 'Failed to start checkout.' });
    }

    return response.status(200).json({ url: data.url });
  } catch (e) {
    console.error('Failed to create Stripe Checkout session:', e);
    return response.status(500).json({ error: 'Failed to start checkout.' });
  }
}
