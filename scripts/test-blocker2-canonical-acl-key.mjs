// clean-room; behavior modeled on scripts/test-lane-b-completion.mjs test-harness pattern (proprietary self, not copied)
//
// Blocker 2 (duplicate entityAclKey) regression suite. Proves crud-engine.js
// no longer carries its own local entityAclKey() and instead consumes
// acl-engine.js's canonical implementation for every HTTP verb, that no CRUD
// route returns 500, that permissions/row-scopes are still enforced, and
// that no fallback silently bypasses ACL. Isolated: its own throwaway SQLite
// file, never vnext-data/vnext.db, no network port (in-process mock req/res).
'use strict';

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-blocker2-acl-key.db');
const migrationsDir = path.resolve(here, '../migrations');

let failures = 0;
function check(label, condition, details) {
  if (condition) console.log('  PASS:', label);
  else { failures += 1; console.error('  FAIL:', label, details === undefined ? '' : details); }
}

for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }

console.log('--- APPLYING MIGRATIONS (plain filename order, matches real boot) ---');
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
const companyId = db.prepare('SELECT company_id FROM r0_tenant_root LIMIT 1').get().company_id;

// Grep-level proof crud-engine.js no longer defines its own entityAclKey.
const crudSource = fs.readFileSync(path.resolve(here, '../vnext/server/crud/crud-engine.js'), 'utf8');
check('0.1 crud-engine.js no longer defines a local entityAclKey()', !/function entityAclKey/.test(crudSource), 'local duplicate still present');
check('0.2 crud-engine.js calls the canonical acl.entityAclKey()', (crudSource.match(/acl\.entityAclKey\(/g) || []).length === 2, crudSource.match(/acl\.entityAclKey\([^)]*\)/g));

const acl = require('../vnext/server/acl/acl-engine.js');
const { mountCrud } = require('../vnext/server/crud/crud-engine.js');

// Seed a collection with NO explicit collection_registry.acl value, to
// exercise the section-derived fallback path (this is exactly the path
// where the old local duplicate in crud-engine.js used to diverge from
// acl-engine.js's canonical derivation — the bare entity name vs.
// "<section>:<name-without-prefix>").
db.prepare(`INSERT INTO collection_registry (collection, label_ar, label_ar_plural, section, sequence, seq_field, chatter, acl, status_key)
  VALUES ('ops_widget', 'ودجة', 'ودجات', 'ops', NULL, NULL, 0, NULL, 'status')`).run();
db.prepare(`INSERT INTO field_registry (collection, field, type, label_ar, required) VALUES ('ops_widget','name','text','الاسم',1)`).run();

db.prepare("INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES ('tester', 'مختبر')").run();
db.prepare("INSERT OR REPLACE INTO x_acl_grants (role, perm, scope) VALUES ('tester', 'ops:*', 'all')").run();
db.prepare("INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES ('nobody', 'بلا صلاحية')").run();

const expectedKey = acl.entityAclKey('ops_widget', db);
check('1.1 canonical entityAclKey derives the section-prefixed key for an entity with no explicit acl column', expectedKey === 'ops:widget', expectedKey);

const engine = mountCrud({ db, authSessionFromRequest: () => null });

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: '', writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status) { this.statusCode = status; },
    end(text) { this.body = text || ''; this.writableEnded = true; },
  };
}
function mockReq(method, body, user) {
  return {
    method,
    headers: { host: 'localhost', 'x-company-id': companyId },
    octagonUser: user,
    on(event, cb) {
      if (event === 'data' && body !== undefined) cb(Buffer.from(JSON.stringify(body)));
      if (event === 'end') cb();
    },
  };
}
function json(res) { return JSON.parse(res.body); }
async function call(method, pathname, body, user) {
  const req = mockReq(method, body, user);
  const res = mockRes();
  const url = new URL('http://localhost' + pathname);
  engine.handle(req, res, url);
  // create/update go through a readBody() promise chain; flush microtasks.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.statusCode, json: res.body ? json(res) : null };
}

const testerUser = { userId: 'u_tester', role: 'tester', groups: [] };
const nobodyUser = { userId: 'u_nobody', role: 'nobody', groups: [] };

console.log('\n=== SUITE 2: FULL CRUD LIFECYCLE THROUGH THE CANONICAL KEY, NO 500s ===');
const created = await call('POST', '/api/x/ops_widget/create', { name: 'Widget One' }, testerUser);
check('2.1 create succeeds (not 500)', created.status === 200, created);
const recId = created.json?.data?.id;
check('2.2 create returned a record id', !!recId);

const read1 = await call('GET', `/api/x/ops_widget/read/${recId}`, undefined, testerUser);
check('2.3 read succeeds (not 500)', read1.status === 200, read1);
check('2.4 read returns the created name', read1.json?.data?.name === 'Widget One');

const updated = await call('PATCH', `/api/x/ops_widget/update/${recId}`, { name: 'Widget One Updated' }, testerUser);
check('2.5 update succeeds (not 500)', updated.status === 200, updated);
check('2.6 update applied', updated.json?.data?.name === 'Widget One Updated', updated);

const listed = await call('GET', '/api/x/ops_widget/list', undefined, testerUser);
check('2.7 list succeeds (not 500)', listed.status === 200, listed);

const summarized = await call('GET', '/api/x/ops_widget/summary', undefined, testerUser);
check('2.8 summary succeeds (not 500)', summarized.status === 200, summarized);

const audited = await call('GET', `/api/x/audit/ops_widget/${recId}`, undefined, testerUser);
check('2.9 audit history succeeds (not 500)', audited.status === 200, audited);
check('2.10 audit history recorded both create and update', Array.isArray(audited.json?.data) && audited.json.data.length >= 2, audited.json);

const deleted = await call('DELETE', `/api/x/ops_widget/delete/${recId}`, undefined, testerUser);
check('2.11 delete succeeds (not 500)', deleted.status === 200, deleted);

console.log('\n=== SUITE 3: ACL STILL ENFORCED — NO SILENT BYPASS ===');
const forbiddenCreate = await call('POST', '/api/x/ops_widget/create', { name: 'Should Be Denied' }, nobodyUser);
check('3.1 a role with no matching grant is denied (403), not allowed and not a 500', forbiddenCreate.status === 403, forbiddenCreate);

const forbiddenRead = await call('GET', `/api/x/ops_widget/read/${recId}`, undefined, nobodyUser);
check('3.2 read is denied for the same ungranted role (403)', forbiddenRead.status === 403, forbiddenRead);

const unknownEntity = await call('GET', '/api/x/entity_that_does_not_exist/list', undefined, testerUser);
check('3.3 an unregistered entity is 404, not a 500 or a silent pass-through', unknownEntity.status === 404, unknownEntity);

console.log('\n=== SUITE 4: SEEDED ENTITIES (EXPLICIT collection_registry.acl) STILL WORK IDENTICALLY ===');
check('4.1 crm_lead resolves its explicit acl column via the canonical function', acl.entityAclKey('crm_lead', db) === 'sales:crm_lead', acl.entityAclKey('crm_lead', db));
db.prepare("INSERT OR REPLACE INTO x_acl_grants (role, perm, scope) VALUES ('tester', 'sales:crm_lead:*', 'all')").run();
const leadCreate = await call('POST', '/api/x/crm_lead/create', { name: 'Lead One', status: 'new' }, testerUser);
check('4.2 crm_lead create succeeds through the same canonical-key code path (not 500)', leadCreate.status === 200, leadCreate);

console.log('\n--- SUMMARY ---');
console.log(failures === 0 ? 'BLOCKER 2 SUITE: ALL PASSED' : `BLOCKER 2 SUITE: ${failures} FAILURE(S)`);
if (failures) process.exitCode = 1;

for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }
