const { google } = require('googleapis');

/**
 * Gets the Calendar service.
 */
function getCalendarService(auth) {
  return google.calendar({ version: 'v3', auth });
}

/**
 * Checks if the user is free for a given time window.
 * start and end should be ISO date strings.
 */
async function checkAvailability(auth, startTime, endTime, timezone = 'Asia/Kolkata') {
  const calendar = getCalendarService(auth);
  
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startTime,
      timeMax: endTime,
      timeZone: timezone,
      items: [{ id: 'primary' }]
    }
  });

  const primaryCalendar = res.data.calendars.primary;
  if (!primaryCalendar) {
    throw new Error('Could not fetch calendar free/busy info');
  }

  // If there are any busy slots in the requested interval, the time is occupied
  const busySlots = primaryCalendar.busy || [];
  
  if (busySlots.length > 0) {
    return 'BUSY';
  } else {
    return 'FREE';
  }
}

/**
 * Schedules a meeting and invites the attendee.
 */
async function scheduleMeeting(auth, startTime, endTime, summary, attendeeEmail, timezone = 'Asia/Kolkata') {
  const calendar = getCalendarService(auth);
  
  const event = {
    summary: summary,
    start: {
      dateTime: startTime,
      timeZone: timezone,
    },
    end: {
      dateTime: endTime,
      timeZone: timezone,
    },
    attendees: [
      { email: attendeeEmail }
    ],
    reminders: {
      useDefault: true,
    },
  };

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
    sendUpdates: 'all' // Sends an email invitation to the attendee
  });

  return res.data;
}

module.exports = {
  checkAvailability,
  scheduleMeeting
};
