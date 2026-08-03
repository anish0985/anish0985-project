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

  // Core request function with JWT auto-attachment
  async function request(endpoint, options = {}) {
    const { method = 'GET', body, headers = {}, auth = false, timeout = 30000 } = options;

    const requestHeaders = { 'Content-Type': 'application/json', ...headers };

    // Attach JWT token if auth is required
    if (auth) {
      const token = getToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
    }

    // Abort controller for timeout
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

      const response = await fetch(endpoint, fetchOptions);

      // Parse JSON response
      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }

      // Handle 401 - token expired or invalid
      if (response.status === 401) {
        clearAuth();
        // Redirect to login if not already there
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

  // ===== Toast helper (defined in main.js, accessible globally) =====
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
    request,
    auth,
    chat,
    system
  };
})();

// Expose globally
window.API = API;
