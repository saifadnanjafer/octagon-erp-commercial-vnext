// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const infra = require('../r3-infra');

const { fail, ensureCompany } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function recordUpgradeHistory(db, version, status, logOutput, userId) {
  const row = {
    id: id('upg'),
    version: String(version || '1.0.0').trim(),
    status: String(status || 'success').trim(),
    applied_at: now(),
    applied_by: userId || 'system',
    log_output: logOutput ? String(logOutput).trim() : null
  };
  
  if (!['pending', 'success', 'failed'].includes(row.status)) {
    throw fail('invalid upgrade status', 400, 'STATUS_INVALID');
  }
  
  db.prepare(`
    INSERT INTO shop_upgrade_history (id, version, status, applied_at, applied_by, log_output)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.version, row.status, row.applied_at, row.applied_by, row.log_output);
  
  return row;
}

function getSystemDiagnostics(db, companyId) {
  ensureCompany(db, companyId);
  
  // 1. SQLite Integrity check
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const integrityOk = integrity && Object.values(integrity)[0] === 'ok';
  
  // 2. FK check
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
  
  // 3. Collect OS load/mem
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const loadAvg = os.loadavg();
  
  return {
    timestamp: now(),
    sqlite: {
      integrity_check: integrityOk ? 'ok' : 'corrupted',
      foreign_key_violations_count: fkViolations.length
    },
    system: {
      platform: os.platform(),
      release: os.release(),
      memory_free_mb: Math.floor(freeMem / (1024 * 1024)),
      memory_total_mb: Math.floor(totalMem / (1024 * 1024)),
      load_average_5min: loadAvg[0]
    }
  };
}

function exportSupportBundle(db, companyId) {
  ensureCompany(db, companyId);
  const diag = getSystemDiagnostics(db, companyId);
  
  // Get all table counts
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const tableCounts = {};
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as cnt FROM \`${t.name}\``).get();
      tableCounts[t.name] = row?.cnt || 0;
    } catch (_) {
      tableCounts[t.name] = -1;
    }
  }
  
  // Upgrade history
  const history = db.prepare('SELECT * FROM shop_upgrade_history ORDER BY applied_at DESC LIMIT 20').all();
  
  return {
    bundle_id: id('bundle'),
    exported_at: now(),
    diagnostics: diag,
    database_metadata: {
      tables_count: tables.length,
      row_counts: tableCounts
    },
    upgrade_history: history
  };
}

module.exports = {
  recordUpgradeHistory: infra.atomicCommand(recordUpgradeHistory),
  getSystemDiagnostics,
  exportSupportBundle
};
