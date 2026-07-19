// clean-room; behavior modeled on scripts/test-vnext-kernel-completion.mjs Suite 5 fixture pattern (proprietary self, not copied)
//
// Blocker 3 (workflow-engine.js crash) focused regression suite. Root cause:
// recoverRunningWorkflows() rehydrates a workflow_run record straight from
// x_records JSON (not built by makeRun()), and log() unconditionally called
// run.logs.push(...) — a TypeError whenever the rehydrated object had no
// `logs` array. The bug was masked in ad-hoc testing because
// recoverRunningWorkflows() fired resumeWorkflow() fire-and-forget (`void`),
// so a caller awaiting recoverRunningWorkflows() itself didn't actually wait
// for the crash to surface. Fixed in vnext/server/workflow/workflow-engine.js:
// (1) log() now defensively initializes run.logs if it isn't already an
//     array, regardless of where `run` came from;
// (2) recoverRunningWorkflows() now awaits resumeWorkflow() per run instead
//     of firing it and moving on, so callers get deterministic completion.
// Isolated: its own throwaway SQLite file, never vnext-data/vnext.db, no
// network port (calls the engine's public API directly).
'use strict';

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-blocker3-workflow-recovery.db');
const migrationsDir = path.resolve(here, '../migrations');

let failures = 0;
function check(label, condition, details) {
  if (condition) console.log('  PASS:', label);
  else { failures += 1; console.error('  FAIL:', label, details === undefined ? '' : details); }
}

for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }

const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.mjs$/.test(f)).sort();
const migDb = new DatabaseSync(dbPath);
migDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of migrationFiles) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migDb);
}
migDb.close();

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
const { applyR0ScopeSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db);
const companyId = db.prepare('SELECT company_id FROM r0_tenant_root LIMIT 1').get().company_id;

const { mountWorkflow } = require('../vnext/server/workflow/workflow-engine.js');
const wfEngine = mountWorkflow({ db });

function seedRecord(entity, id, data) {
  db.prepare('INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
    .run(entity, id, companyId, JSON.stringify(data), new Date().toISOString(), new Date().toISOString(), 'admin');
}

console.log('=== SUITE 1: EXACT CRASH REPRODUCTION — rehydrated run with NO `logs` array ===');
seedRecord('workflow', 'wf_recover_1', {
  name: 'Recovery Test Workflow',
  active: true,
  nodes: [{ id: 'step_1', type: 'create-record', config: { entity: 'log_entry', values: { message: 'recovered' } } }],
});
seedRecord('workflow_run', 'wfr_no_logs', {
  id: 'wfr_no_logs', workflow_id: 'wf_recover_1', status: 'running', current_node_index: 0, context: {},
  // deliberately no `logs` field — this is the exact shape that used to crash
});

let threw = null;
try {
  await wfEngine.recoverRunningWorkflows();
} catch (error) {
  threw = error;
}
check('1.1 recoverRunningWorkflows() does not throw on a logs-less rehydrated run', threw === null, threw);

const recovered = db.prepare("SELECT data FROM x_records WHERE entity = 'workflow_run' AND id = 'wfr_no_logs'").get();
const parsedRecovered = JSON.parse(recovered.data);
check('1.2 the recovered run reaches a terminal status (completed)', parsedRecovered.status === 'completed', parsedRecovered.status);
check('1.3 logs was defensively initialized and populated during recovery', Array.isArray(parsedRecovered.logs) && parsedRecovered.logs.length > 0, parsedRecovered.logs);
check('1.4 the create-record node actually executed (log_entry was written)', db.prepare("SELECT COUNT(*) AS n FROM x_records WHERE entity = 'log_entry' AND removed = 0").get().n === 1);

console.log('\n=== SUITE 2: recoverRunningWorkflows() IS NOW GENUINELY AWAITABLE (not fire-and-forget) ===');
seedRecord('workflow', 'wf_recover_2', {
  name: 'Slow Recovery Workflow',
  active: true,
  nodes: [{ id: 'step_1', type: 'notify', config: { user: 'someone', title: 'hi' } }],
});
seedRecord('workflow_run', 'wfr_slow', { id: 'wfr_slow', workflow_id: 'wf_recover_2', status: 'running', current_node_index: 0, context: {} });
await wfEngine.recoverRunningWorkflows();
// If recoverRunningWorkflows() still fired resumeWorkflow() with `void`
// (fire-and-forget), the assertion immediately below would race the async
// completion and could observe status still 'running'. Awaiting it fully is
// exactly what makes this assertion deterministic.
const slowRun = JSON.parse(db.prepare("SELECT data FROM x_records WHERE entity = 'workflow_run' AND id = 'wfr_slow'").get().data);
check('2.1 status is already terminal immediately after the awaited call returns (no race)', slowRun.status === 'completed', slowRun.status);

console.log('\n=== SUITE 3: MISSING WORKFLOW DEFINITION DURING RECOVERY STILL FAILS CLEANLY ===');
seedRecord('workflow_run', 'wfr_orphan', { id: 'wfr_orphan', workflow_id: 'wf_does_not_exist', status: 'running', current_node_index: 0, context: {} });
threw = null;
try { await wfEngine.recoverRunningWorkflows(); } catch (error) { threw = error; }
check('3.1 recovery does not throw when the referenced workflow is missing', threw === null, threw);
const orphanRun = JSON.parse(db.prepare("SELECT data FROM x_records WHERE entity = 'workflow_run' AND id = 'wfr_orphan'").get().data);
check('3.2 orphaned run is marked failed with a clear error, not left dangling', orphanRun.status === 'failed' && /not found/i.test(orphanRun.error || ''), orphanRun);

console.log('\n=== SUITE 4: NON-RUNNING RUNS ARE UNTOUCHED BY RECOVERY ===');
seedRecord('workflow_run', 'wfr_already_done', { id: 'wfr_already_done', workflow_id: 'wf_recover_1', status: 'completed', current_node_index: 1, context: {}, logs: [{ at: 'x', status: 'done' }] });
await wfEngine.recoverRunningWorkflows();
const untouched = JSON.parse(db.prepare("SELECT data FROM x_records WHERE entity = 'workflow_run' AND id = 'wfr_already_done'").get().data);
check('4.1 an already-completed run is left exactly as-is by recovery', untouched.status === 'completed' && untouched.logs.length === 1, untouched);

console.log('\n--- SUMMARY ---');
console.log(failures === 0 ? 'BLOCKER 3 SUITE: ALL PASSED' : `BLOCKER 3 SUITE: ${failures} FAILURE(S)`);
if (failures) process.exitCode = 1;

for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }
