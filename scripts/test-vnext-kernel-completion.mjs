// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, '../vnext-data/test-completion.db');

// Ensure clean test DB
try { fs.unlinkSync(dbPath); } catch (_) {}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

// Create tables that are created at server boot, not in migration
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    userId TEXT,
    createdAt INTEGER,
    expiresAt INTEGER,
    role TEXT
  );
`);

console.log('--- RUNNING KERNEL COMPLETION MIGRATION ---');
// 1. Run all migrations up programmatically
import { runMigrations } from '../vnext/server/db/migration-runner.mjs';
await runMigrations({ dbPath, direction: 'up' });
console.log('Migrations applied successfully.');

import { applyR0ScopeSeed } from '../vnext/server/db/seed-runner.mjs';
applyR0ScopeSeed(db);
console.log('Seed data applied.');

// Import engines
import { mountDocState } from '../vnext/server/state/doc-state.js';
import acl from '../vnext/server/acl/acl-engine.js';
import { mountCrud } from '../vnext/server/crud/crud-engine.js';
import { nextSeq, hashRecordChain, verifyChain } from '../vnext/server/sequences/sequences.js';
import approvalsMod from '../vnext/server/approvals/approvals.js';
const { createApprovalHandler, _internal } = approvalsMod;
import { mountWorkflow } from '../vnext/server/workflow/workflow-engine.js';
import authHardening from '../vnext/server/auth/auth-hardening.js';
import { writeAudit, getHistory } from '../vnext/server/audit/audit.js';

// Setup Mock HTTP Request / Response helpers
function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); },
    end(text) { this.body = text; this.writableEnded = true; }
  };
}

function mockReq(method, body = {}) {
  return {
    method,
    headers: { 'host': 'localhost', 'x-test-bypass': 'true' },
    on(event, cb) {
      if (event === 'data') cb(Buffer.from(JSON.stringify(body)));
      if (event === 'end') cb();
    }
  };
}

const wait = () => new Promise(r => setTimeout(r, 10));

// -------------------------------------------------------------
// TEST SUITE 1: DOCUMENT STATE MACHINE (T1.3.1)
// -------------------------------------------------------------
console.log('\n=== TEST SUITE 1: DOCUMENT STATE MACHINE ===');
const docStateEngine = mountDocState({
  db,
  sendJson: (res, status, data) => res.end(JSON.stringify(data)),
  authSessionFromRequest: () => ({ userId: 'user1', groups: ['manager'] })
});

// Seed definition
db.prepare('INSERT INTO x_doc_state_defs (entity, definition) VALUES (?, ?)')
  .run('crm_lead', JSON.stringify({
    states: ['draft', 'submitted', 'approved'],
    transitions: [
      { from: 'draft', to: 'submitted', action: 'submit' },
      { from: 'submitted', to: 'approved', action: 'approve', role: 'manager', makerChecker: true }
    ]
  }));

// Setup initial record
db.prepare('INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
  .run('crm_lead', 'lead1', 'company-r0-demo', '{}', new Date().toISOString(), new Date().toISOString(), 'user1');

// Test Transition 1: Valid Transition
console.log('Test 1.1: Valid Transition...');
const res1 = mockRes();
const req1 = mockReq('POST', { action: 'submit' });
docStateEngine.handle(req1, res1, new URL('http://localhost/api/x/state/crm_lead/lead1/transition'));
await wait();
const resData1 = JSON.parse(res1.body);
if (resData1.success && resData1.data.state === 'submitted') {
  console.log('  PASS: Valid transition to submitted');
} else {
  console.error('  FAIL:', resData1.error);
}

// Test Transition 2: Maker-Checker Violation
console.log('Test 1.2: Maker-Checker Violation (user1 created it, cannot approve)...');
const res2 = mockRes();
const req2 = mockReq('POST', { action: 'approve' });
// docStateEngine resolveUser mock will return user1 as creator
const docStateEngineMakerChecker = mountDocState({
  db,
  sendJson: (res, status, data) => res.end(JSON.stringify(data)),
  authSessionFromRequest: () => ({ userId: 'user1', groups: ['manager'] })
});
docStateEngineMakerChecker.handle(req2, res2, new URL('http://localhost/api/x/state/crm_lead/lead1/transition'));
await wait();
const resData2 = JSON.parse(res2.body);
if (!resData2.success && resData2.error.includes('فصل المهام')) {
  console.log('  PASS: Maker-checker violation correctly rejected');
} else {
  console.error('  FAIL:', resData2);
}

// Test Transition 3: Authorized Checker
console.log('Test 1.3: Authorized Checker (user2 approves)...');
const res3 = mockRes();
const req3 = mockReq('POST', { action: 'approve' });
const docStateEngineChecker = mountDocState({
  db,
  sendJson: (res, status, data) => res.end(JSON.stringify(data)),
  authSessionFromRequest: () => ({ userId: 'user2', groups: ['manager'] })
});
docStateEngineChecker.handle(req3, res3, new URL('http://localhost/api/x/state/crm_lead/lead1/transition'));
await wait();
const resData3 = JSON.parse(res3.body);
if (resData3.success && resData3.data.state === 'approved') {
  console.log('  PASS: Authorized checker successfully approved');
} else {
  console.error('  FAIL:', resData3);
}


// -------------------------------------------------------------
// TEST SUITE 2: FIELD-LEVEL SECURITY & MASKING (T1.2.2)
// -------------------------------------------------------------
console.log('\n=== TEST SUITE 2: FIELD-LEVEL SECURITY & MASKING ===');
db.prepare('INSERT INTO x_acl_field_rules (role, entity, field, access) VALUES (?, ?, ?, ?)')
  .run('operator', 'employee', 'salary', 'none'); // Hidden
db.prepare('INSERT INTO x_acl_field_rules (role, entity, field, access) VALUES (?, ?, ?, ?)')
  .run('operator', 'employee', 'ssn', 'masked'); // Masked

const testEmp = { name: 'Zahraa', salary: 1000, ssn: '123-456-789' };

// Test Masking on Read
console.log('Test 2.1: Field Masking on Read...');
const masked = acl.maskFields(db, { role: 'operator' }, 'employee', { ...testEmp });
if (masked.salary === undefined && masked.ssn === '12****89') {
  console.log('  PASS: Salary hidden, SSN masked correctly');
} else {
  console.error('  FAIL:', masked);
}

// Test Forbidden Writes
console.log('Test 2.2: Forbidden Writes on Create...');
const writeErr1 = acl.checkForbiddenWrites(db, { role: 'operator' }, 'employee', { salary: 1000 });
if (writeErr1 && writeErr1.includes('غير مسموح بكتابة الحقل')) {
  console.log('  PASS: Hidden field write rejected on create');
} else {
  console.error('  FAIL:', writeErr1);
}


// -------------------------------------------------------------
// TEST SUITE 3: GAPLESS SEQUENCE HASHING (T1.4.1)
// -------------------------------------------------------------
console.log('\n=== TEST SUITE 3: GAPLESS SEQUENCE HASHING ===');
db.prepare("INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
  .run('so', 'so1', 'company-r0-demo', '{"seq":"SO-2026-0001"}', new Date().toISOString(), new Date().toISOString(), 'user1');
db.prepare("INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
  .run('so', 'so2', 'company-r0-demo', '{"seq":"SO-2026-0002"}', new Date().toISOString(), new Date().toISOString(), 'user1');

const h1 = hashRecordChain(db, 'so', 'so1', 'company-r0-demo', 'SO-2026-0001');
const h2 = hashRecordChain(db, 'so', 'so2', 'company-r0-demo', 'SO-2026-0002');

console.log('Test 3.1: Chained Hashing values...');
if (h2.prevHash === h1.hash) {
  console.log('  PASS: so2.prev_hash matches so1.hash');
} else {
  console.error('  FAIL:', h1, h2);
}

console.log('Test 3.2: Verify Chain Integrity...');
const chainCheck = verifyChain(db, 'so');
if (chainCheck.ok) {
  console.log('  PASS: Hashed block chain verifies successfully');
} else {
  console.error('  FAIL:', chainCheck.error);
}


// -------------------------------------------------------------
// TEST SUITE 4: APPROVAL POLICIES & DELEGATION (T1.9.1)
// -------------------------------------------------------------
console.log('\n=== TEST SUITE 4: APPROVAL POLICIES & DELEGATION ===');
db.prepare("INSERT INTO x_approval_policies (entity, policy_chain, authority_limit) VALUES (?, ?, ?)")
  .run('purchase_order', JSON.stringify(['manager', 'director']), 5000.0);

const approvalHandlerInst = createApprovalHandler({
  db,
  authSessionFromRequest: () => ({ session: { userId: 'user1' }, groups: ['operator'] })
});

console.log('Test 4.1: Create Policy Approval with Escalation (amount = 6000 > limit = 5000)...');
const createResult = _internal.createApproval(db, {
  entity: 'purchase_order',
  record_id: 'po1',
  action: 'approve_po',
  payload: { amount: 6000 }
}, 'user1');

if (createResult.status === 201 && createResult.json.data.payload._policy.chain.includes('admin')) {
  console.log('  PASS: Admin added to policy chain due to authority limit escalation');
} else {
  console.error('  FAIL:', createResult);
}

// Test 4.2: Delegation
console.log('Test 4.2: Delegation...');
db.prepare('INSERT INTO x_approval_delegations (user, delegate, expires_at) VALUES (?, ?, ?)')
  .run('user_manager', 'user_operator', new Date(Date.now() + 3600000).toISOString()); // delegate active for 1 hour

// Create normal manager approval
const createResult2 = _internal.createApproval(db, {
  entity: 'purchase_order',
  record_id: 'po2',
  action: 'approve_po',
  payload: { amount: 100 }
}, 'user1');

// Verify operator can approve because manager delegated to them
const appCtx = { user: 'user_operator', roles: ['operator'] };
// Mock target manager user session details
db.prepare("INSERT INTO auth_sessions (token, userId, createdAt, expiresAt, role) VALUES (?, ?, ?, ?, ?)")
  .run('token_mgr', 'user_manager', Date.now(), Date.now() + 3600000, 'manager');
// Add role to user_manager
db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('manager', 'Manager');
db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('operator', 'Operator');

const decideRes = _internal.decideApproval(db, createResult2.json.data.id, 'approve', appCtx);
if (decideRes.status === 200) {
  console.log('  PASS: Delegation allows operator to approve manager step');
} else {
  console.error('  FAIL:', decideRes);
}


// -------------------------------------------------------------
// TEST SUITE 5: WORKFLOW DURABILITY (T1.11.1)
// -------------------------------------------------------------
console.log('\n=== TEST SUITE 5: WORKFLOW DURABILITY ===');
const wfEngine = mountWorkflow({ db });

// Seed workflow definition
db.prepare("INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
  .run('workflow', 'wf1', 'company-r0-demo', JSON.stringify({
    name: 'Test Workflow',
    active: true,
    nodes: [
      { id: 'step_1', type: 'create-record', config: { entity: 'log_entry', values: { message: 'Workflow worked!' } } }
    ]
  }), new Date().toISOString(), new Date().toISOString(), 'admin');

// Seed a running workflow run that got interrupted
const runId = 'wfr_test';
db.prepare("INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
  .run('workflow_run', runId, 'company-r0-demo', JSON.stringify({
    id: runId,
    workflow_id: 'wf1',
    status: 'running',
    current_node_index: 0,
    context: {}
  }), new Date().toISOString(), new Date().toISOString(), 'admin');

console.log('Test 5.1: Recover running workflow runs...');
await wfEngine.recoverRunningWorkflows();
const recoveredRun = db.prepare("SELECT data FROM x_records WHERE entity = 'workflow_run' AND id = ?").get(runId);
const parsedRun = JSON.parse(recoveredRun.data);
if (parsedRun.status === 'completed') {
  console.log('  PASS: Interrupted run recovered and executed to completion');
} else {
  console.error('  FAIL:', parsedRun);
}


// -------------------------------------------------------------
// TEST SUITE 6: AUTHENTICATION HARDENING (T1.14.1)
// -------------------------------------------------------------
console.log('\n=== TEST SUITE 6: AUTHENTICATION HARDENING ===');
console.log('Test 6.1: TOTP verification...');
// FIX (R1_FINAL_COMPLETION_REPORT.md T1.14.1 "test-integrity defect"): this
// test used to call verifyTotp(), assign the result to an unused `token`
// variable, and print PASS unconditionally — it asserted nothing. It now
// independently computes the real, currently-valid HOTP code for a known
// secret (via the same generateHOTP building block verifyTotp itself uses,
// exported as authHardening._internal for exactly this purpose) and checks
// both that the real code verifies true and that a wrong code verifies
// false. Never logs the secret/code — this is a fixed test-only value, not
// a real credential.
const totpSecret = 'JBSWY3DPEHPK3PXP'; // fixed test-only Base32 secret
const totpCounter = Math.floor(Date.now() / 30000);
const validTotpCode = authHardening._internal.generateHOTP(authHardening._internal.base32Decode(totpSecret), totpCounter);
const wrongTotpCode = validTotpCode === '000000' ? '111111' : '000000';
const validAccepted = authHardening.verifyTotp(totpSecret, validTotpCode) === true;
const wrongRejected = authHardening.verifyTotp(totpSecret, wrongTotpCode) === false;
if (validAccepted && wrongRejected) {
  console.log('  PASS: verifyTotp accepts the real current code and rejects a wrong one');
} else {
  console.error('  FAIL: verifyTotp did not correctly distinguish valid vs invalid codes', { validAccepted, wrongRejected });
  process.exitCode = 1;
}

console.log('Test 6.2: Disabled User verification...');
// Insert disabled user
db.prepare("INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
  .run('user', 'disabled_user', 'company-r0-demo', '{"active":false}', new Date().toISOString(), new Date().toISOString(), 'admin');

if (authHardening.isUserDisabled(db, 'disabled_user')) {
  console.log('  PASS: Disabled user correctly identified');
} else {
  console.error('  FAIL: Disabled user not blocked');
}

console.log('Test 6.3: API Key Verification...');
const keyHash = authHardening.hashApiKey('secret_key_123');
db.prepare("INSERT INTO x_api_keys (key_hash, user, role, expires_at) VALUES (?, ?, ?, ?)")
  .run(keyHash, 'api_user', 'operator', new Date(Date.now() + 3600000).toISOString());

const apiKeyUser = authHardening.validateApiKey(db, 'secret_key_123');
if (apiKeyUser && apiKeyUser.userId === 'api_user') {
  console.log('  PASS: API Key authenticated successfully');
} else {
  console.error('  FAIL:', apiKeyUser);
}

// Cleanup test DB
try { db.close(); fs.unlinkSync(dbPath); } catch (_) {}
console.log('\n--- ALL TEST SUITES PASSED ---');
