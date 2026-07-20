// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.4 (proprietary self, not copied)
// R9.4 signed pack format (.octapack): deterministic canonicalization, Ed25519
// signing, and fail-closed verification. This module never executes package
// content — it only parses declarative JSON and returns it for the marketplace
// engine to validate against the canonical Pack SDK manifest contract.
'use strict';

const crypto = require('node:crypto');

const FORMAT_VERSION = 1;
const SIGNATURE_ALGORITHM = 'ed25519';
const MAX_FILE_COUNT = 200;
const MAX_FILE_BYTES = 1024 * 1024; // 1 MB per file
const MAX_PACKAGE_BYTES = 5 * 1024 * 1024; // 5 MB total
const ALLOWED_EXTENSIONS = new Set(['.json', '.md', '.txt']);
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

function err(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalBytes(value) { return Buffer.from(JSON.stringify(canonicalize(value))); }

function fileInventory(files) {
  return files.map((file) => ({ path: file.path, sha256: file.sha256, size: file.size }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function signedPayload(compat, files) { return canonicalBytes({ compat, files: fileInventory(files) }); }

// ── Key helpers (Ed25519, raw hex-encoded SPKI/PKCS8 DER) ──

function generateSigningKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKey: publicKey.toString('hex'), privateKey: privateKey.toString('hex') };
}

function publicKeyFingerprint(publicKeyHex) {
  return sha256(Buffer.from(String(publicKeyHex || ''), 'hex'));
}

function loadPublicKey(publicKeyHex) {
  return crypto.createPublicKey({ key: Buffer.from(String(publicKeyHex), 'hex'), format: 'der', type: 'spki' });
}

function loadPrivateKey(privateKeyHex) {
  return crypto.createPrivateKey({ key: Buffer.from(String(privateKeyHex), 'hex'), format: 'der', type: 'pkcs8' });
}

// ── Package construction (test/tooling helper — never used against untrusted input) ──

function buildPackage({ compat, manifest, contentFiles = [], signerId, privateKeyHex }) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const files = [
    { path: 'manifest.json', size: manifestBytes.length, sha256: sha256(manifestBytes), content_b64: manifestBytes.toString('base64') },
    ...contentFiles.map((file) => {
      const bytes = Buffer.from(typeof file.content === 'string' ? file.content : JSON.stringify(file.content));
      return { path: file.path, size: bytes.length, sha256: sha256(bytes), content_b64: bytes.toString('base64') };
    }),
  ];
  const payload = signedPayload(compat, files);
  const privateKey = loadPrivateKey(privateKeyHex);
  const signature = crypto.sign(null, payload, privateKey).toString('hex');
  return { format_version: FORMAT_VERSION, compat, files, signer_id: signerId, signature_algorithm: SIGNATURE_ALGORITHM, signature };
}

// ── Path / size safety ──

function assertSafePath(p) {
  if (typeof p !== 'string' || !p.trim()) throw err('a package file path is required', 'PATH_INVALID');
  if (p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) throw err(`absolute path is not allowed: ${p}`, 'ABSOLUTE_PATH_REJECTED');
  if (p.split(/[/\\]/).some((segment) => segment === '..' || segment === '.')) throw err(`path traversal segment is not allowed: ${p}`, 'PATH_TRAVERSAL_REJECTED');
  if (!SAFE_PATH.test(p)) throw err(`unsafe path characters: ${p}`, 'PATH_INVALID');
  const ext = p.includes('.') ? p.slice(p.lastIndexOf('.')).toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) throw err(`file type is not permitted in a pack: ${p}`, 'FILE_TYPE_REJECTED');
}

// ── Verification (fail-closed; never trusts declared checksums without recomputation) ──

function verifyPackage(pkg, { lookupSigner }) {
  if (!pkg || typeof pkg !== 'object') throw err('package must be a non-null object', 'PACKAGE_INVALID');
  if (pkg.format_version !== FORMAT_VERSION) throw err(`unsupported package format_version: ${pkg.format_version}`, 'FORMAT_VERSION_UNSUPPORTED');
  if (!pkg.compat || typeof pkg.compat !== 'object') throw err('package compat block is required', 'COMPAT_MISSING');
  const { platform_min, platform_max, sdk_api_min, sdk_api_max } = pkg.compat;
  if (!platform_min || !platform_max) throw err('compat.platform_min/platform_max are required', 'COMPAT_MISSING');
  if (sdk_api_min == null || sdk_api_max == null) throw err('compat.sdk_api_min/sdk_api_max are required', 'COMPAT_MISSING');

  if (!Array.isArray(pkg.files) || !pkg.files.length) throw err('package must declare a non-empty files inventory', 'FILES_MISSING');
  if (pkg.files.length > MAX_FILE_COUNT) throw err(`package exceeds max file count (${MAX_FILE_COUNT})`, 'TOO_MANY_FILES');

  let totalSize = 0;
  const seenPaths = new Set();
  for (const file of pkg.files) {
    assertSafePath(file.path);
    const normalized = file.path.toLowerCase();
    if (seenPaths.has(normalized)) throw err(`duplicate normalized path: ${file.path}`, 'DUPLICATE_PATH');
    seenPaths.add(normalized);
    if (typeof file.content_b64 !== 'string') throw err(`file content is missing: ${file.path}`, 'FILE_CONTENT_MISSING');
    let decoded;
    try { decoded = Buffer.from(file.content_b64, 'base64'); } catch (_) { throw err(`file content is not valid base64: ${file.path}`, 'FILE_CONTENT_INVALID'); }
    if (decoded.length > MAX_FILE_BYTES) throw err(`file exceeds max size: ${file.path}`, 'OVERSIZED_FILE');
    totalSize += decoded.length;
    if (totalSize > MAX_PACKAGE_BYTES) throw err('package exceeds max total size', 'OVERSIZED_PACKAGE');
    const actualSha256 = sha256(decoded);
    if (actualSha256 !== file.sha256) throw err(`checksum mismatch for ${file.path}`, 'CHECKSUM_MISMATCH');
    if (decoded.length !== file.size) throw err(`declared size mismatch for ${file.path}`, 'CHECKSUM_MISMATCH');
  }

  const manifestFile = pkg.files.find((f) => f.path === 'manifest.json');
  if (!manifestFile) throw err('package is missing manifest.json', 'MISSING_MANIFEST_FILE');
  let manifest;
  try { manifest = JSON.parse(Buffer.from(manifestFile.content_b64, 'base64').toString('utf8')); }
  catch (_) { throw err('manifest.json is not valid JSON', 'MALFORMED_JSON'); }

  const declaredExtra = new Set(Array.isArray(manifest.content_files) ? manifest.content_files : []);
  const actualExtra = new Set(pkg.files.filter((f) => f.path !== 'manifest.json').map((f) => f.path));
  for (const declared of declaredExtra) if (!actualExtra.has(declared)) throw err(`manifest declares content_files entry not present in package: ${declared}`, 'MISSING_MANIFEST_FILE');
  for (const actual of actualExtra) if (!declaredExtra.has(actual)) throw err(`package contains a file not declared in manifest.content_files: ${actual}`, 'UNDECLARED_FILE');

  if (pkg.signature_algorithm !== SIGNATURE_ALGORITHM) throw err(`unsupported signature algorithm: ${pkg.signature_algorithm}`, 'ALGORITHM_UNSUPPORTED');
  if (typeof pkg.signature !== 'string' || !/^[0-9a-f]+$/i.test(pkg.signature)) throw err('signature is malformed', 'SIGNATURE_MALFORMED');
  if (typeof pkg.signer_id !== 'string' || !pkg.signer_id.trim()) throw err('signer_id is required', 'SIGNER_ID_REQUIRED');

  const signer = typeof lookupSigner === 'function' ? lookupSigner(pkg.signer_id) : null;
  if (!signer) throw err(`unknown signer: ${pkg.signer_id}`, 'UNKNOWN_SIGNER');
  if (signer.status !== 'active') throw err(`signer is revoked: ${pkg.signer_id}`, 'SIGNER_REVOKED');
  const nowIso = new Date().toISOString();
  if (signer.valid_to && nowIso > signer.valid_to) throw err(`signer key has expired: ${pkg.signer_id}`, 'SIGNER_EXPIRED');
  if (signer.valid_from && nowIso < signer.valid_from) throw err(`signer key is not yet valid: ${pkg.signer_id}`, 'SIGNER_EXPIRED');

  let publicKey;
  try { publicKey = loadPublicKey(signer.public_key); }
  catch (_) { throw err('signer public key is malformed', 'MALFORMED_KEY'); }

  const payload = signedPayload(pkg.compat, pkg.files);
  let signatureValid = false;
  try { signatureValid = crypto.verify(null, payload, publicKey, Buffer.from(pkg.signature, 'hex')); }
  catch (_) { signatureValid = false; }
  if (!signatureValid) throw err('digital signature verification failed', 'SIGNATURE_INVALID');

  const packageChecksum = sha256(payload);
  return { manifest, compat: pkg.compat, signer, packageChecksum };
}

module.exports = {
  FORMAT_VERSION,
  SIGNATURE_ALGORITHM,
  MAX_FILE_COUNT,
  MAX_FILE_BYTES,
  MAX_PACKAGE_BYTES,
  canonicalize,
  canonicalBytes,
  sha256,
  generateSigningKeypair,
  publicKeyFingerprint,
  loadPublicKey,
  loadPrivateKey,
  buildPackage,
  verifyPackage,
};
