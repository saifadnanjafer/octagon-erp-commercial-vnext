/**
 * OCTAGON OMNISYSTEM - modules/jarvis-action-agent.js
 *
 * DOM-lite Action Agent & Safe Tool Controller:
 * Handles deterministic action mapping, elements highlighting, approval gating,
 * and safety policy execution.
 */
(function () {
  'use strict';

  // `omni` is a bare global in app.js — it is NOT on window. Resolve it safely so the
  // read-only data queries below actually see the live store instead of always failing.
  function getOmni() {
    try { if (typeof omni !== 'undefined' && omni) return omni; } catch (_) {}
    try { if (window.omni) return window.omni; } catch (_) {}
    return null;
  }

  const JARVIS_RISK_LEVELS = {
    READ: 'read',
    NAVIGATION: 'navigation',
    UI_SAFE: 'ui_safe',
    DRAFT: 'draft',
    APPROVAL: 'approval',
    WRITE: 'write',
    DANGEROUS: 'dangerous',
    BLOCKED: 'blocked'
  };

  // Safe action handlers mapped by action ID
  const ACTIONS_REGISTRY = {
    'page.open.inventory': {
      labelAr: 'فتح المخزون',
      labelEn: 'Open Inventory',
      risk: JARVIS_RISK_LEVELS.NAVIGATION,
      run() {
        if (typeof window.switchPage === 'function') {
          window.switchPage('inventory');
          return { ok: true, navigated: 'inventory' };
        }
        return { ok: false };
      }
    },
    'inventory.filter.low_stock': {
      labelAr: 'عرض المواد الناقصة',
      labelEn: 'Show low-stock materials',
      risk: JARVIS_RISK_LEVELS.UI_SAFE,
      run() {
        if (typeof window.switchPage === 'function') window.switchPage('inventory');
        // Trigger low stock filter click
        setTimeout(() => {
          const lowStockBtn = document.querySelector('[data-action="filter-low-stock"]') || 
                            document.querySelector('.filter-low-stock') ||
                            document.querySelector('#filterLowStock');
          if (lowStockBtn) {
            lowStockBtn.click();
          } else {
            console.log('[JarvisActionAgent] Low stock filter button not found, running local state filter');
          }
        }, 300);
        return { ok: true };
      }
    },
    'inventory.create_purchase_request': {
      labelAr: 'تجهيز طلب شراء للمواد الناقصة',
      labelEn: 'Prepare purchase request for low stock',
      risk: JARVIS_RISK_LEVELS.APPROVAL,
      run(params) {
        // Creates a proposal in the Command Center queue
        if (window.JarvisBrain && typeof window.JarvisBrain.queueApproval === 'function') {
          const ok = window.JarvisBrain.queueApproval({
            title: 'طلب شراء مواد ناقصة (تجهيز أومني)',
            target: 'inventory',
            risk: 'medium',
            summary: `طلب شراء تلقائي للمواد التي بلغت الحد الأدنى: ${params?.source || 'low_stock_materials'}`,
            actionId: 'propose_inventory_purchase',
            actionType: 'purchase_request',
            payload: { source: 'low_stock_materials', timestamp: new Date().toISOString() }
          });
          return { ok };
        }
        return { ok: false };
      }
    }
  };

  // Blocked actions that are dangerous
  const BLOCKED_PATTERNS = [
    /احذف كل/i, /مسح كل/i, /delete all/i, /reset db/i, /reset database/i,
    /احذف الموظفين/i, /delete employees/i, /حذف الحسابات/i, /delete finance/i
  ];
  const DENIED_DOM_CLICK_MESSAGE = 'هذا الزر حساس ولا أقدر أضغطه كـ DOM click. استخدم أداة مخصصة/موافقة سيرفرية.';

  // Visual highlights
  let activeHighlightTimer = null;
  let activeBubble = null;

  function pageKey() {
    try { if (typeof currentPage !== 'undefined' && currentPage) return String(currentPage); } catch (_) {}
    try {
      const active = document.querySelector('.nav-btn.active[data-page], .page.page-active[id]');
      if (active) return active.getAttribute('data-page') || String(active.id || '').replace(/^page-/, '');
    } catch (_) {}
    return 'unknown';
  }

  function isVisibleElement(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      return !!(rect.width || rect.height) && (!style || (style.visibility !== 'hidden' && style.display !== 'none'));
    } catch (_) {
      return !!el.offsetParent;
    }
  }

  function labelOf(el) {
    if (!el) return '';
    const attr = el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('data-jarvis-label')
      || (el.tagName === 'INPUT' ? el.value : '')
      || (el.querySelector && el.querySelector('[title]') ? el.querySelector('[title]').getAttribute('title') : '');
    return String(el.innerText || attr || '').replace(/\s+/g, ' ').trim();
  }

  function attrSafe(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function stableSelectorFor(el, actionId) {
    if (actionId) return `[data-jarvis-action="${attrSafe(actionId)}"]`;
    try {
      const dataPage = el && el.getAttribute && el.getAttribute('data-page');
      if (dataPage && el.classList && el.classList.contains('nav-btn')) return `.nav-btn[data-page="${attrSafe(dataPage)}"]`;
      if (el && el.id && /^[A-Za-z][A-Za-z0-9_:-]{0,80}$/.test(el.id)) return `#${el.id}`;
    } catch (_) {}
    return '';
  }

  async function postJarvisJson(route, body) {
    let response;
    try {
      response = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    } catch (error) {
      return { ok: false, status: 'network_error', error: String(error && error.message || error) };
    }
    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok && data.ok !== false) data.ok = false;
    data.httpStatus = response.status;
    return data;
  }

  function describeUiAction(el, options) {
    const opts = options || {};
    const actionId = opts.actionId || opts.action_id || (el && el.getAttribute && el.getAttribute('data-jarvis-action')) || '';
    return {
      action_id: actionId,
      label: opts.label || labelOf(el) || actionId,
      selector: opts.selector || stableSelectorFor(el, actionId),
      page: opts.page || pageKey(),
      kind: opts.kind || '',
      visible: opts.visible !== undefined ? !!opts.visible : isVisibleElement(el),
      requested: opts.requested || '',
      source: opts.source || 'jarvis_action_agent'
    };
  }

  async function authorizeUiClick(action) {
    const gate = await postJarvisJson('/api/jarvis/action', { tool: 'click_ui', args: action });
    if (!gate || gate.ok !== true || gate.status !== 'granted' || !gate.grantId) {
      return {
        ok: false,
        blocked: true,
        message: (gate && (gate.message || gate.error)) || DENIED_DOM_CLICK_MESSAGE,
        uiAction: gate && gate.uiAction,
        server: true
      };
    }
    const consumed = await postJarvisJson('/api/jarvis/consume-grant', { tool: 'click_ui', grantId: gate.grantId });
    if (!consumed || consumed.ok !== true) {
      return {
        ok: false,
        blocked: true,
        message: (consumed && (consumed.message || consumed.error)) || 'Server click grant could not be consumed.',
        uiAction: gate.uiAction,
        server: true
      };
    }
    return { ok: true, grantId: gate.grantId, uiAction: gate.uiAction, server: true };
  }

  function reportUiClickResult(grantId, ok, message) {
    if (!grantId) return;
    postJarvisJson('/api/jarvis/result', { grantId, tool: 'click_ui', ok: ok !== false, message: message || '' });
  }

  function collectVisibleJarvisActions() {
    const list = [];
    const elements = document.querySelectorAll('[data-jarvis-action]');
    elements.forEach(el => {
      if (!isVisibleElement(el)) return;
      const id = el.getAttribute('data-jarvis-action');
      const label = el.getAttribute('data-jarvis-label') || labelOf(el);
      const risk = el.getAttribute('data-jarvis-risk') || JARVIS_RISK_LEVELS.UI_SAFE;
      list.push({ id, label, risk, selector: `[data-jarvis-action="${id}"]` });
    });
    return list;
  }

  function highlightJarvisTarget(selectorOrElement, stepText) {
    // Clean up previous highlights
    removeHighlights();

    let el = null;
    if (typeof selectorOrElement === 'string') {
      el = document.querySelector(selectorOrElement);
    } else if (selectorOrElement instanceof HTMLElement) {
      el = selectorOrElement;
    }

    if (!el) return;

    // Scroll into view safely if needed
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Add glowing pulse border
    el.classList.add('jarvis-action-highlight');

    // Create floating step bubble
    if (stepText) {
      const rect = el.getBoundingClientRect();
      activeBubble = document.createElement('div');
      activeBubble.className = 'jarvis-execution-bubble';
      activeBubble.innerHTML = `<i class="fa-solid fa-spinner"></i> <span>${stepText}</span>`;
      
      // Position bubble above the element
      document.body.appendChild(activeBubble);
      const bubbleHeight = activeBubble.offsetHeight || 38;
      const bubbleWidth = activeBubble.offsetWidth || 150;
      
      activeBubble.style.top = `${rect.top - bubbleHeight - 10}px`;
      activeBubble.style.left = `${rect.left + (rect.width - bubbleWidth) / 2}px`;
    }

    // Auto-remove highlight after 3.5 seconds
    activeHighlightTimer = setTimeout(removeHighlights, 3500);
  }

  function removeHighlights() {
    document.querySelectorAll('.jarvis-action-highlight').forEach(el => {
      el.classList.remove('jarvis-action-highlight');
    });
    if (activeBubble) {
      try { activeBubble.remove(); } catch (_) {}
      activeBubble = null;
    }
    if (activeHighlightTimer) {
      clearTimeout(activeHighlightTimer);
      activeHighlightTimer = null;
    }
  }

  function openJarvisActionPreview(actionPlan) {
    console.log('[JarvisActionAgent] Proposal action plan:', actionPlan);
    // This displays a plan preview inside the assistant chat stream
    // Structure: { intent, steps: [{ type, actionId, risk, label }] }
  }

  // Local screen only. The server policy is authoritative for every click_ui run.
  function validateActionSafety(actionId, textQuery) {
    if (textQuery) {
      const match = BLOCKED_PATTERNS.some(pat => pat.test(textQuery));
      if (match) return { allowed: false, policy: JARVIS_RISK_LEVELS.BLOCKED, reason: 'إجراء مدمر ومحظور أمنياً.' };
    }

    const registered = ACTIONS_REGISTRY[actionId];
    if (registered) {
      if (registered.risk === JARVIS_RISK_LEVELS.BLOCKED) {
        return { allowed: false, policy: JARVIS_RISK_LEVELS.BLOCKED, reason: 'هذا الإجراء غير مسموح به.' };
      }
      if (registered.risk === JARVIS_RISK_LEVELS.APPROVAL || registered.risk === JARVIS_RISK_LEVELS.WRITE) {
        return { allowed: false, policy: JARVIS_RISK_LEVELS.APPROVAL, reason: DENIED_DOM_CLICK_MESSAGE };
      }
    }

    return { allowed: true, policy: JARVIS_RISK_LEVELS.UI_SAFE };
  }

  async function executeElementClick(el, options) {
    const action = describeUiAction(el, options || {});
    const gate = await authorizeUiClick(action);
    if (!gate.ok) return gate;
    const label = action.label || action.action_id || 'UI action';
    try {
      highlightJarvisTarget(el, (options && options.stepText) || `جاري الضغط: ${label}`);
      el.click();
      reportUiClickResult(gate.grantId, true, `clicked ${label}`);
      return { ok: true, message: 'Clicked: ' + label, uiAction: gate.uiAction };
    } catch (error) {
      const message = String(error && error.message || error || 'click failed');
      reportUiClickResult(gate.grantId, false, message);
      return { ok: false, message, uiAction: gate.uiAction };
    }
  }

  async function executeJarvisAction(actionId, params) {
    console.log(`[JarvisActionAgent] Executing action: ${actionId}`, params);
    
    const check = validateActionSafety(actionId, actionId);
    if (!check.allowed) {
      console.warn(`[JarvisActionAgent] Blocked execution of ${actionId}: ${check.reason}`);
      return { ok: false, blocked: true, message: check.reason };
    }

    // If it's a registered page navigation or deterministic script action
    const registered = ACTIONS_REGISTRY[actionId];
    if (registered) {
      const policy = await authorizeUiClick({
        action_id: actionId,
        label: registered.labelAr || registered.labelEn || actionId,
        selector: `[data-jarvis-action="${attrSafe(actionId)}"]`,
        page: pageKey(),
        kind: registered.risk === JARVIS_RISK_LEVELS.NAVIGATION ? 'navigation' : '',
        visible: true,
        source: 'jarvis_action_registry'
      });
      if (!policy.ok) return policy;
      highlightJarvisTarget(`[data-jarvis-action="${attrSafe(actionId)}"]`, registered.labelAr || registered.labelEn);
      const result = registered.run(params) || {};
      reportUiClickResult(policy.grantId, result && result.ok !== false, (result && (result.message || result.navigated)) || actionId);
      return { ok: result.ok !== false, navigated: result.navigated };
    }

    // Dynamic execution: if actionId maps to a page navigation (e.g. page.open.calculator)
    if (actionId.startsWith('page.open.')) {
      const pageKey = actionId.replace('page.open.', '');
      if (typeof window.switchPage === 'function') {
        const policy = await authorizeUiClick({
          action_id: actionId,
          label: 'Open page ' + pageKey,
          selector: `.nav-btn[data-page="${attrSafe(pageKey)}"]`,
          page: pageKey,
          kind: 'navigation',
          visible: true,
          source: 'jarvis_page_open'
        });
        if (!policy.ok) return policy;
        highlightJarvisTarget(`.sidebar [data-page="${pageKey}"]`, `جاري فتح ${pageKey}...`);
        window.switchPage(pageKey);
        reportUiClickResult(policy.grantId, true, 'opened page ' + pageKey);
        return { ok: true, navigated: pageKey };
      }
    }

    // Dynamic selectors or generic click triggers
    const el = document.querySelector(`[data-jarvis-action="${actionId}"]`);
    if (el) {
      return executeElementClick(el, { actionId, label: el.getAttribute('data-jarvis-label') || labelOf(el), requested: actionId, source: 'jarvis_tagged_action' });
    }

    console.warn(`[JarvisActionAgent] No handler or element found for actionId: ${actionId}`);
    return { ok: false, error: 'unknown_action' };
  }

  // Read-only ERP entity query layers
  function jarvisQueryData(query) {
    const o = getOmni();
    if (!o) return { ok: false };
    // Read-only queries mapped to keys
    return { ok: true, data: o };
  }

  function jarvisFindRecords(entity, filters) {
    const o = getOmni();
    if (!o || !o[entity]) return [];
    let list = o[entity];
    if (filters) {
      list = list.filter(item => {
        return Object.keys(filters).every(k => item[k] === filters[k]);
      });
    }
    return list;
  }

  function jarvisGetCurrentPageContext() {
    return {
      currentPage: typeof currentPage !== 'undefined' ? currentPage : 'calculator',
      timestamp: new Date().toISOString()
    };
  }

  function jarvisGetSelectedRecordContext() {
    // Read the active modal or inspector detail
    const inspector = document.getElementById('inspectorPanel');
    if (inspector && !inspector.classList.contains('hidden')) {
      const title = document.getElementById('inspectorTitle')?.innerText;
      return { activeInspector: true, title };
    }
    return { activeInspector: false };
  }

  // Export module globally
  window.JarvisActionAgent = {
    collectVisibleJarvisActions,
    executeJarvisAction,
    executeElementClick,
    authorizeUiClick,
    highlightJarvisTarget,
    openJarvisActionPreview,
    removeHighlights,
    validateActionSafety,
    jarvisQueryData,
    jarvisFindRecords,
    jarvisGetCurrentPageContext,
    jarvisGetSelectedRecordContext,
    RISK_LEVELS: JARVIS_RISK_LEVELS,
    DENIED_DOM_CLICK_MESSAGE
  };

})();
