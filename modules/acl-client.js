/*
 * OCTAGON OMNISYSTEM - modules/acl-client.js
 *
 * T3.3 client helper for coarse role x collection access checks. Server
 * enforcement is queued separately; client hiding is only cosmetic.
 */
(function () {
  'use strict';

  const ACCESS_RANK = { none: 0, read: 1, write: 2 };
  const DEFAULT_MATRIX = {
    version: 1,
    groups: {
      finance: { labelAr: 'المالية', collections: ['finance', 'account_moves', 'journal_entries', 'employee_advances', 'payments'] },
      hr_payroll: { labelAr: 'الموارد والرواتب', collections: ['employees', 'payroll_periods', 'omni.peopleOps'] },
      operations: { labelAr: 'التشغيل', collections: ['omni.jobOrders', 'omni.machines', 'omni.materials', 'maintenance_requests', 'work_orders'] },
      crm: { labelAr: 'العملاء والمبيعات', collections: ['contacts', 'omni.suppliers', 'omni.subscriptionHub', 'omni.helpdesk'] },
      admin: { labelAr: 'الإدارة', collections: ['users', 'roles', 'audit_log', 'omni.adminSettings'] },
    },
    roles: {
      manager: { finance: 'write', hr_payroll: 'write', operations: 'write', crm: 'write', admin: 'write' },
      'system.admin': { finance: 'write', hr_payroll: 'write', operations: 'write', crm: 'write', admin: 'write' },
      'workshop.manager': { finance: 'write', hr_payroll: 'write', operations: 'write', crm: 'write', admin: 'write' },
      'finance.manager': { finance: 'write', hr_payroll: 'read', operations: 'read', crm: 'read', admin: 'read' },
      employee: { finance: 'read', hr_payroll: 'none', operations: 'write', crm: 'write', admin: 'none' },
      viewer: { finance: 'read', hr_payroll: 'read', operations: 'read', crm: 'read', admin: 'read' },
    },
    roleAliases: { admin: 'system.admin', system_admin: 'system.admin', finance: 'finance.manager', accountant: 'finance.manager', worker: 'employee', staff: 'employee' },
    defaultRole: 'viewer',
  };

  let matrix = DEFAULT_MATRIX;
  let loaded = false;
  let loading = null;

  function normalizeAccess(value) {
    const key = String(value || 'none').toLowerCase();
    return ACCESS_RANK[key] == null ? 'none' : key;
  }

  function normalizeRole(role) {
    const raw = String(role || '').trim();
    if (!raw) return matrix.defaultRole || 'viewer';
    if (matrix.roles && matrix.roles[raw]) return raw;
    const lowered = raw.toLowerCase().replace(/\s+/g, '.');
    if (matrix.roles && matrix.roles[lowered]) return lowered;
    const alias = matrix.roleAliases && (matrix.roleAliases[raw] || matrix.roleAliases[lowered] || matrix.roleAliases[raw.toLowerCase()]);
    return alias || raw || matrix.defaultRole || 'viewer';
  }

  function currentUser() {
    try {
      if (window.PentagonAuth && typeof window.PentagonAuth.getCurrentUser === 'function') {
        return window.PentagonAuth.getCurrentUser() || null;
      }
    } catch (_) {}
    try {
      const id = localStorage.getItem('octagon_user_id') || localStorage.getItem('pentagon_user_id') || '';
      return id ? { id, role: id === 'system_admin' ? 'system.admin' : '' } : null;
    } catch (_) {
      return null;
    }
  }

  function currentRole() {
    const user = currentUser() || {};
    return normalizeRole(user.role || user.roleId || user.primaryRole || user.type || user.id);
  }

  function rolePolicy(role) {
    const normalized = normalizeRole(role);
    return (matrix.roles && matrix.roles[normalized]) || matrix.roles?.[matrix.defaultRole] || {};
  }

  function groupForCollection(collectionKey) {
    const key = String(collectionKey || '');
    let best = null;
    Object.keys(matrix.groups || {}).forEach(group => {
      const collections = matrix.groups[group].collections || [];
      collections.forEach(prefix => {
        if (key === prefix || key.startsWith(`${prefix}.`)) {
          if (!best || String(prefix).length > String(best.prefix).length) best = { group, prefix };
        }
      });
    });
    return best ? best.group : '';
  }

  function can(groupOrCollection, action, role) {
    const group = matrix.groups?.[groupOrCollection] ? groupOrCollection : groupForCollection(groupOrCollection);
    if (!group) return false;
    const need = normalizeAccess(action || 'read');
    const policy = rolePolicy(role || currentRole());
    const have = normalizeAccess(policy[group]);
    return ACCESS_RANK[have] >= ACCESS_RANK[need];
  }

  function explain(groupOrCollection, action, role) {
    const group = matrix.groups?.[groupOrCollection] ? groupOrCollection : groupForCollection(groupOrCollection);
    const effectiveRole = normalizeRole(role || currentRole());
    const policy = rolePolicy(effectiveRole);
    const have = normalizeAccess(policy[group]);
    const need = normalizeAccess(action || 'read');
    return {
      ok: !!group && ACCESS_RANK[have] >= ACCESS_RANK[need],
      group,
      groupLabel: matrix.groups?.[group]?.labelAr || group || '',
      role: effectiveRole,
      required: need,
      actual: have,
    };
  }

  function filterButtons(root) {
    const host = root || document;
    host.querySelectorAll('[data-acl-group],[data-acl-collection]').forEach(el => {
      const groupOrCollection = el.getAttribute('data-acl-group') || el.getAttribute('data-acl-collection');
      const action = el.getAttribute('data-acl-action') || 'read';
      const allowed = can(groupOrCollection, action);
      el.hidden = !allowed;
      el.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    });
  }

  async function load(force) {
    if (loaded && !force) return matrix;
    if (loading && !force) return loading;
    loading = fetch('acl.json', { headers: { Accept: 'application/json' } })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        matrix = {
          ...DEFAULT_MATRIX,
          ...json,
          groups: { ...DEFAULT_MATRIX.groups, ...(json.groups || {}) },
          roles: { ...DEFAULT_MATRIX.roles, ...(json.roles || {}) },
          roleAliases: { ...DEFAULT_MATRIX.roleAliases, ...(json.roleAliases || {}) },
        };
        loaded = true;
        filterButtons(document);
        window.dispatchEvent(new CustomEvent('octagon:acl-loaded', { detail: { version: matrix.version } }));
        return matrix;
      })
      .catch(error => {
        console.warn('ACL load failed; using fallback matrix:', error.message || error);
        loaded = true;
        return matrix;
      })
      .finally(() => { loading = null; });
    return loading;
  }

  function init() {
    load(false);
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node && node.nodeType === 1) filterButtons(node);
      }));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.Acl = {
    load,
    can,
    explain,
    groupForCollection,
    currentRole,
    currentUser,
    filterButtons,
    matrix: () => matrix,
  };
  window.OctagonAcl = window.Acl;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
