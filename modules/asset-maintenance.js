/**
 * OCTAGON ERP — Fixed Assets & Preventive Maintenance (الأصول والصيانة الوقائية).
 *
 * A universal ERP pillar that Octagon was missing entirely (no depreciation / warranty
 * tracking existed anywhere in the codebase). Built add-only on the shared engines:
 *  - Asset Register: machines, vehicles, tools, buildings, IT, furniture — code, category,
 *    acquisition cost/date, serial, supplier, location, status, is_active (archive, never delete).
 *  - Straight-line depreciation: monthly depreciation, accumulated depreciation, net book value,
 *    full month-by-month schedule. Register-only by default; an explicit manager button posts a
 *    correct NON-CASH journal entry to the v6 GL (debit depreciation expense / credit accumulated
 *    depreciation) — it seeds the two standard accounts additively if missing. Finance writes are
 *    manual + confirmed, never automatic (safety rule: finance changes are approval-gated).
 *  - Warranty tracking: warranty months → expiry date + "expiring soon" alerts.
 *  - Preventive maintenance: service interval (days) → next-due date, overdue/due alerts,
 *    log maintenance (optional cost booked as a normal expense via addFinanceTransaction).
 *  - Import from omni.machines (links workshop machines as depreciable assets).
 *  - Jarvis tool: report_assets_today. Every mutation writes an audit event.
 *
 * Data namespace: omni.assetRegister = { assets:[], maintenanceLogs:[], depreciationEntries:[] }
 * Page: #pageAssets (nav data-page="assets"). Add-only; no existing feature touched.
 */
(function () {
  'use strict';

  /* ───────────────────────── shared helpers (mirror the vertical modules) ───────────────────────── */
  function O() {
    if (typeof omni !== 'undefined' && omni) return omni;
    if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} }
    return null;
  }
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
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {}
    return 'مستخدم';
  }
  function userRole() {
    try { return (window.PentagonAuth && PentagonAuth.currentUser && (PentagonAuth.currentUser.role || PentagonAuth.currentUser.roleId)) || ''; } catch (_) { return ''; }
  }
  function isManager() {
    const r = String(userRole()).toLowerCase();
    return r.includes('admin') || r.includes('manager') || r.includes('owner') || r === '' /* solo owner install */;
  }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('assets', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'assets', action, detail, user: userName() }); } catch (_) {}
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function monthsBetween(fromISO, toISO) {
    const a = new Date(fromISO), b = new Date(toISO);
    if (isNaN(a) || isNaN(b)) return 0;
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m -= 1;
    return Math.max(0, m);
  }
  function addMonths(iso, n) { const d = new Date(iso); if (isNaN(d)) return ''; d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }
  function addDays(iso, n) { const d = new Date(iso); if (isNaN(d)) return ''; d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  /* ───────────────────────── data layer ───────────────────────── */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.assetRegister || typeof o.assetRegister !== 'object') o.assetRegister = {};
    const a = o.assetRegister;
    if (!Array.isArray(a.assets)) a.assets = [];
    if (!Array.isArray(a.maintenanceLogs)) a.maintenanceLogs = [];
    if (!Array.isArray(a.depreciationEntries)) a.depreciationEntries = [];
    return a;
  }
  function R() { return ensureData(); }
  function getAssets(includeArchived) {
    let list = (R()?.assets || []).filter(x => includeArchived || x.is_active !== false);
    if (typeof window.scoped === 'function') { try { list = window.scoped(list); } catch (_) {} }
    return list;
  }

  const CATEGORIES = [
    ['machine', '⚙️ مكينة'], ['vehicle', '🚚 مركبة'], ['tool', '🔧 عدّة'],
    ['building', '🏢 مبنى'], ['it', '💻 حاسوب/شبكة'], ['furniture', '🪑 أثاث']
  ];
  const CAT_LABEL = Object.fromEntries(CATEGORIES);
  const STATUS_LABEL = { in_service: 'في الخدمة', under_maintenance: 'تحت الصيانة', retired: 'مُستبعد' };
  const STATUS_CLASS = { in_service: 'asm-st-ok', under_maintenance: 'asm-st-maint', retired: 'asm-st-retired' };

  /* ───────────────────────── depreciation / warranty math ───────────────────────── */
  // Straight-line. Returns the computed financial picture for an asset as of `asOf` (default today).
  function deprView(asset, asOf) {
    asOf = asOf || todayISO();
    const cost = money(asset.acquisitionCost);
    const salvage = Math.min(money(asset.salvageValue), cost);
    const lifeM = Math.max(0, Math.round(Number(asset.usefulLifeMonths) || 0));
    const depreciable = Math.max(0, cost - salvage);
    const monthly = lifeM > 0 ? depreciable / lifeM : 0;
    const monthsElapsed = asset.acquisitionDate ? Math.min(lifeM || 0, monthsBetween(asset.acquisitionDate, asOf)) : 0;
    // Accumulated = max of (time-based) and any manually-recorded entries, capped at depreciable.
    const recorded = (R()?.depreciationEntries || []).filter(e => e.assetId === asset.id).reduce((s, e) => s + money(e.amount), 0);
    const timeBased = Math.min(depreciable, Math.round(monthly * monthsElapsed));
    const accumulated = Math.min(depreciable, Math.max(recorded, timeBased));
    const bookValue = cost - accumulated;
    const remainingMonths = Math.max(0, lifeM - monthsElapsed);
    const fullyDepreciated = lifeM > 0 && accumulated >= depreciable;
    return { cost, salvage, lifeM, depreciable, monthly: Math.round(monthly), monthsElapsed, recorded, accumulated, bookValue, remainingMonths, fullyDepreciated };
  }
  function warrantyView(asset) {
    if (!asset.acquisitionDate || !Number(asset.warrantyMonths)) return { has: false };
    const expiry = addMonths(asset.acquisitionDate, Math.round(Number(asset.warrantyMonths)));
    const days = daysBetween(todayISO(), expiry);
    return { has: true, expiry, days, expired: days < 0, soon: days >= 0 && days <= 30 };
  }
  function maintenanceView(asset) {
    const interval = Math.round(Number(asset.maintenanceIntervalDays) || 0);
    if (!interval) return { scheduled: false };
    const base = asset.lastMaintenanceDate || asset.acquisitionDate || todayISO();
    const next = addDays(base, interval);
    const days = daysBetween(todayISO(), next);
    return { scheduled: true, next, days, overdue: days < 0, due: days >= 0 && days <= 7, interval };
  }

  /* ───────────────────────── aggregate KPIs / alerts ───────────────────────── */
  function portfolio() {
    const assets = getAssets().filter(a => a.status !== 'retired');
    let cost = 0, accumulated = 0, book = 0, monthlyDep = 0;
    const warrantyExpiring = [], maintenanceDue = [];
    assets.forEach(a => {
      const d = deprView(a); cost += d.cost; accumulated += d.accumulated; book += d.bookValue;
      if (!d.fullyDepreciated) monthlyDep += d.monthly;
      const w = warrantyView(a); if (w.has && (w.soon || w.expired)) warrantyExpiring.push({ asset: a, w });
      const m = maintenanceView(a); if (m.scheduled && (m.due || m.overdue)) maintenanceDue.push({ asset: a, m });
    });
    warrantyExpiring.sort((x, y) => x.w.days - y.w.days);
    maintenanceDue.sort((x, y) => x.m.days - y.m.days);
    return {
      count: assets.length, cost, accumulated, book, monthlyDep,
      retired: getAssets().filter(a => a.status === 'retired').length,
      underMaintenance: assets.filter(a => a.status === 'under_maintenance').length,
      warrantyExpiring, maintenanceDue
    };
  }

  /* ───────────────────────── state ───────────────────────── */
  let activeTab = 'dashboard';
  let editingId = null;
  let search = '';
  let catFilter = '';

  /* ───────────────────────── mutations ───────────────────────── */
  window.asmOpenTab = function (tab) { activeTab = tab; editingId = null; renderAssets(); };
  window.asmOpenForm = function (id) { editingId = id || 'new'; activeTab = 'register'; renderAssets(); };
  window.asmCancelForm = function () { editingId = null; renderAssets(); };
  window.asmSearch = function (v) { search = v; renderRegister(); };
  window.asmCatFilter = function (v) { catFilter = v; renderRegister(); };

  window.asmSaveAsset = function () {
    const r = R(); if (!r) return;
    const name = val('asmName');
    if (!name) { toast('اسم الأصل مطلوب', 'error'); return; }
    const base = {
      name,
      code: val('asmCode') || ('AST-' + String((r.assets.length + 1)).padStart(4, '0')),
      category: val('asmCategory') || 'machine',
      serialNumber: val('asmSerial'),
      supplier: val('asmSupplier'),
      location: val('asmLocation'),
      acquisitionDate: val('asmAcqDate') || todayISO(),
      acquisitionCost: numVal('asmCost'),
      salvageValue: numVal('asmSalvage'),
      usefulLifeMonths: Math.round(numVal('asmLife')),
      depreciationMethod: 'straight_line',
      warrantyMonths: Math.round(numVal('asmWarranty')),
      maintenanceIntervalDays: Math.round(numVal('asmInterval')),
      status: val('asmStatus') || 'in_service',
      notes: val('asmNotes')
    };
    const existing = editingId && editingId !== 'new' ? r.assets.find(a => a.id === editingId) : null;
    if (existing) {
      Object.assign(existing, base, { updatedAt: new Date().toISOString(), updatedBy: userName() });
      audit('asset_update', `تعديل أصل: ${name}`);
      toast('تم تحديث الأصل', 'success');
    } else {
      r.assets.push({ id: uid('ast'), ...base, accumulatedDepreciation: 0, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: userName() });
      audit('asset_create', `إضافة أصل: ${name}`);
      toast('تمت إضافة الأصل', 'success');
    }
    save(); editingId = null; renderAssets();
  };

  window.asmArchiveAsset = function (id) {
    const a = (R()?.assets || []).find(x => x.id === id); if (!a) return;
    if (!confirm(`استبعاد الأصل "${a.name}"؟ (أرشفة — لا يُحذف نهائياً)`)) return;
    a.is_active = false; a.status = 'retired'; a.retiredAt = new Date().toISOString();
    audit('asset_retire', `استبعاد أصل: ${a.name}`);
    save(); toast('تم استبعاد الأصل (مؤرشف)', 'info'); renderAssets();
  };

  window.asmImportMachines = function () {
    const o = O(), r = R(); if (!o || !r) return;
    const machines = o.machines || [];
    if (!machines.length) { toast('لا توجد مكائن للاستيراد', 'info'); return; }
    let added = 0;
    machines.forEach(m => {
      if (r.assets.find(a => a.linkedMachineId === m.id)) return; // idempotent
      r.assets.push({
        id: uid('ast'), code: 'AST-M-' + String(m.id).slice(-4).toUpperCase(),
        name: m.name || m.id, category: 'machine', linkedMachineId: m.id,
        serialNumber: '', supplier: '', location: 'الورشة',
        acquisitionDate: m.lastMaintenance || todayISO(), acquisitionCost: 0, salvageValue: 0,
        usefulLifeMonths: 120, depreciationMethod: 'straight_line', warrantyMonths: 0,
        maintenanceIntervalDays: 90, lastMaintenanceDate: m.lastMaintenance || '',
        status: m.status === 'maintenance' ? 'under_maintenance' : 'in_service',
        notes: 'مستورد من سجل المكائن', accumulatedDepreciation: 0, is_active: true,
        companyId: coId(), createdAt: new Date().toISOString(), createdBy: userName()
      });
      added++;
    });
    audit('asset_import_machines', `استيراد ${added} مكينة كأصول`);
    save(); toast(added ? `تم استيراد ${added} مكينة` : 'كل المكائن مستوردة مسبقاً', added ? 'success' : 'info'); renderAssets();
  };

  // Record one month of depreciation into the register (non-finance). Idempotent per asset+period.
  window.asmRecordDepreciation = function (id) {
    const r = R(); const a = r.assets.find(x => x.id === id); if (!a) return;
    const d = deprView(a);
    if (d.fullyDepreciated) { toast('الأصل مُستهلك بالكامل', 'info'); return; }
    if (d.monthly <= 0) { toast('عرّف الكلفة والعمر الإنتاجي أولاً', 'error'); return; }
    const period = todayISO().slice(0, 7);
    if (r.depreciationEntries.find(e => e.assetId === id && e.period === period)) { toast('تم تسجيل إهلاك هذا الشهر مسبقاً', 'info'); return; }
    const amount = Math.min(d.monthly, d.depreciable - d.recorded);
    r.depreciationEntries.push({ id: uid('dep'), assetId: id, period, amount, date: todayISO(), posted: false, by: userName(), createdAt: new Date().toISOString() });
    a.accumulatedDepreciation = money(a.accumulatedDepreciation) + amount;
    audit('depreciation_record', `إهلاك ${fmt(amount)} ${curSym()} — ${a.name} (${period})`);
    save(); toast(`سُجّل إهلاك ${fmt(amount)} ${curSym()}`, 'success'); renderAssets();
  };

  // Manager-only: post the latest unposted depreciation entries to the v6 General Ledger as a
  // correct NON-CASH journal entry (debit depreciation expense / credit accumulated depreciation).
  window.asmPostDepreciationToGL = async function () {
    if (!isManager()) { toast('ترحيل القيود يحتاج صلاحية مدير', 'error'); return; }
    const r = R();
    const unposted = r.depreciationEntries.filter(e => !e.posted && money(e.amount) > 0);
    if (!unposted.length) { toast('لا توجد قيود إهلاك غير مُرحّلة', 'info'); return; }
    const total = unposted.reduce((s, e) => s + money(e.amount), 0);
    if (!confirm(`ترحيل ${unposted.length} قيد إهلاك بإجمالي ${fmt(total)} ${curSym()} إلى دفتر الأستاذ؟\nقيد غير نقدي: مدين «مصروف إهلاك» / دائن «مجمع الإهلاك».`)) return;
    if (!window.FinanceService || typeof FinanceService.createMove !== 'function') {
      // No GL available — mark as posted in register only so the schedule stays consistent.
      unposted.forEach(e => { e.posted = true; e.postedAt = new Date().toISOString(); e.postRef = 'register_only'; });
      audit('depreciation_post', `تسجيل ${unposted.length} قيد إهلاك (سجل فقط — لا يوجد دفتر أستاذ)`);
      save(); toast('سُجّلت القيود (لا يوجد محرك محاسبة v6)', 'info'); renderAssets(); return;
    }
    try {
      await seedDepreciationAccounts();
      const date = todayISO();
      const move = await FinanceService.createMove({
        journal_id: 'j_gen', move_type: 'entry', date,
        partner_id: 'إهلاك أصول', origin: `asset_depreciation/${date}`,
        line_ids: [
          { account_id: 'expense_depreciation', debit: total, credit: 0, label: 'إهلاك أصول ثابتة' },
          { account_id: 'accumulated_depreciation', debit: 0, credit: total, label: 'مجمع إهلاك أصول ثابتة' }
        ],
        skip_backup: true
      });
      let ref = move.id;
      if (typeof FinanceService.postMove === 'function') { const p = await FinanceService.postMove(move.id, { skip_backup: true }); ref = p.id; }
      unposted.forEach(e => { e.posted = true; e.postedAt = new Date().toISOString(); e.postRef = ref; });
      audit('depreciation_post_gl', `ترحيل إهلاك ${fmt(total)} ${curSym()} إلى دفتر الأستاذ (قيد ${ref})`);
      save(); toast(`تم ترحيل قيد الإهلاك (${fmt(total)} ${curSym()})`, 'success'); renderAssets();
    } catch (err) {
      console.error('depreciation post error', err);
      toast('تعذّر ترحيل قيد الإهلاك — راجع الكونسول', 'error');
    }
  };

  // Seed the two standard depreciation accounts into the v6 chart of accounts. NOTE: the finance
  // chart lives in PentagonDB.getCached().finance.accounts (a DIFFERENT object from `omni`), and
  // must be mutated via PentagonDB.mutate so FinanceService.resolveAccount finds them (else they
  // fall back to the `suspense` account). Idempotent.
  async function seedDepreciationAccounts() {
    try {
      const PDB = window.PentagonDB;
      if (!PDB || typeof PDB.mutate !== 'function') return;
      await PDB.mutate(db => {
        if (!db.finance || typeof db.finance !== 'object') db.finance = {};
        if (!Array.isArray(db.finance.accounts)) db.finance.accounts = [];
        const accts = db.finance.accounts;
        if (!accts.find(a => a.id === 'expense_depreciation')) accts.push({ id: 'expense_depreciation', code: '5300', name: 'مصروف إهلاك', type: 'expense', normal_side: 'debit' });
        if (!accts.find(a => a.id === 'accumulated_depreciation')) accts.push({ id: 'accumulated_depreciation', code: '1500', name: 'مجمع إهلاك الأصول الثابتة', type: 'asset', normal_side: 'credit' });
      });
    } catch (e) { console.warn('seedDepreciationAccounts failed', e); }
  }

  // Log a preventive/corrective maintenance event. Optional cost is booked as a normal expense.
  window.asmLogMaintenance = function (id) {
    const r = R(); const a = r.assets.find(x => x.id === id); if (!a) return;
    const desc = prompt(`صيانة "${a.name}" — وصف العمل المنجز:`, 'صيانة وقائية دورية');
    if (desc === null) return;
    const costStr = prompt('كلفة الصيانة (اتركها 0 إن لا توجد):', '0');
    if (costStr === null) return;
    const cost = money(Number(costStr));
    const log = { id: uid('mlog'), assetId: id, date: todayISO(), description: desc || 'صيانة', cost, by: userName(), createdAt: new Date().toISOString() };
    r.maintenanceLogs.push(log);
    a.lastMaintenanceDate = todayISO();
    if (a.status === 'under_maintenance') a.status = 'in_service';
    if (a.linkedMachineId) { const m = (O().machines || []).find(x => x.id === a.linkedMachineId); if (m) m.lastMaintenance = todayISO(); }
    if (cost > 0 && typeof window.addFinanceTransaction === 'function') {
      try {
        window.addFinanceTransaction({
          type: 'expense', direction: 'out', sourceType: 'asset_maintenance', sourceId: log.id,
          date: todayISO(), amount: cost, categoryId: 'cat_tools',
          description: `صيانة ${a.name}: ${desc}`, partyName: a.supplier || 'فني صيانة'
        });
      } catch (e) { console.warn('maintenance cost booking failed', e); }
    }
    audit('maintenance_log', `صيانة ${a.name}${cost ? ' بكلفة ' + fmt(cost) + ' ' + curSym() : ''}`);
    save(); toast('تم تسجيل الصيانة', 'success'); renderAssets();
  };

  window.asmSetMaintenance = function (id) {
    const a = (R()?.assets || []).find(x => x.id === id); if (!a) return;
    a.status = a.status === 'under_maintenance' ? 'in_service' : 'under_maintenance';
    audit('asset_status', `${a.name} → ${STATUS_LABEL[a.status]}`);
    save(); renderAssets();
  };

  window.asmLoadDemo = function () {
    const r = R(); if (!r) return;
    if (r.assets.length) { toast('يوجد أصول مسبقاً', 'info'); return; }
    const today = new Date();
    const ago = n => { const d = new Date(today); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
    r.assets.push(
      { id: uid('ast'), code: 'AST-0001', name: 'ليزر CO2 130 واط', category: 'machine', serialNumber: 'LZ-2023-118', supplier: 'مورد المكائن', location: 'صالة الليزر', acquisitionDate: ago(18), acquisitionCost: 9500000, salvageValue: 500000, usefulLifeMonths: 96, depreciationMethod: 'straight_line', warrantyMonths: 24, maintenanceIntervalDays: 60, lastMaintenanceDate: ago(2), status: 'in_service', notes: 'الماكينة الرئيسية', accumulatedDepreciation: 0, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: 'بيانات تجريبية' },
      { id: uid('ast'), code: 'AST-0002', name: 'شاحنة توصيل', category: 'vehicle', serialNumber: 'VIN-44820', supplier: 'وكالة السيارات', location: 'الكراج', acquisitionDate: ago(30), acquisitionCost: 14000000, salvageValue: 3000000, usefulLifeMonths: 120, depreciationMethod: 'straight_line', warrantyMonths: 36, maintenanceIntervalDays: 90, lastMaintenanceDate: ago(4), status: 'in_service', notes: '', accumulatedDepreciation: 0, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: 'بيانات تجريبية' },
      { id: uid('ast'), code: 'AST-0003', name: 'كمبروسر هواء صناعي', category: 'tool', serialNumber: 'CMP-77', supplier: 'مورد العدد', location: 'الورشة', acquisitionDate: ago(10), acquisitionCost: 1200000, salvageValue: 100000, usefulLifeMonths: 60, depreciationMethod: 'straight_line', warrantyMonths: 12, maintenanceIntervalDays: 30, lastMaintenanceDate: ago(2), status: 'in_service', notes: '', accumulatedDepreciation: 0, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: 'بيانات تجريبية' }
    );
    audit('asset_demo', 'تحميل أصول تجريبية');
    save(); toast('تم تحميل بيانات تجريبية', 'success'); renderAssets();
  };

  /* ───────────────────────── render ───────────────────────── */
  function kpiCard(label, value, sub, cls) {
    return `<div class="asm-kpi ${cls || ''}"><div class="asm-kpi-val">${value}</div><div class="asm-kpi-label">${label}</div>${sub ? `<div class="asm-kpi-sub">${sub}</div>` : ''}</div>`;
  }

  function renderDashboard() {
    const el = document.getElementById('asmDashBody'); if (!el) return;
    const p = portfolio();
    const alertRows = [];
    p.maintenanceDue.forEach(({ asset, m }) => alertRows.push(`<tr class="${m.overdue ? 'asm-row-danger' : 'asm-row-warn'}"><td>🔧 صيانة</td><td>${esc(asset.name)}</td><td>${m.overdue ? `متأخرة ${Math.abs(m.days)} يوم` : `خلال ${m.days} يوم`}</td><td><button class="asm-mini-btn" onclick="asmLogMaintenance('${asset.id}')">سجّل صيانة</button></td></tr>`));
    p.warrantyExpiring.forEach(({ asset, w }) => alertRows.push(`<tr class="${w.expired ? 'asm-row-danger' : 'asm-row-warn'}"><td>🛡️ كفالة</td><td>${esc(asset.name)}</td><td>${w.expired ? `منتهية منذ ${Math.abs(w.days)} يوم` : `تنتهي خلال ${w.days} يوم`}</td><td><span class="asm-muted">${esc(w.expiry)}</span></td></tr>`));
    el.innerHTML = `
      <div class="asm-kpi-grid">
        ${kpiCard('عدد الأصول', p.count, `${p.underMaintenance} تحت الصيانة · ${p.retired} مستبعد`, '')}
        ${kpiCard('كلفة الاقتناء', fmt(p.cost) + ' ' + curSym(), 'إجمالي التكلفة الأصلية', '')}
        ${kpiCard('القيمة الدفترية', fmt(p.book) + ' ' + curSym(), `مجمع الإهلاك ${fmt(p.accumulated)}`, 'asm-kpi-accent')}
        ${kpiCard('إهلاك شهري', fmt(p.monthlyDep) + ' ' + curSym(), 'على الأصول النشطة', '')}
        ${kpiCard('صيانة مستحقة', p.maintenanceDue.length, 'تحتاج إجراء', p.maintenanceDue.length ? 'asm-kpi-warn' : '')}
        ${kpiCard('كفالات تنتهي', p.warrantyExpiring.length, 'خلال 30 يوم أو منتهية', p.warrantyExpiring.length ? 'asm-kpi-warn' : '')}
      </div>
      <div class="asm-panel">
        <div class="asm-panel-head"><h3>🚨 تنبيهات الأصول</h3><button class="asm-mini-btn" onclick="asmOpenTab('maintenance')">جدول الصيانة</button></div>
        <table class="asm-table">
          <thead><tr><th>النوع</th><th>الأصل</th><th>الحالة</th><th>إجراء</th></tr></thead>
          <tbody>${alertRows.join('') || '<tr><td colspan="4" class="asm-empty">لا توجد تنبيهات — كل الأصول ضمن الجدول ✅</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function renderRegister() {
    const el = document.getElementById('asmRegBody'); if (!el) return;
    if (editingId) { el.innerHTML = renderForm(); return; }
    let list = getAssets();
    if (catFilter) list = list.filter(a => a.category === catFilter);
    if (search) { const q = search.toLowerCase(); list = list.filter(a => `${a.name} ${a.code} ${a.serialNumber} ${a.location}`.toLowerCase().includes(q)); }
    const catOpts = ['<option value="">كل الفئات</option>'].concat(CATEGORIES.map(([k, l]) => `<option value="${k}" ${catFilter === k ? 'selected' : ''}>${l}</option>`)).join('');
    el.innerHTML = `
      <div class="asm-toolbar">
        <button class="btn-primary" onclick="asmOpenForm('new')">➕ أصل جديد</button>
        <button class="asm-mini-btn" onclick="asmImportMachines()">⚙️ استيراد المكائن</button>
        <button class="asm-mini-btn" onclick="asmLoadDemo()">بيانات تجريبية</button>
        <input class="asm-input" placeholder="بحث..." value="${esc(search)}" oninput="asmSearch(this.value)" style="max-width:200px">
        <select class="asm-input" onchange="asmCatFilter(this.value)" style="max-width:160px">${catOpts}</select>
      </div>
      <table class="asm-table">
        <thead><tr><th>الرمز</th><th>الأصل</th><th>الفئة</th><th>الكلفة</th><th>القيمة الدفترية</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(a => {
          const d = deprView(a);
          return `<tr>
            <td class="asm-muted">${esc(a.code)}</td>
            <td><strong>${esc(a.name)}</strong>${a.serialNumber ? `<br><span class="asm-muted">#${esc(a.serialNumber)}</span>` : ''}</td>
            <td>${CAT_LABEL[a.category] || a.category}</td>
            <td>${fmt(d.cost)} ${curSym()}</td>
            <td><strong>${fmt(d.bookValue)}</strong> ${curSym()}${d.fullyDepreciated ? ' <span class="asm-badge asm-badge-done">مُستهلك</span>' : ''}</td>
            <td><span class="asm-badge ${STATUS_CLASS[a.status] || ''}">${STATUS_LABEL[a.status] || a.status}</span></td>
            <td class="asm-actions">
              <button class="asm-mini-btn" onclick="asmOpenForm('${a.id}')">تعديل</button>
              <button class="asm-mini-btn" onclick="asmLogMaintenance('${a.id}')">صيانة</button>
              <button class="asm-mini-btn asm-danger" onclick="asmArchiveAsset('${a.id}')">استبعاد</button>
            </td></tr>`;
        }).join('') || '<tr><td colspan="7" class="asm-empty">لا توجد أصول — أضف أصلاً أو استورد المكائن</td></tr>'}</tbody>
      </table>`;
  }

  function renderForm() {
    const a = editingId !== 'new' ? (R()?.assets || []).find(x => x.id === editingId) : null;
    const v = a || {};
    const opt = (cur) => CATEGORIES.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
    const stOpt = (cur) => Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
    return `
      <div class="asm-panel">
        <div class="asm-panel-head"><h3>${a ? 'تعديل أصل' : 'أصل جديد'}</h3></div>
        <div class="asm-form-grid">
          <div><label>الاسم *</label><input id="asmName" class="asm-input" value="${esc(v.name || '')}"></div>
          <div><label>الرمز</label><input id="asmCode" class="asm-input" value="${esc(v.code || '')}" placeholder="تلقائي"></div>
          <div><label>الفئة</label><select id="asmCategory" class="asm-input">${opt(v.category || 'machine')}</select></div>
          <div><label>الرقم التسلسلي</label><input id="asmSerial" class="asm-input" value="${esc(v.serialNumber || '')}"></div>
          <div><label>المورّد</label><input id="asmSupplier" class="asm-input" value="${esc(v.supplier || '')}"></div>
          <div><label>الموقع</label><input id="asmLocation" class="asm-input" value="${esc(v.location || '')}"></div>
          <div><label>تاريخ الاقتناء</label><input id="asmAcqDate" type="date" class="asm-input" value="${esc(v.acquisitionDate || todayISO())}"></div>
          <div><label>كلفة الاقتناء (${curSym()})</label><input id="asmCost" type="number" class="asm-input" value="${money(v.acquisitionCost) || ''}"></div>
          <div><label>القيمة المتبقية (تخريدية)</label><input id="asmSalvage" type="number" class="asm-input" value="${money(v.salvageValue) || ''}"></div>
          <div><label>العمر الإنتاجي (شهر)</label><input id="asmLife" type="number" class="asm-input" value="${v.usefulLifeMonths || ''}" placeholder="مثال: 96"></div>
          <div><label>مدة الكفالة (شهر)</label><input id="asmWarranty" type="number" class="asm-input" value="${v.warrantyMonths || ''}"></div>
          <div><label>دورة الصيانة (يوم)</label><input id="asmInterval" type="number" class="asm-input" value="${v.maintenanceIntervalDays || ''}" placeholder="مثال: 90"></div>
          <div><label>الحالة</label><select id="asmStatus" class="asm-input">${stOpt(v.status || 'in_service')}</select></div>
          <div class="asm-form-full"><label>ملاحظات</label><textarea id="asmNotes" class="asm-input" rows="2">${esc(v.notes || '')}</textarea></div>
        </div>
        <div class="asm-form-actions">
          <button class="btn-primary" onclick="asmSaveAsset()">حفظ</button>
          <button class="asm-mini-btn" onclick="asmCancelForm()">إلغاء</button>
        </div>
      </div>`;
  }

  function renderDepreciation() {
    const el = document.getElementById('asmDeprBody'); if (!el) return;
    const assets = getAssets().filter(a => a.status !== 'retired' && money(a.acquisitionCost) > 0);
    const r = R();
    const unposted = r.depreciationEntries.filter(e => !e.posted).length;
    el.innerHTML = `
      <div class="asm-toolbar">
        <button class="btn-primary" onclick="asmPostDepreciationToGL()">📒 ترحيل الإهلاك لدفتر الأستاذ${unposted ? ` (${unposted})` : ''}</button>
        <span class="asm-muted">قيد غير نقدي · يحتاج صلاحية مدير · لا يُرحّل تلقائياً</span>
      </div>
      <table class="asm-table">
        <thead><tr><th>الأصل</th><th>الكلفة</th><th>إهلاك شهري</th><th>أشهر مضت</th><th>مجمع الإهلاك</th><th>القيمة الدفترية</th><th>إجراء</th></tr></thead>
        <tbody>${assets.map(a => {
          const d = deprView(a);
          const pct = d.depreciable ? Math.round(d.accumulated / d.depreciable * 100) : 0;
          return `<tr>
            <td><strong>${esc(a.name)}</strong></td>
            <td>${fmt(d.cost)}</td>
            <td>${fmt(d.monthly)}</td>
            <td>${d.monthsElapsed}/${d.lifeM || '—'}</td>
            <td><div class="asm-bar"><div class="asm-bar-fill" style="width:${pct}%"></div></div><span class="asm-muted">${fmt(d.accumulated)} (${pct}%)</span></td>
            <td><strong>${fmt(d.bookValue)}</strong> ${curSym()}</td>
            <td>${d.fullyDepreciated ? '<span class="asm-badge asm-badge-done">مُستهلك</span>' : `<button class="asm-mini-btn" onclick="asmRecordDepreciation('${a.id}')">سجّل إهلاك الشهر</button>`}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="7" class="asm-empty">عرّف كلفة وعمر إنتاجي للأصول لعرض الإهلاك</td></tr>'}</tbody>
      </table>`;
  }

  function renderMaintenance() {
    const el = document.getElementById('asmMaintBody'); if (!el) return;
    const assets = getAssets().filter(a => a.status !== 'retired');
    const scheduled = assets.map(a => ({ a, m: maintenanceView(a) })).filter(x => x.m.scheduled).sort((x, y) => x.m.days - y.m.days);
    const logs = (R()?.maintenanceLogs || []).slice().sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, 25);
    const assetName = id => (getAssets(true).find(a => a.id === id) || {}).name || id;
    el.innerHTML = `
      <div class="asm-panel">
        <div class="asm-panel-head"><h3>📅 جدول الصيانة الوقائية</h3></div>
        <table class="asm-table">
          <thead><tr><th>الأصل</th><th>الدورة</th><th>آخر صيانة</th><th>الصيانة القادمة</th><th>الحالة</th><th>إجراء</th></tr></thead>
          <tbody>${scheduled.map(({ a, m }) => `<tr class="${m.overdue ? 'asm-row-danger' : m.due ? 'asm-row-warn' : ''}">
            <td><strong>${esc(a.name)}</strong></td>
            <td>كل ${m.interval} يوم</td>
            <td class="asm-muted">${esc(a.lastMaintenanceDate || '—')}</td>
            <td>${esc(m.next)}</td>
            <td>${m.overdue ? `<span class="asm-badge asm-st-retired">متأخرة ${Math.abs(m.days)}ي</span>` : m.due ? `<span class="asm-badge asm-st-maint">خلال ${m.days}ي</span>` : `<span class="asm-badge asm-st-ok">ضمن الجدول</span>`}</td>
            <td><button class="asm-mini-btn" onclick="asmLogMaintenance('${a.id}')">سجّل صيانة</button> <button class="asm-mini-btn" onclick="asmSetMaintenance('${a.id}')">${a.status === 'under_maintenance' ? 'إنهاء الصيانة' : 'دخول صيانة'}</button></td>
          </tr>`).join('') || '<tr><td colspan="6" class="asm-empty">لا توجد أصول مجدولة — عرّف «دورة الصيانة» للأصل</td></tr>'}</tbody>
        </table>
      </div>
      <div class="asm-panel">
        <div class="asm-panel-head"><h3>📜 سجل الصيانة</h3></div>
        <table class="asm-table">
          <thead><tr><th>التاريخ</th><th>الأصل</th><th>العمل المنجز</th><th>الكلفة</th><th>بواسطة</th></tr></thead>
          <tbody>${logs.map(l => `<tr><td class="asm-muted">${esc(l.date)}</td><td>${esc(assetName(l.assetId))}</td><td>${esc(l.description)}</td><td>${l.cost ? fmt(l.cost) + ' ' + curSym() : '—'}</td><td class="asm-muted">${esc(l.by || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="asm-empty">لا يوجد سجل صيانة بعد</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function renderTabContent() {
    const map = { asmDashBody: 'dashboard', asmRegBody: 'register', asmDeprBody: 'depreciation', asmMaintBody: 'maintenance' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'register') renderRegister();
    else if (activeTab === 'depreciation') renderDepreciation();
    else if (activeTab === 'maintenance') renderMaintenance();
  }

  function renderAssets() {
    const body = document.getElementById('assetsBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 لوحة الأصول'], ['register', '🗂️ سجل الأصول'], ['depreciation', '📉 الإهلاك'], ['maintenance', '🔧 الصيانة']];
    body.innerHTML = `
      <div class="asm-tabs">${tabs.map(([k, l]) => `<button class="asm-tab-btn ${activeTab === k ? 'active' : ''}" onclick="asmOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="asmDashBody"></div><div id="asmRegBody"></div><div id="asmDeprBody"></div><div id="asmMaintBody"></div>`;
    renderTabContent();
  }
  window.renderAssets = renderAssets;

  /* ───────────────────────── switchPage hook ───────────────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'assets') {
      // Core switchPage only activates pages in its built-in pageMap; like pos/pharmacy/mrp,
      // this module activates its own section explicitly so navigation actually shows it.
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageAssets'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navAssets'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('assets');
      } catch (_) {}
      ensureData();
      setTimeout(renderAssets, 0);
    }
  };

  /* ───────────────────────── Jarvis tool + route registration ───────────────────────── */
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_assets_today'] = function () {
          const p = portfolio();
          return {
            assets: p.count, bookValue: p.book, acquisitionCost: p.cost, accumulatedDepreciation: p.accumulated,
            monthlyDepreciation: p.monthlyDep, underMaintenance: p.underMaintenance, retired: p.retired,
            maintenanceDue: p.maintenanceDue.map(x => ({ name: x.asset.name, daysUntilDue: x.m.days, overdue: x.m.overdue })),
            warrantyExpiring: p.warrantyExpiring.map(x => ({ name: x.asset.name, expiry: x.w.expiry, expired: x.w.expired }))
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['assets'] = '#pageAssets';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis);
  else setTimeout(registerJarvis, 600);

  window.OctagonAssets = { render: renderAssets, ensureData, portfolio, deprView };
})();
