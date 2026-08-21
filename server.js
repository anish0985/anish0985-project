require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const mongoose = require('mongoose');
const db = require('./db');
const memory = require('./memory');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const RESET_TOKENS = new Map();
const DEFAULT_GEMINI_KEY = Buffer.from('QVEuQWI4Uk42TEsxMnlrLVo5Sm9wd2Jtd2tTLU41dXJhSDdqS2dpc3JBMWd0aGZmWlVpckE=', 'base64').toString('utf-8');
const GEMINI_MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.7-flash'
].filter(Boolean);

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;
}

function formatAiContents(history) {
  const contents = [];
  for (const entry of history) {
    const role = entry.role === 'assistant' ? 'model' : 'user';
    const text = (entry.content || '').trim();
    if (!text) continue;

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n\n' + text;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  if (contents.length > 0 && contents[0].role !== 'user') {
    contents[0].role = 'user';
  }

  return contents;
}

function sanitizeError(err) {
  if (!err) return 'Unknown error';
  const msg = typeof err === 'string' ? err : (err.message || String(err));
  return msg.replace(/key=[a-zA-Z0-9_\-\.]+/gi, 'key=[REDACTED]');
}

async function callGemini({ apiKey, systemPrompt, history }) {
  const aiContents = formatAiContents(history);

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: aiContents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
  };

  const triedModels = [];
  let lastError = null;

  for (const modelName of [...new Set(GEMINI_MODEL_FALLBACKS)]) {
    triedModels.push(modelName);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      );

      const responseText = await aiResponse.text();
      let aiData = null;
      try {
        aiData = responseText ? JSON.parse(responseText) : null;
      } catch (parseErr) {
        throw new Error(`Invalid JSON from AI provider (${aiResponse.status}): ${responseText.slice(0, 100)}`);
      }

      if (!aiResponse.ok) {
        const apiMessage = aiData?.error?.message || responseText.slice(0, 200);
        throw new Error(`AI service error (${aiResponse.status}): ${apiMessage}`);
      }

      const parts = aiData?.candidates?.[0]?.content?.parts || [];
      const aiText = parts
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim() || parts.map((p) => p.text || '').join('').trim();

      if (!aiText) {
        const finishReason = aiData?.candidates?.[0]?.finishReason || 'EMPTY';
        throw new Error(`AI returned no text (finishReason: ${finishReason})`);
      }

      if (modelName !== GEMINI_MODEL_FALLBACKS[0]) {
        console.warn(`Gemini fallback model used: ${modelName}`);
      }

      return { text: aiText, model: modelName };
    } catch (err) {
      lastError = err;
      const retryable = err.name === 'AbortError'
        || /AI service error \((404|429|500|502|503|504)\)/.test(err.message)
        || err.message.includes('fetch failed');

      if (!retryable || modelName === GEMINI_MODEL_FALLBACKS[GEMINI_MODEL_FALLBACKS.length - 1]) {
        break;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error('AI request timed out. Please try again.');
  }

  const detail = sanitizeError(lastError?.message || 'Unknown AI error');
  throw new Error(`AI unavailable after trying ${triedModels.join(', ')}: ${detail}`);
}

function getPublicAiError(err) {
  return sanitizeError(err);
}

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      /\.railway\.app$/i.test(origin) ||
      /\.github\.io$/i.test(origin) ||
      /\.pages\.dev$/i.test(origin) ||
      /\.netlify\.app$/i.test(origin) ||
      /\.vercel\.app$/i.test(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    ) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10
  })
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => {
      console.warn('⚠️  MongoDB connection error (continuing with SQLite):', err.message);
    });
}

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.static(__dirname));

// ---------- JWT Helpers ----------
const JWT_SECRET = process.env.JWT_SECRET || 'mini-chatgpt-secret-key-default-change-in-env';

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
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid email or password format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name.trim(), cleanEmail, hash);

    const user = { id: Number(info.lastInsertRowid), name: name.trim(), email: cleanEmail };
    const token = signToken(user);

    res.json({ token, user });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Registration failed: ' + (err.message || 'Internal server error') });
  }
});

app.post('/api/auth/forgot-password', (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been prepared.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
    RESET_TOKENS.set(token, { userId: user.id, email: user.email });

    res.json({ message: 'If that email exists, a reset link has been prepared.', token });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Forgot password process failed' });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { token, password } = req.body || {};
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
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Reset password failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + (err.message || 'Internal server error') });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, preferences, created_at FROM users WHERE id = ?')
      .get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
});

// ---------- API Status ----------
app.get('/api/status', (req, res) => {
  const apiKey = getGeminiApiKey();
  res.json({
    keySet: Boolean(apiKey),
    model: GEMINI_MODEL_FALLBACKS[0],
    fallbackModels: GEMINI_MODEL_FALLBACKS.slice(1)
  });
});

// ---------- Chat History ----------
app.get('/api/history', authMiddleware, (req, res) => {
  try {
    const chats = db.prepare(`
      SELECT c.id, c.title, c.created_at,
             (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) as message_count
      FROM chats c
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
    `).all(req.user.id);
    res.json({ chats });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

app.get('/api/chat/:id/messages', authMiddleware, (req, res) => {
  try {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id')
      .all(chat.id);
    res.json({ chat: { id: chat.id, title: chat.title }, messages });
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.delete('/api/chat/:id', authMiddleware, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Chat not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete chat error:', err);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// ---------- AI Chat Route ----------
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, chatId } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return res.status(503).json({ error: 'AI API key is not configured on the server. Add GEMINI_API_KEY in Railway variables.' });
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

    // 6. Call Gemini API using the server-side API key
    const { text: aiText } = await callGemini({ apiKey, systemPrompt, history });

    const numericChatId = Number(chat.id);

    // 7. Save AI response
    db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)')
      .run(numericChatId, 'assistant', aiText);

    res.json({
      chatId: numericChatId,
      response: aiText
    });
  } catch (err) {
    const safeError = getPublicAiError(err);
    console.error('❌ Chat generation error:', safeError, err?.stack || '');
    res.status(500).json({ error: safeError });
  }
});

// ---------- Health check ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mini-chatgpt' });
});

// ---------- Serve the app ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global Express Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MiniGPT server running on port ${PORT}`);
});
