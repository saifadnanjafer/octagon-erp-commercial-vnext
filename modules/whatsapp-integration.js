/*
 * OCTAGON OMNISYSTEM - modules/whatsapp-integration.js
 *
 * T4.1 (Phase 4 de-monolith): the WhatsApp integration cluster, moved VERBATIM
 * out of app.js (move != improve — no refactoring). These are classic-script
 * top-level functions, so they remain window globals exactly as before; loaded
 * AFTER app.js so their runtime references to app.js helpers resolve normally.
 * Three original app.js blocks, concatenated in file order:
 *   A  group manager / analytics / image ingest / deprecated dups / filterWaGroup
 *   B  WHATSAPP_SIMULATION_PRESETS + classify/match/suggestions/simulator
 *   C  Meta API config + renderWhatsAppIntegrationPage + setWaTab
 */

function addWhatsAppGroup() {
  normalizeAiIntegrationData();
  const name = document.getElementById('waNewGroupName')?.value?.trim();
  const type = document.getElementById('waNewGroupType')?.value || 'workshop_general';
  const emoji = document.getElementById('waNewGroupEmoji')?.value?.trim() || '📡';
  if (!name) return showToast('ادخل اسم المجموعة', 'warning');
  omni.whatsappGroups.push({ id: makeId('group'), name, type, emoji, members: [], active: true, createdAt: new Date().toISOString() });
  saveData();
  showToast(`تمت إضافة المجموعة: ${name}`, 'success');
  renderWhatsAppIntegrationPage();
}

function removeWhatsAppGroup(id) {
  normalizeAiIntegrationData();
  const idx = omni.whatsappGroups.findIndex(g => g.id === id);
  if (idx === -1) return;
  omni.whatsappGroups.splice(idx, 1);
  saveData();
  showToast('تم حذف المجموعة', 'info');
  renderWhatsAppIntegrationPage();
}

function toggleWhatsAppGroupActive(id) {
  normalizeAiIntegrationData();
  const group = omni.whatsappGroups.find(g => g.id === id);
  if (!group) return;
  group.active = !group.active;
  saveData();
  renderWhatsAppIntegrationPage();
}

// ─── WhatsApp Image Upload Analysis ──────────────────────────────────────────
function analyzeWhatsAppImageAttachment(file, caption) {
  normalizeAiIntegrationData();
  const orgProfile = getActiveOrgProfile();
  const captionText = caption || file.name || '';
  const syntheticLine = `صورة: ${captionText} (${file.name})`;
  const suggestion = buildWhatsAppSuggestionFromLine(syntheticLine);
  suggestion.source = 'image_upload';
  suggestion.companyId = orgProfile.companyId;
  suggestion.companyName = orgProfile.companyName;
  suggestion.currency = orgProfile.currency;
  suggestion.currencySymbol = orgProfile.currencySymbol;
  suggestion.senderName = 'مستخدم النظام';
  suggestion.senderPhone = 'رفع مباشر';
  const reader = new FileReader();
  reader.onload = (e) => {
    suggestion.imageDataUrl = e.target.result;
    suggestion.attachmentPlaceholders = [{ type: 'image', label: 'صورة مرفوعة', fileName: file.name, fileSize: `${(file.size/1024).toFixed(0)} KB`, confidence: 85, status: 'uploaded', dataUrl: e.target.result }];
    omni.whatsappSuggestions.unshift(suggestion);
    omni.whatsappIngestHistory.unshift({ id: makeId('wa_batch'), createdAt: new Date().toISOString(), count: 1, source: 'image_upload', companyId: orgProfile.companyId, companyName: orgProfile.companyName, currency: orgProfile.currency, currencySymbol: orgProfile.currencySymbol, matched: (suggestion.entityMatches||[]).length, attachments: 1 });
    saveData();
    showToast(`تم تحليل الصورة: ${file.name}`, 'success');
    renderWhatsAppIntegrationPage();
  };
  reader.readAsDataURL(file);
}

function handleWhatsAppImageDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const dropZone = document.getElementById('waImageDropZone');
  if (dropZone) dropZone.classList.remove('wa-drop-active');
  const files = Array.from(event.dataTransfer?.files || event.target?.files || []);
  const caption = document.getElementById('waImageCaption')?.value?.trim() || '';
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) return showToast('اختر صورة صالحة (JPG, PNG, WEBP)', 'warning');
  imageFiles.forEach(file => analyzeWhatsAppImageAttachment(file, caption));
}

function handleWhatsAppImageDropzone(event) {
  event.preventDefault();
  const dropZone = document.getElementById('waImageDropZone');
  if (event.type === 'dragover' && dropZone) dropZone.classList.add('wa-drop-active');
  if (event.type === 'dragleave' && dropZone) dropZone.classList.remove('wa-drop-active');
}

// ─── WhatsApp File Export Import ──────────────────────────────────────────────
function importWhatsAppFileExport(event) {
  normalizeAiIntegrationData();
  const orgProfile = getActiveOrgProfile();
  const file = event.target?.files?.[0];
  if (!file) return;
  const groupId = document.getElementById('waGroupFilter')?.value || '';
  const group = omni.whatsappGroups.find(g => g.id === groupId);
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const exportLines = text.split(/\r?\n/).filter(Boolean);
    const messageLines = [];
    exportLines.forEach(line => {
      const match = line.match(/^\[?\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-‎]?\s*([^:]+):\s*(.+)$/);
      if (match) {
        const sender = match[1].trim();
        const msgText = match[2].trim();
        if (msgText && !msgText.startsWith('‎') && msgText !== '<Media omitted>') messageLines.push({ sender, text: msgText });
      } else if (!/^\[?\d/.test(line) && messageLines.length) {
        messageLines[messageLines.length - 1].text += ' ' + line.trim();
      }
    });
    if (!messageLines.length) return showToast('لم يتم العثور على رسائل صالحة في هذا الملف. تأكد من تنسيق WhatsApp المعياري.', 'warning');
    const created = messageLines.map(msg => {
      const s = buildWhatsAppSuggestionFromLine(msg.text);
      s.senderName = msg.sender;
      s.source = 'file_export';
      s.groupId = groupId;
      s.groupName = group?.name || '';
      s.companyId = orgProfile.companyId;
      s.companyName = orgProfile.companyName;
      s.currency = orgProfile.currency;
      s.currencySymbol = orgProfile.currencySymbol;
      return s;
    });
    omni.whatsappSuggestions.unshift(...created);
    omni.whatsappIngestHistory.unshift({ id: makeId('wa_batch'), createdAt: new Date().toISOString(), count: created.length, source: 'file_export', fileName: file.name, groupId, groupName: group?.name || '', companyId: orgProfile.companyId, companyName: orgProfile.companyName, currency: orgProfile.currency, currencySymbol: orgProfile.currencySymbol, matched: created.filter(s => (s.entityMatches||[]).length).length, attachments: created.reduce((sum,s) => sum+(s.attachmentPlaceholders||[]).length,0) });
    saveData();
    showToast(`تم استيراد وتحليل ${created.length} رسالة من ${file.name}`, 'success');
    renderWhatsAppIntegrationPage();
  };
  reader.readAsText(file, 'utf-8');
  event.target.value = '';
}

// ─── WhatsApp Analytics Dashboard ────────────────────────────────────────────
function renderWhatsAppAnalyticsDashboard() {
  normalizeAiIntegrationData();
  const suggestions = omni.whatsappSuggestions || [];
  const total = suggestions.length;
  const pending = suggestions.filter(s => s.status === 'pending').length;
  const approved = suggestions.filter(s => s.status === 'approved').length;
  const rejected = suggestions.filter(s => s.status === 'rejected').length;
  const groups = omni.whatsappGroups || [];
  const typeLabels = { machine_fault:'عطل ماكينة', material_request:'طلب مواد', inventory_request:'مخزون', attendance_event:'دوام', attendance_request:'دوام', qc_issue:'جودة', purchase_invoice:'فاتورة', finance_request:'مالية', task:'مهمة', job_completed:'مكتمل', delivery_complete:'تسليم', new_order:'طلب جديد', customer_request:'عميل', voice_note:'صوتي', unknown:'غير مصنف' };
  const typeColors = { machine_fault:'#f87171', qc_issue:'#fb923c', material_request:'#38bdf8', inventory_request:'#38bdf8', attendance_event:'#a78bfa', attendance_request:'#a78bfa', purchase_invoice:'#34d399', finance_request:'#34d399', task:'#818cf8', job_completed:'#34d399', delivery_complete:'#06b6d4', new_order:'#fbbf24', customer_request:'#fbbf24', voice_note:'#64748b', unknown:'#475569' };
  const typeCounts = {};
  suggestions.forEach(s => { typeCounts[s.type] = (typeCounts[s.type]||0)+1; });
  const stale = suggestions.filter(s => s.status === 'pending' && (Date.now()-new Date(s.createdAt||Date.now()))/3600000 > 24);
  const senderCounts = {};
  suggestions.forEach(s => { if (s.senderName) senderCounts[s.senderName] = (senderCounts[s.senderName]||0)+1; });
  const topSenders = Object.entries(senderCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const typeEntries = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]);
  const maxCount = Math.max(1,...typeEntries.map(e=>e[1]));
  const approvalRate = total ? Math.round((approved/total)*100) : 0;
  const r=36, circ=2*Math.PI*r, dash=(approvalRate/100)*circ;
  const barChartHtml = typeEntries.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">${typeEntries.map(([type,count])=>`<div style="display:flex;align-items:center;gap:8px;font-size:12px;"><span style="min-width:90px;text-align:right;direction:rtl;color:var(--text-muted);">${escapeHtml(typeLabels[type]||type)}</span><div style="flex:1;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;height:16px;"><div style="width:${Math.round((count/maxCount)*100)}%;height:100%;background:${typeColors[type]||'#818cf8'};border-radius:4px;transition:width 0.4s;min-width:4px;"></div></div><b style="min-width:24px;font-size:11px;">${count}</b></div>`).join('')}</div>` : '<p class="muted">لا توجد بيانات بعد</p>';
  return `
    <div class="automation-panel" style="margin-top:0;">
      <div class="automation-section-head"><h3>📊 لوحة التحليل والمراقبة</h3></div>
      <div class="automation-kpis" style="margin-bottom:16px;">
        <div style="border-inline-start:4px solid var(--warning)"><span>بانتظار مراجعة</span><b>${pending}</b></div>
        <div style="border-inline-start:4px solid var(--success)"><span>معتمدة</span><b>${approved}</b></div>
        <div style="border-inline-start:4px solid var(--danger)"><span>مرفوضة</span><b>${rejected}</b></div>
        <div style="border-inline-start:4px solid var(--accent-cyan)"><span>إجمالي</span><b>${total}</b></div>
      </div>
      ${stale.length ? `<div class="automation-fire-row" style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:8px;padding:10px;margin-bottom:16px;direction:rtl;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i> <b style="color:var(--danger);">تحذير:</b> يوجد <b>${stale.length}</b> اقتراح معلق منذ أكثر من 24 ساعة يحتاج مراجعة</div>` : ''}
      <div class="automation-layout" style="grid-template-columns:1fr 180px;">
        <div>
          <h4 style="margin-bottom:12px;font-size:13px;color:var(--accent-cyan);"><i class="fa-solid fa-chart-bar"></i> تصنيف الرسائل حسب النوع</h4>
          ${barChartHtml}
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10"/>
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--success)" stroke-width="10"
              stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}"
              stroke-dashoffset="${(circ/4).toFixed(1)}" stroke-linecap="round"
              style="transition:stroke-dasharray 0.6s ease;"/>
            <text x="50" y="46" text-anchor="middle" fill="#fff" font-size="14" font-weight="bold" font-family="Outfit,sans-serif">${approvalRate}%</text>
            <text x="50" y="60" text-anchor="middle" fill="#64748b" font-size="8" font-family="Outfit,sans-serif">اعتماد</text>
          </svg>
          <span style="font-size:10px;color:var(--text-muted);text-align:center;">معدل اعتماد الاقتراحات</span>
        </div>
      </div>
      ${topSenders.length ? `<div style="margin-top:16px;"><h4 style="margin-bottom:10px;font-size:13px;color:var(--accent-blue);"><i class="fa-solid fa-users"></i> أكثر المرسلين نشاطاً</h4><div style="display:flex;flex-direction:column;gap:6px;">${topSenders.map(([name,count],i)=>`<div style="display:flex;align-items:center;gap:10px;font-size:12px;background:rgba(255,255,255,0.02);padding:6px 10px;border-radius:6px;"><span style="color:var(--text-muted);min-width:16px;">${i+1}.</span><span style="flex:1;direction:rtl;">${escapeHtml(name)}</span><span class="analytics-risk-badge" style="background:rgba(56,189,248,0.15);color:var(--accent-cyan);">${count} رسالة</span></div>`).join('')}</div></div>` : ''}
      <div style="margin-top:16px;"><h4 style="margin-bottom:10px;font-size:13px;color:var(--text-muted);"><i class="fa-brands fa-whatsapp"></i> المجموعات المسجلة</h4><div style="display:flex;flex-wrap:wrap;gap:6px;">${groups.map(g=>`<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;font-size:12px;display:flex;align-items:center;gap:6px;"><span>${g.emoji}</span><span>${escapeHtml(g.name)}</span><span class="analytics-risk-badge" style="background:${g.active?'var(--success)':'rgba(255,255,255,0.1)'};font-size:9px;">${g.active?'نشط':'موقف'}</span></div>`).join('')}</div></div>
    </div>
  `;
}

// ─── WhatsApp Group Manager Panel ─────────────────────────────────────────────
function renderWhatsAppGroupManagerPanel() {
  normalizeAiIntegrationData();
  const groups = omni.whatsappGroups || [];
  return `
    <div class="automation-panel" style="margin-top:0;">
      <div class="automation-section-head">
        <h3>📱 إدارة مجموعات WhatsApp</h3>
        <span class="analytics-risk-badge" style="background:var(--accent-blue)">${groups.length} مجموعة</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;margin-bottom:16px;">
        ${groups.map(g=>`<div class="automation-rule-card" style="border-inline-start:4px solid ${g.active?'var(--success)':'rgba(255,255,255,0.1)'};padding:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"><span style="font-size:20px;">${g.emoji}</span><span class="analytics-risk-badge" style="background:${g.active?'rgba(52,211,153,0.15)':'rgba(255,255,255,0.05)'};color:${g.active?'var(--success)':'var(--text-muted)'};font-size:10px;">${g.active?'نشط':'موقف'}</span></div>
          <div style="font-weight:bold;font-size:13px;margin-bottom:4px;direction:rtl;">${escapeHtml(g.name)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;direction:rtl;">${escapeHtml(g.type)}</div>
          <div style="display:flex;gap:6px;">
            <button class="btn-secondary" style="flex:1;font-size:10px;padding:4px;" onclick="toggleWhatsAppGroupActive('${g.id}')">${g.active?'إيقاف':'تفعيل'}</button>
            <button class="btn-secondary" style="font-size:10px;padding:4px 8px;color:var(--danger);" onclick="removeWhatsAppGroup('${g.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`).join('')}
      </div>
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:14px;">
        <h4 style="margin-bottom:10px;font-size:12px;color:var(--accent-cyan);"><i class="fa-solid fa-plus"></i> إضافة مجموعة جديدة</h4>
        <div style="display:grid;grid-template-columns:2fr 1fr 60px auto;gap:8px;align-items:end;">
          <label class="field" style="margin:0"><span style="font-size:10px;">اسم المجموعة</span><input id="waNewGroupName" placeholder="مثال: ورشة الليزر" style="font-size:12px;"></label>
          <label class="field" style="margin:0"><span style="font-size:10px;">نوع المجموعة</span><select id="waNewGroupType" style="font-size:12px;"><option value="workshop_general">ورشة عامة</option><option value="material_requests">طلبات مواد</option><option value="qc_issues">جودة / QC</option><option value="attendance">دوام / حضور</option><option value="management">إدارة / مبيعات</option></select></label>
          <label class="field" style="margin:0"><span style="font-size:10px;">أيقونة</span><input id="waNewGroupEmoji" value="📡" maxlength="4" style="font-size:18px;text-align:center;padding:4px;"></label>
          <button class="btn-primary" style="height:38px;font-size:12px;white-space:nowrap;" onclick="addWhatsAppGroup()"><i class="fa-solid fa-plus"></i> إضافة</button>
        </div>
      </div>
    </div>
  `;
}

// ─── WhatsApp Simulator Panel ─────────────────────────────────────────────────
// T0.4 dedup (2026-07-12): dead copy — FLAG for owner: this dead version has
// 11 preset simulation messages (voice_leave, machine_defect, invoice_wood,
// print_task, material_request, job_completed, delivery_done, new_order,
// urgent_qc, attendance_late, machine_maintenance); the live version below
// has only 4 (voice_leave, machine_defect, invoice_wood, print_task) — this
// is NOT a simple "later=richer" case like every other rename in this
// batch, the live one actually has fewer options. Preserving current live
// behavior per T0.4's scope (mechanical dedup, not a product decision on
// which preset list is correct) — NOT merged back in. Kept per add-only
// rule.
function renderWhatsAppSimulatorPanel_deprecated_dup1() {
  return `
    <div class="automation-panel" style="margin-top:20px;">
      <div class="automation-section-head">
        <h3>⚡ محاكي بوابة WhatsApp Business API</h3>
        <span class="analytics-risk-badge" style="background:var(--success)">نشط (Simulated)</span>
      </div>
      <div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
        <p style="font-size:12px;margin-bottom:8px;color:var(--text-muted);direction:rtl;text-align:right;">محاكاة وصول رسالة حقيقية من الورشة عبر Webhook.</p>
        <div class="automation-rule-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
          <label class="field">
            <span>الرسالة الجاهزة (Preset)</span>
            <select id="waPresetSelect" style="width:100%;">
              <option value="voice_leave">🎤 طلب إجازة صوتية (علي باقر)</option>
              <option value="machine_defect">🔧 عطل ماكينة CNC (أحمد)</option>
              <option value="invoice_wood">🧾 فاتورة خشب 250,000 (مصطفى)</option>
              <option value="print_task">📋 مهمة تصميم لوحة (سيف)</option>
              <option value="material_request">📦 طلب أكريلك وورق A3 (كريم)</option>
              <option value="job_completed">✅ اكتمال طلبية العميل الامل (حسين)</option>
              <option value="delivery_done">🚚 تسليم طلبية لزبون (عمر)</option>
              <option value="new_order">🆕 طلب جديد شركة النخيل (سيف)</option>
              <option value="urgent_qc">🔴 عاجل: عيب جودة طباعة (أحمد)</option>
              <option value="attendance_late">⏰ غياب محمد بدون اتصال</option>
              <option value="machine_maintenance">🔧 صيانة دورية ماكينة ليزر</option>
            </select>
          </label>
          <div style="display:flex;align-items:flex-end;">
            <button class="btn-primary" style="width:100%;height:38px;font-weight:bold;" onclick="triggerWhatsAppPresetSimulation()">
              <i class="fa-solid fa-cloud-arrow-down"></i> إرسال Webhook
            </button>
          </div>
        </div>
      </div>
      <div class="automation-rule-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;opacity:0.85;">
        <label class="field"><span>رابط الـ Webhook</span><input value="http://localhost:8080/api/whatsapp/webhook" readonly></label>
      <label class="field"><span>رمز التحقق (Verify Token)</span><input value="octagon_wa_secret_token" readonly></label>
        <label class="field"><span>معرّف رقم الهاتف (Phone Number ID)</span><input value="wa_phone_prod_3321" readonly></label>
        <label class="field"><span>إصدار الواجهة (API)</span><input value="v20.0" readonly></label>
      </div>
    </div>
  `;
}

// ─── WhatsApp Integration Main Page ──────────────────────────────────────────
// T0.4 dedup (2026-07-12): dead copy (tab-based UI keyed off a hidden
// #waActiveTab input), shadowed by the live thread/inbox-workspace
// redesign further below (window.waWorkspaceMode, per-thread selection,
// inbox/groups/analytics/api modes). Kept per add-only rule.
function renderWhatsAppIntegrationPage_deprecated_dup1() {
  normalizeAiIntegrationData();
  const orgProfile = getActiveOrgProfile();
  const body = document.getElementById('whatsappBody');
  if (!body) return;

  const suggestions = omni.whatsappSuggestions || [];
  const pending = suggestions.filter(s => s.status === 'pending');
  const approved = suggestions.filter(s => s.status === 'approved');
  const rejected = suggestions.filter(s => s.status === 'rejected');
  const groups = omni.whatsappGroups || [];

  const activeTab = document.getElementById('waActiveTab')?.value || 'inbox';
  const groupFilter = document.getElementById('waGroupFilter')?.value || '';
  const filteredSuggestions = groupFilter ? suggestions.filter(s => s.groupId === groupFilter) : suggestions;
  const staleCount = pending.filter(s => (Date.now()-new Date(s.createdAt||Date.now()))/3600000 > 24).length;

  body.className = 'automation-shell';
  body.innerHTML = `
    <div class="automation-hero">
      <div>
        <h2><i class="fa-brands fa-whatsapp text-accent-cyan"></i> WhatsApp Workshop Intelligence Hub</h2>
        <p style="direction:rtl;">مركز مراقبة وتحليل رسائل ومجموعات الورشة — نصوص، صور، رسائل صوتية، مستندات. تحليل ذكي تلقائي مرتبط بنظام ERP.</p>
      </div>
      <div class="automation-hero-actions">
        <button class="btn-secondary" onclick="switchPage('command_center')">Command Center</button>
        <button class="btn-secondary" onclick="switchPage('task_manager')">Task Manager</button>
      </div>
    </div>

    <div class="admin-active-company-strip whatsapp-company-context">
      <div class="admin-active-company-logo">${escapeHtml(orgProfile.logoEmoji)}</div>
      <div><b>${escapeHtml(orgProfile.companyName)}</b><small>${escapeHtml(orgProfile.phone||'')} — ${escapeHtml(orgProfile.address||'')}</small></div>
      <span style="margin-inline-start:auto;display:flex;align-items:center;gap:8px;">
        <i class="fa-brands fa-whatsapp" style="color:#25D366;font-size:18px;"></i>
        <span style="font-size:11px;color:var(--text-muted);">${groups.filter(g=>g.active).length} مجموعة نشطة</span>
      </span>
    </div>

    <div class="automation-kpis">
      <div style="border-inline-start:4px solid var(--warning);cursor:pointer;" onclick="setWaTab('inbox')">
        <span>بانتظار مراجعة</span>
        <b>${pending.length}${staleCount?`<span style="font-size:11px;color:var(--danger);margin-inline-start:4px;">(${staleCount} متأخر)</span>`:''}</b>
      </div>
      <div style="border-inline-start:4px solid var(--success);cursor:pointer;" onclick="setWaTab('inbox')"><span>معتمدة</span><b>${approved.length}</b></div>
      <div style="border-inline-start:4px solid var(--danger);cursor:pointer;" onclick="setWaTab('inbox')"><span>مرفوضة</span><b>${rejected.length}</b></div>
      <div style="border-inline-start:4px solid var(--accent-blue);cursor:pointer;" onclick="setWaTab('analytics')"><span>دفعات استيراد</span><b>${(omni.whatsappIngestHistory||[]).length}</b></div>
    </div>

    <!-- Tab Navigation -->
    <input type="hidden" id="waActiveTab" value="${activeTab}">
    <div style="display:flex;gap:4px;margin:16px 0 0 0;border-bottom:1px solid rgba(255,255,255,0.08);">
      <button id="waTabBtn-inbox" onclick="setWaTab('inbox')" style="padding:8px 18px;border:none;background:${activeTab==='inbox'?'rgba(6,182,212,0.15)':'transparent'};color:${activeTab==='inbox'?'var(--accent-cyan)':'var(--text-muted)'};border-bottom:2px solid ${activeTab==='inbox'?'var(--accent-cyan)':'transparent'};cursor:pointer;font-size:13px;font-weight:bold;border-radius:6px 6px 0 0;transition:all 0.2s;">
        <i class="fa-solid fa-inbox"></i> طابور الرسائل <span style="background:var(--warning);color:#000;border-radius:10px;font-size:10px;padding:1px 6px;margin-inline-start:4px;">${pending.length}</span>
      </button>
      <button id="waTabBtn-analytics" onclick="setWaTab('analytics')" style="padding:8px 18px;border:none;background:${activeTab==='analytics'?'rgba(129,140,248,0.15)':'transparent'};color:${activeTab==='analytics'?'var(--accent-blue)':'var(--text-muted)'};border-bottom:2px solid ${activeTab==='analytics'?'var(--accent-blue)':'transparent'};cursor:pointer;font-size:13px;font-weight:bold;border-radius:6px 6px 0 0;transition:all 0.2s;">
        <i class="fa-solid fa-chart-pie"></i> تحليلات
      </button>
      <button id="waTabBtn-groups" onclick="setWaTab('groups')" style="padding:8px 18px;border:none;background:${activeTab==='groups'?'rgba(52,211,153,0.15)':'transparent'};color:${activeTab==='groups'?'var(--success)':'var(--text-muted)'};border-bottom:2px solid ${activeTab==='groups'?'var(--success)':'transparent'};cursor:pointer;font-size:13px;font-weight:bold;border-radius:6px 6px 0 0;transition:all 0.2s;">
        <i class="fa-brands fa-whatsapp"></i> إدارة المجموعات <span style="background:var(--success);color:#000;border-radius:10px;font-size:10px;padding:1px 6px;margin-inline-start:4px;">${groups.length}</span>
      </button>
    </div>

    <!-- TAB: INBOX -->
    <div id="waTabContent-inbox" style="display:${activeTab==='inbox'?'block':'none'};padding-top:16px;">
      <input type="hidden" id="waGroupFilter" value="${groupFilter}">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
        <span style="font-size:12px;color:var(--text-muted);"><i class="fa-solid fa-filter"></i> تصفية حسب المجموعة:</span>
        <button onclick="filterWaGroup('')" style="padding:4px 12px;font-size:11px;border-radius:20px;border:1px solid ${!groupFilter?'var(--accent-cyan)':'rgba(255,255,255,0.1)'};background:${!groupFilter?'rgba(6,182,212,0.15)':'transparent'};color:${!groupFilter?'var(--accent-cyan)':'var(--text-muted)'};cursor:pointer;">الكل</button>
        ${groups.map(g=>`<button onclick="filterWaGroup('${g.id}')" style="padding:4px 12px;font-size:11px;border-radius:20px;border:1px solid ${groupFilter===g.id?'var(--accent-cyan)':'rgba(255,255,255,0.1)'};background:${groupFilter===g.id?'rgba(6,182,212,0.15)':'transparent'};color:${groupFilter===g.id?'var(--accent-cyan)':'var(--text-muted)'};cursor:pointer;">${g.emoji} ${escapeHtml(g.name)}</button>`).join('')}
      </div>

      <div class="automation-layout" style="grid-template-columns:minmax(0,1.3fr) minmax(280px,0.7fr);">
        <div>
          <div class="automation-panel" style="margin-bottom:16px;">
            <div class="automation-section-head"><h3><i class="fa-solid fa-paste"></i> لصق رسائل يدوياً</h3></div>
            <textarea id="whatsappPasteText" class="form-input code-textarea" rows="4" placeholder="الصق رسائل WhatsApp هنا، كل رسالة في سطر مستقل...&#10;مثال: خلصنا طلبية العميل الامل جاهزة للتسليم"></textarea>
            <div class="insp-actions" style="margin-top:10px;display:flex;gap:8px;">
              <button class="btn-primary" onclick="importWhatsAppText()"><i class="fa-solid fa-wand-magic-sparkles"></i> تحليل الرسائل</button>
              <label class="btn-secondary" style="cursor:pointer;display:flex;align-items:center;gap:6px;">
                <i class="fa-solid fa-file-import"></i> استيراد ملف تصدير (.txt)
                <input type="file" accept=".txt" style="display:none;" onchange="importWhatsAppFileExport(event)">
              </label>
            </div>
          </div>

          <div class="automation-panel" style="margin-bottom:16px;">
            <div class="automation-section-head"><h3><i class="fa-solid fa-image"></i> رفع صورة للتحليل</h3></div>
            <div id="waImageDropZone"
              style="border:2px dashed rgba(6,182,212,0.35);border-radius:10px;padding:24px;text-align:center;cursor:pointer;transition:all 0.3s;background:rgba(6,182,212,0.03);"
              ondragover="handleWhatsAppImageDropzone(event)"
              ondragleave="handleWhatsAppImageDropzone(event)"
              ondrop="handleWhatsAppImageDrop(event)"
              onclick="document.getElementById('waImageFileInput').click()">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:28px;color:var(--accent-cyan);margin-bottom:8px;"></i>
              <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">اسحب وأفلت الصورة هنا أو اضغط للاختيار</div>
              <div style="font-size:11px;color:var(--text-muted);opacity:0.6;">JPG, PNG, WEBP مدعومة — تحليل تلقائي من العنوان والسياق</div>
              <input id="waImageFileInput" type="file" accept="image/*" multiple style="display:none;" onchange="handleWhatsAppImageDrop(event)">
            </div>
            <label class="field" style="margin-top:10px;">
              <span style="font-size:11px;"><i class="fa-solid fa-comment"></i> تعليق على الصورة (اختياري)</span>
              <input id="waImageCaption" placeholder="مثال: عيب في ماكينة الليزر يحتاج صيانة" style="font-size:12px;">
            </label>
          </div>

          ${renderWhatsAppSimulatorPanel()}
        </div>

        <div>
          <div class="automation-panel">
            <div class="automation-section-head"><h3>حالة النظام</h3></div>
            <div class="automation-fire-list">
              <div class="automation-fire-row" style="border-inline-start:4px solid #25D366">
                <div><b>محلل الرسائل الذكي</b><p>25+ قاعدة NLP عربية تغطي جميع سيناريوهات الورشة</p></div>
                <span class="analytics-risk-badge" style="background:var(--success)">نشط</span>
              </div>
              <div class="automation-fire-row" style="border-inline-start:4px solid var(--accent-blue)">
                <div><b>رفع الصور</b><p>تحليل تلقائي من العنوان والسياق</p></div>
                <span class="analytics-risk-badge" style="background:var(--accent-blue)">نشط</span>
              </div>
              <div class="automation-fire-row" style="border-inline-start:4px solid var(--success)">
                <div><b>استيراد ملف .txt</b><p>تحليل تصديرات WhatsApp كاملة بنشاط واحد</p></div>
                <span class="analytics-risk-badge" style="background:var(--success)">نشط</span>
              </div>
              <div class="automation-fire-row" style="border-inline-start:4px solid var(--warning)">
                <div><b>Webhook API محاكي</b><p>حاضر للربط بحساب Meta عند الجاهزية</p></div>
                <span class="analytics-risk-badge" style="background:var(--warning);color:#000;">محاكاة</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="automation-panel" style="margin-top:20px;">
        <div class="automation-section-head">
          <h3>📥 طابور الرسائل الواردة</h3>
          <span style="font-size:12px;color:var(--text-muted);">${filteredSuggestions.length} رسالة ${groupFilter?'في هذه المجموعة':'إجمالياً'}</span>
        </div>
        <div class="automation-rule-grid">
          ${filteredSuggestions.length ? filteredSuggestions.map(s => {
            const isStale = s.status==='pending' && (Date.now()-new Date(s.createdAt||Date.now()))/3600000 > 24;
            const typeColor = s.type==='machine_fault'?'var(--danger)':s.type==='qc_issue'?'var(--warning)':s.type==='job_completed'||s.type==='delivery_complete'?'var(--success)':s.type==='material_request'||s.type==='inventory_request'?'var(--accent-cyan)':s.type==='new_order'?'#fbbf24':s.type==='purchase_invoice'||s.type==='finance_request'?'var(--success)':'var(--accent-blue)';
            return `<div class="automation-rule-card ${s.status!=='pending'?'is-paused':''}" style="border-inline-start:3px solid ${typeColor};">
              <div class="automation-rule-head"><h3 style="font-size:13px;">${escapeHtml(s.label||s.type)}</h3><span class="task-priority-chip" style="--chip-color:${s.status==='approved'?'var(--success)':s.status==='rejected'?'var(--danger)':'var(--warning)'}">${escapeHtml(s.status||'pending')}</span></div>
              ${isStale?'<div style="font-size:10px;color:var(--danger);margin-bottom:4px;"><i class="fa-solid fa-clock"></i> متأخر > 24 ساعة</div>':''}
              ${s.groupName?`<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(s.groupName)}</div>`:''}
              ${s.senderName?`<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;"><i class="fa-solid fa-user"></i> من: <b>${escapeHtml(s.senderName)}</b></div>`:''}
              <p style="font-size:12px;margin-bottom:8px;direction:rtl;">${escapeHtml(s.text||'')}</p>
              ${s.imageDataUrl?`<img src="${s.imageDataUrl}" style="max-width:100%;max-height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.1);">`:''}
              ${renderWhatsAppSuggestionEvidence(s)}
              <div class="automation-rule-foot" style="margin-top:10px;display:flex;gap:6px;">
                ${s.status==='pending'?`<button class="btn-primary" style="flex:1;font-size:12px;" onclick="approveWhatsAppSuggestion('${s.id}')"><i class="fa-solid fa-check"></i> اعتماد وتحويل</button><button class="btn-secondary" style="font-size:12px;" onclick="rejectWhatsAppSuggestion('${s.id}')"><i class="fa-solid fa-xmark"></i></button>`:`<button class="btn-secondary" style="width:100%;font-size:12px;" onclick="switchPage('${s.outputType==='task_manager'?'task_manager':'command_center'}')">فتح المخرج</button>`}
              </div>
            </div>`;
          }).join('') : `<div class="task-empty-state-card" style="grid-column:1/-1;"><h4>لا توجد رسائل بعد</h4><p>الصق رسائل في مربع النص أعلاه، ارفع صورة، استورد ملف تصدير، أو استخدم محاكي Webhook أدناه.</p></div>`}
        </div>
      </div>
    </div>

    <!-- TAB: ANALYTICS -->
    <div id="waTabContent-analytics" style="display:${activeTab==='analytics'?'block':'none'};padding-top:16px;">
      ${renderWhatsAppAnalyticsDashboard()}
    </div>

    <!-- TAB: GROUPS -->
    <div id="waTabContent-groups" style="display:${activeTab==='groups'?'block':'none'};padding-top:16px;">
      ${renderWhatsAppGroupManagerPanel()}
    </div>
  `;
}
// T0.4 dedup (2026-07-12): dead copy, paired with the dead
// renderWhatsAppIntegrationPage_deprecated_dup1 above (both use the old
// #waActiveTab hidden-input pattern). Shadowed by the live definition
// below (window.waWorkspaceMode). Kept per add-only rule.
function setWaTab_deprecated_dup1(tab) {
  const active = ['inbox', 'analytics', 'groups'].includes(tab) ? tab : 'inbox';
  const hidden = document.getElementById('waActiveTab');
  if (hidden) hidden.value = active;
  const colors = { inbox: 'var(--accent-cyan)', analytics: 'var(--accent-blue)', groups: 'var(--success)' };
  ['inbox', 'analytics', 'groups'].forEach(t => {
    const pane = document.getElementById(`waTabContent-${t}`);
    if (pane) pane.style.display = t === active ? 'block' : 'none';
    const btn = document.getElementById(`waTabBtn-${t}`);
    if (btn) {
      const isActive = t === active;
      btn.style.background = isActive ? `rgba(${t === 'inbox' ? '6,182,212' : t === 'analytics' ? '129,140,248' : '52,211,153'},0.15)` : 'transparent';
      btn.style.color = isActive ? colors[t] : 'var(--text-muted)';
      btn.style.borderBottom = isActive ? `2px solid ${colors[t]}` : '2px solid transparent';
    }
  });
}

function filterWaGroup(groupId) {
  const input = document.getElementById('waGroupFilter');
  if (input) input.value = groupId;
  renderWhatsAppIntegrationPage();
}

const WHATSAPP_SIMULATION_PRESETS = {
  voice_leave: {
    text: "سجل إجازة ليوم غد بسبب ظرف طارئ (رسالة صوتية)",
    sender: "علي باقر (موظف)",
    phone: "9647701234567",
    group: "group_attendance"
  },
  machine_defect: {
    text: "صورة للعيب في ماكينة سي إن سي فوهة الليزر خربانة وبحاجة لصيانة عاجلة",
    sender: "أحمد العبيدي (مشرف ورشة)",
    phone: "9647809876543",
    group: "group_workshop_general"
  },
  invoice_wood: {
    text: "فاتورة شراء خشب بقيمة 250,000 دينار من شركة المشرق للتجهيز",
    sender: "مصطفى (أمين المخزن)",
    phone: "9647501112222",
    group: "group_materials"
  },
  print_task: {
    text: "سجل مهمة تصميم لوحة إعلانية جديدة لزبون الامل للتسليم يوم الاثنين القادم",
    sender: "سيف (مدير المبيعات)",
    phone: "9647703334444",
    group: "group_management"
  },
  material_request: {
    text: "نحتاج اجلب اكريلك 3 مم بكرتون كامل وورق طباعة A3 من المخزن بسرعة",
    sender: "كريم (موظف انتاج)",
    phone: "9647701112233",
    group: "group_materials"
  },
  job_completed: {
    text: "خلصنا تصنيع طلب العميل الامل اللافتة جاهزة للتسليم الحين",
    sender: "حسين (مشرف)",
    phone: "9647704445566",
    group: "group_workshop_general"
  },
  delivery_done: {
    text: "سلمنا الطلبية للزبون ابو علاء وستلم توقيع الاستلام على الفاتورة",
    sender: "عمر (سائق توصيل)",
    phone: "9647705557788",
    group: "group_workshop_general"
  },
  new_order: {
    text: "زبون جديد اسمه شركة النخيل يطلب 50 لوحة اعلانية مضيئة عرض سعر عاجل",
    sender: "سيف (مدير المبيعات)",
    phone: "9647703334444",
    group: "group_management"
  },
  urgent_qc: {
    text: "عاجل صورة عيب في الطباعة الوان غلط على طلبية الزبون النور مرفوض يحتاج اعادة عمل",
    sender: "أحمد (مراقب جودة)",
    phone: "9647809876543",
    group: "group_qc"
  },
  attendance_late: {
    text: "محمد ما وصل بعد الساعة 9 وما في اي اتصال غياب غير مبرر",
    sender: "مشرف الدوام",
    phone: "9647701234567",
    group: "group_attendance"
  },
  machine_maintenance: {
    text: "ماكينة الليزر تحتاج تغيير الرأس الخامة نفدت والصيانة الدورية موعدها هذا الاسبوع",
    sender: "احمد (فني صيانة)",
    phone: "9647809876543",
    group: "group_workshop_general"
  }
};

function classifyWhatsAppLine(text) {
  const t = String(text || '').toLowerCase();
  const hasAmount = /[\d,]+/.test(t);
  const amount = (t.match(/[\d,]+/) || [''])[0].replace(/,/g, '');

  // --- URGENT / PRIORITY FLAG (check first — overrides confidence) ---
  const isUrgent = /عاجل|urgent|سريع|فوري|حالاً|الحين|ضروري|ضروره|مستعجل/.test(t);

  // --- MACHINE FAULT / MAINTENANCE ---
  if (/خربان|خربانه|خربانة|عطل|تعطل|صيانة|تصليح|رأس الليزر|الرأس نفد|ماكينة|cnc|laser|ليزر|كاتر|الراوتر|router|printer|طابعة|عطب/.test(t)) {
    return { type: 'machine_fault', label: 'عطل / صيانة ماكينة', confidence: isUrgent ? 94 : 88, urgent: isUrgent };
  }

  // --- DELIVERY COMPLETE ---
  if (/سلمنا|تم التسليم|وصل الزبون|تسلم الطلبية|تسلم الطلب|اخذ الزبون|سلم الزبون|تم التوصيل|وصلت الطلبية/.test(t)) {
    return { type: 'delivery_complete', label: 'اكتمال تسليم طلبية', confidence: 87 };
  }

  // --- NEW ORDER / CRM LEAD ---
  if (/زبون جديد|عميل جديد|طلب جديد|يطلب|يطلبوا|عرض سعر|قدم عرض|يريد طلبية|يريدون|عندهم طلب/.test(t)) {
    return { type: 'new_order', label: 'طلب جديد / عميل محتمل', confidence: 82 };
  }

  // --- QC ISSUE ---
  if (/جودة|فحص|عيب|خربان|مرفوض|اعادة|إعادة|fail|qc|الوان غلط|مش زين|ما راح|ما زبط|رفض/.test(t)) {
    return { type: 'qc_issue', label: 'مشكلة جودة / إعادة عمل', confidence: isUrgent ? 92 : 84, urgent: isUrgent };
  }

  // --- JOB COMPLETED ---
  if (/خلصنا|انتهينا|جاهز|تم الانتهاء|كملنا|اكتمل|تم التصنيع|وصلنا|الطلبية جاهزة/.test(t)) {
    return { type: 'job_completed', label: 'اكتمال مهمة / طلبية', confidence: 85 };
  }

  // --- PURCHASE INVOICE / EXPENSE ---
  if (/فاتورة|وصل|receipt|invoice|دفعنا|سددنا|مشتريات/.test(t) && hasAmount) {
    return { type: 'purchase_invoice', label: 'فاتورة / مصروف', confidence: 89 };
  }

  // --- FINANCE / PAYMENT REQUEST ---
  if (/راتب|سلفة|قبض|دفع|دين|حساب|فلوس|مبلغ|صرف|مصروف|تسوية|دفعة/.test(t)) {
    return { type: 'finance_request', label: 'طلب مالي / دفعة', confidence: hasAmount ? 88 : 74 };
  }

  // --- ATTENDANCE / LEAVE ---
  if (/حضور|انصراف|غياب|تأخير|تأخر|اجازة|إجازة|دوام|بصمة|وصلت|طلعت|ما جا|ما وصل|متأخر|بكراً/.test(t)) {
    return { type: 'attendance_event', label: 'دوام / حضور / غياب', confidence: 84 };
  }

  // --- MATERIAL REQUEST ---
  if (/مخزون|مادة|مواد|ناقص|خلص|نفذ|شراء|اجلب|نحتاج|نريد|ورق|حبر|اكريلك|خشب|pvc|vinyl|فينيل|سطول|خيط|لاصق|صمغ|اسفنج|قماش|ابلكاش|ابوكسي/.test(t)) {
    return { type: 'material_request', label: 'طلب مواد / مخزون', confidence: 80 };
  }

  // --- VOICE NOTE ---
  if (/رسالة صوتية|فويس|voice|رسالة مسجلة|audio/.test(t)) {
    return { type: 'voice_note', label: 'رسالة صوتية (تحتاج مراجعة)', confidence: 65 };
  }

  // --- TASK / PRODUCTION ---
  if (/مهمة|سوي|نفذ|تابع|موعد|تصميم|طباعة|قص|لحام|تجميع|تركيب|تجهيز/.test(t)) {
    return { type: 'task', label: 'مهمة إنتاجية / تشغيلية', confidence: 76 };
  }

  // --- GENERAL CUSTOMER REQUEST ---
  if (/زبون|عميل|طلب|عرض|فاتورة|يطلب/.test(t)) {
    return { type: 'customer_request', label: 'عميل / طلب عام', confidence: 70 };
  }

  return { type: 'unknown', label: 'غير مصنف — يحتاج مراجعة يدوية', confidence: 40 };
}

function normalizeWhatsAppMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWhatsAppEntityPools() {
  ensureOmni();
  return [
    { entityType: 'employee', label: 'موظف', rows: Array.isArray(employees) ? employees.map(e => ({ id: e.id, name: e.name, evidence: e.phone || e.role || '' })) : [] },
    { entityType: 'customer', label: 'عميل', rows: Array.isArray(finance?.customers) ? finance.customers.map(c => ({ id: c.id, name: c.name || c.companyName || c.shopName, evidence: c.phone || c.notes || '' })) : [] },
    { entityType: 'material', label: 'مادة', rows: (omni.materials || []).map(m => ({ id: m.id, name: m.name, evidence: [m.code, m.category, m.supplier].filter(Boolean).join(' · ') })) },
    { entityType: 'machine', label: 'ماكينة', rows: (omni.machines || []).map(m => ({ id: m.id, name: m.name, evidence: [m.type, m.status, m.operator].filter(Boolean).join(' · ') })) },
    { entityType: 'operation_pack', label: 'باقة عمليات', rows: (omni.opPacks || []).map(p => ({ id: p.id, name: p.title || p.name, evidence: [p.code, p.category].filter(Boolean).join(' · ') })) },
    { entityType: 'order', label: 'طلب', rows: (omni.orders || []).map(o => ({ id: o.id, name: o.title || o.name || o.clientName || o.customerName, evidence: [o.status, o.clientName, o.customerName].filter(Boolean).join(' · ') })) }
  ];
}

function matchWhatsAppEntities(text) {
  const haystack = normalizeWhatsAppMatchText(text);
  if (!haystack) return [];
  const terms = haystack.split(' ').filter(token => token.length >= 3);
  const matches = [];
  getWhatsAppEntityPools().forEach(pool => {
    pool.rows.forEach(row => {
      const name = normalizeWhatsAppMatchText(row.name);
      if (!name || name.length < 3) return;
      const nameTerms = name.split(' ').filter(token => token.length >= 3);
      let score = haystack.includes(name) ? 90 : 0;
      const shared = nameTerms.filter(token => terms.includes(token));
      if (!score && shared.length) score = Math.min(86, 48 + shared.length * 14);
      if (!score) {
        const partial = nameTerms.find(token => token.length >= 4 && haystack.includes(token));
        if (partial) score = 58;
      }
      if (score >= 55) matches.push({ entityType: pool.entityType, entityLabel: pool.label, id: row.id, name: row.name, score, evidence: row.evidence || '' });
    });
  });
  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

function detectWhatsAppAttachmentPlaceholders(text) {
  const t = String(text || '').toLowerCase();
  const found = [];
  const push = (type, label, confidence) => { if (!found.some(x => x.type === type)) found.push({ type, label, confidence, status: 'placeholder' }); };
  // Images / photos
  if (/صورة|photo|image|jpg|jpeg|png|لقطة|شوف الصورة|صور/.test(t)) push('image', 'صورة / لقطة', 75);
  // Invoices / PDFs / documents
  if (/فاتورة|invoice|وصل استلام|pdf|ملف|مستند|receipt|ايصال/.test(t)) push('invoice', 'فاتورة / مستند PDF', 78);
  // Voice notes
  if (/صوت|فويس|voice|audio|mp3|wav|رسالة صوتية|مسجلة/.test(t)) push('audio', 'رسالة صوتية', 70);
  // Video
  if (/فيديو|video|mp4|مقطع|كليب/.test(t)) push('video', 'مقطع فيديو', 65);
  // Spreadsheet / Excel
  if (/اكسل|excel|xlsx|جدول بيانات|spreadsheet/.test(t)) push('spreadsheet', 'جدول بيانات Excel', 72);
  return found;
}

function getWhatsAppApprovalRoute(type) {
  if (type === 'task') return { outputType: 'task_manager', requestType: 'task', label: '📋 Task Manager' };
  if (type === 'material_request') return { outputType: 'command_center_request', requestType: 'purchase', label: '📦 طلب مواد — Command Center' };
  if (type === 'inventory_request') return { outputType: 'command_center_request', requestType: 'purchase', label: '📦 مخزون / شراء — Command Center' };
  if (type === 'attendance_event') return { outputType: 'command_center_request', requestType: 'employee_request', label: '⏰ دوام — Command Center' };
  if (type === 'attendance_request') return { outputType: 'command_center_request', requestType: 'employee_request', label: '⏰ دوام — Command Center' };
  if (type === 'finance_request') return { outputType: 'command_center_request', requestType: 'finance_review', label: '💰 مالية — Command Center' };
  if (type === 'purchase_invoice') return { outputType: 'command_center_request', requestType: 'finance_review', label: '🧾 فاتورة — Finance Review' };
  if (type === 'customer_request') return { outputType: 'command_center_request', requestType: 'customer_lead', label: '🤝 عميل / طلب — CRM' };
  if (type === 'new_order') return { outputType: 'command_center_request', requestType: 'customer_lead', label: '🆕 طلب جديد — CRM Pipeline' };
  if (type === 'qc_issue') return { outputType: 'command_center_request', requestType: 'qc_issue', label: '🔍 جودة — QC Center' };
  if (type === 'machine_fault') return { outputType: 'command_center_request', requestType: 'machine_maintenance', label: '🔧 عطل ماكينة — Maintenance' };
  if (type === 'job_completed') return { outputType: 'task_manager', requestType: 'task', label: '✅ مهمة مكتملة — Task Manager' };
  if (type === 'delivery_complete') return { outputType: 'command_center_request', requestType: 'delivery_confirmed', label: '🚚 تسليم — Sales Order Update' };
  if (type === 'voice_note') return { outputType: 'command_center_request', requestType: 'whatsapp_review', label: '🎤 رسالة صوتية — Manual Review' };
  return { outputType: 'command_center_request', requestType: 'whatsapp_review', label: '📝 مراجعة يدوية' };
}

function buildWhatsAppSuggestionFromLine(line) {
  const cls = classifyWhatsAppLine(line);
  const entityMatches = matchWhatsAppEntities(line);
  const attachments = detectWhatsAppAttachmentPlaceholders(line);
  const route = getWhatsAppApprovalRoute(cls.type);
  const topScore = entityMatches[0]?.score || 0;
  const confidence = Math.min(96, Math.max(cls.confidence, cls.confidence + Math.round(topScore / 12) + attachments.length * 3));
  
  const id = makeId('wa');
  attachments.forEach(att => {
    att.fileName = att.type === 'audio' ? `audio_note_${id.substring(3, 8)}.ogg` : 
                   att.type === 'image' ? `photo_${id.substring(3, 8)}.jpg` : 
                   `document_${id.substring(3, 8)}.pdf`;
    att.fileSize = att.type === 'audio' ? '88 KB' : 
                   att.type === 'image' ? '1.1 MB' : 
                   '120 KB';
    att.duration = att.type === 'audio' ? '0:15' : null;
  });
  
  return {
    id,
    text: line,
    type: cls.type,
    label: cls.label,
    confidence,
    entityMatches,
    attachmentPlaceholders: attachments,
    routeLabel: route.label,
    plannedOutputType: route.outputType,
    requestType: route.requestType,
    status: 'pending',
    createdAt: new Date().toISOString(),
    source: 'manual_paste'
  };
}

window.activeAudioPlaybacks = window.activeAudioPlaybacks || {};
function playWhatsAppAudioMock(id) {
  const btn = document.getElementById(`audio-btn-${id}`);
  const progress = document.getElementById(`audio-progress-${id}`);
  const timeText = document.getElementById(`audio-time-${id}`);
  if (!btn || !progress || !timeText) return;
  
  if (window.activeAudioPlaybacks[id]) {
    clearInterval(window.activeAudioPlaybacks[id].interval);
    delete window.activeAudioPlaybacks[id];
    btn.innerHTML = '<i class="fa-solid fa-play"></i> تشغيل';
    showToast('تم إيقاف تشغيل الصوت مؤقتاً', 'info');
  } else {
    let elapsed = 0;
    const duration = 15;
    btn.innerHTML = '<i class="fa-solid fa-pause"></i> إيقاف';
    showToast('جاري تشغيل الرسالة الصوتية...', 'info');
    
    Object.keys(window.activeAudioPlaybacks).forEach(activeId => {
      if (activeId !== id) playWhatsAppAudioMock(activeId);
    });
    
    const interval = setInterval(() => {
      elapsed += 0.5;
      if (elapsed > duration) {
        clearInterval(interval);
        delete window.activeAudioPlaybacks[id];
        btn.innerHTML = '<i class="fa-solid fa-play"></i> تشغيل';
        progress.style.width = '0%';
        timeText.textContent = '00:15';
        showToast('اكتمل تشغيل الصوت', 'success');
      } else {
        const pct = (elapsed / duration) * 100;
        progress.style.width = `${pct}%`;
        const currentSec = Math.floor(elapsed);
        const displaySec = currentSec < 10 ? `0${currentSec}` : currentSec;
        timeText.textContent = `00:${displaySec} / 00:15`;
      }
    }, 500);
    
    window.activeAudioPlaybacks[id] = { interval, elapsed };
  }
}

function showWhatsAppImageLightbox(id, imageUrl, text) {
  const modalHtml = `
    <div style="text-align: center; background: rgba(15, 23, 42, 0.95); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); color: #fff;">
      <h3 style="margin-bottom:15px; color: var(--accent-cyan); font-family: 'Outfit', sans-serif;"><i class="fa-regular fa-image"></i> معاينة الصورة المرفقة</h3>
      <div style="max-height: 400px; display: flex; justify-content: center; align-items: center; background: #000; border-radius: 8px; overflow: hidden; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.1);">
        <svg viewBox="0 0 800 600" style="width:100%; max-height:400px; background:#1e1e2e;">
          <defs>
            <linearGradient id="svgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.2" />
              <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:0.2" />
            </linearGradient>
          </defs>
          <rect width="800" height="600" fill="url(#svgGrad)" />
          <circle cx="400" cy="260" r="120" fill="none" stroke="#06b6d4" stroke-width="4" stroke-dasharray="10,5" />
          <path d="M350 260 L400 210 L450 260 M400 210 L400 330" fill="none" stroke="#3b82f6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
          <text x="400" y="440" fill="#a5b4fc" font-family="'Outfit', sans-serif" font-size="28" font-weight="bold" text-anchor="middle">DETAILED WORKSHOP ATTACHMENT</text>
          <text x="400" y="480" fill="#64748b" font-family="system-ui" font-size="20" text-anchor="middle">${escapeHtml(text)}</text>
          <rect x="20" y="20" width="760" height="560" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2" />
        </svg>
      </div>
      <p style="font-size: 13px; color: var(--text-muted); direction: rtl; margin-bottom: 15px;">صورة محاكاة مستلمة من خوادم WhatsApp Cloud API كجزء من المرفقات الثنائية.</p>
    </div>
  `;
  showOmniModal("معاينة المرفق البصري", modalHtml, () => true, (bodyEl) => {
    const confirmBtn = document.getElementById('omniModalConfirm');
    const cancelBtn = document.getElementById('omniModalCancel');
    if (confirmBtn) confirmBtn.textContent = 'إغلاق المعاينة';
    if (cancelBtn) cancelBtn.style.display = 'none';
  });
}

function showWhatsAppInvoicePreview(id, text) {
  const amountMatch = text.match(/[\d,]+/);
  const amount = amountMatch ? amountMatch[0] : '250,000';
  
  const modalHtml = `
    <div style="background: rgba(15, 23, 42, 0.95); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); color: #fff; text-align: right; direction: rtl;">
      <h3 style="margin-bottom:15px; color: var(--accent-cyan); font-family: 'Outfit', sans-serif; text-align:center;"><i class="fa-solid fa-file-invoice-dollar"></i> استخراج بيانات الفاتورة (AI OCR)</h3>
      <div class="automation-fire-list" style="margin-bottom:15px; background: rgba(255,255,255,0.05); padding:15px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding: 8px 0;">
          <span style="color:var(--text-muted)">اسم الملف:</span>
          <b style="font-family: monospace;">inv_whatsapp_${id.substring(3, 8)}.pdf</b>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding: 8px 0;">
          <span style="color:var(--text-muted)">المورد المكتشف:</span>
          <b>شركة المشرق للتجهيز</b>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding: 8px 0;">
          <span style="color:var(--text-muted)">المادة المكتشفة:</span>
          <b>خشب (Materials)</b>
        </div>
        <div style="display:flex; justify-content:space-between; padding: 8px 0;">
          <span style="color:var(--text-muted)">المبلغ الإجمالي:</span>
          <b style="color:var(--success); font-size:16px;">${amount} IQD</b>
        </div>
      </div>
      <h4 style="color: var(--accent-blue); margin-bottom:10px;">جدول تفاصيل البنود المستخرجة</h4>
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table" style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align:right;">البند</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>خشب MDF سماكة 18 ملم</td>
              <td>10 ألواح</td>
              <td>25,000 IQD</td>
              <td>250,000 IQD</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style="font-size: 12px; color: var(--text-muted); margin-top: 15px; text-align: center;">تم محاكاة استخراج هذه البيانات عبر معالج OCR المدمج قبل اعتماد المشتريات.</p>
    </div>
  `;
  showOmniModal("معاينة الفاتورة المستخرجة", modalHtml, () => true, (bodyEl) => {
    const confirmBtn = document.getElementById('omniModalConfirm');
    const cancelBtn = document.getElementById('omniModalCancel');
    if (confirmBtn) confirmBtn.textContent = 'إغلاق';
    if (cancelBtn) cancelBtn.style.display = 'none';
  });
}

function renderWhatsAppSuggestionEvidence(s) {
  const matches = Array.isArray(s.entityMatches) ? s.entityMatches : [];
  const attachments = Array.isArray(s.attachmentPlaceholders) ? s.attachmentPlaceholders : [];
  const chips = [
    `<span>الثقة: <b>${Number(s.confidence || 0)}%</b></span>`,
    `<span>المسار: <b>${escapeHtml(s.routeLabel || s.outputType || 'مراجعة')}</b></span>`,
    `<span>مطابقات: <b>${matches.length}</b></span>`,
    `<span>مرفقات: <b>${attachments.length}</b></span>`
  ];
  
  const matchHtml = matches.length ? `<div class="whatsapp-evidence-list" style="margin-top:8px;">${matches.map(m => `<span class="analytics-risk-badge" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); margin:2px;" title="${escapeHtml(m.evidence || '')}">${escapeHtml(m.entityLabel || m.entityType)}: <b>${escapeHtml(m.name || m.id)}</b> ${Number(m.score || 0)}%</span>`).join('')}</div>` : '<div class="whatsapp-evidence-list" style="margin-top:8px;"><span class="muted" style="font-size:11px;">لا توجد مطابقة كيان واضحة - يحتاج مراجعة يدوية</span></div>';
  
  let attachmentHtml = '';
  if (attachments.length) {
    attachmentHtml = `<div class="whatsapp-evidence-list" style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">`;
    attachments.forEach(a => {
      if (a.type === 'audio') {
        attachmentHtml += `
          <div class="wa-audio-player-container" style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; display:flex; align-items:center; gap:8px; margin-bottom:4px; justify-content:space-between; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="btn-primary" id="audio-btn-${s.id}" style="padding:4px 8px; font-size:11px;" onclick="playWhatsAppAudioMock('${s.id}')"><i class="fa-solid fa-play"></i> تشغيل</button>
              <div class="wa-waveform" style="display:flex; align-items:center; gap:2px; height:18px;">
                <span style="width:2px; height:6px; background:var(--accent-cyan); border-radius:1px;"></span>
                <span style="width:2px; height:12px; background:var(--accent-cyan); border-radius:1px;"></span>
                <span style="width:2px; height:18px; background:var(--accent-cyan); border-radius:1px;"></span>
                <span style="width:2px; height:8px; background:var(--accent-cyan); border-radius:1px;"></span>
                <span style="width:2px; height:14px; background:var(--accent-cyan); border-radius:1px;"></span>
                <span style="width:2px; height:10px; background:var(--accent-cyan); border-radius:1px;"></span>
                <span style="width:2px; height:16px; background:var(--accent-cyan); border-radius:1px;"></span>
              </div>
            </div>
            <div style="text-align:left; font-size:10px; font-family:monospace; color:var(--text-muted);">
              <span id="audio-time-${s.id}">00:15</span>
              <div style="width:80px; height:3px; background:rgba(255,255,255,0.1); border-radius:1px; overflow:hidden; margin-top:2px;">
                <div id="audio-progress-${s.id}" style="width:0%; height:100%; background:var(--accent-cyan); transition:width 0.2s;"></div>
              </div>
            </div>
          </div>
        `;
      } else if (a.type === 'image') {
        attachmentHtml += `
          <div class="wa-image-thumbnail-container" style="background:rgba(255,255,255,0.05); padding:6px; border-radius:6px; display:flex; align-items:center; gap:8px; margin-bottom:4px; justify-content:space-between; border-inline-start:3px solid var(--accent-blue);">
            <div style="display:flex; align-items:center; gap:8px;">
              <svg width="24" height="24" style="background:rgba(255,255,255,0.05); border-radius:4px;" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <div>
                <span style="font-size:11px; font-weight:bold; display:block; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(a.fileName)}</span>
                <small style="color:var(--text-muted); font-size:9px;">${escapeHtml(a.fileSize)}</small>
              </div>
            </div>
            <button class="btn-secondary" style="padding:3px 8px; font-size:10px;" onclick="showWhatsAppImageLightbox('${s.id}', '', '${jsString(s.text)}')"><i class="fa-solid fa-magnifying-glass-plus"></i> معاينة</button>
          </div>
        `;
      } else if (a.type === 'invoice') {
        attachmentHtml += `
          <div class="wa-invoice-thumbnail-container" style="background:rgba(255,255,255,0.05); padding:6px; border-radius:6px; display:flex; align-items:center; gap:8px; margin-bottom:4px; justify-content:space-between; border-inline-start:3px solid var(--success);">
            <div style="display:flex; align-items:center; gap:8px;">
              <svg width="24" height="24" style="background:rgba(255,255,255,0.05); border-radius:4px;" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <div>
                <span style="font-size:11px; font-weight:bold; display:block; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(a.fileName)}</span>
                <small style="color:var(--text-muted); font-size:9px;">${escapeHtml(a.fileSize)} · PDF/OCR</small>
              </div>
            </div>
            <button class="btn-secondary" style="padding:3px 8px; font-size:10px;" onclick="showWhatsAppInvoicePreview('${s.id}', '${jsString(s.text)}')"><i class="fa-solid fa-receipt"></i> استخراج</button>
          </div>
        `;
      }
    });
    attachmentHtml += `</div>`;
  }
  
  return `<div class="automation-condition-list" style="margin-bottom:8px;">${chips.join('')}</div>${matchHtml}${attachmentHtml}`;
}

function importWhatsAppText() {
  normalizeAiIntegrationData();
  const orgProfile = getActiveOrgProfile();
  const text = document.getElementById('whatsappPasteText')?.value || '';
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return showToast('الصق رسائل WhatsApp أولاً', 'warning');
  const created = lines.map(buildWhatsAppSuggestionFromLine);
  created.forEach(item => {
    item.companyId = orgProfile.companyId;
    item.companyName = orgProfile.companyName;
    item.currency = orgProfile.currency;
    item.currencySymbol = orgProfile.currencySymbol;
  });
  omni.whatsappSuggestions.unshift(...created);
  const batch = { id: makeId('wa_batch'), createdAt: new Date().toISOString(), count: created.length, source: 'manual_paste', companyId: orgProfile.companyId, companyName: orgProfile.companyName, currency: orgProfile.currency, currencySymbol: orgProfile.currencySymbol, matched: created.filter(s => (s.entityMatches || []).length).length, attachments: created.reduce((sum, s) => sum + (s.attachmentPlaceholders || []).length, 0) };
  omni.whatsappIngestHistory.unshift(batch);
  recordOmniHistoryEvent({
    module: 'whatsapp',
    source: 'manual_paste',
    action: 'messages_ingested',
    title: `WhatsApp manual import: ${created.length} messages`,
    description: `${batch.matched} matched entities, ${batch.attachments} attachment hints`,
    status: 'pending_review',
    correlationId: batch.id,
    payload: { batch, messages: created.map(item => ({ id: item.id, type: item.type, text: item.text, confidence: item.confidence, matches: item.entityMatches, attachments: item.attachmentPlaceholders })) }
  });
  saveData();
  document.getElementById('whatsappPasteText').value = '';
  showToast(`تم تحليل ${created.length} رسالة WhatsApp`, 'success');
  renderWhatsAppIntegrationPage();
}

function approveWhatsAppSuggestion(id) {
  normalizeAiIntegrationData();
  const orgProfile = getActiveOrgProfile();
  const item = omni.whatsappSuggestions.find(s => s.id === id);
  if (!item || item.status !== 'pending') return;
  const route = getWhatsAppApprovalRoute(item.type);
  if (route.outputType === 'task_manager') {
    const task = createTaskInSelectedSpace(`WhatsApp: ${item.label}`, { sourceType: 'whatsapp', sourceId: item.id, priority: 'normal', department: 'WhatsApp', description: item.text, companyId: orgProfile.companyId, companyName: orgProfile.companyName, currency: orgProfile.currency, currencySymbol: orgProfile.currencySymbol, tags: ['whatsapp', item.type], whatsappEntityMatches: item.entityMatches || [], whatsappAttachments: item.attachmentPlaceholders || [] });
    item.outputType = 'task_manager'; item.outputId = task.id;
  } else {
    const req = createOmniRequest({ type: item.requestType || route.requestType, title: `WhatsApp: ${item.label}`, description: item.text, requesterName: 'WhatsApp', sourcePage: 'whatsapp', sourceType: 'whatsapp', sourceId: item.id, status: 'pending', companyId: orgProfile.companyId, companyName: orgProfile.companyName, currency: orgProfile.currency, currencySymbol: orgProfile.currencySymbol, priority: item.type === 'finance_request' || item.type === 'qc_issue' ? 'high' : 'normal', payload: { whatsappType: item.type, confidence: item.confidence, routeLabel: route.label, entityMatches: item.entityMatches || [], attachmentPlaceholders: item.attachmentPlaceholders || [], companyContext: { companyId: orgProfile.companyId, companyName: orgProfile.companyName, currency: orgProfile.currency, currencySymbol: orgProfile.currencySymbol } } });
    item.outputType = 'command_center_request'; item.outputId = req?.id || '';
  }
  item.status = 'approved';
  item.reviewedAt = new Date().toISOString();
  recordOmniHistoryEvent({
    module: 'whatsapp',
    source: item.source || 'inbox',
    action: 'suggestion_approved',
    title: `WhatsApp approved: ${item.label}`,
    description: item.text,
    status: 'approved',
    correlationId: item.id,
    sourceMessageId: item.id,
    whatsappSenderId: item.senderPhone || item.senderName || '',
    approvalRequestId: item.outputType === 'command_center_request' ? item.outputId : '',
    createdRecordId: item.outputId,
    recordType: item.outputType,
    payload: { type: item.type, confidence: item.confidence, route: route.label, matches: item.entityMatches || [], attachments: item.attachmentPlaceholders || [] }
  });
  saveData();
  showToast('تم اعتماد اقتراح WhatsApp وتحويله لمسار عمل', 'success');
  triggerOmniEvent('WHATSAPP_APPROVED', { whatsappSuggestion: item });
  renderWhatsAppIntegrationPage();
}

function rejectWhatsAppSuggestion(id) {
  normalizeAiIntegrationData();
  const item = omni.whatsappSuggestions.find(s => s.id === id);
  if (!item) return;
  item.status = 'rejected';
  item.reviewedAt = new Date().toISOString();
  recordOmniHistoryEvent({
    module: 'whatsapp',
    source: item.source || 'inbox',
    action: 'suggestion_rejected',
    title: `WhatsApp rejected: ${item.label}`,
    description: item.text,
    status: 'rejected',
    correlationId: item.id,
    sourceMessageId: item.id,
    whatsappSenderId: item.senderPhone || item.senderName || '',
    payload: { type: item.type, confidence: item.confidence, matches: item.entityMatches || [], attachments: item.attachmentPlaceholders || [] }
  });
  saveData();
  renderWhatsAppIntegrationPage();
}

function simulateInboundWhatsApp(presetKey) {
  normalizeAiIntegrationData();
  const orgProfile = getActiveOrgProfile();
  const preset = WHATSAPP_SIMULATION_PRESETS[presetKey];
  if (!preset) return showToast('النموذج غير معروف', 'warning');
  
  const created = buildWhatsAppSuggestionFromLine(preset.text);
  created.source = 'api_webhook';
  created.senderName = preset.sender;
  created.senderPhone = preset.phone;
  created.companyId = orgProfile.companyId;
  created.companyName = orgProfile.companyName;
  created.currency = orgProfile.currency;
  created.currencySymbol = orgProfile.currencySymbol;
  
  if (created.attachmentPlaceholders.length) {
    created.attachmentPlaceholders.forEach(att => {
      att.fileName = att.type === 'audio' ? `audio_note_${created.id.substring(3, 8)}.ogg` : 
                     att.type === 'image' ? `photo_defect_${created.id.substring(3, 8)}.jpg` : 
                     `invoice_wood_${created.id.substring(3, 8)}.pdf`;
      att.fileSize = att.type === 'audio' ? '128 KB' : 
                     att.type === 'image' ? '1.2 MB' : 
                     '240 KB';
      att.duration = att.type === 'audio' ? '0:15' : null;
    });
  }
  
  omni.whatsappSuggestions.unshift(created);
  const batch = {
    id: makeId('wa_batch'),
    createdAt: new Date().toISOString(),
    count: 1,
    source: 'api_webhook_simulation',
    companyId: orgProfile.companyId,
    companyName: orgProfile.companyName,
    currency: orgProfile.currency,
    currencySymbol: orgProfile.currencySymbol,
    matched: (created.entityMatches || []).length,
    attachments: (created.attachmentPlaceholders || []).length
  };
  omni.whatsappIngestHistory.unshift(batch);
  recordOmniHistoryEvent({
    module: 'whatsapp',
    source: 'api_webhook_simulation',
    action: 'webhook_message_received',
    title: `WhatsApp webhook simulation: ${preset.sender}`,
    description: created.text,
    status: 'pending_review',
    correlationId: created.id,
    sourceMessageId: created.id,
    whatsappSenderId: preset.phone,
    mediaId: (created.attachmentPlaceholders || [])[0]?.id || '',
    payload: { batch, suggestion: created }
  });
  
  saveData();
  showToast(`تمت محاكاة استلام رسالة Webhook من ${preset.sender}`, 'success');
  renderWhatsAppIntegrationPage();
}

function triggerWhatsAppPresetSimulation() {
  const select = document.getElementById('waPresetSelect');
  if (!select) return;
  simulateInboundWhatsApp(select.value);
}

function renderWhatsAppSimulatorPanel() {
  return `
    <div class="automation-panel" style="margin-top:20px;">
      <div class="automation-section-head">
        <h3>محاكي بوابة WhatsApp Business API & Webhook</h3>
        <span class="analytics-risk-badge" style="background:var(--success)">نشط (Simulated)</span>
      </div>
      <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
        <p style="font-size:12px; margin-bottom:8px; color:var(--text-muted); direction:rtl; text-align:right;">قم بمحاكاة وصول رسالة جديدة من الورشة للتحقق من الاستجابة التلقائية، تصنيف البيانات، مطابقة الكيانات وتوجيه الموافقات الآمنة.</p>
        <div class="automation-rule-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
          <label class="field">
            <span>الرسالة الجاهزة (Preset Simulation)</span>
            <select id="waPresetSelect" style="width:100%;">
              <option value="voice_leave">رسالة صوتية: طلب إجازة (علي باقر)</option>
              <option value="machine_defect">صورة خلل: CNC/Laser خربانة (أحمد)</option>
              <option value="invoice_wood">ملف PDF: شراء خشب 250,000 (مصطفى)</option>
              <option value="print_task">مهمة: تصميم إعلان لزبون الامل (سيف)</option>
            </select>
          </label>
          <div style="display:flex; align-items:flex-end;">
            <button class="btn-primary" style="width:100%; height:38px; font-weight:bold;" onclick="triggerWhatsAppPresetSimulation()">
              <i class="fa-solid fa-cloud-arrow-down"></i> إرسال رسالة Webhook
            </button>
          </div>
        </div>
      </div>
      <div class="automation-rule-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap: 10px; opacity: 0.85;">
        <label class="field"><span>رابط الـ Webhook</span><input value="http://localhost:8080/api/whatsapp/webhook" readonly></label>
        <label class="field"><span>رمز التحقق (Verify Token)</span><input value="octagon_wa_secret_token" readonly></label>
        <label class="field"><span>معرّف التطبيق (App ID)</span><input value="wa_app_prod_3321" readonly></label>
        <label class="field"><span>إصدار الواجهة (API)</span><input value="v20.0" readonly></label>
      </div>
      <p class="muted" style="margin-top:10px; font-size:11px; direction:rtl; text-align:right;">
        <i class="fa-solid fa-circle-info"></i> تم صياغة خطة التكامل الكاملة مع Meta في الدليل: 
        <a href="#" onclick="switchPage('help_manual'); return false;" style="color:var(--accent-cyan); text-decoration:underline;">docs/WHATSAPP_API_INTEGRATION_PLAN.md</a>
      </p>
    </div>
  `;
}

function normalizeWhatsAppMetaApiSettings() {
  ensureOmni();
  if (!omni.whatsappMetaApi || typeof omni.whatsappMetaApi !== 'object') omni.whatsappMetaApi = {};
  const defaults = {
    provider: 'Meta WhatsApp Cloud API',
    appId: '',
    businessAccountId: '',
    phoneNumberId: '',
    displayPhoneNumber: '',
    graphVersion: 'v20.0',
    webhookPath: '/api/whatsapp/webhook',
    verifyToken: 'octagon-local-dev',
    accessTokenEnv: 'WHATSAPP_ACCESS_TOKEN',
    appSecretEnv: 'WHATSAPP_APP_SECRET',
    status: 'draft',
    lastCheckedAt: '',
    notes: ''
  };
  Object.keys(defaults).forEach(key => {
    if (omni.whatsappMetaApi[key] === undefined) omni.whatsappMetaApi[key] = defaults[key];
  });
  return omni.whatsappMetaApi;
}

function getWhatsAppWebhookUrl() {
  const settings = normalizeWhatsAppMetaApiSettings();
  const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'http://localhost:8080';
  return `${origin}${settings.webhookPath || '/api/whatsapp/webhook'}`;
}

function getWhatsAppMetaReadiness(settings = normalizeWhatsAppMetaApiSettings()) {
  const checks = [
    { key: 'appId', label: 'Meta App ID', ok: !!String(settings.appId || '').trim() },
    { key: 'businessAccountId', label: 'WhatsApp Business Account ID', ok: !!String(settings.businessAccountId || '').trim() },
    { key: 'phoneNumberId', label: 'Phone Number ID', ok: !!String(settings.phoneNumberId || '').trim() },
    { key: 'verifyToken', label: 'Verify Token', ok: !!String(settings.verifyToken || '').trim() },
    { key: 'webhook', label: 'Webhook endpoint', ok: true },
    { key: 'serverToken', label: 'Server token env', ok: !!String(settings.accessTokenEnv || '').trim() }
  ];
  const okCount = checks.filter(item => item.ok).length;
  return { checks, percent: Math.round((okCount / checks.length) * 100), ready: okCount === checks.length };
}

function saveWhatsAppMetaApiSettings() {
  const settings = normalizeWhatsAppMetaApiSettings();
  settings.appId = document.getElementById('waMetaAppId')?.value.trim() || '';
  settings.businessAccountId = document.getElementById('waMetaBusinessId')?.value.trim() || '';
  settings.phoneNumberId = document.getElementById('waMetaPhoneNumberId')?.value.trim() || '';
  settings.displayPhoneNumber = document.getElementById('waMetaDisplayPhone')?.value.trim() || '';
  settings.graphVersion = document.getElementById('waMetaGraphVersion')?.value.trim() || 'v20.0';
  settings.verifyToken = document.getElementById('waMetaVerifyToken')?.value.trim() || 'octagon-local-dev';
  settings.accessTokenEnv = document.getElementById('waMetaAccessTokenEnv')?.value.trim() || 'WHATSAPP_ACCESS_TOKEN';
  settings.appSecretEnv = document.getElementById('waMetaAppSecretEnv')?.value.trim() || 'WHATSAPP_APP_SECRET';
  settings.notes = document.getElementById('waMetaNotes')?.value.trim() || '';
  const readiness = getWhatsAppMetaReadiness(settings);
  settings.status = readiness.ready ? 'ready_for_meta_verification' : 'draft';
  settings.lastCheckedAt = new Date().toISOString();
  saveData();
  showToast(readiness.ready ? 'إعدادات Meta جاهزة لخطوة التحقق من Webhook.' : 'تم حفظ إعدادات Meta، أكمل الحقول الناقصة قبل الربط.', readiness.ready ? 'success' : 'info');
  renderWhatsAppIntegrationPage();
}

function testWhatsAppMetaApiConfig() {
  const settings = normalizeWhatsAppMetaApiSettings();
  const readiness = getWhatsAppMetaReadiness(settings);
  settings.status = readiness.ready ? 'ready_for_meta_verification' : 'missing_fields';
  settings.lastCheckedAt = new Date().toISOString();
  saveData();
  showToast(readiness.ready ? 'الواجهة جاهزة. ضع Callback URL و Verify Token في لوحة Meta.' : 'ربط Meta يحتاج إكمال الحقول الأساسية.', readiness.ready ? 'success' : 'warning');
  renderWhatsAppIntegrationPage();
}

function copyWhatsAppWebhookUrl() {
  const value = getWhatsAppWebhookUrl();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(() => showToast('تم نسخ Webhook URL', 'success')).catch(() => showToast(value, 'info'));
  } else {
    showToast(value, 'info');
  }
}

function renderWhatsAppMetaApiPanel() {
  const settings = normalizeWhatsAppMetaApiSettings();
  const readiness = getWhatsAppMetaReadiness(settings);
  const webhookUrl = getWhatsAppWebhookUrl();
  const statusLabel = readiness.ready ? 'جاهز للتحقق في Meta' : 'مسودة تحتاج إكمال';
  const statusClass = readiness.ready ? 'ready' : 'draft';
  return `
    <section class="wa-meta-api-panel">
      <div class="wa-panel-head">
        <h3><i class="fa-brands fa-meta"></i> اتصال WhatsApp API مع Meta</h3>
        <span class="wa-api-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="wa-api-hero">
        <div>
          <b>Meta WhatsApp Cloud API</b>
          <p>هذه اللوحة تضبط معلومات الربط، Webhook، وبيئة السيرفر. لا تخزن Access Token الحقيقي داخل المتصفح.</p>
        </div>
        <strong>${readiness.percent}%</strong>
      </div>
      <div class="wa-api-grid">
        <label>معرّف تطبيق Meta (App ID)<input id="waMetaAppId" class="form-input" value="${escapeHtml(settings.appId)}" placeholder="مثال: 1234567890"></label>
        <label>معرّف حساب أعمال واتساب (WABA ID)<input id="waMetaBusinessId" class="form-input" value="${escapeHtml(settings.businessAccountId)}" placeholder="WABA ID"></label>
        <label>معرّف رقم الهاتف (Phone Number ID)<input id="waMetaPhoneNumberId" class="form-input" value="${escapeHtml(settings.phoneNumberId)}" placeholder="Phone Number ID"></label>
        <label>رقم واتساب الظاهر<input id="waMetaDisplayPhone" class="form-input" value="${escapeHtml(settings.displayPhoneNumber)}" placeholder="+964..."></label>
        <label>إصدار واجهة Graph (API Version)<input id="waMetaGraphVersion" class="form-input" value="${escapeHtml(settings.graphVersion)}" placeholder="v20.0"></label>
        <label>رمز التحقق (Verify Token)<input id="waMetaVerifyToken" class="form-input" value="${escapeHtml(settings.verifyToken)}" placeholder="نفسه يوضع في Meta Webhook Verify Token"></label>
        <label>متغيّر بيئة رمز الوصول (Access Token)<input id="waMetaAccessTokenEnv" class="form-input" value="${escapeHtml(settings.accessTokenEnv)}" placeholder="WHATSAPP_ACCESS_TOKEN"></label>
        <label>متغيّر بيئة سر التطبيق (App Secret)<input id="waMetaAppSecretEnv" class="form-input" value="${escapeHtml(settings.appSecretEnv)}" placeholder="WHATSAPP_APP_SECRET"></label>
      </div>
      <div class="wa-webhook-box">
        <label>Callback URL في Meta<input class="form-input" value="${escapeHtml(webhookUrl)}" readonly></label>
        <button class="btn-secondary" onclick="copyWhatsAppWebhookUrl()"><i class="fa-solid fa-copy"></i> نسخ الرابط</button>
      </div>
      <div class="wa-api-checklist">
        ${readiness.checks.map(item => `<span class="${item.ok ? 'ok' : 'missing'}"><i class="fa-solid ${item.ok ? 'fa-check' : 'fa-circle-exclamation'}"></i>${escapeHtml(item.label)}</span>`).join('')}
      </div>
      <textarea id="waMetaNotes" class="form-input" rows="3" placeholder="ملاحظات الربط، اسم التطبيق، أو بيئة السيرفر...">${escapeHtml(settings.notes || '')}</textarea>
      <div class="wa-actions-row">
        <button class="btn-primary" onclick="saveWhatsAppMetaApiSettings()"><i class="fa-solid fa-floppy-disk"></i> حفظ إعدادات Meta</button>
        <button class="btn-secondary" onclick="testWhatsAppMetaApiConfig()"><i class="fa-solid fa-plug-circle-check"></i> فحص الجاهزية</button>
        <button class="btn-secondary" onclick="setWaTab('inbox')"><i class="fa-solid fa-inbox"></i> رجوع للمحادثات</button>
      </div>
      <div class="wa-meta-steps">
        <b>خطوات Meta المطلوبة:</b>
        <span>1. في Meta Developer أضف Callback URL أعلاه.</span>
        <span>2. ضع Verify Token بنفس القيمة المحفوظة هنا.</span>
        <span>3. اربط Webhook events: messages و message_status.</span>
        <span>4. ضع Access Token و App Secret في السيرفر كمتغيرات بيئة، وليس داخل المتصفح.</span>
      </div>
    </section>
  `;
}

function renderWhatsAppIntegrationPage() {
  normalizeAiIntegrationData();
  const body = document.getElementById('whatsappBody');
  if (!body) return;
  const orgProfile = getActiveOrgProfile();
  const suggestions = omni.whatsappSuggestions || [];
  const pending = suggestions.filter(s => s.status === 'pending');
  const approved = suggestions.filter(s => s.status === 'approved');
  const rejected = suggestions.filter(s => s.status === 'rejected');
  const groups = omni.whatsappGroups || [];
  const mode = ['inbox', 'groups', 'analytics', 'api'].includes(window.waWorkspaceMode) ? window.waWorkspaceMode : 'inbox';
  const chosen = suggestions.find(s => s.id === window.activeWhatsAppSuggestionId) || pending[0] || suggestions[0] || null;
  if (chosen) window.activeWhatsAppSuggestionId = chosen.id;
  const route = chosen ? getWhatsAppApprovalRoute(chosen.type) : null;

  const threadList = suggestions.slice(0, 40).map(s => `
    <button class="wa-thread ${chosen?.id === s.id ? 'active' : ''}" onclick="selectWhatsAppSuggestion('${s.id}')">
      <span class="wa-thread-avatar">${s.type === 'machine_fault' ? '🔧' : s.type === 'new_order' ? '🧾' : s.type === 'material_request' ? '📦' : s.type === 'attendance_event' ? '⏱️' : '💬'}</span>
      <span class="wa-thread-main"><b>${escapeHtml(s.senderName || s.groupName || s.label || 'رسالة واردة')}</b><small>${escapeHtml((s.text || '').slice(0, 74))}</small></span>
      <em class="${s.status || 'pending'}">${escapeHtml(s.status || 'pending')}</em>
    </button>
  `).join('');

  body.className = 'wa-workspace-shell';
  body.innerHTML = `
    <div class="wa-topbar">
      <div><h2>💬 مركز رسائل WhatsApp التشغيلي</h2><p>المحادثات، المرفقات، المقترحات، والتحويل إلى مركز القيادة أو المهام في مكان واحد.</p></div>
      <div class="wa-company-chip"><b>${escapeHtml(orgProfile.companyName || 'Octagon')}</b><span>${escapeHtml(orgProfile.phone || 'لا يوجد رقم شركة')}</span></div>
    </div>
    <div class="wa-kpi-row">
      <div><span>بانتظار مراجعة</span><b>${pending.length}</b></div>
      <div><span>معتمدة</span><b>${approved.length}</b></div>
      <div><span>مرفوضة</span><b>${rejected.length}</b></div>
      <div><span>مجموعات</span><b>${groups.filter(g => g.active).length}/${groups.length}</b></div>
    </div>
    <div class="wa-workspace-grid">
      <aside class="wa-threads-panel">
        <div class="wa-panel-head"><h3>المحادثات والرسائل</h3><span>${suggestions.length}</span></div>
        <div class="wa-thread-list">${threadList || '<div class="wa-empty">لا توجد رسائل بعد.</div>'}</div>
      </aside>
      <main class="wa-message-panel">
        <div class="wa-mode-tabs">
          <button class="${mode === 'inbox' ? 'active' : ''}" onclick="setWaTab('inbox')"><i class="fa-solid fa-message"></i> المحادثات</button>
          <button class="${mode === 'groups' ? 'active' : ''}" onclick="setWaTab('groups')"><i class="fa-solid fa-user-group"></i> المجموعات</button>
          <button class="${mode === 'analytics' ? 'active' : ''}" onclick="setWaTab('analytics')"><i class="fa-solid fa-chart-line"></i> التحليلات</button>
          <button class="${mode === 'api' ? 'active' : ''}" onclick="setWaTab('api')"><i class="fa-brands fa-meta"></i> Meta API</button>
        </div>
        <section class="wa-compose-card" style="display:${mode === 'inbox' ? 'block' : 'none'}">
          <div class="wa-panel-head"><h3>إدخال سريع</h3><span>سطر لكل رسالة</span></div>
          <textarea id="whatsappPasteText" class="form-input code-textarea" rows="4" placeholder="الصق رسائل WhatsApp هنا، كل رسالة في سطر مستقل..."></textarea>
          <div class="wa-actions-row">
            <button class="btn-primary" onclick="importWhatsAppText()"><i class="fa-solid fa-wand-magic-sparkles"></i> تحليل الرسائل</button>
            <label class="btn-secondary"><i class="fa-solid fa-file-import"></i> استيراد .txt<input type="file" accept=".txt" style="display:none" onchange="importWhatsAppFileExport(event)"></label>
            <button class="btn-secondary" onclick="setWaTab('groups')"><i class="fa-solid fa-user-group"></i> المجموعات</button>
          </div>
        </section>
        <section class="wa-selected-card" style="display:${mode === 'inbox' ? 'block' : 'none'}">
          ${chosen ? `
            <div class="wa-selected-head">
              <div><h3>${escapeHtml(chosen.label || chosen.type)}</h3><p>${escapeHtml(chosen.groupName || chosen.senderName || 'مصدر غير محدد')} · ${formatOmniDateTime(chosen.createdAt)}</p></div>
              <span class="wa-confidence">${Number(chosen.confidence || 0)}%</span>
            </div>
            <div class="wa-message-bubble">${escapeHtml(chosen.text || '')}</div>
            ${chosen.imageDataUrl ? `<img class="wa-selected-image" src="${chosen.imageDataUrl}" alt="">` : ''}
            <div class="wa-evidence-box">${renderWhatsAppSuggestionEvidence(chosen)}</div>
          ` : '<div class="wa-empty big">اختر رسالة من القائمة أو الصق رسائل جديدة للتحليل.</div>'}
        </section>
        ${mode === 'groups' ? `<section class="wa-selected-card wa-subspace-card">${renderWhatsAppGroupManagerPanel()}</section>` : ''}
        ${mode === 'analytics' ? `<section class="wa-selected-card wa-subspace-card">${renderWhatsAppAnalyticsDashboard()}</section>` : ''}
        ${mode === 'api' ? `<section class="wa-selected-card wa-subspace-card">${renderWhatsAppMetaApiPanel()}</section>` : ''}
      </main>
      <aside class="wa-action-panel">
        <div class="wa-panel-head"><h3>المسار المقترح</h3><span>${chosen ? escapeHtml(chosen.status || 'pending') : '-'}</span></div>
        ${chosen ? `
          <div class="wa-route-card">
            <b>${escapeHtml(route?.label || chosen.routeLabel || 'مراجعة يدوية')}</b>
            <span>${escapeHtml(chosen.plannedOutputType || route?.outputType || 'command_center_request')}</span>
          </div>
          <div class="wa-action-buttons">
            ${chosen.status === 'pending' ? `
              <button class="btn-primary" onclick="approveWhatsAppSuggestion('${chosen.id}')"><i class="fa-solid fa-check"></i> اعتماد وتحويل</button>
              <button class="btn-secondary" onclick="rejectWhatsAppSuggestion('${chosen.id}')"><i class="fa-solid fa-xmark"></i> رفض</button>
            ` : `<button class="btn-primary" onclick="switchPage('${chosen.outputType === 'task_manager' ? 'task_manager' : 'command_center'}')">فتح المخرج</button>`}
          </div>
        ` : '<p class="muted">لا يوجد عنصر محدد.</p>'}
        <div class="wa-system-list">
          <h4>ماذا يظهر هنا؟</h4>
          <span>محادثات العملاء والموظفين</span>
          <span>صور وفواتير ورسائل صوتية</span>
          <span>اقتراحات مهام ومشتريات وصيانة</span>
          <span>ربط Meta Cloud API عبر Webhook</span>
          <span>تحويل آمن بعد الموافقة</span>
        </div>
        ${renderWhatsAppSimulatorPanel()}
      </aside>
    </div>
  `;
}

function selectWhatsAppSuggestion(id) {
  window.activeWhatsAppSuggestionId = id;
  window.waWorkspaceMode = 'inbox';
  renderWhatsAppIntegrationPage();
}

function setWaTab(tab) {
  window.waWorkspaceMode = ['inbox', 'groups', 'analytics', 'api'].includes(tab) ? tab : 'inbox';
  renderWhatsAppIntegrationPage();
}
