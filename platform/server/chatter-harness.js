// ============================================================================
// P0.3 chatter self-test harness — THROWAWAY database only.
// Boots a plain-http server on port 8125 backed by an in-memory SQLite
// (node:sqlite DatabaseSync — same engine server.js uses), runs the full
// acceptance flow over real HTTP, prints PASS/FAIL per step, then exits.
// It NEVER opens octagon-erp/database.db.
//
// Run:  node platform/server/chatter-harness.js
// ============================================================================

'use strict';

const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const {
  mountChatter,
  createChatterHandler,
  logChange,
  ensureChatterTables,
} = require('./chatter');

const PORT = 8125;
const BASE = `http://127.0.0.1:${PORT}`;

let passCount = 0;
let failCount = 0;

function check(name, condition, detail) {
  if (condition) {
    passCount += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failCount += 1;
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

// --- Minimal express-like shim to exercise mountChatter() route wiring ----
function makeExpressShim() {
  const routes = [];
  function add(method) {
    return (pattern, handler) => routes.push({ method, pattern, handler });
  }
  const app = { get: add('GET'), post: add('POST'), patch: add('PATCH'), delete: add('DELETE') };
  app.dispatch = (method, pathname, query, body) => new Promise(resolve => {
    for (const route of routes) {
      const keys = [];
      const rx = new RegExp('^' + route.pattern.replace(/:[^/]+/g, seg => {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }) + '$');
      const match = route.method === method && pathname.match(rx);
      if (!match) continue;
      const params = {};
      keys.forEach((key, i) => { params[key] = decodeURIComponent(match[i + 1]); });
      const req = { params, query: query || {}, body: body || {} };
      const res = {
        _status: 200,
        status(code) { this._status = code; return this; },
        json(obj) { resolve({ status: this._status, json: obj }); },
      };
      return route.handler(req, res);
    }
    resolve({ status: 404, json: { success: false, error: 'no shim route' } });
  });
  return app;
}

async function main() {
  console.log('== P0.3 chatter harness (throwaway in-memory sqlite, port ' + PORT + ') ==');
  const db = new DatabaseSync(':memory:');
  ensureChatterTables(db);
  // Idempotency: running DDL twice must not throw.
  ensureChatterTables(db);
  check('ensureChatterTables idempotent', true);

  const chatter = createChatterHandler(db);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (chatter.handle(req, res, url)) return;
    res.writeHead(404); res.end('not chatter');
  });
  await new Promise(resolve => server.listen(PORT, resolve));

  // ---- 1. empty thread ----
  let r = await call('GET', '/api/x/chatter/crm_lead/L-001?user=saif');
  check('GET empty thread 200 + envelope', r.status === 200 && r.json.success === true
    && Array.isArray(r.json.data.items) && r.json.meta.total === 0, JSON.stringify(r.json));

  // ---- 2. follow, then post message → follower notification ----
  r = await call('POST', '/api/x/chatter/crm_lead/L-001/follow', { user: 'manager' });
  check('POST follow', r.status === 200 && r.json.data.following === true);

  r = await call('POST', '/api/x/chatter/crm_lead/L-001', { kind: 'message', body: 'مرحبا — أول رسالة', author: 'saif' });
  check('POST message 201', r.status === 201 && r.json.data.kind === 'message' && r.json.data.id);

  r = await call('GET', '/api/x/chatter/crm_lead/L-001?kind=message&user=saif');
  check('message appears in thread', r.json.data.items.length === 1
    && r.json.data.items[0].body.includes('أول رسالة'));
  check('author auto-follows', r.json.data.followers.includes('saif') && r.json.data.following === true);

  const notif = db.prepare('SELECT * FROM x_notifications WHERE user = ?').all('manager');
  check('follower got x_notifications row', notif.length === 1 && notif[0].read === 0
    && notif[0].link === '#crm_lead/L-001', JSON.stringify(notif));
  const selfNotif = db.prepare('SELECT COUNT(*) AS n FROM x_notifications WHERE user = ?').get('saif').n;
  check('author not self-notified', selfNotif === 0);

  // ---- 3. schedule activity → due badge data ----
  r = await call('POST', '/api/x/chatter/crm_lead/L-001',
    { kind: 'activity', activity_type: 'مكالمة هاتفية', due_date: '2026-07-18', body: 'الاتصال بالعميل', author: 'saif' });
  const activityId = r.json.data && r.json.data.id;
  check('POST activity 201 with due_date', r.status === 201 && r.json.data.due_date === '2026-07-18');

  r = await call('GET', '/api/x/chatter/crm_lead/L-001?kind=activity&user=saif');
  check('activity listed + open count', r.json.data.items.length === 1
    && r.json.data.counts.open_activities === 1);

  // ---- 4. mark done ----
  r = await call('PATCH', `/api/x/chatter/item/${activityId}/done`, { done: 1 });
  check('PATCH done', r.status === 200 && r.json.data.done === 1 && r.json.data.meta.done_at);
  r = await call('GET', '/api/x/chatter/crm_lead/L-001?kind=activity&user=saif');
  check('open activity count drops to 0', r.json.data.counts.open_activities === 0);
  r = await call('PATCH', `/api/x/chatter/item/${activityId}/done`, { done: 0 });
  check('PATCH un-done (reopen)', r.json.data.done === 0 && !r.json.data.meta.done_at);

  // ---- 5. logChange hook (crud-engine integration path) ----
  const logId = logChange(db, 'crm_lead', 'L-001', 'crud-engine', 'تغيير الحالة: جديد ← مؤهل');
  check('logChange returns id', typeof logId === 'string' && logId.startsWith('ch_'));
  r = await call('GET', '/api/x/chatter/crm_lead/L-001?kind=log&user=saif');
  check('log entry appears in السجل tab', r.json.data.items.length === 1
    && r.json.data.items[0].kind === 'log');
  const notifAfterLog = db.prepare('SELECT COUNT(*) AS n FROM x_notifications WHERE user = ?').get('manager').n;
  check('log fan-out notified follower', notifAfterLog >= 2);

  // ---- 6. paging newest-first ----
  for (let i = 0; i < 25; i++) {
    await call('POST', '/api/x/chatter/crm_lead/L-001', { kind: 'message', body: 'msg ' + i, author: 'saif' });
  }
  r = await call('GET', '/api/x/chatter/crm_lead/L-001?kind=message&page=1&limit=10&user=saif');
  check('paging meta', r.json.meta.total === 26 && r.json.meta.page === 1 && r.json.meta.limit === 10
    && r.json.data.items.length === 10);
  check('newest first', r.json.data.items[0].body === 'msg 24');
  r = await call('GET', '/api/x/chatter/crm_lead/L-001?kind=message&page=3&limit=10&user=saif');
  check('page 3 has remainder', r.json.data.items.length === 6);

  // ---- 7. unfollow ----
  r = await call('DELETE', '/api/x/chatter/crm_lead/L-001/follow', { user: 'manager' });
  check('DELETE follow', r.status === 200 && r.json.data.following === false);
  r = await call('GET', '/api/x/chatter/crm_lead/L-001?user=manager');
  check('unfollowed state reflected', r.json.data.following === false
    && !r.json.data.followers.includes('manager'));

  // ---- 8. validation errors ----
  r = await call('POST', '/api/x/chatter/crm_lead/L-001', { kind: 'message', body: '', author: 'saif' });
  check('empty message rejected 400', r.status === 400 && r.json.success === false);
  r = await call('POST', '/api/x/chatter/crm_lead/L-001', { kind: 'activity', activity_type: 'اجتماع', due_date: 'tomorrow', author: 'saif' });
  check('bad due_date rejected 400', r.status === 400);
  r = await call('PATCH', '/api/x/chatter/item/does-not-exist/done', {});
  check('done on missing item 404', r.status === 404);
  r = await call('GET', '/api/x/chatter/only-entity');
  check('bad route 404', r.status === 404);

  // ---- 9. XSS payload stored raw, escaped client-side ----
  r = await call('POST', '/api/x/chatter/crm_lead/L-001', { kind: 'message', body: '<img src=x onerror=alert(1)>', author: 'saif' });
  check('script-ish body accepted as data', r.status === 201);

  await new Promise(resolve => server.close(resolve));

  // ---- 10. mountChatter() express-style adapter via shim ----
  const db2 = new DatabaseSync(':memory:');
  const app = makeExpressShim();
  mountChatter(app, db2);
  let s = await app.dispatch('POST', '/api/x/chatter/helpdesk_ticket/T-9', {}, { kind: 'message', body: 'via express mount', author: 'saif' });
  check('mountChatter POST via shim', s.status === 201 && s.json.data.body === 'via express mount');
  s = await app.dispatch('GET', '/api/x/chatter/helpdesk_ticket/T-9', { user: 'saif' }, null);
  check('mountChatter GET via shim', s.status === 200 && s.json.meta.total === 1);
  s = await app.dispatch('POST', '/api/x/chatter/helpdesk_ticket/T-9/follow', {}, { user: 'ops' });
  check('mountChatter follow via shim', s.status === 200 && s.json.data.following === true);

  console.log(`\n== RESULT: ${passCount} passed, ${failCount} failed ==`);
  process.exit(failCount ? 1 : 0);
}

main().catch(error => {
  console.error('HARNESS CRASH:', error);
  process.exit(1);
});
