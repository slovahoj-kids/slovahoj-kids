// api/session-claim.js
// Single Active Session Lock (anti resale/sharing).
//
// Called every time someone successfully enters a PIN (parent or child) or
// completes registration. It stores a fresh random session token in Redis
// under the account's email, overwriting whatever token was there before.
// Any other device that was already "inside" with the previous token will
// notice the mismatch next time it polls /api/session-check and gets
// signed out automatically — so a PIN shared with a second family gets the
// first family logged out within ~20-30 seconds of the second family
// logging in, rather than both using the account at once.
//
// This is a lightweight approach (short polling, not push/WebSocket), which
// means there's a small delay before the kicked-out device notices — good
// enough to make casual account reselling impractical without needing a
// realtime service.

function randomToken() {
  // 32 hex chars, no external deps needed.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h; a stale/abandoned session just expires

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

  const email = ((request.body || {}).email || '').toString().trim().toLowerCase();
  if (!email) {
    return response.status(400).json({ error: 'Missing email.' });
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('Vercel KV is not configured.');
    // Fail open: if the session store is down, don't lock legitimate users
    // out of a product they're paying for.
    return response.status(200).json({ token: randomToken(), enforced: false });
  }

  const sessionToken = randomToken();

  try {
    await fetch(
      `${url}/set/${encodeURIComponent(`session:${email}`)}/${encodeURIComponent(sessionToken)}?EX=${SESSION_TTL_SECONDS}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.status(200).json({ token: sessionToken, enforced: true });
  } catch (e) {
    console.error('Failed to claim session in KV:', e);
    return response.status(200).json({ token: sessionToken, enforced: false });
  }
}
