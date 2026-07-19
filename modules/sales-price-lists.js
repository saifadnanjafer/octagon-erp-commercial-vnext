(function () {
  'use strict';

  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function save() { if (window.saveData) window.saveData(); }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }
  function uid(p) { return (p || 'spl') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function money(n) { return Math.round(Number(n) || 0); }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function nowISO() { return new Date().toISOString(); }

  var activeTab = 'lists';
  var _wired = false;

  function ensureData() {
    var o = O();
    if (!o.priceLists) o.priceLists = {};
    var pl = o.priceLists;
    if (!Array.isArray(pl.lists)) pl.lists = [];
    if (!Array.isArray(pl.items)) pl.items = [];
    return pl;
  }

  function PL() { return ensureData(); }

  function getCustomers() { var f = O().finance; return f && f.customers ? f.customers : []; }
  function getMaterials() { var o = O(); return o.materials || []; }

  function listsView() {
    var pl = PL();
    var html = '<div class="spl-form-row" style="margin-bottom:1rem">';
    html += '<div class="spl-form-group"><label>اسم القائمة</label><input id="splName" placeholder="مثال: أسعار الجملة"></div>';
    html += '<div class="spl-form-group"><label>النوع</label><select id="splType"><option value="wholesale">جملة</option><option value="retail">تجزئة</option><option value="customer">عميل محدد</option><option value="branch">فرع</option><option value="contract">عقد</option></select></div>';
    html += '<div class="spl-form-group"><label>العميل (للأنواع المحددة)</label><select id="splCustomer"><option value="">-- عام --</option>';
    getCustomers().forEach(function (c) { html += '<option value="' + esc(c.id) + '">' + esc(c.name || c.companyName || '') + '</option>'; });
    html += '</select></div>';
    html += '<div class="spl-form-group" style="display:flex;align-items:flex-end"><button class="spl-btn spl-btn-primary" onclick="splAddList()">➕ إضافة</button></div>';
    html += '</div>';

    if (pl.lists.length === 0) return html + '<div class="spl-empty">لا توجد قوائم أسعار.</div>';
    html += '<table class="spl-table"><thead><tr><th>القائمة</th><th>النوع</th><th>العميل</th><th>عدد العناصر</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>';
    pl.lists.forEach(function (l) {
      var itemCount = pl.items.filter(function (i) { return i.listId === l.id; }).length;
      var cust = getCustomers().find(function (c) { return c.id === l.customerId; });
      html += '<tr><td><strong>' + esc(l.name) + '</strong></td>' +
        '<td>' + esc(l.type) + '</td>' +
        '<td>' + (cust ? esc(cust.name) : 'عام') + '</td>' +
        '<td>' + itemCount + '</td>' +
        '<td><span class="spl-badge ' + (l.active !== false ? 'spl-badge-active' : 'spl-badge-inactive') + '">' + (l.active !== false ? 'نشطة' : 'موقفة') + '</span></td>' +
        '<td><button class="spl-btn spl-btn-sm spl-btn-success" onclick="splOpenList(\'' + l.id + '\')">✏️ تحرير</button> ' +
        '<button class="spl-btn spl-btn-sm spl-btn-danger" onclick="splDeleteList(\'' + l.id + '\')">حذف</button></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function listDetailView(listId) {
    var pl = PL();
    var list = pl.lists.find(function (l) { return l.id === listId; });
    if (!list) return '<div class="spl-empty">القائمة غير موجودة.</div>';
    var items = pl.items.filter(function (i) { return i.listId === listId; });
    var html = '<div style="margin-bottom:1rem"><strong>' + esc(list.name) + '</strong> ';
    html += '<button class="spl-btn spl-btn-sm spl-btn-primary" onclick="splSetView(\'lists\')">🔙 رجوع</button></div>';

    html += '<div class="spl-form-row" style="margin-bottom:1rem">';
    html += '<div class="spl-form-group"><label>المنتج</label><select id="splItemMaterial"><option value="">-- اختر --</option>';
    getMaterials().forEach(function (m) { html += '<option value="' + esc(m.id) + '">' + esc(m.name || m.description || '') + '</option>'; });
    html += '</select></div>';
    html += '<div class="spl-form-group"><label>السعر</label><input id="splItemPrice" type="number" placeholder="0"></div>';
    html += '<div class="spl-form-group"><label>أقل كمية</label><input id="splItemMinQty" type="number" placeholder="1" value="1"></div>';
    html += '<div class="spl-form-group" style="display:flex;align-items:flex-end"><button class="spl-btn spl-btn-success" onclick="splAddItem(\'' + listId + '\')">➕ إضافة</button></div>';
    html += '</div>';

    if (items.length === 0) return html + '<div class="spl-empty">لا توجد عناصر في هذه القائمة.</div>';
    html += '<table class="spl-table"><thead><tr><th>المنتج</th><th>السعر</th><th>أقل كمية</th><th>إجراءات</th></tr></thead><tbody>';
    items.forEach(function (item) {
      html += '<tr><td>' + esc(item.materialName || item.materialId) + '</td>' +
        '<td>' + fmt(item.price) + '</td>' +
        '<td>' + (item.minQty || 1) + '</td>' +
        '<td><button class="spl-btn spl-btn-sm spl-btn-danger" onclick="splDeleteItem(\'' + item.id + '\')">حذف</button></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function render() {
    ensureData();
    var container = document.getElementById('salesPriceListsBody');
    if (!container) return;
    if (activeTab === 'lists') {
      container.innerHTML = '<div class="spl-wrap"><div class="spl-content">' + listsView() + '</div></div>';
    } else if (activeTab.startsWith('list_')) {
      var listId = activeTab.replace('list_', '');
      container.innerHTML = '<div class="spl-wrap"><div class="spl-content">' + listDetailView(listId) + '</div></div>';
    }
  }

  window.splSetView = function (tab) { activeTab = tab; render(); };

  window.splAddList = function () {
    var nameEl = document.getElementById('splName');
    var typeEl = document.getElementById('splType');
    var custEl = document.getElementById('splCustomer');
    if (!nameEl || !nameEl.value.trim()) { toast('أدخل اسم القائمة', 'error'); return; }
    var pl = PL();
    pl.lists.push({
      id: uid('spl'),
      name: nameEl.value.trim(),
      type: typeEl.value,
      customerId: custEl ? custEl.value : '',
      active: true,
      createdAt: nowISO()
    });
    nameEl.value = '';
    save();
    toast('تمت إضافة قائمة الأسعار');
    render();
  };

  window.splOpenList = function (id) { activeTab = 'list_' + id; render(); };

  window.splDeleteList = function (id) {
    if (!confirm('حذف قائمة الأسعار؟')) return;
    var pl = PL();
    pl.lists = pl.lists.filter(function (l) { return l.id !== id; });
    pl.items = pl.items.filter(function (i) { return i.listId !== id; });
    save();
    render();
  };

  window.splAddItem = function (listId) {
    var matEl = document.getElementById('splItemMaterial');
    var priceEl = document.getElementById('splItemPrice');
    var minEl = document.getElementById('splItemMinQty');
    if (!matEl || !matEl.value) { toast('اختر المنتج', 'error'); return; }
    var price = Number(priceEl ? priceEl.value : 0);
    if (price <= 0) { toast('أدخل السعر', 'error'); return; }
    var mats = getMaterials();
    var mat = mats.find(function (m) { return m.id === matEl.value; });
    var pl = PL();
    pl.items.push({
      id: uid('spli'),
      listId: listId,
      materialId: matEl.value,
      materialName: mat ? (mat.name || mat.description || '') : matEl.value,
      price: money(price),
      minQty: Number(minEl ? minEl.value : 1),
      createdAt: nowISO()
    });
    matEl.value = '';
    priceEl.value = '';
    save();
    toast('تمت إضافة عنصر السعر');
    render();
  };

  window.splDeleteItem = function (id) {
    PL().items = PL().items.filter(function (i) { return i.id !== id; });
    save();
    render();
  };

  function activatePage() {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('page-active'); });
    document.querySelectorAll('.nav-btn').forEach(function (n) { n.classList.remove('active'); });
    var page = document.getElementById('pageSalesPriceLists');
    if (page) page.classList.add('page-active');
    var nav = document.getElementById('navSalesPriceLists');
    if (nav) nav.classList.add('active');
    window.currentPage = 'sales_price_lists';
    render();
  }

  function wireSwitch() {
    if (_wired) return;
    if (typeof window.switchPage !== 'function') return;
    var orig = window.switchPage;
    if (orig.__splWired) return;
    window.switchPage = function (page) {
      if (page === 'sales_price_lists') { activatePage(); return; }
      return orig.apply(this, arguments);
    };
    window.switchPage.__splWired = true;
    _wired = true;
  }

  function init() {
    ensureData();
    wireSwitch();
    var tries = 0;
    function retry() {
      if (tries > 40) return;
      tries++;
      wireSwitch();
      if (!_wired) setTimeout(retry, 150);
    }
    setTimeout(retry, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonPriceLists = {
    ensureData: ensureData,
    render: render,
    open: function () { window.switchPage('sales_price_lists'); }
  };
})();
