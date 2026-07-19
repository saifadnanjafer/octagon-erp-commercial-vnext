// clean-room; behavior modeled on OCTAGON_VNEXT_EXECUTION_PLAN.md R0.4 idempotent seed requirements (proprietary self, not copied)
import crypto from 'node:crypto';

export function applyR0ScopeSeed(db) {
  const seedKey = 'r0_scope_catalog_v1';
  if (db.prepare('SELECT 1 FROM seed_ledger WHERE seed_key = ?').get(seedKey)) return { seedKey, applied: false };
  const checksum = crypto.createHash('sha256').update(seedKey).digest('hex');
  db.prepare('INSERT INTO r0_tenant_root (company_id, legal_name) VALUES (?, ?)').run('company-r0-demo', 'R0 Demonstration Company');
  db.prepare('INSERT INTO r0_optional_scope_reference (reference_code, label) VALUES (?, ?)').run('GLOBAL-DEMO', 'Global demonstration reference');
  db.prepare('INSERT INTO r0_optional_scope_assignment (reference_code, company_id, local_label) VALUES (?, ?, ?)').run('GLOBAL-DEMO', 'company-r0-demo', 'Company demonstration assignment');
  db.prepare('INSERT INTO seed_ledger (seed_key, applied_at, checksum) VALUES (?, ?, ?)').run(seedKey, new Date().toISOString(), checksum);
  return { seedKey, applied: true };
}

/**
 * R1 integration fix (2026-07-18): acl-engine.js's own DEFAULT_ROLES constant
 * declares an 'admin' role, and resolveRole() maps the legacy
 * 'system.admin' group (and the 'admin'/'system'/'system_admin' aliases) to
 * it — but no migration or seed anywhere ever inserted 'admin' into
 * x_acl_roles or gave it any x_acl_grants row (migrations/201_r1_lane_b_tables.mjs
 * only seeds manager/accountant/sales/operator). The result: a real
 * system.admin session resolves to role 'admin' and is then denied by
 * EVERY ACL-gated route (scopeFor() finds zero grants for a role with zero
 * rows), discovered by actually exercising the integrated server.js over
 * HTTP rather than trusting any lane's isolated test fixtures (which each
 * grant their own custom test role directly). A single wildcard grant is
 * the standard "superuser" pattern acl-engine.js's own permMatches() already
 * supports (a lone '*' matches any perm string).
 */
export function applyAclAdminDefaultSeed(db) {
  const seedKey = 'acl_admin_default_grant_v1';
  if (db.prepare('SELECT 1 FROM seed_ledger WHERE seed_key = ?').get(seedKey)) return { seedKey, applied: false };
  const checksum = crypto.createHash('sha256').update(seedKey).digest('hex');
  db.prepare("INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES ('admin', 'مدير النظام')").run();
  db.prepare("INSERT OR IGNORE INTO x_acl_grants (role, perm, scope) VALUES ('admin', '*', 'all')").run();
  db.prepare('INSERT INTO seed_ledger (seed_key, applied_at, checksum) VALUES (?, ?, ?)').run(seedKey, new Date().toISOString(), checksum);
  return { seedKey, applied: true };
}
