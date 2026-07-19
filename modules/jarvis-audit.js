/**
 * OCTAGON OMNISYSTEM - modules/jarvis-audit.js
 *
 * Omni Business Audit Layer (Phase: production ERP assistant).
 *
 * READ-ONLY audit mode + APPROVAL-GATED drafting on top of modules/jarvis-brain.js:
 *   - audit_salary_explain          : explain an employee's salary for a month via the
 *                                     SAME engine the calculator uses (no mutation).
 *   - audit_advances                : advance totals (finance + timesheet) + suspected
 *                                     duplicate advances (same person/date/amount).
 *   - audit_fingerprints            : missing fingerprint (check-in/out) review notes.
 *   - audit_finance_reconciliation  : cashboxEffect income/expense/net + final cashbox,
 *                                     Excel review-note count, duplicate-advance count.
 *   - draft_task / draft_finance_review / draft_timesheet_correction :
 *                                     drafts that ONLY enter the approval queue.
 *
 * HARD SAFETY RULES (do not weaken):
 *   - No function in this file writes to employees, finance, cashbox, permissions,
 *     or attendance. The only side effect allowed is JarvisBrain.queueApproval(...).
 *   - Every answer carries evidence: { source, employee, period, totals, reviewNotes }.
 *   - Excel import is the source of truth through 2026-06-30; when an answer relies
 *     on imported review notes, evidence.fromReviewNotes === true and the UI warns.
 *
 * Node-safe: no unguarded document/localStorage access, so the vm regression
 * harness (scripts/jarvis-audit-regression.mjs) can load it headlessly.
 */
(function () {
  'use strict';

  // ---- tiny utils -----------------------------------------------------------
  function lang() {
    try {
      if (window.__jarvisReplyLang === 'en' || window.__jarvisReplyLang === 'ar') return window.__jarvisReplyLang;
      if (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang === 'en') return 'en';
    } catch (_) {}
    return 'ar';
  }
  function t(ar, en) { return lang() === 'en' ? en : ar; }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function brain() { try { return window.JarvisBrain || null; } catch (_) { return null; } }
  function fmt(v) {
    const B = brain();
    if (B && typeof B.formatJarvisNumber === 'function') return B.formatJarvisNumber(v);
    try { return Math.round(num(v)).toLocaleString('en-US'); } catch (_) { return String(Math.round(num(v))); }
  }
  function monthLabel(month, year) { return String(month).padStart(2, '0') + '/' + String(year); }

  function employeeList() {
    const B = brain();
    if (B && typeof B.employeeList === 'function') { const l = B.employeeList(); if (Array.isArray(l) && l.length) return l; }
    try { if (Array.isArray(window.employees)) return window.employees; } catch (_) {}
    return [];
  }

  function financeState() {
    try { if (typeof window.ensureFinance === 'function') { const f = window.ensureFinance(); if (f) return f; } } catch (_) {}
    try { if (window.finance && typeof window.finance === 'object') return window.finance; } catch (_) {}
    return { cashOpening: 0, transactions: [] };
  }
  function financeTransactions() {
    const f = financeState();
    return Array.isArray(f.transactions) ? f.transactions : [];
  }

  // Mirrors app.js getCashboxSignedAmount(): cashboxEffect wins, else direction.
  function cashboxSigned(tx) {
    const effect = Number(tx && tx.cashboxEffect);
    if (Number.isFinite(effect) && effect !== 0) return Math.round(effect);
    const amount = Math.round(num(tx && tx.amount));
    if (tx && tx.direction === 'in') return amount;
    if (tx && tx.direction === 'out') return -amount;
    return 0;
  }
  function cashboxTotals() {
    // Prefer the live app engine so the numbers ALWAYS match the finance dashboard.
    try {
      if (typeof window.getCashboxTotals === 'function') {
        const totals = window.getCashboxTotals();
        if (totals && Number.isFinite(Number(totals.in))) return { in: num(totals.in), out: num(totals.out), engine: 'app' };
      }
    } catch (_) {}
    const acc = { in: 0, out: 0, engine: 'audit_fallback' };
    financeTransactions().forEach(tx => {
      if (!tx || tx.sourceType !== 'cashbox') return;
      const signed = cashboxSigned(tx);
      if (signed > 0) acc.in += signed;
      if (signed < 0) acc.out += Math.abs(signed);
    });
    return acc;
  }
  function cashBalance(totals) {
    try {
      if (typeof window.getCashBalance === 'function') {
        const b = window.getCashBalance();
        if (Number.isFinite(Number(b))) return num(b);
      }
    } catch (_) {}
    const tt = totals || cashboxTotals();
    return num(financeState().cashOpening) + tt.in - tt.out;
  }

  // ---- period parsing (only filter when the user explicitly gave a month) ----
  function explicitPeriod(raw, args) {
    args = args || {};
    if (args.month && args.year) return { month: Number(args.month), year: Number(args.year) };
    const s = String(raw || '');
    let m = s.match(/\b(20\d{2})[-\/](0?[1-9]|1[0-2])\b/);
    if (m) return { year: Number(m[1]), month: Number(m[2]) };
    m = s.match(/\b(0?[1-9]|1[0-2])[-\/](20\d{2})\b/);
    if (m) return { year: Number(m[2]), month: Number(m[1]) };
    m = s.match(/(?:شهر|month)\s*(0?[1-9]|1[0-2])\D{0,12}(20\d{2})/i);
    if (m) return { month: Number(m[1]), year: Number(m[2]) };
    return null;
  }
  function recordInPeriod(rec, period) {
    if (!period) return true;
    if (!rec) return false;
    if (rec.year != null && rec.month != null) return Number(rec.year) === period.year && Number(rec.month) === period.month;
    const d = String(rec.date || '');
    return d.includes(String(period.year)) && (d.match(/[\/-](\d{1,2})[\/-]/) ? Number(d.match(/[\/-](\d{1,2})[\/-]/)[1]) === period.month : false);
  }
  function txInPeriod(tx, period) {
    if (!period) return true;
    const d = String(tx && tx.date || ''); // ISO YYYY-MM-DD from the Excel import
    return d.startsWith(period.year + '-' + String(period.month).padStart(2, '0'));
  }

  // ---- employee matching (name + Excel aliases) ------------------------------
  function normName(v) {
    const B = brain();
    if (B && typeof B.normalizePersonName === 'function') return B.normalizePersonName(v);
    return String(v || '').toLowerCase().trim();
  }
  function employeeMatchers(emp) {
    const names = [emp && emp.name, emp && emp.sourceName].concat(Array.isArray(emp && emp.aliases) ? emp.aliases : []);
    return names.map(normName).filter(Boolean);
  }
  function txBelongsToEmployee(tx, emp) {
    const party = normName(tx && (tx.partyName || tx.paidByName));
    if (!party) return false;
    return employeeMatchers(emp).some(n => party === n || party.includes(n) || n.includes(party));
  }
  function resolveEmployee(args, raw) {
    const B = brain();
    const requested = (args && (args.employee_name || args.employee || args.name)) ||
      (B && typeof B.findEmployeeMention === 'function' ? B.findEmployeeMention(raw) : '');
    if (!requested) return { employee: null, requested: '' };
    if (B && typeof B.findEmployeeByName === 'function') {
      const m = B.findEmployeeByName(requested);
      return { employee: m.employee || null, requested, candidates: m.candidates || [] };
    }
    const wanted = normName(requested);
    return { employee: employeeList().find(e => normName(e && e.name) === wanted) || null, requested };
  }

  // ---- review-note extraction -------------------------------------------------
  function recordNotes(rec) { return String(rec && (rec.notes || rec.note || '') || '').trim(); }
  function isFingerprintNote(txt) { return /بصمة|fingerprint/i.test(txt); }
  function missingPunch(rec) {
    if (!rec || rec.status === 'friday' || rec.status === 'absent' || rec.status === 'leave') return '';
    const inP = String(rec.checkIn || '').trim(), outP = String(rec.checkOut || '').trim();
    if (inP && !outP) return 'out';
    if (!inP && outP) return 'in';
    return '';
  }

  // ==========================================================================
  // AUDIT 1 — salary explanation by month (same engine as the calculator)
  // ==========================================================================
  function salaryExplain(args) {
    args = args || {};
    const raw = String(args.query || args.text || '');
    const B = brain();
    if (!B) return { ok: false, message: t('عقل أومني غير محمّل.', 'Omni brain is not loaded.') };

    const who = resolveEmployee(args, raw);
    if (!who.employee) {
      const near = (who.candidates || []).map(e => e && e.name).filter(Boolean).slice(0, 4).join('، ');
      return { ok: false, audit: true, message: t(`لم أجد الموظف${who.requested ? ` "${who.requested}"` : ''}.`, `Employee not found${who.requested ? ` "${who.requested}"` : ''}.`) + (near ? t(` أقرب أسماء: ${near}.`, ` Closest: ${near}.`) : '') };
    }
    const emp = who.employee;
    const period = (typeof B.resolvePayrollPeriod === 'function') ? B.resolvePayrollPeriod(args, raw) : (explicitPeriod(raw, args) || { month: new Date().getMonth() + 1, year: new Date().getFullYear() });
    const payroll = B.calculateEmployeePayrollReadOnly(emp, period.year, period.month);
    const res = payroll.result || {};
    const records = payroll.records || [];

    // Evidence: review notes + missing punches inside the month.
    const noted = records.filter(r => recordNotes(r));
    const missing = records.filter(r => missingPunch(r));
    const advTotal = records.reduce((s, r) => s + num(r.advance), 0);
    const penTotal = records.reduce((s, r) => s + num(r.penalty) + num(r.damage), 0);
    const bonTotal = records.reduce((s, r) => s + num(r.bonus), 0);
    // Finance-side advances for the same month (cross-source check).
    const finAdv = financeTransactions().filter(tx => tx && tx.type === 'advance' && txInPeriod(tx, period) && txBelongsToEmployee(tx, emp));
    const finAdvTotal = finAdv.reduce((s, tx) => s + num(tx.amount), 0);

    const label = monthLabel(period.month, period.year);
    const lines = [];
    if (!records.length) {
      lines.push(t(`"${emp.name}": لا توجد سجلات تايم شيت لشهر ${label}. الراتب الاسمي المسجل ${fmt(emp.salary)} د.ع.`,
                   `"${emp.name}": no timesheet records for ${label}. Registered nominal salary ${fmt(emp.salary)} IQD.`));
    } else {
      lines.push(t(`راتب ${emp.name} لشهر ${label} (نفس محرك الحاسبة):`, `${emp.name} salary for ${label} (same engine as the calculator):`));
      lines.push(t(`• الاسمي ${fmt(res.nominalSalary || payroll.cfg.nominalSalary)} د.ع | حضور ${num(res.attendanceDays)} يوم | غياب ${num(res.absentDays)} | إجازة ${num(res.leaveDays)}`,
                   `• Nominal ${fmt(res.nominalSalary || payroll.cfg.nominalSalary)} IQD | attendance ${num(res.attendanceDays)} | absent ${num(res.absentDays)} | leave ${num(res.leaveDays)}`));
      lines.push(t(`• استحقاق ${fmt(res.totalEarnings)} − استقطاعات ${fmt(res.totalDeductions)} = الصافي ${fmt(res.finalSalary)} د.ع`,
                   `• Earnings ${fmt(res.totalEarnings)} − deductions ${fmt(res.totalDeductions)} = net ${fmt(res.finalSalary)} IQD`));
      lines.push(t(`• سلف الشهر (تايم شيت) ${fmt(advTotal)} | غرامات/أضرار ${fmt(penTotal)} | مكافآت ${fmt(bonTotal)}`,
                   `• Month advances (timesheet) ${fmt(advTotal)} | penalties/damage ${fmt(penTotal)} | bonuses ${fmt(bonTotal)}`));
      if (finAdv.length) lines.push(t(`• سلف مسجلة بالمالية لنفس الشهر: ${finAdv.length} حركة بمجموع ${fmt(finAdvTotal)} د.ع`,
                                      `• Finance-side advances same month: ${finAdv.length} tx totaling ${fmt(finAdvTotal)} IQD`));
    }
    if (noted.length) lines.push(t(`⚠️ ${noted.length} يوم عليه ملاحظة مراجعة من ملف الإكسل (منها بصمات ناقصة: ${missing.length}).`,
                                   `⚠️ ${noted.length} day(s) carry Excel review notes (${missing.length} missing punches).`));

    return {
      ok: true,
      audit: true,
      message: lines.join('\n'),
      evidence: {
        source: ['timesheet', 'calculator'],
        sourceLabel: t('التايم شيت + حاسبة الرواتب', 'Timesheet + payroll calculator'),
        employee: emp.name,
        employeeId: emp.id || '',
        period: label,
        engine: payroll.engine || 'unknown',
        totals: {
          recordsCount: records.length,
          nominalSalary: num(res.nominalSalary || payroll.cfg.nominalSalary || emp.salary),
          attendanceDays: num(res.attendanceDays),
          absentDays: num(res.absentDays),
          totalEarnings: num(res.totalEarnings),
          totalDeductions: num(res.totalDeductions),
          finalSalary: num(res.finalSalary),
          monthAdvances: advTotal,
          financeAdvances: finAdvTotal
        },
        reviewNotes: noted.length,
        missingPunches: missing.length,
        fromReviewNotes: noted.length > 0,
        notesSample: noted.slice(0, 3).map(r => (r.date || '') + ': ' + recordNotes(r).slice(0, 80))
      },
      links: [
        { page: 'timesheet', label: t('فتح التايم شيت', 'Open timesheet') },
        { page: 'calculator', label: t('فتح حاسبة الرواتب', 'Open calculator') }
      ]
    };
  }

  // ==========================================================================
  // AUDIT 2 — advance totals + suspected duplicates
  // ==========================================================================
  function advancesCore(period, emp) {
    const advTx = financeTransactions().filter(tx => tx && tx.type === 'advance' && txInPeriod(tx, period) && (!emp || txBelongsToEmployee(tx, emp)));
    const financeTotal = advTx.reduce((s, tx) => s + num(tx.amount), 0);
    const groups = {};
    advTx.forEach(tx => {
      const party = String(tx.partyName || '').trim();
      const amount = num(tx.amount);
      if (!party || amount <= 0) return;
      const key = normName(party) + '|' + String(tx.date || '') + '|' + amount;
      (groups[key] = groups[key] || { party, date: String(tx.date || ''), amount, count: 0, ids: [] }).count++;
      groups[key].ids.push(tx.id || '');
    });
    const duplicates = Object.keys(groups).map(k => groups[k]).filter(g => g.count > 1)
      .sort((a, b) => (b.amount * b.count) - (a.amount * a.count));
    let timesheetTotal = 0;
    (emp ? [emp] : employeeList()).forEach(e => {
      (Array.isArray(e && e.records) ? e.records : []).forEach(r => { if (recordInPeriod(r, period)) timesheetTotal += num(r.advance); });
    });
    const reviewFlagged = advTx.filter(tx => String(tx.review || '').trim()).length;
    return { advTx, financeTotal, timesheetTotal, duplicates, reviewFlagged };
  }

  function advancesAudit(args) {
    args = args || {};
    const raw = String(args.query || args.text || '');
    const period = explicitPeriod(raw, args);
    const who = resolveEmployee(args, raw);
    const core = advancesCore(period, who.employee);
    const scope = who.employee ? t(`للموظف ${who.employee.name}`, `for ${who.employee.name}`) : t('لكل الموظفين', 'for all employees');
    const when = period ? monthLabel(period.month, period.year) : t('كل الفترة المستوردة', 'entire imported period');

    const lines = [];
    lines.push(t(`تدقيق السلف ${scope} (${when}):`, `Advance audit ${scope} (${when}):`));
    lines.push(t(`• حركات سلف بالمالية: ${core.advTx.length} بمجموع ${fmt(core.financeTotal)} د.ع`,
                 `• Finance advance tx: ${core.advTx.length} totaling ${fmt(core.financeTotal)} IQD`));
    lines.push(t(`• سلف مسجلة بالتايم شيت: ${fmt(core.timesheetTotal)} د.ع`,
                 `• Timesheet-recorded advances: ${fmt(core.timesheetTotal)} IQD`));
    if (core.duplicates.length) {
      lines.push(t(`⚠️ ${core.duplicates.length} مجموعة سلف مشتبه بتكرارها (نفس الشخص/التاريخ/المبلغ):`,
                   `⚠️ ${core.duplicates.length} suspected duplicate advance group(s) (same person/date/amount):`));
      core.duplicates.slice(0, 6).forEach(g => lines.push(`   - ${g.party} | ${g.date} | ${fmt(g.amount)} ×${g.count}`));
      if (core.duplicates.length > 6) lines.push(t(`   …و ${core.duplicates.length - 6} مجموعة أخرى.`, `   …and ${core.duplicates.length - 6} more.`));
      lines.push(t('هذه شبهة تكرار وليست حكماً نهائياً — القرار للمدير.', 'These are suspicions, not verdicts — manager decides.'));
    } else {
      lines.push(t('• لا توجد سلف مكررة مشتبه بها.', '• No suspected duplicate advances.'));
    }
    if (core.reviewFlagged) lines.push(t(`⚠️ ${core.reviewFlagged} حركة سلف عليها ملاحظة مراجعة من الإكسل.`, `⚠️ ${core.reviewFlagged} advance tx carry Excel review notes.`));

    return {
      ok: true,
      audit: true,
      message: lines.join('\n'),
      evidence: {
        source: ['finance', 'timesheet'],
        sourceLabel: t('المالية + التايم شيت', 'Finance + timesheet'),
        employee: who.employee ? who.employee.name : '',
        period: period ? monthLabel(period.month, period.year) : t('كل الفترة', 'all period'),
        totals: {
          financeAdvanceTx: core.advTx.length,
          financeAdvanceTotal: core.financeTotal,
          timesheetAdvanceTotal: core.timesheetTotal,
          duplicateGroups: core.duplicates.length
        },
        duplicates: core.duplicates.slice(0, 12),
        reviewNotes: core.reviewFlagged,
        fromReviewNotes: core.reviewFlagged > 0
      },
      links: [
        { page: 'finance', label: t('فتح المالية', 'Open finance') },
        { page: 'timesheet', label: t('فتح التايم شيت', 'Open timesheet') }
      ]
    };
  }

  // ==========================================================================
  // AUDIT 3 — missing fingerprint notes
  // ==========================================================================
  function fingerprintAudit(args) {
    args = args || {};
    const raw = String(args.query || args.text || '');
    const period = explicitPeriod(raw, args);
    const who = resolveEmployee(args, raw);
    const scopeList = who.employee ? [who.employee] : employeeList();

    const perEmployee = [];
    let totalNoted = 0, totalMissing = 0;
    scopeList.forEach(emp => {
      const recs = (Array.isArray(emp && emp.records) ? emp.records : []).filter(r => recordInPeriod(r, period));
      const noted = recs.filter(r => isFingerprintNote(recordNotes(r)));
      const missing = recs.filter(r => missingPunch(r));
      if (noted.length || missing.length) {
        perEmployee.push({
          name: emp.name,
          fingerprintNotes: noted.length,
          missingPunches: missing.length,
          sample: noted.slice(0, 2).map(r => (r.date || '') + ': ' + recordNotes(r).slice(0, 70))
        });
        totalNoted += noted.length;
        totalMissing += missing.length;
      }
    });
    perEmployee.sort((a, b) => (b.fingerprintNotes + b.missingPunches) - (a.fingerprintNotes + a.missingPunches));

    const when = period ? monthLabel(period.month, period.year) : t('كل الفترة المستوردة', 'entire imported period');
    const lines = [];
    if (!perEmployee.length) {
      lines.push(t(`لا توجد ملاحظات بصمة ناقصة (${when}).`, `No missing-fingerprint notes (${when}).`));
    } else {
      lines.push(t(`ملاحظات البصمة (${when}): ${totalNoted} ملاحظة بصمة من الإكسل، ${totalMissing} يوم ببصمة ناقصة فعلياً.`,
                   `Fingerprint notes (${when}): ${totalNoted} Excel notes, ${totalMissing} day(s) with an actual missing punch.`));
      perEmployee.slice(0, 8).forEach(e => lines.push(`   - ${e.name}: ${t('ملاحظات', 'notes')} ${e.fingerprintNotes} | ${t('بصمة ناقصة', 'missing punch')} ${e.missingPunches}`));
      if (perEmployee.length > 8) lines.push(t(`   …و ${perEmployee.length - 8} موظف آخر.`, `   …and ${perEmployee.length - 8} more.`));
      lines.push(t('التصحيح يتم فقط عبر مسودة تصحيح دوام تمر بالموافقة.', 'Corrections only via a timesheet-correction draft through approval.'));
    }

    return {
      ok: true,
      audit: true,
      message: lines.join('\n'),
      evidence: {
        source: ['timesheet'],
        sourceLabel: t('التايم شيت (استيراد الإكسل)', 'Timesheet (Excel import)'),
        employee: who.employee ? who.employee.name : '',
        period: period ? monthLabel(period.month, period.year) : t('كل الفترة', 'all period'),
        totals: { fingerprintNotes: totalNoted, missingPunches: totalMissing, employeesAffected: perEmployee.length },
        perEmployee: perEmployee.slice(0, 12),
        reviewNotes: totalNoted,
        fromReviewNotes: totalNoted > 0
      },
      links: [{ page: 'timesheet', label: t('فتح التايم شيت', 'Open timesheet') }]
    };
  }

  // ==========================================================================
  // AUDIT 4 — finance / cashbox reconciliation
  // ==========================================================================
  function financeReconciliation() {
    const totals = cashboxTotals();
    const opening = num(financeState().cashOpening);
    const balance = cashBalance(totals);
    const net = totals.in - totals.out;
    const txs = financeTransactions();
    const reviewCount = txs.filter(tx => String(tx && tx.review || '').trim()).length;
    const dupGroups = advancesCore(null, null).duplicates;

    const lines = [
      t('مطابقة المالية والقاصة (حسب cashboxEffect — نفس أرقام لوحة المالية):', 'Finance/cashbox reconciliation (cashboxEffect — same numbers as the finance dashboard):'),
      t(`• الواردات ${fmt(totals.in)} د.ع | المصروفات ${fmt(totals.out)} د.ع | الصافي ${fmt(net)} د.ع`,
        `• Income ${fmt(totals.in)} IQD | expense ${fmt(totals.out)} IQD | net ${fmt(net)} IQD`),
      t(`• رصيد افتتاحي ${fmt(opening)} + الصافي = القاصة النهائية ${fmt(balance)} د.ع`,
        `• Opening ${fmt(opening)} + net = final cashbox ${fmt(balance)} IQD`)
    ];
    if (reviewCount) lines.push(t(`⚠️ ${reviewCount} حركة مالية عليها ملاحظة مراجعة من ملف الإكسل — تحتاج قرار محاسبي.`,
                                  `⚠️ ${reviewCount} transactions carry Excel review notes — need an accounting decision.`));
    if (dupGroups.length) lines.push(t(`⚠️ ${dupGroups.length} مجموعة سلف مشتبه بتكرارها (اسأل: "دقق السلف المكررة").`,
                                       `⚠️ ${dupGroups.length} suspected duplicate advance group(s) (ask: "audit duplicate advances").`));

    return {
      ok: true,
      audit: true,
      message: lines.join('\n'),
      evidence: {
        source: ['finance', 'cashbox'],
        sourceLabel: t('المالية + القاصة (استيراد الإكسل حتى 2026-06-30)', 'Finance + cashbox (Excel import through 2026-06-30)'),
        period: t('كل الفترة المستوردة', 'entire imported period'),
        engine: totals.engine,
        totals: {
          income: totals.in,
          expense: totals.out,
          net,
          opening,
          finalCashbox: balance,
          transactions: txs.length
        },
        reviewNotes: reviewCount,
        duplicateAdvanceGroups: dupGroups.length,
        fromReviewNotes: reviewCount > 0
      },
      links: [
        { page: 'finance', label: t('فتح المالية', 'Open finance') },
        { page: 'cashbox', label: t('فتح القاصة', 'Open cashbox') }
      ]
    };
  }

  // ==========================================================================
  // DRAFTS — approval-gated only. run() NEVER mutates business data; the ONLY
  // side effect is JarvisBrain.queueApproval (pending item the manager reviews).
  // ==========================================================================
  function queueDraft(spec) {
    const B = brain();
    if (!B || typeof B.queueApproval !== 'function') return false;
    return B.queueApproval(spec);
  }

  function draftTask(args) {
    args = args || {};
    const title = String(args.title || args.note || '').trim() || t('مهمة من تدقيق أومني', 'Task from Omni audit');
    const ok = queueDraft({
      title: t('مسودة مهمة: ', 'Task draft: ') + title,
      target: 'task_manager', risk: 'low',
      summary: [title, args.details || '', args.dueDate ? ('due: ' + args.dueDate) : ''].filter(Boolean).join(' | '),
      actionId: 'jarvis_draft_task', actionType: 'draft_task',
      payload: { draft: 'task', title, details: args.details || '', dueDate: args.dueDate || '', evidence: args.evidence || null }
    });
    return {
      ok, approval: true,
      message: ok ? t(`أرسلت مسودة المهمة "${title}" إلى طابور الموافقة — لن تُنشأ قبل موافقة المدير.`, `Task draft "${title}" queued for approval — nothing is created before the manager approves.`)
                  : t('تعذر إرسال المسودة للموافقة.', 'Could not queue the draft.'),
      links: [{ page: 'ai_queue', label: t('فتح طابور الموافقات', 'Open approval queue') }]
    };
  }

  function draftFinanceReview(args) {
    args = args || {};
    const note = String(args.note || args.summary || '').trim() || t('مراجعة مالية من تدقيق أومني', 'Finance review from Omni audit');
    const ok = queueDraft({
      title: t('مسودة مراجعة مالية', 'Finance review draft'),
      target: 'finance', risk: 'high',
      summary: note,
      actionId: 'jarvis_draft_finance_review', actionType: 'draft_finance_review',
      payload: { draft: 'finance_review', note, txIds: Array.isArray(args.txIds) ? args.txIds.slice(0, 50) : [], evidence: args.evidence || null }
    });
    return {
      ok, approval: true,
      message: ok ? t('أرسلت مسودة المراجعة المالية إلى طابور الموافقة — قراءة فقط، لا تعديل على أي قيد.', 'Finance review draft queued for approval — read-only, no entry is touched.')
                  : t('تعذر إرسال المسودة للموافقة.', 'Could not queue the draft.'),
      links: [{ page: 'ai_queue', label: t('فتح طابور الموافقات', 'Open approval queue') }, { page: 'finance', label: t('فتح المالية', 'Open finance') }]
    };
  }

  function draftTimesheetCorrection(args) {
    args = args || {};
    const raw = String(args.query || args.text || '');
    const who = resolveEmployee(args, raw);
    if (!who.employee) {
      return { ok: false, approval: true, message: t('أحتاج اسم الموظف لمسودة تصحيح الدوام.', 'I need the employee name for a timesheet-correction draft.') };
    }
    const date = String(args.date || '').trim();
    const detail = [
      t('الموظف: ', 'Employee: ') + who.employee.name,
      date ? (t('اليوم: ', 'Date: ') + date) : '',
      args.field ? (t('الحقل: ', 'Field: ') + args.field) : '',
      args.suggested ? (t('التصحيح المقترح: ', 'Suggested: ') + args.suggested) : '',
      args.reason ? (t('السبب: ', 'Reason: ') + args.reason) : ''
    ].filter(Boolean).join(' | ');
    const ok = queueDraft({
      title: t('مسودة تصحيح دوام: ', 'Timesheet correction draft: ') + who.employee.name,
      target: 'payroll', risk: 'high',
      summary: detail,
      actionId: 'jarvis_draft_timesheet_correction', actionType: 'draft_timesheet_correction',
      payload: {
        draft: 'timesheet_correction',
        employeeId: who.employee.id || '', employeeName: who.employee.name,
        date, field: args.field || '', suggested: args.suggested || '', reason: args.reason || '',
        evidence: args.evidence || null
      }
    });
    return {
      ok, approval: true,
      message: ok ? t(`أرسلت مسودة تصحيح دوام ${who.employee.name} إلى طابور الموافقة — لا يُعدَّل أي حضور قبل موافقة المدير.`, `Timesheet correction draft for ${who.employee.name} queued — no attendance changes before approval.`)
                  : t('تعذر إرسال المسودة للموافقة.', 'Could not queue the draft.'),
      links: [{ page: 'ai_queue', label: t('فتح طابور الموافقات', 'Open approval queue') }, { page: 'timesheet', label: t('فتح التايم شيت', 'Open timesheet') }]
    };
  }

  // ==========================================================================
  // TOOL REGISTRATION — makes the audit layer usable by the LLM planner too.
  // ==========================================================================
  function registerTools() {
    const B = brain();
    if (!B || !B.tools || B.tools.audit_salary_explain) return !!(B && B.tools && B.tools.audit_salary_explain);
    B.tools.audit_salary_explain = {
      risk: 'safe', audit: true,
      desc_en: 'READ-ONLY: explain an employee salary for a month (attendance, advances, deductions, net) with evidence and Excel review notes.',
      desc_ar: 'قراءة فقط: اشرح راتب موظف لشهر معيّن (حضور، سلف، استقطاعات، صافي) مع الأدلة وملاحظات مراجعة الإكسل.',
      params: { employee_name: 'required', month: '1-12 optional', year: 'YYYY optional', query: 'original user text' },
      run(a) { return withData(salaryExplain(a)); }
    };
    B.tools.audit_advances = {
      risk: 'safe', audit: true,
      desc_en: 'READ-ONLY: advance totals (finance + timesheet) and suspected duplicate advances.',
      desc_ar: 'قراءة فقط: مجاميع السلف (مالية + تايم شيت) والسلف المشتبه بتكرارها.',
      params: { employee_name: 'optional', month: 'optional', year: 'optional', query: 'original user text' },
      run(a) { return withData(advancesAudit(a)); }
    };
    B.tools.audit_fingerprints = {
      risk: 'safe', audit: true,
      desc_en: 'READ-ONLY: missing fingerprint (check-in/out) notes from the Excel import.',
      desc_ar: 'قراءة فقط: ملاحظات البصمة الناقصة (دخول/خروج) من استيراد الإكسل.',
      params: { employee_name: 'optional', month: 'optional', year: 'optional', query: 'original user text' },
      run(a) { return withData(fingerprintAudit(a)); }
    };
    B.tools.audit_finance_reconciliation = {
      risk: 'safe', audit: true,
      desc_en: 'READ-ONLY: finance/cashbox reconciliation (income, expense, net, final cashbox) + Excel review-note count.',
      desc_ar: 'قراءة فقط: مطابقة المالية والقاصة (واردات، مصروفات، صافي، قاصة نهائية) + عدد ملاحظات مراجعة الإكسل.',
      params: {},
      run() { return withData(financeReconciliation()); }
    };
    B.tools.draft_task = {
      risk: 'sensitive', audit: false,
      desc_en: 'DRAFT (approval-gated): queue a task draft for manager approval. Creates nothing directly.',
      desc_ar: 'مسودة (تمر بالموافقة): أرسل مسودة مهمة لموافقة المدير. لا تُنشئ شيئاً مباشرة.',
      params: { title: 'required', details: 'optional', dueDate: 'YYYY-MM-DD optional' },
      run(a) { return withData(draftTask(a)); }
    };
    B.tools.draft_finance_review = {
      risk: 'sensitive', audit: false,
      desc_en: 'DRAFT (approval-gated): queue a finance review draft. Never posts or edits entries.',
      desc_ar: 'مسودة (تمر بالموافقة): أرسل مسودة مراجعة مالية. لا ترحّل ولا تعدّل أي قيد.',
      params: { note: 'what to review (required)' },
      run(a) { return withData(draftFinanceReview(a)); }
    };
    B.tools.draft_timesheet_correction = {
      risk: 'sensitive', audit: false,
      desc_en: 'DRAFT (approval-gated): queue a timesheet/fingerprint correction draft. Never edits attendance directly.',
      desc_ar: 'مسودة (تمر بالموافقة): أرسل مسودة تصحيح دوام/بصمة. لا تعدّل الحضور مباشرة أبداً.',
      params: { employee_name: 'required', date: 'YYYY-MM-DD or DD/MM/YYYY', field: 'checkIn|checkOut|status', suggested: 'suggested value', reason: 'why' },
      run(a) { return withData(draftTimesheetCorrection(a)); }
    };
    return true;
  }
  // execute() only forwards {message, data, navigated} — tuck the rich fields into
  // data too so evidence/links/badges survive the LLM-planned path.
  function withData(r) {
    if (r && typeof r === 'object') {
      r.data = Object.assign({}, r.data, { evidence: r.evidence || null, links: r.links || [], audit: r.audit === true, approval: r.approval === true });
    }
    return r;
  }

  // ==========================================================================
  // DETERMINISTIC AUDIT ROUTER — wraps JarvisBrain.handle so audit questions are
  // answered locally (fast, no LLM, no token cost) with full evidence.
  // ==========================================================================
  function detectAuditIntent(raw) {
    const s = String(raw || '');
    if (!s.trim()) return null;
    const hasDraft = /مسودة|مسوده|\bdraft\b/i.test(s);
    if (hasDraft) {
      if (/تصحيح|بصمة|دوام|حضور|timesheet|attendance|correction/i.test(s)) return 'draft_timesheet_correction';
      if (/مالية|مالي|قيد|قاصة|finance|journal|cashbox/i.test(s)) return 'draft_finance_review';
      if (/مهمة|مهمه|\btask\b/i.test(s)) return 'draft_task';
    }
    const reconWords = /مطابقة|مطابقه|تسوية|تسويه|تدقيق|دقق|دقّق|reconcil|audit/i;
    const financeWords = /مالية|المالية|مالي|قاصة|القاصة|صندوق|finance|cashbox/i;
    if (reconWords.test(s) && financeWords.test(s) && !/سلف|سلفة|advance/i.test(s)) return 'audit_finance_reconciliation';
    if (/إجمالي|اجمالي|مجموع|total/i.test(s) && /(الواردات|المصروفات|income|expense)/i.test(s)) return 'audit_finance_reconciliation';
    if (/سلف|سلفة|سلفه|سُلف|advance/i.test(s) && /دقق|دقّق|تدقيق|مكرر|مكررة|مكرره|تكرار|إجمالي|اجمالي|مجموع|audit|duplicate|total/i.test(s)) return 'audit_advances';
    if (/بصمة|بصمات|fingerprint/i.test(s) && /ناقص|ناقصة|ناقصه|مفقود|مفقودة|مراجعة|ملاحظات|missing|review|notes/i.test(s)) return 'audit_fingerprints';
    if (/اشرح|إشرح|فسر|فسّر|وضح|وضّح|تفاصيل|حلل|حلّل|explain|breakdown|analyze/i.test(s) && /راتب|رواتب|salary|payroll/i.test(s)) return 'audit_salary_explain';
    return null;
  }

  const ROUTES = {
    audit_salary_explain: q => salaryExplain({ query: q }),
    audit_advances: q => advancesAudit({ query: q }),
    audit_fingerprints: q => fingerprintAudit({ query: q }),
    audit_finance_reconciliation: () => financeReconciliation(),
    draft_task: q => draftTask({ title: String(q).replace(/.*?(مسودة|مسوده|draft)\s*(مهمة|مهمه|task)?/i, '').trim().slice(0, 80), query: q }),
    draft_finance_review: q => draftFinanceReview({ note: String(q).slice(0, 200), query: q }),
    draft_timesheet_correction: q => draftTimesheetCorrection({ query: q, reason: String(q).slice(0, 200) })
  };

  function wrapHandle() {
    const B = brain();
    if (!B || typeof B.handle !== 'function' || B.__auditWrapped) return !!(B && B.__auditWrapped);
    const origHandle = B.handle;
    B.handle = async function (userText, opts) {
      const route = detectAuditIntent(userText);
      if (route && ROUTES[route]) {
        try {
          const r = await ROUTES[route](String(userText || ''));
          if (r && r.message) {
            return {
              text: r.message,
              results: [{
                tool: route,
                risk: r.approval ? 'sensitive' : 'safe',
                ok: r.ok !== false,
                message: '',
                audit: r.audit === true,
                approval: r.approval === true,
                evidence: r.evidence || null,
                links: r.links || []
              }],
              actions: [{ tool: route, args: { query: String(userText || '') } }],
              clarify: '',
              local: true,
              auditMode: true
            };
          }
        } catch (e) {
          try { console.warn('[JarvisAudit] route failed, falling back to brain:', e); } catch (_) {}
        }
      }
      return origHandle.call(B, userText, opts);
    };
    B.__auditWrapped = true;
    return true;
  }

  function init() {
    const okTools = registerTools();
    const okWrap = wrapHandle();
    return okTools && okWrap;
  }
  // Try now; if jarvis-brain loads later, retry a few times (script-order safety).
  if (!init()) {
    let tries = 0;
    const timer = setInterval(() => { if (init() || ++tries > 20) clearInterval(timer); }, 500);
  }

  window.JarvisAudit = {
    salaryExplain,
    advancesAudit,
    fingerprintAudit,
    financeReconciliation,
    draftTask,
    draftFinanceReview,
    draftTimesheetCorrection,
    detectAuditIntent,
    cashboxTotals,
    cashBalance,
    init,
    version: '1.0'
  };
})();
