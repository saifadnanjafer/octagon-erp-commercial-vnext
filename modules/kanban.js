// Octagon ERP Phase 4 T4.7 de-monolith module.
// Kanban board, column, and inspector actions moved verbatim from app.js.
let omniDraggedCardId = null;

const KANBAN_CARD_COLORS = ['default', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'cyan', 'pink', 'slate', 'custom'];
const KANBAN_COLOR_PRESETS = {
  default: '#94a3b8',
  blue: '#38bdf8',
  green: '#34d399',
  yellow: '#fbbf24',
  orange: '#fb923c',
  red: '#f87171',
  purple: '#a78bfa',
  cyan: '#22d3ee',
  pink: '#f472b6',
  slate: '#64748b'
};
const KANBAN_COLUMN_STYLES = [
  { value: 'glass', label: 'زجاجي هادئ' },
  { value: 'solid', label: 'لون واضح' },
  { value: 'outline', label: 'إطار فقط' },
  { value: 'soft', label: 'خلفية ناعمة' }
];
const DEFAULT_OMNI_DEPARTMENTS = ['Octagon', 'قسم الليزر', 'قسم الراوتر', 'قسم الطباعة ثلاثية الأبعاد', 'قسم الجودة', 'فريق الورشة', 'الإدارة'];

function priorityClass(priority) {
  const p = String(priority || '').toLowerCase();
  if (p.includes('urgent')) return 'priority-urgent';
  if (p.includes('high')) return 'priority-high';
  if (p.includes('low')) return 'priority-low';
  return 'priority-normal';
}

function getKanbanCardColor(card) {
  const color = card?.color || card?.accentColor || 'default';
  return KANBAN_CARD_COLORS.includes(color) ? color : 'default';
}

function normalizeKanbanHexColor(value, fallback = '#38bdf8') {
  const v = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

function getKanbanColorHex(keyOrHex, fallback = '#94a3b8') {
  const key = String(keyOrHex || '').trim();
  if (KANBAN_COLOR_PRESETS[key]) return KANBAN_COLOR_PRESETS[key];
  return normalizeKanbanHexColor(key, fallback);
}

function getKanbanCardAccentHex(card) {
  const color = getKanbanCardColor(card);
  if (color === 'custom') return normalizeKanbanHexColor(card?.customColor || card?.accentHex, '#38bdf8');
  return getKanbanColorHex(color, '#94a3b8');
}

function getKanbanColorOptions(selected = 'default') {
  const labels = {
    default: 'افتراضي',
    blue: 'أزرق',
    green: 'أخضر',
    yellow: 'أصفر',
    orange: 'برتقالي',
    red: 'أحمر',
    purple: 'بنفسجي',
    cyan: 'سماوي',
    pink: 'وردي',
    slate: 'رصاصي',
    custom: 'لون مخصص'
  };
  return KANBAN_CARD_COLORS.map(color => `<option value="${color}" ${selected === color ? 'selected' : ''}>${labels[color] || color}</option>`).join('');
}

function getKanbanDueProximity(card) {
  if (!card?.dueDate || kanbanCardIsDone(card)) return 0;
  const today = new Date(`${todayISO()}T00:00:00`);
  const due = new Date(`${card.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  if (diffDays === 0) return 0.9;
  if (diffDays === 1) return 0.72;
  if (diffDays <= 3) return 0.5;
  if (diffDays <= 7) return 0.28;
  return 0.08;
}

function getKanbanCardStyleVars(card) {
  const accent = getKanbanCardAccentHex(card);
  const dueAlpha = Math.min(0.46, Math.max(0, getKanbanDueProximity(card) * 0.46));
  const colorAlpha = getKanbanCardColor(card) === 'default' ? 0.06 : 0.16;
  return `--card-accent:${accent};--card-color-alpha:${colorAlpha.toFixed(2)};--due-alpha:${dueAlpha.toFixed(2)};`;
}

function getKanbanColumnStyle(col) {
  const color = normalizeKanbanHexColor(col?.color || col?.accentColor, '#38bdf8');
  const tone = Math.min(0.28, Math.max(0, Number(col?.bodyTone ?? 0.08)));
  return `--column-color:${color};--column-tone:${tone.toFixed(2)};--column-tone-percent:${Math.round(tone * 100)}%;`;
}

function getKanbanColumnClass(col) {
  const style = KANBAN_COLUMN_STYLES.some(item => item.value === col?.headerStyle) ? col.headerStyle : 'glass';
  return `kanban-column-style-${style}`;
}

function getCardAssigneeName(card) {
  const emp = (employees || []).find(e => String(e.id || e.name) === String(card.assigneeId));
  return emp?.name || card.owner || card.assignedTo || '-';
}

function getKanbanAssigneeKey(card) {
  return String(card.assigneeId || card.assignedTo || card.owner || card.employeeId || '');
}

function getKanbanDepartmentName(card) {
  return card.department || card.section || card.branch || card.owner || card.assignedTo || 'غير مصنف';
}

function getKanbanEstimate(card) {
  return Number(card.estimatedMinutes || card.estimateMinutes || card.durationMinutes || card.minutes || 0) || 0;
}

function kanbanColumnLooksDone(column) {
  const title = String(column?.title || column?.name || '').toLowerCase();
  return ['done', 'complete', 'completed', 'review', 'مكتمل', 'منجز', 'مراجعة'].some(x => title.includes(x));
}

function kanbanColumnLooksActive(column) {
  const title = String(column?.title || column?.name || '').toLowerCase();
  return ['progress', 'doing', 'active', 'تنفيذ', 'قيد', 'عمل'].some(x => title.includes(x));
}

function kanbanCardIsDone(card) {
  const col = (omni.kanban?.columns || []).find(c => c.id === card.columnId);
  const status = String(card.status || '').toLowerCase();
  return kanbanColumnLooksDone(col) || ['done', 'complete', 'completed', 'مكتمل', 'منجز'].some(x => status.includes(x));
}

function kanbanCardIsBlocked(card) {
  const status = String(card.status || '').toLowerCase();
  return !!card.isBlocked || status.includes('block') || status.includes('تعليق') || status.includes('متوقف') || (card.tags || []).some(t => String(t).toLowerCase().includes('blocked') || String(t).includes('متوقف'));
}

function kanbanCardHasFailedQc(card) {
  return (card.qcRecordIds || []).map(id => getQcRecordById(id)).filter(Boolean).some(q => String(q.result || '').toLowerCase() === 'fail');
}

function kanbanCardQcStatus(card) {
  const qcs = (card.qcRecordIds || []).map(id => getQcRecordById(id)).filter(Boolean);
  if (!qcs.length) return 'none';
  if (qcs.some(q => String(q.result || '').toLowerCase() === 'fail')) return 'fail';
  if (qcs.some(q => String(q.result || '').toLowerCase() === 'pending')) return 'pending';
  return 'pass';
}

function calculateKanbanCardRisk(card) {
  const reasons = [];
  let score = 0;
  const dueRisk = calculateDueRisk(card);
  const priority = String(card.priority || '').toLowerCase();
  const matStatus = calculateMaterialAvailability(card);
  if (dueRisk === 'overdue' && !kanbanCardIsDone(card)) { score += 28; reasons.push('متأخرة'); }
  if (dueRisk === 'due_today' && kanbanChecklistProgress(card) < 100) { score += 14; reasons.push('استحقاق اليوم'); }
  if (priority.includes('urgent')) { score += 20; reasons.push('أولوية حرجة'); }
  else if (priority.includes('high')) { score += 12; reasons.push('أولوية عالية'); }
  if (!getKanbanAssigneeKey(card)) { score += 12; reasons.push('بدون مسؤول'); }
  if (!(card.sopIds || []).length) { score += 10; reasons.push('SOP غير مربوط'); }
  if ((card.requiresMachine || (card.tags || []).some(t => /machine|cnc|laser|router|ماكينة|ليزر|راوتر/i.test(String(t)))) && !(card.machineIds || []).length) { score += 12; reasons.push('ماكينة غير محددة'); }
  if (matStatus === 'missing') { score += 16; reasons.push('مواد ناقصة'); }
  if (kanbanCardHasFailedQc(card)) { score += 22; reasons.push('QC فاشل'); }
  if (kanbanCardIsBlocked(card)) { score += 20; reasons.push('معلقة'); }
  const deps = card.dependencies || card.blockedBy || [];
  if (deps.length) {
    const openDeps = deps.filter(id => {
      const depCard = (omni.kanban?.cards || []).find(c => c.id === id);
      return depCard && !kanbanCardIsDone(depCard);
    }).length;
    if (openDeps) { score += Math.min(18, openDeps * 9); reasons.push('اعتمادات غير مكتملة'); }
  }
  score = Math.min(100, score);
  const level = score >= 70 ? 'critical' : score >= 46 ? 'high' : score >= 22 ? 'medium' : 'low';
  const labels = { low: 'منخفض', medium: 'متوسط', high: 'عالي', critical: 'حرج' };
  return { level, score, reasons, badges: reasons.slice(0, 3), label: labels[level] };
}

function calculateKanbanBoardHealth() {
  ensureOmni();
  const cards = omni.kanban.cards || [];
  const openCards = cards.filter(c => !kanbanCardIsDone(c));
  const risks = cards.map(c => calculateKanbanCardRisk(c));
  const materialBlockedCards = openCards.filter(c => calculateMaterialAvailability(c) === 'missing').length;
  const machinePressure = calculateKanbanMachinePressure();
  const machineBlockedCards = openCards.filter(c => (c.machineIds || []).some(id => {
    const m = getMachineById(id);
    return m && /maintenance|offline|down|تعطل|صيانة/i.test(String(m.status || ''));
  })).length;
  const missingSop = openCards.filter(c => !(c.sopIds || []).length).length;
  const failedQc = openCards.filter(kanbanCardHasFailedQc).length;
  const overdueCards = openCards.filter(c => calculateDueRisk(c) === 'overdue').length;
  const urgentCards = openCards.filter(c => String(c.priority || '').toLowerCase().includes('urgent')).length;
  const noAssigneeCards = openCards.filter(c => !getKanbanAssigneeKey(c)).length;
  const urgentNotStarted = openCards.filter(c => String(c.priority || '').toLowerCase().includes('urgent') && !kanbanColumnLooksActive((omni.kanban.columns || []).find(col => col.id === c.columnId))).length;
  const penalty = overdueCards * 9 + materialBlockedCards * 10 + machineBlockedCards * 8 + missingSop * 3 + failedQc * 12 + noAssigneeCards * 5 + urgentNotStarted * 7 + risks.filter(r => r.level === 'critical').length * 8;
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));
  const status = healthScore >= 85 ? 'ممتاز' : healthScore >= 68 ? 'جيد' : healthScore >= 45 ? 'يحتاج متابعة' : 'خطر';
  const warnings = [];
  if (overdueCards) warnings.push(`${overdueCards} بطاقات متأخرة`);
  if (materialBlockedCards) warnings.push(`${materialBlockedCards} مواد ناقصة`);
  if (machinePressure.some(m => m.score >= 75)) warnings.push('مكائن مزدحمة');
  return { totalCards: cards.length, activeCards: openCards.filter(c => kanbanColumnLooksActive((omni.kanban.columns || []).find(col => col.id === c.columnId))).length, overdueCards, urgentCards, noAssigneeCards, materialBlockedCards, machineBlockedCards, healthScore, status, warnings };
}

function getKanbanDepartmentStatus(score) {
  if (score >= 80) return { label: 'خطر', color: '#f87171' };
  if (score >= 60) return { label: 'مزدحم', color: '#fb923c' };
  if (score >= 35) return { label: 'مشغول', color: '#fbbf24' };
  return { label: 'طبيعي', color: '#34d399' };
}

function calculateKanbanDepartmentLoad() {
  ensureOmni();
  const groups = {};
  (omni.kanban.cards || []).filter(c => !kanbanCardIsDone(c)).forEach(card => {
    const name = getKanbanDepartmentName(card);
    if (!groups[name]) groups[name] = { name, openCards: 0, inProgressCards: 0, overdueCards: 0, urgentCards: 0, estimatedMinutes: 0, blockedCards: 0 };
    const g = groups[name];
    g.openCards++;
    if (kanbanColumnLooksActive((omni.kanban.columns || []).find(col => col.id === card.columnId))) g.inProgressCards++;
    if (calculateDueRisk(card) === 'overdue') g.overdueCards++;
    if (String(card.priority || '').toLowerCase().includes('urgent')) g.urgentCards++;
    if (kanbanCardIsBlocked(card) || calculateMaterialAvailability(card) === 'missing' || kanbanCardHasFailedQc(card)) g.blockedCards++;
    g.estimatedMinutes += getKanbanEstimate(card);
  });
  return Object.values(groups).map(g => {
    g.workloadScore = Math.min(100, g.openCards * 8 + g.inProgressCards * 8 + g.overdueCards * 16 + g.urgentCards * 12 + g.blockedCards * 14 + (g.estimatedMinutes / 60) * 3);
    g.status = getKanbanDepartmentStatus(g.workloadScore);
    return g;
  }).sort((a, b) => b.workloadScore - a.workloadScore);
}

function getKanbanEmployeeLoadStatus(score) {
  if (score >= 78) return { label: 'الموظف مضغوط', color: '#f87171' };
  if (score >= 46) return { label: 'مشغول', color: '#fbbf24' };
  if (score <= 18) return { label: 'يمكن تحويل مهمة إليه', color: '#34d399' };
  return { label: 'الموظف متاح', color: '#38bdf8' };
}

function calculateKanbanEmployeeLoad() {
  ensureOmni();
  const groups = {};
  (employees || []).forEach(emp => {
    const key = String(emp.id || emp.name);
    groups[key] = { id: key, name: emp.name || key, openCards: 0, overdueCards: 0, urgentCards: 0, inProgressCards: 0, checklistDone: 0, checklistTotal: 0 };
  });
  (omni.kanban.cards || []).filter(c => !kanbanCardIsDone(c)).forEach(card => {
    const key = getKanbanAssigneeKey(card) || 'unassigned';
    if (!groups[key]) groups[key] = { id: key, name: getCardAssigneeName(card) || 'بدون مسؤول', openCards: 0, overdueCards: 0, urgentCards: 0, inProgressCards: 0, checklistDone: 0, checklistTotal: 0 };
    const g = groups[key];
    g.openCards++;
    if (calculateDueRisk(card) === 'overdue') g.overdueCards++;
    if (String(card.priority || '').toLowerCase().includes('urgent')) g.urgentCards++;
    if (kanbanColumnLooksActive((omni.kanban.columns || []).find(col => col.id === card.columnId))) g.inProgressCards++;
    (card.checklist || []).forEach(item => { g.checklistTotal++; if (item.done) g.checklistDone++; });
  });
  return Object.values(groups).filter(g => g.openCards > 0 || g.id !== 'unassigned').map(g => {
    g.checklistAverage = g.checklistTotal ? Math.round((g.checklistDone / g.checklistTotal) * 100) : 0;
    g.loadScore = Math.min(100, g.openCards * 12 + g.inProgressCards * 10 + g.overdueCards * 18 + g.urgentCards * 14);
    g.status = getKanbanEmployeeLoadStatus(g.loadScore);
    return g;
  }).sort((a, b) => b.loadScore - a.loadScore);
}

function calculateKanbanMachinePressure() {
  ensureOmni();
  return (omni.machines || []).map(machine => {
    const linkedCards = (omni.kanban.cards || []).filter(c => !kanbanCardIsDone(c) && (c.machineIds || []).includes(machine.id));
    const queueLength = Array.isArray(machine.queue) ? machine.queue.length : 0;
    const estimatedMinutes = linkedCards.reduce((sum, card) => sum + getKanbanEstimate(card), 0);
    const unavailable = /maintenance|offline|down|تعطل|صيانة/i.test(String(machine.status || ''));
    const bottleneckScore = Math.min(100, queueLength * 14 + linkedCards.length * 13 + (estimatedMinutes / 60) * 4 + (unavailable ? 35 : 0));
    return { id: machine.id, name: machine.name || machine.id, status: machine.status || 'ready', queueLength, linkedCards: linkedCards.length, estimatedMinutes, bottleneckScore, score: bottleneckScore, unavailable };
  }).sort((a, b) => b.bottleneckScore - a.bottleneckScore);
}

function calculateKanbanColumnStats(column) {
  const cards = getFilteredKanbanCards(omni.kanban.cards || []).filter(card => card.columnId === column.id);
  const overdueCards = cards.filter(c => calculateDueRisk(c) === 'overdue').length;
  const estimatedMinutes = cards.reduce((sum, card) => sum + getKanbanEstimate(card), 0);
  const riskScore = cards.length ? Math.round(cards.reduce((sum, card) => sum + calculateKanbanCardRisk(card).score, 0) / cards.length) : 0;
  return { cards, count: cards.length, wipLimit: column.wip || column.wipLimit || 8, overdueCards, estimatedMinutes, healthScore: Math.max(0, 100 - riskScore), wipExceeded: cards.length > (column.wip || column.wipLimit || 8) };
}

function getKanbanBigScreenMode() {
  return localStorage.getItem('kanban_bigscreen_mode') === 'true';
}

function toggleKanbanBigScreenMode() {
  localStorage.setItem('kanban_bigscreen_mode', String(!getKanbanBigScreenMode()));
  renderKanbanBoard();
}

function getKanbanDensity() {
  return localStorage.getItem('kanban_density') || 'comfortable';
}

function toggleKanbanDensity() {
  localStorage.setItem('kanban_density', getKanbanDensity() === 'compact' ? 'comfortable' : 'compact');
  renderKanbanBoard();
}

function renderHelpMarker(text) {
  return `<span class="omni-help-marker" title="${String(text).replace(/"/g, '&quot;')}">?</span>`;
}

let kanbanViewMode = 'board';
function toggleKanbanView() { setKanbanViewMode(kanbanViewMode === 'board' ? 'list' : 'board'); }
function setKanbanViewMode(mode) { kanbanViewMode = mode || 'board'; renderKanbanBoard(); }

let kanbanGroupBy = 'none';
function setKanbanGroupBy(mode) { kanbanGroupBy = mode || 'none'; renderKanbanBoard(); }

let kanbanFilters = {
  search: "",
  owner: "all",
  assigneeId: "all",
  priority: "all",
  department: "all",
  machineId: "all",
  risk: "all",
  due: "all",
  qc: "all",
  sop: "all",
  status: "all"
};
let omniKanbanFilters = kanbanFilters;

function updateKanbanFilters(patch) {
  kanbanFilters = { ...kanbanFilters, ...patch };
  omniKanbanFilters = kanbanFilters;
  renderKanbanBoard();
}

function resetKanbanFilters() {
  kanbanFilters = { search: "", owner: "all", assigneeId: "all", priority: "all", department: "all", machineId: "all", risk: "all", due: "all", qc: "all", sop: "all", status: "all" };
  omniKanbanFilters = kanbanFilters;
  kanbanGroupBy = 'none';
  renderKanbanBoard();
}

function setKanbanFilter(key, val) {
  const map = { assignee: 'assigneeId' };
  updateKanbanFilters({ [map[key] || key]: val || 'all' });
}

function cardMatchesKanbanFilters(card, filters = kanbanFilters) {
  const f = filters || kanbanFilters;
  const search = String(f.search || '').trim().toLowerCase();
  if (search) {
    const haystack = [card.title, card.description, card.clientName, card.client, card.owner, card.assignedTo, ...(card.tags || [])].join(' ').toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  const assigneeKey = getKanbanAssigneeKey(card);
  if (f.owner !== 'all' && String(card.owner || card.assignedTo || '') !== String(f.owner)) return false;
  if (f.assigneeId !== 'all' && String(assigneeKey) !== String(f.assigneeId)) return false;
  if (f.priority !== 'all' && String(card.priority || 'Normal') !== String(f.priority)) return false;
  if (f.department !== 'all' && getKanbanDepartmentName(card) !== f.department) return false;
  if (f.machineId !== 'all' && !(card.machineIds || []).includes(f.machineId)) return false;
  if (f.risk !== 'all' && calculateKanbanCardRisk(card).level !== f.risk) return false;
  if (f.status !== 'all' && String(card.columnId || card.status || '') !== String(f.status)) return false;
  if (f.sop === 'linked' && !(card.sopIds || []).length) return false;
  if (f.sop === 'missing' && (card.sopIds || []).length) return false;
  const matStatus = calculateMaterialAvailability(card);
  if (f.qc !== 'all' && kanbanCardQcStatus(card) !== f.qc) return false;
  if (f.risk === 'materials_missing' && matStatus !== 'missing') return false;
  if (f.due !== 'all') {
    const dueRisk = calculateDueRisk(card);
    const today = todayISO();
    const due = card.dueDate ? new Date(card.dueDate) : null;
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    if (f.due === 'today' && dueRisk !== 'due_today') return false;
    if (f.due === 'overdue' && dueRisk !== 'overdue') return false;
    if (f.due === 'no_due' && card.dueDate) return false;
    if (f.due === 'this_week' && (!due || card.dueDate < today || due > weekEnd)) return false;
  }
  return true;
}

function getFilteredKanbanCards(cards) {
  return (cards || []).filter(card => cardMatchesKanbanFilters(card, kanbanFilters));
}

function renderKanbanBoard() {
  ensureOmni();
  const board = document.getElementById('omniKanbanBoard');
  if (!board) return;
  if (kanbanViewMode === 'list' || kanbanViewMode === 'table') return renderKanbanListView();
  if (kanbanViewMode === 'workload') return renderKanbanWorkloadView();
  renderKanbanBoardView();
}

function renderKanbanToolbar() {
  const cards = omni.kanban.cards || [];
  const assignees = [...new Map(cards.map(c => [getKanbanAssigneeKey(c), getCardAssigneeName(c)]).filter(([id]) => id)).entries()];
  const owners = [...new Set(cards.map(c => c.owner || c.assignedTo).filter(Boolean))];
  const departments = [...new Set(cards.map(getKanbanDepartmentName).filter(Boolean))];
  const machines = omni.machines || [];
  const columns = omni.kanban.columns || [];
  const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  return `
    <div class="kanban-board-toolbar">
      <div class="kanban-view-tabs">
        <button class="${kanbanViewMode === 'board' ? 'active' : ''}" onclick="setKanbanViewMode('board')"><i class="fa-solid fa-table-columns"></i> لوحة</button>
        <button class="${kanbanViewMode === 'list' ? 'active' : ''}" onclick="setKanbanViewMode('list')"><i class="fa-solid fa-list"></i> قائمة</button>
        <button class="${kanbanViewMode === 'workload' ? 'active' : ''}" onclick="setKanbanViewMode('workload')"><i class="fa-solid fa-chart-simple"></i> عبء العمل</button>
      </div>
      <div class="kanban-filter-grid">
        <input class="kanban-filter-control" value="${escapeHtml(kanbanFilters.search)}" placeholder="بحث" oninput="updateKanbanFilters({search:this.value})">
        <select class="kanban-filter-control" onchange="updateKanbanFilters({assigneeId:this.value})">${option('all', 'كل المسؤولين', kanbanFilters.assigneeId)}${assignees.map(([id, name]) => option(id, name, kanbanFilters.assigneeId)).join('')}</select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({priority:this.value})">${option('all', 'كل الأولويات', kanbanFilters.priority)}${[['Urgent','عاجل'],['High','عالي'],['Normal','عادي'],['Low','منخفض']].map(([v,l]) => option(v, l, kanbanFilters.priority)).join('')}</select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({department:this.value})">${option('all', 'كل الأقسام', kanbanFilters.department)}${departments.map(d => option(d, d, kanbanFilters.department)).join('')}</select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({machineId:this.value})">${option('all', 'كل المكائن', kanbanFilters.machineId)}${machines.map(m => option(m.id, m.name || m.id, kanbanFilters.machineId)).join('')}</select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({status:this.value})">${option('all', 'كل الحالات', kanbanFilters.status)}${columns.map(c => option(c.id, c.title || c.name || c.id, kanbanFilters.status)).join('')}</select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({risk:this.value})">
          ${option('all', 'كل المخاطر', kanbanFilters.risk)}
          ${option('critical', 'حرج', kanbanFilters.risk)}
          ${option('high', 'عالي', kanbanFilters.risk)}
          ${option('medium', 'متوسط', kanbanFilters.risk)}
          ${option('low', 'منخفض', kanbanFilters.risk)}
        </select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({due:this.value})">
          ${option('all', 'تاريخ الاستحقاق', kanbanFilters.due)}
          ${option('today', 'اليوم', kanbanFilters.due)}
          ${option('overdue', 'متأخر', kanbanFilters.due)}
          ${option('this_week', 'هذا الأسبوع', kanbanFilters.due)}
          ${option('no_due', 'بدون موعد', kanbanFilters.due)}
        </select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({qc:this.value})">${option('all', 'كل QC', kanbanFilters.qc)}${option('pass', 'QC ناجح', kanbanFilters.qc)}${option('fail', 'QC فاشل', kanbanFilters.qc)}${option('pending', 'QC معلق', kanbanFilters.qc)}${option('none', 'بدون QC', kanbanFilters.qc)}</select>
        <select class="kanban-filter-control" onchange="updateKanbanFilters({sop:this.value})">${option('all', 'كل SOP', kanbanFilters.sop)}${option('linked', 'SOP مربوط', kanbanFilters.sop)}${option('missing', 'SOP مفقود', kanbanFilters.sop)}</select>
        <select class="kanban-filter-control" style="border: 1px solid rgba(34, 211, 238, 0.3); background: rgba(34, 211, 238, 0.1); color: #22d3ee;" onchange="setKanbanGroupBy(this.value)">
          <option value="none" ${kanbanGroupBy === 'none' ? 'selected' : ''} style="background:#0f172a; color:#fff;">تجميع حسب: بدون تجميع</option>
          <option value="project" ${kanbanGroupBy === 'project' ? 'selected' : ''} style="background:#0f172a; color:#fff;">تجميع حسب: العميل / المشروع</option>
          <option value="assignee" ${kanbanGroupBy === 'assignee' ? 'selected' : ''} style="background:#0f172a; color:#fff;">تجميع حسب: الموظف المسند</option>
          <option value="machine" ${kanbanGroupBy === 'machine' ? 'selected' : ''} style="background:#0f172a; color:#fff;">تجميع حسب: الماكينة</option>
          <option value="department" ${kanbanGroupBy === 'department' ? 'selected' : ''} style="background:#0f172a; color:#fff;">تجميع حسب: القسم</option>
        </select>
      </div>
      <div class="kanban-toolbar-actions">
        <button class="btn-ghost" onclick="toggleKanbanBigScreenMode()"><i class="fa-solid fa-display"></i> وضع الشاشة الكبيرة</button>
        <button class="btn-ghost" onclick="toggleKanbanDensity()"><i class="fa-solid fa-grip"></i> ${getKanbanDensity() === 'compact' ? 'مريح' : 'مضغوط'}</button>
        <button class="btn-ghost" onclick="resetKanbanFilters()"><i class="fa-solid fa-rotate-left"></i> إعادة ضبط</button>
      </div>
    </div>`;
}

function renderKanbanExecutiveSummary() {
  const health = calculateKanbanBoardHealth();
  const metrics = [
    ['إجمالي البطاقات', health.totalCards, 'fa-layer-group'],
    ['قيد التنفيذ', health.activeCards, 'fa-person-running'],
    ['متأخرة', health.overdueCards, 'fa-clock'],
    ['حرجة', (omni.kanban.cards || []).filter(c => calculateKanbanCardRisk(c).level === 'critical').length, 'fa-triangle-exclamation'],
    ['بدون مسؤول', health.noAssigneeCards, 'fa-user-slash'],
    ['مواد ناقصة', health.materialBlockedCards, 'fa-box-open'],
    ['مكائن مزدحمة', calculateKanbanMachinePressure().filter(m => m.score >= 75).length, 'fa-gears'],
    ['صحة اللوحة', `${health.healthScore}%`, 'fa-heart-pulse']
  ];
  return `
    <div class="kanban-exec-summary">
      ${metrics.map(([label, value, icon]) => `<div class="kanban-kpi"><i class="fa-solid ${icon}"></i><span>${label}</span><b>${value}</b></div>`).join('')}
      <div class="kanban-health-banner kanban-health-${health.status === 'خطر' ? 'danger' : health.status === 'يحتاج متابعة' ? 'warn' : 'good'}">
        <b>${health.status}</b><span>${health.warnings.join(' · ') || 'اللوحة مستقرة تشغيلياً'}</span>
      </div>
    </div>`;
}

function renderLoadChip(item, type) {
  const score = item.workloadScore ?? item.loadScore ?? item.bottleneckScore ?? item.score ?? 0;
  const status = item.status || getKanbanDepartmentStatus(score);
  const count = item.openCards ?? item.linkedCards ?? 0;
  return `
    <button class="kanban-load-chip" onclick="updateKanbanFilters({${type === 'department' ? `department:'${String(item.name).replace(/'/g, "\\'")}'` : type === 'employee' ? `assigneeId:'${String(item.id).replace(/'/g, "\\'")}'` : `machineId:'${String(item.id).replace(/'/g, "\\'")}'`}})">
      <span class="kanban-load-title">${escapeHtml(item.name)}</span>
      <span class="kanban-load-meta">${count} مفتوحة · ${item.overdueCards || 0} متأخرة</span>
      <span class="kanban-load-bar"><i style="width:${Math.min(100, score)}%;background:${status.color || (item.unavailable ? '#f87171' : '#38bdf8')}"></i></span>
      <small style="color:${status.color || '#cbd5e1'}">${escapeHtml(status.label || translateMachineStatus(item.status) || '')}</small>
    </button>`;
}

function renderKanbanWorkloadPanel() {
  const departments = calculateKanbanDepartmentLoad().slice(0, 8);
  const employeesLoad = calculateKanbanEmployeeLoad().slice(0, 8);
  const machines = calculateKanbanMachinePressure().slice(0, 8);
  return `
    <div class="kanban-workload-panel">
      <section><h3>ضغط الأقسام</h3><div class="kanban-load-row">${departments.map(d => renderLoadChip(d, 'department')).join('') || '<div class="kanban-empty-inline">لا توجد بطاقات هنا حالياً</div>'}</div></section>
      <section><h3>ضغط الموظفين</h3><div class="kanban-load-row">${employeesLoad.map(e => renderLoadChip(e, 'employee')).join('') || '<div class="kanban-empty-inline">لا توجد مهام مسندة</div>'}</div></section>
      <section><h3>ضغط المكائن</h3><div class="kanban-load-row">${machines.map(m => renderLoadChip({ ...m, name: m.name, openCards: m.linkedCards, overdueCards: m.queueLength, status: { label: m.unavailable ? 'صيانة / متوقفة' : translateMachineStatus(m.status), color: m.unavailable ? '#f87171' : '#38bdf8' } }, 'machine')).join('') || '<div class="kanban-empty-inline">لم يتم تحديد ماكينة لهذه البطاقة</div>'}</div></section>
    </div>`;
}

function renderKanbanBoardView() {
  const board = document.getElementById('omniKanbanBoard');
  const shellClasses = ['kanban-executive-board', getKanbanBigScreenMode() ? 'kanban-bigscreen-mode' : '', `kanban-density-${getKanbanDensity()}`].join(' ');
  const totalFiltered = getFilteredKanbanCards(omni.kanban.cards || []).length;
  board.className = 'omni-kanban-board kanban-board-shell';

  let boardContentHtml = '';

  if (kanbanGroupBy === 'none') {
    boardContentHtml = `
      <div class="kanban-board-grid">
        ${(omni.kanban.columns || []).map(col => {
          const stats = calculateKanbanColumnStats(col);
          return `
            <div class="kanban-column-v2 omni-kanban-col ${getKanbanColumnClass(col)}" style="${getKanbanColumnStyle(col)}" ondragover="event.preventDefault(); this.classList.add('kanban-column-drop-active')" ondragleave="this.classList.remove('kanban-column-drop-active')" ondrop="omniDropCard(event, '${col.id}'); this.classList.remove('kanban-column-drop-active')">
              <div class="kanban-column-header-group" style="border-top-color:${normalizeKanbanHexColor(col.color, '#38bdf8')}">
                <div class="kanban-column-header-v2">
                  <div><b>${escapeHtml(col.title || col.name || 'Column')}</b><span style="margin-right: 8px; font-size: 0.8rem; color: var(--text-muted);">${stats.count} بطاقة · WIP ${stats.count}/${stats.wipLimit}</span></div>
                  <div class="col-head-actions">
                    <button class="icon-btn" onclick="editKanbanColumnStyle('${col.id}')" title="تنسيق العمود"><i class="fa-solid fa-palette"></i></button>
                    <button class="icon-btn" onclick="addKanbanCard('${col.id}')" title="إضافة بطاقة"><i class="fa-solid fa-plus"></i></button>
                    <button class="icon-btn icon-btn-danger" onclick="deleteKanbanColumn('${col.id}')" title="حذف العمود"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </div>
                <div class="kanban-column-stats ${stats.wipExceeded ? 'wip-over' : ''}">
                  <span>${stats.wipExceeded ? 'تجاوز حد WIP' : 'WIP طبيعي'}</span>
                  <span>متأخرة: ${stats.overdueCards}</span>
                  <span>${stats.estimatedMinutes} دقيقة</span>
                </div>
              </div>
              <div class="kanban-column-body-v2 omni-card-list">
                ${stats.cards.map(renderKanbanCardV2).join('') || '<div class="kanban-column-empty">لا توجد بطاقات هنا حالياً</div>'}
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  } else {
    const filteredCards = getFilteredKanbanCards(omni.kanban.cards || []);
    const groupsMap = {};
    filteredCards.forEach(card => {
      let groupKey = 'none';
      if (kanbanGroupBy === 'project') {
        groupKey = card.clientName || card.client || "بدون عميل / مشروع";
      } else if (kanbanGroupBy === 'assignee') {
        groupKey = getCardAssigneeName(card) || "غير مسند";
        if (groupKey === '-') groupKey = "غير مسند";
      } else if (kanbanGroupBy === 'machine') {
        const mId = card.machineIds?.[0] || card.machineId;
        const machine = mId ? getMachineById(mId) : null;
        groupKey = machine ? (machine.name || machine.id) : "بدون ماكينة";
      } else if (kanbanGroupBy === 'department') {
        groupKey = getKanbanDepartmentName(card) || "غير مصنف";
      }
      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = [];
      }
      groupsMap[groupKey].push(card);
    });

    const groupNames = Object.keys(groupsMap).sort((a, b) => {
      const fallbacks = ["بدون عميل / مشروع", "غير مسند", "بدون ماكينة", "غير مصنف", "none"];
      const aIsFallback = fallbacks.includes(a);
      const bIsFallback = fallbacks.includes(b);
      if (aIsFallback && !bIsFallback) return 1;
      if (!aIsFallback && bIsFallback) return -1;
      return a.localeCompare(b, 'ar');
    });

    let groupIcon = '<i class="fa-solid fa-folder-open"></i>';
    if (kanbanGroupBy === 'project') groupIcon = '<i class="fa-solid fa-diagram-project"></i>';
    if (kanbanGroupBy === 'assignee') groupIcon = '<i class="fa-solid fa-user-gear"></i>';
    if (kanbanGroupBy === 'machine') groupIcon = '<i class="fa-solid fa-gears"></i>';
    if (kanbanGroupBy === 'department') groupIcon = '<i class="fa-solid fa-sitemap"></i>';

    boardContentHtml = groupNames.map(groupName => {
      const groupCards = groupsMap[groupName];
      return `
        <div class="kanban-swimlane-row" style="margin-bottom: 24px;">
          <div class="kanban-swimlane-header" style="background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(8px); border-radius: 8px; padding: 10px 16px; margin: 15px 0 10px 0; font-weight: bold; border: 1px solid rgba(34, 211, 238, 0.15); display: flex; align-items: center; justify-content: space-between; gap: 10px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);">
            <div style="display: flex; align-items: center; gap: 10px; font-size: 1.05rem; color: #22d3ee;">
              ${groupIcon}
              <span>${escapeHtml(groupName)}</span>
            </div>
            <span style="font-size: 0.8rem; background: rgba(34, 211, 238, 0.1); color: #22d3ee; padding: 3px 10px; border-radius: 20px; border: 1px solid rgba(34, 211, 238, 0.15);">${groupCards.length} بطاقة</span>
          </div>

          <div class="kanban-board-grid" style="min-height: auto; padding-bottom: 10px;">
            ${(omni.kanban.columns || []).map(col => {
              const colCards = groupCards.filter(card => card.columnId === col.id);
              const overdueCards = colCards.filter(c => calculateDueRisk(c) === 'overdue').length;
              const estimatedMinutes = colCards.reduce((sum, card) => sum + getKanbanEstimate(card), 0);
              const riskScore = colCards.length ? Math.round(colCards.reduce((sum, card) => sum + calculateKanbanCardRisk(card).score, 0) / colCards.length) : 0;
              const wipLimit = col.wip || col.wipLimit || 8;
              const wipExceeded = colCards.length > wipLimit;
              const stats = { cards: colCards, count: colCards.length, wipLimit, overdueCards, estimatedMinutes, healthScore: Math.max(0, 100 - riskScore), wipExceeded };

              return `
                <div class="kanban-column-v2 omni-kanban-col ${getKanbanColumnClass(col)}" style="min-height: 150px; ${getKanbanColumnStyle(col)}" ondragover="event.preventDefault(); this.classList.add('kanban-column-drop-active')" ondragleave="this.classList.remove('kanban-column-drop-active')" ondrop="omniDropCard(event, '${col.id}'); this.classList.remove('kanban-column-drop-active')">
                  <div class="kanban-column-header-group" style="border-top-color:${normalizeKanbanHexColor(col.color, '#38bdf8')}; padding: 8px 10px 6px;">
                    <div class="kanban-column-header-v2">
                      <div><b style="font-size: 0.9rem; opacity: 0.8;">${escapeHtml(col.title || col.name || 'Column')}</b><span style="font-size: 0.75rem; margin-right: 8px; opacity: 0.7;">${stats.count}</span></div>
                      <div class="col-head-actions">
                        <button class="icon-btn" onclick="editKanbanColumnStyle('${col.id}')" title="تنسيق العمود"><i class="fa-solid fa-palette"></i></button>
                        <button class="icon-btn" onclick="addKanbanCard('${col.id}', '${escapeHtml(groupName).replace(/'/g, "\\'")}', '${kanbanGroupBy}')" title="إضافة بطاقة"><i class="fa-solid fa-plus"></i></button>
                      </div>
                    </div>
                    <div class="kanban-column-stats ${stats.wipExceeded ? 'wip-over' : ''}" style="font-size: 0.72rem;">
                      <span>متأخرة: ${stats.overdueCards}</span>
                      <span>${stats.estimatedMinutes} د</span>
                    </div>
                  </div>
                  <div class="kanban-column-body-v2 omni-card-list" style="min-height: 80px;">
                    ${stats.cards.map(renderKanbanCardV2).join('') || '<div class="kanban-column-empty" style="padding: 10px; font-size: 0.75rem; opacity: 0.4;">لا توجد بطاقات</div>'}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  board.innerHTML = `
    <div class="${shellClasses}">
      ${renderKanbanToolbar()}
      ${renderKanbanExecutiveSummary()}
      ${renderKanbanWorkloadPanel()}
      ${totalFiltered ? '' : '<div class="kanban-empty-state">لا توجد نتائج حسب الفلاتر الحالية <button class="btn-ghost" onclick="resetKanbanFilters()">إعادة ضبط الفلاتر</button></div>'}
      ${boardContentHtml}
    </div>`;
}

function renderKanbanCardV2(card) {
  const dueRisk = calculateDueRisk(card);
  const readiness = calculateCardReadiness(card);
  const risk = calculateKanbanCardRisk(card);
  const indicators = getCardIndicators(card);
  const cardColor = getKanbanCardColor(card);
  const checklist = kanbanChecklistProgress(card);
  const qcStatus = kanbanCardQcStatus(card);
  const dueClass = dueRisk === 'overdue' ? 'card-due-overdue' : dueRisk === 'due_today' ? 'card-due-today' : dueRisk === 'due_tomorrow' ? 'card-due-tomorrow' : '';
  const age = card.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(card.createdAt).getTime()) / 864e5)) : 0;
  return `
    <div class="kanban-card-v2 omni-kanban-card ${dueClass} kanban-risk-${risk.level} kanban-card-color-${cardColor}" style="${getKanbanCardStyleVars(card)}" draggable="true" ondragstart="omniDragCard(event, '${card.id}')" ondragend="this.classList.remove('kanban-card-dragging')" onclick="openKanbanCardInspector('${card.id}')">
      <span class="kanban-card-accent"></span>
      <div class="kanban-card-header-v2">
        <span class="card-priority ${priorityClass(card.priority)}">${escapeHtml(translatePriority(card.priority || 'Normal'))}</span>
        <span class="kanban-risk-badge kanban-risk-${risk.level}">${risk.label}</span>
      </div>
      ${card.clientName ? `<div class="card-client"><i class="fa-solid fa-building"></i> ${escapeHtml(card.clientName)}</div>` : ''}
      <h4 class="kanban-card-title-v2">${escapeHtml(card.title || 'بدون عنوان')}</h4>
      ${card.description ? `<p class="card-desc">${escapeHtml(String(card.description).slice(0, 96))}${String(card.description).length > 96 ? '...' : ''}</p>` : ''}
      <div class="kanban-card-meta-v2">
        <span><i class="fa-solid fa-user"></i> ${escapeHtml(getCardAssigneeName(card))}</span>
        <span><i class="fa-solid fa-sitemap"></i> ${escapeHtml(getKanbanDepartmentName(card))}</span>
        <span class="${dueClass}"><i class="fa-solid fa-calendar"></i> ${escapeHtml(card.dueDate || 'بدون موعد')}</span>
      </div>
      <div class="kanban-card-badges-v2">
        <span class="kanban-card-chip"><i class="fa-solid fa-list-check"></i> ${checklist}%</span>
        <span class="kanban-card-chip"><i class="fa-solid fa-book"></i> ${(card.sopIds || []).length ? 'SOP' : 'بدون SOP'}</span>
        <span class="kanban-card-chip"><i class="fa-solid fa-gear"></i> ${(card.machineIds || []).length || 'لا'}</span>
        <span class="kanban-card-chip"><i class="fa-solid fa-box"></i> ${calculateMaterialAvailability(card) === 'missing' ? 'ناقص' : (card.materialRequirements || []).length ? 'جاهز' : 'لا'}</span>
        <span class="kanban-card-chip"><i class="fa-solid fa-microscope"></i> ${qcStatus === 'none' ? 'لا QC' : qcStatus}</span>
      </div>
      ${risk.reasons.length ? `<div class="kanban-card-risk-row">${risk.reasons.slice(0, 3).map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div>` : ''}
      <div class="kanban-card-progress-v2"><span style="width:${checklist}%"></span><i style="width:${readiness.percent}%"></i></div>
      <div class="kanban-card-footer-v2">
        <span><i class="fa-solid fa-comment"></i> ${(card.comments || []).length}</span>
        <span><i class="fa-solid fa-paperclip"></i> ${(card.attachments || []).length}</span>
        <span><i class="fa-solid fa-coins"></i> ${(card.costEntries || []).length}</span>
        <span>${age ? `${age} يوم` : 'جديد'}</span>
        <button class="icon-btn icon-btn-sm icon-btn-danger" onclick="event.stopPropagation(); deleteKanbanCard('${card.id}')" title="حذف"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>`;
}

function renderKanbanListView() {
  const board = document.getElementById('omniKanbanBoard');
  const filteredCards = getFilteredKanbanCards(omni.kanban.cards || []);
  board.className = 'omni-kanban-board kanban-board-shell';
  board.innerHTML = `
    <div class="kanban-executive-board">
      ${renderKanbanToolbar()}
      ${renderKanbanExecutiveSummary()}
      <div class="table-container glass-card kanban-list-table">
        <table class="data-table">
          <thead><tr><th>العنوان</th><th>العمود</th><th>المسؤول</th><th>القسم</th><th>الأولوية</th><th>الخطر</th><th>التسليم</th><th>جاهزية</th></tr></thead>
          <tbody>
            ${filteredCards.map(card => {
              const col = (omni.kanban.columns || []).find(c => c.id === card.columnId);
              const risk = calculateKanbanCardRisk(card);
              return `<tr onclick="openKanbanCardInspector('${card.id}')" style="cursor:pointer">
                <td><b>${escapeHtml(card.title || '-')}</b><small>${escapeHtml(card.description || '')}</small></td>
                <td>${escapeHtml(col?.title || '-')}</td>
                <td>${escapeHtml(getCardAssigneeName(card))}</td>
                <td>${escapeHtml(getKanbanDepartmentName(card))}</td>
                <td><span class="${priorityClass(card.priority)}">${escapeHtml(translatePriority(card.priority || 'Normal'))}</span></td>
                <td><span class="kanban-risk-badge kanban-risk-${risk.level}">${risk.label}</span></td>
                <td>${escapeHtml(card.dueDate || '-')}</td>
                <td>${calculateCardReadiness(card).percent}%</td>
              </tr>`;
            }).join('') || '<tr><td colspan="8" class="text-center text-muted">لا توجد نتائج حسب الفلاتر الحالية</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderKanbanWorkloadView() {
  const board = document.getElementById('omniKanbanBoard');
  board.className = 'omni-kanban-board kanban-board-shell';
  board.innerHTML = `
    <div class="kanban-executive-board">
      ${renderKanbanToolbar()}
      ${renderKanbanExecutiveSummary()}
      ${renderKanbanWorkloadPanel()}
    </div>`;
}

function kanbanChecklistProgress(card) {
  const list = card.checklist || [];
  if (!list.length) return 0;
  return Math.round((list.filter(i => i.done).length / list.length) * 100);
}

function omniDragCard(ev, cardId) {
  omniDraggedCardId = cardId;
  ev.dataTransfer.setData('text/plain', cardId);
  ev.currentTarget?.classList?.add('kanban-card-dragging');
}

function omniDropCard(ev, columnId) {
  ev.preventDefault();
  ensureOmni();
  const cardId = omniDraggedCardId || ev.dataTransfer.getData('text/plain');
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const col = omni.kanban.columns.find(c => c.id === columnId);

  if (col && (col.title === 'مكتمل' || col.title === 'Done' || col.title.toLowerCase().includes('done'))) {
    if (card.blockedBy && card.blockedBy.length > 0) {
      const blockers = omni.kanban.cards.filter(c => card.blockedBy.includes(c.id));
      const unfinished = blockers.filter(b => {
        const bCol = omni.kanban.columns.find(c => c.id === b.columnId);
        return !(bCol && (bCol.title === 'مكتمل' || bCol.title === 'Done' || bCol.title.toLowerCase().includes('done')));
      });
      if (unfinished.length > 0) {
        showToast('لا يمكن نقل البطاقة! تعتمد على مهام غير مكتملة', 'error');
        return;
      }
    }
  }

  card.columnId = columnId;
  card.status = col ? (kanbanColumnLooksDone(col) ? 'done' : kanbanColumnLooksActive(col) ? 'in_progress' : card.status || '') : card.status;
  appendKanbanActivity(card, `تم نقل البطاقة إلى: ${col?.title || columnId}`);
  omniDraggedCardId = null;
  saveData();
  renderKanbanBoard();
  showToast('تم نقل البطاقة وتحديث اللوحة', 'success');
}

async function addKanbanCard(columnId = 'kb_backlog', prefilledGroup = null, prefilledGroupBy = null) {
  ensureOmni();
  let defaultOwner = '';
  let defaultClient = '';
  let defaultDept = '';
  if (prefilledGroup && prefilledGroupBy) {
    const fallbacks = ["بدون عميل / مشروع", "غير مسند", "بدون ماكينة", "غير مصنف", "none"];
    const isFallback = fallbacks.includes(prefilledGroup);
    if (!isFallback) {
      if (prefilledGroupBy === 'project') {
        defaultClient = prefilledGroup;
      } else if (prefilledGroupBy === 'assignee') {
        defaultOwner = prefilledGroup;
      } else if (prefilledGroupBy === 'department') {
        defaultDept = prefilledGroup;
      }
    }
  }
  const html = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label>عنوان البطاقة</label>
      <input type="text" id="kbcTitle" class="form-input" placeholder="مثال: صيانة الماكينة">
      <label>المسؤول</label>
      <input type="text" id="kbcOwner" class="form-input" value="${escapeHtml(defaultOwner)}" placeholder="اسم الموظف">
      ${defaultClient ? `
        <label>العميل / المشروع</label>
        <input type="text" id="kbcClient" class="form-input" value="${escapeHtml(defaultClient)}">
      ` : ''}
      ${defaultDept ? `
        <label>القسم</label>
        <input type="text" id="kbcDept" class="form-input" value="${escapeHtml(defaultDept)}">
      ` : ''}
      <label>الأولوية</label>
      <select id="kbcPriority" class="form-input">
        <option value="Urgent">Urgent</option>
        <option value="High">High</option>
        <option value="Normal" selected>Normal</option>
        <option value="Low">Low</option>
      </select>
      <label>Tags (مفصولة بفارزة)</label>
      <input type="text" id="kbcTags" class="form-input" placeholder="صيانة, مستعجل, تصميم">
      <label>لون البطاقة</label>
      <select id="kbcColor" class="form-input">${getKanbanColorOptions('default')}</select>
      <label>لون مخصص</label>
      <input type="color" id="kbcCustomColor" class="form-input kanban-color-input" value="#38bdf8">
    </div>
  `;
  const result = await showOmniModal('إضافة بطاقة جديدة', html, (body) => {
    const title = body.querySelector('#kbcTitle').value.trim();
    if (!title) return false;
    return {
      title,
      owner: body.querySelector('#kbcOwner').value.trim(),
      clientName: body.querySelector('#kbcClient')?.value.trim() || defaultClient,
      department: body.querySelector('#kbcDept')?.value.trim() || defaultDept,
      priority: body.querySelector('#kbcPriority').value,
      tags: body.querySelector('#kbcTags').value.split(',').map(t=>t.trim()).filter(Boolean),
      color: body.querySelector('#kbcColor')?.value || 'default',
      customColor: normalizeKanbanHexColor(body.querySelector('#kbcCustomColor')?.value, '#38bdf8')
    };
  });
  if (!result) return;
  let mIds = [];
  if (prefilledGroup && prefilledGroupBy === 'machine') {
    const m = (omni.machines || []).find(x => (x.name || x.id) === prefilledGroup);
    if (m) mIds = [m.id];
  }
  const cardColor = KANBAN_CARD_COLORS.includes(result.color) ? result.color : 'default';
  const newCard = { id: makeId('card'), columnId, title: result.title, owner: result.owner, clientName: result.clientName || '', assigneeId: '', department: result.department || '', color: cardColor, accentColor: cardColor, customColor: result.customColor, priority: result.priority, dueDate: todayISO(), tags: result.tags, description: '', checklist: [], comments: [], activityLog: [], blockedBy: [], machineIds: mIds };
  omni.kanban.cards.push(newCard);
  saveData();
  renderKanbanBoard();
  triggerOmniEvent('QUOTE_CREATED', { card: newCard });
}

async function addKanbanColumn() {
  ensureOmni();
  const title = await showOmniPrompt('اسم العمود الجديد:');
  if (!title) return;
  omni.kanban.columns.push({ id: makeId('kb_col'), title: title.trim(), color: '#38bdf8', headerStyle: 'glass', bodyTone: 0.08, wip: 8 });
  saveData();
  renderKanbanBoard();
}

async function editKanbanColumnStyle(colId) {
  ensureOmni();
  const col = (omni.kanban.columns || []).find(c => c.id === colId);
  if (!col) return;
  const color = normalizeKanbanHexColor(col.color, '#38bdf8');
  const style = KANBAN_COLUMN_STYLES.some(item => item.value === col.headerStyle) ? col.headerStyle : 'glass';
  const bodyTone = Math.round(Math.min(0.28, Math.max(0, Number(col.bodyTone ?? 0.08))) * 100);
  const styleOptions = KANBAN_COLUMN_STYLES.map(item => `<option value="${item.value}" ${style === item.value ? 'selected' : ''}>${item.label}</option>`).join('');
  const html = `
    <div class="kanban-style-modal">
      <label>اسم العمود
        <input id="kanbanColumnTitle" class="form-input" value="${escapeHtml(col.title || col.name || '')}">
      </label>
      <label>لون العمود
        <input id="kanbanColumnColor" class="form-input kanban-color-input" type="color" value="${color}">
      </label>
      <label>نمط الهيدر
        <select id="kanbanColumnStyle" class="form-input">${styleOptions}</select>
      </label>
      <label>قوة لون خلفية العمود
        <input id="kanbanColumnTone" class="form-input" type="range" min="0" max="28" value="${bodyTone}">
      </label>
      <div class="kanban-style-preview" style="--column-color:${color};--column-tone:${(bodyTone / 100).toFixed(2)};--column-tone-percent:${bodyTone}%;">
        <b>${escapeHtml(col.title || 'عمود')}</b>
        <span>معاينة اللون والتنسيق</span>
      </div>
    </div>
  `;
  const result = await showOmniModal('تنسيق العمود', html, body => ({
    title: body.querySelector('#kanbanColumnTitle')?.value.trim() || col.title || col.name || 'Column',
    color: normalizeKanbanHexColor(body.querySelector('#kanbanColumnColor')?.value, color),
    headerStyle: body.querySelector('#kanbanColumnStyle')?.value || 'glass',
    bodyTone: (Number(body.querySelector('#kanbanColumnTone')?.value || 0) || 0) / 100
  }));
  if (!result) return;
  col.title = result.title;
  col.name = result.title;
  col.color = result.color;
  col.headerStyle = KANBAN_COLUMN_STYLES.some(item => item.value === result.headerStyle) ? result.headerStyle : 'glass';
  col.bodyTone = Math.min(0.28, Math.max(0, result.bodyTone));
  saveData();
  renderKanbanBoard();
  showToast('تم تحديث تنسيق العمود', 'success');
}

async function editKanbanCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const html = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label>عنوان البطاقة</label>
      <input type="text" id="ekbcTitle" class="form-input" value="${card.title}">
      <label>المسؤول</label>
      <input type="text" id="ekbcOwner" class="form-input" value="${card.owner || ''}">
      <label>الأولوية</label>
      <select id="ekbcPriority" class="form-input">
        <option value="Urgent" ${card.priority === 'Urgent' ? 'selected' : ''}>Urgent</option>
        <option value="High" ${card.priority === 'High' ? 'selected' : ''}>High</option>
        <option value="Normal" ${card.priority === 'Normal' ? 'selected' : ''}>Normal</option>
        <option value="Low" ${card.priority === 'Low' ? 'selected' : ''}>Low</option>
      </select>
      <label>Tags (مفصولة بفارزة)</label>
      <input type="text" id="ekbcTags" class="form-input" value="${(card.tags || []).join(', ')}">
      <label>لون البطاقة</label>
      <select id="ekbcColor" class="form-input">${getKanbanColorOptions(getKanbanCardColor(card))}</select>
      <label>لون مخصص</label>
      <input type="color" id="ekbcCustomColor" class="form-input kanban-color-input" value="${getKanbanCardAccentHex(card)}">
    </div>
  `;
  const result = await showOmniModal('تعديل بطاقة', html, (body) => {
    const title = body.querySelector('#ekbcTitle').value.trim();
    if (!title) return false;
    return {
      title,
      owner: body.querySelector('#ekbcOwner').value.trim(),
      priority: body.querySelector('#ekbcPriority').value,
      tags: body.querySelector('#ekbcTags').value.split(',').map(t=>t.trim()).filter(Boolean),
      color: body.querySelector('#ekbcColor')?.value || 'default',
      customColor: normalizeKanbanHexColor(body.querySelector('#ekbcCustomColor')?.value, getKanbanCardAccentHex(card))
    };
  });
  if (!result) return;
  card.title = result.title;
  card.owner = result.owner;
  card.priority = result.priority;
  card.tags = result.tags;
  card.color = KANBAN_CARD_COLORS.includes(result.color) ? result.color : 'default';
  card.accentColor = card.color;
  card.customColor = result.customColor;
  saveData();
  renderKanbanBoard();
}

async function deleteKanbanCard(cardId) {
  ensureOmni();
  const ok = await showOmniConfirm('حذف بطاقة', 'هل أنت متأكد من حذف هذه البطاقة؟', 'حذف', 'إلغاء');
  if (!ok) return;
  omni.kanban.cards = omni.kanban.cards.filter(c => c.id !== cardId);
  saveData(); renderKanbanBoard();
  showToast('تم حذف البطاقة', 'success');
}

async function deleteKanbanColumn(colId) {
  ensureOmni();
  const col = omni.kanban.columns.find(c => c.id === colId);
  if (!col) return;
  const cardsInCol = omni.kanban.cards.filter(c => c.columnId === colId);
  if (cardsInCol.length > 0) {
    const ok = await showOmniConfirm('حذف عمود', `العمود "${col.title}" يحتوي على ${cardsInCol.length} بطاقة. هل تريد حذف العمود وجميع بطاقاته؟`, 'حذف', 'إلغاء');
    if (!ok) return;
    omni.kanban.cards = omni.kanban.cards.filter(c => c.columnId !== colId);
  } else {
    const ok = await showOmniConfirm('حذف عمود', `هل تريد حذف العمود "${col.title}"؟`, 'حذف', 'إلغاء');
    if (!ok) return;
  }
  omni.kanban.columns = omni.kanban.columns.filter(c => c.id !== colId);
  saveData(); renderKanbanBoard();
  showToast('تم حذف العمود', 'success');
}

function openKanbanCardInspector(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!panel || !overlay) return;
  panel.classList.add('kanban-inspector-panel');
  panel.classList.add('kanban-inspector-v2');
  tabs.className = 'inspector-tabs kanban-inspector-tabs-side';
  body.className = 'inspector-body kanban-inspector-content';

  title.textContent = card.title;
  const tabList = ['نظرة عامة', 'Checklist', 'SOP', 'ماكينة', 'مواد', 'كلفة', 'نشاط', 'QC', 'روابط'];
  const tabHelp = [
    'معلومات البطاقة الأساسية: العنوان، المسؤول، الأولوية، القسم، الموعد، والحالة.',
    'قائمة خطوات صغيرة داخل البطاقة لمتابعة إنجاز العمل خطوة بخطوة.',
    'ربط البطاقة بإجراء تشغيلي قياسي حتى يعرف الفريق طريقة التنفيذ الصحيحة.',
    'ربط البطاقة بماكينة محددة مثل ليزر، راوتر، طابعة، أو غيرها.',
    'المواد المطلوبة لتنفيذ هذه البطاقة مع الكمية وحالة التوفر.',
    'تسجيل الكلف المرتبطة بهذه البطاقة مثل مواد، تشغيل، أجور، أو خدمات.',
    'سجل تلقائي يوضح ما حدث على البطاقة: ربط، تعديل، كلفة، تعليق، أو تغيير حالة.',
    'فحوصات الجودة المرتبطة بالبطاقة ونتائج القبول أو الرفض وإعادة العمل.',
    'الروابط والعلاقات الخاصة بالبطاقة مع كيانات أخرى في النظام.'
  ];
  let activeTab = 0;

  function renderInspectorTab(tabIdx) {
    activeTab = tabIdx;
    const tabButtonsHtml = tabList.map((t, i) => `<button class="insp-tab kanban-inspector-tab-btn ${i === tabIdx ? 'active' : ''}" onclick="renderKanbanInspectorTab('${cardId}', ${i})"><span>${t}</span>${renderHelpMarker(tabHelp[i])}</button>`).join('');
    tabs.innerHTML = tabButtonsHtml;

    if (tabIdx === 0) {
      const dueRisk = calculateDueRisk(card);
      const readiness = calculateCardReadiness(card);
      const risk = calculateKanbanCardRisk(card);
      const indicators = getCardIndicators(card);
      const departments = Array.isArray(omni.departments) ? omni.departments : [];
      const employeeOptions = (employees || []).map(emp => `<option value="${escapeHtml(emp.id || emp.name)}" ${String(card.assigneeId || card.owner || '') === String(emp.id || emp.name) ? 'selected' : ''}>${escapeHtml(emp.name)}</option>`).join('');
      const departmentOptions = departments.map(dep => `<option value="${escapeHtml(dep.name || dep)}" ${card.department === (dep.name || dep) ? 'selected' : ''}>${escapeHtml(dep.name || dep)}</option>`).join('');
      const colorOptions = getKanbanColorOptions(getKanbanCardColor(card));
      body.innerHTML = `
        <div class="kanban-inspector-header-v2">
          <div>
            <span class="cc-source-label">اللوحة التنفيذية</span>
            <h3>${escapeHtml(card.title || '-')}</h3>
            <p>${escapeHtml(card.description || 'لا يوجد وصف مختصر بعد')}</p>
          </div>
          <div class="kanban-quick-actions">
            <button class="btn-primary" onclick="startKanbanCard('${card.id}')"><i class="fa-solid fa-play"></i> بدء</button>
            <button class="btn-primary" onclick="completeKanbanCard('${card.id}')"><i class="fa-solid fa-check"></i> إنهاء</button>
            <button class="btn-ghost" onclick="blockKanbanCard('${card.id}')"><i class="fa-solid fa-ban"></i> تعليق</button>
            <button class="btn-ghost" onclick="unblockKanbanCard('${card.id}')"><i class="fa-solid fa-unlock"></i> إلغاء التعليق</button>
            <button class="btn-ghost" onclick="assignKanbanCardQuick('${card.id}')"><i class="fa-solid fa-user-plus"></i> إسناد</button>
            <button class="btn-ghost" onclick="requestMaterialForKanbanCard('${card.id}')"><i class="fa-solid fa-box"></i> طلب مادة</button>
          </div>
        </div>
        <div class="kanban-inspector-summary">
          <span><b>الأولوية</b>${escapeHtml(card.priority || 'Normal')}</span>
          <span><b>المسؤول</b>${escapeHtml(getCardAssigneeName(card))}</span>
          <span><b>القسم</b>${escapeHtml(getKanbanDepartmentName(card))}</span>
          <span><b>التسليم</b>${escapeHtml(card.dueDate || '-')}</span>
          <span><b>الخطر</b><em class="kanban-risk-badge kanban-risk-${risk.level}">${risk.label}</em></span>
          <span><b>الجاهزية</b>${readiness.percent}%</span>
        </div>
        ${risk.reasons.length ? `<div class="kanban-inspector-section-card"><h4>ملخص الخطر</h4><div class="kanban-card-risk-row">${risk.reasons.map(r => `<span>${escapeHtml(r)}</span>`).join('')}</div></div>` : ''}
        <div class="kanban-inspector-field-grid">
        <div class="insp-section"><h4>العنوان</h4><p>${card.title}</p></div>
        ${card.clientName ? `<div class="insp-section"><h4>العميل</h4><p>${card.clientName}</p></div>` : ''}
        <div class="insp-section"><h4>المسؤول</h4><p>${card.owner || '-'}</p></div>
        <div class="insp-section"><h4>الأولوية</h4><p class="${priorityClass(card.priority)}">${card.priority || 'Normal'}</p></div>
        <div class="insp-section"><h4>التسليم</h4><p class="${dueRisk === 'overdue' ? 'text-danger' : ''}">${card.dueDate || '-'} ${dueRisk === 'overdue' ? '(متأخر!)' : dueRisk === 'due_today' ? '(اليوم)' : ''}</p></div>
        <div class="insp-section"><h4>الوصف</h4><p>${card.description || '-'}</p></div>
        <div class="insp-section"><h4>Tags</h4><div class="card-tags">${(card.tags||[]).map(t => `<span>${t}</span>`).join('') || '-'}</div></div>
        <div class="insp-section"><h4>الجاهزية</h4><p>${readiness.percent}% (${readiness.score}/${readiness.total})</p></div>
        <div class="insp-section"><h4>المؤشرات</h4><div class="card-indicators">${indicators.map(ind => `<span class="card-indicator" style="color:${ind.color}"><i class="fa-solid ${ind.icon}"></i> ${ind.label}</span>`).join('') || '-'}</div></div>
        ${card.operationPackId ? `<div class="insp-section"><h4>باقة العمليات</h4><p>${(getOperationPackById(card.operationPackId)||{}).name || card.operationPackId}</p></div>` : ''}
        ${card.workflowId ? `<div class="insp-section"><h4>Workflow</h4><p>${card.workflowId}</p></div>` : ''}
        </div>
        <div class="insp-section kanban-overview-controls">
          <h4>إدارة البطاقة ${renderHelpMarker('اختر المسؤول، القسم، ولون البطاقة بدون تغيير مسارها في اللوحة.')}</h4>
          <label>المسؤول
            ${employeeOptions ? `<select class="kanban-inline-control" onchange="setKanbanAssignee('${card.id}', this.value)"><option value="">بدون مسؤول</option>${employeeOptions}</select>` : `<input class="kanban-inline-control" value="${escapeHtml(card.owner || '')}" onchange="setKanbanOwner('${card.id}', this.value)" placeholder="اسم المسؤول">`}
          </label>
          <label>القسم / الفرع
            <select class="kanban-inline-control" onchange="setKanbanDepartment('${card.id}', this.value)"><option value="">بدون قسم</option>${departmentOptions}</select>
          </label>
          <label>لون البطاقة
            <select class="kanban-inline-control" onchange="setKanbanCardColor('${card.id}', this.value)">${colorOptions}</select>
          </label>
          <label>لون مخصص
            <input type="color" class="kanban-inline-control kanban-color-input" value="${getKanbanCardAccentHex(card)}" onchange="setKanbanCardCustomColor('${card.id}', this.value)">
          </label>
        </div>
        <div class="insp-actions">
          <button class="btn-primary" onclick="editKanbanCard('${card.id}'); closeInspector(); renderKanbanBoard();"><i class="fa-solid fa-pen"></i> تعديل</button>
          <button class="btn-primary" onclick="editKanbanCardLinks('${card.id}')"><i class="fa-solid fa-link"></i> ربط</button>
          <button class="btn-danger" onclick="deleteKanbanCard('${card.id}'); closeInspector();"><i class="fa-solid fa-trash"></i> حذف</button>
        </div>
      `;
    } else if (tabIdx === 1) {
      const cl = card.checklist || [];
      body.innerHTML = `
        <div class="insp-section"><h4>Checklist (${cl.filter(i=>i.done).length}/${cl.length})</h4>
          <div class="insp-checklist">${cl.map((item, i) => `<label class="insp-check-item"><input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleKanbanChecklist('${card.id}', ${i})"> ${item.text}</label>`).join('') || '<p>لا يوجد checklist</p>'}</div>
          <div style="margin-top:10px"><button class="btn-primary" onclick="addKanbanChecklistItem('${card.id}')"><i class="fa-solid fa-plus"></i> إضافة بند</button></div>
        </div>
      `;
    } else if (tabIdx === 2) {
      const sops = (card.sopIds || []).map(id => getSopById(id)).filter(Boolean);
      const sopOptions = (omni.sops || []).map(s => `<option value="${s.id}">${escapeHtml(s.code || '')} ${escapeHtml(s.title)} (${escapeHtml(s.approvalStatus || s.status || '-')})</option>`).join('');
      body.innerHTML = `
        <div class="insp-section"><h4>SOPs المرتبطة (${sops.length})</h4>
          ${sops.map(s => `<div class="insp-linked-item" onclick="openSopInspector('${s.id}')" style="cursor:pointer">
            <b>${s.code || ''} — ${s.title}</b>
            <small>${s.type} · ${s.owner} · v${s.version||1} · ${(s.steps||[]).length} خطوة</small>
            ${s.approvalStatus === 'approved' ? '<span style="color:#10b981;font-size:11px">✓ معتمد</span>' : '<span style="color:#f59e0b;font-size:11px">● ' + ({'draft':'مسودة','review':'مراجعة'}[s.approvalStatus]||s.approvalStatus) + '</span>'}
          </div>`).join('') || '<p>لا يوجد SOP مرتبط</p>'}
          ${sopOptions ? `<div class="kanban-inline-linker"><select class="kanban-inline-control" id="kanbanSopSelect_${card.id}"><option value="">اختر SOP</option>${sopOptions}</select><button class="btn-primary" onclick="linkSopToCardDirect('${card.id}', document.getElementById('kanbanSopSelect_${card.id}').value)"><i class="fa-solid fa-link"></i> ربط SOP</button></div>` : '<div class="cc-empty">لا توجد SOPs محفوظة بعد. افتح مكتبة SOP لإضافة إجراء جديد.</div>'}
          <div style="margin-top:10px"><button class="btn-ghost" onclick="linkSopToCard('${card.id}')"><i class="fa-solid fa-keyboard"></i> إدخال يدوي احتياطي</button></div>
        </div>
      `;
    } else if (tabIdx === 3) {
      const machines = (card.machineIds || []).map(id => getMachineById(id)).filter(Boolean);
      const machineOptions = (omni.machines || []).map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.status || '-')})</option>`).join('');
      body.innerHTML = `
        <div class="insp-section"><h4>المكائن المطلوبة (${machines.length})</h4>
        ${machines.map(m => `<div class="insp-linked-item"><b>${m.name}</b><small>${translateMachineStatus(m.status)} · طابور: ${getMachineQueueCount(m)} · ${m.operator}</small></div>`).join('') || '<p>لا ماكينة مرتبطة</p>'}
          ${machineOptions ? `<div class="kanban-inline-linker"><select class="kanban-inline-control" id="kanbanMachineSelect_${card.id}"><option value="">اختر ماكينة</option>${machineOptions}</select><button class="btn-primary" onclick="linkMachineToCardDirect('${card.id}', document.getElementById('kanbanMachineSelect_${card.id}').value)"><i class="fa-solid fa-link"></i> ربط ماكينة</button></div>` : '<div class="cc-empty">لا توجد مكائن محفوظة بعد. افتح صفحة المكائن لإضافتها.</div>'}
          <div style="margin-top:10px"><button class="btn-ghost" onclick="linkMachineToCard('${card.id}')"><i class="fa-solid fa-keyboard"></i> إدخال يدوي احتياطي</button></div>
        </div>
      `;
    } else if (tabIdx === 4) {
      const mats = (card.materialRequirements || []).map(req => ({ ...req, mat: getMaterialById(req.materialId) }));
      const materialOptions = (omni.materials || []).map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${getMaterialAvailableQty(m)} ${escapeHtml(m.unit || '')})</option>`).join('');
      body.innerHTML = `
        <div class="insp-section"><h4>المواد المطلوبة (${mats.length})</h4>
          ${mats.map(r => {
            const m = r.mat;
            const avail = m ? getMaterialAvailableQty(m) : 0;
            return `<div class="insp-linked-item"><b>${m ? m.name : r.materialId}</b><small>مطلوب: ${r.quantity || 1} · متاح: ${avail} ${m ? m.unit : ''}</small>${avail < (r.quantity||1) ? '<span class="inv-badge inv-badge-danger">ناقص</span>' : '<span class="inv-badge inv-badge-ok">كافي</span>'}</div>`;
          }).join('') || '<p>لا مواد مطلوبة</p>'}
          ${materialOptions ? `<div class="kanban-inline-linker kanban-material-linker"><select class="kanban-inline-control" id="kanbanMaterialSelect_${card.id}"><option value="">اختر مادة</option>${materialOptions}</select><input class="kanban-inline-control" id="kanbanMaterialQty_${card.id}" type="number" min="0" step="0.01" value="1" placeholder="الكمية"><input class="kanban-inline-control" id="kanbanMaterialUnit_${card.id}" placeholder="الوحدة"><button class="btn-primary" onclick="linkMaterialToCardInline('${card.id}')"><i class="fa-solid fa-plus"></i> إضافة</button></div>` : '<div class="cc-empty">لا توجد مواد محفوظة بعد. افتح المخزون لإضافة مادة.</div>'}
          <div style="margin-top:10px"><button class="btn-ghost" onclick="linkMaterialToCard('${card.id}')"><i class="fa-solid fa-keyboard"></i> إدخال يدوي احتياطي</button></div>
        </div>
      `;
    } else if (tabIdx === 5) {
      body.innerHTML = `
        <div class="insp-section"><h4>سجل الكلف (${(card.costEntries||[]).length})</h4>
          ${(card.costEntries||[]).map(c => `<div class="insp-linked-item"><b>${c.description || 'كلفة'}</b><small>${(c.amount||0).toLocaleString()} IQD · ${c.date || '-'}</small></div>`).join('') || '<p>لا كلف مسجلة</p>'}
          <div style="margin-top:10px"><button class="btn-primary" onclick="addCostToCard('${card.id}')"><i class="fa-solid fa-plus"></i> إضافة كلفة</button></div>
        </div>
      `;
    } else if (tabIdx === 6) {
      body.innerHTML = `
        <div class="insp-section"><h4>سجل النشاط (${(card.activityLog||[]).length})</h4>
          ${(card.activityLog||[]).map(a => `<div class="insp-activity-item"><small>${a.date}</small><p>${a.text}</p></div>`).join('') || '<p>لا نشاط مسجل</p>'}
        </div>
        <div class="insp-section"><h4>التعليقات (${(card.comments||[]).length})</h4>
          ${(card.comments||[]).map(c => `<div class="insp-activity-item"><small>${c.date} · ${c.author || '-'}</small><p>${c.text}</p></div>`).join('') || '<p>لا تعليقات</p>'}
          <div class="kanban-inline-linker kanban-comment-box"><textarea class="kanban-inline-control" id="kanbanCommentText_${card.id}" placeholder="اكتب تعليقاً جديداً"></textarea><button class="btn-primary" onclick="addCommentToCardInline('${card.id}')"><i class="fa-solid fa-plus"></i> إضافة تعليق</button></div>
          <div style="margin-top:10px"><button class="btn-ghost" onclick="addCommentToCard('${card.id}')"><i class="fa-solid fa-keyboard"></i> إدخال يدوي احتياطي</button></div>
        </div>
      `;
    } else if (tabIdx === 7) {
      const qcs = (card.qcRecordIds || []).map(id => getQcRecordById(id)).filter(Boolean);
      body.innerHTML = `
        <div class="insp-section"><h4>فحوصات الجودة (${qcs.length})</h4>
          ${qcs.map(q => `<div class="insp-linked-item"><b>${q.type}</b><small>${q.result === 'pass' ? 'ناجح' : 'فاشل'} · ${q.date}</small>${q.result === 'fail' ? `<small class="text-danger">السبب: ${q.reason}</small>` : ''}</div>`).join('') || '<p>لا فحوصات مرتبطة</p>'}
          <div class="kanban-inline-linker kanban-qc-form">
            <input class="kanban-inline-control" id="kanbanQcType_${card.id}" placeholder="نوع الفحص / العنوان">
            <select class="kanban-inline-control" id="kanbanQcResult_${card.id}"><option value="pending">قيد الفحص</option><option value="pass">ناجح</option><option value="fail">فاشل</option></select>
            <input class="kanban-inline-control" id="kanbanQcReason_${card.id}" placeholder="ملاحظات أو سبب الفشل">
            <button class="btn-primary" onclick="createQcForCardInline('${card.id}')"><i class="fa-solid fa-plus"></i> إضافة فحص جودة</button>
          </div>
          <div style="margin-top:10px"><button class="btn-ghost" onclick="linkQcToCard('${card.id}')"><i class="fa-solid fa-keyboard"></i> إدخال يدوي احتياطي</button></div>
        </div>
      `;
    } else if (tabIdx === 8) {
      body.innerHTML = `
        <div class="insp-section">
          <h4>روابط وعلاقات</h4>
          ${renderEntityRelationsPanel('kanban_card', cardId)}
        </div>
      `;
    }
  }

  renderInspectorTab(0);
  window.renderKanbanInspectorTab = function(cid, idx) { renderInspectorTab(idx); };
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function renderKanbanInspectorV2(cardId, activeTab = 0) {
  openKanbanCardInspector(cardId);
  if (activeTab && typeof window.renderKanbanInspectorTab === 'function') {
    window.renderKanbanInspectorTab(cardId, activeTab);
  }
}

function moveKanbanCardToBestColumn(cardId, targetType) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return false;
  const columns = omni.kanban.columns || [];
  const matcher = targetType === 'done' ? kanbanColumnLooksDone : targetType === 'in_progress' ? kanbanColumnLooksActive : () => false;
  const target = columns.find(matcher);
  if (target) card.columnId = target.id;
  card.status = targetType === 'done' ? 'done' : targetType === 'in_progress' ? 'in_progress' : card.status || targetType;
  appendKanbanActivity(card, target ? `إجراء سريع: نقل إلى ${target.title}` : `إجراء سريع: تحديث الحالة إلى ${card.status}`);
  saveData();
  renderKanbanBoard();
  return true;
}

function startKanbanCard(cardId) {
  if (moveKanbanCardToBestColumn(cardId, 'in_progress')) showToast('تم بدء البطاقة', 'success');
}

async function completeKanbanCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const qcStatus = getCardQcStatus(card);
  if (!canCardMoveToDone(card)) {
    const reason = getQcRequirementReason('kanban_card', card);
    const result = await showOmniModal('QC مطلوب قبل الإنهاء', `
      <div class="qc-inspector">
        <p>لا يمكن إنهاء البطاقة قبل إكمال بوابة الجودة.</p>
        <div class="qc-record-card">
          <b>${escapeHtml(card.title || 'بطاقة')}</b>
          <small>${escapeHtml(reason)} · الحالة الحالية: ${escapeHtml(qcStatus.label)}</small>
        </div>
        <p class="muted">اضغط تأكيد لإنشاء فحص جودة مرتبط بهذه البطاقة. سيتم إبقاء البطاقة في مكانها.</p>
      </div>
    `, () => true);
    if (result) createQcRecordForCard(cardId, card.qcTemplateId || '');
    showToast('لا يمكن إكمال البطاقة قبل اجتياز QC', 'warning');
    return;
  }
  if (moveKanbanCardToBestColumn(cardId, 'done')) showToast('تم إنهاء البطاقة', 'success');
}

async function blockKanbanCard(cardId, reason) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  let finalReason = reason;
  if (!finalReason) {
    finalReason = await showOmniPrompt('سبب تعليق البطاقة:', '');
  }
  card.isBlocked = true;
  card.status = 'blocked';
  if (!Array.isArray(card.tags)) card.tags = [];
  if (!card.tags.some(t => String(t).toLowerCase().includes('blocked'))) card.tags.push('blocked');
  appendKanbanActivity(card, `تم تعليق البطاقة${finalReason ? ': ' + finalReason : ''}`);
  saveData();
  renderKanbanBoard();
  openKanbanCardInspector(cardId);
}

function unblockKanbanCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  card.isBlocked = false;
  if (card.status === 'blocked') card.status = '';
  card.tags = (card.tags || []).filter(t => !String(t).toLowerCase().includes('blocked') && !String(t).includes('متوقف'));
  appendKanbanActivity(card, 'تم إلغاء تعليق البطاقة');
  saveData();
  renderKanbanBoard();
  openKanbanCardInspector(cardId);
}

async function assignKanbanCardQuick(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const options = (employees || []).map(emp => `<option value="${escapeHtml(emp.id || emp.name)}">${escapeHtml(emp.name)}</option>`).join('');
  const html = `<label>المسؤول</label><select id="quickAssignee" class="form-input"><option value="">بدون مسؤول</option>${options}</select>`;
  const assigneeId = await showOmniModal('إسناد البطاقة', html, body => body.querySelector('#quickAssignee')?.value || '');
  if (assigneeId === false || assigneeId === null) return;
  setKanbanAssignee(cardId, assigneeId);
}

async function requestMaterialForKanbanCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const note = await showOmniPrompt('ملاحظة طلب المادة:', 'طلب مادة لهذه البطاقة');
  if (!note) return;
  if (!Array.isArray(card.comments)) card.comments = [];
  card.comments.push({ id: makeId('cmt'), text: note, author: 'Saif', createdAt: new Date().toISOString(), date: todayISO() });
  appendKanbanActivity(card, `طلب مادة: ${note}`);
  saveData();
  openKanbanCardInspector(cardId);
}

// ─── Kanban Linking Actions ───
function refreshKanbanInspector(cardId) {
  saveData();
  renderKanbanBoard();
  openKanbanCardInspector(cardId);
}

function appendKanbanActivity(card, text) {
  if (!Array.isArray(card.activityLog)) card.activityLog = [];
  card.activityLog.push({ date: todayISO(), text });
}

function setKanbanCardColor(cardId, color) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  card.color = KANBAN_CARD_COLORS.includes(color) ? color : 'default';
  card.accentColor = card.color;
  appendKanbanActivity(card, `تم تغيير لون البطاقة إلى ${card.color}`);
  refreshKanbanInspector(cardId);
}

function setKanbanCardCustomColor(cardId, color) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  card.customColor = normalizeKanbanHexColor(color, getKanbanCardAccentHex(card));
  card.color = 'custom';
  card.accentColor = 'custom';
  appendKanbanActivity(card, `تم تغيير اللون المخصص للبطاقة إلى ${card.customColor}`);
  refreshKanbanInspector(cardId);
}

function setKanbanDepartment(cardId, department) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  card.department = department || '';
  appendKanbanActivity(card, `تم تحديث القسم: ${card.department || 'بدون قسم'}`);
  refreshKanbanInspector(cardId);
}

function setKanbanOwner(cardId, owner) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  card.owner = owner || '';
  card.assigneeId = '';
  appendKanbanActivity(card, `تم تحديث المسؤول: ${card.owner || 'بدون مسؤول'}`);
  refreshKanbanInspector(cardId);
}

function setKanbanAssignee(cardId, assigneeId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const emp = (employees || []).find(e => String(e.id || e.name) === String(assigneeId));
  card.assigneeId = assigneeId || '';
  card.owner = emp?.name || '';
  appendKanbanActivity(card, `تم تعيين المسؤول: ${card.owner || 'بدون مسؤول'}`);
  refreshKanbanInspector(cardId);
}

function linkSopToCardDirect(cardId, sopId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  const sop = (omni.sops || []).find(s => s.id === sopId);
  if (!card || !sop) return showToast('اختر SOP صالحاً', 'warning');
  if (!Array.isArray(card.sopIds)) card.sopIds = [];
  if (card.sopIds.includes(sop.id)) return showToast('هذا SOP مرتبط مسبقاً', 'warning');
  card.sopIds.push(sop.id);
  appendKanbanActivity(card, `تم ربط SOP: ${sop.title}`);
  refreshKanbanInspector(cardId);
}

function linkMachineToCardDirect(cardId, machineId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  const machine = (omni.machines || []).find(m => m.id === machineId);
  if (!card || !machine) return showToast('اختر ماكينة صالحة', 'warning');
  if (!Array.isArray(card.machineIds)) card.machineIds = [];
  if (card.machineIds.includes(machine.id)) return showToast('هذه الماكينة مرتبطة مسبقاً', 'warning');
  card.machineIds.push(machine.id);
  appendKanbanActivity(card, `تم ربط ماكينة: ${machine.name}`);
  refreshKanbanInspector(cardId);
}

function linkMaterialToCardInline(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  const materialId = document.getElementById(`kanbanMaterialSelect_${cardId}`)?.value;
  const mat = (omni.materials || []).find(m => m.id === materialId);
  if (!card || !mat) return showToast('اختر مادة صالحة', 'warning');
  const quantity = parseFloat(document.getElementById(`kanbanMaterialQty_${cardId}`)?.value) || 1;
  const unit = document.getElementById(`kanbanMaterialUnit_${cardId}`)?.value || mat.unit || '';
  if (!Array.isArray(card.materialRequirements)) card.materialRequirements = [];
  const existing = card.materialRequirements.find(req => req.materialId === materialId);
  if (existing) {
    existing.quantity = quantity;
    existing.qty = quantity;
    existing.unit = unit;
    appendKanbanActivity(card, `تم تحديث مادة: ${mat.name} × ${quantity} ${unit}`);
  } else {
    card.materialRequirements.push({ materialId, quantity, qty: quantity, unit });
    appendKanbanActivity(card, `تم ربط مادة: ${mat.name} × ${quantity} ${unit}`);
  }
  refreshKanbanInspector(cardId);
}

function createQcForCardInline(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const type = document.getElementById(`kanbanQcType_${cardId}`)?.value?.trim();
  const result = document.getElementById(`kanbanQcResult_${cardId}`)?.value || 'pending';
  const reason = document.getElementById(`kanbanQcReason_${cardId}`)?.value?.trim() || '';
  if (!type) return showToast('اكتب عنوان فحص الجودة أولاً', 'warning');
  const qc = createQcRecordForCard(cardId, card.qcTemplateId || '', { title: type, result, failureReason: reason, reason });
  appendKanbanActivity(card, `فحص جودة: ${type} → ${result}`);
  if (result === 'pass') markQcPass(qc.id);
  if (result === 'fail') markQcFail(qc.id, reason || 'غير محدد', qc.severity || 'high');
  refreshKanbanInspector(cardId);
}

function addCommentToCardInline(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  const text = document.getElementById(`kanbanCommentText_${cardId}`)?.value?.trim();
  if (!card || !text) return showToast('اكتب التعليق أولاً', 'warning');
  if (!Array.isArray(card.comments)) card.comments = [];
  card.comments.push({ id: makeId('cmt'), text, author: 'Saif', createdAt: new Date().toISOString(), date: todayISO() });
  appendKanbanActivity(card, 'تمت إضافة تعليق جديد');
  refreshKanbanInspector(cardId);
}

async function editKanbanCardLinks(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const html = `
    <label>اسم العميل</label><input id="kanbanLinkClient" class="form-input" value="${escapeHtml(card.clientName || '')}">
    <label>رقم الطلب (Order ID)</label><input id="kanbanLinkOrder" class="form-input" value="${escapeHtml(card.orderId || '')}">
  `;
  const result = await showOmniModal('ربط البطاقة بالطلب', html, body => ({
    clientName: body.querySelector('#kanbanLinkClient')?.value?.trim() || '',
    orderId: body.querySelector('#kanbanLinkOrder')?.value?.trim() || ''
  }));
  if (!result) return;
  card.clientName = result.clientName;
  card.orderId = result.orderId;
  appendKanbanActivity(card, 'تم تحديث روابط العميل والطلب');
  saveData(); openKanbanCardInspector(cardId);
}

async function linkSopToCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const options = (omni.sops || []).map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.code || '')} ${escapeHtml(s.title || '')}</option>`).join('');
  const sopId = await showOmniModal('ربط SOP', `<select id="manualSopId" class="form-input"><option value="">اختر SOP</option>${options}</select>`, body => body.querySelector('#manualSopId')?.value || '');
  if (sopId) linkSopToCardDirect(cardId, sopId);
}

async function linkMachineToCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const options = (omni.machines || []).map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)} (${escapeHtml(m.status || '-')})</option>`).join('');
  const machineId = await showOmniModal('ربط ماكينة', `<select id="manualMachineId" class="form-input"><option value="">اختر ماكينة</option>${options}</select>`, body => body.querySelector('#manualMachineId')?.value || '');
  if (machineId) linkMachineToCardDirect(cardId, machineId);
}

async function linkMaterialToCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const options = (omni.materials || []).map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)} (${getMaterialAvailableQty(m)} ${escapeHtml(m.unit || '')})</option>`).join('');
  const html = `<select id="manualMaterialId" class="form-input"><option value="">اختر مادة</option>${options}</select><input id="manualMaterialQty" class="form-input" type="number" min="0" step="0.01" value="1" placeholder="الكمية">`;
  const result = await showOmniModal('ربط مادة', html, body => ({ materialId: body.querySelector('#manualMaterialId')?.value || '', quantity: parseFloat(body.querySelector('#manualMaterialQty')?.value) || 1 }));
  const mat = (omni.materials || []).find(m => m.id === result?.materialId);
  if (!mat) return showToast('اختر مادة صالحة', 'warning');
  if (!Array.isArray(card.materialRequirements)) card.materialRequirements = [];
  card.materialRequirements.push({ materialId: mat.id, quantity: result.quantity, qty: result.quantity, unit: mat.unit || '' });
  appendKanbanActivity(card, `تم ربط مادة: ${mat.name} × ${result.quantity}`);
  saveData(); openKanbanCardInspector(cardId);
}

async function linkQcToCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const html = `
    <input id="manualQcType" class="form-input" placeholder="نوع فحص الجودة">
    <select id="manualQcResult" class="form-input"><option value="pass">pass</option><option value="pending">pending</option><option value="fail">fail</option></select>
    <input id="manualQcReason" class="form-input" placeholder="سبب الفشل / ملاحظات">
    <input id="manualQcCost" class="form-input" type="number" min="0" value="0" placeholder="تكلفة إعادة العمل">
  `;
  const form = await showOmniModal('إضافة QC', html, body => ({
    type: body.querySelector('#manualQcType')?.value?.trim() || '',
    result: body.querySelector('#manualQcResult')?.value || 'pass',
    reason: body.querySelector('#manualQcReason')?.value?.trim() || '',
    cost: parseInt(body.querySelector('#manualQcCost')?.value || '0', 10) || 0
  }));
  if (!form?.type) return;
  const { type, result, reason, cost } = form;
  const qc = { id: makeId('qc'), taskRef: cardId, type, result, reason, assignee: 'الجودة', date: todayISO(), reworkCost: cost, sopViolation: '' };
  if (!Array.isArray(omni.qcRecords)) omni.qcRecords = [];
  if (!Array.isArray(card.qcRecordIds)) card.qcRecordIds = [];
  omni.qcRecords.push(qc);
  card.qcRecordIds.push(qc.id);
  appendKanbanActivity(card, `فحص جودة: ${type} → ${result}`);
  saveData(); openKanbanCardInspector(cardId);
}

async function addCostToCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const html = `<input id="costDesc" class="form-input" placeholder="وصف الكلفة"><input id="costAmount" class="form-input" type="number" min="0" value="0" placeholder="المبلغ IQD">`;
  const result = await showOmniModal('إضافة كلفة', html, body => ({ desc: body.querySelector('#costDesc')?.value?.trim() || '', amount: parseInt(body.querySelector('#costAmount')?.value || '0', 10) || 0 }));
  if (!result?.desc) return;
  if (!Array.isArray(card.costEntries)) card.costEntries = [];
  const { desc, amount } = result;
  card.costEntries.push({ id: makeId('cost'), description: desc, amount, date: todayISO() });
  appendKanbanActivity(card, `كلفة مضافة: ${desc} — ${amount.toLocaleString()} IQD`);
  saveData(); openKanbanCardInspector(cardId);
}

async function addCommentToCard(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const text = await showOmniPrompt('التعليق:', '');
  if (!text) return;
  if (!Array.isArray(card.comments)) card.comments = [];
  card.comments.push({ id: makeId('cmt'), text, author: 'Saif', date: todayISO() });
  saveData(); openKanbanCardInspector(cardId);
}

function toggleKanbanChecklist(cardId, idx) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card || !card.checklist || !card.checklist[idx]) return;
  card.checklist[idx].done = !card.checklist[idx].done;
  saveData();
}

async function addKanbanChecklistItem(cardId) {
  ensureOmni();
  const card = omni.kanban.cards.find(c => c.id === cardId);
  if (!card) return;
  const text = await showOmniPrompt('بند جديد:', '');
  if (!text) return;
  if (!card.checklist) card.checklist = [];
  card.checklist.push({ text, done: false });
  saveData(); openKanbanCardInspector(cardId);
}
