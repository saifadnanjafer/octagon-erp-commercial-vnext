// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

const crypto = require('crypto');

function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanSecret = String(secret || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < cleanSecret.length; i++) {
    const val = alphabet.indexOf(cleanSecret[i]);
    bits += val.toString(2).padStart(5, '0');
  }
  const buffer = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  return buffer;
}

function generateHOTP(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  let tmp = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = Number(tmp & 0xffn);
    tmp = tmp >> 8n;
  }
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) |
               ((hmac[offset + 1] & 0xff) << 16) |
               ((hmac[offset + 2] & 0xff) << 8) |
               (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTotp(secret, token, window = 1) {
  try {
    const secretBuffer = base32Decode(secret);
    const counter = Math.floor(Date.now() / 30000);
    const cleanToken = String(token || '').trim();
    for (let i = -window; i <= window; i++) {
      if (generateHOTP(secretBuffer, counter + i) === cleanToken) return true;
    }
  } catch (_) {}
  return false;
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function validateApiKey(db, key) {
  if (!key) return null;
  const hashed = hashApiKey(key);
  try {
    const row = db.prepare('SELECT user, role, expires_at FROM x_api_keys WHERE key_hash = ?').get(hashed);
    if (row) {
      if (new Date().toISOString() > row.expires_at) {
        // Expired
        db.prepare('DELETE FROM x_api_keys WHERE key_hash = ?').run(hashed);
        return null;
      }
      return { userId: row.user, role: row.role, groups: [row.role] };
    }
  } catch (_) {}
  return null;
}

function isUserDisabled(db, userId) {
  try {
    // Check in x_records for employee or user record status
    // If the data payload contains active=false or disabled=true, they are disabled.
    const row = db.prepare("SELECT data FROM x_records WHERE entity = 'user' AND id = ?").get(userId);
    if (row) {
      const data = JSON.parse(row.data);
      if (data.active === false || data.disabled === true) return true;
    }
  } catch (_) {}
  return false;
}

// ---------------------------------------------------------------------------
// T1.14.1 completion additions below. auth-hardening.js already had working
// TOTP-verify-at-login, API-key validation, and user-disable — this section
// adds the still-missing pieces: TOTP secret generation/enrollment, a
// config-driven password policy, session rotation on privilege change, and
// live API-key issuance/revocation.
//
// SECRET-HANDLING RULE (hard requirement, applies to every function below):
// raw TOTP secrets, otpauth:// URIs, raw API keys, and candidate passwords
// must NEVER be passed to console.log/console.error/console.warn or written
// to any table/log file. A raw secret is only ever allowed to leave this
// process once, in the return value of the function that generated it, so
// the HTTP route that calls it can place it in an authenticated response
// body. Callers (routes) must not log these return values either.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.substr(i, 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    output += BASE32_ALPHABET[parseInt(bits.slice(-remainder).padEnd(5, '0'), 2)];
  }
  return output;
}

/** Generate a fresh random base32 TOTP secret (160 bits by default). */
function generateTotpSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

/** Build an otpauth:// URI an authenticator app can scan/import. */
function buildOtpAuthUri(secret, accountLabel, issuer = 'Octagon ERP') {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({ secret, issuer, digits: '6', period: '30', algorithm: 'SHA1' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Begin (or restart) TOTP enrollment for a user: generates a new secret,
 * stores it as unconfirmed, and returns it once for the enrollment
 * response. The caller (route) must never log this return value.
 */
function createTotpEnrollment(db, userId) {
  const secret = generateTotpSecret();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO x_totp_enrollments (user_id, secret, confirmed, created_at, confirmed_at)
    VALUES (?, ?, 0, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, confirmed = 0, created_at = excluded.created_at, confirmed_at = NULL
  `).run(userId, secret, now);
  return { secret, otpauthUri: buildOtpAuthUri(secret, userId) };
}

/** Confirm a pending TOTP enrollment by verifying one real code from it. */
function confirmTotpEnrollment(db, userId, code) {
  const row = db.prepare('SELECT secret FROM x_totp_enrollments WHERE user_id = ?').get(userId);
  if (!row) {
    throw Object.assign(new Error('لا يوجد تسجيل مصادقة ثنائية معلّق لهذا المستخدم'), { statusCode: 404 });
  }
  if (!verifyTotp(row.secret, code)) return false;
  db.prepare('UPDATE x_totp_enrollments SET confirmed = 1, confirmed_at = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
  return true;
}

/** The SQL-native confirmed TOTP secret for a user, or null. See auth/TASK.md for the login-path integration gap. */
function getConfirmedTotpSecret(db, userId) {
  const row = db.prepare('SELECT secret FROM x_totp_enrollments WHERE user_id = ? AND confirmed = 1').get(userId);
  return row ? row.secret : null;
}

function removeTotpEnrollment(db, userId) {
  const info = db.prepare('DELETE FROM x_totp_enrollments WHERE user_id = ?').run(userId);
  return info.changes > 0;
}

const DEFAULT_PASSWORD_POLICY = {
  min_length: 10,
  max_length: 128,
  require_upper: 1,
  require_lower: 1,
  require_digit: 1,
  require_symbol: 1,
  min_char_classes: 3,
};

/** Read the config-driven password policy, degrading to safe defaults if unset. */
function loadPasswordPolicy(db) {
  try {
    const row = db.prepare('SELECT * FROM x_auth_password_policy WHERE id = 1').get();
    if (row) return { ...DEFAULT_PASSWORD_POLICY, ...row };
  } catch (_) {}
  return { ...DEFAULT_PASSWORD_POLICY };
}

/** Admin-only: update the password policy config. */
function savePasswordPolicy(db, patch) {
  const current = loadPasswordPolicy(db);
  const next = {
    min_length: clampInt(patch.min_length, current.min_length, 4, 256),
    max_length: clampInt(patch.max_length, current.max_length, 8, 512),
    require_upper: boolInt(patch.require_upper, current.require_upper),
    require_lower: boolInt(patch.require_lower, current.require_lower),
    require_digit: boolInt(patch.require_digit, current.require_digit),
    require_symbol: boolInt(patch.require_symbol, current.require_symbol),
    min_char_classes: clampInt(patch.min_char_classes, current.min_char_classes, 1, 4),
  };
  db.prepare(`
    INSERT INTO x_auth_password_policy (id, min_length, max_length, require_upper, require_lower, require_digit, require_symbol, min_char_classes, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      min_length = excluded.min_length, max_length = excluded.max_length,
      require_upper = excluded.require_upper, require_lower = excluded.require_lower,
      require_digit = excluded.require_digit, require_symbol = excluded.require_symbol,
      min_char_classes = excluded.min_char_classes, updated_at = excluded.updated_at
  `).run(next.min_length, next.max_length, next.require_upper, next.require_lower, next.require_digit, next.require_symbol, next.min_char_classes, new Date().toISOString());
  return loadPasswordPolicy(db);
}

function clampInt(value, fallback, min, max) {
  const n = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : Number(fallback);
  return Math.max(min, Math.min(max, n));
}

function boolInt(value, fallback) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value ? 1 : 0;
}

/**
 * Validate a candidate password against policy. Never logs the password.
 * @returns {{ok: boolean, errors: string[]}}
 */
function checkPasswordPolicy(password, policy) {
  const p = { ...DEFAULT_PASSWORD_POLICY, ...(policy || {}) };
  const pw = String(password || '');
  const errors = [];
  if (pw.length < p.min_length) errors.push(`كلمة المرور قصيرة جداً (الحد الأدنى ${p.min_length} حرفاً)`);
  if (pw.length > p.max_length) errors.push(`كلمة المرور طويلة جداً (الحد الأقصى ${p.max_length} حرفاً)`);
  const classes = {
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  if (Number(p.require_upper) && !classes.upper) errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
  if (Number(p.require_lower) && !classes.lower) errors.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
  if (Number(p.require_digit) && !classes.digit) errors.push('يجب أن تحتوي على رقم واحد على الأقل');
  if (Number(p.require_symbol) && !classes.symbol) errors.push('يجب أن تحتوي على رمز خاص واحد على الأقل');
  const classCount = Object.values(classes).filter(Boolean).length;
  if (classCount < Number(p.min_char_classes)) {
    errors.push(`يجب استخدام ${p.min_char_classes} أنواع مختلفة على الأقل من الأحرف (كبيرة/صغيرة/أرقام/رموز)`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Session rotation on privilege change: mark every session token for this
 * user created before now as revoked. Pairs with isSessionRevoked(), which
 * the integrator wires into server.js's requireSession() (see
 * auth/INTEGRATION.md) — this function alone does not invalidate the
 * in-memory session Map by itself.
 */
function rotateSessionsForUser(db, userId) {
  const revokedAt = Date.now();
  db.prepare(`
    INSERT INTO x_session_revocations (user_id, revoked_at) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET revoked_at = excluded.revoked_at
  `).run(userId, revokedAt);
  return { userId, revokedAt };
}

/** True if a session created at `sessionCreatedAt` (epoch ms) predates the user's last rotation. */
function isSessionRevoked(db, userId, sessionCreatedAt) {
  try {
    const row = db.prepare('SELECT revoked_at FROM x_session_revocations WHERE user_id = ?').get(userId);
    if (!row) return false;
    return Number(sessionCreatedAt || 0) < Number(row.revoked_at);
  } catch (_) {
    return false;
  }
}

/**
 * Issue a new API key scoped to a role. The raw key is returned exactly
 * once — only `key_hash` is persisted (matches x_api_keys' existing
 * shape). Callers must place `key` only in the authenticated HTTP response
 * body and must never log it.
 */
function issueApiKey(db, { userId, role, ttlDays, label, createdBy } = {}) {
  const roleClean = String(role || '').trim();
  if (!roleClean) throw Object.assign(new Error('الدور (role) مطلوب لإصدار مفتاح API'), { statusCode: 400 });
  const rawKey = crypto.randomBytes(32).toString('base64url');
  const id = `key_${crypto.randomUUID()}`;
  const keyHash = hashApiKey(rawKey);
  const days = Number(ttlDays) > 0 ? Number(ttlDays) : 90;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO x_api_keys (key_hash, user, role, expires_at, id, label, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(keyHash, userId || roleClean, roleClean, expiresAt, id, label || null, now, createdBy || null);
  return { id, key: rawKey, role: roleClean, expires_at: expiresAt, label: label || null };
}

/** Revoke (delete) an API key by its addressable id. Returns true if a row was removed. */
function revokeApiKey(db, id) {
  const info = db.prepare('DELETE FROM x_api_keys WHERE id = ?').run(String(id || ''));
  return info.changes > 0;
}

/** List issued API keys (metadata only — never key_hash or the raw key). */
function listApiKeys(db) {
  return db.prepare('SELECT id, user, role, label, created_at, expires_at FROM x_api_keys ORDER BY created_at DESC').all();
}

module.exports = {
  verifyTotp,
  hashApiKey,
  validateApiKey,
  isUserDisabled,
  generateTotpSecret,
  buildOtpAuthUri,
  createTotpEnrollment,
  confirmTotpEnrollment,
  getConfirmedTotpSecret,
  removeTotpEnrollment,
  loadPasswordPolicy,
  savePasswordPolicy,
  checkPasswordPolicy,
  rotateSessionsForUser,
  isSessionRevoked,
  issueApiKey,
  revokeApiKey,
  listApiKeys,
  _internal: { base32Decode, generateHOTP, base32Encode },
};
