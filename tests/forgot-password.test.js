const assert = require('node:assert/strict');
const fetch = require('node-fetch');

(async () => {
  const base = process.env.BASE_URL || 'http://localhost:4100';
  const email = `reset-${Date.now()}@example.com`;

  const signup = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Reset User', email, password: 'test123' })
  });
  assert.equal(signup.status, 200, 'signup should succeed');

  const forgot = await fetch(`${base}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const forgotBody = await forgot.json();
  assert.equal(forgot.status, 200, 'forgot-password should respond with success');
  assert.ok(forgotBody.message, 'forgot-password should return a message');
  console.log('forgot-password-ok');
})();
