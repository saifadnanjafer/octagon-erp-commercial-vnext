// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function asDate(value) { return String(value || now()).slice(0, 10); }

function createResource(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const row = {
    id: String(input.id || id('resource')),
    company_id: companyId,
    name: String(input.name || '').trim(),
    resource_type: String(input.resource_type || 'person').trim(),
    active: 1,
    created_at: now(),
    created_by: userId || null
  };
  
  if (!row.name) throw fail('resource name is required', 400, 'RESOURCE_NAME_REQUIRED');
  if (!['person', 'room', 'equipment', 'vehicle'].includes(row.resource_type)) {
    throw fail('invalid resource type', 400, 'RESOURCE_TYPE_INVALID');
  }
  
  db.prepare(`
    INSERT INTO booking_resource (id, company_id, name, resource_type, active, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.name, row.resource_type, row.active, row.created_at, row.created_by);
  
  return row;
}

function getResource(db, companyId, id) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM booking_resource WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!row) throw fail('resource not found', 404, 'RESOURCE_NOT_FOUND');
  return row;
}

function listResources(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM booking_resource WHERE company_id = ?').all(companyId);
}

function hasOverlap(db, companyId, resourceId, date, startTime, endTime, excludeBookingId = null) {
  let query = `
    SELECT 1 FROM resource_booking 
    WHERE company_id = ? AND resource_id = ? AND booking_date = ? AND state != 'cancelled'
      AND NOT (end_time <= ? OR start_time >= ?)
  `;
  const params = [companyId, resourceId, date, startTime, endTime];
  if (excludeBookingId) {
    query += ' AND id != ?';
    params.push(excludeBookingId);
  }
  const row = db.prepare(query).get(...params);
  return !!row;
}

function createBooking(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const resourceId = String(input.resource_id || '').trim();
  const partnerId = String(input.partner_id || '').trim();
  const date = asDate(input.booking_date);
  const startTime = String(input.start_time || '').trim(); // e.g. "09:00"
  const endTime = String(input.end_time || '').trim();     // e.g. "10:00"
  
  const resource = db.prepare('SELECT 1 FROM booking_resource WHERE id = ? AND company_id = ? AND active = 1').get(resourceId, companyId);
  if (!resource) throw fail('active booking resource not found', 404, 'RESOURCE_NOT_FOUND');
  
  const partner = db.prepare('SELECT 1 FROM partner_master WHERE id = ? AND company_id = ?').get(partnerId, companyId);
  if (!partner) throw fail('partner profile not found', 404, 'PARTNER_NOT_FOUND');
  
  if (!startTime || !endTime) throw fail('start and end times are required', 400, 'TIMES_REQUIRED');
  if (startTime >= endTime) throw fail('start time must be before end time', 400, 'INVALID_TIME_RANGE');
  
  // Double-booking check
  if (hasOverlap(db, companyId, resourceId, date, startTime, endTime)) {
    throw fail('resource is already booked during this time slot', 409, 'RESOURCE_DOUBLE_BOOKED');
  }
  
  const row = {
    id: String(input.id || id('booking')),
    company_id: companyId,
    resource_id: resourceId,
    partner_id: partnerId,
    booking_date: date,
    start_time: startTime,
    end_time: endTime,
    state: 'draft',
    notes: input.notes || null,
    created_at: now(),
    created_by: userId || null
  };
  
  db.prepare(`
    INSERT INTO resource_booking (id, company_id, resource_id, partner_id, booking_date, start_time, end_time, state, notes, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.resource_id, row.partner_id, row.booking_date, row.start_time, row.end_time, row.state, row.notes, row.created_at, row.created_by);
  
  recordWrite(db, null, companyId, 'resource_booking', row.id, 'create', userId, null, row);
  return row;
}

function getBooking(db, companyId, id) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM resource_booking WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!row) throw fail('booking not found', 404, 'BOOKING_NOT_FOUND');
  return row;
}

function listBookings(db, companyId, filters = {}) {
  ensureCompany(db, companyId);
  let query = 'SELECT * FROM resource_booking WHERE company_id = ?';
  const params = [companyId];
  
  if (filters.resource_id) {
    query += ' AND resource_id = ?';
    params.push(filters.resource_id);
  }
  if (filters.partner_id) {
    query += ' AND partner_id = ?';
    params.push(filters.partner_id);
  }
  if (filters.booking_date) {
    query += ' AND booking_date = ?';
    params.push(filters.booking_date);
  }
  
  return db.prepare(query).all(...params);
}

function updateBookingState(db, companyId, id, state, userId) {
  ensureCompany(db, companyId);
  if (!['confirmed', 'cancelled'].includes(state)) {
    throw fail('invalid booking state transition', 400, 'INVALID_STATE_TRANSITION');
  }
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const booking = db.prepare('SELECT * FROM resource_booking WHERE id = ? AND company_id = ?').get(id, companyId);
    if (!booking) throw fail('booking not found', 404, 'BOOKING_NOT_FOUND');
    if (booking.state === 'cancelled') throw fail('cannot update a cancelled booking', 409, 'BOOKING_CANCELLED');
    
    if (state === 'confirmed' && booking.state === 'draft') {
      // Re-verify overlap upon confirmation
      if (hasOverlap(db, companyId, booking.resource_id, booking.booking_date, booking.start_time, booking.end_time, booking.id)) {
        throw fail('resource is already booked during this time slot', 409, 'RESOURCE_DOUBLE_BOOKED');
      }
    }
    
    const before = { ...booking };
    db.prepare('UPDATE resource_booking SET state = ? WHERE id = ?').run(state, id);
    const after = db.prepare('SELECT * FROM resource_booking WHERE id = ?').get(id);
    
    recordWrite(db, null, companyId, 'resource_booking', id, `state_${state}`, userId, before, after);
    if (owns) db.exec('COMMIT');
    return after;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function getAvailableSlots(db, companyId, resourceId, date) {
  ensureCompany(db, companyId);
  const resource = db.prepare('SELECT 1 FROM booking_resource WHERE id = ? AND company_id = ? AND active = 1').get(resourceId, companyId);
  if (!resource) throw fail('active booking resource not found', 404, 'RESOURCE_NOT_FOUND');
  
  const bDate = asDate(date);
  // Default working hours: 09:00 to 17:00 (hourly slots)
  const defaultSlots = [
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' },
    { start: '11:00', end: '12:00' },
    { start: '12:00', end: '13:00' },
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' },
    { start: '16:00', end: '17:00' }
  ];
  
  const bookings = db.prepare(`
    SELECT start_time, end_time FROM resource_booking
    WHERE company_id = ? AND resource_id = ? AND booking_date = ? AND state != 'cancelled'
  `).all(companyId, resourceId, bDate);
  
  return defaultSlots.map(slot => {
    const booked = bookings.some(b => {
      return !(slot.end <= b.start_time || slot.start >= b.end_time);
    });
    return { ...slot, available: !booked };
  });
}

module.exports = {
  createResource: infra.atomicCommand(createResource),
  getResource,
  listResources,
  createBooking: infra.atomicCommand(createBooking),
  getBooking,
  listBookings,
  updateBookingState,
  getAvailableSlots
};
