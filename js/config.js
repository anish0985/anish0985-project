/* ===== MiniGPT deployment config ===== */
(function () {
  'use strict';

  const host = window.location.hostname;
  const metaBackend = document.querySelector('meta[name="minigpt-backend"]')?.content?.trim();
  const storedBackend = localStorage.getItem('minigpt_api_url') || '';

  if (window.API_BASE_URL) {
    return;
  }

  // Full-stack Railway deploy: frontend and API share the same origin.
  if (/\.railway\.app$/i.test(host)) {
    return;
  }

  // Local development.
  if (/^(localhost|127\.0\.0\.1)$/i.test(host)) {
    return;
  }

  const backendUrl = metaBackend || storedBackend;
  if (backendUrl) {
    window.API_BASE_URL = backendUrl.replace(/\/+$/, '');
    return;
  }

  // GitHub Pages and other static hosts need a Railway/Render backend URL.
  if (/\.github\.io$/i.test(host) || /\.pages\.dev$/i.test(host) || /\.netlify\.app$/i.test(host)) {
    window.MINIGPT_STATIC_HOST = true;
    window.MINIGPT_BACKEND_MISSING = true;
  }
})();
