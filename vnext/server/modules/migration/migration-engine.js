// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.1 (proprietary self, not copied)
// R10.1 data-migration execution engine.
//
// Executes the legacy → VNext cut-over as an ordered pipeline of idempotent,
// resumable steps. Every step:
//   - runs inside one atomic transaction (a failure leaves no partial state)
//   - writes a migration_source_map row per source record, so every migrated
//     record traces back to its legacy source id
//   - refuses to redo work already recorded in the map (exact-once)
//   - emits migration_reconciliation metrics that are the acceptance evidence
//
// Masters are backfilled through the canonical tables; opening balances are
// posted through the canonical finance and stock engines only — this engine
// never writes gl_line or stock_ledger_line itself.
//
// Frozen zone: employees/payroll/attendance/timesheet are never migrated. The
// source reader denies those collections outright and the employees step is a
// documented reference-only no-op.
'use strict';

const infra = require('../r3-infra');
const finance = require('../../finance/finance-engine');
const stock = require('../../stock/stock-engine');
const { openSource } = require('./legacy-source');

const SOURCE_SYSTEM = 'octagon-legacy-json';

// W0 relational spike demo records. The two-worlds rule: the legacy JSON store
// is the source of truth, so these demo rows are deliberately discarded (and
// logged) rather than reconciled.
const W0_DEMO_ENTITIES = Object.freeze([
  'crm_lead',
  'helpdesk_ticket',
  'product',
  'legacy_audit_log',
  'legacy_automation_rules',
  'legacy_history_ledger',
  'legacy_system_log',
  'legacy_workflow',
]);

// Entities that later releases put in x_records for real. Even if a caller
// asks, these are never discardable.
const PROTECTED_ENTITIES = Object.freeze([
  'print_template', 'workflow', 'public_form', 'studio_entity',
  'formula_field', 'saved_query', 'dashboard', 'dashboard_widget',
]);

const ACCOUNT_TYPES = new Set(['asset', 'liability', 'equity', 'income', 'expense', 'receivable', 'payable', 'liquidity', 'off_balance']);

const LOCATION_TYPE_MAP = {
  stock: 'internal', internal: 'internal', warehouse: 'internal',
  supplier: 'supplier', vendor: 'supplier',
  customer: 'customer',
  scrap: 'inventory_loss', loss: 'inventory_loss', inventory_loss: 'inventory_loss',
  production: 'production', wip: 'production',
};

const { fail, id, now, money, asDate } = infra;

// ── trace map + reconciliation primitives ──────────────────────────────────

function mappedRow(db, companyId, collection, sourceId) {
  return db.prepare(
    'SELECT * FROM migration_source_map WHERE company_id = ? AND source_collection = ? AND source_id = ?'
  ).get(companyId, collection, String(sourceId)) || null;
}

function trace(ctx, { collection, sourceId, targetEntity, targetId, disposition, skipReason }) {
  ctx.db.prepare(`
    INSERT INTO migration_source_map
      (id, company_id, run_id, step_key, source_system, source_collection, source_id, target_entity, target_id, disposition, skip_reason, migrated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id('mgmap'), ctx.companyId, ctx.runId, ctx.stepKey, SOURCE_SYSTEM,
    collection, String(sourceId), targetEntity, targetId || null, disposition, skipReason || null, now()
  );
}

/** Resolve a legacy source id to the canonical target id it was migrated (or linked) to. */
function targetIdFor(db, companyId, collection, sourceId) {
  const row = mappedRow(db, companyId, collection, sourceId);
  if (!row || !row.target_id) return null;
  if (row.disposition !== 'migrated' && row.disposition !== 'linked') return null;
  return row.target_id;
}

function recon(ctx, metric, sourceValue, targetValue, status, detail) {
  const source = sourceValue === null || sourceValue === undefined ? null : Number(sourceValue);
  const target = targetValue === null || targetValue === undefined ? null : Number(targetValue);
  const delta = source !== null && target !== null ? money(target - source) : null;
  ctx.db.prepare(`
    INSERT INTO migration_reconciliation
      (id, run_id, company_id, step_key, metric, source_value, target_value, delta, status, detail, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, step_key, metric) DO UPDATE SET
      source_value = excluded.source_value, target_value = excluded.target_value,
      delta = excluded.delta, status = excluded.status, detail = excluded.detail,
      computed_at = excluded.computed_at
  `).run(id('mgrec'), ctx.runId, ctx.companyId, ctx.stepKey, metric, source, target, delta, status, detail || null, now());
}

// ── steps ──────────────────────────────────────────────────────────────────

function stepAccounts(ctx) {
  const rows = ctx.source.list('finance.accounts');
  let migrated = 0; let linked = 0; let skipped = 0;

  for (const { sourceId, attributes } of rows) {
    if (mappedRow(ctx.db, ctx.companyId, 'finance.accounts', sourceId)) { linked += 1; continue; }
    const type = String(attributes.type || '').trim();
    const code = String(attributes.code || '').trim();
    const name = String(attributes.name || attributes.nameAr || sourceId).trim();
    if (!code || !ACCOUNT_TYPES.has(type)) {
      trace(ctx, { collection: 'finance.accounts', sourceId, targetEntity: 'account', disposition: 'skipped', skipReason: !code ? 'missing_code' : `unsupported_type:${type}` });
      skipped += 1;
      continue;
    }

    const existing = ctx.db.prepare('SELECT id FROM account WHERE company_id = ? AND code = ?').get(ctx.companyId, code);
    if (existing) {
      // A chart already carries this code. Link rather than duplicate so the
      // opening entry posts onto the account the company is really using.
      trace(ctx, { collection: 'finance.accounts', sourceId, targetEntity: 'account', targetId: existing.id, disposition: 'linked', skipReason: 'code_already_present' });
      linked += 1;
      continue;
    }

    const targetId = `acct_${sourceId}`;
    ctx.db.prepare(`
      INSERT INTO account (id, company_id, code, name, type, parent_id, created_at, created_by, removed)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0)
    `).run(targetId, ctx.companyId, code, name, type, now(), ctx.userId);
    trace(ctx, { collection: 'finance.accounts', sourceId, targetEntity: 'account', targetId, disposition: 'migrated' });
    migrated += 1;
  }

  recon(ctx, 'source_account_count', rows.length, migrated + linked, migrated + linked === rows.length - skipped ? 'ok' : 'mismatch', `skipped=${skipped}`);
  return { sourceCount: rows.length, migrated, linked, skipped };
}

function stepJournals(ctx) {
  // VNext has no journal table: R2 replaced legacy journals with the unified
  // fiscal-document model. Journals are recorded reference-only so the legacy
  // journal a move came from stays traceable.
  const rows = ctx.source.list('journals');
  let referenced = 0;
  for (const { sourceId } of rows) {
    if (mappedRow(ctx.db, ctx.companyId, 'journals', sourceId)) { referenced += 1; continue; }
    trace(ctx, { collection: 'journals', sourceId, targetEntity: 'fiscal_doc', disposition: 'reference_only', skipReason: 'unified_fiscal_document_model' });
    referenced += 1;
  }
  recon(ctx, 'journals_referenced', rows.length, referenced, 'info', 'legacy journals map onto the unified fiscal-document model');
  return { sourceCount: rows.length, migrated: 0, linked: 0, skipped: 0 };
}

function partnerAccountIds(ctx) {
  return {
    receivable: targetIdFor(ctx.db, ctx.companyId, 'finance.accounts', 'receivables_customers'),
    payable: targetIdFor(ctx.db, ctx.companyId, 'finance.accounts', 'payables_suppliers'),
  };
}

function insertPartner(ctx, sourceId, collection, name, partnerType, accounts) {
  const targetId = `partner_${sourceId}`;
  ctx.db.prepare(`
    INSERT INTO partner_master (id, company_id, name, partner_type, receivable_account_id, payable_account_id, currency, active, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    targetId, ctx.companyId, name, partnerType,
    partnerType === 'supplier' ? null : accounts.receivable,
    partnerType === 'customer' ? null : accounts.payable,
    ctx.currency, now(), ctx.userId
  );
  trace(ctx, { collection, sourceId, targetEntity: 'partner_master', targetId, disposition: 'migrated' });
  return targetId;
}

function stepPartners(ctx) {
  const accounts = partnerAccountIds(ctx);
  const customers = ctx.source.list('finance.customers');
  const suppliers = ctx.source.list('omni.suppliers');
  let migrated = 0; let linked = 0; let skipped = 0;

  for (const { sourceId, attributes } of customers) {
    if (mappedRow(ctx.db, ctx.companyId, 'finance.customers', sourceId)) { linked += 1; continue; }
    const name = String(attributes.name || attributes.companyName || sourceId).trim();
    if (!name) { trace(ctx, { collection: 'finance.customers', sourceId, targetEntity: 'partner_master', disposition: 'skipped', skipReason: 'missing_name' }); skipped += 1; continue; }
    insertPartner(ctx, sourceId, 'finance.customers', name, 'customer', accounts);
    migrated += 1;
  }

  for (const { sourceId, attributes } of suppliers) {
    if (mappedRow(ctx.db, ctx.companyId, 'omni.suppliers', sourceId)) { linked += 1; continue; }
    const name = String(attributes.name || sourceId).trim();
    if (!name) { trace(ctx, { collection: 'omni.suppliers', sourceId, targetEntity: 'partner_master', disposition: 'skipped', skipReason: 'missing_name' }); skipped += 1; continue; }
    insertPartner(ctx, sourceId, 'omni.suppliers', name, 'supplier', accounts);
    migrated += 1;
  }

  const sourceCount = customers.length + suppliers.length;
  recon(ctx, 'source_partner_count', sourceCount, migrated + linked, migrated + linked + skipped === sourceCount ? 'ok' : 'mismatch', `customers=${customers.length} suppliers=${suppliers.length} skipped=${skipped}`);
  return { sourceCount, migrated, linked, skipped };
}

function stepProducts(ctx) {
  const rows = ctx.source.list('omni.materials');
  const incomeAccount = targetIdFor(ctx.db, ctx.companyId, 'finance.accounts', 'income_sales');
  const expenseAccount = targetIdFor(ctx.db, ctx.companyId, 'finance.accounts', 'cogs_materials');
  let migrated = 0; let linked = 0; let skipped = 0;

  for (const { sourceId, attributes } of rows) {
    if (mappedRow(ctx.db, ctx.companyId, 'omni.materials', sourceId)) { linked += 1; continue; }
    const name = String(attributes.name || sourceId).trim();
    const code = String(attributes.SKU || attributes.sku || sourceId).trim();
    if (!name || !code) { trace(ctx, { collection: 'omni.materials', sourceId, targetEntity: 'product_master', disposition: 'skipped', skipReason: 'missing_name_or_code' }); skipped += 1; continue; }
    if (ctx.db.prepare('SELECT 1 FROM product_master WHERE company_id = ? AND code = ?').get(ctx.companyId, code)) {
      trace(ctx, { collection: 'omni.materials', sourceId, targetEntity: 'product_master', disposition: 'skipped', skipReason: 'code_conflict' });
      skipped += 1;
      continue;
    }

    const targetId = `prod_${sourceId}`;
    const cost = Number(attributes.cost) || 0;
    const costMethod = String(attributes.costingMethod || 'avco').toLowerCase() === 'fifo' ? 'fifo' : 'average';
    ctx.db.prepare(`
      INSERT INTO product_master
        (id, company_id, code, name, income_account_id, expense_account_id, active, created_at, created_by,
         product_type, stockable, cost_method, standard_cost, tracking_type, valuation_method)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'goods', 1, ?, ?, ?, ?)
    `).run(
      targetId, ctx.companyId, code, name, incomeAccount, expenseAccount, now(), ctx.userId,
      costMethod, cost, String(attributes.tracking || 'none'), String(attributes.costingMethod || 'avco').toLowerCase()
    );
    trace(ctx, { collection: 'omni.materials', sourceId, targetEntity: 'product_master', targetId, disposition: 'migrated' });
    migrated += 1;
  }

  recon(ctx, 'source_product_count', rows.length, migrated + linked, migrated + linked + skipped === rows.length ? 'ok' : 'mismatch', `skipped=${skipped}`);
  return { sourceCount: rows.length, migrated, linked, skipped };
}

function stepWarehouses(ctx) {
  const rows = ctx.source.list('omni.warehouses');
  let migrated = 0; let linked = 0;
  for (const { sourceId, attributes } of rows) {
    if (mappedRow(ctx.db, ctx.companyId, 'omni.warehouses', sourceId)) { linked += 1; continue; }
    const targetId = `wh_${sourceId}`;
    const name = String(attributes.nameAr || attributes.nameEn || attributes.code || sourceId).trim();
    const existing = ctx.db.prepare('SELECT warehouse_id FROM warehouses WHERE warehouse_id = ? AND company_id = ?').get(targetId, ctx.companyId);
    if (existing) {
      trace(ctx, { collection: 'omni.warehouses', sourceId, targetEntity: 'warehouses', targetId, disposition: 'linked', skipReason: 'already_present' });
      linked += 1;
      continue;
    }
    ctx.db.prepare('INSERT INTO warehouses (warehouse_id, company_id, name) VALUES (?, ?, ?)').run(targetId, ctx.companyId, name);
    trace(ctx, { collection: 'omni.warehouses', sourceId, targetEntity: 'warehouses', targetId, disposition: 'migrated' });
    migrated += 1;
  }
  recon(ctx, 'source_warehouse_count', rows.length, migrated + linked, migrated + linked === rows.length ? 'ok' : 'mismatch');
  return { sourceCount: rows.length, migrated, linked, skipped: 0 };
}

function defaultWarehouseId(ctx) {
  const row = ctx.db.prepare('SELECT warehouse_id FROM warehouses WHERE company_id = ? ORDER BY warehouse_id LIMIT 1').get(ctx.companyId);
  return row ? row.warehouse_id : null;
}

function upsertLocation(ctx, collection, sourceId, attributes, fallbackWarehouse) {
  const targetId = `loc_${sourceId}`;
  const rawType = String(attributes.type || 'stock').toLowerCase();
  const type = LOCATION_TYPE_MAP[rawType] || 'internal';
  const warehouseId = attributes.warehouseId
    ? targetIdFor(ctx.db, ctx.companyId, 'omni.warehouses', attributes.warehouseId) || fallbackWarehouse
    : fallbackWarehouse;

  if (!warehouseId) {
    trace(ctx, { collection, sourceId, targetEntity: 'locations', disposition: 'skipped', skipReason: 'no_warehouse_available' });
    return 'skipped';
  }
  const existing = ctx.db.prepare('SELECT location_id FROM locations WHERE location_id = ? AND company_id = ?').get(targetId, ctx.companyId);
  if (existing) {
    trace(ctx, { collection, sourceId, targetEntity: 'locations', targetId, disposition: 'linked', skipReason: 'already_present' });
    return 'linked';
  }
  const name = String(attributes.nameAr || attributes.name || attributes.nameEn || sourceId).trim();
  ctx.db.prepare('INSERT INTO locations (location_id, warehouse_id, company_id, name, type) VALUES (?, ?, ?, ?, ?)')
    .run(targetId, warehouseId, ctx.companyId, name, type);
  trace(ctx, { collection, sourceId, targetEntity: 'locations', targetId, disposition: 'migrated' });
  return 'migrated';
}

function stepLocations(ctx) {
  const fallbackWarehouse = defaultWarehouseId(ctx);
  // omni.storageLocations is the richer, warehouse-aware collection and is
  // processed first; the flat `locations` collection overlaps it by id, so
  // repeats resolve to 'linked' instead of creating a duplicate location.
  const groups = [
    { collection: 'omni.storageLocations', rows: ctx.source.list('omni.storageLocations') },
    { collection: 'locations', rows: ctx.source.list('locations') },
  ];
  let migrated = 0; let linked = 0; let skipped = 0; let sourceCount = 0;

  for (const { collection, rows } of groups) {
    sourceCount += rows.length;
    for (const { sourceId, attributes } of rows) {
      if (mappedRow(ctx.db, ctx.companyId, collection, sourceId)) { linked += 1; continue; }
      const outcome = upsertLocation(ctx, collection, sourceId, attributes, fallbackWarehouse);
      if (outcome === 'migrated') migrated += 1;
      else if (outcome === 'linked') linked += 1;
      else skipped += 1;
    }
  }

  recon(ctx, 'source_location_count', sourceCount, migrated + linked, migrated + linked + skipped === sourceCount ? 'ok' : 'mismatch', `skipped=${skipped}`);
  return { sourceCount, migrated, linked, skipped };
}

function stepEmployeesReference(ctx) {
  // Frozen zone. Employees are referenced read-only from the legacy store and
  // are never copied into VNext. Prove the boundary is enforced rather than
  // merely intended: the source reader must refuse the collection.
  let denied = false;
  try {
    ctx.source.count('employees');
  } catch (error) {
    denied = error.code === 'FROZEN_COLLECTION_DENIED';
  }
  if (!denied) throw fail('frozen employees collection must be denied by the migration source', 500, 'FROZEN_BOUNDARY_BREACH');

  recon(ctx, 'employees_migrated', 0, 0, 'info', 'employees stay in the frozen legacy payroll store; migration is reference-only');
  return { sourceCount: 0, migrated: 0, linked: 0, skipped: 0 };
}

function stepOpeningGl(ctx) {
  const moves = ctx.source.list('account_moves');
  const eligible = [];
  const ineligible = [];
  for (const move of moves) {
    const state = String(move.attributes.state || '').toLowerCase();
    const date = String(move.attributes.date || '').slice(0, 10);
    if (state === 'posted' && date && date <= ctx.cutDate) eligible.push(move);
    else ineligible.push({ move, reason: state !== 'posted' ? `state:${state || 'unknown'}` : 'after_cut_date' });
  }

  const alreadyMapped = eligible.find((move) => mappedRow(ctx.db, ctx.companyId, 'account_moves', move.sourceId));
  if (alreadyMapped) {
    const existingDoc = targetIdFor(ctx.db, ctx.companyId, 'account_moves', alreadyMapped.sourceId);
    return { sourceCount: moves.length, migrated: 0, linked: eligible.length, skipped: ineligible.length, idempotent: true, openingDocId: existingDoc };
  }

  // Aggregate the legacy ledger into one opening position per target account.
  const suspenseAccount = targetIdFor(ctx.db, ctx.companyId, 'finance.accounts', 'suspense');
  const perAccount = new Map();
  let unresolvedAccounts = 0;
  let sourceDebit = 0;
  let sourceCredit = 0;

  for (const move of eligible) {
    for (const line of move.attributes.line_ids || []) {
      const legacyAccount = String(line.account_id || '').trim();
      let targetAccount = legacyAccount ? targetIdFor(ctx.db, ctx.companyId, 'finance.accounts', legacyAccount) : null;
      if (!targetAccount) {
        if (!suspenseAccount) throw fail(`legacy account "${legacyAccount}" is unmapped and no suspense account exists`, 409, 'MIGRATION_ACCOUNT_UNMAPPED');
        targetAccount = suspenseAccount;
        unresolvedAccounts += 1;
      }
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      sourceDebit += debit;
      sourceCredit += credit;
      const current = perAccount.get(targetAccount) || 0;
      perAccount.set(targetAccount, current + debit - credit);
    }
  }

  const lines = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const [accountId, rawNet] of [...perAccount.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const net = money(rawNet);
    if (net === 0) continue;
    if (net > 0) { lines.push({ account_id: accountId, debit: net, credit: 0, description: 'Opening balance' }); totalDebit = money(totalDebit + net); }
    else { lines.push({ account_id: accountId, debit: 0, credit: -net, description: 'Opening balance' }); totalCredit = money(totalCredit + -net); }
  }

  const imbalance = money(totalDebit - totalCredit);
  if (imbalance !== 0) {
    if (!suspenseAccount) throw fail('opening balances are unbalanced and no suspense account exists', 409, 'MIGRATION_OPENING_UNBALANCED');
    if (imbalance > 0) { lines.push({ account_id: suspenseAccount, debit: 0, credit: imbalance, description: 'Opening balance imbalance' }); totalCredit = money(totalCredit + imbalance); }
    else { lines.push({ account_id: suspenseAccount, debit: -imbalance, credit: 0, description: 'Opening balance imbalance' }); totalDebit = money(totalDebit + -imbalance); }
  }

  if (!lines.length) throw fail('no opening balances were derived from the legacy ledger', 409, 'MIGRATION_OPENING_EMPTY');

  const posted = finance.createAndPostFiscalDoc(ctx.db, ctx.companyId, {
    move_type: 'manual_entry',
    doc_date: ctx.cutDate,
    currency: ctx.currency,
    lines,
  }, ctx.userId);

  for (const move of eligible) {
    trace(ctx, { collection: 'account_moves', sourceId: move.sourceId, targetEntity: 'fiscal_doc', targetId: posted.docId, disposition: 'migrated' });
  }
  for (const { move, reason } of ineligible) {
    trace(ctx, { collection: 'account_moves', sourceId: move.sourceId, targetEntity: 'fiscal_doc', disposition: 'skipped', skipReason: reason });
  }

  // ── reconciliation: the migrated trial balance must equal the legacy trial
  //    balance at the cut date, account by account, with tolerance 0.
  const legacyNet = new Map();
  for (const [accountId, rawNet] of perAccount.entries()) legacyNet.set(accountId, money(rawNet));
  const targetTb = finance.getTrialBalance(ctx.db, ctx.companyId, { endDate: ctx.cutDate });
  const targetNet = new Map(targetTb.map((row) => [row.account_id, money(row.balance)]));

  let maxDelta = 0;
  let mismatchedAccounts = 0;
  for (const accountId of new Set([...legacyNet.keys(), ...targetNet.keys()])) {
    const expected = legacyNet.get(accountId) || 0;
    const actual = targetNet.get(accountId) || 0;
    const delta = Math.abs(money(actual - expected));
    if (delta > maxDelta) maxDelta = delta;
    if (delta !== 0) mismatchedAccounts += 1;
  }

  recon(ctx, 'source_move_count', moves.length, eligible.length, 'info', `ineligible=${ineligible.length} (cancelled or after cut date)`);
  recon(ctx, 'source_total_debit', money(sourceDebit), totalDebit, 'info', 'aggregated legacy debits vs opening entry debits');
  recon(ctx, 'source_total_credit', money(sourceCredit), totalCredit, 'info', 'aggregated legacy credits vs opening entry credits');
  recon(ctx, 'opening_entry_imbalance', 0, imbalance, imbalance === 0 ? 'ok' : 'mismatch', imbalance === 0 ? 'legacy ledger balanced' : 'routed to suspense');
  recon(ctx, 'unresolved_source_accounts', 0, unresolvedAccounts, unresolvedAccounts === 0 ? 'ok' : 'mismatch', 'legacy account ids with no mapped target');
  recon(ctx, 'trial_balance_account_count', legacyNet.size, targetNet.size, legacyNet.size === targetNet.size ? 'ok' : 'mismatch');
  recon(ctx, 'trial_balance_mismatched_accounts', 0, mismatchedAccounts, mismatchedAccounts === 0 ? 'ok' : 'mismatch');
  recon(ctx, 'trial_balance_max_account_delta', 0, maxDelta, maxDelta === 0 ? 'ok' : 'mismatch', 'tolerance 0: migrated TB must equal legacy TB at the cut date');

  return { sourceCount: moves.length, migrated: eligible.length, linked: 0, skipped: ineligible.length, openingDocId: posted.docId };
}

/**
 * The category the stock engine will resolve for a product, matching its own
 * lookup so the perpetual-policy precondition below is exact and not a guess.
 */
function effectiveValuationCategory(db, productId) {
  const row = db.prepare(`
    SELECT c.name AS category FROM product_master p
    LEFT JOIN product_category c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(productId);
  return (row && row.category) || 'Staged';
}

function stepOpeningStock(ctx) {
  const rows = ctx.source.list('omni.materials');
  const withStock = rows.filter((row) => Number(row.attributes.stock) > 0);

  const location = ctx.db.prepare(
    "SELECT location_id FROM locations WHERE company_id = ? AND type = 'internal' ORDER BY location_id LIMIT 1"
  ).get(ctx.companyId);
  if (!location && withStock.length) throw fail('an internal stock location is required before opening stock can be loaded', 409, 'MIGRATION_LOCATION_REQUIRED');

  // Precondition: opening GL already carries the inventory balance at the cut
  // date. If a perpetual valuation policy is configured for a migrated
  // product's category the stock engine would post that value a second time,
  // so refuse rather than silently double-count.
  for (const { sourceId } of withStock) {
    const productId = targetIdFor(ctx.db, ctx.companyId, 'omni.materials', sourceId);
    if (!productId) continue;
    const category = effectiveValuationCategory(ctx.db, productId);
    const policy = ctx.db.prepare('SELECT 1 FROM stock_valuation_category_policy WHERE company_id = ? AND category = ?').get(ctx.companyId, category);
    if (policy) {
      throw fail(
        `a perpetual valuation policy exists for category "${category}"; opening stock would double-count the opening GL inventory balance`,
        409,
        'MIGRATION_STOCK_GL_DOUBLE_COUNT'
      );
    }
  }

  const glBefore = ctx.db.prepare('SELECT COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS c FROM gl_line WHERE company_id = ?').get(ctx.companyId);

  let migrated = 0; let linked = 0; let skipped = 0;
  let sourceQty = 0; let sourceValue = 0;

  for (const { sourceId, attributes } of rows) {
    const qty = Number(attributes.stock) || 0;
    const rate = Number(attributes.cost) || 0;
    const stockKey = `stock:${sourceId}`;
    if (mappedRow(ctx.db, ctx.companyId, 'omni.materials.stock', stockKey)) { linked += 1; continue; }

    const productId = targetIdFor(ctx.db, ctx.companyId, 'omni.materials', sourceId);
    if (!productId) {
      trace(ctx, { collection: 'omni.materials.stock', sourceId: stockKey, targetEntity: 'stock_inventory_adjustment', disposition: 'skipped', skipReason: 'product_not_migrated' });
      skipped += 1;
      continue;
    }
    if (qty <= 0) {
      trace(ctx, { collection: 'omni.materials.stock', sourceId: stockKey, targetEntity: 'stock_inventory_adjustment', disposition: 'skipped', skipReason: 'no_opening_quantity' });
      skipped += 1;
      continue;
    }

    sourceQty += qty;
    sourceValue = money(sourceValue + qty * rate);

    const result = stock.postInventoryAdjustment(ctx.db, ctx.companyId, {
      location_id: location.location_id,
      product_id: productId,
      counted_qty: qty,
      counted_rate: rate,
      posting_date: ctx.cutDate,
      reason: 'R10.1 opening stock migration',
      authorized_by: ctx.userId,
      authorization_ref: `R10-OPENING-STOCK-${ctx.runId}-${sourceId}`,
    }, ctx.userId);

    trace(ctx, { collection: 'omni.materials.stock', sourceId: stockKey, targetEntity: 'stock_inventory_adjustment', targetId: result.adjustmentId, disposition: 'migrated' });
    migrated += 1;
  }

  const glAfter = ctx.db.prepare('SELECT COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS c FROM gl_line WHERE company_id = ?').get(ctx.companyId);
  const glImpact = money((Number(glAfter.d) - Number(glBefore.d)) + (Number(glAfter.c) - Number(glBefore.c)));
  if (glImpact !== 0) {
    // Defence in depth behind the policy precondition: never let opening stock
    // silently move the trial balance the opening entry just established.
    throw fail('opening stock must not post to the general ledger; the opening entry already carries the inventory balance', 409, 'MIGRATION_STOCK_GL_IMPACT');
  }

  const valuation = stock.getValuationReport(ctx.db, ctx.companyId, location ? location.location_id : null, null, ctx.cutDate);
  const targetQty = valuation.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const targetValue = money(valuation.reduce((sum, row) => sum + Number(row.value || 0), 0));

  recon(ctx, 'opening_stock_quantity', sourceQty, targetQty, money(targetQty - sourceQty) === 0 ? 'ok' : 'mismatch', 'counted quantities from the legacy count sheet');
  recon(ctx, 'opening_stock_value', sourceValue, targetValue, money(targetValue - sourceValue) === 0 ? 'ok' : 'mismatch', 'counted value = quantity x unit cost');
  recon(ctx, 'opening_stock_gl_impact', 0, glImpact, glImpact === 0 ? 'ok' : 'mismatch', 'opening stock is quantity-only; GL was loaded by the opening entry');

  return { sourceCount: rows.length, migrated, linked, skipped };
}

/**
 * Validate and resolve the discard allowlist. Called at run entry as well as
 * inside the step, so an illegal request is rejected even when the discard step
 * has already completed and would otherwise be skipped.
 */
function resolveDiscardEntities(options) {
  const requested = Array.isArray(options && options.discardEntities) && options.discardEntities.length
    ? options.discardEntities.map(String)
    : W0_DEMO_ENTITIES;
  for (const entity of requested) {
    if (PROTECTED_ENTITIES.includes(entity)) throw fail(`entity "${entity}" is in active use and can never be discarded`, 403, 'MIGRATION_PROTECTED_ENTITY');
    if (!W0_DEMO_ENTITIES.includes(entity)) throw fail(`entity "${entity}" is not a known W0 demo entity`, 400, 'MIGRATION_UNKNOWN_DISCARD_ENTITY');
  }
  return requested;
}

function stepDiscardW0(ctx) {
  // Two-worlds rule: the legacy JSON store is the source of truth, so the W0
  // relational spike's demo records are discarded — explicitly, per record,
  // with the payload kept in the discard log so the decision is auditable.
  if (!infra.tableExists(ctx.db, 'x_records')) {
    recon(ctx, 'w0_records_discarded', 0, 0, 'info', 'no x_records table present');
    return { sourceCount: 0, migrated: 0, linked: 0, skipped: 0 };
  }

  const requested = resolveDiscardEntities(ctx.options);

  const hasCompanyColumn = ctx.db.prepare('PRAGMA table_info(x_records)').all().some((column) => column.name === 'company_id');
  const placeholders = requested.map(() => '?').join(',');
  // Scope: this company's rows, plus unscoped W0 spike residue (the spike wrote
  // pre-company placeholder ids such as 'default'). Rows belonging to another
  // REGISTERED company are never touched.
  const scopeClause = hasCompanyColumn
    ? 'AND (company_id IS NULL OR company_id = ? OR company_id NOT IN (SELECT company_id FROM companies))'
    : '';
  const scopeArgs = hasCompanyColumn ? [ctx.companyId] : [];
  const rows = ctx.db
    .prepare(`SELECT entity, id, data, ${hasCompanyColumn ? 'company_id' : 'NULL AS company_id'} FROM x_records WHERE entity IN (${placeholders}) ${scopeClause}`)
    .all(...requested, ...scopeArgs);

  const insertLog = ctx.db.prepare(`
    INSERT INTO migration_discard_log (id, run_id, company_id, target_entity, target_id, payload, reason, discarded_at, discarded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteRow = ctx.db.prepare('DELETE FROM x_records WHERE entity = ? AND id = ?');

  for (const row of rows) {
    const payload = JSON.stringify({ company_id: row.company_id, data: row.data });
    insertLog.run(id('mgdis'), ctx.runId, ctx.companyId, row.entity, row.id, payload, 'two_worlds_w0_demo_data', now(), ctx.userId);
    deleteRow.run(row.entity, row.id);
  }

  recon(ctx, 'w0_records_discarded', rows.length, rows.length, 'info', `entities=${requested.join(',')}`);
  return { sourceCount: rows.length, migrated: 0, linked: 0, skipped: rows.length };
}

function stepReconcile(ctx) {
  const summary = ctx.db.prepare(`
    SELECT status, COUNT(*) AS n FROM migration_reconciliation WHERE run_id = ? GROUP BY status
  `).all(ctx.runId);
  const counts = Object.fromEntries(summary.map((row) => [row.status, Number(row.n)]));
  const mismatches = counts.mismatch || 0;
  const traced = ctx.db.prepare('SELECT COUNT(*) AS n FROM migration_source_map WHERE run_id = ?').get(ctx.runId).n;
  const untraced = ctx.db.prepare(
    "SELECT COUNT(*) AS n FROM migration_source_map WHERE run_id = ? AND disposition IN ('migrated','linked') AND (target_id IS NULL OR target_id = '')"
  ).get(ctx.runId).n;

  recon(ctx, 'reconciliation_mismatch_count', 0, mismatches, mismatches === 0 ? 'ok' : 'mismatch', JSON.stringify(counts));
  recon(ctx, 'traced_source_records', traced, traced, 'info', 'every source record considered by the run has a trace row');
  recon(ctx, 'untraceable_migrated_records', 0, untraced, untraced === 0 ? 'ok' : 'mismatch', 'migrated/linked rows must all resolve to a target id');

  return { sourceCount: 0, migrated: 0, linked: 0, skipped: 0 };
}

const STEP_DEFS = Object.freeze([
  { key: 'accounts', sequence: 10, run: stepAccounts },
  { key: 'journals', sequence: 20, run: stepJournals },
  { key: 'partners', sequence: 30, run: stepPartners },
  { key: 'products', sequence: 40, run: stepProducts },
  { key: 'warehouses', sequence: 50, run: stepWarehouses },
  { key: 'locations', sequence: 60, run: stepLocations },
  { key: 'employees_reference', sequence: 70, run: stepEmployeesReference },
  { key: 'opening_gl', sequence: 80, run: stepOpeningGl },
  { key: 'opening_stock', sequence: 90, run: stepOpeningStock },
  { key: 'discard_w0', sequence: 100, run: stepDiscardW0 },
  { key: 'reconcile', sequence: 110, run: stepReconcile },
]);

// ── run orchestration ──────────────────────────────────────────────────────

function companyCurrency(db, companyId) {
  const row = db.prepare('SELECT currency FROM companies WHERE company_id = ?').get(companyId);
  return (row && row.currency) || 'IQD';
}

function validateCutDate(db, companyId, cutDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutDate)) throw fail('cut date must be an ISO date (YYYY-MM-DD)', 400, 'MIGRATION_CUT_DATE_INVALID');
  const period = db.prepare('SELECT status FROM fiscal_periods WHERE company_id = ? AND ? >= start_date AND ? <= end_date').get(companyId, cutDate, cutDate);
  if (!period) throw fail(`no fiscal period covers the cut date ${cutDate}`, 409, 'MIGRATION_CUT_DATE_NO_PERIOD');
  if (period.status !== 'open') throw fail(`the fiscal period covering ${cutDate} is not open`, 409, 'MIGRATION_CUT_DATE_PERIOD_CLOSED');
}

/**
 * Create the run (or return the existing one for the same source + cut date so
 * a re-invocation resumes instead of forking a second migration).
 */
function startRun(db, companyId, input, userId, runtime = null) {
  infra.ensureCompany(db, companyId);
  const cutDate = asDate(input && input.cut_date, '');
  const sourceRef = String((input && input.source_ref) || '').trim();
  validateCutDate(db, companyId, cutDate);

  const source = openSource(sourceRef);
  try {
    const fingerprint = source.fingerprint();
    const existing = db.prepare('SELECT * FROM migration_run WHERE company_id = ? AND source_ref = ? AND cut_date = ?').get(companyId, sourceRef, cutDate);
    if (existing) {
      if (existing.source_fingerprint !== fingerprint) {
        throw fail('the migration source changed since this run started; start a new run against the new snapshot', 409, 'MIGRATION_SOURCE_CHANGED');
      }
      return { ...existing, resumed: true };
    }

    return infra.withImmediateTransaction(db, () => {
      const runId = id('mgrun');
      db.prepare(`
        INSERT INTO migration_run (id, company_id, source_system, source_ref, source_fingerprint, cut_date, state, started_at, started_by)
        VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
      `).run(runId, companyId, SOURCE_SYSTEM, sourceRef, fingerprint, cutDate, now(), userId || 'system');

      for (const def of STEP_DEFS) {
        db.prepare(`
          INSERT INTO migration_step (id, run_id, company_id, step_key, sequence, state)
          VALUES (?, ?, ?, ?, ?, 'pending')
        `).run(id('mgstep'), runId, companyId, def.key, def.sequence);
      }
      infra.recordWrite(db, runtime, companyId, 'migration_run', runId, 'create', userId, null, { source_ref: sourceRef, cut_date: cutDate });
      return { ...db.prepare('SELECT * FROM migration_run WHERE id = ?').get(runId), resumed: false };
    });
  } finally {
    source.close();
  }
}

function stepRow(db, runId, stepKey) {
  return db.prepare('SELECT * FROM migration_step WHERE run_id = ? AND step_key = ?').get(runId, stepKey);
}

function executeStep(db, run, def, source, userId, runtime, options) {
  const existing = stepRow(db, run.id, def.key);
  if (!existing) throw fail(`unknown migration step "${def.key}"`, 404, 'MIGRATION_STEP_UNKNOWN');
  if (existing.state === 'completed') return { step: def.key, state: 'completed', skipped: true };

  db.prepare("UPDATE migration_step SET state = 'running', started_at = ?, error_code = NULL, error_message = NULL WHERE id = ?").run(now(), existing.id);

  const ctx = {
    db, source, runtime, options: options || {},
    companyId: run.company_id,
    runId: run.id,
    cutDate: run.cut_date,
    currency: companyCurrency(db, run.company_id),
    userId: userId || 'system',
    stepKey: def.key,
  };

  try {
    const result = infra.withImmediateTransaction(db, () => def.run(ctx));
    db.prepare(`
      UPDATE migration_step SET state = 'completed', finished_at = ?, source_count = ?, migrated_count = ?, linked_count = ?, skipped_count = ?
      WHERE id = ?
    `).run(now(), Number(result.sourceCount) || 0, Number(result.migrated) || 0, Number(result.linked) || 0, Number(result.skipped) || 0, existing.id);
    infra.recordWrite(db, runtime, run.company_id, 'migration_step', existing.id, 'update', userId, { state: existing.state }, { state: 'completed', step: def.key });
    return { step: def.key, state: 'completed', ...result };
  } catch (error) {
    // The step transaction has already rolled back; record the failure outside it.
    db.prepare("UPDATE migration_step SET state = 'failed', finished_at = ?, error_code = ?, error_message = ? WHERE id = ?")
      .run(now(), error.code || 'MIGRATION_STEP_FAILED', String(error.message || 'migration step failed').slice(0, 500), existing.id);
    throw error;
  }
}

/**
 * Run (or resume) the migration pipeline. Steps already completed are skipped,
 * so this is safe to call repeatedly; a failure stops the pipeline with the run
 * marked failed and every completed step preserved for the next attempt.
 */
function runMigration(db, companyId, input, userId, runtime = null) {
  // Reject an illegal discard request up front — before any step runs and
  // regardless of whether the discard step is already completed (and skipped).
  resolveDiscardEntities(input && input.options);
  const run = startRun(db, companyId, input, userId, runtime);
  const source = openSource(run.source_ref);
  const only = Array.isArray(input && input.steps) && input.steps.length ? new Set(input.steps.map(String)) : null;
  const executed = [];

  try {
    for (const def of STEP_DEFS) {
      if (only && !only.has(def.key)) continue;
      executed.push(executeStep(db, run, def, source, userId, runtime, input && input.options));
    }
  } catch (error) {
    db.prepare("UPDATE migration_run SET state = 'failed', finished_at = ?, error_code = ?, error_message = ? WHERE id = ?")
      .run(now(), error.code || 'MIGRATION_FAILED', String(error.message || 'migration failed').slice(0, 500), run.id);
    source.close();
    error.runId = run.id;
    error.executed = executed;
    throw error;
  }

  source.close();
  const pending = db.prepare("SELECT COUNT(*) AS n FROM migration_step WHERE run_id = ? AND state <> 'completed'").get(run.id).n;
  const state = pending === 0 ? 'completed' : 'running';
  db.prepare('UPDATE migration_run SET state = ?, finished_at = ?, error_code = NULL, error_message = NULL WHERE id = ?')
    .run(state, state === 'completed' ? now() : null, run.id);

  return { runId: run.id, state, resumed: Boolean(run.resumed), executed, report: getRunReport(db, companyId, run.id) };
}

function getRunReport(db, companyId, runId) {
  const run = db.prepare('SELECT * FROM migration_run WHERE id = ? AND company_id = ?').get(runId, companyId);
  if (!run) throw fail('migration run not found in this company scope', 404, 'MIGRATION_RUN_NOT_FOUND');
  const steps = db.prepare('SELECT * FROM migration_step WHERE run_id = ? ORDER BY sequence').all(runId);
  const reconciliation = db.prepare('SELECT * FROM migration_reconciliation WHERE run_id = ? ORDER BY step_key, metric').all(runId);
  const discarded = db.prepare('SELECT target_entity, COUNT(*) AS n FROM migration_discard_log WHERE run_id = ? GROUP BY target_entity').all(runId);
  const dispositions = db.prepare('SELECT disposition, COUNT(*) AS n FROM migration_source_map WHERE run_id = ? GROUP BY disposition').all(runId);
  const mismatches = reconciliation.filter((row) => row.status === 'mismatch');
  return {
    run, steps, reconciliation, discarded, dispositions,
    mismatchCount: mismatches.length,
    reconciled: mismatches.length === 0 && steps.every((step) => step.state === 'completed'),
  };
}

function listRuns(db, companyId) {
  infra.ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM migration_run WHERE company_id = ? ORDER BY started_at DESC').all(companyId);
}

/** Resolve a legacy record to the canonical record it became (traceability API). */
function traceSource(db, companyId, collection, sourceId) {
  infra.ensureCompany(db, companyId);
  return mappedRow(db, companyId, collection, sourceId);
}

/** Dry-run plan: what a run would touch, without writing anything. */
function previewRun(db, companyId, input) {
  infra.ensureCompany(db, companyId);
  const sourceRef = String((input && input.source_ref) || '').trim();
  const source = openSource(sourceRef);
  try {
    const collections = source.collections();
    return {
      source_ref: sourceRef,
      fingerprint: source.fingerprint(),
      cut_date: asDate(input && input.cut_date, ''),
      collections: collections.map((collection) => ({ collection, count: source.count(collection) })),
      steps: STEP_DEFS.map((def) => ({ step_key: def.key, sequence: def.sequence })),
      discard_entities: W0_DEMO_ENTITIES,
    };
  } finally {
    source.close();
  }
}

module.exports = {
  startRun,
  runMigration,
  getRunReport,
  listRuns,
  traceSource,
  previewRun,
  STEP_DEFS,
  W0_DEMO_ENTITIES,
  PROTECTED_ENTITIES,
  _internal: { trace, targetIdFor, recon, effectiveValuationCategory, validateCutDate, resolveDiscardEntities },
};
