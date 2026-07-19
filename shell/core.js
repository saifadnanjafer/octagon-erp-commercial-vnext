/*
 * P1.1 Section-shell runtime.
 * Pattern adapted from octagon-erp/app.js (auth, theme, assistant, toast,
 * command palette) without importing or changing the legacy SPA.
 */
(function (root, document) {
  'use strict';

  const OX = root.OX = root.OX || {};
  const SHELL_THEMES = ['default', 'glass', 'abstract', 'neumorphism', 'clean', 'bento', 'premium', 'glassmorphism', 'dashboard', 'refined', 'shadcn', 'perspective'];
  const THEME_LABELS = { default: 'الافتراضي', glass: 'زجاجي', abstract: 'حديث', neumorphism: 'مجسّم', clean: 'نظيف', bento: 'بنتو', premium: 'بريميوم', glassmorphism: 'زجاجي ضبابي', dashboard: 'لوحة بيانات', refined: 'راقٍ', shadcn: 'شادسِن', perspective: 'منظور' };
  const THEME_CLASSES = { glass: 'theme-glass', abstract: 'theme-abstract', neumorphism: 'theme-neumorphism', clean: 'theme-clean', bento: 'theme-bento', premium: 'theme-premium', glassmorphism: 'theme-glassmorphism', dashboard: 'theme-dashboard', refined: 'theme-refined', shadcn: 'theme-shadcn', perspective: 'theme-perspective' };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  async function request(path, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.headers = headers;
    const response = await fetch(path, opts);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
    if (!response.ok || (payload && payload.success === false)) {
      const error = new Error(payload?.error || `تعذر تنفيذ الطلب (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload?.data === undefined ? payload : payload.data;
  }

  function toast(message, type) {
    const host = document.getElementById('oxToastHost') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'oxToastHost', className: 'ox-toast-host', dir: 'rtl' }));
    const item = document.createElement('div');
    item.className = `ox-toast ox-toast-${type || 'info'}`;
    item.setAttribute('role', 'status');
    item.textContent = message;
    host.appendChild(item);
    setTimeout(() => { item.classList.add('ox-toast-leaving'); setTimeout(() => item.remove(), 220); }, 3400);
  }

  function getDb() { return root.OctagonDB || root.PentagonDB || null; }
  function getAuth() { return root.OctagonAuth || root.PentagonAuth || null; }
  function currentUser() { return getAuth()?.getCurrentUser?.() || { id: 'guest', name: 'زائر', groups: [] }; }

  function setTheme(theme) {
    if (!SHELL_THEMES.includes(theme)) return;
    const body = document.body;
    Object.values(THEME_CLASSES).forEach(name => body.classList.remove(name));
    if (THEME_CLASSES[theme]) body.classList.add(THEME_CLASSES[theme]);
    root.localStorage?.setItem('site-theme', theme);
    const trigger = document.querySelector('[data-ox-theme]');
    if (trigger) trigger.textContent = `المظهر: ${THEME_LABELS[theme]}`;
    if (theme === 'glass') root.initRealGlassEffect?.();
  }

  function renderThemeMenu(anchor) {
    document.querySelector('.ox-theme-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'ox-theme-menu';
    menu.dir = 'rtl';
    SHELL_THEMES.forEach(theme => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = THEME_LABELS[theme];
      button.addEventListener('click', () => { setTheme(theme); menu.remove(); });
      menu.appendChild(button);
    });
    anchor.parentElement.appendChild(menu);
  }

  async function availableUsers() {
    const db = getDb();
    try {
      const data = await db?.load?.();
      const all = [...(Array.isArray(data?.users) ? data.users : []), ...(Array.isArray(data?.omni?.users) ? data.omni.users : [])];
      const seen = new Set();
      return all.filter(user => user?.id && user.is_active !== false && user.status !== 'inactive' && !seen.has(user.id) && seen.add(user.id));
    } catch (_) { return []; }
  }

  async function login(userId, password) {
    if (!userId) throw new Error('اختر المستخدم أولاً.');
    let serverSession = null;
    try {
      serverSession = await request('/api/auth/login', { method: 'POST', body: { userId, password } });
      root.__octagonServerSession = Object.assign({ authenticated: true, mode: 'server' }, serverSession || {});
    } catch (error) {
      // Local fallback is intentional for the section shell's offline/local mode.
      if (error.status && error.status !== 404) throw error;
      root.__octagonServerSession = { authenticated: false, mode: 'local-dev-fallback' };
    }
    getAuth()?.setCurrentUser?.(userId);
    root.localStorage?.setItem('octagon_user_id', userId);
    return currentUser();
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    getAuth()?.setCurrentUser?.('');
    root.localStorage?.removeItem('octagon_user_id');
    root.__octagonServerSession = { authenticated: false, mode: 'logged-out' };
    openLogin();
  }

  async function openLogin() {
    document.querySelector('.ox-login-overlay')?.remove();
    const users = await availableUsers();
    const overlay = document.createElement('div');
    overlay.className = 'ox-login-overlay';
    overlay.dir = 'rtl';
    overlay.innerHTML = `<form class="ox-login-card"><h1>أوكتاغون التجاري</h1><p>تسجيل الدخول إلى مساحة العمل</p><label>المستخدم<select name="userId">${users.map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName || user.name || user.id)}</option>`).join('') || '<option value="system">مدير النظام</option>'}</select></label><label>كلمة المرور<input name="password" type="password" autocomplete="current-password" required></label><p class="ox-login-error" aria-live="polite"></p><button type="submit">دخول</button></form>`;
    overlay.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = form.querySelector('.ox-login-error');
      try {
        await login(form.userId.value, form.password.value);
        overlay.remove();
        renderUser();
        toast('تم تسجيل الدخول بنجاح.', 'success');
      } catch (reason) { error.textContent = reason.message || 'تعذر تسجيل الدخول.'; }
    });
    document.body.appendChild(overlay);
  }

  function renderUser() {
    const slot = document.querySelector('[data-ox-user]');
    if (slot) slot.textContent = currentUser().displayName || currentUser().name || 'المستخدم';
  }

  function loadAssistant() {
    if (root.octagonAIAssistant?.open) return Promise.resolve(root.octagonAIAssistant);
    if (root.__octagonAIAssistantPromise) return root.__octagonAIAssistantPromise;
    root.__octagonAIAssistantPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/omni-ai-assistant.js';
      script.onload = () => resolve(root.octagonAIAssistant || null);
      script.onerror = () => reject(new Error('تعذر تحميل مساعد Omni.'));
      document.head.appendChild(script);
    });
    return root.__octagonAIAssistantPromise;
  }

  async function openAssistant() {
    try { (await loadAssistant())?.open?.(); } catch (error) { toast(error.message, 'warning'); }
  }

  async function searchEntities(query) {
    const term = String(query || '').trim();
    if (!term) return [];
    try {
      const result = await request(`/api/x/search?q=${encodeURIComponent(term)}`);
      return Array.isArray(result) ? result : (result?.items || []);
    } catch (_) { return []; }
  }

  function openCommandPalette() {
    document.querySelector('.ox-command-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'ox-command-overlay';
    overlay.innerHTML = '<div class="ox-command" dir="rtl"><input aria-label="بحث عام" placeholder="ابحث في السجلات أو اكتب أمرًا…"><div class="ox-command-results">ابدأ بالكتابة للبحث.</div></div>';
    const input = overlay.querySelector('input');
    const results = overlay.querySelector('.ox-command-results');
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const items = await searchEntities(input.value);
        results.innerHTML = items.length ? items.map(item => `<button type="button">${escapeHtml(item.label_ar || item.label || item.name || item.id)}</button>`).join('') : 'لا توجد نتائج.';
      }, 180);
    });
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    input.focus();
  }

  function notificationCount() {
    const count = Number(root.__octagonUnreadNotificationCount || 0);
    const badge = document.querySelector('[data-ox-notification-count]');
    if (badge) { badge.hidden = count < 1; badge.textContent = count > 99 ? '99+' : String(count); }
    return count;
  }

  function buildChrome(target, options) {
    const section = OX.nav?.get?.(options.section || 'home') || { label_ar: 'أوكتاغون التجاري' };
    target.innerHTML = `<header class="ox-shell-header" dir="rtl"><a class="ox-brand" href="/s/home">أوكتاغون التجاري</a><div class="ox-header-actions"><button type="button" data-ox-search title="بحث عام">⌕ <span>بحث</span></button><button type="button" data-ox-assistant title="مساعد Omni">✦ Omni</button><button type="button" data-ox-notifications title="الإشعارات">🔔<b data-ox-notification-count hidden>0</b></button><button type="button" data-ox-theme>المظهر</button><button type="button" data-ox-user></button><button type="button" data-ox-logout>خروج</button></div></header><div class="ox-shell-layout" dir="rtl"><nav class="ox-section-nav" aria-label="أقسام النظام">${(OX.nav?.sections || []).filter(item => OX.nav.canOpen(item, currentUser())).map(item => `<a class="${item.key === options.section ? 'is-active' : ''}" href="/s/${item.key}" title="${escapeHtml(item.label_ar)}"><i class="fa-solid ${escapeHtml(item.icon)}"></i><span>${escapeHtml(item.label_ar)}</span></a>`).join('')}</nav><main class="ox-section-main"><div class="ox-section-heading"><h1>${escapeHtml(section.label_ar)}</h1></div><div class="ox-section-slot" data-ox-content></div></main></div>`;
    target.querySelector('[data-ox-search]').addEventListener('click', openCommandPalette);
    target.querySelector('[data-ox-assistant]').addEventListener('click', openAssistant);
    target.querySelector('[data-ox-theme]').addEventListener('click', event => renderThemeMenu(event.currentTarget));
    target.querySelector('[data-ox-logout]').addEventListener('click', logout);
    renderUser();
    notificationCount();
    return target.querySelector('[data-ox-content]');
  }

  function init(options) {
    const config = Object.assign({ section: 'home', mount: '#oxShell' }, options || {});
    setTheme(root.localStorage?.getItem('site-theme') || 'default');
    const mount = typeof config.mount === 'string' ? document.querySelector(config.mount) : config.mount;
    if (!mount) throw new Error('لم يتم العثور على حاوية واجهة النظام.');
    const content = buildChrome(mount, config);
    if (!root.localStorage?.getItem('octagon_user_id')) openLogin();
    return content;
  }

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); }
    if (event.key === 'Escape') document.querySelector('.ox-command-overlay')?.remove();
  });

  OX.api = Object.assign(OX.api || {}, { request, get: path => request(path), post: (path, body) => request(path, { method: 'POST', body }), patch: (path, body) => request(path, { method: 'PATCH', body }), delete: path => request(path, { method: 'DELETE' }) });
  OX.shell = Object.assign(OX.shell || {}, { init, toast, setTheme, openLogin, login, logout, getDb, currentUser, loadAssistant, openAssistant, openCommandPalette, searchEntities, notificationCount });
  root.showToast = root.showToast || toast;
}(window, document));
