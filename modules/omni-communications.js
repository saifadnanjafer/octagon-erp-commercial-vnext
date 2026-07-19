(function () {
  'use strict';

  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function save() { if (window.saveData) window.saveData(); }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }
  function uid(p) { return (p || 'comm') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function nowISO() { return new Date().toISOString(); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  var activeTab = 'share';
  var _wired = false;

  function ensureData() {
    var o = O();
    if (!o.communications) o.communications = {};
    var c = o.communications;
    if (!Array.isArray(c.sent)) c.sent = [];
    if (!Array.isArray(c.templates)) c.templates = [];
    if (!c.settings) c.settings = { whatsappNumber: '', emailSender: '' };
    return c;
  }

  function CM() { return ensureData(); }

  function getInvoices() {
    var sc = O().salesCrm;
    return sc && sc.invoices ? sc.invoices : [];
  }

  function getQuotations() {
    var sc = O().salesCrm;
    return sc && sc.quotations ? sc.quotations : [];
  }

  function getCustomers() {
    var f = O().finance;
    return f && f.customers ? f.customers : [];
  }

  function getPOS() {
    var o = O();
    return o.posSales || [];
  }

  function shareView() {
    var html = '<div class="comm-share-card">';
    html += '<h3>📤 مشاركة فاتورة</h3>';
    html += '<div class="comm-form-group"><label>الفاتورة</label><select id="commInvoice"><option value="">-- اختر --</option>';
    getInvoices().forEach(function (inv) {
      html += '<option value="' + esc(inv.id) + '">' + esc(inv.reference || inv.id) + ' - ' + esc(inv.customerName || '') + '</option>';
    });
    html += '</select></div>';
    html += '<div class="comm-form-group"><label>عبر</label><select id="commInvoiceChannel"><option value="whatsapp">واتساب</option><option value="email">بريد إلكتروني</option></select></div>';
    html += '<button class="comm-btn comm-btn-success" onclick="commShareInvoice()">📤 إرسال</button>';
    html += '</div>';

    html += '<div class="comm-share-card">';
    html += '<h3>📄 مشاركة عرض سعر</h3>';
    html += '<div class="comm-form-group"><label>عرض السعر</label><select id="commQuotation"><option value="">-- اختر --</option>';
    getQuotations().forEach(function (q) {
      html += '<option value="' + esc(q.id) + '">' + esc(q.reference || q.id) + ' - ' + esc(q.customerName || '') + '</option>';
    });
    html += '</select></div>';
    html += '<div class="comm-form-group"><label>عبر</label><select id="commQuoteChannel"><option value="whatsapp">واتساب</option><option value="email">بريد إلكتروني</option></select></div>';
    html += '<button class="comm-btn comm-btn-success" onclick="commShareQuotation()">📤 إرسال</button>';
    html += '</div>';

    html += '<div class="comm-share-card">';
    html += '<h3>🧾 مشاركة إيصال نقطة بيع</h3>';
    html += '<div class="comm-form-group"><label>الإيصال</label><select id="commReceipt"><option value="">-- اختر --</option>';
    getPOS().forEach(function (s) {
      html += '<option value="' + esc(s.id) + '">' + esc(s.reference || s.id) + ' - ' + fmtMoney(s.total) + '</option>';
    });
    html += '</select></div>';
    html += '<div class="comm-form-group"><label>رقم الهاتف</label><input id="commReceiptPhone" placeholder="077xxxxxxxx"></div>';
    html += '<button class="comm-btn comm-btn-success" onclick="commShareReceipt()">📤 إرسال</button>';
    html += '</div>';

    return html;
  }

  function fmtMoney(n) { return (Math.round(Number(n) || 0)).toLocaleString(); }

  function historyView() {
    var c = CM();
    if (c.sent.length === 0) return '<div class="comm-empty">لا توجد رسائل مرسلة سابقة.</div>';
    var html = '<table class="comm-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>المرجع</th><th>القناة</th><th>المستلم</th><th>الحالة</th></tr></thead><tbody>';
    c.sent.forEach(function (s) {
      html += '<tr><td>' + (s.createdAt || '').slice(0, 16) + '</td>' +
        '<td>' + esc(s.docType || '') + '</td>' +
        '<td>' + esc(s.reference || '') + '</td>' +
        '<td>' + (s.channel === 'whatsapp' ? '📱 واتساب' : '📧 بريد') + '</td>' +
        '<td>' + esc(s.recipient || '') + '</td>' +
        '<td><span class="comm-badge comm-badge-sent">مرسل</span></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function settingsView() {
    var s = CM().settings;
    return '<div style="max-width:400px">' +
      '<div class="comm-form-group"><label>رقم واتساب (للمشاركة)</label><input id="commWA" value="' + esc(s.whatsappNumber || '') + '"></div>' +
      '<div class="comm-form-group"><label>البريد الإلكتروني (للمشاركة)</label><input id="commEmail" value="' + esc(s.emailSender || '') + '"></div>' +
      '<button class="comm-btn comm-btn-primary" onclick="commSaveSettings()">💾 حفظ</button>' +
      '</div>';
  }

  function render() {
    ensureData();
    var container = document.getElementById('omniCommunicationsBody');
    if (!container) return;
    var content = '';
    if (activeTab === 'share') content = shareView();
    else if (activeTab === 'history') content = historyView();
    else if (activeTab === 'settings') content = settingsView();
    container.innerHTML = '<div class="comm-toolbar">' +
      '<button class="' + (activeTab === 'share' ? 'active' : '') + '" onclick="commSetView(\'share\')">📤 مشاركة</button>' +
      '<button class="' + (activeTab === 'history' ? 'active' : '') + '" onclick="commSetView(\'history\')">📋 السجل</button>' +
      '<button class="' + (activeTab === 'settings' ? 'active' : '') + '" onclick="commSetView(\'settings\')">⚙️ الإعدادات</button>' +
      '</div><div class="comm-content">' + content + '</div>';
  }

  window.commSetView = function (tab) { activeTab = tab; render(); };

  function logSent(docType, reference, channel, recipient) {
    CM().sent.push({
      id: uid('sent'),
      docType: docType,
      reference: reference,
      channel: channel,
      recipient: recipient,
      createdAt: nowISO()
    });
    save();
  }

  window.commShareInvoice = function () {
    var invEl = document.getElementById('commInvoice');
    var chEl = document.getElementById('commInvoiceChannel');
    if (!invEl || !invEl.value) { toast('اختر الفاتورة', 'error'); return; }
    var inv = getInvoices().find(function (i) { return i.id === invEl.value; });
    var channel = chEl ? chEl.value : 'whatsapp';
    var msg = '🧾 فاتورة ' + (inv ? inv.reference : '') + '\nالمبلغ: ' + (inv ? fmtMoney(inv.total) : '') + '\nشكراً لتعاملكم معنا.';
    if (channel === 'whatsapp') {
      var waNum = CM().settings.whatsappNumber;
      var url = 'https://wa.me/' + (waNum || '000') + '?text=' + encodeURIComponent(msg);
      window.open(url, '_blank');
    } else {
      toast('📧 تم نسخ الفاتورة للحافظة. أرسلها عبر بريدك الإلكتروني.', 'info');
    }
    logSent('فاتورة', inv ? inv.reference : '', channel, inv ? inv.customerName : '');
    toast('✅ تمت المشاركة');
  };

  window.commShareQuotation = function () {
    var qEl = document.getElementById('commQuotation');
    var chEl = document.getElementById('commQuoteChannel');
    if (!qEl || !qEl.value) { toast('اختر عرض السعر', 'error'); return; }
    var q = getQuotations().find(function (i) { return i.id === qEl.value; });
    var channel = chEl ? chEl.value : 'whatsapp';
    var msg = '📄 عرض سعر ' + (q ? q.reference : '') + '\nالمبلغ: ' + (q ? fmtMoney(q.total) : '') + '\nللاطلاع على التفاصيل، يرجى زيارة بوابة العميل.';
    if (channel === 'whatsapp') {
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    } else {
      toast('📧 تم نسخ عرض السعر.', 'info');
    }
    logSent('عرض سعر', q ? q.reference : '', channel, q ? q.customerName : '');
    toast('✅ تمت المشاركة');
  };

  window.commShareReceipt = function () {
    var rEl = document.getElementById('commReceipt');
    var phEl = document.getElementById('commReceiptPhone');
    if (!rEl || !rEl.value) { toast('اختر الإيصال', 'error'); return; }
    var sale = getPOS().find(function (s) { return s.id === rEl.value; });
    var phone = phEl ? phEl.value : '';
    var msg = '🧾 إيصال شراء: ' + (sale ? sale.reference : '') + '\nالمبلغ: ' + (sale ? fmtMoney(sale.total) : '') + '\nشكراً لتسوقكم معنا.';
    window.open('https://wa.me/' + (phone || '000') + '?text=' + encodeURIComponent(msg), '_blank');
    logSent('إيصال', sale ? sale.reference : '', 'whatsapp', phone);
    toast('✅ تمت المشاركة');
  };

  window.commSaveSettings = function () {
    var waEl = document.getElementById('commWA');
    var emEl = document.getElementById('commEmail');
    var s = CM().settings;
    s.whatsappNumber = waEl ? waEl.value : '';
    s.emailSender = emEl ? emEl.value : '';
    save();
    toast('تم حفظ الإعدادات');
  };

  function activatePage() {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('page-active'); });
    document.querySelectorAll('.nav-btn').forEach(function (n) { n.classList.remove('active'); });
    var page = document.getElementById('pageOmniCommunications');
    if (page) page.classList.add('page-active');
    var nav = document.getElementById('navOmniCommunications');
    if (nav) nav.classList.add('active');
    window.currentPage = 'omni_communications';
    render();
  }

  function wireSwitch() {
    if (_wired) return;
    if (typeof window.switchPage !== 'function') return;
    var orig = window.switchPage;
    if (orig.__commWired) return;
    window.switchPage = function (page) {
      if (page === 'omni_communications') { activatePage(); return; }
      return orig.apply(this, arguments);
    };
    window.switchPage.__commWired = true;
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

  window.OctagonCommunications = { ensureData: ensureData, render: render, open: function () { window.switchPage('omni_communications'); } };
})();
