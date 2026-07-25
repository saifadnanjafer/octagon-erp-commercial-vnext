// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.1 (proprietary self, not copied)
// R10.1 data-migration HTTP routes. Thin adapter: every rule lives in the
// migration engine. Routes enforce a real session, ACL permission, and
// server-resolved company scope only; local-dev bypass is rejected. The source
// reference is a name inside the allowlisted source root — never a path from
// the caller — and identity is never taken from the request body.
'use strict';

const engine = require('./migration-engine');

const API_BASE = '/api/x/migration';
const READ_PERMISSION = 'migration:view';
const WRITE_PERMISSION = 'migration:execute';

function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountMigrationRoutes(deps = {}) {
  const { db, sendJson, readRequestBody, requireSession, resolveScope, canPermission, runtime } = deps;
  if (!db) throw new Error('mountMigrationRoutes requires db');

  const write = sendJson || ((res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  });
  const read = readRequestBody || ((req) => new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 512 * 1024) req.destroy(); });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  }));
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };

  function tryAuth(req) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) return null;
    return {
      id: String(session.userId || session.user?.id || ''),
      groups: session.groups || [],
      local: /^local-/.test(session.mode || ''),
    };
  }

  function requireAuth(req, res, permission) {
    const user = tryAuth(req);
    if (!user) { write(res, 401, envelope(null, 'Login session required', { code: 'AUTH_REQUIRED' })); return null; }
    if (user.local) { write(res, 403, envelope(null, 'Local development sessions are rejected', { code: 'LOCAL_DEV_REJECTED' })); return null; }
    const allowed = user.groups.includes('admin')
      || user.groups.includes('system.admin')
      || (typeof canPermission === 'function' && canPermission(user, permission));
    if (!allowed) { write(res, 403, envelope(null, `Permission required: ${permission}`, { code: 'FORBIDDEN' })); return null; }
    return user;
  }

  function scope(req, res, user) {
    const resolved = typeof resolveScope === 'function'
      ? resolveScope(req, { userId: user.id, groups: user.groups, user: { id: user.id } })
      : { companyId: req.headers['x-company-id'] };
    if (resolved?.error) { write(res, resolved.error.status || 403, envelope(null, resolved.error.message, { code: resolved.error.code })); return null; }
    if (!resolved?.companyId) { write(res, 400, envelope(null, 'x-company-id is required', { code: 'COMPANY_SCOPE_REQUIRED' })); return null; }
    return String(resolved.companyId);
  }

  async function body(req) {
    const raw = await read(req);
    try { return raw ? JSON.parse(raw) : {}; } catch (_) {
      const error = new Error('Invalid JSON body');
      error.statusCode = 400; error.code = 'INVALID_JSON';
      throw error;
    }
  }

  function routeError(res, error) {
    write(res, error.statusCode || 400, envelope(null, error.message || 'Migration request failed', { code: error.code || 'MIGRATION_ERROR' }));
  }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;
    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    const isWrite = req.method === 'POST';
    const user = requireAuth(req, res, isWrite ? WRITE_PERMISSION : READ_PERMISSION);
    if (!user) return true;
    const companyId = scope(req, res, user);
    if (!companyId) return true;

    const run = (fn, status = 200) => body(req)
      .then((input) => write(res, status, envelope(fn(input))))
      .catch((error) => routeError(res, error));

    try {
      if (!rest.length && req.method === 'GET') { write(res, 200, envelope(engine.listRuns(db, companyId))); return true; }
      if (rest[0] === 'preview' && rest.length === 1 && req.method === 'POST') { run((input) => engine.previewRun(db, companyId, input)); return true; }
      if (rest[0] === 'runs' && rest.length === 1 && req.method === 'POST') { run((input) => engine.runMigration(db, companyId, input, user.id, runtime), 201); return true; }
      if (rest[0] === 'runs' && rest.length === 2 && req.method === 'GET') { write(res, 200, envelope(engine.getRunReport(db, companyId, rest[1]))); return true; }
      if (rest[0] === 'runs' && rest.length === 3 && rest[2] === 'resume' && req.method === 'POST') {
        run((input) => {
          const existing = engine.getRunReport(db, companyId, rest[1]);
          return engine.runMigration(db, companyId, {
            ...input,
            source_ref: existing.run.source_ref,
            cut_date: existing.run.cut_date,
          }, user.id, runtime);
        });
        return true;
      }
      if (rest[0] === 'trace' && rest.length === 3 && req.method === 'GET') {
        write(res, 200, envelope(engine.traceSource(db, companyId, rest[1], rest[2])));
        return true;
      }
      return false;
    } catch (error) { routeError(res, error); return true; }
  }

  return { handle };
}

module.exports = { mountMigrationRoutes, API_BASE };
