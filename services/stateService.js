(function () {
  'use strict';

  const root = window;
  const services = root.PentagonServices || {};
  root.PentagonServices = services;

  const DEFAULT_STATE_MACHINES = {
    stock_moves: {
      labels: {
        draft: 'مسودة',
        confirmed: 'مؤكد',
        assigned: 'محجوز',
        done: 'منجز',
        cancel: 'ملغي',
      },
      transitions: {
        draft: ['confirmed', 'cancel'],
        confirmed: ['assigned', 'done', 'cancel'],
        assigned: ['done', 'cancel'],
        done: [],
        cancel: [],
      },
    },
    journal_entries: {
      labels: {
        draft: 'مسودة',
        posted: 'مرحل',
        cancel: 'ملغي',
      },
      transitions: {
        draft: ['posted', 'cancel'],
        posted: [],
        cancel: [],
      },
    },
  };

  DEFAULT_STATE_MACHINES.account_moves = {
    labels: {
      draft: 'مسودة',
      posted: 'مرحّل',
      cancel: 'ملغي',
    },
    transitions: {
      draft: ['posted', 'cancel'],
      posted: ['draft', 'cancel'],
      cancel: [],
    },
  };

  const StateService = {
    machines: { ...DEFAULT_STATE_MACHINES },

    register(collection, config) {
      this.machines[collection] = config;
      return config;
    },

    async transition(collection, recordId, newState) {
      const machine = this.machines[collection];
      if (!machine) throw new Error(`آلة الحالة غير معرفة: ${collection}`);

      const record = await root.RecordService.get(collection, recordId);
      if (!record) throw new Error('السجل غير موجود');

      const oldState = record.state || machine.initial || 'draft';
      const allowed = machine.transitions?.[oldState] || [];
      if (!allowed.includes(newState)) {
        const fromLabel = machine.labels?.[oldState] || oldState;
        const toLabel = machine.labels?.[newState] || newState;
        throw new Error(`لا يمكن الانتقال من "${fromLabel}" إلى "${toLabel}"`);
      }

      const updated = await root.RecordService.update(collection, recordId, { state: newState });
      await root.AuditService.createEvent(`${collection}.state_change`, recordId, {
        from: oldState,
        to: newState,
        from_label: machine.labels?.[oldState] || oldState,
        to_label: machine.labels?.[newState] || newState,
      });

      if (typeof machine.onTransition === 'function') {
        await machine.onTransition(updated, oldState, newState);
      }

      return updated;
    },

    async getAvailableTransitions(collection, recordId) {
      const machine = this.machines[collection];
      if (!machine) return [];
      const record = await root.RecordService.get(collection, recordId);
      const state = record?.state || machine.initial || 'draft';
      return (machine.transitions?.[state] || []).map(nextState => ({
        state: nextState,
        label: machine.labels?.[nextState] || nextState,
      }));
    },
  };

  root.STATE_MACHINES = StateService.machines;
  root.StateService = StateService;
  services.state = StateService;
})();
