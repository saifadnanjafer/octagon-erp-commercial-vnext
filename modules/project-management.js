/**
 * OCTAGON ERP — Project Management (إدارة المشاريع).
 *
 * The Odoo "Project" pillar Octagon had ZERO of (`omni.projects` = 0, no projects
 * page). `task_manager`/`kanban` are generic boards; this is project-level: real
 * projects with a client, manager, dates, budget, milestones, and tasks rolled up
 * into progress + planned-vs-actual hours. Universal across every vertical (a
 * workshop job campaign, a clinic fit-out, a construction contract).
 *
 * Add-only, self-contained in `omni.projectHub`. Reads `omni.finance.customers`
 * (client picker) + `window.employees` (assignee) read-only. Touches NO finance
 * and NO payroll — planning/tracking only.
 *
 * Page: #pageProjects (nav data-page="projects").
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
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('projects', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'projects', action, detail, user: userName() }); } catch (_) {}
  }
  function getCustomers() { const o = O(); let l = (o && o.finance && Array.isArray(o.finance.customers)) ? o.finance.customers : []; if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function getEmployees() { return Array.isArray(window.employees) ? window.employees : ((O() && Array.isArray(O().employees)) ? O().employees : []); }

  const P_STATUS = { planning: 'تخطيط', active: 'نشط', on_hold: 'متوقف مؤقتاً', completed: 'مكتمل', cancelled: 'ملغي' };
  const P_CLASS = { planning: 'pj-st-planning', active: 'pj-st-active', on_hold: 'pj-st-hold', completed: 'pj-st-done', cancelled: 'pj-st-cancelled' };
  const T_STATUS = { todo: 'قيد الانتظار', in_progress: 'قيد التنفيذ', review: 'مراجعة', done: 'منجز' };
  const T_CLASS = { todo: 'pj-tk-todo', in_progress: 'pj-tk-prog', review: 'pj-tk-review', done: 'pj-tk-done' };
  const PRIO = { low: 'منخفض', normal: 'عادي', high: 'عالٍ', urgent: 'عاجل' };

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.projectHub || typeof o.projectHub !== 'object') o.projectHub = {};
    if (!Array.isArray(o.projectHub.projects)) o.projectHub.projects = [];
    if (!Array.isArray(o.projectHub.tasks)) o.projectHub.tasks = [];
    return o.projectHub;
  }
  function H() { return ensureData(); }
  function projects(all) { let l = (H()?.projects || []).filter(p => all || p.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function tasksOf(pid) { return (H()?.tasks || []).filter(t => t.projectId === pid && t.is_active !== false); }
  function projectById(id) { return (H()?.projects || []).find(p => p.id === id) || null; }
  function taskById(id) { return (H()?.tasks || []).find(t => t.id === id) || null; }

  function projStats(p) {
    const ts = tasksOf(p.id);
    const done = ts.filter(t => t.status === 'done').length;
    const overdue = ts.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayISO()).length;
    const estH = ts.reduce((s, t) => s + num(t.estHours), 0);
    const actH = ts.reduce((s, t) => s + num(t.actHours), 0);
    const progress = ts.length ? Math.round(done / ts.length * 100) : (p.status === 'completed' ? 100 : 0);
    const milestones = Array.isArray(p.milestones) ? p.milestones : [];
    const msDone = milestones.filter(m => m.done).length;
    return { taskCount: ts.length, done, open: ts.length - done, overdue, estH, actH, progress, milestones: milestones.length, msDone };
  }
  function portfolio() {
    const ps = projects();
    const active = ps.filter(p => p.status === 'active');
    let openTasks = 0, overdueTasks = 0, estH = 0, actH = 0, upcoming = [];
    ps.forEach(p => { const s = projStats(p); openTasks += s.open; overdueTasks += s.overdue; estH += s.estH; actH += s.actH; (p.milestones || []).forEach(m => { if (!m.done && m.dueDate) upcoming.push({ project: p.name, name: m.name, dueDate: m.dueDate }); }); });
    upcoming.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const totalBudget = ps.reduce((s, p) => s + num(p.budget), 0);
    return { total: ps.length, active: active.length, openTasks, overdueTasks, estH, actH, totalBudget, upcoming: upcoming.slice(0, 6), hoursVariance: actH - estH };
  }

  let activeTab = 'dashboard', editing = null, search = '', taskProject = '', taskEditing = null;
  window.pjOpenTab = function (t) { activeTab = t; editing = null; taskEditing = null; render(); };
  window.pjSearch = function (v) { search = v; renderProjects(); };

  /* ---- project form ---- */
  window.pjNewProject = function () { editing = 'new'; activeTab = 'projects'; render(); };
  window.pjEditProject = function (id) { editing = id; activeTab = 'projects'; render(); };
  window.pjCancelForm = function () { editing = null; render(); };
  window.pjSaveProject = function () {
    const h = H(); if (!h) return;
    const name = val('pjName'); if (!name) { toast('اسم المشروع مطلوب', 'error'); return; }
    const base = {
      name, clientId: val('pjClient'), clientName: (getCustomers().find(c => c.id === val('pjClient')) || {}).name || val('pjClientName') || '',
      managerId: val('pjManager'), managerName: (getEmployees().find(e => String(e.id) === val('pjManager')) || {}).name || '',
      status: val('pjStatus') || 'planning', startDate: val('pjStart'), endDate: val('pjEnd'),
      budget: numVal('pjBudget'), description: val('pjDesc')
    };
    const ex = editing && editing !== 'new' ? projectById(editing) : null;
    if (ex) { Object.assign(ex, base); audit('project_update', `تعديل مشروع: ${name}`); toast('تم التحديث', 'success'); }
    else { h.projects.unshift({ id: uid('proj'), ...base, milestones: [], is_active: true, createdAt: new Date().toISOString(), createdBy: userName() }); audit('project_create', `مشروع جديد: ${name}`); toast('تمت إضافة المشروع', 'success'); }
    save(); editing = null; render();
  };
  window.pjSetStatus = function (id, status) { const p = projectById(id); if (!p) return; p.status = status; audit('project_status', `${p.name} → ${P_STATUS[status]}`); save(); render(); };
  window.pjArchiveProject = function (id) { const p = projectById(id); if (!p) return; if (!confirm(`أرشفة المشروع "${p.name}"؟ (لن تُحذف المهام)`)) return; p.is_active = false; audit('project_archive', `أرشفة ${p.name}`); save(); render(); };

  /* ---- milestones ---- */
  window.pjAddMilestone = function (pid) {
    const p = projectById(pid); if (!p) return;
    const name = prompt('اسم المعلم (milestone):'); if (!name) return;
    const due = prompt('تاريخ الاستحقاق (YYYY-MM-DD):', todayISO()) || '';
    p.milestones = p.milestones || []; p.milestones.push({ id: uid('ms'), name: name.trim(), dueDate: due.trim(), done: false });
    audit('milestone_add', `${p.name}: ${name}`); save(); render();
  };
  window.pjToggleMilestone = function (pid, mid) { const p = projectById(pid); if (!p) return; const m = (p.milestones || []).find(x => x.id === mid); if (!m) return; m.done = !m.done; m.doneAt = m.done ? new Date().toISOString() : ''; save(); render(); };

  /* ---- tasks ---- */
  window.pjTaskFilter = function (pid) { taskProject = pid; taskEditing = null; renderTasks(); };
  window.pjNewTask = function () { if (!projects().length) { toast('أنشئ مشروعاً أولاً', 'warning'); return; } taskEditing = 'new'; activeTab = 'tasks'; render(); };
  window.pjEditTask = function (id) { taskEditing = id; activeTab = 'tasks'; render(); };
  window.pjCancelTask = function () { taskEditing = null; render(); };
  window.pjSaveTask = function () {
    const h = H(); if (!h) return;
    const title = val('pjtTitle'); const pid = val('pjtProject');
    if (!title) { toast('عنوان المهمة مطلوب', 'error'); return; }
    if (!pid) { toast('اختر المشروع', 'error'); return; }
    const base = {
      projectId: pid, title, status: val('pjtStatus') || 'todo', priority: val('pjtPriority') || 'normal',
      assigneeId: val('pjtAssignee'), assigneeName: (getEmployees().find(e => String(e.id) === val('pjtAssignee')) || {}).name || '',
      dueDate: val('pjtDue'), estHours: numVal('pjtEst'), actHours: numVal('pjtAct')
    };
    const ex = taskEditing && taskEditing !== 'new' ? taskById(taskEditing) : null;
    if (ex) { Object.assign(ex, base); audit('task_update', `تعديل مهمة: ${title}`); toast('تم تحديث المهمة', 'success'); }
    else { h.tasks.unshift({ id: uid('task'), ...base, is_active: true, createdAt: new Date().toISOString(), createdBy: userName() }); audit('task_create', `مهمة جديدة: ${title}`); toast('تمت إضافة المهمة', 'success'); }
    save(); taskEditing = null; render();
  };
  window.pjSetTaskStatus = function (id, status) { const t = taskById(id); if (!t) return; t.status = status; if (status === 'done') t.completedAt = new Date().toISOString(); audit('task_status', `${t.title} → ${T_STATUS[status]}`); save(); render(); };
  window.pjArchiveTask = function (id) { const t = taskById(id); if (!t) return; t.is_active = false; audit('task_archive', `أرشفة مهمة ${t.title}`); save(); render(); };

  window.pjLoadDemo = function () {
    const h = H(); if (!h) return;
    if (h.projects.length) { toast('توجد مشاريع مسبقاً', 'info'); return; }
    const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const p1 = { id: uid('proj'), name: 'تجهيز ورشة الطلاء الجديدة', clientName: 'داخلي', managerName: 'المدير', status: 'active', startDate: back(20), endDate: back(-25), budget: 8000000, description: 'تجهيز خط طلاء كامل', milestones: [{ id: uid('ms'), name: 'استلام المعدات', dueDate: back(-5), done: false }, { id: uid('ms'), name: 'التشغيل التجريبي', dueDate: back(-20), done: false }], is_active: true, createdAt: new Date().toISOString() };
    const p2 = { id: uid('proj'), name: 'حملة صيانة أسطول العميل', clientName: 'شركة النقل', managerName: 'المدير', status: 'planning', startDate: back(-3), endDate: back(-40), budget: 3000000, description: '', milestones: [], is_active: true, createdAt: new Date().toISOString() };
    h.projects.unshift(p1, p2);
    h.tasks.unshift(
      { id: uid('task'), projectId: p1.id, title: 'تركيب كابينة الطلاء', status: 'in_progress', priority: 'high', assigneeName: 'فني', dueDate: back(-3), estHours: 40, actHours: 22, is_active: true, createdAt: new Date().toISOString() },
      { id: uid('task'), projectId: p1.id, title: 'مد خطوط الهواء المضغوط', status: 'todo', priority: 'normal', dueDate: back(-8), estHours: 16, actHours: 0, is_active: true, createdAt: new Date().toISOString() },
      { id: uid('task'), projectId: p1.id, title: 'فحص السلامة', status: 'done', priority: 'urgent', dueDate: back(2), estHours: 8, actHours: 9, is_active: true, completedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
      { id: uid('task'), projectId: p2.id, title: 'جرد مركبات العميل', status: 'todo', priority: 'normal', dueDate: back(-1), estHours: 12, actHours: 0, is_active: true, createdAt: new Date().toISOString() }
    );
    audit('projects_demo', 'تحميل مشاريع تجريبية'); save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  /* ---- render ---- */
  function kpi(label, value, sub, cls) { return `<div class="pj-kpi ${cls || ''}"><div class="pj-kpi-val">${value}</div><div class="pj-kpi-label">${label}</div>${sub ? `<div class="pj-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('pjDashBody'); if (!el) return;
    const p = portfolio();
    const varCls = p.hoursVariance > 0 ? 'pj-kpi-neg' : 'pj-kpi-pos';
    el.innerHTML = `
      <div class="pj-kpi-grid">
        ${kpi('مشاريع نشطة', p.active, `${p.total} إجمالاً`, 'pj-kpi-accent')}
        ${kpi('مهام مفتوحة', p.openTasks, p.overdueTasks ? `${p.overdueTasks} متأخرة` : 'لا متأخرات', p.overdueTasks ? 'pj-kpi-neg' : '')}
        ${kpi('ساعات مخططة', fmt(p.estH), `فعلي ${fmt(p.actH)}`, '')}
        ${kpi('فرق الساعات', (p.hoursVariance > 0 ? '+' : '') + fmt(p.hoursVariance), p.hoursVariance > 0 ? 'تجاوز للتقدير' : 'ضمن التقدير', varCls)}
        ${kpi('ميزانية المشاريع', fmt(p.totalBudget) + ' ' + curSym(), '', '')}
      </div>
      <div class="pj-panel"><div class="pj-panel-head"><h3>🚩 معالم قادمة</h3><button class="pj-mini-btn" onclick="pjOpenTab('projects')">إدارة المشاريع</button></div>
        <table class="pj-table"><thead><tr><th>المشروع</th><th>المعلم</th><th>الاستحقاق</th></tr></thead>
        <tbody>${p.upcoming.map(m => { const late = m.dueDate < todayISO(); return `<tr><td>${esc(m.project)}</td><td><strong>${esc(m.name)}</strong></td><td class="${late ? 'pj-neg' : ''}">${esc(m.dueDate)}${late ? ' (متأخر)' : ''}</td></tr>`; }).join('') || '<tr><td colspan="3" class="pj-empty">لا توجد معالم قادمة</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderProjectForm() {
    const p = editing !== 'new' ? projectById(editing) : null; const v = p || {};
    const custOpt = '<option value="">— بدون عميل —</option>' + getCustomers().map(c => `<option value="${c.id}" ${v.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const empOpt = '<option value="">— غير محدد —</option>' + getEmployees().map(e => `<option value="${e.id}" ${String(v.managerId) === String(e.id) ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
    const stOpt = Object.entries(P_STATUS).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="pj-panel"><div class="pj-panel-head"><h3>${p ? 'تعديل مشروع' : 'مشروع جديد'}</h3></div>
      <div class="pj-form-grid">
        <div class="pj-form-full"><label>اسم المشروع *</label><input id="pjName" class="pj-input" value="${esc(v.name || '')}"></div>
        <div><label>العميل</label><select id="pjClient" class="pj-input">${custOpt}</select></div>
        <div><label>مدير المشروع</label><select id="pjManager" class="pj-input">${empOpt}</select></div>
        <div><label>الحالة</label><select id="pjStatus" class="pj-input">${stOpt}</select></div>
        <div><label>تاريخ البدء</label><input id="pjStart" type="date" class="pj-input" value="${esc(v.startDate || todayISO())}"></div>
        <div><label>تاريخ الانتهاء</label><input id="pjEnd" type="date" class="pj-input" value="${esc(v.endDate || '')}"></div>
        <div><label>الميزانية (${curSym()})</label><input id="pjBudget" type="number" class="pj-input" value="${num(v.budget) || ''}"></div>
        <div class="pj-form-full"><label>الوصف</label><input id="pjDesc" class="pj-input" value="${esc(v.description || '')}"></div>
      </div>
      <div class="pj-form-actions"><button class="btn-primary" onclick="pjSaveProject()">حفظ</button><button class="pj-mini-btn" onclick="pjCancelForm()">إلغاء</button></div></div>`;
  }

  function renderProjects() {
    const el = document.getElementById('pjProjBody'); if (!el) return;
    if (editing) { el.innerHTML = renderProjectForm(); return; }
    let list = projects();
    if (search) { const q = search.toLowerCase(); list = list.filter(p => `${p.name} ${p.clientName}`.toLowerCase().includes(q)); }
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    el.innerHTML = `
      <div class="pj-toolbar">
        <button class="btn-primary" onclick="pjNewProject()">➕ مشروع جديد</button>
        <button class="pj-mini-btn" onclick="pjLoadDemo()">بيانات تجريبية</button>
        <input class="pj-input" placeholder="بحث..." value="${esc(search)}" oninput="pjSearch(this.value)" style="max-width:200px">
      </div>
      ${list.map(p => { const s = projStats(p);
        return `<div class="pj-card">
          <div class="pj-card-head">
            <div><strong class="pj-card-title">${esc(p.name)}</strong> <span class="pj-badge ${P_CLASS[p.status] || ''}">${P_STATUS[p.status] || p.status}</span>
              <div class="pj-muted">${p.clientName ? '👤 ' + esc(p.clientName) : ''}${p.managerName ? ' · 🧑‍💼 ' + esc(p.managerName) : ''}${p.endDate ? ' · ⏳ ' + esc(p.endDate) : ''}</div></div>
            <div class="pj-actions">
              <select class="pj-mini-select" onchange="pjSetStatus('${p.id}',this.value)">${Object.entries(P_STATUS).map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <button class="pj-mini-btn" onclick="pjEditProject('${p.id}')">تعديل</button>
              <button class="pj-mini-btn" onclick="pjTaskFilter('${p.id}');pjOpenTab('tasks')">المهام</button>
              <button class="pj-mini-btn pj-danger" onclick="pjArchiveProject('${p.id}')">أرشفة</button>
            </div>
          </div>
          <div class="pj-progress-row"><div class="pj-bar"><div class="pj-bar-fill" style="width:${s.progress}%"></div></div><span class="pj-prog-label">${s.progress}% · ${s.done}/${s.taskCount} مهمة${s.overdue ? ' · ' + s.overdue + ' متأخرة' : ''}</span></div>
          <div class="pj-ms-row">
            ${(p.milestones || []).map(m => `<span class="pj-ms ${m.done ? 'pj-ms-done' : (m.dueDate && m.dueDate < todayISO() ? 'pj-ms-late' : '')}" onclick="pjToggleMilestone('${p.id}','${m.id}')" title="${esc(m.dueDate || '')}">${m.done ? '✅' : '⬜'} ${esc(m.name)}</span>`).join('')}
            <button class="pj-mini-btn" onclick="pjAddMilestone('${p.id}')">➕ معلم</button>
          </div>
        </div>`; }).join('') || '<div class="pj-empty">لا توجد مشاريع — أنشئ مشروعاً جديداً</div>'}`;
  }

  function renderTaskForm() {
    const t = taskEditing !== 'new' ? taskById(taskEditing) : null; const v = t || (taskProject ? { projectId: taskProject } : {});
    const projOpt = projects().map(p => `<option value="${p.id}" ${v.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    const empOpt = '<option value="">— غير محدد —</option>' + getEmployees().map(e => `<option value="${e.id}" ${String(v.assigneeId) === String(e.id) ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
    const stOpt = Object.entries(T_STATUS).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('');
    const prOpt = Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${v.priority === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="pj-panel"><div class="pj-panel-head"><h3>${t ? 'تعديل مهمة' : 'مهمة جديدة'}</h3></div>
      <div class="pj-form-grid">
        <div class="pj-form-full"><label>عنوان المهمة *</label><input id="pjtTitle" class="pj-input" value="${esc(v.title || '')}"></div>
        <div><label>المشروع *</label><select id="pjtProject" class="pj-input">${projOpt}</select></div>
        <div><label>المسؤول</label><select id="pjtAssignee" class="pj-input">${empOpt}</select></div>
        <div><label>الحالة</label><select id="pjtStatus" class="pj-input">${stOpt}</select></div>
        <div><label>الأولوية</label><select id="pjtPriority" class="pj-input">${prOpt}</select></div>
        <div><label>الاستحقاق</label><input id="pjtDue" type="date" class="pj-input" value="${esc(v.dueDate || '')}"></div>
        <div><label>ساعات مقدّرة</label><input id="pjtEst" type="number" class="pj-input" value="${num(v.estHours) || ''}"></div>
        <div><label>ساعات فعلية</label><input id="pjtAct" type="number" class="pj-input" value="${num(v.actHours) || ''}"></div>
      </div>
      <div class="pj-form-actions"><button class="btn-primary" onclick="pjSaveTask()">حفظ</button><button class="pj-mini-btn" onclick="pjCancelTask()">إلغاء</button></div></div>`;
  }

  function renderTasks() {
    const el = document.getElementById('pjTaskBody'); if (!el) return;
    if (taskEditing) { el.innerHTML = renderTaskForm(); return; }
    const ps = projects();
    let list = (H()?.tasks || []).filter(t => t.is_active !== false);
    if (taskProject) list = list.filter(t => t.projectId === taskProject);
    const projName = id => (projectById(id) || {}).name || '—';
    const cols = Object.keys(T_STATUS);
    el.innerHTML = `
      <div class="pj-toolbar">
        <button class="btn-primary" onclick="pjNewTask()">➕ مهمة جديدة</button>
        <select class="pj-mini-select" onchange="pjTaskFilter(this.value)"><option value="">كل المشاريع</option>${ps.map(p => `<option value="${p.id}" ${taskProject === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      </div>
      <div class="pj-board">${cols.map(col => `
        <div class="pj-board-col">
          <div class="pj-board-head ${T_CLASS[col]}">${T_STATUS[col]} <span class="pj-count">${list.filter(t => t.status === col).length}</span></div>
          ${list.filter(t => t.status === col).map(t => { const late = t.status !== 'done' && t.dueDate && t.dueDate < todayISO();
            return `<div class="pj-task-card pj-prio-${t.priority || 'normal'}">
              <div class="pj-task-title">${esc(t.title)}</div>
              <div class="pj-muted">📁 ${esc(projName(t.projectId))}${t.assigneeName ? ' · 👤 ' + esc(t.assigneeName) : ''}</div>
              <div class="pj-task-meta">${t.dueDate ? `<span class="${late ? 'pj-neg' : 'pj-muted'}">⏳ ${esc(t.dueDate)}</span>` : ''}${t.estHours ? `<span class="pj-muted">⏱ ${num(t.actHours)}/${num(t.estHours)}h</span>` : ''}<span class="pj-badge pj-prio-badge">${PRIO[t.priority] || ''}</span></div>
              <div class="pj-task-actions">
                <select class="pj-mini-select" onchange="pjSetTaskStatus('${t.id}',this.value)">${cols.map(c => `<option value="${c}" ${t.status === c ? 'selected' : ''}>${T_STATUS[c]}</option>`).join('')}</select>
                <button class="pj-mini-btn" onclick="pjEditTask('${t.id}')">تعديل</button>
                <button class="pj-mini-btn pj-danger" onclick="pjArchiveTask('${t.id}')">حذف</button>
              </div>
            </div>`; }).join('') || '<div class="pj-empty-col">—</div>'}
        </div>`).join('')}</div>`;
  }

  function renderTabContent() {
    const map = { pjDashBody: 'dashboard', pjProjBody: 'projects', pjTaskBody: 'tasks' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else if (activeTab === 'tasks') renderTasks(); else renderProjects();
  }
  function render() {
    const body = document.getElementById('projectsBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['projects', '📁 المشاريع'], ['tasks', '✅ المهام']];
    body.innerHTML = `<div class="pj-tabs">${tabs.map(([k, l]) => `<button class="pj-tab-btn ${activeTab === k ? 'active' : ''}" onclick="pjOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="pjDashBody"></div><div id="pjProjBody"></div><div id="pjTaskBody"></div>`;
    renderTabContent();
  }
  window.renderProjects = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'projects') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageProjects'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navProjects'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('projects');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };

  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_projects_today'] = function () {
          const p = portfolio();
          return { activeProjects: p.active, totalProjects: p.total, openTasks: p.openTasks, overdueTasks: p.overdueTasks, plannedHours: p.estH, actualHours: p.actH, hoursVariance: p.hoursVariance, totalBudget: p.totalBudget, upcomingMilestones: p.upcoming.length };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['projects'] = '#pageProjects';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonProjects = { render, ensureData, portfolio, projStats };
})();
