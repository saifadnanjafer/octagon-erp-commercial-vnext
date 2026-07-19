'use strict';
// Disposable SQLite verification for P0.2. Never opens octagon-erp/database.db.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { mountCrud } = require('../server/crud-engine');
const { mountAclHttp } = require('../server/acl-http-adapter');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-p02-acl-'));
const dbFile = path.join(tempDir, 'commercial-acl-test.db');
const db = new DatabaseSync(dbFile);

function response() {
  return {
    status: 0, headers: {}, body: null, writableEnded: false,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    writeHead(status) { this.status = status; },
    end(raw) { this.writableEnded = true; this.body = JSON.parse(raw); },
  };
}
function request(method, user, body) {
  return { method, headers: {}, testUser: user, testBody: body == null ? '' : JSON.stringify(body), socket: { remoteAddress: '127.0.0.1' } };
}
function url(pathname) { return new URL(pathname, 'http://localhost'); }
function sendJson(res, status, payload) { res.writeHead(status); res.end(JSON.stringify(payload)); }
const readRequestBody = req => Promise.resolve(req.testBody || '');
const crud = mountCrud({ db, entitiesFile: path.join(root, 'server', 'entities.json'), tablesFile: path.join(root, 'server', 'x-tables.sql'), sendJson, readRequestBody });
const adapter = mountAclHttp({ db, entitiesFile: path.join(root, 'server', 'entities.json'), sendJson, readRequestBody, requestUser: req => req.testUser });
const deniedUser = { userId: 'finance-user', groups: ['finance.user'] };
const admin = { userId: 'system-admin', groups: ['system.admin'] };

async function dispatch(req, pathname) {
  const res = response();
  const parsed = url(pathname);
  const handled = adapter.handle(req, res, parsed);
  if (!handled) crud.handle(req, res, parsed);
  await new Promise(resolve => setImmediate(resolve));
  return res;
}

(async () => {
  // A denied write is answered by the adapter and never reaches P0.1 CRUD.
  let res = await dispatch(request('POST', deniedUser, { name: 'must not persist' }), '/api/x/crm_lead/create');
  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.equal(res.body.meta.code, 'FORBIDDEN');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM x_records WHERE entity = ?').get('crm_lead').n, 0);

  // Legacy system.admin group resolves to admin fallback and passes.
  res = await dispatch(request('POST', admin, { id: 'lead-admin', name: 'عميل إداري' }), '/api/x/crm_lead/create');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  // Existing Arabic matrix client paths are real plain-HTTP routes.
  res = await dispatch(request('GET', admin), '/api/x/_acl');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.roles.some(role => role.role === 'admin' && role.label_ar));
  res = await dispatch(request('PUT', admin, { label_ar: 'مندوب محدود', grants: [{ perm: 'sales:crm_lead:read', scope: 'own' }] }), '/api/x/_acl/limited_sales');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.grants, [{ perm: 'sales:crm_lead:read', scope: 'own' }]);

  // `own` scopes are genuinely filtered rather than falling through to CRUD's
  // global list query. The two rows are direct fixture inserts to isolate ACL.
  const insert = db.prepare('INSERT INTO x_records (entity, id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, 0)');
  insert.run('crm_lead', 'lead-alice', JSON.stringify({ name: 'Alice lead', status: 'new' }), '2026-07-17T00:00:00Z', '2026-07-17T00:00:00Z', 'alice');
  insert.run('crm_lead', 'lead-bob', JSON.stringify({ name: 'Bob lead', status: 'new' }), '2026-07-17T00:00:00Z', '2026-07-17T00:00:00Z', 'bob');
  res = await dispatch(request('GET', { userId: 'alice', role: 'limited_sales' }), '/api/x/crm_lead/list');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.map(row => row.id), ['lead-alice']);
  res = await dispatch(request('GET', { userId: 'alice', role: 'limited_sales' }), '/api/x/crm_lead/read/lead-bob');
  assert.equal(res.status, 403);
  assert.equal(res.body.meta.code, 'OUT_OF_SCOPE');

  console.log('P0.2 ACL plain-HTTP harness: PASS');
  console.log('denied create=403 before CRUD; legacy admin=create 200; matrix GET/PUT=200; own list/read scope=verified');
})().catch(error => {
  console.error('P0.2 ACL plain-HTTP harness: FAIL');
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
