// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const { checkLockDate } = require('../finance/finance-engine');

/**
 * Helper to generate UUIDs
 */
function generateId() {
  return crypto.randomUUID();
}

function ensureT252Schema(db) {
  // R2.5.2 schema is owned by migrations/606_r2_stock_gl_perpetual.mjs.
  // This compatibility hook intentionally performs no runtime DDL; the
  // migration runner is the only authority for schema creation or upgrades.
  return db;
}

function withImmediateTransaction(db, work) {
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction) {
      try { db.exec('ROLLBACK'); } catch (_) {}
    }
    throw error;
  }
}

function parseDimensions(value) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'object' ? value : JSON.parse(String(value));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stock dimensions must be a JSON object');
  return JSON.stringify(parsed);
}

function getCompanyData(db, companyId) {
  const company = db.prepare('SELECT company_id, currency FROM companies WHERE company_id = ?').get(companyId);
  if (!company) throw new Error('Company not found');
  return company;
}

/**
 * Create a draft stock move
 */
function createStockMove(db, companyId, data) {
  ensureT252Schema(db);
  const company = getCompanyData(db, companyId);
  const fromLoc = db.prepare('SELECT location_id, warehouse_id, company_id FROM locations WHERE location_id = ?').get(data.from_location_id);
  const toLoc = db.prepare('SELECT location_id, warehouse_id, company_id FROM locations WHERE location_id = ?').get(data.to_location_id);
  if (!fromLoc || !toLoc) throw new Error('Source or target location not found');
  if (fromLoc.company_id !== companyId || toLoc.company_id !== companyId) throw new Error('Stock locations must belong to the posting company');
  if (data.warehouse_id && String(data.warehouse_id) !== String(toLoc.warehouse_id)) throw new Error('Stock warehouse is inconsistent with target location');
  const currency = String(data.currency || company.currency || 'IQD').trim();
  if (currency !== String(company.currency || 'IQD')) throw new Error('Stock currency must match the company currency');
  const dims = parseDimensions(data.dims);
  const id = data.id || generateId();
  const postingDate = data.posting_date || new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO stock_move (
      id, company_id, product_id, qty, uom, from_location_id, to_location_id, state, posting_date, voucher_ref, created_at, updated_at,
      warehouse_id, currency, dims, batch_number, serial_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    companyId,
    data.product_id,
    Number(data.qty),
    data.uom || 'قطعة',
    data.from_location_id,
    data.to_location_id,
    postingDate,
    data.voucher_ref || null,
    now,
    now,
    toLoc.warehouse_id,
    currency,
    dims,
    data.batch_number || null,
    data.serial_number || null
  );

  return { id };
}

/**
 * Fetch product data from x_records or legacy collections
 */
function getProductData(db, productId) {
  const hasTable = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const rec = hasTable('x_records') ? db.prepare(`SELECT company_id, data FROM x_records WHERE entity = 'product' AND id = ?`).get(productId) : null;
  if (rec) {
    try {
      const parsed = JSON.parse(rec.data);
      return { ...parsed, company_id: parsed.company_id || rec.company_id };
    } catch (_) {}
  }
  const legacy = hasTable('collections') ? db.prepare(`SELECT data FROM collections WHERE collection = 'materials' AND id = ?`).get(productId) : null;
  if (legacy) {
    try {
      return JSON.parse(legacy.data);
    } catch (_) {}
  }
  const master = db.prepare(`SELECT p.*, p.standard_cost AS cost_price, p.tracking_type, p.valuation_method,
      c.name AS category FROM product_master p
      LEFT JOIN product_category c ON c.id = p.category_id
      WHERE p.id = ?`).get(productId);
  if (master) return master;
  return null;
}

/**
 * Post a draft stock move and generate stock ledger lines
 */
function _postStockMove(db, companyId, moveId, userId, options = {}) {
  ensureT252Schema(db);
  const move = db.prepare(`SELECT * FROM stock_move WHERE company_id = ? AND id = ?`).get(companyId, moveId);
  if (!move) {
    throw new Error('Stock move not found');
  }
  if (move.state === 'done') {
    return {
      success: true,
      idempotent: true,
      ledgerLines: db.prepare('SELECT id FROM stock_ledger_line WHERE company_id = ? AND stock_move_id = ? ORDER BY rowid').all(companyId, moveId).map((row) => row.id),
      fiscalDocId: move.fiscal_doc_id || null,
    };
  }
  if (move.state !== 'draft') {
    throw new Error('Stock move is not in draft state');
  }

  // 1. Period and Lock Date checks
  checkLockDate(db, companyId, 'stock', move.posting_date);

  const period = db.prepare(`
    SELECT period_id, status FROM fiscal_periods
    WHERE company_id = ? AND ? >= start_date AND ? <= end_date
  `).get(companyId, move.posting_date, move.posting_date);

  if (!period || period.status !== 'open') {
    throw new Error('cannot post into a closed or locked period');
  }

  // 2. Fetch locations to check type
  const fromLoc = db.prepare(`SELECT * FROM locations WHERE location_id = ?`).get(move.from_location_id);
  const toLoc = db.prepare(`SELECT * FROM locations WHERE location_id = ?`).get(move.to_location_id);
  if (!fromLoc || !toLoc) {
    throw new Error('Source or target location not found');
  }
  if (fromLoc.company_id !== companyId || toLoc.company_id !== companyId) {
    throw new Error('Stock locations must belong to the posting company');
  }
  // The move must be anchored to one of its endpoint warehouses. Endpoints in two
  // different warehouses are a legitimate cross-warehouse transfer; an unrelated
  // third warehouse claim is still rejected.
  if (move.warehouse_id && move.warehouse_id !== fromLoc.warehouse_id && move.warehouse_id !== toLoc.warehouse_id) {
    throw new Error('Stock warehouse is inconsistent with move locations');
  }

  const isFromInternal = fromLoc.type === 'internal';
  const isToInternal = toLoc.type === 'internal';

  if (!isFromInternal && !isToInternal) {
    throw new Error('At least one location must be internal to post stock move');
  }

  // 3. Product master data & tracking policies
  const productData = getProductData(db, move.product_id);
  if (!productData) {
    throw new Error(`Product master data for ${move.product_id} not found`);
  }
  if (productData.company_id && productData.company_id !== companyId) {
    throw new Error('Product belongs to a different company');
  }
  const company = getCompanyData(db, companyId);
  if (move.currency && move.currency !== company.currency) {
    throw new Error('Stock currency must match the company currency');
  }

  const trackingType = productData.tracking_type || productData.tracking || 'none'; // 'none', 'batch', 'serial'
  const valuationMethod = productData.valuation_method || 'avco'; // 'avco', 'fifo'
  const standardCost = Number(productData.cost_price || 0.0);

  // 4. Batch & Serial validations
  const batchNumber = options.batch_number || move.batch_number || (trackingType === 'batch' ? move.voucher_ref : null);
  const serialNumber = options.serial_number || move.serial_number || null;

  if (trackingType === 'serial' && Number(move.qty) !== 1) {
    throw new Error('Serial-tracked stock moves must have quantity 1');
  }

  if (trackingType === 'batch') {
    if (!batchNumber) {
      throw new Error('Batch number is required for batch-tracked product');
    }
    // Check batch expiry
    const batch = db.prepare(`
      SELECT expiry_date FROM stock_batch 
      WHERE company_id = ? AND product_id = ? AND batch_number = ?
    `).get(companyId, move.product_id, batchNumber);
    if (batch && batch.expiry_date && move.posting_date > batch.expiry_date) {
      throw new Error('cannot issue or receive expired batch');
    }
  }

  if (trackingType === 'serial') {
    if (!serialNumber) {
      throw new Error('Serial number is required for serial-tracked product');
    }
    // Check unique-active constraint
    const serial = db.prepare(`
      SELECT location_id FROM stock_serial 
      WHERE company_id = ? AND product_id = ? AND serial_number = ?
    `).get(companyId, move.product_id, serialNumber);

    if (isFromInternal) {
      if (!serial || serial.location_id !== move.from_location_id) {
        throw new Error(`Serial ${serialNumber} is not active at source location`);
      }
    }
    if (isToInternal) {
      if (serial && serial.location_id && serial.location_id !== move.from_location_id) {
        throw new Error(`Serial ${serialNumber} is already active at location ${serial.location_id}`);
      }
    }
  }

  // Get or initialize bins
  const getBin = (locId) => {
    let b = db.prepare(`SELECT * FROM bin WHERE company_id = ? AND location_id = ? AND product_id = ?`).get(companyId, locId, move.product_id);
    if (!b) {
      b = { company_id: companyId, location_id: locId, product_id: move.product_id, qty: 0.0, value: 0.0 };
    }
    return b;
  };

  const fromBin = isFromInternal ? getBin(move.from_location_id) : null;
  const toBin = isToInternal ? getBin(move.to_location_id) : null;

  // 5. Negative stock policy check
  if (isFromInternal) {
    const negativeStockPolicy = options.negative_stock_policy || 'block'; // 'block' or 'allow'
    if (negativeStockPolicy === 'block' && fromBin.qty - move.qty < 0.0) {
      throw new Error('Negative stock is blocked for this location');
    }
  }

  // 6. Costing and Valuation calculations
  let incomingRate = Number(options.rate || move.cost_price || standardCost || 0.0);
  let outgoingRate = 0.0;

  const now = new Date().toISOString();

  // Outgoing rate calculation
  if (isFromInternal) {
    if (valuationMethod === 'fifo') {
      // Consume FIFO layers
      let remainingQty = move.qty;
      let totalCost = 0.0;

      const layers = db.prepare(`
        SELECT * FROM stock_fifo_layer 
        WHERE company_id = ? AND location_id = ? AND product_id = ? AND qty > 0.0
        ORDER BY posting_date ASC, created_at ASC
      `).all(companyId, move.from_location_id, move.product_id);

      for (const layer of layers) {
        if (remainingQty <= 0.0) break;
        const consumeQty = Math.min(layer.qty, remainingQty);
        totalCost += consumeQty * layer.unit_cost;
        remainingQty -= consumeQty;

        db.prepare(`
          UPDATE stock_fifo_layer SET qty = qty - ? WHERE id = ?
        `).run(consumeQty, layer.id);
      }

      if (remainingQty > 0.0) {
        // Fallback for negative stock/shortage
        const lastCost = layers.length > 0 ? layers[layers.length - 1].unit_cost : standardCost;
        totalCost += remainingQty * lastCost;
        // Create a negative layer to track shortage
        const negLayerId = generateId();
        db.prepare(`
          INSERT INTO stock_fifo_layer (id, company_id, location_id, product_id, qty, original_qty, unit_cost, posting_date, created_at, stock_ledger_line_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(negLayerId, companyId, move.from_location_id, move.product_id, -remainingQty, -remainingQty, lastCost, move.posting_date, now, moveId);
      }

      outgoingRate = totalCost / move.qty;
    } else {
      // AVCO (Moving Average)
      outgoingRate = fromBin.qty > 0.0 ? fromBin.value / fromBin.qty : standardCost;
      if (outgoingRate < 0.0) outgoingRate = standardCost;
    }
  }

  if (options.forced_rate !== undefined && options.forced_rate !== null) {
    const forcedRate = Number(options.forced_rate);
    if (!Number.isFinite(forcedRate) || forcedRate < 0.0) throw new Error('Stock valuation rate must be non-negative');
    if (isFromInternal) outgoingRate = forcedRate;
    if (isToInternal) incomingRate = forcedRate;
  }

  // If internal transfer, incoming rate matches outgoing rate
  if (isFromInternal && isToInternal) {
    incomingRate = outgoingRate;
  }

  // 7. Write Ledger lines and update Bins
  const ledgerLines = [];

  // Outgoing line
  if (isFromInternal) {
    const lineId = generateId();
    db.prepare(`
      INSERT INTO stock_ledger_line (id, company_id, stock_move_id, product_id, location_id, qty, valuation_rate, value, batch_number, serial_number, posting_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lineId, companyId, moveId, move.product_id, move.from_location_id, -move.qty, outgoingRate, -move.qty * outgoingRate, batchNumber, serialNumber, move.posting_date, now);

    // Update bin
    const newQty = fromBin.qty - move.qty;
    const newValue = fromBin.value - (move.qty * outgoingRate);
    db.prepare(`
      INSERT INTO bin (company_id, location_id, product_id, qty, value)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(company_id, location_id, product_id) DO UPDATE SET qty = excluded.qty, value = excluded.value
    `).run(companyId, move.from_location_id, move.product_id, newQty, newValue);

    ledgerLines.push(lineId);
  }

  // Incoming line
  if (isToInternal) {
    const lineId = generateId();
    db.prepare(`
      INSERT INTO stock_ledger_line (id, company_id, stock_move_id, product_id, location_id, qty, valuation_rate, value, batch_number, serial_number, posting_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lineId, companyId, moveId, move.product_id, move.to_location_id, move.qty, incomingRate, move.qty * incomingRate, batchNumber, serialNumber, move.posting_date, now);

    // Update bin and FIFO layer
    const newQty = toBin.qty + move.qty;
    let newValue = toBin.value + (move.qty * incomingRate);
    
    if (valuationMethod === 'fifo') {
      // Add FIFO layer
      const layerId = generateId();
      db.prepare(`
        INSERT INTO stock_fifo_layer (id, company_id, location_id, product_id, qty, original_qty, unit_cost, posting_date, created_at, stock_ledger_line_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(layerId, companyId, move.to_location_id, move.product_id, move.qty, move.qty, incomingRate, move.posting_date, now, lineId);
    } else {
      // AVCO value updates automatically
    }

    db.prepare(`
      INSERT INTO bin (company_id, location_id, product_id, qty, value)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(company_id, location_id, product_id) DO UPDATE SET qty = excluded.qty, value = excluded.value
    `).run(companyId, move.to_location_id, move.product_id, newQty, newValue);

    ledgerLines.push(lineId);
  }

  // 8. Update Serial tracking status
  if (trackingType === 'serial') {
    db.prepare(`
      INSERT INTO stock_serial (company_id, product_id, serial_number, location_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(company_id, product_id, serial_number) DO UPDATE SET location_id = excluded.location_id
    `).run(companyId, move.product_id, serialNumber, isToInternal ? move.to_location_id : null);
  }

  // 9. Update batch register if batch number is used
  if (trackingType === 'batch' && batchNumber) {
    db.prepare(`
      INSERT OR IGNORE INTO stock_batch (company_id, product_id, batch_number, expiry_date)
      VALUES (?, ?, ?, ?)
    `).run(companyId, move.product_id, batchNumber, options.expiry_date || null);
  }

  // 10. Update move state
  db.prepare(`
    UPDATE stock_move SET state = 'done', updated_at = ? WHERE id = ?
  `).run(now, moveId);

  // 11. Perpetual GL posting. This is intentionally inside the same caller transaction.
  let fiscalDocId = move.fiscal_doc_id || null;
  if (!options.skip_perpetual_gl) {
    try {
      fiscalDocId = postPerpetualJournalEntry(db, companyId, move, incomingRate, outgoingRate, userId, isFromInternal, isToInternal, fromLoc, toLoc, productData);
    } catch (err) {
      throw new Error('Failed to post perpetual stock GL entry: ' + err.message);
    }
  }

  return { success: true, ledgerLines, fiscalDocId };
}

function postStockMove(db, companyId, moveId, userId, options = {}) {
  return withImmediateTransaction(db, () => _postStockMove(db, companyId, moveId, userId, options));
}

/**
 * Perpetual GL posting helper
 */
function postPerpetualJournalEntry(db, companyId, move, incomingRate, outgoingRate, userId, isFromInternal, isToInternal, fromLoc, toLoc, productData) {
  // Check if stock_valuation_category_policy table exists
  const policyTableExists = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stock_valuation_category_policy'
  `).get();
  if (!policyTableExists) return;

  // Get policy
  const category = productData.category || 'Staged';
  const policy = db.prepare(`
    SELECT * FROM stock_valuation_category_policy WHERE company_id = ? AND category = ?
  `).get(companyId, category);

  if (!policy) {
    // Periodic mode (no category-level mapping)
    return;
  }

  const accounts = [policy.valuation_account_id, policy.cogs_account_id, policy.adjustment_account_id, policy.accrual_account_id];
  const accountRows = db.prepare(`SELECT id FROM account WHERE company_id = ? AND id IN (${accounts.map(() => '?').join(',')})`).all(companyId, ...accounts);
  if (accountRows.length !== new Set(accounts).size) throw new Error('Stock GL mapping contains an account from another company or a missing account');

  let debitAccount = null;
  let creditAccount = null;
  let amount = 0.0;

  if (!isFromInternal && isToInternal) {
    // Incoming move (purchase or adjustment gain)
    debitAccount = policy.valuation_account_id;
    creditAccount = fromLoc.type === 'inventory_loss' ? policy.adjustment_account_id : policy.accrual_account_id;
    amount = move.qty * incomingRate;
  } else if (isFromInternal && !isToInternal) {
    // Outgoing move (sale or adjustment loss)
    debitAccount = toLoc.type === 'inventory_loss' ? policy.adjustment_account_id : policy.cogs_account_id;
    creditAccount = policy.valuation_account_id;
    amount = move.qty * outgoingRate;
  } else if (isFromInternal && isToInternal) {
    // Internal transfer still produces one balanced valuation document. With one
    // company/category valuation account it nets to zero in GL while preserving
    // an auditable stock valuation event.
    debitAccount = policy.valuation_account_id;
    creditAccount = policy.valuation_account_id;
    amount = move.qty * outgoingRate;
  }

  if (!debitAccount || !creditAccount || amount < 0.0) throw new Error('Stock valuation amount cannot be negative');

  // Create a draft journal entry
  const docId = generateId();
  const now = new Date().toISOString();
  const company = getCompanyData(db, companyId);

  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, currency, created_at, created_by)
    VALUES (?, ?, NULL, 'stock_valuation', ?, 'draft', ?, ?, ?)
  `).run(docId, companyId, move.posting_date, company.currency || 'IQD', now, userId);

  // Insert Debit line
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, currency_code, dims, description, created_at)
    VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?)
  `).run(generateId(), docId, companyId, debitAccount, amount, company.currency || 'IQD', move.dims || null, `Stock move ${move.id} debit`, now);

  // Insert Credit line
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, currency_code, dims, description, created_at)
    VALUES (?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?)
  `).run(generateId(), docId, companyId, creditAccount, amount, company.currency || 'IQD', move.dims || null, `Stock move ${move.id} credit`, now);

  // Post the document
  const { postFiscalDoc } = require('../finance/finance-engine');
  postFiscalDoc(db, docId, userId);

  // Link to stock_move
  db.prepare(`
    UPDATE stock_move SET fiscal_doc_id = ? WHERE id = ?
  `).run(docId, move.id);

  return docId;
}

/**
 * Cancel/Reverse a posted stock move
 */
function cancelStockMove(db, companyId, moveId, userId) {
  return withImmediateTransaction(db, () => {
    ensureT252Schema(db);
    const move = db.prepare('SELECT * FROM stock_move WHERE company_id = ? AND id = ?').get(companyId, moveId);
    if (!move) throw new Error('Stock move not found');
    if (move.state === 'cancelled') {
      const existing = db.prepare("SELECT id, fiscal_doc_id FROM stock_move WHERE company_id = ? AND voucher_ref = ?").get(companyId, `REVERSAL-OF-${moveId}`);
      if (!existing) throw new Error('Cancelled stock move has no reversal');
      return { success: true, idempotent: true, reversalMoveId: existing.id, fiscalDocId: existing.fiscal_doc_id || null };
    }
    if (move.state !== 'done') throw new Error('Only posted stock moves can be cancelled');

    const postingDate = new Date().toISOString().split('T')[0];
    checkLockDate(db, companyId, 'stock', postingDate);
    const origLine = db.prepare('SELECT batch_number, serial_number, valuation_rate FROM stock_ledger_line WHERE company_id = ? AND stock_move_id = ? ORDER BY rowid LIMIT 1').get(companyId, moveId);
    const now = new Date().toISOString();
    const revMoveId = generateId();
    db.prepare(`
      INSERT INTO stock_move (
        id, company_id, product_id, qty, uom, from_location_id, to_location_id, state, posting_date, voucher_ref, created_at, updated_at,
        warehouse_id, currency, dims, batch_number, serial_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revMoveId, companyId, move.product_id, move.qty, move.uom, move.to_location_id, move.from_location_id,
      postingDate, `REVERSAL-OF-${moveId}`, now, now, move.warehouse_id, move.currency || 'IQD', move.dims || null,
      origLine?.batch_number || move.batch_number || null, origLine?.serial_number || move.serial_number || null
    );

    const postRes = _postStockMove(db, companyId, revMoveId, userId, {
      batch_number: origLine?.batch_number || move.batch_number || null,
      serial_number: origLine?.serial_number || move.serial_number || null,
      forced_rate: origLine?.valuation_rate || 0.0,
      negative_stock_policy: 'allow',
      skip_perpetual_gl: true,
    });

    let fiscalDocId = null;
    if (move.fiscal_doc_id) {
      const { reverseFiscalDoc } = require('../finance/finance-engine');
      reverseFiscalDoc(db, move.fiscal_doc_id, userId);
      const reversal = db.prepare('SELECT id FROM fiscal_doc WHERE reversal_of_id = ? AND state = ? ORDER BY post_date DESC LIMIT 1').get(move.fiscal_doc_id, 'posted');
      if (!reversal) throw new Error('Stock move GL reversal was not posted');
      fiscalDocId = reversal.id;
      db.prepare('UPDATE stock_move SET fiscal_doc_id = ? WHERE id = ?').run(fiscalDocId, revMoveId);
    }

    db.prepare("UPDATE stock_move SET state = 'cancelled', updated_at = ? WHERE id = ?").run(now, moveId);
    return { success: true, reversalMoveId: revMoveId, ledgerLines: postRes.ledgerLines, fiscalDocId };
  });
}

/**
 * Rebuild bin quantity and value cache from stock ledger lines
 */
function rebuildBins(db, companyId, locationId, productId) {
  // Clear existing bin
  db.prepare(`
    DELETE FROM bin WHERE company_id = ? AND location_id = ? AND product_id = ?
  `).run(companyId, locationId, productId);

  // Recalculate from ledger lines
  const summary = db.prepare(`
    SELECT SUM(qty) as total_qty, SUM(value) as total_value
    FROM stock_ledger_line
    WHERE company_id = ? AND location_id = ? AND product_id = ?
  `).get(companyId, locationId, productId);

  const qty = summary && summary.total_qty !== null ? Number(summary.total_qty) : 0.0;
  const value = summary && summary.total_value !== null ? Number(summary.total_value) : 0.0;

  db.prepare(`
    INSERT INTO bin (company_id, location_id, product_id, qty, value)
    VALUES (?, ?, ?, ?, ?)
  `).run(companyId, locationId, productId, qty, value);

  return { qty, value };
}

/**
 * Post physical inventory count adjustment
 */
function postInventoryAdjustment(db, companyId, data, userId) {
  return withImmediateTransaction(db, () => {
    ensureT252Schema(db);
    const reason = String(data.reason || '').trim();
    const authorizedBy = String(data.authorized_by || data.authorizedBy || '').trim();
    const authorizationRef = String(data.authorization_ref || data.authorization_id || data.authorization || '').trim();
    if (!reason) throw new Error('Inventory adjustment reason is required');
    if (!authorizedBy || !authorizationRef) throw new Error('Inventory adjustment authorization is required');

    const company = getCompanyData(db, companyId);
    const location = db.prepare('SELECT location_id, warehouse_id, company_id FROM locations WHERE location_id = ?').get(data.location_id);
    if (!location || location.company_id !== companyId) throw new Error('Inventory adjustment location is not in the posting company');
    const productData = getProductData(db, data.product_id);
    if (!productData) throw new Error(`Product master data for ${data.product_id} not found`);
    if (productData.company_id && productData.company_id !== companyId) throw new Error('Product belongs to a different company');

    const countedQty = Number(data.counted_qty);
    const countedRate = Number(data.counted_rate);
    const postingDate = String(data.posting_date || new Date().toISOString().split('T')[0]);
    if (!Number.isFinite(countedQty) || countedQty < 0.0) throw new Error('Counted quantity must be non-negative');
    if (!Number.isFinite(countedRate) || countedRate < 0.0) throw new Error('Counted rate must be non-negative');
    const currency = String(data.currency || company.currency || 'IQD').trim();
    if (currency !== String(company.currency || 'IQD')) throw new Error('Stock currency must match the company currency');
    const dims = parseDimensions(data.dims);

    const existing = db.prepare('SELECT * FROM stock_inventory_adjustment WHERE company_id = ? AND authorization_ref = ?').get(companyId, authorizationRef);
    if (existing) {
      return { success: true, idempotent: true, adjustmentId: existing.id, diff: null, moveId: existing.stock_move_id, state: existing.state };
    }

    checkLockDate(db, companyId, 'stock', postingDate);
    const period = db.prepare('SELECT status FROM fiscal_periods WHERE company_id = ? AND ? >= start_date AND ? <= end_date').get(companyId, postingDate, postingDate);
    if (!period || period.status !== 'open') throw new Error('cannot post into a closed or locked period');

    const bin = db.prepare('SELECT qty, value FROM bin WHERE company_id = ? AND location_id = ? AND product_id = ?').get(companyId, location.location_id, data.product_id) || { qty: 0.0, value: 0.0 };
    const diffQty = countedQty - Number(bin.qty || 0.0);
    const adjustmentId = data.id || generateId();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO stock_inventory_adjustment
        (id, company_id, warehouse_id, location_id, product_id, counted_qty, counted_rate, reason, authorized_by, authorization_ref, posting_date, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(adjustmentId, companyId, location.warehouse_id, location.location_id, data.product_id, countedQty, countedRate, reason, authorizedBy, authorizationRef, postingDate, now, now);

    if (Math.abs(diffQty) < 0.0000001) {
      db.prepare("UPDATE stock_inventory_adjustment SET state = 'posted', updated_at = ? WHERE id = ?").run(now, adjustmentId);
      return { success: true, adjustmentId, diff: 0.0, moveId: null };
    }

    let lossLoc = db.prepare("SELECT location_id, warehouse_id FROM locations WHERE company_id = ? AND type = 'inventory_loss' AND warehouse_id = ? LIMIT 1").get(companyId, location.warehouse_id);
    if (!lossLoc) {
      const lossLocId = `loc_inventory_loss_${location.warehouse_id}`;
      db.prepare(`
        INSERT OR IGNORE INTO locations (location_id, warehouse_id, company_id, name, type)
        VALUES (?, ?, ?, 'Inventory Loss', 'inventory_loss')
      `).run(lossLocId, location.warehouse_id, companyId);
      lossLoc = { location_id: lossLocId, warehouse_id: location.warehouse_id };
    }

    const moveId = generateId();
    const moveData = {
      id: moveId,
      product_id: data.product_id,
      qty: Math.abs(diffQty),
      from_location_id: diffQty > 0.0 ? lossLoc.location_id : location.location_id,
      to_location_id: diffQty > 0.0 ? location.location_id : lossLoc.location_id,
      warehouse_id: location.warehouse_id,
      currency,
      dims,
      posting_date: postingDate,
      voucher_ref: `INV-ADJ-${adjustmentId}`,
      batch_number: data.batch_number || null,
      serial_number: data.serial_number || null,
    };
    createStockMove(db, companyId, moveData);
    const postRes = _postStockMove(db, companyId, moveId, userId, {
      rate: countedRate,
      forced_rate: countedRate,
      batch_number: data.batch_number,
      serial_number: data.serial_number,
      negative_stock_policy: 'allow',
    });
    db.prepare("UPDATE stock_inventory_adjustment SET state = 'posted', stock_move_id = ?, updated_at = ? WHERE id = ?").run(moveId, now, adjustmentId);
    return { success: true, adjustmentId, diff: diffQty, moveId, fiscalDocId: postRes.fiscalDocId };
  });
}

/**
 * Get stock valuation report
 */
function getValuationReport(db, companyId, locationId, productId, asOfDate) {
  const dateLimit = asOfDate || new Date().toISOString().split('T')[0];

  let query = `
    SELECT product_id, location_id, SUM(qty) as qty, SUM(value) as value
    FROM stock_ledger_line
    WHERE company_id = ? AND posting_date <= ?
  `;
  const params = [companyId, dateLimit];

  if (locationId) {
    query += ' AND location_id = ?';
    params.push(locationId);
  }
  if (productId) {
    query += ' AND product_id = ?';
    params.push(productId);
  }

  query += ' GROUP BY product_id, location_id';

  const rows = db.prepare(query).all(...params);
  
  return rows.map(r => {
    const qty = Number(r.qty);
    const value = Number(r.value);
    const rate = qty > 0.0 ? value / qty : 0.0;
    return {
      product_id: r.product_id,
      location_id: r.location_id,
      qty,
      value,
      valuation_rate: rate
    };
  });
}

module.exports = {
  createStockMove,
  postStockMove,
  cancelStockMove,
  rebuildBins,
  postInventoryAdjustment,
  getValuationReport
};
