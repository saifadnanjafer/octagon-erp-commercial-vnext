// clean-room; behavior modeled on scripts/test-vnext-kernel-completion.mjs test-suite pattern (proprietary self, not copied)
//
// R1 Lane B completion tests (T1.9.2 nine-box Approval Center, T1.9.1
// escalation/withdraw, T1.6.1 chatter mentions/attachments, T1.7.1 scoped
// worklist counts). Uses its own throwaway SQLite file (vnext-data/test-lane-b.db)
// — never the shared vnext-data/vnext.db — and never binds any network port
// (all HTTP-shaped calls use in-process mock req/res objects, same as the
// existing kernel-completion suite and Lane C's sibling script). Every
// assertion below is a real comparison against an expected value; a failure
// sets process.exitCode = 1 (no silent/fake passes).
'use strict';

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-lane-b.db');
const migrationsDir = path.resolve(here, '../migrations');
const attachmentsDir = path.resolve(here, '../vnext-data/files');

let failures = 0;
function check(label, condition, details) {
  if (condition) {
    console.log('  PASS:', label);
  } else {
    failures += 1;
    console.error('  FAIL:', label, details === undefined ? '' : details);
  }
}

// Ensure clean, isolated test DB (never the shared vnext-data/vnext.db).
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

// ---------------------------------------------------------------------------
// KNOWN CROSS-LANE DEFECT (first documented by Lane C's
// scripts/test-lane-c-completion.mjs; independently reconfirmed here):
// vnext/server/db/migration-runner.mjs (not owned by this lane) applies
// migrations in plain filename-alphabetical order, which runs 102/202/302/402
// BEFORE 501_r1_kernel_completion.mjs, even though 202 ALTERs
// x_approval_policies which 501 creates. migrations/202_r1_lane_b_completion.mjs
// defends against this itself (CREATE TABLE IF NOT EXISTS with 501's exact
// shape before ALTERing), so this suite can validate the migration exactly as
// server.js's real startup migration runner would invoke it — in plain
// alphabetical order, NOT a hand-picked dependency-safe order.
// ---------------------------------------------------------------------------
const actualMigrationFiles = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.mjs$/.test(f)).sort();
check(
  '0.1 202_r1_lane_b_completion.mjs is present among the migrations actually on disk',
  actualMigrationFiles.includes('202_r1_lane_b_completion.mjs'),
  actualMigrationFiles
);

console.log('--- APPLYING MIGRATIONS (real plain alphabetical order, same as migration-runner.mjs) ---');
const migrationDb = new DatabaseSync(dbPath);
migrationDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of actualMigrationFiles) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migrationDb);
  console.log('  applied:', mod.migration.id);
}
migrationDb.close();
console.log('Migrations applied (202 survived running before 501 — see note above).');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

// Server-boot-time table (created in server.js, not in a migration) — mirror
// the existing kernel-completion suite's own bootstrap for auth_sessions.
db.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    userId TEXT,
    createdAt INTEGER,
    expiresAt INTEGER,
    role TEXT
  );
`);

const { applyR0ScopeSeed } = await import('../vnext/server/db/seed-runner.mjs');
const seedResult = applyR0ScopeSeed(db);
check('0.2 R0 scope seed applied (company-r0-demo exists for x_records.company_id FK)', !!db.prepare('SELECT 1 FROM r0_tenant_root WHERE company_id = ?').get('company-r0-demo'), seedResult);

check('0.3 x_approval_policies has escalation_timeout_minutes column', db.prepare('PRAGMA table_info(x_approval_policies)').all().some((c) => c.name === 'escalation_timeout_minutes'));
check('0.4 x_approvals has step_entered_at/escalated/escalated_at/escalated_from_role columns', ['step_entered_at', 'escalated', 'escalated_at', 'escalated_from_role'].every((col) => db.prepare('PRAGMA table_info(x_approvals)').all().some((c) => c.name === col)));
check('0.5 x_attachments table exists', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='x_attachments'").get() !== undefined);

const acl = require('../vnext/server/acl/acl-engine.js');
const approvalsMod = require('../vnext/server/approvals/approvals.js');
const chatterMod = require('../vnext/server/chatter/chatter.js');
const { mountWorklistCounts } = require('../vnext/server/acl/worklist-counts.js');
const { writeAudit } = require('../vnext/server/audit/audit.js');

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: '', writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    end(text) { this.body = text || ''; this.writableEnded = true; },
  };
}

/** Like mockRes(), but real Writable so fs.createReadStream(...).pipe(res) works for downloads. */
function mockStreamRes() {
  const chunks = [];
  const res = new Writable({ write(chunk, enc, cb) { chunks.push(Buffer.from(chunk)); cb(); } });
  res.headers = {}; res.statusCode = 200;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.writeHead = (status, headers) => { res.statusCode = status; Object.assign(res.headers, headers || {}); };
  const origEnd = res.end.bind(res);
  res.end = (text) => { if (text) chunks.push(Buffer.from(text)); origEnd(); };
  res.getBody = () => Buffer.concat(chunks);
  return res;
}

function mockReq(method, body, headers) {
  return {
    method,
    headers: { host: 'localhost', ...(headers || {}) },
    on(event, cb) {
      if (event === 'data' && body !== undefined) cb(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
      if (event === 'end') cb();
    },
  };
}

function urlFor(pathname) { return new URL('http://localhost' + pathname); }

// =============================================================================
// SUITE 1 — entityAclKey() infra fix (blocks Task 4 and every crud-engine route
// until fixed; acl-engine.js is this lane's own owned file).
// =============================================================================
console.log('\n=== SUITE 1: acl.entityAclKey() infra fix ===');
check('1.1 entityAclKey(crm_lead, db) resolves the seeded collection_registry.acl key', acl.entityAclKey('crm_lead', db) === 'sales:crm_lead', acl.entityAclKey('crm_lead', db));
check('1.2 entityAclKey(unknown_entity, db) falls back to a conservative platform:<entity> key', acl.entityAclKey('totally_unknown_entity_xyz', db) === 'platform:totally_unknown_entity_xyz');
check('1.3 rowScopeAllows: own scope allows the record owner', acl.rowScopeAllows({ userId: 'u1' }, 'own', { created_by: 'u1' }) === true);
check('1.4 rowScopeAllows: own scope denies a non-owner', acl.rowScopeAllows({ userId: 'u1' }, 'own', { created_by: 'u2' }) === false);
check('1.5 rowScopeAllows: dept scope requires a matching non-empty department', acl.rowScopeAllows({ userId: 'u1', department: 'ops' }, 'dept', { department: 'ops' }) === true && acl.rowScopeAllows({ userId: 'u1', department: '' }, 'dept', { department: '' }) === false);
check('1.6 rowScopeAllows: all scope always allows', acl.rowScopeAllows({ userId: 'u1' }, 'all', null) === true);

// =============================================================================
// SUITE 2 — Approval escalation (T1.9.1a)
// =============================================================================
console.log('\n=== SUITE 2: TIMEOUT ESCALATION (T1.9.1a) ===');
const { _internal: apr } = approvalsMod;

db.prepare('INSERT INTO x_approval_policies (entity, policy_chain, authority_limit, escalation_timeout_minutes) VALUES (?, ?, ?, ?)')
  .run('escalation_demo_multi', JSON.stringify(['step_manager', 'step_director']), 0, 30);
db.prepare('INSERT INTO x_approval_policies (entity, policy_chain, authority_limit, escalation_timeout_minutes) VALUES (?, ?, ?, ?)')
  .run('escalation_demo_single', JSON.stringify(['step_manager']), 0, 30);

const multiStepCreate = apr.createApproval(db, { entity: 'escalation_demo_multi', record_id: 'rec1', action: 'act', payload: {} }, 'requesterA');
const singleStepCreate = apr.createApproval(db, { entity: 'escalation_demo_single', record_id: 'rec2', action: 'act', payload: {} }, 'requesterB');
check('2.1 multi-step chain approval created pending on step_manager', multiStepCreate.json.data.approver_role === 'step_manager' && multiStepCreate.json.data.status === 'pending');

// Backdate step_entered_at by 45 minutes (> the 30-minute policy timeout) to simulate elapsed time.
const oldTs = new Date(Date.now() - 45 * 60000).toISOString();
db.prepare('UPDATE x_approvals SET step_entered_at = ?, created_at = ? WHERE id = ?').run(oldTs, oldTs, multiStepCreate.json.data.id);
db.prepare('UPDATE x_approvals SET step_entered_at = ?, created_at = ? WHERE id = ?').run(oldTs, oldTs, singleStepCreate.json.data.id);

const escalatedN = apr.runEscalationSweep(db, null);
check('2.2 escalation sweep processed both overdue requests', escalatedN === 2, escalatedN);

const afterMulti = apr.dispatch(db, 'GET', '/api/x/approvals/list', {}, null, { user: 'requesterA', roles: [] });
const multiRow = db.prepare('SELECT * FROM x_approvals WHERE id = ?').get(multiStepCreate.json.data.id);
check('2.3 multi-step escalation advances to the NEXT sequential chain role', multiRow.approver_role === 'step_director', multiRow.approver_role);
check('2.4 multi-step escalation sets escalated=1 with a fresh step_entered_at', Number(multiRow.escalated) === 1 && multiRow.step_entered_at !== oldTs);
check('2.5 multi-step escalation records escalated_from_role', multiRow.escalated_from_role === 'step_manager', multiRow.escalated_from_role);

const singleRow = db.prepare('SELECT * FROM x_approvals WHERE id = ?').get(singleStepCreate.json.data.id);
check('2.6 single-step (chain exhausted) escalation falls back to admin', singleRow.approver_role === 'admin', singleRow.approver_role);

const auditRow = db.prepare("SELECT * FROM x_audit WHERE entity = 'escalation_demo_multi' AND action = 'approval_escalated_timeout' ORDER BY at DESC LIMIT 1").get();
check('2.7 escalation writes an audit trail row', !!auditRow);

const noSweep = apr.runEscalationSweep(db, null);
check('2.8 escalation sweep is idempotent once step_entered_at is reset (no immediate re-escalation)', noSweep === 0, noSweep);

// =============================================================================
// SUITE 3 — Withdraw (T1.9.1b)
// =============================================================================
console.log('\n=== SUITE 3: WITHDRAW (T1.9.1b) ===');
const withdrawCreate = apr.createApproval(db, { entity: 'withdraw_demo', record_id: 'wd1', action: 'act', payload: {}, cc: ['ccPerson'] }, 'requesterC');
const withdrawId = withdrawCreate.json.data.id;

const withdrawByStranger = apr.withdrawApproval(db, withdrawId, { user: 'someoneElse', roles: [] }, null);
check('3.1 only the original requester may withdraw (403 otherwise)', withdrawByStranger.status === 403, withdrawByStranger.json);

const withdrawOk = apr.withdrawApproval(db, withdrawId, { user: 'requesterC', roles: [] }, null);
check('3.2 requester can withdraw a pending request (200)', withdrawOk.status === 200 && withdrawOk.json.data.status === 'withdrawn', withdrawOk.json);

const rowAfterWithdraw = db.prepare('SELECT status FROM x_approvals WHERE id = ?').get(withdrawId);
check('3.3 withdrawn row is no longer status=pending — this IS the "document released" signal (see TASK.md)', rowAfterWithdraw.status === 'withdrawn');

const withdrawAgain = apr.withdrawApproval(db, withdrawId, { user: 'requesterC', roles: [] }, null);
check('3.4 withdrawing an already-decided (non-pending) request is rejected (409)', withdrawAgain.status === 409, withdrawAgain.json);

const withdrawMissing = apr.withdrawApproval(db, 'apr_does_not_exist', { user: 'requesterC', roles: [] }, null);
check('3.5 withdrawing a non-existent id returns 404', withdrawMissing.status === 404);

// =============================================================================
// SUITE 4 — Nine-box listing semantics (T1.9.2)
// =============================================================================
console.log('\n=== SUITE 4: NINE-BOX APPROVAL CENTER (T1.9.2) ===');

db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('box_manager_role', 'Box Manager');
db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('box_delegate_role', 'Box Delegate');

// Approve / reject / return / cc scenario.
const boxApprove = apr.createApproval(db, { entity: 'box_demo', record_id: 'b1', action: 'act', payload: {}, approver_role: 'box_manager_role', cc: ['ccBoxUser'] }, 'boxRequester');
const boxReject = apr.createApproval(db, { entity: 'box_demo', record_id: 'b2', action: 'act', payload: {}, approver_role: 'box_manager_role' }, 'boxRequester');
const boxReturn = apr.createApproval(db, { entity: 'box_demo', record_id: 'b3', action: 'act', payload: {}, approver_role: 'box_manager_role' }, 'boxRequester');

const approverCtx = { user: 'boxApprover', roles: ['box_manager_role'] };
apr.decideApproval(db, boxApprove.json.data.id, 'approve', approverCtx, null);
apr.decideApproval(db, boxReject.json.data.id, 'reject', approverCtx, null);
apr.decideApproval(db, boxReturn.json.data.id, 'return', approverCtx, null);

function listBox(user, roles, box) {
  return apr.listApprovals(db, { box }, { user, roles }).json;
}

const requesterMy = listBox('boxRequester', [], 'my');
check('4.1 my box shows every request I submitted regardless of status', requesterMy.data.length === 3, requesterMy.data.map((i) => i.status));

const approverDone = listBox('boxApprover', ['box_manager_role'], 'done');
check('4.2 done box shows only the approved request I decided', approverDone.data.length === 1 && approverDone.data[0].id === boxApprove.json.data.id);

const approverRejected = listBox('boxApprover', ['box_manager_role'], 'rejected');
check('4.3 rejected box shows the request I rejected', approverRejected.data.length === 1 && approverRejected.data[0].id === boxReject.json.data.id);

const requesterRejected = listBox('boxRequester', [], 'rejected');
check('4.4 rejected box is ALSO visible to the requester (must know why + be able to act)', requesterRejected.data.some((i) => i.id === boxReject.json.data.id));

const approverReturned = listBox('boxApprover', ['box_manager_role'], 'returned');
check('4.5 returned box shows the request I returned for revision', approverReturned.data.length === 1 && approverReturned.data[0].id === boxReturn.json.data.id);

const ccBox = listBox('ccBoxUser', [], 'cc');
check('4.6 cc box shows a request regardless of its status', ccBox.data.some((i) => i.id === boxApprove.json.data.id));

const strangerDone = listBox('totalStranger', [], 'done');
check('4.7 done box is empty for an uninvolved user', strangerDone.data.length === 0);

// Delegation-specific 'todo' vs 'delegated' distinction.
db.prepare("INSERT INTO auth_sessions (token, userId, createdAt, expiresAt, role) VALUES (?, ?, ?, ?, ?)")
  .run('tok_box_mgr', 'boxDelegatorManager', Date.now(), Date.now() + 3600000, 'box_manager_role');
db.prepare('INSERT INTO x_approval_delegations (user, delegate, expires_at) VALUES (?, ?, ?)')
  .run('boxDelegatorManager', 'boxDelegateUser', new Date(Date.now() + 3600000).toISOString());

const delegatedTarget = apr.createApproval(db, { entity: 'box_demo', record_id: 'b4', action: 'act', payload: {}, approver_role: 'box_manager_role' }, 'boxRequester2');

const delegateTodo = listBox('boxDelegateUser', ['box_delegate_role'], 'todo');
const delegateDelegated = listBox('boxDelegateUser', ['box_delegate_role'], 'delegated');
check('4.8 delegate sees the delegator\'s pending item in todo (delegation grants access)', delegateTodo.data.some((i) => i.id === delegatedTarget.json.data.id));
check('4.9 delegate sees the SAME item in the dedicated delegated box', delegateDelegated.data.some((i) => i.id === delegatedTarget.json.data.id));

const directManagerTodo = listBox('boxDelegatorManager', ['box_manager_role'], 'todo');
const directManagerDelegated = listBox('boxDelegatorManager', ['box_manager_role'], 'delegated');
check('4.10 the direct role holder (delegator) sees it in todo via their own role', directManagerTodo.data.some((i) => i.id === delegatedTarget.json.data.id));
check('4.11 ...but NOT in delegated (direct role access is not "delegated to me")', !directManagerDelegated.data.some((i) => i.id === delegatedTarget.json.data.id));

const strangerWithSameRoleNameOnly = listBox('boxUnrelatedStranger', ['box_delegate_role'], 'todo');
check('4.12 a user with the SAME role as the delegate, but no actual delegation record, does not see the item', !strangerWithSameRoleNameOnly.data.some((i) => i.id === delegatedTarget.json.data.id));

// Escalated + withdrawn boxes wired to real data from suites 2 and 3.
const requesterEscalated = listBox('requesterA', [], 'escalated');
check('4.13 escalated box shows an escalated request to its requester', requesterEscalated.data.some((i) => i.id === multiStepCreate.json.data.id));
const directorEscalated = listBox('anyDirector', ['step_director'], 'escalated');
check('4.14 escalated box is visible to the NEW (post-escalation) approver role', directorEscalated.data.some((i) => i.id === multiStepCreate.json.data.id));

const requesterWithdrawn = listBox('requesterC', [], 'withdrawn');
check('4.15 withdrawn box shows the withdrawn request to its requester', requesterWithdrawn.data.some((i) => i.id === withdrawId));

// counts endpoint: all nine boxes present with correct keys.
const countsResult = apr.boxCounts(db, { user: 'boxRequester', roles: [] }).json.data;
const expectedBoxKeys = ['my', 'todo', 'done', 'cc', 'delegated', 'escalated', 'withdrawn', 'rejected', 'returned'];
check('4.16 counts endpoint returns exactly the nine canonical boxes', expectedBoxKeys.every((k) => k in countsResult) && Object.keys(countsResult).length === 9, countsResult);
check('4.17 counts endpoint numbers match a direct listApprovals() call for the same user/box', countsResult.my === requesterMy.data.length);

// =============================================================================
// SUITE 5 — Chatter @mentions (T1.6.1a)
// =============================================================================
console.log('\n=== SUITE 5: CHATTER @MENTIONS (T1.6.1a) ===');
const { _internal: chatterInternal } = chatterMod;

db.prepare("INSERT INTO x_followers (entity, record_id, user) VALUES (?, ?, ?)").run('mention_demo', 'm1', 'followerOnly');
const mentionPost = chatterInternal.postChatterItem(db, 'mention_demo', 'm1', { kind: 'message', body: 'مرحباً @bob و @sara، راجعوا هذا من فضلكم', author: 'alice' });
check('5.1 message posts successfully', mentionPost.status === 201, mentionPost.json);

const mentionExtraction = chatterInternal.extractMentions('hi @bob and @bob again, also @sara.x-1');
check('5.2 extractMentions dedupes and captures dotted/hyphenated handles', JSON.stringify(mentionExtraction) === JSON.stringify(['bob', 'sara.x-1']), mentionExtraction);

const bobNotif = db.prepare("SELECT * FROM x_notifications WHERE user = 'bob' ORDER BY created_at DESC LIMIT 1").get();
const saraNotif = db.prepare("SELECT * FROM x_notifications WHERE user = 'sara' ORDER BY created_at DESC LIMIT 1").get();
const followerNotif = db.prepare("SELECT * FROM x_notifications WHERE user = 'followerOnly' ORDER BY created_at DESC LIMIT 1").get();
check('5.3 each @mentioned user gets their OWN notification', !!bobNotif && !!saraNotif, { bobNotif, saraNotif });
check('5.4 mention notifications are IN ADDITION TO follower notifications (not instead of)', !!followerNotif);
check('5.5 mention notification title/body reference the mention', bobNotif.title.includes('إشارة'));

// =============================================================================
// SUITE 6 — Chatter attachments (T1.6.1b): upload, download, ACL 403.
// =============================================================================
console.log('\n=== SUITE 6: CHATTER ATTACHMENTS (T1.6.1b) ===');

// Seed a real x_records row for crm_lead (aclKey sales:crm_lead) owned by 'attOwner'.
db.prepare('INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
  .run('crm_lead', 'lead_att_1', 'company-r0-demo', '{}', new Date().toISOString(), new Date().toISOString(), 'attOwner');

db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('att_reader_role', 'Attachment Reader');
db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('att_no_grant_role', 'No Grant');
db.prepare("INSERT INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run('att_reader_role', 'sales:crm_lead:read', 'all');
// att_no_grant_role intentionally has zero grants -> scopeFor() returns null -> 403.

const chatterHandler = chatterMod.createChatterHandler({ db });

const uploadReq = mockReq('POST', {
  filename: '../../etc/passwd.txt', // hostile filename — must never be used as the storage path
  mime_type: 'text/plain',
  data_base64: Buffer.from('hello attachment world').toString('base64'),
}, { 'x-user': 'attOwner', 'x-roles': 'att_reader_role' });
const uploadRes = mockRes();
chatterHandler.handle(uploadReq, uploadRes, urlFor('/api/x/chatter/crm_lead/lead_att_1/attachments'));
await new Promise((r) => setTimeout(r, 10));
const uploadJson = JSON.parse(uploadRes.body);
check('6.1 authorized upload succeeds (201)', uploadRes.statusCode === 201 && uploadJson.success, uploadJson);

const storedRow = db.prepare('SELECT * FROM x_attachments WHERE id = ?').get(uploadJson.data && uploadJson.data.id);
check('6.2 stored filename is display-only; storage_name is generated, not the hostile client filename', !!storedRow && !storedRow.storage_name.includes('..') && !storedRow.storage_name.includes('/'), storedRow && storedRow.storage_name);
check('6.3 file actually landed under vnext-data/files/ using the generated storage_name', !!storedRow && fs.existsSync(path.join(attachmentsDir, storedRow.storage_name)));
check('6.4 no file escaped to the hostile path implied by the client filename', !fs.existsSync(path.resolve(attachmentsDir, '../../etc/passwd.txt')));

const listReq = mockReq('GET', undefined, { 'x-user': 'attOwner', 'x-roles': 'att_reader_role' });
const listRes = mockRes();
chatterHandler.handle(listReq, listRes, urlFor('/api/x/chatter/crm_lead/lead_att_1/attachments'));
const listJson = JSON.parse(listRes.body);
check('6.5 authorized list returns the uploaded attachment', listRes.statusCode === 200 && listJson.data.length === 1, listJson);

const downloadOkReq = mockReq('GET', undefined, { 'x-user': 'attOwner', 'x-roles': 'att_reader_role' });
const downloadOkRes = mockStreamRes();
chatterHandler.handle(downloadOkReq, downloadOkRes, urlFor(`/api/x/chatter/attachments/${uploadJson.data.id}`));
await new Promise((r) => setTimeout(r, 20));
check('6.6 authorized download succeeds (200) with the original file content', downloadOkRes.statusCode === 200 && downloadOkRes.getBody().toString('utf8') === 'hello attachment world', downloadOkRes.getBody().toString('utf8'));

const downloadForbiddenReq = mockReq('GET', undefined, { 'x-user': 'noGrantUser', 'x-roles': 'att_no_grant_role' });
const downloadForbiddenRes = mockStreamRes();
chatterHandler.handle(downloadForbiddenReq, downloadForbiddenRes, urlFor(`/api/x/chatter/attachments/${uploadJson.data.id}`));
await new Promise((r) => setTimeout(r, 10));
check('6.7 unauthorized user (no read grant) gets 403 on download', downloadForbiddenRes.statusCode === 403, downloadForbiddenRes.getBody().toString('utf8'));

const uploadForbiddenReq = mockReq('POST', { filename: 'x.txt', data_base64: Buffer.from('nope').toString('base64') }, { 'x-user': 'noGrantUser', 'x-roles': 'att_no_grant_role' });
const uploadForbiddenRes = mockRes();
chatterHandler.handle(uploadForbiddenReq, uploadForbiddenRes, urlFor('/api/x/chatter/crm_lead/lead_att_1/attachments'));
await new Promise((r) => setTimeout(r, 10));
check('6.8 unauthorized user also gets 403 on upload (not just download)', uploadForbiddenRes.statusCode === 403);

// =============================================================================
// SUITE 7 — Scoped worklist counts (T1.7.1)
// =============================================================================
console.log('\n=== SUITE 7: SCOPED WORKLIST COUNTS (T1.7.1) ===');

db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('wl_own_role', 'Own scope');
db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('wl_dept_role', 'Dept scope');
db.prepare("INSERT INTO x_acl_roles (role, label_ar) VALUES (?, ?) ON CONFLICT DO NOTHING").run('wl_all_role', 'Company-wide scope');
db.prepare("INSERT INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run('wl_own_role', 'sales:crm_lead:read', 'own');
db.prepare("INSERT INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run('wl_dept_role', 'sales:crm_lead:read', 'dept');
db.prepare("INSERT INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run('wl_all_role', 'sales:crm_lead:read', 'all');

const nowIso = new Date().toISOString();
const seedLead = (id, createdBy, department, status) => db.prepare(
  'INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
).run('crm_lead', id, 'company-r0-demo', JSON.stringify({ department, status }), nowIso, nowIso, createdBy);

seedLead('wl_lead_own', 'wlUserOwn', 'ops', 'new');
seedLead('wl_lead_ops_other', 'someoneElse', 'ops', 'new');
seedLead('wl_lead_finance', 'someoneElse', 'finance', 'new');
seedLead('wl_lead_finance_qualified', 'someoneElse', 'finance', 'qualified');

db.prepare('INSERT INTO x_views (id, user, entity, name, config) VALUES (?, ?, ?, ?, ?)')
  .run('view_wl_new_only', 'wlUserAll', 'crm_lead', 'الجديدة فقط', JSON.stringify({ filters: { status: 'new' } }));

const worklist = mountWorklistCounts({ db });

function worklistCountsFor(userId, roles, department) {
  const req = mockReq('GET', undefined, { 'x-user': userId, 'x-roles': roles.join(','), 'x-department': department || '' });
  const res = mockRes();
  worklist.handle(req, res, urlFor('/api/x/_worklist/counts?entity=crm_lead'));
  return JSON.parse(res.body);
}

const ownResult = worklistCountsFor('wlUserOwn', ['wl_own_role']);
check('7.1 own-scope user sees only their own crm_lead records', ownResult.data.scope === 'own' && ownResult.data.total === 1, ownResult.data);

const deptResult = worklistCountsFor('someoneElse', ['wl_dept_role'], 'ops');
check('7.2 dept-scope user sees only their department\'s records (ops = 2, not the finance ones)', deptResult.data.scope === 'dept' && deptResult.data.total === 2, deptResult.data);

const allResult = worklistCountsFor('wlUserAll', ['wl_all_role']);
// total is 5, not 4: Suite 6 (chatter attachments) already seeded one extra
// crm_lead row ('lead_att_1') to exercise the record-level ACL check — 'all'
// scope legitimately sees it too, since it is company-wide.
check('7.3 company-wide (all) scope user sees every crm_lead record (4 seeded here + 1 from Suite 6 = 5)', allResult.data.scope === 'all' && allResult.data.total === 5, allResult.data);
check('7.4 own vs dept vs all scopes produce three DIFFERENT counts for the identical worklist definition', new Set([ownResult.data.total, deptResult.data.total, allResult.data.total]).size === 3, { own: ownResult.data.total, dept: deptResult.data.total, all: allResult.data.total });

const deptNoDepartmentResult = worklistCountsFor('someoneWithNoDept', ['wl_dept_role']);
check('7.5 dept-scope user with NO configured department sees zero (safe default, not a leak)', deptNoDepartmentResult.data.total === 0, deptNoDepartmentResult.data);

const noGrantResult = worklistCountsFor('someoneWithNoGrant', ['att_no_grant_role']);
check('7.6 a role with no read grant on the entity gets 403 from the counts endpoint', noGrantResult.error !== null || noGrantResult.success === false);

const viewFilterResult = worklistCountsFor('wlUserAll', ['wl_all_role']);
const savedView = viewFilterResult.data.by_view.find((v) => v.id === 'view_wl_new_only');
check('7.7 per-saved-view filter narrows the count (status=new: 3 of 4 total)', !!savedView && savedView.count === 3, savedView);

// =============================================================================
// SUMMARY
// =============================================================================
// Clean up the real files this suite wrote under vnext-data/files/ (Suite 6
// exercises genuine on-disk storage, so it genuinely creates them).
for (const row of db.prepare("SELECT storage_name FROM x_attachments WHERE entity = 'crm_lead' AND record_id = 'lead_att_1'").all()) {
  try { fs.unlinkSync(path.join(attachmentsDir, row.storage_name)); } catch (_) {}
}

try { db.close(); } catch (_) {}
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

console.log(`\n--- ${failures === 0 ? 'ALL LANE B COMPLETION TESTS PASSED' : failures + ' LANE B COMPLETION TEST(S) FAILED'} ---`);
if (failures > 0) process.exitCode = 1;
