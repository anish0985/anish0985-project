// ===== MiniGPT Frontend Logic =====

// ---------- State ----------
let currentUser = null;
let currentChatId = null;
let isGenerating = false;
let pendingMessage = '';
const tokenKey = 'minigpt_token';
const themeKey = 'minigpt_theme';

// ---------- DOM References ----------
const $ = (id) => document.getElementById(id);

// ---------- Auth ----------
const authView = $('auth-view');
const appView = $('app-view');
const loginForm = $('login-form');
const signupForm = $('signup-form');
const loginError = $('login-error');
const signupError = $('signup-error');
const forgotPasswordButton = $('forgot-password-btn');

// Tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const formId = tab.dataset.tab === 'login' ? 'login-form' : 'signup-form';
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    $(formId).classList.add('active');
    loginError.textContent = '';
    signupError.textContent = '';
  });
});

function showAuthOverlay(reason = 'Sign in to keep your chats and memories private.') {
  const tagline = document.querySelector('.auth-tagline');
  if (tagline) tagline.textContent = reason;
  authView.classList.remove('hidden');
  appView.classList.remove('hidden');
}

function hideAuthOverlay() {
  authView.classList.add('hidden');
}

async function finishAuth(data) {
  localStorage.setItem(tokenKey, data.token);
  currentUser = data.user;
  hideAuthOverlay();
  enterApp();
  if (pendingMessage) {
    const nextMessage = pendingMessage;
    pendingMessage = '';
    setTimeout(() => sendMessage(nextMessage), 0);
  }
}

forgotPasswordButton.addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  if (!email) {
    loginError.textContent = 'Enter your email to reset your password.';
    return;
  }

  loginError.textContent = '';
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    loginError.textContent = data.message || 'If that email exists, a reset link has been prepared.';
    loginError.style.color = 'var(--success)';
  } catch (err) {
    loginError.textContent = 'Unable to process password reset right now.';
    loginError.style.color = 'var(--danger)';
  }
});

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = $('login-email').value.trim();
  const password = $('login-password').value;

  loginError.style.color = 'var(--danger)';

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    loginError.textContent = data.error || 'Login failed';
    return;
  }

  await finishAuth(data);
});

// Signup
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  signupError.textContent = '';
  const name = $('signup-name').value.trim();
  const email = $('signup-email').value.trim();
  const password = $('signup-password').value;

  signupError.style.color = 'var(--danger)';

  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    signupError.textContent = data.error || 'Signup failed';
    return;
  }

  await finishAuth(data);
});

// Logout
$('logout-btn').addEventListener('click', () => {
  localStorage.removeItem(tokenKey);
  currentUser = null;
  currentChatId = null;
  pendingMessage = '';
  hideAuthOverlay();
  appView.classList.remove('hidden');
  $('chat-list').innerHTML = '<div class="empty-state">No chats yet</div>';
  $('messages-area').innerHTML = '';
  createWelcomeScreen();
});

// ---------- App Entry ----------
function enterApp() {
  hideAuthOverlay();
  appView.classList.remove('hidden');
  if (currentUser) {
    $('profile-name').textContent = currentUser.name;
    $('profile-email').textContent = currentUser.email;
    $('profile-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  } else {
    $('profile-name').textContent = 'Guest';
    $('profile-email').textContent = 'Sign in to save memory';
    $('profile-avatar').textContent = 'G';
  }
  loadHistory();
  loadTheme();
}

// ---------- Authentication check on load ----------
async function init() {
  const token = localStorage.getItem(tokenKey);
  if (token) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        enterApp();
        return;
      }
    } catch (err) {}
    localStorage.removeItem(tokenKey);
  }
  enterApp();
}

// ---------- Chat History ----------
async function loadHistory() {
  if (!getToken()) {
    renderChatList([]);
    return;
  }

  try {
    const res = await fetch('/api/history', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    renderChatList(data.chats || []);
  } catch (err) {
    $('chat-list').innerHTML = '<div class="empty-state">Failed to load chats</div>';
  }
}

function renderChatList(chats) {
  const list = $('chat-list');
  if (chats.length === 0) {
    list.innerHTML = '<div class="empty-state">No chats yet</div>';
    return;
  }
  list.innerHTML = chats.map(chat => `
    <div class="chat-item ${chat.id === currentChatId ? 'active' : ''}" data-chat-id="${chat.id}">
      <i class="fa-regular fa-comment-dots" style="color: var(--text-muted);"></i>
      <span class="chat-item-title">${escapeHtml(chat.title)}</span>
      <button class="chat-item-delete" data-delete-id="${chat.id}" title="Delete chat">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `).join('');

  // Chat item click
  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-item-delete')) return;
      openChat(parseInt(item.dataset.chatId));
    });
  });

  // Delete button
  document.querySelectorAll('.chat-item-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.deleteId);
      await deleteChat(id);
    });
  });
}

async function openChat(chatId) {
  try {
    const res = await fetch(`/api/chat/${chatId}/messages`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!res.ok) return;

    currentChatId = chatId;
    $('chat-title').textContent = data.chat.title;

    // Remove welcome screen
    const welcome = $('welcome-screen');
    if (welcome) welcome.remove();

    // Render messages
    const area = $('messages-area');
    area.innerHTML = '';
    data.messages.forEach(msg => {
      appendMessage(msg.role === 'assistant' ? 'ai' : 'user', msg.content);
    });
    area.scrollTop = area.scrollHeight;

    // Update active state in list
    document.querySelectorAll('.chat-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.chatId) === chatId);
    });
  } catch (err) {
    console.error('Failed to open chat:', err);
  }
}

async function deleteChat(chatId) {
  const res = await fetch(`/api/chat/${chatId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  if (res.ok) {
    if (chatId === currentChatId) {
      currentChatId = null;
      $('chat-title').textContent = 'New Chat';
      $('messages-area').innerHTML = '';
      createWelcomeScreen();
    }
    loadHistory();
  }
}

// ---------- New Chat ----------
$('new-chat-btn').addEventListener('click', () => {
  if (!getToken()) {
    pendingMessage = '';
    showAuthOverlay('Sign in to start chatting and save memories.');
    return;
  }

  currentChatId = null;
  $('chat-title').textContent = 'New Chat';
  loadHistory();
  if ($('welcome-screen')) return;
  createWelcomeScreen();
});

function createWelcomeScreen() {
  const area = $('messages-area');
  area.innerHTML = `
    <div class="welcome-screen" id="welcome-screen">
      <div class="welcome-avatar"><i class="fa-solid fa-robot"></i></div>
      <h2>MiniGPT</h2>
      <p class="welcome-subtitle">How can I help you today?</p>
      <p>Ask me anything, generate code, write content, solve problems, explain concepts, or brainstorm ideas.</p>
      <div class="suggestion-grid">
        <div class="suggestion-card">
          <div class="suggestion-title"><span>💡</span> Explain a concept</div>
          <div class="suggestion-text">Break down a difficult topic in simple words.</div>
        </div>
        <div class="suggestion-card">
          <div class="suggestion-title"><span>✍️</span> Write something</div>
          <div class="suggestion-text">Emails, blogs, captions, or professional content.</div>
        </div>
        <div class="suggestion-card">
          <div class="suggestion-title"><span>💻</span> Help with coding</div>
          <div class="suggestion-text">Debug code, build projects, or explain programming.</div>
        </div>
        <div class="suggestion-card">
          <div class="suggestion-title"><span>🚀</span> Brainstorm ideas</div>
          <div class="suggestion-text">Business, startup, content, or creative ideas.</div>
        </div>
      </div>
    </div>
  `;
}

// ---------- Message Rendering ----------
function appendMessage(role, content) {
  const area = $('messages-area');
  const welcome = $('welcome-screen');
  if (welcome) welcome.remove();

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  row.innerHTML = `
    <div class="message-wrapper">
      <div class="message-bubble">${escapeHtml(content)}</div>
      <div class="message-meta">${time}</div>
    </div>
  `;

  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
  return row;
}

function showTypingIndicator() {
  const area = $('messages-area');
  const welcome = $('welcome-screen');
  if (welcome) welcome.remove();

  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.id = 'typing-indicator';
  row.innerHTML = `
    <div class="message-wrapper">
      <div class="message-bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = $('typing-indicator');
  if (indicator) indicator.remove();
}

// ---------- Sending Messages ----------
async function sendMessage(messageOverride = null) {
  const input = $('user-input');
  const rawMessage = typeof messageOverride === 'string' ? messageOverride : input.value;
  const message = rawMessage.trim();
  if (!message || isGenerating) return;

  if (!getToken()) {
    pendingMessage = message;
    showAuthOverlay('Sign in to start chatting and save memories.');
    return;
  }

  input.value = '';
  autoResizeInput();
  appendMessage('user', message);
  showTypingIndicator();

  isGenerating = true;
  $('send-btn').disabled = true;
  $('user-input').disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ message, chatId: currentChatId })
    });

    const data = await res.json();
    removeTypingIndicator();

    if (!res.ok) {
      appendMessage('ai', `⚠️ ${data.error || 'Something went wrong. Please try again.'}`);
      return;
    }

    appendMessage('ai', data.response);
    currentChatId = data.chatId;
    $('chat-title').textContent = message.length > 40 ? message.slice(0, 40) + '…' : message;
    loadHistory();
  } catch (err) {
    removeTypingIndicator();
    appendMessage('ai', '⚠️ Network error. Please check your connection and try again.');
  } finally {
    isGenerating = false;
    $('send-btn').disabled = false;
    $('user-input').disabled = false;
    $('user-input').focus();
  }
}

// ---------- Input Events ----------
$('send-btn').addEventListener('click', sendMessage);

$('user-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function autoResizeInput() {
  const input = $('user-input');
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

$('user-input').addEventListener('input', autoResizeInput);

// ---------- Clear Chat ----------
$('clear-chat-btn').addEventListener('click', () => {
  if (currentChatId) {
    deleteChat(currentChatId);
  }
});

// ---------- Sidebar (mobile) ----------
$('sidebar-open').addEventListener('click', openSidebar);
$('sidebar-close').addEventListener('click', closeSidebar);
$('sidebar-overlay').addEventListener('click', closeSidebar);

function openSidebar() {
  document.querySelector('.sidebar').classList.add('open');
  $('sidebar-overlay').classList.add('show');
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('show');
}

// ---------- Theme Toggle ----------
function loadTheme() {
  const saved = localStorage.getItem(themeKey) || 'dark';
  applyTheme(saved);
  updateThemeIcon(saved);
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
}

function updateThemeIcon(theme) {
  $('theme-toggle').innerHTML = theme === 'dark'
    ? '<i class="fa-solid fa-sun"></i>'
    : '<i class="fa-solid fa-moon"></i>';
}

$('theme-toggle').addEventListener('click', () => {
  const current = document.body.classList.contains('light') ? 'light' : 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(themeKey, next);
  applyTheme(next);
  updateThemeIcon(next);
});

// ---------- Helpers ----------
function getToken() {
  return localStorage.getItem(tokenKey) || '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Init ----------
init();
loadTheme();
