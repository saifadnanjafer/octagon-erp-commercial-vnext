// R6.3 Unified Loyalty & Membership Engine Schema.
'use strict';

export const migration = {
  id: '633_r6_loyalty',
  dependsOn: ['632_r6_subscriptions'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS loyalty_program (
        id                  TEXT PRIMARY KEY,
        company_id          TEXT NOT NULL REFERENCES companies(company_id),
        name                TEXT NOT NULL,
        program_type        TEXT NOT NULL CHECK(program_type IN ('points', 'tiers', 'gift_card', 'ewallet')),
        points_ratio_earn   REAL NOT NULL DEFAULT 0,
        points_ratio_redeem REAL NOT NULL DEFAULT 0,
        expiry_months       INTEGER NOT NULL DEFAULT 0,
        active              INTEGER NOT NULL DEFAULT 1,
        created_at          TEXT NOT NULL,
        created_by          TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS loyalty_card (
        id          TEXT PRIMARY KEY,
        company_id  TEXT NOT NULL REFERENCES companies(company_id),
        partner_id  TEXT NOT NULL REFERENCES partner_master(id),
        program_id  TEXT NOT NULL REFERENCES loyalty_program(id),
        card_number TEXT NOT NULL,
        tier        TEXT NOT NULL DEFAULT 'standard',
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        created_by  TEXT,
        UNIQUE(company_id, card_number)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        card_id       TEXT NOT NULL REFERENCES loyalty_card(id),
        points        REAL NOT NULL,
        reference_doc TEXT,
        expiry_date   TEXT,
        created_at    TEXT NOT NULL,
        created_by    TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_loyalty_points_card ON loyalty_points_ledger(card_id);

      CREATE TABLE IF NOT EXISTS gift_card (
        id             TEXT PRIMARY KEY,
        company_id     TEXT NOT NULL REFERENCES companies(company_id),
        card_code      TEXT NOT NULL,
        initial_amount REAL NOT NULL CHECK(initial_amount >= 0),
        current_amount REAL NOT NULL CHECK(current_amount >= 0),
        expiry_date    TEXT,
        state          TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active', 'expired', 'exhausted')),
        created_at     TEXT NOT NULL,
        created_by     TEXT,
        UNIQUE(company_id, card_code)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS gift_card_transaction (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        gift_card_id  TEXT NOT NULL REFERENCES gift_card(id),
        amount        REAL NOT NULL,
        reference_doc TEXT,
        created_at    TEXT NOT NULL,
        created_by    TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS ewallet_transaction (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        partner_id    TEXT NOT NULL REFERENCES partner_master(id),
        amount        REAL NOT NULL,
        reference_doc TEXT,
        created_at    TEXT NOT NULL,
        created_by    TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ewallet_partner ON ewallet_transaction(company_id, partner_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS ewallet_transaction;
      DROP TABLE IF EXISTS gift_card_transaction;
      DROP TABLE IF EXISTS gift_card;
      DROP TABLE IF EXISTS loyalty_points_ledger;
      DROP TABLE IF EXISTS loyalty_card;
      DROP TABLE IF EXISTS loyalty_program;
    `);
  }
};
