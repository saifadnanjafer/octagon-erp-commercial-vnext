# OMNI Assistant — Visual Prototype Sandbox

**Status:** design scratch surface. **Nothing here ships to the live app automatically.**

## Why this file exists

On 2026-07-07 a full visual redesign of the OMNI assistant was reverted because it
regressed usability:

- the closed launcher lost its **compact three-icon cluster** (bot / mic / bell + halo)
  and became a single lonely orb;
- the open panel gained a large empty dark "OMNI core presence zone" + a full-width
  voicebar, which pushed the real content (messages/input) down and made the panel
  read like a dashboard widget;
- duplicated small cores appeared (one in the launcher, one in the panel hero).

The lesson: **do not prototype assistant visuals inside the production
`omni-ai-assistant.js` / `.css`.** Iterate in isolation first, get a sign-off, then
port only the pieces that survive review.

## The current (good) baseline — do not regress

Closed launcher (`#ptxAIButton`) = the compact cluster, built in `createAssistant()`:

- `.ptxai-fab-core` → `fa-robot` (opens the agent)
- `.ptxai-fab-lobe.ptxai-fab-mic` → `fa-microphone-lines` (starts Omni voice)
- `.ptxai-fab-lobe.ptxai-fab-alerts` → `fa-bell` (shows attention)
- `.ptxai-fab-ring-1/2` + `.ptxai-fab-pulse` → the soft halo/glow behind them

Open panel = simple header → quickbar → `#ptxAIStream` messages → input row →
resize handle, with the compact wave indicator (`#jarvisWaveIndicator`,
`.jarvis-wave > .wave-bar`) as the small voice/status area.

Preserved logic (already in the baseline): open/close (`toggle`), drag
(`installButtonDrag`/`installPanelDrag`), resize, reset position + `localStorage`
layout persistence, per-page chat (`state.byPage`), page-aware context, safe
approval flow (`queueToApproval`), and Arabic/English via `t()`.

## What was kept from the reverted redesign

Only one thing — it is pure logic with **no** visual/DOM coupling: the hardened
`parseActions()` JSON sanitizer (smart quotes, trailing commas, control chars,
single-quoted keys, plus a balanced-brace fallback scan). It makes safe-action
parsing more robust and stands on its own.

## How to run a visual experiment safely

1. Copy the launcher + panel markup into a standalone
   `omni-ai-assistant-prototype.html` (self-contained: inline the CSS, stub the
   `t()`/state, hardcode a few sample messages). Open it directly in a browser.
2. Iterate freely there — try the "premium floating cluster", motion, halos, etc.
3. Only after it clearly beats the baseline on **usability** (not just looks), port
   the specific CSS/markup deltas into `omni-ai-assistant.css` / `.js` behind the
   existing class names, and re-run:
   `node --check app.js server.js omni-ai-assistant.js omni-language-fix.js`
4. Never introduce a second empty "core/presence" panel when the assistant is
   closed — the closed state must always show the three-icon cluster, never a lone orb.
