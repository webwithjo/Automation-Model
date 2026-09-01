require('dotenv').config();
const { authenticate } = require('./src/auth');
const { getUnreadMessages, parseMessage, sendReply, markAsRead } = require('./src/services/gmail');
const { hasProcessedMessage, markMessageProcessed } = require('./src/services/storage');
const { processEmailDecision } = require('./src/services/decision');
const { google } = require('googleapis');

const POLL_INTERVAL = 15000; // Poll every 15 seconds
const delay = ms => new Promise(res => setTimeout(res, ms));

let authenticatedEmail = '';

async function checkEmails(auth) {
  try {
    const unreadMessages = await getUnreadMessages(auth);
    
    if (unreadMessages.length === 0) {
      return;
    }

    for (const msg of unreadMessages) {
      let emailContext;
      try {
        emailContext = parseMessage(msg);
      } catch (err) {
        console.error('[ERROR] Failed to parse message ID ' + msg.id + ':', err);
        continue; // Skip safely
      }
      
      // Self-loop protection
      if (emailContext.sender.includes(authenticatedEmail)) {
        console.log('[EMAIL] Skipping self-sent message ' + emailContext.messageId);
        await markAsRead(auth, emailContext.id);
        continue;
      }

      // Skip if already processed to prevent duplicates
      if (hasProcessedMessage(emailContext.messageId)) {
        console.log('[EMAIL] Message ' + emailContext.messageId + ' already processed, skipping.');
        await markAsRead(auth, emailContext.id); // Mark as read so we don't fetch it again
        continue;
      }

      // Filter out automated bot senders and marketing newsletters to protect quota
      const senderLower = emailContext.sender.toLowerCase();
      const automatedSenders = ['noreply', 'no-reply', 'donotreply', 'jobalerts', 'notifications.google.com', 'simplilearnmailer', 'redditmail', 'amazonses.com', 'bounce', 'mailer-daemon', 'notification'];
      if (automatedSenders.some(bot => senderLower.includes(bot))) {
        console.log('[EMAIL] Skipping automated/notification email: ' + emailContext.sender);
        await markAsRead(auth, emailContext.id);
        markMessageProcessed(emailContext.messageId);
        continue;
      }

      console.log('[EMAIL] Human message detected: ' + emailContext.subject);
      console.log('[EMAIL] Message ID: ' + emailContext.messageId);
      console.log('[EMAIL] Sender: ' + emailContext.sender);

      try {
        const replyText = await processEmailDecision(auth, emailContext);

        if (replyText) {
          console.log('[EMAIL] Sending reply');
          await sendReply(auth, msg, replyText);
          console.log('[EMAIL] Reply sent successfully');
        } else {
          console.log('[AI] No reply needed (intent was NON_MEETING or unrecognized).');
        }

        // Strictly mark as processed and read ONLY AFTER successful processing/reply
        markMessageProcessed(emailContext.messageId);
        await markAsRead(auth, emailContext.id);
        console.log('[EMAIL] Marked as processed');
      } catch (err) {
        console.error('[ERROR] Processing failed for message ' + emailContext.messageId + ':', err);
        // Do not mark as processed so it retries on the next poll
        
        // If we hit a rate limit (429), stop processing this batch
        if (err.status === 429 || (err.message && err.message.includes('429'))) {
           console.log('[WARN] Quota exhausted. Stopping batch and waiting for next poll cycle.');
           break;
        }
      }
      
      // Delay 5 seconds before processing the next email to avoid Gemini API Rate Limits (15 RPM free tier)
      await delay(5000);
    }
  } catch (err) {
    console.error('[ERROR] Gmail API failed during email check cycle:', err);
  }
}

async function start() {
  console.log('Starting AI Meeting Scheduling Agent...');
  
  try {
    const auth = await authenticate();
    console.log('Email agent: RUNNING');
    console.log('Gmail API: CONNECTED');
    console.log('Calendar API: CONNECTED');
    console.log('LLM API: CONNECTED');
    console.log('Email polling: ACTIVE');
    
    // Fetch user profile to prevent self-reply loop
    try {
      const gmail = google.gmail({ version: 'v1', auth });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      authenticatedEmail = profile.data.emailAddress;
      console.log('Authenticated as:', authenticatedEmail);
    } catch(err) {
      console.error('[ERROR] Failed to fetch authenticated email address:', err);
    }
    
    // Initial check
    await checkEmails(auth);
    
    // Start polling loop
    setInterval(async () => {
      await checkEmails(auth);
    }, POLL_INTERVAL);
    
  } catch (err) {
    console.error('[ERROR] Failed to start the application:', err);
    process.exit(1);
  }
}

start();
