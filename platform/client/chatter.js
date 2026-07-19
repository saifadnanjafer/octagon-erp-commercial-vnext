// ============================================================================
// Octagon Commercial — Chatter widget (P0.3, client)
// OX.chatter.mount(el, entity, id) → RTL Arabic record thread:
//   tabs (الرسائل/السجل/الأنشطة), composer, schedule-activity mini-form,
//   activity mark-done, follow/unfollow bell, Arabic relative timestamps,
//   15s polling while attached & page visible.
//
// Concept from aureuserp chatter (Message kind message|log|activity,
// Follower per record) + odoo addons/mail activity due/done semantics.
// No frameworks; talks to /api/x/chatter (platform/server/chatter.js).
// ============================================================================

(function () {
  'use strict';

  window.OX = window.OX || {};
  if (window.OX.chatter) return; // idempotent load guard

  var API_BASE = '/api/x/chatter';
  var POLL_MS = 15000;
  var PAGE_LIMIT = 20;

  var TABS = [
    { key: 'message', label: 'الرسائل' },
    { key: 'log', label: 'السجل' },
    { key: 'activity', label: 'الأنشطة' },
  ];

  var ACTIVITY_TYPES = ['مكالمة هاتفية', 'اجتماع', 'مهمة للتنفيذ', 'بريد إلكتروني', 'متابعة'];

  // -------------------------------------------------------------------------
  // Current user resolution — best effort across octagon globals.
  // -------------------------------------------------------------------------
  function currentUser() {
    try {
      var omniRef = typeof omni !== 'undefined' ? omni : window.omni;
      if (omniRef && omniRef.currentUser) {
        return String(omniRef.currentUser.displayName || omniRef.currentUser.name || omniRef.currentUser.id || '').trim() || 'مستخدم';
      }
    } catch (_) { /* omni not available */ }
    try {
      var stored = JSON.parse(localStorage.getItem('octagon_current_user') || 'null');
      if (stored) return String(stored.displayName || stored.name || stored.id || '').trim() || 'مستخدم';
    } catch (_) { /* ignore */ }
    return 'مستخدم';
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type || 'info');
  }

  // -------------------------------------------------------------------------
  // Arabic relative timestamps
  // -------------------------------------------------------------------------
  function arCount(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return n + ' ' + few;
    return n + ' ' + many;
  }

  function timeAgo(iso) {
    var then = new Date(iso).getTime();
    if (!then) return '';
    var s = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (s < 45) return 'الآن';
    var m = Math.floor(s / 60);
    if (m < 60) return 'قبل ' + arCount(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    var h = Math.floor(m / 60);
    if (h < 24) return 'قبل ' + arCount(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    var d = Math.floor(h / 24);
    if (d < 30) return 'قبل ' + arCount(d, 'يوم', 'يومين', 'أيام', 'يوم');
    return new Date(iso).toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function dueBadge(item) {
    if (!item.due_date || item.done) return '';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var due = new Date(item.due_date + 'T00:00:00');
    if (due < today) return '<span class="oxch-badge oxch-badge-late">متأخر</span>';
    if (due.getTime() === today.getTime()) return '<span class="oxch-badge oxch-badge-today">اليوم</span>';
    return '<span class="oxch-badge oxch-badge-due">استحقاق ' + escapeHtml(item.due_date) + '</span>';
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // -------------------------------------------------------------------------
  // API calls (envelope: {success, data, error, meta})
  // -------------------------------------------------------------------------
  function api(method, path, body) {
    return fetch(API_BASE + path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) { return res.json(); });
  }

  // -------------------------------------------------------------------------
  // Widget state + rendering
  // -------------------------------------------------------------------------
  function mount(el, entity, recordId) {
    if (!el || !entity || recordId == null) {
      console.warn('[oxch] mount requires (el, entity, id)');
      return null;
    }

    var state = {
      entity: String(entity),
      recordId: String(recordId),
      tab: 'message',
      page: 1,
      items: [],
      counts: { message: 0, log: 0, activity: 0, open_activities: 0 },
      followers: [],
      following: false,
      total: 0,
      loading: false,
      showActivityForm: false,
      timer: null,
    };

    el.classList.add('oxch');
    el.setAttribute('dir', 'rtl');
    renderSkeleton();
    refresh();

    // Poll every 15s while the element stays in the DOM and tab is visible.
    state.timer = setInterval(function () {
      if (!el.isConnected) { clearInterval(state.timer); state.timer = null; return; }
      if (document.visibilityState !== 'visible') return;
      refresh(true);
    }, POLL_MS);

    // ------------------------------ data ------------------------------
    function refresh(silent) {
      if (state.loading) return;
      state.loading = true;
      var qs = '/' + encodeURIComponent(state.entity) + '/' + encodeURIComponent(state.recordId)
        + '?kind=' + state.tab + '&page=' + state.page + '&limit=' + PAGE_LIMIT
        + '&user=' + encodeURIComponent(currentUser());
      api('GET', qs).then(function (resp) {
        state.loading = false;
        if (!resp || !resp.success) {
          if (!silent) toast(resp && resp.error ? resp.error : 'تعذّر تحميل المحادثة', 'error');
          return;
        }
        state.items = resp.data.items || [];
        state.followers = resp.data.followers || [];
        state.following = !!resp.data.following;
        state.counts = resp.data.counts || state.counts;
        state.total = (resp.meta && resp.meta.total) || 0;
        renderAll();
      }).catch(function () {
        state.loading = false;
        if (!silent) toast('تعذّر الاتصال بالخادم', 'error');
      });
    }

    function postItem(payload, okMsg) {
      payload.author = currentUser();
      api('POST', '/' + encodeURIComponent(state.entity) + '/' + encodeURIComponent(state.recordId), payload)
        .then(function (resp) {
          if (resp && resp.success) { toast(okMsg, 'success'); state.page = 1; refresh(); }
          else toast(resp && resp.error ? resp.error : 'فشل الإرسال', 'error');
        })
        .catch(function () { toast('تعذّر الاتصال بالخادم', 'error'); });
    }

    function toggleDone(item) {
      api('PATCH', '/item/' + encodeURIComponent(item.id) + '/done', { done: item.done ? 0 : 1 })
        .then(function (resp) {
          if (resp && resp.success) refresh();
          else toast(resp && resp.error ? resp.error : 'فشل تحديث النشاط', 'error');
        });
    }

    function toggleFollow() {
      var method = state.following ? 'DELETE' : 'POST';
      api(method, '/' + encodeURIComponent(state.entity) + '/' + encodeURIComponent(state.recordId) + '/follow',
        { user: currentUser() })
        .then(function (resp) {
          if (resp && resp.success) {
            toast(state.following ? 'ألغيت المتابعة' : 'أنت الآن تتابع هذا السجل', 'success');
            refresh();
          } else toast(resp && resp.error ? resp.error : 'فشل تحديث المتابعة', 'error');
        });
    }

    // ------------------------------ render ------------------------------
    function renderSkeleton() {
      el.innerHTML =
        '<div class="oxch-head">' +
        '  <div class="oxch-tabs"></div>' +
        '  <button type="button" class="oxch-bell" title="متابعة السجل"></button>' +
        '</div>' +
        '<div class="oxch-composer"></div>' +
        '<div class="oxch-list"><div class="oxch-empty">جاري التحميل…</div></div>' +
        '<div class="oxch-pager"></div>';
      el.querySelector('.oxch-bell').addEventListener('click', toggleFollow);
    }

    function renderAll() {
      renderTabs();
      renderBell();
      renderComposer();
      renderList();
      renderPager();
    }

    function renderTabs() {
      var host = el.querySelector('.oxch-tabs');
      host.innerHTML = TABS.map(function (t) {
        var count = t.key === 'activity' ? state.counts.open_activities : state.counts[t.key];
        return '<button type="button" class="oxch-tab' + (state.tab === t.key ? ' active' : '') +
          '" data-tab="' + t.key + '">' + t.label +
          (count ? ' <span class="oxch-count">' + count + '</span>' : '') + '</button>';
      }).join('');
      Array.prototype.forEach.call(host.querySelectorAll('.oxch-tab'), function (btn) {
        btn.addEventListener('click', function () {
          state.tab = btn.getAttribute('data-tab');
          state.page = 1;
          state.showActivityForm = false;
          refresh();
        });
      });
    }

    function renderBell() {
      var bell = el.querySelector('.oxch-bell');
      bell.innerHTML = (state.following ? '🔔' : '🔕') +
        ' <span class="oxch-bell-label">' + (state.following ? 'متابِع' : 'متابعة') + '</span>' +
        (state.followers.length ? ' <span class="oxch-count">' + state.followers.length + '</span>' : '');
      bell.classList.toggle('active', state.following);
      bell.title = state.followers.length ? 'المتابعون: ' + state.followers.join('، ') : 'متابعة السجل';
    }

    function renderComposer() {
      var host = el.querySelector('.oxch-composer');
      if (state.tab === 'log') { host.innerHTML = ''; return; }
      if (state.tab === 'message') { renderMessageComposer(host); return; }
      renderActivityComposer(host);
    }

    function renderMessageComposer(host) {
      host.innerHTML =
        '<div class="oxch-compose-row">' +
        '  <textarea class="oxch-input" rows="2" placeholder="اكتب رسالة…"></textarea>' +
        '  <button type="button" class="oxch-btn oxch-btn-primary">إرسال</button>' +
        '</div>';
      var input = host.querySelector('.oxch-input');
      var send = function () {
        var text = input.value.trim();
        if (!text) return;
        input.value = '';
        postItem({ kind: 'message', body: text }, 'أُرسلت الرسالة');
      };
      host.querySelector('.oxch-btn-primary').addEventListener('click', send);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
      });
    }

    function renderActivityComposer(host) {
      if (!state.showActivityForm) {
        host.innerHTML = '<button type="button" class="oxch-btn oxch-btn-ghost oxch-open-form">➕ جدولة نشاط</button>';
        host.querySelector('.oxch-open-form').addEventListener('click', function () {
          state.showActivityForm = true;
          renderComposer();
        });
        return;
      }
      var today = new Date().toISOString().slice(0, 10);
      host.innerHTML =
        '<div class="oxch-activity-form">' +
        '  <label class="oxch-field"><span>نوع النشاط</span><select class="oxch-input oxch-f-type">' +
        ACTIVITY_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') +
        '  </select></label>' +
        '  <label class="oxch-field"><span>تاريخ الاستحقاق</span><input type="date" class="oxch-input oxch-f-due" value="' + today + '"></label>' +
        '  <label class="oxch-field oxch-field-wide"><span>ملاحظة</span><textarea class="oxch-input oxch-f-note" rows="2" placeholder="تفاصيل النشاط…"></textarea></label>' +
        '  <div class="oxch-form-actions">' +
        '    <button type="button" class="oxch-btn oxch-btn-primary oxch-f-save">جدولة</button>' +
        '    <button type="button" class="oxch-btn oxch-btn-ghost oxch-f-cancel">إلغاء</button>' +
        '  </div>' +
        '</div>';
      host.querySelector('.oxch-f-cancel').addEventListener('click', function () {
        state.showActivityForm = false;
        renderComposer();
      });
      host.querySelector('.oxch-f-save').addEventListener('click', function () {
        var payload = {
          kind: 'activity',
          activity_type: host.querySelector('.oxch-f-type').value,
          due_date: host.querySelector('.oxch-f-due').value,
          body: host.querySelector('.oxch-f-note').value.trim(),
        };
        if (!payload.due_date) { toast('حدد تاريخ الاستحقاق', 'error'); return; }
        state.showActivityForm = false;
        postItem(payload, 'تمت جدولة النشاط');
      });
    }

    function renderList() {
      var host = el.querySelector('.oxch-list');
      if (!state.items.length) {
        var emptyLabel = { message: 'لا توجد رسائل بعد', log: 'لا توجد قيود في السجل', activity: 'لا توجد أنشطة مجدولة' }[state.tab];
        host.innerHTML = '<div class="oxch-empty">' + emptyLabel + '</div>';
        return;
      }
      host.innerHTML = state.items.map(renderItem).join('');
      Array.prototype.forEach.call(host.querySelectorAll('.oxch-done-btn'), function (btn) {
        btn.addEventListener('click', function () {
          var item = state.items.find(function (i) { return i.id === btn.getAttribute('data-id'); });
          if (item) toggleDone(item);
        });
      });
    }

    function renderItem(item) {
      var isActivity = item.kind === 'activity';
      var doneCls = isActivity && item.done ? ' oxch-item-done' : '';
      var head =
        '<div class="oxch-item-head">' +
        '  <span class="oxch-avatar">' + escapeHtml((item.author || '؟').charAt(0)) + '</span>' +
        '  <span class="oxch-author">' + escapeHtml(item.author) + '</span>' +
        (isActivity && item.activity_type ? '<span class="oxch-badge oxch-badge-type">' + escapeHtml(item.activity_type) + '</span>' : '') +
        (item.kind === 'log' ? '<span class="oxch-badge oxch-badge-log">سجل تلقائي</span>' : '') +
        dueBadge(item) +
        '  <span class="oxch-time" title="' + escapeHtml(item.created_at) + '">' + timeAgo(item.created_at) + '</span>' +
        '</div>';
      var doneBtn = isActivity
        ? '<button type="button" class="oxch-done-btn' + (item.done ? ' checked' : '') + '" data-id="' + escapeHtml(item.id) + '" title="' +
          (item.done ? 'إعادة فتح النشاط' : 'وضع علامة تم') + '">' + (item.done ? '✓ تم' : '✓') + '</button>'
        : '';
      return '<div class="oxch-item oxch-item-' + item.kind + doneCls + '">' + head +
        '<div class="oxch-body-row">' +
        '  <div class="oxch-body">' + escapeHtml(item.body || item.activity_type) + '</div>' + doneBtn +
        '</div></div>';
    }

    function renderPager() {
      var host = el.querySelector('.oxch-pager');
      var pages = Math.max(1, Math.ceil(state.total / PAGE_LIMIT));
      if (pages <= 1) { host.innerHTML = ''; return; }
      host.innerHTML =
        '<button type="button" class="oxch-btn oxch-btn-ghost oxch-prev"' + (state.page <= 1 ? ' disabled' : '') + '>السابق</button>' +
        '<span class="oxch-page-info">صفحة ' + state.page + ' من ' + pages + '</span>' +
        '<button type="button" class="oxch-btn oxch-btn-ghost oxch-next"' + (state.page >= pages ? ' disabled' : '') + '>التالي</button>';
      host.querySelector('.oxch-prev').addEventListener('click', function () {
        if (state.page > 1) { state.page -= 1; refresh(); }
      });
      host.querySelector('.oxch-next').addEventListener('click', function () {
        if (state.page < pages) { state.page += 1; refresh(); }
      });
    }

    // Public handle for the host page (detach stops polling immediately).
    return {
      refresh: refresh,
      destroy: function () {
        if (state.timer) { clearInterval(state.timer); state.timer = null; }
        el.innerHTML = '';
        el.classList.remove('oxch');
      },
    };
  }

  window.OX.chatter = { mount: mount, timeAgo: timeAgo };
})();
