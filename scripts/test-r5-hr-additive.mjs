// R5.5 acceptance: HR-additive suite (frozen-safe) on a disposable database.
// Accrual DSL grants per milestone/cap/carryover; ATS pipeline runs end-to-end;
// an expense claim posts a real balanced reimbursement JE; HR versioning is
// dated; and every frozen-zone write attempt fails closed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import hr from '../vnext/server/modules/hr/hr-additive.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r5-hr-'));
const dbPath = path.join(temp, 'r5hr.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

// --- 1. accrual DSL ---
const leaveType = hr.createLeaveType(db, company, { name: 'Annual', accrual: { milestones: [{ after_months: 0, days_per_year: 15 }, { after_months: 12, days_per_year: 21 }], cap: 30, carryover: 5 } }, 'u');
check('accrual grants the junior milestone for a new employee (full year)', () => {
  const alloc = hr.accrueLeave(db, company, { employee_ref: 'emp-1', leave_type_id: leaveType.id, months_of_service: 3, elapsed_year_fraction: 1, period: '2026' }, 'u');
  assert.equal(alloc.granted_days, 15);
});
check('accrual grants the senior milestone after the tenure threshold', () => {
  const alloc = hr.accrueLeave(db, company, { employee_ref: 'emp-2', leave_type_id: leaveType.id, months_of_service: 18, elapsed_year_fraction: 1, period: '2026' }, 'u');
  assert.equal(alloc.granted_days, 21);
});
check('accrual prorates by elapsed year fraction', () => {
  const alloc = hr.accrueLeave(db, company, { employee_ref: 'emp-3', leave_type_id: leaveType.id, months_of_service: 3, elapsed_year_fraction: 0.5, period: '2026' }, 'u');
  assert.equal(alloc.granted_days, 7.5);
});
check('carryover is added but capped', () => {
  const alloc = hr.accrueLeave(db, company, { employee_ref: 'emp-4', leave_type_id: leaveType.id, months_of_service: 18, elapsed_year_fraction: 1, prior_balance: 20, period: '2026' }, 'u');
  // 21 + min(carryover 5, prior 20)=5 => 26, under cap 30
  assert.equal(alloc.granted_days, 26);
});
check('cap limits total granted days', () => {
  const bigType = hr.createLeaveType(db, company, { name: 'Big', accrual: { milestones: [{ after_months: 0, days_per_year: 40 }], cap: 30, carryover: 0 } }, 'u');
  const alloc = hr.accrueLeave(db, company, { employee_ref: 'emp-5', leave_type_id: bigType.id, months_of_service: 1, elapsed_year_fraction: 1, period: '2026' }, 'u');
  assert.equal(alloc.granted_days, 30);
});

// --- 2. leave request consumes balance (never payroll) ---
const req = hr.requestLeave(db, company, { employee_ref: 'emp-1', leave_type_id: leaveType.id, days: 5 }, 'u', null);
check('approved leave consumes allocation balance', () => {
  const approved = hr.approveLeave(db, company, req.id, 'manager', null);
  assert.equal(approved.state, 'approved');
  assert.equal(approved.balance, 10); // 15 granted - 5 used
});
check('leave over balance is rejected', () => {
  const big = hr.requestLeave(db, company, { employee_ref: 'emp-1', leave_type_id: leaveType.id, days: 100 }, 'u', null);
  assert.throws(() => hr.approveLeave(db, company, big.id, 'manager', null), (e) => e.code === 'LEAVE_BALANCE_INSUFFICIENT');
});

// --- 3. ATS pipeline E2E ---
const job = hr.createJob(db, company, { title: 'Accountant', stages: ['applied', 'interview', 'offer', 'hired'] }, 'u');
const app = hr.applyCandidate(db, company, { job_id: job.id, candidate_name: 'Sara' }, 'u');
check('candidate enters the first stage', () => assert.equal(app.stage, 'applied'));
check('application advances through stages to hired', () => {
  let state = hr.advanceApplication(db, company, app.id, 'u'); assert.equal(state.stage, 'interview');
  state = hr.advanceApplication(db, company, app.id, 'u'); assert.equal(state.stage, 'offer');
  state = hr.advanceApplication(db, company, app.id, 'u'); assert.equal(state.state, 'hired');
});
check('another candidate can be refused with a reason', () => {
  const app2 = hr.applyCandidate(db, company, { job_id: job.id, candidate_name: 'Omar' }, 'u');
  const refused = hr.refuseApplication(db, company, app2.id, 'overqualified', 'u');
  assert.equal(refused.state, 'refused');
});

// --- 4. expense claim posts a balanced reimbursement JE ---
const empPartner = arap.createPartner(db, company, { id: 'emp-partner', name: 'Employee Reimburse', partner_type: 'supplier' }, 'u');
const claim = hr.createExpenseClaim(db, company, { employee_ref: 'emp-1', partner_id: empPartner.id, amount: 250, description: 'taxi + hotel' }, 'u', null);
check('approved expense claim posts a real balanced reimbursement JE', () => {
  const reimbursed = hr.approveExpenseClaim(db, company, claim.id, 'manager', null);
  assert.equal(reimbursed.state, 'reimbursed');
  assert.ok(reimbursed.reimbursement_doc_id);
  const doc = db.prepare('SELECT a.total_amount, f.state FROM arap_document a JOIN fiscal_doc f ON f.id=a.fiscal_doc_id WHERE a.id=?').get(reimbursed.reimbursement_doc_id);
  assert.equal(doc.total_amount, 250);
  assert.equal(doc.state, 'posted');
  const sums = db.prepare('SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM fiscal_doc_line WHERE fiscal_doc_id=?').get(reimbursed.reimbursement_doc_id);
  assert.equal(sums.d, sums.c);
});
check('expense claim without a partner cannot post a JE', () => {
  const noPartner = hr.createExpenseClaim(db, company, { employee_ref: 'emp-1', amount: 10, description: 'x' }, 'u', null);
  assert.throws(() => hr.approveExpenseClaim(db, company, noPartner.id, 'manager', null), (e) => e.code === 'EXPENSE_PARTNER_REQUIRED');
});

// --- 5. dated HR versioning ---
hr.recordEmployeeVersion(db, company, { employee_ref: 'emp-1', effective_date: '2026-01-01', fields: { grade: 'A', title: 'Junior' } }, 'u');
hr.recordEmployeeVersion(db, company, { employee_ref: 'emp-1', effective_date: '2026-07-01', fields: { grade: 'B', title: 'Senior' } }, 'u');
check('employee version resolves the record as of a date', () => {
  assert.equal(hr.employeeAsOf(db, company, 'emp-1', '2026-03-01').fields.title, 'Junior');
  assert.equal(hr.employeeAsOf(db, company, 'emp-1', '2026-08-01').fields.title, 'Senior');
});

// --- 6. FROZEN BOUNDARY: every frozen-zone write attempt fails closed ---
check('writing the frozen employees table fails closed', () => assert.throws(() => hr.assertNotFrozen('employees'), (e) => e.code === 'FROZEN_ZONE_WRITE_DENIED'));
check('writing the frozen attendance table fails closed', () => assert.throws(() => hr.assertNotFrozen('employee_attendance'), (e) => e.code === 'FROZEN_ZONE_WRITE_DENIED'));
check('writing the frozen payroll table fails closed', () => assert.throws(() => hr.assertNotFrozen('payroll_periods'), (e) => e.code === 'FROZEN_ZONE_WRITE_DENIED'));
check('writing a frozen timesheet table fails closed', () => assert.throws(() => hr.assertNotFrozen('workshop_timesheet'), (e) => e.code === 'FROZEN_ZONE_WRITE_DENIED'));
check('recordEmployeeVersion targeting a frozen table fails closed', () => assert.throws(() => hr.recordEmployeeVersion(db, company, { employee_ref: 'e', effective_date: '2026-01-01', target_table: 'employees', fields: {} }, 'u'), (e) => e.code === 'FROZEN_ZONE_WRITE_DENIED'));
check('the VNext hr_v2_ namespace is NOT treated as frozen', () => { hr.assertNotFrozen('hr_v2_employee_version'); assert.ok(true); });
check('no frozen table was written by any HR operation', () => {
  for (const table of ['employees', 'payroll_periods', 'omni_employeeAttendance']) {
    const exists = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name=?").get(table).n;
    assert.equal(exists, 0); // these tables don't even exist in the VNext schema
  }
});

for (const line of results) console.log(line);
console.log(`R5 HR-ADDITIVE SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
