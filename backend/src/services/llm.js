const { GoogleGenAI } = require('@google/genai');

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found in .env');
  }
  return new GoogleGenAI({ apiKey });
}

function extractJson(text) {
  if (!text) throw new Error('Empty LLM response');
  let cleaned = text.trim();
  
  // Clean markdown blocks
  cleaned = cleaned.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Try direct parse
  try { return JSON.parse(cleaned); } catch(e) {}

  // Try regex match
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch(e) {}
  }

  // Handle truncated JSON responses (close strings, objects)
  let repaired = cleaned;
  if (repaired.includes('{')) {
    repaired = repaired.substring(repaired.indexOf('{'));
    // If quotes are unmatched, close quote
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
    if (!repaired.endsWith('}')) {
      repaired += '}';
    }
    try { return JSON.parse(repaired); } catch(e) {}
  }

  // Fallback extraction using regex for individual fields
  const intentMatch = cleaned.match(/"intent"\s*:\s*"([^"]+)"/);
  if (intentMatch) {
    const dateMatch = cleaned.match(/"date"\s*:\s*"([^"]+)"/);
    const timeMatch = cleaned.match(/"start_time"\s*:\s*"([^"]+)"/);
    const durationMatch = cleaned.match(/"duration_minutes"\s*:\s*(\d+)/);
    const customReplyMatch = cleaned.match(/"custom_reply"\s*:\s*"([^"]+)"/);
    return {
      intent: intentMatch[1],
      date: dateMatch ? dateMatch[1] : null,
      start_time: timeMatch ? timeMatch[1] : null,
      duration_minutes: durationMatch ? parseInt(durationMatch[1], 10) : 30,
      timezone: process.env.TIMEZONE || 'Asia/Kolkata',
      custom_reply: customReplyMatch ? customReplyMatch[1] : null
    };
  }
  
  throw new Error('Could not parse JSON from LLM response: ' + text);
}

async function extractMeetingDetails(emailContext) {
  const ai = getAiClient();
  const defaultTimezone = process.env.TIMEZONE || 'Asia/Kolkata';
  const defaultDuration = process.env.DEFAULT_MEETING_DURATION_MINUTES || 30;
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const prompt = `
You are Joyal's smart and polite personal AI assistant. 
Analyze the incoming email and determine the sender's intent.

Email Sender: ${emailContext.sender}
Email Subject: ${emailContext.subject || '(no subject)'}
Email Date: ${emailContext.date || new Date().toISOString()}
Email Body:
${emailContext.body}

Default Timezone: ${defaultTimezone}
Default Meeting Duration: ${defaultDuration} minutes

Classify into one of these intents:
1. "MEETING_REQUEST": The sender is asking for a formal or informal meeting, call, appointment, or specific date/time to sync.
   - Extract: "date" (YYYY-MM-DD), "start_time" (HH:MM in 24h), "duration_minutes", "timezone".
2. "GENERAL_MESSAGE": A general message, personal question, casual conversation, invitation (e.g. trip, outing, hangout, catch up, collaboration, work query) from a person.
   - Write a natural, polite, friendly, and context-aware reply in "custom_reply" written on behalf of Joyal.
   - Always sign off cleanly with:
     Best regards,
     Joyal
3. "NEEDS_CLARIFICATION": They want to schedule a meeting, but gave no time or date details at all.
4. "SPAM_OR_NOTIFICATION": Automated system alerts, newsletters, job notifications, marketing promotions, OTPs, or receipts.

Return structured JSON matching this schema:
{
  "intent": "MEETING_REQUEST" | "GENERAL_MESSAGE" | "NEEDS_CLARIFICATION" | "SPAM_OR_NOTIFICATION",
  "date": "YYYY-MM-DD" or null,
  "start_time": "HH:MM" (24-hour format) or null,
  "duration_minutes": number,
  "timezone": "string",
  "custom_reply": "string" or null,
  "confidence": number,
  "reason": "short explanation"
}
`;

  // Retry with backoff for network/socket errors
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
          responseMimeType: 'application/json',
          maxOutputTokens: 1024
        }
      });
      return extractJson(response.text);
    } catch (err) {
      lastError = err;
      const isTransient = err.message && (err.message.includes('wsarecv') || err.message.includes('socket') || err.message.includes('stream') || err.message.includes('ECONNRESET') || err.message.includes('429'));
      if (isTransient && attempt < 3) {
        console.warn(`[WARN] Gemini API call attempt ${attempt} failed (${err.message}). Retrying in ${attempt * 2000}ms...`);
        await new Promise(r => setTimeout(r, attempt * 2000));
      } else {
        break;
      }
    }
  }

  console.error('[ERROR] Error generating or parsing content from Gemini:', lastError);
  throw lastError;
}

module.exports = { extractMeetingDetails };

