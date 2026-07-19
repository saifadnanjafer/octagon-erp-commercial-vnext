/**
 * OCTAGON ERP — Procurement / Purchase Orders (المشتريات وأوامر الشراء).
 *
 * A core ERP pillar (Odoo's Purchase app) that Octagon had a working ENGINE for
 * (`omni.purchaseOrders` + `omni.suppliers` + `receivePurchaseOrder()` in app.js)
 * but NO dedicated page — POs could only be born from a Command-Center request.
 * This module is the missing front door: create a PO/RFQ directly, confirm it to
 * "ordered", receive goods (reusing the proven `window.receivePurchaseOrder`
 * intake engine — stock + movement + purchase JE all handled there), and manage
 * suppliers — all from one Arabic page.
 *
 * REUSE, don't rebuild: it reads/writes the SAME `omni.purchaseOrders` /
 * `omni.suppliers` collections the app already normalizes, and delegates receiving
 * + finance posting to the existing engine. Add-only; zero app.js edits.
 *
 * Page: #pageProcurement (nav data-page="procurement").
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
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function tenantStamp(record) {
    if (!record || typeof record !== 'object') return record;
    try { if (window.OctagonTenant && typeof OctagonTenant.stamp === 'function') return OctagonTenant.stamp(record); } catch (_) {}
    try {
      const p = typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile() : null;
      if (p && p.companyId && !record.companyId) { record.companyId = p.companyId; record.companyName = p.companyName || ''; }
    } catch (_) {}
    return record;
  }
  function tenantScope(list) {
    if (!Array.isArray(list)) return [];
    try { if (window.OctagonTenant && typeof OctagonTenant.scope === 'function') return OctagonTenant.scope(list); } catch (_) {}
    try { if (typeof window.scoped === 'function') return window.scoped(list); } catch (_) {}
    return list;
  }
  async function omniConfirm(title, message) {
    if (typeof window.showOmniConfirm === 'function') return await window.showOmniConfirm(title, message, 'تأكيد', 'إلغاء');
    toast(`${title}: ${message}`, 'warning');
    return false;
  }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('procurement', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'procurement', action, detail, user: userName() }); } catch (_) {}
  }

  const STATUS_LABEL = { draft: 'مسودة (طلب عرض)', ordered: 'مُرسَل/مؤكَّد', partial: 'استلام جزئي', received: 'مُستلَم', cancelled: 'ملغي' };
  const STATUS_CLASS = { draft: 'prc-st-draft', ordered: 'prc-st-ordered', partial: 'prc-st-partial', received: 'prc-st-received', cancelled: 'prc-st-cancelled' };

  function POs(all) {
    const o = O(); if (!o) return [];
    if (!Array.isArray(o.purchaseOrders)) o.purchaseOrders = [];
    let l = o.purchaseOrders.slice();
    if (!all) l = l.filter(p => p.is_active !== false);
    if (!all) l = tenantScope(l);
    return l;
  }
  function Suppliers(all) { const o = O(); if (!o) return []; if (!Array.isArray(o.suppliers)) o.suppliers = []; return all ? o.suppliers : tenantScope(o.suppliers); }
  function Materials() { const o = O(); return tenantScope((o && Array.isArray(o.materials)) ? o.materials : []); }
  function poById(id) { return POs(true).find(p => p.id === id) || null; }

  function poItems(po) { return Array.isArray(po.items) && po.items.length ? po.items : [{ materialId: po.materialId || '', materialName: po.materialName || 'مادة', qty: Number(po.approvedQty || 0), receivedQty: Number(po.receivedQty || 0), unit: po.unit || '', unitCost: Number(po.unitCost || 0) }]; }
  function poValue(po) { return poItems(po).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitCost) || 0), 0); }
  function poReceivedValue(po) { return (po.receipts || []).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0); }
  function poOrderedQty(po) { return poItems(po).reduce((s, it) => s + (Number(it.qty) || 0), 0); }
  function poReceivedQty(po) { return poItems(po).reduce((s, it) => s + (Number(it.receivedQty) || 0), 0); }

  function portfolio() {
    const all = POs();
    const open = all.filter(p => ['draft', 'ordered', 'partial'].includes(p.status));
    const awaiting = all.filter(p => ['ordered', 'partial'].includes(p.status));
    const monthPrefix = todayISO().slice(0, 7);
    let monthValue = 0;
    all.forEach(po => (po.receipts || []).forEach(r => { if (String(r.date || '').slice(0, 7) === monthPrefix) monthValue += (Number(r.qty) || 0) * (Number(r.unitCost) || 0); }));
    const openValue = open.reduce((s, p) => s + (poValue(p) - poReceivedValue(p)), 0);
    const sups = Suppliers().slice().sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0));
    return {
      total: all.length, open: open.length, awaiting: awaiting.length,
      draft: all.filter(p => p.status === 'draft').length,
      monthValue, openValue, supplierCount: Suppliers().length, topSuppliers: sups.slice(0, 5)
    };
  }

  let activeTab = 'dashboard', editing = null, search = '', statusFilter = '', formLines = [];
  window.prcOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.prcSearch = function (v) { search = v; renderList(); };
  window.prcFilter = function (v) { statusFilter = v; renderList(); };

  /* ----- PO form ----- */
  window.prcNewPO = function () { editing = 'new'; formLines = [blankLine()]; activeTab = 'orders'; render(); };
  window.prcEditPO = function (id) { const po = poById(id); if (!po) return; if (po.status !== 'draft') { toast('لا يمكن تعديل أمر مؤكَّد — استخدم الاستلام', 'warning'); return; } editing = id; formLines = poItems(po).map(it => ({ materialId: it.materialId || '', qty: Number(it.qty) || 0, unitCost: Number(it.unitCost) || 0 })); activeTab = 'orders'; render(); };
  window.prcCancelForm = function () { editing = null; formLines = []; render(); };
  function blankLine() { return { materialId: '', qty: 1, unitCost: 0 }; }
  window.prcAddLine = function () { syncFormLines(); formLines.push(blankLine()); renderList(); };
  window.prcRemoveLine = function (i) { syncFormLines(); formLines.splice(i, 1); if (!formLines.length) formLines.push(blankLine()); renderList(); };
  window.prcLineMat = function (i, matId) { const m = Materials().find(x => x.id === matId); formLines[i].materialId = matId; if (m && (!formLines[i].unitCost || formLines[i].unitCost === 0)) { const inp = document.getElementById('prcCost_' + i); if (inp) inp.value = money(m.cost) || ''; } };
  function syncFormLines() {
    formLines.forEach((ln, i) => {
      const matSel = document.getElementById('prcMat_' + i); if (matSel) ln.materialId = matSel.value;
      const q = document.getElementById('prcQty_' + i); if (q) ln.qty = Number(q.value) || 0;
      const c = document.getElementById('prcCost_' + i); if (c) ln.unitCost = Number(c.value) || 0;
    });
  }

  window.prcSavePO = function () {
    syncFormLines();
    const o = O(); if (!o) return;
    const supName = val('prcSupplier');
    const lines = formLines.filter(l => l.materialId && (Number(l.qty) || 0) > 0);
    if (!lines.length) { toast('أضف مادة واحدة على الأقل بكمية', 'error'); return; }
    const items = lines.map(l => { const m = Materials().find(x => x.id === l.materialId); return { materialId: l.materialId, materialName: m ? m.name : 'مادة', qty: Number(l.qty) || 0, receivedQty: 0, unit: m ? (m.unit || '') : '', unitCost: Number(l.unitCost) || 0 }; });
    let sup = null;
    if (supName && typeof window.upsertSupplierByName === 'function') { try { sup = window.upsertSupplierByName(supName); } catch (_) {} }
    const notes = val('prcNotes'), expected = val('prcExpected');
    const ex = editing && editing !== 'new' ? poById(editing) : null;
    if (ex) {
      ex.items = items; ex.supplierName = supName; ex.supplierId = sup ? sup.id : (ex.supplierId || '');
      ex.notes = notes; ex.expectedDate = expected;
      ex.approvedQty = poOrderedQty(ex); ex.unitCost = items[0].unitCost; ex.materialId = items[0].materialId; ex.materialName = items[0].materialName;
      tenantStamp(ex);
      if (sup) tenantStamp(sup);
      (ex.activityLog = ex.activityLog || []).unshift({ date: new Date().toISOString(), text: 'تعديل أمر الشراء' });
      audit('po_update', `تعديل أمر شراء ${ex.id}`); toast('تم تحديث أمر الشراء', 'success');
    } else {
      const po = {
        id: uid('po'), requestId: '', sourcePage: 'procurement', status: 'draft',
        supplierName: supName, supplierId: sup ? sup.id : '',
        materialId: items[0].materialId, materialName: items[0].materialName,
        approvedQty: items.reduce((s, i) => s + i.qty, 0), requestedQty: items.reduce((s, i) => s + i.qty, 0),
        receivedQty: 0, unit: items[0].unit, unitCost: items[0].unitCost,
        notes, expectedDate: expected, items, receipts: [], is_active: true,
        createdAt: new Date().toISOString(), createdBy: userName(),
        activityLog: [{ date: new Date().toISOString(), text: 'إنشاء أمر شراء (مسودة) من صفحة المشتريات' }]
      };
      tenantStamp(po);
      if (sup) tenantStamp(sup);
      o.purchaseOrders.unshift(po);
      audit('po_create', `أمر شراء جديد ${po.id} — ${items.length} بند`); toast('تم إنشاء أمر الشراء (مسودة)', 'success');
    }
    save(); editing = null; formLines = []; render();
  };

  window.prcConfirm = function (id) {
    const po = poById(id); if (!po || po.status !== 'draft') return;
    po.status = 'ordered'; po.orderedAt = new Date().toISOString();
    (po.activityLog = po.activityLog || []).unshift({ date: po.orderedAt, text: 'تأكيد/إرسال أمر الشراء إلى المورد' });
    audit('po_confirm', `تأكيد أمر شراء ${po.id}`); save(); toast('تم تأكيد الأمر — جاهز للاستلام', 'success'); render();
  };
  window.prcReceive = function (id) {
    const po = poById(id); if (!po) return;
    if (!['ordered', 'partial', 'approved'].includes(po.status)) { toast('أكِّد الأمر أولاً قبل الاستلام', 'warning'); return; }
    if (typeof window.receivePurchaseOrder !== 'function') { toast('محرّك الاستلام غير متوفر', 'error'); return; }
    Promise.resolve(window.receivePurchaseOrder(id)).then(() => { try { audit('po_receive', `استلام على أمر شراء ${id}`); } catch (_) {} setTimeout(render, 60); }).catch(() => setTimeout(render, 60));
  };
  window.prcCancel = async function (id) {
    const po = poById(id); if (!po) return;
    if (po.status === 'received') { toast('لا يمكن إلغاء أمر مُستلَم', 'warning'); return; }
    if (poReceivedQty(po) > 0) { toast('توجد كميات مستلمة — لا يمكن الإلغاء', 'warning'); return; }
    if (!await omniConfirm('إلغاء أمر الشراء', `إلغاء أمر الشراء ${po.id}؟`)) return;
    po.status = 'cancelled'; (po.activityLog = po.activityLog || []).unshift({ date: new Date().toISOString(), text: 'إلغاء أمر الشراء' });
    audit('po_cancel', `إلغاء أمر شراء ${po.id}`); save(); toast('تم الإلغاء', 'info'); render();
  };

  /* ----- Suppliers ----- */
  let supEditing = null;
  window.prcNewSupplier = function () { supEditing = 'new'; activeTab = 'suppliers'; render(); };
  window.prcEditSupplier = function (id) { supEditing = id; activeTab = 'suppliers'; render(); };
  window.prcCancelSupplier = function () { supEditing = null; render(); };
  window.prcSaveSupplier = function () {
    const o = O(); if (!o) return;
    const name = val('prcSupName'); if (!name) { toast('اسم المورد مطلوب', 'error'); return; }
    o.suppliers = o.suppliers || [];
    const ex = supEditing && supEditing !== 'new' ? o.suppliers.find(s => s.id === supEditing) : null;
    if (ex) { ex.name = name; ex.phone = val('prcSupPhone'); ex.contact = val('prcSupContact'); ex.notes = val('prcSupNotes'); tenantStamp(ex); audit('supplier_update', `تعديل مورد ${name}`); toast('تم تحديث المورد', 'success'); }
    else { const supplier = tenantStamp({ id: uid('sup'), name, phone: val('prcSupPhone'), contact: val('prcSupContact'), notes: val('prcSupNotes'), materials: [], catalog: [], priceHistory: [], lastReceiptAt: '', totalReceipts: 0, totalAmount: 0, createdAt: new Date().toISOString() }); o.suppliers.push(supplier); audit('supplier_create', `مورد جديد ${name}`); toast('تمت إضافة المورد', 'success'); }
    save(); supEditing = null; render();
  };

  window.prcLoadDemo = function () {
    const o = O(); if (!o) return;
    o.suppliers = o.suppliers || []; o.purchaseOrders = o.purchaseOrders || [];
    if ((o.purchaseOrders || []).some(p => p.sourcePage === 'procurement')) { toast('توجد بيانات مشتريات مسبقاً', 'info'); return; }
    const mats = Materials();
    if (!mats.length) { toast('لا توجد مواد في المخزون لإنشاء أمر تجريبي', 'warning'); return; }
    let sup = (typeof window.upsertSupplierByName === 'function') ? window.upsertSupplierByName('مورد تجريبي — الشركة العامة') : null;
    if (sup) tenantStamp(sup);
    const pick = mats.slice(0, Math.min(2, mats.length));
    const items = pick.map(m => ({ materialId: m.id, materialName: m.name, qty: 10, receivedQty: 0, unit: m.unit || '', unitCost: money(m.cost) || 1000 }));
    o.purchaseOrders.unshift(tenantStamp({
      id: uid('po'), requestId: '', sourcePage: 'procurement', status: 'draft',
      supplierName: sup ? sup.name : 'مورد تجريبي', supplierId: sup ? sup.id : '',
      materialId: items[0].materialId, materialName: items[0].materialName,
      approvedQty: items.reduce((s, i) => s + i.qty, 0), requestedQty: items.reduce((s, i) => s + i.qty, 0),
      receivedQty: 0, unit: items[0].unit, unitCost: items[0].unitCost, notes: 'أمر شراء تجريبي', expectedDate: todayISO(),
      items, receipts: [], is_active: true, createdAt: new Date().toISOString(), createdBy: userName(),
      activityLog: [{ date: new Date().toISOString(), text: 'أمر شراء تجريبي' }]
    }));
    audit('procurement_demo', 'تحميل بيانات مشتريات تجريبية'); save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  /* ----- render ----- */
  function kpi(label, value, sub, cls) { return `<div class="prc-kpi ${cls || ''}"><div class="prc-kpi-val">${value}</div><div class="prc-kpi-label">${label}</div>${sub ? `<div class="prc-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('prcDashBody'); if (!el) return;
    const p = portfolio();
    el.innerHTML = `
      <div class="prc-kpi-grid">
        ${kpi('أوامر مفتوحة', p.open, `${p.draft} مسودة · ${p.total} إجمالاً`, 'prc-kpi-accent')}
        ${kpi('بانتظار الاستلام', p.awaiting, '', '')}
        ${kpi('قيمة الأوامر المفتوحة', fmt(p.openValue) + ' ' + curSym(), 'غير مستلمة بعد', '')}
        ${kpi('مشتريات هذا الشهر', fmt(p.monthValue) + ' ' + curSym(), 'بقيمة المستلَم', 'prc-kpi-pos')}
        ${kpi('الموردون', p.supplierCount, '', '')}
      </div>
      <div class="prc-panel"><div class="prc-panel-head"><h3>🏆 أكبر الموردين (حسب إجمالي المشتريات)</h3><button class="prc-mini-btn" onclick="prcOpenTab('suppliers')">إدارة الموردين</button></div>
        <table class="prc-table"><thead><tr><th>المورد</th><th>الهاتف</th><th>عدد الاستلامات</th><th>إجمالي المشتريات</th></tr></thead>
        <tbody>${p.topSuppliers.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td class="prc-muted">${esc(s.phone || '—')}</td><td>${money(s.totalReceipts)}</td><td><strong>${fmt(s.totalAmount)}</strong> ${curSym()}</td></tr>`).join('') || '<tr><td colspan="4" class="prc-empty">لا يوجد موردون بعد</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderForm() {
    syncFormLines();
    const po = editing !== 'new' ? poById(editing) : null; const v = po || {};
    const matOpts = (sel) => '<option value="">— اختر مادة —</option>' + Materials().map(m => `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${esc(m.name)}${m.unit ? ' (' + esc(m.unit) + ')' : ''}</option>`).join('');
    const supList = Suppliers().map(s => esc(s.name));
    const linesHtml = formLines.map((ln, i) => `
      <tr>
        <td><select id="prcMat_${i}" class="prc-input" onchange="prcLineMat(${i}, this.value)">${matOpts(ln.materialId)}</select></td>
        <td><input id="prcQty_${i}" type="number" min="0" class="prc-input" style="width:90px" value="${ln.qty || ''}"></td>
        <td><input id="prcCost_${i}" type="number" min="0" class="prc-input" style="width:120px" value="${ln.unitCost || ''}"></td>
        <td class="prc-actions"><button class="prc-mini-btn prc-danger" onclick="prcRemoveLine(${i})">حذف</button></td>
      </tr>`).join('');
    const total = formLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
    return `<div class="prc-panel"><div class="prc-panel-head"><h3>${po ? 'تعديل أمر شراء (مسودة)' : 'أمر شراء جديد'}</h3></div>
      <div class="prc-form-grid">
        <div><label>المورد</label><input id="prcSupplier" class="prc-input" list="prcSupDatalist" value="${esc(v.supplierName || '')}" placeholder="اسم المورد"><datalist id="prcSupDatalist">${supList.map(n => `<option value="${n}">`).join('')}</datalist></div>
        <div><label>تاريخ التسليم المتوقع</label><input id="prcExpected" type="date" class="prc-input" value="${esc(v.expectedDate || todayISO())}"></div>
        <div class="prc-form-full"><label>ملاحظات</label><input id="prcNotes" class="prc-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div style="margin-top:14px"><label style="font-weight:700;font-size:14px">بنود الأمر</label>
        <table class="prc-table"><thead><tr><th>المادة</th><th>الكمية</th><th>كلفة الوحدة (${curSym()})</th><th></th></tr></thead><tbody>${linesHtml}</tbody></table>
        <button class="prc-mini-btn" onclick="prcAddLine()" style="margin-top:8px">➕ بند</button>
        <div style="margin-top:10px;font-weight:700">الإجمالي التقديري: ${fmt(total)} ${curSym()}</div>
      </div>
      <div class="prc-form-actions"><button class="btn-primary" onclick="prcSavePO()">حفظ كمسودة</button><button class="prc-mini-btn" onclick="prcCancelForm()">إلغاء</button></div></div>`;
  }

  function renderList() {
    const el = document.getElementById('prcListBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    let list = POs();
    if (statusFilter) list = list.filter(p => p.status === statusFilter);
    if (search) { const q = search.toLowerCase(); list = list.filter(p => `${p.id} ${p.supplierName} ${poItems(p).map(i => i.materialName).join(' ')}`.toLowerCase().includes(q)); }
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    el.innerHTML = `
      <div class="prc-toolbar">
        <button class="btn-primary" onclick="prcNewPO()">➕ أمر شراء جديد</button>
        <button class="prc-mini-btn" onclick="prcLoadDemo()">بيانات تجريبية</button>
        <select class="prc-mini-select" onchange="prcFilter(this.value)"><option value="">كل الحالات</option>${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${statusFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="prc-input" placeholder="بحث..." value="${esc(search)}" oninput="prcSearch(this.value)" style="max-width:200px">
      </div>
      <table class="prc-table"><thead><tr><th>الأمر</th><th>المورد</th><th>البنود</th><th>الكمية (مستلم/مطلوب)</th><th>القيمة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(po => {
        const items = poItems(po), ordered = poOrderedQty(po), received = poReceivedQty(po);
        const pct = ordered > 0 ? Math.min(100, Math.round(received / ordered * 100)) : 0;
        const acts = [];
        if (po.status === 'draft') { acts.push(`<button class="prc-mini-btn" onclick="prcEditPO('${po.id}')">تعديل</button>`); acts.push(`<button class="prc-mini-btn prc-ok" onclick="prcConfirm('${po.id}')">تأكيد</button>`); }
        if (['ordered', 'partial', 'approved'].includes(po.status)) acts.push(`<button class="prc-mini-btn prc-ok" onclick="prcReceive('${po.id}')">استلام</button>`);
        if (po.status !== 'received' && po.status !== 'cancelled' && received === 0) acts.push(`<button class="prc-mini-btn prc-danger" onclick="prcCancel('${po.id}')">إلغاء</button>`);
        return `<tr>
          <td><strong>${esc(po.id.slice(-8))}</strong><br><span class="prc-muted">${esc(String(po.createdAt || '').slice(0, 10))}</span></td>
          <td>${esc(po.supplierName || '—')}</td>
          <td class="prc-muted">${esc(items.map(i => i.materialName).slice(0, 2).join('، '))}${items.length > 2 ? ` +${items.length - 2}` : ''}</td>
          <td>${received} / ${ordered}<div class="prc-bar"><div class="prc-bar-fill" style="width:${pct}%"></div></div></td>
          <td><strong>${fmt(poValue(po))}</strong> ${curSym()}</td>
          <td><span class="prc-badge ${STATUS_CLASS[po.status] || ''}">${STATUS_LABEL[po.status] || po.status}</span></td>
          <td class="prc-actions">${acts.join('') || '<span class="prc-muted">—</span>'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" class="prc-empty">لا توجد أوامر شراء — أنشئ أمراً جديداً</td></tr>'}</tbody></table>`;
  }

  function renderSuppliers() {
    const el = document.getElementById('prcSupBody'); if (!el) return;
    if (supEditing) {
      const s = supEditing !== 'new' ? Suppliers().find(x => x.id === supEditing) : null; const v = s || {};
      el.innerHTML = `<div class="prc-panel"><div class="prc-panel-head"><h3>${s ? 'تعديل مورد' : 'مورد جديد'}</h3></div>
        <div class="prc-form-grid">
          <div><label>الاسم *</label><input id="prcSupName" class="prc-input" value="${esc(v.name || '')}"></div>
          <div><label>الهاتف</label><input id="prcSupPhone" class="prc-input" value="${esc(v.phone || '')}"></div>
          <div><label>جهة الاتصال</label><input id="prcSupContact" class="prc-input" value="${esc(v.contact || '')}"></div>
          <div class="prc-form-full"><label>ملاحظات</label><input id="prcSupNotes" class="prc-input" value="${esc(v.notes || '')}"></div>
        </div>
        <div class="prc-form-actions"><button class="btn-primary" onclick="prcSaveSupplier()">حفظ</button><button class="prc-mini-btn" onclick="prcCancelSupplier()">إلغاء</button></div></div>`;
      return;
    }
    const sups = Suppliers().slice().sort((a, b) => (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0));
    el.innerHTML = `
      <div class="prc-toolbar"><button class="btn-primary" onclick="prcNewSupplier()">➕ مورد جديد</button></div>
      <table class="prc-table"><thead><tr><th>المورد</th><th>الهاتف</th><th>جهة الاتصال</th><th>الاستلامات</th><th>إجمالي المشتريات</th><th>إجراءات</th></tr></thead>
      <tbody>${sups.map(s => `<tr>
        <td><strong>${esc(s.name)}</strong></td><td class="prc-muted">${esc(s.phone || '—')}</td><td class="prc-muted">${esc(s.contact || '—')}</td>
        <td>${money(s.totalReceipts)}</td><td><strong>${fmt(s.totalAmount)}</strong> ${curSym()}</td>
        <td class="prc-actions"><button class="prc-mini-btn" onclick="prcEditSupplier('${s.id}')">تعديل</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="prc-empty">لا يوجد موردون</td></tr>'}</tbody></table>`;
  }

  function renderTabContent() {
    const map = { prcDashBody: 'dashboard', prcListBody: 'orders', prcSupBody: 'suppliers' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else if (activeTab === 'suppliers') renderSuppliers(); else renderList();
  }
  function render() {
    const body = document.getElementById('procurementBody'); if (!body) return;
    const tabs = [['dashboard', '📊 اللوحة'], ['orders', '📦 أوامر الشراء'], ['suppliers', '🏭 الموردون']];
    body.innerHTML = `<div class="prc-tabs">${tabs.map(([k, l]) => `<button class="prc-tab-btn ${activeTab === k ? 'active' : ''}" onclick="prcOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="prcDashBody"></div><div id="prcListBody"></div><div id="prcSupBody"></div>`;
    renderTabContent();
  }
  window.renderProcurement = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'procurement') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageProcurement'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navProcurement'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('procurement');
      } catch (_) {}
      setTimeout(render, 0);
    }
  };

  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_purchase_today'] = function () {
          const p = portfolio();
          return { openOrders: p.open, draftOrders: p.draft, awaitingReceipt: p.awaiting, openOrderValue: p.openValue, purchasedThisMonth: p.monthValue, supplierCount: p.supplierCount, topSupplier: p.topSuppliers[0] ? { name: p.topSuppliers[0].name, total: Number(p.topSuppliers[0].totalAmount) || 0 } : null };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['procurement'] = '#pageProcurement';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  // Integration entry point: create a draft PO from another module (e.g. an approved
  // purchase request in Approvals). Returns the created PO. Add-only, reuses the engine.
  function createDraftPO(opts) {
    const o = O(); if (!o) return null;
    opts = opts || {};
    const lines = Array.isArray(opts.items) && opts.items.length ? opts.items : [{ materialName: opts.title || 'بند شراء', qty: money(opts.qty) || 1, unitCost: money(opts.unitCost) || 0 }];
    const items = lines.map(l => ({ materialId: l.materialId || '', materialName: l.materialName || 'بند', qty: money(l.qty) || 1, receivedQty: 0, unit: l.unit || '', unitCost: money(l.unitCost) || 0 }));
    let sup = null;
    if (opts.supplierName && typeof window.upsertSupplierByName === 'function') { try { sup = window.upsertSupplierByName(opts.supplierName); } catch (_) {} }
    if (sup) tenantStamp(sup);
    const po = {
      id: uid('po'), requestId: opts.sourceRef || '', sourcePage: opts.sourcePage || 'procurement', status: 'draft',
      supplierName: opts.supplierName || '', supplierId: sup ? sup.id : '',
      materialId: items[0].materialId, materialName: items[0].materialName,
      approvedQty: items.reduce((s, i) => s + i.qty, 0), requestedQty: items.reduce((s, i) => s + i.qty, 0),
      receivedQty: 0, unit: items[0].unit, unitCost: items[0].unitCost,
      notes: opts.notes || '', expectedDate: todayISO(), items, receipts: [], is_active: true,
      createdAt: new Date().toISOString(), createdBy: userName(),
      activityLog: [{ date: new Date().toISOString(), text: opts.originText || 'إنشاء أمر شراء (مسودة)' }]
    };
    o.purchaseOrders = o.purchaseOrders || [];
    tenantStamp(po);
    o.purchaseOrders.unshift(po);
    audit('po_create', `أمر شراء جديد ${po.id}${opts.originText ? ' — ' + opts.originText : ''}`);
    save();
    return po;
  }
  window.OctagonProcurement = { render, portfolio, poValue, createDraftPO };
})();
