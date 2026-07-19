/**
 * OCTAGON OMNISYSTEM - modules/jarvis-orb.js
 *
 * The Omni floating orb. A living AI ball that turns the old flat "Omni Mode"
 * button into something you can watch work:
 *   - idle:   a small breathing ball you can DRAG anywhere; it remembers where.
 *   - press:  it flies BIG to the centre of the screen and "wakes up"
 *   - listening / executing: it docks to the screen edge with a caption pill so
 *     you can see what it heard and what it is doing while the app navigates.
 * It also carries a small AR/EN chip to switch the language Omni listens in.
 *
 * Fully additive. Loads AFTER app.js + omni-ai-assistant.js. Reuses only public
 * globals (window.ptxAIAssistant). Never modifies existing markup or core logic.
 * The omni-ai-assistant lifecycle calls window.JarvisOrb?.* hooks; every method
 * is null-safe so the assistant works with or without this module present.
 */
(function () {
  'use strict';

  var el = null;          // #jarvisOrb
  var captionEl = null;   // caption text node
  var kickerEl = null;    // caption kicker
  var langChip = null;    // AR/EN listen-language chip
  var dockTimer = null;
  var savedPos = null;    // { left, top } for the idle dock, persisted
  var suppressClick = false;

  function lang() {
    try { return (typeof getLang === 'function' ? getLang() : (window.currentLang || 'ar')); }
    catch (_) { return 'ar'; }
  }
  function t(ar, en) { return lang() === 'en' ? en : ar; }

  function loadPos() {
    try {
      var raw = localStorage.getItem('jarvisOrbPos');
      if (raw) { var p = JSON.parse(raw); if (p && typeof p.left === 'number') savedPos = p; }
    } catch (_) {}
  }
  function savePos() {
    try { localStorage.setItem('jarvisOrbPos', JSON.stringify(savedPos)); } catch (_) {}
  }
  function isParked() { return el && !el.classList.contains('is-center') && !el.classList.contains('is-side'); }

  // Markup for the alternative "glass" orb material (Settings -> تصميم أومني).
  // Four lobes, each three nested wrappers deep (one CSS rotation axis per
  // wrapper, see jarvis-orb.css) so they tumble in true 3D instead of a flat
  // spin. Always rendered but display:none unless body[data-orb-style="glass"]
  // is set - CSS alone switches between this and the classic conic ball,
  // so no DOM rebuild is needed when the setting changes.
  function jorbGlassMarkup() {
    return ['jgl-p1', 'jgl-p2', 'jgl-p3', 'jgl-p4'].map(function (cls) {
      return '<span class="jgl-lobe ' + cls + '"><span class="jgl-ax"><span class="jgl-ay"><span class="jgl-az">' +
        '<span class="jgl-face"></span>' +
        '</span></span></span></span>';
    }).join('') + '<span class="jgl-hot"></span>';
  }

  // Apply the saved idle position as inline styles (only meaningful while parked).
  function applyIdlePos() {
    if (!el) return;
    if (savedPos) {
      el.style.left = savedPos.left + 'px';
      el.style.top = savedPos.top + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else {
      el.style.left = el.style.top = el.style.right = el.style.bottom = '';
    }
  }
  // Hand positioning back to the CSS state classes (center / side).
  function clearInlinePos() {
    if (!el) return;
    el.style.left = el.style.top = el.style.right = el.style.bottom = '';
  }

  function installDrag() {
    if (!el) return;
    var drag = null;
    function down(e) {
      if (!isParked()) return;           // only drag from the idle dock
      var pt = e.touches ? e.touches[0] : e;
      var r = el.getBoundingClientRect();
      drag = { x: pt.clientX, y: pt.clientY, left: r.left, top: r.top, moved: false };
    }
    function move(e) {
      if (!drag) return;
      var pt = e.touches ? e.touches[0] : e;
      var dx = pt.clientX - drag.x, dy = pt.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      var sz = el.offsetWidth || 64;
      var nl = Math.min(Math.max(8, drag.left + dx), window.innerWidth - sz - 8);
      var nt = Math.min(Math.max(8, drag.top + dy), window.innerHeight - sz - 8);
      el.style.left = nl + 'px'; el.style.top = nt + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      if (e.cancelable) e.preventDefault();
    }
    function up() {
      if (!drag) return;
      if (drag.moved) {
        var r = el.getBoundingClientRect();
        savedPos = { left: Math.round(r.left), top: Math.round(r.top) };
        savePos();
        suppressClick = true;            // don't fire Omni toggle after a drag
        setTimeout(function () { suppressClick = false; }, 60);
      }
      drag = null;
    }
    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    el.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }

  function syncLangChip() {
    if (!langChip) return;
    var fam = 'ar';
    try {
      if (window.ptxAIAssistant && window.ptxAIAssistant.getJarvisListenFamily) {
        fam = window.ptxAIAssistant.getJarvisListenFamily();
      }
    } catch (_) {}
    langChip.textContent = fam === 'en' ? 'EN' : 'AR';
    langChip.title = t('لغة استماع أومني — اضغط للتبديل', 'Omni listening language — tap to switch');
  }

  function mount() {
    if (document.getElementById('jarvisOrb')) return;
    loadPos();
    el = document.createElement('button');
    el.id = 'jarvisOrb';
    el.type = 'button';
    el.setAttribute('aria-label', t('مساعد أومني الصوتي', 'Omni voice assistant'));
    el.title = t('اضغط للتحدث — اسحب لتحريكه', 'Tap to talk — drag to move');
    el.innerHTML =
      '<span class="jorb-ring"></span>' +
      '<span class="jorb-ring"></span>' +
      '<span class="jorb-ring"></span>' +
      '<span class="jorb-core"><span class="jorb-glass" aria-hidden="true">' + jorbGlassMarkup() + '</span><i class="fa-solid fa-microphone-lines"></i></span>' +
      '<span class="jorb-lang" role="button" tabindex="0">AR</span>' +
      '<span class="jorb-caption"><span class="jorb-caption-kicker"></span><span class="jorb-caption-text"></span></span>';
    document.body.appendChild(el);
    captionEl = el.querySelector('.jorb-caption-text');
    kickerEl = el.querySelector('.jorb-caption-kicker');
    langChip = el.querySelector('.jorb-lang');
    applyIdlePos();
    installDrag();
    syncLangChip();

    el.addEventListener('click', function () {
      if (suppressClick) return;
      try {
        if (window.ptxAIAssistant && typeof window.ptxAIAssistant.jarvis === 'function') {
          window.ptxAIAssistant.jarvis();
        } else if (typeof window.loadOctagonAIAssistant === 'function') {
          window.loadOctagonAIAssistant().then(function (assistant) {
            if (assistant && typeof assistant.jarvis === 'function') assistant.jarvis();
            else if (assistant && typeof assistant.open === 'function') assistant.open();
          }).catch(function () {
            if (typeof window.toggleAIChat === 'function') window.toggleAIChat();
          });
        } else if (typeof window.toggleAIChat === 'function') {
          window.toggleAIChat();
        }
      } catch (_) {}
    });

    // Language chip toggles AR/EN without triggering the orb's click.
    langChip.addEventListener('click', function (e) {
      e.stopPropagation();
      try {
        if (window.ptxAIAssistant && window.ptxAIAssistant.toggleJarvisListenLang) {
          window.ptxAIAssistant.toggleJarvisListenLang();
        }
      } catch (_) {}
      syncLangChip();
    });
  }

  function clearModes() {
    if (!el) return;
    el.classList.remove('mode-listening', 'mode-thinking', 'mode-speaking', 'mode-executing');
  }

  var Orb = {
    // Press -> fly big to the middle and wake up.
    wake: function () {
      if (!el) mount();
      if (!el) return;
      clearTimeout(dockTimer);
      clearInlinePos();
      el.classList.remove('is-side');
      el.classList.add('is-center');
      clearModes();
      el.classList.add('mode-listening');
      this.say(t('أستيقظ...', 'Waking up...'), t('أومني جاهز للاستماع', 'Omni is getting ready'));
    },
    // Settle to the side edge so you can watch it work.
    dock: function () {
      if (!el) return;
      clearInlinePos();
      el.classList.remove('is-center');
      el.classList.add('is-side');
    },
    // Back to the small idle corner ball (restores the dragged position).
    sleep: function () {
      if (!el) return;
      clearTimeout(dockTimer);
      el.classList.remove('is-center', 'is-side');
      clearModes();
      applyIdlePos();
      var icon = el.querySelector('.jorb-core i');
      if (icon) icon.className = 'fa-solid fa-microphone-lines';
    },
    // mode: 'listening' | 'thinking' | 'speaking' | 'executing' | 'idle'
    setMode: function (mode) {
      if (!el) return;
      clearModes();
      if (mode && mode !== 'idle') el.classList.add('mode-' + mode);
      // When actively listening or executing, make sure it is docked to the side
      // (the centre pose is only the brief "waking up" moment).
      if (mode === 'listening' || mode === 'executing') {
        if (el.classList.contains('is-center')) {
          clearTimeout(dockTimer);
          dockTimer = setTimeout(function () { Orb.dock(); }, 850);
        } else if (!el.classList.contains('is-side')) {
          Orb.dock();
        }
      }
      var icon = el.querySelector('.jorb-core i');
      if (icon) {
        icon.className = 'fa-solid ' + (
          mode === 'thinking' ? 'fa-brain' :
          mode === 'speaking' ? 'fa-volume-high' :
          mode === 'executing' ? 'fa-bolt' :
          'fa-microphone-lines'
        );
      }
    },
    // Caption pill: what it heard / what it is doing.
    say: function (kicker, text) {
      if (!el) return;
      if (typeof text === 'undefined') { text = kicker; kicker = ''; }
      if (kickerEl) kickerEl.textContent = kicker || '';
      if (captionEl) captionEl.textContent = text || '';
    },
    syncLang: syncLangChip
  };

  window.JarvisOrb = Orb;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
