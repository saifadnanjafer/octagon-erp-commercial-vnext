/*
 * OCTAGON OMNISYSTEM - modules/system-settings.js
 *
 * T6.1: unified system settings page. Add-only module; index.html wiring is
 * requested through coordination/integration-queue.md.
 */
(function () {
  'use strict';

  const PAGE_KEY = 'system_settings';
  const PAGE_ID = 'pageSystemSettings';
  const NAV_ID = 'navSystemSettings';
  const sections = new Map();
  const state = {
    active: 'overview',
    scheduler: null,
    schedulerError: '',
    acl: null,
    aclError: '',
    refreshedAt: '',
  };

  function O() {
    if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni;
    if (typeof window.ensureOmni === 'function') {
      try { return window.ensureOmni(); } catch (_) {}
    }
    return null;
  }

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type) {
    if (typeof showToast === 'function') showToast(message, type || 'info');
  }

  function save() {
    if (typeof window.saveData === 'function') window.saveData();
  }

  function cachedDb() {
    try {
      if (window.PentagonDB && typeof window.PentagonDB.getCached === 'function') return window.PentagonDB.getCached() || {};
    } catch (_) {}
    return {};
  }

  function ensureData() {
    const o = O();
    if (!o) return;
    if (!Array.isArray(o.importPresets)) o.importPresets = [];
    if (!o.systemSettings || typeof o.systemSettings !== 'object') o.systemSettings = {};
  }

  function currentTheme() {
    try { return localStorage.getItem('site-theme') || 'default'; } catch (_) { return 'default'; }
  }

  function themeNames() {
    return {
      default: 'افتراضي',
      glass: 'زجاجي',
      abstract: 'تجريدي',
      neumorphism: 'ناعم',
      clean: 'نظيف',
      bento: 'Bento',
      premium: 'Premium',
      glassmorphism: 'Glassmorphism',
      dashboard: 'Dashboard',
      refined: 'Refined',
      shadcn: 'Shadcn',
      perspective: 'Perspective',
    };
  }

  function availableThemes() {
    try {
      if (Array.isArray(window.THEMES)) return window.THEMES;
    } catch (_) {}
    return ['default', 'glass', 'abstract', 'neumorphism', 'clean', 'bento', 'premium', 'glassmorphism', 'dashboard', 'refined', 'shadcn', 'perspective'];
  }

  function schemaEnforced() {
    return !!(window.OctagonSchema && window.OctagonSchema.ENFORCE);
  }

  function registerSection(id, title, renderFn, options) {
    if (!id || typeof renderFn !== 'function') return false;
    sections.set(id, {
      id,
      title: title || id,
      render: renderFn,
      icon: options?.icon || 'fa-sliders',
      order: Number(options?.order || 100),
      badge: options?.badge || '',
    });
    return true;
  }

  function orderedSections() {
    return [...sections.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }

  function setActive(id) {
    if (!sections.has(id)) return;
    state.active = id;
    render();
  }

  async function refreshRemote() {
    state.refreshedAt = new Date().toISOString();
    try {
      const res = await fetch('/api/cron/status', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.scheduler = await res.json();
      state.schedulerError = '';
    } catch (error) {
      state.scheduler = null;
      state.schedulerError = error.message || 'تعذر قراءة المجدول';
    }
    try {
      if (window.Acl && typeof window.Acl.load === 'function') {
        state.acl = await window.Acl.load(true);
      } else {
        const res = await fetch('acl.json', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.acl = await res.json();
      }
      state.aclError = '';
    } catch (error) {
      state.acl = null;
      state.aclError = error.message || 'تعذر قراءة الصلاحيات';
    }
    render();
  }

  function kpi(label, value, note, tone) {
    return `<div class="ss-kpi ss-kpi-${esc(tone || 'info')}"><b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note || '')}</small></div>`;
  }

  function renderOverview() {
    ensureData();
    const db = cachedDb();
    const presets = O()?.importPresets || [];
    const aclRoles = state.acl?.roles ? Object.keys(state.acl.roles).length : 0;
    const schedulerJobs = state.scheduler?.jobs ? state.scheduler.jobs.length : 0;
    const schemaCount = window.OctagonSchema?.collections ? Object.keys(window.OctagonSchema.collections).length : 0;
    return `<div class="ss-section">
      <div class="ss-kpi-grid">
        ${kpi('تاريخ الإقفال المالي', db._lock_date || 'غير محدد', 'قراءة من PentagonDB', db._lock_date ? 'success' : 'warn')}
        ${kpi('وظائف المجدول', schedulerJobs || '—', state.schedulerError || 'cron_jobs', schedulerJobs ? 'success' : 'warn')}
        ${kpi('أدوار الصلاحيات', aclRoles || '—', state.aclError || 'acl.json', aclRoles ? 'success' : 'warn')}
        ${kpi('قواعد المخطط', schemaCount, schemaEnforced() ? 'التنفيذ مفعل' : 'وضع التحذير', schemaEnforced() ? 'danger' : 'info')}
        ${kpi('إعدادات الاستيراد', presets.length, 'omni.importPresets', presets.length ? 'success' : 'info')}
        ${kpi('المظهر الحالي', themeNames()[currentTheme()] || currentTheme(), 'site-theme', 'info')}
      </div>
      <div class="ss-note">
        <b>مركز الإعدادات</b>
        <span>هذه الصفحة تجمع الروابط والإعدادات الجديدة بدون نقل إعدادات الرواتب أو تكرار عناصر cfg المحمية.</span>
      </div>
    </div>`;
  }

  function renderFinanceLock() {
    const lock = cachedDb()._lock_date || '';
    return `<div class="ss-section">
      <h3>إقفال الفترة المالية</h3>
      <p class="ss-muted">يستخدم نفس خدمة المالية الحالية ولا يكتب مباشرة إلى قاعدة البيانات.</p>
      <div class="ss-form-row">
        <label>تاريخ الإقفال</label>
        <input id="ssFinanceLockDate" type="date" value="${esc(lock)}">
        <button class="ss-btn primary" onclick="SystemSettings.saveFinanceLock()">حفظ</button>
        <button class="ss-btn" onclick="SystemSettings.clearFinanceLock()">مسح</button>
      </div>
      <div class="ss-readout">القيمة الحالية: <code>${esc(lock || 'غير محدد')}</code></div>
    </div>`;
  }

  function renderSequences() {
    const seqReady = !!window.OctagonSeq;
    const draft = O()?.systemSettings?.sequenceDrafts || {};
    const rows = ['inv', 'job', 'ticket', 'visitor', 'service'].map(code => {
      const cfg = draft[code] || {};
      return `<tr><td><code>${esc(code)}</code></td><td>${esc(cfg.prefix || code.toUpperCase() + '-')}</td><td>${esc(cfg.padding || 5)}</td><td>${seqReady ? 'جاهز' : 'بانتظار T1.4'}</td></tr>`;
    }).join('');
    return `<div class="ss-section">
      <h3>ترقيم المستندات</h3>
      <p class="ss-muted">OctagonSeq لم يكتمل ضمن T1.4 بعد؛ تعرض هذه البطاقة شكل الإعداد المتوقع وتبقى غير مغيرة للترقيم الحالي.</p>
      <table class="ss-table"><thead><tr><th>الكود</th><th>البادئة</th><th>الخانات</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  function renderScheduler() {
    const jobs = state.scheduler?.jobs || [];
    if (state.schedulerError) {
      return `<div class="ss-section"><h3>المجدول</h3><div class="ss-alert">${esc(state.schedulerError)}</div><button class="ss-btn" onclick="SystemSettings.refresh()">تحديث</button></div>`;
    }
    const rows = jobs.map(job => `<tr>
      <td><code>${esc(job.code)}</code><br><small>${esc(job.label || '')}</small></td>
      <td>${Number(job.enabled) === 1 ? 'مفعل' : 'متوقف'}</td>
      <td>${esc(job.interval_hours || job.intervalHours || '')}</td>
      <td>${esc(job.last_run || '')}</td>
      <td><button class="ss-btn small" onclick="SystemSettings.runCron('${esc(job.code)}')">تشغيل الآن</button></td>
    </tr>`).join('');
    return `<div class="ss-section">
      <h3>المجدول</h3>
      <p class="ss-muted">التشغيل اليدوي متاح. تبديل enabled يحتاج نقطة تحديث خادمية لاحقة.</p>
      <table class="ss-table"><thead><tr><th>الوظيفة</th><th>الحالة</th><th>كل ساعة</th><th>آخر تشغيل</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">لا توجد وظائف مقروءة.</td></tr>'}</tbody></table>
    </div>`;
  }

  function renderAcl() {
    const acl = state.acl || {};
    const roles = acl.roles || {};
    const groups = acl.groups || {};
    const groupKeys = Object.keys(groups);
    const rows = Object.keys(roles).map(role => `<tr>
      <td><code>${esc(role)}</code></td>
      ${groupKeys.map(group => `<td><span class="ss-access ss-access-${esc(roles[role][group] || 'none')}">${esc(roles[role][group] || 'none')}</span></td>`).join('')}
    </tr>`).join('');
    return `<div class="ss-section">
      <h3>مصفوفة الصلاحيات</h3>
      ${state.aclError ? `<div class="ss-alert">${esc(state.aclError)}</div>` : ''}
      <table class="ss-table ss-acl-table"><thead><tr><th>الدور</th>${groupKeys.map(g => `<th>${esc(groups[g]?.labelAr || g)}</th>`).join('')}</tr></thead><tbody>${rows || '<tr><td>لا توجد مصفوفة.</td></tr>'}</tbody></table>
    </div>`;
  }

  function renderImportPresets() {
    ensureData();
    const presets = O()?.importPresets || [];
    const rows = presets.map(p => `<tr>
      <td>${esc(p.name || p.id)}</td>
      <td><code>${esc(p.collectionKey || '')}</code></td>
      <td>${esc((p.updatedAt || '').slice(0, 16).replace('T', ' '))}</td>
      <td><button class="ss-btn small danger" onclick="SystemSettings.deleteImportPreset('${esc(p.id)}')">حذف</button></td>
    </tr>`).join('');
    return `<div class="ss-section">
      <h3>إعدادات الاستيراد</h3>
      <p class="ss-muted">إدارة إعدادات الربط المحفوظة من مركز الاستيراد.</p>
      <table class="ss-table"><thead><tr><th>الاسم</th><th>المجموعة</th><th>آخر تحديث</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">لا توجد إعدادات محفوظة.</td></tr>'}</tbody></table>
    </div>`;
  }

  function renderTheme() {
    const current = currentTheme();
    return `<div class="ss-section">
      <h3>المظهر</h3>
      <div class="ss-theme-grid">
        ${availableThemes().map(theme => `<button class="ss-theme ${theme === current ? 'active' : ''}" onclick="SystemSettings.setTheme('${esc(theme)}')">
          <span class="ss-swatch ss-swatch-${esc(theme)}"></span>
          <b>${esc(themeNames()[theme] || theme)}</b>
        </button>`).join('')}
      </div>
    </div>`;
  }

  function renderSchema() {
    const schema = window.OctagonSchema;
    const count = schema?.collections ? Object.keys(schema.collections).length : 0;
    return `<div class="ss-section">
      <h3>حارس المخطط</h3>
      <p class="ss-muted">وضع التحذير هو الافتراضي. تفعيل الرفض يؤثر على الكتابات الجديدة فقط.</p>
      <label class="ss-toggle">
        <input type="checkbox" ${schemaEnforced() ? 'checked' : ''} onchange="SystemSettings.setSchemaEnforce(this.checked)">
        <span>تفعيل رفض الكتابات غير الصالحة</span>
      </label>
      <div class="ss-readout">عدد المجموعات المعرفة: <b>${count}</b></div>
    </div>`;
  }

  function renderPayrollReadOnly() {
    let cfg = {};
    try { if (typeof getConfig === 'function') cfg = getConfig() || {}; } catch (_) {}
    const org = O()?.adminSettings?.organization || {};
    const payroll = (() => {
      try { return typeof getPayrollSettings === 'function' ? getPayrollSettings() : {}; } catch (_) { return {}; }
    })();
    return `<div class="ss-section">
      <h3>إعدادات الرواتب والدوام (للقراءة)</h3>
      <p class="ss-muted">لا يتم نقل أو تكرار عناصر cfg هنا. هذه بطاقة قراءة فقط مع رابط للوحة الأصلية.</p>
      <div class="ss-read-grid">
        <div><span>الشهر/السنة</span><b>${esc(cfg.month || '—')} / ${esc(cfg.year || '—')}</b></div>
        <div><span>بداية الدوام</span><b>${esc(org.workStart || '—')}</b></div>
        <div><span>نهاية الدوام</span><b>${esc(org.workEnd || '—')}</b></div>
        <div><span>يوم العطلة</span><b>${esc(org.dayOff || 'friday')}</b></div>
        <div><span>ساعات اليوم القياسي</span><b>${esc(payroll.standardDayHours || '—')}</b></div>
        <div><span>سماحية التأخير الشهرية</span><b>${esc(payroll.graceMinutesPerMonth || '—')}</b></div>
      </div>
      <button class="ss-btn" onclick="SystemSettings.openAdminSettings()">فتح لوحة الإعدادات الأصلية</button>
    </div>`;
  }

  function renderActiveSection() {
    const section = sections.get(state.active) || orderedSections()[0];
    if (!section) return '<div class="ss-section">لا توجد أقسام.</div>';
    try {
      return section.render();
    } catch (error) {
      return `<div class="ss-section"><div class="ss-alert">تعذر عرض القسم: ${esc(error.message || error)}</div></div>`;
    }
  }

  function pageHtml() {
    const items = orderedSections();
    const active = sections.has(state.active) ? state.active : items[0]?.id;
    state.active = active || state.active;
    return `<div class="ss-shell" dir="rtl">
      <div class="ss-hero">
        <div>
          <span class="ss-eyebrow">إعدادات النظام</span>
          <h2>مركز إعدادات أوكتاغون</h2>
          <p>لوحة موحدة للإعدادات الجديدة والروابط التشغيلية الحساسة.</p>
        </div>
        <button class="ss-btn" onclick="SystemSettings.refresh()">تحديث</button>
      </div>
      <div class="ss-layout">
        <aside class="ss-nav">
          ${items.map(item => `<button class="${item.id === active ? 'active' : ''}" onclick="SystemSettings.setActive('${esc(item.id)}')">
            <i class="fa-solid ${esc(item.icon)}"></i><span>${esc(item.title)}</span>${item.badge ? `<em>${esc(item.badge)}</em>` : ''}
          </button>`).join('')}
        </aside>
        <main class="ss-body">${renderActiveSection()}</main>
      </div>
    </div>`;
  }

  function ensureShell() {
    let page = document.getElementById(PAGE_ID);
    if (!page) {
      page = document.createElement('div');
      page.id = PAGE_ID;
      page.className = 'page';
      const host = document.querySelector('.main-content') || document.querySelector('main') || document.querySelector('.content') || document.body;
      host.appendChild(page);
    }
    if (!document.getElementById(NAV_ID)) {
      const navHost = document.querySelector('#navGroup-admin_org .nav-group-body') || document.querySelector('.sidebar') || document.querySelector('nav');
      if (navHost) {
        const btn = document.createElement('button');
        btn.id = NAV_ID;
        btn.className = 'nav-btn';
        btn.setAttribute('data-page', PAGE_KEY);
        btn.innerHTML = '<i class="fa-solid fa-sliders"></i><span>إعدادات النظام</span>';
        btn.addEventListener('click', () => window.switchPage(PAGE_KEY));
        navHost.appendChild(btn);
      }
    }
    return page;
  }

  function render() {
    ensureBuiltins();
    const page = ensureShell();
    page.innerHTML = pageHtml();
  }

  function activatePage() {
    ensureData();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const page = ensureShell();
    page.classList.add('page-active');
    const nav = document.getElementById(NAV_ID);
    if (nav) nav.classList.add('active');
    window.currentPage = PAGE_KEY;
    render();
    refreshRemote();
  }

  function wireSwitch() {
    if (window.__systemSettingsWrapped || typeof window.switchPage !== 'function') return;
    const original = window.switchPage;
    window.switchPage = function (page) {
      if (page === PAGE_KEY) {
        try { activatePage(); } catch (error) { console.warn('System Settings render error:', error); }
        return;
      }
      return original.apply(this, arguments);
    };
    window.__systemSettingsWrapped = true;
  }

  async function saveFinanceLock() {
    const value = document.getElementById('ssFinanceLockDate')?.value || '';
    try {
      if (window.FinanceService && typeof window.FinanceService.setLockDate === 'function') {
        await window.FinanceService.setLockDate(value);
      } else if (window.PentagonDB && typeof window.PentagonDB.mutate === 'function') {
        await window.PentagonDB.mutate(db => { db._lock_date = value; });
      } else {
        throw new Error('FinanceService غير جاهز');
      }
      toast('تم حفظ تاريخ الإقفال', 'success');
      render();
    } catch (error) {
      toast(error.message || 'تعذر حفظ تاريخ الإقفال', 'error');
    }
  }

  async function runCron(code) {
    try {
      const res = await fetch('/api/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      toast('تم تشغيل الوظيفة المجدولة', 'success');
      await refreshRemote();
    } catch (error) {
      toast(error.message || 'تعذر تشغيل المجدول', 'error');
    }
  }

  function deleteImportPreset(id) {
    ensureData();
    const o = O();
    if (!o || !Array.isArray(o.importPresets)) return;
    o.importPresets = o.importPresets.filter(p => p.id !== id);
    save();
    toast('تم حذف إعداد الاستيراد', 'success');
    render();
  }

  function setThemeValue(theme) {
    try {
      if (typeof window.setTheme === 'function') window.setTheme(theme);
      else localStorage.setItem('site-theme', theme);
      render();
    } catch (error) {
      toast(error.message || 'تعذر تغيير المظهر', 'error');
    }
  }

  function setSchemaEnforce(value) {
    if (window.OctagonSchema && typeof window.OctagonSchema.setEnforce === 'function') {
      window.OctagonSchema.setEnforce(!!value);
      toast(value ? 'تم تفعيل رفض الكتابات غير الصالحة' : 'تم الرجوع إلى وضع التحذير', 'info');
      render();
    }
  }

  function openAdminSettings() {
    try {
      if (typeof window.switchPage === 'function') window.switchPage('admin_panel');
    } catch (_) {}
  }

  function ensureBuiltins() {
    if (sections.size) return;
    registerSection('overview', 'نظرة عامة', renderOverview, { icon: 'fa-gauge-high', order: 10 });
    registerSection('finance_lock', 'إقفال المالية', renderFinanceLock, { icon: 'fa-lock', order: 20 });
    registerSection('sequences', 'الترقيم', renderSequences, { icon: 'fa-hashtag', order: 30 });
    registerSection('scheduler', 'المجدول', renderScheduler, { icon: 'fa-clock', order: 40 });
    registerSection('acl', 'الصلاحيات', renderAcl, { icon: 'fa-shield-halved', order: 50 });
    registerSection('import_presets', 'الاستيراد', renderImportPresets, { icon: 'fa-file-import', order: 60 });
    registerSection('theme', 'المظهر', renderTheme, { icon: 'fa-palette', order: 70 });
    registerSection('schema', 'حارس المخطط', renderSchema, { icon: 'fa-database', order: 80 });
    registerSection('payroll_readonly', 'الرواتب والدوام', renderPayrollReadOnly, { icon: 'fa-user-clock', order: 90 });
  }

  function init() {
    ensureData();
    ensureBuiltins();
    ensureShell();
    wireSwitch();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      wireSwitch();
      if (window.__systemSettingsWrapped || tries > 80) clearInterval(timer);
    }, 150);
  }

  window.SystemSettings = {
    registerSection,
    sections: orderedSections,
    setActive,
    render,
    refresh: refreshRemote,
    open: () => window.switchPage(PAGE_KEY),
    saveFinanceLock,
    clearFinanceLock: () => { const el = document.getElementById('ssFinanceLockDate'); if (el) el.value = ''; saveFinanceLock(); },
    runCron,
    deleteImportPreset,
    setTheme: setThemeValue,
    setSchemaEnforce,
    openAdminSettings,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
