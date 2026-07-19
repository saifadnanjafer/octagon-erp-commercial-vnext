/*
 * OCTAGON OMNISYSTEM - modules/scheduled-alerts.js
 *
 * Additive command-center feed for server-owned scheduled_alerts.
 * Loaded after app.js and wraps renderCommandCenter like work-orders.js.
 */
(function () {
  'use strict';

  const state = {
    loadedAt: 0,
    loading: false,
    alerts: [],
  };

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openAlerts() {
    return state.alerts
      .filter(item => item && !['dismissed', 'resolved', 'closed'].includes(String(item.status || '').toLowerCase()))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 8);
  }

  function severityIcon(severity) {
    if (severity === 'danger') return 'fa-triangle-exclamation';
    if (severity === 'warning') return 'fa-clock';
    if (severity === 'success') return 'fa-circle-check';
    return 'fa-bell';
  }

  function injectStyle() {
    if (document.getElementById('scheduledAlertsStyle')) return;
    const style = document.createElement('style');
    style.id = 'scheduledAlertsStyle';
    style.textContent = `
      #scheduledAlertsPanel{margin:14px 0;border:1px solid rgba(56,189,248,.24);background:rgba(15,23,42,.62);border-radius:8px;padding:12px;direction:rtl;text-align:right}
      #scheduledAlertsPanel .sa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      #scheduledAlertsPanel .sa-title{display:flex;align-items:center;gap:8px;font-weight:800;color:#e0f2fe}
      #scheduledAlertsPanel .sa-count{min-width:28px;text-align:center;border-radius:999px;background:rgba(56,189,248,.16);color:#7dd3fc;padding:2px 8px;font-size:12px}
      #scheduledAlertsPanel .sa-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}
      #scheduledAlertsPanel .sa-item{border:1px solid rgba(148,163,184,.2);background:rgba(2,6,23,.28);border-radius:8px;padding:10px;display:grid;gap:7px}
      #scheduledAlertsPanel .sa-row{display:flex;align-items:flex-start;gap:8px}
      #scheduledAlertsPanel .sa-row i{margin-top:2px}
      #scheduledAlertsPanel .sa-title-line{font-weight:800;color:#f8fafc;line-height:1.4}
      #scheduledAlertsPanel .sa-message{font-size:12px;color:#cbd5e1;line-height:1.5}
      #scheduledAlertsPanel .sa-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#94a3b8;font-size:11px}
      #scheduledAlertsPanel .sa-dismiss{border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.72);color:#e2e8f0;border-radius:7px;padding:5px 9px;cursor:pointer}
      #scheduledAlertsPanel .sa-dismiss:hover{border-color:rgba(56,189,248,.5);color:#7dd3fc}
      #scheduledAlertsPanel .sa-danger{border-color:rgba(248,113,113,.38)}
      #scheduledAlertsPanel .sa-danger i{color:#f87171}
      #scheduledAlertsPanel .sa-warning{border-color:rgba(251,191,36,.34)}
      #scheduledAlertsPanel .sa-warning i{color:#fbbf24}
      #scheduledAlertsPanel .sa-info i{color:#7dd3fc}
      #scheduledAlertsPanel .sa-empty{color:#94a3b8;font-size:12px;padding:4px 0}
    `;
    document.head.appendChild(style);
  }

  async function refreshAlerts(force) {
    const now = Date.now();
    if (state.loading) return state.alerts;
    if (!force && state.loadedAt && now - state.loadedAt < 30000) return state.alerts;
    state.loading = true;
    try {
      const res = await fetch('/api/db', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      state.alerts = Array.isArray(db.scheduled_alerts) ? db.scheduled_alerts : [];
      state.loadedAt = now;
    } catch (error) {
      console.warn('Scheduled alerts refresh failed:', error.message || error);
    } finally {
      state.loading = false;
    }
    return state.alerts;
  }

  function html() {
    injectStyle();
    const items = openAlerts();
    return `<section id="scheduledAlertsPanel">
      <div class="sa-head">
        <div class="sa-title"><i class="fa-solid fa-calendar-check"></i><span>تنبيهات مجدولة</span></div>
        <span class="sa-count">${items.length}</span>
      </div>
      ${items.length ? `<div class="sa-list">${items.map(item => `<article class="sa-item sa-${esc(item.severity || 'info')}">
        <div class="sa-row">
          <i class="fa-solid ${severityIcon(item.severity)}"></i>
          <div>
            <div class="sa-title-line">${esc(item.title || 'تنبيه مجدول')}</div>
            <div class="sa-message">${esc(item.message || '')}</div>
          </div>
        </div>
        <div class="sa-meta">
          <span>${esc((item.createdAt || '').slice(0, 16).replace('T', ' '))}</span>
          <button class="sa-dismiss" onclick="OctagonScheduledAlerts.dismiss('${esc(item.id || '')}')">إخفاء</button>
        </div>
      </article>`).join('')}</div>` : '<div class="sa-empty">لا توجد تنبيهات مجدولة مفتوحة حالياً.</div>'}
    </section>`;
  }

  function injectCommandCenterSafe() {
    try {
      const body = document.getElementById('commandCenterBody');
      if (!body) return;
      const old = document.getElementById('scheduledAlertsPanel');
      if (old) old.remove();
      body.insertAdjacentHTML('afterbegin', html());
    } catch (error) {
      console.warn('Scheduled alerts command-center inject failed:', error.message || error);
    }
  }

  function wireCommandCenter() {
    if (window.__scheduledAlertsWrapped) return;
    if (typeof window.renderCommandCenter !== 'function') return;
    const original = window.renderCommandCenter;
    window.renderCommandCenter = function () {
      const result = original.apply(this, arguments);
      refreshAlerts(false).then(injectCommandCenterSafe);
      return result;
    };
    window.__scheduledAlertsWrapped = true;
  }

  async function dismiss(id) {
    if (!id) return;
    try {
      const res = await fetch('/api/cron/alerts/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.alerts = state.alerts.map(item => item.id === id ? { ...item, status: 'dismissed' } : item);
      injectCommandCenterSafe();
    } catch (error) {
      console.warn('Scheduled alert dismiss failed:', error.message || error);
      if (typeof showToast === 'function') showToast('تعذر إخفاء التنبيه المجدول', 'warning');
    }
  }

  function init() {
    wireCommandCenter();
    refreshAlerts(true).then(() => {
      wireCommandCenter();
      if (typeof currentPage !== 'undefined' && currentPage === 'command_center') injectCommandCenterSafe();
    });
  }

  window.OctagonScheduledAlerts = {
    refresh: refreshAlerts,
    render: html,
    inject: injectCommandCenterSafe,
    dismiss,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
