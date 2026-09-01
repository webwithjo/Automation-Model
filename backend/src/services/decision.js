const { checkAvailability, scheduleMeeting } = require('./calendar');
const { extractMeetingDetails } = require('./llm');

/**
 * Validates the extracted dates to ensure they can be converted to valid ISO strings.
 */
function getStartEndDates(extracted) {
  if (!extracted.date || !extracted.start_time) {
    return null;
  }

  // Combine date and time, assuming local time for simplicity. 
  // We attach the timezone explicitly in the calendar module.
  const startStr = extracted.date + 'T' + extracted.start_time + ':00';
  const startDate = new Date(startStr);
  
  if (isNaN(startDate.getTime())) {
    return null; // Invalid date
  }

  const duration = extracted.duration_minutes || parseInt(process.env.DEFAULT_MEETING_DURATION_MINUTES) || 30;
  const endDate = new Date(startDate.getTime() + duration * 60000);

  return {
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString()
  };
}

/**
 * Formats a 24-hour time string (e.g., "14:30") into 12-hour AM/PM format.
 */
function formatFriendlyTime(timeStr, tz) {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const formattedHours = h % 12 || 12;
  const timezoneStr = tz === 'Asia/Kolkata' ? 'IST' : tz;
  return `${formattedHours}:${minutes} ${ampm}${timezoneStr ? ' ' + timezoneStr : ''}`;
}

/**
 * Formats an ISO date string (e.g., "2026-09-01") into a readable format (e.g., "Tuesday, September 1, 2026").
 */
function formatFriendlyDate(dateStr) {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Processes an incoming email and determines the reply (if any).
 */
async function processEmailDecision(auth, emailContext) {
  
  let llmResult;
  try {
    llmResult = await extractMeetingDetails(emailContext);
  } catch (err) {
    console.error('[ERROR] LLM extraction failed:', err);
    throw err; // Let index.js catch it so it doesn't mark it as processed
  }

  if (!llmResult) {
     console.error('[ERROR] LLM returned empty result.');
     throw new Error('Empty LLM result');
  }

  if (llmResult.intent === 'SPAM_OR_NOTIFICATION' || llmResult.intent === 'NON_MEETING') {
    console.log('[AI] Notification/Spam/Non-message detected. No reply needed.');
    return null;
  }

  if (llmResult.intent === 'GENERAL_MESSAGE') {
    console.log('[AI] General human message detected.');
    console.log('[AI] Custom response generated.');
    return llmResult.custom_reply || `Hi there,\n\nThank you for your message! I've received it and will get back to you shortly.\n\nBest regards,\nJoyal`;
  }

  console.log('[AI] Meeting request detected');
  console.log('[AI] Requested date: ' + llmResult.date);
  console.log('[AI] Requested time: ' + llmResult.start_time);
  console.log('[AI] Duration: ' + (llmResult.duration_minutes || 30) + ' minutes');

  if (llmResult.intent === 'NEEDS_CLARIFICATION' || !llmResult.date || !llmResult.start_time) {
    console.log('[AI] Meeting request is ambiguous, generating clarification response.');
    return `Hi there,

Thank you for reaching out.

I would be happy to meet, but I didn't catch the exact date and time. Could you please clarify when you'd like to schedule our meeting?

Best regards,
Joyal`;
  }

  const timeWindow = getStartEndDates(llmResult);
  if (!timeWindow) {
    console.error('[ERROR] Could not parse valid dates from LLM output');
    return `Hi there,

Thank you for reaching out.

I'm having a bit of trouble understanding the exact time you proposed. Could you please specify the date and time clearly?

Best regards,
Joyal`;
  }

  console.log('[CALENDAR] Checking availability');
  
  let availability;
  try {
    const timezone = llmResult.timezone || process.env.TIMEZONE || 'Asia/Kolkata';
    availability = await checkAvailability(auth, timeWindow.startTime, timeWindow.endTime, timezone);
  } catch (err) {
    console.error('[ERROR] Calendar check failed:', err);
    throw err;
  }

  const friendlyTime = formatFriendlyTime(llmResult.start_time, llmResult.timezone || 'Asia/Kolkata');
  const friendlyDate = formatFriendlyDate(llmResult.date);

  if (availability === 'FREE') {
    console.log('[CALENDAR] Status: FREE');
    console.log('[AI] Generating available response');
    return `Hi there,

Thank you for reaching out.

I’m pleased to confirm that I’m available at **${friendlyTime} on ${friendlyDate}**.

I look forward to speaking with you.

Best regards,
Joyal`;
  } else if (availability === 'BUSY') {
    console.log('[CALENDAR] Status: BUSY');
    console.log('[CALENDAR] Conflicting event detected');
    console.log('[EMAIL] Generating alternative-time response');
    return `Hi there,

Thank you for reaching out.

Unfortunately, I’m unavailable at **${friendlyTime} on ${friendlyDate}**, as I already have a commitment scheduled at that time.

Could you please suggest an alternative time that works for you? I’ll be happy to coordinate accordingly.

Best regards,
Joyal`;
  }

  return null;
}

module.exports = {
  processEmailDecision,
  getStartEndDates
};
