export default function handler(request, response) {
  // Set headers
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  
  const keys = {
    AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || "",
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    HEYGEN_API_KEY: process.env.HEYGEN_API_KEY || ""
  };
  
  response.status(200).json(keys);
}
