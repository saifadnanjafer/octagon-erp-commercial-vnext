// ─── SOP Issues & AI Context Index (GO 6) ───
function getSopIssues(sop) {
  ensureOmni();
  const issues = [];

  // 1. QC Quality Failures Check
  const qcFailures = (omni.qcRecords || []).filter(q => q.result === 'fail' && q.sopId === sop.id);
  if (qcFailures.length >= 2) {
    issues.push({
      type: 'qc',
      severity: 'error',
      text: `الإجراء مرتبط بـ ${qcFailures.length} حالات فشل جودة مسجلة في ورشة العمل.`
    });
  } else if (qcFailures.length === 1) {
    issues.push({
      type: 'qc',
      severity: 'warning',
      text: 'الإجراء مرتبط بحالة فشل جودة واحدة مسجلة.'
    });
  }

  // 2. Unapproved Status Check
  if (sop.approvalStatus !== 'approved') {
    issues.push({
      type: 'approval',
      severity: 'warning',
      text: `الإجراء ما زال في حالة ${sop.approvalStatus === 'draft' ? 'مسودة' : 'قيد المراجعة'} ولم يتم اعتماده رسمياً بعد.`
    });
  }

  // 3. Workflow Linkage Check
  const linkedWorkflows = (omni.workflows || []).filter(w => {
    return (w.nodes || []).some(n => n.linkedSopId === sop.id);
  });
  if (omni.workflow && (omni.workflow.nodes || []).some(n => n.linkedSopId === sop.id)) {
    linkedWorkflows.push(omni.workflow);
  }
  if (linkedWorkflows.length === 0) {
    issues.push({
      type: 'workflow',
      severity: 'info',
      text: 'الإجراء غير مرتبط بأي سير عمل (Workflow) نشط أو مسودة.'
    });
  }

  // 4. Missing steps or checklist
  if (!(sop.steps || []).length) {
    issues.push({
      type: 'content',
      severity: 'warning',
      text: 'لا توجد خطوات تنفيذ مضافة لهذا الإجراء.'
    });
  }
  if (!(sop.checklist || []).length) {
    issues.push({
      type: 'content',
      severity: 'warning',
      text: 'لا توجد بنود فحص (Checklist) مضافة لهذا الإجراء.'
    });
  }

  return issues;
}

function getAiSopContextIndex() {
  ensureOmni();
  return (omni.sops || []).map(sop => {
    return {
      id: sop.id,
      code: sop.code || '',
      title: sop.title || '',
      department: sop.department || '',
      purpose: sop.purpose || '',
      requiredSkill: sop.requiredSkill || '',
      estimatedMinutes: sop.estimatedMinutes || 0,
      steps: (sop.steps || []).map(s => s.title || s.text || ''),
      checklist: (sop.checklist || []).map(item => item.text || item),
      safetyNotes: (sop.safetyNotes || []).map(n => typeof n === 'string' ? n : n.text),
      qcCriteria: (sop.qcCriteria || []).map(c => typeof c === 'string' ? c : c.text),
      commonMistakes: (sop.commonMistakes || []).map(m => typeof m === 'string' ? m : m.text),
      linkedMachineNames: (sop.machineIds || []).map(id => getMachineById(id)?.name).filter(Boolean),
      linkedMaterialNames: (sop.materialIds || []).map(id => getMaterialById(id)?.name).filter(Boolean),
      issues: getSopIssues(sop).map(i => i.text),
      approvalStatus: sop.approvalStatus || 'draft'
    };
  });
}

async function previewAiSopContextIndex() {
  const indexData = getAiSopContextIndex();
  const jsonStr = JSON.stringify(indexData, null, 2);
  const html = `
    <div style="direction: rtl; text-align: right; padding: 12px;">
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">الفهرس أدناه مصمم ليكون مقروءاً ومفهوماً للذكاء الاصطناعي عند تحليل الإجراءات والربط مع الأخطاء ومحاكاة سير العمل.</p>
      <textarea id="aiSopContextTextarea" readonly class="form-input" style="height: 350px; font-family: monospace; font-size:11.5px; direction: ltr; text-align: left; background: rgba(0,0,0,0.3); color: #10b981; border-color: rgba(255,255,255,0.1); width:100%; box-sizing:border-box;">${escapeHtml(jsonStr)}</textarea>
      <div style="margin-top:16px; display:flex; justify-content:flex-end;">
        <button class="btn-primary" onclick="copyAiSopContextIndex()"><i class="fa-solid fa-copy"></i> نسخ إلى الحافظة</button>
      </div>
    </div>
  `;
  showOmniModal('فهرس SOP المرجعي للذكاء الاصطناعي (AI Context Index)', html, () => true);
}

function copyAiSopContextIndex() {
  const ta = document.getElementById('aiSopContextTextarea');
  if (ta) {
    ta.select();
    document.execCommand('copy');
    showToast('تم نسخ الفهرس المرجعي', 'success');
  }
}

function renderSopIssuesPanel(allSops) {
  ensureOmni();
  const issues = [];
  allSops.forEach(sop => {
    const sopIssues = getSopIssues(sop);
    sopIssues.forEach(iss => {
      if (iss.severity === 'error' || (iss.severity === 'warning' && iss.type === 'qc')) {
        issues.push({ sop, ...iss });
      }
    });
  });

  if (issues.length === 0) return '';

  return `
    <div class="sop-global-warnings" style="grid-column: 1 / -1; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 12px; padding: 16px; margin-bottom: 24px; direction: rtl; text-align: right; box-sizing: border-box; width: 100%;">
      <h4 style="margin-top: 0; color: #ef4444; display: flex; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 12px; font-weight: bold;">
        <i class="fa-solid fa-triangle-exclamation"></i>
        تنبيهات ومشاكل تشغيلية تتطلب المراجعة الفورية (${issues.length})
      </h4>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${issues.map(iss => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px; font-size: 13px; border-inline-start: 3px solid #ef4444;">
            <div>
              <span style="font-weight: bold; color: #ef4444; margin-left: 8px;">[${escapeHtml(iss.sop.code || 'SOP')}] ${escapeHtml(iss.sop.title)}:</span>
              <span style="color: var(--text-normal);">${escapeHtml(iss.text)}</span>
            </div>
            <button class="btn-secondary" style="padding: 2px 8px; font-size: 11px; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1);" onclick="openSopInspector('${iss.sop.id}', 0)">مراجعة الإجراء</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function isValidSopAttachmentUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^(javascript|data):/i.test(value)) return false;
  if (/^https?:\/\//i.test(value)) {
    try { new URL(value); return true; } catch (err) { return false; }
  }
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\.{0,2}[\\/]/.test(value) || /^[^<>:"|?*]+$/i.test(value);
}

async function addSopAttachment(sopId) {
  const sop = (omni.sops || []).find(s => s.id === sopId);
  if (!sop) return;

  const modalHtml = `
    <div style="display:flex; flex-direction:column; gap:12px; direction:rtl; text-align:right;">
      <div>
        <label>تحميل ملف من الجهاز (اختياري)</label>
        <input type="file" id="sopAttachmentFile" class="form-input" style="padding:4px;" onchange="
          const file = this.files[0];
          if (file) {
            const nameInput = document.getElementById('sopAttachmentName');
            if (nameInput && !nameInput.value) {
              nameInput.value = file.name;
            }
          }
        ">
      </div>
      <div style="text-align:center; color:var(--text-muted); font-size:11px;">— أو أدخل رابطاً يدوياً —</div>
      <div>
        <label>اسم الملف / المستند</label>
        <input id="sopAttachmentName" class="form-input" placeholder="مثال: رسم كروكي للماكينة">
      </div>
      <div>
        <label>رابط أو مسار الملف (يملأ تلقائياً في حال تحميل ملف)</label>
        <input id="sopAttachmentUrl" class="form-input" placeholder="http://... أو اترك فارغاً للتحميل">
      </div>
    </div>
  `;

  const result = await showOmniModal('إضافة مرفق SOP', modalHtml, async (body) => {
    const fileInput = body.querySelector('#sopAttachmentFile');
    const name = body.querySelector('#sopAttachmentName')?.value.trim();
    let url = body.querySelector('#sopAttachmentUrl')?.value.trim();
    const file = fileInput?.files?.[0];

    if (file) {
      return { file, name, url };
    }
    return { name, url };
  });

  if (!result?.name) return;

  let finalUrl = result.url;
  if (result.file) {
    try {
      showToast('جاري رفع الملف...', 'info');
      const base64Content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(result.file);
      });

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: result.file.name, content: base64Content })
      });
      const uploadRes = await response.json();
      if (!response.ok || !uploadRes.success) {
        throw new Error(uploadRes.error || 'فشل الرفع على الخادم');
      }
      finalUrl = uploadRes.url;
      showToast('تم رفع الملف بنجاح!', 'success');
    } catch (err) {
      showToast('فشل تحميل الملف: ' + err.message, 'error');
      return;
    }
  }

  if (!finalUrl) {
    showToast('يجب تحميل ملف أو إدخال رابط صالح', 'warning');
    return;
  }

  if (!isValidSopAttachmentUrl(finalUrl)) {
    showToast('رابط أو مسار المرفق غير صالح', 'warning');
    return;
  }

  sop.attachments = sop.attachments || [];
  sop.attachments.push({ name: result.name, url: finalUrl, addedAt: new Date().toISOString() });
  sop.updatedAt = todayISO();
  if (!Array.isArray(sop.activityLog)) sop.activityLog = [];
  sop.activityLog.push({ date: todayISO(), text: 'تمت إضافة مرفق SOP: ' + result.name });
  saveData();
  openSopInspector(sopId, 11);
}

function removeSopAttachment(sopId, idx) {
  const sop = (omni.sops || []).find(s => s.id === sopId);
  if (sop && sop.attachments) {
    const removed = sop.attachments.splice(idx, 1)[0];
    sop.updatedAt = todayISO();
    if (!Array.isArray(sop.activityLog)) sop.activityLog = [];
    sop.activityLog.push({ date: todayISO(), text: 'تم حذف مرفق SOP: ' + (removed?.name || idx) });
    saveData();
    openSopInspector(sopId, 11);
  }
}
