/**
 * OCTAGON ERP — VNext Platform Kernel (R1) live page.
 *
 * Mounts the already-loaded `vnext/client/*` widgets (OX.crud, OX.chatter,
 * OX.historyPanel, OX.inbox) against the real, running server — these
 * scripts were already <script>-included in index.html by an earlier
 * session but never actually mounted into any real navigable page (see
 * octagon-analysis/README.md "prior sessions built a W0 platform core spike
 * ... mounted ... but it is not integrated — only platform/client/demo.html
 * consumes it; no real nav page does"). This page closes that gap: a real
 * `crm_lead` CRUD table (T1.1.3) and the nine-box Approval Center (T1.9.2),
 * both against the live `/api/x/*` HTTP API, not a fake in-page stub.
 *
 * Page: #pageVnextPlatform (nav data-page="vnext_platform").
 * Pattern: self-registering switchPage-wrap module, same technique as
 * modules/appointments.js — additive only, never edits app.js's core.
 */
(function () {
  'use strict';

  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }

  function render() {
    const body = document.getElementById('vnextPlatformBody');
    if (!body) return;
    body.innerHTML = `
      <section class="admin-card admin-card-wide" style="margin-bottom:16px">
        <h3><i class="fa-solid fa-building"></i> الشركة النشطة (Company Switcher)</h3>
        <div id="vnextPlatformCompany"></div>
      </section>
      <section class="admin-card admin-card-wide" style="margin-bottom:16px">
        <h3><i class="fa-solid fa-address-book"></i> العملاء المحتملون (crm_lead) — CRUD عام</h3>
        <div id="vnextPlatformCrud"></div>
      </section>
      <section class="admin-card admin-card-wide">
        <h3><i class="fa-solid fa-inbox"></i> مركز الموافقات (تسعة مسارات)</h3>
        <div id="vnextPlatformInbox"></div>
      </section>
    `;

    const companyHost = document.getElementById('vnextPlatformCompany');
    if (window.OX && window.OX.companySwitcher && typeof window.OX.companySwitcher.mount === 'function') {
      try { window.OX.companySwitcher.mount(companyHost, {}); }
      catch (e) { companyHost.innerHTML = '<div class="oxc-muted">تعذر تحميل مبدّل الشركة: ' + (e && e.message ? e.message : e) + '</div>'; }
    } else if (companyHost) {
      companyHost.innerHTML = '<div class="oxc-muted">وحدة OX.companySwitcher غير محمّلة بعد.</div>';
    }

    const crudHost = document.getElementById('vnextPlatformCrud');
    if (window.OX && window.OX.crud && typeof window.OX.crud.mountEntity === 'function' && window.OX.entityUI) {
      try { window.OX.crud.mountEntity(crudHost, 'crm_lead'); }
      catch (e) { crudHost.innerHTML = '<div class="oxc-muted">تعذر تحميل واجهة CRUD: ' + (e && e.message ? e.message : e) + '</div>'; }
    } else if (crudHost) {
      crudHost.innerHTML = '<div class="oxc-muted">وحدة OX.crud غير محمّلة بعد.</div>';
    }

    const inboxHost = document.getElementById('vnextPlatformInbox');
    if (window.OX && window.OX.inbox && typeof window.OX.inbox.mount === 'function') {
      try { window.OX.inbox.mount(inboxHost, {}); }
      catch (e) { inboxHost.innerHTML = '<div class="oxc-muted">تعذر تحميل مركز الموافقات: ' + (e && e.message ? e.message : e) + '</div>'; }
    } else if (inboxHost) {
      inboxHost.innerHTML = '<div class="oxc-muted">وحدة OX.inbox غير محمّلة بعد.</div>';
    }
  }

  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('vnext_platform');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageVnextPlatform');
    const nav = document.getElementById('navVnextPlatform');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('vnext_platform'); } catch (_) {} }
    window.currentPage = 'vnext_platform';
    render();
    return !!pg;
  }

  function wireSwitch() {
    if (window.__vnextPlatformWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'vnext_platform') {
        try { if (activatePage()) return; } catch (e) { console.warn('VNext platform render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__vnextPlatformWrapped = true;
  }

  function init() {
    wireSwitch();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      wireSwitch();
      if (window.__vnextPlatformWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
