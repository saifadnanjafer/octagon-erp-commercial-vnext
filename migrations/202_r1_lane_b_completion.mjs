// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.6/R1.9 completion gaps (proprietary self, not copied)
// Lane B completion migration: approval escalation/withdraw tracking columns,
// chatter attachment storage metadata. Owned exclusively by Lane B — do not
// reuse or edit this id from other lanes (see migrations/101,201,301,401,501).
export const migration = {
  id: '202_r1_lane_b_completion',
  // x_approval_policies is canonically owned/created by 501_r1_kernel_completion;
  // this migration only ALTERs it (adds escalation_timeout_minutes). Declaring
  // the dependency makes the migration-runner place 501 before this migration
  // on a fresh database, instead of relying solely on the CREATE TABLE IF NOT
  // EXISTS commutative fallback below.
  dependsOn: ['501_r1_kernel_completion'],
  up(db) {
    const addColumn = (table, col, def) => {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!info.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      }
    };

    // --- T1.9.1(a): timeout-based escalation -------------------------------
    // KNOWN CROSS-LANE DEFECT (documented independently by Lane C's
    // scripts/test-lane-c-completion.mjs "KNOWN CROSS-LANE DEFECT" note, and
    // reconfirmed here): vnext/server/db/migration-runner.mjs (not owned by
    // this lane) applies migrations in plain filename-alphabetical order,
    // which runs 102/202/302/402 BEFORE 501_r1_kernel_completion.mjs — but
    // x_approval_policies is created BY 501, not by 201. On a fresh DB this
    // would make `ALTER TABLE x_approval_policies ...` below fail with
    // "no such table". Rather than depend on a migration-runner ordering fix
    // (out of this lane's owned paths), this migration defensively ensures
    // the table exists with 501's exact original shape first; if 501 has
    // already run, this CREATE TABLE IF NOT EXISTS is a no-op. Either
    // execution order then converges on the same final schema.
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_approval_policies (
        entity TEXT PRIMARY KEY,
        policy_chain TEXT NOT NULL,
        authority_limit REAL NOT NULL DEFAULT 0.0
      ) STRICT;
    `);
    // Opt-in per entity policy; 0/absent = escalation disabled for that entity.
    addColumn('x_approval_policies', 'escalation_timeout_minutes', 'INTEGER NOT NULL DEFAULT 0');

    // --- T1.9.1(a)/(b): per-request step timing + escalation + withdraw ----
    // step_entered_at: when the request entered its CURRENT pending step
    // (reset on creation and on every chain advance/escalation). Used to
    // compute "time-in-current-step" against escalation_timeout_minutes.
    addColumn('x_approvals', 'step_entered_at', 'TEXT');
    addColumn('x_approvals', 'escalated', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('x_approvals', 'escalated_at', 'TEXT');
    addColumn('x_approvals', 'escalated_from_role', 'TEXT');

    // Backfill: existing rows get step_entered_at = created_at so the
    // escalation sweep has a valid baseline immediately after migrating.
    db.exec(`UPDATE x_approvals SET step_entered_at = created_at WHERE step_entered_at IS NULL OR step_entered_at = ''`);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_x_approvals_escalated ON x_approvals (escalated, status);
      CREATE INDEX IF NOT EXISTS idx_x_approvals_requester ON x_approvals (requester, status);
    `);

    // --- T1.6.1(b): chatter attachments -------------------------------------
    // Files are stored on disk under vnext-data/files/ using a generated
    // storage_name (never the client-supplied filename) to prevent path
    // traversal; filename is kept only as display metadata.
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_attachments (
        id           TEXT PRIMARY KEY,
        entity       TEXT NOT NULL,
        record_id    TEXT NOT NULL,
        filename     TEXT NOT NULL,
        storage_name TEXT NOT NULL,
        mime_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
        size         INTEGER NOT NULL DEFAULT 0,
        uploader     TEXT NOT NULL,
        created_at   TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_x_attachments_record ON x_attachments (entity, record_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_x_attachments_record;
      DROP TABLE IF EXISTS x_attachments;
      DROP INDEX IF EXISTS idx_x_approvals_requester;
      DROP INDEX IF EXISTS idx_x_approvals_escalated;
    `);
    // SQLite ADD COLUMN is not reverted here (consistent with 501_r1_kernel_completion's
    // convention: additive columns do not break backwards compatibility).
  },
};
