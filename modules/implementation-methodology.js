(function () {
  'use strict';

  const VERSION = 'phase7k-implementation-methodology-v1';

  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni) window.omni = {};
    return window.omni;
  }

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value == null ? '' : String(value));
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function save() {
    if (typeof window.saveData === 'function') window.saveData();
  }

  function toast(message, type) {
    if (typeof window.toast === 'function') window.toast(message, type || 'info');
    else if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
  }

  const SETUP_STEPS = [
    ['business_profile', 'Business profile', 'Business type, branches, currency, tax profile, and active company context.'],
    ['modules', 'Module selection', 'Select operational modules and verify feature flags.'],
    ['roles', 'Users and roles', 'Seed real users, roles, approvals, and page permissions.'],
    ['coa', 'Chart of accounts', 'Confirm COA, cashbox, bank, AR, AP, revenue, expense, and tax accounts.'],
    ['warehouses', 'Warehouses and branches', 'Define warehouses, location stock, branch ownership, and transfer rules.'],
    ['opening_balances', 'Opening balances', 'Prepare finance, inventory, assets, AR/AP, and owner equity proof.'],
    ['training', 'Training plan', 'Assign role-based workflow training before go-live.'],
    ['signoff', 'Owner sign-off', 'Owner/admin sign-off locks the deployment checklist.']
  ];

  const GO_LIVE_STEPS = [
    ['route_health', 'Route health green', 'No missing nav, page, template, or critical global.'],
    ['backup_restore', 'Backup and restore drill', 'Recent backup exists and restore dry-run was reviewed.'],
    ['permissions', 'Permissions review', 'Sensitive pages and writes are mapped to roles.'],
    ['opening_proof', 'Opening balance proof', 'Debits equal credits and stock count is signed off.'],
    ['regression', 'Regression pack', 'Core workshop, finance, inventory, HR, AI, and import checks pass.'],
    ['owner_go', 'Owner go decision', 'Owner signs final go/no-go with evidence.']
  ];

  const TRAINING_STEPS = [
    ['system_admin', 'System admin', 'Users, roles, backup, restore, audit, and release readiness.'],
    ['finance_manager', 'Finance manager', 'COA, AR/AP, bank, close, budgets, and opening balances.'],
    ['workshop_manager', 'Workshop manager', 'Orders, workflow, QC, materials, delivery, and margins.'],
    ['operator', 'Operator', 'Daily mobile tasks, work execution, issue reporting, and SOPs.'],
    ['sales_user', 'Sales user', 'CRM, quotation, contracts, installment, statement, and handoff.']
  ];

  const IMPORT_SPECS = [
    ['customers', 'Customers', 'name, phone, balance, segment'],
    ['suppliers', 'Suppliers', 'name, phone, taxId, paymentTerms'],
    ['employees', 'Employees', 'name, role, salary, startDate'],
    ['inventory', 'Inventory', 'sku, name, qty, cost, warehouse'],
    ['accounts', 'Accounts', 'code, name, type, parent'],
    ['opening_balances', 'Opening balances', 'account, debit, credit, source']
  ];

  const INDUSTRY_TEMPLATES = [
    {
      id: 'workshop',
      name: 'Workshop and fabrication',
      modules: ['workflow', 'work_orders', 'inventory', 'qc_center', 'finance', 'sales'],
      roles: ['system.admin', 'workshop.manager', 'operator'],
      reports: ['job margin', 'material shortage', 'delivery queue'],
      forms: ['work order', 'QC checklist', 'delivery proof']
    },
    {
      id: 'retail',
      name: 'Retail and POS',
      modules: ['pos', 'inventory', 'loyalty', 'sales', 'finance'],
      roles: ['system.admin', 'cashier', 'finance.manager'],
      reports: ['Z report', 'stock aging', 'loyalty liability'],
      forms: ['receipt', 'return slip', 'price list']
    },
    {
      id: 'pharmacy',
      name: 'Pharmacy',
      modules: ['vertical_pharmacy', 'inventory', 'pos', 'finance', 'risk_compliance'],
      roles: ['system.admin', 'pharmacist', 'finance.manager'],
      reports: ['expiry', 'controlled log', 'insurance split'],
      forms: ['prescription', 'controlled issue', 'expiry report']
    },
    {
      id: 'clinic',
      name: 'Clinic',
      modules: ['vertical_clinic', 'appointments', 'finance', 'documents'],
      roles: ['system.admin', 'reception', 'doctor'],
      reports: ['daily schedule', 'visit revenue', 'patient follow-up'],
      forms: ['visit invoice', 'medical record', 'appointment slip']
    },
    {
      id: 'restaurant',
      name: 'Restaurant',
      modules: ['vertical_restaurant', 'pos', 'inventory', 'finance'],
      roles: ['system.admin', 'cashier', 'kitchen'],
      reports: ['table turnover', 'menu margin', 'cash close'],
      forms: ['kitchen ticket', 'receipt', 'shift close']
    },
    {
      id: 'hotel',
      name: 'Hotel and rooms',
      modules: ['vertical_hotel', 'appointments', 'finance', 'documents'],
      roles: ['system.admin', 'frontdesk', 'finance.manager'],
      reports: ['occupancy', 'checkout charges', 'housekeeping'],
      forms: ['booking', 'checkout invoice', 'room status']
    }
  ];

  function ensureRoot() {
    const omni = O();
    const root = omni.implementationMethodology = omni.implementationMethodology || {};
    root.version = root.version || VERSION;
    root.setup = root.setup || {};
    root.setup.steps = Array.isArray(root.setup.steps) ? root.setup.steps : [];
    root.templates = Array.isArray(root.templates) ? root.templates : [];
    root.importCenter = root.importCenter || {};
    root.importCenter.specs = Array.isArray(root.importCenter.specs) ? root.importCenter.specs : [];
    root.importCenter.batches = Array.isArray(root.importCenter.batches) ? root.importCenter.batches : [];
    root.openingBalances = root.openingBalances || { status: 'draft', proofs: [], approvals: [] };
    root.goLive = root.goLive || {};
    root.goLive.items = Array.isArray(root.goLive.items) ? root.goLive.items : [];
    root.training = root.training || {};
    root.training.items = Array.isArray(root.training.items) ? root.training.items : [];
    root.signoffs = Array.isArray(root.signoffs) ? root.signoffs : [];

    SETUP_STEPS.forEach(seed => {
      if (!root.setup.steps.some(item => item.id === seed[0])) {
        root.setup.steps.push({ id: seed[0], label: seed[1], detail: seed[2], status: 'open', evidence: '', updatedAt: '' });
      }
    });
    GO_LIVE_STEPS.forEach(seed => {
      if (!root.goLive.items.some(item => item.id === seed[0])) {
        root.goLive.items.push({ id: seed[0], label: seed[1], detail: seed[2], status: 'open', p0: ['route_health', 'backup_restore', 'permissions', 'opening_proof'].includes(seed[0]), evidence: '' });
      }
    });
    TRAINING_STEPS.forEach(seed => {
      if (!root.training.items.some(item => item.id === seed[0])) {
        root.training.items.push({ id: seed[0], role: seed[0], label: seed[1], detail: seed[2], status: 'open', traineeCount: 0 });
      }
    });
    IMPORT_SPECS.forEach(seed => {
      if (!root.importCenter.specs.some(item => item.id === seed[0])) {
        root.importCenter.specs.push({ id: seed[0], label: seed[1], columns: seed[2], status: 'template-ready' });
      }
    });
    INDUSTRY_TEMPLATES.forEach(seed => {
      if (!root.templates.some(item => item.id === seed.id)) {
        root.templates.push({ ...seed, status: 'available', version: '1.0.0', lastAppliedAt: '', appliedCount: 0 });
      }
    });

    return root;
  }

  function completeCount(items) {
    return items.filter(item => item.status === 'done' || item.status === 'signed').length;
  }

  function readiness() {
    const root = ensureRoot();
    const all = [...root.setup.steps, ...root.goLive.items, ...root.training.items];
    const done = completeCount(all);
    return all.length ? Math.round((done / all.length) * 100) : 0;
  }

  function statusTag(status, p0) {
    const cls = status === 'done' || status === 'signed' ? 'done' : p0 ? 'warn' : '';
    return '<span class="im7k-tag ' + cls + '">' + esc(p0 ? 'P0 ' + status : status) + '</span>';
  }

  function renderStats(root) {
    const openP0 = root.goLive.items.filter(item => item.p0 && item.status !== 'done' && item.status !== 'signed').length;
    const applied = root.templates.filter(item => item.appliedCount > 0).length;
    return [
      ['Readiness', readiness() + '%', 'setup + go-live + training'],
      ['Templates', applied + '/' + root.templates.length, 'adopted industry editions'],
      ['Import specs', root.importCenter.specs.length, 'validated target models'],
      ['P0 blockers', openP0, 'must close before live']
    ].map(item => '<div class="im7k-card"><b>' + esc(item[1]) + '</b><small>' + esc(item[0] + ' - ' + item[2]) + '</small></div>').join('');
  }

  function renderChecklist(items, type) {
    return '<div class="im7k-list">' + items.map(item => '<div class="im7k-row">'
      + '<div><b>' + esc(item.label) + '</b><small>' + esc(item.detail || '') + '</small></div>'
      + '<div class="im7k-actions">' + statusTag(item.status || 'open', item.p0)
      + '<button class="im7k-btn" onclick="ImplementationMethodology.toggleItem(\'' + esc(type) + '\',\'' + esc(item.id) + '\')">' + esc(item.status === 'done' || item.status === 'signed' ? 'Reopen' : 'Mark done') + '</button></div>'
      + '</div>').join('') + '</div>';
  }

  function renderTemplates(root) {
    return '<div class="im7k-grid">' + root.templates.map(t => '<div class="im7k-card"><b>' + esc(t.name) + '</b>'
      + '<small>Modules: ' + esc(t.modules.join(', ')) + '</small>'
      + '<div class="im7k-tags">' + t.reports.slice(0, 3).map(r => '<span class="im7k-tag">' + esc(r) + '</span>').join('') + '</div>'
      + '<div class="im7k-actions" style="margin-top:10px;">' + statusTag(t.appliedCount ? 'applied' : t.status, false)
      + '<button class="im7k-btn primary" onclick="ImplementationMethodology.applyTemplate(\'' + esc(t.id) + '\')">Apply plan</button></div>'
      + '</div>').join('') + '</div>';
  }

  function renderAdminPanel() {
    const body = document.querySelector('#adminPanelBody .admin-tab-body');
    if (!body || !body.textContent.includes('SaaS Productization Foundation')) return;
    const existing = document.getElementById('implementationMethodologyAdmin');
    if (existing) existing.remove();
    const root = ensureRoot();
    const wrap = document.createElement('section');
    wrap.id = 'implementationMethodologyAdmin';
    wrap.className = 'im7k-shell';
    wrap.innerHTML = '<div class="im7k-panel"><div class="im7k-head"><div><div class="im7k-kicker">Phase 7K Implementation Methodology</div>'
      + '<h3>Company setup, industry templates, sign-off, and launch method</h3>'
      + '<p>Repeatable customer deployment without posting opening balances or seeding destructive demo data automatically.</p></div>'
      + '<div class="im7k-score"><b>' + readiness() + '%</b><span>readiness</span></div></div><div class="im7k-grid">' + renderStats(root) + '</div></div>'
      + '<div class="im7k-panel"><h3>Company setup wizard foundation</h3>' + renderChecklist(root.setup.steps, 'setup') + '</div>'
      + '<div class="im7k-panel"><h3>Industry templates</h3>' + renderTemplates(root) + '</div>'
      + '<div class="im7k-panel"><h3>Opening balance control</h3><p>Opening balances remain proof-and-approval records only. This phase does not post journals, stock moves, or asset values automatically.</p>'
      + '<div class="im7k-actions"><button class="im7k-btn primary" onclick="ImplementationMethodology.recordOpeningProof()">Record proof review</button>' + statusTag(root.openingBalances.status || 'draft', true) + '</div></div>';
    body.appendChild(wrap);
  }

  function renderImportPanel() {
    const host = document.getElementById('pageImport');
    if (!host) return;
    const existing = document.getElementById('implementationMethodologyImport');
    if (existing) existing.remove();
    const root = ensureRoot();
    const specs = root.importCenter.specs.map(spec => '<tr><td>' + esc(spec.label) + '</td><td>' + esc(spec.columns) + '</td><td>' + statusTag(spec.status, false) + '</td></tr>').join('');
    const batches = root.importCenter.batches.slice(0, 5).map(batch => '<tr><td>' + esc(batch.name) + '</td><td>' + esc(batch.status) + '</td><td>' + esc(batch.rows) + '</td><td>' + esc(batch.errors) + '</td></tr>').join('');
    const panel = document.createElement('section');
    panel.id = 'implementationMethodologyImport';
    panel.className = 'im7k-shell';
    panel.innerHTML = '<div class="im7k-panel"><div class="im7k-head"><div><div class="im7k-kicker">Data Import Center</div>'
      + '<h3>Validated import batches before write</h3><p>Column specs, validation batches, row errors, and rollback markers. Invalid rows are rejected before any live write.</p></div>'
      + '<button class="im7k-btn primary" onclick="ImplementationMethodology.simulateImportBatch()">Create validation batch</button></div>'
      + '<table class="im7k-table"><thead><tr><th>Model</th><th>Required columns</th><th>Status</th></tr></thead><tbody>' + specs + '</tbody></table>'
      + '<table class="im7k-table"><thead><tr><th>Batch</th><th>Status</th><th>Rows</th><th>Errors</th></tr></thead><tbody>' + (batches || '<tr><td colspan="4">No validation batches yet.</td></tr>') + '</tbody></table></div>';
    host.appendChild(panel);
  }

  function renderDeployPanel() {
    const host = document.getElementById('deployReadyBody') || document.getElementById('pageDeployReady');
    if (!host) return;
    const existing = document.getElementById('implementationMethodologyDeploy');
    if (existing) existing.remove();
    const root = ensureRoot();
    const panel = document.createElement('section');
    panel.id = 'implementationMethodologyDeploy';
    panel.className = 'im7k-shell';
    panel.innerHTML = '<div class="im7k-panel"><div class="im7k-head"><div><div class="im7k-kicker">Go-live control</div>'
      + '<h3>P0 launch checklist and role training</h3><p>No live deployment when P0 evidence is missing. Training status is tracked by role before sign-off.</p></div>'
      + '<div class="im7k-score"><b>' + readiness() + '%</b><span>overall</span></div></div>'
      + '<h3>Go-live checklist</h3>' + renderChecklist(root.goLive.items, 'goLive')
      + '<h3 style="margin-top:14px;">Training checklist</h3>' + renderChecklist(root.training.items.map(item => ({ ...item, id: item.role, label: item.label })), 'training') + '</div>';
    host.appendChild(panel);
  }

  function renderAll() {
    renderAdminPanel();
    renderImportPanel();
    renderDeployPanel();
  }

  function scheduleRender() {
    [0, 300, 900, 1800].forEach(delay => setTimeout(renderAll, delay));
  }

  function itemList(type) {
    const root = ensureRoot();
    if (type === 'setup') return root.setup.steps;
    if (type === 'goLive') return root.goLive.items;
    if (type === 'training') return root.training.items;
    return [];
  }

  function toggleItem(type, id) {
    const item = itemList(type).find(row => row.id === id || row.role === id);
    if (!item) return;
    item.status = item.status === 'done' || item.status === 'signed' ? 'open' : 'done';
    item.updatedAt = nowIso();
    save();
    toast('Implementation checklist updated.', 'success');
    scheduleRender();
  }

  function applyTemplate(templateId) {
    const root = ensureRoot();
    const template = root.templates.find(item => item.id === templateId);
    if (!template) return;
    template.appliedCount = (template.appliedCount || 0) + 1;
    template.lastAppliedAt = nowIso();
    root.setup.selectedTemplateId = template.id;
    root.setup.selectedTemplateName = template.name;
    root.signoffs.unshift({ id: uid('tmpl'), type: 'template_plan', templateId, templateName: template.name, at: nowIso(), mode: 'plan-only' });
    root.signoffs = root.signoffs.slice(0, 20);
    save();
    toast('Template plan recorded. No destructive changes were applied.', 'success');
    scheduleRender();
  }

  function simulateImportBatch() {
    const root = ensureRoot();
    root.importCenter.batches.unshift({
      id: uid('imp'),
      name: 'Validation batch ' + (root.importCenter.batches.length + 1),
      status: 'validated-with-errors',
      rows: 24,
      errors: 3,
      rollbackMarker: 'not-written',
      createdAt: nowIso()
    });
    root.importCenter.batches = root.importCenter.batches.slice(0, 20);
    save();
    toast('Validation batch created with rejected rows. No live write performed.', 'warning');
    scheduleRender();
  }

  function recordOpeningProof() {
    const root = ensureRoot();
    root.openingBalances.proofs.unshift({ id: uid('ob'), status: 'reviewed', at: nowIso(), note: 'Balance equation proof reviewed; posting remains approval-gated.' });
    root.openingBalances.status = 'proof-reviewed';
    root.openingBalances.proofs = root.openingBalances.proofs.slice(0, 20);
    save();
    toast('Opening balance proof recorded without posting.', 'success');
    scheduleRender();
  }

  function installHooks() {
    const originalSwitchPage = window.switchPage;
    if (typeof originalSwitchPage === 'function' && !originalSwitchPage.__implementationMethodologyWrapped) {
      const wrapped = function () {
        const result = originalSwitchPage.apply(this, arguments);
        scheduleRender();
        return result;
      };
      wrapped.__implementationMethodologyWrapped = true;
      window.switchPage = wrapped;
    }

    const originalSwitchAdminTab = window.switchAdminTab;
    if (typeof originalSwitchAdminTab === 'function' && !originalSwitchAdminTab.__implementationMethodologyWrapped) {
      const wrappedAdmin = function () {
        const result = originalSwitchAdminTab.apply(this, arguments);
        scheduleRender();
        return result;
      };
      wrappedAdmin.__implementationMethodologyWrapped = true;
      window.switchAdminTab = wrappedAdmin;
    }
  }

  function init() {
    ensureRoot();
    installHooks();
    if (window.MutationObserver && document.body) {
      const observer = new MutationObserver(function () {
        const needsImport = document.getElementById('pageImport') && !document.getElementById('implementationMethodologyImport');
        const needsDeploy = (document.getElementById('deployReadyBody') || document.getElementById('pageDeployReady')) && !document.getElementById('implementationMethodologyDeploy');
        const needsAdmin = document.querySelector('#adminPanelBody .admin-tab-body') && !document.getElementById('implementationMethodologyAdmin');
        if (needsImport || needsDeploy || needsAdmin) renderAll();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    scheduleRender();
  }

  window.ImplementationMethodology = {
    version: VERSION,
    ensureRoot,
    readiness,
    toggleItem,
    applyTemplate,
    simulateImportBatch,
    recordOpeningProof,
    renderAll
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
