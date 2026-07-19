/**
 * OCTAGON ERP — Workshop Ledger & Official Migration (محاسبة ودوام الورشة).
 *
 * Turns the official workbook (قاعدة_موحدة.xlsx) into REAL, linked ERP records:
 * one unified financial table (transactions) that drives the cashbox, with
 * advances / food shares / attendance / Hussein differences all LINKED back to
 * the same master movement — never double-counted.
 *
 * ADD-ONLY. All data lives under omni.wsLedger and persists with the normal
 * /api/db snapshot (same nested-object pattern as omni.appointments). This
 * module does NOT touch the legacy timesheet / finance v6 / employees.
 *
 * The workbook is already normalized (Saif→two cashbox entries, no "راتب",
 * food redistributed on attendees, 22/03 = travel cost). We import it; we do not
 * re-clean it. The validator re-asserts every rule.
 *
 * Reconciliation targets (cashbox approved balance, Hussein net, …) come from the
 * dataset's own `reconciliation` block and are persisted to wsLedger.reconciliation
 * on import — never hardcoded. Literals here go stale silently when the workbook is
 * updated and then misreport approved financial figures.
 */
(function () {
  'use strict';

  /* ───────── state ───────── */
  let activeView = 'import';   // import|transactions|cashbox|advances|timesheet|payroll|hussein|tests|audit
  let tsEmployee = 'all';
  let tsMonth = 'all';
  let txFilter = { q: '', dir: 'all', type: 'all', party: 'all' };
  let advEmployee = 'all';
  let previewCache = null;     // loaded migration dataset awaiting confirm
  let selectedPayrollYear = 2026;
  let selectedPayrollMonth = 5;
  let payrollPreviewCache = null;

  /* ───────── helpers ───────── */
  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni || typeof window.omni !== 'object') window.omni = {};
    return window.omni;
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function save() { if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} } }
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); } catch (_) {} } }
  function uid(p) { return (p || 'ws') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowISO() { return new Date().toISOString(); }
  function currentUserName() {
    try { return window.PentagonAuth?.getCurrentUser?.()?.name || window.PentagonAuth?.currentUser?.name || 'مستخدم النظام'; } catch (_) { return 'مستخدم النظام'; }
  }
  function fmt(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString('en-US');
  }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  /* ───────── name normalization (workbook is already unified; this is a safety net) ───────── */
  const NAME_ALIASES = {
    'حيدر محمد': 'حيدر محمد الحداد',
    'حيدر الحداد': 'حيدر محمد الحداد',
    'خضر عبد الخالق': 'خضر عبدالخالق',
    'حيدر مضر': 'حيدر المحاسب',
    'يافوز': 'حيدر يافوز',
    'عبد الله': 'عبود',
    'علي': 'علي الباكستاني',
    'سيف': 'سيف عدنان'
  };
  function normName(raw) {
    let s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (NAME_ALIASES[s]) return NAME_ALIASES[s];
    return s;
  }
  // The 6 employees with real cash advances + the full roster come from the sheet.
  const OFFICIAL_EMPLOYEES = ['حيدر محمد الحداد', 'حيدر يافوز', 'عبود', 'حسين سالم', 'خضر عبدالخالق', 'علي الباكستاني'];
  const SUPPLIERS = { 'الابرار': 'شركة الأبرار', 'الأبرار': 'شركة الأبرار', 'الخورة': 'شركة الخورة' };

  /* ───────── chart of accounts ───────── */
  const CHART = [
    // assets
    { code: 'AST-CASH', name: 'القاصة الرئيسية', type: 'asset', group: 'الأصول' },
    { code: 'AST-HUS', name: 'عهد/فروقات حسين', type: 'asset', group: 'الأصول' },
    // owner
    { code: 'OWN-SAIF', name: 'وارد من سيف إلى القاصة', type: 'owner', group: 'المالك' },
    // employee advances
    { code: 'EMP-HMH', name: 'سلف — حيدر محمد الحداد', type: 'employee', group: 'سلف الموظفين' },
    { code: 'EMP-HY', name: 'سلف — حيدر يافوز', type: 'employee', group: 'سلف الموظفين' },
    { code: 'EMP-ABD', name: 'سلف — عبود', type: 'employee', group: 'سلف الموظفين' },
    { code: 'EMP-HS', name: 'سلف — حسين سالم', type: 'employee', group: 'سلف الموظفين' },
    { code: 'EMP-KH', name: 'سلف — خضر عبدالخالق', type: 'employee', group: 'سلف الموظفين' },
    { code: 'EMP-ALI', name: 'سلف — علي الباكستاني', type: 'employee', group: 'سلف الموظفين' },
    { code: 'EMP-GEN', name: 'سلف الموظفين — عام', type: 'employee', group: 'سلف الموظفين' },
    // expenses
    { code: 'EXP-FOOD', name: 'وجبة طعام', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-FUEL', name: 'بنزين', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-TRANS', name: 'كراوي / نقليات', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-MAT', name: 'مواد', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-ELEC', name: 'كهرباء', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-WATER', name: 'ماء', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-CREDIT', name: 'رصيد', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-MAINT', name: 'صيانة', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-TRAVEL', name: 'تكاليف سفر / تفاصيل عمل', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-GEN', name: 'مصاريف عامة', type: 'expense', group: 'المصاريف' },
    { code: 'EXP-DIFF', name: 'فروقات قاصة', type: 'expense', group: 'المصاريف' },
    // suppliers
    { code: 'SUP-ABRAR', name: 'شركة الأبرار', type: 'supplier', group: 'الموردون' },
    { code: 'SUP-KHORA', name: 'شركة الخورة', type: 'supplier', group: 'الموردون' },
    { code: 'SUP-GEN', name: 'الموردين العامين', type: 'supplier', group: 'الموردون' }
  ];
  function empAccountCode(name) {
    const m = { 'حيدر محمد الحداد': 'EMP-HMH', 'حيدر يافوز': 'EMP-HY', 'عبود': 'EMP-ABD', 'حسين سالم': 'EMP-HS', 'خضر عبدالخالق': 'EMP-KH', 'علي الباكستاني': 'EMP-ALI' };
    return m[normName(name)] || 'EMP-GEN';
  }
  // map a cashbox row (expenseType + party + direction) → account code
  function mapAccount(expenseType, party, direction) {
    const t = String(expenseType || ''); const p = normName(party);
    if (direction && (direction.indexOf('داخل') >= 0 || direction.indexOf('وارد') >= 0)) {
      if (t.indexOf('داخل قاصة') >= 0 || p === 'سيف عدنان') return 'OWN-SAIF';
      if (t.indexOf('من حسين') >= 0 || t.indexOf('فرق') >= 0) return 'AST-HUS';
      return 'OWN-SAIF';
    }
    if (t.indexOf('سلف') >= 0) return empAccountCode(party);
    if (t.indexOf('طعام') >= 0 || t.indexOf('وجبة') >= 0) return 'EXP-FOOD';
    if (t.indexOf('بنزين') >= 0) return 'EXP-FUEL';
    if (t.indexOf('كرو') >= 0 || t.indexOf('نقل') >= 0) return 'EXP-TRANS';
    if (t.indexOf('مواد') >= 0 || t.indexOf('شراء') >= 0 || t.indexOf('مستلزم') >= 0) return 'EXP-MAT';
    if (t.indexOf('كهرباء') >= 0) return 'EXP-ELEC';
    if (t.indexOf('ماء') >= 0) return 'EXP-WATER';
    if (t.indexOf('رصيد') >= 0) return 'EXP-CREDIT';
    if (t.indexOf('صيانة') >= 0 || t.indexOf('تصليح') >= 0 || t.indexOf('معدات') >= 0 || t.indexOf('غاز') >= 0) return 'EXP-MAINT';
    if (t.indexOf('سفر') >= 0 || t.indexOf('تفاصيل') >= 0) return 'EXP-TRAVEL';
    if (t.indexOf('فرق') >= 0) return 'EXP-DIFF';
    if (t.indexOf('عهد') >= 0) return 'AST-HUS';
    if (t.indexOf('مورد') >= 0) { if (SUPPLIERS[p] === 'شركة الأبرار') return 'SUP-ABRAR'; if (SUPPLIERS[p] === 'شركة الخورة') return 'SUP-KHORA'; return 'SUP-GEN'; }
    return 'EXP-GEN';
  }
  function partyType(party, expenseType, direction) {
    const p = normName(party);
    if (!p) return 'قاصة';
    if (p === 'سيف عدنان') return 'مالك';
    if (OFFICIAL_EMPLOYEES.indexOf(p) >= 0 || (data().employeesRef || []).some(e => e.name === p)) return 'موظف';
    if (SUPPLIERS[p]) return 'مورد';
    if (String(expenseType || '').indexOf('مورد') >= 0) return 'مورد';
    return 'جهة عامة';
  }

  /* ───────── data root ───────── */
  function data() {
    const o = O();
    if (!o.wsLedger || typeof o.wsLedger !== 'object') o.wsLedger = {};
    const d = o.wsLedger;
    ['accounts', 'transactions', 'advances', 'foodAllocations', 'attendanceDays', 'fines', 'husseinDiffs', 'debts', 'employeesRef', 'importBatches', 'audit', 'timesheetCases'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    return d;
  }
  function accByCode(code) { return data().accounts.find(a => a.code === code); }
  function accName(code) { const a = accByCode(code); return a ? a.name : code; }

  function ensureChart() {
    const d = data();
    if (d.accounts.length) return;
    d.accounts = CHART.map((a, i) => ({ id: 'acc_' + a.code, code: a.code, name: a.name, type: a.type, group: a.group, order: i, createdFromImport: false }));
  }

  /* ───────── audit ───────── */
  function logAudit(entity, entityId, field, oldV, newV, reason) {
    data().audit.unshift({ id: uid('aud'), at: nowISO(), by: currentUserName(), entity, entityId, field, old: oldV == null ? '' : String(oldV), new: newV == null ? '' : String(newV), reason: reason || '' });
    if (data().audit.length > 4000) data().audit.length = 4000;
  }

  /* ═══════════════ IMPORT ENGINE ═══════════════ */
  async function loadDataset() {
    // 1) try the local prepared JSON (offline-safe, the official source already normalized)
    try {
      const res = await fetch('/workshop_migration_data.json', { cache: 'no-store' });
      if (res.ok) { const j = await res.json(); j._origin = 'json'; return j; }
    } catch (_) {}
    throw new Error('تعذّر تحميل ملف البيانات الرسمي workshop_migration_data.json — تأكد أن السيرفر يعمل.');
  }

  function dedupeTx(batchId, t) {
    return [t.date, Math.round(t.amount), normName(t.party), t.account_id, t.source_module, t.source_record_id].join('|');
  }
  function nextTxCode(seq) { return 'TX-2026-' + String(seq).padStart(6, '0'); }

  // Content-only dedupe keys (NEVER include a uid()-minted id — those are
  // freshly random on every buildRecords() call, so an id-based key can never
  // match across two separate import runs and silently duplicates everything.
  // Applied uniformly to both existing records and freshly built ones.)
  function keyAdv(a) { return [a.employee_name, a.date, Math.round(a.amount), a.advance_type].join('|'); }
  function keyFood(f) { return [f.employee_name, f.date, Math.round(f.share)].join('|'); }
  function keyFine(f) { return [f.employee_name, f.date, f.type, Math.round(f.amount)].join('|'); }
  function keyHus(h) { return [h.date, h.kind, h.party, Math.round(h.amount)].join('|'); }
  function keyDebt(x) { return [x.name, x.kind, Math.round(x.amount), x.direction].join('|'); }
  // NOTE: keyed on employee_name (not employee_id) on purpose — this dataset
  // has historical employeesRef rows whose id no longer matches the id baked
  // into the officially-imported attendanceDays (an orphaned early-test
  // batch's employeesRef row won the "name already exists" race). Name is
  // the one field guaranteed stable across every build.
  function keyAtt(a) { return [normName(a.employee_name), a.date].join('|'); }

  // Build records (pure) from a dataset; returns {accounts,transactions,advances,foodAllocations,attendanceDays,fines,husseinDiffs,debts,employeesRef, report}
  function buildRecords(ds, batchId) {
    const report = { warnings: [], counts: {}, unmatchedAdvances: [], unmatchedFood: [], recon: ds.reconciliation || {} };
    ensureChart();

    // employeesRef — reuse the EXISTING record's id when the name already exists
    // (from a prior import) so every other dedupe_key that embeds employee_id
    // (attendanceDays, advances, fines) stays stable across re-imports.
    const existingEmpByName = {}; data().employeesRef.forEach(e => { existingEmpByName[e.name] = e; });
    const employeesRef = (ds.employees || []).map(e => {
      const name = normName(e.name);
      const prior = existingEmpByName[name];
      return {
        id: prior ? prior.id : uid('emp'), name, nominalWage: e.nominalWage || 0, shift: e.shift || 'morning',
        priorBalance: e.priorBalance || 0, note: e.note || '', createdFromImport: true, import_batch_id: prior ? prior.import_batch_id : batchId
      };
    });
    const empByName = {}; employeesRef.forEach(e => { empByName[e.name] = e; });

    // transactions (master) from cashbox
    // seq must continue from the highest EXISTING transaction_code, not reset
    // to 1 — otherwise every re-import mints TX-2026-000001.. again and two
    // unrelated transactions from different batches end up sharing a code.
    let seq = 1;
    data().transactions.forEach(t => {
      const m = /TX-2026-(\d+)/.exec(t.transaction_code || '');
      if (m) seq = Math.max(seq, parseInt(m[1], 10) + 1);
    });
    const transactions = [];
    (ds.cashbox || []).forEach(c => {
      const dir = c.direction || '';
      let direction = 'صادر';
      if (dir.indexOf('داخل') >= 0 || dir.indexOf('وارد') >= 0) direction = 'وارد';
      else if (dir.indexOf('فرق') >= 0) direction = 'فرق';
      else if (dir.indexOf('ملاحظة') >= 0 || dir.indexOf('مراجعة') >= 0) direction = 'ملاحظة';
      else if (dir.indexOf('تسوية') >= 0) direction = 'تسوية';
      const accountId = mapAccount(c.expenseType, c.party, dir);
      const amt = Math.abs(Number(c.amount) || 0);
      const t = {
        id: uid('tx'), transaction_code: nextTxCode(seq++),
        source_module: 'الوارد والصادر', source_record_id: c.sourceId || '',
        date: c.date, amount: amt, direction,
        expense_type: c.expenseType || '', party_type: partyType(c.party, c.expenseType, dir),
        party_id: empByName[normName(c.party)] ? empByName[normName(c.party)].id : '', party_name: normName(c.party),
        account_id: accountId, account_name: accName(accountId),
        cashbox_id: 'AST-CASH', notes: c.statement || '',
        is_employee_advance: String(c.isEmployeeAdvance || '').indexOf('نعم') >= 0,
        signed: (direction === 'وارد') ? amt : (direction === 'صادر' ? -amt : (Number(c.signed) || 0)),
        review_status: 'none', status: c.status || 'معتمد',
        created_from_import: true, import_batch_id: batchId, source_row: c.sourceId || ''
      };
      t.dedupe_key = dedupeTx(batchId, t);
      transactions.push(t);
    });

    // index master food / advance transactions for linking
    const foodTxByDate = {};
    transactions.forEach(t => { if (t.account_id === 'EXP-FOOD') { (foodTxByDate[t.date] = foodTxByDate[t.date] || []).push(t); } });
    const advTxPool = transactions.filter(t => t.account_id && t.account_id.indexOf('EMP-') === 0 && t.direction === 'صادر');
    const advTxUsed = new Set();

    // advances (cash) from the authoritative السلف sheet — link to a cashbox صادر row
    const advances = [];
    (ds.advances || []).filter(a => String(a.type || '').indexOf('نقدية') >= 0).forEach(a => {
      const emp = normName(a.employee); const e = empByName[emp];
      // match by (date, amount, employee)
      let link = advTxPool.find(t => !advTxUsed.has(t.id) && t.date === a.date && Math.round(t.amount) === Math.round(a.amount) && t.party_name === emp);
      if (!link) link = advTxPool.find(t => !advTxUsed.has(t.id) && Math.round(t.amount) === Math.round(a.amount) && t.party_name === emp);
      if (link) advTxUsed.add(link.id);
      const rec = {
        id: uid('adv'), financial_transaction_id: link ? link.id : null, transaction_code: link ? link.transaction_code : '',
        _linkDedupeKey: link ? link.dedupe_key : null,
        employee_id: e ? e.id : '', employee_name: emp, advance_type: 'سلفة نقدية',
        amount: Math.round(a.amount), date: a.date, statement: a.statement || '',
        account_id: empAccountCode(emp), created_from_import: true, import_batch_id: batchId, source_row: a.row
      };
      rec.dedupe_key = keyAdv(rec);
      if (!link) report.unmatchedAdvances.push({ employee: emp, date: a.date, amount: rec.amount });
      advances.push(rec);
    });

    // food allocations from الطعام sheet — link to the day's food cashbox tx (no new spend)
    const foodAllocations = [];
    (ds.food || []).forEach(f => {
      const emp = normName(f.employee); const e = empByName[emp];
      const dayTx = (foodTxByDate[f.date] || [])[0] || null;
      const rec = {
        id: uid('food'), food_transaction_id: dayTx ? dayTx.id : null, transaction_code: dayTx ? dayTx.transaction_code : '',
        _linkDedupeKey: dayTx ? dayTx.dedupe_key : null,
        employee_id: e ? e.id : '', employee_name: emp, date: f.date,
        share: Math.round(f.share), day_total: Math.round(f.dayTotal), attendees: f.attendees || 0,
        created_from_import: true, import_batch_id: batchId, source_row: f.row
      };
      rec.dedupe_key = keyFood(rec);
      // surface as a food advance too
      const foodAdvRec = {
        id: uid('adv'), financial_transaction_id: dayTx ? dayTx.id : null, transaction_code: dayTx ? dayTx.transaction_code : '',
        _linkDedupeKey: dayTx ? dayTx.dedupe_key : null,
        employee_id: e ? e.id : '', employee_name: emp, advance_type: 'سلفة وجبة طعام',
        amount: rec.share, date: f.date, statement: 'حصة وجبة طعام (' + rec.attendees + ' حاضر)',
        account_id: 'EXP-FOOD', created_from_import: true, import_batch_id: batchId, source_row: f.row
      };
      foodAdvRec.dedupe_key = keyAdv(foodAdvRec);
      advances.push(foodAdvRec);
      if (!dayTx) report.unmatchedFood.push({ employee: emp, date: f.date, share: rec.share });
      foodAllocations.push(rec);
    });

    // fines
    const fines = (ds.fines || []).map(f => {
      const rec = {
        id: uid('fine'), employee_name: normName(f.employee), employee_id: (empByName[normName(f.employee)] || {}).id || '',
        date: f.date, type: f.type || 'تأخير تلقائي', lateMinutes: f.lateMinutes || 0, amount: Math.round(f.amount),
        status: f.status || 'normal', note: f.note || '', created_from_import: true, import_batch_id: batchId
      };
      rec.dedupe_key = keyFine(rec);
      return rec;
    });

    // attendance days — join advances + food + fines by (employee,date)
    const cashByKey = {}; advances.filter(a => a.advance_type === 'سلفة نقدية').forEach(a => { const k = a.employee_name + '|' + a.date; cashByKey[k] = (cashByKey[k] || 0) + a.amount; });
    const foodByKey = {}; foodAllocations.forEach(a => { const k = a.employee_name + '|' + a.date; foodByKey[k] = (foodByKey[k] || 0) + a.share; });
    const fineByKey = {}; fines.forEach(f => { const k = f.employee_name + '|' + f.date; fineByKey[k] = (fineByKey[k] || 0) + f.amount; });

    // review cases → seed yellow notes
    const reviewByKey = {};
    (ds.reviewCases || []).forEach(rc => {
      const emp = normName(rc.employee); const per = String(rc.period || '');
      // single-date cases
      const m = per.match(/(\d{4}-\d{2}-\d{2})/);
      if (m) reviewByKey[emp + '|' + m[1]] = rc;
      else {
        // range cases like 2026-04-19 → 2026-04-27
        const r = per.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
        if (r) reviewByKey[emp + '|range|' + r[1] + '|' + r[2]] = rc;
      }
    });
    function reviewFor(emp, date) {
      if (reviewByKey[emp + '|' + date]) return reviewByKey[emp + '|' + date];
      for (const k in reviewByKey) {
        if (k.indexOf(emp + '|range|') === 0) { const p = k.split('|'); if (date >= p[2] && date <= p[3]) return reviewByKey[k]; }
      }
      return null;
    }

    const attendanceDays = (ds.attendance || []).map(at => {
      const emp = normName(at.employee); const e = empByName[emp]; const k = emp + '|' + at.date;
      const hasIn = !!at.checkin, hasOut = !!at.checkout;
      let note = '', reviewStatus = 'none';
      const rc = reviewFor(emp, at.date);
      if (rc) { note = rc.caseType + ' — ' + rc.details; reviewStatus = 'pending'; }
      else if (at.status !== 'absent' && hasIn && !hasOut) { note = 'يوجد دخول بدون خروج — بصمة ناقصة'; reviewStatus = 'pending'; }
      else if (at.status !== 'absent' && !hasIn && hasOut) { note = 'يوجد خروج بدون دخول — بصمة ناقصة'; reviewStatus = 'pending'; }
      else if (at.xlsxNote) { note = at.xlsxNote; reviewStatus = 'pending'; }
      return {
        id: uid('att'), employee_id: e ? e.id : '', employee_name: emp, date: at.date, day: at.day,
        checkin: at.checkin || '', checkout: at.checkout || '', hours: at.hours || 0,
        status: at.status || 'absent',
        cash_advance: cashByKey[k] || 0, food_advance: foodByKey[k] || 0, fine: fineByKey[k] || at.fine || 0,
        bonus: at.bonus || 0, damage: at.damage || 0,
        allowance: 0, overtime: at.status === 'friday_work' ? (at.hours || 0) : 0, late: 0, early_leave: 0,
        note, review_status: reviewStatus, review_click_count: 0, reviewed_by: '', reviewed_at: '',
        manual_override: '', created_from_import: true, import_batch_id: batchId,
        erp_case_num: null, dedupe_key: keyAtt({ employee_id: e ? e.id : '', employee_name: emp, date: at.date })
      };
    });

    // hussein differences (authoritative)
    const husseinDiffs = (ds.husseinDiffs || []).map(h => {
      const rec = {
        id: uid('hus'), date: h.date, kind: h.kind, party: normName(h.party), amount: Math.round(h.amount),
        cash_effect: Math.round(h.cashEffect), reason: h.reason || '', status: h.status || 'مؤكد',
        side: (String(h.kind).indexOf('نقص') >= 0 || String(h.kind).indexOf('صادر') >= 0) ? 'short' : 'in',
        created_from_import: true, import_batch_id: batchId
      };
      rec.dedupe_key = keyHus(rec);
      return rec;
    });

    // debts (opening balances)
    const debts = (ds.debts || []).map(d2 => {
      const rec = {
        id: uid('debt'), name: normName(d2.name), kind: d2.kind, amount: Math.round(d2.amount),
        paid: Math.round(d2.paid), remaining: Math.round(d2.remaining), direction: d2.direction,
        created_from_import: true, import_batch_id: batchId
      };
      rec.dedupe_key = keyDebt(rec);
      return rec;
    });

    // timesheet cases (حالات التايم شيت - ERP) — curated notes that must ride along
    // with the timesheet; resolved to employee(s)/date(s) so they can be merged
    // into attendanceDays without ever overwriting an already-reviewed day.
    const timesheetCases = (ds.timesheetCases || []).map(tc => {
      const emps = resolveCaseEmployees(tc.employee, tc.note, empByName);
      const dates = resolveCaseDates(tc.period);
      return {
        id: uid('tsc'), num: tc.num, employee_raw: tc.employee,
        employee_ids: emps.map(x => x.id), employee_names: emps.map(x => x.name),
        period: tc.period, dates, case_type: tc.caseType, note: tc.note,
        suggested_action: tc.suggestedAction, status: tc.status || 'مفتوح',
        created_from_import: true, import_batch_id: batchId, dedupe_key: 'case_' + tc.num
      };
    });

    report.counts = {
      transactions: transactions.length, advances: advances.length, foodAllocations: foodAllocations.length,
      attendanceDays: attendanceDays.length, fines: fines.length, husseinDiffs: husseinDiffs.length,
      debts: debts.length, employeesRef: employeesRef.length, timesheetCases: timesheetCases.length
    };
    if (report.unmatchedAdvances.length) report.warnings.push(report.unmatchedAdvances.length + ' سلفة نقدية لم تُطابَق بحركة قاصة (تظهر للمراجعة).');
    if (report.unmatchedFood.length) report.warnings.push(report.unmatchedFood.length + ' حصة طعام بلا حركة قاصة مطابقة بنفس التاريخ.');
    return { accounts: data().accounts, transactions, advances, foodAllocations, attendanceDays, fines, husseinDiffs, debts, employeesRef, timesheetCases, report };
  }

  // Resolve a case's free-text employee field (+ note text, for multi-employee
  // rows like "7 موظفين") against the known roster.
  function resolveCaseEmployees(rawEmployee, noteText, empByName) {
    const names = Object.keys(empByName);
    const direct = normName(rawEmployee);
    if (empByName[direct]) return [empByName[direct]];
    const partial = names.filter(n => direct && (n.indexOf(direct) >= 0 || direct.indexOf(n) >= 0));
    if (partial.length === 1) return [empByName[partial[0]]];
    // multi-employee free text embedded in the note, e.g. "جعفر/حسين/حيدر محمد/... — إغلاق يونيو"
    const tokens = String(noteText || '').split('—')[0].split('/').map(t => normName(t)).filter(Boolean);
    if (!tokens.length) return [];
    const matched = [];
    tokens.forEach(tok => {
      const hit = names.find(n => n.indexOf(tok) >= 0 || tok.indexOf(n) >= 0);
      if (hit && matched.indexOf(empByName[hit]) < 0) matched.push(empByName[hit]);
    });
    return matched;
  }

  // Resolve a case's "التاريخ / الفترة" free text (single date, DD/MM→DD/MM
  // range, or non-day-specific like "نيسان كامل") into a list of ISO dates.
  function resolveCaseDates(period) {
    const nums = []; const re = /(\d{1,2})\/(\d{1,2})/g; let m;
    while ((m = re.exec(String(period || '')))) nums.push([parseInt(m[1], 10), parseInt(m[2], 10)]);
    if (!nums.length) return [];
    const toISO = (d, mo) => '2026-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (nums.length === 1) return [toISO(nums[0][0], nums[0][1])];
    const start = new Date(2026, nums[0][1] - 1, nums[0][0]);
    const end = new Date(2026, nums[1][1] - 1, nums[1][0]);
    const out = [];
    for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) out.push(toISO(t.getDate(), t.getMonth() + 1));
    return out;
  }

  // Merge curated timesheet-case notes into existing attendanceDays. Safe to
  // call on every import: skips days a human already reviewed (green) and
  // skips a case that was already applied to a given day (erp_case_num guard).
  function applyTimesheetCaseNotes(d) {
    // keyed on employee_name, not employee_id — see keyAtt() note above on
    // why employee_id cannot be trusted to match across historical batches.
    const byKey = {}; d.attendanceDays.forEach(a => { byKey[normName(a.employee_name) + '|' + a.date] = a; });
    let applied = 0;
    d.timesheetCases.forEach(c => {
      if (!c.dates || !c.dates.length || !c.employee_names || !c.employee_names.length) return;
      c.employee_names.forEach(ename => {
        c.dates.forEach(dt => {
          const a = byKey[normName(ename) + '|' + dt];
          if (!a || a.review_status === 'reviewed' || a.erp_case_num === c.num) return;
          const tag = String(c.status || '').indexOf('مفتوح') >= 0 ? 'مفتوح' : (c.status || 'معالَج');
          a.note = '[ERP #' + c.num + ' — ' + tag + '] ' + c.case_type + ' — ' + c.note + (c.suggested_action ? (' ← ' + c.suggested_action) : '');
          a.review_status = 'pending'; a.review_click_count = 0; a.erp_case_num = c.num;
          applied++;
        });
      });
    });
    return applied;
  }

  // Repair employee_id FKs left dangling by historical batches whose
  // employeesRef row lost the "name already exists" race to an even earlier
  // (possibly since-rolled-back) batch. Safe: only touches the id field, by
  // name, never note/review/checkin/status. Self-heals on every import.
  function repairEmployeeIds(d) {
    const byName = {}; d.employeesRef.forEach(e => { byName[e.name] = e; });
    let fixed = 0;
    ['attendanceDays', 'advances', 'foodAllocations'].forEach(k => {
      d[k].forEach(r => {
        const canon = byName[normName(r.employee_name)];
        if (canon && r.employee_id !== canon.id) { r.employee_id = canon.id; fixed++; }
      });
    });
    return fixed;
  }

  // Renumber duplicate transaction_code values. Each buildRecords() call used
  // to restart its own TX-2026-000001.. sequence, so two unrelated
  // transactions from different import batches could end up sharing a code
  // (fixed going forward in buildRecords, but this repairs pre-existing
  // collisions). Keeps the first occurrence of each code, bumps the rest.
  function repairDuplicateTxCodes(d) {
    let maxSeq = 0;
    d.transactions.forEach(t => { const m = /TX-2026-(\d+)/.exec(t.transaction_code || ''); if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10)); });
    const seen = new Set(); let fixed = 0;
    d.transactions.forEach(t => {
      if (seen.has(t.transaction_code)) {
        const oldCode = t.transaction_code;
        t.transaction_code = nextTxCode(++maxSeq);
        seen.add(t.transaction_code);
        fixed++;
        logAudit('transaction', t.id, 'transaction_code', oldCode, t.transaction_code, 'إصلاح تكرار كود الحركة');
      } else { seen.add(t.transaction_code); }
    });
    if (fixed) {
      // advances/food cache a denormalized copy of the linked tx's code —
      // resync it so a renumber above can't leave a stale display code.
      const txById = {}; d.transactions.forEach(t => { txById[t.id] = t; });
      d.advances.forEach(a => { if (a.financial_transaction_id && txById[a.financial_transaction_id]) a.transaction_code = txById[a.financial_transaction_id].transaction_code; });
      d.foodAllocations.forEach(f => { if (f.food_transaction_id && txById[f.food_transaction_id]) f.transaction_code = txById[f.food_transaction_id].transaction_code; });
    }
    return fixed;
  }

  // Refresh the derived money rollups (cash_advance/food_advance/fine) baked
  // into EVERY attendanceDay — old and new — from the current, authoritative
  // advances/foodAllocations/fines collections. These 3 fields have no manual
  // edit UI (unlike note/review_status/status), so recomputing them on every
  // import keeps a day's displayed totals in sync with later corrections in
  // the source sheet without touching anything a human reviewed or edited.
  function refreshAttendanceRollups(d) {
    const cashByKey = {}; d.advances.filter(a => a.advance_type === 'سلفة نقدية').forEach(a => { const k = normName(a.employee_name) + '|' + a.date; cashByKey[k] = (cashByKey[k] || 0) + a.amount; });
    const foodByKey = {}; d.foodAllocations.forEach(a => { const k = normName(a.employee_name) + '|' + a.date; foodByKey[k] = (foodByKey[k] || 0) + a.share; });
    const fineByKey = {}; d.fines.forEach(f => { const k = normName(f.employee_name) + '|' + f.date; fineByKey[k] = (fineByKey[k] || 0) + f.amount; });
    d.attendanceDays.forEach(a => {
      const k = normName(a.employee_name) + '|' + a.date;
      a.cash_advance = cashByKey[k] || 0;
      a.food_advance = foodByKey[k] || 0;
      if (fineByKey[k] !== undefined) a.fine = fineByKey[k];
    });
  }

  function commitImport(built, batch) {
    const d = data();
    // dedup against existing — ALWAYS recomputed from content via the key*()
    // functions, never trusted from a stored .dedupe_key field. This is what
    // makes re-import safe even against records saved before this formula
    // existed (id-based dedupe_keys from an older build never match; content
    // never lies).
    const existingTx = new Set(d.transactions.map(t => t.dedupe_key));
    const existingAdv = new Set(d.advances.map(keyAdv));
    const existingFood = new Set(d.foodAllocations.map(keyFood));
    const existingAtt = new Set(d.attendanceDays.map(keyAtt));
    const existingCase = new Set(d.timesheetCases.map(c => 'case_' + c.num));
    let added = { tx: 0, adv: 0, food: 0, att: 0, fine: 0, hus: 0, debt: 0, cases: 0, skipped: 0 };

    built.transactions.forEach(t => { if (existingTx.has(t.dedupe_key)) { added.skipped++; return; } d.transactions.push(t); added.tx++; });

    // remap advance/food links to the ACTUALLY committed transaction (which
    // may be a pre-existing one from an earlier batch, not this batch's own
    // freshly-minted tx object that got skipped as a duplicate).
    const txByDedupe = {}; d.transactions.forEach(t => { txByDedupe[t.dedupe_key] = t; });
    function relink(rec, idField) {
      if (rec._linkDedupeKey) {
        const real = txByDedupe[rec._linkDedupeKey];
        if (real) { rec[idField] = real.id; rec.transaction_code = real.transaction_code; }
      }
      delete rec._linkDedupeKey;
    }

    built.advances.forEach(a => {
      relink(a, 'financial_transaction_id');
      if (existingAdv.has(keyAdv(a))) { added.skipped++; return; }
      d.advances.push(a); added.adv++;
    });
    built.foodAllocations.forEach(f => {
      relink(f, 'food_transaction_id');
      if (existingFood.has(keyFood(f))) return;
      d.foodAllocations.push(f); added.food++;
    });
    built.attendanceDays.forEach(a => { if (existingAtt.has(keyAtt(a))) return; d.attendanceDays.push(a); added.att++; });

    // fines / hussein diffs / debts come from small, fully-curated sheets that
    // get amount CORRECTIONS between xlsx versions (not just new rows) — the
    // source workbook's own change log documents this. Content-key dedup
    // can't tell "corrected value" from "new row", so it would double-count.
    // These 3 sheets have no manual add-UI (import is their only writer), so
    // it's safe to fully replace the imported snapshot on every re-import.
    const finesBefore = d.fines.length, husBefore = d.husseinDiffs.length, debtsBefore = d.debts.length;
    d.fines = d.fines.filter(f => !f.created_from_import);
    d.husseinDiffs = d.husseinDiffs.filter(h => !h.created_from_import);
    d.debts = d.debts.filter(x => !x.created_from_import);
    built.fines.forEach(f => d.fines.push(f));
    built.husseinDiffs.forEach(h => d.husseinDiffs.push(h));
    built.debts.forEach(x => d.debts.push(x));
    added.fine = d.fines.length - finesBefore; added.hus = d.husseinDiffs.length - husBefore; added.debt = d.debts.length - debtsBefore;
    built.employeesRef.forEach(e => { if (!d.employeesRef.some(x => x.name === e.name)) d.employeesRef.push(e); });
    built.timesheetCases.forEach(c => { if (existingCase.has('case_' + c.num)) return; d.timesheetCases.push(c); added.cases++; });

    // fold curated timesheet-case notes into attendanceDays (existing + just-added),
    // never touching a day a human already reviewed (green).
    const notesApplied = applyTimesheetCaseNotes(d);
    // repair id linkage + refresh money rollups on EVERY import — self-heals
    // historical drift, never touches note/review/checkin/status.
    const idsFixed = repairEmployeeIds(d);
    const codesFixed = repairDuplicateTxCodes(d);
    refreshAttendanceRollups(d);

    batch.counts = added;
    batch.status = 'مكتمل';
    d.importBatches.unshift(batch);
    d._imported = true;
    logAudit('import', batch.id, 'batch', '', JSON.stringify(added), 'استيراد رسمي من قاعدة_موحدة');
    if (notesApplied) logAudit('import', batch.id, 'timesheetCaseNotes', '', String(notesApplied), 'دمج ملاحظات حالات التايم شيت (ERP)');
    if (idsFixed) logAudit('import', batch.id, 'employeeIdRepair', '', String(idsFixed), 'إصلاح ربط employee_id بعد إعادة الاستيراد');
    if (codesFixed) logAudit('import', batch.id, 'txCodeRepair', '', String(codesFixed), 'إصلاح تكرار transaction_code بعد إعادة الاستيراد');
    save();
    return added;
  }

  function rollbackBatch(batchId) {
    const d = data();
    const before = d.transactions.length + d.advances.length + d.attendanceDays.length;
    // fines/husseinDiffs/debts use REPLACE semantics (see commitImport) — every
    // import re-tags the WHOLE current snapshot with the latest batch id, so
    // filtering them by import_batch_id here would wipe them out on ANY
    // rollback, not just the batch that (re)created them. Leave them alone;
    // re-running the import is what "undoes" a bad snapshot for these 3.
    ['transactions', 'advances', 'foodAllocations', 'attendanceDays', 'timesheetCases'].forEach(k => {
      d[k] = d[k].filter(r => r.import_batch_id !== batchId);
    });
    d.attendanceDays.forEach(a => { if (a.erp_case_num && !d.timesheetCases.some(c => c.num === a.erp_case_num)) { a.erp_case_num = null; } });
    d.importBatches = d.importBatches.filter(b => b.id !== batchId);
    if (!d.importBatches.length) d._imported = false;
    logAudit('import', batchId, 'rollback', String(before), '', 'تراجع عن دفعة الاستيراد');
    save();
    toast('تم التراجع عن الدفعة وحذف سجلاتها ✅', 'success');
    render();
  }

  window.wsLoadPreview = async function () {
    const body = document.getElementById('wsImportPreview');
    if (body) body.innerHTML = '<div class="ws-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل المصدر الرسمي…</div>';
    try {
      previewCache = await loadDataset();
      render();
      toast('تم تحميل المصدر — راجع المعاينة ثم نفّذ الاستيراد', 'info');
    } catch (e) {
      if (body) body.innerHTML = '<div class="ws-error"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(e.message) + '</div>';
    }
  };

  window.wsRunImport = function () {
    if (!previewCache) { toast('حمّل المعاينة أولاً', 'warning'); return; }
    const batch = { id: uid('batch'), batch_code: 'IMP-' + new Date().toISOString().slice(0, 10) + '-' + Math.random().toString(36).slice(2, 5), at: nowISO(), by: currentUserName(), source: previewCache.meta?.source || 'قاعدة_موحدة.xlsx', counts: {}, status: 'قيد التنفيذ' };
    const built = buildRecords(previewCache, batch.id);
    const added = commitImport(built, batch);
    // keep the source's reconciliation targets with the data they describe, so the
    // self-test can still verify them after a reload (previewCache is transient)
    try { if (previewCache.reconciliation) data().reconciliation = previewCache.reconciliation; } catch (_) {}
    activeView = 'timesheet';
    render();
    let bridgeMsg = '';
    if (typeof window.wsBridgeSyncLegacyTimesheet === 'function') {
      try {
        const b = window.wsBridgeSyncLegacyTimesheet();
        if (b.filled || b.created || b.notesSynced) bridgeMsg = ' — التايم شيت الذكي: ' + b.created + ' يوم جديد، ' + b.filled + ' دخول/خروج، ' + b.notesSynced + ' ملاحظة';
      } catch (e) { console.warn('wsBridgeSyncLegacyTimesheet failed', e); }
    }
    toast('تم الاستيراد ✅ — ' + added.tx + ' حركة، ' + added.adv + ' سلفة، ' + added.att + ' يوم حضور، ' + added.cases + ' حالة تايم شيت جديدة' + (added.skipped ? ' (تجاهل ' + added.skipped + ' مكرر)' : '') + bridgeMsg, 'success');
  };

  /* ═══════════════ COMPUTED VIEWS ═══════════════ */
  function cashboxRunning() {
    const d = data();
    const txs = d.transactions.filter(t => t.direction === 'وارد' || t.direction === 'صادر' || t.direction === 'فرق')
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.transaction_code || '').localeCompare(b.transaction_code || ''));
    let bal = 0;
    return txs.map(t => { bal += (t.signed || 0); return Object.assign({}, t, { running: bal }); });
  }
  function husseinSummary() {
    const d = data();
    const short = d.husseinDiffs.filter(h => h.side === 'short').reduce((s, h) => s + h.amount, 0);
    const inc = d.husseinDiffs.filter(h => h.side === 'in').reduce((s, h) => s + h.amount, 0);
    return { short, inc, net: short - inc };
  }

  /* ═══════════════ RENDER ═══════════════ */
  function kpiStrip() {
    const d = data();
    const recon = (d.importBatches[0] ? (previewCache && previewCache.reconciliation) : null) || (previewCache && previewCache.reconciliation) || d.reconciliation || {};
    const run = cashboxRunning();
    const rawNet = run.length ? run[run.length - 1].running : 0;
    const hs = husseinSummary();
    const cashAdv = d.advances.filter(a => a.advance_type === 'سلفة نقدية').reduce((s, a) => s + a.amount, 0);
    const foodAdv = d.advances.filter(a => a.advance_type === 'سلفة وجبة طعام').reduce((s, a) => s + a.amount, 0);
    const cards = [
      { l: 'رصيد القاصة المعتمد', v: recon.cashboxFinal != null ? fmt(recon.cashboxFinal) : '—', c: 'pos', s: recon.cashboxFinal != null ? ('نهاية ' + ((recon.cashboxAsOf || '2026-06-29').slice(5).split('-').reverse().join('/'))) : 'غير متوفر — شغّل الاستيراد' },
      { l: 'صافي حركة القاصة الخام', v: fmt(rawNet), c: rawNet < 0 ? 'neg' : 'pos', s: 'داخل − خارج' },
      { l: 'السلف النقدية', v: fmt(cashAdv), c: '', s: d.advances.filter(a => a.advance_type === 'سلفة نقدية').length + ' سلفة' },
      { l: 'سلفة وجبة الطعام', v: fmt(foodAdv), c: '', s: d.foodAllocations.length + ' حصة' },
      { l: 'صافي فروقات حسين', v: fmt(hs.net), c: 'neg', s: 'نقص على حسين' },
      { l: 'الحركات المالية', v: fmt(d.transactions.length), c: '', s: 'سجل موحّد' }
    ];
    return '<div class="ws-kpis">' + cards.map(c => '<div class="ws-kpi ' + c.c + '"><div class="ws-kpi-v">' + c.v + '</div><div class="ws-kpi-l">' + esc(c.l) + '</div><div class="ws-kpi-s">' + esc(c.s) + '</div></div>').join('') + '</div>';
  }

  function tabsBar() {
    const tabs = [
      ['import', 'استيراد البيانات', 'fa-file-import'],
      ['transactions', 'الحركات المالية', 'fa-right-left'],
      ['cashbox', 'القاصة', 'fa-cash-register'],
      ['advances', 'السلف', 'fa-hand-holding-dollar'],
      ['timesheet', 'التايم شيت', 'fa-clock'],
      ['payroll', 'دورات الرواتب', 'fa-file-invoice-dollar'],
      ['hussein', 'فروقات حسين', 'fa-scale-unbalanced'],
      ['tests', 'اختبارات القبول', 'fa-clipboard-check'],
      ['audit', 'سجل التعديلات', 'fa-clock-rotate-left']
    ];
    return '<div class="ws-tabs">' + tabs.map(t => '<button class="ws-tab ' + (activeView === t[0] ? 'active' : '') + '" onclick="wsSetView(\'' + t[0] + '\')"><i class="fa-solid ' + t[2] + '"></i> ' + t[1] + '</button>').join('') + '</div>';
  }

  function importView() {
    const d = data();
    const batches = d.importBatches.map(b => '<tr><td>' + esc(b.batch_code) + '</td><td>' + esc((b.at || '').slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(b.by) + '</td><td>' + fmt(b.counts.tx || 0) + ' حركة / ' + fmt(b.counts.adv || 0) + ' سلفة</td><td><span class="ws-badge done">' + esc(b.status) + '</span></td><td><button class="ws-mini danger" onclick="wsRollback(\'' + b.id + '\')"><i class="fa-solid fa-rotate-left"></i> تراجع</button></td></tr>').join('') || '<tr><td colspan="6" class="ws-empty">لا توجد دفعات استيراد بعد</td></tr>';

    let preview = '<div id="wsImportPreview">';
    if (previewCache) {
      const c = { employees: previewCache.employees.length, attendance: previewCache.attendance.length, advances: previewCache.advances.length, food: previewCache.food.length, fines: previewCache.fines.length, cashbox: previewCache.cashbox.length, husseinDiffs: previewCache.husseinDiffs.length, debts: previewCache.debts.length, reviewCases: previewCache.reviewCases.length, timesheetCases: (previewCache.timesheetCases || []).length };
      const r = previewCache.reconciliation || {};
      preview += '<div class="ws-preview-grid">' + Object.entries({ 'الموظفون': c.employees, 'سجلات الحضور': c.attendance, 'السلف': c.advances, 'حصص الطعام': c.food, 'الغرامات': c.fines, 'حركات القاصة': c.cashbox, 'فروقات حسين': c.husseinDiffs, 'الديون': c.debts, 'حالات مراجعة': c.reviewCases, 'حالات تايم شيت (ERP)': c.timesheetCases }).map(([k, v]) => '<div class="ws-pv"><span>' + fmt(v) + '</span>' + k + '</div>').join('') + '</div>';
      const okFood = r.foodAdvancesComputed === r.foodAllocComputed;
      preview += '<div class="ws-recon"><h4>تحقق المطابقة من المصدر</h4><ul>'
        + '<li>' + (r.cashAdvancesComputed === r.cashAdvancesTarget ? '✅' : '⚠️') + ' السلف النقدية: ' + fmt(r.cashAdvancesComputed) + ' / الهدف ' + fmt(r.cashAdvancesTarget) + '</li>'
        + '<li>' + (okFood ? '✅' : '⚠️') + ' الطعام: محسوب ' + fmt(r.foodAllocComputed) + ' = سلف طعام ' + fmt(r.foodAdvancesComputed) + ' / الهدف ' + fmt(r.foodTarget) + '</li>'
        + '<li>' + (r.husseinNet === (r.husseinShort - r.husseinIn) ? '✅' : '⚠️') + ' صافي فروقات حسين: ' + fmt(r.husseinNet) + ' (نقص ' + fmt(r.husseinShort) + ' − وارد ' + fmt(r.husseinIn) + ')</li>'
        + '<li>✅ رصيد القاصة المعتمد: ' + fmt(r.cashboxFinal) + '</li>'
        + '</ul></div>';
      preview += '<div class="ws-actions"><button class="ws-btn primary" onclick="wsRunImport()"><i class="fa-solid fa-bolt"></i> تنفيذ الاستيراد إلى ERP</button> <span class="ws-hint">الاستيراد يربط السلف والطعام بحركات القاصة ولا يكرر أي مبلغ.</span></div>';
    } else {
      preview += '<div class="ws-import-hero"><i class="fa-solid fa-cloud-arrow-up"></i><p>المصدر الرسمي: <b>قاعدة_موحدة.xlsx</b> (منظّف ومتسق مسبقًا)</p><button class="ws-btn primary" onclick="wsLoadPreview()"><i class="fa-solid fa-eye"></i> تحميل ومعاينة</button></div>';
    }
    preview += '</div>';

    const steps = ['رفع/تحميل الملف', 'كشف الأوراق', 'مطابقة الأعمدة تلقائيًا', 'توحيد الأسماء', 'توحيد التصنيفات', 'تحويل سيف لقيدين عبر القاصة', 'استيراد الحركات المالية', 'ربط السلف بالحركات', 'استيراد الحضور', 'توزيع الطعام حسب الحضور', 'استيراد فروقات حسين', 'تقرير التحقق', 'تأكيد الاستيراد'];
    return '<div class="ws-panel"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> معالج الاستيراد</h3>'
      + '<div class="ws-steps">' + steps.map((s, i) => '<span class="ws-step"><b>' + (i + 1) + '</b> ' + s + '</span>').join('') + '</div>'
      + preview + '</div>'
      + '<div class="ws-panel"><h3><i class="fa-solid fa-layer-group"></i> دفعات الاستيراد</h3><table class="ws-table"><thead><tr><th>الكود</th><th>التاريخ</th><th>المستخدم</th><th>النتيجة</th><th>الحالة</th><th></th></tr></thead><tbody>' + batches + '</tbody></table></div>';
  }

  function transactionsView() {
    const d = data();
    if (!d.transactions.length) return emptyState();
    const parties = Array.from(new Set(d.transactions.map(t => t.party_name).filter(Boolean))).sort();
    const types = Array.from(new Set(d.transactions.map(t => t.expense_type).filter(Boolean))).sort();
    let rows = d.transactions.slice();
    if (txFilter.dir !== 'all') rows = rows.filter(t => t.direction === txFilter.dir);
    if (txFilter.type !== 'all') rows = rows.filter(t => t.expense_type === txFilter.type);
    if (txFilter.party !== 'all') rows = rows.filter(t => t.party_name === txFilter.party);
    if (txFilter.q) { const q = txFilter.q; rows = rows.filter(t => (t.notes + t.transaction_code + t.party_name + t.expense_type).indexOf(q) >= 0); }
    rows = rows.sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 600);
    const body = rows.map(t => {
      const dirCls = t.direction === 'وارد' ? 'in' : (t.direction === 'صادر' ? 'out' : 'diff');
      return '<tr><td class="mono">' + esc(t.transaction_code) + '</td><td>' + esc(t.date) + '</td>'
        + '<td><span class="ws-dir ' + dirCls + '">' + esc(t.direction) + '</span></td>'
        + '<td>' + esc(t.expense_type) + '</td><td>' + esc(t.party_name || '—') + '<small class="ws-pt">' + esc(t.party_type) + '</small></td>'
        + '<td>' + esc(t.account_name) + '</td><td class="num">' + fmt(t.amount) + '</td>'
        + '<td>' + (t.financial_link ? '' : '') + esc(t.notes || '') + '</td></tr>';
    }).join('');
    return '<div class="ws-toolbar">'
      + '<input class="ws-input" placeholder="بحث…" value="' + esc(txFilter.q) + '" oninput="wsTxFilter(\'q\', this.value)">'
      + '<select class="ws-input" onchange="wsTxFilter(\'dir\', this.value)"><option value="all">كل الاتجاهات</option>' + ['وارد', 'صادر', 'فرق'].map(x => '<option ' + (txFilter.dir === x ? 'selected' : '') + '>' + x + '</option>').join('') + '</select>'
      + '<select class="ws-input" onchange="wsTxFilter(\'type\', this.value)"><option value="all">كل الأنواع</option>' + types.map(x => '<option ' + (txFilter.type === x ? 'selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>'
      + '<select class="ws-input" onchange="wsTxFilter(\'party\', this.value)"><option value="all">كل الجهات</option>' + parties.map(x => '<option ' + (txFilter.party === x ? 'selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>'
      + '<span class="ws-count">' + fmt(rows.length) + ' من ' + fmt(d.transactions.length) + '</span></div>'
      + '<table class="ws-table"><thead><tr><th>الكود</th><th>التاريخ</th><th>الاتجاه</th><th>نوع الصرف</th><th>الجهة</th><th>الحساب</th><th>المبلغ</th><th>البيان</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function cashboxView() {
    const d = data();
    if (!d.transactions.length) return emptyState();
    const run = cashboxRunning();
    const diffSet = new Set(d.husseinDiffs.map(h => h.date + '|' + h.amount));
    const rows = run.slice(-400).map(t => {
      let rowCls = '';
      const isShort = t.direction === 'فرق' && (t.notes + t.expense_type).indexOf('حسين') >= 0;
      if (diffSet.has(t.date + '|' + t.amount) || isShort) rowCls = (t.signed < 0) ? 'hus-short' : 'hus-in';
      if (t.review_status === 'pending') rowCls = 'note-pending';
      return '<tr class="' + rowCls + '"><td class="mono">' + esc(t.transaction_code) + '</td><td>' + esc(t.date) + '</td>'
        + '<td class="num ' + (t.direction === 'وارد' ? 'pos' : '') + '">' + (t.direction === 'وارد' ? fmt(t.amount) : '') + '</td>'
        + '<td class="num ' + (t.direction === 'صادر' ? 'neg' : '') + '">' + (t.direction === 'صادر' ? fmt(t.amount) : '') + '</td>'
        + '<td class="num"><b>' + fmt(t.running) + '</b></td>'
        + '<td>' + esc(t.expense_type) + ' — ' + esc(t.party_name || t.notes || '') + '</td></tr>';
    }).join('');
    const recon0 = (previewCache && previewCache.reconciliation) || data().reconciliation || {};
    return '<div class="ws-legend"><span class="lg hus-short">نقص على حسين</span><span class="lg hus-in">وارد من حسين</span><span class="lg note-pending">ملاحظة/مراجعة</span></div>'
      + '<div class="ws-cashbox-note">رصيد القاصة المعتمد نهاية ' + esc((recon0.cashboxAsOf || '2026-06-29').slice(5).split('-').reverse().join('/')) + ': <b>' + (recon0.cashboxFinal != null ? fmt(recon0.cashboxFinal) : '—') + '</b> دينار — والصافي الخام أدناه هو حركة وليست فرقاً.</div>'
      + '<table class="ws-table"><thead><tr><th>الكود</th><th>التاريخ</th><th>وارد</th><th>صادر</th><th>الرصيد الجاري</th><th>البيان</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function advancesView() {
    const d = data();
    if (!d.advances.length) return emptyState();
    const emps = Array.from(new Set(d.advances.map(a => a.employee_name).filter(Boolean))).sort();
    let rows = d.advances.slice();
    if (advEmployee !== 'all') rows = rows.filter(a => a.employee_name === advEmployee);
    // group totals
    const byEmp = {};
    d.advances.forEach(a => { const k = a.employee_name || '—'; (byEmp[k] = byEmp[k] || { cash: 0, food: 0 }); if (a.advance_type === 'سلفة نقدية') byEmp[k].cash += a.amount; else byEmp[k].food += a.amount; });
    const groupRows = Object.entries(byEmp).sort((a, b) => (b[1].cash + b[1].food) - (a[1].cash + a[1].food)).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="num">' + fmt(v.cash) + '</td><td class="num">' + fmt(v.food) + '</td><td class="num"><b>' + fmt(v.cash + v.food) + '</b></td></tr>').join('');
    rows = rows.sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 500);
    const body = rows.map(a => '<tr class="' + (a.financial_transaction_id ? '' : 'unlinked') + '"><td>' + esc(a.date) + '</td><td>' + esc(a.employee_name) + '</td>'
      + '<td><span class="ws-badge ' + (a.advance_type.indexOf('طعام') >= 0 ? 'food' : 'cash') + '">' + esc(a.advance_type) + '</span></td>'
      + '<td class="num">' + fmt(a.amount) + '</td>'
      + '<td class="mono">' + (a.transaction_code ? esc(a.transaction_code) : '<span class="ws-warn">غير مربوطة</span>') + '</td>'
      + '<td>' + esc(a.statement || '') + '</td></tr>').join('');
    return '<div class="ws-panel"><h3>تجميع حسب الموظف</h3><table class="ws-table"><thead><tr><th>الموظف</th><th>سلف نقدية</th><th>سلفة طعام</th><th>الإجمالي</th></tr></thead><tbody>' + groupRows + '</tbody></table></div>'
      + '<div class="ws-toolbar"><select class="ws-input" onchange="wsAdvEmp(this.value)"><option value="all">كل الموظفين</option>' + emps.map(e => '<option ' + (advEmployee === e ? 'selected' : '') + '>' + esc(e) + '</option>').join('') + '</select>'
      + '<button class="ws-mini" onclick="wsExportAdvances()"><i class="fa-solid fa-file-export"></i> تصدير CSV</button>'
      + '<span class="ws-count">' + fmt(rows.length) + '</span></div>'
      + '<table class="ws-table"><thead><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>المبلغ</th><th>الحركة المالية</th><th>البيان</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  // Standalone panel for the 📋 حالات التايم شيت — ERP sheet: curated
  // employee/date-specific notes that need an ERP decision ("مفتوح") or were
  // already fixed in the source file. Shown above the day-by-day table so the
  // notes survive independently of whichever attendanceDays row they linked to.
  function timesheetCasesPanel() {
    const d = data();
    if (!d.timesheetCases.length) return '';
    const cases = d.timesheetCases.slice().sort((a, b) => (a.num || 0) - (b.num || 0));
    const open = cases.filter(c => String(c.status || '').indexOf('مفتوح') >= 0);
    const rest = cases.filter(c => String(c.status || '').indexOf('مفتوح') < 0);
    const rowsFor = list => list.map(c => '<tr class="' + (String(c.status || '').indexOf('مفتوح') >= 0 ? 'case-open' : 'case-done') + '">'
      + '<td>' + fmt(c.num) + '</td><td>' + esc(c.employee_raw) + '</td><td>' + esc(c.period) + '</td>'
      + '<td>' + esc(c.case_type) + '</td><td>' + esc(c.note) + '</td><td>' + esc(c.suggested_action) + '</td>'
      + '<td><span class="ws-badge ' + (String(c.status || '').indexOf('مفتوح') >= 0 ? 'warn' : 'done') + '">' + esc(c.status) + '</span></td>'
      + '<td>' + (String(c.status || '').indexOf('مفتوح') >= 0 ? '<button class="ws-mini" onclick="wsCaseResolve(' + c.num + ')"><i class="fa-solid fa-check"></i> حُسم</button>' : '') + '</td></tr>').join('');
    return '<div class="ws-panel ws-timesheet-cases"><h3><i class="fa-solid fa-list-check"></i> حالات التايم شيت — ERP (' + fmt(cases.length) + '، ' + fmt(open.length) + ' مفتوحة تحتاج قرارك)</h3>'
      + '<table class="ws-table"><thead><tr><th>#</th><th>الموظف</th><th>التاريخ/الفترة</th><th>نوع الحالة</th><th>الوضع الحالي</th><th>الإجراء المقترح</th><th>الحالة</th><th></th></tr></thead><tbody>'
      + rowsFor(open) + rowsFor(rest) + '</tbody></table></div>';
  }

  function timesheetView() {
    const d = data();
    if (!d.attendanceDays.length) return emptyState();
    const emps = Array.from(new Set(d.attendanceDays.map(a => a.employee_name))).sort();
    const months = Array.from(new Set(d.attendanceDays.map(a => (a.date || '').slice(0, 7)).filter(Boolean))).sort();
    let rows = d.attendanceDays.slice();
    if (tsEmployee !== 'all') rows = rows.filter(a => a.employee_name === tsEmployee);
    if (tsMonth !== 'all') rows = rows.filter(a => (a.date || '').slice(0, 7) === tsMonth);
    rows = rows.sort((a, b) => (a.employee_name).localeCompare(b.employee_name) || (a.date || '').localeCompare(b.date || '')).slice(0, 700);
    const statusLabel = { normal: 'دوام', friday: 'جمعة', friday_work: 'عمل جمعة', absent: 'غياب', leave: 'إجازة', holiday: 'عطلة', mission: 'مهمة عمل', manual: 'دوام يدوي', excluded: 'مستثنى' };
    const body = rows.map(a => {
      const fines = (a.fine || 0) + (a.damage || 0);
      const net = (a.bonus || 0) - (a.cash_advance || 0) - (a.food_advance || 0) - fines;
      const noteIcon = a.note ? ('<span class="ws-note ' + a.review_status + '" title="' + esc(a.note) + (a.review_status === 'reviewed' ? ' — تمت المراجعة' : ' — اضغط 3 مرات للمراجعة') + '" onclick="wsNoteClick(\'' + a.id + '\')">' + (a.review_status === 'reviewed' ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-circle-exclamation"></i>') + '</span>') : '';
      return '<tr class="att-' + a.status + (a.review_status === 'pending' ? ' has-note' : '') + '">'
        + '<td>' + esc(a.date) + '</td><td>' + esc(a.day || '') + '</td>'
        + '<td>' + esc(a.checkin || '—') + '</td><td>' + esc(a.checkout || '—') + '</td>'
        + '<td class="num">' + fmt(a.overtime || 0) + '</td>'
        + '<td class="num">' + fmt(a.cash_advance || 0) + '</td><td class="num">' + fmt(a.food_advance || 0) + '</td>'
        + '<td class="num">' + fmt(fines) + '</td><td class="num">' + fmt(a.bonus || 0) + '</td>'
        + '<td class="num ' + (net < 0 ? 'neg' : 'pos') + '">' + fmt(net) + '</td>'
        + '<td><span class="ws-status ' + a.status + '">' + (statusLabel[a.status] || a.status) + '</span>'
        + '<select class="ws-mini-sel" onchange="wsSetDayStatus(\'' + a.id + '\', this.value)"><option value="">⋯</option>' + ['leave', 'holiday', 'mission', 'manual', 'excluded'].map(s => '<option value="' + s + '">' + statusLabel[s] + '</option>').join('') + '</select></td>'
        + '<td>' + noteIcon + ' ' + esc(a.note || '') + '</td></tr>';
    }).join('');
    return timesheetCasesPanel()
      + '<div class="ws-toolbar"><select class="ws-input" onchange="wsTsEmp(this.value)"><option value="all">كل الموظفين</option>' + emps.map(e => '<option ' + (tsEmployee === e ? 'selected' : '') + '>' + esc(e) + '</option>').join('') + '</select>'
      + '<select class="ws-input" onchange="wsTsMonth(this.value)"><option value="all">كل الأشهر</option>' + months.map(m => '<option ' + (tsMonth === m ? 'selected' : '') + '>' + m + '</option>').join('') + '</select>'
      + '<span class="ws-count">' + fmt(rows.length) + ' يوم</span>'
      + '<span class="ws-legend-inline"><span class="ws-note pending"><i class="fa-solid fa-circle-exclamation"></i></span> ملاحظة (اضغط 3×) <span class="ws-note reviewed"><i class="fa-solid fa-check"></i></span> تمت المراجعة</span></div>'
      + '<table class="ws-table ts"><thead><tr><th>التاريخ</th><th>اليوم</th><th>دخول</th><th>خروج</th><th>إضافي</th><th>سلفة نقدية</th><th>سلفة طعام</th><th>غرامات</th><th>مكافأة</th><th>الصافي</th><th>الحالة</th><th>ملاحظات</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function husseinView() {
    const d = data();
    if (!d.husseinDiffs.length) return emptyState();
    const hs = husseinSummary();
    const rows = d.husseinDiffs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(h => '<tr class="' + (h.side === 'short' ? 'hus-short' : 'hus-in') + '"><td>' + esc(h.date) + '</td><td>' + esc(h.kind) + '</td><td class="num">' + fmt(h.amount) + '</td><td class="num">' + fmt(h.cash_effect) + '</td><td>' + esc(h.reason) + '</td><td><span class="ws-badge done">' + esc(h.status) + '</span></td></tr>').join('');
    return '<div class="ws-cashbox-note">هذه الصفحة هي المرجع الوحيد للفروقات المؤكدة. الأرقام الخام (810,000 / 879,000) ليست فروقات.</div>'
      + '<table class="ws-table"><thead><tr><th>التاريخ</th><th>نوع الفرق</th><th>المبلغ</th><th>تأثير القاصة</th><th>السبب</th><th>الحالة</th></tr></thead><tbody>' + rows
      + '<tr class="ws-total"><td colspan="2">إجمالي نقص على حسين</td><td class="num">' + fmt(hs.short) + '</td><td colspan="3"></td></tr>'
      + '<tr class="ws-total"><td colspan="2">إجمالي وارد/من حسين</td><td class="num">' + fmt(hs.inc) + '</td><td colspan="3"></td></tr>'
      + '<tr class="ws-total grand"><td colspan="2">الصافي المؤكد = نقص على حسين / مستحق للقاصة</td><td class="num">' + fmt(hs.net) + '</td><td colspan="3">حسين عليه ' + fmt(hs.net) + ' للقاصة (ليس مستحقاً له)</td></tr>'
      + '</tbody></table>';
  }

  function auditView() {
    const d = data();
    if (!d.audit.length) return '<div class="ws-empty">لا توجد تعديلات مسجّلة بعد. كل تعديل يدوي يُسجَّل هنا (القيمة القديمة/الجديدة، المستخدم، الوقت).</div>';
    const rows = d.audit.slice(0, 300).map(a => '<tr><td>' + esc((a.at || '').slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(a.by) + '</td><td>' + esc(a.entity) + '</td><td>' + esc(a.field) + '</td><td>' + esc(a.old) + '</td><td>' + esc(a.new) + '</td><td>' + esc(a.reason) + '</td></tr>').join('');
    return '<table class="ws-table"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الكيان</th><th>الحقل</th><th>القديمة</th><th>الجديدة</th><th>السبب</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ───────── acceptance tests (section 15) ───────── */
  function runTests() {
    const d = data();
    const T = [];
    const txText = d.transactions.map(t => t.notes + ' ' + t.expense_type + ' ' + t.party_name).join(' ');
    T.push(['لا توجد «مباشر من سيف» في الحركات', txText.indexOf('مباشر') < 0]);
    const advText = d.advances.map(a => a.statement).join(' ');
    T.push(['لا توجد كلمة «راتب/رواتب» في السلف والحركات', txText.indexOf('راتب') < 0 && advText.indexOf('راتب') < 0]);
    const saifIn = d.transactions.filter(t => t.account_id === 'OWN-SAIF' && t.direction === 'وارد');
    T.push(['وارد سيف محوّل لقيود قاصة (دخول) موجودة', saifIn.length > 0]);
    // targets come from the imported dataset's own reconciliation block — never a
    // literal. An absent reference is reported as an unverified FAIL, because a
    // hardcoded fallback silently "passes" against a number nobody checked.
    const recon = (previewCache && previewCache.reconciliation) || d.reconciliation || {};
    // NOTE: the approved balance is an EXTERNAL figure the ledger records; it is
    // deliberately NOT the running sum (see the cashbox note: «الصافي الخام … حركة
    // وليست فرقاً»). So this asserts the source actually carries the approved
    // reference — it must never assert a literal, and must never claim a number
    // nobody supplied.
    const run = cashboxRunning();
    const rawNet = run.length ? run[run.length - 1].running : 0;
    const cashboxTarget = recon.cashboxFinal;
    T.push([
      'رصيد القاصة المعتمد مصدره البيانات الرسمية' + (cashboxTarget != null ? ' = ' + fmt(cashboxTarget) : ''),
      cashboxTarget != null,
      cashboxTarget == null ? 'المرجع غير متوفر — شغّل المعاينة أو الاستيراد أولاً'
        : fmt(cashboxTarget) + ' معتمد · ' + fmt(rawNet) + ' صافي حركة خام (حركة وليست رصيداً)'
    ]);
    const hs = husseinSummary();
    const husseinTarget = recon.husseinNet;
    T.push([
      'صافي فروقات حسين' + (husseinTarget != null ? ' = ' + fmt(husseinTarget) + ' نقص على حسين' : ''),
      husseinTarget != null && hs.net === husseinTarget,
      husseinTarget == null ? 'المرجع غير متوفر — شغّل المعاينة أو الاستيراد أولاً'
        : fmt(hs.short) + ' − ' + fmt(hs.inc) + ' = ' + fmt(hs.net)
    ]);
    const foodAdv = d.advances.filter(a => a.advance_type === 'سلفة وجبة طعام').reduce((s, a) => s + a.amount, 0);
    const foodAlloc = d.foodAllocations.reduce((s, a) => s + a.share, 0);
    T.push(['مجموع سلفة الطعام = مجموع الطعام الموزّع', foodAdv === foodAlloc, fmt(foodAdv) + ' = ' + fmt(foodAlloc)]);
    const travel = d.transactions.find(t => t.amount === 500000 && t.date === '2026-03-22');
    T.push(['بند 22/03 (500,000) = تكاليف سفر وليس طعام/سلفة', !!travel && travel.account_id === 'EXP-TRAVEL', travel ? travel.account_name : 'غير موجود']);
    const absent = d.attendanceDays.filter(a => a.status === 'absent').length;
    T.push(['الأيام غير الموجودة تظهر غياباً افتراضياً', absent > 0, absent + ' يوم غياب']);
    const yellow = d.attendanceDays.filter(a => a.review_status === 'pending').length;
    T.push(['أيام نقص البصمة تحمل علامة صفراء', yellow > 0, yellow + ' علامة صفراء']);
    // #10/#11 exercise the REAL noteClickTransition/dayStatusReviewImpact logic
    // against a disposable clone — NEVER the live d.attendanceDays. system_check
    // promises "بدون تعديل بيانات التشغيل" (no operational-data mutation); calling
    // the actual wsNoteClick/wsSetDayStatus handlers here would violate that and
    // silently corrupt a real attendance day every time someone runs this suite.
    const noteProbe = { id: '__t54_probe', note: 'ملاحظة اختبار', review_status: 'pending', review_click_count: 0 };
    let clicksToReview = 0;
    let noteProbeState = Object.assign({}, noteProbe);
    for (let i = 0; i < 3; i++) {
      const t = noteClickTransition(noteProbeState);
      noteProbeState = Object.assign({}, noteProbeState, { review_click_count: t.review_click_count, review_status: t.reviewed ? 'reviewed' : noteProbeState.review_status });
      clicksToReview++;
      if (t.reviewed) break;
    }
    T.push(['الضغط 3 مرات يحوّل الملاحظة لخضراء دون حذف',
      clicksToReview === 3 && noteProbeState.review_status === 'reviewed' && noteProbeState.note === noteProbe.note,
      clicksToReview + ' ضغطات → ' + noteProbeState.review_status + ' · الملاحظة: «' + noteProbeState.note + '»']);
    const reviewedProbe = { id: '__t54_probe2', note: 'ملاحظة سابقة', review_status: 'reviewed', review_click_count: 3 };
    const impact = dayStatusReviewImpact(reviewedProbe);
    T.push(['تعديل اليوم بعد المراجعة يعيدها صفراء',
      impact.reverts === true,
      impact.reverts ? 'ترجع إلى pending عند تعديل الحالة' : 'لم ترجع — خلل']);
    const linkedAdv = d.advances.filter(a => a.financial_transaction_id).length;
    T.push(['كل سلفة تظهر بالتايم شيت ومربوطة بحركة', linkedAdv > 0, linkedAdv + ' / ' + d.advances.length + ' سلفة مربوطة بحركة قاصة']);
    // no duplicate unlinked: an employee-advance صادر matching an advance on
    // (date, amount, employee) but linked to NO advance means the same money was
    // booked twice. Candidates must be restricted to the EMP-* advance accounts
    // buildRecords itself links against — a same-day/-amount/-party spend on any
    // other account is a different, legitimate expense (e.g. EXP-TRANS fare), not
    // a duplicate. Transactions linked to some OTHER advance are legitimate too
    // (an employee can take two advances the same day).
    const linkedTxIds = new Set(d.advances.map(a => a.financial_transaction_id).filter(Boolean));
    const dupTxIds = new Set();
    d.advances.forEach(a => {
      d.transactions.forEach(t => {
        if (t.direction === 'صادر'
          && String(t.account_id || '').indexOf('EMP-') === 0
          && t.date === a.date
          && Math.round(t.amount) === Math.round(a.amount)
          && t.party_name === a.employee_name
          && !linkedTxIds.has(t.id)) dupTxIds.add(t.id);
      });
    });
    const dup = dupTxIds.size;
    T.push(['لا تكرار لنفس المبلغ كسلفة وصادر منفصلين', dup === 0,
      dup === 0 ? 'السلف روابط على الحركات، لا صرف مستقل' : dup + ' حركة صادر مكرّرة غير مربوطة بأي سلفة']);
    T.push(['حالات التايم شيت (ERP) مستوردة كسجلات دائمة', d.timesheetCases.length > 0, d.timesheetCases.length + ' حالة (' + d.timesheetCases.filter(c => String(c.status || '').indexOf('مفتوح') >= 0).length + ' مفتوحة)']);
    // #15 calls the REAL applyTimesheetCaseNotes() — but only ever on a
    // structuredClone built from a synthetic day+case pair, never on the live d.
    // A case is constructed that WOULD match and overwrite an unreviewed day,
    // proving the guard is actually exercised, not just present but unreachable.
    const reimportDay = { id: '__t54_reimport', employee_name: '__probe__', date: '1900-01-01', note: 'ملاحظة تمت مراجعتها', review_status: 'reviewed', review_click_count: 3, erp_case_num: null };
    const reimportCase = { num: '__t54_case', employee_names: ['__probe__'], dates: ['1900-01-01'], status: 'مفتوح', case_type: 'PROBE', note: 'حالة اختبار', suggested_action: '' };
    const reimportClone = { attendanceDays: [Object.assign({}, reimportDay)], timesheetCases: [Object.assign({}, reimportCase)] };
    applyTimesheetCaseNotes(reimportClone);
    const untouchedDay = reimportClone.attendanceDays[0];
    T.push(['إعادة الاستيراد لا تمسح ملاحظة يوم تمّت مراجعته',
      untouchedDay.note === reimportDay.note && untouchedDay.review_status === 'reviewed',
      untouchedDay.note === reimportDay.note ? 'applyTimesheetCaseNotes تخطّت اليوم المراجَع كما هو متوقّع' : 'خلل: الملاحظة تغيّرت رغم review_status=reviewed']);
    const pass = T.filter(t => t[1]).length;
    return { T, pass, total: T.length };
  }

  function testsView() {
    const d = data();
    if (!d.transactions.length) return emptyState();
    const r = runTests();
    const rows = r.T.map((t, i) => '<tr class="' + (t[1] ? 'ok' : 'fail') + '"><td>' + (i + 1) + '</td><td>' + (t[1] ? '✅' : '❌') + '</td><td>' + esc(t[0]) + '</td><td>' + esc(t[2] || '') + '</td></tr>').join('');
    return '<div class="ws-test-head ' + (r.pass === r.total ? 'all-ok' : '') + '"><h3>' + r.pass + ' / ' + r.total + ' اختبار ناجح</h3></div>'
      + '<table class="ws-table"><thead><tr><th>#</th><th>الحالة</th><th>الاختبار</th><th>التفاصيل</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function payrollView() {
    const db = window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
    if (!db.payroll_periods) db.payroll_periods = [];
    if (!db.employee_payroll_closings) db.employee_payroll_closings = [];
    if (!db.payroll_payments) db.payroll_payments = [];

    const period = db.payroll_periods.find(p => Number(p.year) === Number(selectedPayrollYear) && Number(p.month) === Number(selectedPayrollMonth));
    const status = period ? period.status : 'draft';
    
    let closings = [];
    if (period && period.status !== 'draft') {
      closings = db.employee_payroll_closings.filter(c => c.payrollPeriodId === period.id);
    } else if (payrollPreviewCache && (payrollPreviewCache.period === `${selectedPayrollYear}-${String(selectedPayrollMonth).padStart(2, '0')}`)) {
      closings = payrollPreviewCache.closings;
    }

    const years = [2026, 2025];
    const months = [
      { v: 1, n: 'كانون الثاني (1)' },
      { v: 2, n: 'شباط (2)' },
      { v: 3, n: 'آذار (3)' },
      { v: 4, n: 'نيسان (4)' },
      { v: 5, n: 'أيار (5)' },
      { v: 6, n: 'حزيران (6)' },
      { v: 7, n: 'تموز (7)' },
      { v: 8, n: 'آب (8)' },
      { v: 9, n: 'أيلول (9)' },
      { v: 10, n: 'تشرين الأول (10)' },
      { v: 11, n: 'تشرين الثاني (11)' },
      { v: 12, n: 'كانون الأول (12)' }
    ];

    const yearOpts = years.map(y => `<option value="${y}" ${y === selectedPayrollYear ? 'selected' : ''}>${y}</option>`).join('');
    const monthOpts = months.map(m => `<option value="${m.v}" ${m.v === selectedPayrollMonth ? 'selected' : ''}>${m.n}</option>`).join('');

    const filterToolbar = `
      <div class="ws-toolbar" style="gap: 12px; margin-bottom: 20px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>السنة:</span>
          <select class="ws-input" style="min-width:80px;" onchange="wsSetPayrollYear(this.value)">${yearOpts}</select>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span>الشهر:</span>
          <select class="ws-input" style="min-width:180px;" onchange="wsSetPayrollMonth(this.value)">${monthOpts}</select>
        </div>
      </div>
    `;

    const statusBadges = {
      draft: '<span class="ws-badge warn">مسودة (غير مغلق)</span>',
      closed: '<span class="ws-badge done">مغلق (غير مرحل محاسبياً)</span>',
      posted: '<span class="ws-badge cash">مرحّل محاسبياً</span>',
      locked: '<span class="ws-badge done" style="background:#6b7280; color:#fff;">مقفل نهائياً</span>'
    };

    let periodHeader = `
      <div class="ws-panel" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h3 style="margin:0 0 6px 0;"><i class="fa-solid fa-calendar-check"></i> دورة رواتب شهر ${selectedPayrollMonth} / ${selectedPayrollYear}</h3>
          <div style="display:flex; gap:12px; font-size:0.82rem; color:var(--text-muted);">
            <span>حالة الدورة: ${statusBadges[status]}</span>
            ${period ? `<span>تاريخ الإقفال: ${esc(period.closedAt?.slice(0,10))}</span>` : ''}
            ${period && period.postedMoveId ? `<span>قيد الاستحقاق: <strong class="mono">${esc(period.postedMoveId)}</strong></span>` : ''}
            ${period && period.advanceSettlementMoveId ? `<span>قيد تسوية السلف: <strong class="mono">${esc(period.advanceSettlementMoveId)}</strong></span>` : ''}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
    `;

    if (status === 'draft') {
      if (payrollPreviewCache && (payrollPreviewCache.period === `${selectedPayrollYear}-${String(selectedPayrollMonth).padStart(2, '0')}`)) {
        periodHeader += `
          <button class="ws-btn primary" onclick="wsClosePayrollPeriod()"><i class="fa-solid fa-lock"></i> إغلاق الشهر واعتماد الرواتب</button>
          <button class="ws-btn" style="background:#6b7280;" onclick="wsClearPayrollPreview()"><i class="fa-solid fa-xmark"></i> إلغاء المعاينة</button>
        `;
      } else {
        periodHeader += `
          <button class="ws-btn primary" onclick="wsCalculatePayrollPeriod()"><i class="fa-solid fa-calculator"></i> معاينة واحتساب رواتب الشهر</button>
        `;
      }
    } else if (status === 'closed') {
      periodHeader += `
        <button class="ws-btn primary" onclick="wsPostPayrollAccrual('${period.id}')"><i class="fa-solid fa-paper-plane"></i> ترحيل قيود الاستحقاق والتسوية</button>
        <button class="ws-btn" style="background:#dc2626;" onclick="wsReopenPayrollPeriod('${period.id}')"><i class="fa-solid fa-rotate-left"></i> إعادة فتح الفترة</button>
      `;
    } else if (status === 'posted') {
      periodHeader += `
        <button class="ws-btn" style="background:#dc2626;" onclick="wsReopenPayrollPeriod('${period.id}')"><i class="fa-solid fa-rotate-left"></i> إعادة فتح الفترة وإلغاء القيود</button>
      `;
    }
    periodHeader += `</div></div>`;

    if (closings.length === 0) {
      return filterToolbar + periodHeader + `
        <div class="ws-panel" style="text-align:center; padding:40px; color:var(--text-muted);">
          ${status === 'draft' ? 'لم يتم احتساب أو إغلاق هذا الشهر بعد. انقر على "معاينة واحتساب" لمعاينة رواتب الموظفين بناءً على سجلات الدوام والسلف الحالية.' : 'لا توجد قيود إقفال متوفرة لهذه الفترة.'}
        </div>
      `;
    }

    const totalAccrued = closings.reduce((sum, row) => sum + Number(row.netAccruedSalary || 0), 0);
    const totalAdvances = closings.reduce((sum, row) => sum + Number(row.advanceSettlementAmount || 0), 0);
    const totalPayable = closings.reduce((sum, row) => sum + Number(row.netPayableAfterAdvanceSettlement || 0), 0);
    const totalPaid = closings.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0);
    const totalRemaining = closings.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0);

    const kpiCards = `
      <div class="ws-kpis" style="margin-bottom: 20px;">
        <div class="ws-kpi">
          <div class="ws-kpi-v" style="color:var(--primary);">${fmt(totalAccrued)}</div>
          <div class="ws-kpi-l">إجمالي الرواتب المستحقة (Dr 5101)</div>
        </div>
        <div class="ws-kpi">
          <div class="ws-kpi-v" style="color:#d97706;">${fmt(totalAdvances)}</div>
          <div class="ws-kpi-l">إقفال سلف الموظفين (Cr 1102)</div>
        </div>
        <div class="ws-kpi">
          <div class="ws-kpi-v" style="color:#2563eb;">${fmt(totalPayable)}</div>
          <div class="ws-kpi-l">صافي الرواتب المستحقة للدفع (Cr 2100)</div>
        </div>
        <div class="ws-kpi">
          <div class="ws-kpi-v" style="color:#16a34a;">${fmt(totalPaid)}</div>
          <div class="ws-kpi-l">المدفوع نقداً/بنكياً (Cr 1001/1002)</div>
        </div>
        <div class="ws-kpi">
          <div class="ws-kpi-v" style="color:${totalRemaining > 0 ? '#dc2626' : '#16a34a'};">${fmt(totalRemaining)}</div>
          <div class="ws-kpi-l">المتبقي المطلوب سداده</div>
        </div>
      </div>
    `;

    const rows = closings.map(row => {
      const remaining = Number(row.remainingAmount || 0);
      let payAction = '';
      
      if (status === 'posted' && remaining > 0) {
        payAction = `<button class="ws-mini" onclick="wsPaySalary('${row.id}', ${remaining}, '${esc(row.employeeNameSnapshot)}')"><i class="fa-solid fa-wallet"></i> دفع راتب</button>`;
      }

      const statusLabels = {
        calculated: '<span class="ws-badge warn">مسودة</span>',
        approved: '<span class="ws-badge done">معتمد</span>',
        posted: '<span class="ws-badge cash">مرحّل</span>',
        paid: '<span class="ws-badge done">مسدد بالكامل</span>',
        partially_paid: '<span class="ws-badge warn" style="background:#fed7aa; color:#9a3412;">مسدد جزئياً</span>'
      };

      const auditTrailBtn = `<button class="ws-mini" onclick="wsViewEmpPayrollAudit('${row.employeeId}', '${row.employeeNameSnapshot}')"><i class="fa-solid fa-magnifying-glass"></i> كشف</button>`;

      const detailChips = [
        ['إجمالي الاستحقاق', row.grossSalary],
        ['خصومات الراتب', row.salaryDeductions],
        ['المكافآت', row.bonuses],
        ['العقوبات والغياب', row.penalties],
        ['أضرار/استقطاعات أخرى', row.damageDeductions],
        ['سلف رسمية من القاصة', row.advanceSettlementAmount],
        ['سلف يدوية من التايم شيت', row.legacyTimesheetAdvancesSnapshot],
        ['رصيد سابق بذمة الموظف', row.previousEmployeeDebt],
        ['رصيد سابق لصالح الموظف', row.previousCompanyPayable],
        ['إضافي', `${Number(row.overtimeHours || 0).toFixed(1)} ساعة`],
        ['تأخير', `${Number(row.lateMinutes || 0)} دقيقة`],
        ['جمع عملها', row.fridayWorkDays],
      ].map(([label, value]) => `<span><b>${esc(label)}:</b> ${typeof value === 'number' ? fmt(value) : esc(value == null ? '' : value)}</span>`).join('');

      return `<tr>
        <td><strong>${esc(row.employeeNameSnapshot)}</strong></td>
        <td class="num">${fmt(row.baseSalarySnapshot)}</td>
        <td>${row.attendanceDays} يوم د / ${row.absenceDays} غ</td>
        <td class="num" style="color:var(--text-color); font-weight:600;">${fmt(row.netAccruedSalary)}</td>
        <td class="num" style="color:#d97706;">${fmt(row.advanceSettlementAmount)}</td>
        <td class="num" style="color:#2563eb; font-weight:600;">${fmt(row.netPayableAfterAdvanceSettlement)}</td>
        <td class="num" style="color:#16a34a;">${fmt(row.paidAmount)}</td>
        <td class="num" style="color:${remaining > 0 ? '#dc2626' : '#16a34a'}; font-weight:600;">${fmt(remaining)}</td>
        <td>${statusLabels[row.status] || row.status}</td>
        <td><div style="display:flex; gap:6px;">${payAction} ${auditTrailBtn}</div></td>
      </tr>
      <tr class="ws-payroll-detail-row">
        <td colspan="10">
          <div class="ws-payroll-detail-grid">${detailChips}</div>
        </td>
      </tr>`;
    }).join('');

    const closingsTable = `
      <div class="ws-panel">
        <h3><i class="fa-solid fa-users-line"></i> كشف مستحقات رواتب الموظفين</h3>
        <table class="ws-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الراتب الأساسي</th>
              <th>الحضور والغياب</th>
              <th>الراتب المستحق (Gross)</th>
              <th>السلف المستقطعة</th>
              <th>الصافي المستحق (Net)</th>
              <th>المدفوع</th>
              <th>المتبقي ذمة</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    return filterToolbar + periodHeader + kpiCards + closingsTable;
  }

  /* ───────── payroll view actions ───────── */
  window.wsSetPayrollYear = function (y) {
    selectedPayrollYear = Number(y);
    payrollPreviewCache = null;
    render();
  };

  window.wsSetPayrollMonth = function (m) {
    selectedPayrollMonth = Number(m);
    payrollPreviewCache = null;
    render();
  };

  window.wsCalculatePayrollPeriod = async function () {
    try {
      const preview = await window.calculatePayrollPeriod(selectedPayrollYear, selectedPayrollMonth);
      payrollPreviewCache = preview;
      render();
      toast('تم احتساب دورة الرواتب بنجاح كمسودة للمعاينة', 'success');
    } catch (e) {
      toast(e.message || 'فشل احتساب الرواتب', 'danger');
    }
  };

  window.wsClearPayrollPreview = function () {
    payrollPreviewCache = null;
    render();
  };

  window.wsClosePayrollPeriod = async function () {
    try {
      await window.closePayrollPeriod(selectedPayrollYear, selectedPayrollMonth, {
        reason: `إغلاق دورة الرواتب لشهر ${selectedPayrollMonth}/${selectedPayrollYear} عبر لوحة دورات الرواتب`
      });
      payrollPreviewCache = null;
      render();
      toast('تم إغلاق دورة الرواتب بنجاح ✅', 'success');
    } catch (e) {
      toast(e.message || 'فشل إغلاق دورة الرواتب', 'danger');
    }
  };

  window.wsPostPayrollAccrual = async function (periodId) {
    try {
      await window.postPayrollAccrual(periodId);
      render();
      toast('تم ترحيل قيد استحقاق وتسوية السلف بنجاح ✅', 'success');
    } catch (e) {
      toast(e.message || 'فشل ترحيل القيود', 'danger');
    }
  };

  window.wsPaySalary = async function (closingId, maxAmount, empName) {
    const amtStr = prompt(`أدخل مبلغ الدفع المالي للموظف ${empName} (الحد الأقصى: ${fmt(maxAmount)} د.ع):`, String(maxAmount));
    if (amtStr === null) return;
    const amount = Number(amtStr.replace(/,/g, '').trim());
    if (isNaN(amount) || amount <= 0) {
      alert('الرجاء إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }
    if (amount > maxAmount) {
      alert('المبلغ المدخل أكبر من المتبقي المستحق للموظف');
      return;
    }

    const acc = confirm('هل تريد الدفع من قاصة الورشة (cash_workshop)؟\nاضغط موافق (OK) للقاصة، أو إلغاء (Cancel) للدفع من الحساب البنكي (bank_account)')
      ? 'cash_workshop'
      : 'bank_account';

    try {
      await window.settlePayrollPayment(closingId, amount, acc);
      render();
      toast('تم تسديد دفعة الراتب بنجاح ✅', 'success');
    } catch (e) {
      toast(e.message || 'تعذر تسديد الدفعة', 'danger');
    }
  };

  window.wsReopenPayrollPeriod = async function (periodId) {
    const reason = prompt('أدخل سبب إعادة فتح الفترة (إجباري لإلغاء إقفال الفترة والقيود):');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('يجب إدخال سبب لإعادة فتح الفترة');
      return;
    }

    try {
      await window.reopenPayrollPeriod(periodId, reason);
      render();
      toast('تمت إعادة فتح الفترة بنجاح وإلغاء القيود المحاسبية المتعلقة بها', 'success');
    } catch (e) {
      toast(e.message || 'فشل إعادة فتح الفترة', 'danger');
    }
  };

  window.wsViewEmpPayrollAudit = function (empId, empName) {
    const db = window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
    const logs = (db.audit_log || []).filter(l => 
      (l.entityType === 'employee_payroll_closing' || l.entityType === 'payroll_payment') &&
      l.afterSnapshot && (l.afterSnapshot.employeeId === empId || l.afterSnapshot.employeeNameSnapshot === empName)
    );

    if (logs.length === 0) {
      alert(`لا يوجد سجل تعديلات محاسبي خاص بالموظف ${empName} بعد.`);
      return;
    }

    const trail = logs.map(l => 
      `- [${l.createdAt.slice(0, 16).replace('T', ' ')}] الإجراء: ${l.action}\n  السبب: ${l.reason || '—'}\n  التفاصيل: ${JSON.stringify(l.afterSnapshot)}`
    ).join('\n\n');

    alert(`سجل التعديلات والمدفوعات لـ ${empName}:\n\n${trail}`);
  };

  function emptyState() { return '<div class="ws-empty"><i class="fa-solid fa-database"></i><p>لا توجد بيانات بعد. افتح «استيراد البيانات» ونفّذ الاستيراد الرسمي.</p><button class="ws-btn" onclick="wsSetView(\'import\')">الذهاب للاستيراد</button></div>'; }

  function render() {
    const body = document.getElementById('wsLedgerBody');
    if (!body) return;
    ensureChart();
    let content = '';
    switch (activeView) {
      case 'import': content = importView(); break;
      case 'transactions': content = transactionsView(); break;
      case 'cashbox': content = cashboxView(); break;
      case 'advances': content = advancesView(); break;
      case 'timesheet': content = timesheetView(); break;
      case 'payroll': content = payrollView(); break;
      case 'hussein': content = husseinView(); break;
      case 'tests': content = testsView(); break;
      case 'audit': content = auditView(); break;
    }
    body.innerHTML = kpiStrip() + tabsBar() + '<div class="ws-content">' + content + '</div>';
  }

  /* ───────── exposed actions ───────── */
  window.wsSetView = function (v) { activeView = v; render(); };
  window.wsTxFilter = function (k, v) { txFilter[k] = v; render(); };
  window.wsAdvEmp = function (v) { advEmployee = v; render(); };
  window.wsTsEmp = function (v) { tsEmployee = v; render(); };
  window.wsTsMonth = function (v) { tsMonth = v; render(); };
  window.wsRollback = function (id) { rollbackBatch(id); };

  // mark an open ERP timesheet case as manually decided — never deletes the
  // case row, just flips its status (audit-logged) so it drops out of "open".
  window.wsCaseResolve = function (num) {
    const c = data().timesheetCases.find(x => x.num === num);
    if (!c) return;
    const old = c.status;
    c.status = 'محسوم يدويًا بواسطة ' + currentUserName();
    logAudit('timesheetCase', String(num), 'status', old, c.status, 'حسم يدوي من لوحة حالات التايم شيت');
    save(); render();
    toast('تم وضع علامة «محسوم» على الحالة #' + num, 'success');
  };

  // 3-click note review: yellow → (3 clicks) → green; never deletes the note
  // Pure decision logic for the 3-click note review, extracted so runTests()
  // can verify the real rule against synthetic/cloned state without ever
  // mutating a live attendanceDay (system_check promises "بدون تعديل بيانات
  // التشغيل" — calling the live handler from a test would break that).
  // Never mutates its input; wsNoteClick applies the result.
  function noteClickTransition(a) {
    if (!a || !a.note) return { changed: false };
    if (a.review_status === 'reviewed') return { changed: false, alreadyReviewed: true };
    const clicks = (a.review_click_count || 0) + 1;
    if (clicks >= 3) return { changed: true, reviewed: true, review_click_count: clicks };
    return { changed: true, reviewed: false, review_click_count: clicks };
  }

  window.wsNoteClick = function (id) {
    const a = data().attendanceDays.find(x => x.id === id);
    if (!a) return;
    const t = noteClickTransition(a);
    if (!t.changed) { if (t.alreadyReviewed) toast('الملاحظة مُراجَعة بالفعل (خضراء)', 'info'); return; }
    a.review_click_count = t.review_click_count;
    if (t.reviewed) {
      a.review_status = 'reviewed'; a.reviewed_by = currentUserName(); a.reviewed_at = nowISO();
      logAudit('attendanceDay', a.id, 'review_status', 'pending', 'reviewed', 'مراجعة بالضغط 3 مرات');
      toast('تمت مراجعة الملاحظة ✅ (خضراء)', 'success');
    } else {
      toast('اضغط ' + (3 - a.review_click_count) + ' مرة أخرى للمراجعة', 'info');
    }
    save(); render();
  };

  // Pure decision logic for whether editing a day's status reverts a reviewed
  // note back to pending (yellow). Same extraction rationale as noteClickTransition.
  function dayStatusReviewImpact(a) {
    if (!a || a.review_status !== 'reviewed') return { reverts: false };
    return { reverts: true, needsNote: !a.note };
  }

  // editing a reviewed day reverts the note to yellow (data changed → needs re-review)
  window.wsSetDayStatus = function (id, status) {
    if (!status) return;
    const a = data().attendanceDays.find(x => x.id === id);
    if (!a) return;
    const old = a.status;
    logAudit('attendanceDay', a.id, 'status', old, status, 'تحويل يدوي للحالة');
    a.status = status; a.manual_override = status;
    const impact = dayStatusReviewImpact(a);
    if (impact.reverts) {
      a.review_status = 'pending'; a.review_click_count = 0; a.reviewed_by = ''; a.reviewed_at = '';
      if (impact.needsNote) a.note = 'تم تعديل اليوم — يحتاج مراجعة جديدة';
      logAudit('attendanceDay', a.id, 'review_status', 'reviewed', 'pending', 'البيانات تغيّرت بعد المراجعة');
    }
    save(); render();
    toast('تم تحويل اليوم إلى «' + status + '»', 'success');
  };

  window.wsExportAdvances = function () {
    const d = data();
    const rows = [['التاريخ', 'الموظف', 'النوع', 'المبلغ', 'الحركة المالية', 'البيان']];
    d.advances.forEach(a => rows.push([a.date, a.employee_name, a.advance_type, a.amount, a.transaction_code || '', (a.statement || '').replace(/[\n,]/g, ' ')]));
    const csv = '﻿' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'workshop_advances.csv'; link.click(); URL.revokeObjectURL(url);
    toast('تم تصدير السلف CSV', 'success');
  };

  /* ───────── navigation wiring (proven appointments pattern) ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || (window.PermissionService.checkPage ? window.PermissionService.checkPage('workshop_ledger') : true);
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageWorkshopLedger');
    const nav = document.getElementById('navWorkshopLedger');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('workshop_ledger'); } catch (_) {} }
    window.currentPage = 'workshop_ledger';
    render();
    return !!pg;
  }
  function wireSwitch() {
    if (window.__wsLedgerWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'workshop_ledger') {
        try { if (activatePage()) return; } catch (e) { console.warn('wsLedger render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__wsLedgerWrapped = true;
  }
  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_workshop_ledger) return;
      JarvisBrain.tools.report_workshop_ledger = {
        desc_en: 'Workshop ledger summary: cashbox balance, advances, food, Hussein net, acceptance tests.',
        risk: 'safe', params: {},
        run: function () {
          const d = data(); const hs = husseinSummary(); const r = runTests();
          // cashboxApproved must come from the imported source's reconciliation —
          // never a literal. null tells the caller the reference isn't loaded yet,
          // which is honest; a stale constant would misreport an approved figure.
          const recon = (previewCache && previewCache.reconciliation) || d.reconciliation || {};
          return {
            transactions: d.transactions.length, cashAdvances: d.advances.filter(a => a.advance_type === 'سلفة نقدية').reduce((s, a) => s + a.amount, 0),
            food: d.foodAllocations.reduce((s, a) => s + a.share, 0), husseinNet: hs.net,
            cashboxApproved: recon.cashboxFinal != null ? recon.cashboxFinal : null, acceptanceTests: r.pass + '/' + r.total
          };
        }
      };
    } catch (_) {}
  }
  function init() {
    ensureChart();
    wireSwitch(); registerJarvis();
    let tries = 0;
    const t = setInterval(() => { tries++; wireSwitch(); registerJarvis(); if (window.__wsLedgerWrapped || tries > 40) clearInterval(t); }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonWorkshopLedger = {
    data, render, runTests, buildRecords, loadDataset,
    open: function () { try { window.switchPage('workshop_ledger'); } catch (_) {} }
  };
})();
