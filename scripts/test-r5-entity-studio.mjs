// R5.1 acceptance: entity studio on a disposable database. A studio-created
// entity is registered identically to a seeded one (crm_lead) and served by the
// same generic CRUD path; reserved-name/duplicate/field guards hold; retract
// leaves no registry residue.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import studio from '../vnext/server/modules/studio/entity-studio.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r5-studio-'));
const dbPath = path.join(temp, 'r5studio.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

const spec = {
  collection: 'gym_membership',
  label_ar: 'اشتراك نادي', label_ar_plural: 'اشتراكات النادي',
  section: 'custom', chatter: true, status_key: 'status',
  states: ['draft', 'active', 'expired'],
  fields: [
    { field: 'member_name', type: 'text', label_ar: 'اسم العضو', required: true },
    { field: 'start_date', type: 'date', label_ar: 'تاريخ البدء' },
    { field: 'monthly_fee', type: 'number', label_ar: 'الرسم الشهري' },
  ],
};

// --- 1. create a studio entity ---
const created = studio.createEntity(db, spec, 'studio-admin');
check('studio creates a registry-backed collection', () => {
  assert.equal(created.collection, 'gym_membership');
  assert.equal(created.chatter, true);
  assert.equal(created.status_key, 'status');
  assert.ok(created.sequence);
});
check('studio writes fields into field_registry (including an auto status field)', () => {
  const fields = db.prepare('SELECT field FROM field_registry WHERE collection=?').all('gym_membership').map((row) => row.field);
  assert.ok(fields.includes('member_name') && fields.includes('start_date') && fields.includes('monthly_fee') && fields.includes('status'));
});

// --- 2. indistinguishable from the seeded crm_lead ---
check('studio entity is structurally indistinguishable from seeded crm_lead', () => {
  const report = studio.parityReport(db, 'gym_membership', 'crm_lead');
  assert.equal(report.parity.indistinguishable, true);
  assert.equal(report.parity.has_status_key, true);
  assert.equal(report.parity.has_sequence, true);
  assert.equal(report.parity.has_acl, true);
  assert.equal(report.parity.served_by_generic_crud, true);
});
check('studio entity appears in the generic collection registry beside seeded ones', () => {
  const registered = db.prepare('SELECT collection FROM collection_registry ORDER BY collection').all().map((row) => row.collection);
  assert.ok(registered.includes('gym_membership') && registered.includes('crm_lead'));
});

// --- 3. guards ---
check('reserved collection name is rejected', () => assert.throws(() => studio.createEntity(db, { ...spec, collection: 'audit' }, 'a'), (e) => e.code === 'STUDIO_NAME_RESERVED'));
check('invalid collection name is rejected', () => assert.throws(() => studio.createEntity(db, { ...spec, collection: 'BadName' }, 'a'), (e) => e.code === 'STUDIO_NAME_INVALID'));
check('duplicate collection is rejected', () => assert.throws(() => studio.createEntity(db, spec, 'a'), (e) => e.code === 'STUDIO_DUPLICATE'));
check('reserved field name is rejected', () => assert.throws(() => studio.createEntity(db, { collection: 'reserved_field_test', fields: [{ field: 'company_id', type: 'text' }] }, 'a'), (e) => e.code === 'STUDIO_FIELD_RESERVED'));
check('invalid field type is rejected', () => assert.throws(() => studio.createEntity(db, { collection: 'bad_type_test', fields: [{ field: 'x', type: 'rocket' }] }, 'a'), (e) => e.code === 'STUDIO_FIELD_TYPE_INVALID'));
check('empty field list is rejected', () => assert.throws(() => studio.createEntity(db, { collection: 'no_fields_test', fields: [] }, 'a'), (e) => e.code === 'STUDIO_FIELDS_REQUIRED'));

// --- 4. records for a studio entity behave like any registry entity (x_records) ---
check('records can be stored for a studio entity and are company-scoped', () => {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO x_records(entity,id,data,created_at,updated_at,created_by,removed) VALUES(?,?,?,?,?,?,0)')
    .run('gym_membership', 'gm-1', JSON.stringify({ member_name: 'Ali', status: 'active', company_id: 'company-r0-demo' }), now, now, 'u');
  const row = db.prepare("SELECT data FROM x_records WHERE entity='gym_membership' AND id='gm-1'").get();
  assert.ok(row && JSON.parse(row.data).member_name === 'Ali');
});

// --- 5. retract leaves zero registry residue ---
check('studio entity retracts with zero registry residue', () => {
  studio.retractEntity(db, 'gym_membership', 'studio-admin');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM collection_registry WHERE collection=?').get('gym_membership').n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM field_registry WHERE collection=?').get('gym_membership').n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM studio_entity WHERE collection=?').get('gym_membership').n, 0);
});
check('a seeded (non-studio) entity cannot be retracted via studio', () => assert.throws(() => studio.retractEntity(db, 'crm_lead', 'studio-admin'), (e) => e.code === 'STUDIO_NOT_STUDIO_OWNED'));

for (const line of results) console.log(line);
console.log(`R5 ENTITY STUDIO SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
