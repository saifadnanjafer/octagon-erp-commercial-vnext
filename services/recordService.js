(function () {
  'use strict';

  const root = window;
  const services = root.PentagonServices || {};
  root.PentagonServices = services;
  const utils = services.utils;

  function collectionPrefix(collection) {
    return String(collection || 'rec').replace(/[^a-z0-9]/gi, '_').slice(0, 10).toUpperCase();
  }

  function tenant() {
    return root.TenantService || services.tenant || null;
  }

  function getCollection(db, collection, create = false) {
    const parts = String(collection || '').split('.').filter(Boolean);
    let cursor = db;
    for (let i = 0; i < parts.length; i += 1) {
      const key = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        if (!Array.isArray(cursor[key])) {
          if (!create) return [];
          cursor[key] = [];
        }
        return cursor[key];
      }
      if (!cursor[key] || typeof cursor[key] !== 'object') {
        if (!create) return [];
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    return [];
  }

  function withAuditFields(collection, data, existing = {}, options = {}) {
    const user = root.PentagonAuth.getCurrentUser();
    const now = utils.now();
    const record = {
      ...data,
      id: data.id || existing.id || utils.makeId(collectionPrefix(collection)),
      created_at: existing.created_at || data.created_at || now,
      created_by: existing.created_by || data.created_by || user?.id || 'system',
      updated_at: now,
      updated_by: user?.id || 'system',
      is_active: data.is_active !== undefined ? data.is_active : existing.is_active !== false,
    };
    return tenant()?.prepareCreate ? tenant().prepareCreate(collection, record, options) : record;
  }

  const RecordService = {
    async create(collection, data = {}) {
      root.PermissionService.require(collection, 'create');
      let created;
      await root.PentagonDB.mutate(db => {
        const records = getCollection(db, collection, true);
        created = withAuditFields(collection, data, {}, { db });
        records.push(created);
      });
      await root.AuditService.createEvent(`${collection}.created`, created.id, created);
      return created;
    },

    async update(collection, recordId, changes = {}) {
      root.PermissionService.require(collection, 'update');
      let updated;
      let oldValues = {};
      let newValues = {};
      const allowedChanges = { ...changes };
      await root.PentagonDB.mutate(db => {
        const record = getCollection(db, collection).find(item => item.id === recordId);
        if (!record) throw new Error('السجل غير موجود');
        ['id', 'created_at', 'created_by'].forEach(field => delete allowedChanges[field]);
        if (tenant()?.prepareUpdate) tenant().prepareUpdate(collection, record, allowedChanges, { db });
        Object.entries(allowedChanges).forEach(([key, value]) => {
          if (record[key] !== value) {
            oldValues[key] = record[key];
            newValues[key] = value;
            record[key] = value;
          }
        });
        if (Object.keys(newValues).length) {
          const user = root.PentagonAuth.getCurrentUser();
          record.updated_at = utils.now();
          record.updated_by = user?.id || 'system';
        }
        updated = record;
      });
      if (Object.keys(newValues).length) {
        await root.AuditService.createEvent(`${collection}.updated`, recordId, { old: oldValues, new: newValues });
      }
      return updated;
    },

    async archive(collection, recordId) {
      root.PermissionService.require(collection, 'delete');
      return this.update(collection, recordId, { is_active: false, archived_at: utils.now() });
    },

    async get(collection, recordId) {
      root.PermissionService.require(collection, 'read');
      const db = await root.PentagonDB.load();
      const record = getCollection(db, collection).find(item => item.id === recordId) || null;
      if (!record) return null;
      return tenant()?.canRead && !tenant().canRead(collection, record, { db }) ? null : record;
    },

    async search(collection, filters = {}, options = {}) {
      root.PermissionService.require(collection, 'read');
      const db = await root.PentagonDB.load();
      let records = getCollection(db, collection);
      if (!options.includeArchived) records = records.filter(record => record.is_active !== false);
      Object.entries(filters).forEach(([key, value]) => {
        records = records.filter(record => record[key] === value);
      });
      if (tenant()?.scope) records = tenant().scope(collection, records, { db, includeGlobal: options.includeGlobal !== false });
      return records;
    },

    _getCollection: getCollection,
    _withAuditFields: withAuditFields,
  };

  root.RecordService = RecordService;
  services.record = RecordService;
})();
