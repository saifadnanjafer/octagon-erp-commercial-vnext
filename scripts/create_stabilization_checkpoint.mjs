/**
 * Production Stabilization Sprint (2026-07-04) — step 1: checkpoint.
 * Creates timestamped backups of database.db and database.json, and writes a
 * checkpoint report with the exact counters the sprint plan requires before
 * any further change is allowed.
 *
 * Run from octagon-erp/:  node scripts/create_stabilization_checkpoint.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_SQLITE = path.join(ROOT, 'database.db');
const DB_JSON = path.join(ROOT, 'database.json');

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function main() {
  const stamp = timestamp();
  const report = { timestamp: new Date().toISOString(), stamp };

  const dbBackup = `${DB_SQLITE}.checkpoint-${stamp}`;
  const jsonBackup = `${DB_JSON}.checkpoint-${stamp}`;
  fs.copyFileSync(DB_SQLITE, dbBackup);
  fs.copyFileSync(DB_JSON, jsonBackup);
  report.databaseDbBackup = dbBackup;
  report.databaseJsonBackup = jsonBackup;

  const sqliteDb = new DatabaseSync(DB_SQLITE, { readOnly: true });
  function getCollection(name) {
    return sqliteDb.prepare('SELECT data FROM collections WHERE collection = ?').all(name).map(r => JSON.parse(r.data));
  }
  const moves = getCollection('account_moves');
  const journalEntries = getCollection('journal_entries');
  const financeTransactions = getCollection('finance.transactions');
  const payrollPeriods = getCollection('payroll_periods');
  const payrollClosings = getCollection('employee_payroll_closings');
  const payrollPayments = getCollection('payroll_payments');
  const payrollAdjustments = getCollection('payroll_adjustments');
  const employees = getCollection('employees');

  let cashBalance = 0;
  moves.forEach(m => { if (m.state === 'posted') (m.line_ids || []).forEach(l => { if (l.account_id === 'cash_workshop') cashBalance += Number(l.debit || 0) - Number(l.credit || 0); }); });

  const suspenseMoves = moves.filter(m => (m.line_ids || []).some(l => l.account_id === 'suspense'));
  const draftMoves = moves.filter(m => m.state === 'draft');
  const cancelledMoves = moves.filter(m => m.state === 'cancel');

  let totalDebit = 0, totalCredit = 0;
  moves.forEach(m => { if (m.state !== 'posted') return; (m.line_ids || []).forEach(l => { totalDebit += Number(l.debit || 0); totalCredit += Number(l.credit || 0); }); });

  report.checkpoint = {
    accountMovesCount: moves.length,
    journalEntriesCount: journalEntries.length,
    financeTransactionsCount: financeTransactions.length,
    cashWorkshopBalance: cashBalance,
    payrollPeriodsCount: payrollPeriods.length,
    employeePayrollClosingsCount: payrollClosings.length,
    payrollPaymentsCount: payrollPayments.length,
    payrollAdjustmentsCount: payrollAdjustments.length,
    employeesCount: employees.length,
    suspenseMovesCount: suspenseMoves.length,
    draftMovesCount: draftMoves.length,
    cancelledMovesCount: cancelledMoves.length,
    totalDebit,
    totalCredit,
    balanced: Math.round(totalDebit) === Math.round(totalCredit),
  };
  sqliteDb.close();

  const reportDir = path.join(ROOT, 'review-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `stabilization_checkpoint_${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nCheckpoint report: ${reportPath}`);
}

main();
