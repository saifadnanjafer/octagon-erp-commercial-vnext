/**
 * OCTAGON ERP — SERVER-SIDE JARVIS TOOL EXECUTORS
 * (Server-Side Mutation Sprint 2026-07-05)
 *
 * This is where the REAL mutation now happens. Before this file, even after the
 * security-hardening sprint, an approved Jarvis write tool still executed its
 * mutation in CLIENT JS (browser wrote to `omni`/`finance`, then pushed the whole
 * state via POST /api/db). Now the mutation runs HERE, on the server, against the
 * source-of-truth DB (SQLite when active, else database.json) through the same
 * loadDbForMutation()/saveDb() path the rest of server.js uses.
 *
 * The server ALWAYS generates: ids, timestamps, status. It NEVER trusts client
 * ids / timestamps / risk / user / status fields (they are dropped).
 *
 * Scope (honest — see OMNI_JARVIS_SERVER_SIDE_MUTATIONS_REPORT.md §3/§9):
 *   FULLY server-side (real mutation):
 *     create_task, create_customer, add_customer_debt, record_customer_payment,
 *     create_purchase_expense, create_sales_receipt, modify_material, modify_employee
 *   QUARANTINED (validated + recorded, NOT posted to the ledger):
 *     create_journal_entry  -> appended to omni.aiPendingJournalEntries with
 *       state 'awaiting_finance_engine'. The double-entry engine (FinanceService:
 *       hash chain + per-journal sequence in account_moves) is intentionally NOT
 *       re-implemented here — a wrong hash would corrupt ledger integrity checks.
 *   REFUSED (never executes anywhere):
 *     execute_js_mutation -> server refuses (no server-side eval; RCE risk).
 *
 * Data locations in the DB (top-level, matching the client saveData payload):
 *   db.finance.customers[], db.finance.transactions[]   (finance tools)
 *   db.omni.taskManager.spaces[].departments[].sections[].taskTypes[].tasks[]
 *   db.omni.materials[]                                  (modify_material)
 *   db.employees[]                                       (modify_employee)
 */
'use strict';

let H = null; // { loadDbForMutation, saveDb, makeId }
function init(helpers) { H = helpers; }

// ── tiny utils ───────────────────────────────────────────────────────────────
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function str(v) { return (v == null) ? '' : String(v); }
function trimmed(v) { return str(v).trim(); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }
function mkid(prefix) { return (H && typeof H.makeId === 'function') ? H.makeId(prefix) : (prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); }

function ensureFinance(db) {
  if (!db.finance || typeof db.finance !== 'object') db.finance = {};
  if (!Array.isArray(db.finance.customers)) db.finance.customers = [];
  if (!Array.isArray(db.finance.transactions)) db.finance.transactions = [];
  return db.finance;
}
function ensureOmni(db) {
  if (!db.omni || typeof db.omni !== 'object') db.omni = {};
  return db.omni;
}
// best-effort default company: newest transaction's companyId (single-workshop
// default), else ''. Mirrors the client fallback getActiveOrgProfile()?.companyId||''.
function defaultCompanyId(db) {
  try {
    const tx = db.finance && db.finance.transactions;
    if (Array.isArray(tx) && tx.length) {
      for (let i = tx.length - 1; i >= 0; i--) { if (tx[i] && tx[i].companyId) return tx[i].companyId; }
    }
  } catch (_) {}
  return '';
}
function findCustomer(finance, name) {
  const n = trimmed(name).toLowerCase();
  return finance.customers.find(c => c && trimmed(c.name).toLowerCase() === n) || null;
}

// ── result helper ────────────────────────────────────────────────────────────
function ok(message, result) { return { ok: true, status: 'executed', message: message || '', result: result || {} }; }
function fail(message) { return { ok: false, status: 'failed', message: message || 'failed', result: {} }; }
function denied(message) { return { ok: false, status: 'denied', message: message || 'denied', result: {} }; }

// ══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTORS  — each: run(db, args, ctx) -> result; server owns ids/timestamps
// ══════════════════════════════════════════════════════════════════════════════
const TOOLS = {

  create_customer: {
    write: true,
    run(db, args) {
      const name = trimmed(args.customer_name || args.name);
      if (!name) return fail('Customer name is required.');
      const finance = ensureFinance(db);
      if (findCustomer(finance, name)) return fail('Customer "' + name + '" already exists.');
      const customer = { id: mkid('cust'), name, phone: str(args.phone), openingBalance: 0, notes: 'Created by Omni (server)' };
      finance.customers.push(customer);
      return ok('تم إنشاء العميل "' + name + '".', { customerId: customer.id, name });
    }
  },

  create_task: {
    write: true,
    run(db, args) {
      const title = trimmed(args.title || args.name || args.task);
      if (!title) return fail('Task title is required.');
      const omni = ensureOmni(db);
      if (!omni.taskManager || typeof omni.taskManager !== 'object') omni.taskManager = { selectedSpaceId: '', spaces: [] };
      const tm = omni.taskManager;
      if (!Array.isArray(tm.spaces)) tm.spaces = [];
      let space = tm.spaces.find(s => s && s.id === tm.selectedSpaceId) || tm.spaces[0];
      if (!space) { space = { id: mkid('space'), name: 'General', departments: [] }; tm.spaces.push(space); tm.selectedSpaceId = space.id; }
      if (!Array.isArray(space.departments)) space.departments = [];
      if (!space.departments.length) space.departments.push({ id: mkid('dep'), name: trimmed(args.department) || 'عام', sections: [] });
      const dep = space.departments[0];
      if (!Array.isArray(dep.sections)) dep.sections = [];
      if (!dep.sections.length) dep.sections.push({ id: mkid('sec'), name: 'قائمة عامة', taskTypes: [] });
      const sec = dep.sections[0];
      if (!Array.isArray(sec.taskTypes)) sec.taskTypes = [];
      if (!sec.taskTypes.length) sec.taskTypes.push({ id: mkid('type'), name: 'عام', tasks: [] });
      const tt = sec.taskTypes[0];
      if (!Array.isArray(tt.tasks)) tt.tasks = [];
      const task = {
        id: mkid('task'), title, status: 'todo',
        priority: ['low', 'normal', 'high', 'urgent'].includes(str(args.priority).toLowerCase()) ? str(args.priority).toLowerCase() : 'normal',
        department: dep.name, section: sec.name, category: tt.name,
        activityLog: [{ date: nowISO(), text: 'تم إنشاء المهمة (Omni server)' }]
      };
      if (args.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(str(args.dueDate))) task.dueDate = str(args.dueDate);
      if (args.assignee) { task.assignee = trimmed(args.assignee); task.assignedTo = trimmed(args.assignee); }
      tt.tasks.push(task);
      return ok('أنشأت مهمة: ' + title, { taskId: task.id, title });
    }
  },

  // ── finance transaction tools (faithful port of the client tx objects) ──────
  add_customer_debt: {
    write: true,
    run(db, args) {
      const name = trimmed(args.customer_name);
      const amount = num(args.amount);
      const type = str(args.type);
      if (!name) return fail('Customer name is required.');
      if (amount <= 0) return fail('Amount must be greater than zero.');
      if (!['charge', 'payment'].includes(type)) return fail('Type must be charge or payment.');
      const finance = ensureFinance(db);
      let customer = findCustomer(finance, name); let isNew = false;
      if (!customer) { customer = { id: mkid('cust'), name, phone: '', openingBalance: 0, notes: 'Created by Omni (server)' }; finance.customers.push(customer); isNew = true; }
      const companyId = defaultCompanyId(db);
      const tx = {
        id: mkid('tx'), date: /^\d{4}-\d{2}-\d{2}$/.test(str(args.date)) ? str(args.date) : todayISO(), createdAt: nowISO(),
        type: type === 'charge' ? 'customer_charge' : 'income', direction: type === 'charge' ? 'neutral' : 'in',
        sourceType: 'cashbox', amount,
        categoryId: type === 'charge' ? '' : 'income_sales', departmentId: 'dept_workshop',
        accountId: type === 'charge' ? 'receivables_customers' : 'cash_workshop',
        description: trimmed(args.description) || (type === 'charge' ? 'دين مسجل بواسطة أومني (server)' : 'دفعة مسجلة بواسطة أومني (server)'),
        partyName: name, paidByName: type === 'charge' ? '' : name, customerId: customer.id,
        receiptNo: '', sourceId: '', paymentMethod: 'cash', companyId
      };
      finance.transactions.push(tx);
      const verb = type === 'charge' ? 'دين على' : 'سداد من';
      return ok('تم تسجيل ' + verb + ' العميل "' + name + '" بقيمة ' + amount + ' د.ع.' + (isNew ? ' (عميل جديد)' : ''), { txId: tx.id, customerId: customer.id, isNew });
    }
  },

  record_customer_payment: {
    write: true,
    run(db, args) {
      const name = trimmed(args.customer_name);
      const amount = num(args.amount);
      if (!name) return fail('Customer name is required.');
      if (amount <= 0) return fail('Payment must be greater than zero.');
      const finance = ensureFinance(db);
      const customer = findCustomer(finance, name);
      if (!customer) return fail('No customer named "' + name + '".');
      const tx = {
        id: mkid('tx'), date: /^\d{4}-\d{2}-\d{2}$/.test(str(args.date)) ? str(args.date) : todayISO(), createdAt: nowISO(),
        type: 'income', direction: 'in', sourceType: 'cashbox', amount,
        categoryId: 'income_sales', departmentId: 'dept_workshop', accountId: 'cash_workshop',
        description: trimmed(args.description) || 'دفعة من عميل بواسطة أومني (server)',
        partyName: name, paidByName: name, customerId: customer.id, paymentMethod: 'cash', companyId: defaultCompanyId(db)
      };
      finance.transactions.push(tx);
      return ok('تم تسجيل دفعة ' + amount + ' د.ع من العميل "' + name + '".', { txId: tx.id, customerId: customer.id });
    }
  },

  create_purchase_expense: {
    write: true,
    run(db, args) {
      const amount = num(args.amount);
      const desc = trimmed(args.description);
      if (amount <= 0) return fail('Expense must be greater than zero.');
      if (!desc) return fail('Expense description is required.');
      const finance = ensureFinance(db);
      const isMaterials = /material|مواد|قطع|غيار/i.test(str(args.category) + ' ' + desc);
      const tx = {
        id: mkid('tx'), date: /^\d{4}-\d{2}-\d{2}$/.test(str(args.date)) ? str(args.date) : todayISO(), createdAt: nowISO(),
        type: 'expense', direction: 'out', sourceType: 'cashbox', amount,
        categoryId: isMaterials ? 'expense_materials' : 'expense_general', departmentId: 'dept_workshop', accountId: 'cash_workshop',
        description: desc, partyName: trimmed(args.supplier_name), paymentMethod: 'cash', companyId: defaultCompanyId(db)
      };
      finance.transactions.push(tx);
      return ok('تم تسجيل مصروف ' + amount + ' د.ع — ' + desc + '.', { txId: tx.id });
    }
  },

  create_sales_receipt: {
    write: true,
    run(db, args) {
      const name = trimmed(args.customer_name);
      const amount = num(args.amount);
      if (!name) return fail('Customer name is required.');
      if (amount <= 0) return fail('Receipt amount must be greater than zero.');
      const paid = args.paid === true || /^(true|cash|paid|نقد|نقدا|نقداً|مدفوع)$/i.test(str(args.paid));
      const finance = ensureFinance(db);
      let customer = findCustomer(finance, name); let isNew = false;
      if (!customer) { customer = { id: mkid('cust'), name, phone: '', openingBalance: 0, notes: 'Created by Omni (server)' }; finance.customers.push(customer); isNew = true; }
      const receiptNo = 'SR-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
      const base = {
        date: /^\d{4}-\d{2}-\d{2}$/.test(str(args.date)) ? str(args.date) : todayISO(), createdAt: nowISO(), amount,
        customerId: customer.id, partyName: name, categoryId: 'income_sales', departmentId: 'dept_workshop',
        receiptNo, sourceType: 'sales_receipt', sourceId: receiptNo,
        description: trimmed(args.description) || 'وصل مبيعات بواسطة أومني (server)',
        paymentMethod: paid ? 'cash' : '', companyId: defaultCompanyId(db)
      };
      const tx = paid
        ? Object.assign({ id: mkid('tx'), type: 'income', direction: 'in', accountId: 'cash_workshop', paidByName: name }, base)
        : Object.assign({ id: mkid('tx'), type: 'customer_charge', direction: 'neutral', accountId: 'receivables_customers' }, base);
      finance.transactions.push(tx);
      const mode = paid ? 'نقداً' : 'آجل';
      return ok('تم إنشاء وصل مبيعات ' + receiptNo + ' للعميل "' + name + '" بقيمة ' + amount + ' د.ع (' + mode + ')' + (isNew ? ' (عميل جديد)' : '') + '.', { txId: tx.id, receiptNo, customerId: customer.id, isNew });
    }
  },

  // ── field patches ───────────────────────────────────────────────────────────
  modify_material: {
    write: true,
    run(db, args) {
      const name = trimmed(args.material_name);
      if (!name) return fail('Material name is required.');
      const omni = ensureOmni(db);
      if (!Array.isArray(omni.materials)) return fail('Inventory is not available.');
      const mat = omni.materials.find(m => m && trimmed(m.name).toLowerCase() === name.toLowerCase());
      if (!mat) return fail('Could not find material named "' + name + '".');
      const updates = [];
      if (args.cost !== undefined) { mat.cost = num(args.cost); updates.push('الكلفة: ' + mat.cost); }
      if (args.stock !== undefined) { mat.stock = num(args.stock); updates.push('المخزون: ' + mat.stock); }
      if (args.minimum !== undefined) { mat.minimum = num(args.minimum); updates.push('الحد الأدنى: ' + mat.minimum); }
      if (args.category !== undefined) { mat.category = str(args.category); updates.push('التصنيف: ' + mat.category); }
      if (args.unit !== undefined) { mat.unit = str(args.unit); updates.push('الوحدة: ' + mat.unit); }
      if (!updates.length) return ok('لم يتم تحديد أي تعديلات.', { materialId: mat.id, changed: 0 });
      mat.updated_at = nowISO(); mat.updated_by = 'omni_server';
      return ok('تم تعديل المادة "' + mat.name + '": ' + updates.join('، '), { materialId: mat.id, changed: updates.length });
    }
  },

  modify_employee: {
    write: true,
    run(db, args) {
      const name = trimmed(args.employee_name);
      if (!name) return fail('Employee name is required.');
      if (!Array.isArray(db.employees)) return fail('Employee registry is not available.');
      const n = name.toLowerCase();
      const emp = db.employees.find(e => {
        if (!e) return false;
        if (trimmed(e.name).toLowerCase() === n) return true;
        if (Array.isArray(e.aliases) && e.aliases.some(a => trimmed(a).toLowerCase() === n)) return true;
        return trimmed(e.name).toLowerCase().includes(n) && n.length >= 3;
      });
      if (!emp) return fail('Could not find employee named "' + name + '".');
      // WHITELIST only — never blind-merge client args onto an employee/payroll record.
      const updates = [];
      if (args.salary !== undefined) { emp.salary = num(args.salary); updates.push('الراتب الأساسي: ' + emp.salary); }
      if (args.role !== undefined) { emp.role = str(args.role); updates.push('الدور: ' + emp.role); }
      if (args.phone !== undefined) { emp.phone = str(args.phone); updates.push('الهاتف: ' + emp.phone); }
      if (args.status !== undefined) { emp.status = str(args.status); updates.push('الحالة: ' + emp.status); }
      if (!updates.length) return ok('لم يتم تحديد أي تعديلات.', { employeeId: emp.id, changed: 0 });
      emp.updated_at = nowISO(); emp.updated_by = 'omni_server';
      return ok('تم تعديل الموظف "' + emp.name + '": ' + updates.join('، '), { employeeId: emp.id, changed: updates.length });
    }
  },

  // ── QUARANTINED: validated + recorded, but NOT posted to the ledger ──────────
  create_journal_entry: {
    write: true,
    run(db, args) {
      const memo = trimmed(args.memo);
      const lines = args.lines;
      if (!memo) return fail('Entry memo is required.');
      if (!Array.isArray(lines) || lines.length < 2) return fail('At least two lines are required for double-entry.');
      let totalDebit = 0, totalCredit = 0;
      const normLines = lines.map(l => {
        const debit = num(l && l.debit), credit = num(l && l.credit);
        totalDebit += debit; totalCredit += credit;
        return { account_id: str(l && l.account_id), debit, credit, label: trimmed(l && l.label) || memo };
      });
      if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
        return fail('القيد غير متوازن: مدين ' + totalDebit + ' ≠ دائن ' + totalCredit + '.');
      }
      const omni = ensureOmni(db);
      if (!Array.isArray(omni.aiPendingJournalEntries)) omni.aiPendingJournalEntries = [];
      const entry = {
        id: mkid('aije'), date: /^\d{4}-\d{2}-\d{2}$/.test(str(args.date)) ? str(args.date) : todayISO(),
        memo, line_ids: normLines, amount_total: totalDebit,
        state: 'awaiting_finance_engine', origin: 'jarvis_server', createdAt: nowISO()
      };
      omni.aiPendingJournalEntries.push(entry);
      // Deliberately NOT posted to account_moves — see file header. The real ledger
      // posting (hash chain + sequence) must go through FinanceService.
      return {
        ok: true, status: 'executed',
        message: 'تم تسجيل القيد "' + memo + '" (متوازن ' + totalDebit + ') في طابور محرّك المحاسبة — لم يُرحَّل بعد إلى دفتر الأستاذ.',
        result: { pendingEntryId: entry.id, posted: false, state: entry.state }
      };
    }
  },

  // ── REFUSED: never executes anywhere ────────────────────────────────────────
  execute_js_mutation: {
    write: true,
    run() {
      return denied('تنفيذ كود JS التعسّفي معطّل بالكامل على الخادم (خطر تنفيذ عن بُعد). لا يُنفَّذ إطلاقاً.');
    }
  }
};

// ── public API ────────────────────────────────────────────────────────────────
function getServerJarvisTool(name) { return TOOLS[name] || null; }
function listServerJarvisTools() { return Object.keys(TOOLS); }

/**
 * executeServerJarvisTool(toolName, args, context)
 *  -> { ok, status: 'executed'|'failed'|'denied', message, result }
 * Loads the DB, runs the tool, persists via saveDb (SQLite+JSON), returns a clean
 * result. Never throws to the caller — errors become { ok:false, status:'failed' }.
 */
function executeServerJarvisTool(toolName, args, context) {
  const tool = TOOLS[toolName];
  if (!tool) return { ok: false, status: 'failed', message: 'Unknown server tool: ' + toolName, result: {} };
  if (!H || typeof H.loadDbForMutation !== 'function' || typeof H.saveDb !== 'function') {
    return { ok: false, status: 'failed', message: 'Server tools not initialized', result: {} };
  }
  let db;
  try { db = H.loadDbForMutation(); }
  catch (e) { return { ok: false, status: 'failed', message: 'DB load failed: ' + (e && e.message || e), result: {} }; }
  let res;
  try { res = tool.run(db, args || {}, context || {}); }
  catch (e) { return { ok: false, status: 'failed', message: 'Executor error: ' + (e && e.message || e), result: {} }; }
  if (!res || res.ok !== true) return res || { ok: false, status: 'failed', message: 'no result', result: {} };
  // persist only on success
  try { H.saveDb(db); }
  catch (e) { return { ok: false, status: 'failed', message: 'DB save failed: ' + (e && e.message || e), result: {} }; }
  return res;
}

module.exports = { init, getServerJarvisTool, listServerJarvisTools, executeServerJarvisTool };
