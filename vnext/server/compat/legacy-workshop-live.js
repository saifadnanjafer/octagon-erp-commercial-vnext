// clean-room; behavior modeled on the frozen workshop bridge contract (proprietary self, not copied)
// Live read-only legacy workshop access over the SANITIZED fixture only.
// Production paths are structurally unreachable (LegacySnapshotStore rejects
// anything outside vnext-fixtures). Every response carries the source
// identifier, load timestamp, and content fingerprint; writes are rejected.
'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

const COLLECTIONS = ['omni.workshopTimesheetCases', 'omni.workshopAdvances', 'omni.employeeAttendance', 'omni.jobOrders'];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function createLegacyWorkshopLive(options = {}) {
  const fixturePath = options.fixturePath || path.join('vnext-fixtures', 'legacy-sanitized.db');
  let store = null;
  let loadedAt = null;
  const cache = new Map();

  function ensureStore() {
    if (store) return store;
    // LegacySnapshotStore enforces the vnext-fixtures jail and read-only SQLite.
    const { LegacySnapshotStore } = require('./LegacySnapshotStore.mjs');
    store = new LegacySnapshotStore(fixturePath);
    loadedAt = new Date().toISOString();
    return store;
  }
  function rowsOf(collection) {
    if (!COLLECTIONS.includes(collection)) { const error = new Error('unknown legacy workshop collection'); error.statusCode = 404; error.code = 'LEGACY_COLLECTION_UNKNOWN'; throw error; }
    if (!cache.has(collection)) {
      let rows = [];
      try { rows = ensureStore().listCollection(collection); } catch (error) { if (!/no such table|not found/i.test(error.message)) throw error; }
      cache.set(collection, { rows, fingerprint: fingerprint(rows) });
    }
    return cache.get(collection);
  }
  function decorate(collection, entry, row) {
    return { legacy_id: row.legacyId, source: collection, source_file: fixturePath, source_loaded_at: loadedAt, source_fingerprint: entry.fingerprint, read_only: true, attributes: row.attributes };
  }
  return {
    mode: 'read-only',
    collections: COLLECTIONS,
    meta() {
      return {
        mode: 'read-only', source_file: fixturePath, loaded_at: (ensureStore(), loadedAt),
        collections: COLLECTIONS.map((collection) => { const entry = rowsOf(collection); return { collection, count: entry.rows.length, fingerprint: entry.fingerprint }; }),
      };
    },
    list(collection, query = {}) {
      const entry = rowsOf(collection);
      const search = String(query.search || '').trim().toLowerCase();
      const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));
      const offset = Math.max(0, Number(query.offset || 0));
      let rows = entry.rows;
      if (search) rows = rows.filter((row) => JSON.stringify(row.attributes).toLowerCase().includes(search) || String(row.legacyId).toLowerCase().includes(search));
      for (const [key, value] of Object.entries(query)) {
        if (['search', 'limit', 'offset'].includes(key) || value == null || value === '') continue;
        rows = rows.filter((row) => String(row.attributes?.[key] ?? '') === String(value));
      }
      return { total: rows.length, offset, limit, read_only: true, source: collection, source_fingerprint: entry.fingerprint, rows: rows.slice(offset, offset + limit).map((row) => decorate(collection, entry, row)) };
    },
    get(collection, legacyId) {
      const entry = rowsOf(collection);
      const row = entry.rows.find((item) => String(item.legacyId) === String(legacyId));
      if (!row) { const error = new Error('legacy record not found'); error.statusCode = 404; error.code = 'LEGACY_RECORD_NOT_FOUND'; throw error; }
      return decorate(collection, entry, row);
    },
    verifyFingerprints() {
      cache.clear();
      return COLLECTIONS.map((collection) => { const entry = rowsOf(collection); return { collection, fingerprint: entry.fingerprint, count: entry.rows.length }; });
    },
    mutate() { const error = new Error('Legacy workshop bridge is read-only'); error.statusCode = 405; error.code = 'LEGACY_READ_ONLY'; throw error; },
  };
}

module.exports = { createLegacyWorkshopLive };
