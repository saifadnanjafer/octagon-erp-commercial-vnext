/**
 * OCTAGON OMNISYSTEM - modules/ai-providers.js
 *
 * Unified AI provider layer. Lets the whole ERP (Jarvis brain, the floating
 * assistant, and the System Brain page) run on OpenRouter models — DeepSeek /
 * Qwen — while keeping Google Gemini as a fallback and for voice-audio
 * transcription (OpenRouter text models can't take inline audio).
 *
 * It transparently overrides window.callOctagonAi / window.callPentagonAi with a
 * single `chat(userText, systemContext, opts)` that keeps the exact same
 * signature the rest of the app already uses, so nothing else has to change.
 *
 * MUST load AFTER app.js (which defines the original Gemini caller we keep as a
 * fallback) and is loaded BEFORE the assistant/brain that call it lazily.
 *
 * SECURITY (hardening sprint 2026-07-05): NO API keys live in this file or in
 * any client JS anymore. All provider calls go through the server proxy
 * (POST /api/ai/chat, POST /api/ai/gemini) which reads OPENROUTER_API_KEY /
 * CONTACTBOX_API_KEY / GEMINI_API_KEY from .env. Old leaked keys persisted in
 * localStorage (octagonAIProvider) are scrubbed on load. Consequence: the app
 * must be served by server.js for AI to work — a raw file:// open has no AI
 * (deterministic localPlan fallback still works). NEVER inline a key here.
 */
(function () {
  'use strict';

  const LS_KEY = 'octagonAIProvider';

  // Friendly aliases -> full model ids.
  const MODELS = {
    deepseek: 'deepseek/deepseek-chat',          // DeepSeek V3 — cheap, strong, great with the brain prompt
    'deepseek-r1': 'deepseek/deepseek-r1',        // DeepSeek R1 — deeper reasoning (slower/pricier)
    qwen: 'qwen/qwen-2.5-72b-instruct',           // Qwen 2.5 72B — excellent Arabic, very clean JSON
    'qwen-coder': 'qwen/qwen-2.5-coder-32b-instruct',
    'claude-sonnet': 'claude-sonnet-4-6',
    'claude-opus': 'claude-opus-4-8',
    'claude-opus-4-7': 'claude-opus-4-7',
    'claude-opus-4-6': 'claude-opus-4-6'
  };

  // ---- SMART ROUTING (task type -> best model) ------------------------------
  // Set from the 2026-07-03 direct per-model benchmark (4 probes each: ping /
  // Arabic / strict-JSON tool plan / reasoning):
  //  - DeepSeek V3 swept 4/4 at the lowest latency (1-8s) => fast + Arabic +
  //    tool-JSON + sensitive planning all go to it.
  //  - Qwen 72B returned "Provider returned error" on 2/4 probes => dropped.
  //  - Qwen Flash passed 4/4 but 2.5-20s latency => kept only as economy mode.
  //  - ContactBox Claude (Sonnet+Opus) FAILED strict-JSON planning: the proxy
  //    injects an agentic wrapper that leaks <function_calls> — so Claude must
  //    never plan tools here; it stays the deep-reasoning/audit prose model.
  //  - DeepSeek R1 gave empty replies on short/structured asks; only useful for
  //    long reasoning, and Opus beat it on both speed and reliability.
  //  - Sensitive/finance/admin turns still need strict JSON for the planner,
  //    so they route to the best structured model; the real safety is the
  //    downstream approval gate in the brain executor, not the model choice.
  // Used only when autoRoute is on AND the caller passes opts.task AND the user
  // has not pinned a model.
  const ROUTES = {
    fast:       { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    arabic:     { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    tools:      { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    reasoning:  { provider: 'contactbox', model: 'claude-opus-4-8' },
    sensitive:  { provider: 'openrouter', model: 'deepseek/deepseek-chat' },
    transcribe: { provider: 'gemini',     model: 'gemini-flash' }
  };

  const DEFAULTS = {
    provider: 'openrouter',                       // 'openrouter' | 'contactbox' | 'gemini'
    model: 'deepseek/deepseek-chat',              // benchmark 2026-07-03: fastest reliable (4/4 probes)
    autoRoute: true,                              // task-type routing (off when user pins a model)
    // SECURITY HARDENING 2026-07-05: API keys were REMOVED from client code.
    // All provider calls now go through the server proxy (POST /api/ai/chat),
    // which reads OPENROUTER_API_KEY / CONTACTBOX_API_KEY / GEMINI_API_KEY
    // from the server's .env. Never put a real key back in this file.
    openrouterKey: '',
    endpoint: '/api/ai/chat',

    // ContactBox defaults (proxied server-side too)
    contactboxKey: '',
    contactboxEndpoint: '/api/ai/chat',
    contactboxModel: 'claude-sonnet-4-6',

    maxTokens: 1400,
    temperature: 0.3
  };

  // SECURITY: previously-leaked inline keys may still sit in persisted
  // localStorage config from older builds — scrub them on load.
  const LEAKED_KEY_PREFIXES = ['sk-or-v1-592fc072', 'sk-0e9HCOBwSeOFQ5vq'];
  function scrubLeakedKeys(stored) {
    if (!stored || typeof stored !== 'object') return stored;
    ['openrouterKey', 'contactboxKey'].forEach(k => {
      const v = String(stored[k] || '');
      if (v && LEAKED_KEY_PREFIXES.some(p => v.startsWith(p))) delete stored[k];
    });
    if (/^https:\/\/(openrouter\.ai|api\.contactboxtools\.me)\//.test(String(stored.endpoint || ''))) delete stored.endpoint;
    if (/^https:\/\/(openrouter\.ai|api\.contactboxtools\.me)\//.test(String(stored.contactboxEndpoint || ''))) delete stored.contactboxEndpoint;
    return stored;
  }

  function cfg() {
    try {
      const stored = scrubLeakedKeys(JSON.parse(localStorage.getItem(LS_KEY) || '{}'));
      const merged = Object.assign({}, DEFAULTS, stored);
      // Migrate old un-pinned defaults to the current benchmark-picked default.
      // A user-pinned model (autoRoute:false stored) is never migrated.
      if (!stored.modelPinned && stored.autoRoute === undefined && stored.model === 'qwen/qwen3.5-flash-02-23') {
        merged.model = DEFAULTS.model;
      }
      return merged;
    }
    catch (_) { return Object.assign({}, DEFAULTS); }
  }
  function setCfg(patch) {
    const next = Object.assign(cfg(), patch || {});
    // never persist the inline default key unless the user explicitly set one
    const toStore = Object.assign({}, next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(toStore)); } catch (_) {}
    return next;
  }

  // The original Gemini caller installed by app.js. Captured once, kept as fallback.
  const geminiCall = (typeof window.callOctagonAi === 'function' && window.callOctagonAi)
    || (typeof window.callPentagonAi === 'function' && window.callPentagonAi)
    || null;

  // ---- governance: live provider health (no keys ever stored here) ----------
  const STATE = {
    lastProvider: '', lastStatus: 'unknown', lastError: '',
    lastSuccessAt: '', lastFailureAt: '', failCount: 0, callCount: 0
  };
  function audit(eventType, data) {
    try { if (window.OctagonAIGovernance && typeof window.OctagonAIGovernance.audit === 'function') window.OctagonAIGovernance.audit(eventType, data); } catch (_) {}
  }
  // Strip hidden reasoning (<think>...</think>) before anything reaches the UI
  // or TTS, but PRESERVE newlines so multi-line answers keep their formatting.
  function cleanModelText(value) {
    return String(value || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
      .replace(/<\/?think>/gi, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  // Does this model accept an OpenRouter `reasoning` payload? Sending one to a
  // non-reasoning model (Qwen chat, DeepSeek V3) causes 400s — so we gate it.
  function modelSupportsReasoning(modelId) {
    return /deepseek-r1|qwq|thinking|reasoner|(^|\/|:)o[134](-|$)/i.test(String(modelId || ''));
  }
  function markSuccess(provider, model) {
    STATE.lastProvider = provider; STATE.lastStatus = 'ok'; STATE.lastError = '';
    STATE.lastSuccessAt = new Date().toISOString(); STATE.callCount++;
    audit('ai.provider.call', { provider: provider, model: model || '', ok: true });
  }
  function markFailure(provider, err) {
    STATE.lastProvider = provider; STATE.lastStatus = 'failed';
    STATE.lastError = String(err && err.message ? err.message : err).slice(0, 200);
    STATE.lastFailureAt = new Date().toISOString(); STATE.failCount++; STATE.callCount++;
    audit('ai.provider.failure', { provider: provider, error: STATE.lastError });
  }

  // SECURITY HARDENING 2026-07-05: both callers now go through the server
  // proxy (POST /api/ai/chat). No Authorization header, no key, ever leaves
  // or lives in the browser. The server reads keys from .env and applies a
  // provider/model allowlist. Signatures are unchanged so the brain, the
  // assistant, and testJarvisApis keep working as before.
  async function callAiProxy(provider, userText, systemContext, opts) {
    opts = opts || {};
    const c = cfg();
    const messages = [];
    if (systemContext) messages.push({ role: 'system', content: String(systemContext) });
    messages.push({ role: 'user', content: String(userText || '') });

    const model = opts.model || (provider === 'contactbox' ? (c.contactboxModel || 'claude-sonnet-4-6') : c.model);
    const options = {
      temperature: typeof opts.temperature === 'number' ? opts.temperature : c.temperature,
      maxTokens: opts.maxTokens || c.maxTokens
    };
    const reasoning = opts.reasoning || c.reasoning;
    if (reasoning && modelSupportsReasoning(model)) options.reasoning = reasoning;

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, messages, options })
    });

    const label = provider === 'contactbox' ? 'ContactBox' : 'OpenRouter';
    let data;
    try { data = await res.json(); } catch (e) { throw new Error(label + ' proxy returned a non-JSON response (HTTP ' + res.status + ')'); }
    if (data && data.error) throw new Error((data.error.message || label + ' error') + (data.error.code ? ' [' + data.error.code + ']' : ''));
    if (!res.ok) throw new Error(label + ' proxy HTTP ' + res.status);
    const out = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return cleanModelText(out);
  }

  async function callOpenRouter(userText, systemContext, opts) {
    return callAiProxy('openrouter', userText, systemContext, opts);
  }

  async function callContactBox(userText, systemContext, opts) {
    return callAiProxy('contactbox', userText, systemContext, opts);
  }

  /**
   * Unified entry point. Same signature as the old callOctagonAi:
   *   chat(userText, systemContext, opts)
   * opts may include: { audio, model, temperature, maxTokens, provider }
   */
  async function chat(userText, systemContext, opts) {
    opts = opts || {};
    const c = cfg();
    let provider = opts.provider || c.provider;

    // ---- smart routing by task type -----------------------------------------
    // Applies ONLY when: the caller declared a task, autoRoute is on, and no
    // explicit model/provider override exists. A user-pinned model (autoRoute
    // off, set via the model selector) always wins — the selector is real.
    if (opts.task && ROUTES[opts.task] && c.autoRoute !== false && !opts.model && !opts.provider
        && provider !== 'offline' && provider !== 'gemini') {
      const route = ROUTES[opts.task];
      if (route.provider !== 'gemini') {
        provider = route.provider;
        opts = Object.assign({}, opts, { model: route.model });
      }
    }

    const mixedLangRule = "\nArabic is the primary language. English words inside Arabic are technical terms and must not change the response language. Reply in clear Arabic unless the user explicitly asks for English.";
    if (systemContext) {
      systemContext = String(systemContext) + mixedLangRule;
    } else {
      systemContext = mixedLangRule;
    }

    // Audio messages must go to Gemini (inline audio); OpenRouter text models can't.
    if (opts.audio) {
      if (typeof geminiCall === 'function') return geminiCall(userText, systemContext, opts);
      throw new Error('Audio requires the Gemini provider, which is not available');
    }

    // Keys are server-side now — the proxy decides availability, not the client.
    if (provider === 'contactbox') {
      try {
        const out = await callContactBox(userText, systemContext, opts);
        if (out) { markSuccess('contactbox', opts.model || c.contactboxModel || 'claude-sonnet-4-6'); return out; }
        markFailure('contactbox', 'empty response');
        console.warn('[OctagonAI] ContactBox returned empty; falling back to Gemini.');
      } catch (e) {
        markFailure('contactbox', e);
        console.warn('[OctagonAI] ContactBox failed; falling back to Gemini:', e && e.message ? e.message : e);
      }
    }

    if (provider === 'openrouter') {
      try {
        const out = await callOpenRouter(userText, systemContext, opts);
        if (out) { markSuccess('openrouter', opts.model || c.model); return out; }
        markFailure('openrouter', 'empty response');
        console.warn('[OctagonAI] OpenRouter returned empty; falling back to Gemini.');
      } catch (e) {
        markFailure('openrouter', e);
        console.warn('[OctagonAI] OpenRouter failed; falling back to Gemini:', e && e.message ? e.message : e);
      }
    }

    if (typeof geminiCall === 'function') {
      try {
        const out = await geminiCall(userText, systemContext, opts);
        markSuccess('gemini', 'gemini-flash');
        return out;
      } catch (e) {
        markFailure('gemini', e);
        throw e; // callers (Jarvis brain / assistant) have their own deterministic fallback
      }
    }
    markFailure('none', 'no provider configured');
    throw new Error('No AI provider available');
  }

  // ---- install: route the whole app through this layer ----------------------
  window.__octagonGeminiAi = geminiCall;   // keep the original reachable
  window.callOctagonAi = chat;
  window.callPentagonAi = chat;

  // ---- public control surface ----------------------------------------------
  window.OctagonAI = {
    chat,
    callOpenRouter,
    callContactBox,
    gemini: geminiCall,
    config: cfg,
    setConfig: setCfg,
    /** Switch model. Accepts an alias ('deepseek','qwen',...) or a full id.
     *  Pinning a model DISABLES smart routing so the selector is always real:
     *  what you pick is what every call uses (re-enable via useAutoRoute()). */
    setModel(m) {
      const id = MODELS[m] || m;
      const isClaude = id.includes('claude');
      setCfg(isClaude ? {
        model: id,
        contactboxModel: id,
        provider: 'contactbox',
        autoRoute: false
      } : {
        model: id,
        provider: 'openrouter',
        autoRoute: false
      });
      console.log('[OctagonAI] model =', id, 'provider =', isClaude ? 'contactbox' : 'openrouter', '(pinned, smart routing off)');
      return id;
    },
    /** Re-enable task-type smart routing (fast/arabic/tools/reasoning/sensitive). */
    useAutoRoute() { setCfg({ autoRoute: true }); console.log('[OctagonAI] smart routing enabled'); return true; },
    routes: ROUTES,
    /** Force the Gemini provider (e.g. if OpenRouter credits run out). */
    useGemini() { setCfg({ provider: 'gemini' }); console.log('[OctagonAI] provider = gemini'); return 'gemini'; },
    /** Back to OpenRouter. */
    useOpenRouter() { setCfg({ provider: 'openrouter' }); console.log('[OctagonAI] provider = openrouter'); return 'openrouter'; },
    /** Force ContactBox. */
    useContactBox() { setCfg({ provider: 'contactbox' }); console.log('[OctagonAI] provider = contactbox'); return 'contactbox'; },
    /** Replace the OpenRouter key at runtime (persists to localStorage). */
    setKey(k) { setCfg({ openrouterKey: k }); console.log('[OctagonAI] OpenRouter key updated'); return true; },
    /** Replace the ContactBox key at runtime (persists to localStorage). */
    setContactBoxKey(k) { setCfg({ contactboxKey: k }); console.log('[OctagonAI] ContactBox key updated'); return true; },
    /** Live provider health — safe to show in UI, never includes keys. */
    status() {
      const c = cfg();
      return {
        activeProvider: c.provider,
        model: c.model,
        effectiveModel: c.provider === 'contactbox' ? (c.contactboxModel || c.model) : c.model,
        contactboxModel: c.contactboxModel,
        autoRoute: c.autoRoute !== false,
        fallbackProvider: (typeof geminiCall === 'function') ? 'gemini' : 'deterministic',
        deterministicFallbackEnabled: true,
        hasOpenRouterKey: !!c.openrouterKey,
        hasContactBoxKey: !!c.contactboxKey,
        lastProvider: STATE.lastProvider,
        lastStatus: STATE.lastStatus,
        lastError: STATE.lastError,
        lastSuccessAt: STATE.lastSuccessAt,
        lastFailureAt: STATE.lastFailureAt,
        failCount: STATE.failCount,
        callCount: STATE.callCount
      };
    },
    /** Round-trip test against the active provider chain. */
    async testProvider() {
      try {
        const out = await chat('ping — reply with the single word: pong', 'You are a health check. Reply with one word only.', { temperature: 0, maxTokens: 10 });
        console.log('[OctagonAI] testProvider OK:', String(out).slice(0, 60));
        return { ok: true, reply: String(out).slice(0, 60), provider: STATE.lastProvider };
      } catch (e) {
        console.warn('[OctagonAI] testProvider FAILED:', e && e.message);
        return { ok: false, error: String(e && e.message || e), provider: STATE.lastProvider };
      }
    },
    /**
     * Per-model health check. Default = fast ping (speed + reliability).
     * testMatrix({ deep: true }) also probes Arabic quality and strict-JSON
     * tool planning per model — the capability/stability checklist.
     */
    async testMatrix(opts) {
      const deep = !!(opts && opts.deep);
      const tests = [
        { label: 'OpenRouter Qwen Flash', provider: 'openrouter', model: 'qwen/qwen3.5-flash-02-23' },
        { label: 'OpenRouter Qwen 72B', provider: 'openrouter', model: MODELS.qwen },
        { label: 'OpenRouter DeepSeek V3', provider: 'openrouter', model: MODELS.deepseek },
        { label: 'OpenRouter DeepSeek R1', provider: 'openrouter', model: MODELS['deepseek-r1'] },
        { label: 'ContactBox Claude Sonnet', provider: 'contactbox', model: 'claude-sonnet-4-6' },
        { label: 'ContactBox Claude Opus', provider: 'contactbox', model: 'claude-opus-4-8' },
        { label: 'Gemini fallback', provider: 'gemini', model: 'gemini-flash' }
      ];
      const PROBES = {
        ping: {
          system: 'Health check. Reply with one word only.',
          prompt: 'ping - reply with only: pong',
          maxTokens: 24,
          check: out => /pong|بونغ|بونج|بنج/i.test(out)
        },
        arabic: {
          system: 'أنت مساعد ERP عربي. أجب بالعربية بجملة واحدة.',
          prompt: 'ما الفرق بين المصروفات والواردات؟ جملة واحدة.',
          maxTokens: 160,
          check: out => /[؀-ۿ]/.test(out) && !/<think/i.test(out) && out.length > 12
        },
        json: {
          system: 'أجب بصيغة JSON صارمة فقط بلا أسوار كود: {"speak": نص, "actions": [{"tool": اسم, "args": كائن}]}. الأدوات: navigate(page), report_low_stock().',
          prompt: 'افتح المخزون ثم اعرض المواد الناقصة',
          maxTokens: 260,
          check: out => {
            try {
              let s = out.trim();
              const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (fence) s = fence[1].trim();
              const f = s.indexOf('{'), l = s.lastIndexOf('}');
              const obj = JSON.parse(s.slice(f, l + 1));
              const tools = (obj.actions || []).map(a => a && a.tool);
              return tools.indexOf('navigate') !== -1 && tools.indexOf('report_low_stock') !== -1;
            } catch (_) { return false; }
          }
        }
      };
      const probeNames = deep ? ['ping', 'arabic', 'json'] : ['ping'];
      const callModel = async (test, probe, extraTokens) => {
        const o = { model: test.model, temperature: 0, maxTokens: probe.maxTokens + (extraTokens || 0) };
        if (test.provider === 'openrouter') return callOpenRouter(probe.prompt, probe.system, o);
        if (test.provider === 'contactbox') return callContactBox(probe.prompt, probe.system, o);
        if (test.provider === 'gemini' && typeof geminiCall === 'function') return geminiCall(probe.prompt, probe.system, o);
        throw new Error('Provider is not available in this browser session');
      };
      const items = [];
      for (const test of tests) {
        const item = { label: test.label, provider: test.provider, model: test.model, capabilities: {} };
        const started = Date.now();
        for (const name of probeNames) {
          const probe = PROBES[name];
          const t0 = Date.now();
          try {
            // R1-style models burn tokens on hidden reasoning — give them room.
            const extra = /r1/i.test(test.model) ? 700 : 0;
            const out = cleanModelText(String(await callModel(test, probe, extra) || ''));
            item.capabilities[name] = { ok: probe.check(out), latencyMs: Date.now() - t0 };
            if (name === 'ping') { item.ok = item.capabilities.ping.ok; item.reply = out.slice(0, 80); }
          } catch (e) {
            item.capabilities[name] = { ok: false, latencyMs: Date.now() - t0, error: String(e && e.message || e).slice(0, 140) };
            if (name === 'ping') { item.ok = false; item.error = item.capabilities.ping.error; }
          }
        }
        item.latencyMs = item.capabilities.ping ? item.capabilities.ping.latencyMs : (Date.now() - started);
        item.stable = probeNames.every(n => item.capabilities[n] && item.capabilities[n].ok);
        items.push(item);
      }
      return { ok: items.some(item => item.ok), deep, testedAt: new Date().toISOString(), items };
    },
    models: MODELS,
    version: '3.0' // Omni: task-type smart routing + reasoning-payload guard + newline-safe think stripping
  };
  // Compatibility alias: the user-facing assistant is named "Omni".
  window.OmniAI = window.OctagonAI;

  try {
    const c = cfg();
    console.log('[OctagonAI] ready — provider=%s model=%s autoRoute=%s (Gemini fallback=%s)', c.provider, c.model, c.autoRoute !== false, geminiCall ? 'yes' : 'no');
  } catch (_) {}
})();
