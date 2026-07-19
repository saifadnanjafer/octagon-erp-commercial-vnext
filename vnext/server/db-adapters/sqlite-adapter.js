// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

function normalizeDbError(error) {
  const message = String(error?.message || error || 'database error');
  const code = /UNIQUE|constraint/i.test(message) ? 'CONFLICT' : /locked|busy/i.test(message) ? 'TEMPORARY_UNAVAILABLE' : /no such table|no such column/i.test(message) ? 'SCHEMA_MISMATCH' : 'DATABASE_ERROR';
  return Object.assign(new Error(message), { code, cause: error });
}

function createSqliteAdapter(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('SQLite adapter requires DatabaseSync-like handle');
  const run = (sql, ...params) => { try { return db.prepare(sql).run(...params); } catch (error) { throw normalizeDbError(error); } };
  const get = (sql, ...params) => { try { return db.prepare(sql).get(...params) || null; } catch (error) { throw normalizeDbError(error); } };
  const all = (sql, ...params) => { try { return db.prepare(sql).all(...params); } catch (error) { throw normalizeDbError(error); } };
  const query = (sql, ...params) => all(sql, ...params);
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn({ run, get, all, query }); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch (_) {} throw normalizeDbError(error); }
  };
  return { kind: 'sqlite', capabilities: { transactions: true, returning: false, json: true }, run, get, all, query, transaction, normalizeError: normalizeDbError };
}

function createPostgresAdapterContract() {
  const unsupported = () => { throw Object.assign(new Error('PostgreSQL adapter is a documented contract only; production PostgreSQL is not enabled in T2.O10.1'), { code: 'NOT_IMPLEMENTED' }); };
  return { kind: 'postgresql', capabilities: { transactions: true, returning: true, json: true }, run: unsupported, get: unsupported, all: unsupported, query: unsupported, transaction: unsupported, normalizeError: normalizeDbError };
}

module.exports = { createSqliteAdapter, createPostgresAdapterContract, normalizeDbError };
