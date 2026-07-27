// api/save-push-subscription.js
// Stores a browser's Push subscription (and the parent's chosen reminder
// schedule) in Vercel KV, keyed by email, so a scheduled server job
// (api/send-scheduled-pushes.js) can send a real push notification even
// when the site isn't open — unlike the old in-page-only Notification API
// usage, which only ever worked while a tab was open on that exact device.

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.result) return null;
  try {
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch {
    return data.result;
  }
}

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

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return response.status(500).json({ error: 'Storage not configured.' });
  }

  const body = request.body || {};
  const email = (body.email || '').toString().trim().toLowerCase();
  const subscription = body.subscription;
  const schedule = body.schedule || { days: [], time: '' };

  if (!email || !subscription || !subscription.endpoint) {
    return response.status(400).json({ error: 'Missing email or subscription.' });
  }

  try {
    await kvSet(`push:${email}`, {
      subscription,
      schedule,
      lastSentDate: null,
      updatedAt: Date.now(),
    });

    // Maintain a simple list of subscribed emails so the daily cron job can
    // enumerate everyone without needing a KV "scan all keys" operation
    // (the Upstash REST API doesn't offer a cheap way to list keys by
    // prefix, so we keep our own small index instead).
    const list = (await kvGet('push_subscribers_list')) || [];
    if (!list.includes(email)) {
      list.push(email);
      await kvSet('push_subscribers_list', list);
    }

    return response.status(200).json({ ok: true });
  } catch (e) {
    console.error('Failed to save push subscription:', e);
    return response.status(500).json({ error: 'Failed to save subscription.' });
  }
}
