/* ===== MiniGPT API Wrapper ===== */
// Centralized API request handler with JWT authentication

const API = (() => {
  const TOKEN_KEY = 'minigpt_token';

  // Get stored token
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  // Set token
  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  // Remove token
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  // Get current user from localStorage (set by auth.js)
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('minigpt_user') || 'null');
    } catch (e) {
      return null;
    }
  }

  // Set current user
  function setCurrentUser(user) {
    if (user) {
      localStorage.setItem('minigpt_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('minigpt_user');
    }
  }

  // Clear all auth data
  function clearAuth() {
    clearToken();
    setCurrentUser(null);
  }

  // Configurable Backend API URL
  function getApiBaseUrl() {
    return window.API_BASE_URL || localStorage.getItem('minigpt_api_url') || '';
  }

  function setApiBaseUrl(url) {
    if (url) {
      localStorage.setItem('minigpt_api_url', url.replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('minigpt_api_url');
    }
  }

  // Check if page is hosted on a static domain (like GitHub Pages)
  function isStaticHost() {
    const host = window.location.hostname;
    return host.endsWith('.github.io') || host.endsWith('.pages.dev') || host.endsWith('.netlify.app');
  }

  // Local storage DB mock fallback for static deployment (GitHub Pages) when no backend server is connected
  const LocalStorageDB = {
    getUsers() {
      try {
        return JSON.parse(localStorage.getItem('minigpt_mock_users') || '[]');
      } catch (e) { return []; }
    },
    saveUsers(users) {
      localStorage.setItem('minigpt_mock_users', JSON.stringify(users));
    },
    getChats(userId) {
      try {
        const all = JSON.parse(localStorage.getItem('minigpt_mock_chats') || '{}');
        return all[userId] || [];
      } catch (e) { return []; }
    },
    saveChats(userId, chats) {
      try {
        const all = JSON.parse(localStorage.getItem('minigpt_mock_chats') || '{}');
        all[userId] = chats;
        localStorage.setItem('minigpt_mock_chats', JSON.stringify(all));
      } catch (e) {}
    }
  };

  async function mockRequest(endpoint, options = {}) {
    const { method = 'GET', body = {} } = options;

    if (endpoint === '/api/auth/login') {
      const users = LocalStorageDB.getUsers();
      let user = users.find(u => u.email.toLowerCase() === (body.email || '').toLowerCase());
      if (!user) {
        user = { id: 'demo_' + Date.now(), name: (body.email || 'User').split('@')[0], email: body.email };
        users.push(user);
        LocalStorageDB.saveUsers(users);
      }
      const token = 'demo_token_' + Date.now();
      return { token, user };
    }

    if (endpoint === '/api/auth/signup') {
      const users = LocalStorageDB.getUsers();
      const user = { id: 'demo_' + Date.now(), name: body.name || 'User', email: body.email };
      users.push(user);
      LocalStorageDB.saveUsers(users);
      const token = 'demo_token_' + Date.now();
      return { token, user };
    }

    if (endpoint === '/api/auth/forgot-password') {
      return { message: 'If that email exists, a reset link has been prepared.', token: 'demo_reset_token' };
    }

    if (endpoint === '/api/auth/reset-password') {
      return { message: 'Password reset was successful' };
    }

    if (endpoint === '/api/auth/me') {
      const user = getCurrentUser();
      if (!user) throw new Error('User not found');
      return { user };
    }

    if (endpoint === '/api/status') {
      return { keySet: true, model: 'Demo Mode (GitHub Pages)' };
    }

    if (endpoint === '/api/history') {
      const user = getCurrentUser();
      const chats = user ? LocalStorageDB.getChats(user.id) : [];
      return { chats };
    }

    if (endpoint.startsWith('/api/chat/') && endpoint.endsWith('/messages')) {
      const chatId = endpoint.split('/')[3];
      const user = getCurrentUser();
      const chats = user ? LocalStorageDB.getChats(user.id) : [];
      const chat = chats.find(c => String(c.id) === String(chatId));
      if (!chat) return { chat: { id: chatId, title: 'Chat' }, messages: [] };
      return { chat: { id: chat.id, title: chat.title }, messages: chat.messages || [] };
    }

    if (endpoint.startsWith('/api/chat/') && method === 'DELETE') {
      const chatId = endpoint.split('/')[3];
      const user = getCurrentUser();
      if (user) {
        let chats = LocalStorageDB.getChats(user.id);
        chats = chats.filter(c => String(c.id) !== String(chatId));
        LocalStorageDB.saveChats(user.id, chats);
      }
      return { success: true };
    }

    if (endpoint === '/api/chat' && method === 'POST') {
      const user = getCurrentUser() || { id: 'demo_user' };
      let chats = LocalStorageDB.getChats(user.id);
      let chat;
      if (body.chatId) {
        chat = chats.find(c => String(c.id) === String(body.chatId));
      }
      if (!chat) {
        const title = (body.message || '').length > 30 ? body.message.slice(0, 30) + '…' : (body.message || 'New Chat');
        chat = { id: 'chat_' + Date.now(), title, created_at: new Date().toISOString(), messages: [] };
        chats.unshift(chat);
      }

      chat.messages.push({ role: 'user', content: body.message, created_at: new Date().toISOString() });

      const aiReply = `Hello! You are viewing MiniGPT on GitHub Pages (Static Hosting). I am responding in client demo mode. To connect live Gemini AI, deploy server.js to Render/Vercel and set your backend API URL!`;
      chat.messages.push({ role: 'assistant', content: aiReply, created_at: new Date().toISOString() });

      LocalStorageDB.saveChats(user.id, chats);
      return { chat: { id: chat.id, title: chat.title }, reply: aiReply };
    }

    throw new Error(`Endpoint ${endpoint} not supported in demo mode`);
  }

  // Core request function with JWT auto-attachment & fallback
  async function request(endpoint, options = {}) {
    const { method = 'GET', body, headers = {}, auth = false, timeout = 30000 } = options;

    const baseUrl = getApiBaseUrl();
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    const requestHeaders = { 'Content-Type': 'application/json', ...headers };

    if (auth) {
      const token = getToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions = {
        method,
        headers: requestHeaders,
        signal: controller.signal
      };

      if (body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(fullUrl, fetchOptions);

      // Handle GitHub Pages 405 Method Not Allowed (static host receives POST/PUT/DELETE)
      if (response.status === 405) {
        if (!baseUrl && isStaticHost()) {
          console.warn('⚠️ GitHub Pages returns 405 for POST endpoints. Using client-side demo fallback mode.');
          return await mockRequest(endpoint, options);
        }
        throw new Error('405 Method Not Allowed: GitHub Pages cannot process POST requests directly. Deploy server.js to Render or set your backend API URL.');
      }

      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }

      if (response.status === 401) {
        clearAuth();
        if (!window.location.pathname.includes('login.html')) {
          const msg = data?.error || 'Session expired. Please login again.';
          showToast(msg, 'error');
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 1500);
        }
        throw new Error(data?.error || 'Authentication failed');
      }

      if (!response.ok) {
        const error = new Error(data?.error || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      // Network error or 405 fallback on static host
      if (!baseUrl && isStaticHost()) {
        console.warn('⚠️ Request failed on static host. Falling back to local demo mode.', err);
        return await mockRequest(endpoint, options);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ===== Auth API =====
  const auth = {
    async signup(name, email, password) {
      return request('/api/auth/signup', {
        method: 'POST',
        body: { name, email, password }
      });
    },

    async login(email, password) {
      return request('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
    },

    async forgotPassword(email) {
      return request('/api/auth/forgot-password', {
        method: 'POST',
        body: { email }
      });
    },

    async resetPassword(token, password) {
      return request('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password }
      });
    },

    async me() {
      return request('/api/auth/me', { auth: true });
    }
  };

  // ===== Chat API =====
  const chat = {
    async getHistory() {
      return request('/api/history', { auth: true });
    },

    async getMessages(chatId) {
      return request(`/api/chat/${chatId}/messages`, { auth: true });
    },

    async deleteChat(chatId) {
      return request(`/api/chat/${chatId}`, {
        method: 'DELETE',
        auth: true
      });
    },

    async sendMessage(message, chatId = null) {
      return request('/api/chat', {
        method: 'POST',
        auth: true,
        body: { message, chatId }
      });
    }
  };

  // ===== System API =====
  const system = {
    async getStatus() {
      return request('/api/status');
    }
  };

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else if (typeof showToast === 'function') {
      showToast(message, type);
    }
  }

  return {
    getToken,
    setToken,
    clearToken,
    getCurrentUser,
    setCurrentUser,
    clearAuth,
    getApiBaseUrl,
    setApiBaseUrl,
    request,
    auth,
    chat,
    system
  };
})();

// Expose globally
window.API = API;
