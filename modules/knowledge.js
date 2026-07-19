/**
 * OCTAGON ERP — Knowledge Base / Wiki (قاعدة المعرفة).
 *
 * A unified knowledge center: categorized articles & guides, instant search,
 * draft → publish workflow, view counts, and helpfulness voting. Serves as the
 * internal staff reference and a customer support knowledge portal — complements
 * the SOP library (procedures) and help manual (app docs).
 *
 * ADD-ONLY. Data lives in omni.knowledge = { categories, articles, settings }.
 * No confirm()/prompt() — inline forms only (headless-safe).
 */
(function () {
  'use strict';

  let activeView = 'overview';   // overview | browse | article | editor
  let openArticleId = null;
  let editId = null;             // article being edited (null = new)
  let searchTerm = '';
  let categoryFilter = 'all';

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
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function todayISO() {
    if (typeof window.todayISO === 'function') { try { return window.todayISO(); } catch (_) {} }
    return new Date().toISOString().slice(0, 10);
  }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'kb'); } catch (_) {} }
    return (prefix || 'kb') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.knowledge' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; }
    return rec;
  }

  /* ───────── data ───────── */
  function ensureData() {
    const o = O();
    if (!o.knowledge || typeof o.knowledge !== 'object') o.knowledge = {};
    const k = o.knowledge;
    if (!Array.isArray(k.categories)) k.categories = [];
    if (!Array.isArray(k.articles)) k.articles = [];
    if (!k.settings || typeof k.settings !== 'object') k.settings = {};

    if (!k.categories.length) {
      [
        { name: 'البدء والإعداد', icon: 'fa-rocket', color: '#34d399' },
        { name: 'الأسئلة الشائعة', icon: 'fa-circle-question', color: '#38bdf8' },
        { name: 'العمليات والتشغيل', icon: 'fa-gears', color: '#fb923c' },
        { name: 'استكشاف الأخطاء', icon: 'fa-screwdriver-wrench', color: '#f87171' }
      ].forEach(c => k.categories.push(stamp({ id: uid('cat'), name: c.name, icon: c.icon, color: c.color, createdAt: new Date().toISOString() })));
    }
    if (!k.articles.length && !k._seeded) {
      k._seeded = true;
      const c = k.categories;
      k.articles.push(stamp({ id: uid('art'), categoryId: c[0].id, title: 'كيف أبدأ استخدام النظام؟', body: 'سجّل الدخول، اختر القسم من الشريط الجانبي، ثم ابدأ بإدخال بياناتك.\nيمكنك التنقّل بين الأقسام بسهولة من القائمة.', tags: 'بدء, دليل', status: 'published', author: 'system', views: 42, helpful: 8, notHelpful: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      k.articles.push(stamp({ id: uid('art'), categoryId: c[1].id, title: 'كيف أنشئ نسخة احتياطية؟', body: 'من الشريط الجانبي اضغط زر «نسخة احتياطية» لتصدير بياناتك، و«استعادة» لاستيرادها.', tags: 'نسخة احتياطية, بيانات', status: 'published', author: 'system', views: 27, helpful: 5, notHelpful: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      k.articles.push(stamp({ id: uid('art'), categoryId: c[3].id, title: 'الصفحة لا تظهر — ماذا أفعل؟', body: 'افتح «فحص صحة النظام» للتأكد من ربط الصفحات، ثم أعد تحميل التطبيق.', tags: 'مشاكل, صفحات', status: 'draft', author: 'system', views: 3, helpful: 0, notHelpful: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    }
  }
  function K() { ensureData(); return O().knowledge; }
  function articleById(id) { return K().articles.find(a => a.id === id); }
  function categoryById(id) { return K().categories.find(c => c.id === id); }

  /* ───────── KPIs ───────── */
  function kpis() {
    const k = K();
    const published = k.articles.filter(a => a.status === 'published').length;
    const drafts = k.articles.filter(a => a.status === 'draft').length;
    const views = k.articles.reduce((s, a) => s + num(a.views), 0);
    const votes = k.articles.reduce((s, a) => s + num(a.helpful) + num(a.notHelpful), 0);
    const helpful = k.articles.reduce((s, a) => s + num(a.helpful), 0);
    const helpfulPct = votes ? Math.round((helpful / votes) * 100) : 0;
    return { total: k.articles.length, published, drafts, categories: k.categories.length, views, helpfulPct };
  }

  /* ───────── render ───────── */
  function kpiStrip() {
    const k = kpis();
    const card = (icon, color, value, label) =>
      '<div class="kb-kpi"><div class="kb-kpi-icon" style="background:' + color + '22;color:' + color + '"><i class="fa-solid ' + icon + '"></i></div>'
      + '<div class="kb-kpi-info"><span class="kb-kpi-value">' + esc(value) + '</span><span class="kb-kpi-label">' + esc(label) + '</span></div></div>';
    return '<div class="kb-kpi-strip">'
      + card('fa-file-lines', '#818cf8', k.total, 'إجمالي المقالات')
      + card('fa-circle-check', '#34d399', k.published, 'منشورة')
      + card('fa-pen', '#94a3b8', k.drafts, 'مسودات')
      + card('fa-folder-tree', '#fb923c', k.categories, 'التصنيفات')
      + card('fa-eye', '#38bdf8', fmt(k.views), 'مرات العرض')
      + card('fa-thumbs-up', '#facc15', k.helpfulPct + '%', 'نسبة الفائدة')
      + '</div>';
  }

  function toolbar() {
    const tab = (key, icon, label) =>
      '<button class="kb-tab ' + (activeView === key ? 'active' : '') + '" onclick="kbSetView(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="kb-tabs">'
      + tab('overview', 'fa-gauge', 'نظرة عامة')
      + tab('browse', 'fa-folder-open', 'تصفّح المقالات')
      + '<button class="kb-tab kb-tab-cta" onclick="kbNewArticle()"><i class="fa-solid fa-plus"></i> مقال جديد</button>'
      + '</div>';
  }

  function articleListItem(a) {
    const cat = categoryById(a.categoryId);
    const stat = a.status === 'published' ? '<span class="kb-badge pub">منشور</span>' : '<span class="kb-badge draft">مسودة</span>';
    return '<div class="kb-art-item" onclick="kbOpen(\'' + a.id + '\')">'
      + '<div class="kb-art-main"><span class="kb-art-title">' + esc(a.title) + '</span>'
      + '<span class="kb-art-meta">' + (cat ? '<i class="fa-solid ' + esc(cat.icon) + '" style="color:' + esc(cat.color) + '"></i> ' + esc(cat.name) + ' · ' : '') + num(a.views) + ' مشاهدة</span></div>'
      + stat + '</div>';
  }

  function overviewView() {
    const k = K();
    const popular = k.articles.filter(a => a.status === 'published').slice().sort((a, b) => num(b.views) - num(a.views)).slice(0, 5);
    const recent = k.articles.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 5);
    const cats = k.categories.map(c => {
      const count = k.articles.filter(a => a.categoryId === c.id).length;
      return '<div class="kb-cat-chip" onclick="kbFilterCategory(\'' + c.id + '\')"><i class="fa-solid ' + esc(c.icon) + '" style="color:' + esc(c.color) + '"></i> ' + esc(c.name) + '<span class="kb-cat-count">' + count + '</span></div>';
    }).join('');
    return '<div class="kb-search-hero">'
      + '<input type="text" id="kbSearchInput" class="kb-search-input" placeholder="🔎 ابحث في قاعدة المعرفة…" value="' + esc(searchTerm) + '" oninput="kbSearchInput(this.value)" onkeydown="if(event.key===\'Enter\')kbDoSearch()">'
      + '<div class="kb-cat-row">' + cats + '</div></div>'
      + '<div class="kb-two-col">'
      + '<div class="kb-panel"><h3><i class="fa-solid fa-fire"></i> الأكثر مشاهدة</h3>' + (popular.length ? popular.map(articleListItem).join('') : '<div class="kb-empty">لا مقالات منشورة</div>') + '</div>'
      + '<div class="kb-panel"><h3><i class="fa-solid fa-clock"></i> أحدث التحديثات</h3>' + (recent.length ? recent.map(articleListItem).join('') : '<div class="kb-empty">لا مقالات</div>') + '</div>'
      + '</div>';
  }

  function browseView() {
    const k = K();
    const catOpts = '<option value="all">كل التصنيفات</option>' + k.categories.map(c => '<option value="' + esc(c.id) + '"' + (categoryFilter === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    let rows = k.articles.slice();
    if (categoryFilter !== 'all') rows = rows.filter(a => a.categoryId === categoryFilter);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      rows = rows.filter(a => (a.title + ' ' + a.body + ' ' + (a.tags || '')).toLowerCase().includes(t));
    }
    rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return '<div class="kb-panel"><div class="kb-browse-filters">'
      + '<input type="text" id="kbSearchInput" class="kb-search-input sm" placeholder="🔎 بحث…" value="' + esc(searchTerm) + '" oninput="kbSearchInput(this.value)">'
      + '<select onchange="kbFilterCategory(this.value)">' + catOpts + '</select>'
      + '<span class="kb-list-count">' + rows.length + ' مقال</span></div>'
      + '<div class="kb-art-list">' + (rows.length ? rows.map(articleListItem).join('') : '<div class="kb-empty">لا نتائج مطابقة</div>') + '</div></div>';
  }

  function articleView() {
    const a = articleById(openArticleId);
    if (!a) { activeView = 'browse'; return browseView(); }
    const cat = categoryById(a.categoryId);
    const tags = (a.tags || '').split(',').map(s => s.trim()).filter(Boolean)
      .map(t => '<span class="kb-tag">#' + esc(t) + '</span>').join('');
    return '<div class="kb-art-top"><button class="kb-btn" onclick="kbSetView(\'browse\')"><i class="fa-solid fa-arrow-right"></i> رجوع</button>'
      + '<div class="kb-art-actions"><button class="kb-btn" onclick="kbEdit(\'' + a.id + '\')"><i class="fa-solid fa-pen"></i> تحرير</button>'
      + (a.status === 'draft' ? '<button class="kb-btn accent" onclick="kbPublish(\'' + a.id + '\')"><i class="fa-solid fa-bullhorn"></i> نشر</button>' : '') + '</div></div>'
      + '<article class="kb-article">'
      + '<div class="kb-art-cat">' + (cat ? '<i class="fa-solid ' + esc(cat.icon) + '" style="color:' + esc(cat.color) + '"></i> ' + esc(cat.name) : '') + (a.status === 'draft' ? ' · <span class="kb-badge draft">مسودة</span>' : '') + '</div>'
      + '<h1 class="kb-art-h1">' + esc(a.title) + '</h1>'
      + '<div class="kb-art-byline">' + esc(a.author || 'system') + ' · ' + num(a.views) + ' مشاهدة · آخر تحديث ' + esc(String(a.updatedAt || '').slice(0, 10)) + '</div>'
      + '<div class="kb-art-body">' + nl2br(a.body || '') + '</div>'
      + (tags ? '<div class="kb-art-tags">' + tags + '</div>' : '')
      + '<div class="kb-helpful"><span>هل كان هذا المقال مفيداً؟</span>'
      + '<button class="kb-vote up" onclick="kbVote(\'' + a.id + '\',true)"><i class="fa-solid fa-thumbs-up"></i> نعم (' + num(a.helpful) + ')</button>'
      + '<button class="kb-vote down" onclick="kbVote(\'' + a.id + '\',false)"><i class="fa-solid fa-thumbs-down"></i> لا (' + num(a.notHelpful) + ')</button></div>'
      + '</article>';
  }

  function editorView() {
    const k = K();
    const a = editId ? articleById(editId) : null;
    const catOpts = k.categories.map(c => '<option value="' + esc(c.id) + '"' + (a && a.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    return '<div class="kb-art-top"><button class="kb-btn" onclick="kbCancelEdit()"><i class="fa-solid fa-arrow-right"></i> رجوع</button>'
      + '<span class="kb-editor-title">' + (a ? 'تحرير مقال' : 'مقال جديد') + '</span></div>'
      + '<div class="kb-panel">'
      + '<div class="kb-form-grid">'
      + '<label class="kb-wide">العنوان<input type="text" id="kbE_title" placeholder="عنوان المقال" value="' + esc(a ? a.title : '') + '"></label>'
      + '<label>التصنيف<select id="kbE_cat">' + catOpts + '</select></label>'
      + '<label>الوسوم<input type="text" id="kbE_tags" placeholder="مفصولة بفواصل" value="' + esc(a ? (a.tags || '') : '') + '"></label>'
      + '</div>'
      + '<label class="kb-body-label">المحتوى</label>'
      + '<textarea id="kbE_body" class="kb-textarea" rows="12" placeholder="اكتب محتوى المقال هنا…">' + esc(a ? (a.body || '') : '') + '</textarea>'
      + '<div class="kb-editor-actions"><button class="kb-btn primary" onclick="kbSaveArticle(false)"><i class="fa-solid fa-floppy-disk"></i> حفظ كمسودة</button> '
      + '<button class="kb-btn accent" onclick="kbSaveArticle(true)"><i class="fa-solid fa-bullhorn"></i> حفظ ونشر</button></div>'
      + '</div>';
  }

  function render() {
    ensureData();
    const body = document.getElementById('knowledgeBody');
    if (!body) return;
    let content;
    if (activeView === 'article') content = articleView();
    else if (activeView === 'editor') content = editorView();
    else if (activeView === 'browse') content = browseView();
    else content = overviewView();
    const showChrome = !['article', 'editor'].includes(activeView);
    body.innerHTML = kpiStrip() + (showChrome ? toolbar() : '') + '<div class="kb-content">' + content + '</div>';
  }

  /* ───────── actions ───────── */
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  window.kbSetView = function (v) { activeView = v; render(); };
  window.kbSearchInput = function (v) { searchTerm = v; };
  window.kbDoSearch = function () { activeView = 'browse'; render(); };
  window.kbFilterCategory = function (id) { categoryFilter = id; activeView = 'browse'; render(); };

  window.kbOpen = function (id) {
    const a = articleById(id); if (!a) return;
    a.views = num(a.views) + 1;
    openArticleId = id; activeView = 'article';
    save(); render();
  };

  window.kbNewArticle = function () { editId = null; activeView = 'editor'; render(); };
  window.kbEdit = function (id) { editId = id; activeView = 'editor'; render(); };
  window.kbCancelEdit = function () { editId = null; activeView = openArticleId ? 'article' : 'browse'; render(); };

  window.kbSaveArticle = function (publish) {
    const title = val('kbE_title');
    if (!title) { toast('أدخل عنوان المقال', 'warning'); return; }
    const k = K();
    if (editId) {
      const a = articleById(editId);
      if (a) {
        a.title = title;
        a.categoryId = val('kbE_cat') || a.categoryId;
        a.tags = val('kbE_tags');
        a.body = (document.getElementById('kbE_body') || {}).value || '';
        if (publish) a.status = 'published';
        a.updatedAt = new Date().toISOString();
      }
      openArticleId = editId;
    } else {
      const rec = stamp({
        id: uid('art'),
        categoryId: val('kbE_cat') || (k.categories[0] && k.categories[0].id) || '',
        title,
        tags: val('kbE_tags'),
        body: (document.getElementById('kbE_body') || {}).value || '',
        status: publish ? 'published' : 'draft',
        author: currentUserName(),
        views: 0, helpful: 0, notHelpful: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      k.articles.push(rec);
      openArticleId = rec.id;
    }
    editId = null;
    activeView = 'article';
    save(); render();
    toast(publish ? 'تم حفظ المقال ونشره ✅' : 'تم حفظ المسودة', 'success');
  };

  window.kbPublish = function (id) {
    const a = articleById(id); if (!a) return;
    a.status = 'published'; a.updatedAt = new Date().toISOString();
    save(); render(); toast('تم نشر المقال 📣', 'success');
  };

  window.kbVote = function (id, helpful) {
    const a = articleById(id); if (!a) return;
    if (helpful) a.helpful = num(a.helpful) + 1; else a.notHelpful = num(a.notHelpful) + 1;
    save(); render();
    toast(helpful ? 'شكراً لتقييمك 👍' : 'شكراً، سنحسّن المحتوى 🙏', 'info');
  };

  /* ───────── navigation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('knowledge');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageKnowledge');
    const nav = document.getElementById('navKnowledge');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('knowledge'); } catch (_) {} }
    window.currentPage = 'knowledge';
    render();
    return !!pg;
  }
  function wireSwitch() {
    if (window.__knowledgeWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'knowledge') {
        try { if (activatePage()) return; } catch (e) { console.warn('Knowledge render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__knowledgeWrapped = true;
  }
  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_knowledge_today) return;
      JarvisBrain.tools.report_knowledge_today = {
        desc_en: 'Knowledge base summary: article counts, categories, total views, helpfulness, and most-viewed articles.',
        risk: 'safe',
        params: {},
        run: function () {
          return {
            kpis: kpis(),
            topArticles: K().articles.filter(a => a.status === 'published').slice().sort((a, b) => num(b.views) - num(a.views)).slice(0, 5)
              .map(a => ({ title: a.title, views: num(a.views), helpful: num(a.helpful) }))
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
      if (window.__knowledgeWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonKnowledge = {
    ensureData,
    render,
    kpis,
    report: function () { return JarvisBrain?.tools?.report_knowledge_today?.run?.() || kpis(); },
    open: function () { try { window.switchPage('knowledge'); } catch (_) {} }
  };
})();
