/*
 * OCTAGON OMNISYSTEM - modules/state-registry.js
 *
 * T3.4: unified document-state registry. Mirrors existing module states first;
 * adoption by modules happens later, one module at a time.
 */
(function () {
  'use strict';

  function clone(value) {
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalize(value) {
    return String(value == null ? '' : value).trim();
  }

  function userId() {
    try {
      if (window.PentagonAuth && typeof window.PentagonAuth.getCurrentUser === 'function') {
        const user = window.PentagonAuth.getCurrentUser();
        return user?.id || user?.name || 'system';
      }
    } catch (_) {}
    return 'system';
  }

  const definitions = {
    jobOrder: {
      field: 'state',
      labels: {
        draft: 'مسودة',
        quoted: 'مسعّر',
        approved: 'موافق عليه',
        planned: 'مخطط',
        materials_reserved: 'المواد محجوزة',
        in_production: 'قيد التنفيذ',
        quality_check: 'فحص الجودة',
        rework: 'إعادة عمل',
        ready_for_delivery: 'جاهز للتسليم',
        delivered: 'تم التسليم',
        closed: 'مغلق',
        cancelled: 'ملغي',
      },
      states: ['draft', 'quoted', 'approved', 'planned', 'materials_reserved', 'in_production', 'quality_check', 'rework', 'ready_for_delivery', 'delivered', 'closed', 'cancelled'],
      transitions: {
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
        cancelled: ['draft'],
      },
    },
    ticket: {
      field: 'status',
      labels: { new: 'جديد', open: 'مفتوح', pending: 'معلق', resolved: 'محلول', closed: 'مغلق' },
      states: ['new', 'open', 'pending', 'resolved', 'closed'],
      transitions: {
        new: ['open', 'pending', 'closed'],
        open: ['pending', 'resolved', 'closed'],
        pending: ['open', 'resolved', 'closed'],
        resolved: ['closed', 'open'],
        closed: ['open'],
      },
    },
    subscription: {
      field: 'status',
      labels: { active: 'نشط', paused: 'موقوف', cancelled: 'ملغى' },
      states: ['active', 'paused', 'cancelled'],
      transitions: {
        active: ['paused', 'cancelled'],
        paused: ['active', 'cancelled'],
        cancelled: [],
      },
    },
    invoiceDraft: {
      field: 'status',
      labels: { draft: 'مسودة', issued: 'صادرة', paid: 'مدفوعة', cancelled: 'ملغاة' },
      states: ['draft', 'issued', 'paid', 'cancelled'],
      transitions: {
        draft: ['issued', 'cancelled'],
        issued: ['paid', 'cancelled'],
        paid: [],
        cancelled: ['draft'],
      },
    },
    leaveRequest: {
      field: 'status',
      labels: { pending: 'قيد الموافقة', approved: 'موافق عليها', rejected: 'مرفوضة' },
      states: ['pending', 'approved', 'rejected'],
      transitions: {
        pending: ['approved', 'rejected'],
        approved: [],
        rejected: ['pending'],
      },
    },
    maintenance: {
      field: 'status',
      labels: { in_service: 'في الخدمة', under_maintenance: 'تحت الصيانة', retired: 'مستبعد' },
      states: ['in_service', 'under_maintenance', 'retired'],
      transitions: {
        in_service: ['under_maintenance', 'retired'],
        under_maintenance: ['in_service', 'retired'],
        retired: [],
      },
    },
    equipment: {
      field: 'status',
      labels: { operational: 'صالحة للعمل', maintenance: 'تحت الصيانة', broken: 'عاطلة / تالفة', dispatched: 'خارج الورشة' },
      states: ['operational', 'maintenance', 'broken', 'dispatched'],
      transitions: {
        operational: ['maintenance', 'broken', 'dispatched'],
        maintenance: ['operational', 'broken'],
        broken: ['maintenance', 'operational'],
        dispatched: ['operational', 'maintenance', 'broken'],
      },
    },
  };

  function definition(type) {
    return definitions[type] || null;
  }

  function stateOf(type, record) {
    const def = definition(type);
    if (!def || !record) return '';
    return normalize(record[def.field]);
  }

  function isKnownState(type, state) {
    const def = definition(type);
    return !!def && def.states.includes(normalize(state));
  }

  function allowedTargets(type, fromState) {
    const def = definition(type);
    if (!def) return [];
    const from = normalize(fromState);
    return (def.transitions[from] || []).slice();
  }

  function canTransition(type, fromState, toState) {
    const def = definition(type);
    const from = normalize(fromState);
    const to = normalize(toState);
    if (!def) return { ok: false, error: `unknown type: ${type}` };
    if (!def.states.includes(from)) return { ok: false, error: `unknown current state: ${from}` };
    if (!def.states.includes(to)) return { ok: false, error: `unknown target state: ${to}` };
    if (from === to) return { ok: true, noop: true };
    if (!(def.transitions[from] || []).includes(to)) {
      return { ok: false, error: `illegal transition: ${type} ${from} -> ${to}` };
    }
    return { ok: true };
  }

  function transition(type, record, toState, options) {
    const opts = options || {};
    const def = definition(type);
    if (!record || typeof record !== 'object') return { ok: false, error: 'record is required' };
    if (!def) return { ok: false, error: `unknown type: ${type}` };
    const from = stateOf(type, record);
    const check = canTransition(type, from, toState);
    if (!check.ok) return { ...check, type, from, to: normalize(toState) };
    const target = opts.mutate ? record : clone(record);
    target[def.field] = normalize(toState);
    target.updated_at = target.updated_at || nowIso();
    target.updatedAt = nowIso();
    target.stateChangedAt = nowIso();
    target.stateChangedBy = opts.userId || userId();
    if (!Array.isArray(target.stateHistory)) target.stateHistory = [];
    target.stateHistory.push({
      from,
      to: normalize(toState),
      at: target.stateChangedAt,
      by: target.stateChangedBy,
      reason: opts.reason || '',
    });
    return { ok: true, type, from, to: normalize(toState), record: target, mutated: !!opts.mutate, noop: !!check.noop };
  }

  function apply(type, record, toState, options) {
    return transition(type, record, toState, { ...(options || {}), mutate: true });
  }

  function label(type, state) {
    const def = definition(type);
    const key = normalize(state);
    return def?.labels?.[key] || key;
  }

  function registerType(type, config) {
    if (!type || !config || !Array.isArray(config.states)) return { ok: false, error: 'type and states are required' };
    definitions[type] = {
      field: config.field || 'status',
      labels: { ...(config.labels || {}) },
      states: config.states.slice(),
      transitions: { ...(config.transitions || {}) },
    };
    return { ok: true, type };
  }

  const api = {
    definitions,
    definition,
    states: type => (definition(type)?.states || []).slice(),
    transitions: type => ({ ...(definition(type)?.transitions || {}) }),
    stateOf,
    isKnownState,
    allowedTargets,
    canTransition,
    transition,
    apply,
    label,
    registerType,
  };

  window.OctagonStates = api;
  window.PentagonStates = api;
})();
