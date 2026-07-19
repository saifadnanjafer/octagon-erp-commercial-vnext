// Octagon ERP Phase 4 T4.5 de-monolith module.
// Machine management, queue intelligence, page renderers, and machine inspector actions moved verbatim from app.js.
// --- machine queue normalization ---
function normalizeMachineQueues() {
  (omni.machines || []).forEach(machine => {
    const oldQueue = Array.isArray(machine.queue) ? 0 : Number(machine.queue || 0);
    if (!Array.isArray(machine.queue)) machine.queue = [];
    if (machine.queueBacklogCount === undefined) machine.queueBacklogCount = oldQueue;
    machine.status = machine.status || 'available';
    if (machine.photoUrl === undefined) machine.photoUrl = machine.imageUrl || '';
    if (machine.hourlyCost === undefined) machine.hourlyCost = machine.costPerHour || 25000;
    if (machine.costPerHour === undefined) machine.costPerHour = machine.hourlyCost;
    if (machine.maintenanceIntervalHours === undefined) machine.maintenanceIntervalHours = 250;
    if (machine.maintenanceIntervalDays === undefined) machine.maintenanceIntervalDays = 30;
    if (machine.lastMaintenanceHoursTotal === undefined) {
      const totalHours = Number(machine.hoursTotal) || 0;
      const intervalHours = Number(machine.maintenanceIntervalHours) || 250;
      machine.lastMaintenanceHoursTotal = Math.max(0, totalHours - (totalHours % intervalHours));
    }
    if (machine.description === undefined) machine.description = '';
    if (machine.usageNotes === undefined) machine.usageNotes = '';
    if (machine.aiWorkspace === undefined) machine.aiWorkspace = '';
    if (machine.aiLastInstruction === undefined) machine.aiLastInstruction = '';
    if (machine.model === undefined) machine.model = '';
    if (machine.maintenanceNotes === undefined) machine.maintenanceNotes = '';
    if (!Array.isArray(machine.activityLog)) machine.activityLog = [];
  });

  if (!omni.migrationsApplied.includes('machine_queue_v1')) {
    omni.migrationsApplied.push('machine_queue_v1');
    console.log('[OMNI] Migration applied: machine_queue_v1');
  }
}

// --- machine entity lookup ---
function getMachineById(id) { return (omni.machines || []).find(m => m.id === id) || null; }

// --- machine operation helpers ---
function getMachineQueueCount(machine) {
  if (!machine) return 0;
  return (Array.isArray(machine.queue) ? machine.queue.length : Number(machine.queue || 0)) + Number(machine.queueBacklogCount || 0);
}

function getMachineHourlyCost(machine) {
  const raw = Number(machine?.hourlyCost ?? machine?.costPerHour ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 25000;
}

function getMachineLastMaintenanceAge(machine) {
  if (!machine?.lastMaintenance) return 999;
  const date = new Date(machine.lastMaintenance);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 864e5));
}

function getMachineQueueMinutes(machine) {
  return (Array.isArray(machine?.queue) ? machine.queue : []).reduce((sum, q) => {
    if (q.status === 'done') return sum;
    return sum + getMachineQueueEntryMinutes(q);
  }, 0);
}

function getMachineQueueEntryMinutes(entry) {
  const raw = Number(entry?.estimatedMinutes ?? entry?.plannedMinutes ?? entry?.minutes ?? 0);
  if (Number.isFinite(raw) && raw > 0) return raw;
  if (entry?.sourceType === 'backlog') return 60;
  return 0;
}

function machineQueueUsesEstimatedMinutes(machine) {
  return (Array.isArray(machine?.queue) ? machine.queue : [])
    .some(q => q.status !== 'done' && !Number(q.estimatedMinutes || q.plannedMinutes || q.minutes));
}

function getMachineAiOperatorName(machine, entry = null) {
  const minutes = getMachineQueueEntryMinutes(entry);
  if (!machine) return minutes >= 180 ? 'AI تشغيل طويل' : 'AI تشغيل ذكي';
  const maintenance = getMachineMaintenanceInsight(machine);
  if (maintenance.level === 'danger' || machine?.status === 'maintenance') return 'AI صيانة وتشخيص';
  if (getMachineConflictWarnings(machine).length) return 'AI جدولة وحل تعارض';
  if (minutes >= 180) return 'AI تشغيل طويل';
  return 'AI تشغيل ذكي';
}

function isMachineAiOperator(operator) {
  return String(operator || '').trim().toLowerCase().startsWith('ai ');
}

function getMachineQueueSourceLabel(sourceType) {
  return ({
    backlog: 'متراكم',
    op_pack: 'حزمة تشغيل',
    manual: 'يدوي',
    card: 'بطاقة تشغيل'
  })[sourceType] || sourceType || 'يدوي';
}

function getMachineQueueOperator(entry, machine = null) {
  return entry?.operator || entry?.operatorName || entry?.assignedOperator || getMachineAiOperatorName(machine, entry);
}

function getMachineQueueOperators(machine) {
  const queue = Array.isArray(machine?.queue) ? machine.queue : [];
  const activeQueue = queue.filter(q => q.status !== 'done');
  const names = activeQueue
    .map(q => getMachineQueueOperator(q, machine))
    .filter(Boolean);
  if (!names.length && machine?.operator) names.push(machine.operator);
  return Array.from(new Set(names));
}

function getMachineOperatorOptions(machine) {
  const names = new Set([
    getMachineAiOperatorName(machine),
    'AI تشغيل ذكي',
    'AI جدولة وحل تعارض',
    'AI صيانة وتشخيص',
    'AI تشغيل طويل'
  ]);
  if (machine?.operator) names.add(machine.operator);
  (Array.isArray(machine?.queue) ? machine.queue : []).forEach(q => {
    const operator = getMachineQueueOperator(q, machine);
    if (operator) names.add(operator);
  });
  if (Array.isArray(employees)) {
    employees.forEach(emp => {
      const name = emp?.name || emp?.fullName || emp?.employeeName;
      if (name) names.add(name);
    });
  }
  return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ar'));
}

function renderMachineOperatorPickerInput(id, value = '', placeholder = 'اختر من الموظفين أو اكتب اسم جديد') {
  const options = getMachineOperatorOptions(null)
    .map(name => `<option value="${escapeHtml(name)}"></option>`)
    .join('');
  return `
    <input id="${id}" class="form-input" list="${id}List" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}">
    <datalist id="${id}List">${options}</datalist>
    <small class="machine-field-help">هذا المشغل الافتراضي للماكينة. كل مهمة في الطابور تقدر تبقى على AI أو تختار لها مشغل مختلف، وبعدها نربطها بساعات الموظف وسجل تشغيل الماكينة.</small>
  `;
}

function ensureMachineBacklogQueueEntries(machine) {
  if (!machine) return false;
  if (!Array.isArray(machine.queue)) machine.queue = [];
  const backlogCount = Math.max(0, Number(machine.queueBacklogCount) || 0);
  if (!backlogCount) return false;
  for (let i = 0; i < backlogCount; i += 1) {
    const entry = {
      id: makeId('mq'),
      sourceType: 'backlog',
      sourceId: 'machine_backlog',
      cardId: '',
      title: `عمل متراكم #${machine.queue.length + 1}`,
      estimatedMinutes: 60,
      status: 'queued',
      createdAt: new Date().toISOString()
    };
    const aiOperator = getMachineAiOperatorName(machine, entry);
    machine.queue.push({
      ...entry,
      operator: aiOperator,
      operatorType: 'ai',
      aiSuggestedOperator: aiOperator,
      aiAssisted: true
    });
  }
  machine.queueBacklogCount = 0;
  return true;
}

function getMachineLinkedCards(machine) {
  const cards = typeof getAllOperationalCards === 'function' ? getAllOperationalCards() : [];
  return cards.filter(card => !isCardDone(card) && Array.isArray(card.machineIds) && card.machineIds.includes(machine.id));
}

function getMachineMaintenanceInsight(machine) {
  const queueCount = getMachineQueueCount(machine);
  const downtime = Number(machine?.downtime) || 0;
  const ageDays = getMachineLastMaintenanceAge(machine);
  const intervalHours = Number(machine?.maintenanceIntervalHours ?? 250) || 250;
  const intervalDays = Number(machine?.maintenanceIntervalDays ?? 30) || 30;
  const hoursTotal = Number(machine?.hoursTotal) || 0;
  const fallbackLastHours = intervalHours > 0 ? Math.max(0, hoursTotal - (hoursTotal % intervalHours)) : 0;
  const lastMaintenanceHoursTotal = Number(machine?.lastMaintenanceHoursTotal ?? machine?.hoursAtLastMaintenance ?? fallbackLastHours) || 0;
  const hoursSinceMaintenance = Math.max(0, hoursTotal - lastMaintenanceHoursTotal);
  const cyclePct = intervalHours > 0 ? Math.min(100, Math.round((hoursSinceMaintenance / intervalHours) * 100)) : 0;
  const daysPct = intervalDays > 0 ? Math.min(100, Math.round((ageDays / intervalDays) * 100)) : 0;
  const nextHours = Math.max(0, intervalHours - hoursSinceMaintenance);
  const nextDays = Math.max(0, intervalDays - ageDays);
  const dueByHours = hoursSinceMaintenance >= intervalHours;
  const dueByDate = ageDays >= intervalDays;
  let score = 0;
  if (machine?.status === 'maintenance') score += 45;
  if (dueByDate) score += 30;
  else if (daysPct >= 80) score += 15;
  if (downtime >= 12) score += 25;
  else if (downtime >= 6) score += 12;
  if (dueByHours) score += 35;
  else if (cyclePct >= 90) score += 25;
  else if (cyclePct >= 75) score += 12;
  if (queueCount >= 5) score += 12;
  score = Math.min(100, score);
  const level = score >= 70 ? 'danger' : score >= 45 ? 'warn' : 'ok';
  const label = dueByHours || dueByDate || level === 'danger' ? 'الصيانة مستحقة' : level === 'warn' ? 'تحتاج متابعة' : 'سليمة';
  const dueReason = dueByHours && dueByDate ? 'الساعات والمدة' : dueByHours ? 'ساعات العمل' : dueByDate ? 'المدة الزمنية' : '';
  return { score, level, label, ageDays, intervalHours, intervalDays, cyclePct, daysPct, nextHours, nextDays, dueByHours, dueByDate, dueReason, hoursSinceMaintenance, lastMaintenanceHoursTotal };
}

function getMachineConflictWarnings(machine) {
  const queue = Array.isArray(machine?.queue) ? machine.queue : [];
  const activeQueue = queue.filter(q => q.status !== 'done');
  const inProgress = activeQueue.filter(q => q.status === 'in_progress');
  const linkedCards = getMachineLinkedCards(machine);
  const warnings = [];
  if (machine?.status === 'maintenance' && activeQueue.length > 0) {
    warnings.push({ level: 'danger', text: `${activeQueue.length} أعمال في الطابور بينما الماكينة في الصيانة.` });
  }
  if (inProgress.length > 1) {
    warnings.push({ level: 'danger', text: `${inProgress.length} أعمال مؤشرة قيد التنفيذ على نفس الماكينة.` });
  }
  if (getMachineQueueMinutes(machine) > 480) {
    warnings.push({ level: 'warn', text: 'الطابور يتجاوز شفت تشغيل كامل حسب الوقت التقديري.' });
  }
  const overdue = linkedCards.filter(c => getOverdueDays(c) > 0);
  if (overdue.length > 0) {
    warnings.push({ level: 'warn', text: `${overdue.length} بطاقات تشغيل مرتبطة متأخرة عن موعدها.` });
  }
  if (getMachineQueueCount(machine) >= 6) {
    warnings.push({ level: 'warn', text: 'التراكم أعلى من حد العمل الآمن.' });
  }
  return warnings;
}

function getMachineOpsContext(machine) {
  const queueMinutes = getMachineQueueMinutes(machine);
  const hourlyCost = getMachineHourlyCost(machine);
  const linkedCards = getMachineLinkedCards(machine);
  const linkedCost = linkedCards.reduce((sum, c) => sum + getCardCostTotal(c), 0);
  const queuedCost = Math.round((queueMinutes / 60) * hourlyCost);
  const maintenance = getMachineMaintenanceInsight(machine);
  const conflicts = getMachineConflictWarnings(machine);
  return {
    queueCount: getMachineQueueCount(machine),
    queueMinutes,
    hourlyCost,
    queuedCost,
    linkedCards,
    linkedCost,
    maintenance,
    conflicts
  };
}

function getMachineFleetKpis() {
  const machines = omni.machines || [];
  const contexts = machines.map(m => getMachineOpsContext(m));
  return {
    total: machines.length,
    operational: machines.filter(m => m.status === 'operational').length,
    queued: contexts.reduce((sum, c) => sum + c.queueCount, 0),
    risk: contexts.filter(c => c.maintenance.level !== 'ok').length,
    conflicts: contexts.reduce((sum, c) => sum + c.conflicts.length, 0),
    queuedCost: contexts.reduce((sum, c) => sum + c.queuedCost, 0)
  };
}

function getMachinePriorityScore(machine, ctx = getMachineOpsContext(machine)) {
  let score = ctx.maintenance.score || 0;
  score += Math.min(30, ctx.queueCount * 4);
  score += Math.min(20, Math.round(ctx.queueMinutes / 60));
  score += Math.min(20, ctx.conflicts.length * 8);
  if (machine?.status === 'maintenance') score += 18;
  if (machine?.status === 'idle' && ctx.queueCount > 0) score += 10;
  return Math.max(0, Math.min(100, score));
}

function getMachinePriorityLevel(score) {
  if (score >= 75) return { level: 'danger', label: 'حرج' };
  if (score >= 50) return { level: 'warn', label: 'مراقبة' };
  return { level: 'ok', label: 'مستقر' };
}

function buildMachineFleetIntelligence() {
  const rows = (omni.machines || []).map(machine => {
    const ctx = getMachineOpsContext(machine);
    const score = getMachinePriorityScore(machine, ctx);
    return { machine, ctx, score, ...getMachinePriorityLevel(score) };
  }).sort((a, b) => b.score - a.score);
  const bottleneck = rows[0] || null;
  const needsMaintenance = rows.filter(r => r.ctx.maintenance.level !== 'ok');
  const idleWithWork = rows.filter(r => r.machine.status === 'idle' && r.ctx.queueCount > 0);
  const heavyQueue = rows.filter(r => r.ctx.queueMinutes > 480 || r.ctx.queueCount >= 6);
  const suggestions = [];
  if (bottleneck && bottleneck.score >= 50) {
    suggestions.push(`ابدأ بمراجعة ${bottleneck.machine.name || 'الماكينة الأعلى خطورة'} لأنها أعلى نقطة ضغط حالياً (${bottleneck.score}%).`);
  }
  if (needsMaintenance.length) {
    suggestions.push(`${needsMaintenance.length} ماكينة تحتاج متابعة صيانة قبل تراكم أعمال أكثر.`);
  }
  if (idleWithWork.length) {
    suggestions.push(`${idleWithWork.length} ماكينة متوقفة رغم وجود أعمال في الطابور؛ راجع الحالة أو انقل الأعمال.`);
  }
  if (heavyQueue.length) {
    suggestions.push(`${heavyQueue.length} طابور يتجاوز حد الشفت الآمن؛ وزّع الأعمال على مكائن بديلة إن أمكن.`);
  }
  if (!suggestions.length) suggestions.push('الوضع التشغيلي مستقر حالياً، ولا توجد اختناقات واضحة في بيانات المكائن.');
  return { rows, bottleneck, needsMaintenance, idleWithWork, heavyQueue, suggestions };
}

function renderMachineFleetIntelligencePanel() {
  const intel = buildMachineFleetIntelligence();
  const topRows = intel.rows.slice(0, 4);
  return `
    <div class="machine-intel-panel glass-card">
      <div class="machine-intel-head">
        <div>
          <h3><i class="fa-solid fa-brain"></i> ذكاء تشغيل المكائن</h3>
          <p>تجميع فوري لمخاطر الصيانة، ضغط الطوابير، التعارضات، والكلفة المتوقعة.</p>
        </div>
        <button class="btn-secondary" onclick="renderMachinesPage()"><i class="fa-solid fa-rotate"></i> تحديث</button>
      </div>
      <div class="machine-intel-grid">
        ${topRows.map(row => `
          <button class="machine-intel-row ${row.level}" onclick="openInspector('machine', '${row.machine.id}')">
            <b>${escapeHtml(row.machine.name || 'ماكينة')}</b>
            <span>${row.label} · ${row.score}%</span>
            <small>${row.ctx.queueCount} أعمال · ${Math.round(row.ctx.queueMinutes / 60 * 10) / 10} ساعة · ${formatMachineMoney(row.ctx.queuedCost)}</small>
          </button>
        `).join('') || '<div class="machine-intel-empty">لا توجد مكائن محفوظة بعد.</div>'}
      </div>
      <div class="machine-intel-suggestions">
        ${intel.suggestions.map(text => `<div><i class="fa-solid fa-circle-info"></i>${escapeHtml(text)}</div>`).join('')}
      </div>
    </div>
  `;
}

function renderMachinePhoto(machine, className = 'machine-photo') {
  const url = machine?.photoUrl || machine?.imageUrl || '';
  if (url) {
    return `<img class="${className}" src="${escapeHtml(url)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${className} machine-photo-placeholder',innerHTML:'<i class=&quot;fa-solid fa-gears&quot;></i>'}))">`;
  }
  return `<div class="${className} machine-photo-placeholder"><i class="fa-solid fa-gears"></i></div>`;
}

function formatMachineMoney(value) {
  const orgSymbol = omni.adminSettings?.organization?.currencySymbol || 'IQD';
  return `${Math.round(Number(value) || 0).toLocaleString()} ${escapeHtml(orgSymbol)}`;
}

// --- machine queue entry helper ---
function addMachineQueueEntry(machineId, entry) {
  const machine = getMachineById(machineId);
  if (!machine) return false;
  if (!Array.isArray(machine.queue)) machine.queue = [];
  const assignedOperator = entry.operator || entry.operatorName || entry.assignedOperator || getMachineAiOperatorName(machine, entry);
  machine.queue.push({
    id: entry.id || makeId('mq'),
    sourceType: entry.sourceType || 'op_pack',
    sourceId: entry.sourceId || '',
    cardId: entry.cardId || '',
    title: entry.title || 'Queued job',
    estimatedMinutes: Number(entry.estimatedMinutes) || 0,
    operator: assignedOperator,
    operatorType: entry.operatorType || (isMachineAiOperator(assignedOperator) ? 'ai' : 'human'),
    aiSuggestedOperator: getMachineAiOperatorName(machine, entry),
    aiAssisted: entry.aiAssisted !== false,
    status: entry.status || 'queued',
    createdAt: entry.createdAt || new Date().toISOString()
  });

  // MACHINE_OVERLOADED check
  const totalMinutes = machine.queue
    .filter(q => q.status !== 'completed' && q.status !== 'done')
    .reduce((sum, q) => sum + (Number(q.estimatedMinutes) || 0), 0);
  if (totalMinutes > 240) {
    triggerOmniEvent('MACHINE_OVERLOADED', { machine, totalMinutes });
  }

  return true;
}

// --- machines page renderers ---
function renderMachinesPage_deprecated_dup1() {
  ensureOmni();
  const grid = document.getElementById('machinesGrid');
  if (!grid) return;
  grid.innerHTML = (omni.machines || []).map(m => {
    const statusColors = { operational: '#34d399', maintenance: '#f87171', idle: '#94a3b8' };
    const statusLabels = { operational: 'تعمل', maintenance: 'صيانة', idle: 'متوقفة' };
    return `
      <div class="machine-card glass-card" onclick="openInspector('machine', '${m.id}')">
        <div class="machine-status-dot" style="background:${statusColors[m.status]||'#888'}"></div>
        <h3>${m.name}</h3>
        <div class="machine-status-badge" style="background:${statusColors[m.status]||'#888'}20; color:${statusColors[m.status]||'#888'}">${statusLabels[m.status] || m.status}</div>
        <div class="machine-details">
          <div><i class="fa-solid fa-user"></i> المشغّل: <b>${m.operator}</b></div>
          <div><i class="fa-solid fa-list-ol"></i> الطابور: <b>${getMachineQueueCount(m)} مهام</b></div>
          <div><i class="fa-solid fa-briefcase"></i> مهام اليوم: <b>${m.jobsToday}</b></div>
          <div><i class="fa-solid fa-clock"></i> ساعات الكلية: <b>${m.hoursTotal}</b></div>
          <div><i class="fa-solid fa-wrench"></i> آخر صيانة: <b>${m.lastMaintenance}</b></div>
          <div><i class="fa-solid fa-arrow-down"></i> ساعات التعطل: <b>${m.downtime}</b></div>
        </div>
        <div class="machine-bar"><div class="machine-bar-fill" style="width:${Math.min(100, (getMachineQueueCount(m) / 5) * 100)}%; background:${getMachineQueueCount(m) > 3 ? '#f87171' : getMachineQueueCount(m) > 1 ? '#fbbf24' : '#34d399'}"></div></div>
      </div>
    `;
  }).join('');
}

// T0.4 dedup (2026-07-12): dead copy (basic name/operator/status form),
// shadowed by the richer live definition below (adds photo, hourly cost,
// maintenance interval, AI workspace notes). Kept per add-only rule.
async function addMachine_deprecated_dup1() {
  ensureOmni();
  const html = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label>اسم الماكينة</label>
      <input type="text" id="addMachName" class="form-input" placeholder="مثال: CNC Router 125x250">
      <label>المشغل الافتراضي</label>
      <input type="text" id="addMachOp" class="form-input" placeholder="مثال: يوسف">
      <label>الحالة</label>
      <select id="addMachStatus" class="form-input">
        <option value="operational" selected>تعمل (Operational)</option>
        <option value="idle">متوقفة (Idle)</option>
        <option value="maintenance">صيانة (Maintenance)</option>
      </select>
    </div>
  `;
  const result = await showOmniModal('إضافة ماكينة جديدة', html, (body) => {
    const name = body.querySelector('#addMachName').value.trim();
    if (!name) return false;
    return {
      name,
      operator: body.querySelector('#addMachOp').value.trim() || '-',
      status: body.querySelector('#addMachStatus').value
    };
  });
  if (!result) return;
  omni.machines.push({
    id: makeId('mach'),
    name: result.name,
    type: 'other',
    status: result.status,
    operator: result.operator,
    queue: [],
    lastMaintenance: todayISO(),
    hoursTotal: 0,
    downtime: 0,
    sopId: '',
    jobsToday: 0
  });
  saveData(); renderMachinesPage();
}

// ═══════════ INVENTORY PAGE ═══════════
// ─── Inventory page toolbar state (V100) ───
// Machine Control V100 (2026-05-24): active operational dashboard override.
function renderMachinesPage() {
  ensureOmni();
  const grid = document.getElementById('machinesGrid');
  if (!grid) return;
  const fleet = getMachineFleetKpis();
  const kpiHtml = `
    <div class="machine-kpi-strip">
      <div><b>${fleet.total}</b><span>عدد المكائن</span></div>
      <div><b>${fleet.operational}</b><span>تعمل الآن</span></div>
      <div><b>${fleet.queued}</b><span>أعمال في الطابور</span></div>
      <div class="${fleet.risk ? 'warn' : 'ok'}"><b>${fleet.risk}</b><span>مخاطر صيانة</span></div>
      <div class="${fleet.conflicts ? 'danger' : 'ok'}"><b>${fleet.conflicts}</b><span>تعارضات الطابور</span></div>
      <div><b>${formatMachineMoney(fleet.queuedCost)}</b><span>كلفة الطابور</span></div>
    </div>
  `;
  const cardsHtml = (omni.machines || []).map(m => {
    const ctx = getMachineOpsContext(m);
    const priorityScore = getMachinePriorityScore(m, ctx);
    const priority = getMachinePriorityLevel(priorityScore);
    const statusColors = { operational: '#34d399', maintenance: '#f87171', idle: '#94a3b8' };
    const statusLabels = { operational: 'تعمل', maintenance: 'صيانة', idle: 'متوقفة' };
    const queuePct = Math.min(100, (ctx.queueCount / 6) * 100);
    const queueOperators = getMachineQueueOperators(m);
    const queueOperatorLabel = queueOperators.length
      ? `${queueOperators.slice(0, 3).join('، ')}${queueOperators.length > 3 ? ` +${queueOperators.length - 3}` : ''}`
      : '-';
    return `
      <div class="machine-card glass-card machine-maint-${ctx.maintenance.level}" onclick="openInspector('machine', '${m.id}')">
        <div class="machine-status-dot" style="background:${statusColors[m.status]||'#888'}"></div>
        <div class="machine-card-top">
          ${renderMachinePhoto(m, 'machine-card-photo')}
          <div>
            <h3>${escapeHtml(m.name || 'ماكينة')}</h3>
            <div class="machine-status-badge" style="background:${statusColors[m.status]||'#888'}20; color:${statusColors[m.status]||'#888'}">${statusLabels[m.status] || escapeHtml(m.status || '-')}</div>
          </div>
        </div>
        <div class="machine-card-alerts">
          <span class="machine-risk-pill ${priority.level}">أولوية ${priorityScore}% · ${priority.label}</span>
          <span class="machine-risk-pill ${ctx.maintenance.level}">${ctx.maintenance.label}</span>
          ${ctx.conflicts.length ? `<span class="machine-risk-pill danger">${ctx.conflicts.length} تعارض</span>` : '<span class="machine-risk-pill ok">لا توجد تعارضات</span>'}
        </div>
        <div class="machine-details">
          <div><i class="fa-solid fa-users-gear"></i> مشغلو الطابور: <b>${escapeHtml(queueOperatorLabel)}</b></div>
          <div><i class="fa-solid fa-list-ol"></i> الطابور: <b>${ctx.queueCount} عمل</b></div>
          <div><i class="fa-solid fa-clock"></i> وقت الطابور: <b>${Math.round(ctx.queueMinutes / 60 * 10) / 10} ساعة</b></div>
          <div><i class="fa-solid fa-coins"></i> الكلفة التقديرية: <b>${formatMachineMoney(ctx.queuedCost)}</b></div>
          <div><i class="fa-solid fa-wrench"></i> آخر صيانة: <b>${escapeHtml(m.lastMaintenance || '-')}</b></div>
          <div><i class="fa-solid fa-arrow-down"></i> التعطل: <b>${Number(m.downtime || 0)} ساعة</b></div>
        </div>
        <div class="machine-card-linked">${ctx.linkedCards.length} بطاقات تشغيل مرتبطة</div>
        <div class="machine-bar"><div class="machine-bar-fill" style="width:${queuePct}%; background:${ctx.conflicts.length ? '#f87171' : ctx.queueCount > 3 ? '#fbbf24' : '#34d399'}"></div></div>
      </div>
    `;
  }).join('');
  grid.innerHTML = kpiHtml + renderMachineFleetIntelligencePanel() + cardsHtml;
}

async function addMachine() {
  ensureOmni();
  const html = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label>اسم الماكينة</label>
      <input type="text" id="addMachName" class="form-input" placeholder="مثال: CNC Router 125x250">
      <label>المشغل الافتراضي</label>
      ${renderMachineOperatorPickerInput('addMachOp', '', 'اختر مشغل افتراضي من الموظفين')}
      <label>الحالة</label>
      <select id="addMachStatus" class="form-input">
        <option value="operational" selected>تعمل</option>
        <option value="idle">متوقفة</option>
        <option value="maintenance">صيانة</option>
      </select>
      <label>رابط الصورة</label>
      <input type="url" id="addMachPhoto" class="form-input" placeholder="https://...">
      <label>كلفة الساعة</label>
      <input type="number" id="addMachCost" class="form-input" value="25000" min="0">
      <label>فترة الصيانة بالساعات</label>
      <input type="number" id="addMachInterval" class="form-input" value="250" min="1">
      <label>فترة الصيانة بالأيام</label>
      <input type="number" id="addMachIntervalDays" class="form-input" value="30" min="1">
      <label>تفاصيل الماكينة</label>
      <textarea id="addMachDescription" class="form-input" rows="2"></textarea>
      <label>مساحة AI للماكينة</label>
      <textarea id="addMachAiWorkspace" class="form-input" rows="3" placeholder="تعليمات أو ملاحظات يقرأها/يكتبها AI عند تنظيم تشغيل هذه الماكينة"></textarea>
    </div>
  `;
  const result = await showOmniModal('إضافة ماكينة', html, (body) => {
    const name = body.querySelector('#addMachName').value.trim();
    if (!name) return false;
    return {
      name,
      operator: body.querySelector('#addMachOp').value.trim() || '-',
      status: body.querySelector('#addMachStatus').value,
      photoUrl: body.querySelector('#addMachPhoto').value.trim(),
      hourlyCost: Number(body.querySelector('#addMachCost').value) || 25000,
      maintenanceIntervalHours: Number(body.querySelector('#addMachInterval').value) || 250,
      maintenanceIntervalDays: Number(body.querySelector('#addMachIntervalDays').value) || 30,
      description: body.querySelector('#addMachDescription')?.value.trim() || '',
      aiWorkspace: body.querySelector('#addMachAiWorkspace')?.value.trim() || ''
    };
  });
  if (!result) return;
  omni.machines.push({
    id: makeId('mach'),
    name: result.name,
    type: 'other',
    status: result.status,
    operator: result.operator,
    queue: [],
    lastMaintenance: todayISO(),
    hoursTotal: 0,
    hourlyCost: result.hourlyCost,
    maintenanceIntervalHours: result.maintenanceIntervalHours,
    maintenanceIntervalDays: result.maintenanceIntervalDays,
    lastMaintenanceHoursTotal: 0,
    maintenanceNotes: '',
    description: result.description,
    usageNotes: '',
    aiWorkspace: result.aiWorkspace,
    aiLastInstruction: '',
    model: '',
    photoUrl: result.photoUrl,
    downtime: 0,
    sopId: '',
    jobsToday: 0
  });
  saveData(); renderMachinesPage();
}

// --- deprecated machine inspector ---
function renderMachineInspectorTab_deprecated_dup1(machineId, tabIdx = 0) {
  ensureOmni();
  const data = (omni.machines||[]).find(m => m.id === machineId);
  const panel = document.getElementById('inspectorPanel');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!data || !panel || !tabs || !body) return;
  title.textContent = data.name;
  const tabList = ['نظرة عامة', 'الطابور', 'SOP', 'الصيانة', 'روابط'];
  tabs.innerHTML = tabList.map((t,i) => `<button class="insp-tab ${i===tabIdx?'active':''}" onclick="renderMachineInspectorTab_deprecated_dup1('${machineId}', ${i})">${escapeHtml(t)}</button>`).join('');
  if (tabIdx === 0) {
    body.innerHTML = `
      <div class="insp-section"><h4>الحالة</h4><p>${{operational:'تعمل',maintenance:'في الصيانة',idle:'متوقفة'}[data.status]||data.status}</p></div>
      <div class="insp-section"><h4>المشغّل</h4><p>${escapeHtml(data.operator || '-')}</p></div>
      <div class="insp-section"><h4>الطابور</h4><p>${getMachineQueueCount(data)} مهام</p></div>
      <div class="insp-section"><h4>مهام اليوم</h4><p>${data.jobsToday}</p></div>
      <div class="insp-section"><h4>ساعات العمل الكلية</h4><p>${data.hoursTotal}</p></div>
      <div class="insp-section"><h4>آخر صيانة</h4><p>${data.lastMaintenance}</p></div>
      <div class="insp-actions">
        <button class="btn-primary" onclick="editMachineFromInspector('${data.id}')"><i class="fa-solid fa-pen"></i> تعديل</button>
      </div>
    `;
  } else if (tabIdx === 1) {
    body.innerHTML = `
      <div class="insp-section">
        <h4>عناصر الطابور</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${(data.queue||[]).map(q => `
            <div style="border:1px solid #ddd;padding:8px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <b>${escapeHtml(q.title)}</b><br>
                <small style="color:#666;">مصدر: ${q.sourceType} · الوقت: ${q.estimatedMinutes}د · ${new Date(q.createdAt).toLocaleString()}</small>
              </div>
              <div style="display:flex; gap:5px;">
                ${q.status === 'queued' || q.status === 'blocked' ? `<button class="btn-xs btn-primary" onclick="updateMachineQueueStatus('${machineId}', '${q.id}', 'in_progress')"><i class="fa-solid fa-play"></i> ابدأ</button>` : ''}
                ${q.status === 'in_progress' ? `<button class="btn-xs btn-secondary" onclick="updateMachineQueueStatus('${machineId}', '${q.id}', 'blocked')"><i class="fa-solid fa-pause"></i> إيقاف</button>` : ''}
                ${q.status === 'in_progress' ? `<button class="btn-xs btn-success" style="background:#10b981;border:none;color:white;" onclick="updateMachineQueueStatus('${machineId}', '${q.id}', 'done')"><i class="fa-solid fa-check"></i> إكمال</button>` : ''}
                ${q.status === 'done' ? `<span style="color:#10b981;font-size:12px;font-weight:bold;"><i class="fa-solid fa-check-circle"></i> مكتمل</span>` : ''}
              </div>
            </div>
          `).join('')}
          ${(data.queue||[]).length === 0 ? '<p class="muted">الطابور فارغ.</p>' : ''}
          ${data.queueBacklogCount > 0 ? `<p class="muted">+ ${data.queueBacklogCount} مهام متراكمة.</p>` : ''}
        </div>
      </div>
    `;
  } else if (tabIdx === 4) {
    body.innerHTML = `
      <div class="insp-section">
        <h4>روابط وعلاقات</h4>
        ${renderEntityRelationsPanel('machine', machineId)}
      </div>
    `;
  } else {
    body.innerHTML = '<p class="muted">قريباً...</p>';
  }
}

// --- machine queue inspector actions ---
function updateMachineQueueStatus(machineId, entryId, status) {
  const machine = getMachineById(machineId);
  if (!machine) return;
  const entry = (machine.queue||[]).find(q => q.id === entryId);
  if (entry) {
    if (status === 'done' && entry.status !== 'done') {
      const minutes = getMachineQueueEntryMinutes(entry);
      const hours = (minutes / 60).toFixed(2);
      machine.hoursTotal = (Number(machine.hoursTotal) || 0) + Number(hours);
      machine.jobsToday = (Number(machine.jobsToday) || 0) + 1;
      if (!machine.activityLog) machine.activityLog = [];
      machine.activityLog.push({ date: new Date().toISOString(), text: `تم إنهاء عمل الطابور: ${entry.title} (+${hours} ساعة)` });
      showToast(`تم إنهاء العمل وإضافة ${hours} ساعة لسجل الماكينة`, 'success');
    } else if (status === 'in_progress') {
      if (!machine.activityLog) machine.activityLog = [];
      machine.activityLog.push({ date: new Date().toISOString(), text: `بدأ تنفيذ عمل الطابور: ${entry.title}` });
      showToast('تم بدء العمل على هذه المهمة في الطابور', 'success');
    } else if (status === 'blocked') {
      if (!machine.activityLog) machine.activityLog = [];
      machine.activityLog.push({ date: new Date().toISOString(), text: `تم إيقاف عمل الطابور مؤقتاً: ${entry.title}` });
      showToast('تم إيقاف المهمة مؤقتاً داخل الطابور', 'warning');
    }
    entry.status = status;
    saveData(); renderMachineInspectorTab(machineId, 1);
  }
}

function updateMachineQueueOperator(machineId, entryId, operator) {
  const machine = getMachineById(machineId);
  if (!machine) return;
  const entry = (machine.queue || []).find(q => q.id === entryId);
  if (!entry) return;
  const suggested = getMachineAiOperatorName(machine, entry);
  entry.operator = operator || suggested;
  entry.operatorType = isMachineAiOperator(entry.operator) ? 'ai' : 'human';
  entry.aiSuggestedOperator = suggested;
  entry.aiAssisted = entry.operatorType === 'ai';
  if (!Array.isArray(machine.activityLog)) machine.activityLog = [];
  machine.activityLog.push({
    date: new Date().toISOString(),
    text: `تم تحديث مشغل العمل: ${entry.title || entry.id} -> ${entry.operator || 'بدون تحديد'}`
  });
  saveData();
  renderMachineInspectorTab(machineId, 1);
  renderMachinesPage();
  showToast('تم تحديث مشغل العمل في الطابور', 'success');
}

// --- machine inspector editors ---
async function editMachineFromInspector_deprecated_dup1(machId) {
  ensureOmni();
  const m = (omni.machines||[]).find(x => x.id === machId);
  if (!m) return;
  const html = `
    <label>الحالة</label>
    <select id="machineEditStatus" class="form-input">
      ${['operational','maintenance','idle'].map(s => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <label>المشغّل</label><input id="machineEditOperator" class="form-input" value="${escapeHtml(m.operator || '')}">
    <label>إجمالي الطابور</label><input id="machineEditQueue" type="number" class="form-input" value="${getMachineQueueCount(m)}">
  `;
  const result = await showOmniModal('تعديل ماكينة', html, body => ({
    status: body.querySelector('#machineEditStatus')?.value || m.status,
    operator: body.querySelector('#machineEditOperator')?.value.trim() || m.operator,
    queueTotal: Number(body.querySelector('#machineEditQueue')?.value)
  }));
  if (!result) return;
  m.status = result.status;
  m.operator = result.operator;
  const queueTotal = parseInt(result.queueTotal, 10);
  m.queueBacklogCount = Math.max(0, (Number.isFinite(queueTotal) ? queueTotal : 0) - (Array.isArray(m.queue) ? m.queue.length : 0));
  saveData(); closeInspector(); renderMachinesPage();
}

// ═══════════ COMMAND PALETTE ═══════════
// Machine Control V100 inspector override.

// --- live machine inspector and maintenance actions ---
function renderMachineInspectorTab(machineId, tabIdx = 0) {
  ensureOmni();
  const data = (omni.machines||[]).find(m => m.id === machineId);
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!data || !tabs || !body) return;
  const ctx = getMachineOpsContext(data);
  const priorityScore = getMachinePriorityScore(data, ctx);
  const priority = getMachinePriorityLevel(priorityScore);
  const linkedSop = data.sopId ? getSopById(data.sopId) : null;
  if (title) title.textContent = data.name;
  const tabList = [
    { label: 'نظرة عامة', icon: 'fa-gauge-high' },
    { label: `الطابور (${ctx.queueCount})`, icon: 'fa-list-ol' },
    { label: 'SOP', icon: 'fa-book' },
    { label: 'الصيانة', icon: 'fa-screwdriver-wrench' },
    { label: 'الروابط', icon: 'fa-link' }
  ];
  tabs.innerHTML = tabList.map((t,i) => `<button class="insp-tab ${i===tabIdx?'active':''}" onclick="renderMachineInspectorTab('${machineId}', ${i})"><i class="fa-solid ${escapeHtml(t.icon)}" style="margin-left:4px;"></i>${escapeHtml(t.label)}</button>`).join('');

  if (tabIdx === 0) {
    body.innerHTML = `
      <div class="machine-insp-hero">
        ${renderMachinePhoto(data, 'machine-insp-photo')}
        <div>
          <h3>${escapeHtml(data.name || 'ماكينة')}</h3>
          <p>${escapeHtml(data.type || 'ماكينة')} - ${escapeHtml(data.operator || '-')}</p>
          <span class="machine-risk-pill ${priority.level}">أولوية ${priorityScore}% - ${priority.label}</span>
          <span class="machine-risk-pill ${ctx.maintenance.level}">${ctx.maintenance.label} - ${ctx.maintenance.score}%</span>
        </div>
      </div>
      <div class="machine-insp-kpis">
        <div><span>الطابور</span><b>${ctx.queueCount}</b><small>${Math.round(ctx.queueMinutes / 60 * 10) / 10} ساعة</small></div>
        <div><span>كلفة الطابور</span><b>${formatMachineMoney(ctx.queuedCost)}</b><small>${formatMachineMoney(ctx.hourlyCost)} / ساعة</small></div>
        <div><span>بطاقات مرتبطة</span><b>${ctx.linkedCards.length}</b><small>${formatMachineMoney(ctx.linkedCost)}</small></div>
        <div><span>توقف غير مخطط</span><b>${Number(data.downtime || 0)} ساعة</b><small>توقف سابق بسبب عطل/انتظار، وليس جزءاً من دورة الصيانة</small></div>
      </div>
      <div class="machine-panels-grid">
        <div class="machine-panel">
          <h4><i class="fa-solid fa-circle-info"></i> تفاصيل الماكينة</h4>
          <p>${escapeHtml(data.description || data.usageNotes || 'لا توجد تفاصيل تشغيل مكتوبة بعد. افتح تعديل الماكينة وأضف وصف الماكينة وملاحظات استعمالها حتى تكون مرجعاً قبل التشغيل.')}</p>
        </div>
        <div class="machine-panel ${data.aiWorkspace ? 'ok' : ''}">
          <h4><i class="fa-solid fa-brain"></i> مساحة AI</h4>
          <p>${escapeHtml(data.aiWorkspace || 'جاهزة لتعليمات AI الخاصة بهذه الماكينة: من يشتغل، متى، بصمة التشغيل، ربط الساعات، وتنظيم الطابور بدون تعديل الكود.')}</p>
        </div>
        <div class="machine-panel ${ctx.maintenance.level}">
          <h4><i class="fa-solid fa-wand-magic-sparkles"></i> توقع الصيانة</h4>
          <p>${ctx.maintenance.label}. ساعات التشغيل منذ آخر صيانة ${Math.round(ctx.maintenance.hoursSinceMaintenance)} / ${ctx.maintenance.intervalHours} ساعة، والمدة الزمنية ${ctx.maintenance.ageDays} / ${ctx.maintenance.intervalDays} يوم. ${ctx.maintenance.dueReason ? `سبب الاستحقاق: ${ctx.maintenance.dueReason}.` : `المتبقي تقريباً ${Math.round(ctx.maintenance.nextHours)} ساعة أو ${ctx.maintenance.nextDays} يوم.`}</p>
        </div>
        <div class="machine-panel">
          <h4><i class="fa-solid fa-coins"></i> تحليل الكلفة</h4>
          <p>كلفة الطابور النشط ${formatMachineMoney(ctx.queuedCost)} = ${Math.round(ctx.queueMinutes / 60 * 10) / 10} ساعة × ${formatMachineMoney(ctx.hourlyCost)}. ${machineQueueUsesEstimatedMinutes(data) ? 'بعض الأعمال كانت بدون وقت، فتم احتساب ساعة تقديرية لكل عمل متراكم حتى لا تبقى الكلفة صفراً.' : ''} البطاقات المفتوحة المرتبطة تحمل كلفاً مسجلة بقيمة ${formatMachineMoney(ctx.linkedCost)}.</p>
        </div>
        <div class="machine-panel ${ctx.conflicts.length ? 'danger' : 'ok'}">
          <h4><i class="fa-solid fa-triangle-exclamation"></i> تعارضات الطابور</h4>
          ${ctx.conflicts.length ? ctx.conflicts.map(w => `<p class="machine-warning ${w.level}">${escapeHtml(w.text)}</p>`).join('') : '<p>لا توجد تعارضات نشطة على هذه الماكينة.</p>'}
        </div>
      </div>
      <div class="insp-actions">
        <button class="btn-primary" onclick="editMachineFromInspector('${data.id}')"><i class="fa-solid fa-pen"></i> تعديل الماكينة</button>
        <button class="btn-secondary" onclick="renderMachineInspectorTab('${data.id}', 1)"><i class="fa-solid fa-list-check"></i> فتح الطابور</button>
        <button class="btn-secondary" onclick="renderMachineInspectorTab('${data.id}', 2)"><i class="fa-solid fa-book"></i> ربط SOP</button>
        <button class="btn-secondary" onclick="renderMachineInspectorTab('${data.id}', 3)"><i class="fa-solid fa-wrench"></i> الصيانة</button>
      </div>
    `;
  } else if (tabIdx === 1) {
    if (ensureMachineBacklogQueueEntries(data)) {
      saveData();
      renderMachinesPage();
    }
    const queue = Array.isArray(data.queue) ? data.queue : [];
    const operatorOptions = getMachineOperatorOptions(data);
    body.innerHTML = `
      ${ctx.conflicts.length ? `<div class="machine-conflict-stack">${ctx.conflicts.map(w => `<div class="machine-warning ${w.level}"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(w.text)}</div>`).join('')}</div>` : ''}
      <div class="machine-queue-help">
        <b>أزرار الطابور</b>
        <span>ابدأ العمل = هذه المهمة بدأت على الماكينة. إيقاف مؤقت = أوقف هذه المهمة مؤقتاً بسبب صيانة/مواد/قرار. إنهاء العمل = اكتملت المهمة وتضاف ساعاتها إلى سجل الماكينة.</span>
      </div>
      <div class="insp-section">
        <h4>أعمال الطابور</h4>
        <div class="machine-queue-list">
          ${queue.map(q => {
            const operator = getMachineQueueOperator(q, data);
            const aiSuggestion = getMachineAiOperatorName(data, q);
            const options = (operator && !operatorOptions.includes(operator) ? [operator, ...operatorOptions] : operatorOptions)
              .filter(name => name !== aiSuggestion);
            const statusLabel = ({ queued: 'بالانتظار', in_progress: 'قيد التشغيل', blocked: 'متوقف', done: 'مكتمل' })[q.status] || q.status || 'بالانتظار';
            const operatorTypeLabel = isMachineAiOperator(operator) ? 'AI' : 'بشري';
            return `
            <div class="machine-queue-row ${q.status || 'queued'} ${isMachineAiOperator(operator) ? 'ai-operated' : 'human-operated'}">
              <div>
                <b>${escapeHtml(q.title || 'عمل في الطابور')}</b>
                <small>${escapeHtml(getMachineQueueSourceLabel(q.sourceType))} - ${getMachineQueueEntryMinutes(q)} دقيقة - المشغل: ${escapeHtml(operator)} (${operatorTypeLabel}) - اقتراح AI: ${escapeHtml(aiSuggestion)} - ${q.createdAt ? new Date(q.createdAt).toLocaleString() : ''}</small>
              </div>
              <div class="machine-queue-actions">
                <select class="machine-queue-operator-select" onclick="event.stopPropagation()" onchange="updateMachineQueueOperator('${machineId}', '${q.id}', this.value)">
                  <option value="${escapeHtml(aiSuggestion)}" ${operator === aiSuggestion ? 'selected' : ''}>AI المقترح</option>
                  ${options.map(name => `<option value="${escapeHtml(name)}" ${operator === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
                </select>
                ${q.status === 'queued' || q.status === 'blocked' ? `<button class="btn-xs btn-primary machine-queue-action-btn" title="ابدأ تنفيذ هذه المهمة على الماكينة" onclick="updateMachineQueueStatus('${machineId}', '${q.id}', 'in_progress')"><i class="fa-solid fa-play"></i> ابدأ العمل</button>` : ''}
                ${q.status === 'in_progress' ? `<button class="btn-xs btn-secondary machine-queue-action-btn" title="إيقاف المهمة مؤقتاً بدون حذفها من الطابور" onclick="updateMachineQueueStatus('${machineId}', '${q.id}', 'blocked')"><i class="fa-solid fa-pause"></i> إيقاف مؤقت</button>` : ''}
                ${q.status === 'in_progress' ? `<button class="btn-xs btn-success machine-queue-action-btn" title="إنهاء المهمة وإضافة ساعاتها إلى سجل الماكينة" style="background:#10b981;border:none;color:white;" onclick="updateMachineQueueStatus('${machineId}', '${q.id}', 'done')"><i class="fa-solid fa-check"></i> إنهاء العمل</button>` : ''}
                <span>${escapeHtml(statusLabel)}</span>
              </div>
            </div>
          `}).join('')}
          ${queue.length === 0 ? '<p class="muted">الطابور فارغ.</p>' : ''}
          ${data.queueBacklogCount > 0 ? `<p class="muted">+ ${data.queueBacklogCount} أعمال متراكمة.</p>` : ''}
        </div>
      </div>
    `;
  } else if (tabIdx === 2) {
    const sops = omni.sops || [];
    body.innerHTML = `
      <div class="insp-section">
        <h4>إجراء SOP المرتبط</h4>
        ${linkedSop ? `<div class="machine-panel ok"><b>${escapeHtml(linkedSop.title || linkedSop.name || linkedSop.id)}</b><p>${escapeHtml(linkedSop.description || linkedSop.text || 'إجراء تشغيل مرتبط بهذه الماكينة.')}</p><small>هذا هو الإجراء الدائم لتشغيل هذه الماكينة، ويظهر لاحقاً داخل المهام والفحوص المرتبطة بها.</small></div>` : '<p class="muted">لا يوجد SOP مربوط حتى الآن. اربط SOP حتى يعرف AI/الموظف خطوات التشغيل والسلامة قبل تنفيذ أي عمل.</p>'}
      </div>
      <div class="insp-section">
        <h4>تفاصيل وملاحظات تشغيل</h4>
        <p>${escapeHtml(data.description || 'لا توجد تفاصيل ماكينة مكتوبة بعد.')}</p>
        <p>${escapeHtml(data.usageNotes || 'لا توجد ملاحظات استعمال سريعة بعد.')}</p>
      </div>
      <div class="insp-section">
        <h4>تغيير ربط SOP</h4>
        <select class="form-input" id="machineSopSelect">
          <option value="">بدون SOP</option>
          ${sops.map(s => `<option value="${s.id}" ${data.sopId === s.id ? 'selected' : ''}>${escapeHtml(s.title || s.name || s.id)}</option>`).join('')}
        </select>
        <div class="insp-actions"><button class="btn-primary" onclick="updateMachineSopLink('${machineId}')"><i class="fa-solid fa-link"></i> حفظ ربط SOP</button></div>
      </div>
    `;
  } else if (tabIdx === 3) {
    body.innerHTML = `
      <div class="machine-panel ${ctx.maintenance.level}">
        <h4>توقع الصيانة</h4>
        <p>${ctx.maintenance.label}: مستوى الخطر ${ctx.maintenance.score}%. آخر صيانة قبل ${ctx.maintenance.ageDays} يوم.</p>
      </div>
      <div class="machine-queue-help">
        <b>كيف تنحسب الصيانة؟</b>
        <span>فترة الصيانة بالساعات = كل كم ساعة تشغيل تحتاج الماكينة صيانة. فترة الصيانة بالأيام = كل كم يوم تحتاج صيانة حتى لو ما اشتغلت كثير. قراءة عداد الساعات وقت آخر صيانة = رقم عداد الماكينة يوم تمت آخر صيانة؛ لا يضيف ساعات، فقط نطرح منه ساعات الماكينة الحالية حتى نعرف كم ساعة اشتغلت بعد آخر صيانة.</span>
      </div>
      <div class="machine-insp-kpis">
        <div><span>دورة الساعات</span><b>${Math.round(ctx.maintenance.hoursSinceMaintenance)} / ${ctx.maintenance.intervalHours}</b><small>مستهلك ${ctx.maintenance.cyclePct}%</small></div>
        <div><span>دورة الزمن</span><b>${ctx.maintenance.ageDays} / ${ctx.maintenance.intervalDays} يوم</b><small>مستهلك ${ctx.maintenance.daysPct}%</small></div>
        <div><span>الصيانة القادمة</span><b>${Math.round(ctx.maintenance.nextHours)} ساعة</b><small>أو ${ctx.maintenance.nextDays} يوم</small></div>
        <div><span>توقف غير مخطط</span><b>${Number(data.downtime || 0)} ساعة</b><small>للعطل أو الانتظار السابق</small></div>
      </div>
      <div class="insp-section">
        <h4>تحديث بيانات الصيانة</h4>
        <label>تاريخ آخر صيانة</label>
        <input type="date" id="machineMaintDate" class="form-input" value="${escapeHtml(data.lastMaintenance || todayISO())}">
        <label>فترة الصيانة بالساعات</label>
        <input type="number" id="machineMaintInterval" class="form-input" value="${ctx.maintenance.intervalHours}" min="1">
        <label>فترة الصيانة بالأيام</label>
        <input type="number" id="machineMaintIntervalDays" class="form-input" value="${ctx.maintenance.intervalDays}" min="1">
        <label>قراءة عداد الساعات وقت آخر صيانة</label>
        <input type="number" id="machineMaintHoursAtService" class="form-input" value="${Math.round(ctx.maintenance.lastMaintenanceHoursTotal)}" min="0">
        <small class="machine-field-help">مثال: إذا عداد الماكينة الآن 620، وعند آخر صيانة كان 500، فالماكينة اشتغلت 120 ساعة بعد الصيانة. زر "تسجيل صيانة تمت الآن" يجعل قراءة آخر صيانة = العداد الحالي، ولا يضيف ساعات جديدة.</small>
        <label>ملاحظات الصيانة</label>
        <textarea id="machineMaintNotes" class="form-input" rows="3">${escapeHtml(data.maintenanceNotes || '')}</textarea>
        <div class="insp-actions">
          <button class="btn-primary" onclick="saveMachineMaintenanceUpdate('${machineId}')"><i class="fa-solid fa-floppy-disk"></i> حفظ الصيانة</button>
          <button class="btn-secondary" onclick="completeMachineMaintenanceNow('${machineId}')"><i class="fa-solid fa-check"></i> تسجيل صيانة تمت الآن</button>
          <button class="btn-secondary" onclick="createMachineMaintenanceRequest('${machineId}')"><i class="fa-solid fa-screwdriver-wrench"></i> رفع طلب صيانة للإدارة</button>
          <button class="btn-secondary" onclick="renderMachineInspectorTab('${machineId}', 0)"><i class="fa-solid fa-arrow-right"></i> رجوع للنظرة العامة</button>
        </div>
      </div>
      <div class="insp-section">
        <h4>سجل النشاط</h4>
        ${(data.activityLog || []).slice().reverse().slice(0, 20).map(log => `<div class="insp-activity-item"><small>${new Date(log.date).toLocaleString()}</small><br>${escapeHtml(log.text || '')}</div>`).join('') || '<p class="muted">لا يوجد نشاط مسجل لهذه الماكينة بعد.</p>'}
      </div>
    `;
  } else if (tabIdx === 4) {
    const relationsHtml = renderEntityRelationsPanel('machine', machineId);
    body.innerHTML = '<div class="insp-section"><h4>الروابط</h4>' + relationsHtml + '</div>';
  }
}

function updateMachineSopLink(machineId) {
  const machine = getMachineById(machineId);
  const select = document.getElementById('machineSopSelect');
  if (!machine || !select) return;
  machine.sopId = select.value || '';
  saveData();
  renderMachineInspectorTab(machineId, 2);
  renderMachinesPage();
}

function saveMachineMaintenanceUpdate(machineId) {
  const machine = getMachineById(machineId);
  if (!machine) return;
  machine.lastMaintenance = document.getElementById('machineMaintDate')?.value || machine.lastMaintenance || todayISO();
  machine.maintenanceIntervalHours = Number(document.getElementById('machineMaintInterval')?.value) || machine.maintenanceIntervalHours || 250;
  machine.maintenanceIntervalDays = Number(document.getElementById('machineMaintIntervalDays')?.value) || machine.maintenanceIntervalDays || 30;
  machine.lastMaintenanceHoursTotal = Number(document.getElementById('machineMaintHoursAtService')?.value);
  if (!Number.isFinite(machine.lastMaintenanceHoursTotal)) machine.lastMaintenanceHoursTotal = Number(machine.hoursTotal) || 0;
  machine.maintenanceNotes = document.getElementById('machineMaintNotes')?.value || '';
  if (!Array.isArray(machine.activityLog)) machine.activityLog = [];
  machine.activityLog.push({ date: new Date().toISOString(), text: 'تم تحديث ملف الصيانة' });
  saveData();
  renderMachineInspectorTab(machineId, 3);
  renderMachinesPage();
}

function completeMachineMaintenanceNow(machineId) {
  const machine = getMachineById(machineId);
  if (!machine) return;
  machine.lastMaintenance = todayISO();
  machine.lastMaintenanceHoursTotal = Number(machine.hoursTotal) || 0;
  if (machine.status === 'maintenance') machine.status = 'operational';
  if (!Array.isArray(machine.activityLog)) machine.activityLog = [];
  machine.activityLog.push({ date: new Date().toISOString(), text: 'تم تسجيل صيانة مكتملة الآن وتصفير دورة الساعات والزمن' });
  saveData();
  renderMachineInspectorTab(machineId, 3);
  renderMachinesPage();
  showToast('تم تسجيل الصيانة وتحديث الدورة القادمة', 'success');
}

function getOrCreateMachineMaintenanceTaskType() {
  ensureOmni();
  if (!omni.taskManager) omni.taskManager = { selectedSpaceId: '', spaces: [] };
  if (!Array.isArray(omni.taskManager.spaces)) omni.taskManager.spaces = [];
  let space = omni.taskManager.spaces.find(s => /ورش|عمليات|صيانة|Operations|Maintenance/i.test(String(s.name || '')));
  if (!space) {
    space = { id: makeId('space'), name: 'عمليات وصيانة المكائن', departments: [] };
    omni.taskManager.spaces.unshift(space);
  }
  if (!Array.isArray(space.departments)) space.departments = [];
  let dep = space.departments.find(d => /صيانة|Maintenance/i.test(String(d.name || '')));
  if (!dep) {
    dep = { id: makeId('dep'), name: 'الصيانة', sections: [] };
    space.departments.unshift(dep);
  }
  if (!Array.isArray(dep.sections)) dep.sections = [];
  let section = dep.sections.find(s => /طلبات|Requests|صيانة/i.test(String(s.name || '')));
  if (!section) {
    section = { id: makeId('sec'), name: 'طلبات الصيانة', taskTypes: [] };
    dep.sections.unshift(section);
  }
  if (!Array.isArray(section.taskTypes)) section.taskTypes = [];
  let type = section.taskTypes.find(t => /ماكينة|Machine|صيانة/i.test(String(t.name || '')));
  if (!type) {
    type = { id: makeId('type'), name: 'صيانة ماكينة', tasks: [] };
    section.taskTypes.unshift(type);
  }
  return { space, dep, section, type };
}

function createMachineMaintenanceRequest(machineId) {
  const machine = getMachineById(machineId);
  if (!machine) return;
  const ctx = getMachineOpsContext(machine);
  const { type, dep, section } = getOrCreateMachineMaintenanceTaskType();
  const existing = (type.tasks || []).find(task =>
    !task.deleted &&
    normalizeTaskStatus(task.status) !== 'done' &&
    (task.machineIds || []).includes(machineId) &&
    String(task.sourceType || '') === 'machine_maintenance'
  );
  if (existing) {
    showToast('يوجد طلب صيانة مفتوح لهذه الماكينة مسبقاً', 'warning');
    openTaskManagerInspector(existing.id, 0);
    return;
  }
  const task = {
    id: makeId('task'),
    title: `طلب صيانة: ${machine.name || machineId}`,
    status: 'todo',
    priority: ctx.maintenance.level === 'danger' ? 'urgent' : 'high',
    owner: '',
    assigneeId: '',
    assignedTo: '',
    employeeId: '',
    dueDate: todayISO(),
    department: dep?.name || 'الصيانة',
    section: section?.name || 'طلبات الصيانة',
    category: type.name,
    sourceType: 'machine_maintenance',
    sourceId: machineId,
    machineIds: [machineId],
    sopIds: machine.sopId ? [machine.sopId] : [],
    description: `الماكينة: ${machine.name || machineId}\nالحالة: ${ctx.maintenance.label}\nسبب الاستحقاق: ${ctx.maintenance.dueReason || 'متابعة دورية'}\nالساعات منذ آخر صيانة: ${Math.round(ctx.maintenance.hoursSinceMaintenance)} / ${ctx.maintenance.intervalHours}\nالأيام منذ آخر صيانة: ${ctx.maintenance.ageDays} / ${ctx.maintenance.intervalDays}\nملاحظات: ${machine.maintenanceNotes || '-'}`,
    subtasks: [
      { id: makeId('sub'), title: 'فحص الحالة العامة والإنذارات', done: false },
      { id: makeId('sub'), title: 'تنظيف/تزييت/معايرة حسب SOP', done: false },
      { id: makeId('sub'), title: 'تحديث تاريخ وساعات آخر صيانة', done: false }
    ],
    checklist: [],
    comments: [],
    activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء طلب صيانة من لوحة المكائن' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!Array.isArray(type.tasks)) type.tasks = [];
  type.tasks.unshift(task);
  if (!Array.isArray(machine.activityLog)) machine.activityLog = [];
  machine.activityLog.push({ date: new Date().toISOString(), text: `تم رفع طلب صيانة للإدارة: ${task.title}` });
  normalizeTaskManagerV2();
  saveData();
  renderMachineInspectorTab(machineId, 3);
  renderMachinesPage();
  showToast('تم رفع طلب الصيانة إلى Task Manager', 'success');
}

async function editMachineFromInspector(machId) {
  ensureOmni();
  const m = (omni.machines||[]).find(x => x.id === machId);
  if (!m) return;
  const sopOptions = (omni.sops || []).map(s => `<option value="${s.id}" ${m.sopId === s.id ? 'selected' : ''}>${escapeHtml(s.title || s.name || s.code || s.id)}</option>`).join('');
  const queueHours = Math.round(getMachineQueueMinutes(m) / 60 * 10) / 10;
  const html = `
    <div style="display:grid;gap:10px;">
      <label>الحالة</label>
      <select id="machineEditStatus" class="form-input">
        ${[
          ['operational', 'تعمل'],
          ['maintenance', 'صيانة'],
          ['idle', 'متوقفة']
        ].map(([value, label]) => `<option value="${value}" ${m.status === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <label>المشغل</label>
      ${renderMachineOperatorPickerInput('machineEditOperator', m.operator || '', 'اختر المشغل الافتراضي من الموظفين')}
      <label>موديل / رقم الماكينة</label>
      <input id="machineEditModel" class="form-input" value="${escapeHtml(m.model || '')}">
      <label>تفاصيل الماكينة</label>
      <textarea id="machineEditDescription" class="form-input" rows="3">${escapeHtml(m.description || '')}</textarea>
      <label>ملاحظات استعمال سريعة</label>
      <textarea id="machineEditUsage" class="form-input" rows="3">${escapeHtml(m.usageNotes || '')}</textarea>
      <label>مساحة AI للماكينة</label>
      <textarea id="machineEditAiWorkspace" class="form-input" rows="4" placeholder="AI يكتب هنا تعليمات تشغيل، ربط بصمة، أو ملاحظات تنظيمية بدون تعديل الكود">${escapeHtml(m.aiWorkspace || '')}</textarea>
      <label>SOP تشغيل الماكينة</label>
      <select id="machineEditSop" class="form-input">
        <option value="">بدون SOP</option>
        ${sopOptions}
      </select>
      <div class="machine-readonly-field">
        <span>الطابور الحالي</span>
        <b>${getMachineQueueCount(m)} عمل · ${queueHours} ساعة</b>
        <small>هذا رقم تلقائي من المهام وباقات التشغيل، لذلك لا ينعدل من هنا.</small>
      </div>
      <label>رابط الصورة</label>
      <input id="machineEditPhoto" type="url" class="form-input" value="${escapeHtml(m.photoUrl || '')}">
      <label>كلفة الساعة</label>
      <input id="machineEditCost" type="number" class="form-input" value="${getMachineHourlyCost(m)}" min="0">
      <label>ساعات توقف غير مخطط</label>
      <input id="machineEditDowntime" type="number" class="form-input" value="${Number(m.downtime || 0)}" min="0">
      <small class="machine-field-help">هذا ليس وقت الصيانة الدورية. هذا وقت عطل/انتظار سابق أثر على جاهزية الماكينة.</small>
    </div>
  `;
  const result = await showOmniModal('تعديل الماكينة', html, body => ({
    status: body.querySelector('#machineEditStatus')?.value || m.status,
    operator: body.querySelector('#machineEditOperator')?.value.trim() || m.operator,
    model: body.querySelector('#machineEditModel')?.value.trim() || '',
    description: body.querySelector('#machineEditDescription')?.value.trim() || '',
    usageNotes: body.querySelector('#machineEditUsage')?.value.trim() || '',
    aiWorkspace: body.querySelector('#machineEditAiWorkspace')?.value.trim() || '',
    sopId: body.querySelector('#machineEditSop')?.value || '',
    photoUrl: body.querySelector('#machineEditPhoto')?.value.trim() || '',
    hourlyCost: Number(body.querySelector('#machineEditCost')?.value) || getMachineHourlyCost(m),
    downtime: Number(body.querySelector('#machineEditDowntime')?.value) || 0
  }));
  if (!result) return;
  m.status = result.status;
  m.operator = result.operator;
  m.model = result.model;
  m.description = result.description;
  m.usageNotes = result.usageNotes;
  m.aiWorkspace = result.aiWorkspace;
  m.aiLastInstruction = result.aiWorkspace ? new Date().toISOString() : (m.aiLastInstruction || '');
  m.sopId = result.sopId;
  m.photoUrl = result.photoUrl;
  m.hourlyCost = result.hourlyCost;
  m.costPerHour = result.hourlyCost;
  m.downtime = result.downtime;
  if (!Array.isArray(m.activityLog)) m.activityLog = [];
  m.activityLog.push({ date: new Date().toISOString(), text: 'تم تحديث بيانات الماكينة' });
  saveData();
  renderMachineInspectorTab(machId, 0);
  renderMachinesPage();
}
