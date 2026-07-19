// R5.5 HR-additive suite (frozen-safe). VNext-only HR entities: leave v2 with an
// accrual DSL, recruitment ATS, skills, expense claims, and dated HR-field
// versioning. NOTHING here writes attendance/payroll (frozen). Additive schema
// under the hr_v2_* namespace; down drops exactly these tables.
'use strict';

export const migration = {
  id: '630_r5_hr_additive',
  dependsOn: ['629_r5_print_public_forms'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hr_v2_leave_type (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name TEXT NOT NULL,
        accrual_json TEXT NOT NULL DEFAULT '{}',
        max_carryover REAL NOT NULL DEFAULT 0,
        requires_approval INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hr_v2_leave_allocation (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        employee_ref TEXT NOT NULL,
        leave_type_id TEXT NOT NULL REFERENCES hr_v2_leave_type(id),
        granted_days REAL NOT NULL DEFAULT 0,
        used_days REAL NOT NULL DEFAULT 0,
        period TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hr_v2_leave_request (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        employee_ref TEXT NOT NULL,
        leave_type_id TEXT NOT NULL REFERENCES hr_v2_leave_type(id),
        days REAL NOT NULL,
        state TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hr_v2_job (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        title TEXT NOT NULL,
        stages_json TEXT NOT NULL DEFAULT '[]',
        state TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hr_v2_application (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        job_id TEXT NOT NULL REFERENCES hr_v2_job(id),
        candidate_name TEXT NOT NULL,
        stage TEXT NOT NULL,
        refuse_reason TEXT,
        state TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hr_v2_expense_claim (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        employee_ref TEXT NOT NULL,
        partner_id TEXT,
        amount REAL NOT NULL,
        description TEXT,
        state TEXT NOT NULL DEFAULT 'draft',
        reimbursement_doc_id TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS hr_v2_employee_version (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        employee_ref TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        fields_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_hr_v2_emp_version ON hr_v2_employee_version (company_id, employee_ref, effective_date);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_hr_v2_emp_version;
      DROP TABLE IF EXISTS hr_v2_employee_version;
      DROP TABLE IF EXISTS hr_v2_expense_claim;
      DROP TABLE IF EXISTS hr_v2_application;
      DROP TABLE IF EXISTS hr_v2_job;
      DROP TABLE IF EXISTS hr_v2_leave_request;
      DROP TABLE IF EXISTS hr_v2_leave_allocation;
      DROP TABLE IF EXISTS hr_v2_leave_type;
    `);
  },
};
