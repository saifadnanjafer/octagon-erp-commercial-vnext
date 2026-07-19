// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.3 (proprietary self, not copied)
//
// Lane A (R1 repair pass) completion migration. Supports:
//   T1.1.2 — no schema change required (updateRecord() ReferenceError fix
//            lives entirely in vnext/server/crud/crud-engine.js).
//   T1.1.3 — no schema change required (client UI reachability fix).
//   T1.3.1 — full-graph validation on state-def registration, and the
//            posted-document immutability guard. The `terminal`/`immutable`
//            flag itself is a *per-state* property and lives inside the
//            existing `x_doc_state_defs.definition` JSON blob
//            (`states: [{ name, terminal }]` — see
//            vnext/server/state/doc-state.js `stateName()`/`isTerminalEntry()`),
//            not a new column, since a single entity's lifecycle can have
//            both terminal and non-terminal states. What *does* need a
//            column is an audit trail of who registered/replaced a lifecycle
//            graph and when, added below.
export const migration = {
  id: '102_r1_lane_a_completion',
  // x_doc_state_defs is canonically owned/created by 501_r1_kernel_completion;
  // this migration only ALTERs it (adds updated_at/updated_by). Declaring the
  // dependency makes the migration-runner's topological order place 501
  // before this migration on a fresh database, instead of relying solely on
  // the CREATE TABLE IF NOT EXISTS commutative fallback below.
  dependsOn: ['501_r1_kernel_completion'],
  up(db) {
    // Migration filenames sort/run numerically (001, 101, 102, 201, ...), so
    // on a fresh database this migration runs BEFORE
    // 501_r1_kernel_completion.mjs, which is where x_doc_state_defs is
    // normally created. CREATE TABLE IF NOT EXISTS here makes the two
    // migrations commutative: whichever one runs first defines the table,
    // the other becomes a no-op. On a database where 501 already ran
    // historically (table exists with only entity/definition), the
    // addColumn() calls below top up the two new columns instead.
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_doc_state_defs (
        entity TEXT PRIMARY KEY,
        definition TEXT NOT NULL,
        updated_at TEXT,
        updated_by TEXT
      ) STRICT;
    `);

    const addColumn = (table, col, def) => {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!info.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      }
    };

    // Audit trail for the T1.3.1(a) registration gate: who last
    // registered/replaced a doc-state definition and when.
    addColumn('x_doc_state_defs', 'updated_at', 'TEXT');
    addColumn('x_doc_state_defs', 'updated_by', 'TEXT');
  },
  down(db) {
    // SQLite < 3.35 cannot DROP COLUMN without a full table rebuild;
    // consistent with 501_r1_kernel_completion.mjs's own down(), added
    // columns are left in place on rollback (additive, non-breaking — a
    // NULL updated_at/updated_by on old rows is harmless).
    void db;
  }
};
