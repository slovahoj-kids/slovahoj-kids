export default function handler(request, response) {
  // Set headers
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  // IMPORTANT: Only values that are safe to expose to the browser go here.
  // Never put secret/private keys (Stripe secret key, OpenAI, HeyGen, D-ID,
  // Anthropic, ElevenLabs) in a response the client can read. Those keys
  // must be used server-side only, inside other /api endpoints (like
  // /api/chat.js) that call the external service themselves and return
  // just the result to the browser.
  const keys = {
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || "",
    AZURE_SPEECH_VOICE_NAME: process.env.AZURE_SPEECH_VOICE_NAME || process.env.CUSTOM_VOICE_NAME || "",
    OKSANA_VOICE_ID: process.env.OKSANA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || ""
    // Deliberately NOT included in this response (must never reach the browser):
    // OPENAI_API_KEY, HEYGEN_API_KEY, D_ID_API_KEY, ANTHROPIC_API_KEY,
    // ELEVENLABS_API_KEY, STRIPE_SECRET_KEY
  };

  response.status(200).json(keys);
}
