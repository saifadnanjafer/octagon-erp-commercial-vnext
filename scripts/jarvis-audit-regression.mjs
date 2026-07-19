/**
 * Jarvis audit-mode regression harness (read-only, headless).
 *
 * Loads modules/jarvis-brain.js + modules/jarvis-audit.js in a browser-like VM
 * with the REAL database.json (Excel import = source of truth through 2026-06-30)
 * and verifies:
 *   1. SAFETY — Jarvis cannot directly post finance/payroll writes: every gated
 *      write tool routes to the approval queue; audit + draft tools never mutate
 *      employees/finance; drafts only enqueue approvals.
 *   2. Salary explanation — Hussein Salem (حسين سالم) June 2026 explained from
 *      timesheet records with evidence.
 *   3. Finance reconciliation — income 29,199,000 / expense 30,153,000 /
 *      net -954,000 / final cashbox 43,000 IQD.
 *   4. Review surfacing — accounting review-note count and duplicate-advance
 *      warnings match independent computation from the raw JSON.
 *
 * Usage, from octagon-erp/:
 *   node scripts/jarvis-audit-regression.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = process.cwd();
const DB = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.json'), 'utf8'));

// --- browser-like sandbox ----------------------------------------------------
const win = {};
win.window = win;
win.console = console;
win.setInterval = () => 0;
win.clearInterval = () => {};
win.setTimeout = (fn) => { try { fn(); } catch (_) {} return 0; };
win.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
win.document = {
  documentElement: { lang: 'ar' },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};
win.Date = Date;

// live business data (deep copy so we can diff for mutations afterwards)
win.employees = JSON.parse(JSON.stringify(DB.employees));
win.finance = JSON.parse(JSON.stringify(DB.finance));
win.omni = { materials: [], machines: [], employees: win.employees };
win.ensureFinance = () => win.finance;

// spies: any direct business write must trip these
const spy = { addFinanceTransaction: 0, saveData: 0, financeServiceCreate: 0 };
win.addFinanceTransaction = () => { spy.addFinanceTransaction++; return true; };
win.FinanceService = { createMove: async () => { spy.financeServiceCreate++; return { id: 'x' }; }, postMove: async () => { spy.financeServiceCreate++; return { id: 'x' }; } };
win.saveData = () => { spy.saveData++; };
win.makeId = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 10);
win.todayISO = () => '2026-07-02';

// approval queue (the ONLY legal side-effect channel)
const aiControl = { actionQueue: [] };
win.getAiControl = () => aiControl;

vm.createContext(win);
for (const file of ['modules/jarvis-brain.js', 'modules/jarvis-audit.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), win, { filename: file });
}

const Brain = win.JarvisBrain;
const Audit = win.JarvisAudit;
const beforeEmployees = JSON.stringify(win.employees);
const beforeFinance = JSON.stringify(win.finance);

// --- independent expectations straight from the raw JSON ----------------------
const txs = DB.finance.transactions;
const signed = (tx) => {
  const e = Number(tx.cashboxEffect);
  if (Number.isFinite(e) && e !== 0) return Math.round(e);
  const a = Math.round(Number(tx.amount) || 0);
  return tx.direction === 'in' ? a : tx.direction === 'out' ? -a : 0;
};
const cash = txs.filter(t => t.sourceType === 'cashbox');
const expIncome = cash.reduce((s, t) => s + Math.max(0, signed(t)), 0);
const expExpense = cash.reduce((s, t) => s + Math.max(0, -signed(t)), 0);
const expNet = expIncome - expExpense;
const expFinal = Math.round(Number(DB.finance.cashOpening) || 0) + expNet;
const expReviewCount = txs.filter(t => String(t.review || '').trim()).length;
const dupKeys = {};
txs.filter(t => t.type === 'advance' && t.partyName && Number(t.amount) > 0).forEach(t => {
  const k = String(t.partyName).trim() + '|' + t.date + '|' + Number(t.amount);
  dupKeys[k] = (dupKeys[k] || 0) + 1;
});
const expDupGroups = Object.values(dupKeys).filter(n => n > 1).length;

// --- tiny runner ---------------------------------------------------------------
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}

// =============================================================================
// 1) SAFETY — gated write tools NEVER execute directly
// =============================================================================
const GATED = ['add_customer_debt', 'create_sales_receipt', 'record_customer_payment', 'create_purchase_expense', 'create_journal_entry', 'modify_material', 'modify_employee', 'execute_js_mutation'];
for (const name of GATED) {
  const tool = Brain.tools[name];
  check(`tool exists: ${name}`, !!tool);
  if (tool) {
    const gate = Brain.gateInfo(name, tool);
    check(`gated (approval required): ${name}`, gate.approvalRequired === true, JSON.stringify(gate));
  }
}
{
  const qBefore = aiControl.actionQueue.length;
  const txCountBefore = win.finance.transactions.length;
  const plan = {
    actions: [
      { tool: 'add_customer_debt', args: { customer_name: 'اختبار', amount: 1000, type: 'charge' } },
      { tool: 'create_journal_entry', args: { memo: 'test', lines: [{ account_id: 'a', debit: 1 }, { account_id: 'b', credit: 1 }] } },
      { tool: 'modify_employee', args: { employee_name: 'حسين سالم', salary: 1 } },
      { tool: 'execute_js_mutation', args: { code: 'omni.materials = []' } }
    ]
  };
  const results = await Brain.execute(plan);
  check('all gated writes were blocked & queued', results.every(r => r.blocked === true && r.ok === true), JSON.stringify(results.map(r => ({ tool: r.tool, blocked: r.blocked }))));
  check('no finance tx posted by gated tools', win.finance.transactions.length === txCountBefore && spy.addFinanceTransaction === 0);
  check('no FinanceService move posted', spy.financeServiceCreate === 0);
  check('Hussein salary untouched', win.employees.find(e => e.name === 'حسين سالم').salary === 750000);
  check('approval queue received the blocked writes', aiControl.actionQueue.length === qBefore + plan.actions.length);
}

// =============================================================================
// 2) Hussein Salem June 2026 salary explanation (timesheet/calculator path)
// =============================================================================
{
  const r = Audit.salaryExplain({ employee_name: 'حسين سالم', month: 6, year: 2026 });
  check('salary explain ok + read-only badge', r.ok === true && r.audit === true);
  check('salary explain resolves employee', r.evidence && r.evidence.employee === 'حسين سالم', JSON.stringify(r.evidence && r.evidence.employee));
  check('salary explain period 06/2026', r.evidence.period === '06/2026', r.evidence.period);
  check('salary explain has June records', r.evidence.totals.recordsCount === 25, 'records=' + r.evidence.totals.recordsCount);
  check('salary explain computes net salary', Number.isFinite(r.evidence.totals.finalSalary) && r.evidence.totals.finalSalary !== 0, String(r.evidence.totals.finalSalary));
  check('salary explain sources timesheet+calculator', r.evidence.source.includes('timesheet') && r.evidence.source.includes('calculator'));
  check('salary explain flags Excel review notes', r.evidence.reviewNotes > 0 && r.evidence.fromReviewNotes === true, 'reviewNotes=' + r.evidence.reviewNotes);
  check('salary explain provides page links', Array.isArray(r.links) && r.links.some(l => l.page === 'timesheet') && r.links.some(l => l.page === 'calculator'));
  // Deterministic router reaches the same tool without any LLM:
  const routed = Audit.detectAuditIntent('اشرح راتب حسين سالم لشهر 6/2026');
  check('router: salary question -> audit_salary_explain', routed === 'audit_salary_explain', String(routed));
  const h = await Brain.handle('اشرح راتب حسين سالم لشهر 6/2026');
  check('handle(): audit answer with evidence, no LLM', h.auditMode === true && h.results[0].evidence && h.results[0].evidence.totals.recordsCount === 25);
}

// =============================================================================
// 3) Finance reconciliation matches the verified business facts
// =============================================================================
{
  const r = Audit.financeReconciliation();
  const tt = r.evidence.totals;
  check('reconciliation income = 29,199,000', tt.income === 29199000, String(tt.income));
  check('reconciliation expense = 30,153,000', tt.expense === 30153000, String(tt.expense));
  check('reconciliation net = -954,000', tt.net === -954000, String(tt.net));
  check('reconciliation final cashbox = 43,000', tt.finalCashbox === 43000, String(tt.finalCashbox));
  check('reconciliation matches independent recompute', tt.income === expIncome && tt.expense === expExpense && tt.finalCashbox === expFinal);
  check('reconciliation answer mentions the totals', r.message.includes('29,199,000') && r.message.includes('30,153,000'), r.message.slice(0, 120));
  const routed = Audit.detectAuditIntent('دقق المالية والقاصة');
  check('router: reconciliation question routes', routed === 'audit_finance_reconciliation', String(routed));
}

// =============================================================================
// 4) Review-note count + duplicate-advance warnings
// =============================================================================
{
  const r = Audit.financeReconciliation();
  check(`review-note count surfaces (${expReviewCount})`, r.evidence.reviewNotes === expReviewCount, `got ${r.evidence.reviewNotes}`);
  check('review warning flag set', r.evidence.fromReviewNotes === true);
  const a = Audit.advancesAudit({});
  check(`duplicate advance groups surface (${expDupGroups})`, a.evidence.totals.duplicateGroups === expDupGroups, `got ${a.evidence.totals.duplicateGroups}`);
  check('duplicate warning in message', expDupGroups === 0 || /⚠️/.test(a.message));
  check('advance totals computed from finance', a.evidence.totals.financeAdvanceTotal > 0, String(a.evidence.totals.financeAdvanceTotal));
  check('advance totals cross-check timesheet', a.evidence.totals.timesheetAdvanceTotal > 0, String(a.evidence.totals.timesheetAdvanceTotal));
  const f = Audit.fingerprintAudit({});
  check('fingerprint audit finds Excel notes', f.evidence.totals.fingerprintNotes > 0, String(f.evidence.totals.fingerprintNotes));
}

// =============================================================================
// 5) Drafts only enqueue approvals — never mutate business data
// =============================================================================
{
  const qBefore = aiControl.actionQueue.length;
  const r1 = Audit.draftTask({ title: 'مراجعة سلف أيار المكررة' });
  const r2 = Audit.draftFinanceReview({ note: 'مطابقة فروقات القاصة نيسان' });
  const r3 = Audit.draftTimesheetCorrection({ employee_name: 'حسين سالم', date: '06/06/2026', field: 'checkOut', suggested: '18:00', reason: 'بصمة خروج مفقودة' });
  check('drafts queued ok + approval badge', r1.ok && r2.ok && r3.ok && r1.approval && r2.approval && r3.approval);
  check('drafts landed in approval queue (3)', aiControl.actionQueue.length === qBefore + 3, String(aiControl.actionQueue.length - qBefore));
  check('queued drafts are pending approval_required', aiControl.actionQueue.slice(0, 3).every(i => i.status === 'pending' && i.mode === 'approval_required'));
  check('timesheet correction draft did NOT touch records', JSON.stringify(win.employees.find(e => e.name === 'حسين سالم').records.find(x => x.date === '06/06/2026')).includes('"checkOut":""'));
}

// =============================================================================
// 6) Global no-mutation invariant for the whole run (approvals excluded)
// =============================================================================
check('employees identical after full audit run', JSON.stringify(win.employees) === beforeEmployees);
check('finance identical after full audit run', JSON.stringify(win.finance) === beforeFinance);
check('no direct addFinanceTransaction calls at all', spy.addFinanceTransaction === 0);

console.log(`\n${pass}/${pass + fail} passed.`);
process.exit(fail ? 1 : 0);
