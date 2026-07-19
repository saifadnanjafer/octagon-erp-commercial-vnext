// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany } = infra;

const VAULT_KEY = crypto.scryptSync('octagon-vault-password-2026', 'salt', 32); // 256-bit key

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateApiKey(db, companyId, name, scopes, expiryDate = null) {
  ensureCompany(db, companyId);
  if (!name) throw fail('API key name is required', 400, 'NAME_REQUIRED');
  
  const token = `oct_key_${crypto.randomBytes(24).toString('hex')}`;
  const secretHash = hashKey(token);
  
  const row = {
    id: id('apk'),
    company_id: companyId,
    key_name: String(name).trim(),
    secret_hash: secretHash,
    scopes: JSON.stringify(Array.isArray(scopes) ? scopes : ['read']),
    active: 1,
    created_at: now(),
    expires_at: expiryDate ? String(expiryDate).trim() : null
  };
  
  db.prepare(`
    INSERT INTO shop_api_key (id, company_id, key_name, secret_hash, scopes, active, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.key_name, row.secret_hash, row.scopes, row.active, row.created_at, row.expires_at);
  
  return { ...row, raw_key: token };
}

function verifyApiKey(db, rawKey) {
  if (!rawKey) return { valid: false };
  const h = hashKey(rawKey);
  
  const row = db.prepare('SELECT * FROM shop_api_key WHERE secret_hash = ? AND active = 1').get(h);
  if (!row) return { valid: false };
  
  if (row.expires_at) {
    if (new Date() > new Date(row.expires_at)) {
      return { valid: false, reason: 'expired' };
    }
  }
  
  return {
    valid: true,
    company_id: row.company_id,
    scopes: JSON.parse(row.scopes)
  };
}

function registerWebhook(db, companyId, input) {
  ensureCompany(db, companyId);
  const targetUrl = String(input.target_url || '').trim();
  const event = String(input.event_type || '').trim();
  
  if (!targetUrl) throw fail('target URL is required', 400, 'URL_REQUIRED');
  if (!event) throw fail('event type is required', 400, 'EVENT_REQUIRED');
  
  const row = {
    id: id('wh'),
    company_id: companyId,
    event_type: event,
    target_url: targetUrl,
    secret_token: input.secret_token ? String(input.secret_token).trim() : null,
    active: 1,
    created_at: now()
  };
  
  db.prepare(`
    INSERT INTO shop_webhook_subscription (id, company_id, event_type, target_url, secret_token, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.event_type, row.target_url, row.secret_token, row.active, row.created_at);
  
  return row;
}

function saveCredential(db, companyId, keyName, rawSecret) {
  ensureCompany(db, companyId);
  if (!keyName) throw fail('credential name is required', 400, 'KEY_NAME_REQUIRED');
  if (!rawSecret) throw fail('secret text is required', 400, 'SECRET_REQUIRED');
  
  // Encrypt rawSecret with AES-256-CBC
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', VAULT_KEY, iv);
  let encrypted = cipher.update(rawSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const existing = db.prepare('SELECT id FROM shop_credential_vault WHERE company_id = ? AND key_name = ?').get(companyId, keyName);
  
  if (existing) {
    db.prepare(`
      UPDATE shop_credential_vault
      SET encrypted_secret = ?, iv = ?
      WHERE id = ?
    `).run(encrypted, iv.toString('hex'), existing.id);
    return { success: true, updated: true };
  } else {
    db.prepare(`
      INSERT INTO shop_credential_vault (id, company_id, key_name, encrypted_secret, iv, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id('vault'), companyId, keyName, encrypted, iv.toString('hex'), now());
    return { success: true, updated: false };
  }
}

function getCredential(db, companyId, keyName) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM shop_credential_vault WHERE company_id = ? AND key_name = ?').get(companyId, keyName);
  if (!row) throw fail('credential not found', 404, 'CREDENTIAL_NOT_FOUND');
  
  // Decrypt
  const iv = Buffer.from(row.iv, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', VAULT_KEY, iv);
  let decrypted = decipher.update(row.encrypted_secret, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

module.exports = {
  generateApiKey: infra.atomicCommand(generateApiKey),
  verifyApiKey,
  registerWebhook: infra.atomicCommand(registerWebhook),
  saveCredential: infra.atomicCommand(saveCredential),
  getCredential
};
