// R6.5 focused acceptance: disposable DB only. Proves booking resources,
// appointments, dynamic availability slot validation, double-booking prevention, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import book from '../vnext/server/modules/booking/booking-engine.js';
import { mountBookingRoutes } from '../vnext/server/modules/booking/booking-routes.js';
import arap from '../vnext/server/finance/arap-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r6-booking-'));
const dbPath = path.join(temp, 'r6-booking.db');
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
const partner = arap.createPartner(db, company, { id: 'partner-1', name: 'Partner 1', partner_type: 'customer' }, 'system');

// 1. Resources
const room1 = book.createResource(db, company, { id: 'res-room1', name: 'Meeting Room A', resource_type: 'room' }, 'system');
const consultant = book.createResource(db, company, { id: 'res-con1', name: 'Dr. Jane Smith', resource_type: 'person' }, 'system');

check('booking resources are created and retrieved under company scope', () => {
  assert.equal(room1.name, 'Meeting Room A');
  assert.equal(room1.resource_type, 'room');
  
  const list = book.listResources(db, company);
  assert.equal(list.length, 2);
  
  const retrieved = book.getResource(db, company, 'res-room1');
  assert.equal(retrieved.name, 'Meeting Room A');
  
  assert.throws(() => book.createResource(db, company, { name: '', resource_type: 'room' }), /resource name is required/);
  assert.throws(() => book.createResource(db, company, { name: 'Dr. Jane', resource_type: 'invalid_type' }), /invalid resource type/);
});

// 2. Bookings and Double-Booking Prevention
check('slot bookings and double-booking prevention work', () => {
  // Successful booking 10:00 to 11:30
  const booking1 = book.createBooking(db, company, {
    id: 'b-1',
    resource_id: 'res-con1',
    partner_id: 'partner-1',
    booking_date: '2026-07-20',
    start_time: '10:00',
    end_time: '11:30',
    notes: 'Consultation Session'
  }, 'system');
  
  assert.equal(booking1.start_time, '10:00');
  assert.equal(booking1.state, 'draft');
  
  // Overlapping booking at 09:30 to 10:30 (should throw collision)
  assert.throws(() => book.createBooking(db, company, {
    resource_id: 'res-con1',
    partner_id: 'partner-1',
    booking_date: '2026-07-20',
    start_time: '09:30',
    end_time: '10:30'
  }, 'system'), /resource is already booked during this time slot/);

  // Overlapping booking at 11:00 to 12:00 (should throw collision)
  assert.throws(() => book.createBooking(db, company, {
    resource_id: 'res-con1',
    partner_id: 'partner-1',
    booking_date: '2026-07-20',
    start_time: '11:00',
    end_time: '12:00'
  }, 'system'), /resource is already booked during this time slot/);

  // Non-overlapping booking 09:00 to 10:00 (exact touch at 10:00 is allowed)
  const booking2 = book.createBooking(db, company, {
    id: 'b-2',
    resource_id: 'res-con1',
    partner_id: 'partner-1',
    booking_date: '2026-07-20',
    start_time: '09:00',
    end_time: '10:00'
  }, 'system');
  assert.equal(booking2.state, 'draft');
});

// 3. Hourly slots availability lists
check('slots availability queries accurately report availability status', () => {
  // Dr. Jane has bookings:
  // - 09:00 to 10:00 (b-2)
  // - 10:00 to 11:30 (b-1)
  const slots = book.getAvailableSlots(db, company, 'res-con1', '2026-07-20');
  
  // Default slots:
  // 09:00 - 10:00 (should be unavailable)
  // 10:00 - 11:00 (should be unavailable because of b-1)
  // 11:00 - 12:00 (should be unavailable because of b-1 ending at 11:30)
  // 12:00 - 13:00 (should be available)
  assert.equal(slots.find(s => s.start === '09:00').available, false);
  assert.equal(slots.find(s => s.start === '10:00').available, false);
  assert.equal(slots.find(s => s.start === '11:00').available, false);
  assert.equal(slots.find(s => s.start === '12:00').available, true);
});

// 4. Confirm and Cancel state transitions
check('confirm and cancel state transitions work', () => {
  let booking = book.getBooking(db, company, 'b-1');
  assert.equal(booking.state, 'draft');
  
  // Confirm
  booking = book.updateBookingState(db, company, 'b-1', 'confirmed', 'system');
  assert.equal(booking.state, 'confirmed');
  
  // Cancel
  booking = book.updateBookingState(db, company, 'b-1', 'cancelled', 'system');
  assert.equal(booking.state, 'cancelled');
  
  // Once cancelled, updates are disabled
  assert.throws(() => book.updateBookingState(db, company, 'b-1', 'confirmed', 'system'), /cannot update a cancelled booking/);
});

// 5. Routes permissions and scoping
check('booking routes enforce scope and authorization', async () => {
  const routes = mountBookingRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-1', groups: ['booking-operator'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: (user, perm) => {
      // Operator only has booking:view permission
      return perm === 'booking:view';
    }
  });
  
  async function testRoute(method, pathname, bodyData = null) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    const processed = routes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET lists resources (requires view, allowed)
  const r1 = await testRoute('GET', '/api/x/booking/resources');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  
  // POST creates resource (requires manage, denied 403)
  const r2 = await testRoute('POST', '/api/x/booking/resources', { name: 'Room B', resource_type: 'room' });
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 403);
});

// 6. Rollback testing
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
try { db.prepare('DELETE FROM resource_booking').run(); } catch (_) {}
try { db.prepare('DELETE FROM booking_resource').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 635 down restores the booking schema boundary', () => {
  assert.ok(down.migrations.includes('635_r6_booking'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='resource_booking'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR6 BOOKING SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
