// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R5.4 print-template versioning + public forms. Prints store an immutable
// render snapshot (later template edits never mutate archived prints). Public
// forms accept unauthenticated token submissions into a rate-limited quarantine
// inbox; a user promotes a submission into a real record with audit.
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');
const { fail, recordWrite } = infra;

function id(p) { return `${p}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

// ---- print templates ----
function createTemplate(db, companyId, input, userId) {
  infra.ensureCompany(db, companyId);
  const name = String(input.name || '').trim();
  const entity = String(input.entity || '').trim();
  if (!name || !entity) throw fail('template name and entity are required', 400, 'PRINT_ARGS');
  const prior = db.prepare('SELECT MAX(version) v FROM print_template WHERE company_id=? AND entity=? AND name=?').get(companyId, entity, name).v || 0;
  const version = prior + 1;
  const templateId = id('tmpl');
  db.prepare('INSERT INTO print_template(id,company_id,entity,name,version,body,active,created_at) VALUES(?,?,?,?,?,?,1,?)')
    .run(templateId, companyId, entity, name, version, String(input.body || ''), now());
  // Only the newest version stays active.
  db.prepare('UPDATE print_template SET active=0 WHERE company_id=? AND entity=? AND name=? AND id<>?').run(companyId, entity, name, templateId);
  return { id: templateId, entity, name, version };
}

function activeTemplate(db, companyId, entity, name) {
  return db.prepare('SELECT * FROM print_template WHERE company_id=? AND entity=? AND name=? AND active=1 ORDER BY version DESC LIMIT 1').get(companyId, entity, name);
}

// Render a record against the active template and STORE the snapshot immutably.
function renderPrint(db, companyId, entity, name, record) {
  infra.ensureCompany(db, companyId);
  const template = activeTemplate(db, companyId, entity, name);
  if (!template) throw fail('no active template for this document', 404, 'PRINT_TEMPLATE_MISSING');
  const rendered = String(template.body).replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const value = key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), record);
    return value == null ? '' : String(value);
  });
  const renderId = id('render');
  db.prepare('INSERT INTO print_render(id,company_id,template_id,template_version,record_id,rendered_snapshot,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(renderId, companyId, template.id, template.version, String(record.id || ''), rendered, now());
  return { id: renderId, template_version: template.version, rendered };
}

function getRender(db, companyId, renderId) {
  const row = db.prepare('SELECT * FROM print_render WHERE id=? AND company_id=?').get(renderId, companyId);
  if (!row) throw fail('print render not found', 404, 'PRINT_RENDER_MISSING');
  return row;
}

// ---- public forms ----
function createForm(db, companyId, input, userId) {
  infra.ensureCompany(db, companyId);
  const token = input.token || crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO public_form(token,company_id,target_entity,name,rate_limit_per_hour,active,created_at) VALUES(?,?,?,?,?,1,?)')
    .run(token, companyId, String(input.target_entity || 'crm_lead'), String(input.name || 'Public form'), Number(input.rate_limit_per_hour || 20), now());
  return { token, target_entity: String(input.target_entity || 'crm_lead') };
}

// Unauthenticated submission. Rate-limited per form per source; lands in
// quarantine. Never creates a business record directly.
function submitPublic(db, token, payload, meta = {}) {
  const form = db.prepare("SELECT * FROM public_form WHERE token=? AND active=1").get(String(token || ''));
  if (!form) throw fail('form not found', 404, 'FORM_NOT_FOUND'); // fail closed
  const sinceHour = new Date(Date.now() - 3600000).toISOString();
  const recent = db.prepare('SELECT COUNT(*) n FROM public_submission WHERE form_token=? AND created_at>=?').get(token, sinceHour).n;
  if (recent >= Number(form.rate_limit_per_hour)) throw fail('submission rate limit exceeded', 429, 'FORM_RATE_LIMIT');
  if (!payload || typeof payload !== 'object') throw fail('payload is required', 400, 'FORM_PAYLOAD');
  const submissionId = id('sub');
  db.prepare('INSERT INTO public_submission(id,form_token,company_id,payload_json,source_ip,state,promoted_record_id,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(submissionId, token, form.company_id, JSON.stringify(payload), String(meta.ip || 'unknown'), 'quarantined', null, now());
  return { id: submissionId, state: 'quarantined' };
}

function listQuarantine(db, companyId, token) {
  return db.prepare("SELECT id, payload_json, state, created_at FROM public_submission WHERE form_token=? AND company_id=? AND state='quarantined' ORDER BY created_at").all(token, companyId)
    .map((row) => ({ id: row.id, payload: JSON.parse(row.payload_json), state: row.state, created_at: row.created_at }));
}

// Promote a quarantined submission into a real registry record (x_records),
// authenticated + audited. Idempotent per submission.
function promoteSubmission(db, companyId, submissionId, userId, runtime) {
  infra.ensureCompany(db, companyId);
  const submission = db.prepare('SELECT * FROM public_submission WHERE id=? AND company_id=?').get(submissionId, companyId);
  if (!submission) throw fail('submission is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (submission.state !== 'quarantined') throw fail('submission is not in quarantine', 409, 'FORM_STATE_INVALID');
  const form = db.prepare('SELECT target_entity FROM public_form WHERE token=?').get(submission.form_token);
  const payload = JSON.parse(submission.payload_json);
  const recordId = id('promoted');
  db.prepare('INSERT INTO x_records(entity,id,data,created_at,updated_at,created_by,removed) VALUES(?,?,?,?,?,?,0)')
    .run(form.target_entity, recordId, JSON.stringify({ ...payload, company_id: companyId, source: 'public_form' }), now(), now(), userId || 'system');
  db.prepare("UPDATE public_submission SET state='promoted', promoted_record_id=? WHERE id=?").run(recordId, submissionId);
  recordWrite(db, runtime, companyId, form.target_entity, recordId, 'promoted_from_public_form', userId, null, { submission_id: submissionId });
  return { record_id: recordId, entity: form.target_entity, state: 'promoted' };
}

module.exports = {
  createTemplate: infra.atomicCommand(createTemplate),
  renderPrint: infra.atomicCommand(renderPrint),
  getRender,
  createForm: infra.atomicCommand(createForm),
  submitPublic: infra.atomicCommand(submitPublic),
  listQuarantine,
  promoteSubmission: infra.atomicCommand(promoteSubmission),
  _internal: { activeTemplate },
};
