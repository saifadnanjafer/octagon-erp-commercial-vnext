// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.2 (proprietary self, not copied)
// R10.2 focused acceptance: disposable DB only. Proves frozen payroll
// compatibility after VNext has been migrated and exercised alongside it:
//   - golden-month replay across every captured historical period, zero delta
//   - the 2026-04 month is proven per employee, field by field, byte-identical,
//     and cross-checked against the INDEPENDENTLY captured R0 fixture
//   - the named edge cases (Friday-OT, advances, month-end bonus) are covered
//   - the frozen legacy store is byte-identical before and after a full R10.1
//     migration plus live VNext posting activity
//   - VNext holds no payroll/attendance/timesheet table of its own
//   - the compatibility surface is read-only: no write verb, no write permission
//   - the sign-off artifact never claims more than the evidence supports
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import replayLib from '../vnext/server/compat/PayrollGoldenReplay.mjs';
import { LegacyPayrollAdapter } from '../vnext/server/compat/LegacyPayrollAdapter.mjs';
import migration from '../vnext/server/modules/migration/migration-engine.js';
import finance from '../vnext/server/finance/finance-engine.js';
import { mountPayrollCompatRoutes } from '../vnext/server/compat/payroll-compat-routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const GOLDEN_REF = 'legacy-payroll-golden.db';
const R0_FIXTURE = 'legacy-sanitized.db';
const BUSINESS_SOURCE = 'legacy-business-source.db';
const CUT_DATE = '2026-06-30';
const company = 'company-r0-demo';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r10-payroll-'));
const results = [];
let failures = 0;

function check(name, fn) {
  try { fn(); results.push(`PASS ${name}`); }
  catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); console.error(error); }
}
async function checkAsync(name, fn) {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); console.error(error); }
}

const store = new replayLib.GoldenPayrollStore(GOLDEN_REF);
const goldenProviders = {
  summaryProvider: (employeeId, periodId) => {
    const row = store.getClosing(employeeId, periodId);
    return row ? JSON.parse(row.closing_json) : null;
  },
  totalsProvider: (periodId) => {
    const period = store.getPeriod(periodId);
    return period ? {
      accrual_total: period.accrual_total,
      settlement_total: period.settlement_total,
      payment_total: period.payment_total,
      advance_total: period.advance_total,
      advance_count: period.advance_count,
    } : null;
  },
};

// ── fixture boundary ───────────────────────────────────────────────────────

check('the golden store is confined to sanitized fixtures and opens read-only', () => {
  assert.throws(() => new replayLib.GoldenPayrollStore('../server.js'), /limited to sanitized fixtures/);
  assert.throws(() => new replayLib.GoldenPayrollStore('C:/Windows/system.ini'), /limited to sanitized fixtures/);
  assert.throws(() => new replayLib.GoldenPayrollStore('missing.db'), /not found/);
  assert.throws(() => store.db.exec("INSERT INTO r10_payroll_golden_manifest (key, value) VALUES ('x','y')"));
});

check('the fixture states its capture guarantee and never copies raw attendance', () => {
  const manifest = store.manifest();
  assert.match(manifest.guarantee, /no payroll value is recomputed, inferred, or reconstructed/);
  assert.match(manifest.lockedSnapshot, /not copied/);
  for (const closing of store.listClosings(store.listPeriods().find((p) => p.fidelity === replayLib.CLOSING_DETAIL).period_id)) {
    assert.equal(closing.closing_json.includes('lockedSnapshotJson'), false, 'the raw attendance log must not be in the fixture');
    assert.equal(String(closing.locked_snapshot_digest).length, 64, 'but its digest must be retained');
  }
});

// ── the golden months themselves ───────────────────────────────────────────

let replay = null;
check('every captured historical period replays with zero delta', () => {
  replay = replayLib.replayGoldenMonths({ store, ...goldenProviders });
  assert.equal(replay.zeroDelta, true, 'no period may show a delta');
  assert.equal(replay.periodCount, 3, 'three historical months are covered');
  for (const period of replay.periods) assert.equal(period.mismatched, 0, `${period.label} mismatched`);
});

check('the three months are 2026-04, 2026-05 and 2026-06', () => {
  assert.deepEqual(replay.periods.map((period) => period.label), ['2026-04', '2026-05', '2026-06']);
});

check('fidelity is reported honestly per month and never overstated', () => {
  const detail = replay.periods.filter((period) => period.fidelity === replayLib.CLOSING_DETAIL);
  const totals = replay.periods.filter((period) => period.fidelity === replayLib.PERIOD_TOTALS);
  assert.deepEqual(detail.map((period) => period.label), ['2026-04']);
  assert.deepEqual(totals.map((period) => period.label), ['2026-05', '2026-06']);
  // A period-totals month must never report per-employee comparisons.
  for (const period of totals) {
    assert.equal(period.employeeCount, 0);
    assert.equal(period.employees, undefined);
    assert.ok(period.totals && Object.keys(period.totals).length >= 5);
  }
});

check('the detailed month compares every employee field by field', () => {
  const april = replay.periods.find((period) => period.label === '2026-04');
  assert.equal(april.employeeCount, 7);
  assert.equal(april.matched, 7);
  for (const employee of april.employees) {
    assert.equal(employee.identical, true);
    assert.equal(employee.actualDigest, employee.expectedDigest);
    assert.equal(employee.delta, null);
  }
});

check('the named edge cases are actually covered by matched employees', () => {
  for (const required of ['friday_overtime', 'advances', 'month_end_bonus']) {
    assert.ok(replay.edgeCasesCovered.includes(required), `edge case ${required} is not covered`);
  }
  assert.ok(replay.edgeCasesCovered.includes('negative_balance'), 'employee-owes-company case should be covered too');
});

// ── the replay must be able to FAIL ────────────────────────────────────────

check('a single drifted field is detected and reported precisely', () => {
  const drifted = replayLib.replayGoldenMonths({
    store,
    totalsProvider: goldenProviders.totalsProvider,
    summaryProvider: (employeeId, periodId) => {
      const summary = goldenProviders.summaryProvider(employeeId, periodId);
      if (summary && summary.netAccruedSalary) summary.netAccruedSalary = Number(summary.netAccruedSalary) + 1;
      return summary;
    },
  });
  assert.equal(drifted.zeroDelta, false, 'a one-dinar drift must fail the replay');
  const april = drifted.periods.find((period) => period.label === '2026-04');
  assert.equal(april.mismatched, 7);
  const sample = april.employees.find((employee) => !employee.identical);
  assert.equal(sample.delta.reason, 'field_delta');
  assert.ok(sample.delta.fields.netAccruedSalary, 'the drifted field must be named');
  assert.equal(sample.delta.fields.netAccruedSalary.actual - sample.delta.fields.netAccruedSalary.expected, 1);
});

check('a missing replayed summary fails rather than silently passing', () => {
  const missing = replayLib.replayGoldenMonths({
    store, totalsProvider: goldenProviders.totalsProvider, summaryProvider: () => null,
  });
  assert.equal(missing.zeroDelta, false);
  assert.equal(missing.periods.find((period) => period.label === '2026-04').employees[0].delta.reason, 'no_replayed_summary');
  assert.deepEqual(missing.edgeCasesCovered, [], 'nothing may be claimed as covered when nothing matched');
});

check('a drifted period total is detected on a period-totals month', () => {
  const drifted = replayLib.replayGoldenMonths({
    store,
    summaryProvider: goldenProviders.summaryProvider,
    totalsProvider: (periodId) => {
      const totals = goldenProviders.totalsProvider(periodId);
      return totals ? { ...totals, accrual_total: Number(totals.accrual_total) + 0.01 } : null;
    },
  });
  assert.equal(drifted.zeroDelta, false);
  const may = drifted.periods.find((period) => period.label === '2026-05');
  assert.equal(may.totals.accrual_total.identical, false);
  assert.equal(may.totals.payment_total.identical, true, 'only the drifted metric may fail');
});

// ── cross-fixture agreement with the independently captured R0 fixture ──────

check('the 2026-04 figures agree with the independently captured R0 fixture', () => {
  const adapter = new LegacyPayrollAdapter({ snapshotPath: path.join(repoRoot, 'vnext-fixtures', R0_FIXTURE) });
  try {
    const keys = adapter.listClosedMonthSummaryKeys();
    assert.equal(keys.length, 7, 'the R0 fixture carries the same seven employees');
    let compared = 0;
    for (const key of keys) {
      const r0 = adapter.getClosedMonthSummary(key.employee_id, key.payroll_period_id);
      const golden = goldenProviders.summaryProvider(key.employee_id, key.payroll_period_id);
      assert.ok(golden, `golden fixture is missing ${key.employee_id}; the two captures disagree on coverage`);
      // Compare every field the R0 capture shares with the R10.2 capture. The two
      // fixtures were captured independently, nine days apart, from production.
      for (const field of Object.keys(r0)) {
        if (!(field in golden)) continue;
        assert.equal(
          replayLib.canonical(golden[field]), replayLib.canonical(r0[field]),
          `${key.employee_id}.${field} differs between the two independent captures`
        );
        compared += 1;
      }
    }
    assert.ok(compared >= 7 * 10, `expected a substantial field overlap, compared ${compared}`);
  } finally { adapter.close(); }
});

// ── the frozen store survives a full VNext migration + live activity ────────

const frozenDigestBefore = replayLib.frozenFixtureDigest(R0_FIXTURE);
const goldenFingerprintBefore = store.fingerprint();

await checkAsync('a full R10.1 migration plus live VNext posting leaves payroll untouched', async () => {
  const dbPath = path.join(temp, 'r10-payroll.db');
  await runMigrations({ dbPath, direction: 'up' });
  const db = openMigrationDatabase(dbPath);
  try {
    // 1. Migrate the business world.
    const run = migration.runMigration(db, company, { source_ref: BUSINESS_SOURCE, cut_date: CUT_DATE }, 'migrator-r102');
    assert.equal(run.state, 'completed');
    assert.equal(run.report.reconciled, true);

    // 2. Exercise VNext for real: post additional finance activity after the cut.
    const cash = migration.traceSource(db, company, 'finance.accounts', 'cash_workshop').target_id;
    const income = migration.traceSource(db, company, 'finance.accounts', 'income_sales').target_id;
    const posted = finance.createAndPostFiscalDoc(db, company, {
      move_type: 'manual_entry', doc_date: '2026-07-05', currency: 'IQD',
      lines: [
        { account_id: cash, debit: 250000, credit: 0, description: 'post-migration receipt' },
        { account_id: income, debit: 0, credit: 250000, description: 'post-migration income' },
      ],
    }, 'operator-1');
    assert.ok(posted.docId);

    // 3. VNext must hold no payroll/attendance/timesheet table of its own.
    const footprint = replayLib.vnextFrozenFootprint(db);
    for (const [table, count] of Object.entries(footprint)) {
      assert.ok(count === null || count === 0, `VNext must not populate ${table} (found ${count})`);
    }

    // 4. The frozen store and the golden truth are bit-for-bit unchanged.
    assert.equal(replayLib.frozenFixtureDigest(R0_FIXTURE), frozenDigestBefore, 'the frozen legacy store was mutated');
    assert.equal(store.fingerprint(), goldenFingerprintBefore, 'the golden payroll truth changed');

    // 5. And the golden months still replay with zero delta afterwards.
    const after = replayLib.replayGoldenMonths({ store, ...goldenProviders });
    assert.equal(after.zeroDelta, true);
    assert.equal(after.fingerprint, replay.fingerprint);
  } finally { db.close(); }
});

check('the migration source itself carries no frozen payroll collection', () => {
  const source = new DatabaseSync(path.join(repoRoot, 'vnext-fixtures', BUSINESS_SOURCE), { readOnly: true });
  try {
    source.exec('PRAGMA query_only = ON;');
    const present = source.prepare('SELECT DISTINCT collection FROM collections').all().map((row) => row.collection);
    for (const frozen of replayLib.FROZEN_COLLECTIONS) {
      assert.equal(present.includes(frozen), false, `${frozen} must not be in the migration source`);
    }
  } finally { source.close(); }
});

// ── read-only compatibility surface ────────────────────────────────────────

function fakeRes() {
  return { status: null, body: null, headersSent: false, writableEnded: false, setHeader() {}, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
}
function routesWith(session, permissions = []) {
  return mountPayrollCompatRoutes({
    requireSession: () => session,
    canPermission: (user, permission) => permissions.includes(permission),
    sendJson: (res, status, body) => { res.status = status; res.body = body; },
  });
}
function invoke(routes, method, pathname) {
  const res = fakeRes();
  const handled = routes.handle({ method, headers: {} }, res, new URL(`http://localhost${pathname}`));
  return { handled, res };
}
async function settle() { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setTimeout(resolve, 30)); }

const adminSession = { ok: true, userId: 'admin-1', groups: ['admin'], mode: 'cookie' };
const viewerSession = { ok: true, userId: 'viewer-1', groups: ['staff'], mode: 'cookie' };
const localSession = { ok: true, userId: 'local-1', groups: ['admin'], mode: 'local-trusted' };

check('every write verb is refused before authentication is even considered', () => {
  const routes = routesWith(adminSession);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const attempt = invoke(routes, method, '/api/x/payroll-compat');
    assert.equal(attempt.handled, true);
    assert.equal(attempt.res.status, 405, `${method} must be refused`);
    assert.equal(attempt.res.body.meta.code, 'WRITE_SURFACE_DENIED');
  }
  for (const target of ['/api/x/payroll-compat/periods/anything', '/api/x/payroll-compat/replay', '/api/x/payroll-compat/signoff']) {
    assert.equal(invoke(routes, 'POST', target).res.status, 405);
  }
});

check('the surface exposes a view permission and no write permission at all', () => {
  const routes = routesWith(adminSession);
  assert.equal(routes.VIEW_PERMISSION, 'payroll_compat:view');
  const source = fs.readFileSync(path.join(repoRoot, 'vnext/server/compat/payroll-compat-routes.js'), 'utf8');
  assert.equal(/payroll_compat:(manage|execute|post|write|edit)/.test(source), false, 'no write permission may exist');
  assert.equal(/\b(INSERT|UPDATE|DELETE)\b/.test(source), false, 'the surface must contain no write statement');
});

check('anonymous, local-dev, and unpermitted callers are rejected', () => {
  assert.equal(invoke(routesWith(null), 'GET', '/api/x/payroll-compat').res.status, 401);
  const local = invoke(routesWith(localSession), 'GET', '/api/x/payroll-compat');
  assert.equal(local.res.status, 403);
  assert.equal(local.res.body.meta.code, 'LOCAL_DEV_REJECTED');
  const forbidden = invoke(routesWith(viewerSession), 'GET', '/api/x/payroll-compat');
  assert.equal(forbidden.res.status, 403);
  assert.equal(forbidden.res.body.meta.code, 'FORBIDDEN');
});

await checkAsync('an authorized viewer reads periods, detail, replay and sign-off', async () => {
  const routes = routesWith(viewerSession, ['payroll_compat:view']);

  const summary = invoke(routes, 'GET', '/api/x/payroll-compat');
  await settle();
  assert.equal(summary.res.status, 200);
  assert.equal(summary.res.body.data.readOnly, true);
  assert.equal(summary.res.body.data.periods.length, 3);
  assert.equal(summary.res.body.data.timesheetBridge, '/api/x/r3/legacy-workshop');
  assert.match(summary.res.body.data.timesheetMutability, /legacy application only/);

  const aprilId = summary.res.body.data.periods.find((period) => period.label === '2026-04').period_id;
  const detail = invoke(routes, 'GET', `/api/x/payroll-compat/periods/${encodeURIComponent(aprilId)}`);
  await settle();
  assert.equal(detail.res.status, 200);
  assert.equal(detail.res.body.data.closings.length, 7);
  assert.ok(detail.res.body.data.closings[0].closing.grossSalary > 0);

  const missing = invoke(routes, 'GET', '/api/x/payroll-compat/periods/nope');
  await settle();
  assert.equal(missing.res.status, 404);
  assert.equal(missing.res.body.meta.code, 'PERIOD_NOT_FOUND');

  const replayResponse = invoke(routes, 'GET', '/api/x/payroll-compat/replay');
  await settle();
  assert.equal(replayResponse.res.status, 200);
  assert.equal(replayResponse.res.body.data.kind, 'integrity_self_check');
  assert.equal(replayResponse.res.body.data.zeroDelta, true);

  const signoff = invoke(routes, 'GET', '/api/x/payroll-compat/signoff');
  await settle();
  assert.equal(signoff.res.status, 200);
  assert.equal(signoff.res.body.data.timesheetSurface.mode, 'read-only');
});

check('the client surface contains no write call', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'vnext/client/modules/payroll-compat/index.js'), 'utf8');
  assert.equal(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(source), false);
  assert.equal(/\b(createRecord|updateRecord|deleteRecord|save|submit)\s*\(/.test(source), false);
  assert.match(source, /badge-readonly/, 'the read-only badge must be shown');
  assert.match(source, /legacy-workshop/, 'the timesheet must be reached through the existing read-only bridge');
});

check('the compatibility module is loaded by the VNext shell', () => {
  const shell = fs.readFileSync(path.join(repoRoot, 'vnext/client/r3.html'), 'utf8');
  assert.match(shell, /modules\/payroll-compat\/index\.js/);
});

// ── sign-off artifact ──────────────────────────────────────────────────────

let signOff = null;
check('the sign-off artifact states exactly what was proven, and no more', () => {
  signOff = replayLib.buildSignOff(replay, {
    generatedAt: '2026-07-26T00:00:00.000Z',
    frozenStoreUnchanged: true,
    vnextFrozenFootprint: { employees: null, payroll_periods: null },
    timesheetSurface: { mounted: '/api/x/r3/legacy-workshop', mode: 'read-only' },
    ownerDecisionsRequired: ['O-3'],
  });
  assert.equal(signOff.zeroDelta, true);
  assert.equal(signOff.periodsValidated, 3);
  assert.deepEqual(signOff.perEmployeeProven.periods, ['2026-04']);
  assert.equal(signOff.perEmployeeProven.employeeComparisons, 7);
  assert.equal(signOff.perEmployeeProven.mismatches, 0);
  assert.deepEqual(signOff.periodLevelProven.periods, ['2026-05', '2026-06']);
  assert.match(signOff.periodLevelProven.note, /superseded the per-employee closing records/);
  assert.equal(signOff.frozenStoreUnchanged, true);
  assert.deepEqual(signOff.ownerDecisionsRequired, ['O-3']);
});

check('the sign-off cannot claim a clean result when the replay failed', () => {
  const failed = replayLib.buildSignOff(
    replayLib.replayGoldenMonths({ store, totalsProvider: goldenProviders.totalsProvider, summaryProvider: () => null }),
    { frozenStoreUnchanged: false }
  );
  assert.equal(failed.zeroDelta, false);
  assert.equal(failed.perEmployeeProven.mismatches, 7);
  assert.equal(failed.frozenStoreUnchanged, false);
  assert.deepEqual(failed.edgeCasesCovered, []);
});

// Emit the artifact for the owner.
const artifactPath = path.resolve(repoRoot, '..', 'octagon-analysis', 'R10_2_PAYROLL_SIGNOFF.json');
fs.writeFileSync(artifactPath, `${JSON.stringify(replayLib.buildSignOff(replay, {
  frozenStoreUnchanged: replayLib.frozenFixtureDigest(R0_FIXTURE) === frozenDigestBefore,
  vnextFrozenFootprint: 'no payroll, attendance, or timesheet table exists in the VNext schema',
  timesheetSurface: { mounted: '/api/x/r3/legacy-workshop', mode: 'read-only', embeddedAs: 'vnext/client/modules/payroll-compat' },
  ownerDecisionsRequired: [
    'O-3: accept period-level proof for 2026-05 and 2026-06, or re-close those months in the legacy app to regenerate per-employee closing records',
  ],
}), null, 2)}\n`, 'utf8');

check('the sign-off artifact is written for the owner', () => {
  assert.ok(fs.existsSync(artifactPath));
  const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  assert.equal(parsed.zeroDelta, true);
  assert.equal(parsed.frozenStoreUnchanged, true);
  assert.equal(parsed.ownerDecisionsRequired.length, 1);
});

store.close();

console.log(results.join('\n'));
const passed = results.filter((line) => line.startsWith('PASS')).length;
console.log(`\nR10.2 frozen payroll compatibility: ${passed}/${results.length} PASS, ${failures} FAIL`);
if (failures) process.exitCode = 1;
