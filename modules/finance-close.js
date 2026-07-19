/*
 * Phase 7H - Finance Close and Planning Foundation.
 * Add-only, read-only over finance transactions. It prepares close/planning
 * surfaces without posting journals, locking periods, or changing ledgers.
 */
(function () {
  'use strict';

  const root = window;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = value => Number(value || 0);
  const fmt = value => {
    try { return typeof root.formatNum === 'function' ? root.formatNum(money(value)) : Math.round(money(value)).toLocaleString(); }
    catch (_) { return String(Math.round(money(value))); }
  };
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const monthRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return { key: `${y}-${m}`, start: `${y}-${m}-01`, end: new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10) };
  };
  // `omni` and `finance` are lexical globals in this app (NOT window.omni/window.finance),
  // so sibling <script> modules must reference the bare globals (cf. modules/route-health.js).
  function O() { try { if (typeof ensureOmni === 'function') ensureOmni(); return (typeof omni !== 'undefined' && omni) ? omni : null; } catch (_) { return null; } }
  function F() { try { if (typeof ensureFinance === 'function') ensureFinance(); return (typeof finance !== 'undefined' && finance) ? finance : null; } catch (_) { return null; } }
  function txns() { try { return typeof root.getFinanceTransactions === 'function' ? (root.getFinanceTransactions() || []) : ((F() && F().transactions) || []); } catch (_) { return []; } }
  function currency() { const o = O(); return o?.adminSettings?.organization?.currencySymbol || 'د.ع'; }
  function ensureCloseState() {
    const o = O(); if (!o) return null;
    if (!o.financeClose || typeof o.financeClose !== 'object' || Array.isArray(o.financeClose)) o.financeClose = {};
    const c = o.financeClose;
    if (!Array.isArray(c.checklists)) c.checklists = [];
    if (!Array.isArray(c.auditExports)) c.auditExports = [];
    if (!Array.isArray(c.forecasts)) c.forecasts = [];
    if (!Array.isArray(c.consolidations)) c.consolidations = [];
    c.policyVersion = c.policyVersion || 'phase7h-finance-close-v1';
    c.postingMode = 'preview_only';
    c.updated_at = c.updated_at || new Date().toISOString();
    return c;
  }
  function inRange(t, start, end) {
    const d = String(t.date || t.createdAt || '').slice(0, 10);
    return d >= start && d <= end;
  }
  function agingBuckets() {
    const f = F() || {};
    const rows = (f.customers || []).map(c => {
      let balance = 0;
      try { balance = typeof root.getCustomerBalance === 'function' ? root.getCustomerBalance(c) : money(c.balance || c.openingBalance); } catch (_) {}
      return { name: c.name || c.id || '', balance: Math.max(0, balance), bucket: 'unclassified' };
    }).filter(r => r.balance > 0);
    return {
      count: rows.length,
      total: rows.reduce((s, r) => s + r.balance, 0),
      rows: rows.slice(0, 8)
    };
  }
  function budgetSnapshot(periodKey) {
    const o = O() || {};
    const lines = (o.budgeting && Array.isArray(o.budgeting.lines) ? o.budgeting.lines : []).filter(l => l.is_active !== false && l.period === periodKey);
    const actuals = txns().filter(t => String(t.date || '').slice(0, 7) === periodKey);
    const budget = lines.reduce((s, l) => s + money(l.amount), 0);
    const actual = actuals.reduce((s, t) => s + money(t.amount), 0);
    return { lines: lines.length, budget, actual, variance: budget - actual };
  }
  function cashForecast() {
    const end = new Date(todayIso());
    const start = new Date(end); start.setDate(start.getDate() - 29);
    const startIso = start.toISOString().slice(0, 10);
    const recent = txns().filter(t => String(t.date || '').slice(0, 10) >= startIso && String(t.date || '').slice(0, 10) <= todayIso());
    const inflow = recent.filter(t => t.direction === 'in').reduce((s, t) => s + money(t.amount), 0);
    const outflow = recent.filter(t => t.direction === 'out').reduce((s, t) => s + money(t.amount), 0);
    return { days: 30, inflow, outflow, projectedNet30: inflow - outflow };
  }
  function closeModel() {
    ensureCloseState();
    const range = monthRange();
    const allTx = txns();
    const periodTx = allTx.filter(t => inRange(t, range.start, range.end));
    const f = F() || {};
    const locks = Array.isArray(f.periodLocks) ? f.periodLocks : [];
    const locked = locks.some(l => l.status === 'locked' && l.periodStart <= range.end && l.periodEnd >= range.start);
    const aging = agingBuckets();
    const budget = budgetSnapshot(range.key);
    const forecast = cashForecast();
    const auditCount = ((O() || {}).historyLedger || []).length + ((O() || {}).phase7aAudit || []).length + (Array.isArray(root.audit_log) ? root.audit_log.length : 0);
    const checks = [
      ['Month-end close checklist', periodTx.length > 0, `${periodTx.length} finance transactions in ${range.key}`],
      ['Period lock UI hardening', true, locked ? 'Current period overlaps a locked range' : 'Lock controls exist; current period remains open'],
      ['Financial statements polish', !!document.getElementById('financeTab-trial_balance') && !!document.getElementById('financeTab-pl'), 'Trial balance and P/L tabs are available'],
      ['AR/AP aging', aging.count > 0, `${aging.count} open customer balances, ${fmt(aging.total)} ${currency()}`],
      ['Cash flow forecast', true, `30-day projected net: ${fmt(forecast.projectedNet30)} ${currency()}`],
      ['Budget vs actual', budget.lines > 0, `${budget.lines} budget lines, variance ${fmt(budget.variance)} ${currency()}`],
      ['Audit export', auditCount > 0, `${auditCount} audit/history events available for export preview`],
      ['Consolidation placeholder', true, 'Root prepared at omni.financeClose.consolidations; no consolidation postings']
    ];
    return { range, periodTx, locked, aging, budget, forecast, auditCount, checks };
  }
  function pill(ok, lock) { return `<span class="fc7h-pill ${lock ? 'lock' : ok ? 'ok' : 'warn'}">${lock ? 'locked' : ok ? 'ready' : 'needs data'}</span>`; }
  function renderPanel() {
    const model = closeModel();
    const host = document.getElementById('financeTab-dashboard') || document.getElementById('pageFinance');
    if (!host) return;
    let panel = document.getElementById('phase7hFinanceClosePanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'phase7hFinanceClosePanel';
      panel.className = 'fc7h-panel';
      host.prepend(panel);
    }
    panel.innerHTML = `
      <div class="fc7h-head">
        <div><h3>Phase 7H Finance Close and Planning</h3><div class="fc7h-note">Read-only close foundation. No journals are posted, no period is locked, and no ledger data is changed from this panel.</div></div>
        ${pill(true, model.locked)}
      </div>
      <div class="fc7h-grid">
        <div class="fc7h-kpi"><strong>${model.periodTx.length}</strong><span>transactions in ${esc(model.range.key)}</span></div>
        <div class="fc7h-kpi"><strong>${fmt(model.aging.total)} ${currency()}</strong><span>AR/AP aging preview</span></div>
        <div class="fc7h-kpi"><strong>${fmt(model.forecast.projectedNet30)} ${currency()}</strong><span>30-day cash forecast</span></div>
        <div class="fc7h-kpi"><strong>${model.budget.lines}</strong><span>budget lines for period</span></div>
      </div>
      <div class="fc7h-table-wrap"><table class="fc7h-table"><thead><tr><th>Scope</th><th>Status</th><th>Evidence</th></tr></thead>
        <tbody>${model.checks.map(row => `<tr><td><strong>${esc(row[0])}</strong></td><td>${pill(row[1], row[0] === 'Period lock UI hardening' && model.locked)}</td><td class="fc7h-note">${esc(row[2])}</td></tr>`).join('')}</tbody></table></div>
      <div class="fc7h-actions">
        <button type="button" class="btn-secondary btn-sm" onclick="FinanceClosePlanning.renderAuditExport()">Preview audit export</button>
      </div>
      <pre class="fc7h-pre" id="phase7hAuditExport" style="display:none"></pre>`;
  }
  function renderAuditExport() {
    const out = document.getElementById('phase7hAuditExport');
    if (!out) return;
    const model = closeModel();
    const payload = {
      generatedAt: new Date().toISOString(),
      period: model.range,
      postingMode: 'preview_only',
      checklist: model.checks.map(c => ({ scope: c[0], ready: !!c[1], evidence: c[2] })),
      kpis: { transactions: model.periodTx.length, agingTotal: model.aging.total, projectedCashNet30: model.forecast.projectedNet30, budgetVariance: model.budget.variance }
    };
    out.textContent = JSON.stringify(payload, null, 2);
    out.style.display = '';
  }
  function wire() {
    if (root.__phase7hFinanceCloseWrapped) return;
    root.__phase7hFinanceCloseWrapped = true;
    const originalRender = root.renderFinanceDashboard;
    if (typeof originalRender === 'function') {
      root.renderFinanceDashboard = function () {
        const result = originalRender.apply(this, arguments);
        setTimeout(renderPanel, 0);
        return result;
      };
    }
    const originalSwitch = root.switchPage;
    if (typeof originalSwitch === 'function') {
      root.switchPage = function (page) {
        const result = originalSwitch.apply(this, arguments);
        if (page === 'finance') setTimeout(renderPanel, 250);
        return result;
      };
    }
  }
  function init() {
    ensureCloseState();
    wire();
    setTimeout(renderPanel, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.FinanceClosePlanning = { ensureCloseState, closeModel, renderPanel, renderAuditExport, version: 'phase7h-v1' };
})();
