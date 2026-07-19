// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.13 organization structures (proprietary self, not copied)
export const migration = {
  id: '401_r1_lane_d_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        company_id TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        currency   TEXT NOT NULL DEFAULT 'IQD',
        logo       TEXT,
        locale     TEXT NOT NULL DEFAULT 'ar',
        timezone   TEXT NOT NULL DEFAULT 'Asia/Baghdad'
      ) STRICT;

      CREATE TABLE IF NOT EXISTS branches (
        branch_id  TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name       TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS departments (
        department_id TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        name          TEXT NOT NULL,
        parent_id     TEXT REFERENCES departments(department_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS warehouses (
        warehouse_id TEXT PRIMARY KEY,
        company_id   TEXT NOT NULL REFERENCES companies(company_id),
        name         TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS locations (
        location_id  TEXT PRIMARY KEY,
        warehouse_id TEXT NOT NULL REFERENCES warehouses(warehouse_id),
        company_id   TEXT NOT NULL REFERENCES companies(company_id),
        name         TEXT NOT NULL,
        type         TEXT NOT NULL CHECK (type IN ('internal', 'supplier', 'customer', 'inventory_loss', 'production'))
      ) STRICT;

      CREATE TABLE IF NOT EXISTS currencies (
        code   TEXT PRIMARY KEY,
        name   TEXT NOT NULL,
        symbol TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS currency_rates (
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        currency_code TEXT NOT NULL REFERENCES currencies(code),
        rate          REAL NOT NULL,
        valid_from    TEXT NOT NULL,
        PRIMARY KEY (company_id, currency_code, valid_from)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS fiscal_periods (
        period_id  TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name       TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date   TEXT NOT NULL,
        status     TEXT NOT NULL CHECK (status IN ('open', 'closed', 'locked')) DEFAULT 'open'
      ) STRICT;
    `);

    // Migrate or copy r0_tenant_root content if any
    try {
      const rows = db.prepare('SELECT company_id, legal_name FROM r0_tenant_root').all();
      const insert = db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)');
      for (const row of rows) {
        insert.run(row.company_id, row.legal_name);
      }
    } catch (_) {}
  },
  down(db) {
    db.exec(`
      DROP TABLE fiscal_periods;
      DROP TABLE currency_rates;
      DROP TABLE currencies;
      DROP TABLE locations;
      DROP TABLE warehouses;
      DROP TABLE departments;
      DROP TABLE branches;
      DROP TABLE companies;
    `);
  }
};
