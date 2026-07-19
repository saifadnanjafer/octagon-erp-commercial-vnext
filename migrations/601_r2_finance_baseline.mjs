// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

export const migration = {
  id: '601_r2_finance_baseline',
  up(db) {
    // 1. Create finance tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS account (
        id          TEXT PRIMARY KEY,
        company_id  TEXT NOT NULL REFERENCES companies(company_id),
        code        TEXT NOT NULL,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense', 'receivable', 'payable', 'liquidity', 'off_balance')),
        parent_id   TEXT REFERENCES account(id),
        created_at  TEXT NOT NULL,
        updated_at  TEXT,
        created_by  TEXT,
        removed     INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_account_company_code ON account (company_id, code);
      CREATE INDEX IF NOT EXISTS idx_account_company ON account (company_id);

      CREATE TABLE IF NOT EXISTS fiscal_doc (
        id             TEXT PRIMARY KEY,
        company_id     TEXT NOT NULL REFERENCES companies(company_id),
        doc_number     TEXT UNIQUE,
        move_type      TEXT NOT NULL CHECK (move_type IN ('manual_entry', 'sales_invoice', 'sales_refund', 'purchase_invoice', 'purchase_refund', 'cash_receipt', 'cash_payment', 'stock_valuation', 'tax_adjustment', 'period_close')),
        partner_id     TEXT,
        doc_date       TEXT NOT NULL,
        post_date      TEXT,
        currency       TEXT NOT NULL DEFAULT 'IQD',
        state          TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'posted', 'cancelled')),
        reversal_of_id TEXT REFERENCES fiscal_doc(id),
        created_at     TEXT NOT NULL,
        updated_at     TEXT,
        created_by     TEXT,
        removed        INTEGER NOT NULL DEFAULT 0,
        hash           TEXT,
        prev_hash      TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_fiscal_doc_company ON fiscal_doc (company_id);
      CREATE INDEX IF NOT EXISTS idx_fiscal_doc_date ON fiscal_doc (doc_date);

      CREATE TABLE IF NOT EXISTS fiscal_doc_line (
        id               TEXT PRIMARY KEY,
        fiscal_doc_id    TEXT NOT NULL REFERENCES fiscal_doc(id) ON DELETE CASCADE,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        account_id       TEXT NOT NULL REFERENCES account(id),
        debit            REAL NOT NULL DEFAULT 0.0 CHECK (debit >= 0.0),
        credit           REAL NOT NULL DEFAULT 0.0 CHECK (credit >= 0.0),
        currency_code    TEXT,
        currency_debit   REAL DEFAULT 0.0 CHECK (currency_debit >= 0.0),
        currency_credit  REAL DEFAULT 0.0 CHECK (currency_credit >= 0.0),
        tax_refs         TEXT,
        dims             TEXT,
        snapshot         TEXT,
        description      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT,
        created_by       TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_fiscal_doc_line_doc ON fiscal_doc_line (fiscal_doc_id);

      CREATE TABLE IF NOT EXISTS gl_line (
        id                  TEXT PRIMARY KEY,
        company_id          TEXT NOT NULL REFERENCES companies(company_id),
        fiscal_doc_id       TEXT NOT NULL REFERENCES fiscal_doc(id),
        fiscal_doc_line_id  TEXT NOT NULL REFERENCES fiscal_doc_line(id),
        account_id          TEXT NOT NULL REFERENCES account(id),
        posting_date        TEXT NOT NULL,
        debit               REAL NOT NULL CHECK (debit >= 0.0),
        credit              REAL NOT NULL CHECK (credit >= 0.0),
        currency_code       TEXT,
        currency_debit      REAL CHECK (currency_debit >= 0.0),
        currency_credit     REAL CHECK (currency_credit >= 0.0),
        dims                TEXT,
        created_at          TEXT NOT NULL,
        created_by          TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_gl_line_company_account ON gl_line (company_id, account_id);
      CREATE INDEX IF NOT EXISTS idx_gl_line_doc ON gl_line (fiscal_doc_id);

      -- Triggers enforcing immutability of general ledger entries
      CREATE TRIGGER IF NOT EXISTS t_gl_line_no_update BEFORE UPDATE ON gl_line
      BEGIN
        SELECT RAISE(FAIL, 'Updates not allowed on append-only GL lines');
      END;

      CREATE TRIGGER IF NOT EXISTS t_gl_line_no_delete BEFORE DELETE ON gl_line
      BEGIN
        SELECT RAISE(FAIL, 'Deletes not allowed on append-only GL lines');
      END;
    `);

    // 2. Seed standard Chart of Accounts for company-r0-demo
    db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run('company-r0-demo', 'R0 Demonstration Company');

    const coa = [
      ['coa_100000', '100000', 'Assets / الأصول', 'asset', null],
      ['coa_101000', '101000', 'Cash / الصندوق', 'liquidity', 'coa_100000'],
      ['coa_102000', '102000', 'Bank / البنك', 'liquidity', 'coa_100000'],
      ['coa_103000', '103000', 'Receivables / المدينون', 'receivable', 'coa_100000'],
      ['coa_104000', '104000', 'Stock Valuation / تقييم المخزون', 'asset', 'coa_100000'],
      ['coa_200000', '200000', 'Liabilities / الالتزامات', 'liability', null],
      ['coa_201000', '201000', 'Payables / الدائنون', 'payable', 'coa_200000'],
      ['coa_202000', '202000', 'VAT Payable / ضريبة القيمة المضافة المستحقة', 'liability', 'coa_200000'],
      ['coa_300000', '300000', 'Equity / حقوق الملكية', 'equity', null],
      ['coa_301000', '301000', 'Retained Earnings / الأرباح المحتجزة', 'equity', 'coa_300000'],
      ['coa_400000', '400000', 'Income / الإيرادات', 'income', null],
      ['coa_401000', '401000', 'Sales / المبيعات', 'income', 'coa_400000'],
      ['coa_500000', '500000', 'Expenses / المصاريف', 'expense', null],
      ['coa_501000', '501000', 'Cost of Goods Sold / كلفة المبيعات', 'expense', 'coa_500000'],
      ['coa_502000', '502000', 'General Expenses / المصاريف العمومية', 'expense', 'coa_500000'],
    ];

    const insertAccount = db.prepare('INSERT OR IGNORE INTO account (id, company_id, code, name, type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const nowIso = new Date().toISOString();
    for (const entry of coa) {
      insertAccount.run(entry[0], 'company-r0-demo', entry[1], entry[2], entry[3], entry[4], nowIso);
    }

    // 3. Seed open fiscal periods for 2026
    const insertPeriod = db.prepare('INSERT OR IGNORE INTO fiscal_periods (period_id, company_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)');
    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0');
      const periodId = `2026-${mStr}`;
      const name = `Period 2026-${mStr} / فترة 2026-${mStr}`;
      const startDate = `2026-${mStr}-01`;
      const endDate = new Date(Date.UTC(2026, m, 0)).toISOString().split('T')[0];
      insertPeriod.run(periodId, 'company-r0-demo', name, startDate, endDate, 'open');
    }

    // 4. Seed sequences counters
    const seqs = [
      'manual_entry', 'sales_invoice', 'sales_refund', 'purchase_invoice',
      'purchase_refund', 'cash_receipt', 'cash_payment', 'stock_valuation',
      'tax_adjustment', 'period_close'
    ];
    const insertSeq = db.prepare('INSERT OR IGNORE INTO x_sequences (seq_key, next_number, year, month, updated_at) VALUES (?, 1, ?, ?, ?)');
    const now = new Date();
    for (const seq of seqs) {
      insertSeq.run(seq, now.getFullYear(), now.getMonth() + 1, nowIso);
    }
  },
  down(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS t_gl_line_no_delete;
      DROP TRIGGER IF EXISTS t_gl_line_no_update;
      DROP TABLE IF EXISTS gl_line;
      DROP TABLE IF EXISTS fiscal_doc_line;
      DROP TABLE IF EXISTS fiscal_doc;
      DROP TABLE IF EXISTS account;
    `);
  }
};
