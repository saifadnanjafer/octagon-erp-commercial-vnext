// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R5.5 HR-additive suite (frozen-safe). Leave v2 (accrual DSL), recruitment ATS,
// expense claims → R2.6 reimbursement JE, and dated HR-field versioning. FROZEN
// BOUNDARY: this module never writes attendance/payroll/employee master tables —
// any such target fails closed via assertNotFrozen.
'use strict';

const crypto = require('node:crypto');
const arap = require('../../finance/arap-engine');
const infra = require('../r3-infra');
const { fail, ensureCompany, money, recordWrite } = infra;

function id(p) { return `${p}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

// The frozen zone: attendance, payroll, timesheet, and the legacy employee
// master are read-only to VNext HR. VNext HR uses the hr_v2_* namespace only.
const FROZEN_RE = /(^|_)(employee|employees|timesheet|attendance|payroll)(_|$)/i;
function assertNotFrozen(table) {
  if (FROZEN_RE.test(String(table)) && !/^hr_v2_/.test(String(table))) {
    throw fail(`frozen zone: VNext HR must not write ${table}`, 403, 'FROZEN_ZONE_WRITE_DENIED');
  }
}

// ---- Leave v2: accrual DSL ----
// accrual_json: { milestones: [{ after_months, days_per_year }], cap, carryover }
function createLeaveType(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const accrual = input.accrual || { milestones: [{ after_months: 0, days_per_year: 15 }], cap: 30, carryover: 0 };
  const row = { id: id('lt'), company_id: companyId, name: String(input.name || 'إجازة'), accrual_json: JSON.stringify(accrual), max_carryover: Number(accrual.carryover || 0), requires_approval: input.requires_approval === false ? 0 : 1, created_at: now() };
  db.prepare('INSERT INTO hr_v2_leave_type(id,company_id,name,accrual_json,max_carryover,requires_approval,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(row.id, row.company_id, row.name, row.accrual_json, row.max_carryover, row.requires_approval, row.created_at);
  return { ...row, accrual };
}

// Grant leave per the accrual DSL for an employee with `monthsOfService`.
// Deterministic: the applicable milestone is the highest after_months <= service;
// prorated to the elapsed fraction of the year, capped, with carryover applied.
function accrueLeave(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const type = db.prepare('SELECT * FROM hr_v2_leave_type WHERE id=? AND company_id=?').get(input.leave_type_id, companyId);
  if (!type) throw fail('leave type is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  const accrual = JSON.parse(type.accrual_json);
  const months = Number(input.months_of_service || 0);
  const milestones = (accrual.milestones || []).slice().sort((a, b) => Number(b.after_months) - Number(a.after_months));
  const milestone = milestones.find((m) => Number(m.after_months) <= months) || milestones[milestones.length - 1] || { days_per_year: 0 };
  const elapsedFraction = Math.min(1, Math.max(0, Number(input.elapsed_year_fraction == null ? 1 : input.elapsed_year_fraction)));
  let granted = Number(milestone.days_per_year) * elapsedFraction;
  const carryover = Math.min(Number(accrual.carryover || 0), Number(input.prior_balance || 0));
  granted += carryover;
  if (accrual.cap != null) granted = Math.min(granted, Number(accrual.cap));
  granted = money(granted);
  const period = String(input.period || new Date().getFullYear());
  const existing = db.prepare('SELECT id FROM hr_v2_leave_allocation WHERE company_id=? AND employee_ref=? AND leave_type_id=? AND period=?').get(companyId, input.employee_ref, input.leave_type_id, period);
  if (existing) { db.prepare('UPDATE hr_v2_leave_allocation SET granted_days=? WHERE id=?').run(granted, existing.id); return { id: existing.id, granted_days: granted, carryover }; }
  const row = { id: id('alloc'), company_id: companyId, employee_ref: String(input.employee_ref), leave_type_id: input.leave_type_id, granted_days: granted, used_days: 0, period, created_at: now() };
  db.prepare('INSERT INTO hr_v2_leave_allocation(id,company_id,employee_ref,leave_type_id,granted_days,used_days,period,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(row.id, row.company_id, row.employee_ref, row.leave_type_id, row.granted_days, 0, row.period, row.created_at);
  return { ...row, carryover };
}

// A leave request consumes allocation only when approved; it NEVER writes
// attendance/payroll — it only updates the VNext allocation balance.
function requestLeave(db, companyId, input, userId, runtime) {
  ensureCompany(db, companyId);
  const days = Number(input.days);
  if (!(days > 0)) throw fail('leave days must be positive', 400);
  const row = { id: id('lr'), company_id: companyId, employee_ref: String(input.employee_ref), leave_type_id: input.leave_type_id, days, state: 'draft', created_at: now() };
  db.prepare('INSERT INTO hr_v2_leave_request(id,company_id,employee_ref,leave_type_id,days,state,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(row.id, row.company_id, row.employee_ref, row.leave_type_id, row.days, row.state, row.created_at);
  recordWrite(db, runtime, companyId, 'hr_v2_leave_request', row.id, 'created', userId, null, row, 'hr');
  return row;
}
function approveLeave(db, companyId, requestId, userId, runtime) {
  ensureCompany(db, companyId);
  const request = db.prepare('SELECT * FROM hr_v2_leave_request WHERE id=? AND company_id=?').get(requestId, companyId);
  if (!request) throw fail('leave request is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (request.state !== 'draft') throw fail('leave request is not draft', 409);
  const allocation = db.prepare("SELECT * FROM hr_v2_leave_allocation WHERE company_id=? AND employee_ref=? AND leave_type_id=? ORDER BY period DESC LIMIT 1").get(companyId, request.employee_ref, request.leave_type_id);
  if (!allocation || Number(allocation.granted_days) - Number(allocation.used_days) < request.days) throw fail('insufficient leave balance', 409, 'LEAVE_BALANCE_INSUFFICIENT');
  db.prepare('UPDATE hr_v2_leave_allocation SET used_days=used_days+? WHERE id=?').run(request.days, allocation.id);
  db.prepare("UPDATE hr_v2_leave_request SET state='approved' WHERE id=?").run(requestId);
  const before = { ...request }; const after = { ...request, state: 'approved' };
  recordWrite(db, runtime, companyId, 'hr_v2_leave_request', requestId, 'approved', userId, before, after, null);
  return { id: requestId, state: 'approved', balance: money(Number(allocation.granted_days) - Number(allocation.used_days) - request.days) };
}

// ---- Recruitment ATS ----
function createJob(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const stages = Array.isArray(input.stages) ? input.stages : ['applied', 'interview', 'offer', 'hired'];
  const row = { id: id('job'), company_id: companyId, title: String(input.title || 'وظيفة'), stages_json: JSON.stringify(stages), state: 'open', created_at: now() };
  db.prepare('INSERT INTO hr_v2_job(id,company_id,title,stages_json,state,created_at) VALUES(?,?,?,?,?,?)').run(row.id, row.company_id, row.title, row.stages_json, row.state, row.created_at);
  return { ...row, stages };
}
function applyCandidate(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const job = db.prepare('SELECT * FROM hr_v2_job WHERE id=? AND company_id=?').get(input.job_id, companyId);
  if (!job) throw fail('job is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  const stages = JSON.parse(job.stages_json);
  const row = { id: id('app'), company_id: companyId, job_id: input.job_id, candidate_name: String(input.candidate_name || ''), stage: stages[0], refuse_reason: null, state: 'active', created_at: now() };
  db.prepare('INSERT INTO hr_v2_application(id,company_id,job_id,candidate_name,stage,refuse_reason,state,created_at) VALUES(?,?,?,?,?,?,?,?)').run(row.id, row.company_id, row.job_id, row.candidate_name, row.stage, null, row.state, row.created_at);
  return row;
}
function advanceApplication(db, companyId, applicationId, userId) {
  ensureCompany(db, companyId);
  const app = db.prepare('SELECT * FROM hr_v2_application WHERE id=? AND company_id=?').get(applicationId, companyId);
  if (!app) throw fail('application is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (app.state !== 'active') throw fail('application is not active', 409);
  const job = db.prepare('SELECT stages_json FROM hr_v2_job WHERE id=?').get(app.job_id);
  const stages = JSON.parse(job.stages_json);
  const idx = stages.indexOf(app.stage);
  if (idx < 0 || idx >= stages.length - 1) { db.prepare("UPDATE hr_v2_application SET stage=?, state='hired' WHERE id=?").run(stages[stages.length - 1], applicationId); return { id: applicationId, stage: stages[stages.length - 1], state: 'hired' }; }
  const nextIdx = idx + 1;
  // Advancing INTO the final stage marks the candidate hired.
  const nextState = nextIdx === stages.length - 1 ? 'hired' : 'active';
  db.prepare('UPDATE hr_v2_application SET stage=?, state=? WHERE id=?').run(stages[nextIdx], nextState, applicationId);
  return { id: applicationId, stage: stages[nextIdx], state: nextState };
}
function refuseApplication(db, companyId, applicationId, reason, userId) {
  ensureCompany(db, companyId);
  const app = db.prepare('SELECT id FROM hr_v2_application WHERE id=? AND company_id=?').get(applicationId, companyId);
  if (!app) throw fail('application is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  db.prepare("UPDATE hr_v2_application SET state='refused', refuse_reason=? WHERE id=?").run(String(reason || 'not a fit'), applicationId);
  return { id: applicationId, state: 'refused' };
}

// ---- Expense claims → R2.6 reimbursement JE ----
function createExpenseClaim(db, companyId, input, userId, runtime) {
  ensureCompany(db, companyId);
  const amount = money(Number(input.amount));
  if (!(amount > 0)) throw fail('expense amount must be positive', 400);
  const row = { id: id('exp'), company_id: companyId, employee_ref: String(input.employee_ref), partner_id: input.partner_id || null, amount, description: String(input.description || 'expense'), state: 'draft', reimbursement_doc_id: null, created_at: now() };
  db.prepare('INSERT INTO hr_v2_expense_claim(id,company_id,employee_ref,partner_id,amount,description,state,reimbursement_doc_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.company_id, row.employee_ref, row.partner_id, row.amount, row.description, row.state, null, row.created_at);
  recordWrite(db, runtime, companyId, 'hr_v2_expense_claim', row.id, 'created', userId, null, row, 'hr');
  return row;
}
// Approve + post a reimbursement supplier bill against the employee's payable
// partner (R2.6). Posts a real balanced GL doc; never touches payroll.
function approveExpenseClaim(db, companyId, claimId, userId, runtime) {
  ensureCompany(db, companyId);
  const claim = db.prepare('SELECT * FROM hr_v2_expense_claim WHERE id=? AND company_id=?').get(claimId, companyId);
  if (!claim) throw fail('expense claim is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (claim.state !== 'draft') throw fail('expense claim is not draft', 409);
  if (!claim.partner_id) throw fail('a reimbursement partner is required to post the JE', 409, 'EXPENSE_PARTNER_REQUIRED');
  const bill = arap.createArapDocument(db, companyId, { document_kind: 'supplier_bill', partner_id: claim.partner_id, currency: 'IQD', lines: [{ quantity: 1, price_unit: claim.amount, description: `Reimbursement: ${claim.description}` }] }, userId);
  const posted = arap.postArapDocument(db, bill.id, userId || 'system');
  db.prepare("UPDATE hr_v2_expense_claim SET state='reimbursed', reimbursement_doc_id=? WHERE id=?").run(bill.id, claimId);
  recordWrite(db, runtime, companyId, 'hr_v2_expense_claim', claimId, 'reimbursed', userId, claim, { ...claim, state: 'reimbursed', reimbursement_doc_id: bill.id }, null);
  return { id: claimId, state: 'reimbursed', reimbursement_doc_id: bill.id, posted };
}

// ---- Dated HR-field versioning (VNext HR fields only) ----
function recordEmployeeVersion(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  // Only VNext HR fields — never a frozen master write.
  const targetTable = input.target_table || 'hr_v2_employee_version';
  assertNotFrozen(targetTable === 'hr_v2_employee_version' ? 'hr_v2_employee_version' : targetTable);
  const row = { id: id('empver'), company_id: companyId, employee_ref: String(input.employee_ref), effective_date: String(input.effective_date), fields_json: JSON.stringify(input.fields || {}), created_by: userId || null, created_at: now() };
  db.prepare('INSERT INTO hr_v2_employee_version(id,company_id,employee_ref,effective_date,fields_json,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(row.id, row.company_id, row.employee_ref, row.effective_date, row.fields_json, row.created_by, row.created_at);
  return { ...row, fields: input.fields || {} };
}
function employeeAsOf(db, companyId, employeeRef, asOfDate) {
  const row = db.prepare('SELECT fields_json, effective_date FROM hr_v2_employee_version WHERE company_id=? AND employee_ref=? AND effective_date<=? ORDER BY effective_date DESC LIMIT 1').get(companyId, employeeRef, String(asOfDate));
  return row ? { effective_date: row.effective_date, fields: JSON.parse(row.fields_json) } : null;
}

module.exports = {
  assertNotFrozen,
  createLeaveType: infra.atomicCommand(createLeaveType),
  accrueLeave: infra.atomicCommand(accrueLeave),
  requestLeave: infra.atomicCommand(requestLeave),
  approveLeave: infra.atomicCommand(approveLeave),
  createJob: infra.atomicCommand(createJob),
  applyCandidate: infra.atomicCommand(applyCandidate),
  advanceApplication: infra.atomicCommand(advanceApplication),
  refuseApplication: infra.atomicCommand(refuseApplication),
  createExpenseClaim: infra.atomicCommand(createExpenseClaim),
  approveExpenseClaim: infra.atomicCommand(approveExpenseClaim),
  recordEmployeeVersion: infra.atomicCommand(recordEmployeeVersion),
  employeeAsOf,
};
