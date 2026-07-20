// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.4 (proprietary self, not copied)
// R9.4 marketplace & pack distribution domain engine. This file owns the
// signer registry and pack catalog/lifecycle rows only. It never applies
// patches, posts GL/stock effects, or duplicates the R9.1 Pack SDK
// installation engine — it calls into pack-sdk-engine for every actual
// install/upgrade/uninstall mutation, and into the R8.2 licensing engine for
// every entitlement decision. All stock/GL/tax/payment concerns are entirely
// out of scope here: a pack's business logic lives in its own domain engine.
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');
const packCrypto = require('./pack-crypto');
const packSdk = require('./pack-sdk-engine');
const licensingEngine = require('../governance/licensing-engine');

const { fail, ensureCompany, recordWrite, idempotencyScope, rememberIdempotency, tableExists } = infra;

const PLATFORM_VERSION = '9.4.0';
const PACK_SDK_API_VERSION = 1;

function uid(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function compareVersion(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0; const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function publishEvent(db, type, companyId, userId, entity, recordId, payload) {
  const { createEventService } = require('../../events/events');
  const events = createEventService({ db });
  events.publish({ type, companyId, userId: userId || 'system', audience: { kind: 'company' }, entity, recordId, payload });
}

function publishOutbox(db, type, companyId, userId, entity, recordId, payload) {
  if (!tableExists(db, 'vnext_outbox')) throw fail('vnext_outbox table is missing', 500, 'OUTBOX_TABLE_MISSING');
  const { createOutboxService } = require('../../events/outbox');
  const outbox = createOutboxService({ db });
  outbox.write({ type, companyId, userId: userId || 'system', entity, recordId, payload });
}

// ── Trusted signer registry ──

function registerSigner(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const signerId = String(input?.signer_id || '').trim();
  const publicKey = String(input?.public_key || '').trim();
  if (!signerId) throw fail('signer_id is required', 400, 'SIGNER_ID_REQUIRED');
  if (!publicKey) throw fail('public_key is required', 400, 'PUBLIC_KEY_REQUIRED');

  let fingerprint;
  try { packCrypto.loadPublicKey(publicKey); fingerprint = packCrypto.publicKeyFingerprint(publicKey); }
  catch (_) { throw fail('public_key is not a valid Ed25519 SPKI key', 400, 'MALFORMED_KEY'); }

  const existing = db.prepare('SELECT id FROM shop_marketplace_signer WHERE company_id = ? AND signer_id = ?').get(companyId, signerId);
  if (existing) throw fail(`signer '${signerId}' is already registered`, 409, 'SIGNER_EXISTS');

  const row = {
    id: uid('signer'), company_id: companyId, signer_id: signerId, public_key: publicKey,
    key_fingerprint: fingerprint, publisher_name: input?.publisher_name ? String(input.publisher_name).trim() : null,
    status: 'active', valid_from: input?.valid_from ? String(input.valid_from) : now(),
    valid_to: input?.valid_to ? String(input.valid_to) : null, created_at: now(), created_by: userId || 'system',
  };
  db.prepare(`
    INSERT INTO shop_marketplace_signer (id, company_id, signer_id, public_key, key_fingerprint, publisher_name, status, valid_from, valid_to, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.signer_id, row.public_key, row.key_fingerprint, row.publisher_name, row.status, row.valid_from, row.valid_to, row.created_at, row.created_by);

  recordWrite(db, null, companyId, 'shop_marketplace_signer', row.id, 'register', userId, null, row);
  publishOutbox(db, 'marketplace.signer.registered', companyId, userId, 'shop_marketplace_signer', row.id, { signer_id: signerId, fingerprint });
  publishEvent(db, 'marketplace.signer.registered', companyId, userId, 'shop_marketplace_signer', row.id, { signer_id: signerId });
  return row;
}

function revokeSigner(db, companyId, signerId, input, userId) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM shop_marketplace_signer WHERE company_id = ? AND signer_id = ?').get(companyId, signerId);
  if (!row) throw fail(`signer '${signerId}' is not registered`, 404, 'SIGNER_NOT_FOUND');
  if (row.status === 'revoked') throw fail(`signer '${signerId}' is already revoked`, 409, 'SIGNER_ALREADY_REVOKED');

  const after = { ...row, status: 'revoked', revoked_at: now(), revoked_by: userId || 'system', revoke_reason: input?.reason ? String(input.reason).trim() : null };
  db.prepare('UPDATE shop_marketplace_signer SET status = ?, revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?')
    .run(after.status, after.revoked_at, after.revoked_by, after.revoke_reason, row.id);

  recordWrite(db, null, companyId, 'shop_marketplace_signer', row.id, 'revoke', userId, row, after);
  publishOutbox(db, 'marketplace.signer.revoked', companyId, userId, 'shop_marketplace_signer', row.id, { signer_id: signerId });
  publishEvent(db, 'marketplace.signer.revoked', companyId, userId, 'shop_marketplace_signer', row.id, { signer_id: signerId });
  return after;
}

function listSigners(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT id, company_id, signer_id, key_fingerprint, publisher_name, status, valid_from, valid_to, created_at, revoked_at, revoke_reason FROM shop_marketplace_signer WHERE company_id = ? ORDER BY created_at DESC').all(companyId);
}

function lookupSignerForVerification(db, companyId) {
  return (signerId) => db.prepare('SELECT * FROM shop_marketplace_signer WHERE company_id = ? AND signer_id = ?').get(companyId, signerId) || null;
}

// Best-effort manifest read for a package that failed verification, so a
// rejected catalog row keeps a stable, meaningful (pack_id, version) identity
// instead of colliding under a generic placeholder.
function extractBestEffortManifest(pkg) {
  try {
    const manifestFile = Array.isArray(pkg?.files) ? pkg.files.find((f) => f && f.path === 'manifest.json') : null;
    if (manifestFile && typeof manifestFile.content_b64 === 'string') {
      return JSON.parse(Buffer.from(manifestFile.content_b64, 'base64').toString('utf8'));
    }
  } catch (_) { /* fall through: identity falls back to a checksum-derived placeholder */ }
  return null;
}

// ── Compatibility & entitlement matrix ──

function computeEntitlement(db, companyId, manifest, installedAtIso) {
  const tier = (manifest.pricing && manifest.pricing.tier) || 'free';
  if (tier === 'free') return { tier, state: 'free', entitled: true };
  if (tier === 'included') return { tier, state: 'included', entitled: true };
  if (tier === 'trial') {
    const days = Number(manifest.pricing.trial_days) > 0 ? Number(manifest.pricing.trial_days) : 14;
    if (!installedAtIso) return { tier, state: 'trial', entitled: true, trial_days: days };
    const expiresAt = new Date(installedAtIso).getTime() + days * 86400000;
    const expired = Date.now() > expiresAt;
    return { tier, state: expired ? 'expired' : 'trial', entitled: !expired, trial_days: days, expires_at: new Date(expiresAt).toISOString() };
  }
  const feature = (manifest.pricing && manifest.pricing.entitlement_feature) || `pack:${manifest.pack_id}`;
  const check = licensingEngine.isFeatureLicensed(db, companyId, feature);
  return { tier: 'paid', state: !check.licensed ? 'missing' : (check.grace_readonly ? 'expired' : 'licensed'), entitled: !!check.licensed, feature };
}

function evaluateCompatibility(db, companyId, manifest, compat, options = {}) {
  const reasons = [];
  if (compareVersion(compat.platform_min, PLATFORM_VERSION) > 0 || compareVersion(PLATFORM_VERSION, compat.platform_max) > 0) {
    reasons.push({ code: 'PLATFORM_VERSION_INCOMPATIBLE', message: `pack requires platform ${compat.platform_min}-${compat.platform_max}, current platform is ${PLATFORM_VERSION}` });
  }
  if (Number(compat.sdk_api_min) > PACK_SDK_API_VERSION || Number(compat.sdk_api_max) < PACK_SDK_API_VERSION) {
    reasons.push({ code: 'SDK_API_VERSION_INCOMPATIBLE', message: `pack requires Pack SDK API ${compat.sdk_api_min}-${compat.sdk_api_max}, current is ${PACK_SDK_API_VERSION}` });
  }
  for (const dep of Array.isArray(manifest.dependencies) ? manifest.dependencies : []) {
    const row = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ? AND installed = 1').get(companyId, dep.pack_id);
    if (!row) { reasons.push({ code: 'DEPENDENCY_MISSING', message: `required dependency '${dep.pack_id}' is not installed` }); continue; }
    if (dep.min_version && compareVersion(row.version, dep.min_version) < 0) reasons.push({ code: 'DEPENDENCY_VERSION_INCOMPATIBLE', message: `dependency '${dep.pack_id}' version ${row.version} is below required minimum ${dep.min_version}` });
    if (dep.max_version && compareVersion(row.version, dep.max_version) > 0) reasons.push({ code: 'DEPENDENCY_VERSION_INCOMPATIBLE', message: `dependency '${dep.pack_id}' version ${row.version} is above allowed maximum ${dep.max_version}` });
  }
  for (const conflictPackId of Array.isArray(manifest.conflicts) ? manifest.conflicts : []) {
    if (options.excludePackId && conflictPackId === options.excludePackId) continue;
    const row = db.prepare('SELECT 1 FROM shop_pack_registry WHERE company_id = ? AND pack_id = ? AND installed = 1').get(companyId, conflictPackId);
    if (row) reasons.push({ code: 'CONFLICTING_PACK_INSTALLED', message: `conflicting pack '${conflictPackId}' is installed` });
  }
  const license = licensingEngine.getLicense(db, companyId);
  const editionRank = { standard: 0, enterprise: 1, saas: 2 };
  const required = manifest.edition_required || 'standard';
  if ((editionRank[required] || 0) > (editionRank[license.edition] || 0)) {
    reasons.push({ code: 'EDITION_INSUFFICIENT', message: `pack requires '${required}' edition, current license is '${license.edition}'` });
  }
  const entitlement = computeEntitlement(db, companyId, manifest, options.installedAtIso);
  if (!entitlement.entitled) reasons.push({ code: 'ENTITLEMENT_MISSING', message: `pack '${manifest.pack_id}' is not entitled for this company (tier: ${entitlement.tier})` });
  return { compatible: reasons.length === 0, reasons, entitlement };
}

function assertCompatible(db, companyId, manifest, compat, options = {}) {
  const result = evaluateCompatibility(db, companyId, manifest, compat, options);
  if (!result.compatible) {
    const first = result.reasons[0];
    const error = fail(first.message, 409, first.code);
    error.reasons = result.reasons;
    throw error;
  }
  return result;
}

// ── Package import & catalog ──

function decoratePack(db, companyId, row) {
  const manifest = JSON.parse(row.manifest_json);
  const compat = JSON.parse(row.compat_json);
  const out = {
    ...row, manifest, compat,
    dependencies: JSON.parse(row.dependencies_json || '[]'),
    conflicts: JSON.parse(row.conflicts_json || '[]'),
  };
  delete out.manifest_json; delete out.compat_json; delete out.dependencies_json; delete out.conflicts_json;
  if (row.state === 'verified') {
    const evaluation = evaluateCompatibility(db, companyId, manifest, compat);
    out.lifecycle_state = evaluation.compatible ? 'installable' : 'verified';
    out.compatibility = evaluation;
  } else {
    out.lifecycle_state = row.state;
  }
  return out;
}

function getPackRow(db, companyId, packRowId) {
  const row = db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ? AND company_id = ?').get(packRowId, companyId);
  if (!row) throw fail('pack catalog entry was not found', 404, 'PACK_ROW_NOT_FOUND');
  return row;
}

function importPackage(db, companyId, pkg, userId) {
  ensureCompany(db, companyId);
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    let verification;
    try {
      verification = packCrypto.verifyPackage(pkg, { lookupSigner: lookupSignerForVerification(db, companyId) });
    } catch (verificationError) {
      const bestEffort = extractBestEffortManifest(pkg);
      const rawChecksum = packCrypto.sha256(Buffer.from(JSON.stringify(pkg || {})));
      const packId = bestEffort?.pack_id ? String(bestEffort.pack_id) : `unknown-${rawChecksum.slice(0, 12)}`;
      const version = bestEffort?.version ? String(bestEffort.version) : '0.0.0';
      const existingRejected = db.prepare('SELECT * FROM shop_marketplace_pack WHERE company_id = ? AND pack_id = ? AND version = ?').get(companyId, packId, version);
      if (existingRejected && existingRejected.state !== 'rejected') {
        // A broken/tampered re-upload must never downgrade or destroy a
        // catalog row that already reached verified/installed/disabled/
        // superseded — only a still-rejected row may be overwritten in place.
        if (owns) db.exec('COMMIT');
        return decoratePack(db, companyId, existingRejected);
      }
      const row = {
        id: existingRejected ? existingRejected.id : uid('mkt'), company_id: companyId, pack_id: packId, version,
        state: 'rejected', signer_id: pkg?.signer_id || null, signer_fingerprint: null,
        package_checksum: rawChecksum,
        manifest_json: JSON.stringify(bestEffort || {}), compat_json: JSON.stringify(pkg?.compat || {}),
        dependencies_json: '[]', conflicts_json: '[]', edition_required: 'standard', pricing_tier: 'free',
        entitlement_state: 'missing', rejection_reason: verificationError.message, rejection_code: verificationError.code || 'VERIFICATION_FAILED',
        uploaded_at: existingRejected ? existingRejected.uploaded_at : now(), uploaded_by: existingRejected ? existingRejected.uploaded_by : (userId || 'system'),
        verified_at: null, created_at: existingRejected ? existingRejected.created_at : now(),
      };
      if (existingRejected) {
        db.prepare(`
          UPDATE shop_marketplace_pack SET state=?, signer_id=?, signer_fingerprint=?, package_checksum=?, manifest_json=?, compat_json=?, rejection_reason=?, rejection_code=?, verified_at=NULL
          WHERE id = ?
        `).run(row.state, row.signer_id, row.signer_fingerprint, row.package_checksum, row.manifest_json, row.compat_json, row.rejection_reason, row.rejection_code, row.id);
      } else {
        db.prepare(`
          INSERT INTO shop_marketplace_pack (id, company_id, pack_id, version, state, signer_id, signer_fingerprint, package_checksum, manifest_json, compat_json, dependencies_json, conflicts_json, edition_required, pricing_tier, entitlement_state, rejection_reason, rejection_code, uploaded_at, uploaded_by, verified_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(row.id, row.company_id, row.pack_id, row.version, row.state, row.signer_id, row.signer_fingerprint, row.package_checksum, row.manifest_json, row.compat_json, row.dependencies_json, row.conflicts_json, row.edition_required, row.pricing_tier, row.entitlement_state, row.rejection_reason, row.rejection_code, row.uploaded_at, row.uploaded_by, row.verified_at, row.created_at);
      }
      recordWrite(db, null, companyId, 'shop_marketplace_pack', row.id, 'reject', userId, existingRejected || null, row);
      publishOutbox(db, 'marketplace.pack.rejected', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id, code: row.rejection_code });
      publishEvent(db, 'marketplace.pack.rejected', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id, code: row.rejection_code });
      if (owns) db.exec('COMMIT');
      return decoratePack(db, companyId, db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ?').get(row.id));
    }

    const { manifest, compat, signer, packageChecksum } = verification;
    const existing = db.prepare('SELECT * FROM shop_marketplace_pack WHERE company_id = ? AND pack_id = ? AND version = ?').get(companyId, manifest.pack_id, manifest.version);
    if (existing && (existing.state === 'installed' || existing.state === 'disabled')) {
      if (owns) db.exec('COMMIT');
      return decoratePack(db, companyId, existing);
    }

    const row = {
      id: existing ? existing.id : uid('mkt'), company_id: companyId, pack_id: manifest.pack_id, version: manifest.version,
      state: 'verified', signer_id: signer.signer_id, signer_fingerprint: signer.key_fingerprint, package_checksum: packageChecksum,
      manifest_json: JSON.stringify(manifest), compat_json: JSON.stringify(compat),
      dependencies_json: JSON.stringify(manifest.dependencies || []), conflicts_json: JSON.stringify(manifest.conflicts || []),
      edition_required: manifest.edition_required || 'standard', pricing_tier: (manifest.pricing && manifest.pricing.tier) || 'free',
      entitlement_state: computeEntitlement(db, companyId, manifest).state,
      rejection_reason: null, rejection_code: null, uploaded_at: existing ? existing.uploaded_at : now(), uploaded_by: existing ? existing.uploaded_by : (userId || 'system'),
      verified_at: now(), created_at: existing ? existing.created_at : now(),
    };
    if (existing) {
      db.prepare(`
        UPDATE shop_marketplace_pack SET state=?, signer_id=?, signer_fingerprint=?, package_checksum=?, manifest_json=?, compat_json=?, dependencies_json=?, conflicts_json=?, edition_required=?, pricing_tier=?, entitlement_state=?, rejection_reason=NULL, rejection_code=NULL, verified_at=?
        WHERE id = ?
      `).run(row.state, row.signer_id, row.signer_fingerprint, row.package_checksum, row.manifest_json, row.compat_json, row.dependencies_json, row.conflicts_json, row.edition_required, row.pricing_tier, row.entitlement_state, row.verified_at, row.id);
    } else {
      db.prepare(`
        INSERT INTO shop_marketplace_pack (id, company_id, pack_id, version, state, signer_id, signer_fingerprint, package_checksum, manifest_json, compat_json, dependencies_json, conflicts_json, edition_required, pricing_tier, entitlement_state, rejection_reason, rejection_code, uploaded_at, uploaded_by, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, row.company_id, row.pack_id, row.version, row.state, row.signer_id, row.signer_fingerprint, row.package_checksum, row.manifest_json, row.compat_json, row.dependencies_json, row.conflicts_json, row.edition_required, row.pricing_tier, row.entitlement_state, row.rejection_reason, row.rejection_code, row.uploaded_at, row.uploaded_by, row.verified_at, row.created_at);
    }
    recordWrite(db, null, companyId, 'shop_marketplace_pack', row.id, 'verify', userId, existing || null, row);
    publishOutbox(db, 'marketplace.pack.verified', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id, version: row.version });
    publishEvent(db, 'marketplace.pack.verified', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id, version: row.version });
    if (owns) db.exec('COMMIT');
    return decoratePack(db, companyId, db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ?').get(row.id));
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function listCatalog(db, companyId) {
  ensureCompany(db, companyId);
  const rows = db.prepare('SELECT * FROM shop_marketplace_pack WHERE company_id = ? ORDER BY created_at DESC').all(companyId);
  return rows.map((row) => decoratePack(db, companyId, row));
}

function getPack(db, companyId, packRowId) {
  ensureCompany(db, companyId);
  return decoratePack(db, companyId, getPackRow(db, companyId, packRowId));
}

function previewInstall(db, companyId, packRowId) {
  ensureCompany(db, companyId);
  const row = getPackRow(db, companyId, packRowId);
  const manifest = JSON.parse(row.manifest_json);
  const compat = JSON.parse(row.compat_json);
  return evaluateCompatibility(db, companyId, manifest, compat);
}

// ── Lifecycle: install / upgrade / disable / enable / uninstall ──

function installPack(db, companyId, packRowId, userId, idempotencyKey) {
  ensureCompany(db, companyId);
  const idemScope = idempotencyScope(db, userId, companyId, 'marketplace.install', idempotencyKey, { packRowId });
  if (idemScope && idemScope.replay) return idemScope.replay;

  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const row = getPackRow(db, companyId, packRowId);
    if (row.state === 'installed') throw fail('this pack version is already installed', 409, 'DUPLICATE_INSTALL');
    if (row.state !== 'verified') throw fail(`pack cannot be installed from state '${row.state}'`, 409, 'CANNOT_INSTALL_FROM_STATE');
    const otherInstalled = db.prepare("SELECT id, version FROM shop_marketplace_pack WHERE company_id = ? AND pack_id = ? AND state = 'installed'").get(companyId, row.pack_id);
    if (otherInstalled) throw fail(`pack '${row.pack_id}' version ${otherInstalled.version} is already installed; use upgrade`, 409, 'USE_UPGRADE_INSTEAD');

    const manifest = JSON.parse(row.manifest_json);
    const compat = JSON.parse(row.compat_json);
    assertCompatible(db, companyId, manifest, compat);

    packSdk.installPack(db, companyId, manifest);

    const after = { ...row, state: 'installed', installed_at: now(), installed_by: userId || 'system', entitlement_state: computeEntitlement(db, companyId, manifest, now()).state };
    db.prepare('UPDATE shop_marketplace_pack SET state = ?, installed_at = ?, installed_by = ?, entitlement_state = ? WHERE id = ?')
      .run(after.state, after.installed_at, after.installed_by, after.entitlement_state, row.id);

    recordWrite(db, null, companyId, 'shop_marketplace_pack', row.id, 'install', userId, row, after);
    publishOutbox(db, 'marketplace.pack.installed', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id, version: row.version });
    publishEvent(db, 'marketplace.pack.installed', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id, version: row.version });

    const response = decoratePack(db, companyId, db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ?').get(row.id));
    if (idemScope) rememberIdempotency(db, idemScope, response, 201);
    if (owns) db.exec('COMMIT');
    return response;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function upgradePack(db, companyId, packRowId, userId, idempotencyKey) {
  ensureCompany(db, companyId);
  const idemScope = idempotencyScope(db, userId, companyId, 'marketplace.upgrade', idempotencyKey, { packRowId });
  if (idemScope && idemScope.replay) return idemScope.replay;

  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const newRow = getPackRow(db, companyId, packRowId);
    if (newRow.state !== 'verified') throw fail(`pack cannot be upgraded to from state '${newRow.state}'`, 409, 'CANNOT_INSTALL_FROM_STATE');
    const oldRow = db.prepare("SELECT * FROM shop_marketplace_pack WHERE company_id = ? AND pack_id = ? AND state = 'installed'").get(companyId, newRow.pack_id);
    if (!oldRow) throw fail(`pack '${newRow.pack_id}' is not currently installed; use install`, 404, 'NOT_INSTALLED');
    if (newRow.version === oldRow.version) throw fail('target version matches the installed version', 409, 'DUPLICATE_INSTALL');
    if (compareVersion(newRow.version, oldRow.version) <= 0) throw fail(`upgrade target version ${newRow.version} must be newer than installed version ${oldRow.version}`, 400, 'VERSION_NOT_NEWER');

    const manifest = JSON.parse(newRow.manifest_json);
    const compat = JSON.parse(newRow.compat_json);
    assertCompatible(db, companyId, manifest, compat, { excludePackId: newRow.pack_id });

    packSdk.upgradePack(db, companyId, manifest);

    const oldAfter = { ...oldRow, state: 'superseded', superseded_by: newRow.id };
    db.prepare('UPDATE shop_marketplace_pack SET state = ?, superseded_by = ? WHERE id = ?').run(oldAfter.state, oldAfter.superseded_by, oldRow.id);
    const newAfter = { ...newRow, state: 'installed', installed_at: now(), installed_by: userId || 'system', entitlement_state: computeEntitlement(db, companyId, manifest, now()).state };
    db.prepare('UPDATE shop_marketplace_pack SET state = ?, installed_at = ?, installed_by = ?, entitlement_state = ? WHERE id = ?')
      .run(newAfter.state, newAfter.installed_at, newAfter.installed_by, newAfter.entitlement_state, newRow.id);

    recordWrite(db, null, companyId, 'shop_marketplace_pack', newRow.id, 'upgrade', userId, oldRow, newAfter);
    publishOutbox(db, 'marketplace.pack.upgraded', companyId, userId, 'shop_marketplace_pack', newRow.id, { pack_id: newRow.pack_id, from_version: oldRow.version, to_version: newRow.version });
    publishEvent(db, 'marketplace.pack.upgraded', companyId, userId, 'shop_marketplace_pack', newRow.id, { pack_id: newRow.pack_id, from_version: oldRow.version, to_version: newRow.version });

    const response = decoratePack(db, companyId, db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ?').get(newRow.id));
    response.previous_version = oldRow.version;
    if (idemScope) rememberIdempotency(db, idemScope, response, 200);
    if (owns) db.exec('COMMIT');
    return response;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function disablePack(db, companyId, packRowId, userId) {
  ensureCompany(db, companyId);
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const row = getPackRow(db, companyId, packRowId);
    if (row.state !== 'installed') throw fail(`pack cannot be disabled from state '${row.state}'`, 409, 'CANNOT_DISABLE_FROM_STATE');
    const after = { ...row, state: 'disabled', disabled_at: now(), disabled_by: userId || 'system' };
    db.prepare('UPDATE shop_marketplace_pack SET state = ?, disabled_at = ?, disabled_by = ? WHERE id = ?').run(after.state, after.disabled_at, after.disabled_by, row.id);
    recordWrite(db, null, companyId, 'shop_marketplace_pack', row.id, 'disable', userId, row, after);
    publishOutbox(db, 'marketplace.pack.disabled', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id });
    publishEvent(db, 'marketplace.pack.disabled', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id });
    const response = decoratePack(db, companyId, db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ?').get(row.id));
    if (owns) db.exec('COMMIT');
    return response;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function enablePack(db, companyId, packRowId, userId) {
  ensureCompany(db, companyId);
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const row = getPackRow(db, companyId, packRowId);
    if (row.state !== 'disabled') throw fail(`pack cannot be enabled from state '${row.state}'`, 409, 'CANNOT_ENABLE_FROM_STATE');
    const after = { ...row, state: 'installed' };
    db.prepare('UPDATE shop_marketplace_pack SET state = ? WHERE id = ?').run(after.state, row.id);
    recordWrite(db, null, companyId, 'shop_marketplace_pack', row.id, 'enable', userId, row, after);
    publishOutbox(db, 'marketplace.pack.enabled', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id });
    publishEvent(db, 'marketplace.pack.enabled', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id });
    const response = decoratePack(db, companyId, db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ?').get(row.id));
    if (owns) db.exec('COMMIT');
    return response;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function uninstallPack(db, companyId, packRowId, userId) {
  ensureCompany(db, companyId);
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const row = getPackRow(db, companyId, packRowId);
    if (row.state !== 'installed' && row.state !== 'disabled') throw fail(`pack cannot be uninstalled from state '${row.state}'`, 409, 'CANNOT_UNINSTALL_FROM_STATE');

    packSdk.uninstallPack(db, companyId, row.pack_id);

    const after = { ...row, state: 'verified', uninstalled_at: now(), uninstalled_by: userId || 'system' };
    db.prepare('UPDATE shop_marketplace_pack SET state = ?, uninstalled_at = ?, uninstalled_by = ? WHERE id = ?').run(after.state, after.uninstalled_at, after.uninstalled_by, row.id);
    recordWrite(db, null, companyId, 'shop_marketplace_pack', row.id, 'uninstall', userId, row, after);
    publishOutbox(db, 'marketplace.pack.uninstalled', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id });
    publishEvent(db, 'marketplace.pack.uninstalled', companyId, userId, 'shop_marketplace_pack', row.id, { pack_id: row.pack_id });

    const conformance = packSdk.checkConformance(db, companyId, row.pack_id);
    const response = decoratePack(db, companyId, db.prepare('SELECT * FROM shop_marketplace_pack WHERE id = ?').get(row.id));
    response.conformance = conformance;
    if (owns) db.exec('COMMIT');
    return response;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

module.exports = {
  PLATFORM_VERSION,
  PACK_SDK_API_VERSION,
  compareVersion,
  registerSigner: infra.atomicCommand(registerSigner),
  revokeSigner: infra.atomicCommand(revokeSigner),
  listSigners,
  importPackage: infra.atomicCommand(importPackage),
  listCatalog,
  getPack,
  previewInstall,
  installPack: infra.atomicCommand(installPack),
  upgradePack: infra.atomicCommand(upgradePack),
  disablePack: infra.atomicCommand(disablePack),
  enablePack: infra.atomicCommand(enablePack),
  uninstallPack: infra.atomicCommand(uninstallPack),
  checkConformance: packSdk.checkConformance,
  evaluateCompatibility,
};
