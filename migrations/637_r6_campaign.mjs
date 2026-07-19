// R6.7 Omni-Communications & Campaign Engine Schema.
'use strict';

export const migration = {
  id: '637_r6_campaign',
  dependsOn: ['636_r6_ecommerce'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS omni_campaign (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        name          TEXT NOT NULL,
        channel       TEXT NOT NULL CHECK(channel IN ('whatsapp', 'email', 'sms')),
        template_body TEXT NOT NULL,
        state         TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft', 'scheduled', 'running', 'completed')),
        created_at    TEXT NOT NULL,
        created_by    TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS omni_message_log (
        id             TEXT PRIMARY KEY,
        company_id     TEXT NOT NULL REFERENCES companies(company_id),
        campaign_id    TEXT REFERENCES omni_campaign(id) ON DELETE SET NULL,
        partner_id     TEXT REFERENCES partner_master(id) ON DELETE SET NULL,
        recipient      TEXT NOT NULL,
        body           TEXT NOT NULL,
        direction      TEXT NOT NULL DEFAULT 'outbound' CHECK(direction IN ('inbound', 'outbound')),
        delivery_state TEXT NOT NULL DEFAULT 'sent' CHECK(delivery_state IN ('sent', 'delivered', 'failed', 'read')),
        sent_at        TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_omni_message_campaign ON omni_message_log(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_omni_message_recipient ON omni_message_log(company_id, recipient);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS omni_message_log;
      DROP TABLE IF EXISTS omni_campaign;
    `);
  }
};
