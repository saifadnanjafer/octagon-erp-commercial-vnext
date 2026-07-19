// R5.3 report designer & dashboards: saved queries and dashboard widgets.
// The query DEFINITION is data; execution compiles it to parameterized, company-
// scoped SQL against an allow-listed set of queryable sources (report-engine).
// Additive schema; down drops exactly these tables.
'use strict';

export const migration = {
  id: '628_r5_report_designer',
  dependsOn: ['627_r5_formula_fields'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_query (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_saved_query_company ON saved_query (company_id);

      CREATE TABLE IF NOT EXISTS dashboard (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'user',
        owner TEXT,
        tv_mode INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS dashboard_widget (
        id TEXT PRIMARY KEY,
        dashboard_id TEXT NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        saved_query_id TEXT NOT NULL REFERENCES saved_query(id),
        widget_type TEXT NOT NULL DEFAULT 'table',
        title TEXT,
        position INTEGER NOT NULL DEFAULT 0
      ) STRICT;
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS dashboard_widget; DROP TABLE IF EXISTS dashboard; DROP INDEX IF EXISTS idx_saved_query_company; DROP TABLE IF EXISTS saved_query;');
  },
};
