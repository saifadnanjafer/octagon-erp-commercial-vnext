/**
 * OCTAGON ERP — Approvals (طلبات الموافقات).
 *
 * The Odoo "Approvals" app Octagon had ZERO of (`omni.approvals` = 0). A generic,
 * human-facing approval-request workflow: an employee submits a typed request
 * (purchase, advance/payment, travel, equipment, extra-leave, contract, general),
 * a manager approves/rejects with a note, status is tracked. Universal across
 * every department and vertical.
 *
 * DISTINCT from the AI approval queue (`getAiControl().actionQueue`, which gates
 * AI *writes*) — this is people approving people's requests. Add-only,
 * self-contained in `omni.approvalHub`. Touches NO finance: approving a "purchase"
 * request records the decision and prompts the user to act in Procurement — it
 * never auto-posts money or creates a PO.
 *
 * Page: #pageApprovals (nav data-page="approvals").
 */
(function () {
  'use strict';

  function O() { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} } return null; }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function num(n) { n = Number(n); return isFinite(n) ? n : 0; }
  function fmt(n) { return Math.round(num(n)).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { return num(val(id)); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function userName() { try { const u = window.PentagonAuth && PentagonAuth.getCurrentUser && PentagonAuth.getCurrentUser(); if (u && u.name) return u.name; if (u && u.id) return u.id; } catch (_) {} try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function tenantStamp(record) {
    if (!record || typeof record !== 'object') return record;
    try { if (window.OctagonTenant && typeof OctagonTenant.stamp === 'function') return OctagonTenant.stamp(record); } catch (_) {}
    try {
      const p = typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile() : null;
      if (p && p.companyId && !record.companyId) { record.companyId = p.companyId; record.companyName = p.companyName || ''; }
    } catch (_) {}
    return record;
  }
  function groups() { try { if (window.PermissionService && window.PentagonAuth) { const g = window.PermissionService.resolveGroups(window.PentagonAuth.getCurrentUser()); if (Array.isArray(g)) return g; } } catch (_) {} return ['system.admin']; }
  function isManager() { const g = groups(); return g.includes('system.admin') || g.includes('workshop.manager'); }
  async function omniPrompt(message, defaultVal) {
    if (typeof window.showOmniPrompt === 'function') return await window.showOmniPrompt(message, defaultVal || '');
    toast(message, 'info');
    return defaultVal || '';
  }
  async function omniConfirm(title, message) {
    if (typeof window.showOmniConfirm === 'function') return await window.showOmniConfirm(title, message, 'تأكيد', 'إلغاء');
    toast(`${title}: ${message}`, 'warning');
    return false;
  }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('approvals', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'approvals', action, detail, user: userName() }); } catch (_) {}
  }

  const CATS = [
    ['purchase', '🛒 شراء', true], ['payment', '💵 صرفية/سلفة', true], ['travel', '✈️ سفر/مهمة', true],
    ['equipment', '🛠️ معدات/أدوات', false], ['leave_extra', '🏖️ إجازة استثنائية', false],
    ['contract', '📝 عقد/اتفاقية', true], ['general', '📋 عام', false]
  ];
  const CAT_LABEL = Object.fromEntries(CATS.map(c => [c[0], c[1]]));
  const CAT_AMOUNT = Object.fromEntries(CATS.map(c => [c[0], c[2]]));
  const STATUS_LABEL = { pending: 'بانتظار الموافقة', approved: 'موافَق', rejected: 'مرفوض', cancelled: 'ملغي' };
  const STATUS_CLASS = { pending: 'ap-st-pending', approved: 'ap-st-approved', rejected: 'ap-st-rejected', cancelled: 'ap-st-cancelled' };
  const PRIO = { low: 'منخفض', normal: 'عادي', high: 'عالٍ', urgent: 'عاجل' };

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.approvalHub || typeof o.approvalHub !== 'object') o.approvalHub = {};
    if (!Array.isArray(o.approvalHub.requests)) o.approvalHub.requests = [];
    return o.approvalHub;
  }
  function H() { return ensureData(); }
  function requests(all) { let l = (H()?.requests || []).filter(r => all || r.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function reqById(id) { return (H()?.requests || []).find(r => r.id === id) || null; }

  function portfolio() {
    const rs = requests();
    const pending = rs.filter(r => r.status === 'pending');
    const monthPrefix = todayISO().slice(0, 7);
    const approvedMonth = rs.filter(r => r.status === 'approved' && String(r.decidedAt || '').slice(0, 7) === monthPrefix);
    const byCat = {};
    pending.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + 1; });
    return {
      total: rs.length, pending: pending.length,
      pendingAmount: pending.reduce((s, r) => s + num(r.amount), 0),
      approvedMonth: approvedMonth.length, approvedMonthAmount: approvedMonth.reduce((s, r) => s + num(r.amount), 0),
      rejected: rs.filter(r => r.status === 'rejected').length,
      byCat: Object.entries(byCat).map(([k, v]) => ({ cat: k, label: CAT_LABEL[k] || k, count: v })).sort((a, b) => b.count - a.count),
      queue: pending.slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    };
  }

  let activeTab = 'dashboard', editing = null, search = '', catFilter = '', statusFilter = '';
  window.apOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.apSearch = function (v) { search = v; renderList(); };
  window.apCatFilter = function (v) { catFilter = v; renderList(); };
  window.apStatusFilter = function (v) { statusFilter = v; renderList(); };
  window.apNew = function () { editing = 'new'; activeTab = 'requests'; render(); };
  window.apEdit = function (id) { const r = reqById(id); if (!r) return; if (r.status !== 'pending') { toast('لا يمكن تعديل طلب تمت معالجته', 'warning'); return; } editing = id; activeTab = 'requests'; render(); };
  window.apCancelForm = function () { editing = null; render(); };

  window.apSave = function () {
    const h = H(); if (!h) return;
    const title = val('apTitle'); if (!title) { toast('عنوان الطلب مطلوب', 'error'); return; }
    const base = {
      category: val('apCategory') || 'general', title, amount: numVal('apAmount'),
      priority: val('apPriority') || 'normal', neededBy: val('apNeededBy'), description: val('apDesc')
    };
    const ex = editing && editing !== 'new' ? reqById(editing) : null;
    if (ex) { Object.assign(ex, base); tenantStamp(ex); audit('request_update', `تعديل طلب: ${title}`); toast('تم التحديث', 'success'); }
    else {
      h.requests.unshift(tenantStamp({ id: uid('apr'), ref: 'AP-' + todayISO().replace(/-/g, '').slice(2) + '-' + String((h.requests.length + 1)).padStart(3, '0'), ...base, status: 'pending', requester: userName(), is_active: true, createdAt: new Date().toISOString(), decidedAt: '', decidedBy: '', decisionNote: '' }));
      audit('request_create', `طلب موافقة جديد: ${title}`); toast('تم إرسال الطلب للموافقة', 'success');
    }
    save(); editing = null; render();
  };

  function isApproverAi() {
    try {
      const u = window.PentagonAuth && window.PentagonAuth.getCurrentUser && window.PentagonAuth.getCurrentUser();
      if (u) {
        const name = (u.displayName || u.name || u.id || '').toLowerCase();
        return name.includes('jarvis') || name.includes('ai') || name.includes('assistant') || name.includes('bot');
      }
    } catch (_) {}
    return false;
  }

  function resolveInventoryCountLocation(requestedLocationId) {
    const omni = O();
    const locations = Array.isArray(omni.storageLocations) ? omni.storageLocations : [];
    
    // 1. If requestedLocationId exists in storageLocations, it is canonical
    const exists = locations.some(loc => loc.id === requestedLocationId);
    if (exists) return requestedLocationId;

    // 2. Normalize MAIN_STOCK to LOC_MAIN if LOC_MAIN exists
    if (requestedLocationId === 'MAIN_STOCK') {
      const hasLocMain = locations.some(loc => loc.id === 'LOC_MAIN');
      if (hasLocMain) return 'LOC_MAIN';
      
      const hasLocMainInStock = omni.warehouseStock && Object.values(omni.warehouseStock).some(s => s && 'LOC_MAIN' in s);
      if (hasLocMainInStock) return 'LOC_MAIN';
    }

    return requestedLocationId;
  }

  function syncWarehouseStockAndLocationStock(materialId, locationId, qty) {
    const omni = O();
    if (!omni) return;

    // Update warehouseStock
    if (!omni.warehouseStock) omni.warehouseStock = {};
    if (!omni.warehouseStock[materialId]) omni.warehouseStock[materialId] = {};
    omni.warehouseStock[materialId][locationId] = qty;

    // Update locationStock (Core Array)
    if (!Array.isArray(omni.locationStock)) omni.locationStock = [];
    let row = omni.locationStock.find(item => item.materialId === materialId && item.locationId === locationId);
    if (row) {
      row.qty = qty;
    } else {
      omni.locationStock.push({
        id: uid('lstock'),
        materialId: materialId,
        locationId: locationId,
        qty: qty,
        reservedQty: 0,
        unit: (omni.materials && omni.materials.find(m => m.id === materialId)?.unit) || '',
        companyId: omni.locationStock[0]?.companyId || '',
        createdAt: new Date().toISOString()
      });
    }
  }

  function recalculateMaterialStockFromLocations(materialId) {
    const omni = O();
    if (!omni) return;
    const m = omni.materials && omni.materials.find(x => x.id === materialId);
    if (!m) return;

    let sum = 0;
    if (omni.warehouseStock && omni.warehouseStock[materialId]) {
      const locs = omni.warehouseStock[materialId];
      Object.keys(locs).forEach(k => {
        // Prevent double counting if both LOC_MAIN and MAIN_STOCK are present
        if (k === 'MAIN_STOCK' && 'LOC_MAIN' in locs) {
          return;
        }
        sum += Number(locs[k]) || 0;
      });
    }
    m.stock = sum;
  }

  async function decide(id, status) {
    const r = reqById(id); if (!r || r.status !== 'pending') return;
    if (!isManager()) { toast('الموافقة/الرفض للمدير فقط', 'error'); return; }
    if (isApproverAi()) { toast('الذكاء الاصطناعي لا يملك صلاحية الاعتماد', 'error'); return; }
    let note = '';
    if (status === 'rejected') { const answer = await omniPrompt('سبب الرفض (اختياري):', ''); note = answer == null ? '' : answer; }
    r.status = status; r.decidedAt = new Date().toISOString(); r.decidedBy = userName(); r.decisionNote = note;
    tenantStamp(r);
    
    if (status === 'approved' && r.payload && r.payload.type === 'inventory_count') {
      try {
        const matId = r.payload.materialId;
        const requestedLocId = r.payload.locationId;
        const qty = Number(r.payload.actualQty);
        const omni = O();
        
        if (omni && isFinite(qty) && qty >= 0) {
          const canonicalLocId = resolveInventoryCountLocation(requestedLocId);
          
          // Get current stock at canonical location to compute variance
          let oldQty = 0;
          if (omni.warehouseStock && omni.warehouseStock[matId] && omni.warehouseStock[matId][canonicalLocId] !== undefined) {
            oldQty = Number(omni.warehouseStock[matId][canonicalLocId]) || 0;
          } else if (Array.isArray(omni.locationStock)) {
            const row = omni.locationStock.find(item => item.materialId === matId && item.locationId === canonicalLocId);
            if (row) oldQty = Number(row.qty) || 0;
          }
          
          const variance = qty - oldQty;
          
          // Sync warehouseStock and core locationStock
          syncWarehouseStockAndLocationStock(matId, canonicalLocId, qty);
          
          // Recalculate totals
          recalculateMaterialStockFromLocations(matId);
          
          // Write movement record if variance is nonzero
          if (Math.abs(variance) > 0.0001) {
            const m = omni.materials && omni.materials.find(x => x.id === matId);
            if (!Array.isArray(omni.locationMovements)) omni.locationMovements = [];
            omni.locationMovements.push({
              id: uid('mv'),
              materialId: matId,
              materialName: m ? m.name : matId,
              fromLocation: 'SYSTEM_ADJUST',
              toLocation: canonicalLocId,
              qty: variance,
              type: 'adjustment',
              createdAt: new Date().toISOString(),
              createdBy: userName(),
              notes: `تسوية جرد معتمد: ${r.ref || ''}. ملاحظة: ${note}`,
              oldQty: oldQty,
              countedQty: qty,
              variance: variance,
              approvalId: id,
              approvedBy: userName(),
              approvedAt: new Date().toISOString(),
              source: 'mobile_inventory_count'
            });
          }
        }
      } catch (err) {
        console.error('Error applying inventory count adjustment:', err);
      }
    }
    audit('request_' + status, `${r.ref || r.title} → ${STATUS_LABEL[status]}`);
    save();
    if (status === 'approved' && r.category === 'purchase') toast('تمت الموافقة — أنشئ أمر الشراء من صفحة المشتريات', 'info');
    else toast(status === 'approved' ? 'تمت الموافقة' : 'تم الرفض', status === 'approved' ? 'success' : 'info');
    render();
  }
  window.apApprove = function (id) { decide(id, 'approved'); };
  window.apReject = function (id) { decide(id, 'rejected'); };
  window.apCancel = async function (id) { const r = reqById(id); if (!r) return; if (r.status !== 'pending') { toast('لا يمكن إلغاء طلب تمت معالجته', 'warning'); return; } if (!await omniConfirm('سحب الطلب', 'سحب/إلغاء هذا الطلب؟')) return; r.status = 'cancelled'; r.decidedAt = new Date().toISOString(); tenantStamp(r); audit('request_cancel', `سحب طلب ${r.ref || r.title}`); save(); toast('تم سحب الطلب', 'info'); render(); };
  window.apArchive = function (id) { const r = reqById(id); if (!r) return; r.is_active = false; audit('request_archive', `أرشفة ${r.ref || r.title}`); save(); render(); };

  // Integration: an APPROVED purchase request → one-click draft PO in Procurement.
  window.apToPO = function (id) {
    const r = reqById(id); if (!r) return;
    if (r.status !== 'approved' || r.category !== 'purchase') { toast('متاح فقط لطلبات الشراء المُوافَق عليها', 'warning'); return; }
    if (r.poId) { toast('تم إنشاء أمر شراء مسبقاً', 'info'); switchPage('procurement'); return; }
    if (!(window.OctagonProcurement && typeof OctagonProcurement.createDraftPO === 'function')) { toast('وحدة المشتريات غير متوفرة', 'error'); return; }
    const po = OctagonProcurement.createDraftPO({
      title: r.title, qty: 1, unitCost: num(r.amount), notes: r.description || '',
      sourcePage: 'approval', sourceRef: r.id, originText: `من طلب موافقة ${r.ref || ''} — ${r.title}`
    });
    if (po) { r.poId = po.id; tenantStamp(r); audit('request_to_po', `${r.ref || r.title} → أمر شراء ${po.id}`); save(); toast('تم إنشاء أمر شراء (مسودة) في المشتريات', 'success'); switchPage('procurement'); }
  };

  window.apLoadDemo = function () {
    const h = H(); if (!h) return;
    if (h.requests.length) { toast('توجد طلبات مسبقاً', 'info'); return; }
    const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
    const mk = (cat, title, amount, prio, status, ageDays, note) => tenantStamp({ id: uid('apr'), ref: 'AP-DEMO-' + Math.random().toString(36).slice(2, 5), category: cat, title, amount: amount || 0, priority: prio, neededBy: todayISO(), description: '', status, requester: 'موظف', is_active: true, createdAt: back(ageDays), decidedAt: status === 'pending' ? '' : back(ageDays - 1), decidedBy: status === 'pending' ? '' : 'المدير', decisionNote: note || '' });
    h.requests.unshift(
      mk('purchase', 'شراء عدّة لحام جديدة', 450000, 'high', 'pending', 2),
      mk('payment', 'سلفة موظف — طارئ عائلي', 300000, 'urgent', 'pending', 1),
      mk('travel', 'مهمة استلام قطع من البصرة', 200000, 'normal', 'pending', 3),
      mk('equipment', 'طلب حاسبة للمكتب', 0, 'normal', 'approved', 6, 'موافق'),
      mk('leave_extra', 'إجازة استثنائية يومين', 0, 'normal', 'rejected', 8, 'الضغط على العمل')
    );
    audit('approvals_demo', 'تحميل طلبات تجريبية'); save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  /* ---- render ---- */
  function kpi(label, value, sub, cls) { return `<div class="ap-kpi ${cls || ''}"><div class="ap-kpi-val">${value}</div><div class="ap-kpi-label">${label}</div>${sub ? `<div class="ap-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('apDashBody'); if (!el) return;
    const p = portfolio();
    const mgr = isManager();
    el.innerHTML = `
      <div class="ap-kpi-grid">
        ${kpi('بانتظار الموافقة', p.pending, p.pendingAmount ? `${fmt(p.pendingAmount)} ${curSym()}` : '', p.pending ? 'ap-kpi-accent' : '')}
        ${kpi('موافقات هذا الشهر', p.approvedMonth, p.approvedMonthAmount ? `${fmt(p.approvedMonthAmount)} ${curSym()}` : '', 'ap-kpi-pos')}
        ${kpi('مرفوضة', p.rejected, '', '')}
        ${kpi('إجمالي الطلبات', p.total, '', '')}
      </div>
      ${p.byCat.length ? `<div class="ap-panel"><div class="ap-panel-head"><h3>📊 المعلّقة حسب النوع</h3></div><div class="ap-chips">${p.byCat.map(c => `<span class="ap-chip">${c.label} <strong>${c.count}</strong></span>`).join('')}</div></div>` : ''}
      <div class="ap-panel"><div class="ap-panel-head"><h3>⏳ قائمة الموافقات المعلّقة</h3><button class="ap-mini-btn" onclick="apOpenTab('requests')">كل الطلبات</button></div>
        <table class="ap-table"><thead><tr><th>المرجع</th><th>النوع</th><th>العنوان</th><th>المبلغ</th><th>الأولوية</th><th>مقدّم الطلب</th>${mgr ? '<th>إجراء</th>' : ''}</tr></thead>
        <tbody>${p.queue.map(r => `<tr>
          <td class="ap-muted">${esc(r.ref || '—')}</td><td>${CAT_LABEL[r.category] || r.category}</td>
          <td><strong>${esc(r.title)}</strong></td><td>${r.amount ? fmt(r.amount) + ' ' + curSym() : '—'}</td>
          <td><span class="ap-prio ap-prio-${r.priority}">${PRIO[r.priority] || r.priority}</span></td><td class="ap-muted">${esc(r.requester || '')}</td>
          ${mgr ? `<td class="ap-actions"><button class="ap-mini-btn ap-ok" onclick="apApprove('${r.id}')">موافقة</button><button class="ap-mini-btn ap-danger" onclick="apReject('${r.id}')">رفض</button></td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${mgr ? 7 : 6}" class="ap-empty">لا توجد طلبات معلّقة</td></tr>`}</tbody></table>
      </div>`;
  }

  function renderForm() {
    const r = editing !== 'new' ? reqById(editing) : null; const v = r || {};
    const catOpt = CATS.map(([k, l]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${l}</option>`).join('');
    const prOpt = Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${v.priority === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="ap-panel"><div class="ap-panel-head"><h3>${r ? 'تعديل طلب' : 'طلب موافقة جديد'}</h3></div>
      <div class="ap-form-grid">
        <div><label>النوع</label><select id="apCategory" class="ap-input">${catOpt}</select></div>
        <div><label>الأولوية</label><select id="apPriority" class="ap-input">${prOpt}</select></div>
        <div class="ap-form-full"><label>عنوان الطلب *</label><input id="apTitle" class="ap-input" value="${esc(v.title || '')}"></div>
        <div><label>المبلغ (إن وُجد) (${curSym()})</label><input id="apAmount" type="number" class="ap-input" value="${num(v.amount) || ''}"></div>
        <div><label>مطلوب بحلول</label><input id="apNeededBy" type="date" class="ap-input" value="${esc(v.neededBy || todayISO())}"></div>
        <div class="ap-form-full"><label>التفاصيل</label><input id="apDesc" class="ap-input" value="${esc(v.description || '')}"></div>
      </div>
      <div class="ap-form-actions"><button class="btn-primary" onclick="apSave()">${r ? 'حفظ' : 'إرسال للموافقة'}</button><button class="ap-mini-btn" onclick="apCancelForm()">إلغاء</button></div></div>`;
  }

  function renderList() {
    const el = document.getElementById('apListBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    const mgr = isManager();
    let list = requests();
    if (catFilter) list = list.filter(r => r.category === catFilter);
    if (statusFilter) list = list.filter(r => r.status === statusFilter);
    if (search) { const q = search.toLowerCase(); list = list.filter(r => `${r.ref} ${r.title} ${r.requester}`.toLowerCase().includes(q)); }
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    el.innerHTML = `
      <div class="ap-toolbar">
        <button class="btn-primary" onclick="apNew()">➕ طلب جديد</button>
        <button class="ap-mini-btn" onclick="apLoadDemo()">بيانات تجريبية</button>
        <select class="ap-mini-select" onchange="apCatFilter(this.value)"><option value="">كل الأنواع</option>${CATS.map(([k, l]) => `<option value="${k}" ${catFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="ap-mini-select" onchange="apStatusFilter(this.value)"><option value="">كل الحالات</option>${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${statusFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="ap-input" placeholder="بحث..." value="${esc(search)}" oninput="apSearch(this.value)" style="max-width:180px">
      </div>
      ${mgr ? '' : '<div class="ap-note">📌 يمكنك تقديم الطلبات ومتابعتها. الموافقة/الرفض للمدير فقط.</div>'}
      <table class="ap-table"><thead><tr><th>المرجع</th><th>النوع</th><th>العنوان</th><th>المبلغ</th><th>الأولوية</th><th>مقدّم الطلب</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(r => {
        const acts = [];
        if (r.status === 'pending' && mgr) { acts.push(`<button class="ap-mini-btn ap-ok" onclick="apApprove('${r.id}')">موافقة</button>`); acts.push(`<button class="ap-mini-btn ap-danger" onclick="apReject('${r.id}')">رفض</button>`); }
        if (r.status === 'pending') { acts.push(`<button class="ap-mini-btn" onclick="apEdit('${r.id}')">تعديل</button>`); acts.push(`<button class="ap-mini-btn" onclick="apCancel('${r.id}')">سحب</button>`); }
        if (r.status === 'approved' && r.category === 'purchase') acts.push(r.poId ? `<button class="ap-mini-btn" onclick="switchPage('procurement')">عرض أمر الشراء ✓</button>` : `<button class="ap-mini-btn ap-ok" onclick="apToPO('${r.id}')">➜ أمر شراء</button>`);
        if (r.status !== 'pending') acts.push(`<button class="ap-mini-btn ap-danger" onclick="apArchive('${r.id}')">أرشفة</button>`);
        return `<tr>
          <td class="ap-muted">${esc(r.ref || '—')}</td><td>${CAT_LABEL[r.category] || r.category}</td>
          <td><strong>${esc(r.title)}</strong>${r.description ? `<br><span class="ap-muted">${esc(r.description)}</span>` : ''}${r.decisionNote ? `<br><span class="ap-muted">📝 ${esc(r.decisionNote)}</span>` : ''}</td>
          <td>${r.amount ? fmt(r.amount) + ' ' + curSym() : '—'}</td>
          <td><span class="ap-prio ap-prio-${r.priority}">${PRIO[r.priority] || r.priority}</span></td>
          <td class="ap-muted">${esc(r.requester || '')}${r.decidedBy ? `<br>← ${esc(r.decidedBy)}` : ''}</td>
          <td><span class="ap-badge ${STATUS_CLASS[r.status] || ''}">${STATUS_LABEL[r.status] || r.status}</span></td>
          <td class="ap-actions">${acts.join('') || '<span class="ap-muted">—</span>'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="ap-empty">لا توجد طلبات</td></tr>'}</tbody></table>`;
  }

  function renderTabContent() {
    const map = { apDashBody: 'dashboard', apListBody: 'requests' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else renderList();
  }
  function render() {
    const body = document.getElementById('approvalsBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['requests', '📋 الطلبات']];
    body.innerHTML = `<div class="ap-tabs">${tabs.map(([k, l]) => `<button class="ap-tab-btn ${activeTab === k ? 'active' : ''}" onclick="apOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="apDashBody"></div><div id="apListBody"></div>`;
    renderTabContent();
  }
  window.renderApprovals = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'approvals') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageApprovals'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navApprovals'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('approvals');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };

  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_approvals_today'] = function () {
          const p = portfolio();
          return { pending: p.pending, pendingAmount: p.pendingAmount, approvedThisMonth: p.approvedMonth, rejected: p.rejected, totalRequests: p.total, pendingByCategory: p.byCat.map(c => ({ category: c.cat, count: c.count })) };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['approvals'] = '#pageApprovals';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonApprovals = { render, ensureData, portfolio, isManager };
})();
