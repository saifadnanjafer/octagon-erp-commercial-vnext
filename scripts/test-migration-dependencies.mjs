// clean-room; behavior modeled on OCTAGON_VNEXT_EXECUTION_PLAN.md R1 migration-runner dependency requirement (proprietary self, not copied)
// Blocker 1 (shared migration-lane-ordering) regression suite. Isolated: uses
// its own throwaway temp-dir SQLite files (never vnext-data/vnext.db).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  openMigrationDatabase,
  migrationStatus,
  runMigrations,
  schemaFingerprint,
  resolveMigrationOrder,
} from '../vnext/server/db/migration-runner.mjs';

let passed = 0;
function check(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { console.log(`  FAIL: ${label}`); process.exitCode = 1; }
}

async function loadRealMigrations() {
  const migrationsDir = path.resolve('migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.mjs$/.test(f)).sort();
  const { pathToFileURL } = await import('node:url');
  const out = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
    out.push({ ...mod.migration, dependsOn: Array.isArray(mod.migration.dependsOn) ? mod.migration.dependsOn : [], file });
  }
  return out;
}

console.log('=== SUITE 1: LEGACY MIGRATIONS WITHOUT METADATA PRESERVE FILENAME ORDER ===');
{
  const real = await loadRealMigrations();
  const legacyNoDeps = real.filter((m) => !m.dependsOn.length).map((m) => m.id);
  const resolved = resolveMigrationOrder(real).map((m) => m.id);
  const resolvedLegacyOnly = resolved.filter((id) => legacyNoDeps.includes(id));
  check(JSON.stringify(resolvedLegacyOnly) === JSON.stringify(legacyNoDeps), '1.1 migrations without dependsOn keep their relative filename order');
  check(legacyNoDeps.includes('001_r0_scope_contract') && legacyNoDeps.includes('101_r1_lane_a_tables'), '1.2 sanity: legacy set includes the known undeclared migrations');
}

console.log('=== SUITE 2: DEPENDENCIES FOR THE NEW LANE MIGRATIONS ===');
{
  const real = await loadRealMigrations();
  const resolved = resolveMigrationOrder(real).map((m) => m.id);
  const idx = (id) => resolved.indexOf(id);
  check(idx('501_r1_kernel_completion') < idx('102_r1_lane_a_completion'), '2.1 501 resolves before 102 (declared dependsOn honored)');
  check(idx('501_r1_kernel_completion') < idx('202_r1_lane_b_completion'), '2.2 501 resolves before 202 (declared dependsOn honored)');
  check(idx('501_r1_kernel_completion') < idx('402_r1_lane_d_completion'), '2.3 501 resolves before 402 (declared dependsOn honored)');
  check(idx('101_r1_lane_a_tables') < idx('501_r1_kernel_completion'), '2.4 101 (creates x_records) still precedes 501 by filename order');
  check(resolved.length === real.length, '2.5 resolved order contains every migration exactly once');
}

console.log('=== SUITE 3: MISSING DEPENDENCY FAILS BEFORE ANYTHING APPLIES ===');
{
  const synthetic = [
    { id: 'a', dependsOn: [] },
    { id: 'b', dependsOn: ['does_not_exist'] },
  ];
  assert.throws(() => resolveMigrationOrder(synthetic), /unknown migration "does_not_exist"/, '3.1 (assert.throws)');
  check(true, '3.1 missing dependency throws before any ordering/apply is attempted');
}

console.log('=== SUITE 4: DEPENDENCY CYCLE FAILS BEFORE ANYTHING APPLIES ===');
{
  const synthetic = [
    { id: 'x', dependsOn: ['y'] },
    { id: 'y', dependsOn: ['z'] },
    { id: 'z', dependsOn: ['x'] },
  ];
  assert.throws(() => resolveMigrationOrder(synthetic), /cycle detected/, '4.1 (assert.throws)');
  check(true, '4.1 a 3-node cycle throws a named cycle error before applying anything');

  const selfCycle = [{ id: 'self', dependsOn: ['self'] }];
  assert.throws(() => resolveMigrationOrder(selfCycle), /cycle detected/, '4.2 (assert.throws)');
  check(true, '4.2 a self-referencing dependency is treated as a cycle');
}

console.log('=== SUITE 5: DRY RUN PRINTS THE EXACT RESOLVED ORDER, NO SIDE EFFECTS ===');
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-vnext-migdeps-dry-'));
  const dbPath = path.join(tempDir, 'fresh.db');
  const backupDir = path.join(tempDir, 'backups');
  const dry = await runMigrations({ dbPath, dryRun: true, backupDir });
  const real = await loadRealMigrations();
  const expected = resolveMigrationOrder(real).map((m) => m.id);
  check(dry.dryRun === true, '5.1 dryRun flag echoed');
  check(JSON.stringify(dry.migrations) === JSON.stringify(expected), '5.2 dry run prints the exact dependency-resolved order');
  check(!fs.existsSync(backupDir), '5.3 dry run performs no backup / no side effects');
}

console.log('=== SUITE 6: FRESH DATABASE BUILDS COMPLETELY, IN DEPENDENCY ORDER ===');
let freshDbPath;
{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-vnext-migdeps-fresh-'));
  freshDbPath = path.join(tempDir, 'fresh.db');
  const backupDir = path.join(tempDir, 'backups');
  const up = await runMigrations({ dbPath: freshDbPath, direction: 'up', backupDir });
  check(up.status.every((e) => e.status === 'applied'), '6.1 every migration applied on a fresh database');
  const real = await loadRealMigrations();
  const expected = resolveMigrationOrder(real).map((m) => m.id);
  check(JSON.stringify(up.migrations) === JSON.stringify(expected), '6.2 fresh build applied in the dependency-resolved order');

  const db = openMigrationDatabase(freshDbPath);
  const integrity = db.prepare('PRAGMA integrity_check').get();
  check(integrity && (integrity.integrity_check === 'ok'), '6.3 PRAGMA integrity_check = ok');
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
  check(fkViolations.length === 0, '6.4 PRAGMA foreign_key_check reports zero violations');
  // Confirm the topological convergence actually happened: 501's ALTER-able
  // tables carry the FULLER shape (updated_at/updated_by etc.) whichever
  // migration created them first.
  const doc = db.prepare('PRAGMA table_info(x_doc_state_defs)').all().map((c) => c.name);
  check(doc.includes('updated_at') && doc.includes('updated_by'), '6.5 x_doc_state_defs has the 102-added columns after a fresh build');
  const apiKeys = db.prepare('PRAGMA table_info(x_api_keys)').all().map((c) => c.name);
  check(apiKeys.includes('id') && apiKeys.includes('label'), '6.6 x_api_keys has the 402-added columns after a fresh build');
  db.close();
}

console.log('=== SUITE 7: REAPPLY IS IDEMPOTENT ===');
{
  const reapply = await runMigrations({ dbPath: freshDbPath, direction: 'up' });
  check(reapply.migrations.length === 0, '7.1 re-running up against an already-migrated database applies nothing');
  const status = await migrationStatus(freshDbPath);
  check(status.every((e) => e.status === 'applied'), '7.2 status still reports every migration applied');
}

console.log('=== SUITE 8: ROLLBACK USES SAFE REVERSE-DEPENDENCY ORDER ===');
{
  const baselineDb = openMigrationDatabase(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-vnext-migdeps-baseline-')), 'baseline.db'));
  const baselineFingerprint = schemaFingerprint(baselineDb);
  baselineDb.close();

  const down = await runMigrations({ dbPath: freshDbPath, direction: 'down' });
  const real = await loadRealMigrations();
  const expectedUpOrder = resolveMigrationOrder(real).map((m) => m.id);
  const expectedDownOrder = expectedUpOrder.slice().reverse();
  check(JSON.stringify(down.migrations) === JSON.stringify(expectedDownOrder), '8.1 rollback order is the exact reverse of the dependency-resolved apply order (501 rolls back AFTER 102/202/402, i.e. is undone later in a reverse walk — dependents first)');
  const idxDown = (id) => down.migrations.indexOf(id);
  check(idxDown('102_r1_lane_a_completion') < idxDown('501_r1_kernel_completion'), '8.2 dependent 102 is rolled back before its dependency 501');

  const afterDb = openMigrationDatabase(freshDbPath);
  check(schemaFingerprint(afterDb) === baselineFingerprint, '8.3 full up-then-down restores the byte-identical baseline schema fingerprint');
  afterDb.close();
}

console.log('=== SUITE 9: RESTART SURVIVES (RE-OPEN + RE-APPLY FROM A FRESH PROCESS VIEW) ===');
{
  // Re-run up (module cache for the runner is already warm in this process,
  // but loadMigrations() re-reads every migration file fresh from disk each
  // call and openMigrationDatabase() re-opens the sqlite handle from scratch
  // each call, which is what "restart" exercises for this runner's design).
  const up2 = await runMigrations({ dbPath: freshDbPath, direction: 'up' });
  check(up2.status.every((e) => e.status === 'applied'), '9.1 after a full down, a fresh up-run rebuilds every migration again');
  const db = openMigrationDatabase(freshDbPath);
  const integrity = db.prepare('PRAGMA integrity_check').get();
  check(integrity && integrity.integrity_check === 'ok', '9.2 PRAGMA integrity_check = ok after restart-equivalent rebuild');
  db.close();
}

console.log('=== SUITE 10: PRE-EXISTING (ALREADY-APPLIED) DATABASE REMAINS VALID ===');
{
  // Simulate a database that had migrations applied under the OLD plain
  // filename order (i.e. before dependsOn existed) by applying them one at a
  // time in plain filename order via direct up() calls against the ledger,
  // then confirming the new dependency-aware runner still recognizes it as
  // fully applied and does not attempt to re-run or reorder anything.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-vnext-migdeps-legacyorder-'));
  const dbPath = path.join(tempDir, 'legacy-order.db');
  const db = openMigrationDatabase(dbPath);
  const real = await loadRealMigrations();
  const plainFilenameOrder = real.slice().sort((a, b) => a.file.localeCompare(b.file));
  for (const m of plainFilenameOrder) {
    db.exec('BEGIN IMMEDIATE;');
    m.up(db);
    db.prepare('INSERT INTO schema_migrations (migration_id, applied_at, checksum) VALUES (?, ?, ?)').run(m.id, new Date().toISOString(), 'legacy');
    db.exec('COMMIT;');
  }
  db.close();
  const status = await migrationStatus(dbPath);
  check(status.every((e) => e.status === 'applied'), '10.1 a database migrated under plain filename order is fully recognized as applied');
  const noop = await runMigrations({ dbPath, direction: 'up' });
  check(noop.migrations.length === 0, '10.2 the dependency-aware runner performs no further action against it');
  const reopened = openMigrationDatabase(dbPath);
  const integrity = reopened.prepare('PRAGMA integrity_check').get();
  check(integrity && integrity.integrity_check === 'ok', '10.3 PRAGMA integrity_check = ok on the pre-existing database');
  const fkViolations = reopened.prepare('PRAGMA foreign_key_check').all();
  check(fkViolations.length === 0, '10.4 PRAGMA foreign_key_check reports zero violations on the pre-existing database');
  reopened.close();
}

console.log('\n--- SUMMARY ---');
console.log(`${passed} assertions passed${process.exitCode ? ', WITH FAILURES' : ', 0 failed'}`);
if (!process.exitCode) console.log('MIGRATION DEPENDENCY SUITE: ALL PASSED');
