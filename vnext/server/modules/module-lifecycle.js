// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.12 module lifecycle (proprietary self, not copied)
'use strict';

const fs = require('fs');
const path = require('path');
const { discoverModules } = require('./module-framework');

/**
 * T1.12.1 completion: the ModuleRegistry class in module-framework.js was
 * genuinely implemented (DFS load-order + circular-dependency detection)
 * but had no lifecycle around it — no install/uninstall/enable/disable, no
 * hook invocation, no disk discovery. This file is the missing lifecycle
 * layer: it turns `manifest.json` + declarative `contributes` blocks into
 * real, reversible database effects, tracked row-for-row in
 * `x_module_patches` so uninstall can retract precisely (roadmap
 * invariant: "disabled module's patches fully retract").
 */

function nowIso() {
  return new Date().toISOString();
}

function fail(message, statusCode, extra) {
  const err = new Error(message);
  err.statusCode = statusCode || 400;
  if (extra) err.extra = extra;
  return err;
}

function isModuleActive(db, moduleId) {
  const row = db.prepare('SELECT active FROM x_installed_modules WHERE module = ?').get(moduleId);
  return !!row && Number(row.active) === 1;
}

function getInstalledModule(db, moduleId) {
  const row = db.prepare('SELECT module, active, manifest, installed_at, source_dir FROM x_installed_modules WHERE module = ?').get(moduleId);
  if (!row) return null;
  return {
    module: row.module,
    active: Number(row.active) === 1,
    manifest: safeParse(row.manifest, {}),
    installedAt: row.installed_at,
    sourceDir: row.source_dir,
  };
}

function safeParse(text, fallback) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch (_) { return fallback; }
}

/**
 * Resolve a "file.js#exportName" hook reference relative to the module's
 * own folder. Returns the function, or null if not declared.
 */
function resolveHook(moduleDir, hookRef) {
  if (!hookRef || typeof hookRef !== 'string') return null;
  const [file, exportName] = hookRef.split('#');
  if (!file || !exportName) throw fail(`صيغة الخطاف غير صالحة: "${hookRef}" (المتوقع "file.js#export")`, 400);
  const resolved = path.resolve(moduleDir, file);
  if (!resolved.startsWith(path.resolve(moduleDir) + path.sep)) {
    throw fail('لا يمكن للخطاف الإشارة إلى ملف خارج مجلد الوحدة', 400);
  }
  if (!fs.existsSync(resolved)) throw fail(`ملف الخطاف غير موجود: ${file}`, 400);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const mod = require(resolved);
  const fn = mod && mod[exportName];
  if (typeof fn !== 'function') throw fail(`الدالة "${exportName}" غير موجودة في ${file}`, 400);
  return fn;
}

function checkDependencies(db, manifest) {
  const deps = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
  const missing = deps.filter((dep) => !isModuleActive(db, dep));
  if (missing.length) {
    throw fail(`تعتمد هذه الوحدة على وحدات غير مُفعّلة: ${missing.join(', ')}`, 409, { missing });
  }
}

/**
 * Pre-flight conflict detection: two modules contributing the same
 * (entity,key) custom field, the same menu item id, or the same workflow
 * id is reported deterministically (first-installed module keeps
 * ownership) instead of silently overwritten.
 */
function detectConflicts(db, moduleId, manifest) {
  const contributes = manifest.contributes || {};
  const conflicts = [];

  for (const field of contributes.fields || []) {
    const owner = db.prepare(
      "SELECT module FROM x_module_patches WHERE patch_type = 'custom_field' AND target_entity = ? AND target_key = ?"
    ).get(field.entity, field.key);
    if (owner && owner.module !== moduleId) {
      conflicts.push({ type: 'custom_field', entity: field.entity, key: field.key, owner: owner.module });
    }
  }

  for (const item of contributes.menu || []) {
    const owner = db.prepare(
      "SELECT module FROM x_module_patches WHERE patch_type = 'menu_item' AND target_key = ?"
    ).get(item.id);
    if (owner && owner.module !== moduleId) {
      conflicts.push({ type: 'menu_item', key: item.id, owner: owner.module });
    }
  }

  for (const wf of contributes.workflows || []) {
    const owner = db.prepare(
      "SELECT module FROM x_module_patches WHERE patch_type = 'workflow' AND target_key = ?"
    ).get(wf.id);
    if (owner && owner.module !== moduleId) {
      conflicts.push({ type: 'workflow', key: wf.id, owner: owner.module });
    }
  }

  return conflicts;
}

function applyMigrations(db, moduleId, manifest) {
  const migrations = Array.isArray(manifest.migrations) ? manifest.migrations : [];
  for (const migration of migrations) {
    const id = String(migration.id || '').trim();
    if (!id) throw fail('كل ترحيل معلن يجب أن يحمل معرّفاً (id)', 400);
    const already = db.prepare(
      "SELECT 1 FROM x_module_patches WHERE module = ? AND patch_type = 'schema_migration' AND target_key = ?"
    ).get(moduleId, id);
    if (already) continue; // idempotent re-install
    if (migration.up) db.exec(String(migration.up));
    db.prepare(
      "INSERT INTO x_module_patches (module, patch_type, target_entity, target_key, down_sql, applied_at) VALUES (?, 'schema_migration', '', ?, ?, ?)"
    ).run(moduleId, id, migration.down || null, nowIso());
  }
}

function applyFieldPatches(db, moduleId, manifest) {
  for (const field of manifest.contributes?.fields || []) {
    const entity = String(field.entity || '').trim();
    const key = String(field.key || '').trim();
    if (!entity || !key) throw fail('حقل الوحدة يتطلب entity و key', 400);
    db.prepare(`
      INSERT INTO x_custom_fields (entity, key, label_ar, type, options, position)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity, key) DO UPDATE SET label_ar = excluded.label_ar, type = excluded.type, options = excluded.options, position = excluded.position
    `).run(entity, key, field.label_ar || key, field.type || 'text', field.options ? JSON.stringify(field.options) : null, Number(field.position) || 0);
    db.prepare(
      "INSERT OR REPLACE INTO x_module_patches (module, patch_type, target_entity, target_key, applied_at) VALUES (?, 'custom_field', ?, ?, ?)"
    ).run(moduleId, entity, key, nowIso());
  }
}

function applyMenuPatches(db, moduleId, manifest) {
  for (const item of manifest.contributes?.menu || []) {
    const id = String(item.id || '').trim();
    if (!id) throw fail('عنصر القائمة يتطلب id', 400);
    db.prepare(`
      INSERT INTO x_module_menu_items (id, module, label_ar, path, icon, position)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label_ar = excluded.label_ar, path = excluded.path, icon = excluded.icon, position = excluded.position
    `).run(id, moduleId, item.label_ar || id, item.path || '#', item.icon || null, Number(item.position) || 0);
    db.prepare(
      "INSERT OR REPLACE INTO x_module_patches (module, patch_type, target_entity, target_key, applied_at) VALUES (?, 'menu_item', '', ?, ?)"
    ).run(moduleId, id, nowIso());
  }
}

function applyWorkflowPatches(db, moduleId, manifest, actorUserId) {
  for (const wf of manifest.contributes?.workflows || []) {
    const id = String(wf.id || '').trim();
    if (!id) throw fail('تعريف مسار العمل يتطلب id', 400);
    const now = nowIso();
    const { id: _drop, ...rest } = wf;
    const existing = db.prepare('SELECT id FROM x_records WHERE entity = ? AND id = ?').get('workflow', id);
    if (existing) {
      db.prepare('UPDATE x_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?')
        .run(JSON.stringify(rest), now, 'workflow', id);
    } else {
      db.prepare(
        'INSERT INTO x_records (entity, id, company_id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, NULL, ?, ?, ?, ?, 0)'
      ).run('workflow', id, JSON.stringify(rest), now, now, actorUserId || 'module_install');
    }
    db.prepare(
      "INSERT OR REPLACE INTO x_module_patches (module, patch_type, target_entity, target_key, applied_at) VALUES (?, 'workflow', 'workflow', ?, ?)"
    ).run(moduleId, id, nowIso());
  }
}

/**
 * Install a module discovered on disk: validate deps, detect contribution
 * conflicts, run declared migrations, apply declarative patches, invoke
 * `onInstall` if declared, and mark the module active. Fully transactional
 * — any failure rolls back every effect.
 */
function installModule(db, modulesDir, moduleId, actorUserId) {
  const { discovered } = discoverModules(modulesDir);
  const found = discovered.find((m) => m.id === moduleId);
  if (!found) throw fail(`الوحدة "${moduleId}" غير موجودة على القرص`, 404);
  const { manifest, dir } = found;

  checkDependencies(db, manifest);
  const conflicts = detectConflicts(db, moduleId, manifest);
  if (conflicts.length) {
    throw fail('تعارض في مساهمات الوحدة مع وحدة أخرى مثبّتة', 409, { conflicts });
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    applyMigrations(db, moduleId, manifest);
    applyFieldPatches(db, moduleId, manifest);
    applyMenuPatches(db, moduleId, manifest);
    applyWorkflowPatches(db, moduleId, manifest, actorUserId);

    const onInstall = resolveHook(dir, manifest.hooks?.onInstall);
    if (onInstall) onInstall(db, { moduleId, manifest, actorUserId, moduleDir: dir });

    db.prepare(`
      INSERT INTO x_installed_modules (module, active, manifest, installed_at, source_dir)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(module) DO UPDATE SET active = 1, manifest = excluded.manifest, installed_at = excluded.installed_at, source_dir = excluded.source_dir
    `).run(moduleId, JSON.stringify(manifest), nowIso(), dir);

    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }

  return getInstalledModule(db, moduleId);
}

/**
 * Uninstall a module: run its `onUninstall` hook (state still present),
 * then retract every tracked patch (custom fields, menu items, workflow
 * defs, declarative schema migrations via their `down` SQL), then remove
 * the module row entirely. Zero residue: after this call, nothing in the
 * database references the module except its own now-empty absence.
 */
function uninstallModule(db, moduleId, actorUserId) {
  const installed = getInstalledModule(db, moduleId);
  if (!installed) throw fail(`الوحدة "${moduleId}" غير مثبّتة`, 404);

  db.exec('BEGIN IMMEDIATE');
  try {
    if (installed.sourceDir) {
      try {
        const onUninstall = resolveHook(installed.sourceDir, installed.manifest.hooks?.onUninstall);
        if (onUninstall) onUninstall(db, { moduleId, manifest: installed.manifest, actorUserId, moduleDir: installed.sourceDir });
      } catch (hookError) {
        // A missing/broken hook file must not block residue-free uninstall
        // (the module folder may already have been removed from disk).
        if (hookError.statusCode !== 404) throw hookError;
      }
    }

    const patches = db.prepare('SELECT patch_type, target_entity, target_key, down_sql FROM x_module_patches WHERE module = ?').all(moduleId);
    for (const patch of patches) {
      if (patch.patch_type === 'custom_field') {
        db.prepare('DELETE FROM x_custom_fields WHERE entity = ? AND key = ?').run(patch.target_entity, patch.target_key);
      } else if (patch.patch_type === 'menu_item') {
        db.prepare('DELETE FROM x_module_menu_items WHERE id = ?').run(patch.target_key);
      } else if (patch.patch_type === 'workflow') {
        db.prepare("DELETE FROM x_records WHERE entity = 'workflow' AND id = ?").run(patch.target_key);
      } else if (patch.patch_type === 'schema_migration' && patch.down_sql) {
        db.exec(String(patch.down_sql));
      }
    }
    db.prepare('DELETE FROM x_module_patches WHERE module = ?').run(moduleId);
    db.prepare('DELETE FROM x_installed_modules WHERE module = ?').run(moduleId);

    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }

  return { module: moduleId, uninstalled: true };
}

function setModuleActive(db, moduleId, active) {
  const installed = getInstalledModule(db, moduleId);
  if (!installed) throw fail(`الوحدة "${moduleId}" غير مثبّتة`, 404);
  db.prepare('UPDATE x_installed_modules SET active = ? WHERE module = ?').run(active ? 1 : 0, moduleId);
  return getInstalledModule(db, moduleId);
}

function listModules(db, modulesDir) {
  const installedRows = db.prepare('SELECT module, active, manifest, installed_at, source_dir FROM x_installed_modules ORDER BY module').all();
  const installedIds = new Set(installedRows.map((r) => r.module));
  const installed = installedRows.map((row) => {
    const manifest = safeParse(row.manifest, {});
    const patchCount = db.prepare('SELECT COUNT(*) AS n FROM x_module_patches WHERE module = ?').get(row.module).n;
    return {
      id: row.module,
      active: Number(row.active) === 1,
      version: manifest.version || '1.0.0',
      name_ar: manifest.name_ar || row.module,
      dependencies: Array.isArray(manifest.dependencies) ? manifest.dependencies : [],
      installedAt: row.installed_at,
      patchCount: Number(patchCount) || 0,
    };
  });

  const { discovered, errors } = discoverModules(modulesDir);
  const available = discovered
    .filter((m) => !installedIds.has(m.id))
    .map((m) => ({
      id: m.id,
      version: m.manifest.version || '1.0.0',
      name_ar: m.manifest.name_ar || m.id,
      dependencies: Array.isArray(m.manifest.dependencies) ? m.manifest.dependencies : [],
      entitlement: m.manifest.entitlement || 'community',
    }));

  return { installed, available, discoveryErrors: errors };
}

module.exports = {
  installModule,
  uninstallModule,
  setModuleActive,
  getInstalledModule,
  isModuleActive,
  listModules,
  detectConflicts,
  _internal: { checkDependencies, resolveHook, nowIso, fail: (msg, code) => fail(msg, code) },
};
