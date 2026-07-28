// api/pin.js
// Combines PIN login and "forgot PIN" recovery into one serverless function
// (staying under the Vercel Hobby plan's 12-function limit). Which one runs
// is decided by the `action` field in the request body: 'login' or 'resend'.

async function sendPinEmail({ email, parentName, childPin, parentPin }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured.');
    return { sent: false };
  }
  const greetingName = parentName || 'батьки';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1e293b;">
      <h2 style="color:#0b47a6;">SlovAhoj Kids</h2>
      <p>Вітаємо, ${greetingName}!</p>
      <p>Ви запросили відновлення ПІН-кодів. Ось вони:</p>
      <p style="font-size:18px;"><b>Дитячий ПІН (4 цифри):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${childPin}</span></p>
      <p style="font-size:18px;"><b>Батьківський ПІН (6 цифр):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${parentPin}</span></p>
      <p>Якщо це були не ви — просто ігноруйте цей лист.</p>
    </div>
  `;
  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SlovAhoj Kids <noreply@noviydim.sk>',
        to: [email],
        subject: 'Відновлення ПІН-кодів SlovAhoj Kids',
        html,
      }),
    });
    if (!resendRes.ok) {
      console.error('Resend error on pin resend:', await resendRes.text());
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    console.error('sendPinEmail failed:', e);
    return { sent: false };
  }
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const body = request.body || {};
  const action = (body.action || '').toString();
  const email = (body.email || '').toString().trim().toLowerCase();

  if (!email) return response.status(400).json({ error: 'Email required.' });

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('Vercel KV is not configured.');
    return response.status(500).json({ error: 'Server storage unavailable.' });
  }

  const key = `registered:${email}`;

  let record = null;
  try {
    const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getData = getRes.ok ? await getRes.json() : { result: null };
    if (getData.result) {
      try { record = JSON.parse(getData.result); } catch (e) { record = null; }
    }
  } catch (e) {
    console.error('KV lookup failed:', e);
    return response.status(500).json({ error: 'server_error' });
  }

  if (action === 'resend') {
    // Don't reveal whether this email exists — same response either way.
    if (!record) return response.status(200).json({ sent: false });
    const result = await sendPinEmail({
      email,
      parentName: record.parentName,
      childPin: record.childPin,
      parentPin: record.parentPin,
    });
    return response.status(200).json(result);
  }

  // Default action: 'login'
  const pin = (body.pin || '').toString().trim();
  if (!pin) return response.status(400).json({ error: 'PIN required.' });
  if (!record) return response.status(404).json({ error: 'not_found' });

  let role = null;
  if (pin === record.childPin) role = 'child';
  else if (pin === record.parentPin) role = 'parent';

  if (!role) return response.status(401).json({ error: 'invalid_pin' });

  return response.status(200).json({
    success: true,
    role,
    email,
    parentName: record.parentName || '',
    age: record.age || null,
    childPin: record.childPin,
    parentPin: record.parentPin,
  });
}
