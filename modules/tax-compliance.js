/* ============================================================================
 * Octagon OMNISYSTEM - GO 26: Tax and e-invoicing compliance
 * ----------------------------------------------------------------------------
 * Self-contained module:
 *   - Configurable VAT/e-invoice profile for Iraq/Gulf-style deployments.
 *   - Reads posted account_moves only; no automatic finance mutations.
 *   - Validates invoice VAT lines and account.move hash-chain continuity.
 *   - Exports invoice JSON/XML packages and logs compliance review events.
 *
 * New persisted state only: omni.taxCompliance.
 * ========================================================================== */
(function () {
  'use strict';

  const state = { tab: 'dashboard', range: 'month', selectedMoveId: '' };

  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni || typeof window.omni !== 'object') window.omni = {};
    return window.omni;
  }
  function DB() { try { return window.PentagonDB?.getCached?.() || {}; } catch (_) { return {}; } }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function xml(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function attr(value) { return esc(value).replace(/`/g, '&#96;'); }
  function num(value, digits) {
    const n = Number(value);
    if (!isFinite(n)) return '0';
    try { return n.toLocaleString('en-US', { maximumFractionDigits: digits == null ? 0 : digits }); }
    catch (_) { return String(Math.round(n)); }
  }
  function money(value) {
    if (typeof window.formatMoneyReadable === 'function') {
      try { return window.formatMoneyReadable(value); } catch (_) {}
    }
    let sym = 'د.ع';
    try { sym = O().adminSettings?.organization?.currencySymbol || sym; } catch (_) {}
    return num(Math.round(Number(value) || 0)) + ' ' + sym;
  }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix); } catch (_) {} }
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function toast(msg, kind) { if (typeof window.showToast === 'function') { try { return window.showToast(msg, kind || 'info'); } catch (_) {} } }
  function save() { if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} } }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function addDays(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function startOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
  function normalizeDate(v) {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  function range() {
    if (state.range === 'today') return { label: 'اليوم', start: todayISO(), end: todayISO() };
    if (state.range === '7d') return { label: 'آخر 7 أيام', start: addDays(-6), end: todayISO() };
    if (state.range === '30d') return { label: 'آخر 30 يوم', start: addDays(-29), end: todayISO() };
    if (state.range === 'year') return { label: 'هذه السنة', start: new Date().getFullYear() + '-01-01', end: todayISO() };
    if (state.range === 'all') return { label: 'كل البيانات', start: '0000-01-01', end: '9999-12-31' };
    return { label: 'هذا الشهر', start: startOfMonth(), end: todayISO() };
  }
  function inRange(date, r) {
    const d = normalizeDate(date);
    if (!d) return r.start === '0000-01-01';
    return d >= r.start && d <= r.end;
  }

  function ensureData() {
    const omni = O();
    if (!omni.taxCompliance || typeof omni.taxCompliance !== 'object') {
      omni.taxCompliance = {
        settings: {
          jurisdiction: 'IQ',
          vatRate: 0,
          taxId: '',
          eInvoiceProfile: 'OCTAGON-LOCAL-UBL',
          invoicePrefix: 'PTX',
          branchCode: 'MAIN'
        },
        exports: []
      };
    }
    if (!omni.taxCompliance.settings || typeof omni.taxCompliance.settings !== 'object') omni.taxCompliance.settings = {};
    const s = omni.taxCompliance.settings;
    if (!s.jurisdiction) s.jurisdiction = 'IQ';
    if (s.vatRate === undefined) s.vatRate = 0;
    if (!s.eInvoiceProfile || s.eInvoiceProfile === 'PENTAGON-LOCAL-UBL') s.eInvoiceProfile = 'OCTAGON-LOCAL-UBL';
    if (!s.invoicePrefix) s.invoicePrefix = 'PTX';
    if (!s.branchCode) s.branchCode = 'MAIN';
    if (!Array.isArray(omni.taxCompliance.exports)) omni.taxCompliance.exports = [];
    return omni;
  }
  function org() {
    try { if (typeof window.getActiveOrgProfile === 'function') return window.getActiveOrgProfile(); } catch (_) {}
    return O().adminSettings?.organization || {};
  }
  function settings() { return ensureData().taxCompliance.settings; }
  function accountName(id) {
    const accounts = DB().finance?.accounts || [];
    return (accounts.find(a => a.id === id) || {}).name || id || '';
  }
  function postedMoves() {
    const r = range();
    return (DB().account_moves || []).filter(m => m && m.state === 'posted' && inRange(m.date || m.posted_at, r));
  }
  function invoiceMoves() {
    return postedMoves().filter(m => ['out_invoice', 'out_refund', 'in_invoice', 'in_refund'].includes(m.move_type));
  }
  function computeInvoice(move) {
    const s = settings();
    const lines = move.line_ids || [];
    let vatSigned = 0;
    lines.forEach(line => {
      const id = String(line.account_id || '');
      const name = accountName(id);
      if (id.includes('vat') || /vat|ضريبة|ضريبه/i.test(name)) vatSigned += (Number(line.credit) || 0) - (Number(line.debit) || 0);
    });
    const total = Number(move.amount_total) || Math.max(0, ...lines.map(l => Math.max(Number(l.debit) || 0, Number(l.credit) || 0)));
    const rate = Math.max(0, Number(s.vatRate) || 0);
    const expectedVat = rate > 0 ? Math.round(total * rate / (100 + rate)) : 0;
    const actualVat = Math.abs(vatSigned);
    const missingVat = rate > 0 && actualVat === 0;
    const mismatch = rate > 0 && actualVat > 0 && Math.abs(actualVat - expectedVat) > Math.max(1, Math.round(total * 0.01));
    const direction = move.move_type && move.move_type.startsWith('out') ? 'sales' : 'purchase';
    return {
      id: move.id,
      name: move.name || move.id,
      date: move.date || '',
      type: move.move_type || '',
      direction,
      partner: move.partner_id || '',
      origin: move.origin || '',
      total,
      vat: actualVat,
      expectedVat,
      rate,
      hash: move.hash || '',
      previousHash: move.previous_hash || '',
      status: missingVat ? 'missing_vat' : mismatch ? 'vat_mismatch' : move.hash ? 'ready' : 'missing_hash',
      move
    };
  }
  function scan() {
    const invoices = invoiceMoves().map(computeInvoice);
    const sales = invoices.filter(i => i.direction === 'sales' && !String(i.type).includes('refund'));
    const purchases = invoices.filter(i => i.direction === 'purchase' && !String(i.type).includes('refund'));
    const outputVat = sales.reduce((s, i) => s + i.vat, 0);
    const inputVat = purchases.reduce((s, i) => s + i.vat, 0);
    const issues = [];
    invoices.forEach(i => {
      if (i.status === 'missing_vat') issues.push({ severity: 'high', title: 'فاتورة بلا سطر ضريبة', detail: i.name + ' لا تحتوي سطر VAT مع معدل مضبوط ' + i.rate + '%', moveId: i.id });
      if (i.status === 'vat_mismatch') issues.push({ severity: 'medium', title: 'فرق ضريبة محتمل', detail: i.name + ' المتوقع ' + money(i.expectedVat) + ' والمسجل ' + money(i.vat), moveId: i.id });
      if (!i.hash) issues.push({ severity: 'high', title: 'هاش مفقود', detail: i.name + ' مرحّلة بدون hash في account.move', moveId: i.id });
    });
    const chain = auditHashChain();
    chain.issues.forEach(x => issues.push(x));
    return { invoices, outputVat, inputVat, netVat: outputVat - inputVat, issues, chain };
  }
  function auditHashChain() {
    const moves = (DB().account_moves || []).filter(m => m && m.state === 'posted')
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || '')));
    const issues = [];
    let previous = 'genesis';
    moves.forEach((m, idx) => {
      if (!m.hash) issues.push({ severity: 'high', title: 'هاش قيد مفقود', detail: (m.name || m.id) + ' لا يحتوي hash', moveId: m.id });
      if (idx > 0 && m.previous_hash && m.previous_hash !== previous) {
        issues.push({ severity: 'high', title: 'انقطاع سلسلة التدقيق', detail: (m.name || m.id) + ' previous_hash لا يطابق القيد السابق', moveId: m.id });
      }
      previous = m.hash || previous;
    });
    return { total: moves.length, hashed: moves.filter(m => m.hash).length, issues };
  }
  function statusMeta(status) {
    return {
      ready: ['جاهز', '#34d399'],
      missing_vat: ['VAT ناقص', '#f87171'],
      vat_mismatch: ['فرق ضريبة', '#fbbf24'],
      missing_hash: ['هاش ناقص', '#f87171']
    }[status] || ['مراجعة', '#94a3b8'];
  }

  function buildEinvoice(inv) {
    const s = settings();
    const profile = s.eInvoiceProfile || 'OCTAGON-LOCAL-UBL';
    const company = org();
    const lines = (inv.move.line_ids || []).map((line, idx) => ({
      id: idx + 1,
      accountId: line.account_id || '',
      accountName: accountName(line.account_id),
      description: line.label || accountName(line.account_id),
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0
    }));
    return {
      profile,
      jurisdiction: s.jurisdiction || 'IQ',
      supplier: {
        name: company.companyName || company.name || 'Octagon Workshop',
        taxId: s.taxId || '',
        branchCode: s.branchCode || 'MAIN'
      },
      invoice: {
        id: inv.name,
        uuid: inv.id,
        issueDate: inv.date,
        type: inv.type,
        partner: inv.partner,
        currency: company.currency || 'IQD',
        total: inv.total,
        taxTotal: inv.vat,
        expectedTax: inv.expectedVat,
        hash: inv.hash,
        previousHash: inv.previousHash,
        origin: inv.origin,
        lines
      }
    };
  }
  function invoiceXml(pkg) {
    const lines = pkg.invoice.lines.map(line => `
    <InvoiceLine>
      <ID>${xml(line.id)}</ID>
      <Name>${xml(line.accountName)}</Name>
      <Description>${xml(line.description)}</Description>
      <Debit>${xml(line.debit)}</Debit>
      <Credit>${xml(line.credit)}</Credit>
      <Account>${xml(line.accountId)}</Account>
    </InvoiceLine>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<OctagonEInvoice profile="${xml(pkg.profile)}" jurisdiction="${xml(pkg.jurisdiction)}">
  <Supplier>
    <Name>${xml(pkg.supplier.name)}</Name>
    <TaxID>${xml(pkg.supplier.taxId)}</TaxID>
    <Branch>${xml(pkg.supplier.branchCode)}</Branch>
  </Supplier>
  <Invoice>
    <ID>${xml(pkg.invoice.id)}</ID>
    <UUID>${xml(pkg.invoice.uuid)}</UUID>
    <IssueDate>${xml(pkg.invoice.issueDate)}</IssueDate>
    <Type>${xml(pkg.invoice.type)}</Type>
    <Partner>${xml(pkg.invoice.partner)}</Partner>
    <Currency>${xml(pkg.invoice.currency)}</Currency>
    <LegalMonetaryTotal>${xml(pkg.invoice.total)}</LegalMonetaryTotal>
    <TaxTotal>${xml(pkg.invoice.taxTotal)}</TaxTotal>
    <ExpectedTax>${xml(pkg.invoice.expectedTax)}</ExpectedTax>
    <Origin>${xml(pkg.invoice.origin)}</Origin>
    <Audit>
      <Hash>${xml(pkg.invoice.hash)}</Hash>
      <PreviousHash>${xml(pkg.invoice.previousHash)}</PreviousHash>
    </Audit>
    <Lines>${lines}
    </Lines>
  </Invoice>
</OctagonEInvoice>`;
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function host() { return document.getElementById('taxComplianceBody'); }
  function renderKpis(data) {
    return `<div class="taxc-kpis">
      <div class="taxc-kpi"><div class="v">${num(data.invoices.length)}</div><div class="l">فواتير مرحّلة</div></div>
      <div class="taxc-kpi"><div class="v">${money(data.outputVat)}</div><div class="l">ضريبة مخرجات</div></div>
      <div class="taxc-kpi"><div class="v">${money(data.inputVat)}</div><div class="l">ضريبة مدخلات</div></div>
      <div class="taxc-kpi ${data.issues.length ? 'warn' : ''}"><div class="v">${num(data.issues.length)}</div><div class="l">ملاحظات امتثال</div></div>
    </div>`;
  }
  function renderDashboard(data) {
    return `${renderKpis(data)}
      <div class="taxc-grid">
        <section class="taxc-card"><h4><i class="fa-solid fa-scale-balanced"></i> صافي VAT</h4>
          <div class="taxc-big ${data.netVat < 0 ? 'credit' : ''}">${money(data.netVat)}</div>
          <p>المبلغ مبني على سطور حساب VAT داخل الفواتير المرحّلة. إذا لم تكن السطور موجودة، تظهر الفاتورة كملاحظة مراجعة.</p>
        </section>
        <section class="taxc-card"><h4><i class="fa-solid fa-link"></i> سلسلة تدقيق account.move</h4>
          <div class="taxc-chain"><b>${num(data.chain.hashed)} / ${num(data.chain.total)}</b><span>قيود مرحّلة تحتوي hash</span></div>
          <p>الفحص يتحقق من وجود hash ومن اتصال previous_hash بين القيود المرحّلة.</p>
        </section>
      </div>
      <section class="taxc-card"><h4><i class="fa-solid fa-triangle-exclamation"></i> قائمة الملاحظات</h4>${renderIssues(data.issues)}</section>`;
  }
  function renderIssues(issues) {
    if (!issues.length) return '<div class="taxc-empty">لا توجد ملاحظات ضمن النطاق الحالي.</div>';
    return `<div class="taxc-issues">${issues.slice(0, 30).map(i => `<div class="taxc-issue ${i.severity}">
      <b>${esc(i.title)}</b><p>${esc(i.detail)}</p>${i.moveId ? `<button onclick="taxcFocusMove('${attr(i.moveId)}')">فتح الفاتورة</button>` : ''}
    </div>`).join('')}</div>`;
  }
  function renderInvoices(data) {
    return `<section class="taxc-card"><div class="taxc-card-head"><h4><i class="fa-solid fa-file-invoice-dollar"></i> الفواتير الإلكترونية</h4><button class="taxc-btn" onclick="taxcExportPeriod('json')">تصدير الدفعة JSON</button></div>
      <div class="taxc-table-wrap"><table class="taxc-table"><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الطرف</th><th>الإجمالي</th><th>VAT</th><th>الحالة</th><th>تصدير</th></tr></thead><tbody>${
        data.invoices.map(inv => {
          const meta = statusMeta(inv.status);
          return `<tr class="${state.selectedMoveId === inv.id ? 'selected' : ''}"><td><b>${esc(inv.name)}</b><br><small>${esc(inv.type)}</small></td><td>${esc(inv.date)}</td><td>${esc(inv.partner || '-')}</td><td>${money(inv.total)}</td><td>${money(inv.vat)}</td><td><span class="taxc-badge" style="--c:${meta[1]}">${meta[0]}</span></td><td><button class="taxc-mini" onclick="taxcExportInvoice('${attr(inv.id)}','xml')">XML</button><button class="taxc-mini" onclick="taxcExportInvoice('${attr(inv.id)}','json')">JSON</button></td></tr>`;
        }).join('') || '<tr><td colspan="7">لا توجد فواتير ضمن النطاق الحالي</td></tr>'
      }</tbody></table></div>
    </section>`;
  }
  function renderSettings() {
    const s = settings();
    return `<section class="taxc-card"><h4><i class="fa-solid fa-sliders"></i> إعدادات الامتثال</h4>
      <div class="taxc-form">
        <label>الاختصاص<select id="taxcJurisdiction"><option value="IQ" ${s.jurisdiction === 'IQ' ? 'selected' : ''}>العراق IQ</option><option value="GCC" ${s.jurisdiction === 'GCC' ? 'selected' : ''}>Gulf / GCC</option><option value="CUSTOM" ${s.jurisdiction === 'CUSTOM' ? 'selected' : ''}>مخصص</option></select></label>
        <label>معدل VAT %<input id="taxcVatRate" type="number" min="0" max="100" step="0.01" value="${attr(s.vatRate)}"></label>
        <label>الرقم الضريبي<input id="taxcTaxId" value="${attr(s.taxId || '')}" placeholder="Tax ID / TRN"></label>
        <label>فرع/موقع<input id="taxcBranchCode" value="${attr(s.branchCode || 'MAIN')}"></label>
        <label>صيغة التصدير<input id="taxcProfile" value="${attr(s.eInvoiceProfile || 'OCTAGON-LOCAL-UBL')}"></label>
      </div>
      <div class="taxc-actions"><button class="taxc-btn" onclick="taxcSaveSettings()"><i class="fa-solid fa-floppy-disk"></i> حفظ الإعدادات</button><button class="taxc-btn ghost" onclick="taxcCreateReviewRequest()"><i class="fa-solid fa-inbox"></i> إرسال الملاحظات للمراجعة</button></div>
      <p class="taxc-note">المعدلات قابلة للتعديل لأن المتطلبات الضريبية تختلف حسب البلد والتسجيل. هذا السطح يجهز البيانات والتدقيق، ولا يعتمد الفاتورة لدى جهة حكومية خارجية.</p>
    </section>`;
  }
  function renderExports() {
    const rows = (ensureData().taxCompliance.exports || []).slice(0, 20);
    return `<section class="taxc-card"><h4><i class="fa-solid fa-clock-rotate-left"></i> سجل التصدير</h4>
      <div class="taxc-table-wrap"><table class="taxc-table"><tbody>${rows.map(r => `<tr><td><b>${esc(r.name)}</b><br><small>${esc(r.kind)} · ${esc(r.profile || '')}</small></td><td>${esc(new Date(r.at).toLocaleString('ar'))}</td><td>${esc(r.invoiceId || r.range || '')}</td></tr>`).join('') || '<tr><td>لا توجد صادرات بعد</td></tr>'}</tbody></table></div>
    </section>`;
  }
  function render() {
    ensureData();
    const el = host(); if (!el) return;
    const data = scan();
    const tabs = [['dashboard', 'لوحة الامتثال'], ['invoices', 'الفواتير والتصدير'], ['settings', 'الإعدادات'], ['exports', 'سجل التصدير']];
    el.innerHTML = `<div class="taxc-wrap">
      <div class="taxc-toolbar">
        <div class="taxc-tabs">${tabs.map(t => `<button class="${state.tab === t[0] ? 'active' : ''}" onclick="taxcSetTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
        <label>النطاق<select onchange="taxcSetRange(this.value)">${['month', '30d', '7d', 'today', 'year', 'all'].map(r => `<option value="${r}" ${state.range === r ? 'selected' : ''}>${rangeLabel(r)}</option>`).join('')}</select></label>
      </div>
      ${state.tab === 'dashboard' ? renderDashboard(data) : state.tab === 'invoices' ? renderInvoices(data) : state.tab === 'settings' ? renderSettings() : renderExports()}
    </div>`;
  }
  function rangeLabel(r) {
    return { month: 'هذا الشهر', '30d': 'آخر 30 يوم', '7d': 'آخر 7 أيام', today: 'اليوم', year: 'هذه السنة', all: 'كل البيانات' }[r] || r;
  }
  function findInvoice(id) { return scan().invoices.find(i => i.id === id) || null; }
  function recordExport(kind, name, invoiceId, rangeLabelText) {
    const omni = ensureData();
    const rec = { id: uid('taxexp'), at: new Date().toISOString(), kind, name, invoiceId: invoiceId || '', range: rangeLabelText || '', profile: settings().eInvoiceProfile };
    omni.taxCompliance.exports.unshift(rec);
    omni.taxCompliance.exports = omni.taxCompliance.exports.slice(0, 100);
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'tax_compliance', source: 'tax_compliance', action: 'e_invoice_export', title: name, payload: rec }); } catch (_) {}
    }
    save();
  }

  window.taxcSetTab = function (tab) { state.tab = tab; render(); };
  window.taxcSetRange = function (value) { state.range = value || 'month'; render(); };
  window.taxcFocusMove = function (id) { state.selectedMoveId = id; state.tab = 'invoices'; render(); };
  window.taxcSaveSettings = function () {
    const s = settings();
    s.jurisdiction = (document.getElementById('taxcJurisdiction') || {}).value || 'IQ';
    s.vatRate = Math.max(0, Number((document.getElementById('taxcVatRate') || {}).value) || 0);
    s.taxId = (document.getElementById('taxcTaxId') || {}).value || '';
    s.branchCode = (document.getElementById('taxcBranchCode') || {}).value || 'MAIN';
    s.eInvoiceProfile = (document.getElementById('taxcProfile') || {}).value || 'OCTAGON-LOCAL-UBL';
    save(); render(); toast('تم حفظ إعدادات الامتثال', 'success');
  };
  window.taxcExportInvoice = function (id, fmt) {
    const inv = findInvoice(id);
    if (!inv) { toast('الفاتورة غير موجودة', 'warning'); return; }
    const pkg = buildEinvoice(inv);
    const base = (settings().invoicePrefix || 'PTX') + '-' + String(inv.name || inv.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    if (fmt === 'json') download(base + '.json', JSON.stringify(pkg, null, 2), 'application/json;charset=utf-8');
    else download(base + '.xml', invoiceXml(pkg), 'application/xml;charset=utf-8');
    recordExport(fmt || 'xml', base, inv.id, '');
    toast('تم تجهيز ملف الفاتورة الإلكترونية', 'success');
  };
  window.taxcExportPeriod = function (fmt) {
    const data = scan();
    const packages = data.invoices.map(buildEinvoice);
    const r = range();
    const name = 'octagon-tax-period-' + r.start + '-' + r.end;
    if (fmt === 'xml') {
      const body = packages.map(invoiceXml).join('\n');
      download(name + '.xml', '<OctagonEInvoiceBatch>\n' + body + '\n</OctagonEInvoiceBatch>', 'application/xml;charset=utf-8');
    } else {
      download(name + '.json', JSON.stringify({ range: r, settings: settings(), summary: { invoices: data.invoices.length, outputVat: data.outputVat, inputVat: data.inputVat, netVat: data.netVat, issues: data.issues.length }, invoices: packages }, null, 2), 'application/json;charset=utf-8');
    }
    recordExport(fmt || 'json', name, '', r.label);
  };
  window.taxcCreateReviewRequest = function () {
    const data = scan();
    if (!data.issues.length) { toast('لا توجد ملاحظات لإرسالها', 'info'); return; }
    if (typeof window.createOmniRequest !== 'function') { toast('مركز القيادة غير متاح', 'warning'); return; }
    try {
      window.createOmniRequest({
        type: 'finance_review',
        title: 'مراجعة امتثال ضريبي: ' + data.issues.length + ' ملاحظة',
        description: data.issues.slice(0, 8).map(i => i.title + ': ' + i.detail).join('\n'),
        priority: data.issues.some(i => i.severity === 'high') ? 'high' : 'normal',
        sourcePage: 'tax_compliance',
        sourceType: 'tax_compliance_scan',
        sourceId: 'tax-' + Date.now(),
        payload: { issues: data.issues, range: range(), settings: settings() }
      });
      save();
      toast('تم إرسال طلب مراجعة إلى مركز القيادة', 'success');
    } catch (e) {
      toast('تعذر إرسال طلب المراجعة', 'warning');
    }
  };

  function activatePage() {
    if (window.PermissionService && !window.PermissionService.checkPage('tax_compliance')) {
      toast('لا تملك صلاحية فتح الضرائب والفوترة', 'warning');
      return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageTaxCompliance'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navTaxCompliance'); if (nav) nav.classList.add('active');
    try { if (typeof ensureNavGroupForPage === 'function') ensureNavGroupForPage('tax_compliance'); } catch (_) {}
    window.currentPage = 'tax_compliance';
    render();
  }
  function wireSwitch() {
    if (window.__ptxTaxcWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'tax_compliance') { try { activatePage(); } catch (e) { console.warn('Tax compliance render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__ptxTaxcWrapped = true;
  }
  function init() {
    wireSwitch();
    let tries = 0;
    const t = setInterval(() => { tries++; if (window.__ptxTaxcWrapped || tries > 40) { clearInterval(t); return; } wireSwitch(); }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const api = { open: function () { try { window.switchPage('tax_compliance'); } catch (_) {} }, scan, buildEinvoice, render };
  window.OctagonTaxCompliance = api;
  window.PentagonTaxCompliance = api;
})();
