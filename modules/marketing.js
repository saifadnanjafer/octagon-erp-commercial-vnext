/**
 * OCTAGON ERP — Marketing / Campaigns (التسويق والحملات).
 *
 * A standard ERP/CRM module Octagon had ZERO of (`marketing campaign`/`campaign_` = 0). Plan and
 * track marketing campaigns across channels with budget, spend, reach, leads, conversions, revenue —
 * and the metrics that matter: ROI, cost-per-lead (CPL), conversion rate. Pairs with the CRM (`sales`)
 * for the leads it generates. Add-only; self-contained in `omni.marketing`.
 *
 * Data namespace: omni.marketing = { campaigns:[] }
 * Page: #pageMarketing (nav data-page="marketing"). Add-only.
 */
(function () {
  'use strict';

  function O() { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} } return null; }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function money(n) { n = Number(n); return isFinite(n) ? Math.round(n) : 0; }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function coId() { try { return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''; } catch (_) { return ''; } }
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('marketing', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'marketing', action, detail, user: userName() }); } catch (_) {}
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  const CHANNELS = [['whatsapp', '📱 واتساب'], ['instagram', '📸 إنستغرام'], ['facebook', '👍 فيسبوك'], ['sms', '✉️ رسائل SMS'], ['email', '📧 بريد'], ['print', '🖨️ مطبوعات'], ['referral', '🤝 إحالة'], ['other', '🌐 أخرى']];
  const CHANNEL_LABEL = Object.fromEntries(CHANNELS);
  const STATUS_LABEL = { planned: 'مخطط', active: 'نشطة', paused: 'متوقفة', completed: 'منتهية' };
  const STATUS_CLASS = { planned: 'mk-st-planned', active: 'mk-st-active', paused: 'mk-st-paused', completed: 'mk-st-done' };

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.marketing || typeof o.marketing !== 'object') o.marketing = {};
    if (!Array.isArray(o.marketing.campaigns)) o.marketing.campaigns = [];
    return o.marketing;
  }
  function M() { return ensureData(); }
  function getCampaigns(all) { let l = (M()?.campaigns || []).filter(c => all || c.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }

  function metrics(c) {
    const spent = money(c.spent), leads = money(c.leads), conv = money(c.conversions), rev = money(c.revenue);
    return {
      spent, leads, conv, rev, budget: money(c.budget),
      cpl: leads > 0 ? Math.round(spent / leads) : 0,
      convRate: leads > 0 ? Math.round(conv / leads * 100) : 0,
      roi: spent > 0 ? Math.round((rev - spent) / spent * 100) : 0,
      budgetUsed: money(c.budget) > 0 ? Math.round(spent / money(c.budget) * 100) : 0
    };
  }
  function portfolio() {
    const cs = getCampaigns();
    const active = cs.filter(c => c.status === 'active');
    const totSpent = cs.reduce((s, c) => s + money(c.spent), 0);
    const totLeads = cs.reduce((s, c) => s + money(c.leads), 0);
    const totConv = cs.reduce((s, c) => s + money(c.conversions), 0);
    const totRev = cs.reduce((s, c) => s + money(c.revenue), 0);
    const ranked = cs.map(c => ({ c, m: metrics(c) })).filter(x => x.m.spent > 0).sort((a, b) => b.m.roi - a.m.roi);
    return {
      total: cs.length, active: active.length,
      totSpent, totLeads, totConv, totRev,
      blendedRoi: totSpent > 0 ? Math.round((totRev - totSpent) / totSpent * 100) : 0,
      blendedCpl: totLeads > 0 ? Math.round(totSpent / totLeads) : 0,
      convRate: totLeads > 0 ? Math.round(totConv / totLeads * 100) : 0,
      best: ranked[0] || null, ranked
    };
  }

  let activeTab = 'dashboard', editing = null, search = '';
  window.mkOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.mkSearch = function (v) { search = v; renderList(); };
  window.mkOpenForm = function (id) { editing = id || 'new'; activeTab = 'campaigns'; render(); };
  window.mkCancelForm = function () { editing = null; render(); };

  window.mkSaveCampaign = function () {
    const m = M(); if (!m) return;
    const name = val('mkName');
    if (!name) { toast('اسم الحملة مطلوب', 'error'); return; }
    const base = {
      name, channel: val('mkChannel') || 'whatsapp', status: val('mkStatus') || 'planned',
      startDate: val('mkStart'), endDate: val('mkEnd'), budget: numVal('mkBudget'), spent: numVal('mkSpent'),
      audience: val('mkAudience'), reach: numVal('mkReach'), leads: numVal('mkLeads'),
      conversions: numVal('mkConversions'), revenue: numVal('mkRevenue'), notes: val('mkNotes')
    };
    const ex = editing && editing !== 'new' ? m.campaigns.find(c => c.id === editing) : null;
    if (ex) { Object.assign(ex, base); audit('campaign_update', `تعديل حملة: ${name}`); toast('تم التحديث', 'success'); }
    else { m.campaigns.unshift({ id: uid('camp'), ...base, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: userName() }); audit('campaign_create', `حملة جديدة: ${name}`); toast('تمت إضافة الحملة', 'success'); }
    save(); editing = null; render();
  };
  window.mkSetStatus = function (id, status) { const c = (M()?.campaigns || []).find(x => x.id === id); if (!c) return; c.status = status; audit('campaign_status', `${c.name} → ${STATUS_LABEL[status]}`); save(); render(); };
  window.mkArchive = function (id) { const c = (M()?.campaigns || []).find(x => x.id === id); if (!c) return; if (!confirm(`أرشفة الحملة "${c.name}"؟`)) return; c.is_active = false; audit('campaign_archive', `أرشفة ${c.name}`); save(); render(); };

  window.mkLoadDemo = function () {
    const m = M(); if (!m) return;
    if (m.campaigns.length) { toast('توجد حملات مسبقاً', 'info'); return; }
    const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    m.campaigns.unshift(
      { id: uid('camp'), name: 'عرض رمضان', channel: 'instagram', status: 'active', startDate: back(15), endDate: back(-15), budget: 500000, spent: 280000, audience: 'بغداد 18-45', reach: 42000, leads: 130, conversions: 38, revenue: 1900000, notes: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('camp'), name: 'حملة واتساب للزبائن', channel: 'whatsapp', status: 'active', startDate: back(8), endDate: back(-2), budget: 150000, spent: 60000, audience: 'قائمة الزبائن', reach: 1200, leads: 95, conversions: 41, revenue: 1200000, notes: 'أعلى تحويل', is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('camp'), name: 'بوسترات معارض', channel: 'print', status: 'completed', startDate: back(60), endDate: back(40), budget: 300000, spent: 300000, audience: 'زوار المعرض', reach: 5000, leads: 22, conversions: 4, revenue: 180000, notes: 'ضعيف', is_active: true, companyId: coId(), createdAt: new Date().toISOString() }
    );
    audit('marketing_demo', 'تحميل حملات تجريبية');
    save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  function kpi(label, value, sub, cls) { return `<div class="mk-kpi ${cls || ''}"><div class="mk-kpi-val">${value}</div><div class="mk-kpi-label">${label}</div>${sub ? `<div class="mk-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('mkDashBody'); if (!el) return;
    const p = portfolio();
    const roiCls = v => v > 0 ? 'mk-pos' : v < 0 ? 'mk-neg' : '';
    el.innerHTML = `
      <div class="mk-kpi-grid">
        ${kpi('حملات نشطة', p.active, `${p.total} إجمالاً`, 'mk-kpi-accent')}
        ${kpi('إجمالي الإنفاق', fmt(p.totSpent) + ' ' + curSym(), '', '')}
        ${kpi('العائد ROI', p.blendedRoi + '%', `إيراد ${fmt(p.totRev)} ${curSym()}`, p.blendedRoi >= 0 ? 'mk-kpi-pos' : 'mk-kpi-neg')}
        ${kpi('العملاء المحتملون', fmt(p.totLeads), `تحويل ${p.convRate}%`, '')}
        ${kpi('كلفة العميل CPL', fmt(p.blendedCpl) + ' ' + curSym(), 'لكل عميل محتمل', '')}
      </div>
      <div class="mk-panel"><div class="mk-panel-head"><h3>🏆 أداء الحملات (مرتبة حسب ROI)</h3><button class="mk-mini-btn" onclick="mkOpenTab('campaigns')">إدارة الحملات</button></div>
        <table class="mk-table"><thead><tr><th>الحملة</th><th>القناة</th><th>إنفاق</th><th>عملاء</th><th>تحويل</th><th>CPL</th><th>ROI</th></tr></thead>
        <tbody>${p.ranked.map(({ c, m }) => `<tr><td><strong>${esc(c.name)}</strong></td><td>${CHANNEL_LABEL[c.channel] || c.channel}</td><td>${fmt(m.spent)}</td><td>${fmt(m.leads)}</td><td>${m.convRate}%</td><td>${fmt(m.cpl)}</td><td class="${roiCls(m.roi)}"><strong>${m.roi}%</strong></td></tr>`).join('') || '<tr><td colspan="7" class="mk-empty">لا توجد بيانات أداء — أضف حملة بإنفاق</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderList() {
    const el = document.getElementById('mkListBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    let list = getCampaigns();
    if (search) { const q = search.toLowerCase(); list = list.filter(c => `${c.name} ${c.audience}`.toLowerCase().includes(q)); }
    el.innerHTML = `
      <div class="mk-toolbar">
        <button class="btn-primary" onclick="mkOpenForm('new')">➕ حملة جديدة</button>
        <button class="mk-mini-btn" onclick="mkLoadDemo()">بيانات تجريبية</button>
        <input class="mk-input" placeholder="بحث..." value="${esc(search)}" oninput="mkSearch(this.value)" style="max-width:200px">
      </div>
      <table class="mk-table"><thead><tr><th>الحملة</th><th>القناة</th><th>الفترة</th><th>الميزانية/الإنفاق</th><th>عملاء/تحويل</th><th>ROI</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(c => { const m = metrics(c);
        return `<tr>
          <td><strong>${esc(c.name)}</strong>${c.audience ? `<br><span class="mk-muted">${esc(c.audience)}</span>` : ''}</td>
          <td>${CHANNEL_LABEL[c.channel] || c.channel}</td>
          <td class="mk-muted">${esc(c.startDate || '—')}${c.endDate ? '<br>→ ' + esc(c.endDate) : ''}</td>
          <td>${fmt(m.budget)} / <strong>${fmt(m.spent)}</strong><div class="mk-bar"><div class="mk-bar-fill" style="width:${Math.min(100, m.budgetUsed)}%"></div></div></td>
          <td>${fmt(m.leads)} / ${m.convRate}%</td>
          <td class="${m.roi > 0 ? 'mk-pos' : m.roi < 0 ? 'mk-neg' : ''}"><strong>${m.roi}%</strong></td>
          <td><select class="mk-mini-select" onchange="mkSetStatus('${c.id}',this.value)">${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td class="mk-actions"><button class="mk-mini-btn" onclick="mkOpenForm('${c.id}')">تعديل</button><button class="mk-mini-btn mk-danger" onclick="mkArchive('${c.id}')">أرشفة</button></td>
        </tr>`; }).join('') || '<tr><td colspan="8" class="mk-empty">لا توجد حملات</td></tr>'}</tbody></table>`;
  }
  function renderForm() {
    const c = editing !== 'new' ? (M()?.campaigns || []).find(x => x.id === editing) : null; const v = c || {};
    const chOpt = CHANNELS.map(([k, l]) => `<option value="${k}" ${v.channel === k ? 'selected' : ''}>${l}</option>`).join('');
    const stOpt = Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="mk-panel"><div class="mk-panel-head"><h3>${c ? 'تعديل حملة' : 'حملة جديدة'}</h3></div>
      <div class="mk-form-grid">
        <div class="mk-form-full"><label>اسم الحملة *</label><input id="mkName" class="mk-input" value="${esc(v.name || '')}"></div>
        <div><label>القناة</label><select id="mkChannel" class="mk-input">${chOpt}</select></div>
        <div><label>الحالة</label><select id="mkStatus" class="mk-input">${stOpt}</select></div>
        <div><label>تاريخ البدء</label><input id="mkStart" type="date" class="mk-input" value="${esc(v.startDate || todayISO())}"></div>
        <div><label>تاريخ الانتهاء</label><input id="mkEnd" type="date" class="mk-input" value="${esc(v.endDate || '')}"></div>
        <div><label>الميزانية (${curSym()})</label><input id="mkBudget" type="number" class="mk-input" value="${money(v.budget) || ''}"></div>
        <div><label>المصروف (${curSym()})</label><input id="mkSpent" type="number" class="mk-input" value="${money(v.spent) || ''}"></div>
        <div><label>الجمهور المستهدف</label><input id="mkAudience" class="mk-input" value="${esc(v.audience || '')}"></div>
        <div><label>الوصول (reach)</label><input id="mkReach" type="number" class="mk-input" value="${money(v.reach) || ''}"></div>
        <div><label>عملاء محتملون</label><input id="mkLeads" type="number" class="mk-input" value="${money(v.leads) || ''}"></div>
        <div><label>تحويلات (مبيعات)</label><input id="mkConversions" type="number" class="mk-input" value="${money(v.conversions) || ''}"></div>
        <div><label>الإيراد الناتج (${curSym()})</label><input id="mkRevenue" type="number" class="mk-input" value="${money(v.revenue) || ''}"></div>
        <div class="mk-form-full"><label>ملاحظات</label><input id="mkNotes" class="mk-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div class="mk-form-actions"><button class="btn-primary" onclick="mkSaveCampaign()">حفظ</button><button class="mk-mini-btn" onclick="mkCancelForm()">إلغاء</button></div></div>`;
  }

  function renderTabContent() {
    const map = { mkDashBody: 'dashboard', mkListBody: 'campaigns' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard(); else renderList();
  }
  function render() {
    const body = document.getElementById('marketingBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['campaigns', '📣 الحملات']];
    body.innerHTML = `<div class="mk-tabs">${tabs.map(([k, l]) => `<button class="mk-tab-btn ${activeTab === k ? 'active' : ''}" onclick="mkOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="mkDashBody"></div><div id="mkListBody"></div>`;
    renderTabContent();
  }
  window.renderMarketing = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'marketing') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageMarketing'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navMarketing'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('marketing');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_marketing_today'] = function () {
          const p = portfolio();
          return { activeCampaigns: p.active, totalCampaigns: p.total, totalSpent: p.totSpent, totalRevenue: p.totRev, blendedRoi: p.blendedRoi, totalLeads: p.totLeads, conversionRate: p.convRate, costPerLead: p.blendedCpl, bestCampaign: p.best ? { name: p.best.c.name, roi: p.best.m.roi } : null };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['marketing'] = '#pageMarketing';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonMarketing = { render, ensureData, portfolio, metrics };
})();
