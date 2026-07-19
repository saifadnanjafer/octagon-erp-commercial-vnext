// R4.1 approval policy & authority-limit rollout: seed per-module approval
// policy packs as DATA into the kernel-owned x_approval_policies table.
// Each row binds a sensitive document/action entity to a role chain, an
// authority limit (0 = always require), and an escalation timeout. Maker≠checker
// is enforced by the kernel (approvals.js). down() removes only the rows this
// migration inserted, preserving any operator-created policies.
'use strict';

// entity key ⇄ [policy_chain roles], authority_limit, escalation_timeout_minutes.
// entity keys match the `entity`/`action`-derived keys used by the R3 approval
// gates (approvedOverride/cycleCountApprove/subcontract variance) plus the
// governance rollout's document-level policies.
export const POLICY_PACKS = [
  // --- Finance: maker≠checker defaults, authority bands ---
  { entity: 'fiscal_doc:journal_entry', chain: ['accountant', 'manager'], limit: 5000000, escalation: 1440, module: 'finance' },
  { entity: 'fiscal_doc:payment', chain: ['accountant', 'manager'], limit: 2000000, escalation: 720, module: 'finance' },
  { entity: 'fiscal_doc:reversal', chain: ['manager', 'admin'], limit: 0, escalation: 720, module: 'finance' },
  // --- Procurement ---
  { entity: 'purchase_order:confirm', chain: ['manager'], limit: 10000000, escalation: 1440, module: 'procurement' },
  { entity: 'purchase_order:three_way_match_override', chain: ['manager', 'admin'], limit: 0, escalation: 720, module: 'procurement' },
  // --- Sales ---
  { entity: 'sales_quote:credit_override', chain: ['manager'], limit: 0, escalation: 720, module: 'sales' },
  { entity: 'sales_order:credit_override', chain: ['manager'], limit: 0, escalation: 720, module: 'sales' },
  { entity: 'sales_order:discount_override', chain: ['manager'], limit: 0, escalation: 720, module: 'sales' },
  // --- Inventory ---
  { entity: 'stock_cycle_count:cycle_count_approve', chain: ['manager'], limit: 0, escalation: 480, module: 'inventory' },
  { entity: 'stock_adjustment:post', chain: ['manager'], limit: 0, escalation: 480, module: 'inventory' },
  // --- Manufacturing / subcontracting ---
  { entity: 'subcontract_order:subcontract_variance_override', chain: ['manager'], limit: 0, escalation: 720, module: 'manufacturing' },
];

export const migration = {
  id: '622_r4_approval_policy_packs',
  dependsOn: ['621_r3_subcontract_valuation'],
  up(db) {
    // Governance metadata columns (idempotent, additive) so a policy row records
    // which module pack it belongs to and whether maker≠checker is mandatory.
    const columns = new Set(db.prepare('PRAGMA table_info(x_approval_policies)').all().map((row) => row.name));
    if (!columns.has('module')) db.exec("ALTER TABLE x_approval_policies ADD COLUMN module TEXT");
    if (!columns.has('maker_checker')) db.exec("ALTER TABLE x_approval_policies ADD COLUMN maker_checker INTEGER NOT NULL DEFAULT 1");
    if (!columns.has('seeded_by')) db.exec("ALTER TABLE x_approval_policies ADD COLUMN seeded_by TEXT");
    const insert = db.prepare(
      `INSERT INTO x_approval_policies(entity, policy_chain, authority_limit, escalation_timeout_minutes, module, maker_checker, seeded_by)
       VALUES(?,?,?,?,?,1,'r4_policy_pack')
       ON CONFLICT(entity) DO UPDATE SET policy_chain=excluded.policy_chain, authority_limit=excluded.authority_limit,
         escalation_timeout_minutes=excluded.escalation_timeout_minutes, module=excluded.module, maker_checker=1, seeded_by='r4_policy_pack'`
    );
    for (const pack of POLICY_PACKS) insert.run(pack.entity, JSON.stringify(pack.chain), pack.limit, pack.escalation, pack.module);
  },
  down(db) {
    // Remove only the rows this pack seeded; operator policies (seeded_by NULL) survive.
    const del = db.prepare("DELETE FROM x_approval_policies WHERE entity=? AND seeded_by='r4_policy_pack'");
    for (const pack of POLICY_PACKS) del.run(pack.entity);
    // Restore the baseline x_approval_policies schema by dropping the governance
    // columns this migration added (genuine schema-restoring rollback). Safe:
    // these columns carry no indexes or constraints.
    const columns = new Set(db.prepare('PRAGMA table_info(x_approval_policies)').all().map((row) => row.name));
    for (const name of ['seeded_by', 'maker_checker', 'module']) {
      if (columns.has(name)) db.exec(`ALTER TABLE x_approval_policies DROP COLUMN ${name}`);
    }
  },
};
