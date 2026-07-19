import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createLegacyFinanceBridge } from '../vnext/server/compat/LegacyFinanceBridge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const vnextDbPath = path.resolve(here, '../vnext-data/test-finance-t213.db');
const migrationsDir = path.resolve(here, '../migrations');
const legacyOrigPath = path.resolve(here, '../vnext-fixtures/legacy-sanitized.db');
const legacyCopyPath = path.resolve(here, '../vnext-fixtures/legacy-sanitized-copy.db');

// Ensure clean starting state
try { fs.unlinkSync(vnextDbPath); } catch (_) {}
try { fs.unlinkSync(vnextDbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(vnextDbPath + '-shm'); } catch (_) {}
try { fs.unlinkSync(legacyCopyPath); } catch (_) {}
try { fs.unlinkSync(legacyCopyPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(legacyCopyPath + '-shm'); } catch (_) {}

// Make a writeable copy of the legacy sanitized fixture
fs.copyFileSync(legacyOrigPath, legacyCopyPath);

const DEPENDENCY_SAFE_ORDER = [
  '001_r0_scope_contract.mjs',
  '101_r1_lane_a_tables.mjs',
  '201_r1_lane_b_tables.mjs',
  '301_r1_lane_c_tables.mjs',
  '401_r1_lane_d_tables.mjs',
  '501_r1_kernel_completion.mjs',
  '102_r1_lane_a_completion.mjs',
  '202_r1_lane_b_completion.mjs',
  '302_r1_lane_c_completion.mjs',
  '402_r1_lane_d_completion.mjs',
  '601_r2_finance_baseline.mjs',
];

console.log('--- APPLYING MIGRATIONS ---');
const migrationDb = new DatabaseSync(vnextDbPath);
migrationDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of DEPENDENCY_SAFE_ORDER) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migrationDb);
  console.log('  applied:', mod.migration.id);
}
migrationDb.close();
console.log('Migrations applied.');

const vnextDb = new DatabaseSync(vnextDbPath);
vnextDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

// Seeds
const { applyR0ScopeSeed, applyAclAdminDefaultSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(vnextDb);
applyAclAdminDefaultSeed(vnextDb);

const financeEngine = require('../vnext/server/finance/finance-engine');

// Initialize LegacyFinanceBridge
const bridge = createLegacyFinanceBridge({
  mode: 'active-dual-post',
  snapshotPath: legacyCopyPath
});

let failures = 0;
function check(name, expr) {
  if (expr) {
    console.log(`  PASS: ${name}`);
  } else {
    console.error(`  FAIL: ${name}`);
    failures++;
  }
}

try {
  console.log('=== SUITE 1: DUAL-POST MIRRORING (T2.1.3) ===');

  // 1. Seed draft document in VNext
  const docId = 'doc_mirror_1';
  const nowIso = new Date().toISOString();
  vnextDb.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, currency, created_at, created_by)
    VALUES (?, 'company-r0-demo', null, 'manual_entry', '2026-07-18', 'draft', 'IQD', ?, 'test_user')
  `).run(docId, nowIso);

  vnextDb.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, description, created_at)
    VALUES ('line1', ?, 'company-r0-demo', 'coa_101000', 400.00, 0.00, 'قبض نقدية', ?)
  `).run(docId, nowIso);

  vnextDb.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, description, created_at)
    VALUES ('line2', ?, 'company-r0-demo', 'coa_401000', 0.00, 400.00, 'إيرادات مبيعات', ?)
  `).run(docId, nowIso);

  // 2. Post the VNext document
  const postRes = financeEngine.postFiscalDoc(vnextDb, docId, 'test_user');
  check('1.1 VNext posting completed successfully', postRes.success);

  // 3. Dual-post / mirror to the legacy database
  bridge.mirrorPosting(vnextDb, docId);
  
  // Retrieve mirrored row from legacy DB copy
  const legacyStore = new DatabaseSync(legacyCopyPath);
  const mirroredMoveStr = legacyStore.prepare("SELECT data FROM collections WHERE collection = 'account_moves' AND id = ?").get(docId);
  check('1.2 legacy account_moves collection has mirrored move', !!mirroredMoveStr);

  const mirroredMove = JSON.parse(mirroredMoveStr.data);
  check('1.3 mirrored move has correct total amount', mirroredMove.amount_total === 400.00);
  check('1.4 mirrored move has correct lines count', mirroredMove.line_ids.length === 2);
  check('1.5 mirrored move line 0 has correct debit', mirroredMove.line_ids[0].debit === 400.00 && mirroredMove.line_ids[0].credit === 0.00);

  // Verify journal_entry mirror too
  const mirroredEntryStr = legacyStore.prepare("SELECT data FROM collections WHERE collection = 'journal_entries' AND id = ?").get('je_' + docId.replace(/-/g, '_'));
  check('1.6 legacy journal_entries has mirrored entry', !!mirroredEntryStr);

  console.log('\n=== SUITE 2: RECONCILIATION REPORT TOLERANCE 0 (T2.1.3) ===');

  // 4. Run reconciliation report
  const report1 = bridge.reconcile(vnextDb, 'company-r0-demo');
  check('2.1 VNext and legacy balances are fully reconciled (reconciled: true)', report1.reconciled === true);
  check('2.2 mismatches array is empty', report1.mismatches.length === 0);

  // 5. Post reversal in VNext and mirror
  const revRes = financeEngine.reverseFiscalDoc(vnextDb, docId, 'test_user');
  check('2.3 reversal document posted successfully in VNext', revRes.success);

  // Find the reversal document ID
  const revDocRow = vnextDb.prepare("SELECT id FROM fiscal_doc WHERE reversal_of_id = ?").get(docId);
  check('2.4 reversal document exists', !!revDocRow);

  // Mirror the reversal document to legacy DB
  bridge.mirrorPosting(vnextDb, revDocRow.id);

  // Update legacy move for original doc to cancelled state (VNext does this inside reverseFiscalDoc, so we mirror it by calling mirrorPosting on original doc again!)
  bridge.mirrorPosting(vnextDb, docId);

  // Run reconciliation report again (post -> cancel -> repost nets to 0, which should still reconcile perfectly!)
  const report2 = bridge.reconcile(vnextDb, 'company-r0-demo');
  check('2.5 reconciliation passes after reversal and mirroring', report2.reconciled === true);
  check('2.6 zero mismatches observed', report2.mismatches.length === 0);

  console.log('\n=== SUITE 3: RECONCILIATION MISMATCH DETECTION ===');

  // 6. Manually insert an unbalanced entry directly in the legacy copy to corrupt it
  legacyStore.prepare(`
    INSERT INTO collections (collection, id, data)
    VALUES ('account_moves', 'corrupted_doc', ?)
  `).run(JSON.stringify({
    id: 'corrupted_doc',
    state: 'posted',
    companyId: 'company-r0-demo',
    line_ids: [
      { account_id: 'coa_101000', debit: 1500.00, credit: 0.00 }
    ]
  }));

  const report3 = bridge.reconcile(vnextDb, 'company-r0-demo');
  check('3.1 reconciliation fails when data is corrupted in legacy DB', report3.reconciled === false);
  check('3.2 mismatch list is non-empty', report3.mismatches.length > 0);
  check('3.3 coa_101000 (Cash) has reported mismatch', report3.mismatches.some(m => m.account_id === 'coa_101000'));

  legacyStore.close();

} catch (err) {
  console.error('Unhandled test execution error:', err);
  failures++;
} finally {
  bridge.close();
  vnextDb.close();

  // Clean up test DB files
  try { fs.unlinkSync(vnextDbPath); } catch (_) {}
  try { fs.unlinkSync(vnextDbPath + '-wal'); } catch (_) {}
  try { fs.unlinkSync(vnextDbPath + '-shm'); } catch (_) {}
  try { fs.unlinkSync(legacyCopyPath); } catch (_) {}
  try { fs.unlinkSync(legacyCopyPath + '-wal'); } catch (_) {}
  try { fs.unlinkSync(legacyCopyPath + '-shm'); } catch (_) {}

  console.log(`\nReconciliation verify completed. Total failures: ${failures}`);
  process.exitCode = failures > 0 ? 1 : 0;
}
