// api/stripe-webhook.js
// Receives payment/subscription events from Stripe and stores the current
// subscription status server-side (Vercel KV), so the browser can no longer
// grant itself premium access by editing localStorage.
//
// Status is always stored keyed by the customer's email (sub:<email>), since
// that's what the frontend/subscription-status.js look it up by. A separate
// customerId -> email mapping is kept so later events (renewal, cancellation,
// failed payment), which only include the Stripe customer id, can still
// find and update the right record.
//
// No npm packages used — signature verification is done manually with
// Node's built-in crypto module, and Vercel KV is accessed via its REST API
// with plain fetch(), matching the rest of this project.

import { createHmac, timingSafeEqual } from 'crypto';

export const config = {
  api: {
    bodyParser: false, // we need the raw body to verify Stripe's signature
  },
};

function readRawBody(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const receivedSig = parts.v1;
  if (!timestamp || !receivedSig) return false;

  // Reject events older than 5 minutes, to block replay attacks.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (Number.isNaN(age) || age > 300) return false;

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expectedSig = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  try {
    return timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(receivedSig, 'hex'));
  } catch {
    return false; // different lengths etc.
  }
}

function kvHeaders() {
  const token = process.env.KV_REST_API_TOKEN;
  if (!token) throw new Error('Vercel KV is not configured (missing KV_REST_API_TOKEN).');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function kvBaseUrl() {
  const url = process.env.KV_REST_API_URL;
  if (!url) throw new Error('Vercel KV is not configured (missing KV_REST_API_URL).');
  return url;
}

async function kvSet(key, value) {
  const res = await fetch(`${kvBaseUrl()}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: kvHeaders(),
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV set failed for ${key}: ${res.status} ${await res.text()}`);
}

async function kvGet(key) {
  const res = await fetch(`${kvBaseUrl()}/get/${encodeURIComponent(key)}`, {
    headers: kvHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  try {
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch {
    return data.result;
  }
}

async function updateSubscriptionByCustomerId(customerId, patch) {
  const email = await kvGet(`customer_email:${customerId}`);
  if (!email) {
    console.warn(`No email on file for Stripe customer ${customerId}; cannot update subscription record.`);
    return;
  }
  const existing = (await kvGet(`sub:${email}`)) || {};
  await kvSet(`sub:${email}`, { ...existing, ...patch, customerId, updatedAt: Date.now() });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set.');
    return response.status(500).json({ error: 'Webhook not configured.' });
  }

  const rawBody = await readRawBody(request);
  const signature = request.headers['stripe-signature'];

  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    console.warn('Rejected webhook request with invalid Stripe signature.');
    return response.status(400).json({ error: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return response.status(400).json({ error: 'Invalid JSON payload.' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = (session.customer_email || session.customer_details?.email || '').toLowerCase();
        const customerId = session.customer;
        if (email && customerId) {
          await kvSet(`customer_email:${customerId}`, email);
          await kvSet(`sub:${email}`, {
            status: 'active',
            customerId,
            subscriptionId: session.subscription,
            updatedAt: Date.now(),
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        // Stripe subscription statuses: trialing, active, past_due, canceled, unpaid, ...
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        await updateSubscriptionByCustomerId(sub.customer, {
          status: isActive ? 'active' : sub.status,
          subscriptionId: sub.id,
          currentPeriodEnd: sub.current_period_end,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await updateSubscriptionByCustomerId(sub.customer, {
          status: 'canceled',
          subscriptionId: sub.id,
        });
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await updateSubscriptionByCustomerId(invoice.customer, {
          status: 'payment_failed',
        });
        break;
      }
      default:
        // Ignore other event types.
        break;
    }
  } catch (e) {
    console.error('Error while processing Stripe webhook event:', e);
    // Still return 200 so Stripe doesn't endlessly retry an event we can't
    // process; the error is logged for us to investigate.
  }

  return response.status(200).json({ received: true });
}
