// api/session-check.js
// Polled periodically by the client (see startSessionPolling in app.js) to
// find out whether this device's session token is still the current one
// for this account. If another device has since claimed a newer token
// (see api/session-claim.js), this returns valid:false and the client logs
// itself out.

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  const email = (request.query?.email || '').toString().trim().toLowerCase();
  const token = (request.query?.token || '').toString();
  if (!email || !token) {
    return response.status(400).json({ error: 'Missing email or token.' });
  }

  const url = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!url || !kvToken) {
    // Fail open, same reasoning as session-claim.js.
    return response.status(200).json({ valid: true, enforced: false });
  }

  try {
    const kvRes = await fetch(`${url}/get/${encodeURIComponent(`session:${email}`)}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    if (!kvRes.ok) {
      return response.status(200).json({ valid: true, enforced: false });
    }
    const data = await kvRes.json();
    const storedToken = data.result;
    // No session on record (expired or never claimed) -> don't force a
    // logout over that; just say valid so we don't fight with normal usage.
    if (!storedToken) {
      return response.status(200).json({ valid: true, enforced: false });
    }
    return response.status(200).json({ valid: storedToken === token, enforced: true });
  } catch (e) {
    console.error('Failed to check session in KV:', e);
    return response.status(200).json({ valid: true, enforced: false });
  }
}
