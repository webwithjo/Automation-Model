const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, '..', 'processed_messages.json');

/**
 * Initializes the storage file if it doesn't exist.
 */
function initStorage() {
  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([]));
  }
}

/**
 * Checks if a message ID has already been processed.
 */
function hasProcessedMessage(messageId) {
  initStorage();
  const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
  return data.includes(messageId);
}

/**
 * Marks a message ID as processed.
 */
function markMessageProcessed(messageId) {
  initStorage();
  const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
  if (!data.includes(messageId)) {
    data.push(messageId);
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  }
}

module.exports = {
  hasProcessedMessage,
  markMessageProcessed
};
