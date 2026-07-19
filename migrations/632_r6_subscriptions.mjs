// R6.2 subscriptions & recurring billing + dunning. Plans, subscription lifecycle,
// per-period billing links (to R2.6 AR invoices), and a dunning-action ledger.
// Billing itself posts through the finance/arap engine — this schema stores only
// subscription state and links. Additive; down drops exactly these tables.
'use strict';

export const migration = {
  id: '632_r6_subscriptions',
  dependsOn: ['631_r6_pos_v2'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscription_plan (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name TEXT NOT NULL,
        interval TEXT NOT NULL CHECK (interval IN ('monthly','yearly')),
        amount REAL NOT NULL CHECK (amount >= 0),
        currency TEXT NOT NULL DEFAULT 'IQD',
        trial_days INTEGER NOT NULL DEFAULT 0,
        product_id TEXT REFERENCES product_master(id),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        created_by TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS subscription (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        partner_id TEXT NOT NULL REFERENCES partner_master(id),
        plan_id TEXT NOT NULL REFERENCES subscription_plan(id),
        state TEXT NOT NULL DEFAULT 'trial' CHECK (state IN ('trial','active','suspended','cancelled')),
        current_amount REAL NOT NULL DEFAULT 0,
        start_date TEXT NOT NULL,
        trial_end_date TEXT,
        next_bill_date TEXT NOT NULL,
        cancelled_at TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_subscription_company ON subscription (company_id, state);

      CREATE TABLE IF NOT EXISTS subscription_invoice (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        subscription_id TEXT NOT NULL REFERENCES subscription(id),
        period_key TEXT NOT NULL,
        arap_document_id TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoice_period ON subscription_invoice (subscription_id, period_key);

      CREATE TABLE IF NOT EXISTS subscription_change (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        subscription_id TEXT NOT NULL REFERENCES subscription(id),
        change_type TEXT NOT NULL,
        from_plan_id TEXT,
        to_plan_id TEXT,
        proration_amount REAL NOT NULL DEFAULT 0,
        effective_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS dunning_action (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        subscription_id TEXT REFERENCES subscription(id),
        arap_document_id TEXT NOT NULL,
        rung INTEGER NOT NULL,
        rung_name TEXT NOT NULL,
        days_overdue INTEGER NOT NULL,
        channel TEXT NOT NULL DEFAULT 'worklist',
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dunning_rung ON dunning_action (arap_document_id, rung);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_dunning_rung;
      DROP TABLE IF EXISTS dunning_action;
      DROP TABLE IF EXISTS subscription_change;
      DROP INDEX IF EXISTS idx_subscription_invoice_period;
      DROP TABLE IF EXISTS subscription_invoice;
      DROP INDEX IF EXISTS idx_subscription_company;
      DROP TABLE IF EXISTS subscription;
      DROP TABLE IF EXISTS subscription_plan;
    `);
  },
};
