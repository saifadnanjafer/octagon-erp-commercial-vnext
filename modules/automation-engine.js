// ═══════════════════════════════════════════════════
// UPGRADED AUTOMATION ENGINE V2 (CLICKUP/ASANA GRADE)
// ═══════════════════════════════════════════════════

let omniActiveAutomationTab = 'rules';
let omniSelectedSimRule = '';
let omniSelectedSimPreset = 'stuck_card';
let omniSimulationConsoleLogs = [];

function normalizeAutomation() {
  if (!omni || typeof omni !== 'object') omni = {};
  if (!Array.isArray(omni.automationRules)) {
    omni.automationRules = [
      {
        id: 'rule_stuck_kanban',
        name: 'تصعيد بطاقات الكانبان العالقة',
        event: 'KANBAN_CARD_STUCK',
        conditions: [
          { field: 'priority', operator: 'ne', value: 'Urgent' }
        ],
        action: 'flag_anomaly',
        actionValue: 'بطاقة كانبان عالقة لأكثر من 24 ساعة في الإنتاج',
        active: true,
        successCount: 0,
        failCount: 0,
        consecutiveErrors: 0,
        lastFired: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule_low_stock',
        name: 'تنبيه نقص المواد الخام في المخزن',
        event: 'MATERIAL_LOW_STOCK',
        conditions: [
          { field: 'stock', operator: 'lt', value: 'minimum' }
        ],
        action: 'notify',
        actionValue: 'تحذير: نقص حرج في المواد الخام بالمخزن المالي',
        active: true,
        successCount: 0,
        failCount: 0,
        consecutiveErrors: 0,
        lastFired: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule_quote_created_task',
        name: 'متابعة إعداد عرض سعر جديد',
        event: 'QUOTE_CREATED',
        conditions: [],
        action: 'create_task',
        actionValue: 'متابعة إعداد وتدقيق تفاصيل عرض السعر الجديد وتجهيز الرسومات',
        active: true,
        successCount: 0,
        failCount: 0,
        consecutiveErrors: 0,
        lastFired: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'rule_machine_overload',
        name: 'تنبيه الأحمال الزائدة على ماكينات CNC',
        event: 'MACHINE_OVERLOADED',
        conditions: [
          { field: 'totalMinutes', operator: 'gt', value: '240' }
        ],
        action: 'notify_supervisor',
        actionValue: 'تنبيه: حمل عمل الماكينة تجاوز 4 ساعات، يرجى إعادة توزيع المهام',
        active: true,
        successCount: 0,
        failCount: 0,
        consecutiveErrors: 0,
        lastFired: null,
        createdAt: new Date().toISOString()
      }
    ];
  }
  if (!Array.isArray(omni.automationFireLog)) {
    omni.automationFireLog = [];
  }

  // Ensure health fields exist for all rules
  omni.automationRules.forEach(rule => {
    if (rule.successCount === undefined) rule.successCount = 0;
    if (rule.failCount === undefined) rule.failCount = 0;
    if (rule.consecutiveErrors === undefined) rule.consecutiveErrors = 0;
    if (rule.lastFired === undefined) rule.lastFired = null;
  });
}

function triggerOmniEvent(eventType, eventData) {
  ensureOmni();
  normalizeAutomation();

  console.log(`[AUTOMATION] Event triggered: "${eventType}"`, eventData);

  const activeRules = (omni.automationRules || []).filter(rule =>
    rule.active && (rule.event === eventType || rule.event === '*')
  );

  activeRules.forEach(rule => {
    let match = true;
    if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
      for (const cond of rule.conditions) {
        if (!evaluateRuleCondition(eventData, cond)) {
          match = false;
          break;
        }
      }
    }

    if (match) {
      fireAutomationRule(rule, eventType, eventData);
    }
  });
}

function evaluateRuleCondition(data, condition) {
  if (!data || !condition) return false;

  let val = data[condition.field];
  if (val === undefined && data.card) val = data.card[condition.field];
  if (val === undefined && data.material) val = data.material[condition.field];
  if (val === undefined && data.task) val = data.task[condition.field];
  if (val === undefined && data.machine) val = data.machine[condition.field];
  if (val === undefined && data.request) val = data.request[condition.field];
  if (val === undefined && data.whatsappSuggestion) val = data.whatsappSuggestion[condition.field];

  let targetVal = condition.value;

  if (condition.field === 'stock' && targetVal === 'minimum' && data.material) {
    targetVal = Number(data.material.minimum) || 0;
  }

  let numVal = Number(val);
  let numTarget = Number(targetVal);
  const isNumeric = !isNaN(numVal) && !isNaN(numTarget) && val !== '' && targetVal !== '';

  const op = condition.operator;
  if (op === 'eq') return isNumeric ? numVal === numTarget : String(val) === String(targetVal);
  if (op === 'ne') return isNumeric ? numVal !== numTarget : String(val) !== String(targetVal);
  if (op === 'gt') return isNumeric ? numVal > numTarget : String(val) > String(targetVal);
  if (op === 'gte') return isNumeric ? numVal >= numTarget : String(val) >= String(targetVal);
  if (op === 'lt') return isNumeric ? numVal < numTarget : String(val) < String(targetVal);
  if (op === 'lte') return isNumeric ? numVal <= numTarget : String(val) <= String(targetVal);
  if (op === 'in') {
    const list = String(targetVal).split(',').map(s => s.trim());
    return list.includes(String(val));
  }
  if (op === 'contains') {
    return String(val).toLowerCase().includes(String(targetVal).toLowerCase());
  }

  return false;
}

function fireAutomationRule(rule, eventType, eventData) {
  ensureOmni();

  const logEntry = {
    id: makeId('fire'),
    ruleId: rule.id,
    ruleName: rule.name,
    event: eventType,
    firedAt: new Date().toISOString(),
    status: 'success',
    details: 'تم تشغيل القاعدة بنجاح.'
  };

  rule.lastFired = logEntry.firedAt;

  try {
    const action = rule.action;
    const value = rule.actionValue;

    if (action === 'notify') {
      showToast(`${rule.name}: ${value}`, 'info');
      addSystemNotificationDirect(rule.name, value, eventData);
    }
    else if (action === 'flag_anomaly') {
      const ref = eventData.card?.title || eventData.material?.name || eventData.task?.title || eventData.machine?.name || 'كيان مجهول';
      recordAuditEvent('ANOMALY_FLAG', rule.name, `[${ref}] تم رصد شذوذ تشغيلي: ${value}`, 'محرك الأتمتة');
      showToast(`تم تسجيل شذوذ تشغيلي: ${rule.name}`, 'warning');

      if (eventType === 'KANBAN_CARD_STUCK' && eventData.card) {
        eventData.card.priority = 'Urgent';
        if (!eventData.card.tags) eventData.card.tags = [];
        if (!eventData.card.tags.includes('Escalated')) eventData.card.tags.push('Escalated');
        if (!Array.isArray(eventData.card.activityLog)) eventData.card.activityLog = [];
        eventData.card.activityLog.push({
          date: new Date().toISOString(),
          text: `تم التصعيد التلقائي بواسطة قاعدة الأتمتة: ${rule.name}`
        });
      }
    }
    else if (action === 'trigger_scan') {
      showToast(`بدء فحص صحة النظام التلقائي بطلب من القاعدة: ${rule.name}`, 'info');
      if (typeof runManualAuditScan === 'function') {
        setTimeout(runManualAuditScan, 500);
      }
    }
    else if (action === 'create_task') {
      const task = createTaskInSelectedSpace(value || rule.name, {
        sourceType: 'automation_rule',
        sourceId: rule.id,
        priority: 'normal',
        department: 'الأتمتة',
        description: `مهمة مضافة تلقائياً بواسطة قاعدة الأتمتة [${rule.name}] ناتجة عن حدث [${eventType}].`
      });
      showToast(`تم إنشاء مهمة تلقائية: ${task.title}`, 'success');
      if (typeof renderTaskManager === 'function') renderTaskManager();
    }
    else if (action === 'create_request') {
      // Gated to Command Center Requests review queue
      const req = createOmniRequest({
        type: 'general',
        title: `طلب مراجع: ${rule.name}`,
        description: value || `طلب موافقة تلقائي ناتج عن قاعدة الأتمتة [${rule.name}] للحدث [${eventType}].`,
        requesterName: 'الأتمتة التلقائية',
        sourcePage: 'automation',
        sourceType: 'automation_rule',
        sourceId: rule.id,
        priority: 'normal'
      });
      showToast(`تم إرسال طلب مراجعة إلى مركز القيادة: ${req.title}`, 'success');
      if (typeof renderCommandCenter === 'function') renderCommandCenter();
    }
    else if (action === 'notify_supervisor') {
      showToast(`تنبيه المشرف: ${value}`, 'warning');
      createOmniNotification({
        type: 'system',
        title: `تنبيه المشرف: ${rule.name}`,
        message: value,
        severity: 'warning',
        sourcePage: 'automation',
        sourceType: 'automation_rule',
        sourceId: rule.id
      });
    }
    else if (action === 'propose_purchase') {
      // Gated to Command Center review queue
      const req = createOmniRequest({
        type: 'purchase',
        title: `مقترح شراء تلقائي: ${rule.name}`,
        description: value || `طلب مراجعة شراء مخزون ناتج عن حدث الأتمتة [${eventType}].`,
        requesterName: 'الأتمتة التلقائية',
        sourcePage: 'automation',
        sourceType: 'automation_rule',
        sourceId: rule.id,
        priority: 'high'
      });
      showToast(`تم إرسال مقترح الشراء للمراجعة: ${req.title}`, 'success');
      if (typeof renderCommandCenter === 'function') renderCommandCenter();
    }
    else if (action === 'schedule_inspection') {
      const qcTitle = `فحص جودة مجدول: ${rule.name}`;
      let cardId = eventData.card?.id || '';
      const qc = {
        id: makeId('qc'),
        title: qcTitle,
        type: 'فحص جودة مجدول',
        status: 'pending',
        result: 'pending',
        sourceType: cardId ? 'kanban_card' : 'automation',
        sourceId: cardId || rule.id,
        cardId: cardId,
        department: eventData.card?.department || 'الجودة',
        inspector: 'قسم الجودة',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        failureReason: '',
        reason: value || 'مطلوب فحص جودة مبرمج تلقائياً',
        severity: 'medium',
        reworkStatus: 'none',
        costImpact: 0,
        reworkCost: 0,
        checklist: [],
        activityLog: [{ date: new Date().toISOString(), text: 'تمت جدولة الفحص بواسطة قاعدة الأتمتة' }]
      };
      omni.qcRecords = omni.qcRecords || [];
      omni.qcRecords.push(qc);
      if (cardId) {
        const card = (omni.kanban.cards || []).find(c => c.id === cardId);
        if (card) {
          card.qcRecordIds = card.qcRecordIds || [];
          if (!card.qcRecordIds.includes(qc.id)) card.qcRecordIds.push(qc.id);
        }
      }
      showToast(`تمت جدولة فحص جودة جديد: ${qcTitle}`, 'success');
      if (typeof renderQcCenter === 'function') renderQcCenter();
    }
    else if (action === 'trigger_ai_analysis') {
      // AI analysis action is Gated - writes to Command Center approval queue
      const req = createOmniRequest({
        type: 'ai_analysis',
        title: `تحليل ذكي مطلوب: ${rule.name}`,
        description: value || `مطلوب إجراء تحليل ذكي بواسطة AI للحدث [${eventType}].`,
        requesterName: 'الأتمتة التلقائية',
        sourcePage: 'automation',
        sourceType: 'automation_rule',
        sourceId: rule.id,
        priority: 'normal',
        payload: {
          ruleId: rule.id,
          eventType,
          eventData
        }
      });
      showToast(`تم إرسال طلب تحليل AI إلى طابور مركز القيادة: ${req.title}`, 'success');
      if (typeof renderCommandCenter === 'function') renderCommandCenter();
    }

    rule.successCount++;
    rule.consecutiveErrors = 0; // reset consecutive errors
    logEntry.details = `تم تنفيذ الإجراء [${action}] بنجاح بقيمة [${value}].`;
  } catch (err) {
    rule.failCount++;
    rule.consecutiveErrors++;
    logEntry.status = 'error';
    logEntry.details = `خطأ أثناء تنفيذ إجراء القاعدة: ${err.message}`;
    console.error(err);

    // Fail-safe automatic rule disabling after 3 consecutive errors
    if (rule.consecutiveErrors >= 3) {
      rule.active = false;
      logEntry.details += ' (تم تعطيل القاعدة تلقائياً لمنع تكرر الأخطاء).';
      recordAuditEvent('RULE_AUTO_DISABLED', rule.name, `تم إيقاف قاعدة الأتمتة [${rule.name}] تلقائياً بعد تسجيل 3 أخطاء متتالية.`, 'محرك الأتمتة');
      createOmniNotification({
        type: 'system',
        title: 'تعطيل قاعدة أتمتة تلقائياً',
        message: `تم تعطيل القاعدة [${rule.name}] بسبب تكرر الأخطاء الفنية.`,
        severity: 'danger',
        sourcePage: 'automation',
        sourceType: 'automation_rule',
        sourceId: rule.id
      });
      showToast(`تم تعطيل القاعدة [${rule.name}] تلقائياً بسبب الأخطاء`, 'error');
    }
  }

  omni.automationFireLog = omni.automationFireLog || [];
  omni.automationFireLog.unshift(logEntry);
  if (omni.automationFireLog.length > 500) {
    omni.automationFireLog.pop();
  }

  saveData(true);

  if (currentPage === 'automation') {
    renderAutomationEngine();
  }
}

function addSystemNotificationDirect(title, message, eventData) {
  createOmniNotification({
    type: 'system',
    title: title,
    message: message,
    severity: 'info',
    sourcePage: eventData.card ? 'kanban' : (eventData.material ? 'inventory' : (eventData.task ? 'task_manager' : 'automation')),
    sourceType: eventData.card ? 'kanban_card' : (eventData.material ? 'material' : (eventData.task ? 'task' : 'automation_rule')),
    sourceId: eventData.card?.id || eventData.material?.id || eventData.task?.id || ''
  });
}

function runRuleSimulation(ruleId, eventType, mockData) {
  const rule = (omni.automationRules || []).find(r => r.id === ruleId);
  if (!rule) return { success: false, logs: ['[ERROR] Rule not found.'] };

  const logs = [];
  logs.push(`[SIM] بدء محاكاة القاعدة: "${rule.name}"`);
  logs.push(`[SIM] الحدث المحفز: "${eventType}"`);

  if (rule.event !== eventType && rule.event !== '*') {
    logs.push(`[SIM] [ERROR] فشل تطابق الحدث. القاعدة تنتظر: "${rule.event}" والحدث الفعلي: "${eventType}". تم إنهاء المحاكاة.`);
    return { success: false, logs };
  }

  let match = true;
  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    for (const cond of rule.conditions) {
      const res = evaluateRuleCondition(mockData, cond);
      logs.push(`[SIM] تدقيق الشرط: ${cond.field} ${cond.operator} "${cond.value}" => ${res ? 'ناجح (PASSED)' : 'فاشل (FAILED)'}`);
      if (!res) {
        match = false;
        break;
      }
    }
  } else {
    logs.push('[SIM] لا توجد شروط مطابقة إضافية.');
  }

  if (!match) {
    logs.push('[SIM] [WARNING] لم تطابق الشروط. القاعدة لن يتم تشغيلها في الإنتاج.');
    return { success: false, logs };
  }

  logs.push('[SIM] [SUCCESS] تطابقت جميع شروط القاعدة بنجاح.');
  logs.push(`[SIM] الإجراء المجدول: [${rule.action}] بقيمة [${rule.actionValue}]`);

  // Sandbox actions log
  if (rule.action === 'notify') {
    logs.push('[ACTION] [SAFE] سيقوم النظام بإرسال إشعار فوري وعرض Toast.');
  } else if (rule.action === 'flag_anomaly') {
    logs.push('[ACTION] [SAFE] سيقوم النظام بتسجيل شذوذ تشغيلي في السجل وسحب بطاقة الكانبان للتصعيد.');
  } else if (rule.action === 'trigger_scan') {
    logs.push('[ACTION] [SAFE] سيقوم النظام بتشغيل فحص تدقيق فوري للمخزون والبطاقات العالقة.');
  } else if (rule.action === 'create_task') {
    logs.push('[ACTION] [SAFE] سيقوم النظام بإنشاء مهمة عمل مباشرة في طابور إدارة المهام.');
  } else if (rule.action === 'create_request') {
    logs.push('[ACTION] [GATED] سياسة حماية! سيقوم النظام بإرسال طلب مراجعة لمركز القيادة لموافقة المدير.');
  } else if (rule.action === 'notify_supervisor') {
    logs.push('[ACTION] [SAFE] سيقوم النظام بتوجيه تنبيه ذو خطورة عالية إلى هاتف/لوحة المشرف.');
  } else if (rule.action === 'propose_purchase') {
    logs.push('[ACTION] [GATED] سياسة حماية! سيتم إنشاء مسودة مقترح شراء في طابور مركز القيادة بانتظار الاعتماد.');
  } else if (rule.action === 'schedule_inspection') {
    logs.push('[ACTION] [SAFE] سيقوم النظام بجدولة نموذج فحص جودة جديد وإسناده للمفتش.');
  } else if (rule.action === 'trigger_ai_analysis') {
    logs.push('[ACTION] [GATED] سياسة حماية AI! سيقوم النظام بإنشاء طلب تحليل ذكي في مركز القيادة للموافقة عليه قبل التحليل.');
  }

  logs.push('[SIM] اكتملت المحاكاة التشريحية بنجاح!');
  return { success: true, logs };
}

let automationSearchQuery = '';
let automationEventFilter = 'all';


function handleAutomationSearchInput(val) {
  automationSearchQuery = val;
  renderAutomationRulesContainer();
}

function handleAutomationEventFilterChange(val) {
  automationEventFilter = val;
  renderAutomationRulesContainer();
}

function renderAutomationRulesContainer() {
  const container = document.querySelector('.auto-rule-list, .automation-rule-grid');
  if (container) {
    container.innerHTML = renderAutomationRules();
  }
}

function renderAutomationRules() {
  ensureOmni();
  normalizeAutomation();

  let rules = omni.automationRules || [];

  if (automationSearchQuery) {
    rules = rules.filter(r => r.name.toLowerCase().includes(automationSearchQuery.toLowerCase()));
  }

  if (automationEventFilter !== 'all') {
    rules = rules.filter(r => r.event === automationEventFilter);
  }

  if (rules.length === 0) {
    return `<div class="task-empty-state-card" style="padding: 20px;"><h4>لا توجد قواعد أتمتة مطابقة</h4></div>`;
  }

  const eventLabels = {
    KANBAN_CARD_STUCK: 'بطاقة كانبان عالقة > 24 ساعة',
    MATERIAL_LOW_STOCK: 'نقص المخزون عن الحد الأدنى',
    MATERIAL_BELOW_MINIMUM: 'نقص المخزون عن الحد الأدنى',
    TASK_COMPLETED: 'اكتمال مهمة في مدير المهام',
    QC_FAILED: 'فشل فحص الجودة',
    QUOTE_CREATED: 'إنشاء عرض سعر / بطاقة',
    ORDER_OVERDUE: 'تأخر الطلبية عن الموعد',
    MACHINE_OVERLOADED: 'تحميل زائد على الماكينة (> 240 د)',
    QC_REPEATED_FAIL: 'تكرار فشل الجودة (>= 2 مرات)',
    EMPLOYEE_REQUEST_APPROVED: 'موافقة طلب الموظف (إجازات/سلف)',
    WHATSAPP_APPROVED: 'اعتماد واعتراض اقتراح WhatsApp',
    '*': 'أي حدث تشغيلي'
  };

  const actionLabels = {
    notify: 'إرسال إشعار للنظام',
    flag_anomaly: 'تسجيل شذوذ تشغيلي',
    trigger_scan: 'بدء فحص صحة النظام',
    create_task: 'إنشاء مهمة عمل جديدة',
    create_request: 'طلب موافقة المدير (CC)',
    notify_supervisor: 'تنبيه المشرف مباشرة',
    propose_purchase: 'اقتراح طلب شراء',
    schedule_inspection: 'جدولة فحص جودة',
    trigger_ai_analysis: 'تحليل AI الذكي (Gated)'
  };

  return rules.map(rule => {
    const conditionsHtml = (rule.conditions || []).map(c => {
      const opLabels = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'في', contains: 'يشتمل على' };
      const fieldAr = { priority: 'الأولوية', stock: 'المخزون', totalMinutes: 'وقت العملية', status: 'الحالة', type: 'النوع', amount: 'المبلغ', score: 'النقاط', risk: 'المخاطر', count: 'العدد' };
      const valAr = { Urgent: 'عاجل', High: 'عالي', Normal: 'عادي', Low: 'منخفض', minimum: 'الحد الأدنى', operational: 'تعمل', idle: 'خامل', maintenance: 'صيانة', offline: 'غير متصل' };
      const fieldLabel = fieldAr[c.field] || c.field;
      const valLabel = valAr[c.value] || c.value;
      return `<span>${escapeHtml(fieldLabel)} <b>${opLabels[c.operator] || c.operator}</b> "${escapeHtml(valLabel)}"</span>`;
    }).join(' و ') || '<span class="muted">بدون شروط إضافية</span>';

    const isAutoDisabled = !rule.active && rule.consecutiveErrors >= 3;
    const healthBadge = isAutoDisabled
      ? '<span class="health-badge health-badge-danger" style="margin-right:8px;">تعطل تلقائي (أخطاء)</span>'
      : (rule.active ? '<span class="health-badge health-badge-success" style="margin-right:8px;">نشط</span>' : '<span class="health-badge health-badge-disabled" style="margin-right:8px;">معطل</span>');

    return `
      <div class="automation-rule-card ${rule.active ? '' : 'is-paused'}" style="display:flex; flex-direction:column; justify-content:space-between; min-height: 200px;">
        <div>
          <div class="automation-rule-head">
            <h3 style="display:flex; align-items:center; gap:8px; width:100%; justify-content:space-between;">
              <span>${escapeHtml(rule.name)}</span>
              ${healthBadge}
            </h3>
            <div style="display:flex; align-items:center; gap:4px; margin-top:8px;">
              <button class="btn-secondary" style="font-size:11px;padding:2px 8px;" onclick="testFireAutomationRule('${rule.id}')">اختبار</button>
              <button class="btn-secondary" style="font-size:11px;padding:2px 8px;" onclick="editAutomationRule('${rule.id}')">تعديل</button>
              <button class="btn-secondary" style="font-size:11px;padding:2px 8px;background:var(--danger);color:white;" onclick="deleteAutomationRule('${rule.id}')">حذف</button>
            </div>
          </div>
          <div class="automation-rule-pattern" style="margin-top:12px;">
            عند حدوث: <code>${eventLabels[rule.event] || rule.event}</code>
          </div>
          <div class="automation-condition-list" style="margin-top:6px;">
            شروط المطابقة: ${conditionsHtml}
          </div>
        </div>

        <div style="margin-top:16px;">
          <div class="automation-rule-foot" style="border-top: 1px solid rgba(148,163,184,0.08); padding-top:10px; margin-bottom:8px;">
            <span class="automation-action-chip automation-action-${rule.action}">${actionLabels[rule.action] || rule.action}: "${escapeHtml(rule.actionValue || 'إجراء بدون نص')}"</span>
            <label class="automation-check" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${rule.active ? 'checked' : ''} onchange="toggleAutomationRuleActive('${rule.id}')">
              <span>نشط</span>
            </label>
          </div>
          <div style="font-size:11px; color:var(--text-muted); display:flex; gap:10px; flex-wrap:wrap;">
            <span>تشغيلات ناجحة: ${rule.successCount || 0}</span>
            <span style="${rule.failCount > 0 ? 'color:var(--danger)' : ''}">فشل: ${rule.failCount || 0}</span>
            <span>آخر تشغيل: ${rule.lastFired ? new Date(rule.lastFired).toLocaleDateString() : 'لم يشغل بعد'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAutomationFireLog() {
  ensureOmni();
  normalizeAutomation();

  const logs = omni.automationFireLog || [];
  if (logs.length === 0) {
    return `<div class="task-empty-state-card" style="padding: 20px;"><h4>سجل تشغيل العمليات فارغ حالياً</h4></div>`;
  }

  return logs.map(log => {
    const isError = log.status === 'error';
    const timeStr = new Date(log.firedAt).toLocaleTimeString();
    const dateStr = new Date(log.firedAt).toLocaleDateString();

    return `
      <div class="automation-fire-row ${isError ? 'automation-fire-error' : ''}" style="margin-bottom:8px;">
        <div>
          <b>${escapeHtml(log.ruleName)}</b>
          <p>${escapeHtml(log.details)}</p>
        </div>
        <div style="text-align:left; flex-shrink:0;">
          <span class="task-priority-chip" style="--chip-color: ${isError ? 'var(--danger)' : 'var(--success)'}">${log.status === 'success' ? 'نجاح' : 'خطأ'}</span>
          <small style="display:block;margin-top:4px;color:var(--text-muted);">${dateStr} ${timeStr}</small>
        </div>
      </div>
    `;
  }).join('');
}

function renderAutomationHealthAndPoliciesContent() {
  ensureOmni();
  normalizeAutomation();

  // Health cards
  const healthCardsHtml = omni.automationRules.map(rule => {
    const isAutoDisabled = !rule.active && rule.consecutiveErrors >= 3;
    const statusText = isAutoDisabled ? 'متعطل (أخطاء متتالية)' : (rule.active ? 'سليم ونشط' : 'معطل يدوياً');
    const badgeClass = isAutoDisabled ? 'health-badge-danger' : (rule.active ? 'health-badge-success' : 'health-badge-disabled');

    return `
      <div class="automation-health-card">
        <div class="automation-health-card-head">
          <h4>${escapeHtml(rule.name)}</h4>
          <span class="health-badge ${badgeClass}">${statusText}</span>
        </div>
        <div class="health-stat-row">
          <span>مجموع محاولات التشغيل</span>
          <b>${(rule.successCount || 0) + (rule.failCount || 0)}</b>
        </div>
        <div class="health-stat-row">
          <span>تشغيلات ناجحة</span>
          <b style="color:var(--success)">${rule.successCount || 0}</b>
        </div>
        <div class="health-stat-row">
          <span>فشل تشغيلي</span>
          <b style="${rule.failCount > 0 ? 'color:var(--danger)' : ''}">${rule.failCount || 0}</b>
        </div>
        <div class="health-stat-row">
          <span>أخطاء متتالية حالية</span>
          <b style="${rule.consecutiveErrors > 0 ? 'color:var(--danger)' : ''}">${rule.consecutiveErrors || 0} / 3</b>
        </div>
        <div class="health-stat-row">
          <span>تاريخ آخر عملية</span>
          <b>${rule.lastFired ? new Date(rule.lastFired).toLocaleString('en-GB') : 'لا يوجد'}</b>
        </div>
        ${isAutoDisabled ? `
          <div style="margin-top:12px; padding:8px; background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.2); border-radius:6px; font-size:11px; color:var(--danger);">
            <i class="fa-solid fa-triangle-exclamation"></i> تم تعطيل هذه القاعدة تلقائياً لأسباب أمنية بعد فشلها 3 مرات متتالية. اضغط تفعيل في لوحة القواعد لإعادة التشغيل بعد حل المشكلة.
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Simulator Presets mock json preview
  const presetPreviews = {
    stuck_card: { card: { id: 'card_stuck_1', title: 'صناعة طاولة خشبية مخصصة', priority: 'High', dueDate: '2026-06-01' }, diffHours: 36 },
    low_stock: { material: { id: 'mat_wood_1', name: 'أخشاب زان طبيعي 18مم', stock: 5, minimum: 20 } },
    qc_fail: { machine: { id: 'mach_cnc_1', name: 'ماكينة CNC 4 محاور' }, qc: { title: 'فحص الحواف الدائري' } },
    machine_overload: { machine: { id: 'mach_laser_1', name: 'ماكينة تقطيع ليزر 150واط' }, totalMinutes: 280 },
    employee_req: { request: { id: 'req_leave_1', type: 'leave', title: 'طلب إجازة سنوية - علي', status: 'approved' } },
    whatsapp_app: { whatsappSuggestion: { id: 'wa_sug_1', label: 'طلب توريد مسامير إضافية', type: 'purchase_request', text: 'شراء كرتونة مسامير 5سم للنجارة' } }
  };

  const selectedPresetJson = JSON.stringify(presetPreviews[omniSelectedSimPreset], null, 2);
  const consoleOutputHtml = omniSimulationConsoleLogs.length > 0
    ? omniSimulationConsoleLogs.map(l => {
        let cls = 'sim-log-info';
        if (l.startsWith('[SIM] [SUCCESS]')) cls = 'sim-log-success';
        else if (l.startsWith('[SIM] [WARNING]')) cls = 'sim-log-warning';
        else if (l.startsWith('[SIM] [ERROR]') || l.startsWith('[ACTION] [GATED]')) cls = 'sim-log-error';
        else if (l.startsWith('[ACTION] [SAFE]')) cls = 'sim-log-success';
        else if (l.startsWith('[SIM] بدء') || l.startsWith('[SIM] الحدث')) cls = 'sim-log-info';
        else cls = 'sim-log-muted';
        return `<div class="sim-log-row ${cls}">${escapeHtml(l)}</div>`;
      }).join('')
    : '<div class="sim-log-row sim-log-muted">انتظار تشغيل المحاكاة... اضغط "تشغيل المحاكاة" بالأسفل لرؤية تقييم المطبقة.</div>';

  return `
    <div class="automation-health-workspace" style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap:20px; align-items:start;">
      <div>
        <h3 style="margin-top:0; margin-bottom:12px;"><i class="fa-solid fa-heart-pulse text-accent-cyan"></i> مراقب صحة الأتمتة</h3>
        <div class="automation-health-stats-grid">
          ${healthCardsHtml}
        </div>

        <div class="policy-card">
          <h3 style="margin-top:0; color:#38bdf8; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-shield-halved"></i> سياسات الحماية ومستويات الأمان</h3>
          <p style="font-size:12px; color:var(--text-secondary); line-height:1.6;">بموجب السياسة الأمنية للنظام، تُمنع الأتمتة المباشرة والذكاء الاصطناعي من إجراء تعديلات بدون موافقة صريحة على الوحدات الحساسة (المالية، الرواتب، الإعدادات). جميع إجراءات الكتابة في هذه الوحدات تُحول تلقائياً إلى طابور مراجعة مركز القيادة.</p>

          <table class="data-table tb-table" style="font-size:12px; margin-top:12px;">
            <thead>
              <tr><th>الوحدة / الإجراء</th><th>النوع</th><th>سياسة الأمان</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              <tr><td>تعديلات الرواتب والموظفين</td><td>حقل حساس</td><td>كتابة محظورة / موافقة المدير مطلوبة</td><td><span class="policy-locked-badge">موافقة مطلوبة</span></td></tr>
              <tr><td>تعديلات المالية والقيود المحاسبية</td><td>حقل حساس</td><td>كتابة محظورة / موافقة المدير مطلوبة</td><td><span class="policy-locked-badge">موافقة مطلوبة</span></td></tr>
              <tr><td>إجراء <code>trigger_ai_analysis</code></td><td>إجراء أتمتة</td><td>يمر عبر طابور موافقة AI مركز القيادة</td><td><span class="policy-gated-badge">موافقة مطلوبة</span></td></tr>
              <tr><td>إجراء <code>propose_purchase</code></td><td>إجراء أتمتة</td><td>ينشئ مسودة طلب شراء للمراجعة والاعتماد</td><td><span class="policy-gated-badge">موافقة مطلوبة</span></td></tr>
              <tr><td>إجراء <code>create_request</code></td><td>إجراء أتمتة</td><td>ينشئ طلب موافقة عام للمراجعة والاعتماد</td><td><span class="policy-gated-badge">موافقة مطلوبة</span></td></tr>
              <tr><td>إجراء <code>create_task</code></td><td>إجراء أتمتة</td><td>تأثير على مدير المهام المفتوح مباشرة</td><td><span class="policy-safe-badge">آمن</span></td></tr>
              <tr><td>إجراء <code>schedule_inspection</code></td><td>إجراء أتمتة</td><td>جدولة فحص جودة معلق بدون تعديل مباشر</td><td><span class="policy-safe-badge">آمن</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="glass-card" style="padding:16px;">
        <h3 style="margin-top:0; margin-bottom:12px;"><i class="fa-solid fa-vial"></i> محاكي الأتمتة التفاعلي</h3>
        <p style="font-size:12px; color:var(--text-secondary); line-height:1.5; margin-bottom:14px;">اختر قاعدة أتمتة ونموذج حدث تشغيلي لمحاكاة طريقة تقييم وتصرف النظام في بيئة معزولة وآمنة.</p>

        <div style="display:grid; gap:12px; margin-bottom:16px;">
          <div>
            <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:4px;">اختر قاعدة الأتمتة</label>
            <select id="simRuleSelect" class="form-input" onchange="omniSelectedSimRule = this.value; renderAutomationEngine();">
              <option value="">-- اختر قاعدة --</option>
              ${omni.automationRules.map(r => `<option value="${r.id}" ${omniSelectedSimRule === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
            </select>
          </div>

          <div>
            <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:4px;">حدث المحاكاة المسبق</label>
            <select id="simPresetSelect" class="form-input" onchange="omniSelectedSimPreset = this.value; renderAutomationEngine();">
              <option value="stuck_card" ${omniSelectedSimPreset === 'stuck_card' ? 'selected' : ''}>بطاقة عالقة في اللوحة</option>
              <option value="low_stock" ${omniSelectedSimPreset === 'low_stock' ? 'selected' : ''}>نقص المواد بالمخزون</option>
              <option value="qc_fail" ${omniSelectedSimPreset === 'qc_fail' ? 'selected' : ''}>تكرار فشل الجودة</option>
              <option value="machine_overload" ${omniSelectedSimPreset === 'machine_overload' ? 'selected' : ''}>تحميل زائد على ماكينة</option>
              <option value="employee_req" ${omniSelectedSimPreset === 'employee_req' ? 'selected' : ''}>موافقة طلب موظف</option>
              <option value="whatsapp_app" ${omniSelectedSimPreset === 'whatsapp_app' ? 'selected' : ''}>اعتماد رسائل العملاء</option>
            </select>
          </div>

          <div>
            <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:4px;">بيانات الحدث المرسلة</label>
            <pre style="background: rgba(0,0,0,0.4); border: 1px solid rgba(148,163,184,0.1); border-radius:6px; padding:10px; font-size:11px; color:#a7f3d0; margin:0; direction:ltr; text-align:left; overflow-x:auto;">${escapeHtml(selectedPresetJson)}</pre>
          </div>

          <button class="btn-primary" style="width:100%; padding:10px;" onclick="triggerRuleSimulation()"><i class="fa-solid fa-play"></i> تشغيل المحاكاة</button>
        </div>

        <div>
          <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">مخرجات المحاكاة</label>
          <div class="automation-simulation-console">
            ${consoleOutputHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function triggerRuleSimulation() {
  const ruleSelect = document.getElementById('simRuleSelect');
  const ruleId = ruleSelect ? ruleSelect.value : '';

  if (!ruleId) {
    showToast('يرجى اختيار قاعدة أتمتة للمحاكاة', 'warning');
    return;
  }

  const presetPreviews = {
    stuck_card: { event: 'KANBAN_CARD_STUCK', data: { card: { id: 'card_stuck_1', title: 'صناعة طاولة خشبية مخصصة', priority: 'High', dueDate: '2026-06-01' }, diffHours: 36 } },
    low_stock: { event: 'MATERIAL_LOW_STOCK', data: { material: { id: 'mat_wood_1', name: 'أخشاب زان طبيعي 18مم', stock: 5, minimum: 20 } } },
    qc_fail: { event: 'QC_REPEATED_FAIL', data: { machine: { id: 'mach_cnc_1', name: 'ماكينة CNC 4 محاور' }, qc: { title: 'فحص الحواف الدائري' } } },
    machine_overload: { event: 'MACHINE_OVERLOADED', data: { machine: { id: 'mach_laser_1', name: 'ماكينة تقطيع ليزر 150واط' }, totalMinutes: 280 } },
    employee_req: { event: 'EMPLOYEE_REQUEST_APPROVED', data: { request: { id: 'req_leave_1', type: 'leave', title: 'طلب إجازة سنوية - علي', status: 'approved' } } },
    whatsapp_app: { event: 'WHATSAPP_APPROVED', data: { whatsappSuggestion: { id: 'wa_sug_1', label: 'طلب توريد مسامير إضافية', type: 'purchase_request', text: 'شراء كرتونة مسامير 5سم للنجارة' } } }
  };

  const preset = presetPreviews[omniSelectedSimPreset];
  if (!preset) return;

  const result = runRuleSimulation(ruleId, preset.event, preset.data);
  omniSimulationConsoleLogs = result.logs;

  showToast(result.success ? 'اكتملت محاكاة قاعدة الأتمتة' : 'فشلت شروط القاعدة في المحاكاة', result.success ? 'success' : 'warning');
  renderAutomationEngine();
}

async function addAutomationRule() {
  ensureOmni();

  const events = [
    { value: 'KANBAN_CARD_STUCK', label: 'بطاقة كانبان عالقة' },
    { value: 'MATERIAL_LOW_STOCK', label: 'نقص المواد بالمخزون' },
    { value: 'TASK_COMPLETED', label: 'اكتمال مهمة' },
    { value: 'QC_FAILED', label: 'فشل فحص جودة' },
    { value: 'QUOTE_CREATED', label: 'إنشاء عرض سعر / بطاقة' },
    { value: 'ORDER_OVERDUE', label: 'تأخر الطلبية عن الموعد' },
    { value: 'MACHINE_OVERLOADED', label: 'تحميل زائد على الماكينة' },
    { value: 'QC_REPEATED_FAIL', label: 'تكرار فشل الجودة' },
    { value: 'EMPLOYEE_REQUEST_APPROVED', label: 'موافقة طلب الموظف' },
    { value: 'WHATSAPP_APPROVED', label: 'اعتماد اقتراح WhatsApp' },
    { value: '*', label: 'أي حدث تشغيلي (عام)' }
  ];

  const actions = [
    { value: 'notify', label: 'إرسال إشعار للنظام' },
    { value: 'flag_anomaly', label: 'تسجيل شذوذ تشغيلي' },
    { value: 'trigger_scan', label: 'بدء فحص صحة النظام' },
    { value: 'create_task', label: 'إنشاء مهمة (Task Manager)' },
    { value: 'create_request', label: 'طلب موافقة المدير (Gated)' },
    { value: 'notify_supervisor', label: 'تنبيه المشرف مباشرة (High)' },
    { value: 'propose_purchase', label: 'اقتراح أمر شراء (Gated)' },
    { value: 'schedule_inspection', label: 'جدولة فحص جودة (QC)' },
    { value: 'trigger_ai_analysis', label: 'تشغيل تحليل AI الذكي (Gated)' }
  ];

  const result = await showOmniModal('إنشاء قاعدة أتمتة جديدة', `
    <div class="automation-modal-form" style="display:grid;gap:12px;">
      <div>
        <label>اسم قاعدة الأتمتة</label>
        <input id="ruleName" class="form-input" placeholder="مثال: تنبيه النقص الحرج لورق الفينيل">
      </div>
      <div>
        <label>الحدث التشغيلي المحفز</label>
        <select id="ruleEvent" class="form-input">
          ${events.map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
        <div>
          <label>شرط الحقل</label>
          <input id="condField" class="form-input" placeholder="اسم الحقل (مثال: stock)" value="stock">
        </div>
        <div>
          <label>المعامل</label>
          <select id="condOperator" class="form-input">
            <option value="lt">أقل من (<)</option>
            <option value="lte">أقل من أو يساوي (≤)</option>
            <option value="gt">أكبر من (>)</option>
            <option value="gte">أكبر من أو يساوي (≥)</option>
            <option value="eq">يساوي (=)</option>
            <option value="ne">لا يساوي (≠)</option>
            <option value="contains">يشتمل على نص</option>
          </select>
        </div>
        <div>
          <label>القيمة المستهدفة</label>
          <input id="condValue" class="form-input" placeholder="القيمة (مثال: minimum)" value="minimum">
        </div>
      </div>
      <div>
        <label>إجراء الأتمتة</label>
        <select id="ruleAction" class="form-input">
          ${actions.map(a => `<option value="${a.value}">${a.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>محتوى وقيمة الإجراء</label>
        <input id="ruleActionValue" class="form-input" placeholder="مثال: يرجى شراء مخزون إضافي">
      </div>
    </div>
  `, body => ({
    name: body.querySelector('#ruleName')?.value.trim(),
    event: body.querySelector('#ruleEvent')?.value,
    condField: body.querySelector('#condField')?.value.trim(),
    condOperator: body.querySelector('#condOperator')?.value,
    condValue: body.querySelector('#condValue')?.value.trim(),
    action: body.querySelector('#ruleAction')?.value,
    actionValue: body.querySelector('#ruleActionValue')?.value.trim()
  }));

  if (!result?.name || !result?.event || !result?.action) return;

  const conditions = [];
  if (result.condField && result.condValue) {
    conditions.push({
      field: result.condField,
      operator: result.condOperator,
      value: result.condValue
    });
  }

  omni.automationRules.push({
    id: makeId('rule'),
    name: result.name,
    event: result.event,
    conditions,
    action: result.action,
    actionValue: result.actionValue || 'تم تفعيل القاعدة تلقائياً.',
    active: true,
    successCount: 0,
    failCount: 0,
    consecutiveErrors: 0,
    lastFired: null,
    createdAt: new Date().toISOString()
  });

  saveData();
  renderAutomationEngine();
  showToast('تمت إضافة قاعدة الأتمتة بنجاح', 'success');
}

async function editAutomationRule(ruleId) {
  ensureOmni();
  const rule = omni.automationRules.find(r => r.id === ruleId);
  if (!rule) return;

  const events = [
    { value: 'KANBAN_CARD_STUCK', label: 'بطاقة كانبان عالقة' },
    { value: 'MATERIAL_LOW_STOCK', label: 'نقص المواد بالمخزون' },
    { value: 'TASK_COMPLETED', label: 'اكتمال مهمة' },
    { value: 'QC_FAILED', label: 'فشل فحص جودة' },
    { value: 'QUOTE_CREATED', label: 'إنشاء عرض سعر / بطاقة' },
    { value: 'ORDER_OVERDUE', label: 'تأخر الطلبية عن الموعد' },
    { value: 'MACHINE_OVERLOADED', label: 'تحميل زائد على الماكينة' },
    { value: 'QC_REPEATED_FAIL', label: 'تكرار فشل الجودة' },
    { value: 'EMPLOYEE_REQUEST_APPROVED', label: 'موافقة طلب الموظف' },
    { value: 'WHATSAPP_APPROVED', label: 'اعتماد اقتراح WhatsApp' },
    { value: '*', label: 'أي حدث تشغيلي (عام)' }
  ];

  const actions = [
    { value: 'notify', label: 'إرسال إشعار للنظام' },
    { value: 'flag_anomaly', label: 'تسجيل شذوذ تشغيلي' },
    { value: 'trigger_scan', label: 'بدء فحص صحة النظام' },
    { value: 'create_task', label: 'إنشاء مهمة (Task Manager)' },
    { value: 'create_request', label: 'طلب موافقة المدير (Gated)' },
    { value: 'notify_supervisor', label: 'تنبيه المشرف مباشرة (High)' },
    { value: 'propose_purchase', label: 'اقتراح أمر شراء (Gated)' },
    { value: 'schedule_inspection', label: 'جدولة فحص جودة (QC)' },
    { value: 'trigger_ai_analysis', label: 'تشغيل تحليل AI الذكي (Gated)' }
  ];

  const cond = rule.conditions?.[0] || { field: '', operator: 'eq', value: '' };

  const result = await showOmniModal('تعديل قاعدة الأتمتة', `
    <div class="automation-modal-form" style="display:grid;gap:12px;">
      <div>
        <label>اسم قاعدة الأتمتة</label>
        <input id="ruleName" class="form-input" value="${escapeHtml(rule.name)}">
      </div>
      <div>
        <label>الحدث التشغيلي المحفز</label>
        <select id="ruleEvent" class="form-input">
          ${events.map(e => `<option value="${e.value}" ${rule.event === e.value ? 'selected' : ''}>${e.label}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
        <div>
          <label>شرط الحقل</label>
          <input id="condField" class="form-input" placeholder="مثال: stock" value="${escapeHtml(cond.field)}">
        </div>
        <div>
          <label>المعامل</label>
          <select id="condOperator" class="form-input">
            <option value="lt" ${cond.operator === 'lt' ? 'selected' : ''}>أقل من (<)</option>
            <option value="lte" ${cond.operator === 'lte' ? 'selected' : ''}>أقل من أو يساوي (≤)</option>
            <option value="gt" ${cond.operator === 'gt' ? 'selected' : ''}>أكبر من (>)</option>
            <option value="gte" ${cond.operator === 'gte' ? 'selected' : ''}>أكبر من أو يساوي (≥)</option>
            <option value="eq" ${cond.operator === 'eq' ? 'selected' : ''}>يساوي (=)</option>
            <option value="ne" ${cond.operator === 'ne' ? 'selected' : ''}>لا يساوي (≠)</option>
            <option value="contains" ${cond.operator === 'contains' ? 'selected' : ''}>يشتمل على نص</option>
          </select>
        </div>
        <div>
          <label>القيمة المستهدفة</label>
          <input id="condValue" class="form-input" placeholder="مثال: minimum" value="${escapeHtml(cond.value)}">
        </div>
      </div>
      <div>
        <label>إجراء الأتمتة</label>
        <select id="ruleAction" class="form-input">
          ${actions.map(a => `<option value="${a.value}" ${rule.action === a.value ? 'selected' : ''}>${a.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>محتوى وقيمة الإجراء</label>
        <input id="ruleActionValue" class="form-input" value="${escapeHtml(rule.actionValue)}">
      </div>
    </div>
  `, body => ({
    name: body.querySelector('#ruleName')?.value.trim(),
    event: body.querySelector('#ruleEvent')?.value,
    condField: body.querySelector('#condField')?.value.trim(),
    condOperator: body.querySelector('#condOperator')?.value,
    condValue: body.querySelector('#condValue')?.value.trim(),
    action: body.querySelector('#ruleAction')?.value,
    actionValue: body.querySelector('#ruleActionValue')?.value.trim()
  }));

  if (!result?.name || !result?.event || !result?.action) return;

  const conditions = [];
  if (result.condField && result.condValue) {
    conditions.push({
      field: result.condField,
      operator: result.condOperator,
      value: result.condValue
    });
  }

  rule.name = result.name;
  rule.event = result.event;
  rule.conditions = conditions;
  rule.action = result.action;
  rule.actionValue = result.actionValue || 'تم تعديل القاعدة تلقائياً.';

  saveData();
  renderAutomationEngine();
  showToast('تم تعديل القاعدة بنجاح', 'success');
}

function deleteAutomationRule(ruleId) {
  ensureOmni();
  const idx = omni.automationRules.findIndex(r => r.id === ruleId);
  if (idx !== -1) {
    const deleted = omni.automationRules.splice(idx, 1)[0];
    saveData();
    renderAutomationEngine();
    showToast(`تم حذف القاعدة "${deleted.name}"`, 'success');
  }
}

function toggleAutomationRuleActive(ruleId) {
  ensureOmni();
  const rule = omni.automationRules.find(r => r.id === ruleId);
  if (rule) {
    rule.active = !rule.active;
    // reset consecutive errors when manually toggled back active
    if (rule.active) rule.consecutiveErrors = 0;
    saveData();
    renderAutomationEngine();
    showToast(rule.active ? `تم تفعيل القاعدة "${rule.name}"` : `تم إيقاف القاعدة "${rule.name}"`, 'success');
  }
}

function testFireAutomationRule(ruleId) {
  ensureOmni();
  const rule = omni.automationRules.find(r => r.id === ruleId);
  if (!rule) return;

  const testData = {
    card: { id: 'card_test_1', title: 'بطاقة اختبارية كانبان', priority: 'High', dueDate: todayISO(), department: 'الإنتاج' },
    material: { id: 'mat_test_1', name: 'ورق فينيل لاصق 3M', stock: 5, minimum: 20 },
    task: { id: 'task_test_1', title: 'مهمة فحص ماكينات CNC رقم 1', status: 'done', priority: 'High' },
    machine: { id: 'mach_test_1', name: 'ماكينة اختبار CNC' },
    totalMinutes: 260
  };

  showToast(`تشغيل اختبار تشريحي للقاعدة: ${rule.name}`, 'info');
  fireAutomationRule(rule, rule.event === '*' ? 'KANBAN_CARD_STUCK' : rule.event, testData);
}

function clearAutomationFireLog() {
  ensureOmni();
  omni.automationFireLog = [];
  saveData(true);
  renderAutomationEngine();
  showToast('تم مسح سجل الأتمتة بالكامل', 'success');
}

function runManualAuditScan() {
  ensureOmni();
  showToast('بدء فحص ومطابقة جميع مستندات المخزون والكانبان والأحمال المفرطة...', 'info');

  let matchCount = 0;

  (omni.materials || []).forEach(m => {
    const stock = Number(m.stock || 0) - Number(m.reserved || 0);
    if (stock < Number(m.minimum || 0)) {
      triggerOmniEvent('MATERIAL_LOW_STOCK', { material: m, stock });
      matchCount++;
    }
  });

  const now = new Date();
  const inProgressColId = (omni.kanban.columns.find(c => c.title.toLowerCase().includes('progress') || c.title.includes('عمل') || c.title.includes('قيد')) || {}).id;
  if (inProgressColId) {
    omni.kanban.cards.forEach(card => {
      if (card.columnId === inProgressColId && card.priority !== 'Urgent') {
        const lastLog = [...(card.activityLog||[])].reverse().find(l => l.text.includes('نقل') || l.text.includes('moved'));
        const dateToCheck = lastLog ? new Date(lastLog.date) : new Date(card.dueDate || Date.now());
        const diffHours = (now - dateToCheck) / (1000 * 60 * 60);
        if (diffHours > 24) {
          triggerOmniEvent('KANBAN_CARD_STUCK', { card, diffHours });
          matchCount++;
        }
      }
    });
  }

  // ORDER_OVERDUE check in scan
  const todayStr = todayISO();
  (omni.kanban.cards || []).forEach(card => {
    if (card.dueDate && card.dueDate < todayStr && card.columnId !== 'kb_done') {
      triggerOmniEvent('ORDER_OVERDUE', { card, today: todayStr });
      matchCount++;
    }
  });

  showToast(`اكتمل فحص ومطابقة المستندات. تم تشغيل ${matchCount} محفز أتمتة.`, 'success');
}

function runManualAuditScanSilent() {
  ensureOmni();
  normalizeAutomation();

  (omni.materials || []).forEach(m => {
    const stock = Number(m.stock || 0) - Number(m.reserved || 0);
    if (stock < Number(m.minimum || 0)) {
      triggerOmniEvent('MATERIAL_LOW_STOCK', { material: m, stock });
    }
  });

  const now = new Date();
  const inProgressColId = (omni.kanban.columns.find(c => c.title.toLowerCase().includes('progress') || c.title.includes('عمل') || c.title.includes('قيد')) || {}).id;
  if (inProgressColId) {
    omni.kanban.cards.forEach(card => {
      if (card.columnId === inProgressColId && card.priority !== 'Urgent') {
        const lastLog = [...(card.activityLog||[])].reverse().find(l => l.text.includes('نقل') || l.text.includes('moved'));
        const dateToCheck = lastLog ? new Date(lastLog.date) : new Date(card.dueDate || Date.now());
        const diffHours = (now - dateToCheck) / (1000 * 60 * 60);
        if (diffHours > 24) {
          triggerOmniEvent('KANBAN_CARD_STUCK', { card, diffHours });
        }
      }
    });
  }

  // ORDER_OVERDUE check in silent scan
  const todayStr = todayISO();
  (omni.kanban.cards || []).forEach(card => {
    if (card.dueDate && card.dueDate < todayStr && card.columnId !== 'kb_done') {
      triggerOmniEvent('ORDER_OVERDUE', { card, today: todayStr });
    }
  });
}

function ptxRulePolicy(actionName) {
  if (['create_request', 'propose_purchase', 'trigger_ai_analysis'].includes(actionName)) return { label: 'بمراجعة', cls: 'gated' };
  if (['create_task', 'notify', 'notify_supervisor', 'schedule_inspection', 'flag_anomaly', 'trigger_scan'].includes(actionName)) return { label: 'آمن', cls: 'safe' };
  return { label: 'غير محدد', cls: 'neutral' };
}

// ptxAutomationTemplates() moved to modules/data-providers.js (GO 16 de-monolith Phase 1)

function addWorkshopAutomationTemplate(key) {
  ensureOmni();
  normalizeAutomation();
  const tpl = ptxAutomationTemplates().find(item => item.key === key);
  if (!tpl) return;
  const id = `rule_workshop_${key}`;
  if ((omni.automationRules || []).some(rule => rule.id === id)) {
    showToast('هذا القالب موجود مسبقاً في القواعد.', 'info');
    return;
  }
  omni.automationRules.unshift({
    id,
    name: tpl.title,
    event: tpl.event,
    conditions: [],
    action: tpl.action,
    actionValue: tpl.note,
    active: true,
    successCount: 0,
    failCount: 0,
    consecutiveErrors: 0,
    lastFired: null,
    createdAt: new Date().toISOString()
  });
  saveData();
  showToast(`تمت إضافة قاعدة: ${tpl.title}`, 'success');
  renderAutomationEngine();
}

function renderAutomationEngine() {
  ensureOmni();
  normalizeAutomation();
  const body = document.getElementById('automationBody');
  if (!body) return;
  const rules = omni.automationRules || [];
  const activeCount = rules.filter(r => r.active).length;
  const pausedCount = rules.filter(r => !r.active).length;
  const firedCount = (omni.automationFireLog || []).length;
  const gatedCount = rules.filter(r => ptxRulePolicy(r.action).cls === 'gated').length;
  body.className = 'automation-workspace-shell';
  body.innerHTML = `
    <div class="auto-hero">
      <div><h2>⚡ محرك أتمتة الورشة</h2><p>يفكر بطريقة: عند حدوث حدث → إذا تحققت الشروط → نفّذ إجراء آمن أو ارسل طلب موافقة. لا يلمس المالية أو الرواتب أو الإعدادات مباشرة.</p></div>
      <button class="btn-primary" onclick="addAutomationRule()"><i class="fa-solid fa-plus"></i> قاعدة مخصصة</button>
    </div>
    <div class="auto-kpi-row">
      <div><span>نشطة</span><b>${activeCount}</b></div>
      <div><span>معطلة</span><b>${pausedCount}</b></div>
      <div><span>عمليات منفذة</span><b>${firedCount}</b></div>
      <div><span>تحتاج موافقة</span><b>${gatedCount}</b></div>
    </div>
    <section class="auto-template-panel">
      <div class="automation-section-head"><h3>قوالب عملية للورشة</h3><span>ابدأ من سيناريو واضح</span></div>
      <div class="auto-template-grid">
        ${ptxAutomationTemplates().map(tpl => `<button onclick="addWorkshopAutomationTemplate('${tpl.key}')"><span>${tpl.icon}</span><b>${tpl.title}</b><small>${tpl.note}</small></button>`).join('')}
      </div>
    </section>
    <div class="auto-main-grid">
      <main class="automation-panel">
        <div class="automation-section-head"><h3>القواعد الحالية</h3><span>${rules.length}</span></div>
        <div class="auto-toolbar">
          <input id="autoSearchInput" class="form-input" placeholder="بحث باسم القاعدة..." value="${escapeHtml(automationSearchQuery)}" oninput="handleAutomationSearchInput(this.value)">
          <select class="form-input" onchange="handleAutomationEventFilterChange(this.value)">
            <option value="all" ${automationEventFilter === 'all' ? 'selected' : ''}>كل الأحداث</option>
            <option value="KANBAN_CARD_STUCK" ${automationEventFilter === 'KANBAN_CARD_STUCK' ? 'selected' : ''}>بطاقة عالقة في اللوحة</option>
            <option value="MATERIAL_BELOW_MINIMUM" ${automationEventFilter === 'MATERIAL_BELOW_MINIMUM' ? 'selected' : ''}>نقص مادة</option>
            <option value="WHATSAPP_APPROVED" ${automationEventFilter === 'WHATSAPP_APPROVED' ? 'selected' : ''}>WhatsApp معتمد</option>
            <option value="QUOTE_CREATED" ${automationEventFilter === 'QUOTE_CREATED' ? 'selected' : ''}>عرض سعر جديد</option>
            <option value="MACHINE_OVERLOADED" ${automationEventFilter === 'MACHINE_OVERLOADED' ? 'selected' : ''}>ضغط ماكينة</option>
          </select>
        </div>
        <div class="auto-rule-list">${renderAutomationRules()}</div>
      </main>
      <aside class="automation-panel">
        <div class="automation-section-head"><h3>سجل التشغيل</h3><span>آخر الأحداث</span></div>
        <div class="automation-fire-list">${renderAutomationFireLog()}</div>
      </aside>
    </div>
    <div class="automation-panel" style="margin-top:18px;">
      <div class="automation-section-head"><h3>صحة الأتمتة والسياسات</h3><span>حماية التشغيل</span></div>
      ${renderAutomationHealthAndPoliciesContent()}
    </div>
  `;
}
