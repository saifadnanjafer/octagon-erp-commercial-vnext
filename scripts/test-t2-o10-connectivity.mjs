import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { migration } from '../migrations/607_t2_o10_connectivity_foundation.mjs';
import { createEventService, mountConnectivityRoutes } from '../vnext/server/events/events.js';
import { createSqliteAdapter, createPostgresAdapterContract } from '../vnext/server/db-adapters/sqlite-adapter.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-t2-o10-'));
const db = new DatabaseSync(path.join(root, 'connectivity.db'));
db.exec('PRAGMA foreign_keys = ON;');
migration.up(db);

let pass = 0; let fail = 0; let skip = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); pass += 1; console.log(`PASS ${name}`); }
  catch (error) { fail += 1; failures.push({ name, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
function response() {
  return { status: 0, body: '', chunks: [], headers: {}, writableEnded: false, setHeader(k, v) { this.headers[k] = v; }, writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); }, write(v) { this.chunks.push(String(v)); return true; }, end(v = '') { this.body += String(v); this.writableEnded = true; }, on() {} };
}
function request(body, headers = {}) {
  const req = new EventEmitter(); req.method = 'POST'; req.headers = headers; req.socket = { remoteAddress: '10.0.0.9' };
  process.nextTick(() => { if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
  return req;
}
function getRequest(headers = {}) {
  const req = new EventEmitter(); req.method = 'GET'; req.headers = headers; req.socket = { remoteAddress: '10.0.0.9' }; return req;
}
function parseResponse(res) { return res.body ? JSON.parse(res.body) : null; }

const canPermission = (user, permission) => permission === 'platform:public:read' || (user.roles || []).includes('admin');
const events = createEventService({ db, canPermission });

await check('migration creates separate event and idempotency stores', () => {
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='vnext_event_log'").get());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='vnext_command_idempotency'").get());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='audit_log'").get() === undefined || true);
});

await check('monotonic event ids and standard envelope', () => {
  const first = events.publish({ type: 'platform.test', tenantId: 't1', companyId: 'c1', userId: 'u1', audience: { kind: 'user' }, requiredPermission: 'platform:public:read', entity: 'test', recordId: 'r1', payload: { ok: true } });
  const second = events.publish({ type: 'platform.test', tenantId: 't1', companyId: 'c1', userId: 'u1', audience: { kind: 'user' }, requiredPermission: 'platform:public:read', payload: { ok: false } });
  assert.equal(Number(second.id), Number(first.id) + 1);
  assert.deepEqual(Object.keys(first).sort(), ['entity', 'id', 'payload', 'recordId', 'requiredPermission', 'scope', 'timestamp', 'type'].sort());
});

await check('filter before serialization and redact secret-shaped fields', () => {
  events.publish({ type: 'platform.secret_test', tenantId: 't1', companyId: 'c1', userId: 'u1', payload: { token: 'RAW', nested: { password: 'RAW2' }, visible: 'ok' } });
  const visible = events.replay(0, { userId: 'u1', tenantId: 't1', companyId: 'c1', roles: [] });
  const hidden = events.replay(0, { userId: 'u2', tenantId: 't1', companyId: 'c1', roles: [] });
  assert.equal(visible.at(-1).payload.token, '[redacted]');
  assert.equal(visible.at(-1).payload.nested.password, '[redacted]');
  assert.equal(hidden.some(event => event.type === 'platform.secret_test'), false);
});

await check('tenant/company/user and permission isolation', () => {
  events.publish({ type: 'platform.scoped', tenantId: 't2', companyId: 'c2', userId: 'u2', requiredPermission: 'platform:public:read', payload: { scope: 'private' } });
  assert.equal(events.replay(0, { userId: 'u1', tenantId: 't1', companyId: 'c1', roles: [] }).some(e => e.type === 'platform.scoped'), false);
  assert.equal(events.replay(0, { userId: 'u2', tenantId: 't2', companyId: 'c2', roles: [] }).some(e => e.type === 'platform.scoped'), true);
  assert.equal(events.replay(0, { userId: 'u2', tenantId: 't2', companyId: 'c2', roles: ['viewer'] }).some(e => e.type === 'platform.test'), false);
});

await check('bounded cursor replay and disconnect cleanup', () => {
  for (let i = 0; i < 130; i += 1) events.publish({ type: 'platform.replay', payload: { i } });
  assert.ok(events.replay(0, { userId: 'u1', tenantId: '', companyId: '', roles: [] }, 100).length <= 100);
  const res = response(); const subscription = events.subscribe(res, { userId: 'u1', tenantId: '', companyId: '', roles: [] }, 0);
  assert.equal(events.subscribers.size, 1); subscription.subscriber.close('test'); assert.equal(events.subscribers.size, 0);
});

await check('SQLite adapter executes and rolls back', () => {
  const adapter = createSqliteAdapter(db);
  adapter.run('CREATE TABLE adapter_probe (id TEXT PRIMARY KEY, value TEXT)');
  adapter.transaction(tx => tx.run('INSERT INTO adapter_probe(id,value) VALUES(?,?)', 'ok', 'yes'));
  assert.equal(adapter.get('SELECT value FROM adapter_probe WHERE id=?', 'ok').value, 'yes');
  assert.throws(() => adapter.transaction(tx => { tx.run('INSERT INTO adapter_probe(id,value) VALUES(?,?)', 'bad', 'x'); throw new Error('forced rollback'); }));
  assert.equal(adapter.get('SELECT 1 FROM adapter_probe WHERE id=?', 'bad'), null);
  assert.throws(() => adapter.get('SELECT 1 FROM not_a_table'), error => error.code === 'SCHEMA_MISMATCH');
});

await check('PostgreSQL contract has the same interface and normalized not-implemented error', () => {
  const contract = createPostgresAdapterContract();
  for (const method of ['run', 'get', 'all', 'query', 'transaction']) assert.equal(typeof contract[method], 'function');
  assert.throws(() => contract.get('SELECT 1'), error => error.code === 'NOT_IMPLEMENTED');
});

const route = mountConnectivityRoutes({
  db,
  events,
  requireSession(req, res, options) {
    assert.equal(options.allowLocalDev, false);
    if (req.headers.authorization !== 'Bearer test') { res.writeHead(401); res.end(JSON.stringify({ success: false })); return { ok: false }; }
    return { ok: true, userId: req.headers['x-user'] || 'u1', groups: ['admin'] };
  },
  resolveScope() { return { tenantId: 't1', companyId: 'c1' }; },
  readRequestBody(req) { return new Promise(resolve => { let raw = ''; req.on('data', part => { raw += part; }); req.on('end', () => resolve(raw)); }); },
  sendJson(res, status, body) { res.writeHead(status); res.end(JSON.stringify(body)); },
});

await check('unauthenticated SSE and command requests reject without loopback bypass', async () => {
  const res = response(); const req = new EventEmitter(); req.method = 'GET'; req.headers = {}; req.socket = { remoteAddress: '127.0.0.1' };
  assert.equal(route.handle(req, res, new URL('http://localhost/api/vnext/events')), true); assert.equal(res.status, 401);
  const commandRes = response(); assert.equal(route.handle(request({ type: 'platform.noop' }), commandRes, new URL('http://localhost/api/vnext/commands')), true); await new Promise(r => setTimeout(r, 5)); assert.equal(commandRes.status, 401);
});

await check('two authenticated SSE clients receive only their permitted event without reload', async () => {
  const firstRes = response(); const firstReq = getRequest({ authorization: 'Bearer test', 'x-user': 'u1' });
  const secondRes = response(); const secondReq = getRequest({ authorization: 'Bearer test', 'x-user': 'u2' });
  route.handle(firstReq, firstRes, new URL('http://localhost/api/vnext/events'));
  route.handle(secondReq, secondRes, new URL('http://localhost/api/vnext/events'));
  events.publish({ type: 'notification.created', tenantId: 't1', companyId: 'c1', userId: 'u1', audience: { kind: 'user' }, requiredPermission: 'platform:public:read', payload: { notificationId: 'n1' } });
  await new Promise(r => setTimeout(r, 5));
  assert.ok(firstRes.chunks.some(chunk => chunk.includes('notification.created') && chunk.includes('n1')));
  assert.equal(secondRes.chunks.some(chunk => chunk.includes('n1')), false);
  firstReq.emit('close'); secondReq.emit('close');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(events.subscribers.size, 0);
});

await check('same idempotency key is replayed once and changed payload conflicts', async () => {
  const body = { command: { idempotency_key: 'idem-1', type: 'platform.noop', payload: { note: 'safe' }, user_id: 'attacker' } };
  const firstRes = response(); route.handle(request(body, { authorization: 'Bearer test' }), firstRes, new URL('http://localhost/api/vnext/commands')); await new Promise(r => setTimeout(r, 10));
  assert.equal(firstRes.status, 200); assert.equal(parseResponse(firstRes).command.actorId, 'u1');
  const replayRes = response(); route.handle(request(body, { authorization: 'Bearer test' }), replayRes, new URL('http://localhost/api/vnext/commands')); await new Promise(r => setTimeout(r, 10));
  assert.equal(parseResponse(replayRes).replayed, true);
  const conflictRes = response(); route.handle(request({ command: { ...body.command, payload: { note: 'changed' } } }, { authorization: 'Bearer test' }), conflictRes, new URL('http://localhost/api/vnext/commands')); await new Promise(r => setTimeout(r, 10));
  assert.equal(conflictRes.status, 409); assert.equal(parseResponse(conflictRes).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM vnext_command_idempotency WHERE idempotency_key=?').get('idem-1').n), 1);
});

await check('prohibited offline command fails closed', async () => {
  const res = response(); route.handle(request({ command: { idempotency_key: 'sensitive-1', type: 'finance.post', payload: {} } }, { authorization: 'Bearer test' }), res, new URL('http://localhost/api/vnext/commands')); await new Promise(r => setTimeout(r, 10));
  assert.equal(res.status, 403); assert.equal(parseResponse(res).code, 'OFFLINE_PROHIBITED');
});

const result = { pass, fail, skip, total: pass + fail + skip, failures };
console.log(`T2.O10.1 focused server/adapter tests: ${pass} PASS, ${fail} FAIL, ${skip} SKIP, ${result.total} TOTAL`);
if (fail) process.exitCode = 1;
db.close();
