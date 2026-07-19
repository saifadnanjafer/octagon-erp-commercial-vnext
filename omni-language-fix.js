/**
 * OCTAGON OMNISYSTEM - runtime language layer.
 * Keeps Arabic clean, makes English switching real, and normalizes visible
 * product identity from Pentagon to Octagon without touching business records.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'octagon_language';
  const LEGACY_STORAGE_KEY = 'pentagon_language';
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const attrs = ['title', 'placeholder', 'aria-label', 'alt'];
  const skipTags = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
  const mojibakeRe = /(?:\u00d8|\u00d9|\u00db|\u00da|\u00c3|\u00c2|\u00e2|\u00f0|\ufffd)/;
  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  let observer = null;
  let repairQueued = false;

  const productPairs = [
    ['PENTAGON', 'OCTAGON'],
    ['Pentagon', 'Octagon'],
    ['pentagon', 'octagon'],
    ['بنتاغون', 'أوكتاغون'],
    ['بنتاجون', 'أوكتاغون']
  ];

  const arExact = new Map([
    ['OCTAGON PAYROLL', 'أوكتاغون للرواتب'],
    ['OCTAGON Payroll', 'أوكتاغون للرواتب'],
    ['OCTAGON ERP', 'أوكتاغون ERP'],
    ['Octagon ERP', 'أوكتاغون ERP'],
    ['OCTAGON SYSTEM', 'نظام أوكتاغون'],
    ['Octagon System V1', 'نظام أوكتاغون V1'],
    ['OMNISYSTEM V4.0', 'النظام الشامل V4.0'],
    ['Intelligence Panel', 'عقل النظام'],
    ['WhatsApp Ingest', 'واتساب'],
    ['Clear Cache', 'تنظيف الذاكرة'],
    ['System', 'النظام'],
    ['Admin', 'الإدارة'],
    ['Settings', 'الإعدادات'],
    ['Users', 'المستخدمون'],
    ['Backups', 'النسخ الاحتياطية'],
    ['Logs', 'السجلات'],
    ['History', 'السجل'],
    ['Search', 'بحث'],
    ['All', 'الكل'],
    ['Status', 'الحالة'],
    ['Source', 'المصدر'],
    ['Risk', 'الخطورة'],
    ['Before', 'قبل'],
    ['After', 'بعد'],
    ['Approvals', 'الموافقات'],
    ['Actor', 'المنفذ'],
    ['Command Center', 'مركز القيادة'],
    ['Customer Portal', 'بوابة العميل'],
    ['AI Control', 'تحكم الذكاء الصناعي'],
    ['AI', 'الذكاء الصناعي'],
    ['Export NDJSON', 'تصدير NDJSON'],
    ['No History events match the current filters.', 'لا توجد أحداث تطابق الفلاتر الحالية.']
  ]);

  const enExact = new Map([
    ['نظام الرواتب', 'Payroll System'],
    ['أوكتاغون للرواتب', 'Octagon Payroll'],
    ['نظام أوكتاغون V1', 'Octagon System V1'],
    ['النظام الشامل V4.0', 'OMNISYSTEM V4.0'],
    ['الحاسبة الذكية', 'Smart Calculator'],
    ['التايم شيت الذكي', 'Smart Timesheet'],
    ['تقويم الدوام', 'Attendance Calendar'],
    ['استيراد البيانات', 'Data Import'],
    ['الموظفين والأرصدة', 'Employees and Balances'],
    ['الموظفون والأرصدة', 'Employees and Balances'],
    ['الداشبورد المالي', 'Finance Dashboard'],
    ['قاصة الورشة', 'Workshop Cashbox'],
    ['المصروفات', 'Expenses'],
    ['الواردات', 'Income'],
    ['أرصدة العملاء', 'Customer Balances'],
    ['إنشاء وصل', 'Create Receipt'],
    ['التقرير النهائي', 'Final Report'],
    ['مركز القيادة', 'Command Center'],
    ['اللوحة التنفيذية', 'Execution Board'],
    ['مصمم العمليات', 'Workflow Designer'],
    ['باقات العمليات', 'Operation Packs'],
    ['تخطيط الإنتاج MRP', 'MRP Production Planning'],
    ['إدارة المهام', 'Task Manager'],
    ['مكتبة SOP', 'SOP Library'],
    ['مكتبة إجراءات التشغيل', 'SOP Library'],
    ['المكائن', 'Machines'],
    ['المخزون والمواد', 'Inventory and Materials'],
    ['معدات الورشة', 'Workshop Equipment'],
    ['مركز الجودة', 'Quality Center'],
    ['التحليلات والذكاء', 'Analytics and Intelligence'],
    ['التقارير الذكية', 'Smart Reports'],
    ['عقل النظام', 'System Brain'],
    ['محرك الأتمتة', 'Automation Engine'],
    ['واتساب', 'WhatsApp'],
    ['المبيعات والعملاء', 'Sales and Customers'],
    ['الفروع والعملات', 'Branches and Currencies'],
    ['الضرائب والفوترة', 'Tax and E-Invoicing'],
    ['لوحة الموظف', 'Employee Portal'],
    ['بوابة العميل', 'Customer Portal'],
    ['لوحة تحكم الأدمن', 'Admin Panel'],
    ['لوحة الإدارة', 'Admin Panel'],
    ['دليل الاستخدام', 'User Guide'],
    ['الدليل والمساعدة', 'Help and Manual'],
    ['المظهر', 'Theme'],
    ['نسخة احتياطية', 'Backup'],
    ['استعادة', 'Restore'],
    ['مسح البيانات', 'Clear Data'],
    ['تنظيف الذاكرة', 'Clear Cache'],
    ['تسجيل الدخول للنظام', 'System Login'],
    ['يرجى اختيار هويتك للوصول إلى الصلاحيات المخصصة', 'Choose your identity to access the assigned permissions']
  ]);

  const phraseArabic = [
    ['Customer Portal / External Experience', 'بوابة العميل والتجربة الخارجية'],
    ['Admin Panel Final Wire-Up', 'التوصيل النهائي للوحة الإدارة'],
    ['HR / Payroll AI Review Layer', 'طبقة مراجعة الرواتب والموارد البشرية بالذكاء الصناعي'],
    ['Foundation Hardening - Safe Local DB + Real AI Brain + Per-Tab AI', 'تقوية الأساس - قاعدة محلية آمنة + عقل ذكاء حقيقي + مساعد لكل تبويب'],
    ['Natural-language Reports', 'التقارير باللغة الطبيعية'],
    ['Tax / E-Invoicing Compliance', 'الضرائب والامتثال للفوترة الإلكترونية'],
    ['Manufacturing MRP II', 'تخطيط التصنيع MRP II'],
    ['Multi-Entity Control', 'تحكم الفروع والكيانات'],
    ['Operational analytics and completion snapshot', 'تحليلات تشغيلية ولقطة اكتمال'],
    ['AI backend provider runtime', 'تشغيل مزود الذكاء الصناعي من الخادم'],
    ['manual review', 'مراجعة يدوية'],
    ['Direct manager', 'المدير المباشر'],
    ['Live account', 'حساب مباشر'],
    ['Showing newest', 'عرض الأحدث'],
    ['Use filters for investigation', 'استخدم الفلاتر للتحقق']
  ];

  const phraseEnglish = [
    ['لوحة تحكم AI للنظام الكامل', 'Full System AI Control Dashboard'],
    ['هذه الصفحة تعرض بصراحة ماذا يستطيع الذكاء قراءةه، ماذا يستطيع كتابته بأمان، وما الذي ما زال يحتاج موافقة أو بناء قبل أن يصبح النظام Input/Output بواسطة AI.', 'This page clearly shows what AI can read, what it can safely write, and what still needs approval or engineering before the system becomes AI-driven input/output.'],
    ['إنشاء مهام لإغلاق الفجوات', 'Create Tasks To Close Gaps'],
    ['فتح الأتمتة', 'Open Automation'],
    ['فتح WhatsApp', 'Open WhatsApp'],
    ['تغطية القراءة', 'Read Coverage'],
    ['كتابة آمنة/مراجعة', 'Safe Write / Review'],
    ['قواعد أتمتة نشطة', 'Active Automation Rules'],
    ['فجوات حرجة', 'Critical Gaps'],
    ['مصفوفة AI Input / Output', 'AI Input / Output Matrix'],
    ['المصدر', 'Source'],
    ['السجلات', 'Records'],
    ['قراءة AI', 'AI Read'],
    ['كتابة AI', 'AI Write'],
    ['ملاحظة تشغيلية', 'Operational Note'],
    ['حالة الطبقات الذكية', 'Smart Layer Status'],
    ['الفجوات التي تمنع AI من التحكم بكل النظام', 'Gaps Preventing Full AI Control'],
    ['تحويلها لمهام متابعة', 'Turn Into Follow-Up Tasks'],
    ['فتح الصفحة', 'Open Page'],
    ['مهمة متابعة', 'Follow-Up Task'],
    ['جاهز', 'Ready'],
    ['غير جاهز', 'Not Ready'],
    ['مباشر آمن', 'Safe Direct'],
    ['محدود', 'Limited'],
    ['بمراجعة', 'Review Required'],
    ['مغلق', 'Closed'],
    ['لا توجد محادثات مسجلة بعد.', 'No saved conversations yet.'],
    ['اكتب أمراً وسيقرأ عقل النظام بياناتك الحقيقية ويرد عليك مباشرة بالعربية.', 'Write a command and the system brain will read real data and answer directly.'],
    ['محادثة عقل النظام', 'System Brain Chat'],
    ['إرسال لعقل النظام', 'Send To System Brain'],
    ['إغلاق فجوات AI', 'Close AI Gaps'],
    ['مركز قراءة النظام، المحادثة، القرارات، والصلاحيات. التنفيذ الحساس يبقى بموافقة واضحة.', 'System reading, chat, decisions, and permissions center. Sensitive execution stays approval-gated.']
  ];

  const pageLabels = {
    calculator: { ar: 'الحاسبة الذكية', en: 'Smart Calculator', icon: '🧮' },
    timesheet: { ar: 'التايم شيت الذكي', en: 'Smart Timesheet', icon: '📅' },
    calendar: { ar: 'تقويم الدوام', en: 'Attendance Calendar', icon: '🗓️' },
    import: { ar: 'استيراد البيانات', en: 'Data Import', icon: '📂' },
    employees: { ar: 'الموظفون والأرصدة', en: 'Employees and Balances', icon: '👥' },
    finance: { ar: 'الداشبورد المالي', en: 'Finance Dashboard', icon: '💹' },
    cashbox: { ar: 'قاصة الورشة', en: 'Workshop Cashbox', icon: '🏦' },
    expenses: { ar: 'المصروفات', en: 'Expenses', icon: '💸' },
    income: { ar: 'الواردات', en: 'Income', icon: '📥' },
    customers: { ar: 'أرصدة العملاء', en: 'Customer Balances', icon: '🧾' },
    receipt: { ar: 'إنشاء وصل', en: 'Create Receipt', icon: '🖨️' },
    report: { ar: 'التقرير النهائي', en: 'Final Report', icon: '📋' },
    command_center: { ar: 'مركز القيادة', en: 'Command Center', icon: '🎯' },
    kanban: { ar: 'اللوحة التنفيذية', en: 'Execution Board', icon: '📋' },
    workflow: { ar: 'مصمم العمليات', en: 'Workflow Designer', icon: '🔀' },
    op_packs: { ar: 'باقات العمليات', en: 'Operation Packs', icon: '📦' },
    mrp: { ar: 'تخطيط موارد التصنيع', en: 'Production Resource Planning', icon: '🏭' },
    task_manager: { ar: 'إدارة المهام', en: 'Task Manager', icon: '✅' },
    sop: { ar: 'مكتبة إجراءات التشغيل', en: 'SOP Library', icon: '📚' },
    machines: { ar: 'المكائن', en: 'Machines', icon: '⚙️' },
    inventory: { ar: 'المخزون والمواد', en: 'Inventory and Materials', icon: '🧱' },
    equipment: { ar: 'معدات الورشة', en: 'Workshop Equipment', icon: '🔨' },
    qc_center: { ar: 'مركز الجودة', en: 'Quality Center', icon: '🧪' },
    analytics: { ar: 'التحليلات والذكاء', en: 'Analytics and Intelligence', icon: '📈' },
    nl_reports: { ar: 'التقارير الذكية', en: 'Smart Reports', icon: '🔎' },
    intelligence: { ar: 'عقل النظام', en: 'System Brain', icon: '🧠' },
    automation: { ar: 'محرك الأتمتة', en: 'Automation Engine', icon: '⚡' },
    whatsapp: { ar: 'واتساب', en: 'WhatsApp', icon: '💬' },
    sales: { ar: 'المبيعات والعملاء', en: 'Sales and Customers', icon: '🤝' },
    multi_entity: { ar: 'الفروع والعملات', en: 'Branches and Currencies', icon: '🌐' },
    tax_compliance: { ar: 'الضرائب والفوترة', en: 'Tax and E-Invoicing', icon: '🧾' },
    employee_ui: { ar: 'لوحة الموظف', en: 'Employee Portal', icon: '🧑‍🔧' },
    customer_portal: { ar: 'بوابة العميل', en: 'Customer Portal', icon: '🏢' },
    admin_panel: { ar: 'لوحة الإدارة', en: 'Admin Panel', icon: '🛠️' },
    help_manual: { ar: 'الدليل والمساعدة', en: 'Help and Manual', icon: '❔' }
  };

  function getLanguage() {
    return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || 'ar';
  }

  function normalizeProduct(text) {
    let out = String(text ?? '');
    productPairs.forEach(([from, to]) => { out = out.replaceAll(from, to); });
    return out;
  }

  function scoreBad(value) {
    return (String(value || '').match(/[\u00d8\u00d9\u00db\u00da\u00c3\u00c2\u00e2\u00f0\ufffd]/g) || []).length;
  }

  function scoreArabic(value) {
    return (String(value || '').match(/[\u0600-\u06FF]/g) || []).length;
  }

  function decodeLatinUtf8(value) {
    const text = String(value || '');
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 255;
    return decoder.decode(bytes);
  }

  function repairMojibake(value) {
    const text = String(value ?? '');
    if (!text || !mojibakeRe.test(text)) return normalizeProduct(text);
    let best = text;
    for (let i = 0; i < 4; i += 1) {
      const decoded = decodeLatinUtf8(best);
      if (!decoded || decoded === best) break;
      if (scoreBad(decoded) >= scoreBad(best) && scoreArabic(decoded) <= scoreArabic(best)) break;
      best = decoded;
    }
    return normalizeProduct(best);
  }

  function applyMap(text, map) {
    const trimmed = text.trim();
    if (map.has(trimmed)) return text.replace(trimmed, map.get(trimmed));
    return text;
  }

  function applyPhrases(text, pairs) {
    let out = text;
    pairs
      .slice()
      .sort((a, b) => b[0].length - a[0].length)
      .forEach(([from, to]) => { out = out.replaceAll(from, to); });
    return out;
  }

  function translate(value, targetLang = getLanguage()) {
    let text = repairMojibake(value);
    if (!text.trim()) return text;
    if (targetLang === 'en') {
      text = applyMap(text, enExact);
      text = applyPhrases(text, phraseEnglish);
    } else {
      text = applyMap(text, arExact);
      text = applyPhrases(text, phraseArabic);
    }
    return normalizeProduct(text);
  }

  function shouldSkipElement(el) {
    return !el ||
      skipTags.has(el.tagName) ||
      el.closest?.('[data-no-language-fix], [data-no-translate], script, style, code, pre, textarea, .ptxai-stream');
  }

  function sourceForText(node) {
    if (!textOriginals.has(node)) textOriginals.set(node, repairMojibake(node.nodeValue));
    return textOriginals.get(node);
  }

  function sourceForAttr(el, attr) {
    let map = attrOriginals.get(el);
    if (!map) {
      map = {};
      attrOriginals.set(el, map);
    }
    if (!Object.prototype.hasOwnProperty.call(map, attr)) map[attr] = repairMojibake(el.getAttribute(attr));
    return map[attr];
  }

  function repairTextNode(node) {
    const parent = node.parentElement;
    if (shouldSkipElement(parent)) return;
    const source = sourceForText(node);
    const next = translate(source);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function repairElement(el) {
    if (!(el instanceof Element) || shouldSkipElement(el)) return;
    attrs.forEach(attr => {
      if (!el.hasAttribute(attr)) return;
      const source = sourceForAttr(el, attr);
      const next = translate(source);
      if (next !== el.getAttribute(attr)) el.setAttribute(attr, next);
    });
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) repairTextNode(el.firstChild);
  }

  function repairDom(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) repairTextNode(node);
      else repairElement(node);
      node = walker.nextNode();
    }
  }

  function applyKnownSurfaces() {
    const current = getLanguage();
    document.querySelectorAll('.logo-main').forEach(el => { el.textContent = current === 'en' ? 'Operations System' : 'نظام التشغيل'; });
    document.querySelectorAll('.logo-sub').forEach(el => { el.textContent = current === 'en' ? 'OCTAGON ERP' : 'نظام إدارة الأعمال'; });
    document.querySelectorAll('.sidebar-version').forEach(el => { el.textContent = current === 'en' ? 'Octagon ERP v5.0' : 'أوكتاغون — الإصدار 5.0'; });
    document.querySelectorAll('.nav-group-toggle span').forEach(el => {
      const raw = repairMojibake(el.textContent || '').toLowerCase();
      if (raw.includes('octagon') || raw.includes('pentagon') || raw.includes('أوكتاغون')) el.textContent = current === 'en' ? 'Octagon System V1' : 'نظام أوكتاغون V1';
      if (raw.includes('omni') || raw.includes('النظام الشامل') || raw.includes('أومني')) el.textContent = current === 'en' ? 'OMNISYSTEM V4.0' : 'النظام الشامل V4.0';
    });
    document.querySelectorAll('[data-page]').forEach(button => {
      const page = button.getAttribute('data-page');
      const meta = pageLabels[page];
      if (!meta) return;
      const label = meta[current];
      const labelEl = button.querySelector('.nav-label');
      if (labelEl) labelEl.textContent = label;
      const iconEl = button.querySelector('.nav-icon');
      if (iconEl && meta.icon) iconEl.textContent = meta.icon;
      button.setAttribute('title', label);
      button.setAttribute('aria-label', label);
    });
    document.querySelectorAll('#loginOverlay h2').forEach(el => { el.textContent = current === 'en' ? 'System Login' : 'تسجيل الدخول للنظام'; });
    document.querySelectorAll('#loginOverlay p').forEach(el => { el.textContent = current === 'en' ? 'Choose your identity to access the assigned permissions' : 'يرجى اختيار هويتك للوصول إلى الصلاحيات المخصصة'; });
  }

  let pendingRoots = new Set();
  // queueRepair(roots): if roots are given, repair ONLY those new subtrees (cheap).
  // Called with no args (language switch / boot) => full-document repair.
  function queueRepair(roots) {
    if (roots && roots.length) roots.forEach(r => pendingRoots.add(r));
    else pendingRoots.add('__ALL__');
    if (repairQueued) return;
    repairQueued = true;
    requestAnimationFrame(() => {
      repairQueued = false;
      const roots = pendingRoots;
      pendingRoots = new Set();
      if (roots.has('__ALL__')) {
        repairDom();
      } else {
        roots.forEach(node => {
          if (!node || !node.isConnected) return;
          if (node.nodeType === Node.TEXT_NODE) repairTextNode(node);
          else repairDom(node);
        });
      }
      applyKnownSurfaces();
      window.dispatchEvent(new CustomEvent('octagon:language-applied', { detail: { lang: getLanguage() } }));
    });
  }

  function updateToggle(lang = getLanguage()) {
    const btn = document.getElementById('omniLanguageToggle');
    if (!btn) return;
    btn.setAttribute('aria-label', lang === 'ar' ? 'Switch language to English' : 'تغيير اللغة إلى العربية');
    btn.innerHTML = `
      <i class="fa-solid fa-language"></i>
      <span class="ar-label">عربي</span>
      <span>/</span>
      <span class="en-label">EN</span>
    `;
  }

  function setLanguage(lang, options = {}) {
    const next = lang === 'en' ? 'en' : 'ar';
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    updateToggle(next);
    if (options.rerender !== false && typeof window.switchPage === 'function') {
      try {
        const page = typeof currentPage !== 'undefined' ? currentPage : null;
        if (page) window.switchPage(page);
      } catch (_) {}
    }
    queueRepair();
  }

  function mountToggle() {
    if (document.getElementById('omniLanguageToggle')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'omniLanguageToggle';
    btn.className = 'omni-language-toggle';
    btn.onclick = () => setLanguage(getLanguage() === 'ar' ? 'en' : 'ar');
    document.body.appendChild(btn);
    updateToggle();
  }

  function boot() {
    if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, localStorage.getItem(LEGACY_STORAGE_KEY));
    }
    mountToggle();
    setLanguage(getLanguage(), { rerender: false });
    repairDom();
    applyKnownSurfaces();
    if (observer) observer.disconnect();
    // Only react to ADDED nodes, and repair just those subtrees — not the whole
    // document. characterData is intentionally NOT observed: the 1s header clock
    // and live timesheet typing change text constantly, and re-scanning the whole
    // page on each was the main source of lag / "can only type 2 digits".
    observer = new MutationObserver((mutations) => {
      const roots = [];
      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        for (const n of m.addedNodes) {
          if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) roots.push(n);
        }
      }
      if (roots.length) queueRepair(roots);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.octagonRepairLanguage = () => { repairDom(); applyKnownSurfaces(); };
    window.omniRepairArabicText = window.octagonRepairLanguage;
    window.octagonSetLanguage = setLanguage;
    window.omniSetLanguage = setLanguage;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
