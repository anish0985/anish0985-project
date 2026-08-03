/* ===== MiniGPT Dashboard Logic ===== */
(function () {
  'use strict';

  const state = {
    user: null,
    currentChatId: null,
    isGenerating: false
  };

  const elements = {
    chatList: document.getElementById('chat-list'),
    messagesArea: document.getElementById('messages-area'),
    welcomeScreen: document.getElementById('welcome-screen'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    chatTitle: document.getElementById('chat-title'),
    sidebarOpen: document.getElementById('sidebar-open'),
    sidebarClose: document.getElementById('sidebar-close'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    clearChatBtn: document.getElementById('clear-chat-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    sidebarUserName: document.getElementById('sidebar-user-name'),
    sidebarUserEmail: document.getElementById('sidebar-user-email'),
    sidebarUserAvatar: document.getElementById('sidebar-user-avatar')
  };

  function escapeHtml(value) {
    if (!value) return '';
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function getInitials(name) {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
  }

  function openSidebar() {
    document.querySelector('.sidebar').classList.add('open');
    elements.sidebarOverlay.classList.add('show');
  }

  function closeSidebar() {
    document.querySelector('.sidebar').classList.remove('open');
    elements.sidebarOverlay.classList.remove('show');
  }

  function showWelcomeScreen() {
    if (document.getElementById('welcome-screen')) return;
    const welcome = document.createElement('div');
    welcome.className = 'welcome-screen';
    welcome.id = 'welcome-screen';
    welcome.innerHTML = `
      <div class="welcome-avatar"><i class="fa-solid fa-robot"></i></div>
      <h2>MiniGPT</h2>
      <p class="welcome-subtitle">Ask anything and keep the conversation flowing with persistent context.</p>
      <div class="suggestion-grid">
        <div class="suggestion-card" data-prompt="Summarize this week’s priorities in a concise plan.">
          <div class="suggestion-title"><span>📋</span> Plan the week</div>
          <div class="suggestion-text">Turn scattered notes into a clear action plan.</div>
        </div>
        <div class="suggestion-card" data-prompt="Explain how to build a small REST API in Node.js with clear examples.">
          <div class="suggestion-title"><span>💻</span> Learn something new</div>
          <div class="suggestion-text">Get a practical walkthrough with code samples.</div>
        </div>
        <div class="suggestion-card" data-prompt="Help me draft a thoughtful reply to a client email.">
          <div class="suggestion-title"><span>✍️</span> Write better</div>
          <div class="suggestion-text">Polish your message and make it feel professional.</div>
        </div>
        <div class="suggestion-card" data-prompt="Create a quick launch checklist for a new product idea.">
          <div class="suggestion-title"><span>🚀</span> Brainstorm ideas</div>
          <div class="suggestion-text">Shape a clear strategy with a concrete first step.</div>
        </div>
      </div>
    `;
    elements.messagesArea.appendChild(welcome);
    welcome.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => sendMessage(card.dataset.prompt));
    });
  }

  function appendMessage(role, content) {
    if (elements.welcomeScreen) elements.welcomeScreen.remove();
    const row = document.createElement('div');
    row.className = `message-row ${role}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    row.innerHTML = `
      <div class="message-wrapper">
        <div class="message-bubble">${escapeHtml(content)}</div>
        <div class="message-meta">${timestamp}</div>
      </div>
    `;
    elements.messagesArea.appendChild(row);
    elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
  }

  function showTypingIndicator() {
    if (elements.welcomeScreen) elements.welcomeScreen.remove();
    const row = document.createElement('div');
    row.className = 'message-row ai';
    row.id = 'typing-indicator';
    row.innerHTML = `
      <div class="message-wrapper">
        <div class="message-bubble">
          <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
      </div>
    `;
    elements.messagesArea.appendChild(row);
    elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }

  function renderChatList(chats) {
    if (!elements.chatList) return;
    if (!chats.length) {
      elements.chatList.innerHTML = '<div class="empty-state">No chats yet</div>';
      return;
    }

    elements.chatList.innerHTML = chats.map(chat => `
      <div class="chat-item ${chat.id === state.currentChatId ? 'active' : ''}" data-chat-id="${chat.id}">
        <i class="fa-regular fa-comment-dots"></i>
        <span class="chat-item-title">${escapeHtml(chat.title)}</span>
        <button class="chat-item-delete" data-delete-id="${chat.id}" title="Delete chat">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');

    elements.chatList.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', (event) => {
        if (event.target.closest('.chat-item-delete')) return;
        openChat(parseInt(item.dataset.chatId, 10));
      });
    });

    elements.chatList.querySelectorAll('.chat-item-delete').forEach(button => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        await deleteChat(parseInt(button.dataset.deleteId, 10));
      });
    });
  }

  async function loadHistory() {
    try {
      const data = await API.chat.getHistory();
      renderChatList(data.chats || []);
    } catch (err) {
      elements.chatList.innerHTML = '<div class="empty-state">Unable to load chat history</div>';
      showToast(err.message || 'Unable to load chat history', 'error');
    }
  }

  async function openChat(chatId) {
    try {
      const data = await API.chat.getMessages(chatId);
      state.currentChatId = chatId;
      elements.chatTitle.textContent = data.chat.title;
      elements.messagesArea.innerHTML = '';
      (data.messages || []).forEach(message => appendMessage(message.role === 'assistant' ? 'ai' : 'user', message.content));
      renderChatList(document.querySelectorAll('.chat-item').length ? [] : []);
      loadHistory();
    } catch (err) {
      showToast(err.message || 'Unable to open chat', 'error');
    }
  }

  async function deleteChat(chatId) {
    try {
      await API.chat.deleteChat(chatId);
      if (state.currentChatId === chatId) {
        state.currentChatId = null;
        elements.chatTitle.textContent = 'New chat';
        elements.messagesArea.innerHTML = '';
        showWelcomeScreen();
      }
      await loadHistory();
      showToast('Chat deleted', 'success');
    } catch (err) {
      showToast(err.message || 'Unable to delete chat', 'error');
    }
  }

  async function sendMessage(prompt = null) {
    const rawMessage = typeof prompt === 'string' ? prompt : elements.userInput.value;
    const message = rawMessage.trim();
    if (!message || state.isGenerating) return;

    elements.userInput.value = '';
    appendMessage('user', message);
    showTypingIndicator();
    state.isGenerating = true;
    elements.sendBtn.disabled = true;
    elements.userInput.disabled = true;

    try {
      const data = await API.chat.sendMessage(message, state.currentChatId);
      removeTypingIndicator();
      appendMessage('ai', data.response);
      state.currentChatId = data.chatId;
      elements.chatTitle.textContent = message.length > 40 ? `${message.slice(0, 40)}…` : message;
      await loadHistory();
    } catch (err) {
      removeTypingIndicator();
      appendMessage('ai', `⚠️ ${err.message || 'Something went wrong. Please try again.'}`);
      showToast(err.message || 'Unable to send message', 'error');
    } finally {
      state.isGenerating = false;
      elements.sendBtn.disabled = false;
      elements.userInput.disabled = false;
      elements.userInput.focus();
    }
  }

  async function loadProfile() {
    const user = API.getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    state.user = user;
    elements.sidebarUserName.textContent = user.name;
    elements.sidebarUserEmail.textContent = user.email;
    elements.sidebarUserAvatar.textContent = getInitials(user.name);
  }

  function attachEvents() {
    elements.sendBtn.addEventListener('click', () => sendMessage());
    elements.userInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    elements.userInput.addEventListener('input', () => {
      elements.userInput.style.height = 'auto';
      elements.userInput.style.height = `${Math.min(elements.userInput.scrollHeight, 120)}px`;
    });
    elements.newChatBtn.addEventListener('click', () => {
      state.currentChatId = null;
      elements.chatTitle.textContent = 'New chat';
      elements.messagesArea.innerHTML = '';
      showWelcomeScreen();
    });
    elements.clearChatBtn.addEventListener('click', () => {
      if (state.currentChatId) {
        deleteChat(state.currentChatId);
      } else {
        elements.messagesArea.innerHTML = '';
        showWelcomeScreen();
      }
    });
    elements.sidebarOpen.addEventListener('click', openSidebar);
    elements.sidebarClose.addEventListener('click', closeSidebar);
    elements.sidebarOverlay.addEventListener('click', closeSidebar);
    document.getElementById('sidebar-logout').addEventListener('click', () => {
      API.clearAuth();
      window.location.href = 'login.html';
    });
  }

  async function init() {
    if (!API.getToken()) {
      window.location.href = 'login.html';
      return;
    }

    attachEvents();
    await loadProfile();
    await loadHistory();
    showWelcomeScreen();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
