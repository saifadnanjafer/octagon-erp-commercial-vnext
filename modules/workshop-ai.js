/**
 * OCTAGON ERP — WORKSHOP AI OPERATING LAYER ("روح النظام" / the soul).
 * AI-FIRST, NOT AI-ONLY: every feature here works deterministically from real
 * system data with NO provider; when window.OctagonAI has a live provider it is
 * used to ENHANCE, never to gate. Nothing here performs a sensitive action
 * directly — sensitive ops are proposed into the existing approval queue
 * (omni.aiControl.actionQueue). Add-only: zero app.js edits; reuses the Execution
 * Core (OctagonWorkOrders, omni.jobOrders / workOrderIssues / workOrderEvents),
 * tasks, machines, qcRecords, sops, and the provider layer (window.OctagonAI).
 *
 * Pages added (role-aware, behind the single login): kiosk (روح النظام),
 * ai_queue (طابور الذكاء), ai_factory (مصنع التطوير), ai_tools (سجل الأدوات).
 * Public surface: window.OctagonWorkshopAI + buildWorkshopAiContext(role,page,entity).
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
  function fmt(n) { n = Number(n); return isFinite(n) ? Math.round(n).toLocaleString() : '0'; }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function orgName() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function userName() { try { const u = window.PentagonAuth && PentagonAuth.getCurrentUser && PentagonAuth.getCurrentUser(); if (u && u.name) return u.name; if (u && u.id) return u.id; } catch (_) {} return 'system'; }
  function groups() { try { if (window.PermissionService && window.PentagonAuth) { const g = window.PermissionService.resolveGroups(window.PentagonAuth.getCurrentUser()); if (Array.isArray(g)) return g; } } catch (_) {} return ['system.admin']; }
  function role() {
    const g = groups();
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
  function isSupervisorPlus() { const r = role(); return isManager() || r === 'workshop.supervisor'; }
  function canSeeCosts() { const r = role(); return isSupervisorPlus() || r === 'accountant'; }
  function jobOrders() { const o = O(); return (o && Array.isArray(o.jobOrders)) ? o.jobOrders.filter(w => w.is_active !== false) : []; }
  function allTasks() { try { if (typeof window.getAllTaskManagerTasks === 'function') return window.getAllTaskManagerTasks(true).map(x => x.task).filter(Boolean); } catch (_) {} return []; }
  function machines() { const o = O(); return (o && Array.isArray(o.machines)) ? o.machines : []; }
  function materials() { const o = O(); return (o && Array.isArray(o.materials)) ? o.materials : []; }
  function sops() { const o = O(); if (!o) return []; if (!Array.isArray(o.sops)) o.sops = []; return o.sops; }
  function qcRecords() { const o = O(); return (o && Array.isArray(o.qcRecords)) ? o.qcRecords : []; }
  function issues() { const o = O(); return (o && Array.isArray(o.workOrderIssues)) ? o.workOrderIssues.filter(i => i.is_active !== false) : []; }
  function taskDone(t) { return ['done', 'Done', 'مكتمل', 'completed'].includes(String(t && t.status || '')); }
  function isOverdue(w) { return w.deadline && w.deadline < todayIso() && !['delivered', 'closed', 'cancelled'].includes(w.state); }
  function stateAr(s) { const wo = WO(); return (wo && wo.stateLabels && wo.stateLabels[s]) || s; }

  /** Write an event into the EXACT collection the WO file timeline reads. */
  function woTimeline(woId, type, text, severity, data) {
    const o = O(); if (!o) return;
    if (!Array.isArray(o.workOrderEvents)) o.workOrderEvents = [];
    o.workOrderEvents.push({ id: uid('woev'), workOrderId: woId, type: type, text: text, severity: severity || 'info', byUser: userName(), at: nowIso(), data: data || {} });
    if (o.workOrderEvents.length > 8000) o.workOrderEvents = o.workOrderEvents.slice(-8000);
    if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'workshop_ai', source: 'workshop_ai', action: type, summary: text, payload: { workOrderId: woId } }); } catch (_) {} }
  }
  function notify(title, message, severity) { if (typeof window.createOmniNotification === 'function') { try { window.createOmniNotification({ type: 'workshop_ai', title: title, message: message, sourcePage: 'kiosk', sourceType: 'workshop_ai', severity: severity || 'info', actionPage: 'command_center' }); } catch (_) {} } }

  /* ════════════════ data layer ════════════════ */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!Array.isArray(o.workshopMemory)) o.workshopMemory = [];
    if (!Array.isArray(o.aiDevelopmentFactory)) o.aiDevelopmentFactory = [];
    if (!Array.isArray(o.aiToolRegistry) || !o.aiToolRegistry.length) o.aiToolRegistry = defaultToolRegistry();
    if (!Array.isArray(o.customerMessageDrafts)) o.customerMessageDrafts = [];
    try { if (typeof window.normalizeAiIntegrationData === 'function') window.normalizeAiIntegrationData(); } catch (_) {}
    if (!o.aiControl || typeof o.aiControl !== 'object') o.aiControl = {};
    if (!Array.isArray(o.aiControl.actionQueue)) o.aiControl.actionQueue = [];
    return o;
  }
  function actionQueue() { const o = ensureData(); return o ? o.aiControl.actionQueue : []; }

  /* ════════════════ 17/18: provider status + AI context ════════════════ */
  function providerStatus() {
    let cfg = null; try { cfg = window.OctagonAI && window.OctagonAI.config && window.OctagonAI.config(); } catch (_) {}
    const hasGemini = typeof window.__octagonGeminiAi === 'function' || typeof window.callOctagonAi === 'function';
    return {
      provider: (cfg && cfg.provider) || (hasGemini ? 'gemini' : 'none'),
      model: (cfg && cfg.model) || 'gemini-flash',
      hasKey: !!(cfg && (cfg.openrouterKey || cfg.contactboxKey || cfg.geminiKey)) || hasGemini,
      online: (typeof navigator !== 'undefined') ? navigator.onLine : true,
      deterministicFallback: true,
      brainLoaded: !!(window.JarvisBrain && window.JarvisBrain.handle)
    };
  }
  // 18: the ONLY data the AI may read, filtered by role. Forbidden surfaces never appear.
  function buildWorkshopAiContext(userRole, currentPage, selectedEntity) {
    userRole = userRole || role();
    const worker = userRole === 'workshop.operator' || userRole === 'employee' || userRole === 'designer';
    const customer = userRole === 'customer';
    const ctx = {
      role: userRole, page: currentPage || window.currentPage || '', at: nowIso(),
      allowed: [], forbidden: ['payroll_private', 'user_credentials', 'api_keys', 'owner_private_files'],
      canDraftOnly: worker || customer, data: {}
    };
    // everyone (incl. workers) may read operational workshop state
    ctx.allowed.push('work_orders', 'tasks', 'machines', 'materials', 'qc', 'sop', 'issues', 'delivery', 'workshop_memory', 'alerts');
    ctx.data.workOrders = jobOrders().map(w => ({ ref: w.ref, title: w.title, state: w.state, stateAr: stateAr(w.state), deadline: w.deadline, priority: w.priority, jobType: w.jobTypeLabel, overdue: isOverdue(w), id: w.id }));
    ctx.data.machines = machines().map(m => ({ name: m.name || m.id, status: m.status || 'ready', queue: (Array.isArray(m.queue) ? m.queue.filter(q => q.status !== 'done').length : 0) }));
    ctx.data.materialShortages = (O().materialReservations || []).filter(r => r.status === 'shortage' && r.is_active !== false).map(r => ({ name: (r.materialSnapshot || {}).name, ref: r.ref }));
    ctx.data.openIssues = issues().filter(i => !['resolved', 'waived'].includes(i.status)).map(i => ({ title: i.title, severity: i.severity, ref: i.ref, blocking: i.blocking }));
    ctx.data.sopTitles = sops().map(s => s.title || s.name).filter(Boolean).slice(0, 40);
    if (worker) { ctx.allowed.push('my_tasks'); ctx.data.myTasks = myTasks().map(t => ({ title: t.title, status: t.status, woRef: t.workOrderRef })); }
    if (!worker && !customer) { ctx.allowed.push('costing', 'customer_balance'); if (canSeeCosts()) ctx.data.costingVisible = true; }
    if (customer) { ctx.allowed = ['order_status']; ctx.data = { orders: ctx.data.workOrders.map(w => ({ ref: w.ref, title: w.title, stateAr: w.stateAr, deadline: w.deadline })) }; ctx.forbidden.push('internal_cost', 'other_customers'); }
    if (selectedEntity && selectedEntity.workOrderId) { const w = WO() && WO().getWO(selectedEntity.workOrderId); if (w && !customer) ctx.data.selectedWorkOrder = { ref: w.ref, state: w.state, blockers: (WO().gateReadyForDelivery(w).reasons || []) }; }
    return ctx;
  }
  window.buildWorkshopAiContext = buildWorkshopAiContext;

  /* ════════════════ 7: deterministic Morning Briefing ════════════════ */
  function briefing() {
    const wos = jobOrders();
    const open = wos.filter(w => !['delivered', 'closed', 'cancelled'].includes(w.state));
    const overdue = open.filter(isOverdue);
    const urgent = open.filter(w => ['high', 'urgent'].includes(String(w.priority)) || w.deadline === todayIso());
    const blocked = open.filter(w => WO() && !WO().gateReadyForDelivery(w).ok && ['quality_check', 'in_production', 'rework'].includes(w.state));
    const shortages = (O().materialReservations || []).filter(r => r.status === 'shortage' && r.is_active !== false);
    const conflicts = (WO() && WO().machineConflicts && WO().machineConflicts()) || [];
    const qcFails = wos.filter(w => qcRecords().some(q => q.sourceType === 'work_order' && q.sourceId === w.id && q.result === 'fail' && q.reworkStatus !== 'resolved'));
    const rework = open.filter(w => w.state === 'rework');
    const deliveriesToday = open.filter(w => w.state === 'ready_for_delivery');
    const openIssues = issues().filter(i => !['resolved', 'waived'].includes(i.status));
    // employee overload
    const loadMap = {}; allTasks().filter(t => !taskDone(t)).forEach(t => { const who = t.assigneeId || t.assignedTo || t.owner; if (who) loadMap[who] = (loadMap[who] || 0) + 1; });
    const overloaded = Object.keys(loadMap).filter(k => loadMap[k] >= 5).map(k => ({ name: k, n: loadMap[k] }));
    // deterministic suggested actions
    const actions = [];
    if (shortages.length) actions.push({ text: 'أنشئ طلب شراء لـ ' + shortages.length + ' مادة ناقصة', page: 'inventory' });
    if (overdue.length) actions.push({ text: 'راجع ' + overdue.length + ' طلب متأخر وحدّث المواعيد مع الزبائن', page: 'work_orders' });
    if (rework.length) actions.push({ text: 'تابع ' + rework.length + ' طلب في إعادة العمل', page: 'work_orders' });
    if (conflicts.length) actions.push({ text: 'وزّع الحمل على المكائن (' + conflicts.length + ' تعارض)', page: 'machines' });
    if (deliveriesToday.length) actions.push({ text: 'بلّغ الزبائن عن ' + deliveriesToday.length + ' طلب جاهز للتسليم', page: 'work_orders' });
    if (!actions.length) actions.push({ text: 'الورشة تحت السيطرة — راجع لوحة تشغيل اليوم', page: 'command_center' });
    return { generatedAt: nowIso(), urgent, overdue, blocked, shortages, conflicts, qcFails, rework, deliveriesToday, openIssues, overloaded, actions, deterministic: true };
  }
  function briefingText(b) {
    if (!b || typeof b !== 'object') b = briefing(); // public-API safety: allow briefingText() with no arg
    const L = ['☀️ ملخص أومني الصباحي — ' + new Date().toLocaleDateString('ar-IQ')];
    L.push('• مستعجل/اليوم: ' + b.urgent.length + ' · متأخر: ' + b.overdue.length + ' · معاق: ' + b.blocked.length);
    L.push('• مواد ناقصة: ' + b.shortages.length + ' · تعارض مكائن: ' + b.conflicts.length);
    L.push('• فشل جودة: ' + b.qcFails.length + ' · إعادة عمل: ' + b.rework.length + ' · جاهز للتسليم: ' + b.deliveriesToday.length);
    L.push('• مشاكل مفتوحة: ' + b.openIssues.length + (b.overloaded.length ? ' · موظفون مضغوطون: ' + b.overloaded.length : ''));
    L.push('\nالقرارات المقترحة:');
    b.actions.forEach(a => L.push('  ◦ ' + a.text));
    return L.join('\n');
  }
  window.OctagonWorkshopAI_briefing = briefing;

  /* ════════════════ 8: worker assistant (deterministic, worker-safe) ════════════════ */
  function myTasks() {
    const me = userName();
    return allTasks().filter(t => !taskDone(t) && [t.assigneeId, t.assignedTo, t.owner, t.employeeId].map(v => String(v || '')).includes(me));
  }
  function workerAnswer(q) {
    q = String(q || '').toLowerCase();
    const tasks = myTasks();
    const next = tasks[0];
    const wo = next && next.workOrderId && WO() ? WO().getWO(next.workOrderId) : null;
    if (/سلام|اهلا|أهلا|مرحبا|hi|hello/.test(q)) return 'هلا بيك 👋 اسألني: شنو مهمتي؟ شنو المقاس؟ وين تعليمات العمل؟';
    if (/مهمت|أسوي|اسوي|هسه|شنو اسوي|next/.test(q)) return next ? ('مهمتك الحالية: «' + next.title + '»' + (next.workOrderRef ? ' (أمر ' + next.workOrderRef + ')' : '') + '. اضغط «بدأت المهمة» لما تبدأ.') : 'ما عندك مهام مفتوحة الآن ✅';
    if (/مقاس|قياس|ابعاد|أبعاد|dimension/.test(q)) { const d = wo && wo.dims; return d ? ('المقاس: ' + (d.width || '؟') + '×' + (d.height || '؟') + (d.depth ? '×' + d.depth : '') + ' ' + (d.unit || 'سم') + ' — العدد ' + (d.quantity || 1)) : 'المقاس غير محدد على المهمة الحالية. بلّغ المشرف عبر «عندي مشكلة».'; }
    if (/ماد|material/.test(q)) { const reqs = wo ? (wo.requiredMaterials || []) : []; return reqs.length ? ('المواد المطلوبة: ' + reqs.map(r => (r.name || r.materialId) + ' ×' + r.qty).join('، ')) : 'لا مواد محددة على هذه المهمة.'; }
    if (/sop|تعليم|اجراء|إجراء|شلون انفذ|شلون أنفذ/.test(q)) { const sid = (next && (next.sopIds || [])[0]); const s = sid && sops().find(x => x.id === sid); return s ? ('تعليمات العمل (SOP): ' + (s.title || s.name) + '. افتحها من زر «تعليمات العمل».') : 'لا يوجد SOP مرتبط بهذه المهمة بعد.'; }
    if (/مكين|machine/.test(q)) { const mid = wo && (wo.machineIds || [])[0]; const m = mid && machines().find(x => x.id === mid); return m ? ('المكينة: ' + (m.name || m.id) + (['maintenance', 'offline'].includes(String(m.status)) ? ' ⚠️ (متوقفة — بلّغ المشرف)' : '')) : 'لا مكينة محددة.'; }
    if (/اسلم|أسلم|تسليم|deliver/.test(q)) { if (!wo) return 'حدد أمر العمل أولاً.'; const g = WO().gateReadyForDelivery(wo); return g.ok ? 'نعم، الطلب مؤهل للتسليم ✅' : ('لا تكدر تسلمها بعد — العوائق:\n• ' + g.reasons.join('\n• ')); }
    if (/مشكل|problem|توقف|متوقف|عطل/.test(q)) return 'لتبليغ مشكلة اضغط زر «عندي مشكلة» الأحمر، اختر النوع، واكتب وصف قصير. المشرف راح يوصله فوراً.';
    return 'أنا مساعد العامل — أكدر أجاوب عن: مهمتك، المقاس، المادة، المكينة، تعليمات العمل (SOP)، وهل تكدر تسلم. للأمور الثانية بلّغ المشرف.';
  }
  window.OctagonWorkshopAI_workerAnswer = workerAnswer;

  /* ════════════════ 9: AI SOP draft generator ════════════════ */
  function generateSopDraft(seed) {
    // seed: {jobType, jobTypeLabel, woId} — deterministic structured draft from real data
    const wo = seed && seed.woId && WO() ? WO().getWO(seed.woId) : null;
    const jt = (seed && seed.jobTypeLabel) || (wo && wo.jobTypeLabel) || 'عملية ورشة';
    const mats = wo ? (wo.requiredMaterials || []).map(r => r.name || r.materialId) : [];
    const machs = wo ? (wo.machineIds || []).map(id => { const m = machines().find(x => x.id === id); return m ? (m.name || id) : id; }) : [];
    // learn from memory: past QC failures + issues for this job type
    const pastFails = qcRecords().filter(q => q.result === 'fail' && String(q.type || '').includes(jt)).map(q => q.reason).filter(Boolean).slice(0, 4);
    const memWarn = (O().workshopMemory || []).filter(m => m.is_active !== false && (m.tags || []).includes(jt)).map(m => m.recommendation).filter(Boolean).slice(0, 3);
    const steps = [
      'تجهيز الملف والتأكد من المقاسات والتصميم النهائي.',
      'تحضير المواد المطلوبة' + (mats.length ? ' (' + mats.join('، ') + ')' : '') + ' والتأكد من توفّرها.',
      'ضبط ' + (machs.length ? 'المكينة (' + machs.join('، ') + ')' : 'المكينة') + ' والإعدادات الصحيحة.',
      'تنفيذ القص/الإنتاج حسب المواصفات.',
      'تنظيف الحواف والتشطيب.',
      'التجميع والتركيب إن لزم.',
      'الفحص النهائي حسب قائمة الجودة.',
      'التغليف وتجهيز التسليم.'
    ];
    const sop = {
      id: uid('sop'), title: 'SOP — ' + jt + ' (مسودة)', name: 'SOP — ' + jt,
      category: jt, drafted_by_ai: true, status: 'draft', approvalStatus: 'draft', version: 1,
      created_at: nowIso(), created_by: userName(), is_active: true,
      purpose: 'إجراء تشغيل قياسي لإنتاج «' + jt + '» بجودة ثابتة وتقليل الأخطاء.',
      tools: ['أدوات القياس', 'أدوات السلامة'].concat(machs),
      materials: mats,
      safety: ['ارتداء وسائل الحماية', 'الانتباه عند تشغيل المكائن', 'فصل الكهرباء عند الصيانة'],
      steps: steps,
      commonMistakes: pastFails.length ? pastFails.map(f => 'سبق فشل بسبب: ' + f) : ['عدم مطابقة المقاس', 'تشطيب غير نظيف'],
      qcChecklist: ['المقاس مطابق', 'التشطيب نظيف', 'لا أضرار', 'التغليف سليم'],
      acceptance: 'يُقبل العمل عند اجتياز كل بنود الجودة دون ملاحظات.',
      reworkInstructions: 'عند الرفض: سجّل السبب، أنشئ مهمة إعادة عمل، وأعد الفحص قبل التسليم.',
      aiSources: [], aiNotes: memWarn.length ? ('تحذيرات من ذاكرة الورشة: ' + memWarn.join(' · ')) : ''
    };
    return sop;
  }
  function sopToText(s) {
    return [
      '# ' + s.title, '', 'الغرض: ' + s.purpose, '',
      'الأدوات: ' + (s.tools || []).join('، '),
      'المواد: ' + ((s.materials || []).join('، ') || '—'), '',
      'تعليمات السلامة:', ...(s.safety || []).map(x => '• ' + x), '',
      'الخطوات:', ...(s.steps || []).map((x, i) => (i + 1) + '. ' + x), '',
      'أخطاء شائعة:', ...(s.commonMistakes || []).map(x => '• ' + x), '',
      'قائمة الجودة:', ...(s.qcChecklist || []).map(x => '☐ ' + x), '',
      'معايير القبول: ' + s.acceptance,
      'تعليمات إعادة العمل: ' + s.reworkInstructions,
      s.aiNotes ? '\n⚠️ ' + s.aiNotes : '',
      '\nالإصدار: ' + s.version + ' · مسودة من الذكاء الصناعي — تحتاج اعتماد المدير'
    ].join('\n');
  }
  let lastSopDraft = null;
  window.waiGenerateSop = function () {
    ensureData();
    const woRef = val('waiSopWo');
    const wo = woRef ? jobOrders().find(w => w.ref === woRef || w.id === woRef) : null;
    lastSopDraft = generateSopDraft({ woId: wo ? wo.id : '', jobTypeLabel: val('waiSopType') || (wo && wo.jobTypeLabel) });
    renderPage();
  };
  window.waiSaveSopDraft = function () {
    if (!lastSopDraft) return;
    ensureData();
    sops().unshift(lastSopDraft);
    woRefLinkSop(lastSopDraft);
    if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'workshop_ai', source: 'sop_ai', action: 'sop_draft_created', summary: 'مسودة SOP: ' + lastSopDraft.title }); } catch (_) {} }
    save(); toast('حُفظت مسودة SOP (تحتاج اعتماد المدير) 📝', 'success');
    lastSopDraft = null; renderPage();
  };
  function woRefLinkSop(sop) { const woRef = val('waiSopWo'); const wo = woRef && jobOrders().find(w => w.ref === woRef); if (wo) { wo.sopIds = wo.sopIds || []; wo.sopIds.push(sop.id); woTimeline(wo.id, 'sop_draft', 'أُضيفت مسودة SOP من الذكاء الصناعي: ' + sop.title, 'info'); } }
  window.waiSopStatus = function (sopId, status) {
    const s = sops().find(x => x.id === sopId); if (!s) return;
    if (status === 'approved' && !isManager()) { toast('اعتماد SOP صلاحية مدير فقط', 'warning'); return; }
    s.status = status; s.approvalStatus = status; if (status === 'approved') { s.approvedBy = userName(); s.approvedAt = nowIso(); }
    if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'workshop_ai', source: 'sop_ai', action: 'sop_' + status, summary: s.title + ' → ' + status }); } catch (_) {} }
    save(); toast('SOP → ' + ({ draft: 'مسودة', pending_review: 'بانتظار المراجعة', approved: 'معتمد', archived: 'مؤرشف' }[status] || status), 'success'); renderPage();
  };

  /* ════════════════ 10: AI customer message generator ════════════════ */
  const MSG_TYPES = {
    received: 'استلام الطلب', quote_ready: 'العرض جاهز', awaiting_approval: 'بانتظار الموافقة',
    in_production: 'قيد التنفيذ', delayed_material: 'تأخير بسبب المواد', delayed_qc: 'تأخير بسبب الجودة',
    ready_pickup: 'جاهز للاستلام', ready_delivery: 'جاهز للتوصيل', delivered: 'تم التسليم',
    payment_reminder: 'تذكير بالدفع', apology: 'اعتذار'
  };
  function customerMessage(wo, type) {
    const name = (wo.customerSnapshot && wo.customerSnapshot.name) || 'الكريم';
    const job = wo.title, ref = wo.ref, org = orgName();
    const M = {
      received: `أهلاً أستاذ/أستاذة ${name}، استلمنا طلبكم «${job}» رقم ${ref}. راح نبدأ التجهيز ونعلمكم بكل مرحلة. شكراً لاختياركم ${org}.`,
      quote_ready: `أهلاً ${name}، عرض السعر لطلبكم «${job}» (${ref}) صار جاهز. ننتظر موافقتكم حتى نبدأ التنفيذ. شكراً.`,
      awaiting_approval: `أهلاً ${name}، ننتظر موافقتكم على تفاصيل طلب «${job}» رقم ${ref} حتى نباشر العمل. تحياتنا، ${org}.`,
      in_production: `أهلاً ${name}، طلبكم «${job}» (${ref}) صار قيد التنفيذ بالورشة. راح نعلمكم لما يخلص. شكراً لصبركم.`,
      delayed_material: `أهلاً ${name}، نعتذر — طلبكم «${job}» (${ref}) تأخر بسبب توفر المادة. نشتغل على تأمينها بأسرع وقت ونحدثكم. نقدّر تفهمكم.`,
      delayed_qc: `أهلاً ${name}، حرصاً على الجودة نعيد ضبط جزء من طلبكم «${job}» (${ref})، فتأخر قليلاً. هدفنا يوصلكم بأفضل شكل. شكراً.`,
      ready_pickup: `أهلاً أستاذ/أستاذة ${name}، طلبكم «${job}» رقم ${ref} صار جاهز للاستلام من الورشة. بانتظاركم 🌹 — ${org}.`,
      ready_delivery: `أهلاً ${name}، طلبكم «${job}» (${ref}) صار جاهز للتوصيل. نتفق على الوقت المناسب لكم؟ شكراً لاختياركم ${org}.`,
      delivered: `شكراً أستاذ/أستاذة ${name} 🌹 تم تسليم طلبكم «${job}» (${ref}). نتمنى ينال رضاكم، وننتظر طلباتكم القادمة — ${org}.`,
      payment_reminder: `أهلاً ${name}، تذكير ودّي بخصوص المبلغ المتبقي على طلب «${job}» رقم ${ref}. نشكر تعاونكم 🌹.`,
      apology: `نعتذر منكم أستاذ/أستاذة ${name} عن أي تأخير بطلب «${job}» (${ref}). نشتغل على معالجته فوراً ونقدّر صبركم. ${org}.`
    };
    return M[type] || M.in_production;
  }
  let lastMsg = { woId: '', type: '', text: '' };
  window.waiGenMessage = function () {
    const woRef = val('waiMsgWo'); const type = val('waiMsgType') || 'in_production';
    const wo = jobOrders().find(w => w.ref === woRef || w.id === woRef);
    if (!wo) { toast('اختر أمر عمل', 'warning'); return; }
    lastMsg = { woId: wo.id, type: type, text: customerMessage(wo, type) };
    renderPage();
  };
  window.waiCopyMessage = function () {
    if (!lastMsg.text) return;
    try { navigator.clipboard.writeText(lastMsg.text).then(() => toast('نُسخت الرسالة 📋', 'success')); } catch (_) { window.prompt('انسخ:', lastMsg.text); }
  };
  window.waiSaveMessageDraft = function (markSent) {
    if (!lastMsg.text) return;
    const o = ensureData();
    const draft = { id: uid('msg'), workOrderId: lastMsg.woId, type: lastMsg.type, text: lastMsg.text, createdBy: userName(), createdAt: nowIso(), sentManually: !!markSent };
    o.customerMessageDrafts.unshift(draft);
    woTimeline(lastMsg.woId, markSent ? 'customer_message_sent' : 'customer_message_draft', (markSent ? 'أُرسلت رسالة للزبون يدوياً' : 'مسودة رسالة زبون') + ' [' + (MSG_TYPES[lastMsg.type] || lastMsg.type) + ']', 'info');
    save(); toast(markSent ? 'سُجّل الإرسال اليدوي ✅' : 'حُفظت المسودة في ملف الطلب 📝', 'success'); renderPage();
  };

  /* ════════════════ 11: workshop memory ════════════════ */
  function memUpsert(o, key, rec) {
    const exist = o.workshopMemory.find(m => m.dedupeKey === key && m.is_active !== false);
    if (exist) { exist.summary = rec.summary; exist.severity = rec.severity; exist.recommendation = rec.recommendation; exist.updated_at = nowIso(); exist.count = (exist.count || 1) + 1; return exist; }
    const m = Object.assign({ id: uid('mem'), dedupeKey: key, created_at: nowIso(), updated_at: nowIso(), is_active: true, reviewed_by_manager: false, count: 1 }, rec);
    o.workshopMemory.unshift(m); return m;
  }
  window.waiDetectMemory = function () {
    const o = ensureData();
    let n = 0;
    // repeated QC failures by reason
    const failBy = {}; qcRecords().filter(q => q.result === 'fail' && q.reason).forEach(q => { const k = String(q.reason).trim().slice(0, 40); failBy[k] = (failBy[k] || 0) + 1; });
    Object.keys(failBy).filter(k => failBy[k] >= 2).forEach(k => { memUpsert(o, 'qcfail:' + k, { type: 'qc_failure', title: 'فشل جودة متكرر: ' + k, summary: 'تكرر ' + failBy[k] + ' مرات', sourceEntityType: 'qc', tags: ['qc'], severity: 'high', recommendation: 'حدّث الـ SOP لمعالجة: ' + k }); n++; });
    // repeated material shortages
    const shBy = {}; (o.materialReservations || []).filter(r => r.status === 'shortage').forEach(r => { const k = (r.materialSnapshot || {}).name || r.materialId; if (k) shBy[k] = (shBy[k] || 0) + 1; });
    Object.keys(shBy).filter(k => shBy[k] >= 2).forEach(k => { memUpsert(o, 'short:' + k, { type: 'material_shortage', title: 'نقص متكرر: ' + k, summary: 'تكرر ' + shBy[k] + ' مرات', sourceEntityType: 'material', tags: ['material', k], severity: 'medium', recommendation: 'ارفع حد إعادة الطلب لـ ' + k + ' أو ثبّت مورد بديل' }); n++; });
    // machine downtime
    machines().filter(m => ['maintenance', 'offline'].includes(String(m.status))).forEach(m => { memUpsert(o, 'down:' + m.id, { type: 'machine_downtime', title: 'توقف مكينة: ' + (m.name || m.id), summary: 'الحالة ' + m.status, sourceEntityType: 'machine', sourceEntityId: m.id, tags: ['machine'], severity: 'medium', recommendation: 'جدول صيانة وقائية وراقب الطابور' }); n++; });
    // rework reasons from issues
    const rwBy = {}; issues().filter(i => i.source === 'qc').forEach(i => { const k = String(i.title).slice(0, 40); rwBy[k] = (rwBy[k] || 0) + 1; });
    Object.keys(rwBy).filter(k => rwBy[k] >= 2).forEach(k => { memUpsert(o, 'rw:' + k, { type: 'rework_reason', title: 'سبب إعادة عمل متكرر', summary: k, sourceEntityType: 'issue', tags: ['rework'], severity: 'high', recommendation: 'درّب الفريق على: ' + k }); n++; });
    save(); toast(n ? ('حدّثت ذاكرة الورشة (' + n + ' نمط)') : 'لا أنماط متكررة جديدة', n ? 'success' : 'info'); renderPage();
  };
  window.waiMemReview = function (id) { const o = ensureData(); const m = o.workshopMemory.find(x => x.id === id); if (!m) return; m.reviewed_by_manager = !m.reviewed_by_manager; save(); renderPage(); };

  /* ════════════════ 12: AI action queue + risk gates ════════════════ */
  const SAFE_EXECUTORS = {
    create_task: function (a) { if (typeof window.createTaskInSelectedSpace !== 'function') return false; window.createTaskInSelectedSpace(a.title || 'مهمة من الذكاء', { priority: 'normal', sourceType: 'ai_action', sourceId: a.id }); return true; },
    create_sop_draft: function () { const d = generateSopDraft({}); sops().unshift(d); return true; },
    customer_message_draft: function () { return true; } // draft only — already safe
  };
  function riskOf(a) { return a.risk || a.riskLevel || (['waive_qc', 'close_work_order', 'post_finance', 'change_price', 'consume_material', 'send_whatsapp', 'apply_code_patch', 'archive_record'].includes(a.actionType) ? 'high' : 'medium'); }
  window.waiQueueApprove = function (id) {
    const a = actionQueue().find(x => x.id === id); if (!a) return;
    const r = riskOf(a);
    if ((r === 'high' || r === 'critical') && !isManager()) { toast('هذا الإجراء عالي الخطورة — يحتاج موافقة مدير', 'warning'); return; }
    if (r === 'low' && !isSupervisorPlus()) { toast('يحتاج موافقة مشرف على الأقل', 'warning'); return; }
    if (!isSupervisorPlus()) { toast('الموافقة تحتاج صلاحية مشرف/مدير', 'warning'); return; }
    a.status = 'approved'; a.approvedBy = userName(); a.approvedAt = nowIso();
    // ONLY low-risk, whitelisted executors auto-run. Everything sensitive stays manual.
    const exec = SAFE_EXECUTORS[a.actionType];
    if (exec && r === 'low') { try { const ok = exec(a); a.status = ok ? 'executed' : 'failed'; a.executionLog = (a.executionLog || []).concat([{ at: nowIso(), by: userName(), ok: ok }]); save(); } catch (e) { a.status = 'failed'; } }
    else { a.executionLog = (a.executionLog || []).concat([{ at: nowIso(), by: userName(), note: 'approved — تنفيذ يدوي مطلوب (إجراء حساس)' }]); }
    if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'workshop_ai', source: 'ai_queue', action: 'action_' + a.status, summary: (a.title || a.actionType) + ' → ' + a.status }); } catch (_) {} }
    save(); toast('الإجراء: ' + (a.status === 'executed' ? 'نُفّذ ✅' : 'اعتُمد (تنفيذ يدوي للإجراءات الحساسة)'), 'success'); renderPage();
  };
  window.waiQueueReject = function (id) { const a = actionQueue().find(x => x.id === id); if (!a) return; if (!isSupervisorPlus()) { toast('يحتاج صلاحية مشرف/مدير', 'warning'); return; } a.status = 'rejected'; a.approvedBy = userName(); a.approvedAt = nowIso(); save(); toast('رُفض الإجراء', 'info'); renderPage(); };
  window.waiQueueDemo = function () {
    const o = ensureData();
    o.aiControl.actionQueue.unshift({ id: uid('aiprop'), actionType: 'create_task', title: 'مهمة متابعة: مراجعة الطلبات المتأخرة', reason: 'يوجد طلبات متأخرة حسب لوحة اليوم', source: 'briefing', risk: 'low', status: 'pending', affectedRecords: 1, createdByAI: true, createdAt: nowIso() });
    save(); toast('أُضيف اقتراح تجريبي منخفض الخطورة للطابور', 'info'); renderPage();
  };

  /* ════════════════ 13: AI development factory ════════════════ */
  window.waiAddDevSuggestion = function (preset) {
    const o = ensureData();
    const title = (preset && preset.title) || val('waiDevTitle');
    if (!title) { toast('عنوان الاقتراح مطلوب', 'warning'); return; }
    const rec = {
      id: uid('dev'), title: title, category: (preset && preset.category) || val('waiDevCat') || 'feature',
      source: (preset && preset.source) || 'manager', description: (preset && preset.desc) || val('waiDevDesc'),
      priority: val('waiDevPriority') || 'normal', risk: val('waiDevRisk') || 'medium',
      generatedPrompt: '', affectedFiles: [], testChecklist: [], rollbackPlan: '',
      status: 'idea', created_at: nowIso(), created_by: userName(), approved_by: '', notes: ''
    };
    buildDevPrompt(rec);
    o.aiDevelopmentFactory.unshift(rec);
    save(); toast('أُضيف اقتراح تطوير + مسودة prompt جاهزة', 'success'); renderPage();
  };
  function buildDevPrompt(rec) {
    rec.affectedFiles = ['modules/(new or existing).js', 'modules/(matching).css', 'index.html (nav + section + script/link)'];
    rec.testChecklist = ['node --check on edited JS', 'page loads with no console errors', 'route health stays 39/39', 'no existing feature broken', 'audit event recorded'];
    rec.rollbackPlan = 'الوحدات add-only — للتراجع: احذف وسوم <script>/<link> الجديدة من index.html وملفات modules الجديدة؛ لا تُلمس قاعدة البيانات.';
    rec.generatedPrompt = [
      'أكمل مشروع Octagon ERP. اقرأ MASTER_ROADMAP.md و README.md أولاً.',
      'المطلوب: ' + rec.title + (rec.description ? ' — ' + rec.description : ''),
      'القيود: add-only، لا تعدّل app.js إلا بأقل تصحيح آمن، migrations idempotent، لا تحذف بيانات، كل إجراء مهم يسجّل audit.',
      'النمط: وحدة جديدة في modules/*.js تلفّ switchPage، CSS بنطاق خاص، رابط <link> و<script> في index.html.',
      'بعد التنفيذ: node --check، شغّل «فحص صحة النظام»، وحدّث الوثائق.'
    ].join('\n');
    rec.status = 'prompt_ready';
  }
  window.waiDevPrompt = function (id) {
    const o = ensureData(); const rec = o.aiDevelopmentFactory.find(x => x.id === id); if (!rec) return;
    if (!rec.generatedPrompt) buildDevPrompt(rec);
    try { navigator.clipboard.writeText(rec.generatedPrompt).then(() => toast('نُسخ الـ prompt 📋', 'success')); } catch (_) { window.prompt('انسخ الـ prompt:', rec.generatedPrompt); }
    save();
  };
  window.waiDevStatus = function (id, status) { const o = ensureData(); const rec = o.aiDevelopmentFactory.find(x => x.id === id); if (!rec) return; if (status === 'approved' && !isManager()) { toast('الاعتماد صلاحية مدير', 'warning'); return; } rec.status = status; if (status === 'approved') rec.approved_by = userName(); save(); renderPage(); };
  window.waiDevScan = function () {
    // pull broken routes from Route Health into the factory (deterministic detection)
    let added = 0;
    try {
      const rep = window.OctagonRouteHealth && window.OctagonRouteHealth.report();
      if (rep) {
        rep.nav.filter(x => !x.ok).forEach(x => { window.waiAddDevSuggestion({ title: 'إصلاح زر تنقل بلا صفحة: ' + x.label, category: 'bug', source: 'route_health', desc: 'الصفحة ' + x.page + ' بلا قسم مطابق' }); added++; });
        rep.functions.filter(x => !x.ok).forEach(x => { window.waiAddDevSuggestion({ title: 'دالة جوهرية مفقودة: ' + x.name, category: 'bug', source: 'route_health' }); added++; });
      }
    } catch (_) {}
    if (!added) toast('فحص النظام نظيف — لا مشاكل لإضافتها للمصنع ✅', 'success');
  };

  /* ════════════════ 14: AI tool registry ════════════════ */
  function defaultToolRegistry() {
    const T = (name, desc, risk, perm, cat, dryRun, enabled, approval) => ({ id: uid('tool'), name, description: desc, riskLevel: risk, requiredPermission: perm, category: cat, inputSchema: '{}', outputSchema: '{}', dryRunSupport: dryRun, auditLogging: true, approvalRequired: approval, enabled: enabled });
    return [
      T('read_workshop_state', 'قراءة حالة الورشة (طلبات/مكائن/مواد/جودة)', 'low', 'workshop.operator', 'read-only system data', true, true, false),
      T('generate_sop_draft', 'توليد مسودة SOP', 'low', 'workshop.supervisor', 'draft generation', true, true, false),
      T('generate_customer_message', 'صياغة رسالة زبون (مسودة فقط)', 'low', 'workshop.supervisor', 'customer message draft', true, true, false),
      T('generate_dev_prompt', 'توليد prompt تطوير', 'low', 'workshop.manager', 'development prompt generation', true, true, false),
      T('file_metadata_action', 'قراءة/كتابة بيانات وصفية للملفات (بدون محتوى ثنائي)', 'medium', 'workshop.manager', 'file metadata actions', true, false, true),
      T('browser_search', 'بحث/تصفح عبر harness معزول (مستقبلي)', 'high', 'system.admin', 'browser/search action', true, false, true),
      T('sandbox_computer_control', 'تحكم بالحاسوب داخل sandbox/VM (مستقبلي)', 'critical', 'system.admin', 'future sandbox computer control', true, false, true),
      T('apply_code_patch', 'تطبيق تعديل كود (محظور على النظام الحي)', 'critical', 'system.admin', 'development', true, false, true)
    ];
  }
  window.waiToolToggle = function (id) {
    const o = ensureData(); const t = o.aiToolRegistry.find(x => x.id === id); if (!t) return;
    if (!isManager()) { toast('تغيير الأدوات صلاحية مدير', 'warning'); return; }
    if (!t.enabled && (t.riskLevel === 'high' || t.riskLevel === 'critical')) { if (!confirm('تفعيل أداة عالية الخطورة «' + t.name + '»؟ تبقى محكومة بالموافقة والـ sandbox.')) return; }
    t.enabled = !t.enabled;
    if (typeof window.recordOmniHistoryEvent === 'function') { try { window.recordOmniHistoryEvent({ module: 'workshop_ai', source: 'tool_registry', action: t.enabled ? 'tool_enabled' : 'tool_disabled', summary: t.name }); } catch (_) {} }
    save(); renderPage();
  };

  /* ════════════════ 3: kiosk chat engine ════════════════ */
  let chatLog = [];
  function kioskRespond(text) {
    text = String(text || '').trim(); if (!text) return;
    chatLog.push({ who: 'user', text: text });
    const r = role();
    const worker = r === 'workshop.operator' || r === 'employee' || r === 'designer';
    const lc = text.toLowerCase();
    // permission guard: workers/customers cannot ask finance/payroll/salary
    if (/راتب|رواتب|salary|payroll|ربح|كلفة|مالي|finance|حساب الزبون/.test(lc) && !canSeeCosts()) {
      chatLog.push({ who: 'bot', text: 'عذراً، المعلومات المالية والرواتب غير متاحة لصلاحيتك. اسألني عن المهام، الطلبات، المواد، أو الجودة.' });
      renderKioskLog(); return;
    }
    let reply = null, actions = [];
    if (worker) { reply = workerAnswer(text); }
    else if (/صباح|ملخص|وضعي اليوم|شنو المتاخر|شنو المتأخر|brief|اليوم/.test(lc)) { reply = briefingText(briefing()); actions = [{ label: 'افتح مركز القيادة', fn: "switchPage('command_center')" }]; }
    else if (/ناقص|مواد|shortage|نواقص/.test(lc)) { const s = (O().materialReservations || []).filter(x => x.status === 'shortage'); reply = s.length ? ('مواد ناقصة:\n' + s.map(x => '• ' + ((x.materialSnapshot || {}).name) + ' (' + x.ref + ')').join('\n')) : 'لا مواد ناقصة ✅'; }
    else if (/مكين|طابور|machine|تعارض/.test(lc)) { const c = (WO() && WO().machineConflicts()) || []; reply = c.length ? ('تعارضات/ضغط المكائن:\n' + c.slice(0, 8).map(x => '• ' + x.text).join('\n')) : 'لا تعارض على المكائن ✅'; }
    else if (/مشكل|مشاكل|problem|issue/.test(lc)) { const oi = issues().filter(i => !['resolved', 'waived'].includes(i.status)); reply = oi.length ? ('مشاكل مفتوحة:\n' + oi.slice(0, 8).map(i => '• [' + i.severity + '] ' + i.title + ' (' + i.ref + ')').join('\n')) : 'لا مشاكل مفتوحة ✅'; }
    else if (/متاخر|متأخر|overdue|تاخير/.test(lc)) { const ov = jobOrders().filter(isOverdue); reply = ov.length ? ('طلبات متأخرة:\n' + ov.map(w => '• ' + w.ref + ' ' + w.title + ' (موعد ' + w.deadline + ')').join('\n')) : 'لا طلبات متأخرة ✅'; }
    else if (/تسليم|جاهز|deliver|ready/.test(lc)) { const rd = jobOrders().filter(w => w.state === 'ready_for_delivery'); reply = rd.length ? ('جاهز للتسليم:\n' + rd.map(w => '• ' + w.ref + ' ' + w.title).join('\n')) : 'لا طلبات جاهزة للتسليم الآن.'; }
    else if (/رسال|واتس|whatsapp|message|اعلام|أعلم الزبون/.test(lc)) { reply = 'لصياغة رسالة زبون، افتح «روح النظام ← رسائل الزبائن» أو من ملف أمر العمل. أكتب لي رقم الطلب وأجهز المسودة.'; actions = [{ label: 'مولّد رسائل الزبائن', fn: "switchPage('kiosk');setTimeout(function(){window.waiKioskTab&&window.waiKioskTab('message')},50)" }]; }
    else if (/sop|تعليم|اجراء|إجراء/.test(lc)) { reply = 'أكدر أولّد مسودة SOP من نوع الشغل والمواد والمكائن وأخطاء الجودة السابقة. افتح «توليد SOP».'; actions = [{ label: 'توليد SOP', fn: "switchPage('kiosk');setTimeout(function(){window.waiKioskTab&&window.waiKioskTab('sop')},50)" }]; }
    else {
      // try the LLM brain if present (safe — it only proposes), else generic help
      if (window.JarvisBrain && window.JarvisBrain.handle) {
        chatLog.push({ who: 'bot', text: '... أعالج طلبك' });
        renderKioskLog();
        try {
          window.JarvisBrain.handle(text).then(res => {
            chatLog[chatLog.length - 1] = { who: 'bot', text: (res && (res.speak || res.message)) || 'تم.' };
            renderKioskLog();
          }).catch(() => { chatLog[chatLog.length - 1] = { who: 'bot', text: 'اسألني عن: وضع اليوم، النواقص، المكائن، المشاكل، التسليمات، أو توليد SOP/رسالة.' }; renderKioskLog(); });
        } catch (_) { chatLog[chatLog.length - 1] = { who: 'bot', text: 'اسألني عن: وضع اليوم، النواقص، المكائن، المشاكل، التسليمات.' }; renderKioskLog(); }
        return;
      }
      reply = 'أنا روح النظام 🤖 اسألني: شنو وضعي اليوم؟ شنو ناقص؟ أي مكينة مضغوطة؟ شنو المشاكل؟ شنو الجاهز للتسليم؟';
    }
    chatLog.push({ who: 'bot', text: reply, actions: actions });
    renderKioskLog();
  }
  window.waiKioskSend = function () { const inp = document.getElementById('waiKioskInput'); if (!inp) return; const v = inp.value; inp.value = ''; kioskRespond(v); };
  window.waiKioskKey = function (ev) { if (ev && ev.key === 'Enter') { ev.preventDefault(); window.waiKioskSend(); } };
  window.waiKioskQuick = function (q) { kioskRespond(q); };
  // Real voice dictation into the kiosk input (speech-to-text).
  let waiRecog = null, waiListening = false;
  window.waiKioskMic = function (btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const inp = document.getElementById('waiKioskInput');
    if (!SR) { toast('🎤 المتصفح لا يدعم الإدخال الصوتي — اكتب سؤالك', 'warning'); return; }
    if (!inp) return;
    btn = btn || document.querySelector('.wai-mic');
    // toggle off if already listening
    if (waiListening && waiRecog) { try { waiRecog.stop(); } catch (_) {} return; }
    try { waiRecog = new SR(); } catch (_) { toast('تعذّر بدء الإدخال الصوتي', 'warning'); return; }
    const lang = (document.documentElement.getAttribute('lang') === 'en') ? 'en-US' : 'ar-SA';
    waiRecog.lang = lang;
    waiRecog.interimResults = true;
    waiRecog.continuous = false;
    waiRecog.onstart = function () { waiListening = true; if (btn) btn.classList.add('listening'); toast('🎤 أستمع... تكلّم الآن', 'info'); };
    waiRecog.onresult = function (e) {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      inp.value = txt;
    };
    waiRecog.onerror = function (e) {
      waiListening = false; if (btn) btn.classList.remove('listening');
      if (e && e.error === 'not-allowed') toast('🚫 صلاحية الميكروفون مرفوضة — فعّلها من المتصفح', 'warning');
      else if (e && e.error !== 'aborted') toast('تعذّر الإدخال الصوتي', 'warning');
    };
    waiRecog.onend = function () {
      waiListening = false; if (btn) btn.classList.remove('listening');
      // auto-send if we captured something
      if (inp.value.trim()) { setTimeout(() => { if (typeof window.waiKioskSend === 'function') window.waiKioskSend(); }, 150); }
    };
    try { waiRecog.start(); } catch (_) {}
  };
  // keep old name working (now wired to real dictation)
  window.waiMicPlaceholder = function () { window.waiKioskMic(); };

  /* ════════════════ render ════════════════ */
  let kioskTab = 'chat';
  window.waiKioskTab = function (t) { kioskTab = t; renderPage(); };

  function renderKioskLog() {
    const box = document.getElementById('waiChatLog'); if (!box) return;
    box.innerHTML = chatLog.map(m => '<div class="wai-msg ' + (m.who === 'user' ? 'user' : 'bot') + '">' + esc(m.text).replace(/\n/g, '<br>')
      + (m.actions && m.actions.length ? '<div class="wai-msg-actions">' + m.actions.map(a => '<button class="wai-btn mini" onclick="' + a.fn + '">' + esc(a.label) + '</button>').join('') + '</div>' : '')
      + '</div>').join('');
    box.scrollTop = box.scrollHeight;
  }
  function statusSummaryHtml() {
    const b = briefing(); const ps = providerStatus();
    const row = (l, v, cls) => '<div class="wai-status-row"><span>' + l + '</span><span class="wai-pill ' + (cls || 'muted') + '">' + v + '</span></div>';
    return '<div class="wai-side-card"><div class="wai-card-title">📊 حالة الورشة الآن</div>'
      + row('مستعجل اليوم', b.urgent.length, b.urgent.length ? 'warn' : 'ok')
      + row('متأخر', b.overdue.length, b.overdue.length ? 'bad' : 'ok')
      + row('مواد ناقصة', b.shortages.length, b.shortages.length ? 'bad' : 'ok')
      + row('مشاكل مفتوحة', b.openIssues.length, b.openIssues.length ? 'warn' : 'ok')
      + row('جاهز للتسليم', b.deliveriesToday.length, b.deliveriesToday.length ? 'info' : 'muted')
      + '</div>'
      + '<div class="wai-side-card"><div class="wai-card-title">🧠 مزوّد الذكاء</div>'
      + row('المزوّد', ps.provider, ps.provider === 'none' ? 'warn' : 'ai')
      + row('احتياطي حتمي', 'فعّال دائماً', 'ok')
      + row('الدماغ (Omni)', ps.brainLoaded ? 'محمّل' : 'احتياطي', ps.brainLoaded ? 'ok' : 'muted')
      + '</div>';
  }
  function kioskHtml() {
    const tabs = [['chat', '💬 المحادثة'], ['brief', '☀️ ملخص المدير'], ['sop', '📝 توليد SOP'], ['message', '📱 رسالة زبون'], ['memory', '🧠 ذاكرة الورشة']];
    let main = '';
    if (kioskTab === 'brief') main = briefHtml();
    else if (kioskTab === 'sop') main = sopHtml();
    else if (kioskTab === 'message') main = messageHtml();
    else if (kioskTab === 'memory') main = memoryHtml();
    else main = chatHtml();
    return '<div class="wai-toolbar">' + tabs.map(t => '<button class="wai-btn mini ' + (kioskTab === t[0] ? 'primary' : '') + '" onclick="waiKioskTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '</div>'
      + '<div class="wai-kiosk"><div>' + main + '</div><div>' + statusSummaryHtml() + '</div></div>';
  }
  function chatHtml() {
    if (!chatLog.length) chatLog = [{ who: 'bot', text: 'أهلاً، أنا روح النظام 🤖 — اسألني عن وضع الورشة، طلبك، أو شنو لازم تسوي هسه.' }];
    return '<div class="wai-chat-wrap"><div class="wai-chat-head">🤖 روح النظام</div>'
      + '<div class="wai-chat-log" id="waiChatLog"></div>'
      + '<div class="wai-quick">'
      + ['شنو وضعي اليوم؟', 'شنو ناقص؟', 'أي مكينة مضغوطة؟', 'شنو المشاكل المفتوحة؟', 'شنو الجاهز للتسليم؟'].map(q => '<button onclick="waiKioskQuick(\'' + q + '\')">' + q + '</button>').join('')
      + '</div>'
      + '<div class="wai-chat-input-row"><button class="wai-mic" onclick="waiKioskMic(this)" title="إدخال صوتي">🎤</button>'
      + '<input class="wai-chat-input" id="waiKioskInput" placeholder="اكتب سؤالك للنظام..." onkeydown="waiKioskKey(event)" autofocus>'
      + '<button class="wai-btn primary" onclick="waiKioskSend()">إرسال</button></div></div>';
  }
  function briefHtml() {
    const b = briefing();
    const box = (title, arr, cls, render2, empty) => '<div class="wai-brief-box ' + (arr.length ? cls : '') + '"><div class="wai-brief-box-title">' + title + '<span class="wai-pill ' + (arr.length ? cls : 'ok') + '">' + arr.length + '</span></div>'
      + (arr.length ? arr.slice(0, 5).map(render2).join('') : '<div class="wai-brief-empty">لا شيء ✅</div>') + '</div>';
    const woLine = w => '<div class="wai-brief-line" onclick="OctagonWorkOrders.open(\'' + w.id + '\')"><span>' + esc(w.ref) + ' ' + esc(String(w.title).slice(0, 18)) + '</span><span class="wai-muted">' + esc(stateAr(w.state)) + '</span></div>';
    return '<div class="wai-card"><div class="wai-card-title">☀️ ملخص أومني الصباحي <span class="wai-pill ai">حتمي من بيانات حقيقية</span></div>'
      + '<div class="wai-brief-grid">'
      + box('🔥 مستعجل/اليوم', b.urgent, 'warn', woLine)
      + box('⏰ متأخر', b.overdue, 'danger', woLine)
      + box('⛔ معاق', b.blocked, 'danger', woLine)
      + box('📦 مواد ناقصة', b.shortages, 'danger', r => '<div class="wai-brief-line"><span>' + esc((r.materialSnapshot || {}).name) + '</span><span class="wai-muted">' + esc(r.ref) + '</span></div>')
      + box('🏭 تعارض مكائن', b.conflicts, 'warn', c => '<div class="wai-brief-line"><span>' + esc(String(c.text).slice(0, 32)) + '</span></div>')
      + box('🧪 فشل جودة', b.qcFails, 'danger', woLine)
      + box('🔁 إعادة عمل', b.rework, 'warn', woLine)
      + box('🚚 جاهز للتسليم', b.deliveriesToday, 'info', woLine)
      + '</div>'
      + '<div class="wai-suggest"><div class="wai-card-title">🎯 القرارات المقترحة اليوم</div>'
      + b.actions.map(a => '<div class="wai-suggest-item"><span>◦ ' + esc(a.text) + '</span>' + (a.page ? '<button class="wai-btn mini" onclick="switchPage(\'' + a.page + '\')">افتح</button>' : '') + '</div>').join('')
      + '</div>'
      + '<div class="wai-toolbar" style="margin-top:10px"><button class="wai-btn" onclick="waiCopyBrief()">📋 نسخ الملخص</button></div>'
      + '</div>';
  }
  window.waiCopyBrief = function () { const t = briefingText(briefing()); try { navigator.clipboard.writeText(t).then(() => toast('نُسخ الملخص 📋', 'success')); } catch (_) { window.prompt('انسخ:', t); } };
  function sopHtml() {
    const drafts = sops().filter(s => s.drafted_by_ai);
    return '<div class="wai-card"><div class="wai-card-title">📝 مولّد مسودات SOP بالذكاء الصناعي</div>'
      + '<div class="wai-grid">'
      + '<div class="wai-field"><label>أمر عمل (اختياري — يملأ المواد/المكائن)</label><select id="waiSopWo"><option value="">—</option>' + jobOrders().map(w => '<option value="' + esc(w.ref) + '">' + esc(w.ref + ' — ' + w.title) + '</option>').join('') + '</select></div>'
      + '<div class="wai-field"><label>نوع العملية</label><input id="waiSopType" placeholder="مثال: لوحة أكريلك"></div>'
      + '</div>'
      + '<div class="wai-toolbar" style="margin-top:8px"><button class="wai-btn primary" onclick="waiGenerateSop()">توليد SOP</button>'
      + (lastSopDraft ? '<button class="wai-btn ok" onclick="waiSaveSopDraft()">حفظ كمسودة (تحتاج اعتماد)</button>' : '') + '</div>'
      + (lastSopDraft ? '<div class="wai-sop-preview" style="margin-top:10px">' + esc(sopToText(lastSopDraft)).replace(/\n/g, '<br>') + '</div>' : '')
      + '</div>'
      + '<div class="wai-card"><div class="wai-card-title">مسودات SOP من الذكاء (' + drafts.length + ')</div>'
      + (drafts.length ? '<div class="wai-table-wrap"><table class="wai-table"><thead><tr><th>العنوان</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>'
        + drafts.slice(0, 20).map(s => '<tr><td>' + esc(s.title) + '</td><td><span class="wai-pill ' + (s.status === 'approved' ? 'ok' : s.status === 'pending_review' ? 'warn' : 'muted') + '">' + ({ draft: 'مسودة', pending_review: 'بانتظار المراجعة', approved: 'معتمد', archived: 'مؤرشف' }[s.status] || s.status) + '</span></td>'
          + '<td>' + (s.status === 'draft' ? '<button class="wai-btn mini" onclick="waiSopStatus(\'' + s.id + '\',\'pending_review\')">إرسال للمراجعة</button> ' : '')
          + (s.status === 'pending_review' && isManager() ? '<button class="wai-btn mini ok" onclick="waiSopStatus(\'' + s.id + '\',\'approved\')">اعتماد</button> ' : '')
          + (s.status !== 'archived' ? '<button class="wai-btn mini ghost" onclick="waiSopStatus(\'' + s.id + '\',\'archived\')">أرشفة</button>' : '') + '</td></tr>').join('')
        + '</tbody></table></div>' : '<div class="wai-empty">لا مسودات بعد</div>')
      + '</div>';
  }
  function messageHtml() {
    return '<div class="wai-card"><div class="wai-card-title">📱 مولّد رسائل الزبائن (واتساب)</div>'
      + '<div class="wai-grid">'
      + '<div class="wai-field"><label>أمر العمل</label><select id="waiMsgWo"><option value="">—</option>' + jobOrders().map(w => '<option value="' + esc(w.ref) + '">' + esc(w.ref + ' — ' + ((w.customerSnapshot || {}).name || '')) + '</option>').join('') + '</select></div>'
      + '<div class="wai-field"><label>نوع الرسالة</label><select id="waiMsgType">' + Object.keys(MSG_TYPES).map(k => '<option value="' + k + '">' + MSG_TYPES[k] + '</option>').join('') + '</select></div>'
      + '</div>'
      + '<div class="wai-toolbar" style="margin-top:8px"><button class="wai-btn primary" onclick="waiGenMessage()">توليد الرسالة</button></div>'
      + (lastMsg.text ? '<div class="wai-msgbox">' + esc(lastMsg.text) + '</div>'
        + '<div class="wai-toolbar" style="margin-top:8px"><button class="wai-btn" onclick="waiCopyMessage()">📋 نسخ</button>'
        + '<button class="wai-btn ok" onclick="waiSaveMessageDraft(false)">حفظ مسودة بالملف</button>'
        + '<button class="wai-btn" onclick="waiSaveMessageDraft(true)">سجّل أني أرسلتها يدوياً</button></div>'
        + '<div class="wai-hint">⚠️ لا يُرسل تلقائياً — للإرسال الفعلي تحتاج ربط WhatsApp API + موافقة.</div>' : '')
      + '</div>';
  }
  function memoryHtml() {
    const mem = (O().workshopMemory || []).filter(m => m.is_active !== false);
    return '<div class="wai-card"><div class="wai-card-title">🧠 ذاكرة الورشة <button class="wai-btn mini primary" onclick="waiDetectMemory()">تحديث الأنماط</button></div>'
      + (mem.length ? '<div class="wai-table-wrap"><table class="wai-table"><thead><tr><th>النوع</th><th>النمط</th><th>التكرار</th><th>التوصية</th><th>مُراجَع</th></tr></thead><tbody>'
        + mem.slice(0, 30).map(m => '<tr><td><span class="wai-pill ' + (m.severity === 'high' ? 'bad' : 'warn') + '">' + esc(m.type) + '</span></td><td>' + esc(m.title) + '<div class="wai-muted">' + esc(m.summary || '') + '</div></td><td>' + (m.count || 1) + '</td><td class="wai-muted">' + esc(m.recommendation || '') + '</td>'
          + '<td><button class="wai-btn mini ' + (m.reviewed_by_manager ? 'ok' : 'ghost') + '" onclick="waiMemReview(\'' + m.id + '\')">' + (m.reviewed_by_manager ? '✓ مُراجَع' : 'تأشير') + '</button></td></tr>').join('')
        + '</tbody></table></div>' : '<div class="wai-empty">لا أنماط بعد — اضغط «تحديث الأنماط»</div>')
      + '</div>';
  }

  function queueHtml() {
    const q = actionQueue();
    const stAr = { pending: 'بانتظار', approved: 'معتمد', rejected: 'مرفوض', executed: 'نُفّذ', failed: 'فشل' };
    return '<div class="wai-toolbar"><button class="wai-btn primary" onclick="OctagonWorkshopAI.open(\'kiosk\')">🤖 روح النظام</button><span class="spacer"></span><button class="wai-btn mini" onclick="waiQueueDemo()">+ اقتراح تجريبي</button></div>'
      + '<div class="wai-card"><div class="wai-card-title">⚙️ طابور أوامر الذكاء الصناعي <span class="wai-hint">الإجراءات الحساسة لا تُنفّذ تلقائياً — موافقة فقط</span></div>'
      + (q.length ? '<div class="wai-table-wrap"><table class="wai-table"><thead><tr><th>الإجراء</th><th>السبب</th><th>الخطورة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>'
        + q.slice(0, 40).map(a => { const r = riskOf(a); return '<tr><td><b>' + esc(a.title || a.actionType || '—') + '</b><div class="wai-muted">' + esc(a.actionType || a.actionId || '') + '</div></td>'
          + '<td class="wai-muted">' + esc(a.reason || a.summary || '') + '</td>'
          + '<td><span class="wai-risk ' + r + '">' + ({ low: 'منخفض', medium: 'متوسط', high: 'عالي', critical: 'حرج' }[r] || r) + '</span></td>'
          + '<td><span class="wai-pill ' + (a.status === 'executed' || a.status === 'approved' ? 'ok' : a.status === 'rejected' || a.status === 'failed' ? 'bad' : 'warn') + '">' + (stAr[a.status] || a.status) + '</span></td>'
          + '<td>' + (a.status === 'pending' ? '<button class="wai-btn mini ok" onclick="waiQueueApprove(\'' + a.id + '\')">موافقة</button> <button class="wai-btn mini danger" onclick="waiQueueReject(\'' + a.id + '\')">رفض</button>' : (a.approvedBy ? '<span class="wai-muted">' + esc(a.approvedBy) + '</span>' : '—')) + '</td></tr>'; }).join('')
        + '</tbody></table></div>' : '<div class="wai-empty">الطابور فارغ — اقتراحات الذكاء تظهر هنا للموافقة</div>')
      + '<div class="wai-hint" style="margin-top:8px">قواعد الخطورة: منخفض → موافقة مشرف وتنفيذ آمن تلقائي · عالي/حرج (مالية، رواتب، صرف مخزون، تجاوز جودة، إغلاق طلب، إرسال واتساب، تعديل كود) → موافقة مدير وتنفيذ يدوي فقط.</div>'
      + '</div>';
  }
  function factoryHtml() {
    const recs = (O().aiDevelopmentFactory || []);
    return '<div class="wai-toolbar"><button class="wai-btn primary" onclick="waiDevScan()">🔍 افحص النظام وأضف المشاكل</button><span class="spacer"></span></div>'
      + '<div class="wai-card"><div class="wai-card-title">🏗️ مصنع تطوير النظام <span class="wai-hint">لا يعدّل الكود الحي — يولّد اقتراحات و prompts للمراجعة</span></div>'
      + '<div class="wai-grid">'
      + '<div class="wai-field full"><label>عنوان الاقتراح/المشكلة</label><input id="waiDevTitle" placeholder="مثال: إضافة تقرير ربحية شهري"></div>'
      + '<div class="wai-field"><label>الفئة</label><select id="waiDevCat"><option value="feature">ميزة</option><option value="bug">خطأ</option><option value="improvement">تحسين</option><option value="idea">فكرة</option></select></div>'
      + '<div class="wai-field"><label>الأولوية</label><select id="waiDevPriority"><option value="normal">عادية</option><option value="high">عالية</option><option value="low">منخفضة</option></select></div>'
      + '<div class="wai-field"><label>الخطورة</label><select id="waiDevRisk"><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option></select></div>'
      + '<div class="wai-field full"><label>الوصف</label><input id="waiDevDesc" placeholder="وصف قصير لما تريده"></div>'
      + '</div><button class="wai-btn primary" style="margin-top:8px" onclick="waiAddDevSuggestion()">إضافة + توليد prompt</button></div>'
      + '<div class="wai-card"><div class="wai-card-title">الاقتراحات (' + recs.length + ')</div>'
      + (recs.length ? recs.slice(0, 25).map(r => '<div style="border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:10px;margin-bottom:8px">'
        + '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b>' + esc(r.title) + '</b><span><span class="wai-pill ' + (r.category === 'bug' ? 'bad' : 'info') + '">' + esc(r.category) + '</span> <span class="wai-pill ' + (r.status === 'approved' ? 'ok' : 'muted') + '">' + esc(r.status) + '</span></span></div>'
        + (r.description ? '<div class="wai-muted" style="margin-top:4px">' + esc(r.description) + '</div>' : '')
        + '<div class="wai-toolbar" style="margin-top:8px"><button class="wai-btn mini" onclick="waiDevPrompt(\'' + r.id + '\')">📋 نسخ الـ prompt</button>'
        + (r.status !== 'approved' && isManager() ? '<button class="wai-btn mini ok" onclick="waiDevStatus(\'' + r.id + '\',\'approved\')">اعتماد للتطوير</button>' : '')
        + '<button class="wai-btn mini ghost" onclick="waiDevStatus(\'' + r.id + '\',\'archived\')">أرشفة</button></div>'
        + '</div>').join('') : '<div class="wai-empty">لا اقتراحات بعد</div>')
      + '</div>';
  }
  function toolsHtml() {
    const tools = (O().aiToolRegistry || []);
    return '<div class="wai-card"><div class="wai-card-title">🧰 سجل أدوات الذكاء الصناعي <span class="wai-hint">الأدوات الخطرة معطّلة افتراضياً وتعمل داخل sandbox مع موافقة</span></div>'
      + '<div class="wai-table-wrap"><table class="wai-table"><thead><tr><th>الأداة</th><th>الفئة</th><th>الخطورة</th><th>الصلاحية</th><th>موافقة</th><th>الحالة</th></tr></thead><tbody>'
      + tools.map(t => '<tr><td><b>' + esc(t.name) + '</b><div class="wai-muted">' + esc(t.description) + '</div></td>'
        + '<td class="wai-muted">' + esc(t.category) + '</td>'
        + '<td><span class="wai-risk ' + t.riskLevel + '">' + ({ low: 'منخفض', medium: 'متوسط', high: 'عالي', critical: 'حرج' }[t.riskLevel] || t.riskLevel) + '</span></td>'
        + '<td class="wai-muted">' + esc(t.requiredPermission) + '</td>'
        + '<td>' + (t.approvalRequired ? '<span class="wai-pill warn">مطلوبة</span>' : '<span class="wai-pill ok">لا</span>') + '</td>'
        + '<td><button class="wai-btn mini ' + (t.enabled ? 'ok' : 'ghost') + '" onclick="waiToolToggle(\'' + t.id + '\')">' + (t.enabled ? '● مُفعّل' : '○ معطّل') + '</button></td></tr>').join('')
      + '</tbody></table></div>'
      + '<div class="wai-hint" style="margin-top:8px">قواعد: كل تحكم بالحاسوب يجري داخل sandbox/VM لاحقاً · التحكم بالـ PC الحي يحتاج موافقة صريحة · كل إجراء يُسجَّل · إرسال الملفات يحتاج موافقة دائماً · تعديل الكود لا يحدث مباشرة على النظام الحي.</div>'
      + '</div>';
  }

  function renderPage() {
    const map = { kiosk: ['workshopKioskBody', kioskHtml], ai_queue: ['aiQueueBody', queueHtml], ai_factory: ['aiFactoryBody', factoryHtml], ai_tools: ['aiToolsBody', toolsHtml] };
    Object.keys(map).forEach(k => { const el = document.getElementById(map[k][0]); if (el && (window.currentPage === k || el.offsetParent !== null || !el.dataset.woRendered)) { /* render on demand below */ } });
    const cur = window.currentPage;
    if (map[cur]) { const el = document.getElementById(map[cur][0]); if (el) el.innerHTML = map[cur][1](); if (cur === 'kiosk' && kioskTab === 'chat') renderKioskLog(); }
  }

  /* ════════════════ page wiring ════════════════ */
  function activate(page, bodyId, renderFn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('page' + page); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('nav' + page); if (nav) nav.classList.add('active');
    window.currentPage = pageKeyOf(page);
    ensureData();
    const el = document.getElementById(bodyId); if (el) el.innerHTML = renderFn();
    if (pageKeyOf(page) === 'kiosk' && kioskTab === 'chat') renderKioskLog();
  }
  function pageKeyOf(p) { return ({ Kiosk: 'kiosk', AiQueue: 'ai_queue', AiFactory: 'ai_factory', AiTools: 'ai_tools' })[p] || p; }
  const PAGES = [
    { key: 'kiosk', cap: 'Kiosk', body: 'workshopKioskBody', render: kioskHtml },
    { key: 'ai_queue', cap: 'AiQueue', body: 'aiQueueBody', render: queueHtml },
    { key: 'ai_factory', cap: 'AiFactory', body: 'aiFactoryBody', render: factoryHtml },
    { key: 'ai_tools', cap: 'AiTools', body: 'aiToolsBody', render: toolsHtml }
  ];
  function wireSwitch() {
    if (window.__waiWrapped) return;
    if (typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      const p = PAGES.find(x => x.key === page);
      if (p) { try { activate(p.cap, p.body, p.render); } catch (e) { console.warn('WAI render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__waiWrapped = true;
  }
  function wireJarvis() {
    try {
      if (!window.JarvisBrain || !window.JarvisBrain.tools) return false;
      const T = window.JarvisBrain.tools;
      if (T.morning_briefing) return true;
      T.morning_briefing = { risk: 'safe', desc_en: 'Manager morning briefing from real workshop data.', desc_ar: 'ملخص المدير الصباحي من بيانات الورشة.', params: {}, run: function () { return { ok: true, message: briefingText(briefing()) }; } };
      T.workshop_status = { risk: 'safe', desc_en: 'Quick workshop status.', desc_ar: 'حالة الورشة المختصرة.', params: {}, run: function () { const b = briefing(); return { ok: true, message: 'متأخر ' + b.overdue.length + ' · ناقص ' + b.shortages.length + ' · مشاكل ' + b.openIssues.length + ' · جاهز ' + b.deliveriesToday.length }; } };
      return true;
    } catch (_) { return false; }
  }
  function init() {
    ensureData(); wireSwitch(); wireJarvis();
    let tries = 0; const t = setInterval(() => { tries++; wireSwitch(); wireJarvis(); try { ensureData(); } catch (_) {} if (window.__waiWrapped || tries > 40) clearInterval(t); }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonWorkshopAI = {
    briefing, briefingText, workerAnswer, buildWorkshopAiContext, providerStatus,
    generateSopDraft, customerMessage, ensureData,
    open: function (page) { try { window.switchPage(page || 'kiosk'); } catch (_) {} },
    version: '1.0'
  };
  window.PentagonWorkshopAI = window.OctagonWorkshopAI;
})();
