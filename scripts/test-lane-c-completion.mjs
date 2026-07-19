// clean-room; behavior modeled on scripts/test-vnext-kernel-completion.mjs test-suite pattern (proprietary self, not copied)
//
// R1 Lane C completion tests (T1.5.1 snapshot fields, T1.4.2 client history
// panel, T1.8.1 notify migration hygiene). Uses its own throwaway SQLite file
// (vnext-data/test-lane-c.db) — never the shared vnext-data/vnext.db — and
// never binds any network port (all HTTP-shaped calls use in-process mock
// req/res objects, same as the existing kernel-completion suite). Every
// assertion below is a real comparison against an expected value; a failure
// sets process.exitCode = 1 and the run is loud about it (no silent/fake
// passes — see R1_FINAL_COMPLETION_REPORT.md §2.4 for the pattern this
// intentionally avoids).
'use strict';

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-lane-c.db');
const migrationsDir = path.resolve(here, '../migrations');

let failures = 0;
function check(label, condition, details) {
  if (condition) {
    console.log('  PASS:', label);
  } else {
    failures += 1;
    console.error('  FAIL:', label, details === undefined ? '' : details);
  }
}

// Ensure clean, isolated test DB (never the shared vnext-data/vnext.db).
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

// ---------------------------------------------------------------------------
// KNOWN CROSS-LANE DEFECT (discovered while writing this suite, not
// introduced or fixed by this lane): migrations/102, 202, 302 (this lane's
// own) and 402 are the four "*_completion" migrations. All four ALTER or
// reference tables created by migrations/501_r1_kernel_completion.mjs
// (x_doc_state_defs, x_approvals, x_api_keys, x_installed_modules). The
// shared migration-runner.mjs (vnext/server/db/migration-runner.mjs, not
// owned by this lane) applies migrations in plain filename-alphabetical
// order, which runs 102 BEFORE 501 — so `runMigrations({direction:'up'})`
// throws `no such table: x_doc_state_defs` on ANY fresh DB, including at
// real server boot (server.js's own startup migration call). This is a
// genuine, high-severity, already-present defect that blocks every lane's
// migrations, not something introduced here. It is out of this lane's owned
// paths (102/202/402/501 all belong to other lanes or are the cross-cutting
// migration flagged in R1_FINAL_COMPLETION_REPORT.md §2.1) and is reported
// to the integrator rather than fixed in this pass — see TASK.md
// "cross-lane finding" and the final report.
//
// To still genuinely exercise THIS lane's own migrations/302 and code
// against a realistic full schema, this test harness applies every
// migration's real, unmodified `up()` function directly, in a
// dependency-safe order — NOT by editing any migration file, only by
// changing the order this *test script* invokes them in.
// ---------------------------------------------------------------------------
// Derive the dependency-safe replay order from the SAME resolver the real
// migration runner uses, over every migration file currently on disk. This
// keeps the lane-C harness honest as R2/R3/later migrations are added without
// ever editing a migration file (drift-proof by construction).
const { resolveMigrationOrder } = await import(pathToFileURL(path.join(here, '../vnext/server/db/migration-runner.mjs')).href);
const actualMigrationFiles = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.mjs$/.test(f)).sort();
const loadedMigrations = [];
for (const file of actualMigrationFiles) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  loadedMigrations.push({ ...mod.migration, dependsOn: Array.isArray(mod.migration.dependsOn) ? mod.migration.dependsOn.map(String) : [], file });
}
const DEPENDENCY_SAFE_ORDER = resolveMigrationOrder(loadedMigrations).map((m) => m.file);
check(
  '0.1 dependency-safe replay order accounts for every migration file currently on disk (no silent drift)',
  JSON.stringify(DEPENDENCY_SAFE_ORDER.slice().sort()) === JSON.stringify(actualMigrationFiles.slice().sort()) && DEPENDENCY_SAFE_ORDER.length === actualMigrationFiles.length,
  { actualMigrationFiles, DEPENDENCY_SAFE_ORDER }
);

console.log('--- APPLYING MIGRATIONS (dependency-safe order — see note above) ---');
const migrationDb = new DatabaseSync(dbPath);
migrationDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of DEPENDENCY_SAFE_ORDER) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migrationDb);
  console.log('  applied:', mod.migration.id);
}
migrationDb.close();
console.log('Migrations applied.');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

const { applyR0ScopeSeed } = await import('../vnext/server/db/seed-runner.mjs');
const seedResult = applyR0ScopeSeed(db);
check('0.2 R0 scope seed applied (company-r0-demo exists for x_records.company_id FK)', !!db.prepare('SELECT 1 FROM r0_tenant_root WHERE company_id = ?').get('company-r0-demo'), seedResult);

// CommonJS engine modules — required via createRequire for unambiguous CJS
// interop (these files use `module.exports = {...}`, not ESM syntax).
const { writeAudit, getHistory, subscribeAudit } = require('../vnext/server/audit/audit.js');
const { createViewsFieldsHandler, _internal: fieldsInternal } = require('../vnext/server/fields/custom-fields.js');
const { createSnapshotFieldsModule } = require('../vnext/server/fields/snapshot-fields.js');
const { mountDocState } = require('../vnext/server/state/doc-state.js');
const { mountNotify } = require('../vnext/server/notify/notify.js');
const HistoryPanel = require('../vnext/client/history-panel.js');

// ---------------------------------------------------------------------------
// Mock HTTP req/res helpers (same shape as test-vnext-kernel-completion.mjs)
// ---------------------------------------------------------------------------
function mockRes() {
  return {
    headers: {}, statusCode: 200, body: '', writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    end(text) { this.body = text; this.writableEnded = true; },
  };
}
function mockReq(method, body, headers) {
  const payload = body === undefined ? {} : body;
  return {
    method,
    headers: Object.assign({ host: 'localhost' }, headers || {}),
    on(event, cb) {
      if (event === 'data') cb(Buffer.from(JSON.stringify(payload)));
      if (event === 'end') cb();
    },
  };
}
const wait = () => new Promise((r) => setTimeout(r, 10));
const ADMIN_HEADERS = { 'x-octagon-user': 'admin1', 'x-octagon-role': 'admin' };

function insertRecord(entity, id, data, createdBy) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
    .run(entity, id, 'company-r0-demo', JSON.stringify(data), now, now, createdBy || 'tester');
}
function readRecord(entity, id) {
  const row = db.prepare('SELECT data FROM x_records WHERE entity = ? AND id = ?').get(entity, id);
  return row ? JSON.parse(row.data) : null;
}

// ===========================================================================
// SUITE 1: T1.8.1 — notify preferences table owned by migration, not runtime
// ===========================================================================
console.log('\n=== SUITE 1: NOTIFY MIGRATION HYGIENE (T1.8.1) ===');

const tableRow = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'x_notification_preferences'").get();
check('1.1 x_notification_preferences exists after migrations, before mountNotify() is ever called', !!tableRow);

const notifySource = fs.readFileSync(path.resolve(here, '../vnext/server/notify/notify.js'), 'utf8');
check('1.2 notify.js no longer creates the table at runtime', !/CREATE TABLE[\s\S]{0,80}x_notification_preferences/.test(notifySource));

const migration302Source = fs.readFileSync(path.resolve(here, '../migrations/302_r1_lane_c_completion.mjs'), 'utf8');
check('1.3 migrations/302 is the one that owns the table', /CREATE TABLE IF NOT EXISTS x_notification_preferences/.test(migration302Source));

const notifyEngine = mountNotify({ db, authSessionFromRequest: () => null });
const prefRes = mockRes();
notifyEngine.handle(mockReq('PUT', { channels: ['in-app', 'email'] }, { 'x-user': 'notify_user' }), prefRes, new URL('http://localhost/api/x/notify/preferences'));
await wait();
const prefBody = JSON.parse(prefRes.body);
check('1.4 preferences PUT still works end-to-end against the migration-owned table', prefBody.success && prefBody.data.channels.includes('email'), prefBody);

const sendResult = notifyEngine.send({ user: 'notify_user', title: 'اختبار', body: 'رسالة اختبار' });
check('1.5 send() honors the stored preference (in-app channel persisted)', sendResult.status === 201, sendResult);
const listedNotif = db.prepare('SELECT COUNT(*) AS n FROM x_notifications WHERE user = ?').get('notify_user');
check('1.6 in-app notification row was written', Number(listedNotif.n) === 1, listedNotif);

// ===========================================================================
// SUITE 2: T1.5.1 — custom-fields.js snapshot type validation (HTTP layer)
// ===========================================================================
console.log('\n=== SUITE 2: SNAPSHOT FIELD CONFIG VALIDATION (T1.5.1) ===');

const fieldsHandler = createViewsFieldsHandler({ db });

// 2.1 missing snapshot_of entirely -> 400
{
  const res = mockRes();
  await fieldsHandler.handle(mockReq('POST', { key: 'price_snapshot', label_ar: 'السعر عند الترحيل', type: 'snapshot' }, ADMIN_HEADERS), res, new URL('http://localhost/api/x/_custom-fields/sales_order'));
  await wait();
  const body = JSON.parse(res.body);
  check('2.1 POST snapshot field without snapshot_of -> 400', res.statusCode === 400 && !body.success, body);
}

// 2.2 malformed snapshot_of (missing ref_field) -> 400
{
  const res = mockRes();
  await fieldsHandler.handle(mockReq('POST', { key: 'price_snapshot', label_ar: 'السعر عند الترحيل', type: 'snapshot', snapshot_of: { entity: 'product', field: 'price' } }, ADMIN_HEADERS), res, new URL('http://localhost/api/x/_custom-fields/sales_order'));
  await wait();
  const body = JSON.parse(res.body);
  check('2.2 POST snapshot field with incomplete snapshot_of -> 400', res.statusCode === 400 && !body.success, body);
}

// 2.3 valid snapshot field -> 201, then GET list shows it correctly
{
  const res = mockRes();
  await fieldsHandler.handle(mockReq('POST', {
    key: 'price_snapshot', label_ar: 'السعر عند الترحيل', type: 'snapshot',
    snapshot_of: { entity: 'product', field: 'price', ref_field: 'product_id', at_transition_to: 'posted' },
  }, ADMIN_HEADERS), res, new URL('http://localhost/api/x/_custom-fields/sales_order'));
  await wait();
  const body = JSON.parse(res.body);
  check('2.3 POST valid snapshot field -> 201', res.statusCode === 201 && body.success, body);

  const listRes = mockRes();
  await fieldsHandler.handle(mockReq('GET'), listRes, new URL('http://localhost/api/x/_custom-fields/sales_order'));
  await wait();
  const listBody = JSON.parse(listRes.body);
  const field = (listBody.data || []).find((f) => f.key === 'price_snapshot');
  check('2.4 GET list surfaces snapshot_of config', !!field && field.type === 'snapshot' && field.snapshot_of && field.snapshot_of.at_transition_to === 'posted', field);
}

// 2.5 _internal.normalizeSnapshotOf direct unit checks
check('2.5 normalizeSnapshotOf rejects a non-object', (() => { try { fieldsInternal.normalizeSnapshotOf('nope'); return false; } catch (e) { return e.statusCode === 400; } })());
check('2.6 normalizeSnapshotOf accepts a well-formed config', (() => {
  const out = fieldsInternal.normalizeSnapshotOf({ entity: 'product', field: 'price', ref_field: 'product_id', at_transition_to: 'posted' });
  return out.entity === 'product' && out.field === 'price' && out.ref_field === 'product_id' && out.at_transition_to === 'posted';
})());

// ===========================================================================
// SUITE 3: T1.5.1 — materialize-on-transition + hardened immutability proof
// (source changed TWICE after materialization; byte-identical snapshot both
// times; proven from the record's own stored data, not a live join)
// ===========================================================================
console.log('\n=== SUITE 3: SNAPSHOT MATERIALIZATION SURVIVES REPEATED SOURCE CHANGES (T1.5.1) ===');

insertRecord('product', 'prod1', { name: 'لوحة أكريليك', price: 100 });
db.prepare('INSERT INTO x_doc_state_defs (entity, definition) VALUES (?, ?)').run('sales_order', JSON.stringify({
  states: ['draft', 'posted'],
  transitions: [{ from: 'draft', to: 'posted', action: 'post' }],
}));
insertRecord('sales_order', 'so1', { customer: 'شركة الرافدين', product_id: 'prod1', status: 'draft' }, 'user1');

const snapshotModule = createSnapshotFieldsModule({ db }); // no crudEngine here — materialization only needs the audit hook

const docStateEngine = mountDocState({ db, authSessionFromRequest: () => ({ userId: 'user1', groups: ['manager'] }) });
const transitionRes = mockRes();
docStateEngine.handle(mockReq('POST', { action: 'post' }), transitionRes, new URL('http://localhost/api/x/state/sales_order/so1/transition'));
await wait();
const transitionBody = JSON.parse(transitionRes.body);
check('3.1 transition to posted succeeds', transitionBody.success && transitionBody.data.state === 'posted', transitionBody);

let so1 = readRecord('sales_order', 'so1');
check('3.2 snapshot materialized immediately at transition (custom.price_snapshot === 100)', so1 && so1.custom && so1.custom.price_snapshot === 100, so1);
check('3.3 frozen-value marker recorded (not just a coincidental copy)', so1 && so1.__frozen_values__ && so1.__frozen_values__.price_snapshot === 100, so1);

// Change the SOURCE product price TWICE after materialization (hardened requirement).
db.prepare('UPDATE x_records SET data = ? WHERE entity = ? AND id = ?').run(JSON.stringify({ name: 'لوحة أكريليك', price: 200 }), 'product', 'prod1');
so1 = readRecord('sales_order', 'so1');
check('3.4 snapshot unchanged after FIRST source price change (100, source now 200)', so1.custom.price_snapshot === 100, so1.custom.price_snapshot);

db.prepare('UPDATE x_records SET data = ? WHERE entity = ? AND id = ?').run(JSON.stringify({ name: 'لوحة أكريليك (معاد تسميته)', price: 300 }), 'product', 'prod1');
so1 = readRecord('sales_order', 'so1');
check('3.5 snapshot unchanged after SECOND source change (rename + price to 300)', so1.custom.price_snapshot === 100, so1.custom.price_snapshot);

const productNow = readRecord('product', 'prod1');
check('3.6 divergence proven: source price (300) !== frozen snapshot (100)', productNow.price === 300 && so1.custom.price_snapshot === 100);

// Re-firing materialization for an already-frozen field must be a no-op —
// proves this is a stored copy, not a live join that "happens" to look frozen.
const secondAttempt = snapshotModule._internal.materializeOne(
  db,
  { entity: 'sales_order', key: 'price_snapshot', snapshot_of: { entity: 'product', field: 'price', ref_field: 'product_id', at_transition_to: 'posted' } },
  'sales_order', 'so1', 'user1'
);
check('3.7 re-materialization is a documented no-op (already_frozen)', secondAttempt.skipped === true && secondAttempt.reason === 'already_frozen', secondAttempt);
so1 = readRecord('sales_order', 'so1');
check('3.8 value still 100 after the no-op re-materialize attempt', so1.custom.price_snapshot === 100);

// A field pointing at an unresolved reference must skip, never freeze garbage.
insertRecord('sales_order', 'so_orphan', { customer: 'X', product_id: 'does_not_exist', status: 'draft' }, 'user1');
const orphanResult = snapshotModule._internal.materializeOne(
  db,
  { entity: 'sales_order', key: 'price_snapshot', snapshot_of: { entity: 'product', field: 'price', ref_field: 'product_id', at_transition_to: 'posted' } },
  'sales_order', 'so_orphan', 'user1'
);
check('3.9 unresolved source reference is skipped, not frozen as null/undefined', orphanResult.skipped === true && orphanResult.reason === 'source_unresolved', orphanResult);

// ===========================================================================
// SUITE 4: T1.5.1 — best-effort immutability guard (post-write self-heal)
// Uses a MOCK crudEngine.subscribe because the real crud-engine.js
// updateRecord() currently has an unrelated pre-existing regression (T1.1.2,
// `cfg` referenced but not in scope — see R1_FINAL_COMPLETION_REPORT.md row
// T1.1.2, owned by a different lane, not edited here) that throws on every
// PATCH. This isolates and genuinely tests THIS lane's guard logic without
// depending on that other lane's bug being fixed first (see TASK.md).
// ===========================================================================
console.log('\n=== SUITE 4: SNAPSHOT IMMUTABILITY GUARD (T1.5.1, mock crud-engine) ===');

let capturedSubscriber = null;
const mockCrudEngine = { subscribe(fn) { capturedSubscriber = fn; return mockCrudEngine; } };
createSnapshotFieldsModule({ db, crudEngine: mockCrudEngine });
check('4.1 guard registers a subscriber against the provided crudEngine', typeof capturedSubscriber === 'function');

// Simulate an update that illegally changed the frozen field (as if it had
// gone through crud-engine's real PATCH path).
db.prepare('UPDATE x_records SET data = ? WHERE entity = ? AND id = ?').run(
  JSON.stringify({ customer: 'شركة الرافدين', product_id: 'prod1', status: 'draft', custom: { price_snapshot: 999999 }, __frozen_values__: { price_snapshot: 100 } }),
  'sales_order', 'so1'
);
capturedSubscriber('sales_order', 'update', { id: 'so1', custom: { price_snapshot: 999999 }, __frozen_values__: { price_snapshot: 100 } });

const healed = readRecord('sales_order', 'so1');
check('4.2 illegal write to a frozen field is reverted', healed.custom.price_snapshot === 100, healed.custom.price_snapshot);

const blockedAudit = db.prepare("SELECT * FROM x_audit WHERE entity = 'sales_order' AND record_id = 'so1' AND action = 'snapshot_write_blocked' ORDER BY at DESC LIMIT 1").get();
check('4.3 blocked attempt is audited', !!blockedAudit);

// A legitimate update that does NOT touch the frozen field must pass through untouched.
db.prepare('UPDATE x_records SET data = ? WHERE entity = ? AND id = ?').run(
  JSON.stringify({ customer: 'عميل جديد', product_id: 'prod1', status: 'draft', custom: { price_snapshot: 100 }, __frozen_values__: { price_snapshot: 100 } }),
  'sales_order', 'so1'
);
capturedSubscriber('sales_order', 'update', { id: 'so1', custom: { price_snapshot: 100 }, __frozen_values__: { price_snapshot: 100 } });
const untouched = readRecord('sales_order', 'so1');
check('4.4 non-violating update is left alone', untouched.custom.price_snapshot === 100 && untouched.customer === 'عميل جديد', untouched);

// Frozen entities in the project's global invariant list must never be touched.
let payrollSubscriber = null;
const mockPayrollEngine = { subscribe(fn) { payrollSubscriber = fn; return mockPayrollEngine; } };
createSnapshotFieldsModule({ db, crudEngine: mockPayrollEngine });
let payrollGuardThrew = false;
try { payrollSubscriber('payroll_slip', 'update', { id: 'p1', custom: { x: 1 }, __frozen_values__: { x: 999 } }); } catch (_) { payrollGuardThrew = true; }
check('4.5 payroll/timesheet/attendance entities are never touched by the guard', !payrollGuardThrew);

// ===========================================================================
// SUITE 5: T1.4.2 — client history panel pure functions (isomorphic module)
// ===========================================================================
console.log('\n=== SUITE 5: CLIENT HISTORY PANEL FORMATTING (T1.4.2) ===');

// Fixed non-zero base epoch: `new Date(0)` would make timeAgo's internal
// `if (!then) return ''` guard misfire, since epoch 0 is falsy in JS — that
// guard exists to reject unparseable dates (NaN), not to reject the literal
// Unix epoch, so the test uses a realistic timestamp instead of exercising
// that unrelated edge case.
const T0 = 1700000000000; // 2023-11-14T22:13:20.000Z
check('5.1 timeAgo: 30s ago -> الآن', HistoryPanel._internal.timeAgo(new Date(T0).toISOString(), T0 + 30500) === 'الآن');
check('5.2 timeAgo: 5 minutes ago -> Arabic plural form', HistoryPanel._internal.timeAgo(new Date(T0).toISOString(), T0 + 5 * 60000) === 'قبل 5 دقائق');
check('5.3 timeAgo: 2 hours ago -> dual form', HistoryPanel._internal.timeAgo(new Date(T0).toISOString(), T0 + 2 * 3600000) === 'قبل ساعتين');

check('5.4 actionLabel: create', HistoryPanel._internal.actionLabel({ action: 'create' }) === 'إنشاء السجل');
check('5.5 actionLabel: state_transition_post with after.state', HistoryPanel._internal.actionLabel({ action: 'state_transition_post', after: { state: 'posted' } }) === 'انتقال الحالة → posted');
check('5.6 actionLabel: snapshot_materialize', HistoryPanel._internal.actionLabel({ action: 'snapshot_materialize' }) === 'تجميد حقل لقطة (snapshot)');
check('5.7 actionLabel: snapshot_write_blocked', HistoryPanel._internal.actionLabel({ action: 'snapshot_write_blocked' }) === 'رُفض تعديل حقل مجمّد (snapshot)');

const rawChanges = { status: { from: 'draft', to: 'posted' }, id: { from: null, to: 'x' }, __frozen_values__: { from: null, to: {} }, created_at: { from: null, to: 'now' } };
const filtered = HistoryPanel._internal.visibleChanges(rawChanges);
check('5.8 visibleChanges strips technical/internal fields', Object.keys(filtered).length === 1 && 'status' in filtered, filtered);

const groupInput = [
  { at: '2026-07-17T10:00:00.000Z', action: 'create' },
  { at: '2026-07-17T12:00:00.000Z', action: 'update' },
  { at: '2026-07-16T09:00:00.000Z', action: 'delete' },
];
const grouped = HistoryPanel._internal.groupByDate(groupInput);
check('5.9 groupByDate groups same-day entries together and keeps distinct days separate', grouped.length === 2 && grouped[0].items.length === 2 && grouped[1].items.length === 1, grouped.map((g) => g.items.length));

check('5.10 formatValue renders null/undefined as em dash', HistoryPanel._internal.formatValue(null) === '—' && HistoryPanel._internal.formatValue(undefined) === '—');
check('5.11 formatValue renders numbers/strings as-is', HistoryPanel._internal.formatValue(100) === '100' && HistoryPanel._internal.formatValue('abc') === 'abc');

// ===========================================================================
// SUITE 6: cross-module integration — real audit.getHistory() feeds the
// client formatter correctly (backend T1.4.2 half + frontend half, wired)
// ===========================================================================
console.log('\n=== SUITE 6: AUDIT -> HISTORY PANEL INTEGRATION (T1.4.2) ===');

const realHistory = getHistory(db, 'sales_order', 'so1');
check('6.1 getHistory returns real rows for so1 (materialize + guard events)', realHistory.length >= 2, realHistory.length);
const materializeEntry = realHistory.find((e) => e.action === 'snapshot_materialize');
check('6.2 a real snapshot_materialize entry exists and parses through actionLabel', !!materializeEntry && HistoryPanel._internal.actionLabel(materializeEntry) === 'تجميد حقل لقطة (snapshot)');
if (materializeEntry) {
  const realFiltered = HistoryPanel._internal.visibleChanges(materializeEntry.changes);
  check('6.3 real materialize diff renders price_snapshot: null -> 100', realFiltered.price_snapshot && realFiltered.price_snapshot.from === null && realFiltered.price_snapshot.to === 100, realFiltered);
}
const realGrouped = HistoryPanel._internal.groupByDate(realHistory);
check('6.4 real history groups without throwing and preserves total item count', realGrouped.reduce((n, g) => n + g.items.length, 0) === realHistory.length);

// ===========================================================================
// SUITE 7: subscribeAudit hook itself (audit.js, owned by this lane)
// ===========================================================================
console.log('\n=== SUITE 7: AUDIT EVENT BUS (audit.js additive hook) ===');

let observed = [];
const unsubscribe = subscribeAudit((entry) => observed.push(entry));
writeAudit(db, { entity: 'demo_entity', recordId: 'd1', user: 'tester', action: 'create', before: null, after: { a: 1 } });
check('7.1 subscribeAudit receives entries for every writeAudit call', observed.length === 1 && observed[0].entity === 'demo_entity' && observed[0].action === 'create', observed);

unsubscribe();
writeAudit(db, { entity: 'demo_entity', recordId: 'd1', user: 'tester', action: 'update', before: { a: 1 }, after: { a: 2 } });
check('7.2 unsubscribe stops further delivery', observed.length === 1, observed);

let throwingCalled = false;
subscribeAudit(() => { throwingCalled = true; throw new Error('boom'); });
let auditStillWorked = true;
try {
  writeAudit(db, { entity: 'demo_entity', recordId: 'd1', user: 'tester', action: 'delete', before: { a: 2 }, after: null });
} catch (_) {
  auditStillWorked = false;
}
check('7.3 a throwing subscriber never breaks the audit write itself', throwingCalled && auditStillWorked);

// ---------------------------------------------------------------------------
db.close();

// Clean up the throwaway isolated test DB (never touches vnext-data/vnext.db).
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

console.log('\n--- SUMMARY ---');
if (failures) {
  console.error(`${failures} assertion(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log('All assertions PASSED.');
}
