/**
 * OCTAGON OMNISYSTEM - modules/data-providers.js
 *
 * GO 16 (de-monolith) — Phase 1. Self-contained STATIC DATA providers extracted
 * verbatim from app.js so the monolith stops growing. These functions only return
 * literal data; their few runtime references (makeId, buildComprehensiveWorkflowDemo,
 * and lazy `typeof renderX` checks) are app.js globals that already exist by the time
 * these are *called* at runtime.
 *
 * Loaded BEFORE app.js in index.html (definitions only, no top-level execution), so
 * load order is safe and every existing call site keeps resolving to these globals.
 *
 * Pattern going forward: new tools and future extractions live in modules/*.js,
 * NOT in app.js.
 */

// --- moved from app.js: page route registry (lazy typeof checks, pure to define) ---
function getOctagonPageTruthRegistry() {
  return [
    { page: 'calculator', label: 'الحاسبة الذكية', navId: 'navCalculator', pageId: 'pageCalculator', section: 'الرواتب', renderOk: () => typeof refreshCalcEmpDropdown === 'function' },
    { page: 'timesheet', label: 'جدول الدوام الذكي', navId: 'navTimesheet', pageId: 'pageTimesheet', section: 'الرواتب', renderOk: () => typeof renderTimesheet === 'function' },
    { page: 'calendar', label: 'تقويم الحضور', navId: 'navCalendar', pageId: 'pageCalendar', section: 'الرواتب', renderOk: () => typeof renderAttendanceCalendar === 'function' },
    { page: 'import', label: 'استيراد البيانات', navId: 'navImport', pageId: 'pageImport', section: 'الرواتب', staticPage: true },
    { page: 'employees', label: 'الموظفون', navId: 'navEmployees', pageId: 'pageEmployees', section: 'الرواتب', renderOk: () => typeof renderEmployeesTable === 'function' },
    { page: 'finance', label: 'لوحة المالية', navId: 'navFinance', pageId: 'pageFinance', section: 'المالية', renderOk: () => typeof renderFinanceDashboard === 'function' },
    { page: 'cashbox', label: 'صندوق الورشة', navId: 'navCashbox', pageId: 'pageCashbox', section: 'المالية', renderOk: () => typeof renderCashbox === 'function' },
    { page: 'expenses', label: 'المصاريف', navId: 'navExpenses', pageId: 'pageExpenses', section: 'المالية', renderOk: () => typeof renderExpensesPage === 'function' },
    { page: 'income', label: 'الإيرادات', navId: 'navIncome', pageId: 'pageIncome', section: 'المالية', renderOk: () => typeof renderIncomePage === 'function' },
    { page: 'customers', label: 'أرصدة العملاء', navId: 'navCustomers', pageId: 'pageCustomers', section: 'المالية', renderOk: () => typeof renderCustomersPage === 'function' },
    { page: 'receipt', label: 'منشئ الفواتير', navId: 'navReceipt', pageId: 'pageReceipt', section: 'المالية', renderOk: () => typeof renderReceiptPage === 'function' },
    { page: 'report', label: 'التقرير الختامي', navId: 'navReport', pageId: 'pageReport', section: 'الرواتب', renderOk: () => typeof renderReport === 'function' },
    { page: 'command_center', label: 'مركز القيادة', navId: 'navCommandCenter', pageId: 'pageCommandCenter', section: 'النظام', renderOk: () => typeof renderCommandCenter === 'function' },
    { page: 'kanban', label: 'اللوحة التنفيذية', navId: 'navKanban', pageId: 'pageKanban', section: 'النظام', renderOk: () => typeof renderKanbanBoard === 'function' },
    { page: 'workflow', label: 'مصمم العمليات', navId: 'navWorkflow', pageId: 'pageWorkflow', section: 'النظام', renderOk: () => typeof renderWorkflowStudio === 'function' },
    { page: 'op_packs', label: 'باقات العمليات', navId: 'navOpPacks', pageId: 'pageOpPacks', section: 'النظام', renderOk: () => typeof renderOpPacks === 'function' },
    { page: 'task_manager', label: 'مدير المهام', navId: 'navTaskManager', pageId: 'pageTaskManager', section: 'النظام', renderOk: () => typeof renderTaskManager === 'function' },
    { page: 'sop', label: 'مكتبة الإجراءات', navId: 'navSop', pageId: 'pageSop', section: 'النظام', renderOk: () => typeof renderSopHub === 'function' },
    { page: 'machines', label: 'التحكم بالمكائن', navId: 'navMachines', pageId: 'pageMachines', section: 'النظام', renderOk: () => typeof renderMachinesPage === 'function' },
    { page: 'inventory', label: 'المخزون', navId: 'navInventory', pageId: 'pageInventory', section: 'النظام', renderOk: () => typeof renderInventoryPage === 'function' },
    { page: 'equipment', label: 'المعدات', navId: 'navEquipment', pageId: 'pageEquipment', section: 'النظام', renderOk: () => typeof renderEquipmentPage === 'function' },
    { page: 'qc_center', label: 'مركز الجودة', navId: 'navQcCenter', pageId: 'pageQcCenter', section: 'النظام', renderOk: () => typeof renderQcCenter === 'function' },
    { page: 'analytics', label: 'التحليلات والذكاء', navId: 'navAnalytics', pageId: 'pageAnalytics', section: 'النظام', renderOk: () => typeof renderAnalytics === 'function' },
    { page: 'nl_reports', label: 'تقارير اللغة الطبيعية', navId: 'navNlReports', pageId: 'pageNlReports', section: 'النظام', renderOk: () => !!(window.OctagonNLReports || window.PentagonNLReports) },
    { page: 'intelligence', label: 'لوحة تحكم الذكاء', navId: 'navIntelligence', pageId: 'pageIntelligence', section: 'النظام', renderOk: () => typeof renderAiControlDashboard === 'function' },
    { page: 'automation', label: 'محرك الأتمتة', navId: 'navAutomation', pageId: 'pageAutomation', section: 'النظام', renderOk: () => typeof renderAutomationEngine === 'function' },
    { page: 'whatsapp', label: 'صندوق رسائل العملاء', navId: 'navWhatsapp', pageId: 'pageWhatsapp', section: 'النظام', renderOk: () => typeof renderWhatsAppIntegrationPage === 'function' },
    { page: 'telegram', label: 'بوابة Telegram العامة', navId: 'navTelegram', pageId: 'pageTelegram', section: 'النظام', renderOk: () => typeof renderTelegramIntegrationPage === 'function' },
    { page: 'sales', label: 'المبيعات وعلاقات العملاء', navId: 'navSales', pageId: 'pageSales', section: 'النظام', renderOk: () => typeof renderSalesCrmPage === 'function' },
    { page: 'mrp', label: 'التصنيع والتخطيط', navId: 'navMrp', pageId: 'pageMrp', section: 'النظام', renderOk: () => !!(window.OctagonMRP || window.PentagonMRP) },
    { page: 'multi_entity', label: 'إدارة الفروع', navId: 'navMultiEntity', pageId: 'pageMultiEntity', section: 'النظام', renderOk: () => !!(window.OctagonMultiEntity || window.PentagonMultiEntity) },
    { page: 'tax_compliance', label: 'الامتثال الضريبي', navId: 'navTaxCompliance', pageId: 'pageTaxCompliance', section: 'النظام', renderOk: () => !!(window.OctagonTaxCompliance || window.PentagonTaxCompliance) },
    { page: 'employee_ui', label: 'بوابة الموظف', navId: 'navEmployeeUI', pageId: 'pageEmployee_ui', section: 'النظام', renderOk: () => typeof renderEmployeePortal === 'function' },
    { page: 'customer_portal', label: 'بوابة العملاء', navId: 'navCustomerPortal', pageId: 'pageCustomerPortal', section: 'النظام', renderOk: () => typeof renderCustomerPortal === 'function' },
    { page: 'admin_panel', label: 'لوحة الإدارة', navId: 'navAdminPanel', pageId: 'pageAdminPanel', section: 'النظام', renderOk: () => typeof renderAdminPanel === 'function' },
    { page: 'help_manual', label: 'دليل المساعدة', navId: 'navHelpManual', pageId: 'pageHelpManual', section: 'النظام', renderOk: () => typeof renderHelpManualPage === 'function' }
  ];
}

const getPentagonPageTruthRegistry = getOctagonPageTruthRegistry;

// --- moved from app.js: Odoo-parity gap registry (pure literals) ---
function getOdooPlusGapRegistry() {
  return [
    { area: 'المحاسبة', odoo: 'محاسبة، مدفوعات، ضرائب، المحاسبة العراقية', current: 'محرك المالية V6 وصفحات المالية المحمية', percent: 60, gap: 'دفتر الشركاء، الضرائب، تسوية البنك، الكشوفات، دورة حياة الفاتورة بعمق', page: 'finance', priority: 'High' },
    { area: 'المبيعات', odoo: 'مبيعات، إدارة المبيعات، علاقات العملاء، جهات الاتصال', current: 'العملاء، الفواتير، تسعير الباقات، أساس إدارة العملاء المحتملين', percent: 35, gap: 'خط عروض الأسعار، مراحل العملاء المحتملين، اعتماد العرض، تحويل الطلب، بوابة العملاء', page: 'whatsapp', priority: 'High' },
    { area: 'المشتريات', odoo: 'مشتريات، مشتريات المخزون، طلبات الشراء', current: 'الموردون، تحليلات الشراء، طلبات المواد، استلام أوامر الشراء', percent: 55, gap: 'دورة حياة طلب العرض، تاريخ الأسعار، اعتمادات الشراء، تقييم الموردين', page: 'inventory', priority: 'High' },
    { area: 'المخزون', odoo: 'المخزون، الباركود، مواقع التخزين، التقييم', current: 'المواد، الحجوزات، تدقيق الحركة، تصدير البيانات، روابط الموردين', percent: 75, gap: 'المواقع، الدُفعات والتسلسلية، نقل المخزون، سير عمل الباركود، عمق التقييم', page: 'inventory', priority: 'Medium' },
    { area: 'التصنيع', odoo: 'تخطيط الإنتاج، الإصلاح، المقاولة من الباطن', current: 'باقات العمليات، اللوحة التنفيذية، المكائن، الجودة، بيانات أوامر العمل', percent: 70, gap: 'أوامر عمل رسمية، ساعات ماكينة فعلية، تكلفة الهالك وإعادة العمل، محرك الجدولة', page: 'op_packs', priority: 'High' },
    { area: 'المشاريع والمهام', odoo: 'المشاريع، سجل الدوام، مخزون المشاريع', current: 'مدير المهام، اللوحة التنفيذية، روابط العمليات', percent: 82, gap: 'تقارير المحفظة، صحة الاعتماديات، رصد الوقت والتكلفة، معالم تسليم العملاء', page: 'task_manager', priority: 'Medium' },
    { area: 'الموارد البشرية', odoo: 'الموارد البشرية، الحضور، الإجازات، سجل الدوام', current: 'الرواتب محمية، الحضور، بوابة الموظف، الطلبات، بطاقات مراجعة الذكاء (قراءة فقط)', percent: 92, gap: 'التنفيذ يُحوَّل دائماً للمراجعة/المهمة فقط؛ لا تعديل مباشر على الراتب بالتصميم', page: 'intelligence', priority: 'Medium' },
    { area: 'الصيانة', odoo: 'الصيانة، المعدات', current: 'صيانة المكائن بالساعات/الأيام، لوحة المخاطر، الطلبات', percent: 80, gap: 'دورة حياة أمر الصيانة، استهلاك القطع، تحليلات التوقف', page: 'machines', priority: 'Medium' },
    { area: 'التواصل', odoo: 'البريد، الدردشة المباشرة، الرسائل القصيرة', current: 'الإشعارات، صندوق مراجعة رسائل العملاء', percent: 45, gap: 'واجهة برمجة تطبيقات المراسلة، المرفقات والصوت، السجلات المترابطة، قوالب الإرسال', page: 'whatsapp', priority: 'Critical' },
    { area: 'الذكاء والأتمتة', odoo: 'الأتمتة الأساسية (لا يوجد ما يعادل تحكم الذكاء)', current: 'محرك الأتمتة ولوحة جاهزية الذكاء', percent: 50, gap: 'إعدادات المزود، طابور الإجراءات، بوابات السياسة، الذكاء القابل للشرح، الكتابة المعتمدة', page: 'intelligence', priority: 'Critical' },
    { area: 'الإدارة والإعدادات', odoo: 'الإعداد الأساسي، المستخدمون، الشركات', current: 'لوحة الإدارة مع هرمية متعددة الشركات والسجلات', percent: 65, gap: 'ربط الإعدادات بين الوحدات، الأدوار، الشركة النشطة، العملة، النسخ الاحتياطي', page: 'admin_panel', priority: 'High' },
    { area: 'التحليلات', odoo: 'لوحات بيانات جداول البيانات', current: 'التحليلات التشغيلية ولقطة الإنجاز', percent: 62, gap: 'فلاتر التاريخ، التصدير، الربحية، توقع التأخير، كشف مشاكل الإجراءات', page: 'analytics', priority: 'High' },
    { area: 'بوابة العملاء', odoo: 'الموقع، البوابة الإلكترونية، المتجر الإلكتروني', current: 'غير مبني كبوابة بعد', percent: 10, gap: 'تتبع طلبات العملاء، اعتماد العرض، ملخص الفاتورة والدفع', page: 'customers', priority: 'Medium' }
  ];
}

// --- moved from app.js: default QC templates (uses makeId at runtime) ---
function defaultQcTemplates() {
  const now = new Date().toISOString();
  const base = [
    ['laser', 'فحص قص ليزر', ['مطابقة الأبعاد مع الملف', 'الحواف نظيفة بدون حرق زائد', 'القطعة مكتملة بدون كسر']],
    ['print', 'فحص طباعة', ['الألوان مطابقة', 'لا يوجد تمويج أو تقطيع', 'الخامة مثبتة بشكل صحيح']],
    ['router', 'فحص راوتر', ['المسار صحيح', 'العمق مطابق', 'التثبيت لم يترك أثر غير مقبول']],
    ['3d', 'فحص طباعة ثلاثية الأبعاد', ['الطبقات متماسكة', 'الأبعاد ضمن السماحية', 'الدعامات منظفة']],
    ['delivery', 'فحص تغليف وتسليم', ['القطعة نظيفة', 'التغليف مناسب', 'بيانات التسليم مكتملة']],
    ['measure', 'فحص قياسات', ['الطول والعرض ضمن السماحية', 'الزوايا صحيحة', 'العدد مطابق']],
    ['finish', 'فحص نظافة وتشطيب', ['لا توجد خدوش ظاهرة', 'الحواف مشطبة', 'السطح نظيف']]
  ];
  return base.map(([type, title, checklist]) => ({
    id: makeId('qct'),
    title,
    type,
    department: 'الجودة',
    sopId: '',
    machineType: '',
    requiredForTypes: [type],
    checklist: checklist.map(text => ({ id: makeId('qci'), text, required: true, expectedValue: '', tolerance: '', unit: '' })),
    severityOnFail: 'high',
    createdAt: now,
    updatedAt: now
  }));
}

// --- moved from app.js: workflow templates (builder ref resolves at runtime) ---
function getWorkflowTemplates() {
  return [
    { id: 'comprehensive_production_test', name: 'مثال شامل: طلب إنتاج لوحة واجهة محل', description: 'يفحص جميع قدرات مصمم العمليات: اعتماد، مواد، ماكينة، SOP، QC، إعادة عمل، مالية، إشعار، وتسليم.', category: 'testing', builder: buildComprehensiveWorkflowDemo },
    { id: 'general_order', name: 'طلب → تصميم → مراجعة → تنفيذ → QC → تسليم', nodes: [['trigger', 'استلام الطلب'], ['human_task', 'تصميم'], ['approval', 'مراجعة واعتماد'], ['operation', 'تنفيذ'], ['qc', 'فحص جودة'], ['archive', 'تسليم وإغلاق']] },
    { id: 'laser_order', name: 'طلب ليزر → تجهيز ملف → قص → فحص → تغليف', nodes: [['trigger', 'طلب ليزر'], ['human_task', 'تجهيز ملف'], ['machine', 'قص ليزر'], ['qc', 'فحص'], ['archive', 'تغليف وتسليم']] },
    { id: 'router_order', name: 'طلب راوتر → تصميم → تثبيت خامة → تشغيل → تنظيف → QC', nodes: [['trigger', 'طلب راوتر'], ['human_task', 'تصميم'], ['operation', 'تثبيت خامة'], ['machine', 'تشغيل راوتر'], ['action', 'تنظيف'], ['qc', 'فحص جودة']] },
    { id: 'printing_3d', name: 'طباعة 3D → تجهيز ملف → طباعة → تنظيف → QC', nodes: [['trigger', 'طلب طباعة 3D'], ['human_task', 'تجهيز ملف'], ['machine', 'طباعة'], ['action', 'تنظيف'], ['qc', 'فحص جودة']] },
    { id: 'rework', name: 'فحص فاشل → إعادة عمل → فحص ثاني → تسليم', nodes: [['qc', 'فحص فاشل'], ['rework', 'إعادة عمل'], ['qc', 'فحص ثاني'], ['archive', 'تسليم']] }
  ];
}

// --- moved from app.js: workshop automation templates (pure literals) ---
function ptxAutomationTemplates() {
  return [
    { key: 'stuck_kanban', icon: '📋', title: 'تصعيد البطاقة العالقة', note: 'إذا بقيت بطاقة عالقة في اللوحة، يصعدها ويضيف تنبيه.', event: 'KANBAN_CARD_STUCK', action: 'flag_anomaly' },
    { key: 'low_stock', icon: '📦', title: 'نقص مادة مهمّة', note: 'إذا نزل المخزون تحت الحد الأدنى، ينشئ مقترح شراء للموافقة.', event: 'MATERIAL_BELOW_MINIMUM', action: 'propose_purchase' },
    { key: 'whatsapp_to_task', icon: '💬', title: 'رسالة العميل إلى متابعة', note: 'بعد اعتماد رسالة العميل، ينشئ مهمة أو طلب مراجعة واضح.', event: 'WHATSAPP_APPROVED', action: 'create_task' },
    { key: 'quote_followup', icon: '🧾', title: 'متابعة عرض السعر', note: 'كل عرض سعر جديد يولد مهمة تدقيق ومتابعة.', event: 'QUOTE_CREATED', action: 'create_task' },
    { key: 'machine_load', icon: '⚙️', title: 'ضغط الماكينة', note: 'إذا زاد حمل الماكينة، ينبه المشرف لإعادة التوزيع.', event: 'MACHINE_OVERLOADED', action: 'notify_supervisor' },
    { key: 'qc_after_done', icon: '🧪', title: 'فحص جودة تلقائي', note: 'عند اكتمال عمل حساس، يفتح فحص جودة بدل التسليم العشوائي.', event: 'KANBAN_CARD_STUCK', action: 'schedule_inspection' }
  ];
}

// --- moved from app.js (Phase 2): default QC settings (pure literals) ---
function getDefaultQcSettings() {
  return {
    requireQcForDelivery: true,
    requireQcForOperationCards: true,
    requireQcForMachineCards: true,
    requireQcForHighPriority: true,
    requireQcForOpPackExecution: true,
    blockDeliveryOnFailedQc: true,
    autoCreateReworkOnFail: false
  };
}

// --- moved from app.js (Phase 2): default workshop operating-cost items (pure literals) ---
// keywords/accountId added (GO: monthly operating costs premium rebuild) for
// auto-fetch matching against the expenses ledger and correct GL posting.
// allocationBasis defaults to 'calendar_days' — fixed overhead like rent must
// keep showing up across every day of the month, attendance or not, rather
// than disappearing on days with zero recorded employees.
function getDefaultWorkshopOperatingCostItems() {
  return [
    { id: 'rent', name: 'إيجار الورشة', amount: 0, active: true, allocationBasis: 'calendar_days', accountId: 'rent_expense', categoryId: 'cat_rent', keywords: ['ايجار', 'إيجار', 'rent'] },
    { id: 'internet', name: 'اشتراك الإنترنت', amount: 0, active: true, allocationBasis: 'calendar_days', accountId: 'utilities_expense', categoryId: 'cat_utilities', keywords: ['انترنت', 'إنترنت', 'نت', 'internet'] },
    { id: 'electricity', name: 'اشتراك الكهرباء', amount: 0, active: true, allocationBasis: 'calendar_days', accountId: 'utilities_expense', categoryId: 'cat_utilities', keywords: ['كهرباء', 'أمبير', 'امبير', 'electricity'] },
    { id: 'water', name: 'اشتراك الماء', amount: 0, active: true, allocationBasis: 'calendar_days', accountId: 'utilities_expense', categoryId: 'cat_utilities', keywords: ['ماء', 'مويه', 'مياه', 'water'] },
    { id: 'diesel', name: 'كاز تشغيل المولد', amount: 0, active: true, allocationBasis: 'calendar_days', accountId: 'transport_fuel_expense', categoryId: 'cat_fuel', keywords: ['كاز', 'ديزل', 'وقود', 'مولدة', 'مولد', 'diesel', 'fuel'] },
    { id: 'chatgpt', name: 'اشتراك ChatGPT / الذكاء الاصطناعي', amount: 0, active: true, allocationBasis: 'calendar_days', accountId: 'expense_general', categoryId: 'cat_general', keywords: ['chatgpt', 'ذكاء اصطناعي', 'اشتراك برمجي', 'ai'] }
  ];
}

// --- moved from app.js (Phase 2): default admin settings (pure literals) ---
function getDefaultAdminSettings() {
  return {
    ui: {
      defaultTheme: 'default',
      density: 'comfortable',
      bigScreenMode: false,
      rtl: true,
      animations: true
    },
    workflow: {
      snapToGrid: true,
      gridSize: 24,
      confirmBeforeDelete: true,
      quickEditEnabled: true,
      connectionMode: 'ports'
    },
    inventory: {
      showBatteryIndicator: true,
      lowStockPercent: 40,
      criticalStockPercent: 20,
      showReservedQty: true
    },
    notifications: {
      soundEnabled: true
    },
    finance: {
      expenseCategories: [],
      incomeSources: [],
      people: [],
      departments: []
    },
    operationPacks: {
      previewBeforeExecute: true,
      reserveMaterialsOnExecute: true,
      addMachineQueueOnExecute: true
    },
    kanban: {
      confirmBeforeDelete: true,
      showReadiness: true,
      showIndicators: true
    },
    permissions: {
      adminMode: true,
      lockedPagesProtected: true,
      foundationOnly: true
    },
    organization: {
      // ─── Global settings (apply across all companies) ───
      currency: 'IQD',
      currencySymbol: 'د.ع',
      country: 'العراق',
      multiTenant: false,
      // ─── Multi-company structure (each company has departments → shifts) ───
      companies: [],
      activeCompanyId: '',
      // ─── Supervisors pool — shifts reference these by id ───
      supervisors: [],
      // ─── LEGACY flat fields (kept for backward compat; migrated into companies[0] on first normalize) ───
      name: '',
      owner: '',
      phone: '',
      address: '',
      logoEmoji: '🏭',
      workStart: '09:00',
      workEnd: '17:00',
      dayOff: 'friday',
      founded: ''
    },
    supervisorRouting: {}
  };
}

// --- moved from app.js (Phase 2): default machines seed (pure literals) ---
function defaultMachines() {
  return [
    { id: 'mach_laser_120', name: 'ليزر 120×90', type: 'laser', status: 'operational', operator: 'أحمد', queue: 3, lastMaintenance: '2026-04-20', hoursTotal: 1840, downtime: 12, sopId: 'sop_safety', jobsToday: 4 },
    { id: 'mach_laser_100', name: 'ليزر 100×80', type: 'laser', status: 'operational', operator: 'علي', queue: 1, lastMaintenance: '2026-05-01', hoursTotal: 920, downtime: 5, sopId: '', jobsToday: 2 },
    { id: 'mach_laser_125', name: 'ليزر 125×250', type: 'laser', status: 'maintenance', operator: '-', queue: 0, lastMaintenance: '2026-05-08', hoursTotal: 2100, downtime: 28, sopId: '', jobsToday: 0 },
    { id: 'mach_cnc', name: 'راوتر CNC 125×250', type: 'cnc', status: 'operational', operator: 'يوسف', queue: 2, lastMaintenance: '2026-04-15', hoursTotal: 1560, downtime: 18, sopId: '', jobsToday: 3 },
    { id: 'mach_fiber', name: 'ماركر ألياف ضوئية', type: 'fiber', status: 'idle', operator: 'سيف', queue: 0, lastMaintenance: '2026-05-05', hoursTotal: 480, downtime: 2, sopId: '', jobsToday: 0 },
    { id: 'mach_3dprint', name: 'طابعة ثلاثية الأبعاد', type: '3d', status: 'operational', operator: 'أشرف', queue: 1, lastMaintenance: '2026-04-28', hoursTotal: 620, downtime: 8, sopId: '', jobsToday: 1 },
    { id: 'mach_printer', name: 'طابعة عريضة', type: 'print', status: 'operational', operator: 'علي', queue: 2, lastMaintenance: '2026-05-03', hoursTotal: 1100, downtime: 6, sopId: '', jobsToday: 2 }
  ];
}

// --- moved from app.js (Phase 2): default materials seed (pure literals) ---
function defaultMaterials() {
  return [
    { id: 'mat_acrylic', name: 'أكريلك', unit: 'لوح', stock: 45, reserved: 12, minimum: 10, cost: 15000, supplier: 'مورد البلاستيك', category: 'خام' },
    { id: 'mat_mdf', name: 'MDF', unit: 'لوح', stock: 30, reserved: 8, minimum: 5, cost: 8000, supplier: 'مورد الخشب', category: 'خام' },
    { id: 'mat_foam', name: 'فوم بورد', unit: 'لوح', stock: 60, reserved: 5, minimum: 15, cost: 3000, supplier: 'مورد البلاستيك', category: 'خام' },
    { id: 'mat_led', name: 'شريط LED', unit: 'متر', stock: 200, reserved: 50, minimum: 30, cost: 1500, supplier: 'مورد الكهربائيات', category: 'كهربائي' },
    { id: 'mat_power', name: 'محول كهرباء', unit: 'قطعة', stock: 15, reserved: 3, minimum: 5, cost: 12000, supplier: 'مورد الكهربائيات', category: 'كهربائي' },
    { id: 'mat_paint', name: 'طلاء سبراي', unit: 'علبة', stock: 25, reserved: 4, minimum: 10, cost: 5000, supplier: 'مورد الدهانات', category: 'تشطيب' },
    { id: 'mat_adhesive', name: 'لاصق صناعي', unit: 'علبة', stock: 18, reserved: 2, minimum: 5, cost: 3500, supplier: 'مورد عام', category: 'تشطيب' },
    { id: 'mat_vinyl', name: 'فينايل طباعة', unit: 'رول', stock: 8, reserved: 2, minimum: 3, cost: 25000, supplier: 'مورد الطباعة', category: 'طباعة' }
  ];
}

// --- moved from app.js (Phase 2): default equipment register (pure literals) ---
function defaultEquipment() {
  return [
    { id: 'eq_bioread', name: 'حبر بصمة اصبع', barcode: 'EQ-IDAR-01', category: 'أجهزة مكتبية', location: 'الادارة', status: 'operational', quantity: 2, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_calc_sm', name: 'حاسبة صغيرة', barcode: 'EQ-IDAR-02', category: 'أجهزة مكتبية', location: 'الادارة', status: 'operational', quantity: 2, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_punch_sm', name: 'ثاقبة صغيرة', barcode: 'EQ-IDAR-03', category: 'أدوات مكتبية', location: 'الادارة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_prn_520', name: 'طابعة DCP-T52OW', barcode: 'EQ-IDAR-04', category: 'أجهزة مكتبية', location: 'الادارة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_fridge_beko', name: 'ثلاجة سبلت جداري BEKO', barcode: 'EQ-KITC-01', category: 'أجهزة كهربائية', location: 'المطبخ', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'لا توجد قطعة خارجية للسبلت' },
    { id: 'eq_oven_4', name: 'طباخ 4 عيون', barcode: 'EQ-KITC-02', category: 'أجهزة كهربائية', location: 'المطبخ', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_fryer', name: 'قلاية كهربائية', barcode: 'EQ-KITC-03', category: 'أجهزة كهربائية', location: 'المطبخ', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_microwave', name: 'مايكروويف', barcode: 'EQ-KITC-04', category: 'أجهزة كهربائية', location: 'المطبخ', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_prn_phoenix', name: 'طابعة بوستر كبيرة PHOENIX', barcode: 'EQ-PRNT-01', category: 'طابعات ومكائن', location: 'غرفة الطابعات', status: 'maintenance', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'maintenance', notes: 'يحتاج صيانة هيد' },
    { id: 'eq_cnc_skyjt', name: 'بلوتر قص CNC SKYJT', barcode: 'EQ-PRNT-02', category: 'طابعات ومكائن', location: 'غرفة الطابعات', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'حركه محمد' },
    { id: 'eq_press_tuobang', name: 'كابسة ملابس TUOBANG حمراء', barcode: 'EQ-PRNT-03', category: 'كوابس حرارية', location: 'غرفة الطابعات', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_lam_laminator', name: 'كابسة حرارية LAMLNATOR تغليف', barcode: 'EQ-PRNT-04', category: 'كوابس حرارية', location: 'غرفة الطابعات', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_ring_press', name: 'مكبس حلقات لون ازرق', barcode: 'EQ-PRNT-05', category: 'كوابس حرارية', location: 'غرفة الطابعات', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_fiber_laser_20', name: 'طابعة فايبر ليزر 20 واط', barcode: 'EQ-PRNT-06', category: 'طابعات ومكائن', location: 'غرفة الطابعات', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_spiral_bright', name: 'جهاز سبايرول BRIGHT OFFICE', barcode: 'EQ-PRNT-07', category: 'أجهزة مكتبية', location: 'غرفة الطابعات', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_book_press', name: 'كابسة كتب كبيرة', barcode: 'EQ-BIND-01', category: 'كوابس', location: 'غرفة لصق وتجليد', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_paper_cutter', name: 'قاطعة ورق', barcode: 'EQ-BIND-02', category: 'أدوات يدوية', location: 'غرفة لصق وتجليد', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_bender_90', name: 'معواجة 90 سم', barcode: 'EQ-BIND-03', category: 'أدوات يدوية', location: 'غرفة لصق وتجليد', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم معواجة يدوية' },
    { id: 'eq_bender_heat', name: 'معواجة حرارية', barcode: 'EQ-BIND-04', category: 'أدوات يدوية', location: 'غرفة لصق وتجليد', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_prn_canon_510', name: 'طابعة CANON 510', barcode: 'EQ-OFFC-01', category: 'أجهزة مكتبية', location: 'المكتب', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_safe_box', name: 'قاصة صغيرة', barcode: 'EQ-OFFC-02', category: 'أجهزة مكتبية', location: 'المكتب', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_drill_hammer', name: 'دريل همر', barcode: 'EQ-WRKS-01', category: 'أدوات كهربائية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم (1 عاطل تم عزله)' },
    { id: 'eq_drill_normal', name: 'دريل كهربائي عادي', barcode: 'EQ-WRKS-02', category: 'أدوات كهربائية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_nail_gun', name: 'مسدس مسمار', barcode: 'EQ-WRKS-03', category: 'أدوات هوائية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_rivet_gun', name: 'مسدس برشام (لقمة)', barcode: 'EQ-WRKS-04', category: 'أدوات يدوية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_oxygen_jack', name: 'عفريت اوكسجين', barcode: 'EQ-WRKS-05', category: 'أدوات يدوية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_vacuum_ac', name: 'فاكيوم سبالت', barcode: 'EQ-WRKS-06', category: 'أدوات كهربائية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_torch', name: 'بريمز (شعلة فقط)', barcode: 'EQ-WRKS-07', category: 'أدوات يدوية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_gauge_ac', name: 'كيج سبالت', barcode: 'EQ-WRKS-08', category: 'أدوات قياس', location: 'ساحة الورشة', status: 'broken', quantity: 2, lastAuditDate: '2026-05-15', lastAuditStatus: 'broken', notes: 'عطل 1 وبحاجة استبدال' },
    { id: 'eq_grinder', name: 'كوسرة بروش', barcode: 'EQ-WRKS-09', category: 'أدوات كهربائية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_saw_wood_hand', name: 'منشار خشبي يدوي', barcode: 'EQ-WRKS-10', category: 'أدوات يدوية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_saw_metal_hand', name: 'منشار حديد يدوي', barcode: 'EQ-WRKS-11', category: 'أدوات يدوية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_router_hand', name: 'فريزة يدوية', barcode: 'EQ-WRKS-12', category: 'أدوات كهربائية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' },
    { id: 'eq_wood_clamp', name: 'كابسة خشب', barcode: 'EQ-WRKS-13', category: 'أدوات يدوية', location: 'ساحة الورشة', status: 'maintenance', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'maintenance', notes: 'بحاجة الى صيانة' },
    { id: 'eq_shear_metal', name: 'مقص حديد', barcode: 'EQ-WRKS-14', category: 'أدوات يدوية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'مستقر وسليم' },
    { id: 'eq_saw_electric', name: 'منشار كهربائي يدوي', barcode: 'EQ-WRKS-15', category: 'أدوات كهربائية', location: 'ساحة الورشة', status: 'operational', quantity: 1, lastAuditDate: '2026-05-15', lastAuditStatus: 'operational', notes: 'سليم' }
  ];
}

// --- moved from app.js (Phase 2): default operation packs seed (pure literals) ---
function defaultOpPacks() {
  return [
    {
      id: 'pack_acrylic_sign', name: 'إنتاج لافتة أكريليك مضيئة', icon: '💡',
      description: 'باقة إنتاج لوحة أكريلك مضيئة من الطلب حتى التسليم',
      steps: [
        { title: 'استلام الطلب وفتح ملف', sopRef: 'استلام الطلب', type: 'task' },
        { title: 'تسعير اللوحة', sopRef: 'تسعير', type: 'pricing' },
        { title: 'تصميم ومراجعة', sopRef: 'اعتماد التصميم', type: 'design' },
        { title: 'موافقة العميل', sopRef: '', type: 'approval' },
        { title: 'حجز أكريلك + LED + محول', sopRef: '', type: 'material' },
        { title: 'قص ليزر', sopRef: 'تشغيل ليزر', type: 'machine', machineRef: 'mach_laser_120' },
        { title: 'تجميع وتركيب LED', sopRef: '', type: 'assembly' },
        { title: 'فحص جودة', sopRef: 'فحص الجودة', type: 'qc' },
        { title: 'تغليف وتسليم', sopRef: '', type: 'delivery' },
        { title: 'تحديث الكلفة والربح', sopRef: '', type: 'finance' }
      ],
      materials: ['أكريلك', 'LED', 'محول كهرباء', 'لاصق'],
      machines: ['ليزر 120×90'],
      estimatedTime: '4-6 ساعات', estimatedCost: 45000,
      qcGates: ['فحص الحواف', 'فحص الإضاءة', 'فحص الأبعاد'],
      failPoints: ['تشقق الأكريلك', 'عدم تطابق الألوان', 'مشكلة كهربائية']
    },
    {
      id: 'pack_mdf_router', name: 'ديكور راوتر على MDF', icon: '🪵',
      description: 'باقة تشغيل راوتر CNC لقطع وتشكيل MDF',
      steps: [
        { title: 'مراجعة التصميم', sopRef: '', type: 'design' },
        { title: 'تأكيد سمك المادة', sopRef: '', type: 'material' },
        { title: 'تحضير مسار الأداة', sopRef: '', type: 'task' },
        { title: 'حجز راوتر CNC', sopRef: '', type: 'machine', machineRef: 'mach_cnc' },
        { title: 'اختيار بت القص', sopRef: '', type: 'task' },
        { title: 'تنفيذ القص', sopRef: '', type: 'machine', machineRef: 'mach_cnc' },
        { title: 'صنفرة', sopRef: '', type: 'task' },
        { title: 'دهان', sopRef: '', type: 'task' },
        { title: 'تجميع', sopRef: '', type: 'assembly' },
        { title: 'فحص الأبعاد', sopRef: '', type: 'qc' },
        { title: 'تغليف وتسليم', sopRef: '', type: 'delivery' }
      ],
      materials: ['MDF', 'طلاء سبراي', 'لاصق صناعي'],
      machines: ['CNC Router 125×250'],
      estimatedTime: '6-8 ساعات', estimatedCost: 35000,
      qcGates: ['فحص الأبعاد', 'فحص السطح', 'فحص التجميع'],
      failPoints: ['كسر القطعة', 'عدم دقة القص', 'تقشر الدهان']
    },
    {
      id: 'pack_3dprint', name: 'طباعة ثلاثية الأبعاد', icon: '🖨️',
      description: 'باقة طباعة ثلاثية الأبعاد كاملة',
      steps: [
        { title: 'مراجعة ملف STL', sopRef: '', type: 'design' },
        { title: 'تحضير التقطيع', sopRef: '', type: 'task' },
        { title: 'حجز الطابعة', sopRef: '', type: 'machine', machineRef: 'mach_3dprint' },
        { title: 'طباعة', sopRef: '', type: 'machine', machineRef: 'mach_3dprint' },
        { title: 'إزالة السبورت', sopRef: '', type: 'task' },
        { title: 'صنفرة وتشطيب', sopRef: '', type: 'task' },
        { title: 'فحص جودة', sopRef: '', type: 'qc' },
        { title: 'تسليم', sopRef: '', type: 'delivery' }
      ],
      materials: ['فيلامنت PLA/ABS'],
      machines: ['3D Printer'],
      estimatedTime: '8-24 ساعة', estimatedCost: 15000,
      qcGates: ['فحص الأبعاد', 'فحص المتانة'],
      failPoints: ['فشل الطبقات', 'انحراف الطباعة']
    },
    {
      id: 'pack_fiber', name: 'نقش ليزر ألياف ضوئية', icon: '⚡',
      description: 'باقة نقش بالليزر على المعادن',
      steps: [
        { title: 'تحضير الملف', sopRef: '', type: 'design' },
        { title: 'إعداد المعلمات', sopRef: '', type: 'task' },
        { title: 'حجز ماركر الألياف', sopRef: '', type: 'machine', machineRef: 'mach_fiber' },
        { title: 'تنفيذ النقش', sopRef: '', type: 'machine', machineRef: 'mach_fiber' },
        { title: 'فحص جودة', sopRef: '', type: 'qc' },
        { title: 'تسليم', sopRef: '', type: 'delivery' }
      ],
      materials: ['قطعة معدنية'],
      machines: ['Fiber Galvo Marker'],
      estimatedTime: '1-2 ساعة', estimatedCost: 8000,
      qcGates: ['وضوح النقش', 'عمق النقش'],
      failPoints: ['نقش باهت', 'إعدادات خاطئة']
    },
    {
      id: 'pack_print', name: 'طباعة عريضة', icon: '🎨',
      description: 'باقة طباعة عريضة على فينايل أو بانر',
      steps: [
        { title: 'تحضير ملف الطباعة', sopRef: '', type: 'design' },
        { title: 'اختيار المادة', sopRef: '', type: 'material' },
        { title: 'حجز الطابعة', sopRef: '', type: 'machine', machineRef: 'mach_printer' },
        { title: 'طباعة', sopRef: '', type: 'machine', machineRef: 'mach_printer' },
        { title: 'تقطيع / لمنيشن', sopRef: '', type: 'task' },
        { title: 'فحص الألوان', sopRef: '', type: 'qc' },
        { title: 'تسليم', sopRef: '', type: 'delivery' }
      ],
      materials: ['فينايل طباعة', 'حبر'],
      machines: ['Large Format Printer'],
      estimatedTime: '2-4 ساعات', estimatedCost: 20000,
      qcGates: ['دقة الألوان', 'جودة الطباعة'],
      failPoints: ['انسداد الرأس', 'ألوان باهتة']
    },
    {
      id: 'pack_maintenance', name: 'باقة الصيانة الدورية', icon: '🔧',
      description: 'باقة صيانة دورية للمكائن',
      steps: [
        { title: 'فحص أولي', sopRef: '', type: 'task' },
        { title: 'تنظيف العدسات/الرؤوس', sopRef: '', type: 'task' },
        { title: 'فحص الحركة والمحاور', sopRef: '', type: 'task' },
        { title: 'تشحيم', sopRef: '', type: 'task' },
        { title: 'اختبار تشغيل', sopRef: '', type: 'qc' },
        { title: 'تسجيل بالسجل', sopRef: '', type: 'finance' }
      ],
      materials: ['زيت تشحيم', 'قماش تنظيف'],
      machines: [],
      estimatedTime: '1-2 ساعة', estimatedCost: 5000,
      qcGates: ['اختبار التشغيل'],
      failPoints: ['قطع غيار غير متوفرة']
    },
    {
      id: 'pack_vinyl_wrap_car', name: 'تغليف سيارة بالفينايل', icon: '🚗',
      description: 'باقة تغليف سيارة كامل أو جزئي بالفينايل مع تركيب ميداني',
      steps: [
        { title: 'استلام السيارة وأخذ القياسات', type: 'task', estimatedMinutes: 30 },
        { title: 'مراجعة التصميم مع العميل', type: 'design', estimatedMinutes: 30 },
        { title: 'طباعة الفينايل', type: 'machine', estimatedMinutes: 90, machineRef: 'mach_printer' },
        { title: 'لمنيشن', type: 'task', estimatedMinutes: 30 },
        { title: 'غسل وتجفيف السيارة', type: 'task', estimatedMinutes: 60 },
        { title: 'تركيب الفينايل', type: 'task', estimatedMinutes: 240 },
        { title: 'تشطيب الزوايا والحواف', type: 'task', estimatedMinutes: 60 },
        { title: 'فحص جودة التركيب', type: 'qc', estimatedMinutes: 20 },
        { title: 'تسليم السيارة', type: 'delivery', estimatedMinutes: 15 }
      ],
      materials: ['فينايل تغليف', 'لمنيشن'],
      machines: ['Large Format Printer'],
      estimatedTime: '8-12 ساعة', estimatedCost: 120000,
      qcGates: ['نظافة التركيب', 'سلامة الحواف'],
      failPoints: ['فقاعات هواء', 'تقشير عند الحواف']
    }
  ];
}

// --- moved from app.js (Phase 2): default QC records seed (pure literals) ---
function defaultQcRecords() {
  return [
    {
      id: 'qc_rich_1',
      title: 'فحص قص وتشكيل الهيكل المعدني',
      type: 'laser',
      result: 'pass',
      status: 'pass',
      sourceType: 'kanban_card',
      sourceId: 'card_2',
      cardId: 'card_2',
      taskRef: 'card_2',
      sopId: 'sop_safety',
      machineId: 'mach_laser_120',
      department: 'قسم جودة المعادن',
      inspector: 'المهندس علي سلمان (رئيس وحدة الجودة)',
      inspectedAt: todayISO(),
      createdAt: todayISO(),
      updatedAt: todayISO(),
      batchNumber: 'B-2026-X01',
      batchSize: 50,
      sampleSize: 3,
      defectCount: 0,
      costImpact: 0,
      reworkCost: 0,
      laborCost: 0,
      materialCost: 0,
      machineCost: 0,
      estimatedReworkMinutes: 0,
      notes: 'تم فحص عينات عشوائية من خط القص ليزر. تطابق تام للأبعاد مع ملف الـ CAD وسماحية قياس لا تتعدى 0.1 ملم. الحواف مصقولة ونظيفة بالكامل. تم السماح بعبور القطعة للمرحلة التالية.',
      checklist: [
        { id: 'qci_r1_1', text: 'مطابقة الأبعاد مع ملف CAD الهندسي', required: true, passed: true, note: 'تطابق كامل بنسبة 100%' },
        { id: 'qci_r1_2', text: 'خلو الحواف المعدنية من النتوءات والحروق الزائدة', required: true, passed: true, note: 'تم الصقل والتنظيف' },
        { id: 'qci_r1_3', text: 'خلو القطع من الالتواءات أو تشوهات السطح', required: true, passed: true, note: 'مستقيمة تماماً' }
      ]
    },
    {
      id: 'qc_rich_2',
      title: 'فحص جودة الطلاء الحراري للألواح',
      type: 'finish',
      result: 'fail',
      status: 'rework_required',
      sourceType: 'kanban_card',
      sourceId: 'card_3',
      cardId: 'card_3',
      taskRef: 'card_3',
      sopId: 'sop_qc',
      machineId: '',
      department: 'قسم التشطيب والطلاء',
      inspector: 'الأستاذ عمر الفاروق (مفتش التشطيب النهائي)',
      inspectedAt: todayISO(),
      createdAt: todayISO(),
      updatedAt: todayISO(),
      batchNumber: 'B-2026-X02',
      batchSize: 20,
      sampleSize: 2,
      defectCount: 2,
      costImpact: 50000,
      reworkCost: 50000,
      laborCost: 15000,
      materialCost: 25000,
      machineCost: 10000,
      estimatedReworkMinutes: 180,
      notes: 'رصد تقشير خفيف وفقاعات هواء في الجهة الخلفية للوحين رقم 4 و7. الخلل يعود لعدم كفاية الصنفرة الأولية قبل الطلاء. تم حجب البطاقة تلقائياً وإنشاء أمر إعادة عمل (Rework) لإعادة الصنفرة والطلاء مجدداً بناء على SOP الجودة.',
      failureReason: 'وجود فقاعات هواء وتقشير خفيف في الطلاء الحراري نتيجة لضعف الصنفرة التمهيدية.',
      checklist: [
        { id: 'qci_r2_1', text: 'تطابق تدرج لون الطلاء مع العينة المعتمدة', required: true, passed: true, note: 'اللون متطابق' },
        { id: 'qci_r2_2', text: 'خلو السطح من فقاعات الهواء أو الرتوش السائلة', required: true, passed: false, note: 'رصد فقاعات هواء واضحة' },
        { id: 'qci_r2_3', text: 'مقاومة الخدش والتماسك التام للطبقة الحرارية', required: true, passed: false, note: 'تقشير خفيف عند الأطراف الحادة' }
      ]
    },
    {
      id: 'qc_rich_3',
      title: 'فحص تجميع وربط الأنظمة الكهربائية',
      type: 'router',
      result: 'pending',
      status: 'pending',
      sourceType: 'kanban_card',
      sourceId: 'card_1',
      cardId: 'card_1',
      taskRef: 'card_1',
      sopId: 'sop_qc',
      machineId: '',
      department: 'قسم التجميع الفني',
      inspector: 'المهندس ليث حيدر (مفتش البوابات الإنتاجية)',
      inspectedAt: '',
      createdAt: todayISO(),
      updatedAt: todayISO(),
      batchNumber: 'B-2026-X03',
      batchSize: 10,
      sampleSize: 1,
      defectCount: 0,
      costImpact: 0,
      reworkCost: 0,
      laborCost: 0,
      materialCost: 0,
      machineCost: 0,
      estimatedReworkMinutes: 0,
      notes: 'بانتظار انتهاء المهندسين الفنيين من تجميع لوحة التوزيع بالكامل والربط الكهربائي لإجراء فحص قياس الأمبيرية والمقاومة الأرضية وعمل محاكاة التشغيل الآمن قبل الإغلاق.',
      checklist: [
        { id: 'qci_r3_1', text: 'مراجعة خريطة التوصيل الكهربائي والمقاطع العرضية للأسلاك', required: true, passed: false, note: 'قيد الانتظار' },
        { id: 'qci_r3_2', text: 'إجراء فحص العزل والمقاومة الأرضية بأجهزة القياس', required: true, passed: false, note: 'قيد الانتظار' },
        { id: 'qci_r3_3', text: 'سلامة ترتيب وتثبيت الكابلات داخل الهيكل الداخلي', required: true, passed: false, note: 'قيد الانتظار' }
      ]
    }
  ];
}
