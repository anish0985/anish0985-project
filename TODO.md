# Mini ChatGPT Build - Task Checklist

## Setup
- [x] Create package.json with dependencies
- [x] Create .env with API key + JWT secret
- [x] Create .gitignore

## Backend
- [x] Create db.js (SQLite schema: users, chats, messages, memories)
- [x] Create memory.js (fact extraction + retrieval)
- [x] Create server.js (Express routes: auth, chat, history, status)

## Frontend
- [x] Create public/index.html (sidebar + chat area + login view)
- [x] Create public/style.css (premium dark theme, responsive)
- [x] Create public/app.js (auth, chat flow, typing indicator, theme toggle)

## Verification
- [x] npm install
- [x] Start server test
- [x] End-to-end test: signup → login → chat → recall memory
