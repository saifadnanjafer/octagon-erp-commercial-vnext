/**
 * OCTAGON ERP — Loyalty & Rewards Program (برنامج الولاء والمكافآت).
 *
 * A program-level loyalty surface the system lacked: members, a points ledger
 * (earn / redeem / adjust), tiered membership with earn multipliers, and a
 * rewards catalog — usable across every vertical (retail, restaurant, clinic,
 * pharmacy). Retail POS keeps its own simple per-store points; this tab is the
 * cross-business program and ledger of record. No coupling to retail internals.
 *
 * ADD-ONLY. Data lives in omni.loyalty = { members, tiers, rewards, transactions, settings }.
 * Each record carries company context when an active company is available.
 * No confirm()/prompt() — inline forms only (headless-safe).
 */
(function () {
  'use strict';

  let activeView = 'overview';        // overview | members | rewards | tiers | ledger
  let ledgerMemberFilter = 'all';

  /* ───────── helpers ───────── */
  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni || typeof window.omni !== 'object') window.omni = {};
    return window.omni;
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(v) { try { return Math.round(num(v)).toLocaleString('en-US'); } catch (_) { return String(Math.round(num(v))); } }
  function todayISO() {
    if (typeof window.todayISO === 'function') { try { return window.todayISO(); } catch (_) {} }
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysISO(iso, n) { const d = new Date((iso || todayISO()) + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'loy'); } catch (_) {} }
    return (prefix || 'loy') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function save() { if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} } }
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); } catch (_) {} } }
  function currentUserName() {
    try { return window.PentagonAuth?.getCurrentUser?.()?.name || window.PentagonAuth?.currentUser?.name || 'system'; } catch (_) { return 'system'; }
  }
  function activeProfile() {
    try { if (typeof window.getActiveOrgProfile === 'function') return window.getActiveOrgProfile() || {}; } catch (_) {}
    const org = O().adminSettings?.organization || {};
    const companies = Array.isArray(org.companies) ? org.companies : [];
    const co = companies.find(c => c.id === org.activeCompanyId) || companies.find(c => c.isPrimary) || companies[0] || {};
    return { companyId: co.id || org.activeCompanyId || '', companyName: co.name || org.name || '', currencySymbol: org.currencySymbol || 'د.ع' };
  }
  function currency() { return activeProfile().currencySymbol || 'د.ع'; }
  function stamp(rec) {
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.loyalty' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; }
    return rec;
  }

  /* ───────── data ───────── */
  function ensureData() {
    const o = O();
    if (!o.loyalty || typeof o.loyalty !== 'object') o.loyalty = {};
    const l = o.loyalty;
    if (!Array.isArray(l.members)) l.members = [];
    if (!Array.isArray(l.tiers)) l.tiers = [];
    if (!Array.isArray(l.rewards)) l.rewards = [];
    if (!Array.isArray(l.transactions)) l.transactions = [];
    if (!Array.isArray(l.vouchers)) l.vouchers = [];
    if (!l.settings || typeof l.settings !== 'object') l.settings = {};
    // earn rate mirrors the retail default so the program is consistent: 1 pt / 1000 spent.
    if (l.settings.earnPer == null) l.settings.earnPer = 1000;
    if (l.settings.pointValue == null) l.settings.pointValue = 500; // 1 pt = 500 currency on redeem

    if (!l.tiers.length) {
      [
        { name: 'فضي', threshold: 0, multiplier: 1, color: '#94a3b8' },
        { name: 'ذهبي', threshold: 500, multiplier: 1.25, color: '#facc15' },
        { name: 'بلاتيني', threshold: 2000, multiplier: 1.5, color: '#a855f7' }
      ].forEach(t => l.tiers.push(stamp({ id: uid('tier'), name: t.name, threshold: t.threshold, multiplier: t.multiplier, color: t.color, createdAt: new Date().toISOString() })));
    }
    if (!l.rewards.length) {
      [
        { name: 'خصم 5,000', costPoints: 10 },
        { name: 'خصم 15,000', costPoints: 25 },
        { name: 'منتج/خدمة مجانية', costPoints: 50 }
      ].forEach(r => l.rewards.push(stamp({ id: uid('rwd'), name: r.name, costPoints: r.costPoints, active: true, createdAt: new Date().toISOString() })));
    }
    if (!l.members.length && !l._seeded) {
      l._seeded = true;
      const m1 = stamp({ id: uid('mem'), name: 'سارة محمد', phone: '07700000000', points: 0, totalEarned: 0, totalRedeemed: 0, joinedAt: todayISO(), createdAt: new Date().toISOString() });
      const m2 = stamp({ id: uid('mem'), name: 'أحمد العبيدي', phone: '07800000000', points: 0, totalEarned: 0, totalRedeemed: 0, joinedAt: todayISO(), createdAt: new Date().toISOString() });
      l.members.push(m1, m2);
      earn(m1.id, 30, 'مشتريات افتتاحية', 'seed');
      earn(m2.id, 8, 'زيارة أولى', 'seed');
    }
    recomputeTiers();
  }
  function L() { ensureData(); return O().loyalty; }
  function memberById(id) { return L().members.find(m => m.id === id); }
  function tierForPoints(totalEarned) {
    // Use O().loyalty directly (NOT L()) — this runs inside ensureData()/recomputeTiers,
    // and L() would re-enter ensureData() causing infinite recursion.
    const all = (O().loyalty && O().loyalty.tiers) || [];
    const tiers = all.slice().sort((a, b) => b.threshold - a.threshold);
    return tiers.find(t => totalEarned >= t.threshold) || tiers[tiers.length - 1] || null;
  }
  function recomputeTiers() {
    const l = O().loyalty;
    if (!l) return;
    l.members.forEach(m => {
      const t = tierForPoints(m.totalEarned || 0);
      m.tierId = t ? t.id : null;
      m.tierName = t ? t.name : '';
    });
  }

  /* ───────── core ledger ops ───────── */
  function earn(memberId, points, note, source) {
    const l = O().loyalty; // direct — earn() is called from inside ensureData() seed; L() would recurse
    const m = l.members.find(x => x.id === memberId);
    if (!m) return false;
    points = Math.max(0, Math.round(num(points)));
    if (!points) return false;
    m.points = num(m.points) + points;
    m.totalEarned = num(m.totalEarned) + points;
    l.transactions.push(stamp({ id: uid('ltx'), memberId, type: 'earn', points, note: note || '', source: source || 'manual', date: todayISO(), at: new Date().toISOString(), by: currentUserName() }));
    recomputeTiers();
    return true;
  }
  function redeem(memberId, points, note, source) {
    const l = O().loyalty; // direct — avoid L()/ensureData re-entry
    const m = l.members.find(x => x.id === memberId);
    if (!m) return { ok: false, reason: 'not_found' };
    points = Math.max(0, Math.round(num(points)));
    if (!points) return { ok: false, reason: 'zero' };
    if (num(m.points) < points) return { ok: false, reason: 'insufficient' };
    m.points = num(m.points) - points;
    m.totalRedeemed = num(m.totalRedeemed) + points;
    l.transactions.push(stamp({ id: uid('ltx'), memberId, type: 'redeem', points: -points, note: note || '', source: source || 'manual', date: todayISO(), at: new Date().toISOString(), by: currentUserName() }));
    return { ok: true };
  }

  /* ───────── KPIs ───────── */
  function kpis() {
    const l = L();
    const outstanding = l.members.reduce((s, m) => s + num(m.points), 0);
    const from = addDaysISO(todayISO(), -30);
    const redeemed30 = l.transactions.filter(t => t.type === 'redeem' && t.date >= from).reduce((s, t) => s + Math.abs(num(t.points)), 0);
    const earned30 = l.transactions.filter(t => t.type === 'earn' && t.date >= from).reduce((s, t) => s + num(t.points), 0);
    const topTier = l.tiers.slice().sort((a, b) => b.threshold - a.threshold)[0];
    const topTierCount = topTier ? l.members.filter(m => m.tierId === topTier.id).length : 0;
    return {
      members: l.members.length,
      outstanding,
      liability: outstanding * num(l.settings.pointValue),
      earned30,
      redeemed30,
      topTierCount,
      topTierName: topTier ? topTier.name : '—',
      rewards: l.rewards.filter(r => r.active !== false).length
    };
  }

  /* ───────── render ───────── */
  function kpiStrip() {
    const k = kpis();
    const card = (icon, color, value, label) =>
      '<div class="loy-kpi"><div class="loy-kpi-icon" style="background:' + color + '22;color:' + color + '"><i class="fa-solid ' + icon + '"></i></div>'
      + '<div class="loy-kpi-info"><span class="loy-kpi-value">' + esc(value) + '</span><span class="loy-kpi-label">' + esc(label) + '</span></div></div>';
    return '<div class="loy-kpi-strip">'
      + card('fa-users', '#818cf8', fmt(k.members), 'الأعضاء')
      + card('fa-coins', '#facc15', fmt(k.outstanding), 'نقاط قائمة')
      + card('fa-scale-balanced', '#f87171', fmt(k.liability) + ' ' + currency(), 'التزام النقاط (تقديري)')
      + card('fa-arrow-trend-up', '#34d399', fmt(k.earned30), 'مكتسبة (30ي)')
      + card('fa-gift', '#38bdf8', fmt(k.redeemed30), 'مستبدلة (30ي)')
      + card('fa-crown', '#a855f7', fmt(k.topTierCount), 'في فئة ' + esc(k.topTierName))
      + '</div>';
  }

  function toolbar() {
    const tab = (key, icon, label) =>
      '<button class="loy-tab ' + (activeView === key ? 'active' : '') + '" onclick="loySetView(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="loy-tabs">'
      + tab('overview', 'fa-gauge', 'نظرة عامة')
      + tab('members', 'fa-users', 'الأعضاء')
      + tab('rewards', 'fa-gift', 'المكافآت')
      + tab('tiers', 'fa-layer-group', 'الفئات')
      + tab('ledger', 'fa-list', 'سجل النقاط')
      + tab('vouchers', 'fa-ticket', 'الكوبونات')
      + '</div>';
  }

  function tierBadge(m) {
    const t = L().tiers.find(x => x.id === m.tierId);
    if (!t) return '';
    return '<span class="loy-tier" style="background:' + esc(t.color) + '22;color:' + esc(t.color) + '">' + esc(t.name) + '</span>';
  }

  function membersTable(limit) {
    const l = L();
    let rows = l.members.slice().sort((a, b) => num(b.points) - num(a.points));
    if (limit) rows = rows.slice(0, limit);
    const body = rows.length ? rows.map(m =>
      '<tr><td>' + esc(m.name) + (m.phone ? '<span class="loy-sub">' + esc(m.phone) + '</span>' : '') + '</td>'
      + '<td>' + tierBadge(m) + '</td>'
      + '<td><b>' + fmt(m.points) + '</b></td>'
      + '<td>' + fmt(m.totalEarned) + '</td>'
      + '<td>' + fmt(m.totalRedeemed) + '</td>'
      + '<td>' + memberActions(m) + '</td></tr>'
    ).join('') : '<tr><td colspan="6" class="loy-empty-row">لا يوجد أعضاء بعد</td></tr>';
    return '<table class="loy-table"><thead><tr><th>العضو</th><th>الفئة</th><th>الرصيد</th><th>إجمالي مكتسب</th><th>إجمالي مستبدل</th><th>إجراءات</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function memberActions(m) {
    return '<div class="loy-mini-row">'
      + '<button class="loy-mini" onclick="loyQuickEarn(\'' + m.id + '\')">+ كسب</button>'
      + '<button class="loy-mini" onclick="loyOpenRedeem(\'' + m.id + '\')">استبدال</button>'
      + '</div>';
  }

  function overviewView() {
    const spendForOnePoint = num(L().settings.earnPer);
    return '<div class="loy-panel"><div class="loy-panel-head"><h3><i class="fa-solid fa-star"></i> أعلى الأعضاء</h3>'
      + '<span class="loy-rule">القاعدة: 1 نقطة لكل ' + fmt(spendForOnePoint) + ' ' + currency() + ' · النقطة = ' + fmt(L().settings.pointValue) + ' ' + currency() + ' عند الاستبدال</span></div>'
      + membersTable(8) + '</div>'
      + quickEarnForm();
  }

  function quickEarnForm() {
    const memOpts = L().members.map(m => '<option value="' + esc(m.id) + '">' + esc(m.name) + ' (' + fmt(m.points) + ')</option>').join('');
    return '<div class="loy-panel loy-add"><h3><i class="fa-solid fa-coins"></i> منح نقاط بمبلغ صرف</h3>'
      + '<div class="loy-form-grid">'
      + '<label>العضو<select id="loyE_member">' + memOpts + '</select></label>'
      + '<label>مبلغ الصرف (' + currency() + ')<input type="number" id="loyE_amount" placeholder="مثال 25000" min="0"></label>'
      + '<label>أو نقاط مباشرة<input type="number" id="loyE_points" placeholder="اتركه فارغاً لاستخدام المبلغ" min="0"></label>'
      + '<label class="loy-wide">ملاحظة<input type="text" id="loyE_note" placeholder="اختياري — مرجع الفاتورة/الزيارة"></label>'
      + '</div>'
      + '<button class="loy-btn primary" onclick="loyEarnSubmit()"><i class="fa-solid fa-plus"></i> منح النقاط</button></div>';
  }

  function membersView() {
    return '<div class="loy-panel">' + membersTable(0) + '</div>'
      + '<div class="loy-panel loy-add"><h3><i class="fa-solid fa-user-plus"></i> عضو جديد</h3>'
      + '<div class="loy-form-grid">'
      + '<label>الاسم<input type="text" id="loyM_name" placeholder="اسم العضو"></label>'
      + '<label>الهاتف<input type="text" id="loyM_phone" placeholder="اختياري"></label>'
      + '<label>نقاط افتتاحية<input type="number" id="loyM_points" value="0" min="0"></label>'
      + '</div>'
      + '<button class="loy-btn primary" onclick="loyCreateMember()"><i class="fa-solid fa-user-plus"></i> إضافة العضو</button></div>'
      + quickEarnForm();
  }

  function rewardsView() {
    const l = L();
    const rows = l.rewards.map(r =>
      '<tr class="' + (r.active === false ? 'loy-off' : '') + '"><td>' + esc(r.name) + '</td>'
      + '<td><b>' + fmt(r.costPoints) + '</b> نقطة</td>'
      + '<td>≈ ' + fmt(num(r.costPoints) * num(l.settings.pointValue)) + ' ' + currency() + '</td>'
      + '<td>' + (r.active === false ? '<span class="loy-tier" style="background:#64748b22;color:#94a3b8">معطل</span>' : '<span class="loy-tier" style="background:#34d39922;color:#34d399">فعّال</span>') + '</td>'
      + '<td><button class="loy-mini" onclick="loyToggleReward(\'' + r.id + '\')">' + (r.active === false ? 'تفعيل' : 'تعطيل') + '</button></td></tr>'
    ).join('') || '<tr><td colspan="5" class="loy-empty-row">لا توجد مكافآت</td></tr>';
    return '<div class="loy-panel"><table class="loy-table"><thead><tr><th>المكافأة</th><th>التكلفة</th><th>القيمة التقديرية</th><th>الحالة</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="loy-panel loy-add"><h3><i class="fa-solid fa-gift"></i> مكافأة جديدة</h3>'
      + '<div class="loy-form-grid">'
      + '<label>الاسم<input type="text" id="loyR_name" placeholder="اسم المكافأة"></label>'
      + '<label>التكلفة (نقاط)<input type="number" id="loyR_cost" value="10" min="1"></label>'
      + '</div>'
      + '<button class="loy-btn primary" onclick="loyCreateReward()"><i class="fa-solid fa-plus"></i> إضافة المكافأة</button></div>';
  }

  function tiersView() {
    const l = L();
    const rows = l.tiers.slice().sort((a, b) => a.threshold - b.threshold).map(t => {
      const count = l.members.filter(m => m.tierId === t.id).length;
      return '<tr><td><span class="loy-tier" style="background:' + esc(t.color) + '22;color:' + esc(t.color) + '">' + esc(t.name) + '</span></td>'
        + '<td>' + fmt(t.threshold) + ' نقطة مكتسبة</td>'
        + '<td>×' + esc(t.multiplier) + '</td>'
        + '<td>' + count + ' عضو</td></tr>';
    }).join('');
    return '<div class="loy-panel"><div class="loy-panel-head"><h3><i class="fa-solid fa-layer-group"></i> فئات العضوية</h3>'
      + '<span class="loy-rule">الفئة تُحتسب من إجمالي النقاط المكتسبة. المضاعِف معروض للرجوع ويُطبّق عند المنح بالمبلغ.</span></div>'
      + '<table class="loy-table"><thead><tr><th>الفئة</th><th>عتبة الترقية</th><th>مضاعف الكسب</th><th>الأعضاء</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="loy-panel loy-add"><h3><i class="fa-solid fa-plus"></i> فئة جديدة</h3>'
      + '<div class="loy-form-grid">'
      + '<label>الاسم<input type="text" id="loyT_name" placeholder="اسم الفئة"></label>'
      + '<label>العتبة (نقاط)<input type="number" id="loyT_threshold" value="0" min="0"></label>'
      + '<label>المضاعف<input type="number" id="loyT_mult" value="1" min="1" step="0.05"></label>'
      + '<label>اللون<input type="color" id="loyT_color" value="#818cf8"></label>'
      + '</div>'
      + '<button class="loy-btn primary" onclick="loyCreateTier()"><i class="fa-solid fa-plus"></i> إضافة الفئة</button></div>';
  }

  function ledgerView() {
    const l = L();
    const memOpts = '<option value="all">كل الأعضاء</option>' + l.members.map(m => '<option value="' + esc(m.id) + '"' + (ledgerMemberFilter === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('');
    let tx = l.transactions.slice();
    if (ledgerMemberFilter !== 'all') tx = tx.filter(t => t.memberId === ledgerMemberFilter);
    tx.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    tx = tx.slice(0, 200);
    const rows = tx.length ? tx.map(t => {
      const m = memberById(t.memberId);
      const isEarn = t.type === 'earn';
      const isRedeem = t.type === 'redeem';
      const cls = isEarn ? 'earn' : (isRedeem ? 'redeem' : 'adjust');
      const label = isEarn ? 'كسب' : (isRedeem ? 'استبدال' : 'تعديل');
      return '<tr><td>' + esc(t.date) + '</td><td>' + esc(m ? m.name : '—') + '</td>'
        + '<td><span class="loy-tx ' + cls + '">' + label + '</span></td>'
        + '<td class="' + (num(t.points) < 0 ? 'loy-neg' : 'loy-pos') + '">' + (num(t.points) > 0 ? '+' : '') + fmt(t.points) + '</td>'
        + '<td>' + esc(t.note || '') + (t.source && t.source !== 'manual' ? '<span class="loy-sub">' + esc(t.source) + '</span>' : '') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="loy-empty-row">لا توجد حركات</td></tr>';
    return '<div class="loy-panel"><div class="loy-list-filters"><label>العضو<select onchange="loySetLedgerMember(this.value)">' + memOpts + '</select></label>'
      + '<span class="loy-list-count">' + tx.length + ' حركة</span></div>'
      + '<table class="loy-table"><thead><tr><th>التاريخ</th><th>العضو</th><th>النوع</th><th>النقاط</th><th>التفاصيل</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // redeem inline panel state
  let redeemMemberId = null;
  function redeemPanel() {
    if (!redeemMemberId) return '';
    const m = memberById(redeemMemberId);
    if (!m) return '';
    const l = L();
    const rewardOpts = l.rewards.filter(r => r.active !== false).map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + ' — ' + fmt(r.costPoints) + ' نقطة</option>').join('');
    return '<div class="loy-panel loy-add" id="loyRedeemPanel"><h3><i class="fa-solid fa-gift"></i> استبدال نقاط — ' + esc(m.name) + ' (الرصيد ' + fmt(m.points) + ')</h3>'
      + '<div class="loy-form-grid">'
      + '<label>مكافأة من الكتالوج<select id="loyRd_reward"><option value="">— اختيار يدوي —</option>' + rewardOpts + '</select></label>'
      + '<label>أو نقاط يدوية<input type="number" id="loyRd_points" placeholder="عدد النقاط" min="1"></label>'
      + '<label class="loy-wide">ملاحظة<input type="text" id="loyRd_note" placeholder="اختياري"></label>'
      + '</div>'
      + '<button class="loy-btn primary" onclick="loyRedeemSubmit()"><i class="fa-solid fa-check"></i> تنفيذ الاستبدال</button> '
      + '<button class="loy-btn ghost" onclick="loyCloseRedeem()">إلغاء</button></div>';
  }

  function vouchersView() {
    const l = L();
    let html = '<div class="loy-add" style="margin-bottom:1rem"><h3>إنشاء كوبون خصم</h3><div class="loy-form-grid">'
      + '<label>رمز الكوبون<input id="loyV_code" placeholder="مثال: WELCOME10"></label>'
      + '<label>نوع الخصم<select id="loyV_type"><option value="percent">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></label>'
      + '<label>القيمة<input id="loyV_value" type="number" placeholder="10" step="0.1"></label>'
      + '<label>الحد الأدنى للطلب<input id="loyV_min" type="number" placeholder="0"></label>'
      + '<label>أقصى استخدام<input id="loyV_maxUse" type="number" placeholder="0" value="100"></label>'
      + '<label>تاريخ الانتهاء<input id="loyV_expiry" type="date" value="' + todayISO() + '"></label>'
      + '</div>'
      + '<button class="loy-btn primary" onclick="loyCreateVoucher()">إنشاء كوبون</button></div>';

    if (!l.vouchers.length) return html + '<div class="loy-empty">لا توجد كوبونات خصم.</div>';
    html += '<table class="loy-table"><thead><tr><th>الكود</th><th>النوع</th><th>القيمة</th><th>الحد الأدنى</th><th>استخدام</th><th>تاريخ الانتهاء</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>';
    l.vouchers.forEach(function (v) {
      const expired = v.expiryDate && v.expiryDate < todayISO();
      const maxed = v.maxUses > 0 && v.useCount >= v.maxUses;
      const isActive = v.active !== false && !expired && !maxed;
      html += '<tr><td><strong>' + esc(v.code) + '</strong></td>'
        + '<td>' + (v.type === 'percent' ? '%' : 'ثابت') + '</td>'
        + '<td>' + (v.type === 'percent' ? num(v.value) + '%' : fmt(num(v.value))) + '</td>'
        + '<td>' + fmt(num(v.minOrder)) + '</td>'
        + '<td>' + (v.useCount || 0) + '/' + (v.maxUses || '∞') + '</td>'
        + '<td>' + (v.expiryDate || '') + '</td>'
        + '<td><span class="loy-badge" style="background:' + (isActive ? '#166534' : '#7f1d1d') + ';color:' + (isActive ? '#86efac' : '#fca5a5') + '">' + (isActive ? 'نشط' : 'منتهي') + '</span></td>'
        + '<td><button class="loy-btn sm ghost" onclick="loyToggleVoucher(\'' + v.id + '\')">' + (v.active !== false ? 'إيقاف' : 'تفعيل') + '</button></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function render() {
    ensureData();
    const body = document.getElementById('loyaltyBody');
    if (!body) return;
    let content = '';
    if (activeView === 'members') content = membersView();
    else if (activeView === 'rewards') content = rewardsView();
    else if (activeView === 'tiers') content = tiersView();
    else if (activeView === 'ledger') content = ledgerView();
    else if (activeView === 'vouchers') content = vouchersView();
    else content = overviewView();
    body.innerHTML = kpiStrip() + toolbar() + '<div class="loy-content">' + redeemPanel() + content + '</div>';
  }

  /* ───────── actions (exposed) ───────── */
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  window.loySetView = function (v) { activeView = v; redeemMemberId = null; render(); };
  window.loySetLedgerMember = function (v) { ledgerMemberFilter = v; render(); };

  window.loyCreateMember = function () {
    const name = val('loyM_name');
    if (!name) { toast('أدخل اسم العضو', 'warning'); return; }
    const l = L();
    const m = stamp({ id: uid('mem'), name, phone: val('loyM_phone'), points: 0, totalEarned: 0, totalRedeemed: 0, joinedAt: todayISO(), createdAt: new Date().toISOString() });
    l.members.push(m);
    const opening = Math.max(0, Math.round(num(val('loyM_points'))));
    if (opening) earn(m.id, opening, 'نقاط افتتاحية', 'manual');
    recomputeTiers();
    save(); render();
    toast('تمت إضافة العضو ✅', 'success');
  };

  window.loyEarnSubmit = function () {
    const memberId = val('loyE_member');
    if (!memberId) { toast('اختر عضواً', 'warning'); return; }
    const m = memberById(memberId);
    if (!m) { toast('العضو غير موجود', 'danger'); return; }
    let points = Math.round(num(val('loyE_points')));
    let note = val('loyE_note');
    const amount = num(val('loyE_amount'));
    const l = L();
    if (!points && amount > 0) {
      const t = l.tiers.find(x => x.id === m.tierId);
      const mult = t ? num(t.multiplier) || 1 : 1;
      points = Math.floor((amount / num(l.settings.earnPer)) * mult);
      if (!note) note = 'صرف ' + fmt(amount) + ' ' + currency() + ' (×' + mult + ')';
    }
    if (!points) { toast('أدخل مبلغ صرف أو عدد نقاط', 'warning'); return; }
    earn(memberId, points, note, 'manual');
    save(); render();
    toast('تم منح ' + fmt(points) + ' نقطة ✅', 'success');
  };

  window.loyQuickEarn = function (memberId) {
    activeView = 'overview';
    render();
    const sel = document.getElementById('loyE_member');
    if (sel) sel.value = memberId;
    const amt = document.getElementById('loyE_amount');
    if (amt) amt.focus();
    toast('أدخل مبلغ الصرف ثم «منح النقاط»', 'info');
  };

  window.loyOpenRedeem = function (memberId) { redeemMemberId = memberId; render(); const p = document.getElementById('loyRedeemPanel'); if (p) p.scrollIntoView({ block: 'center' }); };
  window.loyCloseRedeem = function () { redeemMemberId = null; render(); };

  window.loyRedeemSubmit = function () {
    if (!redeemMemberId) return;
    const l = L();
    let points = Math.round(num(val('loyRd_points')));
    let note = val('loyRd_note');
    const rewardId = val('loyRd_reward');
    if (rewardId) {
      const r = l.rewards.find(x => x.id === rewardId);
      if (r) { points = num(r.costPoints); if (!note) note = 'مكافأة: ' + r.name; }
    }
    if (!points) { toast('اختر مكافأة أو أدخل عدد نقاط', 'warning'); return; }
    const res = redeem(redeemMemberId, points, note, rewardId ? 'reward' : 'manual');
    if (!res.ok) {
      toast(res.reason === 'insufficient' ? 'رصيد النقاط غير كافٍ' : 'تعذّر الاستبدال', 'danger');
      return;
    }
    redeemMemberId = null;
    save(); render();
    toast('تم استبدال ' + fmt(points) + ' نقطة 🎁', 'success');
  };

  window.loyCreateReward = function () {
    const name = val('loyR_name');
    if (!name) { toast('أدخل اسم المكافأة', 'warning'); return; }
    const cost = Math.max(1, Math.round(num(val('loyR_cost'))));
    L().rewards.push(stamp({ id: uid('rwd'), name, costPoints: cost, active: true, createdAt: new Date().toISOString() }));
    save(); render();
    toast('تمت إضافة المكافأة ✅', 'success');
  };
  window.loyToggleReward = function (id) {
    const r = L().rewards.find(x => x.id === id);
    if (!r) return;
    r.active = r.active === false;
    save(); render();
  };

  window.loyCreateVoucher = function () {
    const code = val('loyV_code');
    if (!code) { toast('أدخل رمز الكوبون', 'warning'); return; }
    const l = L();
    if (l.vouchers.some(function (v) { return v.code === code; })) { toast('الكود موجود مسبقاً', 'error'); return; }
    const type = document.getElementById('loyV_type');
    const value = document.getElementById('loyV_value');
    const min = document.getElementById('loyV_min');
    const maxUse = document.getElementById('loyV_maxUse');
    const expiry = document.getElementById('loyV_expiry');
    l.vouchers.push(stamp({
      id: uid('vch'),
      code: code,
      type: type ? type.value : 'percent',
      value: Number(value ? value.value : 10),
      minOrder: Number(min ? min.value : 0),
      maxUses: Number(maxUse ? maxUse.value : 100),
      expiryDate: expiry ? expiry.value : '',
      useCount: 0,
      active: true,
      createdAt: new Date().toISOString()
    }));
    save(); toast('تم إنشاء الكوبون'); render();
  };

  window.loyToggleVoucher = function (id) {
    const l = L();
    const v = l.vouchers.find(function (x) { return x.id === id; });
    if (v) { v.active = !(v.active !== false); save(); render(); }
  };

  window.loyCreateTier = function () {
    const name = val('loyT_name');
    if (!name) { toast('أدخل اسم الفئة', 'warning'); return; }
    L().tiers.push(stamp({ id: uid('tier'), name, threshold: Math.max(0, Math.round(num(val('loyT_threshold')))), multiplier: Math.max(1, num(val('loyT_mult')) || 1), color: val('loyT_color') || '#818cf8', createdAt: new Date().toISOString() }));
    recomputeTiers();
    save(); render();
    toast('تمت إضافة الفئة ✅', 'success');
  };

  /* ───────── navigation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('loyalty');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageLoyalty');
    const nav = document.getElementById('navLoyalty');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('loyalty'); } catch (_) {} }
    window.currentPage = 'loyalty';
    render();
    return !!pg;
  }

  function wireSwitch() {
    if (window.__loyaltyWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'loyalty') {
        try { if (activatePage()) return; } catch (e) { console.warn('Loyalty render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__loyaltyWrapped = true;
  }

  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_loyalty_today) return;
      JarvisBrain.tools.report_loyalty_today = {
        desc_en: 'Loyalty program summary: members, outstanding points, estimated liability, earn/redeem (30d), top tier.',
        risk: 'safe',
        params: {},
        run: function () {
          const k = kpis();
          return {
            kpis: k,
            topMembers: L().members.slice().sort((a, b) => num(b.points) - num(a.points)).slice(0, 5)
              .map(m => ({ name: m.name, points: num(m.points), tier: m.tierName }))
          };
        }
      };
    } catch (_) {}
  }

  function init() {
    ensureData();
    wireSwitch();
    registerJarvis();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      wireSwitch();
      registerJarvis();
      if (window.__loyaltyWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonLoyalty = {
    ensureData,
    render,
    kpis,
    earn,
    redeem,
    report: function () { return JarvisBrain?.tools?.report_loyalty_today?.run?.() || kpis(); },
    open: function () { try { window.switchPage('loyalty'); } catch (_) {} }
  };
})();
