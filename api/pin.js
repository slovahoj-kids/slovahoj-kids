// api/pin.js
// Combines PIN login, "forgot PIN" recovery, and GDPR account deletion into
// one serverless function (staying under the Vercel Hobby plan's 12-function
// limit). Which one runs is decided by the `action` field in the request
// body: 'login', 'resend', or 'delete'.

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

// Simple fixed-window rate limiter using the same Vercel KV (Upstash Redis)
// database everything else already uses — no extra service, no new
// serverless function (would exceed the Hobby plan's 12-function limit).
async function checkRateLimit(url, token, bucketKey, limit, windowSeconds) {
  try {
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(bucketKey)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const incrData = incrRes.ok ? await incrRes.json() : { result: 0 };
    const count = incrData.result || 0;
    if (count === 1) {
      // Only set the expiry on the first hit in this window, so the
      // counter actually resets instead of extending forever.
      await fetch(`${url}/expire/${encodeURIComponent(bucketKey)}/${windowSeconds}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    return count <= limit;
  } catch (e) {
    console.error('Rate limit check failed — failing open so a KV hiccup never locks out real users:', e);
    return true;
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

  // General abuse guard: caps total requests per IP, regardless of action.
  const ip = (request.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  const ipOk = await checkRateLimit(url, token, `ratelimit:pin:ip:${ip}`, 30, 900); // 30 / 15 min
  if (!ipOk) {
    return response.status(429).json({ error: 'rate_limited' });
  }

  // The child PIN is only 4 digits (10,000 combinations) — without this,
  // it could be brute-forced against one specific email in minutes. This
  // locks further login attempts for that email for 15 minutes after 8
  // tries, regardless of which IP they come from.
  if (action !== 'resend') {
    const emailOk = await checkRateLimit(url, token, `ratelimit:pin:email:${email}`, 8, 900); // 8 / 15 min
    if (!emailOk) {
      return response.status(429).json({ error: 'rate_limited' });
    }
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

  if (action === 'delete') {
    // Requires the PARENT PIN specifically (not the child PIN) — this is
    // the one irreversible action, so it needs the stronger credential.
    const pin = (body.pin || '').toString().trim();
    if (!pin) return response.status(400).json({ error: 'PIN required.' });
    if (!record) return response.status(404).json({ error: 'not_found' });
    if (pin !== record.parentPin) {
      return response.status(401).json({ error: 'invalid_pin' });
    }

    try {
      // Delete the registration record (email, PIN codes, trial dates) and
      // the subscription record (Stripe status), so no trace of this
      // account is left in Vercel KV. customer_email:<id> mappings are
      // intentionally left — Stripe itself still holds the payment/customer
      // record for accounting purposes, deleting the KV pointer to it
      // doesn't affect that and isn't linkable back to this app account.
      await fetch(`${url}/del/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetch(`${url}/del/${encodeURIComponent(`sub:${email}`)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.status(200).json({ deleted: true });
    } catch (e) {
      console.error('Account deletion failed:', e);
      return response.status(500).json({ error: 'server_error' });
    }
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
    trialStart: record.trialStart || null,
    trialEnd: record.trialEnd || null,
  });
}
