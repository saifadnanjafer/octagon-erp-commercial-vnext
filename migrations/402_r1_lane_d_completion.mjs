// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.12/R1.13/R1.14 completion scope (proprietary self, not copied)
// Lane D completion migration (R1_FINAL_COMPLETION_REPORT.md T1.12.1 / T1.13.1 / T1.14.1).
// Numbered in Lane D's reserved 400-block per the guardrail correction in
// R1_FINAL_COMPLETION_REPORT.md §2.1 (next available: 402). Never renumber
// 101/201/301/401/501 — this migration only adds new tables/columns.
export const migration = {
  id: '402_r1_lane_d_completion',
  // x_api_keys and x_installed_modules are canonically owned/created by
  // 501_r1_kernel_completion; this migration only ALTERs them (adds
  // id/label/created_at/created_by, installed_at/source_dir). Declaring the
  // dependency makes the migration-runner place 501 before this migration on
  // a fresh database, instead of relying solely on the CREATE TABLE IF NOT
  // EXISTS commutative fallback below.
  dependsOn: ['501_r1_kernel_completion'],
  up(db) {
    db.exec(`
      -- T1.12.1: precise per-module patch ledger so uninstall can retract
      -- exactly what a module contributed (fields/menu items/workflow defs/
      -- declarative schema migrations) and leave zero residue.
      CREATE TABLE IF NOT EXISTS x_module_patches (
        module        TEXT NOT NULL,
        patch_type    TEXT NOT NULL CHECK (patch_type IN ('custom_field', 'menu_item', 'workflow', 'schema_migration')),
        target_entity TEXT NOT NULL DEFAULT '',
        target_key    TEXT NOT NULL,
        down_sql      TEXT,
        applied_at    TEXT NOT NULL,
        PRIMARY KEY (module, patch_type, target_entity, target_key)
      ) STRICT;

      -- T1.12.1: registry-level menu contributions from modules (declarative
      -- only — rendering into the live app shell nav is a separate,
      -- out-of-scope integration; see vnext/server/org/TASK.md).
      CREATE TABLE IF NOT EXISTS x_module_menu_items (
        id       TEXT PRIMARY KEY,
        module   TEXT NOT NULL,
        label_ar TEXT NOT NULL,
        path     TEXT NOT NULL,
        icon     TEXT,
        position INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      -- T1.13.1: which companies a user may access, and which one is their
      -- default. Feeds the company-switcher; independent of the legacy
      -- single-tenant JSON-blob mechanism (see org/TASK.md "known
      -- discrepancy" section — the two are intentionally NOT merged).
      CREATE TABLE IF NOT EXISTS x_user_companies (
        user_id    TEXT NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        is_default INTEGER NOT NULL DEFAULT 0,
        granted_at TEXT NOT NULL,
        PRIMARY KEY (user_id, company_id)
      ) STRICT;

      -- T1.13.1: the active-company selection made through the new
      -- company-switcher, keyed by user. This is the new SQL-schema-native
      -- equivalent of the legacy getActiveTenantProfile() JSON-blob
      -- mechanism (server.js:646-772) — deliberately separate, see
      -- org/TASK.md.
      CREATE TABLE IF NOT EXISTS x_active_company (
        user_id    TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        set_at     TEXT NOT NULL
      ) STRICT;

      -- T1.14.1: config-driven password policy (length/complexity), single
      -- row, admin-editable. Defaults are conservative but not hardcoded
      -- into the check function itself.
      CREATE TABLE IF NOT EXISTS x_auth_password_policy (
        id               INTEGER PRIMARY KEY CHECK (id = 1),
        min_length       INTEGER NOT NULL DEFAULT 10,
        max_length       INTEGER NOT NULL DEFAULT 128,
        require_upper    INTEGER NOT NULL DEFAULT 1,
        require_lower    INTEGER NOT NULL DEFAULT 1,
        require_digit    INTEGER NOT NULL DEFAULT 1,
        require_symbol   INTEGER NOT NULL DEFAULT 1,
        min_char_classes INTEGER NOT NULL DEFAULT 3,
        updated_at       TEXT
      ) STRICT;

      -- T1.14.1: TOTP enrollment (pending -> confirmed) for a user. The
      -- secret is written here ONLY (never logged); confirmed rows are the
      -- SQL-native source of truth this lane owns. See auth/TASK.md for the
      -- documented gap against the legacy login path's user.totpSecret
      -- field (server.js:1905-1911).
      CREATE TABLE IF NOT EXISTS x_totp_enrollments (
        user_id      TEXT PRIMARY KEY,
        secret       TEXT NOT NULL,
        confirmed    INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        confirmed_at TEXT
      ) STRICT;

      -- T1.14.1: session rotation on privilege change. A row here means
      -- "any session token for this user created before revoked_at is no
      -- longer valid" — enforced by a one-line check the integrator adds to
      -- server.js's requireSession() (see auth/INTEGRATION.md).
      CREATE TABLE IF NOT EXISTS x_session_revocations (
        user_id    TEXT PRIMARY KEY,
        revoked_at INTEGER NOT NULL
      ) STRICT;
    `);

    // Seed the default password policy row (idempotent).
    db.prepare(`
      INSERT OR IGNORE INTO x_auth_password_policy
        (id, min_length, max_length, require_upper, require_lower, require_digit, require_symbol, min_char_classes, updated_at)
      VALUES (1, 10, 128, 1, 1, 1, 1, 3, ?)
    `).run(new Date().toISOString());

    // T1.14.1/T1.12.1: x_api_keys and x_installed_modules are normally
    // created by migrations/501_r1_kernel_completion.mjs — but migration
    // filenames sort/run numerically (..., 401, 402, 501, ...), so on a
    // FRESH database this migration runs BEFORE 501. A bare `ALTER TABLE
    // ADD COLUMN` here would fail with "no such table" exactly like
    // migrations/202_r1_lane_b_completion.mjs currently does against
    // x_approval_policies (see R1_FINAL_COMPLETION_REPORT.md /
    // vnext/server/org/TEST.md "known external blocker" for that sibling
    // bug — this migration avoids repeating it).
    //
    // Fix: define both tables here with `CREATE TABLE IF NOT EXISTS` using
    // their FULL final shape (original 501 columns + this migration's new
    // columns), making 402 and 501 commutative — whichever runs first
    // defines the table in full; the other becomes a no-op for table
    // creation. The addColumn() top-up calls below only matter for a
    // database where 501 already ran historically with the narrower
    // pre-402 shape. Same pattern as migrations/102_r1_lane_a_completion.mjs.
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_api_keys (
        key_hash   TEXT PRIMARY KEY,
        user       TEXT NOT NULL,
        role       TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        id         TEXT,
        label      TEXT,
        created_at TEXT,
        created_by TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_installed_modules (
        module       TEXT PRIMARY KEY,
        active       INTEGER NOT NULL DEFAULT 0,
        manifest     TEXT NOT NULL,
        installed_at TEXT,
        source_dir   TEXT
      ) STRICT;
    `);

    const addColumn = (table, col, def) => {
      const info = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!info.some((c) => c.name === col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      }
    };
    addColumn('x_api_keys', 'id', 'TEXT');
    addColumn('x_api_keys', 'label', 'TEXT');
    addColumn('x_api_keys', 'created_at', 'TEXT');
    addColumn('x_api_keys', 'created_by', 'TEXT');
    addColumn('x_installed_modules', 'installed_at', 'TEXT');
    addColumn('x_installed_modules', 'source_dir', 'TEXT');

    // Backfill an id for any pre-existing rows (e.g. seeded by earlier test
    // scripts) so the new DELETE /api/x/auth/api-keys/:id path can address
    // them too.
    const legacyRows = db.prepare('SELECT key_hash FROM x_api_keys WHERE id IS NULL').all();
    const backfill = db.prepare('UPDATE x_api_keys SET id = ?, created_at = COALESCE(created_at, ?) WHERE key_hash = ?');
    for (const row of legacyRows) {
      backfill.run(`key_${row.key_hash.slice(0, 24)}`, new Date().toISOString(), row.key_hash);
    }

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_x_api_keys_id ON x_api_keys (id) WHERE id IS NOT NULL;`);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_x_api_keys_id;
      DROP TABLE IF EXISTS x_session_revocations;
      DROP TABLE IF EXISTS x_totp_enrollments;
      DROP TABLE IF EXISTS x_auth_password_policy;
      DROP TABLE IF EXISTS x_active_company;
      DROP TABLE IF EXISTS x_user_companies;
      DROP TABLE IF EXISTS x_module_menu_items;
      DROP TABLE IF EXISTS x_module_patches;
    `);
    // SQLite ALTER TABLE ADD COLUMN additions (x_api_keys.id/label/created_at/
    // created_by, x_installed_modules.installed_at/source_dir) are not
    // dropped in down() — consistent with migrations/501_r1_kernel_completion.mjs's
    // own documented convention that added columns are not reverted.
  },
};
