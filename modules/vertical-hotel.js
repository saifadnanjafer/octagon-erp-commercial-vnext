/**
 * OCTAGON ERP — Hotel Vertical (Phase 5).
 * Complete hotel management module on shared engines:
 *  - Room Inventory: room number, type (single, double, suite), price per night, status (available/occupied/maintenance/dirty).
 *  - Bookings / Check-in: Guest registry, room selection, check-in date, check-out date, check-in/out states.
 *  - Room Service / Extra Charges: Append food, laundry, spa charges to the guest's folio/bill.
 *  - Housekeeping Logs: Manage cleaning of rooms (transition dirty -> available).
 *  - Checkout / Checkout Billing: Auto-calculates total stay cost + extra charges, processes checkout payment, and logs transaction to ERP.
 *  - Jarvis tool: report_hotel_today.
 */
(function () {
  'use strict';

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
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {}
    return 'موظف الاستقبال';
  }

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.hotel || typeof o.hotel !== 'object') o.hotel = {};
    const h = o.hotel;
    if (!Array.isArray(h.rooms)) h.rooms = [];
    if (!Array.isArray(h.bookings)) h.bookings = [];
    if (!Array.isArray(h.extraCharges)) h.extraCharges = [];
    if (!Array.isArray(h.housekeeping)) h.housekeeping = [];
    return h;
  }
  function H() { return ensureData(); }

  function getRooms() {
    const list = H()?.rooms || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getBookings() {
    const list = H()?.bookings || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getExtraCharges() {
    const list = H()?.extraCharges || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getHousekeeping() {
    const list = H()?.housekeeping || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }

  const STATUS_LABEL = { available: 'متاح', occupied: 'مشغول', maintenance: 'صيانة', dirty: 'غير نظيف' };
  const STATUS_CLASS = { available: 'ht-status-avail', occupied: 'ht-status-occ', maintenance: 'ht-status-maint', dirty: 'ht-status-dirty' };

  let activeTab = 'dashboard';
  let editingRoomId = null;
  let viewingBookingId = null;
  let roomSearch = '';

  window.htOpenTab = function (tab) {
    activeTab = tab;
    document.querySelectorAll('.ht-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderTabContent();
  };

  /* ─────────────── Room Actions ─────────────── */
  window.htSaveRoom = function () {
    const h = H(); if (!h) return;
    const num = val('htRoomNum');
    if (!num) { toast('رقم الغرفة مطلوب', 'warning'); return; }
    const base = {
      num, type: val('htRoomType'), status: val('htRoomStatus') || 'available',
      price: numVal('htRoomPrice')
    };
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    if (editingRoomId) {
      const r = h.rooms.find(x => x.id === editingRoomId);
      if (r) Object.assign(r, base);
      toast('تم تحديث الغرفة', 'success');
    } else {
      h.rooms.push({ id: uid('htr'), ...base, companyId: coId, createdAt: new Date().toISOString() });
      toast('تم إضافة الغرفة: ' + num, 'success');
    }
    editingRoomId = null; save(); renderHotel();
  };
  window.htOpenRoomForm = function (id) { editingRoomId = id || null; activeTab = 'rooms'; renderHotel(); };
  window.htCancelRoomForm = function () { editingRoomId = null; renderHotel(); };

  /* ─────────────── Booking / Check-in Actions ─────────────── */
  window.htSaveBooking = function () {
    const h = H(); if (!h) return;
    const guest = val('htBookGuest');
    const roomId = val('htBookRoom');
    const checkin = val('htBookCheckin');
    const checkout = val('htBookCheckout');
    if (!guest || !roomId || !checkin || !checkout) { toast('يرجى ملء كافة الحقول', 'warning'); return; }
    
    const room = h.rooms.find(r => r.id === roomId);
    if (!room) return;

    const nights = Math.max(1, Math.round((new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)));
    const totalAmount = nights * room.price;

    const bookId = uid('htb');
    const ref = 'HTL-' + Date.now().toString().slice(-6).toUpperCase();

    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    h.bookings.push({
      id: bookId, ref, guest, phone: val('htBookPhone'), roomId, roomNum: room.num,
      checkin, checkout, nights, status: 'checked_in', totalAmount, paid: false,
      companyId: coId,
      createdAt: new Date().toISOString()
    });

    room.status = 'occupied';
    toast('تم تسجيل الدخول للغرفة ' + room.num, 'success');
    save(); activeTab = 'bookings'; renderHotel();
  };

  window.htOpenCheckout = function (bookingId) {
    viewingBookingId = bookingId;
    activeTab = 'checkout';
    renderHotel();
  };

  window.htProcessCheckout = function () {
    const h = H(); if (!h) return;
    const b = h.bookings.find(x => x.id === viewingBookingId);
    if (!b) return;

    // Calculate room service charges
    const extraCharges = h.extraCharges.filter(c => c.bookingId === viewingBookingId && !c.paid);
    const extraTotal = extraCharges.reduce((s, c) => s + c.amount, 0);
    const finalTotal = b.totalAmount + extraTotal;

    b.status = 'checked_out';
    b.paid = true;
    b.finalAmount = finalTotal;

    // Room is now dirty and needs housekeeping
    const room = h.rooms.find(r => r.id === b.roomId);
    if (room) room.status = 'dirty';

    // Set extra charges as paid
    extraCharges.forEach(c => c.paid = true);

    // Record Transaction to Shared Ledger
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        window.addFinanceTransaction({
          id: uid('httxn'), type: 'income', amount: finalTotal,
          category: 'إيرادات فندقية', note: b.ref + ' — مغادرة نزيل: ' + b.guest + ' (غرفة ' + b.roomNum + ')',
          sourceType: 'hotel_checkout', sourceId: viewingBookingId, companyId: b.companyId || '', at: new Date().toISOString(), by: userName()
        });
      } catch (_) {}
    }

    toast('تمت مغادرة النزيل وتسوية الفاتورة: ' + fmt(finalTotal) + ' ' + curSym(), 'success');
    viewingBookingId = null; save(); activeTab = 'bookings'; renderHotel();
  };

  /* ─────────────── Room Service / Extra Charges ─────────────── */
  window.htAddCharge = function () {
    const h = H(); if (!h) return;
    const bookingId = val('htChargeBooking');
    const desc = val('htChargeDesc');
    const amount = numVal('htChargeAmount');
    if (!bookingId || !desc || !amount) { toast('كافة حقول الرسوم مطلوبة', 'warning'); return; }

    const b = h.bookings.find(bk => bk.id === bookingId);
    const coId = b?.companyId || (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';

    h.extraCharges.push({
      id: uid('htc'), bookingId, desc, amount, paid: false, companyId: coId, at: new Date().toISOString()
    });

    toast('تمت إضافة الخدمة للفاتورة', 'success');
    save(); renderHotel();
  };

  /* ─────────────── Housekeeping Actions ─────────────── */
  window.htCleanRoom = function (roomId) {
    const h = H(); if (!h) return;
    const room = h.rooms.find(r => r.id === roomId);
    if (!room) return;
    room.status = 'available';
    const coId = room.companyId || (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    h.housekeeping.push({
      id: uid('hth'), roomId, roomNum: room.num, action: 'تنظيف وتجهيز',
      by: userName(), companyId: coId, at: new Date().toISOString()
    });
    toast('تم تنظيف الغرفة وتغيير حالتها إلى متاحة', 'success');
    save(); renderHotel();
  };

  /* ─────────────── Demo Data ─────────────── */
  window.htLoadDemo = function () {
    const h = H(); if (!h) return;
    if (h.rooms.length) { toast('البيانات التجريبية موجودة بالفعل', 'info'); return; }
    h.rooms.push(
      { id: uid('htr'), num: '101', type: 'single', status: 'available', price: 45000, createdAt: new Date().toISOString() },
      { id: uid('htr'), num: '102', type: 'single', status: 'dirty', price: 45000, createdAt: new Date().toISOString() },
      { id: uid('htr'), num: '201', type: 'double', status: 'available', price: 75000, createdAt: new Date().toISOString() },
      { id: uid('htr'), num: '202', type: 'double', status: 'available', price: 75000, createdAt: new Date().toISOString() },
      { id: uid('htr'), num: '301', type: 'suite', status: 'available', price: 150000, createdAt: new Date().toISOString() }
    );
    toast('تم إضافة 5 غرف تجريبية', 'success');
    save(); renderHotel();
  };

  /* ─────────────── Render Functions ─────────────── */
  function renderDashboard() {
    const el = document.getElementById('htDashBody'); if (!el) return;
    const rooms = getRooms();
    const activeB = getBookings().filter(b => b.status === 'checked_in');
    const revenue = getBookings().filter(b => b.paid).reduce((s, b) => s + (b.finalAmount || b.totalAmount), 0);
    const occupancy = rooms.length ? Math.round((rooms.filter(r => r.status === 'occupied').length / rooms.length) * 100) : 0;
    const dirtyRooms = rooms.filter(r => r.status === 'dirty').length;

    el.innerHTML = `
      <div class="ht-kpi-row">
        <div class="ht-kpi"><div class="ht-kpi-val">${rooms.length}</div><div class="ht-kpi-lbl">إجمالي الغرف</div></div>
        <div class="ht-kpi"><div class="ht-kpi-val">${occupancy}%</div><div class="ht-kpi-lbl">نسبة الإشغال</div></div>
        <div class="ht-kpi"><div class="ht-kpi-val">${activeB.length}</div><div class="ht-kpi-lbl">النزلاء الحاليين</div></div>
        <div class="ht-kpi"><div class="ht-kpi-val">${fmt(revenue)} ${curSym()}</div><div class="ht-kpi-lbl">إيرادات الفندق</div></div>
        <div class="ht-kpi ht-kpi-warn"><div class="ht-kpi-val">${dirtyRooms}</div><div class="ht-kpi-lbl">غرف تحتاج تنظيف</div></div>
      </div>
      <div class="ht-toolbar">
        <button class="btn-primary" onclick="htLoadDemo()">تحميل بيانات تجريبية</button>
      </div>`;
  }

  function renderRooms() {
    const el = document.getElementById('htRoomsBody'); if (!el) return;
    if (editingRoomId !== null) { renderRoomForm(el, H()); return; }
    const list = getRooms().filter(r => !roomSearch || r.num.includes(roomSearch) || r.type.includes(roomSearch));
    el.innerHTML = `
      <div class="ht-toolbar">
        <input class="ht-search" placeholder="بحث برقم الغرفة..." oninput="htRoomSearch(this.value)" value="${esc(roomSearch)}">
        <button class="btn-primary" onclick="htOpenRoomForm(null)">+ إضافة غرفة</button>
      </div>
      <div class="ht-room-grid">
        ${list.map(r => `
          <div class="ht-room-card">
            <div class="ht-room-number">غرفة ${esc(r.num)}</div>
            <div class="ht-room-details">${r.type === 'single' ? 'فردية' : r.type === 'double' ? 'ثنائية' : 'جناح رئيسي'} — ${fmt(r.price)} ${curSym()}</div>
            <div style="margin-bottom:12px;">
              <span class="ht-status-badge ${STATUS_CLASS[r.status]}">${STATUS_LABEL[r.status] || r.status}</span>
            </div>
            <div class="ht-room-actions">
              <button class="ht-btn-sm btn-secondary" onclick="htOpenRoomForm('${r.id}')">✏️</button>
              ${r.status === 'dirty' ? `<button class="ht-btn-sm btn-primary" onclick="htCleanRoom('${r.id}')">🧹 تنظيف</button>` : ''}
            </div>
          </div>
        `).join('') || '<div class="ht-empty">لا يوجد غرف مضافة</div>'}
      </div>`;
  }

  function renderRoomForm(el, h) {
    const r = editingRoomId ? h.rooms.find(x => x.id === editingRoomId) : null;
    el.innerHTML = `
      <div class="ht-form-card">
        <h3>${r ? 'تعديل غرفة' : 'إضافة غرفة جديدة'}</h3>
        <div class="ht-form-grid">
          <div class="ht-field"><label>رقم الغرفة *</label><input id="htRoomNum" value="${esc(r ? r.num : '')}"></div>
          <div class="ht-field"><label>نوع الغرفة</label>
            <select id="htRoomType">
              <option value="single" ${r && r.type === 'single' ? 'selected' : ''}>فردية</option>
              <option value="double" ${r && r.type === 'double' ? 'selected' : ''}>ثنائية</option>
              <option value="suite" ${r && r.type === 'suite' ? 'selected' : ''}>جناح رئيسي</option>
            </select>
          </div>
          <div class="ht-field"><label>سعر الليلة *</label><input id="htRoomPrice" type="number" value="${r ? r.price : ''}"></div>
          <div class="ht-field"><label>حالة الغرفة</label>
            <select id="htRoomStatus">
              <option value="available" ${r && r.status === 'available' ? 'selected' : ''}>متاحة</option>
              <option value="occupied" ${r && r.status === 'occupied' ? 'selected' : ''}>مشغولة</option>
              <option value="dirty" ${r && r.status === 'dirty' ? 'selected' : ''}>غير نظيفة</option>
              <option value="maintenance" ${r && r.status === 'maintenance' ? 'selected' : ''}>صيانة</option>
            </select>
          </div>
        </div>
        <div class="ht-form-actions">
          <button class="btn-primary" onclick="htSaveRoom()">💾 حفظ</button>
          <button class="btn-secondary" onclick="htCancelRoomForm()">إلغاء</button>
        </div>
      </div>`;
  }

  window.htRoomSearch = function (v) { roomSearch = v; renderRooms(); };

  function renderBookings() {
    const el = document.getElementById('htBookingsBody'); if (!el) return;
    const activeList = getBookings().filter(b => b.status === 'checked_in');
    el.innerHTML = `
      <div class="ht-form-card" style="margin-bottom:20px;">
        <h3>تسجيل حجز ونزيل جديد</h3>
        <div class="ht-form-grid">
          <div class="ht-field"><label>النزيل *</label><input id="htBookGuest" placeholder="اسم النزيل الكامل"></div>
          <div class="ht-field"><label>الهاتف</label><input id="htBookPhone" placeholder="077XXXXXXXX"></div>
          <div class="ht-field"><label>الغرفة المتاحة *</label>
            <select id="htBookRoom">
              <option value="">— اختر غرفة —</option>
              ${getRooms().filter(r => r.status === 'available').map(r => `<option value="${r.id}">غرفة ${esc(r.num)} [${r.type} - ${fmt(r.price)}]</option>`).join('')}
            </select>
          </div>
          <div class="ht-field"><label>تاريخ الدخول</label><input id="htBookCheckin" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="ht-field"><label>تاريخ الخروج</label><input id="htBookCheckout" type="date"></div>
        </div>
        <div class="ht-form-actions">
          <button class="btn-primary" onclick="htSaveBooking()">Check-in تسكين</button>
        </div>
      </div>
      <h3>النزلاء الحاليين</h3>
      <table class="ht-table">
        <thead><tr><th>رقم الحجز</th><th>النزيل</th><th>الغرفة</th><th>تاريخ الدخول</th><th>تاريخ الخروج</th><th>إجمالي كلفة السكن</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>
          ${activeList.map(b => `
            <tr>
              <td>${esc(b.ref)}</td><td>${esc(b.guest)}</td><td>غرفة ${esc(b.roomNum)}</td>
              <td>${esc(b.checkin)}</td><td>${esc(b.checkout)}</td>
              <td>${fmt(b.totalAmount)} ${curSym()}</td>
              <td><span class="ht-status-badge ht-status-occ">مسكن</span></td>
              <td>
                <button class="ht-btn-sm btn-primary" onclick="htOpenCheckout('${b.id}')">🛎️ Checkout ومغادرة</button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="8" class="ht-empty">لا يوجد نزلاء مسكنين حالياً</td></tr>'}
        </tbody>
      </table>`;
  }

  function renderCheckout() {
    const el = document.getElementById('htCheckoutBody'); if (!el) return;
    const h = H();
    const b = h.bookings.find(x => x.id === viewingBookingId);
    if (!b) { el.innerHTML = '<div class="ht-empty">اختر حجزاً للمغادرة</div>'; return; }

    const charges = getExtraCharges().filter(c => c.bookingId === viewingBookingId);
    const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);

    el.innerHTML = `
      <div class="ht-form-card" style="max-width:600px;">
        <h3>فاتورة المغادرة وتسوية الحساب</h3>
        <div style="font-size:14px; margin-bottom:16px;">
          <div>النزيل: <strong>${esc(b.guest)}</strong></div>
          <div>الغرفة المحجوزة: <strong>غرفة ${esc(b.roomNum)}</strong></div>
          <div>فترة الإقامة: <strong>${esc(b.checkin)}</strong> إلى <strong>${esc(b.checkout)}</strong> (${b.nights} ليالي)</div>
        </div>
        <table class="ht-table" style="margin-bottom:16px;">
          <thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
          <tbody>
            <tr><td>أجور السكن الأساسية (${b.nights} ليالي)</td><td>${fmt(b.totalAmount)} ${curSym()}</td></tr>
            ${charges.map(c => `
              <tr><td>خدمة: ${esc(c.desc)}</td><td>${fmt(c.amount)} ${curSym()}</td></tr>
            `).join('')}
            <tr style="font-weight:700; background:#f8fafc;">
              <td>المجموع النهائي للمغادرة</td><td>${fmt(b.totalAmount + chargesTotal)} ${curSym()}</td>
            </tr>
          </tbody>
        </table>
        <div class="ht-form-actions">
          <button class="btn-primary" onclick="htProcessCheckout()">تسديد وتسجيل Checkout ✅</button>
          <button class="btn-secondary" onclick="viewingBookingId=null; activeTab='bookings'; renderHotel();">رجوع للنزلاء</button>
        </div>
      </div>`;
  }

  function renderCharges() {
    const el = document.getElementById('htChargesBody'); if (!el) return;
    const activeList = getBookings().filter(b => b.status === 'checked_in');
    el.innerHTML = `
      <div class="ht-form-card" style="margin-bottom:20px;">
        <h3>إضافة خدمات إضافية إلى الفاتورة (طلب خدمة غرف / مغسلة / سبأ)</h3>
        <div class="ht-form-grid">
          <div class="ht-field"><label>النزيل الحالي *</label>
            <select id="htChargeBooking">
              <option value="">— اختر النزيل —</option>
              ${activeList.map(b => `<option value="${b.id}">${esc(b.guest)} [غرفة ${esc(b.roomNum)}]</option>`).join('')}
            </select>
          </div>
          <div class="ht-field"><label>تفاصيل الخدمة *</label><input id="htChargeDesc" placeholder="مثال: وجبة عشاء / خدمة كوي"></div>
          <div class="ht-field"><label>الكلفة *</label><input id="htChargeAmount" type="number"></div>
        </div>
        <div class="ht-form-actions"><button class="btn-primary" onclick="htAddCharge()">إضافة الخدمة</button></div>
      </div>
      <h3>سجل الرسوم الإضافية الغير مدفوعة</h3>
      <table class="ht-table">
        <thead><tr><th>النزيل</th><th>الخدمة</th><th>المبلغ</th><th>تاريخ الطلب</th><th>الحالة</th></tr></thead>
        <tbody>
          ${getExtraCharges().map(c => {
            const b = getBookings().find(bk => bk.id === c.bookingId);
            return `
              <tr>
                <td>${b ? esc(b.guest) + ' (غرفة ' + b.roomNum + ')' : 'غير معروف'}</td>
                <td>${esc(c.desc)}</td><td>${fmt(c.amount)} ${curSym()}</td>
                <td>${new Date(c.at).toLocaleDateString('ar-IQ')}</td>
                <td><span class="ht-status-badge ${c.paid ? 'ht-status-avail' : 'ht-status-occ'}">${c.paid ? 'مدفوعة' : 'مضافة للغرفة'}</span></td>
              </tr>`;
          }).join('') || '<tr><td colspan="5" class="ht-empty">لا يوجد رسوم مسجلة</td></tr>'}
        </tbody>
      </table>`;
  }

  function renderTabContent() {
    const body = document.getElementById('hotelBody'); if (!body) return;
    const tabs = { htDashBody:'dashboard', htRoomsBody:'rooms', htBookingsBody:'bookings', htCheckoutBody:'checkout', htChargesBody:'charges' };
    Object.keys(tabs).forEach(id => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; body.appendChild(el); }
      el.style.display = tabs[id] === activeTab ? '' : 'none';
    });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'rooms') renderRooms();
    else if (activeTab === 'bookings') renderBookings();
    else if (activeTab === 'checkout') renderCheckout();
    else if (activeTab === 'charges') renderCharges();
  }

  function renderHotel() {
    const body = document.getElementById('hotelBody'); if (!body) return;
    ensureData();
    const tabDefs = [['dashboard','📊 لوحة التحكم'],['rooms','🏨 الغرف'],['bookings','🛎️ النزلاء'],['charges','🍽️ خدمات إضافية']];
    body.innerHTML = `
      <div class="ht-header">
        <div class="ht-tabs">${tabDefs.map(([k,l]) => `<button class="ht-tab-btn ${activeTab === k || (activeTab === 'checkout' && k === 'bookings') ? 'active' : ''}" data-tab="${k}" onclick="htOpenTab('${k}')">${l}</button>`).join('')}</div>
      </div>
      <div id="htDashBody"></div><div id="htRoomsBody"></div><div id="htBookingsBody"></div><div id="htCheckoutBody"></div><div id="htChargesBody"></div>`;
    renderTabContent();
  }

  window.renderHotel = renderHotel;

  /* ─────────────── switchPage hook ─────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'hotel') {
      // Core switchPage only activates pages in its built-in pageMap; like
      // pos/pharmacy/assets, this module activates its own section explicitly
      // so navigation actually shows it (otherwise the page stays hidden).
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageHotel'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navHotel'); if (nav) nav.classList.add('active');
        window.currentPage = 'hotel';
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('hotel');
      } catch (_) {}
      ensureData(); setTimeout(renderHotel, 0);
    }
  };

  /* ─────────────── Jarvis tool ─────────────── */
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_hotel_today'] = function () {
          const h = H(); if (!h) return { error: 'hotel not ready' };
          return {
            totalRooms: h.rooms.length,
            occupied: h.rooms.filter(r => r.status === 'occupied').length,
            available: h.rooms.filter(r => r.status === 'available').length,
            dirty: h.rooms.filter(r => r.status === 'dirty').length,
            maintenance: h.rooms.filter(r => r.status === 'maintenance').length,
            activeBookings: h.bookings.filter(b => b.status === 'checked_in').length
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['hotel'] = '#pageHotel';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis);
  else setTimeout(registerJarvis, 600);

  window.OctagonHotel = { render: renderHotel, ensureData };
})();
