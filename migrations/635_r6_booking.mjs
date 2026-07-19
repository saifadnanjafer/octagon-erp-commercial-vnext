// R6.5 Appointments & Resource Booking Schema.
'use strict';

export const migration = {
  id: '635_r6_booking',
  dependsOn: ['634_r6_portal'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS booking_resource (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        name          TEXT NOT NULL,
        resource_type TEXT NOT NULL CHECK(resource_type IN ('person', 'room', 'equipment', 'vehicle')),
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL,
        created_by    TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS resource_booking (
        id           TEXT PRIMARY KEY,
        company_id   TEXT NOT NULL REFERENCES companies(company_id),
        resource_id  TEXT NOT NULL REFERENCES booking_resource(id),
        partner_id   TEXT NOT NULL REFERENCES partner_master(id),
        booking_date TEXT NOT NULL,
        start_time   TEXT NOT NULL,
        end_time     TEXT NOT NULL,
        state        TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft', 'confirmed', 'cancelled')),
        notes        TEXT,
        created_at   TEXT NOT NULL,
        created_by   TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_booking_schedule ON resource_booking(company_id, resource_id, booking_date);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS resource_booking;
      DROP TABLE IF EXISTS booking_resource;
    `);
  }
};
