/*
 * OCTAGON OMNISYSTEM - modules/analytics-dashboard.js
 *
 * T4.3 (Phase 4 de-monolith): Analytics Intelligence Brain cluster moved
 * verbatim out of app.js (move != improve). Loaded AFTER app.js so references
 * to app helpers (ensureOmni, escapeHtml, getMaterialAvailableQty, etc.) resolve.
 */

// ═══════════ ANALYTICS INTELLIGENCE BRAIN ═══════════
let currentAnalyticsTab = 'overview';
let analyticsFilters = { range: 'all', from: '', to: '', department: 'all', employee: 'all', machine: 'all' };
let analyticsViewMode = localStorage.getItem('analytics_view_mode_v1') || 'detailed';

function setAnalyticsTab(tab) { currentAnalyticsTab = tab; renderAnalytics(); }
function updateAnalyticsFilters(patch) { Object.assign(analyticsFilters, patch); renderAnalytics(); }
function getAnalyticsViewMode() { return analyticsViewMode || 'detailed'; }
function setAnalyticsViewMode(mode) {
  analyticsViewMode = ['compact', 'detailed', 'bigscreen'].includes(mode) ? mode : 'detailed';
  localStorage.setItem('analytics_view_mode_v1', analyticsViewMode);
  renderAnalytics();
}

function getAnalyticsDateRange(range, from, to) {
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'today') return { start: today, end: now };
  if (range === '7d') return { start: new Date(today - 7*864e5), end: now };
  if (range === '30d') return { start: new Date(today - 30*864e5), end: now };
  if (range === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  if (range === 'custom' && from) return { start: new Date(from), end: to ? new Date(to) : now };
  return { start: new Date('2020-01-01'), end: now };
}

function isDateInRange(dateVal, dr) {
  if (!dateVal) return analyticsFilters.range === 'all';
  const d = new Date(dateVal); return d >= dr.start && d <= dr.end;
}

function getAllOperationalCards() { ensureOmni(); return omni.kanban.cards || []; }
function getAllOperationalTasks() {
  ensureOmni(); const r = [];
  (omni.taskManager.spaces || []).forEach(sp => (sp.departments || []).forEach(dep => (dep.sections || []).forEach(sec => (sec.taskTypes || []).forEach(tt => (tt.tasks || []).forEach(t => r.push(t))))));
  return r;
}
function getCardDept(c) { return c.department || c.section || c.branch || 'عام'; }
function getCardOwner(c) { return c.owner || c.assignedTo || ''; }
function getCardAge(c) { if (!c.createdAt) return 0; return Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 864e5); }
function getOverdueDays(c) { if (!c.dueDate) return 0; const d = Math.floor((Date.now() - new Date(c.dueDate).getTime()) / 864e5); return d > 0 ? d : 0; }
function isCardDone(c) { const col = (omni.kanban.columns||[]).find(cl => cl.id === c.columnId); return col && (col.title.includes('مكتمل') || col.title.toLowerCase().includes('done')); }
function getCardCostTotal(c) { return (c.costEntries || []).reduce((s, e) => s + (e.amount || 0), 0); }

function calculateDepartmentWorkload() {
  const cards = getAllOperationalCards(); const dr = getAnalyticsDateRange(analyticsFilters.range, analyticsFilters.from, analyticsFilters.to);
  const depts = {};
  cards.forEach(c => {
    if (!isDateInRange(c.createdAt, dr) && analyticsFilters.range !== 'all') return;
    const dep = getCardDept(c); if (!depts[dep]) depts[dep] = { name: dep, open: 0, done: 0, overdue: 0, high: 0, blocked: 0, minutes: 0, totalDelay: 0 };
    const d = depts[dep]; const done = isCardDone(c);
    if (done) { d.done++; } else { d.open++; }
    if (!done && c.dueDate && getOverdueDays(c) > 0) { d.overdue++; d.totalDelay += getOverdueDays(c); }
    if (c.priority === 'High' || c.priority === 'Urgent') d.high++;
    if (c.isBlocked) d.blocked++;
    d.minutes += (c.estimatedMinutes || 0);
  });
  return Object.values(depts).map(d => {
    d.score = Math.min(100, d.open * 10 + d.overdue * 20 + d.high * 10 + d.blocked * 25 + (d.minutes / 60) * 2);
    d.status = d.score < 30 ? 'طبيعي' : d.score < 60 ? 'مشغول' : d.score < 80 ? 'مزدحم' : 'خطر';
    d.statusColor = d.score < 30 ? '#34d399' : d.score < 60 ? '#fbbf24' : d.score < 80 ? '#f97316' : '#f87171';
    d.avgDelay = d.overdue > 0 ? (d.totalDelay / d.overdue).toFixed(1) : 0;
    return d;
  }).sort((a, b) => b.score - a.score);
}

function calculateEmployeeWorkload() {
  const cards = getAllOperationalCards(); const dr = getAnalyticsDateRange(analyticsFilters.range, analyticsFilters.from, analyticsFilters.to);
  const emps = {};
  cards.forEach(c => {
    if (!isDateInRange(c.createdAt, dr) && analyticsFilters.range !== 'all') return;
    const owner = getCardOwner(c); if (!owner) return;
    if (!emps[owner]) emps[owner] = { name: owner, open: 0, done: 0, overdue: 0, urgent: 0, minutes: 0, checklistDone: 0, checklistTotal: 0 };
    const e = emps[owner]; const done = isCardDone(c);
    if (done) e.done++; else e.open++;
    if (!done && getOverdueDays(c) > 0) e.overdue++;
    if (c.priority === 'Urgent') e.urgent++;
    e.minutes += (c.estimatedMinutes || 0);
    (c.checklist || []).forEach(cl => { e.checklistTotal++; if (cl.done) e.checklistDone++; });
  });
  return Object.values(emps).map(e => {
    e.score = Math.min(100, e.open * 12 + e.overdue * 25 + e.urgent * 15 + (e.minutes / 60) * 3);
    e.status = e.score < 20 ? 'متاح' : e.score < 50 ? 'طبيعي' : e.score < 80 ? 'مضغوط' : 'مزدحم جداً';
    e.statusColor = e.score < 20 ? '#34d399' : e.score < 50 ? '#38bdf8' : e.score < 80 ? '#fbbf24' : '#f87171';
    e.clPct = e.checklistTotal > 0 ? Math.round(e.checklistDone / e.checklistTotal * 100) : 0;
    return e;
  }).sort((a, b) => b.score - a.score);
}

function calculateMachineLoad() {
  ensureOmni(); const machines = omni.machines || []; const cards = getAllOperationalCards();
  return machines.map(m => {
    const qLen = (m.queue || []).length; const qMins = (m.queue || []).reduce((s, q) => s + (q.estimatedMinutes || 0), 0);
    const linked = cards.filter(c => (c.machineIds || []).includes(m.id) && !isCardDone(c)).length;
    const score = Math.min(100, qLen * 15 + linked * 10 + (qMins / 60) * 5 + (m.status === 'maintenance' ? 30 : 0));
    return { id: m.id, name: m.name, status: m.status, queueLen: qLen, queueMins: qMins, linkedCards: linked,
      score, pressureStatus: score < 25 ? 'متاح' : score < 50 ? 'عادي' : score < 75 ? 'مزدحم' : 'ضغط حرج',
      pressureColor: score < 25 ? '#34d399' : score < 50 ? '#38bdf8' : score < 75 ? '#fbbf24' : '#f87171' };
  }).sort((a, b) => b.score - a.score);
}

function calculateTaskDelay() {
  const cards = getAllOperationalCards(); const dr = getAnalyticsDateRange(analyticsFilters.range, analyticsFilters.from, analyticsFilters.to);
  const overdue = []; const stuck = []; const noDate = []; const noOwner = [];
  cards.forEach(c => {
    if (isCardDone(c)) return;
    if (!isDateInRange(c.createdAt, dr) && analyticsFilters.range !== 'all') return;
    if (c.dueDate && getOverdueDays(c) > 0) overdue.push({ ...c, delayDays: getOverdueDays(c) });
    if (getCardAge(c) > 7 && !isCardDone(c)) stuck.push({ ...c, ageDays: getCardAge(c) });
    if (!c.dueDate) noDate.push(c);
    if (!getCardOwner(c)) noOwner.push(c);
  });
  overdue.sort((a, b) => b.delayDays - a.delayDays);
  stuck.sort((a, b) => b.ageDays - a.ageDays);
  return { overdue, stuck: stuck.slice(0, 10), noDate: noDate.length, noOwner: noOwner.length, total: cards.filter(c => !isCardDone(c)).length };
}

function calculateMaterialRisk() {
  ensureOmni(); const mats = omni.materials || []; const cards = getAllOperationalCards();
  return mats.map(m => {
    const avail = getMaterialAvailableQty(m); const reserved = getMaterialReservedQty ? getMaterialReservedQty(m) : (m.reservedQty || 0);
    let demand = 0;
    cards.forEach(c => { if (isCardDone(c)) return; (c.materialRequirements || []).forEach(mr => { if (mr.materialId === m.id) demand += (mr.qty || 0); }); });
    const shortage = Math.max(0, demand - avail);
    const riskScore = Math.min(100, (avail <= (m.minimum || 0) ? 40 : 0) + (shortage > 0 ? 30 : 0) + (reserved > m.stock * 0.5 ? 20 : 0) + (demand > avail ? 10 : 0));
    return { id: m.id, name: m.name, stock: m.stock, reserved, avail, demand, shortage, unit: m.unit || '', minimum: m.minimum || 0,
      riskScore, riskStatus: riskScore < 20 ? 'آمن' : riskScore < 50 ? 'مراقبة' : riskScore < 75 ? 'تحذير' : 'حرج',
      riskColor: riskScore < 20 ? '#34d399' : riskScore < 50 ? '#38bdf8' : riskScore < 75 ? '#fbbf24' : '#f87171' };
  }).sort((a, b) => b.riskScore - a.riskScore);
}

function calculateQcSopIntel() {
  ensureOmni(); const qc = omni.qcRecords || []; const sops = omni.sops || [];
  const total = qc.length; const pass = qc.filter(q => q.result === 'pass').length; const fail = qc.filter(q => q.result === 'fail').length;
  const passRate = total > 0 ? Math.round(pass / total * 100) : 100;
  const failReasons = {}; qc.filter(q => q.result === 'fail').forEach(q => { const r = q.reason || q.notes || 'غير محدد'; failReasons[r] = (failReasons[r] || 0) + 1; });
  const topReasons = Object.entries(failReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sopProblems = []; const unapproved = sops.filter(s => s.approvalStatus !== 'approved');
  sops.forEach(s => { const linked = qc.filter(q => q.result === 'fail' && q.sopId === s.id).length; if (linked >= 2) sopProblems.push({ sop: s, failCount: linked }); });
  return { total, pass, fail, passRate, topReasons, sopProblems, unapproved, reworkCount: qc.filter(q => q.reworkCreated).length };
}

function calculateCostIntel() {
  const cards = getAllOperationalCards();
  const byDept = {}; const byTag = {}; let totalCost = 0; let reworkCost = 0;
  cards.forEach(c => {
    const cost = getCardCostTotal(c); if (cost <= 0) return;
    totalCost += cost; const dep = getCardDept(c);
    byDept[dep] = (byDept[dep] || 0) + cost;
    (c.tags || []).forEach(t => { byTag[t] = (byTag[t] || 0) + cost; });
    if (c.isRework) reworkCost += cost;
  });
  return { totalCost, reworkCost, byDept: Object.entries(byDept).sort((a, b) => b[1] - a[1]), byTag: Object.entries(byTag).sort((a, b) => b[1] - a[1]) };
}

function generatePredictiveAlerts() {
  ensureOmni(); const alerts = []; const cards = getAllOperationalCards(); const today = todayISO();
  cards.forEach(c => {
    if (isCardDone(c)) return;
    if (c.dueDate) {
      const daysLeft = Math.floor((new Date(c.dueDate) - Date.now()) / 864e5);
      const clPct = (c.checklist || []).length > 0 ? (c.checklist.filter(x => x.done).length / c.checklist.length * 100) : 100;
      if (daysLeft <= 1 && daysLeft >= 0 && clPct < 50) alerts.push({ severity: 'حرج', title: c.title, reason: `موعد التسليم خلال ${daysLeft} يوم والقائمة ${Math.round(clPct)}% فقط`, action: 'kanban', color: '#f87171' });
    }
    (c.materialRequirements || []).forEach(mr => {
      const mat = (omni.materials || []).find(m => m.id === mr.materialId);
      if (mat && getMaterialAvailableQty(mat) < (mr.qty || 0)) alerts.push({ severity: 'عالي', title: c.title, reason: `يحتاج ${mat.name} لكن المتوفر غير كافي`, action: 'inventory', color: '#fbbf24' });
    });
    (c.machineIds || []).forEach(mid => {
      const mac = (omni.machines || []).find(m => m.id === mid);
      if (mac && mac.status === 'maintenance') alerts.push({ severity: 'عالي', title: c.title, reason: `الماكينة ${mac.name} في الصيانة`, action: 'machines', color: '#fbbf24' });
    });
  });
  return alerts.slice(0, 15);
}

function generateSmartRecommendations() {
  const recs = []; const depts = calculateDepartmentWorkload(); const emps = calculateEmployeeWorkload();
  const mats = calculateMaterialRisk(); const machLoad = calculateMachineLoad(); const qcIntel = calculateQcSopIntel();
  depts.filter(d => d.score > 70).forEach(d => recs.push({ title: `قسم ${d.name} مزدحم`, reason: `${d.open} مهمة مفتوحة و${d.overdue} متأخرة`, severity: 'عالي', action: 'kanban', color: '#f87171' }));
  emps.filter(e => e.score > 75).forEach(e => recs.push({ title: `${e.name} تحت ضغط عالي`, reason: `${e.open} مهمة و${e.overdue} متأخرة`, severity: 'عالي', action: 'kanban', color: '#fbbf24' }));
  const avail = emps.filter(e => e.score < 20);
  if (avail.length > 0 && emps.some(e => e.score > 70)) recs.push({ title: 'إعادة توزيع ممكنة', reason: `${avail.map(e => e.name).join('، ')} لديهم حمل خفيف ويمكن تحويل مهام إليهم`, severity: 'متوسط', action: 'kanban', color: '#38bdf8' });
  mats.filter(m => m.riskScore > 60).forEach(m => recs.push({ title: `المادة ${m.name} في خطر`, reason: `المتوفر ${m.avail} ${m.unit} والمطلوب ${m.demand} ${m.unit}`, severity: 'عالي', action: 'inventory', color: '#f87171' }));
  machLoad.filter(m => m.score > 70).forEach(m => recs.push({ title: `الماكينة ${m.name} مزدحمة`, reason: `${m.queueLen} في الطابور و${m.linkedCards} بطاقة مرتبطة`, severity: 'عالي', action: 'machines', color: '#fbbf24' }));
  qcIntel.sopProblems.forEach(sp => recs.push({ title: `SOP ${sp.sop.title} يسبب مشاكل`, reason: `مرتبط بـ ${sp.failCount} فشل جودة`, severity: 'عالي', action: 'sop', color: '#f87171' }));
  if (qcIntel.unapproved.length > 3) recs.push({ title: `${qcIntel.unapproved.length} SOP غير معتمد`, reason: 'راجع واعتمد الإجراءات قبل الاستخدام في أعمال حساسة', severity: 'متوسط', action: 'sop', color: '#fbbf24' });
  return recs.slice(0, 12);
}

function calculateHealthScore() {
  const cards = getAllOperationalCards(); const openCards = cards.filter(c => !isCardDone(c));
  const overdueCount = openCards.filter(c => c.dueDate && getOverdueDays(c) > 0).length;
  const blockedCount = openCards.filter(c => c.isBlocked).length;
  const matRisk = calculateMaterialRisk().filter(m => m.riskScore > 50).length;
  const machDown = (omni.machines || []).filter(m => m.status === 'maintenance' || m.status === 'offline').length;
  const qc = calculateQcSopIntel();
  let score = 100;
  score -= overdueCount * 5; score -= blockedCount * 8; score -= matRisk * 6; score -= machDown * 7;
  score -= (100 - qc.passRate) * 0.5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildOperationalCompletionSnapshot() {
  const modules = [
    { key: 'command_center', label: 'مركز القيادة', percent: 95, status: 'near', page: 'command_center' },
    { key: 'kanban', label: 'اللوحة التنفيذية', percent: 98, status: 'near', page: 'kanban' },
    { key: 'workflow', label: 'مصمم سير العمل', percent: 82, status: 'todo', page: 'workflow' },
    { key: 'op_packs', label: 'باقات العمليات', percent: 100, status: 'done', page: 'op_packs' },
    { key: 'task_manager', label: 'إدارة المهام', percent: 100, status: 'done', page: 'task_manager' },
    { key: 'machines', label: 'لوحة المكائن', percent: 100, status: 'done', page: 'machines' },
    { key: 'inventory', label: 'المخزون والمواد', percent: 100, status: 'done', page: 'inventory' },
    { key: 'qc_center', label: 'مركز الجودة', percent: 100, status: 'done', page: 'qc_center' },
    { key: 'employee_ui', label: 'لوحة الموظف', percent: 100, status: 'done', page: 'employee_ui' },
    { key: 'sop', label: 'مكتبة الإجراءات', percent: 96, status: 'near', page: 'sop' },
    { key: 'analytics', label: 'التحليلات والذكاء', percent: 98, status: 'near', page: 'analytics' },
    { key: 'intelligence', label: 'لوحة الذكاء التشغيلي', percent: 80, status: 'todo', page: 'intelligence' },
    { key: 'automation', label: 'محرك الأتمتة', percent: 100, status: 'done', page: 'automation' },
    { key: 'whatsapp', label: 'استيراد واتساب', percent: 75, status: 'todo', page: 'whatsapp' },
    { key: 'admin_panel', label: 'لوحة الإعدادات', percent: 85, status: 'todo', page: 'admin_panel', note: 'مؤجل' }
  ];
  const average = Math.round(modules.reduce((sum, item) => sum + item.percent, 0) / Math.max(1, modules.length));
  const doneCount = modules.filter(item => item.percent >= 100).length;
  const nearCount = modules.filter(item => item.percent >= 90 && item.percent < 100).length;
  const openCount = modules.filter(item => item.percent < 90).length;
  const next = modules.filter(item => item.percent < 100).sort((a, b) => a.percent - b.percent)[0];
  return { modules, average, doneCount, nearCount, openCount, next };
}

function renderOperationalCompletionSnapshot() {
  const snapshot = buildOperationalCompletionSnapshot();
  const nextLabel = snapshot.next ? `${snapshot.next.label} ${snapshot.next.percent}%` : 'كل الأقسام مكتملة';
  return `<section class="analytics-completion-section">
    <div class="analytics-completion-summary">
      <div>
        <h2>لقطة الإنجاز التشغيلي</h2>
        <p>عرض تقدم المشروع في الوقت الفعلي — قراءة فقط ويعكس نقطة التطوير الحالية.</p>
      </div>
      <div class="analytics-completion-score">
        <strong>${snapshot.average}%</strong>
        <span>متوسط الأقسام المفتوحة</span>
      </div>
    </div>
    <div class="analytics-completion-kpis">
      <div><b>${snapshot.doneCount}</b><span>قسم مكتمل</span></div>
      <div><b>${snapshot.nearCount}</b><span>قريب من الإغلاق</span></div>
      <div><b>${snapshot.openCount}</b><span>قيد البناء</span></div>
      <div><b>${escapeHtml(nextLabel)}</b><span>أقل قسم حالياً</span></div>
    </div>
    <div class="analytics-completion-grid">
      ${snapshot.modules.map(item => `<button class="analytics-completion-row ${item.status}" onclick="switchPage('${item.page}')">
        <span class="analytics-completion-name">${escapeHtml(item.label)}${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}</span>
        <span class="analytics-completion-meter"><i style="width:${item.percent}%"></i></span>
        <b>${item.percent}%</b>
      </button>`).join('')}
    </div>
  </section>`;
}

function generateDailySnapshot() {
  ensureOmni();
  if (!omni.snapshots) omni.snapshots = [];
  const cards = omni.kanban.cards || []; const machines = omni.machines || []; const materials = omni.materials || [];
  omni.snapshots.push({ date: todayISO(), totalTasks: cards.length,
    doneTasks: cards.filter(c => isCardDone(c)).length,
    totalMachineHours: machines.reduce((s, m) => s + (Number(m.hoursTotal) || 0), 0),
    totalInventoryValue: materials.reduce((s, m) => s + (m.stock * (m.unitCost || 0)), 0),
    healthScore: calculateHealthScore()
  });
  saveData();
  showOmniModal('لقطة التحليلات اليومية', `<div class="analytics-print-preview-card"><b>تم إنشاء لقطة قابلة للمشاركة</b><p>صحة التشغيل ${calculateHealthScore()}% · المهام ${cards.length} · المكتمل ${cards.filter(c => isCardDone(c)).length}</p><button class="btn-primary" onclick="printAnalyticsSnapshot()"><i class="fa-solid fa-print"></i> فتح نسخة A4</button></div>`, () => true);
  showToast('تم أخذ لقطة إحصائية بنجاح!', 'success');
}

function printAnalyticsSnapshot() {
  const w = window.open('', '_blank');
  const health = calculateHealthScore(); const depts = calculateDepartmentWorkload(); const emps = calculateEmployeeWorkload();
  const machLoad = calculateMachineLoad(); const matRisk = calculateMaterialRisk(); const qcIntel = calculateQcSopIntel();
  const recs = generateSmartRecommendations();
  const healthTone = getAnalyticsTone(health);
  w.document.write(`<html dir="rtl"><head><title>تقرير التحليلات</title><meta charset="UTF-8"><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Tajawal,Arial,sans-serif;direction:rtl;margin:0;color:#0f172a;background:#f8fafc}.sheet{min-height:270mm;padding:18px}.hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:20px;border-radius:18px;background:linear-gradient(135deg,#0f172a,#075985);color:#fff}.hero h1{margin:0 0 8px;font-size:26px}.hero p{margin:0;color:#bae6fd}.score{width:120px;height:120px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);border:8px solid ${healthTone.color};font-size:30px;font-weight:900}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.kpis div,.panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px;box-shadow:0 8px 22px rgba(15,23,42,.06)}.kpis b{display:block;font-size:22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}h2{font-size:15px;margin:0 0 10px;color:#075985}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px;border-bottom:1px solid #e2e8f0;text-align:right}th{color:#0369a1;background:#f0f9ff}.rec{border-right:4px solid #0ea5e9;margin:6px 0;padding:7px 9px;background:#f8fafc;border-radius:9px;font-size:11px}@media print{body{background:#fff}.sheet{padding:0}.panel,.kpis div{box-shadow:none}}</style></head><body><main class="sheet">`);
  w.document.write(`<section class="hero"><div><h1>تقرير التحليلات والذكاء التشغيلي</h1><p>${new Date().toLocaleDateString('ar-IQ')} · ${getAnalyticsDateRangeLabel()}</p></div><div class="score">${health}%</div></section>`);
  w.document.write(`<section class="kpis"><div><b>${depts.length}</b><span>أقسام نشطة</span></div><div><b>${emps.length}</b><span>موظفون ضمن اللوحة</span></div><div><b>${machLoad.filter(m=>m.score>70).length}</b><span>مكائن تحت ضغط</span></div><div><b>${qcIntel.passRate}%</b><span>نسبة الجودة</span></div></section>`);
  w.document.write(`<section class="grid"><div class="panel"><h2>ضغط الأقسام</h2><table><tr><th>القسم</th><th>مفتوحة</th><th>متأخرة</th><th>الحالة</th></tr>${depts.slice(0,8).map(d => `<tr><td>${escapeHtml(d.name)}</td><td>${d.open}</td><td>${d.overdue}</td><td>${escapeHtml(d.status)}</td></tr>`).join('')}</table></div>`);
  w.document.write(`<div class="panel"><h2>ضغط الموظفين</h2><table><tr><th>الموظف</th><th>مفتوحة</th><th>متأخرة</th><th>الحالة</th></tr>${emps.slice(0,8).map(e => `<tr><td>${escapeHtml(e.name)}</td><td>${e.open}</td><td>${e.overdue}</td><td>${escapeHtml(e.status)}</td></tr>`).join('')}</table></div>`);
  w.document.write(`<div class="panel"><h2>مخاطر المواد</h2><table><tr><th>المادة</th><th>متوفر</th><th>مطلوب</th><th>الخطر</th></tr>${matRisk.slice(0,8).map(m => `<tr><td>${escapeHtml(m.name)}</td><td>${m.avail}</td><td>${m.demand}</td><td>${escapeHtml(m.riskStatus)}</td></tr>`).join('')}</table></div>`);
  w.document.write(`<div class="panel"><h2>التوصيات</h2>${recs.slice(0,8).map(r => `<div class="rec"><b>${escapeHtml(r.title)}</b><br>${escapeHtml(r.reason)}</div>`).join('') || '<p>لا توجد توصيات حرجة حالياً.</p>'}</div></section></main></body></html>`);
  w.document.close(); w.print();
}

function getAnalyticsBarSeverity(value, thresholds = { warning: 50, critical: 75 }) {
  if (value >= thresholds.critical) return 'critical';
  if (value >= thresholds.warning) return 'warning';
  return 'good';
}

function getAnalyticsTone(value, good = 80, warn = 60) {
  if (value >= good) return { name: 'good', color: '#34d399', label: 'مستقر' };
  if (value >= warn) return { name: 'warning', color: '#fbbf24', label: 'تحت المتابعة' };
  return { name: 'critical', color: '#f87171', label: 'حرج' };
}

function analyticsFormatNumber(value) {
  if (typeof value === 'string') return value;
  const n = Number(value) || 0;
  return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString('en-US');
}

function getAnalyticsDateRangeLabel() {
  const labels = { all: 'كل البيانات', today: 'اليوم', '7d': 'آخر 7 أيام', '30d': 'آخر 30 يوم', month: 'هذا الشهر', custom: 'نطاق مخصص' };
  const dr = getAnalyticsDateRange(analyticsFilters.range, analyticsFilters.from, analyticsFilters.to);
  const fmt = d => d ? new Date(d).toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }) : '';
  return `${labels[analyticsFilters.range] || labels.all} · ${fmt(dr.start)} - ${fmt(dr.end)}`;
}

function renderAnalyticsSparkline(seed = 1, color = '#38bdf8') {
  const points = Array.from({ length: 30 }, (_, i) => {
    const wave = Math.sin((i + seed) / 3) * 12;
    const drift = ((i * 7 + seed * 11) % 19) - 9;
    const y = Math.max(8, Math.min(42, 26 - wave - drift * 0.45));
    return `${Math.round(i * 3.45)},${Math.round(y)}`;
  }).join(' ');
  return `<svg class="analytics-sparkline" viewBox="0 0 100 50" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="0,48 ${points} 100,48" fill="${color}" opacity="0.12"/></svg>`;
}

function renderAnalyticsKpiCard({ label, value, icon, color, tone = 'good', delta = '+0%', trendSeed = 1 }) {
  return `<div class="analytics-kpi analytics-kpi-${tone}" style="--analytics-kpi-color:${color}"><div class="analytics-kpi-head"><i class="fa-solid ${icon}"></i><span>${escapeHtml(label)}</span></div><div class="analytics-kpi-val">${analyticsFormatNumber(value)}</div><div class="analytics-kpi-foot"><span class="${String(delta).startsWith('-') ? 'down' : 'up'}">${escapeHtml(delta)} vs السابق</span></div>${renderAnalyticsSparkline(trendSeed, color)}</div>`;
}

function renderAnalyticsSvgBars(rows, options = {}) {
  const valueKey = options.valueKey || 'count';
  const percentKey = options.percentKey || 'percent';
  const max = Math.max(1, ...rows.map(r => Number(r[percentKey] ?? r[valueKey] ?? 0)));
  return rows.length ? rows.map((row, idx) => {
    const raw = Number(row[percentKey] ?? row[valueKey] ?? 0);
    const pct = Math.max(2, Math.min(100, percentKey in row ? raw : Math.round(Number(row[valueKey] || 0) / max * 100)));
    const severity = row.severity || getAnalyticsBarSeverity(pct);
    const label = row.label || row.name || '-';
    const shown = row[valueKey] ?? row.count ?? row.open ?? 0;
    const c1 = severity === 'critical' ? '#fb7185' : severity === 'warning' ? '#fbbf24' : '#38bdf8';
    const c2 = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#fb923c' : '#22d3ee';
    return `<div class="analytics-svg-bar-row analytics-bar-${severity}" title="${escapeHtml(label)} · ${escapeHtml(shown)} · ${pct}%"><div class="analytics-bar-label"><span>${escapeHtml(label)}</span>${row.status ? `<small class="analytics-bar-status">${escapeHtml(row.status)}</small>` : ''}</div><svg class="analytics-svg-bar" viewBox="0 0 220 24" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="analyticsBarGrad${idx}${severity}" x1="0%" x2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect x="0" y="4" width="220" height="16" rx="8" fill="rgba(148,163,184,.14)"></rect><rect x="0" y="4" width="${Math.round(220 * pct / 100)}" height="16" rx="8" fill="url(#analyticsBarGrad${idx}${severity})"></rect></svg><div class="analytics-bar-count">${analyticsFormatNumber(shown)}</div></div>`;
  }).join('') : `<div class="analytics-snapshot-empty">${escapeHtml(options.empty || 'لا توجد بيانات كافية')}</div>`;
}

function renderAnalyticsDonut(title, rows, valueKey, labelKey = 'name') {
  const total = rows.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0);
  if (!rows.length || total <= 0) return `<section class="analytics-donut-panel"><h3>${escapeHtml(title)}</h3><div class="analytics-snapshot-empty">لا توجد بيانات كافية</div></section>`;
  const colors = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#22d3ee', '#f97316'];
  let offset = 25;
  const circles = rows.slice(0, 7).map((row, idx) => { const pct = Number(row[valueKey] || 0) / total * 100; const circle = `<circle cx="60" cy="60" r="42" fill="none" stroke="${colors[idx % colors.length]}" stroke-width="16" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${offset}" pathLength="100"/>`; offset -= pct; return circle; }).join('');
  return `<section class="analytics-donut-panel"><h3>${escapeHtml(title)}</h3><div class="analytics-donut-wrap"><svg class="analytics-donut" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(148,163,184,.14)" stroke-width="16"/>${circles}<text x="60" y="58" text-anchor="middle">${analyticsFormatNumber(total)}</text><text x="60" y="75" text-anchor="middle">إجمالي</text></svg><div class="analytics-donut-legend">${rows.slice(0, 7).map((row, idx) => `<span><i style="background:${colors[idx % colors.length]}"></i>${escapeHtml(row[labelKey] || row.label || '-')} <b>${analyticsFormatNumber(row[valueKey])}</b></span>`).join('')}</div></div></section>`;
}

function renderAnalyticsStackedCost(costIntel) {
  const rows = costIntel.byDept.length ? costIntel.byDept : costIntel.byTag;
  const total = Math.max(1, rows.reduce((sum, [, value]) => sum + Number(value || 0), 0));
  const colors = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#f97316'];
  let x = 0;
  return `<section class="analytics-cost-stack"><h3><i class="fa-solid fa-chart-simple"></i> توزيع الكلفة</h3><svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">${rows.slice(0, 6).map(([name, value], idx) => { const width = Math.max(2, Number(value || 0) / total * 100); const rect = `<rect x="${x}" y="2" width="${width}" height="14" rx="3" fill="${colors[idx % colors.length]}"><title>${escapeHtml(name)} · ${analyticsFormatNumber(value)}</title></rect>`; x += width; return rect; }).join('')}</svg><div class="analytics-cost-legend">${rows.slice(0, 6).map(([name, value], idx) => `<span><i style="background:${colors[idx % colors.length]}"></i>${escapeHtml(name)} <b>${analyticsFormatNumber(value)}</b></span>`).join('') || '<span>لا توجد كلفة مسجلة</span>'}</div></section>`;
}

const _pageKeyAr = {kanban:'اللوحة التنفيذية',analytics:'التحليلات',qc_center:'مركز الجودة',machines:'المكائن',inventory:'المخزون',sop:'الإجراءات',op_packs:'باقات العمليات',command_center:'مركز القيادة',employees:'الموظفون',finance:'المالية',task_manager:'إدارة المهام',workflow:'سير العمل',mrp:'تخطيط الإنتاج',customers:'العملاء',admin_panel:'لوحة الإعدادات'};
function renderAnalyticsRecommendationCard(item) {
  const severity = String(item.severity || '').includes('حرج') || String(item.severity || '').includes('عالي') ? 'critical' : String(item.severity || '').includes('متوسط') ? 'warning' : 'good';
  const actionLabel = _pageKeyAr[item.action] || item.action || 'النظام';
  return `<div class="analytics-rec-card analytics-rec-${severity}" style="--rec-color:${item.color || '#38bdf8'}"><div class="analytics-rec-source"><span>${escapeHtml(item.severity || 'متابعة')}</span><em>${escapeHtml(actionLabel)}</em></div><div class="analytics-rec-title">${escapeHtml(item.title)}</div><div class="analytics-rec-reason">${escapeHtml(item.reason)}</div><div class="analytics-rec-actions"><button class="btn-primary" onclick="switchPage('${jsString(item.action || 'analytics')}')"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح المصدر</button><button class="btn-secondary" onclick="showOmniModal('تفاصيل التوصية','<p>${jsString(escapeHtml(item.reason || ''))}</p>',()=>true)">تفاصيل</button></div></div>`;
}

function renderAnalyticsAlertCard(item) {
  const critical = String(item.severity || '').includes('حرج');
  return `<div class="analytics-alert-card ${critical ? 'critical' : ''}" style="--alert-color:${item.color || '#fbbf24'}"><div class="analytics-alert-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><span class="analytics-risk-badge" style="background:${item.color || '#fbbf24'}">${escapeHtml(item.severity || 'تنبيه')}</span><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.reason)}</p></div><button class="btn-secondary" onclick="switchPage('${jsString(item.action || 'analytics')}')">عرض</button></div>`;
}

function calculateAnalyticsTaskDistribution(filters = analyticsFilters) {
  ensureOmni();
  const cards = getAllOperationalCards();
  const tasks = getAllOperationalTasks();
  const total = Math.max(1, cards.length + tasks.length);
  const byColumn = {};
  (omni.kanban.columns || []).forEach(col => { byColumn[col.id] = { label: col.title || col.name || col.id, count: 0 }; });
  cards.forEach(card => {
    if (filters.range !== 'all' && !isDateInRange(card.createdAt, getAnalyticsDateRange(filters.range, filters.from, filters.to))) return;
    const col = byColumn[card.columnId] || (byColumn[card.columnId || 'none'] = { label: 'غير مصنف', count: 0 });
    col.count += 1;
  });
  const taskStatusCounts = {};
  tasks.forEach(task => {
    const status = normalizeTaskStatus ? normalizeTaskStatus(task.status) : String(task.status || 'todo');
    taskStatusCounts[status] = (taskStatusCounts[status] || 0) + 1;
  });
  const rows = Object.entries(byColumn).map(([key, row]) => ({ key, label: row.label, count: row.count, percent: Math.round(row.count / total * 100), severity: getAnalyticsBarSeverity(row.count / total * 100, { warning: 35, critical: 55 }) }));
  const statusLabels = { todo: 'مهام داخلية مطلوبة', in_progress: 'مهام داخلية قيد التنفيذ', review: 'مهام داخلية مراجعة', done: 'مهام داخلية مكتملة', blocked: 'مهام داخلية متوقفة' };
  Object.entries(taskStatusCounts).forEach(([key, count]) => rows.push({ key: `task_${key}`, label: statusLabels[key] || key, count, percent: Math.round(count / total * 100), severity: key === 'blocked' ? 'critical' : key === 'done' ? 'good' : getAnalyticsBarSeverity(count / total * 100, { warning: 35, critical: 55 }) }));
  const overdue = cards.filter(c => !isCardDone(c) && c.dueDate && getOverdueDays(c) > 0).length + tasks.filter(taskManagerTaskIsOverdue).length;
  const blocked = cards.filter(c => c.isBlocked || String(c.status || '').includes('blocked')).length + (taskStatusCounts.blocked || 0);
  rows.push({ key: 'overdue', label: 'متأخر', count: overdue, percent: Math.min(100, Math.round(overdue / total * 100)), severity: overdue ? 'critical' : 'good' });
  rows.push({ key: 'blocked', label: 'محظور / متوقف', count: blocked, percent: Math.min(100, Math.round(blocked / total * 100)), severity: blocked ? 'critical' : 'good' });
  return rows.filter(r => r.count > 0 || ['overdue', 'blocked'].includes(r.key)).sort((a, b) => b.count - a.count).slice(0, 9);
}

function calculateAnalyticsMachineBars(filters = analyticsFilters) {
  ensureOmni();
  const cards = getAllOperationalCards();
  return (omni.machines || []).map(machine => {
    const queueLength = getMachineQueueCount(machine);
    const linkedCards = cards.filter(card => !isCardDone(card) && (card.machineIds || []).includes(machine.id)).length;
    const opPackLinks = (omni.opPacks || []).reduce((sum, pack) => sum + (pack.steps || []).filter(step => step.machineId === machine.id || step.linkedMachineId === machine.id).length, 0);
    let pressure = Math.min(100, queueLength * 18 + linkedCards * 14 + opPackLinks * 6);
    if (['maintenance', 'offline'].includes(machine.status)) pressure = 100;
    const status = machine.status === 'maintenance' ? 'صيانة' : machine.status === 'offline' ? 'متوقف' : pressure >= 80 ? 'مزدحم' : pressure >= 55 ? 'مشغول' : pressure >= 25 ? 'طبيعي' : 'متاح';
    return { machineId: machine.id, name: machine.name, linkedCards, queueLength, pressure, status, severity: getAnalyticsBarSeverity(pressure, { warning: 55, critical: 80 }) };
  }).sort((a, b) => b.pressure - a.pressure).slice(0, 8);
}

function calculateAnalyticsEmployeeBars(filters = analyticsFilters) {
  ensureOmni();
  const cards = getAllOperationalCards();
  const tasks = getAllOperationalTasks();
  const rows = {};
  const touch = (key, name, patch) => {
    const safeKey = key || name || 'غير مخصص';
    rows[safeKey] ||= { employeeId: safeKey === 'غير مخصص' ? '' : safeKey, name: name || safeKey, openTasks: 0, completedTasks: 0, overdueTasks: 0, workloadScore: 0 };
    Object.assign(rows[safeKey], patch(rows[safeKey]));
  };
  cards.forEach(card => {
    const key = card.assigneeId || card.employeeId || card.owner || card.assignedTo || 'غير مخصص';
    const done = isCardDone(card);
    touch(key, card.owner || card.assignedTo || key, row => ({ openTasks: row.openTasks + (done ? 0 : 1), completedTasks: row.completedTasks + (done ? 1 : 0), overdueTasks: row.overdueTasks + (!done && card.dueDate && getOverdueDays(card) > 0 ? 1 : 0) }));
  });
  tasks.forEach(task => {
    const key = task.assigneeId || task.employeeId || task.owner || task.assignedTo || 'غير مخصص';
    const done = normalizeTaskStatus ? normalizeTaskStatus(task.status) === 'done' : String(task.status).toLowerCase() === 'done';
    touch(key, task.owner || task.assignedTo || key, row => ({ openTasks: row.openTasks + (done ? 0 : 1), completedTasks: row.completedTasks + (done ? 1 : 0), overdueTasks: row.overdueTasks + (taskManagerTaskIsOverdue(task) ? 1 : 0) }));
  });
  Object.values(rows).forEach(row => {
    row.workloadScore = Math.min(100, row.openTasks * 12 + row.overdueTasks * 18);
    row.status = row.openTasks === 0 ? 'بدون مهام' : row.workloadScore >= 80 ? 'مزدحم' : row.workloadScore >= 55 ? 'مضغوط' : row.workloadScore >= 25 ? 'طبيعي' : 'متاح';
    row.severity = getAnalyticsBarSeverity(row.workloadScore, { warning: 55, critical: 80 });
  });
  return Object.values(rows).sort((a, b) => b.workloadScore - a.workloadScore).slice(0, 8);
}

function calculateAnalyticsDepartmentBars(filters = analyticsFilters) {
  const buckets = {};
  const add = (name, item) => {
    const key = name || 'غير مصنف';
    buckets[key] ||= { name: key, open: 0, overdue: 0, urgent: 0, workloadScore: 0 };
    buckets[key].open += item.open || 0;
    buckets[key].overdue += item.overdue || 0;
    buckets[key].urgent += item.urgent || 0;
  };
  getAllOperationalCards().forEach(card => {
    const done = isCardDone(card);
    add(card.department || card.section || card.branch || card.owner || 'غير مصنف', { open: done ? 0 : 1, overdue: !done && card.dueDate && getOverdueDays(card) > 0 ? 1 : 0, urgent: ['urgent', 'high'].includes(String(card.priority || '').toLowerCase()) ? 1 : 0 });
  });
  getAllOperationalTasks().forEach(task => {
    const done = normalizeTaskStatus ? normalizeTaskStatus(task.status) === 'done' : String(task.status).toLowerCase() === 'done';
    add(task.department || task.section || task.owner || 'غير مصنف', { open: done ? 0 : 1, overdue: taskManagerTaskIsOverdue(task) ? 1 : 0, urgent: ['urgent', 'high'].includes(String(task.priority || '').toLowerCase()) ? 1 : 0 });
  });
  Object.values(buckets).forEach(row => {
    row.workloadScore = Math.min(100, row.open * 10 + row.overdue * 18 + row.urgent * 12);
    row.status = row.workloadScore >= 80 ? 'مزدحم' : row.workloadScore >= 55 ? 'مشغول' : row.workloadScore >= 25 ? 'طبيعي' : 'متاح';
    row.severity = getAnalyticsBarSeverity(row.workloadScore, { warning: 55, critical: 80 });
  });
  return Object.values(buckets).sort((a, b) => b.workloadScore - a.workloadScore).slice(0, 8);
}

function renderAnalyticsBarPanel(title, rows, options = {}) {
  const valueKey = options.valueKey || 'count';
  const percentKey = options.percentKey || 'percent';
  const empty = options.empty || 'لا توجد بيانات كافية';
  const max = Math.max(1, ...rows.map(r => Number(r[percentKey] ?? r[valueKey] ?? 0)));
  return `<section class="analytics-bar-panel">
    <h3 class="analytics-bar-panel-title">${title}</h3>
    ${rows.length ? rows.map(row => {
      const raw = Number(row[percentKey] ?? row[valueKey] ?? 0);
      const pct = percentKey in row ? raw : Math.round(Number(row[valueKey] || 0) / max * 100);
      const severity = row.severity || getAnalyticsBarSeverity(pct);
      return `<div class="analytics-bar-row analytics-bar-${severity}">
        <div class="analytics-bar-label"><span>${escapeHtml(row.label || row.name)}</span>${row.status ? `<small class="analytics-bar-status">${escapeHtml(row.status)}</small>` : ''}</div>
        <div class="analytics-bar-track"><span class="analytics-bar-fill" style="width:${Math.max(3, Math.min(100, pct))}%"></span></div>
        <div class="analytics-bar-count">${row[valueKey] ?? row.count ?? row.open ?? 0}</div>
      </div>`;
    }).join('') : `<div class="analytics-snapshot-empty">${empty}</div>`}
  </section>`;
}

function renderAnalyticsSnapshotBars() {
  const taskRows = calculateAnalyticsTaskDistribution(analyticsFilters);
  const machineRows = calculateAnalyticsMachineBars(analyticsFilters).map(r => ({ ...r, label: r.name, count: r.queueLength + r.linkedCards, percent: r.pressure }));
  const employeeRows = calculateAnalyticsEmployeeBars(analyticsFilters).map(r => ({ ...r, label: r.name, count: r.openTasks, percent: r.workloadScore }));
  const departmentRows = calculateAnalyticsDepartmentBars(analyticsFilters).map(r => ({ ...r, label: r.name, count: r.open, percent: r.workloadScore }));
  return `<div class="analytics-snapshot-section">
    <div class="analytics-snapshot-header"><h2>لقطة تشغيلية مباشرة</h2><p>قراءة بصرية سريعة: وين المهام، شكد ضغط المكائن، منو مضغوط، وأي قسم يحتاج متابعة.</p></div>
    <div class="analytics-snapshot-bars">
      ${renderAnalyticsBarPanel('توزيع المهام', taskRows, { empty: 'لا توجد مهام كافية لعرض توزيع واضح' })}
      ${renderAnalyticsBarPanel('ضغط المكائن', machineRows, { empty: 'لا توجد مكائن مرتبطة بالعمل الحالي' })}
      ${renderAnalyticsBarPanel('أداء الموظفين', employeeRows, { empty: 'لا توجد مهام مخصصة للموظفين بعد' })}
      ${renderAnalyticsBarPanel('ضغط الأقسام', departmentRows, { empty: 'لا توجد أقسام مصنفة بعد' })}
    </div>
  </div>`;
}

function renderAnalyticsV2() {
  ensureOmni();
  const el = document.getElementById('analyticsBody');
  if (!el) return;
  const health = calculateHealthScore();
  const cards = getAllOperationalCards();
  const openCards = cards.filter(c => !isCardDone(c));
  const overdueCards = openCards.filter(c => c.dueDate && getOverdueDays(c) > 0);
  const qcI = calculateQcSopIntel();
  const matRisks = calculateMaterialRisk().filter(m => m.riskScore > 50);
  const machLoad = calculateMachineLoad();
  const machDown = (omni.machines || []).filter(m => m.status === 'maintenance' || m.status === 'offline');
  const deptW = calculateDepartmentWorkload();
  const empW = calculateEmployeeWorkload();
  const healthTone = getAnalyticsTone(health);
  const tabs = [
    ['overview','fa-eye','نظرة عامة'], ['departments','fa-building','الأقسام'], ['employees','fa-users','الموظفون'],
    ['machines','fa-gears','المكائن'], ['delays','fa-clock','التأخير'], ['materials','fa-boxes-stacked','المواد'],
    ['qcsop','fa-microscope','QC/SOP'], ['cost','fa-coins','الكلفة'], ['predictions','fa-wand-magic-sparkles','التوقعات']
  ];
  const filterHtml = `<div class="analytics-filter-bar analytics-filter-bar-v2">
    <div class="analytics-range-control"><span><i class="fa-solid fa-calendar-days"></i> النطاق</span><select class="form-input" onchange="updateAnalyticsFilters({range:this.value})">
      <option value="all" ${analyticsFilters.range==='all'?'selected':''}>كل البيانات</option><option value="today" ${analyticsFilters.range==='today'?'selected':''}>اليوم</option><option value="7d" ${analyticsFilters.range==='7d'?'selected':''}>آخر 7 أيام</option><option value="30d" ${analyticsFilters.range==='30d'?'selected':''}>آخر 30 يوم</option><option value="month" ${analyticsFilters.range==='month'?'selected':''}>هذا الشهر</option>
    </select></div>
    <span class="analytics-date-chip"><i class="fa-solid fa-clock"></i> ${escapeHtml(getAnalyticsDateRangeLabel())}</span>
    <div class="analytics-view-toggle"><button class="${getAnalyticsViewMode()==='compact'?'active':''}" onclick="setAnalyticsViewMode('compact')"><i class="fa-solid fa-table-cells-large"></i> مختصر</button><button class="${getAnalyticsViewMode()==='detailed'?'active':''}" onclick="setAnalyticsViewMode('detailed')"><i class="fa-solid fa-chart-line"></i> تفصيلي</button><button class="${getAnalyticsViewMode()==='bigscreen'?'active':''}" onclick="setAnalyticsViewMode('bigscreen')"><i class="fa-solid fa-tv"></i> شاشة كبيرة</button></div>
    <div class="analytics-filter-actions"><button class="btn-primary" onclick="generateDailySnapshot()"><i class="fa-solid fa-camera"></i> لقطة</button><button class="btn-secondary" onclick="printAnalyticsSnapshot()"><i class="fa-solid fa-print"></i> A4</button></div>
  </div>`;
  const kpiHtml = `<div class="analytics-kpi-grid analytics-kpi-grid-v2">
    ${renderAnalyticsKpiCard({ label:'صحة التشغيل', value:`${health}%`, icon:'fa-heart-pulse', color:healthTone.color, tone:healthTone.name, delta:health >= 80 ? '+4%' : '-6%', trendSeed:health })}
    ${renderAnalyticsKpiCard({ label:'أقسام نشطة', value:deptW.length, icon:'fa-building', color:deptW[0]?.statusColor || '#34d399', tone:deptW[0]?.score > 70 ? 'critical' : 'good', delta:'+2%', trendSeed:deptW.length + 7 })}
    ${renderAnalyticsKpiCard({ label:'مهام مفتوحة', value:openCards.length, icon:'fa-list-check', color:'#38bdf8', tone:openCards.length > 20 ? 'warning' : 'good', delta:openCards.length ? '+8%' : '0%', trendSeed:openCards.length + 11 })}
    ${renderAnalyticsKpiCard({ label:'متأخرة', value:overdueCards.length, icon:'fa-clock', color:overdueCards.length ? '#f87171' : '#34d399', tone:overdueCards.length ? 'critical' : 'good', delta:overdueCards.length ? '+12%' : '-3%', trendSeed:overdueCards.length + 17 })}
    ${renderAnalyticsKpiCard({ label:'مكائن متوقفة', value:machDown.length, icon:'fa-gears', color:machDown.length ? '#fbbf24' : '#34d399', tone:machDown.length ? 'warning' : 'good', delta:machDown.length ? '+1' : '0%', trendSeed:machDown.length + 23 })}
    ${renderAnalyticsKpiCard({ label:'مواد في خطر', value:matRisks.length, icon:'fa-box-open', color:matRisks.length ? '#fbbf24' : '#34d399', tone:matRisks.length ? 'warning' : 'good', delta:matRisks.length ? '+5%' : '-2%', trendSeed:matRisks.length + 29 })}
    ${renderAnalyticsKpiCard({ label:'نسبة الجودة', value:`${qcI.passRate}%`, icon:'fa-microscope', color:qcI.passRate >= 80 ? '#34d399' : '#f87171', tone:qcI.passRate >= 80 ? 'good' : 'critical', delta:qcI.passRate >= 80 ? '+3%' : '-9%', trendSeed:qcI.passRate })}
    ${renderAnalyticsKpiCard({ label:'موظفون مضغوطون', value:empW.filter(e=>e.score>70).length, icon:'fa-user-clock', color:'#a78bfa', tone:empW.some(e=>e.score>80) ? 'warning' : 'good', delta:'+1%', trendSeed:empW.length + 31 })}
  </div>`;
  const tabsHtml = `<div class="analytics-tabs-bar">${tabs.map(([id, icon, label]) => `<button class="analytics-tab ${currentAnalyticsTab===id?'active':''}" onclick="setAnalyticsTab('${id}')"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`).join('')}</div>`;
  let sectionHtml = '';
  if (currentAnalyticsTab === 'overview') {
    const recs = generateSmartRecommendations(); const alerts = generatePredictiveAlerts();
    sectionHtml = `<div class="analytics-overview-grid"><section class="analytics-section"><h3 class="analytics-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i> توصيات ذكية تشغيلية</h3>${recs.length ? `<div class="analytics-recs-grid">${recs.map(renderAnalyticsRecommendationCard).join('')}</div>` : '<div class="analytics-snapshot-empty">لا توجد توصيات حالياً. اللوحة مستقرة.</div>'}</section><section class="analytics-section"><h3 class="analytics-section-title"><i class="fa-solid fa-triangle-exclamation"></i> تنبيهات توقعية</h3>${alerts.length ? `<div class="analytics-alert-list">${alerts.map(renderAnalyticsAlertCard).join('')}</div>` : '<div class="analytics-snapshot-empty">لا توجد تنبيهات توقعية حرجة.</div>'}</section></div>`;
  } else if (currentAnalyticsTab === 'departments') {
    sectionHtml = `<div class="analytics-chart-grid">${renderAnalyticsDonut('توزيع ضغط الأقسام', deptW, 'open')}${renderAnalyticsBarPanel('أعلى الأقسام ضغطاً', deptW.map(d => ({ ...d, label:d.name, count:d.open, percent:d.score, severity:getAnalyticsBarSeverity(d.score, { warning:55, critical:80 }) })))}</div><div class="analytics-table-wrap"><table class="analytics-mini-table"><thead><tr><th>القسم</th><th>المفتوحة</th><th>المكتملة</th><th>المتأخرة</th><th>أولوية</th><th>الحالة</th></tr></thead><tbody>${deptW.map(d => `<tr><td><b>${escapeHtml(d.name)}</b></td><td>${d.open}</td><td>${d.done}</td><td>${d.overdue}</td><td>${d.high}</td><td><span class="analytics-risk-badge" style="background:${d.statusColor}">${escapeHtml(d.status)}</span></td></tr>`).join('')}</tbody></table></div>`;
  } else if (currentAnalyticsTab === 'employees') {
    sectionHtml = `<div class="analytics-chart-grid">${renderAnalyticsDonut('توزيع حمل الموظفين', empW, 'open')}${renderAnalyticsBarPanel('أعلى الموظفين ضغطاً', empW.map(e => ({ ...e, label:e.name, count:e.open, percent:e.score, severity:getAnalyticsBarSeverity(e.score, { warning:55, critical:80 }) })))}</div><div class="analytics-table-wrap"><table class="analytics-mini-table"><thead><tr><th>الموظف</th><th>مفتوحة</th><th>مكتملة</th><th>متأخرة</th><th>عاجلة</th><th>إنجاز</th><th>الحالة</th></tr></thead><tbody>${empW.map(e => `<tr><td><b>${escapeHtml(e.name)}</b></td><td>${e.open}</td><td>${e.done}</td><td>${e.overdue}</td><td>${e.urgent}</td><td>${e.clPct}%</td><td><span class="analytics-risk-badge" style="background:${e.statusColor}">${escapeHtml(e.status)}</span></td></tr>`).join('')}</tbody></table></div>`;
  } else if (currentAnalyticsTab === 'machines') {
    sectionHtml = `<div class="analytics-chart-grid">${renderAnalyticsDonut('توزيع ضغط المكائن', machLoad, 'linkedCards')}${renderAnalyticsBarPanel('ضغط المكائن', machLoad.map(m => ({ ...m, label:m.name, count:m.queueLen + m.linkedCards, percent:m.score, severity:getAnalyticsBarSeverity(m.score, { warning:55, critical:80 }) })))}</div><div class="analytics-table-wrap"><table class="analytics-mini-table"><thead><tr><th>الماكينة</th><th>الحالة</th><th>الطابور</th><th>دقائق منتظرة</th><th>بطاقات</th><th>التقييم</th></tr></thead><tbody>${machLoad.map(m => `<tr><td><b>${escapeHtml(m.name)}</b></td><td>${escapeHtml({operational:'تعمل',maintenance:'صيانة',idle:'متوقفة',available:'متاحة'}[m.status]||m.status)}</td><td>${m.queueLen}</td><td>${m.queueMins}</td><td>${m.linkedCards}</td><td><span class="analytics-risk-badge" style="background:${m.pressureColor}">${escapeHtml(m.pressureStatus)}</span></td></tr>`).join('')}</tbody></table></div>`;
  } else if (currentAnalyticsTab === 'delays') {
    const delay = calculateTaskDelay();
    sectionHtml = `<div class="analytics-kpi-grid analytics-sub-kpis">${renderAnalyticsKpiCard({ label:'مهام مفتوحة', value:delay.total, icon:'fa-list', color:'#38bdf8', tone:'good', delta:'+0%', trendSeed:3 })}${renderAnalyticsKpiCard({ label:'متأخرة', value:delay.overdue.length, icon:'fa-clock', color:delay.overdue.length ? '#f87171' : '#34d399', tone:delay.overdue.length ? 'critical' : 'good', delta:delay.overdue.length ? '+10%' : '-4%', trendSeed:8 })}${renderAnalyticsKpiCard({ label:'عالقة +7 أيام', value:delay.stuck.length, icon:'fa-hourglass-half', color:'#fbbf24', tone:delay.stuck.length ? 'warning' : 'good', delta:'+2%', trendSeed:12 })}</div><div class="analytics-table-wrap"><table class="analytics-mini-table"><thead><tr><th>المهمة</th><th>أيام التأخير</th><th>القسم</th><th>المسؤول</th></tr></thead><tbody>${delay.overdue.slice(0,10).map(c => `<tr><td>${escapeHtml(c.title)}</td><td style="color:#f87171">${c.delayDays} يوم</td><td>${escapeHtml(getCardDept(c))}</td><td>${escapeHtml(getCardOwner(c)||'-')}</td></tr>`).join('') || '<tr><td colspan="4">لا توجد مهام متأخرة.</td></tr>'}</tbody></table></div>`;
  } else if (currentAnalyticsTab === 'materials') {
    const matR = calculateMaterialRisk();
    sectionHtml = `${renderAnalyticsBarPanel('مخاطر المواد', matR.map(m => ({ ...m, label:m.name, count:m.shortage || m.demand || m.avail, percent:m.riskScore, severity:getAnalyticsBarSeverity(m.riskScore, { warning:50, critical:75 }), status:m.riskStatus })))}<div class="analytics-table-wrap"><table class="analytics-mini-table"><thead><tr><th>المادة</th><th>المخزون</th><th>محجوز</th><th>متوفر</th><th>مطلوب</th><th>نقص</th><th>الخطورة</th></tr></thead><tbody>${matR.map(m => `<tr><td><b>${escapeHtml(m.name)}</b></td><td>${m.stock} ${escapeHtml(m.unit)}</td><td>${m.reserved}</td><td>${m.avail}</td><td>${m.demand}</td><td>${m.shortage}</td><td><span class="analytics-risk-badge" style="background:${m.riskColor}">${escapeHtml(m.riskStatus)}</span></td></tr>`).join('')}</tbody></table></div>`;
  } else if (currentAnalyticsTab === 'qcsop') {
    const qi = calculateQcSopIntel();
    sectionHtml = `<div class="analytics-chart-grid">${renderAnalyticsDonut('نتائج الجودة', [{ name:'ناجح', value:qi.pass }, { name:'فاشل', value:qi.fail }], 'value')}${renderAnalyticsBarPanel('أسباب فشل QC', qi.topReasons.map(([label, count]) => ({ label, count, percent:Math.min(100, count / Math.max(1, qi.fail) * 100), severity:'critical' })), { empty:'لا توجد أسباب فشل مسجلة' })}</div><div class="analytics-recs-grid">${qi.sopProblems.map(sp => renderAnalyticsRecommendationCard({ title:`SOP ${sp.sop.title} يحتاج مراجعة`, reason:`مرتبط بـ ${sp.failCount} فشل جودة`, severity:'عالي', action:'sop', color:'#f87171' })).join('') || '<div class="analytics-snapshot-empty">لا توجد مشاكل SOP متكررة.</div>'}</div>`;
  } else if (currentAnalyticsTab === 'cost') {
    const ci = calculateCostIntel();
    sectionHtml = `<div class="analytics-kpi-grid analytics-sub-kpis">${renderAnalyticsKpiCard({ label:'إجمالي الكلفة', value:ci.totalCost, icon:'fa-coins', color:'#38bdf8', tone:'good', delta:'+6%', trendSeed:44 })}${renderAnalyticsKpiCard({ label:'إعادة العمل', value:ci.reworkCost, icon:'fa-rotate-left', color:ci.reworkCost ? '#f87171' : '#34d399', tone:ci.reworkCost ? 'critical' : 'good', delta:ci.reworkCost ? '+3%' : '0%', trendSeed:48 })}</div>${renderAnalyticsStackedCost(ci)}<div class="analytics-chart-grid">${renderAnalyticsBarPanel('الكلفة حسب القسم', ci.byDept.map(([label, count]) => ({ label, count, percent:Math.min(100, count / Math.max(1, ci.totalCost) * 100), severity:getAnalyticsBarSeverity(count / Math.max(1, ci.totalCost) * 100, { warning:35, critical:55 }) })), { empty:'لا توجد كلفة حسب القسم' })}${renderAnalyticsBarPanel('الكلفة حسب نوع العمل', ci.byTag.map(([label, count]) => ({ label, count, percent:Math.min(100, count / Math.max(1, ci.totalCost) * 100), severity:'good' })), { empty:'لا توجد كلفة حسب الوسوم' })}</div>`;
  } else if (currentAnalyticsTab === 'predictions') {
    const alerts = generatePredictiveAlerts(); const recs = generateSmartRecommendations();
    sectionHtml = `<section class="analytics-section"><h3 class="analytics-section-title"><i class="fa-solid fa-radar"></i> تنبيهات توقعية</h3>${alerts.length ? `<div class="analytics-alert-list">${alerts.map(renderAnalyticsAlertCard).join('')}</div>` : '<div class="analytics-snapshot-empty">لا توجد تحذيرات حالياً.</div>'}</section><section class="analytics-section"><h3 class="analytics-section-title"><i class="fa-solid fa-lightbulb"></i> إجراءات مقترحة</h3><div class="analytics-recs-grid">${recs.map(renderAnalyticsRecommendationCard).join('') || '<div class="analytics-snapshot-empty">لا توجد توصيات جديدة.</div>'}</div></section>`;
  }
  const mode = getAnalyticsViewMode();
  el.className = mode === 'bigscreen' ? 'analytics-bigscreen-mode' : mode === 'compact' ? 'analytics-compact-mode' : 'analytics-dashboard-mode';
  const analyticsContentHtml = mode === 'compact'
    ? filterHtml + kpiHtml + renderAnalyticsSnapshotBars()
    : filterHtml + renderOperationalCompletionSnapshot() + renderAnalyticsSnapshotBars() + kpiHtml + tabsHtml + `<div class="analytics-tab-content">${sectionHtml}</div>`;
  el.innerHTML = analyticsContentHtml;
}

function renderAnalytics() {
  return renderAnalyticsV2();
}


