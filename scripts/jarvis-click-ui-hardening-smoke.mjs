/**
 * Jarvis click_ui hardening smoke tests.
 *
 * Runs server.js against a temporary database and temporary Jarvis approval/audit
 * files so the live workshop database is not touched.
 *
 * Usage:
 *   node scripts/jarvis-click-ui-hardening-smoke.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-click-ui-smoke-'));
const dbFile = path.join(tempDir, 'database.json');
const approvalsFile = path.join(tempDir, 'server-ai-approvals.json');
const auditFile = path.join(tempDir, 'server-ai-audit.log');
const reviewDir = path.join(tempDir, 'review-reports');
const port = 19100 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;

const seedDb = {
  _schema_version: 'jarvis-click-ui-smoke',
  employees: [],
  finance: { customers: [], transactions: [], cashOpening: 0 },
  omni: { historyLedger: [], aiPendingJournalEntries: [], materials: [], taskManager: { selectedSpaceId: '', spaces: [] } },
  audit_log: []
};

fs.writeFileSync(dbFile, JSON.stringify(seedDb, null, 2), 'utf8');

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.log(`FAIL ${name}${detail ? ` -> ${detail}` : ''}`);
}

async function postJson(route, body) {
  const response = await fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { parseError: text.slice(0, 200) }; }
  return { status: response.status, data };
}

async function getJson(route) {
  const response = await fetch(base + route);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { parseError: text.slice(0, 200) }; }
  return { status: response.status, data };
}

async function waitForServer(child) {
  const deadline = Date.now() + 15000;
  let lastError = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode})`);
    try {
      const response = await fetch(base + '/api/server/status');
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready on ${base}: ${lastError}`);
}

function auditStatuses() {
  try {
    return fs.readFileSync(auditFile, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line).status);
  } catch (_) {
    return [];
  }
}

async function safeClick(name, args) {
  const grant = await postJson('/api/jarvis/action', { tool: 'click_ui', args });
  const okGrant = grant.status === 200 && grant.data.status === 'granted' && !!grant.data.grantId;
  check(`${name} receives server click grant`, okGrant, JSON.stringify(grant));
  if (!okGrant) return grant;
  const consumed = await postJson('/api/jarvis/consume-grant', { tool: 'click_ui', grantId: grant.data.grantId });
  check(`${name} consumes one-time click grant`, consumed.status === 200 && consumed.data.ok === true, JSON.stringify(consumed));
  const result = await postJson('/api/jarvis/result', { tool: 'click_ui', grantId: grant.data.grantId, ok: true, message: name });
  check(`${name} reports audited click result`, result.status === 200 && result.data.ok === true, JSON.stringify(result));
  return grant;
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    OCTAGON_DEFAULT_PORT: String(port),
    OCTAGON_FALLBACK_PORTS: String(port + 1),
    USE_SQLITE: 'false',
    OCTAGON_DB_FILE: dbFile,
    OCTAGON_BACKUP_DIR: tempDir,
    OCTAGON_REVIEW_REPORT_DIR: reviewDir,
    OCTAGON_JARVIS_APPROVALS_FILE: approvalsFile,
    OCTAGON_JARVIS_AUDIT_LOG_FILE: auditFile,
    NODE_ENV: 'development',
    OCTAGON_PRODUCTION: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

try {
  await waitForServer(server);

  const policy = await getJson('/api/jarvis/ui-policy');
  check('server exposes UI action policy', policy.status === 200 && policy.data.ok === true && Array.isArray(policy.data.policy?.exact), JSON.stringify(policy));
  check('policy lists safe modal action', policy.data.policy.exact.some(item => item.action === 'open_task_modal'));

  await safeClick('safe page navigation', {
    action_id: 'page.open.finance',
    label: 'Open finance page',
    selector: '.nav-btn[data-page="finance"]',
    page: 'calculator',
    kind: 'navigation',
    visible: true
  });

  await safeClick('safe tab switch', {
    action_id: 'tab:attendance',
    label: 'فتح تبويب الحضور',
    page: 'timesheet',
    kind: 'switch_tab',
    visible: true
  });

  await safeClick('safe modal open', {
    action_id: 'open-modal:create-task',
    label: 'فتح نافذة إنشاء مهمة',
    page: 'task_manager',
    kind: 'open_modal',
    visible: true
  });

  await safeClick('safe allowlisted filter action', {
    action_id: 'inventory.filter.low_stock',
    label: 'عرض المواد الناقصة',
    page: 'inventory',
    kind: 'apply_filter',
    visible: true
  });

  const deniedCases = [
    ['delete button is denied', { label: 'حذف العميل', selector: '#deleteCustomerBtn', page: 'customers', visible: true }],
    ['approve button is denied', { label: 'موافقة', selector: '#approveRequest', page: 'ai_queue', visible: true }],
    ['save submit button is denied', { label: 'حفظ البيانات', selector: '#saveEmployee', page: 'employees', visible: true }],
    ['payroll finalization button is denied', { label: 'إغلاق الشهر واعتماد الرواتب', selector: '#finalPayroll', page: 'workshop_ledger', visible: true }],
    ['finance journal post button is denied', { label: 'ترحيل قيد محاسبي', selector: '#postJournal', page: 'finance', visible: true }],
    ['unknown action id fails closed', { action_id: 'work_orders.submit_wizard', label: 'إنشاء أمر عمل جديد', page: 'work_orders', visible: true }],
    ['hidden safe-looking button is denied', { action_id: 'open-modal:create-task', label: 'فتح نافذة إنشاء مهمة', page: 'task_manager', visible: false }]
  ];
  for (const [name, args] of deniedCases) {
    const denied = await postJson('/api/jarvis/action', { tool: 'click_ui', args });
    check(name, denied.status === 403 && denied.data.status === 'denied', JSON.stringify(denied));
  }

  const approvalBypass = await postJson('/api/jarvis/execute-approved', {
    tool: 'click_ui',
    args: { label: 'حذف كل البيانات', selector: '#btnResetData', page: 'admin_panel', visible: true },
    clientActionId: 'legacy_click_ui_approval'
  });
  check('approval does not authorize sensitive generic DOM click', approvalBypass.status === 403 && approvalBypass.data.status === 'denied', JSON.stringify(approvalBypass));

  const statuses = auditStatuses();
  check('denied click_ui actions are logged', statuses.includes('denied'), statuses.join(','));
  check('allowed click_ui actions are logged', statuses.includes('granted') && statuses.includes('grant_consumed') && statuses.includes('executed'), statuses.join(','));
} catch (error) {
  fail += 1;
  console.log(`FAIL smoke harness crashed -> ${error.stack || error.message || error}`);
  console.log(serverOutput.slice(-3000));
} finally {
  server.kill();
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail) {
  console.log(`Temporary files kept for debugging: ${tempDir}`);
  process.exit(1);
}

try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
