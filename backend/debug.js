require('dotenv').config();
const { authenticate } = require('./src/auth');
const { getGmailService, extractBody } = require('./src/services/gmail');
const { processEmailDecision } = require('./src/services/decision');
const { google } = require('googleapis');

async function debug() {
  const auth = await authenticate();
  const gmail = google.gmail({ version: 'v1', auth });

  console.log('Fetching recent emails...');
  const res = await gmail.users.messages.list({ userId: 'me', maxResults: 5 });
  const messages = res.data.messages || [];

  for (const msg of messages) {
    const msgData = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
    const payload = msgData.data.payload;
    const headers = payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const sender = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    const messageId = headers.find(h => h.name === 'Message-ID')?.value || msg.id;
    
    let body = extractBody(payload);

    const emailContext = { id: msg.id, threadId: msgData.data.threadId, messageId, sender, subject, date, body };
    console.log(`\n\n=== Email from: ${sender} ===`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body.substring(0, 100).replace(/\n/g, ' ')}...`);
    
    if (body.toLowerCase().includes('meet')) {
      console.log('--- Processing Decision ---');
      const reply = await processEmailDecision(auth, emailContext);
      console.log('--- Decision Reply ---');
      console.log(reply);
    }
  }
}

debug().catch(console.error);
