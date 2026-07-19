/**
 * OCTAGON ERP — Fleet Management (غرفة تحكم الأسطول).
 *
 * Phase 8E bilingualization and presentation enrichment.
 * Features: live SVG map, geofence zones, document tracking, fuel anomalies,
 * and read-only Jarvis assistant integration.
 *
 * Data namespace: omni.fleet = { vehicles:[], fuelLogs:[], trips:[] }
 * Page: #pageFleet (nav data-page="fleet").
 */
(function () {
  'use strict';

  function O() { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} } return null; }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function money(n) { n = Number(n); return isFinite(n) ? Math.round(n) : 0; }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || tx('د.ع'); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function coId() { try { return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''; } catch (_) { return ''; } }
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return tx('مستخدم'); }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('fleet', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'fleet', action, detail, user: userName() }); } catch (_) {}
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function daysFromToday(iso) { return iso ? Math.round((new Date(iso) - new Date(todayISO())) / 86400000) : null; }
  function dateShift(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

  function getLang() {
    try {
      const stored = localStorage.getItem('octagon:language') || localStorage.getItem('omni:language');
      if (stored) return stored;
    } catch (_) {}
    return window.currentLang || 'ar';
  }
  function t(ar, en) {
    return getLang() === 'ar' ? ar : en;
  }

  const DICT = {
    'بيانات تجريبية للعرض — لا يوجد ربط GPS/OBD حقيقي': ['بيانات تجريبية للعرض — لا يوجد ربط GPS/OBD حقيقي', 'Demo Data — No active GPS/OBD integration'],
    'إجازة سوق': ['إجازة سوق', 'Driving License'],
    'تأمين': ['تأمين', 'Insurance'],
    'المركبات': ['المركبات', 'Vehicles'],
    'في الخدمة': ['في الخدمة', 'In Service'],
    'صيانة': ['صيانة', 'Maintenance'],
    'وقود هذا الشهر': ['وقود هذا الشهر', 'Fuel This Month'],
    'إجمالي المسافات': ['إجمالي المسافات', 'Total Distance'],
    'وثائق تحتاج تجديداً': ['وثائق تحتاج تجديداً', 'Document Renewals'],
    'الوثيقة': ['الوثيقة', 'Document'],
    'الحالة': ['الحالة', 'Status'],
    'التاريخ': ['التاريخ', 'Date'],
    'كل الوثائق سارية ✅': ['كل الوثائق سارية ✅', 'All documents active ✅'],
    'منتهية منذ ': ['منتهية منذ ', 'Expired '],
    ' يوم': [' يوم', ' days'],
    'خلال ': ['خلال ', 'Within '],
    'اللوحة': ['اللوحة', 'Plate'],
    'النوع': ['النوع', 'Type'],
    'السائق': ['السائق', 'Driver'],
    'العداد': ['العداد', 'Odometer'],
    'الإجازة': ['الإجازة', 'License'],
    'التأمين': ['التأمين', 'Insurance'],
    'إجراءات': ['إجراءات', 'Actions'],
    'تعديل': ['تعديل', 'Edit'],
    'إنهاء صيانة': ['إنهاء صيانة', 'Finish Maint'],
    'أرشفة': ['أرشفة', 'Archive'],
    'رقم اللوحة مطلوب': ['رقم اللوحة مطلوب', 'Plate number is required'],
    'تم التحديث': ['تم التحديث', 'Updated successfully'],
    'تمت إضافة المركبة': ['تمت إضافة المركبة', 'Vehicle added successfully'],
    'أرشفة المركبة ': ['أرشفة المركبة ', 'Archive vehicle '],
    'تعديل مركبة': ['تعديل مركبة', 'Edit Vehicle'],
    'مركبة جديدة': ['مركبة جديدة', 'New Vehicle'],
    'رقم اللوحة *': ['رقم اللوحة *', 'Plate Number *'],
    'الاسم/الوصف': ['الاسم/الوصف', 'Name/Description'],
    'نوع الوقود': ['نوع الوقود', 'Fuel Type'],
    'انتهاء الإجازة': ['انتهاء الإجازة', 'License Expiry'],
    'انتهاء التأمين': ['انتهاء التأمين', 'Insurance Expiry'],
    'ملاحظات': ['ملاحظات', 'Notes'],
    'حفظ': ['حفظ', 'Save'],
    'إلغاء': ['إلغاء', 'Cancel'],
    'حالات مشبوهة': ['حالات مشبوهة', 'Suspicious Cases'],
    'إجمالي الفرق': ['إجمالي الفرق', 'Total Variance'],
    'عدد التعبئات': ['عدد التعبئات', 'Fuel Fills'],
    'الثقة المنخفضة': ['الثقة المنخفضة', 'Low Confidence'],
    'تسجيل تزويد وقود (بيانات حقيقية)': ['تسجيل تزويد وقود (بيانات حقيقية)', 'Log Fuel Refill (Real Data)'],
    'اللترات': ['اللترات', 'Liters'],
    'الكلفة ': ['الكلفة ', 'Cost '],
    'قراءة العداد': ['قراءة العداد', 'Odometer Reading'],
    'تسجيل (يُرحَّل كمصروف نقل)': ['تسجيل (يُرحَّل كمصروف نقل)', 'Log (Posted as transport expense)'],
    'مخاطر الوقود ومكافحة السرقة': ['مخاطر الوقود ومكافحة السرقة', 'Fuel Risks & Theft Prevention'],
    'سجل الوقود الكامل': ['سجل الوقود الكامل', 'Complete Fuel Logs'],
    'إجمالي الرحلات': ['إجمالي الرحلات', 'Total Trips'],
    'تسجيل رحلة (بيانات حقيقية)': ['تسجيل رحلة (بيانات حقيقية)', 'Log Trip (Real Data)'],
    'من': ['من', 'From'],
    'إلى': ['إلى', 'To'],
    'المسافة (كم)': ['المسافة (كم)', 'Distance (km)'],
    'الغرض': ['الغرض', 'Purpose'],
    'سجل الرحلات': ['سجل الرحلات', 'Trips Log'],
    'حالات حرجة': ['حالات حرجة', 'Critical Cases'],
    'عالية': ['عالية', 'High'],
    'متوسطة': ['متوسطة', 'Medium'],
    'إجمالي التحقيقات': ['إجمالي التحقيقات', 'Total Investigations'],
    'جميع حالات الشذوذ': ['جميع حالات الشذوذ', 'All Anomaly Cases'],
    'خطورة': ['خطورة', 'Severity'],
    'التفاصيل': ['التفاصيل', 'Details'],
    'الإجراء الموصى به': ['الإجراء الموصى به', 'Recommended Action'],
    'فتح تحقيق': ['فتح تحقيق', 'Open Investigation'],
    'آلية عمل التحقيقات': ['آلية عمل التحقيقات', 'Investigation Workflow'],
    'إعدادات الربط التجريبي': ['إعدادات الربط التجريبي', 'Demo Connection Settings'],
    'التحقيقات المفتوحة': ['التحقيقات المفتوحة', 'Open Investigations'],
    'حالة': ['حالة', 'Cases'],
    'محددات السرعة حسب المنطقة': ['محددات السرعة حسب المنطقة', 'Speed Limits by Zone'],
    'مركبات خفيفة': ['مركبات خفيفة', 'Light/Service'],
    'معدات ثقيلة': ['معدات ثقيلة', 'Heavy Equipment'],
    'قاعدة التنبيه': ['قاعدة التنبيه', 'Alert Rule'],
    'المنطقة': ['المنطقة', 'Zone'],
    'خريطة التحكم بالأسطول': ['خريطة التحكم بالأسطول', 'Fleet Command Map'],
    'تفاصيل الآلية المحددة': ['تفاصيل الآلية المحددة', 'Selected Vehicle Details'],
    'السائق / المشغل': ['السائق / المشغل', 'Driver / Operator'],
    'المشروع': ['المشروع', 'Project'],
    'المنطقة الحالية': ['المنطقة الحالية', 'Current Zone'],
    'السرعة الحالية': ['السرعة الحالية', 'Current Speed'],
    'حد السرعة': ['حد السرعة', 'Speed Limit'],
    'مستوى الوقود': ['مستوى الوقود', 'Fuel Level'],
    'استهلاك متوقع': ['استهلاك متوقع', 'Expected Consumption'],
    'حالة المحرك': ['حالة المحرك', 'Engine State'],
    'عداد الساعات': ['عداد الساعات', 'Hour Meter'],
    'آخر تحديث': ['آخر تحديث', 'Last Update'],
    'تحليل أومني': ['تحليل أومني', 'Omni Analysis'],
    'شبهة وقود': ['شبهة وقود', 'Fuel Anomaly'],
    'تجاوز سرعة': ['تجاوز سرعة', 'Speeding'],
    'فرق تعبئة': ['فرق تعبئة', 'Fill Variance'],
    'توقف طويل': ['توقف طويل', 'Long Idle'],
    'تنبيهات الوثائق': ['تنبيهات الوثائق', 'Document Alerts'],
    'د.ع': ['د.ع', 'IQD'],
    'مستخدم': ['مستخدم', 'User'],
    'سيارة': ['سيارة', 'Car'],
    'بيك أب': ['بيك أب', 'Pickup'],
    'شاحنة': ['شاحنة', 'Truck'],
    'فان': ['فان', 'Van'],
    'لودر': ['لودر', 'Loader'],
    'حفارة': ['حفارة', 'Excavator'],
    'رافعة': ['رافعة', 'Crane'],
    'جرافة': ['جرافة', 'Bulldozer'],
    'مدحلة': ['مدحلة', 'Roller'],
    'رافعة شوكية': ['رافعة شوكية', 'Forklift'],
    'مولدة': ['مولدة', 'Generator'],
    'ناقلة وقود': ['ناقلة وقود', 'Fuel Tanker'],
    'دراجة نارية': ['دراجة نارية', 'Motorcycle'],
    'أخرى': ['أخرى', 'Other']
  };

  function tx(arKey) {
    if (!arKey) return '';
    const key = String(arKey).trim();
    const match = DICT[key];
    if (match) return t(match[0], match[1]);
    return arKey;
  }

  function tObj(obj, fallback) {
    if (!obj) return fallback || '';
    if (typeof obj === 'string') return tx(obj);
    return t(obj.ar, obj.en) || fallback || '';
  }

  const TYPES = [
    ['car', tx('سيارة')],
    ['pickup', tx('بيك أب')],
    ['truck', tx('شاحنة')],
    ['van', tx('فان')],
    ['loader', tx('لودر')],
    ['excavator', tx('حفارة')],
    ['crane', tx('رافعة')],
    ['bulldozer', tx('جرافة')],
    ['roller', tx('مدحلة')],
    ['forklift', tx('رافعة شوكية')],
    ['generator', tx('مولدة')],
    ['tanker', tx('ناقلة وقود')],
    ['motorcycle', tx('دراجة نارية')],
    ['other', tx('أخرى')]
  ];
  const TYPE_LABEL = Object.fromEntries(TYPES);
  const STATUS_LABEL = {
    active: t('في الخدمة', 'In Service'),
    maintenance: t('صيانة', 'Maintenance'),
    idle: t('متوقفة', 'Idle'),
    retired: t('مؤرشفة', 'Archived')
  };
  const STATUS_CLASS = { active: 'fl-st-ok', maintenance: 'fl-st-maint', idle: 'fl-st-idle', retired: 'fl-st-idle' };

  const DEMO_NOTE = tx('بيانات تجريبية للعرض — لا يوجد ربط GPS/OBD حقيقي');

  function isDemoMode() { return (F()?.vehicles || []).length === 0; }

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.fleet || typeof o.fleet !== 'object') o.fleet = {};
    const f = o.fleet;
    if (!Array.isArray(f.vehicles)) f.vehicles = [];
    if (!Array.isArray(f.fuelLogs)) f.fuelLogs = [];
    if (!Array.isArray(f.trips)) f.trips = [];
    return f;
  }
  function F() { return ensureData(); }
  function getVehicles(all) { let l = (F()?.vehicles || []).filter(v => all || v.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }

  function expiryView(iso) { if (!iso) return { has: false }; const d = daysFromToday(iso); return { has: true, days: d, expired: d < 0, soon: d >= 0 && d <= 30 }; }

  function portfolio() {
    const vs = getVehicles().filter(v => v.status !== 'retired');
    const alerts = [];
    vs.forEach(v => {
      const lic = expiryView(v.licenseExpiry); if (lic.has && (lic.soon || lic.expired)) alerts.push({ v, kind: tx('إجازة سوق'), exp: v.licenseExpiry, view: lic });
      const ins = expiryView(v.insuranceExpiry); if (ins.has && (ins.soon || ins.expired)) alerts.push({ v, kind: tx('تأمين'), exp: v.insuranceExpiry, view: ins });
    });
    alerts.sort((a, b) => a.view.days - b.view.days);
    const month = todayISO().slice(0, 7);
    const fuelMonth = (F()?.fuelLogs || []).filter(l => (l.date || '').slice(0, 7) === month).reduce((s, l) => s + money(l.cost), 0);
    const totalDistance = (F()?.trips || []).reduce((s, t) => s + money(t.distance), 0);
    return { count: vs.length, active: vs.filter(v => v.status === 'active').length, maintenance: vs.filter(v => v.status === 'maintenance').length, alerts, fuelMonth, totalDistance };
  }

  let activeTab = 'dashboard', editing = null, search = '';
  window.flOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.flSearch = function (v) { search = v; renderVehicles(); };
  window.flOpenForm = function (id) { editing = id || 'new'; activeTab = 'vehicles'; render(); };
  window.flCancelForm = function () { editing = null; render(); };

  let guardFilter = 'all';
  let guardProject = '';
  let guardDriver = '';
  let guardType = '';
  let guardSelectedVehicle = null;

  window.flSetGuardFilter = function (filter) { guardFilter = filter; renderFleetGuard(); };
  window.flSetGuardProject = function (value) { guardProject = value; renderFleetGuard(); };
  window.flSetGuardDriver = function (value) { guardDriver = value; renderFleetGuard(); };
  window.flSetGuardType = function (value) { guardType = value; renderFleetGuard(); };
  window.flSelectGuardVehicle = function (id) { guardSelectedVehicle = id; renderFleetGuard(); };
  window.flGuardAction = function (label) { toast(label + ' ' + t('(عرض تجريبي)', '(Demo View)'), 'info'); };

  function filterGuardVehicles(vehicles) {
    return vehicles.filter(v => {
      if (guardFilter !== 'all' && v.markerStatus !== guardFilter) return false;
      const projStr = tObj(v.project);
      if (guardProject && projStr !== guardProject) return false;
      const driverStr = tObj(v.driver);
      if (guardDriver && driverStr !== guardDriver) return false;
      if (guardType && v.type !== guardType) return false;
      return true;
    });
  }

  function uniqueOptions(list, key) {
    return Array.from(new Set(list.map(item => tObj(item[key])).filter(Boolean))).sort();
  }

  window.flSaveVehicle = function () {
    const f = F(); if (!f) return;
    const plate = val('flPlate');
    if (!plate) { toast(tx('رقم اللوحة مطلوب'), 'error'); return; }
    const base = { plate, name: val('flName') || plate, type: val('flType') || 'car', driver: val('flDriver'), odometer: numVal('flOdo'), fuelType: val('flFuel'), licenseExpiry: val('flLicense'), insuranceExpiry: val('flInsurance'), status: val('flStatus') || 'active', notes: val('flNotes') };
    const ex = editing && editing !== 'new' ? f.vehicles.find(v => v.id === editing) : null;
    if (ex) { Object.assign(ex, base); audit('vehicle_update', `تعديل مركبة: ${plate}`); toast(tx('تم التحديث'), 'success'); }
    else { f.vehicles.push({ id: uid('veh'), ...base, is_active: true, companyId: coId(), createdAt: new Date().toISOString() }); audit('vehicle_create', `مركبة جديدة: ${plate}`); toast(tx('تمت إضافة المركبة'), 'success'); }
    save(); editing = null; render();
  };
  window.flSetStatus = function (id, status) { const v = (F()?.vehicles || []).find(x => x.id === id); if (!v) return; v.status = status; audit('vehicle_status', `${v.plate} → ${STATUS_LABEL[status]}`); save(); render(); };
  window.flArchive = function (id) { const v = (F()?.vehicles || []).find(x => x.id === id); if (!v) return; if (!confirm(t(`أرشفة المركبة ${v.plate}؟`, `Archive vehicle ${v.plate}?`))) return; v.is_active = false; v.status = 'retired'; audit('vehicle_archive', `أرشفة ${v.plate}`); save(); render(); };

  window.flLogFuel = function () {
    const f = F(); if (!f) return;
    const vehicleId = val('flFuelVehicle'); const v = f.vehicles.find(x => x.id === vehicleId);
    if (!v) { toast(t('اختر المركبة', 'Select vehicle'), 'error'); return; }
    const liters = numVal('flFuelLiters'), cost = money(numVal('flFuelCost')), odo = numVal('flFuelOdo');
    const log = { id: uid('fuel'), vehicleId, plate: v.plate, date: val('flFuelDate') || todayISO(), liters, cost, odometer: odo, by: userName(), createdAt: new Date().toISOString(), companyId: coId() };
    f.fuelLogs.unshift(log);
    if (odo > money(v.odometer)) v.odometer = odo;
    if (cost > 0 && typeof window.addFinanceTransaction === 'function') {
      try { window.addFinanceTransaction({ type: 'expense', direction: 'out', sourceType: 'fleet_fuel', sourceId: log.id, date: log.date, amount: cost, categoryId: 'cat_transport', description: `وقود ${v.plate}`, partyName: 'محطة وقود' }); } catch (e) { console.warn('fuel expense post failed', e); }
    }
    audit('fuel_log', `تزويد وقود ${v.plate}: ${liters} لتر${cost ? ' بكلفة ' + fmt(cost) + ' ' + curSym() : ''}`);
    save(); toast(t('تم تسجيل التزويد', 'Fuel log saved'), 'success'); render();
  };
  window.flLogTrip = function () {
    const f = F(); if (!f) return;
    const vehicleId = val('flTripVehicle'); const v = f.vehicles.find(x => x.id === vehicleId);
    if (!v) { toast(t('اختر المركبة', 'Select vehicle'), 'error'); return; }
    const trip = { id: uid('trip'), vehicleId, plate: v.plate, date: val('flTripDate') || todayISO(), driver: val('flTripDriver') || v.driver, from: val('flTripFrom'), to: val('flTripTo'), distance: numVal('flTripDist'), purpose: val('flTripPurpose'), by: userName(), createdAt: new Date().toISOString(), companyId: coId() };
    f.trips.unshift(trip);
    audit('trip_log', `رحلة ${v.plate}: ${trip.from || '?'} → ${trip.to || '?'} (${trip.distance} كم)`);
    save(); toast(t('تم تسجيل الرحلة', 'Trip log saved'), 'success'); render();
  };

  window.flLoadDemo = function () {
    toast(DEMO_NOTE, 'info');
  };

  const DEMO_VEHICLES = [
    { id: 'demo-dt1', plate: 'B-1045', name: { ar: 'شاحنة ديزل كبيرة', en: 'Large Diesel Truck' }, type: 'truck', driver: { ar: 'سعد', en: 'Saad' }, odometer: 84200, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(12), insuranceExpiry: dateShift(75), status: 'active', notes: { ar: 'مشروع الكرادة — الموقع A', en: 'Karrada Project — Site A' }, project: { ar: 'مشروع الكرادة', en: 'Karrada Project' }, site: { ar: 'الموقع A', en: 'Site A' }, tankCapacity: 220 },
    { id: 'demo-dl2', plate: 'EQ-77', name: { ar: 'لودر موقع', en: 'Site Loader' }, type: 'loader', driver: { ar: 'حيدر', en: 'Haider' }, odometer: 12800, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(90), insuranceExpiry: dateShift(180), status: 'active', notes: { ar: 'مشروع بسماية — الموقع B', en: 'Bismayah Project — Site B' }, project: { ar: 'مشروع بسماية', en: 'Bismayah Project' }, site: { ar: 'الموقع B', en: 'Site B' }, tankCapacity: 310 },
    { id: 'demo-dg3', plate: 'GEN-19', name: { ar: 'مولدة ديزل احتياط', en: 'Backup Diesel Generator' }, type: 'generator', driver: { ar: 'فريق الكهرباء', en: 'Electrical Team' }, odometer: 0, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: '', insuranceExpiry: '', status: 'idle', notes: { ar: 'المخزن المركزي — تستخدم ساعات تشغيل', en: 'Central Warehouse — operates on hours' }, project: { ar: 'المخزن المركزي', en: 'Central Warehouse' }, tankCapacity: 500 },
    { id: 'demo-dp4', plate: 'P-5521', name: { ar: 'بيك أب متابعة إدارة', en: 'Management Pickup' }, type: 'pickup', driver: { ar: 'كرار', en: 'Karrar' }, odometer: 51240, fuelType: { ar: 'بنزين', en: 'Petrol' }, licenseExpiry: dateShift(-5), insuranceExpiry: dateShift(120), status: 'active', notes: { ar: 'إجازة السوق منتهية', en: 'Driver license expired' }, project: { ar: 'الإدارة', en: 'Management' }, site: { ar: 'المدينة', en: 'City' }, tankCapacity: 75 },
    { id: 'demo-de5', plate: 'EX-05', name: { ar: 'حفارة كوماتسو', en: 'Komatsu Excavator' }, type: 'excavator', driver: { ar: 'ناجي', en: 'Naji' }, odometer: 26900, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(-30), insuranceExpiry: dateShift(-60), status: 'active', notes: { ar: 'وثائق منتهية — قيد التجديد', en: 'Documents expired — renewing' }, project: { ar: 'مشروع الكرادة', en: 'Karrada Project' }, site: { ar: 'الموقع A', en: 'Site A' }, tankCapacity: 380 },
    { id: 'demo-dc6', plate: 'CR-06', name: { ar: 'رافعة برجية ليبهير', en: 'Liebherr Tower Crane' }, type: 'crane', driver: { ar: 'فارس', en: 'Faris' }, odometer: 15800, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(45), insuranceExpiry: dateShift(150), status: 'maintenance', notes: { ar: 'صيانة دورية — فشل فحص هيدروليك', en: 'Routine maintenance — hydraulic check failed' }, project: { ar: 'مشروع بسماية', en: 'Bismayah Project' }, tankCapacity: 260 },
    { id: 'demo-ds7', plate: 'SV-07', name: { ar: 'سوزوكي سويفت خدمات', en: 'Suzuki Swift Service Car' }, type: 'car', driver: { ar: 'ريان', en: 'Ryan' }, odometer: 32540, fuelType: { ar: 'بنزين', en: 'Petrol' }, licenseExpiry: dateShift(200), insuranceExpiry: dateShift(90), status: 'active', notes: { ar: 'مركبة خدمات خفيفة', en: 'Light service vehicle' }, project: { ar: 'الإدارة', en: 'Management' }, site: { ar: 'المدينة', en: 'City' }, tankCapacity: 60 },
    { id: 'demo-dt8', plate: 'TK-08', name: { ar: 'ناقلة وقود', en: 'Fuel Tanker' }, type: 'tanker', driver: { ar: 'ماجد', en: 'Majid' }, odometer: 94000, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(20), insuranceExpiry: dateShift(-15), status: 'active', notes: { ar: 'تأمين منتهي — تجديد عاجل', en: 'Insurance expired — urgent renewal' }, project: { ar: 'المخزن المركزي', en: 'Central Warehouse' }, tankCapacity: 420 },
    { id: 'demo-dt9', plate: 'T-1150', name: { ar: 'شاحنة قلاب', en: 'Dumper Truck' }, type: 'truck', driver: { ar: 'عماد', en: 'Emad' }, odometer: 67000, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(60), insuranceExpiry: dateShift(250), status: 'active', notes: { ar: 'نقل تربة من الموقع B', en: 'Hauling soil from Site B' }, project: { ar: 'مشروع بسماية', en: 'Bismayah Project' }, site: { ar: 'الموقع B', en: 'Site B' }, tankCapacity: 200 },
    { id: 'demo-dr10', plate: 'RL-03', name: { ar: 'مدحلة بوماج', en: 'Bomag Soil Roller' }, type: 'roller', driver: { ar: 'صباح', en: 'Sabah' }, odometer: 4200, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(300), insuranceExpiry: dateShift(365), status: 'active', notes: { ar: 'أعمال رصف وتسوية', en: 'Road compaction works' }, project: { ar: 'مشروع الكرادة', en: 'Karrada Project' }, site: { ar: 'الموقع A', en: 'Site A' }, tankCapacity: 160 },
    { id: 'demo-dv11', plate: 'VN-22', name: { ar: 'فان صيانة', en: 'Maintenance Van' }, type: 'van', driver: { ar: 'ياسر', en: 'Yasser' }, odometer: 43000, fuelType: { ar: 'بنزين', en: 'Petrol' }, licenseExpiry: dateShift(80), insuranceExpiry: dateShift(40), status: 'maintenance', notes: { ar: 'تعطل مكيف — قيد الإصلاح', en: 'AC failure — repairing' }, project: { ar: 'الإدارة', en: 'Management' }, tankCapacity: 70 },
    { id: 'demo-db12', plate: 'BD-09', name: { ar: 'جرافة كاتربيلر', en: 'Caterpillar Bulldozer' }, type: 'bulldozer', driver: { ar: 'هادي', en: 'Hadi' }, odometer: 19800, fuelType: { ar: 'ديزل', en: 'Diesel' }, licenseExpiry: dateShift(15), insuranceExpiry: dateShift(-10), status: 'maintenance', notes: { ar: 'صيانة السلاسل', en: 'Track maintenance' }, project: { ar: 'المخزن المركزي', en: 'Central Warehouse' }, tankCapacity: 340 }
  ];

  const GUARD_ZONES = [
    { id: 'workshop', name: { ar: 'الورشة', en: 'Workshop Depot' }, type: 'workshop', limit: 10, heavyLimit: 8, color: 'teal', mapPos: { top: '18px', left: '18px', width: '24%' } },
    { id: 'site', name: { ar: 'موقع المشروع', en: 'Project Site' }, type: 'project_site', limit: 20, heavyLimit: 15, color: 'blue', mapPos: { top: '18px', right: '18px', width: '26%' } },
    { id: 'city', name: { ar: 'طريق المدينة', en: 'City Road' }, type: 'city_road', limit: 60, heavyLimit: 45, color: 'slate', mapPos: { top: '42%', left: '18px', width: '28%' } },
    { id: 'highway', name: { ar: 'الطريق السريع', en: 'Highway' }, type: 'highway', limit: 90, heavyLimit: 70, color: 'indigo', mapPos: { top: '40%', right: '16px', width: '28%' } },
    { id: 'fuel_station', name: { ar: 'محطة الوقود', en: 'Fuel Station' }, type: 'fuel_station', limit: 15, heavyLimit: 10, color: 'amber', mapPos: { bottom: '18px', left: '18px', width: '24%' } },
    { id: 'restricted', name: { ar: 'منطقة حساسة', en: 'Restricted Area' }, type: 'restricted', limit: 5, heavyLimit: 5, color: 'red', mapPos: { bottom: '18px', right: '18px', width: '22%' } }
  ];

  function isHeavyVehicle(v) { return ['truck', 'forklift', 'loader', 'crane', 'excavator', 'heavy', 'generator', 'bulldozer', 'roller', 'tanker'].includes(String(v.type || '').toLowerCase()); }
  function zoneLimit(v, z) { return isHeavyVehicle(v) ? z.heavyLimit : z.limit; }

  const DEMO_POSITIONS = [{x:12,y:18},{x:24,y:12},{x:38,y:26},{x:56,y:16},{x:70,y:40},{x:22,y:54},{x:48,y:60},{x:68,y:64},{x:15,y:44},{x:55,y:52},{x:30,y:72},{x:72,y:30}];
  const DEMO_SPEEDS = [8, 27, 0, 72, 96, 14, 35, 82, 51, 12, 5, 68];
  const DEMO_LABELS = [
    { ar: 'قبل 4 دقائق', en: '4m ago' },
    { ar: 'قبل 11 دقيقة', en: '11m ago' },
    { ar: 'قبل 28 دقيقة', en: '28m ago' },
    { ar: 'قبل 7 دقائق', en: '7m ago' },
    { ar: 'قبل 16 دقيقة', en: '16m ago' },
    { ar: 'قبل 9 دقائق', en: '9m ago' },
    { ar: 'قبل 5 دقائق', en: '5m ago' },
    { ar: 'قبل 3 دقائق', en: '3m ago' },
    { ar: 'قبل 22 دقيقة', en: '22m ago' },
    { ar: 'قبل 14 دقيقة', en: '14m ago' },
    { ar: 'قبل 35 دقيقة', en: '35m ago' },
    { ar: 'قبل 6 دقائق', en: '6m ago' }
  ];
  const DEMO_FUEL_PCT = [72, 64, 82, 43, 56, 31, 78, 48, 61, 90, 55, 38];

  function sourceVehicles() {
    const actual = getVehicles().filter(v => v.status !== 'retired');
    const vehicles = actual.length ? actual : DEMO_VEHICLES;
    return vehicles.map((v, idx) => {
      const z = GUARD_ZONES[idx % GUARD_ZONES.length];
      const limit = zoneLimit(v, z);
      const speedSeed = DEMO_SPEEDS[idx % DEMO_SPEEDS.length];
      const speed = Number(v.currentSpeed != null ? v.currentSpeed : speedSeed);
      const tank = Math.max(40, Number(v.tankCapacity || (isHeavyVehicle(v) ? 240 : 75)));
      const fuelPercent = Number(v.fuelPercent != null ? v.fuelPercent : DEMO_FUEL_PCT[idx % DEMO_FUEL_PCT.length]);
      const fuelLiters = Math.round(tank * fuelPercent / 100);
      const isMaintenance = v.status === 'maintenance';
      const isIdle = v.status === 'idle';
      const markerStatus = isMaintenance ? 'offline' : isIdle ? 'idle' : speed > limit ? 'speeding' : (idx % 10 === 1 || idx % 10 === 5) ? 'fuel_anomaly' : 'normal';
      return {
        ...v,
        project: v.project || ['مشروع الكرادة', 'مشروع بسماية', 'الإدارة', 'المخزن المركزي'][idx % 4],
        site: v.site || ['الموقع A', 'الموقع B', 'المدينة', 'Depot'][idx % 4],
        zone: z,
        currentSpeed: speed,
        speedLimit: limit,
        tankCapacity: tank,
        fuelPercent,
        fuelLiters,
        hourMeter: Number(v.hourMeter || (isHeavyVehicle(v) ? 1800 + idx * 920 : 0)),
        engineState: isIdle ? 'idle' : isMaintenance ? 'off' : 'on',
        markerStatus,
        lastUpdate: tObj(DEMO_LABELS[idx % DEMO_LABELS.length]),
        mapX: DEMO_POSITIONS[idx % DEMO_POSITIONS.length]?.x || 52,
        mapY: DEMO_POSITIONS[idx % DEMO_POSITIONS.length]?.y || 48
      };
    });
  }

  function guardStatusLabel(s) {
    return ({
      normal: tx('طبيعي'),
      speeding: tx('سرعة عالية'),
      fuel_anomaly: tx('شبهة وقود'),
      offline: tx('غير متصل'),
      idle: tx('توقف طويل'),
      outside_zone: tx('خارج النطاق')
    })[s] || s;
  }
  function guardStatusClass(s) {
    return ({ normal: 'ok', speeding: 'warn', fuel_anomaly: 'bad', offline: 'muted', idle: 'idle', outside_zone: 'bad' })[s] || 'muted';
  }

  function guardFuelRows(vehicles) {
    const f = F() || {};
    const logs = Array.isArray(f.fuelLogs) && f.fuelLogs.length ? f.fuelLogs.slice(0, 8) : vehicles.slice(0, 6).map((v, idx) => ({
      id: 'demo-fuel-' + idx, vehicleId: v.id, plate: v.plate, date: dateShift(-idx * 2 - 1),
      liters: [100, 85, 160, 45, 220, 65][idx % 6], cost: [150000, 127000, 240000, 69000, 330000, 98000][idx % 6],
      odometer: Number(v.odometer || 0), by: t('عرض تجريبي', 'Demo View')
    }));
    return logs.map((l, idx) => {
      const v = vehicles.find(x => x.id === l.vehicleId || x.plate === l.plate) || vehicles[idx % vehicles.length] || {};
      const tank = Number(v.tankCapacity || 120);
      const dispensed = Number(l.liters || 0);
      const variance = [0, -18, 0, -7, 0, -11][idx % 6];
      const measured = Math.max(0, dispensed + variance);
      const before = Math.max(0, Math.round(Number(v.fuelLiters || tank * 0.35) - measured));
      const after = Math.min(tank, before + measured);
      return { ...l, vehicle: v, tank, before, after, dispensed, measured, variance, method: idx % 2 ? t('يدوي + وصل مضخة', 'Manual + Invoice') : t('حساس خزان تجريبي', 'Sensor Mock'), confidence: Math.abs(variance) > 10 ? t('منخفضة', 'Low') : t('عالية', 'High'), station: idx % 2 ? t('محطة خارجية', 'External Station') : t('المستودع', 'Depot') };
    });
  }

  function guardTripRows(vehicles) {
    const f = F() || {};
    const rows = Array.isArray(f.trips) && f.trips.length ? f.trips.slice(0, 8) : vehicles.slice(0, 6).map((v, idx) => ({
      id: 'demo-trip-' + idx, vehicleId: v.id, plate: v.plate, date: dateShift(-idx * 2), driver: v.driver,
      from: [t('المستودع', 'Depot'), t('الورشة', 'Workshop'), t('الموقع A', 'Site A'), t('المدينة', 'City'), t('محطة الوقود', 'Fuel Station'), t('المخزن', 'Warehouse')][idx % 6],
      to: [t('الموقع A', 'Site A'), t('محطة الوقود', 'Fuel Station'), t('الموقع B', 'Site B'), t('المستودع', 'Depot'), t('المخزن', 'Warehouse'), t('الموقع A', 'Site A')][idx % 6],
      distance: [42, 18, 64, 27, 120, 35][idx % 6],
      purpose: [t('تسليم مواد', 'Deliver Materials'), t('تعبئة وقود', 'Refill Fuel'), t('نقل معدات', 'Move Equipment'), t('زيارة إشراف', 'Supervisor Visit'), t('توريد', 'Procure'), t('صيانة', 'Maintenance')][idx % 6]
    }));
    return rows.map((t, idx) => {
      const v = vehicles.find(x => x.id === t.vehicleId || x.plate === t.plate) || vehicles[idx % vehicles.length] || {};
      const startOdo = Math.max(0, Number(t.odometerStart || v.odometer || 0) - Number(t.distance || 0));
      const endOdo = Number(t.odometerEnd || v.odometer || startOdo + Number(t.distance || 0));
      const maxSpeed = idx === 2 ? 96 : Math.max(22, Number(v.currentSpeed || 0) + 8);
      return { ...t, vehicle: v, planned: Number(t.distance || 0), actual: Number(t.distance || 0) + (idx === 2 ? 11 : 0), startOdo, endOdo, fuelStart: Math.min(100, Number(v.fuelPercent || 50) + 8), fuelEnd: Math.max(0, Number(v.fuelPercent || 50) - 9), idleMinutes: [12, 4, 38, 8, 2, 15][idx % 6], maxSpeed, avgSpeed: Math.max(10, Math.round(maxSpeed * 0.62)), zones: [tObj(v.zone?.name) || t('غير محدد', 'Not set'), idx === 1 ? t('محطة الوقود', 'Fuel Station') : t('طريق المدينة', 'City Road')] };
    });
  }

  function guardServiceRows(vehicles) {
    return vehicles.map((v, idx) => {
      const km = Number(v.odometer || 0);
      const hours = Number(v.hourMeter || 0);
      const oilDueKm = isHeavyVehicle(v) ? km + (idx === 1 ? 350 : 1200) : km + (idx === 3 ? 800 : 5000);
      const oilDueHours = hours ? hours + (idx === 1 ? 22 : 120) : 0;
      const inspectionState = idx === 1 ? t('فشل فحص هيدروليك', 'Hydraulic Failure') : idx === 2 ? t('مطلوب فحص تشغيل', 'Startup Insp') : idx === 5 ? t('فشل فحص محرك', 'Engine Failure') : idx === 10 ? t('مطلوب فحص سلاسل', 'Track Insp') : t('ناجح', 'Pass');
      return { vehicle: v, lastOil: dateShift(-45 - idx * 11), nextOilDate: dateShift(idx === 1 ? 5 : 28 + idx * 8), oilDueKm, oilDueHours, inspectionState, service: idx === 1 || idx === 10 ? t('عاجل', 'Urgent') : idx === 2 || idx === 5 ? t('قريب', 'Soon') : t('ضمن الجدول', 'Scheduled'), filters: idx % 2 ? t('زيت + هيدروليك', 'Oil + Hyd') : t('زيت + هواء', 'Oil + Air') };
    });
  }

  function guardAnomalyRows(vehicles, fuels, trips) {
    const rows = [];
    vehicles.forEach(v => {
      if (v.currentSpeed > v.speedLimit) rows.push({ severity: 'high', vehicle: v, type: tx('تجاوز سرعة'), detail: t(`${v.currentSpeed} / ${v.speedLimit} كم/س داخل ${tObj(v.zone.name)}`, `${v.currentSpeed} / ${v.speedLimit} km/h inside ${tObj(v.zone.name)}`), action: t('تثبيت مخالفة سرعة ومراجعة السائق', 'Issue speeding ticket & review driver') });
      if (v.markerStatus === 'fuel_anomaly') rows.push({ severity: 'critical', vehicle: v, type: tx('شبهة وقود'), detail: t('هبوط وقود بعد خروج من الموقع أو قراءة منخفضة الثقة', 'Fuel drop after leaving site or low confidence reading'), action: t('فتح تحقيق قبل أي تصحيح', 'Open investigation before adjustments') });
    });
    fuels.filter(f => Math.abs(f.variance) >= 7).forEach(f => rows.push({ severity: Math.abs(f.variance) > 12 ? 'critical' : 'medium', vehicle: f.vehicle, type: t('فرق تعبئة', 'Fill Variance'), detail: t(`المضخة ${fmt(f.dispensed)} لتر، الزيادة المقاسة ${fmt(f.measured)} لتر`, `Pump ${fmt(f.dispensed)} L, Measured increase ${fmt(f.measured)} L`), action: t('مطابقة وصل التعبئة وقراءة الخزان', 'Match pump slip with tank reading') }));
    trips.filter(t2 => t2.idleMinutes > 30).forEach(t2 => rows.push({ severity: 'medium', vehicle: t2.vehicle, type: tx('توقف طويل'), detail: t(`${t2.idleMinutes} دقيقة توقف خلال رحلة ${tObj(t2.from) || '?'} - ${tObj(t2.to) || '?'}`, `${t2.idleMinutes} minutes idle during trip ${tObj(t2.from) || '?'} - ${tObj(t2.to) || '?'}`), action: t('مراجعة سبب التوقف واستهلاك الوقود', 'Review idle reason and fuel consumption') }));
    return rows.slice(0, 8);
  }

  function buildGuardSnapshot() {
    const vehicles = sourceVehicles();
    const fuels = guardFuelRows(vehicles);
    const trips = guardTripRows(vehicles);
    const service = guardServiceRows(vehicles);
    const anomalies = guardAnomalyRows(vehicles, fuels, trips);
    const speedViolations = vehicles.filter(v => v.currentSpeed > v.speedLimit).length;
    const suspiciousLiters = fuels.reduce((s, f) => s + (f.variance < 0 ? Math.abs(f.variance) : 0), 0);
    return { vehicles, fuels, trips, service, anomalies, speedViolations, suspiciousLiters, zones: GUARD_ZONES };
  }

  function guardSpeedPolicyTable(g) {
    const rows = g.zones.map(z => `<tr><td>${esc(tObj(z.name))}</td><td>${fmt(z.limit)} ${t('كم/س', 'km/h')}</td><td>${fmt(z.heavyLimit)} ${t('كم/س', 'km/h')}</td><td>${t('تنبيه بعد 60 ثانية · AI يشرح فقط', 'Alert after 60s · AI Read-only')}</td></tr>`).join('');
    const violations = g.vehicles.filter(v => v.currentSpeed > v.speedLimit);
    return `<section class="fl-panel"><div class="fl-panel-head"><h3>${tx('محددات السرعة حسب المنطقة')}</h3><span class="fl-muted">${violations.length} ${t('مخالفة حالية', 'Active violations')}</span></div><table class="fl-table"><thead><tr><th>${tx('المنطقة')}</th><th>${tx('مركبات خفيفة')}</th><th>${tx('معدات ثقيلة')}</th><th>${tx('قاعدة التنبيه')}</th></tr></thead><tbody>${rows}</tbody></table>${violations.length ? '<div style="margin-top:10px;font-size:13px;color:#b45309;font-weight:600">⚠️ ' + t('المركبات المخالفة حالياً:', 'Vehicles speeding currently:') + ' ' + violations.map(v => esc(v.plate) + ' (' + fmt(v.currentSpeed) + '/' + fmt(v.speedLimit) + ' ' + t('كم/س', 'km/h') + ')').join(' · ') + '</div>' : ''}</section>`;
  }

  function guardMapHtml(vehicles, g) {
    const zonesHtml = g.zones.map(z => `<div class="fl-map-zone fl-map-zone-${z.id}" style="position:absolute;${Object.entries(z.mapPos).map(([k,v]) => k+':'+v).join(';')}"><strong>${esc(tObj(z.name))}</strong><span>${fmt(z.limit)} ${t('كم/س', 'km/h')}</span></div>`).join('');
    const pinsHtml = vehicles.map(v => `<button class="fl-map-pin fl-${guardStatusClass(v.markerStatus)}${guardSelectedVehicle === v.id ? ' fl-selected-marker' : ''}" style="left:${v.mapX}%;top:${v.mapY}%" onclick="flSelectGuardVehicle('${v.id}')" title="${esc(v.plate)} - ${esc(tObj(v.driver))}"><span>${esc(v.plate)}</span><b>${guardStatusLabel(v.markerStatus)}</b></button>`).join('');
    const markersHtml = vehicles.map(v => {
      const selected = guardSelectedVehicle === v.id ? ' fl-selected-marker' : '';
      return `<article class="fl-map-marker fl-${guardStatusClass(v.markerStatus)}${selected}" onclick="flSelectGuardVehicle('${v.id}')"><div class="fl-marker-head"><strong>${esc(v.plate || tObj(v.name))}</strong><span>${guardStatusLabel(v.markerStatus)}</span></div><div class="fl-marker-meta">${esc(tObj(v.name) || '')} · ${esc(tObj(v.driver) || t('بدون سائق', 'No Driver'))}</div><div class="fl-marker-grid"><span>${tx('المنطقة')}</span><b>${esc(tObj(v.zone.name))}</b><span>${t('السرعة', 'Speed')}</span><b>${fmt(v.currentSpeed)} / ${fmt(v.speedLimit)} ${t('كم/س', 'km/h')}</b><span>${t('الوقود', 'Fuel')}</span><b>${fmt(v.fuelLiters)} ${t('لتر', 'L')} (${fmt(v.fuelPercent)}%)</b><span>${tx('آخر تحديث')}</span><b>${esc(v.lastUpdate)}</b></div></article>`;
    }).join('');
    return `<section class="fl-panel fl-guard-map-panel"><div class="fl-panel-head"><h3>${tx('خريطة التحكم بالأسطول')}</h3></div><div class="fl-zone-strip">${g.zones.map(z => `<div class="fl-zone-card fl-zone-${z.color}"><b>${esc(tObj(z.name))}</b><span>${fmt(z.limit)} ${t('كم/س', 'km/h')} · ${t('ثقيل', 'Heavy')} ${fmt(z.heavyLimit)}</span></div>`).join('')}</div><div class="fl-map-grid"><div class="fl-map-canvas">${zonesHtml}${pinsHtml}</div><div class="fl-map-pin-list">${markersHtml}</div></div></section>`;
  }

  function guardSelectedVehicleHtml(g, vehicles) {
    const selected = g.vehicles.find(v => v.id === guardSelectedVehicle) || vehicles[0] || null;
    if (!selected) return `<section class="fl-panel"><div class="fl-empty">${t('اختر مركبة من الخريطة', 'Select a vehicle from the map')}</div></section>`;
    const isViolating = selected.currentSpeed > selected.speedLimit;
    const consumeRate = Math.max(3, Math.round(selected.currentSpeed * 0.28));
    return `<section class="fl-panel fl-selected-panel"><div class="fl-panel-head"><h3>${tx('تفاصيل الآلية المحددة')}</h3><span class="fl-badge ${selected.markerStatus === 'fuel_anomaly' ? 'fl-st-maint' : isViolating ? 'fl-st-maint' : 'fl-st-ok'}">${guardStatusLabel(selected.markerStatus)}</span></div>
      <div class="fl-detail-grid"><div><strong>${esc(tObj(selected.name) || selected.plate)}</strong><span>${esc(selected.plate)}</span></div>
      <div><span>${tx('السائق / المشغل')}</span><b>${esc(tObj(selected.driver) || t('غير محدد', 'Not set'))}</b></div>
      <div><span>${tx('المشروع')}</span><b>${esc(tObj(selected.project) || '-')}</b></div>
      <div><span>${t('المنطقة الحالية', 'Current Area')}</span><b>${esc(tObj(selected.zone.name))} — ${esc(tObj(selected.site) || '')}</b></div>
      <div><span>${tx('السرعة الحالية')}</span><b style="${isViolating ? 'color:#dc2626' : ''}">${fmt(selected.currentSpeed)} ${t('كم/س', 'km/h')} ${isViolating ? '⚠️' : ''}</b></div>
      <div><span>${tx('حد السرعة')}</span><b>${fmt(selected.speedLimit)} ${t('كم/س', 'km/h')}</b></div>
      <div><span>${t('مستوى الوقود', 'Fuel Level')}</span><b>${fmt(selected.fuelPercent)}% (${fmt(selected.fuelLiters)} ${t('لتر', 'L')} / ${t('سعة', 'Cap')} ${fmt(selected.tankCapacity)} ${t('لتر', 'L')})</b></div>
      <div><span>${tx('استهلاك متوقع')}</span><b>${fmt(consumeRate)} ${t('لتر/ساعة', 'L/hr')}</b></div>
      <div><span>${tx('حالة المحرك')}</span><b>${selected.engineState === 'on' ? t('دوران', 'Running') : selected.engineState === 'idle' ? t('خمول', 'Idle') : t('متوقف', 'Stopped')}</b></div>
      <div><span>${tx('عداد الساعات')}</span><b>${selected.hourMeter ? fmt(selected.hourMeter) + ' ' + t('ساعة', 'hrs') : '—'}</b></div>
      <div><span>${tx('آخر تحديث')}</span><b>${esc(selected.lastUpdate)}</b></div></div>
      <div class="fl-panel-actions"><button class="btn-primary" onclick="flGuardAction('Open Card')">${t('فتح ملف الآلية', 'Open Card')}</button><button class="fl-mini-btn" onclick="flGuardAction('Fuel Log')">${t('عرض سجل الوقود', 'Fuel Log')}</button><button class="fl-mini-btn" onclick="flGuardAction('Investigate')">${t('فتح تحقيق', 'Investigate')}</button><button class="fl-mini-btn" onclick="flGuardAction('Report')">${t('إنشاء تقرير', 'Report')}</button></div></section>`;
  }

  function guardJarvisHtml(g) {
    const anomalyCount = g.anomalies.length;
    const top = g.anomalies[0];
    if (!top) return `<section class="fl-panel fl-ai-panel"><div class="fl-panel-head"><h3>${tx('تحليل أومني')}</h3></div><p style="color:#15803d">✅ ${t('الأسطول يعمل بشكل طبيعي. لا توجد شذوذات أو مخالفات حالية.', 'Fleet operating normally. No anomalies detected.')}</p></section>`;
    const jarvisMsg = top.type === tx('شبهة وقود')
      ? t(`هذه الآلية (${esc(top.vehicle?.plate || '')}) سجلت نقص وقود غير مفسر مع قراءة منخفضة الثقة. يوصى بفتح تحقيق ومراجعة سجل التعبئة والسائق.`, `Vehicle (${esc(top.vehicle?.plate || '')}) logged unexplained fuel loss with low confidence. Investigation recommended.`)
      : top.type === tx('تجاوز سرعة')
        ? t(`الآلية (${esc(top.vehicle?.plate || '')}) تجاوزت حد السرعة في ${esc(tObj(top.vehicle?.zone?.name) || '')} بسرعة ${fmt(top.vehicle?.currentSpeed || 0)} كم/س. المخالفات: ${g.speedViolations}.`, `Vehicle (${esc(top.vehicle?.plate || '')}) exceeded speed limit in ${esc(tObj(top.vehicle?.zone?.name) || '')} at ${fmt(top.vehicle?.currentSpeed || 0)} km/h. Speeding cases: ${g.speedViolations}.`)
        : t(`تم رصد ${anomalyCount} شذوذ في الأسطول. التفاصيل في جدول الشذوذ أدناه.`, `${anomalyCount} anomalies found in fleet. Details logged in panel below.`);
    return `<section class="fl-panel fl-ai-panel"><div class="fl-panel-head"><h3>${tx('تحليل أومني')}</h3><span class="fl-badge fl-st-maint">${anomalyCount} ${t('شذوذ', 'Anomalies')}</span></div><p>${jarvisMsg} ${t('(نظام قراءة فقط — لا يمكن اتخاذ إجراءات مباشرة من هذه اللوحة)', '(Read-only — direct AI actions disabled)')}</p></section>`;
  }

  function guardInvestigationPanel(g) {
    const openCases = g.anomalies.filter(a => a.severity === 'critical' || a.severity === 'high');
    return `<section class="fl-panel"><div class="fl-panel-head"><h3>${tx('التحقيقات المفتوحة')}</h3><span class="fl-badge fl-st-maint">${openCases.length} ${t('حالة', 'Cases')}</span></div>
      ${openCases.length ? `<table class="fl-table"><thead><tr><th>${t('المركبة', 'Vehicle')}</th><th>${tx('النوع')}</th><th>${tx('التفاصيل')}</th><th>${tx('الحالة')}</th><th>${tx('الإجراء الموصى به')}</th></tr></thead><tbody>${openCases.map(a => `<tr class="${a.severity === 'critical' ? 'fl-row-danger' : 'fl-row-warn'}"><td>${esc(a.vehicle?.plate || '')}</td><td>${esc(a.type)}</td><td>${esc(a.detail)}</td><td><span class="fl-sev fl-sev-${a.severity}">${a.severity === 'critical' ? tx('حرجة') : tx('عالية')}</span></td><td><button class="fl-mini-btn" onclick="flGuardAction('Investigate')">${tx('فتح تحقيق')}</button></td></tr>`).join('')}</tbody></table>` : `<p class="fl-muted" style="padding:12px">${t('لا توجد تحقيقات مفتوحة حالياً', 'No active investigations currently')}</p>`}
      <div style="margin-top:10px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px"><strong>${t('ملاحظة:', 'Note:')}</strong> ${t('زر "فتح تحقيق" يعرض تجريبي حالياً. في الإصدار الكامل سينشئ ملف تحقيق مستقل.', 'Investigation buttons are demos. Full version integrates complete timeline and audit evidence.')}</div></section>`;
  }

  function renderFleetGuard() {
    const el = document.getElementById('flGuardBody'); if (!el) return;
    const g = buildGuardSnapshot();
    const vehicles = filterGuardVehicles(g.vehicles);
    const active = vehicles.filter(v => v.status === 'active').length;
    const offline = vehicles.filter(v => v.markerStatus === 'offline').length;
    const serviceDue = g.service.filter(s => s.service !== tx('ضمن الجدول')).length;
    const fuelCost = g.fuels.reduce((s, f) => s + money(f.cost), 0);
    const zoneOptions = uniqueOptions(g.vehicles, 'project').map(p => `<option value="${esc(p)}" ${guardProject === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    const driverOptions = uniqueOptions(g.vehicles, 'driver').map(d => `<option value="${esc(d)}" ${guardDriver === d ? 'selected' : ''}>${esc(d)}</option>`).join('');
    const typeOptions = uniqueOptions(g.vehicles, 'type').map(t2 => `<option value="${esc(t2)}" ${guardType === t2 ? 'selected' : ''}>${esc(TYPE_LABEL[t2] || t2)}</option>`).join('');
    const anomalyRows = g.anomalies.map(a => `<tr class="${a.severity === 'critical' ? 'fl-row-danger' : a.severity === 'high' ? 'fl-row-warn' : ''}"><td><span class="fl-sev fl-sev-${a.severity}">${a.severity === 'critical' ? t('حرج', 'Critical') : a.severity === 'high' ? t('عالي', 'High') : t('متوسط', 'Medium')}</span></td><td>${esc(a.vehicle?.plate || '')}</td><td>${esc(a.type)}</td><td>${esc(a.detail)}</td><td>${esc(a.action)}</td></tr>`).join('');
    const fuelRows = g.fuels.map(f => `<tr class="${Math.abs(f.variance) >= 10 ? 'fl-row-danger' : Math.abs(f.variance) ? 'fl-row-warn' : ''}"><td>${esc(f.date)}</td><td>${esc(f.vehicle?.plate || f.plate || '')}</td><td>${esc(f.station)}</td><td>${fmt(f.before)} → ${fmt(f.after)} ${t('لتر', 'L')}</td><td>${fmt(f.dispensed)}</td><td>${fmt(f.measured)}</td><td>${fmt(f.variance)}</td><td>${esc(f.confidence)}</td></tr>`).join('');
    const tripRows = g.trips.map(t2 => `<tr><td>${esc(t2.date)}</td><td>${esc(t2.vehicle?.plate || t2.plate || '')}</td><td>${esc(t2.from || '?')} → ${esc(t2.to || '?')}</td><td>${fmt(t2.planned)} / ${fmt(t2.actual)} ${t('كم', 'km')}</td><td>${fmt(t2.startOdo)} → ${fmt(t2.endOdo)}</td><td>${fmt(t2.fuelStart)}% → ${fmt(t2.fuelEnd)}%</td><td>${fmt(t2.maxSpeed)} ${t('كم/س', 'km/h')}</td><td>${fmt(t2.idleMinutes)} ${t('د', 'm')}</td></tr>`).join('');
    const serviceRows = g.service.map(s => `<tr class="${s.service === tx('عاجل') ? 'fl-row-danger' : s.service === tx('قريب') ? 'fl-row-warn' : ''}"><td>${esc(s.vehicle.plate || tObj(s.vehicle.name))}</td><td>${esc(s.lastOil)}</td><td>${esc(s.nextOilDate)}</td><td>${fmt(s.oilDueKm)} ${t('كم', 'km')}${s.oilDueHours ? ' · ' + fmt(s.oilDueHours) + ' ' + t('ساعة', 'hrs') : ''}</td><td>${esc(s.filters)}</td><td>${esc(s.inspectionState)}</td></tr>`).join('');
    const historyRows = g.vehicles.map(v => {
      const vf = g.fuels.find(f => f.vehicle?.id === v.id || f.vehicle?.plate === v.plate);
      const vt = g.trips.find(t2 => t2.vehicle?.id === v.id || t2.vehicle?.plate === v.plate);
      const vs = g.service.find(s => s.vehicle.id === v.id);
      return `<article class="fl-history-card"><div><strong>${esc(v.plate || tObj(v.name))}</strong><span>${esc(tObj(v.name) || '')}</span></div><ul><li>${tx('السائق / المشغل')}: ${esc(tObj(v.driver) || '-')} · ${tx('المشروع')}: ${esc(tObj(v.project) || '-')}</li><li>${t('آخر رحلة', 'Last Trip')}: ${vt ? esc((vt.from || '?') + ' → ' + (vt.to || '?')) : t('لا توجد', 'None')} · ${vt ? fmt(vt.actual) + ' ' + t('كم', 'km') : ''}</li><li>${t('آخر تعبئة/قياس', 'Last Fill')}: ${vf ? fmt(vf.dispensed) + ' L, ' + t('فرق ', 'var ') + fmt(vf.variance) : t('لا توجد', 'None')}</li><li>${t('زيت وفحص', 'Service & Insp')}: ${vs ? esc(vs.nextOilDate) + ' · ' + esc(vs.inspectionState) : t('غير مجدول', 'Not set')}</li><li>${t('حالة الخطر', 'Risk State')}: ${guardStatusLabel(v.markerStatus)}</li></ul></article>`;
    }).join('');
    el.innerHTML = `
      ${isDemoMode() ? `<div class="fl-guard-note">${DEMO_NOTE}</div>` : ''}
      <div class="fl-guard-filter-bar"><div class="fl-filter-group"><label>${t('عرض حسب', 'Filter Status')}</label><div class="fl-filter-buttons">${['all','normal','fuel_anomaly','speeding','offline','outside_zone','idle'].map(f => `<button class="fl-filter-btn ${guardFilter===f?'active':''}" onclick="flSetGuardFilter('${f}')">${{all:t('الكل','All'),normal:t('طبيعي','Normal'),fuel_anomaly:t('نقص وقود','Fuel Loss'),speeding:t('تجاوز سرعة','Speeding'),offline:t('غير متصل','Offline'),outside_zone:t('خارج النطاق','Out of Zone'),idle:t('توقف طويل','Long Idle')}[f]}</button>`).join('')}</div></div>
      <div class="fl-filter-group"><label>${tx('المشروع')}</label><select class="fl-input" onchange="flSetGuardProject(this.value)"><option value="">${t('الكل', 'All')}</option>${zoneOptions}</select></div>
      <div class="fl-filter-group"><label>${tx('السائق')}</label><select class="fl-input" onchange="flSetGuardDriver(this.value)"><option value="">${t('الكل', 'All')}</option>${driverOptions}</select></div>
      <div class="fl-filter-group"><label>${t('نوع الآلية', 'Vehicle Type')}</label><select class="fl-input" onchange="flSetGuardType(this.value)"><option value="">${t('الكل', 'All')}</option>${typeOptions}</select></div></div>
      <div class="fl-kpi-grid">
        ${kpi(tx('إجمالي الأسطول'), g.vehicles.length, t(`${active} فعالة · ${offline} غير متصلة`, `${active} active · ${offline} offline`), 'fl-kpi-accent')}
        ${kpi(tx('تنبيهات الوقود'), g.anomalies.filter(a => a.type.includes('وقود') || a.type.includes('فرق')).length, t(`${fmt(g.suspiciousLiters)} لتر مشتبه`, `${fmt(g.suspiciousLiters)} L suspected`), g.anomalies.length ? 'fl-kpi-warn' : '')}
        ${kpi(tx('مخالفات السرعة'), g.speedViolations, t('حسب المنطقة ونوع المركبة', 'By zone and vehicle limit'), g.speedViolations ? 'fl-kpi-warn' : '')}
        ${kpi(t('صيانة/فحص قريب', 'Due Service'), serviceDue, t('زيت · فلاتر · فحص تشغيل', 'Oil · Filter · Insp'), serviceDue ? 'fl-kpi-warn' : '')}
        ${kpi(t('كلفة تعبئة العرض', 'Demo Fuel Cost'), fmt(fuelCost) + ' ' + curSym(), t('من سجل التعبئة والقياس', 'From logs and sensor telemetry'), '')}
      </div>
      <div class="fl-guard-grid">
        ${guardMapHtml(vehicles, g)}
        ${guardSpeedPolicyTable(g)}
      </div>
      <div class="fl-guard-grid">
        <div>${guardSelectedVehicleHtml(g, vehicles)}${guardJarvisHtml(g)}</div>
        ${guardInvestigationPanel(g)}
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('مركز الشذوذ والتحقيق')}</h3></div><table class="fl-table"><thead><tr><th>${tx('خطورة')}</th><th>${t('المركبة', 'Vehicle')}</th><th>${tx('النوع')}</th><th>${tx('التفاصيل')}</th><th>${tx('الإجراء الموصى به')}</th></tr></thead><tbody>${anomalyRows || `<tr><td colspan="5" class="fl-empty">${t('لا توجد شذوذات في العرض الحالي', 'No anomalies in current view')}</td></tr>`}</tbody></table></div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('تعبئة وقياس الوقود')}</h3></div><table class="fl-table"><thead><tr><th>${tx('التاريخ')}</th><th>${t('المركبة', 'Vehicle')}</th><th>${t('المصدر', 'Source')}</th><th>${t('الخزان قبل/بعد', 'Tank Before/After')}</th><th>${t('مصروف', 'Dispensed')}</th><th>${t('مقاس', 'Measured')}</th><th>${t('الفرق', 'Variance')}</th><th>${t('الثقة', 'Confidence')}</th></tr></thead><tbody>${fuelRows}</tbody></table></div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${t('تاريخ الرحلات', 'Trips History')}</h3></div><table class="fl-table"><thead><tr><th>${tx('التاريخ')}</th><th>${t('المركبة', 'Vehicle')}</th><th>${t('المسار', 'Route')}</th><th>${t('مخطط/فعلي', 'Plan/Actual')}</th><th>${t('العداد', 'Odometer')}</th><th>${t('الوقود', 'Fuel')}</th><th>${t('أقصى سرعة', 'Max Speed')}</th><th>${t('توقف', 'Idle')}</th></tr></thead><tbody>${tripRows}</tbody></table></div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${t('تبديل الزيت والفحوصات', 'Oil Changes & Checks')}</h3></div><table class="fl-table"><thead><tr><th>${t('المركبة', 'Vehicle')}</th><th>${t('آخر زيت', 'Last Oil')}</th><th>${t('القادم', 'Next Due')}</th><th>${t('العداد/الساعات', 'Odo/Hours')}</th><th>${t('الفلاتر', 'Filters')}</th><th>${t('نتيجة الفحص', 'Insp Status')}</th></tr></thead><tbody>${serviceRows}</tbody></table></div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${t('ملف تاريخ كامل لكل مركبة/معدة', 'Full Historical Log per Asset')}</h3></div><div class="fl-history-grid">${historyRows}</div></div>`;
  }

  function renderDashboard() {
    const el = document.getElementById('flDashBody'); if (!el) return;
    const p = portfolio();
    const demoBadge = isDemoMode() ? `<div class="fl-guard-note" style="margin-bottom:14px">${DEMO_NOTE}</div>` : '';
    el.innerHTML = `${demoBadge}
      <div class="fl-kpi-grid">
        ${kpi(tx('المركبات'), p.count, t(`${p.active} في الخدمة · ${p.maintenance} صيانة`, `${p.active} in service · ${p.maintenance} maint`), 'fl-kpi-accent')}
        ${kpi(tx('تنبيهات الوثائق'), p.alerts.length, t('إجازة/تأمين قريب أو منتهٍ', 'License/Insurance near expiry'), p.alerts.length ? 'fl-kpi-warn' : '')}
        ${kpi(tx('وقود هذا الشهر'), fmt(p.fuelMonth) + ' ' + curSym(), '', '')}
        ${kpi(tx('إجمالي المسافات'), fmt(p.totalDistance) + ' ' + t('كم', 'km'), t('كل الرحلات', 'Total all trips'), '')}
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>🚨 ${tx('وثائق تحتاج تجديداً')}</h3></div>
        <table class="fl-table"><thead><tr><th>${t('المركبة', 'Vehicle')}</th><th>${tx('الوثيقة')}</th><th>${tx('الحالة')}</th><th>${tx('التاريخ')}</th></tr></thead>
        <tbody>${p.alerts.map(a => `<tr class="${a.view.expired ? 'fl-row-danger' : 'fl-row-warn'}"><td><strong>${esc(a.v.plate)}</strong> · ${esc(tObj(a.v.name) || '')}</td><td>${a.kind}</td><td>${a.view.expired ? t(`منتهية منذ ${Math.abs(a.view.days)} يوم`, `Expired ${Math.abs(a.view.days)} days ago`) : t(`خلال ${a.view.days} يوم`, `Due in ${a.view.days} days`)}</td><td class="fl-muted">${esc(a.exp)}</td></tr>`).join('') || `<tr><td colspan="4" class="fl-empty">${t('كل الوثائق سارية ✅', 'All documents active ✅')}</td></tr>`}</tbody></table>
      </div>`;
  }

  function renderVehicles() {
    const el = document.getElementById('flVehBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    let list = getVehicles();
    if (search) { const q = search.toLowerCase(); list = list.filter(v => `${v.plate} ${tObj(v.name)} ${tObj(v.driver)}`.toLowerCase().includes(q)); }
    const demoBadge = isDemoMode() ? `<div class="fl-guard-note" style="margin-bottom:8px">${DEMO_NOTE}</div>` : '';
    el.innerHTML = `${demoBadge}
      <div class="fl-toolbar">
        <button class="btn-primary" onclick="flOpenForm('new')">➕ ${t('مركبة', 'Vehicle')}</button>
        <button class="fl-mini-btn" onclick="flLoadDemo()">${t('بيانات تجريبية', 'Load Demo Data')}</button>
        <input class="fl-input" placeholder="${t('بحث...', 'Search...')}" value="${esc(search)}" oninput="flSearch(this.value)" style="max-width:200px">
      </div>
      <table class="fl-table"><thead><tr><th>${tx('اللوحة')}</th><th>${tx('النوع')}</th><th>${tx('السائق')}</th><th>${tx('العداد')}</th><th>${tx('الإجازة')}</th><th>${tx('التأمين')}</th><th>${tx('الحالة')}</th><th>${tx('إجراءات')}</th></tr></thead>
      <tbody>${list.map(v => {
        const lic = expiryView(v.licenseExpiry), ins = expiryView(v.insuranceExpiry);
        const badge = (e, iso) => !e.has ? '<span class="fl-muted">—</span>' : `<span class="${e.expired ? 'fl-exp-bad' : e.soon ? 'fl-exp-warn' : 'fl-exp-ok'}">${esc(iso)}</span>`;
        return `<tr><td><strong>${esc(v.plate)}</strong><br><span class="fl-muted">${esc(tObj(v.name) || '')}</span></td>
          <td>${TYPE_LABEL[v.type] || v.type}</td><td>${esc(tObj(v.driver) || '—')}</td><td>${fmt(v.odometer)} ${t('كم', 'km')}</td>
          <td>${badge(lic, v.licenseExpiry)}</td><td>${badge(ins, v.insuranceExpiry)}</td>
          <td><span class="fl-badge ${STATUS_CLASS[v.status] || ''}">${STATUS_LABEL[v.status] || v.status}</span></td>
          <td class="fl-actions"><button class="fl-mini-btn" onclick="flOpenForm('${v.id}')">${tx('تعديل')}</button><button class="fl-mini-btn" onclick="flSetStatus('${v.id}','${v.status === 'maintenance' ? 'active' : 'maintenance'}')">${v.status === 'maintenance' ? t('إنهاء صيانة', 'End Maint') : tx('صيانة')}</button><button class="fl-mini-btn fl-danger" onclick="flArchive('${v.id}')">${tx('أرشفة')}</button></td></tr>`;
      }).join('') || `<tr><td colspan="8" class="fl-empty">${t('لا توجد مركبات', 'No vehicles registered')}</td></tr>`}</tbody></table>`;
  }

  function renderForm() {
    const v = editing !== 'new' ? (F()?.vehicles || []).find(x => x.id === editing) : null; const d = v || {};
    const tOpt = TYPES.map(([k, l]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${l}</option>`).join('');
    const sOpt = Object.entries(STATUS_LABEL).filter(([k]) => k !== 'retired').map(([k, l]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="fl-panel"><div class="fl-panel-head"><h3>${v ? tx('تعديل مركبة') : tx('مركبة جديدة')}</h3></div>
      <div class="fl-form-grid">
        <div><label>${tx('رقم اللوحة *')}</label><input id="flPlate" class="fl-input" value="${esc(d.plate || '')}"></div>
        <div><label>${tx('الاسم/الوصف')}</label><input id="flName" class="fl-input" value="${esc(tObj(d.name) || '')}"></div>
        <div><label>${tx('النوع')}</label><select id="flType" class="fl-input">${tOpt}</select></div>
        <div><label>${tx('السائق')}</label><input id="flDriver" class="fl-input" value="${esc(tObj(d.driver) || '')}"></div>
        <div><label>${t('العداد (كم)', 'Odometer (km)')}</label><input id="flOdo" type="number" class="fl-input" value="${money(d.odometer) || ''}"></div>
        <div><label>${tx('نوع الوقود')}</label><input id="flFuel" class="fl-input" value="${esc(tObj(d.fuelType) || '')}"></div>
        <div><label>${tx('انتهاء الإجازة')}</label><input id="flLicense" type="date" class="fl-input" value="${esc(d.licenseExpiry || '')}"></div>
        <div><label>${tx('انتهاء التأمين')}</label><input id="flInsurance" type="date" class="fl-input" value="${esc(d.insuranceExpiry || '')}"></div>
        <div><label>${tx('الحالة')}</label><select id="flStatus" class="fl-input">${sOpt}</select></div>
        <div class="fl-form-full"><label>${tx('ملاحظات')}</label><input id="flNotes" class="fl-input" value="${esc(tObj(d.notes) || '')}"></div>
      </div>
      <div class="fl-form-actions"><button class="btn-primary" onclick="flSaveVehicle()">${tx('حفظ')}</button><button class="fl-mini-btn" onclick="flCancelForm()">${tx('إلغاء')}</button></div></div>`;
  }

  function renderFuelRisk() {
    const el = document.getElementById('flFuelBody'); if (!el) return;
    const g = buildGuardSnapshot();
    const f = F();
    const vehOpts = ['<option value="">— ' + t('اختر المركبة', 'Select Vehicle') + ' —</option>'].concat(getVehicles().map(v => `<option value="${v.id}">${esc(v.plate)} (${esc(tObj(v.name) || '')})</option>`)).join('');
    const fuel = (f.fuelLogs || []).slice(0, 20);
    const demoBadge = isDemoMode() ? `<div class="fl-guard-note" style="margin-bottom:8px">${DEMO_NOTE}</div>` : '';
    const riskRows = g.fuels.filter(f2 => Math.abs(f2.variance) >= 5).map(f2 => `<tr class="${Math.abs(f2.variance) >= 10 ? 'fl-row-danger' : 'fl-row-warn'}"><td>${esc(f2.date)}</td><td>${esc(f2.vehicle?.plate || f2.plate || '')}</td><td>${esc(f2.station)}</td><td>${fmt(f2.tank)} L</td><td>${fmt(f2.before)} → ${fmt(f2.after)}</td><td>${fmt(f2.dispensed)}</td><td>${fmt(f2.measured)}</td><td style="font-weight:800;color:${f2.variance < -7 ? '#dc2626' : '#b45309'}">${fmt(f2.variance)}</td><td>${esc(f2.confidence)}</td></tr>`).join('');
    el.innerHTML = `${demoBadge}
      <div class="fl-kpi-grid">
        ${kpi(tx('حالات مشبوهة'), riskRows.length || 0, t('فرق تعبئة > 5 لتر', 'Refill difference > 5 L'), riskRows.length ? 'fl-kpi-warn' : '')}
        ${kpi(tx('إجمالي الفرق'), fmt(g.suspiciousLiters) + ' ' + t('لتر', 'L'), t('وقود غير موثق', 'Unexplained fuel loss'), g.suspiciousLiters ? 'fl-kpi-warn' : '')}
        ${kpi(tx('عدد التعبئات'), g.fuels.length, t('آخر 8 عمليات', 'Last 8 refuels'), '')}
        ${kpi(tx('الثقة المنخفضة'), g.fuels.filter(f2 => f2.confidence === tx('منخفضة')).length, t('قراءات غير موثوقة', 'Untrusted readings'), '')}
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>⛽ ${tx('تسجيل تزويد وقود (بيانات حقيقية)')}</h3></div>
        <div class="fl-form-grid">
          <div><label>${t('المركبة', 'Vehicle')}</label><select id="flFuelVehicle" class="fl-input">${vehOpts}</select></div>
          <div><label>${tx('التاريخ')}</label><input id="flFuelDate" type="date" class="fl-input" value="${todayISO()}"></div>
          <div><label>${t('اللترات', 'Liters')}</label><input id="flFuelLiters" type="number" class="fl-input"></div>
          <div><label>${t('الكلفة', 'Cost')} (${curSym()})</label><input id="flFuelCost" type="number" class="fl-input"></div>
          <div><label>${tx('قراءة العداد')}</label><input id="flFuelOdo" type="number" class="fl-input"></div>
        </div>
        <div class="fl-form-actions"><button class="btn-primary" onclick="flLogFuel()">${tx('تسجيل (يُرحَّل كمصروف نقل)')}</button></div>
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('مخاطر الوقود ومكافحة السرقة')}</h3></div>
        ${riskRows ? `<table class="fl-table"><thead><tr><th>${tx('التاريخ')}</th><th>${t('المركبة', 'Vehicle')}</th><th>${t('المصدر', 'Source')}</th><th>${t('سعة الخزان', 'Capacity')}</th><th>${t('قبل/بعد', 'Before/After')}</th><th>${t('مصروف', 'Dispensed')}</th><th>${t('مقاس', 'Measured')}</th><th>${t('الفرق', 'Variance')}</th><th>${t('الثقة', 'Confidence')}</th></tr></thead><tbody>${riskRows}</tbody></table>` : `<p class="fl-muted" style="padding:12px">${t('جميع عمليات التعبئة طبيعية — لا توجد فروق مشبوهة', 'All fuel refuels are normal — no suspicious theft alarms')}</p>`}
        <div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;font-size:13px;line-height:1.8"><strong>${t('آلية كشف سرقة الوقود:', 'Fuel Theft Detection Engine:')}</strong><br>• ${t('مقارنة كمية المضخة بقراءة حساس الخزان', 'Compare pump flow liters with electronic tank sensor level')}<br>• ${t('كشف الهبوط المفاجئ عند الخروج من الموقع', 'Alert sudden drop in fuel levels when leaving project zones')}<br>• ${t('تنبيه عند انقطاع الإشارة مع نقص وقود', 'Raise critical alarms on GPS signal cuts with fuel drops')}<br>• ${t('تقارير فترة الخمول واستهلاك الوقود', 'Correlate idle duration with fuel telemetry logs')}<br><span class="fl-muted">(${t('النظام يستخدم بيانات تجريبية — الربط مع الحساسات قادم في الإصدار القادم', 'Telemetries are simulated — active hardware binding in next release')})</span></div>
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('سجل الوقود الكامل')}</h3></div>
        <table class="fl-table"><thead><tr><th>${tx('التاريخ')}</th><th>${t('المركبة', 'Vehicle')}</th><th>${t('لترات', 'Liters')}</th><th>${t('الكلفة', 'Cost')}</th><th>${tx('قراءة العداد')}</th></tr></thead>
        <tbody>${fuel.map(l => `<tr><td class="fl-muted">${esc(l.date)}</td><td>${esc(l.plate)}</td><td>${fmt(l.liters)}</td><td>${l.cost ? fmt(l.cost) + ' ' + curSym() : '—'}</td><td>${fmt(l.odometer)}</td></tr>`).join('') || `<tr><td colspan="5" class="fl-empty">${t('لا يوجد سجل وقود حقيقي — استخدم نموذج التسجيل أعلاه', 'No real logs saved. Log new fuel refill above.')}</td></tr>`}</tbody></table>
      </div>`;
  }

  function renderTrips() {
    const el = document.getElementById('flTripBody'); if (!el) return;
    const f = F();
    const vehOpts = ['<option value="">— ' + t('اختر المركبة', 'Select Vehicle') + ' —</option>'].concat(getVehicles().map(v => `<option value="${v.id}">${esc(v.plate)} (${esc(tObj(v.name) || '')})</option>`)).join('');
    const trips = (f.trips || []).slice(0, 20);
    const g = buildGuardSnapshot();
    const demoBadge = isDemoMode() ? `<div class="fl-guard-note" style="margin-bottom:8px">${DEMO_NOTE}</div>` : '';
    el.innerHTML = `${demoBadge}
      <div class="fl-kpi-grid">
        ${kpi(tx('إجمالي الرحلات'), trips.length, isDemoMode() ? t('يشمل بيانات تجريبية', 'Includes mock data') : '', '')}
        ${kpi(tx('إجمالي المسافات'), trips.reduce((s,t2) => s + money(t2.distance), 0).toLocaleString() + ' ' + t('كم', 'km'), '', '')}
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>🛣️ ${tx('تسجيل رحلة (بيانات حقيقية)')}</h3></div>
        <div class="fl-form-grid">
          <div><label>${t('المركبة', 'Vehicle')}</label><select id="flTripVehicle" class="fl-input">${vehOpts}</select></div>
          <div><label>${tx('التاريخ')}</label><input id="flTripDate" type="date" class="fl-input" value="${todayISO()}"></div>
          <div><label>${tx('السائق')}</label><input id="flTripDriver" class="fl-input"></div>
          <div><label>${tx('من')}</label><input id="flTripFrom" class="fl-input"></div>
          <div><label>${tx('إلى')}</label><input id="flTripTo" class="fl-input"></div>
          <div><label>${tx('المسافة (كم)')}</label><input id="flTripDist" type="number" class="fl-input"></div>
          <div class="fl-form-full"><label>${tx('الغرض')}</label><input id="flTripPurpose" class="fl-input"></div>
        </div>
        <div class="fl-form-actions"><button class="btn-primary" onclick="flLogTrip()">${t('تسجيل الرحلة', 'Save Trip Log')}</button></div>
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${t('مناطق السرعة', 'Speed Limit Geofences')}</h3></div>
        <table class="fl-table"><thead><tr><th>${tx('المنطقة')}</th><th>${t('الحد للخفيف', 'Light Limit')}</th><th>${t('الحد للثقيل', 'Heavy Limit')}</th></tr></thead>
        <tbody>${g.zones.map(z => `<tr><td>${esc(tObj(z.name))}</td><td>${fmt(z.limit)} ${t('كم/س', 'km/h')}</td><td>${fmt(z.heavyLimit)} ${t('كم/س', 'km/h')}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('سجل الرحلات')}</h3></div>
        <table class="fl-table"><thead><tr><th>${tx('التاريخ')}</th><th>${t('المركبة', 'Vehicle')}</th><th>${t('المسار', 'Route')}</th><th>${t('المسافة', 'Distance')}</th><th>${tx('الغرض')}</th></tr></thead>
        <tbody>${trips.map(t2 => `<tr><td class="fl-muted">${esc(t2.date)}</td><td>${esc(t2.plate)}</td><td>${esc(t2.from || '?')} → ${esc(t2.to || '?')}</td><td>${fmt(t2.distance)} ${t('كم', 'km')}</td><td>${esc(t2.purpose || '')}</td></tr>`).join('') || `<tr><td colspan="5" class="fl-empty">${t('لا يوجد سجل رحلات حقيقي — استخدم نموذج التسجيل أعلاه', 'No real trip logs recorded. Log new trip above.')}</td></tr>`}</tbody></table>
      </div>`;
  }

  function renderInvest() {
    const el = document.getElementById('flInvestBody'); if (!el) return;
    const g = buildGuardSnapshot();
    const openCases = g.anomalies;
    const criticalCount = openCases.filter(a => a.severity === 'critical').length;
    const highCount = openCases.filter(a => a.severity === 'high').length;
    const mediumCount = openCases.filter(a => a.severity === 'medium').length;
    const demoBadge = isDemoMode() ? `<div class="fl-guard-note" style="margin-bottom:8px">${DEMO_NOTE}</div>` : '';
    el.innerHTML = `${demoBadge}
      <div class="fl-kpi-grid">
        ${kpi(t('حالات حرجة', 'Critical'), criticalCount, t('تتطلب تحقيقاً فورياً', 'Requires immediate action'), criticalCount ? 'fl-kpi-warn' : '')}
        ${kpi(t('عالية', 'High Risk'), highCount, t('مراجعة خلال 24 ساعة', 'Review within 24 hours'), highCount ? 'fl-kpi-warn' : '')}
        ${kpi(t('متوسطة', 'Medium Risk'), mediumCount, t('مراجعة خلال 48 ساعة', 'Review within 48 hours'), '')}
        ${kpi(tx('إجمالي التحقيقات'), openCases.length, isDemoMode() ? t('بيانات تجريبية', 'Demo Mode') : '', '')}
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('جميع حالات الشذوذ')}</h3></div>
        <table class="fl-table"><thead><tr><th>${tx('خطورة')}</th><th>${t('المركبة', 'Vehicle')}</th><th>${tx('النوع')}</th><th>${tx('التفاصيل')}</th><th>${tx('الإجراء الموصى به')}</th><th>${tx('إجراءات')}</th></tr></thead>
        <tbody>${openCases.map(a => `<tr class="${a.severity === 'critical' ? 'fl-row-danger' : a.severity === 'high' ? 'fl-row-warn' : ''}"><td><span class="fl-sev fl-sev-${a.severity}">${a.severity === 'critical' ? t('حرج', 'Critical') : a.severity === 'high' ? t('عالي', 'High') : t('متوسط', 'Medium')}</span></td><td>${esc(a.vehicle?.plate || '')}</td><td>${esc(a.type)}</td><td>${esc(a.detail)}</td><td>${esc(a.action)}</td><td><button class="fl-mini-btn" onclick="flGuardAction('Investigate')">${tx('فتح تحقيق')}</button><button class="fl-mini-btn" onclick="flGuardAction('Report')">${t('تقرير', 'Report')}</button></td></tr>`).join('') || `<tr><td colspan="6" class="fl-empty">${t('لا توجد شذوذات — الأسطول يعمل بشكل طبيعي ✅', 'No anomalies found — fleet operating normally ✅')}</td></tr>`}</tbody></table>
      </div>
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('آلية عمل التحقيقات')}</h3></div>
        <div style="padding:12px;font-size:13px;line-height:1.9">
          <strong>${t('مراحل التحقيق:', 'Investigation Phases:')}</strong><br>
          1. ${t('كشف الشذوذ — يتم رصد المخالفات تلقائياً (سرعة، وقود، توقف، خروج عن النطاق)', 'Detect Anomaly — System parses speed, geofence, and fuel anomalies automatically')}<br>
          2. ${t('فتح تحقيق — ينشئ ملف تحقيق مستقل مع كافة التفاصيل', 'Open Case — HR/Admin triggers case file detailing telemetry snapshots')}<br>
          3. ${t('جمع الأدلة — ربط بيانات GPS، قراءات الوقود، وصلات المضخة، تسجيلات السائق', 'Gather Evidence — Link GPS logs, fuel telemetry, pump slips, and operator logs')}<br>
          4. ${t('التقييم — تصنيف الخطورة واقتراح الإجراء', 'Assess & Score — Rate risks and suggest warnings/penalties')}<br>
          5. ${t('الإغلاق — توثيق النتيجة والإجراء المتخذ', 'Close & Resolve — File disciplinary warnings or calibrate sensors')}<br>
          <span class="fl-muted">(${t('هذه الواجهة عرض تجريبي — التحقيقات الكاملة مع قاعدة الأدلة قادمة', 'This panel is a mock presentation — resolved database hooks in next release')})</span>
        </div>
      </div>`;
  }

  function renderSettings() {
    const el = document.getElementById('flSettingsBody'); if (!el) return;
    el.innerHTML = `
      <div class="fl-panel"><div class="fl-panel-head"><h3>${tx('إعدادات الربط التجريبي')}</h3></div>
        <div style="padding:12px;font-size:14px;line-height:2">
          <p><strong>${DEMO_NOTE}</strong></p>
          <p>${t('هذا القسم يوضح خيارات الربط المتاحة في الإصدار الكامل. الوضع التجريبي الحالي يستخدم بيانات مدمجة في الذاكرة.', 'This panel demonstrates API connectors available in the complete production environment. Demo mode utilizes in-memory seed data.')}</p>
          <div style="margin:16px 0;display:grid;gap:12px">
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc"><strong>${t('خيارات الربط المتوقعة:', 'Available API Integration Protocols:')}</strong><br>
            • ${t('أجهزة تتبع نظام تحديد المواقع (GPS/GSM Tracker)', 'GPS/GSM Tracker — Concox, Queclink, Teltonika protocols')}<br>
            • ${t('قارئ بيانات المركبة (CAN/J1939)', 'CAN/J1939 — OBD-II / J1939 CAN bus telemetry')}<br>
            • ${t('حساسات خزان وقود — مقاومات/مكثفات / ضغط', 'Digital Fuel Sensors — resistive/capacitive/pressure telemetry')}<br>
            • ${t('قارئات RFID للوقود — لكل مركبة ومضخة', 'RFID Fuel Rings — authorize pumps per vehicle registration')}<br>
            • ${t('تكامل مع كاميرات الموقع — للتحقق البصري', 'CCTV Site Integration — visual verification matches fuel logs')}</div>
          </div>
          <div class="fl-toolbar">
            <button class="btn-primary" onclick="flLoadDemo()">${t('تحميل بيانات تجريبية', 'Reload Mock Demo Data')}</button>
          </div>
        </div>
      </div>`;
  }

  function kpi(label, value, sub, cls) { return `<div class="fl-kpi ${cls || ''}"><div class="fl-kpi-val">${value}</div><div class="fl-kpi-label">${label}</div>${sub ? `<div class="fl-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderTabContent() {
    const sections = ['flDashBody', 'flVehBody', 'flGuardBody', 'flFuelBody', 'flTripBody', 'flInvestBody', 'flSettingsBody'];
    sections.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    const visible = document.getElementById(activeTab === 'dashboard' ? 'flDashBody' : activeTab === 'vehicles' ? 'flVehBody' : activeTab === 'guard' ? 'flGuardBody' : activeTab === 'fuel_risk' ? 'flFuelBody' : activeTab === 'trips' ? 'flTripBody' : activeTab === 'invest' ? 'flInvestBody' : 'flSettingsBody');
    if (visible) visible.style.display = '';
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'vehicles') renderVehicles();
    else if (activeTab === 'guard') renderFleetGuard();
    else if (activeTab === 'fuel_risk') renderFuelRisk();
    else if (activeTab === 'trips') renderTrips();
    else if (activeTab === 'invest') renderInvest();
    else renderSettings();
  }

  function render() {
    const body = document.getElementById('fleetBody'); if (!body) return;
    ensureData();
    const tabs = [
      ['dashboard', t('📊 لوحة السيطرة', '📊 Dashboard')],
      ['guard', t('🗺️ خريطة المتابعة', '🗺️ Command Map')],
      ['vehicles', t('🚚 المركبات والمعدات', '🚚 Vehicles & Eq')],
      ['fuel_risk', t('⛽ الوقود والمخاطر', '⛽ Fuel & Risks')],
      ['trips', t('🛣️ الرحلات والمناطق', '🛣️ Trips & Zones')],
      ['invest', t('🔍 التقارير والتحقيقات', '🔍 Reports')],
      ['settings', t('⚙️ إعدادات الربط', '⚙️ API Settings')]
    ];
    body.innerHTML = `<div class="fl-tabs">${tabs.map(([k, l]) => `<button class="fl-tab-btn ${activeTab === k ? 'active' : ''}" onclick="flOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="flDashBody"></div><div id="flVehBody"></div><div id="flGuardBody"></div><div id="flFuelBody"></div><div id="flTripBody"></div><div id="flInvestBody"></div><div id="flSettingsBody"></div>`;
    renderTabContent();
  }
  window.renderFleet = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'fleet') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageFleet'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navFleet'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('fleet');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };

  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_fleet_today'] = function () {
          const p = portfolio();
          return { vehicles: p.count, active: p.active, maintenance: p.maintenance, fuelCostThisMonth: p.fuelMonth, totalDistanceKm: p.totalDistance, documentAlerts: p.alerts.map(a => ({ plate: a.v.plate, doc: a.kind, expiry: a.exp, expired: a.view.expired })) };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['fleet'] = '#pageFleet';
      }
    } catch (_) {}
  }

  // Listen for language changes and re-render
  window.addEventListener('octagon:language-applied', function () {
    if (window.currentPage === 'fleet') {
      render();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonFleet = { render, ensureData, portfolio, isDemoMode };
})();
