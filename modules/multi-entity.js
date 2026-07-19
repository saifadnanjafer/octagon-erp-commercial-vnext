/* ============================================================================
 * Octagon OMNISYSTEM - GO 25: Multi-warehouse + Multi-currency + Multi-company
 * ----------------------------------------------------------------------------
 * Self-contained module (same de-monolith pattern as modules/mrp.js):
 *   1. Currencies & FX  — base currency + editable exchange-rate table + a
 *                         converter + live multi-currency revaluation of real
 *                         totals (inventory valuation, reserved, MRP spend).
 *                         THIS is the genuinely-missing piece: the app had a
 *                         currency *symbol* setting but NO rate table anywhere.
 *   2. Branches/Companies — consolidated company control: switch the active
 *                         company (reuses updateActiveCompany), add a company,
 *                         per-company quick stats + consolidation summary.
 *   3. Multi-Warehouse  — a per-location breakdown layer over each material's
 *                         existing single `stock` number (invariant: the sum
 *                         across locations == material.stock), with WORKING
 *                         inter-warehouse transfers + a transfer log.
 *
 * 100% offline / local-first. Add-only: new omni collections (omni.fx,
 *   omni.warehouseStock, omni.warehouseTransfers) + a new sidebar page
 *   `multi_entity`. Zero app.js edits (wraps switchPage; uses the bare global
 *   `omni`, NOT window.omni). Reads org companies/currency + db.locations and
 *   exposes window.OctagonFX for other modules.
 * ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------- safe helpers ----------------------------- */
  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni || typeof window.omni !== 'object') window.omni = {};
    return window.omni;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fnum(v, dp) {
    const n = Number(v); if (!isFinite(n)) return '0';
    try { return n.toLocaleString('en-US', { maximumFractionDigits: dp == null ? 0 : dp }); }
    catch (_) { return String(n); }
  }
  function toast(msg, kind) { if (typeof window.showToast === 'function') { try { return window.showToast(msg, kind || 'info'); } catch (_) {} } }
  function save() { if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} } }
  function uid(p) { if (typeof window.makeId === 'function') { try { return window.makeId(p); } catch (_) {} } return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // Currency catalogue — prefer the app's global list, else a built-in fallback.
  function currencyOptions() {
    try { if (typeof ORG_CURRENCY_OPTIONS !== 'undefined' && Array.isArray(ORG_CURRENCY_OPTIONS)) return ORG_CURRENCY_OPTIONS; } catch (_) {}
    return [
      { code: 'IQD', symbol: 'د.ع', label: 'دينار عراقي (IQD)' },
      { code: 'USD', symbol: '$', label: 'دولار أمريكي (USD)' },
      { code: 'EUR', symbol: '€', label: 'يورو (EUR)' },
      { code: 'SAR', symbol: 'ر.س', label: 'ريال سعودي (SAR)' },
      { code: 'AED', symbol: 'د.إ', label: 'درهم إماراتي (AED)' },
      { code: 'TRY', symbol: '₺', label: 'ليرة تركية (TRY)' }
    ];
  }
  function curSymbol(code) { const c = currencyOptions().find(x => x.code === code); return c ? c.symbol : code; }
  function orgCurrency() { try { return O().adminSettings?.organization?.currency || 'IQD'; } catch (_) { return 'IQD'; } }

  // Approximate default rates = BASE-currency units per 1 unit of `code`,
  // expressed against IQD. (Editable by the user; placeholders for 2026.)
  const DEFAULT_RATES_VS_IQD = { IQD: 1, USD: 1320, EUR: 1440, SAR: 352, AED: 359, TRY: 40 };

  function locations() {
    // Top-level db.locations (managed by OctagonDB/StockService); fallback to
    // the known 5 if the service db isn't reachable yet.
    try {
      const cache = (window.OctagonDB || window.PentagonDB)?.cache;
      if (cache && Array.isArray(cache.locations) && cache.locations.length) {
        return cache.locations.filter(l => l.type === 'internal' || l.type === 'inventory');
      }
    } catch (_) {}
    return [
      { id: 'LOC_MAIN', name: 'المخزن الرئيسي', type: 'internal' },
      { id: 'LOC_WIP', name: 'ورشة التنفيذ', type: 'internal' },
      { id: 'LOC_SCRAP', name: 'التالف', type: 'inventory' }
    ];
  }

  /* ------------------------------ module state --------------------------- */
  const state = { tab: 'fx', conv: { amount: 100, from: 'USD', to: 'IQD' } };

  /* ============================ DATA / SEEDING =========================== */
  function ensureData() {
    const omni = O();
    const base = orgCurrency();
    if (!omni.fx || typeof omni.fx !== 'object') {
      omni.fx = { base, rates: {}, updatedAt: new Date().toISOString(), history: [] };
    }
    if (!omni.fx.rates || typeof omni.fx.rates !== 'object') omni.fx.rates = {};
    if (!omni.fx.base) omni.fx.base = base;
    // Ensure every catalogue currency has a rate expressed in the CURRENT base.
    currencyOptions().forEach(c => {
      if (omni.fx.rates[c.code] == null) {
        // derive base-relative default from the IQD table
        const vsIqdCode = DEFAULT_RATES_VS_IQD[c.code] || 1;
        const vsIqdBase = DEFAULT_RATES_VS_IQD[omni.fx.base] || 1;
        omni.fx.rates[c.code] = +(vsIqdCode / vsIqdBase).toFixed(6);
      }
    });
    omni.fx.rates[omni.fx.base] = 1;
    if (!Array.isArray(omni.fx.history)) omni.fx.history = [];

    // Warehouse breakdown layer — keep Σ(locations) == material.stock.
    if (!omni.warehouseStock || typeof omni.warehouseStock !== 'object') omni.warehouseStock = {};
    if (!Array.isArray(omni.warehouseTransfers)) omni.warehouseTransfers = [];
    reconcileWarehouse();
    return omni;
  }

  // Self-healing: make sure each material's per-location quantities sum to its
  // master `stock`. Any drift (purchases, MRP, manual edits) lands in LOC_MAIN.
  function reconcileWarehouse() {
    const omni = O();
    const ws = omni.warehouseStock;
    (omni.materials || []).forEach(m => {
      if (!ws[m.id] || typeof ws[m.id] !== 'object') ws[m.id] = { LOC_MAIN: Number(m.stock) || 0 };
      const locs = ws[m.id];
      let sum = 0; Object.keys(locs).forEach(k => { sum += Number(locs[k]) || 0; });
      const total = Number(m.stock) || 0;
      const delta = total - sum;
      if (Math.abs(delta) > 0.0001) locs.LOC_MAIN = (Number(locs.LOC_MAIN) || 0) + delta;
      Object.keys(locs).forEach(k => { if ((Number(locs[k]) || 0) < 0.0001 && k !== 'LOC_MAIN') delete locs[k]; });
    });
  }

  /* ============================== FX ENGINE ============================= */
  // rate[code] = base units per 1 unit of code. convert via the base pivot.
  function rateOf(code) { const r = O().fx.rates[code]; return (r == null || !isFinite(r) || r <= 0) ? 1 : Number(r); }
  function convert(amount, from, to) {
    const a = Number(amount) || 0;
    const baseVal = a * rateOf(from);          // -> base currency
    return baseVal / rateOf(to);               // -> target currency
  }
  function fromBase(amount, to) { return (Number(amount) || 0) / rateOf(to); }
  function fmtCur(amount, code) {
    return fnum(amount, code === O().fx.base ? 0 : 2) + ' ' + curSymbol(code);
  }

  // Live totals (in BASE currency) for revaluation.
  function liveTotals() {
    const omni = O();
    const mats = omni.materials || [];
    const invValue = mats.reduce((s, m) => s + (Number(m.stock) || 0) * (Number(m.cost) || 0), 0);
    const reservedValue = mats.reduce((s, m) => s + (Number(m.reserved) || 0) * (Number(m.cost) || 0), 0);
    const lastRun = (omni.mrpRuns || [])[0];
    const mrpSpend = lastRun ? (Number(lastRun.totalCost) || 0) : 0;
    const poValue = (omni.purchaseOrders || []).filter(p => p && p.status !== 'cancelled')
      .reduce((s, p) => s + (Number(p.total) || Number(p.totalAmount) || 0), 0);
    return [
      { label: 'قيمة المخزون (تكلفة)', base: invValue },
      { label: 'قيمة المحجوز', base: reservedValue },
      { label: 'قيمة أوامر الشراء المفتوحة', base: poValue },
      { label: 'آخر شراء مقترح من MRP', base: mrpSpend }
    ];
  }

  /* ======================= TENANT / COMPANY ISOLATION ==================== */
  const TENANT_COLLECTIONS = [
    { path: 'finance.customers', label: 'عملاء المالية', page: 'customers', owner: 'Finance' },
    { path: 'finance.transactions', label: 'حركات المالية', page: 'finance', owner: 'Finance' },
    { path: 'finance.receipts', label: 'الإيصالات', page: 'receipt', owner: 'Finance' },
    { path: 'materials', label: 'المواد والمخزون', page: 'inventory', owner: 'Operations' },
    { path: 'purchaseOrders', label: 'أوامر الشراء', page: 'procurement', owner: 'Procurement' },
    { path: 'suppliers', label: 'الموردون', page: 'procurement', owner: 'Procurement' },
    { path: 'jobOrders', label: 'أوامر عمل الورشة', page: 'work_orders', owner: 'Workshop' },
    { path: 'workOrderIssues', label: 'مشاكل أوامر العمل', page: 'work_orders', owner: 'Workshop' },
    { path: 'approvalHub.requests', label: 'طلبات الموافقات', page: 'approvals', owner: 'Approvals' },
    { path: 'helpdesk.tickets', label: 'تذاكر خدمة العملاء', page: 'helpdesk', owner: 'Helpdesk' },
    { path: 'fieldService.visits', label: 'زيارات الخدمة الميدانية', page: 'field_service', owner: 'Field Service' },
    { path: 'projectHub.projects', label: 'المشاريع', page: 'projects', owner: 'Projects' },
    { path: 'projectHub.tasks', label: 'مهام المشاريع', page: 'projects', owner: 'Projects' },
    { path: 'assetRegister.assets', label: 'الأصول', page: 'assets', owner: 'Assets' },
    { path: 'assetRegister.maintenanceLogs', label: 'سجلات صيانة الأصول', page: 'assets', owner: 'Assets' },
    { path: 'subscriptionHub.plans', label: 'باقات الاشتراك', page: 'subscriptions', owner: 'Subscriptions' },
    { path: 'subscriptionHub.subscriptions', label: 'اشتراكات العملاء', page: 'subscriptions', owner: 'Subscriptions' },
    { path: 'subscriptionHub.invoices', label: 'فواتير الاشتراكات', page: 'subscriptions', owner: 'Subscriptions' },
    { path: 'rentalHub.items', label: 'معدات التأجير', page: 'rental', owner: 'Rental' },
    { path: 'rentalHub.agreements', label: 'عقود التأجير', page: 'rental', owner: 'Rental' },
    { path: 'fleet.vehicles', label: 'المركبات', page: 'fleet', owner: 'Fleet' },
    { path: 'fleet.fuelLogs', label: 'سجلات الوقود', page: 'fleet', owner: 'Fleet' },
    { path: 'fleet.trips', label: 'رحلات المركبات', page: 'fleet', owner: 'Fleet' },
    { path: 'documents.docs', label: 'الوثائق', page: 'documents', owner: 'DMS' },
    { path: 'marketing.campaigns', label: 'الحملات التسويقية', page: 'marketing', owner: 'Marketing' },
    { path: 'budgeting.lines', label: 'بنود الموازنة', page: 'budgeting', owner: 'Budgeting' },
    { path: 'warrantyHub.warranties', label: 'الضمانات', page: 'warranty', owner: 'Warranty' },
    { path: 'warrantyHub.claims', label: 'مطالبات الضمان', page: 'warranty', owner: 'Warranty' },
    { path: 'enterpriseSuite.banking.records', label: 'Banking Records', page: 'banking', owner: 'Banking' },
    { path: 'enterpriseSuite.ar_ap.records', label: 'AR/AP Records', page: 'ar_ap', owner: 'Finance' },
    { path: 'enterpriseSuite.contracts.records', label: 'Contract Records', page: 'contracts', owner: 'Legal' },
    { path: 'enterpriseSuite.logistics.records', label: 'Logistics Records', page: 'logistics', owner: 'Logistics' },
    { path: 'enterpriseSuite.supplier_portal.records', label: 'Supplier Portal Records', page: 'supplier_portal', owner: 'Supplier Portal' },
    { path: 'enterpriseSuite.integration_hub.records', label: 'Integration Hub Records', page: 'integration_hub', owner: 'Integration Hub' },
    { path: 'enterpriseSuite.security_center.records', label: 'Security Center Records', page: 'security_center', owner: 'Security' },
    { path: 'enterpriseSuite.data_quality.records', label: 'Data Quality Records', page: 'data_quality', owner: 'Data Quality' },
    { path: 'enterpriseSuite.training_lms.records', label: 'Training Records', page: 'training_lms', owner: 'Training' },
    { path: 'enterpriseSuite.scenario_planner.records', label: 'Scenario Planner Records', page: 'scenario_planner', owner: 'Planning' },
    { path: 'enterpriseSuite.device_center.records', label: 'Device Center Records', page: 'device_center', owner: 'Device Center' }
  ];

  function activeProfile() {
    try { if (window.TenantService && typeof TenantService.activeProfile === 'function') return TenantService.activeProfile() || {}; } catch (_) {}
    try {
      if (typeof window.getActiveOrgProfile === 'function') return window.getActiveOrgProfile() || {};
    } catch (_) {}
    const org = O().adminSettings?.organization || {};
    const companies = Array.isArray(org.companies) ? org.companies : [];
    const company = companies.find(co => co.id === org.activeCompanyId) || companies.find(co => co.isPrimary) || companies[0] || {};
    return {
      companyId: company.id || '',
      companyName: company.name || org.name || '',
      currency: org.currency || 'IQD',
      currencySymbol: org.currencySymbol || curSymbol(org.currency || 'IQD')
    };
  }
  function activeCompanyId() { return activeProfile().companyId || ''; }
  function tenantEnabled() {
    try { if (window.TenantService && typeof TenantService.enabled === 'function') return TenantService.enabled(); } catch (_) {}
    return !!O().adminSettings?.organization?.multiTenant;
  }
  function tenantRecordCompanyId(record) {
    try { if (window.TenantService && typeof TenantService.recordCompanyId === 'function') return TenantService.recordCompanyId(record); } catch (_) {}
    if (!record || typeof record !== 'object') return '';
    return record.companyId || record.company_id || record.tenantCompanyId || '';
  }
  function getByPath(path) {
    return String(path || '').split('.').filter(Boolean).reduce((cur, key) => cur && cur[key], O());
  }
  function collectionRows(path) {
    const rows = getByPath(path);
    return Array.isArray(rows) ? rows : [];
  }
  function liveTenantRows(path) {
    return collectionRows(path).filter(row => row && row.is_active !== false && row.archived !== true);
  }
  function stampTenant(record, opts = {}) {
    try { if (window.TenantService && typeof TenantService.stamp === 'function') return TenantService.stamp(record, opts); } catch (_) {}
    if (!record || typeof record !== 'object') return record;
    const profile = opts.profile || activeProfile();
    if (!profile.companyId) return record;
    const existing = tenantRecordCompanyId(record);
    if (existing && !opts.force) return record;
    record.companyId = profile.companyId;
    record.companyName = profile.companyName || record.companyName || '';
    if (profile.currency && !record.currency) record.currency = profile.currency;
    if (profile.currencySymbol && !record.currencySymbol) record.currencySymbol = profile.currencySymbol;
    if (!record.tenantStampedAt) record.tenantStampedAt = new Date().toISOString();
    return record;
  }
  function tenantScopeList(array, opts = {}) {
    try {
      if (window.TenantService && typeof TenantService.scope === 'function') {
        return TenantService.scope(opts.collection || 'omni', array, { ...opts, collectionScoped: true });
      }
    } catch (_) {}
    const list = Array.isArray(array) ? array : [];
    if (!tenantEnabled() && !opts.force) return list;
    const companyId = opts.companyId || activeCompanyId();
    if (!companyId) return list;
    const includeGlobal = opts.includeGlobal !== false;
    return list.filter(item => {
      const id = tenantRecordCompanyId(item);
      if (!id) return includeGlobal;
      return id === companyId;
    });
  }
  function tenantCollectionStatus() {
    const companyId = activeCompanyId();
    return TENANT_COLLECTIONS.map(def => {
      const rows = liveTenantRows(def.path);
      const active = rows.filter(row => tenantRecordCompanyId(row) === companyId).length;
      const missing = rows.filter(row => !tenantRecordCompanyId(row)).length;
      const foreign = rows.filter(row => {
        const id = tenantRecordCompanyId(row);
        return id && id !== companyId;
      }).length;
      return { ...def, total: rows.length, active, missing, foreign, ready: missing === 0 };
    });
  }
  function tenantSummary() {
    const rows = tenantCollectionStatus();
    const sum = key => rows.reduce((n, row) => n + row[key], 0);
    const total = sum('total');
    const missing = sum('missing');
    return {
      rows,
      total,
      active: sum('active'),
      missing,
      foreign: sum('foreign'),
      readyCollections: rows.filter(row => row.ready).length,
      score: total ? Math.round(((total - missing) / total) * 100) : 100
    };
  }
  function claimTenantCollection(path, opts = {}) {
    const def = TENANT_COLLECTIONS.find(row => row.path === path);
    if (!def) return 0;
    const profile = activeProfile();
    let count = 0;
    liveTenantRows(path).forEach(row => {
      if (!tenantRecordCompanyId(row)) {
        stampTenant(row, { profile });
        count++;
      }
    });
    if (count) {
      try {
        if (typeof window.recordOmniHistoryEvent === 'function') {
          window.recordOmniHistoryEvent({
            module: 'multi_entity',
            source: 'tenant_isolation',
            action: 'tenant_claim',
            summary: `تم وسم ${count} سجل في ${def.label} للشركة ${profile.companyName || profile.companyId}`,
            payload: { path, count, companyId: profile.companyId }
          });
        }
      } catch (_) {}
      if (!opts.silent) toast(`تم وسم ${count} سجل باسم الشركة النشطة`, 'success');
      save();
    } else if (!opts.silent) {
      toast('لا توجد سجلات غير موسومة في هذه المجموعة', 'info');
    }
    return count;
  }
  function claimAllTenantMissing() {
    let count = 0;
    TENANT_COLLECTIONS.forEach(def => { count += claimTenantCollection(def.path, { silent: true }); });
    if (count) {
      save();
      toast(`تم وسم ${count} سجل غير موسوم باسم الشركة النشطة`, 'success');
    } else {
      toast('كل السجلات الحالية تحمل سياق شركة أو لا توجد بيانات', 'info');
    }
    render();
    return count;
  }
  function setTenantIsolation(enabled) {
    const omni = O();
    if (!omni.adminSettings || typeof omni.adminSettings !== 'object') omni.adminSettings = {};
    if (!omni.adminSettings.organization || typeof omni.adminSettings.organization !== 'object') omni.adminSettings.organization = {};
    omni.adminSettings.organization.multiTenant = !!enabled;
    save();
    render();
    toast(enabled ? 'تم تفعيل عزل بيانات الشركات' : 'تم تعطيل عزل بيانات الشركات', enabled ? 'success' : 'info');
  }

  /* ============================== RENDER ================================ */
  function host() { return document.getElementById('meBody'); }
  function render() {
    ensureData();
    const el = host(); if (!el) return;
    const tabs = [['fx', '💱 العملات والصرف'], ['branches', '🏢 الشركات والفروع'], ['warehouses', '🏬 المخازن المتعددة'], ['tenants', '🧩 عزل البيانات']];
    el.innerHTML = `
      <div class="me-wrap">
        <div class="me-tabs">
          ${tabs.map(t => `<button class="me-tab ${state.tab === t[0] ? 'active' : ''}" onclick="meSetTab('${t[0]}')">${t[1]}</button>`).join('')}
        </div>
        <div class="me-tabbody">${
          state.tab === 'fx' ? renderFx() :
          state.tab === 'branches' ? renderBranches() :
          state.tab === 'warehouses' ? renderWarehouses() :
          renderTenantIsolation()
        }</div>
      </div>`;
  }

  /* ----- Tab 1: Currencies & FX ----- */
  function renderFx() {
    const omni = O();
    const opts = currencyOptions();
    const base = omni.fx.base;
    const baseOpts = opts.map(c => `<option value="${c.code}" ${base === c.code ? 'selected' : ''}>${esc(c.label)}</option>`).join('');

    const rateRows = opts.map(c => {
      const isBase = c.code === base;
      return `<tr class="${isBase ? 'base' : ''}">
        <td>${esc(c.label)} <span class="me-sym">${esc(c.symbol)}</span></td>
        <td>${isBase ? '<span class="me-badge ok">العملة الأساس</span>' :
          `<input type="number" min="0" step="0.0001" value="${rateOf(c.code)}" onchange="meSetRate('${c.code}',this.value)" style="width:120px"> <span class="me-muted">${esc(curSymbol(base))} لكل 1 ${esc(c.symbol)}</span>`}</td>
        <td>${isBase ? '1' : '<span class="me-muted">' + fnum(1 / rateOf(c.code), 4) + ' ' + esc(c.symbol) + ' لكل 1 ' + esc(curSymbol(base)) + '</span>'}</td>
      </tr>`;
    }).join('');

    // Converter
    const cv = state.conv;
    const convResult = convert(cv.amount, cv.from, cv.to);
    const sel = (id, val) => opts.map(c => `<option value="${c.code}" ${val === c.code ? 'selected' : ''}>${c.code} ${esc(c.symbol)}</option>`).join('');

    // Revaluation
    const displayCode = cv.to;
    const totals = liveTotals();
    const revalRows = totals.map(t => `<tr>
      <td>${esc(t.label)}</td>
      <td>${fmtCur(t.base, base)}</td>
      <td><b>${fmtCur(fromBase(t.base, displayCode), displayCode)}</b></td>
    </tr>`).join('');

    const hist = (omni.fx.history || []).slice(0, 6).map(h =>
      `<li><span class="me-muted">${new Date(h.at).toLocaleString('ar')}</span> — ${esc(h.code)} = ${fnum(h.rate, 4)} ${esc(curSymbol(base))}</li>`).join('') || '<li class="me-muted">لا يوجد سجل تعديلات بعد</li>';

    return `
      <div class="me-fx-head">
        <label>العملة الأساس (Base) <select onchange="meSetBase(this.value)">${baseOpts}</select></label>
        <span class="me-muted">كل الأسعار تُحوّل عبر العملة الأساس. آخر تحديث: ${new Date(omni.fx.updatedAt).toLocaleString('ar')}</span>
      </div>

      <div class="me-grid2">
        <div class="me-card">
          <h4>جدول أسعار الصرف (Exchange Rates)</h4>
          <table class="me-table"><thead><tr><th>العملة</th><th>السعر مقابل الأساس</th><th>المعكوس</th></tr></thead>
          <tbody>${rateRows}</tbody></table>
        </div>
        <div class="me-card">
          <h4>محوّل العملات</h4>
          <div class="me-conv">
            <input type="number" value="${cv.amount}" onchange="meConv('amount',this.value)" style="flex:1">
            <select onchange="meConv('from',this.value)">${sel('from', cv.from)}</select>
            <span>➜</span>
            <select onchange="meConv('to',this.value)">${sel('to', cv.to)}</select>
          </div>
          <div class="me-conv-result">${fnum(cv.amount, 2)} ${esc(curSymbol(cv.from))} = <b>${fnum(convResult, 2)} ${esc(curSymbol(cv.to))}</b></div>

          <h4 style="margin-top:18px">إعادة تقييم القيم الحية بالعملة (${esc(displayCode)})</h4>
          <table class="me-table"><thead><tr><th>البند</th><th>بالأساس (${esc(base)})</th><th>بـ ${esc(displayCode)}</th></tr></thead>
          <tbody>${revalRows}</tbody></table>
          <p class="me-muted" style="margin-top:6px">للعرض فقط — لا يُعدّل أي قيد مالي. غيّر عملة العرض من قائمة «إلى».</p>
        </div>
      </div>
      <div class="me-card" style="margin-top:12px">
        <h4>سجل تعديل الأسعار</h4><ul class="me-hist">${hist}</ul>
      </div>`;
  }

  /* ----- Tab 2: Branches / Companies ----- */
  function renderBranches() {
    const omni = O();
    const org = omni.adminSettings?.organization || {};
    const companies = (typeof window.getOrgCompanies === 'function' ? window.getOrgCompanies() : (org.companies || [])) || [];
    const activeId = org.activeCompanyId;

    const cards = companies.map(co => `<div class="me-co ${co.id === activeId ? 'active' : ''}">
      <div class="me-co-logo">${esc(co.logoEmoji || '🏭')}</div>
      <div class="me-co-body">
        <div class="me-co-name">${esc(co.name || 'بدون اسم')} ${co.isPrimary ? '<span class="me-badge ok">رئيسية</span>' : ''} ${co.id === activeId ? '<span class="me-badge ver">نشطة</span>' : ''}</div>
        <div class="me-muted">${esc(co.address || 'بدون عنوان')} · ${esc(co.phone || 'بدون هاتف')} · ${(co.departments || []).length} قسم</div>
      </div>
      <div class="me-co-actions">
        ${co.id === activeId ? '<span class="me-badge">مختارة الآن</span>' : `<button class="me-btn sm" onclick="meSetActiveCompany('${co.id}')">تفعيل</button>`}
      </div>
    </div>`).join('') || '<div class="me-empty">لا توجد شركات — أضف واحدة.</div>';

    const totalDepts = companies.reduce((s, c) => s + (c.departments || []).length, 0);
    return `
      <div class="me-kpis">
        <div class="me-kpi"><div class="v">${fnum(companies.length)}</div><div class="l">شركات / فروع</div></div>
        <div class="me-kpi"><div class="v">${fnum(totalDepts)}</div><div class="l">أقسام إجمالية</div></div>
        <div class="me-kpi"><div class="v">${esc(org.currency || 'IQD')}</div><div class="l">عملة المجموعة</div></div>
      </div>
      <div class="me-newco">
        <input id="meNewCo" placeholder="اسم شركة / فرع جديد">
        <button class="me-btn" onclick="meAddCompany()">➕ إضافة فرع</button>
      </div>
      <div class="me-co-list">${cards}</div>
      <p class="me-muted">الشركة النشطة تنعكس على الإيصالات والتقارير وترويسة الطباعة عبر <code>getActiveOrgProfile()</code>. الإدارة الكاملة للأقسام في لوحة الأدمن.</p>`;
  }

  /* ----- Tab 3: Multi-Warehouse ----- */
  function renderWarehouses() {
    const omni = O();
    const locs = locations();
    const mats = omni.materials || [];
    const ws = omni.warehouseStock;

    // per-location valuation
    const locTotals = {};
    locs.forEach(l => { locTotals[l.id] = 0; });
    mats.forEach(m => { locs.forEach(l => { locTotals[l.id] += (Number((ws[m.id] || {})[l.id]) || 0) * (Number(m.cost) || 0); }); });

    const locCards = locs.map(l => `<div class="me-loc">
      <div class="me-loc-name">${esc(l.name)} <span class="me-muted">${esc(l.id)}</span></div>
      <div class="me-loc-val">${fmtCur(locTotals[l.id], omni.fx.base)}</div>
    </div>`).join('');

    const head = `<tr><th>المادة</th>${locs.map(l => `<th>${esc(l.name)}</th>`).join('')}<th>الإجمالي</th></tr>`;
    const rows = mats.map(m => {
      const locsForMat = ws[m.id] || {};
      const cells = locs.map(l => `<td>${fnum(locsForMat[l.id] || 0, 0)}</td>`).join('');
      return `<tr><td>${esc(m.name)} <span class="me-muted">${esc(m.unit || '')}</span></td>${cells}<td><b>${fnum(Number(m.stock) || 0, 0)}</b></td></tr>`;
    }).join('') || `<tr><td colspan="${locs.length + 2}" class="me-muted">لا توجد مواد</td></tr>`;

    // transfer form
    const matOpts = mats.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    const locOpts = locs.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');

    const recent = (omni.warehouseTransfers || []).slice(0, 8).map(t => `<tr>
      <td>${new Date(t.at).toLocaleString('ar')}</td>
      <td>${esc(t.materialName)}</td>
      <td>${fnum(t.qty)}</td>
      <td>${esc(t.fromName)} ➜ ${esc(t.toName)}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="me-muted">لا توجد تحويلات بعد</td></tr>';

    return `
      <div class="me-loc-strip">${locCards}</div>
      <div class="me-card">
        <h4>مصفوفة المخزون عبر المخازن</h4>
        <div style="overflow-x:auto"><table class="me-table me-matrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
        <p class="me-muted">مجموع المواقع لكل مادة = رصيدها الكلي (المصدر الموحّد). التحويل بين المخازن يعيد التوزيع دون تغيير الإجمالي.</p>
      </div>
      <div class="me-card" style="margin-top:12px">
        <h4>تحويل داخلي بين المخازن (Inter-warehouse Transfer)</h4>
        <div class="me-xfer">
          <select id="meXMat" style="flex:1">${matOpts}</select>
          <select id="meXFrom">${locOpts}</select>
          <span>➜</span>
          <select id="meXTo">${locOpts}</select>
          <input id="meXQty" type="number" min="1" value="1" style="width:80px">
          <button class="me-btn" onclick="meTransfer()">تنفيذ التحويل</button>
        </div>
        <h4 style="margin-top:16px">آخر التحويلات</h4>
        <table class="me-table"><thead><tr><th>التاريخ</th><th>المادة</th><th>الكمية</th><th>المسار</th></tr></thead><tbody>${recent}</tbody></table>
      </div>`;
  }

  /* ----- Tab 4: Tenant / company isolation ----- */
  function renderTenantIsolation() {
    const profile = activeProfile();
    const summary = tenantSummary();
    const enabled = tenantEnabled();
    const rows = summary.rows.map(row => {
      const status = row.ready ? '<span class="me-badge ok">جاهزة</span>' : '<span class="me-badge warn">تحتاج وسم</span>';
      const action = row.missing
        ? `<button class="me-btn sm" onclick="meClaimTenant('${row.path}')">وسم ${row.missing}</button>`
        : '<span class="me-muted">لا يوجد ناقص</span>';
      return `<tr>
        <td><b>${esc(row.label)}</b><br><span class="me-muted">${esc(row.path)} · ${esc(row.owner)}</span></td>
        <td>${fnum(row.total)}</td>
        <td>${fnum(row.active)}</td>
        <td>${row.missing ? `<b class="me-warn-text">${fnum(row.missing)}</b>` : '0'}</td>
        <td>${fnum(row.foreign)}</td>
        <td>${status}</td>
        <td class="me-row-actions">${action}${row.page ? `<button class="me-btn sm ghost" onclick="switchPage('${row.page}')">فتح</button>` : ''}</td>
      </tr>`;
    }).join('');

    return `
      <div class="me-tenant-hero">
        <div>
          <h4>مركز عزل بيانات الشركات والفروع</h4>
          <p>يفحص السجلات المشتركة، يوضح السجلات غير الموسومة، ويوفر API موحداً للصفحات الجديدة حتى لا تختلط بيانات شركة بأخرى عند تفعيل العزل.</p>
          <div class="me-active-company-mini">
            <span class="me-co-logo">${esc(profile.logoEmoji || '🏢')}</span>
            <div><b>${esc(profile.companyName || 'الشركة النشطة غير محددة')}</b><small>${esc(profile.companyId || 'بدون معرف')} · ${esc(profile.currency || 'IQD')} / ${esc(profile.currencySymbol || curSymbol('IQD'))}</small></div>
          </div>
        </div>
        <div class="me-tenant-score">
          <span>جاهزية الوسم</span>
          <b>${summary.score}%</b>
          <small>${summary.readyCollections}/${summary.rows.length} مجموعة جاهزة</small>
        </div>
      </div>

      <div class="me-kpis">
        <div class="me-kpi"><div class="v">${fnum(summary.active)}</div><div class="l">سجلات الشركة النشطة</div></div>
        <div class="me-kpi ${summary.missing ? 'warn' : ''}"><div class="v">${fnum(summary.missing)}</div><div class="l">سجلات غير موسومة</div></div>
        <div class="me-kpi"><div class="v">${fnum(summary.foreign)}</div><div class="l">سجلات شركات أخرى</div></div>
        <div class="me-kpi"><div class="v">${enabled ? 'مفعل' : 'غير مفعل'}</div><div class="l">وضع العزل</div></div>
      </div>

      <div class="me-card me-tenant-controls">
        <label class="me-toggle">
          <input type="checkbox" ${enabled ? 'checked' : ''} onchange="meToggleTenantIsolation(this.checked)">
          <span>تفعيل عزل البيانات في الواجهات التي تستخدم <code>window.scoped()</code> / <code>OctagonTenant.scope()</code></span>
        </label>
        ${summary.missing ? `<button class="me-btn" onclick="meClaimAllTenants()">وسم كل السجلات غير الموسومة للشركة النشطة</button>` : '<span class="me-badge ok">لا توجد سجلات غير موسومة</span>'}
      </div>

      <div class="me-card" style="margin-top:12px">
        <h4>مصفوفة عزل السجلات</h4>
        <div style="overflow-x:auto"><table class="me-table">
          <thead><tr><th>المجموعة</th><th>الإجمالي</th><th>النشطة</th><th>غير موسومة</th><th>شركات أخرى</th><th>الحالة</th><th>إجراء</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="me-muted">لا توجد مجموعات قابلة للفحص</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="me-card me-tenant-rules" style="margin-top:12px">
        <h4>قواعد السلامة</h4>
        <span>الوسم لا يحذف ولا ينقل السجلات بين الشركات.</span>
        <span>السجل الذي يحمل <code>companyId</code> سابقاً لا يتم تغييره إلا باستدعاء API صريح مع <code>force</code>.</span>
        <span>السجلات غير الموسومة تبقى مرئية افتراضياً للتوافق، ويمكن للصفحات استخدام <code>OctagonTenant.scope(list, { includeGlobal:false })</code> للعزل الصارم.</span>
      </div>`;
  }

  /* ============================== HANDLERS ============================== */
  window.meSetTab = function (t) { state.tab = t; render(); };

  window.meSetBase = function (code) {
    const omni = O();
    // re-express all rates relative to the new base so cross-rates stay correct
    const oldBaseRateVsOld = 1; // current rates are vs old base
    const newBaseRateVsOld = rateOf(code); // base units(old) per 1 new-base unit
    const opts = currencyOptions();
    const newRates = {};
    opts.forEach(c => { newRates[c.code] = +(rateOf(c.code) / newBaseRateVsOld).toFixed(6); });
    newRates[code] = 1;
    omni.fx.base = code; omni.fx.rates = newRates; omni.fx.updatedAt = new Date().toISOString();
    save(); render(); toast('تم تغيير العملة الأساس إلى ' + code, 'success');
  };

  window.meSetRate = function (code, v) {
    const omni = O();
    const rate = Math.max(0.000001, Number(v) || 1);
    omni.fx.rates[code] = rate;
    omni.fx.updatedAt = new Date().toISOString();
    omni.fx.history.unshift({ at: new Date().toISOString(), code, rate });
    omni.fx.history = omni.fx.history.slice(0, 40);
    save(); render();
  };

  window.meConv = function (key, v) {
    state.conv[key] = key === 'amount' ? (Number(v) || 0) : v;
    render();
  };

  window.meSetActiveCompany = function (id) {
    if (typeof window.updateActiveCompany === 'function') { try { window.updateActiveCompany(id); } catch (_) {} }
    else { try { O().adminSettings.organization.activeCompanyId = id; save(); } catch (_) {} }
    render(); toast('تم تفعيل الفرع', 'success');
  };

  window.meAddCompany = function () {
    const inp = document.getElementById('meNewCo');
    const name = (inp && inp.value || '').trim();
    if (!name) { toast('اكتب اسم الفرع', 'warning'); return; }
    const omni = O();
    const org = omni.adminSettings && omni.adminSettings.organization;
    if (!org) { toast('إعدادات المؤسسة غير جاهزة', 'warning'); return; }
    if (!Array.isArray(org.companies)) org.companies = [];
    const co = { id: uid('co'), name, phone: '', address: '', logoEmoji: '🏢', founded: '', isPrimary: org.companies.length === 0, departments: [] };
    org.companies.push(co);
    save(); render(); toast('تمت إضافة الفرع', 'success');
  };

  window.meTransfer = function () {
    const omni = O();
    const matId = (document.getElementById('meXMat') || {}).value;
    const from = (document.getElementById('meXFrom') || {}).value;
    const to = (document.getElementById('meXTo') || {}).value;
    const qty = Number((document.getElementById('meXQty') || {}).value) || 0;
    if (!matId || !from || !to) { toast('اختر المادة والمخازن', 'warning'); return; }
    if (from === to) { toast('لا يمكن التحويل لنفس المخزن', 'warning'); return; }
    if (qty <= 0) { toast('أدخل كمية صحيحة', 'warning'); return; }
    reconcileWarehouse();
    const ws = omni.warehouseStock;
    const bucket = ws[matId] || (ws[matId] = {});
    const avail = Number(bucket[from]) || 0;
    if (qty > avail) { toast('الكمية المتاحة في المخزن المصدر ' + fnum(avail) + ' فقط', 'warning'); return; }
    bucket[from] = avail - qty;
    bucket[to] = (Number(bucket[to]) || 0) + qty;
    const mat = (omni.materials || []).find(m => m.id === matId) || {};
    const locs = locations();
    const nameOf = id => (locs.find(l => l.id === id) || {}).name || id;
    omni.warehouseTransfers.unshift({ id: uid('wxfer'), at: new Date().toISOString(), materialId: matId, materialName: mat.name || matId, qty, from, to, fromName: nameOf(from), toName: nameOf(to) });
    omni.warehouseTransfers = omni.warehouseTransfers.slice(0, 100);
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'multi_warehouse', source: 'multi_entity', action: 'warehouse_transfer', summary: 'تحويل ' + qty + ' ' + (mat.name || '') + ' من ' + nameOf(from) + ' إلى ' + nameOf(to), payload: { materialId: matId, qty, from, to } }); } catch (_) {}
    }
    save(); render(); toast('تم تنفيذ التحويل الداخلي', 'success');
  };
  window.meClaimTenant = function (path) { claimTenantCollection(path); render(); };
  window.meClaimAllTenants = claimAllTenantMissing;
  window.meToggleTenantIsolation = setTenantIsolation;

  /* ============================ PAGE WIRING ============================= */
  function activatePage() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageMultiEntity'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navMultiEntity'); if (nav) nav.classList.add('active');
    window.currentPage = 'multi_entity';
    ensureData(); render();
  }
  function wireSwitch() {
    if (window.__ptxMeWrapped) return;
    if (typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'multi_entity') { try { activatePage(); } catch (e) { console.warn('Multi-entity render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__ptxMeWrapped = true;
  }
  function init() {
    wireSwitch();
    let tries = 0;
    const t = setInterval(() => { tries++; if (window.__ptxMeWrapped || tries > 40) { clearInterval(t); return; } wireSwitch(); }, 150);
    setTimeout(registerTenantJarvis, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Public FX API for other modules (MRP, finance displays, etc.)
  const fxApi = {
    convert, fromBase,
    base: () => O().fx ? O().fx.base : orgCurrency(),
    rate: rateOf,
    symbol: curSymbol,
    ensure: ensureData
  };
  function registerTenantJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools.report_tenant_isolation = function () {
          const s = tenantSummary();
          return {
            enabled: tenantEnabled(),
            activeCompany: activeProfile(),
            score: s.score,
            totalRecords: s.total,
            activeCompanyRecords: s.active,
            missingCompanyId: s.missing,
            foreignRecords: s.foreign,
            collections: s.rows.map(row => ({ path: row.path, total: row.total, active: row.active, missing: row.missing, foreign: row.foreign }))
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES.multi_entity = '#pageMultiEntity';
      }
    } catch (_) {}
  }
  window.OctagonFX = fxApi;
  window.PentagonFX = fxApi;
  const tenantApi = {
    activeProfile,
    activeCompanyId,
    enabled: tenantEnabled,
    setEnabled: setTenantIsolation,
    scope: tenantScopeList,
    stamp: stampTenant,
    status: tenantCollectionStatus,
    summary: tenantSummary,
    claimMissing: claimTenantCollection,
    claimAllMissing: claimAllTenantMissing,
    collections: () => TENANT_COLLECTIONS.slice()
  };
  window.OctagonTenant = tenantApi;
  window.PentagonTenant = tenantApi;
  window.scoped = function (array, opts) { return tenantScopeList(array, opts || {}); };
  const api = { render, ensureData, tenant: tenantApi, open: function () { try { window.switchPage('multi_entity'); } catch (_) {} } };
  window.OctagonMultiEntity = api;
  window.PentagonMultiEntity = api;
})();
