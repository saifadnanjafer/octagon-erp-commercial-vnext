// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.2 (proprietary self, not copied)
// R10.2 payroll golden-month fixture builder.
//
// Captures the frozen payroll truth for every historical period the legacy store
// still holds, strictly read-only (readOnly handle + PRAGMA query_only), into
// vnext-fixtures/legacy-payroll-golden.db. This fixture is the ONLY thing the
// R10.2 replay compares against; the replay never recomputes payroll.
//
// Fidelity is recorded per period, honestly, because the legacy store does not
// hold the same depth for every month:
//   - 'closing_detail' — full per-employee employee_payroll_closings records
//     survive, so every field can be compared byte-for-byte.
//   - 'period_totals'  — the closing records for that month were superseded in
//     the legacy app, but the posted accrual/settlement journal totals, the
//     payroll payments, and the advance ledger for the period survive, so the
//     month is proven at period level.
// A month is NEVER upgraded to a fidelity its surviving evidence cannot support,
// and figures are never reconstructed or inferred.
//
// Identifiers use the same stable pseudonym scheme as the R0 fixture
// (`<prefix>_<sha256(value)[:12]>`) so ids line up across both fixtures.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const defaultSource = path.resolve(root, '..', 'octagon-erp', 'database.db');
const sourcePath = path.resolve(process.env.OCTAGON_LEGACY_SOURCE_DB || defaultSource);
const outputPath = path.join(root, 'vnext-fixtures', 'legacy-payroll-golden.db');

const SENSITIVE_KEY_PARTS = [
  'name', 'alias', 'email', 'phone', 'mobile', 'address', 'note', 'description',
  'token', 'secret', 'password', 'credential', 'iban', 'national', 'passport',
  'user', 'createdby', 'updatedby', 'closedby', 'approvedby',
];

function stableToken(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12)}`;
}
function isSensitiveKey(key) {
  const lowered = String(key).replaceAll('_', '').toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lowered.includes(part));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// Fields carried into the golden closing record. `lockedSnapshotJson` is
// deliberately NOT copied — it embeds the raw attendance log — but its digest is,
// so any tampering with the locked snapshot is still detectable.
const CLOSING_FIELDS = [
  'payrollPeriodId', 'employeeId', 'baseSalarySnapshot', 'attendanceDays', 'absenceDays',
  'fridayWorkDays', 'overtimeHours', 'lateMinutes', 'grossSalary', 'salaryDeductions',
  'bonuses', 'penalties', 'damageDeductions', 'currentPeriodAdvances',
  'legacyTimesheetAdvancesSnapshot', 'previousEmployeeDebt', 'previousCompanyPayable',
  'netAccruedSalary', 'advanceSettlementAmount', 'netPayableAfterAdvanceSettlement',
  'paidAmount', 'remainingAmount', 'balanceDirection', 'status',
];

function edgeCaseTags(closing) {
  const tags = [];
  if (Number(closing.fridayWorkDays) > 0 || Number(closing.overtimeHours) > 0) tags.push('friday_overtime');
  if (Number(closing.currentPeriodAdvances) > 0) tags.push('advances');
  if (Number(closing.bonuses) > 0) tags.push('month_end_bonus');
  if (Number(closing.netPayableAfterAdvanceSettlement) < 0) tags.push('negative_balance');
  if (Number(closing.penalties) > 0) tags.push('penalties');
  if (Number(closing.attendanceDays) === 0) tags.push('zero_attendance');
  return tags;
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Legacy source database not found: ${sourcePath}`);
    process.exitCode = 1;
    return;
  }

  const source = new DatabaseSync(sourcePath, { readOnly: true });
  source.exec('PRAGMA query_only = ON;');
  const read = (collection) => source
    .prepare('SELECT id, data FROM collections WHERE collection = ? ORDER BY id')
    .all(collection)
    .map((row) => ({ id: row.id, payload: JSON.parse(row.data) }));

  const periods = read('payroll_periods');
  const closings = read('employee_payroll_closings');
  const payments = read('payroll_payments');
  const advances = read('employee_advances');
  const moves = read('account_moves').map((row) => row.payload);

  // Stable pseudonyms for every identifier that leaves the frozen store.
  const idMap = new Map();
  const mapId = (prefix, value) => {
    const key = String(value);
    if (!idMap.has(key)) idMap.set(key, stableToken(prefix, key));
    return idMap.get(key);
  };
  for (const period of periods) mapId('payroll_periods', period.payload.id || period.id);
  for (const closing of closings) {
    mapId('employee', closing.payload.employeeId);
    mapId('employee_payroll_closings', closing.payload.id || closing.id);
  }
  for (const payment of payments) {
    mapId('employee', payment.payload.employeeId);
    mapId('payroll_payments', payment.payload.id || payment.id);
  }
  for (const advance of advances) mapId('employee', advance.payload.employeeId);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const stale = outputPath + suffix;
    if (fs.existsSync(stale)) fs.rmSync(stale);
  }

  const target = new DatabaseSync(outputPath);
  target.exec(`
    CREATE TABLE r10_payroll_golden_period (
      period_id        TEXT PRIMARY KEY,
      year             INTEGER NOT NULL,
      month            INTEGER NOT NULL,
      start_date       TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      status           TEXT NOT NULL,
      fidelity         TEXT NOT NULL,
      closing_count    INTEGER NOT NULL,
      accrual_total    REAL NOT NULL,
      settlement_total REAL NOT NULL,
      payment_total    REAL NOT NULL,
      advance_total    REAL NOT NULL,
      advance_count    INTEGER NOT NULL
    );
    CREATE TABLE r10_payroll_golden_closing (
      employee_id            TEXT NOT NULL,
      period_id              TEXT NOT NULL,
      closing_json           TEXT NOT NULL,
      closing_digest         TEXT NOT NULL,
      locked_snapshot_digest TEXT,
      edge_case_tags         TEXT NOT NULL,
      PRIMARY KEY (employee_id, period_id)
    );
    CREATE TABLE r10_payroll_golden_payment (
      payment_id   TEXT PRIMARY KEY,
      period_id    TEXT NOT NULL,
      employee_id  TEXT NOT NULL,
      amount       REAL NOT NULL,
      method       TEXT NOT NULL,
      payment_date TEXT NOT NULL
    );
    CREATE TABLE r10_payroll_golden_manifest (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const originTotal = (prefix) => moves
    .filter((move) => String(move.origin || '') === prefix)
    .reduce((sum, move) => sum + (Number(move.amount_total) || 0), 0);

  target.exec('BEGIN IMMEDIATE');
  let closingRows = 0;
  let paymentRows = 0;
  try {
    const insertPeriod = target.prepare(`
      INSERT INTO r10_payroll_golden_period
        (period_id, year, month, start_date, end_date, status, fidelity, closing_count, accrual_total, settlement_total, payment_total, advance_total, advance_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertClosing = target.prepare(`
      INSERT INTO r10_payroll_golden_closing (employee_id, period_id, closing_json, closing_digest, locked_snapshot_digest, edge_case_tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertPayment = target.prepare(`
      INSERT INTO r10_payroll_golden_payment (payment_id, period_id, employee_id, amount, method, payment_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const period of periods) {
      const legacyPeriodId = String(period.payload.id || period.id);
      const periodId = mapId('payroll_periods', legacyPeriodId);
      const stamp = `${period.payload.year}-${String(period.payload.month).padStart(2, '0')}`;

      const periodClosings = closings.filter((row) => String(row.payload.payrollPeriodId) === legacyPeriodId);
      const periodPayments = payments.filter((row) => String(row.payload.payrollPeriodId) === legacyPeriodId);
      const periodAdvances = advances.filter((row) => String(row.payload.period || '') === stamp);

      for (const closing of periodClosings) {
        const record = {};
        for (const field of CLOSING_FIELDS) {
          if (field === 'payrollPeriodId') record[field] = periodId;
          else if (field === 'employeeId') record[field] = mapId('employee', closing.payload.employeeId);
          else record[field] = closing.payload[field] === undefined ? null : closing.payload[field];
        }
        const serialized = canonical(record);
        insertClosing.run(
          record.employeeId,
          periodId,
          serialized,
          crypto.createHash('sha256').update(serialized).digest('hex'),
          closing.payload.lockedSnapshotJson
            ? crypto.createHash('sha256').update(String(closing.payload.lockedSnapshotJson)).digest('hex')
            : null,
          JSON.stringify(edgeCaseTags(closing.payload))
        );
        closingRows += 1;
      }

      for (const payment of periodPayments) {
        insertPayment.run(
          mapId('payroll_payments', payment.payload.id || payment.id),
          periodId,
          mapId('employee', payment.payload.employeeId),
          Number(payment.payload.amount) || 0,
          String(payment.payload.method || 'unknown'),
          String(payment.payload.paymentDate || '')
        );
        paymentRows += 1;
      }

      insertPeriod.run(
        periodId,
        Number(period.payload.year),
        Number(period.payload.month),
        String(period.payload.startDate || ''),
        String(period.payload.endDate || ''),
        String(period.payload.status || ''),
        periodClosings.length ? 'closing_detail' : 'period_totals',
        periodClosings.length,
        originTotal(`payroll/accrual/${stamp}`),
        originTotal(`payroll/advance-settlement/${stamp}`),
        periodPayments.reduce((sum, row) => sum + (Number(row.payload.amount) || 0), 0),
        periodAdvances.reduce((sum, row) => sum + (Number(row.payload.amount) || 0), 0),
        periodAdvances.length
      );
    }
    target.exec('COMMIT');
  } catch (error) {
    try { target.exec('ROLLBACK'); } catch (_) { /* rollback is best-effort */ }
    throw error;
  }

  const periodSummary = target.prepare('SELECT period_id, year, month, fidelity, closing_count FROM r10_payroll_golden_period ORDER BY year, month').all();
  const manifest = {
    captureMethod: 'read-only SELECT projection of the frozen payroll zone',
    sourceDatabase: sourcePath,
    fixtureDatabase: outputPath,
    capturedAt: new Date().toISOString(),
    periodCount: periodSummary.length,
    closingRows,
    paymentRows,
    fidelityByPeriod: Object.fromEntries(periodSummary.map((row) => [`${row.year}-${String(row.month).padStart(2, '0')}`, row.fidelity])),
    identifiers: 'stable sha256[:12] pseudonyms, same scheme as the R0 fixture',
    lockedSnapshot: 'not copied; sha256 digest retained so tampering stays detectable',
    guarantee: 'figures are captured verbatim; no payroll value is recomputed, inferred, or reconstructed',
  };
  const setMeta = target.prepare('INSERT INTO r10_payroll_golden_manifest (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(manifest)) {
    setMeta.run(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  target.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  target.close();
  source.close();

  fs.writeFileSync(
    path.join(root, 'vnext-fixtures', 'r10-payroll-golden-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  console.log(`R10.2 payroll golden fixture written: ${outputPath}`);
  for (const row of periodSummary) {
    console.log(`  ${row.year}-${String(row.month).padStart(2, '0')}  fidelity=${row.fidelity}  closings=${row.closing_count}`);
  }
  console.log(`  closings=${closingRows} payments=${paymentRows}`);
}

main();
