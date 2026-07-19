/**
 * OCTAGON COMMERCIAL — Platform: entity UI registry (P0.6).
 *
 * `OX.entityUI` — client-side mirror of platform/server/entities.json.
 * Adding an entity tab = adding one config block here + one JSON block on the server.
 * Consumed by OX.crud.mountEntity(el, '<key>').
 *
 * Config shape (see ui-crud.js):
 *   { entity, label_ar, label_singular_ar,
 *     columns:[{key,label_ar,type?,badge?,render?,sortable?}],
 *     form:[{key,label_ar,type:text|number|date|select|textarea|relation,options?,relation?,required?,default?}],
 *     filters:[{key,label_ar,options:[{value,label_ar}]}],
 *     summaryCards:[{key:'total'|'status:<v>',label_ar,accent}] ,
 *     defaultSort:{key,dir} }
 *
 * NEW FILE — add-only.
 */
(function () {
  'use strict';

  window.OX = window.OX || {};

  /* ---------------------------------------------------------------- crm_lead */

  var LEAD_STATUS = {
    new:       { label: 'جديد',      color: 'blue' },
    contacted: { label: 'تم التواصل', color: 'cyan' },
    qualified: { label: 'مؤهل',      color: 'purple' },
    won:       { label: 'فوز',       color: 'green' },
    lost:      { label: 'خسارة',     color: 'red' }
  };

  var LEAD_SOURCES = [
    { value: 'phone',    label_ar: 'هاتف' },
    { value: 'website',  label_ar: 'الموقع الإلكتروني' },
    { value: 'social',   label_ar: 'وسائل التواصل' },
    { value: 'referral', label_ar: 'إحالة' },
    { value: 'exhibit',  label_ar: 'معرض' },
    { value: 'walkin',   label_ar: 'زيارة مباشرة' }
  ];

  var LEAD_SOURCE_LABEL = {};
  LEAD_SOURCES.forEach(function (s) { LEAD_SOURCE_LABEL[s.value] = s.label_ar; });

  var crmLead = {
    entity: 'crm_lead',
    label_ar: 'العملاء المحتملون (CRM)',
    label_singular_ar: 'عميل محتمل',
    defaultSort: { key: 'created_at', dir: 'desc' },
    columns: [
      { key: 'name', label_ar: 'الاسم' },
      { key: 'source', label_ar: 'المصدر',
        render: function (v) { return LEAD_SOURCE_LABEL[v] ? LEAD_SOURCE_LABEL[v] : (v == null || v === '' ? '—' : String(v).replace(/[&<>"']/g, '')); } },
      { key: 'status', label_ar: 'الحالة', badge: LEAD_STATUS },
      { key: 'expected_value', label_ar: 'القيمة المتوقعة', type: 'number' },
      { key: 'phone', label_ar: 'الهاتف' }
    ],
    form: [
      { key: 'name', label_ar: 'الاسم', type: 'text', required: true },
      { key: 'source', label_ar: 'المصدر', type: 'select', options: LEAD_SOURCES },
      { key: 'status', label_ar: 'الحالة', type: 'select', required: true, default: 'new',
        options: Object.keys(LEAD_STATUS).map(function (k) { return { value: k, label_ar: LEAD_STATUS[k].label }; }) },
      { key: 'expected_value', label_ar: 'القيمة المتوقعة', type: 'number' },
      { key: 'phone', label_ar: 'الهاتف', type: 'text' },
      { key: 'follow_up', label_ar: 'موعد المتابعة', type: 'date' },
      { key: 'notes', label_ar: 'ملاحظات', type: 'textarea' }
    ],
    filters: [
      { key: 'status', label_ar: 'الحالة',
        options: Object.keys(LEAD_STATUS).map(function (k) { return { value: k, label_ar: LEAD_STATUS[k].label }; }) },
      { key: 'source', label_ar: 'المصدر', options: LEAD_SOURCES }
    ],
    summaryCards: [
      { key: 'total', label_ar: 'إجمالي العملاء المحتملين', accent: 'blue' },
      { key: 'status:new', label_ar: 'جديد', accent: 'blue' },
      { key: 'status:contacted', label_ar: 'تم التواصل', accent: 'cyan' },
      { key: 'status:qualified', label_ar: 'مؤهل', accent: 'purple' },
      { key: 'status:won', label_ar: 'فوز', accent: 'green' },
      { key: 'status:lost', label_ar: 'خسارة', accent: 'red' }
    ]
  };

  /* ---------------------------------------------------------- helpdesk_ticket */

  var TICKET_STATUS = {
    new:         { label: 'جديدة',          color: 'blue' },
    in_progress: { label: 'قيد المعالجة',   color: 'cyan' },
    waiting:     { label: 'بانتظار العميل', color: 'yellow' },
    resolved:    { label: 'محلولة',         color: 'green' },
    closed:      { label: 'مغلقة',          color: 'gray' }
  };

  var TICKET_PRIORITY = {
    low:    { label: 'منخفضة', color: 'gray' },
    medium: { label: 'متوسطة', color: 'blue' },
    high:   { label: 'عالية',  color: 'yellow' },
    urgent: { label: 'عاجلة',  color: 'red' }
  };

  var helpdeskTicket = {
    entity: 'helpdesk_ticket',
    label_ar: 'تذاكر الدعم (خدمة العملاء)',
    label_singular_ar: 'تذكرة دعم',
    defaultSort: { key: 'created_at', dir: 'desc' },
    columns: [
      { key: 'subject', label_ar: 'الموضوع' },
      { key: 'customer_label', label_ar: 'العميل' },
      { key: 'priority', label_ar: 'الأولوية', badge: TICKET_PRIORITY },
      { key: 'status', label_ar: 'الحالة', badge: TICKET_STATUS }
    ],
    form: [
      { key: 'subject', label_ar: 'الموضوع', type: 'text', required: true },
      // Relation demo: searches /api/x/crm_lead/list?q= — switch relation.entity
      // to 'customer' once a customer entity lands in entities.json.
      { key: 'customer', label_ar: 'العميل', type: 'relation', relation: { entity: 'crm_lead', labelKey: 'name' } },
      { key: 'priority', label_ar: 'الأولوية', type: 'select', required: true, default: 'medium',
        options: Object.keys(TICKET_PRIORITY).map(function (k) { return { value: k, label_ar: TICKET_PRIORITY[k].label }; }) },
      { key: 'status', label_ar: 'الحالة', type: 'select', required: true, default: 'new',
        options: Object.keys(TICKET_STATUS).map(function (k) { return { value: k, label_ar: TICKET_STATUS[k].label }; }) },
      { key: 'due_date', label_ar: 'تاريخ الاستحقاق', type: 'date' },
      { key: 'description', label_ar: 'الوصف', type: 'textarea' }
    ],
    filters: [
      { key: 'status', label_ar: 'الحالة',
        options: Object.keys(TICKET_STATUS).map(function (k) { return { value: k, label_ar: TICKET_STATUS[k].label }; }) },
      { key: 'priority', label_ar: 'الأولوية',
        options: Object.keys(TICKET_PRIORITY).map(function (k) { return { value: k, label_ar: TICKET_PRIORITY[k].label }; }) }
    ],
    summaryCards: [
      { key: 'total', label_ar: 'إجمالي التذاكر', accent: 'blue' },
      { key: 'status:new', label_ar: 'جديدة', accent: 'blue' },
      { key: 'status:in_progress', label_ar: 'قيد المعالجة', accent: 'cyan' },
      { key: 'status:waiting', label_ar: 'بانتظار العميل', accent: 'yellow' },
      { key: 'status:resolved', label_ar: 'محلولة', accent: 'green' }
    ]
  };

  /* ----------------------------------------------------------------- product */

  var PRODUCT_CATEGORIES = [
    { value: 'wood',     label_ar: 'خشب' },
    { value: 'acrylic',  label_ar: 'أكريليك' },
    { value: 'metal',    label_ar: 'معدن' },
    { value: 'print',    label_ar: 'طباعة' },
    { value: 'service',  label_ar: 'خدمات' },
    { value: 'other',    label_ar: 'أخرى' }
  ];
  var PRODUCT_CATEGORY_LABEL = {};
  PRODUCT_CATEGORIES.forEach(function (c) { PRODUCT_CATEGORY_LABEL[c.value] = c.label_ar; });

  var PRODUCT_UOMS = [
    { value: 'piece', label_ar: 'قطعة' },
    { value: 'meter', label_ar: 'متر' },
    { value: 'sqm',   label_ar: 'متر مربع' },
    { value: 'kg',    label_ar: 'كيلوغرام' },
    { value: 'hour',  label_ar: 'ساعة' },
    { value: 'set',   label_ar: 'طقم' }
  ];
  var PRODUCT_UOM_LABEL = {};
  PRODUCT_UOMS.forEach(function (u) { PRODUCT_UOM_LABEL[u.value] = u.label_ar; });

  var product = {
    entity: 'product',
    label_ar: 'المنتجات والخدمات',
    label_singular_ar: 'منتج',
    defaultSort: { key: 'name', dir: 'asc' },
    columns: [
      { key: 'name', label_ar: 'اسم المنتج' },
      { key: 'sku', label_ar: 'SKU' },
      { key: 'category', label_ar: 'التصنيف',
        render: function (v) { return PRODUCT_CATEGORY_LABEL[v] ? PRODUCT_CATEGORY_LABEL[v] : (v == null || v === '' ? '—' : String(v).replace(/[&<>"']/g, '')); } },
      { key: 'price', label_ar: 'سعر البيع', type: 'number' },
      { key: 'cost', label_ar: 'التكلفة', type: 'number' },
      { key: 'uom', label_ar: 'الوحدة',
        render: function (v) { return PRODUCT_UOM_LABEL[v] ? PRODUCT_UOM_LABEL[v] : (v == null || v === '' ? '—' : String(v).replace(/[&<>"']/g, '')); } }
    ],
    form: [
      { key: 'name', label_ar: 'اسم المنتج', type: 'text', required: true },
      { key: 'sku', label_ar: 'SKU (رمز المنتج)', type: 'text' },
      { key: 'category', label_ar: 'التصنيف', type: 'select', options: PRODUCT_CATEGORIES },
      { key: 'price', label_ar: 'سعر البيع', type: 'number', required: true },
      { key: 'cost', label_ar: 'التكلفة', type: 'number' },
      { key: 'uom', label_ar: 'وحدة القياس', type: 'select', default: 'piece', options: PRODUCT_UOMS },
      { key: 'description', label_ar: 'الوصف', type: 'textarea' }
    ],
    filters: [
      { key: 'category', label_ar: 'التصنيف', options: PRODUCT_CATEGORIES },
      { key: 'uom', label_ar: 'الوحدة', options: PRODUCT_UOMS }
    ],
    summaryCards: [
      { key: 'total', label_ar: 'إجمالي المنتجات', accent: 'blue' }
    ]
  };

  /* ---------------------------------------------------------------- registry */

  window.OX.entityUI = Object.assign(window.OX.entityUI || {}, {
    crm_lead: crmLead,
    helpdesk_ticket: helpdeskTicket,
    product: product
  });
})();
