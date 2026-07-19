// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

export const migration = {
  id: '604_r2_accounting_dimensions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dimension (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(company_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS dimension_value (
        id           TEXT PRIMARY KEY,
        dimension_id TEXT NOT NULL REFERENCES dimension(id) ON DELETE CASCADE,
        code         TEXT NOT NULL,
        name         TEXT NOT NULL,
        parent_id    TEXT REFERENCES dimension_value(id)
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_dimension_value_code ON dimension_value (dimension_id, code);

      CREATE TABLE IF NOT EXISTS account_dimension_policy (
        id           TEXT PRIMARY KEY,
        account_id   TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
        dimension_id TEXT NOT NULL REFERENCES dimension(id) ON DELETE CASCADE,
        policy       TEXT NOT NULL CHECK (policy IN ('required', 'blocked'))
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_account_dim_policy ON account_dimension_policy (account_id, dimension_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS account_dimension_policy;
      DROP TABLE IF EXISTS dimension_value;
      DROP TABLE IF EXISTS dimension;
    `);
  }
};
