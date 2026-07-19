/**
 * OCTAGON ERP — Warranty & Returns / RMA (الضمان والمرتجعات).
 *
 * A standard post-sale pillar Octagon had ZERO of (`warranty registry`/`rma` = 0).
 * Two linked registers: product **warranties** (serial, purchase date, coverage
 * months → auto expiry) and **RMA claims** (return/repair/replace/refund requests
 * with a status workflow). Universal across retail/workshop/clinic/electronics.
 *
 * Add-only, self-contained in `omni.warrantyHub`. Reads `omni.finance.customers`
 * read-only. Tracking-only — no finance/stock writes (a refund/replacement is
 * recorded as a resolution note; the actual money/stock move stays an explicit
 * action on its own page). Pairs with `helpdesk` (a claim may spawn a ticket).
 *
 * Page: #pageWarranty (nav data-page="warranty").
 */
(function () {
  'use strict';

  function O() { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} } return null; }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('warranty', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'warranty', action, detail, user: userName() }); } catch (_) {}
  }
  function getCustomers() { const o = O(); let l = (o && o.finance && Array.isArray(o.finance.customers)) ? o.finance.customers : []; if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function addMonths(iso, m) { if (!iso) return ''; const d = new Date(iso); d.setMonth(d.getMonth() + (Number(m) || 0)); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { if (!a || !b) return 0; return Math.round((new Date(b) - new Date(a)) / 86400000); }

  const CLAIM_STATUS = { received: 'مُستلَمة', assessing: 'قيد الفحص', approved: 'مقبولة', rejected: 'مرفوضة', resolved: 'مُنجَزة' };
  const CLAIM_CLASS = { received: 'wr-st-received', assessing: 'wr-st-assessing', approved: 'wr-st-approved', rejected: 'wr-st-rejected', resolved: 'wr-st-resolved' };
  const CLAIM_TYPE = { repair: 'إصلاح', replace: 'استبدال', refund: 'استرجاع مبلغ', inspect: 'فحص فقط' };

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.warrantyHub || typeof o.warrantyHub !== 'object') o.warrantyHub = {};
    if (!Array.isArray(o.warrantyHub.warranties)) o.warrantyHub.warranties = [];
    if (!Array.isArray(o.warrantyHub.claims)) o.warrantyHub.claims = [];
    return o.warrantyHub;
  }
  function W() { return ensureData(); }
  function warranties(all) { let l = (W()?.warranties || []).filter(w => all || w.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function claims(all) { let l = (W()?.claims || []).filter(c => all || c.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function warrantyById(id) { return (W()?.warranties || []).find(w => w.id === id) || null; }
  function claimById(id) { return (W()?.claims || []).find(c => c.id === id) || null; }
  function expiryOf(w) { return w.expiryDate || addMonths(w.purchaseDate, w.coverageMonths); }
  function warrantyState(w) { const exp = expiryOf(w); if (!exp) return 'unknown'; const d = daysBetween(todayISO(), exp); if (d < 0) return 'expired'; if (d <= 30) return 'expiring'; return 'active'; }

  function portfolio() {
    const ws = warranties(), cs = claims();
    const active = ws.filter(w => warrantyState(w) === 'active');
    const expiring = ws.filter(w => warrantyState(w) === 'expiring');
    const expired = ws.filter(w => warrantyState(w) === 'expired');
    const openClaims = cs.filter(c => !['resolved', 'rejected'].includes(c.status));
    const monthPrefix = todayISO().slice(0, 7);
    const claimsMonth = cs.filter(c => String(c.createdAt || '').slice(0, 7) === monthPrefix);
    return {
      warrantyCount: ws.length, active: active.length, expiring: expiring.length, expired: expired.length,
      openClaims: openClaims.length, totalClaims: cs.length, claimsMonth: claimsMonth.length,
      expiringList: expiring.concat(expired).sort((a, b) => String(expiryOf(a)).localeCompare(String(expiryOf(b)))).slice(0, 8)
    };
  }

  let activeTab = 'dashboard', wEditing = null, cEditing = null, wSearch = '', cSearch = '', cStatusFilter = '';
  window.wrOpenTab = function (t) { activeTab = t; wEditing = null; cEditing = null; render(); };
  window.wrWSearch = function (v) { wSearch = v; renderWarranties(); };
  window.wrCSearch = function (v) { cSearch = v; renderClaims(); };
  window.wrCFilter = function (v) { cStatusFilter = v; renderClaims(); };

  /* ---- warranties ---- */
  window.wrNewWarranty = function () { wEditing = 'new'; activeTab = 'warranties'; render(); };
  window.wrEditWarranty = function (id) { wEditing = id; activeTab = 'warranties'; render(); };
  window.wrCancelWarranty = function () { wEditing = null; render(); };
  window.wrSaveWarranty = function () {
    const w = W(); if (!w) return;
    const product = val('wrProduct'); if (!product) { toast('اسم المنتج مطلوب', 'error'); return; }
    const cust = getCustomers().find(c => c.id === val('wrCustomer'));
    const base = { product, serial: val('wrSerial'), customerId: val('wrCustomer'), customerName: cust ? cust.name : (val('wrCustomerName') || ''), purchaseDate: val('wrPurchase') || todayISO(), coverageMonths: numVal('wrMonths') || 12, notes: val('wrNotes') };
    base.expiryDate = addMonths(base.purchaseDate, base.coverageMonths);
    const ex = wEditing && wEditing !== 'new' ? warrantyById(wEditing) : null;
    if (ex) { Object.assign(ex, base); audit('warranty_update', `تعديل ضمان: ${product}`); toast('تم التحديث', 'success'); }
    else { w.warranties.unshift({ id: uid('wty'), ...base, is_active: true, createdAt: new Date().toISOString(), createdBy: userName() }); audit('warranty_create', `ضمان جديد: ${product}`); toast('تمت إضافة الضمان', 'success'); }
    save(); wEditing = null; render();
  };
  window.wrArchiveWarranty = function (id) { const w = warrantyById(id); if (!w) return; if (!confirm(`أرشفة ضمان "${w.product}"؟`)) return; w.is_active = false; audit('warranty_archive', `أرشفة ${w.product}`); save(); render(); };

  /* ---- claims ---- */
  window.wrNewClaim = function (warrantyId) { cEditing = warrantyId ? { _w: warrantyId } : 'new'; activeTab = 'claims'; render(); };
  window.wrEditClaim = function (id) { cEditing = id; activeTab = 'claims'; render(); };
  window.wrCancelClaim = function () { cEditing = null; render(); };
  window.wrSaveClaim = function () {
    const w = W(); if (!w) return;
    const product = val('wcProduct'); if (!product) { toast('اسم المنتج مطلوب', 'error'); return; }
    const wty = warrantyById(val('wcWarranty'));
    const cust = getCustomers().find(c => c.id === val('wcCustomer'));
    const base = {
      product, warrantyId: val('wcWarranty'), customerId: val('wcCustomer'), customerName: cust ? cust.name : (wty ? wty.customerName : (val('wcCustomerName') || '')),
      type: val('wcType') || 'repair', issue: val('wcIssue'), resolution: val('wcResolution')
    };
    const ex = cEditing && cEditing !== 'new' && !cEditing._w ? claimById(cEditing) : null;
    if (ex) { Object.assign(ex, base); audit('claim_update', `تعديل مطالبة: ${product}`); toast('تم التحديث', 'success'); }
    else { w.claims.unshift({ id: uid('rma'), ref: 'RMA-' + todayISO().replace(/-/g, '').slice(2) + '-' + String(w.claims.length + 1).padStart(3, '0'), ...base, status: 'received', is_active: true, createdAt: new Date().toISOString(), createdBy: userName() }); audit('claim_create', `مطالبة جديدة: ${product}`); toast('تم تسجيل المطالبة', 'success'); }
    save(); cEditing = null; render();
  };
  window.wrSetClaimStatus = function (id, status) { const c = claimById(id); if (!c) return; c.status = status; if (status === 'resolved') c.resolvedAt = new Date().toISOString(); audit('claim_status', `${c.ref || c.product} → ${CLAIM_STATUS[status]}`); save(); render(); };
  window.wrArchiveClaim = function (id) { const c = claimById(id); if (!c) return; c.is_active = false; audit('claim_archive', `أرشفة ${c.ref || c.product}`); save(); render(); };
  // Integration: a claim → spawn a Helpdesk ticket (if that module is present).
  window.wrClaimToTicket = function (id) {
    const c = claimById(id); if (!c) return;
    if (c.ticketId) { toast('تم إنشاء تذكرة مسبقاً', 'info'); switchPage('helpdesk'); return; }
    if (!(window.OctagonHelpdesk && typeof OctagonHelpdesk.createTicketFrom === 'function')) { toast('وحدة خدمة العملاء غير متوفرة', 'warning'); return; }
    const t = OctagonHelpdesk.createTicketFrom({ subject: `مطالبة ضمان: ${c.product}`, customerId: c.customerId, customerName: c.customerName, priority: 'high', description: c.issue || '', category: 'ضمان', sourceRef: c.id, originText: `مطالبة ${c.ref || ''}` });
    if (t) { c.ticketId = t.id; audit('claim_to_ticket', `${c.ref || c.product} → تذكرة`); save(); toast('تم إنشاء تذكرة دعم', 'success'); switchPage('helpdesk'); }
  };

  window.wrLoadDemo = function () {
    const w = W(); if (!w) return;
    if (w.warranties.length || w.claims.length) { toast('توجد بيانات مسبقاً', 'info'); return; }
    const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const w1 = { id: uid('wty'), product: 'ثلاجة عرض', serial: 'RF-2024-1188', customerName: 'مطعم الزاد', purchaseDate: back(300), coverageMonths: 12, expiryDate: addMonths(back(300), 12), notes: '', is_active: true, createdAt: new Date().toISOString() };
    const w2 = { id: uid('wty'), product: 'مولّدة 5KW', serial: 'GN-5521', customerName: 'عميل تجريبي', purchaseDate: back(20), coverageMonths: 24, expiryDate: addMonths(back(20), 24), notes: '', is_active: true, createdAt: new Date().toISOString() };
    const w3 = { id: uid('wty'), product: 'حاسبة محمولة', serial: 'LT-9090', customerName: 'مكتب هندسي', purchaseDate: back(700), coverageMonths: 12, expiryDate: addMonths(back(700), 12), notes: '', is_active: true, createdAt: new Date().toISOString() };
    w.warranties.unshift(w1, w2, w3);
    w.claims.unshift(
      { id: uid('rma'), ref: 'RMA-DEMO-1', product: 'ثلاجة عرض', warrantyId: w1.id, customerName: 'مطعم الزاد', type: 'repair', issue: 'لا تبرّد جيداً', resolution: '', status: 'assessing', is_active: true, createdAt: new Date().toISOString() },
      { id: uid('rma'), ref: 'RMA-DEMO-2', product: 'مولّدة 5KW', warrantyId: w2.id, customerName: 'عميل تجريبي', type: 'replace', issue: 'عطل في المنظّم', resolution: 'تم الاستبدال', status: 'resolved', resolvedAt: new Date().toISOString(), is_active: true, createdAt: new Date().toISOString() }
    );
    audit('warranty_demo', 'تحميل بيانات ضمان تجريبية'); save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  /* ---- render ---- */
  function kpi(label, value, sub, cls) { return `<div class="wr-kpi ${cls || ''}"><div class="wr-kpi-val">${value}</div><div class="wr-kpi-label">${label}</div>${sub ? `<div class="wr-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('wrDashBody'); if (!el) return;
    const p = portfolio();
    el.innerHTML = `
      <div class="wr-kpi-grid">
        ${kpi('ضمانات سارية', p.active, `${p.warrantyCount} إجمالاً`, 'wr-kpi-accent')}
        ${kpi('تنتهي قريباً', p.expiring, '≤ 30 يوم', p.expiring ? 'wr-kpi-warn' : '')}
        ${kpi('منتهية', p.expired, '', '')}
        ${kpi('مطالبات مفتوحة', p.openClaims, `${p.claimsMonth} هذا الشهر`, p.openClaims ? 'wr-kpi-neg' : '')}
      </div>
      <div class="wr-panel"><div class="wr-panel-head"><h3>⏰ ضمانات تنتهي/منتهية</h3><button class="wr-mini-btn" onclick="wrOpenTab('warranties')">كل الضمانات</button></div>
        <table class="wr-table"><thead><tr><th>المنتج</th><th>العميل</th><th>الرقم التسلسلي</th><th>الانتهاء</th><th>الحالة</th></tr></thead>
        <tbody>${p.expiringList.map(w => { const st = warrantyState(w); return `<tr><td><strong>${esc(w.product)}</strong></td><td>${esc(w.customerName || '—')}</td><td class="wr-muted">${esc(w.serial || '—')}</td><td class="${st === 'expired' ? 'wr-neg' : 'wr-warn-text'}">${esc(expiryOf(w))}</td><td><span class="wr-badge ${st === 'expired' ? 'wr-st-rejected' : 'wr-st-assessing'}">${st === 'expired' ? 'منتهية' : 'تنتهي قريباً'}</span></td></tr>`; }).join('') || '<tr><td colspan="5" class="wr-empty">لا ضمانات قريبة الانتهاء ✅</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderWarrantyForm() {
    const w = wEditing !== 'new' ? warrantyById(wEditing) : null; const v = w || {};
    const custOpt = '<option value="">— بدون عميل —</option>' + getCustomers().map(c => `<option value="${c.id}" ${v.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    return `<div class="wr-panel"><div class="wr-panel-head"><h3>${w ? 'تعديل ضمان' : 'ضمان جديد'}</h3></div>
      <div class="wr-form-grid">
        <div class="wr-form-full"><label>المنتج *</label><input id="wrProduct" class="wr-input" value="${esc(v.product || '')}"></div>
        <div><label>الرقم التسلسلي</label><input id="wrSerial" class="wr-input" value="${esc(v.serial || '')}"></div>
        <div><label>العميل</label><select id="wrCustomer" class="wr-input">${custOpt}</select></div>
        <div><label>تاريخ الشراء</label><input id="wrPurchase" type="date" class="wr-input" value="${esc(v.purchaseDate || todayISO())}"></div>
        <div><label>مدة التغطية (أشهر)</label><input id="wrMonths" type="number" class="wr-input" value="${v.coverageMonths || 12}"></div>
        <div class="wr-form-full"><label>ملاحظات</label><input id="wrNotes" class="wr-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div class="wr-form-actions"><button class="btn-primary" onclick="wrSaveWarranty()">حفظ</button><button class="wr-mini-btn" onclick="wrCancelWarranty()">إلغاء</button></div></div>`;
  }
  function renderWarranties() {
    const el = document.getElementById('wrWtyBody'); if (!el) return;
    if (wEditing) { el.innerHTML = renderWarrantyForm(); return; }
    let list = warranties();
    if (wSearch) { const q = wSearch.toLowerCase(); list = list.filter(w => `${w.product} ${w.serial} ${w.customerName}`.toLowerCase().includes(q)); }
    list.sort((a, b) => String(expiryOf(a)).localeCompare(String(expiryOf(b))));
    el.innerHTML = `
      <div class="wr-toolbar"><button class="btn-primary" onclick="wrNewWarranty()">➕ ضمان جديد</button><button class="wr-mini-btn" onclick="wrLoadDemo()">بيانات تجريبية</button><input class="wr-input" placeholder="بحث..." value="${esc(wSearch)}" oninput="wrWSearch(this.value)" style="max-width:200px"></div>
      <table class="wr-table"><thead><tr><th>المنتج</th><th>العميل</th><th>الرقم التسلسلي</th><th>الشراء</th><th>الانتهاء</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(w => { const st = warrantyState(w); const stLbl = { active: 'سارية', expiring: 'تنتهي قريباً', expired: 'منتهية', unknown: '—' }[st]; const stCls = { active: 'wr-st-approved', expiring: 'wr-st-assessing', expired: 'wr-st-rejected', unknown: '' }[st];
        return `<tr>
          <td><strong>${esc(w.product)}</strong></td><td>${esc(w.customerName || '—')}</td><td class="wr-muted">${esc(w.serial || '—')}</td>
          <td class="wr-muted">${esc(w.purchaseDate || '—')}</td><td class="${st === 'expired' ? 'wr-neg' : st === 'expiring' ? 'wr-warn-text' : ''}">${esc(expiryOf(w))}</td>
          <td><span class="wr-badge ${stCls}">${stLbl}</span></td>
          <td class="wr-actions"><button class="wr-mini-btn" onclick="wrEditWarranty('${w.id}')">تعديل</button><button class="wr-mini-btn wr-ok" onclick="wrNewClaim('${w.id}')">مطالبة</button><button class="wr-mini-btn wr-danger" onclick="wrArchiveWarranty('${w.id}')">أرشفة</button></td>
        </tr>`; }).join('') || '<tr><td colspan="7" class="wr-empty">لا توجد ضمانات مسجّلة</td></tr>'}</tbody></table>`;
  }

  function renderClaimForm() {
    const presetW = cEditing && cEditing._w ? cEditing._w : '';
    const c = (cEditing && cEditing !== 'new' && !cEditing._w) ? claimById(cEditing) : null; const v = c || (presetW ? (function () { const wty = warrantyById(presetW); return wty ? { warrantyId: presetW, product: wty.product, customerId: wty.customerId, customerName: wty.customerName } : { warrantyId: presetW }; })() : {});
    const wOpt = '<option value="">— بدون ربط ضمان —</option>' + warranties().map(w => `<option value="${w.id}" ${v.warrantyId === w.id ? 'selected' : ''}>${esc(w.product)}${w.serial ? ' · ' + esc(w.serial) : ''}</option>`).join('');
    const custOpt = '<option value="">— بدون عميل —</option>' + getCustomers().map(c2 => `<option value="${c2.id}" ${v.customerId === c2.id ? 'selected' : ''}>${esc(c2.name)}</option>`).join('');
    const typeOpt = Object.entries(CLAIM_TYPE).map(([k, l]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="wr-panel"><div class="wr-panel-head"><h3>${c ? 'تعديل مطالبة' : 'مطالبة/مرتجع جديد'}</h3></div>
      <div class="wr-form-grid">
        <div class="wr-form-full"><label>المنتج *</label><input id="wcProduct" class="wr-input" value="${esc(v.product || '')}"></div>
        <div><label>ربط بضمان</label><select id="wcWarranty" class="wr-input">${wOpt}</select></div>
        <div><label>العميل</label><select id="wcCustomer" class="wr-input">${custOpt}</select></div>
        <div><label>نوع المعالجة</label><select id="wcType" class="wr-input">${typeOpt}</select></div>
        <div class="wr-form-full"><label>وصف المشكلة</label><input id="wcIssue" class="wr-input" value="${esc(v.issue || '')}"></div>
        <div class="wr-form-full"><label>المعالجة/الحل</label><input id="wcResolution" class="wr-input" value="${esc(v.resolution || '')}"></div>
      </div>
      <div class="wr-form-actions"><button class="btn-primary" onclick="wrSaveClaim()">حفظ</button><button class="wr-mini-btn" onclick="wrCancelClaim()">إلغاء</button></div></div>`;
  }
  function renderClaims() {
    const el = document.getElementById('wrClaimBody'); if (!el) return;
    if (cEditing) { el.innerHTML = renderClaimForm(); return; }
    let list = claims();
    if (cStatusFilter) list = list.filter(c => c.status === cStatusFilter);
    if (cSearch) { const q = cSearch.toLowerCase(); list = list.filter(c => `${c.ref} ${c.product} ${c.customerName}`.toLowerCase().includes(q)); }
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const hasHelpdesk = !!(window.OctagonHelpdesk && OctagonHelpdesk.createTicketFrom);
    el.innerHTML = `
      <div class="wr-toolbar">
        <button class="btn-primary" onclick="wrNewClaim()">➕ مطالبة جديدة</button>
        <select class="wr-mini-select" onchange="wrCFilter(this.value)"><option value="">كل الحالات</option>${Object.entries(CLAIM_STATUS).map(([k, l]) => `<option value="${k}" ${cStatusFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="wr-input" placeholder="بحث..." value="${esc(cSearch)}" oninput="wrCSearch(this.value)" style="max-width:180px">
      </div>
      <table class="wr-table"><thead><tr><th>المرجع</th><th>المنتج</th><th>العميل</th><th>النوع</th><th>المشكلة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(c => {
        const acts = [`<button class="wr-mini-btn" onclick="wrEditClaim('${c.id}')">تعديل</button>`];
        if (hasHelpdesk) acts.push(c.ticketId ? `<button class="wr-mini-btn" onclick="switchPage('helpdesk')">تذكرة ✓</button>` : `<button class="wr-mini-btn" onclick="wrClaimToTicket('${c.id}')">🎫 تذكرة</button>`);
        acts.push(`<button class="wr-mini-btn wr-danger" onclick="wrArchiveClaim('${c.id}')">أرشفة</button>`);
        return `<tr>
          <td class="wr-muted">${esc(c.ref || '—')}</td><td><strong>${esc(c.product)}</strong></td><td>${esc(c.customerName || '—')}</td>
          <td>${CLAIM_TYPE[c.type] || c.type}</td><td class="wr-muted">${esc(c.issue || '—')}${c.resolution ? `<br>✅ ${esc(c.resolution)}` : ''}</td>
          <td><select class="wr-mini-select" onchange="wrSetClaimStatus('${c.id}',this.value)">${Object.entries(CLAIM_STATUS).map(([k, l]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td class="wr-actions">${acts.join('')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" class="wr-empty">لا توجد مطالبات</td></tr>'}</tbody></table>`;
  }

  function renderTabContent() {
    const map = { wrDashBody: 'dashboard', wrWtyBody: 'warranties', wrClaimBody: 'claims' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else if (activeTab === 'claims') renderClaims(); else renderWarranties();
  }
  function render() {
    const body = document.getElementById('warrantyBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['warranties', '🛡️ الضمانات'], ['claims', '↩️ المطالبات/المرتجعات']];
    body.innerHTML = `<div class="wr-tabs">${tabs.map(([k, l]) => `<button class="wr-tab-btn ${activeTab === k ? 'active' : ''}" onclick="wrOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="wrDashBody"></div><div id="wrWtyBody"></div><div id="wrClaimBody"></div>`;
    renderTabContent();
  }
  window.renderWarranty = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'warranty') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageWarranty'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navWarranty'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('warranty');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };

  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_warranty_today'] = function () {
          const p = portfolio();
          return { activeWarranties: p.active, expiringSoon: p.expiring, expired: p.expired, openClaims: p.openClaims, claimsThisMonth: p.claimsMonth, totalWarranties: p.warrantyCount };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['warranty'] = '#pageWarranty';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonWarranty = { render, ensureData, portfolio, warrantyState };
})();
