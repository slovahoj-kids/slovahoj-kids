export default function handler(request, response) {
  // Set headers
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  // IMPORTANT: Only values that are safe to expose to the browser go here.
  // Never put secret/private keys (Stripe secret key, server-side API keys)
  // in a response that the client can read. If a secret key is needed,
  // it must be used server-side only (e.g. inside another /api endpoint
  // that calls the external service itself and returns just the result).
  const keys = {
    AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || "",
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || "",
    AZURE_SPEECH_VOICE_NAME: process.env.AZURE_SPEECH_VOICE_NAME || process.env.CUSTOM_VOICE_NAME || "",
    OKSANA_VOICE_ID: process.env.OKSANA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || ""
    // Removed from this response (must never reach the browser):
    // OPENAI_API_KEY, HEYGEN_API_KEY, D_ID_API_KEY, ANTHROPIC_API_KEY,
    // ELEVENLABS_API_KEY, STRIPE_SECRET_KEY
  };

  response.status(200).json(keys);
}
