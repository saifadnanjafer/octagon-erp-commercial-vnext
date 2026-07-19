(function () {
  'use strict';

  const root = window;
  const services = root.OctagonServices || root.PentagonServices || {};
  root.OctagonServices = services;
  root.PentagonServices = services;

  const TENANT_COLLECTIONS = [
    'employees',
    'contacts',
    'users',
    'stock_moves',
    'quants',
    'transfers',
    'account_moves',
    'journal_entries',
    'account_payments',
    'account_partial_reconciles',
    'finance.customers',
    'finance.transactions',
    'finance.receipts',
    'omni.materials',
    'omni.suppliers',
    'omni.lots',
    'omni.purchaseOrders',
    'omni.jobOrders',
    'omni.workOrderIssues',
    'omni.approvalHub.requests',
    'omni.helpdesk.tickets',
    'omni.fieldService.visits',
    'omni.projectHub.projects',
    'omni.projectHub.tasks',
    'omni.assetRegister.assets',
    'omni.assetRegister.maintenanceLogs',
    'omni.subscriptionHub.plans',
    'omni.subscriptionHub.subscriptions',
    'omni.subscriptionHub.invoices',
    'omni.rentalHub.items',
    'omni.rentalHub.agreements',
    'omni.fleet.vehicles',
    'omni.fleet.fuelLogs',
    'omni.fleet.trips',
    'omni.documents.docs',
    'omni.marketing.campaigns',
    'omni.budgeting.lines',
    'omni.warrantyHub.warranties',
    'omni.warrantyHub.claims',
    'omni.enterpriseSuite.banking.records',
    'omni.enterpriseSuite.ar_ap.records',
    'omni.enterpriseSuite.contracts.records',
    'omni.enterpriseSuite.logistics.records',
    'omni.enterpriseSuite.supplier_portal.records',
    'omni.enterpriseSuite.integration_hub.records',
    'omni.enterpriseSuite.security_center.records',
    'omni.enterpriseSuite.data_quality.records',
    'omni.enterpriseSuite.training_lms.records',
    'omni.enterpriseSuite.scenario_planner.records',
    'omni.enterpriseSuite.device_center.records',
  ];

  function cachedDb() {
    try {
      return (root.OctagonDB || root.PentagonDB)?.getCached?.() || null;
    } catch (_) {
      return null;
    }
  }

  function omniFromDb(db) {
    if (db && db.omni && typeof db.omni === 'object') return db.omni;
    try {
      if (typeof root.omni === 'object' && root.omni) return root.omni;
    } catch (_) {}
    return {};
  }

  function organization(options = {}) {
    const db = options.db || cachedDb();
    return omniFromDb(db).adminSettings?.organization || db?.adminSettings?.organization || {};
  }

  function activeCompanyFromOrg(org = {}) {
    const companies = Array.isArray(org.companies) ? org.companies : [];
    return companies.find(co => co.id === org.activeCompanyId)
      || companies.find(co => co.isPrimary)
      || companies[0]
      || {};
  }

  function activeProfile(options = {}) {
    if (!options.db && typeof root.getActiveOrgProfile === 'function') {
      try {
        const profile = root.getActiveOrgProfile();
        if (profile && profile.companyId) return profile;
      } catch (_) {}
    }
    const org = organization(options);
    const company = activeCompanyFromOrg(org);
    return {
      companyId: company.id || org.activeCompanyId || '',
      companyName: company.name || org.name || '',
      currency: org.currency || 'IQD',
      currencySymbol: org.currencySymbol || '',
      logoEmoji: company.logoEmoji || org.logoEmoji || '',
    };
  }

  function enabled(options = {}) {
    if (options.force) return true;
    return !!organization(options).multiTenant;
  }

  function activeCompanyId(options = {}) {
    return activeProfile(options).companyId || '';
  }

  function recordCompanyId(record) {
    if (!record || typeof record !== 'object') return '';
    return record.companyId || record.company_id || record.tenantCompanyId || '';
  }

  function normalizeCollection(collection = '') {
    return String(collection || '').replace(/^omni\./, 'omni.');
  }

  function isTenantCollection(collection = '') {
    const name = normalizeCollection(collection);
    return TENANT_COLLECTIONS.includes(name) || TENANT_COLLECTIONS.includes(`omni.${name}`);
  }

  function userGroups(user) {
    try {
      if (root.PermissionService && typeof root.PermissionService.resolveGroups === 'function') {
        const groups = root.PermissionService.resolveGroups(user);
        if (Array.isArray(groups)) return groups;
      }
    } catch (_) {}
    const resolvedUser = user || root.PentagonAuth?.getCurrentUser?.() || root.OctagonAuth?.getCurrentUser?.() || {};
    return Array.isArray(resolvedUser.groups) ? resolvedUser.groups : [];
  }

  function canBypass(options = {}) {
    if (!options.allowCrossCompany && !options.forceCrossCompany) return false;
    return userGroups(options.user).includes('system.admin');
  }

  function shouldEnforce(collection, record, options = {}) {
    if (!enabled(options)) return false;
    if (options.scope === false) return false;
    return options.force
      || isTenantCollection(collection)
      || !!recordCompanyId(record)
      || options.collectionScoped === true;
  }

  function matchesActiveCompany(record, options = {}) {
    const companyId = activeCompanyId(options);
    if (!companyId) return true;
    const rowCompany = recordCompanyId(record);
    if (!rowCompany) return options.includeGlobal !== false;
    return rowCompany === companyId || canBypass(options);
  }

  function scope(collection, records, options = {}) {
    if (Array.isArray(collection)) {
      options = records || {};
      records = collection;
      collection = options.collection || '';
    }
    const list = Array.isArray(records) ? records : [];
    if (!shouldEnforce(collection, null, options)) return list;
    return list.filter(record => matchesActiveCompany(record, options));
  }

  function canRead(collection, record, options = {}) {
    if (!shouldEnforce(collection, record, options)) return true;
    return matchesActiveCompany(record, options);
  }

  function assertTenantAccess(collection, record, action = 'read', options = {}) {
    if (!shouldEnforce(collection, record, options)) return true;
    if (!canRead(collection, record, options)) {
      throw new Error(`Tenant isolation blocked ${action} on ${collection}: record belongs to another company`);
    }
    return true;
  }

  function stamp(record, options = {}) {
    if (!record || typeof record !== 'object') return record;
    const profile = activeProfile(options);
    if (!profile.companyId) return record;
    const existing = recordCompanyId(record);
    if (existing && existing !== profile.companyId && !canBypass(options)) {
      throw new Error('Tenant isolation blocked cross-company companyId assignment');
    }
    if (existing && !options.force) return record;
    record.companyId = profile.companyId;
    record.companyName = profile.companyName || record.companyName || '';
    if (profile.currency && !record.currency) record.currency = profile.currency;
    if (profile.currencySymbol && !record.currencySymbol) record.currencySymbol = profile.currencySymbol;
    if (!record.tenantStampedAt) record.tenantStampedAt = (services.utils?.now ? services.utils.now() : new Date().toISOString());
    return record;
  }

  function prepareCreate(collection, data = {}, options = {}) {
    if (!data || typeof data !== 'object') return data;
    return stamp(data, { ...options, collection });
  }

  function prepareUpdate(collection, record, changes = {}, options = {}) {
    assertTenantAccess(collection, record, 'update', options);
    if (changes && typeof changes === 'object') {
      const nextCompany = changes.companyId || changes.company_id || changes.tenantCompanyId || '';
      const active = activeCompanyId(options);
      if (nextCompany && active && nextCompany !== active && !canBypass(options)) {
        throw new Error('Tenant isolation blocked moving a record to another company');
      }
    }
    if (!recordCompanyId(record)) stamp(record, { ...options, collection });
    return changes;
  }

  function statusForRecords(records = [], options = {}) {
    const companyId = activeCompanyId(options);
    const active = records.filter(row => recordCompanyId(row) === companyId).length;
    const missing = records.filter(row => !recordCompanyId(row)).length;
    const foreign = records.filter(row => {
      const id = recordCompanyId(row);
      return id && id !== companyId;
    }).length;
    return { total: records.length, active, missing, foreign };
  }

  const TenantService = {
    collections: () => TENANT_COLLECTIONS.slice(),
    organization,
    activeProfile,
    activeCompanyId,
    enabled,
    recordCompanyId,
    isTenantCollection,
    canBypass,
    scope,
    canRead,
    assertAccess: assertTenantAccess,
    assertMutable(collection, record, options = {}) {
      return prepareUpdate(collection, record, {}, options);
    },
    stamp,
    prepareCreate,
    prepareUpdate,
    statusForRecords,
  };

  root.TenantService = TenantService;
  root.OctagonTenantService = TenantService;
  root.PentagonTenantService = TenantService;
  services.tenant = TenantService;
})();
