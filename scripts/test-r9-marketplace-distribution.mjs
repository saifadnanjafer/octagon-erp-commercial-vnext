// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.4 (proprietary self, not copied)
// R9.4 focused acceptance: disposable DB only. Proves the signed .octapack
// format, trusted signer registry, fail-closed verification (tamper/path/size/
// algorithm/signer rejections), the compatibility+entitlement matrix, the
// install/upgrade/disable/enable/uninstall lifecycle through the canonical
// Pack SDK, atomicity/rollback on outbox failure, company scope, route-level
// local-dev rejection, and safe migration rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import marketplace from '../vnext/server/modules/packs/marketplace-engine.js';
import packCrypto from '../vnext/server/modules/packs/pack-crypto.js';
import packSdk from '../vnext/server/modules/packs/pack-sdk-engine.js';
import { mountMarketplaceRoutes } from '../vnext/server/modules/packs/marketplace-routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r9-marketplace-'));
const dbPath = path.join(temp, 'r9-marketplace.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;

function check(name, fn) {
  try {
    fn();
    results.push(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}: ${error.message}`);
    console.error(error);
  }
}

const company = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(company, 'Demo Company');
const otherCompany = 'company-r9-mkt-other';
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(otherCompany, 'Other Company');

const COMPAT_OK = { platform_min: '9.0.0', platform_max: '9.999.999', sdk_api_min: 1, sdk_api_max: 1 };

function deepClone(value) { return JSON.parse(JSON.stringify(value)); }

function manifestFor(packId, version, overrides = {}) {
  return {
    pack_id: packId, name: overrides.name || packId, version, description: 'test pack', author: 'Octagon Test Suite',
    edition_required: overrides.edition_required || 'standard',
    dependencies: overrides.dependencies || [], conflicts: overrides.conflicts || [],
    content_files: overrides.content_files || [], pricing: overrides.pricing || { tier: 'free' },
    patches: overrides.patches || [
      { target_type: 'collection', action: 'add', target_key: `${packId}_records`, data: {} },
      { target_type: 'terminology', action: 'add', target_key: `${packId}_label`, data: { en: packId, ar: packId } },
    ],
  };
}

function tamperFile(pkg, filePath, mutateText) {
  const tampered = deepClone(pkg);
  const file = tampered.files.find((f) => f.path === filePath);
  const decodedText = Buffer.from(file.content_b64, 'base64').toString('utf8');
  const bytes = Buffer.from(mutateText(decodedText));
  file.content_b64 = bytes.toString('base64');
  file.size = bytes.length;
  file.sha256 = packCrypto.sha256(bytes); // self-consistent: attacker recomputed the checksum, but cannot re-sign
  return tampered;
}

// ── Trusted signers ──

const trusted = packCrypto.generateSigningKeypair();
const untrusted = packCrypto.generateSigningKeypair();
const revocable = packCrypto.generateSigningKeypair();
const expiring = packCrypto.generateSigningKeypair();

check('signer registration validates the Ed25519 public key and computes a fingerprint', () => {
  const row = marketplace.registerSigner(db, company, { signer_id: 'octagon-labs', public_key: trusted.publicKey, publisher_name: 'Octagon Labs' }, 'admin');
  assert.equal(row.signer_id, 'octagon-labs');
  assert.equal(row.status, 'active');
  assert.equal(row.key_fingerprint.length, 64);
  assert.throws(() => marketplace.registerSigner(db, company, { signer_id: 'octagon-labs', public_key: trusted.publicKey }, 'admin'), { code: 'SIGNER_EXISTS' });
  assert.throws(() => marketplace.registerSigner(db, company, { signer_id: 'bad-key', public_key: 'zz' }, 'admin'), { code: 'MALFORMED_KEY' });
});

marketplace.registerSigner(db, company, { signer_id: 'revocable-publisher', public_key: revocable.publicKey }, 'admin');
marketplace.revokeSigner(db, company, 'revocable-publisher', { reason: 'key compromised' }, 'admin');

marketplace.registerSigner(db, company, { signer_id: 'expired-publisher', public_key: expiring.publicKey, valid_from: '2020-01-01T00:00:00.000Z', valid_to: '2020-06-01T00:00:00.000Z' }, 'admin');

check('listSigners reports active and revoked signers with fingerprints, no private material', () => {
  const rows = marketplace.listSigners(db, company);
  assert.ok(rows.some((r) => r.signer_id === 'octagon-labs' && r.status === 'active'));
  assert.ok(rows.some((r) => r.signer_id === 'revocable-publisher' && r.status === 'revoked'));
  assert.ok(rows.every((r) => !('public_key' in r)));
});

// ── Valid signed packages: Workshop (R9.2) and Retail/POS (R9.3) ──

const workshopManifestV1 = manifestFor('workshop_mkt', '1.0.0', {
  name: 'Workshop & Advertising Production', content_files: ['notes.md'],
  patches: [
    { target_type: 'collection', action: 'add', target_key: 'job_orders', data: { fields: ['name', 'status', 'assigned_to'] } },
    { target_type: 'state', action: 'add', target_key: 'job_orders:design', data: { label: 'Design', sequence: 1 } },
    { target_type: 'terminology', action: 'add', target_key: 'home_title', data: { en: 'Workshop Dashboard', ar: 'لوحة ورشة العمل' } },
  ],
});
const workshopPkgV1 = packCrypto.buildPackage({
  compat: COMPAT_OK, manifest: workshopManifestV1, contentFiles: [{ path: 'notes.md', content: 'Workshop pack release notes.' }],
  signerId: 'octagon-labs', privateKeyHex: trusted.privateKey,
});

const realRetailManifestSource = JSON.parse(fs.readFileSync(path.join(here, '../vnext/server/modules/packs/retail-pos-manifest.json'), 'utf8'));
const retailManifest = { ...realRetailManifestSource, pack_id: 'retail_pos_mkt', dependencies: [], conflicts: [], content_files: [], pricing: { tier: 'free' } };
const retailPkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: retailManifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });

// A package whose identity is never itself imported successfully — every
// tamper test below imports a mutated CLONE of it, so each produces a fresh
// rejection instead of colliding with (or clobbering) an already-verified row.
const tamperTargetManifest = manifestFor('tamper_target_pack', '1.0.0', { content_files: ['notes.md'] });
const tamperTargetPkg = packCrypto.buildPackage({
  compat: COMPAT_OK, manifest: tamperTargetManifest, contentFiles: [{ path: 'notes.md', content: 'Tamper target release notes.' }],
  signerId: 'octagon-labs', privateKeyHex: trusted.privateKey,
});

let workshopRowV1;
check('valid signed Workshop package verifies', () => {
  workshopRowV1 = marketplace.importPackage(db, company, workshopPkgV1, 'admin');
  assert.equal(workshopRowV1.state, 'verified');
  assert.equal(workshopRowV1.lifecycle_state, 'installable');
  assert.equal(workshopRowV1.pack_id, 'workshop_mkt');
  assert.equal(workshopRowV1.signer_fingerprint.length, 64);
});

let retailRow;
check('valid signed Retail/POS package (real R9.3 manifest) verifies', () => {
  retailRow = marketplace.importPackage(db, company, retailPkg, 'admin');
  assert.equal(retailRow.state, 'verified');
  assert.equal(retailRow.manifest.collections.length, 8);
});

// ── Tamper / integrity ──

check('changed manifest byte rejected (self-consistent tamper invalidates signature)', () => {
  const tampered = tamperFile(tamperTargetPkg, 'manifest.json', (text) => JSON.stringify({ ...JSON.parse(text), name: `${JSON.parse(text).name} TAMPERED` }));
  const row = marketplace.importPackage(db, company, tampered, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'SIGNATURE_INVALID');
});

check('changed package file rejected (non-manifest file tamper invalidates signature)', () => {
  const tampered = tamperFile(tamperTargetPkg, 'notes.md', () => 'attacker-modified notes');
  const row = marketplace.importPackage(db, company, tampered, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'SIGNATURE_INVALID');
});

check('corrupted file content without checksum update is rejected as a checksum mismatch', () => {
  const corrupted = deepClone(tamperTargetPkg);
  const file = corrupted.files.find((f) => f.path === 'notes.md');
  file.content_b64 = Buffer.from('silently corrupted bytes').toString('base64'); // sha256/size left stale
  const row = marketplace.importPackage(db, company, corrupted, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'CHECKSUM_MISMATCH');
});

check('unknown signer rejected', () => {
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestFor('unknown_signer_pack', '1.0.0'), signerId: 'ghost-publisher', privateKeyHex: untrusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'UNKNOWN_SIGNER');
});

check('revoked signer rejected', () => {
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestFor('revoked_signer_pack', '1.0.0'), signerId: 'revocable-publisher', privateKeyHex: revocable.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'SIGNER_REVOKED');
});

check('expired signer rejected', () => {
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestFor('expired_signer_pack', '1.0.0'), signerId: 'expired-publisher', privateKeyHex: expiring.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'SIGNER_EXPIRED');
});

check('malformed signature rejected', () => {
  const pkg = deepClone(tamperTargetPkg);
  pkg.signature = 'not-hex-zz';
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'SIGNATURE_MALFORMED');
});

check('unsupported algorithm rejected', () => {
  const pkg = deepClone(tamperTargetPkg);
  pkg.signature_algorithm = 'rsa-sha256';
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'ALGORITHM_UNSUPPORTED');
});

check('path traversal rejected', () => {
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestFor('traversal_pack', '1.0.0', { content_files: ['../evil.json'] }), contentFiles: [{ path: '../evil.json', content: { x: 1 } }], signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'PATH_TRAVERSAL_REJECTED');
});

check('absolute path rejected', () => {
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestFor('abs_path_pack', '1.0.0', { content_files: ['/etc/evil.json'] }), contentFiles: [{ path: '/etc/evil.json', content: { x: 1 } }], signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'ABSOLUTE_PATH_REJECTED');
});

check('duplicate normalized path rejected', () => {
  const manifest = manifestFor('dup_path_pack', '1.0.0', { content_files: ['Notes.json'] });
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest, contentFiles: [{ path: 'Notes.json', content: { x: 1 } }], signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  pkg.files.push({ ...pkg.files.find((f) => f.path === 'Notes.json'), path: 'notes.json' });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'DUPLICATE_PATH');
});

check('oversized package/file rejected', () => {
  const bigContent = 'x'.repeat(packCrypto.MAX_FILE_BYTES + 1);
  const manifest = manifestFor('oversized_pack', '1.0.0', { content_files: ['big.txt'] });
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest, contentFiles: [{ path: 'big.txt', content: bigContent }], signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'rejected');
  assert.equal(row.rejection_code, 'OVERSIZED_FILE');
});

check('missing declared content file and undeclared file are both rejected', () => {
  const manifestMissing = manifestFor('missing_file_pack', '1.0.0', { content_files: ['ghost.json'] });
  const pkgMissing = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestMissing, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const rowMissing = marketplace.importPackage(db, company, pkgMissing, 'admin');
  assert.equal(rowMissing.rejection_code, 'MISSING_MANIFEST_FILE');

  const manifestUndeclared = manifestFor('undeclared_file_pack', '1.0.0', { content_files: [] });
  const pkgUndeclared = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestUndeclared, contentFiles: [{ path: 'extra.json', content: { x: 1 } }], signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const rowUndeclared = marketplace.importPackage(db, company, pkgUndeclared, 'admin');
  assert.equal(rowUndeclared.rejection_code, 'UNDECLARED_FILE');
});

check('tampered and rejected packages never apply any registry patch', () => {
  for (const packId of ['unknown_signer_pack', 'revoked_signer_pack', 'expired_signer_pack', 'traversal_pack', 'abs_path_pack', 'tamper_target_pack']) {
    const patches = db.prepare('SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = ?').get(company, packId);
    assert.equal(patches.n, 0, `${packId} must have zero patch rows`);
  }
  const registryRows = db.prepare("SELECT COUNT(*) n FROM shop_pack_registry WHERE company_id = ? AND pack_id LIKE '%_pack'").get(company);
  assert.equal(registryRows.n, 0);
});

// ── Compatibility matrix ──

check('incompatible platform version rejected before mutation', () => {
  const manifest = manifestFor('platform_incompat_pack', '1.0.0');
  const compat = { ...COMPAT_OK, platform_max: '1.0.0' };
  const pkg = packCrypto.buildPackage({ compat, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.equal(row.state, 'verified');
  assert.throws(() => marketplace.installPack(db, company, row.id, 'admin'), { code: 'PLATFORM_VERSION_INCOMPATIBLE' });
  assert.equal(db.prepare('SELECT state FROM shop_marketplace_pack WHERE id = ?').get(row.id).state, 'verified');
});

check('incompatible Pack SDK API version rejected before mutation', () => {
  const manifest = manifestFor('sdk_incompat_pack', '1.0.0');
  const compat = { ...COMPAT_OK, sdk_api_max: 0 };
  const pkg = packCrypto.buildPackage({ compat, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.throws(() => marketplace.installPack(db, company, row.id, 'admin'), { code: 'SDK_API_VERSION_INCOMPATIBLE' });
});

check('missing dependency rejected', () => {
  const manifest = manifestFor('needs_dep_pack', '1.0.0', { dependencies: [{ pack_id: 'nonexistent_base_pack', min_version: '1.0.0' }] });
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.throws(() => marketplace.installPack(db, company, row.id, 'admin'), { code: 'DEPENDENCY_MISSING' });
});

// A real base pack installed directly via the canonical Pack SDK, so dependency
// and conflict checks below have a genuine installed pack to react to.
packSdk.installPack(db, company, { pack_id: 'base_pack', name: 'Base Pack', version: '1.0.0' });

check('incompatible dependency version rejected', () => {
  const manifest = manifestFor('needs_newer_base_pack', '1.0.0', { dependencies: [{ pack_id: 'base_pack', min_version: '2.0.0' }] });
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.throws(() => marketplace.installPack(db, company, row.id, 'admin'), { code: 'DEPENDENCY_VERSION_INCOMPATIBLE' });
});

check('conflicting installed pack rejected', () => {
  const manifest = manifestFor('conflicts_with_base_pack', '1.0.0', { conflicts: ['base_pack'] });
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.throws(() => marketplace.installPack(db, company, row.id, 'admin'), { code: 'CONFLICTING_PACK_INSTALLED' });
});

check('edition restriction enforced', () => {
  const manifest = manifestFor('enterprise_only_pack', '1.0.0', { edition_required: 'enterprise' });
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.throws(() => marketplace.installPack(db, company, row.id, 'admin'), { code: 'EDITION_INSUFFICIENT' });
});

check('paid-pack entitlement enforced', () => {
  const manifest = manifestFor('paid_feature_pack', '1.0.0', { pricing: { tier: 'paid', entitlement_feature: 'pack:paid_feature_pack' } });
  const pkg = packCrypto.buildPackage({ compat: COMPAT_OK, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  assert.throws(() => marketplace.installPack(db, company, row.id, 'admin'), { code: 'ENTITLEMENT_MISSING' });
});

check('previewInstall reports all compatibility failures without mutating state', () => {
  const manifest = manifestFor('multi_fail_pack', '1.0.0', { edition_required: 'enterprise', dependencies: [{ pack_id: 'nonexistent_base_pack', min_version: '1.0.0' }] });
  const pkg = packCrypto.buildPackage({ compat: { ...COMPAT_OK, platform_max: '1.0.0' }, manifest, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const row = marketplace.importPackage(db, company, pkg, 'admin');
  const preview = marketplace.previewInstall(db, company, row.id);
  assert.equal(preview.compatible, false);
  const codes = preview.reasons.map((r) => r.code);
  assert.ok(codes.includes('PLATFORM_VERSION_INCOMPATIBLE'));
  assert.ok(codes.includes('DEPENDENCY_MISSING'));
  assert.ok(codes.includes('EDITION_INSUFFICIENT'));
  assert.equal(db.prepare('SELECT state FROM shop_marketplace_pack WHERE id = ?').get(row.id).state, 'verified');
});

// ── Install / duplicate / upgrade / disable / uninstall lifecycle ──

check('successful install through signed package', () => {
  const installed = marketplace.installPack(db, company, workshopRowV1.id, 'admin');
  assert.equal(installed.state, 'installed');
  const registryRow = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(company, 'workshop_mkt');
  assert.equal(registryRow.installed, 1);
  assert.equal(registryRow.version, '1.0.0');
  const patches = db.prepare('SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').get(company, 'workshop_mkt');
  assert.equal(patches.n, 3);
});

check('duplicate install rejected', () => {
  assert.throws(() => marketplace.installPack(db, company, workshopRowV1.id, 'admin'), { code: 'DUPLICATE_INSTALL' });
});

check('install audit/outbox/event written separately', () => {
  const audit = db.prepare("SELECT COUNT(*) n FROM x_audit WHERE entity = 'shop_marketplace_pack' AND record_id = ?").get(workshopRowV1.id);
  const outbox = db.prepare("SELECT COUNT(*) n FROM vnext_outbox WHERE event_type = 'marketplace.pack.installed' AND record_id = ?").get(workshopRowV1.id);
  const eventLog = db.prepare("SELECT COUNT(*) n FROM vnext_event_log WHERE event_type = 'marketplace.pack.installed' AND record_id = ?").get(workshopRowV1.id);
  assert.ok(audit.n >= 1);
  assert.ok(outbox.n >= 1);
  assert.ok(eventLog.n >= 1);
});

let workshopRowV1dot1;
check('successful compatible upgrade', () => {
  const manifestV1dot1 = manifestFor('workshop_mkt', '1.1.0', { content_files: ['notes.md'] });
  const pkgV1dot1 = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestV1dot1, contentFiles: [{ path: 'notes.md', content: 'v1.1.0 release notes.' }], signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  workshopRowV1dot1 = marketplace.importPackage(db, company, pkgV1dot1, 'admin');
  const upgraded = marketplace.upgradePack(db, company, workshopRowV1dot1.id, 'admin');
  assert.equal(upgraded.state, 'installed');
  assert.equal(upgraded.previous_version, '1.0.0');
  assert.equal(db.prepare('SELECT state FROM shop_marketplace_pack WHERE id = ?').get(workshopRowV1.id).state, 'superseded');
  const registryRow = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(company, 'workshop_mkt');
  assert.equal(registryRow.version, '1.1.0');
});

check('failed upgrade preserves the prior installed version', () => {
  const manifestV1dot2 = manifestFor('workshop_mkt', '1.2.0');
  const pkgV1dot2 = packCrypto.buildPackage({ compat: COMPAT_OK, manifest: manifestV1dot2, signerId: 'octagon-labs', privateKeyHex: trusted.privateKey });
  const rowV1dot2 = marketplace.importPackage(db, company, pkgV1dot2, 'admin');

  db.exec("CREATE TRIGGER temp.t_mkt_outbox_fail BEFORE INSERT ON vnext_outbox BEGIN SELECT RAISE(ABORT, 'injected outbox write failure'); END;");
  assert.throws(() => marketplace.upgradePack(db, company, rowV1dot2.id, 'admin'), /injected outbox write failure/);
  db.exec('DROP TRIGGER temp.t_mkt_outbox_fail;');

  const registryRow = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(company, 'workshop_mkt');
  assert.equal(registryRow.version, '1.1.0');
  assert.equal(db.prepare('SELECT state FROM shop_marketplace_pack WHERE id = ?').get(workshopRowV1dot1.id).state, 'installed');
  assert.equal(db.prepare('SELECT state FROM shop_marketplace_pack WHERE id = ?').get(rowV1dot2.id).state, 'verified');
});

check('disable then enable round-trips the catalog state without touching applied patches', () => {
  const disabled = marketplace.disablePack(db, company, workshopRowV1dot1.id, 'admin');
  assert.equal(disabled.state, 'disabled');
  const patchesWhileDisabled = db.prepare('SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').get(company, 'workshop_mkt');
  assert.ok(patchesWhileDisabled.n > 0);
  assert.throws(() => marketplace.upgradePack(db, company, workshopRowV1dot1.id, 'admin'), { code: 'CANNOT_INSTALL_FROM_STATE' });
  const enabled = marketplace.enablePack(db, company, workshopRowV1dot1.id, 'admin');
  assert.equal(enabled.state, 'installed');
});

check('uninstall leaves zero residue', () => {
  const result = marketplace.uninstallPack(db, company, workshopRowV1dot1.id, 'admin');
  assert.equal(result.state, 'verified');
  assert.equal(result.conformance.passed, true);
  const patches = db.prepare('SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = ? AND applied = 1').get(company, 'workshop_mkt');
  assert.equal(patches.n, 0);
  const registryRow = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(company, 'workshop_mkt');
  assert.equal(registryRow.installed, 0);
});

check('outbox failure rolls back all installation residue', () => {
  const before = {
    registry: db.prepare("SELECT COUNT(*) n FROM shop_pack_registry WHERE company_id = ? AND pack_id = 'retail_pos_mkt'").get(company).n,
    patches: db.prepare("SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = 'retail_pos_mkt'").get(company).n,
    audit: db.prepare("SELECT COUNT(*) n FROM x_audit").get().n,
    outbox: db.prepare("SELECT COUNT(*) n FROM vnext_outbox").get().n,
    events: db.prepare("SELECT COUNT(*) n FROM vnext_event_log").get().n,
  };

  db.exec("CREATE TRIGGER temp.t_mkt_outbox_fail2 BEFORE INSERT ON vnext_outbox BEGIN SELECT RAISE(ABORT, 'injected outbox write failure'); END;");
  assert.throws(() => marketplace.installPack(db, company, retailRow.id, 'admin'), /injected outbox write failure/);
  db.exec('DROP TRIGGER temp.t_mkt_outbox_fail2;');

  assert.equal(db.prepare("SELECT state FROM shop_marketplace_pack WHERE id = ?").get(retailRow.id).state, 'verified');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM shop_pack_registry WHERE company_id = ? AND pack_id = 'retail_pos_mkt'").get(company).n, before.registry);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = 'retail_pos_mkt'").get(company).n, before.patches);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM x_audit").get().n, before.audit);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vnext_outbox").get().n, before.outbox);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM vnext_event_log").get().n, before.events);
});

check('Retail/POS (real R9.3 manifest) installs and uninstalls cleanly through the signed package path', () => {
  const installed = marketplace.installPack(db, company, retailRow.id, 'admin');
  assert.equal(installed.state, 'installed');
  const registryAfterInstall = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(company, 'retail_pos_mkt');
  assert.equal(registryAfterInstall.installed, 1);

  const uninstalled = marketplace.uninstallPack(db, company, retailRow.id, 'admin');
  assert.equal(uninstalled.state, 'verified');
  assert.equal(uninstalled.conformance.passed, true);
  const registryAfterUninstall = db.prepare('SELECT * FROM shop_pack_registry WHERE company_id = ? AND pack_id = ?').get(company, 'retail_pos_mkt');
  assert.equal(registryAfterUninstall.installed, 0);
  const residualPatches = db.prepare("SELECT COUNT(*) n FROM shop_pack_patch WHERE company_id = ? AND pack_id = 'retail_pos_mkt' AND applied = 1").get(company);
  assert.equal(residualPatches.n, 0);
});

// ── Scope, sessions, and API surface ──

check('cross-company access rejected', () => {
  assert.throws(() => marketplace.getPack(db, otherCompany, workshopRowV1dot1.id), { code: 'PACK_ROW_NOT_FOUND' });
  assert.throws(() => marketplace.installPack(db, otherCompany, retailRow.id, 'admin'), { code: 'PACK_ROW_NOT_FOUND' });
});

check('local-development session is rejected at the route layer', () => {
  const routes = mountMarketplaceRoutes({
    db,
    requireSession: () => ({ ok: true, mode: 'local-dev', userId: 'local-console', groups: ['admin'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true,
  });
  const req = new EventEmitter(); req.method = 'GET'; req.url = '/api/x/marketplace/catalog'; req.headers = { 'x-company-id': company };
  const res = { writeHead() {}, end() {} };
  const processed = routes.handle(req, res, new URL('/api/x/marketplace/catalog', 'http://localhost'));
  assert.equal(processed, true);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'Local development sessions are rejected');
});

check('Pack Manager API returns accurate, live-computed lifecycle states', () => {
  const routes = mountMarketplaceRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true,
  });
  const req = new EventEmitter(); req.method = 'GET'; req.url = '/api/x/marketplace/catalog'; req.headers = { 'x-company-id': company };
  const res = { writeHead() {}, end() {} };
  routes.handle(req, res, new URL('/api/x/marketplace/catalog', 'http://localhost'));
  assert.equal(res.statusCode, 200);
  const retailEntry = res.body.data.find((row) => row.id === retailRow.id);
  assert.equal(retailEntry.lifecycle_state, 'installable');
  // workshop_mkt 1.1.0 was cleanly uninstalled above (zero residue), so it is
  // once again a verified, compatible, freely reinstallable catalog entry.
  const workshopEntry = res.body.data.find((row) => row.pack_id === 'workshop_mkt' && row.version === '1.1.0');
  assert.equal(workshopEntry.lifecycle_state, 'installable');
  assert.equal(workshopEntry.state, 'verified');
});

// ── Rollback ──

db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
const cleanTables = [
  'gl_line', 'payment_allocation', 'payment', 'fiscal_doc_line', 'arap_document', 'fiscal_doc',
  'stock_move', 'stock_ledger_line', 'bin', 'stock_fifo_layer', 'stock_batch', 'stock_serial',
  'shop_retail_ticket_payment', 'shop_retail_ticket_tax', 'shop_retail_ticket_line', 'shop_retail_ticket',
  'shop_retail_scan_event', 'shop_retail_barcode', 'shop_retail_shift', 'shop_retail_store',
  'shop_marketplace_pack', 'shop_marketplace_signer',
  'shop_pack_patch', 'shop_pack_migration', 'shop_pack_registry', 'shop_license', 'shop_tenant',
  'product_master', 'tax', 'tax_repartition_line', 'partner_master', 'account', 'companies',
  'r3_worklist_item', 'r3_idempotency', 'vnext_event_log', 'x_audit', 'x_sequences', 'warehouses', 'locations',
  'fiscal_position', 'fiscal_position_tax_map', 'fiscal_position_account_map', 'vnext_outbox',
];
for (const t of cleanTables) {
  try { db.prepare(`DELETE FROM "${t}"`).run(); } catch (_) {}
}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 907 down restores the pre-907 schema boundary', () => {
  assert.ok(down.migrations.includes('907_r9_marketplace_pack_distribution'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_marketplace_pack'").get(), undefined);
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_marketplace_signer'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR9.4 MARKETPLACE & PACK DISTRIBUTION SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
