// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const { writeAudit } = require('../audit/audit');

const API_BASE = '/api/x/approvals';

// Canonical RuoYi-pattern nine work queues (OCTAGON_VNEXT_MASTER_ROADMAP.md R1.9 /
// T1.9.2). Meaning of each box is documented in TASK.md; summarized here:
//   my         - requests I submitted (any status)
//   todo       - pending my decision right now (direct role or active delegation)
//   done       - requests I decided that finished approved
//   cc         - requests I am copied on (any status)
//   delegated  - pending requests visible to me ONLY because someone delegated
//                their approval authority to me (RuoYi "delegated to me" meaning)
//   escalated  - requests that hit their policy's escalation_timeout and moved up
//   withdrawn  - requester withdrew before a decision was made
//   rejected   - terminal-rejected
//   returned   - sent back to the requester for revision
const BOXES = new Set(['my', 'todo', 'done', 'cc', 'delegated', 'escalated', 'withdrawn', 'rejected', 'returned']);
const STATUSES = new Set(['pending', 'approved', 'rejected', 'returned', 'withdrawn']);

// Safety cap on rows scanned per box query. Kernel-phase scale limit — see TASK.md.
const CANDIDATE_LIMIT = 2000;

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

function parseJson(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 4000);
}

function approvalId() {
  return `apr_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function normalizeCc(value) {
  const source = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
  return [...new Set(source.map(item => clean(item, 120)).filter(Boolean))].slice(0, 50);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
}

function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload || {}))).digest('hex');
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

function rowToApproval(row) {
  return {
    id: row.id,
    entity: row.entity,
    record_id: row.record_id,
    action: row.action,
    payload: parseJson(row.payload, {}),
    requester: row.requester,
    approver_role: row.approver_role,
    status: row.status,
    decided_by: row.decided_by || '',
    decided_at: row.decided_at || '',
    cc: normalizeCc(parseJson(row.cc, [])),
    created_at: row.created_at,
    step_entered_at: row.step_entered_at || row.created_at,
    escalated: Number(row.escalated) ? 1 : 0,
    escalated_at: row.escalated_at || '',
    escalated_from_role: row.escalated_from_role || '',
  };
}

function userContext(req, deps) {
  let session = null;
  try {
    const active = deps.authSessionFromRequest && deps.authSessionFromRequest(req);
    session = active && (active.session || active);
  } catch (_) {}
  const header = req.headers || {};
  const user = clean((session && (session.userId || session.id || session.user)) || header['x-user'] || 'local', 120);
  const rawRoles = (session && (session.roles || session.groups || session.role)) || header['x-roles'] || header['x-role'] || '';
  const roles = Array.isArray(rawRoles) ? rawRoles : String(rawRoles).split(',');
  return { user: user || 'local', roles: roles.map(role => clean(role, 120)).filter(Boolean) };
}

function createApproval(db, input, requester) {
  const entity = clean(input.entity, 120);
  const recordId = clean(input.record_id || input.recordId, 160);
  const action = clean(input.action, 120);
  if (!entity || !recordId || !action) {
    return { status: 400, json: envelope(null, 'entity, record_id and action are required') };
  }

  // Check policy
  const policyRow = db.prepare('SELECT policy_chain, authority_limit FROM x_approval_policies WHERE entity = ?').get(entity);
  let chain = [];
  let limit = 0.0;
  if (policyRow) {
    chain = parseJson(policyRow.policy_chain, []);
    limit = Number(policyRow.authority_limit || 0.0);
  }

  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
  const amount = Number(payload.amount || payload.total || 0.0);

  // Authority limits check
  if (limit > 0.0 && amount > limit) {
    // If amount exceeds limit, require an admin or CFO escalation
    chain = [...chain, 'admin'];
  }

  let approverRole = clean(input.approver_role || input.approverRole || 'manager', 120);
  if (chain.length > 0) {
    const firstStep = chain[0];
    approverRole = Array.isArray(firstStep) ? firstStep.join(',') : String(firstStep);
    payload._policy = {
      chain,
      currentIndex: 0,
      approvedRoles: [],
      history: []
    };
  }

  const item = {
    id: approvalId(), entity, record_id: recordId, action,
    payload, requester, approver_role: approverRole, status: 'pending',
    decided_by: '', decided_at: '', cc: normalizeCc(input.cc), created_at: new Date().toISOString(),
  };
  const values = [item.id, item.entity, item.record_id, item.action, JSON.stringify(item.payload), item.requester,
    item.approver_role, item.status, '', '', JSON.stringify(item.cc), item.created_at, item.created_at];
  const columns = ['id', 'entity', 'record_id', 'action', 'payload', 'requester', 'approver_role', 'status', 'decided_by', 'decided_at', 'cc', 'created_at', 'step_entered_at'];
  const placeholders = ['?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?', '?'];
  if (hasColumn(db, 'x_approvals', 'company_id')) { columns.push('company_id'); placeholders.push('?'); values.push(clean(input.company_id, 120)); }
  if (hasColumn(db, 'x_approvals', 'tenant_id')) { columns.push('tenant_id'); placeholders.push('?'); values.push(clean(input.tenant_id || input.company_id, 120)); }
  if (hasColumn(db, 'x_approvals', 'payload_hash')) { columns.push('payload_hash'); placeholders.push('?'); values.push(payloadHash(item.payload)); }
  if (hasColumn(db, 'x_approvals', 'requester_id')) { columns.push('requester_id'); placeholders.push('?'); values.push(String(requester || '')); }
  if (hasColumn(db, 'x_approvals', 'expires_at')) { columns.push('expires_at'); placeholders.push('?'); values.push(input.expires_at || null); }
  db.prepare(`INSERT INTO x_approvals (${columns.join(',')}) VALUES (${placeholders.join(',')})`).run(...values);
  return { status: 201, json: envelope(item) };
}

function getApprovedApproval(db, input = {}) {
  if (!input.id || !input.companyId || !input.entity || !input.recordId) return false;
  const row = db.prepare('SELECT * FROM x_approvals WHERE id = ?').get(clean(input.id, 180));
  if (!row || row.status !== 'approved') return null;
  if (hasColumn(db, 'x_approvals', 'company_id') && row.company_id !== String(input.companyId)) return null;
  if (hasColumn(db, 'x_approvals', 'tenant_id') && input.tenantId && row.tenant_id !== String(input.tenantId)) return null;
  if (row.entity !== String(input.entity) || row.record_id !== String(input.recordId)) return null;
  if (input.action && row.action !== String(input.action)) return null;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;
  const payload = parseJson(row.payload, {});
  if (hasColumn(db, 'x_approvals', 'payload_hash') && row.payload_hash !== payloadHash(payload)) return null;
  const requester = String(row.requester_id || row.requester || '');
  const approver = String(row.decided_by || '');
  if (!requester || !approver || requester === approver) return null;
  return row;
}

function approvalMatches(db, input = {}) {
  return Boolean(getApprovedApproval(db, input));
}

/**
 * Own roles + roles held by anyone who has actively delegated to `context.user`
 * (x_approval_delegations). `delegatedRoles` excludes anything already in
 * `ownRoles` so the two sets stay disjoint for the 'todo' vs 'delegated' box
 * distinction. R1 scope note: this operates purely on the sequential
 * single-role-per-step model; it does not read/write policy.approvedRoles
 * (the parallel-step voting field — see TASK.md "flagged finding").
 */
function resolveRoleAccess(db, context) {
  const ownRoles = new Set((context.roles || []).filter(Boolean));
  const delegatedRoles = new Set();
  if (context.user && context.user !== 'local') {
    const delegators = db.prepare('SELECT user FROM x_approval_delegations WHERE delegate = ? AND expires_at > ?')
      .all(context.user, new Date().toISOString()).map(row => row.user);
    for (const delegator of delegators) {
      const sessionRow = db.prepare('SELECT role FROM auth_sessions WHERE userId = ? ORDER BY expiresAt DESC LIMIT 1').get(delegator);
      const delegatorRole = sessionRow && sessionRow.role;
      if (delegatorRole && !ownRoles.has(delegatorRole)) delegatedRoles.add(delegatorRole);
    }
  }
  const isAdmin = ownRoles.has('admin') || ownRoles.has('all');
  return { ownRoles, delegatedRoles, isAdmin };
}

/** SQL LIKE fragment matching a comma-delimited approver_role column against any of `roles`. */
function roleLikeClause(column, roles) {
  const list = [...roles].filter(Boolean);
  if (!list.length) return { sql: '0', params: [] };
  const clauses = list.map(() => `((',' || ${column} || ',') LIKE ? ESCAPE '\\')`);
  const params = list.map(role => '%,' + String(role).replace(/[\\%_]/g, ch => '\\' + ch) + ',%');
  return { sql: '(' + clauses.join(' OR ') + ')', params };
}

function userParticipated(item, user) {
  const policy = item.payload && item.payload._policy;
  const history = policy && Array.isArray(policy.history) ? policy.history : [];
  return history.some(entry => entry && entry.user === user);
}

function visibleFor(box, item, context, access) {
  if (access.isAdmin) return true;
  const user = context.user;
  if (box === 'done') return item.decided_by === user || userParticipated(item, user);
  // rejected/returned: requester needs visibility too (must know why + act on 'returned').
  return item.requester === user || item.decided_by === user || item.cc.includes(user) || userParticipated(item, user);
}

/** Full (unpaginated, box-filtered) row set for one box — shared by listApprovals() and boxCounts(). */
function queryBoxRows(db, box, context, access) {
  const ccPattern = '%"' + context.user.replace(/[%_]/g, '') + '"%';
  let where; let params;

  if (box === 'my') {
    where = 'requester = ?'; params = [context.user];
  } else if (box === 'cc') {
    where = 'cc LIKE ?'; params = [ccPattern];
  } else if (box === 'withdrawn') {
    if (access.isAdmin) { where = "status = 'withdrawn'"; params = []; }
    else { where = "status = 'withdrawn' AND (requester = ? OR cc LIKE ?)"; params = [context.user, ccPattern]; }
  } else if (box === 'todo') {
    if (context.user === 'local' || access.isAdmin) { where = "status = 'pending'"; params = []; }
    else {
      const roles = [...access.ownRoles, ...access.delegatedRoles];
      const clause = roleLikeClause('approver_role', roles);
      where = `status = 'pending' AND (${clause.sql} OR approver_role = 'all')`;
      params = [...clause.params];
    }
  } else if (box === 'delegated') {
    if (!access.delegatedRoles.size) { where = '0'; params = []; }
    else {
      const clause = roleLikeClause('approver_role', [...access.delegatedRoles]);
      where = `status = 'pending' AND (${clause.sql})`;
      params = [...clause.params];
    }
  } else if (box === 'escalated') {
    if (access.isAdmin) { where = 'escalated = 1'; params = []; }
    else {
      const roles = [...access.ownRoles, ...access.delegatedRoles];
      const clause = roleLikeClause('approver_role', roles);
      where = `escalated = 1 AND (requester = ? OR ${clause.sql} OR approver_role = 'all')`;
      params = [context.user, ...clause.params];
    }
  } else if (box === 'done') {
    where = "status = 'approved'"; params = [];
  } else if (box === 'rejected') {
    where = "status = 'rejected'"; params = [];
  } else { // returned
    where = "status = 'returned'"; params = [];
  }

  const rows = db.prepare(`SELECT * FROM x_approvals WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(...params, CANDIDATE_LIMIT).map(rowToApproval);

  if (box === 'done' || box === 'rejected' || box === 'returned') {
    return rows.filter(item => visibleFor(box, item, context, access));
  }
  return rows;
}

function listApprovals(db, query, context) {
  const box = BOXES.has(query.box) ? query.box : 'todo';
  if (box === 'todo' && !context.roles.length && context.user !== 'local') {
    return { status: 403, json: envelope(null, 'approver role is required') };
  }
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const access = resolveRoleAccess(db, context);
  const rows = queryBoxRows(db, box, context, access);
  const total = rows.length;
  const paged = rows.slice((page - 1) * limit, page * limit);
  return { status: 200, json: envelope(paged, null, { total, page, limit, box }) };
}

/** Counts for all nine boxes in a single call (feeds the inbox UI's per-tab badges). */
function boxCounts(db, context) {
  const access = resolveRoleAccess(db, context);
  const counts = {};
  for (const box of BOXES) counts[box] = queryBoxRows(db, box, context, access).length;
  return { status: 200, json: envelope(counts) };
}

/**
 * T1.9.1(a) timeout escalation. Invoked on-demand (mirrors the retry/scheduling
 * pattern already used by vnext/server/workflow/workflow-engine.js, without
 * depending on it) whenever the approvals list/counts endpoints are hit.
 * R1 scope note: sequential chain only — chain[currentIndex] is treated as a
 * single role string; this function does not touch policy.approvedRoles.
 */
function runEscalationSweep(db, notifyRequester) {
  const nowIso = new Date().toISOString();
  const candidates = db.prepare(`
    SELECT a.*, p.escalation_timeout_minutes AS timeout_minutes
    FROM x_approvals a
    JOIN x_approval_policies p ON p.entity = a.entity
    WHERE a.status = 'pending' AND p.escalation_timeout_minutes > 0
  `).all();

  let escalatedCount = 0;
  for (const row of candidates) {
    const enteredAt = row.step_entered_at || row.created_at;
    const enteredMs = Date.parse(enteredAt);
    if (!Number.isFinite(enteredMs)) continue;
    const elapsedMinutes = (Date.now() - enteredMs) / 60000;
    if (elapsedMinutes < Number(row.timeout_minutes)) continue;

    const item = rowToApproval(row);
    const previousRole = item.approver_role;
    const policy = item.payload && item.payload._policy;
    let nextRole = 'admin'; // sequential fallback target when the chain has no further step

    if (policy && Array.isArray(policy.chain) && Number.isInteger(policy.currentIndex) && policy.currentIndex < policy.chain.length - 1) {
      policy.currentIndex += 1;
      nextRole = String(policy.chain[policy.currentIndex]);
      policy.history = Array.isArray(policy.history) ? policy.history : [];
      policy.history.push({ step: previousRole, user: 'system', decision: 'escalated_timeout', at: nowIso });
    } else if (policy) {
      policy.history = Array.isArray(policy.history) ? policy.history : [];
      policy.history.push({ step: previousRole, user: 'system', decision: 'escalated_timeout', at: nowIso });
    }

    const nextPayload = { ...item.payload };
    if (policy) nextPayload._policy = policy;

    db.prepare(`
      UPDATE x_approvals
      SET approver_role = ?, payload = ?, escalated = 1, escalated_at = ?, escalated_from_role = ?, step_entered_at = ?
      WHERE id = ?
    `).run(nextRole, JSON.stringify(nextPayload), nowIso, previousRole, nowIso, item.id);

    writeAudit(db, {
      entity: item.entity, recordId: item.record_id, user: 'system', action: 'approval_escalated_timeout',
      before: { approver_role: previousRole }, after: { approver_role: nextRole },
    });

    if (typeof notifyRequester === 'function') {
      try {
        notifyRequester({
          user: item.requester,
          title: 'تم تصعيد طلبك تلقائيًا',
          body: `${item.action} — ${item.entity} (تجاوز مهلة الرد المحددة)`,
          link: `#${item.entity}/${item.record_id}`,
        });
      } catch (_) {}
    }
    escalatedCount += 1;
  }
  return escalatedCount;
}

/**
 * T1.9.1(b) withdraw. Only the original requester may withdraw, and only
 * while status is still 'pending'. Setting status to a terminal 'withdrawn'
 * value is the release mechanism for "unblocking the document": the doc-state
 * engine (vnext/server/state/doc-state.js, owned by another lane) holds no
 * direct reference to x_approvals today, so the sole signal any other engine
 * should check before treating a record as approval-blocked is
 * `status = 'pending'` on its x_approvals row — withdrawal clears exactly
 * that signal. See TASK.md for the full reasoning.
 */
function withdrawApproval(db, id, context, notifyRequester) {
  const row = db.prepare('SELECT * FROM x_approvals WHERE id = ?').get(clean(id, 180));
  if (!row) return { status: 404, json: envelope(null, 'approval not found') };
  const item = rowToApproval(row);
  if (item.requester !== context.user) {
    return { status: 403, json: envelope(null, 'فقط مقدّم الطلب يمكنه سحبه') };
  }
  if (item.status !== 'pending') {
    return { status: 409, json: envelope(null, `لا يمكن سحب الطلب لأن حالته الحالية [${item.status}]`) };
  }

  const decidedAt = new Date().toISOString();
  db.prepare('UPDATE x_approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
    .run('withdrawn', context.user, decidedAt, item.id);
  const result = { ...item, status: 'withdrawn', decided_by: context.user, decided_at: decidedAt };

  writeAudit(db, { entity: item.entity, recordId: item.record_id, user: context.user, action: 'approval_withdrawn', before: item, after: result });

  if (typeof notifyRequester === 'function') {
    item.cc.filter(u => u !== context.user).forEach(u => {
      try {
        notifyRequester({ user: u, title: 'تم سحب طلب موافقة', body: `${item.action} — ${item.entity}`, link: `#${item.entity}/${item.record_id}` });
      } catch (_) {}
    });
  }
  return { status: 200, json: envelope(result) };
}

function userHasApprovalRole(db, context, requiredRolesStr) {
  if (context.user === 'local' || context.roles.includes('admin') || context.roles.includes('all')) return true;
  const reqRoles = requiredRolesStr.split(',').map(r => r.trim());

  // Check delegation
  const delegatedUsers = db.prepare('SELECT user FROM x_approval_delegations WHERE delegate = ? AND expires_at > ?')
    .all(context.user, new Date().toISOString()).map(row => row.user);

  const allUsers = [context.user, ...delegatedUsers];

  // Check if any active user/delegate has the role
  for (const r of reqRoles) {
    if (context.roles.includes(r)) return true;
    for (const u of allUsers) {
      // Find role of delegator
      const sessionRow = db.prepare('SELECT role FROM auth_sessions WHERE userId = ? ORDER BY expiresAt DESC LIMIT 1').get(u);
      if (sessionRow && sessionRow.role === r) return true;
    }
  }
  return false;
}

function decideApproval(db, id, decision, context, notifyRequester) {
  const row = db.prepare('SELECT * FROM x_approvals WHERE id = ?').get(clean(id, 180));
  if (!row) return { status: 404, json: envelope(null, 'approval not found') };
  const item = rowToApproval(row);
  if (item.status !== 'pending') return { status: 409, json: envelope(null, `approval is already ${item.status}`) };

  // Verify role access (including delegation)
  if (!userHasApprovalRole(db, context, item.approver_role)) {
    return { status: 403, json: envelope(null, 'ليس لديك صلاحية لاعتماد هذا الطلب') };
  }

  // Maker-checker separation rule
  if (item.requester === context.user) {
    return { status: 403, json: envelope(null, 'قاعدة فصل المهام: لا يمكن للمنشئ الموافقة على طلبه') };
  }

  const decidedAt = new Date().toISOString();
  const policy = item.payload._policy;

  if (decision === 'reject' || decision === 'return') {
    const status = decision === 'reject' ? 'rejected' : 'returned';
    db.prepare('UPDATE x_approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
      .run(status, context.user, decidedAt, item.id);
    const result = { ...item, status, decided_by: context.user, decided_at: decidedAt };
    if (typeof notifyRequester === 'function') {
      notifyRequester({
        user: result.requester,
        title: status === 'rejected' ? 'تم رفض طلبك' : 'تم إرجاع طلبك للتعديل',
        body: `${result.action} — ${result.entity}`,
        link: `#${result.entity}/${result.record_id}`,
      });
    }
    writeAudit(db, { entity: item.entity, recordId: item.record_id, user: context.user, action: `approval_${status}`, before: item, after: result });
    return { status: 200, json: envelope(result) };
  }

  // Handle Approval Action
  if (policy) {
    const currentStep = policy.chain[policy.currentIndex];
    const isParallel = Array.isArray(currentStep);

    if (isParallel) {
      // Parallel step: check if all parallel roles have approved
      const userRoleInStep = context.roles.find(r => currentStep.includes(r));
      if (userRoleInStep && !policy.approvedRoles.includes(userRoleInStep)) {
        policy.approvedRoles.push(userRoleInStep);
      }
      policy.history.push({ step: currentStep, user: context.user, decision: 'approved', at: decidedAt });

      const allApproved = currentStep.every(r => policy.approvedRoles.includes(r));
      if (!allApproved) {
        // Still pending more parallel approvals
        db.prepare('UPDATE x_approvals SET payload = ? WHERE id = ?')
          .run(JSON.stringify(item.payload), item.id);
        return { status: 200, json: envelope({ ...item, message: 'تم تسجيل موافقتك، في انتظار باقي الموافقين' }) };
      }
    } else {
      policy.history.push({ step: currentStep, user: context.user, decision: 'approved', at: decidedAt });
    }

    // Advance to next step if exists
    if (policy.currentIndex < policy.chain.length - 1) {
      policy.currentIndex += 1;
      policy.approvedRoles = []; // clear for next parallel step
      const nextStep = policy.chain[policy.currentIndex];
      const nextRole = Array.isArray(nextStep) ? nextStep.join(',') : String(nextStep);

      db.prepare('UPDATE x_approvals SET approver_role = ?, payload = ?, step_entered_at = ? WHERE id = ?')
        .run(nextRole, JSON.stringify(item.payload), decidedAt, item.id);

      const advanced = { ...item, approver_role: nextRole, step_entered_at: decidedAt };
      writeAudit(db, { entity: item.entity, recordId: item.record_id, user: context.user, action: 'approval_step_completed', before: item, after: advanced });
      return { status: 200, json: envelope(advanced) };
    }
  }

  // End of approval chain or no policy: fully approve
  db.prepare('UPDATE x_approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?')
    .run('approved', context.user, decidedAt, item.id);

  const finalResult = { ...item, status: 'approved', decided_by: context.user, decided_at: decidedAt };
  if (typeof notifyRequester === 'function') {
    notifyRequester({
      user: finalResult.requester,
      title: 'تمت الموافقة النهائية على طلبك',
      body: `${finalResult.action} — ${finalResult.entity}`,
      link: `#${finalResult.entity}/${finalResult.record_id}`,
    });
  }
  writeAudit(db, { entity: finalResult.entity, recordId: finalResult.record_id, user: context.user, action: 'approval_approved', before: item, after: finalResult });
  return { status: 200, json: envelope(finalResult) };
}

function dispatch(db, method, pathname, query, body, context, notifyRequester) {
  const rest = pathname.slice(API_BASE.length).replace(/^\/+|\/+$/g, '');
  const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1 && parts[0] === 'request' && method === 'POST') return createApproval(db, body || {}, context.user);
  if (parts.length === 1 && parts[0] === 'list' && method === 'GET') {
    runEscalationSweep(db, notifyRequester);
    return listApprovals(db, query || {}, context);
  }
  if (parts.length === 1 && parts[0] === 'counts' && method === 'GET') {
    runEscalationSweep(db, notifyRequester);
    return boxCounts(db, context);
  }
  if (parts.length === 2 && parts[0] === 'withdraw' && method === 'POST') return withdrawApproval(db, parts[1], context, notifyRequester);
  if (parts.length === 2 && (parts[0] === 'approve' || parts[0] === 'reject' || parts[0] === 'return') && method === 'POST') {
    return decideApproval(db, parts[1], parts[0], context, notifyRequester);
  }
  return { status: 404, json: envelope(null, 'approval route not found') };
}

function createApprovalHandler(deps) {
  const db = deps && deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('createApprovalHandler requires sqlite db');
  return {
    handle(req, res, url, notifyRequester) {
      if (!url.pathname.startsWith(API_BASE + '/')) return false;
      const respond = result => {
        const text = JSON.stringify(result.json);
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };
      const run = body => {
        try {
          const result = dispatch(db, req.method, url.pathname, Object.fromEntries(url.searchParams), body, userContext(req, deps), notifyRequester);
          const item = result && result.json && result.json.data;
          if (deps.events && item && item.id && item.status) {
            let companyId = null;
            try {
              const record = db.prepare('SELECT company_id FROM x_records WHERE entity = ? AND id = ?').get(item.entity, item.record_id);
              companyId = record && record.company_id;
            } catch (_) {}
            try {
              deps.events.publish({
                type: 'approval.state_changed', companyId: companyId || null, userId: item.requester || null,
                audience: { kind: 'user' }, entity: item.entity, recordId: item.record_id,
                requiredPermission: 'platform:approval:read',
                payload: { approvalId: item.id, status: item.status, action: item.action }, createdBy: userContext(req, deps).user,
              });
            } catch (_) {}
          }
          respond(result);
        }
        catch (error) { respond({ status: 500, json: envelope(null, error.message || 'approval failed') }); }
      };
      if (req.method === 'GET') { run(null); return true; }
      let raw = '';
      req.on('data', part => { raw += part; if (raw.length > 1024 * 1024) req.destroy(); });
      req.on('end', () => { const body = parseJson(raw, null); if (!body && raw) return respond({ status: 400, json: envelope(null, 'Invalid JSON body') }); run(body || {}); });
      return true;
    },
  };
}

function mountApprovals(app, db, deps) {
  const handler = createApprovalHandler({ ...(deps || {}), db });
  app.use((req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!handler.handle(req, res, url, deps && deps.notifyRequester)) next();
  });
  return app;
}

module.exports = {
  createApprovalHandler,
  mountApprovals,
  _internal: {
    dispatch, createApproval, listApprovals, decideApproval,
    withdrawApproval, runEscalationSweep, boxCounts, queryBoxRows, resolveRoleAccess, approvalMatches, getApprovedApproval, payloadHash,
  },
};
