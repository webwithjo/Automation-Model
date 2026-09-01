const { google } = require('googleapis');

/**
 * Gets the Gmail service using the authenticated client.
 */
function getGmailService(auth) {
  return google.gmail({ version: 'v1', auth });
}

/**
 * Fetches unread messages from the inbox.
 */
async function getUnreadMessages(auth) {
  const gmail = getGmailService(auth);
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread newer_than:2d',
  });

  const messages = res.data.messages || [];
  const fullMessages = [];

  for (const msg of messages) {
    const msgData = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full'
    });
    fullMessages.push(msgData.data);
  }

  return fullMessages;
}

/**
 * Extracts plain text body from the Gmail payload.
 */
function extractBody(payload) {
  let body = '';
  
  if (payload.parts) {
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
 * Parses a raw Gmail message to extract sender, subject, and body.
 */
function parseMessage(message) {
  const headers = message.payload.headers;
  const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
  const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
  const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');
  const messageIdHeader = headers.find(h => h.name.toLowerCase() === 'message-id');

  const subject = subjectHeader ? subjectHeader.value : '';
  const sender = fromHeader ? fromHeader.value : '';
  const date = dateHeader ? dateHeader.value : '';
  const messageId = messageIdHeader ? messageIdHeader.value : message.id;

  const threadId = message.threadId;
  const body = extractBody(message.payload);

  return {
    id: message.id,
    threadId,
    messageId,
    sender,
    subject,
    date,
    body
  };
}

/**
 * Sends a reply to a thread.
 */
async function sendReply(auth, originalMessage, replyText) {
  const gmail = getGmailService(auth);
  
  const headers = originalMessage.payload.headers;
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

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage,
      threadId: originalMessage.threadId
    }
  });
}

/**
 * Marks a message as read (removes UNREAD label).
 */
async function markAsRead(auth, messageId) {
  const gmail = getGmailService(auth);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD']
    }
  });
}

module.exports = {
  getUnreadMessages,
  parseMessage,
  sendReply,
  markAsRead
};
