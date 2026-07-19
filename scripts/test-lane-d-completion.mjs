// clean-room; behavior modeled on scripts/test-vnext-kernel-completion.mjs Suite pattern (proprietary self, not copied)
// ============================================================================
// Lane D completion test suite (T1.12.1 module framework, T1.13.1 org/fiscal
// masters + company switcher, T1.14.1 auth hardening completion).
//
// Isolated by design: uses its own throwaway SQLite file
// (vnext-data/test-lane-d.db, deleted+recreated on every run) and its own
// HTTP port (127.0.0.1:8124, inside the project's reserved 8120-8129 test
// range) — never the shared vnext-data/vnext.db or the app's real port.
//
// SECRET-HANDLING: this file never console.logs a raw TOTP secret, raw API
// key, or candidate password. Where a real generated value must be
// exercised (e.g. computing the current valid TOTP code to prove
// enrollment works), it is held in a local variable and only ever
// compared/asserted — never printed. Any example values shown in
// TASK.md/TEST.md are fixed placeholders, not values captured from a real
// run.
// ============================================================================
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, '../vnext-data/test-lane-d.db');
const PORT = 8124;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

let failures = 0;
function pass(label) { console.log(`  PASS: ${label}`); }
function fail(label, detail) { failures += 1; console.error(`  FAIL: ${label}`, detail === undefined ? '' : detail); }
function check(condition, label, detail) { condition ? pass(label) : fail(label, detail); }

// ---------------------------------------------------------------------------
// Isolated DB bootstrap
// ---------------------------------------------------------------------------
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(`${dbPath}-wal`); } catch (_) {}
try { fs.unlinkSync(`${dbPath}-shm`); } catch (_) {}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

// Mirrors the engine-created table server.js sets up at boot (see
// server.js:2741) — not part of any migration, needed here only so
// audit.js's redactPayload() role lookup doesn't throw on a missing table.
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    userId TEXT,
    createdAt INTEGER,
    expiresAt INTEGER,
    role TEXT
  );
`);

console.log('--- RUNNING MIGRATIONS (isolated vnext-data/test-lane-d.db) ---');
import { runMigrations } from '../vnext/server/db/migration-runner.mjs';
const migrationResult = await runMigrations({ dbPath, direction: 'up' });
console.log('Migrations applied:', migrationResult.migrations.join(', ') || '(already applied)');

import { applyR0ScopeSeed } from '../vnext/server/db/seed-runner.mjs';
applyR0ScopeSeed(db);
console.log('R0 scope seed applied.');

// Fixture companies. NOTE: migrations/401_r1_lane_d_tables.mjs's
// "copy r0_tenant_root into companies" step runs during the migration
// phase, BEFORE the seed phase populates r0_tenant_root — so on a fresh
// boot the SQL `companies` table starts genuinely empty. Direct fixture
// inserts here are standard test setup (same pattern the shared
// test-vnext-kernel-completion.mjs uses for x_records/x_approvals), not a
// migration or production seed. See vnext/server/org/TASK.md "Known
// discrepancy" for the full trace and the follow-up this leaves open
// (a company-creation endpoint was not in this pass's assigned scope).
//
// Also register both fixture ids in r0_tenant_root: crud-engine.js's
// createRecord() (Lane A, not owned by this lane) currently validates
// company_id against r0_tenant_root — NOT the new `companies` table — so
// x_records writes only succeed for ids known there. This is itself part
// of the T1.13.1 "not fully wired" gap this pass documents (see
// vnext/server/org/TASK.md); registering in both tables mirrors what
// migration 401's own r0_tenant_root->companies copy step already assumes
// (the two id spaces are meant to be the same set).
db.prepare('INSERT INTO r0_tenant_root (company_id, legal_name) VALUES (?, ?)').run('company_a_demo', 'شركة أ التجريبية');
db.prepare('INSERT INTO r0_tenant_root (company_id, legal_name) VALUES (?, ?)').run('company_b_demo', 'شركة ب التجريبية');
db.prepare('INSERT INTO companies (company_id, name, currency, locale) VALUES (?, ?, ?, ?)').run('company_a_demo', 'شركة أ التجريبية', 'IQD', 'ar');
db.prepare('INSERT INTO companies (company_id, name, currency, locale) VALUES (?, ?, ?, ?)').run('company_b_demo', 'شركة ب التجريبية', 'IQD', 'ar');

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------
import acl from '../vnext/server/acl/acl-engine.js';
import { mountCrud } from '../vnext/server/crud/crud-engine.js';
import { mountModuleRoutes, DEFAULT_MODULES_DIR } from '../vnext/server/modules/module-routes.js';
import lifecycle from '../vnext/server/modules/module-lifecycle.js';
import { discoverModules } from '../vnext/server/modules/module-framework.js';
import { mountOrgRoutes } from '../vnext/server/org/org-routes.js';
import org from '../vnext/server/org/org-structures.js';
import { mountAuthRoutes } from '../vnext/server/auth/auth-routes.js';
import authHardening from '../vnext/server/auth/auth-hardening.js';

// acl-engine.js is concurrently owned/edited by other lanes. If a required
// export (entityAclKey, used internally by crud-engine.js) is momentarily
// missing during someone else's in-progress edit, this test still needs a
// stable target to verify Lane D's OWN composition against — so it applies
// a local, in-memory-only shim (never touches any file) matching the
// existing ACL-key convention (collection_registry.acl, e.g.
// "sales:crm_lead"). This is a no-op once acl-engine.js defines its own
// entityAclKey.
if (typeof acl.entityAclKey !== 'function') {
  console.warn('[lane-d test] acl-engine.js has no entityAclKey export yet (another lane\'s in-progress work) — applying a local test-only shim. No file was modified.');
  acl.entityAclKey = (entityName) => {
    const row = db.prepare('SELECT acl FROM collection_registry WHERE collection = ?').get(entityName);
    return row && row.acl ? row.acl : entityName;
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Single test-session convention shared by every route mounted below:
// header `x-test-user` (required) + `x-test-role` (optional ACL role name,
// e.g. "sales"; "admin" maps to the system.admin group these routes check).
function testRequireSession(req) {
  const userId = req.headers['x-test-user'];
  if (!userId) return { ok: false };
  const role = req.headers['x-test-role'] || '';
  const groups = role === 'admin' ? ['system.admin'] : [];
  return { ok: true, mode: 'test', userId, groups, user: { id: userId, role, roleId: role, groups } };
}

const moduleRoutes = mountModuleRoutes({ db, sendJson, readRequestBody, requireSession: testRequireSession });
const orgRoutes = mountOrgRoutes({ db, sendJson, readRequestBody, requireSession: testRequireSession });
const authRoutes = mountAuthRoutes({ db, sendJson, readRequestBody, requireSession: testRequireSession });
const aclHttp = acl.mountAclHttp({ db, sendJson, requireSession: (req) => testRequireSession(req) });
const crudEngine = mountCrud({ db, sendJson, readRequestBody, requireSession: testRequireSession });

// Same dispatch precedence as server.js: specialized engines before the
// generic CRUD fallback (server.js:1819-1827), reproduced here purely as a
// test harness — this file mounts nothing into server.js itself.
const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, BASE_URL);
  // Simulates the exact integration point documented in
  // vnext/server/org/INTEGRATION.md: resolve the caller's active company
  // (set via POST /api/x/org/active-company) and attach it as req.companyId
  // before dispatching to ACL/CRUD, so crud-engine's existing
  // resolveCompanyId(req, db) (T1.2.2's row-scope mechanism) honors it.
  const testUser = req.headers['x-test-user'];
  if (testUser && !req.headers['x-company-id']) {
    const active = org.getActiveCompany(db, testUser);
    if (active) req.companyId = active.company_id;
  }
  if (moduleRoutes.handle(req, res, requestUrl)) return;
  if (orgRoutes.handle(req, res, requestUrl)) return;
  if (authRoutes.handle(req, res, requestUrl)) return;
  if (aclHttp.handle(req, res, requestUrl)) return;
  if (crudEngine.handle(req, res, requestUrl)) return;
  sendJson(res, 404, { success: false, error: 'not found' });
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, HOST, resolve);
});
console.log(`Test HTTP server listening on ${BASE_URL}`);

async function api(pathname, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ success: false, error: 'invalid JSON response' }));
  return { status: response.status, payload };
}

const asAdmin = { 'x-test-user': 'user_admin', 'x-test-role': 'admin' };
const asAlice = { 'x-test-user': 'user_alice', 'x-test-role': 'sales' };
const asBob = { 'x-test-user': 'user_bob', 'x-test-role': 'sales' };

// =============================================================================
// SUITE A: MODULE / EXTENSION FRAMEWORK (T1.12.1)
// =============================================================================
console.log('\n=== SUITE A: MODULE / EXTENSION FRAMEWORK (T1.12.1) ===');

console.log('Test A.1: disk discovery finds the sample module...');
{
  const { discovered, errors } = discoverModules(DEFAULT_MODULES_DIR);
  check(errors.length === 0, 'no manifest discovery errors', errors);
  check(discovered.some((m) => m.id === 'loyalty_tier_demo'), 'loyalty_tier_demo discovered on disk');
}

console.log('Test A.2: GET /api/x/modules is admin-gated...');
{
  const anon = await api('/api/x/modules');
  check(anon.status === 401, 'unauthenticated list is rejected (401)', anon);
  const nonAdmin = await api('/api/x/modules', { headers: asAlice });
  check(nonAdmin.status === 403, 'non-admin list is rejected (403)', nonAdmin);
  const adminList = await api('/api/x/modules', { headers: asAdmin });
  check(adminList.status === 200 && adminList.payload.success, 'admin list succeeds');
  check(adminList.payload.data.available.some((m) => m.id === 'loyalty_tier_demo'), 'sample module listed as available before install');
}

console.log('Test A.3: install adds custom field + menu + workflow + runs migration + fires onInstall hook...');
let installResult;
{
  const res = await api('/api/x/modules/loyalty_tier_demo/install', { method: 'POST', headers: asAdmin });
  installResult = res;
  check(res.status === 200 && res.payload.success, 'install call succeeds', res.payload);
  check(res.payload.data && res.payload.data.active === true, 'module marked active after install');

  const field = db.prepare('SELECT * FROM x_custom_fields WHERE entity = ? AND key = ?').get('crm_lead', 'loyalty_tier');
  check(!!field, 'custom field crm_lead.loyalty_tier exists after install');

  const menu = db.prepare('SELECT * FROM x_module_menu_items WHERE id = ?').get('loyalty_tier_demo_menu');
  check(!!menu, 'menu item loyalty_tier_demo_menu exists after install');

  const workflow = db.prepare("SELECT * FROM x_records WHERE entity = 'workflow' AND id = ?").get('wf_loyalty_tier_demo');
  check(!!workflow, 'workflow definition wf_loyalty_tier_demo exists after install');

  const logRows = db.prepare('SELECT * FROM x_loyalty_tier_demo_log').all();
  check(logRows.length === 1 && /installed/.test(logRows[0].note), 'onInstall hook fired exactly once (its declared migration table has the log row)');

  const patches = db.prepare('SELECT patch_type FROM x_module_patches WHERE module = ?').all('loyalty_tier_demo').map((r) => r.patch_type).sort();
  check(JSON.stringify(patches) === JSON.stringify(['custom_field', 'menu_item', 'schema_migration', 'workflow']), 'all 4 patch types tracked in x_module_patches', patches);
}

console.log('Test A.4: field appears through the real HTTP CRUD path...');
{
  const created = await api('/api/x/crm_lead/create', {
    method: 'POST', headers: { ...asAlice, 'x-company-id': 'company_a_demo' },
    body: { name: 'Test Lead With Loyalty', loyalty_tier: 'gold' },
  });
  check(created.status === 200 && created.payload.success, 'crm_lead create with the module-added field succeeds', created.payload);
  check(created.payload.data && created.payload.data.loyalty_tier === 'gold', 'loyalty_tier value round-trips through CRUD');
}

console.log('Test A.5: uninstall retracts every patch — zero residue...');
{
  const res = await api('/api/x/modules/loyalty_tier_demo/uninstall', { method: 'POST', headers: asAdmin });
  check(res.status === 200 && res.payload.success, 'uninstall call succeeds', res.payload);

  const field = db.prepare('SELECT * FROM x_custom_fields WHERE entity = ? AND key = ?').get('crm_lead', 'loyalty_tier');
  check(!field, 'custom field removed after uninstall');

  const menu = db.prepare('SELECT * FROM x_module_menu_items WHERE id = ?').get('loyalty_tier_demo_menu');
  check(!menu, 'menu item removed after uninstall');

  const workflow = db.prepare("SELECT * FROM x_records WHERE entity = 'workflow' AND id = ?").get('wf_loyalty_tier_demo');
  check(!workflow, 'workflow definition removed after uninstall');

  const patches = db.prepare('SELECT * FROM x_module_patches WHERE module = ?').all('loyalty_tier_demo');
  check(patches.length === 0, 'no orphan x_module_patches rows remain');

  const installedRow = db.prepare('SELECT * FROM x_installed_modules WHERE module = ?').get('loyalty_tier_demo');
  check(!installedRow, 'x_installed_modules row fully removed (not just deactivated)');

  let logTableGone = false;
  try { db.prepare('SELECT * FROM x_loyalty_tier_demo_log').all(); } catch (_) { logTableGone = true; }
  check(logTableGone, 'declared migration was reverted: the module\'s own log table no longer exists');
}

console.log('Test A.6: two modules contributing the same field conflict deterministically...');
{
  const tmpModulesDir = path.resolve(here, '../vnext-data/test-lane-d-conflict-modules');
  fs.rmSync(tmpModulesDir, { recursive: true, force: true });
  for (const id of ['conflict_mod_a', 'conflict_mod_b']) {
    const dir = path.join(tmpModulesDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      id, version: '1.0.0', dependencies: [],
      contributes: { fields: [{ entity: 'crm_lead', key: 'conflict_probe_field', label_ar: 'حقل تجريبي', type: 'text' }] },
    }));
  }
  lifecycle.installModule(db, tmpModulesDir, 'conflict_mod_a', 'test_admin');
  let conflictError = null;
  try {
    lifecycle.installModule(db, tmpModulesDir, 'conflict_mod_b', 'test_admin');
  } catch (error) {
    conflictError = error;
  }
  check(!!conflictError && conflictError.statusCode === 409, 'second module install is rejected with 409', conflictError && conflictError.message);
  check(!!conflictError && conflictError.extra && conflictError.extra.conflicts[0].owner === 'conflict_mod_a', 'conflict report deterministically names the owning module', conflictError && conflictError.extra);
  const fieldOwner = db.prepare("SELECT module FROM x_module_patches WHERE patch_type = 'custom_field' AND target_key = 'conflict_probe_field'").get();
  check(fieldOwner && fieldOwner.module === 'conflict_mod_a', 'field ownership unambiguously stayed with the first installer');
  lifecycle.uninstallModule(db, 'conflict_mod_a', 'test_admin');
  fs.rmSync(tmpModulesDir, { recursive: true, force: true });
}

// =============================================================================
// SUITE B: ORG & FISCAL MASTERS + COMPANY SWITCHER (T1.13.1)
// =============================================================================
console.log('\n=== SUITE B: ORG & FISCAL MASTERS + COMPANY SWITCHER (T1.13.1) ===');

console.log('Test B.1: fiscal-year generation — one action produces a full year...');
{
  const res = await api('/api/x/org/fiscal-years/generate', { method: 'POST', headers: asAdmin, body: { company_id: 'company_a_demo', year: 2026 } });
  check(res.status === 200 && res.payload.success, 'fiscal year generate call succeeds', res.payload);
  check(res.payload.data.created === 12, '12 monthly periods created in one action', res.payload.data.created);
  const periods = db.prepare('SELECT * FROM fiscal_periods WHERE company_id = ? ORDER BY start_date').all('company_a_demo');
  check(periods.length === 12, '12 fiscal_period rows persisted');
  check(periods[0].start_date === '2026-01-01' && periods[11].end_date === '2026-12-31', 'period boundaries are correct', periods[0]);
}

console.log('Test B.2: fiscal-year generation is idempotent...');
{
  const res = await api('/api/x/org/fiscal-years/generate', { method: 'POST', headers: asAdmin, body: { company_id: 'company_a_demo', year: 2026 } });
  check(res.payload.data.created === 0 && res.payload.data.periods.length === 12, 're-generating the same year is a no-op, not a duplicate', res.payload.data);
}

console.log('Test B.3: fiscal-year generation is admin-gated...');
{
  const res = await api('/api/x/org/fiscal-years/generate', { method: 'POST', headers: asAlice, body: { company_id: 'company_b_demo', year: 2026 } });
  check(res.status === 403, 'non-admin cannot generate fiscal years', res);
}

console.log('Test B.4: company access grants + active-company selection...');
{
  const grantAlice = await api('/api/x/org/companies/company_a_demo/access', { method: 'POST', headers: asAdmin, body: { user_id: 'user_alice', is_default: true } });
  check(grantAlice.status === 200, 'admin grants alice access to company A', grantAlice.payload);
  const grantBob = await api('/api/x/org/companies/company_b_demo/access', { method: 'POST', headers: asAdmin, body: { user_id: 'user_bob', is_default: true } });
  check(grantBob.status === 200, 'admin grants bob access to company B', grantBob.payload);

  const aliceCompanies = await api('/api/x/org/companies', { headers: asAlice });
  check(aliceCompanies.payload.data.length === 1 && aliceCompanies.payload.data[0].company_id === 'company_a_demo', 'alice only sees company A (not admin, scoped list)', aliceCompanies.payload.data);

  const setActive = await api('/api/x/org/active-company', { method: 'POST', headers: asAlice, body: { company_id: 'company_a_demo' } });
  check(setActive.status === 200 && setActive.payload.data.company_id === 'company_a_demo', 'alice sets her active company to A');

  const setActiveBob = await api('/api/x/org/active-company', { method: 'POST', headers: asBob, body: { company_id: 'company_b_demo' } });
  check(setActiveBob.status === 200 && setActiveBob.payload.data.company_id === 'company_b_demo', 'bob sets his active company to B');

  const forbidden = await api('/api/x/org/active-company', { method: 'POST', headers: asAlice, body: { company_id: 'company_b_demo' } });
  check(forbidden.status === 403, 'alice cannot switch into a company she has no access to', forbidden);
}

console.log('Test B.5: HTTP-provable cross-company row isolation (roadmap R1.13 acceptance)...');
{
  const leadA = await api('/api/x/crm_lead/create', { method: 'POST', headers: asAlice, body: { name: 'Company A Lead' } });
  check(leadA.status === 200 && leadA.payload.success, 'alice (active company A) creates a lead scoped to company A', leadA.payload);
  const leadAId = leadA.payload.data.id;

  const leadB = await api('/api/x/crm_lead/create', { method: 'POST', headers: asBob, body: { name: 'Company B Lead' } });
  check(leadB.status === 200 && leadB.payload.success, 'bob (active company B) creates a lead scoped to company B', leadB.payload);
  const leadBId = leadB.payload.data.id;

  // No x-company-id header on any of the following requests — company
  // scoping comes entirely from the active-company selection made above,
  // exactly as the company-switcher UI would drive it in production.
  const aliceList = await api('/api/x/crm_lead/list', { headers: asAlice });
  const aliceIds = (aliceList.payload.data || []).map((r) => r.id);
  check(aliceIds.includes(leadAId), 'alice\'s list includes her own company\'s lead');
  check(!aliceIds.includes(leadBId), 'alice\'s list EXCLUDES company B\'s lead (T1.13.1 acceptance)', aliceIds);

  const aliceReadsOwnLead = await api(`/api/x/crm_lead/read/${leadAId}`, { headers: asAlice });
  check(aliceReadsOwnLead.status === 200, 'alice can read her own company\'s lead directly by id');

  const aliceReadsOtherLead = await api(`/api/x/crm_lead/read/${leadBId}`, { headers: asAlice });
  check(aliceReadsOtherLead.status === 404, 'alice CANNOT read company B\'s lead by direct id (T1.13.1 acceptance)', aliceReadsOtherLead);
}

// =============================================================================
// SUITE C: AUTH HARDENING COMPLETION (T1.14.1)
// =============================================================================
console.log('\n=== SUITE C: AUTH HARDENING COMPLETION (T1.14.1) ===');

console.log('Test C.1: TOTP enrollment -> confirm (real code accepted, wrong code rejected)...');
{
  const enroll = await api('/api/x/auth/totp/enroll', { method: 'POST', headers: { 'x-test-user': 'user_carol' } });
  check(enroll.status === 200 && typeof enroll.payload.data.secret === 'string' && enroll.payload.data.secret.length >= 16, 'enrollment returns a fresh secret (value itself never logged)');
  check(typeof enroll.payload.data.otpauthUri === 'string' && enroll.payload.data.otpauthUri.startsWith('otpauth://totp/'), 'enrollment returns a scannable otpauth URI');

  // Independently compute the real current code for the freshly issued
  // secret (not printed) to prove confirm() genuinely verifies it.
  const secret = enroll.payload.data.secret;
  const counter = Math.floor(Date.now() / 30000);
  const validCode = authHardening._internal.generateHOTP(authHardening._internal.base32Decode(secret), counter);

  const wrongConfirm = await api('/api/x/auth/totp/confirm', { method: 'POST', headers: { 'x-test-user': 'user_carol' }, body: { code: '000000' === validCode ? '111111' : '000000' } });
  check(wrongConfirm.status === 401, 'a wrong TOTP code is rejected at confirm time', wrongConfirm.payload);

  const rightConfirm = await api('/api/x/auth/totp/confirm', { method: 'POST', headers: { 'x-test-user': 'user_carol' }, body: { code: validCode } });
  check(rightConfirm.status === 200 && rightConfirm.payload.data.confirmed === true, 'the real current TOTP code confirms enrollment');

  const confirmedSecret = authHardening.getConfirmedTotpSecret(db, 'user_carol');
  check(typeof confirmedSecret === 'string' && confirmedSecret.length > 0, 'confirmed secret is now the SQL-native source of truth for this user (value not logged)');
}

console.log('Test C.2: config-driven password policy...');
{
  const getDefault = await api('/api/x/auth/password-policy', { headers: asAlice });
  check(getDefault.status === 200 && getDefault.payload.data.min_length === 10, 'default policy is min_length=10', getDefault.payload.data);

  const weak = await api('/api/x/auth/password/validate', { method: 'POST', body: { password: 'weak' } });
  check(weak.status === 200 && weak.payload.data.ok === false && weak.payload.data.errors.length > 0, 'weak candidate password fails validation (no session required)', weak.payload.data);

  const strong = await api('/api/x/auth/password/validate', { method: 'POST', body: { password: 'Str0ng!Passw0rd#2026' } });
  check(strong.status === 200 && strong.payload.data.ok === true, 'strong candidate password passes validation', strong.payload.data);

  const denyUpdate = await api('/api/x/auth/password-policy', { method: 'PUT', headers: asAlice, body: { min_length: 20 } });
  check(denyUpdate.status === 403, 'non-admin cannot change the password policy');

  const update = await api('/api/x/auth/password-policy', { method: 'PUT', headers: asAdmin, body: { min_length: 24 } });
  check(update.status === 200 && update.payload.data.min_length === 24, 'admin can raise the minimum length');

  const nowTooShort = await api('/api/x/auth/password/validate', { method: 'POST', body: { password: 'Str0ng!Passw0rd#2026' } });
  check(nowTooShort.payload.data.ok === false, 'a previously-strong password now fails under the raised policy (config is genuinely live, not hardcoded)');

  await api('/api/x/auth/password-policy', { method: 'PUT', headers: asAdmin, body: { min_length: 10 } }); // restore default for readability of TEST.md output
}

console.log('Test C.3: session rotation on privilege change...');
{
  const before = Date.now() - 5000;
  const after = Date.now() + 5000;
  check(authHardening.isSessionRevoked(db, 'user_erin', before) === false, 'no rotation recorded yet -> nothing is revoked');
  authHardening.rotateSessionsForUser(db, 'user_erin');
  check(authHardening.isSessionRevoked(db, 'user_erin', before) === true, 'a session token created BEFORE the rotation is now revoked');
  check(authHardening.isSessionRevoked(db, 'user_erin', after) === false, 'a session token created AFTER the rotation remains valid');
}

console.log('Test C.4: API-key issuance/revocation (raw key shown once, hash-only storage)...');
{
  const denyIssue = await api('/api/x/auth/api-keys', { method: 'POST', headers: asAlice, body: { role: 'sales' } });
  check(denyIssue.status === 403, 'non-admin cannot issue API keys');

  const issued = await api('/api/x/auth/api-keys', { method: 'POST', headers: asAdmin, body: { role: 'sales', label: 'integration-test', ttl_days: 30 } });
  check(issued.status === 201 && typeof issued.payload.data.key === 'string' && issued.payload.data.key.length >= 32, 'admin issues a scoped API key (raw value never logged)');
  const keyId = issued.payload.data.id;
  const rawKey = issued.payload.data.key;

  const list = await api('/api/x/auth/api-keys', { headers: asAdmin });
  const listedRow = (list.payload.data || []).find((r) => r.id === keyId);
  check(!!listedRow, 'issued key appears in the admin listing');
  check(!('key' in listedRow) && !('key_hash' in listedRow), 'listing never exposes the raw key or its hash');

  const validated = authHardening.validateApiKey(db, rawKey);
  check(!!validated && validated.role === 'sales', 'the freshly issued raw key validates successfully before revocation');

  const revoke = await api(`/api/x/auth/api-keys/${keyId}`, { method: 'DELETE', headers: asAdmin });
  check(revoke.status === 200 && revoke.payload.data.revoked === true, 'admin revokes the key');

  const validatedAfterRevoke = authHardening.validateApiKey(db, rawKey);
  check(validatedAfterRevoke === null, 'the revoked key no longer validates');
}

// ---------------------------------------------------------------------------
server.close();
db.close();
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(`${dbPath}-wal`); } catch (_) {}
try { fs.unlinkSync(`${dbPath}-shm`); } catch (_) {}

console.log(`\n--- LANE D COMPLETION SUITE FINISHED: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} ---`);
process.exitCode = failures === 0 ? 0 : 1;
