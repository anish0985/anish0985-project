# MiniGPT Frontend Build - Task Checklist

## Setup
- [ ] Create TODO.md with task breakdown

## Core Assets
- [ ] Create public/assets/images/logo.svg and favicon
- [ ] Create public/assets/icons/ (placeholder icons)

## CSS
- [ ] Create public/css/style.css (premium responsive, dark/light mode, animations)

## JavaScript Modules
- [ ] Create public/js/api.js (API wrapper with JWT auth)
- [ ] Create public/js/main.js (theme toggle, toast, shared utils, auth guard)
- [ ] Create public/js/auth.js (login, register, logout, forgot/reset password)
- [ ] Create public/js/dashboard.js (chat app: history, messages, send)
- [ ] Create public/js/profile.js (profile page logic)

## HTML Pages
- [ ] Create public/index.html (landing page)
- [ ] Create public/login.html (login page)
- [ ] Create public/register.html (registration page)
- [ ] Create public/dashboard.html (main chat application)
- [ ] Create public/profile.html (profile page)
- [ ] Create public/reset-password.html (reset password page)

## Cleanup
- [ ] Remove old public/app.js and public/style.css references
- [ ] Verify all pages load correctly
- [ ] Test full flow: register → login → chat → history → profile → logout
- [ ] Test dark/light mode and mobile responsiveness
