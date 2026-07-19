/**
 * OCTAGON ERP — Budgeting / Budget vs Actual (الموازنات — المخطط مقابل الفعلي).
 *
 * A standard accounting module Octagon had ZERO of (`budgeting`/`budget vs` = 0). Set budgets per
 * scope (expense/income), period (month or year) and optional department, then compare against the
 * REAL actuals pulled from finance — **read-only**: it never writes a finance transaction, it only
 * reads `window.getFinanceTransactions()`. Variance + over-budget alerts. Add-only; self-contained
 * in `omni.budgeting`.
 *
 * Data namespace: omni.budgeting = { lines:[] }
 * Page: #pageBudgeting (nav data-page="budgeting"). Add-only.
 */
(function () {
  'use strict';

  function O() { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} } return null; }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function money(n) { n = Number(n); return isFinite(n) ? Math.round(n) : 0; }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function coId() { try { return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''; } catch (_) { return ''; } }
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('budgeting', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'budgeting', action, detail, user: userName() }); } catch (_) {}
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function thisMonth() { return todayISO().slice(0, 7); }

  const SCOPE_LABEL = { expense: 'مصروف', income: 'إيراد' };
  // Finance transaction types that count as "spend" vs "earn".
  const EXPENSE_TYPES = ['expense', 'salary_payment'];
  const INCOME_TYPES = ['income', 'sales_receipt', 'customer_charge'];

  function txns() { try { return typeof window.getFinanceTransactions === 'function' ? (window.getFinanceTransactions() || []) : []; } catch (_) { return []; } }
  function distinctDepartments() {
    const set = new Set();
    txns().forEach(t => { if (t.departmentId) set.add(t.departmentId); });
    const o = O();
    if (o && o.finance && Array.isArray(o.finance.departments)) o.finance.departments.forEach(d => set.add(d.id || d));
    return Array.from(set);
  }

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.budgeting || typeof o.budgeting !== 'object') o.budgeting = {};
    if (!Array.isArray(o.budgeting.lines)) o.budgeting.lines = [];
    return o.budgeting;
  }
  function B() { return ensureData(); }
  function getLines(all) { let l = (B()?.lines || []).filter(x => all || x.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }

  // Actual spend/earn matching a budget line: type-set + period (YYYY-MM exact OR YYYY year prefix) +
  // optional department. Read-only over finance.
  function actualFor(line) {
    const types = line.scope === 'income' ? INCOME_TYPES : EXPENSE_TYPES;
    const period = String(line.period || '');
    return txns().reduce((sum, t) => {
      if (!types.includes(t.type)) return sum;
      const d = String(t.date || t.createdAt || '');
      if (period.length === 7 ? d.slice(0, 7) !== period : period.length === 4 ? d.slice(0, 4) !== period : false) return sum;
      if (line.departmentId && t.departmentId !== line.departmentId) return sum;
      return sum + money(t.amount);
    }, 0);
  }
  function lineView(line) {
    const budget = money(line.amount), actual = actualFor(line);
    const variance = budget - actual; // expense: positive = under budget (good)
    const usedPct = budget > 0 ? Math.round(actual / budget * 100) : (actual > 0 ? 999 : 0);
    const over = line.scope === 'expense' ? actual > budget : actual < budget; // expense over, or income shortfall
    return { budget, actual, variance, usedPct, over };
  }

  function portfolio(periodFilter) {
    let lines = getLines();
    if (periodFilter && periodFilter !== 'all') lines = lines.filter(l => l.period === periodFilter);
    let budgetExp = 0, actualExp = 0, budgetInc = 0, actualInc = 0, overCount = 0;
    lines.forEach(l => {
      const v = lineView(l);
      if (l.scope === 'income') { budgetInc += v.budget; actualInc += v.actual; } else { budgetExp += v.budget; actualExp += v.actual; }
      if (v.over) overCount++;
    });
    return { lines: lines.length, budgetExp, actualExp, budgetInc, actualInc, overCount, expVariance: budgetExp - actualExp, incVariance: actualInc - budgetInc };
  }
  function distinctPeriods() { return Array.from(new Set(getLines().map(l => l.period).filter(Boolean))).sort().reverse(); }

  let activeTab = 'dashboard', editing = null, periodFilter = 'all';
  window.bgOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.bgPeriodFilter = function (v) { periodFilter = v; render(); };
  window.bgOpenForm = function (id) { editing = id || 'new'; activeTab = 'lines'; render(); };
  window.bgCancelForm = function () { editing = null; render(); };

  window.bgSaveLine = function () {
    const b = B(); if (!b) return;
    const name = val('bgName');
    if (!name) { toast('اسم البند مطلوب', 'error'); return; }
    const amount = money(numVal('bgAmount'));
    if (amount <= 0) { toast('قيمة الموازنة مطلوبة', 'error'); return; }
    const base = { name, scope: val('bgScope') || 'expense', period: val('bgPeriod') || thisMonth(), amount, departmentId: val('bgDept'), note: val('bgNote') };
    const ex = editing && editing !== 'new' ? b.lines.find(l => l.id === editing) : null;
    if (ex) { Object.assign(ex, base); audit('budget_update', `تعديل موازنة: ${name}`); toast('تم التحديث', 'success'); }
    else { b.lines.push({ id: uid('bgt'), ...base, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: userName() }); audit('budget_create', `بند موازنة: ${name} (${fmt(amount)} ${curSym()})`); toast('تمت إضافة البند', 'success'); }
    save(); editing = null; render();
  };
  window.bgArchive = function (id) { const l = (B()?.lines || []).find(x => x.id === id); if (!l) return; if (!confirm(`أرشفة بند الموازنة "${l.name}"؟`)) return; l.is_active = false; audit('budget_archive', `أرشفة ${l.name}`); save(); render(); };

  window.bgLoadDemo = function () {
    const b = B(); if (!b) return;
    if (b.lines.length) { toast('توجد بنود مسبقاً', 'info'); return; }
    const pm = thisMonth();
    b.lines.push(
      { id: uid('bgt'), name: 'مصروف المواد', scope: 'expense', period: pm, amount: 5000000, departmentId: '', note: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('bgt'), name: 'الرواتب والأجور', scope: 'expense', period: pm, amount: 8000000, departmentId: '', note: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('bgt'), name: 'مصاريف تشغيل عامة', scope: 'expense', period: pm, amount: 2000000, departmentId: '', note: 'نقل/كهرباء/صيانة', is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('bgt'), name: 'هدف الإيرادات', scope: 'income', period: pm, amount: 20000000, departmentId: '', note: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() }
    );
    audit('budget_demo', 'تحميل موازنة تجريبية');
    save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  function kpi(label, value, sub, cls) { return `<div class="bg-kpi ${cls || ''}"><div class="bg-kpi-val">${value}</div><div class="bg-kpi-label">${label}</div>${sub ? `<div class="bg-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('bgDashBody'); if (!el) return;
    const p = portfolio(periodFilter);
    const hasFinance = typeof window.getFinanceTransactions === 'function';
    const expPct = p.budgetExp > 0 ? Math.round(p.actualExp / p.budgetExp * 100) : 0;
    const incPct = p.budgetInc > 0 ? Math.round(p.actualInc / p.budgetInc * 100) : 0;
    el.innerHTML = `
      ${hasFinance ? '' : '<div class="bg-note">⚠️ تعذّر قراءة الحركات المالية الفعلية في هذه الجلسة — تُعرض القيم الفعلية صفراً.</div>'}
      <div class="bg-kpi-grid">
        ${kpi('موازنة المصاريف', fmt(p.budgetExp) + ' ' + curSym(), `فعلي ${fmt(p.actualExp)} (${expPct}%)`, 'bg-kpi-accent')}
        ${kpi('فرق المصاريف', fmt(p.expVariance) + ' ' + curSym(), p.expVariance >= 0 ? 'ضمن الموازنة' : 'تجاوز', p.expVariance >= 0 ? 'bg-kpi-pos' : 'bg-kpi-neg')}
        ${kpi('هدف الإيرادات', fmt(p.budgetInc) + ' ' + curSym(), `فعلي ${fmt(p.actualInc)} (${incPct}%)`, '')}
        ${kpi('فرق الإيرادات', fmt(p.incVariance) + ' ' + curSym(), p.incVariance >= 0 ? 'تجاوز الهدف' : 'دون الهدف', p.incVariance >= 0 ? 'bg-kpi-pos' : 'bg-kpi-neg')}
        ${kpi('بنود متجاوزة', p.overCount, 'تحتاج انتباهاً', p.overCount ? 'bg-kpi-neg' : '')}
      </div>
      <div class="bg-panel"><div class="bg-panel-head"><h3>الموازنة مقابل الفعلي</h3><button class="bg-mini-btn" onclick="bgOpenTab('lines')">إدارة البنود</button></div>
        ${renderTable(getLines().filter(l => periodFilter === 'all' || l.period === periodFilter))}
      </div>`;
  }

  function renderTable(lines) {
    return `<table class="bg-table"><thead><tr><th>البند</th><th>النوع</th><th>الفترة</th><th>الموازنة</th><th>الفعلي</th><th>الفرق</th><th>الاستهلاك</th></tr></thead>
      <tbody>${lines.map(l => { const v = lineView(l);
        const barCls = v.over ? 'bg-bar-over' : v.usedPct >= 85 ? 'bg-bar-warn' : 'bg-bar-ok';
        return `<tr class="${v.over ? 'bg-row-over' : ''}">
          <td><strong>${esc(l.name)}</strong>${l.departmentId ? `<br><span class="bg-muted">${esc(l.departmentId)}</span>` : ''}</td>
          <td>${SCOPE_LABEL[l.scope] || l.scope}</td><td class="bg-muted">${esc(l.period)}</td>
          <td>${fmt(v.budget)}</td><td><strong>${fmt(v.actual)}</strong></td>
          <td class="${v.variance >= 0 ? 'bg-pos' : 'bg-neg'}">${fmt(v.variance)}</td>
          <td><div class="bg-bar"><div class="bg-bar-fill ${barCls}" style="width:${Math.min(100, v.usedPct)}%"></div></div><span class="bg-muted">${v.usedPct > 998 ? '∞' : v.usedPct}%</span></td>
        </tr>`; }).join('') || '<tr><td colspan="7" class="bg-empty">لا توجد بنود موازنة</td></tr>'}</tbody></table>`;
  }

  function renderLines() {
    const el = document.getElementById('bgLinesBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    const periods = distinctPeriods();
    const pOpt = ['<option value="all">كل الفترات</option>'].concat(periods.map(p => `<option value="${p}" ${periodFilter === p ? 'selected' : ''}>${p}</option>`)).join('');
    el.innerHTML = `
      <div class="bg-toolbar">
        <button class="btn-primary" onclick="bgOpenForm('new')">➕ بند موازنة</button>
        <button class="bg-mini-btn" onclick="bgLoadDemo()">بيانات تجريبية</button>
        <select class="bg-input" onchange="bgPeriodFilter(this.value)" style="max-width:180px">${pOpt}</select>
      </div>
      ${renderTable(getLines().filter(l => periodFilter === 'all' || l.period === periodFilter).concat([]).map(l => l))}
      <div style="margin-top:12px">${getLines().length ? getLines().filter(l => periodFilter === 'all' || l.period === periodFilter).map(l => `<button class="bg-mini-btn" onclick="bgOpenForm('${l.id}')">✏️ ${esc(l.name)}</button> `).join('') : ''}</div>`;
  }
  function renderForm() {
    const l = editing !== 'new' ? (B()?.lines || []).find(x => x.id === editing) : null; const v = l || {};
    const scOpt = Object.entries(SCOPE_LABEL).map(([k, lbl]) => `<option value="${k}" ${v.scope === k ? 'selected' : ''}>${lbl}</option>`).join('');
    const depOpt = ['<option value="">— كل الأقسام —</option>'].concat(distinctDepartments().map(d => `<option value="${esc(d)}" ${v.departmentId === d ? 'selected' : ''}>${esc(d)}</option>`)).join('');
    return `<div class="bg-panel"><div class="bg-panel-head"><h3>${l ? 'تعديل بند موازنة' : 'بند موازنة جديد'}</h3></div>
      <div class="bg-form-grid">
        <div class="bg-form-full"><label>اسم البند *</label><input id="bgName" class="bg-input" value="${esc(v.name || '')}"></div>
        <div><label>النوع</label><select id="bgScope" class="bg-input">${scOpt}</select></div>
        <div><label>الفترة (YYYY-MM أو YYYY)</label><input id="bgPeriod" class="bg-input" value="${esc(v.period || thisMonth())}"></div>
        <div><label>قيمة الموازنة (${curSym()}) *</label><input id="bgAmount" type="number" class="bg-input" value="${money(v.amount) || ''}"></div>
        <div><label>القسم (اختياري)</label><select id="bgDept" class="bg-input">${depOpt}</select></div>
        <div class="bg-form-full"><label>ملاحظة</label><input id="bgNote" class="bg-input" value="${esc(v.note || '')}"></div>
      </div>
      <div class="bg-form-actions"><button class="btn-primary" onclick="bgSaveLine()">حفظ</button><button class="bg-mini-btn" onclick="bgCancelForm()">إلغاء</button></div>
      <p class="bg-muted" style="margin-top:10px">الفعلي يُحتسب تلقائياً من الحركات المالية المطابقة للنوع والفترة والقسم (قراءة فقط).</p></div>`;
  }

  function renderTabContent() {
    const map = { bgDashBody: 'dashboard', bgLinesBody: 'lines' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else renderLines();
  }
  function render() {
    const body = document.getElementById('budgetingBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['lines', '🧮 بنود الموازنة']];
    body.innerHTML = `<div class="bg-tabs">${tabs.map(([k, l]) => `<button class="bg-tab-btn ${activeTab === k ? 'active' : ''}" onclick="bgOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="bgDashBody"></div><div id="bgLinesBody"></div>`;
    renderTabContent();
  }
  window.renderBudgeting = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'budgeting') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageBudgeting'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navBudgeting'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('budgeting');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_budget_today'] = function () {
          const p = portfolio('all');
          return { budgetLines: p.lines, expenseBudget: p.budgetExp, expenseActual: p.actualExp, expenseVariance: p.expVariance, incomeBudget: p.budgetInc, incomeActual: p.actualInc, incomeVariance: p.incVariance, overBudgetLines: p.overCount };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['budgeting'] = '#pageBudgeting';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonBudgeting = { render, ensureData, portfolio, lineView };
})();
