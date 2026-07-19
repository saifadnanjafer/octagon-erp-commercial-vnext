// R6.7 focused acceptance: disposable DB only. Proves campaign dispatch, template
// placeholder interpolation, delivery status report webhooks, customer replies, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import camp from '../vnext/server/modules/campaign/campaign-engine.js';
import { mountCampaignRoutes } from '../vnext/server/modules/campaign/campaign-routes.js';
import arap from '../vnext/server/finance/arap-engine.js';
import loy from '../vnext/server/modules/loyalty/loyalty-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r6-campaign-'));
const dbPath = path.join(temp, 'r6-campaign.db');
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

// Create partner
const partner = arap.createPartner(db, company, { id: 'p-1', name: 'Zahraa', partner_type: 'customer' }, 'system');

// Create loyalty card & add points
const program = loy.createProgram(db, company, { id: 'prog-1', name: 'Loyalty Program', program_type: 'points' }, 'system');
const card = loy.createCard(db, company, { id: 'card-1', partner_id: 'p-1', program_id: 'prog-1', card_number: 'CARD-101', tier: 'gold' }, 'system');
loy.addPoints(db, company, 'card-1', 4500, 'SO-101', null, 'system');

// 1. Campaign creation and dispatch
check('campaign is created and dispatched with template placeholder resolution', () => {
  const campaign = camp.createCampaign(db, company, {
    id: 'c-1',
    name: 'Loyalty Promo',
    channel: 'whatsapp',
    template_body: 'Dear {{partner_name}}, your loyalty balance is {{points}} points ({{tier}} tier).'
  }, 'system');
  
  assert.equal(campaign.name, 'Loyalty Promo');
  assert.equal(campaign.state, 'draft');
  
  // Dispatch
  const updatedCampaign = camp.dispatchCampaign(db, company, 'c-1', ['p-1'], 'system');
  assert.equal(updatedCampaign.state, 'completed');
  
  // Verify message log
  const logs = camp.getMessageLogs(db, company, 'c-1');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].partner_id, 'p-1');
  assert.equal(logs[0].delivery_state, 'sent');
  assert.equal(logs[0].direction, 'outbound');
  assert.equal(logs[0].body, 'Dear Zahraa, your loyalty balance is 4500 points (gold tier).');
});

// 2. Webhook DLR delivery status reports
check('webhook DLR reports update message logs status', () => {
  const logs = camp.getMessageLogs(db, company, 'c-1');
  const messageId = logs[0].id;
  
  // DLR update to delivered
  let updated = camp.receiveWebhookDlr(db, company, messageId, 'delivered');
  assert.equal(updated.delivery_state, 'delivered');
  
  // DLR update to read
  updated = camp.receiveWebhookDlr(db, company, messageId, 'read');
  assert.equal(updated.delivery_state, 'read');
});

// 3. Webhook Inbound replies
check('webhook inbound handles and logs customer responses', () => {
  const reply = camp.receiveWebhookInbound(db, company, '+9647701234567', 'STOP');
  assert.equal(reply.recipient, '+9647701234567');
  assert.equal(reply.body, 'STOP');
  assert.equal(reply.direction, 'inbound');
  assert.equal(reply.delivery_state, 'read');
});

// 4. Routes permissions and scoping
check('campaign routes enforce scoping and authorization', async () => {
  const routes = mountCampaignRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-op', groups: ['campaign-operator'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: (user, perm) => {
      return perm === 'campaign:view';
    }
  });
  
  async function testRoute(method, pathname, bodyData = null, sessionOverride = undefined) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    
    const currentRoutes = mountCampaignRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-op', groups: ['campaign-operator'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
      canPermission: (user, perm) => perm === 'campaign:view'
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET lists campaigns (requires view, allowed)
  const r1 = await testRoute('GET', '/api/x/campaigns');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  
  // POST creates campaign (requires manage, denied 403)
  const r2 = await testRoute('POST', '/api/x/campaigns', { name: 'New Promo', template_body: 'Hello' });
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 403);
  
  // Webhook inbound (public, allowed without session)
  const r3 = await testRoute('POST', '/api/x/campaigns/webhook/inbound', { from: '+964000', body: 'HELP' }, () => null);
  assert.equal(r3.processed, true);
  assert.equal(r3.res.statusCode, 200);
});

// 5. Rollback testing
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
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 637 down restores the campaign schema boundary', () => {
  assert.ok(down.migrations.includes('637_r6_campaign'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='omni_campaign'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR6 CAMPAIGN SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
