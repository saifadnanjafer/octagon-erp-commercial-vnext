// A6 remediation: live read-only legacy workshop bridge over the sanitized fixture.
// Proves list/get/search/filter, source id/timestamp/fingerprint, read-only
// rejection, unchanged source fingerprint, and that production paths are
// structurally unreachable (fixture jail).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createLegacyWorkshopLive } = require('../vnext/server/compat/legacy-workshop-live.js');

const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

const fixturePath = 'vnext-fixtures/legacy-sanitized.db';
const before = fs.readFileSync(fixturePath);
const bridge = createLegacyWorkshopLive({ fixturePath });

check('meta reports read-only mode, source file, timestamp, and per-collection fingerprints', () => {
  const meta = bridge.meta();
  assert.equal(meta.mode, 'read-only');
  assert.ok(meta.source_file.includes('legacy-sanitized.db'));
  assert.ok(meta.loaded_at);
  assert.ok(meta.collections.length >= 1);
  for (const entry of meta.collections) { assert.ok(entry.fingerprint.length === 64); assert.ok(entry.count >= 0); }
});

const timesheetCollection = 'omni.workshopTimesheetCases';
let firstId = null;
check('list returns decorated rows with source id, file, timestamp, fingerprint, and read_only flag', () => {
  const page = bridge.list(timesheetCollection, { limit: 5 });
  assert.ok(page.total >= 1);
  assert.equal(page.read_only, true);
  const row = page.rows[0];
  firstId = row.legacy_id;
  assert.equal(row.source, timesheetCollection);
  assert.ok(row.source_file.includes('legacy-sanitized.db'));
  assert.ok(row.source_loaded_at);
  assert.equal(row.source_fingerprint.length, 64);
  assert.equal(row.read_only, true);
  assert.ok(row.attributes && typeof row.attributes === 'object');
});

check('get returns a single decorated record by legacy id', () => {
  const row = bridge.get(timesheetCollection, firstId);
  assert.equal(row.legacy_id, firstId);
  assert.equal(row.read_only, true);
});
check('get on a missing id returns 404', () => {
  assert.throws(() => bridge.get(timesheetCollection, 'no-such-legacy-id'), (error) => error.statusCode === 404);
});

check('search narrows the result set', () => {
  const all = bridge.list(timesheetCollection, { limit: 200 });
  const term = String(all.rows[0].legacy_id);
  const filtered = bridge.list(timesheetCollection, { search: term, limit: 200 });
  assert.ok(filtered.total >= 1);
  assert.ok(filtered.total <= all.total);
});

check('attribute filter narrows deterministically', () => {
  const all = bridge.list(timesheetCollection, { limit: 200 });
  const sample = all.rows.find((row) => Object.keys(row.attributes).length);
  const key = Object.keys(sample.attributes)[0];
  const value = sample.attributes[key];
  const filtered = bridge.list(timesheetCollection, { [key]: value, limit: 200 });
  assert.ok(filtered.rows.every((row) => String(row.attributes[key] ?? '') === String(value)));
});

check('unknown collection is rejected with 404', () => {
  assert.throws(() => bridge.list('omni.notARealCollection'), (error) => error.statusCode === 404);
});

check('any mutation attempt is rejected read-only (405)', () => {
  assert.throws(() => bridge.mutate(timesheetCollection, firstId, { state: 'changed' }), (error) => error.statusCode === 405 && /read-only/i.test(error.message));
});

check('re-verifying fingerprints is stable across reads', () => {
  const first = bridge.verifyFingerprints();
  const second = bridge.verifyFingerprints();
  assert.deepEqual(first, second);
});

check('source fixture file bytes are unchanged after all reads', () => {
  const after = fs.readFileSync(fixturePath);
  assert.ok(before.equals(after), 'legacy fixture file changed');
});

check('production paths are structurally unreachable (fixture jail)', () => {
  assert.throws(() => createLegacyWorkshopLive({ fixturePath: '../octagon-erp/database.db' }).meta(), /sanitized fixture|not found|Legacy access/i);
  assert.throws(() => createLegacyWorkshopLive({ fixturePath: 'C:/Windows/System32/config/SAM' }).meta(), /sanitized fixture|not found|Legacy access/i);
});

for (const line of results) console.log(line);
console.log(`R3 LEGACY WORKSHOP LIVE SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
