export default async function handler(request, response) {
  // CORS Headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { systemPrompt, text } = request.body;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Try Claude first if key is configured
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 150,
          system: systemPrompt,
          messages: [
            { role: 'user', content: text }
          ]
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        const reply = data.content && data.content[0] ? data.content[0].text : '';
        if (reply) {
          return response.status(200).json({ reply });
        }
      } else {
        const errText = await res.text();
        console.error("Claude API returned error status:", res.status, errText);
      }
    } catch (e) {
      console.error("Failed to query Claude API:", e);
    }
  }

  // Fallback to OpenAI if Anthropic is not configured or fails
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          max_tokens: 150
        })
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
        if (reply) {
          return response.status(200).json({ reply });
        }
      } else {
        const errText = await res.text();
        console.error("OpenAI API returned error status:", res.status, errText);
      }
    } catch (e) {
      console.error("Failed to query OpenAI API:", e);
    }
  }

  return response.status(500).json({ error: 'No configured API keys (Anthropic/OpenAI) or both requests failed.' });
}
