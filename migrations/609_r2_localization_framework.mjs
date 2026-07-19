// T2.8.1 pack registry and reversible company installation state.
'use strict';

export const migration = {
  id: '609_r2_localization_framework',
  dependsOn: ['608_r2_arap_bank_reconciliation'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS localization_pack (
        pack_id TEXT PRIMARY KEY, version TEXT NOT NULL, display_name TEXT NOT NULL,
        manifest TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS localization_pack_entry (
        id TEXT PRIMARY KEY, pack_id TEXT NOT NULL REFERENCES localization_pack(pack_id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK(entry_type IN ('account','tax','term','fiscal_position')),
        entry_key TEXT NOT NULL, payload TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_localization_pack_entry_key ON localization_pack_entry(pack_id, entry_type, entry_key);
      CREATE TABLE IF NOT EXISTS company_localization (
        company_id TEXT NOT NULL REFERENCES companies(company_id), pack_id TEXT NOT NULL REFERENCES localization_pack(pack_id),
        version TEXT NOT NULL, installed_at TEXT NOT NULL, installed_by TEXT, PRIMARY KEY(company_id, pack_id)
      ) STRICT;
      INSERT OR IGNORE INTO localization_pack(pack_id, version, display_name, manifest, created_at)
        VALUES('l10n_iq', '1.0.0', 'Iraq localization (configurable)', '{"country":"IQ","configurable_rates":true,"frozen_zone_excluded":true}', datetime('now'));
      INSERT OR IGNORE INTO localization_pack_entry(id, pack_id, entry_type, entry_key, payload) VALUES
        ('l10n_iq_cash', 'l10n_iq', 'account', 'cash', '{"code":"101000","name_en":"Cash","name_ar":"الصندوق","type":"liquidity"}'),
        ('l10n_iq_bank', 'l10n_iq', 'account', 'bank', '{"code":"102000","name_en":"Bank","name_ar":"البنك","type":"liquidity"}'),
        ('l10n_iq_receivable', 'l10n_iq', 'account', 'receivable', '{"code":"103000","name_en":"Receivables","name_ar":"المدينون","type":"receivable"}'),
        ('l10n_iq_payable', 'l10n_iq', 'account', 'payable', '{"code":"201000","name_en":"Payables","name_ar":"الدائنون","type":"payable"}'),
        ('l10n_iq_vat', 'l10n_iq', 'tax', 'configurable_vat', '{"name_en":"Configurable VAT","name_ar":"ضريبة قابلة للتهيئة","amount_type":"percent","amount":0,"price_include":false,"type_tax_use":"sale","config_required":true}'),
        ('l10n_iq_terms', 'l10n_iq', 'term', 'invoice_title', '{"en":"Invoice","ar":"فاتورة"}');
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS company_localization; DROP TABLE IF EXISTS localization_pack_entry; DROP TABLE IF EXISTS localization_pack;');
  }
};
