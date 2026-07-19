// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const arap = require('../../finance/arap-engine');
const infra = require('../r3-infra');

const { fail, ensureCompany, withImmediateTransaction, recordWrite, publish, tableExists } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function asDate(value) { return String(value || now()).slice(0, 10); }

// Date helpers
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) {
    d.setUTCDate(0); // Sets to last day of previous month
  }
  return d.toISOString().slice(0, 10);
}

function addYears(dateStr, years) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d.toISOString().slice(0, 10);
}

function diffDays(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1 + 'T00:00:00Z');
  const d2 = new Date(dateStr2 + 'T00:00:00Z');
  const diffTime = Math.abs(d2 - d1);
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function createPlan(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const row = {
    id: String(input.id || id('sub_plan')),
    company_id: companyId,
    name: String(input.name || '').trim(),
    interval: String(input.interval || 'monthly').trim(),
    amount: Number(input.amount || 0),
    currency: String(input.currency || 'IQD').trim(),
    trial_days: Number(input.trial_days || 0),
    product_id: input.product_id || null,
    active: input.active == null ? 1 : Number(Boolean(input.active)),
    created_at: now(),
    created_by: userId || null
  };
  if (!row.name) throw fail('plan name is required', 400, 'PLAN_NAME_REQUIRED');
  if (row.amount < 0) throw fail('plan amount must be non-negative', 400, 'PLAN_AMOUNT_INVALID');
  if (!['monthly', 'yearly'].includes(row.interval)) throw fail('interval must be monthly or yearly', 400, 'PLAN_INTERVAL_INVALID');
  
  db.prepare(`
    INSERT INTO subscription_plan (id, company_id, name, interval, amount, currency, trial_days, product_id, active, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.name, row.interval, row.amount, row.currency, row.trial_days, row.product_id, row.active, row.created_at, row.created_by);
  
  return row;
}

function getPlan(db, companyId, id) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM subscription_plan WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!row) throw fail('plan not found', 404, 'PLAN_NOT_FOUND');
  return row;
}

function listPlans(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM subscription_plan WHERE company_id = ?').all(companyId);
}

function createSubscription(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const planId = String(input.plan_id || '').trim();
  const partnerId = String(input.partner_id || '').trim();
  
  const plan = db.prepare('SELECT * FROM subscription_plan WHERE id = ? AND company_id = ? AND active = 1').get(planId, companyId);
  if (!plan) throw fail('plan is missing, inactive, or outside company scope', 403, 'PLAN_SCOPE_DENIED');
  
  const partner = db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ? AND active = 1').get(partnerId, companyId);
  if (!partner) throw fail('partner is missing or outside company scope', 403, 'PARTNER_SCOPE_DENIED');
  
  const startDate = asDate(input.start_date);
  let trialEndDate = null;
  let state = 'active';
  let nextBillDate = startDate;
  
  if (plan.trial_days > 0) {
    state = 'trial';
    const trialDays = plan.trial_days;
    const d = new Date(startDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + trialDays);
    trialEndDate = d.toISOString().slice(0, 10);
    nextBillDate = trialEndDate;
  }
  
  const amount = input.current_amount != null ? Number(input.current_amount) : plan.amount;
  if (amount < 0) throw fail('current_amount must be non-negative', 400, 'SUBSCRIPTION_AMOUNT_INVALID');
  
  const row = {
    id: String(input.id || id('sub')),
    company_id: companyId,
    partner_id: partner.id,
    plan_id: plan.id,
    state,
    current_amount: amount,
    start_date: startDate,
    trial_end_date: trialEndDate,
    next_bill_date: nextBillDate,
    cancelled_at: null,
    created_at: now(),
    created_by: userId || null
  };
  
  db.prepare(`
    INSERT INTO subscription (id, company_id, partner_id, plan_id, state, current_amount, start_date, trial_end_date, next_bill_date, cancelled_at, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.partner_id, row.plan_id, row.state, row.current_amount, row.start_date, row.trial_end_date, row.next_bill_date, row.cancelled_at, row.created_at, row.created_by);
  
  recordWrite(db, null, companyId, 'subscription', row.id, 'create', userId, null, row);
  return row;
}

function getSubscription(db, companyId, id) {
  ensureCompany(db, companyId);
  const row = db.prepare('SELECT * FROM subscription WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!row) throw fail('subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  return row;
}

function listSubscriptions(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare('SELECT * FROM subscription WHERE company_id = ?').all(companyId);
}

function cancelSubscription(db, companyId, id, date, userId) {
  ensureCompany(db, companyId);
  const sub = db.prepare('SELECT * FROM subscription WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!sub) throw fail('subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  if (sub.state === 'cancelled') return sub;
  
  const cancelDate = asDate(date);
  const before = { ...sub };
  
  db.prepare("UPDATE subscription SET state = 'cancelled', cancelled_at = ? WHERE id = ?").run(cancelDate, id);
  const after = db.prepare('SELECT * FROM subscription WHERE id = ?').get(id);
  
  recordWrite(db, null, companyId, 'subscription', id, 'cancel', userId, before, after);
  return after;
}

function changeSubscription(db, companyId, subscriptionId, toPlanId, effectiveDate, userId) {
  ensureCompany(db, companyId);
  const sub = db.prepare('SELECT * FROM subscription WHERE id = ? AND company_id = ?').get(subscriptionId, companyId);
  if (!sub) throw fail('subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  if (sub.state === 'cancelled') throw fail('cancelled subscription cannot be modified', 409, 'SUBSCRIPTION_CANCELLED');
  if (sub.plan_id === toPlanId) throw fail('subscription plan is already the requested plan', 400, 'PLAN_UNCHANGED');
  
  const toPlan = db.prepare('SELECT * FROM subscription_plan WHERE id = ? AND company_id = ? AND active = 1').get(toPlanId, companyId);
  if (!toPlan) throw fail('new plan not found or inactive', 404, 'PLAN_NOT_FOUND');
  
  const fromPlan = db.prepare('SELECT * FROM subscription_plan WHERE id = ?').get(sub.plan_id);
  const changeDate = asDate(effectiveDate);
  const before = { ...sub };
  
  let prorationAmount = 0;
  if (sub.state !== 'trial') {
    const startOfCycle = fromPlan.interval === 'monthly' ? addMonths(sub.next_bill_date, -1) : addYears(sub.next_bill_date, -1);
    const totalDays = diffDays(startOfCycle, sub.next_bill_date);
    let remainingDays = diffDays(changeDate, sub.next_bill_date);
    if (remainingDays < 0) remainingDays = 0;
    if (remainingDays > totalDays) remainingDays = totalDays;
    
    const unusedOld = fromPlan.amount * (remainingDays / totalDays);
    const usedNew = toPlan.amount * (remainingDays / totalDays);
    prorationAmount = money(usedNew - unusedOld);
  }
  
  const changeId = id('sub_change');
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  
  try {
    db.prepare(`
      INSERT INTO subscription_change (id, company_id, subscription_id, change_type, from_plan_id, to_plan_id, proration_amount, effective_date, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(changeId, companyId, sub.id, prorationAmount > 0 ? 'upgrade' : 'downgrade', sub.plan_id, toPlan.id, prorationAmount, changeDate, now(), userId || 'system');
    
    if (prorationAmount !== 0) {
      const arapDoc = arap.createArapDocument(db, companyId, {
        document_kind: prorationAmount > 0 ? 'customer_invoice' : 'customer_credit_note',
        partner_id: sub.partner_id,
        doc_date: changeDate,
        lines: [{
          product_id: toPlan.product_id || null,
          quantity: 1,
          price_unit: Math.abs(prorationAmount),
          description: prorationAmount > 0
            ? `Prorated upgrade charge: ${fromPlan.name} to ${toPlan.name}`
            : `Prorated credit for downgrade: ${fromPlan.name} to ${toPlan.name}`
        }]
      }, userId || 'system');
      
      arap.postArapDocument(db, arapDoc.id, userId || 'system');
      
      db.prepare(`
        INSERT INTO subscription_invoice (id, company_id, subscription_id, period_key, arap_document_id, amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id('sub_inv'), companyId, sub.id, `prorate-${changeDate}-${id('rand').slice(5, 10)}`, arapDoc.id, prorationAmount, now());
    }
    
    db.prepare('UPDATE subscription SET plan_id = ?, current_amount = ? WHERE id = ?').run(toPlan.id, toPlan.amount, sub.id);
    
    const after = db.prepare('SELECT * FROM subscription WHERE id = ?').get(sub.id);
    recordWrite(db, null, companyId, 'subscription', sub.id, 'update', userId, before, after);
    
    if (owns) db.exec('COMMIT');
    return after;
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function runBilling(db, companyId, asOfDate, userId) {
  ensureCompany(db, companyId);
  const targetDate = asDate(asOfDate);
  
  const due = db.prepare(`
    SELECT * FROM subscription 
    WHERE company_id = ? AND next_bill_date <= ? AND state IN ('active', 'trial')
  `).all(companyId, targetDate);
  
  const billed = [];
  const failed = [];
  
  for (const sub of due) {
    const owns = !db.isTransaction;
    if (owns) db.exec('BEGIN IMMEDIATE');
    try {
      const plan = db.prepare('SELECT * FROM subscription_plan WHERE id = ?').get(sub.plan_id);
      
      let state = sub.state;
      if (state === 'trial' && sub.trial_end_date && sub.trial_end_date <= targetDate) {
        state = 'active';
      }
      
      const periodKey = sub.next_bill_date;
      
      const existingInvoice = db.prepare(`
        SELECT 1 FROM subscription_invoice 
        WHERE subscription_id = ? AND period_key = ?
      `).get(sub.id, periodKey);
      
      if (existingInvoice) {
        if (owns) db.exec('COMMIT');
        continue;
      }
      
      let arapDocId = null;
      if (sub.current_amount > 0) {
        const arapDoc = arap.createArapDocument(db, companyId, {
          document_kind: 'customer_invoice',
          partner_id: sub.partner_id,
          doc_date: sub.next_bill_date,
          lines: [{
            product_id: plan.product_id || null,
            quantity: 1,
            price_unit: sub.current_amount,
            description: `Recurring billing for ${plan.name} (period ${periodKey})`
          }]
        }, userId || 'system');
        
        arap.postArapDocument(db, arapDoc.id, userId || 'system');
        arapDocId = arapDoc.id;
        
        db.prepare(`
          INSERT INTO subscription_invoice (id, company_id, subscription_id, period_key, arap_document_id, amount, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id('sub_inv'), companyId, sub.id, periodKey, arapDoc.id, sub.current_amount, now());
      }
      
      const nextBillDate = plan.interval === 'monthly' ? addMonths(sub.next_bill_date, 1) : addYears(sub.next_bill_date, 1);
      const before = { ...sub };
      
      db.prepare(`
        UPDATE subscription 
        SET state = ?, next_bill_date = ? 
        WHERE id = ?
      `).run(state, nextBillDate, sub.id);
      
      const after = db.prepare('SELECT * FROM subscription WHERE id = ?').get(sub.id);
      recordWrite(db, null, companyId, 'subscription', sub.id, 'bill', userId, before, after);
      
      if (owns) db.exec('COMMIT');
      billed.push({ subscription_id: sub.id, arap_document_id: arapDocId, amount: sub.current_amount, period_key: periodKey });
    } catch (err) {
      if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
      failed.push({ subscription_id: sub.id, error: err.message });
    }
  }
  
  return { billed, failed };
}

function runDunning(db, companyId, asOfDate, options = {}, userId) {
  ensureCompany(db, companyId);
  const targetDate = asDate(asOfDate);
  const interestRate = Number(options.interestRate || 0);
  const chargeInterest = Boolean(options.chargeInterest && interestRate > 0);
  
  const invoices = db.prepare(`
    SELECT a.id, a.fiscal_doc_id, a.due_date, a.total_amount, a.partner_id, f.doc_number
    FROM arap_document a
    JOIN fiscal_doc f ON f.id = a.fiscal_doc_id
    WHERE a.company_id = ? AND a.document_kind = 'customer_invoice' AND f.state = 'posted'
  `).all(companyId);
  
  const actions = [];
  const errors = [];
  
  for (const inv of invoices) {
    if (inv.due_date >= targetDate) continue;
    
    const info = arap.documentOpenAmount(db, inv.id);
    if (info.payment_state === 'paid' || info.payment_state === 'overpaid') continue;
    
    const daysOverdue = diffDays(inv.due_date, targetDate);
    if (daysOverdue < 5) continue;
    
    let rung = 0;
    let rungName = '';
    
    if (daysOverdue >= 45) {
      rung = 4; rungName = 'Cancellation and Termination';
    } else if (daysOverdue >= 30) {
      rung = 3; rungName = 'Suspension Warning';
    } else if (daysOverdue >= 15) {
      rung = 2; rungName = 'Second Warning';
    } else {
      rung = 1; rungName = 'Friendly Reminder';
    }
    
    const maxRow = db.prepare('SELECT COALESCE(MAX(rung),0) r FROM dunning_action WHERE arap_document_id = ?').get(inv.id);
    const maxRung = maxRow.r;
    
    if (rung > maxRung) {
      const subInv = db.prepare('SELECT subscription_id FROM subscription_invoice WHERE arap_document_id = ?').get(inv.id);
      const subId = subInv ? subInv.subscription_id : null;
      
      const owns = !db.isTransaction;
      if (owns) db.exec('BEGIN IMMEDIATE');
      try {
        for (let r = maxRung + 1; r <= rung; r++) {
          let currentRungName = '';
          if (r === 1) currentRungName = 'Friendly Reminder';
          if (r === 2) currentRungName = 'Second Warning';
          if (r === 3) currentRungName = 'Suspension Warning';
          if (r === 4) currentRungName = 'Cancellation and Termination';
          
          const dunningId = id('dunning');
          db.prepare(`
            INSERT INTO dunning_action (id, company_id, subscription_id, arap_document_id, rung, rung_name, days_overdue, channel, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(dunningId, companyId, subId, inv.id, r, currentRungName, daysOverdue, 'worklist', now());
          
          let interestDocId = null;
          if (chargeInterest) {
            const interestAmount = money(info.open_amount * interestRate);
            if (interestAmount > 0) {
              const interestDoc = arap.createArapDocument(db, companyId, {
                document_kind: 'customer_invoice',
                partner_id: inv.partner_id,
                doc_date: targetDate,
                lines: [{
                  product_id: null,
                  quantity: 1,
                  price_unit: interestAmount,
                  description: `Interest charge on overdue invoice ${inv.doc_number} (Rung ${r})`
                }]
              }, userId || 'system');
              
              arap.postArapDocument(db, interestDoc.id, userId || 'system');
              interestDocId = interestDoc.id;
            }
          }
          
          if (subId) {
            const sub = db.prepare('SELECT * FROM subscription WHERE id = ?').get(subId);
            if (sub && sub.state !== 'cancelled') {
              const before = { ...sub };
              if (r === 3 && sub.state === 'active') {
                db.prepare("UPDATE subscription SET state = 'suspended' WHERE id = ?").run(subId);
                const after = db.prepare('SELECT * FROM subscription WHERE id = ?').get(subId);
                recordWrite(db, null, companyId, 'subscription', subId, 'suspend', userId, before, after);
              }
              if (r === 4) {
                db.prepare("UPDATE subscription SET state = 'cancelled', cancelled_at = ? WHERE id = ?").run(targetDate, subId);
                const after = db.prepare('SELECT * FROM subscription WHERE id = ?').get(subId);
                recordWrite(db, null, companyId, 'subscription', subId, 'cancel', userId, before, after);
              }
            }
          }
          
          actions.push({ arap_document_id: inv.id, rung: r, name: currentRungName, interest_arap_id: interestDocId });
        }
        if (owns) db.exec('COMMIT');
      } catch (err) {
        if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
        errors.push({ arap_document_id: inv.id, error: err.message });
      }
    }
  }
  
  return { actions, errors };
}

function getSubscriptionKPIs(db, companyId, asOfDate) {
  ensureCompany(db, companyId);
  const targetDate = asDate(asOfDate);
  
  const activeList = db.prepare(`
    SELECT s.current_amount, p.interval 
    FROM subscription s
    JOIN subscription_plan p ON p.id = s.plan_id
    WHERE s.company_id = ? AND s.state = 'active'
  `).all(companyId);
  
  let mrr = 0;
  for (const sub of activeList) {
    if (sub.interval === 'monthly') {
      mrr += sub.current_amount;
    } else {
      mrr += sub.current_amount / 12;
    }
  }
  mrr = money(mrr);
  
  const activeCount = activeList.length;
  
  const d = new Date(targetDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 30);
  const cutoffDate = d.toISOString().slice(0, 10);
  
  const churnedCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM subscription 
    WHERE company_id = ? AND state = 'cancelled' AND cancelled_at >= ? AND cancelled_at <= ?
  `).get(companyId, cutoffDate, targetDate).count;
  
  const startActiveCount = activeCount + churnedCount;
  const churnRate = startActiveCount > 0 ? money((churnedCount / startActiveCount) * 100) : 0;
  
  return {
    mrr,
    active_count: activeCount,
    churned_count: churnedCount,
    churn_rate_percent: churnRate,
    as_of_date: targetDate
  };
}

module.exports = {
  createPlan: infra.atomicCommand(createPlan),
  getPlan,
  listPlans,
  createSubscription: infra.atomicCommand(createSubscription),
  getSubscription,
  listSubscriptions,
  cancelSubscription: infra.atomicCommand(cancelSubscription),
  changeSubscription,
  runBilling,
  runDunning,
  getSubscriptionKPIs
};
