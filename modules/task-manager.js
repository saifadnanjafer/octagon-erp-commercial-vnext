function getSelectedSpace() {
  ensureOmni();
  return omni.taskManager.spaces.find(s => s.id === omni.taskManager.selectedSpaceId) || omni.taskManager.spaces[0];
}


let taskManagerViewMode = 'tree';
function findTaskDepartment(spaceId, depId) { return omni.taskManager.spaces.find(s => s.id === spaceId)?.departments.find(d => d.id === depId); }
function findTaskSection(spaceId, depId, secId) { return findTaskDepartment(spaceId, depId)?.sections.find(s => s.id === secId); }
function findTaskType(spaceId, depId, secId, typeId) { return findTaskSection(spaceId, depId, secId)?.taskTypes.find(t => t.id === typeId); }
function findTaskById(taskId) { ensureOmni(); for (const space of omni.taskManager.spaces) for (const dep of space.departments) for (const sec of dep.sections) for (const type of sec.taskTypes) { const task = type.tasks.find(t => t.id === taskId); if (task) return task; } return null; }

// ═══════════ TASK MANAGER V2 — CLICKUP-STYLE WORK OS ═══════════
const TASK_MANAGER_STATUS = [
  { value: 'todo', label: 'مطلوب', color: '#94a3b8' },
  { value: 'in_progress', label: 'قيد التنفيذ', color: '#38bdf8' },
  { value: 'review', label: 'مراجعة', color: '#fbbf24' },
  { value: 'done', label: 'مكتمل', color: '#34d399' },
  { value: 'blocked', label: 'متوقف', color: '#f87171' }
];
const TASK_MANAGER_PRIORITY = [
  { value: 'low', label: 'منخفضة', color: '#94a3b8' },
  { value: 'normal', label: 'طبيعية', color: '#38bdf8' },
  { value: 'high', label: 'عالية', color: '#fbbf24' },
  { value: 'urgent', label: 'عاجلة', color: '#f87171' }
];
let taskManagerFilters = { search: '', department: 'all', assigneeId: 'all', status: 'all', priority: 'all', due: 'all', linked: 'all', source: 'all', opPackId: 'all' };
taskManagerViewMode = localStorage.getItem('task_manager_view_v2') || 'list';

const TASK_SOURCE_METADATA = {
  all: { label: 'الكل', icon: 'fa-cubes', color: '#64748b' },
  manual: { label: 'يدوي', icon: 'fa-keyboard', color: '#64748b' },
  op_pack: { label: 'باقة عمليات', icon: 'fa-box-open', color: '#38bdf8' },
  intelligence: { label: 'ذكاء تشغيلي', icon: 'fa-brain', color: '#a855f7' },
  workflow: { label: 'مسار عمل', icon: 'fa-route', color: '#10b981' },
  qc: { label: 'إعادة عمل / جودة', icon: 'fa-microscope', color: '#f43f5e' },
  kanban: { label: 'لوحة كانبان', icon: 'fa-table-columns', color: '#eab308' },
  recurring: { label: 'مهمة متكررة', icon: 'fa-arrows-spin', color: '#f97316' }
};

function getTaskSourceType(task) {
  if (task.recurring && task.recurring.enabled) return 'recurring';
  if ((task.qcRecordIds || []).length > 0) return 'qc';
  if (task.workflowNodeId) return 'workflow';
  if (task.operationPackId) return 'op_pack';
  if (['intelligence', 'intelligence_agent', 'prediction', 'anomaly'].includes(task.sourceType)) return 'intelligence';
  if (task.kanbanCardId) return 'kanban';
  return 'manual';
}

function normalizeTaskStatus(status) {
  const s = String(status || '').toLowerCase().trim();
  if (['done', 'closed', 'complete', 'completed', 'مكتمل'].includes(s)) return 'done';
  if (['in progress', 'in_progress', 'working', 'قيد التنفيذ'].includes(s)) return 'in_progress';
  if (['review', 'مراجعة'].includes(s)) return 'review';
  if (['blocked', 'متوقف'].includes(s)) return 'blocked';
  return 'todo';
}
function normalizeTaskPriority(priority) {
  const p = String(priority || '').toLowerCase().trim();
  if (['urgent', 'حرج', 'عاجل', 'عاجلة'].includes(p)) return 'urgent';
  if (['high', 'عالي', 'عالية'].includes(p)) return 'high';
  if (['low', 'منخفض', 'منخفضة'].includes(p)) return 'low';
  return 'normal';
}
function normalizeTaskManagerV2() {
  if (!omni.taskManager) omni.taskManager = { spaces: [] };
  if (!Array.isArray(omni.taskManager.spaces)) omni.taskManager.spaces = [];
  (omni.taskManager.spaces || []).forEach(space => {
    if (!space.id) space.id = makeId('space');
    if (!Array.isArray(space.departments)) space.departments = [];
    (space.departments || []).forEach(dep => {
      if (!dep.id) dep.id = makeId('dep');
      if (!Array.isArray(dep.sections)) dep.sections = [];
      (dep.sections || []).forEach(sec => {
        if (!sec.id) sec.id = makeId('sec');
        if (!Array.isArray(sec.taskTypes)) sec.taskTypes = [];
        (sec.taskTypes || []).forEach(type => {
          if (!type.id) type.id = makeId('type');
          if (!Array.isArray(type.tasks)) type.tasks = [];
          (type.tasks || []).forEach(task => {
            if (!task.id) task.id = makeId('task');
            if (!task.title) task.title = 'مهمة جديدة';
            task.description = task.description || '';
            task.status = normalizeTaskStatus(task.status);
            task.priority = normalizeTaskPriority(task.priority);
            task.dueDate = task.dueDate || '';
            task.startDate = task.startDate || '';
            task.completedAt = task.completedAt || '';
            task.owner = task.owner || task.assignedTo || '';
            task.assigneeId = task.assigneeId || task.employeeId || '';
            task.assignedTo = task.assignedTo || task.owner || '';
            task.employeeId = task.employeeId || task.assigneeId || '';
            task.department = task.department || dep.name || '';
            task.section = task.section || sec.name || '';
            task.category = task.category || type.name || '';
            ['tags','checklist','subtasks','comments','activityLog','dependencies','attachments','sopIds','machineIds','materialRequirements','qcRecordIds'].forEach(key => { if (!Array.isArray(task[key])) task[key] = []; });
            task.kanbanCardId = task.kanbanCardId || '';
            task.workflowId = task.workflowId || '';
            task.workflowNodeId = task.workflowNodeId || '';
            task.operationPackId = task.operationPackId || '';
            task.operationPackStepId = task.operationPackStepId || '';
            task.orderId = task.orderId || '';
            task.sourceType = task.sourceType || 'task_manager';
            task.sourceId = task.sourceId || task.id;
            task.estimatedMinutes = Number(task.estimatedMinutes || task.estimatedMins || 0) || 0;
            task.archived = Boolean(task.archived);
            task.archivedAt = task.archivedAt || '';
            task.deleted = Boolean(task.deleted);
            task.deletedAt = task.deletedAt || '';
            if (!task.recurring || typeof task.recurring !== 'object') task.recurring = { enabled: false, frequency: 'weekly', nextDate: '', templateTaskId: '' };
          });
        });
      });
    });
  });
  if (!omni.migrationsApplied.includes('task_manager_v2')) omni.migrationsApplied.push('task_manager_v2');
}
function autoGenerateMaintenanceTasks() {
  ensureOmni();

  if (window.__inMaintenanceGeneration) return;
  window.__inMaintenanceGeneration = true;

  try {
    const allTasks = getAllTaskManagerTasks(true).map(x => x.task);
    let generatedCount = 0;
    const today = todayISO();

    const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
    const addDays = (iso, n) => {
      const d = new Date(iso);
      if (isNaN(d)) return '';
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    // 1. Fixed Assets Maintenance Tasks
    if (omni.assetRegister && Array.isArray(omni.assetRegister.assets)) {
      omni.assetRegister.assets.forEach(a => {
        if (a.is_active === false) return;
        const interval = Math.round(Number(a.maintenanceIntervalDays) || 0);
        if (!interval) return;

        const base = a.lastMaintenanceDate || a.acquisitionDate || today;
        const nextDate = addDays(base, interval);
        const days = daysBetween(today, nextDate);
        const isDueOrOverdue = days <= 7;

        if (isDueOrOverdue) {
          const exists = allTasks.some(t => t.linkedAssetId === a.id && t.dueDate === nextDate);
          if (!exists) {
            const patch = {
              linkedAssetId: a.id,
              machineIds: a.category === 'machine' ? [a.id] : [],
              priority: 'high',
              dueDate: nextDate,
              description: `صيانة دورية مجدولة تلقائياً للأصل: ${a.name}\nالرقم التسلسلي: ${a.serialNumber || '—'}\nالموقع: ${a.location || '—'}\nآخر صيانة: ${a.lastMaintenanceDate || '—'}\nدورة الصيانة: كل ${a.maintenanceIntervalDays} يوم`
            };
            createTaskInSelectedSpace(`صيانة وقائية: ${a.name}`, patch);
            generatedCount++;
          }
        }
      });
    }

    // 2. Equipment Maintenance / Repair Tasks
    if (Array.isArray(omni.equipment)) {
      omni.equipment.forEach(eq => {
        const needsMaint = ['maintenance', 'broken'].includes(eq.status);
        if (needsMaint) {
          const exists = allTasks.some(t => t.linkedEquipmentId === eq.id && t.status !== 'done');
          if (!exists) {
            const patch = {
              linkedEquipmentId: eq.id,
              priority: 'high',
              dueDate: today,
              description: `صيانة مطلوبة للمعدة: ${eq.name}\nالباركود: ${eq.barcode || '—'}\nالموقع: ${eq.location || '—'}\nالحالة الحالية: ${eq.status === 'maintenance' ? 'تحت الصيانة' : 'عاطلة / تالفة'}\nملاحظات: ${eq.notes || '—'}`
            };
            createTaskInSelectedSpace(`صيانة معدات: ${eq.name}`, patch);
            generatedCount++;
          }
        }
      });
    }

    if (generatedCount > 0) {
      saveData();
      console.log(`Auto-generated ${generatedCount} maintenance tasks in Task Manager.`);
    }
  } catch (err) {
    console.error("autoGenerateMaintenanceTasks error:", err);
  } finally {
    window.__inMaintenanceGeneration = false;
  }
}
function setTaskManagerViewMode(mode) { taskManagerViewMode = mode || 'list'; localStorage.setItem('task_manager_view_v2', taskManagerViewMode); renderTaskManager(); }
function getTaskManagerViewMode() { return taskManagerViewMode || 'list'; }
function toggleTaskManagerView() { setTaskManagerViewMode(taskManagerViewMode === 'list' ? 'board' : 'list'); }
function getAllTaskManagerTasks(includeArchived = false) {
  ensureOmni();
  const rows = [];
  (omni.taskManager.spaces || []).forEach(space => (space.departments || []).forEach(dep => (dep.sections || []).forEach(sec => (sec.taskTypes || []).forEach(type => (type.tasks || []).forEach(task => {
    if (task.deleted) return;
    if (!includeArchived && task.archived) return;
    rows.push({ task, space, dep, sec, type });
  })))));
  return rows;
}
function taskManagerTaskIsOverdue(task) { return !!task.dueDate && task.dueDate < todayISO() && task.status !== 'done'; }
function taskStatusMeta(status) { return TASK_MANAGER_STATUS.find(s => s.value === normalizeTaskStatus(status)) || TASK_MANAGER_STATUS[0]; }
function taskPriorityMeta(priority) { return TASK_MANAGER_PRIORITY.find(p => p.value === normalizeTaskPriority(priority)) || TASK_MANAGER_PRIORITY[1]; }
function updateTaskManagerFilters(patch) { taskManagerFilters = { ...taskManagerFilters, ...(patch || {}) }; renderTaskManager(); }
function resetTaskManagerFilters() { taskManagerFilters = { search: '', department: 'all', assigneeId: 'all', status: 'all', priority: 'all', due: 'all', linked: 'all', source: 'all', opPackId: 'all' }; renderTaskManager(); }
function taskMatchesTaskManagerFilters(task, filters = taskManagerFilters) {
  const q = String(filters.search || '').trim().toLowerCase();
  if (q && ![task.title, task.description, task.owner, task.assignedTo, task.department, task.section, task.category, ...(task.tags || [])].join(' ').toLowerCase().includes(q)) return false;
  if (filters.department !== 'all' && task.department !== filters.department) return false;
  if (filters.status !== 'all' && task.status !== filters.status) return false;
  if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
  if (filters.assigneeId === 'none' && (task.assigneeId || task.owner || task.assignedTo)) return false;
  if (filters.assigneeId !== 'all' && filters.assigneeId !== 'none' && ![task.assigneeId, task.employeeId, task.owner, task.assignedTo].map(v => String(v || '')).includes(String(filters.assigneeId))) return false;
  if (filters.due === 'overdue' && !taskManagerTaskIsOverdue(task)) return false;
  if (filters.due === 'today' && task.dueDate !== todayISO()) return false;
  if (filters.due === 'no_due' && task.dueDate) return false;
  if (filters.linked === 'kanban' && !task.kanbanCardId) return false;
  if (filters.linked === 'sop' && !(task.sopIds || []).length) return false;
  if (filters.linked === 'qc' && !(task.qcRecordIds || []).length) return false;
  if (filters.linked === 'op_pack' && !task.operationPackId) return false;

  if (filters.source !== 'all' && getTaskSourceType(task) !== filters.source) return false;
  if (filters.source === 'op_pack' && filters.opPackId !== 'all' && task.operationPackId !== filters.opPackId) return false;

  return true;
}
function getFilteredTaskManagerTasks() { return getAllTaskManagerTasks(false).filter(ctx => taskMatchesTaskManagerFilters(ctx.task)); }
function renderTaskSourceSummary() {
  const allTasks = getAllTaskManagerTasks(false).map(x => x.task);
  const activeSources = Object.keys(TASK_SOURCE_METADATA);
  const counts = {};
  activeSources.forEach(src => { counts[src] = 0; });
  allTasks.forEach(task => {
    const tempFilters = { ...taskManagerFilters, source: 'all', opPackId: 'all' };
    if (taskMatchesTaskManagerFilters(task, tempFilters)) {
      const srcType = getTaskSourceType(task);
      if (counts[srcType] !== undefined) {
        counts[srcType]++;
      }
      counts['all']++;
    }
  });
  return `<div class="task-source-summary">
    ${Object.entries(TASK_SOURCE_METADATA).map(([id, meta]) => {
      const active = taskManagerFilters.source === id ? 'active' : '';
      const count = counts[id] || 0;
      return `<button class="${active}" onclick="updateTaskManagerFilters({source:'${id}', opPackId:'all'})" style="--source-color: ${meta.color}">
        <i class="fa-solid ${meta.icon}"></i>
        <span>${meta.label}</span>
        <b>${count}</b>
      </button>`;
    }).join('')}
  </div>`;
}
function renderTaskManager() {
  ensureOmni();
  const tabs = document.getElementById('taskSpaceTabs');
  const body = document.getElementById('taskHierarchyBody');
  if (!tabs || !body) return;
  const page = document.getElementById('pageTaskManager');
  const title = page?.querySelector('.page-title');
  const subtitle = page?.querySelector('.page-subtitle');
  if (title) title.innerHTML = '<span class="title-icon">✅</span> إدارة المهام';
  if (subtitle) subtitle.textContent = 'قاعدة المهام والمسؤوليات الداخلية المرتبطة باللوحة التنفيذية ومصمم العمليات والإجراءات والمكائن والمواد والجودة وطلبات الموظفين.';
  tabs.innerHTML = (omni.taskManager.spaces || []).map(space => `<button class="emp-tab ${space.id === omni.taskManager.selectedSpaceId ? 'active' : ''}" onclick="selectTaskSpace('${space.id}')">${escapeHtml(space.name)}</button>`).join('');
  body.className = 'task-manager-shell task-manager-v2';
  body.innerHTML = `
    <div class="task-purpose-card"><div><h3>إدارة المهام هي قاعدة العمل الداخلية للنظام</h3><p>هنا تُدار المهام الإدارية، الإنتاجية، المتكررة، مهام الصيانة، مهام الجودة، ومهام المتابعة. أما اللوحة التنفيذية فهي للمتابعة اليومية المباشرة، ومصمم العمليات هو لرسم طريقة العمل القياسية.</p></div><div class="task-purpose-map"><span>مصمم العمليات = طريقة العمل</span><span>اللوحة التنفيذية = التنفيذ اليومي</span><span>إدارة المهام = قاعدة المهام والمسؤوليات</span></div></div>
    ${renderTaskManagerToolbar()}
    ${renderTaskManagerFilters()}
    ${renderTaskSourceSummary()}
    <div class="task-content-v2">${renderTaskManagerActiveView()}</div>
  `;
}
// T5.9 restoration (2026-07-16): selectTaskSpace was a SHARED function living
// inside the dead "Task Manager V1" block that T4.10 deleted — the pre-T4.10
// app.js even carried a comment warning it was still live ("(selectTaskSpace,
// findTaskDepartment/…) untouched since"), but the block-bounded deletion swept
// it anyway. Its only caller is the onclick string in renderTaskManager() above,
// which no syntax check or module-load smoke can see — the handler_wiring suite
// caught it (exactly the T4.9-warned failure class). Restored VERBATIM from
// .backups/T4.10/app.js.bak line 17295.
function selectTaskSpace(spaceId) { ensureOmni(); omni.taskManager.selectedSpaceId = spaceId; saveData(); renderTaskManager(); }
function renderTaskManagerToolbar() {
  const views = [['list','قائمة','fa-list'],['board','لوحة','fa-table-columns'],['table','جدول','fa-table'],['workload','عبء العمل','fa-chart-simple'],['overdue','المتأخرة','fa-clock'],['my','مهامي','fa-user-check']];
  const cur = taskManagerViewMode || 'list';
  return `<div class="task-view-tabs">${views.map(([k,l,i])=>`<button class="${cur===k?'active':''}" onclick="setTaskManagerViewMode('${k}')"><i class="fa-solid ${i}"></i> ${l}</button>`).join('')}</div>`;
}
function renderTaskManagerFilters() {
  const tasks = getAllTaskManagerTasks(true).map(x => x.task);
  const deps = [...new Set(tasks.map(t => t.department).filter(Boolean))];
  const owners = [...new Set(tasks.flatMap(t => [t.assigneeId, t.owner, t.assignedTo]).filter(Boolean))];
  const packs = omni.opPacks || [];
  const showOpPackSelect = taskManagerFilters.source === 'op_pack';
  return `<div class="task-filter-bar">
    <input class="form-input" placeholder="بحث" value="${escapeHtml(taskManagerFilters.search)}" oninput="updateTaskManagerFilters({search:this.value})">
    <select class="form-input" onchange="updateTaskManagerFilters({department:this.value})"><option value="all">كل الأقسام</option>${deps.map(d => `<option value="${escapeHtml(d)}" ${taskManagerFilters.department === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}</select>
    <select class="form-input" onchange="updateTaskManagerFilters({assigneeId:this.value})"><option value="all">كل المسؤولين</option><option value="none" ${taskManagerFilters.assigneeId === 'none' ? 'selected' : ''}>بدون مسؤول</option>${owners.map(o => `<option value="${escapeHtml(o)}" ${taskManagerFilters.assigneeId === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>
    <select class="form-input" onchange="updateTaskManagerFilters({status:this.value})"><option value="all">كل الحالات</option>${TASK_MANAGER_STATUS.map(s => `<option value="${s.value}" ${taskManagerFilters.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
    <select class="form-input" onchange="updateTaskManagerFilters({priority:this.value})"><option value="all">كل الأولويات</option>${TASK_MANAGER_PRIORITY.map(p => `<option value="${p.value}" ${taskManagerFilters.priority === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
    <select class="form-input" onchange="updateTaskManagerFilters({due:this.value})"><option value="all">كل التواريخ</option><option value="overdue" ${taskManagerFilters.due === 'overdue' ? 'selected' : ''}>متأخرة فقط</option><option value="today" ${taskManagerFilters.due === 'today' ? 'selected' : ''}>اليوم</option><option value="no_due" ${taskManagerFilters.due === 'no_due' ? 'selected' : ''}>بدون تاريخ</option></select>
    <select class="form-input" onchange="updateTaskManagerFilters({source:this.value, opPackId:'all'})">
      <option value="all">كل المصادر</option>
      ${Object.entries(TASK_SOURCE_METADATA).filter(([id]) => id !== 'all').map(([id, meta]) => `<option value="${id}" ${taskManagerFilters.source === id ? 'selected' : ''}>${meta.label}</option>`).join('')}
    </select>
    ${showOpPackSelect ? `
      <select class="form-input" onchange="updateTaskManagerFilters({opPackId:this.value})">
        <option value="all">كل باقات العمليات</option>
        ${packs.map(p => `<option value="${p.id}" ${taskManagerFilters.opPackId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
    ` : ''}
    <select class="form-input" onchange="updateTaskManagerFilters({linked:this.value})">
      <option value="all">كل الروابط</option>
      <option value="kanban" ${taskManagerFilters.linked === 'kanban' ? 'selected' : ''}>مرتبطة بالكانبان</option>
      <option value="sop" ${taskManagerFilters.linked === 'sop' ? 'selected' : ''}>مرتبطة بـ SOP</option>
      <option value="qc" ${taskManagerFilters.linked === 'qc' ? 'selected' : ''}>مرتبطة بـ QC</option>
      <option value="op_pack" ${taskManagerFilters.linked === 'op_pack' ? 'selected' : ''}>مرتبطة بباقة عمليات</option>
    </select>
    <button class="btn-secondary" onclick="resetTaskManagerFilters()">إعادة ضبط</button>
  </div>`;
}
function renderTaskManagerActiveView() {
  const mode = getTaskManagerViewMode();
  if (mode === 'board') return renderTaskManagerBoardView();
  if (mode === 'table') return renderTaskManagerTableView();
  if (mode === 'workload') return renderTaskManagerWorkloadView();
  if (mode === 'overdue') return renderTaskManagerOverdueView();
  if (mode === 'my') return renderTaskManagerMyTasksView();
  return renderTaskManagerListView();
}
function renderTaskCardV2(task) {
  const status = taskStatusMeta(task.status), priority = taskPriorityMeta(task.priority);
  const srcType = getTaskSourceType(task);
  const srcMeta = TASK_SOURCE_METADATA[srcType] || TASK_SOURCE_METADATA.manual;
  const linked = [task.kanbanCardId && 'اللوحة', task.workflowNodeId && 'مصمم العمليات', task.operationPackId && 'باقة تشغيل', (task.sopIds||[]).length && 'إجراء', (task.machineIds||[]).length && 'ماكينة', (task.materialRequirements||[]).length && 'مواد', (task.qcRecordIds||[]).length && 'جودة'].filter(Boolean);
  const checks = [...(task.checklist || []), ...(task.subtasks || [])]; const done = checks.filter(x => x.done || x.passed).length; const pct = checks.length ? Math.round(done / checks.length * 100) : 0;
  return `<div class="task-card-v2 ${taskManagerTaskIsOverdue(task) ? 'task-overdue' : ''}" onclick="openTaskManagerInspector('${task.id}', 0)"><div class="task-card-title">${escapeHtml(task.title)}</div><div class="task-card-meta">${escapeHtml(task.department || 'غير مصنف')} · ${escapeHtml(task.section || 'قائمة عامة')}</div><div class="task-card-badges"><span class="task-status-badge" style="--badge-color:${status.color}">${status.label}</span><span class="task-priority-badge" style="--badge-color:${priority.color}">${priority.label}</span><span class="task-source-badge" style="--source-color:${srcMeta.color}"><i class="fa-solid ${srcMeta.icon}"></i> ${srcMeta.label}</span>${task.dueDate ? `<span class="task-linked-chip ${taskManagerTaskIsOverdue(task) ? 'danger' : ''}">${task.dueDate}</span>` : ''}</div><p>${escapeHtml(task.description || '')}</p><div class="task-card-links">${linked.map(l => `<span class="task-linked-chip">${escapeHtml(l)}</span>`).join('') || '<span class="task-linked-chip muted">بدون روابط</span>'}</div><div class="task-card-footer"><span>${escapeHtml(task.owner || task.assignedTo || 'بدون مسؤول')}</span><span>${checks.length ? pct + '%' : 'لا توجد قائمة مراجعة'}</span></div></div>`;
}
function renderTaskManagerListView() {
  const grouped = {};
  getFilteredTaskManagerTasks().forEach(ctx => { const key = `${ctx.task.department || ctx.dep.name || 'غير مصنف'} / ${ctx.task.section || ctx.sec.name || 'قائمة عامة'}`; (grouped[key] ||= []).push(ctx.task); });
  const groups = Object.entries(grouped);
  if (!groups.length) return '<div class="task-empty-state">لا توجد مهام حسب الفلاتر الحالية</div>';
  return `<div class="task-list-v2">${groups.map(([name,tasks]) => `<section class="task-list-group"><header><h3>${escapeHtml(name)}</h3><small>${tasks.length} مهمة</small></header>${tasks.map(task => {
    const srcType = getTaskSourceType(task);
    const srcMeta = TASK_SOURCE_METADATA[srcType] || TASK_SOURCE_METADATA.manual;
    return `<div class="task-row-v2" onclick="openTaskManagerInspector('${task.id}',0)">
      <div><b>${escapeHtml(task.title)}</b><small>${escapeHtml(task.description || '')}</small></div>
      <span class="task-status-badge" style="--badge-color:${taskStatusMeta(task.status).color}">${taskStatusMeta(task.status).label}</span>
      <span class="task-priority-badge" style="--badge-color:${taskPriorityMeta(task.priority).color}">${taskPriorityMeta(task.priority).label}</span>
      <span class="task-source-badge" style="--source-color:${srcMeta.color}"><i class="fa-solid ${srcMeta.icon}"></i> ${srcMeta.label}</span>
      <span>${escapeHtml(task.owner || task.assignedTo || 'بدون مسؤول')}</span>
      <span class="${taskManagerTaskIsOverdue(task) ? 'text-danger' : ''}">${task.dueDate || '-'}</span>
    </div>`;
  }).join('') || '<div class="task-empty-state">لا توجد مهام في هذه القائمة</div>'}</section>`).join('')}</div>`;
}
function renderTaskManagerBoardView() { const tasks = getFilteredTaskManagerTasks().map(x => x.task); return `<div class="task-board-v2">${TASK_MANAGER_STATUS.map(st => { const col = tasks.filter(t => t.status === st.value); return `<div class="task-board-column"><header><b>${st.label}</b><span>${col.length}</span></header>${col.map(renderTaskCardV2).join('') || '<div class="task-empty-state">لا توجد مهام في هذه القائمة</div>'}</div>`; }).join('')}</div>`; }
function renderTaskManagerTableView() {
  const tasks = getFilteredTaskManagerTasks().map(x => x.task);
  return `<div class="table-container glass-card">
    <table class="data-table">
      <thead>
        <tr>
          <th>المهمة</th>
          <th>القسم</th>
          <th>الحالة</th>
          <th>الأولوية</th>
          <th>المصدر</th>
          <th>المسؤول</th>
          <th>الاستحقاق</th>
          <th>روابط</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(task => {
          const srcType = getTaskSourceType(task);
          const srcMeta = TASK_SOURCE_METADATA[srcType] || TASK_SOURCE_METADATA.manual;
          return `<tr onclick="openTaskManagerInspector('${task.id}',0)" style="cursor:pointer">
            <td><b>${escapeHtml(task.title)}</b></td>
            <td>${escapeHtml(task.department || '-')}</td>
            <td><span class="task-status-badge" style="--badge-color:${taskStatusMeta(task.status).color}">${taskStatusMeta(task.status).label}</span></td>
            <td><span class="task-priority-badge" style="--badge-color:${taskPriorityMeta(task.priority).color}">${taskPriorityMeta(task.priority).label}</span></td>
            <td><span class="task-source-badge" style="--source-color:${srcMeta.color}"><i class="fa-solid ${srcMeta.icon}"></i> ${srcMeta.label}</span></td>
            <td>${escapeHtml(task.owner || task.assignedTo || '-')}</td>
            <td class="${taskManagerTaskIsOverdue(task) ? 'text-danger' : ''}">${task.dueDate || '-'}</td>
            <td>${[task.kanbanCardId ? 'اللوحة' : '', task.workflowNodeId ? 'مصمم العمليات' : '', (task.sopIds || []).length ? 'إجراء' : '', (task.qcRecordIds || []).length ? 'جودة' : ''].filter(Boolean).join(' · ') || '-'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="8">لا توجد مهام حسب الفلاتر الحالية</td></tr>'}
      </tbody>
    </table>
  </div>`;
}
function renderTaskManagerWorkloadView() { const w = calculateTaskManagerWorkload(); return `<div class="task-workload-panel"><div class="task-workload-section"><h3>عبء الموظفين</h3>${w.employees.map(x => renderTaskLoadRow(x, getTaskManagerEmployeeLoadStatus(x))).join('') || '<div class="task-empty-state">لا توجد مهام مخصصة لهذا الموظف</div>'}</div><div class="task-workload-section"><h3>عبء الأقسام</h3>${w.departments.map(x => renderTaskLoadRow(x, getTaskManagerDepartmentLoadStatus(x))).join('')}</div></div>`; }
function renderTaskLoadRow(w, status) { return `<div class="task-load-row"><div><b>${escapeHtml(w.name)}</b><small>${w.open} مفتوحة · ${w.overdue} متأخرة · ${w.urgent} عاجلة · ${w.estimatedMinutes} دقيقة</small></div><div class="task-load-bar"><span style="width:${Math.min(100, w.score)}%;background:${status.color}"></span></div><span class="task-status-badge" style="--badge-color:${status.color}">${status.label}</span></div>`; }
function renderTaskManagerOverdueView() { const tasks = getFilteredTaskManagerTasks().map(x => x.task).filter(taskManagerTaskIsOverdue); return `<div class="task-list-v2">${tasks.map(renderTaskCardV2).join('') || '<div class="task-empty-state">لا توجد مهام متأخرة</div>'}</div>`; }
function renderTaskManagerMyTasksView() { const emp = employees[selectedEmpIdx] || employees[0] || {}; const id = String(emp.id || emp.name || ''); const tasks = getFilteredTaskManagerTasks().map(x => x.task).filter(t => [t.assigneeId,t.employeeId,t.owner,t.assignedTo].map(v => String(v || '')).includes(id)); return `<div class="task-list-v2"><h3>مهام ${escapeHtml(emp.name || 'الموظف')}</h3>${tasks.map(renderTaskCardV2).join('') || '<div class="task-empty-state">لا توجد مهام مخصصة لهذا الموظف</div>'}</div>`; }
async function addTaskManagerTaskQuick() { const space = getSelectedSpace(); if (!space) return; if (!space.departments.length) space.departments.push({ id: makeId('dep'), name: 'عام', sections: [] }); const dep = space.departments[0]; if (!dep.sections.length) dep.sections.push({ id: makeId('sec'), name: 'قائمة عامة', taskTypes: [] }); const sec = dep.sections[0]; if (!sec.taskTypes.length) sec.taskTypes.push({ id: makeId('type'), name: 'عام', tasks: [] }); return addClickupTask(space.id, dep.id, sec.id, sec.taskTypes[0].id); }
async function addTaskSpace() { ensureOmni(); const name = await showOmniPrompt('اسم مساحة العمل:'); if (!name) return; omni.taskManager.spaces.push({ id: makeId('space'), name, departments: [] }); omni.taskManager.selectedSpaceId = omni.taskManager.spaces.at(-1).id; saveData(); renderTaskManager(); }
async function addTaskDepartment() { const space = getSelectedSpace(); const name = await showOmniPrompt('اسم القسم:'); if (!name || !space) return; space.departments.push({ id: makeId('dep'), name, sections: [] }); saveData(); renderTaskManager(); }
async function addTaskSection(spaceId, depId) { const dep = findTaskDepartment(spaceId, depId); const name = await showOmniPrompt('اسم القائمة / المشروع:'); if (!name || !dep) return; dep.sections.push({ id: makeId('sec'), name, taskTypes: [{ id: makeId('type'), name: 'عام', tasks: [] }] }); saveData(); renderTaskManager(); }
async function addTaskType(spaceId, depId, secId) { const sec = findTaskSection(spaceId, depId, secId); const name = await showOmniPrompt('نوع المهمة:'); if (!name || !sec) return; sec.taskTypes.push({ id: makeId('type'), name, tasks: [] }); saveData(); renderTaskManager(); }
async function addClickupTask(spaceId, depId, secId, typeId) {
  const type = findTaskType(spaceId, depId, secId, typeId); const dep = findTaskDepartment(spaceId, depId); const sec = findTaskSection(spaceId, depId, secId); if (!type) return;
  const empOptions = (employees || []).map(e => `<option value="${escapeHtml(e.id || e.name)}">${escapeHtml(e.name)}</option>`).join('');
  const result = await showOmniModal('إضافة مهمة', `<label>عنوان المهمة</label><input id="tmTitle" class="form-input"><label>الأولوية</label><select id="tmPriority" class="form-input">${TASK_MANAGER_PRIORITY.map(p => `<option value="${p.value}">${p.label}</option>`).join('')}</select><label>المسؤول</label><select id="tmAssignee" class="form-input"><option value="">بدون مسؤول</option>${empOptions}</select><label>تاريخ الاستحقاق</label><input id="tmDue" type="date" class="form-input" value="${todayISO()}">`, body => ({ title: body.querySelector('#tmTitle')?.value.trim(), priority: body.querySelector('#tmPriority')?.value || 'normal', assigneeId: body.querySelector('#tmAssignee')?.value || '', dueDate: body.querySelector('#tmDue')?.value || '' }));
  if (!result?.title) return;
  const emp = (employees || []).find(e => String(e.id || e.name) === String(result.assigneeId));
  type.tasks.push({ id: makeId('task'), title: result.title, status: 'todo', priority: result.priority, owner: emp?.name || '', assigneeId: result.assigneeId, assignedTo: emp?.name || '', employeeId: result.assigneeId, dueDate: result.dueDate, department: dep?.name || '', section: sec?.name || '', category: type.name, subtasks: [], checklist: [], comments: [], activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء المهمة' }] });
  normalizeTaskManagerV2(); saveData(); renderTaskManager(); showToast('تمت إضافة المهمة', 'success');
}
function editClickupTask(taskId) { openTaskManagerInspector(taskId, 0); }
function openTaskManagerInspector(taskId, tab = 0) { const panel = document.getElementById('inspectorPanel'); const overlay = document.getElementById('inspectorOverlay'); if (panel && overlay) { panel.classList.remove('hidden'); overlay.classList.remove('hidden'); panel.classList.add('task-inspector-v2'); } renderTaskManagerInspectorTab(taskId, tab); }
function renderTaskInspectorTab(taskId, tabIdx = 0) { renderTaskManagerInspectorTab(taskId, tabIdx); }
function renderTaskManagerInspectorTab(taskId, tabIdx = 0) {
  ensureOmni(); const task = findTaskById(taskId); const title = document.getElementById('inspectorTitle'); const tabs = document.getElementById('inspectorTabs'); const body = document.getElementById('inspectorBody'); if (!task || !tabs || !body) return;
  title.textContent = task.title; const tabList = ['نظرة عامة','Checklist','روابط','SOP','ماكينة','مواد','QC','تعليقات','نشاط','اعتمادات'];
  tabs.innerHTML = tabList.map((t,i) => `<button class="insp-tab ${i===tabIdx?'active':''}" onclick="renderTaskManagerInspectorTab('${taskId}',${i})">${escapeHtml(t)}</button>`).join('');
  body.className = 'inspector-body task-inspector-v2';
  body.innerHTML = renderTaskManagerInspectorBody(task, tabIdx);
}
function renderTaskManagerInspectorBody(task, tabIdx) {
  if (tabIdx === 0) {
    const empOptions = (employees || []).map(e => `<option value="${escapeHtml(e.id || e.name)}" ${String(task.assigneeId || task.employeeId) === String(e.id || e.name) ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
    return `<div class="insp-section"><label>عنوان المهمة</label><input class="form-input" value="${escapeHtml(task.title)}" onchange="updateTaskManagerTask('${task.id}',{title:this.value})"></div><div class="task-inspector-grid"><div><label>الحالة</label><select class="form-input" onchange="updateTaskManagerTask('${task.id}',{status:this.value})">${TASK_MANAGER_STATUS.map(s => `<option value="${s.value}" ${task.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div><div><label>الأولوية</label><select class="form-input" onchange="updateTaskManagerTask('${task.id}',{priority:this.value})">${TASK_MANAGER_PRIORITY.map(p => `<option value="${p.value}" ${task.priority === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div><div><label>المسؤول</label><select class="form-input" onchange="updateTaskManagerAssignee('${task.id}',this.value)"><option value="">بدون مسؤول</option>${empOptions}</select></div><div><label>تاريخ الاستحقاق</label><input type="date" class="form-input" value="${task.dueDate || ''}" onchange="updateTaskManagerTask('${task.id}',{dueDate:this.value})"></div></div><div class="insp-section"><label>الوصف</label><textarea class="form-input" rows="4" onchange="updateTaskManagerTask('${task.id}',{description:this.value})">${escapeHtml(task.description || '')}</textarea></div><div class="insp-actions"><button class="btn-secondary" onclick="createKanbanCardFromTask('${task.id}')">تحويل إلى بطاقة Kanban</button>${task.kanbanCardId ? `<button class="btn-secondary" onclick="switchPage('kanban'); openKanbanCardInspector('${task.kanbanCardId}')">فتح البطاقة المرتبطة</button>` : ''}<button class="btn-secondary" onclick="archiveTaskManagerTask('${task.id}')">أرشفة المهمة</button><button class="btn-danger" onclick="deleteTaskManagerTask('${task.id}')">حذف نهائي</button></div>`;
  }
  if (tabIdx === 1) return `<div class="insp-section"><div class="insp-actions"><button class="btn-secondary" onclick="addSubtask('${task.id}')">إضافة خطوة فرعية</button></div>${(task.subtasks||[]).map(st => `<div class="task-row-v2"><input type="checkbox" ${st.done?'checked':''} onchange="toggleSubtask('${task.id}','${st.id}'); renderTaskManagerInspectorTab('${task.id}',1)"><input class="form-input" value="${escapeHtml(st.title)}" onchange="updateSubtaskTitle('${task.id}','${st.id}',this.value)"><button class="btn-danger" onclick="deleteSubtask('${task.id}','${st.id}'); renderTaskManagerInspectorTab('${task.id}',1)">حذف</button></div>`).join('') || '<p class="muted">لا توجد خطوات فرعية.</p>'}</div>`;
  if (tabIdx === 2) return renderTaskManagerRelationsTab(task);
  if (tabIdx === 3) return renderTaskLinkTab(task, 'sop');
  if (tabIdx === 4) return renderTaskLinkTab(task, 'machine');
  if (tabIdx === 5) return renderTaskLinkTab(task, 'material');
  if (tabIdx === 6) return renderTaskLinkTab(task, 'qc');
  if (tabIdx === 7) return renderTaskCommentsTab(task);
  if (tabIdx === 8) return `<div class="insp-section"><h4>سجل النشاط</h4>${(task.activityLog||[]).slice().reverse().map(log => `<div class="insp-activity-item"><small>${new Date(log.date).toLocaleString()}</small><br>${escapeHtml(log.text)}</div>`).join('') || '<p class="muted">لا يوجد سجل.</p>'}</div>`;
  return renderTaskDependenciesTab(task);
}
function renderTaskManagerRelationsTab(task) {
  const card = getTaskLinkedKanbanCard(task);
  const node = (omni.workflow?.nodes || []).find(n => n.id === task.workflowNodeId);
  const pack = task.operationPackId ? getOperationPackById(task.operationPackId) : null;
  const qcRec = (task.qcRecordIds || []).length > 0 ? getQcRecordById(task.qcRecordIds[0]) : null;
  const srcType = getTaskSourceType(task);
  const srcMeta = TASK_SOURCE_METADATA[srcType] || TASK_SOURCE_METADATA.manual;

  let sourceContextHtml = '';
  if (srcType !== 'manual') {
    let detailsHtml = '';
    let actionButtonsHtml = '';

    if (srcType === 'op_pack' && pack) {
      detailsHtml = `<div><span>باقة العمليات</span><b>${escapeHtml(pack.name)}</b></div><div><span>رقم الخطوة</span><b>${escapeHtml(task.operationPackStepId || 'غير محدد')}</b></div>`;
      actionButtonsHtml = `<button class="btn-secondary" style="font-size:11px;" onclick="openOmniEntity('operation_pack', '${pack.id}')"><i class="fa-solid fa-external-link"></i> فتح الباقة</button>`;
    } else if (srcType === 'workflow' && node) {
      detailsHtml = `<div><span>خطوة مسار العمل</span><b>${escapeHtml(node.title)}</b></div><div><span>القسم المطلوب</span><b>${escapeHtml(node.department || 'عام')}</b></div>`;
      actionButtonsHtml = `<button class="btn-secondary" style="font-size:11px;" onclick="openOmniEntity('workflow_node', '${node.id}')"><i class="fa-solid fa-external-link"></i> فتح المخطط</button>`;
    } else if (srcType === 'qc' && qcRec) {
      detailsHtml = `<div><span>سجل فحص الجودة</span><b>${escapeHtml(qcRec.title || qcRec.type || 'تقرير جودة')}</b></div><div><span>حالة الفحص</span><b>فشل / إعادة عمل</b></div>`;
      actionButtonsHtml = `<button class="btn-secondary" style="font-size:11px;" onclick="openOmniEntity('qc_record', '${qcRec.id}')"><i class="fa-solid fa-external-link"></i> فتح التقرير</button>`;
    } else if (srcType === 'kanban' && card) {
      detailsHtml = `<div><span>بطاقة كانبان</span><b>${escapeHtml(card.title)}</b></div><div><span>المسؤول اليومي</span><b>${escapeHtml(card.owner || 'غير محدد')}</b></div>`;
      actionButtonsHtml = `<button class="btn-secondary" style="font-size:11px;" onclick="openOmniEntity('kanban_card', '${card.id}')"><i class="fa-solid fa-external-link"></i> فتح الكانبان</button>`;
    } else if (srcType === 'recurring') {
      detailsHtml = `<div><span>جدول التكرار</span><b>نشط</b></div><div><span>تكرار كل</span><b>${escapeHtml(task.recurring.frequency || 'أسبوعياً')}</b></div>`;
    }

    sourceContextHtml = `<div class="task-source-context" style="--source-color: ${srcMeta.color}">
      <div class="task-source-context-head">
        <span>سياق المصدر التشغيلي</span>
        <span class="task-source-badge" style="--source-color: ${srcMeta.color}"><i class="fa-solid ${srcMeta.icon}"></i> ${srcMeta.label}</span>
      </div>
      <div class="task-source-context-grid">
        ${detailsHtml}
      </div>
      ${actionButtonsHtml ? `<div class="task-source-actions">${actionButtonsHtml}</div>` : ''}
    </div>`;
  }

  return `<div class="insp-section">
    ${sourceContextHtml}
    <h4>الروابط والاتصالات</h4>
    <div style="display:flex; flex-direction:column; gap:10px; margin: 10px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border:1px solid rgba(148,163,184,0.14); border-radius:8px; background:rgba(255,255,255,0.02)">
        <div>
          <b style="font-size:12px; display:block;">اللوحة التنفيذية</b>
          <small style="color:var(--text-muted); font-size:11px;">${card ? 'مرتبط بـ: ' + escapeHtml(card.title) : 'لم يتم ربط بطاقة كانبان بعد'}</small>
        </div>
        <div style="display:flex; gap:6px;">
          ${card ? `<button class="btn-secondary" style="font-size:11px; padding:4px 8px;" onclick="openOmniEntity('kanban_card', '${card.id}')">فتح</button>` : ''}
          <button class="btn-secondary" style="font-size:11px; padding:4px 8px;" onclick="linkTaskToKanbanCardModal('${task.id}')">ربط</button>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border:1px solid rgba(148,163,184,0.14); border-radius:8px; background:rgba(255,255,255,0.02)">
        <div>
          <b style="font-size:12px; display:block;">عقدة خطوة مسار العمل (Workflow)</b>
          <small style="color:var(--text-muted); font-size:11px;">${node ? 'مرتبط بـ: ' + escapeHtml(node.title) : 'غير مرتبط بأي عقدة مسار عمل'}</small>
        </div>
        <div style="display:flex; gap:6px;">
          ${node ? `<button class="btn-secondary" style="font-size:11px; padding:4px 8px;" onclick="openOmniEntity('workflow_node', '${node.id}')">فتح</button>` : ''}
          <button class="btn-secondary" style="font-size:11px; padding:4px 8px;" onclick="linkTaskToWorkflowNodeModal('${task.id}')">ربط</button>
        </div>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border:1px solid rgba(148,163,184,0.14); border-radius:8px; background:rgba(255,255,255,0.02)">
        <div>
          <b style="font-size:12px; display:block;">باقة العمليات الأصلية (Operation Pack)</b>
          <small style="color:var(--text-muted); font-size:11px;">${pack ? 'مرتبط بـ: ' + escapeHtml(pack.name) : 'مستقلة / غير مرتبطة بباقة عمليات'}</small>
        </div>
        <div style="display:flex; gap:6px;">
          ${pack ? `<button class="btn-secondary" style="font-size:11px; padding:4px 8px;" onclick="openOmniEntity('operation_pack', '${pack.id}')">فتح</button>` : ''}
        </div>
      </div>
    </div>
    <div class="insp-actions" style="margin-top:14px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
      <button class="btn-primary" onclick="createKanbanCardFromTask('${task.id}')"><i class="fa-solid fa-rocket"></i> تحويل سريع للوحة التنفيذية</button>
    </div>
  </div>`;
}
function renderTaskLinkTab(task, kind) {
  if (kind === 'sop') return `<div class="insp-section"><h4>SOP</h4>${(task.sopIds||[]).map(id => `<span class="task-linked-chip">${escapeHtml(getSopById(id)?.title || id)}</span>`).join('') || '<p class="muted">لا يوجد SOP مرتبط.</p>'}<select id="taskSopSelect" class="form-input"><option value="">اختر SOP</option>${(omni.sops||[]).map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('')}</select><button class="btn-secondary" onclick="linkSopToTask('${task.id}',document.getElementById('taskSopSelect').value)">ربط SOP</button></div>`;
  if (kind === 'machine') return `<div class="insp-section"><h4>ماكينة</h4>${(task.machineIds||[]).map(id => `<span class="task-linked-chip">${escapeHtml(getMachineById(id)?.name || id)}</span>`).join('') || '<p class="muted">لا توجد ماكينة مرتبطة.</p>'}<select id="taskMachineSelect" class="form-input"><option value="">اختر ماكينة</option>${(omni.machines||[]).map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}</select><button class="btn-secondary" onclick="linkMachineToTask('${task.id}',document.getElementById('taskMachineSelect').value)">ربط ماكينة</button></div>`;
  if (kind === 'material') return `<div class="insp-section"><h4>مواد</h4>${(task.materialRequirements||[]).map(req => `<span class="task-linked-chip">${escapeHtml(getMaterialById(req.materialId)?.name || req.materialId)} × ${req.qty || req.quantity || 1} ${escapeHtml(req.unit || '')}</span>`).join('') || '<p class="muted">لا توجد مواد مرتبطة.</p>'}<select id="taskMaterialSelect" class="form-input"><option value="">اختر مادة</option>${(omni.materials||[]).map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}</select><input id="taskMaterialQty" class="form-input" type="number" value="1"><button class="btn-secondary" onclick="linkMaterialToTask('${task.id}',document.getElementById('taskMaterialSelect').value,document.getElementById('taskMaterialQty').value,'')">ربط مادة</button></div>`;
  return `<div class="insp-section"><h4>QC</h4>${(task.qcRecordIds||[]).map(id => `<span class="task-linked-chip">${escapeHtml(getQcRecordById(id)?.title || getQcRecordById(id)?.type || id)}</span>`).join('') || '<p class="muted">لا يوجد QC مرتبط.</p>'}<select id="taskQcSelect" class="form-input"><option value="">اختر QC</option>${(omni.qcRecords||[]).map(q => `<option value="${q.id}">${escapeHtml(q.title || q.type || q.id)}</option>`).join('')}</select><button class="btn-secondary" onclick="linkQcRecordToTask('${task.id}',document.getElementById('taskQcSelect').value)">ربط QC</button></div>`;
}
function renderTaskCommentsTab(task) { return `<div class="insp-section"><h4>تعليقات</h4>${(task.comments||[]).map(c => `<div class="insp-activity-item"><small>${escapeHtml(c.author || 'النظام')} · ${c.date || c.createdAt || ''}</small><br>${escapeHtml(c.text || '')}</div>`).join('') || '<p class="muted">لا توجد تعليقات.</p>'}<textarea id="taskCommentText" class="form-input" rows="3" placeholder="إضافة تعليق"></textarea><button class="btn-secondary" onclick="addTaskManagerComment('${task.id}',document.getElementById('taskCommentText').value)">إضافة تعليق</button></div>`; }
function renderTaskDependenciesTab(task) { const opts = getAllTaskManagerTasks(true).map(x => x.task).filter(t => t.id !== task.id).map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join(''); return `<div class="insp-section"><h4>اعتمادات</h4>${isTaskBlockedByDependencies(task.id) ? '<div class="cc-alert cc-alert-warning">هذه المهمة تنتظر مهام أخرى</div>' : ''}${(task.dependencies||[]).map(dep => `<div class="task-row-v2"><span>${escapeHtml(findTaskById(dep.taskId)?.title || dep.taskId)}</span><button class="btn-danger" onclick="removeTaskDependency('${task.id}','${dep.taskId}')">إزالة</button></div>`).join('') || '<p class="muted">لا توجد اعتمادات.</p>'}<select id="taskDependencySelect" class="form-input"><option value="">اختر مهمة</option>${opts}</select><button class="btn-secondary" onclick="addTaskDependency('${task.id}',document.getElementById('taskDependencySelect').value)">إضافة اعتماد</button></div>`; }
function addTaskManagerActivity(taskId, text) { const task = findTaskById(taskId); if (!task) return; if (!Array.isArray(task.activityLog)) task.activityLog = []; task.activityLog.push({ date: new Date().toISOString(), text }); }
function updateTaskManagerTask(taskId, patch) {
  const task = findTaskById(taskId);
  if (!task) return;
  const oldStatus = task.status;
  Object.entries(patch || {}).forEach(([k,v]) => task[k] = k === 'status' ? normalizeTaskStatus(v) : k === 'priority' ? normalizeTaskPriority(v) : v);
  if (task.status === 'done' && !task.completedAt) task.completedAt = new Date().toISOString();
  addTaskManagerActivity(taskId, 'تم تحديث بيانات المهمة');
  saveData();
  renderTaskManager();
  if (patch && patch.status === 'done' && oldStatus !== 'done') {
    triggerOmniEvent('TASK_COMPLETED', { task });
  }
}
function updateTaskField(taskId, field, value) { updateTaskManagerTask(taskId, { [field]: value }); }
function updateTaskManagerAssignee(taskId, assigneeId) { const emp = (employees || []).find(e => String(e.id || e.name) === String(assigneeId)); updateTaskManagerTask(taskId, { assigneeId: assigneeId || '', employeeId: assigneeId || '', owner: emp?.name || '', assignedTo: emp?.name || '' }); renderTaskManagerInspectorTab(taskId, 0); }
async function archiveTaskManagerTask(taskId) { const ok = await showOmniModal('أرشفة المهمة','<p>سيتم إخفاء المهمة من العروض النشطة بدون حذف روابطها. هل تريد المتابعة؟</p>',() => true); if (!ok) return; updateTaskManagerTask(taskId,{ archived:true, archivedAt:new Date().toISOString() }); closeInspector(); showToast('تمت أرشفة المهمة','success'); }
function restoreTaskManagerTask(taskId) { updateTaskManagerTask(taskId,{ archived:false, archivedAt:'' }); }
async function deleteTaskManagerTask(taskId) { const ok = await showOmniModal('حذف نهائي','<p>سيتم تعليم المهمة كمحذوفة ولن يتم حذف بطاقة اللوحة المرتبطة. هل تريد المتابعة؟</p>',() => true); if (!ok) return; updateTaskManagerTask(taskId,{ deleted:true, deletedAt:new Date().toISOString() }); closeInspector(); showToast('تم حذف المهمة','success'); }
async function deleteClickupTask(taskId) { return deleteTaskManagerTask(taskId); }
async function renameTaskManagerLevel(id) { let target = null; for (const space of omni.taskManager.spaces) for (const dep of space.departments) { if (dep.id === id) target = dep; for (const sec of dep.sections || []) { if (sec.id === id) target = sec; for (const type of sec.taskTypes || []) if (type.id === id) target = type; } } if (!target) return; const name = await showOmniPrompt('تعديل الاسم:', target.name); if (!name) return; target.name = name.trim(); saveData(); renderTaskManager(); }
async function addSubtask(taskId) { const task = findTaskById(taskId); const title = await showOmniPrompt('عنوان الخطوة الفرعية:'); if (!title || !task) return; task.subtasks.push({ id: makeId('sub'), title, done: false }); addTaskManagerActivity(taskId,'تمت إضافة خطوة فرعية'); saveData(); renderTaskManager(); renderTaskManagerInspectorTab(taskId,1); }
function toggleSubtask(taskId, subId) { const task = findTaskById(taskId); const st = task?.subtasks?.find(s => s.id === subId); if (!st) return; st.done = !st.done; addTaskManagerActivity(taskId, st.done ? 'تم إنجاز خطوة فرعية' : 'تم إعادة فتح خطوة فرعية'); saveData(); renderTaskManager(); }
function deleteSubtask(taskId, subId) { const task = findTaskById(taskId); if (!task) return; task.subtasks = (task.subtasks || []).filter(st => st.id !== subId); addTaskManagerActivity(taskId,'تم حذف خطوة فرعية'); saveData(); renderTaskManager(); }
function updateSubtaskTitle(taskId, subId, newTitle) { const task = findTaskById(taskId); const st = task?.subtasks?.find(s => s.id === subId); if (st && newTitle) { st.title = newTitle; saveData(); } }
function addTaskManagerComment(taskId, text) { const task = findTaskById(taskId); if (!task || !text?.trim()) return; task.comments.push({ id: makeId('cmt'), text: text.trim(), author: 'النظام', createdAt: new Date().toISOString(), date: todayISO() }); addTaskManagerActivity(taskId,'تمت إضافة تعليق'); saveData(); renderTaskManagerInspectorTab(taskId,7); }
function getTaskLinkedKanbanCard(task) { return task?.kanbanCardId ? (omni.kanban.cards || []).find(c => c.id === task.kanbanCardId) || null : null; }
function createKanbanCardFromTask(taskId) { const task = findTaskById(taskId); if (!task) return; if (task.kanbanCardId && getTaskLinkedKanbanCard(task)) return showToast('المهمة مرتبطة ببطاقة Kanban مسبقاً','warning'); const col = (omni.kanban.columns || [])[0]; const card = { id: makeId('card'), columnId: col?.id || 'kb_backlog', title: task.title, description: task.description || '', owner: task.owner || task.assignedTo || '', assigneeId: task.assigneeId || '', priority: task.priority, dueDate: task.dueDate || '', department: task.department || '', section: task.section || '', tags: [...(task.tags || []), 'task_manager'], checklist: (task.subtasks || []).map(st => ({ id: st.id || makeId('chk'), text: st.title || st.text, done: !!st.done })), sopIds: [...(task.sopIds || [])], machineIds: [...(task.machineIds || [])], materialRequirements: [...(task.materialRequirements || [])], qcRecordIds: [...(task.qcRecordIds || [])], sourceType: 'task_manager', sourceId: task.id, taskManagerTaskId: task.id, activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء البطاقة من إدارة المهام: ${task.title}` }] }; omni.kanban.cards.push(card); task.kanbanCardId = card.id; addTaskManagerActivity(taskId, `تم إنشاء بطاقة Kanban: ${card.title}`); saveData(); renderTaskManager(); showToast('تم إنشاء بطاقة Kanban من المهمة','success'); }
function linkTaskToKanbanCard(taskId, cardId) { const task = findTaskById(taskId); const card = (omni.kanban.cards || []).find(c => c.id === cardId); if (!task || !card) return showToast('اختر بطاقة صحيحة','warning'); task.kanbanCardId = card.id; card.taskManagerTaskId = task.id; card.sourceType = card.sourceType || 'task_manager'; card.sourceId = card.sourceId || task.id; addTaskManagerActivity(taskId, `تم ربط بطاقة اللوحة: ${card.title}`); saveData(); renderTaskManagerInspectorTab(taskId,2); showToast('تم الربط بالبطاقة','success'); }
async function linkTaskToKanbanCardModal(taskId) { const opts = (omni.kanban.cards || []).map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join(''); const cardId = await showOmniModal('ربط ببطاقة اللوحة', `<select id="tmCardLink" class="form-input"><option value="">اختر بطاقة</option>${opts}</select>`, body => body.querySelector('#tmCardLink')?.value || ''); if (cardId) linkTaskToKanbanCard(taskId, cardId); }
function syncTaskFromKanbanCard(cardId) { const card = (omni.kanban.cards || []).find(c => c.id === cardId); const task = getAllTaskManagerTasks(true).map(x => x.task).find(t => t.kanbanCardId === cardId); if (!card || !task) return; updateTaskManagerTask(task.id, { title: card.title, status: card.status === 'done' ? 'done' : task.status, priority: normalizeTaskPriority(card.priority), dueDate: card.dueDate || task.dueDate }); }
function syncKanbanCardFromTask(taskId) { const task = findTaskById(taskId); const card = getTaskLinkedKanbanCard(task); if (!task || !card) return; card.title = task.title; card.priority = task.priority; card.dueDate = task.dueDate; card.owner = task.owner; saveData(); }
function createTaskFromWorkflowNode(nodeId) { const node = (omni.workflow?.nodes || []).find(n => n.id === nodeId); if (!node) return null; const task = createTaskInSelectedSpace(node.title || 'مهمة Workflow', { workflowId:'default', workflowNodeId:node.id, sourceType:'workflow_node', sourceId:node.id, department:node.department || 'Workflow' }); saveData(); return task; }
function getTasksForWorkflowNode(nodeId) { return getAllTaskManagerTasks(true).map(x => x.task).filter(t => t.workflowNodeId === nodeId); }
function linkTaskToWorkflowNode(taskId, nodeId) { const task = findTaskById(taskId); const node = (omni.workflow?.nodes || []).find(n => n.id === nodeId); if (!task || !node) return; task.workflowId = 'default'; task.workflowNodeId = node.id; addTaskManagerActivity(taskId, `تم ربط Workflow: ${node.title}`); saveData(); renderTaskManagerInspectorTab(taskId,2); }
async function linkTaskToWorkflowNodeModal(taskId) { const opts = (omni.workflow?.nodes || []).map(n => `<option value="${n.id}">${escapeHtml(n.title)}</option>`).join(''); const nodeId = await showOmniModal('ربط بعقدة Workflow', `<select id="tmNodeLink" class="form-input"><option value="">اختر عقدة</option>${opts}</select>`, body => body.querySelector('#tmNodeLink')?.value || ''); if (nodeId) linkTaskToWorkflowNode(taskId, nodeId); }
function createTaskInSelectedSpace(title, patch = {}) { const space = getSelectedSpace(); if (!space.departments.length) space.departments.push({ id:makeId('dep'), name:patch.department || 'عام', sections:[] }); const dep = space.departments[0]; if (!dep.sections.length) dep.sections.push({ id:makeId('sec'), name:'قائمة عامة', taskTypes:[] }); const sec = dep.sections[0]; if (!sec.taskTypes.length) sec.taskTypes.push({ id:makeId('type'), name:'عام', tasks:[] }); const task = { id:makeId('task'), title, status:'todo', priority:'normal', department:dep.name, section:sec.name, category:sec.taskTypes[0].name, activityLog:[{ date:new Date().toISOString(), text:'تم إنشاء المهمة' }], ...patch }; sec.taskTypes[0].tasks.push(task); normalizeTaskManagerV2(); return task; }
function createTaskFromOperationPackStep(packId, stepId) { const pack = getOperationPackById(packId); const step = (pack?.steps || []).find(s => s.id === stepId); if (!pack || !step) return null; const task = createTaskInSelectedSpace(step.title || step.name || 'مهمة باقة عمليات', { operationPackId:pack.id, operationPackStepId:step.id, sourceType:'operation_pack_step', sourceId:step.id }); saveData(); return task; }
function getTasksForOperationPack(packId) { return getAllTaskManagerTasks(true).map(x => x.task).filter(t => t.operationPackId === packId); }
function createTaskFromQcRework(qcRecordId) { const qc = getQcRecordById(qcRecordId); if (!qc) return null; const task = createTaskInSelectedSpace(`إعادة عمل: ${qc.title || qc.type || 'فحص جودة فاشل'}`, { priority: qc.severity === 'critical' ? 'urgent' : 'high', sourceType:'qc_rework', sourceId:qc.id, qcRecordIds:[qc.id], department:qc.department || 'الجودة' }); saveData(); return task; }
function getReworkTasksForQc(qcRecordId) { return getAllTaskManagerTasks(true).map(x => x.task).filter(t => (t.qcRecordIds || []).includes(qcRecordId) || t.sourceId === qcRecordId); }
function linkSopToTask(taskId, sopId) { const task = findTaskById(taskId); if (!task || !sopId) return; if (!task.sopIds.includes(sopId)) task.sopIds.push(sopId); addTaskManagerActivity(taskId, `تم ربط SOP: ${getSopById(sopId)?.title || sopId}`); saveData(); renderTaskManagerInspectorTab(taskId,3); }
function linkMachineToTask(taskId, machineId) { const task = findTaskById(taskId); if (!task || !machineId) return; if (!task.machineIds.includes(machineId)) task.machineIds.push(machineId); addTaskManagerActivity(taskId, `تم ربط ماكينة: ${getMachineById(machineId)?.name || machineId}`); saveData(); renderTaskManagerInspectorTab(taskId,4); }
function linkMaterialToTask(taskId, materialId, qty, unit) { const task = findTaskById(taskId); const mat = getMaterialById(materialId); if (!task || !mat) return; const existing = task.materialRequirements.find(r => r.materialId === materialId); if (existing) { existing.qty = Number(qty) || 1; existing.quantity = existing.qty; existing.unit = unit || mat.unit || ''; } else task.materialRequirements.push({ materialId, qty:Number(qty) || 1, quantity:Number(qty) || 1, unit:unit || mat.unit || '' }); addTaskManagerActivity(taskId, `تم ربط مادة: ${mat.name}`); saveData(); renderTaskManagerInspectorTab(taskId,5); }
function linkQcRecordToTask(taskId, qcRecordId) { const task = findTaskById(taskId); if (!task || !qcRecordId) return; if (!task.qcRecordIds.includes(qcRecordId)) task.qcRecordIds.push(qcRecordId); addTaskManagerActivity(taskId, `تم ربط QC: ${qcRecordId}`); saveData(); renderTaskManagerInspectorTab(taskId,6); }
function getEmployeeAssignedTaskManagerTasks(employeeId) { const id = String(employeeId || ''); return getAllTaskManagerTasks(false).map(x => x.task).filter(t => [t.assigneeId,t.employeeId,t.owner,t.assignedTo].map(v => String(v || '')).includes(id)); }
function addTaskDependency(taskId, dependencyTaskId) { const task = findTaskById(taskId); if (!task || !dependencyTaskId || taskId === dependencyTaskId) return; if (!task.dependencies.some(d => d.taskId === dependencyTaskId)) task.dependencies.push({ taskId:dependencyTaskId, type:'finish_to_start', status:'active' }); addTaskManagerActivity(taskId,'تمت إضافة اعتماد'); saveData(); renderTaskManagerInspectorTab(taskId,9); }
function removeTaskDependency(taskId, dependencyTaskId) { const task = findTaskById(taskId); if (!task) return; task.dependencies = (task.dependencies || []).filter(d => d.taskId !== dependencyTaskId); addTaskManagerActivity(taskId,'تمت إزالة اعتماد'); saveData(); renderTaskManagerInspectorTab(taskId,9); }
function isTaskBlockedByDependencies(taskId) { const task = findTaskById(taskId); return !!task && (task.dependencies || []).some(dep => findTaskById(dep.taskId)?.status !== 'done'); }
function createRecurringTaskFromTemplate(taskId) { const task = findTaskById(taskId); if (!task) return null; const ctx = getAllTaskManagerTasks(true).find(x => x.task.id === taskId); const clone = JSON.parse(JSON.stringify(task)); clone.id = makeId('task'); clone.title = `${task.title} - ${todayISO()}`; clone.status = 'todo'; clone.completedAt = ''; clone.sourceType = 'recurring_task'; clone.sourceId = task.id; clone.activityLog = [{ date:new Date().toISOString(), text:'تم إنشاء المهمة من تكرار' }]; ctx?.type?.tasks.push(clone); saveData(); return clone; }
function getDueRecurringTasks() { const today = todayISO(); return getAllTaskManagerTasks(false).map(x => x.task).filter(t => t.recurring?.enabled && t.recurring.nextDate && t.recurring.nextDate <= today); }
function calculateTaskManagerWorkload() { const tasks = getAllTaskManagerTasks(false).map(x => x.task).filter(t => t.status !== 'done'); const byEmp = {}, byDept = {}; tasks.forEach(t => { const e = t.owner || t.assignedTo || t.assigneeId || 'بدون مسؤول'; const d = t.department || 'غير مصنف'; [byEmp[e] ||= { name:e, open:0, overdue:0, urgent:0, estimatedMinutes:0 }, byDept[d] ||= { name:d, open:0, overdue:0, urgent:0, estimatedMinutes:0 }].forEach(b => { b.open++; if (taskManagerTaskIsOverdue(t)) b.overdue++; if (t.priority === 'urgent') b.urgent++; b.estimatedMinutes += Number(t.estimatedMinutes || 0); }); }); const score = w => Math.min(100, w.open * 10 + w.overdue * 18 + w.urgent * 15 + Math.round(w.estimatedMinutes / 60) * 4); Object.values(byEmp).forEach(w => w.score = score(w)); Object.values(byDept).forEach(w => w.score = score(w)); return { employees:Object.values(byEmp).sort((a,b)=>b.score-a.score), departments:Object.values(byDept).sort((a,b)=>b.score-a.score) }; }
function getTaskManagerEmployeeLoadStatus(load) { return load.score >= 80 ? { label:'مضغوط', color:'#f87171' } : load.score >= 50 ? { label:'مشغول', color:'#fbbf24' } : { label:'متاح', color:'#34d399' }; }
function getTaskManagerDepartmentLoadStatus(load) { return load.score >= 80 ? { label:'خطر', color:'#f87171' } : load.score >= 50 ? { label:'مزدحم', color:'#fbbf24' } : { label:'طبيعي', color:'#34d399' }; }

