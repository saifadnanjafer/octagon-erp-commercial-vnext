// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R4.1 governance policy engine: read-only coverage queries over the kernel's
// x_approval_policies table. Does NOT reimplement approvals — maker≠checker,
// chain advancement, and escalation stay in vnext/server/approvals/approvals.js.
'use strict';

const infra = require('../r3-infra');
const { fail } = infra;

// The sensitive R3 transitions that MUST be governed by a seeded policy.
// Each is an entity:action key the R3 approval gates already emit.
const SENSITIVE_TRANSITIONS = [
  'purchase_order:three_way_match_override',
  'sales_quote:credit_override',
  'sales_order:credit_override',
  'stock_cycle_count:cycle_count_approve',
  'subcontract_order:subcontract_variance_override',
];

function listPolicies(db) {
  return db.prepare('SELECT entity, policy_chain, authority_limit, escalation_timeout_minutes, module, maker_checker, seeded_by FROM x_approval_policies ORDER BY entity')
    .all()
    .map((row) => ({ ...row, policy_chain: JSON.parse(row.policy_chain || '[]'), maker_checker: Number(row.maker_checker) === 1 }));
}

function getPolicy(db, entity) {
  const row = db.prepare('SELECT entity, policy_chain, authority_limit, escalation_timeout_minutes, module, maker_checker, seeded_by FROM x_approval_policies WHERE entity=?').get(entity);
  if (!row) return null;
  return { ...row, policy_chain: JSON.parse(row.policy_chain || '[]'), maker_checker: Number(row.maker_checker) === 1 };
}

// Coverage report: which sensitive transitions have a policy, and whether every
// finance policy enforces maker≠checker.
function coverageReport(db) {
  const policies = listPolicies(db);
  const byEntity = new Map(policies.map((policy) => [policy.entity, policy]));
  const transitions = SENSITIVE_TRANSITIONS.map((entity) => ({ entity, covered: byEntity.has(entity), policy: byEntity.get(entity) || null }));
  const financePolicies = policies.filter((policy) => policy.module === 'finance');
  return {
    total_policies: policies.length,
    sensitive_transitions: transitions,
    all_sensitive_covered: transitions.every((transition) => transition.covered),
    finance_maker_checker_complete: financePolicies.length > 0 && financePolicies.every((policy) => policy.maker_checker),
    modules: [...new Set(policies.map((policy) => policy.module).filter(Boolean))].sort(),
  };
}

// Evaluate whether a given amount for an entity requires escalation beyond the
// base chain per its authority limit (mirrors approvals.createApproval's rule).
function requiresEscalation(db, entity, amount) {
  const policy = getPolicy(db, entity);
  if (!policy) return { policy: null, requiresEscalation: false };
  const limit = Number(policy.authority_limit || 0);
  return { policy, requiresEscalation: limit > 0 && Number(amount) > limit };
}

function assertCovered(db, entity) {
  if (!getPolicy(db, entity)) throw fail(`no approval policy is seeded for sensitive transition ${entity}`, 409, 'POLICY_COVERAGE_MISSING');
  return true;
}

module.exports = { SENSITIVE_TRANSITIONS, listPolicies, getPolicy, coverageReport, requiresEscalation, assertCovered };
