// clean-room; behavior modeled on scripts/test-lane-c-completion.mjs test-suite pattern (proprietary self, not copied)
'use strict';

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-finance.db');
const migrationsDir = path.resolve(here, '../migrations');

let failures = 0;
function check(label, condition, details) {
  if (condition) {
    console.log('  PASS:', label);
  } else {
    failures += 1;
    console.error('  FAIL:', label, details === undefined ? '' : details);
  }
}

// Ensure clean, isolated test DB
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

const DEPENDENCY_SAFE_ORDER = [
  '001_r0_scope_contract.mjs',
  '101_r1_lane_a_tables.mjs',
  '201_r1_lane_b_tables.mjs',
  '301_r1_lane_c_tables.mjs',
  '401_r1_lane_d_tables.mjs',
  '501_r1_kernel_completion.mjs',
  '102_r1_lane_a_completion.mjs',
  '202_r1_lane_b_completion.mjs',
  '302_r1_lane_c_completion.mjs',
  '402_r1_lane_d_completion.mjs',
  '601_r2_finance_baseline.mjs',
];

console.log('--- APPLYING MIGRATIONS ---');
const migrationDb = new DatabaseSync(dbPath);
migrationDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of DEPENDENCY_SAFE_ORDER) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migrationDb);
  console.log('  applied:', mod.migration.id);
}
migrationDb.close();
console.log('Migrations applied.');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

// -------------------------------------------------------------
// MOCKS & LIBS IMPORT
// -------------------------------------------------------------
const { applyR0ScopeSeed, applyAclAdminDefaultSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db);
applyAclAdminDefaultSeed(db);

const financeEngine = require('../vnext/server/finance/finance-engine');
const { mountFinanceRoutes } = require('../vnext/server/finance/finance-routes');

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: '', writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    end(text) { this.body = text; this.writableEnded = true; },
  };
}
function mockReq(method, body, headers) {
  const payload = body === undefined ? {} : body;
  return {
    method,
    headers: Object.assign({ host: 'localhost' }, headers || {}),
    on(event, cb) {
      if (event === 'data') cb(Buffer.from(JSON.stringify(payload)));
      if (event === 'end') cb();
    },
  };
}
const wait = () => new Promise((r) => setTimeout(r, 10));

// ===========================================================================
// SUITE 1: SCHEMA & baselines
// ===========================================================================
console.log('\n=== SUITE 1: SCHEMA & BASELINES ===');

check('1.1 account table exists', !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account'").get());
check('1.2 fiscal_doc table exists', !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fiscal_doc'").get());
check('1.3 fiscal_doc_line table exists', !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fiscal_doc_line'").get());
check('1.4 gl_line table exists', !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gl_line'").get());

const seededAccount = db.prepare("SELECT 1 FROM account WHERE id = 'coa_101000'").get();
check('1.5 coa cash account exists', !!seededAccount);

const seededPeriods = db.prepare("SELECT count(*) as c FROM fiscal_periods WHERE company_id = 'company-r0-demo'").get();
check('1.6 fiscal periods seeded', seededPeriods.c === 12);

// ===========================================================================
// SUITE 2: IMMUTABILITY TRIGGERS (gl_line)
// ===========================================================================
console.log('\n=== SUITE 2: GL_LINE IMMUTABILITY TRIGGERS ===');

// Insert matching doc & line first to satisfy foreign keys
db.prepare(`
  INSERT INTO fiscal_doc (id, company_id, move_type, doc_date, state, created_at)
  VALUES ('doc_test', 'company-r0-demo', 'manual_entry', '2026-07-18', 'draft', '2026-07-18T00:00:00Z')
`).run();
db.prepare(`
  INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
  VALUES ('line_test', 'doc_test', 'company-r0-demo', 'coa_101000', 100, 0, '2026-07-18T00:00:00Z')
`).run();

// Insert direct GL line
db.prepare(`
  INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at)
  VALUES ('gl_test1', 'company-r0-demo', 'doc_test', 'line_test', 'coa_101000', '2026-07-18', 100, 0, '2026-07-18T00:00:00Z')
`).run();
check('2.1 GL line inserted successfully', !!db.prepare("SELECT 1 FROM gl_line WHERE id = 'gl_test1'").get());

let updateFailed = false;
try {
  db.prepare("UPDATE gl_line SET debit = 200 WHERE id = 'gl_test1'").run();
} catch (e) {
  updateFailed = e.message.includes('Updates not allowed');
}
check('2.2 UPDATE blocked on gl_line trigger', updateFailed);

let deleteFailed = false;
try {
  db.prepare("DELETE FROM gl_line WHERE id = 'gl_test1'").run();
} catch (e) {
  deleteFailed = e.message.includes('Deletes not allowed');
}
check('2.3 DELETE blocked on gl_line trigger', deleteFailed);

// Clean up trigger check records by dropping and restoring the delete trigger
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete');
db.prepare("DELETE FROM gl_line WHERE id = 'gl_test1'").run();
db.exec(`
  CREATE TRIGGER IF NOT EXISTS t_gl_line_no_delete BEFORE DELETE ON gl_line
  BEGIN
    SELECT RAISE(FAIL, 'Deletes not allowed on append-only GL lines');
  END;
`);
db.prepare("DELETE FROM fiscal_doc_line WHERE id = 'line_test'").run();
db.prepare("DELETE FROM fiscal_doc WHERE id = 'doc_test'").run();

// ===========================================================================
// SUITE 3: DOUBLE ENTRY POSTING ENGINE
// ===========================================================================
console.log('\n=== SUITE 3: BALANCED POSTING ENGINE ===');

// Helper to seed a draft document
function seedDraftDoc(id, type, date, lines) {
  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, created_at)
    VALUES (?, 'company-r0-demo', null, ?, ?, 'draft', ?)
  `).run(id, type, date, new Date().toISOString());

  const insertLine = db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, currency_code, currency_debit, currency_credit, created_at)
    VALUES (?, ?, 'company-r0-demo', ?, ?, ?, ?, ?, ?, ?)
  `);
  lines.forEach((l, idx) => {
    insertLine.run(
      `${id}_l${idx}`,
      id,
      l.account,
      l.debit || 0.0,
      l.credit || 0.0,
      l.currency_code || null,
      l.currency_debit || 0.0,
      l.currency_credit || 0.0,
      new Date().toISOString()
    );
  });
}

// Test 3.1: Valid post (JV)
seedDraftDoc('doc1', 'manual_entry', '2026-07-18', [
  { account: 'coa_101000', debit: 500, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 500 },
]);

const resPost1 = financeEngine.postFiscalDoc(db, 'doc1', 'test_user');
check('3.1.1 post completed successfully', resPost1.success);
check('3.1.2 gapless sequence assigned', resPost1.docNumber.startsWith('JV-202607-'));
check('3.1.3 cryptographic hash generated', !!resPost1.hash);

const postedDoc1 = db.prepare("SELECT state, doc_number, hash, prev_hash FROM fiscal_doc WHERE id = 'doc1'").get();
check('3.1.4 doc state is posted', postedDoc1.state === 'posted');
check('3.1.5 doc prev_hash is zeros', postedDoc1.prev_hash === '0'.repeat(64));

const postedGlLines = db.prepare("SELECT count(*) as c FROM gl_line WHERE fiscal_doc_id = 'doc1'").get();
check('3.1.6 two gl lines posted', postedGlLines.c === 2);

// Test 3.2: Re-post check
let repostError = null;
try {
  financeEngine.postFiscalDoc(db, 'doc1', 'test_user');
} catch (e) {
  repostError = e.message;
}
check('3.2.1 double posting draft check fails', repostError && repostError.includes('تم ترحيله'));

// Test 3.3: Unbalanced check
seedDraftDoc('doc2', 'manual_entry', '2026-07-18', [
  { account: 'coa_101000', debit: 500, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 499 },
]);
let unbalError = null;
try {
  financeEngine.postFiscalDoc(db, 'doc2', 'test_user');
} catch (e) {
  unbalError = e.message;
}
check('3.3.1 unbalanced post rejected', unbalError && unbalError.includes('غير متوازن'));

// Test 3.4: Closed period check
seedDraftDoc('doc3', 'manual_entry', '2025-01-01', [
  { account: 'coa_101000', debit: 500, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 500 },
]);
let periodError = null;
try {
  financeEngine.postFiscalDoc(db, 'doc3', 'test_user');
} catch (e) {
  periodError = e.message;
}
check('3.4.1 locked/closed period rejected', periodError && periodError.includes('locked'));

// Test 3.5: Hash chain check
seedDraftDoc('doc4', 'manual_entry', '2026-07-19', [
  { account: 'coa_101000', debit: 200, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 200 },
]);
const resPost2 = financeEngine.postFiscalDoc(db, 'doc4', 'test_user');
const postedDoc2 = db.prepare("SELECT hash, prev_hash FROM fiscal_doc WHERE id = 'doc4'").get();
check('3.5.1 doc4 prev_hash matches doc1 hash', postedDoc2.prev_hash === postedDoc1.hash);

// ===========================================================================
// SUITE 4: HTTP ROUTING ENDPOINTS
// ===========================================================================
console.log('\n=== SUITE 4: HTTP ROUTING ENDPOINTS ===');

const financeRoutes = mountFinanceRoutes({
  db,
  requireSession: (req) => {
    const userHeader = req.headers['x-octagon-user'];
    if (userHeader === 'unauthorized') {
      return { ok: true, userId: 'unauth', user: { roleId: 'operator' }, groups: ['operator'] };
    }
    if (userHeader) {
      return { ok: true, userId: userHeader, user: { roleId: 'accountant' }, groups: ['finance.manager'] };
    }
    return null;
  }
});

// Seed a draft doc for API checks
seedDraftDoc('api_doc', 'manual_entry', '2026-07-18', [
  { account: 'coa_101000', debit: 100, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 100 },
]);

// Test 4.1: API 401 Unauthorized
const req41 = mockReq('POST', { doc_id: 'api_doc' });
const res41 = mockRes();
financeRoutes.handle(req41, res41, new URL('http://localhost/api/x/finance/post'));
await wait();
check('4.1 API post returns 401 on missing session', res41.statusCode === 401);

// Test 4.2: API 403 Forbidden
// Need to seed x_acl_grants for operator
db.prepare("INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES ('operator', 'مشغل')").run();
// No grant for finance:gl:post for operator
const req42 = mockReq('POST', { doc_id: 'api_doc' }, { 'x-octagon-user': 'unauthorized' });
const res42 = mockRes();
financeRoutes.handle(req42, res42, new URL('http://localhost/api/x/finance/post'));
await wait();
check('4.2 API post returns 403 on forbidden role', res42.statusCode === 403);

// Test 4.3: API 200 Successful Post
// Grant permission to accountant role (which user 'finance_manager' maps to via groups -> finance.manager -> role accountant)
db.prepare("INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES ('accountant', 'محاسب')").run();
db.prepare("INSERT OR IGNORE INTO x_acl_grants (role, perm, scope) VALUES ('accountant', 'finance:gl:post', 'all')").run();

const req43 = mockReq('POST', { doc_id: 'api_doc' }, { 'x-octagon-user': 'finance_manager' });
const res43 = mockRes();
financeRoutes.handle(req43, res43, new URL('http://localhost/api/x/finance/post'));
await wait();
check('4.3 API post returns 200 on successful execution', res43.statusCode === 200, res43.body);
const body43 = JSON.parse(res43.body);
check('4.3.1 API post response envelope success', body43.success === true);
check('4.3.2 API post response contains doc number', body43.data.docNumber.startsWith('JV-202607-'));

// Test 4.4: API Validation endpoint
seedDraftDoc('api_unbal', 'manual_entry', '2026-07-18', [
  { account: 'coa_101000', debit: 100, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 90 },
]);

const req44 = mockReq('POST', { doc_id: 'api_unbal' }, { 'x-octagon-user': 'finance_manager' });
const res44 = mockRes();
financeRoutes.handle(req44, res44, new URL('http://localhost/api/x/finance/validate'));
await wait();
check('4.4 API validate returns balanced status', res44.statusCode === 200);
const body44 = JSON.parse(res44.body);
check('4.4.1 API validate indicates unbalanced', body44.data.balanced === false);
check('4.4.2 API validate returns error message', body44.data.error && body44.data.error.includes('غير متوازن'));

// ===========================================================================
// SUITE 5: REVERSAL & CANCELLATION (T2.1.2)
// ===========================================================================
console.log('\n=== SUITE 5: REVERSAL & CANCELLATION ===');

// Clear all transactional records for clean test isolation
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete');
db.prepare('DELETE FROM gl_line').run();
db.exec(`
  CREATE TRIGGER IF NOT EXISTS t_gl_line_no_delete BEFORE DELETE ON gl_line
  BEGIN
    SELECT RAISE(FAIL, 'Deletes not allowed on append-only GL lines');
  END;
`);
db.prepare('DELETE FROM fiscal_doc_line').run();
db.prepare('DELETE FROM fiscal_doc').run();

// Seed a fresh doc1 to reverse
seedDraftDoc('doc1', 'manual_entry', '2026-07-18', [
  { account: 'coa_101000', debit: 500, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 500 },
]);
financeEngine.postFiscalDoc(db, 'doc1', 'test_user');

const resRev1 = financeEngine.reverseFiscalDoc(db, 'doc1', 'test_user');
check('5.1 reversal posting completed successfully', resRev1.success);
check('5.2 reversal document assigned a sequence number', resRev1.docNumber.startsWith('JV-202607-'));

const origDoc1 = db.prepare("SELECT state FROM fiscal_doc WHERE id = 'doc1'").get();
check('5.3 original document marked as cancelled', origDoc1.state === 'cancelled');

const revDocRow = db.prepare("SELECT id, state, reversal_of_id FROM fiscal_doc WHERE reversal_of_id = 'doc1'").get();
check('5.4 reversal document state is posted', revDocRow && revDocRow.state === 'posted');

const revLines = db.prepare("SELECT debit, credit FROM fiscal_doc_line WHERE fiscal_doc_id = ?").all(revDocRow.id);
// Original lines: Line 0: D 500, C 0; Line 1: D 0, C 500.
// Reversal lines must be: Line 0: D 0, C 500; Line 1: D 500, C 0.
check('5.5 reversal line 0 swapped debit and credit', revLines[0].debit === 0 && revLines[0].credit === 500);
check('5.6 reversal line 1 swapped debit and credit', revLines[1].debit === 500 && revLines[1].credit === 0);

// ===========================================================================
// SUITE 6: TRIAL BALANCE & GENERAL LEDGER (T2.1.2)
// ===========================================================================
console.log('\n=== SUITE 6: TRIAL BALANCE & GENERAL LEDGER ===');

const tb1 = financeEngine.getTrialBalance(db, 'company-r0-demo');
const cashTb = tb1.find(a => a.account_id === 'coa_101000');
const salesTb = tb1.find(a => a.account_id === 'coa_401000');
check('6.1 trial balance exists for Cash account', !!cashTb);
check('6.2 trial balance exists for Sales account', !!salesTb);
// Net balance must be 0 because JV1 (500) and Rev1 (-500) net to zero
check('6.3 post -> cancel -> repost nets to 0 for Cash', cashTb.balance === 0);
check('6.4 post -> cancel -> repost nets to 0 for Sales', salesTb.balance === 0);

// Post a new document to check non-zero trial balance
seedDraftDoc('doc5', 'manual_entry', '2026-07-18', [
  { account: 'coa_101000', debit: 300, credit: 0 },
  { account: 'coa_401000', debit: 0, credit: 300 },
]);
financeEngine.postFiscalDoc(db, 'doc5', 'test_user');

const tb2 = financeEngine.getTrialBalance(db, 'company-r0-demo');
const cashTb2 = tb2.find(a => a.account_id === 'coa_101000');
const salesTb2 = tb2.find(a => a.account_id === 'coa_401000');
check('6.5 trial balance Cash balance reflects new posting', cashTb2.balance === 300);
check('6.6 trial balance Sales balance reflects new posting', salesTb2.balance === -300);

// Test General Ledger
const glRows = financeEngine.getGeneralLedger(db, 'company-r0-demo', 'coa_101000');
check('6.7 general ledger returns correct transaction count', glRows.length === 3); // JV1, Rev1, JV5
check('6.8 general ledger rows sorted by date/id', glRows[0].posting_date === '2026-07-18' && glRows[0].debit === 500);

// ===========================================================================
// SUITE 7: HASH CHAIN VERIFICATION (T2.1.2)
// ===========================================================================
console.log('\n=== SUITE 7: HASH CHAIN VERIFICATION ===');

const chainVer1 = financeEngine.verifyHashChain(db, 'company-r0-demo');
check('7.1 valid hash chain verification passes', chainVer1.ok === true);

// Fetch current correct hash before tampering
const currentHash = db.prepare("SELECT hash FROM fiscal_doc WHERE id = 'doc1'").get().hash;

// Tamper with a posted document hash
db.prepare("UPDATE fiscal_doc SET hash = 'corrupted_hash' WHERE id = 'doc1'").run();
const chainVer2 = financeEngine.verifyHashChain(db, 'company-r0-demo');
check('7.2 tampered hash chain verification fails', chainVer2.ok === false);
check('7.3 tampered hash verification reports error', chainVer2.error && chainVer2.error.includes('Hash mismatch'));

// Restore correct current hash for subsequent tests
db.prepare("UPDATE fiscal_doc SET hash = ? WHERE id = 'doc1'").run(currentHash);

// ===========================================================================
// SUITE 8: HTTP ROUTES FOR REVERSALS & TRIAL BALANCE (T2.1.2)
// ===========================================================================
console.log('\n=== SUITE 8: HTTP ROUTES FOR REVERSALS & TRIAL BALANCE ===');

// Grant permissions to accountant role
db.prepare("INSERT OR IGNORE INTO x_acl_grants (role, perm, scope) VALUES ('accountant', 'finance:gl:reverse', 'all')").run();
db.prepare("INSERT OR IGNORE INTO x_acl_grants (role, perm, scope) VALUES ('accountant', 'finance:gl:view', 'all')").run();

// API Test: Reverse Document
const req81 = mockReq('POST', { doc_id: 'doc5' }, { 'x-octagon-user': 'finance_manager' });
const res81 = mockRes();
financeRoutes.handle(req81, res81, new URL('http://localhost/api/x/finance/reverse'));
await wait();
check('8.1 API reverse returns 200 on successful execution', res81.statusCode === 200);
const body81 = JSON.parse(res81.body);
check('8.1.1 API reverse response envelope success', body81.success === true);

// API Test: Trial Balance GET
const req82 = mockReq('GET', null, { 'x-octagon-user': 'finance_manager' });
const res82 = mockRes();
financeRoutes.handle(req82, res82, new URL('http://localhost/api/x/finance/trial-balance?company_id=company-r0-demo'));
await wait();
check('8.2 API trial balance returns 200', res82.statusCode === 200);
const body82 = JSON.parse(res82.body);
check('8.2.1 API trial balance contains cash account details', body82.data.some(a => a.account_code === '101000'));

// API Test: Verify Hash Chain GET
const req83 = mockReq('GET', null, { 'x-octagon-user': 'finance_manager' });
const res83 = mockRes();
financeRoutes.handle(req83, res83, new URL('http://localhost/api/x/finance/verify-chain?company_id=company-r0-demo'));
await wait();
check('8.3 API verify-chain returns 200', res83.statusCode === 200);
const body83 = JSON.parse(res83.body);
check('8.3.1 API verify-chain reports chain ok', body83.data.ok === true);

// ===========================================================================
// CLEAN UP & FINAL SCORE
// ===========================================================================
db.close();
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

console.log(`\nVerification completed. Total failures: ${failures}`);
process.exitCode = failures > 0 ? 1 : 0;

