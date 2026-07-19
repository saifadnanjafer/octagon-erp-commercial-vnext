// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.4 record-history acceptance (proprietary self, not copied)
// ============================================================================
// Octagon Commercial VNext — record history panel (T1.4.2, client).
// OX.historyPanel.mount(el, entity, id) → RTL Arabic field-level diff
// timeline (who/when/what changed), reading the already-live backend
// `GET /api/x/audit/:entity/:id` (crud-engine.js). No new server route.
//
// Visual/structural pattern intentionally mirrors chatter.js (prefix,
// skeleton→render split, theme CSS vars, Arabic relative timestamps) so the
// two widgets feel like one family when placed side by side in a record
// drawer. See INTEGRATION.md for the exact <script> tag + drawer wiring the
// integrator needs to add (this file never edits ui-crud.js/demo.html
// itself).
//
// Isomorphic on purpose: the pure formatting helpers (no DOM/fetch) are also
// exported via `module.exports` when running under Node, so
// scripts/test-lane-c-completion.mjs can unit-test them without a browser.
// ============================================================================

(function (root) {
  'use strict';

  var API_BASE = '/api/x/audit';

  // Technical/internal bookkeeping fields never shown in the diff view.
  // __frozen_values__ is this lane's own snapshot-immutability marker
  // (fields/snapshot-fields.js) — an implementation detail, not a business field.
  var HIDDEN_FIELDS = { id: 1, created_at: 1, updated_at: 1, created_by: 1, removed: 1, company_id: 1, __frozen_values__: 1 };

  // -------------------------------------------------------------------------
  // Pure helpers (no DOM) — unit-testable from Node via module.exports below.
  // -------------------------------------------------------------------------
  function arCount(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return n + ' ' + few;
    return n + ' ' + many;
  }

  function timeAgo(iso, nowMs) {
    var then = new Date(iso).getTime();
    if (!then) return '';
    var now = nowMs == null ? Date.now() : nowMs;
    var s = Math.max(0, Math.floor((now - then) / 1000));
    if (s < 45) return 'الآن';
    var m = Math.floor(s / 60);
    if (m < 60) return 'قبل ' + arCount(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    var h = Math.floor(m / 60);
    if (h < 24) return 'قبل ' + arCount(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    var d = Math.floor(h / 24);
    if (d < 30) return 'قبل ' + arCount(d, 'يوم', 'يومين', 'أيام', 'يوم');
    return new Date(iso).toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /**
   * Human Arabic label for one audit entry's action.
   * @param {{action:string, after?:object}} entry
   */
  function actionLabel(entry) {
    var action = String((entry && entry.action) || '');
    if (action === 'create') return 'إنشاء السجل';
    if (action === 'update') return 'تحديث السجل';
    if (action === 'delete') return 'حذف السجل';
    if (action.indexOf('state_transition_') === 0) {
      var toState = entry && entry.after && entry.after.state;
      return 'انتقال الحالة' + (toState ? ' → ' + toState : '');
    }
    if (action === 'snapshot_materialize') return 'تجميد حقل لقطة (snapshot)';
    if (action === 'snapshot_write_blocked') return 'رُفض تعديل حقل مجمّد (snapshot)';
    if (action === 'create_view') return 'إنشاء طريقة عرض';
    if (action === 'update_view') return 'تعديل طريقة عرض';
    if (action === 'delete_view') return 'حذف طريقة عرض';
    if (action === 'create_custom_field') return 'إضافة حقل مخصص';
    if (action === 'update_custom_field') return 'تعديل حقل مخصص';
    if (action === 'delete_custom_field') return 'حذف حقل مخصص';
    return action || 'حدث غير معروف';
  }

  function fieldLabel(field, labels) {
    if (labels && typeof labels === 'object' && labels[field]) return labels[field];
    return field;
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') { try { return JSON.stringify(value); } catch (_) { return String(value); } }
    return String(value);
  }

  /** Filter a raw `changes` diff object down to business-visible fields. */
  function visibleChanges(changes) {
    var out = {};
    if (!changes || typeof changes !== 'object') return out;
    Object.keys(changes).forEach(function (key) {
      if (HIDDEN_FIELDS[key] || key.indexOf('__') === 0) return;
      out[key] = changes[key];
    });
    return out;
  }

  /** Group already-desc-sorted history entries by calendar day (Arabic label). */
  function groupByDate(entries) {
    var groups = [];
    var byKey = {};
    (entries || []).forEach(function (entry) {
      var d = new Date(entry.at);
      var key = isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10);
      if (!byKey[key]) {
        var label = key === 'unknown' ? 'تاريخ غير معروف' : d.toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
        byKey[key] = { key: key, label: label, items: [] };
        groups.push(byKey[key]);
      }
      byKey[key].items.push(entry);
    });
    return groups;
  }

  // -------------------------------------------------------------------------
  // DOM widget (browser only).
  // -------------------------------------------------------------------------
  function mountBrowser(el, entity, recordId, opts) {
    if (!el || !entity || recordId == null) {
      console.warn('[oxhp] mount requires (el, entity, id)');
      return null;
    }
    opts = opts || {};
    var fieldLabels = opts.fieldLabels || null;

    function escapeHtml(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var state = { loading: false, entries: [], error: null };

    el.classList.add('oxhp');
    el.setAttribute('dir', 'rtl');
    renderSkeleton();
    refresh();

    function refresh() {
      if (state.loading) return;
      state.loading = true;
      state.error = null;
      renderAll();
      fetch(API_BASE + '/' + encodeURIComponent(entity) + '/' + encodeURIComponent(recordId), { credentials: 'same-origin' })
        .then(function (res) { return res.json(); })
        .then(function (resp) {
          state.loading = false;
          if (!resp || !resp.success) { state.error = (resp && resp.error) || 'تعذّر تحميل السجل التاريخي'; renderAll(); return; }
          state.entries = resp.data || [];
          renderAll();
        })
        .catch(function () {
          state.loading = false;
          state.error = 'تعذّر الاتصال بالخادم';
          renderAll();
        });
    }

    function renderSkeleton() {
      el.innerHTML =
        '<div class="oxhp-head">' +
        '  <h4 class="oxhp-title">السجل التاريخي</h4>' +
        '  <button type="button" class="oxhp-refresh" title="تحديث">⟳</button>' +
        '</div>' +
        '<div class="oxhp-body"><div class="oxhp-empty">جاري التحميل…</div></div>';
      el.querySelector('.oxhp-refresh').addEventListener('click', refresh);
    }

    function renderAll() {
      var host = el.querySelector('.oxhp-body');
      if (state.error) { host.innerHTML = '<div class="oxhp-error">' + escapeHtml(state.error) + '</div>'; return; }
      if (state.loading && !state.entries.length) { host.innerHTML = '<div class="oxhp-empty">جاري التحميل…</div>'; return; }
      if (!state.entries.length) { host.innerHTML = '<div class="oxhp-empty">لا يوجد سجل تغييرات لهذا العنصر بعد</div>'; return; }

      var groups = groupByDate(state.entries);
      host.innerHTML = groups.map(renderGroup).join('');
    }

    function renderGroup(group) {
      return '<div class="oxhp-day">' +
        '  <div class="oxhp-day-label">' + escapeHtml(group.label) + '</div>' +
        '  <div class="oxhp-day-items">' + group.items.map(renderEntry).join('') + '</div>' +
        '</div>';
    }

    function renderEntry(entry) {
      var changes = visibleChanges(entry.changes);
      var keys = Object.keys(changes);
      var rows = keys.map(function (key) {
        return '<li class="oxhp-diff-row">' +
          '<span class="oxhp-diff-field">' + escapeHtml(fieldLabel(key, fieldLabels)) + '</span>' +
          '<span class="oxhp-diff-from">' + escapeHtml(formatValue(changes[key].from)) + '</span>' +
          '<span class="oxhp-diff-arrow">←</span>' +
          '<span class="oxhp-diff-to">' + escapeHtml(formatValue(changes[key].to)) + '</span>' +
          '</li>';
      }).join('');

      return '<div class="oxhp-item oxhp-item-' + escapeHtml((entry.action || '').replace(/[^a-z0-9_]/gi, '_')) + '">' +
        '  <div class="oxhp-item-head">' +
        '    <span class="oxhp-avatar">' + escapeHtml((entry.user || '؟').charAt(0)) + '</span>' +
        '    <span class="oxhp-user">' + escapeHtml(entry.user || 'مجهول') + '</span>' +
        '    <span class="oxhp-action">' + escapeHtml(actionLabel(entry)) + '</span>' +
        '    <span class="oxhp-time" title="' + escapeHtml(entry.at) + '">' + timeAgo(entry.at) + '</span>' +
        '  </div>' +
        (rows ? '<ul class="oxhp-diff-list">' + rows + '</ul>' : '<div class="oxhp-no-diff">لا تغييرات في الحقول</div>') +
        '</div>';
    }

    return {
      refresh: refresh,
      destroy: function () { el.innerHTML = ''; el.classList.remove('oxhp'); },
    };
  }

  var HistoryPanel = {
    mount: mountBrowser,
    _internal: { timeAgo: timeAgo, actionLabel: actionLabel, fieldLabel: fieldLabel, formatValue: formatValue, visibleChanges: visibleChanges, groupByDate: groupByDate },
  };

  if (typeof window !== 'undefined' && root === window) {
    root.OX = root.OX || {};
    if (!root.OX.historyPanel) root.OX.historyPanel = HistoryPanel;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryPanel;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
