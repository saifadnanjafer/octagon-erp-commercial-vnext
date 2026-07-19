// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.13 company switcher (proprietary self, not copied)
// ============================================================================
// Octagon Commercial — Company switcher (T1.13.1)
// Arabic-first, RTL, standalone vanilla JS; follows the same
// window.OX.<feature>.mount(element, options) convention as
// vnext/client/inbox.js and vnext/client/chatter.js. No legacy page is
// modified by loading this file — it does nothing until `.mount()` is
// called from a page that opts in.
//
// Talks to /api/x/org/companies + /api/x/org/active-company (see
// vnext/server/org/org-routes.js). This is the SQL-schema-native
// company/branch/department/warehouse model from migrations/401 — NOT the
// legacy single-tenant JSON-blob mechanism in server.js
// (getActiveTenantProfile/stampServerTenantRecord). See
// vnext/server/org/TASK.md "Known discrepancy" for why the two are
// intentionally kept separate.
// ============================================================================
(function (window, document) {
  'use strict';
  const OX = window.OX = window.OX || {};
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const toast = message => (typeof window.showToast === 'function' ? window.showToast(message) : window.alert(message));

  const api = async (url, options) => {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...(options || {}) });
    const payload = await response.json().catch(() => ({ success: false, error: 'استجابة غير صالحة' }));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'تعذر إكمال الطلب');
    return payload;
  };

  /**
   * Mount the company switcher into `element`.
   * @param {HTMLElement} element host element
   * @param {{onChange?: (company: object) => void}} [options]
   * @returns {{refresh: () => Promise<void>, destroy: () => void}}
   */
  function mount(element, options) {
    if (!element) throw new Error('OX.companySwitcher.mount requires a host element');
    const settings = { onChange: null, ...(options || {}) };
    let disposed = false;

    element.dir = 'rtl';
    element.classList.add('ox-company-switcher');
    element.innerHTML = `
      <label class="ox-cs-label" for="ox-cs-select">الشركة النشطة</label>
      <select class="ox-cs-select" id="ox-cs-select" disabled>
        <option value="">جارٍ التحميل…</option>
      </select>
      <span class="ox-cs-status" data-status aria-live="polite"></span>
    `;
    const select = element.querySelector('#ox-cs-select');
    const status = element.querySelector('[data-status]');

    function setStatus(message, isError) {
      status.textContent = message || '';
      status.classList.toggle('ox-cs-status-error', !!isError);
    }

    async function load() {
      try {
        const [companiesResult, activeResult] = await Promise.all([
          api('/api/x/org/companies'),
          api('/api/x/org/active-company'),
        ]);
        if (disposed) return;
        const companies = companiesResult.data || [];
        const active = activeResult.data;
        if (!companies.length) {
          select.innerHTML = '<option value="">لا توجد شركات متاحة</option>';
          select.disabled = true;
          setStatus('لا يملك هذا المستخدم صلاحية الوصول إلى أي شركة.', true);
          return;
        }
        select.innerHTML = companies
          .map(c => `<option value="${esc(c.company_id)}">${esc(c.name)}${c.is_default ? ' (افتراضي)' : ''}</option>`)
          .join('');
        select.value = active ? active.company_id : companies[0].company_id;
        select.disabled = false;
        setStatus('');
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    async function onChange() {
      const companyId = select.value;
      if (!companyId) return;
      select.disabled = true;
      try {
        const result = await api('/api/x/org/active-company', { method: 'POST', body: JSON.stringify({ company_id: companyId }) });
        setStatus('تم تبديل الشركة النشطة.');
        if (typeof settings.onChange === 'function') settings.onChange(result.data);
        document.dispatchEvent(new CustomEvent('octagon:company-changed', { detail: result.data }));
      } catch (error) {
        setStatus(error.message, true);
        toast(error.message);
      } finally {
        select.disabled = false;
      }
    }

    select.addEventListener('change', onChange);
    load();

    return {
      refresh: load,
      destroy() {
        disposed = true;
        select.removeEventListener('change', onChange);
        element.innerHTML = '';
      },
    };
  }

  OX.companySwitcher = { mount };
})(window, document);
