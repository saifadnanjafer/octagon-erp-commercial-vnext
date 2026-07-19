/**
 * OCTAGON ERP — Field Service (الخدمة الميدانية).
 *
 * The Odoo "Field Service" flagship app Octagon had ZERO of (`omni.fieldService` = 0).
 * On-site service visits: schedule a technician to a customer location, track the
 * visit through scheduled → en-route → in-progress → done, and optionally bill it.
 * DISTINCT from `work_orders`/`jobOrders` (in-house workshop jobs) — this is
 * customer-site dispatch (location, travel, technician).
 *
 * Add-only, self-contained in `omni.fieldService`. Reads `omni.finance.customers`
 * (customer) + `window.employees` (technician) read-only. Billing is OPTIONAL and
 * explicit: a «فاتورة» button on a *done* visit posts a customer charge (AR/income)
 * through the proven `addFinanceTransaction` bridge (same pattern as subscriptions);
 * «تسديد» posts the settling income. Nothing auto-bills.
 *
 * Page: #pageFieldService (nav data-page="field_service").
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
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('field_service', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'field_service', action, detail, user: userName() }); } catch (_) {}
  }
  function getCustomers() { const o = O(); let l = (o && o.finance && Array.isArray(o.finance.customers)) ? o.finance.customers : []; if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function getEmployees() { return Array.isArray(window.employees) ? window.employees : ((O() && Array.isArray(O().employees)) ? O().employees : []); }

  const STATUS_LABEL = { scheduled: 'مجدولة', en_route: 'في الطريق', in_progress: 'قيد التنفيذ', done: 'منجزة', cancelled: 'ملغاة' };
  const STATUS_CLASS = { scheduled: 'fs-st-scheduled', en_route: 'fs-st-route', in_progress: 'fs-st-progress', done: 'fs-st-done', cancelled: 'fs-st-cancelled' };
  const OPEN_STATUSES = ['scheduled', 'en_route', 'in_progress'];
  const SVC_TYPES = [['install', 'تركيب'], ['repair', 'إصلاح/صيانة'], ['inspection', 'فحص/معاينة'], ['delivery', 'توصيل'], ['callout', 'استدعاء طارئ'], ['other', 'أخرى']];
  const SVC_LABEL = Object.fromEntries(SVC_TYPES);
  const PRIO = { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة' };

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.fieldService || typeof o.fieldService !== 'object') o.fieldService = {};
    if (!Array.isArray(o.fieldService.visits)) o.fieldService.visits = [];
    return o.fieldService;
  }
  function F() { return ensureData(); }
  function visits(all) { let l = (F()?.visits || []).filter(v => all || v.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function visitById(id) { return (F()?.visits || []).find(v => v.id === id) || null; }
  function isOverdue(v) { return OPEN_STATUSES.includes(v.status) && v.scheduledAt && v.scheduledAt.slice(0, 10) < todayISO(); }

  function portfolio() {
    const vs = visits();
    const today = todayISO();
    const scheduledToday = vs.filter(v => OPEN_STATUSES.includes(v.status) && String(v.scheduledAt || '').slice(0, 10) === today);
    const inProgress = vs.filter(v => v.status === 'in_progress');
    const monthPrefix = today.slice(0, 7);
    const doneMonth = vs.filter(v => v.status === 'done' && String(v.completedAt || v.scheduledAt || '').slice(0, 7) === monthPrefix);
    const unassigned = vs.filter(v => OPEN_STATUSES.includes(v.status) && !v.technicianId && !v.technicianName);
    const overdue = vs.filter(isOverdue);
    const billedMonth = doneMonth.reduce((s, v) => s + (v.financeTxnId ? num(v.charge) : 0), 0);
    const todaySchedule = vs.filter(v => OPEN_STATUSES.includes(v.status) && String(v.scheduledAt || '').slice(0, 10) <= today)
      .sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')));
    return {
      total: vs.length, scheduledToday: scheduledToday.length, inProgress: inProgress.length,
      doneMonth: doneMonth.length, unassigned: unassigned.length, overdue: overdue.length,
      billedMonth, open: vs.filter(v => OPEN_STATUSES.includes(v.status)).length, todaySchedule: todaySchedule.slice(0, 10)
    };
  }

  let activeTab = 'dashboard', editing = null, search = '', statusFilter = '';
  window.fsOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.fsSearch = function (v) { search = v; renderList(); };
  window.fsStatusFilter = function (v) { statusFilter = v; renderList(); };
  window.fsNew = function () { editing = 'new'; activeTab = 'visits'; render(); };
  window.fsEdit = function (id) { editing = id; activeTab = 'visits'; render(); };
  window.fsCancelForm = function () { editing = null; render(); };

  window.fsSave = function () {
    const f = F(); if (!f) return;
    const title = val('fsTitle'); if (!title) { toast('عنوان الزيارة مطلوب', 'error'); return; }
    const cust = getCustomers().find(c => c.id === val('fsCustomer'));
    const tech = getEmployees().find(e => String(e.id) === val('fsTech'));
    const base = {
      title, customerId: val('fsCustomer'), customerName: cust ? cust.name : (val('fsCustomerName') || ''),
      location: val('fsLocation'), technicianId: val('fsTech'), technicianName: tech ? tech.name : '',
      serviceType: val('fsType') || 'repair', priority: val('fsPriority') || 'normal',
      scheduledAt: val('fsScheduled'), durationMin: numVal('fsDuration'), charge: numVal('fsCharge'), description: val('fsDesc')
    };
    const ex = editing && editing !== 'new' ? visitById(editing) : null;
    if (ex) { Object.assign(ex, base); audit('visit_update', `تعديل زيارة: ${title}`); toast('تم التحديث', 'success'); }
    else {
      f.visits.unshift({ id: uid('fsv'), ref: 'FS-' + todayISO().replace(/-/g, '').slice(2) + '-' + String(f.visits.length + 1).padStart(3, '0'), ...base, status: 'scheduled', financeTxnId: '', paid: false, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: userName() });
      audit('visit_create', `زيارة ميدانية جديدة: ${title}`); toast('تمت جدولة الزيارة', 'success');
    }
    save(); editing = null; render();
  };
  window.fsSetStatus = function (id, status) { const v = visitById(id); if (!v) return; v.status = status; if (status === 'done') v.completedAt = new Date().toISOString(); audit('visit_status', `${v.ref || v.title} → ${STATUS_LABEL[status]}`); save(); render(); };
  window.fsArchive = function (id) { const v = visitById(id); if (!v) return; if (!confirm(`أرشفة الزيارة "${v.title}"؟`)) return; v.is_active = false; audit('visit_archive', `أرشفة ${v.ref || v.title}`); save(); render(); };

  // OPTIONAL explicit billing — posts a customer charge (AR/income) via the proven bridge.
  window.fsInvoice = function (id) {
    const v = visitById(id); if (!v) return;
    if (v.status !== 'done') { toast('لا يمكن الفوترة قبل إنجاز الزيارة', 'warning'); return; }
    if (v.financeTxnId) { toast('تمت فوترتها مسبقاً', 'info'); return; }
    if (num(v.charge) <= 0) { toast('أدخل مبلغ الخدمة أولاً (تعديل الزيارة)', 'warning'); return; }
    if (!confirm(`إصدار فاتورة خدمة بمبلغ ${fmt(v.charge)} ${curSym()} للعميل ${v.customerName || '—'}؟`)) return;
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        const txn = window.addFinanceTransaction({
          type: 'customer_charge', direction: 'neutral', sourceType: 'field_service', sourceId: v.id,
          date: todayISO(), amount: num(v.charge), customerId: v.customerId, partyName: v.customerName,
          description: `خدمة ميدانية ${v.ref || ''} — ${v.title}`
        });
        if (txn && txn.id) v.financeTxnId = txn.id;
      } catch (e) { console.warn('field service charge post failed', e); }
    }
    audit('visit_invoice', `فوترة خدمة ${fmt(v.charge)} ${curSym()} — ${v.customerName}`);
    save(); toast('تم إصدار الفاتورة (ذمم العميل)', 'success'); render();
  };
  window.fsMarkPaid = function (id) {
    const v = visitById(id); if (!v) return;
    if (!v.financeTxnId) { toast('أصدر الفاتورة أولاً', 'warning'); return; }
    if (v.paid) { toast('مدفوعة مسبقاً', 'info'); return; }
    if (typeof window.addFinanceTransaction === 'function' && num(v.charge) > 0) {
      try {
        window.addFinanceTransaction({
          type: 'income', direction: 'in', sourceType: 'field_service_payment', sourceId: v.id,
          date: todayISO(), amount: num(v.charge), customerId: v.customerId, partyName: v.customerName,
          description: `تسديد خدمة ميدانية ${v.ref || ''} — ${v.customerName}`
        });
      } catch (e) { console.warn('field service payment post failed', e); }
    }
    v.paid = true; v.paidAt = new Date().toISOString();
    audit('visit_payment', `تسديد خدمة ${fmt(v.charge)} ${curSym()} — ${v.customerName}`);
    save(); toast('تم تسجيل التسديد', 'success'); render();
  };

  window.fsLoadDemo = function () {
    const f = F(); if (!f) return;
    if (f.visits.length) { toast('توجد زيارات مسبقاً', 'info'); return; }
    const at = (dayOffset, hour) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0); return d.toISOString().slice(0, 16); };
    const mk = (title, type, prio, status, sched, tech, charge, loc) => ({ id: uid('fsv'), ref: 'FS-DEMO-' + Math.random().toString(36).slice(2, 5), title, customerName: 'عميل تجريبي', location: loc || 'بغداد', technicianName: tech || '', serviceType: type, priority: prio, scheduledAt: sched, durationMin: 60, charge: charge || 0, description: '', status, financeTxnId: '', paid: false, is_active: true, completedAt: status === 'done' ? new Date().toISOString() : '', createdAt: new Date().toISOString() });
    f.visits.unshift(
      mk('تركيب مكيف مركزي', 'install', 'high', 'scheduled', at(0, 10), 'فني تركيب', 250000, 'حي الجامعة'),
      mk('إصلاح عطل كهربائي', 'repair', 'urgent', 'in_progress', at(0, 9), 'فني كهرباء', 120000, 'الكرادة'),
      mk('معاينة موقع عميل', 'inspection', 'normal', 'scheduled', at(1, 11), '', 0, 'المنصور'),
      mk('استدعاء صيانة دورية', 'callout', 'normal', 'done', at(-2, 13), 'فني صيانة', 80000, 'زيونة')
    );
    audit('field_service_demo', 'تحميل زيارات تجريبية'); save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  /* ---- render ---- */
  function kpi(label, value, sub, cls) { return `<div class="fs-kpi ${cls || ''}"><div class="fs-kpi-val">${value}</div><div class="fs-kpi-label">${label}</div>${sub ? `<div class="fs-kpi-sub">${sub}</div>` : ''}</div>`; }
  function timeLabel(iso) { if (!iso) return '—'; const d = String(iso).slice(0, 10); const t = String(iso).slice(11, 16); return d === todayISO() ? ('اليوم ' + t) : (d + (t ? ' ' + t : '')); }

  function renderDashboard() {
    const el = document.getElementById('fsDashBody'); if (!el) return;
    const p = portfolio();
    el.innerHTML = `
      <div class="fs-kpi-grid">
        ${kpi('مجدولة اليوم', p.scheduledToday, `${p.open} مفتوحة`, 'fs-kpi-accent')}
        ${kpi('قيد التنفيذ', p.inProgress, '', '')}
        ${kpi('متأخرة', p.overdue, p.unassigned ? `${p.unassigned} غير مُسندة` : '', p.overdue ? 'fs-kpi-neg' : '')}
        ${kpi('منجزة هذا الشهر', p.doneMonth, '', 'fs-kpi-pos')}
        ${kpi('مفوتر هذا الشهر', fmt(p.billedMonth) + ' ' + curSym(), '', '')}
      </div>
      <div class="fs-panel"><div class="fs-panel-head"><h3>🗓️ جدول اليوم والمتأخرات</h3><button class="fs-mini-btn" onclick="fsOpenTab('visits')">كل الزيارات</button></div>
        <table class="fs-table"><thead><tr><th>الموعد</th><th>المرجع</th><th>الخدمة</th><th>العميل</th><th>الفني</th><th>الحالة</th></tr></thead>
        <tbody>${p.todaySchedule.map(v => { const late = isOverdue(v); return `<tr>
          <td class="${late ? 'fs-neg' : ''}">${esc(timeLabel(v.scheduledAt))}${late ? ' ⚠️' : ''}</td>
          <td class="fs-muted">${esc(v.ref || '—')}</td>
          <td><strong>${esc(v.title)}</strong><br><span class="fs-muted">${SVC_LABEL[v.serviceType] || v.serviceType}</span></td>
          <td>${esc(v.customerName || '—')}${v.location ? `<br><span class="fs-muted">📍 ${esc(v.location)}</span>` : ''}</td>
          <td class="fs-muted">${esc(v.technicianName || 'غير مُسند')}</td>
          <td><span class="fs-badge ${STATUS_CLASS[v.status] || ''}">${STATUS_LABEL[v.status] || v.status}</span></td>
        </tr>`; }).join('') || '<tr><td colspan="6" class="fs-empty">لا زيارات اليوم</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderForm() {
    const v = editing !== 'new' ? visitById(editing) : null; const d = v || {};
    const custOpt = '<option value="">— بدون عميل —</option>' + getCustomers().map(c => `<option value="${c.id}" ${d.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const techOpt = '<option value="">— غير مُسند —</option>' + getEmployees().map(e => `<option value="${e.id}" ${String(d.technicianId) === String(e.id) ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
    const typeOpt = SVC_TYPES.map(([k, l]) => `<option value="${k}" ${d.serviceType === k ? 'selected' : ''}>${l}</option>`).join('');
    const prOpt = Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${d.priority === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="fs-panel"><div class="fs-panel-head"><h3>${v ? 'تعديل زيارة' : 'زيارة ميدانية جديدة'}</h3></div>
      <div class="fs-form-grid">
        <div class="fs-form-full"><label>عنوان الزيارة *</label><input id="fsTitle" class="fs-input" value="${esc(d.title || '')}"></div>
        <div><label>العميل</label><select id="fsCustomer" class="fs-input">${custOpt}</select></div>
        <div><label>الفني المسؤول</label><select id="fsTech" class="fs-input">${techOpt}</select></div>
        <div><label>نوع الخدمة</label><select id="fsType" class="fs-input">${typeOpt}</select></div>
        <div><label>الأولوية</label><select id="fsPriority" class="fs-input">${prOpt}</select></div>
        <div><label>الموعد</label><input id="fsScheduled" type="datetime-local" class="fs-input" value="${esc(d.scheduledAt || '')}"></div>
        <div><label>المدة (دقيقة)</label><input id="fsDuration" type="number" class="fs-input" value="${num(d.durationMin) || ''}"></div>
        <div><label>الموقع/العنوان</label><input id="fsLocation" class="fs-input" value="${esc(d.location || '')}"></div>
        <div><label>مبلغ الخدمة (${curSym()})</label><input id="fsCharge" type="number" class="fs-input" value="${num(d.charge) || ''}"></div>
        <div class="fs-form-full"><label>الوصف</label><input id="fsDesc" class="fs-input" value="${esc(d.description || '')}"></div>
      </div>
      <div class="fs-form-actions"><button class="btn-primary" onclick="fsSave()">حفظ</button><button class="fs-mini-btn" onclick="fsCancelForm()">إلغاء</button></div></div>`;
  }

  function renderList() {
    const el = document.getElementById('fsListBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    let list = visits();
    if (statusFilter) list = list.filter(v => v.status === statusFilter);
    if (search) { const q = search.toLowerCase(); list = list.filter(v => `${v.ref} ${v.title} ${v.customerName} ${v.technicianName} ${v.location}`.toLowerCase().includes(q)); }
    list.sort((a, b) => String(b.scheduledAt || b.createdAt || '').localeCompare(String(a.scheduledAt || a.createdAt || '')));
    el.innerHTML = `
      <div class="fs-toolbar">
        <button class="btn-primary" onclick="fsNew()">➕ زيارة جديدة</button>
        <button class="fs-mini-btn" onclick="fsLoadDemo()">بيانات تجريبية</button>
        <select class="fs-mini-select" onchange="fsStatusFilter(this.value)"><option value="">كل الحالات</option>${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${statusFilter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="fs-input" placeholder="بحث..." value="${esc(search)}" oninput="fsSearch(this.value)" style="max-width:180px">
      </div>
      <table class="fs-table"><thead><tr><th>المرجع</th><th>الزيارة</th><th>العميل/الموقع</th><th>الفني</th><th>الموعد</th><th>المبلغ</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(v => {
        const late = isOverdue(v);
        const acts = [`<button class="fs-mini-btn" onclick="fsEdit('${v.id}')">تعديل</button>`];
        if (v.status === 'done' && num(v.charge) > 0 && !v.financeTxnId) acts.push(`<button class="fs-mini-btn fs-ok" onclick="fsInvoice('${v.id}')">فاتورة</button>`);
        if (v.financeTxnId && !v.paid) acts.push(`<button class="fs-mini-btn fs-ok" onclick="fsMarkPaid('${v.id}')">تسديد</button>`);
        acts.push(`<button class="fs-mini-btn fs-danger" onclick="fsArchive('${v.id}')">أرشفة</button>`);
        return `<tr>
          <td class="fs-muted">${esc(v.ref || '—')}</td>
          <td><strong>${esc(v.title)}</strong><br><span class="fs-muted">${SVC_LABEL[v.serviceType] || v.serviceType} · <span class="fs-prio fs-prio-${v.priority}">${PRIO[v.priority] || v.priority}</span></span></td>
          <td>${esc(v.customerName || '—')}${v.location ? `<br><span class="fs-muted">📍 ${esc(v.location)}</span>` : ''}</td>
          <td class="fs-muted">${esc(v.technicianName || 'غير مُسند')}</td>
          <td class="${late ? 'fs-neg' : ''}">${esc(timeLabel(v.scheduledAt))}${late ? ' ⚠️' : ''}</td>
          <td>${v.charge ? fmt(v.charge) + ' ' + curSym() : '—'}${v.financeTxnId ? (v.paid ? '<br><span class="fs-paid">مدفوعة</span>' : '<br><span class="fs-muted">مفوترة</span>') : ''}</td>
          <td><select class="fs-mini-select" onchange="fsSetStatus('${v.id}',this.value)">${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td class="fs-actions">${acts.join('')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="fs-empty">لا توجد زيارات — أنشئ زيارة جديدة</td></tr>'}</tbody></table>`;
  }

  function renderTabContent() {
    const map = { fsDashBody: 'dashboard', fsListBody: 'visits' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else renderList();
  }
  function render() {
    const body = document.getElementById('fieldServiceBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['visits', '🧰 الزيارات']];
    body.innerHTML = `<div class="fs-tabs">${tabs.map(([k, l]) => `<button class="fs-tab-btn ${activeTab === k ? 'active' : ''}" onclick="fsOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="fsDashBody"></div><div id="fsListBody"></div>`;
    renderTabContent();
  }
  window.renderFieldService = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'field_service') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageFieldService'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navFieldService'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('field_service');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };

  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_fieldservice_today'] = function () {
          const p = portfolio();
          return { scheduledToday: p.scheduledToday, inProgress: p.inProgress, overdue: p.overdue, unassigned: p.unassigned, doneThisMonth: p.doneMonth, billedThisMonth: p.billedMonth, openVisits: p.open };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['field_service'] = '#pageFieldService';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  // Integration entry point: create a scheduled visit from another module (e.g. a
  // Helpdesk ticket). Returns the created visit. Add-only.
  function createVisitFrom(opts) {
    const f = F(); if (!f) return null;
    opts = opts || {};
    const v = {
      id: uid('fsv'), ref: 'FS-' + todayISO().replace(/-/g, '').slice(2) + '-' + String(f.visits.length + 1).padStart(3, '0'),
      title: opts.title || 'زيارة ميدانية', customerId: opts.customerId || '', customerName: opts.customerName || '',
      location: opts.location || '', technicianId: '', technicianName: '',
      serviceType: opts.serviceType || 'callout', priority: opts.priority || 'normal',
      scheduledAt: opts.scheduledAt || (todayISO() + 'T09:00'), durationMin: 60, charge: num(opts.charge), description: opts.description || '',
      status: 'scheduled', financeTxnId: '', paid: false, sourceRef: opts.sourceRef || '', is_active: true, companyId: coId(),
      createdAt: new Date().toISOString(), createdBy: userName()
    };
    f.visits.unshift(v);
    audit('visit_create', `زيارة من ${opts.originText || 'وحدة أخرى'}: ${v.title}`);
    save();
    return v;
  }
  window.OctagonFieldService = { render, ensureData, portfolio, createVisitFrom };
})();
