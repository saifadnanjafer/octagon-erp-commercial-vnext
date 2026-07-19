// R4.4 acceptance: collaboration & activity wiring on a disposable database.
// Proves chatter thread + followers + activities work on every R2/R3 document
// type, tracked-field changes auto-log through the universal recordWrite
// chokepoint, and record-header/next-activity data is available per entity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import chatter from '../vnext/server/chatter/chatter.js';
import infra from '../vnext/server/modules/r3-infra.js';
import collaboration from '../vnext/server/modules/governance/collaboration.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r4-collab-'));
const dbPath = path.join(temp, 'r4collab.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

// --- 1. tracked-field auto-log through recordWrite on every collaboration entity ---
let covered = 0;
for (const entity of collaboration.COLLABORATION_ENTITIES) {
  const recordId = `${entity}-rec`;
  const field = collaboration.trackedFieldsFor(entity)[0];
  const before = { [field]: 'draft' };
  const after = { [field]: 'confirmed' };
  infra.recordWrite(db, null, 'company-r0-demo', entity, recordId, 'updated', 'collab-user', before, after);
  const logs = db.prepare("SELECT COUNT(*) n FROM x_chatter WHERE entity=? AND record_id=? AND kind='log'").get(entity, recordId).n;
  if (logs >= 1) covered += 1;
}
check('tracked-field changes auto-log on every R2/R3 document type', () => assert.equal(covered, collaboration.COLLABORATION_ENTITIES.length));

// --- 2. unchanged tracked fields do NOT spam the log ---
check('no auto-log when tracked fields are unchanged', () => {
  const beforeCount = db.prepare("SELECT COUNT(*) n FROM x_chatter WHERE entity='sales_order' AND record_id='noop' AND kind='log'").get().n;
  infra.recordWrite(db, null, 'company-r0-demo', 'sales_order', 'noop', 'updated', 'collab-user', { state: 'confirmed', total_amount: 100 }, { state: 'confirmed', total_amount: 100 });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM x_chatter WHERE entity='sales_order' AND record_id='noop' AND kind='log'").get().n, beforeCount);
});

// --- 3. multi-field change records each field in the log body ---
check('auto-log body captures each changed tracked field', () => {
  const result = collaboration.autoLogTrackedChanges(db, 'sales_order', 'multi', { state: 'draft', total_amount: 100, partner_id: 'a' }, { state: 'confirmed', total_amount: 250, partner_id: 'a' }, 'u');
  assert.equal(result.changes.length, 2); // state + total_amount changed, partner_id unchanged
  const body = db.prepare("SELECT body FROM x_chatter WHERE entity='sales_order' AND record_id='multi' AND kind='log' ORDER BY rowid DESC LIMIT 1").get().body;
  assert.ok(body.includes('state') && body.includes('total_amount') && !body.includes('partner_id'));
});

// --- 4. chatter message + activity + followers work per entity ---
const post = chatter._internal.postChatterItem;
check('a message can be posted to any document thread', () => {
  const item = post(db, 'sales_order', 'so-collab', { body: 'note', author: 'user-a' });
  assert.equal(item.status, 201);
});
check('posting auto-follows the author', () => {
  const thread = chatter._internal.listThread(db, 'sales_order', 'so-collab', { user: 'user-a' });
  assert.ok(thread.data.followers.includes('user-a'));
  assert.equal(thread.data.following, true);
});
check('an activity with a due date can be scheduled and completed', () => {
  const activity = post(db, 'helpdesk_ticket', 'tk-collab', { kind: 'activity', activity_type: 'call', body: 'call customer', due_date: '2026-08-01', author: 'agent' });
  assert.equal(activity.status, 201);
  const header = collaboration.recordHeader(db, 'helpdesk_ticket', 'tk-collab');
  assert.equal(header.counts.open_activities, 1);
  assert.ok(header.next_activity && header.next_activity.activity_type === 'call');
});
check('followers can be added and removed explicitly', () => {
  chatter._internal.followRoute(db, 'purchase_order', 'po-collab', { user: 'buyer' });
  let header = collaboration.recordHeader(db, 'purchase_order', 'po-collab');
  assert.ok(header.followers.includes('buyer'));
  chatter._internal.unfollowRoute(db, 'purchase_order', 'po-collab', { user: 'buyer' });
  header = collaboration.recordHeader(db, 'purchase_order', 'po-collab');
  assert.ok(!header.followers.includes('buyer'));
});

// --- 5. record-header provides status ribbon + next-activity data ---
check('record header exposes thread counts, followers, and next activity', () => {
  post(db, 'project_project', 'pj-collab', { body: 'kickoff', author: 'pm' });
  post(db, 'project_project', 'pj-collab', { kind: 'activity', activity_type: 'review', body: 'design review', due_date: '2026-07-25', author: 'pm' });
  const header = collaboration.recordHeader(db, 'project_project', 'pj-collab');
  assert.ok(header.counts.message >= 1);
  assert.equal(header.counts.open_activities, 1);
  assert.ok(header.followers.includes('pm'));
});

for (const line of results) console.log(line);
console.log(`R4 COLLABORATION SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
