export default function handler(request, response) {
  // Set headers
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  // IMPORTANT: Only values that are safe to expose to the browser go here.
  // Never put secret/private keys (Stripe secret key, OpenAI, HeyGen, D-ID,
  // Anthropic, ElevenLabs, and — as of this version — the Azure Speech
  // subscription key) in a response the client can read. Azure Speech now
  // uses a short-lived authorization token issued by /api/speech-token.js
  // instead of the raw subscription key, so AZURE_SPEECH_KEY must never be
  // added back to this response.
  const keys = {
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || "",
    AZURE_SPEECH_VOICE_NAME: process.env.AZURE_SPEECH_VOICE_NAME || process.env.CUSTOM_VOICE_NAME || "",
    OKSANA_VOICE_ID: process.env.OKSANA_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
    // VAPID public key for Web Push subscriptions — by design this is
    // meant to be public (browsers need it to subscribe), never the
    // matching private key (VAPID_PRIVATE_KEY, used only server-side in
    // api/send-scheduled-pushes.js).
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || ""
    // Deliberately NOT included in this response (must never reach the browser):
    // AZURE_SPEECH_KEY, OPENAI_API_KEY, HEYGEN_API_KEY, D_ID_API_KEY,
    // ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, STRIPE_SECRET_KEY, VAPID_PRIVATE_KEY
  };

  response.status(200).json(keys);
}
