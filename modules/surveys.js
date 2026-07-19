/**
 * OCTAGON ERP — Surveys & Feedback (الاستبيانات والتقييمات).
 *
 * Collect structured feedback from customers and employees: CSAT (rating), NPS
 * (0–10 net promoter), and custom multi-question surveys. Includes a lightweight
 * question builder, an inline respond experience, and automatic results analytics
 * (averages, NPS score, choice distributions, text responses).
 *
 * ADD-ONLY. Data lives in omni.surveys = { surveys, responses, settings }.
 * No confirm()/prompt() — inline forms only (headless-safe).
 */
(function () {
  'use strict';

  let activeView = 'overview';   // overview | surveys | builder | respond | results
  let currentSurveyId = null;    // for respond / results / builder(edit)
  let builderDraft = null;       // { id?, title, type, audience, questions:[] }
  let listStatusFilter = 'all';

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
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'svy'); } catch (_) {} }
    return (prefix || 'svy') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    return { companyId: co.id || org.activeCompanyId || '', companyName: co.name || org.name || '' };
  }
  function stamp(rec) {
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.surveys' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; }
    return rec;
  }

  /* ───────── model ───────── */
  const SURVEY_TYPES = [
    { key: 'csat', label: 'رضا العملاء (CSAT)', icon: 'fa-face-smile' },
    { key: 'nps', label: 'صافي الترويج (NPS)', icon: 'fa-bullhorn' },
    { key: 'employee', label: 'استبيان موظفين', icon: 'fa-people-group' },
    { key: 'custom', label: 'نموذج مخصّص', icon: 'fa-list-check' }
  ];
  function typeMeta(k) { return SURVEY_TYPES.find(t => t.key === k) || SURVEY_TYPES[SURVEY_TYPES.length - 1]; }
  const STATUSES = [
    { key: 'draft', label: 'مسودة', cls: 'draft' },
    { key: 'active', label: 'نشط', cls: 'active' },
    { key: 'closed', label: 'مغلق', cls: 'closed' }
  ];
  function statusMeta(k) { return STATUSES.find(s => s.key === k) || STATUSES[0]; }

  function templateQuestions(type) {
    if (type === 'csat') return [{ id: uid('q'), text: 'ما مدى رضاك عن الخدمة؟', kind: 'rating' }];
    if (type === 'nps') return [{ id: uid('q'), text: 'ما احتمال أن توصي بنا لصديق؟ (0–10)', kind: 'nps' }];
    if (type === 'employee') return [
      { id: uid('q'), text: 'ما مدى رضاك عن بيئة العمل؟', kind: 'rating' },
      { id: uid('q'), text: 'ما الذي يمكن تحسينه؟', kind: 'text' }
    ];
    return [{ id: uid('q'), text: 'سؤالك هنا', kind: 'rating' }];
  }

  function ensureData() {
    const o = O();
    if (!o.surveys || typeof o.surveys !== 'object') o.surveys = {};
    const s = o.surveys;
    if (!Array.isArray(s.surveys)) s.surveys = [];
    if (!Array.isArray(s.responses)) s.responses = [];
    if (!s.settings || typeof s.settings !== 'object') s.settings = {};

    if (!s.surveys.length && !s._seeded) {
      s._seeded = true;
      const sv1 = stamp({ id: uid('svy'), title: 'رضا العملاء عن الخدمة', type: 'csat', audience: 'customers', questions: templateQuestions('csat'), status: 'active', createdAt: new Date().toISOString(), createdBy: 'system' });
      const sv2 = stamp({ id: uid('svy'), title: 'مؤشر الترويج NPS', type: 'nps', audience: 'customers', questions: templateQuestions('nps'), status: 'active', createdAt: new Date().toISOString(), createdBy: 'system' });
      s.surveys.push(sv1, sv2);
      // seed a few responses
      const q1 = sv1.questions[0].id, q2 = sv2.questions[0].id;
      [5, 4, 5, 3].forEach((v, i) => s.responses.push(stamp({ id: uid('rsp'), surveyId: sv1.id, respondent: 'عميل ' + (i + 1), answers: [{ questionId: q1, value: v }], submittedAt: new Date().toISOString() })));
      [10, 9, 7, 6, 8].forEach((v, i) => s.responses.push(stamp({ id: uid('rsp'), surveyId: sv2.id, respondent: 'عميل ' + (i + 1), answers: [{ questionId: q2, value: v }], submittedAt: new Date().toISOString() })));
    }
  }
  function S() { ensureData(); return O().surveys; }
  function surveyById(id) { return S().surveys.find(x => x.id === id); }
  function responsesFor(id) { return S().responses.filter(r => r.surveyId === id); }

  /* ───────── analytics ───────── */
  function npsScore(values) {
    if (!values.length) return 0;
    const prom = values.filter(v => v >= 9).length;
    const det = values.filter(v => v <= 6).length;
    return Math.round(((prom - det) / values.length) * 100);
  }
  function avg(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

  function surveyScore(sv) {
    // returns a single headline metric per survey type
    const resp = responsesFor(sv.id);
    if (!resp.length) return null;
    if (sv.type === 'nps') {
      const q = sv.questions.find(q => q.kind === 'nps') || sv.questions[0];
      const vals = resp.map(r => num((r.answers.find(a => a.questionId === q.id) || {}).value)).filter(v => !isNaN(v));
      return { kind: 'nps', value: npsScore(vals), n: vals.length };
    }
    // csat / employee / custom → average of first rating question, scaled to %
    const q = sv.questions.find(q => q.kind === 'rating');
    if (q) {
      const vals = resp.map(r => num((r.answers.find(a => a.questionId === q.id) || {}).value)).filter(v => v > 0);
      return { kind: 'csat', value: Math.round((avg(vals) / 5) * 100), avgRaw: Math.round(avg(vals) * 10) / 10, n: vals.length };
    }
    return { kind: 'count', value: resp.length, n: resp.length };
  }

  /* ───────── KPIs ───────── */
  function kpis() {
    const s = S();
    const active = s.surveys.filter(x => x.status === 'active').length;
    const totalResp = s.responses.length;
    // overall CSAT across all rating answers
    const ratingVals = [];
    const npsVals = [];
    s.surveys.forEach(sv => {
      const rq = sv.questions.filter(q => q.kind === 'rating').map(q => q.id);
      const nq = sv.questions.filter(q => q.kind === 'nps').map(q => q.id);
      responsesFor(sv.id).forEach(r => r.answers.forEach(a => {
        if (rq.includes(a.questionId) && num(a.value) > 0) ratingVals.push(num(a.value));
        if (nq.includes(a.questionId)) npsVals.push(num(a.value));
      }));
    });
    const csat = ratingVals.length ? Math.round((avg(ratingVals) / 5) * 100) : 0;
    const nps = npsVals.length ? npsScore(npsVals) : 0;
    return { active, total: s.surveys.length, responses: totalResp, csat, nps, hasNps: npsVals.length > 0 };
  }

  /* ───────── render ───────── */
  function kpiStrip() {
    const k = kpis();
    const card = (icon, color, value, label) =>
      '<div class="svy-kpi"><div class="svy-kpi-icon" style="background:' + color + '22;color:' + color + '"><i class="fa-solid ' + icon + '"></i></div>'
      + '<div class="svy-kpi-info"><span class="svy-kpi-value">' + esc(value) + '</span><span class="svy-kpi-label">' + esc(label) + '</span></div></div>';
    return '<div class="svy-kpi-strip">'
      + card('fa-square-poll-vertical', '#818cf8', k.active, 'استبيانات نشطة')
      + card('fa-layer-group', '#38bdf8', k.total, 'إجمالي الاستبيانات')
      + card('fa-inbox', '#a855f7', fmt(k.responses), 'إجمالي الردود')
      + card('fa-face-smile', '#34d399', k.csat + '%', 'رضا العملاء CSAT')
      + card('fa-bullhorn', (k.nps >= 0 ? '#facc15' : '#f87171'), (k.nps > 0 ? '+' : '') + k.nps, 'مؤشر NPS')
      + '</div>';
  }

  function toolbar() {
    const tab = (key, icon, label) =>
      '<button class="svy-tab ' + (activeView === key ? 'active' : '') + '" onclick="svySetView(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="svy-tabs">'
      + tab('overview', 'fa-gauge', 'نظرة عامة')
      + tab('surveys', 'fa-square-poll-vertical', 'الاستبيانات')
      + '<button class="svy-tab svy-tab-cta" onclick="svyNewSurvey()"><i class="fa-solid fa-plus"></i> استبيان جديد</button>'
      + '</div>';
  }

  function surveyCard(sv) {
    const tm = typeMeta(sv.type);
    const sm = statusMeta(sv.status);
    const sc = surveyScore(sv);
    const n = responsesFor(sv.id).length;
    let scoreHtml = '<span class="svy-score-na">لا ردود بعد</span>';
    if (sc) {
      if (sc.kind === 'nps') scoreHtml = '<span class="svy-score ' + (sc.value >= 0 ? 'good' : 'bad') + '">NPS ' + (sc.value > 0 ? '+' : '') + sc.value + '</span>';
      else if (sc.kind === 'csat') scoreHtml = '<span class="svy-score good">' + sc.value + '% رضا</span>';
      else scoreHtml = '<span class="svy-score">' + sc.value + ' ردّ</span>';
    }
    let acts = '';
    if (sv.status === 'draft') acts += '<button class="svy-mini" onclick="svyActivate(\'' + sv.id + '\')">تفعيل</button>';
    if (sv.status === 'active') {
      acts += '<button class="svy-mini primary" onclick="svyRespond(\'' + sv.id + '\')">إضافة ردّ</button>';
      acts += '<button class="svy-mini" onclick="svyClose(\'' + sv.id + '\')">إغلاق</button>';
    }
    acts += '<button class="svy-mini" onclick="svyResults(\'' + sv.id + '\')">النتائج (' + n + ')</button>';
    if (sv.status === 'draft') acts += '<button class="svy-mini" onclick="svyEdit(\'' + sv.id + '\')">تحرير</button>';
    return '<div class="svy-card">'
      + '<div class="svy-card-head"><span class="svy-type"><i class="fa-solid ' + tm.icon + '"></i> ' + esc(tm.label) + '</span><span class="svy-badge ' + sm.cls + '">' + esc(sm.label) + '</span></div>'
      + '<h3 class="svy-card-title">' + esc(sv.title) + '</h3>'
      + '<div class="svy-card-meta"><span>' + sv.questions.length + ' سؤال · ' + n + ' ردّ</span>' + scoreHtml + '</div>'
      + '<div class="svy-mini-row">' + acts + '</div>'
      + '</div>';
  }

  function overviewView() {
    const s = S();
    const active = s.surveys.filter(x => x.status === 'active');
    return '<div class="svy-panel"><div class="svy-panel-head"><h3><i class="fa-solid fa-square-poll-vertical"></i> الاستبيانات النشطة</h3>'
      + '<button class="svy-btn" onclick="svySetView(\'surveys\')">كل الاستبيانات</button></div>'
      + '<div class="svy-grid">' + (active.length ? active.map(surveyCard).join('') : '<div class="svy-empty">لا استبيانات نشطة — أنشئ واحداً للبدء</div>') + '</div></div>';
  }

  function surveysView() {
    const s = S();
    const statusOpts = '<option value="all">كل الحالات</option>' + STATUSES.map(x => '<option value="' + x.key + '"' + (listStatusFilter === x.key ? ' selected' : '') + '>' + x.label + '</option>').join('');
    let rows = s.surveys.slice();
    if (listStatusFilter !== 'all') rows = rows.filter(x => x.status === listStatusFilter);
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return '<div class="svy-panel"><div class="svy-list-filters"><label>الحالة<select onchange="svySetStatusFilter(this.value)">' + statusOpts + '</select></label>'
      + '<span class="svy-list-count">' + rows.length + ' استبيان</span></div>'
      + '<div class="svy-grid">' + (rows.length ? rows.map(surveyCard).join('') : '<div class="svy-empty">لا نتائج</div>') + '</div></div>';
  }

  /* ───────── builder ───────── */
  function builderView() {
    const d = builderDraft;
    const typeOpts = SURVEY_TYPES.map(t => '<option value="' + t.key + '"' + (d.type === t.key ? ' selected' : '') + '>' + t.label + '</option>').join('');
    const qHtml = d.questions.map((q, i) => {
      const kindOpts = [['rating', 'تقييم (1–5)'], ['nps', 'NPS (0–10)'], ['text', 'نص حر'], ['choice', 'اختيار من متعدد']]
        .map(([k, l]) => '<option value="' + k + '"' + (q.kind === k ? ' selected' : '') + '>' + l + '</option>').join('');
      return '<div class="svy-q-row"><span class="svy-q-num">' + (i + 1) + '</span>'
        + '<input type="text" class="svy-q-text" value="' + esc(q.text) + '" oninput="svyEditQ(' + i + ',\'text\',this.value)" placeholder="نص السؤال">'
        + '<select class="svy-q-kind" onchange="svyEditQ(' + i + ',\'kind\',this.value)">' + kindOpts + '</select>'
        + (q.kind === 'choice' ? '<input type="text" class="svy-q-opts" value="' + esc((q.options || []).join(', ')) + '" oninput="svyEditQ(' + i + ',\'options\',this.value)" placeholder="الخيارات، مفصولة بفواصل">' : '')
        + '<button class="svy-mini danger" onclick="svyRemoveQ(' + i + ')">×</button></div>';
    }).join('');
    return '<div class="svy-art-top"><button class="svy-btn" onclick="svyCancelBuilder()"><i class="fa-solid fa-arrow-right"></i> رجوع</button>'
      + '<span class="svy-builder-title">' + (d.id ? 'تحرير استبيان' : 'استبيان جديد') + '</span></div>'
      + '<div class="svy-panel">'
      + '<div class="svy-form-grid">'
      + '<label class="svy-wide">عنوان الاستبيان<input type="text" id="svyB_title" value="' + esc(d.title) + '" oninput="svyDraftField(\'title\',this.value)" placeholder="عنوان الاستبيان"></label>'
      + '<label>النوع<select id="svyB_type" onchange="svyChangeType(this.value)">' + typeOpts + '</select></label>'
      + '<label>الجمهور<input type="text" id="svyB_aud" value="' + esc(d.audience) + '" oninput="svyDraftField(\'audience\',this.value)" placeholder="عملاء/موظفون"></label>'
      + '</div>'
      + '<div class="svy-q-head"><h3><i class="fa-solid fa-list-ol"></i> الأسئلة</h3><button class="svy-btn" onclick="svyAddQ()"><i class="fa-solid fa-plus"></i> سؤال</button></div>'
      + '<div class="svy-q-list">' + (qHtml || '<div class="svy-empty">أضف سؤالاً واحداً على الأقل</div>') + '</div>'
      + '<div class="svy-builder-actions"><button class="svy-btn primary" onclick="svySaveBuilder(false)"><i class="fa-solid fa-floppy-disk"></i> حفظ كمسودة</button> '
      + '<button class="svy-btn accent" onclick="svySaveBuilder(true)"><i class="fa-solid fa-circle-play"></i> حفظ وتفعيل</button></div>'
      + '</div>';
  }

  /* ───────── respond ───────── */
  function respondView() {
    const sv = surveyById(currentSurveyId);
    if (!sv) { activeView = 'surveys'; return surveysView(); }
    const q = sv.questions.map((q, i) => {
      let input = '';
      if (q.kind === 'rating') {
        input = '<div class="svy-rate" id="svy_in_' + q.id + '" data-val="0">'
          + [1, 2, 3, 4, 5].map(n => '<span class="svy-star" onclick="svyPickRate(\'' + q.id + '\',' + n + ')">★</span>').join('') + '</div>';
      } else if (q.kind === 'nps') {
        input = '<div class="svy-nps" id="svy_in_' + q.id + '" data-val="-1">'
          + Array.from({ length: 11 }, (_, n) => '<span class="svy-nps-btn" onclick="svyPickNps(\'' + q.id + '\',' + n + ')">' + n + '</span>').join('') + '</div>';
      } else if (q.kind === 'choice') {
        input = '<div class="svy-choices" id="svy_in_' + q.id + '" data-val="">'
          + (q.options || []).map(o => '<button type="button" class="svy-choice" onclick="svyPickChoice(\'' + q.id + '\',this)">' + esc(o) + '</button>').join('') + '</div>';
      } else {
        input = '<input type="text" class="svy-text-in" id="svy_in_' + q.id + '" placeholder="إجابتك">';
      }
      return '<div class="svy-resp-q"><div class="svy-resp-qtext">' + (i + 1) + '. ' + esc(q.text) + '</div>' + input + '</div>';
    }).join('');
    return '<div class="svy-art-top"><button class="svy-btn" onclick="svySetView(\'surveys\')"><i class="fa-solid fa-arrow-right"></i> رجوع</button>'
      + '<span class="svy-builder-title">' + esc(sv.title) + '</span></div>'
      + '<div class="svy-panel svy-respond">'
      + '<label class="svy-resp-name">اسم المُجيب (اختياري)<input type="text" id="svyR_name" placeholder="مجهول"></label>'
      + q
      + '<div class="svy-builder-actions"><button class="svy-btn accent" onclick="svySubmitResponse()"><i class="fa-solid fa-paper-plane"></i> إرسال الردّ</button></div>'
      + '</div>';
  }

  /* ───────── results ───────── */
  function resultsView() {
    const sv = surveyById(currentSurveyId);
    if (!sv) { activeView = 'surveys'; return surveysView(); }
    const resp = responsesFor(sv.id);
    const sc = surveyScore(sv);
    let headline = '';
    if (sc) {
      if (sc.kind === 'nps') headline = '<div class="svy-headline ' + (sc.value >= 0 ? 'good' : 'bad') + '"><span class="svy-headline-val">' + (sc.value > 0 ? '+' : '') + sc.value + '</span><span class="svy-headline-lbl">مؤشر NPS · ' + sc.n + ' ردّ</span></div>';
      else if (sc.kind === 'csat') headline = '<div class="svy-headline good"><span class="svy-headline-val">' + sc.value + '%</span><span class="svy-headline-lbl">رضا (متوسط ' + sc.avgRaw + '/5) · ' + sc.n + ' ردّ</span></div>';
    }
    const qResults = sv.questions.map(q => {
      const vals = resp.map(r => (r.answers.find(a => a.questionId === q.id) || {}).value).filter(v => v !== undefined && v !== '');
      let body = '';
      if (q.kind === 'rating') {
        const nums = vals.map(num);
        body = '<div class="svy-r-avg">المتوسط: <b>' + (Math.round(avg(nums) * 10) / 10) + '</b> / 5</div>' + distBar([1, 2, 3, 4, 5].map(n => ({ label: n + '★', count: nums.filter(v => v === n).length })), nums.length);
      } else if (q.kind === 'nps') {
        const nums = vals.map(num);
        const prom = nums.filter(v => v >= 9).length, pas = nums.filter(v => v >= 7 && v <= 8).length, det = nums.filter(v => v <= 6).length;
        body = '<div class="svy-r-avg">NPS: <b>' + (nums.length ? (npsScore(nums) > 0 ? '+' : '') + npsScore(nums) : '—') + '</b></div>'
          + distBar([{ label: 'مروّجون', count: prom }, { label: 'محايدون', count: pas }, { label: 'منتقدون', count: det }], nums.length);
      } else if (q.kind === 'choice') {
        const opts = q.options || [];
        body = distBar(opts.map(o => ({ label: o, count: vals.filter(v => v === o).length })), vals.length);
      } else {
        body = '<div class="svy-text-list">' + (vals.length ? vals.map(v => '<div class="svy-text-item">"' + esc(v) + '"</div>').join('') : '<div class="svy-empty">لا إجابات نصية</div>') + '</div>';
      }
      return '<div class="svy-r-q"><div class="svy-r-qtext">' + esc(q.text) + '</div>' + body + '</div>';
    }).join('');
    return '<div class="svy-art-top"><button class="svy-btn" onclick="svySetView(\'surveys\')"><i class="fa-solid fa-arrow-right"></i> رجوع</button>'
      + '<span class="svy-builder-title">نتائج: ' + esc(sv.title) + '</span>'
      + (sv.status === 'active' ? '<button class="svy-btn primary" onclick="svyRespond(\'' + sv.id + '\')"><i class="fa-solid fa-plus"></i> إضافة ردّ</button>' : '') + '</div>'
      + (headline ? '<div class="svy-panel">' + headline + '</div>' : '')
      + '<div class="svy-panel">' + (resp.length ? qResults : '<div class="svy-empty">لا ردود بعد على هذا الاستبيان</div>') + '</div>';
  }
  function distBar(items, total) {
    return '<div class="svy-dist">' + items.map(it => {
      const pct = total ? Math.round((it.count / total) * 100) : 0;
      return '<div class="svy-dist-row"><span class="svy-dist-lbl">' + esc(it.label) + '</span>'
        + '<span class="svy-dist-bar"><span style="width:' + pct + '%"></span></span>'
        + '<span class="svy-dist-val">' + it.count + ' (' + pct + '%)</span></div>';
    }).join('') + '</div>';
  }

  function render() {
    ensureData();
    const body = document.getElementById('surveysBody');
    if (!body) return;
    let content;
    if (activeView === 'builder') content = builderView();
    else if (activeView === 'respond') content = respondView();
    else if (activeView === 'results') content = resultsView();
    else if (activeView === 'surveys') content = surveysView();
    else content = overviewView();
    const showChrome = !['builder', 'respond', 'results'].includes(activeView);
    body.innerHTML = kpiStrip() + (showChrome ? toolbar() : '') + '<div class="svy-content">' + content + '</div>';
  }

  /* ───────── actions ───────── */
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  window.svySetView = function (v) { activeView = v; render(); };
  window.svySetStatusFilter = function (v) { listStatusFilter = v; render(); };

  window.svyNewSurvey = function () {
    builderDraft = { title: '', type: 'csat', audience: 'عملاء', questions: templateQuestions('csat') };
    activeView = 'builder'; render();
  };
  window.svyEdit = function (id) {
    const sv = surveyById(id); if (!sv) return;
    builderDraft = { id: sv.id, title: sv.title, type: sv.type, audience: sv.audience, questions: JSON.parse(JSON.stringify(sv.questions)) };
    activeView = 'builder'; render();
  };
  window.svyCancelBuilder = function () { builderDraft = null; activeView = 'surveys'; render(); };
  window.svyDraftField = function (f, v) { if (builderDraft) builderDraft[f] = v; };
  window.svyChangeType = function (t) {
    if (!builderDraft) return;
    builderDraft.type = t;
    // if user hasn't customized questions, swap to template for the new type
    builderDraft.questions = templateQuestions(t);
    render();
  };
  window.svyAddQ = function () { if (builderDraft) { builderDraft.questions.push({ id: uid('q'), text: '', kind: 'rating' }); render(); } };
  window.svyRemoveQ = function (i) { if (builderDraft) { builderDraft.questions.splice(i, 1); render(); } };
  window.svyEditQ = function (i, field, v) {
    if (!builderDraft || !builderDraft.questions[i]) return;
    if (field === 'options') builderDraft.questions[i].options = v.split(',').map(s => s.trim()).filter(Boolean);
    else builderDraft.questions[i][field] = v;
    // re-render only when kind changes (to show/hide options input)
    if (field === 'kind') render();
  };
  window.svySaveBuilder = function (activate) {
    const d = builderDraft; if (!d) return;
    // pull latest title/audience from inputs (in case oninput missed)
    d.title = val('svyB_title') || d.title;
    if (!d.title) { toast('أدخل عنوان الاستبيان', 'warning'); return; }
    if (!d.questions.length) { toast('أضف سؤالاً واحداً على الأقل', 'warning'); return; }
    const s = S();
    if (d.id) {
      const sv = surveyById(d.id);
      if (sv) { sv.title = d.title; sv.type = d.type; sv.audience = d.audience; sv.questions = d.questions; if (activate) sv.status = 'active'; sv.updatedAt = new Date().toISOString(); }
    } else {
      s.surveys.push(stamp({ id: uid('svy'), title: d.title, type: d.type, audience: d.audience, questions: d.questions, status: activate ? 'active' : 'draft', createdAt: new Date().toISOString(), createdBy: currentUserName() }));
    }
    builderDraft = null;
    activeView = 'surveys';
    save(); render();
    toast(activate ? 'تم حفظ الاستبيان وتفعيله ✅' : 'تم حفظ المسودة', 'success');
  };

  window.svyActivate = function (id) { const sv = surveyById(id); if (sv) { sv.status = 'active'; save(); render(); toast('تم تفعيل الاستبيان 📣', 'success'); } };
  window.svyClose = function (id) { const sv = surveyById(id); if (sv) { sv.status = 'closed'; save(); render(); toast('تم إغلاق الاستبيان', 'warning'); } };

  window.svyRespond = function (id) { currentSurveyId = id; activeView = 'respond'; render(); };
  window.svyResults = function (id) { currentSurveyId = id; activeView = 'results'; render(); };

  // respond input pickers
  window.svyPickRate = function (qid, n) {
    const box = document.getElementById('svy_in_' + qid); if (!box) return;
    box.dataset.val = n;
    [...box.querySelectorAll('.svy-star')].forEach((el, i) => el.classList.toggle('on', i < n));
  };
  window.svyPickNps = function (qid, n) {
    const box = document.getElementById('svy_in_' + qid); if (!box) return;
    box.dataset.val = n;
    [...box.querySelectorAll('.svy-nps-btn')].forEach((el, i) => el.classList.toggle('on', i === n));
  };
  window.svyPickChoice = function (qid, btn) {
    const box = document.getElementById('svy_in_' + qid); if (!box) return;
    box.dataset.val = btn.textContent;
    [...box.querySelectorAll('.svy-choice')].forEach(el => el.classList.toggle('on', el === btn));
  };

  window.svySubmitResponse = function () {
    const sv = surveyById(currentSurveyId); if (!sv) return;
    const answers = [];
    let missing = false;
    sv.questions.forEach(q => {
      let v;
      if (q.kind === 'text') v = val('svy_in_' + q.id);
      else { const box = document.getElementById('svy_in_' + q.id); v = box ? box.dataset.val : ''; }
      if (q.kind === 'rating') { v = num(v); if (!v) missing = true; }
      else if (q.kind === 'nps') { v = Number(v); if (isNaN(v) || v < 0) missing = true; }
      else if (q.kind === 'choice') { if (!v) missing = true; }
      answers.push({ questionId: q.id, value: v });
    });
    if (missing) { toast('يرجى الإجابة على كل الأسئلة (عدا النصية)', 'warning'); return; }
    S().responses.push(stamp({ id: uid('rsp'), surveyId: sv.id, respondent: val('svyR_name') || 'مجهول', answers, submittedAt: new Date().toISOString() }));
    save();
    activeView = 'results';
    render();
    toast('تم تسجيل الردّ — شكراً! 🙏', 'success');
  };

  /* ───────── navigation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('surveys');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageSurveys');
    const nav = document.getElementById('navSurveys');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('surveys'); } catch (_) {} }
    window.currentPage = 'surveys';
    render();
    return !!pg;
  }
  function wireSwitch() {
    if (window.__surveysWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'surveys') {
        try { if (activatePage()) return; } catch (e) { console.warn('Surveys render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__surveysWrapped = true;
  }
  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_surveys_today) return;
      JarvisBrain.tools.report_surveys_today = {
        desc_en: 'Surveys & feedback summary: active surveys, total responses, overall CSAT % and NPS score, plus per-survey headline scores.',
        risk: 'safe',
        params: {},
        run: function () {
          return {
            kpis: kpis(),
            surveys: S().surveys.map(sv => ({ title: sv.title, type: sv.type, status: sv.status, responses: responsesFor(sv.id).length, score: surveyScore(sv) }))
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
      if (window.__surveysWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonSurveys = {
    ensureData,
    render,
    kpis,
    report: function () { return JarvisBrain?.tools?.report_surveys_today?.run?.() || kpis(); },
    open: function () { try { window.switchPage('surveys'); } catch (_) {} }
  };
})();
