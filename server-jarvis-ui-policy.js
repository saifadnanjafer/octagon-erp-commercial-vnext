'use strict';

const DENIED_CLICK_MESSAGE = 'هذا الزر حساس ولا أقدر أضغطه كـ DOM click. استخدم أداة مخصصة/موافقة سيرفرية.';

const SAFE_ACTIONS = [
  ['navigate_to_page', 'navigation'],
  ['open_panel', 'open_panel'],
  ['switch_tab', 'switch_tab'],
  ['focus_search', 'focus_search'],
  ['apply_filter', 'apply_filter'],
  ['open_task_modal', 'open_modal'],
  ['open_customer_modal', 'open_modal'],
  ['scroll_to_section', 'scroll'],
  ['page.open.inventory', 'navigation'],
  ['inventory.filter.low_stock', 'apply_filter'],
  ['work_orders.open_wizard', 'open_modal'],
  ['work_orders.back_to_list', 'navigation'],
  ['work_orders.cancel_wizard', 'navigation']
];

const SAFE_PREFIXES = [
  ['page.open.', 'navigation'],
  ['navigate:', 'navigation'],
  ['tab:', 'switch_tab'],
  ['filter:', 'apply_filter'],
  ['search:', 'focus_search'],
  ['focus:', 'focus'],
  ['open-panel:', 'open_panel'],
  ['open-modal:', 'open_modal'],
  ['scroll:', 'scroll'],
  ['mrp.tab.', 'switch_tab'],
  ['qc.tab.', 'switch_tab']
];

const SAFE_ACTION_SET = new Set(SAFE_ACTIONS.map(item => item[0]));

const CRITICAL_RE = /execute_js|javascript|eval|run code|كود|سكربت|import.*database|overwrite.*database|reset.*database|clear.*database|delete all|wipe|format|hash.?chain|ledger posting|ترحيل قيود|اعتماد الرواتب|إغلاق الشهر|دفع راتب|final payroll|payroll finalization|permission|role|admin settings|صلاحية|صلاحيات|دور|أدوار|إعدادات المدير|قاعدة البيانات/i;

const SENSITIVE_RE = /save|submit|delete|remove|approve|reject|post|execute|confirm|pay|payroll|journal|ledger|inventory adjustment|settings|permission|user|employee|customer debt|payment|import|restore|publish|unpublish|archive|close period|finalize|حفظ|تقديم|تسجيل|حذف|إزالة|اعتماد|موافقة|رفض|ترحيل|تنفيذ|تشغيل|تأكيد|دفع|راتب|رواتب|قيد|دفتر|تسوية مخزون|تعديل مخزون|جرد|تسوية|إعدادات|صلاحية|مستخدم|موظف|دين|دفعة|استيراد|استعادة|نشر|إلغاء النشر|أرشفة|إغلاق/i;

const SAFE_LABEL_RE = /^(open|show|view|filter|search|switch|tab|focus|scroll|next|previous|today|close|cancel|back|expand|collapse|فتح|عرض|بحث|تصفية|تبويب|رجوع|إلغاء|اغلاق|إغلاق|التالي|السابق|اليوم|الشهر السابق|الشهر التالي|توسيع|طي)(\s|$|:|-)/i;

function clean(value, max = 180) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeUiAction(action) {
  const a = (action && typeof action === 'object') ? action : {};
  return {
    actionId: clean(a.action_id || a.actionId || a.id || a.action),
    label: clean(a.label || a.text || a.button || a.name),
    selector: clean(a.selector, 220),
    page: clean(a.page || a.currentPage || a.contextPage || (a.context && a.context.page)),
    kind: clean(a.kind || a.type || a.uiKind),
    visible: a.visible === false ? false : true,
    source: clean(a.source || 'jarvis_click_ui')
  };
}

function safePrefixMatch(actionId) {
  return SAFE_PREFIXES.find(item => actionId.startsWith(item[0])) || null;
}

function selectorLooksUnsafe(selector) {
  if (!selector) return false;
  if (selector.length > 220) return true;
  if (/script|html|body|iframe|object|embed/i.test(selector)) return true;
  if (/nth-child|nth-of-type|:has|,|>|~|\+/i.test(selector)) return true;
  if (/\[onclick/i.test(selector)) return true;
  return false;
}

function safeClassification(action, reason, category) {
  return {
    allowed: true,
    risk: 'safe',
    category: category || action.kind || 'ui_safe',
    reason,
    message: 'UI action allowed by server policy.',
    action
  };
}

function deniedClassification(action, risk, reason) {
  return {
    allowed: false,
    risk: risk || 'sensitive',
    category: risk || 'sensitive',
    reason,
    message: DENIED_CLICK_MESSAGE,
    action
  };
}

function classifyUiAction(rawAction) {
  const action = normalizeUiAction(rawAction);
  const haystack = [action.actionId, action.label, action.selector, action.kind].filter(Boolean).join(' ');

  if (!action.visible) return deniedClassification(action, 'critical', 'hidden_target_denied');
  if (!action.actionId && !action.label && !action.selector) return deniedClassification(action, 'critical', 'empty_ui_action_denied');
  if (CRITICAL_RE.test(haystack)) return deniedClassification(action, 'critical', 'critical_ui_action_denied');
  if (SENSITIVE_RE.test(haystack)) return deniedClassification(action, 'sensitive', 'sensitive_ui_action_denied');
  if (selectorLooksUnsafe(action.selector)) return deniedClassification(action, 'sensitive', 'unsafe_selector_denied');

  if (action.actionId) {
    if (SAFE_ACTION_SET.has(action.actionId)) {
      const item = SAFE_ACTIONS.find(row => row[0] === action.actionId);
      return safeClassification(action, 'safe_action_allowlist', item && item[1]);
    }
    const prefix = safePrefixMatch(action.actionId);
    if (prefix) return safeClassification(action, 'safe_action_prefix:' + prefix[0], prefix[1]);
    return deniedClassification(action, 'sensitive', 'unknown_action_id_denied');
  }

  if (action.selector && /^\.nav-btn\[data-page=["']?[a-z0-9_:-]+["']?\]$/i.test(action.selector)) {
    return safeClassification(action, 'safe_navigation_selector', 'navigation');
  }

  if (action.kind && ['navigation', 'open_panel', 'switch_tab', 'focus_search', 'apply_filter', 'open_modal', 'scroll'].includes(action.kind)) {
    if (SAFE_LABEL_RE.test(action.label)) return safeClassification(action, 'safe_kind_and_label', action.kind);
  }

  if (SAFE_LABEL_RE.test(action.label)) return safeClassification(action, 'safe_label_pattern', 'ui_safe');

  return deniedClassification(action, 'sensitive', 'unknown_ui_action_denied');
}

function isUiActionAllowed(action, context) {
  return classifyUiAction(Object.assign({}, action || {}, context || {})).allowed;
}

function listAllowedUiActions() {
  return {
    exact: SAFE_ACTIONS.map(item => ({ action: item[0], category: item[1] })),
    prefixes: SAFE_PREFIXES.map(item => ({ prefix: item[0], category: item[1] })),
    deniedMessage: DENIED_CLICK_MESSAGE
  };
}

module.exports = {
  DENIED_CLICK_MESSAGE,
  classifyUiAction,
  isUiActionAllowed,
  listAllowedUiActions
};
