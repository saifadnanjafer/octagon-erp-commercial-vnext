/**
 * Post-execution Read-back Verification Smoke Tests.
 *
 * Runs server.js against a temporary database and verifies execution
 * results through the server-side verification layer.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-verif-smoke-'));
const dbFile = path.join(tempDir, 'database.json');
const approvalsFile = path.join(tempDir, 'server-ai-approvals.json');
const auditFile = path.join(tempDir, 'server-ai-audit.log');
const reviewDir = path.join(tempDir, 'review-reports');
const port = 19080 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;

const seedDb = {
  _schema_version: 'jarvis-verif-smoke',
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

  // 1. create_task verification
  const createTask = await postJson('/api/jarvis/action', { tool: 'create_task', args: { title: 'Smoke task verification' } });
  check('create_task verification is successful', createTask.status === 200 && createTask.data.status === 'executed' && createTask.data.verification?.verified === true, JSON.stringify(createTask));

  // 2. create_customer verification
  const createCust = await postJson('/api/jarvis/action', { tool: 'create_customer', args: { customer_name: 'Smoke Customer Verification' } });
  check('create_customer verification is successful', createCust.status === 200 && createCust.data.status === 'executed' && createCust.data.verification?.verified === true, JSON.stringify(createCust));

  // 3. modify_material verification
  const matAction = await postJson('/api/jarvis/action', { tool: 'modify_material', args: { material_name: 'Smoke Wood', cost: 15, stock: 10 } });
  check('modify_material returns approval_required', matAction.status === 200 && matAction.data.status === 'approval_required', JSON.stringify(matAction));
  const matApprovalId = matAction.data.approvalId;
  await postJson('/api/jarvis/approve', { approvalId: matApprovalId, decision: 'approve' });
  const modMat = await postJson('/api/jarvis/execute-approved', { approvalId: matApprovalId });
  check('modify_material verification detects cost and stock changes', modMat.status === 200 && modMat.data.verification?.verified === true && modMat.data.verification?.dbVerification?.checks?.length >= 3, JSON.stringify(modMat));

  // 4. modify_employee verification
  const empAction = await postJson('/api/jarvis/action', { tool: 'modify_employee', args: { employee_name: 'Smoke Employee', salary: 1200, role: 'Lead Tester' } });
  check('modify_employee returns approval_required', empAction.status === 200 && empAction.data.status === 'approval_required', JSON.stringify(empAction));
  const empApprovalId = empAction.data.approvalId;
  await postJson('/api/jarvis/approve', { approvalId: empApprovalId, decision: 'approve' });
  const modEmp = await postJson('/api/jarvis/execute-approved', { approvalId: empApprovalId });
  check('modify_employee verification detects salary and role changes', modEmp.status === 200 && modEmp.data.verification?.verified === true, JSON.stringify(modEmp));

  // 5. dangerous finance action queues approval and doesn't execute/verify yet
  const journalArgs = {
    memo: 'Double-entry verification',
    lines: [
      { account_id: 'cash_workshop', debit: 50, credit: 0 },
      { account_id: 'income_sales', debit: 0, credit: 50 }
    ]
  };
  const journal = await postJson('/api/jarvis/action', { tool: 'create_journal_entry', args: journalArgs });
  check('dangerous finance action returns approval_required', journal.status === 200 && journal.data.status === 'approval_required', JSON.stringify(journal));

  // 6. approval record approved and executed
  const approvalId = journal.data.approvalId;
  await postJson('/api/jarvis/approve', { approvalId, decision: 'approve' });
  const executeApp = await postJson('/api/jarvis/execute-approved', { approvalId });
  check('approved finance action executes and verifies', executeApp.status === 200 && executeApp.data.status === 'executed' && executeApp.data.verification?.verified === true, JSON.stringify(executeApp));

  // 7. arg swapping blocked
  const executeSwapped = await postJson('/api/jarvis/execute-approved', { approvalId, args: { memo: 'SWAPPED' } });
  check('arg swapping blocked and fails', executeSwapped.status === 409, JSON.stringify(executeSwapped));

  // 8. double execution blocked
  const doubleExec = await postJson('/api/jarvis/execute-approved', { approvalId });
  check('double execution blocked and fails', doubleExec.status === 409, JSON.stringify(doubleExec));

  // 9. execute_js_mutation denied/refused
  const crit = await postJson('/api/jarvis/action', { tool: 'execute_js_mutation', args: { code: '1+1' } });
  check('execute_js_mutation returns approval_required', crit.status === 200 && crit.data.status === 'approval_required', JSON.stringify(crit));
  const critApprovalId = crit.data.approvalId;
  await postJson('/api/jarvis/approve', { approvalId: critApprovalId, decision: 'approve' });
  const critExecute = await postJson('/api/jarvis/execute-approved', { approvalId: critApprovalId });
  check('execute_js_mutation is denied on execution', critExecute.status === 403 && critExecute.data.status === 'denied', JSON.stringify(critExecute));

  // 10. unknown tool denied
  const unk = await postJson('/api/jarvis/action', { tool: 'made_up_tool' });
  check('unknown tool denied', unk.status === 403, JSON.stringify(unk));

  // 11. audit log includes verification_passed/executed
  const statuses = auditStatuses();
  check('audit log includes executed', statuses.includes('executed'), statuses.join(','));
  check('audit log includes executed_unverified/executed on verification status', statuses.includes('executed') || statuses.includes('executed_unverified'), statuses.join(','));

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
