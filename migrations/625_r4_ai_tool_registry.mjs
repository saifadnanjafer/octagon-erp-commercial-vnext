// R4.5 AI operating layer: governed tool registry storage. Previews (with args
// hash + expiry), a per-call audit ledger, and a kill-switch table. No business
// data lives here; write tools still post through their domain engines.
'use strict';

export const migration = {
  id: '625_r4_ai_tool_registry',
  dependsOn: ['624_r4_collaboration_indexes'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_tool_preview (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        args_hash TEXT NOT NULL,
        preview_json TEXT NOT NULL,
        risk TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_ai_tool_preview_tool ON ai_tool_preview (company_id, tool);

      CREATE TABLE IF NOT EXISTS ai_tool_call (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        actor TEXT,
        risk TEXT NOT NULL,
        status TEXT NOT NULL,
        args_hash TEXT NOT NULL,
        preview_id TEXT REFERENCES ai_tool_preview(id),
        approval_id TEXT,
        result_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_ai_tool_call_tool ON ai_tool_call (company_id, tool);

      CREATE TABLE IF NOT EXISTS ai_kill_switch (
        scope TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT,
        updated_by TEXT
      ) STRICT;
    `);
    // Global kill-switch row starts disabled (tools live).
    db.prepare("INSERT OR IGNORE INTO ai_kill_switch(scope, enabled, updated_at, updated_by) VALUES('global', 0, ?, 'migration')").run(new Date().toISOString());
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS ai_kill_switch; DROP TABLE IF EXISTS ai_tool_call; DROP TABLE IF EXISTS ai_tool_preview;');
  },
};
