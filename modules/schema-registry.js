/*
 * modules/schema-registry.js — T1.1 (AGENT_EXECUTION_PLAN.md Phase 1)
 *
 * A lightweight, declarative schema for the collections that matter most —
 * Odoo's field definitions without the ORM weight. This file only DEFINES
 * schemas and exposes validate()/validateCollection() — it does NOT wire
 * itself into any write path. That's T1.2 (the two client choke-points:
 * PentagonDB.mutate and saveData()) and T1.3 (the server write guard).
 *
 * Loaded in index.html BEFORE app.js (see Appendix A file map).
 *
 * Collection paths below were verified against the live database.json
 * snapshot and each owning module's ensureData()/O() accessor on
 * 2026-07-12, not copied from the illustrative example in the plan —
 * several differ from it (e.g. customers live at `finance.customers`,
 * not `omni.customers`; `employees` is a bare top-level global, not
 * `omni.employees`).
 *
 * `layer` tells a future choke-point which accessor reaches a collection:
 *   'omni'          (default) — the bare `omni` global (NOT window.omni)
 *   'top-level'     — a bare top-level global variable, e.g. `employees`
 *   'legacy-finance'— window.ensureFinance() / addFinanceTransaction()
 *   'pentagondb'    — PentagonDB.getCached() / PentagonDB.mutate()
 */
(function () {
  'use strict';

  const ENFORCE_KEY = 'octagon_schema_enforce';
  const VIOLATIONS_CAP = 200;

  const OctagonSchema = {
    // T1.6 (2026-07-16): the 1-week warn window (started T1.1, 2026-07-12)
    // showed zero schema violations across a full 36-page navigation sweep,
    // so the default flips to true for new writes only — existing bad
    // records are never rejected on read, this is a boundary guard, not a
    // migration. localStorage still overrides: explicit 'true'/'false'
    // wins over this default, so setEnforce(false) via the settings UI
    // still works to temporarily relax it.
    ENFORCE: localStorage.getItem(ENFORCE_KEY) === null
      ? true
      : localStorage.getItem(ENFORCE_KEY) === 'true',

    collections: {
      // ── Frozen zone (§1) — read-only for every lane. protect:true means
      // validateCollection() ALWAYS rejects an empty-array overwrite of a
      // currently non-empty collection, even in warn mode. This codifies
      // the existing 3-layer employee-reload protection as schema law.
      'employees': {
        layer: 'top-level', idField: 'id', required: ['id', 'name'], protect: true
      },

      // ── Core workshop / operations (bare `omni.*`)
      'omni.jobOrders': {
        idField: 'id', required: ['id', 'ref', 'state'],
        types: { ref: 'string', state: 'string' }
      },
      'omni.machines': {
        idField: 'id', required: ['id', 'name', 'status']
      },
      'omni.materials': { // "inventory" — advanced-inventory.js is add-only/preview over this
        idField: 'id', required: ['id', 'name']
      },
      'omni.taskManager': {
        // Deeply nested tree (spaces > departments > sections > taskTypes >
        // tasks), not a flat array — no idField/required here, just a
        // marker entry so the collection isn't silently uncovered. Skip
        // per-record validation until/unless a flat task index exists.
        nested: true
      },
      'omni.opPacks': {
        idField: 'id', required: ['id', 'name', 'steps']
      },
      'omni.suppliers': {
        idField: 'id', required: ['id', 'name']
      },

      // ── Vertical modules (each owns `omni.<key>.<array>`)
      'omni.pharmacy.products': { idField: 'id', required: ['id', 'name'] },
      'omni.fleet.vehicles': { idField: 'id', required: ['id'] },
      'omni.assetRegister.assets': { idField: 'id', required: ['id'] },
      'omni.subscriptionHub.subscriptions': { idField: 'id', required: ['id'] },
      'omni.helpdesk.tickets': { idField: 'id', required: ['id'] },
      'omni.documents.docs': { idField: 'id', required: ['id'] },
      'omni.loyalty.members': { idField: 'id', required: ['id'] },
      'omni.appointments.bookings': { idField: 'id', required: ['id'] },
      'omni.surveys.surveys': { idField: 'id', required: ['id', 'title'] },
      'omni.visitors.visits': { idField: 'id', required: ['id'] },
      'omni.esign.requests': { idField: 'id', required: ['id'] },
      'omni.events.events': { idField: 'id', required: ['id', 'name'] },
      'omni.knowledge.articles': { idField: 'id', required: ['id'] },
      'omni.peopleOps.leaveRequests': { idField: 'id', required: ['id'] },
      'omni.peopleOps.candidates': { idField: 'id', required: ['id'] },

      // ── Legacy finance (window.ensureFinance() / addFinanceTransaction())
      'finance.customers': {
        layer: 'legacy-finance', idField: 'id', required: ['id', 'name']
      },
      'finance.transactions': {
        layer: 'legacy-finance', idField: 'id', required: ['id']
      },

      // ── v6 double-entry finance (PentagonDB.mutate / .getCached())
      'finance.accounts': {
        layer: 'pentagondb', idField: 'id', required: ['id', 'name', 'type']
      },
      'account_moves': {
        layer: 'pentagondb', idField: 'id', required: ['id', 'journal_id', 'line_ids'],
        validate: rec => {
          if (!window.FinanceService || typeof window.FinanceService.validateBalanced !== 'function') return { ok: true, errors: [] };
          try {
            window.FinanceService.validateBalanced(rec.line_ids || []);
            return { ok: true, errors: [] };
          } catch (e) {
            return { ok: false, errors: [e.message || 'unbalanced move'] };
          }
        }
      }
    },

    // Never throws. Missing collection schema => {ok:true} (unknown
    // collections aren't validated — this is a boundary guard for the
    // collections we've actually mapped, not a whitelist).
    validate(collectionKey, record) {
      const schema = OctagonSchema.collections[collectionKey];
      if (!schema || schema.nested) return { ok: true, errors: [] };
      const errors = [];
      if (!record || typeof record !== 'object') {
        errors.push('record is not an object');
        return { ok: false, errors };
      }
      (schema.required || []).forEach(field => {
        const v = record[field];
        if (v === undefined || v === null || v === '') errors.push(`missing required field: ${field}`);
      });
      if (schema.types) {
        Object.keys(schema.types).forEach(field => {
          const expected = schema.types[field];
          const v = record[field];
          if (v !== undefined && v !== null && typeof v !== expected) {
            errors.push(`field ${field} expected ${expected}, got ${typeof v}`);
          }
        });
      }
      if (typeof schema.validate === 'function') {
        try {
          const custom = schema.validate(record);
          if (custom && custom.ok === false) errors.push(...(custom.errors || ['custom validation failed']));
        } catch (e) {
          // A throwing custom validator must never break the write path.
          errors.push(`validator threw: ${e.message || e}`);
        }
      }
      return { ok: errors.length === 0, errors };
    },

    // Checks emptiness against protect flag first (cheap, catches the
    // employee-wipe class of bug before touching any record), then
    // per-record validation. Never throws.
    validateCollection(collectionKey, array) {
      const schema = OctagonSchema.collections[collectionKey];
      if (!schema || schema.nested) return { ok: true, errors: [], recordErrors: [] };
      if (!Array.isArray(array)) return { ok: false, errors: ['not an array'], recordErrors: [] };
      if (schema.protect && array.length === 0) {
        return { ok: false, errors: [`protect:true collection "${collectionKey}" rejected an empty-array write`], recordErrors: [] };
      }
      const recordErrors = [];
      array.forEach((record, index) => {
        const result = OctagonSchema.validate(collectionKey, record);
        if (!result.ok) recordErrors.push({ index, id: record && record.id, errors: result.errors });
      });
      return { ok: recordErrors.length === 0, errors: [], recordErrors };
    },

    // Ring buffer of the last VIOLATIONS_CAP schema violations, surfaced on
    // `omni.schemaViolations` for the (future) system_check page (T5.1).
    logViolation(collectionKey, detail) {
      try {
        if (typeof ensureOmni === 'function') ensureOmni();
        if (typeof omni === 'undefined' || !omni) return;
        if (!Array.isArray(omni.schemaViolations)) omni.schemaViolations = [];
        omni.schemaViolations.push({
          collectionKey, detail, at: new Date().toISOString(),
          enforced: OctagonSchema.ENFORCE
        });
        if (omni.schemaViolations.length > VIOLATIONS_CAP) {
          omni.schemaViolations.splice(0, omni.schemaViolations.length - VIOLATIONS_CAP);
        }
      } catch (_) { /* logging must never break the write path */ }
      if (!OctagonSchema.ENFORCE) {
        console.warn(`[OctagonSchema] ${collectionKey}:`, detail);
      }
    },

    // Persists across reloads; deliberately manual (no auto-flip) — a human
    // decides when a week of warn-only logging looks clean enough to enforce.
    setEnforce(value) {
      OctagonSchema.ENFORCE = !!value;
      try { localStorage.setItem(ENFORCE_KEY, OctagonSchema.ENFORCE ? 'true' : 'false'); } catch (_) {}
    }
  };

  window.OctagonSchema = OctagonSchema;
})();
