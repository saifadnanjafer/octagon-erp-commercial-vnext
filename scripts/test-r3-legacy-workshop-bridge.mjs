// clean-room; disposable proof for the frozen omni.jobOrders read-only bridge.
import assert from 'node:assert/strict';
import { createLegacyWorkshopBridge } from '../vnext/server/compat/LegacyWorkshopBridge.mjs';

const fixture = { omni: { jobOrders: [{ id: 'legacy-1', state: 'in_progress', total: 3 }, { id: 'legacy-2', state: 'done', total: 7 }] } };
const before = JSON.stringify(fixture.omni.jobOrders);
const bridge = createLegacyWorkshopBridge({ fixture });
assert.equal(bridge.mode, 'read-only');
assert.deepEqual(bridge.list(), fixture.omni.jobOrders);
assert.deepEqual(bridge.get('legacy-1'), fixture.omni.jobOrders[0]);
assert.equal(bridge.fingerprint(), bridge.sourceFingerprint);
assert.throws(() => bridge.mutate('legacy-1', { state: 'cancelled' }), /read-only/);
assert.equal(JSON.stringify(fixture.omni.jobOrders), before);
console.log('PASS legacy omni.jobOrders fixture list/get');
console.log('PASS legacy mutation rejected');
console.log('PASS legacy source fingerprint unchanged');
console.log('R3 LEGACY WORKSHOP BRIDGE SUITE: 3 PASS, 0 FAIL, 0 SKIP');
