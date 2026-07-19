/**
 * OCTAGON OMNISYSTEM — modules/page-sop.js
 *
 * GO 16 Phase 4: SOP page and helper functions extracted from app.js.
 */
function normalizeSopSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSopSearchScore(sop, query) {
  const normalizedQuery = normalizeSopSearchText(query);
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const fields = [
    { text: sop.code, weight: 14 },
    { text: sop.title, weight: 12 },
    { text: sop.department, weight: 7 },
    { text: sop.type, weight: 6 },
    { text: sop.owner, weight: 5 },
    { text: sop.description || sop.text, weight: 4 },
    { text: (sop.steps || []).map(s => `${s.title || ''} ${s.text || ''} ${s.description || ''}`).join(' '), weight: 3 },
    { text: (sop.checklist || []).map(i => i.text || i).join(' '), weight: 3 },
    { text: (sop.safetyNotes || []).map(i => i.text || i).join(' '), weight: 3 },
    { text: (sop.qcCriteria || []).map(i => i.text || i).join(' '), weight: 3 },
    { text: (sop.attachments || []).map(a => `${a.name || ''} ${a.url || ''}`).join(' '), weight: 2 }
  ];
  return fields.reduce((score, field) => {
    const text = normalizeSopSearchText(field.text);
    if (!text) return score;
    let add = 0;
    if (text.includes(normalizedQuery)) add += field.weight * 2;
    tokens.forEach(token => { if (text.includes(token)) add += field.weight; });
    return score + add;
  }, 0);
}

function getSopKnowledgeStats(list = omni.sops || []) {
  const sops = list || [];
  const approved = sops.filter(s => s.approvalStatus === 'approved').length;
  const draft = sops.filter(s => s.approvalStatus !== 'approved').length;
  const attachments = sops.reduce((sum, s) => sum + (s.attachments || []).length, 0);
  const linkedMachines = sops.reduce((sum, s) => sum + (s.machineIds || []).length, 0);
  const qcCriteria = sops.reduce((sum, s) => sum + (s.qcCriteria || []).length, 0);
  return { total: sops.length, approved, draft, attachments, linkedMachines, qcCriteria };
}

function renderSopKnowledgePulse(filteredSops) {
  const all = getSopKnowledgeStats(omni.sops || []);
  const filtered = getSopKnowledgeStats(filteredSops);
  return `
    <div class="sop-knowledge-pulse">
      <div><b>${filtered.total}</b><span>نتائج ظاهرة</span><small>من أصل ${all.total}</small></div>
      <div class="${filtered.draft ? 'warn' : 'ok'}"><b>${filtered.approved}</b><span>SOP معتمد</span><small>${filtered.draft} يحتاج مراجعة</small></div>
      <div><b>${filtered.attachments}</b><span>مرفقات</span><small>روابط وملفات مرجعية</small></div>
      <div><b>${filtered.linkedMachines}</b><span>روابط مكائن</span><small>${filtered.qcCriteria} معيار QC</small></div>
    </div>
  `;
}

function renderSopHub() {
  ensureOmni();
  const grid = document.getElementById('sopGrid');
  if (!grid) return;

  let sops = [...(omni.sops || [])];

  if (sopSearchQuery) {
    sops = sops
      .map(s => ({ sop: s, score: getSopSearchScore(s, sopSearchQuery) }))
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(row => row.sop);
  }
  if (sopFilterDept) sops = sops.filter(s => s.department === sopFilterDept);
  if (sopFilterMachine) sops = sops.filter(s => (s.machineIds||[]).includes(sopFilterMachine));
  if (sopFilterStatus) sops = sops.filter(s => s.approvalStatus === sopFilterStatus);
  if (sopFilterType) sops = sops.filter(s => s.type === sopFilterType);

  const departments = [...new Set((omni.sops||[]).map(s => s.department).filter(Boolean))];
  const types = [...new Set((omni.sops||[]).map(s => s.type).filter(Boolean))];

  const toolbar = document.getElementById('sopToolbar');
  if (toolbar) {
    toolbar.innerHTML = `
      <div class="sop-filters">
        <input type="text" class="sop-search-input" placeholder="🔍 بحث بالعنوان أو الكود..." value="${sopSearchQuery}" oninput="sopSearchQuery=this.value; renderSopHub();">
        <select class="sop-filter-select" onchange="sopFilterDept=this.value; renderSopHub();">
          <option value="">كل الأقسام</option>
          ${departments.map(d => `<option value="${d}" ${sopFilterDept===d?'selected':''}>${d}</option>`).join('')}
        </select>
        <select class="sop-filter-select" onchange="sopFilterMachine=this.value; renderSopHub();">
          <option value="">كل المكائن</option>
          ${(omni.machines||[]).map(m => `<option value="${m.id}" ${sopFilterMachine===m.id?'selected':''}>${m.name}</option>`).join('')}
        </select>
        <select class="sop-filter-select" onchange="sopFilterStatus=this.value; renderSopHub();">
          <option value="">كل الحالات</option>
          <option value="draft" ${sopFilterStatus==='draft'?'selected':''}>مسودة</option>
          <option value="review" ${sopFilterStatus==='review'?'selected':''}>قيد المراجعة</option>
          <option value="approved" ${sopFilterStatus==='approved'?'selected':''}>معتمد</option>
          <option value="archived" ${sopFilterStatus==='archived'?'selected':''}>مؤرشف</option>
        </select>
        <select class="sop-filter-select" onchange="sopFilterType=this.value; renderSopHub();">
          <option value="">كل الأنواع</option>
          ${types.map(t => `<option value="${t}" ${sopFilterType===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="sop-toolbar-actions" style="display:flex; gap:8px;">
        <button class="btn-secondary" onclick="previewAiSopContextIndex()"><i class="fa-solid fa-brain"></i> فهرس الذكاء الاصطناعي</button>
        <button class="btn-primary" onclick="addSop()"><i class="fa-solid fa-plus"></i> إضافة SOP</button>
      </div>
    `;
  }

  if (!sopSearchQuery) {
    sops.sort((a, b) => {
      const statusWeight = { approved: 0, review: 1, draft: 2, archived: 3 };
      return (statusWeight[a.approvalStatus] ?? 4) - (statusWeight[b.approvalStatus] ?? 4) || String(a.title || '').localeCompare(String(b.title || ''));
    });
  }

  const statusColors = { draft: '#94a3b8', review: '#f59e0b', approved: '#10b981', archived: '#64748b' };
  const statusLabels = { draft: 'مسودة', review: 'مراجعة', approved: 'معتمد', archived: 'مؤرشف' };

  grid.innerHTML = renderSopKnowledgePulse(sops) + renderSopIssuesPanel(sops) + (sops.map(sop => {
    const stepsCount = (sop.steps||[]).length;
    const checkCount = (sop.checklist||[]).length;
    const machCount = (sop.machineIds||[]).length;
    const searchScore = getSopSearchScore(sop, sopSearchQuery);
    const statusColor = statusColors[sop.approvalStatus] || '#94a3b8';
    const statusLabel = statusLabels[sop.approvalStatus] || sop.approvalStatus;

    const issues = getSopIssues(sop);
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warning').length;
    let issueBadgeHtml = '';
    if (errorCount > 0) {
      issueBadgeHtml = `<span class="sop-issue-badge error" title="${errorCount} مشاكل حرجة" style="background:#ef4444; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; margin-right:4px;"><i class="fa-solid fa-triangle-exclamation"></i> ${errorCount}</span>`;
    } else if (warnCount > 0) {
      issueBadgeHtml = `<span class="sop-issue-badge warn" title="${warnCount} تحذيرات" style="background:#f59e0b; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; margin-right:4px;"><i class="fa-solid fa-exclamation-circle"></i> ${warnCount}</span>`;
    }

    return `<div class="glass-card sop-card" onclick="openSopInspector('${sop.id}')">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div class="sop-badge" style="background:${statusColor}; color:white; margin:0;">${statusLabel}</div>
        <div>${issueBadgeHtml}</div>
      </div>
      <div class="sop-code">${sop.code || '-'}</div>
      <h3>${sop.title}</h3>
      <div class="sop-meta">
        ${sop.department ? `<span class="sop-meta-tag"><i class="fa-solid fa-building"></i> ${sop.department}</span>` : ''}
        <span class="sop-meta-tag"><i class="fa-solid fa-list-ol"></i> ${stepsCount} خطوة</span>
        <span class="sop-meta-tag"><i class="fa-solid fa-check-square"></i> ${checkCount} بند</span>
        ${machCount ? `<span class="sop-meta-tag"><i class="fa-solid fa-gear"></i> ${machCount} ماكينة</span>` : ''}
        ${sopSearchQuery ? `<span class="sop-meta-tag sop-match-score"><i class="fa-solid fa-ranking-star"></i> ${searchScore}</span>` : ''}
      </div>
      <div class="sop-card-footer">
        <span class="sop-version">v${sop.version || 1}</span>
        ${sop.lastReviewDate ? `<span class="sop-review-date">${sop.lastReviewDate}</span>` : ''}
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--text-muted); text-align:center; padding:40px;">لا توجد إجراءات مطابقة للفلتر</p>');
}

async function addSop() {
  ensureOmni();
  const html = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label>عنوان الإجراء (SOP)</label>
      <input type="text" id="addSopTitle" class="form-input" placeholder="مثال: تشغيل ماكينة CNC">
      <label>القسم</label>
      <input type="text" id="addSopDept" class="form-input" placeholder="مثال: ورشة الإنتاج">
      <label>النوع</label>
      <select id="addSopType" class="form-input">
        <option value="تشغيلي">تشغيلي</option>
        <option value="إلزامي">إلزامي</option>
        <option value="جودة">جودة</option>
        <option value="صيانة">صيانة</option>
        <option value="سلامة">سلامة</option>
      </select>
    </div>
  `;
  const result = await showOmniModal('إضافة SOP جديد', html, (body) => {
    const title = body.querySelector('#addSopTitle').value.trim();
    if (!title) return false;
    return {
      title,
      dept: body.querySelector('#addSopDept').value.trim(),
      type: body.querySelector('#addSopType').value
    };
  });
  if (!result) return;
  const newSop = {
    id: makeId('sop'), code: 'SOP-' + Date.now().toString(36).toUpperCase().slice(-6),
    title: result.title, department: result.dept, section: '', type: result.type, owner: 'الورشة',
    purpose: '', description: '', text: '',
    machineIds: [], materialIds: [], taskTypes: [],
    requiredTools: [], requiredMaterials: [], safetyNotes: [], steps: [],
    checklist: [], qcCriteria: [], commonMistakes: [], estimatedMinutes: 0,
    requiredSkill: '', relatedWorkflowIds: [], relatedOperationPackIds: [],
    relatedTaskTemplateIds: [], version: 1, approvalStatus: 'draft',
    approvedBy: '', lastReviewDate: '', attachments: [], activityLog: [
      { date: todayISO(), text: 'تم إنشاء SOP' }
    ],
    createdAt: todayISO(), updatedAt: todayISO()
  };
  omni.sops.push(newSop);
  saveData();
  renderSopHub();
  openSopInspector(newSop.id);
}

function duplicateSop(sopId) {
  ensureOmni();
  const src = omni.sops.find(s => s.id === sopId);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = makeId('sop');
  copy.code = 'SOP-' + Date.now().toString(36).toUpperCase().slice(-6);
  copy.title = src.title + ' (نسخة)';
  copy.version = 1;
  copy.approvalStatus = 'draft';
  copy.approvedBy = '';
  copy.activityLog = [{ date: todayISO(), text: 'تم نسخ SOP من ' + src.code }];
  copy.createdAt = todayISO();
  copy.updatedAt = todayISO();
  omni.sops.push(copy);
  saveData();
  renderSopHub();
  showToast('تم نسخ SOP بنجاح', 'success');
}

async function approveSop(sopId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.approvalStatus = 'approved';
  sop.approvedBy = await showOmniPrompt('اسم المعتمد:', 'الإدارة') || 'الإدارة';
  sop.lastReviewDate = todayISO();
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: `تم اعتماد SOP بواسطة ${sop.approvedBy}` });
  saveData();
  showToast('تم اعتماد SOP', 'success');
}

// ═══════════════════════════════════════════════════
// SOP INSPECTOR — TABBED DETAIL VIEW
// ═══════════════════════════════════════════════════

let sopInspectorActiveTab = 0;

function openSopInspector(sopId, initialTab = 0) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!panel || !overlay) return;
  panel.classList.remove('kanban-inspector-panel');
  panel.classList.remove('kanban-inspector-v2');
  panel.classList.remove('task-inspector-v2');
  panel.classList.remove('pack-designer-fullscreen-mode');
  panel.classList.remove('op-pack-fullscreen-modal');
  document.body.classList.remove('pack-designer-active');
  tabs.className = 'inspector-tabs';
  body.className = 'inspector-body';

  title.textContent = sop.title;
  sopInspectorActiveTab = initialTab;

  const tabList = ['نظرة عامة', 'الخطوات', 'Checklist', 'السلامة', 'الجودة', 'أخطاء شائعة', 'المكائن', 'المواد', 'Workflows', 'الإصدارات', 'النشاط', 'المرفقات', 'روابط'];

  function renderSopTab(tabIdx) {
    sopInspectorActiveTab = tabIdx;
    tabs.innerHTML = tabList.map((t, i) => `<button class="insp-tab ${i === tabIdx ? 'active' : ''}" onclick="renderSopInspectorTab('${sopId}', ${i})">${t}</button>`).join('');

    if (tabIdx === 0) {
      const issues = getSopIssues(sop);
      let issuesAlertHtml = '';
      if (issues.length > 0) {
        issuesAlertHtml = `
          <div class="sop-inspector-alerts" style="grid-column: 1 / -1; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12.5px; direction: rtl; text-align: right; box-sizing: border-box; width: 100%;">
            <h5 style="margin: 0 0 8px 0; color: #f59e0b; display: flex; align-items: center; gap: 6px; font-weight: bold;"><i class="fa-solid fa-circle-info"></i> تنبيهات وملاحظات الجودة والعمليات (${issues.length})</h5>
            <ul style="margin: 0; padding-right: 18px; color: var(--text-normal); display: flex; flex-direction: column; gap: 4px;">
              ${issues.map(iss => '<li style="color: ' + (iss.severity === 'error' ? '#f87171' : 'inherit') + '">' + escapeHtml(iss.text) + '</li>').join('')}
            </ul>
          </div>
        `;
      }
      body.innerHTML = `
        ${issuesAlertHtml}
        <div class="insp-section"><h4>الكود</h4><p>${sop.code}</p></div>
        <div class="insp-section"><h4>العنوان</h4><p>${sop.title}</p></div>
        <div class="insp-section"><h4>القسم</h4><p>${sop.department || '-'}</p></div>
        <div class="insp-section"><h4>الشعبة</h4><p>${sop.section || '-'}</p></div>
        <div class="insp-section"><h4>النوع</h4><p>${sop.type || '-'}</p></div>
        <div class="insp-section"><h4>المالك</h4><p>${sop.owner || '-'}</p></div>
        <div class="insp-section"><h4>الغرض</h4><p>${sop.purpose || '-'}</p></div>
        <div class="insp-section"><h4>الوصف</h4><p>${sop.description || sop.text || '-'}</p></div>
        <div class="insp-section"><h4>المهارة المطلوبة</h4><p>${sop.requiredSkill || '-'}</p></div>
        <div class="insp-section"><h4>الوقت المقدر</h4><p>${sop.estimatedMinutes ? sop.estimatedMinutes + ' دقيقة' : '-'}</p></div>
        <div class="insp-section"><h4>الأدوات المطلوبة</h4><p>${(sop.requiredTools||[]).join('، ') || '-'}</p></div>
        <div class="insp-section"><h4>المواد المطلوبة</h4><p>${(sop.requiredMaterials||[]).join('، ') || '-'}</p></div>
        <div class="insp-actions">
          <button class="btn-primary" onclick="editSopOverview('${sop.id}')"><i class="fa-solid fa-pen"></i> تعديل</button>
          <button class="btn-primary" onclick="duplicateSop('${sop.id}'); closeInspector();"><i class="fa-solid fa-copy"></i> نسخ</button>
          ${sop.approvalStatus !== 'approved' ? `<button class="btn-primary" style="background:#10b981" onclick="approveSop('${sop.id}'); openSopInspector('${sop.id}');"><i class="fa-solid fa-check"></i> اعتماد</button>` : ''}
          <button class="btn-secondary" onclick="printSop('${sop.id}')"><i class="fa-solid fa-print"></i> طباعة الإجراء</button>
          <button class="btn-danger" onclick="deleteSop('${sop.id}')"><i class="fa-solid fa-trash"></i> حذف</button>
        </div>
      `;
    } else if (tabIdx === 1) {
      const steps = sop.steps || [];
      body.innerHTML = `
        <div class="insp-section"><h4>خطوات التنفيذ (${steps.length})</h4>
          <ol class="insp-steps">${steps.map((s, i) => `<li class="sop-step-item">
            <b>${s.title || s.text || 'خطوة ' + (i+1)}</b>
            ${s.description ? `<p>${s.description}</p>` : ''}
            ${s.duration ? `<small>المدة: ${s.duration} دقيقة</small>` : ''}
            <button class="btn-xs btn-danger" onclick="removeSopStep('${sop.id}', ${i})"><i class="fa-solid fa-times"></i></button>
          </li>`).join('') || '<p>لا خطوات مضافة</p>'}</ol>
          <div style="margin-top:10px"><button class="btn-primary" onclick="addSopStep('${sop.id}')"><i class="fa-solid fa-plus"></i> إضافة خطوة</button></div>
        </div>
      `;
    } else if (tabIdx === 2) {
      const cl = sop.checklist || [];
      body.innerHTML = `
        <div class="insp-section"><h4>Checklist (${cl.length})</h4>
          <div class="insp-checklist">${cl.map((item, i) => `<div class="insp-check-item-row"><span>${item.text || item}</span><button class="btn-xs btn-danger" onclick="removeSopChecklist('${sop.id}', ${i})"><i class="fa-solid fa-times"></i></button></div>`).join('') || '<p>لا بنود</p>'}</div>
          <div style="margin-top:10px"><button class="btn-primary" onclick="addSopChecklist('${sop.id}')"><i class="fa-solid fa-plus"></i> إضافة بند</button></div>
        </div>
      `;
    } else if (tabIdx === 3) {
      const notes = sop.safetyNotes || [];
      body.innerHTML = `
        <div class="insp-section"><h4>ملاحظات السلامة (${notes.length})</h4>
          <ul class="insp-safety-list">${notes.map((n, i) => `<li><span>⚠️ ${typeof n === 'string' ? n : n.text}</span><button class="btn-xs btn-danger" onclick="removeSopSafety('${sop.id}', ${i})"><i class="fa-solid fa-times"></i></button></li>`).join('') || '<p>لا ملاحظات سلامة</p>'}</ul>
          <div style="margin-top:10px"><button class="btn-primary" onclick="addSopSafety('${sop.id}')"><i class="fa-solid fa-plus"></i> إضافة ملاحظة سلامة</button></div>
        </div>
      `;
    } else if (tabIdx === 4) {
      const qc = sop.qcCriteria || [];
      body.innerHTML = `
        <div class="insp-section"><h4>معايير الجودة (${qc.length})</h4>
          <ul class="insp-qc-list">${qc.map((c, i) => `<li><span>✅ ${typeof c === 'string' ? c : c.text}</span><button class="btn-xs btn-danger" onclick="removeSopQc('${sop.id}', ${i})"><i class="fa-solid fa-times"></i></button></li>`).join('') || '<p>لا معايير جودة</p>'}</ul>
          <div style="margin-top:10px"><button class="btn-primary" onclick="addSopQc('${sop.id}')"><i class="fa-solid fa-plus"></i> إضافة معيار جودة</button></div>
        </div>
      `;
    } else if (tabIdx === 5) {
      const mistakes = sop.commonMistakes || [];
      body.innerHTML = `
        <div class="insp-section"><h4>أخطاء شائعة (${mistakes.length})</h4>
          <ul class="insp-mistakes-list">${mistakes.map((m, i) => `<li><span>❌ ${typeof m === 'string' ? m : m.text}</span><button class="btn-xs btn-danger" onclick="removeSopMistake('${sop.id}', ${i})"><i class="fa-solid fa-times"></i></button></li>`).join('') || '<p>لا أخطاء مسجلة</p>'}</ul>
          <div style="margin-top:10px"><button class="btn-primary" onclick="addSopMistake('${sop.id}')"><i class="fa-solid fa-plus"></i> إضافة خطأ شائع</button></div>
        </div>
      `;
    } else if (tabIdx === 6) {
      const machines = (sop.machineIds || []).map(id => getMachineById(id)).filter(Boolean);
      body.innerHTML = `
        <div class="insp-section"><h4>المكائن المرتبطة (${machines.length})</h4>
          ${machines.map(m => `
            <div class="insp-linked-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; margin-bottom:8px;">
              <div>
                <b>${escapeHtml(m.name)}</b>
                <small class="muted" style="display:block;">${escapeHtml(m.type)} · ${escapeHtml(m.status)}</small>
              </div>
              <button class="btn-xs btn-danger" onclick="unlinkMachineFromSop('${sop.id}', '${m.id}')" title="إلغاء ربط الماكينة"><i class="fa-solid fa-unlink"></i></button>
            </div>
          `).join('') || '<p class="muted">لا توجد مكائن مرتبطة بهذا الإجراء.</p>'}
          <div style="margin-top:10px"><button class="btn-primary" onclick="linkMachineToSop('${sop.id}')"><i class="fa-solid fa-link"></i> ربط ماكينة</button></div>
        </div>
      `;
    } else if (tabIdx === 7) {
      const materials = (sop.materialIds || []).map(id => getMaterialById(id)).filter(Boolean);
      body.innerHTML = `
        <div class="insp-section"><h4>المواد المرتبطة (${materials.length})</h4>
          ${materials.map(m => {
            const avail = (typeof getMaterialAvailableQty === 'function') ? getMaterialAvailableQty(m) : (m.stock || 0);
            const low = avail <= (m.minimum || 0);
            return `
              <div class="insp-linked-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; margin-bottom:8px;">
                <div>
                  <b>${escapeHtml(m.name)}</b>
                  <small class="muted" style="display:block;">
                    الفئة: ${escapeHtml(m.category)} · المتاح: <b>${avail}</b> ${escapeHtml(m.unit || '')}
                    ${low ? `<span style="background:rgba(239,68,68,0.2); padding:1px 4px; border-radius:3px; font-size:10px; color:#f87171; margin-right:4px;">⚠️ مخزون منخفض</span>` : ''}
                  </small>
                </div>
                <button class="btn-xs btn-danger" onclick="unlinkMaterialFromSop('${sop.id}', '${m.id}')" title="إلغاء ربط المادة"><i class="fa-solid fa-unlink"></i></button>
              </div>
            `;
          }).join('') || '<p class="muted">لا توجد مواد مرتبطة بهذا الإجراء.</p>'}
          <div style="margin-top:10px"><button class="btn-primary" onclick="linkMaterialToSop('${sop.id}')"><i class="fa-solid fa-link"></i> ربط مادة</button></div>
        </div>
      `;
    } else if (tabIdx === 8) {
      const wfs = (sop.relatedWorkflowIds || []);
      const ops = (sop.relatedOperationPackIds || []).map(id => getOperationPackById(id)).filter(Boolean);
      body.innerHTML = `
        <div class="insp-section"><h4>Workflows مرتبطة (${wfs.length})</h4>
          ${wfs.map(id => `<div class="insp-linked-item"><b>${id}</b></div>`).join('') || '<p>لا workflows</p>'}
          <div style="margin-top:10px"><button class="btn-primary" onclick="linkWorkflowToSop('${sop.id}')"><i class="fa-solid fa-link"></i> ربط Workflow</button></div>
        </div>
        <div class="insp-section"><h4>باقات العمليات (${ops.length})</h4>
          ${ops.map(p => `<div class="insp-linked-item"><b>${p.name}</b><small>${p.description||''}</small></div>`).join('') || '<p>لا باقات</p>'}
          <div style="margin-top:10px"><button class="btn-primary" onclick="linkOpPackToSop('${sop.id}')"><i class="fa-solid fa-link"></i> ربط باقة</button></div>
        </div>
      `;
    } else if (tabIdx === 9) {
      const historyList = (sop.history || []).map(h => `
        <div class="sop-history-row" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:10px 12px; border-radius:6px; margin-bottom:8px;">
          <div>
            <b style="color:#60a5fa; font-size:13px;">الإصدار v${h.version}</b>
            <small class="muted" style="display:block; font-size:11px;">تاريخ الأرشفة: ${h.updatedAt}</small>
          </div>
          <button class="btn-secondary btn-sm" onclick="showSopDiffModal('${sop.id}', ${h.version})" style="font-size:11.5px; padding:4px 8px; height:28px;"><i class="fa-solid fa-code-compare"></i> قارن الفروقات</button>
        </div>
      `).join('') || '<p class="muted" style="font-size:12.5px;">لا توجد إصدارات سابقة مؤرشفة لهذا الإجراء.</p>';

      body.innerHTML = `
        <div class="insp-section" style="border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:16px; margin-bottom:16px;">
          <h4>معلومات الإصدار الحالي</h4>
          <div class="task-inspector-grid" style="grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <div><label>الإصدار الحالي</label><p style="margin:4px 0; font-size:14px; font-weight:bold; color:#60a5fa;">v${sop.version || 1}</p></div>
            <div><label>حالة الاعتماد</label><p style="margin:4px 0; font-size:13px; color:${({'draft':'#94a3b8','review':'#f59e0b','approved':'#10b981','archived':'#64748b'})[sop.approvalStatus]||'#94a3b8'}">${({'draft':'مسودة','review':'قيد المراجعة','approved':'معتمد','archived':'مؤرشف'})[sop.approvalStatus]||sop.approvalStatus}</p></div>
            <div><label>المعتمد</label><p style="margin:4px 0; font-size:13px;">${sop.approvedBy || '-'}</p></div>
            <div><label>آخر مراجعة</label><p style="margin:4px 0; font-size:13px;">${sop.lastReviewDate || '-'}</p></div>
          </div>
          <div class="insp-actions" style="margin-top:16px;">
            ${sop.approvalStatus !== 'approved' ? `<button class="btn-primary" style="background:#10b981" onclick="approveSop('${sop.id}'); openSopInspector('${sop.id}', 9);"><i class="fa-solid fa-check"></i> اعتماد الإجراء الحالي</button>` : ''}
            <button class="btn-primary" onclick="bumpSopVersion('${sop.id}')"><i class="fa-solid fa-arrow-up"></i> رفع الإصدار (إنشاء مسودة جديدة)</button>
          </div>
        </div>
        <div class="insp-section">
          <h4>سجل وأرشيف الإصدارات السابقة</h4>
          <div style="margin-top:12px;">
            ${historyList}
          </div>
        </div>
      `;
    } else if (tabIdx === 10) {
      body.innerHTML = `
        <div class="insp-section"><h4>سجل النشاط (${(sop.activityLog||[]).length})</h4>
          ${(sop.activityLog||[]).map(a => `<div class="insp-activity-item"><small>${a.date}</small><p>${a.text}</p></div>`).join('') || '<p>لا نشاط</p>'}
        </div>
      `;
    } else if (tabIdx === 11) {
      const attachments = sop.attachments || [];
      body.innerHTML = `
        <div class="insp-section">
          <h4>المرفقات (${attachments.length})</h4>
          <div class="sop-attachment-kpis">
            <div><b>${attachments.length}</b><span>مرفق</span></div>
            <div><b>${attachments.filter(a => /^https?:\/\//i.test(String(a.url || ''))).length}</b><span>روابط ويب</span></div>
            <div><b>${attachments.filter(a => !/^https?:\/\//i.test(String(a.url || ''))).length}</b><span>مسارات محلية/نسبية</span></div>
          </div>
          <div class="sop-attachment-list">
            ${attachments.map((att, idx) => `
              <div class="sop-attachment-row">
                <div>
                  <b>${escapeHtml(att.name || 'مرفق')}</b>
                  <small>${escapeHtml(att.url || '')}</small>
                  ${att.addedAt ? `<small>أضيف: ${escapeHtml(att.addedAt)}</small>` : ''}
                </div>
                <div class="sop-attachment-actions">
                  <button class="btn-xs btn-secondary" onclick="window.open('${jsString(att.url || '#')}', '_blank')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                  <button class="btn-xs btn-danger" onclick="removeSopAttachment('${sop.id}', ${idx})"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>
            `).join('') || '<p class="muted">لا توجد مرفقات لهذا SOP بعد.</p>'}
          </div>
          <div class="insp-actions"><button class="btn-primary" onclick="addSopAttachment('${sop.id}')"><i class="fa-solid fa-paperclip"></i> إضافة مرفق</button></div>
        </div>
      `;
    } else if (tabIdx === 12) {
      body.innerHTML = `
        <div class="insp-section">
          <h4>روابط وعلاقات</h4>
          ${renderEntityRelationsPanel('sop', sopId)}
        </div>
      `;
    }
  }

  renderSopTab(initialTab);
  window.renderSopInspectorTab = function(sid, idx) { renderSopTab(idx); };
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

// ─── SOP Edit Actions ───

async function editSopOverview(sopId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const html = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label>العنوان</label>
      <input type="text" id="esopTitle" class="form-input" value="${sop.title}">
      <label>القسم / الشعبة</label>
      <div style="display:flex; gap:10px;">
        <input type="text" id="esopDept" class="form-input" value="${sop.department || ''}" placeholder="القسم" style="flex:1;">
        <input type="text" id="esopSec" class="form-input" value="${sop.section || ''}" placeholder="الشعبة" style="flex:1;">
      </div>
      <label>النوع والمالك</label>
      <div style="display:flex; gap:10px;">
        <select id="esopType" class="form-input" style="flex:1;">
          <option value="تشغيلي" ${sop.type === 'تشغيلي' ? 'selected' : ''}>تشغيلي</option>
          <option value="إلزامي" ${sop.type === 'إلزامي' ? 'selected' : ''}>إلزامي</option>
          <option value="جودة" ${sop.type === 'جودة' ? 'selected' : ''}>جودة</option>
          <option value="صيانة" ${sop.type === 'صيانة' ? 'selected' : ''}>صيانة</option>
          <option value="سلامة" ${sop.type === 'سلامة' ? 'selected' : ''}>سلامة</option>
        </select>
        <input type="text" id="esopOwner" class="form-input" value="${sop.owner}" placeholder="المالك" style="flex:1;">
      </div>
      <label>الغرض والوصف</label>
      <input type="text" id="esopPurpose" class="form-input" value="${sop.purpose || ''}" placeholder="الغرض من الإجراء">
      <textarea id="esopDesc" class="form-input" placeholder="الوصف">${sop.description || sop.text || ''}</textarea>
      <label>المهارة المطلوبة والوقت المقدر (دقائق)</label>
      <div style="display:flex; gap:10px;">
        <input type="text" id="esopSkill" class="form-input" value="${sop.requiredSkill || ''}" style="flex:1;">
        <input type="number" id="esopMins" class="form-input" value="${sop.estimatedMinutes || 0}" style="flex:1;">
      </div>
      <label>الأدوات المطلوبة (مفصولة بفارزة)</label>
      <input type="text" id="esopTools" class="form-input" value="${(sop.requiredTools||[]).join('، ')}">
      <label>المواد المطلوبة (مفصولة بفارزة)</label>
      <input type="text" id="esopMats" class="form-input" value="${(sop.requiredMaterials||[]).join('، ')}">
    </div>
  `;
  const result = await showOmniModal('تعديل البيانات الأساسية لـ SOP', html, (body) => {
    return {
      title: body.querySelector('#esopTitle').value.trim() || sop.title,
      dept: body.querySelector('#esopDept').value.trim(),
      sec: body.querySelector('#esopSec').value.trim(),
      type: body.querySelector('#esopType').value,
      owner: body.querySelector('#esopOwner').value.trim() || sop.owner,
      purpose: body.querySelector('#esopPurpose').value.trim(),
      desc: body.querySelector('#esopDesc').value.trim(),
      skill: body.querySelector('#esopSkill').value.trim(),
      mins: parseInt(body.querySelector('#esopMins').value) || 0,
      tools: body.querySelector('#esopTools').value,
      mats: body.querySelector('#esopMats').value
    };
  });
  if (!result) return;
  sop.title = result.title;
  sop.department = result.dept;
  sop.section = result.sec;
  sop.type = result.type;
  sop.owner = result.owner;
  sop.purpose = result.purpose;
  sop.description = result.desc;
  sop.requiredSkill = result.skill;
  sop.estimatedMinutes = result.mins;
  sop.requiredTools = result.tools.split(/[,،]/).map(t => t.trim()).filter(Boolean);
  sop.requiredMaterials = result.mats.split(/[,،]/).map(t => t.trim()).filter(Boolean);
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم تعديل البيانات الأساسية' });
  saveData();
  renderSopHub();
  openSopInspector(sopId);
}

async function addSopStep(sopId) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const result = await showOmniModal('إضافة خطوة SOP', `
    <label>عنوان الخطوة</label><input id="sopStepTitle" class="form-input">
    <label>وصف الخطوة</label><textarea id="sopStepDesc" class="form-input"></textarea>
    <label>المدة بالدقائق</label><input id="sopStepDuration" type="number" class="form-input" value="0">
  `, body => ({ title: body.querySelector('#sopStepTitle')?.value.trim(), desc: body.querySelector('#sopStepDesc')?.value.trim() || '', dur: Number(body.querySelector('#sopStepDuration')?.value) || 0 }));
  if (!result?.title) return;
  const { title, desc, dur } = result;
  sop.steps.push({ title, description: desc, duration: dur ? parseInt(dur) : 0 });
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم إضافة خطوة: ' + title });
  saveData();
  openSopInspector(sopId);
  window.renderSopInspectorTab(sopId, 1);
}

function removeSopStep(sopId, idx) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.steps.splice(idx, 1);
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم حذف خطوة' });
  saveData();
  window.renderSopInspectorTab(sopId, 1);
}

async function addSopChecklist(sopId) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const text = await showOmniPrompt('بند Checklist:');
  if (!text) return;
  sop.checklist.push({ text });
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم إضافة بند checklist' });
  saveData();
  window.renderSopInspectorTab(sopId, 2);
}

function removeSopChecklist(sopId, idx) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.checklist.splice(idx, 1);
  sop.updatedAt = todayISO();
  saveData();
  window.renderSopInspectorTab(sopId, 2);
}

async function addSopSafety(sopId) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const text = await showOmniPrompt('ملاحظة السلامة:');
  if (!text) return;
  sop.safetyNotes.push(text);
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم إضافة ملاحظة سلامة' });
  saveData();
  window.renderSopInspectorTab(sopId, 3);
}

function removeSopSafety(sopId, idx) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.safetyNotes.splice(idx, 1);
  sop.updatedAt = todayISO();
  saveData();
  window.renderSopInspectorTab(sopId, 3);
}

async function addSopQc(sopId) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const text = await showOmniPrompt('معيار الجودة:');
  if (!text) return;
  sop.qcCriteria.push(text);
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم إضافة معيار جودة' });
  saveData();
  window.renderSopInspectorTab(sopId, 4);
}

function removeSopQc(sopId, idx) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.qcCriteria.splice(idx, 1);
  sop.updatedAt = todayISO();
  saveData();
  window.renderSopInspectorTab(sopId, 4);
}

async function addSopMistake(sopId) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const text = await showOmniPrompt('الخطأ الشائع:');
  if (!text) return;
  sop.commonMistakes.push(text);
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم إضافة خطأ شائع' });
  saveData();
  window.renderSopInspectorTab(sopId, 5);
}

function removeSopMistake(sopId, idx) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.commonMistakes.splice(idx, 1);
  sop.updatedAt = todayISO();
  saveData();
  window.renderSopInspectorTab(sopId, 5);
}

async function linkMachineToSop(sopId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const options = (omni.machines||[]).map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  const machineId = await showOmniModal('ربط ماكينة', `<select id="sopMachineLink" class="form-input"><option value="">اختر ماكينة</option>${options}</select>`, body => body.querySelector('#sopMachineLink')?.value || '');
  const mach = (omni.machines||[]).find(m => m.id === machineId);
  if (mach && !sop.machineIds.includes(mach.id)) {
    sop.machineIds.push(mach.id);
    sop.updatedAt = todayISO();
    sop.activityLog.push({ date: todayISO(), text: 'تم ربط ماكينة: ' + mach.name });
    saveData();
    window.renderSopInspectorTab(sopId, 6);
  }
}

async function linkMaterialToSop(sopId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const options = (omni.materials||[]).map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  const materialId = await showOmniModal('ربط مادة', `<select id="sopMaterialLink" class="form-input"><option value="">اختر مادة</option>${options}</select>`, body => body.querySelector('#sopMaterialLink')?.value || '');
  const mat = (omni.materials||[]).find(m => m.id === materialId);
  if (mat && !sop.materialIds.includes(mat.id)) {
    sop.materialIds.push(mat.id);
    sop.updatedAt = todayISO();
    sop.activityLog.push({ date: todayISO(), text: 'تم ربط مادة: ' + mat.name });
    saveData();
    window.renderSopInspectorTab(sopId, 7);
  }
}

async function linkWorkflowToSop(sopId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const options = (omni.workflow.nodes||[]).map(n => `<option value="${n.id}">${escapeHtml(n.title)}</option>`).join('');
  const nodeId = await showOmniModal('ربط Workflow', `<select id="sopWorkflowLink" class="form-input"><option value="">اختر عقدة</option>${options}</select>`, body => body.querySelector('#sopWorkflowLink')?.value || '');
  const node = (omni.workflow.nodes||[]).find(n => n.id === nodeId);
  if (node && !sop.relatedWorkflowIds.includes(node.id)) {
    sop.relatedWorkflowIds.push(node.id);
    sop.updatedAt = todayISO();
    sop.activityLog.push({ date: todayISO(), text: 'تم ربط workflow: ' + node.title });
    saveData();
    window.renderSopInspectorTab(sopId, 8);
  }
}

async function linkOpPackToSop(sopId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const options = (omni.opPacks||[]).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const packId = await showOmniModal('ربط باقة عمليات', `<select id="sopPackLink" class="form-input"><option value="">اختر باقة</option>${options}</select>`, body => body.querySelector('#sopPackLink')?.value || '');
  const pack = (omni.opPacks||[]).find(p => p.id === packId);
  if (pack && !sop.relatedOperationPackIds.includes(pack.id)) {
    sop.relatedOperationPackIds.push(pack.id);
    sop.updatedAt = todayISO();
    sop.activityLog.push({ date: todayISO(), text: 'تم ربط باقة: ' + pack.name });
    saveData();
    window.renderSopInspectorTab(sopId, 8);
  }
}

function bumpSopVersion(sopId) {
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  if (!Array.isArray(sop.history)) sop.history = [];
  
  sop.history.push({
    version: sop.version || 1,
    title: sop.title,
    code: sop.code || '',
    description: sop.description || sop.text || '',
    steps: JSON.parse(JSON.stringify(sop.steps || [])),
    checklist: JSON.parse(JSON.stringify(sop.checklist || [])),
    safetyNotes: JSON.parse(JSON.stringify(sop.safetyNotes || [])),
    qcCriteria: JSON.parse(JSON.stringify(sop.qcCriteria || [])),
    commonMistakes: JSON.parse(JSON.stringify(sop.commonMistakes || [])),
    updatedAt: sop.updatedAt || todayISO(),
    approvedBy: sop.approvedBy || ''
  });

  sop.version = (sop.version || 1) + 1;
  sop.approvalStatus = 'draft';
  sop.approvedBy = '';
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم رفع الإصدار إلى v' + sop.version });
  saveData();
  showToast('تم رفع الإصدار إلى v' + sop.version, 'success');
  openSopInspector(sopId);
}

async function deleteSop(sopId) {
  const ok = await showOmniConfirm('حذف SOP', 'هل أنت متأكد من حذف هذا SOP؟', 'حذف', 'إلغاء');
  if (!ok) return;
  ensureOmni();
  omni.sops = omni.sops.filter(s => s.id !== sopId);
  saveData();
  closeInspector();
  renderSopHub();
  showToast('تم حذف SOP', 'success');
}

function editSop(sopId) { openSopInspector(sopId); }

function printSop(sopId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  
  const steps = (sop.steps || []).map((s, i) => `
    <div style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px dashed #eee;">
      <b>الخطوة ${i+1}: ${escapeHtml(s.title || s.text || '')}</b>
      ${s.description ? `<p style="margin:4px 0 0 0; font-size:13px; color:#475569;">${escapeHtml(s.description)}</p>` : ''}
      ${s.duration ? `<small style="color:#64748b;">المدة المقدرة: ${s.duration} دقيقة</small>` : ''}
    </div>
  `).join('') || '<p>لا توجد خطوات مضافة.</p>';

  const cl = (sop.checklist || []).map(item => `
    <div style="margin-bottom:8px; display:flex; align-items:center; gap:8px;">
      <span style="border:1px solid #ccc; width:14px; height:14px; display:inline-block; border-radius:2px;"></span>
      <span>${escapeHtml(item.text || item)}</span>
    </div>
  `).join('') || '<p>لا توجد بنود.</p>';

  const safety = (sop.safetyNotes || []).map(n => `
    <div style="margin-bottom:6px; color:#c2410c;">⚠️ ${escapeHtml(typeof n === 'string' ? n : n.text)}</div>
  `).join('') || '<p>لا توجد ملاحظات سلامة.</p>';

  const qc = (sop.qcCriteria || []).map(c => `
    <div style="margin-bottom:6px; color:#15803d;">✅ ${escapeHtml(typeof c === 'string' ? c : c.text)}</div>
  `).join('') || '<p>لا توجد معايير جودة مضافة.</p>';

  const mistakes = (sop.commonMistakes || []).map(m => `
    <div style="margin-bottom:6px; color:#b91c1c;">❌ ${escapeHtml(typeof m === 'string' ? m : m.text)}</div>
  `).join('') || '<p>لا توجد أخطاء مسجلة.</p>';

  const machines = (sop.machineIds || []).map(id => getMachineById(id)).filter(Boolean).map(m => m.name).join('، ') || 'لا يوجد';
  const materials = (sop.materialIds || []).map(id => getMaterialById(id)).filter(Boolean).map(m => m.name).join('، ') || 'لا يوجد';

  const w = window.open('', '_blank');
  w.document.write(`
    <html>
      <head>
        <title>SOP: ${escapeHtml(sop.title)}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; padding: 40px; color: #1e293b; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 30px; }
          .title-section h1 { margin: 0 0 8px 0; font-size: 24px; color: #0f172a; }
          .title-section p { margin: 0; font-size: 14px; color: #64748b; }
          .meta-badge { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 13px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .section-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; background: #f8fafc; }
          .section-card h3 { margin: 0 0 12px 0; font-size: 15px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
          .content-block { margin-bottom: 30px; }
          .content-block h2 { font-size: 18px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 16px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title-section">
            <h1>${escapeHtml(sop.title)}</h1>
            <p>كود الإجراء: <b>${escapeHtml(sop.code || '-')}</b> | القسم: <b>${escapeHtml(sop.department || 'عام')}</b></p>
          </div>
          <div class="meta-badge">إصدار v${sop.version || 1} · ${sop.approvalStatus === 'approved' ? 'معتمد' : 'مسودة'}</div>
        </div>

        <div class="grid">
          <div class="section-card">
            <h3>📌 نظرة عامة</h3>
            <p style="margin:4px 0;"><b>المالك المسؤول:</b> ${escapeHtml(sop.owner || '-')}</p>
            <p style="margin:4px 0;"><b>الغرض الأساسي:</b> ${escapeHtml(sop.purpose || '-')}</p>
            <p style="margin:4px 0;"><b>المهارة المطلوبة:</b> ${escapeHtml(sop.requiredSkill || '-')}</p>
            <p style="margin:4px 0;"><b>الوقت القياسي للعملية:</b> ${sop.estimatedMinutes ? sop.estimatedMinutes + ' دقيقة' : '-'}</p>
          </div>
          <div class="section-card">
            <h3>⚙️ الموارد والمعدات</h3>
            <p style="margin:4px 0;"><b>المكائن المرتبطة:</b> ${escapeHtml(machines)}</p>
            <p style="margin:4px 0;"><b>المواد المطلوبة:</b> ${escapeHtml(materials)}</p>
            <p style="margin:4px 0;"><b>الأدوات المساعدة:</b> ${escapeHtml((sop.requiredTools||[]).join('، ') || '-')}</p>
          </div>
        </div>

        <div class="content-block">
          <h2>📋 خطوات التنفيذ القياسية (Standard Operating Steps)</h2>
          ${steps}
        </div>

        <div class="grid">
          <div class="section-card">
            <h3>⚠️ السلامة والوقاية</h3>
            ${safety}
          </div>
          <div class="section-card">
            <h3>✅ معايير الجودة والقبول</h3>
            ${qc}
          </div>
        </div>

        <div class="grid">
          <div class="section-card">
            <h3>📋 قائمة فحص التدقيق (Acceptance Checklist)</h3>
            ${cl}
          </div>
          <div class="section-card">
            <h3>❌ أخطاء شائعة يجب تجنبها</h3>
            ${mistakes}
          </div>
        </div>

        <div style="text-align:center; margin-top:40px; font-size:11px; color:#94a3b8; border-top:1px solid #eee; padding-top:10px;">
          Octagon ERP System · نظام إدارة الجودة والتصنيع المتكامل
        </div>

        <script>
          setTimeout(function() {
            window.print();
          }, 300);
        <\/script>
      </body>
    </html>
  `);
  w.document.close();
}

function unlinkMachineFromSop(sopId, machineId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.machineIds = (sop.machineIds || []).filter(id => id !== machineId);
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم إزالة ربط ماكينة: ' + (getMachineById(machineId)?.name || machineId) });
  saveData();
  window.renderSopInspectorTab(sopId, 6);
  showToast('تم إزالة ربط الماكينة بنجاح', 'info');
}

function unlinkMaterialFromSop(sopId, materialId) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  sop.materialIds = (sop.materialIds || []).filter(id => id !== materialId);
  sop.updatedAt = todayISO();
  sop.activityLog.push({ date: todayISO(), text: 'تم إزالة ربط مادة: ' + (getMaterialById(materialId)?.name || materialId) });
  saveData();
  window.renderSopInspectorTab(sopId, 7);
  showToast('تم إزالة ربط المادة بنجاح', 'info');
}

async function showSopDiffModal(sopId, oldVerNum) {
  ensureOmni();
  const sop = omni.sops.find(s => s.id === sopId);
  if (!sop) return;
  const historyItem = (sop.history || []).find(h => h.version === oldVerNum);
  if (!historyItem) {
    showToast('لم يتم العثور على النسخة المؤرشفة للإصدار v' + oldVerNum, 'error');
    return;
  }

  const titleDiff = getSimpleTextDiff(historyItem.title, sop.title);
  const descDiff = getSimpleTextDiff(historyItem.description || historyItem.text || '', sop.description || sop.text || '');
  const stepsDiff = getArrayDiff(historyItem.steps, sop.steps);
  const checklistDiff = getArrayDiff(historyItem.checklist, sop.checklist);
  const safetyDiff = getArrayDiff(historyItem.safetyNotes, sop.safetyNotes);
  const qcDiff = getArrayDiff(historyItem.qcCriteria, sop.qcCriteria);
  const mistakesDiff = getArrayDiff(historyItem.commonMistakes, sop.commonMistakes);

  const html = `
    <div style="direction:rtl; text-align:right; max-height: 70vh; overflow-y: auto; padding: 10px 16px;">
      <p style="margin-bottom: 20px; color: var(--text-muted);">أنت تقوم الآن بمقارنة التعديلات التي تمت بين <b>الإصدار المؤرشف v${oldVerNum}</b> و<b>الإصدار الحالي v${sop.version || 1}</b>.</p>
      
      <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
        <h4 style="color:#60a5fa; margin:0 0 8px 0;"><i class="fa-solid fa-heading"></i> عنوان الإجراء (SOP Title)</h4>
        ${titleDiff}
      </div>

      <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
        <h4 style="color:#60a5fa; margin:0 0 8px 0;"><i class="fa-solid fa-align-right"></i> الوصف والغرض (Description)</h4>
        ${descDiff}
      </div>

      <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
        <h4 style="color:#60a5fa; margin:0 0 8px 0;"><i class="fa-solid fa-list-ol"></i> خطوات التنفيذ (Steps)</h4>
        ${stepsDiff}
      </div>

      <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
        <h4 style="color:#60a5fa; margin:0 0 8px 0;"><i class="fa-solid fa-square-check"></i> قائمة فحص التدقيق (Checklist)</h4>
        ${checklistDiff}
      </div>

      <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
        <h4 style="color:#60a5fa; margin:0 0 8px 0;"><i class="fa-solid fa-triangle-exclamation"></i> إرشادات السلامة (Safety Notes)</h4>
        ${safetyDiff}
      </div>

      <div style="margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
        <h4 style="color:#60a5fa; margin:0 0 8px 0;"><i class="fa-solid fa-shield-halved"></i> معايير الجودة (QC Criteria)</h4>
        ${qcDiff}
      </div>

      <div style="margin-bottom: 16px;">
        <h4 style="color:#60a5fa; margin:0 0 8px 0;"><i class="fa-solid fa-circle-xmark"></i> أخطاء شائعة (Common Mistakes)</h4>
        ${mistakesDiff}
      </div>
    </div>
  `;

  await showOmniModal(`مقارنة الفروقات لـ ${sop.code || ''}`, html, () => true);
}