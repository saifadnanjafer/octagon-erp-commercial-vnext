// ═══════════════════════════════════════════════════
// EMPLOYEE PORTAL ENGINE — Sprint V1
// T4.17 de-monolith: moved verbatim out of app.js. Loads AFTER app.js —
// normalizeEmployeePortalData() is not called from ensureOmni(), so no
// forced boot-order dependency.
// ═══════════════════════════════════════════════════

function normalizeEmployeePortalData() {
  ensureOmni();
  if (!Array.isArray(omni.employeeRequests)) omni.employeeRequests = [];
  if (!Array.isArray(omni.employeeAttendance)) omni.employeeAttendance = [];
  omni.employeeRequests.forEach(req => {
    if (!req.id) req.id = makeId('req');
    if (!req.status) req.status = 'pending';
    if (!req.createdAt) req.createdAt = todayISO();
  });
}

function getPortalEmployeeId() {
  const sel = document.getElementById('empPortalSelector');
  return sel ? parseInt(sel.value) : -1;
}

function getEmployeeIdentityKeys(emp, empIdx) {
  return [empIdx, String(empIdx), emp?.id, emp?.employeeId, emp?.name]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
    .map(v => String(v).trim());
}

function employeeEntityMatches(emp, empIdx, values = []) {
  const keys = getEmployeeIdentityKeys(emp, empIdx);
  return values.some(v => keys.includes(String(v || '').trim()));
}

function employeeTaskBelongsTo(task, emp, empIdx) {
  return employeeEntityMatches(emp, empIdx, [
    task.assigneeId,
    task.employeeId,
    task.owner,
    task.assignedTo,
    task.requesterId,
    task.requesterName
  ]);
}

function getEmployeeAssignedTasks(emp, empIdx) {
  ensureOmni();
  const employee = typeof emp === 'string' ? (employees || []).find(e => e.name === emp) : emp;
  const idx = Number.isInteger(empIdx) ? empIdx : (employees || []).findIndex(e => e === employee || e.name === emp);
  if (!employee || idx < 0) return [];
  const results = [];
  (omni.kanban.cards || []).forEach(c => {
    if (employeeTaskBelongsTo(c, employee, idx)) {
      results.push({ ...c, sourceType: 'kanban', sourceLabel: 'اللوحة' });
    }
  });
  if (typeof getAllTaskManagerTasks === 'function') {
    getAllTaskManagerTasks(false).forEach(ctx => {
      if (employeeTaskBelongsTo(ctx.task, employee, idx)) {
        results.push({ ...ctx.task, sourceType: 'task_manager', sourceLabel: 'Task Manager', _context: ctx });
      }
    });
  }
  return results.sort((a, b) => {
    const urgent = p => ({ Urgent: 4, High: 3, Normal: 2, Low: 1 }[p] || 0);
    const byPriority = urgent(b.priority) - urgent(a.priority);
    if (byPriority) return byPriority;
    return String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'));
  });
}

function getEmployeeTodayAttendance(empIdx) {
  ensureOmni();
  const today = todayISO();
  return (omni.employeeAttendance || []).find(a => a.employeeIdx === empIdx && a.date === today) || null;
}

function smartEmployeeCheckInOut(empIdx) {
  ensureOmni();
  normalizeEmployeePortalData();
  const today = todayISO();
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  let att = omni.employeeAttendance.find(a => a.employeeIdx === empIdx && a.date === today);
  if (!att) {
    att = { id: makeId('att'), employeeIdx: empIdx, date: today, checkInAt: now, checkOutAt: null, status: 'checked_in', verificationMethod: 'manual_admin', verificationStatus: 'verified', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    omni.employeeAttendance.push(att);
    saveData();
    showToast('تم تسجيل الدخول بنجاح ✓', 'success');
  } else if (!att.checkOutAt) {
    att.checkOutAt = now;
    att.status = 'checked_out';
    att.updatedAt = new Date().toISOString();
    saveData();
    showToast('تم تسجيل الخروج بنجاح ✓', 'success');
  } else {
    showToast('تم تسجيل الدخول والخروج لهذا اليوم', 'info');
  }
  renderEmployeePortal();
}

function getEmployeeSalarySnapshot(empIdx) {
  const emp = employees[empIdx];
  if (!emp) return { totalCurrentSalary: 'غير متوفر', totalWithdrawnAdvances: 'غير متوفر', netAvailable: 'غير متوفر', period: '' };
  const cfg = getConfig();
  const salary = emp.salary || cfg.nominalSalary || 0;
  let totalAdvances = 0;
  (emp.records || []).forEach(r => { totalAdvances += (r.advance || 0); });
  const prevAdv = emp.prevAdvance || 0;
  return { totalCurrentSalary: salary, totalWithdrawnAdvances: totalAdvances + prevAdv, netAvailable: salary - totalAdvances - prevAdv, period: MONTHS_AR[(cfg.month - 1)] + ' ' + cfg.year };
}

function getEmployeePayrollMiniHistory(empIdx) {
  const emp = employees[empIdx];
  if (!emp) return [];
  const rows = {};
  (emp.records || []).forEach(record => {
    const month = Number(record.month || 0);
    const year = Number(record.year || 0);
    if (!month || !year) return;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!rows[key]) rows[key] = { key, month, year, workDays: 0, absentDays: 0, fridayDays: 0, advances: 0, penalties: 0, bonuses: 0, damage: 0 };
    const row = rows[key];
    const status = String(record.status || '').toLowerCase();
    if (status === 'absent' || status === 'leave') row.absentDays += 1;
    else if (status === 'friday') row.fridayDays += 1;
    else row.workDays += 1;
    row.advances += Number(record.advance || 0);
    row.penalties += Number(record.penalty || 0);
    row.bonuses += Number(record.bonus || 0);
    row.damage += Number(record.damage || 0);
  });
  return Object.values(rows)
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, 6)
    .map(row => ({
      ...row,
      label: `${MONTHS_AR[row.month - 1] || row.month} ${row.year}`,
      netPreview: Number(emp.salary || getConfig().nominalSalary || 0) + row.bonuses - row.advances - row.penalties - row.damage
    }));
}

function getEmployeePortalNotifications(empIdx, emp, centralRequests = []) {
  ensureOmni();
  const keys = getEmployeeIdentityKeys(emp, empIdx);
  const requestIds = new Set((centralRequests || []).map(r => r.id).filter(Boolean));
  return (omni.notifications || [])
    .filter(n =>
      keys.includes(String(n.targetUserId || '').trim()) ||
      keys.includes(String(n.targetName || '').trim()) ||
      (n.sourceType === 'request' && requestIds.has(n.sourceId))
    )
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 8);
}

function getEmployeePortalFeed(empIdx, emp, tasks = [], centralRequests = []) {
  const notificationItems = getEmployeePortalNotifications(empIdx, emp, centralRequests).map(n => ({
    id: n.id,
    title: n.title || getOmniNotificationTypeLabel(n.type),
    message: n.message || '',
    date: n.createdAt || '',
    status: n.status || 'read',
    kind: getOmniNotificationTypeLabel(n.type),
    actionHtml: `${n.status === 'unread' ? `<button class="btn-secondary" onclick="markOmniNotificationRead('${n.id}'); renderEmployeePortal()">تعليم كمقروء</button>` : ''}${(n.actionPage || n.sourcePage) ? `<button class="btn-primary" onclick="openOmniNotificationSource('${n.id}')">فتح</button>` : ''}`
  }));
  const requestItems = (centralRequests || []).slice(0, 6).map(r => ({
    id: r.id,
    title: r.title || getOmniRequestTypeLabel(r.type),
    message: `${getOmniRequestStatusLabel(r.status)}${r.applied ? ' / مطبق' : ''}${r.decisionNote ? ' - ' + r.decisionNote : ''}`,
    date: r.updatedAt || r.decidedAt || r.createdAt || '',
    status: r.status === 'pending' ? 'unread' : 'read',
    kind: 'طلب',
    actionHtml: `<button class="btn-primary" onclick="switchPage('command_center')">فتح مركز القيادة</button>`
  }));
  const taskItems = (tasks || []).slice(0, 6).map(t => ({
    id: t.id,
    title: t.title || 'مهمة',
    message: `${t.sourceLabel || t.sourceType} · ${t.status || '-'} · ${t.dueDate || 'بدون موعد'}`,
    date: t.dueDate || '',
    status: t.dueDate && t.dueDate <= todayISO() ? 'unread' : 'read',
    kind: 'مهمة',
    actionHtml: t.sourceType === 'kanban'
      ? `<button class="btn-primary" onclick="switchPage('kanban')">فتح اللوحة</button>`
      : `<button class="btn-primary" onclick="switchPage('task_manager')">فتح Task Manager</button>`
  }));
  return [...notificationItems, ...requestItems, ...taskItems]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 12);
}

function getEmployeeRequests(empIdx) {
  ensureOmni();
  normalizeEmployeePortalData();
  return omni.employeeRequests.filter(r => r.employeeIdx === empIdx);
}

function createEmployeeRequest(type, payload) {
  ensureOmni();
  normalizeEmployeePortalData();
  const emp = employees[payload.employeeIdx] || null;
  const orgProfile = getActiveOrgProfile();
  const req = { id: makeId('req'), employeeIdx: payload.employeeIdx, employeeId: payload.employeeIdx, employeeName: emp?.name || payload.employeeName || '', type, status: 'pending', createdAt: new Date().toISOString(), reviewedBy: '', reviewedAt: '', managerNote: '', ...payload };
  omni.employeeRequests.push(req);
  createOmniRequest({
    type: type === 'salary_statement' ? 'general' : type,
    title: req.title || 'طلب موظف',
    description: req.reason || req.notes || '',
    requesterId: String(req.employeeIdx),
    requesterName: req.employeeName || emp?.name || 'موظف',
    sourcePage: 'employee_ui',
    sourceType: 'employee_request',
    sourceId: req.id,
    companyId: orgProfile.companyId,
    companyName: orgProfile.companyName,
    currency: orgProfile.currency,
    currencySymbol: orgProfile.currencySymbol,
    priority: type === 'attendance_correction' ? 'high' : 'normal',
    payload: {
      ...req,
      employeeId: req.employeeIdx,
      employeeName: req.employeeName || emp?.name || '',
      companyContext: {
        companyId: orgProfile.companyId,
        companyName: orgProfile.companyName,
        currency: orgProfile.currency,
        currencySymbol: orgProfile.currencySymbol
      }
    }
  });
  saveData();
  showToast('تم إرسال الطلب بنجاح', 'success');
  renderEmployeePortal();
}

function getPendingEmployeeRequests() {
  ensureOmni();
  normalizeEmployeePortalData();
  return omni.employeeRequests.filter(r => r.status === 'pending');
}

function reviewEmployeeRequest(reqId, status, managerNote) {
  ensureOmni();
  const req = omni.employeeRequests.find(r => r.id === reqId);
  if (!req) return;
  req.status = status;
  req.reviewedBy = 'المدير';
  req.reviewedAt = new Date().toISOString();
  req.managerNote = managerNote || '';
  saveData();
  showToast(status === 'approved' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب', status === 'approved' ? 'success' : 'info');
}

async function addEmployeeTaskComment(taskId, sourceType) {
  const text = await showOmniPrompt('أضف ملاحظة:');
  if (!text) return;
  ensureOmni();
  if (sourceType === 'kanban') {
    const card = omni.kanban.cards.find(c => c.id === taskId);
    if (card) {
      card.comments = card.comments || [];
      card.comments.push({ date: todayISO(), text, by: 'employee_ui' });
      card.activityLog = card.activityLog || [];
      card.activityLog.push({ date: todayISO(), text: 'Employee portal comment added', by: 'employee_ui' });
      saveData();
      showToast('تمت إضافة الملاحظة', 'success');
    }
  } else if (sourceType === 'task_manager') {
    const task = typeof findTaskById === 'function' ? findTaskById(taskId) : null;
    if (task) {
      if (!Array.isArray(task.comments)) task.comments = [];
      task.comments.push({ date: new Date().toISOString(), text, by: 'employee_ui' });
      if (!Array.isArray(task.activityLog)) task.activityLog = [];
      task.activityLog.unshift({ date: new Date().toISOString(), text: 'Employee portal comment added', by: 'employee_ui' });
      saveData();
      showToast('تمت إضافة الملاحظة إلى المهمة', 'success');
    }
  }
  renderEmployeePortal();
}

function updateEmployeeTaskStatus(taskId, sourceType, newStatus) {
  ensureOmni();
  if (sourceType === 'kanban') {
    const card = omni.kanban.cards.find(c => c.id === taskId);
    if (card) {
      card.activityLog = card.activityLog || [];
      card.activityLog.push({ date: todayISO(), text: 'Employee portal status update: ' + newStatus, by: 'employee_ui' });
      if (newStatus === 'in_progress') card.columnId = (omni.kanban.columns || []).find(c => c.id === 'kb_doing')?.id || card.columnId;
      if (newStatus === 'done') card.columnId = (omni.kanban.columns || []).find(c => c.id === 'kb_review')?.id || card.columnId;
      saveData();
    }
  } else if (sourceType === 'task_manager') {
    const task = typeof findTaskById === 'function' ? findTaskById(taskId) : null;
    if (task) {
      const statusMap = { in_progress: 'in_progress', done: 'done' };
      task.status = statusMap[newStatus] || newStatus;
      if (task.status === 'done') task.completedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();
      if (!Array.isArray(task.activityLog)) task.activityLog = [];
      task.activityLog.unshift({ date: new Date().toISOString(), text: 'Employee portal status update: ' + task.status, by: 'employee_ui' });
      saveData();
    }
  }
  showToast('تم تحديث حالة المهمة من لوحة الموظف', 'success');
  renderEmployeePortal();
}

async function submitLeaveRequest(empIdx) {
  const html = `<div style="display:flex;flex-direction:column;gap:10px;">
    <label>نوع الإجازة</label>
    <select id="leaveType" class="form-input"><option value="سنوية">سنوية</option><option value="مرضية">مرضية</option><option value="طارئة">طارئة</option><option value="بدون راتب">بدون راتب</option></select>
    <label>من تاريخ</label><input type="date" id="leaveFrom" class="form-input" value="${todayISO()}">
    <label>إلى تاريخ</label><input type="date" id="leaveTo" class="form-input" value="${todayISO()}">
    <label>السبب</label><input type="text" id="leaveReason" class="form-input" placeholder="سبب الإجازة">
    <label>ملاحظات</label><input type="text" id="leaveNotes" class="form-input" placeholder="اختياري">
  </div>`;
  const r = await showOmniModal('طلب إجازة', html, (body) => {
    return { leaveType: body.querySelector('#leaveType').value, dateFrom: body.querySelector('#leaveFrom').value, dateTo: body.querySelector('#leaveTo').value, reason: body.querySelector('#leaveReason').value, notes: body.querySelector('#leaveNotes').value };
  });
  if (!r) return;
  createEmployeeRequest('leave', { employeeIdx: empIdx, title: 'طلب إجازة ' + r.leaveType, leaveType: r.leaveType, dateFrom: r.dateFrom, dateTo: r.dateTo, reason: r.reason, notes: r.notes });
}

async function submitAdvanceRequest(empIdx) {
  const html = `<div style="display:flex;flex-direction:column;gap:10px;">
    <label>المبلغ المطلوب (IQD)</label><input type="number" id="advAmount" class="form-input" placeholder="مثال: 500000">
    <label>سبب السلفة</label><input type="text" id="advReason" class="form-input" placeholder="السبب">
    <label>ملاحظات</label><input type="text" id="advNotes" class="form-input" placeholder="اختياري">
  </div>`;
  const r = await showOmniModal('طلب سلفة', html, (body) => {
    const amount = parseInt(body.querySelector('#advAmount').value) || 0;
    if (amount <= 0) return false;
    return { amount, reason: body.querySelector('#advReason').value, notes: body.querySelector('#advNotes').value };
  });
  if (!r) return;
  createEmployeeRequest('advance', { employeeIdx: empIdx, title: 'طلب سلفة: ' + r.amount.toLocaleString() + ' د.ع', amount: r.amount, reason: r.reason, notes: r.notes });
}

function submitSalaryStatementRequest(empIdx) {
  createEmployeeRequest('salary_statement', { employeeIdx: empIdx, title: 'طلب كشف حساب كامل', requestedScope: 'full_statement', reason: 'مراجعة شخصية' });
}

async function submitAttendanceCorrectionRequest(empIdx) {
  const html = `<div style="display:flex;flex-direction:column;gap:10px;">
    <label>تاريخ التصحيح</label><input type="date" id="corrDate" class="form-input" value="${todayISO()}">
    <label>وقت الدخول المصحح</label><input type="time" id="corrIn" class="form-input" value="09:00">
    <label>وقت الخروج المصحح</label><input type="time" id="corrOut" class="form-input" value="18:00">
    <label>السبب</label><input type="text" id="corrReason" class="form-input" placeholder="سبب التصحيح">
    <label>ملاحظات</label><input type="text" id="corrNotes" class="form-input" placeholder="اختياري">
  </div>`;
  const r = await showOmniModal('طلب تصحيح بصمة', html, body => ({
    date: body.querySelector('#corrDate')?.value || todayISO(),
    correctedInTime: body.querySelector('#corrIn')?.value || '',
    correctedOutTime: body.querySelector('#corrOut')?.value || '',
    reason: body.querySelector('#corrReason')?.value || 'تصحيح سجل الحضور',
    notes: body.querySelector('#corrNotes')?.value || ''
  }));
  if (!r) return;
  createEmployeeRequest('attendance_correction', { employeeIdx: empIdx, title: `طلب تصحيح بصمة ${r.date}`, date: r.date, correctedInTime: r.correctedInTime, correctedOutTime: r.correctedOutTime, reason: r.reason, notes: r.notes });
}

function renderEmployeePortal() {
  ensureOmni();
  normalizeEmployeePortalData();
  const body = document.getElementById('employeePortalBody');
  const sel = document.getElementById('empPortalSelector');
  if (!body || !sel) return;

  // Populate selector
  const curVal = sel.value;
  sel.innerHTML = '<option value="">— اختر موظف —</option>';
  employees.forEach((emp, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = emp.name;
    sel.appendChild(opt);
  });
  if (curVal !== '') sel.value = curVal;

  const empIdx = getPortalEmployeeId();
  if (empIdx < 0 || !employees[empIdx]) {
    body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:60px 20px;font-size:16px;"><i class="fa-solid fa-user-lock" style="font-size:40px;display:block;margin-bottom:15px;"></i>اختر موظفاً من القائمة أعلاه لعرض لوحته الشخصية</p>';
    return;
  }

  const emp = employees[empIdx];
  const att = getEmployeeTodayAttendance(empIdx);
  const tasks = getEmployeeAssignedTasks(emp, empIdx);
  const salary = getEmployeeSalarySnapshot(empIdx);
  const requests = getEmployeeRequests(empIdx);
  const centralRequests = (omni.requests || []).filter(r => String(r.requesterId) === String(empIdx) || r.requesterName === emp.name || (r.payload && Number(r.payload.employeeId ?? r.payload.employeeIdx) === empIdx));
  const notifications = getEmployeePortalNotifications(empIdx, emp, centralRequests);
  const feedItems = getEmployeePortalFeed(empIdx, emp, tasks, centralRequests);
  const payrollHistory = getEmployeePayrollMiniHistory(empIdx);
  const openTasks = tasks.filter(t => !['Done', 'done', 'مكتمل'].includes(String(t.status || '')));
  const pendingReqs = requests.filter(r => r.status === 'pending');
  const unreadNotifications = notifications.filter(n => n.status === 'unread').length;
  const todayStr = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const orgProfile = getActiveOrgProfile();

  let attStatus = 'لم يسجل دخول';
  let attColor = '#f87171';
  let attAction = `<button class="btn-primary" onclick="smartEmployeeCheckInOut(${empIdx})" style="margin-top:8px;width:100%;">تسجيل دخول</button>`;
  if (att && att.checkOutAt) { attStatus = 'تم تسجيل الخروج'; attColor = '#34d399'; attAction = '<p style="color:#34d399;margin-top:8px;">✓ اكتمل الدوام</p>'; }
  else if (att && att.checkInAt) { attStatus = 'داخل الدوام'; attColor = '#38bdf8'; attAction = `<button class="btn-primary" onclick="smartEmployeeCheckInOut(${empIdx})" style="margin-top:8px;width:100%;background:var(--accent-yellow);">تسجيل خروج</button>`; }

  const priorityBadge = (p) => { const m = { Urgent: 'ep-badge-rejected', High: 'ep-badge-pending', Normal: 'ep-badge-open', Low: 'ep-badge-approved' }; return `<span class="etask-badge ${m[p] || 'ep-badge-open'}">${p}</span>`; };
  const reqStatusAr = { pending: 'قيد المراجعة', approved: 'موافق عليه', rejected: 'مرفوض' };
  const reqTypeAr = { leave: 'إجازة', advance: 'سلفة', salary_statement: 'كشف حساب', attendance_correction: 'تصحيح بصمة' };

  body.innerHTML = `
    <!-- Status Bar -->
    <div class="employee-portal-status-card">
      <div class="employee-portal-status-item"><div class="ep-label">حالة الدوام</div><div class="ep-value" style="color:${attColor};">${attStatus}</div></div>
      <div class="employee-portal-status-item"><div class="ep-label">مهامي المفتوحة</div><div class="ep-value">${openTasks.length}</div></div>
      <div class="employee-portal-status-item"><div class="ep-label">طلبات قيد المراجعة</div><div class="ep-value">${pendingReqs.length}</div></div>
      <div class="employee-portal-status-item"><div class="ep-label">إشعاراتي</div><div class="ep-value">${unreadNotifications}</div></div>
      <div class="employee-portal-status-item"><div class="ep-label">التاريخ</div><div class="ep-value" style="font-size:13px;">${todayStr}</div></div>
    </div>

    <!-- Main Cards Grid -->
    <div class="employee-portal-grid">

      <!-- بصمة اليوم -->
      <div class="employee-action-card">
        <div class="eac-header"><div class="eac-icon">🕐</div><div class="eac-title">بصمة اليوم</div></div>
        <div class="eac-body">
          <p>آخر دخول: <b>${att?.checkInAt || '—'}</b></p>
          <p>آخر خروج: <b>${att?.checkOutAt || '—'}</b></p>
          ${attAction}
          <button class="btn-secondary" onclick="submitAttendanceCorrectionRequest(${empIdx})" style="margin-top:6px;width:100%;font-size:12px;">طلب تصحيح بصمة</button>
        </div>
      </div>

      <!-- مهامي -->
      <div class="employee-action-card">
        <div class="eac-header"><div class="eac-icon">📋</div><div class="eac-title">مهامي</div></div>
        <div class="eac-body">
          ${tasks.length === 0 ? '<p style="color:var(--text-muted);">لا توجد مهام مخصصة لك حالياً.</p>' : tasks.slice(0, 5).map(t => `
            <div class="employee-task-card">
              <span class="etask-title">${escapeHtml(t.title || '')}<small>${escapeHtml(t.sourceLabel || t.sourceType)} · ${escapeHtml(t.status || '-')} · ${escapeHtml(t.dueDate || 'بدون موعد')}</small></span>
              ${priorityBadge(t.priority || 'Normal')}
              <div style="display:flex;gap:4px;">
                <button class="btn-primary" onclick="updateEmployeeTaskStatus('${t.id}','${t.sourceType}','in_progress')" style="font-size:10px;padding:2px 6px;" title="بدء">▶</button>
                <button class="btn-primary" onclick="updateEmployeeTaskStatus('${t.id}','${t.sourceType}','done')" style="font-size:10px;padding:2px 6px;background:var(--accent-green);" title="إنهاء">✓</button>
                <button class="btn-secondary" onclick="addEmployeeTaskComment('${t.id}','${t.sourceType}')" style="font-size:10px;padding:2px 6px;" title="ملاحظة">💬</button>
              </div>
            </div>
          `).join('') + (tasks.length > 5 ? `<p style="color:var(--text-muted);font-size:12px;">و ${tasks.length - 5} مهام أخرى...</p>` : '')}
        </div>
      </div>

      <!-- راتبي وسلفي -->
      <div class="employee-action-card">
        <div class="eac-header"><div class="eac-icon">💰</div><div class="eac-title">راتبي وسلفي</div></div>
        <div class="eac-body">
          <p class="employee-org-context"><b>${escapeHtml(orgProfile.companyName)}</b><span>${escapeHtml(orgProfile.currency)} / ${escapeHtml(orgProfile.currencySymbol)}</span></p>
          <p>الفترة: <b>${salary.period}</b></p>
          <p>الراتب الكلي: <b>${typeof salary.totalCurrentSalary === 'number' ? formatAdminMoney(salary.totalCurrentSalary) : salary.totalCurrentSalary}</b></p>
          <p>مجموع السلف: <b>${typeof salary.totalWithdrawnAdvances === 'number' ? formatAdminMoney(salary.totalWithdrawnAdvances) : salary.totalWithdrawnAdvances}</b></p>
          <p>صافي المتاح: <b style="color:var(--accent-green);">${typeof salary.netAvailable === 'number' ? formatAdminMoney(salary.netAvailable) : salary.netAvailable}</b></p>
          <button class="btn-secondary" onclick="submitSalaryStatementRequest(${empIdx})" style="margin-top:8px;width:100%;font-size:12px;">طلب كشف حساب كامل</button>
        </div>
      </div>

      <div class="employee-action-card">
        <div class="eac-header"><div class="eac-icon"><i class="fa-solid fa-receipt"></i></div><div class="eac-title">سجل الراتب</div></div>
        <div class="eac-body employee-payroll-history">
          ${payrollHistory.length ? payrollHistory.map(row => `
            <div class="employee-payroll-row">
              <div><b>${escapeHtml(row.label)}</b><small>${row.workDays} دوام · ${row.absentDays} غياب · ${row.fridayDays} جمعة</small></div>
              <div>${formatAdminMoney(Math.round(row.netPreview))}</div>
            </div>
          `).join('') : '<p style="color:var(--text-muted);">لا توجد سجلات راتب سابقة لهذا الموظف.</p>'}
        </div>
      </div>

      <!-- طلب إجازة -->
      <div class="employee-action-card">
        <div class="eac-header"><div class="eac-icon">🏖️</div><div class="eac-title">طلب إجازة</div></div>
        <div class="eac-body">
          <p>أنشئ طلب إجازة جديد يراجعه المسؤول.</p>
          <button class="btn-primary" onclick="submitLeaveRequest(${empIdx})" style="margin-top:8px;width:100%;">تقديم طلب إجازة</button>
        </div>
      </div>

      <!-- طلب سلفة -->
      <div class="employee-action-card">
        <div class="eac-header"><div class="eac-icon">🏦</div><div class="eac-title">طلب سلفة</div></div>
        <div class="eac-body">
          <p>أنشئ طلب سلفة مالية يراجعه المسؤول.</p>
          <button class="btn-primary" onclick="submitAdvanceRequest(${empIdx})" style="margin-top:8px;width:100%;">تقديم طلب سلفة</button>
        </div>
      </div>

      <!-- طلباتي -->
      <div class="employee-action-card" style="grid-column: span 2;">
        <div class="eac-header"><div class="eac-icon">📄</div><div class="eac-title">طلباتي</div></div>
        <div class="eac-body">
          ${centralRequests.length === 0 && requests.length === 0 ? '<p style="color:var(--text-muted);">لا توجد طلبات مقدمة.</p>' : `
            <div class="employee-request-row"><div>نوع الطلب</div><div>التاريخ</div><div>الحالة</div><div>قرار المسؤول</div><div>ملاحظات</div></div>
            ${centralRequests.map(r => `<div class="employee-request-row">
              <div>${getOmniRequestTypeLabel(r.type)}</div>
              <div>${r.createdAt ? r.createdAt.slice(0, 10) : '—'}</div>
              <div><span class="etask-badge ep-badge-${r.status}">${getOmniRequestStatusLabel(r.status)}${r.applied ? ' / مطبق' : ''}</span></div>
              <div>${r.decidedBy || '—'}</div>
              <div>${r.decisionNote || r.appliedResult?.message || r.appliedResult?.type || r.description || '—'}</div>
            </div>`).join('') || requests.map(r => `<div class="employee-request-row">
              <div>${reqTypeAr[r.type] || r.type}</div>
              <div>${r.createdAt ? r.createdAt.slice(0, 10) : '—'}</div>
              <div><span class="etask-badge ep-badge-${r.status}">${reqStatusAr[r.status] || r.status}</span></div>
              <div>${r.reviewedBy || '—'}</div>
              <div>${r.managerNote || r.reason || '—'}</div>
            </div>`).join('')}
          `}
          ${(() => {
            const mine = (omni.notifications || []).filter(n => n.sourceType === 'request' && centralRequests.some(r => r.id === n.sourceId)).slice(0, 5);
            return mine.length ? `<div class="employee-notification-mini">${mine.map(n => `<div class="employee-request-row"><div>${escapeHtml(n.title)}</div><div>${n.createdAt ? n.createdAt.slice(0,10) : '—'}</div><div>${n.status === 'unread' ? 'غير مقروء' : 'مقروء'}</div><div>${escapeHtml(n.message || '')}</div><div>${escapeHtml(getOmniNotificationTypeLabel(n.type))}</div></div>`).join('')}</div>` : '';
          })()}
        </div>
      </div>
      <div class="employee-action-card employee-feed-card" style="grid-column: span 2;">
        <div class="eac-header"><div class="eac-icon"><i class="fa-solid fa-bell"></i></div><div class="eac-title">مركز إشعاراتي</div></div>
        <div class="eac-body employee-feed-list">
          ${feedItems.length ? feedItems.map(item => `
            <div class="employee-feed-item ${item.status === 'unread' ? 'is-unread' : ''}">
              <div>
                <b>${escapeHtml(item.title || '')}</b>
                <p>${escapeHtml(item.message || '')}</p>
                <small>${escapeHtml(item.kind || '')} · ${item.date ? formatOmniDateTime(item.date) : '-'}</small>
              </div>
              <div class="employee-feed-actions">
                ${item.actionHtml || ''}
              </div>
            </div>
          `).join('') : '<p style="color:var(--text-muted);">لا توجد إشعارات أو مهام شخصية لهذا الموظف بعد.</p>'}
        </div>
      </div>
    </div>
  `;
}
