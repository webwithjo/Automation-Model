const { google } = require('googleapis');

/**
 * Gets the Gmail service using the authenticated client.
 */
function getGmailService(auth) {
  return google.gmail({ version: 'v1', auth });
}

/**
 * Helper to retry API calls on transient network/stream reset errors.
 */
async function withRetry(fn, retries = 3, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkError = err.code === 'ECONNRESET' || 
                             err.code === 'ETIMEDOUT' || 
                             (err.message && (err.message.includes('wsarecv') || err.message.includes('socket') || err.message.includes('stream')));
      if (isNetworkError && i < retries - 1) {
        console.warn(`[WARN] Network error (${err.message}). Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2;
      } else {
        throw err;
      }
    }
  }
}

/**
 * Fetches unread messages from the inbox.
 */
async function getUnreadMessages(auth) {
  const gmail = getGmailService(auth);
  
  const res = await withRetry(() => gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread in:inbox',
    maxResults: 20
  }));

  const messages = res.data.messages || [];
  const fullMessages = [];

  for (const msg of messages) {
    try {
      const msgData = await withRetry(() => gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      }));
      fullMessages.push(msgData.data);
    } catch (err) {
      console.error(`[ERROR] Failed to fetch message ID ${msg.id}:`, err.message);
    }
  }

  return fullMessages;
}

/**
 * Cleans body text by stripping quoted reply histories.
 */
function stripQuotedText(text) {
  if (!text) return '';
  
  // Remove lines starting with >
  let lines = text.split(/\r?\n/);
  const cleanLines = [];
  
  for (const line of lines) {
    // Stop at common quote introducers (e.g. "On Tue, Sep 1, 2026 ... wrote:")
    if (/^On\s+.+wrote:\s*$/i.test(line.trim())) {
      break;
    }
    // Stop at standard delimiter
    if (/^---+\s*(Original Message|Forwarded Message)\s*---+/i.test(line.trim())) {
      break;
    }
    if (line.trim().startsWith('>')) {
      continue;
    }
    cleanLines.push(line);
  }
  
  return cleanLines.join('\n').trim();
}

/**
 * Extracts plain text body from the Gmail payload.
 */
function extractBody(payload) {
  let body = '';
  
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        body += Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
      } else if (part.parts) {
        body += extractBody(part);
      }
    }
    // Fallback if no text/plain found
    if (!body) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body && part.body.data) {
          const html = Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
          body += html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
        }
      }
    }
  } else if (payload.body && payload.body.data) {
    body = Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    if (payload.mimeType === 'text/html') {
      body = body.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return body;
}

/**
 * Parses a raw Gmail message to extract sender, subject, headers, and body.
 */
function parseMessage(message) {
  const headers = message.payload ? (message.payload.headers || []) : [];
  const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
  const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
  const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');
  const messageIdHeader = headers.find(h => h.name.toLowerCase() === 'message-id');
  const unsubscribeHeader = headers.find(h => h.name.toLowerCase() === 'list-unsubscribe');
  const precedenceHeader = headers.find(h => h.name.toLowerCase() === 'precedence');

  const subject = subjectHeader ? subjectHeader.value : '';
  const sender = fromHeader ? fromHeader.value : '';
  const date = dateHeader ? dateHeader.value : '';
  const messageId = messageIdHeader ? messageIdHeader.value : message.id;
  const isNewsletter = Boolean(unsubscribeHeader || (precedenceHeader && precedenceHeader.value.toLowerCase() === 'bulk'));

  const threadId = message.threadId;
  const rawBody = extractBody(message.payload || {});
  const body = stripQuotedText(rawBody) || message.snippet || '';

  return {
    id: message.id,
    threadId,
    messageId,
    sender,
    subject,
    date,
    body,
    isNewsletter
  };
}

/**
 * Sends a reply to a thread.
 */
async function sendReply(auth, originalMessage, replyText) {
  const gmail = getGmailService(auth);
  
  const headers = originalMessage.payload ? (originalMessage.payload.headers || []) : [];
  const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
  const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
  const messageIdHeader = headers.find(h => h.name.toLowerCase() === 'message-id');

  const to = fromHeader ? fromHeader.value : '';
  let subject = subjectHeader ? subjectHeader.value : '';
  if (!subject.toLowerCase().startsWith('re:')) {
    subject = 'Re: ' + subject;
  }
  const inReplyTo = messageIdHeader ? messageIdHeader.value : '';

  const messageHeaders = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `MIME-Version: 1.0`
  ];

  if (inReplyTo) {
    messageHeaders.push(`In-Reply-To: ${inReplyTo}`);
    messageHeaders.push(`References: ${inReplyTo}`);
  }

  const messageParts = [
    ...messageHeaders,
    '',
    replyText
  ];

  const rawMessage = Buffer.from(messageParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await withRetry(() => gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage,
      threadId: originalMessage.threadId
    }
  }));
}

/**
 * Marks a message as read (removes UNREAD label).
 */
async function markAsRead(auth, messageId) {
  const gmail = getGmailService(auth);
  await withRetry(() => gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD']
    }
  }));
}

module.exports = {
  getUnreadMessages,
  parseMessage,
  sendReply,
  markAsRead,
  extractBody
};
