import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const ROOT = process.cwd();
const scratchDir = path.join(ROOT, 'scratch', 'server-tenant-api-test');
const backupDir = path.join(scratchDir, 'backups');
const dbFile = path.join(scratchDir, 'database.json');
const port = 18080 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

fs.rmSync(scratchDir, { recursive: true, force: true });
fs.mkdirSync(backupDir, { recursive: true });

const seedDb = {
  employees: [
    { id: 'emp_active', name: 'Active Employee', companyId: 'co_a', is_active: true },
    { id: 'emp_foreign', name: 'Foreign Employee', companyId: 'co_b', is_active: true },
  ],
  omni: {
    adminSettings: {
      organization: {
        multiTenant: true,
        activeCompanyId: 'co_a',
        currency: 'IQD',
        currencySymbol: 'د.ع',
        companies: [
          { id: 'co_a', name: 'Active Co', isPrimary: true },
          { id: 'co_b', name: 'Foreign Co', isPrimary: false },
        ],
      },
    },
    materials: [
      { id: 'mat_active', name: 'Active Material', companyId: 'co_a', is_active: true },
      { id: 'mat_foreign', name: 'Foreign Material', companyId: 'co_b', is_active: true },
      { id: 'mat_legacy', name: 'Legacy Material', is_active: true },
    ],
  },
  audit_log: [],
};

fs.writeFileSync(dbFile, JSON.stringify(seedDb, null, 2), 'utf8');

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    USE_SQLITE: 'false',
    OCTAGON_DB_FILE: dbFile,
    OCTAGON_BACKUP_DIR: backupDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
server.stdout.on('data', chunk => { stdout += chunk.toString(); });
server.stderr.on('data', chunk => { stderr += chunk.toString(); });

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/db`);
      if (res.ok) return;
    } catch (_) {}
    await delay(150);
  }
  throw new Error(`Server did not start. stdout=${stdout.slice(-500)} stderr=${stderr.slice(-500)}`);
}

async function getDb() {
  const res = await fetch(`${baseUrl}/api/db`);
  if (!res.ok) throw new Error(`GET /api/db failed: ${res.status}`);
  return res.json();
}

async function postJson(pathName, payload) {
  const res = await fetch(`${baseUrl}${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = {};
  try { body = await res.json(); } catch (_) {}
  return { ok: res.ok, status: res.status, body };
}

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

try {
  await waitForServer();

  const createActive = await postJson('/api/record', {
    collection: 'employees',
    id: 'emp_new',
    data: { id: 'emp_new', name: 'Stamped Employee', is_active: true },
  });
  let db = await getDb();
  const stamped = db.employees.find(emp => emp.id === 'emp_new');
  check('record create stamps active company', createActive.ok && stamped?.companyId === 'co_a');

  const foreignUpdate = await postJson('/api/record', {
    collection: 'employees',
    id: 'emp_foreign',
    data: { id: 'emp_foreign', name: 'Should Block', companyId: 'co_b', is_active: true },
  });
  db = await getDb();
  check('record update blocks foreign company', !foreignUpdate.ok && db.employees.find(emp => emp.id === 'emp_foreign')?.name === 'Foreign Employee');

  const newForeign = await postJson('/api/record', {
    collection: 'employees',
    id: 'emp_bad_foreign',
    data: { id: 'emp_bad_foreign', name: 'Bad Foreign', companyId: 'co_b', is_active: true },
  });
  db = await getDb();
  check('record create blocks explicit foreign company', !newForeign.ok && !db.employees.some(emp => emp.id === 'emp_bad_foreign'));

  const collectionReplace = await postJson('/api/collection', {
    collection: 'employees',
    data: [
      { id: 'emp_active', name: 'Active Renamed', companyId: 'co_a', is_active: true },
      { id: 'emp_new', name: 'Stamped Employee 2', companyId: 'co_a', is_active: true },
    ],
  });
  db = await getDb();
  check('collection replace preserves omitted foreign row', collectionReplace.ok && db.employees.some(emp => emp.id === 'emp_foreign' && emp.name === 'Foreign Employee'));
  check('collection replace updates active row', db.employees.some(emp => emp.id === 'emp_active' && emp.name === 'Active Renamed'));

  const fullDbPayload = JSON.parse(JSON.stringify(db));
  fullDbPayload.omni.materials = fullDbPayload.omni.materials
    .filter(mat => mat.id !== 'mat_foreign')
    .map(mat => mat.id === 'mat_legacy' ? { ...mat, name: 'Legacy Material Stamped' } : mat);
  const fullSave = await postJson('/api/db', fullDbPayload);
  db = await getDb();
  check('full db save preserves omitted foreign tenant collection row', fullSave.ok && db.omni.materials.some(mat => mat.id === 'mat_foreign' && mat.companyId === 'co_b'));
  check('full db save stamps legacy tenant row', db.omni.materials.find(mat => mat.id === 'mat_legacy')?.companyId === 'co_a');

  const failed = checks.filter(([, ok]) => !ok);
  checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
  if (failed.length) process.exitCode = 1;
} finally {
  server.kill();
  await delay(200);
  fs.rmSync(scratchDir, { recursive: true, force: true });
}
