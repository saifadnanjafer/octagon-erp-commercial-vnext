/**
 * OCTAGON ERP — Subscriptions & Recurring Billing (الاشتراكات والفوترة الدورية).
 *
 * A major modern ERP/SaaS pillar Octagon had ZERO of (`subscription`/`recurring` = 0 real
 * occurrences before). Universal across every vertical: gym/clinic memberships, hotel corporate
 * accounts, retail loyalty plans, and — pairing with the new Fixed-Assets module — annual
 * maintenance contracts (AMC) on the workshop's machines. Built add-only on the shared engines.
 *
 *  - Plans: name, price, billing interval (monthly / quarterly / yearly), category, active flag.
 *  - Subscriptions: customer + plan, start date, status (active / paused / cancelled), next-renewal,
 *    billing count, auto-renew. Archive (is_active=false), never hard-delete.
 *  - Recurring billing: "due now" list → generate invoice → posts a `customer_charge` (debit AR /
 *    credit income) through the proven finance bridge (`addFinanceTransaction`), advances the
 *    next-renewal date by the interval, and records the invoice. Mark-paid posts `income` (settles
 *    the AR). Batch "generate all due". Copyable Arabic reminder draft per invoice (never auto-sent).
 *  - Dashboard: MRR / ARR / active count / renewals due / churn snapshot + renewal alert table.
 *  - Jarvis tool: report_subscriptions_today. Every mutation writes an audit event.
 *
 * Data namespace: omni.subscriptionHub = { plans:[], subscriptions:[], invoices:[] }
 * Page: #pageSubscriptions (nav data-page="subscriptions"). Add-only; nothing existing touched.
 */
(function () {
  'use strict';

  /* ───────────────────────── shared helpers (mirror the vertical modules) ───────────────────────── */
  function O() {
    if (typeof omni !== 'undefined' && omni) return omni;
    if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} }
    return null;
  }
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
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('subscriptions', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'subscriptions', action, detail, user: userName() }); } catch (_) {}
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function addInterval(iso, interval) {
    const d = new Date(iso); if (isNaN(d)) return iso;
    const add = interval === 'yearly' ? 12 : interval === 'quarterly' ? 3 : 1;
    d.setMonth(d.getMonth() + add);
    return d.toISOString().slice(0, 10);
  }

  /* ───────────────────────── data layer ───────────────────────── */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.subscriptionHub || typeof o.subscriptionHub !== 'object') o.subscriptionHub = {};
    const s = o.subscriptionHub;
    if (!Array.isArray(s.plans)) s.plans = [];
    if (!Array.isArray(s.subscriptions)) s.subscriptions = [];
    if (!Array.isArray(s.invoices)) s.invoices = [];
    return s;
  }
  function S() { return ensureData(); }
  function getCustomers() {
    const o = O();
    let list = (o && o.finance && Array.isArray(o.finance.customers)) ? o.finance.customers : [];
    if (typeof window.scoped === 'function') { try { list = window.scoped(list); } catch (_) {} }
    return list;
  }
  function getPlans(includeArchived) { return (S()?.plans || []).filter(p => includeArchived || p.is_active !== false); }
  function getSubs(includeArchived) {
    let list = (S()?.subscriptions || []).filter(x => includeArchived || x.is_active !== false);
    if (typeof window.scoped === 'function') { try { list = window.scoped(list); } catch (_) {} }
    return list;
  }

  const INTERVALS = [['monthly', 'شهري'], ['quarterly', 'ربع سنوي'], ['yearly', 'سنوي']];
  const INTERVAL_LABEL = Object.fromEntries(INTERVALS);
  const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
  const STATUS_LABEL = { active: 'نشط', paused: 'موقوف', cancelled: 'ملغى' };
  const STATUS_CLASS = { active: 'sub-st-ok', paused: 'sub-st-paused', cancelled: 'sub-st-cancelled' };

  // Monthly-normalized value of one subscription (for MRR).
  function monthlyValue(sub) { return money(sub.price) / (INTERVAL_MONTHS[sub.interval] || 1); }

  function renewalView(sub) {
    if (sub.status !== 'active' || !sub.nextRenewal) return { active: false };
    const days = daysBetween(todayISO(), sub.nextRenewal);
    return { active: true, next: sub.nextRenewal, days, overdue: days < 0, due: days >= 0 && days <= 7 };
  }

  function portfolio() {
    const subs = getSubs();
    const active = subs.filter(s => s.status === 'active');
    const mrr = active.reduce((sum, s) => sum + monthlyValue(s), 0);
    const dueList = [];
    active.forEach(s => { const r = renewalView(s); if (r.active && (r.due || r.overdue)) dueList.push({ sub: s, r }); });
    dueList.sort((a, b) => a.r.days - b.r.days);
    const invoices = S()?.invoices || [];
    return {
      total: subs.length,
      active: active.length,
      paused: subs.filter(s => s.status === 'paused').length,
      cancelled: subs.filter(s => s.status === 'cancelled').length,
      mrr: Math.round(mrr), arr: Math.round(mrr * 12),
      dueList,
      invoicedThisMonth: invoices.filter(i => (i.issueDate || '').slice(0, 7) === todayISO().slice(0, 7)).reduce((s, i) => s + money(i.amount), 0),
      unpaid: invoices.filter(i => i.status !== 'paid').length
    };
  }

  /* ───────────────────────── state ───────────────────────── */
  let activeTab = 'dashboard';
  let editingPlan = null;
  let editingSub = null;
  let search = '';

  window.subOpenTab = function (tab) { activeTab = tab; editingPlan = null; editingSub = null; renderSubs(); };
  window.subSearch = function (v) { search = v; renderSubsTab(); };

  /* ───────────────────────── plan mutations ───────────────────────── */
  window.subOpenPlanForm = function (id) { editingPlan = id || 'new'; activeTab = 'plans'; renderSubs(); };
  window.subCancelPlanForm = function () { editingPlan = null; renderSubs(); };
  window.subSavePlan = function () {
    const s = S(); if (!s) return;
    const name = val('subPlanName');
    if (!name) { toast('اسم الباقة مطلوب', 'error'); return; }
    const base = { name, price: numVal('subPlanPrice'), interval: val('subPlanInterval') || 'monthly', category: val('subPlanCategory'), description: val('subPlanDesc') };
    const existing = editingPlan && editingPlan !== 'new' ? s.plans.find(p => p.id === editingPlan) : null;
    if (existing) { Object.assign(existing, base); audit('plan_update', `تعديل باقة: ${name}`); toast('تم تحديث الباقة', 'success'); }
    else { s.plans.push({ id: uid('plan'), ...base, is_active: true, companyId: coId(), createdAt: new Date().toISOString() }); audit('plan_create', `باقة جديدة: ${name}`); toast('تمت إضافة الباقة', 'success'); }
    save(); editingPlan = null; renderSubs();
  };
  window.subArchivePlan = function (id) {
    const p = (S()?.plans || []).find(x => x.id === id); if (!p) return;
    if (!confirm(`أرشفة الباقة "${p.name}"؟ (الاشتراكات الحالية تبقى كما هي)`)) return;
    p.is_active = false; audit('plan_archive', `أرشفة باقة: ${p.name}`); save(); renderSubs();
  };

  /* ───────────────────────── subscription mutations ───────────────────────── */
  window.subOpenSubForm = function (id) { editingSub = id || 'new'; activeTab = 'subscriptions'; renderSubs(); };
  window.subCancelSubForm = function () { editingSub = null; renderSubs(); };
  window.subSaveSub = function () {
    const s = S(); if (!s) return;
    const customerId = val('subCustomer');
    const planId = val('subPlan');
    if (!customerId) { toast('اختر العميل', 'error'); return; }
    if (!planId) { toast('اختر الباقة', 'error'); return; }
    const cust = getCustomers().find(c => c.id === customerId);
    const plan = s.plans.find(p => p.id === planId);
    if (!plan) { toast('الباقة غير موجودة', 'error'); return; }
    const startDate = val('subStart') || todayISO();
    const priceOverride = numVal('subPrice');
    const base = {
      customerId, customerName: cust ? cust.name : customerId,
      planId, planName: plan.name, interval: plan.interval,
      price: priceOverride > 0 ? priceOverride : money(plan.price),
      startDate, autoRenew: document.getElementById('subAutoRenew') ? document.getElementById('subAutoRenew').checked : true,
      notes: val('subNotes')
    };
    const existing = editingSub && editingSub !== 'new' ? s.subscriptions.find(x => x.id === editingSub) : null;
    if (existing) {
      Object.assign(existing, base, { updatedAt: new Date().toISOString() });
      audit('sub_update', `تعديل اشتراك: ${base.customerName}`); toast('تم تحديث الاشتراك', 'success');
    } else {
      s.subscriptions.push({
        id: uid('sub'), ...base, status: 'active',
        nextRenewal: startDate, lastBilled: '', billingCount: 0,
        is_active: true, companyId: coId(), createdAt: new Date().toISOString()
      });
      audit('sub_create', `اشتراك جديد: ${base.customerName} — ${plan.name}`); toast('تم إنشاء الاشتراك', 'success');
    }
    save(); editingSub = null; renderSubs();
  };
  window.subSetStatus = function (id, status) {
    const sub = (S()?.subscriptions || []).find(x => x.id === id); if (!sub) return;
    if (status === 'cancelled' && !confirm(`إلغاء اشتراك "${sub.customerName}"؟`)) return;
    sub.status = status;
    if (status === 'active' && !sub.nextRenewal) sub.nextRenewal = todayISO();
    audit('sub_status', `${sub.customerName} → ${STATUS_LABEL[status]}`);
    save(); toast(`الاشتراك الآن: ${STATUS_LABEL[status]}`, 'info'); renderSubs();
  };
  window.subArchiveSub = function (id) {
    const sub = (S()?.subscriptions || []).find(x => x.id === id); if (!sub) return;
    if (!confirm(`أرشفة اشتراك "${sub.customerName}"؟ (لا يُحذف — يبقى بالسجل)`)) return;
    sub.is_active = false; sub.status = 'cancelled'; audit('sub_archive', `أرشفة اشتراك: ${sub.customerName}`); save(); renderSubs();
  };

  /* ───────────────────────── billing ───────────────────────── */
  // Generate one recurring invoice for a subscription: posts customer_charge (AR/income) via the
  // proven finance bridge, advances next-renewal by the interval, records the invoice.
  function generateInvoiceFor(sub, opts) {
    opts = opts || {};
    const s = S();
    const periodStart = sub.nextRenewal || todayISO();
    const periodEnd = addInterval(periodStart, sub.interval);
    const amount = money(sub.price);
    const inv = {
      id: uid('subinv'), subscriptionId: sub.id, customerId: sub.customerId, customerName: sub.customerName,
      planName: sub.planName, amount, periodStart, periodEnd, issueDate: todayISO(),
      status: 'issued', financeTxnId: '', companyId: coId(), createdAt: new Date().toISOString()
    };
    if (amount > 0 && typeof window.addFinanceTransaction === 'function') {
      try {
        const txn = window.addFinanceTransaction({
          type: 'customer_charge', direction: 'neutral', sourceType: 'subscription', sourceId: inv.id,
          date: todayISO(), amount, customerId: sub.customerId, partyName: sub.customerName,
          description: `اشتراك ${sub.planName} (${periodStart} → ${periodEnd})`
        }, { skipSave: true });
        if (txn && txn.id) inv.financeTxnId = txn.id;
      } catch (e) { console.warn('subscription charge post failed', e); }
    }
    s.invoices.unshift(inv);
    sub.lastBilled = todayISO();
    sub.billingCount = (sub.billingCount || 0) + 1;
    sub.nextRenewal = periodEnd;
    audit('sub_invoice', `فاتورة اشتراك ${fmt(amount)} ${curSym()} — ${sub.customerName}`);
    return inv;
  }
  window.subGenerateInvoice = function (id) {
    const sub = (S()?.subscriptions || []).find(x => x.id === id); if (!sub) return;
    if (sub.status !== 'active') { toast('الاشتراك غير نشط', 'error'); return; }
    const inv = generateInvoiceFor(sub);
    save(); toast(`تم إصدار فاتورة ${fmt(inv.amount)} ${curSym()}`, 'success'); renderSubs();
  };
  window.subGenerateAllDue = function () {
    const s = S();
    const due = getSubs().filter(x => { const r = renewalView(x); return r.active && (r.due || r.overdue); });
    if (!due.length) { toast('لا توجد اشتراكات مستحقة', 'info'); return; }
    if (!confirm(`إصدار ${due.length} فاتورة اشتراك مستحقة الآن؟`)) return;
    let total = 0; due.forEach(sub => { total += generateInvoiceFor(sub).amount; });
    save(); audit('sub_batch_invoice', `إصدار ${due.length} فاتورة اشتراك بإجمالي ${fmt(total)} ${curSym()}`);
    toast(`تم إصدار ${due.length} فاتورة (${fmt(total)} ${curSym()})`, 'success'); renderSubs();
  };
  // Mark invoice paid → posts income tied to the customer (settles the AR raised by the charge).
  window.subMarkPaid = function (invId) {
    const s = S(); const inv = s.invoices.find(i => i.id === invId); if (!inv) return;
    if (inv.status === 'paid') { toast('مدفوعة مسبقاً', 'info'); return; }
    if (money(inv.amount) > 0 && typeof window.addFinanceTransaction === 'function') {
      try {
        window.addFinanceTransaction({
          type: 'income', direction: 'in', sourceType: 'subscription_payment', sourceId: inv.id,
          date: todayISO(), amount: money(inv.amount), customerId: inv.customerId, partyName: inv.customerName,
          description: `تسديد اشتراك ${inv.planName} — ${inv.customerName}`
        }, { skipSave: true });
      } catch (e) { console.warn('subscription payment post failed', e); }
    }
    inv.status = 'paid'; inv.paidAt = new Date().toISOString();
    audit('sub_payment', `تسديد فاتورة اشتراك ${fmt(inv.amount)} ${curSym()} — ${inv.customerName}`);
    save(); toast('تم تسجيل التسديد', 'success'); renderSubs();
  };
  window.subCopyReminder = function (invId) {
    const inv = (S()?.invoices || []).find(i => i.id === invId); if (!inv) return;
    const msg = `أهلاً ${inv.customerName}، تذكير ودّي باشتراك «${inv.planName}». المبلغ المستحق ${fmt(inv.amount)} ${curSym()} للفترة ${inv.periodStart} إلى ${inv.periodEnd}. شكراً لثقتكم 🌹`;
    try { navigator.clipboard.writeText(msg); toast('تم نسخ رسالة التذكير', 'success'); }
    catch (_) { window.prompt('انسخ الرسالة:', msg); }
  };

  window.subLoadDemo = function () {
    const s = S(); if (!s) return;
    if (s.plans.length || s.subscriptions.length) { toast('توجد بيانات مسبقاً', 'info'); return; }
    const p1 = { id: uid('plan'), name: 'عقد صيانة سنوي - ذهبي', price: 1200000, interval: 'yearly', category: 'صيانة', description: 'AMC شامل', is_active: true, companyId: coId(), createdAt: new Date().toISOString() };
    const p2 = { id: uid('plan'), name: 'اشتراك خدمة شهري', price: 150000, interval: 'monthly', category: 'خدمة', description: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() };
    const p3 = { id: uid('plan'), name: 'باقة ربع سنوية', price: 400000, interval: 'quarterly', category: 'خدمة', description: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() };
    s.plans.push(p1, p2, p3);
    const custs = getCustomers();
    const pick = (i) => custs[i] || { id: 'cust_demo_' + i, name: 'عميل تجريبي ' + (i + 1) };
    const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const c0 = pick(0), c1 = pick(1), c2 = pick(2);
    s.subscriptions.push(
      { id: uid('sub'), customerId: c0.id, customerName: c0.name, planId: p2.id, planName: p2.name, interval: 'monthly', price: 150000, startDate: back(40), status: 'active', nextRenewal: back(2), lastBilled: back(32), billingCount: 1, autoRenew: true, notes: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('sub'), customerId: c1.id, customerName: c1.name, planId: p1.id, planName: p1.name, interval: 'yearly', price: 1200000, startDate: back(20), status: 'active', nextRenewal: fwd(5), lastBilled: '', billingCount: 0, autoRenew: true, notes: 'AMC مكائن الليزر', is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('sub'), customerId: c2.id, customerName: c2.name, planId: p3.id, planName: p3.name, interval: 'quarterly', price: 400000, startDate: back(10), status: 'paused', nextRenewal: fwd(80), lastBilled: '', billingCount: 0, autoRenew: false, notes: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString() }
    );
    audit('sub_demo', 'تحميل اشتراكات تجريبية');
    save(); toast('تم تحميل بيانات تجريبية', 'success'); renderSubs();
  };

  /* ───────────────────────── render ───────────────────────── */
  function kpiCard(label, value, sub, cls) {
    return `<div class="sub-kpi ${cls || ''}"><div class="sub-kpi-val">${value}</div><div class="sub-kpi-label">${label}</div>${sub ? `<div class="sub-kpi-sub">${sub}</div>` : ''}</div>`;
  }

  function renderDashboard() {
    const el = document.getElementById('subDashBody'); if (!el) return;
    const p = portfolio();
    const rows = p.dueList.map(({ sub, r }) => `<tr class="${r.overdue ? 'sub-row-danger' : 'sub-row-warn'}">
      <td><strong>${esc(sub.customerName)}</strong></td><td>${esc(sub.planName)}</td>
      <td>${fmt(sub.price)} ${curSym()} / ${INTERVAL_LABEL[sub.interval]}</td>
      <td>${r.overdue ? `متأخر ${Math.abs(r.days)} يوم` : `خلال ${r.days} يوم`}</td>
      <td><button class="sub-mini-btn" onclick="subGenerateInvoice('${sub.id}')">أصدر فاتورة</button></td></tr>`).join('');
    el.innerHTML = `
      <div class="sub-kpi-grid">
        ${kpiCard('الإيراد الشهري المتكرر', fmt(p.mrr) + ' ' + curSym(), 'MRR', 'sub-kpi-accent')}
        ${kpiCard('الإيراد السنوي المتكرر', fmt(p.arr) + ' ' + curSym(), 'ARR', '')}
        ${kpiCard('اشتراكات نشطة', p.active, `${p.paused} موقوف · ${p.cancelled} ملغى`, '')}
        ${kpiCard('مستحقة التجديد', p.dueList.length, 'خلال 7 أيام أو متأخرة', p.dueList.length ? 'sub-kpi-warn' : '')}
        ${kpiCard('فواتير هذا الشهر', fmt(p.invoicedThisMonth) + ' ' + curSym(), `${p.unpaid} غير مدفوعة`, '')}
      </div>
      <div class="sub-panel">
        <div class="sub-panel-head"><h3>🔔 تجديدات مستحقة</h3>${p.dueList.length ? `<button class="sub-mini-btn" onclick="subGenerateAllDue()">أصدر كل المستحق</button>` : ''}</div>
        <table class="sub-table"><thead><tr><th>العميل</th><th>الباقة</th><th>السعر</th><th>الاستحقاق</th><th>إجراء</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="sub-empty">لا توجد تجديدات مستحقة — كل الاشتراكات ضمن الجدول ✅</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderPlansTab() {
    const el = document.getElementById('subPlansBody'); if (!el) return;
    if (editingPlan) { el.innerHTML = renderPlanForm(); return; }
    const plans = getPlans();
    el.innerHTML = `
      <div class="sub-toolbar">
        <button class="btn-primary" onclick="subOpenPlanForm('new')">➕ باقة جديدة</button>
        <button class="sub-mini-btn" onclick="subLoadDemo()">بيانات تجريبية</button>
      </div>
      <table class="sub-table"><thead><tr><th>الباقة</th><th>السعر</th><th>الدورة</th><th>الفئة</th><th>المشتركون</th><th>إجراءات</th></tr></thead>
      <tbody>${plans.map(pl => {
        const count = getSubs().filter(s => s.planId === pl.id && s.status === 'active').length;
        return `<tr><td><strong>${esc(pl.name)}</strong>${pl.description ? `<br><span class="sub-muted">${esc(pl.description)}</span>` : ''}</td>
          <td>${fmt(pl.price)} ${curSym()}</td><td>${INTERVAL_LABEL[pl.interval] || pl.interval}</td><td>${esc(pl.category || '—')}</td>
          <td>${count}</td>
          <td class="sub-actions"><button class="sub-mini-btn" onclick="subOpenPlanForm('${pl.id}')">تعديل</button>
          <button class="sub-mini-btn sub-danger" onclick="subArchivePlan('${pl.id}')">أرشفة</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="sub-empty">لا توجد باقات — أضف باقة أو حمّل بيانات تجريبية</td></tr>'}</tbody></table>`;
  }
  function renderPlanForm() {
    const p = editingPlan !== 'new' ? (S()?.plans || []).find(x => x.id === editingPlan) : null;
    const v = p || {};
    const opt = (cur) => INTERVALS.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="sub-panel"><div class="sub-panel-head"><h3>${p ? 'تعديل باقة' : 'باقة جديدة'}</h3></div>
      <div class="sub-form-grid">
        <div><label>اسم الباقة *</label><input id="subPlanName" class="sub-input" value="${esc(v.name || '')}"></div>
        <div><label>السعر (${curSym()})</label><input id="subPlanPrice" type="number" class="sub-input" value="${money(v.price) || ''}"></div>
        <div><label>دورة الفوترة</label><select id="subPlanInterval" class="sub-input">${opt(v.interval || 'monthly')}</select></div>
        <div><label>الفئة</label><input id="subPlanCategory" class="sub-input" value="${esc(v.category || '')}"></div>
        <div class="sub-form-full"><label>الوصف</label><input id="subPlanDesc" class="sub-input" value="${esc(v.description || '')}"></div>
      </div>
      <div class="sub-form-actions"><button class="btn-primary" onclick="subSavePlan()">حفظ</button><button class="sub-mini-btn" onclick="subCancelPlanForm()">إلغاء</button></div></div>`;
  }

  function renderSubsTab() {
    const el = document.getElementById('subSubsBody'); if (!el) return;
    if (editingSub) { el.innerHTML = renderSubForm(); return; }
    let list = getSubs();
    if (search) { const q = search.toLowerCase(); list = list.filter(s => `${s.customerName} ${s.planName}`.toLowerCase().includes(q)); }
    el.innerHTML = `
      <div class="sub-toolbar">
        <button class="btn-primary" onclick="subOpenSubForm('new')">➕ اشتراك جديد</button>
        <input class="sub-input" placeholder="بحث بالعميل/الباقة..." value="${esc(search)}" oninput="subSearch(this.value)" style="max-width:240px">
      </div>
      <table class="sub-table"><thead><tr><th>العميل</th><th>الباقة</th><th>السعر/الدورة</th><th>التجديد القادم</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(s => {
        const r = renewalView(s);
        const renew = s.status !== 'active' ? '—' : `${esc(s.nextRenewal || '—')}${r.overdue ? ' <span class="sub-badge sub-st-cancelled">متأخر</span>' : r.due ? ' <span class="sub-badge sub-st-paused">قريب</span>' : ''}`;
        return `<tr>
          <td><strong>${esc(s.customerName)}</strong></td><td>${esc(s.planName)}</td>
          <td>${fmt(s.price)} ${curSym()}<br><span class="sub-muted">${INTERVAL_LABEL[s.interval]}</span></td>
          <td>${renew}</td>
          <td><span class="sub-badge ${STATUS_CLASS[s.status] || ''}">${STATUS_LABEL[s.status] || s.status}</span></td>
          <td class="sub-actions">
            <button class="sub-mini-btn" onclick="subOpenSubForm('${s.id}')">تعديل</button>
            ${s.status === 'active' ? `<button class="sub-mini-btn" onclick="subGenerateInvoice('${s.id}')">فاتورة</button><button class="sub-mini-btn" onclick="subSetStatus('${s.id}','paused')">إيقاف</button>` : ''}
            ${s.status === 'paused' ? `<button class="sub-mini-btn" onclick="subSetStatus('${s.id}','active')">تفعيل</button>` : ''}
            ${s.status !== 'cancelled' ? `<button class="sub-mini-btn sub-danger" onclick="subSetStatus('${s.id}','cancelled')">إلغاء</button>` : ''}
          </td></tr>`;
      }).join('') || '<tr><td colspan="6" class="sub-empty">لا توجد اشتراكات — أنشئ اشتراكاً</td></tr>'}</tbody></table>`;
  }
  function renderSubForm() {
    const s = editingSub !== 'new' ? (S()?.subscriptions || []).find(x => x.id === editingSub) : null;
    const v = s || {};
    const custOpts = ['<option value="">— اختر العميل —</option>'].concat(getCustomers().map(c => `<option value="${c.id}" ${v.customerId === c.id ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' (' + esc(c.phone) + ')' : ''}</option>`)).join('');
    const planOpts = ['<option value="">— اختر الباقة —</option>'].concat(getPlans().map(p => `<option value="${p.id}" ${v.planId === p.id ? 'selected' : ''}>${esc(p.name)} — ${fmt(p.price)} ${curSym()}/${INTERVAL_LABEL[p.interval]}</option>`)).join('');
    return `<div class="sub-panel"><div class="sub-panel-head"><h3>${s ? 'تعديل اشتراك' : 'اشتراك جديد'}</h3></div>
      <div class="sub-form-grid">
        <div><label>العميل *</label><select id="subCustomer" class="sub-input">${custOpts}</select></div>
        <div><label>الباقة *</label><select id="subPlan" class="sub-input">${planOpts}</select></div>
        <div><label>تاريخ البدء</label><input id="subStart" type="date" class="sub-input" value="${esc(v.startDate || todayISO())}"></div>
        <div><label>سعر مخصص (اختياري)</label><input id="subPrice" type="number" class="sub-input" value="${v.price ? money(v.price) : ''}" placeholder="افتراضي = سعر الباقة"></div>
        <div><label><input id="subAutoRenew" type="checkbox" ${v.autoRenew !== false ? 'checked' : ''}> تجديد تلقائي</label></div>
        <div class="sub-form-full"><label>ملاحظات</label><input id="subNotes" class="sub-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div class="sub-form-actions"><button class="btn-primary" onclick="subSaveSub()">حفظ</button><button class="sub-mini-btn" onclick="subCancelSubForm()">إلغاء</button></div></div>`;
  }

  function renderBillingTab() {
    const el = document.getElementById('subBillBody'); if (!el) return;
    const due = getSubs().filter(x => { const r = renewalView(x); return r.active && (r.due || r.overdue); });
    const invoices = (S()?.invoices || []).slice(0, 30);
    el.innerHTML = `
      <div class="sub-panel">
        <div class="sub-panel-head"><h3>💳 مستحق الفوترة الآن (${due.length})</h3>${due.length ? `<button class="btn-primary" onclick="subGenerateAllDue()">أصدر كل المستحق</button>` : ''}</div>
        <table class="sub-table"><thead><tr><th>العميل</th><th>الباقة</th><th>المبلغ</th><th>الاستحقاق</th><th>إجراء</th></tr></thead>
        <tbody>${due.map(s => { const r = renewalView(s); return `<tr class="${r.overdue ? 'sub-row-danger' : 'sub-row-warn'}"><td><strong>${esc(s.customerName)}</strong></td><td>${esc(s.planName)}</td><td>${fmt(s.price)} ${curSym()}</td><td>${esc(s.nextRenewal)}</td><td><button class="sub-mini-btn" onclick="subGenerateInvoice('${s.id}')">أصدر فاتورة</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="sub-empty">لا توجد اشتراكات مستحقة الآن ✅</td></tr>'}</tbody></table>
      </div>
      <div class="sub-panel">
        <div class="sub-panel-head"><h3>🧾 فواتير الاشتراكات</h3></div>
        <table class="sub-table"><thead><tr><th>التاريخ</th><th>العميل</th><th>الباقة</th><th>الفترة</th><th>المبلغ</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${invoices.map(i => `<tr>
          <td class="sub-muted">${esc(i.issueDate)}</td><td>${esc(i.customerName)}</td><td>${esc(i.planName)}</td>
          <td class="sub-muted">${esc(i.periodStart)} → ${esc(i.periodEnd)}</td><td>${fmt(i.amount)} ${curSym()}</td>
          <td><span class="sub-badge ${i.status === 'paid' ? 'sub-st-ok' : 'sub-st-paused'}">${i.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</span></td>
          <td class="sub-actions">${i.status !== 'paid' ? `<button class="sub-mini-btn" onclick="subMarkPaid('${i.id}')">تسديد</button>` : ''}<button class="sub-mini-btn" onclick="subCopyReminder('${i.id}')">نسخ تذكير</button></td></tr>`).join('') || '<tr><td colspan="7" class="sub-empty">لا توجد فواتير بعد</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderTabContent() {
    const map = { subDashBody: 'dashboard', subPlansBody: 'plans', subSubsBody: 'subscriptions', subBillBody: 'billing' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'plans') renderPlansTab();
    else if (activeTab === 'subscriptions') renderSubsTab();
    else if (activeTab === 'billing') renderBillingTab();
  }

  function renderSubs() {
    const body = document.getElementById('subscriptionsBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['plans', '📦 الباقات'], ['subscriptions', '👥 الاشتراكات'], ['billing', '💳 الفوترة']];
    body.innerHTML = `<div class="sub-tabs">${tabs.map(([k, l]) => `<button class="sub-tab-btn ${activeTab === k ? 'active' : ''}" onclick="subOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="subDashBody"></div><div id="subPlansBody"></div><div id="subSubsBody"></div><div id="subBillBody"></div>`;
    renderTabContent();
  }
  window.renderSubscriptions = renderSubs;

  /* ───────────────────────── switchPage hook ───────────────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'subscriptions') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageSubscriptions'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navSubscriptions'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('subscriptions');
      } catch (_) {}
      ensureData();
      setTimeout(renderSubs, 0);
    }
  };

  /* ───────────────────────── Jarvis tool ───────────────────────── */
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_subscriptions_today'] = function () {
          const p = portfolio();
          return {
            mrr: p.mrr, arr: p.arr, activeSubscriptions: p.active, paused: p.paused, cancelled: p.cancelled,
            renewalsDue: p.dueList.map(x => ({ customer: x.sub.customerName, plan: x.sub.planName, amount: x.sub.price, daysUntilDue: x.r.days, overdue: x.r.overdue })),
            invoicedThisMonth: p.invoicedThisMonth, unpaidInvoices: p.unpaid
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['subscriptions'] = '#pageSubscriptions';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis);
  else setTimeout(registerJarvis, 600);

  window.OctagonSubscriptions = { render: renderSubs, ensureData, portfolio };
})();
