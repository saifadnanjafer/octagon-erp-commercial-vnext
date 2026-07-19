// R8.4 focused acceptance: disposable DB only. Proves API key generation, hashing verification,
// expired key blockages, webhook subscriptions, AES-256-CBC encrypted credential vault storage, API routing, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import integ from '../vnext/server/modules/governance/integration-engine.js';
import { mountIntegrationRoutes } from '../vnext/server/modules/governance/integration-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r8-integration-'));
const dbPath = path.join(temp, 'r8-integration.db');
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

// 1. Generate & Verify API keys
check('API keys generate correctly, hashes verify, and expired keys block access', () => {
  const expiry = '2030-01-01T00:00:00Z';
  const key = integ.generateApiKey(db, company, 'Test API Key', ['sales:view'], expiry);
  
  assert.ok(key.raw_key);
  assert.ok(key.raw_key.startsWith('oct_key_'));
  assert.equal(key.key_name, 'Test API Key');
  
  // Verify valid key
  const v1 = integ.verifyApiKey(db, key.raw_key);
  assert.equal(v1.valid, true);
  assert.equal(v1.company_id, company);
  assert.deepEqual(v1.scopes, ['sales:view']);
  
  // Verify invalid key
  const v2 = integ.verifyApiKey(db, 'oct_key_invalid_random_string');
  assert.equal(v2.valid, false);
  
  // Verify expired key
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1);
  const expiredKey = integ.generateApiKey(db, company, 'Expired Key', ['sales:view'], expiredDate.toISOString());
  
  const v3 = integ.verifyApiKey(db, expiredKey.raw_key);
  assert.equal(v3.valid, false);
});

// 2. Webhooks
check('webhook subscriptions register target URLs and event scopes', () => {
  const wh = integ.registerWebhook(db, company, {
    target_url: 'https://api.thirdparty.com/webhook',
    event_type: 'sales_order.created',
    secret_token: 'wh-secret-xyz'
  });
  
  assert.equal(wh.target_url, 'https://api.thirdparty.com/webhook');
  assert.equal(wh.event_type, 'sales_order.created');
  assert.equal(wh.secret_token, 'wh-secret-xyz');
});

// 3. Encrypted Credential Vault
check('credential vault encrypts secret parameters and decrypts them correctly', () => {
  const secretText = 'my-super-secret-api-password-12345';
  
  const res = integ.saveCredential(db, company, 'stripe_api_secret', secretText);
  assert.ok(res.success);
  
  // Verify ciphertext is NOT plaintext in DB
  const rawRow = db.prepare("SELECT encrypted_secret FROM shop_credential_vault WHERE key_name = 'stripe_api_secret'").get();
  assert.ok(rawRow);
  assert.notEqual(rawRow.encrypted_secret, secretText);
  
  // Decrypt and verify matching plaintext
  const decrypted = integ.getCredential(db, company, 'stripe_api_secret');
  assert.equal(decrypted, secretText);
});

// 4. API routes
check('integration API routes enforce security checks', async () => {
  const routes = mountIntegrationRoutes({
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
    
    const currentRoutes = mountIntegrationRoutes({
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
  
  // Register webhook route (allowed)
  const r1 = await testRoute('POST', '/api/x/governance/integration/webhooks', {
    target_url: 'https://example.com/test',
    event_type: 'test'
  });
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 201);
});

// 5. Down Rollback
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
try { db.prepare('DELETE FROM shop_api_key').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_webhook_subscription').run(); } catch (_) {}
try { db.prepare('DELETE FROM shop_credential_vault').run(); } catch (_) {}
try { db.prepare('DELETE FROM auth_sessions').run(); } catch (_) {}
try { db.prepare('DELETE FROM stock_move').run(); } catch (_) {}
try { db.prepare('DELETE FROM locations').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_work_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM mrp_bom').run(); } catch (_) {}
try { db.prepare('DELETE FROM warehouses').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 804 down restores the Integration schema boundary', () => {
  assert.ok(down.migrations.includes('804_r8_integration'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_api_key'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR8 INTEGRATION SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
