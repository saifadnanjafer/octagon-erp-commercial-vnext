// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

export const migration = {
  id: '602_r2_period_locks',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS company_lock_dates (
        company_id      TEXT PRIMARY KEY REFERENCES companies(company_id),
        gl_lock_date    TEXT, -- YYYY-MM-DD
        stock_lock_date TEXT, -- YYYY-MM-DD
        updated_at      TEXT NOT NULL,
        updated_by      TEXT NOT NULL
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS company_lock_dates;
    `);
  }
};
