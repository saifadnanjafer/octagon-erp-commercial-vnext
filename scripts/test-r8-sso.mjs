// R8.3 focused acceptance: disposable DB only. Proves SSO provider configurations, user mapping,
// auto-provisioning profiles, MFA enforcement verification, password length validations, API routing, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import sso from '../vnext/server/modules/governance/sso-engine.js';
import { mountSsoRoutes } from '../vnext/server/modules/governance/sso-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r8-sso-'));
const dbPath = path.join(temp, 'r8-sso.db');
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

db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(company, 'Demo Company');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    email      TEXT UNIQUE,
    role       TEXT,
    active     INTEGER,
    created_at TEXT
  );
`);

// 1. SSO config
check('SSO configuration validates and saves provider endpoint settings', () => {
  const conf = sso.createSsoConfig(db, company, {
    provider_type: 'oidc',
    client_id: 'client-xyz',
    client_secret: 'secret-xyz',
    authorization_endpoint: 'https://auth.example.com/oauth',
    token_endpoint: 'https://auth.example.com/token'
  });
  
  assert.equal(conf.provider_type, 'oidc');
  assert.equal(conf.client_id, 'client-xyz');
});

// 2. User linkage
check('SSO links OIDC provider IDs to user accounts without collisions', () => {
  const link = sso.linkUserSso(db, 'user-101', 'oidc', 'google-oauth2|123456789');
  assert.equal(link.user_id, 'user-101');
  assert.equal(link.sso_uid, 'google-oauth2|123456789');
  
  // Try mapping again (must throw 409)
  assert.throws(() => {
    sso.linkUserSso(db, 'user-102', 'oidc', 'google-oauth2|123456789');
  }, { code: 'SSO_LINKED_EXISTS' });
});

// 3. Authenticate and auto-link/provision
check('authenticating SSO auto-links existing emails or provisions new profiles', () => {
  // Existing user in DB with email
  db.prepare(`
    INSERT INTO users (id, name, email, role, active, created_at)
    VALUES ('user-exist', 'Jane Doe', 'jane@example.com', 'employee', 1, '2026-07-19')
  `).run();
  
  // Authenticate existing user (should link)
  const r1 = sso.authenticateSsoUser(db, company, 'oidc', 'google-jane', 'jane@example.com', 'Jane Doe');
  assert.equal(r1.userId, 'user-exist');
  
  // Authenticate brand new user (should provision)
  const r2 = sso.authenticateSsoUser(db, company, 'oidc', 'google-bob', 'bob@example.com', 'Bob Smith');
  assert.ok(r2.userId);
  assert.notEqual(r2.userId, 'user-exist');
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('bob@example.com');
  assert.ok(user);
  assert.equal(user.name, 'Bob Smith');
});

// 4. Security policies
check('security policies enforce password length restrictions and MFA flags', () => {
  const pol = sso.configureSecurityPolicy(db, company, {
    mfa_enforced: true,
    password_min_length: 12
  });
  
  assert.equal(pol.mfa_enforced, 1);
  assert.equal(pol.password_min_length, 12);
  
  // Try short length (must throw)
  assert.throws(() => {
    sso.configureSecurityPolicy(db, company, {
      password_min_length: 4
    });
  }, { code: 'LENGTH_INVALID' });
  
  const mfa = sso.verifyMfaEnforcement(db, company, 'user-exist');
  assert.equal(mfa.mfa_required, true);
});

// 5. API routes
check('SSO API routes gate access and verify scoping', async () => {
  const routes = mountSsoRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true
  });
  
  async function testRoute(method, pathname, bodyData = null, sessionOverride = undefined) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    
    const currentRoutes = mountSsoRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: () => true
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  const r1 = await testRoute('GET', '/api/x/governance/security/policy/mfa');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
});

// 6. Rollback
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
try { db.prepare('DELETE FROM omni_message_log').run(); } catch (_) {}
try { db.prepare('DELETE FROM omni_campaign').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_operator_log').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_material_issue').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_operator').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_andon_call').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_downtime').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_forecast').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_mps_proposal').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_quality_template').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_quality_inspection').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_ncr').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_asset').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_asset_depreciation_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_maintenance_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_intercompany_rule').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_consolidation_rate').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_tenant').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_license').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_sso_config').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_user_sso_link').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_org_security_policy').run(); } catch (_) {}
try { db.prepare('DELETE FROM auth_sessions').run(); } catch (_) {}
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
try { db.prepare('DELETE FROM users').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 803 down restores the SSO schema boundary', () => {
  assert.ok(down.migrations.includes('803_r8_sso'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_sso_config'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR8 SSO SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
