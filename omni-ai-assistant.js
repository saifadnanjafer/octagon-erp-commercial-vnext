/**
 * OCTAGON OMNISYSTEM - omni-ai-assistant.js
 *
 * Omni — one movable, resizable AI assistant for every page.
 * (Internally many identifiers still say "jarvis" for stability; the
 *  user-facing name is Omni. window.OmniBrain / window.OmniVoiceRuntime
 *  are compatibility aliases over the Jarvis internals.)
 */
(function () {
  'use strict';

  const CHAT_STORAGE_KEY = 'octagonAIChat';
  const LEGACY_CHAT_STORAGE_KEY = 'ptxAIChat';
  const PANEL_LAYOUT_KEY = 'octagonAIChatLayout';
  const BUTTON_LAYOUT_KEY = 'octagonAIButtonLayout';
  const RT_CONFIG_OPEN_KEY = 'omniRuntimeConfigOpen';
  const PRODUCT_NAME = 'Octagon ERP';

  const PAGE_LABELS = {
    calculator: { ar: 'حاسبة الرواتب', en: 'Payroll Calculator' },
    timesheet: { ar: 'سجل الحضور والدوام', en: 'Timesheet' },
    calendar: { ar: 'تقويم الدوام', en: 'Attendance Calendar' },
    import: { ar: 'استيراد البيانات', en: 'Data Import' },
    employees: { ar: 'الموظفون والأرصدة', en: 'Employees and Balances' },
    finance: { ar: 'المالية والمحاسبة', en: 'Finance and Accounting' },
    cashbox: { ar: 'قاصة الورشة', en: 'Workshop Cashbox' },
    expenses: { ar: 'المصروفات', en: 'Expenses' },
    income: { ar: 'الواردات', en: 'Income' },
    customers: { ar: 'أرصدة العملاء', en: 'Customer Balances' },
    receipt: { ar: 'إنشاء وصل', en: 'Receipt Builder' },
    report: { ar: 'التقرير النهائي', en: 'Final Report' },
    command_center: { ar: 'مركز القيادة', en: 'Command Center' },
    kanban: { ar: 'اللوحة التنفيذية', en: 'Execution Board' },
    workflow: { ar: 'مصمم العمليات', en: 'Workflow Designer' },
    op_packs: { ar: 'باقات العمليات', en: 'Operation Packs' },
    mrp: { ar: 'تخطيط الإنتاج MRP', en: 'MRP Production Planning' },
    task_manager: { ar: 'إدارة المهام', en: 'Task Manager' },
    sop: { ar: 'مكتبة إجراءات التشغيل', en: 'SOP Library' },
    machines: { ar: 'المكائن والصيانة', en: 'Machines and Maintenance' },
    inventory: { ar: 'المخزون والمواد', en: 'Inventory and Materials' },
    equipment: { ar: 'معدات الورشة', en: 'Workshop Equipment' },
    qc_center: { ar: 'مركز الجودة', en: 'Quality Center' },
    analytics: { ar: 'التحليلات والذكاء', en: 'Analytics and Intelligence' },
    nl_reports: { ar: 'التقارير الذكية', en: 'Smart Reports' },
    intelligence: { ar: 'عقل النظام', en: 'System Brain' },
    automation: { ar: 'محرك الأتمتة', en: 'Automation Engine' },
    whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
    telegram: { ar: 'تلغرام', en: 'Telegram Connector' },
    sales: { ar: 'المبيعات والعملاء', en: 'Sales and Customers' },
    multi_entity: { ar: 'الفروع والعملات', en: 'Branches and Currencies' },
    tax_compliance: { ar: 'الضرائب والفوترة', en: 'Tax and E-Invoicing' },
    employee_ui: { ar: 'لوحة الموظف', en: 'Employee Portal' },
    customer_portal: { ar: 'بوابة العميل', en: 'Customer Portal' },
    admin_panel: { ar: 'لوحة الإدارة', en: 'Admin Panel' },
    help_manual: { ar: 'الدليل والمساعدة', en: 'Help Manual' }
  };

  const SENSITIVE_RE = /راتب|رواتب|قيد|مالية|فلوس|صلاحية|حذف|اعدادات|إعدادات|admin|salary|payroll|journal|finance|delete|permission|settings/i;

  const state = {
    open: false,
    busy: false,
    jarvisActive: false,
    jarvisListening: false,
    jarvisStatus: 'idle',
    rtConfigOpen: localStorage.getItem(RT_CONFIG_OPEN_KEY) === '1',
    byPage: {},
    activeWorkflow: null,
    workflowStep: 0,
    conversationHistory: [],
    jarvisPersonality: 'professional',
    apiProvider: localStorage.getItem('octagon_jarvis_provider') || 'auto',
    jarvisMode: localStorage.getItem('octagon_jarvis_mode') || 'balanced',
    sessionTokens: Number(localStorage.getItem('jarvis_session_tokens') || '0'),
    sessionCost: Number(localStorage.getItem('jarvis_session_cost') || '0'),
    apiTestRunning: false,
    apiTestResults: null
  };
  let jarvisRecognition = null;
  let jarvisWatchdog = null;        // interval that keeps recognition alive
  let jarvisNetworkHintShown = false;
  let jarvisLastHeardAt = 0;        // ms timestamp of last heard speech
  let jarvisLastRestartAt = 0;      // throttle restarts
  // --- "Is the mic ACTUALLY capturing?" health tracking (UI was showing a fake
  //     "listening" while the engine was dead/erroring in a silent retry loop). ---
  let jarvisListenStartedAt = 0;    // when the current recognition session said onstart
  let jarvisAudioStartedAt = 0;     // when the mic actually began delivering audio (onaudiostart)
  let jarvisConsecErrors = 0;       // consecutive recognition errors with no audio in between
  let jarvisProblemMsg = '';        // if set, the wave bar shows this instead of a fake "listening"
  // --- Echo guard + wake-word state (stops Omni hearing itself / looping) ---
  let jarvisSpeakingUntil = 0;      // ignore ALL mic input until this ms (its own voice)
  let jarvisLastSpokenNorm = '';    // normalized text Omni just said, for echo match
  let jarvisHardStopped = false;    // true after an explicit stop; blocks every auto-restart
  let jarvisArmedUntil = 0;         // wake-word armed window: command capture is open until this ms
  // Direct mode (default): every non-echo command runs immediately — no wake word needed.
  // The echo guard alone prevents the self-loop. Set true to require "Hey Omni"/"Octagon".
  let jarvisWakeRequired = false;
  try { jarvisWakeRequired = localStorage.getItem('jarvisWakeRequired') === '1'; } catch (_) {}
  let jarvisCloudAudio = null;      // currently-playing cloud TTS <audio>, so stop can kill it
  let cloudTtsDisabled = false;     // latched off if the TTS API key is rejected (then use browser)
  let cloudTtsCooldownUntil = 0;    // 429 rate-limit: pause cloud TTS briefly, then auto-recover
  let jarvisSpeechRunId = 0;        // invalidates stale TTS callbacks after interrupt/stop
  let jarvisSpeechInFlight = false; // true while TTS is preparing or playing
  let jarvisListenResumeTimer = null;
  let jarvisRestartBlockedUntil = 0;
  let jarvisTtsAbortController = null;
  // Wake words. Bare "أومني" is intentionally excluded (too easy to false-trigger / self-echo).
  // The old "جارفيس" wake words are kept as hidden aliases so existing habits keep working.
  const JARVIS_WAKE_WORDS = ['يا أومني', 'هاي أومني', 'هلو أومني', 'مرحبا أومني',
    'يا جارفيس', 'هاي جارفيس', 'هلو جارفيس', 'مرحبا جارفيس',
    'اوكتاجون', 'أوكتاجون', 'اوكتاغون', 'أوكتاغون',
    'hello omni', 'hey omni', 'hi omni', 'okay omni', 'ok omni',
    'hello jarvis', 'hey jarvis', 'hi jarvis', 'okay jarvis', 'ok jarvis', 'octagon'];

  // API Configuration — used ONLY for Gemini cloud TTS (googleTtsKey below).
  // The dead Grok config (browser-CORS-blocked, deprecated model, exposed key) was removed;
  // all chat traffic goes through modules/ai-providers.js (window.callOctagonAi).
  const API_CONFIG = {
    google: {
      apiKey: '',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      fallbackKey: '',
      ttsEndpoint: '/api/tts'
    }
  };
  
  const JARVIS_WORKFLOWS = {
    low_stock_check: {
      name: 'فحص المخزون المنخفض',
      name_en: 'Low Stock Check',
      steps: [
        { action: 'navigate', page: 'inventory', message: 'جاري الانتقال إلى قسم المخزون...' },
        { action: 'filter', filter: 'low_stock', message: 'جاري فحص المواد المنخفضة...' },
        { action: 'speak', message: 'وجدت {count} مواد تحت الحد الأدنى. هل تريد إنشاء طلبات شراء؟' }
      ]
    },
    morning_report: {
      name: 'التقرير الصباحي',
      name_en: 'Morning Report',
      steps: [
        { action: 'navigate', page: 'command_center', message: 'جاري فتح مركز القيادة...' },
        { action: 'check_attention', message: 'جاري مراجعة ما يحتاج انتباهك...' },
        { action: 'navigate', page: 'task_manager', message: 'جاري مراجعة المهام...' },
        { action: 'speak', message: 'لديك {overdue} مهام متأخرة و {pending} مهام معلقة اليوم.' }
      ]
    },
    machine_status: {
      name: 'حالة المكائن',
      name_en: 'Machine Status',
      steps: [
        { action: 'navigate', page: 'machines', message: 'جاري فحص حالة المكائن...' },
        { action: 'filter', filter: 'needs_maintenance', message: 'جاري تحديد المكائن التي تحتاج صيانة...' },
        { action: 'speak', message: '{count} مكائن تحتاج صيانة. الأولوية لماكينة {priority}.' }
      ]
    }
  };

  const JARVIS_PAGE_TRIGGERS = {
    calculator: ['حاسبة', 'الحاسبة', 'رواتب', 'calculator', 'payroll', 'show calculator', 'open calculator', 'افتح الحاسبة', 'افتح حاسبة', 'حساب الرواتب', 'payroll calculator'],
    inventory: ['مخزون', 'المخزون', 'مواد', 'inventory', 'stock', 'show inventory', 'open inventory', 'افتح المخزون', 'افتح مخزون', 'المواد والمخزون', 'inventory materials'],
    task_manager: ['مهام', 'المهام', 'task manager', 'tasks', 'show tasks', 'افتح المهام', 'افتح مهام', 'إدارة المهام', 'manage tasks'],
    finance: ['مالية', 'المالية', 'finance', 'accounting', 'show finance', 'افتح المالية', 'افتح مالية', 'المحاسبة', 'accounting'],
    kanban: ['كانبان', 'لوحة', 'kanban', 'board', 'execution board', 'افتح اللوحة', 'افتح كانبان', 'اللوحة التنفيذية'],
    machines: ['مكائن', 'المكائن', 'ماكينة', 'machines', 'machine', 'افتح المكائن', 'افتح مكائن', 'المكائن والصيانة', 'machines maintenance'],
    whatsapp: ['واتساب', 'whatsapp', 'رسائل', 'افتح واتساب', 'الرسائل', 'messages'],
    telegram: ['تلغرام', 'تليجرام', 'telegram', 'بوت', 'bot', 'افتح تلغرام', 'موصل تلغرام', 'telegram connector'],
    command_center: ['مركز القيادة', 'command center', 'dashboard', 'افتح مركز القيادة', 'لوحة التحكم', 'control panel'],
    intelligence: ['ذكاء', 'الذكاء', 'ai', 'intelligence', 'system brain', 'افتح الذكاء', 'افتح عقل النظام', 'عقل النظام'],
    analytics: ['تحليلات', 'التحليلات', 'analytics', 'افتح التحليلات', 'التحليلات والذكاء'],
    qc_center: ['جودة', 'الجودة', 'qc', 'quality', 'افتح الجودة', 'افتح مركز الجودة', 'مراقبة الجودة'],
    sales: ['مبيعات', 'المبيعات', 'sales', 'افتح المبيعات', 'المبيعات والعملاء'],
    timesheet: ['حضور', 'دوام', 'timesheet', 'attendance', 'افتح الحضور', 'افتح الدوام', 'سجل الحضور'],
    employees: ['موظفون', 'الموظفون', 'employees', 'افتح الموظفون', 'الموظفين', 'staff'],
    automation: ['أتمتة', 'automation', 'افتح الأتمتة', 'محرك الأتمتة'],
    help_manual: ['دليل', 'مساعدة', 'help', 'manual', 'افتح الدليل', 'الدليل والمساعدة']
  };

  const JARVIS_ACTION_TRIGGERS = {
    create: ['إنشاء', 'create', 'add new', 'جديد', 'أضف', 'add', 'new'],
    update: ['تحديث', 'update', 'تعديل', 'edit', 'modify', 'غيّر'],
    delete: ['حذف', 'delete', 'remove', 'إزالة'],
    search: ['بحث', 'search', 'find', 'ابحث', 'find'],
    report: ['تقرير', 'report', 'عرض', 'show', 'لخص', 'summarize'],
    approve: ['موافقة', 'approve', 'approve request', 'وافق'],
    reject: ['رفض', 'reject', 'reject request'],
    status: ['حالة', 'status', 'what is the status', 'ما الحالة'],
    list: ['قائمة', 'list', 'show all', 'عرض الكل', 'all'],
    calculate: ['احسب', 'calculate', 'compute']
  };

  function lang() {
    return (document.documentElement.lang || localStorage.getItem('octagon_language') || localStorage.getItem('pentagon_language') || 'ar') === 'en' ? 'en' : 'ar';
  }
  function t(ar, en) { return lang() === 'en' ? en : ar; }
  function currentKey() {
    try { if (typeof currentPage !== 'undefined' && currentPage) return currentPage; } catch (_) {}
    return 'calculator';
  }
  function pageLabel(key = currentKey()) {
    const label = PAGE_LABELS[key];
    return label ? label[lang()] : key;
  }
  function esc(value) {
    try { if (typeof escapeHtml === 'function') return escapeHtml(value); } catch (_) {}
    return String(value == null ? '' : value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function formatJarvisMessage(text) {
    if (!text) return '';
    let escaped = esc(text);
    const masks = [];
    escaped = escaped.replace(/&[a-zA-Z0-9#]+;/g, match => {
      masks.push(match);
      return `@@${masks.length - 1}@@`;
    });
    escaped = escaped.replace(/[a-zA-Z][a-zA-Z0-9\s\-_'\/]*[a-zA-Z0-9]/g, match => {
      if (match.trim().length <= 1) return match;
      return `<bdi class="jarvis-latin-token">${match}</bdi>`;
    });
    escaped = escaped.replace(/@@(\d+)@@/g, (match, idx) => {
      return masks[Number(idx)];
    });
    escaped = escaped.replace(/\n/g, '<br>');
    const hasArabic = /[؀-ۿ]/.test(text);
    if (hasArabic) {
      return `<div class="jarvis-message jarvis-rtl">${escaped}</div>`;
    } else {
      return `<div class="jarvis-message">${escaped}</div>`;
    }
  }
  function toast(message, type) {
    try { if (typeof showToast === 'function') showToast(message, type); } catch (_) {}
  }
  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        const base64 = result.substring(result.indexOf(',') + 1);
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function suggestionsFor(key) {
    const ar = {
      inventory: ['ما المواد تحت الحد الأدنى؟', 'اقترح طلبات شراء للمواد الناقصة'],
      machines: ['أي مكينة تحتاج صيانة؟', 'وزع الأحمال على المكائن'],
      task_manager: ['ما المهام المتأخرة؟', 'رتب مهام اليوم حسب الأولوية'],
      whatsapp: ['لخص رسائل واتساب المعلقة'],
      telegram: ['لخص رسائل تلغرام الجديدة', 'جهز تنبيه للمدير عن طلبات الموافقة', 'حول آخر رسالة إلى مهمة', 'اشرح حالة ربط بوت تلغرام', 'جهز تقرير تنبيهات اليوم'],
      finance: ['لخص الوضع المالي قراءة فقط'],
      kanban: ['أي بطاقات عالقة تحتاج تحريك؟'],
      intelligence: ['ما الذي يحتاج موافقتي الآن؟'],
      qc_center: ['ما نسبة نجاح الفحص وأهم أسباب الفشل؟'],
      sales: ['أي عروض أسعار تحتاج متابعة؟'],
      command_center: ['ما القرارات المعلقة بانتظاري؟']
    };
    const en = {
      inventory: ['Which materials are below minimum?', 'Suggest purchase requests for missing materials'],
      machines: ['Which machine needs maintenance?', 'Balance load across machines'],
      task_manager: ['Which tasks are overdue?', 'Prioritize today\'s tasks'],
      whatsapp: ['Summarize pending WhatsApp messages'],
      telegram: ['Summarize new Telegram messages', 'Draft a manager alert about pending approvals', 'Convert the last message into a task', 'Explain Telegram bot connection status', 'Prepare today\'s alerts report'],
      finance: ['Summarize finance as read-only'],
      kanban: ['Which cards are stuck?'],
      intelligence: ['What needs my approval now?'],
      qc_center: ['What is the QC pass rate and why do checks fail?'],
      sales: ['Which quotations need follow-up?'],
      command_center: ['What decisions are waiting for me?']
    };
    return (lang() === 'en' ? en : ar)[key] || (lang() === 'en'
      ? ['Summarize this section', 'What needs my attention here?']
      : ['لخص حالة هذا القسم', 'ما الذي يحتاج انتباهي هنا؟']);
  }

  function persistChat() {
    const out = {};
    Object.keys(state.byPage).forEach(key => { out[key] = (state.byPage[key] || []).slice(-30); });
    writeJson(CHAT_STORAGE_KEY, out);
  }
  function loadChat() {
    state.byPage = readJson(CHAT_STORAGE_KEY, null) || readJson(LEGACY_CHAT_STORAGE_KEY, {}) || {};
  }

  function loggedOut() {
    const overlay = document.getElementById('loginOverlay');
    try { return !!(overlay && getComputedStyle(overlay).display !== 'none'); } catch (_) { return false; }
  }
  function syncGate() {
    const button = document.getElementById('ptxAIButton');
    if (!button) return;
    if (loggedOut()) {
      button.style.display = 'none';
      if (state.jarvisActive) stopJarvis(true);
      if (state.open) toggle(false);
    } else {
      button.style.display = '';
      updateAttentionBadge();
    }
  }

  function normalizeJarvisText(value) {
    return String(value || '').trim().toLowerCase().replace(/[؟?!.,،:;]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function stripForSpeech(value) {
    let text = String(value || '');
    text = text.replace(/```[\s\S]*?```/g, ' ');
    text = text.replace(/`[^`]+`/g, ' ');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ');
    text = text.replace(/[#*_~|>\[\]{}]/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 520) text = text.slice(0, 520) + '...';
    return text;
  }
  function pickSpeechVoice(langCode) {
    try {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      const want = langCode.slice(0, 2).toLowerCase();
      const matches = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(want));
      if (!matches.length) return null;
      // Prefer modern/natural voices over the old basic SAPI ones (David/Zira/Hazel).
      const quality = v => {
        const n = (v.name || '').toLowerCase();
        if (/natural|neural|online/.test(n)) return 3;
        if (/google|premium|enhanced/.test(n)) return 2;
        if (/microsoft/.test(n)) return 1;
        return 0;
      };
      return matches.slice().sort((a, b) => quality(b) - quality(a))[0] || matches[0];
    } catch (_) {
      return null;
    }
  }
  // Detect the language to SPEAK from the reply text. If it contains Arabic
  // letters we speak Arabic; otherwise English. (Web Speech speaks one language
  // per utterance, and the reply content is the most reliable signal.)
  function detectSpeechLangCode(text) {
    const hasArabic = /[؀-ۿ]/.test(String(text || ''));
    return hasArabic ? 'ar-SA' : 'en-US';
  }
  let _arabicVoiceWarned = false;
  function warnMissingArabicVoiceOnce() {
    if (_arabicVoiceWarned) return;
    _arabicVoiceWarned = true;
    console.warn('[Omni] No Arabic text-to-speech voice is installed on this OS; Arabic replies may sound wrong or stay silent.');
    try {
      toast(t('لا يوجد صوت عربي مثبّت على النظام. أضِف صوتاً عربياً من إعدادات ويندوز: الوقت واللغة ← الكلام ← إضافة صوت ← العربية، ثم أعد فتح المتصفح.',
              'No Arabic TTS voice is installed. Add one in Windows Settings: Time & Language → Speech → Add voices → Arabic, then reopen the browser.'), 'warning');
    } catch (_) {}
  }
  // The language Omni LISTENS in. The Web Speech recognition API can only listen
  // in one language at a time, so we expose a switch (default follows the UI). '' =
  // follow UI language, 'ar' / 'en' = force that family. Persisted across reloads.
  let jarvisListenLang = '';
  try { jarvisListenLang = localStorage.getItem('jarvisListenLang') || ''; } catch (_) {}
  function jarvisListenFamily() {
    const pref = jarvisListenLang || (lang() === 'en' ? 'en' : 'ar');
    return pref === 'en' ? 'en' : 'ar';
  }
  function jarvisLangCodes() {
    return jarvisListenFamily() === 'en' ? ['en-US', 'en-GB', 'en'] : ['ar-SA', 'ar-IQ', 'ar-EG', 'ar'];
  }
  function setJarvisListenLang(code) {
    jarvisListenLang = (code === 'en' || code === 'ar') ? code : '';
    try { localStorage.setItem('jarvisListenLang', jarvisListenLang); } catch (_) {}
    // Re-arm recognition in the new language if we are mid-session. The V2 runtime owns
    // the mic, so restart IT (the old jarvisRecognition path is a no-op under V2 and the
    // recognizer would otherwise keep listening in the previous language).
    if (window.JarvisVoiceRuntime) {
      if (state.jarvisActive) {
        try { window.JarvisVoiceRuntime.stop(); } catch (_) {}
        setTimeout(() => { if (state.jarvisActive) { try { window.JarvisVoiceRuntime.start(); } catch (_) {} } }, 250);
      }
    } else if (state.jarvisActive && state.jarvisListening) {
      try { jarvisRecognition && jarvisRecognition.stop(); } catch (_) {}
      state.jarvisListening = false;
      setTimeout(() => { if (state.jarvisActive) scheduleJarvisListening(); }, 250);
    }
    const fam = jarvisListenFamily();
    toast(fam === 'en' ? t('أومني يستمع بالإنجليزية الآن', 'Omni now listens in English')
                       : t('أومني يستمع بالعربية الآن', 'Omni now listens in Arabic'), 'info');
    return fam;
  }
  function getJarvisListenFamily() { return jarvisListenFamily(); }
  function setJarvisStatus(status) {
    state.jarvisStatus = status;
    const btn = document.getElementById('ptxAIJarvisBtn');
    const input = document.getElementById('ptxAIInput');
    if (btn) {
      btn.classList.toggle('hearing', status === 'listening');
      btn.classList.toggle('processing', status === 'processing');
      btn.classList.toggle('executing', state.activeWorkflow !== null);
    }
    if (input && state.jarvisActive) {
      if (state.activeWorkflow) {
        const workflow = JARVIS_WORKFLOWS[state.activeWorkflow];
        const workflowName = workflow ? (lang() === 'ar' ? workflow.name : workflow.name_en) : '';
        input.placeholder = t(`جاري تنفيذ: ${workflowName} (الخطوة ${state.workflowStep + 1})`, 
                                `Executing: ${workflowName} (Step ${state.workflowStep + 1})`);
      } else if (status === 'listening') {
        input.placeholder = t('أومني يستمع... تحدث الآن', 'Omni is listening... speak now');
      } else if (status === 'speaking') {
        input.placeholder = t('أومني يتحدث...', 'Omni is speaking...');
      } else if (status === 'processing') {
        input.placeholder = t('أومني يعالج طلبك...', 'Omni is processing your request...');
      }
    }
    updateJarvisWaveIndicator(status);
    // Drive the floating Omni orb (additive; no-op if the orb module is absent).
    try {
      if (window.JarvisOrb) {
        if (state.activeWorkflow) {
          const wf = JARVIS_WORKFLOWS[state.activeWorkflow];
          const wfName = wf ? (lang() === 'ar' ? wf.name : wf.name_en) : '';
          window.JarvisOrb.setMode('executing');
          window.JarvisOrb.say(t('يُنفّذ', 'EXECUTING'),
            t(`${wfName} — الخطوة ${state.workflowStep + 1}`, `${wfName} — step ${state.workflowStep + 1}`));
        } else if (status === 'listening') {
          window.JarvisOrb.setMode('listening');
          window.JarvisOrb.say(t('يستمع', 'LISTENING'), t('تحدث الآن...', 'Speak now...'));
        } else if (status === 'processing') {
          window.JarvisOrb.setMode('thinking');
          window.JarvisOrb.say(t('يفكر', 'THINKING'), t('أعالج طلبك...', 'Working on it...'));
        } else if (status === 'speaking') {
          window.JarvisOrb.setMode('speaking');
          window.JarvisOrb.say(t('يتحدث', 'SPEAKING'), t('أومني يردّ', 'Omni is replying'));
        }
      }
    } catch (_) {}
  }
  function updateJarvisButton() {
    const btn = document.getElementById('ptxAIJarvisBtn');
    if (!btn) return;
    btn.classList.toggle('active', state.jarvisActive);
    const label = !state.jarvisActive
      ? t('وضع أومني', 'Omni Mode')
      : state.jarvisStatus === 'speaking'
        ? t('أومني يتحدث', 'Omni Speaking')
        : state.jarvisStatus === 'processing'
          ? t('أومني يفكر', 'Omni Thinking')
          : t('أومني يستمع', 'Omni Listening');
    const icon = state.jarvisActive ? 'fa-microphone' : 'fa-microphone-slash';
    btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
    btn.title = state.jarvisActive
      ? t('إيقاف الاستماع الصوتي المستمر', 'Stop continuous voice listening')
      : t('تفعيل التحكم الصوتي المستمر', 'Enable hands-free voice control');
  }
  function resetJarvisInputPlaceholder() {
    const input = document.getElementById('ptxAIInput');
    if (input) {
      input.placeholder = t('اسأل عن هذا القسم أو اطلب إجراء آمن...', 'Ask about this section or request a safe action...');
    }
  }
  function clearJarvisListenResumeTimer() {
    if (jarvisListenResumeTimer) {
      clearTimeout(jarvisListenResumeTimer);
      jarvisListenResumeTimer = null;
    }
  }
  function blockJarvisRestart(ms = 900) {
    jarvisRestartBlockedUntil = Math.max(jarvisRestartBlockedUntil, Date.now() + ms);
  }
  function shouldHoldJarvisMic() {
    return jarvisSpeechInFlight || state.jarvisStatus === 'speaking' || Date.now() < jarvisSpeakingUntil || Date.now() < jarvisRestartBlockedUntil;
  }

  function pauseJarvisListening() {
    if (window.JarvisVoiceRuntime) {
      // Hold the mic for the turn WITHOUT resetting the runtime to IDLE, so the orb keeps
      // showing THINKING/SPEAKING while we process. (stop() here used to blank the
      // "thinking" state the instant a turn began.) Falls back to stop() on older runtimes.
      if (typeof window.JarvisVoiceRuntime.holdMic === 'function') window.JarvisVoiceRuntime.holdMic();
      else window.JarvisVoiceRuntime.stop();
      state.jarvisListening = false;
      return;
    }
    blockJarvisRestart();
    state.jarvisListening = false;
    clearJarvisListenResumeTimer();
    if (!jarvisRecognition) return;
    try { jarvisRecognition.abort(); } catch (_) {}
    jarvisRecognition = null;
  }
  function scheduleJarvisListening(delay = 0) {
    if (window.JarvisVoiceRuntime) {
      return;
    }
    clearJarvisListenResumeTimer();
    if (jarvisHardStopped || !state.jarvisActive) return;
    if (jarvisSpeechInFlight) return;
    const holdMs = Math.max(0, jarvisSpeakingUntil - Date.now() + 150, jarvisRestartBlockedUntil - Date.now() + 50);
    jarvisListenResumeTimer = setTimeout(() => {
      jarvisListenResumeTimer = null;
      if (jarvisHardStopped || !state.jarvisActive || state.jarvisListening) return;
      if (state.busy) {
        scheduleJarvisListening(250);
        return;
      }
      if (shouldHoldJarvisMic()) {
        scheduleJarvisListening(200);
        return;
      }
      startJarvisListening();
    }, Math.max(delay, holdMs));
  }
  function interruptJarvisSpeech(resumeListening = true) {
    if (window.JarvisVoiceRuntime) {
      return window.JarvisVoiceRuntime.interrupt('user_barge_in');
    }
    const browserSpeaking = !!(window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending));
    const wasSpeaking = jarvisSpeechInFlight || browserSpeaking || !!jarvisCloudAudio || state.jarvisStatus === 'speaking' || Date.now() < jarvisSpeakingUntil;
    if (!wasSpeaking) return false;
    jarvisSpeechRunId++;
    jarvisSpeechInFlight = false;
    jarvisSpeakingUntil = 0;
    jarvisLastSpokenNorm = '';
    blockJarvisRestart(350);
    try { if (jarvisTtsAbortController) { jarvisTtsAbortController.abort(); jarvisTtsAbortController = null; } } catch (_) {}
    try { window.speechSynthesis?.cancel?.(); } catch (_) {}
    try {
      if (jarvisCloudAudio) {
        jarvisCloudAudio.onended = null;
        jarvisCloudAudio.onerror = null;
        jarvisCloudAudio.onloadedmetadata = null;
        jarvisCloudAudio.pause();
        jarvisCloudAudio.src = '';
        jarvisCloudAudio = null;
      }
    } catch (_) {}
    if (state.jarvisActive && !jarvisHardStopped) {
      setJarvisStatus('idle');
      updateJarvisButton();
      if (resumeListening) scheduleJarvisListening(80);
    }
    return true;
  }
  // Cloud TTS via Gemini — gives a natural Arabic voice even when Windows has none,
  // and reuses the SAME generativelanguage key the chat already uses (no extra API to
  // enable). Gemini returns raw PCM, which we wrap into a WAV blob URL to play.
  // Returns a playable object-URL, or null to signal "fall back to the browser voice".
  function googleTtsKey() {
    try { return (API_CONFIG.google && (API_CONFIG.google.fallbackKey || API_CONFIG.google.apiKey)) || ''; }
    catch (_) { return ''; }
  }
  function pcmBase64ToWavUrl(b64, sampleRate) {
    const bin = atob(b64);
    const pcm = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
    const numChannels = 1, bitsPerSample = 16;
    const blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const buffer = new ArrayBuffer(44 + pcm.length);
    const view = new DataView(buffer);
    const ws = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true); ws(8, 'WAVE');
    ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true); view.setUint16(34, bitsPerSample, true);
    ws(36, 'data'); view.setUint32(40, pcm.length, true);
    new Uint8Array(buffer, 44).set(pcm);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }
  function synthesizeCloudTTS(text, langCode) {
    if (cloudTtsDisabled || Date.now() < cloudTtsCooldownUntil) return Promise.resolve(null);
    const payloadText = String(text || '').slice(0, 900);
    if (!payloadText) return Promise.resolve(null);
    const serverEndpoint = (API_CONFIG.google && API_CONFIG.google.ttsEndpoint) || '/api/tts';
    if (serverEndpoint) {
      try { if (jarvisTtsAbortController) jarvisTtsAbortController.abort(); } catch (_) {}
      const serverController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      jarvisTtsAbortController = serverController;
      const serverTimeoutId = serverController ? setTimeout(() => { try { serverController.abort(); } catch (_) {} }, 7000) : null;
      return fetch(serverEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payloadText, lang: langCode || detectSpeechLangCode(payloadText) }),
        signal: serverController ? serverController.signal : undefined
      })
        .then(r => {
          if (!r.ok) {
            if (r.status === 429) cloudTtsCooldownUntil = Date.now() + 90000;
            if (r.status === 404 || r.status === 501) cloudTtsDisabled = true;
            return null;
          }
          return r.json();
        })
        .then(j => {
          if (!j || !j.success || !j.audioBase64) return null;
          return pcmBase64ToWavUrl(j.audioBase64, Number(j.sampleRate) || 24000);
        })
        .catch(() => null)
        .then(url => url || synthesizeBrowserKeyTTS(payloadText))
        .finally(() => {
          if (serverTimeoutId) clearTimeout(serverTimeoutId);
          if (jarvisTtsAbortController === serverController) jarvisTtsAbortController = null;
        });
    }
    return synthesizeBrowserKeyTTS(payloadText);
  }

  function synthesizeBrowserKeyTTS(text) {
    const key = googleTtsKey();
    if (!key || !/^AIza/.test(key)) return Promise.resolve(null);
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=' + encodeURIComponent(key);
    const body = {
      contents: [{ parts: [{ text: String(text).slice(0, 900) }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
    };
    try { if (jarvisTtsAbortController) jarvisTtsAbortController.abort(); } catch (_) {}
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    jarvisTtsAbortController = controller;
    const timeoutId = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, 7000) : null;
    return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller ? controller.signal : undefined })
      .then(r => {
        if (!r.ok) {
          if (r.status === 429) {
            // Rate-limited, not broken: back off for 90s then try again —
            // permanent latching here was starving mixed-language speech.
            cloudTtsCooldownUntil = Date.now() + 90000;
            console.warn('[Omni] Cloud TTS rate-limited (429); using the browser voice for 90s.');
          } else if (r.status === 403 || r.status === 400 || r.status === 404) {
            cloudTtsDisabled = true;
            console.warn('[Omni] Gemini cloud TTS unavailable (HTTP ' + r.status + '); using the browser voice instead.');
          }
          return null;
        }
        return r.json();
      })
      .then(j => {
        const part = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0];
        const data = part && part.inlineData && part.inlineData.data;
        if (!data) return null;
        const m = /rate=(\d+)/.exec((part.inlineData.mimeType || '')) || [];
        const rate = parseInt(m[1], 10) || 24000;
        try { return pcmBase64ToWavUrl(data, rate); } catch (_) { return null; }
      })
      .catch(() => null)
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        if (jarvisTtsAbortController === controller) jarvisTtsAbortController = null;
      });
  }

  function speakJarvis(text, resumeListening = true) {
    if (window.JarvisVoiceRuntime) {
      window.JarvisVoiceRuntime.speak(text, resumeListening);
      return;
    }
    if (!text) {
      if (resumeListening && state.jarvisActive && !state.jarvisListening) scheduleJarvisListening();
      return;
    }
    interruptJarvisSpeech(false);
    pauseJarvisListening();
    const speechRunId = ++jarvisSpeechRunId;
    jarvisSpeechInFlight = true;
    setJarvisStatus('speaking');
    updateJarvisButton();
    const speechText = stripForSpeech(text);
    // ECHO GUARD: block the mic for the whole time Omni is talking (plus a tail),
    // and remember what it said, so its own voice can never be transcribed and
    // re-processed into an endless self-loop.
    jarvisLastSpokenNorm = normalizeJarvisText(speechText);
    const estMs = Math.min(22000, Math.max(1500, speechText.length * 75));
    jarvisSpeakingUntil = Date.now() + estMs + 1200;
    // Speak in the locked conversation language (AR/EN chip) when set; otherwise
    // fall back to detecting it from the reply text. Keeps spoken language == input.
    const forced = (window.__jarvisReplyLang === 'en') ? 'en-US' : (window.__jarvisReplyLang === 'ar') ? 'ar-SA' : '';
    const langCode = forced || detectSpeechLangCode(speechText);

    const afterSpeech = () => {
      if (speechRunId !== jarvisSpeechRunId) return;
      jarvisSpeechInFlight = false;
      jarvisCloudAudio = null;
      jarvisSpeakingUntil = Date.now() + 1100;
      if (jarvisHardStopped || !state.jarvisActive) { resetJarvisInputPlaceholder(); return; }
      // Speech is over: drop the 'speaking' guard so the mic can resume cleanly.
      // speakJarvis() is the SOLE owner of this handoff — callers must not restart
      // listening themselves, or the mic re-opens while the async TTS is still talking.
      if (state.jarvisStatus === 'speaking') setJarvisStatus('idle');
      // Resume listening quickly (was 1000ms). The 600ms echo tail above still guards
      // the recognizer from catching Omni's last word, so this stays echo-safe.
      updateJarvisButton();
      if (resumeListening) scheduleJarvisListening(1100);
    };

    // Fallback: the built-in browser voice (used if cloud TTS is unavailable).
    const speakBrowser = () => {
      if (speechRunId !== jarvisSpeechRunId) return;
      if (!window.speechSynthesis) { afterSpeech(); return; }
      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = langCode;
      const voice = pickSpeechVoice(langCode);
      if (voice) utterance.voice = voice;
      else if (langCode.startsWith('ar')) warnMissingArabicVoiceOnce();
      utterance.rate = 0.95;
      utterance.onstart = () => {
        if (speechRunId === jarvisSpeechRunId) jarvisSpeakingUntil = Date.now() + estMs + 1200;
      };
      utterance.onend = afterSpeech;
      utterance.onerror = afterSpeech;
      try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); }
      catch (_) { afterSpeech(); }
    };

    // INSTANT REPLY (tiered TTS): short confirmations speak immediately with the
    // built-in browser voice — no network round-trip — so "تم فتح المخزون" comes back
    // at once. Longer replies keep the natural cloud voice. If the OS has no voice for
    // this language (e.g. no Arabic installed) we fall through to cloud so it stays correct.
    if (speechText.length <= 60 && pickSpeechVoice(langCode)) {
      speakBrowser();
      return;
    }
    // Otherwise prefer cloud TTS (natural Arabic + English); gracefully fall back.
    synthesizeCloudTTS(speechText, langCode).then(audioUrl => {
      if (speechRunId !== jarvisSpeechRunId) { if (audioUrl) try { URL.revokeObjectURL(audioUrl); } catch (_) {} return; }
      if (jarvisHardStopped) { if (audioUrl) try { URL.revokeObjectURL(audioUrl); } catch (_) {} afterSpeech(); return; }
      if (!audioUrl) { speakBrowser(); return; }
      try {
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {}
        if (jarvisCloudAudio) { try { jarvisCloudAudio.pause(); } catch (_) {} }
        const audio = new Audio(audioUrl);
        jarvisCloudAudio = audio;
        const cleanup = () => { try { URL.revokeObjectURL(audioUrl); } catch (_) {} };
        audio.onended = () => { cleanup(); afterSpeech(); };
        audio.onerror = () => { cleanup(); speakBrowser(); };
        audio.onloadedmetadata = () => {
          if (speechRunId !== jarvisSpeechRunId) return;
          if (isFinite(audio.duration) && audio.duration > 0) {
            jarvisSpeakingUntil = Date.now() + audio.duration * 1000 + 1200;
          }
        };
        audio.onplay = () => {
          if (speechRunId === jarvisSpeechRunId) jarvisSpeakingUntil = Math.max(jarvisSpeakingUntil, Date.now() + estMs + 1200);
        };
        audio.play().catch(() => { cleanup(); speakBrowser(); });
      } catch (_) { speakBrowser(); }
    });
  }
  // Find a wake word in the transcript. Returns the command text that FOLLOWS the
  // wake word (so "يا أومني افتح المبيعات" -> "افتح المبيعات"), or null if none.
  function detectWakeWord(transcript) {
    const norm = normalizeJarvisText(transcript);
    if (!norm) return null;
    for (const w of JARVIS_WAKE_WORDS) {
      const nw = normalizeJarvisText(w);
      const idx = norm.indexOf(nw);
      if (idx !== -1) {
        return { remainder: norm.slice(idx + nw.length).trim() };
      }
    }
    return null;
  }
  // Is the just-heard text really Omni hearing its own reply?
  function isJarvisEcho(transcript) {
    const norm = normalizeJarvisText(transcript);
    if (!norm || !jarvisLastSpokenNorm) return false;
    if (jarvisLastSpokenNorm.includes(norm) && norm.length >= 4) return true;
    if (norm.includes(jarvisLastSpokenNorm) && jarvisLastSpokenNorm.length >= 6) return true;
    return false;
  }
  function buildJarvisRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      state.jarvisListening = true;
      jarvisListenStartedAt = Date.now();
      setJarvisStatus('listening');
      updateJarvisButton();
    };
    recognition.onresult = event => {
      // ECHO GUARD: while Omni is speaking (or in the tail window) ignore EVERYTHING
      // the mic picks up — that audio is its own voice. This is what breaks the loop.
      if (shouldHoldJarvisMic()) return;
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      const input = document.getElementById('ptxAIInput');
      const live = (finalText || interim).trim();
      if (live) {
        jarvisLastHeardAt = Date.now();        // proof we are actually hearing
        jarvisNetworkHintShown = false;
        jarvisConsecErrors = 0;
        clearJarvisProblem();                  // we ARE hearing — drop any "can't hear" warning
        showJarvisHeard(live);                 // live transcript in the wave bar
      }
      const heard = finalText.trim();
      if (!heard) return;
      if (isJarvisEcho(heard)) return;         // never act on our own words

      const wake = detectWakeWord(heard);

      // DIRECT MODE (default): run every command the moment you say it. A wake word
      // is optional — if present it's just stripped ("Octagon, open sales" -> "open sales").
      if (!jarvisWakeRequired) {
        const command = wake ? (wake.remainder || '') : heard;
        if (!command) {
          // They said only the wake word — acknowledge and keep listening.
          try { window.JarvisOrb && window.JarvisOrb.say(t('نعم؟', 'YES?'), t('تفضّل', 'Go ahead')); } catch (_) {}
          return;
        }
        if (input) input.value = command;
        processJarvisTranscript(command);
        return;
      }

      // WAKE-WORD MODE (opt-in): stay passive until "Hey Omni"/"Octagon" arms it.
      const armed = Date.now() < jarvisArmedUntil;
      if (armed) {
        jarvisArmedUntil = 0;
        if (input) input.value = heard;
        processJarvisTranscript(heard);
        return;
      }
      if (wake) {
        jarvisArmedUntil = Date.now() + 9000;
        try { window.JarvisOrb && window.JarvisOrb.say(t('نعم؟', 'YES?'), t('أنا أسمعك — تفضّل', 'I am listening — go ahead')); } catch (_) {}
        if (wake.remainder) {
          jarvisArmedUntil = 0;
          if (input) input.value = wake.remainder;
          processJarvisTranscript(wake.remainder);
        }
        return;
      }
      showJarvisHeard(t('قل "يا أومني" أو "أوكتاجون" للأمر', 'Say "Hey Omni" or "Octagon" to command'));
    };
    recognition.onaudiostart = () => {
      // The mic actually started delivering audio to the engine — it's truly alive.
      jarvisAudioStartedAt = Date.now();
      jarvisLastHeardAt = Date.now();
      jarvisConsecErrors = 0;
      clearJarvisProblem();
    };
    // soundstart/speechstart confirm real audio is reaching the engine (not just an
    // open-but-deaf session). Keep the watchdog from declaring the mic dead.
    recognition.onsoundstart = () => { jarvisLastHeardAt = Date.now(); clearJarvisProblem(); };
    recognition.onspeechstart = () => { jarvisLastHeardAt = Date.now(); clearJarvisProblem(); };
    recognition.onend = () => {
      state.jarvisListening = false;
      // Restart only if Omni is active, not speaking, and not explicitly stopped.
      if (jarvisHardStopped || !state.jarvisActive) return;
      if (state.busy || shouldHoldJarvisMic()) scheduleJarvisListening(500);
      else scheduleJarvisListening(100);
    };
    recognition.onerror = event => {
      state.jarvisListening = false;
      if (jarvisHardStopped || !state.jarvisActive) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast(t('تم رفض إذن الميكروفون. فعّل الإذن ثم أعد تشغيل وضع أومني.', 'Microphone permission denied. Allow access and restart Omni Mode.'), 'warning');
        stopJarvis(true);
        return;
      }
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Chrome ends the session after a few seconds of silence — just revive it.
        if (!jarvisHardStopped && state.jarvisActive) scheduleJarvisListening(250);
        return;
      }
      if (event.error === 'audio-capture') {
        toast(t('لا يوجد ميكروفون متاح. تأكد من توصيل ميكروفون وأنه يعمل.', 'No microphone found. Make sure a working mic is connected.'), 'warning');
        stopJarvis(true);
        return;
      }
      // A real error (network / engine hiccup / unknown) with no audio in between.
      // Count the streak so the watchdog and UI can tell a dead session from silence.
      jarvisConsecErrors++;
      if (event.error === 'network') {
        // The browser speech engine (Chrome/Edge) streams audio to Google and
        // needs the internet. Offline => it can never hear. Tell the user once,
        // and point them to the push-to-talk record button (sends to the model).
        if (!jarvisNetworkHintShown) {
          jarvisNetworkHintShown = true;
          toast(t('التعرّف الصوتي في المتصفح يحتاج إنترنت. إن كنت غير متصل، استخدم زر التسجيل 🎙️ بالأسفل.', 'Browser speech-to-text needs internet. If you are offline, use the record button 🎙️ below.'), 'warning');
        }
        showJarvisProblem(t('انقطع التعرّف الصوتي (إنترنت؟). أُعيد المحاولة… أو استخدم زر 🎙️ بالأسفل.',
                            'Speech recognition dropped (internet?). Retrying… or use the 🎙️ button below.'));
        // keep trying quietly; connectivity may come back
      } else if (jarvisConsecErrors >= 2) {
        // Several failures with NO audio in between — surface it instead of a fake "listening".
        showJarvisProblem(t('لا أستطيع السماع الآن. تحقق من الميكروفون/الإنترنت أو استخدم زر 🎙️ بالأسفل.',
                            "I can't hear right now. Check the mic/internet or use the 🎙️ button below."));
      }
      console.warn('Omni speech error:', event.error, '(streak ' + jarvisConsecErrors + ')');
      if (!jarvisHardStopped && state.jarvisActive) scheduleJarvisListening(400);
    };
    return recognition;
  }
  function getJarvisRecognition() {
    if (!jarvisRecognition) jarvisRecognition = buildJarvisRecognition();
    if (!jarvisRecognition) return null;
    jarvisRecognition.lang = jarvisLangCodes()[0];
    return jarvisRecognition;
  }
  function primeJarvisMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve(true);
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
        return true;
      })
      .catch(() => false);
  }
  function startJarvisListening() {
    if (window.JarvisVoiceRuntime) {
      window.JarvisVoiceRuntime.start();
      state.jarvisListening = true;
      return;
    }
  }
  function stopJarvisListening() {
    state.jarvisListening = false;
    if (window.JarvisVoiceRuntime) {
      window.JarvisVoiceRuntime.stop();
      return;
    }
    if (!jarvisRecognition) return;
    try { jarvisRecognition.abort(); } catch (_) {}
    jarvisRecognition = null;
  }

  // Is hands-free listening even possible in this browser/context?
  function jarvisListenSupport() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return { ok: false, reason: 'browser' };
    let secure = true;
    try { secure = (window.isSecureContext !== false); } catch (_) {}
    if (!secure) return { ok: false, reason: 'insecure' };
    return { ok: true };
  }

  // Show what Omni is hearing live, inside the wave indicator.
  function showJarvisHeard(text) {
    const indicator = document.getElementById('jarvisWaveIndicator');
    if (!indicator) return;
    const statusText = indicator.querySelector('.jarvis-status-text');
    if (statusText && text) {
      const clean = String(text).slice(0, 60);
      statusText.textContent = '“' + clean + (text.length > 60 ? '…' : '') + '”';
    }
  }
  // Make the wave indicator HONEST: when the mic isn't actually capturing (engine
  // dead, network drop, device busy) show why, in amber, instead of a fake "listening".
  function showJarvisProblem(msg) {
    jarvisProblemMsg = msg || '';
    const indicator = document.getElementById('jarvisWaveIndicator');
    if (!indicator) return;
    const statusText = indicator.querySelector('.jarvis-status-text');
    if (statusText) { statusText.textContent = msg; statusText.style.color = '#fbbf24'; }
    indicator.querySelectorAll('.wave-bar').forEach(bar => bar.style.animationPlayState = 'paused');
  }
  function clearJarvisProblem() {
    if (!jarvisProblemMsg) return;
    jarvisProblemMsg = '';
    const indicator = document.getElementById('jarvisWaveIndicator');
    if (!indicator) return;
    const statusText = indicator.querySelector('.jarvis-status-text');
    if (statusText) statusText.style.color = '';
  }
  // Hard rebuild: a wedged SpeechRecognition often won't recover from stop()/start();
  // throw it away and make a fresh one. Used by the watchdog when the mic goes deaf.
  function rebuildJarvisRecognition() {
    try { if (jarvisRecognition) jarvisRecognition.abort(); } catch (_) {}
    jarvisRecognition = null;
    state.jarvisListening = false;
    scheduleJarvisListening();
  }


  function ensureJarvisListening() {
    if (window.JarvisVoiceRuntime) return;
    if (jarvisHardStopped || !state.jarvisActive) return;
    if (jarvisSpeechInFlight) return;
    if (Date.now() < jarvisSpeakingUntil) return;
    if (state.jarvisStatus === 'speaking') setJarvisStatus('idle');
    if (state.busy) return;
    const now = Date.now();
    if (!state.jarvisListening) {
      if (now - jarvisLastRestartAt > 1200) { jarvisLastRestartAt = now; scheduleJarvisListening(); }
      return;
    }
    if (jarvisListenStartedAt && now - jarvisListenStartedAt > 6000 &&
        (!jarvisAudioStartedAt || jarvisAudioStartedAt < jarvisListenStartedAt) &&
        now - jarvisLastRestartAt > 6000) {
      jarvisLastRestartAt = now;
      showJarvisProblem(t('لا أستقبل صوتاً من الميكروفون. أُعيد التشغيل… تحقق من الميكروفون أو استخدم زر 🎙️ بالأسفل.',
                          'No audio from the mic. Restarting… check the mic, or use the 🎙️ button below.'));
      rebuildJarvisRecognition();
      return;
    }
    if (jarvisLastHeardAt && now - jarvisLastHeardAt > 25000 && now - jarvisLastRestartAt > 12000) {
      jarvisLastRestartAt = now;
      try { if (jarvisRecognition) jarvisRecognition.stop(); } catch (_) {}
    }
  }
  function startJarvisWatchdog() {
    if (window.JarvisVoiceRuntime) return;
    if (jarvisWatchdog) return;
    jarvisWatchdog = setInterval(ensureJarvisListening, 3000);
  }
  function stopJarvisWatchdog() {
    if (window.JarvisVoiceRuntime) return;
    if (jarvisWatchdog) { clearInterval(jarvisWatchdog); jarvisWatchdog = null; }
  }

  function matchJarvisPage(transcript) {
    const text = normalizeJarvisText(transcript);
    if (!text) return null;
    const openPrefix = /^(افتح|open|show|go to|switch to|خذني إلى|انتقل إلى)\s+/i;
    const normalized = text.replace(openPrefix, '').trim() || text;
    let best = null;
    let bestScore = 0;
    Object.keys(JARVIS_PAGE_TRIGGERS).forEach(page => {
      JARVIS_PAGE_TRIGGERS[page].forEach(trigger => {
        const needle = normalizeJarvisText(trigger);
        if (!needle) return;
        if (normalized === needle || normalized.includes(needle) || text.includes(needle)) {
          const score = needle.length;
          if (score > bestScore) {
            bestScore = score;
            best = page;
          }
        }
      });
    });
    return best;
  }

  function extractJarvisAction(transcript) {
    const text = normalizeJarvisText(transcript);
    if (!text) return null;
    
    let detectedAction = null;
    let actionConfidence = 0;
    
    Object.keys(JARVIS_ACTION_TRIGGERS).forEach(action => {
      JARVIS_ACTION_TRIGGERS[action].forEach(trigger => {
        const needle = normalizeJarvisText(trigger);
        if (text.includes(needle)) {
          const confidence = needle.length / text.length;
          if (confidence > actionConfidence) {
            actionConfidence = confidence;
            detectedAction = action;
          }
        }
      });
    });
    
    return detectedAction;
  }

  function parseComplexCommand(transcript) {
    const text = normalizeJarvisText(transcript);
    if (!text) return null;
    
    const result = {
      action: null,
      target: null,
      parameters: {},
      page: currentKey(),
      confidence: 0
    };
    
    // Extract action
    result.action = extractJarvisAction(text);
    
    // Extract page if mentioned
    const pageMatch = matchJarvisPage(text);
    if (pageMatch) {
      result.target = pageMatch;
      result.page = pageMatch;
    }
    
    // Extract common parameters
    const numberMatch = text.match(/\d+/);
    if (numberMatch) {
      result.parameters.number = parseInt(numberMatch[0]);
    }
    
    // Extract date references
    const datePatterns = ['اليوم', 'today', 'غداً', 'tomorrow', 'هذا الأسبوع', 'this week'];
    datePatterns.forEach(pattern => {
      if (text.includes(normalizeJarvisText(pattern))) {
        result.parameters.timeframe = pattern;
      }
    });
    
    // Calculate confidence based on matches
    let confidence = 0;
    if (result.action) confidence += 0.4;
    if (result.target) confidence += 0.3;
    if (Object.keys(result.parameters).length > 0) confidence += 0.3;
    result.confidence = confidence;
    
    return result.confidence > 0.4 ? result : null;
  }
  function navigateByJarvis(page) {
    if (!page) return false;
    try {
      if (typeof switchPage === 'function') switchPage(page);
      speakJarvis(t(`تم فتح ${pageLabel(page)}`, `Opening ${pageLabel(page)}`));
      if (state.open) render();
      updateAttentionBadge();
      return true;
    } catch (_) {
      return false;
    }
  }
  async function processJarvisTranscript(transcript) {
    const text = normalizeJarvisText(transcript);
    if (!text) return;
    // Lock the conversation language to the listen language (AR/EN chip): the brain
    // will think + reply in it, and TTS will speak it. English in -> English out.
    try { window.__jarvisReplyLang = jarvisListenFamily(); } catch (_) {}
    pauseJarvisListening();
    const input = document.getElementById('ptxAIInput');
    if (input) input.value = transcript.trim();

    const stopPatterns = ['أوقف أومني', 'ايقاف أومني', 'إيقاف أومني', 'أوقف جارفيس', 'ايقاف جارفيس', 'إيقاف جارفيس',
      'stop omni', 'disable omni', 'turn off omni', 'stop jarvis', 'disable jarvis', 'turn off jarvis', 'إلغاء', 'cancel'];
    if (stopPatterns.some(pattern => text.includes(normalizeJarvisText(pattern)))) {
      stopJarvis(true);
      speakJarvis(t('تم إيقاف وضع أومني.', 'Omni Mode deactivated.'), false);
      return;
    }
    
    // Check for workflow commands first
    const workflowKey = detectJarvisWorkflow(text);
    if (workflowKey) {
      const workflow = JARVIS_WORKFLOWS[workflowKey];
      speakJarvis(t(`جاري بدء ${workflow.name}`, `Starting ${workflow.name_en}`));
      await executeJarvisWorkflow(workflowKey);
      return;
    }

    const scanPatterns = ['افحص القسم', 'افحص الصفحة', 'افحص', 'scan page', 'scan section', 'scan this', 'فحص'];
    if (scanPatterns.some(pattern => text.includes(normalizeJarvisText(pattern)))) {
      speakJarvis(t('جاري فحص القسم الحالي.', 'Scanning the current section now.'));
      quick('scan');
      return;
    }

    const summaryPatterns = ['لخص الحالة', 'لخص القسم', 'summary', 'summarize', 'تلخيص'];
    if (summaryPatterns.some(pattern => text.includes(normalizeJarvisText(pattern)))) {
      speakJarvis(t('جاري تلخيص حالة القسم.', 'Summarizing this section now.'));
      quick('summary');
      return;
    }

    const attentionPatterns = ['تحتاج انتباه', 'انتباهي', 'needs attention', 'what needs attention', 'ما هو المهم'];
    if (attentionPatterns.some(pattern => text.includes(normalizeJarvisText(pattern)))) {
      speakJarvis(t('أعرض لك ما يحتاج انتباهك.', 'Showing what needs your attention.'));
      showAttention();
      return;
    }

    // ===== Omni Brain: understand any natural request + run real ERP actions =====
    // Hands-free speech goes through the SAME core pipeline (runOmniTurn) as typed
    // text and recorded voice notes — one brain path for every input channel.
    if (window.JarvisBrain && typeof window.JarvisBrain.handle === 'function') {
      if (input) input.value = '';
      await runOmniTurn(transcript.trim(), { channel: 'handsfree', spoken: true });
      return;
    }

    // Handle conversational queries with AI
    const conversationalPatterns = ['ما هو', 'what is', 'كيف', 'how', 'لماذا', 'why', 'اشرح', 'explain', 'اقترح', 'suggest', 'ما رأيك', 'what do you think'];
    if (conversationalPatterns.some(pattern => text.includes(normalizeJarvisText(pattern)))) {
      setJarvisStatus('processing');
      updateJarvisButton();
      
      const aiResponse = await processWithAI(transcript);
      if (aiResponse) {
        speakJarvis(aiResponse);
        
        // Add to chat if panel is open
        if (state.open) {
          const chatStream = document.querySelector('.ptxai-stream');
          if (chatStream) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'ptxai-msg assistant';
            msgDiv.innerHTML = `<div class="ptxai-msg-text">${esc(aiResponse)}</div>`;
            chatStream.appendChild(msgDiv);
            chatStream.scrollTop = chatStream.scrollHeight;
          }
        }
      } else {
        speakJarvis(t('عذراً، لم أتمكن من معالجة طلبك', 'Sorry, I could not process your request'));
      }

      // Don't force 'idle' here — speakJarvis() keeps the 'speaking' guard until the
      // reply finishes, then resumes the mic. Resetting to idle would let the watchdog
      // re-open the mic mid-sentence and make Omni transcribe his own voice.
      updateJarvisButton();
      return;
    }

    // Try complex command parsing first
    const complexCommand = parseComplexCommand(transcript);
    if (complexCommand && complexCommand.confidence > 0.7) {
      speakJarvis(t(`فهمت: أريد ${complexCommand.action} على ${complexCommand.target || 'الصفحة الحالية'}`, 
                   `Understood: I want to ${complexCommand.action} on ${complexCommand.target || 'current page'}`));
      
      // Handle high-confidence commands directly
      if (complexCommand.action === 'create' && complexCommand.target) {
        navigateByJarvis(complexCommand.target);
        setTimeout(() => {
          speakJarvis(t('جاري فتح نموذج إنشاء جديد...', 'Opening new creation form...'));
        }, 1000);
        return;
      }
      
      if (complexCommand.action === 'list') {
        if (complexCommand.target) {
          navigateByJarvis(complexCommand.target);
        }
        speakJarvis(t('جاري عرض القائمة...', 'Showing list...'));
        return;
      }
    }

    // Fall back to simple page matching
    const page = matchJarvisPage(text);
    if (page && navigateByJarvis(page)) return;

    // Handle ERP-specific voice commands
    const erpCommands = handleERPVoiceCommands(text);
    if (erpCommands) {
      speakJarvis(erpCommands.response);
      if (erpCommands.action) {
        erpCommands.action();
      }
      return;
    }
    
    // Handle help requests
    const helpPatterns = ['مساعدة', 'help', 'ماذا يمكنني أن أقول', 'what can i say', 'أوامر صوتية', 'voice commands'];
    if (helpPatterns.some(pattern => text.includes(normalizeJarvisText(pattern)))) {
      speakJarvis(getJarvisHelpText());
      return;
    }

    if (state.busy) {
      speakJarvis(t('انتظر قليلاً، ما زلت أعالج الطلب السابق.', 'Please wait, I am still processing the previous request.'));
      return;
    }
    setJarvisStatus('processing');
    updateJarvisButton();
    await send();
  }

  function handleERPVoiceCommands(text) {
    const langCode = lang();
    
    // Inventory commands
    if (text.includes('مخزون') || text.includes('inventory')) {
      if (text.includes('منخفض') || text.includes('low')) {
        return {
          response: t('جاري فحص المواد ذات المخزون المنخفض...', 'Checking low stock items...'),
          action: () => {
            navigateByJarvis('inventory');
            setTimeout(() => {
              // Trigger low stock filter if available
              try {
                const lowStockBtn = document.querySelector('[data-action="filter-low-stock"]') || 
                                  document.querySelector('.filter-low-stock');
                if (lowStockBtn) lowStockBtn.click();
              } catch (_) {}
            }, 1500);
          }
        };
      }
    }
    
    // Task commands
    if (text.includes('مهام') || text.includes('tasks')) {
      if (text.includes('متأخرة') || text.includes('overdue')) {
        return {
          response: t('جاري عرض المهام المتأخرة...', 'Showing overdue tasks...'),
          action: () => {
            navigateByJarvis('task_manager');
            setTimeout(() => {
              try {
                const overdueFilter = document.querySelector('[data-filter="overdue"]');
                if (overdueFilter) overdueFilter.click();
              } catch (_) {}
            }, 1500);
          }
        };
      }
    }
    
    // Machine commands
    if (text.includes('ماكينة') || text.includes('machine')) {
      if (text.includes('صيانة') || text.includes('maintenance')) {
        return {
          response: t('جاري عرض المكائن التي تحتاج صيانة...', 'Showing machines needing maintenance...'),
          action: () => {
            navigateByJarvis('machines');
          }
        };
      }
    }
    
    // Finance commands (read-only)
    if (text.includes('مالية') || text.includes('finance')) {
      if (text.includes('ملخص') || text.includes('summary') || text.includes('حالة')) {
        return {
          response: t('جاري تحضير ملخص مالي عام...', 'Preparing financial summary...'),
          action: () => {
            navigateByJarvis('finance');
            setTimeout(() => {
              quick('summary');
            }, 1000);
          }
        };
      }
    }
    
    return null;
  }

  function getJarvisHelpText() {
    const helpTexts = {
      ar: `
        يمكنك استخدام الأوامر الصوتية التالية:
        - التنقل: افتح المخزون، اذهب للمهام، عرض المالية
        - السيرورات: تقرير صباحي، فحص المخزون المنخفض، حالة المكائن
        - الإجراءات: لخص الحالة، افحص القسم، ما يحتاج انتباه
        - التحكم: أوقف أومني، مساعدة
        - للتنقل بين الأقسام، قل "افتح" متبوعاً باسم القسم
      `,
      en: `
        You can use these voice commands:
        - Navigation: Open inventory, go to tasks, show finance
        - Workflows: Morning report, low stock check, machine status
        - Actions: Summarize status, scan section, what needs attention
        - Control: Stop Omni, help
        - To navigate, say "open" followed by the section name
      `
    };
    return helpTexts[lang()];
  }

  // Conversational AI — routed exclusively through the unified provider layer
  // (modules/ai-providers.js). The old direct Grok/Google fetch fallbacks were
  // removed: Grok was dead (CORS + deprecated model) and both exposed keys.
  async function callAdvancedAI(prompt, context = '') {
    try {
      const caller = window.callOctagonAi || window.callPentagonAi
        || (typeof callOctagonAi === 'function' ? callOctagonAi : null)
        || (typeof callPentagonAi === 'function' ? callPentagonAi : null);
      if (caller) {
        const sys = `${context}\n\n${t('أنت أومني، مساعد ذكي للنظام. كن دقيقاً وموجزاً ومناسباً للنطق الصوتي، وأجب بلغة المستخدم.', 'You are Omni, the ERP assistant. Be accurate, concise, voice-friendly, and answer in the user\'s language.')}`;
        const out = await caller(prompt, sys, { temperature: 0.4, task: 'fast' });
        if (out && String(out).trim()) return String(out).trim();
      }
    } catch (e) { console.warn('Omni conversational AI failed:', e); }
    return null;
  }

  async function processWithAI(transcript) {
    const context = aiContextForPage(currentKey());
    const response = await callAdvancedAI(transcript, context);

    if (response) {
      // Add to conversation history
      state.conversationHistory.push({ role: 'user', content: transcript });
      state.conversationHistory.push({ role: 'assistant', content: response });
      
      // Keep only last 10 messages
      if (state.conversationHistory.length > 10) {
        state.conversationHistory = state.conversationHistory.slice(-10);
      }

      return response;
    }

    return null;
  }
  function startJarvis() {
    const support = jarvisListenSupport();
    if (!support.ok) {
      if (support.reason === 'browser') {
        toast(t('متصفحك لا يدعم الاستماع المباشر. استخدم Chrome أو Edge، أو استخدم زر التسجيل 🎙️ بالأسفل.', 'This browser cannot do live listening. Use Chrome or Edge, or use the record button 🎙️ below.'), 'warning');
      } else if (support.reason === 'insecure') {
        toast(t('الاستماع يحتاج اتصالاً آمناً (localhost أو https). افتح النظام عبر الخادم وليس بفتح الملف مباشرة.', 'Listening needs a secure context (localhost or https). Open the system through the server, not by double-clicking the file.'), 'warning');
      }
      if (!state.open) toggle(true);
      return false;
    }

    if (!state.open) toggle(true);
    state.jarvisActive = true;
    jarvisHardStopped = false;
    updateJarvisButton();
    showJarvisWaveIndicator();
    try { window.JarvisOrb && window.JarvisOrb.wake(); } catch (_) {}

    // TAP TO TALK: pressing the orb/button IS the activation — this system only listens
    // after you press it, so demanding a wake word afterwards is a redundant second step
    // (and the Arabic wake words are hard for the browser recognizer). So an explicit
    // press always drops straight into direct listening: press → talk → it answers.
    jarvisWakeRequired = false;
    try { localStorage.setItem('jarvisWakeRequired', '0'); } catch (_) {}
    try { const wt = document.getElementById('jarvisWakeToggle'); if (wt) wt.checked = false; } catch (_) {}

    // Call new runtime
    if (window.JarvisVoiceRuntime) {
      if (typeof window.JarvisVoiceRuntime.setWakeWordRequired === 'function') {
        window.JarvisVoiceRuntime.setWakeWordRequired(false);
      }
      window.JarvisVoiceRuntime.start();
    }
    setTimeout(() => showProactiveSuggestions(), 2000);
    toast(t('أومني مفعّل — تكلّم الآن مباشرة، بدون كلمة تنبيه', 'Omni activated — just talk now, no wake word needed'), 'info');
    return true;
  }

  function getPersonalizedGreeting() {
    const hour = new Date().getHours();
    const page = currentKey();
    const langCode = lang();
    
    let timeGreeting;
    if (hour < 12) {
      timeGreeting = langCode === 'ar' ? 'صباح الخير' : 'Good morning';
    } else if (hour < 18) {
      timeGreeting = langCode === 'ar' ? 'مساء الخير' : 'Good afternoon';
    } else {
      timeGreeting = langCode === 'ar' ? 'مساء الخير' : 'Good evening';
    }
    
    const pageGreeting = langCode === 'ar' 
      ? `أنت الآن في قسم ${pageLabel(page)}. كيف يمكنني مساعدتك؟`
      : `You are now in the ${pageLabel(page)} section. How can I help you?`;
    
    return `${timeGreeting}. ${pageGreeting}`;
  }

  function showProactiveSuggestions() {
    const panel = document.getElementById('ptxAIPanel');
    if (!panel || !state.open) return;
    
    const suggestions = getProactiveSuggestionsForPage(currentKey());
    if (!suggestions || suggestions.length === 0) return;
    
    const chatStream = document.querySelector('.ptxai-stream');
    if (!chatStream) return;
    
    const suggestionDiv = document.createElement('div');
    suggestionDiv.className = 'ptxai-proactive-suggestions';
    suggestionDiv.innerHTML = `
      <div class="suggestions-header">
        <i class="fa-solid fa-lightbulb"></i>
        <span>${t('اقتراحات ذكية', 'Smart Suggestions')}</span>
      </div>
      <div class="suggestions-list">
        ${suggestions.map(s => `
          <button class="suggestion-btn" data-suggestion="${esc(s)}">
            <i class="fa-solid fa-microphone"></i>
            ${esc(s.substring(0, 50))}${s.length > 50 ? '...' : ''}
          </button>
        `).join('')}
      </div>
    `;
    
    chatStream.appendChild(suggestionDiv);
    chatStream.scrollTop = chatStream.scrollHeight;
    
    // Add click handlers
    suggestionDiv.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const suggestion = btn.dataset.suggestion;
        suggestionDiv.remove();
        processJarvisTranscript(suggestion);
      });
    });
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (suggestionDiv.parentNode) {
        suggestionDiv.remove();
      }
    }, 30000);
  }

  function getProactiveSuggestionsForPage(page) {
    const suggestions = {
      calculator: [
        t('ما هو ملخص الرواتب لهذا الشهر؟', 'What is the payroll summary for this month?'),
        t('هل هناك موظفين بأرصدة منخفضة؟', 'Are there employees with low balances?')
      ],
      inventory: [
        t('عرض المواد ذات المخزون المنخفض', 'Show low stock items'),
        t('اقترح طلبات شراء للمواد الناقصة', 'Suggest purchase orders for missing materials')
      ],
      task_manager: [
        t('ما المهام المتأخرة اليوم؟', 'What tasks are overdue today?'),
        t('رتب المهام حسب الأولوية', 'Prioritize tasks by importance')
      ],
      finance: [
        t('لخص الوضع المالي الحالي', 'Summarize current financial status'),
        t('ما هي المصروفات الكبرى هذا الشهر؟', 'What are the major expenses this month?')
      ],
      machines: [
        t('أي مكائن تحتاج صيانة عاجلة؟', 'Which machines need urgent maintenance?'),
        t('ما هو حالة تشغيل المكائن؟', 'What is the operational status of machines?')
      ],
      command_center: [
        t('ما القرارات المعلقة بانتظاري؟', 'What decisions are pending my attention?'),
        t('لخص حالة النظام العامة', 'Summarize overall system status')
      ]
    };
    
    return suggestions[page] || [];
  }

  function stopJarvis(silent = false) {
    state.jarvisActive = false;
    jarvisHardStopped = true;
    setJarvisStatus('idle');
    hideJarvisWaveIndicator();
    try { window.JarvisOrb && window.JarvisOrb.sleep(); } catch (_) {}
    updateJarvisButton();
    resetJarvisInputPlaceholder();
    
    // Interrupt any active speech/synthesis
    interruptJarvisSpeech(false);
    
    // Call new runtime
    if (window.JarvisVoiceRuntime) {
      window.JarvisVoiceRuntime.stop();
    }
    if (!silent) toast(t('تم إيقاف وضع أومني.', 'Omni Mode deactivated.'), 'info');
  }

  function showJarvisWaveIndicator() {
    const panel = document.getElementById('ptxAIPanel');
    if (!panel) return;
    
    let waveIndicator = document.getElementById('jarvisWaveIndicator');
    if (!waveIndicator) {
      waveIndicator = document.createElement('div');
      waveIndicator.id = 'jarvisWaveIndicator';
      waveIndicator.innerHTML = `
        <div class="jarvis-wave">
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
          <div class="wave-bar"></div>
        </div>
        <div class="jarvis-status-text">${t('يشغّل المايك… لحظة', 'Starting the mic…')}</div>
      `;
      
      const quickbar = panel.querySelector('.ptxai-quickbar');
      if (quickbar && quickbar.nextSibling) {
        panel.insertBefore(waveIndicator, quickbar.nextSibling);
      }
    }
    
    waveIndicator.style.display = 'block';
  }

  function hideJarvisWaveIndicator() {
    const waveIndicator = document.getElementById('jarvisWaveIndicator');
    if (waveIndicator) {
      waveIndicator.style.display = 'none';
    }
  }

  function updateJarvisWaveIndicator(status) {
    const waveIndicator = document.getElementById('jarvisWaveIndicator');
    if (!waveIndicator) return;
    
    const statusText = waveIndicator.querySelector('.jarvis-status-text');
    const waveBars = waveIndicator.querySelectorAll('.wave-bar');

    // If the mic is known-broken, keep the honest warning — don't overwrite it with
    // a fake "listening" on the next status tick. (Cleared the moment real audio arrives.)
    if (jarvisProblemMsg && status === 'listening') {
      statusText.textContent = jarvisProblemMsg;
      statusText.style.color = '#fbbf24';
      waveBars.forEach(bar => bar.style.animationPlayState = 'paused');
      return;
    }
    if (statusText) statusText.style.color = '';

    switch (status) {
      case 'listening':
        statusText.textContent = t('أومني يستمع...', 'Omni Listening...');
        waveBars.forEach(bar => bar.style.animationPlayState = 'running');
        break;
      case 'processing':
        statusText.textContent = t('أومني يفكر...', 'Omni Thinking...');
        waveBars.forEach(bar => bar.style.animationPlayState = 'paused');
        break;
      case 'speaking':
        statusText.textContent = t('أومني يتحدث...', 'Omni Speaking...');
        waveBars.forEach(bar => bar.style.animationPlayState = 'paused');
        break;
      default:
        statusText.textContent = t('أومني جاهز', 'Omni Ready');
        waveBars.forEach(bar => bar.style.animationPlayState = 'paused');
    }
  }
  function stopJarvis(silent = false) {
    state.jarvisActive = false;
    jarvisHardStopped = true;
    setJarvisStatus('idle');
    hideJarvisWaveIndicator();
    try { window.JarvisOrb && window.JarvisOrb.sleep(); } catch (_) {}
    updateJarvisButton();
    resetJarvisInputPlaceholder();
    
    // Interrupt any active speech/synthesis
    interruptJarvisSpeech(false);
    
    // Call new runtime
    if (window.JarvisVoiceRuntime) {
      window.JarvisVoiceRuntime.stop();
    }
    if (!silent) toast(t('تم إيقاف وضع أومني.', 'Omni Mode deactivated.'), 'info');
  }
  function toggleJarvis(force) {
    const next = typeof force === 'boolean' ? force : !state.jarvisActive;
    if (next) startJarvis();
    else stopJarvis();
  }

  function detectJarvisWorkflow(transcript) {
    const text = normalizeJarvisText(transcript);
    if (!text) return null;
    
    const workflowPatterns = {
      low_stock_check: ['مخزون منخفض', 'low stock', 'فحص المواد', 'check materials', 'مواد ناقصة', 'missing materials'],
      morning_report: ['تقرير صباحي', 'morning report', 'ملخص اليوم', 'daily summary', 'وضع اليوم', 'today status'],
      machine_status: ['حالة المكائن', 'machine status', 'فحص المكائن', 'check machines', 'صيانة', 'maintenance']
    };
    
    for (const [workflowKey, patterns] of Object.entries(workflowPatterns)) {
      for (const pattern of patterns) {
        if (text.includes(normalizeJarvisText(pattern))) {
          return workflowKey;
        }
      }
    }
    
    return null;
  }

  async function executeJarvisWorkflow(workflowKey) {
    const workflow = JARVIS_WORKFLOWS[workflowKey];
    if (!workflow) return;
    
    state.activeWorkflow = workflowKey;
    state.workflowStep = 0;
    
    showWorkflowProgress(workflowKey);
    
    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        state.workflowStep = i;
        
        updateWorkflowProgress(i, workflowKey);
        await executeWorkflowStep(step, workflowKey);
        
        // Wait between steps for natural pacing
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      speakJarvis(t(`اكتملت ${workflow.name}`, `Completed ${workflow.name_en}`));
      hideWorkflowProgress();
    } catch (error) {
      console.error('Workflow error:', error);
      speakJarvis(t('حدث خطأ أثناء تنفيذ السيرورة', 'Error during workflow execution'));
      hideWorkflowProgress();
    } finally {
      state.activeWorkflow = null;
      state.workflowStep = 0;
    }
  }

  function showWorkflowProgress(workflowKey) {
    const workflow = JARVIS_WORKFLOWS[workflowKey];
    if (!workflow) return;
    
    const panel = document.getElementById('ptxAIPanel');
    if (!panel) return;
    
    // Remove existing progress if any
    const existing = document.getElementById('ptxaiWorkflowProgress');
    if (existing) existing.remove();
    
    // Create progress indicator
    const progressDiv = document.createElement('div');
    progressDiv.id = 'ptxaiWorkflowProgress';
    progressDiv.className = 'ptxai-workflow-progress active';
    
    const workflowName = lang() === 'ar' ? workflow.name : workflow.name_en;
    progressDiv.innerHTML = `
      <div class="ptxai-workflow-title">
        <i class="fa-solid fa-robot"></i>
        <span>${workflowName}</span>
      </div>
      <div class="ptxai-workflow-steps">
        ${workflow.steps.map((step, i) => `
          <div class="ptxai-workflow-step" data-step="${i}">
            <i class="fa-solid fa-circle"></i>
            <span>${step.message.substring(0, 50)}${step.message.length > 50 ? '...' : ''}</span>
          </div>
        `).join('')}
      </div>
    `;
    
    // Insert after the quickbar
    const quickbar = panel.querySelector('.ptxai-quickbar');
    if (quickbar && quickbar.nextSibling) {
      panel.insertBefore(progressDiv, quickbar.nextSibling);
    }
  }

  function updateWorkflowProgress(currentStep, workflowKey) {
    const progressDiv = document.getElementById('ptxaiWorkflowProgress');
    if (!progressDiv) return;
    
    const steps = progressDiv.querySelectorAll('.ptxai-workflow-step');
    steps.forEach((stepEl, i) => {
      stepEl.classList.remove('active', 'completed');
      const icon = stepEl.querySelector('i');
      
      if (i < currentStep) {
        stepEl.classList.add('completed');
        icon.className = 'fa-solid fa-check';
      } else if (i === currentStep) {
        stepEl.classList.add('active');
        icon.className = 'fa-solid fa-spinner fa-spin';
      } else {
        icon.className = 'fa-solid fa-circle';
      }
    });
  }

  function hideWorkflowProgress() {
    const progressDiv = document.getElementById('ptxaiWorkflowProgress');
    if (progressDiv) {
      progressDiv.remove();
    }
  }

  async function executeWorkflowStep(step, workflowKey) {
    speakJarvis(step.message);
    
    switch (step.action) {
      case 'navigate':
        if (step.page) {
          navigateByJarvis(step.page);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        break;
        
      case 'filter':
        // Simulate filter action - in real implementation, would interact with UI
        console.log('Applying filter:', step.filter);
        break;
        
      case 'check_attention':
        showAttention();
        break;
        
      case 'speak':
        // Message already spoken above
        break;
        
      default:
        console.log('Unknown step action:', step.action);
    }
  }

  function aiContextForPage(key) {
    let base = '';
    try {
      const builder = window.buildOctagonAiContext || window.buildPentagonAiContext || (typeof buildOctagonAiContext === 'function' ? buildOctagonAiContext : null) || (typeof buildPentagonAiContext === 'function' ? buildPentagonAiContext : null);
      if (builder) base = builder();
    } catch (_) {}
    
    let pageContext = '';
    try {
      pageContext = buildERPSpecificContext(key);
    } catch (_) {}
    
    return `${base}

=== ${t('سياق التبويب الحالي', 'Current Page Context')} ===
${t('المستخدم الآن داخل تبويب', 'The user is currently on page')}: "${pageLabel(key)}" (${key}).
${t('ركز إجابتك على هذا التبويب وبياناته، وقدّم خطوات عملية آمنة. إذا كان الطلب حساساً فحوّله إلى موافقة ولا تنفذه مباشرة.', 'Focus on this page and its data. Give safe operational steps. If the request is sensitive, route it to approval instead of executing it directly.')}
${pageContext}

${t('إذا وجدت خطوات آمنة قابلة للتحويل إلى مهمة أو طلب موافقة، أضف في آخر الرد كتلة JSON اختيارية بهذا الشكل:', 'If there are safe follow-up actions, optionally add this JSON block at the end:')}
\`\`\`json
{"actions":["${t('عنوان خطوة قصيرة', 'Short action title')}"]}
\`\`\`

${t('وضع أومني الصوتي مفعّل. المستخدم قد يطلب إجراءات صوتية. كن موجزاً في الردود الشفهية.', 'Omni voice mode is active. User may request voice actions. Keep responses concise for speech.')}`;
  }

  function buildERPSpecificContext(key) {
    const contexts = {
      calculator: t('هذا قسم الرواتب. يحتوي على بيانات الموظفين، الحسابات، والعمولات. الإجراءات الحساسة: تعديل الرواتب، حذف موظفين.', 
                      'This is payroll section. Contains employee data, calculations, and commissions. Sensitive actions: modifying salaries, deleting employees.'),
      inventory: t('هذا قسم المخزون. يحتوي على المواد، الكميات، الحد الأدنى، والموردين. الإجراءات المتاحة: طلب شراء، تحديث الكميات، عرض المواد المنخفضة.',
                   'This is inventory section. Contains materials, quantities, minimum levels, and suppliers. Available actions: purchase requests, update quantities, show low stock items.'),
      task_manager: t('هذا قسم إدارة المهام. يحتوي على المهام، الموظفين المسؤولين، المواعيد النهائية، والحالات. الإجراءات المتاحة: إنشاء مهمة، تحديث الحالة، تعيين موظف.',
                      'This is task management section. Contains tasks, responsible employees, deadlines, and statuses. Available actions: create task, update status, assign employee.'),
      finance: t('هذا قسم المالية. يحتوي على القيود المحاسبية، الحسابات، والتقارير المالية. الإجراءات الحساسة: إنشاء قيود، حذف حسابات، تعديل الأرصدة. للقراءة فقط في وضع أومني.',
                 'This is finance section. Contains journal entries, accounts, and financial reports. Sensitive actions: create entries, delete accounts, modify balances. Read-only in Omni mode.'),
      kanban: t('هذه اللوحة التنفيذية. تعرض تقدم العمليات، البطاقات، والحالة. الإجراءات المتاحة: تحريك البطاقات، تحديث الحالة، إضافة تعليقات.',
                'This is execution board. Shows operation progress, cards, and status. Available actions: move cards, update status, add comments.'),
      machines: t('هذا قسم المكائن. يحتوي على معلومات الماكينة، جدول الصيانة، والحالة التشغيلية. الإجراءات المتاحة: تسجيل مشكلة، تحديث حالة الصيانة.',
                  'This is machines section. Contains machine information, maintenance schedule, and operational status. Available actions: report issue, update maintenance status.'),
      whatsapp: t('هذا قسم واتساب. يحتوي على المجموعات، الرسائل، والتكامل. الإجراءات المتاحة: إرسال رسائل، مراجعة المحادثات، تلخيص الرسائل المعلقة.',
                  'This is WhatsApp section. Contains groups, messages, and integration. Available actions: send messages, review conversations, summarize pending messages.'),
      telegram: t('هذا موصل تلغرام (Telegram Connector). يحتوي على حالة البوت، صندوق الرسائل، قائمة الإرسال بانتظار الموافقة، وحالات الأتمتة. أومني يجهز ويقترح مسودات فقط ولا يرسل بدون موافقة بشرية. لا يُعرض أو يُخزّن أي توكن في المتصفح؛ التوكن Server-side فقط.',
                   'This is the Telegram Connector. Contains bot status, message inbox, an approval-gated outbound queue, and automation use-cases. Omni only drafts and suggests; it never sends without human approval. No bot token is shown or stored in the browser — the token stays server-side only.'),
      command_center: t('مركز القيادة. يعرض نظرة عامة على النظام، التنبيهات، والقرارات المعلقة. الإجراءات المتاحة: الموافقة على الطلبات، مراجعة التنبيهات.',
                        'Command center. Shows system overview, alerts, and pending decisions. Available actions: approve requests, review alerts.'),
      intelligence: t('عقل النظام. يوفر تحليلات ذكية، توصيات، و رؤى. الإجراءات المتاحة: تشغيل تحليل، مراجعة التوصيات، إنشاء تقارير ذكية.',
                      'System brain. Provides intelligent analysis, recommendations, and insights. Available actions: run analysis, review recommendations, create smart reports.')
    };
    
    return contexts[key] || '';
  }

  function parseActions(raw) {
    let text = String(raw || '');
    let actions = [];

    // Sanitize typical LLM JSON format issues (smart quotes, trailing commas,
    // raw control chars inside strings, single-quoted keys/values) before parsing.
    // Pure text transform — no DOM/visual coupling. Kept from the reverted redesign
    // because it hardens safe-action parsing and stands on its own.
    function sanitize(jsonStr) {
      jsonStr = jsonStr.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');

      let insideString = false;
      let quoteChar = null;
      let result = '';
      for (let i = 0; i < jsonStr.length; i++) {
        let char = jsonStr[i];
        let prev = jsonStr[i - 1];
        if ((char === '"' || char === "'") && prev !== '\\') {
          if (!insideString) { insideString = true; quoteChar = char; }
          else if (char === quoteChar) { insideString = false; quoteChar = null; }
        }
        if (insideString) {
          if (char === '\n') result += '\\n';
          else if (char === '\r') result += '\\r';
          else if (char === '\t') result += '\\t';
          else result += char;
        } else {
          result += char;
        }
      }
      jsonStr = result;

      jsonStr = jsonStr.replace(/(^|[{,\s])'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '$1"$2":');
      jsonStr = jsonStr.replace(/(:\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[,}])/g, '$1"$2"');
      jsonStr = jsonStr.replace(/(^|[,\[\s])'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[,\]])/g, '$1"$2"');
      return jsonStr;
    }

    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i) || text.match(/```\s*(\{[\s\S]*?"actions"[\s\S]*?\})\s*```/i);
    let matchedBlock = null;
    let jsonBlock = null;

    if (match) {
      matchedBlock = match[0];
      const rawCandidate = match[1].trim();
      try {
        jsonBlock = JSON.parse(rawCandidate);
      } catch (_) {
        try { jsonBlock = JSON.parse(sanitize(rawCandidate)); } catch (__) {}
      }
    }

    // If no fenced block parsed, scan for a balanced {...} that contains "actions".
    if (!jsonBlock) {
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
          let depth = 0;
          let insideString = false;
          let quoteChar = null;
          for (let j = i; j < text.length; j++) {
            let c = text[j];
            let prev = text[j - 1];
            if ((c === '"' || c === "'") && prev !== '\\') {
              if (!insideString) { insideString = true; quoteChar = c; }
              else if (c === quoteChar) { insideString = false; quoteChar = null; }
            }
            if (!insideString) {
              if (c === '{') depth++;
              else if (c === '}') {
                depth--;
                if (depth === 0) {
                  const candidate = text.slice(i, j + 1);
                  if (candidate.includes('actions')) {
                    try {
                      jsonBlock = JSON.parse(candidate);
                      matchedBlock = candidate;
                    } catch (_) {
                      try { jsonBlock = JSON.parse(sanitize(candidate)); matchedBlock = candidate; } catch (__) {}
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (jsonBlock && typeof jsonBlock === 'object') {
      if (Array.isArray(jsonBlock.actions)) {
        actions = jsonBlock.actions
          .map(a => (typeof a === 'string' ? a : a?.title || ''))
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 3);
      }
      if (matchedBlock) text = text.replace(matchedBlock, '').trim();
    }

    return { text, actions };
  }

  function localAttention() {
    const out = [];
    try {
      const queue = (typeof getAiControl === 'function' ? getAiControl().actionQueue : []) || [];
      const count = queue.filter(item => item.status === 'pending').length;
      if (count) out.push({ label: t('موافقات معلقة بانتظارك', 'Pending approvals'), count, page: 'intelligence', short: t('الذكاء', 'AI') });
    } catch (_) {}
    try {
      const materials = (typeof omni !== 'undefined' && Array.isArray(omni.materials)) ? omni.materials : [];
      const count = materials.filter(item => typeof item.stock === 'number' && typeof item.minimum === 'number' && item.stock <= item.minimum).length;
      if (count) out.push({ label: t('مواد تحت الحد الأدنى', 'Materials below minimum'), count, page: 'inventory', short: t('المخزون', 'Inventory') });
    } catch (_) {}
    try {
      const machines = (typeof omni !== 'undefined' && Array.isArray(omni.machines)) ? omni.machines : [];
      const count = machines.filter(item => String(item.status) === 'maintenance').length;
      if (count) out.push({ label: t('مكائن بالصيانة', 'Machines in maintenance'), count, page: 'machines', short: t('المكائن', 'Machines') });
    } catch (_) {}
    try {
      const whatsApp = (typeof omni !== 'undefined' && Array.isArray(omni.whatsappSuggestions)) ? omni.whatsappSuggestions : [];
      const count = whatsApp.filter(item => item.status === 'pending').length;
      if (count) out.push({ label: t('رسائل واتساب بانتظار المراجعة', 'WhatsApp messages pending review'), count, page: 'whatsapp', short: 'WhatsApp' });
    } catch (_) {}
    try {
      const tgQueue = (typeof omni !== 'undefined' && omni.telegram && Array.isArray(omni.telegram.outboundQueue)) ? omni.telegram.outboundQueue : [];
      const count = tgQueue.filter(item => item.status === 'pending_approval').length;
      if (count) out.push({ label: t('مسودات تلغرام بانتظار موافقتك', 'Telegram drafts awaiting your approval'), count, page: 'telegram', short: 'Telegram' });
    } catch (_) {}
    try {
      if (typeof getAllTaskManagerTasks === 'function') {
        const tasks = getAllTaskManagerTasks(true) || [];
        const count = tasks.filter(item => {
          const status = (item.task && item.task.status) || item.status;
          return status && !['done', 'completed', 'closed', 'archived'].includes(String(status).toLowerCase());
        }).length;
        if (count) out.push({ label: t('مهام مفتوحة', 'Open tasks'), count, page: 'task_manager', short: t('المهام', 'Tasks') });
      }
    } catch (_) {}
    return out;
  }
  function attentionTotal() {
    return localAttention().reduce((sum, item) => sum + (item.count || 0), 0);
  }
  function unreadNotificationTotal() {
    try {
      if (Number.isFinite(window.__octagonUnreadNotificationCount)) return window.__octagonUnreadNotificationCount;
    } catch (_) {}
    try {
      if (typeof window.getOctagonUnreadNotificationCount === 'function') return window.getOctagonUnreadNotificationCount();
    } catch (_) {}
    try {
      if (typeof window.getUnreadNotifications === 'function') return window.getUnreadNotifications().length;
    } catch (_) {}
    try {
      const list = window.omni && Array.isArray(window.omni.notifications) ? window.omni.notifications : [];
      return list.filter(n => n && n.status === 'unread').length;
    } catch (_) {
      return 0;
    }
  }
  function updateAttentionBadge() {
    const button = document.getElementById('ptxAIButton');
    if (!button) return;
    let badge = document.getElementById('ptxAIBadge');
    const total = loggedOut() ? 0 : unreadNotificationTotal();
    if (total > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'ptxAIBadge';
        button.appendChild(badge);
      }
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.style.display = '';
      button.dataset.notificationCount = String(total);
      button.title = t(`لديك ${total} إشعارات غير مقروءة`, `${total} unread notifications`);
    } else if (badge) {
      badge.style.display = 'none';
      button.dataset.notificationCount = '0';
    }
  }
  function showAttention() {
    const key = currentKey();
    if (!state.byPage[key]) state.byPage[key] = [];
    const items = localAttention();
    if (!items.length) {
      state.byPage[key].push({ role: 'ai', text: t('كل شيء تحت السيطرة حسب البيانات المتاحة الآن.', 'Everything looks under control based on the available data.') });
    } else {
      state.byPage[key].push({
        role: 'ai',
        text: items.map(item => `${item.label}: ${item.count}`).join('\n'),
        navActions: items.filter(item => item.page).map(item => ({ label: t('افتح ', 'Open ') + item.short, page: item.page }))
      });
    }
    render();
  }

  // (The old project-progress/review panel was removed from the assistant window:
  //  Omni's chat is for operating the system, not for build-status banners.)

  function jarvisToolSummary() {
    const tools = window.JarvisBrain && window.JarvisBrain.tools ? window.JarvisBrain.tools : {};
    const names = Object.keys(tools);
    const approval = names.filter(name => {
      const tool = tools[name] || {};
      const risk = String(tool.risk || '').toLowerCase();
      return tool.approvalRequired || tool.gated || risk === 'high' || risk === 'critical';
    }).length;
    return { count: names.length, approval, sample: names.slice(0, 4).join(', ') };
  }

  function currentRuntimeState() {
    try {
      if (window.JarvisVoiceRuntime && typeof window.JarvisVoiceRuntime.getState === 'function') {
        return window.JarvisVoiceRuntime.getState();
      }
    } catch (_) {}
    return state.jarvisStatus || 'idle';
  }

  function currentAiSourceLabel() {
    try {
      const status = window.OctagonAI && typeof window.OctagonAI.status === 'function' ? window.OctagonAI.status() : null;
      if (!status) return '';
      return `${status.lastProvider || status.activeProvider || 'AI'} / ${status.effectiveModel || status.model || '-'}`;
    } catch (_) {
      return '';
    }
  }

  function renderApiTestResults() {
    const results = state.apiTestResults;
    if (!results || !Array.isArray(results.items)) return '';
    return `<div class="jarvis-api-test-results">
      ${results.items.map(item => {
        const cls = item.ok ? 'ok' : 'fail';
        const icon = item.ok ? 'fa-check' : 'fa-triangle-exclamation';
        // Deep mode: show the capability checklist (Arabic / strict JSON) beside speed.
        let caps = '';
        if (results.deep && item.capabilities) {
          const cap = (key, name) => {
            const c = item.capabilities[key];
            if (!c) return '';
            return `<em class="${c.ok ? 'cap-ok' : 'cap-fail'}" title="${esc(c.error || (c.latencyMs + 'ms'))}">${name}${c.ok ? '✓' : '✗'}</em>`;
          };
          caps = ` ${cap('arabic', t('عربي', 'AR'))}${cap('json', 'JSON')}`;
        }
        const detail = item.ok ? (item.latencyMs + 'ms') : esc(item.error || 'failed');
        return `<span class="${cls}"><i class="fa-solid ${icon}"></i>${esc(item.label)}${caps} <b>${detail}</b></span>`;
      }).join('')}
    </div>`;
  }

  function modelShortLabel(id) {
    const map = {
      'qwen/qwen3.5-flash-02-23': 'Qwen Flash',
      'qwen/qwen-2.5-72b-instruct': 'Qwen 72B',
      'qwen/qwen-2.5-coder-32b-instruct': 'Qwen Coder',
      'deepseek/deepseek-chat': 'DeepSeek V3',
      'deepseek/deepseek-r1': 'DeepSeek R1',
      'claude-sonnet-4-6': 'Claude Sonnet 4.6',
      'claude-opus-4-8': 'Claude Opus 4.8',
      'gemini-flash': 'Gemini Flash'
    };
    if (!id) return '-';
    return map[id] || String(id).split('/').pop();
  }
  function omniStateLabel(s) {
    const map = {
      idle: t('جاهز', 'Idle'),
      listening: t('يستمع', 'Listening'),
      user_speaking: t('يسمعك', 'Hearing you'),
      thinking: t('يفكر', 'Thinking'),
      processing: t('يفكر', 'Thinking'),
      streaming: t('يرد', 'Replying'),
      speaking: t('يتحدث', 'Speaking'),
      interrupted: t('مقاطَع', 'Interrupted'),
      error: t('خطأ', 'Error')
    };
    return map[s] || s;
  }
  function omniConnections() {
    let dbRead = false;
    try { dbRead = !!(window.JarvisBrain && typeof window.JarvisBrain.snapshot === 'function' && typeof omni !== 'undefined' && omni); } catch (_) {}
    let approvalQueue = false;
    try { approvalQueue = typeof window.getAiControl === 'function' && Array.isArray(window.getAiControl().actionQueue); } catch (_) {}
    let knowledge = false;
    try { knowledge = typeof window.buildOctagonAiContext === 'function' || typeof window.buildPentagonAiContext === 'function' || typeof window.buildWorkshopAiContext === 'function'; } catch (_) {}
    const domActions = (window.JarvisSystemMap && Number(window.JarvisSystemMap.actionsCount)) || 0;
    return { dbRead, approvalQueue, knowledge, domActions };
  }

  // Compact Omni runtime bar: live status + provider/model + last API result +
  // honest local-fallback flag + tool visibility, with the full config tucked
  // behind the gear toggle so the chat itself stays clean.
  function renderJarvisStatusPanel() {
    const aiStatus = window.OctagonAI && typeof window.OctagonAI.status === 'function'
      ? window.OctagonAI.status()
      : { activeProvider: state.apiProvider || 'auto', model: '', effectiveModel: '', lastStatus: 'unknown', lastProvider: '', lastError: '' };
    const runtimeState = state.jarvisActive ? currentRuntimeState() : 'idle';
    const tools = jarvisToolSummary();
    const conn = omniConnections();
    const activeProvider = aiStatus.activeProvider || state.apiProvider || 'auto';
    const aiCfg = window.OctagonAI && typeof window.OctagonAI.config === 'function' ? window.OctagonAI.config() : {};
    const autoRoute = aiCfg.autoRoute !== false;
    const activeModel = aiStatus.effectiveModel || (activeProvider === 'contactbox' ? (aiCfg.contactboxModel || aiCfg.model) : aiCfg.model) || '-';
    const lastOk = aiStatus.lastStatus === 'ok';
    const lastFailed = aiStatus.lastStatus === 'failed';
    const localMode = activeProvider === 'offline' || (lastFailed && !aiStatus.lastSuccessAt);
    const providerLabels = {
      auto: t('تلقائي', 'Auto'),
      openrouter: 'OpenRouter',
      contactbox: 'ContactBox (Claude)',
      gemini: 'Gemini',
      offline: t('دون اتصال', 'Offline')
    };
    const modeLabels = {
      economy: t('اقتصادي', 'Economy'),
      balanced: t('متوازن', 'Balanced'),
      strong: t('تحليل قوي', 'Strong Analysis')
    };
    const activeMode = state.jarvisMode || 'balanced';
    const modelOptions = {
      'qwen/qwen3.5-flash-02-23': 'Qwen Flash',
      'qwen/qwen-2.5-72b-instruct': 'Qwen 72B',
      'deepseek/deepseek-chat': 'DeepSeek V3',
      'deepseek/deepseek-r1': 'DeepSeek R1',
      'claude-sonnet-4-6': 'Claude Sonnet 4.6',
      'claude-opus-4-8': 'Claude Opus 4.8'
    };
    const budgetText = `$${(state.sessionCost || 0).toFixed(4)} (${state.sessionTokens || 0} tokens)`;
    const yes = `<i class="fa-solid fa-circle-check"></i>`;
    const no = `<i class="fa-solid fa-circle-xmark"></i>`;

    const strip = `
      <div class="omni-rt-strip">
        <span class="omni-rt-pill omni-rt-state st-${esc(runtimeState)}" title="${t('حالة أومني الآن', 'Omni state right now')}">
          <i class="fa-solid fa-wave-square"></i> ${esc(omniStateLabel(runtimeState))}
        </span>
        <span class="omni-rt-pill" title="${t('المزود والنموذج الفعليان', 'Active provider and effective model')}${autoRoute ? t(' — توجيه ذكي مفعّل', ' — smart routing on') : ''}">
          <i class="fa-solid fa-microchip"></i> ${esc(providerLabels[activeProvider] || activeProvider)} · ${esc(modelShortLabel(activeModel))}${autoRoute ? ' ⚡' : ''}
        </span>
        <span class="omni-rt-pill ${lastOk ? 'is-ok' : (lastFailed ? 'is-fail' : '')}" title="${t('آخر نداء API', 'Last API call')}: ${esc(aiStatus.lastProvider || '-')} — ${esc(aiStatus.lastError || aiStatus.lastStatus || '')}">
          <i class="fa-solid fa-plug"></i> ${esc(aiStatus.lastProvider || '—')}: ${esc(aiStatus.lastStatus || 'unknown')}
        </span>
        ${localMode ? `<span class="omni-rt-pill is-local" title="${t('لا يوجد مزود سحابي متاح — الردود من المنطق المحلي فقط', 'No cloud provider reachable — replies come from local logic only')}"><i class="fa-solid fa-computer"></i> ${t('وضع محلي', 'local mode')}</span>` : ''}
        <span class="omni-rt-spacer"></span>
        <button type="button" class="omni-rt-btn" id="jarvisTestApisBtn" ${state.apiTestRunning ? 'disabled' : ''} title="${t('فحص سريع: سرعة واستجابة كل نموذج', 'Quick check: each model\'s speed and availability')}">
          <i class="fa-solid fa-vial"></i> ${state.apiTestRunning ? t('يفحص...', 'Testing...') : t('اختبار', 'Test')}
        </button>
        <button type="button" class="omni-rt-btn" id="jarvisDeepTestBtn" ${state.apiTestRunning ? 'disabled' : ''} title="${t('فحص عميق: السرعة + جودة العربية + صحة JSON لكل نموذج (أبطأ)', 'Deep check: speed + Arabic quality + JSON validity per model (slower)')}">
          <i class="fa-solid fa-list-check"></i> ${t('عميق', 'Deep')}
        </button>
        <button type="button" class="omni-rt-btn" id="omniRtConfigBtn" title="${t('إعدادات أومني', 'Omni settings')}">
          <i class="fa-solid ${state.rtConfigOpen ? 'fa-chevron-up' : 'fa-gear'}"></i>
        </button>
      </div>`;

    const toolsRow = `
      <div class="omni-rt-tools">
        <span title="${t('أدوات أومني القابلة للتنفيذ', 'Executable Omni tools')}"><i class="fa-solid fa-cubes"></i> ${tools.count} ${t('أداة', 'tools')}</span>
        <span title="${t('أدوات حساسة تمر بطابور الموافقة', 'Sensitive tools routed to the approval queue')}"><i class="fa-solid fa-shield-halved"></i> ${tools.approval} ${t('بموافقة', 'gated')}</span>
        <span title="${t('عناصر الواجهة المكتشفة في خريطة النظام', 'DOM actions discovered in the system map')}"><i class="fa-solid fa-map"></i> ${conn.domActions} ${t('عنصر واجهة', 'DOM actions')}</span>
        <span class="${conn.dbRead ? 'is-ok' : 'is-fail'}" title="${t('قراءة قاعدة البيانات الحية', 'Live database read layer')}">${conn.dbRead ? yes : no} ${t('قاعدة البيانات', 'DB read')}</span>
        <span class="${conn.approvalQueue ? 'is-ok' : 'is-fail'}" title="${t('طابور الموافقة للإجراءات الحساسة', 'Approval queue for sensitive actions')}">${conn.approvalQueue ? yes : no} ${t('طابور الموافقة', 'approvals')}</span>
        <span class="${conn.knowledge ? 'is-ok' : 'is-fail'}" title="${t('طبقة السياق والمعرفة', 'Knowledge/context layer')}">${conn.knowledge ? yes : no} ${t('سياق المعرفة', 'knowledge')}</span>
      </div>`;

    const config = !state.rtConfigOpen ? '' : `
      <div class="omni-rt-config">
        <div class="jarvis-status-grid">
          <div class="jarvis-status-item">
            <span class="label">${t('المزود:', 'Provider:')}</span>
            <select id="jarvisProviderSelect" class="jarvis-mini-select">
              ${['auto', 'openrouter', 'contactbox', 'gemini', 'offline'].map(p =>
                `<option value="${p}" ${activeProvider === p ? 'selected' : ''}>${providerLabels[p]}</option>`
              ).join('')}
            </select>
          </div>
          <div class="jarvis-status-item">
            <span class="label">${t('الوضع:', 'Mode:')}</span>
            <select id="jarvisModeSelect" class="jarvis-mini-select">
              ${['economy', 'balanced', 'strong'].map(m =>
                `<option value="${m}" ${activeMode === m ? 'selected' : ''}>${modeLabels[m]}</option>`
              ).join('')}
            </select>
          </div>
          <div class="jarvis-status-item full-width">
            <span class="label">${t('النموذج:', 'Model:')}</span>
            <select id="jarvisModelSelect" class="jarvis-mini-select">
              <option value="auto" ${autoRoute ? 'selected' : ''}>${t('توجيه ذكي حسب نوع الطلب', 'Smart routing by task type')}</option>
              ${Object.keys(modelOptions).map(m =>
                `<option value="${m}" ${!autoRoute && activeModel === m ? 'selected' : ''}>${modelOptions[m]}</option>`
              ).join('')}
            </select>
          </div>
          <div class="jarvis-status-item full-width" style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="jarvisWakeToggle" ${jarvisWakeRequired ? 'checked' : ''} style="margin: 0; cursor: pointer; width: auto; height: auto;">
            <label for="jarvisWakeToggle" style="cursor: pointer; font-size: 11px; opacity: 0.9;">
              ${t('طلب كلمة تنبيه (أومني / أوكتاجون)', 'Require Wake Word (Omni / Octagon)')}
            </label>
          </div>
          <div class="jarvis-status-item full-width">
            <span class="label">${t('استهلاك الجلسة:', 'Session Usage:')}</span>
            <span class="value budget-value">${budgetText}</span>
          </div>
        </div>
        <div class="jarvis-status-actions">
          <button type="button" class="jarvis-btn-mini" id="jarvisRebuildMapBtn" title="${t('إعادة مسح عناصر الواجهة وتحديث الخريطة', 'Rescan UI elements and rebuild the map')}">
            <i class="fa-solid fa-arrows-rotate"></i> ${t('تحديث الخريطة', 'Sync Map')}
          </button>
          <button type="button" class="jarvis-btn-mini" id="jarvisClearBufferBtn" title="${t('مسح ذاكرة الصوت المؤقتة والاستهلاك', 'Clear voice buffers')}">
            <i class="fa-solid fa-trash-can"></i> ${t('مسح', 'Clear')}
          </button>
          <button type="button" class="jarvis-btn-mini" id="jarvisRetryBtn" title="${t('إعادة محاولة تنفيذ الأمر الأخير', 'Retry last command')}">
            <i class="fa-solid fa-reply"></i> ${t('إعادة الأمر', 'Retry')}
          </button>
          <button type="button" class="jarvis-btn-mini" id="jarvisDiagnosticsBtn" title="${t('تشغيل لوحة الفحص والتشخيص الذاتي', 'Run the self-test diagnostics panel')}">
            <i class="fa-solid fa-stethoscope"></i> ${t('تشخيص', 'Diagnostics')}
          </button>
        </div>
      </div>`;

    return `
      <section class="ptxai-jarvis-status-card omni-runtime-card">
        ${strip}
        ${toolsRow}
        ${config}
        ${renderApiTestResults()}
      </section>
    `;
  }

  // Evidence card for Omni audit answers: source module, employee/period, totals,
  // and a warning when the numbers rely on Excel review notes. Read-only rendering.
  function renderJarvisEvidence(ev) {
    if (!ev || typeof ev !== 'object') return '';
    const rows = [];
    if (ev.sourceLabel || (Array.isArray(ev.source) && ev.source.length)) {
      rows.push(`<div class="jarvis-ev-row"><span class="jarvis-ev-k">${t('المصدر', 'Source')}</span><span class="jarvis-ev-v">${esc(ev.sourceLabel || (ev.source || []).join(' + '))}</span></div>`);
    }
    if (ev.employee) rows.push(`<div class="jarvis-ev-row"><span class="jarvis-ev-k">${t('الموظف', 'Employee')}</span><span class="jarvis-ev-v">${esc(ev.employee)}</span></div>`);
    if (ev.period) rows.push(`<div class="jarvis-ev-row"><span class="jarvis-ev-k">${t('الفترة', 'Period')}</span><span class="jarvis-ev-v">${esc(String(ev.period))}</span></div>`);
    const totals = (ev.totals && typeof ev.totals === 'object') ? ev.totals : null;
    if (totals) {
      const labels = {
        income: t('الواردات', 'Income'), expense: t('المصروفات', 'Expense'), net: t('الصافي', 'Net'),
        opening: t('رصيد افتتاحي', 'Opening'), finalCashbox: t('القاصة النهائية', 'Final cashbox'),
        transactions: t('عدد الحركات', 'Transactions'), recordsCount: t('سجلات الشهر', 'Month records'),
        nominalSalary: t('الراتب الاسمي', 'Nominal'), attendanceDays: t('حضور', 'Attendance'),
        absentDays: t('غياب', 'Absent'), totalEarnings: t('استحقاق', 'Earnings'),
        totalDeductions: t('استقطاعات', 'Deductions'), finalSalary: t('الصافي', 'Net salary'),
        monthAdvances: t('سلف الشهر', 'Month advances'), financeAdvances: t('سلف المالية', 'Finance advances'),
        financeAdvanceTx: t('حركات سلف', 'Advance tx'), financeAdvanceTotal: t('مجموع سلف المالية', 'Finance advances'),
        timesheetAdvanceTotal: t('سلف التايم شيت', 'Timesheet advances'), duplicateGroups: t('مجموعات مكررة', 'Duplicate groups'),
        fingerprintNotes: t('ملاحظات بصمة', 'Fingerprint notes'), missingPunches: t('بصمة ناقصة', 'Missing punches'),
        employeesAffected: t('موظفون متأثرون', 'Employees affected')
      };
      Object.keys(totals).forEach(k => {
        const v = totals[k];
        if (v === null || v === undefined || v === '' || !labels[k]) return;
        const shown = (typeof v === 'number' && Math.abs(v) >= 1000) ? v.toLocaleString('en-US') : String(v);
        rows.push(`<div class="jarvis-ev-row"><span class="jarvis-ev-k">${labels[k]}</span><span class="jarvis-ev-v">${esc(shown)}</span></div>`);
      });
    }
    if (!rows.length) return '';
    const warn = ev.fromReviewNotes
      ? `<div class="jarvis-ev-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${t(`جزء من البيانات من ملاحظات مراجعة الإكسل (${Number(ev.reviewNotes) || 0} ملاحظة) — تحتاج قرار المدير.`, `Part of this comes from Excel review notes (${Number(ev.reviewNotes) || 0}) — needs a manager decision.`)}</div>`
      : '';
    return `<div class="jarvis-evidence"><div class="jarvis-ev-title"><i class="fa-solid fa-scale-balanced"></i> ${t('الأدلة', 'Evidence')}</div>${rows.join('')}${warn}</div>`;
  }

  function render() {
    const key = currentKey();
    const log = state.byPage[key] || [];
    const panel = document.getElementById('ptxAIPanel');
    if (!panel) return;
    const pageNode = panel.querySelector('.ptxai-title-page');
    if (pageNode) pageNode.textContent = pageLabel(key);
    const jarvisStatusHost = panel.querySelector('#ptxAIJarvisStatus');
    if (jarvisStatusHost) jarvisStatusHost.innerHTML = renderJarvisStatusPanel();
    const stream = panel.querySelector('#ptxAIStream');
    if (!stream) return;
    stream.innerHTML = log.length
      ? log.map(message => {
          if (message.role === 'user') return `<div class="ptxai-bubble ptxai-user">${formatJarvisMessage(message.text)}</div>`;
          const actions = (message.actions && message.actions.length)
            ? `<div class="ptxai-acts">${message.actions.map(action => `<button type="button" class="ptxai-act-btn" data-text="${esc(action)}"><i class="fa-solid fa-plus"></i> ${esc(action)}</button>`).join('')}</div>`
            : '';
          const navs = (message.navActions && message.navActions.length)
            ? `<div class="ptxai-acts">${message.navActions.map(action => `<button type="button" class="ptxai-nav-btn" data-page="${esc(action.page)}"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(action.label)}</button>`).join('')}</div>`
            : '';
          const tookTitle = message.tookMs ? ` — ${Math.round(message.tookMs)}ms` : '';
          const sourceChip = message.local
            ? `<span class="jarvis-action-chip is-note" title="${t('رد من المنطق المحلي بدون نموذج سحابي', 'Answered by local logic, no cloud model')}${tookTitle}"><i class="fa-solid fa-computer"></i><span class="jarvis-chip-label">${t('وضع محلي', 'local mode')}</span></span>`
            : (message.source ? `<span class="jarvis-action-chip is-audit" title="${t('المزود / النموذج الذي أنتج هذا الرد', 'Provider / model that produced this reply')}${tookTitle}"><i class="fa-solid fa-cloud"></i><span class="jarvis-chip-label">${esc(message.source)}</span></span>` : '');
          const resultChips = (message.brainResults && message.brainResults.length)
            ? message.brainResults.map(r => {
                const isAudit = r.audit === true || (r.data && r.data.audit === true);
                const needsApproval = r.blocked === true || r.approval === true || (r.data && r.data.approval === true);
                const cls = r.ok === false ? 'is-failed' : (needsApproval ? 'is-queued' : (isAudit ? 'is-audit' : (r.risk === 'sensitive' ? 'is-queued' : 'is-done')));
                const icon = r.ok === false ? 'fa-triangle-exclamation' : (needsApproval ? 'fa-clock' : (isAudit ? 'fa-shield-halved' : (r.risk === 'sensitive' ? 'fa-clock' : 'fa-check')));
                const badge = r.ok === false ? '' : (needsApproval
                  ? `<span class="jarvis-mode-badge is-approval">${t('يتطلب موافقة', 'approval required')}</span>`
                  : (isAudit ? `<span class="jarvis-mode-badge is-readonly">${t('قراءة فقط', 'read-only')}</span>` : ''));
                return `<span class="jarvis-action-chip ${cls}"><i class="fa-solid ${icon}"></i><span class="jarvis-chip-label">${esc(r.tool)}</span></span>${badge}`;
              }).join('')
            : '';
          const chips = (resultChips || sourceChip) ? `<div class="jarvis-actions-row">${resultChips}${sourceChip}</div>` : '';
          const evidence = (message.brainResults && message.brainResults.length)
            ? message.brainResults.map(r => renderJarvisEvidence(r.evidence || (r.data && r.data.evidence))).filter(Boolean).join('')
            : '';
          const evidenceLinks = (message.brainResults && message.brainResults.length)
            ? (() => {
                const seen = {};
                const buttons = [];
                message.brainResults.forEach(r => {
                  const list = (Array.isArray(r.links) && r.links.length) ? r.links : ((r.data && Array.isArray(r.data.links)) ? r.data.links : []);
                  list.forEach(l => {
                    if (!l || !l.page || seen[l.page]) return;
                    seen[l.page] = true;
                    buttons.push(`<button type="button" class="ptxai-nav-btn" data-page="${esc(l.page)}"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${esc(l.label || l.page)}</button>`);
                  });
                });
                return buttons.length ? `<div class="ptxai-acts">${buttons.join('')}</div>` : '';
              })()
            : '';
          return `<div class="ptxai-bubble ptxai-bot">${formatJarvisMessage(message.text)}</div>${chips}${evidence}${evidenceLinks}${actions}${navs}`;
        }).join('')
      : `<div class="ptxai-empty">${t('اسألني عن', 'Ask me about')} "<b>${esc(pageLabel(key))}</b>"</div><div class="ptxai-sugg-wrap">${suggestionsFor(key).map(s => `<button type="button" class="ptxai-sugg" data-prompt="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    stream.scrollTop = stream.scrollHeight;
    persistChat();
  }

  function aiCoreCaller() {
    return window.callOctagonAi || window.callPentagonAi
      || (typeof callOctagonAi === 'function' ? callOctagonAi : null)
      || (typeof callPentagonAi === 'function' ? callPentagonAi : null);
  }

  // ==========================================================================
  // OMNI CORE PIPELINE — the single entry point for EVERY input channel.
  // Typed text, recorded voice notes (after transcription) and hands-free
  // speech ALL land here, so they get identical behavior: brain planning,
  // real tool execution, approval gating, source labeling, chat rendering
  // and (when voice is active) the spoken reply.
  //   opts.channel: 'text' | 'voice_note' | 'handsfree'
  //   opts.spoken : force speaking the reply even outside hands-free mode
  // ==========================================================================
  async function runOmniTurn(text, opts = {}) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    if (state.busy) {
      if (opts.spoken || state.jarvisActive) speakJarvis(t('انتظر قليلاً، ما زلت أعالج الطلب السابق.', 'Please wait, I am still processing the previous request.'));
      return null;
    }
    const key = currentKey();
    if (!state.byPage[key]) state.byPage[key] = [];
    state.byPage[key].push({ role: 'user', text: clean, channel: opts.channel || 'text' });
    state.busy = true;
    if (state.jarvisActive) { setJarvisStatus('processing'); updateJarvisButton(); }
    render();

    const stream = document.getElementById('ptxAIStream');
    if (stream) {
      const thinking = document.createElement('div');
      thinking.className = 'ptxai-bubble ptxai-bot ptxai-thinking';
      thinking.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('أقرأ بيانات القسم وأحضر الرد...', 'Reading this section and preparing the answer...')}`;
      stream.appendChild(thinking);
      stream.scrollTop = stream.scrollHeight;
    }

    const startedAt = Date.now();
    try {
      let entry;
      if (window.JarvisBrain && typeof window.JarvisBrain.handle === 'function') {
        // Brain path: plan → execute tools (approval-gated) → composed reply.
        const res = await window.JarvisBrain.handle(clean, { page: key, channel: opts.channel || 'text' });
        const answer = res.text || t('تم.', 'Done.');
        entry = {
          role: 'ai', text: answer,
          brainResults: res.results, clarify: res.clarify, local: res.local,
          source: res.local ? '' : currentAiSourceLabel(),
          tookMs: Date.now() - startedAt
        };
        state.byPage[key].push(entry);
        const afterKey = currentKey();
        if (afterKey && afterKey !== key) {
          if (!state.byPage[afterKey]) state.byPage[afterKey] = [];
          state.byPage[afterKey].push({ role: 'user', text: clean, channel: opts.channel || 'text' });
          state.byPage[afterKey].push(entry);
        }
        if (res.results && res.results.some(r => r.navigated)) updateAttentionBadge();
        if (opts.spoken || state.jarvisActive) speakJarvis(answer);
        return res;
      }
      // Legacy grounded Q&A (brain module missing): still answers, honestly labeled.
      const caller = aiCoreCaller();
      if (!caller) throw new Error('AI core not loaded');
      const raw = await caller(clean, aiContextForPage(key), {});
      const parsed = parseActions(raw);
      let answer = parsed.text || t('لم يصلني رد نصي. حاول إعادة صياغة سؤالك.', 'No text answer came back. Try rephrasing your question.');
      if (SENSITIVE_RE.test(clean)) {
        answer += '\n\n' + t('هذا طلب حساس. التنفيذ الفعلي يجب أن يمر عبر طابور الموافقة الآمن.', 'This is a sensitive request. Real execution must go through the safe approval queue.');
      }
      entry = { role: 'ai', text: answer, actions: parsed.actions, source: currentAiSourceLabel(), tookMs: Date.now() - startedAt };
      state.byPage[key].push(entry);
      if (opts.spoken || state.jarvisActive) speakJarvis(answer);
      return { text: answer, results: [], actions: [], clarify: '' };
    } catch (error) {
      const errText = t('تعذر الاتصال بالذكاء الصناعي الآن', 'Could not reach the AI model right now') + ` (${error.message || 'error'}).`;
      state.byPage[key].push({ role: 'ai', text: errText, local: true });
      if (opts.spoken || state.jarvisActive) speakJarvis(errText);
      toast(t('تعذر الاتصال بالذكاء الصناعي.', 'Could not reach the AI model.'), 'warning');
      return null;
    } finally {
      state.busy = false;
      updateJarvisButton();
      render();
      // speakJarvis() owns resuming the mic after a spoken reply ends. Only resume
      // here when nothing is being spoken, so the mic never re-opens during the TTS.
      if (state.jarvisActive && !state.jarvisListening &&
          state.jarvisStatus !== 'speaking' && Date.now() >= jarvisSpeakingUntil) {
        scheduleJarvisListening();
      }
    }
  }

  // Recorded voice note: transcribe FIRST (Gemini takes inline audio), show the
  // transcript as the user message, then run it through the SAME Omni pipeline
  // as typed text and hands-free speech. If transcription fails we say so —
  // no silent second pipeline.
  async function sendRecordedVoice(audio) {
    const key = currentKey();
    if (!state.byPage[key]) state.byPage[key] = [];
    const caller = aiCoreCaller();
    if (!caller) {
      state.byPage[key].push({ role: 'ai', text: t('طبقة الذكاء غير محمّلة — لا يمكن تفريغ التسجيل.', 'AI layer is not loaded — cannot transcribe the recording.'), local: true });
      render();
      return;
    }
    state.busy = true;
    render();
    const stream = document.getElementById('ptxAIStream');
    if (stream) {
      const transcribing = document.createElement('div');
      transcribing.className = 'ptxai-bubble ptxai-bot ptxai-thinking';
      transcribing.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${t('أفرّغ التسجيل الصوتي...', 'Transcribing the voice recording...')}`;
      stream.appendChild(transcribing);
      stream.scrollTop = stream.scrollHeight;
    }
    let transcript = '';
    try {
      transcript = (await caller(
        t('فرّغ هذا المقطع الصوتي إلى نص حرفي فقط بنفس لغته، بدون أي شرح أو ترجمة أو علامات اقتباس. أعد النص فقط.',
          'Transcribe this audio to literal text only, in its own language — no explanation, translation, or quotation marks. Return only the text.'),
        '', { audio, task: 'transcribe' }
      ) || '').trim();
    } catch (_) {}
    transcript = transcript.replace(/^["'«»\s]+|["'«»\s]+$/g, '').trim();
    state.busy = false;
    if (!transcript) {
      state.byPage[key].push({ role: 'ai', text: t('لم أتمكن من تفريغ التسجيل الصوتي. جرّب مرة أخرى أو اكتب الطلب نصاً.', 'Could not transcribe the recording. Try again or type the request.'), local: true });
      render();
      return;
    }
    if (state.jarvisActive) { try { window.__jarvisReplyLang = jarvisListenFamily(); } catch (_) {} }
    await runOmniTurn(transcript, { channel: 'voice_note', spoken: state.jarvisActive });
  }

  async function send(audio = null) {
    if (state.jarvisActive) interruptJarvisSpeech(false);
    if (state.busy) return;
    if (state.jarvisActive) {
      pauseJarvisListening();
      setJarvisStatus('processing');
      updateJarvisButton();
    }
    if (audio) { await sendRecordedVoice(audio); return; }
    const input = document.getElementById('ptxAIInput');
    const text = (input?.value || '').trim();
    if (!text) return;
    if (input) input.value = '';
    await runOmniTurn(text, { channel: 'text' });
  }

  const QUICK = {
    scan: {
      ar: 'افحص هذا القسم واذكر أهم 3 أمور تحتاج انتباهي الآن، مع سبب مختصر وخطوة عملية لكل واحدة.',
      en: 'Scan this section and list the top 3 items that need my attention, with a short reason and next step.'
    },
    summary: {
      ar: 'لخص حالة هذا القسم الآن في 3-4 أسطر بالعربية اعتماداً على البيانات المتاحة فقط.',
      en: 'Summarize this section in 3-4 lines using only available data.'
    }
  };
  function quick(key) {
    const input = document.getElementById('ptxAIInput');
    if (!input) return;
    input.value = QUICK[key]?.[lang()] || key;
    send();
  }
  function lastUserText() {
    const log = state.byPage[currentKey()] || [];
    const users = log.filter(message => message.role === 'user');
    return users.length ? users[users.length - 1].text : '';
  }
  function queueToApproval(forcedText) {
    const input = document.getElementById('ptxAIInput');
    const text = (typeof forcedText === 'string' && forcedText.trim()) || (input && input.value.trim()) || lastUserText();
    if (!text) return toast(t('اكتب طلباً أولاً قبل الإرسال للموافقة.', 'Write a request before sending it for approval.'), 'warning');
    try {
      if (typeof getAiControl !== 'function' || typeof saveData !== 'function' || typeof makeId !== 'function') throw new Error('AI core not ready');
      const sensitive = SENSITIVE_RE.test(text);
      const ai = getAiControl();
      const user = (function () { try { return window.PentagonAuth?.getCurrentUser?.() || {}; } catch (_) { return {}; } })();
      const groups = (function () { try { return window.PermissionService?.resolveGroups?.(user) || user.groups || []; } catch (_) { return user.groups || []; } })();
      const role = Array.isArray(groups) && groups.length ? groups.join(',') : (user.role || user.roleId || 'unmapped');
      if (!Array.isArray(ai.actionQueue)) ai.actionQueue = [];
      ai.actionQueue.unshift({
        id: makeId('aiprop'),
        actionId: 'create_task_followup',
        title: (sensitive ? t('مراجعة طلب حساس', 'Sensitive request review') : t('متابعة طلب', 'Request follow-up')) + ' - ' + pageLabel(),
        target: sensitive ? 'protected_system' : 'task_manager',
        mode: 'approval_required',
        risk: sensitive ? 'high' : 'medium',
        status: 'pending',
        summary: text,
        affectedRecords: 0,
        requestedBy: user.name || user.displayName || user.id || 'system',
        requestedById: user.id || 'system',
        requestedByRole: role,
        payload: { userId: user.id || 'system', userName: user.name || user.displayName || user.id || 'system', userRole: role, source: 'omni_ai_assistant', page: currentKey(), sensitive },
        createdAt: new Date().toISOString()
      });
      if (typeof addAiRunHistory === 'function') {
        addAiRunHistory({ actionId: 'system_chat', title: t('طلب من مساعد ', 'Request from assistant ') + pageLabel(), status: 'queued', note: text, outputType: 'ai_console' });
      }
      saveData();
      toast(t('تم إرسال الطلب إلى طابور الموافقة.', 'Request sent to the approval queue.'), 'success');
      if (currentKey() === 'intelligence' && typeof renderAiControlDashboard === 'function') renderAiControlDashboard();
    } catch (error) {
      toast(t('تعذر الإرسال للطابور', 'Could not send to queue') + ` (${error.message || 'error'}).`, 'warning');
    }
  }

  function applyPanelLayout() {
    const panel = document.getElementById('ptxAIPanel');
    if (!panel) return;
    const stored = readJson(PANEL_LAYOUT_KEY, {});
    const width = clamp(Number(stored.width) || 430, 320, Math.max(320, window.innerWidth - 24));
    const height = clamp(Number(stored.height) || 620, 360, Math.max(360, window.innerHeight - 24));
    const left = clamp(Number(stored.left) || 24, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clamp(Number(stored.top) || Math.max(84, window.innerHeight - height - 92), 8, Math.max(8, window.innerHeight - height - 8));
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  function persistPanelLayout() {
    const panel = document.getElementById('ptxAIPanel');
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    writeJson(PANEL_LAYOUT_KEY, {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
  }
  function applyButtonLayout() {
    const button = document.getElementById('ptxAIButton');
    if (!button) return;
    const stored = readJson(BUTTON_LAYOUT_KEY, {});
    const buttonWidth = button.offsetWidth || 72;
    const buttonHeight = button.offsetHeight || 72;
    const left = clamp(Number(stored.left) || 24, 8, Math.max(8, window.innerWidth - buttonWidth - 8));
    const top = clamp(Number(stored.top) || Math.max(8, window.innerHeight - buttonHeight - 16), 8, Math.max(8, window.innerHeight - buttonHeight - 8));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  }
  function persistButtonLayout() {
    const button = document.getElementById('ptxAIButton');
    if (!button) return;
    const rect = button.getBoundingClientRect();
    writeJson(BUTTON_LAYOUT_KEY, { left: Math.round(rect.left), top: Math.round(rect.top) });
  }
  function resetLayout() {
    localStorage.removeItem(PANEL_LAYOUT_KEY);
    localStorage.removeItem(BUTTON_LAYOUT_KEY);
    applyPanelLayout();
    applyButtonLayout();
    toast(t('تمت إعادة موضع وحجم عميل الذكاء.', 'AI agent position and size were reset.'), 'info');
  }
  function installPanelDrag(panel) {
    const head = panel.querySelector('.ptxai-head');
    if (!head) return;
    let drag = null;
    head.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      head.setPointerCapture(event.pointerId);
      panel.classList.add('dragging');
      event.preventDefault();
    });
    head.addEventListener('pointermove', event => {
      if (!drag) return;
      const rect = panel.getBoundingClientRect();
      const left = clamp(drag.left + event.clientX - drag.x, 8, Math.max(8, window.innerWidth - rect.width - 8));
      const top = clamp(drag.top + event.clientY - drag.y, 8, Math.max(8, window.innerHeight - rect.height - 8));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    });
    head.addEventListener('pointerup', event => {
      if (!drag) return;
      drag = null;
      head.releasePointerCapture(event.pointerId);
      panel.classList.remove('dragging');
      persistPanelLayout();
    });
  }
  function installPanelResize(panel) {
    const handle = panel.querySelector('.ptxai-resize-handle');
    if (!handle) return;
    let resize = null;
    const start = event => {
      const rect = panel.getBoundingClientRect();
      resize = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
      panel.classList.add('resizing');
      event.preventDefault();
      event.stopPropagation();
    };
    const move = event => {
      if (!resize) return;
      const rect = panel.getBoundingClientRect();
      const maxWidth = Math.max(320, window.innerWidth - rect.left - 8);
      const maxHeight = Math.max(360, window.innerHeight - rect.top - 8);
      panel.style.width = `${clamp(resize.width + event.clientX - resize.x, 320, maxWidth)}px`;
      panel.style.height = `${clamp(resize.height + event.clientY - resize.y, 360, maxHeight)}px`;
    };
    const stop = event => {
      if (!resize) return;
      resize = null;
      if (event && event.pointerId !== undefined) {
        try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
      }
      panel.classList.remove('resizing');
      persistPanelLayout();
    };
    handle.addEventListener('pointerdown', event => {
      handle.setPointerCapture(event.pointerId);
      start(event);
    });
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  }
  function installButtonDrag(button) {
    let drag = null;
    const start = event => {
      const rect = button.getBoundingClientRect();
      const actionTarget = event.target.closest?.('[data-agent-action]');
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false, action: actionTarget?.dataset?.agentAction || 'agent' };
      event.preventDefault();
      event.stopPropagation();
    };
    const move = event => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      const width = button.offsetWidth || 72;
      const height = button.offsetHeight || 72;
      button.style.left = `${clamp(drag.left + dx, 8, Math.max(8, window.innerWidth - width - 8))}px`;
      button.style.top = `${clamp(drag.top + dy, 8, Math.max(8, window.innerHeight - height - 8))}px`;
    };
    const stop = event => {
      if (!drag) return;
      const shouldToggle = !drag.moved;
      const action = drag.action;
      drag = null;
      if (event && event.pointerId !== undefined) {
        try { button.releasePointerCapture(event.pointerId); } catch (_) {}
      }
      persistButtonLayout();
      if (shouldToggle) {
        if (action === 'jarvis') {
          toggleJarvis();
        } else if (action === 'attention') {
          toggle(true);
          showAttention();
        } else {
          toggle();
        }
      }
    };
    button.addEventListener('pointerdown', event => {
      button.setPointerCapture(event.pointerId);
      start(event);
    });
    button.addEventListener('pointermove', move);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  }

  function toggle(force) {
    if (force !== false && loggedOut()) return;
    state.open = typeof force === 'boolean' ? force : !state.open;
    const panel = document.getElementById('ptxAIPanel');
    const button = document.getElementById('ptxAIButton');
    if (!state.open && state.jarvisActive) stopJarvis(true);
    if (panel) {
      applyPanelLayout();
      panel.classList.toggle('open', state.open);
    }
    if (button) button.classList.toggle('active', state.open);
    if (state.open) {
      render();
      setTimeout(() => document.getElementById('ptxAIInput')?.focus(), 50);
      if (state.jarvisActive) scheduleJarvisListening();
    }
    updateAttentionBadge();
  }

  function estimateTokens(text) {
    if (!text) return 0;
    const arabicRegex = /[\u0600-\u06FF]/g;
    const arabicMatches = text.match(arabicRegex);
    const arabicCount = arabicMatches ? arabicMatches.length : 0;
    const englishCount = text.length - arabicCount;
    return Math.round((arabicCount / 2.2) + (englishCount / 4.0));
  }

  function wrapAiCallerForBudget() {
    if (window.__octagonAIWrappedCaller) return;
    const originalCall = window.callOctagonAi;
    if (typeof originalCall !== 'function') return;

    const wrapped = async function (userText, systemContext, opts) {
      const promptText = (userText || '') + '\n' + (systemContext || '');
      const inputTokens = estimateTokens(promptText);
      
      try {
        const response = await originalCall.apply(this, arguments);
        const outputText = typeof response === 'string' ? response : (response?.text || '');
        const outputTokens = estimateTokens(outputText);
        const total = inputTokens + outputTokens;
        
        let rate = 0.0005; // $0.0005 per 1K tokens default
        const providerStatus = window.OctagonAI ? window.OctagonAI.status() : { activeProvider: 'openrouter', model: '' };
        if (providerStatus.activeProvider === 'gemini') {
          rate = 0.000075;
        } else if (providerStatus.activeProvider === 'openrouter') {
          const m = String(providerStatus.model).toLowerCase();
          if (m.includes('r1')) rate = 0.002;
          else if (m.includes('flash') || m.includes('mini')) rate = 0.0001;
        }

        const cost = (total / 1000) * rate;
        state.sessionTokens += total;
        state.sessionCost += cost;
        
        try {
          localStorage.setItem('jarvis_session_tokens', String(state.sessionTokens));
          localStorage.setItem('jarvis_session_cost', String(state.sessionCost));
        } catch (_) {}

        render();
        return response;
      } catch (err) {
        throw err;
      }
    };

    window.callOctagonAi = wrapped;
    window.callPentagonAi = wrapped;
    window.__octagonAIWrappedCaller = true;
  }

  function clearSessionBudget() {
    state.sessionTokens = 0;
    state.sessionCost = 0;
    try {
      localStorage.setItem('jarvis_session_tokens', '0');
      localStorage.setItem('jarvis_session_cost', '0');
    } catch (_) {}
    render();
  }

  async function testJarvisApis(deep = false) {
    if (!window.OctagonAI || typeof window.OctagonAI.testMatrix !== 'function') {
      toast(t('طبقة مزودات الذكاء غير متصلة.', 'AI provider layer is not connected.'), 'warning');
      return;
    }
    state.apiTestRunning = true;
    state.apiTestResults = null;
    render();
    try {
      state.apiTestResults = await window.OctagonAI.testMatrix({ deep });
      const okCount = (state.apiTestResults.items || []).filter(item => item.ok).length;
      toast(t(`اكتمل فحص API: ${okCount} ناجحة`, `API test complete: ${okCount} passed`), okCount ? 'success' : 'warning');
    } catch (e) {
      state.apiTestResults = { ok: false, items: [{ label: 'API matrix', ok: false, error: String(e && e.message || e), latencyMs: 0 }] };
      toast(t('فشل فحص API.', 'API test failed.'), 'warning');
    } finally {
      state.apiTestRunning = false;
      render();
    }
  }

  function setJarvisMode(mode) {
    state.jarvisMode = mode;
    try { localStorage.setItem('octagon_jarvis_mode', mode); } catch (_) {}
    if (window.OctagonAI) {
      const c = window.OctagonAI.config();
      if (c.provider === 'contactbox' || state.apiProvider === 'contactbox') {
        if (mode === 'economy') {
          window.OctagonAI.setConfig({ model: 'claude-sonnet-4-6', contactboxModel: 'claude-sonnet-4-6', maxTokens: 800 });
        } else if (mode === 'balanced') {
          window.OctagonAI.setConfig({ model: 'claude-sonnet-4-6', contactboxModel: 'claude-sonnet-4-6', maxTokens: 1500 });
        } else if (mode === 'strong') {
          window.OctagonAI.setConfig({ model: 'claude-opus-4-8', contactboxModel: 'claude-opus-4-8', maxTokens: 2500 });
        }
      } else {
        // Benchmark 2026-07-03: Qwen 72B was erroring on OpenRouter (2/4 probes
        // failed) so "balanced" now uses DeepSeek V3 (4/4, fastest). Economy
        // keeps the cheapest passing model (Qwen Flash, slow but reliable).
        if (mode === 'economy') {
          window.OctagonAI.setModel('qwen/qwen3.5-flash-02-23');
          window.OctagonAI.setConfig({ maxTokens: 400 });
        } else if (mode === 'balanced') {
          window.OctagonAI.setModel('deepseek');
          window.OctagonAI.setConfig({ maxTokens: 1000 });
        } else if (mode === 'strong') {
          window.OctagonAI.setModel('deepseek-r1');
          window.OctagonAI.setConfig({ maxTokens: 2000 });
        }
      }
    }
    render();
  }

  function setJarvisProvider(provider) {
    state.apiProvider = provider;
    try { localStorage.setItem('octagon_jarvis_provider', provider); } catch (_) {}
    if (window.OctagonAI) {
      if (provider === 'gemini') {
        window.OctagonAI.useGemini();
      } else if (provider === 'openrouter') {
        window.OctagonAI.useOpenRouter();
      } else if (provider === 'contactbox') {
        window.OctagonAI.useContactBox();
      }
    }
    if (window.JarvisVoiceRuntime) {
      window.JarvisVoiceRuntime.setProvider(provider);
    }
    render();
  }

  function setJarvisModel(model) {
    if (!model || !window.OctagonAI) return;
    if (model === 'auto') {
      // Smart routing: the provider layer picks the model per task type.
      if (typeof window.OctagonAI.useAutoRoute === 'function') window.OctagonAI.useAutoRoute();
      else window.OctagonAI.setConfig({ autoRoute: true });
      toast(t('تم تفعيل التوجيه الذكي: أومني يختار النموذج حسب نوع الطلب.', 'Smart routing on: Omni picks the model per task type.'), 'info');
      render();
      return;
    }
    if (typeof window.OctagonAI.setModel === 'function') {
      window.OctagonAI.setModel(model);
      const cfg = typeof window.OctagonAI.config === 'function' ? window.OctagonAI.config() : {};
      state.apiProvider = cfg.provider || state.apiProvider;
      try { localStorage.setItem('octagon_jarvis_provider', state.apiProvider); } catch (_) {}
      if (window.JarvisVoiceRuntime && typeof window.JarvisVoiceRuntime.setProvider === 'function') {
        window.JarvisVoiceRuntime.setProvider(state.apiProvider);
      }
      toast(t('تم تثبيت النموذج: ', 'Model pinned: ') + modelShortLabel(cfg.provider === 'contactbox' ? cfg.contactboxModel : cfg.model), 'info');
    }
    render();
  }

  function mount() {
    if (document.getElementById('ptxAIButton')) return;
    wrapAiCallerForBudget();
    loadChat();

    const button = document.createElement('button');
    button.id = 'ptxAIButton';
    button.type = 'button';
    button.title = t('عميل الذكاء الصناعي - اسحب لتحريكه', 'AI Agent - drag to move');
    button.innerHTML = `
      <span class="ptxai-fab-bridge"></span>
      <span class="ptxai-fab-ring ptxai-fab-ring-1"></span>
      <span class="ptxai-fab-ring ptxai-fab-ring-2"></span>
      <span class="ptxai-fab-core" data-agent-action="agent" title="${t('فتح عميل الذكاء', 'Open AI agent')}">
        <span class="ptxai-fab-sheen"></span>
        <i class="fa-solid fa-robot"></i>
      </span>
      <span class="ptxai-fab-lobe ptxai-fab-mic" data-agent-action="jarvis" title="${t('تشغيل أومني الصوتي', 'Start Omni voice')}">
        <i class="fa-solid fa-microphone-lines"></i>
      </span>
      <span class="ptxai-fab-lobe ptxai-fab-alerts" data-agent-action="attention" title="${t('عرض التنبيهات', 'Show alerts')}">
        <i class="fa-solid fa-bell"></i>
      </span>
      <span class="ptxai-fab-pulse"></span>
    `;
    document.body.classList.add('ai-cluster-enabled');

    const panel = document.createElement('div');
    panel.id = 'ptxAIPanel';
    panel.innerHTML = `
      <div class="ptxai-head">
        <div class="ptxai-drag-grip"><i class="fa-solid fa-grip-lines"></i></div>
        <div class="ptxai-titles">
          <b><i class="fa-solid fa-brain"></i> ${t('أومني — مساعد Octagon', 'Omni — Octagon Assistant')}</b>
          <span>${t('القسم', 'Section')}: <span class="ptxai-title-page">-</span></span>
        </div>
        <div class="ptxai-window-actions">
          <button type="button" class="ptxai-reset" title="${t('إعادة الموضع والحجم', 'Reset position and size')}"><i class="fa-solid fa-up-down-left-right"></i></button>
          <button type="button" class="ptxai-close" title="${t('إغلاق', 'Close')}"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div id="ptxAIJarvisStatus"></div>
      <div class="ptxai-quickbar">
        <button type="button" data-q="attention" class="ptxai-attn"><i class="fa-solid fa-bell"></i> ${t('تحتاج انتباهك', 'Needs Attention')}</button>
        <button type="button" data-q="scan"><i class="fa-solid fa-magnifying-glass-chart"></i> ${t('افحص القسم', 'Scan')}</button>
        <button type="button" data-q="summary"><i class="fa-solid fa-clipboard-list"></i> ${t('لخص الحالة', 'Summary')}</button>
        <button type="button" id="ptxAIJarvisBtn" class="ptxai-jarvis" title="${t('تفعيل التحكم الصوتي المستمر', 'Enable hands-free voice control')}"><i class="fa-solid fa-microphone-slash"></i> ${t('وضع أومني', 'Omni Mode')}</button>
        <button type="button" id="ptxAIQueueBtn" class="ptxai-queue" title="${t('أرسل آخر طلب إلى طابور الموافقة', 'Send the latest request to approval')}"><i class="fa-solid fa-plus"></i> ${t('للموافقة', 'Approval')}</button>
      </div>
      <div id="ptxAIStream" class="ptxai-stream"></div>
      <div class="ptxai-input-row">
        <button type="button" id="ptxAIMic" class="ptxai-mic" title="${t('تسجيل صوّتي', 'Voice Record')}"><i class="fa-solid fa-microphone"></i></button>
        <textarea id="ptxAIInput" rows="2" placeholder="${t('اسأل عن هذا القسم أو اطلب إجراء آمن...', 'Ask about this section or request a safe action...')}"></textarea>
        <button type="button" id="ptxAISend" class="ptxai-send" title="${t('إرسال', 'Send')}"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
      <div class="ptxai-resize-handle" title="${t('\u062A\u063A\u064A\u064A\u0631 \u062D\u062C\u0645 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629', 'Resize chat')}"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></div>`;

    document.body.appendChild(button);
    document.body.appendChild(panel);
    applyButtonLayout();
    applyPanelLayout();
    installButtonDrag(button);
    installPanelDrag(panel);
    installPanelResize(panel);

    panel.querySelector('.ptxai-close').addEventListener('click', () => toggle(false));
    panel.querySelector('.ptxai-reset').addEventListener('click', resetLayout);
    panel.querySelector('#ptxAISend').addEventListener('click', () => send());
    
    const micBtn = panel.querySelector('#ptxAIMic');
    let mediaRecorder = null;
    let audioStream = null;
    let audioChunks = [];
    
    if (micBtn) {
      micBtn.addEventListener('click', async () => {
        if (!micBtn.classList.contains('recording')) interruptJarvisSpeech(false);
        if (!navigator.mediaDevices || !window.MediaRecorder) {
          toast(t('تسجيل الصوت غير مدعوم في هذا المتصفح', 'Audio recording is not supported in this browser'), 'warning');
          return;
        }
        
        if (micBtn.classList.contains('recording')) {
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
          if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
          }
          micBtn.classList.remove('recording');
          micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
          const inputEl = document.getElementById('ptxAIInput');
          if (inputEl) {
            inputEl.placeholder = t('اسأل عن هذا القسم أو اطلب إجراء آمن...', 'Ask about this section or request a safe action...');
          }
        } else {
          try {
            audioChunks = [];
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            mediaRecorder = new MediaRecorder(audioStream);
            mediaRecorder.ondataavailable = event => {
              if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };
            mediaRecorder.onstop = async () => {
              const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
              try {
                const base64Data = await blobToBase64(audioBlob);
                send({
                  data: base64Data,
                  mimeType: mediaRecorder.mimeType || 'audio/webm'
                });
              } catch (err) {
                console.error("Failed to convert audio to base64:", err);
                toast(t('فشل معالجة الصوت المرفق', 'Failed to process audio recording'), 'warning');
              }
            };
            
            mediaRecorder.start();
            micBtn.classList.add('recording');
            micBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
            const inputEl = document.getElementById('ptxAIInput');
            if (inputEl) {
              inputEl.placeholder = t('جاري تسجيل الصوت... انقر الإيقاف للإرسال', 'Recording voice... click STOP to send');
            }
          } catch (err) {
            console.error("Failed to start recording:", err);
            toast(t('تعذر الوصول إلى الميكروفون', 'Microphone access denied or failed'), 'warning');
          }
        }
      });
    }

    panel.querySelector('#ptxAIInput').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    panel.querySelectorAll('.ptxai-quickbar [data-q]').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.getAttribute('data-q');
        if (key === 'attention') showAttention();
        else quick(key);
      });
    });
    panel.querySelector('#ptxAIJarvisBtn')?.addEventListener('click', () => toggleJarvis());
    panel.querySelector('#ptxAIQueueBtn').addEventListener('click', () => queueToApproval());
    
    // Delegated event listeners for Omni V2 controls
    panel.addEventListener('click', event => {
      const rebuildBtn = event.target.closest('#jarvisRebuildMapBtn');
      if (rebuildBtn) {
        if (window.JarvisSystemMapBuilder && typeof window.JarvisSystemMapBuilder.rebuildJarvisMap === 'function') {
          const map = window.JarvisSystemMapBuilder.rebuildJarvisMap();
          toast(t(`تم تحديث الخريطة. نسبة التغطية: ${map.coverageScore}%`, `Map synchronized. Coverage: ${map.coverageScore}%`), 'success');
          render();
        } else {
          toast(t('مكتبة خريطة النظام غير متصلة.', 'System Map module not loaded.'), 'warning');
        }
        return;
      }
      
      const clearBtn = event.target.closest('#jarvisClearBufferBtn');
      if (clearBtn) {
        clearSessionBudget();
        if (window.JarvisVoiceRuntime) {
          window.JarvisVoiceRuntime.stop();
          window.JarvisVoiceRuntime.start();
        }
        toast(t('تم تفريغ ذاكرة الصوت المؤقتة وسجل الاستهلاك.', 'Voice buffers and usage logs cleared.'), 'success');
        return;
      }
      
      const retryBtn = event.target.closest('#jarvisRetryBtn');
      if (retryBtn) {
        const lastCmd = lastUserText();
        if (lastCmd) {
          toast(t(`إعادة محاولة: "${lastCmd}"`, `Retrying: "${lastCmd}"`), 'info');
          processJarvisTranscript(lastCmd);
        } else {
          toast(t('لا يوجد أمر سابق لإعادته.', 'No previous command to retry.'), 'warning');
        }
        return;
      }

      const diagBtn = event.target.closest('#jarvisDiagnosticsBtn');
      if (diagBtn) {
        if (window.JarvisTestHarness && typeof window.JarvisTestHarness.showPanel === 'function') {
          window.JarvisTestHarness.showPanel();
        } else {
          toast(t('مكتبة الفحص والتشخيص غير متصلة.', 'Diagnostics harness not loaded.'), 'warning');
        }
        return;
      }

      const testApisBtn = event.target.closest('#jarvisTestApisBtn');
      if (testApisBtn) {
        testJarvisApis(false);
        return;
      }

      const deepTestBtn = event.target.closest('#jarvisDeepTestBtn');
      if (deepTestBtn) {
        testJarvisApis(true);
        return;
      }

      const rtConfigBtn = event.target.closest('#omniRtConfigBtn');
      if (rtConfigBtn) {
        state.rtConfigOpen = !state.rtConfigOpen;
        try { localStorage.setItem(RT_CONFIG_OPEN_KEY, state.rtConfigOpen ? '1' : '0'); } catch (_) {}
        render();
        return;
      }
    });

    panel.addEventListener('change', event => {
      if (event.target.id === 'jarvisProviderSelect') {
        setJarvisProvider(event.target.value);
      } else if (event.target.id === 'jarvisModeSelect') {
        setJarvisMode(event.target.value);
      } else if (event.target.id === 'jarvisModelSelect') {
        setJarvisModel(event.target.value);
      } else if (event.target.id === 'jarvisWakeToggle') {
        const val = event.target.checked;
        jarvisWakeRequired = val;
        try { localStorage.setItem('jarvisWakeRequired', val ? '1' : '0'); } catch (_) {}
        if (window.JarvisVoiceRuntime && typeof window.JarvisVoiceRuntime.setWakeWordRequired === 'function') {
          window.JarvisVoiceRuntime.setWakeWordRequired(val);
        }
        toast(val ? t('تفعيل اشتراط كلمة التنبيه للتشغيل الصوتي', 'Wake word requirement enabled')
                  : t('إلغاء اشتراط كلمة التنبيه (تشغيل مباشر)', 'Wake word requirement disabled'), 'info');
      }
    });
    panel.querySelector('#ptxAIStream').addEventListener('click', event => {
      const action = event.target.closest('.ptxai-act-btn');
      if (action) { queueToApproval(action.getAttribute('data-text')); return; }
      const nav = event.target.closest('.ptxai-nav-btn');
      if (nav) {
        toggle(false);
        try { if (typeof switchPage === 'function') switchPage(nav.getAttribute('data-page')); } catch (_) {}
        return;
      }
      const suggestion = event.target.closest('.ptxai-sugg');
      if (suggestion) {
        const input = document.getElementById('ptxAIInput');
        if (input) input.value = suggestion.getAttribute('data-prompt');
        send();
      }
    });

    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        if (state.open) persistPanelLayout();
      });
      resizeObserver.observe(panel);
    }

    if (typeof window.switchPage === 'function' && !window.__octagonAIWrappedSwitch) {
      const original = window.switchPage;
      window.switchPage = function () {
        const result = original.apply(this, arguments);
        if (state.open) render();
        updateAttentionBadge();
        return result;
      };
      window.__octagonAIWrappedSwitch = true;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => pickSpeechVoice(lang() === 'en' ? 'en-US' : 'ar-SA');
    }

    window.addEventListener('octagon:notifications-updated', updateAttentionBadge);
    window.addEventListener('resize', () => {
      applyButtonLayout();
      applyPanelLayout();
    });

    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay && window.MutationObserver) {
      new MutationObserver(syncGate).observe(loginOverlay, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    window.addEventListener('jarvis:state-change', function (e) {
      const s = e.detail.state;
      let assistantStatus = 'idle';
      if (s === 'listening' || s === 'user_speaking') assistantStatus = 'listening';
      else if (s === 'thinking') assistantStatus = 'processing';
      else if (s === 'speaking') assistantStatus = 'speaking';
      setJarvisStatus(assistantStatus);
    });

    window.addEventListener('jarvis:transcript-update', function (e) {
      showJarvisHeard(e.detail.text);
    });

    syncGate();
    updateAttentionBadge();
    render();
    [2500, 6000, 12000].forEach(ms => setTimeout(updateAttentionBadge, ms));
    setInterval(updateAttentionBadge, 45000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  const api = {
    open: () => toggle(true),
    close: () => toggle(false),
    toggle,
    attention: () => { toggle(true); showAttention(); },
    resetLayout,
    jarvis: toggleJarvis,
    startJarvis,
    stopJarvis,
    setJarvisListenLang,
    getJarvisListenFamily,
    toggleJarvisListenLang: () => setJarvisListenLang(jarvisListenFamily() === 'en' ? 'ar' : 'en'),
    synthesizeCloudTTS,
    stripForSpeech,
    detectSpeechLangCode,
    pickSpeechVoice,
    // OMNI Runtime V2 bridge: the voice runtime delegates each finalized utterance
    // here so spoken commands get the SAME rich pipeline as typed ones — chat
    // rendering, workflow/scan/summary shortcuts, language lock and stop-word handling.
    // Without these exports the runtime silently fell back to a bare brain call.
    processJarvisTranscript,
    speakJarvis,
    pauseJarvisListening,
    resumeJarvisListening: () => scheduleJarvisListening(0),
    // Omni core pipeline: the ONE entry point all channels share (text / voice
    // note / hands-free). Exposed so external modules and tests can drive it.
    runOmniTurn,
    handleText: runOmniTurn,
    render,
    refreshBadge: updateAttentionBadge
  };
  window.octagonAIAssistant = api;
  window.ptxAIAssistant = api;
  // User-facing name is Omni — expose it under the new name too.
  window.OmniAssistant = api;
})();
