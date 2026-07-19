/**
 * OCTAGON OMNISYSTEM - modules/jarvis-system-map.js
 *
 * Local System Map Builder: Builds a compact representation of pages, forms, modals,
 * and actions inside the ERP. It runs locally and deterministically, computing a coverage
 * score showing how much of the ERP JARVIS knows.
 */
(function () {
  'use strict';

  // `omni` is a bare global in app.js, not a window property — resolve it safely.
  function getOmni() {
    try { if (typeof omni !== 'undefined' && omni) return omni; } catch (_) {}
    try { if (window.omni) return window.omni; } catch (_) {}
    return null;
  }

  // Base page registry matching omni-ai-assistant.js / jarvis-brain.js
  const PAGES = {
    calculator: { labelAr: 'حاسبة الرواتب', labelEn: 'Payroll Calculator', risk: 'sensitive', category: 'payroll' },
    timesheet: { labelAr: 'سجل الحضور والدوام', labelEn: 'Timesheet', risk: 'sensitive', category: 'payroll' },
    calendar: { labelAr: 'تقويم الدوام', labelEn: 'Attendance Calendar', risk: 'sensitive', category: 'payroll' },
    import: { labelAr: 'استيراد البيانات', labelEn: 'Data Import', risk: 'sensitive', category: 'payroll' },
    employees: { labelAr: 'الموظفون والأرصدة', labelEn: 'Employees and Balances', risk: 'sensitive', category: 'payroll' },
    finance: { labelAr: 'المالية والمحاسبة', labelEn: 'Finance and Accounting', risk: 'sensitive', category: 'finance' },
    cashbox: { labelAr: 'قاصة الورشة', labelEn: 'Workshop Cashbox', risk: 'sensitive', category: 'finance' },
    expenses: { labelAr: 'المصروفات', labelEn: 'Expenses', risk: 'sensitive', category: 'finance' },
    income: { labelAr: 'الواردات', labelEn: 'Income', risk: 'sensitive', category: 'finance' },
    customers: { labelAr: 'أرصدة العملاء', labelEn: 'Customer Balances', risk: 'sensitive', category: 'finance' },
    receipt: { labelAr: 'إنشاء وصل', labelEn: 'Receipt Builder', risk: 'sensitive', category: 'finance' },
    report: { labelAr: 'التقرير النهائي', labelEn: 'Final Report', risk: 'sensitive', category: 'payroll' },
    command_center: { labelAr: 'مركز القيادة', labelEn: 'Command Center', risk: 'safe', category: 'core' },
    kanban: { labelAr: 'اللوحة التنفيذية', labelEn: 'Execution Board', risk: 'safe', category: 'core' },
    workflow: { labelAr: 'مصمم العمليات', labelEn: 'Workflow Designer', risk: 'safe', category: 'core' },
    op_packs: { labelAr: 'باقات العمليات', labelEn: 'Operation Packs', risk: 'safe', category: 'core' },
    mrp: { labelAr: 'تخطيط الإنتاج MRP', labelEn: 'MRP Production Planning', risk: 'safe', category: 'core' },
    task_manager: { labelAr: 'إدارة المهام', labelEn: 'Task Manager', risk: 'safe', category: 'core' },
    sop: { labelAr: 'مكتبة إجراءات التشغيل', labelEn: 'SOP Library', risk: 'safe', category: 'core' },
    machines: { labelAr: 'المكائن والصيانة', labelEn: 'Machines and Maintenance', risk: 'safe', category: 'core' },
    inventory: { labelAr: 'المخزون والمواد', labelEn: 'Inventory and Materials', risk: 'safe', category: 'core' },
    equipment: { labelAr: 'معدات الورشة', labelEn: 'Workshop Equipment', risk: 'safe', category: 'core' },
    qc_center: { labelAr: 'مركز الجودة', labelEn: 'Quality Center', risk: 'safe', category: 'core' },
    analytics: { labelAr: 'التحليلات والذكاء', labelEn: 'Analytics and Intelligence', risk: 'safe', category: 'core' },
    nl_reports: { labelAr: 'التقارير الذكية', labelEn: 'Smart Reports', risk: 'safe', category: 'core' },
    intelligence: { labelAr: 'عقل النظام', labelEn: 'System Brain', risk: 'safe', category: 'core' },
    automation: { labelAr: 'محرك الأتمتة', labelEn: 'Automation Engine', risk: 'safe', category: 'core' },
    whatsapp: { labelAr: 'واتساب', labelEn: 'WhatsApp', risk: 'safe', category: 'core' },
    sales: { labelAr: 'المبيعات والعملاء', labelEn: 'Sales and Customers', risk: 'safe', category: 'core' },
    multi_entity: { labelAr: 'الفروع والعملات', labelEn: 'Branches and Currencies', risk: 'safe', category: 'core' },
    tax_compliance: { labelAr: 'الضرائب والفوترة', labelEn: 'Tax and E-Invoicing', risk: 'safe', category: 'core' },
    employee_ui: { labelAr: 'لوحة الموظف', labelEn: 'Employee Portal', risk: 'safe', category: 'core' },
    customer_portal: { labelAr: 'بوابة العميل', labelEn: 'Customer Portal', risk: 'safe', category: 'core' },
    admin_panel: { labelAr: 'لوحة الإدارة', labelEn: 'Admin Panel', risk: 'sensitive', category: 'core' },
    help_manual: { labelAr: 'الدليل والمساعدة', labelEn: 'Help Manual', risk: 'safe', category: 'core' }
  };

  let systemMap = {
    pages: {},
    actionsCount: 0,
    formsCount: 0,
    modalsCount: 0,
    coverageScore: 0,
    timestamp: null
  };

  // Rebuild the system map scanning both page configurations and DOM data-jarvis attributes
  function rebuildJarvisMap() {
    console.log('[JarvisSystemMap] Starting rebuild...');
    const pagesList = Object.keys(PAGES);
    let mappedPagesCount = 0;
    let totalActionsFound = 0;
    let totalFormsFound = 0;
    let totalModalsFound = 0;

    const newPagesMap = {};

    pagesList.forEach(pageId => {
      const pageInfo = PAGES[pageId];
      const pageEl = document.getElementById('page' + pageId.charAt(0).toUpperCase() + pageId.slice(1));
      
      const pageData = {
        id: pageId,
        labelAr: pageInfo.labelAr,
        labelEn: pageInfo.labelEn,
        category: pageInfo.category,
        risk: pageInfo.risk,
        isLoaded: !!pageEl,
        actions: [],
        forms: [],
        inputs: []
      };

      if (pageEl) {
        mappedPagesCount++;

        // 1. Scan for explicit data-jarvis-action buttons
        const actionElements = pageEl.querySelectorAll('[data-jarvis-action]');
        actionElements.forEach(el => {
          const actionId = el.getAttribute('data-jarvis-action');
          const label = el.getAttribute('data-jarvis-label') || el.innerText || actionId;
          const risk = el.getAttribute('data-jarvis-risk') || pageInfo.risk || 'safe';
          
          pageData.actions.push({
            id: actionId,
            label: label.trim(),
            risk: risk,
            type: 'button',
            selector: `[data-jarvis-action="${actionId}"]`
          });
          totalActionsFound++;
        });

        // 2. Scan for form containers
        const formElements = pageEl.querySelectorAll('form, [data-jarvis-form]');
        formElements.forEach((el, idx) => {
          const formId = el.getAttribute('data-jarvis-form') || el.id || `form_${idx}`;
          const label = el.getAttribute('data-jarvis-label') || `نموذج ${formId}`;
          
          const formData = {
            id: formId,
            label: label.trim(),
            fields: []
          };

          // Find form input fields
          const inputs = el.querySelectorAll('input, select, textarea');
          inputs.forEach(inputEl => {
            const fieldId = inputEl.getAttribute('data-jarvis-field') || inputEl.id || inputEl.name;
            if (fieldId) {
              formData.fields.push({
                id: fieldId,
                type: inputEl.tagName.toLowerCase(),
                label: inputEl.getAttribute('placeholder') || fieldId
              });
            }
          });

          pageData.forms.push(formData);
          totalFormsFound++;
        });

        // 3. Scan for generic interactive elements matching standard operations
        if (pageData.actions.length === 0) {
          // Fallback scan: auto-map elements with descriptive IDs or standard classes
          const interactive = pageEl.querySelectorAll('button:not([data-jarvis-action]), .btn, .nav-group-toggle');
          interactive.forEach((el, idx) => {
            const id = el.id || el.className || `action_${idx}`;
            if (id && el.innerText.trim().length > 1) {
              pageData.actions.push({
                id: `${pageId}.auto.${idx}`,
                label: el.innerText.trim(),
                risk: pageInfo.risk || 'safe',
                type: 'auto_button',
                selector: '#' + el.id || '.' + el.className.split(' ')[0]
              });
              totalActionsFound++;
            }
          });
        }
      }

      newPagesMap[pageId] = pageData;
    });

    // 4. Scan active overlays/modals in document body
    const modalElements = document.querySelectorAll('.inspector-panel, #omniModalOverlay, .cmd-palette');
    modalElements.forEach(el => {
      totalModalsFound++;
    });

    // Compute coverage score
    // Weight: Mapped Pages (40%), data-jarvis Action buttons mapped (60%)
    // Let's assume standard targets: 25 main active pages, and 20 critical actions
    const pagesWeight = (mappedPagesCount / pagesList.length) * 40;
    const actionsWeight = Math.min(60, (totalActionsFound / 20) * 60);
    const coverage = Math.round(pagesWeight + actionsWeight);

    systemMap = {
      pages: newPagesMap,
      actionsCount: totalActionsFound,
      formsCount: totalFormsFound,
      modalsCount: totalModalsFound,
      coverageScore: Math.min(100, Math.max(15, coverage)),
      timestamp: new Date().toISOString()
    };

    window.JarvisSystemMap = systemMap;

    // Cache to local storage and keep an in-memory copy on the live store. Do NOT call
    // saveData() — this is a transient DOM scan that would bloat every DB write if persisted.
    try {
      localStorage.setItem('jarvis_system_map', JSON.stringify(systemMap));
      const o = getOmni();
      if (o) o.jarvisMap = systemMap;
    } catch (_) {}

    logEvent('map_rebuilt', {
      pagesCount: mappedPagesCount,
      actionsCount: totalActionsFound,
      coverageScore: systemMap.coverageScore
    });

    // Broadcast update
    window.dispatchEvent(new CustomEvent('jarvis:map-updated', { detail: { map: systemMap } }));
    return systemMap;
  }

  function logEvent(type, detail) {
    console.log(`[JarvisSystemMap] ${type}:`, detail);
  }

  // Self-load cache if available
  function init() {
    try {
      const cached = localStorage.getItem('jarvis_system_map');
      if (cached) {
        systemMap = JSON.parse(cached);
        window.JarvisSystemMap = systemMap;
      } else {
        rebuildJarvisMap();
      }
    } catch (_) {
      rebuildJarvisMap();
    }
  }

  // Export module globally
  window.JarvisSystemMapBuilder = {
    init,
    rebuildJarvisMap,
    getMap: () => systemMap,
    PAGES_META: PAGES
  };

  // Rebuild map when DOM is ready
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      window.JarvisSystemMapBuilder.init();
    });
  }

})();
