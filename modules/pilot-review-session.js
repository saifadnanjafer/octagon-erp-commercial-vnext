/**
 * OCTAGON OMNISYSTEM - Pilot Review Session
 *
 * Core manual QA/UAT review layer. It plugs into the existing floating AI
 * assistant and uses OctagonPilotReviewRegistry for deterministic page scans.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'octagonPilotReviewSessions';
  const ACTIVE_KEY = 'octagonPilotReviewActiveSessionId';
  const SAVE_DEBOUNCE_MS = 450;
  const MAX_LOCAL_SESSIONS = 80;

  let activeSession = null;
  let selectedIndex = 0;
  let saveTimer = null;
  let lastServerFile = '';
  let panelOpen = false;

  function registry() {
    return root.OctagonPilotReviewRegistry || root.PilotReviewRegistry || null;
  }

  function esc(value) {
    try {
      if (typeof root.escapeHtml === 'function') return root.escapeHtml(value);
    } catch (_) {}
    return String(value == null ? '' : value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function shortTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    } catch (_) {
      return String(value);
    }
  }

  function noteSourceLabel(source) {
    if (source === 'step_note') return 'اختيار + تعليق';
    if (source === 'step_comment') return 'تعليق يدوي';
    if (source === 'chat_input_debug_mode') return 'من مربع الشات';
    return 'تعليق';
  }

  function makeSessionId(page) {
    return 'pilot_' + String(page || 'page').replace(/[^a-z0-9_-]/gi, '_').toLowerCase() + '_' + Date.now().toString(36);
  }

  function getCurrentReviewPage() {
    const api = registry();
    if (api && typeof api.getCurrentPage === 'function') return api.getCurrentPage();
    try {
      if (typeof currentPage !== 'undefined' && currentPage) return currentPage;
    } catch (_) {}
    return 'calculator';
  }

  function sessionStatusMap(session) {
    session.elementReviews = session.elementReviews && typeof session.elementReviews === 'object' ? session.elementReviews : {};
    return session.elementReviews;
  }

  function getSessions() {
    const list = readJson(STORAGE_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveLocalSession(session) {
    const sessions = getSessions().filter(item => item && item.id !== session.id);
    sessions.unshift(session);
    writeJson(STORAGE_KEY, sessions.slice(0, MAX_LOCAL_SESSIONS));
    try { localStorage.setItem(ACTIVE_KEY, session.id); } catch (_) {}
  }

  function loadActiveSession() {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (!id) return null;
    return getSessions().find(item => item && item.id === id) || null;
  }

  function loadPageSession(page) {
    const target = String(page || getCurrentReviewPage());
    return getSessions().find(item => item && item.page === target && item.status === 'in_progress') || null;
  }

  function restoreIndex(session) {
    const elements = session?.scan?.elements || [];
    if (!elements.length) return 0;
    const saved = Number(session.selectedIndex);
    if (Number.isFinite(saved) && saved >= 0) return Math.max(0, Math.min(elements.length - 1, saved));
    const reviews = sessionStatusMap(session);
    const firstPending = elements.findIndex(item => !reviews[item.id]?.status || reviews[item.id].status === 'pending');
    return firstPending >= 0 ? firstPending : Math.max(0, elements.length - 1);
  }

  function setActiveSession(session) {
    activeSession = session || null;
    selectedIndex = activeSession ? restoreIndex(activeSession) : 0;
    lastServerFile = activeSession?.serverFile || '';
    if (activeSession) saveLocalSession(activeSession);
    return activeSession;
  }

  function buildSession(page) {
    const api = registry();
    if (!api || typeof api.scanPage !== 'function') {
      return null;
    }
    const scan = api.scanPage(page || getCurrentReviewPage());
    const session = {
      id: makeSessionId(scan.page),
      mode: 'manual',
      page: scan.page,
      pageLabel: scan.pageLabel || scan.page,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      status: 'in_progress',
      scan,
      selectedIndex: 0,
      elementReviews: {},
      notes: [],
      transcript: [
        {
          at: nowIso(),
          role: 'system',
          text: 'Pilot Review started for ' + (scan.pageLabel || scan.page) + '. Review every scanned control and mark pass, fail, or skip.'
        }
      ],
      serverFile: ''
    };
    scan.elements.forEach(item => {
      session.elementReviews[item.id] = {
        status: 'pending',
        notes: [],
        updatedAt: ''
      };
    });
    return session;
  }

  function totals(session) {
    const reviews = sessionStatusMap(session);
    const entries = Object.values(reviews);
    return {
      total: entries.length,
      pass: entries.filter(item => item.status === 'pass').length,
      fail: entries.filter(item => item.status === 'fail').length,
      skip: entries.filter(item => item.status === 'skip').length,
      pending: entries.filter(item => !item.status || item.status === 'pending').length
    };
  }

  function summarizeSession(session) {
    const source = session || activeSession || loadActiveSession();
    if (!source) {
      return {
        active: false,
        page: '',
        pageLabel: '',
        status: 'not_started',
        total: 0,
        pass: 0,
        fail: 0,
        skip: 0,
        pending: 0,
        percent: 0,
        updatedAt: ''
      };
    }
    const count = totals(source);
    const done = count.pass + count.fail + count.skip;
    return {
      active: source.status === 'in_progress',
      page: source.page || '',
      pageLabel: source.pageLabel || source.page || '',
      status: source.status || 'in_progress',
      total: count.total,
      pass: count.pass,
      fail: count.fail,
      skip: count.skip,
      pending: count.pending,
      percent: count.total ? Math.round((done / count.total) * 100) : 0,
      updatedAt: source.updatedAt || ''
    };
  }

  function selectedElement() {
    const elements = activeSession?.scan?.elements || [];
    if (!elements.length) return null;
    selectedIndex = Math.max(0, Math.min(selectedIndex, elements.length - 1));
    return elements[selectedIndex];
  }

  function isActive() {
    return !!activeSession && activeSession.status === 'in_progress';
  }

  function percentDone(count) {
    if (!count || !count.total) return 0;
    return Math.round(((count.pass + count.fail + count.skip) / count.total) * 100);
  }

  function advanceToNextStep() {
    const elements = activeSession?.scan?.elements || [];
    if (!elements.length) return;
    const reviews = sessionStatusMap(activeSession);
    const nextPending = elements.findIndex((item, index) => index > selectedIndex && (!reviews[item.id]?.status || reviews[item.id].status === 'pending'));
    if (nextPending >= 0) {
      selectedIndex = nextPending;
    } else {
      const firstPending = elements.findIndex(item => !reviews[item.id]?.status || reviews[item.id].status === 'pending');
      if (firstPending >= 0) selectedIndex = firstPending;
      else if (selectedIndex < elements.length - 1) selectedIndex += 1;
    }
  }

  function queueSave() {
    if (!activeSession) return;
    activeSession.selectedIndex = selectedIndex;
    activeSession.updatedAt = nowIso();
    saveLocalSession(activeSession);
    setSaveState('Saved locally');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveServer, SAVE_DEBOUNCE_MS);
  }

  function saveNow() {
    if (!activeSession) return;
    activeSession.selectedIndex = selectedIndex;
    activeSession.updatedAt = nowIso();
    saveLocalSession(activeSession);
    clearTimeout(saveTimer);
    setSaveState('Saving debug report...');
    saveServer();
  }

  async function saveServer() {
    if (!activeSession) return;
    try {
      const response = await fetch('/api/review-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: activeSession })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data && data.success && data.file) {
        lastServerFile = data.file;
        activeSession.serverFile = data.file;
        saveLocalSession(activeSession);
        setSaveState('Saved to review-reports/' + data.file);
      }
    } catch (_) {
      setSaveState('Saved locally; server folder unavailable');
    }
  }

  function syncChatInputMode() {
    const input = document.getElementById('ptxAIInput');
    const send = document.getElementById('ptxAISend');
    if (!input || !send) return;
    input.placeholder = 'اسأل عن هذا القسم أو اطلب إجراء آمن...';
    send.title = 'Send';
    input.removeAttribute('data-pilot-review-mode');
    send.removeAttribute('data-pilot-review-mode');
  }

  function setSaveState(text) {
    const node = document.querySelector('.pilot-review-save-state');
    if (node) node.textContent = text || '';
  }

  function addTranscript(role, text, elementId) {
    if (!activeSession) return;
    activeSession.transcript.push({
      at: nowIso(),
      role,
      elementId: elementId || '',
      text: String(text || '')
    });
  }

  function submitStep(status) {
    const element = selectedElement();
    if (!activeSession || !element) return;
    const noteInput = document.getElementById('pilotReviewStepNote') || document.getElementById('pilotReviewNote');
    const noteText = noteInput ? noteInput.value.trim() : '';
    const reviews = sessionStatusMap(activeSession);
    reviews[element.id] = reviews[element.id] || { status: 'pending', notes: [], updatedAt: '' };
    reviews[element.id].status = status;
    reviews[element.id].updatedAt = nowIso();
    if (noteText) {
      reviews[element.id].notes.push({ at: nowIso(), text: noteText, source: 'step_note', status });
      activeSession.notes.push({ at: nowIso(), elementId: element.id, elementLabel: element.label, source: 'step_note', status, text: noteText });
      if (noteInput) noteInput.value = '';
    }
    addTranscript('reviewer', 'Step ' + (selectedIndex + 1) + ': "' + element.label + '" = ' + status + (noteText ? ' - ' + noteText : '') + '.', element.id);
    advanceToNextStep();
    queueSave();
    renderIntoAssistant();
  }

  function markSelected(status) {
    submitStep(status);
  }

  function addNote() {
    const element = selectedElement();
    const input = document.getElementById('pilotReviewStepNote') || document.getElementById('pilotReviewNote');
    const text = input ? input.value.trim() : '';
    if (!activeSession || !element || !text) return;
    const reviews = sessionStatusMap(activeSession);
    reviews[element.id] = reviews[element.id] || { status: 'pending', notes: [], updatedAt: '' };
    reviews[element.id].notes.push({ at: nowIso(), text, source: 'step_comment' });
    reviews[element.id].updatedAt = nowIso();
    activeSession.notes.push({ at: nowIso(), elementId: element.id, elementLabel: element.label, source: 'step_comment', text });
    addTranscript('reviewer', text, element.id);
    input.value = '';
    queueSave();
    renderIntoAssistant();
  }

  function addFreeDebugInputNote(text) {
    const clean = String(text || '').trim();
    if (!activeSession || !clean) return false;
    const element = selectedElement();
    const reviews = sessionStatusMap(activeSession);
    const elementId = element ? element.id : '';
    if (element) {
      reviews[element.id] = reviews[element.id] || { status: 'pending', notes: [], updatedAt: '' };
      reviews[element.id].notes.push({ at: nowIso(), text: clean, source: 'chat_input_debug_mode' });
      reviews[element.id].updatedAt = nowIso();
    }
    activeSession.notes.push({
      at: nowIso(),
      elementId,
      elementLabel: element ? element.label : '',
      source: 'chat_input_debug_mode',
      text: clean
    });
    addTranscript('reviewer', clean, elementId);
    queueSave();
    renderIntoAssistant();
    return true;
  }

  function rescanPage() {
    if (!activeSession) return;
    const api = registry();
    if (!api || typeof api.scanPage !== 'function') return;
    const nextScan = api.scanPage(activeSession.page);
    const reviews = sessionStatusMap(activeSession);
    nextScan.elements.forEach(item => {
      reviews[item.id] = reviews[item.id] || { status: 'pending', notes: [], updatedAt: '' };
    });
    activeSession.scan = nextScan;
    activeSession.pageLabel = nextScan.pageLabel || activeSession.page;
    addTranscript('system', 'Rescanned page and found ' + nextScan.elements.length + ' reviewable controls.');
    selectedIndex = Math.min(selectedIndex, Math.max(0, nextScan.elements.length - 1));
    queueSave();
    renderIntoAssistant();
  }

  function endSession() {
    if (!activeSession) return;
    activeSession.status = 'ended';
    activeSession.updatedAt = nowIso();
    addTranscript('system', 'Pilot Review ended.');
    queueSave();
    renderIntoAssistant();
  }

  function nextElement(delta) {
    const count = activeSession?.scan?.elements?.length || 0;
    if (!count) return;
    selectedIndex = Math.max(0, Math.min(count - 1, selectedIndex + delta));
    renderIntoAssistant();
  }

  function openPageSession(page) {
    const existing = loadPageSession(page || getCurrentReviewPage());
    if (existing) {
      setActiveSession(existing);
      addTranscript('system', 'Resumed saved Pilot Review for ' + (existing.pageLabel || existing.page) + '.');
      renderIntoAssistant();
      return activeSession;
    }
    const session = buildSession(page || getCurrentReviewPage());
    if (!session) {
      injectButton();
      return null;
    }
    setActiveSession(session);
    queueSave();
    renderIntoAssistant();
    return activeSession;
  }

  function resumeOrStart() {
    const loaded = loadActiveSession();
    if (loaded && loaded.status === 'in_progress') {
      setActiveSession(loaded);
      if (loaded.page !== getCurrentReviewPage() && typeof root.switchPage === 'function') {
        root.switchPage(loaded.page);
        setTimeout(renderIntoAssistant, 700);
      } else {
        renderIntoAssistant();
      }
      return activeSession;
    }
    return openPageSession(getCurrentReviewPage());
  }

  function restoreActiveSessionFromStorage() {
    const loaded = loadActiveSession();
    if (!loaded || loaded.status !== 'in_progress') return false;
    setActiveSession(loaded);
    setTimeout(renderIntoAssistant, 120);
    return true;
  }

  function nextPage() {
    const api = registry();
    if (!api || typeof api.listPages !== 'function') return;
    const pages = api.listPages();
    const index = pages.findIndex(item => item.page === activeSession?.page);
    const next = pages[index + 1] || pages[0];
    if (!next) return;
    if (activeSession) {
      addTranscript('system', 'Paused this page and moving to next page: ' + next.page + '.');
      queueSave();
    }
    if (typeof root.switchPage === 'function') {
      root.switchPage(next.page);
      setTimeout(() => openPageSession(next.page), 700);
    }
  }

  function previousReviewPage() {
    const previous = getSessions().find(item => item && item.status === 'in_progress' && item.id !== activeSession?.id);
    if (!previous) return;
    if (activeSession) {
      addTranscript('system', 'Paused this page and returning to previous review page: ' + previous.page + '.');
      queueSave();
    }
    setActiveSession(previous);
    if (typeof root.switchPage === 'function' && previous.page !== getCurrentReviewPage()) {
      root.switchPage(previous.page);
      setTimeout(renderIntoAssistant, 700);
    } else {
      renderIntoAssistant();
    }
  }

  function goActiveReviewPage() {
    if (!activeSession) return;
    if (typeof root.switchPage === 'function' && activeSession.page !== getCurrentReviewPage()) {
      root.switchPage(activeSession.page);
      setTimeout(renderIntoAssistant, 700);
    } else {
      renderIntoAssistant();
    }
  }

  function startCurrentPageSession() {
    return openPageSession(getCurrentReviewPage());
  }

  function renderIntoAssistant() {
    injectButton();
    renderReviewDock();
    syncChatInputMode();
  }

  function renderReviewDock() {
    const dock = document.getElementById('pilotReviewDock');
    const body = document.getElementById('pilotReviewDockBody');
    const launcher = document.getElementById('pilotReviewLauncher');
    if (dock) dock.classList.toggle('open', panelOpen);
    if (launcher) launcher.classList.toggle('active', isActive() || panelOpen);
    if (!body) return;
    body.innerHTML = renderDebugMode();
    wireHost(body);
  }

  function renderSummaryPanel() {
    const detailsHost = document.getElementById('ptxAIProjectDetails');
    let host = document.getElementById('pilotReviewPanel');
    if (!host && detailsHost) {
      host = document.createElement('div');
      host.id = 'pilotReviewPanel';
      detailsHost.appendChild(host);
    }
    if (!host) return;
    host.innerHTML = renderMiniPanel();
    wireHost(host);
  }

  function renderMiniPanel() {
    if (!activeSession) {
      return '<div class="pilot-review-mini"><span>اضغط Debug أو ابدأ المراجعة حتى تتحول المحادثة إلى خطوات مراجعة.</span></div>';
    }
    const count = totals(activeSession);
    const saveText = lastServerFile || activeSession.serverFile ? 'Saved to review-reports/' + esc(lastServerFile || activeSession.serverFile) : 'Saved locally';
    return `
      <div class="pilot-review-mini">
        <div>
          <b>${esc(activeSession.pageLabel || activeSession.page)}</b>
          <span>${percentDone(count)}% - ${count.pending} متبقي من ${count.total}</span>
        </div>
        <div class="pilot-review-mini-actions">
          <button type="button" class="pilot-review-btn ghost" data-pilot-action="rescan"><i class="fa-solid fa-rotate"></i> Rescan</button>
          <button type="button" class="pilot-review-btn" data-pilot-action="save"><i class="fa-solid fa-floppy-disk"></i> Save</button>
          <button type="button" class="pilot-review-btn ghost" data-pilot-action="previous-page"><i class="fa-solid fa-backward-step"></i> Previous page</button>
          <button type="button" class="pilot-review-btn ghost" data-pilot-action="next-page"><i class="fa-solid fa-forward-step"></i> Next page</button>
          <span class="pilot-review-save-state">${saveText}</span>
        </div>
      </div>`;
  }

  function renderSession() {
    return renderDebugMode();
  }

  function renderDebugMode() {
    if (!activeSession) {
      return '<div class="pilot-debug-mode"><div class="pilot-debug-question"><small>Manual Debug</small><h3>ابدأ جلسة مراجعة حتى تظهر الخطوات هنا.</h3></div></div>';
    }
    const elements = activeSession.scan?.elements || [];
    const count = totals(activeSession);
    const saveText = lastServerFile || activeSession.serverFile ? 'Saved to review-reports/' + esc(lastServerFile || activeSession.serverFile) : 'Saved locally';
    const currentPage = getCurrentReviewPage();
    if (activeSession.page && activeSession.page !== currentPage) return renderPageMismatch(saveText, currentPage);
    if (!elements.length) return renderEmptyDebug(saveText);
    if (count.total && count.pending === 0) return renderCompletion(count, saveText);
    const item = selectedElement();
    const review = item ? sessionStatusMap(activeSession)[item.id] || {} : {};
    return item ? renderCurrentElement(item, review, selectedIndex + 1, elements.length, count, saveText) : renderEmptyDebug(saveText);
  }

  function renderCurrentElement(item, review, currentNumber, total, count, saveText) {
    const prompts = Array.isArray(item.reviewPrompts) && item.reviewPrompts.length
      ? item.reviewPrompts
      : [
          'اضغط أو جرّب هذا العنصر على الصفحة.',
          'تأكد أن الشكل واضح، وأن الضغط أو الإدخال يعطي نتيجة صحيحة.',
          'إذا توجد مشكلة، اكتب تعليقك ثم اختر "مشكلة".'
        ];
    const notes = Array.isArray(review.notes) ? review.notes : [];
    const timeline = Array.isArray(activeSession.notes) ? activeSession.notes.slice(-10).reverse() : [];
    const status = review.status && review.status !== 'pending' ? review.status : 'pending';
    return `
      <div class="pilot-debug-mode" dir="auto">
        <div class="pilot-debug-top">
          <div>
            <small>Manual Debug Mode</small>
            <b>${esc(activeSession.pageLabel || activeSession.page)}</b>
          </div>
          <div class="pilot-debug-progress">
            <span>${currentNumber} / ${total}</span>
            <b>${percentDone(count)}%</b>
          </div>
        </div>

        <div class="pilot-debug-question">
          <small>السؤال الحالي</small>
          <h3>افحص: ${esc(item.label || item.type)}</h3>
          <p>اتبع الخطوات، جرّب العنصر فعلياً، ثم اختَر النتيجة من الأسفل. أي كتابة هنا أو في مربع الشات تحفظ داخل تقرير Debug لهذه الخطوة.</p>
          <div class="pilot-debug-target">
            <span>${esc(item.type)}${item.disabled ? ' - disabled' : ''}</span>
            <code>${esc(item.selectorHint || item.id)}</code>
            <em>${esc(status)}</em>
          </div>
          <ol>
            ${prompts.map(prompt => '<li>' + esc(prompt) + '</li>').join('')}
          </ol>
        </div>

        <div class="pilot-debug-answer">
          <div class="pilot-debug-options" aria-label="Debug step options">
            <button type="button" class="pilot-review-btn pass" data-pilot-status="pass"><i class="fa-solid fa-check"></i> تمام</button>
            <button type="button" class="pilot-review-btn fail" data-pilot-status="fail"><i class="fa-solid fa-triangle-exclamation"></i> مشكلة</button>
            <button type="button" class="pilot-review-btn skip" data-pilot-status="skip"><i class="fa-solid fa-forward"></i> تخطي</button>
          </div>
          <textarea id="pilotReviewStepNote" placeholder="اكتب تعليق لهذه الخطوة إذا تحتاج... ثم اختر تمام / مشكلة / تخطي."></textarea>
          <div class="pilot-debug-toolbar">
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="prev"><i class="fa-solid fa-chevron-left"></i> السابق</button>
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="add-note"><i class="fa-solid fa-note-sticky"></i> احفظ تعليق فقط</button>
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="next">التالي <i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="save"><i class="fa-solid fa-floppy-disk"></i> حفظ التقرير</button>
          </div>
          ${notes.length ? `<div class="pilot-debug-notes"><b>تعليقات هذه الخطوة (${notes.length})</b>${notes.map(note => `<p><span>${esc(shortTime(note.at))} - ${esc(noteSourceLabel(note.source))}</span>${esc(note.text || '')}</p>`).join('')}</div>` : ''}
          ${timeline.length ? `<div class="pilot-debug-timeline"><b>آخر تعليقات الجلسة</b>${timeline.map(note => `<p><span>${esc(shortTime(note.at))} - ${esc(note.elementLabel || 'General')}</span>${esc(note.text || '')}</p>`).join('')}</div>` : ''}
          <div class="pilot-review-save-state">${saveText}</div>
        </div>

        <div class="pilot-debug-footer">
          <button type="button" class="pilot-review-btn ghost" data-pilot-action="rescan"><i class="fa-solid fa-rotate"></i> Rescan</button>
          <button type="button" class="pilot-review-btn ghost" data-pilot-action="previous-page"><i class="fa-solid fa-backward-step"></i> Previous page</button>
          <button type="button" class="pilot-review-btn ghost" data-pilot-action="next-page"><i class="fa-solid fa-forward-step"></i> Next page</button>
          <button type="button" class="pilot-review-btn ghost" data-pilot-action="end"><i class="fa-solid fa-flag-checkered"></i> End</button>
        </div>
      </div>`;
  }

  function renderEmpty() {
    return '<div class="pilot-review-current"><div class="pilot-review-hint">No visible reviewable controls were found on this page. Try Rescan after opening a tab or section.</div></div>';
  }

  function renderList(elements) {
    return `
      <div class="pilot-review-list">
        <div class="pilot-review-meta">Checklist</div>
        <div class="pilot-review-items">
          ${elements.map((item, index) => {
            const status = (sessionStatusMap(activeSession)[item.id] || {}).status || 'pending';
            return `<button type="button" class="pilot-review-item ${index === selectedIndex ? 'active' : ''}" data-pilot-index="${index}">
              <i class="pilot-review-dot ${esc(status)}"></i>
              <span>${esc(item.label || item.type)}</span>
              <small>${esc(item.type)}</small>
            </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderPageMismatch(saveText, currentPage) {
    return `
      <div class="pilot-debug-mode">
        <div class="pilot-debug-question">
          <small>تنبيه مراجعة</small>
          <h3>الجلسة محفوظة على صفحة أخرى.</h3>
          <p>جلسة Debug الحالية تخص صفحة <b>${esc(activeSession.pageLabel || activeSession.page)}</b>، وأنت الآن على صفحة <b>${esc(currentPage)}</b>. ماكو شيء انلغى؛ اختَر هل ترجع للصفحة السابقة أو تبدأ مراجعة لهذه الصفحة.</p>
        </div>
        <div class="pilot-debug-answer">
          <div class="pilot-debug-options">
            <button type="button" class="pilot-review-btn pass" data-pilot-action="go-active-page"><i class="fa-solid fa-arrow-rotate-left"></i> رجّعني لصفحة المراجعة</button>
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="start-current-page"><i class="fa-solid fa-plus"></i> ابدأ مراجعة لهذه الصفحة</button>
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="previous-page"><i class="fa-solid fa-backward-step"></i> صفحة مراجعة سابقة</button>
          </div>
          <div class="pilot-review-save-state">${saveText}</div>
        </div>
      </div>`;
  }

  function renderEmptyDebug(saveText) {
    return `
      <div class="pilot-debug-mode">
        <div class="pilot-debug-question">
          <small>Manual Debug Mode</small>
          <h3>ماكو عناصر واضحة للمراجعة بهذه الصفحة.</h3>
          <p>افتح تبويب أو جزء داخل الصفحة، ثم اضغط Rescan حتى يبني النظام خطوات المراجعة.</p>
        </div>
        <div class="pilot-debug-answer">
          <div class="pilot-debug-options">
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="rescan"><i class="fa-solid fa-rotate"></i> Rescan</button>
            <button type="button" class="pilot-review-btn" data-pilot-action="save"><i class="fa-solid fa-floppy-disk"></i> Save debug</button>
          </div>
          <div class="pilot-review-save-state">${saveText}</div>
        </div>
      </div>`;
  }

  function renderCompletion(count, saveText) {
    return `
      <div class="pilot-debug-mode is-complete">
        <div class="pilot-debug-question">
          <small>اكتملت الصفحة</small>
          <h3>خلصت مراجعة ${esc(activeSession.pageLabel || activeSession.page)}.</h3>
          <p>تم حفظ ${count.pass + count.fail + count.skip} خطوة من أصل ${count.total}. الآن احفظ التقرير أو انتقل للصفحة التالية.</p>
        </div>
        <div class="pilot-debug-answer">
          <div class="pilot-debug-options">
            <button type="button" class="pilot-review-btn" data-pilot-action="save"><i class="fa-solid fa-floppy-disk"></i> حفظ التقرير</button>
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="previous-page"><i class="fa-solid fa-backward-step"></i> الصفحة السابقة</button>
            <button type="button" class="pilot-review-btn pass" data-pilot-action="next-page"><i class="fa-solid fa-forward-step"></i> نروح للصفحة التالية</button>
            <button type="button" class="pilot-review-btn ghost" data-pilot-action="end"><i class="fa-solid fa-flag-checkered"></i> إنهاء</button>
          </div>
          <div class="pilot-review-save-state">${saveText}</div>
        </div>
      </div>`;
  }

  function wireHost(host) {
    host.querySelectorAll('[data-pilot-status]').forEach(btn => {
      btn.addEventListener('click', () => markSelected(btn.getAttribute('data-pilot-status')));
    });
    host.querySelectorAll('[data-pilot-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-pilot-action');
        if (action === 'add-note') addNote();
        else if (action === 'rescan') rescanPage();
        else if (action === 'save') saveNow();
        else if (action === 'next-page') nextPage();
        else if (action === 'previous-page') previousReviewPage();
        else if (action === 'go-active-page') goActiveReviewPage();
        else if (action === 'start-current-page') startCurrentPageSession();
        else if (action === 'end') endSession();
        else if (action === 'prev') nextElement(-1);
        else if (action === 'next') nextElement(1);
      });
    });
    host.querySelectorAll('[data-pilot-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedIndex = Number(btn.getAttribute('data-pilot-index')) || 0;
        renderIntoAssistant();
      });
    });
  }

  function injectButton() {
    if (document.getElementById('pilotReviewLauncher')) return;
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.id = 'pilotReviewLauncher';
    launcher.innerHTML = '<i class="fa-solid fa-clipboard-check"></i><span>Review</span>';
    launcher.title = 'Open Pilot Review';
    document.body.appendChild(launcher);

    const dock = document.createElement('section');
    dock.id = 'pilotReviewDock';
    dock.setAttribute('aria-label', 'Pilot Review');
    dock.innerHTML = `
      <div class="pilot-review-dock-head">
        <div>
          <small>Pilot Review</small>
          <b>مراجعة البايلوت اليدوية</b>
        </div>
        <button type="button" id="pilotReviewDockClose" title="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div id="pilotReviewDockBody"></div>`;
    document.body.appendChild(dock);

    launcher.addEventListener('click', () => {
      panelOpen = true;
      resumeOrStart();
      renderReviewDock();
    });
    dock.querySelector('#pilotReviewDockClose').addEventListener('click', () => {
      panelOpen = false;
      renderReviewDock();
    });
    renderReviewDock();
  }

  function shouldCaptureChatInput() {
    return false;
  }

  function captureChatInput() {
    const input = document.getElementById('ptxAIInput');
    const text = input ? input.value.trim() : '';
    if (!text) return false;
    const saved = addFreeDebugInputNote(text);
    if (saved && input) input.value = '';
    return saved;
  }

  function installChatCapture() {
    if (root.__pilotReviewChatCaptureInstalled) return;
    root.__pilotReviewChatCaptureInstalled = true;
    document.addEventListener('click', event => {
      if (!shouldCaptureChatInput()) return;
      const send = event.target && event.target.closest ? event.target.closest('#ptxAISend') : null;
      if (!send) return;
      if (!captureChatInput()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);
    document.addEventListener('keydown', event => {
      if (!shouldCaptureChatInput()) return;
      if (!event.target || event.target.id !== 'ptxAIInput') return;
      if (event.key !== 'Enter' || event.shiftKey) return;
      if (!captureChatInput()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);
    document.addEventListener('click', event => {
      const target = event.target && event.target.closest ? event.target.closest('#ptxAIReviewStart, #ptxAIReviewResume') : null;
      if (!target) return;
      resumeOrStart();
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function installObserver() {
    injectButton();
    installChatCapture();
    restoreActiveSessionFromStorage();
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const api = {
    open: resumeOrStart,
    start: openPageSession,
    rescan: rescanPage,
    end: endSession,
    getActive: () => activeSession,
    getSessions,
    isActive,
    render: renderIntoAssistant,
    renderSummaryPanel,
    renderDebugMode,
    wireDebugMode: wireHost,
    syncInputMode: syncChatInputMode,
    summary: () => summarizeSession()
  };

  root.OctagonPilotReviewSession = api;
  root.PilotReviewSession = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installObserver, { once: true });
  } else {
    installObserver();
  }
})(window);
