// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function asDate(value) { return String(value || now()).slice(0, 10); }

function createProgram(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const row = {
    id: String(input.id || id('loy_prog')),
    company_id: companyId,
    name: String(input.name || '').trim(),
    program_type: String(input.program_type || 'points').trim(),
    points_ratio_earn: Number(input.points_ratio_earn || 0),
    points_ratio_redeem: Number(input.points_ratio_redeem || 0),
    expiry_months: Number(input.expiry_months || 0),
    active: input.active == null ? 1 : Number(Boolean(input.active)),
    created_at: now(),
    created_by: userId || null
  };
  
  if (!row.name) throw fail('loyalty program name is required', 400, 'LOYALTY_PROGRAM_NAME_REQUIRED');
  if (!['points', 'tiers', 'gift_card', 'ewallet'].includes(row.program_type)) {
    throw fail('invalid loyalty program type', 400, 'LOYALTY_PROGRAM_TYPE_INVALID');
  }
  if (row.points_ratio_earn < 0 || row.points_ratio_redeem < 0) {
    throw fail('points ratios must be non-negative', 400, 'LOYALTY_RATIO_INVALID');
  }
  
  db.prepare(`
    INSERT INTO loyalty_program (id, company_id, name, program_type, points_ratio_earn, points_ratio_redeem, expiry_months, active, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.name, row.program_type, row.points_ratio_earn, row.points_ratio_redeem, row.expiry_months, row.active, row.created_at, row.created_by);
  
  return row;
}

function getProgram(db, companyId, id) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM loyalty_program WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!row) throw fail('loyalty program not found', 404, 'LOYALTY_PROGRAM_NOT_FOUND');
  return row;
}

function listPrograms(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM loyalty_program WHERE company_id = ?').all(companyId);
}

function createCard(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const partnerId = String(input.partner_id || '').trim();
  const programId = String(input.program_id || '').trim();
  
  const partner = db.prepare('SELECT 1 FROM partner_master WHERE id = ? AND company_id = ?').get(partnerId, companyId);
  if (!partner) throw fail('partner not found or outside company scope', 403, 'PARTNER_SCOPE_DENIED');
  
  const program = db.prepare('SELECT * FROM loyalty_program WHERE id = ? AND company_id = ? AND active = 1').get(programId, companyId);
  if (!program) throw fail('active loyalty program not found', 404, 'LOYALTY_PROGRAM_NOT_FOUND');
  
  const cardNumber = String(input.card_number || `LOY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`);
  
  const existing = db.prepare('SELECT 1 FROM loyalty_card WHERE card_number = ? AND company_id = ?').get(cardNumber, companyId);
  if (existing) throw fail('loyalty card number already exists in company scope', 409, 'LOYALTY_CARD_EXISTS');
  
  const row = {
    id: String(input.id || id('loy_card')),
    company_id: companyId,
    partner_id: partnerId,
    program_id: programId,
    card_number: cardNumber,
    tier: String(input.tier || 'standard').trim(),
    active: 1,
    created_at: now(),
    created_by: userId || null
  };
  
  db.prepare(`
    INSERT INTO loyalty_card (id, company_id, partner_id, program_id, card_number, tier, active, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.partner_id, row.program_id, row.card_number, row.tier, row.active, row.created_at, row.created_by);
  
  recordWrite(db, null, companyId, 'loyalty_card', row.id, 'create', userId, null, row);
  return row;
}

function getCard(db, companyId, idOrNumber) {
  ensureCompany(db, companyId);
  const row = db.prepare(`
    SELECT * FROM loyalty_card 
    WHERE (id = ? OR card_number = ?) AND company_id = ?
  `).get(idOrNumber, idOrNumber, companyId);
  if (!row) throw fail('loyalty card not found', 404, 'LOYALTY_CARD_NOT_FOUND');
  return row;
}

function listCards(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM loyalty_card WHERE company_id = ?').all(companyId);
}

function getRedeemablePointsBalance(db, companyId, cardId, asOfDate) {
  ensureCompany(db, companyId);
  const dateStr = asDate(asOfDate);
  const rows = db.prepare(`
    SELECT points FROM loyalty_points_ledger 
    WHERE card_id = ? AND company_id = ? AND (expiry_date IS NULL OR expiry_date >= ?)
  `).all(cardId, companyId, dateStr);
  
  let balance = 0;
  for (const r of rows) balance += r.points;
  return money(balance);
}

function addPoints(db, companyId, cardId, points, referenceDoc, expiryDate, userId) {
  ensureCompany(db, companyId);
  const card = db.prepare('SELECT * FROM loyalty_card WHERE id = ? AND company_id = ?').get(cardId, companyId);
  if (!card) throw fail('loyalty card not found', 404, 'LOYALTY_CARD_NOT_FOUND');
  
  const program = db.prepare('SELECT * FROM loyalty_program WHERE id = ?').get(card.program_id);
  
  let finalExpiry = expiryDate ? asDate(expiryDate) : null;
  if (!finalExpiry && program.expiry_months > 0) {
    const d = new Date(now().slice(0, 10) + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + program.expiry_months);
    finalExpiry = d.toISOString().slice(0, 10);
  }
  
  const row = {
    id: id('loy_ledger'),
    company_id: companyId,
    card_id: cardId,
    points: money(points),
    reference_doc: referenceDoc || null,
    expiry_date: finalExpiry,
    created_at: now(),
    created_by: userId || null
  };
  
  db.prepare(`
    INSERT INTO loyalty_points_ledger (id, company_id, card_id, points, reference_doc, expiry_date, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.card_id, row.points, row.reference_doc, row.expiry_date, row.created_at, row.created_by);
  
  return row;
}

function redeemPoints(db, companyId, cardId, pointsToRedeem, referenceDoc, asOfDate, userId) {
  ensureCompany(db, companyId);
  const dateStr = asDate(asOfDate);
  const requested = money(pointsToRedeem);
  if (requested <= 0) throw fail('points to redeem must be positive', 400, 'LOYALTY_POINTS_INVALID');
  
  const balance = getRedeemablePointsBalance(db, companyId, cardId, dateStr);
  if (balance < requested) {
    throw fail(`insufficient loyalty points balance. Available: ${balance}, Requested: ${requested}`, 400, 'INSUFFICIENT_POINTS');
  }
  
  // Append a negative entry representing the redemption
  const row = {
    id: id('loy_ledger'),
    company_id: companyId,
    card_id: cardId,
    points: -requested,
    reference_doc: referenceDoc || null,
    expiry_date: null,
    created_at: now(),
    created_by: userId || null
  };
  
  db.prepare(`
    INSERT INTO loyalty_points_ledger (id, company_id, card_id, points, reference_doc, expiry_date, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.card_id, row.points, row.reference_doc, row.expiry_date, row.created_at, row.created_by);
  
  return row;
}

function evaluateAndUpgradeTier(db, companyId, cardId, asOfDate) {
  ensureCompany(db, companyId);
  const card = db.prepare('SELECT * FROM loyalty_card WHERE id = ? AND company_id = ?').get(cardId, companyId);
  if (!card) throw fail('loyalty card not found', 404, 'LOYALTY_CARD_NOT_FOUND');
  
  const dateStr = asDate(asOfDate);
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  const cutoffDate = d.toISOString().slice(0, 10);
  
  // Sum positive points earned in the last 12 months
  const row = db.prepare(`
    SELECT COALESCE(SUM(points), 0) as total 
    FROM loyalty_points_ledger 
    WHERE card_id = ? AND company_id = ? AND points > 0 AND created_at >= ?
  `).get(cardId, companyId, cutoffDate + 'T00:00:00Z');
  
  const points = row.total;
  let newTier = 'standard';
  if (points >= 5000) {
    newTier = 'gold';
  } else if (points >= 1000) {
    newTier = 'silver';
  }
  
  if (card.tier !== newTier) {
    const before = { ...card };
    db.prepare('UPDATE loyalty_card SET tier = ? WHERE id = ?').run(newTier, cardId);
    const after = db.prepare('SELECT * FROM loyalty_card WHERE id = ?').get(cardId);
    recordWrite(db, null, companyId, 'loyalty_card', cardId, 'upgrade_tier', null, before, after);
    return after;
  }
  return card;
}

function getTierDiscountPercent(tier) {
  const t = String(tier).toLowerCase();
  if (t === 'gold') return 10;
  if (t === 'silver') return 5;
  return 0;
}

function issueGiftCard(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const cardCode = String(input.card_code || crypto.randomBytes(6).toString('hex').toUpperCase());
  const initial = money(input.initial_amount || 0);
  
  const existing = db.prepare('SELECT 1 FROM gift_card WHERE card_code = ? AND company_id = ?').get(cardCode, companyId);
  if (existing) throw fail('gift card code already exists', 409, 'GIFT_CARD_EXISTS');
  
  const row = {
    id: String(input.id || id('gift_card')),
    company_id: companyId,
    card_code: cardCode,
    initial_amount: initial,
    current_amount: initial,
    expiry_date: input.expiry_date ? asDate(input.expiry_date) : null,
    state: initial > 0 ? 'active' : 'exhausted',
    created_at: now(),
    created_by: userId || null
  };
  
  db.prepare(`
    INSERT INTO gift_card (id, company_id, card_code, initial_amount, current_amount, expiry_date, state, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.card_code, row.initial_amount, row.current_amount, row.expiry_date, row.state, row.created_at, row.created_by);
  
  if (initial > 0) {
    db.prepare(`
      INSERT INTO gift_card_transaction (id, company_id, gift_card_id, amount, reference_doc, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id('gift_tx'), companyId, row.id, initial, 'initial_issue', now(), userId || 'system');
  }
  
  recordWrite(db, null, companyId, 'gift_card', row.id, 'create', userId, null, row);
  return row;
}

function getGiftCard(db, companyId, idOrCode) {
  ensureCompany(db, companyId);
  const row = db.prepare(`
    SELECT * FROM gift_card 
    WHERE (id = ? OR card_code = ?) AND company_id = ?
  `).get(idOrCode, idOrCode, companyId);
  if (!row) throw fail('gift card not found', 404, 'GIFT_CARD_NOT_FOUND');
  return row;
}

function listGiftCards(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM gift_card WHERE company_id = ?').all(companyId);
}

function redeemGiftCard(db, companyId, giftCardId, amountToRedeem, referenceDoc, asOfDate, userId) {
  ensureCompany(db, companyId);
  const dateStr = asDate(asOfDate);
  const amount = money(amountToRedeem);
  if (amount <= 0) throw fail('redemption amount must be positive', 400, 'GIFT_CARD_AMOUNT_INVALID');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const card = db.prepare('SELECT * FROM gift_card WHERE id = ? AND company_id = ?').get(giftCardId, companyId);
    if (!card) throw fail('gift card not found', 404, 'GIFT_CARD_NOT_FOUND');
    
    if (card.state === 'expired' || (card.expiry_date && card.expiry_date < dateStr)) {
      throw fail('gift card has expired', 400, 'GIFT_CARD_EXPIRED');
    }
    if (card.state === 'exhausted' || card.current_amount <= 0) {
      throw fail('gift card is exhausted', 400, 'GIFT_CARD_EXHAUSTED');
    }
    if (card.current_amount < amount) {
      throw fail(`insufficient gift card balance. Available: ${card.current_amount}, Requested: ${amount}`, 400, 'INSUFFICIENT_GIFT_CARD_BALANCE');
    }
    
    const nextAmount = money(card.current_amount - amount);
    const nextState = nextAmount === 0 ? 'exhausted' : 'active';
    const before = { ...card };
    
    db.prepare('UPDATE gift_card SET current_amount = ?, state = ? WHERE id = ?').run(nextAmount, nextState, giftCardId);
    db.prepare(`
      INSERT INTO gift_card_transaction (id, company_id, gift_card_id, amount, reference_doc, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id('gift_tx'), companyId, giftCardId, -amount, referenceDoc || null, now(), userId || 'system');
    
    const after = db.prepare('SELECT * FROM gift_card WHERE id = ?').get(giftCardId);
    recordWrite(db, null, companyId, 'gift_card', giftCardId, 'redeem', userId, before, after);
    
    if (owns) db.exec('COMMIT');
    return after;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function loadGiftCard(db, companyId, giftCardId, amountToLoad, referenceDoc, userId) {
  ensureCompany(db, companyId);
  const amount = money(amountToLoad);
  if (amount <= 0) throw fail('load amount must be positive', 400, 'GIFT_CARD_AMOUNT_INVALID');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const card = db.prepare('SELECT * FROM gift_card WHERE id = ? AND company_id = ?').get(giftCardId, companyId);
    if (!card) throw fail('gift card not found', 404, 'GIFT_CARD_NOT_FOUND');
    
    const nextAmount = money(card.current_amount + amount);
    const nextState = nextAmount > 0 ? 'active' : card.state;
    const before = { ...card };
    
    db.prepare('UPDATE gift_card SET current_amount = ?, state = ? WHERE id = ?').run(nextAmount, nextState, giftCardId);
    db.prepare(`
      INSERT INTO gift_card_transaction (id, company_id, gift_card_id, amount, reference_doc, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id('gift_tx'), companyId, giftCardId, amount, referenceDoc || null, now(), userId || 'system');
    
    const after = db.prepare('SELECT * FROM gift_card WHERE id = ?').get(giftCardId);
    recordWrite(db, null, companyId, 'gift_card', giftCardId, 'load', userId, before, after);
    
    if (owns) db.exec('COMMIT');
    return after;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function getEWalletBalance(db, companyId, partnerId) {
  ensureCompany(db, companyId);
  const partner = db.prepare('SELECT 1 FROM partner_master WHERE id = ? AND company_id = ?').get(partnerId, companyId);
  if (!partner) throw fail('partner not found', 404, 'PARTNER_NOT_FOUND');
  
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as balance FROM ewallet_transaction WHERE partner_id = ? AND company_id = ?').get(partnerId, companyId);
  return money(row.balance);
}

function adjustEWallet(db, companyId, partnerId, amountAdjust, referenceDoc, userId) {
  ensureCompany(db, companyId);
  const amount = money(amountAdjust);
  if (amount === 0) return { balance: getEWalletBalance(db, companyId, partnerId) };
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const partner = db.prepare('SELECT 1 FROM partner_master WHERE id = ? AND company_id = ?').get(partnerId, companyId);
    if (!partner) throw fail('partner not found', 404, 'PARTNER_NOT_FOUND');
    
    if (amount < 0) {
      const balance = getEWalletBalance(db, companyId, partnerId);
      if (balance < Math.abs(amount)) {
        throw fail(`insufficient eWallet balance. Available: ${balance}, Requested: ${Math.abs(amount)}`, 400, 'INSUFFICIENT_EWALLET_BALANCE');
      }
    }
    
    const txId = id('ewallet_tx');
    db.prepare(`
      INSERT INTO ewallet_transaction (id, company_id, partner_id, amount, reference_doc, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(txId, companyId, partnerId, amount, referenceDoc || null, now(), userId || 'system');
    
    const nextBalance = getEWalletBalance(db, companyId, partnerId);
    
    if (owns) db.exec('COMMIT');
    return { transaction_id: txId, balance: nextBalance };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

module.exports = {
  createProgram: infra.atomicCommand(createProgram),
  getProgram,
  listPrograms,
  createCard: infra.atomicCommand(createCard),
  getCard,
  listCards,
  addPoints,
  redeemPoints,
  getRedeemablePointsBalance,
  evaluateAndUpgradeTier,
  getTierDiscountPercent,
  issueGiftCard: infra.atomicCommand(issueGiftCard),
  getGiftCard,
  listGiftCards,
  redeemGiftCard,
  loadGiftCard,
  getEWalletBalance,
  adjustEWallet
};
