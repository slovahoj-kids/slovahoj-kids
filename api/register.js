// api/register.js
// Prevents the same email from registering (and getting a fresh 7-day free
// trial) more than once, regardless of device, browser, or incognito mode.
// Also stores the generated PIN codes server-side (so login/recovery work
// from any device) and sends the confirmation email — all in one function
// to stay under the Vercel Hobby plan's 12-serverless-function limit.

async function sendPinEmail({ email, parentName, childPin, parentPin, subject, intro }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured.');
    return { sent: false, reason: 'not_configured' };
  }

  const greetingName = parentName ? parentName : 'батьки';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1e293b;">
      <h2 style="color:#0b47a6;">SlovAhoj Kids</h2>
      <p>Вітаємо, ${greetingName}!</p>
      <p>${intro}</p>
      <p style="font-size:18px;"><b>Дитячий ПІН (4 цифри):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${childPin}</span></p>
      <p style="font-size:18px;"><b>Батьківський ПІН (6 цифр):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${parentPin}</span></p>
      <p>Збережіть цей лист — коди знадобляться для входу з будь-якого пристрою.</p>
      <p>Питання? Пишіть нам: slovahoj.kids@gmail.com</p>
    </div>
  `;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SlovAhoj Kids <noreply@noviydim.sk>',
        to: [email],
        subject,
        html,
      }),
    });
    if (!resendRes.ok) {
      console.error('Resend API error:', resendRes.status, await resendRes.text());
      return { sent: false, reason: 'resend_error' };
    }
    return { sent: true };
  } catch (e) {
    console.error('Failed to send email via Resend:', e);
    return { sent: false, reason: 'exception' };
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
    return response.status(200).json({ alreadyRegistered: false, enforced: false });
  }

  const key = `registered:${email}`;

  try {
    const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getData = getRes.ok ? await getRes.json() : { result: null };

    if (getData.result) {
      return response.status(200).json({ alreadyRegistered: true, enforced: true });
    }

    const record = {
      registeredAt: Date.now(),
      trialStart: Date.now(),
      trialEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
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

    // Fire the email but don't let a delivery failure break registration —
    // the codes are already saved server-side and shown on screen either way.
    sendPinEmail({
      email,
      parentName,
      childPin,
      parentPin,
      subject: 'Ваші ПІН-коди для SlovAhoj Kids',
      intro: 'Дякуємо за реєстрацію. Ось ваші ПІН-коди для входу в кабінет — вони знадобляться для входу з будь-якого пристрою:',
    }).catch(e => console.error('sendPinEmail failed:', e));

    return response.status(200).json({ alreadyRegistered: false, enforced: true });
  } catch (e) {
    console.error('Failed to check/record registration in KV:', e);
    return response.status(200).json({ alreadyRegistered: false, enforced: false });
  }
}
