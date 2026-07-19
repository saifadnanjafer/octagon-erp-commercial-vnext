/*
 * T4.16 Phase 4 extraction: Sales, CRM, quotation, order, and invoice workflow.
 * Loaded before app.js because ensureOmni() calls normalizeSalesCrm() during boot.
 */

function normalizeSalesCrm() {
  if (!omni.salesCrm || typeof omni.salesCrm !== 'object') omni.salesCrm = {};
  const sc = omni.salesCrm;
  if (!Array.isArray(sc.leads)) sc.leads = [];
  if (!Array.isArray(sc.quotations)) sc.quotations = [];
  if (!Array.isArray(sc.salesOrders)) sc.salesOrders = [];

  // Pipeline stages
  if (!Array.isArray(sc.pipelineStages) || !sc.pipelineStages.length) {
    sc.pipelineStages = [
      { id: 'stage_new', name: 'جديد', color: '#818cf8', order: 0 },
      { id: 'stage_qualified', name: 'مؤهل', color: '#38bdf8', order: 1 },
      { id: 'stage_proposal', name: 'عرض سعر مرسل', color: '#facc15', order: 2 },
      { id: 'stage_negotiation', name: 'مفاوضة', color: '#fb923c', order: 3 },
      { id: 'stage_won', name: 'تم الفوز ✅', color: '#34d399', order: 4 },
      { id: 'stage_lost', name: 'خسارة ❌', color: '#f87171', order: 5 }
    ];
  }

  // Normalize existing leads
  sc.leads.forEach(lead => {
    if (!lead.id) lead.id = makeId('lead');
    if (!lead.contactName) lead.contactName = '';
    if (!lead.companyName) lead.companyName = '';
    if (!lead.phone) lead.phone = '';
    if (!lead.email) lead.email = '';
    if (!lead.source) lead.source = 'manual';
    if (!lead.stageId) lead.stageId = 'stage_new';
    if (!lead.priority) lead.priority = 'medium';
    if (lead.expectedRevenue === undefined) lead.expectedRevenue = 0;
    if (!lead.notes) lead.notes = '';
    if (!lead.assignedTo) lead.assignedTo = '';
    if (!lead.customerId) lead.customerId = '';
    if (!lead.createdAt) lead.createdAt = new Date().toISOString();
    if (!lead.updatedAt) lead.updatedAt = lead.createdAt;
    if (!Array.isArray(lead.activityLog)) lead.activityLog = [];
    if (!Array.isArray(lead.tags)) lead.tags = [];
  });

  // Normalize quotations
  sc.quotations.forEach(q => {
    if (!q.id) q.id = makeId('quot');
    if (!q.leadId) q.leadId = '';
    if (!q.customerId) q.customerId = '';
    if (!q.customerName) q.customerName = '';
    if (!q.reference) q.reference = `Q-${Date.now().toString(36).toUpperCase()}`;
    if (!q.status) q.status = 'draft'; // draft, sent, approved, rejected, expired, converted
    if (!Array.isArray(q.lines)) q.lines = [];
    if (q.subtotal === undefined) q.subtotal = 0;
    if (q.discount === undefined) q.discount = 0;
    if (q.discountType === undefined) q.discountType = 'percent'; // percent or fixed
    if (q.tax === undefined) q.tax = 0;
    if (q.total === undefined) q.total = 0;
    if (q.totalCost === undefined) q.totalCost = 0;
    if (q.profitMargin === undefined) q.profitMargin = 0;
    if (!q.notes) q.notes = '';
    if (!q.validUntil) q.validUntil = '';
    if (!q.createdAt) q.createdAt = new Date().toISOString();
    if (!q.updatedAt) q.updatedAt = q.createdAt;
    if (q.approvedAt === undefined) q.approvedAt = '';
    if (q.approvedBy === undefined) q.approvedBy = '';
    if (!Array.isArray(q.activityLog)) q.activityLog = [];

    // Normalize lines
    q.lines.forEach(line => {
      if (!line.id) line.id = makeId('qline');
      if (!line.type) line.type = 'custom'; // oppack, material, service, custom
      if (!line.description) line.description = '';
      if (!line.packId) line.packId = '';
      if (!line.materialId) line.materialId = '';
      if (line.quantity === undefined) line.quantity = 1;
      if (line.unitPrice === undefined) line.unitPrice = 0;
      if (line.unitCost === undefined) line.unitCost = 0;
      if (line.total === undefined) line.total = 0;
    });
  });

  // Normalize sales orders
  sc.salesOrders.forEach(so => {
    if (!so.id) so.id = makeId('so');
    if (!so.quotationId) so.quotationId = '';
    if (!so.leadId) so.leadId = '';
    if (!so.customerId) so.customerId = '';
    if (!so.customerName) so.customerName = '';
    if (!so.reference) so.reference = `SO-${Date.now().toString(36).toUpperCase()}`;
    if (!so.status) so.status = 'confirmed'; // confirmed, in_progress, delivered, invoiced, cancelled
    if (!Array.isArray(so.lines)) so.lines = [];
    if (so.total === undefined) so.total = 0;
    if (so.totalCost === undefined) so.totalCost = 0;
    if (!so.kanbanCardIds) so.kanbanCardIds = [];
    if (!so.taskIds) so.taskIds = [];
    if (!so.createdAt) so.createdAt = new Date().toISOString();
    if (!Array.isArray(so.activityLog)) so.activityLog = [];
  });

  if (!omni.migrationsApplied.includes('sales_crm_v1')) omni.migrationsApplied.push('sales_crm_v1');
}

// ── Helper functions ────────────────────────────────────────────────────────

function getSalesCrm() {
  ensureOmni();
  return omni.salesCrm;
}

function getSalesLeads() { return getSalesCrm().leads; }
function getSalesQuotations() { return getSalesCrm().quotations; }
function getSalesOrders() { return getSalesCrm().salesOrders; }
function getSalesPipelineStages() { return getSalesCrm().pipelineStages; }

function getSalesLeadById(id) { return getSalesLeads().find(l => l.id === id); }
function getSalesQuotationById(id) { return getSalesQuotations().find(q => q.id === id); }
function getSalesOrderById(id) { return getSalesOrders().find(o => o.id === id); }

function getLeadStage(lead) {
  return getSalesPipelineStages().find(s => s.id === lead.stageId) || getSalesPipelineStages()[0];
}

function recalcQuotationTotals(q) {
  q.subtotal = q.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  q.totalCost = q.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  let discountAmount = 0;
  if (q.discountType === 'percent') {
    discountAmount = Math.round(q.subtotal * (Number(q.discount) || 0) / 100);
  } else {
    discountAmount = Number(q.discount) || 0;
  }
  const afterDiscount = q.subtotal - discountAmount;
  const taxAmount = Math.round(afterDiscount * (Number(q.tax) || 0) / 100);
  q.total = afterDiscount + taxAmount;
  q.profitMargin = q.total > 0 ? Math.round(((q.total - q.totalCost) / q.total) * 100) : 0;
  q.lines.forEach(l => { l.total = Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)); });
}

function getSalesCrmKpis() {
  const leads = getSalesLeads();
  const quots = getSalesQuotations();
  const orders = getSalesOrders();

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const activeLeads = leads.filter(l => l.stageId !== 'stage_won' && l.stageId !== 'stage_lost');
  const wonLeads = leads.filter(l => l.stageId === 'stage_won');
  const lostLeads = leads.filter(l => l.stageId === 'stage_lost');
  const conversionRate = (wonLeads.length + lostLeads.length) > 0 ? Math.round((wonLeads.length / (wonLeads.length + lostLeads.length)) * 100) : 0;

  const openQuots = quots.filter(q => q.status === 'draft' || q.status === 'sent');
  const approvedQuots = quots.filter(q => q.status === 'approved' || q.status === 'converted');
  const totalPipeline = activeLeads.reduce((s, l) => s + (Number(l.expectedRevenue) || 0), 0);
  const totalQuoted = openQuots.reduce((s, q) => s + (Number(q.total) || 0), 0);
  const totalSold = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgMargin = approvedQuots.length > 0 ? Math.round(approvedQuots.reduce((s, q) => s + (q.profitMargin || 0), 0) / approvedQuots.length) : 0;

  return {
    activeLeads: activeLeads.length,
    wonLeads: wonLeads.length,
    lostLeads: lostLeads.length,
    conversionRate,
    openQuots: openQuots.length,
    approvedQuots: approvedQuots.length,
    totalOrders: orders.length,
    totalPipeline,
    totalQuoted,
    totalSold,
    avgMargin
  };
}

// ── Main Render ─────────────────────────────────────────────────────────────

let salesCrmActiveTab = 'pipeline';

function renderSalesCrmPage() {
  ensureOmni();
  const body = document.getElementById('salesCrmBody');
  if (!body) return;

  const kpis = getSalesCrmKpis();
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';

  body.innerHTML = `
    <!-- KPI Strip -->
    <div class="sales-kpi-strip">
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon" style="background:rgba(129,140,248,0.15);color:#818cf8"><i class="fa-solid fa-user-plus"></i></div>
        <div class="sales-kpi-info"><span class="sales-kpi-value">${kpis.activeLeads}</span><span class="sales-kpi-label">عملاء محتملون نشطون</span></div>
      </div>
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon" style="background:rgba(250,204,21,0.15);color:#facc15"><i class="fa-solid fa-file-invoice"></i></div>
        <div class="sales-kpi-info"><span class="sales-kpi-value">${kpis.openQuots}</span><span class="sales-kpi-label">عروض أسعار مفتوحة</span></div>
      </div>
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon" style="background:rgba(52,211,153,0.15);color:#34d399"><i class="fa-solid fa-handshake"></i></div>
        <div class="sales-kpi-info"><span class="sales-kpi-value">${kpis.totalOrders}</span><span class="sales-kpi-label">طلبات مبيعات</span></div>
      </div>
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon" style="background:rgba(56,189,248,0.15);color:#38bdf8"><i class="fa-solid fa-chart-line"></i></div>
        <div class="sales-kpi-info"><span class="sales-kpi-value">${kpis.conversionRate}%</span><span class="sales-kpi-label">نسبة التحويل</span></div>
      </div>
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon" style="background:rgba(251,146,60,0.15);color:#fb923c"><i class="fa-solid fa-coins"></i></div>
        <div class="sales-kpi-info"><span class="sales-kpi-value">${kpis.totalPipeline.toLocaleString()}</span><span class="sales-kpi-label">قيمة الأنبوب ${currency}</span></div>
      </div>
      <div class="sales-kpi-card">
        <div class="sales-kpi-icon" style="background:rgba(168,85,247,0.15);color:#a855f7"><i class="fa-solid fa-percent"></i></div>
        <div class="sales-kpi-info"><span class="sales-kpi-value">${kpis.avgMargin}%</span><span class="sales-kpi-label">متوسط هامش الربح</span></div>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="sales-tabs">
      <button class="sales-tab ${salesCrmActiveTab === 'pipeline' ? 'active' : ''}" onclick="switchSalesCrmTab('pipeline')">
        <i class="fa-solid fa-diagram-project"></i> خط الأنابيب
      </button>
      <button class="sales-tab ${salesCrmActiveTab === 'leads' ? 'active' : ''}" onclick="switchSalesCrmTab('leads')">
        <i class="fa-solid fa-users"></i> العملاء المحتملون <span class="sales-tab-badge">${kpis.activeLeads}</span>
      </button>
      <button class="sales-tab ${salesCrmActiveTab === 'quotations' ? 'active' : ''}" onclick="switchSalesCrmTab('quotations')">
        <i class="fa-solid fa-file-invoice-dollar"></i> عروض الأسعار <span class="sales-tab-badge">${kpis.openQuots}</span>
      </button>
      <button class="sales-tab ${salesCrmActiveTab === 'orders' ? 'active' : ''}" onclick="switchSalesCrmTab('orders')">
        <i class="fa-solid fa-cart-shopping"></i> طلبات المبيعات <span class="sales-tab-badge">${kpis.totalOrders}</span>
      </button>
      <button class="sales-tab ${salesCrmActiveTab === 'invoices' ? 'active' : ''}" onclick="switchSalesCrmTab('invoices')">
        <i class="fa-solid fa-file-invoice-dollar"></i> الفواتير <span class="sales-tab-badge">${(getSalesCrm().invoices || []).length}</span>
      </button>
    </div>

    <!-- Tab Content -->
    <div id="salesCrmTabContent"></div>
  `;

  renderSalesCrmTabContent();
}

function switchSalesCrmTab(tab) {
  salesCrmActiveTab = tab;
  renderSalesCrmPage();
}

function renderSalesCrmTabContent() {
  const container = document.getElementById('salesCrmTabContent');
  if (!container) return;
  switch (salesCrmActiveTab) {
    case 'pipeline': renderSalesPipeline(container); break;
    case 'leads': renderSalesLeadsList(container); break;
    case 'quotations': renderSalesQuotationsList(container); break;
    case 'orders': renderSalesOrdersList(container); break;
    case 'invoices': renderSalesInvoicesList(container); break;
  }
}

// ── Pipeline (Kanban-style) ─────────────────────────────────────────────────

function renderSalesPipeline(container) {
  const stages = getSalesPipelineStages().filter(s => s.id !== 'stage_lost');
  const leads = getSalesLeads();
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';

  container.innerHTML = `
    <div class="sales-pipeline-toolbar">
      <button class="btn-primary" onclick="addSalesLead()"><i class="fa-solid fa-plus"></i> عميل محتمل جديد</button>
      <button class="btn-secondary" onclick="addSalesLeadFromWhatsApp()"><i class="fa-brands fa-whatsapp"></i> من WhatsApp</button>
    </div>
    <div class="sales-pipeline-board">
      ${stages.map(stage => {
        const stageLeads = leads.filter(l => l.stageId === stage.id);
        const stageTotal = stageLeads.reduce((s, l) => s + (Number(l.expectedRevenue) || 0), 0);
        return `
          <div class="sales-pipeline-column" data-stage="${stage.id}">
            <div class="sales-pipeline-col-header" style="border-top: 3px solid ${stage.color}">
              <div class="sales-pipeline-col-title">
                <span>${stage.name}</span>
                <span class="sales-pipeline-count">${stageLeads.length}</span>
              </div>
              <div class="sales-pipeline-col-value">${stageTotal.toLocaleString()} ${currency}</div>
            </div>
            <div class="sales-pipeline-col-body">
              ${stageLeads.length === 0 ? '<div class="sales-pipeline-empty">لا يوجد عملاء في هذه المرحلة</div>' :
                stageLeads.map(lead => renderPipelineCard(lead, stage)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderPipelineCard(lead, stage) {
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';
  const priorityColors = { high: '#f87171', medium: '#facc15', low: '#94a3b8' };
  const priorityLabels = { high: 'عالي', medium: 'متوسط', low: 'منخفض' };
  const sourceIcons = { manual: 'fa-pen', whatsapp: 'fa-brands fa-whatsapp', website: 'fa-globe', referral: 'fa-user-group' };
  const daysSince = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);

  return `
    <div class="sales-pipeline-card glass-card" onclick="openSalesLeadInspector('${lead.id}')">
      <div class="sales-pipeline-card-header">
        <span class="sales-pipeline-card-name">${escapeHtml(lead.contactName || 'بدون اسم')}</span>
        <span class="sales-pipeline-priority" style="color:${priorityColors[lead.priority] || '#94a3b8'}" title="${priorityLabels[lead.priority] || ''}">
          <i class="fa-solid fa-circle"></i>
        </span>
      </div>
      ${lead.companyName ? `<div class="sales-pipeline-card-company">${escapeHtml(lead.companyName)}</div>` : ''}
      <div class="sales-pipeline-card-revenue">
        <i class="fa-solid fa-coins"></i> ${(Number(lead.expectedRevenue) || 0).toLocaleString()} ${currency}
      </div>
      <div class="sales-pipeline-card-meta">
        <span><i class="fa-solid ${sourceIcons[lead.source] || 'fa-pen'}"></i> ${lead.source === 'whatsapp' ? 'واتساب' : lead.source === 'referral' ? 'إحالة' : 'يدوي'}</span>
        <span><i class="fa-regular fa-clock"></i> ${daysSince} يوم</span>
      </div>
      ${lead.tags.length ? `<div class="sales-pipeline-card-tags">${lead.tags.map(t => `<span class="sales-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="sales-pipeline-card-actions">
        ${lead.stageId !== 'stage_won' ? `<button class="sales-card-btn" onclick="event.stopPropagation(); moveSalesLead('${lead.id}', 'next')" title="نقل للمرحلة التالية"><i class="fa-solid fa-arrow-left"></i></button>` : ''}
        ${lead.stageId !== 'stage_won' && lead.stageId !== 'stage_proposal' ? '' : `<button class="sales-card-btn sales-card-btn-quote" onclick="event.stopPropagation(); createQuotationFromLead('${lead.id}')" title="إنشاء عرض سعر"><i class="fa-solid fa-file-invoice-dollar"></i></button>`}
        <button class="sales-card-btn sales-card-btn-lost" onclick="event.stopPropagation(); markLeadLost('${lead.id}')" title="خسارة"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
  `;
}

// ── Leads List ──────────────────────────────────────────────────────────────

function renderSalesLeadsList(container) {
  const leads = getSalesLeads();
  const stages = getSalesPipelineStages();
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';

  container.innerHTML = `
    <div class="sales-list-toolbar">
      <button class="btn-primary" onclick="addSalesLead()"><i class="fa-solid fa-plus"></i> عميل محتمل جديد</button>
      <input type="text" class="sales-search" id="salesLeadSearch" placeholder="بحث بالاسم أو الشركة أو الهاتف..." oninput="filterSalesLeads()">
    </div>
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>الشركة</th>
            <th>الهاتف</th>
            <th>المرحلة</th>
            <th>الأولوية</th>
            <th>الإيراد المتوقع</th>
            <th>المصدر</th>
            <th>المسؤول</th>
            <th>التاريخ</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody id="salesLeadsTableBody">
          ${leads.length === 0 ? '<tr><td colspan="10" class="sales-empty">لا يوجد عملاء محتملون بعد. أضف أول عميل!</td></tr>' :
            leads.map(lead => {
              const stage = stages.find(s => s.id === lead.stageId) || stages[0];
              const priorityLabels = { high: '🔴 عالي', medium: '🟡 متوسط', low: '⚪ منخفض' };
              const sourceLabels = { manual: '✍️ يدوي', whatsapp: '📱 واتساب', referral: '👥 إحالة', website: '🌐 موقع' };
              return `
                <tr class="sales-lead-row" onclick="openSalesLeadInspector('${lead.id}')">
                  <td><strong>${escapeHtml(lead.contactName || '-')}</strong></td>
                  <td>${escapeHtml(lead.companyName || '-')}</td>
                  <td style="direction:ltr;text-align:right">${escapeHtml(lead.phone || '-')}</td>
                  <td><span class="sales-stage-chip" style="background:${stage.color}22;color:${stage.color};border:1px solid ${stage.color}44">${stage.name}</span></td>
                  <td>${priorityLabels[lead.priority] || '-'}</td>
                  <td>${(Number(lead.expectedRevenue) || 0).toLocaleString()} ${currency}</td>
                  <td>${sourceLabels[lead.source] || lead.source}</td>
                  <td>${escapeHtml(lead.assignedTo || '-')}</td>
                  <td>${new Date(lead.createdAt).toLocaleDateString('ar-IQ')}</td>
                  <td>
                    <button class="sales-action-btn" onclick="event.stopPropagation(); deleteSalesLead('${lead.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>
              `;
            }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function filterSalesLeads() {
  const q = (document.getElementById('salesLeadSearch')?.value || '').toLowerCase();
  document.querySelectorAll('.sales-lead-row').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ── Quotations List ─────────────────────────────────────────────────────────

function renderSalesQuotationsList(container) {
  const quots = getSalesQuotations();
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';
  const statusLabels = { draft: '📝 مسودة', sent: '📤 مرسل', approved: '✅ معتمد', rejected: '❌ مرفوض', expired: '⏰ منتهي', converted: '🔄 محوّل لطلب' };
  const statusColors = { draft: '#94a3b8', sent: '#38bdf8', approved: '#34d399', rejected: '#f87171', expired: '#fb923c', converted: '#a855f7' };

  container.innerHTML = `
    <div class="sales-list-toolbar">
      <button class="btn-primary" onclick="addSalesQuotation()"><i class="fa-solid fa-plus"></i> عرض سعر جديد</button>
    </div>
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead>
          <tr>
            <th>المرجع</th>
            <th>العميل</th>
            <th>الحالة</th>
            <th>عدد البنود</th>
            <th>المجموع الفرعي</th>
            <th>الإجمالي</th>
            <th>الكلفة</th>
            <th>هامش الربح</th>
            <th>صالح حتى</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${quots.length === 0 ? '<tr><td colspan="10" class="sales-empty">لا توجد عروض أسعار بعد.</td></tr>' :
            quots.map(q => {
              const marginClass = q.profitMargin >= 30 ? 'margin-good' : q.profitMargin >= 15 ? 'margin-ok' : 'margin-low';
              return `
                <tr class="sales-quot-row" onclick="openSalesQuotationEditor('${q.id}')">
                  <td><strong>${escapeHtml(q.reference)}</strong></td>
                  <td>${escapeHtml(q.customerName || '-')}</td>
                  <td><span class="sales-status-chip" style="background:${statusColors[q.status] || '#94a3b8'}22;color:${statusColors[q.status] || '#94a3b8'};border:1px solid ${statusColors[q.status] || '#94a3b8'}44">${statusLabels[q.status] || q.status}</span></td>
                  <td>${q.lines.length}</td>
                  <td>${(q.subtotal || 0).toLocaleString()} ${currency}</td>
                  <td><strong>${(q.total || 0).toLocaleString()} ${currency}</strong></td>
                  <td>${(q.totalCost || 0).toLocaleString()} ${currency}</td>
                  <td><span class="sales-margin-chip ${marginClass}">${q.profitMargin || 0}%</span></td>
                  <td>${q.validUntil ? new Date(q.validUntil).toLocaleDateString('ar-IQ') : '-'}</td>
                  <td>
                    ${q.status === 'draft' || q.status === 'sent' ? `<button class="sales-action-btn sales-action-approve" onclick="event.stopPropagation(); approveSalesQuotation('${q.id}')" title="اعتماد"><i class="fa-solid fa-check"></i></button>` : ''}
                    ${q.status === 'approved' ? `<button class="sales-action-btn sales-action-convert" onclick="event.stopPropagation(); convertQuotationToOrder('${q.id}')" title="تحويل لطلب"><i class="fa-solid fa-cart-plus"></i></button>` : ''}
                    <button class="sales-action-btn" onclick="event.stopPropagation(); deleteSalesQuotation('${q.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>
              `;
            }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Orders List ─────────────────────────────────────────────────────────────

function renderSalesOrdersList(container) {
  const orders = getSalesOrders();
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';
  const statusLabels = { confirmed: '✅ مؤكد', in_progress: '🔄 قيد التنفيذ', delivered: '📦 تم التسليم', invoiced: '🧾 مفوتر', cancelled: '❌ ملغي' };
  const statusColors = { confirmed: '#34d399', in_progress: '#38bdf8', delivered: '#a855f7', invoiced: '#facc15', cancelled: '#f87171' };

  container.innerHTML = `
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead>
          <tr>
            <th>المرجع</th>
            <th>العميل</th>
            <th>الحالة</th>
            <th>الإجمالي</th>
            <th>الكلفة</th>
            <th>بطاقات كانبان</th>
            <th>مهام</th>
            <th>التاريخ</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${orders.length === 0 ? '<tr><td colspan="9" class="sales-empty">لا توجد طلبات مبيعات بعد. أنشئ عرض سعر واعتمده ثم حوّله لطلب.</td></tr>' :
            orders.map(so => {
              return `
                <tr class="sales-order-row">
                  <td><strong>${escapeHtml(so.reference)}</strong></td>
                  <td>${escapeHtml(so.customerName || '-')}</td>
                  <td><span class="sales-status-chip" style="background:${statusColors[so.status] || '#94a3b8'}22;color:${statusColors[so.status] || '#94a3b8'};border:1px solid ${statusColors[so.status] || '#94a3b8'}44">${statusLabels[so.status] || so.status}</span></td>
                  <td><strong>${(so.total || 0).toLocaleString()} ${currency}</strong></td>
                  <td>${(so.totalCost || 0).toLocaleString()} ${currency}</td>
                  <td>${(so.kanbanCardIds || []).length} بطاقات</td>
                  <td>${(so.taskIds || []).length} مهام</td>
                  <td>${new Date(so.createdAt).toLocaleDateString('ar-IQ')}</td>
                  <td>
                    ${so.status === 'confirmed' ? `<button class="sales-action-btn" onclick="startSalesOrder('${so.id}')" title="بدء التنفيذ"><i class="fa-solid fa-play"></i></button>` : ''}
                    ${so.status === 'in_progress' ? `<button class="sales-action-btn" onclick="deliverSalesOrder('${so.id}')" title="تسليم"><i class="fa-solid fa-truck"></i></button>` : ''}
                    ${so.status === 'delivered' ? `<button class="sales-action-btn sales-action-convert" onclick="invoiceSalesOrder('${so.id}')" title="إصدار فاتورة وتسجيلها على حساب العميل"><i class="fa-solid fa-file-invoice-dollar"></i></button>` : ''}
                    ${so.status === 'invoiced' && so.invoiceId ? `<button class="sales-action-btn sales-action-approve" onclick="promptSalesInvoicePayment('${so.invoiceId}')" title="تسجيل دفعة من العميل"><i class="fa-solid fa-money-bill-wave"></i></button>` : ''}
                    ${so.status === 'invoiced' && so.invoiceId ? `<button class="sales-action-btn" onclick="printSalesInvoice('${so.invoiceId}')" title="طباعة الفاتورة"><i class="fa-solid fa-print"></i></button>` : ''}
                    <button class="sales-action-btn" onclick="shareCustomerPortalLink('${so.customerId}', '${so.reference}')" title="مشاركة رابط المتابعة عبر واتساب" style="background:rgba(34,197,94,0.1); color:#22c55e; border:1px solid rgba(34,197,94,0.2);"><i class="fa-brands fa-whatsapp"></i></button>
                  </td>
                </tr>
              `;
            }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── CRUD: Leads ─────────────────────────────────────────────────────────────

async function addSalesLead() {
  ensureOmni();
  const name = await showOmniPrompt('اسم العميل المحتمل:');
  if (!name) return;
  const lead = {
    id: makeId('lead'),
    contactName: name.trim(),
    companyName: '',
    phone: '',
    email: '',
    source: 'manual',
    stageId: 'stage_new',
    priority: 'medium',
    expectedRevenue: 0,
    notes: '',
    assignedTo: '',
    customerId: '',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء العميل المحتمل: ${name.trim()}` }]
  };
  getSalesLeads().push(lead);
  saveData();
  renderSalesCrmPage();
  openSalesLeadInspector(lead.id);
  showToast(`تم إضافة "${name.trim()}" كعميل محتمل جديد`, 'success');
}

function addSalesLeadFromWhatsApp() {
  const pending = (omni.whatsapp?.messages || []).filter(m => m.status === 'pending' || !m.status);
  if (!pending.length) {
    showToast('لا توجد رسائل واتساب معلقة. أضف رسالة من صفحة WhatsApp أولاً.', 'warning');
    return;
  }
  const msg = pending[0];
  const lead = {
    id: makeId('lead'),
    contactName: msg.senderName || msg.sender || 'عميل واتساب',
    companyName: '',
    phone: msg.sender || '',
    email: '',
    source: 'whatsapp',
    stageId: 'stage_new',
    priority: 'medium',
    expectedRevenue: 0,
    notes: `رسالة واتساب: ${msg.text || msg.body || ''}`.slice(0, 500),
    assignedTo: '',
    customerId: '',
    tags: ['واتساب'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء من رسالة واتساب` }]
  };
  getSalesLeads().push(lead);
  saveData();
  renderSalesCrmPage();
  showToast(`تم إنشاء عميل محتمل من واتساب: ${lead.contactName}`, 'success');
}

function moveSalesLead(leadId, direction) {
  const lead = getSalesLeadById(leadId);
  if (!lead) return;
  const stages = getSalesPipelineStages().filter(s => s.id !== 'stage_lost');
  const currentIdx = stages.findIndex(s => s.id === lead.stageId);
  const nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
  if (nextIdx < 0 || nextIdx >= stages.length) return;
  const newStage = stages[nextIdx];
  lead.stageId = newStage.id;
  lead.updatedAt = new Date().toISOString();
  lead.activityLog.push({ date: new Date().toISOString(), text: `تم نقل إلى مرحلة: ${newStage.name}` });
  saveData();
  renderSalesCrmPage();
  showToast(`تم نقل "${lead.contactName}" إلى: ${newStage.name}`, 'success');
}

function markLeadLost(leadId) {
  const lead = getSalesLeadById(leadId);
  if (!lead) return;
  if (!confirm(`هل تريد تسجيل "${lead.contactName}" كخسارة؟`)) return;
  lead.stageId = 'stage_lost';
  lead.updatedAt = new Date().toISOString();
  lead.activityLog.push({ date: new Date().toISOString(), text: 'تم تسجيل كخسارة' });
  saveData();
  renderSalesCrmPage();
  showToast(`تم تسجيل "${lead.contactName}" كخسارة`, 'warning');
}

function deleteSalesLead(leadId) {
  if (!confirm('هل تريد حذف هذا العميل المحتمل؟')) return;
  const sc = getSalesCrm();
  sc.leads = sc.leads.filter(l => l.id !== leadId);
  saveData();
  renderSalesCrmPage();
  showToast('تم حذف العميل المحتمل', 'info');
}

// ── Lead Inspector ──────────────────────────────────────────────────────────

function openSalesLeadInspector(leadId) {
  const lead = getSalesLeadById(leadId);
  if (!lead) return;
  const stages = getSalesPipelineStages();
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';
  const priorityOptions = [
    { value: 'high', label: '🔴 عالي' },
    { value: 'medium', label: '🟡 متوسط' },
    { value: 'low', label: '⚪ منخفض' }
  ];
  const sourceOptions = [
    { value: 'manual', label: '✍️ يدوي' },
    { value: 'whatsapp', label: '📱 واتساب' },
    { value: 'referral', label: '👥 إحالة' },
    { value: 'website', label: '🌐 موقع' }
  ];

  // Use the existing inspector system
  const overlay = document.getElementById('inspectorOverlay');
  const panel = document.getElementById('inspectorPanel');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!overlay || !panel) return;

  overlay.classList.remove('hidden');
  panel.classList.remove('hidden');
  title.textContent = `عميل محتمل: ${lead.contactName}`;
  tabs.innerHTML = '';

  body.innerHTML = `
    <div class="sales-inspector-form">
      <div class="sales-form-group">
        <label>الاسم</label>
        <input type="text" value="${escapeHtml(lead.contactName)}" onchange="updateSalesLead('${lead.id}', 'contactName', this.value)">
      </div>
      <div class="sales-form-group">
        <label>الشركة</label>
        <input type="text" value="${escapeHtml(lead.companyName)}" onchange="updateSalesLead('${lead.id}', 'companyName', this.value)">
      </div>
      <div class="sales-form-row">
        <div class="sales-form-group">
          <label>الهاتف</label>
          <input type="text" value="${escapeHtml(lead.phone)}" onchange="updateSalesLead('${lead.id}', 'phone', this.value)" style="direction:ltr">
        </div>
        <div class="sales-form-group">
          <label>البريد الإلكتروني</label>
          <input type="email" value="${escapeHtml(lead.email)}" onchange="updateSalesLead('${lead.id}', 'email', this.value)" style="direction:ltr">
        </div>
      </div>
      <div class="sales-form-row">
        <div class="sales-form-group">
          <label>المرحلة</label>
          <select onchange="updateSalesLead('${lead.id}', 'stageId', this.value)">
            ${stages.map(s => `<option value="${s.id}" ${lead.stageId === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="sales-form-group">
          <label>الأولوية</label>
          <select onchange="updateSalesLead('${lead.id}', 'priority', this.value)">
            ${priorityOptions.map(p => `<option value="${p.value}" ${lead.priority === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="sales-form-row">
        <div class="sales-form-group">
          <label>الإيراد المتوقع (${currency})</label>
          <input type="number" value="${lead.expectedRevenue}" onchange="updateSalesLead('${lead.id}', 'expectedRevenue', Number(this.value))">
        </div>
        <div class="sales-form-group">
          <label>المصدر</label>
          <select onchange="updateSalesLead('${lead.id}', 'source', this.value)">
            ${sourceOptions.map(s => `<option value="${s.value}" ${lead.source === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="sales-form-group">
        <label>المسؤول</label>
        <input type="text" value="${escapeHtml(lead.assignedTo)}" onchange="updateSalesLead('${lead.id}', 'assignedTo', this.value)">
      </div>
      <div class="sales-form-group">
        <label>علامات (مفصولة بفاصلة)</label>
        <input type="text" value="${escapeHtml(lead.tags.join(', '))}" onchange="updateSalesLead('${lead.id}', 'tags', this.value.split(',').map(t=>t.trim()).filter(Boolean))">
      </div>
      <div class="sales-form-group">
        <label>ملاحظات</label>
        <textarea rows="3" onchange="updateSalesLead('${lead.id}', 'notes', this.value)">${escapeHtml(lead.notes)}</textarea>
      </div>
      <div class="sales-inspector-actions">
        <button class="btn-primary" onclick="createQuotationFromLead('${lead.id}')"><i class="fa-solid fa-file-invoice-dollar"></i> إنشاء عرض سعر</button>
        <button class="btn-secondary" onclick="convertLeadToCustomer('${lead.id}')"><i class="fa-solid fa-user-check"></i> تحويل لعميل رسمي</button>
      </div>
      ${lead.activityLog.length ? `
        <div class="sales-activity-log">
          <h4><i class="fa-solid fa-clock-rotate-left"></i> سجل النشاط</h4>
          ${lead.activityLog.slice().reverse().map(a => `<div class="sales-activity-item"><span class="sales-activity-date">${new Date(a.date).toLocaleString('ar-IQ')}</span><span>${escapeHtml(a.text)}</span></div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function updateSalesLead(leadId, field, value) {
  const lead = getSalesLeadById(leadId);
  if (!lead) return;
  lead[field] = value;
  lead.updatedAt = new Date().toISOString();
  saveData();
}

function convertLeadToCustomer(leadId) {
  const lead = getSalesLeadById(leadId);
  if (!lead) return;
  ensureFinance();
  // Check if customer already exists
  let customer = finance.customers.find(c => c.name === lead.contactName || (lead.phone && c.phone === lead.phone));
  if (customer) {
    lead.customerId = customer.id;
    showToast(`العميل "${lead.contactName}" موجود بالفعل في نظام المالية`, 'info');
  } else {
    customer = {
      id: makeId('cust'),
      name: lead.contactName,
      companyName: lead.companyName || '',
      shopName: '',
      phone: lead.phone || '',
      openingBalance: 0,
      notes: `تم التحويل من CRM. المصدر: ${lead.source}`,
      balanceDirection: ''
    };
    finance.customers.push(customer);
    lead.customerId = customer.id;
    showToast(`تم إنشاء عميل جديد: "${lead.contactName}" في نظام المالية`, 'success');
  }
  lead.stageId = 'stage_qualified';
  lead.updatedAt = new Date().toISOString();
  lead.activityLog.push({ date: new Date().toISOString(), text: `تم تحويل إلى عميل رسمي في النظام المالي` });
  saveData();
  renderSalesCrmPage();
}

// ── CRUD: Quotations ────────────────────────────────────────────────────────

async function addSalesQuotation(leadId) {
  ensureOmni(); ensureFinance();
  const lead = leadId ? getSalesLeadById(leadId) : null;
  const refNum = `Q-${(getSalesQuotations().length + 1).toString().padStart(4, '0')}`;
  const q = {
    id: makeId('quot'),
    leadId: lead?.id || '',
    customerId: lead?.customerId || '',
    customerName: lead?.contactName || '',
    reference: refNum,
    status: 'draft',
    lines: [],
    subtotal: 0, discount: 0, discountType: 'percent', tax: 0,
    total: 0, totalCost: 0, profitMargin: 0,
    notes: '',
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: '', approvedBy: '',
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء عرض سعر ${refNum}` }]
  };
  getSalesQuotations().push(q);
  saveData();
  openSalesQuotationEditor(q.id);
  showToast(`تم إنشاء عرض سعر ${refNum}`, 'success');
}

function createQuotationFromLead(leadId) {
  addSalesQuotation(leadId);
}

function openSalesQuotationEditor(quotId) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  const packs = (omni.opPacks || []);
  const materials = (omni.materials || []);
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';

  // Use the existing inspector system
  const overlay = document.getElementById('inspectorOverlay');
  const panel = document.getElementById('inspectorPanel');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!overlay || !panel) return;

  overlay.classList.remove('hidden');
  panel.classList.remove('hidden');
  title.textContent = `عرض سعر: ${q.reference}`;
  tabs.innerHTML = '';

  const isEditable = q.status === 'draft' || q.status === 'sent';
  const marginClass = q.profitMargin >= 30 ? 'margin-good' : q.profitMargin >= 15 ? 'margin-ok' : 'margin-low';

  body.innerHTML = `
    <div class="sales-quot-editor">
      <!-- Header Info -->
      <div class="sales-quot-header-info">
        <div class="sales-form-row">
          <div class="sales-form-group">
            <label>العميل</label>
            <input type="text" value="${escapeHtml(q.customerName)}" ${isEditable ? `onchange="updateSalesQuotation('${q.id}', 'customerName', this.value)"` : 'readonly'}>
          </div>
          <div class="sales-form-group">
            <label>صالح حتى</label>
            <input type="date" value="${q.validUntil}" ${isEditable ? `onchange="updateSalesQuotation('${q.id}', 'validUntil', this.value)"` : 'readonly'}>
          </div>
        </div>
      </div>

      <!-- Quotation Lines -->
      <div class="sales-quot-lines-header">
        <h4><i class="fa-solid fa-list"></i> بنود عرض السعر</h4>
        ${isEditable ? `
          <div class="sales-quot-add-btns">
            <button class="btn-primary btn-sm" onclick="addQuotationLine('${q.id}', 'oppack')"><i class="fa-solid fa-box"></i> باقة عمليات</button>
            <button class="btn-secondary btn-sm" onclick="addQuotationLine('${q.id}', 'material')"><i class="fa-solid fa-cube"></i> مادة</button>
            <button class="btn-secondary btn-sm" onclick="addQuotationLine('${q.id}', 'service')"><i class="fa-solid fa-wrench"></i> خدمة</button>
            <button class="btn-secondary btn-sm" onclick="addQuotationLine('${q.id}', 'custom')"><i class="fa-solid fa-pen"></i> بند مخصص</button>
          </div>
        ` : ''}
      </div>

      <div class="sales-quot-lines-table">
        <table class="sales-table sales-table-compact">
          <thead>
            <tr>
              <th>النوع</th>
              <th>الوصف</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>كلفة الوحدة</th>
              <th>المجموع</th>
              ${isEditable ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${q.lines.length === 0 ? `<tr><td colspan="${isEditable ? 7 : 6}" class="sales-empty">لا توجد بنود بعد. أضف باقة عمليات أو خدمة أو مادة.</td></tr>` :
              q.lines.map((line, idx) => {
                const typeIcons = { oppack: '📦', material: '🧱', service: '🔧', custom: '📝' };
                const typeLabels = { oppack: 'باقة', material: 'مادة', service: 'خدمة', custom: 'مخصص' };
                return `
                  <tr>
                    <td><span class="sales-line-type">${typeIcons[line.type] || '📝'} ${typeLabels[line.type] || line.type}</span></td>
                    <td>${isEditable ? `<input type="text" value="${escapeHtml(line.description)}" onchange="updateQuotationLine('${q.id}', ${idx}, 'description', this.value)" class="sales-line-input">` : escapeHtml(line.description)}</td>
                    <td>${isEditable ? `<input type="number" value="${line.quantity}" min="0.01" step="0.01" onchange="updateQuotationLine('${q.id}', ${idx}, 'quantity', Number(this.value))" class="sales-line-input sales-line-num">` : line.quantity}</td>
                    <td>${isEditable ? `<input type="number" value="${line.unitPrice}" min="0" onchange="updateQuotationLine('${q.id}', ${idx}, 'unitPrice', Number(this.value))" class="sales-line-input sales-line-num">` : line.unitPrice.toLocaleString()}</td>
                    <td>${isEditable ? `<input type="number" value="${line.unitCost}" min="0" onchange="updateQuotationLine('${q.id}', ${idx}, 'unitCost', Number(this.value))" class="sales-line-input sales-line-num">` : line.unitCost.toLocaleString()}</td>
                    <td><strong>${(line.total || 0).toLocaleString()} ${currency}</strong></td>
                    ${isEditable ? `<td><button class="sales-action-btn" onclick="removeQuotationLine('${q.id}', ${idx})" title="حذف"><i class="fa-solid fa-trash"></i></button></td>` : ''}
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Totals -->
      <div class="sales-quot-totals">
        <div class="sales-quot-total-row"><span>المجموع الفرعي:</span><span>${(q.subtotal || 0).toLocaleString()} ${currency}</span></div>
        <div class="sales-quot-total-row">
          <span>الخصم ${isEditable ? `<select onchange="updateSalesQuotation('${q.id}', 'discountType', this.value)" style="font-size:11px;background:transparent;border:1px solid rgba(255,255,255,0.1);color:inherit;border-radius:4px;padding:2px 4px"><option value="percent" ${q.discountType === 'percent' ? 'selected' : ''}>%</option><option value="fixed" ${q.discountType === 'fixed' ? 'selected' : ''}>ثابت</option></select>` : `(${q.discountType === 'percent' ? '%' : 'ثابت'})`}:</span>
          <span>${isEditable ? `<input type="number" value="${q.discount}" min="0" onchange="updateSalesQuotation('${q.id}', 'discount', Number(this.value))" class="sales-line-input sales-line-num" style="width:80px;text-align:left">` : q.discount}</span>
        </div>
        <div class="sales-quot-total-row"><span>الضريبة %:</span><span>${isEditable ? `<input type="number" value="${q.tax}" min="0" max="100" onchange="updateSalesQuotation('${q.id}', 'tax', Number(this.value))" class="sales-line-input sales-line-num" style="width:80px;text-align:left">` : `${q.tax}%`}</span></div>
        <div class="sales-quot-total-row sales-quot-total-final"><span>الإجمالي:</span><span>${(q.total || 0).toLocaleString()} ${currency}</span></div>
        <div class="sales-quot-total-row"><span>إجمالي الكلفة:</span><span>${(q.totalCost || 0).toLocaleString()} ${currency}</span></div>
        <div class="sales-quot-total-row"><span>هامش الربح:</span><span class="sales-margin-chip ${marginClass}">${q.profitMargin || 0}%</span></div>
      </div>

      <!-- Notes -->
      <div class="sales-form-group" style="margin-top:16px">
        <label>ملاحظات</label>
        <textarea rows="2" ${isEditable ? `onchange="updateSalesQuotation('${q.id}', 'notes', this.value)"` : 'readonly'}>${escapeHtml(q.notes)}</textarea>
      </div>

      <!-- Actions -->
      <div class="sales-inspector-actions">
        ${q.status === 'draft' ? `<button class="btn-primary" onclick="sendSalesQuotation('${q.id}')"><i class="fa-solid fa-paper-plane"></i> إرسال للعميل</button>` : ''}
        ${q.status === 'draft' || q.status === 'sent' ? `<button class="btn-primary" style="background:linear-gradient(135deg,#34d399,#059669)" onclick="approveSalesQuotation('${q.id}')"><i class="fa-solid fa-check"></i> اعتماد</button>` : ''}
        ${q.status === 'approved' ? `<button class="btn-primary" style="background:linear-gradient(135deg,#a855f7,#7c3aed)" onclick="convertQuotationToOrder('${q.id}')"><i class="fa-solid fa-cart-plus"></i> تحويل إلى طلب مبيعات</button>` : ''}
        <button class="btn-secondary" onclick="printSalesQuotation('${q.id}')"><i class="fa-solid fa-print"></i> طباعة</button>
      </div>

      <!-- Activity Log -->
      ${q.activityLog.length ? `
        <div class="sales-activity-log">
          <h4><i class="fa-solid fa-clock-rotate-left"></i> سجل النشاط</h4>
          ${q.activityLog.slice().reverse().map(a => `<div class="sales-activity-item"><span class="sales-activity-date">${new Date(a.date).toLocaleString('ar-IQ')}</span><span>${escapeHtml(a.text)}</span></div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function updateSalesQuotation(quotId, field, value) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  q[field] = value;
  q.updatedAt = new Date().toISOString();
  recalcQuotationTotals(q);
  saveData();
  openSalesQuotationEditor(quotId); // refresh
}

function addQuotationLine(quotId, type) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  const packs = omni.opPacks || [];
  const materials = omni.materials || [];

  if (type === 'oppack' && packs.length > 0) {
    // Show pack picker
    let html = '<div style="display:grid;gap:8px;max-height:300px;overflow:auto">';
    packs.forEach(pack => {
      const preview = buildOpPackPreview(pack);
      const pricing = computeOpPackPricing(pack, preview.totalCost || pack.estimatedCost || 0, pack.defaultSize || 1);
      html += `<button class="glass-card" style="padding:12px;cursor:pointer;text-align:right;border:1px solid rgba(255,255,255,0.08)" onclick="addOpPackToQuotation('${quotId}', '${pack.id}'); closeInspector(); setTimeout(() => openSalesQuotationEditor('${quotId}'), 200)">
        <strong>${pack.icon || '📦'} ${escapeHtml(pack.name)}</strong>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">كلفة: ${pricing.internalCost.toLocaleString()} | سعر العميل: ${pricing.customerPrice.toLocaleString()}</div>
      </button>`;
    });
    html += '</div>';
    showOmniModal('اختر باقة عمليات', html);
    return;
  }

  if (type === 'material' && materials.length > 0) {
    let html = '<div style="display:grid;gap:8px;max-height:300px;overflow:auto">';
    materials.forEach(mat => {
      html += `<button class="glass-card" style="padding:12px;cursor:pointer;text-align:right;border:1px solid rgba(255,255,255,0.08)" onclick="addMaterialToQuotation('${quotId}', '${mat.id}'); closeInspector(); setTimeout(() => openSalesQuotationEditor('${quotId}'), 200)">
        <strong>🧱 ${escapeHtml(mat.name)}</strong>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">المخزون: ${mat.stock || 0} ${mat.unit || ''} | الكلفة: ${(mat.costPerUnit || 0).toLocaleString()}</div>
      </button>`;
    });
    html += '</div>';
    showOmniModal('اختر مادة', html);
    return;
  }

  // Custom or service line
  const line = {
    id: makeId('qline'),
    type: type,
    description: type === 'service' ? 'خدمة' : 'بند مخصص',
    packId: '', materialId: '',
    quantity: 1, unitPrice: 0, unitCost: 0, total: 0
  };
  q.lines.push(line);
  recalcQuotationTotals(q);
  saveData();
  openSalesQuotationEditor(quotId);
}

function addOpPackToQuotation(quotId, packId) {
  const q = getSalesQuotationById(quotId);
  const pack = (omni.opPacks || []).find(p => p.id === packId);
  if (!q || !pack) return;
  const preview = buildOpPackPreview(pack);
  const pricing = computeOpPackPricing(pack, preview.totalCost || pack.estimatedCost || 0, pack.defaultSize || 1);
  const line = {
    id: makeId('qline'),
    type: 'oppack',
    description: pack.name,
    packId: pack.id,
    materialId: '',
    quantity: 1,
    unitPrice: pricing.customerPrice,
    unitCost: pricing.internalCost,
    total: pricing.customerPrice
  };
  q.lines.push(line);
  recalcQuotationTotals(q);
  q.activityLog.push({ date: new Date().toISOString(), text: `تم إضافة باقة: ${pack.name}` });
  saveData();
  // close the modal
  const modal = document.querySelector('.omni-modal-overlay');
  if (modal) modal.remove();
}

function addMaterialToQuotation(quotId, materialId) {
  const q = getSalesQuotationById(quotId);
  const mat = (omni.materials || []).find(m => m.id === materialId);
  if (!q || !mat) return;
  const line = {
    id: makeId('qline'),
    type: 'material',
    description: mat.name,
    packId: '',
    materialId: mat.id,
    quantity: 1,
    unitPrice: Math.round((mat.costPerUnit || 0) * 1.3),
    unitCost: mat.costPerUnit || 0,
    total: Math.round((mat.costPerUnit || 0) * 1.3)
  };
  q.lines.push(line);
  recalcQuotationTotals(q);
  q.activityLog.push({ date: new Date().toISOString(), text: `تم إضافة مادة: ${mat.name}` });
  saveData();
  const modal = document.querySelector('.omni-modal-overlay');
  if (modal) modal.remove();
}

function updateQuotationLine(quotId, lineIdx, field, value) {
  const q = getSalesQuotationById(quotId);
  if (!q || !q.lines[lineIdx]) return;
  q.lines[lineIdx][field] = value;
  recalcQuotationTotals(q);
  q.updatedAt = new Date().toISOString();
  saveData();
  openSalesQuotationEditor(quotId);
}

function removeQuotationLine(quotId, lineIdx) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  q.lines.splice(lineIdx, 1);
  recalcQuotationTotals(q);
  q.updatedAt = new Date().toISOString();
  saveData();
  openSalesQuotationEditor(quotId);
}

function sendSalesQuotation(quotId) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  q.status = 'sent';
  q.updatedAt = new Date().toISOString();
  q.activityLog.push({ date: new Date().toISOString(), text: 'تم إرسال عرض السعر للعميل' });
  saveData();
  openSalesQuotationEditor(quotId);
  renderSalesCrmPage();
  showToast(`تم إرسال عرض السعر ${q.reference}`, 'success');
}

function approveSalesQuotation(quotId) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  q.status = 'approved';
  q.approvedAt = new Date().toISOString();
  q.approvedBy = 'مدير النظام';
  q.updatedAt = new Date().toISOString();
  q.activityLog.push({ date: new Date().toISOString(), text: 'تم اعتماد عرض السعر' });

  // Move the lead to Won
  if (q.leadId) {
    const lead = getSalesLeadById(q.leadId);
    if (lead) {
      lead.stageId = 'stage_won';
      lead.updatedAt = new Date().toISOString();
      lead.activityLog.push({ date: new Date().toISOString(), text: `تم اعتماد عرض السعر ${q.reference} — العميل فاز` });
    }
  }

  saveData();
  closeInspector();
  renderSalesCrmPage();
  showToast(`تم اعتماد عرض السعر ${q.reference} ✅`, 'success');
}

function deleteSalesQuotation(quotId) {
  if (!confirm('هل تريد حذف عرض السعر؟')) return;
  const sc = getSalesCrm();
  sc.quotations = sc.quotations.filter(q => q.id !== quotId);
  saveData();
  renderSalesCrmPage();
  showToast('تم حذف عرض السعر', 'info');
}

// ── Convert to Order ────────────────────────────────────────────────────────

function convertQuotationToOrder(quotId) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  if (q.status === 'converted') { showToast('عرض السعر محوّل بالفعل', 'warning'); return; }
  if (q.status !== 'approved') { showToast('يجب اعتماد عرض السعر قبل التحويل', 'warning'); return; }

  const soRef = `SO-${(getSalesOrders().length + 1).toString().padStart(4, '0')}`;
  const so = {
    id: makeId('so'),
    quotationId: q.id,
    leadId: q.leadId,
    customerId: q.customerId,
    customerName: q.customerName,
    reference: soRef,
    status: 'confirmed',
    lines: JSON.parse(JSON.stringify(q.lines)),
    total: q.total,
    totalCost: q.totalCost,
    kanbanCardIds: [],
    taskIds: [],
    createdAt: new Date().toISOString(),
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء طلب مبيعات ${soRef} من عرض سعر ${q.reference}` }]
  };

  // Create Kanban cards for oppack lines & Reserve materials
  const kanbanCol = (omni.kanban.columns || []).find(c => /backlog|to.?do|جديد|مهام/i.test(`${c.title || ''} ${c.name || ''}`)) || omni.kanban.columns[0];

  // 1. Process oppack lines (Kanban card creation + Material reservation)
  q.lines.filter(l => l.type === 'oppack' && l.packId).forEach(line => {
    const pack = (omni.opPacks || []).find(p => p.id === line.packId);

    // Create Kanban card if column exists
    if (kanbanCol) {
      const card = {
        id: makeId('card'),
        title: `${q.customerName} — ${line.description}`,
        description: `طلب مبيعات: ${soRef}\nعدد: ${line.quantity}\nالقيمة: ${line.total.toLocaleString()}`,
        columnId: kanbanCol.id,
        priority: 'Normal',
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        labels: ['مبيعات', pack?.name || ''],
        owner: '',
        operationPackId: line.packId,
        salesOrderId: so.id,
        activityLog: [{ date: new Date().toISOString(), text: `تم الإنشاء من طلب مبيعات ${soRef}` }]
      };
      omni.kanban.cards.push(card);
      so.kanbanCardIds.push(card.id);
    }

    // Reserve materials for the op_pack steps
    if (pack) {
      const preview = buildOpPackPreview(pack, line.quantity);
      if (preview && Array.isArray(preview.materials)) {
        preview.materials.forEach(m => {
          if (typeof reserveMaterial === 'function') {
            reserveMaterial(m.materialId, m.qty, 'sales_order', so.id, `${soRef}: باقة ${pack.name}`);
          }
        });
      }
    }
  });

  // 2. Process raw material lines (Direct material reservation)
  q.lines.filter(l => l.type === 'material' && l.materialId).forEach(line => {
    if (typeof reserveMaterial === 'function') {
      reserveMaterial(line.materialId, line.quantity, 'sales_order', so.id, `${soRef}: مادة ${line.description}`);
    }
  });

  getSalesOrders().push(so);

  // Update quotation
  q.status = 'converted';
  q.updatedAt = new Date().toISOString();
  q.activityLog.push({ date: new Date().toISOString(), text: `تم التحويل لطلب مبيعات ${soRef}` });

  saveData();
  closeInspector();
  salesCrmActiveTab = 'orders';
  renderSalesCrmPage();
  showToast(`تم إنشاء طلب مبيعات ${soRef} مع ${so.kanbanCardIds.length} بطاقة كانبان 🎉`, 'success');
}

// ── Order Actions ───────────────────────────────────────────────────────────

function startSalesOrder(orderId) {
  const so = getSalesOrderById(orderId);
  if (!so) return;
  so.status = 'in_progress';
  so.activityLog.push({ date: new Date().toISOString(), text: 'بدأ التنفيذ' });
  saveData();
  renderSalesCrmPage();
  showToast(`طلب ${so.reference} قيد التنفيذ الآن`, 'success');
}

function deliverSalesOrder(orderId) {
  const so = getSalesOrderById(orderId);
  if (!so) return;
  so.status = 'delivered';
  so.activityLog.push({ date: new Date().toISOString(), text: 'تم التسليم' });
  saveData();
  renderSalesCrmPage();
  showToast(`تم تسليم طلب ${so.reference} 📦`, 'success');
}

// ── Invoices List ───────────────────────────────────────────────────────────
function renderSalesInvoicesList(container) {
  const crm = getSalesCrm();
  const invoices = (crm.invoices || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';
  const statusLabels = { unpaid: '🔴 غير مدفوعة', partial: '🟡 مدفوعة جزئياً', paid: '✅ مدفوعة' };
  const statusColors = { unpaid: '#f87171', partial: '#facc15', paid: '#34d399' };
  container.innerHTML = `
    <div class="sales-table-wrap">
      <table class="sales-table">
        <thead><tr>
          <th>الفاتورة</th><th>العميل</th><th>الطلب</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>التاريخ</th><th>إجراءات</th>
        </tr></thead>
        <tbody>
          ${invoices.length === 0 ? '<tr><td colspan="9" class="sales-empty">لا توجد فواتير بعد. سلّم طلب مبيعات ثم أصدر فاتورته من تبويب الطلبات.</td></tr>' :
            invoices.map(inv => {
              const paid = asMoney(inv.paidAmount);
              const due = asMoney(inv.total) - paid;
              const st = inv.status || 'unpaid';
              return `
                <tr class="sales-invoice-row">
                  <td><strong>${escapeHtml(inv.reference)}</strong></td>
                  <td>${escapeHtml(inv.customerName || '-')}</td>
                  <td>${escapeHtml(inv.orderRef || '-')}</td>
                  <td><strong>${asMoney(inv.total).toLocaleString()} ${currency}</strong></td>
                  <td>${paid.toLocaleString()} ${currency}</td>
                  <td style="color:${due > 0 ? '#f87171' : '#34d399'};font-weight:700">${due.toLocaleString()} ${currency}</td>
                  <td><span class="sales-status-chip" style="background:${statusColors[st]}22;color:${statusColors[st]};border:1px solid ${statusColors[st]}44">${statusLabels[st] || st}</span></td>
                  <td>${new Date(inv.createdAt).toLocaleDateString('ar-IQ')}</td>
                  <td>
                    ${due > 0 ? `<button class="sales-action-btn sales-action-approve" onclick="promptSalesInvoicePayment('${inv.id}')" title="تسجيل دفعة"><i class="fa-solid fa-money-bill-wave"></i></button>` : ''}
                    <button class="sales-action-btn" onclick="printSalesInvoice('${inv.id}')" title="طباعة الفاتورة"><i class="fa-solid fa-print"></i></button>
                  </td>
                </tr>`;
            }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// O2C close-out: delivered Sales Order -> Customer Invoice -> finance receivable.
// Books a `customer_charge` (customer now owes us) via the existing deduped finance
// write path; payment is recorded separately later. Idempotent: re-invoicing reuses
// the same invoice + sourceId so the receivable is never double-posted.
function invoiceSalesOrder(orderId) {
  const so = getSalesOrderById(orderId);
  if (!so) return;
  if (so.status !== 'delivered' && so.status !== 'invoiced') {
    showToast('يجب تسليم الطلب أولاً قبل إصدار الفاتورة', 'warning');
    return;
  }
  const crm = getSalesCrm();
  if (!Array.isArray(crm.invoices)) crm.invoices = [];
  let invoice = crm.invoices.find(inv => inv.orderId === so.id);
  if (!invoice) {
    const seq = crm.invoices.length + 1;
    invoice = {
      id: makeId('sinv'),
      reference: `INV-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`,
      orderId: so.id,
      orderRef: so.reference,
      customerId: so.customerId || '',
      customerName: so.customerName || '',
      date: todayISO(),
      createdAt: new Date().toISOString(),
      lines: Array.isArray(so.lines) ? JSON.parse(JSON.stringify(so.lines)) : [],
      subtotal: asMoney(so.subtotal),
      total: asMoney(so.total),
      totalCost: asMoney(so.totalCost),
      status: 'unpaid'
    };
    crm.invoices.push(invoice);
  }
  // Book the receivable into finance (neutral = no cash moved yet, just an obligation).
  if (so.customerId && invoice.total > 0) {
    addFinanceTransaction({
      type: 'customer_charge',
      direction: 'neutral',
      sourceType: 'sales_invoice',
      sourceId: invoice.id,
      amount: invoice.total,
      customerId: so.customerId,
      partyName: so.customerName || '',
      description: `فاتورة مبيعات ${invoice.reference} — طلب ${so.reference}`
    }, { skipSave: true });
  }
  so.status = 'invoiced';
  so.invoiceId = invoice.id;
  if (!Array.isArray(so.activityLog)) so.activityLog = [];
  so.activityLog.push({ date: new Date().toISOString(), text: `صدرت الفاتورة ${invoice.reference}` });
  saveData();
  renderSalesCrmPage();
  showToast(`تم إصدار الفاتورة ${invoice.reference} وتسجيلها على حساب العميل 🧾`, 'success');
}

// Record a customer PAYMENT against an invoice -> posts an `income` finance txn
// (reduces the customer's balance) and updates the invoice paid/partial status.
// Supports partial payments (each payment gets a unique sourceId, so not deduped).
function recordSalesInvoicePayment(invoiceId, rawAmount) {
  const crm = getSalesCrm();
  const invoice = (crm.invoices || []).find(i => i.id === invoiceId);
  if (!invoice) return;
  const outstanding = asMoney(invoice.total) - asMoney(invoice.paidAmount);
  if (outstanding <= 0) { showToast('الفاتورة مدفوعة بالكامل', 'info'); return; }
  let amount = asMoney(rawAmount);
  if (!amount || amount <= 0) amount = outstanding;
  if (amount > outstanding) amount = outstanding;
  const payId = makeId('spay');
  addFinanceTransaction({
    type: 'income',
    direction: 'in',
    sourceType: 'sales_payment',
    sourceId: payId,
    amount,
    customerId: invoice.customerId,
    partyName: invoice.customerName || '',
    description: `دفعة على الفاتورة ${invoice.reference}`
  }, { skipSave: true });
  invoice.paidAmount = asMoney(invoice.paidAmount) + amount;
  invoice.status = invoice.paidAmount >= asMoney(invoice.total) ? 'paid' : 'partial';
  if (!Array.isArray(invoice.payments)) invoice.payments = [];
  invoice.payments.push({ id: payId, amount, date: todayISO(), at: new Date().toISOString() });
  saveData();
  renderSalesCrmPage();
  showToast(`تم تسجيل دفعة ${amount.toLocaleString()} ${(omni.adminSettings?.organization?.currencySymbol) || 'د.ع'} على ${invoice.reference} 💰`, 'success');
}

function promptSalesInvoicePayment(invoiceId) {
  const crm = getSalesCrm();
  const invoice = (crm.invoices || []).find(i => i.id === invoiceId);
  if (!invoice) return;
  const outstanding = asMoney(invoice.total) - asMoney(invoice.paidAmount);
  if (outstanding <= 0) { showToast('الفاتورة مدفوعة بالكامل', 'info'); return; }
  const input = window.prompt(`مبلغ الدفعة للفاتورة ${invoice.reference} (المتبقي ${outstanding.toLocaleString()}):`, String(outstanding));
  if (input === null) return;
  recordSalesInvoicePayment(invoiceId, input);
}

// ── Print Sales Invoice ─────────────────────────────────────────────────────
function printSalesInvoice(invoiceId) {
  const crm = getSalesCrm();
  const inv = (crm.invoices || []).find(i => i.id === invoiceId);
  if (!inv) { showToast('الفاتورة غير موجودة', 'warning'); return; }
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';
  const orgName = omni.adminSettings?.organization?.name || 'Octagon Workshop';
  const paid = asMoney(inv.paidAmount);
  const due = asMoney(inv.total) - paid;
  const statusAr = inv.status === 'paid' ? 'مدفوعة ✅' : inv.status === 'partial' ? 'مدفوعة جزئياً' : 'غير مدفوعة';
  const w = window.open('', '_blank');
  if (!w) { showToast('فعّل النوافذ المنبثقة للطباعة', 'warning'); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>فاتورة ${inv.reference}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI', Tahoma, sans-serif; padding:40px; color:#1e293b; background:#fff; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; border-bottom:3px solid #34d399; padding-bottom:20px; }
    .header h1 { font-size:22px; color:#065f46; }
    .header .meta { text-align:left; font-size:13px; color:#64748b; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px; }
    .info-box { padding:12px; border:1px solid #e2e8f0; border-radius:8px; }
    .info-box label { font-size:11px; color:#94a3b8; display:block; margin-bottom:4px; }
    .info-box span { font-size:14px; font-weight:600; }
    table { width:100%; border-collapse:collapse; margin-bottom:20px; }
    th { background:#f1f5f9; padding:10px; text-align:right; font-size:12px; border-bottom:2px solid #e2e8f0; }
    td { padding:10px; border-bottom:1px solid #f1f5f9; font-size:13px; }
    .totals { float:left; width:300px; }
    .totals div { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; }
    .totals .final { font-size:18px; font-weight:900; color:#065f46; border-top:2px solid #065f46; padding-top:10px; margin-top:8px; }
    .totals .due { color:#b91c1c; font-weight:800; }
    @media print { body { padding:20px; } }
  </style></head><body>
    <div class="header">
      <div><h1>⬡ ${escapeHtml(orgName)}</h1><p style="color:#64748b;font-size:13px;margin-top:4px">فاتورة مبيعات</p></div>
      <div class="meta"><div><strong>${inv.reference}</strong></div><div>التاريخ: ${new Date(inv.createdAt).toLocaleDateString('ar-IQ')}</div><div>طلب: ${escapeHtml(inv.orderRef || '-')}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><label>العميل</label><span>${escapeHtml(inv.customerName || '-')}</span></div>
      <div class="info-box"><label>الحالة</label><span>${statusAr}</span></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>
      <tbody>${(inv.lines || []).map((l, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(l.description || '')}</td><td>${l.quantity || 0}</td><td>${asMoney(l.unitPrice).toLocaleString()} ${currency}</td><td>${asMoney(l.total).toLocaleString()} ${currency}</td></tr>`).join('')}</tbody>
    </table>
    <div class="totals">
      <div><span>المجموع الفرعي:</span><span>${asMoney(inv.subtotal).toLocaleString()} ${currency}</span></div>
      <div class="final"><span>الإجمالي:</span><span>${asMoney(inv.total).toLocaleString()} ${currency}</span></div>
      <div><span>المدفوع:</span><span>${paid.toLocaleString()} ${currency}</span></div>
      <div class="due"><span>المتبقي:</span><span>${due.toLocaleString()} ${currency}</span></div>
    </div>
  </body></html>`);
  w.document.close();
}

// ── Print Quotation ─────────────────────────────────────────────────────────

function printSalesQuotation(quotId) {
  const q = getSalesQuotationById(quotId);
  if (!q) return;
  const currency = (omni.adminSettings?.organization?.currencySymbol) || 'د.ع';
  const orgName = omni.adminSettings?.organization?.name || 'Octagon Workshop';

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>عرض سعر ${q.reference}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; padding:40px; color:#1e293b; background:#fff; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; border-bottom:3px solid #818cf8; padding-bottom:20px; }
    .header h1 { font-size:22px; color:#312e81; }
    .header .meta { text-align:left; font-size:13px; color:#64748b; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px; }
    .info-box { padding:12px; border:1px solid #e2e8f0; border-radius:8px; }
    .info-box label { font-size:11px; color:#94a3b8; display:block; margin-bottom:4px; }
    .info-box span { font-size:14px; font-weight:600; }
    table { width:100%; border-collapse:collapse; margin-bottom:20px; }
    th { background:#f1f5f9; padding:10px; text-align:right; font-size:12px; border-bottom:2px solid #e2e8f0; }
    td { padding:10px; border-bottom:1px solid #f1f5f9; font-size:13px; }
    .totals { float:left; width:280px; }
    .totals div { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; }
    .totals .final { font-size:18px; font-weight:900; color:#312e81; border-top:2px solid #312e81; padding-top:10px; margin-top:8px; }
    .notes { clear:both; margin-top:30px; padding:16px; border:1px dashed #e2e8f0; border-radius:8px; font-size:13px; color:#64748b; }
    @media print { body { padding:20px; } }
  </style></head><body>
    <div class="header">
      <div><h1>⬡ ${escapeHtml(orgName)}</h1><p style="color:#64748b;font-size:13px;margin-top:4px">عرض سعر رسمي</p></div>
      <div class="meta"><div><strong>${q.reference}</strong></div><div>التاريخ: ${new Date(q.createdAt).toLocaleDateString('ar-IQ')}</div><div>صالح حتى: ${q.validUntil ? new Date(q.validUntil).toLocaleDateString('ar-IQ') : '-'}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><label>العميل</label><span>${escapeHtml(q.customerName || '-')}</span></div>
      <div class="info-box"><label>الحالة</label><span>${q.status === 'approved' ? 'معتمد ✅' : q.status === 'sent' ? 'مرسل' : 'مسودة'}</span></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead>
      <tbody>${q.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(l.description)}</td><td>${l.quantity}</td><td>${l.unitPrice.toLocaleString()} ${currency}</td><td>${l.total.toLocaleString()} ${currency}</td></tr>`).join('')}</tbody>
    </table>
    <div class="totals">
      <div><span>المجموع الفرعي:</span><span>${q.subtotal.toLocaleString()} ${currency}</span></div>
      ${q.discount ? `<div><span>الخصم:</span><span>${q.discount}${q.discountType === 'percent' ? '%' : ` ${currency}`}</span></div>` : ''}
      ${q.tax ? `<div><span>الضريبة:</span><span>${q.tax}%</span></div>` : ''}
      <div class="final"><span>الإجمالي:</span><span>${q.total.toLocaleString()} ${currency}</span></div>
    </div>
    ${q.notes ? `<div class="notes"><strong>ملاحظات:</strong> ${escapeHtml(q.notes)}</div>` : ''}
  </body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══ GO 11 — Manufacturing / Work Orders V2 ═══════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

