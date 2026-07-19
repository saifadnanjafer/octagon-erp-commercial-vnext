/*
 * Phase 7M - E-Commerce and External Connectors Foundation.
 * Add-only. Injects a connectors workspace into the existing Integration Hub
 * page (integrationHubBody), alongside the Phase 7L marketplace registry.
 *
 * SAFETY: every connector action is STAGED, LOGGED, and ROLLBACK-AWARE. No real
 * external API call, product/order import, or payment capture happens here.
 * Real enablement requires server-side credentials + explicit approval. No
 * secret/token is shown or stored client-side; database.json is not mutated
 * directly (defaults seeded only-if-missing into the live omni state).
 */
(function () {
  'use strict';

  // `omni` is a lexical global in this app (NOT window.omni). Try the bare global
  // first; window.omni is a dead fallback only. (cf. modules/route-health.js)
  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function save() { try { if (typeof window.saveData === 'function') window.saveData(); } catch (_) {} }
  function toast(m, k) { try { if (typeof window.showToast === 'function') window.showToast(m, k || 'info'); } catch (_) {} }
  function uid(p) { return (p || 'ec') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function nowIso() { return new Date().toISOString(); }
  function ago(iso) {
    if (!iso) return '—';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (isNaN(m)) return '—';
    if (m < 1) return 'الآن'; if (m < 60) return 'قبل ' + m + ' د'; const h = Math.round(m / 60);
    if (h < 24) return 'قبل ' + h + ' س'; return new Date(iso).toLocaleDateString('ar');
  }

  function ensureRoot() {
    const o = O();
    if (!o.ecommerceConnectors || typeof o.ecommerceConnectors !== 'object' || Array.isArray(o.ecommerceConnectors)) o.ecommerceConnectors = {};
    const r = o.ecommerceConnectors;
    if (!Array.isArray(r.connectors) || !r.connectors.length) r.connectors = [
      { id: 'woocommerce', name: 'WooCommerce', kind: 'ecommerce', status: 'not_connected', mode: 'staged', lastSync: null, scope: ['products', 'orders', 'customers'] },
      { id: 'shopify', name: 'Shopify', kind: 'ecommerce', status: 'not_connected', mode: 'staged', lastSync: null, scope: ['products', 'orders', 'customers'] },
      { id: 'salla', name: 'Salla / سلة', kind: 'ecommerce', status: 'not_connected', mode: 'staged', lastSync: null, scope: ['products', 'orders'] },
      { id: 'zid', name: 'Zid / زد', kind: 'ecommerce', status: 'not_connected', mode: 'staged', lastSync: null, scope: ['products', 'orders'] }
    ];
    if (!Array.isArray(r.paymentGateways) || !r.paymentGateways.length) r.paymentGateways = [
      { id: 'myfatoorah', name: 'MyFatoorah', status: 'not_configured' },
      { id: 'paytabs', name: 'PayTabs', status: 'not_configured' },
      { id: 'stripe', name: 'Stripe', status: 'not_configured' },
      { id: 'zaincash', name: 'ZainCash', status: 'not_configured' }
    ];
    if (!r.whatsapp || typeof r.whatsapp !== 'object') r.whatsapp = { expansion: 'staged', features: ['إشعارات الطلبات', 'مزامنة الكتالوج', 'تحديثات حالة الشحن'] };
    if (!Array.isArray(r.syncJobs)) r.syncJobs = [];
    if (!Array.isArray(r.webhookLogs)) r.webhookLogs = [];
    if (!Array.isArray(r.activityLog)) r.activityLog = [];
    r.policyVersion = r.policyVersion || 'phase7m-ecommerce-connectors-v1';
    r.mode = 'staged';
    r.updated_at = r.updated_at || nowIso();
    return r;
  }

  function logActivity(action, detail) {
    const r = ensureRoot();
    r.activityLog.unshift({ id: uid('eclog'), at: nowIso(), action, detail: detail || '' });
    r.activityLog = r.activityLog.slice(0, 50);
  }

  // ── safe staged actions (no real external effect) ──
  window.ecStageConnection = function (id) {
    const r = ensureRoot();
    const c = r.connectors.find(x => x.id === id); if (!c) return;
    c.status = 'staged';
    logActivity('stage_connection', c.name + ' — اختبار اتصال مرحلي (بدون نداء خارجي)');
    save(); renderHub();
    toast(c.name + ': تم تجهيز الاتصال (مرحلي فقط، بدون نداء خارجي).', 'info');
  };
  window.ecStageSync = function (id) {
    const r = ensureRoot();
    const c = r.connectors.find(x => x.id === id); if (!c) return;
    const job = { id: uid('ecjob'), connector: c.id, connectorName: c.name, direction: 'pull', entities: c.scope.slice(), status: 'staged', createdAt: nowIso() };
    r.syncJobs.unshift(job);
    logActivity('stage_sync', c.name + ' — مهمة مزامنة مرحلية (' + c.scope.join('، ') + ')');
    save(); renderHub();
    toast(c.name + ': مهمة مزامنة مرحلية بانتظار اعتماد الخادم. لا بيانات حقيقية انتقلت.', 'info');
  };
  window.ecRollbackJob = function (jobId) {
    const r = ensureRoot();
    const j = r.syncJobs.find(x => x.id === jobId); if (!j) return;
    j.status = 'rolled_back'; j.rolledBackAt = nowIso();
    logActivity('rollback_sync', j.connectorName + ' — تراجع عن مهمة مزامنة مرحلية');
    save(); renderHub();
    toast('تم التراجع عن المهمة المرحلية.', 'success');
  };

  function statusPill(status) {
    const map = {
      not_connected: ['غير متصل', 'ec-warn'], staged: ['مرحلي', 'ec-info'], connected: ['متصل', 'ec-ok'], error: ['خطأ', 'ec-bad'],
      not_configured: ['غير مهيأ', 'ec-warn'], configured: ['مهيأ', 'ec-ok'],
      'staged_job': ['مرحلي', 'ec-info'], applied: ['مطبّق', 'ec-ok'], rolled_back: ['متراجَع', 'ec-muted']
    };
    const v = map[status] || [status, 'ec-muted'];
    return '<span class="ec-pill ' + v[1] + '">' + esc(v[0]) + '</span>';
  }

  function renderConnectorCard(c) {
    return '<div class="ec-card"><div class="ec-card-head"><strong>' + esc(c.name) + '</strong>' + statusPill(c.status) + '</div>'
      + '<div class="ec-card-meta">نطاق: ' + esc(c.scope.join('، ')) + '</div>'
      + '<div class="ec-card-meta">آخر مزامنة: ' + esc(ago(c.lastSync)) + ' · الوضع: مرحلي</div>'
      + '<div class="ec-card-actions"><button class="btn-secondary btn-sm" onclick="ecStageConnection(\'' + c.id + '\')">تجهيز اتصال</button>'
      + '<button class="btn-secondary btn-sm" onclick="ecStageSync(\'' + c.id + '\')">مزامنة مرحلية</button></div></div>';
  }

  function renderHub() {
    const r = ensureRoot();
    const host = document.getElementById('integrationHubBody');
    if (!host) return;
    const previous = document.getElementById('ecommerceConnectorsWorkspace');
    if (previous) previous.remove();
    const stagedJobs = r.syncJobs.filter(j => j.status === 'staged').length;
    const section = document.createElement('section');
    section.id = 'ecommerceConnectorsWorkspace';
    section.className = 'ec-shell';
    section.innerHTML =
      '<div class="ec-hero"><div><div class="ec-kicker">Phase 7M — E-Commerce & External Connectors</div>'
      + '<h3>موصلات المتاجر والمدفوعات (أساس مرحلي)</h3>'
      + '<p>كل إجراء هنا <b>مرحلي ومسجّل وقابل للتراجع</b>. لا يحدث أي نداء خارجي حقيقي أو استيراد طلبات أو تحصيل دفع. التفعيل الحقيقي يحتاج بيانات اعتماد Server-side وموافقة. لا يُعرض أو يُخزَّن أي توكن في المتصفح.</p>'
      + '<div class="ec-stats">'
      + '<div class="ec-stat"><strong>' + r.connectors.length + '</strong><span>موصلات متاجر</span></div>'
      + '<div class="ec-stat"><strong>' + r.paymentGateways.length + '</strong><span>بوابات دفع</span></div>'
      + '<div class="ec-stat"><strong>' + stagedJobs + '</strong><span>مهام مرحلية</span></div>'
      + '<div class="ec-stat"><strong>' + r.activityLog.length + '</strong><span>أحداث مسجّلة</span></div>'
      + '</div></div></div>'
      + '<div class="ec-panels">'
      + '<div class="ec-panel"><h3>موصلات المتاجر الإلكترونية</h3><div class="ec-cards">' + r.connectors.map(renderConnectorCard).join('') + '</div></div>'
      + '<div class="ec-panel"><h3>حالة بوابات الدفع</h3><table class="ec-table"><thead><tr><th>البوابة</th><th>الحالة</th></tr></thead><tbody>'
      + r.paymentGateways.map(g => '<tr><td>' + esc(g.name) + '</td><td>' + statusPill(g.status) + '</td></tr>').join('') + '</tbody></table>'
      + '<p class="ec-note">حالة فقط — لا تحصيل ولا تحويل أموال من هذه اللوحة.</p></div>'
      + '<div class="ec-panel"><h3>توسعة WhatsApp</h3><p class="ec-note">' + statusPill(r.whatsapp.expansion) + ' الميزات المخطّطة:</p><ul class="ec-list">'
      + r.whatsapp.features.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul><p class="ec-note">لا يغيّر منطق WhatsApp الحالي؛ الإرسال يبقى عبر مسار الموافقة.</p></div>'
      + '<div class="ec-panel"><h3>مهام المزامنة المرحلية</h3><table class="ec-table"><thead><tr><th>الموصل</th><th>اتجاه</th><th>كيانات</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>'
      + (r.syncJobs.length ? r.syncJobs.slice(0, 12).map(j => '<tr><td>' + esc(j.connectorName) + '</td><td>سحب</td><td>' + esc(j.entities.join('، ')) + '</td><td>' + statusPill(j.status) + '</td><td>'
        + (j.status === 'staged' ? '<button class="btn-secondary btn-sm" onclick="ecRollbackJob(\'' + j.id + '\')">تراجع</button>' : '—') + '</td></tr>').join('')
        : '<tr><td colspan="5" class="ec-empty">لا مهام مرحلية بعد</td></tr>') + '</tbody></table></div>'
      + '</div>';
    host.appendChild(section);
  }

  // Debounced single render — avoid stacking rebuilds of the shared integrationHubBody
  // (the marketplace module also re-renders this container).
  let _renderTimer = null;
  function scheduleRender() { clearTimeout(_renderTimer); _renderTimer = setTimeout(renderHub, 350); }

  function installHooks() {
    const original = window.switchPage;
    if (typeof original === 'function' && !original.__ecommerceConnectorsWrapped) {
      const wrapped = function (page) {
        const result = original.apply(this, arguments);
        if (page === 'integration_hub') scheduleRender();
        return result;
      };
      wrapped.__ecommerceConnectorsWrapped = true;
      window.switchPage = wrapped;
    }
  }

  function init() { ensureRoot(); installHooks(); scheduleRender(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.EcommerceConnectors = { ensureRoot, renderHub, version: 'phase7m-v1' };
})();
