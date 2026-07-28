// api/register.js
// Prevents the same email from registering (and getting a fresh 7-day free
// trial) more than once, regardless of device, browser, or incognito mode
// — because the check happens server-side, keyed only by email, in Vercel
// KV. This ALSO stores the generated PIN codes server-side, so the person
// can log in / recover them from any device via /api/login-pin and
// /api/resend-pin.

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const body = request.body || {};
  const email = (body.email || '').toString().trim().toLowerCase();
  const parentName = (body.parentName || '').toString().trim();
  const childPin = (body.childPin || '').toString().trim();
  const parentPin = (body.parentPin || '').toString().trim();
  const age = body.age || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Invalid email.' });
  }
  if (!childPin || !parentPin) {
    return response.status(400).json({ error: 'PIN codes required.' });
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('Vercel KV is not configured.');
    // Fail open: don't block a real registration just because the store is
    // briefly unavailable — worst case someone gets one extra trial.
    return response.status(200).json({ alreadyRegistered: false, enforced: false });
  }

  const key = `registered:${email}`;

  try {
    const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getData = getRes.ok ? await getRes.json() : { result: null };

    if (getData.result) {
      // Already registered before (this device/browser or any other).
      return response.status(200).json({ alreadyRegistered: true, enforced: true });
    }

    // First time we've seen this email — store the account record
    // (including PIN codes) so future logins/recoveries work from any device.
    const record = {
      registeredAt: Date.now(),
      parentName,
      childPin,
      parentPin,
      age,
    };

    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });

    return response.status(200).json({ alreadyRegistered: false, enforced: true });
  } catch (e) {
    console.error('Failed to check/record registration in KV:', e);
    return response.status(200).json({ alreadyRegistered: false, enforced: false });
  }
}
