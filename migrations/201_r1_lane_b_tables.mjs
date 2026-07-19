// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.2 backend ACL & approvals (proprietary self, not copied)
export const migration = {
  id: '201_r1_lane_b_tables',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_acl_roles (
        role     TEXT PRIMARY KEY,
        label_ar TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_acl_grants (
        role  TEXT NOT NULL,
        perm  TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'all',
        PRIMARY KEY (role, perm)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_approvals (
        id            TEXT PRIMARY KEY,
        entity        TEXT,
        record_id     TEXT,
        action        TEXT,
        payload       TEXT,
        requester     TEXT,
        approver_role TEXT,
        status        TEXT NOT NULL DEFAULT 'pending',
        decided_by    TEXT,
        decided_at    TEXT,
        cc            TEXT,
        created_at    TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_x_approvals_status ON x_approvals (status, approver_role);
      CREATE INDEX IF NOT EXISTS idx_x_approvals_record ON x_approvals (entity, record_id);

      CREATE TABLE IF NOT EXISTS x_chatter (
        id            TEXT PRIMARY KEY,
        entity        TEXT NOT NULL,
        record_id     TEXT NOT NULL,
        kind          TEXT NOT NULL DEFAULT 'message',
        body          TEXT,
        author        TEXT,
        activity_type TEXT,
        due_date      TEXT,
        done          INTEGER NOT NULL DEFAULT 0,
        meta          TEXT,
        created_at    TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_x_chatter_record ON x_chatter (entity, record_id);

      CREATE TABLE IF NOT EXISTS x_followers (
        entity    TEXT NOT NULL,
        record_id TEXT NOT NULL,
        user      TEXT NOT NULL,
        PRIMARY KEY (entity, record_id, user)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS x_views (
        id     TEXT PRIMARY KEY,
        user   TEXT,
        entity TEXT NOT NULL,
        name   TEXT NOT NULL,
        config TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_x_views_entity_user ON x_views (entity, user);
    `);

    // Seed default roles
    const roles = [
      ['manager', 'مدير'],
      ['accountant', 'محاسب'],
      ['sales', 'مبيعات'],
      ['operator', 'مشغّل']
    ];
    const insRole = db.prepare('INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES (?, ?)');
    for (const r of roles) {
      insRole.run(r[0], r[1]);
    }

    // Seed default grants
    const grants = [
      ['manager', 'sales:*', 'all'],
      ['manager', 'support:*', 'all'],
      ['manager', 'supply:*', 'all'],
      ['accountant', 'sales:crm_lead:read', 'all'],
      ['accountant', 'support:helpdesk_ticket:read', 'all'],
      ['accountant', 'supply:product:read', 'all'],
      ['sales', 'sales:crm_lead:*', 'all'],
      ['sales', 'support:helpdesk_ticket:create', 'all'],
      ['sales', 'support:helpdesk_ticket:read', 'all'],
      ['sales', 'support:helpdesk_ticket:update', 'own'],
      ['operator', 'supply:product:read', 'all']
    ];
    const insGrant = db.prepare('INSERT OR IGNORE INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?)');
    for (const g of grants) {
      insGrant.run(g[0], g[1], g[2]);
    }
  },
  down(db) {
    db.exec(`
      DROP TABLE x_views;
      DROP TABLE x_followers;
      DROP TABLE x_chatter;
      DROP TABLE x_approvals;
      DROP TABLE x_acl_grants;
      DROP TABLE x_acl_roles;
    `);
  }
};
