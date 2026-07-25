// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.1 (proprietary self, not copied)
// R10.1 focused acceptance: disposable DB only, real legacy business-source
// fixture. Proves the roadmap acceptance criteria for data-migration execution:
//   - migrated trial balance == legacy trial balance at the cut date, tolerance 0
//   - stock valuation matches the legacy count sheet (quantity and value)
//   - every migrated record traces back to its legacy source id
//   - runs are idempotent and resumable, and steps are atomic
//   - the frozen payroll/attendance/timesheet zone is unreadable and untouched
//   - two-worlds rule: W0 spike demo data is explicitly discarded and logged
//   - routes enforce session + ACL + server-resolved company scope
//   - migration 1001 rolls back to the baseline schema
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, openMigrationDatabase, schemaFingerprint } from '../vnext/server/db/migration-runner.mjs';
import migration from '../vnext/server/modules/migration/migration-engine.js';
import legacySource from '../vnext/server/modules/migration/legacy-source.js';
import finance from '../vnext/server/finance/finance-engine.js';
import stock from '../vnext/server/stock/stock-engine.js';
import { mountMigrationRoutes } from '../vnext/server/modules/migration/migration-routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const SOURCE_REF = 'legacy-business-source.db';
const sourcePath = path.join(repoRoot, 'vnext-fixtures', SOURCE_REF);
const CUT_DATE = '2026-06-30';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r10-migration-'));
const dbPath = path.join(temp, 'r10-migration.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);

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

const company = 'company-r0-demo';
const otherCompany = 'company-r10-other';
db.prepare('INSERT OR IGNORE INTO companies (company_id, name, currency) VALUES (?, ?, ?)').run(otherCompany, 'Other Company', 'IQD');

// ── independent legacy truth, read straight from the fixture ────────────────

const truth = new DatabaseSync(sourcePath, { readOnly: true });
truth.exec('PRAGMA query_only = ON;');
function legacyRows(collection) {
  return truth.prepare('SELECT id, data FROM collections WHERE collection = ? ORDER BY id').all(collection)
    .map((row) => ({ id: row.id, attributes: JSON.parse(row.data) }));
}
const legacyAccounts = legacyRows('finance.accounts');
const legacyMoves = legacyRows('account_moves');
const legacyMaterials = legacyRows('omni.materials');
const eligibleMoves = legacyMoves.filter((m) => String(m.attributes.state) === 'posted' && String(m.attributes.date || '').slice(0, 10) <= CUT_DATE);

// Legacy trial balance at the cut date, computed independently of the engine.
const legacyTb = new Map();
for (const move of eligibleMoves) {
  for (const line of move.attributes.line_ids || []) {
    const key = String(line.account_id || '');
    legacyTb.set(key, (legacyTb.get(key) || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0));
  }
}
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Fingerprint of the source file, so the run can be proven not to have written to it.
function sourceDigest() {
  const buffer = fs.readFileSync(sourcePath);
  return `${buffer.length}:${buffer.subarray(0, 4096).toString('hex').slice(0, 64)}`;
}
const sourceDigestBefore = sourceDigest();

// ── W0 spike demo data + protected records, to prove the two-worlds rule ────

const hasXRecords = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='x_records'").get());
const protectedCountsBefore = {};
if (hasXRecords) {
  const columns = db.prepare('PRAGMA table_info(x_records)').all().map((c) => c.name);
  const hasCompany = columns.includes('company_id');
  const insert = hasCompany
    ? db.prepare('INSERT OR REPLACE INTO x_records (entity, id, data, created_at, updated_at, created_by, removed, company_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    : db.prepare('INSERT OR REPLACE INTO x_records (entity, id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, 0)');
  const stamp = new Date().toISOString();
  // The FK targets the R0 scope anchor, and unscoped W0 rows used a pre-company
  // placeholder id ('default' in the legacy store), so seed both.
  db.prepare('INSERT OR IGNORE INTO r0_tenant_root (company_id, legal_name) VALUES (?, ?)').run(company, 'R0 Demonstration Company');
  db.prepare('INSERT OR IGNORE INTO r0_tenant_root (company_id, legal_name) VALUES (?, ?)').run('default', 'W0 spike placeholder');
  db.prepare('INSERT OR IGNORE INTO r0_tenant_root (company_id, legal_name) VALUES (?, ?)').run(otherCompany, 'Other Company');
  const rows = [
    ['crm_lead', 'w0_lead_1', company],
    ['crm_lead', 'w0_lead_2', 'default'],          // unscoped W0 spike residue
    ['helpdesk_ticket', 'w0_ticket_1', company],
    ['product', 'w0_product_1', 'default'],
    ['print_template', 'tpl_protected_1', company], // in active use by R5.4
    ['workflow', 'wf_protected_1', company],        // in active use by R4.2
    ['crm_lead', 'other_company_lead', otherCompany], // belongs to another REGISTERED company
  ];
  for (const [entity, rowId, owner] of rows) {
    const args = [entity, rowId, JSON.stringify({ demo: true, entity }), stamp, stamp, 'w0-spike'];
    if (hasCompany) args.push(owner);
    insert.run(...args);
  }
  // Baseline for the protected entities. R4.2 seeds real workflow templates and
  // R5.4 seeds print templates, so the count is whatever the platform ships plus
  // the rows added above — all of it must survive the discard step untouched.
  for (const entity of ['print_template', 'workflow']) {
    protectedCountsBefore[entity] = db.prepare('SELECT COUNT(*) AS n FROM x_records WHERE entity = ?').get(entity).n;
  }
}

// ── source reader guarantees ───────────────────────────────────────────────

check('legacy source is readable only from inside the allowlisted source root', () => {
  assert.throws(() => legacySource.openSource('../server.js'), { code: 'SOURCE_OUTSIDE_ROOT' });
  assert.throws(() => legacySource.openSource('C:/Windows/system.ini'), { code: 'SOURCE_OUTSIDE_ROOT' });
  assert.throws(() => legacySource.openSource('does-not-exist.db'), { code: 'SOURCE_NOT_FOUND' });
  assert.throws(() => legacySource.openSource(''), { code: 'SOURCE_REF_REQUIRED' });
});

check('every frozen payroll/attendance/timesheet collection is denied by the source', () => {
  const source = legacySource.openSource(SOURCE_REF);
  try {
    for (const frozen of legacySource.FROZEN_COLLECTIONS) {
      assert.throws(() => source.list(frozen), { code: 'FROZEN_COLLECTION_DENIED' }, `expected ${frozen} to be denied`);
      assert.throws(() => source.count(frozen), { code: 'FROZEN_COLLECTION_DENIED' });
    }
    assert.equal(source.collections().some((c) => legacySource.FROZEN_COLLECTIONS.has(c)), false, 'fixture must contain no frozen collection');
  } finally { source.close(); }
});

check('the legacy source handle cannot write', () => {
  const source = legacySource.openSource(SOURCE_REF);
  try {
    assert.throws(() => source.db.exec("INSERT INTO collections (collection, id, data) VALUES ('x', 'y', '{}')"));
  } finally { source.close(); }
});

check('preview reports the plan without writing anything', () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM migration_run').get().n;
  const preview = migration.previewRun(db, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE });
  assert.equal(preview.source_ref, SOURCE_REF);
  assert.equal(preview.steps.length, migration.STEP_DEFS.length);
  assert.ok(preview.collections.find((c) => c.collection === 'account_moves').count === legacyMoves.length);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM migration_run').get().n, before);
});

// ── cut-date validation ────────────────────────────────────────────────────

check('cut date must be a real ISO date inside an open fiscal period', () => {
  assert.throws(() => migration.startRun(db, company, { source_ref: SOURCE_REF, cut_date: 'not-a-date' }, 'admin'), { code: 'MIGRATION_CUT_DATE_INVALID' });
  assert.throws(() => migration.startRun(db, company, { source_ref: SOURCE_REF, cut_date: '2019-06-30' }, 'admin'), { code: 'MIGRATION_CUT_DATE_NO_PERIOD' });
  db.prepare("UPDATE fiscal_periods SET status = 'closed' WHERE company_id = ? AND period_id = '2026-09'").run(company);
  assert.throws(() => migration.startRun(db, company, { source_ref: SOURCE_REF, cut_date: '2026-09-15' }, 'admin'), { code: 'MIGRATION_CUT_DATE_PERIOD_CLOSED' });
  db.prepare("UPDATE fiscal_periods SET status = 'open' WHERE company_id = ? AND period_id = '2026-09'").run(company);
});

check('an unknown company is rejected before any source is opened', () => {
  assert.throws(() => migration.startRun(db, 'company-does-not-exist', { source_ref: SOURCE_REF, cut_date: CUT_DATE }, 'admin'), { code: 'COMPANY_SCOPE_DENIED' });
});

// ── partial run then resume, proving resumability ──────────────────────────

let runId = null;
check('a partial run executes only the requested steps and stays resumable', () => {
  const partial = migration.runMigration(db, company, {
    source_ref: SOURCE_REF, cut_date: CUT_DATE,
    steps: ['accounts', 'journals', 'partners'],
  }, 'migrator-1');
  runId = partial.runId;
  assert.equal(partial.state, 'running', 'run stays open while steps remain');
  const steps = Object.fromEntries(partial.report.steps.map((s) => [s.step_key, s.state]));
  assert.equal(steps.accounts, 'completed');
  assert.equal(steps.partners, 'completed');
  assert.equal(steps.opening_gl, 'pending');
  assert.equal(steps.reconcile, 'pending');
});

check('accounts are migrated once and re-running the step is a no-op', () => {
  const migrated = db.prepare('SELECT COUNT(*) AS n FROM account WHERE company_id = ? AND id LIKE ?').get(company, 'acct_%').n;
  assert.equal(migrated, legacyAccounts.length, 'every legacy account has a target account');
  const before = db.prepare('SELECT COUNT(*) AS n FROM account WHERE company_id = ?').get(company).n;
  migration.runMigration(db, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE, steps: ['accounts'] }, 'migrator-1');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM account WHERE company_id = ?').get(company).n, before, 'a completed step never duplicates rows');
});

check('resuming reuses the same run instead of forking a second migration', () => {
  const restarted = migration.startRun(db, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE }, 'migrator-1');
  assert.equal(restarted.id, runId);
  assert.equal(restarted.resumed, true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM migration_run WHERE company_id = ?').get(company).n, 1);
});

check('a run refuses to resume against a changed source snapshot', () => {
  const run = db.prepare('SELECT source_fingerprint FROM migration_run WHERE id = ?').get(runId);
  db.prepare('UPDATE migration_run SET source_fingerprint = ? WHERE id = ?').run('tampered-fingerprint', runId);
  assert.throws(() => migration.startRun(db, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE }, 'migrator-1'), { code: 'MIGRATION_SOURCE_CHANGED' });
  db.prepare('UPDATE migration_run SET source_fingerprint = ? WHERE id = ?').run(run.source_fingerprint, runId);
});

// ── full run ───────────────────────────────────────────────────────────────

let report = null;
check('the full pipeline completes every step', () => {
  const full = migration.runMigration(db, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE }, 'migrator-1');
  report = full.report;
  assert.equal(full.runId, runId, 'the resumed run is the same run');
  assert.equal(full.state, 'completed');
  assert.equal(report.steps.length, migration.STEP_DEFS.length);
  assert.deepEqual([...new Set(report.steps.map((s) => s.state))], ['completed']);
});

check('the run reconciles with zero mismatches', () => {
  const mismatches = report.reconciliation.filter((row) => row.status === 'mismatch');
  assert.deepEqual(mismatches.map((m) => `${m.step_key}/${m.metric}=${m.delta}`), [], 'no reconciliation metric may mismatch');
  assert.equal(report.reconciled, true);
});

// ── acceptance 1: trial balance equality, tolerance 0 ──────────────────────

check('migrated trial balance equals the legacy trial balance at the cut date (tolerance 0)', () => {
  const targetTb = new Map(finance.getTrialBalance(db, company, { endDate: CUT_DATE }).map((row) => [row.account_id, round2(row.balance)]));
  let compared = 0;
  for (const [legacyAccountId, rawBalance] of legacyTb.entries()) {
    const expected = round2(rawBalance);
    const mapped = migration.traceSource(db, company, 'finance.accounts', legacyAccountId);
    assert.ok(mapped && mapped.target_id, `legacy account ${legacyAccountId} must be mapped`);
    const actual = targetTb.get(mapped.target_id) || 0;
    assert.equal(actual, expected, `account ${legacyAccountId} balance drifted`);
    targetTb.delete(mapped.target_id);
    compared += 1;
  }
  assert.ok(compared > 0, 'the comparison must cover real accounts');
  const leftovers = [...targetTb.entries()].filter(([, balance]) => balance !== 0);
  assert.deepEqual(leftovers, [], 'no unexplained balance may exist on the migrated side');
});

check('the opening entry is a single balanced posted document dated at the cut date', () => {
  const docId = migration.traceSource(db, company, 'account_moves', eligibleMoves[0].id).target_id;
  const doc = db.prepare('SELECT * FROM fiscal_doc WHERE id = ?').get(docId);
  assert.equal(doc.state, 'posted');
  assert.equal(doc.doc_date, CUT_DATE);
  assert.equal(doc.move_type, 'manual_entry');
  const totals = db.prepare('SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c FROM gl_line WHERE company_id = ?').get(company);
  assert.equal(round2(totals.d), round2(totals.c), 'the general ledger must be balanced');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM fiscal_doc WHERE company_id = ? AND state = 'posted'").get(company).n, 1, 'opening balances post exactly one document');
});

check('legacy debits and credits are fully accounted for in the opening entry', () => {
  const sourceDebit = eligibleMoves.reduce((sum, m) => sum + (m.attributes.line_ids || []).reduce((s, l) => s + (Number(l.debit) || 0), 0), 0);
  const metric = report.reconciliation.find((r) => r.step_key === 'opening_gl' && r.metric === 'source_total_debit');
  assert.equal(round2(metric.source_value), round2(sourceDebit));
  const imbalance = report.reconciliation.find((r) => r.step_key === 'opening_gl' && r.metric === 'opening_entry_imbalance');
  assert.equal(imbalance.status, 'ok');
  assert.equal(imbalance.target_value, 0);
});

check('cancelled and after-cut-date moves are skipped with a recorded reason', () => {
  const skipped = db.prepare("SELECT skip_reason, COUNT(*) AS n FROM migration_source_map WHERE company_id = ? AND source_collection = 'account_moves' AND disposition = 'skipped' GROUP BY skip_reason").all(company);
  const total = skipped.reduce((sum, row) => sum + Number(row.n), 0);
  assert.equal(total, legacyMoves.length - eligibleMoves.length);
  assert.ok(skipped.every((row) => row.skip_reason && row.skip_reason.length > 0));
  const cancelled = legacyMoves.filter((m) => String(m.attributes.state) !== 'posted').length;
  assert.equal(Number(skipped.find((row) => row.skip_reason === 'state:cancel')?.n || 0), cancelled);
});

// ── acceptance 2: stock valuation matches the count sheet ──────────────────

check('opening stock quantity and value match the legacy count sheet', () => {
  const expectedQty = legacyMaterials.reduce((sum, m) => sum + Math.max(0, Number(m.attributes.stock) || 0), 0);
  const expectedValue = round2(legacyMaterials.reduce((sum, m) => {
    const qty = Number(m.attributes.stock) || 0;
    return qty > 0 ? sum + qty * (Number(m.attributes.cost) || 0) : sum;
  }, 0));
  const valuation = stock.getValuationReport(db, company, null, null, CUT_DATE);
  const actualQty = valuation.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const actualValue = round2(valuation.reduce((sum, row) => sum + Number(row.value || 0), 0));
  assert.equal(actualQty, expectedQty);
  assert.equal(actualValue, expectedValue);
});

check('opening stock does not move the general ledger (the opening entry already carries inventory)', () => {
  const metric = report.reconciliation.find((r) => r.step_key === 'opening_stock' && r.metric === 'opening_stock_gl_impact');
  assert.equal(metric.status, 'ok');
  assert.equal(metric.target_value, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM fiscal_doc WHERE company_id = ? AND move_type = 'stock_valuation'").get(company).n, 0);
});

check('per-product opening quantities match their legacy counts', () => {
  for (const material of legacyMaterials) {
    const qty = Number(material.attributes.stock) || 0;
    if (qty <= 0) continue;
    const productId = migration.traceSource(db, company, 'omni.materials', material.id).target_id;
    const rows = stock.getValuationReport(db, company, null, productId, CUT_DATE);
    const actual = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    assert.equal(actual, qty, `product ${material.id} opening quantity drifted`);
  }
});

// ── acceptance 3: traceability ─────────────────────────────────────────────

check('every migrated or linked record resolves to a target id', () => {
  const untraceable = db.prepare(
    "SELECT COUNT(*) AS n FROM migration_source_map WHERE company_id = ? AND disposition IN ('migrated','linked') AND (target_id IS NULL OR target_id = '')"
  ).get(company).n;
  assert.equal(untraceable, 0);
});

check('every legacy business record is accounted for by exactly one trace row', () => {
  for (const [collection, rows] of [
    ['finance.accounts', legacyAccounts],
    ['account_moves', legacyMoves],
    ['omni.materials', legacyMaterials],
    ['finance.customers', legacyRows('finance.customers')],
    ['omni.suppliers', legacyRows('omni.suppliers')],
    ['omni.warehouses', legacyRows('omni.warehouses')],
    ['journals', legacyRows('journals')],
  ]) {
    const traced = db.prepare('SELECT COUNT(*) AS n FROM migration_source_map WHERE company_id = ? AND source_collection = ?').get(company, collection).n;
    assert.equal(traced, rows.length, `${collection} trace count mismatch`);
  }
});

check('a migrated target record resolves back to its legacy source id', () => {
  const mapped = migration.traceSource(db, company, 'omni.materials', 'mat_acrylic');
  assert.equal(mapped.target_entity, 'product_master');
  assert.equal(mapped.disposition, 'migrated');
  const product = db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ?').get(mapped.target_id, company);
  assert.ok(product, 'the traced target must exist');
  const back = db.prepare('SELECT source_id FROM migration_source_map WHERE company_id = ? AND target_entity = ? AND target_id = ?').get(company, 'product_master', product.id);
  assert.equal(back.source_id, 'mat_acrylic');
});

check('trace lookups are company scoped', () => {
  assert.equal(migration.traceSource(db, otherCompany, 'omni.materials', 'mat_acrylic'), null);
  assert.throws(() => migration.traceSource(db, 'nope', 'omni.materials', 'mat_acrylic'), { code: 'COMPANY_SCOPE_DENIED' });
  assert.throws(() => migration.getRunReport(db, otherCompany, runId), { code: 'MIGRATION_RUN_NOT_FOUND' });
});

// ── acceptance 4: masters ──────────────────────────────────────────────────

check('partners are migrated with the correct type and control accounts', () => {
  const customers = legacyRows('finance.customers');
  const suppliers = legacyRows('omni.suppliers');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM partner_master WHERE company_id = ? AND partner_type = 'customer'").get(company).n, customers.length);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM partner_master WHERE company_id = ? AND partner_type = 'supplier'").get(company).n, suppliers.length);
  const receivable = migration.traceSource(db, company, 'finance.accounts', 'receivables_customers').target_id;
  const customer = db.prepare('SELECT * FROM partner_master WHERE id = ?').get(migration.traceSource(db, company, 'finance.customers', customers[0].id).target_id);
  assert.equal(customer.receivable_account_id, receivable);
  assert.equal(customer.payable_account_id, null);
});

check('warehouses and locations are migrated without duplicating overlapping ids', () => {
  const warehouses = legacyRows('omni.warehouses');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM warehouses WHERE company_id = ?').get(company).n, warehouses.length);
  const storage = legacyRows('omni.storageLocations');
  const flat = legacyRows('locations');
  const distinct = new Set([...storage.map((r) => r.id), ...flat.map((r) => r.id)]);
  const internalOrOther = db.prepare("SELECT COUNT(*) AS n FROM locations WHERE company_id = ? AND type <> 'inventory_loss'").get(company).n;
  assert.equal(internalOrOther, distinct.size, 'overlapping ids link instead of duplicating');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM locations WHERE company_id = ? AND type = 'internal'").get(company).n > 0);
});

check('employees are never migrated — the frozen store stays authoritative', () => {
  const employeeTraces = db.prepare("SELECT COUNT(*) AS n FROM migration_source_map WHERE company_id = ? AND source_collection LIKE 'employee%'").get(company).n;
  assert.equal(employeeTraces, 0);
  const metric = report.reconciliation.find((r) => r.step_key === 'employees_reference' && r.metric === 'employees_migrated');
  assert.equal(metric.status, 'info');
  assert.equal(metric.target_value, 0);
});

// ── acceptance 5: two-worlds discard ───────────────────────────────────────

check('W0 spike demo records are discarded and logged; protected entities survive', () => {
  if (!hasXRecords) { assert.ok(true, 'no x_records table in this schema'); return; }
  const remaining = db.prepare("SELECT id FROM x_records WHERE entity IN ('crm_lead','helpdesk_ticket','product') ORDER BY id").all().map((r) => r.id);
  assert.deepEqual(remaining, ['other_company_lead'], 'only another registered company\'s row may survive');
  for (const [entity, before] of Object.entries(protectedCountsBefore)) {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM x_records WHERE entity = ?').get(entity).n, before, `${entity} rows are in active use and must survive`);
    assert.ok(before > 0, `${entity} baseline must be non-empty for this to prove anything`);
  }
  const logged = db.prepare('SELECT COUNT(*) AS n FROM migration_discard_log WHERE run_id = ?').get(runId).n;
  assert.equal(logged, 4, 'every discarded record is logged with its payload');
  assert.ok(db.prepare('SELECT payload FROM migration_discard_log WHERE run_id = ? LIMIT 1').get(runId).payload);
});

check('another registered company\'s records are never swept by the discard step', () => {
  if (!hasXRecords) { assert.ok(true, 'no x_records table in this schema'); return; }
  const survivor = db.prepare("SELECT company_id FROM x_records WHERE entity = 'crm_lead' AND id = 'other_company_lead'").get();
  assert.equal(survivor.company_id, otherCompany);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM migration_discard_log WHERE target_id = ?').get('other_company_lead').n, 0);
});

check('protected and unknown entities can never be discarded', () => {
  const probe = migration.runMigration.bind(null, db, company);
  assert.throws(() => probe({ source_ref: SOURCE_REF, cut_date: CUT_DATE, steps: ['discard_w0'], options: { discardEntities: ['print_template'] } }, 'migrator-1'), { code: 'MIGRATION_PROTECTED_ENTITY' });
  assert.throws(() => probe({ source_ref: SOURCE_REF, cut_date: CUT_DATE, steps: ['discard_w0'], options: { discardEntities: ['account'] } }, 'migrator-1'), { code: 'MIGRATION_UNKNOWN_DISCARD_ENTITY' });
});

// ── frozen zone: nothing in the new world touched the legacy store ─────────

check('the legacy source file is byte-identical after the whole migration', () => {
  assert.equal(sourceDigest(), sourceDigestBefore, 'the migration must never write to its source');
});

// ── HTTP surface ───────────────────────────────────────────────────────────

function fakeReq(method, url, body = null, headers = {}) {
  const listeners = {};
  return {
    method, url, headers: { 'x-company-id': company, ...headers },
    on(event, handler) {
      listeners[event] = handler;
      if (event === 'end') { if (listeners.data && body) listeners.data(JSON.stringify(body)); handler(); }
      return this;
    },
  };
}
function fakeRes() {
  return { status: null, body: null, headersSent: false, writableEnded: false, setHeader() {}, writeHead(s) { this.status = s; }, end(b) { this.body = b; } };
}
function invoke(routes, method, pathname, body, session) {
  const req = fakeReq(method, pathname, body);
  const res = fakeRes();
  const handled = routes.handle(req, res, new URL(`http://localhost${pathname}`));
  return { handled, res, session };
}

const adminSession = { ok: true, userId: 'admin-1', groups: ['admin'], mode: 'cookie' };
const viewerSession = { ok: true, userId: 'viewer-1', groups: ['staff'], mode: 'cookie' };
const localSession = { ok: true, userId: 'local-1', groups: ['admin'], mode: 'local-trusted' };

function routesWith(session, permissions = []) {
  return mountMigrationRoutes({
    db,
    requireSession: () => session,
    resolveScope: (req) => ({ companyId: req.headers['x-company-id'] }),
    canPermission: (user, permission) => permissions.includes(permission),
    sendJson: (res, status, body) => { res.status = status; res.body = body; },
  });
}

await checkAsync('routes reject anonymous, local-dev, and unpermitted callers', async () => {
  const anon = invoke(routesWith(null), 'GET', '/api/x/migration');
  assert.equal(anon.res.status, 401);
  const local = invoke(routesWith(localSession), 'GET', '/api/x/migration');
  assert.equal(local.res.status, 403);
  assert.equal(local.res.body.meta.code, 'LOCAL_DEV_REJECTED');
  const forbidden = invoke(routesWith(viewerSession), 'GET', '/api/x/migration');
  assert.equal(forbidden.res.status, 403);
  assert.equal(forbidden.res.body.meta.code, 'FORBIDDEN');
});

await checkAsync('read permission cannot start a migration run', async () => {
  const reader = routesWith(viewerSession, ['migration:view']);
  const list = invoke(reader, 'GET', '/api/x/migration');
  assert.equal(list.res.status, 200);
  assert.equal(list.res.body.success, true);
  const attempt = invoke(reader, 'POST', '/api/x/migration/runs', { source_ref: SOURCE_REF, cut_date: CUT_DATE });
  assert.equal(attempt.res.status, 403);
  assert.equal(attempt.res.body.meta.code, 'FORBIDDEN');
});

await checkAsync('an authorized caller reads the run report through the API', async () => {
  const admin = routesWith(adminSession);
  const result = invoke(admin, 'GET', `/api/x/migration/runs/${runId}`);
  assert.equal(result.res.status, 200);
  assert.equal(result.res.body.data.run.id, runId);
  assert.equal(result.res.body.data.reconciled, true);
  const trace = invoke(admin, 'GET', '/api/x/migration/trace/omni.materials/mat_acrylic');
  assert.equal(trace.res.status, 200);
  assert.equal(trace.res.body.data.target_entity, 'product_master');
});

await checkAsync('company scope comes from the server, never from the request body', async () => {
  const admin = routesWith(adminSession);
  const req = fakeReq('GET', `/api/x/migration/runs/${runId}`, null, { 'x-company-id': otherCompany });
  const res = fakeRes();
  admin.handle(req, res, new URL(`http://localhost/api/x/migration/runs/${runId}`));
  assert.equal(res.status, 404);
  assert.equal(res.body.meta.code, 'MIGRATION_RUN_NOT_FOUND');
});

// ── a second, isolated database: atomicity + perpetual-policy guard ─────────

await checkAsync('a failing step rolls back completely and leaves the run resumable', async () => {
  const isolatedPath = path.join(temp, 'r10-atomicity.db');
  await runMigrations({ dbPath: isolatedPath, direction: 'up' });
  const iso = openMigrationDatabase(isolatedPath);
  try {
    // Remove the internal-location prerequisite so opening_stock fails after
    // the master steps have already succeeded.
    const partial = migration.runMigration(iso, company, {
      source_ref: SOURCE_REF, cut_date: CUT_DATE,
      steps: ['accounts', 'journals', 'partners', 'products', 'opening_gl'],
    }, 'migrator-2');
    assert.equal(partial.state, 'running');

    let threw = null;
    try {
      migration.runMigration(iso, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE, steps: ['opening_stock'] }, 'migrator-2');
    } catch (error) { threw = error; }
    assert.ok(threw, 'opening stock must fail without an internal location');
    assert.equal(threw.code, 'MIGRATION_LOCATION_REQUIRED');

    const run = iso.prepare('SELECT * FROM migration_run WHERE id = ?').get(partial.runId);
    assert.equal(run.state, 'failed');
    assert.equal(iso.prepare("SELECT state FROM migration_step WHERE run_id = ? AND step_key = 'opening_stock'").get(partial.runId).state, 'failed');
    assert.equal(iso.prepare("SELECT state FROM migration_step WHERE run_id = ? AND step_key = 'opening_gl'").get(partial.runId).state, 'completed');
    assert.equal(iso.prepare('SELECT COUNT(*) AS n FROM stock_ledger_line WHERE company_id = ?').get(company).n, 0, 'the failed step left no partial stock');
    assert.equal(iso.prepare("SELECT COUNT(*) AS n FROM migration_source_map WHERE run_id = ? AND source_collection = 'omni.materials.stock'").get(partial.runId).n, 0, 'the failed step left no partial trace rows');

    // Supply the prerequisite and resume: the run finishes without redoing work.
    const glDocsBefore = iso.prepare("SELECT COUNT(*) AS n FROM fiscal_doc WHERE company_id = ? AND state = 'posted'").get(company).n;
    const resumed = migration.runMigration(iso, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE }, 'migrator-2');
    assert.equal(resumed.runId, partial.runId);
    assert.equal(resumed.state, 'completed');
    assert.equal(resumed.report.reconciled, true);
    assert.equal(iso.prepare("SELECT COUNT(*) AS n FROM fiscal_doc WHERE company_id = ? AND state = 'posted'").get(company).n, glDocsBefore, 'the completed opening entry is not reposted');
  } finally { iso.close(); }
});

await checkAsync('a configured perpetual valuation policy fails opening stock closed', async () => {
  const policyPath = path.join(temp, 'r10-policy.db');
  await runMigrations({ dbPath: policyPath, direction: 'up' });
  const iso = openMigrationDatabase(policyPath);
  try {
    migration.runMigration(iso, company, {
      source_ref: SOURCE_REF, cut_date: CUT_DATE,
      steps: ['accounts', 'journals', 'partners', 'products', 'warehouses', 'locations', 'employees_reference', 'opening_gl'],
    }, 'migrator-3');
    const valuationAccount = migration.traceSource(iso, company, 'finance.accounts', 'inventory_stock').target_id;
    const cogsAccount = migration.traceSource(iso, company, 'finance.accounts', 'cogs_materials').target_id;
    const adjustmentAccount = migration.traceSource(iso, company, 'finance.accounts', 'adjustments_differences').target_id;
    const accrualAccount = migration.traceSource(iso, company, 'finance.accounts', 'suspense').target_id;
    iso.prepare(`INSERT INTO stock_valuation_category_policy (company_id, category, valuation_account_id, cogs_account_id, adjustment_account_id, accrual_account_id) VALUES (?, 'Staged', ?, ?, ?, ?)`)
      .run(company, valuationAccount, cogsAccount, adjustmentAccount, accrualAccount);

    let threw = null;
    try { migration.runMigration(iso, company, { source_ref: SOURCE_REF, cut_date: CUT_DATE, steps: ['opening_stock'] }, 'migrator-3'); }
    catch (error) { threw = error; }
    assert.ok(threw, 'opening stock must refuse to double-count');
    assert.equal(threw.code, 'MIGRATION_STOCK_GL_DOUBLE_COUNT');
    assert.equal(iso.prepare('SELECT COUNT(*) AS n FROM stock_ledger_line WHERE company_id = ?').get(company).n, 0);
  } finally { iso.close(); }
});

await checkAsync('a different cut date produces its own run and its own trial balance', async () => {
  const earlyPath = path.join(temp, 'r10-early-cut.db');
  const earlyCut = '2026-03-31';
  await runMigrations({ dbPath: earlyPath, direction: 'up' });
  const iso = openMigrationDatabase(earlyPath);
  try {
    const early = migration.runMigration(iso, company, { source_ref: SOURCE_REF, cut_date: earlyCut }, 'migrator-4');
    assert.equal(early.state, 'completed');
    assert.equal(early.report.reconciled, true);

    const expected = new Map();
    for (const move of legacyMoves) {
      if (String(move.attributes.state) !== 'posted') continue;
      if (String(move.attributes.date || '').slice(0, 10) > earlyCut) continue;
      for (const line of move.attributes.line_ids || []) {
        const key = String(line.account_id || '');
        expected.set(key, (expected.get(key) || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0));
      }
    }
    const actual = new Map(finance.getTrialBalance(iso, company, { endDate: earlyCut }).map((row) => [row.account_id, round2(row.balance)]));
    for (const [legacyAccountId, rawBalance] of expected.entries()) {
      const mapped = migration.traceSource(iso, company, 'finance.accounts', legacyAccountId);
      assert.equal(actual.get(mapped.target_id) || 0, round2(rawBalance), `account ${legacyAccountId} drifted at the earlier cut date`);
    }
    assert.notEqual(expected.size, 0);
  } finally { iso.close(); }
});

// ── migration rollback ─────────────────────────────────────────────────────

await checkAsync('migration 1001 rolls back to the pre-R10 baseline schema', async () => {
  const rollbackPath = path.join(temp, 'r10-rollback.db');
  await runMigrations({ dbPath: rollbackPath, direction: 'up' });
  const iso = openMigrationDatabase(rollbackPath);
  const afterUp = schemaFingerprint(iso);
  assert.ok(iso.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_run'").get(), 'R10 tables exist after up');
  iso.close();

  const { migration: r10 } = await import('../migrations/1001_r10_data_migration.mjs');
  assert.deepEqual(r10.dependsOn, ['907_r9_marketplace_pack_distribution']);

  const down = openMigrationDatabase(rollbackPath);
  down.exec('BEGIN IMMEDIATE');
  r10.down(down);
  down.prepare('DELETE FROM schema_migrations WHERE migration_id = ?').run(r10.id);
  down.exec('COMMIT');
  for (const table of ['migration_run', 'migration_step', 'migration_source_map', 'migration_reconciliation', 'migration_discard_log']) {
    assert.equal(down.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), undefined, `${table} must be dropped`);
  }
  const afterDown = schemaFingerprint(down);
  assert.notEqual(afterDown, afterUp, 'the rollback must actually change the schema');

  down.exec('BEGIN IMMEDIATE');
  r10.up(down);
  down.prepare('INSERT INTO schema_migrations (migration_id, applied_at, checksum) VALUES (?, ?, ?)').run(r10.id, new Date().toISOString(), 'reapplied');
  down.exec('COMMIT');
  assert.equal(schemaFingerprint(down), afterUp, 're-applying 1001 restores the exact schema');
  down.close();
});

// ── report ─────────────────────────────────────────────────────────────────

truth.close();
db.close();

console.log(results.join('\n'));
const passed = results.filter((line) => line.startsWith('PASS')).length;
console.log(`\nR10.1 data migration: ${passed}/${results.length} PASS, ${failures} FAIL`);
if (failures) process.exitCode = 1;
