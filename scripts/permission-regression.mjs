/**
 * Phase 6F read-only permission regression harness.
 *
 * Loads services/permissionService.js in a browser-like VM and verifies:
 * - seeded Phase 6D user roles resolve through omni.roles
 * - Phase 6E mapped page policies behave as expected
 * - sensitive/high-risk action explainers allow, block, or approval-route correctly
 * - the current sidebar denominator and mapped-page count do not silently drift
 *
 * Usage, from octagon-erp/:
 *   node scripts/permission-regression.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = process.cwd();
const PERMISSION_FILE = path.join(ROOT, 'services', 'permissionService.js');
const INDEX_FILE = path.join(ROOT, 'index.html');

const sandboxWindow = {};
sandboxWindow.window = sandboxWindow;
sandboxWindow.console = console;
sandboxWindow.omni = {
  roles: [
    { id: 'system_admin', groups: ['system.admin'] },
    { id: 'finance_manager', groups: ['finance.manager'] },
    { id: 'workshop_manager', groups: ['workshop.manager'] },
    { id: 'operator_user', groups: ['workshop.user'] },
    { id: 'employee_user', groups: [] },
    { id: 'viewer_user', groups: [] },
  ],
};
sandboxWindow.PentagonAuth = { getCurrentUser: () => sandboxWindow.__currentUser || null };

vm.createContext(sandboxWindow);
vm.runInContext(fs.readFileSync(PERMISSION_FILE, 'utf8'), sandboxWindow, { filename: 'permissionService.js' });

const PS = sandboxWindow.PermissionService;
if (!PS) {
  console.error('FAIL: PermissionService not exposed');
  process.exit(1);
}

const SEEDED_USERS = {
  system_admin: { id: 'system_admin', roleId: 'system_admin' },
  finance_manager: { id: 'finance_manager', roleId: 'finance_manager' },
  workshop_manager: { id: 'workshop_manager', roleId: 'workshop_manager' },
  operator_user: { id: 'operator_user', roleId: 'operator_user' },
  employee_user: { id: 'employee_user', roleId: 'employee_user' },
  viewer_user: { id: 'viewer_user', roleId: 'viewer_user' },
};

function uniqueSidebarPages() {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const pages = new Set();
  const re = /data-page=["']([^"']+)["']/g;
  let match;
  while ((match = re.exec(html))) pages.add(match[1]);
  return pages;
}

function outcomeForPage(page, user) {
  return PS.explainPage(page, user).outcome;
}

function outcomeForAction(actionKey, user, context = { dryRun: true }) {
  return PS.explainAction(actionKey, context, user).outcome;
}

function groupsFor(user) {
  return PS.resolveGroups(user).sort().join(',');
}

const sidebarPages = uniqueSidebarPages();
const mappedSidebarPages = [...sidebarPages].filter(page => Object.prototype.hasOwnProperty.call(PS.pagePermissions, page));

const CASES = [
  ['sidebar baseline reflects Phase 7J/7L pages + Telegram connector + workshop ledger + system check + VNext platform kernel (R1)',
    () => sidebarPages.size, 97],
  ['mapped sidebar pages stay fully mapped (100% coverage)',
    () => mappedSidebarPages.length, 97],
  ['action permission inventory remains populated',
    () => Object.keys(PS.actionPermissions).length >= 24, true],
  ['action metadata inventory remains populated',
    () => Object.keys(PS.actionMetadata).length >= 31, true],

  ['system_admin resolves inherited workshop and finance groups',
    () => groupsFor(SEEDED_USERS.system_admin), 'finance.manager,finance.user,system.admin,workshop.manager,workshop.user'],
  ['finance_manager resolves finance.user inheritance',
    () => groupsFor(SEEDED_USERS.finance_manager), 'finance.manager,finance.user'],
  ['workshop_manager resolves workshop.user inheritance',
    () => groupsFor(SEEDED_USERS.workshop_manager), 'workshop.manager,workshop.user'],
  ['operator_user resolves workshop.user',
    () => groupsFor(SEEDED_USERS.operator_user), 'workshop.user'],
  ['viewer_user resolves no privileged groups',
    () => groupsFor(SEEDED_USERS.viewer_user), ''],

  ['system_admin can access security center',
    () => PS.checkPage('security_center', SEEDED_USERS.system_admin), true],
  ['finance_manager can access banking',
    () => PS.checkPage('banking', SEEDED_USERS.finance_manager), true],
  ['finance_manager can access budgeting',
    () => PS.checkPage('budgeting', SEEDED_USERS.finance_manager), true],
  ['finance_manager cannot access inventory',
    () => PS.checkPage('inventory', SEEDED_USERS.finance_manager), false],
  ['workshop_manager can access inventory',
    () => PS.checkPage('inventory', SEEDED_USERS.workshop_manager), true],
  ['workshop_manager can access risk compliance',
    () => PS.checkPage('risk_compliance', SEEDED_USERS.workshop_manager), true],
  ['workshop_manager cannot access banking',
    () => PS.checkPage('banking', SEEDED_USERS.workshop_manager), false],
  ['operator_user can access workshop pages',
    () => PS.checkPage('task_manager', SEEDED_USERS.operator_user), true],
  ['operator_user cannot access people_ops manager page',
    () => PS.checkPage('people_ops', SEEDED_USERS.operator_user), false],
  ['employee_user can access employee mobile',
    () => PS.checkPage('employee_mobile', SEEDED_USERS.employee_user), true],
  ['viewer_user can access explicit public customer portal',
    () => PS.checkPage('customer_portal', SEEDED_USERS.viewer_user), true],
  ['viewer_user cannot access finance',
    () => PS.checkPage('finance', SEEDED_USERS.viewer_user), false],
  ['viewer_user cannot access route health',
    () => PS.checkPage('route_health', SEEDED_USERS.viewer_user), false],
  ['unmapped normal pages still explain local/dev default allow',
    () => outcomeForPage('some_random_page', SEEDED_USERS.viewer_user), 'default_allowed'],

  ['finance_manager can create bank reconciliation',
    () => outcomeForAction('banking.reconciliation.create', SEEDED_USERS.finance_manager), 'allowed'],
  ['operator_user cannot create bank reconciliation',
    () => outcomeForAction('banking.reconciliation.create', SEEDED_USERS.operator_user), 'blocked'],
  ['finance_manager can finalize bank reconciliation',
    () => outcomeForAction('banking.reconciliation.finalize', SEEDED_USERS.finance_manager), 'allowed'],
  ['finance_user-style role must approval-route finalization when missing manager group',
    () => outcomeForAction('banking.reconciliation.finalize', { id: 'finance_user_probe', groups: ['finance.user'] }), 'approval_required'],
  ['workshop_manager can adjust inventory location',
    () => outcomeForAction('inventory.location.adjust', SEEDED_USERS.workshop_manager), 'allowed'],
  ['operator_user approval-routes inventory adjustment',
    () => outcomeForAction('inventory.location.adjust', SEEDED_USERS.operator_user), 'approval_required'],
  ['finance_manager can create COA account',
    () => outcomeForAction('accounting.coa.create', SEEDED_USERS.finance_manager), 'allowed'],
  ['finance_manager cannot edit used COA account directly',
    () => outcomeForAction('accounting.coa.edit_used', SEEDED_USERS.finance_manager), 'approval_required'],
  ['system_admin can change HR roles',
    () => outcomeForAction('hr.role_permission.change', SEEDED_USERS.system_admin), 'allowed'],
  ['workshop_manager approval-routes salary change',
    () => outcomeForAction('hr.salary.change', SEEDED_USERS.workshop_manager), 'approval_required'],
  ['viewer_user approval-routes AI high-risk write',
    () => outcomeForAction('ai.high_risk_write', SEEDED_USERS.viewer_user), 'approval_required'],
  ['viewer_user blocked on unmapped critical delete without approval flag',
    () => outcomeForAction('accounting.coa.delete_used', SEEDED_USERS.viewer_user), 'blocked'],
];

let pass = 0;
let fail = 0;
for (const [label, fn, expected] of CASES) {
  let actual;
  try {
    actual = fn();
  } catch (error) {
    actual = `error: ${error.message}`;
  }
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  expected=${expected}  actual=${actual}`);
  if (ok) pass += 1;
  else fail += 1;
}

console.log(`\n${pass}/${pass + fail} passed.`);
process.exit(fail === 0 ? 0 : 1);
