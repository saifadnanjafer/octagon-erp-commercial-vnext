/*
 * OCTAGON OMNISYSTEM - modules/repo.js
 *
 * Thin repository facade for NEW code. It routes schema-mapped collection keys
 * to the existing data owners; it does not migrate old modules or bypass the
 * established save paths.
 */
(function (root) {
  'use strict';

  const DEFAULT_ID_FIELD = 'id';
  const FROZEN_KEY_RE = /(^employees$|^omni\.employees$|attendance|timesheet|payroll)/i;
  const TOP_LEVEL_READERS = {
    employees: () => (typeof employees !== 'undefined' ? employees : root.employees),
  };

  class RepoError extends Error {
    constructor(message, detail = {}) {
      super(message);
      this.name = 'RepoError';
      this.detail = detail;
    }
  }

  function schemaRegistry() {
    return root.OctagonSchema || { collections: {}, validate: () => ({ ok: true, errors: [] }) };
  }

  function schemaFor(key) {
    return schemaRegistry().collections?.[key] || {};
  }

  function layerFor(key) {
    return schemaFor(key).layer || 'omni';
  }

  function idFieldFor(key) {
    return schemaFor(key).idField || DEFAULT_ID_FIELD;
  }

  function clone(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_) {}
    }
    return JSON.parse(JSON.stringify(value));
  }

  function getPath(key, layer) {
    const parts = String(key || '').split('.').filter(Boolean);
    if (layer === 'omni' && parts[0] === 'omni') return parts.slice(1);
    if (layer === 'legacy-finance' && parts[0] === 'finance') return parts.slice(1);
    return parts;
  }

  function readAt(base, pathParts) {
    return pathParts.reduce((current, part) => (current == null ? undefined : current[part]), base);
  }

  function ensureParent(base, pathParts) {
    if (!base || typeof base !== 'object') throw new RepoError('مخزن البيانات غير متاح', { path: pathParts.join('.') });
    if (!pathParts.length) return { parent: null, prop: '', value: base };
    let parent = base;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!parent[part] || typeof parent[part] !== 'object') parent[part] = {};
      parent = parent[part];
    }
    const prop = pathParts[pathParts.length - 1];
    if (!Array.isArray(parent[prop])) parent[prop] = [];
    return { parent, prop, value: parent[prop] };
  }

  function ensureOmniRoot() {
    if (typeof root.ensureOmni === 'function') return root.ensureOmni();
    if (typeof omni !== 'undefined' && omni) return omni;
    if (!root.omni) root.omni = {};
    return root.omni;
  }

  function readOmniRoot() {
    if (typeof omni !== 'undefined' && omni) return omni;
    return root.omni || ensureOmniRoot();
  }

  function ensureLegacyFinanceRoot() {
    if (typeof root.ensureFinance === 'function') return root.ensureFinance();
    if (typeof finance !== 'undefined' && finance) return finance;
    if (!root.finance) root.finance = {};
    return root.finance;
  }

  function readLegacyFinanceRoot() {
    if (typeof root.ensureFinance === 'function') return root.ensureFinance();
    if (typeof finance !== 'undefined' && finance) return finance;
    return root.finance || ensureLegacyFinanceRoot();
  }

  function cachedDb() {
    const DB = root.OctagonDB || root.PentagonDB;
    if (!DB) return null;
    if (typeof DB.getCached === 'function') return DB.getCached() || DB.cache || null;
    return DB.cache || null;
  }

  async function loadDb() {
    const DB = root.OctagonDB || root.PentagonDB;
    if (!DB || typeof DB.load !== 'function') throw new RepoError('PentagonDB غير متاح');
    return cachedDb() || DB.load();
  }

  async function resolveReadTarget(key) {
    const layer = layerFor(key);
    if (layer === 'omni') return { layer, base: readOmniRoot(), path: getPath(key, layer) };
    if (layer === 'legacy-finance') return { layer, base: readLegacyFinanceRoot(), path: getPath(key, layer) };
    if (layer === 'pentagondb') return { layer, base: await loadDb(), path: getPath(key, layer) };
    if (layer === 'top-level') {
      const reader = TOP_LEVEL_READERS[key];
      return { layer, base: reader ? reader() : root[key], path: [] };
    }
    return { layer, base: readOmniRoot(), path: getPath(key, layer) };
  }

  function assertWritableKey(key) {
    if (FROZEN_KEY_RE.test(String(key || ''))) {
      throw new RepoError('هذا المسار ضمن المنطقة المجمدة ولا يسمح Repo بتعديله', { key });
    }
  }

  function aclDetail(key, action, options = {}) {
    if (options.skipAcl) return { ok: true, skipped: true };
    const acl = root.Acl || root.OctagonAcl;
    if (!acl) return { ok: true, skipped: true };
    try {
      if (typeof acl.explain === 'function') {
        const detail = acl.explain(key, action, options.role);
        if (!detail.group) return { ok: true, skipped: true, detail };
        return detail;
      }
      if (typeof acl.groupForCollection === 'function' && typeof acl.can === 'function') {
        const group = acl.groupForCollection(key);
        if (!group) return { ok: true, skipped: true };
        return { ok: acl.can(key, action, options.role), group, required: action };
      }
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
    return { ok: true, skipped: true };
  }

  function assertAcl(key, action, options = {}) {
    const detail = aclDetail(key, action, options);
    if (!detail.ok) {
      throw new RepoError('الصلاحيات لا تسمح بهذه العملية', { key, action, acl: detail });
    }
    return detail;
  }

  function validateRecord(key, record, options = {}) {
    const registry = schemaRegistry();
    const result = typeof registry.validate === 'function' ? registry.validate(key, record) : { ok: true, errors: [] };
    if (result && result.ok === false) {
      if (typeof registry.logViolation === 'function') registry.logViolation(key, result);
      if (registry.ENFORCE || options.strictSchema) {
        throw new RepoError('فشل فحص مخطط البيانات', { key, validation: result });
      }
    }
    return result || { ok: true, errors: [] };
  }

  function makeRecordId(key) {
    if (typeof root.makeId === 'function') return root.makeId(String(key).split('.').pop() || 'rec');
    return `${String(key).split('.').pop() || 'rec'}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function matchFilter(record, filter) {
    if (!filter) return true;
    if (typeof filter === 'function') return !!filter(record);
    if (filter && typeof filter === 'object') {
      return Object.keys(filter).every(key => record && record[key] === filter[key]);
    }
    return true;
  }

  function saveOmniLike(rootObject, key, record, options = {}) {
    const path = getPath(key, layerFor(key));
    const target = ensureParent(rootObject, path);
    const list = target.value;
    const idField = idFieldFor(key);
    const next = { ...(record || {}) };
    if (!next[idField]) next[idField] = makeRecordId(key);
    validateRecord(key, next, options);
    const index = list.findIndex(item => item && item[idField] === next[idField]);
    const before = index >= 0 ? clone(list[index]) : null;
    if (index >= 0) list[index] = { ...list[index], ...next };
    else list.push(next);
    if (typeof root.saveData === 'function') root.saveData();
    return { record: clone(index >= 0 ? list[index] : next), before, after: clone(index >= 0 ? list[index] : next), action: index >= 0 ? 'update' : 'create' };
  }

  function removeOmniLike(rootObject, key, id) {
    const path = getPath(key, layerFor(key));
    const target = ensureParent(rootObject, path);
    const list = target.value;
    const idField = idFieldFor(key);
    const index = list.findIndex(item => item && item[idField] === id);
    if (index < 0) return { record: null, before: null, action: 'remove_miss' };
    const before = clone(list[index]);
    list.splice(index, 1);
    if (typeof root.saveData === 'function') root.saveData();
    return { record: before, before, action: 'remove' };
  }

  async function savePentagon(key, record, options = {}) {
    const DB = root.OctagonDB || root.PentagonDB;
    if (!DB || typeof DB.mutate !== 'function') throw new RepoError('PentagonDB.mutate غير متاح');
    const idField = idFieldFor(key);
    const next = { ...(record || {}) };
    if (!next[idField]) next[idField] = makeRecordId(key);
    validateRecord(key, next, options);
    let audit = null;
    await DB.mutate(db => {
      const target = ensureParent(db, getPath(key, 'pentagondb'));
      const list = target.value;
      const index = list.findIndex(item => item && item[idField] === next[idField]);
      const before = index >= 0 ? clone(list[index]) : null;
      if (index >= 0) list[index] = { ...list[index], ...next };
      else list.push(next);
      audit = { record: clone(index >= 0 ? list[index] : next), before, after: clone(index >= 0 ? list[index] : next), action: index >= 0 ? 'update' : 'create' };
    });
    return audit;
  }

  async function removePentagon(key, id) {
    const DB = root.OctagonDB || root.PentagonDB;
    if (!DB || typeof DB.mutate !== 'function') throw new RepoError('PentagonDB.mutate غير متاح');
    let audit = { record: null, before: null, action: 'remove_miss' };
    await DB.mutate(db => {
      const target = ensureParent(db, getPath(key, 'pentagondb'));
      const list = target.value;
      const idField = idFieldFor(key);
      const index = list.findIndex(item => item && item[idField] === id);
      if (index < 0) return;
      const before = clone(list[index]);
      list.splice(index, 1);
      audit = { record: before, before, action: 'remove' };
    });
    return audit;
  }

  async function recordChange(key, id, audit, options = {}) {
    if (options.skipAudit || !audit || audit.action === 'remove_miss') return;
    const payload = {
      collectionKey: key,
      action: audit.action,
      before: audit.before,
      after: audit.after || null,
      source: options.source || 'Repo',
    };
    try {
      if (root.TrackChanges && typeof root.TrackChanges.record === 'function') {
        await root.TrackChanges.record(key, id, payload);
        return;
      }
      if (root.AuditService && typeof root.AuditService.createEvent === 'function') {
        await root.AuditService.createEvent(`repo.${audit.action}`, id, payload, { source: options.source || 'Repo' });
      }
    } catch (error) {
      console.warn('[Repo] change tracking failed:', error.message || error);
    }
  }

  async function get(key, id, options = {}) {
    assertAcl(key, 'read', options);
    const target = await resolveReadTarget(key);
    const value = target.path.length ? readAt(target.base, target.path) : target.base;
    if (id === undefined || id === null || id === '') return options.live ? value : clone(value);
    const list = Array.isArray(value) ? value : [];
    const found = list.find(item => item && item[idFieldFor(key)] === id) || null;
    return options.live ? found : clone(found);
  }

  async function list(key, filter, options = {}) {
    const value = await get(key, null, { ...options, live: true });
    const rows = Array.isArray(value) ? value : [];
    const filtered = rows.filter(row => matchFilter(row, filter));
    return options.live ? filtered : clone(filtered);
  }

  async function save(key, record, options = {}) {
    assertWritableKey(key);
    assertAcl(key, 'write', options);
    const layer = layerFor(key);
    let audit;
    if (layer === 'pentagondb') audit = await savePentagon(key, record, options);
    else if (layer === 'legacy-finance') audit = saveOmniLike(ensureLegacyFinanceRoot(), key, record, options);
    else if (layer === 'omni') audit = saveOmniLike(ensureOmniRoot(), key, record, options);
    else if (layer === 'top-level') {
      throw new RepoError('تعديل المسارات العليا غير مدعوم عبر Repo حالياً', { key, layer });
    } else {
      audit = saveOmniLike(ensureOmniRoot(), key, record, options);
    }
    await recordChange(key, audit.record?.[idFieldFor(key)] || record?.[idFieldFor(key)], audit, options);
    return audit.record;
  }

  async function remove(key, id, options = {}) {
    assertWritableKey(key);
    assertAcl(key, 'write', options);
    const layer = layerFor(key);
    let audit;
    if (layer === 'pentagondb') audit = await removePentagon(key, id);
    else if (layer === 'legacy-finance') audit = removeOmniLike(ensureLegacyFinanceRoot(), key, id);
    else if (layer === 'omni') audit = removeOmniLike(ensureOmniRoot(), key, id);
    else if (layer === 'top-level') {
      throw new RepoError('حذف المسارات العليا غير مدعوم عبر Repo حالياً', { key, layer });
    } else {
      audit = removeOmniLike(ensureOmniRoot(), key, id);
    }
    await recordChange(key, id, audit, options);
    return audit.record;
  }

  root.Repo = {
    get,
    list,
    save,
    remove,
    schema: schemaFor,
    layer: layerFor,
    idField: idFieldFor,
    can: (key, action = 'read', options = {}) => aclDetail(key, action, options).ok,
    error: RepoError,
  };
  root.OctagonRepo = root.Repo;
})(window);
