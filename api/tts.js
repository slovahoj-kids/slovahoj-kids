// api/tts.js
// Server-side proxy for Oksana's ElevenLabs voice (used by playTipAudio /
// playTaskAudio in app.js for the hint/task "listen" buttons).
//
// The browser sends only the text to speak; ELEVENLABS_API_KEY stays on the
// server and is never exposed to the client. This replaces an earlier
// version of app.js that called ElevenLabs directly from the browser with
// a hardcoded fallback API key baked into the page source — a leak in the
// same family as the api/keys.js incident fixed earlier today.

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.OKSANA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return response.status(500).json({ error: 'ElevenLabs is not configured on the server.' });
  }

  const body = request.body || {};
  let text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return response.status(400).json({ error: 'Missing text.' });
  }
  // Keep requests small and cheap — this is only ever a short hint/task
  // sentence, never a long passage.
  if (text.length > 500) {
    text = text.slice(0, 500);
  }

  try {
    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
    });

    if (!elevenRes.ok) {
      console.error('ElevenLabs TTS request failed:', elevenRes.status, await elevenRes.text());
      return response.status(502).json({ error: 'TTS request failed.' });
    }

    const audioBuffer = Buffer.from(await elevenRes.arrayBuffer());
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).send(audioBuffer);
  } catch (e) {
    console.error('Failed to generate TTS audio:', e);
    return response.status(500).json({ error: 'Failed to generate audio.' });
  }
}
