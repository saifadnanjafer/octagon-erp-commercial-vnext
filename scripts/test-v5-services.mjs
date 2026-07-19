import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, 'database.json');
const SERVICES = [
  'auditService.js',
  'tenantService.js',
  'recordService.js',
  'stateService.js',
  'permissionService.js',
  'stockService.js',
  'financeService.js',
  'index.js',
];

const originalDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
let mockDb = JSON.parse(JSON.stringify(originalDb));
if (!Array.isArray(mockDb.locations) || !mockDb.locations.length) {
  mockDb.locations = [
    { id: 'LOC_MAIN', name: 'Main Stock', type: 'internal', is_active: true },
    { id: 'LOC_WIP', name: 'Work In Progress', type: 'internal', is_active: true },
    { id: 'LOC_SCRAP', name: 'Scrap', type: 'inventory', is_active: true },
    { id: 'LOC_SUPPLIERS', name: 'Suppliers', type: 'supplier', is_active: true },
  ];
}

function getNestedPath(root, pathName) {
  return String(pathName || '').split('.').filter(Boolean).reduce((cursor, key) => cursor?.[key], root);
}

function setNestedPath(root, pathName, value) {
  const parts = String(pathName || '').split('.').filter(Boolean);
  let cursor = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

const sandbox = {
  console,
  window: {},
  btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
  unescape: (str) => decodeURIComponent(str.replace(/%u[0-9a-fA-F]{4}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)))),
  localStorage: {
    getItem: (key) => null,
    setItem: (key, val) => {},
    removeItem: (key) => {}
  },
  fetch: async (url, options = {}) => {
    if (url === '/api/backup') {
      return { ok: true, json: async () => ({ success: true, file: 'mock-backup.json' }) };
    }
    if (url === '/api/record') {
      const { collection, id, data } = JSON.parse(options.body || '{}');
      let records = getNestedPath(mockDb, collection);
      if (!Array.isArray(records)) {
        records = [];
        setNestedPath(mockDb, collection, records);
      }
      const idx = records.findIndex(item => item && item.id === id);
      if (idx === -1) records.push(data);
      else records[idx] = data;
      return { ok: true, json: async () => ({ success: true }) };
    }
    if (url === '/api/collection') {
      const { collection, data } = JSON.parse(options.body || '{}');
      setNestedPath(mockDb, collection, Array.isArray(data) ? data : []);
      return { ok: true, json: async () => ({ success: true }) };
    }
    if (url !== '/api/db') throw new Error(`Unexpected fetch URL: ${url}`);
    if ((options.method || 'GET').toUpperCase() === 'POST') {
      mockDb = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true }) };
    }
    return { ok: true, json: async () => JSON.parse(JSON.stringify(mockDb)) };
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const service of SERVICES) {
  const file = path.join(ROOT, 'services', service);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: service });
}

const db = await sandbox.PentagonServices.load({ force: true });
mockDb.omni.adminSettings.organization.multiTenant = true;
db.omni.adminSettings.organization.multiTenant = true;
const activeCompanyId = mockDb.omni.adminSettings.organization.activeCompanyId;
const tenantRecord = await sandbox.RecordService.create('employees', {
  id: 'EMP_TENANT_SMOKE',
  name: 'Tenant Smoke',
  groups: ['workshop.user'],
  is_active: true,
});
const foreignEmployee = {
  id: 'EMP_FOREIGN_SMOKE',
  name: 'Foreign Tenant Smoke',
  groups: ['workshop.user'],
  companyId: 'co_foreign_smoke',
  is_active: true,
};
mockDb.employees.push(foreignEmployee);
sandbox.PentagonDB.getCached().employees.push(foreignEmployee);
const tenantScopedEmployees = await sandbox.RecordService.search('employees');
let tenantBlocked = false;
try {
  await sandbox.RecordService.update('employees', 'EMP_FOREIGN_SMOKE', { name: 'Should Not Update' });
} catch (error) {
  tenantBlocked = /Tenant isolation/.test(error.message);
}
const employees = await sandbox.RecordService.search('employees');
const auditEvent = await sandbox.AuditService.createEvent('service.smoke', 'SMOKE_1', { ok: true });
const materialId = originalDb.omni.materials[0].id;
const startingMainQuantity = Number((mockDb.quants || []).find(quant =>
  quant.product_id === materialId && quant.location_id === 'LOC_MAIN'
)?.quantity || 0);
const journal = await sandbox.FinanceService.createJournalEntry({
  date: '2026-05-14',
  journal: 'general',
  lines: [
    { account_id: 'cash_workshop', label: 'اختبار', debit: 1000, credit: 0 },
    { account_id: 'income_sales', label: 'اختبار', debit: 0, credit: 1000 },
  ],
  origin: 'service-smoke-test',
});
const postedJournal = await sandbox.FinanceService.postJournalEntry(journal.id);

const stockMove = await sandbox.StockService.createStockMove({
  product_id: materialId,
  quantity: 3,
  from_loc: 'LOC_SUPPLIERS',
  to_loc: 'LOC_MAIN',
  origin: 'service-smoke-test',
  unit: originalDb.omni.materials[0].unit,
});
const completedMove = await sandbox.StockService.validateMove(stockMove.id);
const stockQuants = await sandbox.StockService.getQuants(materialId);
const mainQuantityAfterMove = Number(stockQuants.find(quant =>
  quant.location_id === 'LOC_MAIN'
)?.quantity || 0);
let overdrawBlocked = false;
try {
  const badMove = await sandbox.StockService.createStockMove({
    product_id: materialId,
    quantity: 999999,
    from_loc: 'LOC_MAIN',
    to_loc: 'LOC_WIP',
    origin: 'service-overdraw-test',
    unit: originalDb.omni.materials[0].unit,
  });
  await sandbox.StockService.validateMove(badMove.id);
} catch (error) {
  overdrawBlocked = /المتاح غير كاف/.test(error.message);
}

const beforeAdjustment = Number((mockDb.quants || []).find(quant =>
  quant.product_id === materialId && quant.location_id === 'LOC_MAIN'
)?.quantity || 0);
const adjustedMove = await sandbox.StockService.createInventoryAdjustment({
  product_id: materialId,
  location_id: 'LOC_MAIN',
  counted_quantity: beforeAdjustment + 2,
  origin: 'service-adjustment-test',
  unit: originalDb.omni.materials[0].unit,
});
const afterAdjustment = Number((mockDb.quants || []).find(quant =>
  quant.product_id === materialId && quant.location_id === 'LOC_MAIN'
)?.quantity || 0);

let permissionDenied = false;
sandbox.PentagonAuth.getCurrentUser = () => ({
  id: 'USR_SMOKE_LIMITED',
  name: 'مستخدم اختبار محدود',
  groups: ['workshop.user'],
});
try {
  await sandbox.FinanceService.createJournalEntry({
    lines: [
      { account_id: 'cash_workshop', debit: 1, credit: 0 },
      { account_id: 'income_sales', debit: 0, credit: 1 },
    ],
  });
} catch (error) {
  permissionDenied = /صلاحية/.test(error.message);
}

const checks = [
  ['services ready', sandbox.PentagonServices.ready === true],
  ['tenant service ready', Boolean(sandbox.TenantService)],
  ['tenant create stamps active company', tenantRecord.companyId === activeCompanyId],
  ['tenant search excludes foreign company', !tenantScopedEmployees.some(emp => emp.id === 'EMP_FOREIGN_SMOKE')],
  ['tenant update blocks foreign company', tenantBlocked],
  ['database loaded', Boolean(db && typeof db === 'object')],
  ['employees readable', employees.length === originalDb.employees.length + 1],
  ['audit created in mock', Boolean(auditEvent.id)],
  ['journal created in mock', Boolean(journal.id) && journal.amount_total === 1000],
  ['journal posted in mock', postedJournal.state === 'posted'],
  ['stock move completed in mock', completedMove.state === 'done' && completedMove.qty_done === 3],
  ['stock quants updated in mock', mainQuantityAfterMove === startingMainQuantity + 3],
  ['stock overdraw blocked in mock', overdrawBlocked],
  ['inventory adjustment completed in mock', adjustedMove.state === 'done' && afterAdjustment === beforeAdjustment + 2],
  ['limited user blocked from finance create', permissionDenied],
  ['real db untouched', (originalDb.audit_log || []).length === (JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).audit_log || []).length],
];

const failed = checks.filter(([, ok]) => !ok);
checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));

if (failed.length) process.exit(1);
