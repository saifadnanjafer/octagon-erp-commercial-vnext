/*
 * P1.1 Shell navigation tree.
 * Pattern adapted from app.js (legacy domain navigation) and
 * erp-research/MASTER_PLAN.md (the 10-section tree).
 */
(function (root) {
  'use strict';

  const OX = root.OX = root.OX || {};
  const sections = [
    { key: 'home', label_ar: 'الرئيسية', icon: 'fa-house', permission: 'home', pages: ['home', 'command_center'] },
    { key: 'hr', label_ar: 'الموارد البشرية', icon: 'fa-people-group', permission: 'employees', pages: ['timesheet', 'calculator', 'calendar', 'employees', 'employee_ui', 'people_ops', 'leave', 'expense_claims', 'appraisal', 'training_lms'] },
    { key: 'finance', label_ar: 'المالية', icon: 'fa-wallet', permission: 'finance', pages: ['finance', 'cashbox', 'expenses', 'income', 'customers', 'receipt', 'banking', 'assets', 'finance_installments'] },
    { key: 'sales', label_ar: 'المبيعات وCRM', icon: 'fa-chart-line', permission: 'sales', pages: ['sales', 'leads', 'quotes', 'orders', 'pos_deepening', 'loyalty', 'helpdesk', 'appointments', 'sales_contracts'] },
    { key: 'supply', label_ar: 'المشتريات والمخزون', icon: 'fa-boxes-stacked', permission: 'inventory', pages: ['inventory', 'procurement', 'purchase_orders', 'suppliers', 'shipments'] },
    { key: 'factory', label_ar: 'التصنيع والورشة', icon: 'fa-industry', permission: 'work_orders', pages: ['work_orders', 'machines', 'maintenance', 'qc_center', 'op_packs', 'workshop_tv'] },
    { key: 'projects', label_ar: 'المشاريع والخدمات', icon: 'fa-diagram-project', permission: 'task_manager', pages: ['projects', 'task_manager', 'kanban', 'workflow', 'sop', 'esign', 'documents'] },
    { key: 'verticals', label_ar: 'القطاعات', icon: 'fa-store', permission: 'verticals', pages: ['retail', 'pharmacy', 'clinic', 'restaurant', 'real_estate', 'hotel'] },
    { key: 'intelligence', label_ar: 'الذكاء والتقارير', icon: 'fa-brain', permission: 'intelligence', pages: ['intelligence', 'analytics', 'knowledge', 'knowledge_base', 'ai_factory', 'ai_tools', 'ai_status', 'risk_compliance'] },
    { key: 'platform', label_ar: 'المنصة والإدارة', icon: 'fa-shield-halved', permission: 'admin_panel', pages: ['admin_panel', 'security_center', 'device_center', 'visitors', 'fleet', 'route_health', 'deploy_ready', 'backups'] },
  ];

  OX.nav = OX.nav || {};
  OX.nav.sections = sections;
  OX.nav.get = function (key) { return sections.find(section => section.key === key) || null; };
  OX.nav.forLegacyPage = function (pageId) {
    return sections.find(section => section.pages.includes(pageId)) || null;
  };
  OX.nav.canOpen = function (section, user) {
    if (!section) return false;
    const permission = root.PermissionService;
    if (!permission || typeof permission.checkPage !== 'function') return true;
    try { return permission.checkPage(section.permission, user); } catch (_) { return true; }
  };
}(window));
