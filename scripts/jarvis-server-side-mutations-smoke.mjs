/**
 * Server-side Jarvis mutation smoke tests.
 *
 * Runs server.js against a temporary database and temporary Jarvis approval/audit
 * files so the live workshop database is not touched.
 *
 * Usage:
 *   node scripts/jarvis-server-side-mutations-smoke.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-jarvis-smoke-'));
const dbFile = path.join(tempDir, 'database.json');
const approvalsFile = path.join(tempDir, 'server-ai-approvals.json');
const auditFile = path.join(tempDir, 'server-ai-audit.log');
const reviewDir = path.join(tempDir, 'review-reports');
const port = 18080 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;

const seedDb = {
  _schema_version: 'jarvis-server-smoke',
  employees: [
    { id: 'emp_smoke', name: 'Smoke Employee', salary: 1000, role: 'Tester', status: 'active' }
  ],
  finance: { customers: [], transactions: [], cashOpening: 0 },
  omni: {
    historyLedger: [],
    aiPendingJournalEntries: [],
    materials: [{ id: 'mat_smoke', name: 'Smoke Wood', stock: 5, minimum: 2, cost: 10, unit: 'pcs' }],
    taskManager: {
      selectedSpaceId: 'space_smoke',
      spaces: [{
        id: 'space_smoke',
        name: 'Smoke',
        departments: [{
          id: 'dep_smoke',
          name: 'Smoke Dept',
          sections: [{
            id: 'sec_smoke',
            name: 'Smoke Section',
            taskTypes: [{ id: 'type_smoke', name: 'General', tasks: [] }]
          }]
        }]
      }]
    }
  },
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

function countTasks(db) {
  let total = 0;
  const spaces = db?.omni?.taskManager?.spaces || [];
  spaces.forEach(space => (space.departments || []).forEach(dep => (dep.sections || []).forEach(sec => {
    (sec.taskTypes || []).forEach(type => { total += (type.tasks || []).length; });
  })));
  return total;
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
  return response.json();
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

function readApprovals() {
  try { return JSON.parse(fs.readFileSync(approvalsFile, 'utf8')); } catch (_) { return []; }
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

  const initialDb = await getJson('/api/db');
  const initialTaskCount = countTasks(initialDb);

  const unknown = await postJson('/api/jarvis/action', { tool: 'totally_made_up_tool', args: { amount: 1 } });
  check('unknown tool fails closed', unknown.status === 403 && unknown.data.status === 'denied', JSON.stringify(unknown));
  check('unknown tool did not create approval', !readApprovals().some(item => item.tool === 'totally_made_up_tool'));

  const readOnly = await postJson('/api/jarvis/action', { tool: 'navigate', args: { page: 'finance' } });
  check('read-only tool still receives legacy safe grant', readOnly.status === 200 && readOnly.data.status === 'granted' && !!readOnly.data.grantId, JSON.stringify(readOnly));

  const createTask = await postJson('/api/jarvis/action', { tool: 'create_task', args: { title: 'Smoke server task', priority: 'high' } });
  check('create_task executes server-side', createTask.status === 200 && createTask.data.status === 'executed' && !!createTask.data.result?.taskId, JSON.stringify(createTask));
  const afterTaskDb = await getJson('/api/db');
  check('create_task persisted through server DB', countTasks(afterTaskDb) === initialTaskCount + 1, `before=${initialTaskCount} after=${countTasks(afterTaskDb)}`);

  const createCustomer = await postJson('/api/jarvis/action', { tool: 'create_customer', args: { customer_name: 'Smoke Customer' } });
  check('create_customer executes server-side', createCustomer.status === 200 && createCustomer.data.status === 'executed' && !!createCustomer.data.result?.customerId, JSON.stringify(createCustomer));
  const afterCustomerDb = await getJson('/api/db');
  check('create_customer persisted through server DB', afterCustomerDb.finance.customers.some(c => c.name === 'Smoke Customer'));

  const journalArgs = {
    memo: 'Smoke approved original memo',
    date: '2026-07-05',
    lines: [
      { account_id: 'cash_workshop', debit: 10, credit: 0, label: 'debit' },
      { account_id: 'income_sales', debit: 0, credit: 10, label: 'credit' }
    ]
  };
  const beforeApprovalDb = await getJson('/api/db');
  const beforePendingCount = beforeApprovalDb.omni.aiPendingJournalEntries.length;
  const journal = await postJson('/api/jarvis/action', { tool: 'create_journal_entry', args: journalArgs });
  check('dangerous finance action returns approval_required', journal.status === 200 && journal.data.status === 'approval_required' && !!journal.data.approvalId, JSON.stringify(journal));
  const afterApprovalDb = await getJson('/api/db');
  check('approval request did not mutate finance records', afterApprovalDb.omni.aiPendingJournalEntries.length === beforePendingCount);

  const approvalId = journal.data.approvalId;
  const approve = await postJson('/api/jarvis/approve', { approvalId, decision: 'approve' });
  check('approval record can be approved server-side', approve.status === 200 && approve.data.status === 'approved', JSON.stringify(approve));

  const swappedArgs = {
    memo: 'SWAPPED CLIENT MEMO SHOULD NOT POST',
    lines: [
      { account_id: 'cash_workshop', debit: 999, credit: 0 },
      { account_id: 'income_sales', debit: 0, credit: 999 }
    ]
  };
  const execute = await postJson('/api/jarvis/execute-approved', { approvalId, args: swappedArgs });
  check('approved finance action executes server-side', execute.status === 200 && execute.data.status === 'executed' && !!execute.data.result?.pendingEntryId, JSON.stringify(execute));
  const afterExecuteDb = await getJson('/api/db');
  const posted = afterExecuteDb.omni.aiPendingJournalEntries.find(item => item.id === execute.data.result.pendingEntryId);
  check('approved args are immutable against execute-time swapping', posted && posted.memo === journalArgs.memo && posted.amount_total === 10, JSON.stringify(posted));

  const executeAgain = await postJson('/api/jarvis/execute-approved', { approvalId });
  check('approved action cannot execute twice', executeAgain.status === 409, JSON.stringify(executeAgain));

  const critical = await postJson('/api/jarvis/action', { tool: 'execute_js_mutation', args: { code: 'omni.materials = []' } });
  const criticalApprove = critical.data.approvalId
    ? await postJson('/api/jarvis/approve', { approvalId: critical.data.approvalId, decision: 'approve' })
    : null;
  const criticalExecute = critical.data.approvalId
    ? await postJson('/api/jarvis/execute-approved', { approvalId: critical.data.approvalId })
    : null;
  check('critical JS mutation is not executed by approval path', critical.status === 200 && criticalApprove?.status === 200 && criticalExecute?.status === 403 && criticalExecute.data.status === 'denied', JSON.stringify({ critical, criticalApprove, criticalExecute }));

  const brainText = fs.readFileSync(path.join(ROOT, 'modules', 'jarvis-brain.js'), 'utf8');
  const govText = fs.readFileSync(path.join(ROOT, 'modules', 'ai-governance.js'), 'utf8');
  check('client write wrappers fail closed when server is unavailable', /catch \(_\) \{ resp = null; \}/.test(brainText) && /Server gate unreachable/.test(brainText));
  check('client refreshes state from real DB after server mutation', /function refreshServerState/.test(brainText) && /fetch\('\/api\/db'\)/.test(brainText));
  check('approved UI path calls execute-approved, not client mutation', /\/api\/jarvis\/execute-approved/.test(govText) && /via: 'server_gate'/.test(govText));

  const statuses = auditStatuses();
  ['requested', 'approval_queued', 'approved', 'executed', 'denied'].forEach(status => {
    check(`audit log includes ${status}`, statuses.includes(status), statuses.join(','));
  });
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
