// R5.4 template-print library & public forms. Print templates are versioned;
// each render stores an immutable snapshot so later template edits never mutate
// archived prints. Public forms accept unauthenticated token submissions into a
// quarantine inbox (rate-limited) that a user promotes. Additive schema.
'use strict';

export const migration = {
  id: '629_r5_print_public_forms',
  dependsOn: ['628_r5_report_designer'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS print_template (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        entity TEXT NOT NULL,
        name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        body TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_print_template_ver ON print_template (company_id, entity, name, version);

      CREATE TABLE IF NOT EXISTS print_render (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        template_id TEXT NOT NULL REFERENCES print_template(id),
        template_version INTEGER NOT NULL,
        record_id TEXT NOT NULL,
        rendered_snapshot TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS public_form (
        token TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        target_entity TEXT NOT NULL,
        name TEXT NOT NULL,
        rate_limit_per_hour INTEGER NOT NULL DEFAULT 20,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS public_submission (
        id TEXT PRIMARY KEY,
        form_token TEXT NOT NULL REFERENCES public_form(token),
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        payload_json TEXT NOT NULL,
        source_ip TEXT,
        state TEXT NOT NULL DEFAULT 'quarantined',
        promoted_record_id TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_public_submission_form ON public_submission (form_token, created_at);
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS public_submission; DROP TABLE IF EXISTS public_form; DROP TABLE IF EXISTS print_render; DROP INDEX IF EXISTS idx_print_template_ver; DROP TABLE IF EXISTS print_template;');
  },
};
