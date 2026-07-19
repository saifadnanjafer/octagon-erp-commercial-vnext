// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

export const migration = {
  id: '501_r1_kernel_completion',
  up(db) {
    // 1. Create tables for R1 Completion capabilities
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_acl_field_rules (
        role TEXT NOT NULL,
        entity TEXT NOT NULL,
        field TEXT NOT NULL,
        access TEXT NOT NULL,
        PRIMARY KEY (role, entity, field)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_doc_state_defs (
        entity TEXT PRIMARY KEY,
        definition TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_doc_states (
        entity TEXT NOT NULL,
        record_id TEXT NOT NULL,
        state TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (entity, record_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_approval_policies (
        entity TEXT PRIMARY KEY,
        policy_chain TEXT NOT NULL,
        authority_limit REAL NOT NULL DEFAULT 0.0
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_approval_delegations (
        user TEXT NOT NULL,
        delegate TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (user, delegate)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_api_keys (
        key_hash TEXT PRIMARY KEY,
        user TEXT NOT NULL,
        role TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_installed_modules (
        module TEXT PRIMARY KEY,
        active INTEGER NOT NULL DEFAULT 0,
        manifest TEXT NOT NULL
      ) STRICT;
    `);

    // 2. Add columns to x_records for state machine version and gapless hashing
    const addColumn = (table, col, def) => {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!info.some(c => c.name === col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      }
    };

    addColumn('x_records', 'version', 'INTEGER DEFAULT 1');
    addColumn('x_records', 'hash', 'TEXT');
    addColumn('x_records', 'prev_hash', 'TEXT');
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS x_installed_modules;
      DROP TABLE IF EXISTS x_api_keys;
      DROP TABLE IF EXISTS x_approval_delegations;
      DROP TABLE IF EXISTS x_approval_policies;
      DROP TABLE IF EXISTS x_doc_states;
      DROP TABLE IF EXISTS x_doc_state_defs;
      DROP TABLE IF EXISTS x_acl_field_rules;
    `);
    
    // SQLite doesn't require dropping columns in down migration as they do not break backwards compatibility
  }
};
