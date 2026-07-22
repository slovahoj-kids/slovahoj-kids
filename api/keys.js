export default function handler(request, response) {
  // Set headers
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  
  const keys = {
    AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || "",
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || "",
    AZURE_SPEECH_VOICE_NAME: process.env.AZURE_SPEECH_VOICE_NAME || process.env.CUSTOM_VOICE_NAME || "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    HEYGEN_API_KEY: process.env.HEYGEN_API_KEY || "",
    D_ID_API_KEY: process.env.D_ID_API_KEY || process.env.DID_API_KEY || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "pk_live_51Tw3otRLZSrXJTd8cd8uTOrWYkOwIxP9HRpEfQYBEAjoSvExGovKbzpv8hLDZjVzpKuWhtaefHntTi3dUt4dNYBa00OqHXjy6E",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "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"
  };
  
  response.status(200).json(keys);
}
