// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.1 (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

// ── Pack manifest validation ──

const REQUIRED_MANIFEST_FIELDS = ['pack_id', 'name', 'version'];
const VALID_PATCH_TARGETS = ['collection', 'field', 'state', 'workflow', 'permission', 'seed', 'print_template', 'dashboard', 'terminology'];
const VALID_PATCH_ACTIONS = ['add', 'modify', 'remove'];

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw fail('pack manifest must be a non-null object', 400, 'MANIFEST_INVALID');
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field] || typeof manifest[field] !== 'string' || !manifest[field].trim()) {
      throw fail(`pack manifest requires a non-empty '${field}'`, 400, 'MANIFEST_MISSING_FIELD');
    }
  }
  // Edition validation
  const edition = manifest.edition_required || 'standard';
  if (!['standard', 'enterprise', 'saas'].includes(edition)) {
    throw fail(`invalid edition_required: ${edition}`, 400, 'EDITION_INVALID');
  }
  // Patches validation
  if (manifest.patches && Array.isArray(manifest.patches)) {
    for (const patch of manifest.patches) {
      if (!VALID_PATCH_TARGETS.includes(patch.target_type)) {
        throw fail(`invalid patch target_type: ${patch.target_type}`, 400, 'PATCH_TARGET_INVALID');
      }
      if (!VALID_PATCH_ACTIONS.includes(patch.action)) {
        throw fail(`invalid patch action: ${patch.action}`, 400, 'PATCH_ACTION_INVALID');
      }
      if (!patch.target_key || typeof patch.target_key !== 'string') {
        throw fail('patch target_key is required', 400, 'PATCH_KEY_REQUIRED');
      }
    }
  }
  return true;
}

function hashManifest(manifest) {
  const canonical = JSON.stringify(manifest, Object.keys(manifest).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ── Pack installation ──

function installPack(db, companyId, manifest) {
  ensureCompany(db, companyId);
  validateManifest(manifest);

  const packId = manifest.pack_id.trim();
  const existing = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(companyId, packId);
  if (existing && existing.installed) {
    throw fail(`pack '${packId}' is already installed`, 409, 'PACK_ALREADY_INSTALLED');
  }

  // Edition entitlement check — if licensing tables exist, verify
  const hasLicensing = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_license'").get();
  if (hasLicensing && manifest.edition_required && manifest.edition_required !== 'standard') {
    const license = db.prepare("SELECT * FROM shop_license WHERE company_id = ? ORDER BY created_at DESC LIMIT 1").get(companyId);
    if (license) {
      const editionRank = { standard: 0, enterprise: 1, saas: 2 };
      const requiredRank = editionRank[manifest.edition_required] || 0;
      const currentRank = editionRank[license.edition] || 0;
      if (currentRank < requiredRank) {
        throw fail(`pack requires '${manifest.edition_required}' edition, but current license is '${license.edition}'`, 403, 'EDITION_INSUFFICIENT');
      }
    }
  }

  const manifestHash = hashManifest(manifest);

  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');

  try {
    const regId = existing ? existing.id : id('pack');

    if (existing) {
      db.prepare(`
        UPDATE shop_pack_registry
        SET name = ?, version = ?, description = ?, author = ?, edition_required = ?,
            installed = 1, installed_at = ?, installed_by = ?, manifest_hash = ?
        WHERE id = ?
      `).run(
        manifest.name.trim(), manifest.version.trim(),
        manifest.description || null, manifest.author || null,
        manifest.edition_required || 'standard',
        now(), 'system', manifestHash, regId
      );
    } else {
      db.prepare(`
        INSERT INTO shop_pack_registry (id, company_id, pack_id, name, version, description, author, edition_required, installed, installed_at, installed_by, manifest_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(
        regId, companyId, packId, manifest.name.trim(), manifest.version.trim(),
        manifest.description || null, manifest.author || null,
        manifest.edition_required || 'standard',
        now(), 'system', manifestHash, now()
      );
    }

    // Apply patches
    if (manifest.patches && Array.isArray(manifest.patches)) {
      for (const patch of manifest.patches) {
        const patchId = id('pp');
        db.prepare(`
          INSERT OR REPLACE INTO shop_pack_patch (id, company_id, pack_id, target_type, target_key, patch_action, patch_data, applied, applied_at, reverted, reverted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, NULL)
        `).run(patchId, companyId, packId, patch.target_type, patch.target_key, patch.action, JSON.stringify(patch.data || {}), now());
      }
    }

    if (owns) db.exec('COMMIT');
    return { pack_id: packId, installed: true, manifest_hash: manifestHash };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

// ── Pack uninstallation ──

function uninstallPack(db, companyId, packId) {
  ensureCompany(db, companyId);
  if (!packId) throw fail('pack_id is required', 400, 'PACK_ID_REQUIRED');

  const reg = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ? AND installed = 1').get(companyId, packId);
  if (!reg) throw fail(`pack '${packId}' is not installed`, 404, 'PACK_NOT_INSTALLED');

  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');

  try {
    // Revert patches
    const patches = db.prepare('SELECT * FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').all(companyId, packId);
    for (const patch of patches) {
      db.prepare('UPDATE shop_pack_patch SET applied = 0, reverted = 1, reverted_at = ? WHERE id = ?').run(now(), patch.id);
    }

    // Mark pack as uninstalled
    db.prepare('UPDATE shop_pack_registry SET installed = 0 WHERE id = ?').run(reg.id);

    if (owns) db.exec('COMMIT');
    return { pack_id: packId, uninstalled: true, patches_reverted: patches.length };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

// ── Conformance check ──

function checkConformance(db, companyId, packId) {
  ensureCompany(db, companyId);
  if (!packId) throw fail('pack_id is required', 400, 'PACK_ID_REQUIRED');

  const reg = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(companyId, packId);
  const findings = [];

  // 1. Registry entry exists
  if (!reg) {
    findings.push({ check: 'registry_entry', pass: false, detail: 'pack not found in registry' });
    return { pack_id: packId, passed: false, findings };
  }
  findings.push({ check: 'registry_entry', pass: true, detail: `version ${reg.version}` });

  // 2. Install state consistency
  const hasInstalledAt = !!reg.installed_at;
  const isInstalled = !!reg.installed;
  findings.push({
    check: 'install_state',
    pass: isInstalled ? hasInstalledAt : true,
    detail: isInstalled ? 'installed' : 'not installed'
  });

  // 3. Patch residue check: no patches should be applied if pack is uninstalled
  const appliedPatches = db.prepare('SELECT COUNT(*) as cnt FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').get(companyId, packId);
  if (!reg.installed && appliedPatches.cnt > 0) {
    findings.push({ check: 'patch_residue', pass: false, detail: `${appliedPatches.cnt} patches still applied after uninstall` });
  } else {
    findings.push({ check: 'patch_residue', pass: true, detail: `${appliedPatches.cnt} active patches` });
  }

  // 4. Patch conflict check: no two packs should patch the same target
  const conflictPatches = db.prepare(`
    SELECT p1.pack_id as pack_a, p2.pack_id as pack_b, p1.target_type, p1.target_key
    FROM shop_pack_patch p1
    JOIN shop_pack_patch p2 ON p1.company_id = p2.company_id
      AND p1.target_type = p2.target_type AND p1.target_key = p2.target_key
      AND p1.pack_id != p2.pack_id AND p1.applied = 1 AND p2.applied = 1
    WHERE p1.company_id = ? AND (p1.pack_id = ? OR p2.pack_id = ?)
    LIMIT 10
  `).all(companyId, packId, packId);
  if (conflictPatches.length > 0) {
    findings.push({ check: 'patch_conflicts', pass: false, detail: `${conflictPatches.length} conflicts: ${conflictPatches.map(c => `${c.pack_a} vs ${c.pack_b} on ${c.target_type}:${c.target_key}`).join('; ')}` });
  } else {
    findings.push({ check: 'patch_conflicts', pass: true, detail: 'no conflicts' });
  }

  const passed = findings.every(f => f.pass);
  return { pack_id: packId, passed, findings };
}

// ── Pack listing ──

function listPacks(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ?').all(companyId);
}

module.exports = {
  validateManifest,
  hashManifest,
  installPack,
  uninstallPack,
  checkConformance,
  listPacks
};
