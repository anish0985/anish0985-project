/* ===== MiniGPT Auth Logic ===== */
// Login, register, forgot password, reset password, and form validation

(function () {
  'use strict';

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePassword(password) {
    return password.length >= 6;
  }

  function setFieldState(input, isValid, messageEl, message) {
    if (input) {
      input.classList.remove('is-valid', 'is-invalid');
      input.classList.add(isValid ? 'is-valid' : 'is-invalid');
    }
    if (messageEl) {
      messageEl.textContent = isValid ? '' : message;
    }
  }

  function setFormMessage(element, message, type = 'error') {
    if (!element) return;
    element.textContent = message;
    element.classList.remove('form-success', 'form-error');
    element.classList.add(type === 'success' ? 'form-success' : 'form-error');
  }

  function initLoginPage() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (API.getToken()) {
      window.location.href = 'dashboard.html';
      return;
    }

    emailInput.addEventListener('blur', () => {
      if (emailInput.value.trim() && !validateEmail(emailInput.value.trim())) {
        setFieldState(emailInput, false, errorEl, 'Please enter a valid email address');
      } else {
        setFieldState(emailInput, true, errorEl, '');
      }
    });

    passwordInput.addEventListener('blur', () => {
      if (passwordInput.value && !validatePassword(passwordInput.value)) {
        setFieldState(passwordInput, false, errorEl, 'Password must be at least 6 characters');
      } else {
        setFieldState(passwordInput, true, errorEl, '');
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      setFormMessage(errorEl, '', 'error');

      if (!email || !password) {
        setFormMessage(errorEl, 'Please fill in all fields');
        return;
      }
      if (!validateEmail(email)) {
        setFormMessage(errorEl, 'Please enter a valid email address');
        return;
      }
      if (!validatePassword(password)) {
        setFormMessage(errorEl, 'Password must be at least 6 characters');
        return;
      }

      setLoading(submitBtn, true, 'Signing in...');
      try {
        const data = await API.auth.login(email, password);
        API.setToken(data.token);
        API.setCurrentUser(data.user);
        showToast(`Welcome back, ${data.user.name}!`, 'success');
        window.location.href = 'dashboard.html';
      } catch (err) {
        setFormMessage(errorEl, err.message || 'Login failed. Please try again.');
        showToast(err.message || 'Login failed', 'error');
      } finally {
        setLoading(submitBtn, false);
      }
    });

    const forgotBtn = document.getElementById('forgot-password-btn');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) {
          setFormMessage(errorEl, 'Enter your email to reset your password');
          return;
        }
        if (!validateEmail(email)) {
          setFormMessage(errorEl, 'Please enter a valid email address');
          return;
        }

        setLoading(forgotBtn, true, 'Sending...');
        try {
          const data = await API.auth.forgotPassword(email);
          setFormMessage(errorEl, data.message || 'If that email exists, a reset link has been prepared.', 'success');
          if (data.token) {
            localStorage.setItem('minigpt_reset_token', data.token);
          }
          showToast('Password reset instructions have been prepared.', 'success');
        } catch (err) {
          setFormMessage(errorEl, err.message || 'Unable to process password reset');
          showToast(err.message || 'Unable to process password reset', 'error');
        } finally {
          setLoading(forgotBtn, false);
        }
      });
    }
  }

  function initRegisterPage() {
    const form = document.getElementById('register-form');
    if (!form) return;

    const nameInput = document.getElementById('register-name');
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm');
    const errorEl = document.getElementById('register-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (API.getToken()) {
      window.location.href = 'dashboard.html';
      return;
    }

    nameInput.addEventListener('blur', () => {
      if (nameInput.value.trim().length < 2) {
        setFieldState(nameInput, false, errorEl, 'Name must be at least 2 characters');
      } else {
        setFieldState(nameInput, true, errorEl, '');
      }
    });

    emailInput.addEventListener('blur', () => {
      if (emailInput.value.trim() && !validateEmail(emailInput.value.trim())) {
        setFieldState(emailInput, false, errorEl, 'Please enter a valid email address');
      } else {
        setFieldState(emailInput, true, errorEl, '');
      }
    });

    passwordInput.addEventListener('blur', () => {
      if (passwordInput.value && !validatePassword(passwordInput.value)) {
        setFieldState(passwordInput, false, errorEl, 'Password must be at least 6 characters');
      } else {
        setFieldState(passwordInput, true, errorEl, '');
      }
    });

    confirmInput.addEventListener('blur', () => {
      if (confirmInput.value && confirmInput.value !== passwordInput.value) {
        setFieldState(confirmInput, false, errorEl, 'Passwords do not match');
      } else {
        setFieldState(confirmInput, true, errorEl, '');
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirm = confirmInput.value;

      setFormMessage(errorEl, '', 'error');

      if (!name || !email || !password || !confirm) {
        setFormMessage(errorEl, 'Please fill in all fields');
        return;
      }
      if (name.length < 2) {
        setFormMessage(errorEl, 'Name must be at least 2 characters');
        return;
      }
      if (!validateEmail(email)) {
        setFormMessage(errorEl, 'Please enter a valid email address');
        return;
      }
      if (!validatePassword(password)) {
        setFormMessage(errorEl, 'Password must be at least 6 characters');
        return;
      }
      if (password !== confirm) {
        setFormMessage(errorEl, 'Passwords do not match');
        return;
      }

      setLoading(submitBtn, true, 'Creating account...');
      try {
        const data = await API.auth.signup(name, email, password);
        API.setToken(data.token);
        API.setCurrentUser(data.user);
        showToast(`Account created! Welcome, ${data.user.name}!`, 'success');
        window.location.href = 'dashboard.html';
      } catch (err) {
        setFormMessage(errorEl, err.message || 'Registration failed. Please try again.');
        showToast(err.message || 'Registration failed', 'error');
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }

  function initForgotPasswordPage() {
    const form = document.getElementById('forgot-password-form');
    if (!form) return;

    const emailInput = document.getElementById('forgot-email');
    const errorEl = document.getElementById('forgot-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();

      setFormMessage(errorEl, '', 'error');

      if (!email) {
        setFormMessage(errorEl, 'Please enter your email address');
        return;
      }
      if (!validateEmail(email)) {
        setFormMessage(errorEl, 'Please enter a valid email address');
        return;
      }

      setLoading(submitBtn, true, 'Sending...');
      try {
        const data = await API.auth.forgotPassword(email);
        setFormMessage(errorEl, data.message || 'If that email exists, a reset link has been prepared.', 'success');
        if (data.token) {
          localStorage.setItem('minigpt_reset_token', data.token);
        }
        showToast('Password reset instructions are ready.', 'success');
      } catch (err) {
        setFormMessage(errorEl, err.message || 'Unable to process password reset');
        showToast(err.message || 'Unable to process password reset', 'error');
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }

  function initResetPasswordPage() {
    const form = document.getElementById('reset-password-form');
    if (!form) return;

    const passwordInput = document.getElementById('reset-password');
    const confirmInput = document.getElementById('reset-confirm');
    const errorEl = document.getElementById('reset-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('token') || localStorage.getItem('minigpt_reset_token');

    if (!resetToken) {
      setFormMessage(errorEl, 'No reset token found. Please request a new password reset.');
      submitBtn.disabled = true;
      return;
    }

    passwordInput.addEventListener('blur', () => {
      if (passwordInput.value && !validatePassword(passwordInput.value)) {
        setFieldState(passwordInput, false, errorEl, 'Password must be at least 6 characters');
      } else {
        setFieldState(passwordInput, true, errorEl, '');
      }
    });

    confirmInput.addEventListener('blur', () => {
      if (confirmInput.value && confirmInput.value !== passwordInput.value) {
        setFieldState(confirmInput, false, errorEl, 'Passwords do not match');
      } else {
        setFieldState(confirmInput, true, errorEl, '');
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = passwordInput.value;
      const confirm = confirmInput.value;

      setFormMessage(errorEl, '', 'error');

      if (!password || !confirm) {
        setFormMessage(errorEl, 'Please fill in all fields');
        return;
      }
      if (!validatePassword(password)) {
        setFormMessage(errorEl, 'Password must be at least 6 characters');
        return;
      }
      if (password !== confirm) {
        setFormMessage(errorEl, 'Passwords do not match');
        return;
      }

      setLoading(submitBtn, true, 'Resetting...');
      try {
        const data = await API.auth.resetPassword(resetToken, password);
        setFormMessage(errorEl, data.message || 'Password reset successful', 'success');
        localStorage.removeItem('minigpt_reset_token');
        showToast('Password reset successful!', 'success');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1500);
      } catch (err) {
        setFormMessage(errorEl, err.message || 'Unable to reset password');
        showToast(err.message || 'Unable to reset password', 'error');
      } finally {
        setLoading(submitBtn, false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLoginPage();
    initRegisterPage();
    initForgotPasswordPage();
    initResetPasswordPage();
  });
})();
