/**
 * Production Hardening Final Lock Sprint (2026-07-04) — removes the
 * synthetic test data created to exercise the server-backed operation lock
 * (Tests 1-6). This data was never a real business event (fake employee
 * "TEST_EMP_LOCKSPRINT", fake period year 2099) — it existed purely to prove
 * the lock mechanism against real code paths (postPayrollAccrual,
 * settlePayrollPayment). Unlike real business postings, it is safe to
 * physically remove rather than reverse-only, since it never represented
 * anything real. Recomputes the posted-move hash chain afterward (same
 * algorithm as FinanceService.recomputePostedHashChain) since removing moves
 * changes the chain.
 *
 * Run from octagon-erp/: node scripts/cleanup_lock_sprint_test_data.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_SQLITE = path.join(ROOT, 'database.db');
const DRY_RUN = process.argv.includes('--dry-run');

const TEST_MOVE_IDS = new Set([
  'MOVE_1783118970184_nfdls1', 'MOVE_1783118972583_qjzg2z', // Test 1 accrual/advance (later cancelled)
  'MOVE_1783119009570_dc79lc', 'MOVE_1783119012950_year7n', // their reversals
  'MOVE_1783119173350_4q0n1z', 'MOVE_1783119175714_pwlm1p', // Test 2 real completion accrual/advance
  'MOVE_1783119194363_8u1ga3', // Test 3 payment
  'MOVE_1783119318936_en4uyb', 'MOVE_1783119328240_xz3dp7', // Test 6 crash-simulation duplicate pair (pre-reload bug in test execution, not app bug)
  'MOVE_1783119374086_kl5ihn', // Test 6 crash-simulation (correct single move)
]);
const TEST_PERIOD_ID = 'payperiod_LOCKTEST_1783118963975_hf0qg6';
const TEST_CLOSING_ID = 'payclose_LOCKTEST_1783118963975_ogm83k';

function computeHash(move, previousHash = 'genesis') {
  const payload = JSON.stringify({
    id: move.id, name: move.name, date: move.date, journal_id: move.journal_id, move_type: move.move_type,
    previous_hash: previousHash,
    line_ids: (move.line_ids || []).map(line => ({ account_id: line.account_id, debit: Number(line.debit || 0), credit: Number(line.credit || 0), partner_id: line.partner_id || '' })),
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) h = Math.imul(h ^ payload.charCodeAt(i), 0x01000193) >>> 0;
  const suffix = btoa(unescape(encodeURIComponent(payload.slice(0, 24)))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return `${h.toString(16).padStart(8, '0')}-${suffix}`;
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function main() {
  const stamp = timestamp();
  const report = { dryRun: DRY_RUN };
  if (!DRY_RUN) {
    const backupPath = `${DB_SQLITE}.backup-before-lock-sprint-cleanup-${stamp}`;
    fs.copyFileSync(DB_SQLITE, backupPath);
    report.backup = backupPath;
  }

  const sqliteDb = new DatabaseSync(DB_SQLITE, DRY_RUN ? { readOnly: true } : {});
  const rows = sqliteDb.prepare('SELECT rowid, collection, id, data FROM collections').all();

  const toDelete = [];
  const remainingMoves = [];
  for (const row of rows) {
    if (row.collection === 'account_moves' && TEST_MOVE_IDS.has(row.id)) { toDelete.push(row.rowid); continue; }
    if (row.collection === 'journal_entries') {
      const je = JSON.parse(row.data);
      if (TEST_MOVE_IDS.has(je.account_move_id) || TEST_MOVE_IDS.has(je.id)) { toDelete.push(row.rowid); continue; }
    }
    if (row.collection === 'payroll_periods' && row.id === TEST_PERIOD_ID) { toDelete.push(row.rowid); continue; }
    if (row.collection === 'employee_payroll_closings' && row.id === TEST_CLOSING_ID) { toDelete.push(row.rowid); continue; }
    if (row.collection === 'payroll_payments') {
      const p = JSON.parse(row.data);
      if (p.employeePayrollClosingId === TEST_CLOSING_ID) { toDelete.push(row.rowid); continue; }
    }
    if (row.collection === 'operation_locks') { toDelete.push(row.rowid); continue; } // all locks from this sprint's testing
    if (row.collection === 'account_moves') remainingMoves.push(JSON.parse(row.data));
  }
  report.rowsToDelete = toDelete.length;
  report.remainingMoveCount = remainingMoves.length;

  // Recompute hash chain for the moves that remain (real business data only).
  const posted = remainingMoves.filter(m => m.state === 'posted').sort((a, b) => (
    String(a.date || '').localeCompare(String(b.date || '')) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || ''))
  ));
  let previousHash = 'genesis';
  posted.forEach(m => { m.previous_hash = previousHash; m.hash = computeHash(m, previousHash); previousHash = m.hash; });
  report.hashChainRecomputedCount = posted.length;

  let totalDebit = 0, totalCredit = 0, cashBal = 0;
  remainingMoves.forEach(m => {
    if (m.state !== 'posted') return;
    (m.line_ids || []).forEach(l => { totalDebit += Number(l.debit || 0); totalCredit += Number(l.credit || 0); if (l.account_id === 'cash_workshop') cashBal += Number(l.debit || 0) - Number(l.credit || 0); });
  });
  report.totalDebitAfter = totalDebit;
  report.totalCreditAfter = totalCredit;
  report.balancedAfter = Math.round(totalDebit) === Math.round(totalCredit);
  report.cashWorkshopBalanceAfter = cashBal;

  if (DRY_RUN) {
    console.log(JSON.stringify(report, null, 2));
    sqliteDb.close();
    return;
  }

  sqliteDb.exec('BEGIN TRANSACTION');
  try {
    const deleteStmt = sqliteDb.prepare('DELETE FROM collections WHERE rowid = ?');
    toDelete.forEach(rowid => deleteStmt.run(rowid));
    const updateStmt = sqliteDb.prepare('UPDATE collections SET data = ? WHERE collection = ? AND id = ?');
    posted.forEach(m => updateStmt.run(JSON.stringify(m), 'account_moves', m.id));
    sqliteDb.exec('COMMIT');
    report.applied = true;
  } catch (e) {
    sqliteDb.exec('ROLLBACK');
    report.error = e.message;
  }
  sqliteDb.close();

  const reportDir = path.join(ROOT, 'review-reports');
  const reportPath = path.join(reportDir, `lock_sprint_test_cleanup_${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);
}

main();
