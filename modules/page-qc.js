/**
 * OCTAGON OMNISYSTEM — modules/page-qc.js
 *
 * GO 16 Phase 4: QC page and helper functions extracted from app.js.
 */
function normalizeQcRecords() {
  if (!Array.isArray(omni.qcRecords) || omni.qcRecords.length <= 2 || omni.qcRecords.some(q => q.id === 'qc_1')) {
    omni.qcRecords = defaultQcRecords();
  }
  if (!omni.qcSettings || typeof omni.qcSettings !== 'object') omni.qcSettings = getDefaultQcSettings();
  omni.qcSettings = { ...getDefaultQcSettings(), ...omni.qcSettings };
  (omni.qcRecords || []).forEach(qc => {
    if (!qc.id) qc.id = makeId('qc');
    qc.title = qc.title || qc.type || 'فحص جودة';
    qc.type = qc.type || qc.title || 'فحص جودة';
    qc.result = ['pending', 'pass', 'fail'].includes(qc.result) ? qc.result : (['pass', 'fail'].includes(qc.status) ? qc.status : 'pending');
    qc.status = ['pending', 'pass', 'fail', 'rework_required', 'reworked', 'closed'].includes(qc.status) ? qc.status : qc.result;
    if (qc.result === 'fail' && !qc.reworkCardId && qc.status === 'fail') qc.status = 'rework_required';
    qc.sourceType = qc.sourceType || (qc.cardId || qc.taskRef ? 'kanban_card' : 'manual');
    qc.sourceId = qc.sourceId || qc.cardId || qc.taskRef || '';
    qc.cardId = qc.cardId || qc.taskRef || '';
    qc.taskRef = qc.taskRef || qc.cardId || '';
    qc.workflowNodeId = qc.workflowNodeId || '';
    qc.operationPackId = qc.operationPackId || '';
    qc.operationPackStepId = qc.operationPackStepId || '';
    qc.sopId = qc.sopId || '';
    qc.machineId = qc.machineId || '';
    if (!Array.isArray(qc.materialIds)) qc.materialIds = [];
    qc.orderId = qc.orderId || '';
    qc.department = qc.department || '';
    qc.inspector = qc.inspector || qc.assignee || 'قسم الجودة';
    qc.inspectedAt = qc.inspectedAt || qc.date || '';
    qc.createdAt = qc.createdAt || qc.date || new Date().toISOString();
    qc.updatedAt = qc.updatedAt || qc.createdAt;
    if (!Array.isArray(qc.checklist)) qc.checklist = [];
    qc.checklist = qc.checklist.map(item => typeof item === 'string'
      ? { id: makeId('qci'), text: item, required: true, passed: false, note: '' }
      : { id: item.id || makeId('qci'), text: item.text || item.title || 'بند فحص', required: item.required !== false, passed: Boolean(item.passed || item.done), note: item.note || '' });
    if (!Array.isArray(qc.criteria)) qc.criteria = [];
    qc.failureReason = qc.failureReason || qc.reason || '';
    qc.reason = qc.failureReason;
    qc.severity = ['low', 'medium', 'high', 'critical'].includes(qc.severity) ? qc.severity : (qc.result === 'fail' ? 'high' : 'medium');
    qc.reworkCardId = qc.reworkCardId || '';
    qc.reworkTaskId = qc.reworkTaskId || '';
    qc.reworkStatus = qc.reworkStatus || (qc.reworkCardId || qc.reworkTaskId ? 'created' : 'none');
    qc.costImpact = Number(qc.costImpact ?? qc.reworkCost ?? 0) || 0;
    qc.reworkCost = qc.costImpact;
    qc.laborCost = Number(qc.laborCost) || 0;
    qc.materialCost = Number(qc.materialCost) || 0;
    qc.machineCost = Number(qc.machineCost) || 0;
    qc.estimatedReworkMinutes = Number(qc.estimatedReworkMinutes) || 0;
    qc.batchNumber = qc.batchNumber || '';
    qc.batchSize = Number(qc.batchSize) || 0;
    qc.sampleSize = Number(qc.sampleSize) || 0;
    qc.defectCount = Number(qc.defectCount) || 0;
    if (!Array.isArray(qc.photos)) qc.photos = [];
    if (!Array.isArray(qc.attachments)) qc.attachments = [];
    qc.notes = qc.notes || '';
    if (!Array.isArray(qc.activityLog)) qc.activityLog = [];
  });
  if (!omni.migrationsApplied.includes('qc_center_v2')) omni.migrationsApplied.push('qc_center_v2');
  if (!omni.migrationsApplied.includes('qc_cost_batch_v1')) omni.migrationsApplied.push('qc_cost_batch_v1');
}

function normalizeQcTemplates() {
  if (!Array.isArray(omni.qcTemplates)) omni.qcTemplates = [];
  if (!omni.qcTemplates.length) omni.qcTemplates = defaultQcTemplates();
  (omni.qcTemplates || []).forEach(t => {
    if (!t.id) t.id = makeId('qct');
    t.title = t.title || 'قالب فحص جودة';
    t.type = t.type || 'general';
    t.department = t.department || '';
    t.sopId = t.sopId || '';
    t.machineType = t.machineType || '';
    if (!Array.isArray(t.requiredForTypes)) t.requiredForTypes = [];
    if (!Array.isArray(t.checklist)) t.checklist = [];
    t.checklist = t.checklist.map(item => typeof item === 'string'
      ? { id: makeId('qci'), text: item, required: true, expectedValue: '', tolerance: '', unit: '' }
      : { id: item.id || makeId('qci'), text: item.text || item.title || 'بند فحص', required: item.required !== false, expectedValue: item.expectedValue || '', tolerance: item.tolerance || '', unit: item.unit || '' });
    t.severityOnFail = t.severityOnFail || 'high';
    t.createdAt = t.createdAt || new Date().toISOString();
    t.updatedAt = t.updatedAt || t.createdAt;
  });
}

function getQcTemplates() { ensureOmni(); return omni.qcTemplates || []; }
function createQcTemplate(payload) {
  ensureOmni();
  const now = new Date().toISOString();
  const template = { id: makeId('qct'), title: payload.title || 'قالب فحص جودة', type: payload.type || 'general', department: payload.department || '', sopId: payload.sopId || '', machineType: payload.machineType || '', requiredForTypes: payload.requiredForTypes || [], checklist: payload.checklist || [], severityOnFail: payload.severityOnFail || 'high', createdAt: now, updatedAt: now };
  omni.qcTemplates.push(template);
  normalizeQcTemplates();
  saveData();
  renderQcCenter();
  return template;
}
function updateQcTemplate(templateId, patch) {
  const t = getQcTemplates().find(x => x.id === templateId);
  if (!t) return;
  Object.assign(t, patch || {}, { updatedAt: new Date().toISOString() });
  normalizeQcTemplates();
  saveData();
  renderQcCenter();
}
async function deleteQcTemplate(templateId) {
  const ok = await showOmniModal('حذف قالب فحص', '<p>سيتم حذف القالب فقط ولن يتم حذف سجلات الجودة السابقة. هل تريد المتابعة؟</p>', () => true);
  if (!ok) return;
  omni.qcTemplates = (omni.qcTemplates || []).filter(t => t.id !== templateId);
  saveData();
  renderQcCenter();
}
function applyQcTemplateToRecord(recordId, templateId) {
  const qc = getQcRecordById(recordId);
  const template = getQcTemplates().find(t => t.id === templateId);
  if (!qc || !template) return;
  qc.qcTemplateId = template.id;
  qc.checklist = (template.checklist || []).map(item => ({ id: makeId('qci'), text: item.text, required: item.required !== false, passed: false, note: '' }));
  qc.severity = qc.severity || template.severityOnFail || 'high';
  addQcActivity(recordId, `تم تطبيق قالب الفحص: ${template.title}`);
  qc.updatedAt = new Date().toISOString();
  saveData();
  openQcInspector(recordId, 1);
}

function isQcRequiredForCard(card) {
  ensureOmni();
  const settings = omni.qcSettings || getDefaultQcSettings();
  if (!card) return false;
  if (card.requiresQc || card.qcTemplateId) return true;
  if (settings.requireQcForOperationCards && (card.operationPackId || card.operationPackStepId || card.sourceType === 'operation_pack')) return true;
  if (settings.requireQcForMachineCards && (card.machineIds || []).length) return true;
  if ((card.materialRequirements || []).length) return true;
  if (settings.requireQcForHighPriority && ['high', 'urgent'].includes(String(card.priority || '').toLowerCase())) return true;
  return (card.sopIds || []).some(id => getSopQcCriteria(id).length > 0);
}
function isQcRequiredForWorkflowNode(node) { return !!(node && (node.type === 'qc' || node.qcRequired || node.linkedQcTemplateId || getSopQcCriteria(node.linkedSopId).length)); }
function isQcRequiredForOperationPackStep(step) { return !!(step && (step.requiresQc || step.qcTemplateId || (step.qcCriteria || []).length || step.type === 'qc')); }
function getQcRequirementReason(sourceType, source) {
  if (!source) return 'بوابة جودة مطلوبة';
  if (sourceType === 'kanban_card') {
    if (source.requiresQc || source.qcTemplateId) return 'البطاقة عليها QC إلزامي';
    if (source.operationPackId || source.operationPackStepId) return 'البطاقة ناتجة من باقة عمليات';
    if ((source.machineIds || []).length) return 'البطاقة مرتبطة بماكينة';
    if ((source.materialRequirements || []).length) return 'البطاقة تستخدم مواد إنتاج';
    if (['high', 'urgent'].includes(String(source.priority || '').toLowerCase())) return 'الأولوية عالية أو عاجلة';
    if ((source.sopIds || []).some(id => getSopQcCriteria(id).length)) return 'SOP مرتبط يحتوي معايير جودة';
  }
  if (sourceType === 'workflow_node') return 'عقدة Workflow تتطلب فحص جودة';
  if (sourceType === 'op_pack_step') return 'خطوة باقة العمليات تتطلب QC';
  return 'بوابة جودة مطلوبة';
}
function getQcRecordsForCard(cardId) {
  ensureOmni();
  const ids = new Set(((omni.kanban.cards || []).find(c => c.id === cardId)?.qcRecordIds || []));
  return (omni.qcRecords || []).filter(q => q.cardId === cardId || q.taskRef === cardId || q.sourceId === cardId || ids.has(q.id));
}
function getCardQcStatus(card) {
  const recs = getQcRecordsForCard(card?.id);
  if (recs.some(q => q.status === 'closed')) return { key: 'closed', label: 'مغلق' };
  if (recs.some(q => q.reworkStatus === 'in_progress')) return { key: 'rework_in_progress', label: 'إعادة عمل قيد التنفيذ' };
  if (recs.some(q => q.reworkStatus === 'created' || q.status === 'rework_required')) return { key: 'rework_required', label: 'إعادة عمل مطلوبة' };
  if (recs.some(q => q.result === 'fail')) return { key: 'fail', label: 'فاشل' };
  if (recs.some(q => q.result === 'pass')) return { key: 'pass', label: 'ناجح' };
  if (recs.length) return { key: 'pending', label: 'قيد الفحص' };
  if (isQcRequiredForCard(card)) return { key: 'required', label: 'QC مطلوب' };
  return { key: 'none', label: 'لا يوجد QC' };
}
function canCardMoveToDone(card) {
  const status = getCardQcStatus(card);
  if ((omni.qcSettings || getDefaultQcSettings()).blockDeliveryOnFailedQc && ['fail', 'rework_required', 'rework_in_progress'].includes(status.key)) return false;
  return !isQcRequiredForCard(card) || ['pass', 'closed'].includes(status.key);
}

function getSopQcCriteria(sopId) {
  const sop = sopId ? getSopById(sopId) : null;
  return Array.isArray(sop?.qcCriteria) ? sop.qcCriteria : [];
}
function buildQcChecklistFromSop(sopId) {
  return getSopQcCriteria(sopId).map(item => ({ id: makeId('qci'), text: item.text || item.title || String(item), required: item.required !== false, passed: false, note: '' }));
}
function detectSopQualityProblems(sopId) {
  ensureOmni();
  const failures = (omni.qcRecords || []).filter(q => q.result === 'fail' && (!sopId || q.sopId === sopId));
  const counts = {};
  failures.forEach(q => { if (q.sopId) counts[q.sopId] = (counts[q.sopId] || 0) + 1; });
  return Object.entries(counts).filter(([, count]) => count >= 2).map(([id, count]) => ({ sop: getSopById(id), sopId: id, failCount: count, warning: 'هذا SOP مرتبط بعدة حالات فشل جودة. راجع الخطوات أو معايير القبول.' }));
}

function buildQcContextFromCard(card) {
  return {
    sourceType: 'kanban_card',
    sourceId: card.id,
    cardId: card.id,
    taskRef: card.id,
    sopId: (card.sopIds || [])[0] || '',
    machineId: (card.machineIds || [])[0] || '',
    materialIds: (card.materialRequirements || []).map(req => req.materialId).filter(Boolean),
    orderId: card.orderId || card.linkedOrderId || '',
    department: card.department || card.section || card.branch || '',
    operationPackId: card.operationPackId || '',
    operationPackStepId: card.operationPackStepId || ''
  };
}
function buildQcContextFromWorkflowNode(node) {
  return { sourceType: 'workflow_node', sourceId: node.id, workflowNodeId: node.id, sopId: node.linkedSopId || '', machineId: node.linkedMachineId || '', operationPackId: node.linkedOperationPackId || '', department: node.department || '', materialIds: (node.materialRequirements || []).map(req => req.materialId).filter(Boolean) };
}
function buildQcContextFromOperationPackStep(pack, step) {
  return { sourceType: 'op_pack_step', sourceId: step.id, operationPackId: pack.id, operationPackStepId: step.id, sopId: step.sopId || step.linkedSopId || '', machineId: step.machineId || step.linkedMachineId || '', department: pack.department || step.department || '', materialIds: (step.materialRequirements || []).map(req => req.materialId).filter(Boolean) };
}
function createQcRecordForCard(cardId, templateId = '', patch = {}) {
  ensureOmni();
  const card = (omni.kanban.cards || []).find(c => c.id === cardId);
  if (!card) return null;
  const template = templateId ? getQcTemplates().find(t => t.id === templateId) : null;
  const context = buildQcContextFromCard(card);
  const qc = {
    id: makeId('qc'),
    title: patch.title || `QC: ${card.title}`,
    type: patch.type || template?.title || 'فحص جودة',
    status: patch.status || patch.result || 'pending',
    result: patch.result || 'pending',
    ...context,
    inspector: patch.inspector || 'قسم الجودة',
    inspectedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    checklist: template ? template.checklist.map(item => ({ id: makeId('qci'), text: item.text, required: item.required !== false, passed: false, note: '' })) : buildQcChecklistFromSop(context.sopId),
    criteria: [],
    failureReason: patch.failureReason || patch.reason || '',
    severity: patch.severity || template?.severityOnFail || 'medium',
    reworkCardId: '',
    reworkTaskId: '',
    reworkStatus: 'none',
    costImpact: Number(patch.costImpact || 0) || 0,
    photos: [],
    attachments: [],
    notes: patch.notes || '',
    activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء فحص جودة من بطاقة Kanban' }],
    qcTemplateId: templateId || ''
  };
  qc.reason = qc.failureReason;
  qc.reworkCost = qc.costImpact;
  omni.qcRecords.push(qc);
  if (!Array.isArray(card.qcRecordIds)) card.qcRecordIds = [];
  if (!card.qcRecordIds.includes(qc.id)) card.qcRecordIds.push(qc.id);
  saveData();
  showToast('تم إنشاء فحص جودة', 'success');
  renderQcCenter();
  return qc;
}

function addQcActivity(qcRecordId, text) {
  const qc = getQcRecordById(qcRecordId);
  if (!qc) return;
  if (!Array.isArray(qc.activityLog)) qc.activityLog = [];
  qc.activityLog.push({ date: new Date().toISOString(), text });
}
function updateQcRecord(qcRecordId, patch) {
  const qc = getQcRecordById(qcRecordId);
  if (!qc) return;
  Object.assign(qc, patch || {}, { updatedAt: new Date().toISOString() });
  if (patch?.failureReason !== undefined) qc.reason = patch.failureReason;
  saveData();
  renderQcCenter();
  renderQcInspectorTab(qcRecordId, omniActiveQcInspectorTab);
}
function updateQcChecklistItem(qcRecordId, itemId, patch) {
  const qc = getQcRecordById(qcRecordId);
  const item = qc?.checklist?.find(x => x.id === itemId);
  if (!item) return;
  Object.assign(item, patch || {});
  addQcActivity(qcRecordId, `تم تحديث بند فحص: ${item.text}`);
  qc.updatedAt = new Date().toISOString();
  saveData();
  openQcInspector(qcRecordId, 1);
}
function applySopChecklistToRecord(qcId, sopId) {
  ensureOmni();
  const qc = getQcRecordById(qcId);
  const sop = getSopById(sopId);
  if (!qc || !sop) return;
  qc.sopId = sopId;
  const items = [];
  if (Array.isArray(sop.steps) && sop.steps.length) {
    sop.steps.forEach(step => {
      const text = typeof step === 'string' ? step : (step.text || step.title || 'خطوة تشغيل');
      items.push({ id: makeId('qci'), text: `خطوة: ${text}`, required: true, passed: false, note: '' });
    });
  }
  if (Array.isArray(sop.checklist) && sop.checklist.length) {
    sop.checklist.forEach(item => {
      const text = typeof item === 'string' ? item : (item.text || item.title || 'معيار فحص');
      items.push({ id: makeId('qci'), text: text, required: true, passed: false, note: '' });
    });
  }
  if (!items.length) {
    items.push({ id: makeId('qci'), text: `التأكد من الالتزام بإجراء: ${sop.title}`, required: true, passed: false, note: '' });
  }
  qc.checklist = items;
  addQcActivity(qcId, `تم تطبيق بنود فحص الـ SOP: ${sop.title}`);
  saveData();
  showToast('تمت مزامنة معايير الـ SOP مع الفحص بنجاح', 'success');
  renderQcCenter();
  renderQcInspectorTab(qcId, 1);
}
function markQcPass(qcRecordId) {
  const qc = getQcRecordById(qcRecordId);
  if (!qc) return;
  qc.result = 'pass';
  qc.status = 'pass';
  qc.inspectedAt = new Date().toISOString();
  qc.updatedAt = qc.inspectedAt;
  addQcActivity(qcRecordId, 'تم تسجيل الفحص كناجح');
  saveData();
  showToast('تم تسجيل الفحص كناجح', 'success');
  renderQcCenter();
  renderQcInspectorTab(qcRecordId, omniActiveQcInspectorTab);
}
async function markQcFail(qcRecordId, reason, severity) {
  const qc = getQcRecordById(qcRecordId);
  if (!qc) return;
  let finalReason = reason;
  let finalSeverity = severity;
  if (!finalReason) {
    const result = await showOmniModal('تعليم كفاشل', `
      <label>سبب الرفض</label><textarea id="qcFailReason" class="form-input" rows="3">${escapeHtml(qc.failureReason || '')}</textarea>
      <label>الخطورة</label><select id="qcFailSeverity" class="form-input">
        <option value="low">منخفض</option><option value="medium">متوسط</option><option value="high" selected>عالي</option><option value="critical">حرج</option>
      </select>
    `, body => ({ reason: body.querySelector('#qcFailReason')?.value.trim(), severity: body.querySelector('#qcFailSeverity')?.value || 'high' }));
    if (!result) return;
    finalReason = result.reason || 'غير محدد';
    finalSeverity = result.severity || 'high';
  }
  qc.result = 'fail';
  qc.status = 'rework_required';
  qc.failureReason = finalReason || 'غير محدد';
  qc.reason = qc.failureReason;
  qc.severity = finalSeverity || 'high';
  qc.inspectedAt = new Date().toISOString();
  qc.updatedAt = qc.inspectedAt;
  addQcActivity(qcRecordId, `تم تسجيل الفحص كفاشل: ${qc.reason}`);
  saveData();
  triggerOmniEvent('QC_FAILED', { qc });
  
  // Consecutive QC failures check for machines
  if (qc.cardId) {
    const card = (omni.kanban.cards || []).find(c => c.id === qc.cardId);
    if (card && Array.isArray(card.machineIds)) {
      card.machineIds.forEach(machineId => {
        const relatedQcs = (omni.qcRecords || [])
          .filter(q => {
            const qCard = (omni.kanban.cards || []).find(c => c.id === q.cardId);
            return qCard && (qCard.machineIds || []).includes(machineId);
          })
          .filter(q => q.result === 'pass' || q.result === 'fail')
          .sort((a, b) => new Date(b.inspectedAt || b.updatedAt) - new Date(a.inspectedAt || a.updatedAt));
        if (relatedQcs.length >= 2 && relatedQcs[0].result === 'fail' && relatedQcs[1].result === 'fail') {
          const machine = getMachineById(machineId);
          triggerOmniEvent('QC_REPEATED_FAIL', { machine, qc, relatedQcs });
        }
      });
    }
  }

  showToast('تم تسجيل الفحص كفاشل', 'error');
  if ((omni.qcSettings || {}).autoCreateReworkOnFail) {
    const ok = await showOmniModal('إنشاء إعادة عمل', '<p>الإعدادات تسمح بإنشاء إعادة عمل عند الفشل. هل تريد إنشاء بطاقة إعادة عمل الآن؟</p>', () => true);
    if (ok) createReworkFromQc(qcRecordId);
  }
  renderQcCenter();
  renderQcInspectorTab(qcRecordId, omniActiveQcInspectorTab);
}
function closeQcRecord(qcRecordId) {
  const qc = getQcRecordById(qcRecordId);
  if (!qc) return;
  qc.status = 'closed';
  qc.updatedAt = new Date().toISOString();
  addQcActivity(qcRecordId, 'تم إغلاق الفحص');
  saveData();
  showToast('تم إغلاق الفحص', 'success');
  renderQcCenter();
  renderQcInspectorTab(qcRecordId, omniActiveQcInspectorTab);
}

function findBestReworkColumn() {
  const cols = omni.kanban?.columns || [];
  return cols.find(c => /rework|إعادة|تصحيح|مراجعة/i.test(c.title || c.name || '')) ||
    cols.find(c => /review|مراجعة/i.test(c.title || c.name || '')) ||
    cols[0];
}
function createReworkFromQc(qcRecordId) {
  ensureOmni();
  const qc = getQcRecordById(qcRecordId);
  if (!qc) return null;
  if (qc.reworkCardId && (omni.kanban.cards || []).some(c => c.id === qc.reworkCardId)) {
    showToast('توجد بطاقة إعادة عمل مرتبطة مسبقاً', 'warning');
    return (omni.kanban.cards || []).find(c => c.id === qc.reworkCardId);
  }
  const sourceCard = (omni.kanban.cards || []).find(c => c.id === qc.cardId || c.id === qc.taskRef);
  const col = findBestReworkColumn();
  const card = {
    id: makeId('card'),
    columnId: col?.id || 'kb_backlog',
    title: `إعادة عمل: ${qc.title || qc.type}`,
    owner: qc.inspector || qc.assignee || 'قسم الجودة',
    assigneeId: '',
    priority: qc.severity === 'critical' ? 'urgent' : qc.severity === 'high' ? 'high' : 'normal',
    dueDate: todayISO(),
    department: qc.department || sourceCard?.department || 'الجودة',
    tags: ['QC', 'rework', 'إعادة عمل'],
    description: `سبب الرفض: ${qc.failureReason || '-'}\nQC: ${qc.id}`,
    checklist: [{ id: makeId('chk'), text: 'مراجعة سبب فشل QC', done: false }, { id: makeId('chk'), text: 'تنفيذ التصحيح', done: false }, { id: makeId('chk'), text: 'إعادة الفحص', done: false }],
    qcRecordIds: [qc.id],
    sopIds: qc.sopId ? [qc.sopId] : [...(sourceCard?.sopIds || [])],
    machineIds: qc.machineId ? [qc.machineId] : [...(sourceCard?.machineIds || [])],
    materialRequirements: sourceCard?.materialRequirements ? [...sourceCard.materialRequirements] : [],
    operationPackId: qc.operationPackId || sourceCard?.operationPackId || '',
    operationPackStepId: qc.operationPackStepId || sourceCard?.operationPackStepId || '',
    sourceType: 'qc_rework',
    sourceId: qc.id,
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء بطاقة إعادة عمل من QC ${qc.id}` }]
  };
  omni.kanban.cards.push(card);
  qc.reworkCardId = card.id;
  qc.reworkStatus = 'created';
  qc.status = 'rework_required';
  addQcActivity(qc.id, `تم إنشاء بطاقة إعادة عمل: ${card.title}`);
  saveData();
  showToast('تم إنشاء بطاقة إعادة عمل', 'success');
  renderQcCenter();
  return card;
}
function createReworkTaskFromQc(qcRecordId) { return createReworkFromQc(qcRecordId); }
function closeReworkForQc(qcRecordId) {
  const qc = getQcRecordById(qcRecordId);
  if (!qc) return;
  qc.reworkStatus = 'done';
  qc.status = 'reworked';
  addQcActivity(qcRecordId, 'تم إغلاق إعادة العمل');
  saveData();
  renderQcCenter();
}

function linkWorkflowNodeToQcTemplate(nodeId, templateId) {
  const node = (omni.workflow?.nodes || []).find(n => n.id === nodeId);
  if (!node) return;
  node.linkedQcTemplateId = templateId || '';
  node.qcRequired = true;
  saveData();
}
function validateWorkflowQcNodes(workflow = omni.workflow) {
  const warnings = [];
  (workflow?.nodes || []).filter(isQcRequiredForWorkflowNode).forEach(node => {
    const edges = workflow.edges || [];
    const hasPass = edges.some(e => e.from === node.id && ['success', 'pass'].includes(e.sourcePort || e.type));
    const hasFail = edges.some(e => e.from === node.id && ['failure', 'fail'].includes(e.sourcePort || e.type));
    if (!node.linkedQcTemplateId && !getSopQcCriteria(node.linkedSopId).length) warnings.push({ nodeId: node.id, text: `عقدة QC "${node.title}" بدون قالب فحص أو معايير SOP.` });
    if (!hasPass || !hasFail) warnings.push({ nodeId: node.id, text: `عقدة QC "${node.title}" تحتاج مسار نجاح وفشل.` });
  });
  return warnings;
}
function getWorkflowQcWarnings(workflow) { return validateWorkflowQcNodes(workflow); }
function getOperationPackQcWarnings(packId) {
  const pack = getOperationPackById(packId);
  if (!pack) return [];
  return (pack.steps || []).filter(isQcRequiredForOperationPackStep).filter(step => !step.qcTemplateId && !(step.qcCriteria || []).length).map(step => ({ stepId: step.id, text: `خطوة "${step.title || step.name}" تتطلب QC بدون قالب فحص.` }));
}

function calculateReworkCost(filters = {}) {
  ensureOmni();
  return (omni.qcRecords || []).filter(q => !filters.department || q.department === filters.department).reduce((sum, q) => sum + (Number(q.costImpact ?? q.reworkCost) || 0), 0);
}
function detectProblematicSops(filters = {}) {
  ensureOmni();
  const counts = {};
  (omni.qcRecords || []).filter(q => q.result === 'fail').forEach(q => {
    if (filters.department && q.department !== filters.department) return;
    if (q.sopId) counts[q.sopId] = (counts[q.sopId] || 0) + 1;
  });
  return Object.entries(counts).filter(([, count]) => count >= 2).map(([sopId, failCount]) => ({ sopId, sop: getSopById(sopId), failCount }));
}
function calculateQcAnalytics(filters = {}) {
  ensureOmni();
  let records = omni.qcRecords || [];
  if (filters.department) records = records.filter(q => q.department === filters.department);
  const total = records.length;
  const pass = records.filter(q => q.result === 'pass').length;
  const fail = records.filter(q => q.result === 'fail').length;
  const pending = records.filter(q => q.result === 'pending' || q.status === 'pending').length;
  const rework = records.filter(q => ['rework_required', 'reworked'].includes(q.status) || q.reworkStatus !== 'none').length;
  const bucket = (keyFn) => {
    const out = {};
    records.filter(q => q.result === 'fail').forEach(q => { const key = keyFn(q) || 'غير محدد'; out[key] = (out[key] || 0) + 1; });
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  };
  return {
    total, pass, fail, pending, rework,
    passRate: total ? Math.round(pass / total * 100) : 100,
    failRate: total ? Math.round(fail / total * 100) : 0,
    reworkCost: calculateReworkCost(filters),
    byReason: bucket(q => q.failureReason || q.reason),
    byMachine: bucket(q => getMachineById(q.machineId)?.name || q.machineId),
    bySop: bucket(q => getSopById(q.sopId)?.title || q.sopId),
    byMaterial: bucket(q => (q.materialIds || []).map(id => getMaterialById(id)?.name || id).join('، ')),
    problematicSops: detectProblematicSops(filters)
  };
}
function getQcRecordReworkCost(qc) {
  const split = (Number(qc.laborCost) || 0) + (Number(qc.materialCost) || 0) + (Number(qc.machineCost) || 0);
  return split > 0 ? split : (Number(qc.costImpact ?? qc.reworkCost) || 0);
}
function getQcCurrency() {
  try { return (omni.adminSettings?.organization?.currencySymbol) || 'د.ع'; } catch (_) { return 'د.ع'; }
}
function calculateReworkCostBreakdown(filters = {}) {
  ensureOmni();
  let records = (omni.qcRecords || []).slice();
  if (filters.department) records = records.filter(q => q.department === filters.department);
  const failed = records.filter(q => q.result === 'fail' || ['rework_required','reworked','closed'].includes(q.status));
  const total = failed.reduce((s, q) => s + getQcRecordReworkCost(q), 0);
  const totalLabor = failed.reduce((s, q) => s + (Number(q.laborCost) || 0), 0);
  const totalMaterial = failed.reduce((s, q) => s + (Number(q.materialCost) || 0), 0);
  const totalMachine = failed.reduce((s, q) => s + (Number(q.machineCost) || 0), 0);
  const totalUnsplit = Math.max(0, total - totalLabor - totalMaterial - totalMachine);
  const openCost = failed.filter(q => !['closed','reworked'].includes(q.status)).reduce((s, q) => s + getQcRecordReworkCost(q), 0);
  const closedCost = failed.filter(q => ['closed','reworked'].includes(q.status)).reduce((s, q) => s + getQcRecordReworkCost(q), 0);
  const reworkMinutes = failed.reduce((s, q) => s + (Number(q.estimatedReworkMinutes) || 0), 0);
  const avgPerFail = failed.length ? Math.round(total / failed.length) : 0;
  const bucket = (keyFn) => {
    const out = {};
    failed.forEach(q => { const key = keyFn(q) || 'غير محدد'; out[key] = (out[key] || 0) + getQcRecordReworkCost(q); });
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  };
  const byDept = bucket(q => q.department);
  const bySop = bucket(q => getSopById(q.sopId)?.title || (q.sopId ? q.sopId : ''));
  const byMachine = bucket(q => getMachineById(q.machineId)?.name || (q.machineId ? q.machineId : ''));
  const byReason = bucket(q => q.failureReason || q.reason);
  const now = new Date();
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = d.toLocaleDateString('ar-IQ', { month: 'short', year: '2-digit' });
    const cost = failed.filter(q => {
      const dt = new Date(q.inspectedAt || q.updatedAt || q.createdAt || 0);
      return dt >= d && dt < end;
    }).reduce((s, q) => s + getQcRecordReworkCost(q), 0);
    trend.push({ label, cost });
  }
  return { total, totalLabor, totalMaterial, totalMachine, totalUnsplit, openCost, closedCost, reworkMinutes, avgPerFail, failedCount: failed.length, byDept, bySop, byMachine, byReason, trend };
}
function getQcRecordsByBatch() {
  ensureOmni();
  const groups = {};
  (omni.qcRecords || []).forEach(q => {
    const key = (q.batchNumber || '').trim();
    if (!key) return;
    if (!groups[key]) groups[key] = { batchNumber: key, records: [], totalBatchSize: 0, totalSampleSize: 0, totalDefectCount: 0, totalReworkCost: 0, pass: 0, fail: 0, pending: 0, lastInspectedAt: '' };
    const g = groups[key];
    g.records.push(q);
    g.totalBatchSize += Number(q.batchSize) || 0;
    g.totalSampleSize += Number(q.sampleSize) || 0;
    g.totalDefectCount += Number(q.defectCount) || 0;
    g.totalReworkCost += getQcRecordReworkCost(q);
    if (q.result === 'pass') g.pass++;
    else if (q.result === 'fail') g.fail++;
    else g.pending++;
    const ts = q.inspectedAt || q.updatedAt || q.createdAt;
    if (ts && (!g.lastInspectedAt || ts > g.lastInspectedAt)) g.lastInspectedAt = ts;
  });
  return Object.values(groups).map(g => {
    const inspected = g.pass + g.fail;
    g.passRate = inspected ? Math.round(g.pass / inspected * 100) : 0;
    g.defectRate = g.totalSampleSize ? Math.round(g.totalDefectCount / g.totalSampleSize * 100) : (g.totalBatchSize ? Math.round(g.totalDefectCount / g.totalBatchSize * 100) : 0);
    return g;
  }).sort((a, b) => (b.lastInspectedAt || '').localeCompare(a.lastInspectedAt || ''));
}
function getQcLinkContext(qc) {
  const sop = qc.sopId ? getSopById(qc.sopId) : null;
  const machine = qc.machineId ? getMachineById(qc.machineId) : null;
  const materials = (qc.materialIds || []).map(id => getMaterialById(id)).filter(Boolean);
  const sopFails = sop ? (omni.qcRecords || []).filter(r => r.result === 'fail' && r.sopId === sop.id).length : 0;
  const machineQueue = machine ? (machine.queue || []).length : 0;
  return { sop, sopFails, machine, machineQueue, materials };
}
function getQcCommandCenterAlerts() {
  const a = calculateQcAnalytics();
  const alerts = [];
  if (a.fail) alerts.push({ severity: 'danger', source: 'من مركز الجودة', title: `${a.fail} فحص جودة فاشل`, reason: 'تحتاج متابعة أو إنشاء إعادة عمل.', page: 'qc_center', action: 'فتح مركز الجودة' });
  if (a.pending) alerts.push({ severity: 'warning', source: 'من مركز الجودة', title: `${a.pending} فحص قيد الانتظار`, reason: 'افحص بوابات الجودة قبل التسليم.', page: 'qc_center', action: 'فتح مركز الجودة' });
  if (a.rework) alerts.push({ severity: 'danger', source: 'من مركز الجودة', title: `${a.rework} حالة إعادة عمل`, reason: 'راجع حالات إعادة العمل المفتوحة.', page: 'qc_center', action: 'فتح مركز الجودة' });
  a.problematicSops.slice(0, 2).forEach(p => alerts.push({ severity: 'warning', source: 'من مركز الجودة', title: `إجراء يحتاج مراجعة: ${p.sop?.title || p.sopId}`, reason: `${p.failCount} حالات فشل مرتبطة.`, page: 'sop', action: 'فتح الإجراءات' }));
  return alerts;
}

function setQcCenterTab(tab) { qcCenterTab = tab; renderQcCenter(); }
function renderQcKpis() {
  const a = calculateQcAnalytics();
  const cb = calculateReworkCostBreakdown();
  const sopProblems = a.problematicSops.length;
  const cur = getQcCurrency();
  const reworkHours = cb.reworkMinutes ? (cb.reworkMinutes / 60).toFixed(1) : '0';
  return `<div class="qc-kpi-grid">
    ${[
      ['إجمالي الفحوصات', a.total, ''],
      ['قيد الفحص', a.pending, 'warn'],
      ['ناجح', a.pass, 'ok'],
      ['فاشل', a.fail, 'danger'],
      ['إعادة عمل مطلوبة', a.rework, 'danger'],
      ['كلفة إعادة العمل', `${cb.total.toLocaleString()} ${cur}`, 'warn'],
      ['متوسط كلفة الفشل', `${cb.avgPerFail.toLocaleString()} ${cur}`, cb.avgPerFail ? 'warn' : ''],
      ['ساعات إعادة العمل', `${reworkHours} س`, cb.reworkMinutes ? 'warn' : ''],
      ['نسبة النجاح', a.passRate + '%', a.passRate >= 80 ? 'ok' : (a.passRate >= 60 ? 'warn' : 'danger')],
      ['إجراءات (SOP) عالية الأخطاء', sopProblems, sopProblems ? 'danger' : 'ok']
    ].map(([label, value, tone]) => `<div class="qc-kpi-card ${tone}"><strong>${value}</strong><span>${label}</span></div>`).join('')}
  </div>`;
}
function qcStatusBadge(qc) { return `<span class="qc-status-badge qc-status-${qc.status || qc.result}">${qcStatusLabel(qc.status || qc.result)}</span>`; }
function qcSeverityBadge(qc) { return `<span class="qc-severity-badge qc-severity-${qc.severity || 'medium'}">${qcSeverityLabel(qc.severity || 'medium')}</span>`; }
function qcStatusLabel(s) { return ({ pending: 'قيد الفحص', pass: 'ناجح', fail: 'فاشل', rework_required: 'إعادة عمل مطلوبة', reworked: 'تمت إعادة العمل', closed: 'مغلق' })[s] || s || 'غير محدد'; }
function qcSeverityLabel(s) { return ({ low: 'منخفض', medium: 'متوسط', high: 'عالي', critical: 'حرج' })[s] || s; }
function renderQcRecordCard(qc) {
  const card = qc.cardId ? (omni.kanban.cards || []).find(c => c.id === qc.cardId) : null;
  return `<div class="qc-record-card" onclick="openQcInspector('${qc.id}',0)">
    <div><h4>${escapeHtml(qc.title || qc.type)}</h4><small>${escapeHtml(qc.department || 'غير مصنف')} · ${escapeHtml(qc.inspector || 'قسم الجودة')} · ${qc.createdAt ? new Date(qc.createdAt).toLocaleDateString() : '-'}</small></div>
    <div class="qc-record-badges">${qcStatusBadge(qc)}${qcSeverityBadge(qc)}${card ? `<span class="qc-status-badge">اللوحة</span>` : ''}</div>
    <p>${escapeHtml(qc.failureReason || qc.notes || 'لا توجد ملاحظات')}</p>
    <div class="qc-record-links">${qc.batchNumber ? `<span class="qc-link-batch">📦 دفعة: ${escapeHtml(qc.batchNumber)}</span>` : ''}${qc.sopId ? `<span>SOP: ${escapeHtml(getSopById(qc.sopId)?.title || qc.sopId)}</span>` : ''}${qc.machineId ? `<span>ماكينة: ${escapeHtml(getMachineById(qc.machineId)?.name || qc.machineId)}</span>` : ''}${(qc.materialIds || []).length ? `<span>مواد: ${qc.materialIds.length}</span>` : ''}${getQcRecordReworkCost(qc) > 0 ? `<span class="qc-link-cost">كلفة: ${getQcRecordReworkCost(qc).toLocaleString()} ${escapeHtml(getQcCurrency())}</span>` : ''}</div>
  </div>`;
}

function renderQcRecordsTab() {
  const records = omni.qcRecords || [];
  return `<div class="qc-record-list">${records.map(renderQcRecordCard).join('') || '<div class="qc-empty-state">لا توجد فحوصات جودة حالياً</div>'}</div>`;
}
function renderQcReworkTab() {
  const records = (omni.qcRecords || []).filter(q => q.result === 'fail' || q.reworkStatus !== 'none' || q.status === 'rework_required');
  return `<div class="qc-record-list">${records.map(qc => `<div class="qc-rework-card">${renderQcRecordCard(qc)}<div class="insp-actions">${qc.reworkCardId ? `<button class="btn-secondary" onclick="event.stopPropagation(); switchPage('kanban'); openKanbanCardInspector('${qc.reworkCardId}')">فتح بطاقة إعادة العمل</button>` : `<button class="btn-primary" onclick="event.stopPropagation(); createReworkFromQc('${qc.id}')">إنشاء إعادة عمل</button>`}<button class="btn-secondary" onclick="event.stopPropagation(); closeReworkForQc('${qc.id}')">إغلاق إعادة العمل</button></div></div>`).join('') || '<div class="qc-empty-state">لا توجد حالات إعادة عمل مفتوحة</div>'}</div>`;
}
function renderQcTemplatesTab() {
  ensureOmni();
  const sops = (omni.sops || []).filter(s => (s.checklist || []).length > 0 || (s.steps || []).length > 0);
  return `<div class="qc-template-grid">
    ${sops.map(s => `
      <div class="qc-template-card" style="border: 1px solid rgba(96, 165, 250, 0.2); background: rgba(30, 41, 59, 0.4); padding: 16px; border-radius: 8px;">
        <h4 style="margin: 0 0 6px 0; color: #60a5fa;"><i class="fa-solid fa-book"></i> ${escapeHtml(s.title)}</h4>
        <small class="muted" style="display: block; margin-bottom: 12px;">${escapeHtml(s.code)} · ${escapeHtml(s.department || 'عام')}</small>
        <p style="margin: 0 0 16px 0; font-size: 13px;">يحتوي على <b>${(s.checklist || []).length + (s.steps || []).length}</b> بند فحص مستمد من الـ SOP</p>
        <div class="insp-actions" style="display: flex; gap: 8px;">
          <button class="btn-secondary" onclick="switchPage('sop'); setTimeout(()=>openSopInspector('${s.id}'),100)" style="width: 100%;"><i class="fa-solid fa-eye"></i> عرض وتعديل الـ SOP</button>
        </div>
      </div>
    `).join('') || '<div class="qc-empty-state">لا توجد معايير فحص محددة في الـ SOPs حالياً. اذهب لمكتبة SOP وأضف بنود فحص لأي SOP لتظهر هنا.</div>'}
  </div>`;
}
function renderQcSopProblemsTab() {
  const problems = detectProblematicSops();
  const banner = `
    <div class="qc-sop-problems-banner" style="background: rgba(96,165,250,0.1); border-right: 4px solid #60a5fa; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13.5px; color: var(--text-muted); line-height: 1.6;">
      <i class="fa-solid fa-triangle-exclamation" style="color: #60a5fa; margin-left: 8px;"></i>
      <b>ما هو تحليل أخطاء الـ SOP؟</b> يقوم نظام Octagon ERP تلقائياً بتحليل الفحوصات الفاشلة لتحديد أي إجراءات تشغيل قياسية (SOP) تسجل أعلى معدلات تكرار للأخطاء. يتيح لك هذا التحذير المباشر معرفة الإجراءات الصعبة أو التي تحتاج إلى إعادة تدريب للموظفين لمنع تكرار الهدر.
    </div>
  `;
  return `${banner}<div class="qc-record-list">${problems.map(p => `<div class="qc-sop-problem-card"><h4>${escapeHtml(p.sop?.title || p.sopId)}</h4><p>${p.warning}</p><span class="qc-severity-badge qc-severity-high">${p.failCount} فشل</span></div>`).join('') || '<div class="qc-empty-state">لا توجد تحذيرات حالية. جميع إجراءات التشغيل القياسية (SOPs) تسجل أداءً ممتازاً ومعدل عيوب طبيعي.</div>'}</div>`;
}
function renderQcStatsTab() {
  const a = calculateQcAnalytics();
  const list = arr => arr.slice(0, 6).map(([k, v]) => `<div class="task-load-row"><b>${escapeHtml(k)}</b><div class="task-load-bar"><span style="width:${Math.min(100, v * 20)}%;background:#f87171"></span></div><span>${v}</span></div>`).join('') || '<div class="qc-empty-state">لا توجد بيانات كافية</div>';
  return `${renderQcCostAnalysisPanel()}<div class="qc-section-grid"><section><h3>أسباب الفشل</h3>${list(a.byReason)}</section><section><h3>الفشل حسب الماكينة</h3>${list(a.byMachine)}</section><section><h3>الفشل حسب SOP</h3>${list(a.bySop)}</section><section><h3>الفشل حسب المادة</h3>${list(a.byMaterial)}</section></div>`;
}
function renderQcCostAnalysisPanel() {
  const cb = calculateReworkCostBreakdown();
  const cur = getQcCurrency();
  const maxTrend = Math.max(1, ...cb.trend.map(t => t.cost));
  const trendBars = cb.trend.map(t => `<div class="qc-trend-bar"><div class="qc-trend-fill" style="height:${Math.max(4, (t.cost / maxTrend) * 100)}%" title="${t.cost.toLocaleString()} ${escapeHtml(cur)}"></div><small>${escapeHtml(t.label)}</small><span>${t.cost ? t.cost.toLocaleString() : '0'}</span></div>`).join('');
  const split = [
    ['أجور إعادة العمل', cb.totalLabor, '#f87171'],
    ['كلفة المواد المهدورة', cb.totalMaterial, '#fbbf24'],
    ['تشغيل المكائن', cb.totalMachine, '#38bdf8'],
    ['غير مصنّف', cb.totalUnsplit, '#94a3b8']
  ];
  const splitTotal = Math.max(1, split.reduce((s, r) => s + r[1], 0));
  const splitBar = split.map(([label, val, color]) => val > 0 ? `<div class="qc-cost-split-seg" style="width:${(val / splitTotal) * 100}%;background:${color}" title="${escapeHtml(label)}: ${val.toLocaleString()} ${escapeHtml(cur)}"></div>` : '').join('');
  const splitLegend = split.map(([label, val, color]) => `<span class="qc-cost-legend"><i style="background:${color}"></i>${escapeHtml(label)} <b>${val.toLocaleString()} ${escapeHtml(cur)}</b></span>`).join('');
  const top = (arr, n) => arr.slice(0, n).map(([k, v]) => `<li><span>${escapeHtml(k)}</span><b>${v.toLocaleString()} ${escapeHtml(cur)}</b></li>`).join('') || '<li class="muted">لا توجد بيانات كافية</li>';
  return `<section class="qc-cost-analysis">
    <header><h3><i class="fa-solid fa-coins"></i> تحليل كلفة إعادة العمل</h3><small>كل الأرقام مشتقة من سجلات الجودة الفعلية</small></header>
    <div class="qc-cost-kpi-row">
      <div class="qc-cost-kpi"><span>الإجمالي</span><strong>${cb.total.toLocaleString()} ${escapeHtml(cur)}</strong></div>
      <div class="qc-cost-kpi"><span>مفتوحة</span><strong style="color:#f87171">${cb.openCost.toLocaleString()} ${escapeHtml(cur)}</strong></div>
      <div class="qc-cost-kpi"><span>مغلقة</span><strong style="color:#34d399">${cb.closedCost.toLocaleString()} ${escapeHtml(cur)}</strong></div>
      <div class="qc-cost-kpi"><span>متوسط/فشل</span><strong>${cb.avgPerFail.toLocaleString()} ${escapeHtml(cur)}</strong></div>
      <div class="qc-cost-kpi"><span>ساعات إعادة العمل</span><strong>${(cb.reworkMinutes/60).toFixed(1)} س</strong></div>
    </div>
    <div class="qc-cost-split">
      <h4>توزيع الكلفة</h4>
      <div class="qc-cost-split-bar">${splitBar || '<div class="qc-cost-split-empty">لم يتم إدخال أي تكاليف بعد</div>'}</div>
      <div class="qc-cost-legend-row">${splitLegend}</div>
    </div>
    <div class="qc-cost-grids">
      <div class="qc-cost-card"><h4>الكلفة حسب القسم</h4><ul>${top(cb.byDept, 5)}</ul></div>
      <div class="qc-cost-card"><h4>الكلفة حسب SOP</h4><ul>${top(cb.bySop, 5)}</ul></div>
      <div class="qc-cost-card"><h4>الكلفة حسب الماكينة</h4><ul>${top(cb.byMachine, 5)}</ul></div>
      <div class="qc-cost-card"><h4>الكلفة حسب سبب الفشل</h4><ul>${top(cb.byReason, 5)}</ul></div>
    </div>
    <div class="qc-cost-trend">
      <h4>اتجاه الكلفة (آخر 6 أشهر)</h4>
      <div class="qc-trend-row">${trendBars}</div>
    </div>
  </section>`;
}
function renderQcBatchesTab() {
  const groups = getQcRecordsByBatch();
  const cur = getQcCurrency();
  const banner = `
    <div class="qc-batch-banner" style="background: rgba(16,185,129,0.08); border-right: 4px solid #10b981; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13.5px; color: var(--text-muted); line-height: 1.6;">
      <i class="fa-solid fa-layer-group" style="color: #10b981; margin-left: 8px;"></i>
      <b>ما هي "الدفعات (Batches)"؟</b> في بيئات التصنيع والإنتاج، يتم إنتاج السلع على شكل مجموعات تُسمى "دفعات". يتيح لك هذا التبويب تجميع ومراقبة جودة الإنتاج حسب رقم الدفعة (مثال: B-2026-X01). بدلاً من فحص كل قطعة بمفردها، يمكنك فحص "عينة عشوائية" لتقييم جودة خط الإنتاج بالكامل وتحديد نسبة العيوب فيها بسرعة.
    </div>
  `;
  if (!groups.length) return `${banner}<div class="qc-empty-state">لا توجد دفعات مسجلة بعد. أضف رقم الدفعة من تبويب "نظرة عامة" داخل أي فحص لتظهر هنا.</div>`;
  return `${banner}<div class="qc-batch-grid">${groups.map(g => {
    const failBadge = g.fail ? `<span class="qc-status-badge qc-status-fail">${g.fail} فشل</span>` : '';
    const passBadge = g.pass ? `<span class="qc-status-badge qc-status-pass">${g.pass} ناجح</span>` : '';
    const pendBadge = g.pending ? `<span class="qc-status-badge qc-status-pending">${g.pending} قيد الفحص</span>` : '';
    const passColor = g.passRate >= 80 ? '#34d399' : (g.passRate >= 60 ? '#fbbf24' : '#f87171');
    return `<div class="qc-batch-card">
      <div class="qc-batch-head">
        <div>
          <h4>الدفعة: ${escapeHtml(g.batchNumber)}</h4>
          <small>${g.records.length} فحص · آخر فحص ${g.lastInspectedAt ? new Date(g.lastInspectedAt).toLocaleDateString() : '-'}</small>
        </div>
        <div class="qc-batch-badges">${passBadge}${failBadge}${pendBadge}</div>
      </div>
      <div class="qc-batch-meters">
        <div><span>نسبة النجاح</span><div class="qc-batch-bar"><div style="width:${g.passRate}%;background:${passColor}"></div></div><b>${g.passRate}%</b></div>
        <div><span>نسبة العيوب</span><div class="qc-batch-bar"><div style="width:${Math.min(100, g.defectRate)}%;background:#f87171"></div></div><b>${g.defectRate}%</b></div>
      </div>
      <div class="qc-batch-stats">
        <span>حجم الدفعة: <b>${g.totalBatchSize.toLocaleString()}</b></span>
        <span>حجم العينة: <b>${g.totalSampleSize.toLocaleString()}</b></span>
        <span>العيوب: <b>${g.totalDefectCount.toLocaleString()}</b></span>
        <span>كلفة إعادة العمل: <b>${g.totalReworkCost.toLocaleString()} ${escapeHtml(cur)}</b></span>
      </div>
      <div class="qc-batch-records">${g.records.slice(0, 5).map(r => `<button class="qc-batch-rec" onclick="openQcInspector('${r.id}',0)"><span>${escapeHtml(r.title || r.type)}</span>${qcStatusBadge(r)}</button>`).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}
function renderQcSettingsTab() {
  const s = omni.qcSettings || getDefaultQcSettings();
  const rows = [
    ['requireQcForDelivery', 'اشتراط QC قبل التسليم'],
    ['requireQcForOperationCards', 'QC لبطاقات باقات العمليات'],
    ['requireQcForMachineCards', 'QC للبطاقات المرتبطة بماكينة'],
    ['requireQcForHighPriority', 'QC للأولوية العالية والعاجلة'],
    ['requireQcForOpPackExecution', 'QC لتنفيذ باقات العمليات'],
    ['blockDeliveryOnFailedQc', 'منع التسليم عند فشل QC'],
    ['autoCreateReworkOnFail', 'اقتراح Rework تلقائياً عند الفشل']
  ];
  return `<div class="qc-settings-list">${rows.map(([key, label]) => `<label class="qc-checklist-row"><input type="checkbox" ${s[key] ? 'checked' : ''} onchange="updateQcSettings('${key}', this.checked)"> ${label}</label>`).join('')}</div>`;
}
function renderQcCenter() {
  ensureOmni();
  const el = document.getElementById('qcCenterBody');
  if (!el) return;
  const page = document.getElementById('pageQcCenter');
  const title = page?.querySelector('.page-title');
  const subtitle = page?.querySelector('.page-subtitle');
  if (title) title.innerHTML = '<span class="title-icon">🧪</span> مركز الجودة وإعادة العمل';
  if (subtitle) subtitle.textContent = 'بوابة الجودة ومركز إعادة العمل مرتبط باللوحة التنفيذية، مصمم العمليات، الإجراءات، المكائن، المواد، مركز القيادة، والتحليلات.';
  const tabs = [['dashboard','لوحة الجودة'],['records','الفحوصات'],['rework','إعادة العمل'],['templates','معايير فحص الـ SOP'],['sop','تحليل أخطاء الـ SOP'],['stats','الكلفة والإحصائيات'],['batches','الدفعات'],['settings','الإعدادات']];
  const content = qcCenterTab === 'records' ? renderQcRecordsTab()
    : qcCenterTab === 'batches' ? renderQcBatchesTab()
    : qcCenterTab === 'rework' ? renderQcReworkTab()
    : qcCenterTab === 'templates' ? renderQcTemplatesTab()
    : qcCenterTab === 'sop' ? renderQcSopProblemsTab()
    : qcCenterTab === 'stats' ? renderQcStatsTab()
    : qcCenterTab === 'settings' ? renderQcSettingsTab()
    : renderQcDashboard();
  el.innerHTML = `<div class="qc-center-v2">${renderQcKpis()}<div class="qc-toolbar"><div class="qc-tabs">${tabs.map(([id,label]) => `<button class="${qcCenterTab === id ? 'active' : ''}" data-jarvis-action="qc.tab.${id}" data-jarvis-label="تبويب ${label}" onclick="setQcCenterTab('${id}')">${label}</button>`).join('')}</div><div class="qc-toolbar-actions"><button class="btn-primary" data-jarvis-action="qc.add_record" data-jarvis-label="إضافة فحص جودة جديد" onclick="addQcRecord()"><i class="fa-solid fa-plus"></i> إضافة فحص جودة</button></div></div>${content}</div>`;
  if (qcCenterTab === 'dashboard') {
    setTimeout(() => {
      triggerQcSimulation('pass');
    }, 50);
  }
}
function updateQcSettings(key, value) { ensureOmni(); omni.qcSettings = { ...getDefaultQcSettings(), ...omni.qcSettings, [key]: value }; saveData(); renderQcCenter(); }
async function addQcRecord() {
  ensureOmni();
  const cardOptions = (omni.kanban.cards || []).map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
  const sopOptions = (omni.sops || []).map(s => `<option value="${s.id}">${escapeHtml(s.code || '')} ${escapeHtml(s.title)}</option>`).join('');
  const result = await showOmniModal('إضافة فحص جودة', `
    <label>العنوان</label><input id="qcTitle" class="form-input" value="فحص جودة">
    <label>المصدر (بطاقة كانبان أو يدوي)</label><select id="qcCardId" class="form-input"><option value="">يدوي / بدون بطاقة</option>${cardOptions}</select>
    <label>إجراء الـ SOP المرتبط (اختياري)</label><select id="qcSopId" class="form-input"><option value="">بدون إجراء SOP</option>${sopOptions}</select>
    <label>القسم المسؤول</label><input id="qcDept" class="form-input" value="الجودة">
    <label>رقم الدفعة (اختياري — لتظهر في تبويب الدفعات)</label><input id="qcBatch" class="form-input" placeholder="مثال: B-2026-014">
  `, body => ({ title: body.querySelector('#qcTitle')?.value.trim(), cardId: body.querySelector('#qcCardId')?.value || '', sopId: body.querySelector('#qcSopId')?.value || '', department: body.querySelector('#qcDept')?.value.trim() || '', batchNumber: body.querySelector('#qcBatch')?.value.trim() || '' }));
  if (!result?.title) return;
  let qc;
  if (result.cardId) {
    qc = createQcRecordForCard(result.cardId, '', { title: result.title, department: result.department });
    if (qc) {
      if (result.sopId) { qc.sopId = result.sopId; applySopChecklistToRecord(qc.id, result.sopId); }
      if (result.batchNumber) { qc.batchNumber = result.batchNumber; saveData(); }
    }
  } else {
    qc = { id: makeId('qc'), title: result.title, type: result.title, status: 'pending', result: 'pending', sourceType: 'manual', sourceId: '', cardId: '', workflowNodeId: '', operationPackId: '', operationPackStepId: '', sopId: result.sopId || '', machineId: '', materialIds: [], orderId: '', department: result.department, inspector: 'قسم الجودة', inspectedAt: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), checklist: [], criteria: [], failureReason: '', severity: 'medium', reworkCardId: '', reworkTaskId: '', reworkStatus: 'none', costImpact: 0, reworkCost: 0, laborCost: 0, materialCost: 0, machineCost: 0, estimatedReworkMinutes: 0, batchNumber: result.batchNumber || '', batchSize: 0, sampleSize: 0, defectCount: 0, photos: [], attachments: [], notes: '', activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء فحص جودة يدوي' }] };
    omni.qcRecords.push(qc);
    if (result.sopId) {
      applySopChecklistToRecord(qc.id, result.sopId);
    }
    saveData();
  }
  showToast('تم إنشاء فحص جودة بنجاح', 'success');
  renderQcCenter();
  openQcInspector(qc.id, 0);
}
async function addQcTemplateModal() {
  const result = await showOmniModal('إضافة قالب فحص', `<label>اسم القالب</label><input id="qctTitle" class="form-input"><label>النوع</label><input id="qctType" class="form-input" value="general"><label>بنود الفحص</label><textarea id="qctChecklist" class="form-input" rows="5" placeholder="كل بند بسطر"></textarea>`, body => ({ title: body.querySelector('#qctTitle')?.value.trim(), type: body.querySelector('#qctType')?.value.trim(), checklist: (body.querySelector('#qctChecklist')?.value || '').split('\n').map(x => x.trim()).filter(Boolean).map(text => ({ id: makeId('qci'), text, required: true, expectedValue: '', tolerance: '', unit: '' })) }));
  if (!result?.title) return;
  createQcTemplate(result);
}
function openQcInspector(qcRecordId, tab = 0) {
  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  if (panel && overlay) { panel.classList.remove('hidden'); overlay.classList.remove('hidden'); panel.classList.add('qc-inspector'); }
  renderQcInspectorTab(qcRecordId, tab);
}
function renderQcInspectorTab(qcRecordId, tab = 0) {
  ensureOmni();
  const qc = getQcRecordById(qcRecordId);
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!qc || !tabs || !body) return;
  omniActiveQcInspectorTab = tab;
  title.textContent = qc.title || qc.type;
  const list = ['نظرة عامة','Checklist','المصدر','SOP','ماكينة','مواد','إعادة العمل','كلفة','نشاط'];
  tabs.innerHTML = list.map((t,i) => `<button class="insp-tab ${i === tab ? 'active' : ''}" onclick="renderQcInspectorTab('${qcRecordId}',${i})">${t}</button>`).join('');
  body.className = 'inspector-body qc-inspector';
  body.innerHTML = renderQcInspectorBody(qc, tab);
}
function renderQcInspectorBody(qc, tab) {
  const ctx = getQcLinkContext(qc);
  const cur = getQcCurrency();
  if (tab === 0) {
    const batchHint = qc.batchNumber ? `
      <div class="qc-batch-hint" style="background: rgba(16, 185, 129, 0.06); border-right: 3px solid #10b981; padding: 10px; border-radius: 4px; margin-bottom: 12px; font-size: 13px; color: var(--text-muted); line-height: 1.5;">
        📦 <b>مراقبة الدفعة ${escapeHtml(qc.batchNumber)}:</b> في نظام Octagon ERP، نستخدم أسلوب الفحص بالعينة للتحكم في جودة الدفعات الكبيرة. الدفعة تحتوي على <b>${qc.batchSize || 0}</b> قطعة، أخذنا منها عينة بحجم <b>${qc.sampleSize || 0}</b> قطعة للفحص، ووُجد فيها <b>${qc.defectCount || 0}</b> قطعة معيبة.
      </div>
    ` : `
      <div class="qc-batch-hint qc-batch-hint-empty" style="background: rgba(245, 158, 11, 0.06); border-right: 3px solid #f59e0b; padding: 10px; border-radius: 4px; margin-bottom: 12px; font-size: 13px; color: var(--text-muted); line-height: 1.5;">
        📦 <b>ربط دفعة تصنيع:</b> لم يتم ربط هذا الفحص بدفعة بعد. يمكنك إدخال رقم الدفعة وسيعرض النظام إحصائيات الجودة الخاصة بها في تبويب الدفعات.
      </div>
    `;

    const materialOptions = (omni.materials || []).map(m => `<option value="${m.id}" ${(qc.materialIds || []).includes(m.id) ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
    const cardOptions = (omni.kanban.cards || []).map(c => `<option value="${c.id}" ${qc.cardId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('');
    const machineOptions = (omni.machines || []).map(mac => `<option value="${mac.id}" ${qc.machineId === mac.id ? 'selected' : ''}>${escapeHtml(mac.name)} (${escapeHtml(mac.status || '-')})</option>`).join('');

    return `<div class="qc-inspector-summary">${qcStatusBadge(qc)}${qcSeverityBadge(qc)}<span>${escapeHtml(qc.department || 'غير مصنف')}</span></div>
      <div class="task-inspector-grid">
        <div><label>العنوان</label><input class="form-input" value="${escapeHtml(qc.title)}" onchange="updateQcRecord('${qc.id}',{title:this.value,type:this.value})"></div>
        <div><label>المفتش المسؤول</label><input class="form-input" value="${escapeHtml(qc.inspector || '')}" onchange="updateQcRecord('${qc.id}',{inspector:this.value})"></div>
        <div><label>القسم</label><input class="form-input" value="${escapeHtml(qc.department || '')}" onchange="updateQcRecord('${qc.id}',{department:this.value})"></div>
        <div><label>درجة الخطورة</label><select class="form-input" onchange="updateQcRecord('${qc.id}',{severity:this.value})">${['low','medium','high','critical'].map(s => `<option value="${s}" ${qc.severity === s ? 'selected' : ''}>${qcSeverityLabel(s)}</option>`).join('')}</select></div>
      </div>

      <!-- Live Operational Links Grid -->
      <div class="qc-operational-links" style="background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(96, 165, 250, 0.15); padding: 16px; border-radius: 8px; margin-top: 16px;">
        <h4 style="margin: 0 0 12px 0; color: #60a5fa; font-size: 13.5px;"><i class="fa-solid fa-link"></i> الروابط التشغيلية المباشرة (Operational Connections)</h4>
        <div class="task-inspector-grid">
          <div>
            <label><i class="fa-solid fa-box"></i> المنتج / المادة المفحوصة</label>
            <select class="form-input" onchange="updateQcRecord('${qc.id}', {materialIds: this.value ? [this.value] : []})">
              <option value="">— غير مرتبط بمنتج —</option>
              ${materialOptions}
            </select>
          </div>
          <div>
            <label><i class="fa-solid fa-table-columns"></i> بطاقة العمل / المشروع</label>
            <select class="form-input" onchange="updateQcRecord('${qc.id}', {cardId: this.value, sourceType: this.value ? 'kanban_card' : 'manual'})">
              <option value="">— غير مرتبط ببطاقة —</option>
              ${cardOptions}
            </select>
          </div>
          <div>
            <label><i class="fa-solid fa-gears"></i> الماكينة المسؤولة</label>
            <select class="form-input" onchange="updateQcRecord('${qc.id}', {machineId: this.value})">
              <option value="">— غير مرتبط بماكينة —</option>
              ${machineOptions}
            </select>
          </div>
        </div>
      </div>

      <div class="qc-batch-fields" style="background: rgba(30, 41, 59, 0.2); border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: 8px; margin-top: 16px;">
        ${batchHint}
        <div class="task-inspector-grid">
          <div><label>رقم الدفعة</label><input class="form-input" value="${escapeHtml(qc.batchNumber || '')}" placeholder="مثال: B-2026-014" onchange="updateQcRecord('${qc.id}',{batchNumber:this.value.trim()})"></div>
          <div><label>حجم الدفعة (قطعة)</label><input type="number" min="0" class="form-input" value="${qc.batchSize || 0}" onchange="updateQcRecord('${qc.id}',{batchSize:Number(this.value)||0})"></div>
          <div><label>حجم العينة المفحوصة</label><input type="number" min="0" class="form-input" value="${qc.sampleSize || 0}" onchange="updateQcRecord('${qc.id}',{sampleSize:Number(this.value)||0})"></div>
          <div><label>عدد العيوب في العينة</label><input type="number" min="0" class="form-input" value="${qc.defectCount || 0}" onchange="updateQcRecord('${qc.id}',{defectCount:Number(this.value)||0})"></div>
        </div>
      </div>
      <label style="margin-top: 16px; display: block;">ملاحظات المفتش</label>
      <textarea class="form-input" rows="3" placeholder="ملاحظات قابلة للقراءة من باقي الأقسام" onchange="updateQcRecord('${qc.id}',{notes:this.value})">${escapeHtml(qc.notes || '')}</textarea>
      <div class="insp-actions qc-actions-row">
        <button class="btn-secondary" title="ابدأ تنفيذ الفحص الآن" onclick="updateQcRecord('${qc.id}',{status:'pending',result:'pending'}); addQcActivity('${qc.id}','تم بدء الفحص'); openQcInspector('${qc.id}',0)"><i class="fa-solid fa-play"></i> بدء الفحص</button>
        <button class="btn-primary" title="تأكيد نجاح الفحص" onclick="markQcPass('${qc.id}')"><i class="fa-solid fa-check"></i> تعليم ناجح</button>
        <button class="btn-danger" title="تسجيل فشل مع سبب وخطورة" onclick="markQcFail('${qc.id}')"><i class="fa-solid fa-xmark"></i> تعليم فاشل</button>
        <button class="btn-secondary" title="إغلاق الفحص بعد المعالجة" onclick="closeQcRecord('${qc.id}')"><i class="fa-solid fa-lock"></i> إغلاق الفحص</button>
      </div>`;
  }
  if (tab === 1) {
    const sops = (omni.sops || []).filter(s => (s.checklist || []).length > 0 || (s.steps || []).length > 0);
    return `<div class="insp-section">
      <h4>Checklist بنود الفحص المستمدة من الـ SOP</h4>
      ${(qc.checklist || []).map(item => `
        <label class="qc-checklist-row" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <input type="checkbox" ${item.passed ? 'checked' : ''} onchange="updateQcChecklistItem('${qc.id}','${item.id}',{passed:this.checked})">
          <span style="flex: 1; font-size: 13.5px;">${escapeHtml(item.text)}</span>
          <input class="form-input" style="width: 200px;" value="${escapeHtml(item.note || '')}" placeholder="ملاحظة أو نتيجة الفحص" onchange="updateQcChecklistItem('${qc.id}','${item.id}',{note:this.value})">
        </label>
      `).join('') || '<div class="qc-empty-state">لا توجد بنود فحص بعد لهذا السجل. يرجى اختيار إجراء تشغيل SOP لتطبيقه كمعايير فحص.</div>'}
      <div class="qc-link-row" style="display: flex; gap: 8px; margin-top: 16px;">
        <select id="qcTemplateApply" class="form-input" style="flex: 1;">
          <option value="">اختر إجراء SOP لاستيراد بنود الفحص الخاصة به</option>
          ${sops.map(s => `<option value="${s.id}">${escapeHtml(s.code || '')} ${escapeHtml(s.title)}</option>`).join('')}
        </select>
        <button class="btn-secondary" onclick="applySopChecklistToRecord('${qc.id}', document.getElementById('qcTemplateApply').value); openQcInspector('${qc.id}', 1)"><i class="fa-solid fa-clipboard-check"></i> استيراد البنود</button>
      </div>
    </div>`;
  }
  if (tab === 2) { const card = qc.cardId ? (omni.kanban.cards || []).find(c => c.id === qc.cardId) : null; return `<div class="insp-section"><h4>المصدر الأصلي</h4><p>النوع: <b>${escapeHtml(qc.sourceType || 'يدوي')}</b> · المعرّف: <b>${escapeHtml(qc.sourceId || '-')}</b></p>${card ? `<button class="btn-secondary" onclick="switchPage('kanban'); openKanbanCardInspector('${card.id}')"><i class="fa-solid fa-up-right-from-square"></i> فتح بطاقة Kanban المصدر</button>` : '<p class="muted">لا توجد بطاقة مصدر مرتبطة. يمكن إنشاء الفحص يدوياً من زر "إضافة فحص جودة".</p>'}</div>`; }
  if (tab === 3) {
    const sop = ctx.sop;
    const link = sop ? `<div class="qc-link-card"><h5>${escapeHtml(sop.title)}</h5><small>الكود: <b>${escapeHtml(sop.code || '-')}</b> · الإصدار: <b>v${sop.version || 1}</b> · الحالة: <b style="color:${sop.approvalStatus === 'approved' ? '#34d399' : '#fbbf24'}">${escapeHtml(sop.approvalStatus || 'draft')}</b></small><p>عدد حالات الفشل المرتبطة بهذا SOP: <b style="color:${ctx.sopFails ? '#f87171' : '#34d399'}">${ctx.sopFails}</b></p><div class="insp-actions"><button class="btn-secondary" onclick="switchPage('sop'); setTimeout(()=>openSopInspector('${sop.id}'),100)"><i class="fa-solid fa-book-open"></i> فتح SOP في المكتبة</button></div></div>` : '<p class="muted">لا يوجد SOP مرتبط بهذا الفحص. اختر SOP من القائمة لربط معايير القبول.</p>';
    return `<div class="insp-section"><h4>ربط مع SOP</h4>${link}<div class="qc-link-row"><select id="qcSopSelect" class="form-input"><option value="">— بدون SOP —</option>${(omni.sops||[]).map(s => `<option value="${s.id}" ${qc.sopId === s.id ? 'selected' : ''}>${escapeHtml(s.code || '')} ${escapeHtml(s.title)}</option>`).join('')}</select><button class="btn-secondary" onclick="updateQcRecord('${qc.id}',{sopId:document.getElementById('qcSopSelect').value}); openQcInspector('${qc.id}',3)"><i class="fa-solid fa-link"></i> ربط SOP بهذا الفحص</button></div></div>`;
  }
  if (tab === 4) {
    const m = ctx.machine;
    const statusColor = m && m.status === 'maintenance' ? '#f87171' : (m && m.status === 'busy' ? '#fbbf24' : '#34d399');
    const link = m ? `<div class="qc-link-card"><h5>${escapeHtml(m.name)}</h5><small>الحالة: <b style="color:${statusColor}">${escapeHtml(m.status || '-')}</b> · الطابور الحالي: <b>${ctx.machineQueue}</b> · المشغل: <b>${escapeHtml(m.operator || m.defaultOperator || '-')}</b></small>${m.lastMaintenance ? `<p>آخر صيانة: ${new Date(m.lastMaintenance).toLocaleDateString()}</p>` : ''}<div class="insp-actions"><button class="btn-secondary" onclick="switchPage('machines'); setTimeout(()=>(typeof openInspector==='function')&&openInspector('machine','${m.id}'),100)"><i class="fa-solid fa-up-right-from-square"></i> فتح الماكينة</button></div></div>` : '<p class="muted">لا توجد ماكينة مرتبطة بهذا الفحص. اربط الماكينة المسؤولة عن الإنتاج لمتابعة كلفة وقت الفشل.</p>';
    return `<div class="insp-section"><h4>ربط مع الماكينة</h4>${link}<div class="qc-link-row"><select id="qcMachineSelect" class="form-input"><option value="">— بدون ماكينة —</option>${(omni.machines||[]).map(mac => `<option value="${mac.id}" ${qc.machineId === mac.id ? 'selected' : ''}>${escapeHtml(mac.name)} (${escapeHtml(mac.status || '-')})</option>`).join('')}</select><button class="btn-secondary" onclick="updateQcRecord('${qc.id}',{machineId:document.getElementById('qcMachineSelect').value}); openQcInspector('${qc.id}',4)"><i class="fa-solid fa-link"></i> ربط الماكينة</button></div></div>`;
  }
  if (tab === 5) {
    const linked = ctx.materials;
    const chips = linked.length ? linked.map(mat => {
      const avail = (typeof getMaterialAvailableQty === 'function') ? getMaterialAvailableQty(mat) : (mat.stock || 0);
      const low = avail <= (mat.minimum || 0);
      return `<div class="qc-material-chip ${low ? 'low' : ''}"><b>${escapeHtml(mat.name)}</b><small>متاح: ${avail} ${escapeHtml(mat.unit || '')} ${low ? '· منخفض' : ''}</small><button class="qc-chip-x" title="إزالة الربط" onclick="updateQcRecord('${qc.id}',{materialIds:(getQcRecordById('${qc.id}').materialIds||[]).filter(id=>id!=='${mat.id}')}); openQcInspector('${qc.id}',5)">✕</button></div>`;
    }).join('') : '<p class="muted">لا توجد مواد مرتبطة. أضف المواد التي تأثرت بالفشل لتتبع كلفة الهدر.</p>';
    const options = (omni.materials || []).filter(m => !(qc.materialIds || []).includes(m.id)).map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    return `<div class="insp-section"><h4>المواد المرتبطة</h4><div class="qc-material-chips">${chips}</div><div class="qc-link-row"><select id="qcMaterialAdd" class="form-input"><option value="">— أضف مادة —</option>${options}</select><button class="btn-secondary" onclick="(function(){var v=document.getElementById('qcMaterialAdd').value; if(!v) return; var rec=getQcRecordById('${qc.id}'); var arr=(rec.materialIds||[]).slice(); if(!arr.includes(v)) arr.push(v); updateQcRecord('${qc.id}',{materialIds:arr}); openQcInspector('${qc.id}',5);})()"><i class="fa-solid fa-plus"></i> ربط مادة</button></div></div>`;
  }
  if (tab === 6) {
    const reworkLabel = ({ none: 'لم يبدأ', created: 'تم إنشاء بطاقة إعادة عمل', in_progress: 'قيد التنفيذ', done: 'مغلق' })[qc.reworkStatus || 'none'] || qc.reworkStatus;
    return `<div class="insp-section"><h4>إدارة إعادة العمل</h4><p>الحالة الحالية: <b>${escapeHtml(reworkLabel)}</b></p><div class="insp-actions qc-actions-row">${qc.reworkCardId ? `<button class="btn-secondary" onclick="switchPage('kanban'); openKanbanCardInspector('${qc.reworkCardId}')"><i class="fa-solid fa-up-right-from-square"></i> فتح بطاقة Rework في Kanban</button>` : `<button class="btn-primary" onclick="createReworkFromQc('${qc.id}')"><i class="fa-solid fa-rotate"></i> إنشاء بطاقة إعادة عمل</button>`}<button class="btn-secondary" onclick="closeReworkForQc('${qc.id}')"><i class="fa-solid fa-circle-check"></i> تأكيد إنجاز إعادة العمل</button></div></div>`;
  }
  if (tab === 7) {
    const total = getQcRecordReworkCost(qc);
    return `<div class="insp-section"><h4>تفصيل كلفة إعادة العمل</h4>
      <div class="qc-cost-form">
        <div><label>أجور إعادة العمل (${escapeHtml(cur)})</label><input type="number" min="0" class="form-input" value="${qc.laborCost || 0}" onchange="updateQcRecord('${qc.id}',{laborCost:Number(this.value)||0,costImpact:(Number(this.value)||0)+(Number(getQcRecordById('${qc.id}').materialCost)||0)+(Number(getQcRecordById('${qc.id}').machineCost)||0)})"></div>
        <div><label>كلفة المواد المهدورة (${escapeHtml(cur)})</label><input type="number" min="0" class="form-input" value="${qc.materialCost || 0}" onchange="updateQcRecord('${qc.id}',{materialCost:Number(this.value)||0,costImpact:(Number(this.value)||0)+(Number(getQcRecordById('${qc.id}').laborCost)||0)+(Number(getQcRecordById('${qc.id}').machineCost)||0)})"></div>
        <div><label>كلفة تشغيل الماكينة (${escapeHtml(cur)})</label><input type="number" min="0" class="form-input" value="${qc.machineCost || 0}" onchange="updateQcRecord('${qc.id}',{machineCost:Number(this.value)||0,costImpact:(Number(this.value)||0)+(Number(getQcRecordById('${qc.id}').laborCost)||0)+(Number(getQcRecordById('${qc.id}').materialCost)||0)})"></div>
        <div><label>الوقت المقدّر لإعادة العمل (دقائق)</label><input type="number" min="0" class="form-input" value="${qc.estimatedReworkMinutes || 0}" onchange="updateQcRecord('${qc.id}',{estimatedReworkMinutes:Number(this.value)||0})"></div>
      </div>
      <div class="qc-cost-total"><span>الإجمالي المحسوب</span><strong>${total.toLocaleString()} ${escapeHtml(cur)}</strong></div>
      <small class="muted">يمكنك أيضاً إدخال كلفة إجمالية واحدة بدون تفصيل عبر تعديل costImpact مباشرة، لكن التفصيل يظهر في "تحليل الكلفة".</small>
    </div>`;
  }
  return `<div class="insp-section"><h4>سجل النشاط</h4>${(qc.activityLog||[]).slice().reverse().map(log => `<div class="insp-activity-item"><small>${new Date(log.date).toLocaleString()}</small><br>${escapeHtml(log.text)}</div>`).join('') || '<p class="muted">لا يوجد نشاط بعد.</p>'}</div>`;
}