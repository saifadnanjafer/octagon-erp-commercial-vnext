/**
 * OCTAGON ERP — Knowledge Base & FAQ Module (قاعدة المعرفة والأسئلة الشائعة)
 *
 * In-app technical doc center and client support portal.
 * Features: category browser, search/filters, bilingual views, details panel,
 * safe draft-creation editor, and read-only Jarvis assistant tools.
 *
 * Data Model: omni.knowledgeBase = { categories, articles, faqs, drafts, activityLog }
 * Add-only logic, no confirm/prompt (headless-safe).
 */
(function () {
  'use strict';

  let activeTab = 'faq';         // faq | articles | drafts | jarvis
  let activeView = 'browse';     // browse | detail | editor
  let openItemId = null;         // selected article/faq ID
  let openItemType = 'faq';      // faq | article
  let editId = null;             // draft being edited (null = new)
  let editType = 'article';      // article | faq
  let searchTerm = '';
  let categoryFilter = 'all';
  let typeFilter = 'all';        // all | FAQ | Guide | SOP | Policy | Troubleshooting | Module Guide
  let visibilityFilter = 'all';  // all | public | internal | management
  let jarvisFilter = false;

  /* ───────── helper functions ───────── */
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
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function uid(prefix) { return (prefix || 'kb') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function save() { if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} } }
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); } catch (_) {} } }
  
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

  function currentUserName() {
    try { return window.PentagonAuth?.getCurrentUser?.()?.name || window.PentagonAuth?.currentUser?.name || 'system'; } catch (_) { return 'system'; }
  }

  /* ───────── data model & seeding ───────── */
  function ensureData() {
    const o = O();
    if (!o.knowledgeBase || typeof o.knowledgeBase !== 'object') o.knowledgeBase = {};
    const k = o.knowledgeBase;
    if (!Array.isArray(k.categories)) k.categories = [];
    if (!Array.isArray(k.articles)) k.articles = [];
    if (!Array.isArray(k.faqs)) k.faqs = [];
    if (!Array.isArray(k.drafts)) k.drafts = [];
    if (!Array.isArray(k.activityLog)) k.activityLog = [];

    if (!k._expanded && window.OctagonKnowledgeSeed) {
      k.categories = window.OctagonKnowledgeSeed.categories || [];
      k.faqs = window.OctagonKnowledgeSeed.faqs || [];
      
      const pageGuides = (window.OctagonKnowledgeSeed.pageGuides || []).map(pg => ({
        ...pg,
        status: 'published'
      }));
      const troubleshoot = (window.OctagonKnowledgeSeed.troubleshooting || []).map(trb => ({
        ...trb,
        type: 'Troubleshooting',
        status: 'published',
        visibility: 'internal',
        jarvisReadable: true,
        summary: {
          ar: trb.title.ar,
          en: trb.title.en
        },
        content: {
          ar: trb.content.ar,
          en: trb.content.en
        }
      }));
      const articles = (window.OctagonKnowledgeSeed.articles || []).map(art => ({
        ...art,
        status: 'published'
      }));
      
      k.articles = articles.concat(pageGuides).concat(troubleshoot);
      k._expanded = true;
      k._seeded = true;
      k._seeded_faqs = true;
      save();
    }

    if (!k.categories.length) {
      [
        { id: 'general', name: { ar: 'عام', en: 'General' }, icon: 'fa-cubes', color: '#818cf8' },
        { id: 'hr', name: { ar: 'الموارد البشرية والرواتب', en: 'HR & Payroll' }, icon: 'fa-user-tie', color: '#10b981' },
        { id: 'workshop', name: { ar: 'الورشة والإنتاج', en: 'Workshop & MRP' }, icon: 'fa-screwdriver-wrench', color: '#f59e0b' },
        { id: 'whatsapp', name: { ar: 'الاتصالات والربط', en: 'Comms & WhatsApp' }, icon: 'fa-comments', color: '#10b981' },
        { id: 'jarvis', name: { ar: 'ذكاء جارفيس', en: 'Jarvis & AI' }, icon: 'fa-brain', color: '#8b5cf6' },
        { id: 'troubleshoot', name: { ar: 'الدعم والمشاكل', en: 'Troubleshooting' }, icon: 'fa-bug', color: '#ef4444' }
      ].forEach(c => k.categories.push(c));
    }
  }

  function K() { ensureData(); return O().knowledgeBase; }
  
  function getCategoryName(catId) {
    const cat = K().categories.find(c => c.id === catId);
    if (!cat) return catId;
    return t(cat.name.ar, cat.name.en);
  }

  /* ───────── render components ───────── */
  function kpiStrip() {
    const k = K();
    const publishedCount = k.articles.length;
    const faqCount = k.faqs.length;
    const draftCount = k.drafts.length;
    
    return `
      <div class="kb-kpi-grid">
        <div class="kb-kpi-card glass">
          <div class="kb-kpi-icon icon-blue"><i class="fa-solid fa-file-lines"></i></div>
          <div class="kb-kpi-info">
            <span class="kb-kpi-val">${publishedCount}</span>
            <span class="kb-kpi-lbl">${t('مقالات منشورة', 'Published Guides')}</span>
          </div>
        </div>
        <div class="kb-kpi-card glass">
          <div class="kb-kpi-icon icon-green"><i class="fa-solid fa-circle-question"></i></div>
          <div class="kb-kpi-info">
            <span class="kb-kpi-val">${faqCount}</span>
            <span class="kb-kpi-lbl">${t('الأسئلة الشائعة', 'FAQs')}</span>
          </div>
        </div>
        <div class="kb-kpi-card glass">
          <div class="kb-kpi-icon icon-orange"><i class="fa-solid fa-pen-ruler"></i></div>
          <div class="kb-kpi-info">
            <span class="kb-kpi-val">${draftCount}</span>
            <span class="kb-kpi-lbl">${t('مسودات مقترحة', 'Proposed Drafts')}</span>
          </div>
        </div>
        <div class="kb-kpi-card glass">
          <div class="kb-kpi-icon icon-purple"><i class="fa-solid fa-shield-halved"></i></div>
          <div class="kb-kpi-info">
            <span class="kb-kpi-val">${k.categories.length}</span>
            <span class="kb-kpi-lbl">${t('التصنيفات الموثقة', 'Documented Categories')}</span>
          </div>
        </div>
      </div>
    `;
  }

  function tabsSelector() {
    const activeClass = (tab) => activeTab === tab ? 'active' : '';
    return `
      <div class="kb-tab-bar">
        <div class="kb-tabs">
          <button class="kb-tab-btn ${activeClass('faq')}" onclick="kbSetTab('faq')">
            <i class="fa-solid fa-circle-question"></i> ${t('الأسئلة الشائعة', 'FAQs')}
          </button>
          <button class="kb-tab-btn ${activeClass('articles')}" onclick="kbSetTab('articles')">
            <i class="fa-solid fa-file-lines"></i> ${t('الأدلة الفنية', 'Guides & SOPs')}
          </button>
          <button class="kb-tab-btn ${activeClass('drafts')}" onclick="kbSetTab('drafts')">
            <i class="fa-solid fa-folder-open"></i> ${t('المسودات والمراجعة', 'Drafts & Review')}
          </button>
          <button class="kb-tab-btn ${activeClass('jarvis')}" onclick="kbSetTab('jarvis')">
            <i class="fa-solid fa-brain"></i> ${t('روح النظام جارفيس', 'Jarvis Governance')}
          </button>
        </div>
        <div class="kb-actions">
          <button class="kb-btn primary" onclick="kbNewDraft()">
            <i class="fa-solid fa-plus"></i> ${t('اقتراح مقال / سؤال', 'Propose Draft')}
          </button>
        </div>
      </div>
    `;
  }

  function getCoverageStats() {
    const k = K();
    const totalPagesCount = 95;
    const coveredPages = new Set();
    k.articles.forEach(a => {
      if (a.type === 'Page Guide' && a.pageKey) {
        coveredPages.add(a.pageKey);
      }
    });
    const coveredPagesCount = coveredPages.size;
    const missingPagesCount = totalPagesCount - coveredPagesCount;
    const categoriesCount = k.categories.length;
    const pct = Math.round((coveredPagesCount / totalPagesCount) * 100);
    return { totalPagesCount, coveredPagesCount, missingPagesCount, categoriesCount, pct };
  }

  function sidebarFilters() {
    const k = K();
    const stats = getCoverageStats();
    
    const categoryCounts = {};
    const typeCounts = {};
    const allPublished = k.faqs.map(f => ({ ...f, type: 'FAQ' }))
      .concat(k.articles.filter(a => a.status === 'published'));
      
    allPublished.forEach(item => {
      categoryCounts[item.categoryId] = (categoryCounts[item.categoryId] || 0) + 1;
      typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    });

    const categoriesHtml = k.categories.map(c => {
      const isSelected = categoryFilter === c.id ? 'selected' : '';
      const count = categoryCounts[c.id] || 0;
      return `
        <li class="kb-cat-item ${isSelected}" onclick="kbSetCategoryFilter('${c.id}')">
          <span class="kb-cat-lbl"><i class="fa-solid ${c.icon}" style="color:${c.color}"></i> ${t(c.name.ar, c.name.en)}</span>
          <span class="kb-cat-count">${count}</span>
        </li>
      `;
    }).join('');

    const types = ['FAQ', 'Guide', 'SOP', 'Policy', 'Troubleshooting', 'Module Guide', 'Page Guide'];
    const typeOptions = types.map(ty => {
      const count = typeCounts[ty] || 0;
      return `<option value="${ty}" ${typeFilter === ty ? 'selected' : ''}>${ty} (${count})</option>`;
    }).join('');

    const coverageWidget = `
      <div class="kb-sb-group kb-coverage-widget glass">
        <h3 style="margin-top:0">${t('تغطية الصفحات والمسارات', 'System Coverage Matrix')}</h3>
        <div class="kb-progress-bar">
          <div class="kb-progress-fill" style="width: ${stats.pct}%"></div>
        </div>
        <div class="kb-stats-grid">
          <div class="kb-stat-box"><strong>${stats.pct}%</strong><span>${t('تغطية', 'Coverage')}</span></div>
          <div class="kb-stat-box"><strong>${stats.coveredPagesCount}</strong><span>${t('مغطى', 'Covered')}</span></div>
          <div class="kb-stat-box"><strong>${stats.missingPagesCount}</strong><span>${t('متبقي', 'Missing')}</span></div>
        </div>
      </div>
    `;

    return `
      <div class="kb-sidebar glass">
        ${coverageWidget}
        <div class="kb-sb-group">
          <h3>${t('البحث الذكي', 'Search')}</h3>
          <input type="text" id="kbSearchInp" class="kb-input" placeholder="${t('ابحث هنا...', 'Search text...')}" value="${esc(searchTerm)}" oninput="kbSetSearch(this.value)">
        </div>

        <div class="kb-sb-group">
          <h3>${t('التصنيفات المعتمدة', 'Approved Categories')}</h3>
          <ul class="kb-cat-list">
            <li class="kb-cat-item ${categoryFilter === 'all' ? 'selected' : ''}" onclick="kbSetCategoryFilter('all')">
              <span class="kb-cat-lbl"><i class="fa-solid fa-border-all"></i> ${t('كل الأقسام', 'All Categories')}</span>
              <span class="kb-cat-count">${allPublished.length}</span>
            </li>
            ${categoriesHtml}
          </ul>
        </div>

        <div class="kb-sb-group">
          <h3>${t('تصفية النتائج', 'Filters')}</h3>
          <div class="kb-filter-row">
            <label>${t('النوع:', 'Type:')}</label>
            <select class="kb-select" onchange="kbSetTypeFilter(this.value)">
              <option value="all">${t('الكل', 'All')}</option>
              ${typeOptions}
            </select>
          </div>
          <div class="kb-filter-row">
            <label>${t('الصلاحية:', 'Access:')}</label>
            <select class="kb-select" onchange="kbSetVisibilityFilter(this.value)">
              <option value="all" ${visibilityFilter === 'all' ? 'selected' : ''}>${t('الكل', 'All')}</option>
              <option value="public" ${visibilityFilter === 'public' ? 'selected' : ''}>${t('عام (Public)', 'Public')}</option>
              <option value="internal" ${visibilityFilter === 'internal' ? 'selected' : ''}>${t('داخلي (Internal)', 'Internal')}</option>
              <option value="technical" ${visibilityFilter === 'technical' ? 'selected' : ''}>${t('فني (Technical)', 'Technical')}</option>
              <option value="management" ${visibilityFilter === 'management' ? 'selected' : ''}>${t('إداري (Management)', 'Management')}</option>
            </select>
          </div>
          <div class="kb-filter-row checkbox">
            <label>
              <input type="checkbox" ${jarvisReadableChecked()} onchange="kbSetJarvisFilter(this.checked)">
              <span>${t('متاح لـ Jarvis', 'Jarvis Readable')}</span>
            </label>
          </div>
        </div>
      </div>
    `;
  }
  
  function jarvisReadableChecked() {
    return jarvisFilter ? 'checked' : '';
  }

  function getFilteredItems() {
    const k = K();
    let list = [];
    if (activeTab === 'faq') {
      list = k.faqs.map(f => ({
        id: f.id,
        type: 'FAQ',
        categoryId: f.categoryId,
        tags: f.tags,
        visibility: f.visibility,
        jarvisReadable: f.jarvisReadable,
        title: f.question,
        body: f.answer,
        updatedAt: f.updatedAt,
        source: f.source
      }));
    } else if (activeTab === 'articles') {
      list = k.articles.filter(a => a.status === 'published');
    } else if (activeTab === 'drafts') {
      list = k.drafts.concat(k.articles.filter(a => a.status === 'draft'));
    }

    // Apply Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(item => {
        const titleMatch = (t(item.title.ar, item.title.en) || '').toLowerCase().includes(q);
        const bodyMatch = (t(item.content ? item.content.ar : item.body.ar, item.content ? item.content.en : item.body.en) || '').toLowerCase().includes(q);
        const tagMatch = (item.tags || []).some(tg => tg.toLowerCase().includes(q));
        return titleMatch || bodyMatch || tagMatch;
      });
    }

    // Apply Category
    if (categoryFilter !== 'all') {
      list = list.filter(item => item.categoryId === categoryFilter);
    }

    // Apply Type
    if (typeFilter !== 'all') {
      list = list.filter(item => item.type === typeFilter);
    }

    // Apply Visibility
    if (visibilityFilter !== 'all') {
      list = list.filter(item => item.visibility === visibilityFilter);
    }

    // Apply Jarvis Filter
    if (jarvisFilter) {
      list = list.filter(item => item.jarvisReadable === true);
    }

    return list;
  }

  function itemListView() {
    const items = getFilteredItems();
    if (!items.length) {
      return `
        <div class="kb-empty-panel glass">
          <div class="kb-empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
          <h3>${t('لا توجد نتائج مطابقة للبحث', 'No Matching Content')}</h3>
          <p>${t('يرجى تغيير خيارات البحث والتصفية أو إضافة مقال جديد.', 'Try adjusting your filters or proposing a new draft.')}</p>
        </div>
      `;
    }

    const cards = items.map(item => {
      const labelText = t(item.title.ar, item.title.en);
      const summaryText = item.summary ? t(item.summary.ar, item.summary.en) : '';
      const jarvisIcon = item.jarvisReadable ? '<span class="jarvis-badge" title="Jarvis Readable"><i class="fa-solid fa-brain"></i> AI</span>' : '';
      const visBadge = `<span class="vis-badge ${item.visibility}">${item.visibility}</span>`;
      const typeBadge = `<span class="type-badge">${item.type || 'FAQ'}</span>`;
      
      const isDemoOnly = ['fleet_fuel', 'messaging_connect', 'saas_marketplace'].includes(item.categoryId) || (item.tags && item.tags.includes('demo'));
      const statusBadge = isDemoOnly 
        ? `<span class="status-badge demo" title="Demo / Future Feature">${t('تجريبي / مستقبل', 'Demo / Future')}</span>`
        : `<span class="status-badge prod" title="Live Production Feature">${t('إنتاجي حقيقي', 'Production')}</span>`;

      return `
        <div class="kb-item-card glass" onclick="kbOpenItem('${item.id}', '${item.type === 'FAQ' ? 'faq' : 'article'}')">
          <div class="kb-ic-top">
            <span class="kb-ic-cat"><i class="fa-solid fa-folder"></i> ${getCategoryName(item.categoryId)}</span>
            <div class="kb-ic-badges">
              ${jarvisIcon}
              ${statusBadge}
              ${visBadge}
              ${typeBadge}
            </div>
          </div>
          <h2 class="kb-ic-title">${esc(labelText)}</h2>
          <p class="kb-ic-summary">${esc(summaryText || (t(item.body ? item.body.ar : item.content.ar, item.body ? item.body.en : item.content.en).slice(0, 120) + '...'))}</p>
          <div class="kb-ic-footer">
            <span class="kb-ic-date"><i class="fa-regular fa-clock"></i> ${esc(item.updatedAt || todayISO())}</span>
            <span class="kb-ic-link">${t('عرض كامل التفاصيل ←', 'View Details →')}</span>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="kb-items-grid">${cards}</div>`;
  }

  function detailPanel() {
    const k = K();
    let item = null;
    if (openItemType === 'faq') {
      const f = k.faqs.find(x => x.id === openItemId);
      if (f) {
        item = {
          id: f.id,
          type: 'FAQ',
          categoryId: f.categoryId,
          tags: f.tags,
          visibility: f.visibility,
          jarvisReadable: f.jarvisReadable,
          title: f.question,
          body: f.answer,
          updatedAt: f.updatedAt,
          source: f.source
        };
      }
    } else {
      item = k.articles.find(x => x.id === openItemId) || k.drafts.find(x => x.id === openItemId);
    }

    if (!item) {
      activeView = 'browse';
      return '';
    }

    const titleText = t(item.title.ar, item.title.en);
    const bodyText = t(item.body ? item.body.ar : item.content.ar, item.body ? item.body.en : item.content.en);
    const jarvisBadge = item.jarvisReadable ? `<span class="jarvis-status is-ok"><i class="fa-solid fa-brain"></i> ${t('مسموح لـ Jarvis بقراءته', 'Jarvis Readable')}</span>` : `<span class="jarvis-status is-fail"><i class="fa-solid fa-lock"></i> ${t('محجوب عن Jarvis', 'Jarvis Restricted')}</span>`;
    
    // Check if the user is manager/admin to show approval actions for drafts
    const isManager = currentUserName() === 'system' || ['system.admin', 'workshop.manager'].some(g => {
      try { return window.PermissionService?.checkPage('admin_panel'); } catch (_) { return false; }
    });

    const isDraft = item.status === 'draft' || item.id.startsWith('draft_') || !k.articles.some(x => x.id === item.id);
    const approvalActions = (isDraft && isManager) ? `
      <div class="kb-detail-actions">
        <button class="kb-btn success" onclick="kbApproveDraft('${item.id}', '${item.type}')">
          <i class="fa-solid fa-circle-check"></i> ${t('اعتماد ونشر', 'Approve & Publish')}
        </button>
        <button class="kb-btn danger" onclick="kbRejectDraft('${item.id}')">
          <i class="fa-solid fa-circle-xmark"></i> ${t('رفض وأرشفة', 'Reject & Archive')}
        </button>
      </div>
    ` : '';

    let stepsHtml = '';
    const stepsList = item.steps ? t(item.steps.ar, item.steps.en) : null;
    if (Array.isArray(stepsList) && stepsList.length) {
      stepsHtml = `
        <div class="kb-detail-steps">
          <h3>${t('خطوات العمل القياسية:', 'Standard Execution Steps:')}</h3>
          <ol class="kb-steps-list">
            ${stepsList.map(st => `<li>${esc(st)}</li>`).join('')}
          </ol>
        </div>
      `;
    }

    return `
      <div class="kb-detail-view glass">
        <div class="kb-detail-header">
          <button class="kb-btn" onclick="kbCloseDetail()">
            <i class="fa-solid fa-arrow-left"></i> ${t('رجوع للقائمة', 'Back to List')}
          </button>
          <div class="kb-detail-meta-top">
            <span class="meta-item"><i class="fa-solid fa-folder"></i> ${getCategoryName(item.categoryId)}</span>
            <span class="meta-item"><i class="fa-solid fa-passport"></i> ${item.visibility}</span>
            <span class="meta-item"><i class="fa-solid fa-tag"></i> ${item.type || 'FAQ'}</span>
          </div>
        </div>

        <h1 class="kb-detail-title">${esc(titleText)}</h1>
        
        <div class="kb-detail-metrics">
          <span><i class="fa-regular fa-clock"></i> ${esc(item.updatedAt || todayISO())}</span>
          <span><i class="fa-regular fa-user"></i> ${esc(item.updatedBy || 'system')}</span>
          ${jarvisBadge}
        </div>

        <div class="kb-detail-content">
          ${bodyText.replace(/\n/g, '<br>')}
        </div>

        ${stepsHtml}

        <div class="kb-detail-tags">
          ${(item.tags || []).map(tg => `<span class="kb-tag">#${esc(tg)}</span>`).join(' ')}
        </div>

        <div class="kb-detail-footer">
          <div class="kb-voting">
            <span class="voting-lbl">${t('هل كانت هذه المعلومة مفيدة؟', 'Was this helpful?')}</span>
            <button class="kb-vote-btn" onclick="kbVoteItem('${item.id}', '${openItemType}', true)">
              <i class="fa-solid fa-thumbs-up"></i> ${t('نعم', 'Yes')}
            </button>
            <button class="kb-vote-btn" onclick="kbVoteItem('${item.id}', '${openItemType}', false)">
              <i class="fa-solid fa-thumbs-down"></i> ${t('لا', 'No')}
            </button>
          </div>
          
          ${approvalActions}
        </div>
      </div>
    `;
  }

  function editorPanel() {
    const k = K();
    const categoriesHtml = k.categories.map(c => `<option value="${c.id}" ${editId && articleById(editId)?.categoryId === c.id ? 'selected' : ''}>${t(c.name.ar, c.name.en)}</option>`).join('');

    return `
      <div class="kb-editor-view glass">
        <div class="kb-editor-header">
          <button class="kb-btn" onclick="kbCloseEditor()">
            <i class="fa-solid fa-arrow-left"></i> ${t('إلغاء التعديل', 'Cancel')}
          </button>
          <h2>${t('اقتراح مسودة جديدة لقاعدة المعرفة', 'Propose a New Knowledge Base Draft')}</h2>
        </div>

        <div class="kb-editor-form">
          <div class="kb-form-row">
            <label>${t('نوع المسودة:', 'Draft Type:')}</label>
            <select id="kbEdType" class="kb-select" onchange="kbSetEditType(this.value)">
              <option value="article" ${editType === 'article' ? 'selected' : ''}>${t('دليل تشغيل / مقال فني', 'Guide / Technical Article')}</option>
              <option value="faq" ${editType === 'faq' ? 'selected' : ''}>${t('سؤال شائع وإجابة شائعة', 'Frequently Asked Question (FAQ)')}</option>
            </select>
          </div>

          <div class="kb-form-row">
            <label>${t('عنوان المسودة (العربية):', 'Title (Arabic):')}</label>
            <input type="text" id="kbEdTitleAr" class="kb-input" placeholder="${t('أدخل العنوان باللغة العربية...', 'Enter Arabic title...')}">
          </div>

          <div class="kb-form-row">
            <label>${t('عنوان المسودة (الإنجليزية):', 'Title (English):')}</label>
            <input type="text" id="kbEdTitleEn" class="kb-input" placeholder="${t('أدخل العنوان باللغة الإنجليزية...', 'Enter English title...')}">
          </div>

          <div class="kb-form-row">
            <label>${t('التصنيف الرئيسي:', 'Category:')}</label>
            <select id="kbEdCat" class="kb-select">
              ${categoriesHtml}
            </select>
          </div>

          <div class="kb-form-row">
            <label>${t('مستوى الصلاحية:', 'Visibility Access:')}</label>
            <select id="kbEdVisibility" class="kb-select">
              <option value="public">${t('عام (Public)', 'Public')}</option>
              <option value="internal" selected>${t('داخلي للموظفين (Internal)', 'Internal')}</option>
              <option value="technical">${t('فني للمطورين (Technical)', 'Technical')}</option>
              <option value="management">${t('إداري للمدراء (Management)', 'Management')}</option>
            </select>
          </div>

          <div class="kb-form-row">
            <label>${t('الوسوم والكلمات الدليلة (مفصولة بفواصل):', 'Tags (comma separated):')}</label>
            <input type="text" id="kbEdTags" class="kb-input" placeholder="${t('مثال: رواتب، إكسل، واتساب', 'e.g. mrp, payroll, whatsapp')}">
          </div>

          <div class="kb-form-row">
            <label>
              <input type="checkbox" id="kbEdJarvis" checked>
              <span>${t('السماح لـ Jarvis بقراءة هذا المستند', 'Allow Jarvis to read this article')}</span>
            </label>
          </div>

          <div class="kb-form-row full-width">
            <label>${t('نص المحتوى والشرح (باللغة العربية):', 'Content Body (Arabic):')}</label>
            <textarea id="kbEdBodyAr" class="kb-textarea" rows="8" placeholder="${t('اكتب شرح المقال أو إجابة السؤال هنا...', 'Enter Arabic content...')}" style="direction:rtl"></textarea>
          </div>

          <div class="kb-form-row full-width">
            <label>${t('نص المحتوى والشرح (باللغة الإنجليزية):', 'Content Body (English):')}</label>
            <textarea id="kbEdBodyEn" class="kb-textarea" rows="8" placeholder="${t('Write the English version of the content here...', 'Enter English content...')}" style="direction:ltr"></textarea>
          </div>

          <div class="kb-editor-actions">
            <button class="kb-btn success" onclick="kbSaveDraft()">
              <i class="fa-solid fa-floppy-disk"></i> ${t('حفظ المسودة للمراجعة', 'Save Draft for Review')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function jarvisPanel() {
    return `
      <div class="kb-jarvis-view glass">
        <div class="kb-jv-hero">
          <div class="kb-jv-brain"><i class="fa-solid fa-brain"></i></div>
          <h2>${t('إدارة أمان وحوكمة جارفيس (Jarvis AI Governance)', 'Jarvis AI Security & Governance')}</h2>
          <p>${t('قواعد أمان مشددة تحكم عمليات قراءة وتحرير مساعد الذكاء الاصطناعي لقاعدة المعرفة والـ ERP.', 'Strict safety boundaries governing AI operations within Octagon ERP.')}</p>
        </div>

        <div class="kb-jv-grid">
          <div class="kb-jv-card">
            <h3><i class="fa-solid fa-circle-check" style="color:#10b981"></i> ${t('العمليات المسموحة لـ Jarvis', 'Allowed AI Capabilities')}</h3>
            <ul>
              <li><strong>${t('البحث الذكي:', 'Smart Search:')}</strong> ${t('قراءة وفحص المقالات والأسئلة الشائعة التي تحتوي على وسم مسموح لـ Jarvis.', 'Query and summarize documents with the "Jarvis Readable" flag.')}</li>
              <li><strong>${t('توليد المسودات:', 'Draft Proposals:')}</strong> ${t('اقتراح مسودات جديدة للأسئلة الشائعة وتوليدها بصفحة المراجعة.', 'Draft new articles or suggest tags based on workshop conversations.')}</li>
              <li><strong>${t('الدعم الإرشادي:', 'Staff Guidance:')}</strong> ${t('شرح مهام اليوميات والحضور للعمال بناءً على دليل الاستخدام.', 'Explain timesheet rules or backup schedules using mapped articles.')}</li>
            </ul>
          </div>

          <div class="kb-jv-card">
            <h3><i class="fa-solid fa-circle-xmark" style="color:#ef4444"></i> ${t('العمليات المحظورة على Jarvis', 'Blocked AI Operations')}</h3>
            <ul>
              <li><strong>${t('النشر والتعديل المباشر:', 'Direct Publishing:')}</strong> ${t('يُمنع جارفيس تماماً من نشر أي مسودة أو تعديل مقال منشور دون موافقة مدير الورشة.', 'Cannot edit or publish articles without manual human-in-the-loop approval.')}</li>
              <li><strong>${t('حذف السجلات:', 'Content Deletion:')}</strong> ${t('لا يملك جارفيس صلاحية مسح أو أرشفة أي مقال.', 'AI cannot delete or archive verified guides or FAQs.')}</li>
              <li><strong>${t('تجاوز الصلاحيات:', 'Access Restrictions:')}</strong> ${t('لا يملك جارفيس صلاحية قراءة المقالات المعلمة كـ "إداري" أو "فني" للمستخدمين غير المصرّح لهم.', 'Strictly forbidden from displaying restricted content to unauthorized staff.')}</li>
            </ul>
          </div>
        </div>

        <div class="kb-jv-footer">
          <span class="kb-jv-badge"><i class="fa-solid fa-shield-halved"></i> ${t('نظام الحوكمة مدمج ويعمل تلقائياً', 'Governance protocol is active and enforced')}</span>
        </div>
      </div>
    `;
  }

  function render() {
    ensureData();
    const body = document.getElementById('knowledgeBaseBody');
    if (!body) return;

    let contentHtml = '';
    if (activeView === 'editor') {
      contentHtml = editorPanel();
    } else if (activeView === 'detail') {
      contentHtml = detailPanel();
    } else {
      // Browse View (Two column structure with sidebar and list)
      if (activeTab === 'jarvis') {
        contentHtml = jarvisPanel();
      } else {
        contentHtml = `
          <div class="kb-two-column-layout">
            ${sidebarFilters()}
            <div class="kb-main-panel">
              ${itemListView()}
            </div>
          </div>
        `;
      }
    }

    body.innerHTML = `
      <div class="kb-module-container">
        ${kpiStrip()}
        ${tabsSelector()}
        <div class="kb-content-area">
          ${contentHtml}
        </div>
      </div>
    `;
  }

  /* ───────── UI event actions ───────── */
  window.kbSetTab = function (tab) {
    activeTab = tab;
    activeView = 'browse';
    render();
  };

  window.kbSetSearch = function (val) {
    searchTerm = val;
  };

  window.kbSetCategoryFilter = function (catId) {
    categoryFilter = catId;
    activeView = 'browse';
    render();
  };

  window.kbSetTypeFilter = function (type) {
    typeFilter = type;
    activeView = 'browse';
    render();
  };

  window.kbSetVisibilityFilter = function (vis) {
    visibilityFilter = vis;
    activeView = 'browse';
    render();
  };

  window.kbSetJarvisFilter = function (checked) {
    jarvisFilter = !!checked;
    activeView = 'browse';
    render();
  };

  window.kbOpenItem = function (id, type) {
    openItemId = id;
    openItemType = type;
    activeView = 'detail';
    
    // Increment view count safely
    const k = K();
    if (type === 'faq') {
      const f = k.faqs.find(x => x.id === id);
      if (f) f.views = num(f.views) + 1;
    } else {
      const a = k.articles.find(x => x.id === id) || k.drafts.find(x => x.id === id);
      if (a) a.views = num(a.views) + 1;
    }
    
    render();
  };

  window.kbCloseDetail = function () {
    openItemId = null;
    activeView = 'browse';
    render();
  };

  window.kbNewDraft = function () {
    editId = null;
    editType = 'article';
    activeView = 'editor';
    render();
  };

  window.kbSetEditType = function (val) {
    editType = val;
    render();
  };

  window.kbCloseEditor = function () {
    activeView = 'browse';
    render();
  };

  window.kbSaveDraft = function () {
    const titleAr = document.getElementById('kbEdTitleAr')?.value?.trim();
    const titleEn = document.getElementById('kbEdTitleEn')?.value?.trim();
    const bodyAr = document.getElementById('kbEdBodyAr')?.value?.trim();
    const bodyEn = document.getElementById('kbEdBodyEn')?.value?.trim();

    if (!titleAr || !titleEn) {
      toast(t('يرجى إدخال عنوان المسودة باللغتين', 'Please enter title in both Arabic and English'), 'warning');
      return;
    }
    if (!bodyAr || !bodyEn) {
      toast(t('يرجى إدخال محتوى الشرح باللغتين', 'Please enter content in both Arabic and English'), 'warning');
      return;
    }

    const k = K();
    const newDraft = {
      id: uid('draft'),
      type: editType === 'faq' ? 'FAQ' : 'Guide',
      categoryId: document.getElementById('kbEdCat')?.value || 'general',
      tags: (document.getElementById('kbEdTags')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
      visibility: document.getElementById('kbEdVisibility')?.value || 'internal',
      jarvisReadable: !!document.getElementById('kbEdJarvis')?.checked,
      title: { ar: titleAr, en: titleEn },
      summary: {
        ar: bodyAr.slice(0, 100) + '...',
        en: bodyEn.slice(0, 100) + '...'
      },
      content: { ar: bodyAr, en: bodyEn },
      source: 'manual',
      updatedAt: todayISO(),
      updatedBy: currentUserName()
    };

    k.drafts.push(newDraft);
    save();
    
    activeTab = 'drafts';
    activeView = 'browse';
    render();
    toast(t('تم تقديم المسودة للمراجعة والاعتماد', 'Draft submitted for review'), 'success');
  };

  window.kbVoteItem = function (id, type, helpful) {
    toast(t('شكراً لتقييمك لمقالات المعرفة', 'Thank you for your feedback!'), 'success');
  };

  window.kbApproveDraft = function (id, type) {
    const k = K();
    const idx = k.drafts.findIndex(d => d.id === id);
    if (idx === -1) return;
    const d = k.drafts[idx];

    if (d.type === 'FAQ') {
      k.faqs.push({
        id: uid('faq'),
        categoryId: d.categoryId,
        question: d.title,
        answer: d.content || d.body,
        tags: d.tags,
        visibility: d.visibility,
        jarvisReadable: d.jarvisReadable,
        source: 'manual',
        updatedAt: todayISO()
      });
    } else {
      k.articles.push({
        id: uid('art'),
        type: d.type || 'Guide',
        status: 'published',
        categoryId: d.categoryId,
        tags: d.tags,
        visibility: d.visibility,
        jarvisReadable: d.jarvisReadable,
        title: d.title,
        summary: d.summary,
        content: d.content || d.body,
        source: 'manual',
        updatedAt: todayISO(),
        updatedBy: currentUserName()
      });
    }

    // Remove from drafts
    k.drafts.splice(idx, 1);
    save();
    
    activeTab = d.type === 'FAQ' ? 'faq' : 'articles';
    activeView = 'browse';
    render();
    toast(t('تم اعتماد ونشر المستند بنجاح ✅', 'Draft approved and published successfully'), 'success');
  };

  window.kbRejectDraft = function (id) {
    const k = K();
    const idx = k.drafts.findIndex(d => d.id === id);
    if (idx !== -1) {
      k.drafts.splice(idx, 1);
      save();
    }
    activeView = 'browse';
    render();
    toast(t('تم رفض المسودة وأرشفتها', 'Draft rejected and archived'), 'info');
  };

  /* ───────── navigation & page activation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('knowledge_base');
    if (!allowed) { toast(t('لا تملك صلاحية لهذا القسم', 'Access Denied'), 'danger'); return true; }
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    const pg = document.getElementById('pageKnowledgeBase');
    const nav = document.getElementById('navKnowledgeBase');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    
    if (typeof window.ensureNavGroupForPage === 'function') {
      try { window.ensureNavGroupForPage('knowledge_base'); } catch (_) {}
    }
    
    window.currentPage = 'knowledge_base';
    render();
    return !!pg;
  }

  function wireSwitch() {
    if (window.__knowledgeBaseWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'knowledge_base') {
        try { if (activatePage()) return; } catch (e) { console.warn('KnowledgeBase render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__knowledgeBaseWrapped = true;
  }

  function searchPublished(query) {
    const k = K();
    const q = String(query || '').toLowerCase();
    
    const faqs = k.faqs.filter(f => f.jarvisReadable).map(f => ({
      id: f.id,
      type: 'FAQ',
      categoryId: f.categoryId,
      title: f.question,
      summary: f.answer,
      content: f.answer,
      source: f.source || 'seed'
    }));
    
    const articles = k.articles.filter(a => a.status === 'published' && a.jarvisReadable).map(a => ({
      id: a.id,
      type: a.type || 'Guide',
      categoryId: a.categoryId,
      title: a.title,
      summary: a.summary || a.content,
      content: a.content,
      source: a.source || 'seed'
    }));
    
    const all = faqs.concat(articles);
    if (!q) return all.slice(0, 10);
    
    return all.filter(item => {
      const arTitle = (item.title.ar || '').toLowerCase();
      const enTitle = (item.title.en || '').toLowerCase();
      const arContent = (item.content.ar || '').toLowerCase();
      const enContent = (item.content.en || '').toLowerCase();
      return arTitle.includes(q) || enTitle.includes(q) || arContent.includes(q) || enContent.includes(q);
    }).slice(0, 15);
  }

  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools) return;
      if (!JarvisBrain.tools.report_knowledge_base) {
        JarvisBrain.tools.report_knowledge_base = {
          desc_en: 'Knowledge base details: FAQs, guides, and drafts counts for Octagon ERP systems.',
          risk: 'safe',
          params: {},
          run: function () {
            const k = K();
            return {
              faqsCount: k.faqs.length,
              articlesCount: k.articles.length,
              draftsCount: k.drafts.length,
              categories: k.categories.map(c => t(c.name.ar, c.name.en))
            };
          }
        };
      }
      if (!JarvisBrain.tools.search_knowledge_base) {
        JarvisBrain.tools.search_knowledge_base = {
          desc_en: 'Search published and Jarvis-readable knowledge base/FAQ entries by keywords.',
          risk: 'safe',
          params: { query: { type: 'string', required: true } },
          run: async function (args) {
            try {
              const resp = await fetch('/api/jarvis/kb/search?q=' + encodeURIComponent(args.query || ''));
              if (!resp.ok) return { error: 'Server search failed.' };
              const data = await resp.json();
              return data.results || [];
            } catch (e) {
              return { error: 'Network error or server unavailable.' };
            }
          }
        };
      }
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
      if (window.__knowledgeBaseWrapped || tries > 40) clearInterval(t);
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Listen for language changes and re-render
  window.addEventListener('octagon:language-applied', function () {
    if (window.currentPage === 'knowledge_base') {
      render();
    }
  });

  window.OctagonKnowledgeBase = {
    ensureData,
    render,
    search: searchPublished,
    open: function () { try { window.switchPage('knowledge_base'); } catch (_) {} }
  };
})();
