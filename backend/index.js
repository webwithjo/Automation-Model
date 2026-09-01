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
        console.error('[ERROR] Failed to parse message ID ' + msg.id + ':', err.message);
        continue; // Skip safely
      }
      
      // Self-loop protection (ignore emails sent by ourselves to other people)
      // Note: If sender is exactly authenticatedEmail and recipient is also authenticatedEmail (self-test), allow it if needed, otherwise skip
      if (emailContext.sender && emailContext.sender.includes(authenticatedEmail)) {
        console.log('[EMAIL] Skipping self-sent message ' + emailContext.messageId);
        await markAsRead(auth, emailContext.id);
        markMessageProcessed(emailContext.messageId);
        continue;
      }

      // Skip if already processed to prevent duplicate processing
      if (hasProcessedMessage(emailContext.messageId)) {
        await markAsRead(auth, emailContext.id); // Mark as read so we don't fetch it again
        continue;
      }

      // Filter out newsletters & automated bot senders
      const senderLower = (emailContext.sender || '').toLowerCase();
      const automatedSenders = [
        'noreply', 'no-reply', 'donotreply', 'jobalerts', 'notifications.google.com',
        'simplilearnmailer', 'redditmail', 'amazonses.com', 'bounce', 'mailer-daemon',
        'notification', 'invitations@linkedin.com', 'newsletters', 'digest', 'support@github.com'
      ];
      
      if (emailContext.isNewsletter || automatedSenders.some(bot => senderLower.includes(bot))) {
        console.log('[EMAIL] Skipping automated / newsletter email from: ' + emailContext.sender);
        await markAsRead(auth, emailContext.id);
        markMessageProcessed(emailContext.messageId);
        continue;
      }

      console.log('--------------------------------------------------');
      console.log('[EMAIL] Incoming email detected: ' + (emailContext.subject || '(no subject)'));
      console.log('[EMAIL] Sender: ' + emailContext.sender);
      console.log('[EMAIL] Message ID: ' + emailContext.messageId);

      try {
        const replyText = await processEmailDecision(auth, emailContext);

        if (replyText) {
          console.log('[EMAIL] Sending reply...');
          await sendReply(auth, msg, replyText);
          console.log('[EMAIL] Reply sent successfully.');
        } else {
          console.log('[AI] No reply needed (intent was SPAM or NON_ACTIONABLE).');
        }

        // Strictly mark as processed and read after handling
        markMessageProcessed(emailContext.messageId);
        await markAsRead(auth, emailContext.id);
        console.log('[EMAIL] Marked message as read & processed.');
      } catch (err) {
        console.error('[ERROR] Processing failed for message ' + emailContext.messageId + ':', err.message);
        
        // If we hit a rate limit (429), stop processing this batch and wait for next poll
        if (err.status === 429 || (err.message && err.message.includes('429'))) {
           console.log('[WARN] Gemini quota limit reached. Pausing batch until next poll cycle.');
           break;
        }
      }
      
      // Delay 3 seconds between emails to respect rate limits
      await delay(3000);
    }
  } catch (err) {
    console.error('[ERROR] Gmail check cycle error:', err.message || err);
  }
}

async function start() {
  console.log('==================================================');
  console.log('🚀 Starting AI Meeting Scheduling Agent...');
  console.log('==================================================');
  
  try {
    const auth = await authenticate();
    console.log('Email agent: RUNNING');
    console.log('Gmail API: CONNECTED');
    console.log('Calendar API: CONNECTED');
    console.log('LLM API: CONNECTED');
    console.log('Email polling: ACTIVE (every 15s)');
    
    // Fetch user profile
    try {
      const gmail = google.gmail({ version: 'v1', auth });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      authenticatedEmail = profile.data.emailAddress;
      console.log('Authenticated as:', authenticatedEmail);
    } catch(err) {
      console.error('[ERROR] Failed to fetch authenticated email address:', err.message);
    }
    
    console.log('==================================================');

    // Initial check
    await checkEmails(auth);
    
    // Start polling loop
    setInterval(async () => {
      await checkEmails(auth);
    }, POLL_INTERVAL);
    
  } catch (err) {
    console.error('[FATAL ERROR] Failed to start the application:', err);
    process.exit(1);
  }
}

start();

