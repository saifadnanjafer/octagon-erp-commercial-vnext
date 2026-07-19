/**
 * OCTAGON ERP — AI GOVERNANCE CORE (Omni Brain Governance sprint).
 *
 * Central safety layer for the whole AI stack. AI-First, NOT AI-Only:
 *  - omni.aiSystem            → AI system manifest (philosophy, providers, gates)
 *  - omni.aiToolRegistry      → Tool Registry v2 (risk, scopes, approval, executors)
 *  - omni.aiControl.actionQueue → hardened approval queue (payload-aware execution)
 *  - omni.aiAuditLog          → append-only AI audit trail (keys always scrubbed)
 *  - omni.aiProviders         → provider descriptors (apiKeySource only, never keys)
 *  - detectAiPromptInjectionSignals() → lightweight prompt-injection guard
 *  - page ai_status (حالة الذكاء الصناعي) → visible system status panel
 *
 * Add-only module: wraps switchPage like every other module, registers gates the
 * Omni brain consults (window.OctagonAIGovernance.gateTool / .audit), and wraps
 * waiQueueApprove so approved payload-bearing actions actually execute with
 * revalidation. Never deletes existing tools, queue items, or localStorage keys.
 */
(function () {
  'use strict';

  /* ════════════════ helpers (same idioms as workshop-ai.js) ════════════════ */
  function O() { try { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { window.ensureOmni(); return omni; } } catch (_) {} return null; }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function nowIso() { return new Date().toISOString(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function userName() { try { const u = window.PentagonAuth && PentagonAuth.getCurrentUser && PentagonAuth.getCurrentUser(); if (u && u.name) return u.name; if (u && u.id) return u.id; } catch (_) {} return 'system'; }
  function groups() { try { if (window.PermissionService && window.PentagonAuth) { const g = window.PermissionService.resolveGroups(window.PentagonAuth.getCurrentUser()); if (Array.isArray(g)) return g; } } catch (_) {} return ['system.admin']; }
  function role() {
    const g = groups();
    if (g.includes('system.admin')) return 'system.admin';
    if (g.includes('workshop.manager')) return 'workshop.manager';
    if (g.includes('workshop.supervisor')) return 'workshop.supervisor';
    if (g.includes('finance.user') || g.includes('accountant')) return 'accountant';
    if (g.includes('designer')) return 'designer';
    if (g.includes('workshop.operator')) return 'workshop.operator';
    if (g.includes('customer')) return 'customer';
    return 'employee';
  }
  function isManager() { const r = role(); return r === 'system.admin' || r === 'workshop.manager'; }
  function isSupervisorPlus() { return isManager() || role() === 'workshop.supervisor'; }

  // debounced save so audit events do not hammer persistence
  let saveTimer = null;
  function save(now) {
    if (now) { try { if (typeof window.saveData === 'function') window.saveData(); } catch (_) {} return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { if (typeof window.saveData === 'function') window.saveData(); } catch (_) {} }, 1500);
  }

  /* ════════════════ AI AUDIT LOG (append-only, scrubbed) ════════════════ */
  const SECRET_KEYS = ['key', 'apikey', 'apiKey', 'openrouterKey', 'geminiKey', 'password', 'token', 'authorization', 'secret'];
  function scrub(d) {
    try {
      const s = JSON.parse(JSON.stringify(d || {}));
      (function walk(obj) {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(k => {
          if (SECRET_KEYS.some(sk => k.toLowerCase().includes(sk.toLowerCase()))) obj[k] = '[redacted]';
          else walk(obj[k]);
        });
      })(s);
      return s;
    } catch (_) { return {}; }
  }
  function normalizeAiAuditLog() {
    const o = O(); if (!o) return null;
    if (!Array.isArray(o.aiAuditLog)) o.aiAuditLog = [];
    return o.aiAuditLog;
  }
  function audit(eventType, data) {
    try {
      const log = normalizeAiAuditLog(); if (!log) return;
      log.push({ id: uid('aiaud'), event: String(eventType || 'ai.event'), at: nowIso(), by: userName(), role: role(), data: scrub(data) });
      const o = O();
      if (o.aiAuditLog.length > 4000) o.aiAuditLog = o.aiAuditLog.slice(-4000);
      // best-effort mirror into the platform audit service (async, non-blocking)
      try {
        const svc = window.OctagonServices && window.OctagonServices.audit;
        if (svc && typeof svc.createEvent === 'function') svc.createEvent(String(eventType), (data && (data.tool || data.id)) || '', scrub(data)).catch(() => {});
      } catch (_) {}
      save();
    } catch (_) {}
  }

  /* ════════════════ RISK CLASSIFICATION (sprint section 3) ════════════════ */
  const TOOL_RISK = {
    // LOW — read/navigate/deterministic reports
    navigate: 'low', navigate_page: 'low', set_language: 'low', switch_language: 'low',
    report_low_stock: 'low', report_missing_materials: 'low', report_overdue_tasks: 'low',
    report_maintenance: 'low', report_machine_maintenance: 'low', report_attention: 'low',
    report_manager_attention: 'low', morning_briefing: 'low', workshop_status: 'low',
    report_workshop_today: 'low', report_retail_today: 'low', report_pharmacy_today: 'low',
    report_clinic_today: 'low', report_restaurant_today: 'low', report_realestate_today: 'low',
    report_hotel_today: 'low', report_retail_alerts: 'low', report_pharmacy_alerts: 'low',
    summarize_work_order: 'low', work_order_blockers: 'low', explain_work_order_blocker: 'low',
    todays_urgent_jobs: 'low', wo_missing_materials: 'low', list_material_shortages: 'low',
    machine_conflicts: 'low', list_machine_conflicts: 'low', my_tasks_today: 'low', open_traveller_card: 'low',
    // MEDIUM — drafts / proposals / task creation (execute but only create reviewable artifacts)
    create_task: 'medium', create_customer: 'medium', report_problem: 'medium',
    propose_purchase: 'medium', propose_purchase_request: 'medium',
    propose_finance_review: 'medium', request_finance_review: 'medium',
    propose_payroll_review: 'medium', request_payroll_review: 'medium',
    propose_whatsapp_reply: 'medium', draft_whatsapp_reply: 'medium', draft_customer_whatsapp: 'medium',
    draft_customer_message: 'medium', draft_sop: 'medium', generate_sop_draft: 'medium',
    generate_dev_prompt: 'medium', generate_development_prompt: 'medium', propose_rework_action: 'medium',
    propose_close_work_order: 'medium',
    // HIGH — direct mutation of business data: approval queue only
    add_customer_debt: 'high', create_sales_receipt: 'high',
    record_customer_payment: 'high', create_purchase_expense: 'high',
    create_journal_entry: 'high', modify_material: 'high',
    modify_employee: 'high', post_finance: 'high', consume_material: 'high',
    change_price: 'high', send_whatsapp: 'high', waive_qc: 'high', close_work_order: 'high',
    archive_record: 'high', browser_search: 'high',
    // CRITICAL — code/computer control: disabled + approval + sandbox
    execute_js_mutation: 'critical', apply_code_patch: 'critical', sandbox_computer_control: 'critical',
    open_file: 'critical', download_file: 'critical', organize_folder: 'critical',
    prepare_design_file: 'critical', draft_email_with_attachment: 'critical',
    send_file_to_customer: 'critical', run_dev_agent: 'critical', apply_patch_in_sandbox: 'critical'
  };
  // tools that must NEVER execute directly — routed to the approval queue
  const APPROVAL_REQUIRED = [
    'add_customer_debt', 'create_sales_receipt', 'record_customer_payment',
    'create_purchase_expense', 'create_journal_entry', 'modify_material',
    'modify_employee', 'execute_js_mutation', 'post_finance', 'consume_material', 'change_price',
    'send_whatsapp', 'waive_qc', 'close_work_order', 'archive_record',
    'apply_code_patch', 'sandbox_computer_control', 'browser_search',
    'open_file', 'download_file', 'organize_folder', 'prepare_design_file',
    'draft_email_with_attachment', 'send_file_to_customer', 'run_dev_agent', 'apply_patch_in_sandbox'
  ];
  const GATE_TARGET = {
    add_customer_debt: 'finance', create_sales_receipt: 'finance',
    record_customer_payment: 'finance', create_purchase_expense: 'finance',
    create_journal_entry: 'finance', post_finance: 'finance',
    modify_employee: 'payroll', modify_material: 'inventory', consume_material: 'inventory',
    change_price: 'finance', send_whatsapp: 'whatsapp', waive_qc: 'qc', close_work_order: 'work_orders',
    execute_js_mutation: 'system_code', apply_code_patch: 'system_code'
  };

  function getToolRisk(name, declared) {
    if (TOOL_RISK[name]) return TOOL_RISK[name];
    if (declared === 'sensitive') return 'medium';
    if (declared === 'safe' || declared === 'low') return 'low';
    if (declared === 'high' || declared === 'critical' || declared === 'medium') return declared;
    return 'medium'; // unknown tools are never assumed safe
  }
  function getAiActionRisk(actionType) { return getToolRisk(String(actionType || ''), null); }
  /** Consulted by the Omni executor before every tool run. */
  function gateTool(name, tool) {
    const risk = getToolRisk(name, tool && tool.risk);
    const approvalRequired = APPROVAL_REQUIRED.indexOf(name) !== -1
      || !!(tool && tool.gated === true)
      || risk === 'high' || risk === 'critical';
    return { approvalRequired: approvalRequired, risk: risk, target: GATE_TARGET[name] || 'protected_system' };
  }

  /* ════════════════ PROMPT INJECTION GUARD (sprint section 10) ════════════════ */
  const INJECTION_PATTERNS = [
    { re: /ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions|تجاهل\s+(كل\s+)?التعليمات/i, sig: 'override_instructions', w: 2 },
    { re: /(reveal|show|print|اعرض|اكشف).{0,30}(api[\s_-]?key|secret|password|كلمة\s*السر|مفتاح)/i, sig: 'secret_request', w: 2 },
    { re: /api[\s_-]?key|openrouter\s*key|gemini\s*key/i, sig: 'secret_mention', w: 1 },
    { re: /(approve|نفّذ|نفذ|وافق).{0,30}(without|بدون|بلا).{0,15}(approval|موافقة)|bypass\s+approval|تجاوز\s+الموافقة/i, sig: 'approval_bypass', w: 2 },
    { re: /(execute|run|eval|نفذ|نفّذ).{0,20}(js|javascript|code|كود|سكربت)/i, sig: 'code_execution', w: 2 },
    { re: /you\s+are\s+now|act\s+as\s+(admin|system|developer)|انت\s+الآن|أنت\s+الآن/i, sig: 'role_hijack', w: 1 },
    { re: /system\s*prompt|developer\s*message|hidden\s*instructions/i, sig: 'prompt_probe', w: 1 },
    { re: /send\s+(it\s+)?without\s+(asking|approval)|أرسل\s+مباشرة\s+بدون/i, sig: 'auto_send', w: 2 }
  ];
  function detectAiPromptInjectionSignals(text) {
    const s = String(text || '');
    const signals = []; let weight = 0;
    INJECTION_PATTERNS.forEach(p => { if (p.re.test(s)) { signals.push(p.sig); weight += p.w; } });
    const riskLevel = weight >= 2 ? 'high' : weight === 1 ? 'medium' : 'low';
    if (signals.length) audit('ai.security.prompt_injection_detected', { riskLevel: riskLevel, signals: signals, sample: s.slice(0, 120) });
    return {
      riskLevel: riskLevel,
      signals: signals,
      safeSummary: signals.length ? ('رُصدت إشارات حقن أوامر: ' + signals.join('، ')) : 'لا إشارات حقن'
    };
  }
  window.detectAiPromptInjectionSignals = detectAiPromptInjectionSignals;

  /* ════════════════ AI SYSTEM MANIFEST (sprint section 4) ════════════════ */
  function normalizeAiSystem() {
    const o = O(); if (!o) return null;
    if (!o.aiSystem || typeof o.aiSystem !== 'object') o.aiSystem = {};
    const m = o.aiSystem;
    const def = (k, v) => { if (m[k] === undefined) m[k] = v; };
    def('version', '2.0');
    def('philosophy', 'الذكاء أولاً، لا الذكاء وحده');
    def('activeProvider', 'openrouter');
    def('fallbackProvider', 'gemini');
    def('deterministicFallbackEnabled', true);
    def('strictJsonPlannerEnabled', true);
    def('approvalGatesEnabled', true);
    def('contextGuardEnabled', true);
    def('promptInjectionGuardEnabled', true);
    def('toolRegistryVersion', 2);
    def('lastProviderCheck', '');
    def('lastHealthCheck', '');
    def('created_at', nowIso());
    m.updated_at = m.updated_at || nowIso();
    return m;
  }
  function getAiSystemManifest() { normalizeAiSystem(); return O() ? O().aiSystem : null; }
  function updateAiSystemManifest(changes) {
    const m = getAiSystemManifest(); if (!m) return null;
    Object.assign(m, changes || {}, { updated_at: nowIso() });
    save(); return m;
  }

  /* ════════════════ PROVIDER DESCRIPTORS (no keys, sprint section 5) ════════════════ */
  function normalizeAiProviders() {
    const o = O(); if (!o) return null;
    if (!Array.isArray(o.aiProviders)) o.aiProviders = [];
    const seed = [
      { id: 'openrouter', name: 'OpenRouter (DeepSeek/Qwen)', enabled: true, apiKeySource: 'localStorage:octagonAIProvider', model: 'deepseek/deepseek-chat', supportsText: true, supportsVision: false, supportsAudio: false, supportsToolPlanning: true, priority: 1 },
      { id: 'contactbox', name: 'ContactBox (Claude)', enabled: true, apiKeySource: 'localStorage:octagonAIProvider', model: 'claude-sonnet-4-6', supportsText: true, supportsVision: true, supportsAudio: false, supportsToolPlanning: true, priority: 2 },
      { id: 'gemini', name: 'Google Gemini', enabled: true, apiKeySource: 'app.js inline / localStorage', model: 'gemini-flash', supportsText: true, supportsVision: true, supportsAudio: true, supportsToolPlanning: true, priority: 3 },
      { id: 'openai', name: 'OpenAI (مستقبلاً)', enabled: false, apiKeySource: 'not configured', model: '', supportsText: true, supportsVision: true, supportsAudio: true, supportsToolPlanning: true, priority: 4 },
      { id: 'anthropic', name: 'Anthropic Claude (مستقبلاً)', enabled: false, apiKeySource: 'not configured', model: '', supportsText: true, supportsVision: true, supportsAudio: false, supportsToolPlanning: true, priority: 5 },
      { id: 'local', name: 'نموذج محلي (مستقبلاً)', enabled: false, apiKeySource: 'none (local)', model: '', supportsText: true, supportsVision: false, supportsAudio: false, supportsToolPlanning: false, priority: 6 },
      { id: 'deterministic', name: 'احتياطي حتمي (مفعّل دائماً)', enabled: true, apiKeySource: 'none', model: 'local rules + real data', supportsText: true, supportsVision: false, supportsAudio: false, supportsToolPlanning: false, priority: 99 }
    ];
    seed.forEach(s => {
      let p = o.aiProviders.find(x => x.id === s.id);
      if (!p) { p = Object.assign({ lastStatus: 'unknown', lastError: '', rateLimitNote: '', created_at: nowIso() }, s); o.aiProviders.push(p); }
      else Object.keys(s).forEach(k => { if (p[k] === undefined) p[k] = s[k]; });
      if (p.lastStatus === undefined) p.lastStatus = 'unknown';
      if (p.lastError === undefined) p.lastError = '';
      p.updated_at = nowIso();
    });
    return o.aiProviders;
  }

  /* ════════════════ TOOL REGISTRY V2 (sprint section 7 + 17 + 18) ════════════════ */
  // executorName: name inside JarvisBrain.tools (or alias wired below). '' = no executor yet (warning).
  const REQUIRED_TOOLS = [
    ['navigate_page', 'فتح صفحة', 'navigation', '', 'low', 'navigate', true],
    ['report_missing_materials', 'تقرير المواد الناقصة', 'deterministic_report', 'workshop', 'low', 'report_low_stock', true],
    ['report_overdue_tasks', 'تقرير المهام المتأخرة', 'deterministic_report', 'workshop', 'low', 'report_overdue_tasks', true],
    ['report_machine_maintenance', 'تقرير صيانة المكائن', 'deterministic_report', 'workshop', 'low', 'report_maintenance', true],
    ['report_manager_attention', 'ما يحتاج انتباه المدير', 'deterministic_report', 'workshop', 'low', 'report_attention', true],
    ['switch_language', 'تبديل اللغة', 'navigation', '', 'low', 'set_language', true],
    ['create_task', 'إنشاء مهمة', 'work_order_action', '', 'medium', 'create_task', true],
    ['create_customer', 'إنشاء عميل', 'finance_action', '', 'medium', 'create_customer', true],
    ['draft_whatsapp_reply', 'مسودة رد واتساب', 'customer_message_draft', '', 'medium', 'propose_whatsapp_reply', true],
    ['propose_purchase_request', 'اقتراح طلب شراء', 'inventory_action', '', 'medium', 'propose_purchase', true],
    ['request_finance_review', 'طلب مراجعة مالية', 'finance_action', '', 'medium', 'propose_finance_review', true],
    ['request_payroll_review', 'طلب مراجعة رواتب', 'payroll_action', '', 'medium', 'propose_payroll_review', true],
    ['report_workshop_today', 'ملخص الورشة اليوم', 'deterministic_report', 'workshop', 'low', 'morning_briefing', true],
    ['summarize_work_order', 'تلخيص أمر عمل', 'read_system_data', 'workshop', 'low', 'summarize_work_order', true],
    ['explain_work_order_blocker', 'شرح عوائق أمر العمل', 'read_system_data', 'workshop', 'low', 'work_order_blockers', true],
    ['draft_customer_message', 'مسودة رسالة زبون', 'customer_message_draft', 'workshop', 'medium', 'draft_customer_whatsapp', true],
    ['draft_sop', 'مسودة SOP', 'sop_draft', 'workshop', 'medium', '', true],
    ['list_material_shortages', 'قائمة نواقص المواد', 'deterministic_report', 'workshop', 'low', 'wo_missing_materials', true],
    ['list_machine_conflicts', 'قائمة تعارض المكائن', 'deterministic_report', 'workshop', 'low', 'machine_conflicts', true],
    ['propose_rework_action', 'اقتراح إجراء إعادة عمل', 'work_order_action', 'workshop', 'medium', '', true],
    ['generate_development_prompt', 'توليد prompt تطوير', 'development_prompt', '', 'medium', '', true],
    ['report_retail_today', 'ملخص المتجر اليوم', 'deterministic_report', 'retail', 'low', 'report_retail_today', true],
    ['report_pharmacy_today', 'ملخص الصيدلية اليوم', 'deterministic_report', 'pharmacy', 'low', 'report_pharmacy_today', true],
    ['report_clinic_today', 'ملخص العيادة اليوم', 'deterministic_report', 'clinic', 'low', 'report_clinic_today', true],
    ['report_restaurant_today', 'ملخص المطعم اليوم', 'deterministic_report', 'restaurant', 'low', 'report_restaurant_today', true],
    ['report_realestate_today', 'ملخص العقارات اليوم', 'deterministic_report', 'realestate', 'low', 'report_realestate_today', true],
    ['report_hotel_today', 'ملخص الفندق اليوم', 'deterministic_report', 'hotel', 'low', 'report_hotel_today', true],
    // legacy workshop-ai registry names — kept so old tool names survive any seed order
    ['read_workshop_state', 'قراءة حالة الورشة', 'read_system_data', 'workshop', 'low', 'workshop_status', true],
    ['generate_sop_draft', 'توليد مسودة SOP', 'sop_draft', 'workshop', 'medium', '', true],
    ['generate_customer_message', 'صياغة رسالة زبون (مسودة)', 'customer_message_draft', 'workshop', 'medium', '', true],
    ['generate_dev_prompt', 'توليد prompt تطوير', 'development_prompt', '', 'medium', '', true],
    // approval-gated direct-write tools (registered so the registry is honest about them)
    ['add_customer_debt', 'إضافة دين/دفعة عميل (موافقة)', 'finance_action', '', 'high', 'add_customer_debt', true],
    ['create_sales_receipt', 'إنشاء وصل مبيعات (موافقة)', 'finance_action', '', 'high', 'create_sales_receipt', true],
    ['record_customer_payment', 'تسجيل دفعة عميل (موافقة)', 'finance_action', '', 'high', 'record_customer_payment', true],
    ['create_purchase_expense', 'تسجيل مصروف شراء (موافقة)', 'finance_action', '', 'high', 'create_purchase_expense', true],
    ['create_journal_entry', 'قيد محاسبي مزدوج (موافقة)', 'finance_action', '', 'high', 'create_journal_entry', true],
    ['modify_material', 'تعديل مادة مخزون (موافقة)', 'inventory_action', '', 'high', 'modify_material', true],
    ['modify_employee', 'تعديل بيانات موظف (موافقة)', 'payroll_action', '', 'high', 'modify_employee', true],
    ['execute_js_mutation', 'تنفيذ JS على البيانات (حرج/موافقة)', 'computer_control_future', '', 'critical', 'execute_js_mutation', true]
  ];
  // FUTURE computer-control foundation (sprint 17): disabled, critical, sandbox.
  const FUTURE_TOOLS = [
    ['open_file', 'فتح ملف'], ['download_file', 'تنزيل ملف'], ['organize_folder', 'تنظيم مجلد'],
    ['browser_search', 'بحث عبر المتصفح'], ['prepare_design_file', 'تجهيز ملف تصميم'],
    ['draft_email_with_attachment', 'مسودة إيميل بمرفق'], ['send_file_to_customer', 'إرسال ملف لزبون'],
    ['run_dev_agent', 'تشغيل وكيل تطوير'], ['apply_patch_in_sandbox', 'تطبيق patch داخل sandbox'],
    // legacy high-risk names from the workshop-ai default registry
    ['sandbox_computer_control', 'تحكم بالحاسوب داخل sandbox'], ['apply_code_patch', 'تطبيق تعديل كود'],
    ['file_metadata_action', 'بيانات وصفية للملفات']
  ];
  function normalizeAiToolsRegistry() {
    const o = O(); if (!o) return null;
    if (!Array.isArray(o.aiToolRegistry)) o.aiToolRegistry = [];
    const reg = o.aiToolRegistry;
    // 1) upgrade EXISTING entries with missing v2 fields (never overwrite values)
    reg.forEach(t2 => {
      const def = (k, v) => { if (t2[k] === undefined) t2[k] = v; };
      def('arabicName', t2.name || ''); def('category', 'read_system_data'); def('verticalId', '');
      def('riskLevel', 'medium'); def('enabled', true);
      def('readScopes', []); def('writeScopes', []);
      def('requiredPermission', 'workshop.manager');
      def('approvalRequired', t2.riskLevel === 'high' || t2.riskLevel === 'critical');
      def('dryRunSupported', t2.dryRunSupport !== undefined ? !!t2.dryRunSupport : true);
      def('inputSchema', '{}'); def('outputSchema', '{}');
      def('executorName', ''); def('deterministicFallback', true); def('auditRequired', true);
      def('created_at', nowIso()); def('is_active', true);
      t2.updated_at = nowIso();
    });
    // 2) seed required tools that are not yet registered (by name)
    REQUIRED_TOOLS.forEach(r => {
      const [name, arabicName, category, verticalId, riskLevel, executorName, deterministic] = r;
      if (reg.some(x => x.name === name)) {
        const x = reg.find(y => y.name === name);
        if (!x.executorName && executorName) x.executorName = executorName;
        return;
      }
      reg.push({
        id: uid('tool'), name: name, arabicName: arabicName, description: arabicName,
        category: category, verticalId: verticalId, riskLevel: riskLevel,
        enabled: riskLevel !== 'critical',
        readScopes: ['workshop_operational'], writeScopes: riskLevel === 'low' ? [] : [category],
        requiredPermission: riskLevel === 'low' ? 'workshop.operator' : (riskLevel === 'medium' ? 'workshop.supervisor' : 'workshop.manager'),
        approvalRequired: riskLevel === 'high' || riskLevel === 'critical',
        dryRunSupported: true, inputSchema: '{}', outputSchema: '{}',
        executorName: executorName, deterministicFallback: !!deterministic, auditRequired: true,
        created_at: nowIso(), updated_at: nowIso(), is_active: true
      });
    });
    // 3) future computer-control registry: disabled by default, critical, sandbox-required
    FUTURE_TOOLS.forEach(f => {
      if (reg.some(x => x.name === f[0])) return;
      reg.push({
        id: uid('tool'), name: f[0], arabicName: f[1], description: f[1] + ' — أداة تحكم مستقبلية، مطفأة',
        category: 'computer_control_future', verticalId: '', riskLevel: 'critical',
        enabled: false, readScopes: [], writeScopes: ['computer'],
        requiredPermission: 'system.admin', approvalRequired: true,
        dryRunSupported: true, sandboxRequired: true, inputSchema: '{}', outputSchema: '{}',
        executorName: '', deterministicFallback: false, auditRequired: true,
        created_at: nowIso(), updated_at: nowIso(), is_active: true
      });
    });
    return reg;
  }
  /** executor present in the live brain? '' executorName ⇒ registered-but-warning (not broken). */
  function toolExecutorState(t2) {
    if (!t2.executorName) return 'warning';
    try {
      const T = window.JarvisBrain && window.JarvisBrain.tools;
      if (T && T[t2.executorName]) return 'ok';
    } catch (_) {}
    return 'warning';
  }

  /* Agent Catalog Foundation (Phase 7F): policy-first, dry-run only by default. */
  const AGENT_CATALOG_SEED = [
    {
      id: 'report_builder', name: 'Report Builder Agent', domain: 'reporting', riskLevel: 'medium',
      purpose: 'Build natural-language report drafts from approved ERP data sources.',
      allowedTools: ['report_workshop_today', 'report_missing_materials', 'report_overdue_tasks'],
      blockedTools: ['create_journal_entry', 'post_finance', 'modify_employee', 'delete_record', 'send_file_to_customer'],
      approvalTriggers: ['external_share', 'new_formula_write', 'customer_delivery'],
      dataSources: ['nl_reports', 'finance summaries', 'inventory summaries', 'workshop summaries'],
      outputFormat: 'report_draft_with_sources'
    },
    {
      id: 'executive_briefing', name: 'Executive Briefing Agent', domain: 'management', riskLevel: 'low',
      purpose: 'Summarize operational signals for managers without changing records.',
      allowedTools: ['report_workshop_today', 'report_manager_attention', 'report_overdue_tasks'],
      blockedTools: ['post_finance', 'modify_material', 'modify_employee', 'waive_qc'],
      approvalTriggers: ['send_to_external_channel'],
      dataSources: ['command_center', 'work_orders', 'approvals', 'ai_audit_log'],
      outputFormat: 'briefing_bullets'
    },
    {
      id: 'inventory_reorder', name: 'Inventory Reorder Agent', domain: 'inventory', riskLevel: 'medium',
      purpose: 'Suggest reorder needs and draft purchase requests.',
      allowedTools: ['report_missing_materials', 'list_material_shortages', 'propose_purchase_request'],
      blockedTools: ['modify_material', 'consume_material', 'post_finance', 'create_journal_entry'],
      approvalTriggers: ['purchase_request_create', 'supplier_message', 'stock_adjustment'],
      dataSources: ['inventory', 'warehouse_stock', 'procurement'],
      outputFormat: 'reorder_recommendation'
    },
    {
      id: 'bank_reconciliation', name: 'Bank Reconciliation Agent', domain: 'finance', riskLevel: 'high',
      purpose: 'Suggest bank matching and variance explanations; never posts journals directly.',
      allowedTools: ['request_finance_review'],
      blockedTools: ['create_journal_entry', 'post_finance', 'add_customer_debt', 'archive_record'],
      approvalTriggers: ['journal_entry_needed', 'bank_match_finalize', 'cash_movement'],
      dataSources: ['banking', 'cashbox', 'journal_preview'],
      outputFormat: 'reconciliation_suggestion'
    },
    {
      id: 'workshop_scheduling', name: 'Workshop Scheduling Agent', domain: 'workshop', riskLevel: 'medium',
      purpose: 'Recommend scheduling changes from jobs, machines, people, and blockers.',
      allowedTools: ['report_workshop_today', 'list_machine_conflicts', 'create_task'],
      blockedTools: ['close_work_order', 'waive_qc', 'consume_material'],
      approvalTriggers: ['locked_job_change', 'capacity_override', 'customer_commitment'],
      dataSources: ['work_orders', 'machines', 'tasks', 'attendance'],
      outputFormat: 'schedule_recommendation'
    },
    {
      id: 'qc_rework', name: 'QC/Rework Agent', domain: 'quality', riskLevel: 'medium',
      purpose: 'Explain QC failures and draft rework actions without passing or waiving QC.',
      allowedTools: ['summarize_work_order', 'explain_work_order_blocker', 'propose_rework_action'],
      blockedTools: ['waive_qc', 'close_work_order', 'modify_material'],
      approvalTriggers: ['qc_status_change', 'rework_cost', 'customer_acceptance'],
      dataSources: ['qc', 'rework', 'work_orders', 'attachments'],
      outputFormat: 'qc_rework_plan'
    },
    {
      id: 'contract_drafting', name: 'Contract Drafting Agent', domain: 'legal', riskLevel: 'high',
      purpose: 'Draft contract text and obligations for human legal review.',
      allowedTools: ['draft_sop', 'draft_customer_message'],
      blockedTools: ['send_file_to_customer', 'archive_record', 'post_finance', 'modify_employee'],
      approvalTriggers: ['final_issue', 'external_send', 'legal_approval'],
      dataSources: ['documents', 'customers', 'projects', 'contracts'],
      outputFormat: 'contract_draft_for_review'
    },
    {
      id: 'hr_leave', name: 'HR Leave Agent', domain: 'hr', riskLevel: 'medium',
      purpose: 'Check leave context and prepare manager-review recommendations.',
      allowedTools: ['request_payroll_review', 'create_task'],
      blockedTools: ['modify_employee', 'post_finance', 'create_journal_entry'],
      approvalTriggers: ['leave_approval', 'payroll_impact', 'attendance_correction'],
      dataSources: ['employees', 'attendance', 'timesheets', 'payroll_preview'],
      outputFormat: 'leave_review_packet'
    }
  ];

  function normalizeAiAgentsCatalog() {
    const o = O(); if (!o) return null;
    if (!o.aiAgents || typeof o.aiAgents !== 'object' || Array.isArray(o.aiAgents)) o.aiAgents = {};
    const root = o.aiAgents;
    if (!Array.isArray(root.catalog)) root.catalog = [];
    if (!Array.isArray(root.runs)) root.runs = [];
    if (!Array.isArray(root.approvals)) root.approvals = [];
    if (!Array.isArray(root.simulations)) root.simulations = [];
    root.policyVersion = root.policyVersion || 'phase7f-agent-catalog-v1';
    root.directHighRiskExecution = false;
    root.updated_at = nowIso();
    AGENT_CATALOG_SEED.forEach(seed => {
      let agent = root.catalog.find(a => a.id === seed.id);
      if (!agent) {
        agent = Object.assign({
          enabled: true,
          dryRunMode: true,
          simulationMode: true,
          humanReviewMode: true,
          auditRequired: true,
          currentUserEnforced: true,
          created_at: nowIso(),
          is_active: true
        }, seed);
        root.catalog.push(agent);
      } else {
        Object.keys(seed).forEach(k => { if (agent[k] === undefined) agent[k] = seed[k]; });
        if (agent.enabled === undefined) agent.enabled = true;
        if (agent.dryRunMode === undefined) agent.dryRunMode = true;
        if (agent.simulationMode === undefined) agent.simulationMode = true;
        if (agent.humanReviewMode === undefined) agent.humanReviewMode = true;
        if (agent.auditRequired === undefined) agent.auditRequired = true;
        if (agent.currentUserEnforced === undefined) agent.currentUserEnforced = true;
        if (agent.is_active === undefined) agent.is_active = true;
      }
      agent.updated_at = nowIso();
    });
    return root;
  }
  function listAiAgents() {
    const root = normalizeAiAgentsCatalog();
    return root ? root.catalog.filter(a => a.is_active !== false) : [];
  }
  function getAiAgentPolicy(agentId) {
    return listAiAgents().find(a => a.id === agentId) || null;
  }
  function buildAiAgentDryRun(agentId, context) {
    const agent = getAiAgentPolicy(agentId);
    if (!agent) return { ok: false, error: 'agent_not_found', agentId: agentId };
    const ctx = context || {};
    const highRiskBlocked = (agent.blockedTools || []).filter(tool => getToolRisk(tool) === 'high' || getToolRisk(tool) === 'critical');
    return {
      ok: true,
      mode: 'dry_run',
      canExecuteDirectly: false,
      agentId: agent.id,
      agentName: agent.name,
      currentUser: userName(),
      currentRole: role(),
      sourcePage: ctx.sourcePage || window.currentPage || '',
      allowedTools: (agent.allowedTools || []).slice(),
      blockedTools: (agent.blockedTools || []).slice(),
      approvalTriggers: (agent.approvalTriggers || []).slice(),
      dataSources: (agent.dataSources || []).slice(),
      outputFormat: agent.outputFormat || 'review_packet',
      highRiskBlockedTools: highRiskBlocked,
      reviewPath: 'dry-run -> human review -> approval queue when needed',
      result: 'No ERP data is mutated by this preview.'
    };
  }
  function recordAiAgentDryRun(agentId, context) {
    const root = normalizeAiAgentsCatalog();
    const preview = buildAiAgentDryRun(agentId, context);
    if (root && preview.ok) {
      root.simulations.unshift({ id: uid('aisim'), at: nowIso(), by: userName(), agentId: agentId, sourcePage: preview.sourcePage, preview: preview });
      if (root.simulations.length > 300) root.simulations = root.simulations.slice(0, 300);
      audit('ai.agent.dry_run_preview', { agentId: agentId, sourcePage: preview.sourcePage, blockedTools: preview.blockedTools });
      save();
    }
    return preview;
  }
  function proposeAiAgentAction(agentId, action) {
    const agent = getAiAgentPolicy(agentId);
    if (!agent) return { ok: false, error: 'agent_not_found' };
    const tool = (action && (action.toolName || action.actionType || action.tool)) || 'agent_action';
    const risk = getToolRisk(tool, action && action.riskLevel);
    const blocked = (agent.blockedTools || []).includes(tool) || risk === 'high' || risk === 'critical';
    const proposal = proposeAiAction(Object.assign({}, action || {}, {
      toolName: tool,
      actionType: tool,
      title: (agent.name || agent.id) + ': ' + (action && action.title ? action.title : tool),
      riskLevel: risk,
      requestedBy: 'agent:' + agent.id,
      requestedByRole: role(),
      sourcePage: (action && action.sourcePage) || window.currentPage || '',
      createdByAI: true,
      payload: Object.assign({}, (action && action.payload) || {}, { agentId: agent.id, blockedByAgentPolicy: blocked })
    }));
    const root = normalizeAiAgentsCatalog();
    if (root) {
      root.approvals.unshift({ id: uid('aiappr'), at: nowIso(), agentId: agent.id, toolName: tool, riskLevel: risk, queueId: proposal.id, blockedByAgentPolicy: blocked });
      if (root.approvals.length > 300) root.approvals = root.approvals.slice(0, 300);
    }
    audit('ai.agent.action_proposed', { agentId: agent.id, toolName: tool, riskLevel: risk, queueId: proposal.id, blockedByAgentPolicy: blocked });
    save();
    return { ok: true, queued: true, queueId: proposal.id, blockedByAgentPolicy: blocked, message: 'Agent action routed to approval queue; no direct execution.' };
  }

  /* ════════════════ ACTION QUEUE HARDENING (sprint section 8) ════════════════ */
  function queue() {
    try {
      if (typeof window.getAiControl === 'function') {
        const ai = window.getAiControl();
        if (!Array.isArray(ai.actionQueue)) ai.actionQueue = [];
        return ai.actionQueue;
      }
    } catch (_) {}
    const o = O(); if (!o) return [];
    if (!o.aiControl || typeof o.aiControl !== 'object') o.aiControl = {};
    if (!Array.isArray(o.aiControl.actionQueue)) o.aiControl.actionQueue = [];
    return o.aiControl.actionQueue;
  }
  function normalizeAiActionQueue() {
    const q = queue();
    q.forEach(a => {
      const def = (k, v) => { if (a[k] === undefined) a[k] = v; };
      def('id', uid('aiprop')); def('actionType', a.actionId || 'ai_action'); def('toolName', a.actionType || '');
      def('title', a.actionType || 'إجراء ذكاء'); def('reason', a.summary || '');
      def('riskLevel', a.risk || 'medium'); def('requestedBy', a.source || 'jarvis');
      def('requestedByRole', ''); def('createdByAI', true); def('sourcePage', '');
      def('sourceEntityType', ''); def('sourceEntityId', ''); def('affectedRecords', 0);
      def('beforePreview', ''); def('afterPreview', ''); def('payload', null);
      def('status', 'pending'); def('createdAt', nowIso());
      def('approvedBy', ''); def('approvedAt', ''); def('rejectedBy', ''); def('rejectedAt', '');
      def('executedAt', ''); def('executionLog', []); def('failureReason', ''); def('is_active', true);
    });
    return q;
  }
  function listPendingAiActions() { return normalizeAiActionQueue().filter(a => a.status === 'pending' && a.is_active !== false); }
  function canUserApproveAiAction(user, action) {
    const r = (action && (action.riskLevel || action.risk)) || getAiActionRisk(action && action.actionType);
    if (r === 'high' || r === 'critical') return isManager();
    return isSupervisorPlus();
  }
  function proposeAiAction(action) {
    const q = queue();
    const item = Object.assign({
      id: uid('aiprop'), actionType: 'ai_action', toolName: '', title: 'إجراء ذكاء',
      reason: '', riskLevel: getAiActionRisk(action && action.actionType),
      requestedBy: userName(), requestedByRole: role(), createdByAI: true,
      sourcePage: String(window.currentPage || ''), sourceEntityType: '', sourceEntityId: '',
      affectedRecords: 0, beforePreview: '', afterPreview: '', payload: null,
      status: 'pending', createdAt: nowIso(), approvedBy: '', approvedAt: '',
      rejectedBy: '', rejectedAt: '', executedAt: '', executionLog: [], failureReason: '', is_active: true
    }, action || {});
    item.risk = item.risk || item.riskLevel; // legacy field the existing queue UI reads
    q.unshift(item);
    audit('ai.action.proposed', { id: item.id, actionType: item.actionType, risk: item.riskLevel });
    save(); return item;
  }
  function approveAiAction(id) {
    const a = queue().find(x => x.id === id); if (!a) return { ok: false, message: 'الإجراء غير موجود' };
    if (a.status !== 'pending') return { ok: false, message: 'الإجراء ليس بانتظار الموافقة' };
    if (!canUserApproveAiAction(null, a)) { toast('هذا الإجراء يحتاج موافقة المدير قبل التنفيذ.', 'warning'); return { ok: false, message: 'صلاحية غير كافية' }; }
    a.status = 'approved'; a.approvedBy = userName(); a.approvedAt = nowIso();
    audit('ai.action.approved', { id: a.id, actionType: a.actionType });
    save(true);
    if (a.payload && a.payload.tool) return executeApprovedAiAction(id);
    return { ok: true, message: 'اعتُمد الإجراء' };
  }
  function rejectAiAction(id, reason) {
    const a = queue().find(x => x.id === id); if (!a) return { ok: false };
    if (!isSupervisorPlus()) { toast('الرفض يحتاج صلاحية مشرف/مدير', 'warning'); return { ok: false }; }
    a.status = 'rejected'; a.rejectedBy = userName(); a.rejectedAt = nowIso(); a.failureReason = reason || '';
    audit('ai.action.rejected', { id: a.id, actionType: a.actionType, reason: reason || '' });
    save(true); return { ok: true };
  }
  /** Executes an APPROVED payload-bearing action via the live Omni tool, with re-validation. */
  function executeApprovedAiAction(id) {
    const a = queue().find(x => x.id === id); if (!a) return { ok: false, message: 'غير موجود' };
    if (a.status !== 'approved') return { ok: false, message: 'الإجراء غير معتمد' };
    if (!Array.isArray(a.executionLog)) a.executionLog = []; // items queued by jarvis-brain lack this field
    // revalidate permission AT EXECUTION TIME — old approvals are not trusted blindly
    if (!canUserApproveAiAction(null, a)) {
      a.executionLog.push({ at: nowIso(), by: userName(), note: 'execution blocked — insufficient permission at execution time' });
      save(true); return { ok: false, message: 'صلاحية غير كافية وقت التنفيذ' };
    }
    const p = a.payload || {};
    if (!p.tool) { a.executionLog.push({ at: nowIso(), by: userName(), note: 'approved — manual execution required (no payload)' }); save(true); return { ok: true, message: 'معتمد — تنفيذ يدوي مطلوب' }; }
    // click_ui hardening sprint 2026-07-05:
    // Manager approval must not authorize an arbitrary browser DOM click. Legacy
    // queued click_ui records are revalidated by the server and should be denied
    // when sensitive/critical instead of falling through to T.click_ui.run().
    if (p.tool === 'click_ui') {
      const finishClick = (ok, message) => {
        a.status = ok ? 'executed' : 'failed';
        a.executedAt = nowIso();
        if (!ok) a.failureReason = message || 'click_ui denied by server policy';
        a.executionLog.push({ at: nowIso(), by: userName(), ok: ok, note: message || '' });
        audit('ai.action.executed', { id: a.id, tool: p.tool, ok: ok, via: 'server_click_ui_policy' });
        save(true);
        toast(ok ? ('نُفّذ click_ui عبر سياسة الخادم ✅ ' + (message || '')) : ('رُفض click_ui: ' + (message || '')), ok ? 'success' : 'error');
        return { ok: ok, message: message || '' };
      };
      fetch('/api/jarvis/execute-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: a.serverApprovalId || '', tool: p.tool, args: p.args || {}, clientActionId: a.id })
      }).then(r2 => r2.json()).then(resp => {
        const ok = !!(resp && resp.ok === true && resp.status === 'executed');
        finishClick(ok, ok ? (resp.message || '') : ((resp && (resp.error || resp.message)) || 'رفض الخادم تنفيذ generic click_ui'));
      }).catch(e => finishClick(false, 'بوابة الخادم غير متاحة: ' + String(e && e.message || e)));
      return { ok: true, message: 'قيد إعادة فحص click_ui عبر الخادم…' };
    }
    // ── SERVER-SIDE MUTATION SPRINT 2026-07-05 ───────────────────────────────
    // Server-enforced tools EXECUTE ON THE SERVER. POST /api/jarvis/execute-approved
    // re-checks the manager role + gate policy, runs the real mutation via
    // server-jarvis-tools.js against the source-of-truth DB, and returns the
    // executed result — NO grant, NO client-side mutation. The client only
    // refreshes its in-memory state from the server afterwards.
    if (window.JarvisBrain && typeof window.JarvisBrain.isServerEnforced === 'function'
        && window.JarvisBrain.isServerEnforced(p.tool)) {
      const finish = (ok, message) => {
        a.status = ok ? 'executed' : 'failed';
        a.executedAt = nowIso();
        if (!ok) a.failureReason = message || 'execution failed';
        a.executionLog.push({ at: nowIso(), by: userName(), ok: ok, note: message || '' });
        audit('ai.action.executed', { id: a.id, tool: p.tool, ok: ok, via: 'server_gate' });
        save(true);
        toast(ok ? ('نُفّذ الإجراء المعتمد على الخادم ✅ ' + (message || '')) : ('فشل التنفيذ: ' + (message || '')), ok ? 'success' : 'error');
        try { if (ok && typeof window.JarvisBrain.refreshServerState === 'function') window.JarvisBrain.refreshServerState(p.tool); } catch (_) {}
        try { if (window.currentPage === 'ai_queue' && typeof window.switchPage === 'function') window.switchPage('ai_queue'); } catch (_) {}
        return { ok: ok, message: message || '' };
      };
      fetch('/api/jarvis/execute-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: a.serverApprovalId || '', tool: p.tool, args: p.args || {}, clientActionId: a.id })
      }).then(r2 => r2.json()).then(resp => {
        const ok = !!(resp && resp.ok === true && resp.status === 'executed');
        finish(ok, ok ? (resp.message || '') : ((resp && (resp.error || resp.message)) || 'رفض الخادم إعادة التحقق من الإجراء'));
      }).catch(e => finish(false, 'بوابة الخادم غير متاحة: ' + String(e && e.message || e)));
      return { ok: true, message: 'قيد التنفيذ عبر الخادم…' };
    }
    const T = window.JarvisBrain && window.JarvisBrain.tools;
    const tool = T && T[p.tool];
    const runFn = tool && (typeof tool === 'function' ? tool : tool.run);
    if (typeof runFn !== 'function') { a.status = 'failed'; a.failureReason = 'executor missing: ' + p.tool; save(true); return { ok: false, message: 'منفّذ الأداة غير موجود' }; }
    try {
      const done = (r) => {
        const ok = !(r && r.ok === false);
        a.status = ok ? 'executed' : 'failed';
        a.executedAt = nowIso();
        if (!ok) a.failureReason = (r && r.message) || 'execution failed';
        a.executionLog.push({ at: nowIso(), by: userName(), ok: ok, note: (r && r.message) || '' });
        audit('ai.action.executed', { id: a.id, tool: p.tool, ok: ok });
        save(true);
        toast(ok ? ('نُفّذ الإجراء المعتمد ✅ ' + ((r && r.message) || '')) : ('فشل التنفيذ: ' + a.failureReason), ok ? 'success' : 'error');
        try { if (typeof window.waiQueueApprove === 'function' && window.currentPage === 'ai_queue' && typeof window.switchPage === 'function') window.switchPage('ai_queue'); } catch (_) {}
        return { ok: ok, message: (r && r.message) || '' };
      };
      const out = runFn.call(tool, p.args || {});
      if (out && typeof out.then === 'function') { out.then(done).catch(e => done({ ok: false, message: String(e && e.message || e) })); return { ok: true, message: 'قيد التنفيذ…' }; }
      return done(out);
    } catch (e) {
      a.status = 'failed'; a.failureReason = String(e && e.message || e);
      a.executionLog.push({ at: nowIso(), by: userName(), ok: false, note: a.failureReason });
      audit('ai.action.executed', { id: a.id, tool: p.tool, ok: false, error: a.failureReason });
      save(true); return { ok: false, message: a.failureReason };
    }
  }
  // Make the EXISTING queue UI execute approved jarvis payloads (with revalidation).
  function wireQueueExecution() {
    if (window.__aigovQueueWrapped) return true;
    if (typeof window.waiQueueApprove !== 'function') return false;
    const orig = window.waiQueueApprove;
    window.waiQueueApprove = function (id) {
      orig.apply(this, arguments);
      try {
        const a = queue().find(x => x.id === id);
        if (a && a.status === 'approved' && a.payload && a.payload.tool) executeApprovedAiAction(id);
      } catch (_) {}
    };
    window.__aigovQueueWrapped = true;
    return true;
  }

  /* ════════════════ other normalizers (sprint section 21) ════════════════ */
  function normalizeWorkshopMemory() {
    const o = O(); if (!o) return null;
    if (!Array.isArray(o.workshopMemory)) o.workshopMemory = [];
    o.workshopMemory.forEach(m => {
      const def = (k, v) => { if (m[k] === undefined) m[k] = v; };
      def('type', 'pattern'); def('title', ''); def('summary', ''); def('count', 1);
      def('sourceIds', []); def('recommendation', ''); def('severity', 'medium');
      def('reviewed_by_manager', false); def('created_at', nowIso()); def('updated_at', nowIso()); def('is_active', true);
    });
    return o.workshopMemory;
  }
  function normalizeAiDevelopmentFactory() {
    const o = O(); if (!o) return null;
    if (!Array.isArray(o.aiDevelopmentFactory)) o.aiDevelopmentFactory = [];
    o.aiDevelopmentFactory.forEach(r => {
      const def = (k, v) => { if (r[k] === undefined) r[k] = v; };
      def('status', 'idea'); def('risk', 'medium'); def('generatedPrompt', '');
      def('affectedFiles', []); def('testChecklist', []); def('rollbackPlan', '');
      def('created_at', nowIso()); def('is_active', true);
    });
    return o.aiDevelopmentFactory;
  }

  /* ════════════════ Omni alias wiring (sprint section 18) ════════════════ */
  // Registers the spec's canonical names as aliases of real deterministic executors.
  const TOOL_ALIASES = {
    navigate_page: 'navigate', switch_language: 'set_language',
    report_missing_materials: 'report_low_stock', report_machine_maintenance: 'report_maintenance',
    report_manager_attention: 'report_attention', report_workshop_today: 'morning_briefing',
    list_material_shortages: 'wo_missing_materials', list_machine_conflicts: 'machine_conflicts',
    explain_work_order_blocker: 'work_order_blockers',
    report_retail_today: 'report_retail_alerts', report_pharmacy_today: 'report_pharmacy_alerts',
    draft_customer_message: 'draft_customer_whatsapp'
  };
  function wireJarvisAliases() {
    try {
      const T = window.JarvisBrain && window.JarvisBrain.tools; if (!T) return false;
      let wired = true;
      Object.keys(TOOL_ALIASES).forEach(n => {
        if (T[n]) return;
        if (T[TOOL_ALIASES[n]]) T[n] = T[TOOL_ALIASES[n]];
        else wired = false; // source not loaded yet — retry later
      });
      return wired;
    } catch (_) { return false; }
  }

  /* ════════════════ AI SYSTEM HEALTH (sprint section 4) ════════════════ */
  function getAiSystemHealth() {
    const m = getAiSystemManifest() || {};
    let provider = null; try { provider = window.OctagonAI && window.OctagonAI.status && window.OctagonAI.status(); } catch (_) {}
    const reg = normalizeAiToolsRegistry() || [];
    const pend = listPendingAiActions();
    const log = normalizeAiAuditLog() || [];
    const agents = listAiAgents();
    const brainTools = (window.JarvisBrain && window.JarvisBrain.tools) ? Object.keys(window.JarvisBrain.tools).length : 0;
    const warnings = reg.filter(t2 => t2.is_active !== false && toolExecutorState(t2) === 'warning' && t2.category !== 'computer_control_future');
    const health = {
      philosophy: m.philosophy,
      activeProvider: (provider && provider.activeProvider) || m.activeProvider || 'none',
      model: (provider && provider.model) || '',
      fallbackProvider: (provider && provider.fallbackProvider) || m.fallbackProvider || 'deterministic',
      deterministicFallbackEnabled: true,
      approvalGatesEnabled: m.approvalGatesEnabled !== false,
      contextGuardEnabled: typeof window.buildWorkshopAiContext === 'function',
      injectionGuardEnabled: true,
      brainLoaded: !!(window.JarvisBrain && window.JarvisBrain.handle),
      brainVersion: (window.JarvisBrain && window.JarvisBrain.version) || '—',
      brainToolsCount: brainTools,
      registryToolsCount: reg.filter(t2 => t2.is_active !== false).length,
      agentCatalogCount: agents.length,
      dryRunAgents: agents.filter(a => a.dryRunMode !== false).length,
      registryWarnings: warnings.map(w => w.name),
      pendingActions: pend.length,
      failedProviderCalls: (provider && provider.failCount) || 0,
      lastSuccessfulAiResponse: (provider && provider.lastSuccessAt) || '',
      lastProviderError: (provider && provider.lastError) || '',
      auditEvents: log.length,
      checkedAt: nowIso()
    };
    m.lastHealthCheck = health.checkedAt;
    return health;
  }

  /* ════════════════ AI SYSTEM STATUS PAGE — حالة الذكاء الصناعي ════════════════ */
  function pill(txt, cls) { return '<span class="aigov-pill ' + (cls || 'muted') + '">' + esc(txt) + '</span>'; }
  function riskPill(r) { return pill(({ low: 'آمن', medium: 'يحتاج موافقة', high: 'عالي الخطورة', critical: 'حرج' }[r] || r), ({ low: 'ok', medium: 'warn', high: 'bad', critical: 'bad' }[r] || 'muted')); }
  function statusHtml() {
    const h = getAiSystemHealth();
    const m = getAiSystemManifest() || {};
    const providers = normalizeAiProviders() || [];
    let pstat = null; try { pstat = window.OctagonAI && window.OctagonAI.status && window.OctagonAI.status(); } catch (_) {}
    const reg = normalizeAiToolsRegistry() || [];
    const agents = listAiAgents();
    const log = (normalizeAiAuditLog() || []).slice(-15).reverse();
    const row = (l, v) => '<div class="aigov-row"><span>' + l + '</span><span>' + v + '</span></div>';
    const agentTools = (items) => '<div class="aigov-chip-list">' + (items || []).slice(0, 4).map(x => '<code>' + esc(x) + '</code>').join('') + ((items || []).length > 4 ? '<span class="aigov-muted">+' + ((items || []).length - 4) + '</span>' : '') + '</div>';
    const agentRows = agents.map(a => '<tr>'
      + '<td><strong>' + esc(a.name) + '</strong><div class="aigov-muted">' + esc(a.purpose || '') + '</div></td>'
      + '<td>' + esc(a.domain || '') + '</td>'
      + '<td>' + riskPill(a.riskLevel || 'medium') + '</td>'
      + '<td>' + ((a.dryRunMode !== false && a.humanReviewMode !== false) ? pill('dry-run + review', 'ok') : pill('needs review', 'warn')) + '</td>'
      + '<td>' + agentTools(a.allowedTools) + '</td>'
      + '<td>' + agentTools(a.blockedTools) + '</td>'
      + '</tr>').join('');
    const byRisk = { low: 0, medium: 0, high: 0, critical: 0 };
    reg.forEach(t2 => { if (t2.is_active !== false) byRisk[t2.riskLevel] = (byRisk[t2.riskLevel] || 0) + 1; });
    return ''
      + '<div class="aigov-grid">'
      // manifest + health
      + '<div class="aigov-card"><div class="aigov-title">🧠 بيان النظام الذكي</div>'
      + row('الفلسفة', pill(m.philosophy || 'الذكاء أولاً، لا الذكاء وحده', 'ai'))
      + row('المزوّد الفعّال', pill(h.activeProvider + (h.model ? ' · ' + h.model : ''), h.activeProvider === 'none' ? 'warn' : 'ai'))
      + row('المزوّد الاحتياطي', pill(h.fallbackProvider, 'muted'))
      + row('الاحتياطي الحتمي', pill('فعّال دائماً', 'ok'))
      + row('بوابات الموافقة', h.approvalGatesEnabled ? pill('فعّالة', 'ok') : pill('مطفأة', 'bad'))
      + row('حارس السياق (الأدوار)', h.contextGuardEnabled ? pill('فعّال', 'ok') : pill('غير محمّل', 'warn'))
      + row('حارس حقن الأوامر', pill('فعّال', 'ok'))
      + row('دماغ أومني', h.brainLoaded ? pill('محمّل v' + h.brainVersion, 'ok') : pill('احتياطي حتمي', 'warn'))
      + row('آخر رد ناجح', pill(h.lastSuccessfulAiResponse ? h.lastSuccessfulAiResponse.slice(0, 19).replace('T', ' ') : '—', h.lastSuccessfulAiResponse ? 'ok' : 'muted'))
      + row('فشل نداءات المزوّد', pill(String(h.failedProviderCalls), h.failedProviderCalls ? 'warn' : 'ok'))
      + '<div class="aigov-toolbar"><button class="aigov-btn primary" onclick="aigovTestProvider()">🧪 اختبار المزوّد</button>'
      + '<button class="aigov-btn" onclick="aigovRefresh()">↻ تحديث</button></div>'
      + '<div class="aigov-hint" id="aigovTestResult"></div>'
      + '</div>'
      // providers
      + '<div class="aigov-card"><div class="aigov-title">🔌 المزوّدون</div>'
      + providers.map(p => row(esc(p.name),
          pill(p.enabled ? (pstat && pstat.lastProvider === p.id ? (pstat.lastStatus === 'ok' ? 'يعمل' : 'فشل') : 'جاهز') : 'مطفأ',
            p.enabled ? (pstat && pstat.lastProvider === p.id && pstat.lastStatus !== 'ok' ? 'bad' : 'ok') : 'muted'))).join('')
      + (pstat && pstat.lastError ? '<div class="aigov-hint">آخر خطأ: ' + esc(pstat.lastError) + '</div>' : '')
      + '<div class="aigov-hint">المفاتيح لا تُعرض هنا أبداً — apiKeySource فقط. تسلسل: مزوّد فعّال ← احتياطي ← حتمي محلي.</div>'
      + '</div>'
      // tools + queue + audit
      + '<div class="aigov-card"><div class="aigov-title">🧰 الأدوات والطابور</div>'
      + row('أدوات الدماغ الحية', pill(String(h.brainToolsCount), 'ai'))
      + row('أدوات السجل', pill(String(h.registryToolsCount), 'ai'))
      + row('آمن / موافقة / عالي / حرج', pill(byRisk.low + ' / ' + byRisk.medium + ' / ' + byRisk.high + ' / ' + byRisk.critical, 'muted'))
      + row('تحذيرات (بلا منفّذ بعد)', h.registryWarnings.length ? pill(h.registryWarnings.length + ': ' + h.registryWarnings.slice(0, 3).join('، ') + (h.registryWarnings.length > 3 ? '…' : ''), 'warn') : pill('لا شيء', 'ok'))
      + row('إجراءات بانتظار الموافقة', pill(String(h.pendingActions), h.pendingActions ? 'warn' : 'ok'))
      + row('أحداث التدقيق', pill(String(h.auditEvents), 'muted'))
      + '<div class="aigov-toolbar">'
      + '<button class="aigov-btn" onclick="switchPage(\'ai_tools\')">سجل الأدوات</button>'
      + '<button class="aigov-btn" onclick="switchPage(\'ai_queue\')">طابور الموافقات</button>'
      + '<button class="aigov-btn" onclick="switchPage(\'ai_factory\')">مصنع التطوير</button>'
      + '</div>'
      + '<div class="aigov-hint">⚠️ أدوات التحكم بالحاسوب محضّرة للمستقبل ومطفأة حالياً لحماية النظام.</div>'
      + '</div>'
      + '</div>'
      // agent catalog
      + '<div class="aigov-card aigov-wide"><div class="aigov-title">Agent Catalog Foundation</div>'
      + '<div class="aigov-hint">Governed business agents are registered with explicit allowed tools, blocked tools, dry-run preview, human review checkpoints, audit requirements, and no direct high-risk execution.</div>'
      + '<div class="aigov-table-wrap"><table class="aigov-table aigov-agent-table"><thead><tr><th>Agent</th><th>Domain</th><th>Risk</th><th>Mode</th><th>Allowed tools</th><th>Blocked tools</th></tr></thead><tbody>'
      + agentRows
      + '</tbody></table></div>'
      + '<div class="aigov-hint">Policy store: <code>omni.aiAgents.catalog</code>, simulations: <code>omni.aiAgents.simulations</code>, approvals mirror: <code>omni.aiAgents.approvals</code>. High-risk proposals route to the approval queue.</div>'
      + '</div>'
      // recent audit log
      + '<div class="aigov-card"><div class="aigov-title">📜 آخر أحداث الذكاء الصناعي</div>'
      + (log.length ? '<div class="aigov-table-wrap"><table class="aigov-table"><thead><tr><th>الوقت</th><th>الحدث</th><th>المستخدم</th><th>تفاصيل</th></tr></thead><tbody>'
        + log.map(e => '<tr><td class="aigov-muted">' + esc(String(e.at || '').slice(5, 19).replace('T', ' ')) + '</td><td><code>' + esc(e.event) + '</code></td><td class="aigov-muted">' + esc(e.by || '') + '</td><td class="aigov-muted">' + esc(JSON.stringify(e.data || {}).slice(0, 90)) + '</td></tr>').join('')
        + '</tbody></table></div>' : '<div class="aigov-hint">لا أحداث بعد — ستظهر هنا نداءات المزوّد والخطط والأدوات والموافقات.</div>')
      + '</div>';
  }
  function renderAiSystemStatus() {
    const el = document.getElementById('aiStatusBody');
    if (el) el.innerHTML = statusHtml();
  }
  window.aigovRefresh = function () { renderAiSystemStatus(); };
  window.aigovTestProvider = function () {
    const out = document.getElementById('aigovTestResult');
    if (out) out.textContent = '… يجري الاختبار';
    try {
      window.OctagonAI.testProvider().then(r => {
        updateAiSystemManifest({ lastProviderCheck: nowIso() });
        if (out) out.textContent = r.ok ? ('✅ المزوّد يعمل (' + r.provider + '): ' + r.reply) : ('❌ فشل (' + (r.provider || '—') + '): ' + r.error + ' — النظام يستمر بالاحتياطي الحتمي.');
        renderAiSystemStatus();
      });
    } catch (e) { if (out) out.textContent = '❌ طبقة المزوّد غير محمّلة — الاحتياطي الحتمي فعّال.'; }
  };

  /* ════════════════ page wiring (same pattern as workshop-ai) ════════════════ */
  function activate() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageAiStatus'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navAiStatus'); if (nav) nav.classList.add('active');
    window.currentPage = 'ai_status';
    renderAiSystemStatus();
  }
  function wireSwitch() {
    if (window.__aigovWrapped) return true;
    if (typeof window.switchPage !== 'function') return false;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'ai_status') { try { activate(); } catch (e) { console.warn('AIGov render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__aigovWrapped = true;
    return true;
  }

  /* ════════════════ init ════════════════ */
  function normalizeAll() {
    try {
      normalizeAiSystem(); normalizeAiProviders(); normalizeAiToolsRegistry(); normalizeAiAgentsCatalog();
      normalizeAiActionQueue(); normalizeAiAuditLog(); normalizeWorkshopMemory(); normalizeAiDevelopmentFactory();
    } catch (_) {}
  }
  function init() {
    normalizeAll();
    wireSwitch(); wireQueueExecution(); wireJarvisAliases();
    let tries = 0; let announced = false;
    const t = setInterval(() => {
      tries++;
      const wired = wireSwitch() & wireQueueExecution() & wireJarvisAliases();
      let dataReady = false;
      // omni loads async from the server — keep retrying until the registry is actually seeded
      try { normalizeAll(); dataReady = !!(O() && Array.isArray(O().aiToolRegistry) && O().aiToolRegistry.length && O().aiAgents && Array.isArray(O().aiAgents.catalog) && O().aiAgents.catalog.length); } catch (_) {}
      if (dataReady && !announced) {
        announced = true;
        audit('ai.context.built', { note: 'governance core initialized', manifestVersion: (getAiSystemManifest() || {}).version });
      }
      if ((wired && dataReady && tries > 4) || tries > 120) clearInterval(t);
    }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ════════════════ public surface ════════════════ */
  window.OctagonAIGovernance = {
    audit: audit,
    getToolRisk: getToolRisk,
    getAiActionRisk: getAiActionRisk,
    gateTool: gateTool,
    detectAiPromptInjectionSignals: detectAiPromptInjectionSignals,
    proposeAiAction: proposeAiAction,
    approveAiAction: approveAiAction,
    rejectAiAction: rejectAiAction,
    executeApprovedAiAction: executeApprovedAiAction,
    listPendingAiActions: listPendingAiActions,
    canUserApproveAiAction: canUserApproveAiAction,
    getAiSystemManifest: getAiSystemManifest,
    updateAiSystemManifest: updateAiSystemManifest,
    getAiSystemHealth: getAiSystemHealth,
    renderAiSystemStatus: renderAiSystemStatus,
    normalizeAiSystem: normalizeAiSystem,
    normalizeAiProviders: normalizeAiProviders,
    normalizeAiToolsRegistry: normalizeAiToolsRegistry,
    normalizeAiAgentsCatalog: normalizeAiAgentsCatalog,
    listAiAgents: listAiAgents,
    getAiAgentPolicy: getAiAgentPolicy,
    buildAiAgentDryRun: buildAiAgentDryRun,
    recordAiAgentDryRun: recordAiAgentDryRun,
    proposeAiAgentAction: proposeAiAgentAction,
    normalizeAiActionQueue: normalizeAiActionQueue,
    normalizeAiAuditLog: normalizeAiAuditLog,
    normalizeWorkshopMemory: normalizeWorkshopMemory,
    normalizeAiDevelopmentFactory: normalizeAiDevelopmentFactory,
    version: '1.1'
  };
  // spec-named globals
  window.getAiSystemManifest = getAiSystemManifest;
  window.updateAiSystemManifest = updateAiSystemManifest;
  window.getAiSystemHealth = getAiSystemHealth;
  window.renderAiSystemStatus = renderAiSystemStatus;
  window.listAiAgents = listAiAgents;
  window.getAiAgentPolicy = getAiAgentPolicy;
  window.buildAiAgentDryRun = buildAiAgentDryRun;
  window.recordAiAgentDryRun = recordAiAgentDryRun;
  window.proposeAiAgentAction = proposeAiAgentAction;
  window.proposeAiAction = proposeAiAction;
  window.approveAiAction = approveAiAction;
  window.rejectAiAction = rejectAiAction;
  window.executeApprovedAiAction = executeApprovedAiAction;
  window.listPendingAiActions = listPendingAiActions;
  window.getAiActionRisk = getAiActionRisk;
  window.canUserApproveAiAction = canUserApproveAiAction;
})();
