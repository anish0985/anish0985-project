/* ===== MiniGPT Main Shared Functions ===== */
// Theme toggle, toast notifications, utility functions, auth guard

(function () {
  'use strict';

  const THEME_KEY = 'minigpt_theme';

  // ===== Theme Management =====
  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
    updateThemeIcons();
  }

  function applyTheme(theme) {
    document.body.classList.toggle('light', theme === 'light');
  }

  function toggleTheme() {
    const current = document.body.classList.contains('light') ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    updateThemeIcons();
  }

  function updateThemeIcons() {
    const isLight = document.body.classList.contains('light');
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.innerHTML = isLight
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
    });
  }

  // ===== Toast Notifications =====
  function showToast(message, type = 'info', duration = 4000) {
    // Ensure toast container exists
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation'
    };

    toast.innerHTML = `
      <span class="toast-icon"><i class="fa-solid ${icons[type] || icons.info}"></i></span>
      <span class="toast-message"></span>
      <button class="toast-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    `;

    toast.querySelector('.toast-message').textContent = message;

    // Auto-remove after duration
    const timeout = setTimeout(() => hideToast(toast), duration);

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timeout);
      hideToast(toast);
    });

    container.appendChild(toast);
  }

  function hideToast(toast) {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }

  // ===== Utility Functions =====
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getInitials(name) {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
  }

  function setLoading(button, isLoading, loadingText = 'Loading...') {
    if (!button) return;
    if (isLoading) {
      button.classList.add('btn-loading');
      button.disabled = true;
      if (loadingText && button.dataset.originalText === undefined) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
      }
    } else {
      button.classList.remove('btn-loading');
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  // ===== Auth Guard =====
  // Redirect to login if not authenticated, or to dashboard if already authenticated
  function requireAuth() {
    const token = API.getToken();
    if (!token) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  function redirectIfAuthenticated() {
    const token = API.getToken();
    if (token) {
      window.location.href = 'dashboard.html';
      return true;
    }
    return false;
  }

  function logout() {
    API.clearAuth();
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1000);
  }

  // ===== Password Visibility Toggle =====
  function initPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword
          ? '<i class="fa-solid fa-eye-slash"></i>'
          : '<i class="fa-solid fa-eye"></i>';
      });
    });
  }

  // ===== Init on DOMContentLoaded =====
  document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    initPasswordToggles();

    // Theme toggle buttons
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });

    // Logout buttons
    document.querySelectorAll('.logout-btn').forEach(btn => {
      btn.addEventListener('click', logout);
    });
  });

  // Expose functions globally
  window.showToast = showToast;
  window.escapeHtml = escapeHtml;
  window.formatDate = formatDate;
  window.formatDateTime = formatDateTime;
  window.getInitials = getInitials;
  window.setLoading = setLoading;
  window.logout = logout;
  window.toggleTheme = toggleTheme;
  window.loadTheme = loadTheme;
})();
