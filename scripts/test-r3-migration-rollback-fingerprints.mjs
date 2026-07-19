// Clean-room R3 rollback proof. Uses a disposable SQLite database only.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openMigrationDatabase, resolveMigrationOrder } from '../vnext/server/db/migration-runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../migrations');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-rollback-'));
const dbPath = path.join(temp, 'rollback.db');
const db = openMigrationDatabase(dbPath);
let passed = 0;
let failed = 0;
function check(condition, label) {
  if (condition) { passed += 1; console.log(`PASS ${label}`); }
  else { failed += 1; console.error(`FAIL ${label}`); }
}
function semanticSchema(dbHandle) {
  const tables = dbHandle.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => ({
    name,
    columns: dbHandle.prepare(`PRAGMA table_info("${String(name).replaceAll('"', '""')}")`).all().map(({ name: column, type, notnull, dflt_value, pk }) => ({ column, type, notnull, dflt_value, pk })),
    foreignKeys: dbHandle.prepare(`PRAGMA foreign_key_list("${String(name).replaceAll('"', '""')}")`).all().map(({ id, seq, table, from, to, on_update, on_delete }) => ({ id, seq, table, from, to, on_update, on_delete })),
  }));
  const indexes = dbHandle.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name, tbl_name }) => ({
    name,
    tbl_name,
    meta: (() => { const row = dbHandle.prepare(`PRAGMA index_list("${String(tbl_name).replaceAll('"', '""')}")`).all().find((item) => item.name === name); return row ? { name: row.name, unique: row.unique, origin: row.origin, partial: row.partial } : null; })(),
    columns: dbHandle.prepare(`PRAGMA index_info("${String(name).replaceAll('"', '""')}")`).all().map(({ seqno, cid, name: column }) => ({ seqno, cid, column })),
  }));
  return { tables, indexes };
}
function schemaHash(schema) {
  return crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}
function schemaDelta(before, after) {
  const beforeTables = new Map(before.tables.map((table) => [table.name, JSON.stringify(table)]));
  const afterTables = new Map(after.tables.map((table) => [table.name, JSON.stringify(table)]));
  const beforeIndexes = new Map(before.indexes.map((index) => [index.name, JSON.stringify(index)]));
  const afterIndexes = new Map(after.indexes.map((index) => [index.name, JSON.stringify(index)]));
  return {
    tablesAdded: [...afterTables.keys()].filter((name) => !beforeTables.has(name)),
    tablesRemoved: [...beforeTables.keys()].filter((name) => !afterTables.has(name)),
    tablesChanged: [...beforeTables.keys()].filter((name) => afterTables.has(name) && beforeTables.get(name) !== afterTables.get(name)),
    indexesAdded: [...afterIndexes.keys()].filter((name) => !beforeIndexes.has(name)),
    indexesRemoved: [...beforeIndexes.keys()].filter((name) => !afterIndexes.has(name)),
    indexesChanged: [...beforeIndexes.keys()].filter((name) => afterIndexes.has(name) && beforeIndexes.get(name) !== afterIndexes.get(name)),
  };
}
async function loadMigrations() {
  const files = fs.readdirSync(migrationsDir).filter((file) => /^\d+_.+\.mjs$/.test(file)).sort();
  const migrations = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
    migrations.push({ ...mod.migration, dependsOn: mod.migration.dependsOn || [], file });
  }
  return resolveMigrationOrder(migrations);
}

try {
  const ordered = await loadMigrations();
  const preR3 = ordered.filter((migration) => Number(migration.id.slice(0, 3)) < 610);
  const r3 = ordered.filter((migration) => Number(migration.id.slice(0, 3)) >= 610);
  for (const migration of preR3) migration.up(db);
  const baseline = semanticSchema(db);
  for (const migration of r3) migration.up(db);

  db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('r3-rollback-company', 'R3 Rollback Company');
  db.prepare('INSERT INTO product_master(id,company_id,code,name,created_at,created_by) VALUES(?,?,?,?,?,?)').run('r3-rollback-product', 'r3-rollback-company', 'R3-ROLLBACK', 'Rollback Product', '2026-07-19T00:00:00.000Z', 'rollback-test');
  db.prepare('INSERT INTO partner_master(id,company_id,name,partner_type,created_at,created_by) VALUES(?,?,?,?,?,?)').run('r3-rollback-partner', 'r3-rollback-company', 'Rollback Partner', 'both', '2026-07-19T00:00:00.000Z', 'rollback-test');
  const productBefore = db.prepare('SELECT id, company_id, code, name, created_by FROM product_master WHERE id=?').get('r3-rollback-product');
  const partnerBefore = db.prepare('SELECT id, company_id, name, partner_type, created_by FROM partner_master WHERE id=?').get('r3-rollback-partner');

  for (const migration of [...r3].reverse()) migration.down(db);
  const productAfter = db.prepare('SELECT id, company_id, code, name, created_by FROM product_master WHERE id=?').get('r3-rollback-product');
  const partnerAfter = db.prepare('SELECT id, company_id, name, partner_type, created_by FROM partner_master WHERE id=?').get('r3-rollback-partner');
  check(JSON.stringify(productAfter) === JSON.stringify(productBefore), 'product_master row preserved through R3 rollback rebuilds');
  check(JSON.stringify(partnerAfter) === JSON.stringify(partnerBefore), 'partner_master row preserved through R3 rollback rebuild');
  check(!db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name IN (\'category_id\',\'product_type\',\'standard_cost\',\'tracking_type\')').get('product_master'), 'R3 product columns removed after rollback');
  check(!db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name IN (\'credit_limit\',\'credit_hold\')').get('partner_master'), 'R3 partner columns removed after rollback');
  check(!db.prepare("SELECT 1 FROM sqlite_master WHERE name IN ('r3_idempotency','sales_quote','landed_cost_basis')").get(), 'R3 control and workflow tables removed after rollback');
  const finalSchema = semanticSchema(db);
  const sameSchema = schemaHash(finalSchema) === schemaHash(baseline);
  if (!sameSchema) console.error('schema delta', JSON.stringify(schemaDelta(baseline, finalSchema)));
  check(sameSchema, 'semantic schema fingerprint returns to pre-R3 baseline');
  check(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'SQLite integrity_check is ok after rollback');
  check(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'foreign_key_check reports zero violations after rollback');
} finally {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }
}

console.log(`R3 MIGRATION ROLLBACK FINGERPRINT SUITE: ${passed} PASS, ${failed} FAIL, 0 SKIP`);
if (failed) process.exitCode = 1;
