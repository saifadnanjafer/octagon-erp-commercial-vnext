// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.1 (proprietary self, not copied)
// R10.1 legacy business-source fixture builder.
//
// Reads the legacy production store STRICTLY read-only (readOnly handle +
// PRAGMA query_only) and writes a sanitized snapshot of the NON-FROZEN business
// collections into vnext-fixtures/. The frozen payroll/attendance/timesheet
// collections are never copied here — they already have their own R0 golden
// fixture and stay out of the migration source entirely.
//
// Sanitization: contact PII (phone/email/contact/address/notes) is redacted and
// partner display names become stable pseudonyms. Everything the reconciliation
// math depends on (accounts, amounts, dates, quantities, costs, states, ids) is
// preserved byte-for-byte so a migrated trial balance can be compared to the
// legacy trial balance with tolerance 0.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const defaultSource = path.resolve(root, '..', 'octagon-erp', 'database.db');
const sourcePath = path.resolve(process.env.OCTAGON_LEGACY_SOURCE_DB || defaultSource);
const outputPath = path.join(root, 'vnext-fixtures', 'legacy-business-source.db');

// Collections that carry the frozen payroll/attendance/timesheet zone. These are
// never read by the fixture builder and never enter the migration source.
const FROZEN_COLLECTIONS = new Set([
  'employees',
  'employee_advances',
  'employee_payroll_closings',
  'payroll_payments',
  'payroll_periods',
  'omni.employeeAttendance',
  'omni.workshopAdvances',
  'omni.workshopTimesheetCases',
]);

// Business collections the R10.1 migration consumes.
const BUSINESS_COLLECTIONS = [
  'finance.accounts',
  'journals',
  'account_moves',
  'finance.customers',
  'omni.suppliers',
  'omni.materials',
  'omni.warehouses',
  'omni.storageLocations',
  'locations',
];

const REDACT_KEYS = new Set([
  'phone', 'mobile', 'email', 'contact', 'contactPhone', 'address', 'notes',
  'note', 'whatsapp', 'taxNumber', 'tax_number', 'iban', 'bankAccount',
]);
const PSEUDONYM_KEYS = new Set(['name', 'nameAr', 'companyName', 'shopName', 'supplier', 'created_by', 'createdBy']);

function pseudonym(prefix, seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 8);
  return `${prefix}-${digest}`;
}

// Deep sanitize. `pseudonymize` is only enabled for partner-shaped collections;
// product/account/journal naming is business terminology, not personal data, and
// is preserved so migrated masters stay legible.
function sanitize(value, { pseudonymize, seed }) {
  if (Array.isArray(value)) return value.map((item) => sanitize(item, { pseudonymize, seed }));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (REDACT_KEYS.has(key) && typeof inner === 'string' && inner.length > 0) {
        out[key] = '';
        continue;
      }
      if (pseudonymize && PSEUDONYM_KEYS.has(key) && typeof inner === 'string' && inner.length > 0) {
        out[key] = pseudonym('party', `${seed}:${key}:${inner}`);
        continue;
      }
      out[key] = sanitize(inner, { pseudonymize, seed });
    }
    return out;
  }
  return value;
}

const PSEUDONYM_COLLECTIONS = new Set(['finance.customers', 'omni.suppliers']);

function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Legacy source database not found: ${sourcePath}`);
    process.exitCode = 1;
    return;
  }

  const source = new DatabaseSync(sourcePath, { readOnly: true });
  source.exec('PRAGMA query_only = ON;');

  const available = new Set(
    source.prepare('SELECT DISTINCT collection FROM collections').all().map((row) => row.collection)
  );
  for (const frozen of FROZEN_COLLECTIONS) {
    if (BUSINESS_COLLECTIONS.includes(frozen)) throw new Error(`Frozen collection ${frozen} must never be in the migration source.`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const stale = outputPath + suffix;
    if (fs.existsSync(stale)) fs.rmSync(stale);
  }

  const target = new DatabaseSync(outputPath);
  target.exec(`
    CREATE TABLE collections (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE r10_source_manifest (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insert = target.prepare('INSERT INTO collections (collection, id, data) VALUES (?, ?, ?)');
  const counts = {};
  target.exec('BEGIN IMMEDIATE');
  try {
    for (const collection of BUSINESS_COLLECTIONS) {
      if (!available.has(collection)) { counts[collection] = 0; continue; }
      const rows = source.prepare('SELECT id, data FROM collections WHERE collection = ? ORDER BY id').all(collection);
      const pseudonymize = PSEUDONYM_COLLECTIONS.has(collection);
      for (const row of rows) {
        const parsed = JSON.parse(row.data);
        const clean = sanitize(parsed, { pseudonymize, seed: `${collection}:${row.id}` });
        insert.run(collection, row.id, JSON.stringify(clean));
      }
      counts[collection] = rows.length;
    }
    target.exec('COMMIT');
  } catch (error) {
    try { target.exec('ROLLBACK'); } catch (_) { /* rollback is best-effort */ }
    throw error;
  }

  const manifest = {
    captureMethod: 'read-only SELECT projection with PII sanitization',
    sourceDatabase: sourcePath,
    fixtureDatabase: outputPath,
    capturedAt: new Date().toISOString(),
    businessCollections: BUSINESS_COLLECTIONS,
    excludedFrozenCollections: [...FROZEN_COLLECTIONS].sort(),
    collectionCounts: counts,
    sanitization: {
      contactFields: 'redacted to empty string',
      partnerNames: 'stable sha256 pseudonyms (finance.customers, omni.suppliers)',
      amountsDatesAccountsQuantities: 'preserved verbatim for tolerance-0 reconciliation',
    },
  };
  const setMeta = target.prepare('INSERT INTO r10_source_manifest (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(manifest)) {
    setMeta.run(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  target.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  target.close();
  source.close();

  fs.writeFileSync(
    path.join(root, 'vnext-fixtures', 'r10-business-source-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  console.log(`R10.1 business-source fixture written: ${outputPath}`);
  for (const [collection, count] of Object.entries(counts)) console.log(`  ${collection} = ${count}`);
}

main();
