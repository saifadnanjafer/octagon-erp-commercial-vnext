/**
 * OCTAGON ERP — WORKSHOP UNIFIED EXECUTION CORE (أوامر العمل).
 * The connective tissue of the workshop: one work-order file drives the whole chain
 *   intake → work order → op-pack task generation → material reservation → machine queue
 *   → SOP → QC gate → rework loop → delivery gate → costing/profit → command-center alerts
 *   → audit timeline.
 * ADD-ONLY: zero app.js edits. Orchestrates EXISTING primitives:
 *   createTaskInSelectedSpace, omni.kanban.cards, omni.opPacks, omni.qcRecords,
 *   machine.queue[], material.reservedQty + recordStockMovement('reserved'|'released'|'out'),
 *   createOmniNotification, omni.requests, recordOmniHistoryEvent, AuditService,
 *   getAiControl().actionQueue, JarvisBrain.tools, finance.customers.
 * New collections (golden fields, never hard-deleted): omni.jobOrders (customer-
 *   facing workshop job orders — distinct from MRP's omni.workOrders machine runs),
 *   omni.workOrderEvents, omni.materialReservations, omni.workOrderIssues.
 */
(function () {
  'use strict';

  /* ════════════════════ helpers ════════════════════ */
  function O() {
    if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni;
    if (typeof window.ensureOmni === 'function') { try { window.ensureOmni(); return omni; } catch (_) {} }
    return null;
  }
  function FIN() {
    try { if (typeof window.ensureFinance === 'function') window.ensureFinance(); } catch (_) {}
    try { if (typeof finance !== 'undefined' && finance) return finance; } catch (_) {}
    return null;
  }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function money(n) { n = Number(n); return isFinite(n) ? Math.round(n) : 0; }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function orgName() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon'; }
  function todayIso() { try { if (typeof window.todayISO === 'function') return window.todayISO(); } catch (_) {} return new Date().toISOString().slice(0, 10); }
  function nowIso() { return new Date().toISOString(); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function checked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.getCurrentUser) { const u = PentagonAuth.getCurrentUser(); if (u && u.name) return u.name; if (u && u.id) return u.id; } } catch (_) {}
    return 'system';
  }
  function userGroups() {
    try {
      if (window.PermissionService && window.PentagonAuth) {
        const g = window.PermissionService.resolveGroups(window.PentagonAuth.getCurrentUser());
        if (Array.isArray(g)) return g;
      }
    } catch (_) {}
    return ['system.admin']; // dev-open fallback (matches checkPage default-open behavior)
  }
  function isManager() { const g = userGroups(); return g.includes('system.admin') || g.includes('workshop.manager'); }
  function canSeeCosts() { const g = userGroups(); return isManager() || g.includes('finance.user') || g.includes('workshop.supervisor'); }
  function customers() { const f = FIN(); return (f && Array.isArray(f.customers)) ? f.customers : []; }
  function materials() { const o = O(); return (o && Array.isArray(o.materials)) ? o.materials : []; }
  function machines() { const o = O(); return (o && Array.isArray(o.machines)) ? o.machines : []; }
  function sops() { const o = O(); return (o && Array.isArray(o.sops)) ? o.sops : []; }
  function opPacks() { const o = O(); return (o && Array.isArray(o.opPacks)) ? o.opPacks : []; }
  function allTasks() {
    try { if (typeof window.getAllTaskManagerTasks === 'function') return window.getAllTaskManagerTasks(true).map(x => x.task).filter(Boolean); } catch (_) {}
    return [];
  }
  function taskDone(t) { return ['done', 'Done', 'مكتمل', 'completed'].includes(String(t && t.status || '')); }
  function availableQty(mat) {
    try { if (typeof window.getMaterialAvailableQty === 'function') return Number(window.getMaterialAvailableQty(mat)) || 0; } catch (_) {}
    return Math.max(0, (Number(mat.stock) || 0) - (Number(mat.reservedQty) || 0));
  }
  function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 864e5); }

  /* ════════════════════ constants ════════════════════ */
  const STATES = ['draft', 'quoted', 'approved', 'planned', 'materials_reserved', 'in_production', 'quality_check', 'rework', 'ready_for_delivery', 'delivered', 'closed', 'cancelled'];
  const STATE_AR = {
    draft: 'مسودة', quoted: 'مسعّر', approved: 'موافق عليه', planned: 'مخطط',
    materials_reserved: 'المواد محجوزة', in_production: 'قيد التنفيذ', quality_check: 'فحص الجودة',
    rework: 'إعادة عمل', ready_for_delivery: 'جاهز للتسليم', delivered: 'تم التسليم',
    closed: 'مغلق', cancelled: 'ملغي'
  };
  const TRANSITIONS = {
    draft: ['quoted', 'approved', 'cancelled'],
    quoted: ['approved', 'draft', 'cancelled'],
    approved: ['planned', 'cancelled'],
    planned: ['materials_reserved', 'in_production', 'cancelled'],
    materials_reserved: ['in_production', 'planned', 'cancelled'],
    in_production: ['quality_check', 'rework', 'cancelled'],
    quality_check: ['ready_for_delivery', 'rework', 'in_production'],
    rework: ['in_production', 'quality_check'],
    ready_for_delivery: ['delivered', 'in_production'],
    delivered: ['closed'],
    closed: [],
    cancelled: ['draft']
  };
  const JOB_TYPES = [
    { id: 'acrylic', name: 'لوحة أكريلك', icon: '💡', packMatch: ['acrylic', 'أكريلك'], qc: 'acrylic' },
    { id: 'foam', name: 'فوم بورد', icon: '📐', packMatch: ['foam', 'فوم'], qc: 'generic' },
    { id: 'sticker', name: 'ستيكر / فينيل', icon: '🎞️', packMatch: ['vinyl', 'فينيل', 'sticker', 'ستيكر'], qc: 'vinyl' },
    { id: 'cnc', name: 'CNC راوتر', icon: '🪚', packMatch: ['cnc', 'راوتر', 'router'], qc: 'cnc' },
    { id: 'laser', name: 'قص ليزر', icon: '🔦', packMatch: ['laser', 'ليزر'], qc: 'cnc' },
    { id: 'print3d', name: 'طباعة 3D', icon: '🧊', packMatch: ['3d', 'طباعة ثلاثية', 'print'], qc: 'generic' },
    { id: 'booth', name: 'جناح معرض', icon: '🏗️', packMatch: ['booth', 'جناح', 'معرض'], qc: 'generic' },
    { id: 'outdoor', name: 'تركيب خارجي', icon: '🏙️', packMatch: ['outdoor', 'خارجي'], qc: 'generic' },
    { id: 'custom', name: 'خاص / آخر', icon: '🛠️', packMatch: [], qc: 'generic' }
  ];
  const QC_TEMPLATES = {
    vinyl: ['الأبعاد صحيحة', 'الألوان مطابقة', 'لا يوجد خدش أو فقاعات', 'القص نظيف', 'التغليف صحيح'],
    acrylic: ['القص نظيف', 'الحواف معالجة', 'اللاصق نظيف', 'الإضاءة تعمل إذا موجودة', 'المقاس مطابق'],
    cnc: ['السمك صحيح', 'الحفر مطابق', 'لا يوجد كسر', 'التشطيب نظيف'],
    generic: ['المقاسات مطابقة للطلب', 'الجودة العامة مقبولة', 'لا أضرار ظاهرة', 'التغليف سليم']
  };
  const DEFAULT_STEPS = [
    { title: 'مراجعة التصميم', type: 'design', minutes: 30 },
    { title: 'تحضير المواد', type: 'material', minutes: 30 },
    { title: 'تنفيذ القص / الإنتاج', type: 'machine', minutes: 90 },
    { title: 'تنظيف الحواف والتشطيب', type: 'task', minutes: 45 },
    { title: 'تجميع', type: 'assembly', minutes: 60 },
    { title: 'فحص الجودة النهائي', type: 'qc', minutes: 20 },
    { title: 'تغليف وتجهيز التسليم', type: 'delivery', minutes: 20 }
  ];
  const DELIVERY_TYPES = { pickup: 'استلام من الورشة', delivery: 'توصيل الورشة', install: 'تركيب خارجي' };
  const ISSUE_SOURCES = { qc: 'جودة', material: 'مواد', machine: 'مكينة', customer: 'زبون', design: 'تصميم', delivery: 'تسليم' };
  const RES_STATUS_AR = { not_required: 'غير مطلوب', draft: 'مسودة', reserved: 'محجوزة', partially_reserved: 'محجوزة جزئياً', shortage: 'نقص', released: 'محرّرة', consumed: 'مستهلكة' };

  /* ════════════════════ data layer ════════════════════ */
  function ensureData() {
    const o = O(); if (!o) return null;
    // omni.workOrders is ALREADY OWNED by the MRP layer (machine-operation runs:
    // machineId/plannedMinutes/actualMinutes). We use omni.jobOrders for our
    // customer-facing workshop job orders (ref `WO-YYYY-NNNN`, full state machine).
    // Two distinct concepts — both must keep working.
    if (!Array.isArray(o.jobOrders)) o.jobOrders = [];
    // One-time, idempotent migration: pull any of OUR records that landed in the
    // shared omni.workOrders during early dev — identifiable by the customerSnapshot
    // object (MRP records never have it).
    if (Array.isArray(o.workOrders) && !o.__jobOrdersMigrated) {
      const mine = o.workOrders.filter(w => w && w.customerSnapshot && typeof w.customerSnapshot === 'object');
      if (mine.length) {
        mine.forEach(w => { if (!o.jobOrders.some(j => j.id === w.id)) o.jobOrders.push(w); });
        o.workOrders = o.workOrders.filter(w => !(w && w.customerSnapshot && typeof w.customerSnapshot === 'object'));
        console.log('[OctagonWorkOrders] migrated ' + mine.length + ' job orders out of MRP workOrders array');
      }
      o.__jobOrdersMigrated = true;
    }
    if (!Array.isArray(o.workOrderEvents)) o.workOrderEvents = [];
    if (!Array.isArray(o.materialReservations)) o.materialReservations = [];
    if (!Array.isArray(o.workOrderIssues)) o.workOrderIssues = [];
    // Cross-module: ensure POS sales array exists even before POS page renders, so
    // shared analytics + Route Health see it as initialized from the start.
    if (!Array.isArray(o.posSales)) o.posSales = [];
    if (!o.workOrderSettings || typeof o.workOrderSettings !== 'object') o.workOrderSettings = {};
    const s = o.workOrderSettings;
    if (typeof s.laborRatePerHour !== 'number') s.laborRatePerHour = 10000;
    if (typeof s.overheadPct !== 'number') s.overheadPct = 10;
    if (typeof s.wastePct !== 'number') s.wastePct = 5;
    if (typeof s.weakMarginPct !== 'number') s.weakMarginPct = 10;
    if (typeof s.approvalAbove !== 'number') s.approvalAbove = 500000;
    return o;
  }
  function WOs() {
    ensureData();
    const list = O().jobOrders.filter(w => w.is_active !== false);
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getWO(id) { ensureData(); return O().jobOrders.find(w => w.id === id || w.ref === id) || null; }
  function woReservations(woId) { ensureData(); return O().materialReservations.filter(r => r.workOrderId === woId && r.is_active !== false); }
  function woIssues(woId) { ensureData(); return O().workOrderIssues.filter(i => i.workOrderId === woId && i.is_active !== false); }
  function woEvents(woId) { ensureData(); return O().workOrderEvents.filter(e => e.workOrderId === woId); }
  function woTasks(wo) { return allTasks().filter(t => t.workOrderId === wo.id); }
  function woQcRecords(wo) { const o = O(); return ((o && o.qcRecords) || []).filter(q => (q.sourceType === 'work_order' && q.sourceId === wo.id) || (wo.qcRecordIds || []).includes(q.id)); }
  function nextRef() {
    const year = new Date().getFullYear();
    const n = O().jobOrders.filter(w => String(w.ref || '').includes('WO-' + year)).length + 1;
    return 'WO-' + year + '-' + String(n).padStart(4, '0');
  }
  function golden(rec) {
    rec.created_at = rec.created_at || nowIso();
    rec.created_by = rec.created_by || userName();
    rec.updated_at = nowIso();
    rec.updated_by = userName();
    if (rec.is_active === undefined) rec.is_active = true;
    return rec;
  }
  function touch(rec) { rec.updated_at = nowIso(); rec.updated_by = userName(); }

  /* audit: per-WO timeline + global history ledger + AuditService */
  function woEvent(wo, type, text, severity, data) {
    const o = ensureData(); if (!o) return;
    o.workOrderEvents.push({ id: uid('woev'), workOrderId: wo.id, type: type, text: text, severity: severity || 'info', byUser: userName(), at: nowIso(), data: data || {} });
    if (o.workOrderEvents.length > 8000) o.workOrderEvents = o.workOrderEvents.slice(-8000);
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'work_orders', source: 'work_orders', action: type, summary: wo.ref + ': ' + text, payload: { workOrderId: wo.id } }); } catch (_) {}
    }
    try { if (window.AuditService && window.AuditService.createEvent) window.AuditService.createEvent('work_order.' + type, wo.id, { text: text }); } catch (_) {}
  }
  function notify(title, message, severity, woId) {
    if (typeof window.createOmniNotification === 'function') {
      try { window.createOmniNotification({ type: 'work_order', title: title, message: message, sourcePage: 'work_orders', sourceType: 'work_order', sourceId: woId || '', severity: severity || 'info', actionPage: 'work_orders' }); } catch (_) {}
    }
  }

  /* ════════════════════ state machine ════════════════════ */
  function gateReadyForDelivery(wo) {
    const reasons = [];
    if (wo.qcRequired) {
      const recs = woQcRecords(wo);
      if (!recs.length) reasons.push('لا يوجد فحص جودة مسجّل بعد');
      else {
        if (recs.some(q => q.result === 'fail' && q.reworkStatus !== 'resolved')) reasons.push('يوجد فحص جودة فاشل غير معالج');
        if (recs.some(q => !q.result || q.result === 'pending')) reasons.push('فحص جودة لم يُستكمل بعد');
      }
    }
    const shortages = woReservations(wo.id).filter(r => r.required !== false && r.status !== 'consumed' && (Number(r.requiredQty) - Number(r.reservedQty || 0) - Number(r.consumedQty || 0)) > 0.0001 && !['released', 'not_required'].includes(r.status));
    if (shortages.length) reasons.push('مواد مطلوبة ناقصة: ' + shortages.map(r => (r.materialSnapshot && r.materialSnapshot.name) || r.materialId).join('، '));
    const pend = woTasks(wo).filter(t => t.mandatory !== false && !taskDone(t));
    if (pend.length) reasons.push(pend.length + ' مهمة إلزامية غير مكتملة');
    const blocking = woIssues(wo.id).filter(i => i.blocking && !['resolved', 'waived'].includes(i.status));
    if (blocking.length) reasons.push('مشكلة معيقة مفتوحة: ' + blocking.map(i => i.title).join('، '));
    return { ok: !reasons.length, reasons: reasons };
  }
  function gateDelivered(wo) {
    const reasons = [];
    const g = gateReadyForDelivery(wo);
    if (!g.ok) reasons.push.apply(reasons, g.reasons);
    const dc = wo.deliveryChecklist || {};
    if (!dc.packaging) reasons.push('التغليف غير مؤكد');
    if (!dc.person) reasons.push('لم يُحدد مسؤول التسليم');
    return { ok: !reasons.length, reasons: reasons };
  }
  function canTransition(wo, to) { return (TRANSITIONS[wo.state] || []).includes(to); }

  window.woTransition = function (woId, to) {
    const wo = getWO(woId); if (!wo) return false;
    if (!STATES.includes(to)) return false;
    if (!canTransition(wo, to)) {
      toast('انتقال غير مسموح: من «' + STATE_AR[wo.state] + '» إلى «' + STATE_AR[to] + '». المسار الصحيح: ' + (TRANSITIONS[wo.state] || []).map(s => STATE_AR[s]).join(' / '), 'error');
      return false;
    }
    if (to === 'ready_for_delivery') {
      const g = gateReadyForDelivery(wo);
      if (!g.ok) { toast('لا يمكن اعتباره جاهزاً للتسليم:\n• ' + g.reasons.join('\n• '), 'error'); return false; }
    }
    if (to === 'delivered') {
      const g = gateDelivered(wo);
      if (!g.ok) { toast('لا يمكن التسليم:\n• ' + g.reasons.join('\n• '), 'error'); return false; }
    }
    if ((to === 'cancelled' || to === 'closed') && !isManager()) { toast('الإغلاق/الإلغاء صلاحية مدير', 'warning'); return false; }
    if (to === 'cancelled' && !confirm('إلغاء أمر العمل ' + wo.ref + '؟ سيتم تحرير المواد المحجوزة.')) return false;

    const from = wo.state;
    wo.state = to; touch(wo);
    // T2.3: chatter-lite state history (persisted by save() below).
    if (window.TrackChanges) window.TrackChanges.record('jobOrders', wo.id, { state: { from: STATE_AR[from] || from, to: STATE_AR[to] || to }, ref: wo.ref });
    if (to === 'cancelled') releaseReservations(wo, 'إلغاء أمر العمل');
    if (to === 'delivered') { wo.deliveredAt = nowIso(); notify('تم التسليم', wo.ref + ' — ' + wo.title + ' سُلّم للزبون', 'success', wo.id); }
    if (to === 'in_production' && !wo.productionStartedAt) wo.productionStartedAt = nowIso();
    woEvent(wo, 'state_changed', 'تغيير الحالة: ' + STATE_AR[from] + ' ← ' + STATE_AR[to], to === 'cancelled' ? 'bad' : (to === 'delivered' ? 'ok' : 'info'));
    save(); renderPage();
    toast(wo.ref + ': ' + STATE_AR[to] + ' ✅', 'success');
    return true;
  };

  /* ════════════════════ reservation engine ════════════════════ */
  function ensureReservationLines(wo) {
    const o = ensureData();
    (wo.requiredMaterials || []).forEach(req => {
      const exists = o.materialReservations.find(r => r.workOrderId === wo.id && r.materialId === req.materialId && r.is_active !== false);
      if (!exists) {
        const mat = materials().find(m => m.id === req.materialId);
        o.materialReservations.push(golden({
          id: uid('wores'), workOrderId: wo.id, materialId: req.materialId,
          materialSnapshot: { name: (mat && mat.name) || req.name || req.materialId, unit: (mat && mat.unit) || req.unit || '' },
          requiredQty: Number(req.qty) || 0, reservedQty: 0, consumedQty: 0,
          required: req.required !== false, status: 'draft', ref: wo.ref
        }));
      }
    });
  }
  function reservationState(r) {
    const need = Number(r.requiredQty) || 0, res = Number(r.reservedQty) || 0, used = Number(r.consumedQty) || 0;
    if (r.status === 'released') return 'released';
    if (used >= need - 0.0001 && need > 0) return 'consumed';
    if (res + used >= need - 0.0001) return 'reserved';
    if (res > 0) return 'partially_reserved';
    return r.status === 'shortage' ? 'shortage' : 'draft';
  }
  window.woReserveMaterials = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    ensureReservationLines(wo);
    let missing = 0; const shortNames = [];
    woReservations(wo.id).forEach(r => {
      if (r.status === 'consumed' || r.status === 'released') return;
      const mat = materials().find(m => m.id === r.materialId);
      if (!mat) { r.status = 'shortage'; missing += Number(r.requiredQty) || 0; shortNames.push(r.materialSnapshot.name); return; }
      const stillNeeded = Math.max(0, (Number(r.requiredQty) || 0) - (Number(r.reservedQty) || 0) - (Number(r.consumedQty) || 0));
      if (stillNeeded <= 0) { r.status = reservationState(r); return; }
      const take = Math.min(availableQty(mat), stillNeeded);
      if (take > 0) {
        mat.reservedQty = (Number(mat.reservedQty) || 0) + take;
        r.reservedQty = (Number(r.reservedQty) || 0) + take;
        if (typeof window.recordStockMovement === 'function') {
          try { window.recordStockMovement(mat.id, 'reserved', take, { sourceType: 'work_order', sourceId: wo.id, ref: wo.ref, note: 'حجز لأمر عمل ' + wo.ref, actor: userName() }); } catch (_) {}
        }
      }
      const left = stillNeeded - take;
      if (left > 0.0001) { missing += left; shortNames.push(r.materialSnapshot.name + ' (ناقص ' + left + ')'); r.status = 'shortage'; }
      else r.status = reservationState(r);
      touch(r);
    });
    woEvent(wo, 'materials_reserved', missing > 0 ? ('حجز جزئي — نواقص: ' + shortNames.join('، ')) : 'تم حجز كل المواد المطلوبة', missing > 0 ? 'bad' : 'ok');
    if (missing > 0) {
      notify('نقص مواد', wo.ref + ': ' + shortNames.join('، ') + ' — تحتاج شراء', 'warning', wo.id);
      toast('⚠️ حجز جزئي — مواد ناقصة تحتاج شراء:\n' + shortNames.join('\n'), 'warning');
      save(); renderPage();
    } else {
      save();
      if (wo.state === 'planned') window.woTransition(wo.id, 'materials_reserved'); else renderPage();
      toast('المواد محجوزة بالكامل ✅', 'success');
    }
  };
  function releaseReservations(wo, why) {
    woReservations(wo.id).forEach(r => {
      const remaining = Math.max(0, (Number(r.reservedQty) || 0));
      if (remaining > 0) {
        const mat = materials().find(m => m.id === r.materialId);
        if (mat) {
          mat.reservedQty = Math.max(0, (Number(mat.reservedQty) || 0) - remaining);
          if (typeof window.recordStockMovement === 'function') {
            try { window.recordStockMovement(mat.id, 'released', remaining, { sourceType: 'work_order', sourceId: wo.id, ref: wo.ref, note: why || 'تحرير حجز', actor: userName() }); } catch (_) {}
          }
        }
        r.reservedQty = 0;
      }
      if (r.status !== 'consumed') r.status = 'released';
      touch(r);
    });
    woEvent(wo, 'materials_released', 'تحرير المواد المحجوزة (' + (why || '') + ')', 'info');
  }
  window.woConsumeMaterials = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    if (!confirm('تأكيد صرف المواد المحجوزة فعلياً من المخزون لأمر ' + wo.ref + '؟')) return;
    let any = false;
    woReservations(wo.id).forEach(r => {
      const take = Math.max(0, Number(r.reservedQty) || 0);
      if (take <= 0) return;
      const mat = materials().find(m => m.id === r.materialId); if (!mat) return;
      mat.stock = (Number(mat.stock) || 0) - take;
      mat.reservedQty = Math.max(0, (Number(mat.reservedQty) || 0) - take);
      mat.lastMovementAt = nowIso();
      if (typeof window.recordStockMovement === 'function') {
        try { window.recordStockMovement(mat.id, 'out', take, { sourceType: 'work_order', sourceId: wo.id, ref: wo.ref, note: 'استهلاك فعلي لأمر عمل', actor: userName() }); } catch (_) {}
      }
      r.consumedQty = (Number(r.consumedQty) || 0) + take;
      r.reservedQty = 0;
      r.status = 'consumed'; touch(r); any = true;
    });
    if (any) { woEvent(wo, 'materials_consumed', 'تم صرف المواد المحجوزة من المخزون', 'ok'); save(); renderPage(); toast('تم الصرف من المخزون ✅', 'success'); }
    else toast('لا توجد كميات محجوزة للصرف', 'info');
  };

  /* ════════════════════ machine queue ════════════════════ */
  function queueWorkOrderOnMachines(wo) {
    let added = 0;
    (wo.machineIds || []).forEach(mid => {
      const m = machines().find(x => x.id === mid); if (!m) return;
      if (!Array.isArray(m.queue)) m.queue = [];
      if (m.queue.some(q => q.sourceType === 'work_order' && q.sourceId === wo.id && q.status !== 'done')) return; // idempotent
      m.queue.push({
        id: uid('woq'), title: wo.ref + ' — ' + wo.title,
        workOrderId: wo.id, sourceType: 'work_order', sourceId: wo.id,
        estimatedMinutes: Number(wo.estMachineMinutes) || 60,
        status: 'queued', priority: wo.priority || 'normal', dueDate: wo.deadline || '',
        addedAt: nowIso(), addedBy: userName()
      });
      added++;
      if (['maintenance', 'offline', 'down'].includes(String(m.status || ''))) {
        notify('مكينة متوقفة ومُسند لها عمل', (m.name || m.id) + ' بحالة ' + m.status + ' لكن ' + wo.ref + ' في طابورها', 'warning', wo.id);
      }
    });
    if (added) woEvent(wo, 'machine_queued', 'أُضيف لطابور ' + added + ' مكينة', 'info');
    return added;
  }
  window.woQueueMachines = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    const n = queueWorkOrderOnMachines(wo);
    save(); renderPage();
    toast(n ? ('أُضيف إلى طابور ' + n + ' مكينة 🏭') : 'موجود في الطابور مسبقاً أو لا مكائن محددة', n ? 'success' : 'info');
  };
  function machineLoadInfo(m) {
    let minutes = 0;
    try { if (typeof window.getMachineQueueMinutes === 'function') minutes = window.getMachineQueueMinutes(m); } catch (_) {}
    if (!minutes) minutes = (Array.isArray(m.queue) ? m.queue : []).filter(q => q.status !== 'done').reduce((s, q) => s + (Number(q.estimatedMinutes) || 60), 0);
    const capacity = Number(m.dailyCapacityMinutes) || 480;
    return { minutes: minutes, capacity: capacity, pct: Math.min(200, Math.round(minutes / capacity * 100)) };
  }
  function machineConflicts() {
    const out = [];
    machines().forEach(m => {
      const load = machineLoadInfo(m);
      const down = ['maintenance', 'offline', 'down'].includes(String(m.status || ''));
      const q = (Array.isArray(m.queue) ? m.queue : []).filter(x => x.status !== 'done');
      if (down && q.length) out.push({ machine: m, kind: 'down_assigned', text: (m.name || m.id) + ' متوقفة (' + (m.status === 'maintenance' ? 'صيانة' : 'متوقفة') + ') وعليها ' + q.length + ' عمل' });
      if (load.pct >= 100) out.push({ machine: m, kind: 'overload', text: (m.name || m.id) + ' محمّلة ' + load.pct + '% (' + load.minutes + ' دقيقة)' });
      q.forEach(entry => {
        if (entry.dueDate && entry.dueDate < todayIso() && entry.status !== 'done') out.push({ machine: m, kind: 'deadline', text: (m.name || m.id) + ': «' + (entry.title || '') + '» تجاوز موعده', woId: entry.workOrderId });
      });
    });
    return out;
  }

  /* ════════════════════ task + kanban generation ════════════════════ */
  function suggestPackForJobType(jobTypeId) {
    const jt = JOB_TYPES.find(j => j.id === jobTypeId);
    if (!jt || !jt.packMatch.length) return null;
    return opPacks().find(p => {
      const hay = ((p.name || '') + ' ' + (p.id || '') + ' ' + (p.description || '')).toLowerCase();
      return jt.packMatch.some(k => hay.includes(k.toLowerCase()));
    }) || null;
  }
  function suggestSops(jobTypeId) {
    const jt = JOB_TYPES.find(j => j.id === jobTypeId); if (!jt) return [];
    const keys = jt.packMatch.concat([jt.name]);
    return sops().filter(s => {
      const hay = ((s.title || '') + ' ' + (s.name || '') + ' ' + (s.category || '')).toLowerCase();
      return keys.some(k => hay.includes(String(k).toLowerCase()));
    }).slice(0, 2);
  }
  function generateWorkOrderTasks(wo) {
    const pack = wo.opPackId ? opPacks().find(p => p.id === wo.opPackId) : null;
    const steps = (pack && Array.isArray(pack.steps) && pack.steps.length) ? pack.steps : DEFAULT_STEPS;
    const packId = pack ? pack.id : 'default_steps';
    const existing = allTasks();
    let created = 0; let prevTaskId = null;
    steps.forEach((step, idx) => {
      const stepKey = step.id || ('step' + idx);
      const key = wo.id + '|' + packId + '|' + stepKey; // idempotency key per spec
      if (existing.some(t => t.workOrderTaskKey === key)) { prevTaskId = (existing.find(t => t.workOrderTaskKey === key) || {}).id || prevTaskId; return; }
      if (typeof window.createTaskInSelectedSpace !== 'function') return;
      const machineId = step.machineRef || (step.type === 'machine' ? (wo.machineIds || [])[0] : '');
      const sop = step.sopRef ? sops().find(s => String(s.title || s.name || '').includes(step.sopRef)) : null;
      try {
        const task = window.createTaskInSelectedSpace(step.title || ('خطوة ' + (idx + 1)), {
          description: 'أمر عمل ' + wo.ref + ' — ' + wo.title + (step.sopRef ? ('\nSOP: ' + step.sopRef) : ''),
          priority: wo.priority || 'normal',
          dueDate: wo.deadline || '',
          department: wo.department || '',
          workOrderId: wo.id,
          workOrderRef: wo.ref,
          workOrderTaskKey: key,
          operationPackId: pack ? pack.id : '',
          operationPackStepId: step.id || stepKey,
          sourceType: 'work_order',
          sourceId: wo.id,
          mandatory: step.type !== 'finance',
          estimatedMinutes: Number(step.minutes || step.estimatedMinutes) || 45,
          machineIds: machineId ? [machineId] : [],
          sopIds: sop ? [sop.id] : [],
          stepType: step.type || 'task',
          orderIndex: idx
        });
        if (task) {
          if (prevTaskId && typeof window.addTaskDependency === 'function') { try { window.addTaskDependency(task.id, prevTaskId); } catch (_) {} }
          prevTaskId = task.id;
          wo.taskIds = wo.taskIds || [];
          if (!wo.taskIds.includes(task.id)) wo.taskIds.push(task.id);
          created++;
        }
      } catch (e) { console.warn('WO task create failed', e); }
    });
    if (created) woEvent(wo, 'tasks_generated', 'توليد ' + created + ' مهمة تشغيل من ' + (pack ? ('باقة «' + pack.name + '»') : 'الخطوات الافتراضية'), 'ok');
    return created;
  }
  window.woGenerateTasks = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    const n = generateWorkOrderTasks(wo);
    save(); renderPage();
    toast(n ? ('تم توليد ' + n + ' مهمة تشغيل ✅') : 'المهام مولّدة مسبقاً (حماية التكرار فعّالة)', n ? 'success' : 'info');
  };
  function createWorkOrderKanbanCard(wo) {
    const o = O();
    if (!o || !o.kanban || !Array.isArray(o.kanban.cards)) return null;
    if (wo.kanbanCardId && o.kanban.cards.some(c => c.id === wo.kanbanCardId)) return null; // idempotent
    const col = (o.kanban.columns || [])[0];
    const card = {
      id: uid('card'), columnId: (col && col.id) || 'kb_backlog',
      title: wo.ref + ' — ' + wo.title,
      description: 'زبون: ' + ((wo.customerSnapshot && wo.customerSnapshot.name) || '') + '\nنوع: ' + (wo.jobTypeLabel || '') + '\nموعد: ' + (wo.deadline || '—'),
      owner: wo.department || '', assigneeId: '',
      priority: wo.priority || 'normal', dueDate: wo.deadline || '',
      department: wo.department || '', tags: ['work_order', wo.jobType || ''],
      checklist: [], sopIds: (wo.sopIds || []).slice(),
      machineIds: (wo.machineIds || []).slice(),
      materialRequirements: (wo.requiredMaterials || []).map(r => ({ materialId: r.materialId, qty: r.qty, quantity: r.qty, unit: r.unit || '' })),
      qcRecordIds: [], requiresQc: !!wo.qcRequired,
      sourceType: 'work_order', sourceId: wo.id, workOrderId: wo.id,
      activityLog: [{ date: nowIso(), text: 'أُنشئت من أمر العمل ' + wo.ref }]
    };
    o.kanban.cards.push(card);
    wo.kanbanCardId = card.id;
    woEvent(wo, 'kanban_linked', 'إنشاء بطاقة كانبان مرتبطة', 'info');
    return card;
  }

  /* ════════════════════ QC gate ════════════════════ */
  function ensureQcRecord(wo) {
    const o = O();
    if (!Array.isArray(o.qcRecords)) o.qcRecords = [];
    let qc = woQcRecords(wo).find(q => q.result === 'pending' || !q.result);
    if (qc) return qc;
    const jt = JOB_TYPES.find(j => j.id === wo.jobType);
    const items = QC_TEMPLATES[(jt && jt.qc) || 'generic'] || QC_TEMPLATES.generic;
    qc = {
      id: uid('qc'), sourceType: 'work_order', sourceId: wo.id,
      cardId: wo.kanbanCardId || '', taskRef: wo.kanbanCardId || '',
      title: 'فحص جودة ' + wo.ref + ' — ' + wo.title,
      type: wo.jobTypeLabel || 'فحص نهائي', department: wo.department || 'الجودة',
      result: 'pending', status: 'pending', severity: 'medium',
      reworkStatus: 'none', costImpact: 0, reworkCost: 0,
      checklist: items.map(t => ({ id: uid('chk'), text: t, done: false })),
      date: todayIso(), assignee: 'الجودة',
      activityLog: [{ date: nowIso(), text: 'أُنشئ الفحص من أمر العمل ' + wo.ref }]
    };
    o.qcRecords.push(qc);
    wo.qcRecordIds = wo.qcRecordIds || [];
    wo.qcRecordIds.push(qc.id);
    const card = wo.kanbanCardId ? (o.kanban.cards || []).find(c => c.id === wo.kanbanCardId) : null;
    if (card) { card.qcRecordIds = card.qcRecordIds || []; if (!card.qcRecordIds.includes(qc.id)) card.qcRecordIds.push(qc.id); }
    woEvent(wo, 'qc_created', 'إنشاء فحص جودة (' + qc.checklist.length + ' بنود)', 'info');
    return qc;
  }
  window.woSendToQc = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    ensureQcRecord(wo);
    if (wo.state === 'in_production' || wo.state === 'rework') window.woTransition(wo.id, 'quality_check');
    else { save(); renderPage(); }
  };
  window.woQcToggleItem = function (qcId, itemId) {
    const o = O(); const qc = (o.qcRecords || []).find(q => q.id === qcId); if (!qc) return;
    const item = (qc.checklist || []).find(i => i.id === itemId); if (!item) return;
    item.done = !item.done;
    save(); renderPage();
  };
  window.woQcPass = function (woId, qcId) {
    const wo = getWO(woId); const o = O();
    const qc = (o.qcRecords || []).find(q => q.id === qcId);
    if (!wo || !qc) return;
    const open = (qc.checklist || []).filter(i => !i.done);
    if (open.length) { toast('أكمل بنود الفحص أولاً (' + open.length + ' متبقٍ)', 'warning'); return; }
    qc.result = 'pass'; qc.status = 'pass'; qc.inspectedAt = nowIso(); qc.inspector = userName();
    (qc.activityLog = qc.activityLog || []).push({ date: nowIso(), text: 'نجح الفحص — ' + userName() });
    woEvent(wo, 'qc_passed', 'فحص الجودة ناجح ✅', 'ok');
    save(); renderPage();
    toast('فحص الجودة ناجح ✅', 'success');
  };
  window.woQcFail = function (woId, qcId) {
    const wo = getWO(woId); const o = O();
    const qc = (o.qcRecords || []).find(q => q.id === qcId);
    if (!wo || !qc) return;
    const reason = prompt('سبب فشل الفحص:'); if (reason == null || !reason.trim()) return;
    const cost = Number(prompt('كلفة إعادة العمل التقديرية (اختياري):', '0')) || 0;
    qc.result = 'fail'; qc.status = 'fail'; qc.reason = reason.trim(); qc.inspectedAt = nowIso(); qc.inspector = userName();
    qc.reworkStatus = 'required'; qc.reworkCost = cost; qc.costImpact = cost;
    (qc.activityLog = qc.activityLog || []).push({ date: nowIso(), text: 'فشل الفحص: ' + reason });
    // rework task
    let reworkTask = null;
    if (typeof window.createTaskInSelectedSpace === 'function') {
      try {
        reworkTask = window.createTaskInSelectedSpace('إعادة عمل: ' + wo.ref + ' — ' + reason.trim().slice(0, 60), {
          priority: 'urgent', department: wo.department || 'الجودة',
          workOrderId: wo.id, workOrderRef: wo.ref, sourceType: 'qc_rework', sourceId: qc.id,
          qcRecordIds: [qc.id], mandatory: true, dueDate: wo.deadline || ''
        });
        if (reworkTask) { wo.taskIds = wo.taskIds || []; wo.taskIds.push(reworkTask.id); }
      } catch (e) { console.warn('rework task failed', e); }
    }
    // blocking issue
    createIssueRecord(wo, {
      title: 'فشل فحص جودة: ' + reason.trim().slice(0, 80), severity: 'high', source: 'qc',
      description: reason.trim(), department: wo.department || 'الجودة',
      blocking: true, costImpact: cost, taskId: reworkTask ? reworkTask.id : ''
    });
    woEvent(wo, 'qc_failed', 'فشل فحص الجودة: ' + reason.trim() + (cost ? (' (كلفة إعادة ' + fmt(cost) + ')') : ''), 'bad');
    notify('فشل فحص جودة', wo.ref + ': ' + reason.trim(), 'danger', wo.id);
    if (wo.state === 'quality_check') { wo.state = 'rework'; touch(wo); woEvent(wo, 'state_changed', 'تحويل تلقائي إلى إعادة عمل', 'bad'); }
    save(); renderPage();
    toast('سُجّل الفشل وأُنشئت مهمة إعادة العمل 🔁', 'warning');
  };
  window.woQcWaive = function (woId, qcId) {
    const wo = getWO(woId); const o = O();
    const qc = (o.qcRecords || []).find(q => q.id === qcId);
    if (!wo || !qc) return;
    if (!isManager()) { toast('تجاوز الفحص صلاحية مدير فقط', 'warning'); return; }
    if (!confirm('تجاوز فحص الجودة لأمر ' + wo.ref + '؟ يُسجّل القرار باسمك في السجل.')) return;
    qc.result = 'pass'; qc.status = 'waived_by_manager'; qc.waived = true; qc.inspectedAt = nowIso(); qc.inspector = userName();
    (qc.activityLog = qc.activityLog || []).push({ date: nowIso(), text: 'تجاوز إداري للفحص — ' + userName() });
    woEvent(wo, 'qc_waived', 'تجاوز إداري لفحص الجودة (قرار: ' + userName() + ')', 'bad');
    save(); renderPage();
    toast('تم التجاوز الإداري — مسجّل في السجل', 'warning');
  };

  /* ════════════════════ issues / rework loop ════════════════════ */
  function createIssueRecord(wo, data) {
    const o = ensureData();
    const issue = golden({
      id: uid('woiss'), workOrderId: wo.id, ref: wo.ref,
      title: data.title || 'مشكلة', severity: data.severity || 'medium',
      source: data.source || 'qc', description: data.description || '',
      department: data.department || wo.department || '',
      status: 'open', blocking: !!data.blocking,
      costImpact: Number(data.costImpact) || 0, delayDays: Number(data.delayDays) || 0,
      taskId: data.taskId || ''
    });
    o.workOrderIssues.push(issue);
    woEvent(wo, 'issue_opened', 'فتح مشكلة [' + (ISSUE_SOURCES[issue.source] || issue.source) + ']: ' + issue.title, issue.severity === 'high' || issue.severity === 'critical' ? 'bad' : 'info');
    if (issue.severity === 'high' || issue.severity === 'critical') notify('مشكلة ' + (issue.severity === 'critical' ? 'حرجة' : 'عالية'), wo.ref + ': ' + issue.title, 'danger', wo.id);
    return issue;
  }
  window.woAddIssue = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    const title = val('woIssueTitle');
    if (!title) { toast('عنوان المشكلة مطلوب', 'warning'); return; }
    const issue = createIssueRecord(wo, {
      title: title, severity: val('woIssueSeverity') || 'medium', source: val('woIssueSource') || 'material',
      description: val('woIssueDesc'), department: val('woIssueDept') || wo.department,
      blocking: checked('woIssueBlocking'), costImpact: numVal('woIssueCost'), delayDays: numVal('woIssueDelay')
    });
    if (checked('woIssueMakeTask') && typeof window.createTaskInSelectedSpace === 'function') {
      try {
        const t = window.createTaskInSelectedSpace('معالجة مشكلة: ' + title, { priority: issue.severity === 'critical' ? 'urgent' : 'high', workOrderId: wo.id, workOrderRef: wo.ref, sourceType: 'work_order_issue', sourceId: issue.id, mandatory: issue.blocking });
        if (t) { issue.taskId = t.id; wo.taskIds = wo.taskIds || []; wo.taskIds.push(t.id); }
      } catch (_) {}
    }
    save(); renderPage();
    toast('سُجّلت المشكلة' + (issue.blocking ? ' (معيقة للتسليم)' : ''), 'warning');
  };
  window.woIssueSetStatus = function (issueId, status) {
    const o = ensureData();
    const issue = o.workOrderIssues.find(i => i.id === issueId); if (!issue) return;
    if (status === 'waived' && !isManager()) { toast('التجاوز صلاحية مدير', 'warning'); return; }
    issue.status = status; touch(issue);
    const wo = getWO(issue.workOrderId);
    if (wo) woEvent(wo, status === 'resolved' ? 'issue_resolved' : 'issue_updated', 'المشكلة «' + issue.title + '» → ' + (status === 'resolved' ? 'محلولة' : status === 'waived' ? 'متجاوزة' : status === 'in_progress' ? 'قيد المعالجة' : 'مفتوحة'), status === 'resolved' ? 'ok' : 'info');
    save(); renderPage();
  };

  /* ════════════════════ costing ════════════════════ */
  function woCosting(wo) {
    const s = O().workOrderSettings;
    const resList = woReservations(wo.id);
    const matCostOf = mid => { const m = materials().find(x => x.id === mid); return Number((m && (m.unitCost || m.cost)) || 0); };
    const estMaterial = (wo.requiredMaterials || []).reduce((sum, r) => sum + (Number(r.qty) || 0) * matCostOf(r.materialId), 0) * (1 + (s.wastePct || 0) / 100);
    let estMachine = 0;
    (wo.machineIds || []).forEach(mid => {
      const m = machines().find(x => x.id === mid);
      const hourly = m ? (typeof window.getMachineHourlyCost === 'function' ? window.getMachineHourlyCost(m) : (Number(m.hourlyCost) || 25000)) : 25000;
      estMachine += (Number(wo.estMachineMinutes) || 60) / 60 * hourly;
    });
    const tasks = woTasks(wo);
    const estMinutes = tasks.length ? tasks.reduce((sum, t) => sum + (Number(t.estimatedMinutes) || 45), 0) : 0;
    const estLabor = estMinutes / 60 * (s.laborRatePerHour || 0);
    const estInstall = Number(wo.estInstallCost) || 0;
    const estBase = estMaterial + estMachine + estLabor + estInstall;
    const estOverhead = estBase * (s.overheadPct || 0) / 100;
    const estTotal = estBase + estOverhead;

    const actMaterial = resList.reduce((sum, r) => sum + (Number(r.consumedQty) || 0) * matCostOf(r.materialId), 0);
    const reworkCost = woIssues(wo.id).reduce((sum, i) => sum + (Number(i.costImpact) || 0), 0)
      + woQcRecords(wo).reduce((sum, q) => sum + (Number(q.reworkCost) || 0), 0);
    const actInstall = Number(wo.actInstallCost) || estInstall;
    const actTotal = actMaterial + reworkCost + actInstall + estMachine + estLabor; // machine/labor actuals fall back to estimates

    const quoted = Number(wo.quotedPrice) || 0;
    const expProfit = quoted - estTotal;
    const actProfit = quoted - actTotal;
    const margin = quoted > 0 ? (expProfit / quoted * 100) : 0;
    const actMargin = quoted > 0 ? (actProfit / quoted * 100) : 0;
    return {
      estMaterial: estMaterial, estMachine: estMachine, estLabor: estLabor, estInstall: estInstall,
      estOverhead: estOverhead, estTotal: estTotal,
      actMaterial: actMaterial, reworkCost: reworkCost, actInstall: actInstall, actTotal: actTotal,
      quoted: quoted, expProfit: expProfit, actProfit: actProfit, margin: margin, actMargin: actMargin,
      weak: quoted > 0 && margin < (s.weakMarginPct || 10)
    };
  }
  window.woSetQuote = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    const v = prompt('سعر العرض/الاتفاق للزبون:', wo.quotedPrice || '');
    if (v == null) return;
    wo.quotedPrice = Number(v) || 0; touch(wo);
    woEvent(wo, 'quoted', 'تحديث السعر المعروض: ' + fmt(wo.quotedPrice) + ' ' + curSym(), 'info');
    if (wo.state === 'draft' && wo.quotedPrice > 0) window.woTransition(wo.id, 'quoted'); else { save(); renderPage(); }
  };

  /* ════════════════════ delivery ════════════════════ */
  window.woToggleDelivery = function (woId, key) {
    const wo = getWO(woId); if (!wo) return;
    wo.deliveryChecklist = wo.deliveryChecklist || {};
    wo.deliveryChecklist[key] = !wo.deliveryChecklist[key];
    touch(wo); save(); renderPage();
  };
  window.woSetDeliveryPerson = function (woId, name) {
    const wo = getWO(woId); if (!wo) return;
    wo.deliveryChecklist = wo.deliveryChecklist || {};
    wo.deliveryChecklist.person = String(name || '').trim();
    touch(wo); save();
  };
  function whatsappText(wo) {
    return 'أهلاً أستاذ/أستاذة ' + ((wo.customerSnapshot && wo.customerSnapshot.name) || '') +
      '، طلبكم «' + wo.title + '» صار جاهز للتسليم. رقم الطلب: ' + wo.ref +
      (wo.deliveryType === 'pickup' ? '. يمكنكم الاستلام من الورشة.' : wo.deliveryType === 'install' ? '. سيتم التنسيق معكم للتركيب.' : '. سيتم التوصيل حسب الاتفاق.') +
      ' شكراً لاختياركم ' + orgName() + ' 🙏';
  }
  window.woCopyWhatsapp = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    const text = whatsappText(wo);
    try { navigator.clipboard.writeText(text).then(() => toast('نُسخت رسالة الواتساب 📋', 'success')); }
    catch (_) { window.prompt('انسخ الرسالة:', text); }
    woEvent(wo, 'whatsapp_drafted', 'توليد رسالة واتساب للزبون', 'info');
  };
  window.woPrintDeliveryNote = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    const w = window.open('', '_blank', 'width=720,height=820');
    if (!w) { toast('فعّل النوافذ المنبثقة للطباعة', 'warning'); return; }
    const dims = wo.dims || {};
    w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>مذكرة تسليم ' + esc(wo.ref) + '</title>'
      + '<style>*{box-sizing:border-box;font-family:Tahoma,sans-serif}body{padding:24px;color:#111;font-size:13px}h1{font-size:18px;text-align:center;margin:0 0 2px}'
      + '.muted{color:#666;text-align:center;font-size:11px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin:10px 0}'
      + 'td,th{padding:7px;border:1px solid #bbb;text-align:right;font-size:12px}th{background:#eee;width:160px}'
      + '.sig{display:flex;justify-content:space-between;margin-top:48px}.sig div{width:40%;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:12px}'
      + '</style></head><body>'
      + '<h1>🛠️ ' + esc(orgName()) + ' — مذكرة تسليم</h1>'
      + '<div class="muted">' + esc(wo.ref) + ' · ' + new Date().toLocaleString('ar-IQ') + '</div>'
      + '<table>'
      + '<tr><th>الزبون</th><td>' + esc((wo.customerSnapshot && wo.customerSnapshot.name) || '') + ' — ' + esc((wo.customerSnapshot && wo.customerSnapshot.phone) || '') + '</td></tr>'
      + '<tr><th>العمل</th><td>' + esc(wo.title) + ' (' + esc(wo.jobTypeLabel || '') + ')</td></tr>'
      + '<tr><th>الأبعاد / الكمية</th><td>' + (dims.width || '—') + ' × ' + (dims.height || '—') + (dims.depth ? (' × ' + dims.depth) : '') + ' ' + esc(dims.unit || 'سم') + ' — عدد ' + (dims.quantity || 1) + '</td></tr>'
      + '<tr><th>طريقة التسليم</th><td>' + esc(DELIVERY_TYPES[wo.deliveryType] || wo.deliveryType || '—') + '</td></tr>'
      + '<tr><th>مسؤول التسليم</th><td>' + esc((wo.deliveryChecklist && wo.deliveryChecklist.person) || '—') + '</td></tr>'
      + '<tr><th>ملاحظات</th><td>' + esc(wo.notes || '—') + '</td></tr>'
      + '</table>'
      + '<div class="sig"><div>توقيع الورشة</div><div>توقيع المستلم</div></div>'
      + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
    woEvent(wo, 'delivery_note_printed', 'طباعة مذكرة تسليم', 'info');
  };

  /* ════════════════════ attachments (metadata only) ════════════════════ */
  window.woAddAttachment = function (woId) {
    const wo = getWO(woId); if (!wo) return;
    const name = val('woAttName');
    if (!name) { toast('اسم الملف/المرجع مطلوب', 'warning'); return; }
    wo.attachments = wo.attachments || [];
    wo.attachments.push({ id: uid('woatt'), kind: val('woAttKind') || 'design', name: name, note: val('woAttNote'), addedBy: userName(), addedAt: nowIso() });
    touch(wo);
    woEvent(wo, 'attachment_added', 'إضافة مرجع: ' + name, 'info');
    save(); renderPage();
  };

  /* ════════════════════ wizard ════════════════════ */
  let view = 'list'; // list | wizard | file
  let currentWoId = '';
  let listFilter = { q: '', state: '', overdue: false };
  let wizardMatRows = 1;

  window.woOpenWizard = function () { view = 'wizard'; wizardMatRows = 1; renderPage(); };
  window.woOpenList = function () { view = 'list'; currentWoId = ''; renderPage(); };
  window.woOpenFile = function (woId) {
    const wo = getWO(woId); if (!wo) { toast('أمر العمل غير موجود', 'error'); return; }
    view = 'file'; currentWoId = wo.id;
    try { if (window.currentPage !== 'work_orders' && typeof window.switchPage === 'function') window.switchPage('work_orders'); } catch (_) {}
    renderPage();
  };
  window.woWizardAddMatRow = function () { wizardMatRows++; const box = document.getElementById('woWizMats'); if (box) box.insertAdjacentHTML('beforeend', wizardMatRowHtml(wizardMatRows - 1)); };
  window.woWizardJobTypeChanged = function () {
    const jt = val('woWizJobType');
    const pack = suggestPackForJobType(jt);
    const sel = document.getElementById('woWizPack');
    if (sel && pack) sel.value = pack.id;
    const hint = document.getElementById('woWizPackHint');
    if (hint) hint.textContent = pack ? ('💡 باقة مقترحة: ' + pack.name) : 'لا باقة مطابقة — ستُستخدم خطوات افتراضية قياسية';
  };

  window.woSubmitWizard = function () {
    const o = ensureData(); if (!o) return;
    const title = val('woWizTitle');
    if (!title) { toast('عنوان الشغل مطلوب', 'warning'); return; }
    const jobType = val('woWizJobType') || 'custom';
    const jt = JOB_TYPES.find(j => j.id === jobType) || JOB_TYPES[JOB_TYPES.length - 1];

    // customer: existing or quick-create (id + snapshot, not plain text)
    let custId = val('woWizCustomer');
    let cust = customers().find(c => c.id === custId) || null;
    const newName = val('woWizCustName');
    if (!cust && newName) {
      const f = FIN();
      cust = golden({ id: uid('cust'), name: newName, phone: val('woWizCustPhone'), whatsapp: val('woWizCustPhone'), address: '', openingBalance: 0, type: 'customer', is_company: false, tags: ['workshop'] });
      if (f && Array.isArray(f.customers)) f.customers.push(cust);
      custId = cust.id;
    }
    if (!cust) { toast('اختر زبوناً أو أدخل اسم زبون جديد', 'warning'); return; }

    // material requirement rows
    const reqs = [];
    for (let i = 0; i < wizardMatRows; i++) {
      const mid = val('woWizMat_' + i); const q = numVal('woWizMatQty_' + i);
      if (mid && q > 0) {
        const m = materials().find(x => x.id === mid);
        reqs.push({ materialId: mid, name: (m && m.name) || mid, qty: q, unit: (m && m.unit) || '', required: true });
      }
    }
    const machineIds = Array.from(document.querySelectorAll('.woWizMachine:checked')).map(el => el.value);

    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const wo = golden({
      id: uid('wo'), ref: nextRef(), title: title,
      jobType: jt.id, jobTypeLabel: jt.name,
      customerId: custId,
      customerSnapshot: { name: cust.name || '', phone: cust.phone || '', whatsapp: cust.whatsapp || cust.phone || '', address: cust.address || '' },
      dims: { width: numVal('woWizW'), height: numVal('woWizH'), depth: numVal('woWizD'), quantity: Math.max(1, numVal('woWizQty') || 1), unit: val('woWizUnit') || 'سم' },
      deadline: val('woWizDeadline'), priority: val('woWizPriority') || 'normal',
      department: val('woWizDept') || 'الورشة', deliveryType: val('woWizDelivery') || 'pickup',
      notes: val('woWizNotes'),
      attachments: val('woWizAttach') ? val('woWizAttach').split(',').map(s => ({ id: uid('woatt'), kind: 'design', name: s.trim(), note: '', addedBy: userName(), addedAt: nowIso() })).filter(a => a.name) : [],
      quotedPrice: numVal('woWizBudget'),
      state: 'draft',
      opPackId: val('woWizPack') || (suggestPackForJobType(jt.id) || {}).id || '',
      sopIds: suggestSops(jt.id).map(s => s.id),
      kanbanCardId: '', taskIds: [],
      requiredMaterials: reqs, machineIds: machineIds,
      estMachineMinutes: numVal('woWizMachMin') || 60,
      estInstallCost: numVal('woWizInstallCost'),
      qcRequired: checked('woWizQc'),
      deliveryChecklist: { packaging: false, photos: false, person: '' },
      companyId: coId,
    });
    o.jobOrders.unshift(wo);
    woEvent(wo, 'created', 'إنشاء أمر العمل من معالج الإدخال — ' + jt.name + ' للزبون ' + cust.name, 'ok');

    // ── auto-package: the connected chain ──
    createWorkOrderKanbanCard(wo);
    if (checked('woWizGenTasks')) generateWorkOrderTasks(wo);
    ensureReservationLines(wo);
    if (machineIds.length) queueWorkOrderOnMachines(wo);
    if (wo.qcRequired) ensureQcRecord(wo);
    if (wo.quotedPrice > 0) { wo.state = 'quoted'; woEvent(wo, 'quoted', 'سعر مبدئي من المعالج: ' + fmt(wo.quotedPrice) + ' ' + curSym(), 'info'); }
    notify('طلب جديد', wo.ref + ' — ' + wo.title + ' (' + cust.name + ')', 'info', wo.id);
    const s = o.workOrderSettings;
    if (wo.quotedPrice >= (s.approvalAbove || 500000) || wo.priority === 'urgent') {
      if (!Array.isArray(o.requests)) o.requests = [];
      o.requests.push({ id: uid('req'), type: 'work_order_approval', title: 'موافقة مدير: ' + wo.ref + ' — ' + wo.title, description: 'زبون: ' + cust.name + ' · سعر: ' + fmt(wo.quotedPrice) + ' ' + curSym() + ' · أولوية: ' + wo.priority, status: 'pending', createdAt: nowIso(), metadata: { workOrderId: wo.id } });
      woEvent(wo, 'approval_requested', 'أُرسل طلب موافقة المدير إلى مركز القيادة', 'info');
    }
    save();
    toast('أُنشئ ' + wo.ref + ' مع الحزمة المرتبطة كاملة 🚀', 'success');
    window.woOpenFile(wo.id);
  };

  /* ════════════════════ render: wizard ════════════════════ */
  function wizardMatRowHtml(i) {
    return '<div class="wo-grid" style="margin-bottom:6px">'
      + '<div class="wo-field"><label>المادة</label><select id="woWizMat_' + i + '"><option value="">—</option>'
      + materials().map(m => '<option value="' + esc(m.id) + '">' + esc(m.name || m.id) + ' (متاح ' + fmt(availableQty(m)) + ')</option>').join('')
      + '</select></div>'
      + '<div class="wo-field"><label>الكمية المتوقعة</label><input id="woWizMatQty_' + i + '" type="number" min="0" step="0.1"></div>'
      + '</div>';
  }
  function wizardHtml() {
    const emps = (typeof employees !== 'undefined' && Array.isArray(employees)) ? employees : [];
    return '<div class="wo-wizard">'
      + '<div class="wo-wizard-title">📥 طلب جديد — معالج إنشاء أمر عمل <button class="wo-btn ghost mini" data-jarvis-action="work_orders.back_to_list" data-jarvis-label="رجوع لقائمة أوامر العمل" onclick="woOpenList()">↩ رجوع للقائمة</button></div>'

      + '<div class="wo-sec"><div class="wo-sec-title">👤 بيانات الزبون</div><div class="wo-grid">'
      + '<div class="wo-field"><label>زبون موجود</label><select id="woWizCustomer" data-jarvis-field="work_orders.customer_select"><option value="">— زبون جديد —</option>'
      + customers().map(c => '<option value="' + esc(c.id) + '">' + esc(c.name || c.id) + '</option>').join('') + '</select></div>'
      + '<div class="wo-field"><label>أو اسم زبون جديد</label><input id="woWizCustName" data-jarvis-field="work_orders.customer_name_input" type="text" placeholder="الاسم"></div>'
      + '<div class="wo-field"><label>هاتف / واتساب</label><input id="woWizCustPhone" data-jarvis-field="work_orders.customer_phone_input" type="text" placeholder="07xxxxxxxxx"></div>'
      + '</div></div>'

      + '<div class="wo-sec"><div class="wo-sec-title">🛠️ تفاصيل الشغل</div><div class="wo-grid">'
      + '<div class="wo-field full"><label>عنوان الشغل *</label><input id="woWizTitle" data-jarvis-field="work_orders.title_input" type="text" placeholder="مثال: لوحة أكريلك مضيئة لمحل الياسمين"></div>'
      + '<div class="wo-field"><label>نوع الشغل</label><select id="woWizJobType" data-jarvis-field="work_orders.job_type_select" onchange="woWizardJobTypeChanged()">'
      + JOB_TYPES.map(j => '<option value="' + j.id + '">' + j.icon + ' ' + j.name + '</option>').join('') + '</select></div>'
      + '<div class="wo-field"><label>العرض</label><input id="woWizW" data-jarvis-field="work_orders.width_input" type="number" min="0" step="0.1"></div>'
      + '<div class="wo-field"><label>الارتفاع</label><input id="woWizH" data-jarvis-field="work_orders.height_input" type="number" min="0" step="0.1"></div>'
      + '<div class="wo-field"><label>العمق (اختياري)</label><input id="woWizD" data-jarvis-field="work_orders.depth_input" type="number" min="0" step="0.1"></div>'
      + '<div class="wo-field"><label>الوحدة</label><select id="woWizUnit" data-jarvis-field="work_orders.unit_select"><option>سم</option><option>متر</option><option>ملم</option></select></div>'
      + '<div class="wo-field"><label>العدد</label><input id="woWizQty" data-jarvis-field="work_orders.qty_input" type="number" min="1" value="1"></div>'
      + '<div class="wo-field"><label>الموعد النهائي</label><input id="woWizDeadline" data-jarvis-field="work_orders.deadline_input" type="date"></div>'
      + '<div class="wo-field"><label>الأولوية</label><select id="woWizPriority" data-jarvis-field="work_orders.priority_select"><option value="normal">عادية</option><option value="high">عالية</option><option value="urgent">مستعجلة</option><option value="low">منخفضة</option></select></div>'
      + '<div class="wo-field"><label>القسم</label><input id="woWizDept" data-jarvis-field="work_orders.dept_input" type="text" value="الورشة"></div>'
      + '<div class="wo-field"><label>طريقة التسليم</label><select id="woWizDelivery" data-jarvis-field="work_orders.delivery_select">'
      + Object.keys(DELIVERY_TYPES).map(k => '<option value="' + k + '">' + DELIVERY_TYPES[k] + '</option>').join('') + '</select></div>'
      + '<div class="wo-field"><label>السعر المتوقع / المتفق (اختياري)</label><input id="woWizBudget" data-jarvis-field="work_orders.budget_input" type="number" min="0"></div>'
      + '<div class="wo-field full"><label>ملاحظات</label><textarea id="woWizNotes" data-jarvis-field="work_orders.notes_input" rows="2"></textarea></div>'
      + '<div class="wo-field full"><label>مراجع التصميم / الملفات (أسماء مفصولة بفاصلة)</label><input id="woWizAttach" data-jarvis-field="work_orders.attachments_input" type="text" placeholder="design_v2.ai, صورة الواجهة.jpg"></div>'
      + '</div></div>'

      + '<div class="wo-sec"><div class="wo-sec-title">📦 المواد المتوقعة</div><div id="woWizMats">' + wizardMatRowHtml(0) + '</div>'
      + '<button class="wo-btn mini" data-jarvis-action="work_orders.wizard_add_material" data-jarvis-label="إضافة مادة أخرى للطلب" onclick="woWizardAddMatRow()">➕ مادة أخرى</button></div>'

      + '<div class="wo-sec"><div class="wo-sec-title">🏭 المكائن المطلوبة</div><div class="wo-grid">'
      + (machines().length ? machines().map(m => '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" class="woWizMachine" value="' + esc(m.id) + '"> ' + esc(m.name || m.id) + (['maintenance', 'offline'].includes(String(m.status)) ? ' ⚠️' : '') + '</label>').join('') : '<span class="wo-hint">لا مكائن معرفة</span>')
      + '</div><div class="wo-grid" style="margin-top:8px">'
      + '<div class="wo-field"><label>دقائق المكينة المتوقعة</label><input id="woWizMachMin" data-jarvis-field="work_orders.mach_minutes_input" type="number" min="0" value="60"></div>'
      + '<div class="wo-field"><label>كلفة تركيب خارجي متوقعة</label><input id="woWizInstallCost" data-jarvis-field="work_orders.install_cost_input" type="number" min="0" value="0"></div>'
      + '</div></div>'

      + '<div class="wo-sec"><div class="wo-sec-title">⚙️ خطة التشغيل والفحص</div><div class="wo-grid">'
      + '<div class="wo-field"><label>باقة العمليات</label><select id="woWizPack" data-jarvis-field="work_orders.operation_pack_select"><option value="">بدون (خطوات افتراضية)</option>'
      + opPacks().map(p => '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>').join('') + '</select>'
      + '<div class="wo-hint" id="woWizPackHint">اختر نوع الشغل ليُقترح تلقائياً</div></div>'
      + '<div class="wo-field"><label style="margin-top:18px"><input type="checkbox" id="woWizGenTasks" checked> توليد مهام التشغيل فوراً</label>'
      + '<label><input type="checkbox" id="woWizQc" checked> الفحص والجودة إلزامي</label></div>'
      + '</div></div>'

      + '<div class="wo-wizard-actions">'
      + '<button class="wo-btn primary" data-jarvis-action="work_orders.submit_wizard" data-jarvis-label="إنشاء أمر عمل جديد" onclick="woSubmitWizard()">🚀 إنشاء أمر عمل + الحزمة المرتبطة</button>'
      + '<button class="wo-btn ghost" data-jarvis-action="work_orders.cancel_wizard" data-jarvis-label="إلغاء المعالج" onclick="woOpenList()">إلغاء</button>'
      + '</div>'
      + '<div class="wo-hint">الحزمة المرتبطة = بطاقة كانبان + مهام التشغيل + مسودة حجز المواد + طابور المكائن + متطلب QC + إشعار مركز القيادة' + (emps.length ? '' : '') + '</div>'
      + '</div>';
  }

  /* ════════════════════ render: list ════════════════════ */
  function stateBadge(st) { return '<span class="wo-state ' + st + '">' + (STATE_AR[st] || st) + '</span>'; }
  function prioBadge(p) { p = String(p || 'normal').toLowerCase(); const ar = { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'مستعجلة' }; return '<span class="wo-prio ' + p + '">' + (ar[p] || p) + '</span>'; }
  function isOverdue(wo) { return wo.deadline && wo.deadline < todayIso() && !['delivered', 'closed', 'cancelled'].includes(wo.state); }

  window.woListSearch = function (v) { listFilter.q = String(v || '').toLowerCase(); renderListTable(); };
  window.woListState = function (v) { listFilter.state = v || ''; renderListTable(); };
  function renderListTable() {
    const box = document.getElementById('woListTable');
    if (box) box.innerHTML = listTableHtml();
  }
  function listTableHtml() {
    let list = WOs();
    if (listFilter.q) list = list.filter(w => (w.ref + ' ' + w.title + ' ' + ((w.customerSnapshot || {}).name || '')).toLowerCase().includes(listFilter.q));
    if (listFilter.state) list = list.filter(w => w.state === listFilter.state);
    if (!list.length) return '<div class="wo-empty">لا أوامر عمل' + (WOs().length ? ' مطابقة' : ' بعد — ابدأ بـ«طلب جديد»') + '</div>';
    const sym = curSym();
    return '<div class="wo-table-wrap"><table class="wo-table"><thead><tr>'
      + '<th>المرجع</th><th>العمل</th><th>الزبون</th><th>الحالة</th><th>الأولوية</th><th>الموعد</th><th>السعر</th><th>QC</th><th>مواد</th></tr></thead><tbody>'
      + list.slice(0, 200).map(wo => {
        const res = woReservations(wo.id);
        const short = res.some(r => r.status === 'shortage');
        const qcs = woQcRecords(wo);
        const qcBadge = !wo.qcRequired ? '<span class="wo-pill muted">غير مطلوب</span>'
          : qcs.some(q => q.result === 'fail' && q.reworkStatus !== 'resolved') ? '<span class="wo-pill bad">فشل</span>'
            : qcs.length && qcs.every(q => q.result === 'pass') ? '<span class="wo-pill ok">ناجح</span>'
              : '<span class="wo-pill warn">بانتظار</span>';
        return '<tr class="' + (isOverdue(wo) ? 'wo-row-overdue' : '') + '" onclick="woOpenFile(\'' + wo.id + '\')">'
          + '<td><b>' + esc(wo.ref) + '</b></td>'
          + '<td>' + esc(wo.title) + '<div class="muted">' + esc(wo.jobTypeLabel || '') + '</div></td>'
          + '<td>' + esc((wo.customerSnapshot || {}).name || '') + '</td>'
          + '<td>' + stateBadge(wo.state) + '</td>'
          + '<td>' + prioBadge(wo.priority) + '</td>'
          + '<td>' + (wo.deadline || '—') + (isOverdue(wo) ? ' <span class="wo-pill bad">متأخر</span>' : '') + '</td>'
          + '<td>' + (canSeeCosts() ? (wo.quotedPrice ? fmt(wo.quotedPrice) + ' ' + sym : '—') : '🔒') + '</td>'
          + '<td>' + qcBadge + '</td>'
          + '<td>' + (res.length ? (short ? '<span class="wo-pill bad">نقص</span>' : '<span class="wo-pill ok">' + res.length + '</span>') : '—') + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div>';
  }
  function listHtml() {
    const all = WOs();
    const open = all.filter(w => !['delivered', 'closed', 'cancelled'].includes(w.state));
    const overdue = all.filter(isOverdue);
    const inProd = all.filter(w => w.state === 'in_production');
    const ready = all.filter(w => w.state === 'ready_for_delivery');
    const rework = all.filter(w => w.state === 'rework');
    const kpi = (l, v, cls) => '<div class="wo-kpi ' + (cls || '') + '"><div class="wo-kpi-label">' + l + '</div><div class="wo-kpi-value">' + v + '</div></div>';
    return ''
      + '<div class="wo-toolbar">'
      + '<button class="wo-btn primary" data-jarvis-action="work_orders.open_wizard" data-jarvis-label="فتح معالج إنشاء طلب جديد" onclick="woOpenWizard()">📥 طلب جديد / إنشاء أمر عمل</button>'
      + '<input class="wo-search" data-jarvis-field="work_orders.search" type="text" placeholder="🔍 بحث بالمرجع/العنوان/الزبون..." oninput="woListSearch(this.value)">'
      + '<select class="wo-filter" data-jarvis-field="work_orders.state_filter" onchange="woListState(this.value)"><option value="">كل الحالات</option>'
      + STATES.map(s => '<option value="' + s + '">' + STATE_AR[s] + '</option>').join('') + '</select>'
      + '<span class="spacer"></span>'
      + '</div>'
      + '<div class="wo-kpis">'
      + kpi('أوامر مفتوحة', open.length, '')
      + kpi('قيد التنفيذ', inProd.length, 'warn')
      + kpi('متأخرة', overdue.length, overdue.length ? 'danger' : 'ok')
      + kpi('إعادة عمل', rework.length, rework.length ? 'danger' : 'ok')
      + kpi('جاهزة للتسليم', ready.length, ready.length ? 'ok' : '')
      + kpi('الكل', all.length, '')
      + '</div>'
      + '<div id="woListTable">' + listTableHtml() + '</div>';
  }

  /* ════════════════════ render: work order file ════════════════════ */
  function nextActionFor(wo) {
    switch (wo.state) {
      case 'draft': return { label: wo.quotedPrice > 0 ? '✔️ اعتماد الطلب' : '💰 تسعير الطلب', fn: wo.quotedPrice > 0 ? ("woTransition('" + wo.id + "','approved')") : ("woSetQuote('" + wo.id + "')") };
      case 'quoted': return { label: '✔️ اعتماد الطلب', fn: "woTransition('" + wo.id + "','approved')" };
      case 'approved': return { label: '🗓️ تخطيط التنفيذ', fn: "woTransition('" + wo.id + "','planned')" };
      case 'planned': return { label: '📦 حجز المواد', fn: "woReserveMaterials('" + wo.id + "')" };
      case 'materials_reserved': return { label: '▶️ بدء التنفيذ', fn: "woTransition('" + wo.id + "','in_production')" };
      case 'in_production': return { label: '🧪 إرسال إلى QC', fn: "woSendToQc('" + wo.id + "')" };
      case 'quality_check': return { label: '📋 سجّل نتيجة الفحص أدناه', fn: '' };
      case 'rework': return { label: '🔁 إعادة للتنفيذ', fn: "woTransition('" + wo.id + "','in_production')" };
      case 'ready_for_delivery': return { label: '🚚 تم التسليم', fn: "woTransition('" + wo.id + "','delivered')" };
      case 'delivered': return { label: '🗄️ إغلاق الملف', fn: "woTransition('" + wo.id + "','closed')" };
      default: return null;
    }
  }
  function chainHtml(wo) {
    const flow = ['draft', 'quoted', 'approved', 'planned', 'materials_reserved', 'in_production', 'quality_check', 'ready_for_delivery', 'delivered', 'closed'];
    const idx = flow.indexOf(wo.state === 'rework' ? 'quality_check' : wo.state);
    return '<div class="wo-chain">' + flow.map((s, i) =>
      '<span class="wo-chain-step ' + (i < idx ? 'done' : i === idx ? 'now' : '') + '">' + STATE_AR[s] + '</span>'
    ).join('') + (wo.state === 'rework' ? '<span class="wo-chain-step now">🔁 ' + STATE_AR.rework + '</span>' : '') + '</div>';
  }
  function fileHeadHtml(wo) {
    const na = nextActionFor(wo);
    const transitions = (TRANSITIONS[wo.state] || []).filter(s => s !== 'cancelled');
    return '<div class="wo-file-head">'
      + '<div class="wo-file-head-top"><div>'
      + '<div class="wo-file-ref">' + esc(wo.ref) + ' ' + stateBadge(wo.state) + ' ' + prioBadge(wo.priority) + (isOverdue(wo) ? ' <span class="wo-pill bad">متأخر</span>' : '') + '</div>'
      + '<div class="wo-file-title">' + esc(wo.title) + ' · ' + esc(wo.jobTypeLabel || '') + '</div>'
      + '<div class="wo-file-meta">'
      + '<span>👤 ' + esc((wo.customerSnapshot || {}).name || '') + (wo.customerSnapshot && wo.customerSnapshot.phone ? ' (' + esc(wo.customerSnapshot.phone) + ')' : '') + '</span>'
      + '<span>📅 الموعد: ' + (wo.deadline || '—') + '</span>'
      + '<span>🏷️ القسم: ' + esc(wo.department || '—') + '</span>'
      + '<span>🚚 ' + esc(DELIVERY_TYPES[wo.deliveryType] || '—') + '</span>'
      + ((wo.dims && (wo.dims.width || wo.dims.height)) ? '<span>📐 ' + (wo.dims.width || '؟') + '×' + (wo.dims.height || '؟') + (wo.dims.depth ? '×' + wo.dims.depth : '') + ' ' + esc(wo.dims.unit || '') + ' × عدد ' + (wo.dims.quantity || 1) + '</span>' : '')
      + '</div></div>'
      + '<div><button class="wo-btn ghost mini" onclick="woOpenList()">↩ القائمة</button></div></div>'
      + chainHtml(wo)
      + '<div class="wo-next-action"><span class="wo-next-label">الإجراء التالي:</span>'
      + (na ? (na.fn ? '<button class="wo-btn primary" onclick="' + na.fn + '">' + na.label + '</button>' : '<span class="wo-pill warn">' + na.label + '</span>') : '<span class="wo-pill muted">لا إجراء — الملف ' + STATE_AR[wo.state] + '</span>')
      + transitions.filter(s => !na || ("woTransition('" + wo.id + "','" + s + "')") !== na.fn).slice(0, 3).map(s => '<button class="wo-btn mini" onclick="woTransition(\'' + wo.id + '\',\'' + s + '\')">' + STATE_AR[s] + '</button>').join('')
      + (['closed', 'cancelled', 'delivered'].includes(wo.state) ? '' : '<button class="wo-btn danger mini" onclick="woTransition(\'' + wo.id + '\',\'cancelled\')">إلغاء</button>')
      + '</div></div>';
  }
  function materialsCardHtml(wo) {
    ensureReservationLines(wo);
    const res = woReservations(wo.id);
    const rows = res.map(r => {
      const mat = materials().find(m => m.id === r.materialId);
      const avail = mat ? availableQty(mat) : 0;
      const missing = Math.max(0, (Number(r.requiredQty) || 0) - (Number(r.reservedQty) || 0) - (Number(r.consumedQty) || 0));
      const st = reservationState(r);
      const pill = st === 'consumed' ? '<span class="wo-pill muted">مستهلكة</span>'
        : st === 'reserved' ? '<span class="wo-pill ok">محجوزة</span>'
          : st === 'partially_reserved' ? '<span class="wo-pill warn">جزئي</span>'
            : st === 'released' ? '<span class="wo-pill muted">محرّرة</span>'
              : missing > 0 && avail < missing ? '<span class="wo-pill bad">تحتاج شراء</span>'
                : '<span class="wo-pill info">مسودة</span>';
      return '<tr><td><b>' + esc(r.materialSnapshot.name) + '</b></td>'
        + '<td>' + fmt(r.requiredQty) + ' ' + esc(r.materialSnapshot.unit || '') + '</td>'
        + '<td>' + fmt(r.reservedQty || 0) + '</td>'
        + '<td>' + fmt(r.consumedQty || 0) + '</td>'
        + '<td>' + fmt(avail) + '</td>'
        + '<td>' + (missing > 0 ? '<b style="color:#f87171">' + fmt(missing) + '</b>' : '0') + '</td>'
        + '<td>' + pill + '</td></tr>';
    }).join('');
    return '<div class="wo-card"><div class="wo-card-title">📦 المواد — المطلوب/المحجوز/الناقص'
      + '<span><button class="wo-btn mini" onclick="woReserveMaterials(\'' + wo.id + '\')">حجز المواد</button> '
      + '<button class="wo-btn mini" onclick="woConsumeMaterials(\'' + wo.id + '\')">تأكيد الصرف الفعلي</button></span></div>'
      + (res.length ? '<table class="wo-mini-table"><thead><tr><th>المادة</th><th>مطلوب</th><th>محجوز</th><th>مستهلك</th><th>متاح بالمخزن</th><th>ناقص</th><th>الحالة</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div class="wo-empty">لا متطلبات مواد لهذا الأمر</div>')
      + '</div>';
  }
  function machinesCardHtml(wo) {
    const rows = (wo.machineIds || []).map(mid => {
      const m = machines().find(x => x.id === mid);
      if (!m) return '<tr><td colspan="4">مكينة محذوفة (' + esc(mid) + ')</td></tr>';
      const load = machineLoadInfo(m);
      const inQueue = (Array.isArray(m.queue) ? m.queue : []).some(q => q.sourceId === wo.id && q.status !== 'done');
      const down = ['maintenance', 'offline', 'down'].includes(String(m.status || ''));
      return '<tr><td><b>' + esc(m.name || m.id) + '</b>' + (down ? ' <span class="wo-pill bad">' + (m.status === 'maintenance' ? 'صيانة' : 'متوقفة') + '</span>' : '') + '</td>'
        + '<td>' + load.minutes + ' دقيقة (' + load.pct + '%)' + (load.pct >= 100 ? ' <span class="wo-pill bad">ضغط</span>' : load.pct >= 60 ? ' <span class="wo-pill warn">مشغولة</span>' : '') + '</td>'
        + '<td>' + ((Array.isArray(m.queue) ? m.queue : []).filter(q => q.status !== 'done').length) + '</td>'
        + '<td>' + (inQueue ? '<span class="wo-pill ok">في الطابور</span>' : '<span class="wo-pill muted">غير مضاف</span>') + '</td></tr>';
    }).join('');
    return '<div class="wo-card"><div class="wo-card-title">🏭 طابور المكائن'
      + '<button class="wo-btn mini" onclick="woQueueMachines(\'' + wo.id + '\')">إضافة للطابور</button></div>'
      + ((wo.machineIds || []).length ? '<table class="wo-mini-table"><thead><tr><th>المكينة</th><th>ضغط المكينة</th><th>بالطابور</th><th>هذا الأمر</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div class="wo-empty">لا مكائن مرتبطة</div>')
      + '</div>';
  }
  function tasksCardHtml(wo) {
    const tasks = woTasks(wo);
    const done = tasks.filter(taskDone).length;
    return '<div class="wo-card"><div class="wo-card-title">📋 مهام التشغيل (' + done + '/' + tasks.length + ')'
      + '<span><button class="wo-btn mini" onclick="woGenerateTasks(\'' + wo.id + '\')">توليد مهام التشغيل</button>'
      + (wo.kanbanCardId ? ' <span class="wo-pill info">كانبان مرتبط</span>' : '') + '</span></div>'
      + (tasks.length ? tasks.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)).map(t =>
        '<div class="wo-check"><span class="' + (taskDone(t) ? 'ok' : 'bad') + '">' + (taskDone(t) ? '✅' : '⬜') + '</span> '
        + esc(t.title) + (t.mandatory !== false ? '' : ' <span class="wo-pill muted">اختيارية</span>')
        + (t.stepType === 'qc' ? ' <span class="wo-pill info">QC</span>' : '')
        + '<span style="margin-inline-start:auto" class="wo-pill ' + (taskDone(t) ? 'ok' : 'warn') + '">' + esc(t.status || '') + '</span></div>').join('')
        : '<div class="wo-empty">لا مهام بعد — اضغط «توليد مهام التشغيل»</div>')
      + '</div>';
  }
  function qcCardHtml(wo) {
    const recs = woQcRecords(wo);
    return '<div class="wo-card"><div class="wo-card-title">🧪 الفحص والجودة ' + (wo.qcRequired ? '<span class="wo-pill warn">إلزامي</span>' : '<span class="wo-pill muted">غير إلزامي</span>')
      + '<button class="wo-btn mini" onclick="woSendToQc(\'' + wo.id + '\')">إرسال إلى QC</button></div>'
      + (recs.length ? recs.map(qc => {
        const items = (qc.checklist || []);
        const doneN = items.filter(i => i.done).length;
        const badge = qc.result === 'pass' ? (qc.status === 'waived_by_manager' ? '<span class="wo-pill warn">تجاوز إداري</span>' : '<span class="wo-pill ok">ناجح</span>')
          : qc.result === 'fail' ? '<span class="wo-pill bad">فاشل</span>' : '<span class="wo-pill info">قيد الفحص</span>';
        return '<div style="border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:9px;margin-bottom:8px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px"><b style="font-size:12.5px">' + esc(qc.title || qc.type || 'فحص') + '</b>' + badge + '</div>'
          + (qc.reason ? '<div class="wo-hint">السبب: ' + esc(qc.reason) + '</div>' : '')
          + items.map(i => '<div class="wo-check"><label><input type="checkbox" ' + (i.done ? 'checked' : '') + ' ' + (qc.result === 'pending' || !qc.result ? '' : 'disabled') + ' onchange="woQcToggleItem(\'' + qc.id + '\',\'' + i.id + '\')"> ' + esc(i.text) + '</label></div>').join('')
          + ((qc.result === 'pending' || !qc.result) ? '<div style="display:flex;gap:6px;margin-top:8px">'
            + '<button class="wo-btn ok mini" onclick="woQcPass(\'' + wo.id + '\',\'' + qc.id + '\')" ' + (doneN < items.length ? 'disabled title="أكمل البنود"' : '') + '>✅ ناجح</button>'
            + '<button class="wo-btn danger mini" onclick="woQcFail(\'' + wo.id + '\',\'' + qc.id + '\')">❌ فاشل → إعادة عمل</button>'
            + (isManager() ? '<button class="wo-btn mini" onclick="woQcWaive(\'' + wo.id + '\',\'' + qc.id + '\')">تجاوز (مدير)</button>' : '')
            + '</div>' : '')
          + '</div>';
      }).join('') : '<div class="wo-empty">لا فحوصات بعد</div>')
      + '</div>';
  }
  function issuesCardHtml(wo) {
    const issues = woIssues(wo.id);
    const sevAr = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' };
    const stAr = { open: 'مفتوحة', in_progress: 'قيد المعالجة', resolved: 'محلولة', waived: 'متجاوزة' };
    return '<div class="wo-card"><div class="wo-card-title">⚠️ المشاكل وإعادة العمل (' + issues.filter(i => !['resolved', 'waived'].includes(i.status)).length + ' مفتوحة)</div>'
      + issues.map(i => '<div class="wo-issue ' + (i.severity === 'high' || i.severity === 'critical' ? 'high' : '') + '">'
        + '<div class="wo-issue-top"><span class="wo-issue-title">' + esc(i.title) + '</span>'
        + '<span><span class="wo-pill ' + (i.severity === 'critical' || i.severity === 'high' ? 'bad' : i.severity === 'medium' ? 'warn' : 'muted') + '">' + (sevAr[i.severity] || i.severity) + '</span> '
        + (i.blocking ? '<span class="wo-pill bad">معيقة</span> ' : '')
        + '<span class="wo-pill ' + (i.status === 'resolved' ? 'ok' : i.status === 'waived' ? 'muted' : 'warn') + '">' + (stAr[i.status] || i.status) + '</span></span></div>'
        + '<div class="wo-issue-meta">مصدر: ' + (ISSUE_SOURCES[i.source] || i.source) + (i.costImpact ? ' · كلفة: ' + fmt(i.costImpact) : '') + (i.delayDays ? ' · تأخير: ' + i.delayDays + ' يوم' : '') + (i.description ? ' · ' + esc(i.description) : '') + '</div>'
        + (!['resolved', 'waived'].includes(i.status) ? '<div style="display:flex;gap:6px;margin-top:6px">'
          + '<button class="wo-btn mini" onclick="woIssueSetStatus(\'' + i.id + '\',\'in_progress\')">قيد المعالجة</button>'
          + '<button class="wo-btn ok mini" onclick="woIssueSetStatus(\'' + i.id + '\',\'resolved\')">حلّها</button>'
          + (isManager() ? '<button class="wo-btn mini" onclick="woIssueSetStatus(\'' + i.id + '\',\'waived\')">تجاوز</button>' : '')
          + '</div>' : '')
        + '</div>').join('')
      + '<div class="wo-sec-title" style="margin-top:10px">➕ تسجيل مشكلة</div>'
      + '<div class="wo-grid">'
      + '<div class="wo-field full"><label>العنوان *</label><input id="woIssueTitle" type="text"></div>'
      + '<div class="wo-field"><label>الخطورة</label><select id="woIssueSeverity"><option value="low">منخفضة</option><option value="medium" selected>متوسطة</option><option value="high">عالية</option><option value="critical">حرجة</option></select></div>'
      + '<div class="wo-field"><label>المصدر</label><select id="woIssueSource">' + Object.keys(ISSUE_SOURCES).map(k => '<option value="' + k + '">' + ISSUE_SOURCES[k] + '</option>').join('') + '</select></div>'
      + '<div class="wo-field"><label>القسم المسؤول</label><input id="woIssueDept" type="text" value="' + esc(wo.department || '') + '"></div>'
      + '<div class="wo-field"><label>أثر الكلفة</label><input id="woIssueCost" type="number" min="0" value="0"></div>'
      + '<div class="wo-field"><label>أثر التأخير (أيام)</label><input id="woIssueDelay" type="number" min="0" value="0"></div>'
      + '<div class="wo-field full"><label>الوصف</label><input id="woIssueDesc" type="text"></div>'
      + '</div>'
      + '<div style="display:flex;gap:14px;margin-top:8px;align-items:center;flex-wrap:wrap">'
      + '<label style="font-size:12px"><input type="checkbox" id="woIssueBlocking"> ⛔ تعيق التسليم</label>'
      + '<label style="font-size:12px"><input type="checkbox" id="woIssueMakeTask" checked> إنشاء مهمة معالجة</label>'
      + '<button class="wo-btn mini primary" onclick="woAddIssue(\'' + wo.id + '\')">تسجيل المشكلة</button>'
      + '</div></div>';
  }
  function costingCardHtml(wo) {
    if (!canSeeCosts()) return '<div class="wo-card"><div class="wo-card-title">💰 الكلفة والربح</div><div class="wo-empty">🔒 تتطلب صلاحية مشرف/مدير/مالية</div></div>';
    const c = woCosting(wo);
    const sym = curSym();
    const box = (l, v, cls) => '<div class="wo-cost-box"><div class="wo-cost-label">' + l + '</div><div class="wo-cost-value ' + (cls || '') + '">' + v + '</div></div>';
    const marginBadge = c.quoted <= 0 ? '<span class="wo-margin-badge weak">لا سعر بعد</span>'
      : c.margin < 0 ? '<span class="wo-margin-badge danger">خسارة ' + c.margin.toFixed(0) + '%</span>'
        : c.weak ? '<span class="wo-margin-badge danger">هامش ضعيف ' + c.margin.toFixed(0) + '%</span>'
          : c.margin < 20 ? '<span class="wo-margin-badge weak">هامش ' + c.margin.toFixed(0) + '%</span>'
            : '<span class="wo-margin-badge good">هامش ' + c.margin.toFixed(0) + '%</span>';
    return '<div class="wo-card"><div class="wo-card-title">💰 الكلفة والربح ' + marginBadge
      + '<button class="wo-btn mini" onclick="woSetQuote(\'' + wo.id + '\')">تحديث السعر</button></div>'
      + '<div class="wo-cost-grid">'
      + box('السعر المعروض', fmt(c.quoted) + ' ' + sym)
      + box('الكلفة المتوقعة', fmt(c.estTotal) + ' ' + sym)
      + box('الربح المتوقع', fmt(c.expProfit) + ' ' + sym, c.expProfit >= 0 ? 'profit' : 'loss')
      + box('الكلفة الفعلية حتى الآن', fmt(c.actTotal) + ' ' + sym)
      + box('الربح الفعلي', fmt(c.actProfit) + ' ' + sym, c.actProfit >= 0 ? 'profit' : 'loss')
      + '</div>'
      + '<table class="wo-mini-table" style="margin-top:10px"><thead><tr><th>البند</th><th>متوقع</th><th>فعلي</th></tr></thead><tbody>'
      + '<tr><td>المواد (+هدر ' + O().workOrderSettings.wastePct + '%)</td><td>' + fmt(c.estMaterial) + '</td><td>' + fmt(c.actMaterial) + '</td></tr>'
      + '<tr><td>المكائن</td><td>' + fmt(c.estMachine) + '</td><td class="muted">≈</td></tr>'
      + '<tr><td>العمالة</td><td>' + fmt(c.estLabor) + '</td><td class="muted">≈</td></tr>'
      + '<tr><td>تركيب خارجي</td><td>' + fmt(c.estInstall) + '</td><td>' + fmt(c.actInstall) + '</td></tr>'
      + '<tr><td>إدارية ' + O().workOrderSettings.overheadPct + '%</td><td>' + fmt(c.estOverhead) + '</td><td class="muted">—</td></tr>'
      + '<tr><td><b>كلفة إعادة العمل</b></td><td class="muted">—</td><td><b style="color:#f87171">' + fmt(c.reworkCost) + '</b></td></tr>'
      + '</tbody></table>'
      + '<div class="wo-hint">تشغيلي للعرض فقط — لا يرحَّل للمالية تلقائياً (يُرحّل لاحقاً عبر جسر addFinanceTransaction عند الإغلاق إن طُلب).</div>'
      + '</div>';
  }
  function deliveryCardHtml(wo) {
    const g = gateReadyForDelivery(wo);
    const dc = wo.deliveryChecklist || {};
    const auto = [
      { ok: !wo.qcRequired || (woQcRecords(wo).length && woQcRecords(wo).every(q => q.result === 'pass')), text: 'فحص الجودة ناجح' },
      { ok: !woReservations(wo.id).some(r => r.status === 'shortage'), text: 'لا نواقص مواد' },
      { ok: woTasks(wo).filter(t => t.mandatory !== false).every(taskDone), text: 'كل المهام الإلزامية منجزة' },
      { ok: !woIssues(wo.id).some(i => i.blocking && !['resolved', 'waived'].includes(i.status)), text: 'لا مشاكل معيقة مفتوحة' }
    ];
    const emps = (typeof employees !== 'undefined' && Array.isArray(employees)) ? employees : [];
    return '<div class="wo-card"><div class="wo-card-title">🚚 التسليم والجاهزية '
      + (g.ok ? '<span class="wo-pill ok">مؤهل للتسليم</span>' : '<span class="wo-pill bad">' + g.reasons.length + ' عائق</span>') + '</div>'
      + auto.map(a => '<div class="wo-check"><span class="' + (a.ok ? 'ok' : 'bad') + '">' + (a.ok ? '✅' : '❌') + '</span> ' + a.text + '</div>').join('')
      + '<div class="wo-check"><label><input type="checkbox" ' + (dc.photos ? 'checked' : '') + ' onchange="woToggleDelivery(\'' + wo.id + '\',\'photos\')"> 📸 صور/مراجع موثقة</label></div>'
      + '<div class="wo-check"><label><input type="checkbox" ' + (dc.packaging ? 'checked' : '') + ' onchange="woToggleDelivery(\'' + wo.id + '\',\'packaging\')"> 📦 التغليف منجز</label></div>'
      + '<div class="wo-grid" style="margin-top:8px">'
      + '<div class="wo-field"><label>مسؤول التسليم</label>'
      + (emps.length ? '<select onchange="woSetDeliveryPerson(\'' + wo.id + '\', this.value)"><option value="">—</option>' + emps.map(e => '<option ' + (dc.person === e.name ? 'selected' : '') + '>' + esc(e.name || '') + '</option>').join('') + '</select>'
        : '<input type="text" value="' + esc(dc.person || '') + '" onchange="woSetDeliveryPerson(\'' + wo.id + '\', this.value)">')
      + '</div></div>'
      + '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">'
      + '<button class="wo-btn ok mini" onclick="woTransition(\'' + wo.id + '\',\'ready_for_delivery\')">جاهز للتسليم</button>'
      + '<button class="wo-btn primary mini" onclick="woTransition(\'' + wo.id + '\',\'delivered\')">تم التسليم</button>'
      + '<button class="wo-btn mini" onclick="woPrintDeliveryNote(\'' + wo.id + '\')">🖨️ مذكرة تسليم</button>'
      + '<button class="wo-btn mini" onclick="woCopyWhatsapp(\'' + wo.id + '\')">📱 نسخ رسالة واتساب</button>'
      + '</div>'
      + '<div class="wo-whatsapp-box">' + esc(whatsappText(wo)) + '</div>'
      + '</div>';
  }
  function attachmentsCardHtml(wo) {
    const kinds = { design: '🎨 تصميم', before: '📷 قبل', after: '📷 بعد', invoice: '🧾 فاتورة/مرجع', other: '📁 أخرى' };
    return '<div class="wo-card"><div class="wo-card-title">📎 المرفقات والمراجع (أسماء فقط — بلا ملفات ثنائية)</div>'
      + ((wo.attachments || []).length ? '<table class="wo-mini-table"><thead><tr><th>النوع</th><th>الاسم</th><th>ملاحظة</th><th>أضيف</th></tr></thead><tbody>'
        + wo.attachments.map(a => '<tr><td>' + (kinds[a.kind] || a.kind) + '</td><td>' + esc(a.name) + '</td><td class="muted">' + esc(a.note || '') + '</td><td class="muted">' + esc(a.addedBy || '') + ' · ' + new Date(a.addedAt).toLocaleDateString('ar-IQ') + '</td></tr>').join('')
        + '</tbody></tbody></table>' : '<div class="wo-empty">لا مراجع</div>')
      + '<div class="wo-grid" style="margin-top:8px">'
      + '<div class="wo-field"><label>النوع</label><select id="woAttKind">' + Object.keys(kinds).map(k => '<option value="' + k + '">' + kinds[k] + '</option>').join('') + '</select></div>'
      + '<div class="wo-field"><label>اسم الملف/المرجع</label><input id="woAttName" type="text"></div>'
      + '<div class="wo-field"><label>ملاحظة</label><input id="woAttNote" type="text"></div>'
      + '</div><button class="wo-btn mini" style="margin-top:6px" onclick="woAddAttachment(\'' + wo.id + '\')">إضافة مرجع</button></div>';
  }
  function timelineCardHtml(wo) {
    const evs = woEvents(wo.id).slice().reverse();
    return '<div class="wo-card"><div class="wo-card-title">🕓 السجل الزمني (' + evs.length + ')</div>'
      + '<div class="wo-timeline">'
      + (evs.length ? evs.map(e => '<div class="wo-event"><span class="wo-event-dot ' + (e.severity === 'ok' ? 'ok' : e.severity === 'bad' ? 'bad' : 'info') + '"></span>'
        + '<div class="wo-event-text">' + esc(e.text) + '<div class="wo-event-meta">' + esc(e.byUser || '') + ' · ' + new Date(e.at).toLocaleString('ar-IQ') + '</div></div></div>').join('')
        : '<div class="wo-empty">لا أحداث</div>')
      + '</div></div>';
  }
  function fileHtml(wo) {
    return fileHeadHtml(wo)
      + '<div class="wo-file"><div>'
      + tasksCardHtml(wo)
      + materialsCardHtml(wo)
      + machinesCardHtml(wo)
      + qcCardHtml(wo)
      + issuesCardHtml(wo)
      + '</div><div>'
      + deliveryCardHtml(wo)
      + costingCardHtml(wo)
      + attachmentsCardHtml(wo)
      + timelineCardHtml(wo)
      + '</div></div>';
  }

  /* ════════════════════ render: page ════════════════════ */
  function renderPage() {
    const root = document.getElementById('workOrdersBody');
    if (!root) return;
    ensureData();
    if (view === 'wizard') root.innerHTML = wizardHtml();
    else if (view === 'file' && currentWoId && getWO(currentWoId)) root.innerHTML = fileHtml(getWO(currentWoId));
    else { view = 'list'; root.innerHTML = listHtml(); }
    if (view === 'wizard') { try { window.woWizardJobTypeChanged(); } catch (_) {} }
  }

  /* ════════════════════ command center: alerts + daily board ════════════════════ */
  function computeAlerts() {
    const out = [];
    const s = O().workOrderSettings;
    const today = todayIso();
    WOs().forEach(wo => {
      if (['delivered', 'closed', 'cancelled'].includes(wo.state)) return;
      if (isOverdue(wo)) out.push({ sev: 'critical', icon: '⏰', title: wo.ref + ' متأخر', reason: 'الموعد ' + wo.deadline + ' — الحالة ' + STATE_AR[wo.state], suggest: 'افتح الملف وحدد الإجراء التالي', woId: wo.id });
      const tasks = woTasks(wo);
      if (['approved', 'planned', 'materials_reserved', 'in_production'].includes(wo.state) && tasks.length && tasks.every(t => !t.assigneeId && !t.assignedTo && !t.owner)) out.push({ sev: 'medium', icon: '👤', title: wo.ref + ' بلا منفّذ', reason: 'لا مهمة مسندة لموظف', suggest: 'أسند المهام من إدارة المهام', woId: wo.id });
      const shortages = woReservations(wo.id).filter(r => r.status === 'shortage');
      if (shortages.length) out.push({ sev: 'high', icon: '📦', title: 'نقص مواد — ' + wo.ref, reason: shortages.map(r => r.materialSnapshot.name).join('، '), suggest: 'أنشئ طلب شراء من المخزون', woId: wo.id });
      const qcs = woQcRecords(wo);
      if (qcs.some(q => q.result === 'fail' && q.reworkStatus !== 'resolved')) out.push({ sev: 'high', icon: '🧪', title: 'فشل QC — ' + wo.ref, reason: (qcs.find(q => q.result === 'fail') || {}).reason || '', suggest: 'تابع مهمة إعادة العمل', woId: wo.id });
      if (wo.state === 'rework') out.push({ sev: 'high', icon: '🔁', title: wo.ref + ' في إعادة عمل', reason: 'بانتظار معالجة الفشل', suggest: 'أعد للتنفيذ بعد المعالجة', woId: wo.id });
      if (wo.state === 'quality_check' && wo.deadline && daysBetween(today, wo.deadline) <= 1) {
        const g = gateReadyForDelivery(wo);
        if (!g.ok) out.push({ sev: 'high', icon: '🚚', title: 'تسليم معاق — ' + wo.ref, reason: g.reasons[0] || '', suggest: 'عالج العوائق قبل الموعد', woId: wo.id });
      }
      const c = woCosting(wo);
      if (c.quoted > 0 && c.weak) out.push({ sev: 'medium', icon: '💸', title: 'هامش ضعيف — ' + wo.ref, reason: 'الهامش ' + c.margin.toFixed(0) + '% أقل من ' + s.weakMarginPct + '%', suggest: 'راجع السعر أو الكلفة', woId: wo.id });
      if (['draft', 'quoted'].includes(wo.state) && daysBetween(wo.created_at, new Date()) >= 3) out.push({ sev: 'medium', icon: '⏳', title: 'زبون ينتظر — ' + wo.ref, reason: 'بلا اعتماد منذ ' + daysBetween(wo.created_at, new Date()) + ' أيام', suggest: 'اعتمد أو تواصل مع الزبون', woId: wo.id });
    });
    machineConflicts().forEach(cf => out.push({ sev: cf.kind === 'down_assigned' ? 'high' : 'medium', icon: '🏭', title: 'تعارض مكينة', reason: cf.text, suggest: cf.kind === 'overload' ? 'وزّع الحمل أو أجّل' : 'راجع الجدولة', woId: cf.woId || '' }));
    const o = O();
    ((o && o.requests) || []).filter(r => r.type === 'work_order_approval' && r.status === 'pending').forEach(r =>
      out.push({ sev: 'medium', icon: '✋', title: 'موافقة مطلوبة', reason: r.title, suggest: 'راجع واعتمد', woId: (r.metadata || {}).workOrderId || '' }));
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return out.sort((a, b) => order[a.sev] - order[b.sev]);
  }
  function ccAlertsHtml() {
    const alerts = computeAlerts();
    if (!alerts.length) return '<div class="wo-cc-section" id="woCcAlerts"><div class="wo-cc-title">🛡️ تنبيهات الورشة</div><div class="wo-board-empty">لا تنبيهات — الورشة تحت السيطرة ✅</div></div>';
    const sevAr = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض' };
    const shown = alerts.slice(0, 12);
    return '<div class="wo-cc-section" id="woCcAlerts">'
      + '<div class="wo-cc-title">🛡️ تنبيهات الورشة <span class="wo-pill ' + (alerts.some(a => a.sev === 'critical') ? 'bad' : 'warn') + '">' + alerts.length + '</span></div>'
      + '<div class="wo-cc-grid">'
      + shown.map(a => '<div class="wo-alert ' + a.sev + '">'
        + '<div class="wo-alert-top"><span class="wo-alert-title">' + a.icon + ' ' + esc(a.title) + '</span><span class="wo-pill ' + (a.sev === 'critical' || a.sev === 'high' ? 'bad' : 'warn') + '">' + sevAr[a.sev] + '</span></div>'
        + '<div class="wo-alert-reason">' + esc(a.reason) + '</div>'
        + '<div class="wo-alert-action"><span class="wo-alert-suggest">💡 ' + esc(a.suggest) + '</span>'
        + (a.woId ? '<button class="wo-btn mini" onclick="woOpenFile(\'' + a.woId + '\')">فتح ملف العمل</button>' : '') + '</div>'
        + '</div>').join('')
      + '</div>'
      + (alerts.length > shown.length ? '<div class="wo-hint" style="margin-top:8px">+' + (alerts.length - shown.length) + ' تنبيهات أخرى داخل صفحة أوامر العمل</div>' : '')
      + '</div>';
  }
  function ccBoardHtml() {
    const today = todayIso();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);
    const open = WOs().filter(w => !['delivered', 'closed', 'cancelled'].includes(w.state));
    const dueToday = open.filter(w => w.deadline === today || isOverdue(w));
    const dueTomorrow = open.filter(w => w.deadline === tomorrowIso);
    const highPrio = open.filter(w => ['high', 'urgent'].includes(String(w.priority)));
    const queueToday = [];
    machines().forEach(m => (Array.isArray(m.queue) ? m.queue : []).filter(q => q.status !== 'done' && q.sourceType === 'work_order').forEach(q => queueToday.push({ m: m, q: q })));
    const shortages = [];
    O().materialReservations.filter(r => r.status === 'shortage' && r.is_active !== false).forEach(r => { const wo = getWO(r.workOrderId); if (wo && !['delivered', 'closed', 'cancelled'].includes(wo.state)) shortages.push({ r: r, wo: wo }); });
    const qcWaiting = open.filter(w => w.state === 'quality_check');
    const deliveries = open.filter(w => w.state === 'ready_for_delivery');
    const loadMap = {};
    allTasks().filter(t => !taskDone(t)).forEach(t => { const who = t.assigneeId || t.assignedTo || t.owner; if (who) loadMap[who] = (loadMap[who] || 0) + 1; });
    const overloaded = Object.keys(loadMap).filter(k => loadMap[k] >= 5).map(k => ({ name: k, n: loadMap[k] }));
    const col = (title, items, render2, emptyText) => '<div class="wo-board-col"><div class="wo-board-col-title">' + title + '<span>' + items.length + '</span></div>'
      + (items.length ? items.slice(0, 6).map(render2).join('') : '<div class="wo-board-empty">' + (emptyText || 'لا شيء ✅') + '</div>') + '</div>';
    const woItem = w => '<div class="wo-board-item" onclick="woOpenFile(\'' + w.id + '\')"><span>' + esc(w.ref) + ' ' + esc(w.title.slice(0, 22)) + '</span>' + stateBadge(w.state) + '</div>';
    return '<div class="wo-cc-section" id="woCcBoard">'
      + '<div class="wo-cc-title">🌅 لوحة تشغيل اليوم <span class="wo-hint">' + new Date().toLocaleDateString('ar-IQ') + ' — اجتماع الصباح</span></div>'
      + '<div class="wo-board-cols">'
      + col('⏰ مستحق اليوم/متأخر', dueToday, woItem)
      + col('📅 غداً', dueTomorrow, woItem)
      + col('🔥 أولوية عالية', highPrio, woItem)
      + col('🏭 طابور المكائن', queueToday, x => '<div class="wo-board-item" onclick="woOpenFile(\'' + (x.q.workOrderId || '') + '\')"><span>' + esc((x.m.name || '')) + '</span><span class="wo-pill info">' + esc(String(x.q.title || '').slice(0, 18)) + '</span></div>')
      + col('📦 نواقص المواد', shortages, x => '<div class="wo-board-item" onclick="woOpenFile(\'' + x.wo.id + '\')"><span>' + esc(x.r.materialSnapshot.name) + '</span><span class="wo-pill bad">' + esc(x.wo.ref) + '</span></div>')
      + col('🧪 بانتظار QC', qcWaiting, woItem)
      + col('🚚 تسليمات جاهزة', deliveries, woItem)
      + col('👥 موظفون مضغوطون', overloaded, x => '<div class="wo-board-item"><span>' + esc(x.name) + '</span><span class="wo-pill warn">' + x.n + ' مهام</span></div>')
      + '</div></div>';
  }
  function injectCommandCenter() {
    try {
      const body = document.getElementById('commandCenterBody');
      if (!body) return;
      const old1 = document.getElementById('woCcAlerts'); if (old1) old1.remove();
      const old2 = document.getElementById('woCcBoard'); if (old2) old2.remove();
      const wrap = document.createElement('div');
      wrap.innerHTML = ccBoardHtml() + ccAlertsHtml();
      while (wrap.firstChild) body.insertBefore(wrap.firstChild === wrap.lastChild ? wrap.firstChild : wrap.firstChild, body.firstChild.nextSibling ? body.firstChild : null) && null;
      // simpler, deterministic: prepend board then alerts at top
    } catch (_) {}
  }
  function injectCommandCenterSafe() {
    try {
      const body = document.getElementById('commandCenterBody');
      if (!body) return;
      const old1 = document.getElementById('woCcAlerts'); if (old1) old1.remove();
      const old2 = document.getElementById('woCcBoard'); if (old2) old2.remove();
      body.insertAdjacentHTML('afterbegin', ccAlertsHtml());
      body.insertAdjacentHTML('afterbegin', ccBoardHtml());
    } catch (e) { console.warn('WO command center inject failed', e); }
  }
  function wireCommandCenter() {
    if (window.__woCcWrapped) return;
    if (typeof window.renderCommandCenter !== 'function') return;
    const orig = window.renderCommandCenter;
    window.renderCommandCenter = function () {
      const r = orig.apply(this, arguments);
      try { injectCommandCenterSafe(); } catch (_) {}
      return r;
    };
    window.__woCcWrapped = true;
  }

  /* ════════════════════ Jarvis tools ════════════════════ */
  function woByRefOrTitle(q) {
    q = String(q || '').trim();
    if (!q) return null;
    const lc = q.toLowerCase();
    return WOs().find(w => String(w.ref).toLowerCase() === lc)
      || WOs().find(w => String(w.ref).toLowerCase().includes(lc) || String(w.title).toLowerCase().includes(lc) || String((w.customerSnapshot || {}).name || '').toLowerCase().includes(lc))
      || null;
  }
  function summarizeWo(wo) {
    const tasks = woTasks(wo); const g = gateReadyForDelivery(wo); const c = woCosting(wo);
    return wo.ref + ' «' + wo.title + '» للزبون ' + ((wo.customerSnapshot || {}).name || '—')
      + '\nالحالة: ' + STATE_AR[wo.state] + (wo.deadline ? ' · الموعد ' + wo.deadline + (isOverdue(wo) ? ' (متأخر!)' : '') : '')
      + '\nالمهام: ' + tasks.filter(taskDone).length + '/' + tasks.length + ' منجزة'
      + '\nالمواد: ' + (woReservations(wo.id).some(r => r.status === 'shortage') ? '⚠️ نقص' : 'مؤمّنة')
      + '\nQC: ' + (!wo.qcRequired ? 'غير مطلوب' : woQcRecords(wo).some(q => q.result === 'fail') ? 'فاشل' : woQcRecords(wo).every(q => q.result === 'pass') && woQcRecords(wo).length ? 'ناجح' : 'بانتظار')
      + (c.quoted ? '\nالسعر ' + fmt(c.quoted) + ' · ربح متوقع ' + fmt(c.expProfit) + ' (' + c.margin.toFixed(0) + '%)' : '')
      + (g.ok ? '\n✅ مؤهل للتسليم' : '\n⛔ عوائق: ' + g.reasons.join('؛ '));
  }
  function wireJarvis() {
    try {
      if (!window.JarvisBrain || !window.JarvisBrain.tools) return false;
      const T = window.JarvisBrain.tools;
      if (T.summarize_work_order) return true;
      T.summarize_work_order = {
        risk: 'safe', desc_en: 'Summarize a work order by ref or title.', desc_ar: 'لخّص أمر عمل بالمرجع أو العنوان.',
        params: { ref: 'WO ref like WO-2026-0001 or part of the title' },
        run: function (args) { const wo = woByRefOrTitle(args && (args.ref || args.title || args.q)); return wo ? { ok: true, message: summarizeWo(wo) } : { ok: false, message: 'لم أجد أمر العمل.' }; }
      };
      T.work_order_blockers = {
        risk: 'safe', desc_en: 'Explain why a work order is blocked and suggest next action.', desc_ar: 'لماذا أمر العمل معاق وما الإجراء التالي.',
        params: { ref: 'WO ref or title' },
        run: function (args) {
          const wo = woByRefOrTitle(args && (args.ref || args.title || args.q));
          if (!wo) return { ok: false, message: 'لم أجد أمر العمل.' };
          const g = gateReadyForDelivery(wo);
          const na = nextActionFor(wo);
          return { ok: true, message: (g.ok ? 'لا عوائق ✅' : 'العوائق:\n• ' + g.reasons.join('\n• ')) + (na ? '\nالإجراء التالي: ' + na.label : '') };
        }
      };
      T.todays_urgent_jobs = {
        risk: 'safe', desc_en: 'List today\'s due/overdue and high-priority jobs.', desc_ar: 'أعمال اليوم المستحقة والمستعجلة.',
        params: {},
        run: function () {
          const t = todayIso();
          const list = WOs().filter(w => !['delivered', 'closed', 'cancelled'].includes(w.state) && (w.deadline === t || isOverdue(w) || ['high', 'urgent'].includes(String(w.priority))));
          if (!list.length) return { ok: true, message: 'لا أعمال مستعجلة اليوم ✅' };
          return { ok: true, message: list.slice(0, 10).map(w => '• ' + w.ref + ' ' + w.title + ' — ' + STATE_AR[w.state] + (w.deadline ? ' (موعد ' + w.deadline + ')' : '')).join('\n') };
        }
      };
      T.wo_missing_materials = {
        risk: 'safe', desc_en: 'List material shortages across work orders.', desc_ar: 'نواقص المواد عبر أوامر العمل.',
        params: {},
        run: function () {
          const rows = O().materialReservations.filter(r => r.status === 'shortage' && r.is_active !== false);
          if (!rows.length) return { ok: true, message: 'لا نواقص مواد ✅' };
          return { ok: true, message: rows.slice(0, 10).map(r => '• ' + r.materialSnapshot.name + ' — ' + r.ref).join('\n') };
        }
      };
      T.machine_conflicts = {
        risk: 'safe', desc_en: 'List machine overload/down conflicts.', desc_ar: 'تعارضات وضغط المكائن.',
        params: {},
        run: function () { const cs = machineConflicts(); return { ok: true, message: cs.length ? cs.slice(0, 10).map(c => '• ' + c.text).join('\n') : 'لا تعارضات مكائن ✅' }; }
      };
      T.draft_customer_whatsapp = {
        risk: 'safe', desc_en: 'Draft a WhatsApp ready-for-delivery message for a work order.', desc_ar: 'صياغة رسالة واتساب للزبون عن جاهزية طلبه.',
        params: { ref: 'WO ref or title' },
        run: function (args) { const wo = woByRefOrTitle(args && (args.ref || args.title || args.q)); return wo ? { ok: true, message: whatsappText(wo) } : { ok: false, message: 'لم أجد أمر العمل.' }; }
      };
      T.propose_close_work_order = {
        risk: 'sensitive', desc_en: 'Propose closing/cancelling a work order (manager approval).', desc_ar: 'اقتراح إغلاق/إلغاء أمر عمل (بموافقة المدير).',
        params: { ref: 'WO ref', action: 'close | cancel' },
        run: function (args) {
          const wo = woByRefOrTitle(args && (args.ref || args.q));
          if (!wo) return { ok: false, message: 'لم أجد أمر العمل.' };
          try {
            const ai = (typeof window.getAiControl === 'function') ? window.getAiControl() : null;
            if (ai) {
              if (!Array.isArray(ai.actionQueue)) ai.actionQueue = [];
              ai.actionQueue.unshift({ id: uid('aiprop'), actionId: 'wo_close_proposal', title: 'إغلاق/إلغاء ' + wo.ref, target: 'work_orders', mode: 'approval_required', risk: 'medium', status: 'pending', summary: (args && args.action === 'cancel' ? 'إلغاء' : 'إغلاق') + ' ' + wo.ref + ' — ' + wo.title, affectedRecords: 1, createdAt: nowIso(), source: 'jarvis_brain' });
              save();
              return { ok: true, message: 'وُضع الاقتراح في طابور الموافقة — القرار للمدير.' };
            }
          } catch (_) {}
          return { ok: false, message: 'طابور الموافقات غير متاح.' };
        }
      };
      return true;
    } catch (_) { return false; }
  }

  /* ════════════════════ page wiring ════════════════════ */
  function activatePage() {
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageWorkOrders'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navWorkOrders'); if (nav) nav.classList.add('active');
    window.currentPage = 'work_orders';
    ensureData(); renderPage();
  }
  function wireSwitch() {
    if (window.__woWrapped) return;
    if (typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'work_orders') { try { activatePage(); } catch (e) { console.warn('WO render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__woWrapped = true;
  }
  function init() {
    wireSwitch(); wireCommandCenter(); wireJarvis();
    // Hydrate collections at module load so Route Health and any early reader
    // sees them initialized even before the WO page is first opened.
    let dataReady = false;
    try { dataReady = !!ensureData(); } catch (_) {}
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      wireSwitch(); wireCommandCenter(); wireJarvis();
      try { dataReady = !!ensureData() || dataReady; } catch (_) {}
      if ((dataReady && window.__woWrapped && window.__woCcWrapped) || tries > 80) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const api = {
    render: renderPage, ensureData: ensureData,
    getWO: getWO, list: WOs, transition: function (id, to) { return window.woTransition(id, to); },
    gateReadyForDelivery: gateReadyForDelivery, costing: woCosting,
    alerts: computeAlerts, machineConflicts: machineConflicts,
    states: STATES.slice(), stateLabels: STATE_AR, transitions: TRANSITIONS,
    open: function (id) { window.woOpenFile(id); }
  };
  window.OctagonWorkOrders = api;
  window.PentagonWorkOrders = api;
})();
