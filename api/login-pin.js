export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const email = ((request.body || {}).email || '').toString().trim().toLowerCase();
  const pin = ((request.body || {}).pin || '').toString().trim();

  if (!email || !pin) {
    return response.status(400).json({ error: 'Email and PIN required.' });
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('Vercel KV is not configured.');
    return response.status(500).json({ error: 'Server storage unavailable.' });
  }

  const key = `registered:${email}`;

  try {
    const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getData = getRes.ok ? await getRes.json() : { result: null };

    if (!getData.result) {
      return response.status(404).json({ error: 'not_found' });
    }

    let record;
    try {
      record = JSON.parse(getData.result);
    } catch (e) {
      console.error('Corrupted registration record for', email, e);
      return response.status(500).json({ error: 'corrupted_record' });
    }

    let role = null;
    if (pin === record.childPin) role = 'child';
    else if (pin === record.parentPin) role = 'parent';

    if (!role) {
      return response.status(401).json({ error: 'invalid_pin' });
    }

    return response.status(200).json({
      success: true,
      role,
      email,
      parentName: record.parentName || '',
      age: record.age || null,
      childPin: record.childPin,
      parentPin: record.parentPin,
    });
  } catch (e) {
    console.error('Login PIN check failed:', e);
    return response.status(500).json({ error: 'server_error' });
  }
}
