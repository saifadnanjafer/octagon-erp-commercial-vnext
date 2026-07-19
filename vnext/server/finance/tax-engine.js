// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

const crypto = require('crypto');

/**
 * Compute taxes for a set of document lines, applying fiscal positions and repartition rules.
 */
function computeTaxes(db, companyId, { partnerId, fiscalPositionId, type, lines }) {
  // 1. Load fiscal position mappings if provided
  const taxMap = {};
  const accountMap = {};

  if (fiscalPositionId) {
    const taxRows = db.prepare(`
      SELECT tax_src_id, tax_dest_id FROM fiscal_position_tax_map WHERE fiscal_position_id = ?
    `).all(fiscalPositionId);
    for (const r of taxRows) {
      taxMap[r.tax_src_id] = r.tax_dest_id;
    }

    const acctRows = db.prepare(`
      SELECT account_src_id, account_dest_id FROM fiscal_position_account_map WHERE fiscal_position_id = ?
    `).all(fiscalPositionId);
    for (const r of acctRows) {
      accountMap[r.account_src_id] = r.account_dest_id;
    }
  }

  const computedLines = [];
  let totalBase = 0.0;
  let totalTax = 0.0;

  for (const line of lines) {
    const rawAccountId = line.account_id;
    const resolvedAccountId = accountMap[rawAccountId] || rawAccountId;

    let taxId = line.tax_id;
    if (fiscalPositionId && taxId !== undefined) {
      if (taxId in taxMap) {
        taxId = taxMap[taxId]; // can be null (exempt)
      }
    }

    const priceUnit = Number(line.price_unit) || 0.0;
    const quantity = Number(line.quantity) || 0.0;
    const grossAmount = priceUnit * quantity;

    if (!taxId) {
      // No tax applied (or exempt via fiscal position)
      totalBase += grossAmount;
      computedLines.push({
        account_id: resolvedAccountId,
        base_amount: grossAmount,
        tax_amount: 0.0,
        factor_percent: 100.0,
        repartition_type: 'base',
        tag_ids: null,
        sign: 1,
        description: line.description || ''
      });
      continue;
    }

    // Load tax definition
    const tax = db.prepare(`
      SELECT amount_type, amount, price_include FROM tax WHERE id = ? AND company_id = ? AND active = 1
    `).get(taxId, companyId);

    if (!tax) {
      throw new Error(`الضريبة المحددة غير موجودة أو غير نشطة: ${taxId}`);
    }

    // Load repartition lines
    const repartitions = db.prepare(`
      SELECT repartition_type, factor_percent, account_id, tag_ids, sign 
      FROM tax_repartition_line 
      WHERE tax_id = ?
    `).all(taxId);

    let baseAmount = grossAmount;
    let taxAmount = 0.0;

    if (tax.price_include === 1) {
      if (tax.amount_type === 'percent') {
        baseAmount = grossAmount / (1 + (tax.amount / 100.0));
        taxAmount = grossAmount - baseAmount;
      } else if (tax.amount_type === 'fixed') {
        taxAmount = tax.amount * quantity;
        baseAmount = grossAmount - taxAmount;
      }
    } else {
      if (tax.amount_type === 'percent') {
        taxAmount = grossAmount * (tax.amount / 100.0);
      } else if (tax.amount_type === 'fixed') {
        taxAmount = tax.amount * quantity;
      }
    }

    totalBase += baseAmount;
    totalTax += taxAmount;

    if (repartitions.length === 0) {
      // Fallback if no repartition rules are configured
      computedLines.push({
        account_id: resolvedAccountId,
        base_amount: baseAmount,
        tax_amount: 0.0,
        factor_percent: 100.0,
        repartition_type: 'base',
        tag_ids: null,
        sign: 1,
        description: line.description || ''
      });
    } else {
      for (const rep of repartitions) {
        const factor = Number(rep.factor_percent) || 100.0;
        const repAccount = rep.account_id || resolvedAccountId;
        
        let amount = 0.0;
        if (rep.repartition_type === 'base') {
          amount = baseAmount * (factor / 100.0);
        } else if (rep.repartition_type === 'tax') {
          amount = taxAmount * (factor / 100.0);
        }

        let parsedTags = null;
        if (rep.tag_ids) {
          try {
            parsedTags = JSON.parse(rep.tag_ids);
          } catch (_) {
            parsedTags = [rep.tag_ids];
          }
        }

        computedLines.push({
          account_id: repAccount,
          base_amount: rep.repartition_type === 'base' ? amount : 0.0,
          tax_amount: rep.repartition_type === 'tax' ? amount : 0.0,
          factor_percent: factor,
          repartition_type: rep.repartition_type,
          tag_ids: parsedTags,
          sign: rep.sign,
          description: line.description || ''
        });
      }
    }
  }

  return {
    total_base: totalBase,
    total_tax: totalTax,
    total_amount: totalBase + totalTax,
    lines: computedLines
  };
}

/**
 * Check and apply withholding tax limits/cumulative logic.
 */
function checkAndApplyWithholding(db, companyId, { partnerId, amount, docDate, docId, userId }) {
  const categories = db.prepare(`
    SELECT id, name, rate, threshold, cumulative_threshold, cumulative_window 
    FROM withholding_category 
    WHERE company_id = ?
  `).all(companyId);

  for (const cat of categories) {
    let triggered = false;

    // 1. Check single transaction threshold
    if (cat.threshold > 0 && amount >= cat.threshold) {
      triggered = true;
    }

    // 2. Check cumulative threshold if not already triggered by single transaction
    if (!triggered && cat.cumulative_threshold > 0 && cat.cumulative_window !== 'none') {
      let startDate, endDate;
      const dateObj = new Date(docDate);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');

      if (cat.cumulative_window === 'monthly') {
        startDate = `${year}-${month}-01`;
        endDate = `${year}-${month}-31`; // SQL comparison covers standard ranges
      } else if (cat.cumulative_window === 'yearly') {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
      }

      const totalPrev = db.prepare(`
        SELECT COALESCE(SUM(base_amount), 0.0) as total 
        FROM withholding_certificate 
        WHERE company_id = ? AND partner_id = ? AND withholding_category_id = ? AND doc_date >= ? AND doc_date <= ?
      `).get(companyId, partnerId, cat.id, startDate, endDate);

      const cumTotal = (totalPrev ? totalPrev.total : 0.0) + amount;
      if (cumTotal >= cat.cumulative_threshold) {
        triggered = true;
      }
    }

    // Write certificate record (tax_amount is 0.0 if not triggered)
    const taxAmount = triggered ? (amount * (cat.rate / 100.0)) : 0.0;
    const certId = 'wht_' + crypto.randomUUID();

    db.prepare(`
      INSERT INTO withholding_certificate (id, company_id, partner_id, withholding_category_id, base_amount, tax_amount, doc_date, reference_doc_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(certId, companyId, partnerId, cat.id, amount, taxAmount, docDate, docId || null);

    if (triggered) {
      return {
        certificate_id: certId,
        category_id: cat.id,
        category_name: cat.name,
        rate: cat.rate,
        withhold_amount: taxAmount
      };
    }
  }

  return null;
}

/**
 * Generate tax report grid aggregation from posted GL lines.
 */
function getTaxReport(db, companyId, startDate, endDate) {
  // Fetch and flatten the JSON tax_tag_ids from gl_line using json_each
  const sql = `
    SELECT 
      tag.value as tag_id,
      SUM(g.debit) as total_debit,
      SUM(g.credit) as total_credit
    FROM gl_line g,
    json_each(g.tax_tag_ids) tag
    WHERE g.company_id = ? 
      AND g.posting_date >= ? 
      AND g.posting_date <= ?
    GROUP BY tag.value
    ORDER BY tag.value
  `;

  const rows = db.prepare(sql).all(companyId, startDate, endDate);
  return rows.map(r => ({
    tag_id: r.tag_id,
    total_debit: Number(r.total_debit) || 0.0,
    total_credit: Number(r.total_credit) || 0.0,
    balance: (Number(r.total_debit) || 0.0) - (Number(r.total_credit) || 0.0)
  }));
}

module.exports = {
  computeTaxes,
  checkAndApplyWithholding,
  getTaxReport
};
