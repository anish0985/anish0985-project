const db = require('./db');

/**
 * Extract facts from a user message using regex patterns.
 * Returns array of { key, value } objects.
 */
function extractFacts(message) {
  const facts = [];
  const seen = new Set();
  const text = message.trim();
  const lower = text.toLowerCase();

  function addFact(key, value) {
    key = key.trim().toLowerCase();
    value = value.trim();
    if (key && value && !seen.has(key)) {
      seen.add(key);
      facts.push({ key, value });
    }
  }

  // High-priority explicit remember pattern:
  // "Remember my favorite color is blue" / "Remember my name is Anish"
  let match = text.match(/remember\s+my\s+(.+?)\s+is\s+(.+)/i);
  if (match) {
    addFact(match[1], match[2]);
  }

  // "My name is Anish" or "My name's Anish"
  match = text.match(/my\s+name(?:'s|\s+is)\s+(.+)/i);
  if (match) {
    addFact('name', match[1]);
  }

  // "I like pizza" / "I love coffee" / "I enjoy reading"
  match = text.match(/\bI\s+(?:like|love|enjoy)\s+(.+)/i);
  if (match && !lower.includes('remember')) {
    addFact('likes', match[1]);
  }

  // "My favorite color is blue" / "My favorite food is pizza"
  match = text.match(/my\s+favorite\s+(.+?)\s+is\s+(.+)/i);
  if (match && !lower.includes('remember')) {
    addFact(`favorite ${match[1]}`, match[2]);
  }

  // "I live in New York" / "I am from India"
  match = text.match(/\bI\s+(?:live\s+in|am\s+from)\s+(.+)/i);
  if (match) {
    addFact('location', match[1]);
  }

  // "I work as a software engineer" / "I am a doctor"
  match = text.match(/\bI\s+(?:work\s+as\s+(?:a|an)\s+|am\s+a\s+)(.+)/i);
  if (match) {
    addFact('job', match[1]);
  }

  // "I'm 25 years old" / "I am 25"
  match = text.match(/\bI(?:'m|\s+am)\s+(\d+)\s+(?:years?\s+old|yo)?/i);
  if (match) {
    addFact('age', match[1]);
  }

  // "Call me Alex" / "You can call me Alex"
  match = text.match(/(?:call\s+me|you\s+can\s+call\s+me)\s+(.+)/i);
  if (match) {
    addFact('nickname', match[1]);
  }

  return facts;
}

/**
 * Save extracted facts to the database for a user.
 * Returns the list of new/updated facts.
 */
function saveFacts(userId, facts) {
  const saved = [];
  const upsert = db.prepare(`
    INSERT INTO memories (user_id, fact_key, fact_value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, fact_key)
    DO UPDATE SET fact_value = excluded.fact_value
  `);

  for (const fact of facts) {
    upsert.run(userId, fact.key, fact.value);
    saved.push(fact);
  }

  return saved;
}

/**
 * Get all memories for a user as an object map.
 */
function getUserMemories(userId) {
  const rows = db.prepare('SELECT fact_key, fact_value FROM memories WHERE user_id = ?').all(userId);
  const memories = {};
  for (const row of rows) {
    memories[row.fact_key] = row.fact_value;
  }
  return memories;
}

/**
 * Process a user message: extract + save any facts, then return them.
 */
function processMessage(userId, message) {
  const facts = extractFacts(message);
  if (facts.length > 0) {
    return saveFacts(userId, facts);
  }
  return [];
}

/**
 * Build a memory summary string for the AI system prompt.
 */
function buildMemoryContext(userId) {
  const memories = getUserMemories(userId);
  const entries = Object.entries(memories);
  if (entries.length === 0) return '';

  const lines = entries.map(([key, value]) => `- ${key}: ${value}`);
  return `\n\nHere is what you know about this user from memory:\n${lines.join('\n')}`;
}

module.exports = {
  extractFacts,
  saveFacts,
  getUserMemories,
  processMessage,
  buildMemoryContext
};
