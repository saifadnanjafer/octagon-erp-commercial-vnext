/**
 * OCTAGON OMNISYSTEM - modules/command-palette.js
 *
 * GO 16 module + an "above Odoo/SAP" UX upgrade: a global Command Palette.
 * Press Ctrl+K (or Cmd+K) anywhere to instantly jump to any of the 31 pages
 * or hand a question to the AI assistant.
 *
 * Fully additive: loads AFTER app.js, injects its own overlay, and reuses
 * existing globals only (getOctagonPageTruthRegistry, switchPage, ptxAIAssistant).
 * Never modifies existing markup or core logic.
 */
(function () {
  'use strict';

  const state = { open: false, items: [], filtered: [], sel: 0, query: '' };

  function readPages() {
    let rows = [];
    try {
      if (typeof getOctagonPageTruthRegistry === 'function') rows = getOctagonPageTruthRegistry() || [];
      else if (typeof getPentagonPageTruthRegistry === 'function') rows = getPentagonPageTruthRegistry() || [];
    } catch (_) {}
    const pages = rows.map(r => {
      let ar = '';
      try { const nav = document.getElementById(r.navId); if (nav) ar = (nav.textContent || '').trim().replace(/\s+/g, ' '); } catch (_) {}
      return { type: 'page', page: r.page, label: ar || r.label, en: r.label || '', section: r.section || '' };
    });
    // Fallback: if the registry isn't available, scan the sidebar nav directly.
    if (!pages.length) {
      document.querySelectorAll('[id^="nav"]').forEach(nav => {
        const label = (nav.textContent || '').trim().replace(/\s+/g, ' ');
        if (label) pages.push({ type: 'page', page: nav.id.replace(/^nav/, '').toLowerCase(), label, en: '', section: '' });
      });
    }
    return pages;
  }

  function esc(s) {
    try { if (typeof escapeHtml === 'function') return escapeHtml(s); } catch (_) {}
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function compute() {
    const q = state.query.trim().toLowerCase();
    const pages = state.items;
    let list = q
      ? pages.filter(p => (p.label + ' ' + (p.en || '') + ' ' + (p.page || '')).toLowerCase().includes(q))
      : pages.slice();
    // Always offer an "ask the AI" action when there's a query.
    if (q) list = [{ type: 'ai', label: 'اسأل المساعد الذكي: "' + state.query.trim() + '"', section: 'AI' }, ...list];
    state.filtered = list;
    if (state.sel >= list.length) state.sel = Math.max(0, list.length - 1);
  }

  function render() {
    const list = document.getElementById('ptxCmdList');
    if (!list) return;
    if (!state.filtered.length) {
      list.innerHTML = '<div class="ptxcmd-empty">لا توجد نتائج</div>';
      return;
    }
    list.innerHTML = state.filtered.map((it, i) => {
      const icon = it.type === 'ai' ? '🤖' : it.type === 'action' ? '⚡' : '📄';
      const sect = it.section ? `<span class="ptxcmd-sect">${esc(it.section)}</span>` : '';
      return `<div class="ptxcmd-row ${i === state.sel ? 'sel' : ''}" data-i="${i}"><span class="ptxcmd-ic">${icon}</span><span class="ptxcmd-lbl">${esc(it.label)}</span>${sect}</div>`;
    }).join('');
    const selEl = list.querySelector('.ptxcmd-row.sel');
    if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' });
  }

  function activate(i) {
    const it = state.filtered[i];
    if (!it) return;
    close();
    if (it.type === 'ai') {
      try {
        if (window.ptxAIAssistant && typeof window.ptxAIAssistant.open === 'function') {
          window.ptxAIAssistant.open();
          setTimeout(() => {
            const input = document.getElementById('ptxAIInput');
            if (input) { input.value = state.query.trim(); input.focus(); }
          }, 80);
        }
      } catch (_) {}
      return;
    }
    if (it.type === 'action') { try { if (typeof it.run === 'function') it.run(); } catch (_) {} return; }
    try { if (typeof switchPage === 'function') switchPage(it.page); } catch (_) {}
  }

  // Single-entry rule: the palette stays locked behind the one login window.
  function loggedOut() {
    const ov = document.getElementById('loginOverlay');
    try { return !!(ov && getComputedStyle(ov).display !== 'none'); } catch (_) { return false; }
  }

  function toast(m, t) { try { if (typeof showToast === 'function') return showToast(m, t); } catch (_) {} }

  function doBackup() {
    toast('💾 جارٍ إنشاء نسخة احتياطية...', 'info');
    fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'manual' }) })
      .then(r => r.json())
      .then(d => toast(d && d.success ? ('💾 تم إنشاء نسخة احتياطية: ' + d.file) : 'تعذّر إنشاء النسخة الاحتياطية', d && d.success ? 'success' : 'warning'))
      .catch(() => toast('تعذّر الاتصال بالخادم لإنشاء نسخة احتياطية', 'warning'));
  }

  // Action commands (not just navigation) — turns Ctrl+K into a command center.
  function getActions() {
    return [
      { type: 'action', label: '🔔 تحتاج انتباهك', section: 'إجراء', run: () => { try { if (window.ptxAIAssistant && window.ptxAIAssistant.attention) window.ptxAIAssistant.attention(); else if (window.ptxAIAssistant) window.ptxAIAssistant.open(); } catch (_) {} } },
      { type: 'action', label: '🤖 افتح المساعد الذكي', section: 'إجراء', run: () => { try { if (window.ptxAIAssistant) window.ptxAIAssistant.open(); } catch (_) {} } },
      { type: 'action', label: '💾 نسخة احتياطية الآن', section: 'إجراء', run: doBackup },
      { type: 'action', label: '🔄 تحديث الصفحة', section: 'إجراء', run: () => location.reload() }
    ];
  }

  function open() {
    if (loggedOut()) return;
    state.open = true;
    state.items = [...getActions(), ...readPages()];
    state.query = '';
    state.sel = 0;
    compute();
    const ov = document.getElementById('ptxCmdOverlay');
    if (ov) ov.classList.add('open');
    const input = document.getElementById('ptxCmdInput');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 30); }
    render();
  }
  function close() {
    state.open = false;
    const ov = document.getElementById('ptxCmdOverlay');
    if (ov) ov.classList.remove('open');
  }

  function mount() {
    if (document.getElementById('ptxCmdOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'ptxCmdOverlay';
    ov.innerHTML = `
      <div class="ptxcmd-box" role="dialog" aria-label="لوحة الأوامر">
        <div class="ptxcmd-input-wrap">
          <span class="ptxcmd-input-ic">⌘</span>
          <input id="ptxCmdInput" type="text" placeholder="اقفز إلى صفحة أو اسأل الذكاء الاصطناعي..." autocomplete="off" />
          <kbd>⎋</kbd>
        </div>
        <div id="ptxCmdList" class="ptxcmd-list"></div>
        <div class="ptxcmd-foot"><span>↑↓ تنقّل</span><span>↵ فتح</span><span>⎋ إغلاق</span></div>
      </div>`;
    document.body.appendChild(ov);

    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    const input = ov.querySelector('#ptxCmdInput');
    input.addEventListener('input', () => { state.query = input.value; state.sel = 0; compute(); render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); state.sel = Math.min(state.filtered.length - 1, state.sel + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); state.sel = Math.max(0, state.sel - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); activate(state.sel); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    ov.querySelector('#ptxCmdList').addEventListener('click', e => {
      const row = e.target.closest('.ptxcmd-row');
      if (row) activate(Number(row.getAttribute('data-i')));
    });

    // Global hotkey: Ctrl+K / Cmd+K toggles the palette.
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        state.open ? close() : open();
      }
    });

    // One-time discovery hint (only after login, shown once ever).
    try {
      if (!localStorage.getItem('ptxCmdHintShown')) {
        setTimeout(() => {
          if (!loggedOut()) {
            toast('💡 اضغط Ctrl+K للبحث، التنقّل، والأوامر السريعة (نسخة احتياطية، المساعد، تحتاج انتباهك)', 'info');
            try { localStorage.setItem('ptxCmdHintShown', '1'); } catch (_) {}
          }
        }, 5000);
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.ptxPalette = { open, close };
})();
