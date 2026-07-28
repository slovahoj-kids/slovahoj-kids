export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const { email, parentName, childPin, parentPin } = request.body || {};

  if (!email || !childPin || !parentPin) {
    return response.status(400).json({ error: 'Missing required fields.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured.');
    return response.status(200).json({ sent: false, reason: 'not_configured' });
  }

  const greetingName = parentName ? parentName : 'батьки';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1e293b;">
      <h2 style="color:#0b47a6;">SlovAhoj Kids</h2>
      <p>Вітаємо, ${greetingName}!</p>
      <p>Дякуємо за реєстрацію. Ось ваші ПІН-коди для входу в кабінет — вони знадобляться для входу з будь-якого пристрою:</p>
      <p style="font-size:18px;"><b>Дитячий ПІН (4 цифри):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${childPin}</span></p>
      <p style="font-size:18px;"><b>Батьківський ПІН (6 цифр):</b> <span style="font-family:monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${parentPin}</span></p>
      <p>Збережіть цей лист. Якщо забудете коди — на сайті є кнопка "Забули ПІН?", вона надішле їх повторно.</p>
      <p>Питання? Пишіть нам: slovahoj.kids@gmail.com</p>
    </div>
  `;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SlovAhoj Kids <noreply@noviydim.sk>',
        to: [email],
        subject: 'Ваші ПІН-коди для SlovAhoj Kids',
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend API error:', resendRes.status, errText);
      return response.status(200).json({ sent: false, reason: 'resend_error' });
    }

    return response.status(200).json({ sent: true });
  } catch (e) {
    console.error('Failed to send registration email:', e);
    return response.status(200).json({ sent: false, reason: 'exception' });
  }
}
