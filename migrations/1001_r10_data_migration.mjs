// R10.1 data-migration execution schema: run/step bookkeeping for idempotent,
// resumable migration jobs; a permanent source→target trace map (the
// traceability requirement: every migrated record resolves back to its legacy
// source id); per-step reconciliation reports; and the two-worlds discard log
// that records every W0 spike demo record deliberately dropped.
//
// No business data lives here — the canonical masters, GL, and stock ledger
// remain the only home for migrated content.
'use strict';

export const migration = {
  id: '1001_r10_data_migration',
  dependsOn: ['907_r9_marketplace_pack_distribution'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS migration_run (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        source_system      TEXT NOT NULL DEFAULT 'octagon-legacy-json',
        source_ref         TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        cut_date           TEXT NOT NULL,
        state              TEXT NOT NULL CHECK(state IN ('running', 'completed', 'failed')),
        started_at         TEXT NOT NULL,
        started_by         TEXT NOT NULL,
        finished_at        TEXT,
        error_code         TEXT,
        error_message      TEXT,
        UNIQUE(company_id, source_ref, cut_date)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS migration_step (
        id              TEXT PRIMARY KEY,
        run_id          TEXT NOT NULL REFERENCES migration_run(id) ON DELETE CASCADE,
        company_id      TEXT NOT NULL REFERENCES companies(company_id),
        step_key        TEXT NOT NULL,
        sequence        INTEGER NOT NULL,
        state           TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed')),
        source_count    INTEGER NOT NULL DEFAULT 0,
        migrated_count  INTEGER NOT NULL DEFAULT 0,
        linked_count    INTEGER NOT NULL DEFAULT 0,
        skipped_count   INTEGER NOT NULL DEFAULT 0,
        started_at      TEXT,
        finished_at     TEXT,
        error_code      TEXT,
        error_message   TEXT,
        UNIQUE(run_id, step_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_migration_step_run ON migration_step(run_id, sequence);

      CREATE TABLE IF NOT EXISTS migration_source_map (
        id                TEXT PRIMARY KEY,
        company_id        TEXT NOT NULL REFERENCES companies(company_id),
        run_id            TEXT NOT NULL REFERENCES migration_run(id) ON DELETE CASCADE,
        step_key          TEXT NOT NULL,
        source_system     TEXT NOT NULL DEFAULT 'octagon-legacy-json',
        source_collection TEXT NOT NULL,
        source_id         TEXT NOT NULL,
        target_entity     TEXT NOT NULL,
        target_id         TEXT,
        disposition       TEXT NOT NULL CHECK(disposition IN ('migrated', 'linked', 'reference_only', 'skipped')),
        skip_reason       TEXT,
        migrated_at       TEXT NOT NULL,
        UNIQUE(company_id, source_collection, source_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_migration_source_map_target ON migration_source_map(company_id, target_entity, target_id);
      CREATE INDEX IF NOT EXISTS idx_migration_source_map_run ON migration_source_map(run_id, step_key);

      CREATE TABLE IF NOT EXISTS migration_reconciliation (
        id           TEXT PRIMARY KEY,
        run_id       TEXT NOT NULL REFERENCES migration_run(id) ON DELETE CASCADE,
        company_id   TEXT NOT NULL REFERENCES companies(company_id),
        step_key     TEXT NOT NULL,
        metric       TEXT NOT NULL,
        source_value REAL,
        target_value REAL,
        delta        REAL,
        status       TEXT NOT NULL CHECK(status IN ('ok', 'mismatch', 'info')),
        detail       TEXT,
        computed_at  TEXT NOT NULL,
        UNIQUE(run_id, step_key, metric)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_migration_reconciliation_status ON migration_reconciliation(run_id, status);

      CREATE TABLE IF NOT EXISTS migration_discard_log (
        id            TEXT PRIMARY KEY,
        run_id        TEXT NOT NULL REFERENCES migration_run(id) ON DELETE CASCADE,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        target_entity TEXT NOT NULL,
        target_id     TEXT NOT NULL,
        payload       TEXT,
        reason        TEXT NOT NULL,
        discarded_at  TEXT NOT NULL,
        discarded_by  TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_migration_discard_run ON migration_discard_log(run_id, target_entity);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_migration_discard_run;
      DROP TABLE IF EXISTS migration_discard_log;
      DROP INDEX IF EXISTS idx_migration_reconciliation_status;
      DROP TABLE IF EXISTS migration_reconciliation;
      DROP INDEX IF EXISTS idx_migration_source_map_run;
      DROP INDEX IF EXISTS idx_migration_source_map_target;
      DROP TABLE IF EXISTS migration_source_map;
      DROP INDEX IF EXISTS idx_migration_step_run;
      DROP TABLE IF EXISTS migration_step;
      DROP TABLE IF EXISTS migration_run;
    `);
  },
};
