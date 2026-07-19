// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.2 (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany } = infra;

function uid(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

// ── State machine transitions ──

const ALLOWED_TRANSITIONS = {
  draft:          ['design', 'cancelled'],
  design:         ['proofing', 'cancelled'],
  proofing:       ['approved', 'design'],
  approved:       ['production', 'cancelled'],
  production:     ['quality_check', 'cancelled'],
  quality_check:  ['completed', 'production'],
  completed:      ['delivered'],
  delivered:      [],
  cancelled:      []
};

// ── Job creation ──

function createJob(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const jobNumber = input.job_number || `JOB-${Date.now().toString(36).toUpperCase()}`;
  const title = String(input.title || '').trim();
  if (!title) throw fail('job title is required', 400, 'TITLE_REQUIRED');

  const quantity = Number(input.quantity || 1);
  if (quantity <= 0) throw fail('quantity must be positive', 400, 'QTY_INVALID');

  const jobType = String(input.job_type || 'print').trim();
  if (!['print', 'signage', 'packaging', 'digital', 'custom'].includes(jobType)) {
    throw fail('invalid job type', 400, 'TYPE_INVALID');
  }

  const existing = db.prepare('SELECT 1 FROM shop_workshop_job WHERE company_id = ? AND job_number = ?').get(companyId, jobNumber);
  if (existing) throw fail(`job number '${jobNumber}' already exists`, 409, 'JOB_NUMBER_EXISTS');

  const row = {
    id: uid('wjob'),
    company_id: companyId,
    job_number: jobNumber,
    customer_id: input.customer_id || null,
    title,
    description: input.description || null,
    state: 'draft',
    job_type: jobType,
    quantity,
    unit_price: Number(input.unit_price || 0),
    total_price: Number(input.unit_price || 0) * quantity,
    material_cost: 0, labor_cost: 0, overhead_cost: 0, profit_margin: 0,
    assigned_to: input.assigned_to || null,
    priority: ['low', 'normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal',
    due_date: input.due_date || null,
    completed_at: null, delivered_at: null,
    sales_order_id: input.sales_order_id || null,
    idempotency_key: input.idempotency_key || null,
    created_at: now(),
    created_by: userId || 'system'
  };

  db.prepare(`
    INSERT INTO shop_workshop_job (id, company_id, job_number, customer_id, title, description, state, job_type, quantity, unit_price, total_price, material_cost, labor_cost, overhead_cost, profit_margin, assigned_to, priority, due_date, completed_at, delivered_at, sales_order_id, idempotency_key, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.company_id, row.job_number, row.customer_id, row.title, row.description,
    row.state, row.job_type, row.quantity, row.unit_price, row.total_price,
    row.material_cost, row.labor_cost, row.overhead_cost, row.profit_margin,
    row.assigned_to, row.priority, row.due_date, row.completed_at, row.delivered_at,
    row.sales_order_id, row.idempotency_key, row.created_at, row.created_by
  );
  return row;
}

// ── State transition ──

function transitionJob(db, companyId, jobId, targetState, userId) {
  ensureCompany(db, companyId);
  const job = db.prepare('SELECT * FROM shop_workshop_job WHERE id = ? AND company_id = ?').get(jobId, companyId);
  if (!job) throw fail('job not found', 404, 'JOB_NOT_FOUND');

  const allowed = ALLOWED_TRANSITIONS[job.state];
  if (!allowed || !allowed.includes(targetState)) {
    throw fail(`transition from '${job.state}' to '${targetState}' is not allowed`, 400, 'TRANSITION_INVALID');
  }

  const updates = { state: targetState };
  if (targetState === 'completed') updates.completed_at = now();
  if (targetState === 'delivered') updates.delivered_at = now();

  const setClauses = Object.entries(updates).map(([k, _]) => `${k} = ?`).join(', ');
  const values = Object.values(updates);

  db.prepare(`UPDATE shop_workshop_job SET ${setClauses} WHERE id = ?`).run(...values, jobId);
  return db.prepare('SELECT * FROM shop_workshop_job WHERE id = ?').get(jobId);
}

// ── Material management ──

function addMaterial(db, companyId, jobId, input) {
  ensureCompany(db, companyId);
  const job = db.prepare('SELECT * FROM shop_workshop_job WHERE id = ? AND company_id = ?').get(jobId, companyId);
  if (!job) throw fail('job not found', 404, 'JOB_NOT_FOUND');
  if (['completed', 'delivered', 'cancelled'].includes(job.state)) {
    throw fail('cannot add materials to a closed job', 400, 'JOB_CLOSED');
  }

  const name = String(input.name || '').trim();
  if (!name) throw fail('material name is required', 400, 'MATERIAL_NAME_REQUIRED');
  const qty = Number(input.quantity || 1);
  const unitCost = Number(input.unit_cost || 0);

  const row = {
    id: uid('wmat'),
    company_id: companyId,
    job_id: jobId,
    product_id: input.product_id || null,
    name,
    quantity: qty,
    unit_cost: unitCost,
    total_cost: Number((qty * unitCost).toFixed(4)),
    issued: 0, issued_at: null,
    created_at: now()
  };

  db.prepare(`INSERT INTO shop_workshop_job_material (id, company_id, job_id, product_id, name, quantity, unit_cost, total_cost, issued, issued_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.id, row.company_id, row.job_id, row.product_id, row.name,
    row.quantity, row.unit_cost, row.total_cost, row.issued, row.issued_at, row.created_at
  );

  // Recalculate job material cost
  const totalMat = db.prepare('SELECT COALESCE(SUM(total_cost), 0) as total FROM shop_workshop_job_material WHERE job_id = ? AND company_id = ?').get(jobId, companyId);
  db.prepare('UPDATE shop_workshop_job SET material_cost = ? WHERE id = ?').run(totalMat.total, jobId);

  return row;
}

function issueMaterial(db, companyId, materialId) {
  ensureCompany(db, companyId);
  const mat = db.prepare('SELECT * FROM shop_workshop_job_material WHERE id = ? AND company_id = ?').get(materialId, companyId);
  if (!mat) throw fail('material not found', 404, 'MATERIAL_NOT_FOUND');
  if (mat.issued) throw fail('material already issued', 409, 'MATERIAL_ISSUED');

  db.prepare('UPDATE shop_workshop_job_material SET issued = 1, issued_at = ? WHERE id = ?').run(now(), materialId);
  return db.prepare('SELECT * FROM shop_workshop_job_material WHERE id = ?').get(materialId);
}

// ── Design proofing ──

function submitProof(db, companyId, jobId, input, userId) {
  ensureCompany(db, companyId);
  const job = db.prepare('SELECT * FROM shop_workshop_job WHERE id = ? AND company_id = ?').get(jobId, companyId);
  if (!job) throw fail('job not found', 404, 'JOB_NOT_FOUND');
  if (job.state !== 'design' && job.state !== 'proofing') {
    throw fail('proofs can only be submitted in design or proofing state', 400, 'STATE_INVALID');
  }

  const maxVersion = db.prepare('SELECT COALESCE(MAX(version), 0) as mv FROM shop_workshop_design_proof WHERE job_id = ? AND company_id = ?').get(jobId, companyId);
  const version = maxVersion.mv + 1;

  const row = {
    id: uid('proof'),
    company_id: companyId,
    job_id: jobId,
    version,
    file_name: input.file_name || null,
    file_hash: input.file_hash || null,
    status: 'pending',
    reviewer_id: null, reviewed_at: null,
    notes: input.notes || null,
    created_at: now(),
    created_by: userId || 'system'
  };

  db.prepare(`INSERT INTO shop_workshop_design_proof (id, company_id, job_id, version, file_name, file_hash, status, reviewer_id, reviewed_at, notes, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.id, row.company_id, row.job_id, row.version, row.file_name, row.file_hash,
    row.status, row.reviewer_id, row.reviewed_at, row.notes, row.created_at, row.created_by
  );
  return row;
}

function reviewProof(db, companyId, proofId, decision, reviewerId) {
  ensureCompany(db, companyId);
  const proof = db.prepare('SELECT * FROM shop_workshop_design_proof WHERE id = ? AND company_id = ?').get(proofId, companyId);
  if (!proof) throw fail('proof not found', 404, 'PROOF_NOT_FOUND');
  if (proof.status !== 'pending') throw fail('proof already reviewed', 409, 'PROOF_REVIEWED');

  if (!['approved', 'rejected', 'revision_requested'].includes(decision)) {
    throw fail('invalid review decision', 400, 'DECISION_INVALID');
  }

  db.prepare('UPDATE shop_workshop_design_proof SET status = ?, reviewer_id = ?, reviewed_at = ? WHERE id = ?')
    .run(decision, reviewerId || 'reviewer', now(), proofId);
  return db.prepare('SELECT * FROM shop_workshop_design_proof WHERE id = ?').get(proofId);
}

// ── Pricing template ──

function createPricingTemplate(db, companyId, input) {
  ensureCompany(db, companyId);
  const name = String(input.name || '').trim();
  if (!name) throw fail('template name is required', 400, 'NAME_REQUIRED');
  const jobType = String(input.job_type || 'print').trim();

  const existing = db.prepare('SELECT 1 FROM shop_workshop_pricing_template WHERE company_id = ? AND name = ?').get(companyId, name);
  if (existing) throw fail('pricing template name already exists', 409, 'TEMPLATE_EXISTS');

  const row = {
    id: uid('wpt'),
    company_id: companyId,
    name,
    job_type: jobType,
    base_price: Number(input.base_price || 0),
    price_per_unit: Number(input.price_per_unit || 0),
    material_markup: Number(input.material_markup || 0),
    labor_rate: Number(input.labor_rate || 0),
    overhead_rate: Number(input.overhead_rate || 0),
    min_quantity: Number(input.min_quantity || 1),
    active: 1,
    created_at: now()
  };

  db.prepare(`INSERT INTO shop_workshop_pricing_template (id, company_id, name, job_type, base_price, price_per_unit, material_markup, labor_rate, overhead_rate, min_quantity, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.id, row.company_id, row.name, row.job_type, row.base_price, row.price_per_unit,
    row.material_markup, row.labor_rate, row.overhead_rate, row.min_quantity, row.active, row.created_at
  );
  return row;
}

function calculateJobCost(db, companyId, jobId, templateId) {
  ensureCompany(db, companyId);
  const job = db.prepare('SELECT * FROM shop_workshop_job WHERE id = ? AND company_id = ?').get(jobId, companyId);
  if (!job) throw fail('job not found', 404, 'JOB_NOT_FOUND');

  const template = db.prepare('SELECT * FROM shop_workshop_pricing_template WHERE id = ? AND company_id = ?').get(templateId, companyId);
  if (!template) throw fail('pricing template not found', 404, 'TEMPLATE_NOT_FOUND');

  const materialCost = job.material_cost || 0;
  const materialWithMarkup = Number((materialCost * (1 + template.material_markup)).toFixed(4));
  const laborCost = Number((template.labor_rate * job.quantity).toFixed(4));
  const overheadCost = Number((template.overhead_rate * job.quantity).toFixed(4));
  const unitPrice = Number((template.base_price + template.price_per_unit * job.quantity).toFixed(4));
  const totalCost = Number((materialWithMarkup + laborCost + overheadCost).toFixed(4));
  const profitMargin = totalCost > 0 ? Number(((unitPrice - totalCost) / totalCost * 100).toFixed(2)) : 0;

  db.prepare(`UPDATE shop_workshop_job SET
    unit_price = ?, total_price = ?,
    labor_cost = ?, overhead_cost = ?,
    profit_margin = ?
    WHERE id = ?`).run(unitPrice, unitPrice, laborCost, overheadCost, profitMargin, jobId);

  return {
    job_id: jobId,
    material_cost: materialCost,
    material_with_markup: materialWithMarkup,
    labor_cost: laborCost,
    overhead_cost: overheadCost,
    unit_price: unitPrice,
    total_cost: totalCost,
    profit_margin: profitMargin
  };
}

// ── Queries ──

function listJobs(db, companyId, filters = {}) {
  ensureCompany(db, companyId);
  let sql = 'SELECT * FROM shop_workshop_job WHERE company_id = ?';
  const params = [companyId];
  if (filters.state) { sql += ' AND state = ?'; params.push(filters.state); }
  if (filters.job_type) { sql += ' AND job_type = ?'; params.push(filters.job_type); }
  if (filters.assigned_to) { sql += ' AND assigned_to = ?'; params.push(filters.assigned_to); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
}

function getJob(db, companyId, jobId) {
  ensureCompany(db, companyId);
  const job = db.prepare('SELECT * FROM shop_workshop_job WHERE id = ? AND company_id = ?').get(jobId, companyId);
  if (!job) throw fail('job not found', 404, 'JOB_NOT_FOUND');

  const materials = db.prepare('SELECT * FROM shop_workshop_job_material WHERE job_id = ? AND company_id = ? ORDER BY created_at').all(jobId, companyId);
  const proofs = db.prepare('SELECT * FROM shop_workshop_design_proof WHERE job_id = ? AND company_id = ? ORDER BY version DESC').all(jobId, companyId);

  return { ...job, materials, proofs };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  createJob: infra.atomicCommand(createJob),
  transitionJob: infra.atomicCommand(transitionJob),
  addMaterial: infra.atomicCommand(addMaterial),
  issueMaterial: infra.atomicCommand(issueMaterial),
  submitProof: infra.atomicCommand(submitProof),
  reviewProof: infra.atomicCommand(reviewProof),
  createPricingTemplate: infra.atomicCommand(createPricingTemplate),
  calculateJobCost: infra.atomicCommand(calculateJobCost),
  listJobs,
  getJob
};
