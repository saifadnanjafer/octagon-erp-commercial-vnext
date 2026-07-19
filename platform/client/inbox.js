// ============================================================================
// Octagon Commercial — Home inbox widgets (P0.5)
// Pattern from erp-research/ruoyi-vue-pro-master/yudao-module-bpm/**
// (my/todo/done/CC Approval Center) and yudao-module-system/** notifications.
// Arabic-first, RTL, standalone vanilla JS; no legacy page is modified here.
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

  function relativeDate(iso) {
    const delta = Math.max(0, Date.now() - new Date(iso).getTime());
    const minutes = Math.floor(delta / 60000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `قبل ${minutes} د`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `قبل ${hours} س`;
    return `قبل ${Math.floor(hours / 24)} ي`;
  }

  function mount(element, options) {
    if (!element) throw new Error('OX.inbox.mount requires a host element');
    const settings = { pollMs: 30000, approvalLimit: 6, notificationLimit: 6, ...(options || {}) };
    let box = 'todo';
    let timer = null;
    let disposed = false;

    element.dir = 'rtl';
    element.classList.add('ox-inbox');
    element.innerHTML = `
      <div class="ox-inbox-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;direction:rtl">
        <section class="ox-inbox-card" style="background:var(--card-bg,var(--bg-card,#fff));color:var(--text-primary,inherit);border:1px solid var(--border-color,#e5e7eb);border-radius:12px;padding:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong>مركز الموافقات</strong><span data-approval-count style="background:var(--primary,#2563eb);color:#fff;border-radius:999px;padding:2px 8px;font-size:12px">0</span></div>
          <div data-boxes style="display:flex;flex-wrap:wrap;gap:6px;margin:12px 0"></div><div data-approvals aria-live="polite">جارٍ التحميل…</div>
        </section>
        <section class="ox-inbox-card" style="background:var(--card-bg,var(--bg-card,#fff));color:var(--text-primary,inherit);border:1px solid var(--border-color,#e5e7eb);border-radius:12px;padding:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong>الإشعارات</strong><span data-notify-count style="background:var(--primary,#2563eb);color:#fff;border-radius:999px;padding:2px 8px;font-size:12px">0</span></div>
          <div data-notifications aria-live="polite" style="margin-top:12px">جارٍ التحميل…</div>
        </section>
      </div>`;
    const boxes = element.querySelector('[data-boxes]');
    const approvalsHost = element.querySelector('[data-approvals]');
    const notificationsHost = element.querySelector('[data-notifications]');
    const approvalCount = element.querySelector('[data-approval-count]');
    const notifyCount = element.querySelector('[data-notify-count]');
    const boxLabels = { todo: 'بانتظار قراري', mine: 'طلباتي', done: 'المكتملة', cc: 'نسخة إليّ' };

    function renderBoxes() {
      boxes.innerHTML = Object.entries(boxLabels).map(([key, label]) => `<button type="button" data-box="${key}" style="border:1px solid var(--border-color,#d1d5db);background:${key === box ? 'var(--primary,#2563eb)' : 'transparent'};color:${key === box ? '#fff' : 'inherit'};border-radius:7px;padding:5px 8px;cursor:pointer">${label}</button>`).join('');
      boxes.querySelectorAll('[data-box]').forEach(button => button.addEventListener('click', () => { box = button.dataset.box; renderBoxes(); loadApprovals(); }));
    }

    function approvalRow(item) {
      const actions = box === 'todo' && item.status === 'pending'
        ? `<div style="display:flex;gap:6px;margin-top:8px"><button data-approve="${esc(item.id)}" type="button">موافقة</button><button data-reject="${esc(item.id)}" type="button">رفض</button></div>` : '';
      return `<article style="padding:9px 0;border-bottom:1px solid var(--border-color,#edf0f3)"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(item.action)}</b><small>${esc(relativeDate(item.created_at))}</small></div><div style="font-size:13px;opacity:.8;margin-top:4px">${esc(item.entity)} · ${esc(item.record_id)}</div><small style="opacity:.7">الطالب: ${esc(item.requester)} · الحالة: ${esc(item.status)}</small>${actions}</article>`;
    }
    async function loadApprovals() {
      try {
        const result = await api(`/api/x/approvals/list?box=${encodeURIComponent(box)}&limit=${settings.approvalLimit}`);
        const items = result.data || [];
        approvalCount.textContent = box === 'todo' ? String(result.meta && result.meta.total || 0) : String(items.length);
        approvalsHost.innerHTML = items.length ? items.map(approvalRow).join('') : '<p style="opacity:.7">لا توجد عناصر في هذه القائمة.</p>';
        approvalsHost.querySelectorAll('[data-approve],[data-reject]').forEach(button => button.addEventListener('click', async () => {
          const approve = Boolean(button.dataset.approve); const id = button.dataset.approve || button.dataset.reject;
          try { await api(`/api/x/approvals/${approve ? 'approve' : 'reject'}/${encodeURIComponent(id)}`, { method: 'POST', body: '{}' }); toast(approve ? 'تمت الموافقة.' : 'تم رفض الطلب.'); load(); } catch (error) { toast(error.message); }
        }));
      } catch (error) { approvalsHost.innerHTML = `<p style="color:var(--danger,#b91c1c)">${esc(error.message)}</p>`; }
    }
    async function loadNotifications() {
      try {
        const result = await api(`/api/x/notify/list?limit=${settings.notificationLimit}`);
        const items = result.data || []; notifyCount.textContent = String(result.meta && result.meta.unread || 0);
        notificationsHost.innerHTML = items.length ? items.map(item => `<article data-notification="${esc(item.id)}" style="padding:9px 0;border-bottom:1px solid var(--border-color,#edf0f3);cursor:pointer;opacity:${item.read ? '.65' : '1'}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(item.title || 'إشعار')}</b><small>${esc(relativeDate(item.created_at))}</small></div><div style="font-size:13px;margin-top:4px">${esc(item.body)}</div></article>`).join('') : '<p style="opacity:.7">لا توجد إشعارات جديدة.</p>';
        notificationsHost.querySelectorAll('[data-notification]').forEach(row => row.addEventListener('click', async () => { try { await api(`/api/x/notify/mark-read/${encodeURIComponent(row.dataset.notification)}`, { method: 'POST', body: '{}' }); loadNotifications(); } catch (error) { toast(error.message); } }));
      } catch (error) { notificationsHost.innerHTML = `<p style="color:var(--danger,#b91c1c)">${esc(error.message)}</p>`; }
    }
    function load() { if (!disposed) { loadApprovals(); loadNotifications(); } }
    renderBoxes(); load(); timer = window.setInterval(load, Math.max(5000, settings.pollMs));
    return { refresh: load, destroy() { disposed = true; if (timer) window.clearInterval(timer); element.innerHTML = ''; } };
  }
  OX.inbox = { mount };
})(window, document);
