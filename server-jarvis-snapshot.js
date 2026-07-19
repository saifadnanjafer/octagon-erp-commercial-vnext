/**
 * OCTAGON ERP — SERVER-SIDE JARVIS SNAPSHOT
 * Generates the rich ERP context for the Omni AI Agent.
 */
'use strict';

function safeLen(arr) { return Array.isArray(arr) ? arr.length : 0; }
function safeSlice(arr, limit) { return Array.isArray(arr) ? arr.slice(0, limit) : []; }
function str(v) { return (v == null) ? '' : String(v); }
function trim(v, max) { const s = str(v); return s.length > max ? s.slice(0, max) + '...' : s; }

function estimateSnapshotSize(snapshot) {
  try { return JSON.stringify(snapshot).length; } catch(e) { return 0; }
}

function buildSnapshotSummary(db, options) {
  const o = db.omni || {};
  const f = db.finance || {};
  return {
    employees: safeLen(db.employees),
    materials: safeLen(o.materials),
    customers: safeLen(o.salesCrm?.customers),
    tasks: safeLen(o.taskManager?.tasks),
    pendingApprovals: safeLen(o.approvalHub?.requests),
    machines: safeLen(o.machines),
    accountMoves: safeLen(db.account_moves)
  };
}

function buildModuleSnapshots(db, options) {
  const scope = options.scope || 'brief';
  const o = db.omni || {};
  const f = db.finance || {};
  const isDeep = scope === 'deep';
  const limit = isDeep ? 20 : (scope === 'standard' ? 5 : 0);

  const modules = {};

  if (limit > 0) {
    // Finance
    const allCustomers = Array.isArray(o.salesCrm?.customers) ? o.salesCrm.customers : [];
    const withDebt = allCustomers.filter(c => Number(c.balance || c.debt || 0) !== 0);
    const topDebtors = [...withDebt].sort((a,b) => Math.abs(Number(b.balance||b.debt||0)) - Math.abs(Number(a.balance||a.debt||0)));
    
    modules.finance = {
      totalCustomers: allCustomers.length,
      customersWithDebt: withDebt.length,
      topDebtors: safeSlice(topDebtors, limit).map(c => ({ id: c.id, name: c.name, balance: c.balance || c.debt })),
      recentMoves: safeSlice((db.account_moves || []).slice().reverse(), limit).map(m => ({ id: m.id, date: m.date, ref: m.ref, state: m.state }))
    };

    // Tasks
    const allTasks = Array.isArray(o.taskManager?.tasks) ? o.taskManager.tasks : [];
    const overdueTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date());
    const openTasks = allTasks.filter(t => t.status !== 'done');
    modules.tasks = {
      total: allTasks.length,
      open: openTasks.length,
      overdue: overdueTasks.length,
      recentOverdue: safeSlice(overdueTasks, limit).map(t => ({ id: t.id, title: trim(t.title, 50), due: t.dueDate, assignedTo: t.assignedTo }))
    };

    // Inventory
    const allMats = Array.isArray(o.materials) ? o.materials : [];
    const lowStock = allMats.filter(m => Number(m.stock || m.qty || 0) < Number(m.minStock || 5));
    modules.inventory = {
      totalMaterials: allMats.length,
      lowStockCount: lowStock.length,
      lowStockItems: safeSlice(lowStock, limit).map(m => ({ id: m.id, name: trim(m.name, 50), stock: m.stock || m.qty }))
    };

    // Employees & Attendance
    const allEmp = Array.isArray(db.employees) ? db.employees : [];
    modules.employees = {
      total: allEmp.length,
      active: allEmp.filter(e => e.status !== 'inactive').length,
      recent: safeSlice(allEmp.slice().reverse(), limit).map(e => ({ id: e.id, name: e.name, department: e.department }))
    };
    
    // Approvals
    const approvals = Array.isArray(o.approvalHub?.requests) ? o.approvalHub.requests : [];
    const pendingApp = approvals.filter(a => a.status === 'pending');
    modules.approvals = {
      pendingCount: pendingApp.length,
      recentPending: safeSlice(pendingApp, limit).map(a => ({ id: a.id, title: trim(a.title, 50), target: a.target, requestedBy: a.requestedBy }))
    };
  }

  // Alerts
  const alerts = [];
  const overdueTasksCount = safeLen((o.taskManager?.tasks || []).filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date()));
  if (overdueTasksCount > 0) alerts.push(`${overdueTasksCount} overdue tasks.`);
  const lowStockCount = safeLen((o.materials || []).filter(m => Number(m.stock || m.qty || 0) < Number(m.minStock || 5)));
  if (lowStockCount > 0) alerts.push(`${lowStockCount} items have low stock.`);
  const pendingApprovalsCount = safeLen((o.approvalHub?.requests || []).filter(a => a.status === 'pending'));
  if (pendingApprovalsCount > 0) alerts.push(`${pendingApprovalsCount} approvals pending.`);

  return { data: modules, alerts };
}

function redactSnapshot(snapshot) {
  const jsonStr = JSON.stringify(snapshot, (key, val) => {
    if (key && typeof key === 'string' && (key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('apikey'))) {
      return '[REDACTED]';
    }
    return val;
  });
  return JSON.parse(jsonStr);
}

function buildJarvisSnapshot(options, context) {
  const db = context.db || {};
  const scope = options.scope || 'brief';

  let snapshot = {
    generatedAt: new Date().toISOString(),
    scope: scope,
    system: {
      mode: process.env.NODE_ENV || 'development',
      serverEnforcedTools: require('./server-jarvis-tools').listServerJarvisTools()
    },
    business: buildSnapshotSummary(db, options),
    limitations: [
      "Data is truncated to fit context limits.",
      "Never invent records that are not in this snapshot.",
      "Use appropriate tools to fetch more data or execute actions."
    ]
  };

  const modulesData = buildModuleSnapshots(db, options);
  Object.assign(snapshot, modulesData.data);
  snapshot.alerts = modulesData.alerts;

  snapshot = redactSnapshot(snapshot);
  
  let size = estimateSnapshotSize(snapshot);
  if (size > 100000 && scope !== 'brief') {
    // Failsafe fallback
    options.scope = 'brief';
    return buildJarvisSnapshot(options, context);
  }

  return snapshot;
}

module.exports = {
  buildJarvisSnapshot,
  buildSnapshotSummary,
  buildModuleSnapshots,
  redactSnapshot,
  estimateSnapshotSize
};
