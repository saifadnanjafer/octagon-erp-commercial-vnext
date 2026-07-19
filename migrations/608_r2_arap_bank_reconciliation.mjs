// T2.6.1/T2.6.2 relational foundation. No runtime DDL.
'use strict';

export const migration = {
  id: '608_r2_arap_bank_reconciliation',
  dependsOn: ['607_t2_o10_connectivity_foundation'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_master (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id),
        code TEXT NOT NULL, name TEXT NOT NULL, income_account_id TEXT REFERENCES account(id),
        expense_account_id TEXT REFERENCES account(id), active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_master_company_code ON product_master(company_id, code);

      CREATE TABLE IF NOT EXISTS partner_master (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id),
        name TEXT NOT NULL, partner_type TEXT NOT NULL CHECK(partner_type IN ('customer','supplier','both')),
        receivable_account_id TEXT REFERENCES account(id), payable_account_id TEXT REFERENCES account(id),
        currency TEXT NOT NULL DEFAULT 'IQD', active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS arap_document (
        id TEXT PRIMARY KEY, fiscal_doc_id TEXT NOT NULL UNIQUE REFERENCES fiscal_doc(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES companies(company_id), partner_id TEXT NOT NULL REFERENCES partner_master(id),
        document_kind TEXT NOT NULL CHECK(document_kind IN ('customer_invoice','customer_credit_note','supplier_bill','supplier_debit_note')),
        due_date TEXT NOT NULL, total_amount REAL NOT NULL CHECK(total_amount >= 0), currency TEXT NOT NULL,
        created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_arap_document_open ON arap_document(company_id, partner_id, due_date);

      CREATE TABLE IF NOT EXISTS payment (
        id TEXT PRIMARY KEY, fiscal_doc_id TEXT NOT NULL UNIQUE REFERENCES fiscal_doc(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES companies(company_id), partner_id TEXT NOT NULL REFERENCES partner_master(id),
        payment_type TEXT NOT NULL CHECK(payment_type IN ('receive','pay')), payment_date TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0), currency TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES account(id),
        status TEXT NOT NULL CHECK(status IN ('draft','posted','cancelled')), idempotency_key TEXT NOT NULL UNIQUE,
        reference TEXT, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_payment_scope ON payment(company_id, partner_id, payment_date);

      CREATE TABLE IF NOT EXISTS payment_allocation (
        id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payment(id) ON DELETE CASCADE,
        arap_document_id TEXT NOT NULL REFERENCES arap_document(id), company_id TEXT NOT NULL REFERENCES companies(company_id),
        amount REAL NOT NULL CHECK(amount > 0), currency TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_payment_allocation_doc ON payment_allocation(arap_document_id);

      CREATE TABLE IF NOT EXISTS bank_account (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id),
        name TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES account(id), currency TEXT NOT NULL DEFAULT 'IQD',
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS bank_statement (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), bank_account_id TEXT NOT NULL REFERENCES bank_account(id),
        statement_date TEXT NOT NULL, opening_balance REAL NOT NULL DEFAULT 0, closing_balance REAL,
        import_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reconciled','reversed')),
        created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS bank_statement_line (
        id TEXT PRIMARY KEY, statement_id TEXT NOT NULL REFERENCES bank_statement(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES companies(company_id), line_number INTEGER NOT NULL,
        transaction_date TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, description TEXT,
        external_id TEXT, line_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unmatched' CHECK(status IN ('unmatched','matched','reconciled','reversed')),
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_line_hash ON bank_statement_line(company_id, line_hash);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statement_line_number ON bank_statement_line(statement_id, line_number);

      CREATE TABLE IF NOT EXISTS bank_match_rule (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), name TEXT NOT NULL,
        description_pattern TEXT, amount_tolerance REAL NOT NULL DEFAULT 0, target_account_id TEXT REFERENCES account(id),
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS bank_reconciliation (
        id TEXT PRIMARY KEY, statement_line_id TEXT NOT NULL REFERENCES bank_statement_line(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES companies(company_id), target_type TEXT NOT NULL CHECK(target_type IN ('payment','fiscal_doc','difference')),
        target_id TEXT NOT NULL, amount REAL NOT NULL CHECK(amount > 0), method TEXT NOT NULL CHECK(method IN ('exact','tolerance','manual','difference')),
        status TEXT NOT NULL DEFAULT 'reconciled' CHECK(status IN ('reconciled','reversed')), created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_reconciliation_active_target ON bank_reconciliation(statement_line_id, target_type, target_id, status);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS bank_reconciliation;
      DROP TABLE IF EXISTS bank_match_rule;
      DROP TABLE IF EXISTS bank_statement_line;
      DROP TABLE IF EXISTS bank_statement;
      DROP TABLE IF EXISTS bank_account;
      DROP TABLE IF EXISTS payment_allocation;
      DROP TABLE IF EXISTS payment;
      DROP TABLE IF EXISTS arap_document;
      DROP TABLE IF EXISTS partner_master;
      DROP TABLE IF EXISTS product_master;
    `);
  }
};
