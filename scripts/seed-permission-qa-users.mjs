/**
 * Idempotent seed: V5 permission-matrix users on omni.users for manual / acceptance QA.
 * Does not touch journal_entries or other finance posting data.
 *
 * Usage (from octagon-erp/):
 *   node scripts/seed-permission-qa-users.mjs          # apply + backup
 *   node scripts/seed-permission-qa-users.mjs --check  # validate only
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DB_FILE = path.join(ROOT, 'database.json');
const CHECK_ONLY = process.argv.includes('--check');

const SEED_USERS = [
  {
    id: 'qa_workshop_only',
    name: 'اختبار QA — ورشة فقط (لا مالية)',
    groups: ['workshop.user'],
    is_active: true,
    roleId: 'employee',
    permissions: [],
    status: 'active',
  },
  {
    id: 'qa_finance_only',
    name: 'اختبار QA — مالية فقط (لا مخزون)',
    groups: ['finance.user'],
    is_active: true,
    roleId: 'employee',
    permissions: [],
    status: 'active',
  },
  {
    id: 'qa_no_v5_groups',
    name: 'اختبار QA — بدون مجموعات V5',
    groups: [],
    is_active: true,
    roleId: 'employee',
    permissions: [],
    status: 'active',
  },
];

function timestampForFile(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function readDb() {
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  return { raw, db: JSON.parse(raw) };
}

function upsertUsers(db) {
  if (!db.omni || typeof db.omni !== 'object') db.omni = {};
  if (!Array.isArray(db.omni.users)) db.omni.users = [];

  const report = { created: 0, updated: 0, unchanged: 0 };

  SEED_USERS.forEach(template => {
    const idx = db.omni.users.findIndex(u => u.id === template.id);
    if (idx === -1) {
      db.omni.users.push({ ...template, groups: template.groups.slice() });
      report.created += 1;
      return;
    }
    const existing = db.omni.users[idx];
    const next = {
      ...existing,
      name: template.name,
      groups: template.groups.slice(),
      is_active: template.is_active,
      roleId: template.roleId,
      permissions: Array.isArray(existing.permissions) ? existing.permissions : [],
      status: template.status,
    };
    const before = JSON.stringify({
      name: existing.name,
      groups: existing.groups,
      is_active: existing.is_active,
      roleId: existing.roleId,
      status: existing.status,
    });
    const after = JSON.stringify({
      name: next.name,
      groups: next.groups,
      is_active: next.is_active,
      roleId: next.roleId,
      status: next.status,
    });
    db.omni.users[idx] = next;
    if (before === after) report.unchanged += 1;
    else report.updated += 1;
  });

  return report;
}

function validate(db) {
  const errors = [];
  if (!db.omni || typeof db.omni !== 'object') errors.push('omni object missing');
  if (!Array.isArray(db.omni?.users)) errors.push('omni.users[] missing');
  SEED_USERS.forEach(template => {
    const u = db.omni.users.find(x => x.id === template.id);
    if (!u) errors.push(`missing seeded user ${template.id}`);
    else if (JSON.stringify(u.groups || []) !== JSON.stringify(template.groups)) {
      errors.push(`user ${template.id} groups mismatch (expected ${JSON.stringify(template.groups)})`);
    }
  });
  return errors;
}

const { raw, db } = readDb();
const previewDb = JSON.parse(JSON.stringify(db));
const report = upsertUsers(previewDb);
const errors = validate(previewDb);

console.log(`Permission QA user seed (${CHECK_ONLY ? 'check' : 'apply'})`);
console.log(`Users created: ${report.created}, updated: ${report.updated}, unchanged: ${report.unchanged}`);

if (errors.length) {
  console.error('Validation failed:');
  errors.forEach(e => console.error(`- ${e}`));
  process.exit(1);
}

if (CHECK_ONLY) {
  console.log('Validation result: PASSED');
  process.exit(0);
}

const backupPath = path.join(ROOT, `database.backup.permission_qa.${timestampForFile()}.json`);
fs.writeFileSync(backupPath, raw, 'utf8');
fs.writeFileSync(DB_FILE, `${JSON.stringify(previewDb, null, 2)}\n`, 'utf8');
console.log(`Backup path: ${backupPath}`);
console.log('Validation result: PASSED');
