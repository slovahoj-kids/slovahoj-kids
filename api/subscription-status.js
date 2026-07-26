// api/subscription-status.js
// The browser calls this to find out whether a given email has an active
// paid subscription, according to the server-side record built by
// stripe-webhook.js — NOT according to anything the browser itself claims
// (localStorage is only used for the free trial flag, which isn't worth
// protecting this way).

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  const email = (request.query?.email || '').toString().trim().toLowerCase();
  if (!email) {
    return response.status(400).json({ error: 'Missing email.' });
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('Vercel KV is not configured.');
    return response.status(500).json({ error: 'Not configured.' });
  }

  try {
    const kvRes = await fetch(`${url}/get/${encodeURIComponent(`sub:${email}`)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!kvRes.ok) {
      return response.status(200).json({ active: false });
    }
    const data = await kvRes.json();
    if (!data.result) {
      return response.status(200).json({ active: false });
    }
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    const active = record && record.status === 'active';
    return response.status(200).json({
      active: !!active,
      status: record ? record.status : 'none',
      currentPeriodEnd: record ? record.currentPeriodEnd : null,
    });
  } catch (e) {
    console.error('Failed to read subscription status from KV:', e);
    return response.status(500).json({ error: 'Failed to check subscription status.' });
  }
}
