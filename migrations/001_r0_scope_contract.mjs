// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R0.4 ownership contract (proprietary self, not copied)
const classifications = [
  ['schema_migrations', 'global-technical', 'Migration ledger; never company-scoped.'],
  ['scope_table_registry', 'global-technical', 'Documents table ownership decisions without adding company_id.'],
  ['seed_ledger', 'global-technical', 'Idempotent seed execution ledger; never company-scoped.'],
  ['r0_tenant_root', 'tenant-root', 'R0-only scope anchor proving a root company id before R1.13 delivers the commercial company master.'],
  ['r0_company_owned_probe', 'company-owned', 'R0 validation probe: every business-like record requires non-null company_id.'],
  ['r0_optional_scope_reference', 'optionally-company-scoped', 'Global reference is separate from its company-specific assignment.'],
  ['r0_attachment_probe', 'company-owned', 'R0 validation probe for attachment ownership.'],
];

export const migration = {
  id: '001_r0_scope_contract',
  up(db) {
    db.exec(`CREATE TABLE scope_table_registry (
      table_name TEXT PRIMARY KEY,
      ownership_class TEXT NOT NULL CHECK (ownership_class IN ('global-technical','global-reference','tenant-root','company-owned','optionally-company-scoped')),
      company_id_policy TEXT NOT NULL CHECK (company_id_policy IN ('absent','self-root','required','separate-assignment')),
      rationale TEXT NOT NULL
    ) STRICT;
    CREATE TABLE seed_ledger (
      seed_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    ) STRICT;
    CREATE TABLE r0_tenant_root (
      company_id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE r0_company_owned_probe (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES r0_tenant_root(company_id),
      payload TEXT NOT NULL
    ) STRICT;
    CREATE TABLE r0_attachment_probe (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES r0_tenant_root(company_id),
      storage_key TEXT NOT NULL
    ) STRICT;
    CREATE TABLE r0_optional_scope_reference (
      reference_code TEXT PRIMARY KEY,
      label TEXT NOT NULL
    ) STRICT;
    CREATE TABLE r0_optional_scope_assignment (
      reference_code TEXT NOT NULL REFERENCES r0_optional_scope_reference(reference_code),
      company_id TEXT NOT NULL REFERENCES r0_tenant_root(company_id),
      local_label TEXT NOT NULL,
      PRIMARY KEY (reference_code, company_id)
    ) STRICT;`);
    const insert = db.prepare('INSERT INTO scope_table_registry (table_name, ownership_class, company_id_policy, rationale) VALUES (?, ?, ?, ?)');
    for (const [tableName, ownershipClass, rationale] of classifications) {
      insert.run(tableName, ownershipClass, ownershipClass === 'company-owned' ? 'required' : ownershipClass === 'optionally-company-scoped' ? 'separate-assignment' : ownershipClass === 'tenant-root' ? 'self-root' : 'absent', rationale);
    }
  },
  down(db) {
    db.exec(`DROP TABLE r0_optional_scope_assignment;
      DROP TABLE r0_optional_scope_reference;
      DROP TABLE r0_attachment_probe;
      DROP TABLE r0_company_owned_probe;
      DROP TABLE r0_tenant_root;
      DROP TABLE seed_ledger;
      DROP TABLE scope_table_registry;`);
  },
};
