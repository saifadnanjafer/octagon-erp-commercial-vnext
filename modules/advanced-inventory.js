/*
 * Phase 7I - Advanced Inventory and Supply Chain Foundation.
 * Add-only, read-only over omni.materials. It prepares advanced inventory
 * surfaces (serial/lot/batch, expiry, min/max reorder, reserved vs available,
 * stock count sessions, internal stock requests, landed cost, barcode/QR labels,
 * supplier performance) WITHOUT changing any stock total, reservation, cost, or
 * posted movement. No new sidebar page is added; this injects into the existing
 * inventory page only.
 */
(function () {
  'use strict';

  const root = window;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = value => Number(value || 0);
  const fmt = value => {
    try { return typeof root.formatNum === 'function' ? root.formatNum(num(value)) : Math.round(num(value)).toLocaleString(); }
    catch (_) { return String(Math.round(num(value))); }
  };
  // NOTE: in this app `omni` is a lexical global (NOT window.omni). Sibling <script>
  // modules must reference the bare global, the same way modules/route-health.js does.
  function O() { try { if (typeof ensureOmni === 'function') ensureOmni(); return (typeof omni !== 'undefined' && omni) ? omni : null; } catch (_) { return null; } }
  function materials() { const o = O(); return (o && Array.isArray(o.materials)) ? o.materials : []; }
  function currency() { const o = O(); return o?.adminSettings?.organization?.currencySymbol || 'د.ع'; }

  function ensureState() {
    const o = O(); if (!o) return null;
    if (!o.advInventory || typeof o.advInventory !== 'object' || Array.isArray(o.advInventory)) o.advInventory = {};
    const s = o.advInventory;
    ['serialLots', 'expiryItems', 'reorderRules', 'countSessions', 'stockRequests', 'landedCosts', 'labels', 'supplierScores'].forEach(k => {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    s.policyVersion = s.policyVersion || 'phase7i-advanced-inventory-v1';
    s.mode = 'preview_only';
    s.updated_at = s.updated_at || new Date().toISOString();
    return s;
  }

  function available(m) { return num(m.stock) - num(m.reserved != null ? m.reserved : m.reservedQty); }
  function belowMin(m) { return num(m.stock) <= num(m.minimum); }
  function targetLevel(m) { return num(m.maximum) > 0 ? num(m.maximum) : Math.max(num(m.minimum) * 2, num(m.minimum) + 1); }

  function model() {
    const s = ensureState() || { serialLots: [], expiryItems: [], reorderRules: [], countSessions: [], stockRequests: [], landedCosts: [], labels: [], supplierScores: [] };
    const mats = materials();
    const tracked = mats.filter(m => m.tracking && m.tracking !== 'none');
    const expiryItems = mats.filter(m => m.expiry || m.expiryDate || m.shelfLifeDays);
    const reorderNeeded = mats.filter(belowMin);
    const totalReserved = mats.reduce((sum, m) => sum + num(m.reserved != null ? m.reserved : m.reservedQty), 0);
    const totalAvailable = mats.reduce((sum, m) => sum + available(m), 0);
    const labelled = mats.filter(m => m.barcode || m.sku || m.qr);
    const suppliers = Array.from(new Set(mats.map(m => m.supplierId || m.supplier).filter(Boolean)));
    const checks = [
      ['Serial / lot / batch', tracked.length > 0, `${tracked.length} of ${mats.length} materials use lot/serial tracking (rest default to 'none')`],
      ['Expiry tracking', true, expiryItems.length > 0 ? `${expiryItems.length} materials carry expiry metadata` : 'No expiry-tracked items yet; foundation root prepared'],
      ['Min / max reorder', mats.length > 0, `${reorderNeeded.length} materials at/below minimum need reorder`],
      ['Reserved vs available', true, `${fmt(totalReserved)} reserved, ${fmt(totalAvailable)} available across ${mats.length} materials`],
      ['Stock count sessions', true, `${s.countSessions.length} count sessions recorded (read-only; counts never auto-post)`],
      ['Internal stock requests', true, `${s.stockRequests.length} internal stock requests in foundation root`],
      ['Landed cost', true, `${s.landedCosts.length} landed-cost allocations (preview only; no cost re-posting)`],
      ['Barcode / QR labels', true, `${labelled.length} materials have a barcode/SKU for label rendering`],
      ['Supplier performance', suppliers.length > 0, `${suppliers.length} distinct suppliers available for scoring`]
    ];
    return { mats, tracked, expiryItems, reorderNeeded, totalReserved, totalAvailable, labelled, suppliers, checks };
  }

  function pill(ok) { return `<span class="ai7i-pill ${ok ? 'ok' : 'warn'}">${ok ? 'ready' : 'needs data'}</span>`; }

  function renderPanel() {
    const m = model();
    const host = document.getElementById('inventoryBody') || document.getElementById('pageInventory');
    if (!host) return;
    let panel = document.getElementById('phase7iAdvInventoryPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'phase7iAdvInventoryPanel';
      panel.className = 'ai7i-panel';
      host.prepend(panel);
    }
    panel.innerHTML = `
      <div class="ai7i-head">
        <div><h3>Phase 7I Advanced Inventory and Supply Chain</h3><div class="ai7i-note">Read-only foundation. No stock total, reservation, cost, or posted movement is changed from this panel.</div></div>
        <span class="ai7i-pill ok">foundation</span>
      </div>
      <div class="ai7i-grid">
        <div class="ai7i-kpi"><strong>${m.mats.length}</strong><span>materials</span></div>
        <div class="ai7i-kpi"><strong>${m.reorderNeeded.length}</strong><span>at/below minimum</span></div>
        <div class="ai7i-kpi"><strong>${fmt(m.totalReserved)}</strong><span>reserved units</span></div>
        <div class="ai7i-kpi"><strong>${m.suppliers.length}</strong><span>suppliers</span></div>
      </div>
      <div class="ai7i-table-wrap"><table class="ai7i-table"><thead><tr><th>Capability</th><th>Status</th><th>Evidence</th></tr></thead>
        <tbody>${m.checks.map(row => `<tr><td><strong>${esc(row[0])}</strong></td><td>${pill(row[1])}</td><td class="ai7i-note">${esc(row[2])}</td></tr>`).join('')}</tbody></table></div>
      <div class="ai7i-actions">
        <button type="button" class="btn-secondary btn-sm" onclick="AdvancedInventory.renderReorderPreview()">Preview reorder suggestions</button>
      </div>
      <pre class="ai7i-pre" id="phase7iReorderPreview" style="display:none"></pre>`;
  }

  function renderReorderPreview() {
    const out = document.getElementById('phase7iReorderPreview');
    if (!out) return;
    const m = model();
    const suggestions = m.reorderNeeded.map(mat => ({
      material: mat.name || mat.id,
      stock: num(mat.stock),
      minimum: num(mat.minimum),
      target: targetLevel(mat),
      suggestedOrderQty: Math.max(0, targetLevel(mat) - num(mat.stock)),
      supplier: mat.supplier || '',
      unitCost: num(mat.unitCost || mat.cost)
    }));
    out.textContent = JSON.stringify({
      generatedAt: new Date().toISOString(),
      mode: 'preview_only',
      note: 'Suggestions only — no purchase order or stock movement is created.',
      currency: currency(),
      suggestions
    }, null, 2);
    out.style.display = '';
  }

  function wire() {
    if (root.__phase7iAdvInventoryWrapped) return;
    root.__phase7iAdvInventoryWrapped = true;
    const originalRender = root.renderInventoryPage;
    if (typeof originalRender === 'function') {
      root.renderInventoryPage = function () {
        const result = originalRender.apply(this, arguments);
        if (result && typeof result.then === 'function') result.then(() => setTimeout(renderPanel, 0));
        else setTimeout(renderPanel, 0);
        return result;
      };
    }
    const originalSwitch = root.switchPage;
    if (typeof originalSwitch === 'function') {
      root.switchPage = function (page) {
        const result = originalSwitch.apply(this, arguments);
        if (page === 'inventory') setTimeout(renderPanel, 250);
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

  root.AdvancedInventory = { ensureState, model, renderPanel, renderReorderPreview, version: 'phase7i-v1' };
})();
