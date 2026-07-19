/**
 * OCTAGON ERP — Helpdesk / Support Tickets (خدمة العملاء — التذاكر).
 *
 * A core ERP pillar Octagon had ZERO of (`helpdesk`/`support ticket`/`ticket_` = 0 occurrences).
 * Universal customer-support ticketing: capture issues, prioritize, track SLA, assign, resolve.
 * Add-only on shared engines; reads `omni.finance.customers` for the customer link (read-only).
 *
 *  - Tickets: ref, subject, customer, category, priority (low/medium/high/urgent), channel,
 *    status (new → in_progress → waiting → resolved → closed), assignee, SLA hours → due time.
 *  - Dashboard: open / overdue (past SLA) / unassigned / resolved-today + priority breakdown + alerts.
 *  - Jarvis tool: report_helpdesk_today. Every mutation writes an audit event. Archive, never delete.
 *
 * Data namespace: omni.helpdesk = { tickets:[] }
 * Page: #pageHelpdesk (nav data-page="helpdesk"). Add-only.
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
  function coId() { try { return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''; } catch (_) { return ''; } }
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('helpdesk', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'helpdesk', action, detail, user: userName() }); } catch (_) {}
  }
  function nowISO() { return new Date().toISOString(); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function hoursUntil(iso) { return iso ? (new Date(iso) - new Date()) / 3600000 : null; }
  function getCustomers() { const o = O(); let l = (o && o.finance && Array.isArray(o.finance.customers)) ? o.finance.customers : []; if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function getEmployees() { return Array.isArray(window.employees) ? window.employees : ((O() && Array.isArray(O().employees)) ? O().employees : []); }

  const PRIORITIES = [['low', 'منخفض', 72], ['medium', 'متوسط', 48], ['high', 'عالٍ', 24], ['urgent', 'عاجل', 4]];
  const PRIO_LABEL = Object.fromEntries(PRIORITIES.map(p => [p[0], p[1]]));
  const PRIO_SLA = Object.fromEntries(PRIORITIES.map(p => [p[0], p[2]]));
  const PRIO_CLASS = { low: 'hd-p-low', medium: 'hd-p-medium', high: 'hd-p-high', urgent: 'hd-p-urgent' };
  const STATUSES = [['new', 'جديدة'], ['in_progress', 'قيد المعالجة'], ['waiting', 'بانتظار العميل'], ['resolved', 'محلولة'], ['closed', 'مغلقة']];
  const STATUS_LABEL = Object.fromEntries(STATUSES);
  const STATUS_CLASS = { new: 'hd-s-new', in_progress: 'hd-s-progress', waiting: 'hd-s-waiting', resolved: 'hd-s-resolved', closed: 'hd-s-closed' };
  const CATEGORIES = ['استفسار', 'شكوى', 'عطل/مشكلة', 'طلب خدمة', 'متابعة طلب', 'أخرى'];

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.helpdesk || typeof o.helpdesk !== 'object') o.helpdesk = {};
    if (!Array.isArray(o.helpdesk.tickets)) o.helpdesk.tickets = [];
    return o.helpdesk;
  }
  function HD() { return ensureData(); }
  function getTickets(all) { let l = (HD()?.tickets || []).filter(t => all || t.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function isOpen(t) { return !['resolved', 'closed'].includes(t.status); }
  function isOverdue(t) { return isOpen(t) && t.dueAt && hoursUntil(t.dueAt) < 0; }

  function portfolio() {
    const ts = getTickets();
    const open = ts.filter(isOpen);
    return {
      total: ts.length, open: open.length,
      overdue: open.filter(isOverdue).length,
      unassigned: open.filter(t => !t.assignedTo).length,
      urgent: open.filter(t => t.priority === 'urgent').length,
      resolvedToday: ts.filter(t => t.status === 'resolved' && (t.resolvedAt || '').slice(0, 10) === todayISO()).length,
      byPriority: PRIORITIES.map(([k, l]) => ({ key: k, label: l, count: open.filter(t => t.priority === k).length })),
      overdueList: open.filter(isOverdue).sort((a, b) => hoursUntil(a.dueAt) - hoursUntil(b.dueAt))
    };
  }

  let activeTab = 'dashboard', editing = null, fStatus = 'all', fPrio = 'all', search = '';
  window.hdOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.hdSearch = function (v) { search = v; renderList(); };
  window.hdFilterStatus = function (v) { fStatus = v; renderList(); };
  window.hdFilterPrio = function (v) { fPrio = v; renderList(); };
  window.hdOpenForm = function (id) { editing = id || 'new'; activeTab = 'tickets'; render(); };
  window.hdCancelForm = function () { editing = null; render(); };

  window.hdSaveTicket = function () {
    const hd = HD(); if (!hd) return;
    const subject = val('hdSubject');
    if (!subject) { toast('عنوان التذكرة مطلوب', 'error'); return; }
    const custId = val('hdCustomer');
    const cust = getCustomers().find(c => c.id === custId);
    const priority = val('hdPriority') || 'medium';
    const base = {
      subject, customerId: custId, customerName: cust ? cust.name : val('hdCustomerName'),
      category: val('hdCategory') || 'استفسار', priority, channel: val('hdChannel') || 'هاتف',
      assignedTo: val('hdAssignee'), description: val('hdDesc')
    };
    const ex = editing && editing !== 'new' ? hd.tickets.find(t => t.id === editing) : null;
    if (ex) {
      Object.assign(ex, base);
      if (ex.status === 'new' || ex.status === 'in_progress') ex.dueAt = new Date(new Date(ex.createdAt).getTime() + PRIO_SLA[priority] * 3600000).toISOString();
      audit('ticket_update', `تعديل تذكرة: ${subject}`); toast('تم تحديث التذكرة', 'success');
    } else {
      const created = nowISO();
      const seq = (hd.tickets.length + 1);
      hd.tickets.unshift({
        id: uid('tkt'), ref: 'TKT-' + todayISO().replace(/-/g, '').slice(2) + '-' + String(seq).padStart(3, '0'),
        ...base, status: 'new', createdAt: created, createdBy: userName(),
        slaHours: PRIO_SLA[priority], dueAt: new Date(new Date(created).getTime() + PRIO_SLA[priority] * 3600000).toISOString(),
        resolvedAt: '', is_active: true, companyId: coId()
      });
      audit('ticket_create', `تذكرة جديدة: ${subject} (${PRIO_LABEL[priority]})`); toast('تم فتح التذكرة', 'success');
    }
    save(); editing = null; render();
  };
  window.hdSetStatus = function (id, status) {
    const t = (HD()?.tickets || []).find(x => x.id === id); if (!t) return;
    t.status = status;
    if (status === 'resolved' && !t.resolvedAt) t.resolvedAt = nowISO();
    if (status === 'in_progress' || status === 'new' || status === 'waiting') t.resolvedAt = '';
    audit('ticket_status', `${t.ref} → ${STATUS_LABEL[status]}`);
    save(); toast(`التذكرة: ${STATUS_LABEL[status]}`, 'info'); render();
  };
  window.hdAssign = function (id, who) {
    const t = (HD()?.tickets || []).find(x => x.id === id); if (!t) return;
    t.assignedTo = who; if (t.status === 'new' && who) t.status = 'in_progress';
    audit('ticket_assign', `${t.ref} → ${who || 'بدون'}`); save(); render();
  };
  // Integration: a ticket → dispatch an on-site Field Service visit.
  window.hdToFieldVisit = function (id) {
    const t = (HD()?.tickets || []).find(x => x.id === id); if (!t) return;
    if (t.fieldVisitId) { toast('تم إنشاء زيارة مسبقاً', 'info'); switchPage('field_service'); return; }
    if (!(window.OctagonFieldService && typeof OctagonFieldService.createVisitFrom === 'function')) { toast('وحدة الخدمة الميدانية غير متوفرة', 'error'); return; }
    const v = OctagonFieldService.createVisitFrom({
      title: t.subject, customerId: t.customerId, customerName: t.customerName,
      priority: t.priority, description: t.description || '', serviceType: 'callout',
      sourceRef: t.id, originText: `تذكرة ${t.ref || ''}`
    });
    if (v) { t.fieldVisitId = v.id; if (t.status === 'new') t.status = 'in_progress'; save(); audit('ticket_to_field_visit', `${t.ref || t.subject} → زيارة ${v.id}`); toast('تم إنشاء زيارة ميدانية مجدولة', 'success'); switchPage('field_service'); }
  };
  window.hdArchive = function (id) {
    const t = (HD()?.tickets || []).find(x => x.id === id); if (!t) return;
    if (!confirm(`أرشفة التذكرة ${t.ref}؟`)) return;
    t.is_active = false; t.status = 'closed'; audit('ticket_archive', `أرشفة ${t.ref}`); save(); render();
  };
  window.hdLoadDemo = function () {
    const hd = HD(); if (!hd) return;
    if (hd.tickets.length) { toast('توجد تذاكر مسبقاً', 'info'); return; }
    const custs = getCustomers();
    const cn = i => (custs[i] && custs[i].name) || ['زبون أ', 'زبون ب', 'زبون ج'][i] || 'زبون';
    const ci = i => (custs[i] && custs[i].id) || '';
    const mk = (h, subject, cat, prio, status, assignee, cust) => {
      const created = new Date(Date.now() - h * 3600000).toISOString();
      return { id: uid('tkt'), ref: 'TKT-DEMO-' + Math.random().toString(36).slice(2, 5), subject, customerId: ci(cust), customerName: cn(cust), category: cat, priority: prio, channel: 'هاتف', assignedTo: assignee, description: '', status, createdAt: created, createdBy: 'تجريبي', slaHours: PRIO_SLA[prio], dueAt: new Date(new Date(created).getTime() + PRIO_SLA[prio] * 3600000).toISOString(), resolvedAt: status === 'resolved' ? new Date().toISOString() : '', is_active: true, companyId: coId() };
    };
    hd.tickets.push(
      mk(6, 'اللوحة وصلت بخدش بسيط', 'شكوى', 'high', 'in_progress', 'أحمد', 0),
      mk(30, 'استفسار عن سعر حفر ليزر', 'استفسار', 'low', 'new', '', 1),
      mk(2, 'الطلب متأخر عن الموعد', 'متابعة طلب', 'urgent', 'new', '', 2),
      mk(50, 'طلب تعديل تصميم', 'طلب خدمة', 'medium', 'resolved', 'علي', 0)
    );
    audit('helpdesk_demo', 'تحميل تذاكر تجريبية');
    save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  function kpi(label, value, sub, cls) { return `<div class="hd-kpi ${cls || ''}"><div class="hd-kpi-val">${value}</div><div class="hd-kpi-label">${label}</div>${sub ? `<div class="hd-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('hdDashBody'); if (!el) return;
    const p = portfolio();
    const slaTxt = t => { const h = hoursUntil(t.dueAt); return h < 0 ? `تأخّر ${Math.abs(Math.round(h))} ساعة` : `خلال ${Math.round(h)} ساعة`; };
    el.innerHTML = `
      <div class="hd-kpi-grid">
        ${kpi('تذاكر مفتوحة', p.open, `${p.total} إجمالاً`, 'hd-kpi-accent')}
        ${kpi('متأخرة (SLA)', p.overdue, 'تجاوزت المهلة', p.overdue ? 'hd-kpi-danger' : '')}
        ${kpi('غير مُسندة', p.unassigned, 'تحتاج تعييناً', p.unassigned ? 'hd-kpi-warn' : '')}
        ${kpi('عاجلة', p.urgent, 'أولوية قصوى', p.urgent ? 'hd-kpi-warn' : '')}
        ${kpi('حُلّت اليوم', p.resolvedToday, '', '')}
      </div>
      <div class="hd-panel">
        <div class="hd-panel-head"><h3>⏰ تذاكر تجاوزت المهلة</h3><button class="hd-mini-btn" onclick="hdOpenTab('tickets')">كل التذاكر</button></div>
        <table class="hd-table"><thead><tr><th>التذكرة</th><th>العميل</th><th>الأولوية</th><th>SLA</th><th>إجراء</th></tr></thead>
        <tbody>${p.overdueList.map(t => `<tr class="hd-row-danger"><td><strong>${esc(t.ref)}</strong><br><span class="hd-muted">${esc(t.subject)}</span></td><td>${esc(t.customerName || '—')}</td><td><span class="hd-badge ${PRIO_CLASS[t.priority]}">${PRIO_LABEL[t.priority]}</span></td><td>${slaTxt(t)}</td><td><button class="hd-mini-btn" onclick="hdSetStatus('${t.id}','resolved')">حلّ</button></td></tr>`).join('') || '<tr><td colspan="5" class="hd-empty">لا توجد تذاكر متأخرة ✅</td></tr>'}</tbody></table>
      </div>
      <div class="hd-panel"><div class="hd-panel-head"><h3>توزيع الأولويات (المفتوحة)</h3></div>
        <div class="hd-prio-bars">${p.byPriority.map(b => `<div class="hd-prio-bar"><span class="hd-badge ${PRIO_CLASS[b.key]}">${b.label}</span> <strong>${b.count}</strong></div>`).join('')}</div>
      </div>`;
  }

  function renderList() {
    const el = document.getElementById('hdListBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    let list = getTickets();
    if (fStatus !== 'all') list = list.filter(t => t.status === fStatus);
    if (fPrio !== 'all') list = list.filter(t => t.priority === fPrio);
    if (search) { const q = search.toLowerCase(); list = list.filter(t => `${t.ref} ${t.subject} ${t.customerName}`.toLowerCase().includes(q)); }
    const emps = getEmployees();
    const empOpts = (cur) => ['<option value="">— بدون —</option>'].concat(emps.map(e => `<option value="${esc(e.name)}" ${cur === e.name ? 'selected' : ''}>${esc(e.name)}</option>`)).join('');
    const sOpt = ['<option value="all">كل الحالات</option>'].concat(STATUSES.map(([k, l]) => `<option value="${k}" ${fStatus === k ? 'selected' : ''}>${l}</option>`)).join('');
    const pOpt = ['<option value="all">كل الأولويات</option>'].concat(PRIORITIES.map(([k, l]) => `<option value="${k}" ${fPrio === k ? 'selected' : ''}>${l}</option>`)).join('');
    el.innerHTML = `
      <div class="hd-toolbar">
        <button class="btn-primary" onclick="hdOpenForm('new')">➕ تذكرة جديدة</button>
        <button class="hd-mini-btn" onclick="hdLoadDemo()">بيانات تجريبية</button>
        <input class="hd-input" placeholder="بحث..." value="${esc(search)}" oninput="hdSearch(this.value)" style="max-width:180px">
        <select class="hd-input" onchange="hdFilterStatus(this.value)" style="max-width:150px">${sOpt}</select>
        <select class="hd-input" onchange="hdFilterPrio(this.value)" style="max-width:150px">${pOpt}</select>
      </div>
      <table class="hd-table"><thead><tr><th>التذكرة</th><th>العميل</th><th>الفئة</th><th>الأولوية</th><th>الحالة</th><th>المسؤول</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(t => `<tr class="${isOverdue(t) ? 'hd-row-danger' : ''}">
        <td><strong>${esc(t.ref)}</strong><br><span class="hd-muted">${esc(t.subject)}</span></td>
        <td>${esc(t.customerName || '—')}</td><td>${esc(t.category)}</td>
        <td><span class="hd-badge ${PRIO_CLASS[t.priority]}">${PRIO_LABEL[t.priority]}</span></td>
        <td><select class="hd-mini-select" onchange="hdSetStatus('${t.id}',this.value)">${STATUSES.map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><select class="hd-mini-select" onchange="hdAssign('${t.id}',this.value)">${empOpts(t.assignedTo)}</select></td>
        <td class="hd-actions"><button class="hd-mini-btn" onclick="hdOpenForm('${t.id}')">تعديل</button>${t.fieldVisitId ? `<button class="hd-mini-btn" onclick="switchPage('field_service')">زيارة ✓</button>` : `<button class="hd-mini-btn" onclick="hdToFieldVisit('${t.id}')">🧰 زيارة ميدانية</button>`}<button class="hd-mini-btn hd-danger" onclick="hdArchive('${t.id}')">أرشفة</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="hd-empty">لا توجد تذاكر</td></tr>'}</tbody></table>`;
  }
  function renderForm() {
    const t = editing !== 'new' ? (HD()?.tickets || []).find(x => x.id === editing) : null;
    const v = t || {};
    const custOpts = ['<option value="">— عميل عابر —</option>'].concat(getCustomers().map(c => `<option value="${c.id}" ${v.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`)).join('');
    const catOpts = CATEGORIES.map(c => `<option value="${c}" ${v.category === c ? 'selected' : ''}>${c}</option>`).join('');
    const prioOpts = PRIORITIES.map(([k, l, h]) => `<option value="${k}" ${v.priority === k ? 'selected' : ''}>${l} (SLA ${h}س)</option>`).join('');
    const emps = getEmployees();
    const empOpts = ['<option value="">— بدون —</option>'].concat(emps.map(e => `<option value="${esc(e.name)}" ${v.assignedTo === e.name ? 'selected' : ''}>${esc(e.name)}</option>`)).join('');
    return `<div class="hd-panel"><div class="hd-panel-head"><h3>${t ? 'تذكرة ' + esc(t.ref) : 'تذكرة جديدة'}</h3></div>
      <div class="hd-form-grid">
        <div class="hd-form-full"><label>العنوان *</label><input id="hdSubject" class="hd-input" value="${esc(v.subject || '')}"></div>
        <div><label>العميل</label><select id="hdCustomer" class="hd-input">${custOpts}</select></div>
        <div><label>اسم عميل عابر</label><input id="hdCustomerName" class="hd-input" value="${esc(v.customerId ? '' : (v.customerName || ''))}" placeholder="إن لم يكن مسجلاً"></div>
        <div><label>الفئة</label><select id="hdCategory" class="hd-input">${catOpts}</select></div>
        <div><label>الأولوية</label><select id="hdPriority" class="hd-input">${prioOpts}</select></div>
        <div><label>القناة</label><input id="hdChannel" class="hd-input" value="${esc(v.channel || 'هاتف')}"></div>
        <div><label>المسؤول</label><select id="hdAssignee" class="hd-input">${empOpts}</select></div>
        <div class="hd-form-full"><label>الوصف</label><textarea id="hdDesc" class="hd-input" rows="3">${esc(v.description || '')}</textarea></div>
      </div>
      <div class="hd-form-actions"><button class="btn-primary" onclick="hdSaveTicket()">حفظ</button><button class="hd-mini-btn" onclick="hdCancelForm()">إلغاء</button></div></div>`;
  }

  function renderTabContent() {
    const map = { hdDashBody: 'dashboard', hdListBody: 'tickets' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else renderList();
  }
  function render() {
    const body = document.getElementById('helpdeskBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['tickets', '🎫 التذاكر']];
    body.innerHTML = `<div class="hd-tabs">${tabs.map(([k, l]) => `<button class="hd-tab-btn ${activeTab === k ? 'active' : ''}" onclick="hdOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="hdDashBody"></div><div id="hdListBody"></div>`;
    renderTabContent();
  }
  window.renderHelpdesk = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'helpdesk') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageHelpdesk'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navHelpdesk'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('helpdesk');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_helpdesk_today'] = function () {
          const p = portfolio();
          return { openTickets: p.open, overdue: p.overdue, unassigned: p.unassigned, urgent: p.urgent, resolvedToday: p.resolvedToday, byPriority: p.byPriority, overdueRefs: p.overdueList.map(t => t.ref) };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['helpdesk'] = '#pageHelpdesk';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonHelpdesk = { render, ensureData, portfolio };
})();
