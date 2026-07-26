// api/speech-token.js
// Issues a short-lived (~10 minute) Azure Speech authorization token instead
// of handing the raw AZURE_SPEECH_KEY subscription key to the browser.
// This is the pattern Microsoft itself recommends for browser-based Speech
// SDK usage: https://learn.microsoft.com/azure/ai-services/speech-service/how-to-configure-azure-ad-auth
//
// The browser calls this endpoint, gets { token, region }, and uses
// SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region) instead of
// fromSubscription(key, region). If the raw key ever leaked before this
// endpoint existed, rotate it in the Azure Portal the same way you rotated
// Stripe/OpenAI/HeyGen/ElevenLabs.

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return response.status(500).json({ error: 'Azure Speech is not configured on the server.' });
  }

  try {
    const tokenRes = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Length': '0',
        },
      }
    );

    if (!tokenRes.ok) {
      console.error('Azure token request failed:', tokenRes.status, await tokenRes.text());
      return response.status(502).json({ error: 'Failed to obtain Azure Speech token.' });
    }

    const token = await tokenRes.text();
    return response.status(200).json({ token, region });
  } catch (e) {
    console.error('Azure token request error:', e);
    return response.status(500).json({ error: 'Failed to obtain Azure Speech token.' });
  }
}
