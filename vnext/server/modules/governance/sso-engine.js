// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function createSsoConfig(db, companyId, input) {
  ensureCompany(db, companyId);
  const type = String(input.provider_type || '').trim();
  const clientId = String(input.client_id || '').trim();
  const clientSecret = String(input.client_secret || '').trim();
  const authEp = String(input.authorization_endpoint || '').trim();
  const tokenEp = String(input.token_endpoint || '').trim();
  
  if (!['oidc', 'saml'].includes(type)) throw fail('invalid provider type', 400, 'PROVIDER_INVALID');
  if (!clientId) throw fail('client ID is required', 400, 'CLIENT_ID_REQUIRED');
  if (!authEp) throw fail('authorization endpoint is required', 400, 'AUTH_EP_REQUIRED');
  
  const existing = db.prepare('SELECT id FROM shop_sso_config WHERE company_id = ? AND provider_type = ?').get(companyId, type);
  
  if (existing) {
    db.prepare(`
      UPDATE shop_sso_config
      SET client_id = ?, client_secret = ?, authorization_endpoint = ?, token_endpoint = ?, userinfo_endpoint = ?, active = 1
      WHERE id = ?
    `).run(clientId, clientSecret, authEp, tokenEp, input.userinfo_endpoint || null, existing.id);
    return { id: existing.id, company_id: companyId, provider_type: type };
  } else {
    const row = {
      id: id('sso'),
      company_id: companyId,
      provider_type: type,
      client_id: clientId,
      client_secret: clientSecret,
      authorization_endpoint: authEp,
      token_endpoint: tokenEp,
      userinfo_endpoint: input.userinfo_endpoint || null,
      active: 1,
      created_at: now()
    };
    
    db.prepare(`
      INSERT INTO shop_sso_config (id, company_id, provider_type, client_id, client_secret, authorization_endpoint, token_endpoint, userinfo_endpoint, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.company_id, row.provider_type, row.client_id, row.client_secret, row.authorization_endpoint, row.token_endpoint, row.userinfo_endpoint, row.active, row.created_at);
    
    return row;
  }
}

function linkUserSso(db, userId, providerType, ssoUid) {
  if (!['oidc', 'saml'].includes(providerType)) throw fail('invalid provider type', 400, 'PROVIDER_INVALID');
  if (!ssoUid) throw fail('SSO UID is required', 400, 'SSO_UID_REQUIRED');
  
  const existing = db.prepare('SELECT id FROM shop_user_sso_link WHERE provider_type = ? AND sso_uid = ?').get(providerType, ssoUid);
  if (existing) throw fail('SSO identifier already linked to a user', 409, 'SSO_LINKED_EXISTS');
  
  const row = {
    id: id('link'),
    user_id: String(userId),
    provider_type: providerType,
    sso_uid: String(ssoUid),
    created_at: now()
  };
  
  db.prepare(`
    INSERT INTO shop_user_sso_link (id, user_id, provider_type, sso_uid, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.id, row.user_id, row.provider_type, row.sso_uid, row.created_at);
  
  return row;
}

function authenticateSsoUser(db, companyId, providerType, ssoUid, email, name) {
  ensureCompany(db, companyId);
  if (!ssoUid) throw fail('SSO identifier is required', 400, 'SSO_UID_REQUIRED');
  
  const link = db.prepare('SELECT user_id FROM shop_user_sso_link WHERE provider_type = ? AND sso_uid = ?').get(providerType, ssoUid);
  
  let userId = link ? link.user_id : null;
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    if (!userId) {
      // Check if user exists by email in users table
      const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get();
      if (hasUsers) {
        let user = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
        if (user) {
          userId = user.id;
        } else {
          // Provision new user
          userId = id('usr');
          db.prepare(`
            INSERT INTO users (id, name, email, role, active, created_at)
            VALUES (?, ?, ?, 'employee', 1, ?)
          `).run(userId, name || email, email, now());
        }
      } else {
        userId = id('usr');
      }
      
      // Create link
      db.prepare(`
        INSERT INTO shop_user_sso_link (id, user_id, provider_type, sso_uid, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id('link'), userId, providerType, ssoUid, now());
    }
    
    if (owns) db.exec('COMMIT');
    return {
      userId,
      email,
      name,
      groups: ['employee'],
      role: 'employee'
    };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function configureSecurityPolicy(db, companyId, input) {
  ensureCompany(db, companyId);
  const mfa = input.mfa_enforced ? 1 : 0;
  const minLength = Number(input.password_min_length || 8);
  if (minLength < 6) throw fail('password minimum length must be at least 6 characters', 400, 'LENGTH_INVALID');
  
  const existing = db.prepare('SELECT id FROM shop_org_security_policy WHERE company_id = ?').get(companyId);
  if (existing) {
    db.prepare(`
      UPDATE shop_org_security_policy
      SET mfa_enforced = ?, password_min_length = ?
      WHERE id = ?
    `).run(mfa, minLength, existing.id);
  } else {
    db.prepare(`
      INSERT INTO shop_org_security_policy (id, company_id, mfa_enforced, password_min_length, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id('pol'), companyId, mfa, minLength, now());
  }
  
  return { company_id: companyId, mfa_enforced: mfa, password_min_length: minLength };
}

function verifyMfaEnforcement(db, companyId, userId) {
  ensureCompany(db, companyId);
  const policy = db.prepare('SELECT mfa_enforced FROM shop_org_security_policy WHERE company_id = ?').get(companyId);
  const mfaRequired = policy ? policy.mfa_enforced === 1 : false;
  return { mfa_required: mfaRequired };
}

module.exports = {
  createSsoConfig: infra.atomicCommand(createSsoConfig),
  linkUserSso: infra.atomicCommand(linkUserSso),
  authenticateSsoUser,
  configureSecurityPolicy: infra.atomicCommand(configureSecurityPolicy),
  verifyMfaEnforcement
};
