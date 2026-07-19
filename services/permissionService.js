(function () {
  'use strict';

  const root = window;
  const services = root.PentagonServices || {};
  root.PentagonServices = services;

  const GROUPS = {
    'system.admin': { implies: ['workshop.manager', 'finance.manager'] },
    'workshop.manager': { implies: ['workshop.user'] },
    'finance.manager': { implies: ['finance.user'] },
    'workshop.user': { implies: [] },
    'finance.user': { implies: [] },
  };

  const ROLE_GROUPS = {
    system: ['system.admin'],
    system_admin: ['system.admin'],
    admin: ['system.admin'],
    manager: ['workshop.manager', 'finance.manager'],
    finance_manager: ['finance.manager'],
    finance_user: ['finance.user'],
    workshop_manager: ['workshop.manager'],
    workshop_user: ['workshop.user'],
    operator: ['workshop.user'],
    operator_user: ['workshop.user'],
    employee: [],
    employee_user: [],
    viewer: [],
    viewer_user: [],
    mgr_finance: ['finance.manager'],
    user_finance: ['finance.user'],
    mgr_workshop: ['workshop.manager'],
    user_workshop: ['workshop.user'],
  };

  const MODEL_PERMISSIONS = {
    employees: { read: ['workshop.user'], create: ['workshop.manager'], update: ['workshop.manager'], delete: ['system.admin'] },
    'omni.materials': { read: ['workshop.user'], create: ['workshop.manager'], update: ['workshop.manager'], delete: ['system.admin'] },
    'omni.suppliers': { read: ['workshop.user'], create: ['workshop.manager'], update: ['workshop.manager'], delete: ['system.admin'] },
    'omni.machines': { read: ['workshop.user'], create: ['workshop.manager'], update: ['workshop.manager'], delete: ['system.admin'] },
    'omni.equipment': { read: ['workshop.user'], create: ['workshop.manager'], update: ['workshop.manager'], delete: ['system.admin'] },
    'finance.transactions': { read: ['finance.user'], create: ['finance.user'], update: ['finance.manager'], delete: ['system.admin'] },
    account_moves: { read: ['finance.user'], create: ['finance.user'], update: ['finance.manager'], delete: ['system.admin'] },
    account_payments: { read: ['finance.user'], create: ['finance.manager'], update: ['finance.manager'], delete: ['system.admin'] },
    account_partial_reconciles: { read: ['finance.user'], create: ['finance.manager'], update: ['finance.manager'], delete: ['system.admin'] },
    'finance.accounts': { read: ['finance.user'], create: ['system.admin'], update: ['system.admin'], delete: ['system.admin'] },
    'omni.banking': { read: ['finance.user'], create: ['finance.user'], update: ['finance.user'], delete: ['finance.manager'] },
    'omni.locationStock': { read: ['workshop.user'], create: ['workshop.manager'], update: ['workshop.manager'], delete: ['system.admin'] },
    journal_entries: { read: ['finance.user'], create: ['finance.user'], update: ['finance.manager'], delete: ['system.admin'] },
    stock_moves: { read: ['workshop.user'], create: ['workshop.manager'], update: ['workshop.manager'], delete: ['system.admin'] },
  };

  const ACTION_PERMISSIONS = {
    'banking.reconciliation.create': ['finance.user'],
    'banking.reconciliation.match': ['finance.user'],
    'banking.reconciliation.unmatch': ['finance.user'],
    'banking.reconciliation.finalize': ['finance.manager'],
    'banking.reconciliation.adjustment_request': ['finance.user'],
    'inventory.location.create': ['workshop.manager'],
    'inventory.location.transfer': ['workshop.user'],
    'inventory.location.adjust': ['workshop.manager'],
    'inventory.location.issue': ['workshop.user'],
    'inventory.location.receive': ['workshop.user'],
    'accounting.coa.create': ['finance.manager'],
    'accounting.coa.edit_safe': ['finance.manager'],
    'accounting.coa.edit_used': ['system.admin'],
    'accounting.coa.deactivate': ['finance.manager'],
    'accounting.coa.deactivate_used': ['system.admin'],
    'risk_compliance.write': ['workshop.manager', 'finance.manager'],
    'hr.salary.change': ['system.admin'],
    'hr.attendance.locked_period_edit': ['system.admin'],
    'hr.payroll.reopen_period': ['system.admin'],
    'hr.deduction_fine.create': ['system.admin'],
    'hr.advance_loan.create': ['workshop.manager', 'finance.manager'],
    'hr.employee.terminate': ['system.admin'],
    'hr.role_permission.change': ['system.admin'],
    'hr.leave.payroll_affecting_approve': ['workshop.manager'],
    'hr.employee.delete': ['system.admin'],
  };

  const ACTION_METADATA = {
    'banking.reconciliation.create': { page: 'banking', module: 'phase6a_core', riskLevel: 'medium', label: 'اضافة سطر كشف بنكي' },
    'banking.reconciliation.match': { page: 'banking', module: 'phase6a_core', riskLevel: 'medium', label: 'مطابقة سطر بنكي' },
    'banking.reconciliation.unmatch': { page: 'banking', module: 'phase6a_core', riskLevel: 'medium', label: 'الغاء مطابقة بنكية' },
    'banking.reconciliation.finalize': { page: 'banking', module: 'phase6a_core', riskLevel: 'high', approvalRequired: true, label: 'اعتماد تسوية بنكية نهائية' },
    'banking.reconciliation.adjustment_request': { page: 'banking', module: 'phase6a_core', riskLevel: 'high', approvalRequired: true, label: 'طلب تسوية فرق بنكي' },
    'banking.reconciliation.legacy_finance_movement': { page: 'banking', module: 'phase6a_core', riskLevel: 'critical', approvalRequired: true, label: 'انشاء حركة مالية مباشرة من البنك' },
    'inventory.location.create': { page: 'inventory', module: 'phase6a_core', riskLevel: 'medium', label: 'انشاء موقع تخزين' },
    'inventory.location.transfer': { page: 'inventory', module: 'phase6a_core', riskLevel: 'medium', label: 'تحويل مخزون بين مواقع' },
    'inventory.location.adjust': { page: 'inventory', module: 'phase6a_core', riskLevel: 'high', approvalRequired: true, label: 'تسوية كمية موقعية' },
    'inventory.location.issue': { page: 'inventory', module: 'phase6a_core', riskLevel: 'medium', label: 'صرف مخزون من موقع' },
    'inventory.location.receive': { page: 'inventory', module: 'phase6a_core', riskLevel: 'medium', label: 'استلام مخزون في موقع' },
    'inventory.location.negative_issue': { page: 'inventory', module: 'phase6a_core', riskLevel: 'critical', approvalRequired: true, label: 'صرف مخزون سالب' },
    'inventory.location.delete_with_stock': { page: 'inventory', module: 'phase6a_core', riskLevel: 'critical', label: 'حذف موقع عليه رصيد او حركة' },
    'accounting.coa.create': { page: 'admin_panel', module: 'phase6a_core', riskLevel: 'medium', label: 'انشاء حساب دليل حسابات' },
    'accounting.coa.edit_safe': { page: 'admin_panel', module: 'phase6a_core', riskLevel: 'medium', label: 'تعديل بيانات حساب غير مستخدم' },
    'accounting.coa.edit_used': { page: 'admin_panel', module: 'phase6a_core', riskLevel: 'critical', approvalRequired: true, label: 'تعديل حساب مستخدم في قيود' },
    'accounting.coa.deactivate': { page: 'admin_panel', module: 'phase6a_core', riskLevel: 'high', label: 'تعطيل حساب غير مستخدم' },
    'accounting.coa.deactivate_used': { page: 'admin_panel', module: 'phase6a_core', riskLevel: 'critical', approvalRequired: true, label: 'تعطيل حساب مستخدم' },
    'accounting.coa.delete_used': { page: 'admin_panel', module: 'phase6a_core', riskLevel: 'critical', label: 'حذف حساب مستخدم' },
    'finance.direct_posting.external': { page: 'finance', module: 'finance', riskLevel: 'critical', approvalRequired: true, label: 'ترحيل مالي مباشر من مصدر خارجي' },
    'risk_compliance.write': { page: 'risk_compliance', module: 'risk_compliance', riskLevel: 'high', label: 'كتابة سجل مخاطر او رقابة' },
    'risk_compliance.delete': { page: 'risk_compliance', module: 'risk_compliance', riskLevel: 'critical', label: 'حذف سجل مخاطر او رقابة' },
    'ai.high_risk_write': { page: 'intelligence', module: 'jarvis', riskLevel: 'critical', approvalRequired: true, label: 'كتابة عالية الخطورة عبر الذكاء' },
    'hr.salary.change': { page: 'employees', module: 'hr_payroll', riskLevel: 'critical', approvalRequired: true, label: 'تغيير راتب موظف' },
    'hr.attendance.locked_period_edit': { page: 'timesheet', module: 'hr_payroll', riskLevel: 'critical', approvalRequired: true, label: 'تعديل حضور فترة رواتب مقفلة' },
    'hr.payroll.reopen_period': { page: 'employees', module: 'hr_payroll', riskLevel: 'critical', approvalRequired: true, label: 'إعادة فتح فترة رواتب مرحّلة' },
    'hr.deduction_fine.create': { page: 'employees', module: 'hr_payroll', riskLevel: 'high', approvalRequired: true, label: 'إضافة خصم أو غرامة' },
    'hr.advance_loan.create': { page: 'employees', module: 'hr_payroll', riskLevel: 'high', approvalRequired: true, label: 'إضافة سلفة أو قرض' },
    'hr.employee.terminate': { page: 'employees', module: 'hr', riskLevel: 'critical', approvalRequired: true, label: 'إنهاء أو تعطيل موظف' },
    'hr.role_permission.change': { page: 'admin_panel', module: 'security', riskLevel: 'critical', approvalRequired: true, label: 'تغيير دور أو صلاحيات' },
    'hr.leave.payroll_affecting_approve': { page: 'employees', module: 'hr_payroll', riskLevel: 'high', approvalRequired: true, label: 'اعتماد إجازة مؤثرة على الرواتب' },
    'hr.employee.delete': { page: 'employees', module: 'hr', riskLevel: 'critical', approvalRequired: true, label: 'حذف سجل موظف' },
  };

  const SENSITIVE_FIELDS = {
    employees: {
      salary: ['workshop.manager', 'finance.user'],
      baseSalary: ['workshop.manager', 'finance.user'],
      nominalSalary: ['workshop.manager', 'finance.user'],
      prevAdvance: ['workshop.manager', 'finance.user'],
      advance: ['workshop.manager', 'finance.user'],
      bonus: ['workshop.manager', 'finance.user'],
      damage: ['workshop.manager', 'finance.user'],
      penalty: ['workshop.manager', 'finance.user'],
    },
    'finance.transactions': {
      amount: ['finance.user'],
    },
    journal_entries: {
      debit: ['finance.user'],
      credit: ['finance.user'],
    },
    account_moves: {
      debit: ['finance.user'],
      credit: ['finance.user'],
    }
  };
  
  const PAGE_METADATA = {
    home: { sensitivity: 'system/home', riskLevel: 'low', phase: 'core', label: 'Home dashboard' },
    finance: { sensitivity: 'finance', riskLevel: 'high', phase: 'core', label: 'Finance dashboard' },
    cashbox: { sensitivity: 'finance', riskLevel: 'high', phase: 'core', label: 'Cashbox' },
    expenses: { sensitivity: 'finance', riskLevel: 'high', phase: 'core', label: 'Expenses' },
    income: { sensitivity: 'finance', riskLevel: 'high', phase: 'core', label: 'Income' },
    customers: { sensitivity: 'finance', riskLevel: 'medium', phase: 'core', label: 'Customer balances' },
    receipt: { sensitivity: 'finance', riskLevel: 'medium', phase: 'core', label: 'Receipts' },
    report: { sensitivity: 'finance/payroll', riskLevel: 'high', phase: 'core', label: 'Payroll report' },
    ar_ap: { sensitivity: 'finance', riskLevel: 'high', phase: 'phase6e', label: 'AR/AP workbench' },
    banking: { sensitivity: 'finance', riskLevel: 'high', phase: 'phase6a', label: 'Banking and treasury' },
    budgeting: { sensitivity: 'finance', riskLevel: 'high', phase: 'phase6e', label: 'Budgeting' },
    tax_compliance: { sensitivity: 'finance/compliance', riskLevel: 'high', phase: 'phase6b', label: 'Tax compliance' },
    import: { sensitivity: 'hr/payroll', riskLevel: 'high', phase: 'phase6e', label: 'Attendance import' },
    timesheet: { sensitivity: 'hr/payroll', riskLevel: 'high', phase: 'phase6e', label: 'Timesheet' },
    calendar: { sensitivity: 'hr/payroll', riskLevel: 'medium', phase: 'phase6e', label: 'Attendance calendar' },
    employees: { sensitivity: 'hr/payroll', riskLevel: 'high', phase: 'core', label: 'Employees and balances' },
    people_ops: { sensitivity: 'hr/people', riskLevel: 'high', phase: 'phase6e', label: 'People operations' },
    employee_ui: { sensitivity: 'employee_self_service', riskLevel: 'low', phase: 'phase6e', label: 'Employee self service' },
    employee_mobile: { sensitivity: 'employee_self_service', riskLevel: 'low', phase: 'phase6e', label: 'Employee mobile' },
    command_center: { sensitivity: 'manager/system', riskLevel: 'high', phase: 'core', label: 'Command Center' },
    analytics: { sensitivity: 'manager/reporting', riskLevel: 'medium', phase: 'core', label: 'Analytics' },
    nl_reports: { sensitivity: 'manager/reporting', riskLevel: 'medium', phase: 'core', label: 'Natural language reports' },
    intelligence: { sensitivity: 'ai/system', riskLevel: 'high', phase: 'core', label: 'AI intelligence' },
    automation: { sensitivity: 'ai/system', riskLevel: 'critical', phase: 'core', label: 'Automation engine' },
    whatsapp: { sensitivity: 'ai/customer_comms', riskLevel: 'high', phase: 'core', label: 'WhatsApp control' },
    telegram: { sensitivity: 'ai/customer_comms', riskLevel: 'high', phase: 'core', label: 'Telegram connector' },
    ai_queue: { sensitivity: 'ai/system', riskLevel: 'high', phase: 'phase6e', label: 'AI approval queue' },
    ai_factory: { sensitivity: 'ai/system', riskLevel: 'critical', phase: 'phase6e', label: 'AI factory' },
    ai_tools: { sensitivity: 'ai/system', riskLevel: 'critical', phase: 'phase6e', label: 'AI tools' },
    ai_status: { sensitivity: 'ai/system', riskLevel: 'medium', phase: 'phase6e', label: 'AI status' },
    deploy_ready: { sensitivity: 'system/readiness', riskLevel: 'high', phase: 'phase6e', label: 'Deployment readiness' },
    admin_panel: { sensitivity: 'admin/security', riskLevel: 'critical', phase: 'core', label: 'Admin panel' },
    vnext_platform: { sensitivity: 'admin/development', riskLevel: 'high', phase: 'r1-vnext', label: 'VNext platform kernel (R1)' },
    settings: { sensitivity: 'admin/security', riskLevel: 'critical', phase: 'core', label: 'Settings' },
    multi_entity: { sensitivity: 'admin/tenant', riskLevel: 'critical', phase: 'phase6e', label: 'Multi-entity control' },
    integration_hub: { sensitivity: 'admin/integration', riskLevel: 'critical', phase: 'phase6e', label: 'Integration hub' },
    security_center: { sensitivity: 'admin/security', riskLevel: 'critical', phase: 'phase6e', label: 'Security center' },
    data_quality: { sensitivity: 'admin/data', riskLevel: 'high', phase: 'phase6e', label: 'Data quality' },
    route_health: { sensitivity: 'system/diagnostic', riskLevel: 'medium', phase: 'phase6e', label: 'Route health' },
    system_check: { sensitivity: 'system/diagnostic', riskLevel: 'medium', phase: 'phase5', label: 'System check' },
    scenario_planner: { sensitivity: 'manager/planning', riskLevel: 'medium', phase: 'phase6e', label: 'Scenario planner' },
    device_center: { sensitivity: 'admin/device', riskLevel: 'high', phase: 'phase6e', label: 'Device center' },
    training_lms: { sensitivity: 'hr/training', riskLevel: 'medium', phase: 'phase6e', label: 'Training LMS' },
    risk_compliance: { sensitivity: 'compliance', riskLevel: 'high', phase: 'phase6b', label: 'Risk compliance' },
    procurement: { sensitivity: 'procurement/finance', riskLevel: 'high', phase: 'phase6e', label: 'Procurement' },
    supplier_portal: { sensitivity: 'procurement/finance', riskLevel: 'high', phase: 'phase6e', label: 'Supplier portal' },
    approvals: { sensitivity: 'manager/approval', riskLevel: 'high', phase: 'phase6e', label: 'Approvals' },
    customer_portal: { sensitivity: 'public/customer', riskLevel: 'low', phase: 'core', label: 'Customer portal' },
    calculator: { sensitivity: 'employee_self_service', riskLevel: 'low', phase: 'phase6h', label: 'Smart Calculator' },
    inventory: { sensitivity: 'workshop/inventory', riskLevel: 'high', phase: 'core', label: 'Inventory and stock' },
    sales: { sensitivity: 'sales/commerce', riskLevel: 'medium', phase: 'core', label: 'Sales' },
    machines: { sensitivity: 'workshop/production', riskLevel: 'medium', phase: 'core', label: 'Machines' },
    equipment: { sensitivity: 'workshop/production', riskLevel: 'medium', phase: 'core', label: 'Equipment' },
    op_packs: { sensitivity: 'workshop/production', riskLevel: 'medium', phase: 'core', label: 'Operation packs' },
    qc_center: { sensitivity: 'workshop/quality', riskLevel: 'medium', phase: 'core', label: 'QC center' },
    sop: { sensitivity: 'workshop/quality', riskLevel: 'low', phase: 'core', label: 'SOP library' },
    workflow: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'core', label: 'Workflow designer' },
    kanban: { sensitivity: 'workshop/operations', riskLevel: 'low', phase: 'core', label: 'Kanban board' },
    task_manager: { sensitivity: 'workshop/operations', riskLevel: 'low', phase: 'core', label: 'Task manager' },
    mrp: { sensitivity: 'workshop/production', riskLevel: 'medium', phase: 'phase6h', label: 'Manufacturing MRP II' },
    work_orders: { sensitivity: 'workshop/production', riskLevel: 'medium', phase: 'phase6h', label: 'Work Orders' },
    wfl_home: { sensitivity: 'employee_self_service', riskLevel: 'low', phase: 'phase6h', label: 'Role Home' },
    workshop_tv: { sensitivity: 'public/display', riskLevel: 'low', phase: 'phase6h', label: 'Workshop TV' },
    kiosk: { sensitivity: 'public/display', riskLevel: 'low', phase: 'phase6h', label: 'Kiosk Terminal' },
    pos: { sensitivity: 'workshop/pos', riskLevel: 'medium', phase: 'phase6h', label: 'Point of Sale' },
    sales_price_lists: { sensitivity: 'sales/pricing', riskLevel: 'medium', phase: 'phase7j', label: 'Sales price lists' },
    sales_commission: { sensitivity: 'sales/commission', riskLevel: 'high', phase: 'phase7j', label: 'Sales commission' },
    sales_contracts: { sensitivity: 'sales/contracts', riskLevel: 'high', phase: 'phase7j', label: 'Sales contracts' },
    finance_installments: { sensitivity: 'finance/installments', riskLevel: 'high', phase: 'phase7j', label: 'Finance installments' },
    pos_deepening: { sensitivity: 'workshop/pos', riskLevel: 'medium', phase: 'phase7j', label: 'POS deepening' },
    omni_communications: { sensitivity: 'ai/customer_comms', riskLevel: 'high', phase: 'phase7j', label: 'Omni communications' },
    pharmacy: { sensitivity: 'vertical/pharmacy', riskLevel: 'medium', phase: 'phase6h', label: 'Pharmacy vertical' },
    retail: { sensitivity: 'vertical/retail', riskLevel: 'medium', phase: 'phase6h', label: 'Retail vertical' },
    clinic: { sensitivity: 'vertical/clinic', riskLevel: 'medium', phase: 'phase6h', label: 'Clinic vertical' },
    restaurant: { sensitivity: 'vertical/restaurant', riskLevel: 'medium', phase: 'phase6h', label: 'Restaurant vertical' },
    'real-estate': { sensitivity: 'vertical/real_estate', riskLevel: 'medium', phase: 'phase6h', label: 'Real Estate vertical' },
    hotel: { sensitivity: 'vertical/hotel', riskLevel: 'medium', phase: 'phase6h', label: 'Hotel vertical' },
    assets: { sensitivity: 'workshop/maintenance', riskLevel: 'medium', phase: 'phase6h', label: 'Fixed Assets' },
    subscriptions: { sensitivity: 'finance/billing', riskLevel: 'medium', phase: 'phase6h', label: 'Subscriptions' },
    appointments: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Appointments' },
    loyalty: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Loyalty programs' },
    events: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Events Hub' },
    helpdesk: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Helpdesk' },
    fleet: { sensitivity: 'workshop/logistics', riskLevel: 'medium', phase: 'phase6h', label: 'Fleet Management' },
    documents: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Document Library' },
    esign: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'E-Signatures' },
    knowledge: { sensitivity: 'workshop/operations', riskLevel: 'low', phase: 'phase6h', label: 'Knowledge Base' },
    knowledge_base: { sensitivity: 'workshop/operations', riskLevel: 'low', phase: 'phase8d', label: 'Knowledge Base & FAQ' },
    surveys: { sensitivity: 'workshop/operations', riskLevel: 'low', phase: 'phase6h', label: 'Surveys' },
    visitors: { sensitivity: 'workshop/operations', riskLevel: 'low', phase: 'phase6h', label: 'Visitor Logs' },
    marketing: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Marketing' },
    projects: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Project Hub' },
    field_service: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Field Service' },
    rental: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Rental Hub' },
    warranty: { sensitivity: 'workshop/operations', riskLevel: 'medium', phase: 'phase6h', label: 'Warranty & RMA' },
    workshop_ledger: { sensitivity: 'finance/workshop', riskLevel: 'high', phase: 'phase6h', label: 'Workshop ledger' },
    contracts: { sensitivity: 'finance/compliance', riskLevel: 'high', phase: 'phase6h', label: 'Contracts Hub' },
    logistics: { sensitivity: 'workshop/logistics', riskLevel: 'medium', phase: 'phase6h', label: 'Logistics cargo' },
    help_manual: { sensitivity: 'employee_self_service', riskLevel: 'low', phase: 'phase6h', label: 'Help manual' }
  };

  const PAGE_PERMISSIONS = {
    home: [],
    finance: ['finance.user'],
    cashbox: ['finance.user'],
    expenses: ['finance.user'],
    income: ['finance.user'],
    customers: ['finance.user'],
    receipt: ['finance.user'],
    report: ['finance.user'],
    ar_ap: ['finance.user'],
    banking: ['finance.user'],
    budgeting: ['finance.manager'],
    tax_compliance: ['finance.manager', 'system.admin'],
    inventory: ['workshop.user'],
    employees: ['workshop.user'],
    import: ['workshop.manager'],
    timesheet: ['workshop.user'],
    calendar: ['workshop.user'],
    people_ops: ['workshop.manager'],
    employee_ui: [],
    employee_mobile: [],
    workflow: ['workshop.user'],
    kanban: ['workshop.user'],
    machines: ['workshop.user'],
    equipment: ['workshop.user'],
    op_packs: ['workshop.user'],
    task_manager: ['workshop.user'],
    sop: ['workshop.user'],
    qc_center: ['workshop.user'],
    sales: ['workshop.user', 'finance.user'],
    sales_price_lists: ['workshop.user', 'finance.user'],
    sales_commission: ['workshop.manager', 'finance.manager'],
    sales_contracts: ['workshop.manager', 'finance.manager'],
    finance_installments: ['finance.manager', 'finance.user'],
    pos_deepening: ['workshop.user', 'finance.user'],
    omni_communications: ['workshop.manager', 'finance.manager'],
    command_center: ['workshop.manager', 'finance.manager'],
    analytics: ['workshop.manager', 'finance.manager'],
    nl_reports: ['workshop.manager', 'finance.manager'],
    intelligence: ['workshop.manager', 'finance.manager'],
    whatsapp: ['workshop.manager', 'finance.manager'],
    telegram: ['workshop.manager', 'finance.manager'],
    automation: ['system.admin'],
    ai_queue: ['workshop.manager', 'finance.manager'],
    ai_factory: ['system.admin'],
    ai_tools: ['system.admin'],
    ai_status: ['workshop.manager', 'finance.manager'],
    deploy_ready: ['system.admin', 'workshop.manager', 'finance.manager'],
    risk_compliance: ['workshop.manager', 'finance.manager'],
    procurement: ['workshop.manager', 'finance.user'],
    supplier_portal: ['workshop.manager', 'finance.user'],
    approvals: ['workshop.manager', 'finance.manager'],
    multi_entity: ['system.admin'],
    integration_hub: ['system.admin'],
    security_center: ['system.admin'],
    data_quality: ['system.admin'],
    route_health: ['system.admin', 'workshop.manager', 'finance.manager'],
    system_check: ['system.admin', 'workshop.manager', 'finance.manager'],
    scenario_planner: ['workshop.manager', 'finance.manager'],
    device_center: ['system.admin', 'workshop.manager'],
    training_lms: ['workshop.manager'],
    admin_panel: ['system.admin'],
    vnext_platform: ['system.admin'],
    settings: ['system.admin'],
    customer_portal: [],
    calculator: [],
    mrp: ['workshop.user'],
    work_orders: ['workshop.user'],
    wfl_home: [],
    workshop_tv: [],
    kiosk: [],
    pos: ['workshop.user', 'finance.user'],
    pharmacy: ['workshop.user'],
    retail: ['workshop.user'],
    clinic: ['workshop.user'],
    restaurant: ['workshop.user'],
    'real-estate': ['workshop.user'],
    hotel: ['workshop.user'],
    assets: ['workshop.user'],
    subscriptions: ['finance.user'],
    appointments: ['workshop.user'],
    loyalty: ['workshop.user'],
    events: ['workshop.user'],
    helpdesk: ['workshop.user'],
    fleet: ['workshop.user'],
    documents: ['workshop.user'],
    esign: ['workshop.user'],
    knowledge: ['workshop.user'],
    knowledge_base: [], // public/internal (available for all authenticated roles)
    surveys: ['workshop.user'],
    visitors: ['workshop.user'],
    marketing: ['workshop.user'],
    projects: ['workshop.user'],
    field_service: ['workshop.user'],
    rental: ['workshop.user'],
    warranty: ['workshop.user'],
    workshop_ledger: ['workshop.manager', 'finance.user'],
    contracts: ['workshop.manager', 'finance.manager'],
    logistics: ['workshop.user'],
    help_manual: [],
  };

  function expandGroups(groups) {
    const resolved = new Set(groups || []);
    let changed = true;
    while (changed) {
      changed = false;
      [...resolved].forEach(group => {
        (GROUPS[group]?.implies || []).forEach(implied => {
          if (!resolved.has(implied)) {
            resolved.add(implied);
            changed = true;
          }
        });
      });
    }
    return [...resolved];
  }

  function groupsFromRole(roleId) {
    const key = String(roleId || '').trim();
    if (!key) return [];
    if (Array.isArray(ROLE_GROUPS[key])) return ROLE_GROUPS[key].slice();
    try {
      const roles = Array.isArray(root.omni?.roles) ? root.omni.roles : [];
      const role = roles.find(r => r.id === key);
      if (role && Array.isArray(role.groups)) return role.groups.slice();
      if (role && Array.isArray(role.permissions) && role.permissions.includes('all')) return ['system.admin'];
    } catch (_) {}
    return key.includes('.') ? [key] : [];
  }

  function normalizeUser(user = {}) {
    if (!user || typeof user !== 'object') return user;
    const roleId = user.roleId || user.role || '';
    const groups = Array.isArray(user.groups) ? user.groups.slice() : groupsFromRole(roleId);
    return {
      ...user,
      name: user.name || user.displayName || user.id || '',
      displayName: user.displayName || user.name || user.id || '',
      role: user.role || roleId,
      roleId,
      groups,
    };
  }

  const PermissionService = {
    groups: GROUPS,
    modelPermissions: MODEL_PERMISSIONS,
    actionPermissions: ACTION_PERMISSIONS,
    actionMetadata: ACTION_METADATA,
    pagePermissions: PAGE_PERMISSIONS,
    pageMetadata: PAGE_METADATA,

    resolveGroups(user = root.PentagonAuth.getCurrentUser()) {
      return expandGroups(normalizeUser(user)?.groups || []);
    },

    checkPage(page, user = root.PentagonAuth.getCurrentUser()) {
      const userGroups = this.resolveGroups(user);
      if (root.OCTAGON_DEBUG_PERMISSIONS || root.PENTAGON_DEBUG_PERMISSIONS) {
        console.debug(`Permission: Checking page "${page}" for user "${user?.id}" with groups:`, userGroups);
      }
      if (userGroups.includes('system.admin')) return true;
      const mapped = Object.prototype.hasOwnProperty.call(this.pagePermissions, page);
      if (!mapped) return true;
      const allowedGroups = this.pagePermissions[page] || [];
      if (!allowedGroups.length) return true;
      const result = allowedGroups.some(group => userGroups.includes(group));
      if (root.OCTAGON_DEBUG_PERMISSIONS || root.PENTAGON_DEBUG_PERMISSIONS) {
        console.debug(`Permission: Page "${page}" access: ${result}`);
      }
      return result;
    },

    explainPage(page, userOrRole = root.PentagonAuth.getCurrentUser()) {
      let user = userOrRole || {};
      if (typeof userOrRole === 'string') {
        user = { id: userOrRole, name: userOrRole, role: userOrRole, groups: groupsFromRole(userOrRole) };
      }
      user = normalizeUser(user);
      const mapped = Object.prototype.hasOwnProperty.call(this.pagePermissions, page);
      const allowedGroups = mapped ? (this.pagePermissions[page] || []) : [];
      const userGroups = this.resolveGroups(user);
      const systemAdmin = userGroups.includes('system.admin');
      const directAllowed = systemAdmin || !mapped || !allowedGroups.length || allowedGroups.some(group => userGroups.includes(group));
      const meta = this.pageMetadata[page] || {};
      const outcome = !mapped ? 'default_allowed' : directAllowed ? 'allowed' : 'blocked';
      const reason = !mapped
        ? 'local_dev_unmapped_default_allow'
        : (!allowedGroups.length ? 'explicit_public_or_self_service' : (directAllowed ? 'explicit_permission_match' : 'missing_required_page_permission'));

      return {
        page,
        label: meta.label || page,
        mapped,
        allowedGroups,
        userId: user?.id || '',
        userName: user?.name || user?.id || '',
        userGroups,
        sensitivity: meta.sensitivity || 'normal business',
        riskLevel: meta.riskLevel || 'low',
        phase: meta.phase || (mapped ? 'explicit' : 'unmapped'),
        defaultPolicy: mapped ? 'explicit_page_policy' : 'allow_local_dev_unmapped',
        outcome,
        allowed: directAllowed,
        reason,
      };
    },

    check(collection, action, user = root.PentagonAuth.getCurrentUser()) {
      const userGroups = this.resolveGroups(user);
      if (userGroups.includes('system.admin')) return true;
      const allowedGroups = this.modelPermissions[collection]?.[action] || [];
      if (!allowedGroups.length) return true;
      return allowedGroups.some(group => userGroups.includes(group));
    },

    checkAction(actionKey, context = {}, user = root.PentagonAuth.getCurrentUser()) {
      const explained = this.explainAction(actionKey, context, user);
      return explained.allowed === true;
    },

    explainAction(actionKey, context = {}, userOrRole = root.PentagonAuth.getCurrentUser()) {
      let user = userOrRole || {};
      if (typeof userOrRole === 'string') {
        user = { id: userOrRole, name: userOrRole, role: userOrRole, groups: groupsFromRole(userOrRole) };
      }
      user = normalizeUser(user);
      const mapped = Object.prototype.hasOwnProperty.call(this.actionPermissions, actionKey);
      const meta = { ...(this.actionMetadata[actionKey] || {}), ...(context?.riskLevel ? { riskLevel: context.riskLevel } : {}) };
      const riskLevel = meta.riskLevel || 'low';
      const highRisk = ['high', 'critical'].includes(riskLevel);
      const allowedGroups = mapped ? (this.actionPermissions[actionKey] || []) : [];
      const userGroups = this.resolveGroups(user);
      const systemAdmin = userGroups.includes('system.admin');
      const directAllowed = systemAdmin || (mapped && allowedGroups.some(group => userGroups.includes(group)));
      let outcome = directAllowed ? 'allowed' : 'blocked';
      let reason = directAllowed ? 'explicit_permission_match' : 'missing_required_permission';

      if (!mapped && highRisk) {
        outcome = meta.approvalRequired ? 'approval_required' : 'blocked';
        reason = meta.approvalRequired ? 'high_risk_unmapped_approval_required' : 'high_risk_unmapped_default_deny';
      } else if (!mapped) {
        outcome = 'allowed';
        reason = 'local_dev_unmapped_default_allow';
      } else if (!directAllowed && meta.approvalRequired) {
        outcome = 'approval_required';
        reason = 'approval_required_for_sensitive_action';
      }

      return {
        actionKey,
        label: meta.label || actionKey,
        page: meta.page || context?.page || '',
        module: meta.module || context?.module || '',
        mapped,
        allowedGroups,
        userId: user?.id || '',
        userName: user?.name || user?.id || '',
        userGroups,
        riskLevel,
        approvalRequired: !!meta.approvalRequired || outcome === 'approval_required',
        defaultPolicy: (!mapped && highRisk) ? 'deny_high_risk_unmapped' : (!mapped ? 'allow_local_dev_unmapped' : 'explicit'),
        outcome,
        allowed: outcome === 'allowed',
        reason,
      };
    },

    requireAction(actionKey, context = {}, user) {
      if (!this.checkAction(actionKey, context, user)) {
        throw new Error(`هذا الإجراء يحتاج صلاحية مدير. [${actionKey}]`);
      }
      return true;
    },

    checkField(collection, field, user = root.PentagonAuth.getCurrentUser()) {
      const userGroups = this.resolveGroups(user);
      if (userGroups.includes('system.admin')) return true;
      const allowedGroups = SENSITIVE_FIELDS[collection]?.[field] || [];
      if (!allowedGroups.length) return true; // Not sensitive
      return allowedGroups.some(group => userGroups.includes(group));
    },

    require(collection, action, user) {
      if (!this.check(collection, action, user)) {
        throw new Error(`⚠️ عذراً، لا تمتلك صلاحية [${action}] على [${collection}]`);
      }
      return true;
    },
  };

  root.PermissionService = PermissionService;
  services.permission = PermissionService;
})();
