// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function fail(message, statusCode = 400) { const e = new Error(message); e.statusCode = statusCode; return e; }

function listPacks(db) { return db.prepare('SELECT pack_id,version,display_name,manifest,active FROM localization_pack WHERE active=1 ORDER BY pack_id').all().map(p => ({ ...p, manifest: JSON.parse(p.manifest || '{}') })); }

function installPack(db, companyId, packId, userId) {
  if (!db.prepare('SELECT 1 FROM companies WHERE company_id=?').get(companyId)) throw fail('company scope is invalid', 403);
  const pack = db.prepare('SELECT * FROM localization_pack WHERE pack_id=? AND active=1').get(packId);
  if (!pack) throw fail('localization pack not found', 404);
  const existing = db.prepare('SELECT * FROM company_localization WHERE company_id=? AND pack_id=?').get(companyId, packId);
  if (existing) return { ...existing, replayed: true };
  const entries = db.prepare('SELECT * FROM localization_pack_entry WHERE pack_id=? ORDER BY entry_type, entry_key').all(packId);
  const stamp = now();
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    for (const entry of entries) {
      const payload = JSON.parse(entry.payload);
      if (entry.entry_type === 'account') {
        const accountId = `${packId}_${companyId}_${entry.entry_key}`;
        db.prepare(`INSERT OR IGNORE INTO account(id,company_id,code,name,type,created_at,created_by) VALUES(?,?,?,?,?,?,?)`).run(accountId, companyId, payload.code, `${payload.name_en} / ${payload.name_ar}`, payload.type, stamp, userId || 'system');
      }
      if (entry.entry_type === 'tax') {
        const groupId = `${packId}_${companyId}_tax_group`;
        db.prepare(`INSERT OR IGNORE INTO tax_group(id,name,company_id) VALUES(?,?,?)`).run(groupId, `${pack.display_name} tax`, companyId);
        const taxId = `${packId}_${companyId}_${entry.entry_key}`;
        db.prepare(`INSERT OR IGNORE INTO tax(id,name,company_id,tax_group_id,amount_type,amount,price_include,type_tax_use,active) VALUES(?,?,?,?,?,?,?,?,1)`).run(taxId, `${payload.name_en} / ${payload.name_ar}`, companyId, groupId, payload.amount_type, Number(payload.amount || 0), payload.price_include ? 1 : 0, payload.type_tax_use || 'sale');
      }
    }
    db.prepare('INSERT INTO company_localization(company_id,pack_id,version,installed_at,installed_by) VALUES(?,?,?,?,?)').run(companyId, packId, pack.version, stamp, userId || 'system');
    if (owns) db.exec('COMMIT');
    return { company_id: companyId, pack_id: packId, version: pack.version, installed_at: stamp };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function uninstallPack(db, companyId, packId, userId) {
  const installed = db.prepare('SELECT * FROM company_localization WHERE company_id=? AND pack_id=?').get(companyId, packId);
  if (!installed) return { company_id: companyId, pack_id: packId, removed: false };
  const used = db.prepare(`SELECT COUNT(*) c FROM fiscal_doc f JOIN fiscal_doc_line l ON l.fiscal_doc_id=f.id
    WHERE f.company_id=? AND (l.account_id LIKE ? OR l.account_id LIKE ?)
      AND f.state IN ('posted','cancelled')`).get(companyId, `${packId}_${companyId}_%`, `${packId}_${companyId}_%`).c;
  if (Number(used) > 0) throw fail('localization uninstall is blocked after transactions use pack accounts', 409);
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM company_localization WHERE company_id=? AND pack_id=?').run(companyId, packId);
    db.prepare('DELETE FROM tax WHERE company_id=? AND id LIKE ?').run(companyId, `${packId}_${companyId}_%`);
    db.prepare('DELETE FROM tax_group WHERE company_id=? AND id=?').run(companyId, `${packId}_${companyId}_tax_group`);
    db.prepare('DELETE FROM account WHERE company_id=? AND id LIKE ?').run(companyId, `${packId}_${companyId}_%`);
    if (owns) db.exec('COMMIT');
    return { company_id: companyId, pack_id: packId, removed: true, removed_by: userId || 'system' };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function getCompanyLocalization(db, companyId) { return db.prepare('SELECT * FROM company_localization WHERE company_id=? ORDER BY pack_id').all(companyId); }

module.exports = { listPacks, installPack, uninstallPack, getCompanyLocalization, fail };
