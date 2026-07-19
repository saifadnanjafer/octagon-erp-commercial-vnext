// R4.3 acceptance: security hardening pass. Static route-gating coverage +
// live IDOR probes, no-permission denial, unauthenticated rejection, and
// body-supplied-identity (mass-assignment) rejection against a disposable
// authenticated server across two companies.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const audit = require('../vnext/server/modules/governance/security-audit.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r4-sec-'));
const port = 18999;
const env = { ...process.env, NODE_ENV: 'test', OCTAGON_ENABLE_TEST_BYPASS: 'true', USE_SQLITE: 'true', PORT: String(port), OCTAGON_SQLITE_DB_FILE: path.join(temp, 'vnext.db'), OCTAGON_DB_FILE: path.join(temp, 'mirror.json'), OCTAGON_CRASH_LOG: path.join(temp, 'crash.log'), OCTAGON_BACKUP_DIR: temp, OCTAGON_UPLOAD_DIR: path.join(temp, 'uploads') };
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', (c) => { logs += c; }); server.stderr.on('data', (c) => { logs += c; });
const base = `http://127.0.0.1:${port}`;
async function waitFor() { for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) return; } catch (_) { /* wait */ } await new Promise((r) => setTimeout(r, 100)); } throw new Error('server did not boot\n' + logs); }
async function req(pathname, options = {}) { const response = await fetch(base + pathname, options); const text = await response.text(); let data = null; try { data = JSON.parse(text); } catch (_) { data = text; } return { response, data }; }
function sha(p, s) { return crypto.createHash('sha256').update(p + s).digest('hex'); }
function cookieOf(r) { return /octagon_session=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1] || ''; }

const results = [];
let failures = 0;
function check(name, cond) { if (cond) results.push(`PASS ${name}`); else { failures += 1; results.push(`FAIL ${name}`); } }

try {
  // --- static route-gating audit ---
  const gating = audit.auditRouteGating();
  check('static audit: session + scope + permission gates present on R3 routes', gating.session_gate && gating.scope_gate && gating.permission_gate);
  check('static audit: no body-supplied identity used for authz/scope', gating.body_identity_findings.length === 0);
  check('static audit: route gating report is clean', gating.gated);

  await waitFor();
  // --- seed admin + denied user + company B ---
  const state = (await req('/api/db')).data;
  state.users = Array.isArray(state.users) ? state.users : [];
  const adminId = 'r4_sec_admin_' + Date.now(); const adminPw = 'R4-Sec-Admin-2026!'; const adminSalt = crypto.randomBytes(8).toString('hex');
  const denyId = 'r4_sec_deny_' + Date.now(); const denyPw = 'R4-Sec-Deny-2026!'; const denySalt = crypto.randomBytes(8).toString('hex');
  state.users.push({ id: adminId, name: 'Sec Admin', displayName: 'Sec Admin', is_active: true, passwordHash: sha(adminPw, adminSalt), passwordSalt: adminSalt, groups: ['system.admin'], role: 'admin' });
  state.users.push({ id: denyId, name: 'No Access', displayName: 'No Access', is_active: true, passwordHash: sha(denyPw, denySalt), passwordSalt: denySalt, groups: [], role: 'viewer' });
  const seeded = await req('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Octagon-Full-Sync': 'yes', 'X-Test-Bypass': 'true' }, body: JSON.stringify(state) });
  assert.equal(seeded.response.status, 200);
  const adminLogin = await req('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: adminId, password: adminPw }) });
  const adminCookie = cookieOf(adminLogin.response);
  const denyLogin = await req('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: denyId, password: denyPw }) });
  const denyCookie = cookieOf(denyLogin.response);
  // ensure company B exists
  const stateB = (await req('/api/db', { headers: { Cookie: `octagon_session=${adminCookie}` } })).data;

  const hdrA = { 'Content-Type': 'application/json', 'X-Company-Id': 'company-r0-demo', Cookie: `octagon_session=${adminCookie}` };

  // --- 1. unauthenticated rejection on a representative set of resources ---
  const probeResources = ['products', 'quotes', 'orders', 'purchase-orders', 'reservations', 'boms', 'projects', 'tickets', 'landed-costs', 'subcontract-orders'];
  let unauth401 = 0;
  for (const resource of probeResources) { const r = await req(`/api/x/r3/${resource}`); if (r.response.status === 401) unauth401 += 1; }
  check(`unauthenticated GET is 401 for all ${probeResources.length} probed resources`, unauth401 === probeResources.length);

  // --- 2. missing X-Company-Id is rejected ---
  const noCompany = await req('/api/x/r3/products', { headers: { Cookie: `octagon_session=${adminCookie}` } });
  check('missing company scope header is rejected (400)', noCompany.response.status === 400);

  // --- 3. no-permission user is denied ---
  const denied = await req('/api/x/r3/products', { headers: { 'X-Company-Id': 'company-r0-demo', Cookie: `octagon_session=${denyCookie}` } });
  check('no-permission user is denied (401/403)', denied.response.status === 401 || denied.response.status === 403);

  // --- 4. create a product in company A, then IDOR-probe from a foreign company ---
  const created = await req('/api/x/r3/products', { method: 'POST', headers: hdrA, body: JSON.stringify({ code: 'SEC-P1', name: 'Sec Product', product_type: 'goods' }) });
  check('admin can create in own company', created.response.status === 201);
  const productId = created.data?.data?.id;
  // Foreign company must exist for the scope resolver to accept the header; if it
  // does not resolve, a 403/400 is still a correct denial. Probe cross-company read.
  const foreignHeaders = { 'X-Company-Id': 'company-r3-foreign', Cookie: `octagon_session=${adminCookie}` };
  // seed a second company via /api/db so scope resolves, then probe record access
  stateB.companies = Array.isArray(stateB.companies) ? stateB.companies : [];
  if (!stateB.companies.some((c) => (c.company_id || c.id) === 'company-r3-foreign')) stateB.companies.push({ company_id: 'company-r3-foreign', name: 'Foreign Co' });
  await req('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Octagon-Full-Sync': 'yes', 'X-Test-Bypass': 'true', Cookie: `octagon_session=${adminCookie}` }, body: JSON.stringify(stateB) });
  const idorHistory = await req(`/api/x/r3/products/${encodeURIComponent(productId)}/history`, { headers: foreignHeaders });
  // Any denial (400 unregistered-company / 403 foreign-scope / 404) is acceptable;
  // the invariant is that the company-A record is NEVER returned cross-scope.
  const idorBody = JSON.stringify(idorHistory.data || '');
  check('IDOR probe: foreign company request is denied and leaks no record', idorHistory.response.status >= 400 && !idorBody.includes('SEC-P1') && !idorBody.includes(String(productId)));

  // Same-company control: the owning company CAN read its own record history (200).
  const ownHistory = await req(`/api/x/r3/products/${encodeURIComponent(productId)}/history`, { headers: hdrA });
  check('same-company owner can read its own record history (200)', ownHistory.response.status === 200);

  // --- 5. mass-assignment: body attempts to override company_id/id are ignored ---
  const massAssign = await req('/api/x/r3/products', { method: 'POST', headers: hdrA, body: JSON.stringify({ code: 'SEC-P2', name: 'Mass Assign', product_type: 'goods', company_id: 'company-r3-foreign' }) });
  check('mass-assignment: body company_id override is ignored (record lands in scoped company)', massAssign.response.status === 201 && massAssign.data.data.company_id === 'company-r0-demo');

  // --- 6. cross-company invalid-company create is denied ---
  const foreignCreate = await req('/api/x/r3/categories', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Company-Id': 'company-does-not-exist', Cookie: `octagon_session=${adminCookie}` }, body: JSON.stringify({ code: 'X', name: 'X' }) });
  check('create under a non-existent company is denied (400/403)', foreignCreate.response.status === 400 || foreignCreate.response.status === 403);

  // --- 7. legacy workshop write attempt is rejected read-only ---
  const legacyWrite = await req('/api/x/r3/legacy-workshop/omni.workshopTimesheetCases', { method: 'POST', headers: hdrA, body: '{}' });
  check('legacy workshop write is rejected read-only (405)', legacyWrite.response.status === 405);
} finally { server.kill(); }

for (const line of results) console.log(line);
console.log(`R4 SECURITY AUDIT SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
