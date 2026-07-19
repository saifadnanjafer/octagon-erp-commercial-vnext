// ─── Advanced Glass Effect Module ───

const glassEffectHandlers = new Map();

function initGlassEffects() {
  if (!document.body.classList.contains('theme-glass')) return;

  const glassElements = document.querySelectorAll(
    '.glass-card, .sidebar, .page-header, .config-bar, .emp-selector-bar, .table-container'
  );

  glassElements.forEach(element => {
    // Prevent duplicate listeners
    if (glassEffectHandlers.has(element)) {
      return;
    }

    const handlers = {
      move: (e) => handleGlassMouseMove(e, element),
      leave: () => handleGlassMouseLeave(element)
    };

    element.addEventListener('mousemove', handlers.move);
    element.addEventListener('mouseleave', handlers.leave);

    glassEffectHandlers.set(element, handlers);
  });
}

function handleGlassMouseMove(e, element) {
  const rect = element.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const percentX = (x / rect.width) * 100;
  const percentY = (y / rect.height) * 100;

  // Update filter distortion
  const filter = document.querySelector('#glass-distortion');
  if (filter) {
    const displacement = filter.querySelector('feDisplacementMap');
    if (displacement) {
      const scale = Math.min(percentX, percentY) / 2;
      const newScale = Math.max(30, Math.min(100, scale + 40));
      displacement.setAttribute('scale', newScale.toString());
    }
  }
}

function handleGlassMouseLeave(element) {
  const filter = document.querySelector('#glass-distortion');
  if (filter) {
    const displacement = filter.querySelector('feDisplacementMap');
    if (displacement) {
      displacement.setAttribute('scale', '77');
    }
  }
}

function cleanupGlassEffects() {
  glassEffectHandlers.forEach((handlers, element) => {
    element.removeEventListener('mousemove', handlers.move);
    element.removeEventListener('mouseleave', handlers.leave);
  });
  glassEffectHandlers.clear();
}

// Export for use
window.initGlassEffects = initGlassEffects;
window.cleanupGlassEffects = cleanupGlassEffects;
