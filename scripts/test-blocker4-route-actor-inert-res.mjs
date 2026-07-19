// clean-room; behavior modeled on scripts/test-blocker2-canonical-acl-key.mjs harness pattern (proprietary self, not copied)
//
// Blocker 4 (found live, 2026-07-18, while mounting vnext/client/shell/company-switcher.js
// against the real server for the first time — not caught by any lane's own
// isolated tests, since they all pass a mock requireSession that never
// exercises server.js's own failure-path shape). Root cause: org-routes.js,
// module-routes.js, and auth-routes.js each have an actor(req) probe that
// calls `deps.requireSession(req)` with NO `res` argument. server.js's real
// requireSession(req, res, options) unconditionally calls
// `sendJson(res, 401/500, ...)` in its failure branches (no active session,
// disabled user, revoked session, internal error) — with `res` undefined,
// that throws `TypeError: Cannot read properties of undefined (reading
// 'setHeader')` instead of resolving to "no user", and the raw error message
// leaked to the client as a 500-shaped body instead of a clean 401. Fixed by
// passing an inert stand-in `res` (absorbs the internal response attempt
// silently) into each actor()'s requireSession call, mirroring the same fix
// already applied to acl-engine.js's resolveRequestUser() during the R1
// integration blocker pass.
//
// Isolated: no shared state, no db needed — this reproduces the exact
// call-shape defect directly against each route module's mounted handler
// using a requireSession stand-in that matches server.js's real
// failure-path behavior (unconditionally touches `res`).
'use strict';

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-blocker4-actor-res.db');
const migrationsDir = path.resolve(here, '../migrations');

let failures = 0;
function check(label, condition, details) {
  if (condition) console.log('  PASS:', label);
  else { failures += 1; console.error('  FAIL:', label, details === undefined ? '' : details); }
}

for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }

const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.mjs$/.test(f)).sort();
const migDb = new DatabaseSync(dbPath);
migDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of migrationFiles) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migDb);
}
migDb.close();

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
const { applyR0ScopeSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db);

// Mimics server.js's REAL requireSession(req, res, options): on any failure
// path it unconditionally calls sendJson(res, ...), which does
// `res.setHeader(...)` — throws if `res` is undefined, exactly like the
// real function. A caller passing no `res` (the original bug) reproduces
// the crash; a caller passing the INERT_PROBE_RES fix absorbs it silently.
function makeRealisticFailingRequireSession() {
  return function requireSession(req, res /* , options */) {
    function sendJson(resArg, status, payload) {
      resArg.setHeader('Content-Type', 'application/json; charset=utf-8');
      resArg.writeHead(status);
      resArg.end(JSON.stringify(payload));
    }
    // No active session -> the real function's failure branch.
    sendJson(res, 401, { success: false, error: 'Login session required' });
    return { ok: false };
  };
}

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: '', writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status) { this.statusCode = status; },
    end(text) { this.body = text || ''; this.writableEnded = true; },
  };
}
function mockReq(headers) {
  return { method: 'GET', headers: { host: 'localhost', ...(headers || {}) }, on() {} };
}
function urlFor(pathname) { return new URL('http://localhost' + pathname); }

async function callRoute(engine, pathname) {
  const req = mockReq({});
  const res = mockRes();
  let threw = null;
  try {
    await engine.handle(req, res, urlFor(pathname));
  } catch (error) {
    threw = error;
  }
  return { threw, status: res.statusCode, body: res.body };
}

console.log('=== SUITE 1: org-routes.js — actor() no longer crashes on a failed session ===');
{
  const { mountOrgRoutes } = require('../vnext/server/org/org-routes.js');
  const engine = mountOrgRoutes({ db, requireSession: makeRealisticFailingRequireSession() });
  const result = await callRoute(engine, '/api/x/org/companies');
  check('1.1 GET /api/x/org/companies does not throw for an unauthenticated caller', result.threw === null, result.threw);
  check('1.2 responds with a clean 401 (not a leaked 500/crash)', result.status === 401, result);
  check('1.3 error body is the real "login required" message, not a stack-trace-shaped leak', /تسجيل الدخول مطلوب/.test(result.body || ''), result.body);
}

console.log('\n=== SUITE 2: module-routes.js — actor() no longer crashes on a failed session ===');
{
  const { mountModuleRoutes } = require('../vnext/server/modules/module-routes.js');
  const engine = mountModuleRoutes({ db, requireSession: makeRealisticFailingRequireSession() });
  const result = await callRoute(engine, '/api/x/modules');
  check('2.1 GET /api/x/modules does not throw for an unauthenticated caller', result.threw === null, result.threw);
  check('2.2 responds with a clean 401 (not a leaked 500/crash)', result.status === 401, result);
}

console.log('\n=== SUITE 3: auth-routes.js — actor() no longer crashes on a failed session ===');
{
  const { mountAuthRoutes } = require('../vnext/server/auth/auth-routes.js');
  const engine = mountAuthRoutes({ db, requireSession: makeRealisticFailingRequireSession() });
  const result = await callRoute(engine, '/api/x/auth/password-policy');
  check('3.1 GET /api/x/auth/password-policy does not throw for an unauthenticated caller', result.threw === null, result.threw);
  check('3.2 responds cleanly (not a leaked 500/crash)', result.status === 401 || result.status === 200, result);
}

console.log('\n=== SUITE 4: grep-level proof no call site regresses back to the unguarded shape ===');
{
  for (const file of ['../vnext/server/org/org-routes.js', '../vnext/server/modules/module-routes.js', '../vnext/server/auth/auth-routes.js']) {
    const src = fs.readFileSync(path.resolve(here, file), 'utf8');
    check(`4.x ${file} no longer calls requireSession(req) with a single argument`, !/requireSession\(req\)/.test(src), file);
  }
}

console.log('\n--- SUMMARY ---');
console.log(failures === 0 ? 'BLOCKER 4 SUITE: ALL PASSED' : `BLOCKER 4 SUITE: ${failures} FAILURE(S)`);
if (failures) process.exitCode = 1;

for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }
