/*
 * Phase 7J - Sales Commercial Pack.
 * Add-only panel on the existing Sales page. It unifies commercial maturity
 * signals around the current CRM, contracts, installments, price lists,
 * loyalty, customer statements, quote-to-contract-to-work-order handoff, and
 * manual WhatsApp/email sharing. No automatic external send is performed.
 */
(function () {
  'use strict';

  const root = window;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = value => Number(value || 0);
  const money = value => Math.round(num(value));
  const fmt = value => {
    try { return typeof root.formatNum === 'function' ? root.formatNum(money(value)) : money(value).toLocaleString(); }
    catch (_) { return String(money(value)); }
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix || 'sc7j'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  let activeTab = 'overview';
  let selectedCustomerId = '';

  function O() {
    try {
      if (typeof ensureOmni === 'function') ensureOmni();
      return (typeof omni !== 'undefined' && omni) ? omni : null;
    } catch (_) {
      return null;
    }
  }
  function toast(message, kind) { if (typeof root.showToast === 'function') root.showToast(message, kind || 'info'); }
  function save() { if (typeof root.saveData === 'function') root.saveData(); }
  function currency() { const o = O(); return o?.adminSettings?.organization?.currencySymbol || 'د.ع'; }
  function crm() { const o = O(); return o?.salesCrm || { leads: [], quotations: [], salesOrders: [], invoices: [] }; }
  function finance() { const o = O(); return o?.finance || { customers: [], installmentPlans: [] }; }
  function customers() { const f = finance(); return Array.isArray(f.customers) ? f.customers : []; }

  function ensureState() {
    const o = O(); if (!o) return null;
    if (!o.salesCommercialPack || typeof o.salesCommercialPack !== 'object' || Array.isArray(o.salesCommercialPack)) o.salesCommercialPack = {};
    const s = o.salesCommercialPack;
    ['targets', 'statementPins', 'shareLog', 'workLinks', 'approvalNotes'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    s.policyVersion = s.policyVersion || 'phase7j-sales-commercial-pack-v1';
    s.updatedAt = s.updatedAt || now();
    return s;
  }

  function currentMonth() { return today().slice(0, 7); }
  function dateMonth(value) { return String(value || '').slice(0, 7); }
  function monthOrders(month) {
    const c = crm();
    return (c.salesOrders || []).filter(o => dateMonth(o.createdAt || o.date) === month);
  }
  function monthInvoices(month) {
    const c = crm();
    return (c.invoices || []).filter(i => dateMonth(i.createdAt || i.date) === month);
  }
  function targetForMonth(month) {
    const s = ensureState();
    return s.targets.find(t => t.month === month) || null;
  }
  function orderRevenue(orders) { return orders.reduce((sum, o) => sum + money(o.total), 0); }
  function invoiceRevenue(invoices) { return invoices.reduce((sum, i) => sum + money(i.total), 0); }
  function invoicePaid(invoices) { return invoices.reduce((sum, i) => sum + money(i.paidAmount), 0); }
  function getCustomerName(id) {
    const cu = customers().find(c => c.id === id);
    return cu ? (cu.name || cu.companyName || cu.shopName || cu.id) : '';
  }

  function model() {
    const o = O() || {};
    const s = ensureState() || { targets: [], statementPins: [], shareLog: [], workLinks: [] };
    const c = crm();
    const f = finance();
    const contracts = o.salesContracts || {};
    const commissions = o.salesCommission || {};
    const priceLists = o.priceLists || {};
    const loyalty = o.loyalty || {};
    const month = currentMonth();
    const orders = monthOrders(month);
    const invoices = monthInvoices(month);
    const target = targetForMonth(month);
    const targetAmount = money(target?.amount);
    const closed = orderRevenue(orders);
    const invoiced = invoiceRevenue(invoices);
    const paid = invoicePaid(invoices);
    const pipeline = (c.leads || []).filter(l => !['stage_won', 'stage_lost'].includes(l.stageId)).reduce((sum, l) => sum + money(l.expectedRevenue), 0);
    const openQuotes = (c.quotations || []).filter(q => ['draft', 'sent', 'approved'].includes(q.status));
    const overduePlans = (f.installmentPlans || []).flatMap(p => (p.lines || []).map(line => ({ p, line }))).filter(x => x.p.status === 'active' && x.line.status !== 'paid' && x.line.dueDate < today());
    const checks = [
      ['Commission engine', Array.isArray(commissions.rules), `${(commissions.rules || []).length} rules / ${(commissions.accruals || []).length} accruals`],
      ['Sales targets', s.targets.length > 0, `${s.targets.length} target periods configured`],
      ['Installments', Array.isArray(f.installmentPlans), `${(f.installmentPlans || []).length} plans / ${overduePlans.length} overdue lines`],
      ['Advanced price lists', Array.isArray(priceLists.lists), `${(priceLists.lists || []).length} lists / ${(priceLists.items || []).length} items`],
      ['Loyalty', !!loyalty, `${(loyalty.members || []).length} members / ${(loyalty.rewards || []).length} rewards`],
      ['Customer statements', customers().length > 0, `${customers().length} customers available for statements`],
      ['Quote to contract to work order', true, `${(contracts.contracts || []).length} contracts / ${s.workLinks.length} sales work links`],
      ['WhatsApp/email sharing', true, `${s.shareLog.length} prepared share drafts; no automatic external send`]
    ];
    return { s, c, f, contracts, commissions, priceLists, loyalty, month, orders, invoices, targetAmount, closed, invoiced, paid, pipeline, openQuotes, overduePlans, checks };
  }

  function pill(ok) { return `<span class="sc7j-pill ${ok ? 'ok' : 'warn'}">${ok ? 'ready' : 'needs data'}</span>`; }
  function pct(value, total) { return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0; }

  function renderOverview(m) {
    const progress = pct(m.closed, m.targetAmount);
    return `
      <div class="sc7j-kpis">
        <div class="sc7j-kpi"><strong>${fmt(m.pipeline)}</strong><span>pipeline ${currency()}</span></div>
        <div class="sc7j-kpi"><strong>${fmt(m.closed)}</strong><span>closed orders ${currency()}</span></div>
        <div class="sc7j-kpi"><strong>${fmt(m.invoiced)}</strong><span>invoiced ${currency()}</span></div>
        <div class="sc7j-kpi"><strong>${fmt(m.paid)}</strong><span>collected ${currency()}</span></div>
      </div>
      <div class="sc7j-progress">
        <div class="sc7j-progress-head"><strong>Monthly target ${esc(m.month)}</strong><span>${progress}%</span></div>
        <div class="sc7j-bar"><i style="width:${progress}%"></i></div>
        <small>${fmt(m.closed)} / ${fmt(m.targetAmount)} ${currency()} from confirmed sales orders.</small>
      </div>
      <div class="sc7j-table-wrap"><table class="sc7j-table"><thead><tr><th>Capability</th><th>Status</th><th>Evidence</th></tr></thead>
        <tbody>${m.checks.map(row => `<tr><td><strong>${esc(row[0])}</strong></td><td>${pill(row[1])}</td><td>${esc(row[2])}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderTargets(m) {
    const rows = m.s.targets.slice().sort((a, b) => String(b.month).localeCompare(String(a.month))).map(t => {
      const actual = orderRevenue(monthOrders(t.month));
      const p = pct(actual, money(t.amount));
      return `<tr><td><strong>${esc(t.month)}</strong></td><td>${fmt(t.amount)} ${currency()}</td><td>${fmt(actual)} ${currency()}</td><td><div class="sc7j-mini-bar"><i style="width:${p}%"></i></div></td><td>${p}%</td><td>${esc(t.owner || '')}</td></tr>`;
    }).join('');
    return `
      <div class="sc7j-actions">
        <button type="button" onclick="SalesCommercialPack.addTarget()">Add target</button>
        <button type="button" onclick="SalesCommercialPack.seedCurrentTarget()">Seed current month</button>
      </div>
      <div class="sc7j-table-wrap"><table class="sc7j-table"><thead><tr><th>Month</th><th>Target</th><th>Actual</th><th>Progress</th><th>%</th><th>Owner</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="sc7j-empty">No sales targets yet.</td></tr>'}</tbody></table></div>`;
  }

  function statementRows(customerId) {
    const c = crm();
    const invoices = (c.invoices || []).filter(i => !customerId || i.customerId === customerId);
    const rows = [];
    invoices.forEach(inv => {
      rows.push({ date: inv.date || inv.createdAt || '', ref: inv.reference || inv.id, type: 'Invoice', debit: money(inv.total), credit: 0, note: inv.orderRef || '' });
      (inv.payments || []).forEach(p => rows.push({ date: p.date || p.at || '', ref: p.id, type: 'Payment', debit: 0, credit: money(p.amount), note: inv.reference || '' }));
    });
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function renderStatements() {
    const custs = customers();
    if (!selectedCustomerId && custs[0]) selectedCustomerId = custs[0].id;
    const rows = statementRows(selectedCustomerId);
    let balance = 0;
    const rendered = rows.map(r => {
      balance += money(r.debit) - money(r.credit);
      return `<tr><td>${esc(String(r.date).slice(0, 10))}</td><td>${esc(r.ref)}</td><td>${esc(r.type)}</td><td>${fmt(r.debit)}</td><td>${fmt(r.credit)}</td><td><strong>${fmt(balance)}</strong></td><td>${esc(r.note)}</td></tr>`;
    }).join('');
    return `
      <div class="sc7j-form-row">
        <label>Customer</label>
        <select onchange="SalesCommercialPack.selectCustomer(this.value)">
          ${custs.map(c => `<option value="${esc(c.id)}" ${c.id === selectedCustomerId ? 'selected' : ''}>${esc(c.name || c.companyName || c.shopName || c.id)}</option>`).join('')}
        </select>
        <button type="button" onclick="SalesCommercialPack.copyStatement()">Copy statement</button>
      </div>
      <div class="sc7j-table-wrap"><table class="sc7j-table"><thead><tr><th>Date</th><th>Ref</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Note</th></tr></thead>
        <tbody>${rendered || '<tr><td colspan="7" class="sc7j-empty">No invoice/payment rows for this customer.</td></tr>'}</tbody></table></div>`;
  }

  function renderCycle(m) {
    const quotes = (m.c.quotations || []).filter(q => ['sent', 'approved', 'converted'].includes(q.status)).slice(-8).reverse();
    const orders = (m.c.salesOrders || []).slice(-8).reverse();
    const quoteRows = quotes.map(q => `<tr><td><strong>${esc(q.reference || q.id)}</strong></td><td>${esc(q.customerName || '')}</td><td>${fmt(q.total)} ${currency()}</td><td>${esc(q.status || '')}</td><td><button type="button" onclick="SalesCommercialPack.createContractFromQuote('${esc(q.id)}')">Contract</button> <button type="button" onclick="SalesCommercialPack.shareQuote('${esc(q.id)}','whatsapp')">WhatsApp</button></td></tr>`).join('');
    const orderRows = orders.map(o => `<tr><td><strong>${esc(o.reference || o.id)}</strong></td><td>${esc(o.customerName || '')}</td><td>${fmt(o.total)} ${currency()}</td><td>${esc(o.status || '')}</td><td><button type="button" onclick="SalesCommercialPack.createWorkOrderFromOrder('${esc(o.id)}')">Work order</button> <button type="button" onclick="SalesCommercialPack.createInstallmentsFromOrder('${esc(o.id)}')">Installments</button></td></tr>`).join('');
    return `
      <div class="sc7j-split">
        <div><h4>Quote to Contract</h4><div class="sc7j-table-wrap"><table class="sc7j-table"><thead><tr><th>Quote</th><th>Customer</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>${quoteRows || '<tr><td colspan="5" class="sc7j-empty">No sent/approved quotes yet.</td></tr>'}</tbody></table></div></div>
        <div><h4>Order to Work</h4><div class="sc7j-table-wrap"><table class="sc7j-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>${orderRows || '<tr><td colspan="5" class="sc7j-empty">No sales orders yet.</td></tr>'}</tbody></table></div></div>
      </div>`;
  }

  function renderShare(m) {
    const rows = m.s.shareLog.slice(0, 12).map(x => `<tr><td>${esc(String(x.createdAt || '').slice(0, 16).replace('T', ' '))}</td><td>${esc(x.channel)}</td><td>${esc(x.entityRef)}</td><td>${esc(x.customerName || '')}</td><td><button type="button" onclick="SalesCommercialPack.copyShare('${esc(x.id)}')">Copy</button></td></tr>`).join('');
    return `
      <div class="sc7j-note">Sharing creates a prepared WhatsApp link, email draft, or copyable text. It never sends externally without the user.</div>
      <div class="sc7j-table-wrap"><table class="sc7j-table"><thead><tr><th>Created</th><th>Channel</th><th>Entity</th><th>Customer</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="sc7j-empty">No share drafts prepared yet.</td></tr>'}</tbody></table></div>`;
  }

  function renderPanel() {
    const host = document.getElementById('salesCrmBody') || document.getElementById('pageSales');
    if (!host) return;
    const m = model();
    let panel = document.getElementById('phase7jSalesCommercialPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'phase7jSalesCommercialPanel';
      panel.className = 'sc7j-panel';
      host.prepend(panel);
    }
    const tabs = [
      ['overview', 'Overview'],
      ['targets', 'Targets'],
      ['statements', 'Statements'],
      ['cycle', 'Commercial cycle'],
      ['share', 'Share log']
    ];
    const content = activeTab === 'targets' ? renderTargets(m)
      : activeTab === 'statements' ? renderStatements(m)
      : activeTab === 'cycle' ? renderCycle(m)
      : activeTab === 'share' ? renderShare(m)
      : renderOverview(m);
    panel.innerHTML = `
      <div class="sc7j-head">
        <div><h3>Phase 7J Sales Commercial Pack</h3><div class="sc7j-note">Unified commercial layer on the existing Sales page: targets, statements, installments, contracts, work handoff, and manual sharing.</div></div>
        <span class="sc7j-pill ok">foundation</span>
      </div>
      <div class="sc7j-tabs">${tabs.map(t => `<button type="button" class="${activeTab === t[0] ? 'active' : ''}" onclick="SalesCommercialPack.setTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
      <div class="sc7j-content">${content}</div>`;
  }

  function addTarget(month, amount, owner) {
    const s = ensureState(); if (!s) return;
    const targetMonth = month || root.prompt('Target month YYYY-MM:', currentMonth());
    if (!targetMonth) return;
    const raw = amount != null ? amount : root.prompt('Target amount:', '5000000');
    const targetAmount = money(raw);
    if (targetAmount <= 0) { toast('Enter a valid target amount.', 'warning'); return; }
    const existing = s.targets.find(t => t.month === targetMonth);
    if (existing) {
      existing.amount = targetAmount;
      existing.owner = owner || existing.owner || 'Sales';
      existing.updatedAt = now();
    } else {
      s.targets.unshift({ id: uid('tgt'), month: targetMonth, amount: targetAmount, owner: owner || 'Sales', createdAt: now() });
    }
    s.updatedAt = now();
    save();
    renderPanel();
    toast('Sales target saved.', 'success');
  }

  function seedCurrentTarget() {
    const m = model();
    addTarget(m.month, Math.max(m.closed, m.pipeline, 5000000), 'Commercial');
  }

  function createContractFromQuote(quoteId) {
    const o = O(); const s = ensureState(); if (!o || !s) return;
    const q = (crm().quotations || []).find(x => x.id === quoteId);
    if (!q) { toast('Quote not found.', 'warning'); return; }
    if (!o.salesContracts || typeof o.salesContracts !== 'object') o.salesContracts = {};
    if (!Array.isArray(o.salesContracts.contracts)) o.salesContracts.contracts = [];
    let contract = o.salesContracts.contracts.find(c => c.quotationId === q.id);
    if (!contract) {
      contract = {
        id: uid('ctr'),
        reference: 'CTR-' + String(o.salesContracts.contracts.length + 1).padStart(4, '0'),
        quotationId: q.id,
        quotationRef: q.reference || '',
        customerId: q.customerId || '',
        customerName: q.customerName || '',
        total: money(q.total),
        downPayment: 0,
        notes: 'Created from Phase 7J commercial pack',
        status: q.status === 'approved' || q.status === 'converted' ? 'active' : 'draft',
        createdAt: now(),
        sourceType: 'sales_commercial_pack'
      };
      o.salesContracts.contracts.unshift(contract);
    }
    s.workLinks.unshift({ id: uid('link'), type: 'quote_contract', quoteId: q.id, contractId: contract.id, ref: `${q.reference || q.id} -> ${contract.reference}`, createdAt: now() });
    save();
    renderPanel();
    toast('Contract link created for quote.', 'success');
  }

  function createWorkOrderFromOrder(orderId) {
    const o = O(); const s = ensureState(); if (!o || !s) return;
    const order = (crm().salesOrders || []).find(x => x.id === orderId);
    if (!order) { toast('Sales order not found.', 'warning'); return; }
    if (!Array.isArray(o.jobOrders)) o.jobOrders = [];
    let wo = o.jobOrders.find(w => w.salesOrderId === order.id || w.sourceId === order.id);
    if (!wo) {
      const customer = customers().find(c => c.id === order.customerId) || {};
      wo = {
        id: uid('wo'),
        ref: 'WO-SALES-' + String(o.jobOrders.length + 1).padStart(4, '0'),
        title: 'Sales order handoff: ' + (order.reference || order.id),
        jobType: 'sales_handoff',
        jobTypeLabel: 'Sales handoff',
        customerId: order.customerId || '',
        customerSnapshot: { name: order.customerName || customer.name || '', phone: customer.phone || '', whatsapp: customer.whatsapp || customer.phone || '', address: customer.address || '' },
        dims: { quantity: 1, unit: 'job' },
        deadline: '',
        priority: 'normal',
        department: 'Sales / Workshop',
        deliveryType: 'handoff',
        notes: 'Created from Phase 7J commercial pack for ' + (order.reference || order.id),
        attachments: [],
        quotedPrice: money(order.total),
        state: 'draft',
        opPackId: '',
        sopIds: [],
        kanbanCardId: '',
        taskIds: [],
        requiredMaterials: (order.lines || []).map(line => ({ materialId: line.materialId || '', name: line.description || line.name || '', qty: num(line.quantity) || 1, unit: '', required: !!line.materialId })).filter(x => x.name || x.materialId),
        machineIds: [],
        estMachineMinutes: 0,
        estInstallCost: 0,
        qcRequired: false,
        deliveryChecklist: { packaging: false, photos: false, person: '' },
        salesOrderId: order.id,
        sourceType: 'sales_order',
        sourceId: order.id,
        createdAt: now(),
        activityLog: [{ date: now(), text: 'Created by Phase 7J Sales Commercial Pack' }],
        is_active: true
      };
      o.jobOrders.unshift(wo);
      if (typeof root.createTaskInSelectedSpace === 'function') {
        const task = root.createTaskInSelectedSpace('Work handoff: ' + (order.reference || order.id), {
          sourceType: 'sales_order',
          sourceId: order.id,
          workOrderId: wo.id,
          workOrderRef: wo.ref,
          department: 'Sales / Workshop',
          priority: 'normal',
          description: `${order.customerName || ''} - ${fmt(order.total)} ${currency()}`,
          tags: ['sales', 'commercial_pack']
        });
        if (task && task.id) wo.taskIds.push(task.id);
      }
    }
    s.workLinks.unshift({ id: uid('link'), type: 'order_work_order', orderId: order.id, workOrderId: wo.id, ref: `${order.reference || order.id} -> ${wo.ref}`, createdAt: now() });
    save();
    renderPanel();
    toast('Work order handoff created.', 'success');
  }

  function createInstallmentsFromOrder(orderId) {
    const f = finance(); const order = (crm().salesOrders || []).find(x => x.id === orderId);
    if (!order) { toast('Sales order not found.', 'warning'); return; }
    if (!Array.isArray(f.installmentPlans)) f.installmentPlans = [];
    const existing = f.installmentPlans.find(p => p.sourceType === 'sales_order' && p.sourceId === order.id);
    if (existing) { toast('Installment plan already exists for this order.', 'info'); return; }
    const total = money(order.total);
    const down = money(root.prompt('Down payment:', String(Math.round(total * 0.25))) || 0);
    const count = Math.max(1, money(root.prompt('Installment count:', '4') || 4));
    const remaining = Math.max(0, total - down);
    const per = Math.round(remaining / count);
    const lines = [];
    const d = new Date();
    for (let i = 0; i < count; i++) {
      d.setMonth(d.getMonth() + 1);
      lines.push({ id: uid('inst'), dueDate: d.toISOString().slice(0, 10), amount: i === count - 1 ? remaining - (per * (count - 1)) : per, paidAmount: 0, status: 'pending', createdAt: now() });
    }
    f.installmentPlans.unshift({
      id: uid('plan'),
      reference: 'SO-INST-' + (order.reference || order.id),
      customerId: order.customerId || '',
      customerName: order.customerName || getCustomerName(order.customerId),
      totalAmount: total,
      downPayment: down,
      status: 'active',
      sourceType: 'sales_order',
      sourceId: order.id,
      lines,
      createdAt: now()
    });
    save();
    renderPanel();
    toast('Installment plan created from sales order.', 'success');
  }

  function buildShare(entity, channel) {
    const ref = entity.reference || entity.id;
    const customer = entity.customerName || getCustomerName(entity.customerId) || '';
    const total = fmt(entity.total);
    return `Octagon Sales\nRef: ${ref}\nCustomer: ${customer}\nTotal: ${total} ${currency()}\nStatus: ${entity.status || ''}`;
  }

  function shareQuote(quoteId, channel) {
    const s = ensureState(); const q = (crm().quotations || []).find(x => x.id === quoteId);
    if (!s || !q) return;
    const text = buildShare(q, channel || 'whatsapp');
    const item = { id: uid('share'), channel: channel || 'whatsapp', entityType: 'quotation', entityId: q.id, entityRef: q.reference || q.id, customerName: q.customerName || '', text, createdAt: now() };
    s.shareLog.unshift(item);
    save();
    renderPanel();
    copyText(text);
    if ((channel || 'whatsapp') === 'whatsapp') {
      const phone = (customers().find(c => c.id === q.customerId) || {}).whatsapp || (customers().find(c => c.id === q.customerId) || {}).phone || '';
      const url = 'https://wa.me/' + String(phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
      try { root.open(url, '_blank'); } catch (_) {}
    } else if (channel === 'email') {
      try { root.location.href = 'mailto:?subject=' + encodeURIComponent('Sales quote ' + (q.reference || q.id)) + '&body=' + encodeURIComponent(text); } catch (_) {}
    }
    toast('Share draft prepared and copied.', 'success');
  }

  function copyText(text) {
    if (root.navigator?.clipboard?.writeText) {
      root.navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function copyShare(id) {
    const s = ensureState(); const item = s?.shareLog.find(x => x.id === id);
    if (!item) return;
    copyText(item.text || '');
    toast('Share text copied.', 'success');
  }

  function selectCustomer(id) {
    selectedCustomerId = id || '';
    renderPanel();
  }

  function copyStatement() {
    const name = getCustomerName(selectedCustomerId) || 'Customer';
    let balance = 0;
    const lines = statementRows(selectedCustomerId).map(r => {
      balance += money(r.debit) - money(r.credit);
      return `${String(r.date).slice(0, 10)} | ${r.ref} | ${r.type} | Dr ${money(r.debit)} | Cr ${money(r.credit)} | Bal ${balance}`;
    });
    copyText(['Statement: ' + name, ...lines].join('\n'));
    toast('Customer statement copied.', 'success');
  }

  function setTab(tab) { activeTab = tab || 'overview'; renderPanel(); }

  function wire() {
    if (root.__phase7jSalesCommercialWrapped) return;
    root.__phase7jSalesCommercialWrapped = true;
    const originalRender = root.renderSalesCrmPage;
    if (typeof originalRender === 'function') {
      root.renderSalesCrmPage = function () {
        const result = originalRender.apply(this, arguments);
        setTimeout(renderPanel, 0);
        return result;
      };
    }
    const originalSwitch = root.switchPage;
    if (typeof originalSwitch === 'function') {
      root.switchPage = function (page) {
        const result = originalSwitch.apply(this, arguments);
        if (page === 'sales') setTimeout(renderPanel, 250);
        return result;
      };
    }
  }

  function init() {
    ensureState();
    wire();
    setTimeout(renderPanel, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.SalesCommercialPack = {
    ensureState, model, renderPanel, setTab, addTarget, seedCurrentTarget,
    createContractFromQuote, createWorkOrderFromOrder, createInstallmentsFromOrder,
    shareQuote, copyShare, selectCustomer, copyStatement, version: 'phase7j-v1'
  };
})();
