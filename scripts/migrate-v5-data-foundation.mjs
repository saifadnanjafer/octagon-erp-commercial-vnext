import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT_DIR, 'database.json');
const CHECK_ONLY = process.argv.includes('--check');
const VERSION = '5.0';
const SYSTEM_USER = 'system';

const AUDIT_COLLECTIONS = [
  { label: 'employees', path: ['employees'], prefix: 'EMP' },
  { label: 'finance.accounts', path: ['finance', 'accounts'], prefix: 'FIN_ACC' },
  { label: 'finance.departments', path: ['finance', 'departments'], prefix: 'FIN_DEPT' },
  { label: 'finance.transactions', path: ['finance', 'transactions'], prefix: 'FIN_TX' },
  { label: 'finance.customers', path: ['finance', 'customers'], prefix: 'FIN_CUST' },
  { label: 'finance.parties', path: ['finance', 'parties'], prefix: 'FIN_PARTY' },
  { label: 'finance.receipts', path: ['finance', 'receipts'], prefix: 'FIN_RCPT' },
  { label: 'omni.kanban.cards', path: ['omni', 'kanban', 'cards'], prefix: 'KB_CARD' },
  { label: 'omni.machines', path: ['omni', 'machines'], prefix: 'MACH' },
  { label: 'omni.materials', path: ['omni', 'materials'], prefix: 'MAT' },
  { label: 'omni.opPacks', path: ['omni', 'opPacks'], prefix: 'OPP' },
  { label: 'omni.qcRecords', path: ['omni', 'qcRecords'], prefix: 'QC' },
  { label: 'omni.orders', path: ['omni', 'orders'], prefix: 'ORD' },
  { label: 'omni.departments', path: ['omni', 'departments'], prefix: 'OMNI_DEPT' },
];

const TOP_LEVEL_COLLECTIONS = [
  'contacts',
  'departments',
  'users',
  'locations',
  'quants',
  'stock_moves',
  'transfers',
  'journals',
  'journal_entries',
  'payments',
  'maintenance_requests',
  'production_orders',
  'work_orders',
  'audit_log',
];

function timestampForFile(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

function isoNow() {
  return new Date().toISOString();
}

function readDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    throw new Error(`database.json not found: ${DB_FILE}`);
  }

  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    return { db: JSON.parse(raw), raw };
  } catch (error) {
    throw new Error(`Invalid database.json: ${error.message}`);
  }
}

function getAtPath(obj, keyPath) {
  return keyPath.reduce((cursor, key) => (cursor && typeof cursor === 'object' ? cursor[key] : undefined), obj);
}

function ensureArrayAtRoot(db, key, report) {
  if (!Array.isArray(db[key])) {
    db[key] = [];
    report.changedRecords += 1;
    report.createdCollections.push(key);
  }
  return db[key];
}

function stableId(prefix, index) {
  return `${prefix}_${String(index + 1).padStart(4, '0')}`;
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.trim()) || '';
}

function addAuditFields(record, prefix, index, now) {
  let changed = false;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return changed;

  if (!record.id) {
    record.id = stableId(prefix, index);
    changed = true;
  }

  const createdAt = firstString(record.created_at, record.createdAt, record.date, record.inspectedAt, record.updatedAt) || now;
  const updatedAt = firstString(record.updated_at, record.updatedAt, record.createdAt, record.inspectedAt, record.date) || createdAt;

  if (!record.created_at) {
    record.created_at = createdAt;
    changed = true;
  }
  if (!record.created_by) {
    record.created_by = SYSTEM_USER;
    changed = true;
  }
  if (!record.updated_at) {
    record.updated_at = updatedAt;
    changed = true;
  }
  if (!record.updated_by) {
    record.updated_by = SYSTEM_USER;
    changed = true;
  }
  if (record.is_active === undefined) {
    record.is_active = true;
    changed = true;
  }

  return changed;
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function collectDepartmentNames(db) {
  const names = new Map();
  const addName = value => {
    const name = normalizeName(value);
    if (name && !names.has(name)) names.set(name, name);
  };

  (db.finance?.departments || []).forEach(dept => addName(dept?.name));
  (db.omni?.departments || []).forEach(dept => addName(dept?.name));
  (db.employees || []).forEach(emp => addName(emp?.department));

  return [...names.values()];
}

function ensureTopLevelDepartments(db, report, now) {
  const departments = ensureArrayAtRoot(db, 'departments', report);
  const existingNames = new Set(departments.map(dept => normalizeName(dept?.name)).filter(Boolean));

  collectDepartmentNames(db).forEach((name, index) => {
    if (existingNames.has(name)) return;
    departments.push({
      id: stableId('DEPT', departments.length),
      name,
      source: 'v5_data_foundation',
      created_at: now,
      created_by: SYSTEM_USER,
      updated_at: now,
      updated_by: SYSTEM_USER,
      is_active: true,
    });
    existingNames.add(name);
    report.changedRecords += 1;
    report.addedDefaults.departments += 1;
  });

  departments.forEach((dept, index) => {
    if (addAuditFields(dept, 'DEPT', index, now)) report.changedRecords += 1;
  });
}

function ensureUsers(db, report, now) {
  const users = ensureArrayAtRoot(db, 'users', report);
  if (!users.some(user => user?.id === 'USR_SYSTEM_ADMIN')) {
    users.push({
      id: 'USR_SYSTEM_ADMIN',
      name: 'مدير النظام',
      role: 'system_admin',
      groups: ['system.admin'],
      is_system: true,
      created_at: now,
      created_by: SYSTEM_USER,
      updated_at: now,
      updated_by: SYSTEM_USER,
      is_active: true,
    });
    report.changedRecords += 1;
    report.addedDefaults.users += 1;
  }

  users.forEach((user, index) => {
    if (addAuditFields(user, 'USR', index, now)) report.changedRecords += 1;
  });
}

function ensureLocations(db, report, now) {
  const locations = ensureArrayAtRoot(db, 'locations', report);
  const defaults = [
    { id: 'LOC_MAIN', name: 'المخزن الرئيسي', type: 'internal', parent_id: null },
    { id: 'LOC_WIP', name: 'ورشة التنفيذ', type: 'internal', parent_id: 'LOC_MAIN' },
    { id: 'LOC_SUPPLIERS', name: 'الموردين', type: 'supplier', parent_id: null },
    { id: 'LOC_CUSTOMERS', name: 'العملاء', type: 'customer', parent_id: null },
    { id: 'LOC_SCRAP', name: 'التالف', type: 'inventory', parent_id: null },
  ];
  const existingIds = new Set(locations.map(location => location?.id).filter(Boolean));

  defaults.forEach(location => {
    if (existingIds.has(location.id)) return;
    locations.push({
      ...location,
      created_at: now,
      created_by: SYSTEM_USER,
      updated_at: now,
      updated_by: SYSTEM_USER,
      is_active: true,
    });
    existingIds.add(location.id);
    report.changedRecords += 1;
    report.addedDefaults.locations += 1;
  });

  locations.forEach((location, index) => {
    if (addAuditFields(location, 'LOC', index, now)) report.changedRecords += 1;
  });
}

function applyAuditFields(db, report, now) {
  AUDIT_COLLECTIONS.forEach(collection => {
    const records = getAtPath(db, collection.path);
    const count = Array.isArray(records) ? records.length : 0;
    report.inspectedCollections.push(`${collection.label}: ${count}`);

    if (!Array.isArray(records)) return;

    records.forEach((record, index) => {
      if (addAuditFields(record, collection.prefix, index, now)) {
        report.changedRecords += 1;
      }
    });
  });
}

function ensureV5Collections(db, report, now) {
  TOP_LEVEL_COLLECTIONS.forEach(collection => ensureArrayAtRoot(db, collection, report));
  ensureTopLevelDepartments(db, report, now);
  ensureUsers(db, report, now);
  ensureLocations(db, report, now);
}

function migrate(db) {
  const now = isoNow();
  const report = {
    inspectedCollections: [],
    createdCollections: [],
    changedRecords: 0,
    addedDefaults: {
      departments: 0,
      locations: 0,
      users: 0,
    },
  };

  applyAuditFields(db, report, now);
  ensureV5Collections(db, report, now);

  if (db._schema_version !== VERSION) {
    db._schema_version = VERSION;
    report.changedRecords += 1;
  }
  if (!db._migrated_at) {
    db._migrated_at = now;
    report.changedRecords += 1;
  }

  return report;
}

function validate(db) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(db.employees)) errors.push('employees[] is missing');
  if (!db.finance || typeof db.finance !== 'object') errors.push('finance object is missing');
  if (!db.omni || typeof db.omni !== 'object') errors.push('omni object is missing');
  if (Object.prototype.hasOwnProperty.call(db, 'accounts')) {
    errors.push('top-level accounts[] must not be created; use finance.accounts[]');
  }

  TOP_LEVEL_COLLECTIONS.forEach(collection => {
    if (!Array.isArray(db[collection])) {
      errors.push(`${collection}[] is missing`);
    }
  });

  AUDIT_COLLECTIONS.forEach(collection => {
    const records = getAtPath(db, collection.path);
    if (!Array.isArray(records)) {
      warnings.push(`${collection.label} is missing or not an array`);
      return;
    }

    records.forEach((record, index) => {
      const missing = ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'is_active']
        .filter(field => record?.[field] === undefined || record?.[field] === '');
      if (missing.length) {
        errors.push(`${collection.label}[${index}] missing audit fields: ${missing.join(', ')}`);
      }
    });
  });

  if (Array.isArray(db.departments)) {
    const departmentNames = db.departments.map(dept => normalizeName(dept?.name)).filter(Boolean);
    if (new Set(departmentNames).size !== departmentNames.length) {
      errors.push('departments[] contains duplicate names');
    }
  }

  return { errors, warnings };
}

function printReport({ mode, backupPath, migrationReport, validation }) {
  console.log(`Octagon V5 Data Foundation Migration (${mode})`);
  console.log(`Database: ${DB_FILE}`);
  console.log(`Backup path: ${backupPath || 'not created'}`);

  if (migrationReport) {
    console.log('\nCollections inspected:');
    migrationReport.inspectedCollections.forEach(item => console.log(`- ${item}`));
    console.log(`\nCreated top-level collections: ${migrationReport.createdCollections.length ? migrationReport.createdCollections.join(', ') : 'none'}`);
    console.log(`Default departments added: ${migrationReport.addedDefaults.departments}`);
    console.log(`Default locations added: ${migrationReport.addedDefaults.locations}`);
    console.log(`Default users added: ${migrationReport.addedDefaults.users}`);
    console.log(`Records/fields changed: ${migrationReport.changedRecords}`);
  }

  if (validation.warnings.length) {
    console.log('\nWarnings:');
    validation.warnings.forEach(warning => console.log(`- ${warning}`));
  }

  if (validation.errors.length) {
    console.log('\nValidation result: FAILED');
    validation.errors.forEach(error => console.log(`- ${error}`));
  } else {
    console.log('\nValidation result: PASSED');
  }
}

function main() {
  let db;
  let raw;
  try {
    ({ db, raw } = readDatabase());
  } catch (error) {
    console.error(`Migration blocked: ${error.message}`);
    process.exit(1);
  }

  if (CHECK_ONLY) {
    const clone = structuredClone(db);
    const migrationReport = migrate(clone);
    const validation = validate(clone);
    const mode = db._schema_version === VERSION ? 'check: already V5' : 'check: migration preview';
    printReport({ mode, backupPath: null, migrationReport, validation });
    process.exit(validation.errors.length ? 1 : 0);
  }

  if (db._schema_version === VERSION) {
    const validation = validate(db);
    printReport({ mode: 'already V5, no rewrite', backupPath: null, migrationReport: null, validation });
    process.exit(validation.errors.length ? 1 : 0);
  }

  const backupPath = path.join(ROOT_DIR, `database.backup.${timestampForFile()}.json`);
  fs.writeFileSync(backupPath, raw, 'utf8');

  const migrationReport = migrate(db);
  const validation = validate(db);
  if (validation.errors.length) {
    printReport({ mode: 'blocked after validation', backupPath, migrationReport, validation });
    console.error('\nMigration blocked: database.json was not rewritten.');
    process.exit(1);
  }

  fs.writeFileSync(DB_FILE, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  printReport({ mode: 'applied', backupPath, migrationReport, validation });
}

main();
