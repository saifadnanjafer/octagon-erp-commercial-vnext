'use strict';
/**
 * P0.2 — ACL matrix admin UI (client side).
 * Arabic checkbox matrix: rows = entities (GET /api/x/_meta/entities),
 * columns = actions (create/read/update/delete/approve/export),
 * role selector tabs, scope dropdown per row.
 * Saves via PUT /api/x/_acl/:role (defined in platform/server/acl.js).
 *
 * Usage: OX.aclAdmin.mount(document.getElementById('someContainer'))
 * Conventions: vanilla JS, RTL Arabic labels, `window.OX` namespace,
 * uses global showToast when available.
 */
(function () {
  window.OX = window.OX || {};

  const ACTIONS = [
    { key: 'create', label: 'إنشاء' },
    { key: 'read', label: 'قراءة' },
    { key: 'update', label: 'تعديل' },
    { key: 'delete', label: 'حذف' },
    { key: 'approve', label: 'اعتماد' },
    { key: 'export', label: 'تصدير' },
  ];

  const SCOPES = [
    { key: 'all', label: 'الكل' },
    { key: 'own', label: 'سجلاته فقط' },
    { key: 'dept', label: 'قسمه' },
  ];

  const API_BASE = '/api/x';

  // Same segment-wise wildcard matcher as the server (kept in sync manually —
  // it is 12 lines; a shared module is not worth a build step in this stack).
  function permMatches(grantPerm, perm) {
    const g = String(grantPerm || '').split(':');
    const p = String(perm || '').split(':');
    for (let i = 0; i < g.length; i++) {
      if (g[i] === '*') {
        if (i === g.length - 1) return true;
        if (i >= p.length) return false;
        continue;
      }
      if (g[i] !== p[i]) return false;
    }
    return g.length === p.length;
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
    else console.log(`[acl-admin] ${message}`);
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    return body;
  }

  function entityAclKey(entityId, meta) {
    if (meta && meta.acl) return meta.acl;
    if (meta && meta.section) return `${meta.section}:${entityId.replace(/^[a-z0-9]+_/, '')}`;
    return `platform:${entityId}`;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach(c => node.appendChild(c));
    return node;
  }

  const STYLE_ID = 'ox-acl-admin-style';
  const CSS = `
    .ox-acl-wrap{direction:rtl;font-family:inherit}
    .ox-acl-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
    .ox-acl-tab{padding:6px 14px;border-radius:8px;border:1px solid var(--border-color,#3a3f4b);
      background:var(--card-bg,transparent);color:inherit;cursor:pointer;font-size:.9rem}
    .ox-acl-tab.active{background:var(--primary-color,#4f7cff);color:#fff;border-color:transparent}
    .ox-acl-table{width:100%;border-collapse:collapse;font-size:.85rem}
    .ox-acl-table th,.ox-acl-table td{border:1px solid var(--border-color,#3a3f4b);
      padding:6px 8px;text-align:center}
    .ox-acl-table th:first-child,.ox-acl-table td:first-child{text-align:right}
    .ox-acl-table input[type=checkbox]{transform:scale(1.15);cursor:pointer}
    .ox-acl-table input[type=checkbox]:disabled{cursor:not-allowed}
    .ox-acl-scope{padding:3px 6px;border-radius:6px;border:1px solid var(--border-color,#3a3f4b);
      background:var(--card-bg,transparent);color:inherit}
    .ox-acl-bar{display:flex;align-items:center;gap:10px;margin-top:12px}
    .ox-acl-save{padding:8px 20px;border-radius:8px;border:none;cursor:pointer;
      background:var(--primary-color,#4f7cff);color:#fff;font-size:.9rem}
    .ox-acl-save:disabled{opacity:.5;cursor:not-allowed}
    .ox-acl-note{font-size:.78rem;opacity:.75}
    .ox-acl-wild{font-size:.75rem;opacity:.7;margin-top:6px}
    .ox-acl-error{padding:14px;border-radius:8px;border:1px solid #d9534f;color:#d9534f}
  `;

  function injectStyle() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  function mount(container) {
    if (!container) return;
    injectStyle();
    container.innerHTML = '';
    const wrap = el('div', { class: 'ox-acl-wrap' });
    container.appendChild(wrap);
    wrap.textContent = 'جاري تحميل مصفوفة الصلاحيات...';

    const state = { matrix: null, entities: null, activeRole: null };

    Promise.all([
      fetchJson(`${API_BASE}/_acl`),
      fetchJson(`${API_BASE}/_meta/entities`),
    ]).then(([matrixRes, entitiesRes]) => {
      state.matrix = matrixRes.data;
      state.entities = entitiesRes.data || {};
      state.activeRole = (state.matrix.roles[0] || {}).role || null;
      render();
    }).catch(error => {
      wrap.innerHTML = '';
      wrap.appendChild(el('div', { class: 'ox-acl-error', text: `تعذر تحميل الصلاحيات: ${error.message}` }));
    });

    function grantsOf(role) {
      return (state.matrix.grants && state.matrix.grants[role]) || [];
    }

    function render() {
      wrap.innerHTML = '';
      const roles = state.matrix.roles || [];

      // Role selector tabs
      const tabs = el('div', { class: 'ox-acl-tabs' });
      roles.forEach(r => {
        tabs.appendChild(el('button', {
          class: `ox-acl-tab${r.role === state.activeRole ? ' active' : ''}`,
          text: `${r.label_ar || r.role} (${r.role})`,
          onclick: () => { state.activeRole = r.role; render(); },
        }));
      });
      wrap.appendChild(tabs);

      const role = state.activeRole;
      const grants = grantsOf(role);
      const hasGlobalWildcard = grants.some(g => g.perm === '*');

      // Matrix table
      const thead = el('thead', {}, [el('tr', {}, [
        el('th', { text: 'الكيان' }),
        ...ACTIONS.map(a => el('th', { text: a.label })),
        el('th', { text: 'نطاق البيانات' }),
      ])]);
      const tbody = el('tbody');

      Object.entries(state.entities).forEach(([entityId, meta]) => {
        const aclKey = entityAclKey(entityId, meta);
        // Explicit per-entity grants (exact `aclKey:action` perms) vs
        // wildcard-inherited permissions (checked + disabled, saved upstream).
        const explicit = {};
        let rowScope = 'all';
        ACTIONS.forEach(a => {
          const exact = grants.find(g => g.perm === `${aclKey}:${a.key}`);
          if (exact) { explicit[a.key] = true; rowScope = exact.scope || 'all'; }
        });
        const row = el('tr', { 'data-aclkey': aclKey });
        row.appendChild(el('td', { text: `${meta.label_ar || entityId}` }));
        ACTIONS.forEach(a => {
          const perm = `${aclKey}:${a.key}`;
          const inheritedGrant = grants.find(g => g.perm !== `${aclKey}:${a.key}` && g.perm.includes('*') && permMatches(g.perm, perm));
          const checkbox = el('input', { type: 'checkbox', 'data-action': a.key });
          if (explicit[a.key]) checkbox.checked = true;
          if (inheritedGrant && !explicit[a.key]) {
            checkbox.checked = true;
            checkbox.disabled = true;
            checkbox.title = `موروثة من صلاحية عامة (${inheritedGrant.perm})`;
          }
          row.appendChild(el('td', {}, [checkbox]));
        });
        const scopeSelect = el('select', { class: 'ox-acl-scope', 'data-scope': '1' });
        SCOPES.forEach(s => {
          const opt = el('option', { value: s.key, text: s.label });
          if (s.key === rowScope) opt.setAttribute('selected', 'selected');
          scopeSelect.appendChild(opt);
        });
        row.appendChild(el('td', {}, [scopeSelect]));
        tbody.appendChild(row);
      });

      const table = el('table', { class: 'ox-acl-table' }, [thead, tbody]);
      wrap.appendChild(table);

      // Non-entity (wildcard/section) grants are preserved verbatim on save.
      const wildGrants = grants.filter(g => g.perm.includes('*') || !Object.entries(state.entities)
        .some(([id, m]) => ACTIONS.some(a => g.perm === `${entityAclKey(id, m)}:${a.key}`)));
      if (wildGrants.length) {
        wrap.appendChild(el('div', {
          class: 'ox-acl-wild',
          text: `صلاحيات عامة لهذا الدور (تُحفظ كما هي): ${wildGrants.map(g => `${g.perm} [${g.scope}]`).join(' ، ')}`,
        }));
      }

      // Save bar
      const bar = el('div', { class: 'ox-acl-bar' });
      const saveButton = el('button', { class: 'ox-acl-save', text: 'حفظ صلاحيات الدور', onclick: save });
      if (hasGlobalWildcard) {
        saveButton.disabled = true;
        bar.appendChild(saveButton);
        bar.appendChild(el('span', { class: 'ox-acl-note', text: 'هذا الدور يملك صلاحية كاملة (*) — لا حاجة للتعديل' }));
      } else {
        bar.appendChild(saveButton);
        bar.appendChild(el('span', { class: 'ox-acl-note', text: 'التغييرات تسري فورًا بعد الحفظ' }));
      }
      wrap.appendChild(bar);

      function save() {
        // Rebuild this role's grants = preserved wildcard/foreign grants +
        // the checkbox matrix state (enabled checkboxes only — disabled ones
        // are wildcard-inherited and already covered).
        const next = wildGrants.map(g => ({ perm: g.perm, scope: g.scope }));
        tbody.querySelectorAll('tr').forEach(tr => {
          const aclKey = tr.getAttribute('data-aclkey');
          const scope = tr.querySelector('[data-scope]').value || 'all';
          tr.querySelectorAll('input[type=checkbox]').forEach(cb => {
            if (cb.checked && !cb.disabled) next.push({ perm: `${aclKey}:${cb.getAttribute('data-action')}`, scope });
          });
        });
        saveButton.disabled = true;
        fetchJson(`${API_BASE}/_acl/${encodeURIComponent(role)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grants: next }),
        }).then(result => {
          state.matrix.grants[role] = result.data.grants;
          toast('تم حفظ صلاحيات الدور بنجاح', 'success');
          render();
        }).catch(error => {
          saveButton.disabled = false;
          toast(`فشل حفظ الصلاحيات: ${error.message}`, 'error');
        });
      }
    }
  }

  OX.aclAdmin = { mount };
})();
