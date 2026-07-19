import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LegacyPayrollAdapter } from '../vnext/server/compat/LegacyPayrollAdapter.mjs';
import { LegacyEntityAdapter } from '../vnext/server/compat/LegacyEntityAdapter.mjs';
import { createLegacyFinanceBridge } from '../vnext/server/compat/LegacyFinanceBridge.mjs';

const fixturePath = path.resolve('vnext-fixtures/legacy-sanitized.db');
const digest = () => crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex');
const before = digest();
const payroll = new LegacyPayrollAdapter({ snapshotPath: fixturePath });
const [key] = payroll.listClosedMonthSummaryKeys();
assert.ok(key, 'fixture must provide a frozen closed-month legacy summary');
const viaAdapter = payroll.getClosedMonthSummary(key.employee_id, key.payroll_period_id);
assert.deepEqual(viaAdapter, payroll.store.goldenSummary(key.employee_id, key.payroll_period_id));

const entities = new LegacyEntityAdapter({ snapshotPath: fixturePath });
const employee = entities.list('employees')[0];
assert.ok(employee && employee.source === 'legacy-sanitized-fixture');
assert.deepEqual(entities.get('employees', employee.legacyId), employee);

const bridge = createLegacyFinanceBridge();
assert.equal(bridge.mode, 'read-only-interface');
assert.equal(typeof bridge.createPosting, 'undefined');
for (const subject of [payroll, entities, bridge]) {
  for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(subject)).concat(Object.keys(subject))) {
    assert.ok(!/create|update|delete|write|save|post|mutate/i.test(method), `mutating API exposed: ${method}`);
  }
}
payroll.close();
entities.close();
assert.equal(digest(), before, 'read-only adapters must not modify the fixture');
console.log(JSON.stringify({ status: 'pass', goldenSummary: 'matches frozen legacy output', mutationAttempt: 'API unavailable', fixtureSha256: before }, null, 2));
