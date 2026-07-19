// R5.4 acceptance: print-template versioning + public forms on a disposable
// database. Proves archived print snapshots are immutable across template edits,
// public submissions are rate-limited and quarantined, and promotion creates a
// real audited record.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import forms from '../vnext/server/modules/reporting/public-forms.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r5-forms-'));
const dbPath = path.join(temp, 'r5forms.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

// --- 1. print template versioning + immutable render snapshot ---
const v1 = forms.createTemplate(db, company, { entity: 'sales_order', name: 'invoice', body: 'INV {{order_number}} total {{total_amount}}' }, 'u');
check('first template is version 1 and active', () => assert.equal(v1.version, 1));
const render1 = forms.renderPrint(db, company, 'sales_order', 'invoice', { id: 'so1', order_number: 'SO-1', total_amount: 100 });
check('render fills placeholders from the record', () => assert.equal(render1.rendered, 'INV SO-1 total 100'));
const v2 = forms.createTemplate(db, company, { entity: 'sales_order', name: 'invoice', body: 'CHANGED {{order_number}}' }, 'u');
check('editing the template creates a new version and deactivates the old', () => {
  assert.equal(v2.version, 2);
  assert.equal(forms._internal.activeTemplate(db, company, 'sales_order', 'invoice').version, 2);
});
check('the archived render snapshot is unchanged after the template edit', () => {
  const stored = forms.getRender(db, company, render1.id);
  assert.equal(stored.rendered_snapshot, 'INV SO-1 total 100');
  assert.equal(stored.template_version, 1);
});
check('a new render uses the new active template version', () => {
  const render2 = forms.renderPrint(db, company, 'sales_order', 'invoice', { id: 'so1', order_number: 'SO-1' });
  assert.equal(render2.rendered, 'CHANGED SO-1');
  assert.equal(render2.template_version, 2);
});

// --- 2. public form → quarantine → promote ---
const form = forms.createForm(db, company, { target_entity: 'crm_lead', name: 'Contact us', rate_limit_per_hour: 3 }, 'u');
check('unauthenticated submission lands in quarantine', () => {
  const submission = forms.submitPublic(db, form.token, { name: 'Prospect', email: 'p@x.com' }, { ip: '1.2.3.4' });
  assert.equal(submission.state, 'quarantined');
});
check('quarantine inbox lists pending submissions', () => {
  const inbox = forms.listQuarantine(db, company, form.token);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].payload.name, 'Prospect');
});
check('rate limit blocks excess submissions', () => {
  forms.submitPublic(db, form.token, { name: 'B' }, { ip: '1.2.3.4' });
  forms.submitPublic(db, form.token, { name: 'C' }, { ip: '1.2.3.4' });
  assert.throws(() => forms.submitPublic(db, form.token, { name: 'D' }, { ip: '1.2.3.4' }), (e) => e.code === 'FORM_RATE_LIMIT');
});
check('unknown form token fails closed', () => assert.throws(() => forms.submitPublic(db, 'no-such-token', { x: 1 }), (e) => e.code === 'FORM_NOT_FOUND'));
const promoteId = forms.listQuarantine(db, company, form.token)[0].id;
check('promoting a submission creates a real audited record', () => {
  const promoted = forms.promoteSubmission(db, company, promoteId, 'agent', null);
  assert.equal(promoted.entity, 'crm_lead');
  assert.equal(promoted.state, 'promoted');
  assert.ok(db.prepare("SELECT 1 FROM x_records WHERE entity='crm_lead' AND id=?").get(promoted.record_id));
  assert.ok(db.prepare("SELECT 1 FROM x_audit WHERE entity='crm_lead' AND action='promoted_from_public_form'").get());
});
check('a promoted submission cannot be re-promoted', () => assert.throws(() => forms.promoteSubmission(db, company, promoteId, 'agent', null), (e) => e.code === 'FORM_STATE_INVALID'));
check('promotion is company-scoped', () => {
  db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-forms-other', 'Other');
  const sub = forms.listQuarantine(db, company, form.token);
  const pending = sub.length ? sub[0].id : forms.submitPublic(db, form.token, { name: 'E' }).id;
  assert.throws(() => forms.promoteSubmission(db, 'company-forms-other', pending, 'agent', null), (e) => e.code === 'COMPANY_SCOPE_DENIED');
});

for (const line of results) console.log(line);
console.log(`R5 PRINT+PUBLIC FORMS SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
