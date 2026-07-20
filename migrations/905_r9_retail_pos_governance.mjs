// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.3 (proprietary self, not copied)
// R9.3 Retail/POS governance additions: canonical payment/AR linkage on ticket payments.
'use strict';

export const migration = {
  id: '905_r9_retail_pos_governance',
  dependsOn: ['904_r9_retail_pos_transactions'],
  up(db) {
    db.exec(`
      ALTER TABLE shop_retail_ticket_payment ADD COLUMN fiscal_doc_id TEXT;
      ALTER TABLE shop_retail_ticket_payment ADD COLUMN arap_document_id TEXT;
      ALTER TABLE shop_retail_ticket ADD COLUMN arap_document_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_retail_payment_fiscal ON shop_retail_ticket_payment(fiscal_doc_id);
      CREATE INDEX IF NOT EXISTS idx_retail_payment_arap ON shop_retail_ticket_payment(arap_document_id);
      CREATE INDEX IF NOT EXISTS idx_retail_ticket_arap ON shop_retail_ticket(arap_document_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_retail_ticket_arap;
      DROP INDEX IF EXISTS idx_retail_payment_arap;
      DROP INDEX IF EXISTS idx_retail_payment_fiscal;
      ALTER TABLE shop_retail_ticket DROP COLUMN arap_document_id;
      ALTER TABLE shop_retail_ticket_payment DROP COLUMN arap_document_id;
      ALTER TABLE shop_retail_ticket_payment DROP COLUMN fiscal_doc_id;
    `);
  }
};
