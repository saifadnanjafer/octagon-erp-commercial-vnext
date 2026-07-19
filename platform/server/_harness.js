// ============================================================================
// THROWAWAY test harness for packets P0.1 + P0.4 — NOT part of the app.
// Plain node:http (Express is NOT installed in octagon-erp; the real server
// is plain http too, so this actually matches production wiring 1:1).
//
// Uses its OWN throwaway sqlite file (_harness.db in this folder) — NEVER the
// live database.db (see reference_sqlite_wal_dual_server: a second process on
// the live db risks WAL corruption).
//
// Run:   node platform/server/_harness.js        (listens on 127.0.0.1:8123)
// Fresh: delete _harness.db* first for a clean run (TEST.md does this).
// ============================================================================
'use strict';

const http = require('http');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { mountCrud } = require('./crud-engine');

const PORT = 8123;
const DB_FILE = path.join(__dirname, '_harness.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

const engine = mountCrud({ db });

// Demo onWrite subscriber — proves the hook fan-out fires (visible in logs).
engine.subscribe((entity, action, record) => {
  console.log(`[onWrite] ${entity} ${action} ${record.id}`);
});

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (engine.handle(req, res, requestUrl)) return;
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: false, data: null, error: 'not found', meta: null }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[harness] CRUD engine test server on http://127.0.0.1:${PORT} (db: ${DB_FILE})`);
});
