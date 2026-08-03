require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');
const memory = require('./memory');

const app = express();
// Port 3000 is commonly used by other dev servers; use 3001 to avoid conflicts.
// Override with MINIGPT_PORT if needed.
const PORT = process.env.MINIGPT_PORT || process.env.PORT || 3001;
const RESET_TOKENS = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ---------- JWT Helpers ----------
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- Auth Routes ----------
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), hash);

  const user = { id: info.lastInsertRowid, name: name.trim(), email: email.toLowerCase() };
  const token = signToken(user);

  res.json({ token, user });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    return res.json({ message: 'If that email exists, a reset link has been prepared.' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
  RESET_TOKENS.set(token, { userId: user.id, email: user.email });

  res.json({ message: 'If that email exists, a reset link has been prepared.', token });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const resetEntry = RESET_TOKENS.get(token);
  if (!resetEntry) {
    return res.status(400).json({ error: 'Reset token is invalid or expired' });
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    RESET_TOKENS.delete(token);
    return res.status(400).json({ error: 'Reset token is invalid or expired' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, resetEntry.userId);
  RESET_TOKENS.delete(token);

  res.json({ message: 'Password reset was successful' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, preferences, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ---------- API Status (blurred key) ----------
app.get('/api/status', (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.BLACKBOX_API_KEY || process.env.API_KEY || '';
  const keySet = apiKey.length > 0;
  // Show masked key like "•••••••••••fZ4"
  const masked = keySet
    ? '••••••••••' + apiKey.slice(-4)
    : '';
  res.json({ keySet, masked, model: 'blackbox-pro' });
});

// ---------- Chat History ----------
app.get('/api/history', authMiddleware, (req, res) => {
  const chats = db.prepare(`
    SELECT c.id, c.title, c.created_at,
           (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) as message_count
    FROM chats c
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `).all(req.user.id);
  res.json({ chats });
});

app.get('/api/chat/:id/messages', authMiddleware, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id')
    .all(chat.id);
  res.json({ chat: { id: chat.id, title: chat.title }, messages });
});

app.delete('/api/chat/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Chat not found' });
  res.json({ success: true });
});

// ---------- AI Chat Route ----------
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, chatId } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.BLACKBOX_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI API key is not configured on the server' });
  }

  try {
    // 1. Extract and save facts from user message
    const savedFacts = memory.processMessage(req.user.id, message);

    // 2. Resolve or create chat
    let chat;
    if (chatId) {
      chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?')
        .get(chatId, req.user.id);
      if (!chat) return res.status(404).json({ error: 'Chat not found' });
    } else {
      const title = message.length > 40 ? message.slice(0, 40) + '…' : message;
      chat = { id: db.prepare('INSERT INTO chats (user_id, title) VALUES (?, ?)')
        .run(req.user.id, title).lastInsertRowid };
    }

    // 3. Save user message
    db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
      .run(chat.id, 'user', message);

    // 4. Load recent conversation context (last 10 messages)
    const history = db.prepare(`
      SELECT role, content FROM messages
      WHERE chat_id = ? ORDER BY id DESC LIMIT 10
    `).all(chat.id).reverse();

    // 5. Build system prompt with memory context
    const memoryContext = memory.buildMemoryContext(req.user.id);
    const systemPrompt = `You are MiniGPT, a helpful, friendly and concise AI assistant.
Always answer in the same language the user writes in.
Use the user's stored memories when relevant to personalize your responses.` + memoryContext;

    // 6. Call BlackBox AI API (OpenAI-compatible endpoint)
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
      }))
    ];

    const aiResponse = await fetch('https://api.blackbox.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'blackboxai/blackbox-pro',
        messages: aiMessages,
        stream: false,
        max_tokens: 1024
      })
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI API error (${aiResponse.status}): ${errText.slice(0, 200)}`);
    }

    const aiData = await aiResponse.json();
    const aiText = aiData.choices?.[0]?.message?.content || '';
    if (!aiText) throw new Error('AI API returned empty response');

    // 7. Save AI response
    db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
      .run(chat.id, 'assistant', aiText);

    res.json({
      chatId: chat.id,
      response: aiText
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Failed to generate response. Please try again.' });
  }
});

// ---------- Serve the app ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 MiniGPT server running at http://localhost:${PORT}`);
});
