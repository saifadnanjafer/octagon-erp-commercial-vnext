/**
 * OCTAGON ERP — Equipment Rental (تأجير المعدات).
 *
 * The Odoo "Rental" app Octagon had ZERO of (`omni.rental` = 0). Rent out
 * equipment/tools to customers: a rentable-items catalog + rental agreements with
 * period, daily rate, deposit, checkout/return, automatic days + late-fee math,
 * and optional explicit billing. DISTINCT from `real-estate` (property rent),
 * `fleet` (own vehicles) and `assets` (own depreciables — though a rentable item
 * MAY reference an asset).
 *
 * Add-only, self-contained in `omni.rentalHub`. Reads `omni.finance.customers`
 * (renter) read-only. Billing is OPTIONAL + explicit: «فاتورة» posts a
 * `customer_charge` (AR/income) via the proven `addFinanceTransaction` bridge
 * (same as field-service/subscriptions), `confirm()`-gated, never automatic.
 *
 * Page: #pageRental (nav data-page="rental").
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
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function coId() { try { return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''; } catch (_) { return ''; } }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('rental', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'rental', action, detail, user: userName() }); } catch (_) {}
  }
  function getCustomers() { const o = O(); let l = (o && o.finance && Array.isArray(o.finance.customers)) ? o.finance.customers : []; if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }

  const STATUS_LABEL = { reserved: 'محجوز', out: 'مُؤجَّر (خارج)', returned: 'مُرجَع', cancelled: 'ملغي' };
  const STATUS_CLASS = { reserved: 'rn-st-reserved', out: 'rn-st-out', returned: 'rn-st-returned', cancelled: 'rn-st-cancelled' };
  const CATS = [['tools', 'عدد وأدوات'], ['machinery', 'مكائن'], ['vehicles', 'مركبات/معدات ثقيلة'], ['electronics', 'إلكترونيات'], ['furniture', 'أثاث/تجهيزات'], ['other', 'أخرى']];
  const CAT_LABEL = Object.fromEntries(CATS);

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.rentalHub || typeof o.rentalHub !== 'object') o.rentalHub = {};
    if (!Array.isArray(o.rentalHub.items)) o.rentalHub.items = [];
    if (!Array.isArray(o.rentalHub.agreements)) o.rentalHub.agreements = [];
    return o.rentalHub;
  }
  function R() { return ensureData(); }
  function items(all) { return (R()?.items || []).filter(i => all || i.is_active !== false); }
  function agreements(all) { let l = (R()?.agreements || []).filter(a => all || a.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function itemById(id) { return (R()?.items || []).find(i => i.id === id) || null; }
  function agById(id) { return (R()?.agreements || []).find(a => a.id === id) || null; }

  function daysBetween(a, b) { if (!a || !b) return 0; const d = Math.round((new Date(b) - new Date(a)) / 86400000); return d; }
  function rentalDays(ag) { const end = ag.actualReturn || ag.endDate; const d = daysBetween(ag.startDate, end); return Math.max(1, d); }
  function lateDays(ag) { if (!ag.actualReturn || !ag.endDate) return 0; return Math.max(0, daysBetween(ag.endDate, ag.actualReturn)); }
  function rentalFee(ag) { return rentalDays(ag) * num(ag.dailyRate) + lateDays(ag) * num(ag.lateFeePerDay); }
  function isOverdue(ag) { return ag.status === 'out' && ag.endDate && ag.endDate < todayISO(); }

  function portfolio() {
    const its = items(), ags = agreements();
    const out = ags.filter(a => a.status === 'out');
    const dueToday = out.filter(a => a.endDate === todayISO());
    const overdue = out.filter(isOverdue);
    const monthPrefix = todayISO().slice(0, 7);
    const billedMonth = ags.filter(a => a.financeTxnId && String(a.billedAt || '').slice(0, 7) === monthPrefix).reduce((s, a) => s + num(a.billedAmount), 0);
    const deposits = out.reduce((s, a) => s + num(a.deposit), 0);
    return {
      itemCount: its.length, available: its.filter(i => i.available !== false).length,
      activeRentals: out.length, dueToday: dueToday.length, overdue: overdue.length,
      billedMonth, depositsHeld: deposits, reserved: ags.filter(a => a.status === 'reserved').length,
      overdueList: overdue.slice().sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)))
    };
  }

  let activeTab = 'dashboard', itemEditing = null, agEditing = null, search = '', statusFilter = '';
  window.rnOpenTab = function (t) { activeTab = t; itemEditing = null; agEditing = null; render(); };
  window.rnSearch = function (v) { search = v; renderAgreements(); };
  window.rnStatusFilter = function (v) { statusFilter = v; renderAgreements(); };

  /* ---- items ---- */
  window.rnNewItem = function () { itemEditing = 'new'; activeTab = 'items'; render(); };
  window.rnEditItem = function (id) { itemEditing = id; activeTab = 'items'; render(); };
  window.rnCancelItem = function () { itemEditing = null; render(); };
  window.rnSaveItem = function () {
    const r = R(); if (!r) return;
    const name = val('rniName'); if (!name) { toast('اسم المعدة مطلوب', 'error'); return; }
    const base = { name, category: val('rniCategory') || 'tools', dailyRate: numVal('rniRate'), deposit: numVal('rniDeposit'), condition: val('rniCondition'), notes: val('rniNotes') };
    const ex = itemEditing && itemEditing !== 'new' ? itemById(itemEditing) : null;
    if (ex) { Object.assign(ex, base); audit('item_update', `تعديل معدة: ${name}`); toast('تم التحديث', 'success'); }
    else { r.items.unshift({ id: uid('rit'), ...base, available: true, is_active: true, createdAt: new Date().toISOString() }); audit('item_create', `معدة تأجير جديدة: ${name}`); toast('تمت إضافة المعدة', 'success'); }
    save(); itemEditing = null; render();
  };
  window.rnArchiveItem = function (id) { const i = itemById(id); if (!i) return; if (!i.available) { toast('المعدة مؤجَّرة حالياً', 'warning'); return; } if (!confirm(`أرشفة "${i.name}"؟`)) return; i.is_active = false; audit('item_archive', `أرشفة ${i.name}`); save(); render(); };

  /* ---- agreements ---- */
  window.rnNewAg = function () { if (!items().some(i => i.available !== false)) { toast('لا توجد معدات متاحة — أضف معدة أولاً', 'warning'); return; } agEditing = 'new'; activeTab = 'agreements'; render(); };
  window.rnEditAg = function (id) { const a = agById(id); if (!a) return; if (a.status !== 'reserved') { toast('لا يمكن تعديل عقد بعد التسليم', 'warning'); return; } agEditing = id; activeTab = 'agreements'; render(); };
  window.rnCancelAgForm = function () { agEditing = null; render(); };
  window.rnSaveAg = function () {
    const r = R(); if (!r) return;
    const itemId = val('rnaItem'); const it = itemById(itemId);
    if (!it) { toast('اختر المعدة', 'error'); return; }
    const cust = getCustomers().find(c => c.id === val('rnaCustomer'));
    const start = val('rnaStart') || todayISO(); const end = val('rnaEnd');
    if (!end) { toast('تاريخ الإرجاع المتوقع مطلوب', 'error'); return; }
    if (end < start) { toast('تاريخ الإرجاع قبل البدء', 'error'); return; }
    const base = {
      itemId, itemName: it.name, customerId: val('rnaCustomer'), customerName: cust ? cust.name : (val('rnaCustomerName') || ''),
      startDate: start, endDate: end, dailyRate: numVal('rnaRate') || num(it.dailyRate), deposit: numVal('rnaDeposit') || num(it.deposit),
      lateFeePerDay: numVal('rnaLateFee'), notes: val('rnaNotes')
    };
    const ex = agEditing && agEditing !== 'new' ? agById(agEditing) : null;
    if (ex) { Object.assign(ex, base); audit('agreement_update', `تعديل عقد: ${it.name}`); toast('تم التحديث', 'success'); }
    else { r.agreements.unshift({ id: uid('rag'), ref: 'RN-' + todayISO().replace(/-/g, '').slice(2) + '-' + String(r.agreements.length + 1).padStart(3, '0'), ...base, status: 'reserved', actualReturn: '', financeTxnId: '', billedAmount: 0, billedAt: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: userName() }); audit('agreement_create', `عقد تأجير جديد: ${it.name}`); toast('تم إنشاء عقد الإيجار (محجوز)', 'success'); }
    save(); agEditing = null; render();
  };
  window.rnCheckout = function (id) {
    const a = agById(id); if (!a || a.status !== 'reserved') return;
    const it = itemById(a.itemId);
    if (it && it.available === false) { toast('المعدة غير متاحة حالياً', 'warning'); return; }
    a.status = 'out'; a.checkoutAt = new Date().toISOString();
    if (it) it.available = false;
    audit('agreement_checkout', `تسليم ${a.itemName} → ${a.customerName || ''}`); save(); toast('تم تسليم المعدة', 'success'); render();
  };
  window.rnReturn = function (id) {
    const a = agById(id); if (!a || a.status !== 'out') return;
    const ret = prompt('تاريخ الإرجاع الفعلي (YYYY-MM-DD):', todayISO()); if (ret === null) return;
    a.actualReturn = (ret || todayISO()).trim(); a.status = 'returned'; a.returnedAt = new Date().toISOString();
    const it = itemById(a.itemId); if (it) it.available = true;
    const days = rentalDays(a), late = lateDays(a), fee = rentalFee(a);
    audit('agreement_return', `إرجاع ${a.itemName} — ${days} يوم${late ? ' (+' + late + ' تأخير)' : ''} = ${fmt(fee)} ${curSym()}`);
    save(); toast(`تم الإرجاع — ${days} يوم، الأجرة ${fmt(fee)} ${curSym()}${late ? ' (شامل تأخير)' : ''}`, 'success'); render();
  };
  window.rnCancelAg = function (id) {
    const a = agById(id); if (!a) return;
    if (a.status === 'returned') { toast('لا يمكن إلغاء عقد مُرجَع', 'warning'); return; }
    if (!confirm(`إلغاء عقد إيجار ${a.itemName}؟`)) return;
    a.status = 'cancelled'; const it = itemById(a.itemId); if (it) it.available = true;
    audit('agreement_cancel', `إلغاء عقد ${a.ref || a.itemName}`); save(); toast('تم الإلغاء', 'info'); render();
  };
  window.rnArchiveAg = function (id) { const a = agById(id); if (!a) return; a.is_active = false; audit('agreement_archive', `أرشفة ${a.ref || a.itemName}`); save(); render(); };

  // OPTIONAL explicit billing — posts the rental fee as a customer charge.
  window.rnInvoice = function (id) {
    const a = agById(id); if (!a) return;
    if (a.status !== 'returned') { toast('الفوترة بعد الإرجاع', 'warning'); return; }
    if (a.financeTxnId) { toast('تمت فوترته مسبقاً', 'info'); return; }
    const fee = rentalFee(a);
    if (fee <= 0) { toast('قيمة الإيجار صفر', 'warning'); return; }
    if (!confirm(`إصدار فاتورة إيجار بمبلغ ${fmt(fee)} ${curSym()} (${rentalDays(a)} يوم) للعميل ${a.customerName || '—'}؟`)) return;
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        const txn = window.addFinanceTransaction({
          type: 'customer_charge', direction: 'neutral', sourceType: 'rental', sourceId: a.id,
          date: todayISO(), amount: fee, customerId: a.customerId, partyName: a.customerName,
          description: `إيجار ${a.itemName} (${a.startDate} → ${a.actualReturn}) — ${rentalDays(a)} يوم`
        });
        if (txn && txn.id) { a.financeTxnId = txn.id; a.billedAmount = fee; a.billedAt = new Date().toISOString(); }
      } catch (e) { console.warn('rental charge post failed', e); }
    }
    audit('agreement_invoice', `فوترة إيجار ${fmt(fee)} ${curSym()} — ${a.customerName}`);
    save(); toast('تم إصدار الفاتورة (ذمم العميل)', 'success'); render();
  };
  window.rnMarkPaid = function (id) {
    const a = agById(id); if (!a || !a.financeTxnId || a.paid) { if (a && a.paid) toast('مدفوعة مسبقاً', 'info'); else toast('أصدر الفاتورة أولاً', 'warning'); return; }
    if (typeof window.addFinanceTransaction === 'function' && num(a.billedAmount) > 0) {
      try { window.addFinanceTransaction({ type: 'income', direction: 'in', sourceType: 'rental_payment', sourceId: a.id, date: todayISO(), amount: num(a.billedAmount), customerId: a.customerId, partyName: a.customerName, description: `تسديد إيجار ${a.itemName} — ${a.customerName}` }); } catch (e) { console.warn('rental payment post failed', e); }
    }
    a.paid = true; a.paidAt = new Date().toISOString();
    audit('agreement_payment', `تسديد إيجار ${fmt(a.billedAmount)} ${curSym()} — ${a.customerName}`);
    save(); toast('تم تسجيل التسديد', 'success'); render();
  };

  window.rnLoadDemo = function () {
    const r = R(); if (!r) return;
    if (r.items.length || r.agreements.length) { toast('توجد بيانات مسبقاً', 'info'); return; }
    const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const i1 = { id: uid('rit'), name: 'مولّدة كهرباء 5KW', category: 'machinery', dailyRate: 25000, deposit: 200000, condition: 'ممتازة', notes: '', available: false, is_active: true, createdAt: new Date().toISOString() };
    const i2 = { id: uid('rit'), name: 'سقالة معدنية', category: 'tools', dailyRate: 8000, deposit: 50000, condition: 'جيدة', notes: '', available: true, is_active: true, createdAt: new Date().toISOString() };
    const i3 = { id: uid('rit'), name: 'كمبروسر هواء', category: 'machinery', dailyRate: 15000, deposit: 100000, condition: 'جيدة', notes: '', available: true, is_active: true, createdAt: new Date().toISOString() };
    r.items.unshift(i1, i2, i3);
    r.agreements.unshift(
      { id: uid('rag'), ref: 'RN-DEMO-1', itemId: i1.id, itemName: i1.name, customerName: 'عميل تجريبي', startDate: back(5), endDate: back(-2), dailyRate: 25000, deposit: 200000, lateFeePerDay: 5000, status: 'out', actualReturn: '', financeTxnId: '', billedAmount: 0, is_active: true, createdAt: new Date().toISOString() },
      { id: uid('rag'), ref: 'RN-DEMO-2', itemId: i2.id, itemName: i2.name, customerName: 'مقاول', startDate: back(12), endDate: back(8), actualReturn: back(7), dailyRate: 8000, deposit: 50000, lateFeePerDay: 2000, status: 'returned', financeTxnId: '', billedAmount: 0, is_active: true, createdAt: new Date().toISOString() }
    );
    audit('rental_demo', 'تحميل بيانات تأجير تجريبية'); save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  /* ---- render ---- */
  function kpi(label, value, sub, cls) { return `<div class="rn-kpi ${cls || ''}"><div class="rn-kpi-val">${value}</div><div class="rn-kpi-label">${label}</div>${sub ? `<div class="rn-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('rnDashBody'); if (!el) return;
    const p = portfolio();
    el.innerHTML = `
      <div class="rn-kpi-grid">
        ${kpi('معدات متاحة', p.available, `${p.itemCount} إجمالاً`, 'rn-kpi-accent')}
        ${kpi('عقود مؤجَّرة', p.activeRentals, p.reserved ? `${p.reserved} محجوزة` : '', '')}
        ${kpi('مستحقة الإرجاع', p.dueToday, p.overdue ? `${p.overdue} متأخرة` : '', p.overdue ? 'rn-kpi-neg' : '')}
        ${kpi('تأمينات محتجزة', fmt(p.depositsHeld) + ' ' + curSym(), '', '')}
        ${kpi('إيراد إيجار الشهر', fmt(p.billedMonth) + ' ' + curSym(), 'مفوتر', 'rn-kpi-pos')}
      </div>
      <div class="rn-panel"><div class="rn-panel-head"><h3>⚠️ متأخرات الإرجاع</h3><button class="rn-mini-btn" onclick="rnOpenTab('agreements')">كل العقود</button></div>
        <table class="rn-table"><thead><tr><th>المرجع</th><th>المعدة</th><th>العميل</th><th>الإرجاع المتوقع</th><th>أيام التأخير</th></tr></thead>
        <tbody>${p.overdueList.map(a => `<tr><td class="rn-muted">${esc(a.ref || '—')}</td><td><strong>${esc(a.itemName)}</strong></td><td>${esc(a.customerName || '—')}</td><td class="rn-neg">${esc(a.endDate)}</td><td class="rn-neg"><strong>${Math.max(0, daysBetween(a.endDate, todayISO()))}</strong> يوم</td></tr>`).join('') || '<tr><td colspan="5" class="rn-empty">لا متأخرات — كل العقود ضمن الموعد</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderItemForm() {
    const i = itemEditing !== 'new' ? itemById(itemEditing) : null; const v = i || {};
    const catOpt = CATS.map(([k, l]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="rn-panel"><div class="rn-panel-head"><h3>${i ? 'تعديل معدة' : 'معدة تأجير جديدة'}</h3></div>
      <div class="rn-form-grid">
        <div class="rn-form-full"><label>اسم المعدة *</label><input id="rniName" class="rn-input" value="${esc(v.name || '')}"></div>
        <div><label>الفئة</label><select id="rniCategory" class="rn-input">${catOpt}</select></div>
        <div><label>الأجرة اليومية (${curSym()})</label><input id="rniRate" type="number" class="rn-input" value="${num(v.dailyRate) || ''}"></div>
        <div><label>مبلغ التأمين (${curSym()})</label><input id="rniDeposit" type="number" class="rn-input" value="${num(v.deposit) || ''}"></div>
        <div><label>الحالة الفنية</label><input id="rniCondition" class="rn-input" value="${esc(v.condition || '')}"></div>
        <div class="rn-form-full"><label>ملاحظات</label><input id="rniNotes" class="rn-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div class="rn-form-actions"><button class="btn-primary" onclick="rnSaveItem()">حفظ</button><button class="rn-mini-btn" onclick="rnCancelItem()">إلغاء</button></div></div>`;
  }
  function renderItems() {
    const el = document.getElementById('rnItemsBody'); if (!el) return;
    if (itemEditing) { el.innerHTML = renderItemForm(); return; }
    const list = items();
    el.innerHTML = `
      <div class="rn-toolbar"><button class="btn-primary" onclick="rnNewItem()">➕ معدة جديدة</button><button class="rn-mini-btn" onclick="rnLoadDemo()">بيانات تجريبية</button></div>
      <table class="rn-table"><thead><tr><th>المعدة</th><th>الفئة</th><th>الأجرة/يوم</th><th>التأمين</th><th>الحالة الفنية</th><th>التوفر</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(i => `<tr>
        <td><strong>${esc(i.name)}</strong></td><td>${CAT_LABEL[i.category] || i.category}</td>
        <td>${fmt(i.dailyRate)} ${curSym()}</td><td>${fmt(i.deposit)} ${curSym()}</td><td class="rn-muted">${esc(i.condition || '—')}</td>
        <td>${i.available !== false ? '<span class="rn-badge rn-st-returned">متاحة</span>' : '<span class="rn-badge rn-st-out">مؤجَّرة</span>'}</td>
        <td class="rn-actions"><button class="rn-mini-btn" onclick="rnEditItem('${i.id}')">تعديل</button><button class="rn-mini-btn rn-danger" onclick="rnArchiveItem('${i.id}')">أرشفة</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="rn-empty">لا توجد معدات — أضف معدة للتأجير</td></tr>'}</tbody></table>`;
  }

  function renderAgForm() {
    const a = agEditing !== 'new' ? agById(agEditing) : null; const v = a || {};
    const itOpt = items().filter(i => i.available !== false || i.id === v.itemId).map(i => `<option value="${i.id}" ${v.itemId === i.id ? 'selected' : ''} data-rate="${num(i.dailyRate)}" data-dep="${num(i.deposit)}">${esc(i.name)} — ${fmt(i.dailyRate)}/يوم</option>`).join('');
    const custOpt = '<option value="">— بدون عميل —</option>' + getCustomers().map(c => `<option value="${c.id}" ${v.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    return `<div class="rn-panel"><div class="rn-panel-head"><h3>${a ? 'تعديل عقد إيجار' : 'عقد إيجار جديد'}</h3></div>
      <div class="rn-form-grid">
        <div><label>المعدة *</label><select id="rnaItem" class="rn-input" onchange="(function(s){var o=s.options[s.selectedIndex];var r=document.getElementById('rnaRate');var d=document.getElementById('rnaDeposit');if(r&&!r.value)r.value=o.getAttribute('data-rate')||'';if(d&&!d.value)d.value=o.getAttribute('data-dep')||'';})(this)">${itOpt}</select></div>
        <div><label>العميل</label><select id="rnaCustomer" class="rn-input">${custOpt}</select></div>
        <div><label>تاريخ البدء</label><input id="rnaStart" type="date" class="rn-input" value="${esc(v.startDate || todayISO())}"></div>
        <div><label>الإرجاع المتوقع *</label><input id="rnaEnd" type="date" class="rn-input" value="${esc(v.endDate || '')}"></div>
        <div><label>الأجرة اليومية (${curSym()})</label><input id="rnaRate" type="number" class="rn-input" value="${num(v.dailyRate) || ''}"></div>
        <div><label>التأمين (${curSym()})</label><input id="rnaDeposit" type="number" class="rn-input" value="${num(v.deposit) || ''}"></div>
        <div><label>غرامة التأخير/يوم (${curSym()})</label><input id="rnaLateFee" type="number" class="rn-input" value="${num(v.lateFeePerDay) || ''}"></div>
        <div class="rn-form-full"><label>ملاحظات</label><input id="rnaNotes" class="rn-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div class="rn-form-actions"><button class="btn-primary" onclick="rnSaveAg()">حفظ</button><button class="rn-mini-btn" onclick="rnCancelAgForm()">إلغاء</button></div></div>`;
  }
  function renderAgreements() {
    const el = document.getElementById('rnAgBody'); if (!el) return;
    if (agEditing) { el.innerHTML = renderAgForm(); return; }
    let list = agreements();
    if (statusFilter) list = list.filter(a => a.status === statusFilter);
    if (search) { const q = search.toLowerCase(); list = list.filter(a => `${a.ref} ${a.itemName} ${a.customerName}`.toLowerCase().includes(q)); }
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    el.innerHTML = `
      <div class="rn-toolbar">
        <button class="btn-primary" onclick="rnNewAg()">➕ عقد إيجار</button>
        <select class="rn-mini-select" onchange="rnStatusFilter(this.value)"><option value="">كل الحالات</option>${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${statusFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="rn-input" placeholder="بحث..." value="${esc(search)}" oninput="rnSearch(this.value)" style="max-width:180px">
      </div>
      <table class="rn-table"><thead><tr><th>المرجع</th><th>المعدة</th><th>العميل</th><th>الفترة</th><th>الأجرة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(a => {
        const late = isOverdue(a), days = rentalDays(a), fee = rentalFee(a);
        const acts = [];
        if (a.status === 'reserved') { acts.push(`<button class="rn-mini-btn" onclick="rnEditAg('${a.id}')">تعديل</button>`); acts.push(`<button class="rn-mini-btn rn-ok" onclick="rnCheckout('${a.id}')">تسليم</button>`); }
        if (a.status === 'out') acts.push(`<button class="rn-mini-btn rn-ok" onclick="rnReturn('${a.id}')">إرجاع</button>`);
        if (a.status === 'returned' && !a.financeTxnId && fee > 0) acts.push(`<button class="rn-mini-btn rn-ok" onclick="rnInvoice('${a.id}')">فاتورة</button>`);
        if (a.financeTxnId && !a.paid) acts.push(`<button class="rn-mini-btn rn-ok" onclick="rnMarkPaid('${a.id}')">تسديد</button>`);
        if (a.status !== 'returned' && a.status !== 'cancelled') acts.push(`<button class="rn-mini-btn rn-danger" onclick="rnCancelAg('${a.id}')">إلغاء</button>`);
        if (a.status === 'returned' || a.status === 'cancelled') acts.push(`<button class="rn-mini-btn rn-danger" onclick="rnArchiveAg('${a.id}')">أرشفة</button>`);
        return `<tr>
          <td class="rn-muted">${esc(a.ref || '—')}</td><td><strong>${esc(a.itemName)}</strong></td><td>${esc(a.customerName || '—')}</td>
          <td class="rn-muted">${esc(a.startDate || '')} → ${esc(a.actualReturn || a.endDate || '')}${late ? ' <span class="rn-neg">⚠️ متأخر</span>' : ''}</td>
          <td>${fmt(fee)} ${curSym()}<br><span class="rn-muted">${days} يوم${lateDays(a) ? ' +' + lateDays(a) + ' تأخير' : ''}</span>${a.financeTxnId ? (a.paid ? '<br><span class="rn-paid">مدفوعة</span>' : '<br><span class="rn-muted">مفوترة</span>') : ''}</td>
          <td><span class="rn-badge ${STATUS_CLASS[a.status] || ''}">${STATUS_LABEL[a.status] || a.status}</span></td>
          <td class="rn-actions">${acts.join('')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" class="rn-empty">لا توجد عقود إيجار</td></tr>'}</tbody></table>`;
  }

  function renderTabContent() {
    const map = { rnDashBody: 'dashboard', rnItemsBody: 'items', rnAgBody: 'agreements' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else if (activeTab === 'items') renderItems(); else renderAgreements();
  }
  function render() {
    const body = document.getElementById('rentalBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['agreements', '📄 عقود الإيجار'], ['items', '🧰 المعدات']];
    body.innerHTML = `<div class="rn-tabs">${tabs.map(([k, l]) => `<button class="rn-tab-btn ${activeTab === k ? 'active' : ''}" onclick="rnOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="rnDashBody"></div><div id="rnAgBody"></div><div id="rnItemsBody"></div>`;
    renderTabContent();
  }
  window.renderRental = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'rental') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageRental'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navRental'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('rental');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };

  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_rental_today'] = function () {
          const p = portfolio();
          return { rentableItems: p.itemCount, availableItems: p.available, activeRentals: p.activeRentals, dueToday: p.dueToday, overdue: p.overdue, depositsHeld: p.depositsHeld, rentalRevenueThisMonth: p.billedMonth };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['rental'] = '#pageRental';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonRental = { render, ensureData, portfolio, rentalFee, rentalDays };
})();
