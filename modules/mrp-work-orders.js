// ─── MRP Work Orders (GO 11 — Manufacturing / Work Orders V2) ─────────────
// T4.18 de-monolith: MRP work-order execution cluster moved out of app.js.
// Loads BEFORE app.js — ensureOmni() calls normalizeOmniWorkOrders() at boot.

function normalizeOmniWorkOrders() {
  if (!omni || typeof omni !== 'object') omni = {};
  if (!Array.isArray(omni.migrationsApplied)) omni.migrationsApplied = [];
  if (!Array.isArray(omni.workOrders)) omni.workOrders = [];

  omni.workOrders.forEach(wo => {
    if (!wo.id) wo.id = makeId('wo');
    if (!wo.cardId) wo.cardId = '';
    if (!wo.opPackId) wo.opPackId = '';
    if (!wo.opPackStepId) wo.opPackStepId = '';
    if (!wo.title) wo.title = 'أمر عمل';
    if (!wo.machineId) wo.machineId = '';
    if (!wo.operatorId) wo.operatorId = '';
    if (!wo.operatorName) wo.operatorName = '';
    if (!wo.status) wo.status = 'draft';
    if (wo.plannedMinutes === undefined) wo.plannedMinutes = 0;
    if (wo.actualMinutes === undefined) wo.actualMinutes = 0;
    if (wo.costPerHour === undefined) wo.costPerHour = 0;
    if (!Array.isArray(wo.materialRequirements)) wo.materialRequirements = [];
    if (!Array.isArray(wo.scrapMaterials)) wo.scrapMaterials = [];
    if (!wo.qcRecordId) wo.qcRecordId = '';
    if (!Array.isArray(wo.timeLogs)) wo.timeLogs = [];
    if (!wo.createdAt) wo.createdAt = new Date().toISOString();
    if (!wo.startedAt) wo.startedAt = '';
    if (!wo.completedAt) wo.completedAt = '';
  });

  if (!omni.migrationsApplied.includes('work_orders_v2')) {
    omni.migrationsApplied.push('work_orders_v2');
  }
}

function startWorkOrder(woId, operatorId = '', operatorName = '') {
  ensureOmni();
  const wo = (omni.workOrders || []).find(w => w.id === woId);
  if (!wo) return showToast('أمر العمل غير موجود', 'error');

  wo.status = 'progress';
  wo.startedAt = wo.startedAt || new Date().toISOString();
  wo.operatorId = operatorId;
  wo.operatorName = operatorName;
  wo.timeLogs.push({
    startTime: new Date().toISOString(),
    endTime: '',
    pauseReason: '',
    operatorId: operatorId
  });

  if (wo.cardId) {
    const card = (omni.kanban.cards || []).find(c => c.id === wo.cardId);
    if (card && card.columnId === 'kb_ready') {
      card.columnId = 'kb_progress';
      card.activityLog.push({ date: new Date().toISOString(), text: 'تم بدء العمل على البطاقة بالتزامن مع أمر العمل' });
    }
  }

  if (wo.machineId) {
    const mach = getMachineById(wo.machineId);
    if (mach) {
      mach.status = 'working';
      const qEntry = (mach.queue || []).find(q => q.workOrderId === woId);
      if (qEntry) qEntry.status = 'working';
    }
  }

  addOmniSystemLog({ action: 'work_order_started', message: `تم بدء أمر العمل: ${wo.title}`, page: 'op_packs', entityType: 'work_order', entityId: woId, severity: 'info' });
  saveData();
  if (currentPage === 'op_packs') renderOpPacks();
}

function pauseWorkOrder(woId, reason = '') {
  ensureOmni();
  const wo = (omni.workOrders || []).find(w => w.id === woId);
  if (!wo) return showToast('أمر العمل غير موجود', 'error');

  wo.status = 'pause';

  const activeLog = wo.timeLogs.find(l => !l.endTime);
  if (activeLog) {
    activeLog.endTime = new Date().toISOString();
    activeLog.pauseReason = reason || 'إيقاف مؤقت عام';

    const durationMs = new Date(activeLog.endTime) - new Date(activeLog.startTime);
    const durationMins = Math.round(durationMs / 1000 / 60);
    wo.actualMinutes = (wo.actualMinutes || 0) + Math.max(1, durationMins);
  }

  if (wo.machineId) {
    const mach = getMachineById(wo.machineId);
    if (mach) {
      mach.status = 'idle';
      const qEntry = (mach.queue || []).find(q => q.workOrderId === woId);
      if (qEntry) qEntry.status = 'paused';
    }
  }

  addOmniSystemLog({ action: 'work_order_paused', message: `تم إيقاف أمر العمل مؤقتاً: ${wo.title}. السبب: ${reason}`, page: 'op_packs', entityType: 'work_order', entityId: woId, severity: 'warning' });
  saveData();
  if (currentPage === 'op_packs') renderOpPacks();
}

function createQcRecordFromCard(card, batchNum) {
  ensureOmni();
  const qc = {
    id: makeId('qc'),
    title: `فحص جودة: ${card.title}`,
    cardId: card.id,
    type: card.tags[0] || 'تصنيع',
    status: 'pending',
    result: 'pending',
    notes: `تم التوليد تلقائياً بعد إتمام أمر العمل المربوط.`,
    createdAt: new Date().toISOString(),
    completedAt: '',
    testedBy: '',
    sopId: card.sopIds[0] || '',
    machineId: card.machineIds[0] || '',
    batchNumber: batchNum || '',
    materials: (card.materialRequirements || []).map(m => m.materialId),
    laborCost: 0,
    materialCost: 0,
    machineCost: 0,
    costImpact: 0,
    estimatedReworkMinutes: 30,
    activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء سجل الفحص تلقائياً بعد إتمام العمل' }]
  };
  if (!Array.isArray(omni.qcRecords)) omni.qcRecords = [];
  omni.qcRecords.unshift(qc);

  createOmniNotification({
    type: 'qc',
    title: 'طلب فحص جودة جديد',
    message: `يرجى فحص الشغل لـ ${card.title}`,
    sourcePage: 'qc_center',
    sourceType: 'qc',
    sourceId: qc.id,
    severity: 'info'
  });
}

function completeWorkOrder(woId, actualMinsOverride = null) {
  ensureOmni();
  const wo = (omni.workOrders || []).find(w => w.id === woId);
  if (!wo) return showToast('أمر العمل غير موجود', 'error');

  const activeLog = wo.timeLogs.find(l => !l.endTime);
  if (activeLog) {
    activeLog.endTime = new Date().toISOString();
    const durationMs = new Date(activeLog.endTime) - new Date(activeLog.startTime);
    const durationMins = Math.round(durationMs / 1000 / 60);
    wo.actualMinutes = (wo.actualMinutes || 0) + Math.max(1, durationMins);
  }

  if (actualMinsOverride !== null) {
    wo.actualMinutes = Number(actualMinsOverride) || 0;
  }

  wo.status = 'done';
  wo.completedAt = new Date().toISOString();

  wo.materialRequirements.forEach(req => {
    releaseMaterialReservation(req.materialId, req.qty, 'op_pack', wo.opPackId);

    const mat = getMaterialById(req.materialId);
    if (mat) {
      mat.stock = Math.max(0, mat.stock - req.qty);
      recordStockMovement(req.materialId, 'out', req.qty, {
        sourceType: 'work_order',
        sourceId: wo.id,
        ref: `مستهلك في أمر عمل ${wo.id}`,
        note: `تم استهلاك المواد عند إتمام الشغل`
      });
    }
  });

  if (wo.machineId) {
    const mach = getMachineById(wo.machineId);
    if (mach) {
      mach.hoursTotal = (mach.hoursTotal || 0) + (wo.actualMinutes / 60);
      mach.status = 'idle';
      mach.queue = (mach.queue || []).filter(q => q.workOrderId !== woId);
    }
  }

  if (wo.cardId) {
    const card = (omni.kanban.cards || []).find(c => c.id === wo.cardId);
    if (card) {
      card.columnId = 'kb_done';
      card.activityLog.push({ date: new Date().toISOString(), text: `أمر العمل المربوط اكتمل. الوقت الفعلي: ${wo.actualMinutes} دقيقة` });

      if (card.requiresQc) {
        const batchNum = `B-${Date.now().toString(36).toUpperCase()}`;
        createQcRecordFromCard(card, batchNum);
      }
    }
  }

  if (wo.cardId) {
    const parentCard = (omni.kanban.cards || []).find(c => c.id === wo.cardId);
    if (parentCard && parentCard.operationPackId) {
      const runCards = (omni.kanban.cards || []).filter(c =>
        c.operationPackId === parentCard.operationPackId &&
        c.clientName === parentCard.clientName &&
        c.dueDate === parentCard.dueDate
      );

      const parentOpPack = (omni.opPacks || []).find(p => p.id === parentCard.operationPackId);
      if (parentOpPack) {
        const currentIndex = parentOpPack.steps.findIndex(s => s.id === parentCard.operationPackStepId);
        if (currentIndex !== -1 && currentIndex < parentOpPack.steps.length - 1) {
          const nextStep = parentOpPack.steps[currentIndex + 1];
          const nextCard = runCards.find(c => c.operationPackStepId === nextStep.id);
          if (nextCard && nextCard.columnId === 'kb_backlog') {
            nextCard.columnId = 'kb_ready';
            nextCard.activityLog.push({ date: new Date().toISOString(), text: 'تم التنشيط التلقائي بعد إتمام الخطوة السابقة' });

            const nextWo = (omni.workOrders || []).find(w => w.cardId === nextCard.id);
            if (nextWo && nextWo.status === 'draft') {
              nextWo.status = 'ready';
            }
          }
        }
      }
    }
  }

  addOmniSystemLog({ action: 'work_order_completed', message: `اكتمل أمر العمل: ${wo.title}. الوقت الفعلي: ${wo.actualMinutes} د.`, page: 'op_packs', entityType: 'work_order', entityId: woId, severity: 'success' });
  saveData();
  if (currentPage === 'op_packs') renderOpPacks();
}

function logWorkOrderScrap(woId, materialId, qty, reason = '') {
  ensureOmni();
  const wo = (omni.workOrders || []).find(w => w.id === woId);
  if (!wo) return showToast('أمر العمل غير موجود', 'error');

  const qtyVal = Number(qty) || 0;
  if (qtyVal <= 0) return showToast('يرجى إدخال كمية صالحة للتالف', 'warning');

  const mat = getMaterialById(materialId);
  if (!mat) return showToast('المادة غير موجودة', 'error');

  wo.scrapMaterials.push({
    materialId: materialId,
    materialName: mat.name,
    qty: qtyVal,
    unit: mat.unit || '',
    cost: mat.cost || 0,
    reason: reason || 'تالف أثناء التشغيل'
  });

  mat.stock = Math.max(0, mat.stock - qtyVal);
  recordStockMovement(materialId, 'out', qtyVal, {
    sourceType: 'work_order_scrap',
    sourceId: wo.id,
    ref: `تالف في أمر عمل ${wo.id}`,
    note: `هدر/تالف أثناء التصنيع: ${reason}`
  });

  addOmniSystemLog({ action: 'work_order_scrap_logged', message: `تم تسجيل تالف في أمر العمل ${wo.title}: ${mat.name} × ${qtyVal}`, page: 'op_packs', entityType: 'work_order', entityId: woId, severity: 'warning' });
  saveData();
  if (currentPage === 'op_packs') renderOpPacks();
}

function getMrpAiSchedulingRecommendations() {
  ensureOmni();
  const wos = omni.workOrders || [];
  const activeWos = wos.filter(w => ['ready', 'draft'].includes(w.status));
  const machines = omni.machines || [];

  const recs = [];

  machines.forEach(m => {
    const qCount = (m.queue || []).filter(q => q.status === 'queued').length;
    if (qCount > 3) {
      const alt = machines.find(other => other.id !== m.id && other.name.substring(0, 5) === m.name.substring(0, 5) && (other.queue || []).length <= 1);
      if (alt) {
        const woToMove = activeWos.find(w => w.machineId === m.id);
        if (woToMove) {
          recs.push({
            type: 'bottleneck',
            text: `الماكينة "${m.name}" تواجه ضغطاً كبيراً (${qCount} بانتظار العمل). نقترح إعادة توجيه أمر عمل "${woToMove.title}" للماكينة البديلة "${alt.name}".`,
            woId: woToMove.id,
            targetMachineId: alt.id,
            targetMachineName: alt.name
          });
        }
      }
    }
  });

  const opCounts = {};
  activeWos.forEach(w => {
    if (w.operatorName) {
      opCounts[w.operatorName] = (opCounts[w.operatorName] || 0) + 1;
    }
  });

  Object.entries(opCounts).forEach(([opName, count]) => {
    if (count > 2) {
      const employees = omni.employees || [];
      const freeEmp = employees.find(e => {
        const activeCount = activeWos.filter(w => w.operatorName === e.name).length;
        return activeCount === 0;
      });
      if (freeEmp) {
        const woToMove = activeWos.find(w => w.operatorName === opName);
        if (woToMove) {
          recs.push({
            type: 'operator_overload',
            text: `المشغل "${opName}" لديه عبء مرتفع (${count} مهام نشطة). نقترح إسناد مهمة "${woToMove.title}" للمشغل الحر "${freeEmp.name}".`,
            woId: woToMove.id,
            targetOperatorId: freeEmp.id,
            targetOperatorName: freeEmp.name
          });
        }
      }
    }
  });

  return recs;
}

window.applyMrpAiScheduling = function() {
  ensureOmni();
  const recs = getMrpAiSchedulingRecommendations();
  if (recs.length === 0) return showToast('لا توجد توصيات جدولة قابلة للتطبيق حالياً', 'info');

  let appliedCount = 0;
  recs.forEach(r => {
    const wo = (omni.workOrders || []).find(w => w.id === r.woId);
    if (!wo) return;

    if (r.type === 'bottleneck' && r.targetMachineId) {
      const oldMach = getMachineById(wo.machineId);
      if (oldMach) {
        oldMach.queue = (oldMach.queue || []).filter(q => q.workOrderId !== wo.id);
      }

      wo.machineId = r.targetMachineId;
      const newMach = getMachineById(r.targetMachineId);
      if (newMach) {
        newMach.queue.push({
          sourceType: 'op_pack',
          sourceId: wo.opPackId,
          cardId: wo.cardId,
          workOrderId: wo.id,
          title: wo.title,
          estimatedMinutes: wo.plannedMinutes,
          status: 'queued'
        });
        if (newMach.operator) {
          wo.operatorName = newMach.operator;
        }
      }
      appliedCount++;
    } else if (r.type === 'operator_overload' && r.targetOperatorName) {
      wo.operatorId = r.targetOperatorId;
      wo.operatorName = r.targetOperatorName;
      appliedCount++;
    }
  });

  saveData();
  showToast(`تم تطبيق ${appliedCount} من توصيات الجدولة الذكية بنجاح`, 'success');
  renderOpPacks();
};
