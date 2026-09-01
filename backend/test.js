require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
You are an AI Meeting Scheduling Agent. 
Analyze the following email to determine if it is a meeting request.
If it is a meeting request, extract the requested date, start time, duration, and timezone.
Use the email timestamp as the current time reference to resolve relative dates like "tomorrow" or "next week".

Email Sender: test
Email Subject: test
Email Date: 2026-08-12
Email Body: shall we meet at 2 pm

Default Timezone: Asia/Kolkata
Default Meeting Duration: 30 minutes

Return structured JSON only matching this schema:
{
  "intent": "MEETING_REQUEST" | "NON_MEETING" | "NEEDS_CLARIFICATION",
  "date": "YYYY-MM-DD" or null,
  "start_time": "HH:MM" (24-hour format) or null,
  "duration_minutes": number,
  "timezone": "string",
  "confidence": number,
  "reason": "short explanation"
}
`;

  const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

  console.log('--- RAW Response ---');
  const txt = response.text;
  console.log(txt);
  try {
    JSON.parse(txt);
    console.log('Parsed successfully natively!');
  } catch (e) {
    console.log('Native parse error:', e.message);
  }
}
test();
