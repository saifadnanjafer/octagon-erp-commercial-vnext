// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.13 organization structures (proprietary self, not copied)
'use strict';

/**
 * T1.13.1 completion: this file previously only had 3 read-only helpers
 * (getCompany/listBranches/getCurrencyRate) against a schema that was
 * otherwise fully unwired — no writes, no fiscal-year generator, no
 * company-switcher backing state. This adds: company/branch/department/
 * warehouse listing, a one-action fiscal-year generator, and the
 * user<->company access + active-company selection tables that back the
 * new company-switcher UI (`vnext/client/shell/company-switcher.js`).
 *
 * Deliberately NOT wired to the legacy single-tenant JSON-blob mechanism
 * (`getActiveTenantProfile`/`stampServerTenantRecord` in server.js:646-772)
 * — see `vnext/server/org/TASK.md` "Known discrepancy" for why the two are
 * kept separate rather than silently merged.
 */

function getCompany(db, companyId) {
  return db.prepare('SELECT * FROM companies WHERE company_id = ?').get(companyId);
}

function listCompanies(db) {
  return db.prepare('SELECT * FROM companies ORDER BY name').all();
}

function listBranches(db, companyId) {
  return db.prepare('SELECT * FROM branches WHERE company_id = ? ORDER BY name').all(companyId);
}

function listDepartments(db, companyId) {
  return db.prepare('SELECT * FROM departments WHERE company_id = ? ORDER BY name').all(companyId);
}

function listWarehouses(db, companyId) {
  return db.prepare('SELECT * FROM warehouses WHERE company_id = ? ORDER BY name').all(companyId);
}

function getCurrencyRate(db, companyId, currencyCode, dateString) {
  const date = dateString || new Date().toISOString().slice(0, 10);
  const row = db.prepare(`
    SELECT rate FROM currency_rates
    WHERE company_id = ? AND currency_code = ? AND valid_from <= ?
    ORDER BY valid_from DESC LIMIT 1
  `).get(companyId, currencyCode, date);
  return row ? Number(row.rate) : 1.0;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Generate a full fiscal year of monthly `fiscal_periods` rows for a
 * company in one action (roadmap R1.13 acceptance: "fiscal periods
 * generate for a year in one action"). Idempotent — re-calling for a year
 * that already has periods returns the existing rows unchanged rather
 * than duplicating or erroring.
 *
 * @param {object} db sqlite handle
 * @param {string} companyId
 * @param {number} year calendar year, e.g. 2026
 * @param {{periodsPerYear?: number}} [opts] periodsPerYear defaults to 12 (monthly)
 * @returns {{ year: number, created: number, periods: object[] }}
 */
function generateFiscalYear(db, companyId, year, opts = {}) {
  if (!companyId) throw Object.assign(new Error('معرف الشركة مطلوب'), { statusCode: 400 });
  if (!getCompany(db, companyId)) throw Object.assign(new Error('الشركة غير موجودة'), { statusCode: 404 });
  const yearNum = Number(year);
  if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 9999) {
    throw Object.assign(new Error('سنة مالية غير صالحة'), { statusCode: 400 });
  }
  const periodsPerYear = Math.max(1, Math.min(12, Number(opts.periodsPerYear) || 12));
  const monthsPerPeriod = 12 / periodsPerYear;

  const existing = db.prepare(
    "SELECT period_id, name, start_date, end_date, status FROM fiscal_periods WHERE company_id = ? AND start_date LIKE ? ORDER BY start_date"
  ).all(companyId, `${yearNum}-%`);
  if (existing.length) {
    return { year: yearNum, created: 0, periods: existing };
  }

  const insert = db.prepare(
    'INSERT INTO fiscal_periods (period_id, company_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const periods = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let i = 0; i < periodsPerYear; i++) {
      const startMonth = Math.round(i * monthsPerPeriod) + 1;
      const endMonth = Math.round((i + 1) * monthsPerPeriod);
      const endDay = new Date(yearNum, endMonth, 0).getDate();
      const periodId = `${companyId}-FY${yearNum}-P${pad2(i + 1)}`;
      const startDate = isoDate(yearNum, startMonth, 1);
      const endDate = isoDate(yearNum, endMonth, endDay);
      const name = periodsPerYear === 12 ? `${yearNum}-${pad2(startMonth)}` : `${yearNum} فترة ${i + 1}`;
      insert.run(periodId, companyId, name, startDate, endDate, 'open');
      periods.push({ period_id: periodId, company_id: companyId, name, start_date: startDate, end_date: endDate, status: 'open' });
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }
  return { year: yearNum, created: periods.length, periods };
}

/** Companies a user may access, most-recently-granted first. */
function listUserCompanies(db, userId) {
  return db.prepare(`
    SELECT c.company_id, c.name, c.currency, c.locale, uc.is_default
    FROM x_user_companies uc
    JOIN companies c ON c.company_id = uc.company_id
    WHERE uc.user_id = ?
    ORDER BY uc.is_default DESC, c.name
  `).all(userId);
}

/** Grant (or update) a user's access to a company. Admin-gated at the route layer. */
function grantUserCompanyAccess(db, userId, companyId, isDefault) {
  if (!getCompany(db, companyId)) throw Object.assign(new Error('الشركة غير موجودة'), { statusCode: 404 });
  db.exec('BEGIN IMMEDIATE');
  try {
    if (isDefault) {
      db.prepare('UPDATE x_user_companies SET is_default = 0 WHERE user_id = ?').run(userId);
    }
    db.prepare(`
      INSERT INTO x_user_companies (user_id, company_id, is_default, granted_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, company_id) DO UPDATE SET is_default = excluded.is_default
    `).run(userId, companyId, isDefault ? 1 : 0, new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }
  return listUserCompanies(db, userId);
}

function userHasCompanyAccess(db, userId, companyId, isAdmin) {
  if (isAdmin) return true;
  const row = db.prepare('SELECT 1 FROM x_user_companies WHERE user_id = ? AND company_id = ?').get(userId, companyId);
  return !!row;
}

/**
 * Set the caller's active company (the company-switcher's core action).
 * This is the SQL-native equivalent of the legacy
 * getActiveTenantProfile()/stampServerTenantRecord() JSON-blob mechanism —
 * intentionally a separate table (`x_active_company`), not a shared one;
 * see TASK.md.
 */
function setActiveCompany(db, userId, companyId, isAdmin) {
  if (!getCompany(db, companyId)) throw Object.assign(new Error('الشركة غير موجودة'), { statusCode: 404 });
  if (!userHasCompanyAccess(db, userId, companyId, isAdmin)) {
    throw Object.assign(new Error('لا تملك صلاحية الوصول إلى هذه الشركة'), { statusCode: 403 });
  }
  db.prepare(`
    INSERT INTO x_active_company (user_id, company_id, set_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET company_id = excluded.company_id, set_at = excluded.set_at
  `).run(userId, companyId, new Date().toISOString());
  return getActiveCompany(db, userId);
}

/** Read the caller's active company, falling back to their default/first accessible company. */
function getActiveCompany(db, userId) {
  const active = db.prepare(`
    SELECT c.company_id, c.name, c.currency, c.locale
    FROM x_active_company a JOIN companies c ON c.company_id = a.company_id
    WHERE a.user_id = ?
  `).get(userId);
  if (active) return active;
  const accessible = listUserCompanies(db, userId);
  return accessible[0] || null;
}

module.exports = {
  getCompany,
  listCompanies,
  listBranches,
  listDepartments,
  listWarehouses,
  getCurrencyRate,
  generateFiscalYear,
  listUserCompanies,
  grantUserCompanyAccess,
  userHasCompanyAccess,
  setActiveCompany,
  getActiveCompany,
};
