// Lane A (R1 repair pass) completion tests — T1.1.2, T1.1.3, T1.3.1.
// clean-room; behavior modeled on scripts/test-vnext-kernel-completion.mjs's
// own mock-http-over-mounted-engine pattern (proprietary self, not copied).
//
// Isolated by design: uses its own throwaway SQLite file
// (vnext-data/test-lane-a.db) and never opens vnext-data/vnext.db. The one
// network port this file binds (8121, reserved for Lane A per the project's
// 8120-8129 test-port guardrail) is a bare Node http.Server used only to
// smoke-test static-file reachability of the new client demo page — it is
// NOT server.js and mounts none of the app's real subsystems.
//
// Run: node scripts/test-lane-a-completion.mjs
// Exit code is non-zero if any assertion fails.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const dbPath = path.resolve(here, '../vnext-data/test-lane-a.db');
const clientDir = path.join(repoRoot, 'vnext', 'client');
const TEST_PORT = 8121;
const COMPANY_ID = 'company-r0-demo';

try { fs.unlinkSync(dbPath); } catch (_) {}

let pass = 0;
let fail = 0;
function assert(condition, label, detail) {
  if (condition) {
    pass++;
    console.log(`  PASS: ${label}`);
  } else {
    fail++;
    console.error(`  FAIL: ${label}`, detail !== undefined ? detail : '');
  }
}

console.log('--- APPLYING MIGRATIONS (isolated test DB) ---');
// NOTE: migrations/202_r1_lane_b_completion.mjs (a concurrent, sibling lane's
// file — not owned by Lane A, not touched here) has the exact same ordering
// hazard T1.1.2's audit found and this lane's own 102 migration fixes: it
// ALTERs x_approval_policies/x_approvals, but those tables are created in
// 501_r1_kernel_completion.mjs, which sorts AFTER 202 in filename order. On a
// fresh DB this makes the shared runMigrations() helper abort entirely
// (it stops at the first migration.up() that throws), which would also block
// every migration after it — including this lane's own 102 and 501 itself.
// Documented for the integrator/Lane B; not something Lane A can fix in
// 202_r1_lane_b_completion.mjs. Worked around HERE, for this isolated test
// DB only, by applying each migration file directly instead of going through
// the shared all-or-nothing runMigrations() wrapper, so Lane A's own changes
// (102, plus everything it depends on) can still be verified end-to-end.
const { openMigrationDatabase } = await import('../vnext/server/db/migration-runner.mjs');
const db = openMigrationDatabase(dbPath);
const migrationsDir = path.resolve(here, '../migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.mjs$/.test(f)).sort();
const appliedMigrations = [];
const skippedMigrations = [];
for (const file of migrationFiles) {
  const mod = await import(new URL(file, `file://${migrationsDir.replaceAll('\\', '/')}/`).href);
  const m = mod.migration;
  const already = db.prepare('SELECT 1 FROM schema_migrations WHERE migration_id = ?').get(m.id);
  if (already) continue;
  db.exec('BEGIN IMMEDIATE;');
  try {
    m.up(db);
    db.prepare('INSERT INTO schema_migrations (migration_id, applied_at, checksum) VALUES (?, ?, ?)')
      .run(m.id, new Date().toISOString(), 'test-lane-a-direct-apply');
    db.exec('COMMIT;');
    appliedMigrations.push(m.id);
  } catch (error) {
    db.exec('ROLLBACK;');
    skippedMigrations.push({ id: m.id, error: error.message });
    console.warn(`  SKIPPED ${m.id} (cross-lane blocker, not Lane A's file): ${error.message}`);
  }
}
console.log('Migrations applied:', appliedMigrations);
if (skippedMigrations.length) console.warn('Migrations skipped (see note above):', skippedMigrations.map((s) => s.id));
assert(appliedMigrations.includes('102_r1_lane_a_completion'), 'migration 102_r1_lane_a_completion applied cleanly', skippedMigrations);
assert(appliedMigrations.includes('501_r1_kernel_completion'), '501_r1_kernel_completion (x_doc_states, etc.) applied — needed for Suite 3', skippedMigrations);

const { applyR0ScopeSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db);
console.log('Seed data applied.');

const { mountCrud } = await import('../vnext/server/crud/crud-engine.js');
const { mountDocState } = await import('../vnext/server/state/doc-state.js');

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    end(text) { this.body = text || ''; this.writableEnded = true; },
    json() { return this.body ? JSON.parse(this.body) : null; },
  };
}

function mockReq(method, body, extra) {
  return Object.assign({
    method,
    headers: { host: 'localhost' },
    on(event, cb) {
      if (event === 'data') cb(Buffer.from(JSON.stringify(body || {})));
      if (event === 'end') cb();
    },
  }, extra || {});
}

const wait = () => new Promise((r) => setTimeout(r, 15));

// =====================================================================
// SUITE 1: T1.1.2 — updateRecord() cfg ReferenceError + missing
// acl.entityAclKey() regression (both blocked every write/HTTP route).
// =====================================================================
console.log('\n=== SUITE 1: CRUD ENGINE WRITE-PATH REGRESSION (T1.1.2) ===');
const crud = mountCrud({ db });

// 1.1 — direct function-call path (internal/trusted-caller usage).
console.log('Test 1.1: createRecord + updateRecord direct calls persist fields...');
const leadCfg = crud.registry.crm_lead;
const trustedUser = { userId: 'internal', groups: [] };
const created = crud.createRecord('crm_lead', leadCfg, { name: 'شركة الاختبار', status: 'new' }, trustedUser, COMPANY_ID);
assert(created && created.id, '1.1a create succeeded', created);
let updateThrew = null;
let updated = null;
try {
  updated = crud.updateRecord('crm_lead', created.id, { status: 'contacted', notes: 'تمت المتابعة' }, trustedUser, COMPANY_ID);
} catch (e) {
  updateThrew = e;
}
assert(updateThrew === null, '1.1b updateRecord does not throw ReferenceError', updateThrew && updateThrew.stack);
assert(updated && updated.status === 'contacted' && updated.notes === 'تمت المتابعة', '1.1c update return value has merged fields', updated);
const persistedRow = db.prepare('SELECT data FROM x_records WHERE entity = ? AND id = ?').get('crm_lead', created.id);
const persistedData = JSON.parse(persistedRow.data);
assert(persistedData.status === 'contacted' && persistedData.name === 'شركة الاختبار', '1.1d change persisted to x_records (not just in-memory)', persistedData);

// 1.2 — full HTTP path: POST create -> PATCH update -> GET read, through
// engine.handle(), exercising both the T1.1.2 cfg bug and the missing
// acl.entityAclKey() bug (every route calls it before verb dispatch).
console.log('Test 1.2: HTTP round trip POST create -> PATCH update -> GET read...');
const salesUser = { userId: 'sales_user', role: 'sales', groups: [] };

const createRes = mockRes();
const createReq = mockReq('POST', { name: 'عميل PATCH', status: 'new' }, { octagonUser: salesUser });
crud.handle(createReq, createRes, new URL('http://localhost/api/x/crm_lead/create'));
await wait();
const createEnv = createRes.json();
assert(createRes.statusCode === 200 && createEnv && createEnv.success, '1.2a POST create -> 200 success envelope', createEnv);
const newId = createEnv && createEnv.data && createEnv.data.id;
assert(!!newId, '1.2b created record has an id', createEnv);

const patchRes = mockRes();
const patchReq = mockReq('PATCH', { status: 'qualified', value: 500000 }, { octagonUser: salesUser });
crud.handle(patchReq, patchRes, new URL(`http://localhost/api/x/crm_lead/update/${newId}`));
await wait();
const patchEnv = patchRes.json();
assert(patchRes.statusCode === 200 && patchEnv && patchEnv.success, '1.2c PATCH update -> 200 success (was: 500 ReferenceError)', patchEnv);
assert(patchEnv && patchEnv.data && patchEnv.data.status === 'qualified' && Number(patchEnv.data.value) === 500000, '1.2d PATCH response reflects merged fields', patchEnv);

const readRes = mockRes();
const readReq = mockReq('GET', null, { octagonUser: salesUser });
crud.handle(readReq, readRes, new URL(`http://localhost/api/x/crm_lead/read/${newId}`));
await wait();
const readEnv = readRes.json();
assert(readEnv && readEnv.success && readEnv.data.status === 'qualified', '1.2e GET read confirms the PATCH persisted server-side', readEnv);

// 1.3 — deleteRecord via HTTP (same class-of-bug sweep: no ReferenceError,
// no missing acl.entityAclKey()).
console.log('Test 1.3: DELETE does not hit the same class of bug...');
const delRes = mockRes();
const delReq = mockReq('DELETE', null, { octagonUser: salesUser });
crud.handle(delReq, delRes, new URL(`http://localhost/api/x/crm_lead/delete/${newId}`));
await wait();
const delEnv = delRes.json();
assert(delRes.statusCode === 200 && delEnv && delEnv.success, '1.3 DELETE -> 200 success', delEnv);

// 1.4 — audit route also called the missing acl.entityAclKey(); confirm it
// no longer throws either.
console.log('Test 1.4: GET /api/x/audit/:entity/:id does not throw...');
const auditRes = mockRes();
const auditReq = mockReq('GET', null, { octagonUser: salesUser });
crud.handle(auditReq, auditRes, new URL(`http://localhost/api/x/audit/crm_lead/${created.id}`));
await wait();
assert(auditRes.statusCode === 200, '1.4 audit route -> 200 (was: 500 TypeError acl.entityAclKey is not a function)', auditRes.body);

// =====================================================================
// SUITE 2: T1.3.1(a) — full-graph validation on state-def registration.
// =====================================================================
console.log('\n=== SUITE 2: STATE-DEF FULL-GRAPH VALIDATION (T1.3.1a) ===');
const docState = mountDocState({
  db,
  sendJson: (res, status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); },
  authSessionFromRequest: () => ({ userId: 'admin_user', groups: ['admin'] }),
});
function postDef(entity, body) {
  const res = mockRes();
  const req = mockReq('POST', body, {});
  docState.handle(req, res, new URL(`http://localhost/api/x/state/defs/${entity}`));
  return { res, waitThen: () => wait().then(() => res.json()) };
}

console.log('Test 2.1: reject a def with no states...');
{
  const { waitThen } = postDef('t_no_states', { transitions: [] });
  const env = await waitThen();
  assert(env && env.success === false && Array.isArray(env.meta?.problems) && env.meta.problems.some((p) => p.includes('states')), '2.1 empty states rejected with a specific problem', env);
}

console.log('Test 2.2: reject a transition referencing an undeclared state...');
{
  const { waitThen } = postDef('t_dangling', {
    states: ['draft', 'submitted'],
    transitions: [{ from: 'submitted', to: 'ghost_state', action: 'vanish' }],
  });
  const env = await waitThen();
  assert(env && env.success === false && env.meta.problems.some((p) => p.includes('ghost_state')), '2.2 dangling transition target rejected by name', env);
}

console.log('Test 2.3: reject an unreachable state...');
{
  const { waitThen } = postDef('t_unreachable', {
    states: ['draft', 'submitted', 'orphan'],
    transitions: [{ from: 'draft', to: 'submitted', action: 'submit' }],
  });
  const env = await waitThen();
  assert(env && env.success === false && env.meta.problems.some((p) => p.includes('orphan')), '2.3 unreachable state rejected by name', env);
}

console.log('Test 2.4: accept a valid, fully-reachable graph...');
{
  const { waitThen } = postDef('crm_lead', {
    initial: 'draft',
    states: ['draft', 'submitted', 'posted', 'cancelled'],
    transitions: [
      { from: 'draft', to: 'submitted', action: 'submit' },
      { from: 'submitted', to: 'posted', action: 'confirm', role: 'manager', makerChecker: true },
      { from: 'posted', to: 'cancelled', action: 'cancel', role: 'manager' },
    ],
  });
  const env = await waitThen();
  assert(env && env.success === true, '2.4a valid graph accepted (200)', env);
}
console.log('Test 2.4b: register the *terminal* version used by Suite 3 (posted: terminal)...');
{
  const { waitThen } = postDef('crm_lead', {
    initial: 'draft',
    states: ['draft', 'submitted', { name: 'posted', terminal: true }, 'cancelled'],
    transitions: [
      { from: 'draft', to: 'submitted', action: 'submit' },
      { from: 'submitted', to: 'posted', action: 'confirm', role: 'manager', makerChecker: true },
      { from: 'posted', to: 'cancelled', action: 'cancel', role: 'manager' },
    ],
  });
  const env = await waitThen();
  assert(env && env.success === true, '2.4b terminal-flagged graph registered for crm_lead', env);
  const row = db.prepare('SELECT updated_at, updated_by FROM x_doc_state_defs WHERE entity = ?').get('crm_lead');
  assert(row && row.updated_at && row.updated_by === 'admin_user', '2.4c registration recorded updated_at/updated_by (migration 102)', row);
}

// =====================================================================
// SUITE 3: T1.3.1(b) — posted-document immutability guard.
// =====================================================================
console.log('\n=== SUITE 3: POSTED-DOCUMENT IMMUTABILITY GUARD (T1.3.1b) ===');
// Re-mount doc-state WITH the crud engine wired in, matching the
// INTEGRATION.md instruction for server.js (deps.crudEngine added to the
// mountDocState call). Additive: registers a guard on `crud`, does not
// replace the docState instance used in Suite 2's already-passed requests.
const docStateWired = mountDocState({
  db,
  sendJson: (res, status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); },
  authSessionFromRequest: () => ({ userId: 'manager_user', groups: ['manager'] }),
  crudEngine: crud,
});

const leadA = crud.createRecord('crm_lead', leadCfg, { name: 'عميل نهائي', status: 'new' }, trustedUser, COMPANY_ID);
const leadB = crud.createRecord('crm_lead', leadCfg, { name: 'عميل مسودة', status: 'new' }, trustedUser, COMPANY_ID);

function transition(entity, id, action, extra) {
  const res = mockRes();
  const req = mockReq('POST', { action, ...(extra || {}) }, {});
  docStateWired.handle(req, res, new URL(`http://localhost/api/x/state/${entity}/${id}/transition`));
  return wait().then(() => res.json());
}

console.log('Test 3.1: walk leadA through draft -> submitted -> posted (terminal)...');
{
  const r1 = await transition('crm_lead', leadA.id, 'submit');
  assert(r1 && r1.success && r1.data.state === 'submitted', '3.1a draft -> submitted', r1);
  const r2 = await transition('crm_lead', leadA.id, 'confirm');
  assert(r2 && r2.success && r2.data.state === 'posted', '3.1b submitted -> posted (maker-checker: different user OK)', r2);
}

console.log('Test 3.2: engine.updateRecord() on a posted/terminal record is rejected (409)...');
{
  let threw = null;
  try {
    crud.updateRecord('crm_lead', leadA.id, { notes: 'محاولة تعديل بعد الترحيل' }, trustedUser, COMPANY_ID);
  } catch (e) { threw = e; }
  assert(threw !== null && threw.statusCode === 409, '3.2a update throws 409', threw);
  assert(threw && /حالة نهائية/.test(threw.message), '3.2b error message explains the terminal-state block', threw && threw.message);
}

console.log('Test 3.3: engine.deleteRecord() on the same record is also rejected (409)...');
{
  let threw = null;
  try {
    crud.deleteRecord('crm_lead', leadA.id, trustedUser, COMPANY_ID);
  } catch (e) { threw = e; }
  assert(threw !== null && threw.statusCode === 409, '3.3 delete throws 409 on terminal record', threw);
}

console.log('Test 3.4: PATCH /api/x/crm_lead/update/:id over HTTP surfaces the same 409...');
{
  const res = mockRes();
  const req = mockReq('PATCH', { notes: 'x' }, { octagonUser: salesUser });
  crud.handle(req, res, new URL(`http://localhost/api/x/crm_lead/update/${leadA.id}`));
  await wait();
  const env = res.json();
  assert(res.statusCode === 409 && env && env.success === false, '3.4 HTTP PATCH on terminal record -> 409', env);
}

console.log('Test 3.5: the defined reversal transition (posted -> cancelled) still works...');
{
  const r = await transition('crm_lead', leadA.id, 'cancel');
  assert(r && r.success && r.data.state === 'cancelled', '3.5 reversal transition bypasses the crud-engine guard by design', r);
}

console.log('Test 3.6: a different record still in a non-terminal state updates normally (no over-blocking)...');
{
  let threw = null;
  let doc = null;
  try {
    doc = crud.updateRecord('crm_lead', leadB.id, { status: 'contacted' }, trustedUser, COMPANY_ID);
  } catch (e) { threw = e; }
  assert(threw === null && doc && doc.status === 'contacted', '3.6 non-terminal record update unaffected by the guard', threw || doc);
}

// =====================================================================
// SUITE 4: T1.1.3 — client UI mojibake fix + browser-navigable demo page.
// =====================================================================
console.log('\n=== SUITE 4: CLIENT UI REACHABILITY (T1.1.3) ===');
const MOJIBAKE_RE = /Ã[-¿]|Ø[-¿]Ø?|â€/;

console.log('Test 4.1: required client files exist and are free of mojibake...');
const requiredFiles = ['demo.html', 'chatter-demo.html', 'ui-crud.js', 'entity-ui-registry.js', 'ui-crud.css', 'chatter.js', 'chatter.css'];
for (const f of requiredFiles) {
  const p = path.join(clientDir, f);
  const exists = fs.existsSync(p);
  assert(exists, `4.1 ${f} exists`, p);
  if (exists) {
    const text = fs.readFileSync(p, 'utf8');
    assert(text.length > 0, `4.1 ${f} is non-empty`);
    assert(!MOJIBAKE_RE.test(text), `4.1 ${f} has no cp1252-mojibake Arabic text`, (text.match(MOJIBAKE_RE) || [])[0]);
  }
}

console.log('Test 4.2: demo.html wires ui-crud.js + entity-ui-registry.js and mounts crm_lead...');
{
  const html = fs.readFileSync(path.join(clientDir, 'demo.html'), 'utf8');
  assert(/<script src="ui-crud\.js">/.test(html), '4.2a references ui-crud.js');
  assert(/<script src="entity-ui-registry\.js">/.test(html), '4.2b references entity-ui-registry.js');
  assert(/OX\.crud\.mountEntity\(/.test(html), '4.2c calls OX.crud.mountEntity(...)');
  assert(/'crm_lead'/.test(html) || /"crm_lead"/.test(html), '4.2d mounts the seeded crm_lead entity');
}

console.log('Test 4.3: isolated static-file smoke test on port 8121 (not server.js)...');
{
  // A deliberately minimal, allowlisted static server — mirrors what the
  // integrator's real allowlist should look like (see INTEGRATION.md), NOT
  // the wide-open path.join(__dirname, pathname) handler currently in
  // server.js, which this test intentionally does not exercise or endorse.
  const ALLOW = new Set(['/demo.html', '/chatter-demo.html', '/ui-crud.js', '/ui-crud.css', '/entity-ui-registry.js', '/chatter.js', '/chatter.css']);
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  const staticServer = http.createServer((req, res) => {
    if (!ALLOW.has(req.url)) { res.writeHead(404); res.end('not found'); return; }
    const filePath = path.join(clientDir, req.url);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
      res.writeHead(200);
      res.end(data);
    });
  });
  await new Promise((resolve, reject) => { staticServer.listen(TEST_PORT, resolve).on('error', reject); });
  try {
    const resp = await fetch(`http://localhost:${TEST_PORT}/demo.html`);
    const body = await resp.text();
    assert(resp.status === 200, '4.3a GET /demo.html -> 200', resp.status);
    assert(resp.headers.get('content-type').includes('text/html'), '4.3b correct content-type');
    assert(body.includes('جديد'), '4.3c response body contains correct (non-corrupted) Arabic text', body.includes('جديد'));
    assert(!MOJIBAKE_RE.test(body), '4.3d response body has no mojibake', (body.match(MOJIBAKE_RE) || [])[0]);

    const uiCrudResp = await fetch(`http://localhost:${TEST_PORT}/ui-crud.js`);
    assert(uiCrudResp.status === 200, '4.3e GET /ui-crud.js -> 200 (script the page depends on is also reachable)');

    const blockedResp = await fetch(`http://localhost:${TEST_PORT}/../../../etc/passwd`);
    assert(blockedResp.status === 404 || blockedResp.status === 400, '4.3f path-traversal-shaped request is not served (allowlist works)', blockedResp.status);
  } finally {
    await new Promise((resolve) => staticServer.close(resolve));
  }
}

// =====================================================================
console.log(`\n--- LANE A COMPLETION TESTS: ${pass} passed, ${fail} failed ---`);
try { db.close(); fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}
if (fail > 0) process.exit(1);
