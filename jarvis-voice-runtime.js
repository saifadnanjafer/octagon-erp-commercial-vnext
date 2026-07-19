/**
 * OCTAGON OMNISYSTEM - jarvis-voice-runtime.js
 *
 * OMNI Voice Runtime V2 - A robust hands-free voice engine with a strict state machine,
 * barge-in (interruption) handling, multi-layered echo/self-loop prevention,
 * and end-of-turn detection.
 */
(function () {
  'use strict';

  const JARVIS_STATES = {
    IDLE: 'idle',
    LISTENING: 'listening',
    USER_SPEAKING: 'user_speaking',
    THINKING: 'thinking',
    STREAMING: 'streaming',
    SPEAKING: 'speaking',
    INTERRUPTED: 'interrupted',
    ERROR: 'error'
  };

  const JARVIS_LANGUAGE_MODE = {
    primaryLocale: 'ar-IQ',
    mixedLanguage: true,
    allowEmbeddedEnglishTerms: true,
    autoSwitchThreshold: 'high_confidence_full_utterance_only'
  };

  // Immediate stop commands to halt assistant TTS
  const STOP_COMMANDS = [
    'توقف', 'وقف', 'اسكت', 'بس', 'كافي',
    'stop', 'cancel', 'shut up', 'quiet'
  ];

  let currentState = JARVIS_STATES.IDLE;
  let recognition = null;
  let stopWordRecognition = null;
  let activeAudio = null;
  let activeAbortController = null;
  let watchdogInterval = null;

  // Echo and self-listening prevention registers
  let lastAssistantSpeech = '';
  let lastAssistantSpeechTime = 0;
  let lastUserUtterance = '';
  let consecutiveEchosCount = 0;
  let speechMuteGateActive = false;
  let ignoreMicUntil = 0;

  // End of turn buffers and configuration
  let interimBuffer = '';
  let finalBuffer = '';
  let turnId = 0;
  let runId = 0;
  let silenceTimer = null;
  let silenceDebounceMs = 950; // Between 700 - 1200ms
  let minUtteranceLength = 2;

  // Settings
  let currentProvider = 'auto'; // 'auto' | 'openrouter' | 'gemini' | 'offline'
  let currentVoiceMode = 'continuous'; // 'continuous' | 'push_to_talk' | 'text'

  let wakeWordRequired = false;
  let isArmed = false;
  let armedTimer = null;

  // --- Cold-start handling (the "first try doesn't hear" fix) ---------------
  // The browser speech engine needs 1-3s after start() before the mic actually
  // delivers audio (permission + device spin-up + connection to the speech
  // service). Words spoken in that window are silently lost. So we:
  //  1. warm the mic up once with getUserMedia before the first session,
  //  2. show an honest "starting the mic..." until onaudiostart fires,
  //  3. play a ready cue + "speak now" only when audio is REALLY flowing,
  //  4. recreate the recognizer if audio never starts (cold/wedged engine).
  let micPrimed = false;
  let lastAudioLiveAt = 0;     // last time the mic proved it was capturing
  let coldStartTimer = null;
  let coldStartRetries = 0;
  let arLocaleFallback = false; // true after 'language-not-supported' for ar-SA → use generic 'ar'

  function primeMic() {
    if (micPrimed || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(micPrimed);
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(stream => {
        stream.getTracks().forEach(track => track.stop());
        micPrimed = true;
        return true;
      })
      .catch(() => false); // recognition.start() will surface the real error
  }

  // Wake words list — Omni is the primary name; the old Jarvis words stay as
  // hidden aliases so existing habits keep working.
  const JARVIS_WAKE_WORDS = [
    'يا أومني', 'هاي أومني', 'هلو أومني', 'مرحبا أومني', 'أومني', 'اومني',
    'يا جارفيس', 'هاي جارفيس', 'هلو جارفيس', 'مرحبا جارفيس', 'جارفيس',
    'اوكتاجون', 'أوكتاجون', 'اوكتاغون', 'أوكتاغون',
    'hello omni', 'hey omni', 'hi omni', 'okay omni', 'ok omni', 'omni',
    'hello jarvis', 'hey jarvis', 'hi jarvis', 'okay jarvis', 'ok jarvis', 'octagon', 'jarvis'
  ];

  function logEvent(type, detail) {
    console.log(`[JarvisVoiceRuntime] [${currentState.toUpperCase()}] ${type}:`, detail);
    try {
      if (window.OctagonAIGovernance && typeof window.OctagonAIGovernance.audit === 'function') {
        window.OctagonAIGovernance.audit(`voice.${type}`, detail);
      }
    } catch (_) {}
  }

  function setState(newState) {
    if (currentState === newState) return;
    const oldState = currentState;
    currentState = newState;
    logEvent('state_change', { from: oldState, to: newState });
    
    // Broadcast state change to UI/Orb
    window.dispatchEvent(new CustomEvent('jarvis:state-change', { detail: { state: newState } }));
    
    // Drive Orb if available
    try {
      if (window.JarvisOrb) {
        if (newState === JARVIS_STATES.LISTENING) {
          window.JarvisOrb.setMode('listening');
          window.JarvisOrb.say('يستمع', 'تحدث الآن...');
        } else if (newState === JARVIS_STATES.THINKING) {
          window.JarvisOrb.setMode('thinking');
          window.JarvisOrb.say('يفكر', 'أعالج طلبك...');
        } else if (newState === JARVIS_STATES.SPEAKING) {
          window.JarvisOrb.setMode('speaking');
          window.JarvisOrb.say('يتحدث', 'أومني يردّ');
        } else if (newState === JARVIS_STATES.IDLE) {
          window.JarvisOrb.setMode('idle');
          window.JarvisOrb.say('جاهز', 'انتظر أمرك');
        }
      }
    } catch (_) {}
  }

  function normalizeText(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      // Remove punctuation
      .replace(/[؟?!.,،:;]/g, ' ')
      // Normalize Arabic characters
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // strip diacritics
      .replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
      .replace(/\u0629/g, 'ه')
      .replace(/\u0649/g, 'ي')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isStopCommand(text) {
    const norm = normalizeText(text);
    return STOP_COMMANDS.some(cmd => norm === cmd || norm.includes(cmd));
  }

  function startStopWordRecognition(runToken) {
    stopStopWordRecognition();
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    try {
      const session = new SpeechRecognition();
      stopWordRecognition = session;
      session.continuous = true;
      session.interimResults = true;
      session.maxAlternatives = 1;
      session.lang = listenIsEnglish() ? 'en-US' : (arLocaleFallback ? 'ar' : 'ar-SA');
      session.onresult = function (event) {
        if (runToken !== runId || currentState !== JARVIS_STATES.SPEAKING) return;
        let heard = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          heard += event.results[i][0].transcript || '';
        }
        if (isStopCommand(heard)) interrupt('spoken_stop_word', true);
      };
      session.onerror = function () {};
      session.onend = function () {
        if (stopWordRecognition !== session) return;
        if (runToken !== runId || currentState !== JARVIS_STATES.SPEAKING) return;
        setTimeout(() => {
          if (stopWordRecognition === session && runToken === runId && currentState === JARVIS_STATES.SPEAKING) {
            startStopWordRecognition(runToken);
          }
        }, 250);
      };
      session.start();
      logEvent('stop_word_listener_start', { lang: session.lang });
    } catch (e) {
      logEvent('stop_word_listener_error', { message: e && e.message ? e.message : String(e) });
      stopWordRecognition = null;
    }
  }

  function stopStopWordRecognition() {
    if (!stopWordRecognition) return;
    const session = stopWordRecognition;
    stopWordRecognition = null;
    try {
      session.onresult = null;
      session.onerror = null;
      session.onend = null;
      session.abort();
    } catch (_) {}
  }

  // Which language should we LISTEN in? Honor the assistant's AR/EN listen chip
  // (getJarvisListenFamily) first — that toggle is what the user actually flips — and
  // only fall back to the page's UI language when the chip getter isn't available.
  function listenIsEnglish() {
    try {
      const a = window.octagonAIAssistant;
      if (a && typeof a.getJarvisListenFamily === 'function') return a.getJarvisListenFamily() === 'en';
    } catch (_) {}
    return (document.documentElement.lang || 'ar').startsWith('en');
  }

  function playBeep(frequency = 587.33, duration = 0.12, type = 'sine') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  function detectWakeWord(text) {
    const norm = normalizeText(text);
    if (!norm) return null;
    for (const w of JARVIS_WAKE_WORDS) {
      const nw = normalizeText(w);
      const idx = norm.indexOf(nw);
      if (idx !== -1) {
        const normWords = norm.split(' ');
        const nwWords = nw.split(' ');
        
        let matchIdx = -1;
        for (let i = 0; i <= normWords.length - nwWords.length; i++) {
          let match = true;
          for (let j = 0; j < nwWords.length; j++) {
            if (normWords[i+j] !== nwWords[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            matchIdx = i;
            break;
          }
        }
        
        if (matchIdx !== -1) {
          const origWords = text.trim().split(/\s+/);
          const remainderWords = origWords.slice(matchIdx + nwWords.length);
          return {
            word: w,
            remainder: remainderWords.join(' ').trim()
          };
        }
      }
    }
    return null;
  }

  function checkFuzzyEcho(transcript) {
    if (!lastAssistantSpeech) return false;
    const normTranscript = normalizeText(transcript);
    const normAssistant = normalizeText(lastAssistantSpeech);
    if (!normTranscript) return false;
    
    // If it's too short, don't trigger fuzzy check to avoid blocking short commands
    if (normTranscript.length < 3) return false;

    // Direct overlap checks
    if (normAssistant.includes(normTranscript) && normTranscript.length >= 4) return true;
    if (normTranscript.includes(normAssistant) && normAssistant.length >= 6) return true;

    // Simple Levenshtein-like word overlap
    const transWords = normTranscript.split(' ');
    const asstWords = normAssistant.split(' ');
    let matches = 0;
    transWords.forEach(w => {
      if (asstWords.includes(w)) matches++;
    });
    const overlapRatio = matches / transWords.length;
    return overlapRatio > 0.7; // 70% word overlap is highly indicative of echo
  }

  function assistantBridge() {
    return window.octagonAIAssistant || window.ptxAIAssistant || null;
  }

  function stripForSpeech(text) {
    const assistant = assistantBridge();
    if (assistant && typeof assistant.stripForSpeech === 'function') {
      return assistant.stripForSpeech(text);
    }
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]+`/g, ' ')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectSpeechLangCode(text) {
    const assistant = assistantBridge();
    if (assistant && typeof assistant.detectSpeechLangCode === 'function') {
      return assistant.detectSpeechLangCode(text);
    }
    return /[\u0600-\u06FF]/.test(String(text || '')) ? 'ar-SA' : 'en-US';
  }

  function pickSpeechVoice(langCode) {
    const assistant = assistantBridge();
    if (assistant && typeof assistant.pickSpeechVoice === 'function') {
      return assistant.pickSpeechVoice(langCode);
    }
    try {
      const want = String(langCode || 'ar-SA').slice(0, 2).toLowerCase();
      const voices = window.speechSynthesis?.getVoices?.() || [];
      return voices.find(v => String(v.lang || '').toLowerCase().startsWith(want)) || null;
    } catch (_) {
      return null;
    }
  }

  function init() {
    logEvent('init', { provider: currentProvider, mode: currentVoiceMode });
    try {
      wakeWordRequired = localStorage.getItem('jarvisWakeRequired') === '1';
    } catch (_) {}
    startWatchdog();
    // Connect document key listeners for interruption via keyboard (e.g. Space/Escape)
    document.addEventListener('keydown', function (e) {
      if (currentState !== JARVIS_STATES.SPEAKING) return;
      // Don't hijack the spacebar while the user is typing in a field — only Escape is a
      // global stop. Otherwise typing a space in the chat box would cut Omni off.
      const tgt = e.target;
      const typing = tgt && (/^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName || '') || tgt.isContentEditable);
      if (e.key === 'Escape' || (e.key === ' ' && !typing)) {
        interrupt('keyboard_stop');
      }
    });
  }

  function start() {
    // NOTE: allow start() when state is LISTENING but the recognizer is gone —
    // that is exactly the watchdog-revive case (the old early-return made the
    // watchdog a silent no-op, which is why a dead first session never healed).
    if (currentState === JARVIS_STATES.LISTENING && recognition) return;
    logEvent('start', {});
    ignoreMicUntil = 0;
    consecutiveEchosCount = 0;
    speechMuteGateActive = false; // ensure mute gate is reset
    if (micPrimed) {
      setupSpeechRecognition();
    } else {
      // First activation: warm the mic up so the engine doesn't eat the first
      // words while the device/permission spins up.
      primeMic().then(() => setupSpeechRecognition());
    }
  }

  function stop() {
    logEvent('stop', {});
    isArmed = false;
    if (armedTimer) clearTimeout(armedTimer);
    armedTimer = null;
    speechMuteGateActive = false; // ensure mute gate is reset
    stopStopWordRecognition();
    stopSpeechRecognition();
    setState(JARVIS_STATES.IDLE);
  }

  // Pause capturing for the duration of a turn WITHOUT tearing down the state machine.
  // Used while a request is being thought about / spoken, so the orb keeps showing
  // THINKING/SPEAKING instead of flashing back to IDLE. speak() re-arms the mic at the end.
  function holdMic() {
    logEvent('hold_mic', {});
    stopSpeechRecognition();
  }

  function interrupt(reason = 'user_barge_in', resumeListening = true) {
    if (currentState !== JARVIS_STATES.SPEAKING && currentState !== JARVIS_STATES.THINKING) return false;
    logEvent('interrupt', { reason, resumeListening });

    // Invalidate any in-flight speak() run so its pending safety timer / async TTS resolve
    // becomes a no-op (myRun !== runId) and cannot re-touch the mic after we resume here.
    runId++;
    
    // Reset mute gate
    speechMuteGateActive = false;
    stopStopWordRecognition();

    // Stop playing audio
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.src = '';
      } catch (_) {}
      activeAudio = null;
    }
    
    // Cancel browser native synthesis
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (_) {}

    // Abort active LLM call
    if (activeAbortController) {
      try {
        activeAbortController.abort();
      } catch (_) {}
      activeAbortController = null;
    }

    setState(JARVIS_STATES.INTERRUPTED);
    
    // Ignore microphone momentarily to avoid capturing the residual sound of speech stopping
    ignoreMicUntil = Date.now() + 400;

    // Reset buffer & state
    finalBuffer = '';
    interimBuffer = '';

    // Switch back to listening mode
    if (resumeListening) {
      setTimeout(() => {
        if (currentState === JARVIS_STATES.INTERRUPTED) {
          setState(JARVIS_STATES.LISTENING);
          setupSpeechRecognition();
        }
      }, 500);
    }

    return true;
  }

  function setupSpeechRecognition() {
    stopStopWordRecognition();
    if (recognition) {
      try { recognition.abort(); } catch (_) {}
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setState(JARVIS_STATES.ERROR);
      logEvent('error', { type: 'no_web_speech_support' });
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    // Set locale from the listen chip. Arabic uses ar-SA, NOT ar-IQ: when the
    // speech backend does not accept a locale it silently falls back to the
    // BROWSER locale (English on this machine) — which is exactly the
    // "it only hears English" bug. ar-SA is universally supported and still
    // recognizes Iraqi speech; if even it is rejected, the error handler below
    // retries with generic 'ar'.
    recognition.lang = listenIsEnglish() ? 'en-US' : (arLocaleFallback ? 'ar' : 'ar-SA');

    // Per-session cold-start tracking. "coldGap" = the mic was NOT live just
    // before this session (fresh activation, or resuming after a spoken reply)
    // — that is when the user needs an explicit "speak now" cue. Rapid silent
    // auto-restarts (Chrome ends sessions after silence) stay quiet.
    const session = recognition;
    let audioStarted = false;
    const coldGap = (Date.now() - lastAudioLiveAt) > 2500;
    if (coldStartTimer) { clearTimeout(coldStartTimer); coldStartTimer = null; }

    recognition.onstart = function () {
      logEvent('recognition_start', { lang: recognition.lang });
      if (currentState !== JARVIS_STATES.SPEAKING) {
        setState(JARVIS_STATES.LISTENING);
      }
      // HONEST UI: the engine session opened, but the mic is NOT delivering
      // audio yet — words spoken now would be lost. Say so instead of faking
      // "listening"; onaudiostart flips it to the real "speak now".
      if (coldGap && !audioStarted) {
        const isEn = listenIsEnglish();
        window.dispatchEvent(new CustomEvent('jarvis:transcript-update', {
          detail: { text: isEn ? 'Starting the mic…' : 'يشغّل المايك… لحظة' }
        }));
      }
      // Cold/wedged engine self-heal: if no audio arrives shortly, rebuild the
      // recognizer instead of sitting deaf (this was the "first try doesn't
      // hear" failure — a session that opens but never captures).
      coldStartTimer = setTimeout(() => {
        coldStartTimer = null;
        if (recognition !== session || audioStarted) return;
        if (currentState !== JARVIS_STATES.LISTENING && currentState !== JARVIS_STATES.USER_SPEAKING) return;
        coldStartRetries++;
        logEvent('mic_cold_restart', { attempt: coldStartRetries });
        const isEn = listenIsEnglish();
        if (coldStartRetries <= 2) {
          window.dispatchEvent(new CustomEvent('jarvis:transcript-update', {
            detail: { text: isEn ? 'Mic did not start — retrying…' : 'المايك ما اشتغل — أعيد المحاولة…' }
          }));
          setupSpeechRecognition();
        } else {
          window.dispatchEvent(new CustomEvent('jarvis:transcript-update', {
            detail: { text: isEn ? "Can't hear — check mic permission/device, or use the 🎙️ record button" : 'ما أگدر أسمع — تحقق من إذن المايك أو استخدم زر التسجيل 🎙️' }
          }));
          // keep trying quietly at a slower pace; heals if the user fixes the mic
          coldStartTimer = setTimeout(() => { if (recognition === session && !audioStarted) setupSpeechRecognition(); }, 8000);
        }
      }, 4000);
    };

    recognition.onaudiostart = function () {
      // The mic is REALLY capturing now — this is the moment it's safe to talk.
      audioStarted = true;
      lastAudioLiveAt = Date.now();
      coldStartRetries = 0;
      if (coldStartTimer) { clearTimeout(coldStartTimer); coldStartTimer = null; }
      logEvent('audio_start', { coldGap });
      if (coldGap && currentState === JARVIS_STATES.LISTENING) {
        playBeep(880, 0.09); // ready cue: "your turn"
        const isEn = listenIsEnglish();
        // Show WHICH language the mic expects — a persisted EN chip was one way
        // "it only hears English" could happen without the user noticing.
        window.dispatchEvent(new CustomEvent('jarvis:transcript-update', {
          detail: { text: isEn ? 'Speak now — listening in ENGLISH 👂 (tap the AR/EN chip to switch)' : 'تحدث الآن — أسمعك بالعربي 👂' }
        }));
      }
    };

    recognition.onresult = function (event) {
      const now = Date.now();
      lastAudioLiveAt = now; // proof the mic is capturing right now

      // Mute gate & Ignore windows check
      if (now < ignoreMicUntil || speechMuteGateActive) {
        return;
      }

      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) final += text;
        else interim += text;
      }

      const rawHear = (final || interim).trim();
      if (!rawHear) return;

      // Handle immediate barge-in interruption check
      if (currentState === JARVIS_STATES.SPEAKING && isStopCommand(rawHear)) {
        interrupt('user_barge_in');
        return;
      }

      // If OMNI is speaking and user says anything else, check if it's an interruption
      if (currentState === JARVIS_STATES.SPEAKING) {
        // Only trigger barge-in if it is clearly not an echo
        if (!checkFuzzyEcho(rawHear) && rawHear.length > minUtteranceLength) {
          interrupt('user_barge_in');
        }
        return;
      }

      // Live transcript update during speech
      const liveText = (finalBuffer + ' ' + (final || interim)).trim();
      window.dispatchEvent(new CustomEvent('jarvis:transcript-update', { detail: { text: liveText } }));

      if (final) {
        // Echo loop prevention filter
        if (checkFuzzyEcho(final)) {
          consecutiveEchosCount++;
          logEvent('echo_rejected', { text: final, streak: consecutiveEchosCount });
          
          if (consecutiveEchosCount >= 3) {
            consecutiveEchosCount = 0;
            ignoreMicUntil = Date.now() + 1500; // block mic for 1.5s
            try {
              if (window.showToast) window.showToast('تم تجاهل صدى صوت المساعد', 'warning');
            } catch (_) {}
          }
          return;
        }

        consecutiveEchosCount = 0; // reset on clean input
        const cleanFinal = final.trim();

        if (wakeWordRequired) {
          if (isArmed) {
            // Armed mode: accept the next finalized speech as the command
            isArmed = false;
            if (armedTimer) clearTimeout(armedTimer);
            armedTimer = null;
            
            finalBuffer = cleanFinal;
            interimBuffer = '';
            setState(JARVIS_STATES.USER_SPEAKING);
            resetSilenceTimer();
          } else {
            // Unarmed mode: check for wake word
            const wake = detectWakeWord(cleanFinal);
            if (wake) {
              if (wake.remainder) {
                // Command in one breath after the wake word
                finalBuffer = wake.remainder;
                interimBuffer = '';
                setState(JARVIS_STATES.USER_SPEAKING);
                resetSilenceTimer();
              } else {
                // Wake word only: arm for 8 seconds
                isArmed = true;
                if (armedTimer) clearTimeout(armedTimer);
                armedTimer = setTimeout(() => {
                  isArmed = false;
                  armedTimer = null;
                  logEvent('armed_timeout', {});
                  // Reset indicator back to listening/idle
                  window.dispatchEvent(new CustomEvent('jarvis:state-change', { detail: { state: currentState } }));
                }, 8000);
                
                playBeep(587.33, 0.12);
                
                // Show visual prompt cue
                const isEn = listenIsEnglish();
                const label = isEn ? 'Yes? Go ahead...' : 'نعم؟ تفضّل...';
                window.dispatchEvent(new CustomEvent('jarvis:transcript-update', { detail: { text: label } }));
                
                try {
                  if (window.JarvisOrb) {
                    window.JarvisOrb.setMode('listening');
                    window.JarvisOrb.say(isEn ? 'YES?' : 'نعم؟', isEn ? 'Go ahead' : 'تفضّل');
                  }
                } catch (_) {}
                
                finalBuffer = '';
                interimBuffer = '';
              }
            } else {
              // No wake word and not armed: ignore speech
              const isEn = listenIsEnglish();
              const label = isEn ? 'Say "Hey Omni" or "Octagon" to command' : 'قل "يا أومني" أو "أوكتاجون" للأمر';
              window.dispatchEvent(new CustomEvent('jarvis:transcript-update', { detail: { text: label } }));
              
              finalBuffer = '';
              interimBuffer = '';
            }
          }
        } else {
          // Direct mode (default): run every command immediately. Wake word is optional and stripped.
          const wake = detectWakeWord(cleanFinal);
          const command = wake ? wake.remainder : cleanFinal;
          if (command) {
            finalBuffer = command;
            interimBuffer = '';
            setState(JARVIS_STATES.USER_SPEAKING);
            resetSilenceTimer();
          } else {
            // Only wake word in direct mode: acknowledge and keep listening
            playBeep(587.33, 0.10);
            try {
              if (window.JarvisOrb) {
                const isEn = listenIsEnglish();
                window.JarvisOrb.say(isEn ? 'YES?' : 'نعم؟', isEn ? 'Go ahead' : 'تفضّل');
              }
            } catch (_) {}
            finalBuffer = '';
            interimBuffer = '';
          }
        }
      }
    };

    recognition.onerror = function (event) {
      logEvent('recognition_error', { error: event.error });
      if (event.error === 'not-allowed') {
        setState(JARVIS_STATES.ERROR);
        return;
      }
      // The backend rejected the Arabic locale — retry with generic 'ar' so we
      // never silently drop into English listening.
      if (event.error === 'language-not-supported' && !listenIsEnglish() && !arLocaleFallback) {
        arLocaleFallback = true;
        logEvent('locale_fallback', { from: 'ar-SA', to: 'ar' });
        setTimeout(() => { if (recognition === session) setupSpeechRecognition(); }, 200);
      }
    };

    recognition.onend = function () {
      logEvent('recognition_end', {});
      // The session was capturing until this moment — remember that, so the
      // instant silent auto-restart below does not replay the "speak now" cue.
      if (audioStarted) lastAudioLiveAt = Date.now();
      if (currentState === JARVIS_STATES.LISTENING || currentState === JARVIS_STATES.USER_SPEAKING) {
        // Auto-restart if in hands-free mode
        if (currentVoiceMode === 'continuous') {
          setTimeout(() => {
            if (currentState === JARVIS_STATES.LISTENING || currentState === JARVIS_STATES.USER_SPEAKING) {
              start();
            }
          }, 150);
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      logEvent('recognition_start_exception', { message: e.message });
    }
  }

  function stopSpeechRecognition() {
    if (coldStartTimer) { clearTimeout(coldStartTimer); coldStartTimer = null; }
    if (recognition) {
      try {
        recognition.onstart = null;
        recognition.onaudiostart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      } catch (_) {}
      recognition = null;
    }
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      submitUserTurn();
    }, silenceDebounceMs);
  }
  async function submitUserTurn() {
    isArmed = false;
    if (armedTimer) clearTimeout(armedTimer);
    armedTimer = null;

    const text = finalBuffer.trim();
    finalBuffer = '';
    interimBuffer = '';
    if (silenceTimer) clearTimeout(silenceTimer);

    if (text.length < minUtteranceLength) {
      if (currentState === JARVIS_STATES.USER_SPEAKING) {
        setState(JARVIS_STATES.LISTENING);
      }
      return;
    }

    turnId++;
    logEvent('submit_turn', { turnId, text });
    setState(JARVIS_STATES.THINKING);
    // Stop capturing while we think — keeps the mic from hearing ambient noise or the
    // tail of the user's own sentence during processing. speak() re-arms it afterwards.
    stopSpeechRecognition();

    // Cancel existing abort controller if any
    if (activeAbortController) activeAbortController.abort();
    activeAbortController = new AbortController();

    // Check if we should delegate to assistant module's processJarvisTranscript
    const assistant = window.octagonAIAssistant;
    if (assistant && typeof assistant.processJarvisTranscript === 'function') {
      try {
        await assistant.processJarvisTranscript(text);
      } catch (err) {
        logEvent('turn_error', { turnId, error: err.message });
        setState(JARVIS_STATES.ERROR);
      }
      return;
    }

    try {
      // Build internal action/intent execution map context
      const context = {};
      if (window.JarvisBrain && typeof window.JarvisBrain.handle === 'function') {
        const response = await window.JarvisBrain.handle(text, { 
          turnId, 
          abortSignal: activeAbortController.signal 
        });
        
        // Expose a way to pass result back
        speak(response.text);
      } else {
        // Fallback simple response
        speak('نظام أومني جاهز، لكن مكتبة عقل النظام غير متصلة.');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        logEvent('turn_aborted', { turnId });
      } else {
        setState(JARVIS_STATES.ERROR);
        logEvent('turn_error', { turnId, error: err.message });
      }
    }
  }
  async function speak(text, resumeListening = true) {
    if (!text) return;
    const assistantModule = assistantBridge();
    const speechText = stripForSpeech(text);
    if (!speechText) {
      if (resumeListening && currentVoiceMode === 'continuous') start();
      return;
    }
    
    // Tag source: "assistant"
    lastAssistantSpeech = speechText;
    lastAssistantSpeechTime = Date.now();
    
    runId++;
    const myRun = runId;
    logEvent('speak', { runId, text: speechText });

    // Stop recording while speaking to prevent self-triggering
    stopSpeechRecognition();
    setState(JARVIS_STATES.SPEAKING);
    speechMuteGateActive = true;
    startStopWordRecognition(myRun);

    // Interruption / barge-in command listener is kept armed by ignoreMicUntil being 0
    // but we use speechMuteGateActive to stop transcribing normal words

    let finished = false;
    let safetyTimer = null;
    const speakFinished = () => {
      // Idempotent + turn-guarded: never let a stale/duplicate finish from an old turn
      // re-open the mic after a newer turn has already started.
      if (finished || myRun !== runId) return;
      finished = true;
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      speechMuteGateActive = false;
      stopStopWordRecognition();
      // Added a 600ms safety ignore window after TTS ends to absorb echoes/reverberations
      ignoreMicUntil = Date.now() + 600;

      if (currentState === JARVIS_STATES.SPEAKING) {
        setState(JARVIS_STATES.IDLE);
        if (resumeListening && currentVoiceMode === 'continuous') start();
      }
    };
    // SAFETY: estimate how long the reply takes to speak and force-finish if the TTS
    // engine never fires onended/onerror (some embedded WebViews + stalled audio do this).
    // Without this, a single silent TTS would wedge Omni in SPEAKING and the mic would
    // never come back — the worst possible failure for a hands-free assistant.
    // Generous estimate: the backstop must outlast even a long reply so it can never
    // resume the mic mid-sentence (which would make Omni hear himself). Cloud-TTS
    // tightens this to the real clip length below via onloadedmetadata.
    const estMs = Math.min(48000, Math.max(2500, speechText.length * 95));
    const armSafety = (ms) => {
      if (safetyTimer) clearTimeout(safetyTimer);
      safetyTimer = setTimeout(() => { logEvent('speak_safety_timeout', { runId: myRun }); speakFinished(); }, ms);
    };
    armSafety(estMs + 4000);

    // Synthesize Cloud Audio TTS (natural Arabic voice fallback)
    try {
      if (assistantModule && typeof assistantModule.synthesizeCloudTTS === 'function') {
        const url = await assistantModule.synthesizeCloudTTS(speechText, detectSpeechLangCode(speechText));
        if (myRun !== runId) { if (url) { try { URL.revokeObjectURL(url); } catch (_) {} } return; }
        if (url) {
          if (activeAudio) {
            try { activeAudio.pause(); } catch (_) {}
          }
          activeAudio = new Audio(url);
          activeAudio.onended = speakFinished;
          activeAudio.onerror = speakFinished;
          // Tighten the safety timer to the real clip length once it's known.
          activeAudio.onloadedmetadata = () => {
            if (myRun === runId && isFinite(activeAudio.duration) && activeAudio.duration > 0) {
              armSafety(activeAudio.duration * 1000 + 2500);
            }
          };
          await activeAudio.play();
          return;
        }
      }
    } catch (_) {}

    // Native Browser Fallback (if cloud TTS fails or is not present).
    // MIXED-TEXT FIX: one utterance gets ONE voice, and a voice only reads the
    // script it knows — Arabic text through an English voice (or vice versa)
    // is silently dropped, which is the "reads only the English words" bug.
    // So mixed Arabic/English replies are split into same-script runs, each
    // spoken with its own matching voice, chained in order.
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
      const hasAr = /[؀-ۿ]/.test(speechText);
      const hasLat = /[A-Za-z]/.test(speechText);
      const runs = (hasAr && hasLat) ? splitSpeechRuns(speechText) : [{ lang: hasAr ? 'ar' : 'en', text: speechText }];
      let runIdx = 0;
      const speakNextRun = () => {
        if (myRun !== runId) return; // interrupted/superseded — stop the chain
        if (runIdx >= runs.length) { speakFinished(); return; }
        const part = runs[runIdx++];
        const utterance = new SpeechSynthesisUtterance(part.text);
        utterance.lang = part.lang === 'ar' ? 'ar-SA' : 'en-US';
        const voice = pickSpeechVoice(utterance.lang);
        if (part.lang === 'ar' && !voice) warnMissingArabicVoiceOnce();
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        utterance.onend = speakNextRun;
        utterance.onerror = speakNextRun;
        try { window.speechSynthesis.speak(utterance); }
        catch (_) { speakNextRun(); }
      };
      speakNextRun();
    } else {
      speakFinished();
    }
  }

  // Windows without an installed Arabic voice CANNOT speak the Arabic chunks —
  // say so honestly once instead of silently skipping them.
  let _arVoiceWarned = false;
  function warnMissingArabicVoiceOnce() {
    if (_arVoiceWarned) return;
    _arVoiceWarned = true;
    console.warn('[OmniVoiceRuntime] No Arabic TTS voice installed; Arabic parts of replies may stay silent.');
    try {
      if (window.showToast) window.showToast(
        'لا يوجد صوت عربي مثبّت على النظام — المقاطع العربية قد لا تُنطق. أضِف صوتاً عربياً من إعدادات ويندوز: الوقت واللغة ← الكلام ← إضافة أصوات ← العربية، ثم أعد فتح المتصفح.',
        'warning');
    } catch (_) {}
  }

  // Split mixed Arabic/Latin text into same-script chunks. Neutral characters
  // (numbers, punctuation, emoji already stripped) stay with the current run.
  function splitSpeechRuns(text) {
    const runs = [];
    let cur = '';
    let curLang = null; // 'ar' | 'en'
    for (const ch of String(text || '')) {
      const lang = /[؀-ۿ]/.test(ch) ? 'ar' : (/[A-Za-z]/.test(ch) ? 'en' : null);
      if (lang && curLang && lang !== curLang) {
        if (cur.trim()) runs.push({ lang: curLang, text: cur.trim() });
        cur = ch;
        curLang = lang;
      } else {
        cur += ch;
        if (lang && !curLang) curLang = lang;
      }
    }
    if (cur.trim()) runs.push({ lang: curLang || 'ar', text: cur.trim() });
    return runs;
  }

  function startWatchdog() {
    stopWatchdog();
    watchdogInterval = setInterval(() => {
      // Watchdog: If state is LISTENING but recognition is not active, restart it
      if (currentState === JARVIS_STATES.LISTENING && !recognition) {
        logEvent('watchdog_revive', {});
        start();
      }
    }, 4000);
  }

  function stopWatchdog() {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      watchdogInterval = null;
    }
  }

  function getState() {
    return currentState;
  }

  function setProvider(provider) {
    currentProvider = provider;
    logEvent('set_provider', { provider });
  }

  function setVoiceMode(mode) {
    currentVoiceMode = mode; // 'continuous' | 'push_to_talk' | 'text'
    logEvent('set_voice_mode', { mode });
    if (mode === 'continuous') {
      start();
    } else {
      stopSpeechRecognition();
      setState(JARVIS_STATES.IDLE);
    }
  }

  function setWakeWordRequired(val) {
    wakeWordRequired = !!val;
    try {
      localStorage.setItem('jarvisWakeRequired', val ? '1' : '0');
    } catch (_) {}
    logEvent('set_wake_word_required', { value: wakeWordRequired });
    if (!wakeWordRequired) {
      isArmed = false;
      if (armedTimer) clearTimeout(armedTimer);
      armedTimer = null;
    }
  }

  // Export module
  window.JarvisVoiceRuntime = {
    init,
    start,
    stop,
    holdMic,
    interrupt,
    speak,
    submitUserTurn,
    getState,
    setProvider,
    setVoiceMode,
    setWakeWordRequired,
    STATES: JARVIS_STATES,
    LANGUAGE_MODE: JARVIS_LANGUAGE_MODE
  };
  // Compatibility alias: the user-facing assistant is named "Omni".
  // Same object — no behavior difference between the two names.
  window.OmniVoiceRuntime = window.JarvisVoiceRuntime;

  // Auto-init on load if in browser environment
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      window.JarvisVoiceRuntime.init();
    });
  }

})();
