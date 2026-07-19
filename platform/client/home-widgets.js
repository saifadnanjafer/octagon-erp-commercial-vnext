// ============================================================================
// Octagon Commercial — Home workbench widgets (P0.11)
// Pattern from erp-research/nocobase-main/docs/docs/en/plugins/@nocobase/
// plugin-block-workbench/index.md and erp-research/ruoyi-vue-pro-master/
// yudao-module-bpm/src/main/java/cn/iocoder/yudao/module/bpm/controller/admin/
// task/BpmTaskController.java. Legacy home reference: views/home.html + app.js.
// Arabic-first, RTL, standalone vanilla JS. Finance and workshop reads only.
// ============================================================================
(function (window, document) {
  'use strict';

  var OX = window.OX = window.OX || {};
  var FAVORITES_KEY = 'octagon-commercial-home-favorites-v1';
  var PAGE_LABELS = {
    sales: 'المبيعات', helpdesk: 'الدعم', work_orders: 'أوامر العمل',
    approvals: 'الموافقات', finance: 'المالية', inventory: 'المخزون',
    projects: 'المشاريع', procurement: 'المشتريات', customers: 'العملاء'
  };
  var DEFAULT_FAVORITES = ['sales', 'work_orders', 'finance', 'approvals'];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') return window.showToast(message, type || 'info');
    if (window.console) window.console.warn('[OX.homeWidgets]', message);
  }

  function readFavorites() {
    try {
      var value = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(value) ? value.filter(function (page) { return PAGE_LABELS[page]; }) : [];
    } catch (_) { return []; }
  }

  function writeFavorites(pages) {
    try { window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(pages)); } catch (_) {}
  }

  function navigate(page) {
    if (typeof window.switchPage === 'function') {
      window.switchPage(page);
      return;
    }
    toast('سيتم فتح «' + (PAGE_LABELS[page] || page) + '» عند تحميل واجهة النظام.', 'info');
  }

  function financeSnapshot() {
    var transactions = [];
    try { transactions = typeof window.getFinanceTransactions === 'function' ? window.getFinanceTransactions() : []; } catch (_) {}
    if (!Array.isArray(transactions)) transactions = [];
    var today = new Date().toISOString().slice(0, 10);
    var income = 0;
    var expense = 0;
    transactions.filter(function (transaction) { return String(transaction.date || '').slice(0, 10) === today; }).forEach(function (transaction) {
      var amount = Number(transaction.amount || 0);
      if (!Number.isFinite(amount)) amount = 0;
      if (['income', 'sales_receipt', 'customer_charge'].indexOf(transaction.type) !== -1) income += amount;
      if (['expense', 'salary_payment', 'supplier_payment'].indexOf(transaction.type) !== -1) expense += amount;
    });
    return { income: income, expense: expense };
  }

  function workshopSnapshot() {
    var jobs = [];
    try { jobs = window.omni && Array.isArray(window.omni.jobOrders) ? window.omni.jobOrders : []; } catch (_) {}
    var active = jobs.filter(function (job) {
      var state = String(job.state || job.status || '').toLowerCase();
      return job && job.is_active !== false && ['closed', 'delivered', 'cancelled'].indexOf(state) === -1;
    }).length;
    return { active: active };
  }

  function money(amount) {
    return new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 0 }).format(amount || 0) + ' د.ع';
  }

  function statCard(icon, label, value, tone) {
    return '<article class="ox-home-stat ox-home-stat--' + tone + '">' +
      '<span class="ox-home-stat__icon">' + icon + '</span>' +
      '<div><span class="ox-home-stat__label">' + label + '</span><strong class="ox-home-stat__value">' + value + '</strong></div>' +
      '</article>';
  }

  function styleOnce() {
    if (document.getElementById('ox-home-widgets-style')) return;
    var style = document.createElement('style');
    style.id = 'ox-home-widgets-style';
    style.textContent = [
      '.ox-home{direction:rtl;color:var(--text,var(--text-primary,#172033));font-family:inherit}',
      '.ox-home *{box-sizing:border-box}.ox-home__header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 18px}',
      '.ox-home__title{margin:0;font-size:24px;font-weight:800}.ox-home__subtitle{margin:6px 0 0;color:var(--text-muted,#64748b)}',
      '.ox-home__today{padding:8px 12px;border:1px solid var(--border-glass,var(--border-color,#dbe4ee));border-radius:999px;color:var(--text-muted,#64748b);font-size:13px}',
      '.ox-home__stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}',
      '.ox-home-stat,.ox-home-panel{background:var(--gradient-card,var(--card-bg,var(--bg-card,#fff)));border:1px solid var(--border-glass,var(--border-color,#dbe4ee));box-shadow:var(--shadow-sm,0 3px 12px rgba(15,23,42,.06));border-radius:var(--radius-lg,14px)}',
      '.ox-home-stat{display:flex;align-items:center;gap:12px;padding:15px}.ox-home-stat__icon{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:color-mix(in srgb,var(--primary,#2563eb) 15%,transparent);font-size:20px}',
      '.ox-home-stat--green .ox-home-stat__icon{background:color-mix(in srgb,var(--accent-green,#10b981) 16%,transparent)}.ox-home-stat--orange .ox-home-stat__icon{background:color-mix(in srgb,var(--accent-orange,#f59e0b) 16%,transparent)}',
      '.ox-home-stat__label{display:block;color:var(--text-muted,#64748b);font-size:12px}.ox-home-stat__value{display:block;margin-top:3px;font-size:18px}',
      '.ox-home__grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}.ox-home-panel{padding:16px;min-width:0}.ox-home-panel--inbox{grid-column:span 8}.ox-home-panel--side{grid-column:span 4}.ox-home-panel--wide{grid-column:span 12}',
      '.ox-home-panel__heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px;font-size:15px;font-weight:800}.ox-home-panel__hint{font-size:12px;color:var(--text-muted,#64748b);font-weight:500}',
      '.ox-home-favorites,.ox-home-quick{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:9px}.ox-home-action{position:relative;border:1px solid var(--border-glass,var(--border-color,#dbe4ee));background:rgba(255,255,255,.035);color:inherit;border-radius:10px;min-height:66px;padding:10px;text-align:right;cursor:pointer;font:inherit;font-weight:700;transition:transform .16s ease,border-color .16s ease}',
      '.ox-home-action:hover,.ox-home-action:focus-visible{transform:translateY(-2px);border-color:var(--primary,#2563eb);outline:none}.ox-home-action small{display:block;margin-top:4px;color:var(--text-muted,#64748b);font-size:11px;font-weight:500}.ox-home-favorite-remove{position:absolute;left:7px;top:7px;border:0;background:transparent;color:var(--text-muted,#64748b);cursor:pointer;font-size:15px}',
      '.ox-home-empty{margin:0;color:var(--text-muted,#64748b);font-size:13px}.ox-home-add-favorite{width:100%;margin-top:10px;border:1px dashed var(--border-glass,var(--border-color,#dbe4ee));background:transparent;color:var(--primary,#2563eb);border-radius:9px;padding:8px;cursor:pointer;font:inherit}',
      '.ox-home-modal{position:fixed;z-index:10010;inset:0;display:grid;place-items:center;padding:18px;background:rgba(2,6,23,.55)}.ox-home-modal__dialog{width:min(460px,100%);background:var(--bg-card,#fff);color:var(--text,#172033);border:1px solid var(--border-glass,var(--border-color,#dbe4ee));border-radius:16px;padding:20px;box-shadow:0 20px 56px rgba(2,6,23,.34)}.ox-home-modal label{display:block;margin-top:12px;font-size:13px;font-weight:700}.ox-home-modal input,.ox-home-modal select{width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border-color,#cbd5e1);background:transparent;color:inherit;font:inherit}.ox-home-modal__actions{display:flex;justify-content:flex-start;gap:8px;margin-top:18px}.ox-home-modal button{font:inherit;cursor:pointer;border-radius:8px;padding:9px 13px;border:1px solid var(--border-color,#cbd5e1);background:transparent;color:inherit}.ox-home-modal button[type=submit]{background:var(--primary,#2563eb);color:#fff;border-color:var(--primary,#2563eb)}',
      '@media (max-width:850px){.ox-home-panel--inbox,.ox-home-panel--side,.ox-home-panel--wide{grid-column:span 12}}'
    ].join('');
    document.head.appendChild(style);
  }

  function addFavoriteDialog(instance) {
    var available = Object.keys(PAGE_LABELS).filter(function (page) { return instance.favorites.indexOf(page) === -1; });
    if (!available.length) return toast('أُضيفت كل الاختصارات المتاحة بالفعل.', 'info');
    var modal = document.createElement('div');
    modal.className = 'ox-home-modal';
    modal.innerHTML = '<form class="ox-home-modal__dialog" dir="rtl"><h2 style="margin:0;font-size:19px">إضافة إلى المفضلة</h2>' +
      '<label>القسم<select name="page">' + available.map(function (page) { return '<option value="' + page + '">' + escapeHtml(PAGE_LABELS[page]) + '</option>'; }).join('') + '</select></label>' +
      '<div class="ox-home-modal__actions"><button type="submit">إضافة</button><button type="button" data-close>إلغاء</button></div></form>';
    function close() { modal.remove(); }
    modal.addEventListener('click', function (event) { if (event.target === modal || event.target.matches('[data-close]')) close(); });
    modal.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault();
      instance.favorites.push(event.currentTarget.page.value);
      writeFavorites(instance.favorites); close(); instance.render();
    });
    document.body.appendChild(modal);
    modal.querySelector('select').focus();
  }

  function quickLead(instance) {
    var modal = document.createElement('div');
    modal.className = 'ox-home-modal';
    modal.innerHTML = '<form class="ox-home-modal__dialog" dir="rtl"><h2 style="margin:0;font-size:19px">عميل محتمل جديد</h2>' +
      '<label>الاسم<input name="name" required maxlength="160" autocomplete="off"></label>' +
      '<label>الهاتف<input name="phone" maxlength="60" inputmode="tel"></label>' +
      '<label>المصدر<select name="source"><option value="phone">هاتف</option><option value="website">الموقع الإلكتروني</option><option value="social">وسائل التواصل</option><option value="walkin">زيارة مباشرة</option></select></label>' +
      '<div class="ox-home-modal__actions"><button type="submit">حفظ العميل المحتمل</button><button type="button" data-close>إلغاء</button></div></form>';
    function close() { modal.remove(); }
    modal.addEventListener('click', function (event) { if (event.target === modal || event.target.matches('[data-close]')) close(); });
    modal.querySelector('form').addEventListener('submit', async function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      try {
        var response = await window.fetch('/api/x/crm_lead/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.elements.name.value.trim(),
            phone: form.elements.phone.value.trim(),
            source: form.elements.source.value,
            status: 'new'
          })
        });
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok || !result.success) throw new Error(result.error || 'تعذر حفظ العميل المحتمل.');
        close(); toast('تم إنشاء العميل المحتمل.', 'success'); instance.refresh();
      } catch (error) { toast(error.message || 'تعذر حفظ العميل المحتمل.', 'danger'); submit.disabled = false; }
    });
    document.body.appendChild(modal);
    modal.querySelector('input[name=name]').focus();
  }

  function mount(element, options) {
    if (!element) throw new Error('OX.homeWidgets.mount requires a host element');
    styleOnce();
    var instance = { element: element, favorites: readFavorites(), inbox: null, destroyed: false };
    if (!instance.favorites.length) instance.favorites = DEFAULT_FAVORITES.slice();
    element.classList.add('ox-home');
    element.dir = 'rtl';

    instance.render = function () {
      if (instance.destroyed) return;
      if (instance.inbox && instance.inbox.destroy) instance.inbox.destroy();
      var finance = financeSnapshot();
      var workshop = workshopSnapshot();
      var date = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' });
      var favorites = instance.favorites.map(function (page) {
        return '<button type="button" class="ox-home-action" data-favorite="' + page + '">' + escapeHtml(PAGE_LABELS[page]) +
          '<small>فتح القسم</small><span class="ox-home-favorite-remove" data-remove="' + page + '" title="إزالة من المفضلة" aria-label="إزالة من المفضلة">×</span></button>';
      }).join('');
      element.innerHTML = '<header class="ox-home__header"><div><h1 class="ox-home__title">مساحة العمل اليوم</h1><p class="ox-home__subtitle">ملخص شخصي سريع للعمل والقرارات والمتابعة.</p></div><span class="ox-home__today">' + escapeHtml(date) + '</span></header>' +
        '<section class="ox-home__stats" aria-label="ملخص اليوم">' +
          statCard('↗', 'إيرادات اليوم', money(finance.income), 'green') +
          statCard('↙', 'مصروفات اليوم', money(finance.expense), 'orange') +
          statCard('◷', 'أوامر عمل نشطة', String(workshop.active), 'blue') +
        '</section><section class="ox-home__grid">' +
          '<div class="ox-home-panel ox-home-panel--inbox"><h2 class="ox-home-panel__heading">الموافقات والإشعارات <span class="ox-home-panel__hint">تُحدّث تلقائياً</span></h2><div data-inbox-host></div></div>' +
          '<div class="ox-home-panel ox-home-panel--side"><h2 class="ox-home-panel__heading">المفضلة</h2><div class="ox-home-favorites">' + (favorites || '<p class="ox-home-empty">لا توجد اختصارات محفوظة.</p>') + '</div><button type="button" class="ox-home-add-favorite" data-add-favorite>+ إضافة اختصار</button></div>' +
          '<div class="ox-home-panel ox-home-panel--wide"><h2 class="ox-home-panel__heading">إنشاء سريع <span class="ox-home-panel__hint">العمليات تمر عبر الصلاحيات والسجل</span></h2><div class="ox-home-quick">' +
            '<button type="button" class="ox-home-action" data-quick="lead">+ عميل محتمل<small>إنشاء سجل CRM جديد</small></button>' +
            '<button type="button" class="ox-home-action" data-page="work_orders">+ أمر عمل<small>فتح معالج أوامر العمل</small></button>' +
            '<button type="button" class="ox-home-action" data-page="helpdesk">+ تذكرة دعم<small>فتح مركز الدعم</small></button>' +
            '<button type="button" class="ox-home-action" data-page="approvals">طلبات الموافقة<small>متابعة القرارات المعلّقة</small></button>' +
          '</div></div></section>';
      var inboxHost = element.querySelector('[data-inbox-host]');
      if (OX.inbox && typeof OX.inbox.mount === 'function') instance.inbox = OX.inbox.mount(inboxHost, { approvalLimit: 5, notificationLimit: 5 });
      else inboxHost.innerHTML = '<p class="ox-home-empty">سيظهر مركز الموافقات بعد تحميل خدمة البريد الوارد.</p>';
      element.querySelectorAll('[data-favorite]').forEach(function (button) { button.addEventListener('click', function (event) { if (!event.target.closest('[data-remove]')) navigate(button.dataset.favorite); }); });
      element.querySelectorAll('[data-remove]').forEach(function (button) { button.addEventListener('click', function () { instance.favorites = instance.favorites.filter(function (page) { return page !== button.dataset.remove; }); writeFavorites(instance.favorites); instance.render(); }); });
      element.querySelector('[data-add-favorite]').addEventListener('click', function () { addFavoriteDialog(instance); });
      element.querySelectorAll('[data-page]').forEach(function (button) { button.addEventListener('click', function () { navigate(button.dataset.page); }); });
      element.querySelector('[data-quick=lead]').addEventListener('click', function () { quickLead(instance); });
    };
    instance.refresh = instance.render;
    instance.destroy = function () { instance.destroyed = true; if (instance.inbox && instance.inbox.destroy) instance.inbox.destroy(); element.innerHTML = ''; };
    instance.render();
    return instance;
  }

  OX.homeWidgets = { mount: mount };
})(window, document);
