// clean-room; behavior modeled on the T1.14.1 session-rotation acceptance criterion (proprietary self, not copied)
//
// Live, end-to-end HTTP proof of session-rotation-on-role-change (advisory
// item from R1_COMPLETION_REPORT.md §9 — Lane D's own suite only proved
// rotateSessionsForUser()/isSessionRevoked() at the unit level). This script
// drives a REAL running server over real HTTP: creates a test user via the
// real GET+POST /api/db read-modify-write cycle (never a raw partial POST —
// see feedback_never_raw_probe_post_apidb: a partial POST replaces
// collections, only an allowlisted few are preserved), logs in for real via
// POST /api/auth/login to get a real session cookie, changes that user's
// groups via the same real /api/db path server.js's session-rotation code
// diffs against, and proves the OLD session cookie is rejected afterward.
//
// Requires a server already running (this is a live-server test, not an
// isolated unit test) — start one first:
//   node server.js
// Then run:
//   node scripts/test-live-session-rotation-e2e.mjs [baseUrl]
'use strict';

import crypto from 'node:crypto';

const baseUrl = process.argv[2] || 'http://localhost:8091';
let failures = 0;
function check(label, condition, details) {
  if (condition) console.log('  PASS:', label);
  else { failures += 1; console.error('  FAIL:', label, details === undefined ? '' : details); }
}

function hashClientPassword(password, salt) {
  return crypto.createHash('sha256').update(String(password || '') + String(salt || '')).digest('hex');
}

async function getJson(path, opts) {
  const response = await fetch(baseUrl + path, opts);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: response.status, json, headers: response.headers, text };
}

function extractCookie(headers) {
  const setCookie = headers.get('set-cookie');
  if (!setCookie) return null;
  const match = /octagon_session=([^;]+)/.exec(setCookie);
  return match ? match[1] : null;
}

console.log(`--- Live session-rotation E2E test against ${baseUrl} ---`);

const health = await getJson('/api/health');
check('0.1 server is reachable', health.status === 200 && health.json && health.json.success === true, health);
if (!(health.status === 200)) {
  console.error('Server not reachable — start it first with: node server.js');
  process.exit(1);
}

console.log('\n=== STEP 1: read the current full DB state (never a raw partial POST) ===');
const before = await getJson('/api/db');
check('1.1 GET /api/db succeeds', before.status === 200 && before.json !== null, before.status);
const dbState = before.json;
const testUserId = 'test_rotation_user_' + Date.now();
const testPassword = 'RotationTestP@ss1';
const salt = crypto.randomBytes(16).toString('hex');
const testUser = {
  id: testUserId,
  name: 'Rotation Test User',
  displayName: 'Rotation Test User',
  is_active: true,
  passwordHash: hashClientPassword(testPassword, salt),
  passwordSalt: salt,
  groups: ['workshop.user'],
  role: 'operator',
};
if (!Array.isArray(dbState.users)) dbState.users = [];
dbState.users.push(testUser);

console.log('\n=== STEP 2: write the test user back via the full read-modify-write cycle ===');
const written = await getJson('/api/db', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Octagon-Full-Sync': 'yes', 'x-test-bypass': 'true' },
  body: JSON.stringify(dbState),
});
check('2.1 POST /api/db (full-sync, admin bypass) succeeds', written.status === 200 && written.json && written.json.success === true, written);

console.log('\n=== STEP 3: log in as the test user for real (real password verification, real session cookie) ===');
const login = await getJson('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: testUserId, password: testPassword }),
});
check('3.1 login succeeds with the real password', login.status === 200 && login.json && login.json.success === true, login);
const sessionCookie = extractCookie(login.headers);
check('3.2 a real session cookie was issued', !!sessionCookie);

console.log('\n=== STEP 4: confirm the session works before any role change ===');
const sessionCheckBefore = await getJson('/api/auth/session', { headers: { Cookie: `octagon_session=${sessionCookie}` } });
check('4.1 the session is recognized as authenticated before the role change', sessionCheckBefore.status === 200 && sessionCheckBefore.json && sessionCheckBefore.json.authenticated === true, sessionCheckBefore);

console.log('\n=== STEP 5: change the user\'s groups via the real /api/db full-sync path (triggers rotateSessionsForUser) ===');
const afterRoleChange = await getJson('/api/db');
const nextState = afterRoleChange.json;
const targetUser = (nextState.users || []).find((u) => u.id === testUserId);
check('5.1 the test user is present in the freshly-read state', !!targetUser);
targetUser.groups = ['system.admin'];
targetUser.role = 'admin';
const rotated = await getJson('/api/db', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Octagon-Full-Sync': 'yes', 'x-test-bypass': 'true' },
  body: JSON.stringify(nextState),
});
check('5.2 the role-change POST /api/db succeeds', rotated.status === 200 && rotated.json && rotated.json.success === true, rotated);

console.log('\n=== STEP 6: the OLD session token must now be rejected ===');
const sessionCheckAfter = await getJson('/api/auth/session', { headers: { Cookie: `octagon_session=${sessionCookie}` } });
check('6.1 the pre-role-change session is no longer authenticated', sessionCheckAfter.status === 200 && sessionCheckAfter.json && sessionCheckAfter.json.authenticated === false, sessionCheckAfter);
// A protected endpoint must also reject it outright (401), not just report unauthenticated softly.
const protectedAfter = await getJson('/api/x/org/companies', { headers: { Cookie: `octagon_session=${sessionCookie}` } });
check('6.2 a protected endpoint rejects the revoked session (401)', protectedAfter.status === 401, protectedAfter);

console.log('\n=== STEP 7: a fresh login for the same (now-admin) user works and gets a NEW valid session ===');
const reLogin = await getJson('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: testUserId, password: testPassword }),
});
check('7.1 re-login succeeds (password/account itself is unaffected by rotation)', reLogin.status === 200 && reLogin.json && reLogin.json.success === true, reLogin);
const newCookie = extractCookie(reLogin.headers);
const sessionCheckNew = await getJson('/api/auth/session', { headers: { Cookie: `octagon_session=${newCookie}` } });
check('7.2 the NEW session (issued after rotation) is valid', sessionCheckNew.status === 200 && sessionCheckNew.json && sessionCheckNew.json.authenticated === true, sessionCheckNew);

console.log('\n=== CLEANUP: remove the test user ===');
const cleanupState = (await getJson('/api/db')).json;
cleanupState.users = (cleanupState.users || []).filter((u) => u.id !== testUserId);
const cleaned = await getJson('/api/db', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Octagon-Full-Sync': 'yes', 'x-test-bypass': 'true' },
  body: JSON.stringify(cleanupState),
});
check('8.1 test user removed cleanly', cleaned.status === 200 && cleaned.json && cleaned.json.success === true, cleaned);

console.log('\n--- SUMMARY ---');
console.log(failures === 0 ? 'LIVE SESSION-ROTATION E2E: ALL PASSED' : `LIVE SESSION-ROTATION E2E: ${failures} FAILURE(S)`);
if (failures) process.exitCode = 1;
