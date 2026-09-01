const { GoogleGenAI } = require('@google/genai');

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found in .env');
  }
  return new GoogleGenAI({ apiKey });
}

function extractJson(text) {
  let cleaned = text.trim();
  
  // Clean markdown blocks
  cleaned = cleaned.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  try { return JSON.parse(cleaned); } catch(e) {}

  // Some Gemini models occasionally truncate the closing brace on JSON mode
  if (!cleaned.endsWith('}')) {
    try { return JSON.parse(cleaned + '}'); } catch(e) {}
    try { return JSON.parse(cleaned + '"}'); } catch(e) {}
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch(e) {}
  }
  
  throw new Error('Could not parse JSON from LLM response: ' + text);
}

async function extractMeetingDetails(emailContext) {
  const ai = getAiClient();
  const defaultTimezone = process.env.TIMEZONE || 'Asia/Kolkata';
  const defaultDuration = process.env.DEFAULT_MEETING_DURATION_MINUTES || 30;

  const prompt = `
You are Joyal's smart and polite personal AI assistant. 
Analyze the incoming email and determine the sender's intent.

Email Sender: ${emailContext.sender}
Email Subject: ${emailContext.subject}
Email Date: ${emailContext.date}
Email Body:
${emailContext.body}

Default Timezone: ${defaultTimezone}
Default Meeting Duration: ${defaultDuration} minutes

Classify into one of these intents:
1. "MEETING_REQUEST": The sender is asking for a formal or informal meeting, call, appointment, or specific date/time to sync.
   - Extract: "date", "start_time", "duration_minutes", "timezone".
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        maxOutputTokens: 1024
      }
    });
    return extractJson(response.text);
  } catch (err) {
    console.error('[ERROR] Error generating or parsing content from Gemini:', err);
    throw err;
  }
}

module.exports = { extractMeetingDetails };
