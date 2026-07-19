// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.4 numbering & audit (proprietary self, not copied)
export const migration = {
  id: '301_r1_lane_c_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_sequences (
        seq_key     TEXT PRIMARY KEY,
        next_number INTEGER NOT NULL DEFAULT 1,
        year        INTEGER,
        month       INTEGER,
        updated_at  TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_notifications (
        id         TEXT PRIMARY KEY,
        user       TEXT NOT NULL,
        title      TEXT,
        body       TEXT,
        link       TEXT,
        read       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_x_notifications_user ON x_notifications (user, read);

      CREATE TABLE IF NOT EXISTS x_audit (
        id        TEXT PRIMARY KEY,
        entity    TEXT NOT NULL,
        record_id TEXT NOT NULL,
        user      TEXT,
        action    TEXT NOT NULL,
        before    TEXT,
        after     TEXT,
        at        TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_x_audit_record ON x_audit (entity, record_id);

      CREATE TABLE IF NOT EXISTS x_custom_fields (
        entity   TEXT NOT NULL,
        key      TEXT NOT NULL,
        label_ar TEXT,
        type     TEXT NOT NULL DEFAULT 'text',
        options  TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (entity, key)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE x_custom_fields;
      DROP TABLE x_audit;
      DROP TABLE x_notifications;
      DROP TABLE x_sequences;
    `);
  }
};
