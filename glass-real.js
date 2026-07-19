// ═══════════════════════════════════════════════════
// REAL GLASS EFFECT - Apple iOS Style
// ═══════════════════════════════════════════════════

function initRealGlassEffect() {
  // Get all glass cards
  const glassCards = document.querySelectorAll('.glass-card');
  
  glassCards.forEach(card => {
    // Skip if already initialized
    if (card.querySelector('.glass-filter')) return;
    
    // Create glass layers
    const glassFilter = document.createElement('div');
    glassFilter.className = 'glass-filter';
    
    const glassOverlay = document.createElement('div');
    glassOverlay.className = 'glass-overlay';
    
    const glassSpecular = document.createElement('div');
    glassSpecular.className = 'glass-specular';
    
    // Insert layers before existing content
    card.insertBefore(glassFilter, card.firstChild);
    card.insertBefore(glassOverlay, card.firstChild.nextSibling);
    card.insertBefore(glassSpecular, card.firstChild.nextSibling.nextSibling);
    
    // Wrap existing content
    const content = document.createElement('div');
    content.className = 'glass-content';
    
    while (card.children.length > 3) {
      content.appendChild(card.children[3]);
    }
    
    card.appendChild(content);
    
    // Add mouse effects
    addGlassMouseEffects(card);
  });
}

function addGlassMouseEffects(card) {
  const specular = card.querySelector('.glass-specular');
  const svg = document.querySelector('svg[style*="display: none"] filter[id="glass-distortion"]');
  
  card.addEventListener('mousemove', function(e) {
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Add specular highlight at mouse position
    if (specular) {
      specular.style.background = `radial-gradient(
        circle at ${x}px ${y}px,
        rgba(255,255,255,0.25) 0%,
        rgba(255,255,255,0.1) 20%,
        rgba(255,255,255,0.02) 40%,
        transparent 70%
      )`;
    }
    
    // Update SVG filter scale based on mouse
    if (svg) {
      const displacement = svg.querySelector('feDisplacementMap');
      if (displacement) {
        const scaleX = (x / rect.width) * 100;
        const scaleY = (y / rect.height) * 100;
        const newScale = Math.min(scaleX, scaleY) + 40;
        displacement.setAttribute('scale', Math.min(newScale, 120).toString());
      }
    }
  });
  
  card.addEventListener('mouseleave', function() {
    if (specular) {
      specular.style.background = 'none';
    }
    
    // Reset filter
    if (svg) {
      const displacement = svg.querySelector('feDisplacementMap');
      if (displacement) {
        displacement.setAttribute('scale', '77');
      }
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRealGlassEffect);
} else {
  initRealGlassEffect();
}

// Re-initialize when theme changes
window.addEventListener('themechange', initRealGlassEffect);
