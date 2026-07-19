// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany } = infra;

const SECRET = 'octagon-licensing-secret-2026';

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function computeSignature(companyId, edition, modulesStr, seats, expiryDate) {
  const data = [companyId, edition, modulesStr, seats, expiryDate].join('|');
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

function installLicense(db, companyId, licenseData) {
  ensureCompany(db, companyId);
  const { edition, modules, seats, expiry_date, signature } = licenseData;
  
  if (!edition) throw fail('edition is required', 400, 'EDITION_REQUIRED');
  if (!Array.isArray(modules)) throw fail('modules array is required', 400, 'MODULES_REQUIRED');
  if (!seats || seats <= 0) throw fail('seats must be positive', 400, 'SEATS_INVALID');
  if (!expiry_date) throw fail('expiry date is required', 400, 'EXPIRY_REQUIRED');
  if (!signature) throw fail('cryptographic signature is required', 400, 'SIGNATURE_REQUIRED');
  
  const modulesStr = JSON.stringify(modules);
  const expectedSig = computeSignature(companyId, edition, modulesStr, seats, expiry_date);
  
  if (signature !== expectedSig) {
    throw fail('tamper-proof license signature check failed', 403, 'SIGNATURE_INVALID');
  }
  
  const licenseKey = JSON.stringify(licenseData);
  const existing = db.prepare('SELECT id FROM shop_license WHERE company_id = ?').get(companyId);
  
  if (existing) {
    db.prepare(`
      UPDATE shop_license
      SET license_key = ?, edition = ?, modules = ?, seats = ?, expiry_date = ?, signature = ?
      WHERE company_id = ?
    `).run(licenseKey, edition, modulesStr, seats, expiry_date, signature, companyId);
  } else {
    db.prepare(`
      INSERT INTO shop_license (id, company_id, license_key, edition, modules, seats, expiry_date, signature, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id('lic'), companyId, licenseKey, edition, modulesStr, seats, expiry_date, signature, now());
  }
  
  return { success: true, edition, modules, seats, expiry_date };
}

function getLicense(db, companyId) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM shop_license WHERE company_id = ?').get(companyId);
  if (!row) {
    // Default base unlicensed state
    return {
      edition: 'standard',
      modules: ['sales', 'procurement', 'inventory'],
      seats: 5,
      expiry_date: '2099-12-31T00:00:00Z',
      unlicensed: true
    };
  }
  return {
    edition: row.edition,
    modules: JSON.parse(row.modules),
    seats: row.seats,
    expiry_date: row.expiry_date,
    unlicensed: false
  };
}

function isFeatureLicensed(db, companyId, moduleName) {
  const lic = getLicense(db, companyId);
  
  // Check expiry
  const expiry = new Date(lic.expiry_date);
  const nowTime = new Date();
  if (nowTime > expiry) {
    // 14-day grace read-only period check
    const graceTime = new Date(expiry);
    graceTime.setDate(graceTime.getDate() + 14);
    if (nowTime > graceTime) {
      throw fail('license expired and past grace period. system locked.', 402, 'LICENSE_EXPIRED_LOCK');
    }
    // Flag grace period read-only
    return { licensed: lic.modules.includes(moduleName), grace_readonly: true };
  }
  
  return { licensed: lic.modules.includes(moduleName), grace_readonly: false };
}

function checkSeatUsage(db, companyId) {
  ensureCompany(db, companyId);
  const lic = getLicense(db, companyId);
  
  // count active sessions or total users as proxy for seat limits
  const userCount = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get()
    ? (db.prepare('SELECT COUNT(*) as cnt FROM users').get()?.cnt || 0)
    : 1; // fallback
    
  const sessionCount = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_sessions'").get()
    ? (db.prepare('SELECT COUNT(*) as cnt FROM auth_sessions').get()?.cnt || 0)
    : 0;
    
  const maxSeats = lic.seats;
  const exceeded = sessionCount > maxSeats;
  
  return {
    user_count: userCount,
    session_count: sessionCount,
    max_seats: maxSeats,
    exceeded
  };
}

function provisionTrialTenant(db, tenantId, tenantName, edition = 'standard') {
  const existing = db.prepare('SELECT 1 FROM shop_tenant WHERE id = ?').get(tenantId);
  if (existing) throw fail('tenant ID already exists', 409, 'TENANT_EXISTS');
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    db.prepare(`
      INSERT INTO shop_tenant (id, name, edition, active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(tenantId, tenantName, edition, now());
    
    // Seed sample company for this tenant
    const companyId = `comp-${tenantId}`;
    db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(companyId, `${tenantName} LLC`);
    
    // Seed warehouses & locations
    const whId = `wh-${tenantId}`;
    db.prepare('INSERT OR IGNORE INTO warehouses (warehouse_id, company_id, name) VALUES (?, ?, ?)').run(whId, companyId, 'Main Trial Warehouse');
    db.prepare('INSERT OR IGNORE INTO locations (location_id, warehouse_id, company_id, name, type) VALUES (?, ?, ?, ?, ?)').run(`loc-${tenantId}`, whId, companyId, 'Trial Stock', 'internal');
    
    if (owns) db.exec('COMMIT');
    return { tenant_id: tenantId, company_id: companyId };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

module.exports = {
  computeSignature,
  installLicense: infra.atomicCommand(installLicense),
  getLicense,
  isFeatureLicensed,
  checkSeatUsage,
  provisionTrialTenant: infra.atomicCommand(provisionTrialTenant)
};
