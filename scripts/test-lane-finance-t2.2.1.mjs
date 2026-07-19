import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dbPath = path.resolve(here, '../vnext-data/test-finance-t221.db');
const migrationsDir = path.resolve(here, '../migrations');

// Ensure clean starting state
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
  '602_r2_period_locks.mjs',
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

// Seeds
const { applyR0ScopeSeed, applyAclAdminDefaultSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db);
applyAclAdminDefaultSeed(db);

const financeEngine = require('../vnext/server/finance/finance-engine');
const { mountFinanceRoutes } = require('../vnext/server/finance/finance-routes');

let failures = 0;
function check(name, expr) {
  if (expr) {
    console.log(`  PASS: ${name}`);
  } else {
    console.error(`  FAIL: ${name}`);
    failures++;
  }
}

// Helpers
function seedDraftDoc(docId, moveType, date, lines) {
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, currency, created_at, created_by)
    VALUES (?, 'company-r0-demo', null, ?, ?, 'draft', 'IQD', ?, 'test_user')
  `).run(docId, moveType, date, nowIso);

  const insertLine = db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, description, created_at)
    VALUES (?, ?, 'company-r0-demo', ?, ?, ?, 'سند قيد', ?)
  `);

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const lineId = `${docId}_line_${i}`;
    insertLine.run(lineId, docId, l.account, l.debit || 0.0, l.credit || 0.0, nowIso);
  }
}

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

const financeRoutes = mountFinanceRoutes({
  db,
  requireSession() { return { ok: true, userId: 'test_user', user: { role: 'admin' } }; }
});

try {
  // ===========================================================================
  // SUITE 1: LOCK DATE CONTROLS (T2.2.1)
  // ===========================================================================
  console.log('=== SUITE 1: LOCK DATE CONTROLS ===');

  // Set lock dates: GL locked up to 2026-06-30
  financeEngine.setLockDates(db, 'company-r0-demo', { glLockDate: '2026-06-30', stockLockDate: '2026-06-30' }, 'test_user');
  
  const lockRow = db.prepare("SELECT gl_lock_date, stock_lock_date FROM company_lock_dates WHERE company_id = 'company-r0-demo'").get();
  check('1.1 lock dates saved in DB', lockRow && lockRow.gl_lock_date === '2026-06-30');

  // Try to post a document on or before the lock date (2026-06-15)
  seedDraftDoc('doc_locked_1', 'manual_entry', '2026-06-15', [
    { account: 'coa_101000', debit: 100, credit: 0 },
    { account: 'coa_401000', debit: 0, credit: 100 },
  ]);

  let postLockedFailed = false;
  try {
    financeEngine.postFiscalDoc(db, 'doc_locked_1', 'test_user');
  } catch (e) {
    postLockedFailed = e.message.includes('locked period');
  }
  check('1.2 posting on or before lock date is blocked', postLockedFailed);

  // Post a document AFTER the lock date (2026-07-15)
  seedDraftDoc('doc_locked_2', 'manual_entry', '2026-07-15', [
    { account: 'coa_101000', debit: 150, credit: 0 },
    { account: 'coa_401000', debit: 0, credit: 150 },
  ]);
  const postLocked2 = financeEngine.postFiscalDoc(db, 'doc_locked_2', 'test_user');
  check('1.3 posting after lock date succeeds', postLocked2.success);

  // ===========================================================================
  // SUITE 2: PERIOD CLOSING & CHECKLISTS (T2.2.1)
  // ===========================================================================
  console.log('\n=== SUITE 2: PERIOD CLOSING & CHECKLISTS ===');

  // Attempt to close period 2026-07 while unposted drafts exist (doc_locked_1 was never posted, but wait, doc_locked_1 date is 2026-06-15 which is period 2026-06)
  // Seed an unposted draft for 2026-07
  seedDraftDoc('doc_draft_july', 'manual_entry', '2026-07-20', [
    { account: 'coa_101000', debit: 200, credit: 0 },
    { account: 'coa_401000', debit: 0, credit: 200 },
  ]);

  let closeFailedDrafts = false;
  try {
    financeEngine.closeFiscalPeriod(db, 'company-r0-demo', '2026-07', 'test_user');
  } catch (e) {
    closeFailedDrafts = e.message.includes('unposted draft documents exist');
  }
  check('2.1 period close blocked by unposted draft checklist', closeFailedDrafts);

  // Post the draft document, then close the period
  financeEngine.postFiscalDoc(db, 'doc_draft_july', 'test_user');
  
  const closeRes = financeEngine.closeFiscalPeriod(db, 'company-r0-demo', '2026-07', 'test_user');
  check('2.2 closing period succeeds after resolving checklist', closeRes.success);

  const periodRow = db.prepare("SELECT status FROM fiscal_periods WHERE company_id = 'company-r0-demo' AND period_id = '2026-07'").get();
  check('2.3 period status updated to closed', periodRow && periodRow.status === 'closed');

  // Try to post a new document in the closed period (2026-07-22)
  seedDraftDoc('doc_closed_post', 'manual_entry', '2026-07-22', [
    { account: 'coa_101000', debit: 50, credit: 0 },
    { account: 'coa_401000', debit: 0, credit: 50 },
  ]);

  let postClosedFailed = false;
  try {
    financeEngine.postFiscalDoc(db, 'doc_closed_post', 'test_user');
  } catch (e) {
    postClosedFailed = e.message.includes('closed or locked period');
  }
  check('2.4 posting in a closed period is blocked', postClosedFailed);

  // Reopen the period and try posting again
  financeEngine.reopenFiscalPeriod(db, 'company-r0-demo', '2026-07', 'test_user');
  const postClosedSuccess = financeEngine.postFiscalDoc(db, 'doc_closed_post', 'test_user');
  check('2.5 posting in reopened period succeeds', postClosedSuccess.success);

  const auditReopen = db.prepare("SELECT action FROM x_audit WHERE entity = 'fiscal_periods' AND action = 'reopen_period'").get();
  check('2.6 reopening is logged in audit trail', !!auditReopen);

  // ===========================================================================
  // SUITE 3: YEAR-END CLOSING ENTRIES & AUTOMATED LOCKS (T2.2.1)
  // ===========================================================================
  console.log('\n=== SUITE 3: YEAR-END CLOSING ENTRIES ===');

  // Currently we have posted:
  // - doc_locked_2 (July 15): D 101000 150, C 401000 150
  // - doc_draft_july (July 20): D 101000 200, C 401000 200
  // - doc_closed_post (July 22): D 101000 50, C 401000 50
  // Total Income (Sales coa_401000) = 400.00 credit
  // Total Cash coa_101000 = 400.00 debit
  // Let's seed an Expense posting to make P&L more interesting
  seedDraftDoc('doc_expense', 'manual_entry', '2026-08-10', [
    { account: 'coa_502000', debit: 120, credit: 0 }, // General Expense
    { account: 'coa_101000', debit: 0, credit: 120 }, // Cash
  ]);
  financeEngine.postFiscalDoc(db, 'doc_expense', 'test_user');
  // Now: Income (Sales) = 400 credit, Expense (General) = 120 debit. Net profit = 280.

  // Run Year-End closing entries
  const closeYrRes = financeEngine.generateClosingEntries(db, 'company-r0-demo', 2026, 'test_user');
  check('3.1 year-end closing entry generated and posted', closeYrRes.success);
  check('3.2 closing doc assigned sequence', closeYrRes.docNumber.startsWith('CLOSE-202612-'));

  // Assert that Income & Expense accounts are now exactly zero for 2026
  const tb = financeEngine.getTrialBalance(db, 'company-r0-demo', { startDate: '2026-01-01', endDate: '2026-12-31' });
  const cashAcct = tb.find(a => a.account_id === 'coa_101000');
  const salesAcct = tb.find(a => a.account_id === 'coa_401000');
  const expAcct = tb.find(a => a.account_id === 'coa_502000');
  const retainedAcct = tb.find(a => a.account_id === 'coa_301000');

  check('3.3 Cash balance is now 280 (400 - 120 expense, close docs do not affect assets)', cashAcct.balance === 280);
  check('3.4 Income (Sales) account balance is closed to 0', salesAcct.balance === 0);
  check('3.5 Expense account balance is closed to 0', expAcct.balance === 0);
  check('3.6 Retained Earnings account received the net profit (280 credit)', retainedAcct.balance === -280); // credit is negative balance

  // Assert that all monthly periods of 2026 are now locked
  const openPeriods = db.prepare("SELECT count(*) as c FROM fiscal_periods WHERE company_id = 'company-r0-demo' AND status = 'open' AND start_date LIKE '2026-%'").get();
  check('3.7 all monthly periods of the year are locked', openPeriods.c === 0);

  // Try to post a new document after year-end close (blocked by locked period)
  seedDraftDoc('doc_late_post', 'manual_entry', '2026-09-01', [
    { account: 'coa_101000', debit: 10, credit: 0 },
    { account: 'coa_401000', debit: 0, credit: 10 },
  ]);
  let latePostFailed = false;
  try {
    financeEngine.postFiscalDoc(db, 'doc_late_post', 'test_user');
  } catch (e) {
    latePostFailed = e.message.includes('closed or locked period');
  }
  check('3.8 posting into locked period after year-end close is blocked', latePostFailed);

  // ===========================================================================
  // SUITE 4: HTTP ENDPOINTS FOR PERIOD LOCKS & CLOSING (T2.2.1)
  // ===========================================================================
  console.log('\n=== SUITE 4: HTTP ENDPOINTS ===');

  // API Test: Set Lock Dates
  const req41 = mockReq('POST', { company_id: 'company-r0-demo', gl_lock_date: '2026-07-31', stock_lock_date: '2026-07-31' });
  const res41 = mockRes();
  financeRoutes.handle(req41, res41, new URL('http://localhost/api/x/finance/lock-dates'));
  await wait();
  check('4.1 API lock-dates returns 200', res41.statusCode === 200);

  // Reopen a period via API to allow closing entries on a new year if needed, but let's test period-reopen endpoint
  const req42 = mockReq('POST', { company_id: 'company-r0-demo', period_id: '2026-07' });
  const res42 = mockRes();
  financeRoutes.handle(req42, res42, new URL('http://localhost/api/x/finance/period-reopen'));
  await wait();
  check('4.2 API period-reopen returns 200', res42.statusCode === 200);

  const periodRowReopened = db.prepare("SELECT status FROM fiscal_periods WHERE company_id = 'company-r0-demo' AND period_id = '2026-07'").get();
  check('4.3 period is open after API reopen', periodRowReopened && periodRowReopened.status === 'open');

  // API Test: Period Close
  const req43 = mockReq('POST', { company_id: 'company-r0-demo', period_id: '2026-07' });
  const res43 = mockRes();
  financeRoutes.handle(req43, res43, new URL('http://localhost/api/x/finance/period-close'));
  await wait();
  check('4.4 API period-close returns 200', res43.statusCode === 200);

  const periodRowClosed = db.prepare("SELECT status FROM fiscal_periods WHERE company_id = 'company-r0-demo' AND period_id = '2026-07'").get();
  check('4.5 period is closed after API close', periodRowClosed && periodRowClosed.status === 'closed');

} catch (err) {
  console.error('Unhandled test execution error:', err);
  failures++;
} finally {
  db.close();

  // Clean up test DB files
  try { fs.unlinkSync(dbPath); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

  console.log(`\nPeriod verification completed. Total failures: ${failures}`);
  process.exitCode = failures > 0 ? 1 : 0;
}
