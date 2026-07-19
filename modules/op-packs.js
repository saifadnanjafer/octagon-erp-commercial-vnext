function seedMissingDefaultOpPacks() {
  if (!Array.isArray(omni.opPacks)) return;
  const existingIds = new Set(omni.opPacks.map(p => p.id));
  if (!existingIds.has('pack_vinyl_wrap_car')) {
    const vinyl = defaultOpPacks().find(p => p.id === 'pack_vinyl_wrap_car');
    if (vinyl) {
      omni.opPacks.push(JSON.parse(JSON.stringify(vinyl)));
      console.log('[OMNI] Seeded missing default pack: pack_vinyl_wrap_car');
    }
  }
}

// defaultQcRecords() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

// V4 data is now integrated directly into ensureOmni() above.

// ═══════════ COMMAND CENTER ═══════════

function getOperationPackTrace(packId) {
  ensureOmni();
  const cards = (omni.kanban?.cards || []).filter(card => card.operationPackId === packId);
  const tasks = typeof getTasksForOperationPack === 'function' ? getTasksForOperationPack(packId) : [];
  const qcIds = new Set();
  cards.forEach(card => (card.qcRecordIds || []).forEach(id => qcIds.add(id)));
  tasks.forEach(task => (task.qcRecordIds || []).forEach(id => qcIds.add(id)));
  const qcRecords = [...qcIds].map(getQcRecordById).filter(Boolean);
  return {
    cards,
    tasks,
    qcRecords,
    openCards: cards.filter(card => !isCardDone(card)).length,
    openTasks: tasks.filter(task => normalizeTaskStatus(task.status) !== 'done').length,
    overdueTasks: tasks.filter(taskManagerTaskIsOverdue).length,
    failedQc: qcRecords.filter(qc => qc.result === 'fail').length
  };
}

function renderOperationPackTracePanel() {
  const packs = omni.opPacks || [];
  return `<section class="op-pack-trace-panel glass-card">
    <div class="op-pack-history-head">
      <div>
        <span class="cc-source-label">تتبّع الربط</span>
        <h3>أثر باقات العمليات</h3>
      </div>
      <button class="btn-secondary" onclick="renderOpPacks()"><i class="fa-solid fa-rotate"></i> تحديث</button>
    </div>
    <div class="op-pack-trace-grid">
      ${packs.map(pack => {
        const trace = getOperationPackTrace(pack.id);
        return `<button class="op-pack-trace-card" onclick="openInspector('oppack','${pack.id}')">
          <b>${escapeHtml(pack.name || pack.id)}</b>
          <div><span>${trace.cards.length}</span><small>اللوحة</small></div>
          <div><span>${trace.tasks.length}</span><small>مهام</small></div>
          <div><span>${trace.qcRecords.length}</span><small>QC</small></div>
          <small>${trace.openCards} بطاقات مفتوحة · ${trace.openTasks} مهام مفتوحة · ${trace.overdueTasks} متأخرة</small>
        </button>`;
      }).join('') || '<div class="op-pack-history-empty">لا توجد باقات عمليات بعد.</div>'}
    </div>
  </section>`;
}

function openOperationPackTraceTask(taskId) {
  if (!taskId) return;
  switchPage('task_manager');
  setTimeout(() => openTaskManagerInspector(taskId, 0), 60);
}

function openOperationPackTraceCard(cardId) {
  if (!cardId) return;
  switchPage('kanban');
  setTimeout(() => openKanbanCardInspector(cardId), 60);
}

function openOperationPackTraceQc(qcId) {
  if (!qcId) return;
  switchPage('qc_center');
  setTimeout(() => openQcInspector(qcId, 0), 60);
}

function renderOperationPackInspectorTrace(pack) {
  const trace = getOperationPackTrace(pack.id);
  return `<div class="pack-designer-section op-pack-trace-section">
    <h4 class="pack-designer-section-title"><i class="fa-solid fa-route"></i> أثر الربط المباشر</h4>
    <div class="op-pack-trace-kpis">
      <div><b>${trace.cards.length}</b><span>بطاقات اللوحة</span></div>
      <div><b>${trace.tasks.length}</b><span>مهام Task Manager</span></div>
      <div><b>${trace.qcRecords.length}</b><span>سجلات QC</span></div>
      <div><b>${trace.overdueTasks}</b><span>مهام متأخرة</span></div>
    </div>
    <div class="op-pack-trace-lists">
      <div>
        <h5>اللوحة</h5>
        ${trace.cards.slice(0, 6).map(card => `<button onclick="openOperationPackTraceCard('${card.id}')"><b>${escapeHtml(card.title || card.id)}</b><span>${escapeHtml(card.columnId || '-')} · ${escapeHtml(translatePriority(card.priority || 'Normal'))}</span></button>`).join('') || '<p class="muted">لا توجد بطاقات اللوحة مرتبطة بعد.</p>'}
      </div>
      <div>
        <h5>Tasks</h5>
        ${trace.tasks.slice(0, 6).map(task => `<button onclick="openOperationPackTraceTask('${task.id}')"><b>${escapeHtml(task.title || task.id)}</b><span>${escapeHtml(taskStatusMeta(task.status).label)} · ${escapeHtml(task.owner || task.assignedTo || 'بدون مسؤول')}</span></button>`).join('') || '<p class="muted">لا توجد مهام مرتبطة بعد.</p>'}
      </div>
      <div>
        <h5>الجودة</h5>
        ${trace.qcRecords.slice(0, 6).map(qc => `<button onclick="openOperationPackTraceQc('${qc.id}')"><b>${escapeHtml(qc.title || translateQcType(qc.type) || qc.id)}</b><span>${escapeHtml(translateQcResult(qc.result || qc.status) || 'قيد الانتظار')}</span></button>`).join('') || '<p class="muted">لا توجد سجلات جودة مرتبطة بعد.</p>'}
      </div>
    </div>
  </div>`;
}

window.switchMrpTab = function(tabName) {
  window.mrpActiveTab = tabName;
  renderOpPacks();
};

window.setWoFilterState = function(state) {
  window.woFilterState = state;
  renderOpPacks();
};

// T0.4 dedup (2026-07-12): dead copy (no KPI strip, no priced-count),
// shadowed by the richer live definition further below. Kept per add-only
// rule.
function renderOpPacks_deprecated_dup1() {
  ensureOmni();
  const el = document.getElementById('opPacksGrid');
  if (!el) return;

  if (!window.mrpActiveTab) window.mrpActiveTab = 'packs';
  const activeTab = window.mrpActiveTab;

  const tabSelectors = `
    <div class="procurement-tabs" style="display: flex; gap: 8px; border-bottom: 2px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 16px; width: 100%; flex-wrap: wrap;">
      <button class="btn-tab ${activeTab === 'packs' ? 'active' : ''}" style="background: ${activeTab === 'packs' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'packs' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchMrpTab('packs')"><i class="fa-solid fa-folder-open"></i> باقات العمليات والمصمم</button>
      <button class="btn-tab ${activeTab === 'work_orders' ? 'active' : ''}" style="background: ${activeTab === 'work_orders' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'work_orders' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchMrpTab('work_orders')"><i class="fa-solid fa-industry"></i> أوامر العمل والتنفيذ</button>
      <button class="btn-tab ${activeTab === 'analytics' ? 'active' : ''}" style="background: ${activeTab === 'analytics' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'analytics' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchMrpTab('analytics')"><i class="fa-solid fa-chart-line"></i> تكاليف الإنتاج والتالف</button>
    </div>
  `;

  if (activeTab === 'packs') {
    const packs = omni.opPacks || [];
    const gridHtml = packs.map(pack => {
      const cardPreview = buildOpPackPreview(pack);
      const cardPricing = computeOpPackPricing(pack, cardPreview.totalCost || pack.estimatedCost || 0, cardPreview.jobSize);
      const trace = getOperationPackTrace(pack.id);
      return `
      <div class="op-pack-card glass-card" onclick="openInspector('oppack', '${pack.id}')">
        <div class="op-pack-icon">${pack.icon || '📦'}</div>
        <h3>${pack.name}</h3>
        <p>${pack.description}</p>
        <div class="op-pack-card-price">
          <span class="op-pack-card-price-label">السعر للعميل${isOpPackUnitVariable(pack) ? ` <small>(لـ ${pack.defaultSize || 1} ${escapeHtml(opPackUnitTypeShort(pack.unitType))})</small>` : ''}</span>
          <span class="op-pack-card-price-amount">${cardPricing.customerPrice.toLocaleString()} <small>د.ع</small></span>
          ${cardPricing.hasMarkup ? `<span class="op-pack-card-price-cost">كلفتنا: ${cardPricing.internalCost.toLocaleString()} د.ع</span>` : ''}
        </div>
        <div class="op-pack-meta">
          <span><i class="fa-solid fa-list-check"></i> ${pack.steps.length} خطوة</span>
          <span><i class="fa-solid fa-clock"></i> ${pack.estimatedTime}</span>
          <span><i class="fa-solid fa-route"></i> ${trace.cards.length} بطاقة · ${trace.tasks.length} مهمة</span>
        </div>
        <div class="op-pack-tags">
          ${(pack.machines||[]).map(m => `<span class="op-tag op-tag-machine"><i class="fa-solid fa-gear"></i> ${m}</span>`).join('')}
          ${(pack.materials||[]).map(m => `<span class="op-tag op-tag-material"><i class="fa-solid fa-cube"></i> ${m}</span>`).join('')}
        </div>
        <div class="op-pack-steps-preview">
          ${pack.steps.slice(0,5).map((s,i) => `<div class="op-step-mini"><span class="op-step-num">${i+1}</span>${s.title}</div>`).join('')}
          ${pack.steps.length > 5 ? `<div class="op-step-mini op-step-more">+${pack.steps.length - 5} خطوات أخرى</div>` : ''}
        </div>
        <div class="op-pack-actions">
          <button class="btn-primary" onclick="event.stopPropagation(); executeOpPack('${pack.id}')"><i class="fa-solid fa-user-plus"></i> استخدمها لعميل جديد</button>
          <button class="btn-secondary" onclick="event.stopPropagation(); editOpPackHeader('${pack.id}')" title="تعديل الباقة"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-secondary" onclick="event.stopPropagation(); cloneOpPack('${pack.id}')" title="نسخة جديدة من هذه الباقة"><i class="fa-solid fa-copy"></i></button>
          <button class="btn-secondary op-btn-danger" onclick="event.stopPropagation(); deleteOpPack('${pack.id}')" title="حذف الباقة"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    `;
    }).join('');

    el.innerHTML = `
      ${tabSelectors}
      ${renderOperationPackTracePanel()}
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; width: 100%;">
        ${gridHtml}
      </div>
    `;
  } else if (activeTab === 'work_orders') {
    el.innerHTML = `
      ${tabSelectors}
      ${renderWorkOrdersTab()}
    `;
  } else if (activeTab === 'analytics') {
    el.innerHTML = `
      ${tabSelectors}
      ${renderMrpAnalyticsTab()}
    `;
  }
}

async function addOpPack() {
  ensureOmni();
  const name = await showOmniPrompt('اسم الباقة الجديدة:');
  if (!name) return;  // user cancelled or left blank — DO NOT create
  const pack = {
    id: makeId('pack'),
    name: name.trim(),
    icon: '📦',
    description: '',
    steps: [],
    materials: [], machines: [],
    estimatedTime: '',
    estimatedCost: 0,
    qcGates: [], failPoints: [],
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء الباقة: ${name.trim()}` }]
  };
  omni.opPacks.push(pack);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPacks();
  openInspector('oppack', pack.id);
  showToast(`تم إنشاء "${pack.name}". أكمل التصميم: أيقونة، وصف، خطوات.`, 'success');
}

function editOpPackHeader(packId) {
  openInspector('oppack', packId);
}

function updateOpPackHeader(packId, field, value) {
  ensureOmni();
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const allowed = ['name', 'icon', 'description', 'estimatedTime', 'defaultSize'];
  if (!allowed.includes(field)) return;
  const newVal = typeof value === 'string' ? value.trim() : value;
  if (field === 'name' && !newVal) {
    showToast('اسم الباقة لا يمكن أن يكون فارغاً', 'warning');
    renderOpPackInspectorTab(packId);
    return;
  }
  if (field === 'defaultSize') {
    const n = Math.max(0.1, Number(newVal) || 1);
    if (pack.defaultSize === n) return;
    pack.defaultSize = n;
  } else {
    if (pack[field] === newVal) return;
    pack[field] = newVal;
  }
  const fieldLabel = ({
    name: 'الاسم', icon: 'الأيقونة', description: 'الوصف',
    estimatedTime: 'الوقت المتوقع', defaultSize: 'المقاس الافتراضي'
  })[field] || field;
  addOperationPackActivity(packId, `تم تحديث ${fieldLabel}`);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPacks(); renderOpPackInspectorTab(packId);
}

function updateOpPackPricing(packId, field, value) {
  ensureOmni();
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const allowed = ['overheadPct', 'logisticsFixed', 'logisticsPerUnit', 'profitMarginPct'];
  if (!allowed.includes(field)) return;
  if (!pack.pricing) pack.pricing = {};
  const num = Math.max(0, Number(value) || 0);
  if (pack.pricing[field] === num) return;
  pack.pricing[field] = num;
  const fieldLabel = ({
    overheadPct: 'نسبة المصاريف العامة',
    logisticsFixed: 'اللوجستيات الثابتة',
    logisticsPerUnit: 'اللوجستيات لكل وحدة',
    profitMarginPct: 'نسبة الربح'
  })[field] || field;
  addOperationPackActivity(packId, `تم تحديث ${fieldLabel} إلى ${num}`);
  saveData(); renderOpPacks(); renderOpPackInspectorTab(packId);
}

function updateOpPackUnitType(packId, unitType) {
  ensureOmni();
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  if (!OP_PACK_UNIT_TYPES[unitType]) return;
  if (pack.unitType === unitType) return;
  pack.unitType = unitType;
  pack.unitLabel = opPackUnitTypeLabel(unitType);
  if (unitType !== 'fixed' && (!pack.defaultSize || pack.defaultSize < 0.1)) pack.defaultSize = 1;
  addOperationPackActivity(packId, `تم تغيير نوع التسعير إلى: ${pack.unitLabel}`);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPacks(); renderOpPackInspectorTab(packId);
}

async function deleteOpPack(packId) {
  ensureOmni();
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const ok = await showOmniConfirm('حذف الباقة', `هل أنت متأكد من حذف الباقة "${pack.name}"؟ لن يتم حذف بطاقات اللوحة المولّدة سابقاً.`, 'حذف', 'إلغاء');
  if (!ok) return;
  omni.opPacks = (omni.opPacks || []).filter(p => p.id !== packId);
  saveData(); renderOpPacks();
  closeInspector?.();
  showToast(`تم حذف الباقة "${pack.name}"`, 'info');
}

// Duplicate any existing pack into a new editable copy. This is the replacement for the
// removed templates marketplace — the user can pick any pack he already has (default or
// custom) and clone it as the starting point for a new variant.
function cloneOpPack(packId) {
  ensureOmni();
  const src = (omni.opPacks || []).find(p => p.id === packId);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = makeId('pack');
  copy.name = `${src.name} (نسخة)`;
  // Re-id every step so step-level references stay unique.
  if (Array.isArray(copy.steps)) {
    copy.steps.forEach(step => { step.id = makeId('opstep'); });
  }
  copy.activityLog = [{ date: new Date().toISOString(), text: `تم إنشاء نسخة من باقة: ${src.name}` }];
  delete copy.sourceTemplateId;
  recalculateOpPackTotals(copy);
  omni.opPacks.push(copy);
  saveData();
  renderOpPacks();
  openInspector('oppack', copy.id);
  showToast(`✓ تم نسخ "${src.name}". عدّل النسخة بحرية.`, 'success');
}


// ───────── Unit-aware pricing helpers ─────────
// A pack has a unitType: 'fixed' (current behavior — qty/time/cost as entered),
// 'm2' (square meters), 'linear_m' (linear meters), or 'piece' (per-piece). Each material
// requirement can be 'fixed' or 'per_unit'; each step has optional minutesPerUnit and
// extraCostPerUnit that scale with the job size.
const OP_PACK_UNIT_TYPES = {
  fixed:     { label: 'كميات ثابتة',          short: '',     unitWord: '' },
  m2:        { label: 'حسب المساحة (م²)',     short: 'م²',   unitWord: 'م²' },
  linear_m:  { label: 'حسب الطول (متر طولي)', short: 'متر',  unitWord: 'متر طولي' },
  piece:     { label: 'حسب القطعة',           short: 'قطعة', unitWord: 'قطعة' }
};
function opPackUnitTypeLabel(type) { return (OP_PACK_UNIT_TYPES[type] || OP_PACK_UNIT_TYPES.fixed).label; }
function opPackUnitTypeShort(type) { return (OP_PACK_UNIT_TYPES[type] || OP_PACK_UNIT_TYPES.fixed).short; }
function isOpPackUnitVariable(pack) { return pack && pack.unitType && pack.unitType !== 'fixed'; }
function resolveOpPackJobSize(pack, sizeOverride) {
  if (!isOpPackUnitVariable(pack)) return 1;
  const candidate = (sizeOverride !== undefined && sizeOverride !== null && !isNaN(Number(sizeOverride)))
    ? Number(sizeOverride)
    : Number(pack.defaultSize || 1);
  return candidate > 0 ? candidate : 1;
}
function resolveStepMaterialQty(req, pack, jobSize) {
  const baseQty = Number(req.qty) || 0;
  if (req.mode === 'per_unit' && isOpPackUnitVariable(pack)) {
    return baseQty * (Number(jobSize) || 0);
  }
  return baseQty;
}
function resolveStepMinutes(step, pack, jobSize) {
  const base = Number(step.estimatedMinutes) || 0;
  if (!isOpPackUnitVariable(pack)) return base;
  return base + (Number(step.minutesPerUnit) || 0) * (Number(jobSize) || 0);
}
function resolveStepExtraCost(step, pack, jobSize) {
  const baseExtra = Number(step.extraCost !== undefined ? step.extraCost : 0) || 0;
  if (!isOpPackUnitVariable(pack)) return baseExtra;
  return baseExtra + (Number(step.extraCostPerUnit) || 0) * (Number(jobSize) || 0);
}

// ───────── Customer pricing layer ─────────
// Given the internal cost (materials + labor + extra, already size-aware) and a job size,
// produces the customer-facing price breakdown: internal → +overhead → +logistics → ×profit
// = customer price. All percentages are applied against the previous subtotal so they stack
// cleanly. This is what the user charges; the cost numbers stay internal-only.
function computeOpPackPricing(pack, internalCost, jobSize) {
  const pricing = pack.pricing || {};
  const size = Number(jobSize) || 1;
  const cost = Math.round(Number(internalCost) || 0);
  const overheadPct = Number(pricing.overheadPct) || 0;
  const logisticsFixed = Number(pricing.logisticsFixed) || 0;
  const logisticsPerUnitRate = Number(pricing.logisticsPerUnit) || 0;
  const profitPct = Number(pricing.profitMarginPct) || 0;

  const overheadAmount = Math.round(cost * (overheadPct / 100));
  const logisticsAmount = Math.round(logisticsFixed + (isOpPackUnitVariable(pack) ? logisticsPerUnitRate * size : 0));
  const subtotal = cost + overheadAmount + logisticsAmount;
  const profitAmount = Math.round(subtotal * (profitPct / 100));
  const customerPrice = subtotal + profitAmount;

  return {
    internalCost: cost,
    overheadPct,
    overheadAmount,
    logisticsFixed,
    logisticsPerUnitRate,
    logisticsPerUnitTotal: Math.round(isOpPackUnitVariable(pack) ? logisticsPerUnitRate * size : 0),
    logisticsAmount,
    subtotal,
    profitPct,
    profitAmount,
    customerPrice,
    jobSize: size,
    hasMarkup: overheadPct > 0 || logisticsFixed > 0 || logisticsPerUnitRate > 0 || profitPct > 0
  };
}

function recalculateOpPackTotals(pack) {
  if (!pack || !Array.isArray(pack.steps) || pack.steps.length === 0) return;
  let totalMinutes = 0;
  let totalCost = 0;
  pack.steps.forEach(step => {
    step.costImpact = calculateStepCostImpact(step, pack);
    totalMinutes += Number(step.estimatedMinutes) || 0;
    totalCost += Number(step.costImpact) || 0;
  });
  pack.estimatedCost = Math.round(totalCost);
  if (totalMinutes > 0) {
    if (totalMinutes < 60) pack.estimatedTime = `${totalMinutes} دقيقة`;
    else if (totalMinutes < 60 * 24) pack.estimatedTime = `${(totalMinutes/60).toFixed(1)} ساعة`;
    else pack.estimatedTime = `${(totalMinutes/60/24).toFixed(1)} يوم`;
  }
}

function recalculateAllOpPackTotals() {
  (omni.opPacks || []).forEach(recalculateOpPackTotals);
}

function executeOpPack(packId) {
  previewOperationPackExecution(packId);
}

function previewOperationPackExecution(packId) {
  ensureOmni();
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const jobSize = resolveOpPackJobSize(pack);
  const preview = buildOpPackPreview(pack, jobSize);
  const sampleClient = 'عميل / مشروع';
  const generatedCards = buildOperationPackGeneratedCards(pack, sampleClient, jobSize);
  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!panel || !overlay || !title || !tabs || !body) {
    executeOperationPackWithLinks(packId);
    return;
  }
  title.textContent = `معاينة قبل إنشاء البطاقات: ${pack.name}`;
  tabs.innerHTML = '';
  body.innerHTML = `
    <div class="op-pack-preview-hero">
      <div>
        <h4>${escapeHtml(pack.icon || '📦')} ${escapeHtml(pack.name)}</h4>
        <p>${escapeHtml(pack.description || 'بدون وصف')}</p>
      </div>
      <span class="op-pack-preview-pill">${(pack.steps || []).length} خطوة</span>
    </div>
    ${isOpPackUnitVariable(pack) ? `<div class="insp-section op-pack-size-section">
      <h4><i class="fa-solid fa-ruler-combined"></i> مقاس الشغل (${escapeHtml(opPackUnitTypeShort(pack.unitType))})</h4>
      <p class="muted" style="margin:0 0 8px 0;font-size:11px">جميع الكميات والكلف والوقت ستُحسب بناءً على المقاس أدناه.</p>
      <input id="opPackPreviewSize" type="number" min="0.1" step="0.1" class="workflow-insp-input" value="${jobSize}" oninput="refreshOpPackGeneratedPreview('${pack.id}')">
    </div>` : ''}
    <div class="op-pack-preview-metrics">
      <div><span>الوقت المتوقع</span><b id="opPackPreviewTotalMinutes">${preview.totalMinutes ? preview.totalMinutes + ' دقيقة' : (pack.estimatedTime || '-')}</b></div>
      <div><span>كلفتنا الداخلية</span><b id="opPackPreviewTotalCost">${(preview.totalCost || pack.estimatedCost || 0).toLocaleString()} د.ع</b></div>
      <div class="op-pack-preview-customer-price"><span>السعر للعميل</span><b id="opPackPreviewCustomerPrice">${(computeOpPackPricing(pack, preview.totalCost, preview.jobSize).customerPrice).toLocaleString()} د.ع</b></div>
      <div><span>المواد / المكائن</span><b>${preview.materials.length} / ${preview.machines.length}</b></div>
    </div>
    <div class="insp-section">
      <h4><i class="fa-solid fa-user-tie"></i> اسم العميل / المشروع</h4>
      <input id="opPackPreviewClient" class="workflow-insp-input" value="${escapeHtml(sampleClient)}" oninput="refreshOpPackGeneratedPreview('${pack.id}')" placeholder="اكتب اسم العميل أو رقم المشروع">
    </div>
    <div class="insp-section">
      <h4><i class="fa-solid fa-table-cells"></i> بطاقات اللوحة التي ستُولَّد</h4>
      <div id="opPackGeneratedPreview" class="op-pack-generated-list">
        ${renderOperationPackGeneratedCardsPreview(generatedCards)}
      </div>
    </div>
    <div class="insp-section">
      <h4><i class="fa-solid fa-link"></i> ربط الخطوات (SOP / ماكينة / مواد)</h4>
      <div class="op-pack-step-link-list">
        ${(pack.steps || []).map((step, index) => {
          const sopId = step.sopId || findSopIdByRef(step.sopRef);
          const machineId = step.machineId || step.machineRef || findMachineIdByRef(step.machineRef || step.machine || step.title);
          const sop = getSopById(sopId);
          const machine = getMachineById(machineId);
          const reqs = getStepMaterialRequirements(step, pack);
          return `<div class="op-pack-step-link">
            <b>${index + 1}. ${escapeHtml(step.title || 'خطوة')}</b>
            <span>SOP: ${escapeHtml(sop?.title || step.sopRef || 'غير محدد')}</span>
            <span>الماكينة: ${escapeHtml(machine?.name || step.machineRef || step.machine || 'غير محدد')}</span>
            <span>المواد: ${reqs.length ? reqs.map(req => {
              const material = getMaterialById(req.materialId);
              const resolved = resolveStepMaterialQty(req, pack, jobSize);
              return `${escapeHtml(material?.name || req.materialId)} × ${resolved}`;
            }).join('، ') : 'لا توجد'}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="insp-section">
      <h4><i class="fa-solid fa-triangle-exclamation"></i> التحذيرات</h4>
      ${preview.materialWarnings.length ? `<div class="op-pack-warning danger">نقص مواد: ${preview.materialWarnings.map(w => `${escapeHtml(w.name)} يحتاج ${w.qty}، متاح ${w.available}`).join(' • ')}</div>` : '<div class="op-pack-warning ok">✓ جميع المواد متوفرة</div>'}
      ${preview.machineWarnings.length ? `<div class="op-pack-warning danger">حالة مكينة: ${preview.machineWarnings.map(w => `${escapeHtml(w.name)} (${escapeHtml(w.status || 'غير معروف')})`).join(' • ')}</div>` : '<div class="op-pack-warning ok">✓ جميع المكائن المطلوبة متاحة</div>'}
    </div>
    <div class="insp-actions">
      <button class="btn-secondary" onclick="closeInspector()">إلغاء</button>
      <button class="btn-primary" onclick="executeOperationPackWithLinks('${pack.id}')"><i class="fa-solid fa-table-columns"></i> إنشاء البطاقات في اللوحة التنفيذية الآن</button>
    </div>
  `;
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function refreshOpPackGeneratedPreview(packId) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  const target = document.getElementById('opPackGeneratedPreview');
  if (!pack || !target) return;
  const client = (document.getElementById('opPackPreviewClient')?.value || '').trim() || 'عميل / مشروع';
  const sizeInput = document.getElementById('opPackPreviewSize');
  const jobSize = sizeInput ? Math.max(0.1, Number(sizeInput.value) || 1) : resolveOpPackJobSize(pack);
  target.innerHTML = renderOperationPackGeneratedCardsPreview(buildOperationPackGeneratedCards(pack, client, jobSize));
  // Live-refresh top metrics so the user sees the effect of the size change immediately.
  const preview = buildOpPackPreview(pack, jobSize);
  const pricing = computeOpPackPricing(pack, preview.totalCost, jobSize);
  const minEl = document.getElementById('opPackPreviewTotalMinutes');
  const costEl = document.getElementById('opPackPreviewTotalCost');
  const priceEl = document.getElementById('opPackPreviewCustomerPrice');
  if (minEl) minEl.textContent = preview.totalMinutes ? `${preview.totalMinutes} دقيقة` : (pack.estimatedTime || '-');
  if (costEl) costEl.textContent = `${preview.totalCost.toLocaleString()} د.ع`;
  if (priceEl) priceEl.textContent = `${pricing.customerPrice.toLocaleString()} د.ع`;
}

function renderOperationPackGeneratedCardsPreview(cards) {
  const arabicPriority = (p) => ({ High: 'أولوية عالية', Normal: 'أولوية عادية', Low: 'أولوية منخفضة' })[p] || p || 'أولوية عادية';
  return cards.map(card => `
    <div class="op-pack-generated-card">
      <div>
        <b>${escapeHtml(card.title)}</b>
        <span>${escapeHtml(card.description || '')}</span>
      </div>
      <div class="op-pack-generated-tags">
        <span>${escapeHtml(arabicPriority(card.priority))}</span>
        <span>SOP: ${(card.sopIds || []).length}</span>
        <span>مكائن: ${(card.machineIds || []).length}</span>
        <span>مواد: ${(card.materialRequirements || []).length}</span>
      </div>
    </div>
  `).join('') || '<p class="muted">لن تُولَّد أي بطاقات (لا توجد خطوات).</p>';
}

function buildOperationPackGeneratedCards(pack, client, sizeOverride) {
  const jobSize = resolveOpPackJobSize(pack, sizeOverride);
  const unitShort = opPackUnitTypeShort(pack.unitType);
  const sizeNote = isOpPackUnitVariable(pack) ? `\nالمقاس: ${jobSize} ${unitShort}` : '';
  return (pack.steps || []).map((step, i) => {
    const sopId = step.sopId || findSopIdByRef(step.sopRef);
    const machineId = step.machineId || step.machineRef || findMachineIdByRef(step.machineRef || step.machine || step.title);
    const reqs = getStepMaterialRequirements(step, pack);
    // Resolve effective quantities so the generated Kanban card stores actual planned amounts,
    // not per-unit rates that would re-multiply downstream.
    const resolvedReqs = reqs.map(req => ({
      materialId: req.materialId,
      qty: resolveStepMaterialQty(req, pack, jobSize),
      unit: req.unit,
      // keep provenance so downstream tooling can tell it came from a per-unit pack
      sourceMode: req.mode || 'fixed',
      sourceRateQty: req.qty,
      sourceJobSize: jobSize
    }));
    const effectiveMinutes = Math.round(resolveStepMinutes(step, pack, jobSize));
    const effectiveExtra = Math.round(resolveStepExtraCost(step, pack, jobSize));
    return {
      id: makeId('card_preview'),
      columnId: i === 0 ? 'kb_ready' : 'kb_backlog',
      title: `${client}: ${step.title}`,
      owner: '',
      priority: i === 0 ? 'High' : 'Normal',
      dueDate: todayISO(),
      tags: [pack.name, step.type].filter(Boolean),
      description: `${step.description ? step.description + '\n\n' : ''}من باقة: ${pack.name}\nSOP: ${step.sopRef || sopId || '-'}${sizeNote}`,
      checklist: [],
      operationPackId: pack.id,
      operationPackStepId: step.id || '',
      operationPackJobSize: jobSize,
      operationPackUnitType: pack.unitType || 'fixed',
      sopIds: sopId ? [sopId] : [],
      machineIds: machineId ? [machineId] : [],
      materialRequirements: resolvedReqs,
      estimatedMinutes: effectiveMinutes,
      costImpact: effectiveExtra,
      activityLog: [{ date: new Date().toISOString(), text: `Previewed from Operation Pack: ${pack.name}${isOpPackUnitVariable(pack) ? ` (size: ${jobSize} ${unitShort})` : ''}` }]
    };
  });
}

async function executeOperationPackWithLinks(packId) {
  ensureOmni();
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  // Read the size + client from the preview modal if it's open; fall back to defaults otherwise.
  const sizeInput = document.getElementById('opPackPreviewSize');
  const jobSize = sizeInput ? Math.max(0.1, Number(sizeInput.value) || 1) : resolveOpPackJobSize(pack);
  const preview = buildOpPackPreview(pack, jobSize);
  const pricing = computeOpPackPricing(pack, preview.totalCost, jobSize);
  const unitShort = opPackUnitTypeShort(pack.unitType);
  const sizeChip = isOpPackUnitVariable(pack) ? `<p>المقاس: <b>${jobSize} ${escapeHtml(unitShort)}</b></p>` : '';
  const warningText = [
    ...preview.materialWarnings.map(w => `نقص مادة: ${w.name} يحتاج ${w.qty}، متاح ${w.available}`),
    ...preview.machineWarnings.map(w => `ماكينة غير متاحة: ${w.name} (${w.status})`)
  ].join('\n');
  const clientDefault = (document.getElementById('opPackPreviewClient')?.value || '').trim();
  const result = await showOmniModal('تأكيد: إنشاء بطاقات شغل جديدة', `
    <p><b>${escapeHtml(pack.icon || '📦')} ${escapeHtml(pack.name)}</b></p>
    ${sizeChip}
    <p>الخطوات: ${pack.steps.length} · الوقت المتوقع: ${preview.totalMinutes || pack.estimatedTime || 0} دقيقة</p>
    <div class="op-pack-execute-price-summary">
      <div><span>كلفتنا الداخلية</span><b>${(preview.totalCost || 0).toLocaleString()} د.ع</b></div>
      <div class="op-pack-execute-price-customer"><span>السعر النهائي للعميل</span><b>${pricing.customerPrice.toLocaleString()} د.ع</b></div>
    </div>
    <p>المكائن: ${preview.machines.map(m => escapeHtml(m.name)).join('، ') || '-'}</p>
    <p>المواد: ${preview.materials.map(m => `${escapeHtml(m.name)} × ${m.qty.toFixed(2).replace(/\.00$/,'')}${m.unit ? ' ' + escapeHtml(m.unit) : ''}`).join('، ') || '-'}</p>
    ${warningText ? `<div class="cc-alert cc-alert-warning">${escapeHtml(warningText)}</div>` : '<div class="cc-alert cc-alert-success">لا توجد تحذيرات مانعة.</div>'}
    <label>اسم العميل / المشروع</label>
    <input id="opPackExecuteClient" class="form-input" value="${escapeHtml(clientDefault)}">
  `, body => ({ client: body.querySelector('#opPackExecuteClient')?.value.trim() || '' }));
  if (!result) return;
  const client = result.client;
  if (!client) return;
    // Snapshot the pricing once at execution time so every card from this run carries the
    // same agreed customer price. Per-step pricing share is proportional to that step's
    // internal cost contribution to the total.
    const runPricingSnapshot = computeOpPackPricing(pack, preview.totalCost, jobSize);
    const totalInternalCost = preview.totalCost || 1;
    pack.steps.forEach((step, i) => {
      const sopId = step.sopId || findSopIdByRef(step.sopRef);
      const machineId = step.machineId || step.machineRef || findMachineIdByRef(step.machineRef || step.machine || step.title);
      const reqs = getStepMaterialRequirements(step, pack);
      const effectiveMinutes = Math.round(resolveStepMinutes(step, pack, jobSize));
      const effectiveExtra = Math.round(resolveStepExtraCost(step, pack, jobSize));
      const sizeNote = isOpPackUnitVariable(pack) ? `\nالمقاس: ${jobSize} ${unitShort}` : '';
      // Resolve material quantities at the chosen size so reservations and downstream tasks
      // see the actual planned amount rather than the per-unit rate.
      const resolvedReqs = reqs.map(req => ({
        materialId: req.materialId,
        qty: resolveStepMaterialQty(req, pack, jobSize),
        unit: req.unit,
        sourceMode: req.mode || 'fixed',
        sourceRateQty: req.qty,
        sourceJobSize: jobSize
      }));
      // This step's share of the agreed customer price = proportional to its share of internal cost.
      const stepInternalCost = effectiveExtra + (() => {
        let c = 0;
        const machineId2 = step.machineId || step.machineRef || findMachineIdByRef(step.machineRef || step.machine || step.title);
        if (machineId2) {
          const mach = getMachineById(machineId2);
          if (mach) c += (resolveStepMinutes(step, pack, jobSize) / 60) * (mach.costPerHour || 5000);
        }
        resolvedReqs.forEach(r => { const m = getMaterialById(r.materialId); if (m) c += r.qty * (m.cost || 0); });
        return c;
      })();
      const stepShare = totalInternalCost > 0 ? stepInternalCost / totalInternalCost : 1 / Math.max(1, pack.steps.length);
      const card = {
        id: makeId('card'), columnId: i === 0 ? 'kb_ready' : 'kb_backlog',
        title: `${client}: ${step.title}`, owner: '', priority: i === 0 ? 'High' : 'Normal',
        clientName: client,
        dueDate: todayISO(), tags: [pack.name, step.type].filter(Boolean),
        description: `${step.description ? step.description + '\n\n' : ''}من باقة: ${pack.name}\nSOP: ${step.sopRef || sopId || '-'}${sizeNote}`,
        checklist: [],
        operationPackId: pack.id,
        operationPackStepId: step.id || '',
        operationPackJobSize: jobSize,
        operationPackUnitType: pack.unitType || 'fixed',
        // Pricing provenance — agreed customer price for the whole run + this step's proportional share.
        customerPriceShare: Math.round(runPricingSnapshot.customerPrice * stepShare),
        operationPackCustomerPrice: runPricingSnapshot.customerPrice,
        operationPackPricingSnapshot: runPricingSnapshot,
        requiresQc: isQcRequiredForOperationPackStep(step),
        qcTemplateId: step.qcTemplateId || '',
        qcCriteria: Array.isArray(step.qcCriteria) ? [...step.qcCriteria] : [],
        sopIds: sopId ? [sopId] : [],
        machineIds: machineId ? [machineId] : [],
        materialRequirements: resolvedReqs,
        estimatedMinutes: effectiveMinutes,
        costImpact: effectiveExtra,
        activityLog: [{ date: new Date().toISOString(), text: `Created from Operation Pack: ${pack.name}${isOpPackUnitVariable(pack) ? ` (size: ${jobSize} ${unitShort})` : ''}` }]
      };
      omni.kanban.cards.push(card);

      const machine = getMachineById(machineId);
      const wo = {
        id: makeId('wo'),
        cardId: card.id,
        opPackId: pack.id,
        opPackStepId: step.id || '',
        title: `${client}: ${step.title}`,
        machineId: machineId || '',
        operatorId: '',
        operatorName: machine ? machine.operator || '' : '',
        status: i === 0 ? 'ready' : 'draft',
        plannedMinutes: effectiveMinutes,
        actualMinutes: 0,
        costPerHour: machine ? machine.costPerHour || 5000 : 5000,
        materialRequirements: resolvedReqs.map(r => ({
          materialId: r.materialId,
          qty: r.qty,
          unit: r.unit,
          cost: getMaterialById(r.materialId)?.cost || 0
        })),
        scrapMaterials: [],
        qcRecordId: '',
        timeLogs: [],
        createdAt: new Date().toISOString(),
        startedAt: '',
        completedAt: ''
      };
      if (!Array.isArray(omni.workOrders)) omni.workOrders = [];
      omni.workOrders.push(wo);
      card.workOrderId = wo.id;

      resolvedReqs.forEach(req => reserveMaterial(req.materialId, req.qty, 'op_pack', pack.id, `${client}: ${step.title}`));
      if (machineId) {
        addMachineQueueEntry(machineId, {
          sourceType: 'op_pack',
          sourceId: pack.id,
          cardId: card.id,
          workOrderId: wo.id,
          title: `${client}: ${step.title}`,
          estimatedMinutes: effectiveMinutes,
          status: 'queued'
        });
      }
    });
    saveData();
    showToast(`✓ تم إنشاء ${pack.steps.length} بطاقة شغل وأمر عمل لـ "${client}" في اللوحة التنفيذية والإنتاج`, 'success');
    switchPage('kanban');
  }

function findSopIdByRef(ref) {
  if (!ref) return '';
  const text = String(ref).toLowerCase();
  const sop = (omni.sops || []).find(s => s.id === ref || String(s.title || '').toLowerCase().includes(text) || String(s.code || '').toLowerCase() === text);
  return sop?.id || '';
}

function findMachineIdByRef(ref) {
  if (!ref) return '';
  const text = String(ref).toLowerCase();
  const machine = (omni.machines || []).find(m => m.id === ref || String(m.name || '').toLowerCase().includes(text));
  return machine?.id || '';
}

function findMaterialIdByName(name) {
  if (!name) return '';
  const text = String(name).toLowerCase();
  const material = (omni.materials || []).find(m => m.id === name || String(m.name || '').toLowerCase().includes(text) || text.includes(String(m.name || '').toLowerCase()));
  return material?.id || '';
}

function getStepMaterialRequirements(step, pack) {
  if (Array.isArray(step.materialRequirements) && step.materialRequirements.length) return step.materialRequirements;
  if (step.type !== 'material') return [];
  return (pack.materials || []).map(name => {
    const materialId = findMaterialIdByName(name);
    const material = getMaterialById(materialId);
    return { materialId, qty: 1, unit: material?.unit || '' };
  }).filter(req => req.materialId);
}

function calculateStepCostImpact(step, pack, sizeOverride) {
  const jobSize = resolveOpPackJobSize(pack, sizeOverride);
  let cost = resolveStepExtraCost(step, pack, jobSize);

  const machineId = step.machineId || step.machineRef || findMachineIdByRef(step.machineRef || step.machine || step.title);
  if (machineId) {
    const mach = getMachineById(machineId);
    if (mach) {
      const hourlyRate = mach.costPerHour || 5000;
      const totalMinutes = resolveStepMinutes(step, pack, jobSize);
      cost += (totalMinutes / 60) * hourlyRate;
    }
  }

  const reqs = getStepMaterialRequirements(step, pack);
  (reqs || []).forEach(req => {
    const material = getMaterialById(req.materialId);
    if (material) {
      const effectiveQty = resolveStepMaterialQty(req, pack, jobSize);
      cost += effectiveQty * (material.cost || 0);
    }
  });

  return Math.round(cost);
}

function buildOpPackPreview(pack, sizeOverride) {
  const jobSize = resolveOpPackJobSize(pack, sizeOverride);
  const materialsById = {};
  const machineIds = new Set();
  let totalMinutes = 0;
  let totalCost = 0;

  (pack.steps || []).forEach(step => {
    step.costImpact = calculateStepCostImpact(step, pack, jobSize);

    totalMinutes += resolveStepMinutes(step, pack, jobSize);
    totalCost += Number(step.costImpact) || 0;

    const machineId = step.machineId || step.machineRef || findMachineIdByRef(step.machineRef || step.machine || step.title);
    if (machineId) {
      machineIds.add(machineId);
    }

    getStepMaterialRequirements(step, pack).forEach(req => {
      const material = getMaterialById(req.materialId);
      const key = req.materialId;
      if (!materialsById[key]) {
        materialsById[key] = {
          materialId: key,
          name: material?.name || key,
          qty: 0,
          unit: material?.unit || req.unit || '',
          available: material ? getMaterialAvailableQty(material) : 0,
          cost: material ? (material.cost || 0) : 0
        };
      }
      materialsById[key].qty += resolveStepMaterialQty(req, pack, jobSize);
    });
  });

  const machines = [...machineIds].map(id => getMachineById(id)).filter(Boolean);
  const materials = Object.values(materialsById);

  if ((pack.steps || []).length === 0) {
    totalCost = Number(pack.estimatedCost) || 0;
  }

  totalCost = Math.round(totalCost);
  totalMinutes = Math.round(totalMinutes);
  return {
    steps: pack.steps || [],
    machines,
    materials,
    totalMinutes,
    totalCost,
    jobSize,
    materialWarnings: materials.filter(m => m.available < m.qty),
    machineWarnings: machines.filter(m => !['operational', 'available', 'idle'].includes(m.status))
  };
}

function renderOpPackInspectorTab(packId, _legacyTabIdx) {
  ensureOmni();
  const pack = (omni.opPacks||[]).find(p => p.id === packId);
  const panel = document.getElementById('inspectorPanel');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!pack || !panel || !tabs || !body) return;

  // Promote the inspector to full-screen mode while a pack is being designed —
  // pack design isn't a daily activity, so it deserves a dedicated workspace, not a
  // cramped side panel. Other inspector types (machine, material, task) keep the
  // default side-panel layout because they're quick lookups.
  panel.classList.remove('kanban-inspector-panel', 'kanban-inspector-v2', 'task-inspector-v2');
  panel.classList.add('pack-designer-fullscreen-mode');
  panel.classList.add('op-pack-fullscreen-modal');
  document.body.classList.add('pack-designer-active');

  // title.innerHTML is set at the END of the function (after body) so the saved-indicator
  // badge can render next to it. Leaving this as a plain placeholder for a beat:
  title.textContent = `مصمم الباقة: ${pack.name}`;
  tabs.innerHTML = '';

  const preview = buildOpPackPreview(pack);
  const materialCostSum = preview.materials.reduce((sum, m) => sum + (m.qty * m.cost), 0);
  const iconChoices = ['📦','💡','🪵','🖨️','⚡','🎨','🪧','🚗','🔧','🛠️','🏭','📐'];

  body.innerHTML = `
    <div class="pack-designer-grid">
    <div class="pack-designer-col-full">
    <!-- ZONE 1: HEADER — inline editable -->
    <div class="pack-designer-header">
      <div class="pack-designer-icon-row">
        ${iconChoices.map(ic => `<button type="button" class="pack-designer-icon-btn ${(pack.icon||'📦')===ic?'active':''}" data-ic="${ic}" onclick="updateOpPackHeader('${packId}', 'icon', '${ic}')">${ic}</button>`).join('')}
      </div>
      <label class="pack-designer-label">اسم الباقة</label>
      <input type="text" class="pack-designer-input pack-designer-name-input" value="${escapeHtml(pack.name)}" onchange="updateOpPackHeader('${packId}', 'name', this.value)" placeholder="اسم الباقة">
      <label class="pack-designer-label">الوصف</label>
      <textarea class="pack-designer-input" rows="2" onchange="updateOpPackHeader('${packId}', 'description', this.value)" placeholder="وصف مختصر للباقة">${escapeHtml(pack.description || '')}</textarea>
      <label class="pack-designer-label">الوقت المتوقع (نص عرض إذا لم تكن هناك خطوات)</label>
      <input type="text" class="pack-designer-input" value="${escapeHtml(pack.estimatedTime || '')}" onchange="updateOpPackHeader('${packId}', 'estimatedTime', this.value)" placeholder="مثال: 4-6 ساعات">

      <div class="pack-designer-unit-row">
        <div class="pack-designer-unit-col">
          <label class="pack-designer-label">نوع التسعير</label>
          <select class="pack-designer-input" onchange="updateOpPackUnitType('${packId}', this.value)">
            ${Object.entries(OP_PACK_UNIT_TYPES).map(([key, info]) => `<option value="${key}" ${pack.unitType === key ? 'selected' : ''}>${escapeHtml(info.label)}</option>`).join('')}
          </select>
        </div>
        ${isOpPackUnitVariable(pack) ? `<div class="pack-designer-unit-col">
          <label class="pack-designer-label">المقاس الافتراضي (للمعاينة، ${escapeHtml(opPackUnitTypeShort(pack.unitType))})</label>
          <input type="number" min="0.1" step="0.1" class="pack-designer-input" value="${Number(pack.defaultSize || 1)}" onchange="updateOpPackHeader('${packId}', 'defaultSize', Number(this.value) || 1)">
        </div>` : ''}
      </div>
      ${isOpPackUnitVariable(pack) ? `<p class="pack-designer-unit-hint"><i class="fa-solid fa-circle-info"></i> الأرقام أدناه لمقاس <b>${Number(pack.defaultSize || 1)} ${escapeHtml(opPackUnitTypeShort(pack.unitType))}</b>. الكميات "لكل وحدة" تُضرب بالمقاس عند العميل.</p>` : ''}
    </div>

    </div><!-- /pack-designer-col-full (HEADER) -->

    <div class="pack-designer-col-left">
    <!-- ZONE 2: LIVE METRICS -->
    <div class="pack-designer-section">
      <h4 class="pack-designer-section-title"><i class="fa-solid fa-chart-line"></i> التنفيذ المتوقع (محسوب تلقائياً)</h4>
      <div class="op-pack-overview-metrics">
        <div><span>الخطوات</span><b>${pack.steps.length}</b></div>
        <div><span>الوقت الكلي</span><b>${preview.totalMinutes ? preview.totalMinutes + ' دقيقة' : (pack.estimatedTime || '-')}</b></div>
        <div><span>الكلفة الكلية</span><b>${(preview.totalCost || pack.estimatedCost || 0).toLocaleString()} د.ع</b></div>
        <div><span>كلفة المواد</span><b>${Math.round(materialCostSum).toLocaleString()} د.ع</b></div>
        <div><span>المكائن</span><b>${preview.machines.length}</b></div>
        <div><span>المواد</span><b>${preview.materials.length}</b></div>
      </div>
      ${preview.materialWarnings.length ? `<p class="text-danger" style="margin-top:10px"><i class="fa-solid fa-triangle-exclamation"></i> نقص مواد: ${preview.materialWarnings.map(w => `${escapeHtml(w.name)} يحتاج ${w.qty}, متاح ${w.available}`).join(' • ')}</p>` : (preview.materials.length ? '<p class="text-success" style="margin-top:10px"><i class="fa-solid fa-circle-check"></i> جميع المواد متوفرة بالكميات المطلوبة</p>' : '')}
      ${preview.machineWarnings.length ? `<p class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> حالة المكائن: ${preview.machineWarnings.map(w => `${escapeHtml(w.name)} (${escapeHtml(w.status)})`).join(' • ')}</p>` : (preview.machines.length ? '<p class="text-success"><i class="fa-solid fa-circle-check"></i> جميع المكائن المطلوبة متاحة</p>' : '')}
    </div>

    ${preview.materials.length ? `<div class="pack-designer-section">
      <h4 class="pack-designer-section-title"><i class="fa-solid fa-receipt"></i> تفصيل كلفة المواد</h4>
      <table class="op-materials-table" style="width:100%">
        <thead><tr><th style="text-align:right">المادة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${preview.materials.map(m => `<tr>
            <td style="text-align:right">${escapeHtml(m.name)}</td>
            <td style="text-align:center">${m.qty} ${escapeHtml(m.unit || '')}</td>
            <td style="text-align:center">${m.cost.toLocaleString()} د.ع</td>
            <td style="text-align:center"><b>${Math.round(m.qty * m.cost).toLocaleString()} د.ع</b></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${renderOperationPackInspectorTrace(pack)}

    <!-- ZONE 3.5: CUSTOMER PRICING — overhead + logistics + profit layered on top of internal cost -->
    ${(() => {
      const pricing = computeOpPackPricing(pack, preview.totalCost, preview.jobSize);
      const isVar = isOpPackUnitVariable(pack);
      const unitShort = opPackUnitTypeShort(pack.unitType);
      return `<div class="pack-designer-section pack-designer-pricing">
        <h4 class="pack-designer-section-title"><i class="fa-solid fa-tag"></i> التسعير النهائي للعميل
          <span class="pack-designer-pricing-help" title="الأرقام أدناه تُحوّل الكلفة الداخلية إلى السعر الذي تطلبه من العميل."><i class="fa-solid fa-circle-info"></i></span>
        </h4>
        <div class="pack-pricing-inputs">
          <div class="pack-pricing-input-col">
            <label>نسبة المصاريف العامة %<small>إيجار/كهرباء/إشراف</small></label>
            <input type="number" min="0" step="1" class="form-input" value="${pack.pricing.overheadPct || 0}" onchange="updateOpPackPricing('${packId}', 'overheadPct', this.value)">
          </div>
          <div class="pack-pricing-input-col">
            <label>لوجستيات ثابتة (د.ع)<small>توصيل/تركيب</small></label>
            <input type="number" min="0" step="500" class="form-input" value="${pack.pricing.logisticsFixed || 0}" onchange="updateOpPackPricing('${packId}', 'logisticsFixed', this.value)">
          </div>
          ${isVar ? `<div class="pack-pricing-input-col">
            <label>لوجستيات لكل ${escapeHtml(unitShort)}<small>توصيل متدرّج</small></label>
            <input type="number" min="0" step="100" class="form-input" value="${pack.pricing.logisticsPerUnit || 0}" onchange="updateOpPackPricing('${packId}', 'logisticsPerUnit', this.value)">
          </div>` : ''}
          <div class="pack-pricing-input-col">
            <label>نسبة الربح %<small>هامش ربحك النهائي</small></label>
            <input type="number" min="0" step="1" class="form-input" value="${pack.pricing.profitMarginPct || 0}" onchange="updateOpPackPricing('${packId}', 'profitMarginPct', this.value)">
          </div>
        </div>
        <div class="pack-pricing-breakdown">
          <div class="pack-pricing-step">
            <span class="pack-pricing-step-label">الكلفة الداخلية</span>
            <b>${pricing.internalCost.toLocaleString()} د.ع</b>
          </div>
          <i class="fa-solid fa-plus pack-pricing-op"></i>
          <div class="pack-pricing-step">
            <span class="pack-pricing-step-label">مصاريف عامة (${pricing.overheadPct}%)</span>
            <b>${pricing.overheadAmount.toLocaleString()} د.ع</b>
          </div>
          <i class="fa-solid fa-plus pack-pricing-op"></i>
          <div class="pack-pricing-step">
            <span class="pack-pricing-step-label">لوجستيات${isVar && pricing.logisticsPerUnitTotal ? ` (ثابت + ${pricing.logisticsPerUnitTotal.toLocaleString()} للوحدات)` : ''}</span>
            <b>${pricing.logisticsAmount.toLocaleString()} د.ع</b>
          </div>
          <i class="fa-solid fa-equals pack-pricing-op"></i>
          <div class="pack-pricing-step">
            <span class="pack-pricing-step-label">مجموع التكاليف</span>
            <b>${pricing.subtotal.toLocaleString()} د.ع</b>
          </div>
          <i class="fa-solid fa-plus pack-pricing-op"></i>
          <div class="pack-pricing-step pack-pricing-step-profit">
            <span class="pack-pricing-step-label">ربح (${pricing.profitPct}%)</span>
            <b>${pricing.profitAmount.toLocaleString()} د.ع</b>
          </div>
        </div>
        <div class="pack-pricing-final">
          <span class="pack-pricing-final-label"><i class="fa-solid fa-hand-holding-dollar"></i> السعر النهائي للعميل</span>
          <span class="pack-pricing-final-amount">${pricing.customerPrice.toLocaleString()} <small>د.ع</small></span>
        </div>
      </div>`;
    })()}

    </div><!-- /pack-designer-col-left (metrics + materials + pricing) -->

    <div class="pack-designer-col-right">
    <!-- ZONE 3: STEPS DESIGNER -->
    <div class="pack-designer-section pack-designer-steps">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h4 class="pack-designer-section-title" style="margin:0"><i class="fa-solid fa-list-ol"></i> خطوات التشغيل (${pack.steps.length})</h4>
        <button class="btn-primary" style="padding:6px 14px;font-size:12px;display:flex;align-items:center;gap:6px;" onclick="addOperationPackStep('${packId}')">
          <i class="fa-solid fa-plus"></i> إضافة خطوة
        </button>
      </div>
      <div class="op-pack-step-editor-list" style="display:flex;flex-direction:column;gap:4px;">

          ${pack.steps.map((step, idx) => {
            const previewJobSize = resolveOpPackJobSize(pack);
            let laborCost = 0;
            const machineId = step.machineId || step.machineRef || findMachineIdByRef(step.machineRef || step.machine || step.title);
            if (machineId) {
              const mach = getMachineById(machineId);
              if (mach) {
                const hourlyRate = mach.costPerHour || 5000;
                const effectiveMinutes = resolveStepMinutes(step, pack, previewJobSize);
                laborCost = Math.round((effectiveMinutes / 60) * hourlyRate);
              }
            }

            let materialCost = 0;
            const reqs = getStepMaterialRequirements(step, pack);
            (reqs || []).forEach(req => {
              const mat = getMaterialById(req.materialId);
              if (mat) {
                materialCost += resolveStepMaterialQty(req, pack, previewJobSize) * (mat.cost || 0);
              }
            });

            const extraCost = Number(step.extraCost !== undefined ? step.extraCost : (step.costImpact || 0)) || 0;
            const effectiveExtra = resolveStepExtraCost(step, pack, previewJobSize);
            const totalStepCost = Math.round(laborCost + materialCost + effectiveExtra);

            return `
              <div class="op-pack-step-row-v2">
                <!-- Step Header -->
                <div class="op-step-header">
                  <span class="op-step-title-glow">${idx + 1}. ${escapeHtml(step.title)}</span>
                  <div class="op-step-actions-group">
                    <button class="op-btn-icon" ${idx === 0 ? 'disabled' : ''} onclick="moveOperationPackStep('${packId}','${step.id}',-1)" title="ترتيب لأعلى">
                      <i class="fa-solid fa-arrow-up"></i>
                    </button>
                    <button class="op-btn-icon" ${idx === pack.steps.length - 1 ? 'disabled' : ''} onclick="moveOperationPackStep('${packId}','${step.id}',1)" title="ترتيب لأسفل">
                      <i class="fa-solid fa-arrow-down"></i>
                    </button>
                    <button class="op-btn-icon op-btn-icon-danger" onclick="deleteOperationPackStep('${packId}','${step.id}')" title="حذف الخطوة">
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                </div>

                <!-- Inputs Grid -->
                <div class="op-step-grid-v2">
                  <div class="op-step-input-group">
                    <label>اسم الخطوة</label>
                    <input type="text" class="form-input" placeholder="اسم الخطوة" value="${escapeHtml(step.title)}" onchange="updateOperationPackStep('${packId}','${step.id}', {title: this.value})">
                  </div>
                  <div class="op-step-input-group">
                    <label>الوصف</label>
                    <input type="text" class="form-input" placeholder="الوصف والتفاصيل" value="${escapeHtml(step.description || '')}" onchange="updateOperationPackStep('${packId}','${step.id}', {description: this.value})">
                  </div>
                  <div class="op-step-input-group">
                    <label>مسار العمل القياسي (SOP)</label>
                    <select class="form-input" onchange="updateOperationPackStep('${packId}','${step.id}', {sopId: this.value})">
                      <option value="">بدون SOP مرتبط</option>
                      ${(omni.sops||[]).map(s => `<option value="${s.id}" ${step.sopId === s.id ? 'selected' : ''}>${escapeHtml(s.title || s.code)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="op-step-input-group">
                    <label>الماكينة المستهدفة</label>
                    <select class="form-input" onchange="updateOperationPackStep('${packId}','${step.id}', {machineId: this.value})">
                      <option value="">بدون ماكينة مرتبطة</option>
                      ${(omni.machines||[]).map(m => `<option value="${m.id}" ${step.machineId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="op-step-input-group">
                    <label>الوقت الثابت (دقيقة)</label>
                    <input type="number" class="form-input" placeholder="0" value="${step.estimatedMinutes || 0}" onchange="updateOperationPackStep('${packId}','${step.id}', {estimatedMinutes: Number(this.value)})">
                  </div>
                  <div class="op-step-input-group">
                    <label>كلفة ثابتة إضافية (د.ع)</label>
                    <input type="number" class="form-input" placeholder="0" value="${extraCost}" onchange="updateOperationPackStep('${packId}','${step.id}', {extraCost: Number(this.value)})">
                  </div>
                  ${isOpPackUnitVariable(pack) ? `
                  <div class="op-step-input-group op-step-input-perunit">
                    <label>وقت إضافي لكل وحدة (دقيقة/${escapeHtml(opPackUnitTypeShort(pack.unitType))})</label>
                    <input type="number" class="form-input" placeholder="0" value="${step.minutesPerUnit || 0}" onchange="updateOperationPackStep('${packId}','${step.id}', {minutesPerUnit: Number(this.value)})">
                  </div>
                  <div class="op-step-input-group op-step-input-perunit">
                    <label>كلفة إضافية لكل وحدة (د.ع/${escapeHtml(opPackUnitTypeShort(pack.unitType))})</label>
                    <input type="number" class="form-input" placeholder="0" value="${step.extraCostPerUnit || 0}" onchange="updateOperationPackStep('${packId}','${step.id}', {extraCostPerUnit: Number(this.value)})">
                  </div>
                  ` : ''}
                </div>

                <!-- Materials Requirement Section -->
                <div class="op-materials-section">
                  <div class="op-materials-header">
                    <strong style="font-size:12px; color:#cbd5e1;"><i class="fa-solid fa-boxes-stacked"></i> المواد والمكونات المطلوبة</strong>
                    <select id="newMat_${step.id}" class="form-input" style="width:150px;height:26px;font-size:11px;padding:0 6px;" onchange="if(this.value){addOperationPackStepMaterial('${packId}','${step.id}',this.value); this.value='';}">
                      <option value="">+ إضافة مادة مطلوبة</option>
                      ${(omni.materials||[]).map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
                    </select>
                  </div>

                  ${(step.materialRequirements || []).length === 0 ? '<p style="font-size:11px;color:#64748b;margin:4px 0 0 0;">لم يتم تحديد أي متطلبات مواد لهذه الخطوة.</p>' : `
                    <table class="op-materials-table">
                      ${step.materialRequirements.map(req => {
                        const mat = getMaterialById(req.materialId);
                        const avail = mat ? getMaterialAvailableQty(mat) : 0;
                        const previewJobSize = resolveOpPackJobSize(pack);
                        const effectiveQty = resolveStepMaterialQty(req, pack, previewJobSize);
                        const shortage = avail < effectiveQty;
                        const isPerUnit = req.mode === 'per_unit' && isOpPackUnitVariable(pack);
                        const unitShort = opPackUnitTypeShort(pack.unitType);
                        return `<tr>
                          <td style="padding:6px 4px; text-align:right;">${escapeHtml(mat ? mat.name : req.materialId)}</td>
                          <td style="padding:6px 4px;width:80px;text-align:center;">
                            <input type="number" min="0" step="0.01" class="form-input" value="${req.qty}" style="width:100%;height:22px;font-size:11px;padding:0 4px;text-align:center;" onchange="updateOperationPackStepMaterial('${packId}','${step.id}','${req.materialId}',Number(this.value))">
                          </td>
                          <td style="padding:6px 4px;width:45px;color:#94a3b8;text-align:center;">${escapeHtml(req.unit || mat?.unit || '')}</td>
                          ${isOpPackUnitVariable(pack) ? `<td style="padding:6px 4px;width:110px;text-align:center;">
                            <select class="form-input" style="height:22px;font-size:10px;padding:0 4px;" onchange="updateOperationPackStepMaterialMode('${packId}','${step.id}','${req.materialId}', this.value)">
                              <option value="fixed" ${req.mode !== 'per_unit' ? 'selected' : ''}>ثابت</option>
                              <option value="per_unit" ${req.mode === 'per_unit' ? 'selected' : ''}>لكل ${escapeHtml(unitShort)}</option>
                            </select>
                          </td>` : ''}
                          <td style="padding:6px 4px;width:140px;color:${shortage ? '#f43f5e' : '#10b981'};font-weight:600;font-size:10px;">
                            ${isPerUnit ? `<span style="color:#94a3b8">حالياً: ${effectiveQty.toFixed(2)} ${escapeHtml(req.unit||mat?.unit||'')}</span><br>` : ''}
                            ${shortage ? '<i class="fa-solid fa-triangle-exclamation"></i> ناقص' : '<i class="fa-solid fa-circle-check"></i> متوفر'} (${avail})
                          </td>
                          <td style="padding:6px 4px;width:30px;text-align:left;">
                            <button class="op-btn-icon op-btn-icon-danger" style="padding:2px 6px; font-size:10px;" onclick="removeOperationPackStepMaterial('${packId}','${step.id}','${req.materialId}')">
                              <i class="fa-solid fa-xmark"></i>
                            </button>
                          </td>
                        </tr>`;
                      }).join('')}
                    </table>
                  `}
                </div>

                <!-- Cost Breakdown Panel -->
                <div class="op-step-cost-breakdown">
                  <div class="cost-tag-group">
                    <span class="cost-tag labor" title="كلفة العمل/الماكينة = (الدقائق الفعلية / 60) × أجر الساعة">
                      <i class="fa-solid fa-clock"></i> العمل والماكينة: <b>${laborCost.toLocaleString()} د.ع</b>
                    </span>
                    <span class="cost-tag materials" title="كلفة المواد = الكمية الفعلية × كلفة الوحدة">
                      <i class="fa-solid fa-cube"></i> كلفة المواد: <b>${Math.round(materialCost).toLocaleString()} د.ع</b>
                    </span>
                    <span class="cost-tag extra" title="${isOpPackUnitVariable(pack) ? 'الكلفة الإضافية = ثابتة + (لكل وحدة × المقاس)' : 'كلفة إضافية مدخلة يدوياً'}">
                      <i class="fa-solid fa-coins"></i> كلفة إضافية: <b>${Math.round(effectiveExtra).toLocaleString()} د.ع</b>
                    </span>
                  </div>
                  <span class="cost-tag-total" title="إجمالي الكلفة المتوقعة لهذه الخطوة عند المقاس الحالي">
                    المجموع${isOpPackUnitVariable(pack) ? ` (لـ ${previewJobSize} ${escapeHtml(opPackUnitTypeShort(pack.unitType))})` : ''}: ${totalStepCost.toLocaleString()} د.ع
                  </span>
                </div>
              </div>
            `;
          }).join('')}
          ${pack.steps.length === 0 ? `<div class="pack-designer-empty-steps">
            <i class="fa-solid fa-list-ol"></i>
            <p>لم تضف أي خطوة بعد. الباقة بدون خطوات لا يمكن تشغيلها.</p>
            <button class="btn-primary" onclick="addOperationPackStep('${packId}')"><i class="fa-solid fa-plus"></i> إضافة أول خطوة</button>
          </div>` : ''}
        </div>
      </div>

      <!-- ZONE 4: ACTIVITY LOG (collapsible) -->
      <details class="pack-designer-activity-block">
        <summary><i class="fa-solid fa-clock-rotate-left"></i> سجل النشاط (${(pack.activityLog||[]).length})</summary>
        <div class="op-pack-activity-log">
          ${(pack.activityLog||[]).slice().reverse().slice(0, 30).map(log => `
            <div class="op-pack-activity-row">
              <span class="op-pack-activity-date">${new Date(log.date).toLocaleString()}</span>
              <span class="op-pack-activity-text">${escapeHtml(log.text)}</span>
            </div>
          `).join('')}
          ${(pack.activityLog||[]).length === 0 ? '<p class="muted" style="padding:8px">لا يوجد سجل نشاط بعد.</p>' : ''}
          ${(pack.activityLog||[]).length > 30 ? `<p class="muted" style="padding:8px;text-align:center">عرض آخر 30 من ${(pack.activityLog||[]).length} حدث</p>` : ''}
        </div>
      </details>

      </div><!-- /pack-designer-col-right (steps + activity) -->
      </div><!-- /pack-designer-grid -->

      <!-- ZONE 5: ACTION BAR (sticky) -->
      <div class="pack-designer-actions">
        <button class="btn-primary" onclick="previewOperationPackExecution('${pack.id}')"><i class="fa-solid fa-user-plus"></i> إنشاء بطاقات شغل لعميل جديد</button>
        <button class="btn-success pack-designer-save-btn" onclick="savePackAndClose('${pack.id}')"><i class="fa-solid fa-floppy-disk"></i> حفظ وإغلاق</button>
        <button class="btn-secondary op-btn-danger" onclick="deleteOpPack('${pack.id}')"><i class="fa-solid fa-trash-can"></i> حذف</button>
      </div>
    `;

  // Inject a visible "saved" badge next to the inspector title — gives the user constant
  // reassurance that auto-save is happening. The badge gets a brief pulse animation on
  // every re-render (i.e. after every edit) so the user sees the save event firing live.
  title.innerHTML = `مصمم الباقة: ${escapeHtml(pack.name)} <span class="pack-saved-indicator pack-saved-flash" title="جميع التعديلات تُحفظ تلقائياً"><i class="fa-solid fa-circle-check"></i> محفوظ</span>`;
}

// Explicit save action — the data is already auto-saved on every keystroke, but the user
// wants a clear "save" verb to trust the system. We flash a confirmation toast and close
// the designer.
function savePackAndClose(packId) {
  ensureOmni();
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  // saveData() was already invoked by every inline mutation, but call once more for safety
  // in case any in-flight change hasn't flushed yet.
  saveData();
  if (typeof showToast === 'function') {
    showToast(`✓ تم حفظ الباقة "${pack?.name || ''}"`, 'success');
  }
  closeInspector();
}

function addOperationPackActivity(packId, text) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  if (!Array.isArray(pack.activityLog)) pack.activityLog = [];
  pack.activityLog.push({ date: new Date().toISOString(), text });
  saveData();
}

function addOperationPackStep(packId) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  if (!Array.isArray(pack.steps)) pack.steps = [];
  const stepId = makeId('opstep');
  pack.steps.push({
    id: stepId,
    title: `الخطوة ${pack.steps.length + 1}`,
    description: '',
    sopId: '',
    machineId: '',
    materialRequirements: [],
    estimatedMinutes: 0,
    costImpact: 0
  });
  addOperationPackActivity(packId, `تمت إضافة خطوة: ${pack.steps[pack.steps.length - 1].title}`);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
}

function updateOperationPackStep(packId, stepId, patch) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const step = pack.steps.find(s => s.id === stepId);
  if (!step) return;
  Object.assign(step, patch);
  addOperationPackActivity(packId, `تم تحديث الخطوة: ${step.title}`);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
}

async function deleteOperationPackStep(packId, stepId) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const ok = await showOmniConfirm('حذف خطوة', 'هل أنت متأكد من حذف هذه الخطوة؟', 'حذف', 'إلغاء');
  if (!ok) return;
  const idx = pack.steps.findIndex(s => s.id === stepId);
  if (idx !== -1) {
    const title = pack.steps[idx].title;
    pack.steps.splice(idx, 1);
    addOperationPackActivity(packId, `تم حذف الخطوة: ${title}`);
    recalculateOpPackTotals(pack);
    saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
  }
}

function moveOperationPackStep(packId, stepId, direction) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const idx = pack.steps.findIndex(s => s.id === stepId);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= pack.steps.length) return;
  const temp = pack.steps[idx];
  pack.steps[idx] = pack.steps[newIdx];
  pack.steps[newIdx] = temp;
  addOperationPackActivity(packId, `تم إعادة ترتيب الخطوة: ${temp.title}`);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
}

function addOperationPackStepMaterial(packId, stepId, materialId) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const step = pack.steps.find(s => s.id === stepId);
  if (!step) return;
  if (!Array.isArray(step.materialRequirements)) step.materialRequirements = [];
  if (step.materialRequirements.some(r => r.materialId === materialId)) return;
  const mat = getMaterialById(materialId);
  step.materialRequirements.push({ materialId, qty: 1, unit: mat?.unit || '' });
  addOperationPackActivity(packId, `تمت إضافة مادة (${mat?.name || materialId}) إلى الخطوة ${step.title}`);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
}

function updateOperationPackStepMaterial(packId, stepId, materialId, qty) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const step = pack.steps.find(s => s.id === stepId);
  if (!step) return;
  const req = step.materialRequirements.find(r => r.materialId === materialId);
  if (req) {
    req.qty = Math.max(0, qty);
    addOperationPackActivity(packId, `تم تحديث كمية المادة في الخطوة ${step.title}`);
    recalculateOpPackTotals(pack);
    saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
  }
}

function updateOperationPackStepMaterialMode(packId, stepId, materialId, mode) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const step = pack.steps.find(s => s.id === stepId);
  if (!step) return;
  const req = step.materialRequirements.find(r => r.materialId === materialId);
  if (!req) return;
  const newMode = mode === 'per_unit' ? 'per_unit' : 'fixed';
  if (req.mode === newMode) return;
  req.mode = newMode;
  addOperationPackActivity(packId, `تم تغيير وضع كمية المادة في الخطوة ${step.title} إلى: ${newMode === 'per_unit' ? 'لكل وحدة' : 'ثابت'}`);
  recalculateOpPackTotals(pack);
  saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
}

function removeOperationPackStepMaterial(packId, stepId, materialId) {
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!pack) return;
  const step = pack.steps.find(s => s.id === stepId);
  if (!step) return;
  const idx = step.materialRequirements.findIndex(r => r.materialId === materialId);
  if (idx !== -1) {
    step.materialRequirements.splice(idx, 1);
    addOperationPackActivity(packId, `تمت إزالة مادة من الخطوة ${step.title}`);
    recalculateOpPackTotals(pack);
    saveData(); renderOpPackInspectorTab(packId); renderOpPacks();
  }
}

function ptxCompactMoney(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return `${Math.round(n / 100000) / 10}م`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 100) / 10}ك`;
  return n.toLocaleString();
}

function renderOpPacks() {
  ensureOmni();
  const el = document.getElementById('opPacksGrid');
  if (!el) return;

  if (!window.mrpActiveTab) window.mrpActiveTab = 'packs';
  const activeTab = window.mrpActiveTab;
  const packs = omni.opPacks || [];
  const executions = omni.operationPackExecutions || [];
  const totalSteps = packs.reduce((sum, pack) => sum + ((pack.steps || []).length), 0);
  const pricedCount = packs.filter(pack => computeOpPackPricing(pack, buildOpPackPreview(pack).totalCost || pack.estimatedCost || 0, resolveOpPackJobSize(pack)).hasMarkup).length;

  const tabs = `
    <div class="op-workspace-tabs">
      <button class="${activeTab === 'packs' ? 'active' : ''}" onclick="window.switchMrpTab('packs')"><span>📚</span><b>مكتبة الباقات</b><small>${packs.length}</small></button>
      <button class="${activeTab === 'work_orders' ? 'active' : ''}" onclick="window.switchMrpTab('work_orders')"><span>🏭</span><b>أوامر العمل</b><small>${(omni.workOrders || []).length}</small></button>
      <button class="${activeTab === 'analytics' ? 'active' : ''}" onclick="window.switchMrpTab('analytics')"><span>📊</span><b>الكلف والتالف</b><small>MRP</small></button>
    </div>
  `;

  if (activeTab === 'work_orders') {
    el.innerHTML = `<div class="op-workspace">${tabs}<section class="op-workspace-panel">${renderWorkOrdersTab()}</section></div>`; /* renderWorkOrdersTab escapes dynamic values with escapeHtml() */
    return;
  }
  if (activeTab === 'analytics') {
    el.innerHTML = `<div class="op-workspace">${tabs}<section class="op-workspace-panel">${renderMrpAnalyticsTab()}</section></div>`; /* renderMrpAnalyticsTab escapes dynamic values with escapeHtml() */
    return;
  }

  const cards = packs.map(pack => {
    const steps = pack.steps || [];
    const preview = buildOpPackPreview(pack);
    const pricing = computeOpPackPricing(pack, preview.totalCost || pack.estimatedCost || 0, preview.jobSize);
    const trace = getOperationPackTrace(pack.id);
    const warnings = (preview.materialWarnings?.length || 0) + (preview.machineWarnings?.length || 0);
    return `
      <article class="op-pack-card op-pack-card-v2" onclick="openInspector('oppack', '${pack.id}')">
        <div class="op-card-top">
          <div>
            <h3>${escapeHtml(pack.name || 'باقة بدون اسم')}</h3>
            <p>${escapeHtml(pack.description || 'لا يوجد وصف بعد. افتح الباقة ورتب خطواتها وموادها.')}</p>
          </div>
          <div class="op-pack-icon">${escapeHtml(pack.icon || '📦')}</div>
        </div>
        <span class="op-card-health ${warnings ? 'warn' : 'ok'}">${warnings ? `${warnings} تنبيه` : 'جاهزة'}</span>
        <div class="op-card-metrics">
          <div><span>الخطوات</span><b>${steps.length}</b></div>
          <div><span>الوقت</span><b>${preview.totalMinutes ? `${preview.totalMinutes} د` : escapeHtml(pack.estimatedTime || '-')}</b></div>
          <div><span>كلفتنا</span><b>${ptxCompactMoney(preview.totalCost || pack.estimatedCost || 0)}</b></div>
          <div class="op-price"><span>سعر العميل</span><b>${ptxCompactMoney(pricing.customerPrice)} د.ع</b></div>
        </div>
        <div class="op-card-flow">
          ${steps.slice(0, 4).map((step, index) => `<span><b>${index + 1}</b>${escapeHtml(step.title || 'خطوة')}</span>`).join('') || '<em>أضف خطوات التشغيل حتى تصبح الباقة قابلة للتنفيذ.</em>'}
          ${steps.length > 4 ? `<span class="more">+${steps.length - 4}</span>` : ''}
        </div>
        <div class="op-card-meta">
          <span><i class="fa-solid fa-table-columns"></i> ${trace.cards.length} بطاقة</span>
          <span><i class="fa-solid fa-list-check"></i> ${trace.tasks.length} مهام</span>
          <span><i class="fa-solid fa-flask-vial"></i> ${trace.qcRecords.length} QC</span>
        </div>
        <div class="op-pack-actions">
          <button class="btn-primary" onclick="event.stopPropagation(); executeOpPack('${pack.id}')"><i class="fa-solid fa-play"></i> تشغيل لعميل</button>
          <button class="btn-secondary" onclick="event.stopPropagation(); cloneOpPack('${pack.id}')" title="نسخ"><i class="fa-solid fa-copy"></i></button>
          <button class="btn-secondary" onclick="event.stopPropagation(); openInspector('oppack', '${pack.id}')" title="تصميم"><i class="fa-solid fa-pen-ruler"></i></button>
        </div>
      </article>
    `;
  }).join('');

  el.innerHTML = `
    <div class="op-workspace">
      ${tabs}
      <div class="op-workspace-grid">
        <aside class="op-guide-panel">
          <div class="op-guide-heading">
            <h3>طريقة العمل الصحيحة</h3>
            <p>صمّم الباقة، راجع كلفتها، ثم شغّلها لعميل حتى تتحول إلى أوامر عمل وبطاقات متابعة.</p>
          </div>
          <ol>
            <li><b>صمّم الوصفة</b><span>خطوات، مواد، مكائن، QC.</span></li>
            <li><b>ضع سعر العميل</b><span>كلفة داخلية + لوجستيات + ربح.</span></li>
            <li><b>شغّل لعميل</b><span>ينشئ مهام قابلة للتتبع.</span></li>
          </ol>
          <div class="op-guide-actions">
            <button class="btn-primary" onclick="addOpPack()"><i class="fa-solid fa-plus"></i> باقة جديدة</button>
            <button class="btn-secondary" onclick="window.switchMrpTab('work_orders')"><i class="fa-solid fa-industry"></i> أوامر العمل</button>
          </div>
        </aside>
        <main class="op-main-panel">
          <div class="op-summary-row">
            <div><span>الباقات</span><b>${packs.length}</b></div>
            <div><span>إجمالي الخطوات</span><b>${totalSteps}</b></div>
            <div><span>مسعّرة للعميل</span><b>${pricedCount}</b></div>
            <div><span>مرات التشغيل</span><b>${executions.length}</b></div>
          </div>
          <div class="op-pack-grid-v2">${cards || '<div class="op-empty">لا توجد باقات عمليات بعد.</div>'}</div>
        </main>
        <aside class="op-trace-aside">${renderOperationPackTracePanel()}</aside>
      </div>
    </div>
  `;
}
