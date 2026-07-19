// R6.3 focused acceptance: disposable DB only. Proves loyalty programs, membership cards,
// points ledger, automatic tier upgrades, gift card logic, eWallets, scopes, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import loy from '../vnext/server/modules/loyalty/loyalty-engine.js';
import { mountLoyaltyRoutes } from '../vnext/server/modules/loyalty/loyalty-routes.js';
import arap from '../vnext/server/finance/arap-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r6-loyalty-'));
const dbPath = path.join(temp, 'r6-loyalty.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;

function check(name, fn) {
  try {
    fn();
    results.push(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}: ${error.message}`);
    console.error(error);
  }
}

const company = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-r6-other', 'Other R6 Company');

// Setup standard accounts for secondary company to prevent scope errors if tested
const nowIso = new Date().toISOString();
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_103000_other', 'company-r6-other', '103000', 'Receivables', 'receivable', null, nowIso);
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_201000_other', 'company-r6-other', '201000', 'Payables', 'payable', null, nowIso);
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_401000_other', 'company-r6-other', '401000', 'Sales', 'income', null, nowIso);
db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run('coa_501000_other', 'company-r6-other', '501000', 'COGS', 'expense', null, nowIso);

// Create partners
const partner1 = arap.createPartner(db, company, { id: 'partner-1', name: 'Partner 1', partner_type: 'customer' }, 'system');
const partnerOther = arap.createPartner(db, 'company-r6-other', { id: 'partner-other', name: 'Other Customer', partner_type: 'customer', receivable_account_id: 'coa_103000_other', payable_account_id: 'coa_201000_other' }, 'system');

// 1. Create loyalty programs
const progPoints = loy.createProgram(db, company, { id: 'prog-pts', name: 'Points Program', program_type: 'points', points_ratio_earn: 0.1, points_ratio_redeem: 1.0, expiry_months: 12 }, 'system');
const progTiers = loy.createProgram(db, company, { id: 'prog-tiers', name: 'Tiers Program', program_type: 'tiers' }, 'system');
const progOther = loy.createProgram(db, 'company-r6-other', { id: 'prog-other', name: 'Other Program', program_type: 'points' }, 'system');

check('programs are created and retrieved under company scope', () => {
  assert.equal(progPoints.name, 'Points Program');
  assert.equal(progPoints.points_ratio_earn, 0.1);
  assert.equal(progPoints.expiry_months, 12);
  
  const list = loy.listPrograms(db, company);
  assert.equal(list.length, 2);
  
  const retrieved = loy.getProgram(db, company, 'prog-pts');
  assert.equal(retrieved.name, 'Points Program');
  
  // Validation checks
  assert.throws(() => loy.createProgram(db, company, { name: '', program_type: 'points' }), /loyalty program name is required/);
  assert.throws(() => loy.createProgram(db, company, { name: 'Invalid', program_type: 'invalid_type' }), /invalid loyalty program type/);
  assert.throws(() => loy.createProgram(db, company, { name: 'Invalid', program_type: 'points', points_ratio_earn: -1 }), /points ratios must be non-negative/);
});

// 2. Create cards
const card1 = loy.createCard(db, company, { id: 'card-1', partner_id: partner1.id, program_id: progPoints.id, card_number: 'CARD-1001' }, 'system');

check('loyalty card is created and retrieved under company scope', () => {
  assert.equal(card1.card_number, 'CARD-1001');
  assert.equal(card1.tier, 'standard');
  assert.equal(card1.partner_id, 'partner-1');
  
  const retrieved = loy.getCard(db, company, 'CARD-1001');
  assert.equal(retrieved.id, 'card-1');
  
  const retrievedById = loy.getCard(db, company, 'card-1');
  assert.equal(retrievedById.card_number, 'CARD-1001');
  
  // Scopes and constraints
  assert.throws(() => loy.createCard(db, company, { partner_id: partnerOther.id, program_id: progPoints.id }), /partner not found or outside company scope/);
  assert.throws(() => loy.createCard(db, company, { partner_id: partner1.id, program_id: progOther.id }), /active loyalty program not found/);
  assert.throws(() => loy.createCard(db, company, { partner_id: partner1.id, program_id: progPoints.id, card_number: 'CARD-1001' }), /loyalty card number already exists/);
});

// 3. Points ledger: earning and balance lookup
check('loyalty points earning and balance calculations work', () => {
  loy.addPoints(db, company, 'card-1', 150, 'SO-001', null, 'system');
  loy.addPoints(db, company, 'card-1', 350.5, 'SO-002', null, 'system');
  
  // Balance lookup
  const balance = loy.getRedeemablePointsBalance(db, company, 'card-1', '2026-07-19');
  assert.equal(balance, 500.5);
});

// 4. Points redemption
check('loyalty points redemption enforces balance checks', () => {
  // Redeem valid points
  loy.redeemPoints(db, company, 'card-1', 200.5, 'SO-003', '2026-07-19', 'system');
  
  // Verify new balance
  const balance = loy.getRedeemablePointsBalance(db, company, 'card-1', '2026-07-19');
  assert.equal(balance, 300);
  
  // Check insufficient points error
  assert.throws(() => loy.redeemPoints(db, company, 'card-1', 400, 'SO-004', '2026-07-19', 'system'), /insufficient loyalty points balance/);
});

// 5. Automatic tier upgrades and discount lookups
check('loyalty membership tier automatic upgrades work based on points velocity', () => {
  // Let's create a new card for tier testing
  const cardTiers = loy.createCard(db, company, { id: 'card-tiers', partner_id: partner1.id, program_id: progTiers.id, card_number: 'CARD-TIERS' }, 'system');
  assert.equal(cardTiers.tier, 'standard');
  
  // 1. Earn 800 points (Silver requires 1000)
  loy.addPoints(db, company, 'card-tiers', 800, 'SO-T1', null, 'system');
  let updatedCard = loy.evaluateAndUpgradeTier(db, company, 'card-tiers', '2026-07-19');
  assert.equal(updatedCard.tier, 'standard');
  assert.equal(loy.getTierDiscountPercent(updatedCard.tier), 0);
  
  // 2. Earn another 500 points -> Silver (total 1300)
  loy.addPoints(db, company, 'card-tiers', 500, 'SO-T2', null, 'system');
  updatedCard = loy.evaluateAndUpgradeTier(db, company, 'card-tiers', '2026-07-19');
  assert.equal(updatedCard.tier, 'silver');
  assert.equal(loy.getTierDiscountPercent(updatedCard.tier), 5);
  
  // 3. Earn another 4000 points -> Gold (total 5300)
  loy.addPoints(db, company, 'card-tiers', 4000, 'SO-T3', null, 'system');
  updatedCard = loy.evaluateAndUpgradeTier(db, company, 'card-tiers', '2026-07-19');
  assert.equal(updatedCard.tier, 'gold');
  assert.equal(loy.getTierDiscountPercent(updatedCard.tier), 10);
});

// 6. Gift Cards
check('gift cards support issue, load, redemption, and balance/expiry constraints', () => {
  // Issue gift card
  const gc = loy.issueGiftCard(db, company, { id: 'gc-1', card_code: 'GIFT-9999', initial_amount: 100000, expiry_date: '2026-12-31' }, 'system');
  assert.equal(gc.card_code, 'GIFT-9999');
  assert.equal(gc.initial_amount, 100000);
  assert.equal(gc.current_amount, 100000);
  assert.equal(gc.state, 'active');
  
  // Duplicate code check
  assert.throws(() => loy.issueGiftCard(db, company, { card_code: 'GIFT-9999', initial_amount: 5000 }, 'system'), /gift card code already exists/);
  
  // Redeem gift card
  let updatedGc = loy.redeemGiftCard(db, company, 'gc-1', 40000, 'SO-PAY-1', '2026-07-19', 'system');
  assert.equal(updatedGc.current_amount, 60000);
  assert.equal(updatedGc.state, 'active');
  
  // Load gift card
  updatedGc = loy.loadGiftCard(db, company, 'gc-1', 20000, 'SO-LOAD-1', 'system');
  assert.equal(updatedGc.current_amount, 80000);
  
  // Expiry check
  assert.throws(() => loy.redeemGiftCard(db, company, 'gc-1', 10000, 'SO-PAY-EXPIRED', '2027-01-01', 'system'), /gift card has expired/);
  
  // Exhausted check
  updatedGc = loy.redeemGiftCard(db, company, 'gc-1', 80000, 'SO-PAY-2', '2026-07-19', 'system');
  assert.equal(updatedGc.current_amount, 0);
  assert.equal(updatedGc.state, 'exhausted');
  
  assert.throws(() => loy.redeemGiftCard(db, company, 'gc-1', 10000, 'SO-PAY-EXHAUSTED', '2026-07-19', 'system'), /gift card is exhausted/);
});

// 7. eWallet
check('eWallet deposits, expenditures, and balance bounds work', () => {
  // Initial balance is 0
  let balance = loy.getEWalletBalance(db, company, 'partner-1');
  assert.equal(balance, 0);
  
  // Deposit 150,000 IQD
  let res = loy.adjustEWallet(db, company, 'partner-1', 150000, 'DEP-001', 'system');
  assert.equal(res.balance, 150000);
  
  // Expenditure of 50,000 IQD
  res = loy.adjustEWallet(db, company, 'partner-1', -50000, 'EXP-001', 'system');
  assert.equal(res.balance, 100000);
  
  // Balance lookup
  balance = loy.getEWalletBalance(db, company, 'partner-1');
  assert.equal(balance, 100000);
  
  // Expenditure exceeding balance should fail
  assert.throws(() => loy.adjustEWallet(db, company, 'partner-1', -150000, 'EXP-002', 'system'), /insufficient eWallet balance/);
});

// 8. Route and permission checks
check('loyalty routes enforce scope and permissions correctly', async () => {
  const routes = mountLoyaltyRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-2', groups: ['sales.operator'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: (user, perm) => {
      // Operator has loyalty:view but not loyalty:manage
      return perm === 'loyalty:view';
    }
  });
  
  async function testRoute(method, pathname, bodyData = null) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    const processed = routes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET lists programs (requires view, allowed)
  const r1 = await testRoute('GET', '/api/x/loyalty/programs');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  
  // POST creates program (requires manage, denied 403)
  const r2 = await testRoute('POST', '/api/x/loyalty/programs', { name: 'Promo New', program_type: 'gift_card' });
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 403);
});

// 9. Migration down rollback test
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
try { db.prepare('DELETE FROM gl_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM dunning_action').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_invoice').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_change').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_plan').run(); } catch (_) {}
try { db.prepare('DELETE FROM payment_allocation').run(); } catch (_) {}
try { db.prepare('DELETE FROM payment').run(); } catch (_) {}
try { db.prepare('DELETE FROM fiscal_doc_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM arap_document').run(); } catch (_) {}
try { db.prepare('DELETE FROM fiscal_doc').run(); } catch (_) {}
try { db.prepare('DELETE FROM partner_master').run(); } catch (_) {}
try { db.prepare('DELETE FROM product_master').run(); } catch (_) {}
try { db.prepare('DELETE FROM account').run(); } catch (_) {}
try { db.prepare('DELETE FROM companies').run(); } catch (_) {}
try { db.prepare('DELETE FROM r3_worklist_item').run(); } catch (_) {}
try { db.prepare('DELETE FROM loyalty_points_ledger').run(); } catch (_) {}
try { db.prepare('DELETE FROM loyalty_card').run(); } catch (_) {}
try { db.prepare('DELETE FROM loyalty_program').run(); } catch (_) {}
try { db.prepare('DELETE FROM gift_card_transaction').run(); } catch (_) {}
try { db.prepare('DELETE FROM gift_card').run(); } catch (_) {}
try { db.prepare('DELETE FROM ewallet_transaction').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 633 down restores the loyalty schema boundary', () => {
  assert.ok(down.migrations.includes('633_r6_loyalty'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='loyalty_card'").get(), undefined);
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gift_card'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR6 LOYALTY SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
