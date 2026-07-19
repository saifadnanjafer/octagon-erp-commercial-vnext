/**
 * OCTAGON OMNISYSTEM - Pilot Review Registry
 *
 * Phase 1 for the Pilot Review Session: deterministic DOM scanning for the
 * current page. This module does not render UI, call AI providers, write data,
 * or navigate. Later phases consume this registry from the Jarvis widget.
 */
(function (root) {
  'use strict';

  const VERSION = '2026.07.02-phase1';

  const REVIEWABLE_SELECTOR = [
    'button',
    '[role="button"]',
    '[role="tab"]',
    '.tab',
    '[data-tab]',
    '[data-bs-toggle="tab"]',
    'input',
    'select',
    'textarea',
    'a[href]',
    'a[onclick]',
    '[onclick]',
    '[data-action]',
    '[data-jarvis-action]',
    '[data-jarvis-field]',
    '[contenteditable="true"]',
    'summary'
  ].join(',');

  const EXCLUDE_SELECTOR = [
    'script',
    'style',
    'template',
    '[data-review-ignore]',
    '.review-ignore',
    '#ptxAIButton',
    '#ptxAIPanel',
    '#jarvisOrb',
    '.jarvis-orb',
    '.modal-backdrop'
  ].join(',');

  const PAGE_ID_OVERRIDES = {
    calculator: 'pageCalculator',
    import: 'pageImport',
    timesheet: 'pageTimesheet',
    report: 'pageReport',
    employees: 'pageEmployees',
    finance: 'pageFinance',
    cashbox: 'pageCashbox',
    expenses: 'pageExpenses',
    income: 'pageIncome',
    customers: 'pageCustomers',
    receipt: 'pageReceipt',
    calendar: 'pageCalendar',
    employee_ui: 'pageEmployee_ui',
    workflow: 'pageWorkflow',
    kanban: 'pageKanban',
    task_manager: 'pageTaskManager',
    sop: 'pageSop',
    command_center: 'pageCommandCenter',
    op_packs: 'pageOpPacks',
    machines: 'pageMachines',
    inventory: 'pageInventory',
    qc_center: 'pageQcCenter',
    analytics: 'pageAnalytics',
    intelligence: 'pageIntelligence',
    admin_panel: 'pageAdminPanel',
    automation: 'pageAutomation',
    whatsapp: 'pageWhatsapp',
    telegram: 'pageTelegram',
    sales: 'pageSales',
    help_manual: 'pageHelpManual',
    customer_portal: 'pageCustomerPortal',
    equipment: 'pageEquipment',
    mrp: 'pageMrp',
    nl_reports: 'pageNlReports',
    multi_entity: 'pageMultiEntity',
    tax_compliance: 'pageTaxCompliance',
    pos: 'pagePOS',
    pharmacy: 'pagePharmacy',
    retail: 'pageRetail',
    clinic: 'pageClinic',
    restaurant: 'pageRestaurant',
    'real-estate': 'pageRealEstate',
    hotel: 'pageHotel',
    assets: 'pageAssets',
    subscriptions: 'pageSubscriptions',
    people_ops: 'pagePeopleOps',
    helpdesk: 'pageHelpdesk',
    fleet: 'pageFleet',
    documents: 'pageDocuments',
    marketing: 'pageMarketing',
    budgeting: 'pageBudgeting',
    procurement: 'pageProcurement',
    projects: 'pageProjects',
    approvals: 'pageApprovals',
    field_service: 'pageFieldService',
    rental: 'pageRental',
    warranty: 'pageWarranty',
    banking: 'pageBanking',
    ar_ap: 'pageArAp',
    contracts: 'pageContracts',
    logistics: 'pageLogistics',
    supplier_portal: 'pageSupplierPortal',
    integration_hub: 'pageIntegrationHub',
    security_center: 'pageSecurityCenter',
    data_quality: 'pageDataQuality',
    training_lms: 'pageTrainingLms',
    scenario_planner: 'pageScenarioPlanner',
    device_center: 'pageDeviceCenter',
    appointments: 'pageAppointments',
    workshop_ledger: 'pageWorkshopLedger',
    loyalty: 'pageLoyalty',
    finance_installments: 'pageFinanceInstallments',
    sales_commission: 'pageSalesCommission',
    sales_contracts: 'pageSalesContracts',
    sales_price_lists: 'pageSalesPriceLists',
    pos_deepening: 'pagePOSDeepening',
    omni_communications: 'pageOmniCommunications',
    esign: 'pageEsign',
    events: 'pageEvents',
    knowledge: 'pageKnowledge',
    knowledge_base: 'pageKnowledgeBase',
    surveys: 'pageSurveys',
    visitors: 'pageVisitors',
    risk_compliance: 'pageRiskCompliance',
    work_orders: 'pageWorkOrders',
    route_health: 'pageRouteHealth',
    wfl_home: 'pageWflHome',
    employee_mobile: 'pageEmployeeMobile',
    workshop_tv: 'pageWorkshopTv',
    kiosk: 'pageKiosk',
    ai_queue: 'pageAiQueue',
    ai_factory: 'pageAiFactory',
    ai_tools: 'pageAiTools',
    ai_status: 'pageAiStatus',
    deploy_ready: 'pageDeployReady',
    manager_approvals: 'pageManagerApprovals',
    mobile_inventory_count: 'pageMobileInventoryCount'
  };

  function normalizeText(value, maxLength) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    const limit = maxLength || 140;
    return text.length > limit ? text.slice(0, limit - 1).trim() + '...' : text;
  }

  function toTitleCaseId(page) {
    return String(page || '')
      .split(/[_-]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
  }

  function safeCssIdent(value) {
    if (root.CSS && typeof root.CSS.escape === 'function') return root.CSS.escape(value);
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function getCurrentPage() {
    try {
      if (typeof currentPage !== 'undefined' && currentPage) return currentPage;
    } catch (_) {}

    const activeNav = document.querySelector('.nav-btn.active[data-page], .nav-btn[aria-current="page"][data-page]');
    if (activeNav && activeNav.dataset.page) return activeNav.dataset.page;

    const activePage = document.querySelector('.page.page-active[id]');
    if (activePage) {
      const match = Object.entries(PAGE_ID_OVERRIDES).find(([, id]) => id === activePage.id);
      if (match) return match[0];
      return activePage.id.replace(/^page/, '').replace(/[A-Z]/g, (char, idx) => (idx ? '_' : '') + char.toLowerCase());
    }

    return 'calculator';
  }

  function listPages() {
    const seen = new Set();
    return Array.from(document.querySelectorAll('.nav-btn[data-page]'))
      .map((btn, index) => {
        const page = btn.dataset.page || '';
        if (!page || seen.has(page)) return null;
        seen.add(page);
        return {
          page,
          label: normalizeText(btn.getAttribute('aria-label') || btn.innerText || btn.textContent || page, 90),
          navId: btn.id || '',
          order: index,
          active: btn.classList.contains('active') || btn.getAttribute('aria-current') === 'page'
        };
      })
      .filter(Boolean);
  }

  function pageIdCandidates(page) {
    const key = String(page || '');
    const title = toTitleCaseId(key);
    return [
      PAGE_ID_OVERRIDES[key],
      'page' + title,
      'page' + key.replace(/[_-]/g, ''),
      'page' + key.charAt(0).toUpperCase() + key.slice(1)
    ].filter(Boolean);
  }

  function findPageRoot(page) {
    const key = page || getCurrentPage();
    const active = document.querySelector('.page.page-active');
    if (active) {
      const activeKey = getCurrentPage();
      if (!page || activeKey === key) return active;
    }

    for (const id of pageIdCandidates(key)) {
      const el = document.getElementById(id);
      if (el) return el;
    }

    const normalized = String(key || '').replace(/[_-]/g, '').toLowerCase();
    return Array.from(document.querySelectorAll('.page[id]')).find(section =>
      String(section.id || '').replace(/^page/i, '').replace(/[_-]/g, '').toLowerCase().includes(normalized)
    ) || null;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const style = root.getComputedStyle ? root.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function getDomPath(el, rootEl) {
    const parts = [];
    let node = el;
    while (node && node !== rootEl && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += '#' + safeCssIdent(node.id);
        parts.unshift(part);
        break;
      }
      const className = normalizeText(node.className || '', 80).split(' ').filter(Boolean).slice(0, 2).join('.');
      if (className) part += '.' + className;
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === node.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  function classifyElement(el) {
    const tag = (el.tagName || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const inputType = (el.getAttribute('type') || '').toLowerCase();

    if (role === 'tab' || el.matches('.tab, [data-tab], [data-bs-toggle="tab"]')) return 'tab';
    if (inputType === 'range') return 'slider';
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') {
      if (['button', 'submit', 'reset', 'image'].includes(inputType)) return 'button';
      if (['checkbox', 'radio'].includes(inputType)) return inputType;
      return 'input';
    }
    if (tag === 'button' || role === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'summary') return 'disclosure';
    if (el.isContentEditable) return 'editable';
    if (el.hasAttribute('onclick') || el.hasAttribute('data-action') || el.hasAttribute('data-jarvis-action')) return 'action';
    return 'control';
  }

  function elementLabel(el) {
    const fromLabel = el.id ? document.querySelector('label[for="' + safeCssIdent(el.id) + '"]') : null;
    const labelledBy = (el.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map(id => id && document.getElementById(id))
      .filter(Boolean)
      .map(node => node.innerText || node.textContent || '')
      .join(' ');

    return normalizeText(
      el.getAttribute('data-jarvis-label') ||
      el.getAttribute('aria-label') ||
      labelledBy ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.value ||
      (fromLabel && (fromLabel.innerText || fromLabel.textContent)) ||
      el.innerText ||
      el.textContent ||
      el.name ||
      el.id ||
      classifyElement(el),
      140
    );
  }

  function elementMeta(el, page, index, rootEl) {
    const type = classifyElement(el);
    const label = elementLabel(el);
    const path = getDomPath(el, rootEl);
    const rect = el.getBoundingClientRect();
    const preferredId = el.getAttribute('data-jarvis-action') ||
      el.getAttribute('data-jarvis-field') ||
      el.getAttribute('data-action') ||
      el.id ||
      el.name ||
      '';
    const stableSeed = preferredId || (type + '|' + label + '|' + path + '|' + index);

    return {
      id: 'pilot:' + page + ':' + type + ':' + hashString(stableSeed),
      page,
      type,
      label,
      tag: (el.tagName || '').toLowerCase(),
      role: el.getAttribute('role') || '',
      inputType: el.getAttribute('type') || '',
      selectorHint: path,
      domId: el.id || '',
      name: el.name || '',
      action: el.getAttribute('data-jarvis-action') || el.getAttribute('data-action') || '',
      field: el.getAttribute('data-jarvis-field') || '',
      disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      required: Boolean(el.required || el.getAttribute('aria-required') === 'true'),
      visible: isVisible(el),
      viewport: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      reviewPrompts: buildReviewPrompts(type, label)
    };
  }

  function buildReviewPrompts(type, label) {
    const name = label || 'this control';
    const common = [
      'Is "' + name + '" visible, understandable, and placed where you expect it?',
      'Does "' + name + '" behave correctly when used?'
    ];
    if (type === 'button' || type === 'action') {
      common.push('After pressing "' + name + '", does the app give the right result, feedback, or approval gate?');
    } else if (type === 'tab') {
      common.push('When opening the "' + name + '" tab, does the right content appear without breaking the page?');
    } else if (['input', 'textarea', 'select', 'checkbox', 'radio', 'slider'].includes(type)) {
      common.push('Can you change "' + name + '" and does the page keep or use the value correctly?');
    } else if (type === 'link') {
      common.push('Does "' + name + '" open the right page, section, or external target?');
    }
    return common;
  }

  function scanPage(page, options) {
    const opts = Object.assign({ includeHidden: false }, options || {});
    const pageKey = page || getCurrentPage();
    const rootEl = findPageRoot(pageKey);
    const startedAt = new Date().toISOString();

    if (!rootEl) {
      return {
        version: VERSION,
        page: pageKey,
        pageRootId: '',
        scannedAt: startedAt,
        ok: false,
        reason: 'page-root-not-found',
        totals: { elements: 0, visible: 0, hidden: 0, disabled: 0 },
        elements: []
      };
    }

    const seen = new Set();
    const elements = Array.from(rootEl.querySelectorAll(REVIEWABLE_SELECTOR))
      .filter(el => {
        if (!el || seen.has(el)) return false;
        seen.add(el);
        if (el.matches(EXCLUDE_SELECTOR) || el.closest(EXCLUDE_SELECTOR)) return false;
        if (!opts.includeHidden && !isVisible(el)) return false;
        return true;
      })
      .map((el, index) => elementMeta(el, pageKey, index, rootEl));

    return {
      version: VERSION,
      page: pageKey,
      pageRootId: rootEl.id || '',
      pageLabel: pageLabel(pageKey),
      scannedAt: startedAt,
      ok: true,
      selector: REVIEWABLE_SELECTOR,
      totals: {
        elements: elements.length,
        visible: elements.filter(item => item.visible).length,
        hidden: elements.filter(item => !item.visible).length,
        disabled: elements.filter(item => item.disabled).length
      },
      byType: elements.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {}),
      elements
    };
  }

  function pageLabel(page) {
    const nav = document.querySelector('.nav-btn[data-page="' + safeCssIdent(page) + '"]');
    return normalizeText((nav && (nav.getAttribute('aria-label') || nav.innerText || nav.textContent)) || page, 90);
  }

  function scanCurrentPage(options) {
    return scanPage(getCurrentPage(), options);
  }

  function scanAllLoadedPages(options) {
    return listPages().map(item => scanPage(item.page, options));
  }

  const api = {
    version: VERSION,
    selector: REVIEWABLE_SELECTOR,
    pageIdOverrides: Object.assign({}, PAGE_ID_OVERRIDES),
    listPages,
    getCurrentPage,
    findPageRoot,
    classifyElement,
    scanPage,
    scanCurrentPage,
    scanAllLoadedPages
  };

  root.OctagonPilotReviewRegistry = api;
  root.PilotReviewRegistry = api;
})(window);
