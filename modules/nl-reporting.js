/* ============================================================================
 * Octagon OMNISYSTEM - GO 22: Natural-language reporting
 * ----------------------------------------------------------------------------
 * Self-contained module:
 *   - Reads live account_moves, Sales CRM, inventory, MRP, and operational data.
 *   - Parses common Arabic/English report questions into deterministic reports.
 *   - Exports report snapshots as CSV/JSON and logs saved runs to History.
 *
 * No finance writes. New persisted state only: omni.nlReports.
 * ========================================================================== */
(function () {
  'use strict';

  const state = {
    query: 'ارباح هذا الشهر حسب نوع العمل',
    range: 'month',
    from: '',
    to: '',
    activeDefinitionId: '',
    viewMode: 'designer',
    smartView: '',
    last: null
  };

  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni || typeof window.omni !== 'object') window.omni = {};
    return window.omni;
  }
  function DB() {
    try { return window.PentagonDB?.getCached?.() || {}; } catch (_) { return {}; }
  }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
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
  function toast(msg, kind) {
    if (typeof window.showToast === 'function') { try { return window.showToast(msg, kind || 'info'); } catch (_) {} }
  }
  function save() {
    if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} }
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function addDays(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function startOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
  function startOfYear() { return new Date().getFullYear() + '-01-01'; }
  function normalizeDate(v) {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  function ensureData() {
    const omni = O();
    if (!omni.nlReports || typeof omni.nlReports !== 'object') {
      omni.nlReports = { saved: [], definitions: [], schedules: [], settings: { defaultRange: 'month' } };
    }
    if (!Array.isArray(omni.nlReports.saved)) omni.nlReports.saved = [];
    if (!Array.isArray(omni.nlReports.definitions)) omni.nlReports.definitions = [];
    if (!Array.isArray(omni.nlReports.schedules)) omni.nlReports.schedules = [];
    if (!omni.nlReports.settings || typeof omni.nlReports.settings !== 'object') omni.nlReports.settings = {};
    return omni;
  }

  function currentUser() {
    try { return window.PentagonAuth?.getCurrentUser?.() || window.OctagonAuth?.getCurrentUser?.() || {}; } catch (_) { return {}; }
  }
  function currentGroups() {
    try {
      if (window.PermissionService && typeof window.PermissionService.resolveGroups === 'function') {
        return window.PermissionService.resolveGroups(currentUser());
      }
    } catch (_) {}
    const role = currentUser().role || currentUser().roleId || '';
    return role ? [role] : [];
  }
  function canUseDefinition(def) {
    const groups = currentGroups();
    const access = Array.isArray(def?.accessGroups) ? def.accessGroups.filter(Boolean) : [];
    if (!access.length || access.includes('all')) return true;
    return access.some(g => groups.includes(g));
  }
  function definitionAccessLabel(def) {
    const access = Array.isArray(def?.accessGroups) ? def.accessGroups.filter(Boolean) : [];
    if (!access.length || access.includes('all')) return 'كل المستخدمين';
    return access.join(', ');
  }
  function selectedAccessGroups() {
    return Array.from(document.querySelectorAll('.nlr-access-check:checked')).map(el => el.value).filter(Boolean);
  }
  function selectedColumns() {
    return Array.from(document.querySelectorAll('.nlr-col-check:checked')).map(el => el.value).filter(Boolean);
  }
  function activeSmartView() {
    const value = (document.getElementById('nlrSmartView') || {}).value || state.smartView || '';
    if (!value) return {};
    const parts = value.split(':');
    if (parts[0] === 'intent') return { intentType: parts[1] };
    if (parts[0] === 'minRows') return { minRows: Number(parts[1]) || 0 };
    return {};
  }

  function rangeFromState() {
    const r = state.range || 'month';
    if (r === 'custom') return { label: 'مخصص', start: state.from || '0000-01-01', end: state.to || '9999-12-31' };
    if (r === 'today') return { label: 'اليوم', start: todayISO(), end: todayISO() };
    if (r === '7d') return { label: 'آخر 7 أيام', start: addDays(-6), end: todayISO() };
    if (r === '30d') return { label: 'آخر 30 يوم', start: addDays(-29), end: todayISO() };
    if (r === 'year') return { label: 'هذه السنة', start: startOfYear(), end: todayISO() };
    if (r === 'all') return { label: 'كل البيانات', start: '0000-01-01', end: '9999-12-31' };
    return { label: 'هذا الشهر', start: startOfMonth(), end: todayISO() };
  }
  function inRange(date, range) {
    const d = normalizeDate(date);
    if (!d) return range.start === '0000-01-01';
    return d >= range.start && d <= range.end;
  }

  function accountsMap() {
    const db = DB();
    const financeObj = db.finance || (typeof finance !== 'undefined' ? finance : {}) || {};
    const rows = financeObj.accounts || [];
    return rows.reduce((acc, a) => { acc[a.id] = a; return acc; }, {});
  }
  function postedMoves(range) {
    const moves = DB().account_moves || [];
    return moves.filter(m => m && m.state === 'posted' && inRange(m.date || m.posted_at, range));
  }
  function moveLineTotals(range) {
    const map = accountsMap();
    const rows = [];
    postedMoves(range).forEach(move => {
      (move.line_ids || []).forEach(line => {
        const account = map[line.account_id] || {};
        rows.push({
          moveId: move.id,
          moveName: move.name || move.id,
          date: move.date || '',
          partner: move.partner_id || '',
          origin: move.origin || '',
          moveType: move.move_type || '',
          accountId: line.account_id || '',
          accountName: account.name || line.account_id || '',
          accountType: account.type || '',
          label: line.label || move.origin || move.name || '',
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0
        });
      });
    });
    return rows;
  }
  function salesLines(range) {
    const sc = O().salesCrm || {};
    const out = [];
    (sc.quotations || []).forEach(q => {
      if (['rejected', 'expired', 'cancelled'].includes(q.status)) return;
      if (!inRange(q.approvedAt || q.updatedAt || q.createdAt, range)) return;
      (q.lines || []).forEach(line => {
        const qty = Number(line.quantity) || 0;
        const revenue = Number(line.total) || qty * (Number(line.unitPrice) || 0);
        const cost = qty * (Number(line.unitCost) || 0);
        out.push({
          source: 'quotation',
          ref: q.reference || q.id,
          date: normalizeDate(q.approvedAt || q.updatedAt || q.createdAt),
          customer: q.customerName || q.customerId || '',
          label: line.description || line.packId || line.materialId || line.type || 'غير مصنف',
          type: line.type || 'custom',
          revenue,
          cost,
          profit: revenue - cost
        });
      });
    });
    (sc.salesOrders || []).forEach(so => {
      if (so.status === 'cancelled') return;
      if (!inRange(so.createdAt || so.updatedAt, range)) return;
      (so.lines || []).forEach(line => {
        const qty = Number(line.quantity) || 0;
        const revenue = Number(line.total) || qty * (Number(line.unitPrice) || 0);
        const cost = qty * (Number(line.unitCost) || 0);
        out.push({
          source: 'sales_order',
          ref: so.reference || so.id,
          date: normalizeDate(so.createdAt || so.updatedAt),
          customer: so.customerName || so.customerId || '',
          label: line.description || line.packId || line.materialId || line.type || 'غير مصنف',
          type: line.type || 'custom',
          revenue,
          cost,
          profit: revenue - cost
        });
      });
    });
    return out;
  }
  function group(rows, keyFn, seed) {
    const buckets = {};
    rows.forEach(row => {
      const key = keyFn(row) || 'غير مصنف';
      if (!buckets[key]) buckets[key] = { label: key, ...(seed ? seed() : {}) };
      const b = buckets[key];
      Object.keys(row).forEach(k => {
        if (typeof row[k] === 'number') b[k] = (Number(b[k]) || 0) + row[k];
      });
      b.count = (b.count || 0) + 1;
    });
    return Object.values(buckets);
  }

  function parseIntent(query) {
    const q = String(query || '').toLowerCase();
    const has = words => words.some(w => q.includes(w));
    if (has(['vat', 'tax', 'ضريبة', 'الضريبة', 'فاتورة الكترونية', 'فاتوره الكترونيه'])) return { type: 'tax', label: 'ملخص ضريبي' };
    if (has(['inventory', 'stock', 'مخزون', 'المخزون', 'مواد', 'valuation', 'قيمة'])) return { type: 'inventory', label: 'تقييم المخزون' };
    if (has(['customer', 'client', 'عميل', 'العملاء', 'زبون'])) return { type: 'customers', label: 'ربحية العملاء' };
    if (has(['mrp', 'bom', 'شراء', 'نواقص', 'مواد مطلوبة'])) return { type: 'mrp', label: 'تقرير MRP' };
    if (has(['product', 'line', 'نوع العمل', 'منتج', 'وسم', 'service', 'خدمة']) && has(['profit', 'ربح', 'ارباح', 'هامش'])) return { type: 'product_profit', label: 'الربح حسب نوع العمل' };
    if (has(['cost', 'expense', 'كلفة', 'تكلفة', 'مصروف', 'قسم'])) return { type: 'costs', label: 'الكلفة التشغيلية' };
    return { type: 'pnl', label: 'الأرباح والخسائر' };
  }

  function makeResult(type, title, rows, kpis, plan, notes) {
    const id = uid('nlr');
    return {
      id,
      type,
      title,
      range: rangeFromState(),
      createdAt: new Date().toISOString(),
      rows: rows || [],
      kpis: kpis || [],
      plan,
      notes: notes || []
    };
  }
  function reportProductProfit(range) {
    const lines = salesLines(range);
    if (lines.length) {
      const rows = group(lines, r => r.label, () => ({ revenue: 0, cost: 0, profit: 0 }))
        .map(r => ({ ...r, margin: r.revenue ? Math.round((r.profit / r.revenue) * 100) : 0 }))
        .sort((a, b) => b.profit - a.profit);
      const revenue = rows.reduce((s, r) => s + r.revenue, 0);
      const cost = rows.reduce((s, r) => s + r.cost, 0);
      return makeResult('product_profit', 'الربح حسب نوع العمل', rows, [
        ['الإيراد', money(revenue)], ['الكلفة', money(cost)], ['الربح', money(revenue - cost)], ['الهامش', revenue ? Math.round((revenue - cost) / revenue * 100) + '%' : '0%']
      ], 'salesCrm.quotations/salesOrders -> lines -> GROUP BY description/type');
    }
    return reportPnl(range, 'الربح حسب نوع العمل - من القيود المالية');
  }
  function reportPnl(range, title) {
    const lines = moveLineTotals(range);
    let income = 0; let expense = 0;
    const detail = {};
    lines.forEach(line => {
      const val = Math.abs(line.credit - line.debit);
      if (line.accountType === 'income') { income += line.credit - line.debit; detail[line.accountName] = (detail[line.accountName] || 0) + line.credit - line.debit; }
      if (line.accountType === 'expense') { expense += line.debit - line.credit; detail[line.accountName] = (detail[line.accountName] || 0) + line.debit - line.credit; }
      if (!line.accountType && /income|sales/i.test(line.accountId)) income += val;
      if (!line.accountType && /expense|cogs/i.test(line.accountId)) expense += val;
    });
    const rows = Object.entries(detail).map(([label, amount]) => ({ label, amount, count: 1 })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return makeResult('pnl', title || 'الأرباح والخسائر', rows, [
      ['الإيرادات', money(income)], ['المصاريف', money(expense)], ['الصافي', money(income - expense)], ['قيود مرحّلة', num(postedMoves(range).length)]
    ], 'account_moves.posted -> account type income/expense -> SUM debit/credit');
  }
  function reportCosts(range) {
    const base = reportPnl(range, 'الكلفة حسب الحساب');
    base.type = 'costs';
    base.rows = base.rows.filter(r => Number(r.amount) > 0).map(r => ({ label: r.label, amount: r.amount, count: r.count }));
    base.plan = 'account_moves.posted -> expense accounts -> GROUP BY account';
    return base;
  }
  function reportCustomers(range) {
    const rows = group(salesLines(range), r => r.customer || 'بدون عميل', () => ({ revenue: 0, cost: 0, profit: 0 }))
      .map(r => ({ ...r, margin: r.revenue ? Math.round(r.profit / r.revenue * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
    if (!rows.length) {
      const lineRows = moveLineTotals(range).filter(r => r.partner);
      return makeResult('customers', 'حركة العملاء من القيود', group(lineRows, r => r.partner, () => ({ debit: 0, credit: 0 }))
        .sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit)), [
        ['عملاء/أطراف', num(new Set(lineRows.map(r => r.partner)).size)], ['حركات', num(lineRows.length)]
      ], 'account_moves.posted -> partner_id -> SUM debit/credit');
    }
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const profit = rows.reduce((s, r) => s + r.profit, 0);
    return makeResult('customers', 'ربحية العملاء', rows, [
      ['العملاء', num(rows.length)], ['الإيراد', money(revenue)], ['الربح', money(profit)], ['متوسط الهامش', revenue ? Math.round(profit / revenue * 100) + '%' : '0%']
    ], 'salesCrm lines -> GROUP BY customer');
  }
  function reportInventory(range) {
    const rows = (O().materials || []).map(m => {
      const stock = Number(m.stock) || 0;
      const reserved = Number(m.reservedQty ?? m.reserved) || 0;
      const cost = Number(m.cost) || 0;
      const value = stock * cost;
      return { label: m.name || m.id, stock, reserved, available: Math.max(0, stock - reserved), unitCost: cost, value, minimum: Number(m.minimum) || 0 };
    }).sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + r.value, 0);
    const low = rows.filter(r => r.available <= r.minimum).length;
    return makeResult('inventory', 'تقييم المخزون والمواد', rows, [
      ['قيمة المخزون', money(total)], ['مواد', num(rows.length)], ['تحت الحد', num(low)], ['محجوز', num(rows.reduce((s, r) => s + r.reserved, 0))]
    ], 'omni.materials -> stock/reserved/cost valuation');
  }
  function reportMrp(range) {
    const runs = (O().mrpRuns || []).filter(r => inRange(r.runAt, range));
    const rows = runs.map(r => ({ label: r.id, totalCost: Number(r.totalCost) || 0, shortages: Number(r.shortages) || 0, lines: Number(r.lines) || 0, runAt: normalizeDate(r.runAt) }))
      .sort((a, b) => String(b.runAt).localeCompare(String(a.runAt)));
    return makeResult('mrp', 'تقرير MRP والنواقص', rows, [
      ['تشغيلات MRP', num(rows.length)], ['شراء مقترح', money(rows.reduce((s, r) => s + r.totalCost, 0))], ['مواد ناقصة', num(rows.reduce((s, r) => s + r.shortages, 0))]
    ], 'omni.mrpRuns -> shortage/procurement summaries');
  }
  function reportTax(range) {
    const invoices = postedMoves(range).filter(m => ['out_invoice', 'out_refund', 'in_invoice', 'in_refund'].includes(m.move_type));
    const rows = invoices.map(m => {
      let vat = 0;
      (m.line_ids || []).forEach(l => { if (String(l.account_id || '').includes('vat')) vat += (Number(l.credit) || 0) - (Number(l.debit) || 0); });
      return { label: m.name || m.id, date: m.date || '', type: m.move_type, partner: m.partner_id || '', total: Number(m.amount_total) || 0, vat };
    });
    const output = rows.filter(r => r.type === 'out_invoice').reduce((s, r) => s + Math.max(0, r.vat), 0);
    const input = rows.filter(r => r.type === 'in_invoice').reduce((s, r) => s + Math.abs(Math.min(0, r.vat)), 0);
    return makeResult('tax', 'ملخص ضريبة وفواتير', rows, [
      ['فواتير مرحّلة', num(rows.length)], ['ضريبة مخرجات', money(output)], ['ضريبة مدخلات', money(input)], ['الصافي', money(output - input)]
    ], 'account_moves.posted invoices/bills -> VAT account lines');
  }

  function runReport(query) {
    const intent = parseIntent(query);
    const range = rangeFromState();
    let result;
    if (intent.type === 'product_profit') result = reportProductProfit(range);
    else if (intent.type === 'tax') result = reportTax(range);
    else if (intent.type === 'inventory') result = reportInventory(range);
    else if (intent.type === 'customers') result = reportCustomers(range);
    else if (intent.type === 'mrp') result = reportMrp(range);
    else if (intent.type === 'costs') result = reportCosts(range);
    else result = reportPnl(range);
    result.query = query;
    result.intent = intent;
    result.range = range;
    result.notes = result.notes || [];
    if (!result.rows.length) result.notes.push('لا توجد بيانات كافية ضمن النطاق الحالي. غيّر النطاق أو أضف بيانات تشغيلية.');
    applySmartView(result);
    return result;
  }

  function applySmartView(result) {
    const view = activeSmartView();
    if (!view || !result) return result;
    if (view.intentType && result.type !== view.intentType) {
      result.notes = result.notes || [];
      result.notes.push('Smart View: هذا التقرير لا يطابق نوع العرض المحفوظ، لذلك بقيت البيانات كما هي.');
      return result;
    }
    if (view.minRows && Array.isArray(result.rows)) {
      result.rows = result.rows.slice(0, view.minRows);
      result.notes = result.notes || [];
      result.notes.push('Smart View: تم عرض أول ' + view.minRows + ' صف فقط.');
    }
    return result;
  }

  function activeDefinition() {
    const id = state.activeDefinitionId || (document.getElementById('nlrDefinition') || {}).value || '';
    return (ensureData().nlReports.definitions || []).find(def => def.id === id) || null;
  }

  function definitionFromForm(existing) {
    const result = state.last || runReport(state.query);
    return {
      id: existing?.id || uid('rdef'),
      title: ((document.getElementById('nlrDefinitionTitle') || {}).value || result.title || 'Report').trim(),
      query: ((document.getElementById('nlrQuery') || {}).value || state.query || '').trim(),
      range: (document.getElementById('nlrRange') || {}).value || state.range || 'month',
      from: (document.getElementById('nlrFrom') || {}).value || '',
      to: (document.getElementById('nlrTo') || {}).value || '',
      reportType: result.type || 'pnl',
      columns: selectedColumns(),
      accessGroups: selectedAccessGroups(),
      smartView: activeSmartView(),
      schedule: {
        enabled: false,
        cadence: (document.getElementById('nlrScheduleCadence') || {}).value || 'manual',
        note: 'placeholder_only_no_background_jobs'
      },
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      ownerId: currentUser().id || currentUser().username || 'local'
    };
  }

  function applyDefinition(def) {
    if (!def) return;
    if (!canUseDefinition(def)) {
      toast('لا تملك صلاحية تشغيل هذا التقرير المحفوظ', 'warning');
      return;
    }
    state.activeDefinitionId = def.id;
    state.query = def.query || state.query;
    state.range = def.range || state.range;
    state.from = def.from || '';
    state.to = def.to || '';
    state.smartView = def.smartView?.intentType ? 'intent:' + def.smartView.intentType : def.smartView?.minRows ? 'minRows:' + def.smartView.minRows : '';
    state.last = runReport(state.query);
    state.last.definitionId = def.id;
    state.last.definitionTitle = def.title;
  }

  function reportColumns(result) {
    const def = activeDefinition();
    const rows = result?.rows || [];
    const available = rows.length ? Object.keys(rows[0]).filter(k => !['source'].includes(k)) : ['label'];
    const chosen = def && Array.isArray(def.columns) ? def.columns.filter(k => available.includes(k)) : [];
    return (chosen.length ? chosen : available).slice(0, 8);
  }

  function excelHtml(result) {
    const keys = reportColumns(result);
    const rows = result?.rows || [];
    return '<html><head><meta charset="utf-8"></head><body dir="rtl"><table><thead><tr>'
      + keys.map(k => '<th>' + esc(labelFor(k)) + '</th>').join('')
      + '</tr></thead><tbody>'
      + rows.map(row => '<tr>' + keys.map(k => '<td>' + esc(row[k]) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table></body></html>';
  }

  function printHtml(result) {
    const keys = reportColumns(result);
    const rows = result?.rows || [];
    return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'
      + esc(result?.title || 'Octagon report')
      + '</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#111}h1{font-size:22px;margin:0 0 6px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #bbb;padding:8px;text-align:right;font-size:12px}th{background:#eee}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}.kpis div{border:1px solid #ccc;padding:10px}.kpis b{display:block;font-size:16px}</style></head><body><h1>'
      + esc(result?.title || '')
      + '</h1><p>' + esc(result?.range?.label || '') + ' | ' + esc(result?.range?.start || '') + ' - ' + esc(result?.range?.end || '') + '</p><section class="kpis">'
      + (result?.kpis || []).map(k => '<div><b>' + esc(k[1]) + '</b><span>' + esc(k[0]) + '</span></div>').join('')
      + '</section><table><thead><tr>' + keys.map(k => '<th>' + esc(labelFor(k)) + '</th>').join('') + '</tr></thead><tbody>'
      + rows.map(row => '<tr>' + keys.map(k => '<td>' + rowValue(row[k]) + '</td>').join('') + '</tr>').join('')
      + '</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>';
  }

  function host() { return document.getElementById('nlReportsBody'); }
  function renderKpis(result) {
    return `<div class="nlr-kpis">${(result.kpis || []).map(k => `<div class="nlr-kpi"><div class="v">${esc(k[1])}</div><div class="l">${esc(k[0])}</div></div>`).join('')}</div>`;
  }
  function renderBars(result) {
    const rows = (result.rows || []).slice(0, 8);
    const valueKey = ['product_profit', 'customers'].includes(result.type) ? 'profit' : result.type === 'inventory' ? 'value' : result.type === 'mrp' ? 'totalCost' : result.type === 'tax' ? 'total' : 'amount';
    const max = Math.max(1, ...rows.map(r => Math.abs(Number(r[valueKey]) || 0)));
    return `<div class="nlr-bars">${rows.map(r => {
      const v = Number(r[valueKey]) || 0;
      const pct = Math.max(4, Math.round(Math.abs(v) / max * 100));
      return `<div class="nlr-bar-row"><span>${esc(r.label || r.partner || r.type || '-')}</span><div class="nlr-track"><i style="width:${pct}%"></i></div><b>${money(v)}</b></div>`;
    }).join('') || '<div class="nlr-empty">لا توجد بيانات للرسم</div>'}</div>`;
  }
  function rowValue(v) {
    if (typeof v === 'number') return Math.abs(v) > 999 ? money(v) : num(v, 2);
    return esc(v);
  }
  function renderTable(result) {
    const rows = (result.rows || []).slice(0, 60);
    const keys = reportColumns(result);
    return `<div class="nlr-table-wrap"><table class="nlr-table"><thead><tr>${keys.map(k => `<th>${esc(labelFor(k))}</th>`).join('')}</tr></thead><tbody>${
      rows.map(r => `<tr>${keys.map(k => `<td>${rowValue(r[k])}</td>`).join('')}</tr>`).join('') || '<tr><td>لا توجد صفوف</td></tr>'
    }</tbody></table></div>`;
  }
  function labelFor(key) {
    return {
      label: 'البند', revenue: 'الإيراد', cost: 'الكلفة', profit: 'الربح', margin: 'الهامش',
      amount: 'المبلغ', count: 'عدد', debit: 'مدين', credit: 'دائن', stock: 'المخزون',
      reserved: 'محجوز', available: 'متاح', unitCost: 'كلفة الوحدة', value: 'القيمة',
      totalCost: 'الكلفة', shortages: 'نواقص', lines: 'سطور', runAt: 'تاريخ التشغيل',
      date: 'التاريخ', type: 'النوع', partner: 'الطرف', total: 'الإجمالي', vat: 'الضريبة'
    }[key] || key;
  }
  function renderResult(result) {
    if (!result) return '<div class="nlr-empty">اكتب سؤال تقرير أو اختر مثالاً لتوليد التقرير.</div>';
    return `<section class="nlr-result">
      <div class="nlr-result-head">
        <div><h3>${esc(result.title)}</h3><p>${esc(result.intent.label)} · ${esc(result.range.label)} · ${esc(result.range.start)} إلى ${esc(result.range.end)}</p></div>
        <div class="nlr-actions">
          <button class="nlr-btn ghost" onclick="nlrExport('csv')"><i class="fa-solid fa-file-csv"></i> CSV</button>
          <button class="nlr-btn ghost" onclick="nlrExport('xls')"><i class="fa-solid fa-file-excel"></i> Excel</button>
          <button class="nlr-btn ghost" onclick="nlrExport('json')"><i class="fa-solid fa-code"></i> JSON</button>
          <button class="nlr-btn ghost" onclick="nlrPrint()"><i class="fa-solid fa-print"></i> طباعة</button>
          <button class="nlr-btn" onclick="nlrSaveSnapshot()"><i class="fa-solid fa-bookmark"></i> حفظ</button>
        </div>
      </div>
      ${renderKpis(result)}
      <div class="nlr-grid">
        <div class="nlr-card"><h4><i class="fa-solid fa-chart-simple"></i> الرسم السريع</h4>${renderBars(result)}</div>
        <div class="nlr-card"><h4><i class="fa-solid fa-database"></i> خطة التقرير</h4><pre>${esc(result.plan || '')}</pre>${(result.notes || []).map(n => `<p class="nlr-note">${esc(n)}</p>`).join('')}</div>
      </div>
      ${renderTable(result)}
    </section>`;
  }
  function renderDesigner(result) {
    const data = ensureData().nlReports;
    const defs = data.definitions || [];
    const def = activeDefinition();
    const keys = result?.rows?.length ? Object.keys(result.rows[0]).filter(k => !['source'].includes(k)) : ['label', 'amount', 'count', 'date'];
    const selected = def?.columns?.length ? def.columns : keys.slice(0, 7);
    const access = def?.accessGroups?.length ? def.accessGroups : ['all'];
    const accessOptions = [
      ['all', 'الكل'],
      ['system.admin', 'مدير النظام'],
      ['finance.manager', 'مدير مالي'],
      ['finance.user', 'مالية'],
      ['workshop.manager', 'مدير ورشة'],
      ['workshop.user', 'تشغيل']
    ];
    return `<section class="nlr-designer">
      <div class="nlr-card">
        <h4><i class="fa-solid fa-sliders"></i> Report Designer</h4>
        <label>التقرير المحفوظ
          <select id="nlrDefinition" onchange="nlrLoadDefinition(this.value)">
            <option value="">تقرير جديد / بدون تعريف</option>
            ${defs.map(d => `<option value="${attr(d.id)}" ${state.activeDefinitionId === d.id ? 'selected' : ''} ${canUseDefinition(d) ? '' : 'disabled'}>${esc(d.title)} - ${esc(definitionAccessLabel(d))}</option>`).join('')}
          </select>
        </label>
        <label>اسم التعريف<input id="nlrDefinitionTitle" value="${attr(def?.title || result?.title || '')}" placeholder="مثال: ربحية العملاء الشهرية"></label>
        <div class="nlr-checks">
          <span>الأعمدة</span>
          ${keys.map(k => `<label><input class="nlr-col-check" type="checkbox" value="${attr(k)}" ${selected.includes(k) ? 'checked' : ''}> ${esc(labelFor(k))}</label>`).join('')}
        </div>
        <div class="nlr-checks">
          <span>صلاحية التشغيل</span>
          ${accessOptions.map(([value, label]) => `<label><input class="nlr-access-check" type="checkbox" value="${attr(value)}" ${access.includes(value) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}
        </div>
        <div class="nlr-designer-actions">
          <button class="nlr-btn" onclick="nlrSaveDefinition()"><i class="fa-solid fa-floppy-disk"></i> حفظ التعريف</button>
          <button class="nlr-btn ghost" onclick="nlrDraftDefinition()"><i class="fa-solid fa-wand-magic-sparkles"></i> مسودة AI</button>
          <button class="nlr-btn ghost" onclick="nlrDeleteDefinition()"><i class="fa-solid fa-trash"></i> أرشفة</button>
        </div>
      </div>
      <div class="nlr-card">
        <h4><i class="fa-solid fa-table-list"></i> Smart Views</h4>
        <label>عرض ذكي
          <select id="nlrSmartView" onchange="nlrRun()">
            <option value="" ${state.smartView === '' ? 'selected' : ''}>بدون فلتر إضافي</option>
            <option value="intent:pnl" ${state.smartView === 'intent:pnl' ? 'selected' : ''}>P&L فقط</option>
            <option value="intent:inventory" ${state.smartView === 'intent:inventory' ? 'selected' : ''}>المخزون فقط</option>
            <option value="intent:customers" ${state.smartView === 'intent:customers' ? 'selected' : ''}>العملاء فقط</option>
            <option value="minRows:10" ${state.smartView === 'minRows:10' ? 'selected' : ''}>أول 10 صفوف</option>
            <option value="minRows:25" ${state.smartView === 'minRows:25' ? 'selected' : ''}>أول 25 صف</option>
          </select>
        </label>
        <label>جدولة مستقبلية
          <select id="nlrScheduleCadence">
            <option value="manual">يدوي فقط</option>
            <option value="weekly">أسبوعي - placeholder</option>
            <option value="monthly">شهري - placeholder</option>
          </select>
        </label>
        <p class="nlr-note">الجدولة هنا تعريف آمن فقط ولا تنشئ مهام خلفية أو ترسل تقارير تلقائياً.</p>
        <div class="nlr-policy"><b>AI policy</b><span>AI يقترح صياغة التقرير فقط. لا يغيّر بيانات مالية أو مخزون أو رواتب.</span></div>
      </div>
    </section>`;
  }
  function renderSaved() {
    const saved = (ensureData().nlReports.saved || []).slice(0, 8);
    return `<section class="nlr-card"><h4><i class="fa-solid fa-clock-rotate-left"></i> آخر التقارير المحفوظة</h4>
      ${saved.length ? `<table class="nlr-table"><tbody>${saved.map(s => `<tr><td><b>${esc(s.title)}</b><br><small>${esc(s.query || '')}</small></td><td>${esc(new Date(s.createdAt).toLocaleString('ar'))}</td><td><button class="nlr-mini" onclick="nlrLoadSaved('${attr(s.id)}')">فتح</button></td></tr>`).join('')}</tbody></table>` : '<div class="nlr-empty">لا توجد تقارير محفوظة بعد</div>'}
    </section>`;
  }
  function render() {
    ensureData();
    const el = host();
    if (!el) return;
    if (!state.last) state.last = runReport(state.query);
    const range = rangeFromState();
    const examples = ['ارباح هذا الشهر حسب نوع العمل', 'الأرباح حسب خط المنتج هذا الشهر', 'قيمة المخزون والمواد', 'ملخص ضريبة القيمة المضافة هذا الشهر', 'ربحية العملاء', 'نواقص MRP والشراء المقترح'];
    el.innerHTML = `<div class="nlr-wrap">
      <div class="nlr-query">
        <div class="nlr-query-main">
          <label>سؤال التقرير</label>
          <div class="nlr-input-row">
            <input id="nlrQuery" value="${attr(state.query)}" placeholder="مثال: ارباح هذا الشهر حسب نوع العمل">
            <button class="nlr-btn" onclick="nlrRun()"><i class="fa-solid fa-wand-magic-sparkles"></i> تشغيل</button>
          </div>
          <div class="nlr-examples">${examples.map(x => `<button onclick="nlrUseExample('${attr(x)}')">${esc(x)}</button>`).join('')}</div>
        </div>
        <div class="nlr-filters">
          <label>النطاق<select id="nlrRange" onchange="nlrSetRange(this.value)">
            ${['month', '30d', '7d', 'today', 'year', 'all', 'custom'].map(r => `<option value="${r}" ${state.range === r ? 'selected' : ''}>${rangeLabel(r)}</option>`).join('')}
          </select></label>
          <label>من<input id="nlrFrom" type="date" value="${attr(state.from || range.start)}"></label>
          <label>إلى<input id="nlrTo" type="date" value="${attr(state.to || range.end === '9999-12-31' ? todayISO() : range.end)}"></label>
          <button class="nlr-btn ghost" onclick="switchPage('tax_compliance')"><i class="fa-solid fa-file-invoice"></i> الضرائب</button>
        </div>
      </div>
      ${renderDesigner(state.last)}
      ${renderResult(state.last)}
      ${renderSaved()}
    </div>`;
  }
  function rangeLabel(r) {
    return { month: 'هذا الشهر', '30d': 'آخر 30 يوم', '7d': 'آخر 7 أيام', today: 'اليوم', year: 'هذه السنة', all: 'كل البيانات', custom: 'مخصص' }[r] || r;
  }

  function csvFor(result) {
    const rows = result.rows || [];
    const keys = reportColumns(result);
    const lines = [keys.join(',')];
    rows.forEach(row => lines.push(keys.map(k => '"' + String(row[k] == null ? '' : row[k]).replace(/"/g, '""') + '"').join(',')));
    return lines.join('\n');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  window.nlrRun = function () {
    state.query = (document.getElementById('nlrQuery') || {}).value || state.query;
    state.range = (document.getElementById('nlrRange') || {}).value || state.range;
    state.from = (document.getElementById('nlrFrom') || {}).value || '';
    state.to = (document.getElementById('nlrTo') || {}).value || '';
    state.smartView = (document.getElementById('nlrSmartView') || {}).value || '';
    state.last = runReport(state.query);
    render();
  };
  window.nlrSetRange = function (value) { state.range = value || 'month'; if (value !== 'custom') { state.from = ''; state.to = ''; } render(); };
  window.nlrUseExample = function (query) { state.query = query; state.last = runReport(query); render(); };
  window.nlrExport = function (fmt) {
    if (!state.last) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === 'json') download('octagon-report-' + stamp + '.json', JSON.stringify(state.last, null, 2), 'application/json;charset=utf-8');
    else if (fmt === 'xls') download('octagon-report-' + stamp + '.xls', excelHtml(state.last), 'application/vnd.ms-excel;charset=utf-8');
    else download('octagon-report-' + stamp + '.csv', csvFor(state.last), 'text/csv;charset=utf-8');
  };
  window.nlrPrint = function () {
    if (!state.last) return;
    const w = window.open('', '_blank');
    if (!w) return toast('تعذر فتح نافذة الطباعة', 'warning');
    w.document.open();
    w.document.write(printHtml(state.last));
    w.document.close();
  };
  window.nlrSaveSnapshot = function () {
    if (!state.last) return;
    const omni = ensureData();
    omni.nlReports.saved.unshift(JSON.parse(JSON.stringify(state.last)));
    omni.nlReports.saved = omni.nlReports.saved.slice(0, 25);
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'nl_reports', source: 'nl_reports', action: 'report_saved', title: state.last.title, payload: { query: state.last.query, type: state.last.type, rows: state.last.rows.length } }); } catch (_) {}
    }
    save();
    render();
    toast('تم حفظ التقرير', 'success');
  };
  window.nlrLoadSaved = function (id) {
    const hit = (ensureData().nlReports.saved || []).find(s => s.id === id);
    if (hit) { state.last = hit; state.query = hit.query || state.query; render(); }
  };
  window.nlrSaveDefinition = function () {
    const data = ensureData().nlReports;
    const existing = activeDefinition();
    const def = definitionFromForm(existing);
    if (!def.title || !def.query) return toast('أدخل اسم التقرير والسؤال أولاً', 'warning');
    if (existing) {
      const idx = data.definitions.findIndex(item => item.id === existing.id);
      if (idx >= 0) data.definitions[idx] = def;
    } else {
      data.definitions.unshift(def);
    }
    state.activeDefinitionId = def.id;
    if (!data.schedules.some(item => item.definitionId === def.id)) {
      data.schedules.unshift({ id: uid('rsch'), definitionId: def.id, cadence: def.schedule.cadence, enabled: false, status: 'placeholder', createdAt: new Date().toISOString() });
    }
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'nl_reports', source: 'phase7d_report_designer', action: 'definition_saved', title: def.title, payload: { type: def.reportType, accessGroups: def.accessGroups, schedule: def.schedule } }); } catch (_) {}
    }
    save();
    render();
    toast('تم حفظ تعريف التقرير', 'success');
  };
  window.nlrLoadDefinition = function (id) {
    state.activeDefinitionId = id || '';
    const def = activeDefinition();
    if (def) applyDefinition(def);
    render();
  };
  window.nlrDeleteDefinition = function () {
    const data = ensureData().nlReports;
    const def = activeDefinition();
    if (!def) return toast('لا يوجد تعريف محدد', 'warning');
    def.archivedAt = new Date().toISOString();
    def.is_active = false;
    data.definitions = data.definitions.filter(item => item.id !== def.id);
    state.activeDefinitionId = '';
    save();
    render();
    toast('تمت أرشفة تعريف التقرير', 'success');
  };
  window.nlrDraftDefinition = function () {
    const result = state.last || runReport(state.query);
    const title = (result.intent?.label || result.title || 'Report') + ' - ' + rangeFromState().label;
    const titleInput = document.getElementById('nlrDefinitionTitle');
    if (titleInput) titleInput.value = title;
    toast('تم توليد مسودة تعريف آمنة من السؤال الحالي', 'success');
  };

  function activatePage() {
    if (window.PermissionService && !window.PermissionService.checkPage('nl_reports')) {
      toast('لا تملك صلاحية فتح التقارير الذكية', 'warning');
      return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageNlReports'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navNlReports'); if (nav) nav.classList.add('active');
    try { if (typeof ensureNavGroupForPage === 'function') ensureNavGroupForPage('nl_reports'); } catch (_) {}
    window.currentPage = 'nl_reports';
    render();
  }
  function wireSwitch() {
    if (window.__ptxNlrWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'nl_reports') { try { activatePage(); } catch (e) { console.warn('NL reports render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__ptxNlrWrapped = true;
  }
  function init() {
    wireSwitch();
    let tries = 0;
    const t = setInterval(() => { tries++; if (window.__ptxNlrWrapped || tries > 40) { clearInterval(t); return; } wireSwitch(); }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const api = { open: function () { try { window.switchPage('nl_reports'); } catch (_) {} }, run: runReport, render };
  window.OctagonNLReports = api;
  window.PentagonNLReports = api;
})();
