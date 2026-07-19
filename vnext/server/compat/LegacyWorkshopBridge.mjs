// clean-room; behavior modeled on the frozen workshop bridge contract (proprietary self, not copied)
'use strict';

import crypto from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function createLegacyWorkshopBridge(options = {}) {
  const state = options.fixture || options.legacyState;
  const rows = state && state.omni && Array.isArray(state.omni.jobOrders) ? state.omni.jobOrders : [];
  const sourceFingerprint = fingerprint(rows);
  const readonlyRows = rows.map(clone);
  return Object.freeze({
    source: 'omni.jobOrders',
    mode: 'read-only',
    sourceFingerprint,
    supportedOperations: Object.freeze(['list', 'get', 'fingerprint']),
    list() { return clone(readonlyRows); },
    get(id) { const row = readonlyRows.find(item => String(item.id) === String(id)); return row ? clone(row) : null; },
    fingerprint() { return sourceFingerprint; },
    mutate() { throw new Error('Legacy workshop bridge is read-only'); },
  });
}
