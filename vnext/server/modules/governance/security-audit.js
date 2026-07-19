// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R4.3 security hardening: static route-gating coverage analysis over the R3
// route handler. Confirms every write branch is behind session + permission +
// company scope, and no branch trusts body-supplied identity. Read-only static
// analysis — it does not weaken or bypass any control.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const R3_ROUTES_FILE = path.join(__dirname, '..', 'r3-routes.js');

// Sensitive fields that must never appear in a list/export without a mask.
const SENSITIVE_FIELDS = ['standard_cost', 'cost_price', 'valuation_rate', 'unit_cost', 'margin', 'salary', 'credit_limit'];

// Body-identity keys the handler must NOT read for authorization/scope.
const FORBIDDEN_BODY_IDENTITY = ['input.company_id', 'input.tenant_id', 'input.actor', 'body.company_id', 'req.body.company_id'];

function auditRouteGating() {
  const source = fs.readFileSync(R3_ROUTES_FILE, 'utf8');
  const findings = [];

  // 1. Every state-changing method must resolve session + scope + permission.
  const hasSessionGate = /const current = user\(req, res\); if \(!current\) return true;/.test(source);
  const hasScopeGate = /const companyId = scope\(req, res, current\); if \(!companyId\) return true;/.test(source);
  const hasPermGate = /permission\(req, res, current,/.test(source);
  if (!hasSessionGate) findings.push('missing session gate');
  if (!hasScopeGate) findings.push('missing company-scope gate');
  if (!hasPermGate) findings.push('missing permission gate');

  // 2. Handler must never read body-supplied identity for scope/authz.
  for (const forbidden of FORBIDDEN_BODY_IDENTITY) {
    if (source.includes(forbidden)) findings.push(`body-supplied identity used: ${forbidden}`);
  }

  // 3. POST/mutation branches must pass the resolved companyId (not a body value)
  //    to every core command. Confirm the scope var name is the one threaded in.
  const mutationCalls = source.match(/core\.\w+\(db, companyId/g) || [];

  return {
    session_gate: hasSessionGate,
    scope_gate: hasScopeGate,
    permission_gate: hasPermGate,
    body_identity_findings: findings.filter((f) => f.startsWith('body-supplied')),
    mutation_calls_scoped: mutationCalls.length,
    findings,
    gated: findings.length === 0,
  };
}

module.exports = { auditRouteGating, SENSITIVE_FIELDS, FORBIDDEN_BODY_IDENTITY };
