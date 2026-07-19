// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('crypto');

const EVENT_REPLAY_LIMIT = 100;
const EVENT_MAX_ROWS = 10000;
const EVENT_RETENTION_DAYS = 14;
const HEARTBEAT_MS = 25000;
const MAX_PENDING_WRITES = 32;
const SECRET_KEY = /(pass(word)?|secret|token|api[_-]?key|cookie|session|authorization|private[_-]?key|salt)/i;

function json(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function redact(value, depth = 0) {
  if (depth > 8) return '[redacted-depth]';
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 4000) : value;
  const output = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    output[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(child, depth + 1);
  }
  return output;
}

function normalizeAudience(audience) {
  if (!audience) return { kind: 'broadcast' };
  if (typeof audience === 'string') return { kind: audience };
  return redact(audience);
}

function rowToEvent(row) {
  return {
    id: String(row.event_id),
    type: row.event_type,
    timestamp: row.occurred_at,
    scope: {
      tenantId: row.tenant_id || null,
      companyId: row.company_id || null,
      userId: row.user_id || null,
      audience: json(row.audience_json, { kind: 'broadcast' }),
    },
    requiredPermission: row.required_permission || null,
    entity: row.entity || null,
    recordId: row.record_id || null,
    payload: json(row.payload_json, {}),
  };
}

function canDeliver(event, context, canPermission) {
  const scope = event.scope || {};
  if (scope.tenantId && scope.tenantId !== context.tenantId) return false;
  if (scope.companyId && scope.companyId !== context.companyId) return false;
  if (scope.userId && scope.userId !== context.userId) return false;
  const audience = scope.audience || {};
  if (Array.isArray(audience.userIds) && !audience.userIds.map(String).includes(String(context.userId))) return false;
  if (audience.role && !(context.roles || []).includes(audience.role)) return false;
  if (event.requiredPermission && typeof canPermission === 'function' && !canPermission(context, event.requiredPermission)) return false;
  return true;
}

function createEventService(options = {}) {
  const db = options.db;
  if (!db || typeof db.prepare !== 'function') throw new Error('createEventService requires a database handle');
  const subscribers = new Set();

  function prune() {
    const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86400000).toISOString();
    db.prepare('DELETE FROM vnext_event_log WHERE expires_at < ?').run(new Date().toISOString());
    const count = Number(db.prepare('SELECT COUNT(*) AS n FROM vnext_event_log').get().n || 0);
    if (count > EVENT_MAX_ROWS) {
      db.prepare(`DELETE FROM vnext_event_log WHERE event_id IN (
        SELECT event_id FROM vnext_event_log ORDER BY event_id ASC LIMIT ?
      )`).run(count - EVENT_MAX_ROWS);
    }
    return { cutoff, count: Math.min(count, EVENT_MAX_ROWS) };
  }

  function visibleForRow(row, context) {
    return canDeliver(rowToEvent(row), context, options.canPermission);
  }

  function writeSubscriber(subscriber, event) {
    if (!subscriber || subscriber.closed || subscriber.pending >= MAX_PENDING_WRITES) {
      if (subscriber) subscriber.close('backpressure');
      return false;
    }
    subscriber.pending += 1;
    try {
      // Keep the wire event unnamed so every typed envelope reaches the
      // browser's generic EventSource.onmessage handler. The canonical event
      // type remains in the JSON envelope (`data.type`).
      const frame = `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
      const accepted = subscriber.res.write(frame);
      if (accepted === false) subscriber.close('backpressure');
      return accepted !== false;
    } catch (_) {
      subscriber.close('write_error');
      return false;
    } finally {
      subscriber.pending = Math.max(0, subscriber.pending - 1);
    }
  }

  function deliver(event) {
    for (const subscriber of [...subscribers]) {
      if (canDeliver(event, subscriber.context, options.canPermission)) writeSubscriber(subscriber, event);
    }
  }

  function publish(input = {}) {
    const type = String(input.type || input.eventType || '').trim();
    if (!/^[a-z0-9][a-z0-9._:-]{1,120}$/i.test(type)) throw new Error('event type is required');
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + EVENT_RETENTION_DAYS * 86400000).toISOString();
    const audience = normalizeAudience(input.audience);
    const payload = redact(input.payload || {});
    const result = db.prepare(`INSERT INTO vnext_event_log
      (event_type, occurred_at, tenant_id, company_id, user_id, audience_json, required_permission, entity, record_id, payload_json, created_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(type, timestamp, input.tenantId || null, input.companyId || null, input.userId || null,
        JSON.stringify(audience), input.requiredPermission || null, input.entity || null, input.recordId || null,
        JSON.stringify(payload), input.createdBy || null, expiresAt);
    const event = {
      id: String(result.lastInsertRowid), type, timestamp,
      scope: { tenantId: input.tenantId || null, companyId: input.companyId || null, userId: input.userId || null, audience },
      requiredPermission: input.requiredPermission || null, entity: input.entity || null, recordId: input.recordId || null, payload,
    };
    deliver(event);
    if (Number(result.lastInsertRowid) % 100 === 0) prune();
    return event;
  }

  function replay(cursor, context, limit = EVENT_REPLAY_LIMIT) {
    const after = Math.max(0, Number(cursor) || 0);
    const rows = db.prepare('SELECT * FROM vnext_event_log WHERE event_id > ? AND expires_at >= ? ORDER BY event_id ASC LIMIT ?')
      .all(after, new Date().toISOString(), Math.min(EVENT_REPLAY_LIMIT, Math.max(1, Number(limit) || EVENT_REPLAY_LIMIT)));
    return rows.filter(row => visibleForRow(row, context)).map(rowToEvent);
  }

  function subscribe(res, context, cursor = 0) {
    const subscriber = { res, context, pending: 0, closed: false, heartbeat: null, close: null };
    const cleanup = reason => {
      if (subscriber.closed) return;
      subscriber.closed = true;
      subscribers.delete(subscriber);
      if (subscriber.heartbeat) clearInterval(subscriber.heartbeat);
      try { if (!res.writableEnded) res.end(); } catch (_) {}
      return reason;
    };
    subscriber.close = cleanup;
    subscribers.add(subscriber);
    subscriber.heartbeat = setInterval(() => {
      if (subscriber.closed) return;
      try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch (_) { cleanup('heartbeat_error'); }
    }, HEARTBEAT_MS);
    if (typeof subscriber.heartbeat.unref === 'function') subscriber.heartbeat.unref();
    return { subscriber, replay: replay(cursor, context) };
  }

  return { publish, prune, replay, subscribe, rowToEvent, canDeliver, subscribers };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload || {}))).digest('hex');
}

const PROHIBITED_COMMAND = /(finance|stock|inventory|approval|identity|permission|payroll|timesheet|attendance|admin|role|tenant|company|tax|payment|audit|message|whatsapp)/i;
const PLATFORM_COMMANDS = new Set(['platform.noop', 'platform.ping']);
const DOMAIN_COMMANDS = new Set(['pos.sale']);

function mountConnectivityRoutes(options = {}) {
  const db = options.db;
  const events = options.events || createEventService({ db, canPermission: options.canPermission });
  const readBody = options.readRequestBody || (req => new Promise((resolve, reject) => {
    let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 256 * 1024) req.destroy(); });
    req.on('end', () => resolve(raw)); req.on('error', reject);
  }));
  const sendJson = options.sendJson || ((res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); });

  function error(res, status, code, message) { sendJson(res, status, { success: false, error: message, code }); }
  function contextFor(req, session) {
    const scope = typeof options.resolveScope === 'function' ? options.resolveScope(req, session) : {};
    if (scope && scope.error) return scope;
    return { userId: String(session.userId || session.user?.id || ''), roles: session.groups || [], ...scope };
  }

  function handleEvents(req, res, url) {
    if (url.pathname !== '/api/vnext/events' || req.method !== 'GET') return false;
    const session = options.requireSession(req, res, { allowLocalDev: false });
    if (!session.ok) return true;
    const context = contextFor(req, session);
    if (context.error) { error(res, context.error.status || 403, context.error.code || 'SCOPE_DENIED', context.error.message || 'scope denied'); return true; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    const cursor = url.searchParams.get('cursor') || req.headers['last-event-id'] || 0;
    const connection = events.subscribe(res, context, cursor);
    for (const event of connection.replay) writeSubscriberForRoute(res, event);
    req.on('close', () => connection.subscriber.close('client_disconnect'));
    res.on('close', () => connection.subscriber.close('response_close'));
    return true;
  }

  function writeSubscriberForRoute(res, event) {
    try { if (!res.writableEnded) res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`); } catch (_) {}
  }

  async function handleCommand(req, res, url) {
    if (url.pathname !== '/api/vnext/commands' || req.method !== 'POST') return false;
    const session = options.requireSession(req, res, { allowLocalDev: false });
    if (!session.ok) return true;
    const context = contextFor(req, session);
    if (context.error) { error(res, context.error.status || 403, context.error.code || 'SCOPE_DENIED', context.error.message || 'scope denied'); return true; }
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); } catch (_) { error(res, 400, 'INVALID_JSON', 'Invalid JSON body'); return true; }
    const command = body.command && typeof body.command === 'object' ? body.command : body;
    const key = String(command.idempotency_key || command.idempotencyKey || '').trim();
    const type = String(command.type || '').trim();
    const payload = command.payload && typeof command.payload === 'object' ? command.payload : {};
    if (!key || key.length > 180 || !type) { error(res, 400, 'INVALID_COMMAND', 'idempotency_key and type are required'); return true; }
    if (PROHIBITED_COMMAND.test(type) || (!PLATFORM_COMMANDS.has(type) && !DOMAIN_COMMANDS.has(type))) { error(res, 403, 'OFFLINE_PROHIBITED', 'Offline command is not allowed by the connectivity contract'); return true; }
    if ((command.company_id || command.companyId) && String(command.company_id || command.companyId) !== String(context.companyId || '')) { error(res, 403, 'SCOPE_MISMATCH', 'command company scope does not match the authenticated session'); return true; }
    if (DOMAIN_COMMANDS.has(type)) {
      if (typeof options.posCommand !== 'function') { error(res, 503, 'POS_NOT_MOUNTED', 'POS offline command handler is not mounted'); return true; }
      try {
        const response = await options.posCommand({ ...context, userId: context.userId }, { ...command, type, idempotency_key: key, payload });
        sendJson(res, response?.statusCode || 200, response?.body || response);
      } catch (cause) {
        error(res, cause.statusCode || 400, cause.code || 'POS_COMMAND_FAILED', cause.message || 'POS command failed');
      }
      return true;
    }
    const hash = payloadHash(payload);
    const existing = db.prepare('SELECT * FROM vnext_command_idempotency WHERE idempotency_key = ?').get(key);
    if (existing) {
      const same = existing.actor_id === context.userId && (existing.tenant_id || '') === (context.tenantId || '') && (existing.company_id || '') === (context.companyId || '') && existing.command_type === type && existing.payload_hash === hash;
      if (!same) { error(res, 409, 'IDEMPOTENCY_CONFLICT', 'idempotency key is already bound to another actor, scope, type, or payload'); return true; }
      const replay = { ...json(existing.response_json, {}), replayed: true };
      sendJson(res, 200, replay); return true;
    }
    const now = new Date().toISOString();
    const response = { success: true, command: { idempotencyKey: key, type, actorId: context.userId, tenantId: context.tenantId || null, companyId: context.companyId || null, timestamp: now, payloadHash: hash }, replayed: false };
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`INSERT INTO vnext_command_idempotency
        (idempotency_key, actor_id, tenant_id, company_id, command_type, payload_hash, status, response_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`)
        .run(key, context.userId, context.tenantId || null, context.companyId || null, type, hash, JSON.stringify(response), now, now);
      events.publish({ type: 'platform.command.accepted', tenantId: context.tenantId, companyId: context.companyId, userId: context.userId, audience: { kind: 'user' }, payload: { type, idempotencyKey: key, payloadHash: hash }, createdBy: context.userId });
      db.exec('COMMIT');
    } catch (cause) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw cause;
    }
    sendJson(res, 200, response);
    return true;
  }

  function handle(req, res, url) {
    if (url.pathname === '/api/vnext/events') return handleEvents(req, res, url);
    if (url.pathname === '/api/vnext/commands') { void handleCommand(req, res, url).catch(cause => error(res, 500, 'COMMAND_FAILED', cause.message || 'command failed')); return true; }
    return false;
  }

  return { handle, events, publish: events.publish, prune: events.prune };
}

module.exports = { createEventService, mountConnectivityRoutes, payloadHash, redact, canDeliver };
