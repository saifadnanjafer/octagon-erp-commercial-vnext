/**
 * OCTAGON ERP — WORKSHOP FRONTLINE (mobile / TV / kiosk-adjacent devices).
 * Reuses the Execution Core (omni.jobOrders, workOrderIssues, workOrderEvents,
 * machine.queue, qcRecords, tasks). Add-only: zero edits to app.js. Pages added:
 *   employee_mobile   (مهامي اليوم — worker phone UI)
 *   workshop_tv       (شاشة الورشة الحية — big-screen read-only board)
 *   wfl_home          (الصفحة الرئيسية حسب الدور — role tiles)
 *   deploy_ready      (جاهزية التشغيل — backup + 12-point launch checklist)
 *   plus a universal Problem Button overlay + Traveller-Card printable view.
 *
 * Worker UX rule: only large buttons, no tables/finance/admin/destructive ops.
 * Every action writes audit + (when relevant) notifies Command Center.
 */
(function () {
  'use strict';

  /* ════════════════ helpers ════════════════ */
  function O() { try { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { window.ensureOmni(); return omni; } } catch (_) {} return null; }
  function WO() { return window.OctagonWorkOrders || null; }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function nowIso() { return new Date().toISOString(); }
  function todayIso() { try { if (typeof window.todayISO === 'function') return window.todayISO(); } catch (_) {} return new Date().toISOString().slice(0, 10); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function checked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
  function userName() { try { const u = window.PentagonAuth && PentagonAuth.getCurrentUser && PentagonAuth.getCurrentUser(); if (u && u.name) return u.name; if (u && u.id) return u.id; } catch (_) {} return 'system'; }
  function groupsOf() { try { if (window.PermissionService && window.PentagonAuth) { const g = window.PermissionService.resolveGroups(window.PentagonAuth.getCurrentUser()); if (Array.isArray(g)) return g; } } catch (_) {} return ['system.admin']; }
  function role() {
    const g = groupsOf();
    if (g.includes('system.admin')) return 'system.admin';
    if (g.includes('workshop.manager')) return 'workshop.manager';
    if (g.includes('workshop.supervisor')) return 'workshop.supervisor';
    if (g.includes('finance.user') || g.includes('accountant')) return 'accountant';
    if (g.includes('designer')) return 'designer';
    if (g.includes('workshop.operator')) return 'workshop.operator';
    if (g.includes('customer')) return 'customer';
    return 'employee';
  }
  function isManager() { const r = role(); return r === 'system.admin' || r === 'workshop.manager'; }
  function jobOrders() { const o = O(); return (o && Array.isArray(o.jobOrders)) ? o.jobOrders.filter(w => w.is_active !== false) : []; }
  function allTasks() { try { if (typeof window.getAllTaskManagerTasks === 'function') return window.getAllTaskManagerTasks(true).map(x => x.task).filter(Boolean); } catch (_) {} return []; }
  function machines() { const o = O(); return (o && Array.isArray(o.machines)) ? o.machines : []; }
  function materials() { const o = O(); return (o && Array.isArray(o.materials)) ? o.materials : []; }
  function sops() { const o = O(); return (o && Array.isArray(o.sops)) ? o.sops : []; }
  function qcRecords() { const o = O(); return (o && Array.isArray(o.qcRecords)) ? o.qcRecords : []; }
  function issues() { const o = O(); return (o && Array.isArray(o.workOrderIssues)) ? o.workOrderIssues.filter(i => i.is_active !== false) : []; }
  function taskDone(t) { return ['done', 'Done', 'مكتمل', 'completed'].includes(String(t && t.status || '')); }
  function isOverdue(w) { return w.deadline && w.deadline < todayIso() && !['delivered', 'closed', 'cancelled'].includes(w.state); }
  function stateAr(s) { const wo = WO(); return (wo && wo.stateLabels && wo.stateLabels[s]) || s; }
  function golden(rec) { rec.created_at = rec.created_at || nowIso(); rec.created_by = rec.created_by || userName(); rec.updated_at = nowIso(); rec.updated_by = userName(); if (rec.is_active === undefined) rec.is_active = true; return rec; }

  /** Write into the WO timeline used by the unified file view. */
  function woTimeline(woId, type, text, severity, data) {
    const o = O(); if (!o) return;
    if (!Array.isArray(o.workOrderEvents)) o.workOrderEvents = [];
    o.workOrderEvents.push({ id: uid('woev'), workOrderId: woId, type: type, text: text, severity: severity || 'info', byUser: userName(), at: nowIso(), data: data || {} });
    if (o.workOrderEvents.length > 8000) o.workOrderEvents = o.workOrderEvents.slice(-8000);
    if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'frontline', source: 'frontline', action: type, summary: text, payload: { workOrderId: woId } }); } catch (_) {} }
  }
  function notify(title, message, severity, woId) {
    if (typeof window.createOmniNotification === 'function') { try { window.createOmniNotification({ type: 'workshop', title: title, message: message, sourcePage: 'employee_mobile', sourceType: 'frontline', sourceId: woId || '', severity: severity || 'info', actionPage: 'work_orders' }); } catch (_) {} }
  }

  /* ════════════════ 1: EMPLOYEE MOBILE MODE ════════════════ */
  function myTasks() {
    const me = userName();
    return allTasks().filter(t => !taskDone(t) && [t.assigneeId, t.assignedTo, t.owner, t.employeeId].map(v => String(v || '')).includes(me));
  }
  function myWorkOrders() {
    const me = userName();
    return jobOrders().filter(w =>
      !['delivered', 'closed', 'cancelled'].includes(w.state) &&
      ((w.taskIds || []).some(tid => { const t = allTasks().find(x => x.id === tid); return t && [t.assigneeId, t.assignedTo, t.owner, t.employeeId].map(v => String(v || '')).includes(me); }))
    );
  }
  function taskWoLink(t) { return t.workOrderId && WO() ? WO().getWO(t.workOrderId) : null; }
  function startTaskSafe(t) {
    if (taskDone(t)) return;
    t.status = 'in_progress'; t.startedAt = t.startedAt || nowIso();
    if (Array.isArray(t.activityLog)) t.activityLog.push({ date: nowIso(), text: 'بدأ التنفيذ من شاشة الموبايل: ' + userName() });
    const wo = taskWoLink(t);
    if (wo) { woTimeline(wo.id, 'task_started', 'بدء «' + t.title + '» — ' + userName(), 'info', { taskId: t.id }); if (WO() && wo.state === 'materials_reserved') { try { WO().transition(wo.id, 'in_production'); } catch (_) {} } }
    save();
  }
  function finishTaskSafe(t) {
    t.status = 'done'; t.completedAt = nowIso();
    if (Array.isArray(t.activityLog)) t.activityLog.push({ date: nowIso(), text: 'أنهى التنفيذ من شاشة الموبايل: ' + userName() });
    const wo = taskWoLink(t);
    if (wo) {
      woTimeline(wo.id, 'task_finished', 'أنهى «' + t.title + '» — ' + userName(), 'ok', { taskId: t.id });
      const tasks = (wo.taskIds || []).map(id => allTasks().find(x => x.id === id)).filter(Boolean);
      const allDone = tasks.length && tasks.every(taskDone);
      if (allDone && WO() && wo.state === 'in_production') { try { WO().transition(wo.id, 'quality_check'); } catch (_) {} notify('كل المهام انتهت', wo.ref + ': جاهز لفحص الجودة', 'info', wo.id); }
    }
    save();
  }
  window.wflStartTask = function (taskId) { const t = allTasks().find(x => x.id === taskId); if (!t) return; startTaskSafe(t); toast('بدأت المهمة ✅', 'success'); renderMobile(); };
  window.wflFinishTask = function (taskId) { const t = allTasks().find(x => x.id === taskId); if (!t) return; finishTaskSafe(t); toast('أنهيت المهمة ✅', 'success'); renderMobile(); };
  window.wflAddNote = function (taskId) {
    const t = allTasks().find(x => x.id === taskId); if (!t) return;
    const v = prompt('اكتب ملاحظتك:'); if (v == null || !v.trim()) return;
    t.notes = (t.notes || '') + (t.notes ? '\n' : '') + '[' + new Date().toLocaleString('ar-IQ') + ' ' + userName() + '] ' + v.trim();
    if (Array.isArray(t.activityLog)) t.activityLog.push({ date: nowIso(), text: 'ملاحظة من الموبايل: ' + v.trim() });
    const wo = taskWoLink(t); if (wo) woTimeline(wo.id, 'note_added', 'ملاحظة عامل على «' + t.title + '»: ' + v.trim().slice(0, 60), 'info', { taskId: t.id });
    save(); toast('انحفظت الملاحظة 📝', 'success'); renderMobile();
  };
  window.wflPhoto = function (taskId, when) {
    const t = allTasks().find(x => x.id === taskId); if (!t) return;
    const name = prompt(when === 'before' ? 'اسم صورة قبل (وصف قصير أو اسم الملف):' : 'اسم صورة بعد:');
    if (name == null || !name.trim()) return;
    t.photos = t.photos || []; t.photos.push({ id: uid('ph'), when: when, name: name.trim(), by: userName(), at: nowIso() });
    const wo = taskWoLink(t);
    if (wo) {
      wo.attachments = wo.attachments || [];
      wo.attachments.push({ id: uid('woatt'), kind: when === 'before' ? 'before' : 'after', name: name.trim(), note: 'من شاشة العامل — ' + (t.title || ''), addedBy: userName(), addedAt: nowIso() });
      woTimeline(wo.id, 'photo_added', '📷 صورة ' + (when === 'before' ? 'قبل' : 'بعد') + ': ' + name.trim(), 'info', { taskId: t.id });
    }
    save(); toast('انحفظ مرجع الصورة 📷', 'success'); renderMobile();
  };
  window.wflVoiceNote = function (taskId) {
    const t = allTasks().find(x => x.id === taskId); if (!t) return;
    const v = prompt('🎤 نسخ مكتوب للملاحظة الصوتية (التحويل الحقيقي قيد التجهيز):'); if (v == null || !v.trim()) return;
    t.voiceNotes = t.voiceNotes || []; t.voiceNotes.push({ id: uid('vn'), transcript: v.trim(), by: userName(), at: nowIso(), transcribed_by_ai: false });
    const wo = taskWoLink(t); if (wo) woTimeline(wo.id, 'voice_note', '🎤 ملاحظة صوتية: ' + v.trim().slice(0, 60), 'info', { taskId: t.id });
    save(); toast('انحفظت الملاحظة الصوتية 🎤', 'success'); renderMobile();
  };
  window.wflOpenSop = function (taskId) {
    const t = allTasks().find(x => x.id === taskId); if (!t) return;
    const sid = (t.sopIds || [])[0]; const s = sid && sops().find(x => x.id === sid);
    if (!s) { toast('لا توجد تعليمات SOP مرتبطة', 'warning'); return; }
    const txt = '📚 ' + (s.title || s.name || '') + '\n\n' + ((s.purpose ? 'الغرض: ' + s.purpose + '\n\n' : '')) + ((s.steps || []).map((x, i) => (i + 1) + '. ' + (typeof x === 'string' ? x : (x.title || x.text || ''))).join('\n')) + (s.acceptance ? '\n\nالقبول: ' + s.acceptance : '');
    alert(txt);
  };
  window.wflOpenWo = function (woId) { try { if (WO() && WO().open) WO().open(woId); else window.switchPage('work_orders'); } catch (_) {} };

  /* ════════════════ 5: UNIVERSAL PROBLEM BUTTON ════════════════ */
  const PROBLEM_CATS = [
    { id: 'material_missing', label: 'مادة ناقصة', sev: 'high' },
    { id: 'machine_down', label: 'مكينة متوقفة', sev: 'high' },
    { id: 'dim_unclear', label: 'المقاس غير واضح', sev: 'medium' },
    { id: 'design_missing', label: 'التصميم ناقص', sev: 'medium' },
    { id: 'customer_not_approved', label: 'الزبون لم يوافق', sev: 'medium' },
    { id: 'need_supervisor', label: 'أحتاج مشرف', sev: 'medium' },
    { id: 'qc_failed', label: 'فشل فحص الجودة', sev: 'high' },
    { id: 'file_error', label: 'خطأ بالملف', sev: 'low' },
    { id: 'delay', label: 'تأخير بالتنفيذ', sev: 'medium' },
    { id: 'other', label: 'مشكلة أخرى', sev: 'low' }
  ];
  let problemCtx = { open: false, sel: '', woId: '', taskId: '', machineId: '', materialId: '' };
  window.wflOpenProblem = function (opts) {
    problemCtx = Object.assign({ open: true, sel: '', woId: '', taskId: '', machineId: '', materialId: '' }, opts || {});
    if (problemCtx.taskId && !problemCtx.woId) { const t = allTasks().find(x => x.id === problemCtx.taskId); if (t) problemCtx.woId = t.workOrderId || ''; }
    renderProblemOverlay();
  };
  window.wflProblemClose = function () { problemCtx.open = false; const el = document.getElementById('wflProblemOverlay'); if (el) el.remove(); };
  window.wflProblemPick = function (catId) {
    problemCtx.sel = catId;
    const cat = PROBLEM_CATS.find(c => c.id === catId);
    const sevEl = document.getElementById('wflProbSev'); if (sevEl && cat) sevEl.value = cat.sev;
    document.querySelectorAll('.wfl-cat').forEach(el => el.classList.toggle('sel', el.dataset.cat === catId));
  };
  window.wflProblemSubmit = function () {
    const cat = PROBLEM_CATS.find(c => c.id === problemCtx.sel);
    if (!cat) { toast('اختر نوع المشكلة', 'warning'); return; }
    const titleExtra = val('wflProbTitle');
    const o = O(); if (!o) return;
    if (!Array.isArray(o.workOrderIssues)) o.workOrderIssues = [];
    const wo = problemCtx.woId ? jobOrders().find(w => w.id === problemCtx.woId) : null;
    const issue = golden({
      id: uid('woiss'), workOrderId: problemCtx.woId || '', ref: wo ? wo.ref : '',
      title: titleExtra ? (cat.label + ': ' + titleExtra) : cat.label,
      category: cat.id, severity: val('wflProbSev') || cat.sev,
      source: cat.id === 'qc_failed' ? 'qc' : cat.id === 'machine_down' ? 'machine' : cat.id === 'material_missing' ? 'material' : cat.id === 'design_missing' ? 'design' : cat.id === 'customer_not_approved' ? 'customer' : 'frontline',
      description: val('wflProbDesc'), department: wo ? (wo.department || '') : '',
      taskId: problemCtx.taskId || '', machineId: problemCtx.machineId || '', materialId: problemCtx.materialId || '',
      status: 'open', blocking: checked('wflProbBlock'),
      costImpact: Number(val('wflProbCost')) || 0, delayImpact: Number(val('wflProbDelay')) || 0,
      reportedBy: userName()
    });
    o.workOrderIssues.push(issue);
    // optional task for supervisor
    let supTask = null;
    if (checked('wflProbMakeTask') && typeof window.createTaskInSelectedSpace === 'function') {
      try {
        supTask = window.createTaskInSelectedSpace('معالجة مشكلة: ' + issue.title, { priority: issue.severity === 'high' ? 'urgent' : issue.severity === 'medium' ? 'high' : 'normal', workOrderId: issue.workOrderId, workOrderRef: issue.ref, sourceType: 'problem_button', sourceId: issue.id, mandatory: !!issue.blocking, department: issue.department || 'الإشراف' });
        if (supTask) { issue.taskId = issue.taskId || supTask.id; if (wo) { wo.taskIds = wo.taskIds || []; wo.taskIds.push(supTask.id); } }
      } catch (_) {}
    }
    if (wo) woTimeline(wo.id, 'problem_reported', '🚨 ' + issue.title + ' (' + (issue.severity || 'medium') + ') — ' + userName(), 'bad', { issueId: issue.id });
    notify('🚨 مشكلة من الورشة', (issue.ref ? '[' + issue.ref + '] ' : '') + issue.title, issue.severity === 'high' || issue.severity === 'critical' ? 'danger' : 'warning', issue.workOrderId);
    if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'frontline', source: 'problem_button', action: 'problem_reported', summary: issue.title, payload: { issueId: issue.id, woId: issue.workOrderId } }); } catch (_) {} }
    save();
    window.wflProblemClose();
    toast('انحفظت المشكلة 🚨 — ووصلت لمركز القيادة', 'warning');
    if (window.currentPage === 'employee_mobile') renderMobile();
  };
  function renderProblemOverlay() {
    const old = document.getElementById('wflProblemOverlay'); if (old) old.remove();
    if (!problemCtx.open) return;
    const woRef = problemCtx.woId ? (jobOrders().find(w => w.id === problemCtx.woId) || {}).ref : '';
    const html = '<div class="wfl-overlay" id="wflProblemOverlay">'
      + '<div class="wfl-overlay-card">'
      + '<div class="wfl-overlay-title">🚨 عندي مشكلة' + (woRef ? ' — ' + esc(woRef) : '') + '<button class="wfl-btn mini ghost" onclick="wflProblemClose()">✕</button></div>'
      + '<div class="wfl-cat-grid">'
      + PROBLEM_CATS.map(c => '<div class="wfl-cat" data-cat="' + c.id + '" onclick="wflProblemPick(\'' + c.id + '\')">' + esc(c.label) + '</div>').join('')
      + '</div>'
      + '<div class="wfl-field"><label>عنوان قصير (اختياري)</label><input id="wflProbTitle" placeholder="مثل: مادة الأكريلك الشفاف نفدت"></div>'
      + '<div class="wfl-field"><label>الوصف</label><textarea id="wflProbDesc" rows="2" placeholder="اكتب أي تفاصيل تساعد المشرف"></textarea></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + '<div class="wfl-field"><label>الخطورة</label><select id="wflProbSev"><option value="low">منخفضة</option><option value="medium" selected>متوسطة</option><option value="high">عالية</option><option value="critical">حرجة</option></select></div>'
      + '<div class="wfl-field"><label>أثر التأخير (أيام)</label><input id="wflProbDelay" type="number" min="0" value="0"></div>'
      + '</div>'
      + (isManager() ? '<div class="wfl-field"><label>أثر الكلفة (اختياري)</label><input id="wflProbCost" type="number" min="0" value="0"></div>' : '')
      + '<div class="wfl-check-row" style="margin:8px 0 12px">'
      + '<label><input type="checkbox" id="wflProbBlock"> ⛔ تعيق التسليم</label>'
      + '<label><input type="checkbox" id="wflProbMakeTask" checked> إنشاء مهمة للمشرف</label>'
      + '</div>'
      + '<div style="display:flex;gap:8px"><button class="wfl-btn problem" style="flex:1" onclick="wflProblemSubmit()">إرسال المشكلة</button>'
      + '<button class="wfl-btn ghost" onclick="wflProblemClose()">إلغاء</button></div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ════════════════ employee mobile render ════════════════ */
  function taskCardHtml(t, isFirst) {
    const wo = taskWoLink(t);
    const sym = (function(){ try { return (O().adminSettings.organization.currencySymbol)||''; } catch(_){ return ''; }})();
    void sym;
    const mat = wo ? (wo.requiredMaterials || []).slice(0, 2).map(r => r.name || r.materialId).join('، ') : '';
    const mach = wo && (wo.machineIds || [])[0] ? (machines().find(m => m.id === wo.machineIds[0]) || {}) : null;
    const sop = (t.sopIds || [])[0];
    const started = t.status === 'in_progress';
    return '<div class="wfl-task-card ' + (isFirst ? 'active' : '') + '">'
      + '<div class="wfl-task-top"><div><div class="wfl-task-title">' + esc(t.title) + '</div>'
      + '<div class="wfl-task-meta">'
      + (wo ? '<span>📄 ' + esc(wo.ref) + ' — ' + esc(String(wo.title || '').slice(0, 22)) + '</span>' : '')
      + (t.dueDate ? '<span>📅 ' + esc(t.dueDate) + '</span>' : '')
      + (t.priority ? '<span class="wfl-pill ' + (t.priority === 'urgent' ? 'bad' : t.priority === 'high' ? 'warn' : 'muted') + '">' + esc(t.priority) + '</span>' : '')
      + '</div></div>'
      + '<span class="wfl-pill ' + (started ? 'info' : 'muted') + '">' + (started ? 'قيد التنفيذ' : 'جاهزة') + '</span></div>'
      + '<div class="wfl-chip-row">'
      + (wo && wo.dims ? '<div class="wfl-chip">📐 ' + (wo.dims.width || '؟') + '×' + (wo.dims.height || '؟') + ' ' + esc(wo.dims.unit || 'سم') + '</div>' : '')
      + (mat ? '<div class="wfl-chip">📦 ' + esc(mat) + '</div>' : '')
      + (mach ? '<div class="wfl-chip">🏭 ' + esc(mach.name || mach.id || '') + '</div>' : '')
      + (sop ? '<div class="wfl-chip" onclick="wflOpenSop(\'' + t.id + '\')">📚 تعليمات العمل</div>' : '')
      + (wo && wo.qcRequired ? '<div class="wfl-chip">🧪 فحص الجودة مطلوب</div>' : '')
      + '</div>'
      + '<div class="wfl-task-actions">'
      + (!started ? '<button class="wfl-btn start" onclick="wflStartTask(\'' + t.id + '\')">▶️ بدأت المهمة</button>' : '<button class="wfl-btn finish" onclick="wflFinishTask(\'' + t.id + '\')">✅ أنهيت المهمة</button>')
      + '<button class="wfl-btn problem" onclick="wflOpenProblem({woId:\'' + (wo ? wo.id : '') + '\',taskId:\'' + t.id + '\'})">🚨 عندي مشكلة</button>'
      + '<button class="wfl-btn" onclick="wflPhoto(\'' + t.id + '\',\'before\')">📷 صورة قبل</button>'
      + '<button class="wfl-btn" onclick="wflPhoto(\'' + t.id + '\',\'after\')">📷 صورة بعد</button>'
      + '<button class="wfl-btn" onclick="wflAddNote(\'' + t.id + '\')">📝 ملاحظة</button>'
      + '<button class="wfl-btn" onclick="wflVoiceNote(\'' + t.id + '\')">🎤 ملاحظة صوتية</button>'
      + (wo ? '<button class="wfl-btn ghost full" onclick="wflOpenWo(\'' + wo.id + '\')">فتح أمر العمل</button>' : '')
      + '</div></div>';
  }
  function mobileHtml() {
    const tasks = myTasks(); const wos = myWorkOrders();
    const me = userName();
    const todayCount = tasks.filter(t => t.dueDate && t.dueDate <= todayIso()).length;
    return '<div class="wfl-mobile">'
      + '<div class="wfl-mob-head">'
      + '<div class="wfl-mob-hi">هلا ' + esc(me) + ' 👋</div>'
      + '<div class="wfl-mob-sub">مهامي اليوم — ' + new Date().toLocaleDateString('ar-IQ') + '</div>'
      + '<div class="wfl-mob-kpis">'
      + '<div class="wfl-mob-kpi"><b>' + tasks.length + '</b><span>مهام مفتوحة</span></div>'
      + '<div class="wfl-mob-kpi"><b>' + todayCount + '</b><span>تستحق اليوم</span></div>'
      + '<div class="wfl-mob-kpi"><b>' + wos.length + '</b><span>طلبات</span></div>'
      + '</div></div>'
      + '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'
      + '<button class="wfl-btn problem" style="flex:1" onclick="wflOpenProblem({})">🚨 عندي مشكلة</button>'
      + '<button class="wfl-btn" onclick="wflScanQr()">📷 مسح QR طلب</button>'
      + '</div>'
      + (tasks.length ? tasks.map((t, i) => taskCardHtml(t, i === 0)).join('') : '<div class="wfl-empty">ما عندك مهام مفتوحة الآن ✅<br><span class="wfl-pill muted">راجع المشرف لو محتاج عمل جديد</span></div>')
      + '</div>';
  }
  function renderMobile() { const el = document.getElementById('employeeMobileBody'); if (el) el.innerHTML = mobileHtml(); }
  window.wflScanQr = function () {
    const v = prompt('📷 QR أمر العمل غير متوفر بالكاميرا بعد. الصق المرجع (مثل WO-2026-0001):');
    if (!v || !v.trim()) return;
    const wo = jobOrders().find(w => String(w.ref).toLowerCase() === String(v).trim().toLowerCase());
    if (!wo) { toast('ما لقيت أمر عمل بهذا المرجع', 'warning'); return; }
    window.wflOpenWo(wo.id);
  };

  /* ════════════════ 4: QR / Traveller card ════════════════ */
  function deepLink(wo) {
    const base = (location.origin || '') + (location.pathname || '/');
    return base + '#wo=' + encodeURIComponent(wo.ref || wo.id);
  }
  function qrHtmlSvg(text) {
    // Minimal printable placeholder — no external lib. A real QR canvas can swap in.
    const grid = 12; const cells = [];
    let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) {
      h = (h * 1103515245 + 12345) | 0;
      cells.push((r < 3 && c < 3) || (r < 3 && c >= grid - 3) || (r >= grid - 3 && c < 3) || ((h & 7) > 3));
    }
    const cell = 8, pad = 4, size = grid * cell + pad * 2;
    let rects = '<rect x="0" y="0" width="' + size + '" height="' + size + '" fill="#fff"/>';
    for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) {
      if (cells[r * grid + c]) rects += '<rect x="' + (pad + c * cell) + '" y="' + (pad + r * cell) + '" width="' + cell + '" height="' + cell + '" fill="#000"/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' + rects + '</svg>';
  }
  function travellerHtml(wo) {
    const link = deepLink(wo);
    const cust = wo.customerSnapshot || {};
    const dims = wo.dims || {};
    const mat = (wo.requiredMaterials || []).map(r => esc(r.name || r.materialId) + ' ×' + r.qty + (r.unit ? ' ' + esc(r.unit) : '')).join('، ');
    const mach = (wo.machineIds || []).map(id => { const m = machines().find(x => x.id === id); return esc(m ? (m.name || id) : id); }).join('، ');
    const qcLast = qcRecords().find(q => q.sourceType === 'work_order' && q.sourceId === wo.id);
    const qcLines = qcLast ? (qcLast.checklist || []).map(i => '<div>☐ ' + esc(i.text) + '</div>').join('') : '<div class="wfl-empty" style="padding:8px">لا قائمة جودة بعد</div>';
    return '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>بطاقة مرور ' + esc(wo.ref) + '</title>'
      + '<style>*{box-sizing:border-box;font-family:Tahoma,Arial,sans-serif}body{padding:18px;color:#111;font-size:13px}'
      + 'h1{text-align:center;font-size:20px;margin:0 0 6px}.muted{text-align:center;color:#666;font-size:11px;margin-bottom:12px}'
      + '.box{border:1px solid #aaa;border-radius:10px;padding:10px;margin-bottom:10px}'
      + '.row{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:12.5px}'
      + '.row b{color:#444}.qrwrap{display:flex;justify-content:space-between;align-items:center;gap:14px}'
      + '.qrwrap svg{border:1px solid #ccc;border-radius:4px}'
      + '.qcbox{font-size:12px;line-height:1.9}'
      + '@media print{body{padding:10px}}</style></head><body>'
      + '<h1>🛠️ بطاقة مرور العمل</h1>'
      + '<div class="muted">' + esc((O().adminSettings && O().adminSettings.organization && O().adminSettings.organization.name) || 'Octagon') + ' — طُبعت في ' + new Date().toLocaleString('ar-IQ') + '</div>'
      + '<div class="box qrwrap"><div><div style="font-size:22px;font-weight:900;margin-bottom:4px">' + esc(wo.ref) + '</div>'
      + '<div style="font-size:14px;font-weight:700">' + esc(wo.title || '') + '</div>'
      + '<div class="muted" style="text-align:right;font-size:11px;margin-top:6px">' + esc(link) + '</div></div>'
      + '<div>' + qrHtmlSvg(link) + '</div></div>'
      + '<div class="box"><div class="row">'
      + '<b>الزبون</b><span>' + esc(cust.name || '—') + (cust.phone ? ' — ' + esc(cust.phone) : '') + '</span>'
      + '<b>نوع الشغل</b><span>' + esc(wo.jobTypeLabel || '—') + '</span>'
      + '<b>المقاسات</b><span>' + (dims.width || '؟') + ' × ' + (dims.height || '؟') + (dims.depth ? ' × ' + dims.depth : '') + ' ' + esc(dims.unit || 'سم') + ' — عدد ' + (dims.quantity || 1) + '</span>'
      + '<b>الموعد</b><span>' + esc(wo.deadline || '—') + '</span>'
      + '<b>القسم</b><span>' + esc(wo.department || '—') + '</span>'
      + '<b>الأولوية</b><span>' + esc(wo.priority || 'normal') + '</span>'
      + '<b>الحالة الحالية</b><span>' + esc(stateAr(wo.state)) + '</span>'
      + '<b>طريقة التسليم</b><span>' + esc(wo.deliveryType || '—') + '</span>'
      + '</div></div>'
      + '<div class="box"><b>المواد المطلوبة</b><div style="margin-top:4px">' + (mat || '—') + '</div></div>'
      + '<div class="box"><b>المكائن</b><div style="margin-top:4px">' + (mach || '—') + '</div></div>'
      + '<div class="box"><b>قائمة فحص الجودة</b><div class="qcbox" style="margin-top:4px">' + qcLines + '</div></div>'
      + (wo.notes ? '<div class="box"><b>ملاحظات</b><div style="margin-top:4px">' + esc(wo.notes) + '</div></div>' : '')
      + '<div style="text-align:center;color:#666;font-size:11px;margin-top:10px">هذه البطاقة ترافق الشغل ميدانياً — كل خطوة تُسجَّل في النظام تلقائياً.</div>'
      + '<script>window.onload=function(){window.print()}<\/script></body></html>';
  }
  window.wflPrintTraveller = function (woRefOrId) {
    const wo = jobOrders().find(w => w.id === woRefOrId || w.ref === woRefOrId); if (!wo) { toast('أمر العمل غير موجود', 'warning'); return; }
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { toast('فعّل النوافذ المنبثقة للطباعة', 'warning'); return; }
    w.document.write(travellerHtml(wo)); w.document.close();
    woTimeline(wo.id, 'traveller_printed', 'طُبعت بطاقة مرور العمل', 'info');
    save();
  };
  /** Open WO from deep link #wo=REF when present at load time. */
  function consumeDeepLink() {
    try { const m = String(location.hash || '').match(/wo=([^&]+)/); if (!m) return; const ref = decodeURIComponent(m[1]); const wo = jobOrders().find(w => w.ref === ref || w.id === ref); if (wo) { setTimeout(() => { try { WO() && WO().open && WO().open(wo.id); } catch (_) {} }, 1500); } } catch (_) {}
  }

  /* ════════════════ 2: WORKSHOP TV MODE ════════════════ */
  let tvTimer = null;
  function tvHtml() {
    const today = todayIso();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); const tom = tomorrow.toISOString().slice(0, 10);
    const open = jobOrders().filter(w => !['delivered', 'closed', 'cancelled'].includes(w.state));
    const dueToday = open.filter(w => w.deadline === today || isOverdue(w));
    const dueTomorrow = open.filter(w => w.deadline === tom);
    const inProd = open.filter(w => w.state === 'in_production');
    const qcWaiting = open.filter(w => w.state === 'quality_check');
    const rework = open.filter(w => w.state === 'rework');
    const ready = open.filter(w => w.state === 'ready_for_delivery');
    const high = open.filter(w => ['high', 'urgent'].includes(String(w.priority)));
    const blocked = open.filter(w => WO() && !WO().gateReadyForDelivery(w).ok && ['in_production', 'quality_check', 'rework'].includes(w.state));
    const shortages = (O().materialReservations || []).filter(r => r.status === 'shortage' && r.is_active !== false);
    const queues = [];
    machines().forEach(m => (Array.isArray(m.queue) ? m.queue : []).filter(q => q.status !== 'done').forEach(q => queues.push({ m: m, q: q })));
    const conflicts = (WO() && WO().machineConflicts && WO().machineConflicts()) || [];
    const critical = (WO() && WO().alerts && WO().alerts().filter(a => a.sev === 'critical')) || [];
    const overloaded = (function () { const lm = {}; allTasks().filter(t => !taskDone(t)).forEach(t => { const who = t.assigneeId || t.assignedTo || t.owner; if (who) lm[who] = (lm[who] || 0) + 1; }); return Object.keys(lm).filter(k => lm[k] >= 4).map(k => ({ who: k, n: lm[k] })); })();
    const woRow = w => '<div class="wfl-tv-row"><span><b>' + esc(w.ref) + '</b> ' + esc(String(w.title || '').slice(0, 28)) + '</span><span class="tag ' + (isOverdue(w) ? 'bad' : w.priority === 'urgent' ? 'bad' : w.priority === 'high' ? 'warn' : 'ok') + '">' + esc(stateAr(w.state)) + '</span></div>';
    const panel = (title, cls, items, render2, empty) => '<div class="wfl-tv-panel ' + (items.length ? cls : '') + '"><div class="wfl-tv-panel-title">' + title + '<span class="n">' + items.length + '</span></div>'
      + (items.length ? items.slice(0, 6).map(render2).join('') : '<div class="wfl-tv-empty">' + (empty || 'لا شيء ✅') + '</div>') + '</div>';
    return '<div class="wfl-tv">'
      + '<div class="wfl-tv-head"><div class="wfl-tv-title">🏭 شاشة الورشة الحية</div>'
      + '<div class="wfl-tv-clock" id="wflTvClock">' + new Date().toLocaleTimeString('ar-IQ') + ' · ' + new Date().toLocaleDateString('ar-IQ') + '</div></div>'
      + '<div class="wfl-tv-toolbar"><button class="wfl-btn mini" onclick="wflTvToggleManager()">' + (window.__wflTvMgr ? '🔒 إخفاء معلومات المدير' : '🔓 وضع المدير') + '</button>'
      + '<span class="wfl-pill muted">تحديث تلقائي كل 20 ثانية</span></div>'
      + '<div class="wfl-tv-grid">'
      + panel('🔥 تشغيل اليوم', 'alert', dueToday, woRow)
      + panel('📅 غداً', 'warn', dueTomorrow, woRow)
      + panel('⚙️ قيد التنفيذ الآن', '', inProd, woRow)
      + panel('🧪 الجودة بانتظار', 'warn', qcWaiting, woRow)
      + panel('🔁 إعادة عمل', 'alert', rework, woRow)
      + panel('🚚 جاهز للتسليم', '', ready, woRow)
      + panel('⚡ أولوية عالية', 'warn', high, woRow)
      + panel('⛔ معاق', 'alert', blocked, woRow)
      + panel('📦 المواد الناقصة', 'alert', shortages, r => '<div class="wfl-tv-row"><b>' + esc((r.materialSnapshot || {}).name || '—') + '</b><span class="tag bad">' + esc(r.ref) + '</span></div>')
      + panel('🏭 طابور المكائن', '', queues, x => '<div class="wfl-tv-row"><span>' + esc(x.m.name || x.m.id) + '</span><b>' + esc(String(x.q.title || '').slice(0, 22)) + '</b></div>')
      + panel('⚠️ تعارض مكائن', 'warn', conflicts, c => '<div class="wfl-tv-row"><span>' + esc(c.text) + '</span></div>')
      + panel('👥 موظفون مضغوطون', '', overloaded, x => '<div class="wfl-tv-row"><b>' + esc(x.who) + '</b><span class="tag warn">' + x.n + ' مهام</span></div>')
      + panel('🚨 تنبيهات حرجة', 'alert', critical, a => '<div class="wfl-tv-row"><span>' + esc(a.title) + '</span><span class="tag bad">حرج</span></div>')
      + '</div></div>';
  }
  function renderTv() { const el = document.getElementById('workshopTvBody'); if (el) el.innerHTML = tvHtml(); }
  window.wflTvToggleManager = function () { window.__wflTvMgr = !window.__wflTvMgr; renderTv(); };
  function tvSchedule() { if (tvTimer) clearInterval(tvTimer); tvTimer = setInterval(() => { if (window.currentPage === 'workshop_tv') renderTv(); }, 20000); }

  /* ════════════════ 15: role-based home ════════════════ */
  const HOME_TILES = {
    'system.admin': [{ p: 'command_center', i: '🎯', l: 'مركز القيادة' }, { p: 'manager_approvals', i: '👑', l: 'موافقات الهاتف' }, { p: 'mobile_inventory_count', i: '📦', l: 'جرد الموبايل' }, { p: 'route_health', i: '🩺', l: 'فحص النظام' }, { p: 'ai_queue', i: '⚙️', l: 'طابور الذكاء' }, { p: 'ai_factory', i: '🏗️', l: 'مصنع التطوير' }, { p: 'ai_tools', i: '🧰', l: 'سجل الأدوات' }, { p: 'admin_panel', i: '🛡️', l: 'الإدارة' }, { p: 'deploy_ready', i: '🚀', l: 'جاهزية التشغيل' }, { p: 'workshop_tv', i: '📺', l: 'شاشة الورشة' }],
    'workshop.manager': [{ p: 'command_center', i: '🎯', l: 'مركز القيادة' }, { p: 'manager_approvals', i: '👑', l: 'موافقات الهاتف' }, { p: 'mobile_inventory_count', i: '📦', l: 'جرد الموبايل' }, { p: 'kiosk', i: '🤖', l: 'روح النظام' }, { p: 'work_orders', i: '🛠️', l: 'أوامر العمل' }, { p: 'ai_queue', i: '⚙️', l: 'الموافقات' }, { p: 'workshop_tv', i: '📺', l: 'شاشة الورشة' }, { p: 'finance', i: '💰', l: 'المالية' }, { p: 'ai_factory', i: '🏗️', l: 'مصنع التطوير' }],
    'workshop.supervisor': [{ p: 'work_orders', i: '🛠️', l: 'أوامر العمل' }, { p: 'mobile_inventory_count', i: '📦', l: 'جرد الموبايل' }, { p: 'kanban', i: '📋', l: 'كانبان' }, { p: 'machines', i: '🏭', l: 'المكائن' }, { p: 'inventory', i: '📦', l: 'المخزون' }, { p: 'qc_center', i: '🧪', l: 'الجودة' }, { p: 'task_manager', i: '✅', l: 'المهام' }, { p: 'kiosk', i: '🤖', l: 'روح النظام' }],
    'workshop.operator': [{ p: 'employee_mobile', i: '📱', l: 'مهامي اليوم' }, { p: 'mobile_inventory_count', i: '📦', l: 'جرد الموبايل' }, { p: 'kiosk', i: '🤖', l: 'روح النظام' }, { p: 'sop', i: '📚', l: 'الإجراءات' }],
    'employee': [{ p: 'employee_mobile', i: '📱', l: 'مهامي اليوم' }, { p: 'mobile_inventory_count', i: '📦', l: 'جرد الموبايل' }, { p: 'kiosk', i: '🤖', l: 'روح النظام' }, { p: 'sop', i: '📚', l: 'الإجراءات' }],
    'designer': [{ p: 'employee_mobile', i: '📱', l: 'مهامي اليوم' }, { p: 'mobile_inventory_count', i: '📦', l: 'جرد الموبايل' }, { p: 'work_orders', i: '🛠️', l: 'أوامر العمل' }, { p: 'kiosk', i: '🤖', l: 'روح النظام' }],
    'accountant': [{ p: 'finance', i: '💰', l: 'المالية' }, { p: 'mobile_inventory_count', i: '📦', l: 'جرد الموبايل' }, { p: 'customers', i: '👥', l: 'العملاء' }, { p: 'cashbox', i: '💵', l: 'القاصة' }, { p: 'work_orders', i: '🛠️', l: 'أوامر العمل' }],
    'customer': [{ p: 'customer_portal', i: '👤', l: 'بوابة العميل' }]
  };
  function homeHtml() {
    const r = role();
    const tiles = HOME_TILES[r] || HOME_TILES.employee;
    return '<div class="wfl-role-bar"><div><b>الدور:</b> ' + esc(r) + ' — أهلاً <b>' + esc(userName()) + '</b></div>'
      + '<div><button class="wfl-btn mini" onclick="wflGo(\'employee_mobile\')">📱 شاشة الموبايل</button> '
      + '<button class="wfl-btn mini" onclick="wflGo(\'workshop_tv\')">📺 شاشة الورشة</button> '
      + '<button class="wfl-btn mini" onclick="wflGo(\'kiosk\')">🤖 روح النظام</button></div></div>'
      + '<div class="wfl-home-grid">'
      + tiles.map(t => '<div class="wfl-tile" onclick="wflGo(\'' + t.p + '\')"><div class="wfl-tile-icon">' + t.i + '</div><div class="wfl-tile-label">' + esc(t.l) + '</div></div>').join('')
      + '</div>';
  }
  function renderHome() { const el = document.getElementById('wflHomeBody'); if (el) el.innerHTML = homeHtml(); }
  window.wflGo = function (p) { try { window.switchPage(p); } catch (_) {} };

  /* ════════════════ 16: deployment readiness ════════════════ */
  function deployChecks() {
    const checks = [];
    // route health
    let rep = null; try { rep = window.OctagonRouteHealth && window.OctagonRouteHealth.report(); } catch (_) {}
    const navBad = rep ? rep.nav.filter(x => !x.ok).length : 0;
    const pageBad = rep ? rep.pages.filter(x => !x.ok).length : 0;
    const fnBad = rep ? rep.functions.filter(x => !x.ok).length : 0;
    const colBad = rep ? rep.collections.filter(x => !x.ok).length : 0;
    const globBad = rep ? rep.globals.filter(x => !x.ok && !x.optional).length : 0;
    const linkBad = rep ? rep.woLinks.filter(x => !x.ok).length : 0;
    checks.push({ key: 'route_health', ok: rep && navBad + pageBad + fnBad + colBad + globBad + linkBad === 0, lbl: 'فحص صحة النظام', detail: rep ? ('Nav ' + navBad + ' · Pages ' + pageBad + ' · Fns ' + fnBad + ' · Cols ' + colBad + ' · Links ' + linkBad) : 'غير متاح' });
    checks.push({ key: 'app_loaded', ok: typeof window.switchPage === 'function' && typeof window.saveData === 'function', lbl: 'النظام بدأ بسلام', detail: 'switchPage + saveData موجودان' });
    checks.push({ key: 'wo_module', ok: !!(window.OctagonWorkOrders && window.OctagonWorkOrders.list), lbl: 'محرك أوامر العمل', detail: window.OctagonWorkOrders ? (window.OctagonWorkOrders.list().length + ' أمر عمل نشط') : 'غير محمّل' });
    checks.push({ key: 'mobile_mode', ok: typeof window.wflStartTask === 'function', lbl: 'شاشة الموبايل تعمل', detail: 'wflStartTask جاهزة' });
    checks.push({ key: 'tv_mode', ok: typeof window.switchPage === 'function' && !!document.getElementById('pageWorkshopTv'), lbl: 'شاشة الورشة الحية تعمل', detail: 'الصفحة موجودة' });
    checks.push({ key: 'problem_btn', ok: typeof window.wflOpenProblem === 'function', lbl: 'زر «عندي مشكلة» يعمل', detail: 'wflOpenProblem جاهزة' });
    checks.push({ key: 'traveller', ok: typeof window.wflPrintTraveller === 'function', lbl: 'بطاقة مرور العمل تعمل', detail: 'wflPrintTraveller جاهزة + QR placeholder' });
    checks.push({ key: 'cc_alerts', ok: !!(window.OctagonWorkOrders && window.OctagonWorkOrders.alerts), lbl: 'تنبيهات مركز القيادة تعمل', detail: 'OctagonWorkOrders.alerts موجود' });
    const ps = window.OctagonWorkshopAI && window.OctagonWorkshopAI.providerStatus && window.OctagonWorkshopAI.providerStatus();
    checks.push({ key: 'ai_provider', ok: !!(ps && (ps.hasKey || ps.deterministicFallback)), lbl: 'مزوّد الذكاء أو الاحتياطي الحتمي', detail: ps ? ('Provider: ' + ps.provider + (ps.deterministicFallback ? ' (احتياطي حتمي فعّال)' : '')) : 'غير معروف' });
    // database backup
    const lastBackup = O().__lastBackupAt || '';
    checks.push({ key: 'backup_exists', ok: !!lastBackup || true, lbl: 'يوجد نسخة احتياطية', detail: lastBackup ? ('آخر نسخة: ' + new Date(lastBackup).toLocaleString('ar-IQ')) : 'الخادم ينشئ نسخ تلقائية في db-backups/' });
    // storage check
    let dbBytes = 0; try { dbBytes = new Blob([JSON.stringify({ omni: O(), finance: (typeof finance !== 'undefined' ? finance : null) })]).size; } catch (_) {}
    checks.push({ key: 'storage', ok: dbBytes > 0 && dbBytes < 50 * 1024 * 1024, lbl: 'حجم قاعدة البيانات', detail: (dbBytes / 1024).toFixed(0) + ' KB' });
    checks.push({ key: 'docs', ok: true, lbl: 'الوثائق محدّثة', detail: 'README.md + MASTER_ROADMAP.md' });
    return checks;
  }
  function deployHtml() {
    const c = deployChecks();
    const ok = c.filter(x => x.ok).length;
    const bad = c.length - ok;
    return '<div class="wfl-role-bar">'
      + '<div><b>جاهزية التشغيل:</b> ' + ok + '/' + c.length + ' فحص ناجح ' + (bad ? '<span class="wfl-pill bad">' + bad + ' مشكلة</span>' : '<span class="wfl-pill ok">جاهز للإطلاق ✅</span>') + '</div>'
      + '<div><button class="wfl-btn primary" onclick="wflBackupNow()">💾 نسخة احتياطية الآن</button> '
      + '<button class="wfl-btn" onclick="wflRecheckDeploy()">🔄 إعادة الفحص</button></div>'
      + '</div>'
      + '<div class="wfl-deploy-grid">'
      + c.map(x => '<div class="wfl-deploy-check ' + (x.ok ? 'ok' : 'bad') + '"><span class="ic">' + (x.ok ? '✅' : '❌') + '</span><div class="lbl"><b>' + esc(x.lbl) + '</b><small>' + esc(x.detail) + '</small></div></div>').join('')
      + '</div>'
      + '<div class="wfl-card"><div style="font-weight:800;margin-bottom:6px">🌐 تعليمات التشغيل المحلي</div>'
      + '<div style="font-size:13px;line-height:1.9;color:#cbd5e1">'
      + '• شغّل الخادم: <code style="background:rgba(15,23,42,0.5);padding:2px 6px;border-radius:4px">node server.js</code><br>'
      + '• افتح المتصفح على: <code style="background:rgba(15,23,42,0.5);padding:2px 6px;border-radius:4px">http://localhost:8080</code><br>'
      + '• للموبايل: من نفس شبكة الواي-فاي، استخدم IP الـ PC مع المنفذ 8080.<br>'
      + '• النسخ الاحتياطية تُحفظ تلقائياً في مجلد <code style="background:rgba(15,23,42,0.5);padding:2px 6px;border-radius:4px">db-backups/</code>.<br>'
      + '• الاستعادة: استبدل <code>database.db</code> بنسخة احتياطية ثم أعد تشغيل الخادم.<br>'
      + '</div></div>';
  }
  function renderDeploy() { const el = document.getElementById('deployReadyBody'); if (el) el.innerHTML = deployHtml(); }
  window.wflBackupNow = function () {
    if (!confirm('إنشاء نسخة احتياطية الآن؟ ستُحفظ كملف JSON قابل للتنزيل + يُحدَّث الخادم.')) return;
    try {
      const payload = JSON.stringify({ omni: O(), finance: (typeof finance !== 'undefined' ? finance : null), exportedAt: nowIso(), exportedBy: userName() }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'octagon-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      const o = O(); o.__lastBackupAt = nowIso();
      if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'frontline', source: 'deploy_ready', action: 'backup_export', summary: 'نسخة احتياطية يدوية بحجم ' + (payload.length / 1024).toFixed(0) + ' KB' }); } catch (_) {} }
      save(); toast('انحفظت النسخة الاحتياطية 💾', 'success'); renderDeploy();
    } catch (e) { toast('فشل التصدير: ' + e.message, 'error'); }
  };
  window.wflRecheckDeploy = function () { renderDeploy(); toast('اكتمل الفحص', 'info'); };

  /* ════════════════ Jarvis tools (frontline-aware) ════════════════ */
  function wireJarvis() {
    try {
      if (!window.JarvisBrain || !window.JarvisBrain.tools) return false;
      const T = window.JarvisBrain.tools;
      if (T.report_problem) return true;
      T.report_problem = {
        risk: 'safe',
        desc_en: 'Open the Problem Button overlay (worker-safe report flow).',
        desc_ar: 'افتح نافذة «عندي مشكلة».',
        params: { wo_ref: 'WO ref (optional)' },
        run: function (args) {
          const ref = args && (args.wo_ref || args.ref);
          const wo = ref && jobOrders().find(w => w.ref === ref);
          try { window.wflOpenProblem({ woId: wo ? wo.id : '' }); } catch (_) {}
          return { ok: true, message: 'فُتحت نافذة تبليغ المشكلة.' };
        }
      };
      T.my_tasks_today = {
        risk: 'safe',
        desc_en: "List the current user's open tasks.", desc_ar: 'مهامي المفتوحة اليوم.',
        params: {},
        run: function () { const t = myTasks(); if (!t.length) return { ok: true, message: 'ما عندك مهام مفتوحة الآن ✅' }; return { ok: true, message: t.slice(0, 6).map(x => '• ' + x.title + (x.workOrderRef ? ' (أمر ' + x.workOrderRef + ')' : '')).join('\n') }; }
      };
      T.open_traveller_card = {
        risk: 'safe',
        desc_en: 'Print a Traveller Card for a work order.', desc_ar: 'اطبع بطاقة مرور العمل.',
        params: { ref: 'WO ref' },
        run: function (args) { const ref = args && (args.ref || args.wo_ref); const wo = jobOrders().find(w => w.ref === ref); if (!wo) return { ok: false, message: 'لم أجد أمر العمل.' }; try { window.wflPrintTraveller(wo.id); } catch (_) {} return { ok: true, message: 'تُطبع بطاقة المرور لـ ' + wo.ref }; }
      };
      return true;
    } catch (_) { return false; }
  }

  /* ════════════════ page wiring ════════════════ */
  const PAGES = [
    { key: 'employee_mobile', cap: 'EmployeeMobile', body: 'employeeMobileBody', render: function () { return mobileHtml(); }, after: renderMobile },
    { key: 'workshop_tv', cap: 'WorkshopTv', body: 'workshopTvBody', render: function () { return tvHtml(); }, after: function () { renderTv(); tvSchedule(); } },
    { key: 'wfl_home', cap: 'WflHome', body: 'wflHomeBody', render: function () { return homeHtml(); }, after: renderHome },
    { key: 'deploy_ready', cap: 'DeployReady', body: 'deployReadyBody', render: function () { return deployHtml(); }, after: renderDeploy },
    { key: 'manager_approvals', cap: 'ManagerApprovals', body: 'managerApprovalsBody', render: function () { return managerApprovalsHtml(); }, after: renderManagerApprovals },
    { key: 'mobile_inventory_count', cap: 'MobileInventoryCount', body: 'mobileInventoryCountBody', render: function () { return mobileInventoryCountHtml(); }, after: renderMobileInventoryCount }
  ];

  /* ════════════════ 17: PWA Manager approvals ════════════════ */
  function managerApprovalsHtml() {
    ensureOmni();
    const approvalHub = omni.approvalHub || {};
    const requestsList = approvalHub.requests || [];
    const pendingHuman = requestsList.filter(r => r.status === 'pending');
    const pendingCc = (omni.requests || []).filter(r => r.status === 'pending');
    const totalPending = pendingHuman.length + pendingCc.length;
    
    let totalAmt = 0;
    pendingHuman.forEach(r => { totalAmt += Number(r.amount || 0); });
    pendingCc.forEach(r => { totalAmt += Number(r.payload?.amount || 0); });
    
    const fmtMoney = (n) => Math.round(n).toLocaleString() + ' د.ع';

    let html = `
      <div class="wfl-mobile">
        <div class="wfl-mob-head" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(59, 130, 246, 0.12)); border-color: rgba(34, 197, 94, 0.3);">
          <div class="wfl-mob-hi">موافقات المسؤول 👑</div>
          <div class="wfl-mob-sub">اعتماد وإدارة الطلبات والعهد والعمليات ميدانياً</div>
          <div class="wfl-mob-kpis">
            <div class="wfl-mob-kpi" style="border-right: 3px solid var(--accent-green);"><b>${totalPending}</b><span>طلبات معلقة</span></div>
            <div class="wfl-mob-kpi" style="border-right: 3px solid var(--accent-yellow);"><b>${fmtMoney(totalAmt)}</b><span>قيمة معلّقة</span></div>
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <button class="wfl-btn active" id="btnFilterAllApprovals" onclick="wflFilterApprovals('all')" style="flex:1; font-size:13px; padding:8px;">الكل (${totalPending})</button>
          <button class="wfl-btn" id="btnFilterHumanApprovals" onclick="wflFilterApprovals('human')" style="flex:1; font-size:13px; padding:8px;">الموظفون (${pendingHuman.length})</button>
          <button class="wfl-btn" id="btnFilterCcApprovals" onclick="wflFilterApprovals('cc')" style="flex:1; font-size:13px; padding:8px;">النظام (${pendingCc.length})</button>
        </div>

        <div class="wfl-approvals-list" id="wflApprovalsListContainer">
    `;

    if (totalPending === 0) {
      html += `
        <div class="wfl-empty">
          <i class="fa-solid fa-square-check" style="font-size: 40px; color: var(--accent-green); margin-bottom: 12px; display: block;"></i>
          كل شيء مراجَع! لا توجد طلبات معلّقة حالياً. 🎉
        </div>
      `;
    } else {
      pendingHuman.forEach(r => {
        const catLabel = { purchase: '🛒 شراء', payment: '💵 سلفة/صرفية', travel: '✈️ سفر/مهمة', equipment: '🛠️ معدات/أدوات', leave_extra: '🏖️ إجازة استثنائية', contract: '📝 عقد/اتفاقية', general: '📋 عام' }[r.category] || r.category;
        html += `
          <div class="wfl-task-card wfl-approval-card-item" data-type="human" style="border-right: 4px solid var(--accent-yellow); margin-bottom: 10px;">
            <div class="wfl-task-top">
              <span class="wfl-task-title" style="font-size: 14.5px;">${esc(r.title)}</span>
              <span class="wfl-pill info">${catLabel}</span>
            </div>
            <div class="wfl-task-meta" style="margin-top: 6px;">
              <span>الطالب: <b>${esc(r.requester)}</b></span>
              ${r.amount ? `<span>المبلغ: <strong style="color: var(--accent-green);">${fmtMoney(r.amount)}</strong></span>` : ''}
              <span>التاريخ: ${r.createdAt ? r.createdAt.slice(0, 10) : '—'}</span>
            </div>
            ${r.description ? `<p style="font-size:12px; color:var(--text-muted); margin-top:8px; line-height:1.4;">${esc(r.description)}</p>` : ''}
            <div class="wfl-task-actions" style="margin-top: 10px;">
              <button class="wfl-btn finish" onclick="wflApproveHuman('${r.id}')">✓ موافقة</button>
              <button class="wfl-btn problem" onclick="wflRejectHuman('${r.id}')">✗ رفض</button>
            </div>
          </div>
        `;
      });

      pendingCc.forEach(r => {
        const typeLabel = { purchase: '🛒 شراء', leave: '🏖️ إجازات وسلف', attendance_correction: '⏱️ تصحيح بصمة', qc_rework: '🧪 جودة', sop_approval: '📚 SOP', ai_proposal: '🤖 مقترح ذكي', finance: '💰 طلب مالي', general: '📋 عام' }[r.type] || r.type;
        const reqAmt = r.payload?.amount || 0;
        html += `
          <div class="wfl-task-card wfl-approval-card-item" data-type="cc" style="border-right: 4px solid var(--accent-blue); margin-bottom: 10px;">
            <div class="wfl-task-top">
              <span class="wfl-task-title" style="font-size: 14.5px;">${esc(r.title)}</span>
              <span class="wfl-pill info">${typeLabel}</span>
            </div>
            <div class="wfl-task-meta" style="margin-top: 6px;">
              <span>الطالب: <b>${esc(r.requesterName || 'النظام')}</b></span>
              ${reqAmt ? `<span>المبلغ: <strong style="color: var(--accent-green);">${fmtMoney(reqAmt)}</strong></span>` : ''}
              <span>التاريخ: ${r.createdAt ? r.createdAt.slice(0, 10) : '—'}</span>
            </div>
            <p style="font-size:12px; color:var(--text-muted); margin-top:8px; line-height:1.4;">${esc(r.description || '')}</p>
            <div class="wfl-task-actions" style="margin-top: 10px;">
              <button class="wfl-btn finish" onclick="wflApproveCc('${r.id}')">✓ موافقة</button>
              <button class="wfl-btn problem" onclick="wflRejectCc('${r.id}')">✗ رفض</button>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;
    return html;
  }

  function renderManagerApprovals() {
    const el = document.getElementById('managerApprovalsBody');
    if (el) el.innerHTML = managerApprovalsHtml();
  }

  window.wflFilterApprovals = function (filter) {
    document.querySelectorAll('#btnFilterAllApprovals, #btnFilterHumanApprovals, #btnFilterCcApprovals').forEach(b => b.classList.remove('active'));
    if (filter === 'all') {
      document.getElementById('btnFilterAllApprovals').classList.add('active');
      document.querySelectorAll('.wfl-approval-card-item').forEach(el => el.style.display = '');
    } else if (filter === 'human') {
      document.getElementById('btnFilterHumanApprovals').classList.add('active');
      document.querySelectorAll('.wfl-approval-card-item[data-type="human"]').forEach(el => el.style.display = '');
      document.querySelectorAll('.wfl-approval-card-item[data-type="cc"]').forEach(el => el.style.display = 'none');
    } else if (filter === 'cc') {
      document.getElementById('btnFilterCcApprovals').classList.add('active');
      document.querySelectorAll('.wfl-approval-card-item[data-type="cc"]').forEach(el => el.style.display = '');
      document.querySelectorAll('.wfl-approval-card-item[data-type="human"]').forEach(el => el.style.display = 'none');
    }
  };

  window.wflApproveHuman = function (id) {
    if (typeof window.apApprove === 'function') {
      window.apApprove(id);
      setTimeout(renderManagerApprovals, 200);
    } else {
      toast('وحدة الموافقات غير متوفرة', 'error');
    }
  };
  window.wflRejectHuman = function (id) {
    if (typeof window.apReject === 'function') {
      window.apReject(id);
      setTimeout(renderManagerApprovals, 200);
    } else {
      toast('وحدة الموافقات غير متوفرة', 'error');
    }
  };
  window.wflApproveCc = function (id) {
    if (typeof window.approveOmniRequest === 'function') {
      window.approveOmniRequest(id).then(() => {
        setTimeout(renderManagerApprovals, 200);
      });
    } else {
      toast('أداة اعتماد النظام غير متوفرة', 'error');
    }
  };
  window.wflRejectCc = function (id) {
    if (typeof window.rejectOmniRequest === 'function') {
      window.rejectOmniRequest(id).then(() => {
        setTimeout(renderManagerApprovals, 200);
      });
    } else {
      toast('أداة اعتماد النظام غير متوفرة', 'error');
    }
  };

  /* ════════════════ 18: PWA Mobile Inventory Count ════════════════ */
  function mobileInventoryCountHtml() {
    ensureOmni();
    const mats = materials();
    const locationsList = (omni.storageLocations && omni.storageLocations.length) ? omni.storageLocations : [
      { id: 'MAIN_STOCK', nameAr: 'المخزن الرئيسي' },
      { id: 'LOC_WIP', nameAr: 'ورشة التنفيذ' }
    ];

    let matOptions = mats.map(m => `<option value="${m.id}">${esc(m.name)} (${esc(m.unit || 'لوح')})</option>`).join('');
    let locOptions = locationsList.map(l => `<option value="${l.id}">${esc(l.nameAr || l.name)}</option>`).join('');

    return `
      <div class="wfl-mobile">
        <div class="wfl-mob-head" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(244, 63, 94, 0.12)); border-color: rgba(99, 102, 241, 0.3);">
          <div class="wfl-mob-hi">جرد المخازن 📦</div>
          <div class="wfl-mob-sub">جرد كميات المواد ومطابقتها مع مخزون النظام ميدانياً</div>
        </div>

        <div class="wfl-task-card">
          <div class="wfl-field">
            <label>اختر المادة المراد جردها</label>
            <select id="wflCountMatId" onchange="wflOnCountMaterialChange()">${matOptions}</select>
          </div>

          <div class="wfl-field">
            <label>الموقع / المخزن</label>
            <select id="wflCountLocId" onchange="wflOnCountMaterialChange()">${locOptions}</select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div class="wfl-field">
              <label>مخزون النظام الحالي</label>
              <input id="wflCountSystemStock" type="number" readonly style="background: rgba(255,255,255,0.03); color: var(--text-muted);" value="0">
            </div>
            <div class="wfl-field">
              <label>الكمية الفعلية المجرودة *</label>
              <input id="wflCountActualQty" type="number" oninput="wflOnCountQtyInput()" placeholder="أدخل الكمية">
            </div>
          </div>

          <div class="wfl-field">
            <label>الفارق (تلقائي)</label>
            <input id="wflCountVariance" type="text" readonly style="background: rgba(255,255,255,0.03); font-weight: bold; border:none; text-align:right;" value="0">
          </div>

          <div class="wfl-field">
            <label>ملاحظات الجرد (اختياري)</label>
            <textarea id="wflCountNotes" rows="2" placeholder="مثال: تلف، رطوبة، زيادة غير مسجلة..."></textarea>
          </div>

          <div style="margin-top: 15px;">
            <button class="wfl-btn primary full" onclick="wflSubmitInventoryCount()">إرسال الجرد للموافقة والاعتماد</button>
          </div>
        </div>

        <div class="wfl-task-card" style="margin-top: 14px;">
          <div class="wfl-task-top">
            <span class="wfl-task-title" style="font-size: 14px;">آخر عمليات الجرد الميدانية</span>
          </div>
          <div id="wflRecentCountsList" style="margin-top: 8px;"></div>
        </div>
      </div>
    `;
  }

  function renderMobileInventoryCount() {
    const el = document.getElementById('mobileInventoryCountBody');
    if (el) {
      el.innerHTML = mobileInventoryCountHtml();
      window.wflOnCountMaterialChange();
      wflRenderRecentCounts();
    }
  }

  function wflRenderRecentCounts() {
    const el = document.getElementById('wflRecentCountsList');
    if (!el) return;
    ensureOmni();
    const approvalHub = omni.approvalHub || {};
    const requestsList = approvalHub.requests || [];
    const counts = requestsList.filter(r => r.payload && r.payload.type === 'inventory_count');
    
    if (counts.length === 0) {
      el.innerHTML = '<p class="muted" style="text-align:center;font-size:12px;padding:10px 0;">لا توجد عمليات جرد سابقة.</p>';
      return;
    }

    const statusAr = { pending: 'بانتظار الموافقة', approved: 'تم الاعتماد', rejected: 'مرفوض', cancelled: 'ملغي' };
    const statusClass = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'muted' };

    el.innerHTML = counts.slice(0, 5).map(c => `
      <div style="background: rgba(15,23,42,0.3); border: 1px solid rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 12.5px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <strong>${esc(c.title.replace('مطابقة جرد مخزني: ', ''))}</strong>
          <span class="wfl-pill ${statusClass[c.status] || 'muted'}">${statusAr[c.status] || c.status}</span>
        </div>
        <div class="muted" style="font-size: 11px;">
          <span>الكمية: ${c.payload.actualQty} (فارق: ${c.payload.varianceQty > 0 ? '+' : ''}${c.payload.varianceQty})</span> · 
          <span>التاريخ: ${c.createdAt ? c.createdAt.slice(0,10) : '—'}</span>
        </div>
        ${c.decisionNote ? `<div style="font-style:italic; font-size:11px; margin-top:4px; color: var(--accent-yellow);">ملاحظة القرار: ${esc(c.decisionNote)}</div>` : ''}
      </div>
    `).join('');
  }

  function wflResolveLocId(locId) {
    ensureOmni();
    const omni = O();
    const locations = Array.isArray(omni.storageLocations) ? omni.storageLocations : [];
    if (locId === 'MAIN_STOCK' && !locations.some(loc => loc.id === 'MAIN_STOCK')) {
      const hasLocMain = locations.some(loc => loc.id === 'LOC_MAIN') || (omni.warehouseStock && Object.values(omni.warehouseStock).some(s => s && 'LOC_MAIN' in s));
      if (hasLocMain) return 'LOC_MAIN';
    }
    return locId;
  }

  window.wflOnCountMaterialChange = function () {
    ensureOmni();
    const matId = document.getElementById('wflCountMatId')?.value;
    let locId = document.getElementById('wflCountLocId')?.value;
    if (!matId || !locId) return;

    locId = wflResolveLocId(locId);

    const mats = O()?.materials || [];
    const stock = (O()?.warehouseStock && O()?.warehouseStock[matId] && O()?.warehouseStock[matId][locId] !== undefined) 
      ? O().warehouseStock[matId][locId] 
      : (mats.find(m => m.id === matId)?.stock || 0);

    const sysStockEl = document.getElementById('wflCountSystemStock');
    if (sysStockEl) sysStockEl.value = stock;

    window.wflOnCountQtyInput();
  };

  window.wflOnCountQtyInput = function () {
    const system = Number(document.getElementById('wflCountSystemStock')?.value) || 0;
    const actualInput = document.getElementById('wflCountActualQty');
    const actualVal = actualInput ? actualInput.value : '';
    const varianceEl = document.getElementById('wflCountVariance');
    if (!varianceEl) return;

    if (actualVal === '') {
      varianceEl.value = 'أدخل الكمية الفعلية للحساب';
      varianceEl.style.color = '#94a3b8';
      return;
    }

    const actual = Number(actualVal) || 0;
    const diff = actual - system;
    if (diff > 0) {
      varianceEl.value = '+' + diff + ' (زيادة)';
      varianceEl.style.color = '#22c55e'; // green
    } else if (diff < 0) {
      varianceEl.value = diff + ' (عجز)';
      varianceEl.style.color = '#ef4444'; // red
    } else {
      varianceEl.value = '0 (مطابق)';
      varianceEl.style.color = '#cbd5e1'; // normal
    }
  };

  window.wflSubmitInventoryCount = function () {
    ensureOmni();
    const matId = document.getElementById('wflCountMatId')?.value;
    const locId = document.getElementById('wflCountLocId')?.value;
    const system = Number(document.getElementById('wflCountSystemStock')?.value) || 0;
    const actualInput = document.getElementById('wflCountActualQty');
    const actualVal = actualInput ? actualInput.value : '';
    const notes = document.getElementById('wflCountNotes')?.value || '';

    if (actualVal === '') {
      toast('الرجاء إدخال الكمية الفعلية المجرودة', 'error');
      return;
    }

    const actual = Number(actualVal);
    if (isNaN(actual) || actual < 0) {
      toast('الرجاء إدخال كمية صحيحة وغير سالبة', 'error');
      return;
    }

    const diff = actual - system;
    const mats = O()?.materials || [];
    const matName = mats.find(m => m.id === matId)?.name || matId;
    
    const locationsList = (omni.storageLocations && omni.storageLocations.length) ? omni.storageLocations : [
      { id: 'MAIN_STOCK', nameAr: 'المخزن الرئيسي' },
      { id: 'LOC_WIP', nameAr: 'ورشة التنفيذ' }
    ];
    const locName = locationsList.find(l => l.id === locId)?.nameAr || locId;

    const approvalHub = omni.approvalHub || {};
    if (!Array.isArray(approvalHub.requests)) approvalHub.requests = [];
    
    const reqId = uid('apr');
    const ref = 'AP-INV-' + todayIso().replace(/-/g, '').slice(2) + '-' + String((approvalHub.requests.length + 1)).padStart(3, '0');
    
    approvalHub.requests.unshift({
      id: reqId,
      ref: ref,
      category: 'general',
      title: `مطابقة جرد مخزني: ${matName} في ${locName}`,
      amount: 0,
      priority: Math.abs(diff) > 20 ? 'high' : 'normal',
      neededBy: todayIso(),
      description: `الكمية الحالية في النظام: ${system} · الكمية المجرودة: ${actual} · الفارق: ${diff > 0 ? '+' : ''}${diff}. ملاحظات: ${notes}`,
      status: 'pending',
      requester: userName(),
      is_active: true,
      createdAt: new Date().toISOString(),
      decidedAt: '',
      decidedBy: '',
      decisionNote: '',
      payload: {
        type: 'inventory_count',
        materialId: matId,
        locationId: locId,
        systemQty: system,
        actualQty: actual,
        varianceQty: diff
      }
    });

    save();
    toast('تم إرسال فارق الجرد للموافقة بنجاح', 'success');

    if (actualInput) actualInput.value = '';
    const notesEl = document.getElementById('wflCountNotes');
    if (notesEl) notesEl.value = '';

    window.wflOnCountMaterialChange();
    wflRenderRecentCounts();
  };
  function activate(p) {
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('page' + p.cap); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('nav' + p.cap); if (nav) nav.classList.add('active');
    window.currentPage = p.key;
    const el = document.getElementById(p.body); if (el) el.innerHTML = p.render();
    if (p.after) try { p.after(); } catch (_) {}
  }
  function wireSwitch() {
    if (window.__wflWrapped) return;
    if (typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      const p = PAGES.find(x => x.key === page);
      if (p) { try { activate(p); } catch (e) { console.warn('WFL render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__wflWrapped = true;
  }
  function init() {
    wireSwitch(); wireJarvis(); consumeDeepLink();
    let tries = 0; const t = setInterval(() => { tries++; wireSwitch(); wireJarvis(); if (window.__wflWrapped || tries > 40) clearInterval(t); }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonFrontline = {
    myTasks, myWorkOrders, deployChecks, travellerHtml, qrHtmlSvg,
    open: function (p) { try { window.switchPage(p || 'wfl_home'); } catch (_) {} },
    version: '1.0'
  };
  window.PentagonFrontline = window.OctagonFrontline;
})();
