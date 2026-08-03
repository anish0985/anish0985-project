/* ===== MiniGPT Profile Page Logic ===== */
(function () {
  'use strict';

  function getInitials(name) {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async function loadProfile() {
    if (!API.getToken()) {
      window.location.href = 'login.html';
      return;
    }

    try {
      const data = await API.auth.me();
      const user = data.user;
      document.getElementById('profile-header-avatar').textContent = getInitials(user.name);
      document.getElementById('profile-name').textContent = user.name;
      document.getElementById('profile-email').textContent = user.email;
      document.getElementById('profile-full-name').textContent = user.name;
      document.getElementById('profile-email-address').textContent = user.email;
      document.getElementById('profile-created-at').textContent = formatDate(user.created_at);
      document.getElementById('profile-preferences').textContent = user.preferences ? JSON.stringify(user.preferences) : 'Default';
      API.setCurrentUser(user);
    } catch (err) {
      showToast(err.message || 'Unable to load profile', 'error');
    }
  }

  async function loadApiStatus() {
    try {
      const data = await API.system.getStatus();
      const badge = document.getElementById('api-status-badge');
      const model = document.getElementById('api-model');
      const keySet = Boolean(data.keySet);
      badge.className = `status-badge ${keySet ? 'online' : 'offline'}`;
      badge.innerHTML = `<i class="fa-solid fa-circle"></i> ${keySet ? 'Online' : 'Offline'}`;
      model.textContent = data.model || '—';
    } catch (err) {
      const badge = document.getElementById('api-status-badge');
      badge.className = 'status-badge offline';
      badge.innerHTML = '<i class="fa-solid fa-circle"></i> Offline';
      document.getElementById('api-model').textContent = 'Unavailable';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('logout-button').addEventListener('click', () => {
      API.clearAuth();
      window.location.href = 'login.html';
    });

    await loadProfile();
    await loadApiStatus();
  });
})();
