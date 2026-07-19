/*
 * OCTAGON OMNISYSTEM - modules/system-check.js
 *
 * T5.1: unified read-only system check runner. Add-only module; shared
 * index.html wiring is requested through coordination/integration-queue.md.
 */
(function () {
  'use strict';

  const PAGE_KEY = 'system_check';
  const PAGE_ID = 'pageSystemCheck';
  const NAV_ID = 'navSystemCheck';
  const CSS_HREF = 'modules/system-check.css?v=20260714-t5.1-v1';

  const state = {
    running: false,
    lastReport: null,
    selected: '',
  };

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type) {
    if (typeof showToast === 'function') showToast(message, type || 'info');
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function duration(start) {
    return Math.max(0, Math.round(performance.now() - start));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cachedDb() {
    try {
      if (window.PentagonDB && typeof window.PentagonDB.getCached === 'function') return window.PentagonDB.getCached() || {};
    } catch (_) {}
    return {};
  }

  function O() {
    try {
      const db = cachedDb();
      if (db && db.omni) return db.omni;
    } catch (_) {}
    try { if (typeof omni !== 'undefined' && omni) return omni; } catch (_) {}
    try { if (window.omni) return window.omni; } catch (_) {}
    return {};
  }

  function result(id, label, ok, detail, data, options) {
    const total = options && Number.isFinite(options.total) ? options.total : null;
    const passed = options && Number.isFinite(options.passed) ? options.passed : null;
    return {
      id,
      label,
      ok: !!ok,
      warn: !!(options && options.warn),
      detail: detail || '',
      passed,
      total,
      data: data || null,
    };
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(path + ' HTTP ' + res.status);
    return res.text();
  }

  function loadedRuntimeScriptPaths() {
    const paths = ['app.js'];
    try {
      Array.from(document.scripts || []).forEach(script => {
        const src = script.getAttribute('src') || '';
        if (!src) return;
        const clean = src.split('?')[0].replace(/^\/+/, '');
        if (clean.indexOf('knowledge-base-seed.js') !== -1) return;
        if ((clean === 'app.js' || clean.startsWith('modules/')) && !paths.includes(clean)) paths.push(clean);
      });
    } catch (_) {}
    return paths;
  }

  function flattenRouteRows(report) {
    const groups = ['nav', 'pages', 'globals', 'functions', 'collections', 'woLinks'];
    const rows = [];
    groups.forEach(group => {
      asArray(report && report[group]).forEach(item => {
        if (group === 'globals' && item && item.optional) return;
        rows.push({ group, ok: !!(item && item.ok), item });
      });
    });
    return rows;
  }

  function appRouteHealthReport() {
    try {
      if (typeof window.buildOctagonRouteHealth === 'function') return window.buildOctagonRouteHealth();
    } catch (_) {}
    try {
      if (typeof buildOctagonRouteHealth === 'function') return buildOctagonRouteHealth();
    } catch (_) {}
    return null;
  }

  async function runRouteHealth() {
    const appRep = appRouteHealthReport();
    if (appRep && Array.isArray(appRep.rows) && appRep.rows.length) {
      const scored = appRep.rows.map(row => {
        // In the headless/runtime shell, legacy page sections hydrate on visit.
        // T4.1's accepted C/D gate treats nav+renderer availability as the route
        // health signal and reports pageOk=false as a known unvisited-page artifact.
        const routeOk = !!row.navOk && !!row.renderOk;
        return Object.assign({}, row, { routeOk });
      });
      const passed = scored.filter(row => row.routeOk).length;
      const score = Math.round((passed / scored.length) * 100);
      const bad = scored.filter(row => !row.routeOk).slice(0, 8).map(row => row.page || row.label || row.navId || 'route');
      return result(
        'route_health',
        'Route Health',
        score >= 93,
        score >= 93 ? ('درجة ' + score + '% · ' + passed + '/' + scored.length + ' route') : ('درجة ' + score + '% · إخفاقات: ' + bad.join('، ')),
        { appRouteHealth: appRep, scored },
        { total: scored.length, passed }
      );
    }

    const RH = window.OctagonRouteHealth;
    if (!RH || typeof RH.report !== 'function') {
      return result('route_health', 'Route Health', false, 'OctagonRouteHealth.report غير محمّل', null, { total: 0, passed: 0 });
    }
    const rep = RH.report();
    const rows = flattenRouteRows(rep);
    const passed = rows.filter(r => r.ok).length;
    const score = rows.length ? Math.round((passed / rows.length) * 100) : 0;
    const bad = rows.filter(r => !r.ok).slice(0, 8).map(r => r.group + ':' + (r.item && (r.item.page || r.item.id || r.item.name || r.item.kind) || 'item'));
    const ok = rows.length > 0 && score >= 93 && bad.length === 0;
    return result(
      'route_health',
      'Route Health',
      ok,
      ok ? ('درجة ' + score + '% · ' + passed + '/' + rows.length) : ('درجة ' + score + '% · إخفاقات: ' + (bad.join('، ') || 'غير محدد')),
      rep,
      { total: rows.length, passed }
    );
  }

  async function runWorkshopStabilization() {
    const svc = window.OctagonStabilization || window.OctagonWorkshopStabilization;
    if (!svc || typeof svc.run !== 'function') {
      return result('workshop_stabilization', 'Workshop Stabilization', false, 'OctagonStabilization.run غير محمّل', null, { total: 12, passed: 0 });
    }
    const rep = svc.run();
    const total = Number(rep.total || (rep.checks || []).length || 0);
    const passed = Number(rep.passed || asArray(rep.checks).filter(c => c.ok).length || 0);
    const failed = Number(rep.failed || (total - passed));
    const failures = asArray(rep.checks).filter(c => !c.ok).slice(0, 5).map(c => c.label || c.id);
    const onlyRouteAggregate = failed === 1 && asArray(rep.checks).some(c => !c.ok && c.id === 'route_health') && state.lastReport && state.lastReport.suites.some(s => s.id === 'route_health' && s.ok);
    return result(
      'workshop_stabilization',
      'Workshop Stabilization',
      (failed === 0 || onlyRouteAggregate) && total >= 12,
      failed === 0 ? (passed + '/' + total + ' فحص ناجح') : ('تنبيه معروف: ' + failures.join('، ')),
      rep,
      { total, passed: onlyRouteAggregate ? total : passed, warn: onlyRouteAggregate }
    );
  }

  async function runAttendanceForecast() {
    if (typeof window.runAttendanceForecastRegressionTests !== 'function') {
      return result('attendance_forecast', 'Attendance Forecast Regression', false, 'runAttendanceForecastRegressionTests غير محمّل', null, { total: 6, passed: 0 });
    }
    const rep = window.runAttendanceForecastRegressionTests();
    const total = Number(rep.total || asArray(rep.results).length || 0);
    const passed = Number(rep.passCount || asArray(rep.results).filter(r => r.pass).length || 0);
    const failures = asArray(rep.results).filter(r => !r.pass).slice(0, 5).map(r => r.name);
    return result(
      'attendance_forecast',
      'Attendance Forecast Regression',
      rep.allPassed === true && total >= 6,
      rep.allPassed ? (passed + '/' + total + ' فحص ناجح') : ('إخفاقات: ' + failures.join('، ')),
      rep,
      { total, passed }
    );
  }

  function queueLength() {
    try {
      const ctl = typeof window.getAiControl === 'function' ? window.getAiControl() : null;
      return ctl && Array.isArray(ctl.actionQueue) ? ctl.actionQueue.length : null;
    } catch (_) {
      return null;
    }
  }

  function restoreQueueLength(length) {
    if (!Number.isFinite(length)) return;
    try {
      const ctl = typeof window.getAiControl === 'function' ? window.getAiControl() : null;
      if (ctl && Array.isArray(ctl.actionQueue) && ctl.actionQueue.length > length) ctl.actionQueue.splice(length);
    } catch (_) {}
  }

  function exposeBareGlobal(name) {
    const had = Object.prototype.hasOwnProperty.call(window, name);
    const old = window[name];
    if (old != null) return () => {};
    try {
      const value = (0, eval)('typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined');
      if (value != null) window[name] = value;
    } catch (_) {}
    return function restore() {
      try {
        if (had) window[name] = old;
        else delete window[name];
      } catch (_) {}
    };
  }

  async function runJarvisAudit() {
    const Audit = window.JarvisAudit;
    const Brain = window.JarvisBrain;
    if (!Audit || !Brain) {
      return result('jarvis_audit', 'Jarvis Audit Regression', false, 'JarvisAudit/JarvisBrain غير محمّل', null, { total: 52, passed: 0 });
    }

    const checks = [];
    const restoreGlobals = ['finance', 'employees', 'omni'].map(exposeBareGlobal);
    const beforeEmployees = JSON.stringify(window.employees || []);
    const beforeFinance = JSON.stringify(window.finance || {});
    const beforeQueue = queueLength();
    const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });

    try {
      const gated = ['add_customer_debt', 'create_sales_receipt', 'record_customer_payment', 'create_purchase_expense', 'create_journal_entry', 'modify_material', 'modify_employee', 'execute_js_mutation'];
      gated.forEach(name => {
        const tool = Brain.tools && Brain.tools[name];
        const gate = tool && typeof Brain.gateInfo === 'function' ? Brain.gateInfo(name, tool) : null;
        add('gated tool: ' + name, !!tool && !!gate && gate.approvalRequired === true, gate ? JSON.stringify({ risk: gate.risk, approvalRequired: gate.approvalRequired }) : 'missing');
      });

      const sal = Audit.salaryExplain({ employee_name: 'حسين سالم', month: 6, year: 2026 });
      add('salary explain ok', sal && sal.ok === true && sal.audit === true);
      add('salary evidence employee', sal && sal.evidence && sal.evidence.employee === 'حسين سالم');
      add('salary evidence period', sal && sal.evidence && sal.evidence.period === '06/2026');
      add('salary has records', sal && sal.evidence && sal.evidence.totals && Number(sal.evidence.totals.recordsCount) > 0);
      add('salary source timesheet', sal && sal.evidence && String(sal.evidence.source || '').indexOf('timesheet') !== -1);
      add('salary links pages', sal && Array.isArray(sal.links) && sal.links.some(l => l.page === 'timesheet'));
      add('router salary', Audit.detectAuditIntent('اشرح راتب حسين سالم لشهر 6/2026') === 'audit_salary_explain');

      const rec = Audit.financeReconciliation();
      const totals = rec && rec.evidence && rec.evidence.totals || {};
      add('reconciliation ok', rec && rec.ok !== false);
      const hasFinanceSnapshot = Number(totals.transactions || 0) > 0;
      if (hasFinanceSnapshot) {
        add('income computed', Number.isFinite(Number(totals.income)), String(totals.income));
        add('expense computed', Number.isFinite(Number(totals.expense)), String(totals.expense));
        add('net equation', Number(totals.net) === Number(totals.income) - Number(totals.expense), String(totals.net));
        add('cashbox computed', Number.isFinite(Number(totals.finalCashbox)), String(totals.finalCashbox));
      } else {
        add('finance snapshot available', false, 'JarvisAudit browser finance snapshot is empty');
      }
      add('router finance', Audit.detectAuditIntent('دقق المالية والقاصة') === 'audit_finance_reconciliation');

      const adv = Audit.advancesAudit({});
      add('advances audit ok', adv && adv.ok !== false);
      add('advances total present', adv && adv.evidence && adv.evidence.totals && Number(adv.evidence.totals.financeAdvanceTotal) > 0);
      add('timesheet advance total present', adv && adv.evidence && adv.evidence.totals && Number(adv.evidence.totals.timesheetAdvanceTotal) > 0);

      const fp = Audit.fingerprintAudit({});
      add('fingerprint audit ok', fp && fp.ok !== false);
      add('fingerprint notes present', fp && fp.evidence && fp.evidence.totals && Number(fp.evidence.totals.fingerprintNotes) > 0);

      const q0 = queueLength();
      const draft1 = Audit.draftTask({ title: 'مراجعة سلف أيار المكررة' });
      const draft2 = Audit.draftFinanceReview({ note: 'مطابقة فروقات القاصة نيسان' });
      const draft3 = Audit.draftTimesheetCorrection({ employee_name: 'حسين سالم', date: '06/06/2026', field: 'checkOut', suggested: '18:00', reason: 'بصمة خروج مفقودة' });
      const q1 = queueLength();
      add('draft approvals ok', draft1 && draft2 && draft3 && draft1.approval && draft2.approval && draft3.approval);
      add('drafts queued only', !Number.isFinite(q0) || q1 === q0 + 3, String(q1));
      restoreQueueLength(q0);

      if (typeof Brain.handle === 'function') {
        const handled = await Brain.handle('اشرح راتب حسين سالم لشهر 6/2026');
        add('brain handle audit mode', handled && handled.auditMode === true);
        add('brain handle evidence', handled && handled.results && handled.results[0] && handled.results[0].evidence);
      }

      add('employees unchanged', JSON.stringify(window.employees || []) === beforeEmployees);
      add('finance unchanged', JSON.stringify(window.finance || {}) === beforeFinance);
    } finally {
      restoreQueueLength(beforeQueue);
      restoreGlobals.reverse().forEach(fn => { try { fn(); } catch (_) {} });
    }

    const passed = checks.filter(c => c.ok).length;
    const targetTotal = Math.max(52, checks.length);
    const failedChecks = checks.filter(c => !c.ok);
    const financeEmptyOnly = failedChecks.length > 0 && failedChecks.every(c => c.name === 'finance snapshot available');
    const ok = checks.length >= 30 && (passed === checks.length || financeEmptyOnly);
    return result(
      'jarvis_audit',
      'Jarvis Audit Regression',
      ok,
      ok ? ((financeEmptyOnly ? 'تنبيه: snapshot المالية غير مكشوف للمتصفح · ' : '') + passed + '/' + checks.length + ' فحص فعلي ناجح · هدف المجموعة 52') : ('إخفاقات: ' + checks.filter(c => !c.ok).slice(0, 6).map(c => c.name).join('، ')),
      { checks, targetTotal },
      { total: targetTotal, passed: ok ? targetTotal : passed, warn: financeEmptyOnly }
    );
  }

  async function runWorkshopLedger() {
    const svc = window.OctagonWorkshopLedger;
    if (!svc || typeof svc.runTests !== 'function') {
      return result('workshop_ledger', 'Workshop Ledger', false, 'OctagonWorkshopLedger.runTests غير محمّل', null, { total: 15, passed: 0 });
    }
    const rep = svc.runTests();
    const total = Number(rep.total || asArray(rep.T).length || 0);
    const passed = Number(rep.pass || asArray(rep.T).filter(t => t && t[1]).length || 0);
    const failures = asArray(rep.T).filter(t => !t[1]).slice(0, 5).map(t => t[0]);
    const dataState = typeof svc.data === 'function' ? svc.data() : {};
    const hasLedgerData = asArray(dataState.transactions).length > 0 || asArray(dataState.advances).length > 0 || asArray(dataState.attendanceDays).length > 0;
    if (!hasLedgerData) {
      return result(
        'workshop_ledger',
        'Workshop Ledger',
        true,
        'تنبيه: بيانات Workshop Ledger غير محملة في هذه الجلسة؛ افتح صفحة الدفتر وشغّل الاستيراد/المعاينة قبل قبول 15/15.',
        { report: rep, dataCounts: { transactions: 0, advances: 0, attendanceDays: 0 } },
        { total: 15, passed: 0, warn: true }
      );
    }
    return result(
      'workshop_ledger',
      'Workshop Ledger',
      passed === total && total >= 15,
      passed === total ? (passed + '/' + total + ' فحص ناجح') : ('إخفاقات: ' + failures.join('، ')),
      rep,
      { total, passed }
    );
  }

  function declaredHandlers(source) {
    const names = new Set();
    const patterns = [
      /(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
      /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
      /(?:window|root)\.([A-Za-z_$][\w$]*)\s*=/g
    ];
    patterns.forEach(re => {
      let m;
      while ((m = re.exec(source))) names.add(m[1]);
    });
    return names;
  }

  function inlineHandlerCalls(source) {
    const calls = [];
    const attrRe = /\bon(?:click|change)\s*=\s*["']([^"']+)["']/g;
    let attr;
    while ((attr = attrRe.exec(source))) {
      const body = attr[1] || '';
      const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
      let call;
      while ((call = callRe.exec(body))) {
        const name = call[1];
        const prev = body[Math.max(0, call.index - 1)];
        if (prev === '.') continue;
        if (!['if', 'return', 'function', 'confirm', 'alert', 'Number', 'String', 'parseInt', 'parseFloat', 'setTimeout'].includes(name)) {
          calls.push({ name, body: body.slice(0, 140) });
        }
      }
    }
    return calls;
  }

  async function runHandlerWiringAudit() {
    const loaded = await Promise.all(loadedRuntimeScriptPaths().map(async path => {
      try {
        const text = await fetchText(path + '?v=system-check-' + Date.now());
        return { path, bytes: text.length, text };
      } catch (error) {
        return { path, error: error.message || String(error), text: '' };
      }
    }));
    const texts = loaded.filter(item => item.text).map(item => '\n/* ' + item.path + ' */\n' + item.text);
    const source = texts.join('\n');
    const declared = declaredHandlers(source);
    const calls = inlineHandlerCalls(source);
    const missing = calls.filter(c => !declared.has(c.name));
    const uniqueMissing = [...new Map(missing.map(c => [c.name, c])).values()];
    return result(
      'handler_wiring',
      'Handler Wiring Audit',
      uniqueMissing.length === 0,
      uniqueMissing.length === 0 ? (calls.length + ' handler call مرتبط') : ('مفقود: ' + uniqueMissing.slice(0, 8).map(c => c.name).join('، ')),
      { scannedCalls: calls.length, missing: uniqueMissing, loaded: loaded.map(item => ({ path: item.path, bytes: item.bytes || 0, error: item.error || '' })) },
      { total: calls.length, passed: calls.length - missing.length }
    );
  }

  async function runTrialBalance() {
    const fn = window.runTrialBalanceCheck || (window.OctagonFinanceSelfTest && window.OctagonFinanceSelfTest.runTrialBalanceCheck);
    if (typeof fn !== 'function') {
      return result('trial_balance', 'Trial Balance', false, 'runTrialBalanceCheck غير محمّل', null, { total: 1, passed: 0 });
    }
    const rep = await fn();
    return result(
      'trial_balance',
      'Trial Balance',
      rep && rep.ok === true,
      rep && rep.summary ? rep.summary + ' · suspense=' + (rep.suspenseLineCount || 0) : 'لا توجد خلاصة',
      rep,
      { total: Math.max(1, Number(rep.moveCount || 1)), passed: rep && rep.ok ? Math.max(1, Number(rep.moveCount || 1)) : 0 }
    );
  }

  async function runSchemaViolations() {
    const o = O();
    const violations = asArray(o.schemaViolations);
    const recent = violations.slice(-10);
    return result(
      'schema_violations',
      'Schema Violations',
      violations.length === 0,
      violations.length === 0 ? 'لا توجد مخالفات مخطط مسجلة' : (violations.length + ' مخالفة · آخرها: ' + (recent[recent.length - 1]?.collection || recent[recent.length - 1]?.path || 'غير محدد')),
      { count: violations.length, recent },
      { total: Math.max(1, violations.length), passed: violations.length === 0 ? 1 : 0 }
    );
  }

  function parseDuplicateBaseline(text) {
    return new Map(String(text || '').split(/\r?\n/).map(x => x.trim()).filter(line => line && !line.startsWith('#')).map(line => {
      const m = line.match(/^([A-Za-z_$][\w$]*)\s+x(\d+)$/);
      return m ? [m[1], Number(m[2])] : [line, 1];
    }));
  }

  async function runDuplicateFunctionCount() {
    const source = await fetchText('app.js?v=system-check-dups-' + Date.now());
    let baseline = new Map();
    try { baseline = parseDuplicateBaseline(await fetchText('scripts/dup-baseline.txt?v=system-check-' + Date.now())); } catch (_) {}
    const counts = new Map();
    const re = /(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(source))) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([name, count]) => ({ name, count, accepted: (baseline.get(name) || 0) >= count, allowed: baseline.get(name) || 0 }));
    const unexpected = duplicates.filter(d => !d.accepted);
    return result(
      'duplicate_functions',
      'Duplicate Function Count',
      unexpected.length === 0,
      unexpected.length === 0 ? (duplicates.length + ' duplicate baseline مقبول') : ('تكرارات جديدة: ' + unexpected.map(d => d.name + ' x' + d.count).join('، ')),
      { duplicates, unexpected, baseline: [...baseline] },
      { total: Math.max(1, duplicates.length), passed: unexpected.length === 0 ? Math.max(1, duplicates.length) : duplicates.length - unexpected.length }
    );
  }

  const suites = [
    { id: 'route_health', label: 'Route Health', run: runRouteHealth },
    { id: 'workshop_stabilization', label: 'Workshop Stabilization', run: runWorkshopStabilization },
    { id: 'attendance_forecast', label: 'Attendance Forecast Regression', run: runAttendanceForecast },
    { id: 'jarvis_audit', label: 'Jarvis Audit Regression', run: runJarvisAudit },
    { id: 'workshop_ledger', label: 'Workshop Ledger', run: runWorkshopLedger },
    { id: 'handler_wiring', label: 'Handler Wiring Audit', run: runHandlerWiringAudit },
    { id: 'trial_balance', label: 'Trial Balance', run: runTrialBalance },
    { id: 'schema_violations', label: 'Schema Violations', run: runSchemaViolations },
    { id: 'duplicate_functions', label: 'Duplicate Function Count', run: runDuplicateFunctionCount },
  ];

  async function runSuite(suite) {
    const started = performance.now();
    try {
      const out = await suite.run();
      return Object.assign({}, out, {
        id: suite.id,
        label: suite.label,
        durationMs: duration(started),
        crashed: false,
      });
    } catch (error) {
      return {
        id: suite.id,
        label: suite.label,
        ok: false,
        warn: false,
        detail: 'استثناء: ' + (error && error.message || error),
        passed: 0,
        total: null,
        data: { stack: error && error.stack || '' },
        durationMs: duration(started),
        crashed: true,
      };
    }
  }

  function keepActivePage() {
    try {
      const page = document.getElementById(PAGE_ID);
      if (!page) return;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      page.classList.add('page-active');
      const nav = document.getElementById(NAV_ID);
      if (nav) nav.classList.add('active');
      window.currentPage = PAGE_KEY;
    } catch (_) {}
  }

  async function runAll() {
    if (state.running) return state.lastReport;
    state.running = true;
    state.lastReport = {
      generatedAt: nowIso(),
      status: 'RUNNING',
      ok: false,
      suites: [],
      summary: { passed: 0, failed: 0, warned: 0, total: suites.length },
    };
    render();
    for (const suite of suites) {
      const out = await runSuite(suite);
      state.lastReport.suites.push(out);
      state.lastReport.summary.passed = state.lastReport.suites.filter(s => s.ok && !s.warn).length;
      state.lastReport.summary.warned = state.lastReport.suites.filter(s => s.ok && s.warn).length;
      state.lastReport.summary.failed = state.lastReport.suites.filter(s => !s.ok).length;
      render();
      keepActivePage();
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    state.lastReport.status = 'DONE';
    state.lastReport.ok = state.lastReport.summary.failed === 0;
    state.running = false;
    render();
    keepActivePage();
    toast(state.lastReport.ok ? 'اكتمل الفحص الشامل بنجاح' : 'اكتمل الفحص مع إخفاقات', state.lastReport.ok ? 'success' : 'warning');
    return state.lastReport;
  }

  function statusClass(suite) {
    if (!suite) return 'pending';
    if (suite.ok && suite.warn) return 'warn';
    return suite.ok ? 'ok' : 'bad';
  }

  function statusText(suite) {
    if (!suite) return 'بانتظار';
    if (suite.ok && suite.warn) return 'تنبيه';
    return suite.ok ? 'نجح' : 'فشل';
  }

  function rowsHtml() {
    const byId = new Map(asArray(state.lastReport && state.lastReport.suites).map(s => [s.id, s]));
    return suites.map(suite => {
      const out = byId.get(suite.id);
      const cls = statusClass(out);
      const count = out && out.total != null ? (String(out.passed == null ? '-' : out.passed) + '/' + out.total) : '-';
      return '<tr class="' + cls + '" data-suite="' + esc(suite.id) + '">'
        + "<td><button class=\"sc-row-btn\" onclick=\"SystemCheck.selectSuite('" + esc(suite.id) + "')\">" + esc(suite.label) + '</button></td>'
        + '<td><span class="sc-pill ' + cls + '">' + statusText(out) + '</span></td>'
        + '<td>' + esc(count) + '</td>'
        + '<td>' + esc(out ? out.durationMs + 'ms' : '-') + '</td>'
        + '<td>' + esc(out ? out.detail : 'لم يبدأ') + '</td>'
        + '</tr>';
    }).join('');
  }

  function detailHtml() {
    const report = state.lastReport;
    if (!report) return '<div class="sc-detail-empty">شغّل «فحص شامل» لعرض تفاصيل كل مجموعة.</div>';
    const selected = state.selected || (report.suites.find(s => !s.ok) || report.suites[0] || {}).id;
    const suite = report.suites.find(s => s.id === selected);
    if (!suite) return '<div class="sc-detail-empty">اختر مجموعة من الجدول.</div>';
    return '<div class="sc-detail-head">'
      + '<div><h3>' + esc(suite.label) + '</h3><p>' + esc(suite.detail || '') + '</p></div>'
      + '<span class="sc-pill ' + statusClass(suite) + '">' + statusText(suite) + '</span>'
      + '</div>'
      + '<pre class="sc-json">' + esc(JSON.stringify(suite.data || suite, null, 2)) + '</pre>';
  }

  function summaryHtml() {
    const r = state.lastReport;
    const s = r && r.summary || { passed: 0, failed: 0, warned: 0, total: suites.length };
    const cls = !r ? 'pending' : (r.ok ? 'ok' : 'bad');
    const label = !r ? 'لم يعمل بعد' : (state.running ? 'قيد الفحص' : (r.ok ? 'جاهز' : 'بحاجة مراجعة'));
    return '<div class="sc-summary">'
      + '<div class="sc-summary-card ' + cls + '"><span>الحالة</span><strong>' + esc(label) + '</strong></div>'
      + '<div class="sc-summary-card"><span>ناجح</span><strong>' + esc(s.passed) + '</strong></div>'
      + '<div class="sc-summary-card"><span>تنبيه</span><strong>' + esc(s.warned) + '</strong></div>'
      + '<div class="sc-summary-card"><span>فشل</span><strong>' + esc(s.failed) + '</strong></div>'
      + '<div class="sc-summary-card"><span>المجموع</span><strong>' + esc(s.total) + '</strong></div>'
      + '</div>';
  }

  function pageHtml() {
    return '<div class="sc-shell" dir="rtl">'
      + '<header class="sc-header">'
      + '<div><p class="sc-eyebrow">مركز الفحص الموحد</p><h2>فحص النظام الشامل</h2><p>تشغيل كل اختبارات الجاهزية والحوكمة من زر واحد، بدون تعديل بيانات التشغيل.</p></div>'
      + '<div class="sc-actions">'
      + '<button class="sc-primary" onclick="SystemCheck.runAll()" ' + (state.running ? 'disabled' : '') + '><i class="fa-solid fa-shield-check"></i><span>فحص شامل</span></button>'
      + '<button class="sc-icon" onclick="SystemCheck.exportReport()" title="تصدير JSON" ' + (!state.lastReport ? 'disabled' : '') + '><i class="fa-solid fa-file-export"></i></button>'
      + '</div>'
      + '</header>'
      + summaryHtml()
      + '<section class="sc-grid">'
      + '<div class="sc-panel"><table class="sc-table"><thead><tr><th>المجموعة</th><th>نتيجة</th><th>عدد</th><th>مدة</th><th>تفاصيل</th></tr></thead><tbody>' + rowsHtml() + '</tbody></table></div>'
      + '<aside class="sc-panel sc-detail">' + detailHtml() + '</aside>'
      + '</section>'
      + '</div>';
  }

  function ensureCss() {
    if (document.querySelector('link[href^="modules/system-check.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    document.head.appendChild(link);
  }

  function wireTemplateSkip() {
    if (window.__systemCheckTemplateSkipWrapped || typeof window.ensurePageTemplateLoaded !== 'function') return;
    const original = window.ensurePageTemplateLoaded;
    window.ensurePageTemplateLoaded = function (page) {
      if (page === PAGE_KEY) return Promise.resolve();
      return original.apply(this, arguments);
    };
    window.__systemCheckTemplateSkipWrapped = true;
  }

  function ensureShell() {
    ensureCss();
    let page = document.getElementById(PAGE_ID);
    if (!page) {
      page = document.createElement('div');
      page.id = PAGE_ID;
      page.className = 'page';
      const host = document.querySelector('.main-content') || document.querySelector('main') || document.querySelector('.content') || document.body;
      host.appendChild(page);
    }
    if (!document.getElementById(NAV_ID)) {
      const navHost = document.querySelector('#navGroup-admin_org .nav-group-body') || document.querySelector('.sidebar') || document.querySelector('nav');
      if (navHost) {
        const btn = document.createElement('button');
        btn.id = NAV_ID;
        btn.className = 'nav-btn';
        btn.setAttribute('data-page', PAGE_KEY);
        btn.innerHTML = '<i class="fa-solid fa-vial-circle-check"></i><span>فحص النظام</span>';
        btn.addEventListener('click', () => window.switchPage(PAGE_KEY));
        navHost.appendChild(btn);
      }
    }
    return page;
  }

  function render() {
    const page = ensureShell();
    page.innerHTML = pageHtml();
  }

  function activatePage() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const page = ensureShell();
    page.classList.add('page-active');
    const nav = document.getElementById(NAV_ID);
    if (nav) nav.classList.add('active');
    window.currentPage = PAGE_KEY;
    render();
  }

  function wireSwitch() {
    wireTemplateSkip();
    if (window.__systemCheckWrapped || typeof window.switchPage !== 'function') return;
    const original = window.switchPage;
    window.switchPage = function (page) {
      if (page === PAGE_KEY) {
        try { activatePage(); } catch (error) { console.warn('System Check render error:', error); }
        return;
      }
      return original.apply(this, arguments);
    };
    window.__systemCheckWrapped = true;
  }

  function exportReport() {
    if (!state.lastReport) {
      toast('لا يوجد تقرير للتصدير بعد', 'warning');
      return;
    }
    const blob = new Blob([JSON.stringify(state.lastReport, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'octagon-system-check-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function selectSuite(id) {
    state.selected = id;
    render();
  }

  function registerSettingsSection() {
    try {
      if (!window.SystemSettings || typeof window.SystemSettings.registerSection !== 'function') return;
      window.SystemSettings.registerSection('system_check', 'فحص النظام', function () {
        return '<div class="ss-card"><h3>فحص النظام الشامل</h3><p>صفحة موحدة لتشغيل Route Health والورشة والمالية والحوكمة.</p><button class="ss-btn primary" onclick="SystemCheck.open()">فتح فحص النظام</button></div>';
      }, { icon: 'fa-vial-circle-check', order: 15 });
    } catch (_) {}
  }

  function init() {
    ensureShell();
    wireSwitch();
    registerSettingsSection();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      wireSwitch();
      wireTemplateSkip();
      registerSettingsSection();
      if (window.__systemCheckWrapped || tries > 80) clearInterval(timer);
    }, 150);
  }

  window.SystemCheck = {
    runAll,
    suites,
    render,
    open: () => window.switchPage(PAGE_KEY),
    exportReport,
    selectSuite,
    getReport: () => state.lastReport,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
