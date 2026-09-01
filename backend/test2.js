require('dotenv').config();
const { authenticate } = require('./src/auth');
const { processEmailDecision } = require('./src/services/decision');
const { hasProcessedMessage, markMessageProcessed } = require('./src/services/storage');

async function test() {
  const auth = await authenticate();

  console.log('--- TEST A: FREE TIME ---');
  const contextA = {
    sender: 'Test User <test@example.com>',
    subject: 'Meeting',
    date: '2026-08-12T10:00:00Z',
    body: 'shall we meet at 2 pm',
    messageId: 'test-123'
  };
  try {
    const replyA = await processEmailDecision(auth, contextA);
    console.log('REPLY:\n' + replyA);
    markMessageProcessed(contextA.messageId);
  } catch(err) {
    console.error(err);
  }

  console.log('\n--- TEST B: BUSY TIME ---');
  const contextB = {
    sender: 'Test User <test@example.com>',
    subject: 'Meeting',
    date: '2026-08-12T10:00:00Z',
    body: 'shall we meet on Aug 16 at 9:30 am',
    messageId: 'test-456'
  };
  try {
    const replyB = await processEmailDecision(auth, contextB);
    console.log('REPLY:\n' + replyB);
    markMessageProcessed(contextB.messageId);
  } catch(err) {
    console.error(err);
  }

  console.log('\n--- TEST C: DUPLICATE PREVENTION ---');
  if (hasProcessedMessage('test-123') && hasProcessedMessage('test-456')) {
    console.log('Messages successfully marked as processed and duplicate check passed.');
  } else {
    console.log('Duplicate check failed.');
  }
}
test();
