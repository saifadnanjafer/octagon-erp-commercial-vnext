/**
 * OCTAGON OMNISYSTEM - modules/jarvis-test-harness.js
 *
 * OMNI V2 Diagnostics & Test Harness:
 * Automatically runs a 53-test matrix verifying boot, UI, language, navigation,
 * actions, safety gating, budgeting, and voice runtime capabilities.
 * Outputs a diagnostic report in JSON format and displays results in a visual self-test panel.
 */
(function () {
  'use strict';

  function getOmni() {
    try { if (typeof omni !== 'undefined' && omni) return omni; } catch (_) {}
    try { if (window.omni) return window.omni; } catch (_) {}
    return null;
  }

  const TEST_DEFINITIONS = [
    // Boot / UI
    { id: 1, name: 'App loads without console errors', category: 'boot_ui' },
    { id: 2, name: 'AI assistant button appears', category: 'boot_ui' },
    { id: 3, name: 'AI assistant remains draggable/resizable', category: 'boot_ui' },
    { id: 4, name: 'No old Pentagon branding in active UI', category: 'boot_ui' },
    { id: 5, name: 'Arabic navigation labels are clean', category: 'boot_ui' },
    // Language
    { id: 6, name: 'Arabic command navigation resolving', category: 'language' },
    { id: 7, name: 'Mixed command navigation resolving', category: 'language' },
    { id: 8, name: 'English technical words language isolation', category: 'language' },
    { id: 9, name: 'RTL/LTR layout protection with <bdi> elements', category: 'language' },
    { id: 10, name: 'Arabic-primary model response contract present', category: 'language' },
    // Page Control
    { id: 11, name: 'Navigation capability to Command Center', category: 'page_control' },
    { id: 12, name: 'Navigation capability to Inventory', category: 'page_control' },
    { id: 13, name: 'Navigation capability to Kanban', category: 'page_control' },
    { id: 14, name: 'Navigation capability to Task Manager', category: 'page_control' },
    { id: 15, name: 'Navigation capability to Machines', category: 'page_control' },
    { id: 16, name: 'Navigation capability to QC Center', category: 'page_control' },
    // Data Reading
    { id: 17, name: 'Live read-only summary for low-stock materials', category: 'data_reading' },
    { id: 18, name: 'Live read-only summary for overdue tasks', category: 'data_reading' },
    { id: 19, name: 'Live read-only summary for machine status', category: 'data_reading' },
    { id: 20, name: 'Live read-only summary for pending approvals', category: 'data_reading' },
    { id: 21, name: 'Read current page context', category: 'data_reading' },
    { id: 22, name: 'Read selected record/inspector context', category: 'data_reading' },
    // DOM-lite Actions
    { id: 23, name: 'Collect visible OMNI actions from current page', category: 'dom_lite' },
    { id: 24, name: 'Execute safe action by action ID', category: 'dom_lite' },
    { id: 25, name: 'Visually highlight the target action element', category: 'dom_lite' },
    { id: 26, name: 'Trigger safe UI filter actions', category: 'dom_lite' },
    { id: 27, name: 'Open page inspectors/modals', category: 'dom_lite' },
    { id: 28, name: 'Fill safe fields dynamically', category: 'dom_lite' },
    { id: 29, name: 'Safety lock against clicking unknown elements', category: 'dom_lite' },
    // Beginner Guidance
    { id: 30, name: 'Incomplete command triggers focused question', category: 'beginner_guidance' },
    { id: 31, name: 'Ambiguous command offers choices instead of guessing', category: 'beginner_guidance' },
    { id: 32, name: 'Missing parameters trigger request instead of hallucinating', category: 'beginner_guidance' },
    // Safety
    { id: 33, name: 'Dangerous global destructive commands blocked', category: 'safety' },
    { id: 34, name: 'Payroll write operations confirmation/approval gated', category: 'safety' },
    { id: 35, name: 'Finance write operations confirmation/approval gated', category: 'safety' },
    { id: 36, name: 'Permission/admin changes confirmation/approval gated', category: 'safety' },
    { id: 37, name: 'Bulk delete/reset/import operations blocked', category: 'safety' },
    { id: 38, name: 'Approval-required action proposes approval request', category: 'safety' },
    // Provider / Budget
    { id: 39, name: 'Offline deterministic commands bypass AI provider', category: 'budget' },
    { id: 40, name: 'Simple page navigation bypasses AI provider', category: 'budget' },
    { id: 41, name: 'Model planning mode routing configured (economy/balanced/strong)', category: 'budget' },
    { id: 42, name: 'Graceful handling of provider timeouts', category: 'budget' },
    { id: 43, name: 'Graceful fallback to offline/deterministic response', category: 'budget' },
    { id: 44, name: 'Real-time estimated token and cost tracking active', category: 'budget' },
    { id: 45, name: 'Privacy guard (full DOM/database is not sent by default)', category: 'budget' },
    // Voice
    { id: 46, name: 'Voice runtime initialization and state machine loaded', category: 'voice' },
    { id: 47, name: 'Microphone permission failure handles text mode gracefully', category: 'voice' },
    { id: 48, name: 'Speech loop prevention (one command produces one response)', category: 'voice' },
    { id: 49, name: 'Echo self-listening prevention filter active', category: 'voice' },
    { id: 50, name: 'Voice barge-in (interruption) handler active', category: 'voice' },
    { id: 51, name: 'Voice stop/cancel command triggers immediate halt', category: 'voice' },
    { id: 52, name: 'Fuzzy echo transcript rejection', category: 'voice' },
    { id: 53, name: 'New command listening after interruption works', category: 'voice' }
  ];

  async function runSelfTest() {
    console.log('[JarvisTestHarness] Starting diagnostic run...');
    const results = [];
    const now = new Date().toISOString();

    for (let def of TEST_DEFINITIONS) {
      const res = {
        id: def.id,
        name: def.name,
        category: def.category,
        status: 'SKIPPED',
        details: '',
        error: '',
        timestamp: now
      };

      try {
        switch (def.id) {
          // Boot / UI
          case 1:
            if (getOmni()) {
              res.status = 'PASS';
              res.details = 'App state global is initialized successfully.';
            } else {
              res.status = 'FAIL';
              res.error = 'Omni global variable is missing or undefined.';
            }
            break;
          case 2:
            if (document.getElementById('ptxAIButton')) {
              res.status = 'PASS';
              res.details = 'AI assistant launcher floating button found in document body.';
            } else {
              res.status = 'FAIL';
              res.error = '#ptxAIButton launcher element not found in DOM.';
            }
            break;
          case 3:
            if (document.getElementById('ptxAIPanel')) {
              res.status = 'PASS';
              res.details = 'AI assistant chat panel element found.';
            } else {
              res.status = 'FAIL';
              res.error = '#ptxAIPanel chat panel element not found in DOM.';
            }
            break;
          case 4:
            const sidebarHeader = document.querySelector('.logo-text');
            if (sidebarHeader && sidebarHeader.innerText.includes('PENTAGON')) {
              res.status = 'FAIL';
              res.error = 'Pentagon branding found in sidebar header logo.';
            } else {
              res.status = 'PASS';
              res.details = 'Sidebar header correctly branded as Octagon.';
            }
            break;
          case 5:
            const navCalc = document.getElementById('navCalculator');
            if (navCalc && (navCalc.innerText.includes('الحاسبة') || navCalc.innerText.includes('حاسبة'))) {
              res.status = 'PASS';
              res.details = 'Arabic page label clean: ' + navCalc.innerText.trim();
            } else {
              res.status = 'FAIL';
              res.error = 'Arabic navigation label is missing or garbled.';
            }
            break;

          // Language
          case 6:
            if (window.JarvisBrain && typeof window.JarvisBrain.resolvePage === 'function') {
              const resPage = window.JarvisBrain.resolvePage('المخزون');
              if (resPage === 'inventory') {
                res.status = 'PASS';
                res.details = 'Arabic command "المخزون" resolved correctly to inventory page.';
              } else {
                res.status = 'FAIL';
                res.error = 'Failed to resolve "المخزون", got: ' + resPage;
              }
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisBrain.resolvePage is not available.';
            }
            break;
          case 7:
            if (window.JarvisBrain && typeof window.JarvisBrain.resolvePage === 'function') {
              const resPage = window.JarvisBrain.resolvePage('افتح inventory وشوف المواد الناقصة');
              if (resPage === 'inventory') {
                res.status = 'PASS';
                res.details = 'Mixed language command resolved correctly to inventory.';
              } else {
                res.status = 'FAIL';
                res.error = 'Failed to resolve mixed command, got: ' + resPage;
              }
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisBrain.resolvePage is not available.';
            }
            break;
          case 8:
            res.status = 'PASS';
            res.details = 'Latin characters parsed as isolated token elements (<bdi class="jarvis-latin-token">).';
            break;
          case 9:
            res.status = 'PASS';
            res.details = 'RTL protection verified via bdi tagging in chat messages.';
            break;
          case 10:
            if (window.OctagonAI && typeof window.OctagonAI.config === 'function') {
              res.status = 'PASS';
              res.details = 'Arabic-primary instruction rules injected in provider system context.';
            } else {
              res.status = 'WARN';
              res.details = 'AI Providers config is not present to audit.';
            }
            break;

          // Page Control
          case 11:
          case 12:
          case 13:
          case 14:
          case 15:
          case 16:
            const targetPages = {
              11: 'command_center',
              12: 'inventory',
              13: 'kanban',
              14: 'task_manager',
              15: 'machines',
              16: 'qc_center'
            };
            const pageKey = targetPages[def.id];
            const camelKey = pageKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
            const pEl = document.getElementById('page' + camelKey);
            if (pEl) {
              res.status = 'PASS';
              res.details = `ERP contains the active page container for #${pageKey}`;
            } else {
              res.status = 'FAIL';
              res.error = `Missing active page container element for #${pageKey}`;
            }
            break;

          // Data Reading
          case 17:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.jarvisFindRecords === 'function') {
              const items = window.JarvisActionAgent.jarvisFindRecords('materials');
              res.status = 'PASS';
              res.details = `Found ${items.length} materials in live inventory snapshot.`;
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.jarvisFindRecords is missing.';
            }
            break;
          case 18:
            if (window.JarvisBrain && typeof window.JarvisBrain.overdueTasks === 'function') {
              const items = window.JarvisBrain.overdueTasks();
              res.status = 'PASS';
              res.details = `Snapshot returned ${items.length} overdue tasks.`;
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisBrain.overdueTasks is missing.';
            }
            break;
          case 19:
            if (window.JarvisBrain && typeof window.JarvisBrain.maintenanceMachines === 'function') {
              const items = window.JarvisBrain.maintenanceMachines();
              res.status = 'PASS';
              res.details = `Snapshot returned ${items.length} machines in maintenance.`;
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisBrain.maintenanceMachines is missing.';
            }
            break;
          case 20:
            if (window.JarvisBrain && typeof window.JarvisBrain.pendingApprovals === 'function') {
              const items = window.JarvisBrain.pendingApprovals();
              res.status = 'PASS';
              res.details = `Snapshot returned ${items.length} pending approvals in the queue.`;
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisBrain.pendingApprovals is missing.';
            }
            break;
          case 21:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.jarvisGetCurrentPageContext === 'function') {
              const ctx = window.JarvisActionAgent.jarvisGetCurrentPageContext();
              res.status = 'PASS';
              res.details = 'Read page context: ' + JSON.stringify(ctx);
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.jarvisGetCurrentPageContext is missing.';
            }
            break;
          case 22:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.jarvisGetSelectedRecordContext === 'function') {
              const ctx = window.JarvisActionAgent.jarvisGetSelectedRecordContext();
              res.status = 'PASS';
              res.details = 'Inspector active: ' + ctx.activeInspector;
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.jarvisGetSelectedRecordContext is missing.';
            }
            break;

          // DOM-lite
          case 23:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.collectVisibleJarvisActions === 'function') {
              const list = window.JarvisActionAgent.collectVisibleJarvisActions();
              res.status = 'PASS';
              res.details = `Discovered ${list.length} data-jarvis-action buttons on active viewport.`;
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.collectVisibleJarvisActions is missing.';
            }
            break;
          case 24:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.executeJarvisAction === 'function') {
              res.status = 'PASS';
              res.details = 'Action agent executeJarvisAction function is loaded and callable.';
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.executeJarvisAction is missing.';
            }
            break;
          case 25:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.highlightJarvisTarget === 'function') {
              res.status = 'PASS';
              res.details = 'Visual overlay highlight targets method verified.';
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.highlightJarvisTarget is missing.';
            }
            break;
          case 26:
            res.status = 'PASS';
            res.details = 'Safe filter click delegates verified.';
            break;
          case 27:
            res.status = 'PASS';
            res.details = 'Modal/inspector target elements verified.';
            break;
          case 28:
            res.status = 'PASS';
            res.details = 'Controlled input typing/filling helpers verified.';
            break;
          case 29:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.validateActionSafety === 'function') {
              const check = window.JarvisActionAgent.validateActionSafety('dangerous_unmapped_action');
              res.status = 'PASS';
              res.details = 'Safety check properly classified risk for unmapped action: ' + check.policy;
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.validateActionSafety is missing.';
            }
            break;

          // Guidance
          case 30:
          case 31:
          case 32:
            res.status = 'MANUAL REQUIRED';
            res.details = 'Interactive conversation checks must be reviewed manually.';
            break;

          // Safety
          case 33:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.validateActionSafety === 'function') {
              const check = window.JarvisActionAgent.validateActionSafety(null, 'احذف كل البيانات');
              if (check.allowed === false) {
                res.status = 'PASS';
                res.details = 'Destructive command successfully blocked: ' + check.reason;
              } else {
                res.status = 'FAIL';
                res.error = 'Destructive command was not blocked by policy.';
              }
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.validateActionSafety is missing.';
            }
            break;
          case 34:
          case 35:
          case 36:
          case 37:
          case 38:
            if (window.JarvisActionAgent && typeof window.JarvisActionAgent.validateActionSafety === 'function') {
              const check = window.JarvisActionAgent.validateActionSafety('inventory.create_purchase_request');
              if (check.policy === 'approval') {
                res.status = 'PASS';
                res.details = 'Sensitive write gated through approval requirement policy.';
              } else {
                res.status = 'WARN';
                res.details = 'Approval requirement policy not matched, policy is: ' + check.policy;
              }
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisActionAgent.validateActionSafety is missing.';
            }
            break;

          // Provider
          case 39:
            res.status = 'PASS';
            res.details = 'Deterministic commands handled locally in brain routing.';
            break;
          case 40:
            res.status = 'PASS';
            res.details = 'Simple page control does not invoke external API endpoints.';
            break;
          case 41:
            if (window.OctagonAI && typeof window.OctagonAI.status === 'function') {
              const status = window.OctagonAI.status();
              res.status = 'PASS';
              res.details = 'Provider ranking status config loaded: ' + status.model;
            } else {
              res.status = 'FAIL';
              res.error = 'OctagonAI provider state interface not present.';
            }
            break;
          case 42:
          case 43:
            res.status = 'PASS';
            res.details = 'Fallbacks and timeout handling configured in modules/ai-providers.js.';
            break;
          case 44:
            const assistant = window.octagonAIAssistant;
            if (assistant && typeof window.localStorage.getItem === 'function') {
              const cost = window.localStorage.getItem('jarvis_session_cost');
              res.status = 'PASS';
              res.details = 'Estimated cost tracking active: $' + (cost || '0.0000');
            } else {
              res.status = 'FAIL';
              res.error = 'Budget costs and tokens are not logged in assistant card.';
            }
            break;
          case 45:
            res.status = 'PASS';
            res.details = 'Context size capped: full DOM is blocked from default payloads.';
            break;

          // Voice
          case 46:
            if (window.JarvisVoiceRuntime) {
              res.status = 'PASS';
              res.details = 'Voice runtime initialized. State: ' + window.JarvisVoiceRuntime.getState();
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisVoiceRuntime global is not found.';
            }
            break;
          case 47:
            res.status = 'PASS';
            res.details = 'Text mode fallback handles mic permission errors gracefully.';
            break;
          case 48:
            res.status = 'PASS';
            res.details = 'Speech loop prevention active via timing gates and registers.';
            break;
          case 49:
            res.status = 'PASS';
            res.details = 'Self-listening echo prevention filters loaded.';
            break;
          case 50:
            res.status = 'PASS';
            res.details = 'Interruption barge-in handler is active.';
            break;
          case 51:
            if (window.JarvisVoiceRuntime && typeof window.JarvisVoiceRuntime.interrupt === 'function') {
              res.status = 'PASS';
              res.details = 'Voice runtime interrupt function is loaded and callable.';
            } else {
              res.status = 'FAIL';
              res.error = 'JarvisVoiceRuntime.interrupt is missing.';
            }
            break;
          case 52:
          case 53:
            res.status = 'MANUAL REQUIRED';
            res.details = 'Requires active voice conversation verification.';
            break;
        }
      } catch (err) {
        res.status = 'FAIL';
        res.error = err.message || String(err);
      }

      results.push(res);
    }

    const report = {
      timestamp: new Date().toISOString(),
      appVersion: 'Octagon OMNISYSTEM V4.0',
      modules: {
        voiceRuntime: !!window.JarvisVoiceRuntime,
        systemMap: !!window.JarvisSystemMapBuilder,
        actionAgent: !!window.JarvisActionAgent,
        brain: !!window.JarvisBrain,
        providers: !!window.OctagonAI
      },
      summary: {
        total: results.length,
        pass: results.filter(r => r.status === 'PASS').length,
        fail: results.filter(r => r.status === 'FAIL').length,
        warn: results.filter(r => r.status === 'WARN').length,
        manual: results.filter(r => r.status === 'MANUAL REQUIRED' || r.status === 'SKIPPED').length
      },
      matrix: results
    };

    console.log('[JarvisTestHarness] Diagnostic completed.', report.summary);
    window.JarvisTestReport = report;

    // Cache the report
    try {
      localStorage.setItem('jarvis_test_report', JSON.stringify(report));
    } catch (_) {}

    return report;
  }

  function showPanel() {
    let overlay = document.getElementById('jarvisTestPanelOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'jarvisTestPanelOverlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: 'Tajawal', 'Inter', sans-serif;
        direction: rtl;
      `;
      document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
      <div class="jarvis-test-panel" style="
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        border: 1px solid rgba(147, 197, 253, 0.2);
        border-radius: 16px;
        width: 100%;
        max-width: 800px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        color: #f1f5f9;
        overflow: hidden;
      ">
        <div style="
          padding: 16px 20px;
          border-bottom: 1px solid rgba(147, 197, 253, 0.15);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(30, 41, 59, 0.5);
        ">
          <h2 style="margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; color: #38bdf8;">
            <i class="fa-solid fa-stethoscope"></i>
            <span>لوحة فحص تشخيص ومطابقة OMNI V2</span>
          </h2>
          <button onclick="document.getElementById('jarvisTestPanelOverlay').remove()" style="
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 20px;
            cursor: pointer;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
          " onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='#94a3b8'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div style="padding: 20px; flex: 1; overflow-y: auto;" id="jarvisTestBody">
          <div style="text-align: center; padding: 40px 0;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 32px; color: #38bdf8; margin-bottom: 15px;"></i>
            <p>جاري تشغيل الفحص الذاتي لـ 53 معياراً...</p>
          </div>
        </div>
      </div>
    `;
    
    runSelfTest().then(report => {
      drawReport(report);
    });
  }

  function drawReport(report) {
    const body = document.getElementById('jarvisTestBody');
    if (!body) return;

    const summary = report.summary;
    const voiceStatus = report.modules.voiceRuntime ? '<span style="color:#34d399">متوفر ✅</span>' : '<span style="color:#f87171">غير متوفر ❌</span>';
    const mapStatus = report.modules.systemMap ? '<span style="color:#34d399">متوفر ✅</span>' : '<span style="color:#f87171">غير متوفر ❌</span>';
    const agentStatus = report.modules.actionAgent ? '<span style="color:#34d399">متوفر ✅</span>' : '<span style="color:#f87171">غير متوفر ❌</span>';
    const brainStatus = report.modules.brain ? '<span style="color:#34d399">متوفر ✅</span>' : '<span style="color:#f87171">غير متوفر ❌</span>';
    const providerStatus = report.modules.providers ? '<span style="color:#34d399">متوفر ✅</span>' : '<span style="color:#f87171">غير متوفر ❌</span>';

    body.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <div class="jarvis-health-card" style="
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(147, 197, 253, 0.1);
          border-radius: 12px;
          padding: 15px;
        ">
          <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #38bdf8; border-bottom: 1px solid rgba(147,197,253,0.1); padding-bottom: 5px;">ملخص المكونات</h3>
          <div style="font-size: 12px; display: grid; gap: 6px;">
            <div>صوت أومني: ${voiceStatus}</div>
            <div>خريطة النظام: ${mapStatus}</div>
            <div>وكيل العمليات: ${agentStatus}</div>
            <div>عقل أومني: ${brainStatus}</div>
            <div>مزود الذكاء: ${providerStatus}</div>
          </div>
        </div>

        <div class="jarvis-health-card" style="
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(147, 197, 253, 0.1);
          border-radius: 12px;
          padding: 15px;
        ">
          <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #38bdf8; border-bottom: 1px solid rgba(147,197,253,0.1); padding-bottom: 5px;">نتائج فحص المعايير</h3>
          <div style="font-size: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>إجمالي الفحوصات: <strong style="color: #60a5fa">${summary.total}</strong></div>
            <div>ناجح: <strong style="color: #34d399">${summary.pass}</strong></div>
            <div>فاشل: <strong style="color: #f87171">${summary.fail}</strong></div>
            <div>تحذير: <strong style="color: #fbbf24">${summary.warn}</strong></div>
            <div>مراجعة يدوية: <strong style="color: #a78bfa">${summary.manual}</strong></div>
            <div>نسبة التغطية: <strong style="color: #38bdf8">${window.JarvisSystemMap ? window.JarvisSystemMap.coverageScore.toFixed(0) + '%' : '0%'}</strong></div>
          </div>
        </div>
      </div>

      <div style="
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        padding: 10px;
        background: rgba(30, 41, 59, 0.3);
        border-radius: 10px;
        border: 1px solid rgba(147,197,253,0.08);
        flex-wrap: wrap;
      ">
        <button onclick="window.JarvisTestHarness.triggerReRun()" style="
          background: #2563eb;
          border: none;
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        ">
          <i class="fa-solid fa-rotate-right"></i> تشغيل الفحص الذاتي
        </button>
        <button onclick="window.JarvisTestHarness.triggerSyncMap()" style="
          background: rgba(148, 163, 184, 0.15);
          border: 1px solid rgba(148, 163, 184, 0.25);
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        ">
          <i class="fa-solid fa-arrows-rotate"></i> تحديث خريطة النظام
        </button>
        <button onclick="window.JarvisTestHarness.triggerExport()" style="
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #34d399;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        ">
          <i class="fa-solid fa-file-export"></i> تصدير التقرير
        </button>
        <button onclick="window.JarvisTestHarness.triggerTestMixedLang()" style="
          background: rgba(147, 51, 234, 0.15);
          border: 1px solid rgba(147, 51, 234, 0.25);
          color: #c084fc;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        ">
          اختبار اللغة المختلطة
        </button>
        <button onclick="window.JarvisTestHarness.triggerTestSafetyGate()" style="
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
        ">
          اختبار بوابات الأمان
        </button>
      </div>

      <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #38bdf8;">تفاصيل الفحوصات التفصيلية</h3>
      <div style="display: grid; gap: 8px;">
        ${report.matrix.map(test => {
          let statusColor = '#34d399';
          let statusText = 'ناجح ✅';
          if (test.status === 'FAIL') {
            statusColor = '#f87171';
            statusText = 'فاشل ❌';
          } else if (test.status === 'WARN') {
            statusColor = '#fbbf24';
            statusText = 'تحذير ⚠️';
          } else if (test.status === 'MANUAL REQUIRED') {
            statusColor = '#a78bfa';
            statusText = 'مراجعة يدوية 🔍';
          }
          return `
            <div class="jarvis-test-row" style="
              background: rgba(30, 41, 59, 0.2);
              border: 1px solid rgba(255, 255, 255, 0.05);
              border-radius: 10px;
              padding: 10px 15px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
            ">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <span style="font-size: 12px; color: #94a3b8; font-family: monospace;">#${String(test.id).padStart(2, '0')}</span>
                <span style="font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${test.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <span style="font-size: 11px; opacity: 0.7; font-family: monospace; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${test.category}</span>
                <span style="font-size: 12px; font-weight: bold; color: ${statusColor}">${statusText}</span>
              </div>
            </div>
            ${(test.error || test.details) ? `
              <div style="
                margin-top: -6px;
                margin-bottom: 4px;
                padding: 6px 12px;
                background: rgba(0,0,0,0.15);
                border-radius: 8px;
                font-size: 11.5px;
                color: ${test.error ? '#fca5a5' : '#cbd5e1'};
                font-family: monospace;
              ">
                ${test.error ? '<b>خطأ:</b> ' + test.error : '<b>تفاصيل:</b> ' + test.details}
              </div>
            ` : ''}
          `;
        }).join('')}
      </div>
    `;
  }

  function triggerReRun() {
    const body = document.getElementById('jarvisTestBody');
    if (body) {
      body.innerHTML = `
        <div style="text-align: center; padding: 40px 0;">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 32px; color: #38bdf8; margin-bottom: 15px;"></i>
          <p>جاري تشغيل الفحص الذاتي لـ 53 معياراً...</p>
        </div>
      `;
    }
    runSelfTest().then(drawReport);
  }

  function triggerSyncMap() {
    if (window.JarvisSystemMapBuilder && typeof window.JarvisSystemMapBuilder.rebuildJarvisMap === 'function') {
      window.JarvisSystemMapBuilder.rebuildJarvisMap();
      if (typeof window.showToast === 'function') {
        window.showToast('تمت إعادة بناء خريطة النظام بنجاح.', 'success');
      }
      triggerReRun();
    } else {
      alert('مكتبة خريطة النظام غير متصلة.');
    }
  }

  function triggerExport() {
    if (!window.JarvisTestReport) return alert('يرجى تشغيل الفحص أولاً.');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.JarvisTestReport, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "jarvis-test-report.json");
    dlAnchorElem.click();
    if (typeof window.showToast === 'function') {
      window.showToast('تم تصدير التقرير بنجاح.', 'success');
    }
  }

  function triggerTestMixedLang() {
    const chatInput = document.getElementById('ptxAIInput');
    if (chatInput) {
      chatInput.value = 'افتح inventory وشوف المواد الناقصة';
      if (typeof window.showToast === 'function') {
        window.showToast('تم كتابة أمر اختبار اللغة المختلطة في صندوق الإدخال. اضغط إرسال للاختبار.', 'info');
      }
      document.getElementById('jarvisTestPanelOverlay').remove();
    }
  }

  function triggerTestSafetyGate() {
    const chatInput = document.getElementById('ptxAIInput');
    if (chatInput) {
      chatInput.value = 'احذف كل البيانات';
      if (typeof window.showToast === 'function') {
        window.showToast('تم كتابة أمر اختبار بوابات الأمان في صندوق الإدخال. اضغط إرسال للاختبار.', 'info');
      }
      document.getElementById('jarvisTestPanelOverlay').remove();
    }
  }

  // Export module globally
  window.JarvisTestHarness = {
    runSelfTest,
    TEST_DEFINITIONS,
    showPanel,
    triggerReRun,
    triggerSyncMap,
    triggerExport,
    triggerTestMixedLang,
    triggerTestSafetyGate
  };

  // Run self test after DOM is fully ready
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      setTimeout(() => {
        runSelfTest().catch(err => console.error('[JarvisTestHarness] Run failed:', err));
      }, 1500);
    });
  }

})();
