export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const email = ((request.body || {}).email || '').toString().trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Invalid email.' });
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error('Vercel KV is not configured.');
    return response.status(200).json({ sent: false });
  }

  const key = `registered:${email}`;

  try {
    const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getData = getRes.ok ? await getRes.json() : { result: null };

    // Don't reveal whether this email exists — same response either way.
    if (!getData.result) {
      return response.status(200).json({ sent: false });
    }

    let record;
    try {
      record = JSON.parse(getData.result);
    } catch (e) {
      return response.status(200).json({ sent: false });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured.');
      return response.status(200).json({ sent: false });
    }

    const greetingName = record.parentName || 'батьки';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1e293b;">
        <h2 style="color:#0b47a6;">SlovAhoj Kids</h2>
        <p>Вітаємо, ${greetingName}!</p>
        <p>Ви запросили відновлення ПІН-кодів. Ось вони:</p>
        <p style="font-size:18px;"><b>Дитячий ПІН (4 цифри):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${record.childPin}</span></p>
        <p style="font-size:18px;"><b>Батьківський ПІН (6 цифр):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${record.parentPin}</span></p>
        <p>Якщо це були не ви — просто ігноруйте цей лист.</p>
      </div>
    `;

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
      console.error('Resend error on resend-pin:', await resendRes.text());
      return response.status(200).json({ sent: false });
    }

    return response.status(200).json({ sent: true });
  } catch (e) {
    console.error('resend-pin failed:', e);
    return response.status(200).json({ sent: false });
  }
}
