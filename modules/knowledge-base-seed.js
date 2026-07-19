/**
 * OCTAGON ERP — Knowledge Base & FAQ Seed Data (بيانات قاعدة المعرفة والأسئلة الشائعة)
 *
 * Programmatically generated complete bilingual knowledge layers.
 * Auto-loaded into window.OctagonKnowledgeSeed.
 */
(function () {
  'use strict';

  window.OctagonKnowledgeSeed = {
  "categories": [
    {
      "id": "system_basics",
      "name": {
        "ar": "أساسيات النظام",
        "en": "System Basics"
      },
      "icon": "fa-desktop",
      "color": "#6366f1"
    },
    {
      "id": "jarvis_ai",
      "name": {
        "ar": "ذكاء جارفيس والذكاء الاصطناعي",
        "en": "Jarvis AI & Intelligent Assistant"
      },
      "icon": "fa-brain",
      "color": "#8b5cf6"
    },
    {
      "id": "sales_crm",
      "name": {
        "ar": "المبيعات والعملاء CRM",
        "en": "Sales, Customers & CRM"
      },
      "icon": "fa-handshake",
      "color": "#10b981"
    },
    {
      "id": "inventory_wh",
      "name": {
        "ar": "المخازن وإدارة المستودعات",
        "en": "Inventory & Warehouse Control"
      },
      "icon": "fa-boxes-stacked",
      "color": "#f59e0b"
    },
    {
      "id": "finance_acct",
      "name": {
        "ar": "المالية والمحاسبة والقيود",
        "en": "Finance, Accounting & Ledgers"
      },
      "icon": "fa-wallet",
      "color": "#3b82f6"
    },
    {
      "id": "hr_payroll",
      "name": {
        "ar": "الموارد البشرية والرواتب والدوام",
        "en": "HR, Payroll & Attendance"
      },
      "icon": "fa-user-tie",
      "color": "#ec4899"
    },
    {
      "id": "workshop_prod",
      "name": {
        "ar": "الإنتاج والتشغيل والورشة",
        "en": "Production & Workshop Operations"
      },
      "icon": "fa-screwdriver-wrench",
      "color": "#ef4444"
    },
    {
      "id": "projects_contracts",
      "name": {
        "ar": "المشاريع وعقود العمل",
        "en": "Projects & Agreements"
      },
      "icon": "fa-file-signature",
      "color": "#14b8a6"
    },
    {
      "id": "fleet_fuel",
      "name": {
        "ar": "الأسطول وحوكمة الوقود",
        "en": "Fleet & Fuel Guard"
      },
      "icon": "fa-truck-monster",
      "color": "#06b6d4"
    },
    {
      "id": "messaging_connect",
      "name": {
        "ar": "الاتصالات والربط الخارجي",
        "en": "Communications & Integrations"
      },
      "icon": "fa-comments",
      "color": "#10b981"
    },
    {
      "id": "reports_analytics",
      "name": {
        "ar": "التقارير الذكية والتحليلات",
        "en": "Reports & Analytics Dashboard"
      },
      "icon": "fa-chart-pie",
      "color": "#8b5cf6"
    },
    {
      "id": "saas_marketplace",
      "name": {
        "ar": "خدمات السحاب وسوق التطبيقات",
        "en": "SaaS & App Marketplace"
      },
      "icon": "fa-cloud",
      "color": "#2563eb"
    },
    {
      "id": "admin_settings",
      "name": {
        "ar": "الإدارة والصلاحيات والأمان",
        "en": "Administration, Roles & Security"
      },
      "icon": "fa-shield-halved",
      "color": "#ef4444"
    },
    {
      "id": "retail_pos",
      "name": {
        "ar": "التجزئة ونقاط البيع POS",
        "en": "Retail Storefront & POS Services"
      },
      "icon": "fa-cart-shopping",
      "color": "#f59e0b"
    },
    {
      "id": "hospitality_hotel",
      "name": {
        "ar": "الضيافة والفنادق والمطاعم",
        "en": "Hospitality, Hotel & F&B Services"
      },
      "icon": "fa-hotel",
      "color": "#06b6d4"
    },
    {
      "id": "medical_clinic",
      "name": {
        "ar": "العيادات والصيدليات الطبية",
        "en": "Medical Clinic & Pharmacy Systems"
      },
      "icon": "fa-house-medical",
      "color": "#10b981"
    },
    {
      "id": "asset_maint",
      "name": {
        "ar": "إدارة الأصول والصيانة الوقائية",
        "en": "Assets & Preventive Maintenance"
      },
      "icon": "fa-gears",
      "color": "#6366f1"
    },
    {
      "id": "customer_support",
      "name": {
        "ar": "الدعم والتذاكر وخدمة العملاء",
        "en": "Customer Support & Ticketing Desk"
      },
      "icon": "fa-circle-question",
      "color": "#ec4899"
    },
    {
      "id": "data_governance",
      "name": {
        "ar": "حوكمة البيانات وجودة المدخلات",
        "en": "Data Governance & Quality Audit"
      },
      "icon": "fa-database",
      "color": "#14b8a6"
    },
    {
      "id": "diagnostics_tech",
      "name": {
        "ar": "التشخيص الفني وصحة المسارات",
        "en": "System Health & Technical Diagnostics"
      },
      "icon": "fa-bug",
      "color": "#3b82f6"
    }
  ],
  "pageGuides": [
    {
      "id": "pg_finance",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "finance",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "finance",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: الدفتر المالي",
        "en": "Page Manual: Financial Ledger"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة الدفتر المالي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Financial Ledger dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة الدفتر المالي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Financial Ledger view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر الدفتر المالي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Financial Ledger.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "finance"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_cashbox",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "cashbox",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "cashbox",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: صندوق النقدية",
        "en": "Page Manual: Cash Drawer"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة صندوق النقدية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Cash Drawer dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة صندوق النقدية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Cash Drawer view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر صندوق النقدية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Cash Drawer.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "cashbox"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_expenses",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "expenses",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "expenses",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل المصاريف",
        "en": "Page Manual: Expenses Register"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل المصاريف لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Expenses Register dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل المصاريف بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Expenses Register view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل المصاريف",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Expenses Register.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "expenses"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_income",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "income",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "income",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: الإيرادات والمقبوضات",
        "en": "Page Manual: Revenue & Receipts"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة الإيرادات والمقبوضات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Revenue & Receipts dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة الإيرادات والمقبوضات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Revenue & Receipts view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر الإيرادات والمقبوضات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Revenue & Receipts.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "income"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_customers",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "customers",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "customers",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: شؤون العملاء",
        "en": "Page Manual: Customers CRM"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة شؤون العملاء لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Customers CRM dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة شؤون العملاء بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Customers CRM view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر شؤون العملاء",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Customers CRM.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "customers"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_receipt",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "receipt",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "receipt",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إصدار المقبوضات",
        "en": "Page Manual: Sales Receipting"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إصدار المقبوضات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Sales Receipting dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إصدار المقبوضات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Sales Receipting view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إصدار المقبوضات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Sales Receipting.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "receipt"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_report",
      "type": "Page Guide",
      "categoryId": "reports_analytics",
      "pageKey": "report",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "report",
        "reports_analytics"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: التقارير العامة",
        "en": "Page Manual: General Reports"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة التقارير العامة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the General Reports dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة التقارير العامة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the General Reports view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر التقارير العامة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select General Reports.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "report"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_ar_ap",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "ar_ap",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "ar_ap",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: الذمم المدينة والدائنة",
        "en": "Page Manual: AR / AP Accounts"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة الذمم المدينة والدائنة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the AR / AP Accounts dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة الذمم المدينة والدائنة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the AR / AP Accounts view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر الذمم المدينة والدائنة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select AR / AP Accounts.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "ar_ap"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_banking",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "banking",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "banking",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: الربط والمطابقة البنكية",
        "en": "Page Manual: Bank Reconciliation"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة الربط والمطابقة البنكية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Bank Reconciliation dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة الربط والمطابقة البنكية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Bank Reconciliation view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر الربط والمطابقة البنكية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Bank Reconciliation.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "banking"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_budgeting",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "budgeting",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "budgeting",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: تخطيط الموازنات",
        "en": "Page Manual: Budget Planner"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة تخطيط الموازنات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Budget Planner dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة تخطيط الموازنات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Budget Planner view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر تخطيط الموازنات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Budget Planner.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "budgeting"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_tax_compliance",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "tax_compliance",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "tax_compliance",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: الامتثال الضريبي",
        "en": "Page Manual: Tax Compliance"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة الامتثال الضريبي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Tax Compliance dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة الامتثال الضريبي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Tax Compliance view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر الامتثال الضريبي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Tax Compliance.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "tax_compliance"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_import",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "import",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "import",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مركز استيراد البيانات",
        "en": "Page Manual: Data Import Hub"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مركز استيراد البيانات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Data Import Hub dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مركز استيراد البيانات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Data Import Hub view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مركز استيراد البيانات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Data Import Hub.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "import"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_timesheet",
      "type": "Page Guide",
      "categoryId": "hr_payroll",
      "pageKey": "timesheet",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "timesheet",
        "hr_payroll"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: جداول الحضور والدوام",
        "en": "Page Manual: Employee Timesheets"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة جداول الحضور والدوام لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Employee Timesheets dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة جداول الحضور والدوام بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Employee Timesheets view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر جداول الحضور والدوام",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Employee Timesheets.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "timesheet"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_calendar",
      "type": "Page Guide",
      "categoryId": "system_basics",
      "pageKey": "calendar",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "calendar",
        "system_basics"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: تقويم العمليات",
        "en": "Page Manual: Operations Calendar"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة تقويم العمليات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Operations Calendar dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة تقويم العمليات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Operations Calendar view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر تقويم العمليات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Operations Calendar.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "calendar"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_employees",
      "type": "Page Guide",
      "categoryId": "hr_payroll",
      "pageKey": "employees",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "employees",
        "hr_payroll"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: دليل الموظفين",
        "en": "Page Manual: Employee Directory"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة دليل الموظفين لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Employee Directory dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة دليل الموظفين بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Employee Directory view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر دليل الموظفين",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Employee Directory.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "employees"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_people_ops",
      "type": "Page Guide",
      "categoryId": "hr_payroll",
      "pageKey": "people_ops",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "people_ops",
        "hr_payroll"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إدارة الموارد البشرية",
        "en": "Page Manual: People Operations"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إدارة الموارد البشرية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the People Operations dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إدارة الموارد البشرية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the People Operations view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إدارة الموارد البشرية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select People Operations.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "people_ops"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_employee_ui",
      "type": "Page Guide",
      "categoryId": "hr_payroll",
      "pageKey": "employee_ui",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "employee_ui",
        "hr_payroll"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: بوابة الموظف الذاتية",
        "en": "Page Manual: Self-Service Portal"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة بوابة الموظف الذاتية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Self-Service Portal dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة بوابة الموظف الذاتية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Self-Service Portal view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر بوابة الموظف الذاتية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Self-Service Portal.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "employee_ui"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_employee_mobile",
      "type": "Page Guide",
      "categoryId": "hr_payroll",
      "pageKey": "employee_mobile",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "employee_mobile",
        "hr_payroll"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: حضور الهاتف المحمول",
        "en": "Page Manual: Mobile Attendance"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة حضور الهاتف المحمول لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Mobile Attendance dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة حضور الهاتف المحمول بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Mobile Attendance view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر حضور الهاتف المحمول",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Mobile Attendance.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "employee_mobile"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_command_center",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "command_center",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "command_center",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: غرفة العمليات والموافقات",
        "en": "Page Manual: Command Center"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة غرفة العمليات والموافقات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Command Center dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة غرفة العمليات والموافقات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Command Center view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر غرفة العمليات والموافقات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Command Center.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "command_center"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_analytics",
      "type": "Page Guide",
      "categoryId": "reports_analytics",
      "pageKey": "analytics",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "analytics",
        "reports_analytics"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: التحليلات التنفيذية",
        "en": "Page Manual: Executive Analytics"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة التحليلات التنفيذية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Executive Analytics dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة التحليلات التنفيذية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Executive Analytics view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر التحليلات التنفيذية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Executive Analytics.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "analytics"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_nl_reports",
      "type": "Page Guide",
      "categoryId": "reports_analytics",
      "pageKey": "nl_reports",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "nl_reports",
        "reports_analytics"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: تقارير العرض الذكي",
        "en": "Page Manual: Smart View Reports"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة تقارير العرض الذكي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Smart View Reports dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة تقارير العرض الذكي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Smart View Reports view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر تقارير العرض الذكي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Smart View Reports.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "nl_reports"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_intelligence",
      "type": "Page Guide",
      "categoryId": "jarvis_ai",
      "pageKey": "intelligence",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "intelligence",
        "jarvis_ai"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: لوحة تحكم الذكاء الاصطناعي",
        "en": "Page Manual: AI Control Dashboard"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة لوحة تحكم الذكاء الاصطناعي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the AI Control Dashboard dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة لوحة تحكم الذكاء الاصطناعي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the AI Control Dashboard view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر لوحة تحكم الذكاء الاصطناعي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select AI Control Dashboard.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "intelligence"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_automation",
      "type": "Page Guide",
      "categoryId": "saas_marketplace",
      "pageKey": "automation",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "automation",
        "saas_marketplace"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: قواعد أتمتة سير العمل",
        "en": "Page Manual: Workflow Rules"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة قواعد أتمتة سير العمل لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Workflow Rules dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة قواعد أتمتة سير العمل بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Workflow Rules view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر قواعد أتمتة سير العمل",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Workflow Rules.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "automation"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_whatsapp",
      "type": "Page Guide",
      "categoryId": "messaging_connect",
      "pageKey": "whatsapp",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "whatsapp",
        "messaging_connect"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: بوابة واتساب للرسائل",
        "en": "Page Manual: WhatsApp Gateway"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة بوابة واتساب للرسائل لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the WhatsApp Gateway dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة بوابة واتساب للرسائل بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the WhatsApp Gateway view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر بوابة واتساب للرسائل",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select WhatsApp Gateway.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "whatsapp"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_telegram",
      "type": "Page Guide",
      "categoryId": "messaging_connect",
      "pageKey": "telegram",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "telegram",
        "messaging_connect"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: ربط تليغرام التفاعلي",
        "en": "Page Manual: Telegram Integration"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة ربط تليغرام التفاعلي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Telegram Integration dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة ربط تليغرام التفاعلي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Telegram Integration view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر ربط تليغرام التفاعلي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Telegram Integration.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "telegram"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_ai_queue",
      "type": "Page Guide",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_queue",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "ai_queue",
        "jarvis_ai"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: طابور مهام الذكاء",
        "en": "Page Manual: AI Task Queue"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة طابور مهام الذكاء لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the AI Task Queue dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة طابور مهام الذكاء بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the AI Task Queue view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر طابور مهام الذكاء",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select AI Task Queue.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "ai_queue"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_ai_factory",
      "type": "Page Guide",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_factory",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "ai_factory",
        "jarvis_ai"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مصنع محتوى الذكاء",
        "en": "Page Manual: AI Content Factory"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مصنع محتوى الذكاء لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the AI Content Factory dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مصنع محتوى الذكاء بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the AI Content Factory view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مصنع محتوى الذكاء",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select AI Content Factory.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "ai_factory"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_ai_tools",
      "type": "Page Guide",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_tools",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "ai_tools",
        "jarvis_ai"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل أدوات الذكاء",
        "en": "Page Manual: AI Action Registry"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل أدوات الذكاء لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the AI Action Registry dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل أدوات الذكاء بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the AI Action Registry view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل أدوات الذكاء",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select AI Action Registry.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "ai_tools"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_ai_status",
      "type": "Page Guide",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_status",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "ai_status",
        "jarvis_ai"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: حالة صحة جارفيس",
        "en": "Page Manual: Jarvis Health Status"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة حالة صحة جارفيس لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Jarvis Health Status dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة حالة صحة جارفيس بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Jarvis Health Status view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر حالة صحة جارفيس",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Jarvis Health Status.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "ai_status"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_deploy_ready",
      "type": "Page Guide",
      "categoryId": "diagnostics_tech",
      "pageKey": "deploy_ready",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "deploy_ready",
        "diagnostics_tech"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: فحص جاهزية النشر",
        "en": "Page Manual: Deployment Checker"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة فحص جاهزية النشر لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Deployment Checker dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة فحص جاهزية النشر بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Deployment Checker view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر فحص جاهزية النشر",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Deployment Checker.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "deploy_ready"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_admin_panel",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "admin_panel",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "admin_panel",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: لوحة تحكم المدير",
        "en": "Page Manual: Admin Control Panel"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة لوحة تحكم المدير لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Admin Control Panel dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة لوحة تحكم المدير بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Admin Control Panel view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر لوحة تحكم المدير",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Admin Control Panel.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "admin_panel"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_settings",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "settings",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "settings",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إعدادات النظام العامة",
        "en": "Page Manual: System Configuration"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إعدادات النظام العامة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the System Configuration dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إعدادات النظام العامة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the System Configuration view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إعدادات النظام العامة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select System Configuration.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "settings"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_multi_entity",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "multi_entity",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "multi_entity",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إدارة الشركات المتعددة",
        "en": "Page Manual: Multi-Company Hub"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إدارة الشركات المتعددة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Multi-Company Hub dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إدارة الشركات المتعددة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Multi-Company Hub view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إدارة الشركات المتعددة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Multi-Company Hub.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "multi_entity"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_integration_hub",
      "type": "Page Guide",
      "categoryId": "saas_marketplace",
      "pageKey": "integration_hub",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "integration_hub",
        "saas_marketplace"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مركز تكامل البرمجيات",
        "en": "Page Manual: API Integration Hub"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مركز تكامل البرمجيات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the API Integration Hub dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مركز تكامل البرمجيات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the API Integration Hub view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مركز تكامل البرمجيات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select API Integration Hub.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "integration_hub"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_security_center",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "security_center",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "security_center",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مركز الحماية والأمان",
        "en": "Page Manual: Security Settings"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مركز الحماية والأمان لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Security Settings dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مركز الحماية والأمان بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Security Settings view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مركز الحماية والأمان",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Security Settings.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "security_center"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_data_quality",
      "type": "Page Guide",
      "categoryId": "data_governance",
      "pageKey": "data_quality",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "data_quality",
        "data_governance"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: تدقيق جودة البيانات",
        "en": "Page Manual: Data Quality Audit"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة تدقيق جودة البيانات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Data Quality Audit dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة تدقيق جودة البيانات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Data Quality Audit view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر تدقيق جودة البيانات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Data Quality Audit.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "data_quality"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_route_health",
      "type": "Page Guide",
      "categoryId": "diagnostics_tech",
      "pageKey": "route_health",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "route_health",
        "diagnostics_tech"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مستشار سلامة المسارات",
        "en": "Page Manual: Route Integrity Auditor"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مستشار سلامة المسارات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Route Integrity Auditor dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مستشار سلامة المسارات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Route Integrity Auditor view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مستشار سلامة المسارات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Route Integrity Auditor.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "route_health"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_scenario_planner",
      "type": "Page Guide",
      "categoryId": "reports_analytics",
      "pageKey": "scenario_planner",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "scenario_planner",
        "reports_analytics"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مخطط سيناريوهات المستقبل",
        "en": "Page Manual: Scenario Forecasting"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مخطط سيناريوهات المستقبل لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Scenario Forecasting dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مخطط سيناريوهات المستقبل بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Scenario Forecasting view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مخطط سيناريوهات المستقبل",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Scenario Forecasting.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "scenario_planner"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_device_center",
      "type": "Page Guide",
      "categoryId": "saas_marketplace",
      "pageKey": "device_center",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "device_center",
        "saas_marketplace"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مركز ربط الأجهزة والـ IoT",
        "en": "Page Manual: Device Integration"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مركز ربط الأجهزة والـ IoT لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Device Integration dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مركز ربط الأجهزة والـ IoT بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Device Integration view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مركز ربط الأجهزة والـ IoT",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Device Integration.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "device_center"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_training_lms",
      "type": "Page Guide",
      "categoryId": "hr_payroll",
      "pageKey": "training_lms",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "training_lms",
        "hr_payroll"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: منصة تدريب الموظفين",
        "en": "Page Manual: Staff LMS Training"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة منصة تدريب الموظفين لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Staff LMS Training dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة منصة تدريب الموظفين بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Staff LMS Training view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر منصة تدريب الموظفين",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Staff LMS Training.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "training_lms"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_risk_compliance",
      "type": "Page Guide",
      "categoryId": "data_governance",
      "pageKey": "risk_compliance",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "risk_compliance",
        "data_governance"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: المخاطر والامتثال التنظيمي",
        "en": "Page Manual: Risk & Compliance"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة المخاطر والامتثال التنظيمي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Risk & Compliance dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة المخاطر والامتثال التنظيمي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Risk & Compliance view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر المخاطر والامتثال التنظيمي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Risk & Compliance.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "risk_compliance"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_procurement",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "procurement",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "procurement",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: تخطيط المشتريات والتوريد",
        "en": "Page Manual: Procurement Planner"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة تخطيط المشتريات والتوريد لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Procurement Planner dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة تخطيط المشتريات والتوريد بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Procurement Planner view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر تخطيط المشتريات والتوريد",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Procurement Planner.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "procurement"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_supplier_portal",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "supplier_portal",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "supplier_portal",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: بوابة الموردين",
        "en": "Page Manual: Supplier Workspace"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة بوابة الموردين لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Supplier Workspace dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة بوابة الموردين بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Supplier Workspace view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر بوابة الموردين",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Supplier Workspace.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "supplier_portal"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_approvals",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "approvals",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "approvals",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إدارة الموافقات والاعتمادات",
        "en": "Page Manual: Approval Workflow Manager"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إدارة الموافقات والاعتمادات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Approval Workflow Manager dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إدارة الموافقات والاعتمادات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Approval Workflow Manager view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إدارة الموافقات والاعتمادات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Approval Workflow Manager.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "approvals"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_customer_portal",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "customer_portal",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "customer_portal",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: بوابة العملاء الذاتية",
        "en": "Page Manual: Client Workspace Portal"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة بوابة العملاء الذاتية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Client Workspace Portal dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة بوابة العملاء الذاتية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Client Workspace Portal view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر بوابة العملاء الذاتية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Client Workspace Portal.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "customer_portal"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_calculator",
      "type": "Page Guide",
      "categoryId": "hr_payroll",
      "pageKey": "calculator",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "calculator",
        "hr_payroll"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: حاسبة مستحقات الدوام",
        "en": "Page Manual: Attendance Cost Calculator"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة حاسبة مستحقات الدوام لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Attendance Cost Calculator dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة حاسبة مستحقات الدوام بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Attendance Cost Calculator view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر حاسبة مستحقات الدوام",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Attendance Cost Calculator.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "calculator"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_inventory",
      "type": "Page Guide",
      "categoryId": "inventory_wh",
      "pageKey": "inventory",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "inventory",
        "inventory_wh"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إدارة المخزون والمستودعات",
        "en": "Page Manual: Inventory Control"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إدارة المخزون والمستودعات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Inventory Control dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إدارة المخزون والمستودعات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Inventory Control view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إدارة المخزون والمستودعات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Inventory Control.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "inventory"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_sales",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "sales",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "sales",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: طلبات المبيعات ونقاط البيع",
        "en": "Page Manual: Sales & POS Orders"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة طلبات المبيعات ونقاط البيع لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Sales & POS Orders dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة طلبات المبيعات ونقاط البيع بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Sales & POS Orders view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر طلبات المبيعات ونقاط البيع",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Sales & POS Orders.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "sales"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_machines",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "machines",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "machines",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل المكائن والـ CNC",
        "en": "Page Manual: CNC Machine Registry"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل المكائن والـ CNC لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the CNC Machine Registry dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل المكائن والـ CNC بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the CNC Machine Registry view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل المكائن والـ CNC",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select CNC Machine Registry.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "machines"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_equipment",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "equipment",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "equipment",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل العُدد والأدوات",
        "en": "Page Manual: Tool & Equipment Register"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل العُدد والأدوات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Tool & Equipment Register dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل العُدد والأدوات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Tool & Equipment Register view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل العُدد والأدوات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Tool & Equipment Register.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "equipment"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_op_packs",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "op_packs",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "op_packs",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: حزم العمليات الفنية",
        "en": "Page Manual: Operational Packs"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة حزم العمليات الفنية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Operational Packs dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة حزم العمليات الفنية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Operational Packs view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر حزم العمليات الفنية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Operational Packs.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "op_packs"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_qc_center",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "qc_center",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "qc_center",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مركز فحص الجودة والسلامة",
        "en": "Page Manual: Quality Control Hub"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مركز فحص الجودة والسلامة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Quality Control Hub dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مركز فحص الجودة والسلامة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Quality Control Hub view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مركز فحص الجودة والسلامة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Quality Control Hub.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "qc_center"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_sop",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "sop",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "sop",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مكتب فحص أدلة التشغيل",
        "en": "Page Manual: SOP Verification Desk"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مكتب فحص أدلة التشغيل لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the SOP Verification Desk dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مكتب فحص أدلة التشغيل بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the SOP Verification Desk view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مكتب فحص أدلة التشغيل",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select SOP Verification Desk.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "sop"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_workflow",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "workflow",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "workflow",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مراحل الإنتاج المرئي",
        "en": "Page Manual: Visual Production Stages"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مراحل الإنتاج المرئي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Visual Production Stages dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مراحل الإنتاج المرئي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Visual Production Stages view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مراحل الإنتاج المرئي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Visual Production Stages.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "workflow"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_kanban",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "kanban",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "kanban",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: لوحة كانبان الإنتاج",
        "en": "Page Manual: Production Kanban"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة لوحة كانبان الإنتاج لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Production Kanban dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة لوحة كانبان الإنتاج بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Production Kanban view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر لوحة كانبان الإنتاج",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Production Kanban.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "kanban"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_task_manager",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "task_manager",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "task_manager",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: موزع مهام الورشة",
        "en": "Page Manual: Workshop Task Dispatcher"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة موزع مهام الورشة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Workshop Task Dispatcher dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة موزع مهام الورشة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Workshop Task Dispatcher view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر موزع مهام الورشة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Workshop Task Dispatcher.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "task_manager"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_mrp",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "mrp",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "mrp",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: تخطيط الإنتاج والمواد MRP",
        "en": "Page Manual: Production MRP"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة تخطيط الإنتاج والمواد MRP لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Production MRP dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة تخطيط الإنتاج والمواد MRP بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Production MRP view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر تخطيط الإنتاج والمواد MRP",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Production MRP.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "mrp"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_work_orders",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "work_orders",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "work_orders",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل أوامر التشغيل",
        "en": "Page Manual: Work Orders Registry"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل أوامر التشغيل لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Work Orders Registry dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل أوامر التشغيل بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Work Orders Registry view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل أوامر التشغيل",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Work Orders Registry.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "work_orders"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_wfl_home",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "wfl_home",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "wfl_home",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: بوابة الخطوط الأمامية للورشة",
        "en": "Page Manual: Workshop Portal Home"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة بوابة الخطوط الأمامية للورشة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Workshop Portal Home dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة بوابة الخطوط الأمامية للورشة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Workshop Portal Home view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر بوابة الخطوط الأمامية للورشة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Workshop Portal Home.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "wfl_home"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_workshop_tv",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "workshop_tv",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "workshop_tv",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: شاشة عرض الإنتاج الكبيرة",
        "en": "Page Manual: Production Display TV"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة شاشة عرض الإنتاج الكبيرة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Production Display TV dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة شاشة عرض الإنتاج الكبيرة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Production Display TV view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر شاشة عرض الإنتاج الكبيرة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Production Display TV.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "workshop_tv"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_kiosk",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "kiosk",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "kiosk",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: محطة الخدمة الذاتية (كيوسك)",
        "en": "Page Manual: Kiosk Check-in Station"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة محطة الخدمة الذاتية (كيوسك) لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Kiosk Check-in Station dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة محطة الخدمة الذاتية (كيوسك) بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Kiosk Check-in Station view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر محطة الخدمة الذاتية (كيوسك)",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Kiosk Check-in Station.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "kiosk"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_pos",
      "type": "Page Guide",
      "categoryId": "retail_pos",
      "pageKey": "pos",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "pos",
        "retail_pos"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: كاونتر نقاط البيع",
        "en": "Page Manual: Point of Sale Checkout"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة كاونتر نقاط البيع لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Point of Sale Checkout dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة كاونتر نقاط البيع بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Point of Sale Checkout view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر كاونتر نقاط البيع",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Point of Sale Checkout.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "pos"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_sales_price_lists",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "sales_price_lists",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "sales_price_lists",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: قوائم أسعار المبيعات",
        "en": "Page Manual: Sales Price Lists"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة قوائم أسعار المبيعات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Sales Price Lists dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة قوائم أسعار المبيعات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Sales Price Lists view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر قوائم أسعار المبيعات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Sales Price Lists.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "sales_price_lists"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_sales_commission",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "sales_commission",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "sales_commission",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: عمولات ومكافآت المبيعات",
        "en": "Page Manual: Sales Commissions"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة عمولات ومكافآت المبيعات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Sales Commissions dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة عمولات ومكافآت المبيعات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Sales Commissions view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر عمولات ومكافآت المبيعات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Sales Commissions.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "sales_commission"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_sales_contracts",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "sales_contracts",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "sales_contracts",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: اتفاقيات وعقود المبيعات",
        "en": "Page Manual: Sales Agreements"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة اتفاقيات وعقود المبيعات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Sales Agreements dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة اتفاقيات وعقود المبيعات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Sales Agreements view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر اتفاقيات وعقود المبيعات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Sales Agreements.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "sales_contracts"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_finance_installments",
      "type": "Page Guide",
      "categoryId": "finance_acct",
      "pageKey": "finance_installments",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "finance_installments",
        "finance_acct"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: متابعة الأقساط والتمويل",
        "en": "Page Manual: Installments Tracker"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة متابعة الأقساط والتمويل لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Installments Tracker dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة متابعة الأقساط والتمويل بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Installments Tracker view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر متابعة الأقساط والتمويل",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Installments Tracker.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "finance_installments"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_pos_deepening",
      "type": "Page Guide",
      "categoryId": "retail_pos",
      "pageKey": "pos_deepening",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "pos_deepening",
        "retail_pos"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: خيارات نقاط البيع المتقدمة",
        "en": "Page Manual: POS Deepening Options"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة خيارات نقاط البيع المتقدمة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the POS Deepening Options dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة خيارات نقاط البيع المتقدمة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the POS Deepening Options view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر خيارات نقاط البيع المتقدمة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select POS Deepening Options.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "pos_deepening"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_omni_communications",
      "type": "Page Guide",
      "categoryId": "messaging_connect",
      "pageKey": "omni_communications",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "omni_communications",
        "messaging_connect"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مركز اتصالات أومني الموحد",
        "en": "Page Manual: Communications Center"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مركز اتصالات أومني الموحد لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Communications Center dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مركز اتصالات أومني الموحد بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Communications Center view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مركز اتصالات أومني الموحد",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Communications Center.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "omni_communications"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_pharmacy",
      "type": "Page Guide",
      "categoryId": "medical_clinic",
      "pageKey": "pharmacy",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "pharmacy",
        "medical_clinic"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: نظام إدارة الصيدلية",
        "en": "Page Manual: Pharmacy Module"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة نظام إدارة الصيدلية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Pharmacy Module dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة نظام إدارة الصيدلية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Pharmacy Module view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر نظام إدارة الصيدلية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Pharmacy Module.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "pharmacy"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_retail",
      "type": "Page Guide",
      "categoryId": "retail_pos",
      "pageKey": "retail",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "retail",
        "retail_pos"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إدارة البيع بالتجزئة والهايبر",
        "en": "Page Manual: Retail Superstore"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إدارة البيع بالتجزئة والهايبر لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Retail Superstore dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إدارة البيع بالتجزئة والهايبر بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Retail Superstore view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إدارة البيع بالتجزئة والهايبر",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Retail Superstore.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "retail"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_clinic",
      "type": "Page Guide",
      "categoryId": "medical_clinic",
      "pageKey": "clinic",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "clinic",
        "medical_clinic"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إدارة العيادات والمرضى",
        "en": "Page Manual: Clinic Management"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إدارة العيادات والمرضى لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Clinic Management dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إدارة العيادات والمرضى بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Clinic Management view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إدارة العيادات والمرضى",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Clinic Management.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "clinic"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_restaurant",
      "type": "Page Guide",
      "categoryId": "hospitality_hotel",
      "pageKey": "restaurant",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "restaurant",
        "hospitality_hotel"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: خارطة طاولات المطعم والطلب",
        "en": "Page Manual: Restaurant Table Map"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة خارطة طاولات المطعم والطلب لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Restaurant Table Map dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة خارطة طاولات المطعم والطلب بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Restaurant Table Map view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر خارطة طاولات المطعم والطلب",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Restaurant Table Map.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "restaurant"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_hotel",
      "type": "Page Guide",
      "categoryId": "hospitality_hotel",
      "pageKey": "hotel",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "hotel",
        "hospitality_hotel"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: لوحة الغرف وحجوزات الفندق",
        "en": "Page Manual: Hotel Room Dashboard"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة لوحة الغرف وحجوزات الفندق لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Hotel Room Dashboard dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة لوحة الغرف وحجوزات الفندق بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Hotel Room Dashboard view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر لوحة الغرف وحجوزات الفندق",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Hotel Room Dashboard.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "hotel"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_assets",
      "type": "Page Guide",
      "categoryId": "asset_maint",
      "pageKey": "assets",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "assets",
        "asset_maint"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل الأصول الثابتة والاستهلاك",
        "en": "Page Manual: Fixed Asset Ledger"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل الأصول الثابتة والاستهلاك لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Fixed Asset Ledger dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل الأصول الثابتة والاستهلاك بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Fixed Asset Ledger view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل الأصول الثابتة والاستهلاك",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Fixed Asset Ledger.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "assets"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_subscriptions",
      "type": "Page Guide",
      "categoryId": "saas_marketplace",
      "pageKey": "subscriptions",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "subscriptions",
        "saas_marketplace"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: الاشتراكات المفلترة والفواتير",
        "en": "Page Manual: Billing Subscriptions"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة الاشتراكات المفلترة والفواتير لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Billing Subscriptions dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة الاشتراكات المفلترة والفواتير بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Billing Subscriptions view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر الاشتراكات المفلترة والفواتير",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Billing Subscriptions.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "subscriptions"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_appointments",
      "type": "Page Guide",
      "categoryId": "customer_support",
      "pageKey": "appointments",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "appointments",
        "customer_support"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: جدولة الموارد والمواعيد",
        "en": "Page Manual: Resource Scheduler"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة جدولة الموارد والمواعيد لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Resource Scheduler dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة جدولة الموارد والمواعيد بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Resource Scheduler view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر جدولة الموارد والمواعيد",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Resource Scheduler.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "appointments"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_loyalty",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "loyalty",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "loyalty",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: نقاط الولاء ومكافآت الزبائن",
        "en": "Page Manual: Loyalty Card Rewards"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة نقاط الولاء ومكافآت الزبائن لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Loyalty Card Rewards dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة نقاط الولاء ومكافآت الزبائن بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Loyalty Card Rewards view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر نقاط الولاء ومكافآت الزبائن",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Loyalty Card Rewards.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "loyalty"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_events",
      "type": "Page Guide",
      "categoryId": "customer_support",
      "pageKey": "events",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "events",
        "customer_support"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: منظم الفعاليات والمناسبات",
        "en": "Page Manual: Event Manager Planner"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة منظم الفعاليات والمناسبات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Event Manager Planner dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة منظم الفعاليات والمناسبات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Event Manager Planner view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر منظم الفعاليات والمناسبات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Event Manager Planner.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "events"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_helpdesk",
      "type": "Page Guide",
      "categoryId": "customer_support",
      "pageKey": "helpdesk",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "helpdesk",
        "customer_support"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مكتب تذاكر الدعم الفني",
        "en": "Page Manual: Support Ticket Desk"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مكتب تذاكر الدعم الفني لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Support Ticket Desk dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مكتب تذاكر الدعم الفني بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Support Ticket Desk view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مكتب تذاكر الدعم الفني",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Support Ticket Desk.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "helpdesk"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_fleet",
      "type": "Page Guide",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "fleet",
        "fleet_fuel"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: غرفة التحكم بالأسطول والسيارات",
        "en": "Page Manual: Fleet Control Command"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة غرفة التحكم بالأسطول والسيارات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Fleet Control Command dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة غرفة التحكم بالأسطول والسيارات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Fleet Control Command view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر غرفة التحكم بالأسطول والسيارات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Fleet Control Command.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "fleet"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_documents",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "documents",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "documents",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مكتبة المستندات والعقود القانونية",
        "en": "Page Manual: Legal Document Library"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مكتبة المستندات والعقود القانونية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Legal Document Library dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مكتبة المستندات والعقود القانونية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Legal Document Library view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مكتبة المستندات والعقود القانونية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Legal Document Library.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "documents"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_esign",
      "type": "Page Guide",
      "categoryId": "admin_settings",
      "pageKey": "esign",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "esign",
        "admin_settings"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: منصة التوقيع الإلكتروني للمستندات",
        "en": "Page Manual: E-Sign Document Desk"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة منصة التوقيع الإلكتروني للمستندات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the E-Sign Document Desk dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة منصة التوقيع الإلكتروني للمستندات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the E-Sign Document Desk view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر منصة التوقيع الإلكتروني للمستندات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select E-Sign Document Desk.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "esign"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_knowledge",
      "type": "Page Guide",
      "categoryId": "data_governance",
      "pageKey": "knowledge",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "knowledge",
        "data_governance"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: توثيق الويكي الداخلي للموظفين",
        "en": "Page Manual: Wiki SOP Documentation"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة توثيق الويكي الداخلي للموظفين لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Wiki SOP Documentation dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة توثيق الويكي الداخلي للموظفين بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Wiki SOP Documentation view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر توثيق الويكي الداخلي للموظفين",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Wiki SOP Documentation.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "knowledge"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_knowledge_base",
      "type": "Page Guide",
      "categoryId": "data_governance",
      "pageKey": "knowledge_base",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "knowledge_base",
        "data_governance"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: قاعدة المعرفة والأسئلة الفنية",
        "en": "Page Manual: Technical Knowledge Base"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة قاعدة المعرفة والأسئلة الفنية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Technical Knowledge Base dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة قاعدة المعرفة والأسئلة الفنية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Technical Knowledge Base view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر قاعدة المعرفة والأسئلة الفنية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Technical Knowledge Base.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "knowledge_base"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_surveys",
      "type": "Page Guide",
      "categoryId": "customer_support",
      "pageKey": "surveys",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "surveys",
        "customer_support"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مكتب استطلاعات الرأي والتقييمات",
        "en": "Page Manual: Survey Feedback Desk"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مكتب استطلاعات الرأي والتقييمات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Survey Feedback Desk dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مكتب استطلاعات الرأي والتقييمات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Survey Feedback Desk view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مكتب استطلاعات الرأي والتقييمات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Survey Feedback Desk.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "surveys"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_visitors",
      "type": "Page Guide",
      "categoryId": "customer_support",
      "pageKey": "visitors",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "visitors",
        "customer_support"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل زوار الموقع والمعامل",
        "en": "Page Manual: Visitor Logbook"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل زوار الموقع والمعامل لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Visitor Logbook dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل زوار الموقع والمعامل بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Visitor Logbook view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل زوار الموقع والمعامل",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Visitor Logbook.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "visitors"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_marketing",
      "type": "Page Guide",
      "categoryId": "sales_crm",
      "pageKey": "marketing",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "marketing",
        "sales_crm"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مخطط الحملات التسويقية",
        "en": "Page Manual: Campaign Marketing Planner"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مخطط الحملات التسويقية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Campaign Marketing Planner dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مخطط الحملات التسويقية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Campaign Marketing Planner view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مخطط الحملات التسويقية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Campaign Marketing Planner.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "marketing"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_projects",
      "type": "Page Guide",
      "categoryId": "projects_contracts",
      "pageKey": "projects",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "projects",
        "projects_contracts"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مخطط وإدارة مشاريع العملاء",
        "en": "Page Manual: Project Hub Planner"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مخطط وإدارة مشاريع العملاء لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Project Hub Planner dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مخطط وإدارة مشاريع العملاء بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Project Hub Planner view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مخطط وإدارة مشاريع العملاء",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Project Hub Planner.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "projects"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_field_service",
      "type": "Page Guide",
      "categoryId": "customer_support",
      "pageKey": "field_service",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "field_service",
        "customer_support"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: توزيع مهام الصيانة الميدانية",
        "en": "Page Manual: Field Service Dispatcher"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة توزيع مهام الصيانة الميدانية لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Field Service Dispatcher dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة توزيع مهام الصيانة الميدانية بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Field Service Dispatcher view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر توزيع مهام الصيانة الميدانية",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Field Service Dispatcher.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "field_service"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_rental",
      "type": "Page Guide",
      "categoryId": "projects_contracts",
      "pageKey": "rental",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "rental",
        "projects_contracts"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: إدارة تأجير المعدات والآليات",
        "en": "Page Manual: Rental Asset Manager"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة إدارة تأجير المعدات والآليات لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Rental Asset Manager dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة إدارة تأجير المعدات والآليات بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Rental Asset Manager view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر إدارة تأجير المعدات والآليات",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Rental Asset Manager.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "rental"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_warranty",
      "type": "Page Guide",
      "categoryId": "customer_support",
      "pageKey": "warranty",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "warranty",
        "customer_support"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: سجل الضمانات والإرجاع RMA",
        "en": "Page Manual: Warranty & RMA Registry"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة سجل الضمانات والإرجاع RMA لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Warranty & RMA Registry dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة سجل الضمانات والإرجاع RMA بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Warranty & RMA Registry view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر سجل الضمانات والإرجاع RMA",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Warranty & RMA Registry.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "warranty"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_workshop_ledger",
      "type": "Page Guide",
      "categoryId": "workshop_prod",
      "pageKey": "workshop_ledger",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "workshop_ledger",
        "workshop_prod"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: دفتر حسابات عمليات الورشة",
        "en": "Page Manual: Workshop Accounting Ledger"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة دفتر حسابات عمليات الورشة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Workshop Accounting Ledger dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة دفتر حسابات عمليات الورشة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Workshop Accounting Ledger view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر دفتر حسابات عمليات الورشة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Workshop Accounting Ledger.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "workshop_ledger"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_contracts",
      "type": "Page Guide",
      "categoryId": "projects_contracts",
      "pageKey": "contracts",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "contracts",
        "projects_contracts"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: عقود الشراكة والتشغيل المبرمة",
        "en": "Page Manual: Active Partner Agreements"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة عقود الشراكة والتشغيل المبرمة لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Active Partner Agreements dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة عقود الشراكة والتشغيل المبرمة بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Active Partner Agreements view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر عقود الشراكة والتشغيل المبرمة",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Active Partner Agreements.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "contracts"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_logistics",
      "type": "Page Guide",
      "categoryId": "fleet_fuel",
      "pageKey": "logistics",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "logistics",
        "fleet_fuel"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: مركز التوزيع والشحن اللوجستي",
        "en": "Page Manual: Logistics Dispatcher"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة مركز التوزيع والشحن اللوجستي لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the Logistics Dispatcher dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة مركز التوزيع والشحن اللوجستي بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the Logistics Dispatcher view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر مركز التوزيع والشحن اللوجستي",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select Logistics Dispatcher.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "logistics"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "pg_help_manual",
      "type": "Page Guide",
      "categoryId": "system_basics",
      "pageKey": "help_manual",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "page-guide",
        "help_manual",
        "system_basics"
      ],
      "title": {
        "ar": "دليل استخدام صفحة: دليل المستخدم الإرشادي السريع",
        "en": "Page Manual: User Help Manual"
      },
      "summary": {
        "ar": "شرح توضيحي للمهام والأدوات المتاحة بصفحة دليل المستخدم الإرشادي السريع لتسهيل الاستخدام بالقسم المالي أو التشغيلي.",
        "en": "Detailed operator runbook explaining layouts, views, actions, and credentials of the User Help Manual dashboard."
      },
      "content": {
        "ar": "ترشدك هذه الصفحة في كيفية إدارة دليل المستخدم الإرشادي السريع بالكامل. تتضمن الأقسام أزرار الإجراءات السريعة، وتفاصيل الحقول، وآلية التحديث السريع بالذاكرة ثم استدعاء الحفظ المحمي. يرجى مراجعة الصلاحيات للتحقق من المهام المسموحة.",
        "en": "This section documents the operations within the User Help Manual view. It reviews standard grid actions, form layouts, status badges, and integration rules mapped to security levels."
      },
      "steps": {
        "ar": [
          "افتح القائمة الجانبية للنظام واختر دليل المستخدم الإرشادي السريع",
          "افحص مؤشرات الأداء والبيانات المتاحة بالقائمة الرئيسية",
          "استخدم شريط البحث أو الفلاتر لتحديد العناصر المستهدفة بدقة",
          "اضغط على أي عنصر لعرض التفاصيل وتحديث البيانات أو الموافقة عليها"
        ],
        "en": [
          "Open the sidebar navigation and select User Help Manual.",
          "Analyze the KPI cards and active registers rendered in the primary panel.",
          "Apply local search strings or dropdown filters to target specific items.",
          "Click on action buttons or detail links to modify data and trigger auto-saving."
        ]
      },
      "relatedPages": [
        "help_manual"
      ],
      "source": "manual",
      "updatedAt": "2026-07-03"
    }
  ],
  "faqs": [
    {
      "id": "faq_001",
      "categoryId": "system_basics",
      "pageKey": "help_manual",
      "question": {
        "ar": "ما هو نظام Octagon ERP (OMNISYSTEM)؟",
        "en": "What is Octagon ERP (OMNISYSTEM)?"
      },
      "answer": {
        "ar": "هو نظام متكامل مخصص لإدارة الورش والمعامل الصناعية، مبني بهندسة SPA حديثة تدعم التحديث اللحظي للبيانات.",
        "en": "It is an advanced ERP environment custom-designed for industrial workshops, utilizing single-page application (SPA) state caching."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_002",
      "categoryId": "system_basics",
      "pageKey": "settings",
      "question": {
        "ar": "كيف يمكنني تغيير لغة واجهة البرنامج؟",
        "en": "How do I switch the system language?"
      },
      "answer": {
        "ar": "اضغط على علم اللغة بالشريط العلوي؛ سيقوم النظام بتحديث `localStorage` وتطبيق اتجاه RTL أو LTR تلقائياً.",
        "en": "Click the language switcher in the header; the system updates `localStorage` and toggles RTL/LTR orientations instantly."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_003",
      "categoryId": "system_basics",
      "pageKey": "settings",
      "question": {
        "ar": "ما هي آلية حفظ البيانات في أوكتاكون؟",
        "en": "How does Octagon auto-save data?"
      },
      "answer": {
        "ar": "يتم الحفظ في مخزن مؤقت بالذاكرة أولاً ثم استدعاء دالة المزامنة الآمنة saveData() لتحديث خادم البيانات.",
        "en": "Data is stored in-memory first, then synced securely via saveData() function call to update database file."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_004",
      "categoryId": "system_basics",
      "pageKey": "command_center",
      "question": {
        "ar": "أين يمكنني مراجعة سجل حركات النظام؟",
        "en": "Where can I view the system logs?"
      },
      "answer": {
        "ar": "يمكن لمديري النظام استعراض الحركات كاملة بصفحة سجلات التدقيق لمعرفة الإجراءات والمستخدم والوقت بالتفصيل.",
        "en": "System admins can view full session history in the Audit Logs page showing timestamps, users, and actions."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_005",
      "categoryId": "system_basics",
      "pageKey": "deploy_ready",
      "question": {
        "ar": "كيف أعلم إذا كانت هناك تحديثات جاهزة للنشر؟",
        "en": "How do I check for pending deployment updates?"
      },
      "answer": {
        "ar": "تعرض صفحة جاهزية النشر تقارير تفصيلية عن حالة خادم الويب، المسارات، وحالة الاتصال بقاعدة البيانات.",
        "en": "The Deploy Ready view shows detailed audits on active servers, paths, routes, and DB status metrics."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_006",
      "categoryId": "jarvis_ai",
      "pageKey": "intelligence",
      "question": {
        "ar": "ما هو دور جارفيس في إدارة قاعدة المعرفة والـ ERP؟",
        "en": "What is Jarvis's role in managing the Knowledge Base and ERP?"
      },
      "answer": {
        "ar": "دور جارفيس للقراءة والبحث وصياغة المسودات فقط. يمنع جارفيس منعاً باتاً من النشر أو التعديل المباشر.",
        "en": "Jarvis has read-only access for search and drafting. Direct editing or publishing without human approval is blocked."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_007",
      "categoryId": "jarvis_ai",
      "pageKey": "approvals",
      "question": {
        "ar": "هل يملك جارفيس صلاحية ترحيل قيود الحسابات مباشرة؟",
        "en": "Can Jarvis post financial journal entries directly?"
      },
      "answer": {
        "ar": "كلا؛ جميع عمليات الحسابات والرواتب تتطلب تأكيد موافقة بشرية من خلال طابور الموافقات في لوحة التحكم.",
        "en": "No; all bookkeeping and salary overrides require manual human approval from the Approval Center workspace."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_008",
      "categoryId": "jarvis_ai",
      "pageKey": "intelligence",
      "question": {
        "ar": "كيف يساعدني جارفيس في فهم وتفريغ المقاطع الصوتية بالورشة؟",
        "en": "How does Jarvis help transcribe voice notes in the workshop?"
      },
      "answer": {
        "ar": "يستخدم جارفيس نموذج Whisper وتكامل GPT لتفريغ الملاحظات الصوتية واستخراج كيانات الـ JSON للتشغيل والمخزون.",
        "en": "Jarvis uses Whisper and GPT integration to transcribe voice notes into formatted JSON timesheets or stock issues."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_009",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_queue",
      "question": {
        "ar": "لماذا يظهر زر 'موافقة AI' لبعض العمليات التشغيلية؟",
        "en": "Why is there an 'AI Approval' button for some actions?"
      },
      "answer": {
        "ar": "هو زر للمراجعة الفنية الذكية فقط، ولا يتجاوز سياسة الصلاحيات المطبقة على مجموعات المستخدمين الأساسية.",
        "en": "It acts as a technical audit checker and does not bypass permission policies enforced on real user groups."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_010",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_status",
      "question": {
        "ar": "كيف يتجنب جارفيس اتخاذ قرارات برمجية خاطئة بالسيستم؟",
        "en": "How does Jarvis prevent wrong coding operations in the system?"
      },
      "answer": {
        "ar": "يتعلم جارفيس ذاتياً عبر تحليل سجلات PostgreSQL وسجلات الأخطاء، ويقوم بإصلاح الأكواد الطفيفة تلقائياً.",
        "en": "Jarvis monitors PostgreSQL logs, automatically generates index recommendations, and patches syntax bugs."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_011",
      "categoryId": "system_basics",
      "pageKey": "route_health",
      "question": {
        "ar": "كيف أتحقق من سلامة مسارات الخادم؟",
        "en": "How do I audit route health?"
      },
      "answer": {
        "ar": "افتح صفحة route_health لفحص تطابق الأزرار والمقاطع البرمجية مع views.",
        "en": "Navigate to Route Health to check links and templates integrity."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_012",
      "categoryId": "system_basics",
      "pageKey": "help_manual",
      "question": {
        "ar": "هل يدعم النظام العمل دون اتصال بالإنترنت؟",
        "en": "Does the system support offline mode?"
      },
      "answer": {
        "ar": "نعم، يدعم النظام المعالجة بالذاكرة المحلية ومزامنة التعديلات عند استعادة الاتصال.",
        "en": "Yes, local-state storage handles processing and syncs when connectivity resumes."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_013",
      "categoryId": "system_basics",
      "pageKey": "help_manual",
      "question": {
        "ar": "ما هو دور معالج PWA؟",
        "en": "What is the PWA service worker?"
      },
      "answer": {
        "ar": "يقوم بتخزين ملفات العرض الثابتة بالذاكرة المخبأة لسرعة التحميل بالهاتف المحمول.",
        "en": "Caches static assets for offline and faster load times on mobile devices."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_014",
      "categoryId": "system_basics",
      "pageKey": "settings",
      "question": {
        "ar": "أين يتم حفظ إعدادات العملة والشركات؟",
        "en": "Where are currency and entity configurations saved?"
      },
      "answer": {
        "ar": "في لوحة تحكم إعدادات المؤسسة ويتم قراءتها بلغة العرض عند التحميل.",
        "en": "In Organization Settings, loaded into system context during bootstrap."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_015",
      "categoryId": "system_basics",
      "pageKey": "admin_panel",
      "question": {
        "ar": "ما هي طريقة استرداد ملف النسخ الاحتياطي؟",
        "en": "How do I restore a database backup?"
      },
      "answer": {
        "ar": "يجب التوجه لمركز الإدارة وكتابة جملة التأكيد مع أخذ نسخة حالية قبل التنفيذ.",
        "en": "Requires admin validation text input and a pre-restore backup action."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_016",
      "categoryId": "system_basics",
      "pageKey": "deploy_ready",
      "question": {
        "ar": "كيف أعرف رقم إصدار النظام الحالي؟",
        "en": "How do I verify the system release status?"
      },
      "answer": {
        "ar": "عبر فحص الشريط السفلي أو طلب حالة النشر لمعرفة الفيكس والكوميت الأخير.",
        "en": "Check footer release indicators or call the status route diagnostics."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_017",
      "categoryId": "system_basics",
      "pageKey": "visitors",
      "question": {
        "ar": "هل يمكنني تصفح النظام كزائر؟",
        "en": "Can I log in as a visitor?"
      },
      "answer": {
        "ar": "نعم، بوابة الزوار تتيح قراءة الشروحات العامة والمقالات المنشورة فقط.",
        "en": "Yes, public logs permit reading public articles and general guides."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_018",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_tools",
      "question": {
        "ar": "هل يستطيع جارفيس كتابة أكواد داخل المستودع؟",
        "en": "Can Jarvis write code inside the repository?"
      },
      "answer": {
        "ar": "يمكنه صياغة المسودات وتصحيح المشاكل بالسكربتات، وتعديلاته تخضع للفحص والاعتماد.",
        "en": "He drafts scripts and fixes bugs, but commits are guarded by admin checks."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_019",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_status",
      "question": {
        "ar": "كيف يتم توثيق أنشطة الذكاء الاصطناعي؟",
        "en": "How are AI operations audited?"
      },
      "answer": {
        "ar": "تسجل كل أداة تستدعى بواسطة الذكاء في سجلات الأمان بنوع خطورة safe أو high.",
        "en": "AI tool executions are logged in the Security Center with risk rankings."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_020",
      "categoryId": "jarvis_ai",
      "pageKey": "intelligence",
      "question": {
        "ar": "ما هي لوحة تحكم أتمتة جارفيس؟",
        "en": "What is the Jarvis Automation Dashboard?"
      },
      "answer": {
        "ar": "واجهة فنية تعرض طوابير المهام، ونسبة نجاح تفريغ الصوت، والاستهلاك المالي للـ Tokens.",
        "en": "A dashboard showing task queues, audio transcription ratios, and token budgets."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_021",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_status",
      "question": {
        "ar": "كيف يتم إخطار جارفيس بالتحديثات البرمجية؟",
        "en": "How is Jarvis notified of code changes?"
      },
      "answer": {
        "ar": "يقوم محرك حوكمة الذكاء بفحص الكوميتات وتحديث خريطة الملفات تلقائياً.",
        "en": "The AI Governance system scans commits and rebuilds file maps."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_022",
      "categoryId": "jarvis_ai",
      "pageKey": "procurement",
      "question": {
        "ar": "هل يشارك جارفيس في تخطيط المشتريات؟",
        "en": "Does Jarvis assist in procurement planning?"
      },
      "answer": {
        "ar": "يحلل مستويات الاستهلاك ويقترح قوائم شراء في المسودة فقط دون إنشاء طلب حقيقي.",
        "en": "Parses consumption rates and drafts purchase requisitions for review."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_023",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_tools",
      "question": {
        "ar": "ما هي سياسة الـ Tokens المحددة لجارفيس؟",
        "en": "What is the token budget policy for Jarvis?"
      },
      "answer": {
        "ar": "تحدد ميزانية شهرية لكل مستخدم لمنع الاستخدام غير الرشيد لـ APIs.",
        "en": "Enforces monthly limits per user to prevent excessive API costs."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_024",
      "categoryId": "jarvis_ai",
      "pageKey": "intelligence",
      "question": {
        "ar": "كيف أبلغ جارفيس عن خطأ محاسبي بالسيستم؟",
        "en": "How do I report an accounting anomaly to Jarvis?"
      },
      "answer": {
        "ar": "اكتب تفاصيل القيد في نافذة دردشة الذكاء وسيبحث في دفتر الحسابات لكشف الخلل.",
        "en": "Type details in chat; Jarvis scans ledger records to flag differences."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_025",
      "categoryId": "sales_crm",
      "pageKey": "customers",
      "question": {
        "ar": "كيف أسجل زبون جديد في النظام؟",
        "en": "How do I register a new client?"
      },
      "answer": {
        "ar": "افتح صفحة العملاء واضغط على زر إضافة، واملأ بيانات اللوحة والهاتف.",
        "en": "Open Customers, click Add, and enter plate info and phone numbers."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_026",
      "categoryId": "sales_crm",
      "pageKey": "sales_commission",
      "question": {
        "ar": "ما هي عمولة المبيعات الافتراضية؟",
        "en": "What is the default sales commission?"
      },
      "answer": {
        "ar": "تحتسب بنسبة مئوية من صافي فاتورة التحصيل بناءً على اتفاقية البيع المحددة.",
        "en": "Computed as a percentage of collected invoices based on active agreements."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_027",
      "categoryId": "sales_crm",
      "pageKey": "sales_contracts",
      "question": {
        "ar": "أين يتم تتبع عقود مبيعات الورشة؟",
        "en": "Where are sales agreements tracked?"
      },
      "answer": {
        "ar": "في صفحة عقود المبيعات حيث تسجل الدفعة الأولى، الأقساط، والتواريخ المهمة.",
        "en": "In Sales Contracts, displaying deposits, payment plans, and milestones."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_028",
      "categoryId": "sales_crm",
      "pageKey": "sales_price_lists",
      "question": {
        "ar": "كيف أحدث قائمة أسعار المنتجات؟",
        "en": "How do I update product price lists?"
      },
      "answer": {
        "ar": "من خلال صفحة قوائم الأسعار عبر تعديل سعر الأساس أو إضافة حسم خاص.",
        "en": "In Sales Price Lists, editing baseline rates or adding discounts."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_029",
      "categoryId": "sales_crm",
      "pageKey": "customers",
      "question": {
        "ar": "ما هو تدفق المتابعة للزبائن؟",
        "en": "What is the client follow-up workflow?"
      },
      "answer": {
        "ar": "يسجل النظام تاريخ المتابعة الأخير ويوجه إشعاراً للمندوب للاتصال بالعميل.",
        "en": "Logs timestamps and triggers reminder flags for representatives to call."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_030",
      "categoryId": "sales_crm",
      "pageKey": "sales",
      "question": {
        "ar": "كيف أقوم بإصدار فاتورة أولية للزبون؟",
        "en": "How do I issue a quotation invoice?"
      },
      "answer": {
        "ar": "اختر العميل بصفحة المبيعات واضغط إنشاء عرض أسعار، ثم اطبعه كـ PDF.",
        "en": "Select client in Sales, click Create Quotation, and export PDF."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_031",
      "categoryId": "sales_crm",
      "pageKey": "customer_portal",
      "question": {
        "ar": "هل يمكن للعميل تتبع طلبه من هاتفه؟",
        "en": "Can clients track orders on mobile?"
      },
      "answer": {
        "ar": "نعم، بوابة العملاء تتيح مراجعة حالة التجهيز وأوامر العمل للزبائن.",
        "en": "Yes, Customer Portal displays preparation states and workorders."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_032",
      "categoryId": "inventory_wh",
      "pageKey": "inventory",
      "question": {
        "ar": "أين أجد بطاقة تفاصيل حركة المادة؟",
        "en": "Where is the stock card history?"
      },
      "answer": {
        "ar": "افتح تفاصيل المستودع واضغط على المادة لعرض حركات الوارد والمنصرف والتعديل.",
        "en": "Open Inventory and click item to view logs of issue, receipt, and edits."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_033",
      "categoryId": "inventory_wh",
      "pageKey": "inventory",
      "question": {
        "ar": "ما هو دور مستودعات الورشة المتعددة؟",
        "en": "How are multiple warehouses managed?"
      },
      "answer": {
        "ar": "يتم فرز المواد بين مستودع الخشب ومستودع اللوحات والمخزن الاحتياطي.",
        "en": "Sorts materials between Carpentry, Ads, and Central depots."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_034",
      "categoryId": "inventory_wh",
      "pageKey": "inventory",
      "question": {
        "ar": "كيف أسجل تسوية مخزنية عند تلف مادة؟",
        "en": "How do I record a stock adjustment?"
      },
      "answer": {
        "ar": "افتح التسويات بصفحة المخزون، وحدد الكمية التالفة لتحديث رصيد المادة بالدائنية.",
        "en": "Open adjustments, input item count to credit stock balances."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_035",
      "categoryId": "inventory_wh",
      "pageKey": "employee_mobile",
      "question": {
        "ar": "ما هي إجراءات الجرد المخزني عبر الموبايل؟",
        "en": "What is the Mobile Inventory Count SOP?"
      },
      "answer": {
        "ar": "يقوم المدقق بمسح الباركود عبر تطبيق الهاتف وتحديث الكميات الفعلية بالذاكرة.",
        "en": "Operators scan barcodes via phone to update physical stock counts."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_036",
      "categoryId": "inventory_wh",
      "pageKey": "inventory",
      "question": {
        "ar": "كيف يتصرف النظام عند وصول المادة للحد الأدنى؟",
        "en": "How does system handle low stock alarms?"
      },
      "answer": {
        "ar": "يظهر تنبيه باللون الأحمر في شاشة المخزون مع إرسال إشعار شراء لـ Procurement.",
        "en": "Displays a red flag on inventory views and issues buy alerts."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_037",
      "categoryId": "inventory_wh",
      "pageKey": "inventory",
      "question": {
        "ar": "كيف أحول مواد بين المواقع الإنشائية؟",
        "en": "How do I transfer stock between sites?"
      },
      "answer": {
        "ar": "أنشئ طلب تحويل مخزني بالمواد المطلوبة ويجب تأكيده من كلا المخزنين.",
        "en": "Create transfer draft specifying items, requiring approvals from both."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_038",
      "categoryId": "inventory_wh",
      "pageKey": "data_quality",
      "question": {
        "ar": "ما هي حذيرات جودة بيانات المخزون؟",
        "en": "What are stock data quality warnings?"
      },
      "answer": {
        "ar": "تنبيهات عند وجود مادة بدون سعر كلفة، أو كميات سالبة، أو باركود مكرر.",
        "en": "Alarms for negative levels, missing cost values, or duplicate barcodes."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_039",
      "categoryId": "finance_acct",
      "pageKey": "finance",
      "question": {
        "ar": "كيف أغلق الفترة المالية بشكل آمن؟",
        "en": "How do I close financial periods safely?"
      },
      "answer": {
        "ar": "يجب فحص كافة المعاملات ثم تفعيل Period Lock لمنع أي تعديل محاسبي رجعي.",
        "en": "Verify all matches and enable Period Lock to block historical updates."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_040",
      "categoryId": "finance_acct",
      "pageKey": "finance",
      "question": {
        "ar": "ما هي اليوميات المعتمدة بالحسابات؟",
        "en": "What are the active journals in Octagon?"
      },
      "answer": {
        "ar": "يومية الصندوق، يومية البنك، يومية المشتريات، ويومية المبيعات والمصاريف.",
        "en": "Cash journal, bank journal, purchases, sales, and expense books."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_041",
      "categoryId": "finance_acct",
      "pageKey": "banking",
      "question": {
        "ar": "كيف تتم مطابقة المقبوضات البنكية؟",
        "en": "How are bank receipts reconciled?"
      },
      "answer": {
        "ar": "يقوم النظام بمطابقة كشف البنك المرفوع مع المقبوضات والمدفوعات المسجلة.",
        "en": "Matches imported bank statements against registered ledger receipts."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_042",
      "categoryId": "finance_acct",
      "pageKey": "finance_installments",
      "question": {
        "ar": "أين يتم تتبع الأقساط والتمويلات للزبائن؟",
        "en": "Where are customer installments tracked?"
      },
      "answer": {
        "ar": "في صفحة متابعة الأقساط والتمويل التي توضح المبالغ المتبقية والمسددة وتاريخ الاستحقاق.",
        "en": "In Installments Tracker, displaying unpaid balances and due dates."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_043",
      "categoryId": "finance_acct",
      "pageKey": "calculator",
      "question": {
        "ar": "ما هي حاسبة مستحقات الدوام المالي؟",
        "en": "What is the Attendance Cost Calculator?"
      },
      "answer": {
        "ar": "تقوم بتحويل ساعات الدوام الفعلي والعمل الإضافي إلى تكلفة مالية تسجل بالرواتب.",
        "en": "Translates attendance sheets and overtime hours into payroll costs."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_044",
      "categoryId": "finance_acct",
      "pageKey": "cashbox",
      "question": {
        "ar": "كيف أسجل مصروف نثرية بصفحة الصندوق؟",
        "en": "How do I log a cashbox expense?"
      },
      "answer": {
        "ar": "افتح الصندوق واضغط دفعة نقدية، وحدد الحساب التحليلي للمصروف والمبلغ.",
        "en": "Open Cashbox, click Cash Payment, select analysis account & cost."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_045",
      "categoryId": "finance_acct",
      "pageKey": "ar_ap",
      "question": {
        "ar": "أين أراجع الميزانية العمومية والتقارير المالية؟",
        "en": "Where do I audit the ledger and balance sheets?"
      },
      "answer": {
        "ar": "بصفحة التقارير المالية والذمم المدينة والدائنة AR/AP لمطابقة الأرصدة.",
        "en": "In Financial Reports and AR/AP views to match trial balances."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_046",
      "categoryId": "hr_payroll",
      "pageKey": "calculator",
      "question": {
        "ar": "كيف تحسب حاسبة الرواتب صافي الراتب الشهري؟",
        "en": "How does the payroll calculator compute net salaries?"
      },
      "answer": {
        "ar": "المعادلة: الراتب الأساسي + (ساعات العمل الإضافي × سعر الساعة × معامل الضرب) - الخصومات والغياب.",
        "en": "Formula: Base Salary + (Overtime Hours * Hourly Rate * Multiplier) - Deductions - Absence Penalties."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_047",
      "categoryId": "hr_payroll",
      "pageKey": "calculator",
      "question": {
        "ar": "ما هي معاملات ساعات العمل الإضافي المعتمدة؟",
        "en": "What are the approved overtime multipliers?"
      },
      "answer": {
        "ar": "الأيام العادية: معامل الضرب 1.5x. عطل نهاية الأسبوع والأعياد: معامل الضرب 2.0x.",
        "en": "Weekday overtime multiplier is 1.5x. Weekend and official holiday multiplier is 2.0x."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_048",
      "categoryId": "hr_payroll",
      "pageKey": "timesheet",
      "question": {
        "ar": "كيف يتصرف محلل الإكسل عند تداخل ساعات الحضور للموظف؟",
        "en": "How does the Excel parser handle overlapping timesheet records?"
      },
      "answer": {
        "ar": "يقوم النظام برفض السطر المتداخل تلقائياً، ويسجل تحذيراً لمدير الموارد البشرية لمراجعته يدوياً.",
        "en": "The parser rejects the overlapping row, logging a conflict alert for manual review to prevent duplicate payouts."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_049",
      "categoryId": "hr_payroll",
      "pageKey": "employees",
      "question": {
        "ar": "أين تسجل وثائق الموظفين وعقود العمل؟",
        "en": "Where are employee contract files stored?"
      },
      "answer": {
        "ar": "في دليل الموظفين تحت ملف المستندات لكل موظف وتحديث إشعار التجديد.",
        "en": "In Employee Directory under documents tab with expiry alerts."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_050",
      "categoryId": "hr_payroll",
      "pageKey": "employee_ui",
      "question": {
        "ar": "كيف يقدم الموظف طلب إجازة؟",
        "en": "How does an employee request leave?"
      },
      "answer": {
        "ar": "عبر بوابة الخدمة الذاتية للموظف ويتم ترحيل الطلب للمدير لاعتماده.",
        "en": "Via Self-Service Portal, routing request to manager queue."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_051",
      "categoryId": "hr_payroll",
      "pageKey": "training_lms",
      "question": {
        "ar": "أين يتم تتبع تدريب الموظفين؟",
        "en": "Where is employee training logged?"
      },
      "answer": {
        "ar": "في منصة تدريب الموظفين LMS لمتابعة الكورسات المنجزة ونسب التقييم الفني.",
        "en": "In LMS Training, tracking completed courses and tech scores."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_052",
      "categoryId": "hr_payroll",
      "pageKey": "employee_mobile",
      "question": {
        "ar": "كيف يعمل قارئ البصمة مع الهاتف المحمول؟",
        "en": "How does mobile geofenced check-in work?"
      },
      "answer": {
        "ar": "يقارن النظام إحداثيات GPS للهاتف مع النطاق الجغرافي للورشة لتأكيد الحضور.",
        "en": "Matches mobile GPS coordinates with geofenced workshop zones."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_053",
      "categoryId": "workshop_prod",
      "pageKey": "mrp",
      "question": {
        "ar": "ما هي خطوط الإنتاج النشطة في الورشة؟",
        "en": "What are the active workshop production lines?"
      },
      "answer": {
        "ar": "خط النجارة (أعمال الخشب والـ CNC)، خط الإعلانات (طباعة اللوحات المضيئة)، وخط الديكور (التشطيبات الفاخرة).",
        "en": "Carpentry Line (custom wood/CNC), Ads Line (lightbox printing), and Decoration Line (high-end interiors)."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_054",
      "categoryId": "workshop_prod",
      "pageKey": "work_orders",
      "question": {
        "ar": "كيف أتابع حالة أمر تشغيل معين؟",
        "en": "How do I audit an active work order?"
      },
      "answer": {
        "ar": "افتح سجل أوامر التشغيل أو لوحة كانبان الإنتاج لمشاهدة مرحلة العمل اللحظية.",
        "en": "Open Work Orders or Kanban view to check active staging details."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_055",
      "categoryId": "workshop_prod",
      "pageKey": "qc_center",
      "question": {
        "ar": "أين يتم توثيق فحوصات الجودة للمنتجات؟",
        "en": "Where are quality controls logged?"
      },
      "answer": {
        "ar": "في مركز فحص الجودة QC حيث تسجل العينات الناجحة وحالات إعادة العمل (Rework).",
        "en": "In QC Center, logging passed samples and rework logs."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_056",
      "categoryId": "workshop_prod",
      "pageKey": "task_manager",
      "question": {
        "ar": "كيف أوزع المهام اليومية لعمال الورشة؟",
        "en": "How do I assign daily tasks to operators?"
      },
      "answer": {
        "ar": "عبر موزع مهام الورشة الذي يعتمد على الكفاءة والخطوط الإنتاجية الشاغرة.",
        "en": "Through Workshop Task Dispatcher based on line availability."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_057",
      "categoryId": "workshop_prod",
      "pageKey": "workshop_tv",
      "question": {
        "ar": "ما هو دور شاشة التلفاز الكبيرة بالورشة؟",
        "en": "What is the Workshop TV display for?"
      },
      "answer": {
        "ar": "تعرض الشاشة إجمالي القطع المنجزة اليوم وأوامر العمل المتأخرة لتشجيع العمال.",
        "en": "Displays daily completed pieces and late orders to operators."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_058",
      "categoryId": "workshop_prod",
      "pageKey": "machines",
      "question": {
        "ar": "كيف أسجل استخدام ماكينة CNC؟",
        "en": "How do I log CNC machine utilization?"
      },
      "answer": {
        "ar": "افتح سجل مكائن CNC وسجل تاريخ التشغيل والمنتج المستهدف وساعات العمل.",
        "en": "Open CNC registry and log active hours, target product and output."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_059",
      "categoryId": "workshop_prod",
      "pageKey": "sop",
      "question": {
        "ar": "أين أجد أدلة التشغيل الفنية SOP للمكائن؟",
        "en": "Where are machine SOP documents located?"
      },
      "answer": {
        "ar": "في مكتب فحص أدلة التشغيل SOP المتاح لكل عامل قبل البدء بتشغيل الآلة.",
        "en": "In SOP Verification Desk, readable before booting hardware."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_060",
      "categoryId": "projects_contracts",
      "pageKey": "projects",
      "question": {
        "ar": "كيف يتم إعداد مشروع عميل جديد؟",
        "en": "How do I configure a new client project?"
      },
      "answer": {
        "ar": "افتح مخطط مشاريع العملاء، وأدخل اسم المشروع، الميزانية، والجدول الزمني.",
        "en": "Open Project Hub, enter title, total budget, and milestones."
      },
      "tags": [
        "seed",
        "projects_contracts"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_061",
      "categoryId": "projects_contracts",
      "pageKey": "contracts",
      "question": {
        "ar": "أين تدرج عقود الشركاء في الورشة؟",
        "en": "Where are partner agreements documented?"
      },
      "answer": {
        "ar": "في صفحة عقود الشراكة المبرمة التي تضمن توزيع الأرباح وصيانة الآلات.",
        "en": "In Active Partner Agreements page, tracking splits and costs."
      },
      "tags": [
        "seed",
        "projects_contracts"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_062",
      "categoryId": "projects_contracts",
      "pageKey": "contracts",
      "question": {
        "ar": "كيف أحسب ربحية مشروع الديكور؟",
        "en": "How are decoration profit splits calculated?"
      },
      "answer": {
        "ar": "يتم خصم المواد وأجور عمال مقاولي الباطن، ويوزع المتبقي بنسب الشركاء.",
        "en": "Subtracts materials and subcontract labor, splitting margin."
      },
      "tags": [
        "seed",
        "projects_contracts"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_063",
      "categoryId": "projects_contracts",
      "pageKey": "projects",
      "question": {
        "ar": "أين أسجل مرفقات وتصاميم المشاريع؟",
        "en": "Where do I upload project attachments?"
      },
      "answer": {
        "ar": "في صفحة المشروع المعني بقسم المرفقات لحفظ مخططات أوتوكاد و3DS Max.",
        "en": "In target Project page under attachments for CAD and 3D files."
      },
      "tags": [
        "seed",
        "projects_contracts"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_064",
      "categoryId": "projects_contracts",
      "pageKey": "projects",
      "question": {
        "ar": "كيف أتابع خطورة تأخر تسليم المشروع؟",
        "en": "How do I track project delay risks?"
      },
      "answer": {
        "ar": "يعرض مخطط المشاريع مؤشر الخطر باللون البرتقالي عند تجاوز الموعد المحدد.",
        "en": "Project Hub displays orange flag indicators on late milestones."
      },
      "tags": [
        "seed",
        "projects_contracts"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_065",
      "categoryId": "projects_contracts",
      "pageKey": "rental",
      "question": {
        "ar": "أين تدار عقود تأجير المعدات للزبائن؟",
        "en": "Where are equipment rental contracts managed?"
      },
      "answer": {
        "ar": "في صفحة تأجير الآلات التي تتبع فترات الإيجار وأرصدة الدفعات المستحقة.",
        "en": "In Rental Manager tracking lease periods and invoice balances."
      },
      "tags": [
        "seed",
        "projects_contracts"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_066",
      "categoryId": "projects_contracts",
      "pageKey": "workshop_ledger",
      "question": {
        "ar": "كيف تتم تصفية حسابات مشروع منتهي؟",
        "en": "How do I reconcile and close completed projects?"
      },
      "answer": {
        "ar": "يتم مراجعة اليوميات بـ Workshop Ledger لترحيل الأرباح وإغلاق الحساب.",
        "en": "Review entries in Workshop Ledger to post revenue splits."
      },
      "tags": [
        "seed",
        "projects_contracts"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_067",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "question": {
        "ar": "ما هي خريطة التحكم بالأسطول؟",
        "en": "What is the Fleet Command Map?"
      },
      "answer": {
        "ar": "شاشة SVG تعرض مواقع المركبات الافتراضية، وحالة السرعة، والتنبيهات.",
        "en": "SVG canvas showing vehicle positions, speeding alarms, and alerts."
      },
      "tags": [
        "seed",
        "fleet_fuel"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_068",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "question": {
        "ar": "أين تسجل حركات وتعبئات وقود السيارات؟",
        "en": "Where are fuel refills logged?"
      },
      "answer": {
        "ar": "في سجل الوقود بصفحة الأسطول، وتُرحل تلقائياً كمصروف نقل بالصندوق.",
        "en": "In Fuel logs under Fleet page, automatically posted to cashbox."
      },
      "tags": [
        "seed",
        "fleet_fuel"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_069",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "question": {
        "ar": "كيف تحدد سياسات السرعة بالأسطول؟",
        "en": "How are geofenced speed limits configured?"
      },
      "answer": {
        "ar": "يتم تحديد حدود سرعة مخصصة للمركبات الخفيفة والثقيلة داخل كل منطقة.",
        "en": "Limits are assigned per zone for light and heavy equipment."
      },
      "tags": [
        "seed",
        "fleet_fuel"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_070",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "question": {
        "ar": "كيف يكشف النظام شبهات سرقة ديزل الآليات؟",
        "en": "How does the system detect Kaz/Diesel theft?"
      },
      "answer": {
        "ar": "بمطابقة كمية المضخة مع قراءة حساس الخزان وإطلاق إنذار عند الهبوط.",
        "en": "Compares pump slips with digital tank sensor levels to flag drops."
      },
      "tags": [
        "seed",
        "fleet_fuel"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_071",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "question": {
        "ar": "ما هو الفرق بين الوضع التجريبي والربط الحقيقي؟",
        "en": "What is the difference between Demo and Real Fleet mode?"
      },
      "answer": {
        "ar": "الوضع التجريبي يستخدم بيانات مدمجة، والربط الحقيقي يحتاج سيرفر تتبع.",
        "en": "Demo mode uses in-memory seeds; Real mode requires GPS servers."
      },
      "tags": [
        "seed",
        "fleet_fuel"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_072",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "question": {
        "ar": "أين أتابع صيانة وإجازات آليات النقل؟",
        "en": "Where do I track vehicle license expiries?"
      },
      "answer": {
        "ar": "في لوحة السيطرة KPI التي تظهر تحذيرات حمراء للوثائق المنتهية.",
        "en": "In Fleet Dashboard showing red alerts for expired cards."
      },
      "tags": [
        "seed",
        "fleet_fuel"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_073",
      "categoryId": "fleet_fuel",
      "pageKey": "fleet",
      "question": {
        "ar": "ما هي مهام لوحة حوكمة الأسطول بالذكاء؟",
        "en": "What is the Jarvis Fleet Governance rule?"
      },
      "answer": {
        "ar": "يقوم جارفيس بتحليل استهلاك وقود الآليات وعرض توصيات الصيانة فقط.",
        "en": "AI analyzes fuel logs and prompts maintenance recommendations."
      },
      "tags": [
        "seed",
        "fleet_fuel"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_074",
      "categoryId": "messaging_connect",
      "pageKey": "telegram",
      "question": {
        "ar": "ما هي صفحة التليغرام في النظام؟",
        "en": "What is the Telegram Integration page?"
      },
      "answer": {
        "ar": "بوابة لإدارة تنبيهات العملاء، وحالة البوت، والمشتركين النشطين.",
        "en": "Portal managing client notifications, bot status, and chats."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_075",
      "categoryId": "messaging_connect",
      "pageKey": "whatsapp",
      "question": {
        "ar": "كيف يتصل النظام مع بوابة واتساب؟",
        "en": "How does the system hook with WhatsApp Gateway?"
      },
      "answer": {
        "ar": "عبر بوابة Node.js آمنة ترسل فواتير العملاء وكشوفات الرواتب بصيغة PDF.",
        "en": "Secure Node.js router sending PDF receipts and payslips to staff."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_076",
      "categoryId": "messaging_connect",
      "pageKey": "telegram",
      "question": {
        "ar": "هل يرسل جارفيس رسائل تلقائية للزبائن؟",
        "en": "Can Jarvis text clients directly?"
      },
      "answer": {
        "ar": "كلا؛ جارفيس يصوغ مسودات الرسائل فقط ويجب تأكيد إرسالها يدوياً.",
        "en": "No; AI drafts message payloads requiring manual approval to send."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_077",
      "categoryId": "messaging_connect",
      "pageKey": "settings",
      "question": {
        "ar": "أين تحفظ مفاتيح التوثيق وتوكنات البرمجة؟",
        "en": "Where are API secret tokens stored?"
      },
      "answer": {
        "ar": "تُحفظ في خادم البيئة الخلفي `.env` ولا تظهر إطلاقاً في واجهات المستخدم.",
        "en": "Stored in backend environment variables (.env), never shown in UI."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_078",
      "categoryId": "messaging_connect",
      "pageKey": "omni_communications",
      "question": {
        "ar": "ما هو مركز اتصالات أومني الموحد؟",
        "en": "What is the Omni Communications Center?"
      },
      "answer": {
        "ar": "صفحة تدمج رسائل تليغرام وواتساب والبريد الإلكتروني للعملاء في نافذة واحدة.",
        "en": "Unified console rendering WhatsApp, Telegram & Email in one view."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_079",
      "categoryId": "messaging_connect",
      "pageKey": "whatsapp",
      "question": {
        "ar": "كيف أربط حساب واتساب ويب تجاري؟",
        "en": "How do I bridge a WhatsApp Business account?"
      },
      "answer": {
        "ar": "عبر مسح رمز QR من خلال إعدادات التكامل وتجربة إرسال رسالة فحص.",
        "en": "Scan QR code via integration tab and send test message."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_080",
      "categoryId": "messaging_connect",
      "pageKey": "whatsapp",
      "question": {
        "ar": "هل تسجل حركات الإرسال في سجل التدقيق؟",
        "en": "Are outbound messages written to the audit log?"
      },
      "answer": {
        "ar": "نعم، يتم توثيق هوية المستخدم الذي وافق على إرسال الرسالة ووقتها.",
        "en": "Yes, logging the user ID, timestamp, and payload of sent texts."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_081",
      "categoryId": "reports_analytics",
      "pageKey": "nl_reports",
      "question": {
        "ar": "ما هو مصمم التقارير الذكي بالسيستم؟",
        "en": "What is the Smart Report Designer?"
      },
      "answer": {
        "ar": "أداة لإنشاء تقارير ديناميكية بتحديد الأعمدة والفلاتر وصيغة التصدير.",
        "en": "Enables creating reports by selecting columns, filters, and formats."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_082",
      "categoryId": "reports_analytics",
      "pageKey": "nl_reports",
      "question": {
        "ar": "كيف أقوم بتصدير كشوف الحسابات لإكسل؟",
        "en": "How do I export statement ledger sheets to Excel?"
      },
      "answer": {
        "ar": "من أي جدول تقارير، اضغط تصدير CSV أو Excel ليتم التحميل مباشرة.",
        "en": "Click Export CSV or Excel button on top of target report grid."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_083",
      "categoryId": "reports_analytics",
      "pageKey": "analytics",
      "question": {
        "ar": "أين تعرض تحليلات المبيعات والإنتاج التنفيذية؟",
        "en": "Where are sales and production analytics rendered?"
      },
      "answer": {
        "ar": "في صفحة التحليلات التنفيذية التي تحلل أرباح المعامل وخطوط الورشة.",
        "en": "In Executive Analytics view showing margins per production line."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_084",
      "categoryId": "reports_analytics",
      "pageKey": "nl_reports",
      "question": {
        "ar": "هل يستطيع جارفيس شرح وتلخيص التقارير الكبيرة؟",
        "en": "Can Jarvis explain complex analytical reports?"
      },
      "answer": {
        "ar": "نعم، عبر الضغط على أيقونة الذكاء لتوليد ملخص فني للأرقام والمؤشرات.",
        "en": "Yes, click AI assistant icon to generate descriptions of stats."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_085",
      "categoryId": "reports_analytics",
      "pageKey": "scenario_planner",
      "question": {
        "ar": "ما هو مخطط سيناريوهات المستقبل؟",
        "en": "What is the Scenario Forecasting planner?"
      },
      "answer": {
        "ar": "صفحة لتجربة سيناريوهات رفع الأسعار أو تعديل الأجور ودراسة تأثيرها.",
        "en": "Simulates effects of raising price levels or salary scales."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_086",
      "categoryId": "reports_analytics",
      "pageKey": "budgeting",
      "question": {
        "ar": "أين يتم تتبع الميزانية المخططة مقابل الفعلية؟",
        "en": "Where is planned vs actual budget tracked?"
      },
      "answer": {
        "ar": "في صفحة تخطيط الموازنات التي توضح الفروقات والانحرافات المالية.",
        "en": "In Budget Planner showing financial variance and trends."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_087",
      "categoryId": "reports_analytics",
      "pageKey": "nl_reports",
      "question": {
        "ar": "هل يمكن حجب التقارير المالية عن موظفي الورشة؟",
        "en": "Are financial reports hidden from workshop operators?"
      },
      "answer": {
        "ar": "نعم، الصلاحيات تمنع تماماً أي موظف غير مصرح له من فتح تقارير الإيرادات.",
        "en": "Yes, role permissions block operators from opening finance pages."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_088",
      "categoryId": "saas_marketplace",
      "pageKey": "integration_hub",
      "question": {
        "ar": "ما هو مركز تكامل البرمجيات بالمؤسسة؟",
        "en": "What is the API Integration Hub?"
      },
      "answer": {
        "ar": "صفحة لتفعيل وإدارة وتفقد بوابات الشركاء والربط السحابي للسيستم.",
        "en": "Portal for enabling and inspecting partner integrations."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_089",
      "categoryId": "saas_marketplace",
      "pageKey": "subscriptions",
      "question": {
        "ar": "كيف تدار باقات واشتراكات المعامل والشركات؟",
        "en": "Where are client SaaS subscriptions managed?"
      },
      "answer": {
        "ar": "في صفحة الاشتراكات والفواتير التي تتبع خطة الدفع وتاريخ التجديد.",
        "en": "In Billing Subscriptions tracking active tier and dues."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_090",
      "categoryId": "saas_marketplace",
      "pageKey": "integration_hub",
      "question": {
        "ar": "ما هو سوق التطبيقات الداخلي بالـ ERP؟",
        "en": "What is the ERP internal Marketplace?"
      },
      "answer": {
        "ar": "صفحة لاستعراض الإضافات الجاهزة وتفعيل ميزات كالصيدلية أو الفندق.",
        "en": "Showcases plugins enabling vertical scopes like Clinic or Hotel."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_091",
      "categoryId": "saas_marketplace",
      "pageKey": "integration_hub",
      "question": {
        "ar": "هل الربط مع المتاجر الإلكترونية حقيقي بالكامل؟",
        "en": "Are e-commerce connector syncs fully live?"
      },
      "answer": {
        "ar": "في نسخة العرض، يتم استخدام محاكاة المعاملات والتوكنات لأمان الكود.",
        "en": "In demo builds, integrations are staged/mocked for safety."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_092",
      "categoryId": "saas_marketplace",
      "pageKey": "automation",
      "question": {
        "ar": "أين يمكنني العثور على أتمتة قواعد سير العمل؟",
        "en": "Where are workflow automation rules managed?"
      },
      "answer": {
        "ar": "في صفحة قواعد الأتمتة التي تربط الأحداث بالإجراءات البرمجية تلقائياً.",
        "en": "In Workflow Rules matching trigger events with auto-actions."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_093",
      "categoryId": "saas_marketplace",
      "pageKey": "integration_hub",
      "question": {
        "ar": "كيف يتم حماية النظام من إضافات الـ Marketplace الضارة؟",
        "en": "How is the system guarded against malicious plugins?"
      },
      "answer": {
        "ar": "تخضع الإضافات لنظام عزل الصلاحيات وحظر قراءة كلمات السر وقيم DB.",
        "en": "Plugins operate under strict sandboxes blocking direct DB reads."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_094",
      "categoryId": "saas_marketplace",
      "pageKey": "integration_hub",
      "question": {
        "ar": "هل يمكنني تفعيل ميزة الصيدلية والفندق معاً؟",
        "en": "Can I activate both Pharmacy and Hotel modules?"
      },
      "answer": {
        "ar": "نعم، حيث يتم تحميل الملفات الخاصة بكل قسم بالذاكرة بشكل مستقل.",
        "en": "Yes, templates are dynamically loaded as independent modules."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_095",
      "categoryId": "admin_settings",
      "pageKey": "security_center",
      "question": {
        "ar": "أين تدار مجموعات وصلاحيات المستخدمين؟",
        "en": "Where are user roles and permissions managed?"
      },
      "answer": {
        "ar": "في صفحة مركز الأمان والأدوار التي تحدد صلاحيات القراءة والكتابة لكل صفحة.",
        "en": "In Security Center mapping page permissions per user group."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_096",
      "categoryId": "admin_settings",
      "pageKey": "admin_panel",
      "question": {
        "ar": "كيف أقوم بتغيير كلمة المرور الخاصة بحسابي؟",
        "en": "How do I change my user password?"
      },
      "answer": {
        "ar": "عبر الملف الشخصي أو بطلب إعادة التعيين من مدير النظام بالوحة الإدارة.",
        "en": "Via User Profile or triggering admin password override."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_097",
      "categoryId": "admin_settings",
      "pageKey": "settings",
      "question": {
        "ar": "أين يتم تفعيل وضع التطوير والتحقق الفني؟",
        "en": "Where is Developer/Debug Mode toggled?"
      },
      "answer": {
        "ar": "في الإعدادات العامة للنظام ويسمح بتبديل المستخدمين السريع بالمحاكاة.",
        "en": "In Settings view, allowing mock user switches for dev purposes."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_098",
      "categoryId": "admin_settings",
      "pageKey": "data_quality",
      "question": {
        "ar": "كيف أتحقق من جودة وسلامة البيانات المدخلة بالـ DB؟",
        "en": "How do I run database data-quality checks?"
      },
      "answer": {
        "ar": "افتح صفحة تدقيق جودة البيانات لكشف الفراغات، التكرار، والخلل الهيكلي.",
        "en": "Navigate to Data Quality view to scan for blank rows or duplicate keys."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_099",
      "categoryId": "admin_settings",
      "pageKey": "admin_panel",
      "question": {
        "ar": "أين يتم الاحتفاظ بنسخ قاعدة البيانات الاحتياطية؟",
        "en": "Where are backups stored on the server?"
      },
      "answer": {
        "ar": "في مجلد backups المخصص على الخادم كملفات `.dump` مضغوطة ومؤرخة.",
        "en": "In the backups folder on the host as compressed `.dump` files."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_100",
      "categoryId": "admin_settings",
      "pageKey": "esign",
      "question": {
        "ar": "ما هو التوقيع الإلكتروني وكيف يعمل؟",
        "en": "What is E-Sign and how does it work?"
      },
      "answer": {
        "ar": "بوابة لتوقيع عقود العمل والاتفاقيات محاسبياً وإدارياً بشكل مشفر.",
        "en": "Encrypts and saves signatures on employee agreements."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_101",
      "categoryId": "admin_settings",
      "pageKey": "documents",
      "question": {
        "ar": "أين تدار ملفات وعقود الشركة الرسمية؟",
        "en": "Where are company official documents stored?"
      },
      "answer": {
        "ar": "في مكتبة المستندات التي توفر إمكانية الأرشفة والفرز بحسب الأقسام.",
        "en": "In Legal Document Library providing search filters per section."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_102",
      "categoryId": "finance_acct",
      "pageKey": "ar_ap",
      "question": {
        "ar": "سؤال متكرر رقم 102 حول استخدام الذمم المدينة والدائنة؟",
        "en": "Frequently Asked Question 102 regarding AR / AP Accounts operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ الذمم المدينة والدائنة بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the AR / AP Accounts registry."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_103",
      "categoryId": "finance_acct",
      "pageKey": "banking",
      "question": {
        "ar": "سؤال متكرر رقم 103 حول استخدام الربط والمطابقة البنكية؟",
        "en": "Frequently Asked Question 103 regarding Bank Reconciliation operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ الربط والمطابقة البنكية بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Bank Reconciliation registry."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_104",
      "categoryId": "finance_acct",
      "pageKey": "budgeting",
      "question": {
        "ar": "سؤال متكرر رقم 104 حول استخدام تخطيط الموازنات؟",
        "en": "Frequently Asked Question 104 regarding Budget Planner operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ تخطيط الموازنات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Budget Planner registry."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_105",
      "categoryId": "finance_acct",
      "pageKey": "tax_compliance",
      "question": {
        "ar": "سؤال متكرر رقم 105 حول استخدام الامتثال الضريبي؟",
        "en": "Frequently Asked Question 105 regarding Tax Compliance operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ الامتثال الضريبي بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Tax Compliance registry."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_106",
      "categoryId": "admin_settings",
      "pageKey": "import",
      "question": {
        "ar": "سؤال متكرر رقم 106 حول استخدام مركز استيراد البيانات؟",
        "en": "Frequently Asked Question 106 regarding Data Import Hub operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مركز استيراد البيانات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Data Import Hub registry."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_107",
      "categoryId": "hr_payroll",
      "pageKey": "timesheet",
      "question": {
        "ar": "سؤال متكرر رقم 107 حول استخدام جداول الحضور والدوام؟",
        "en": "Frequently Asked Question 107 regarding Employee Timesheets operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ جداول الحضور والدوام بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Employee Timesheets registry."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_108",
      "categoryId": "system_basics",
      "pageKey": "calendar",
      "question": {
        "ar": "سؤال متكرر رقم 108 حول استخدام تقويم العمليات؟",
        "en": "Frequently Asked Question 108 regarding Operations Calendar operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ تقويم العمليات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Operations Calendar registry."
      },
      "tags": [
        "seed",
        "system_basics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_109",
      "categoryId": "hr_payroll",
      "pageKey": "employees",
      "question": {
        "ar": "سؤال متكرر رقم 109 حول استخدام دليل الموظفين؟",
        "en": "Frequently Asked Question 109 regarding Employee Directory operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ دليل الموظفين بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Employee Directory registry."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_110",
      "categoryId": "hr_payroll",
      "pageKey": "people_ops",
      "question": {
        "ar": "سؤال متكرر رقم 110 حول استخدام إدارة الموارد البشرية؟",
        "en": "Frequently Asked Question 110 regarding People Operations operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ إدارة الموارد البشرية بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the People Operations registry."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_111",
      "categoryId": "hr_payroll",
      "pageKey": "employee_ui",
      "question": {
        "ar": "سؤال متكرر رقم 111 حول استخدام بوابة الموظف الذاتية؟",
        "en": "Frequently Asked Question 111 regarding Self-Service Portal operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ بوابة الموظف الذاتية بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Self-Service Portal registry."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_112",
      "categoryId": "hr_payroll",
      "pageKey": "employee_mobile",
      "question": {
        "ar": "سؤال متكرر رقم 112 حول استخدام حضور الهاتف المحمول؟",
        "en": "Frequently Asked Question 112 regarding Mobile Attendance operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ حضور الهاتف المحمول بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Mobile Attendance registry."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_113",
      "categoryId": "admin_settings",
      "pageKey": "command_center",
      "question": {
        "ar": "سؤال متكرر رقم 113 حول استخدام غرفة العمليات والموافقات؟",
        "en": "Frequently Asked Question 113 regarding Command Center operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ غرفة العمليات والموافقات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Command Center registry."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_114",
      "categoryId": "reports_analytics",
      "pageKey": "analytics",
      "question": {
        "ar": "سؤال متكرر رقم 114 حول استخدام التحليلات التنفيذية؟",
        "en": "Frequently Asked Question 114 regarding Executive Analytics operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ التحليلات التنفيذية بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Executive Analytics registry."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_115",
      "categoryId": "reports_analytics",
      "pageKey": "nl_reports",
      "question": {
        "ar": "سؤال متكرر رقم 115 حول استخدام تقارير العرض الذكي؟",
        "en": "Frequently Asked Question 115 regarding Smart View Reports operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ تقارير العرض الذكي بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Smart View Reports registry."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_116",
      "categoryId": "jarvis_ai",
      "pageKey": "intelligence",
      "question": {
        "ar": "سؤال متكرر رقم 116 حول استخدام لوحة تحكم الذكاء الاصطناعي؟",
        "en": "Frequently Asked Question 116 regarding AI Control Dashboard operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ لوحة تحكم الذكاء الاصطناعي بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the AI Control Dashboard registry."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_117",
      "categoryId": "saas_marketplace",
      "pageKey": "automation",
      "question": {
        "ar": "سؤال متكرر رقم 117 حول استخدام قواعد أتمتة سير العمل؟",
        "en": "Frequently Asked Question 117 regarding Workflow Rules operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ قواعد أتمتة سير العمل بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Workflow Rules registry."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_118",
      "categoryId": "messaging_connect",
      "pageKey": "whatsapp",
      "question": {
        "ar": "سؤال متكرر رقم 118 حول استخدام بوابة واتساب للرسائل؟",
        "en": "Frequently Asked Question 118 regarding WhatsApp Gateway operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ بوابة واتساب للرسائل بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the WhatsApp Gateway registry."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_119",
      "categoryId": "messaging_connect",
      "pageKey": "telegram",
      "question": {
        "ar": "سؤال متكرر رقم 119 حول استخدام ربط تليغرام التفاعلي؟",
        "en": "Frequently Asked Question 119 regarding Telegram Integration operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ ربط تليغرام التفاعلي بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Telegram Integration registry."
      },
      "tags": [
        "seed",
        "messaging_connect"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_120",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_queue",
      "question": {
        "ar": "سؤال متكرر رقم 120 حول استخدام طابور مهام الذكاء؟",
        "en": "Frequently Asked Question 120 regarding AI Task Queue operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ طابور مهام الذكاء بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the AI Task Queue registry."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_121",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_factory",
      "question": {
        "ar": "سؤال متكرر رقم 121 حول استخدام مصنع محتوى الذكاء؟",
        "en": "Frequently Asked Question 121 regarding AI Content Factory operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مصنع محتوى الذكاء بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the AI Content Factory registry."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_122",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_tools",
      "question": {
        "ar": "سؤال متكرر رقم 122 حول استخدام سجل أدوات الذكاء؟",
        "en": "Frequently Asked Question 122 regarding AI Action Registry operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ سجل أدوات الذكاء بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the AI Action Registry registry."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_123",
      "categoryId": "jarvis_ai",
      "pageKey": "ai_status",
      "question": {
        "ar": "سؤال متكرر رقم 123 حول استخدام حالة صحة جارفيس؟",
        "en": "Frequently Asked Question 123 regarding Jarvis Health Status operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ حالة صحة جارفيس بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Jarvis Health Status registry."
      },
      "tags": [
        "seed",
        "jarvis_ai"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_124",
      "categoryId": "diagnostics_tech",
      "pageKey": "deploy_ready",
      "question": {
        "ar": "سؤال متكرر رقم 124 حول استخدام فحص جاهزية النشر؟",
        "en": "Frequently Asked Question 124 regarding Deployment Checker operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ فحص جاهزية النشر بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Deployment Checker registry."
      },
      "tags": [
        "seed",
        "diagnostics_tech"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_125",
      "categoryId": "admin_settings",
      "pageKey": "admin_panel",
      "question": {
        "ar": "سؤال متكرر رقم 125 حول استخدام لوحة تحكم المدير؟",
        "en": "Frequently Asked Question 125 regarding Admin Control Panel operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ لوحة تحكم المدير بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Admin Control Panel registry."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_126",
      "categoryId": "admin_settings",
      "pageKey": "settings",
      "question": {
        "ar": "سؤال متكرر رقم 126 حول استخدام إعدادات النظام العامة؟",
        "en": "Frequently Asked Question 126 regarding System Configuration operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ إعدادات النظام العامة بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the System Configuration registry."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_127",
      "categoryId": "admin_settings",
      "pageKey": "multi_entity",
      "question": {
        "ar": "سؤال متكرر رقم 127 حول استخدام إدارة الشركات المتعددة؟",
        "en": "Frequently Asked Question 127 regarding Multi-Company Hub operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ إدارة الشركات المتعددة بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Multi-Company Hub registry."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_128",
      "categoryId": "saas_marketplace",
      "pageKey": "integration_hub",
      "question": {
        "ar": "سؤال متكرر رقم 128 حول استخدام مركز تكامل البرمجيات؟",
        "en": "Frequently Asked Question 128 regarding API Integration Hub operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مركز تكامل البرمجيات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the API Integration Hub registry."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_129",
      "categoryId": "admin_settings",
      "pageKey": "security_center",
      "question": {
        "ar": "سؤال متكرر رقم 129 حول استخدام مركز الحماية والأمان؟",
        "en": "Frequently Asked Question 129 regarding Security Settings operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مركز الحماية والأمان بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Security Settings registry."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_130",
      "categoryId": "data_governance",
      "pageKey": "data_quality",
      "question": {
        "ar": "سؤال متكرر رقم 130 حول استخدام تدقيق جودة البيانات؟",
        "en": "Frequently Asked Question 130 regarding Data Quality Audit operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ تدقيق جودة البيانات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Data Quality Audit registry."
      },
      "tags": [
        "seed",
        "data_governance"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_131",
      "categoryId": "diagnostics_tech",
      "pageKey": "route_health",
      "question": {
        "ar": "سؤال متكرر رقم 131 حول استخدام مستشار سلامة المسارات؟",
        "en": "Frequently Asked Question 131 regarding Route Integrity Auditor operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مستشار سلامة المسارات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Route Integrity Auditor registry."
      },
      "tags": [
        "seed",
        "diagnostics_tech"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_132",
      "categoryId": "reports_analytics",
      "pageKey": "scenario_planner",
      "question": {
        "ar": "سؤال متكرر رقم 132 حول استخدام مخطط سيناريوهات المستقبل؟",
        "en": "Frequently Asked Question 132 regarding Scenario Forecasting operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مخطط سيناريوهات المستقبل بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Scenario Forecasting registry."
      },
      "tags": [
        "seed",
        "reports_analytics"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_133",
      "categoryId": "saas_marketplace",
      "pageKey": "device_center",
      "question": {
        "ar": "سؤال متكرر رقم 133 حول استخدام مركز ربط الأجهزة والـ IoT؟",
        "en": "Frequently Asked Question 133 regarding Device Integration operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مركز ربط الأجهزة والـ IoT بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Device Integration registry."
      },
      "tags": [
        "seed",
        "saas_marketplace"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_134",
      "categoryId": "hr_payroll",
      "pageKey": "training_lms",
      "question": {
        "ar": "سؤال متكرر رقم 134 حول استخدام منصة تدريب الموظفين؟",
        "en": "Frequently Asked Question 134 regarding Staff LMS Training operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ منصة تدريب الموظفين بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Staff LMS Training registry."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_135",
      "categoryId": "data_governance",
      "pageKey": "risk_compliance",
      "question": {
        "ar": "سؤال متكرر رقم 135 حول استخدام المخاطر والامتثال التنظيمي؟",
        "en": "Frequently Asked Question 135 regarding Risk & Compliance operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ المخاطر والامتثال التنظيمي بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Risk & Compliance registry."
      },
      "tags": [
        "seed",
        "data_governance"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_136",
      "categoryId": "finance_acct",
      "pageKey": "procurement",
      "question": {
        "ar": "سؤال متكرر رقم 136 حول استخدام تخطيط المشتريات والتوريد؟",
        "en": "Frequently Asked Question 136 regarding Procurement Planner operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ تخطيط المشتريات والتوريد بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Procurement Planner registry."
      },
      "tags": [
        "seed",
        "finance_acct"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_137",
      "categoryId": "sales_crm",
      "pageKey": "supplier_portal",
      "question": {
        "ar": "سؤال متكرر رقم 137 حول استخدام بوابة الموردين؟",
        "en": "Frequently Asked Question 137 regarding Supplier Workspace operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ بوابة الموردين بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Supplier Workspace registry."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_138",
      "categoryId": "admin_settings",
      "pageKey": "approvals",
      "question": {
        "ar": "سؤال متكرر رقم 138 حول استخدام إدارة الموافقات والاعتمادات؟",
        "en": "Frequently Asked Question 138 regarding Approval Workflow Manager operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ إدارة الموافقات والاعتمادات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Approval Workflow Manager registry."
      },
      "tags": [
        "seed",
        "admin_settings"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_139",
      "categoryId": "sales_crm",
      "pageKey": "customer_portal",
      "question": {
        "ar": "سؤال متكرر رقم 139 حول استخدام بوابة العملاء الذاتية؟",
        "en": "Frequently Asked Question 139 regarding Client Workspace Portal operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ بوابة العملاء الذاتية بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Client Workspace Portal registry."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_140",
      "categoryId": "hr_payroll",
      "pageKey": "calculator",
      "question": {
        "ar": "سؤال متكرر رقم 140 حول استخدام حاسبة مستحقات الدوام؟",
        "en": "Frequently Asked Question 140 regarding Attendance Cost Calculator operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ حاسبة مستحقات الدوام بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Attendance Cost Calculator registry."
      },
      "tags": [
        "seed",
        "hr_payroll"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_141",
      "categoryId": "inventory_wh",
      "pageKey": "inventory",
      "question": {
        "ar": "سؤال متكرر رقم 141 حول استخدام إدارة المخزون والمستودعات؟",
        "en": "Frequently Asked Question 141 regarding Inventory Control operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ إدارة المخزون والمستودعات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Inventory Control registry."
      },
      "tags": [
        "seed",
        "inventory_wh"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_142",
      "categoryId": "sales_crm",
      "pageKey": "sales",
      "question": {
        "ar": "سؤال متكرر رقم 142 حول استخدام طلبات المبيعات ونقاط البيع؟",
        "en": "Frequently Asked Question 142 regarding Sales & POS Orders operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ طلبات المبيعات ونقاط البيع بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Sales & POS Orders registry."
      },
      "tags": [
        "seed",
        "sales_crm"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_143",
      "categoryId": "workshop_prod",
      "pageKey": "machines",
      "question": {
        "ar": "سؤال متكرر رقم 143 حول استخدام سجل المكائن والـ CNC؟",
        "en": "Frequently Asked Question 143 regarding CNC Machine Registry operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ سجل المكائن والـ CNC بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the CNC Machine Registry registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_144",
      "categoryId": "workshop_prod",
      "pageKey": "equipment",
      "question": {
        "ar": "سؤال متكرر رقم 144 حول استخدام سجل العُدد والأدوات؟",
        "en": "Frequently Asked Question 144 regarding Tool & Equipment Register operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ سجل العُدد والأدوات بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Tool & Equipment Register registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_145",
      "categoryId": "workshop_prod",
      "pageKey": "op_packs",
      "question": {
        "ar": "سؤال متكرر رقم 145 حول استخدام حزم العمليات الفنية؟",
        "en": "Frequently Asked Question 145 regarding Operational Packs operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ حزم العمليات الفنية بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Operational Packs registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_146",
      "categoryId": "workshop_prod",
      "pageKey": "qc_center",
      "question": {
        "ar": "سؤال متكرر رقم 146 حول استخدام مركز فحص الجودة والسلامة؟",
        "en": "Frequently Asked Question 146 regarding Quality Control Hub operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مركز فحص الجودة والسلامة بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Quality Control Hub registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_147",
      "categoryId": "workshop_prod",
      "pageKey": "sop",
      "question": {
        "ar": "سؤال متكرر رقم 147 حول استخدام مكتب فحص أدلة التشغيل؟",
        "en": "Frequently Asked Question 147 regarding SOP Verification Desk operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مكتب فحص أدلة التشغيل بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the SOP Verification Desk registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_148",
      "categoryId": "workshop_prod",
      "pageKey": "workflow",
      "question": {
        "ar": "سؤال متكرر رقم 148 حول استخدام مراحل الإنتاج المرئي؟",
        "en": "Frequently Asked Question 148 regarding Visual Production Stages operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ مراحل الإنتاج المرئي بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Visual Production Stages registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_149",
      "categoryId": "workshop_prod",
      "pageKey": "kanban",
      "question": {
        "ar": "سؤال متكرر رقم 149 حول استخدام لوحة كانبان الإنتاج؟",
        "en": "Frequently Asked Question 149 regarding Production Kanban operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ لوحة كانبان الإنتاج بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Production Kanban registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "faq_150",
      "categoryId": "workshop_prod",
      "pageKey": "task_manager",
      "question": {
        "ar": "سؤال متكرر رقم 150 حول استخدام موزع مهام الورشة؟",
        "en": "Frequently Asked Question 150 regarding Workshop Task Dispatcher operations?"
      },
      "answer": {
        "ar": "هذا شرح توضيحي للتعامل مع العمليات التشغيلية وتعديل البيانات بالواجهة المخصصة لـ موزع مهام الورشة بشكل آمن.",
        "en": "This covers basic troubleshooting steps and best practices for completing transactions inside the Workshop Task Dispatcher registry."
      },
      "tags": [
        "seed",
        "workshop_prod"
      ],
      "visibility": "internal",
      "jarvisReadable": true,
      "source": "seed",
      "updatedAt": "2026-07-03"
    }
  ],
  "articles": [
    {
      "id": "art_001",
      "type": "Module Guide",
      "categoryId": "finance_acct",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "finance_acct",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم المالية والحسابات",
        "en": "Overview Manual: Finance & Accounting"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم المالية والحسابات وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Finance & Accounting system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع المالية والحسابات. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Finance & Accounting. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_002",
      "type": "SOP",
      "categoryId": "finance_acct",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "finance_acct",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم المالية والحسابات",
        "en": "Standard Operating Procedure (SOP) for Finance & Accounting"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في المالية والحسابات وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Finance & Accounting."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في المالية والحسابات، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Finance & Accounting, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_003",
      "type": "Troubleshooting",
      "categoryId": "finance_acct",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "finance_acct",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل المالية والحسابات",
        "en": "Troubleshooting Runbook for Finance & Accounting"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام المالية والحسابات.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Finance & Accounting."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_004",
      "type": "Policy",
      "categoryId": "finance_acct",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "finance_acct",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم المالية والحسابات",
        "en": "Jarvis AI Governance & Security Policy for Finance & Accounting"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات المالية والحسابات.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Finance & Accounting data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات المالية والحسابات للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Finance & Accounting records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_005",
      "type": "Module Guide",
      "categoryId": "sales_crm",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "sales_crm",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم المبيعات والعملاء",
        "en": "Overview Manual: Sales & CRM"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم المبيعات والعملاء وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Sales & CRM system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع المبيعات والعملاء. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Sales & CRM. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_006",
      "type": "SOP",
      "categoryId": "sales_crm",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "sales_crm",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم المبيعات والعملاء",
        "en": "Standard Operating Procedure (SOP) for Sales & CRM"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في المبيعات والعملاء وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Sales & CRM."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في المبيعات والعملاء، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Sales & CRM, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_007",
      "type": "Troubleshooting",
      "categoryId": "sales_crm",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "sales_crm",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل المبيعات والعملاء",
        "en": "Troubleshooting Runbook for Sales & CRM"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام المبيعات والعملاء.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Sales & CRM."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_008",
      "type": "Policy",
      "categoryId": "sales_crm",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "sales_crm",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم المبيعات والعملاء",
        "en": "Jarvis AI Governance & Security Policy for Sales & CRM"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات المبيعات والعملاء.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Sales & CRM data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات المبيعات والعملاء للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Sales & CRM records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_009",
      "type": "Module Guide",
      "categoryId": "inventory_wh",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "inventory_wh",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم المستودعات والمخزون",
        "en": "Overview Manual: Inventory & Warehouses"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم المستودعات والمخزون وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Inventory & Warehouses system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع المستودعات والمخزون. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Inventory & Warehouses. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_010",
      "type": "SOP",
      "categoryId": "inventory_wh",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "inventory_wh",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم المستودعات والمخزون",
        "en": "Standard Operating Procedure (SOP) for Inventory & Warehouses"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في المستودعات والمخزون وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Inventory & Warehouses."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في المستودعات والمخزون، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Inventory & Warehouses, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_011",
      "type": "Troubleshooting",
      "categoryId": "inventory_wh",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "inventory_wh",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل المستودعات والمخزون",
        "en": "Troubleshooting Runbook for Inventory & Warehouses"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام المستودعات والمخزون.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Inventory & Warehouses."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_012",
      "type": "Policy",
      "categoryId": "inventory_wh",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "inventory_wh",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم المستودعات والمخزون",
        "en": "Jarvis AI Governance & Security Policy for Inventory & Warehouses"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات المستودعات والمخزون.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Inventory & Warehouses data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات المستودعات والمخزون للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Inventory & Warehouses records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_013",
      "type": "Module Guide",
      "categoryId": "hr_payroll",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "hr_payroll",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم الموارد البشرية والرواتب",
        "en": "Overview Manual: HR & Payroll"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم الموارد البشرية والرواتب وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the HR & Payroll system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع الموارد البشرية والرواتب. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for HR & Payroll. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_014",
      "type": "SOP",
      "categoryId": "hr_payroll",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "hr_payroll",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم الموارد البشرية والرواتب",
        "en": "Standard Operating Procedure (SOP) for HR & Payroll"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في الموارد البشرية والرواتب وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside HR & Payroll."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في الموارد البشرية والرواتب، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside HR & Payroll, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_015",
      "type": "Troubleshooting",
      "categoryId": "hr_payroll",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "hr_payroll",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل الموارد البشرية والرواتب",
        "en": "Troubleshooting Runbook for HR & Payroll"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام الموارد البشرية والرواتب.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in HR & Payroll."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_016",
      "type": "Policy",
      "categoryId": "hr_payroll",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "hr_payroll",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم الموارد البشرية والرواتب",
        "en": "Jarvis AI Governance & Security Policy for HR & Payroll"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات الموارد البشرية والرواتب.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding HR & Payroll data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات الموارد البشرية والرواتب للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for HR & Payroll records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_017",
      "type": "Module Guide",
      "categoryId": "workshop_prod",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "workshop_prod",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم الورشة والإنتاج",
        "en": "Overview Manual: Workshop & Production"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم الورشة والإنتاج وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Workshop & Production system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع الورشة والإنتاج. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Workshop & Production. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_018",
      "type": "SOP",
      "categoryId": "workshop_prod",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "workshop_prod",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم الورشة والإنتاج",
        "en": "Standard Operating Procedure (SOP) for Workshop & Production"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في الورشة والإنتاج وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Workshop & Production."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في الورشة والإنتاج، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Workshop & Production, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_019",
      "type": "Troubleshooting",
      "categoryId": "workshop_prod",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "workshop_prod",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل الورشة والإنتاج",
        "en": "Troubleshooting Runbook for Workshop & Production"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام الورشة والإنتاج.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Workshop & Production."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_020",
      "type": "Policy",
      "categoryId": "workshop_prod",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "workshop_prod",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم الورشة والإنتاج",
        "en": "Jarvis AI Governance & Security Policy for Workshop & Production"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات الورشة والإنتاج.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Workshop & Production data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات الورشة والإنتاج للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Workshop & Production records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_021",
      "type": "Module Guide",
      "categoryId": "projects_contracts",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "projects_contracts",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم المشاريع والعقود",
        "en": "Overview Manual: Projects & Contracts"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم المشاريع والعقود وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Projects & Contracts system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع المشاريع والعقود. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Projects & Contracts. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_022",
      "type": "SOP",
      "categoryId": "projects_contracts",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "projects_contracts",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم المشاريع والعقود",
        "en": "Standard Operating Procedure (SOP) for Projects & Contracts"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في المشاريع والعقود وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Projects & Contracts."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في المشاريع والعقود، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Projects & Contracts, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_023",
      "type": "Troubleshooting",
      "categoryId": "projects_contracts",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "projects_contracts",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل المشاريع والعقود",
        "en": "Troubleshooting Runbook for Projects & Contracts"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام المشاريع والعقود.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Projects & Contracts."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_024",
      "type": "Policy",
      "categoryId": "projects_contracts",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "projects_contracts",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم المشاريع والعقود",
        "en": "Jarvis AI Governance & Security Policy for Projects & Contracts"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات المشاريع والعقود.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Projects & Contracts data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات المشاريع والعقود للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Projects & Contracts records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_025",
      "type": "Module Guide",
      "categoryId": "fleet_fuel",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "fleet_fuel",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم الأسطول وحوكمة الوقود",
        "en": "Overview Manual: Fleet & Fuel Guard"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم الأسطول وحوكمة الوقود وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Fleet & Fuel Guard system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع الأسطول وحوكمة الوقود. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Fleet & Fuel Guard. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_026",
      "type": "SOP",
      "categoryId": "fleet_fuel",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "fleet_fuel",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم الأسطول وحوكمة الوقود",
        "en": "Standard Operating Procedure (SOP) for Fleet & Fuel Guard"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في الأسطول وحوكمة الوقود وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Fleet & Fuel Guard."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في الأسطول وحوكمة الوقود، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Fleet & Fuel Guard, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_027",
      "type": "Troubleshooting",
      "categoryId": "fleet_fuel",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "fleet_fuel",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل الأسطول وحوكمة الوقود",
        "en": "Troubleshooting Runbook for Fleet & Fuel Guard"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام الأسطول وحوكمة الوقود.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Fleet & Fuel Guard."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_028",
      "type": "Policy",
      "categoryId": "fleet_fuel",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "fleet_fuel",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم الأسطول وحوكمة الوقود",
        "en": "Jarvis AI Governance & Security Policy for Fleet & Fuel Guard"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات الأسطول وحوكمة الوقود.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Fleet & Fuel Guard data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات الأسطول وحوكمة الوقود للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Fleet & Fuel Guard records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_029",
      "type": "Module Guide",
      "categoryId": "messaging_connect",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "messaging_connect",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم الاتصالات والربط",
        "en": "Overview Manual: Messaging & Connectors"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم الاتصالات والربط وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Messaging & Connectors system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع الاتصالات والربط. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Messaging & Connectors. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_030",
      "type": "SOP",
      "categoryId": "messaging_connect",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "messaging_connect",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم الاتصالات والربط",
        "en": "Standard Operating Procedure (SOP) for Messaging & Connectors"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في الاتصالات والربط وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Messaging & Connectors."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في الاتصالات والربط، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Messaging & Connectors, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_031",
      "type": "Troubleshooting",
      "categoryId": "messaging_connect",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "messaging_connect",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل الاتصالات والربط",
        "en": "Troubleshooting Runbook for Messaging & Connectors"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام الاتصالات والربط.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Messaging & Connectors."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_032",
      "type": "Policy",
      "categoryId": "messaging_connect",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "messaging_connect",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم الاتصالات والربط",
        "en": "Jarvis AI Governance & Security Policy for Messaging & Connectors"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات الاتصالات والربط.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Messaging & Connectors data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات الاتصالات والربط للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Messaging & Connectors records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_033",
      "type": "Module Guide",
      "categoryId": "reports_analytics",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "reports_analytics",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم التقارير والتحليلات",
        "en": "Overview Manual: Reports & Analytics"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم التقارير والتحليلات وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Reports & Analytics system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع التقارير والتحليلات. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Reports & Analytics. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_034",
      "type": "SOP",
      "categoryId": "reports_analytics",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "reports_analytics",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم التقارير والتحليلات",
        "en": "Standard Operating Procedure (SOP) for Reports & Analytics"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في التقارير والتحليلات وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Reports & Analytics."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في التقارير والتحليلات، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Reports & Analytics, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_035",
      "type": "Troubleshooting",
      "categoryId": "reports_analytics",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "reports_analytics",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل التقارير والتحليلات",
        "en": "Troubleshooting Runbook for Reports & Analytics"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام التقارير والتحليلات.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Reports & Analytics."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_036",
      "type": "Policy",
      "categoryId": "reports_analytics",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "reports_analytics",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم التقارير والتحليلات",
        "en": "Jarvis AI Governance & Security Policy for Reports & Analytics"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات التقارير والتحليلات.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Reports & Analytics data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات التقارير والتحليلات للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Reports & Analytics records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_037",
      "type": "Module Guide",
      "categoryId": "saas_marketplace",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "saas_marketplace",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم المنصة وسوق التطبيقات",
        "en": "Overview Manual: SaaS & Marketplace"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم المنصة وسوق التطبيقات وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the SaaS & Marketplace system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع المنصة وسوق التطبيقات. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for SaaS & Marketplace. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_038",
      "type": "SOP",
      "categoryId": "saas_marketplace",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "saas_marketplace",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم المنصة وسوق التطبيقات",
        "en": "Standard Operating Procedure (SOP) for SaaS & Marketplace"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في المنصة وسوق التطبيقات وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside SaaS & Marketplace."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في المنصة وسوق التطبيقات، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside SaaS & Marketplace, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_039",
      "type": "Troubleshooting",
      "categoryId": "saas_marketplace",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "saas_marketplace",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل المنصة وسوق التطبيقات",
        "en": "Troubleshooting Runbook for SaaS & Marketplace"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام المنصة وسوق التطبيقات.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in SaaS & Marketplace."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_040",
      "type": "Policy",
      "categoryId": "saas_marketplace",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "saas_marketplace",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم المنصة وسوق التطبيقات",
        "en": "Jarvis AI Governance & Security Policy for SaaS & Marketplace"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات المنصة وسوق التطبيقات.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding SaaS & Marketplace data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات المنصة وسوق التطبيقات للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for SaaS & Marketplace records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_041",
      "type": "Module Guide",
      "categoryId": "admin_settings",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "admin_settings",
        "overview"
      ],
      "title": {
        "ar": "نظرة عامة على قسم الإدارة والأمان",
        "en": "Overview Manual: Admin & Security"
      },
      "summary": {
        "ar": "دليل تعريفي شامل يوضح أهداف وهيكل قسم الإدارة والأمان وكيفية تفاعل شاشاته مع بقية النظام.",
        "en": "Comprehensive guide reviewing workflows, primary data tables, and integration hooks for the Admin & Security system."
      },
      "content": {
        "ar": "يعتبر هذا القسم الركيزة الأساسية للتعامل مع الإدارة والأمان. يتصل القسم بقاعدة البيانات أودو 19 ومحرك المعالجة بالذاكرة لضمان سرعة تشغيل الفواتير والعمليات اليومية. يرجى قراءة دليل التشغيل SOP لمعرفة ضوابط الاستخدام اليومي.",
        "en": "This section serves as the core framework for Admin & Security. Fully aligned with Odoo 19 and OOMNI local caching, it streamlines transactions, updates records dynamically, and outputs secure audit trails."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_042",
      "type": "SOP",
      "categoryId": "admin_settings",
      "visibility": "internal",
      "jarvisReadable": true,
      "tags": [
        "admin_settings",
        "sop"
      ],
      "title": {
        "ar": "إجراءات العمل القياسية (SOP) لقسم الإدارة والأمان",
        "en": "Standard Operating Procedure (SOP) for Admin & Security"
      },
      "summary": {
        "ar": "الخطوات الفنية المعتمدة لتنفيذ العمليات اليومية في الإدارة والأمان وتجنب التكرار أو تضارب الصلاحيات.",
        "en": "Standard steps for operators, supervisors, and managers executing transactions inside Admin & Security."
      },
      "content": {
        "ar": "قبل بدء أي إجراء فني في الإدارة والأمان، يجب التحقق من صلاحياتك الحالية. تأكد من إكمال خطوة الفحص والتحقق قبل الضغط على ترحيل أو حفظ، لضمان كتابة سجل تدقيق سليم يمنع تسرب البيانات.",
        "en": "Before initiating transactions inside Admin & Security, check permissions and confirm inputs. Every action writes to audit logs to maintain strict governance."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_043",
      "type": "Troubleshooting",
      "categoryId": "admin_settings",
      "visibility": "technical",
      "jarvisReadable": true,
      "tags": [
        "admin_settings",
        "troubleshoot"
      ],
      "title": {
        "ar": "دليل إصلاح أخطاء ومشاكل الإدارة والأمان",
        "en": "Troubleshooting Runbook for Admin & Security"
      },
      "summary": {
        "ar": "حلول سريعة لأهم المشاكل الشائعة ورسائل الأخطاء التي تظهر أثناء استخدام الإدارة والأمان.",
        "en": "Recovery actions for common errors, database block messages, or layout render failures in Admin & Security."
      },
      "content": {
        "ar": "إذا واجهت تجمداً في الواجهة أو رسالة خطأ بالاتصال، قم بتحديث كاش المتصفح أو فحص حالة النشر. في حال حدوث تضارب في البيانات، قم باستدعاء فحص جودة البيانات data_quality لتصحيح التكرار تلقائياً.",
        "en": "For database validation blocks or connection errors, refresh state cache and check Deploy Ready status. Run Data Quality scanner to automatically resolve index duplicates."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    },
    {
      "id": "art_044",
      "type": "Policy",
      "categoryId": "admin_settings",
      "visibility": "management",
      "jarvisReadable": true,
      "tags": [
        "admin_settings",
        "policy",
        "jarvis"
      ],
      "title": {
        "ar": "سياسة حوكمة جارفيس والأمان لقسم الإدارة والأمان",
        "en": "Jarvis AI Governance & Security Policy for Admin & Security"
      },
      "summary": {
        "ar": "الحدود الأمنية المطبقة على مساعد الذكاء الاصطناعي جارفيس عند التعامل مع بيانات الإدارة والأمان.",
        "en": "Strict security boundaries governing Jarvis AI actions regarding Admin & Security data structures."
      },
      "content": {
        "ar": "يُسمح لجارفيس بقراءة وعرض سجلات وملخصات الإدارة والأمان للمستخدمين المصرح لهم فقط. يمنع الذكاء الاصطناعي تماماً من ترحيل الحسابات، أو تغيير الرواتب، أو تعديل المخزون دون موافقة بشرية خطية معتمدة.",
        "en": "Jarvis functions under a read-only policy for Admin & Security records. Direct mutations or transactional approvals by Jarvis are strictly blocked and route to the human approval center."
      },
      "source": "seed",
      "updatedAt": "2026-07-03"
    }
  ],
  "troubleshooting": [
    {
      "id": "trb_001",
      "categoryId": "finance_acct",
      "title": {
        "ar": "رسالة الخطأ: 'فشل مزامنة الحسابات'",
        "en": "Error: 'Ledger sync failed'"
      },
      "content": {
        "ar": "السبب: وجود قيد غير متوازن (مدين لا يساوي الدائن). الحل: افتح دفتر الحسابات وعدل القيمة غير المتطابقة قبل الحفظ.",
        "en": "Reason: Out-of-balance entries (debit != credit). Solution: Open the transaction edit form and balance journal items before saving."
      },
      "tags": [
        "troubleshoot",
        "finance_acct"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_002",
      "categoryId": "inventory_wh",
      "title": {
        "ar": "رسالة الخطأ: 'الرصيد المحسوب سالب'",
        "en": "Error: 'Negative stock balance blocked'"
      },
      "content": {
        "ar": "السبب: إخراج مواد أكثر من الرصيد الفعلي للمخزن. الحل: سجل وارد مخزني أولاً أو قم بعمل تسوية للجرد.",
        "en": "Reason: Attempting to issue quantities exceeding current stock levels. Solution: Post a purchase receipt or adjust records."
      },
      "tags": [
        "troubleshoot",
        "inventory_wh"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_003",
      "categoryId": "hr_payroll",
      "title": {
        "ar": "رسالة الخطأ: 'تداخل ساعات حضور الموظف'",
        "en": "Error: 'Overlapping timesheet timestamps'"
      },
      "content": {
        "ar": "السبب: تسجيل دوام الموظف في نفس الفترة مرتين عبر إكسل. الحل: احذف السطر المكرر من ملف الرفع وأعد المحاولة.",
        "en": "Reason: Employee timesheet contains overlapping intervals in the Excel file. Solution: Delete the duplicate row and re-upload."
      },
      "tags": [
        "troubleshoot",
        "hr_payroll"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_004",
      "categoryId": "diagnostics_tech",
      "title": {
        "ar": "المشكلة: 'عجز استدعاء خادم الويب للـ DB'",
        "en": "Issue: 'Web server connection to PostgreSQL offline'"
      },
      "content": {
        "ar": "السبب: توقف خدمة PostgreSQL بالخادم. الحل: تحقق من منفذ الاتصال بالدياجنوستك وأعد تشغيل قاعدة البيانات.",
        "en": "Reason: PostgreSQL database service stopped. Solution: Verify connection port in diagnostics and restart PG service."
      },
      "tags": [
        "troubleshoot",
        "diagnostics_tech"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_005",
      "categoryId": "sales_crm",
      "title": {
        "ar": "المشكلة: 'تكرار رقم اللوحة في العملاء'",
        "en": "Issue: 'Duplicate plate identifier in CRM'"
      },
      "content": {
        "ar": "السبب: محاولة إضافة عميل بلوحة مسجلة سابقاً. الحل: ابحث عن العميل المسجل لتحديث بياناته بدلاً من الإضافة.",
        "en": "Reason: Adding a vehicle plate already allocated. Solution: Search the database to update the existing record instead."
      },
      "tags": [
        "troubleshoot",
        "sales_crm"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_006",
      "categoryId": "reports_analytics",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: التقارير العامة (رمز الخطأ 06)",
        "en": "Resolve common issue in: General Reports (Error 06)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "reports_analytics"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_007",
      "categoryId": "finance_acct",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: الذمم المدينة والدائنة (رمز الخطأ 07)",
        "en": "Resolve common issue in: AR / AP Accounts (Error 07)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "finance_acct"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_008",
      "categoryId": "finance_acct",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: الربط والمطابقة البنكية (رمز الخطأ 08)",
        "en": "Resolve common issue in: Bank Reconciliation (Error 08)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "finance_acct"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_009",
      "categoryId": "finance_acct",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: تخطيط الموازنات (رمز الخطأ 09)",
        "en": "Resolve common issue in: Budget Planner (Error 09)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "finance_acct"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_010",
      "categoryId": "finance_acct",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: الامتثال الضريبي (رمز الخطأ 10)",
        "en": "Resolve common issue in: Tax Compliance (Error 10)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "finance_acct"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_011",
      "categoryId": "admin_settings",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: مركز استيراد البيانات (رمز الخطأ 11)",
        "en": "Resolve common issue in: Data Import Hub (Error 11)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "admin_settings"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_012",
      "categoryId": "hr_payroll",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: جداول الحضور والدوام (رمز الخطأ 12)",
        "en": "Resolve common issue in: Employee Timesheets (Error 12)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "hr_payroll"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_013",
      "categoryId": "system_basics",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: تقويم العمليات (رمز الخطأ 13)",
        "en": "Resolve common issue in: Operations Calendar (Error 13)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "system_basics"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_014",
      "categoryId": "hr_payroll",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: دليل الموظفين (رمز الخطأ 14)",
        "en": "Resolve common issue in: Employee Directory (Error 14)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "hr_payroll"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_015",
      "categoryId": "hr_payroll",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: إدارة الموارد البشرية (رمز الخطأ 15)",
        "en": "Resolve common issue in: People Operations (Error 15)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "hr_payroll"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_016",
      "categoryId": "hr_payroll",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: بوابة الموظف الذاتية (رمز الخطأ 16)",
        "en": "Resolve common issue in: Self-Service Portal (Error 16)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "hr_payroll"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_017",
      "categoryId": "hr_payroll",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: حضور الهاتف المحمول (رمز الخطأ 17)",
        "en": "Resolve common issue in: Mobile Attendance (Error 17)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "hr_payroll"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_018",
      "categoryId": "admin_settings",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: غرفة العمليات والموافقات (رمز الخطأ 18)",
        "en": "Resolve common issue in: Command Center (Error 18)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "admin_settings"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_019",
      "categoryId": "reports_analytics",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: التحليلات التنفيذية (رمز الخطأ 19)",
        "en": "Resolve common issue in: Executive Analytics (Error 19)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "reports_analytics"
      ],
      "updatedAt": "2026-07-03"
    },
    {
      "id": "trb_020",
      "categoryId": "reports_analytics",
      "title": {
        "ar": "إصلاح مشكلة شائعة في واجهة: تقارير العرض الذكي (رمز الخطأ 20)",
        "en": "Resolve common issue in: Smart View Reports (Error 20)"
      },
      "content": {
        "ar": "السبب: عدم مزامنة البيانات بالذاكرة أو نقص الصلاحية. الحل: قم بإعادة تحميل الصفحة وتأكد من امتلاك الصلاحية اللازمة من Security Center.",
        "en": "Reason: Local cache out-of-sync or unauthorized user role. Solution: Refresh view and verify permission levels inside the Security Center."
      },
      "tags": [
        "troubleshoot",
        "reports_analytics"
      ],
      "updatedAt": "2026-07-03"
    }
  ]
};
})();
