/* ============================================================================
 * Octagon OMNISYSTEM - GO 24: Manufacturing MRP II depth
 * ----------------------------------------------------------------------------
 * A self-contained module (de-monolith pattern, like omni-ai-assistant.js):
 *   1. BOM Manager      — multi-level Bills of Materials WITH versions.
 *   2. MRP Run          — explode demand through BOMs, net against live stock,
 *                         emit planned purchase suggestions (routed to the
 *                         existing Command Center approval queue) + planned
 *                         work orders.
 *   3. Capacity Planner — finite scheduling: machine load vs available
 *                         capacity over a horizon, overload alerts, day grid.
 *
 * 100% offline / local-first. Add-only: introduces new omni collections
 *   (omni.boms, omni.mrpDemand, omni.mrpCapacity, omni.mrpRuns) and a new
 *   sidebar page `mrp`. Touches NO existing app.js logic; it wraps switchPage
 *   exactly like the other overlays and reuses live data (materials, machines,
 *   opPacks, work orders, sales orders) + createOmniRequest for approvals.
 * ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------- safe helpers ----------------------------- */
  // app.js declares `let omni` in the shared global lexical scope (NOT on
  // window), so we resolve the bare global first — exactly like the other
  // overlays do — and only fall back to window.omni when it isn't ready.
  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni || typeof window.omni !== 'object') window.omni = {};
    return window.omni;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) {
    const n = Number(v);
    if (!isFinite(n)) return '0';
    try { return n.toLocaleString('en-US'); } catch (_) { return String(n); }
  }
  function money(v) {
    if (typeof window.formatMoneyReadable === 'function') {
      try { return window.formatMoneyReadable(v); } catch (_) {}
    }
    let sym = 'د.ع';
    try { sym = window.omni?.adminSettings?.organization?.currencySymbol || 'د.ع'; } catch (_) {}
    return num(Math.round(Number(v) || 0)) + ' ' + (sym === 'د.ع' ? 'دينار' : sym);
  }
  function toast(msg, kind) {
    if (typeof window.showToast === 'function') { try { return window.showToast(msg, kind || 'info'); } catch (_) {} }
    try { console.log('[MRP]', msg); } catch (_) {}
  }
  function save() {
    if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} }
  }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix); } catch (_) {} }
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  const todayISO = () => new Date().toISOString().slice(0, 10);
  function addDaysISO(days) { const d = new Date(); d.setDate(d.getDate() + (Number(days) || 0)); return d.toISOString().slice(0, 10); }
  function firstNumber(str) { const m = String(str || '').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : 0; }

  /* ------------------------------ module state --------------------------- */
  const state = {
    tab: 'boms',            // boms | run | capacity
    expandedBom: null,
    lastRun: null           // cached run result for display
  };

  /* ============================ DATA / SEEDING =========================== */
  // Map a free-text material name (from an op-pack) onto a real material id.
  function resolveMaterial(name) {
    const mats = O().materials || [];
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    let hit = mats.find(m => String(m.name || '').trim().toLowerCase() === n);
    if (!hit) hit = mats.find(m => {
      const mn = String(m.name || '').trim().toLowerCase();
      return mn && (mn.includes(n) || n.includes(mn));
    });
    return hit || null;
  }

  // Build a BOM from an operation pack (used to seed the first set of BOMs).
  function bomFromPack(pack) {
    const totalMinutes = Math.max(30, firstNumber(pack.estimatedTime) * 60 || 120);
    const machineSteps = (pack.steps || []).filter(s => s && s.type === 'machine');
    const perOp = machineSteps.length ? Math.round(totalMinutes / machineSteps.length) : totalMinutes;
    const operations = machineSteps.length
      ? machineSteps.map(s => ({ name: s.title || 'تشغيل ماكينة', machineId: s.machineRef || '', setupMin: 15, runMinPerUnit: perOp }))
      : [{ name: 'تجهيز يدوي', machineId: '', setupMin: 10, runMinPerUnit: totalMinutes }];

    const components = (pack.materials || []).map(rawName => {
      const m = resolveMaterial(rawName);
      return {
        kind: 'material',
        refId: m ? m.id : ('ghost:' + rawName),
        name: m ? m.name : rawName,
        qty: 1,
        scrapPct: 5
      };
    });

    return {
      id: uid('bom'),
      productName: pack.name || 'منتج',
      productSku: (pack.id || '').replace(/^pack_/, 'FG-').toUpperCase() || ('FG-' + Date.now().toString(36)),
      version: 1,
      active: true,
      outputQty: 1,
      unit: 'قطعة',
      sourcePackId: pack.id || '',
      components,
      operations,
      notes: pack.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function ensureData() {
    const omni = O();
    if (!Array.isArray(omni.boms)) omni.boms = [];
    if (!omni.boms.length && Array.isArray(omni.opPacks) && omni.opPacks.length) {
      omni.opPacks.forEach(p => { try { omni.boms.push(bomFromPack(p)); } catch (_) {} });
    }
    if (!Array.isArray(omni.mrpDemand)) omni.mrpDemand = [];
    if (!Array.isArray(omni.mrpRuns)) omni.mrpRuns = [];
    if (!omni.mrpCapacity || typeof omni.mrpCapacity !== 'object') {
      omni.mrpCapacity = { hoursPerDay: 8, daysPerWeek: 6, horizonDays: 14 };
    }
    return omni;
  }

  function activeBomFor(productName) {
    const boms = O().boms || [];
    const same = boms.filter(b => b.productName === productName);
    return same.find(b => b.active) || same.sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
  }
  function bomById(id) { return (O().boms || []).find(b => b.id === id) || null; }
  function materialById(id) { return (O().materials || []).find(m => m.id === id) || null; }
  function machineById(id) { return (O().machines || []).find(m => m.id === id) || null; }

  /* ============================ MRP EXPLOSION =========================== */
  // Recursively explode a BOM into material + machine + sub-assembly demand.
  function explode(bomId, qty, acc, depth) {
    if (depth > 8) return;                       // guard against cyclic BOMs
    const bom = bomById(bomId);
    if (!bom) return;
    const out = Math.max(1, Number(bom.outputQty) || 1);
    const lots = Math.ceil((Number(qty) || 0) / out);
    if (lots <= 0) return;

    acc.workOrders.push({
      bomId: bom.id, product: bom.productName, qty: lots * out, lots, depth
    });

    (bom.components || []).forEach(c => {
      const scrap = 1 + (Number(c.scrapPct) || 0) / 100;
      const need = lots * (Number(c.qty) || 0) * scrap;
      if (c.kind === 'subassembly') {
        const sub = bomById(c.refId);
        if (sub) { explode(sub.id, need, acc, depth + 1); }
        else { addMat(acc, c.refId, c.name, need); }
      } else {
        addMat(acc, c.refId, c.name, need);
      }
    });

    (bom.operations || []).forEach(op => {
      const mins = (Number(op.setupMin) || 0) + (Number(op.runMinPerUnit) || 0) * (lots * out);
      const mid = op.machineId || 'unassigned';
      acc.machineLoad[mid] = (acc.machineLoad[mid] || 0) + mins;
    });
  }
  function addMat(acc, refId, name, qty) {
    if (!acc.materials[refId]) {
      const m = materialById(refId);
      acc.materials[refId] = { refId, name: (m && m.name) || name || refId, gross: 0, isGhost: !m };
    }
    acc.materials[refId].gross += qty;
  }

  function runMrp() {
    const omni = ensureData();
    const demand = omni.mrpDemand || [];
    if (!demand.length) { toast('أضف سطر طلب واحد على الأقل قبل تشغيل MRP', 'warning'); return null; }

    const acc = { materials: {}, machineLoad: {}, workOrders: [] };
    demand.forEach(d => explode(d.bomId, d.qty, acc, 0));

    // Net materials against live stock (on-hand minus reserved).
    const matRows = Object.values(acc.materials).map(r => {
      const m = materialById(r.refId);
      const onHand = m ? (Number(m.stock) || 0) : 0;
      const reserved = m ? (Number(m.reserved) || 0) : 0;
      const available = Math.max(0, onHand - reserved);
      const net = Math.max(0, r.gross - available);
      const unitCost = m ? (Number(m.cost) || 0) : 0;
      return {
        refId: r.refId, name: r.name, unit: m ? (m.unit || '') : '',
        gross: Math.round(r.gross * 100) / 100, onHand, reserved, available,
        net: Math.ceil(net), unitCost, lineCost: Math.ceil(net) * unitCost,
        supplier: m ? (m.supplier || '') : '', isGhost: r.isGhost
      };
    }).sort((a, b) => b.net - a.net);

    const procurement = matRows.filter(r => r.net > 0);
    const totalCost = procurement.reduce((s, r) => s + r.lineCost, 0);

    const result = {
      id: uid('mrprun'),
      runAt: new Date().toISOString(),
      demand: demand.map(d => ({ ...d, product: (bomById(d.bomId) || {}).productName || d.bomId })),
      materials: matRows,
      procurement,
      totalCost,
      machineLoad: acc.machineLoad,
      workOrders: acc.workOrders
    };

    omni.mrpRuns.unshift({ id: result.id, runAt: result.runAt, totalCost, lines: demand.length, shortages: procurement.length });
    omni.mrpRuns = omni.mrpRuns.slice(0, 10);
    state.lastRun = result;
    save();
    return result;
  }

  /* ============================ CAPACITY ENGINE ========================= */
  function capacityModel() {
    const omni = ensureData();
    const cap = omni.mrpCapacity;
    const machines = omni.machines || [];

    // Load = this-run planned machine minutes + open work-order planned minutes.
    const load = {};
    const run = state.lastRun;
    if (run) Object.keys(run.machineLoad).forEach(k => { load[k] = (load[k] || 0) + run.machineLoad[k]; });
    (omni.workOrders || []).forEach(wo => {
      if (wo && wo.status !== 'completed' && wo.status !== 'done') {
        const k = wo.machineId || 'unassigned';
        load[k] = (load[k] || 0) + (Number(wo.plannedMinutes) || 0);
      }
    });

    const workingDays = Math.max(1, Math.round((Number(cap.horizonDays) || 14) * (Number(cap.daysPerWeek) || 6) / 7));
    const dailyMin = (Number(cap.hoursPerDay) || 8) * 60;
    const capMinutes = workingDays * dailyMin;

    const rows = machines.map(m => {
      const loadMin = load[m.id] || 0;
      return {
        id: m.id, name: m.name, status: m.status,
        loadMin, capMinutes,
        util: capMinutes ? Math.round((loadMin / capMinutes) * 100) : 0,
        overload: loadMin > capMinutes
      };
    });
    if (load['unassigned']) {
      rows.push({ id: 'unassigned', name: 'عمليات بدون ماكينة محددة', status: 'idle',
        loadMin: load['unassigned'], capMinutes, util: capMinutes ? Math.round((load['unassigned'] / capMinutes) * 100) : 0, overload: false });
    }
    return { rows: rows.sort((a, b) => b.util - a.util), workingDays, dailyMin, cap };
  }

  // Finite scheduling: pour each machine's minutes into day buckets.
  function buildSchedule(model) {
    const days = [];
    for (let i = 0; i < Math.min(14, model.workingDays); i++) days.push(addDaysISO(i));
    return model.rows.map(r => {
      let remaining = r.loadMin;
      const cells = days.map(() => {
        const used = Math.min(model.dailyMin, remaining);
        remaining -= used;
        return Math.round((used / model.dailyMin) * 100);
      });
      return { name: r.name, overflow: remaining > 0, cells };
    });
  }

  /* ============================== RENDER ================================ */
  function host() { return document.getElementById('mrpBody'); }

  function render() {
    ensureData();
    const el = host();
    if (!el) return;
    const tabs = [
      ['boms', '📋 قوائم المواد (BOM)'],
      ['run', '⚙️ تشغيل MRP'],
      ['capacity', '🏭 تخطيط الطاقة']
    ];
    el.innerHTML = `
      <div class="mrp-wrap">
        <div class="mrp-tabs">
          ${tabs.map(t => `<button class="mrp-tab ${state.tab === t[0] ? 'active' : ''}" data-jarvis-action="mrp.tab.${t[0]}" data-jarvis-label="فتح تبويب ${t[1]}" onclick="mrpSetTab('${t[0]}')">${t[1]}</button>`).join('')}
        </div>
        <div class="mrp-tabbody">${
          state.tab === 'boms' ? renderBoms() :
          state.tab === 'run' ? renderRun() :
          renderCapacity()
        }</div>
      </div>`;
  }

  /* ----- Tab 1: BOMs ----- */
  function renderBoms() {
    const boms = (O().boms || []).slice().sort((a, b) =>
      (a.productName || '').localeCompare(b.productName || '') || (b.version || 0) - (a.version || 0));
    const matOpts = (O().materials || []).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    const kpiProducts = new Set(boms.map(b => b.productName)).size;
    const kpiComps = boms.reduce((s, b) => s + (b.components || []).length, 0);

    const cards = boms.map(b => {
      const open = state.expandedBom === b.id;
      const subOpts = (O().boms || []).filter(x => x.id !== b.id)
        .map(x => `<option value="${x.id}">${esc(x.productName)} v${x.version}</option>`).join('');
      const compRows = (b.components || []).map((c, i) => {
        const known = c.kind === 'subassembly' ? !!bomById(c.refId) : !!materialById(c.refId);
        return `<tr>
          <td>${c.kind === 'subassembly' ? '🧩 تجميعة' : '🧱 مادة'}</td>
          <td>${esc(c.name)} ${known ? '' : '<span class="mrp-badge warn">غير مرتبط بالمخزون</span>'}</td>
          <td>${num(c.qty)}</td>
          <td>${num(c.scrapPct || 0)}%</td>
          <td><button class="mrp-x" title="حذف" onclick="mrpDelComp('${b.id}',${i})">✕</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="mrp-muted">لا توجد مكونات بعد</td></tr>';

      const opRows = (b.operations || []).map((op, i) => {
        const mc = machineById(op.machineId);
        return `<tr>
          <td>${esc(op.name)}</td>
          <td>${mc ? esc(mc.name) : '<span class="mrp-muted">—</span>'}</td>
          <td>${num(op.setupMin)} د</td>
          <td>${num(op.runMinPerUnit)} د/قطعة</td>
          <td><button class="mrp-x" title="حذف" onclick="mrpDelOp('${b.id}',${i})">✕</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="mrp-muted">لا توجد عمليات بعد</td></tr>';

      const machOpts = (O().machines || []).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

      return `<div class="mrp-bom ${b.active ? '' : 'inactive'}">
        <div class="mrp-bom-head" onclick="mrpToggleBom('${b.id}')">
          <div>
            <span class="mrp-bom-name">${esc(b.productName)}</span>
            <span class="mrp-badge ver">v${b.version}</span>
            ${b.active ? '<span class="mrp-badge ok">فعّال</span>' : '<span class="mrp-badge">قديم</span>'}
            <code class="mrp-muted">· ${esc(b.productSku || '')}</code>
          </div>
          <div class="mrp-muted">${(b.components || []).length} مكوّن · ${(b.operations || []).length} عملية ${open ? '▲' : '▼'}</div>
        </div>
        ${open ? `
        <div class="mrp-bom-body">
          <div class="mrp-bom-actions">
            ${b.active ? '' : `<button class="mrp-btn sm" onclick="mrpActivate('${b.id}')">تفعيل هذه النسخة</button>`}
            <button class="mrp-btn sm" onclick="mrpNewVersion('${b.id}')">➕ نسخة جديدة</button>
            <button class="mrp-btn sm danger" onclick="mrpDelBom('${b.id}')">🗑 حذف</button>
          </div>
          <div class="mrp-grid2">
            <div>
              <h4>المكوّنات (Bill of Materials)</h4>
              <table class="mrp-table"><thead><tr><th>النوع</th><th>الاسم</th><th>كمية</th><th>هدر</th><th></th></tr></thead>
              <tbody>${compRows}</tbody></table>
              <div class="mrp-addrow">
                <select id="mrpc_kind_${b.id}" onchange="mrpToggleCompSrc('${b.id}')">
                  <option value="material">مادة</option><option value="subassembly">تجميعة فرعية</option>
                </select>
                <select id="mrpc_mat_${b.id}">${matOpts}</select>
                <select id="mrpc_sub_${b.id}" style="display:none">${subOpts || '<option value="">لا يوجد</option>'}</select>
                <input id="mrpc_qty_${b.id}" type="number" min="0" step="0.1" value="1" title="الكمية" style="width:64px">
                <input id="mrpc_scrap_${b.id}" type="number" min="0" value="5" title="هدر %" style="width:56px">
                <button class="mrp-btn sm" onclick="mrpAddComp('${b.id}')">إضافة</button>
              </div>
            </div>
            <div>
              <h4>العمليات / المسار (Routing)</h4>
              <table class="mrp-table"><thead><tr><th>العملية</th><th>الماكينة</th><th>تجهيز</th><th>تشغيل</th><th></th></tr></thead>
              <tbody>${opRows}</tbody></table>
              <div class="mrp-addrow">
                <input id="mrpo_name_${b.id}" placeholder="اسم العملية" style="flex:1">
                <select id="mrpo_mach_${b.id}"><option value="">بدون ماكينة</option>${machOpts}</select>
                <input id="mrpo_setup_${b.id}" type="number" min="0" value="15" title="تجهيز (د)" style="width:64px">
                <input id="mrpo_run_${b.id}" type="number" min="0" value="30" title="تشغيل (د/قطعة)" style="width:72px">
                <button class="mrp-btn sm" onclick="mrpAddOp('${b.id}')">إضافة</button>
              </div>
            </div>
          </div>
          <div class="mrp-bom-meta">
            وحدة الإخراج: <input type="number" min="1" value="${num(b.outputQty)}" style="width:60px" onchange="mrpSetOutput('${b.id}',this.value)"> قطعة/دفعة
            ${b.notes ? `· <span class="mrp-muted">${esc(b.notes)}</span>` : ''}
          </div>
        </div>` : ''}
      </div>`;
    }).join('') || '<div class="mrp-empty">لا توجد قوائم مواد بعد — أنشئ منتجاً جديداً.</div>';

    return `
      <div class="mrp-kpis">
        <div class="mrp-kpi"><div class="v">${num(kpiProducts)}</div><div class="l">منتجات</div></div>
        <div class="mrp-kpi"><div class="v">${num(boms.length)}</div><div class="l">قوائم مواد (نسخ)</div></div>
        <div class="mrp-kpi"><div class="v">${num(kpiComps)}</div><div class="l">مكوّنات</div></div>
      </div>
      <div class="mrp-newbom">
        <input id="mrpNewProd" data-jarvis-field="mrp.new_product_name" placeholder="اسم منتج جديد (Finished Good)">
        <button class="mrp-btn" data-jarvis-action="mrp.create_bom" data-jarvis-label="إنشاء قائمة مواد جديدة" onclick="mrpCreateBom()">➕ إنشاء قائمة مواد</button>
      </div>
      ${cards}`;
  }

  /* ----- Tab 2: MRP Run ----- */
  function renderRun() {
    const omni = ensureData();
    const bomOpts = (omni.boms || []).filter(b => b.active)
      .map(b => `<option value="${b.id}">${esc(b.productName)} (v${b.version})</option>`).join('')
      || '<option value="">— لا توجد قوائم مواد فعّالة —</option>';

    const demandRows = (omni.mrpDemand || []).map((d, i) => {
      const b = bomById(d.bomId);
      return `<tr>
        <td>${b ? esc(b.productName) : '<span class="mrp-badge warn">قائمة محذوفة</span>'}</td>
        <td>${num(d.qty)}</td>
        <td>${esc(d.dueDate || '')}</td>
        <td>${esc(d.source || 'يدوي')}</td>
        <td><button class="mrp-x" onclick="mrpDelDemand(${i})">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="mrp-muted">لا توجد طلبات — أضف سطراً أو استورد من المبيعات</td></tr>';

    const run = state.lastRun;
    let results = '';
    if (run) {
      const matRows = run.materials.map(r => `<tr class="${r.net > 0 ? 'short' : ''}">
        <td>${esc(r.name)} ${r.isGhost ? '<span class="mrp-badge warn">غير مرتبط</span>' : ''}</td>
        <td>${num(r.gross)} ${esc(r.unit)}</td>
        <td>${num(r.available)}</td>
        <td><b>${num(r.net)}</b></td>
        <td>${r.net > 0 ? money(r.lineCost) : '<span class="mrp-badge ok">مكفي</span>'}</td>
        <td>${esc(r.supplier || '—')}</td>
      </tr>`).join('');

      const woRows = run.workOrders.map(w => `<tr>
        <td style="padding-right:${w.depth * 14}px">${w.depth > 0 ? '↳ ' : ''}${esc(w.product)}</td>
        <td>${num(w.qty)}</td>
        <td>${num(w.lots)}</td>
        <td>${w.depth === 0 ? 'منتج نهائي' : 'تجميعة فرعية'}</td>
      </tr>`).join('');

      results = `
        <div class="mrp-run-summary">
          <div class="mrp-kpi"><div class="v">${num(run.procurement.length)}</div><div class="l">مواد ناقصة</div></div>
          <div class="mrp-kpi"><div class="v">${money(run.totalCost)}</div><div class="l">كلفة الشراء المقترحة</div></div>
          <div class="mrp-kpi"><div class="v">${num(run.workOrders.length)}</div><div class="l">أوامر عمل مخططة</div></div>
        </div>
        <h4>متطلبات المواد (Gross → Net)</h4>
        <table class="mrp-table"><thead><tr><th>المادة</th><th>الإجمالي</th><th>المتاح</th><th>الصافي المطلوب</th><th>الكلفة</th><th>المورّد</th></tr></thead>
        <tbody>${matRows}</tbody></table>
        ${run.procurement.length ? `<div class="mrp-procure">
          <button class="mrp-btn" data-jarvis-action="mrp.route_purchases" data-jarvis-label="إرسال طلبات الشراء إلى مركز القيادة" onclick="mrpRoutePurchases()">📤 إرسال طلبات الشراء إلى مركز القيادة (${num(run.procurement.length)})</button>
          <span class="mrp-muted">تُنشأ كطلبات شراء بانتظار الموافقة — لا شيء يُنفّذ تلقائياً.</span>
        </div>` : '<div class="mrp-ok-banner">✅ المخزون كافٍ لكل الطلبات — لا حاجة لشراء.</div>'}
        <h4>أوامر العمل المخططة (متعددة المستويات)</h4>
        <table class="mrp-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>الدفعات</th><th>النوع</th></tr></thead>
        <tbody>${woRows}</tbody></table>`;
    }

    return `
      <div class="mrp-demand">
        <h4>طلب الإنتاج (Demand)</h4>
        <div class="mrp-addrow">
          <select id="mrpDemBom" data-jarvis-field="mrp.demand_bom_select" style="flex:1">${bomOpts}</select>
          <input id="mrpDemQty" data-jarvis-field="mrp.demand_qty_input" type="number" min="1" value="10" title="الكمية" style="width:80px">
          <input id="mrpDemDue" data-jarvis-field="mrp.demand_due_date_input" type="date" value="${addDaysISO(7)}" title="تاريخ التسليم">
          <button class="mrp-btn sm" data-jarvis-action="mrp.add_demand" data-jarvis-label="إضافة سطر طلب إنتاج" onclick="mrpAddDemand()">إضافة</button>
          <button class="mrp-btn sm ghost" data-jarvis-action="mrp.import_sales" data-jarvis-label="استيراد الطلبات من المبيعات" onclick="mrpImportSales()">⬇ استيراد من المبيعات</button>
        </div>
        <table class="mrp-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>التسليم</th><th>المصدر</th><th></th></tr></thead>
        <tbody>${demandRows}</tbody></table>
        <div class="mrp-runbar">
          <button class="mrp-btn big" data-jarvis-action="mrp.run_mrp" data-jarvis-label="تشغيل تخطيط المواد والاحتياجات MRP" onclick="mrpRun()">⚙️ تشغيل تخطيط المواد (MRP)</button>
          ${run ? `<span class="mrp-muted">آخر تشغيل: ${new Date(run.runAt).toLocaleString('ar')}</span>` : ''}
        </div>
      </div>
      ${results}`;
  }

  /* ----- Tab 3: Capacity ----- */
  function renderCapacity() {
    const model = capacityModel();
    const cap = model.cap;
    const sched = buildSchedule(model);
    const days = [];
    for (let i = 0; i < Math.min(14, model.workingDays); i++) days.push(addDaysISO(i).slice(5));

    const rows = model.rows.map(r => `<tr class="${r.overload ? 'over' : ''}">
      <td>${esc(r.name)}</td>
      <td>${(r.loadMin / 60).toFixed(1)} س</td>
      <td>${(r.capMinutes / 60).toFixed(0)} س</td>
      <td>
        <div class="mrp-bar"><div class="mrp-bar-fill ${r.overload ? 'over' : r.util > 80 ? 'hot' : ''}" style="width:${Math.min(100, r.util)}%"></div></div>
        <span>${num(r.util)}%</span>
      </td>
      <td>${r.overload ? '<span class="mrp-badge danger">تحميل زائد</span>' : r.util > 80 ? '<span class="mrp-badge warn">قريب من الحد</span>' : '<span class="mrp-badge ok">ضمن الطاقة</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="mrp-muted">شغّل MRP أولاً لحساب الأحمال، أو أضف أوامر عمل.</td></tr>';

    const gantt = sched.map(s => `<tr>
      <td class="mrp-gantt-name">${esc(s.name)} ${s.overflow ? '<span class="mrp-badge danger">يتجاوز الأفق</span>' : ''}</td>
      ${s.cells.map(c => `<td class="mrp-gantt-cell"><div class="mrp-gantt-bar" style="height:${Math.max(4, c)}%; background:${c > 90 ? '#ef4444' : c > 60 ? '#f59e0b' : '#10b981'}" title="${c}%"></div></td>`).join('')}
    </tr>`).join('');

    return `
      <div class="mrp-cap-config">
        <label>ساعات/يوم <input type="number" min="1" max="24" value="${num(cap.hoursPerDay)}" onchange="mrpSetCap('hoursPerDay',this.value)"></label>
        <label>أيام/أسبوع <input type="number" min="1" max="7" value="${num(cap.daysPerWeek)}" onchange="mrpSetCap('daysPerWeek',this.value)"></label>
        <label>أفق التخطيط (يوم) <input type="number" min="1" max="60" value="${num(cap.horizonDays)}" onchange="mrpSetCap('horizonDays',this.value)"></label>
        <span class="mrp-muted">السعة المتاحة لكل ماكينة: ${(model.dailyMin * model.workingDays / 60).toFixed(0)} ساعة على ${num(model.workingDays)} يوم عمل</span>
      </div>
      <h4>تحميل الطاقة لكل ماكينة (Capacity Load)</h4>
      <table class="mrp-table"><thead><tr><th>الماكينة</th><th>الحمل</th><th>السعة</th><th>الاستغلال</th><th>الحالة</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${gantt ? `<h4>الجدولة المحدودة (Finite Schedule)</h4>
      <div class="mrp-gantt-scroll"><table class="mrp-gantt"><thead><tr><th>الماكينة</th>${days.map(d => `<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${gantt}</tbody></table></div>` : ''}`;
  }

  /* ============================== HANDLERS ============================== */
  window.mrpSetTab = function (t) { state.tab = t; render(); };
  window.mrpToggleBom = function (id) { state.expandedBom = state.expandedBom === id ? null : id; render(); };

  window.mrpCreateBom = function () {
    const inp = document.getElementById('mrpNewProd');
    const name = (inp && inp.value || '').trim();
    if (!name) { toast('اكتب اسم المنتج', 'warning'); return; }
    const b = {
      id: uid('bom'), productName: name, productSku: 'FG-' + Date.now().toString(36).toUpperCase(),
      version: 1, active: true, outputQty: 1, unit: 'قطعة',
      components: [], operations: [], notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    O().boms.push(b); state.expandedBom = b.id; save(); render();
    toast('تم إنشاء قائمة المواد', 'success');
  };

  window.mrpNewVersion = function (id) {
    const src = bomById(id); if (!src) return;
    const sameProduct = (O().boms || []).filter(b => b.productName === src.productName);
    const maxV = Math.max(...sameProduct.map(b => b.version || 1));
    sameProduct.forEach(b => b.active = false);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid('bom'); copy.version = maxV + 1; copy.active = true;
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    O().boms.push(copy); state.expandedBom = copy.id; save(); render();
    toast('تم إنشاء نسخة جديدة v' + copy.version + ' (مفعّلة)', 'success');
  };

  window.mrpActivate = function (id) {
    const b = bomById(id); if (!b) return;
    (O().boms || []).filter(x => x.productName === b.productName).forEach(x => x.active = false);
    b.active = true; save(); render();
    toast('تم تفعيل النسخة v' + b.version, 'success');
  };

  window.mrpDelBom = function (id) {
    const b = bomById(id); if (!b) return;
    if (typeof window.confirm === 'function' && !window.confirm('حذف قائمة المواد "' + b.productName + ' v' + b.version + '"؟')) return;
    O().boms = (O().boms || []).filter(x => x.id !== id);
    if (state.expandedBom === id) state.expandedBom = null;
    save(); render();
  };

  window.mrpToggleCompSrc = function (id) {
    const kind = (document.getElementById('mrpc_kind_' + id) || {}).value;
    const mat = document.getElementById('mrpc_mat_' + id);
    const sub = document.getElementById('mrpc_sub_' + id);
    if (mat) mat.style.display = kind === 'subassembly' ? 'none' : '';
    if (sub) sub.style.display = kind === 'subassembly' ? '' : 'none';
  };

  window.mrpAddComp = function (id) {
    const b = bomById(id); if (!b) return;
    const kind = (document.getElementById('mrpc_kind_' + id) || {}).value || 'material';
    const qty = Number((document.getElementById('mrpc_qty_' + id) || {}).value) || 1;
    const scrap = Number((document.getElementById('mrpc_scrap_' + id) || {}).value) || 0;
    let refId, name;
    if (kind === 'subassembly') {
      refId = (document.getElementById('mrpc_sub_' + id) || {}).value;
      const sub = bomById(refId);
      if (!sub) { toast('اختر تجميعة فرعية صحيحة', 'warning'); return; }
      name = sub.productName + ' v' + sub.version;
    } else {
      refId = (document.getElementById('mrpc_mat_' + id) || {}).value;
      const m = materialById(refId);
      if (!m) { toast('اختر مادة', 'warning'); return; }
      name = m.name;
    }
    b.components = b.components || [];
    b.components.push({ kind, refId, name, qty, scrapPct: scrap });
    b.updatedAt = new Date().toISOString(); save(); render();
  };

  window.mrpDelComp = function (id, i) {
    const b = bomById(id); if (!b) return;
    (b.components || []).splice(i, 1); save(); render();
  };

  window.mrpAddOp = function (id) {
    const b = bomById(id); if (!b) return;
    const name = ((document.getElementById('mrpo_name_' + id) || {}).value || '').trim();
    if (!name) { toast('اكتب اسم العملية', 'warning'); return; }
    const machineId = (document.getElementById('mrpo_mach_' + id) || {}).value || '';
    const setupMin = Number((document.getElementById('mrpo_setup_' + id) || {}).value) || 0;
    const runMinPerUnit = Number((document.getElementById('mrpo_run_' + id) || {}).value) || 0;
    b.operations = b.operations || [];
    b.operations.push({ name, machineId, setupMin, runMinPerUnit });
    b.updatedAt = new Date().toISOString(); save(); render();
  };

  window.mrpDelOp = function (id, i) {
    const b = bomById(id); if (!b) return;
    (b.operations || []).splice(i, 1); save(); render();
  };

  window.mrpSetOutput = function (id, v) {
    const b = bomById(id); if (!b) return;
    b.outputQty = Math.max(1, Number(v) || 1); save();
  };

  /* --- Demand + run --- */
  window.mrpAddDemand = function () {
    const bomId = (document.getElementById('mrpDemBom') || {}).value;
    const qty = Number((document.getElementById('mrpDemQty') || {}).value) || 0;
    const dueDate = (document.getElementById('mrpDemDue') || {}).value || '';
    if (!bomId || qty <= 0) { toast('اختر منتجاً وكمية صحيحة', 'warning'); return; }
    ensureData().mrpDemand.push({ id: uid('dem'), bomId, qty, dueDate, source: 'يدوي' });
    save(); render();
  };

  window.mrpDelDemand = function (i) {
    (ensureData().mrpDemand || []).splice(i, 1); save(); render();
  };

  window.mrpImportSales = function () {
    const omni = ensureData();
    const orders = omni.salesOrders || omni.sales?.orders || omni.orders || [];
    let added = 0;
    (orders || []).forEach(o => {
      const lines = o.lines || o.items || [];
      lines.forEach(ln => {
        const name = ln.productName || ln.name || ln.product || '';
        const bom = activeBomFor(name);
        if (bom) {
          omni.mrpDemand.push({ id: uid('dem'), bomId: bom.id, qty: Number(ln.qty || ln.quantity || 1) || 1, dueDate: o.dueDate || o.expectedDate || addDaysISO(7), source: 'مبيعات' });
          added++;
        }
      });
    });
    if (added) { save(); render(); toast('تم استيراد ' + added + ' سطر من المبيعات', 'success'); }
    else toast('لا توجد طلبات مبيعات مطابقة لقوائم المواد', 'info');
  };

  window.mrpRun = function () {
    const r = runMrp();
    if (r) { render(); toast('اكتمل تشغيل MRP — ' + r.procurement.length + ' مادة ناقصة', 'success'); }
  };

  window.mrpRoutePurchases = function () {
    const run = state.lastRun;
    if (!run || !run.procurement.length) { toast('لا توجد مشتريات للإرسال', 'info'); return; }
    if (typeof window.createOmniRequest !== 'function') { toast('مركز القيادة غير متاح', 'warning'); return; }
    let n = 0;
    run.procurement.forEach(r => {
      try {
        window.createOmniRequest({
          type: 'purchase',
          title: 'طلب شراء MRP: ' + r.name,
          description: 'تخطيط MRP يقترح شراء ' + num(r.net) + ' ' + (r.unit || '') + ' من «' + r.name + '» (نقص عن الطلب) بكلفة ' + money(r.lineCost) + (r.supplier ? ' — المورّد: ' + r.supplier : ''),
          priority: r.lineCost > 100000 ? 'high' : 'normal',
          sourcePage: 'mrp',
          sourceType: 'mrp_procurement',
          sourceId: run.id + ':' + r.refId,
          payload: { materialId: r.refId, materialName: r.name, qty: r.net, unitCost: r.unitCost, totalCost: r.lineCost, supplier: r.supplier, mrpRunId: run.id }
        });
        n++;
      } catch (_) {}
    });
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'mrp', source: 'mrp', action: 'mrp_procurement_routed', summary: 'MRP أرسل ' + n + ' طلب شراء إلى مركز القيادة', payload: { count: n, total: run.totalCost } }); } catch (_) {}
    }
    toast('تم إرسال ' + n + ' طلب شراء إلى مركز القيادة للموافقة', 'success');
  };

  /* --- Capacity --- */
  window.mrpSetCap = function (key, v) {
    ensureData().mrpCapacity[key] = Math.max(1, Number(v) || 1); save(); render();
  };

  /* ============================ PAGE WIRING ============================= */
  function activatePage() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageMrp'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navMrp'); if (nav) nav.classList.add('active');
    window.currentPage = 'mrp';
    ensureData();
    render();
  }

  function wireSwitch() {
    if (window.__ptxMrpWrapped) return;
    if (typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'mrp') { try { activatePage(); } catch (e) { console.warn('MRP render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__ptxMrpWrapped = true;
  }

  function init() {
    wireSwitch();
    // If switchPage isn't ready yet, retry briefly (app.js may load after us).
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (window.__ptxMrpWrapped || tries > 40) { clearInterval(t); return; }
      wireSwitch();
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Expose a tiny API for the command palette / AI assistant if they want it.
  const api = { render, runMrp, ensureData, open: function () { try { window.switchPage('mrp'); } catch (_) {} } };
  window.OctagonMRP = api;
  window.PentagonMRP = api;
})();
