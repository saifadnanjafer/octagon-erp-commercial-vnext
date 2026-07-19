/*
 * OCTAGON OMNISYSTEM - modules/command-center.js
 *
 * T4.2 (Phase 4 de-monolith): the Command Center cluster, moved VERBATIM out of
 * app.js (move != improve). Classic-script top-level functions -> stay window
 * globals exactly as before; loaded AFTER app.js so runtime references to app.js
 * helpers (getCashBalance, getAllTaskManagerTasks, omni, escapeHtml, ...) resolve.
 * One original contiguous app.js block (getCommandCenterGreeting ..
 * renderCommandCenter).
 */

function getCommandCenterGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'مساء الخير';
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء الخير';
}

function renderCommandCenterSparkline(values, color) {
  const arr = (values || []).filter(v => typeof v === 'number' && !isNaN(v));
  if (arr.length < 2) return '';
  const W = 70, H = 22, P = 2;
  const min = Math.min(...arr), max = Math.max(...arr);
  const span = max - min || 1;
  const points = arr.map((v, i) => {
    const x = P + (i / (arr.length - 1)) * (W - 2 * P);
    const y = H - P - ((v - min) / span) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = arr[arr.length - 1], first = arr[0];
  const dir = last > first ? 'up' : last < first ? 'down' : 'flat';
  const c = color || (dir === 'up' ? '#34d399' : dir === 'down' ? '#f87171' : '#94a3b8');
  return `<svg class="cc-spark cc-spark-${dir}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline></svg>`;
}

function renderCommandCenterHealthGauge(score) {
  const v = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const angle = (v / 100) * 180;
  const rad = (angle - 90) * Math.PI / 180;
  const cx = 70, r = 56;
  const x = cx + r * Math.cos(rad);
  const y = 70 + r * Math.sin(rad);
  const large = angle > 180 ? 1 : 0;
  const color = v >= 80 ? '#34d399' : v >= 60 ? '#facc15' : v >= 40 ? '#fb923c' : '#f87171';
  const label = v >= 80 ? 'صحة ممتازة' : v >= 60 ? 'صحة جيدة' : v >= 40 ? 'تحتاج متابعة' : 'حرجة';
  return `<div class="cc-gauge-wrap">
    <svg class="cc-gauge-svg" viewBox="0 0 140 90">
      <path d="M 14 70 A 56 56 0 0 1 126 70" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="10" stroke-linecap="round"></path>
      <path d="M 14 70 A 56 56 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${color}66)"></path>
    </svg>
    <div class="cc-gauge-val" dir="ltr" style="color:${color}"><bdi>${v}</bdi><small>%</small></div>
    <div class="cc-gauge-label">${label}</div>
  </div>`;
}

function calculateCommandCenterHealthScore(state) {
  let score = 100;
  score -= Math.min(25, (state.overdueCards || 0) * 3);
  score -= Math.min(15, (state.blockedCards || 0) * 2);
  score -= Math.min(20, (state.machinesDown || 0) * 8);
  score -= Math.min(15, (state.lowStock || 0) * 2);
  score -= Math.min(15, (state.qcFails || 0) * 3);
  score -= Math.min(10, (state.pendingSops || 0) * 1);
  return Math.max(0, Math.round(score));
}

function renderCommandCenter() {
  ensureOmni();
  syncActiveOrgContextStrip('pageCommandCenter', 'commandCenterOrgContextStrip');
  const el = document.getElementById('commandCenterBody');
  if (!el) return;

  const totalCards = (omni.kanban.cards || []).length;
  const blockedCards = (omni.kanban.cards || []).filter(c => (c.tags || []).some(t => String(t).toLowerCase().includes('blocked') || String(t).includes('متوقف')));
  const urgentCards = (omni.kanban.cards || []).filter(c => String(c.priority).toLowerCase().includes('urgent'));
  const overdueCards = (omni.kanban.cards || []).filter(c => c.dueDate && c.dueDate < todayISO());
  const machinesDown = (omni.machines || []).filter(m => m.status === 'maintenance');
  const machinesUp = (omni.machines || []).filter(m => m.status === 'operational');
  const lowStock = (omni.materials || []).filter(m => getMaterialAvailableQty(m) <= m.minimum);
  const qcFails = (omni.qcRecords || []).filter(q => q.result === 'fail');
  const allTasks = [];
  (omni.taskManager?.spaces || []).forEach(sp => (sp.departments || []).forEach(dep => (dep.sections || []).forEach(sec => (sec.taskTypes || []).forEach(tt => (tt.tasks || []).forEach(t => allTasks.push(t))))));
  const openTasks = allTasks.filter(t => t.status !== 'Done' && t.status !== 'مكتمل');
  const pendingSops = (omni.sops || []).filter(s => (s.approvalStatus || s.status || 'draft') !== 'approved');
  const opPackWarnings = (omni.opPacks || []).filter(pack => (pack.steps || []).some(step => (step.materialRequirements || []).some(req => {
    const mat = getMaterialById(req.materialId);
    return mat && getMaterialAvailableQty(mat) < getMaterialRequirementQty(req);
  })));
  const queuePressure = (omni.machines || []).filter(m => getMachineQueueCount(m) > 3);
  const totalQueue = (omni.machines || []).reduce((s, m) => s + getMachineQueueCount(m), 0);

  const healthScore = calculateCommandCenterHealthScore({
    overdueCards: overdueCards.length, blockedCards: blockedCards.length,
    machinesDown: machinesDown.length, lowStock: lowStock.length,
    qcFails: qcFails.length, pendingSops: pendingSops.length
  });

  const ccSuggestions = [
    ...overdueCards.slice(0, 3).map(card => ({ severity: 'danger', source: 'من اللوحة التنفيذية', icon: 'fa-triangle-exclamation', title: `متابعة بطاقة متأخرة: ${card.title}`, reason: `موعد التسليم ${card.dueDate || '-'} ويحتاج قرار أولوية.`, page: 'kanban', action: 'فتح اللوحة' })),
    ...blockedCards.slice(0, 2).map(card => ({ severity: 'warning', source: 'من اللوحة التنفيذية', icon: 'fa-ban', title: `إزالة التعطيل: ${card.title}`, reason: 'البطاقة في وضع متوقف وتحتاج تدخلاً.', page: 'kanban', action: 'فتح اللوحة' })),
    ...machinesDown.slice(0, 2).map(machine => ({ severity: 'danger', source: 'من المكائن', icon: 'fa-wrench', title: `بديل تشغيل للماكينة: ${machine.name}`, reason: 'الماكينة في الصيانة، راجع توزيع الأعمال على ماكينة متاحة.', page: 'machines', action: 'فتح المكائن' })),
    ...lowStock.slice(0, 3).map(mat => ({ severity: 'warning', source: 'من المخزون', icon: 'fa-box-open', title: `مراجعة شراء/حجز: ${mat.name}`, reason: `المتاح ${getMaterialAvailableQty(mat)} ${mat.unit || ''} أقل أو يساوي الحد الأدنى ${mat.minimum || 0}.`, page: 'inventory', action: 'فتح المخزون' })),
    ...(typeof getQcCommandCenterAlerts === 'function' ? getQcCommandCenterAlerts().slice(0, 4) : []),
    ...qcFails.slice(0, 2).map(qc => ({ severity: 'danger', source: 'من الجودة', icon: 'fa-microscope', title: `إعادة عمل لفحص: ${translateQcType(qc.type) || qc.id}`, reason: qc.reason || 'فحص جودة فاشل يحتاج متابعة.', page: 'qc_center', action: 'فتح الجودة' })),
    ...pendingSops.slice(0, 2).map(sop => ({ severity: 'warning', source: 'من الإجراءات', icon: 'fa-book', title: `مراجعة إجراء: ${sop.title}`, reason: 'الإجراء غير معتمد بعد، راجعه قبل ربطه بالتنفيذ.', page: 'sop', action: 'فتح الإجراءات' })),
    ...opPackWarnings.slice(0, 2).map(pack => ({ severity: 'warning', source: 'من باقات العمليات', icon: 'fa-boxes-stacked', title: `تحذير مواد في باقة: ${pack.name}`, reason: 'إحدى خطوات الباقة تحتاج مادة غير كافية حالياً.', page: 'op_packs', action: 'فتح الباقات' })),
    ...queuePressure.slice(0, 2).map(machine => ({ severity: 'info', source: 'من المكائن', icon: 'fa-gauge-high', title: `ضغط طابور على ${machine.name}`, reason: `الطابور الحالي ${getMachineQueueCount(machine)} مهام.`, page: 'machines', action: 'فتح المكائن' }))
  ];

  const health = typeof getOmniHealthReport === 'function' ? getOmniHealthReport() : { totalEntities: 0, brokenLinks: [], materialShortages: [], overReservedMaterials: [], missingSops: [], missingMachines: [], missingMaterials: [] };
  const healthIssues = [
    ...health.brokenLinks.map(w => ({ severity: 'danger', icon: 'fa-link-slash', text: w.text, type: w.type, id: w.id })),
    ...health.materialShortages.map(w => ({ severity: 'warning', icon: 'fa-box-open', text: w.text, type: w.type, id: w.id })),
    ...health.overReservedMaterials.map(w => ({ severity: 'danger', icon: 'fa-box', text: w.text, type: w.type, id: w.id })),
    ...health.missingSops.map(w => ({ severity: 'warning', icon: 'fa-file-circle-exclamation', text: w.text, type: w.type, id: w.id })),
    ...health.missingMachines.map(w => ({ severity: 'warning', icon: 'fa-triangle-exclamation', text: w.text, type: w.type, id: w.id })),
    ...health.missingMaterials.map(w => ({ severity: 'warning', icon: 'fa-exclamation', text: w.text, type: w.type, id: w.id }))
  ];

  const greeting = getCommandCenterGreeting();
  const today = new Date();
  const dateStr = today.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = today.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  const machineCount = (omni.machines || []).length;

  const kpis = [
    { val: totalCards, label: 'بطاقات فعّالة', icon: 'fa-layer-group', color: '#38bdf8', tone: 'info' },
    { val: urgentCards.length, label: 'مهام عاجلة', icon: 'fa-fire', color: '#f87171', tone: urgentCards.length ? 'danger' : 'success' },
    { val: overdueCards.length, label: 'متأخرة', icon: 'fa-clock', color: '#fb923c', tone: overdueCards.length ? 'warning' : 'success' },
    { val: openTasks.length, label: 'مهام مفتوحة', icon: 'fa-list-check', color: '#a855f7', tone: 'info' },
    { val: `${machinesUp.length}/${machineCount}`, label: 'مكائن تعمل', icon: 'fa-gears', color: '#34d399', tone: machinesDown.length ? 'warning' : 'success' },
    { val: totalQueue, label: 'إجمالي الطابور', icon: 'fa-bars-staggered', color: '#22d3ee', tone: 'info' },
    { val: lowStock.length, label: 'مواد ناقصة', icon: 'fa-box-open', color: '#facc15', tone: lowStock.length ? 'warning' : 'success' },
    { val: qcFails.length, label: 'فحوصات فاشلة', icon: 'fa-xmark-circle', color: '#f43f5e', tone: qcFails.length ? 'danger' : 'success' }
  ];

  const machinePressureBars = (omni.machines || []).slice(0, 6).map(m => {
    const q = getMachineQueueCount(m);
    const pct = Math.min(100, q * 20);
    const color = m.status === 'maintenance' ? '#f87171' : q >= 3 ? '#fb923c' : q >= 1 ? '#38bdf8' : '#34d399';
    const status = m.status === 'maintenance' ? 'صيانة' : q === 0 ? 'متاحة' : q >= 3 ? 'مزدحمة' : 'تعمل';
    return `<div class="cc-machine-row" onclick="switchPage('machines')">
      <div class="cc-machine-info"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.operator || 'بدون مشغّل')} · طابور ${q}</small></div>
      <div class="cc-machine-bar"><div class="cc-machine-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="cc-machine-pill" style="background:${color}22;color:${color};border-color:${color}55">${status}</span>
    </div>`;
  }).join('');

  const alertItems = [];
  if (overdueCards.length) alertItems.push({ severity: 'danger', icon: 'fa-triangle-exclamation', text: `${overdueCards.length} بطاقة متأخرة عن موعد التسليم`, page: 'kanban' });
  if (blockedCards.length) alertItems.push({ severity: 'warning', icon: 'fa-ban', text: `${blockedCards.length} بطاقة متوقفة`, page: 'kanban' });
  if (machinesDown.length) alertItems.push({ severity: 'danger', icon: 'fa-wrench', text: `${machinesDown.length} ماكينة في الصيانة: ${machinesDown.map(m=>m.name).join('، ')}`, page: 'machines' });
  if (lowStock.length) alertItems.push({ severity: 'warning', icon: 'fa-box-open', text: `${lowStock.length} مادة وصلت للحد الأدنى: ${lowStock.slice(0,3).map(m=>m.name).join('، ')}${lowStock.length>3?'…':''}`, page: 'inventory' });
  if (qcFails.length) alertItems.push({ severity: 'danger', icon: 'fa-xmark-circle', text: `${qcFails.length} فحص جودة فاشل يحتاج إعادة عمل`, page: 'qc_center' });

  // Cashbox Balance Alert
  const cashBalance = getCashBalance();
  if (cashBalance < 500000) {
    alertItems.push({ 
      severity: 'danger', 
      icon: 'fa-wallet', 
      text: `رصيد الصندوق منخفض جداً: ${Number(cashBalance).toLocaleString()} IQD (الحد الأدنى 500,000 IQD)`, 
      page: 'cashbox' 
    });
    ccSuggestions.push({
      severity: 'danger',
      source: 'المالية',
      icon: 'fa-wallet',
      title: 'شحن الصندوق / تأجيل المصاريف',
      reason: `رصيد الصندوق الحالي ${Number(cashBalance).toLocaleString()} IQD. يرجى مراجعة المدفوعات أو شحن الرصيد لتفادي توقف العمليات.`,
      page: 'cashbox',
      action: 'فتح الصندوق'
    });
  }

  // Workload Alerts
  const workload = calculateTaskManagerWorkload();
  const overloadedStaff = (workload.employees || []).filter(emp => emp.score >= 80);
  overloadedStaff.forEach(emp => {
    alertItems.push({
      severity: 'warning',
      icon: 'fa-user-clock',
      text: `الموظف ${escapeHtml(emp.name)} محمل بأعمال زائدة (مؤشر العبء ${emp.score}%)`,
      page: 'task_manager'
    });
    ccSuggestions.push({
      severity: 'warning',
      source: 'إدارة المهام',
      icon: 'fa-user-clock',
      title: `إعادة توزيع مهام الموظف ${emp.name}`,
      reason: `مؤشر عبء العمل للموظف بلغ ${emp.score}% مع ${emp.open} مهام مفتوحة (${emp.overdue} متأخرة). ينصح بإعادة تعيين بعض المهام لموظفين آخرين.`,
      page: 'task_manager',
      action: 'فتح المهام'
    });
  });

  const spaceStats = (omni.taskManager?.spaces || []).map(sp => {
    let tasks = 0;
    (sp.departments || []).forEach(d => (d.sections || []).forEach(s => (s.taskTypes || []).forEach(t => (t.tasks || []).forEach(tsk => { if (tsk.status !== 'Done' && tsk.status !== 'مكتمل') tasks++; }))));
    return { name: sp.name, tasks };
  }).filter(s => /Recycling|Printing|AI|Community|Products|Engineering|Advertising/i.test(s.name || ''));

  el.innerHTML = `
    <div class="cc-hero-banner">
      <div class="cc-hero-left">
        <span class="cc-hero-eyebrow"><i class="fa-solid fa-bolt"></i> أوكتاغون · مركز القيادة التنفيذي</span>
        <h2 class="cc-hero-greeting">${greeting} 👋</h2>
        <p class="cc-hero-date"><i class="fa-solid fa-calendar-day"></i> ${escapeHtml(dateStr)} · <i class="fa-solid fa-clock"></i> ${escapeHtml(timeStr)}</p>
        <p class="cc-hero-sub">شاشة المدير اليومية — كل التنبيهات والقرارات المطلوبة في مكان واحد.</p>
        <div class="cc-hero-actions">
          <button class="cc-hero-btn cc-hero-btn-primary" onclick="switchPage('kanban')"><i class="fa-solid fa-table-columns"></i> اللوحة التنفيذية</button>
          <button class="cc-hero-btn cc-hero-btn-secondary" onclick="switchPage('inventory')"><i class="fa-solid fa-warehouse"></i> المخزون</button>
          <button class="cc-hero-btn cc-hero-btn-ghost" onclick="openOmniNotificationCenter()"><i class="fa-solid fa-bell"></i> سجل التحديثات</button>
        </div>
      </div>
      <div class="cc-hero-right">${renderCommandCenterHealthGauge(healthScore)}</div>
    </div>

    ${alertItems.length ? `<div class="cc-alerts-ribbon">
      ${alertItems.map(a => `<button class="cc-alert-chip cc-alert-${a.severity}" onclick="switchPage('${a.page}')">
        <i class="fa-solid ${a.icon}"></i>
        <span>${escapeHtml(a.text)}</span>
        <i class="fa-solid fa-arrow-left cc-alert-arrow"></i>
      </button>`).join('')}
    </div>` : `<div class="cc-alerts-ribbon cc-alerts-empty">
      <i class="fa-solid fa-circle-check"></i>
      <span>كل شيء يعمل بسلاسة — لا توجد تنبيهات حرجة الآن</span>
    </div>`}

    <div class="cc-kpi-grid-v2">
      ${kpis.map(k => `<div class="cc-kpi-v2 cc-kpi-tone-${k.tone}">
        <div class="cc-kpi-v2-icon" style="background:${k.color}22;color:${k.color}"><i class="fa-solid ${k.icon}"></i></div>
        <div class="cc-kpi-v2-body">
          <div class="cc-kpi-v2-val">${k.val}</div>
          <div class="cc-kpi-v2-label">${escapeHtml(k.label)}</div>
        </div>
      </div>`).join('')}
    </div>

    ${typeof renderCommandCenterRequests === 'function' ? renderCommandCenterRequests() : ''}
    ${typeof renderCommandCenterPurchaseAnalytics === 'function' ? renderCommandCenterPurchaseAnalytics() : ''}
    ${typeof renderCommandCenterPurchaseTracking === 'function' ? renderCommandCenterPurchaseTracking() : ''}

    ${spaceStats.length ? `<div class="cc-section-v2">
      <h3 class="cc-section-v2-title"><i class="fa-solid fa-industry"></i> المهام المفتوحة حسب خطوط الإنتاج</h3>
      <div class="cc-production-grid">
        ${spaceStats.map(s => `<div class="cc-production-chip" onclick="switchPage('task_manager')">
          <div class="cc-production-val">${s.tasks}</div>
          <div class="cc-production-label">${escapeHtml(s.name.split(' (')[0])}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="cc-section-v2 cc-smart-section">
      <h3 class="cc-section-v2-title"><i class="fa-solid fa-brain"></i> اقتراحات ذكية حسب بيانات النظام
        <span class="cc-section-v2-count">${ccSuggestions.length}</span></h3>
      ${ccSuggestions.length === 0 ? '<div class="cc-empty-v2"><i class="fa-solid fa-mug-hot"></i><p>لا توجد قرارات عاجلة مقترحة حالياً — استرخِ ☕</p></div>' : `
        <div class="cc-suggestion-grid-v2">
          ${ccSuggestions.map(s => `<div class="cc-suggestion-v2 cc-sev-${s.severity}">
            <div class="cc-suggestion-v2-head">
              <div class="cc-suggestion-v2-icon"><i class="fa-solid ${s.icon || 'fa-circle-info'}"></i></div>
              <span class="cc-suggestion-v2-source">${escapeHtml(s.source)}</span>
            </div>
            <h4 class="cc-suggestion-v2-title">${escapeHtml(s.title)}</h4>
            <p class="cc-suggestion-v2-reason">${escapeHtml(s.reason)}</p>
            <button class="cc-suggestion-v2-btn" onclick="switchPage('${s.page}')"><i class="fa-solid fa-arrow-left"></i> ${escapeHtml(s.action)}</button>
          </div>`).join('')}
        </div>`}
    </div>

    <div class="cc-ops-grid">
      <div class="cc-ops-panel cc-ops-priority">
        <div class="cc-ops-head"><h3><i class="fa-solid fa-fire"></i> أولويات اليوم</h3><span class="cc-ops-badge cc-ops-badge-red">${urgentCards.length}</span></div>
        <div class="cc-ops-list">
          ${urgentCards.slice(0, 6).map(c => `<div class="cc-ops-item cc-ops-item-urgent" onclick="switchPage('kanban')">
            <i class="fa-solid fa-circle-exclamation"></i>
            <div><b>${escapeHtml(c.title || '')}</b><small>${escapeHtml(c.owner || '—')} · ${escapeHtml(c.dueDate || 'بدون موعد')}</small></div>
          </div>`).join('') || '<div class="cc-ops-empty"><i class="fa-solid fa-mug-hot"></i><p>لا توجد مهام عاجلة</p></div>'}
        </div>
      </div>

      <div class="cc-ops-panel cc-ops-overdue">
        <div class="cc-ops-head"><h3><i class="fa-solid fa-clock"></i> متأخرات</h3><span class="cc-ops-badge cc-ops-badge-orange">${overdueCards.length}</span></div>
        <div class="cc-ops-list">
          ${overdueCards.slice(0, 6).map(c => `<div class="cc-ops-item cc-ops-item-overdue" onclick="switchPage('kanban')">
            <i class="fa-solid fa-hourglass-end"></i>
            <div><b>${escapeHtml(c.title || '')}</b><small>التسليم: ${escapeHtml(c.dueDate || '—')} · ${escapeHtml(c.owner || 'بدون مسؤول')}</small></div>
          </div>`).join('') || '<div class="cc-ops-empty"><i class="fa-solid fa-check"></i><p>لا متأخرات ✓</p></div>'}
        </div>
      </div>

      <div class="cc-ops-panel cc-ops-machines">
        <div class="cc-ops-head"><h3><i class="fa-solid fa-gears"></i> ضغط المكائن</h3><span class="cc-ops-badge cc-ops-badge-cyan">${totalQueue}</span></div>
        <div class="cc-machine-list">
          ${machinePressureBars || '<div class="cc-ops-empty"><i class="fa-solid fa-gear"></i><p>لا توجد مكائن مسجّلة</p></div>'}
        </div>
      </div>

      <div class="cc-ops-panel cc-ops-materials">
        <div class="cc-ops-head"><h3><i class="fa-solid fa-box-open"></i> مواد حرجة</h3><span class="cc-ops-badge cc-ops-badge-yellow">${lowStock.length}</span></div>
        <div class="cc-ops-list">
          ${lowStock.slice(0, 6).map(m => `<div class="cc-ops-item cc-ops-item-material" onclick="switchPage('inventory')">
            <i class="fa-solid fa-cube"></i>
            <div><b>${escapeHtml(m.name)}</b><small>متوفر: ${getMaterialAvailableQty(m)} ${escapeHtml(m.unit || '')} · حد أدنى: ${m.minimum || 0}</small></div>
          </div>`).join('') || '<div class="cc-ops-empty"><i class="fa-solid fa-check"></i><p>المخزون كافٍ ✓</p></div>'}
        </div>
      </div>
    </div>

    <div class="cc-section-v2 cc-health-section">
      <h3 class="cc-section-v2-title"><i class="fa-solid fa-heart-pulse"></i> صحة ترابط النظام
        <span class="cc-section-v2-count">${healthIssues.length}</span></h3>
      <div class="cc-health-head-stats">
        <div class="cc-health-stat"><b>${health.totalEntities || 0}</b><span>كيانات مرتبطة</span></div>
        <div class="cc-health-stat ${healthIssues.length ? 'is-warn' : 'is-ok'}"><b>${healthIssues.length}</b><span>تنبيهات ترابط</span></div>
        <div class="cc-health-stat is-ok"><b>${Math.max(0, (health.totalEntities||0) - healthIssues.length)}</b><span>روابط سليمة</span></div>
      </div>
      <div class="cc-health-list">
        ${healthIssues.slice(0, 12).map(issue => `<div class="cc-health-row cc-sev-${issue.severity}">
          <i class="fa-solid ${issue.icon}"></i>
          <span class="cc-health-text">${escapeHtml(issue.text)}</span>
          <button class="cc-health-action" onclick="openOmniEntity('${issue.type}', '${issue.id}')">مراجعة</button>
        </div>`).join('') || '<div class="cc-empty-v2"><i class="fa-solid fa-shield-halved"></i><p>جميع الروابط سليمة — لا توجد تناقضات بيانات ✓</p></div>'}
        ${healthIssues.length > 12 ? `<div class="cc-health-more">و ${healthIssues.length - 12} تنبيه آخر…</div>` : ''}
      </div>
    </div>

    <div class="cc-quick-dock">
      <button onclick="switchPage('kanban')"><i class="fa-solid fa-clipboard-list"></i><span>اللوحة</span></button>
      <button onclick="switchPage('op_packs')"><i class="fa-solid fa-box"></i><span>الباقات</span></button>
      <button onclick="switchPage('machines')"><i class="fa-solid fa-gears"></i><span>المكائن</span></button>
      <button onclick="switchPage('inventory')"><i class="fa-solid fa-warehouse"></i><span>المخزون</span></button>
      <button onclick="switchPage('qc_center')"><i class="fa-solid fa-microscope"></i><span>الجودة</span></button>
      <button onclick="switchPage('analytics')"><i class="fa-solid fa-chart-line"></i><span>التحليلات</span></button>
      <button onclick="switchPage('employee_ui')"><i class="fa-solid fa-user-gear"></i><span>الموظف</span></button>
      <button onclick="openCmdPalette()"><i class="fa-solid fa-terminal"></i><span>الأوامر</span></button>
    </div>
  `;
}
