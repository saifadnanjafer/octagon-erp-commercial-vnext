/*
 * T4.15 Phase 4 extraction: Workflow Studio canvas, validation, renderer, and editor.
 * Shared entity/material helpers remain in app.js because they serve other modules.
 */

let workflowViewport = { zoom: 1, panX: 0, panY: 0, isPanning: false, panStartX: 0, panStartY: 0, originX: 0, originY: 0 };
let workflowCanvasSettings = { snapToGrid: true, showGrid: true, gridSize: 24, showMinimap: true };
let workflowPortLink = null;
let workflowUndoStack = [];
let workflowRedoStack = [];
let workflowKeyboardBound = false;
let workflowViewportCommitTimer = null;
let workflowInteractionState = {
  mode: 'idle',
  selectedNodeId: null,
  selectedEdgeId: null,
  draggingNodeId: null,
  dragStartX: 0,
  dragStartY: 0,
  nodeStartX: 0,
  nodeStartY: 0,
  didDrag: false,
  connectingFromNodeId: null,
  connectingFromPort: null,
  pointerDownTarget: '',
  lastPointerDownAt: 0,
  quickMenuNodeId: null,
  quickMenuX: 0,
  quickMenuY: 0,
  edgeToolbarId: null,
  edgeToolbarX: 0,
  edgeToolbarY: 0,
  tempPointerX: null,
  tempPointerY: null
};

const WORKFLOW_NODE_LABELS = {
  trigger: 'نقطة بداية',
  human_task: 'مهمة بشرية',
  action: 'إجراء',
  approval: 'اعتماد',
  operation: 'تشغيل ورشة',
  sop: 'SOP',
  machine: 'ماكينة',
  inventory: 'مخزون',
  qc: 'فحص جودة',
  finance: 'مالية',
  condition: 'شرط',
  delay: 'تأخير',
  notification: 'إشعار',
  rework: 'إعادة عمل',
  archive: 'أرشفة'
};

const WORKFLOW_NODE_SIZE = {
  width: 220,
  height: 132,
  colGap: 340,
  rowGap: 190
};

const WORKFLOW_CONNECTION_STYLES = {
  process: { label: 'مسار عملية', color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.38)' },
  success: { label: 'نجاح / اعتماد', color: '#10b981', glow: 'rgba(16, 185, 129, 0.42)' },
  failure: { label: 'فشل / رفض', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.42)' },
  rework: { label: 'إعادة عمل', color: '#f97316', glow: 'rgba(249, 115, 22, 0.44)' },
  sop: { label: 'SOP', color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.44)' },
  material: { label: 'مواد / مخزون', color: '#fb923c', glow: 'rgba(251, 146, 60, 0.44)' },
  machine: { label: 'ماكينة', color: '#a855f7', glow: 'rgba(168, 85, 247, 0.44)' },
  qc: { label: 'فحص جودة', color: '#34d399', glow: 'rgba(52, 211, 153, 0.44)' },
  finance: { label: 'مالية', color: '#eab308', glow: 'rgba(234, 179, 8, 0.44)' },
  approval: { label: 'اعتماد', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.44)' },
  notification: { label: 'إشعار', color: '#fde047', glow: 'rgba(253, 224, 71, 0.36)' }
};

function getWorkflowNodeLabel(type) {
  return WORKFLOW_NODE_LABELS[type] || type || 'خطوة';
}

function getWorkflowViewport() {
  try {
    const saved = JSON.parse(localStorage.getItem('workflow_viewport_v1') || '{}');
    workflowViewport = { ...workflowViewport, ...saved, isPanning: false };
  } catch (_) {}
  return workflowViewport;
}

function saveWorkflowViewport() {
  const { zoom, panX, panY } = workflowViewport;
  localStorage.setItem('workflow_viewport_v1', JSON.stringify({ zoom, panX, panY }));
}

function applyWorkflowViewport(options = {}) {
  const inner = document.querySelector('#workflowCanvas .workflow-canvas-inner');
  if (inner) inner.style.transform = `translate(${workflowViewport.panX}px, ${workflowViewport.panY}px) scale(${workflowViewport.zoom})`;
  const zoomLabel = document.getElementById('workflowZoomLabel');
  if (zoomLabel) zoomLabel.textContent = `${Math.round(workflowViewport.zoom * 100)}%`;
  if (!options.skipSave) saveWorkflowViewport();
  if (!options.skipMinimap) renderWorkflowMinimap(omni.workflow?.nodes || []);
}

function setWorkflowZoom(value, centerX, centerY) {
  getWorkflowViewport();
  const next = Math.max(0.35, Math.min(2.2, Number(value) || 1));
  const canvas = document.getElementById('workflowCanvas');
  if (canvas && centerX !== undefined && centerY !== undefined) {
    const rect = canvas.getBoundingClientRect();
    const before = screenToWorkflowPoint(centerX, centerY);
    workflowViewport.zoom = next;
    const afterX = before.x * next;
    const afterY = before.y * next;
    workflowViewport.panX = centerX - rect.left - afterX;
    workflowViewport.panY = centerY - rect.top - afterY;
  } else {
    workflowViewport.zoom = next;
  }
  applyWorkflowViewport();
}

function zoomWorkflow(delta) {
  setWorkflowZoom(workflowViewport.zoom + delta);
}

function resetWorkflowViewport() {
  workflowViewport = { ...workflowViewport, zoom: 1, panX: 0, panY: 0, isPanning: false };
  applyWorkflowViewport();
}

function fitWorkflowToScreen() {
  const canvas = document.getElementById('workflowCanvas');
  const nodes = omni.workflow?.nodes || [];
  if (!canvas) return;
  if (!nodes.length) return resetWorkflowViewport();
  const rect = canvas.getBoundingClientRect();
  // Reserve space for floating toolbar (top) and minimap (bottom-right).
  const toolbarReserve = 72;
  const minimapReserve = 156;
  const padding = 40;
  const minX = Math.min(...nodes.map(n => Number(n.x) || 0));
  const minY = Math.min(...nodes.map(n => Number(n.y) || 0));
  const maxX = Math.max(...nodes.map(n => (Number(n.x) || 0) + WORKFLOW_NODE_SIZE.width));
  const maxY = Math.max(...nodes.map(n => (Number(n.y) || 0) + WORKFLOW_NODE_SIZE.height));
  const width = Math.max(200, maxX - minX);
  const height = Math.max(130, maxY - minY);

  const availW = Math.max(200, rect.width - padding * 2 - minimapReserve / 2);
  const availH = Math.max(160, rect.height - toolbarReserve - padding * 2);
  const zoom = Math.max(0.35, Math.min(1.4, Math.min(availW / width, availH / height)));
  workflowViewport.zoom = zoom;

  const boxCenterX = minX + width / 2;
  const boxCenterY = minY + height / 2;
  // Centre vertically inside the area that's *visible* under the toolbar.
  const visibleCenterX = rect.width / 2;
  const visibleCenterY = toolbarReserve + (rect.height - toolbarReserve) / 2;
  workflowViewport.panX = visibleCenterX - boxCenterX * zoom;
  workflowViewport.panY = visibleCenterY - boxCenterY * zoom;

  applyWorkflowViewport();
}

function startWorkflowPan(event) {
  if (![0, 1].includes(event.button)) return;
  const target = event.target;
  if (target.closest?.('.workflow-node-v2, .workflow-node, .workflow-node-port, button, select, input, textarea')) return;
  getWorkflowViewport();
  workflowViewport.isPanning = true;
  workflowViewport.pointerId = event.pointerId;
  workflowViewport.panStartX = event.clientX;
  workflowViewport.panStartY = event.clientY;
  workflowViewport.originX = workflowViewport.panX;
  workflowViewport.originY = workflowViewport.panY;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  document.getElementById('workflowCanvas')?.classList.add('workflow-panning');
}

function moveWorkflowPan(event) {
  if (!workflowViewport.isPanning) return;
  workflowViewport.panX = workflowViewport.originX + (event.clientX - workflowViewport.panStartX);
  workflowViewport.panY = workflowViewport.originY + (event.clientY - workflowViewport.panStartY);
  applyWorkflowViewport({ skipSave: true, skipMinimap: true });
}

function endWorkflowPan(event) {
  if (!workflowViewport.isPanning) return;
  workflowViewport.isPanning = false;
  event?.currentTarget?.releasePointerCapture?.(workflowViewport.pointerId);
  document.getElementById('workflowCanvas')?.classList.remove('workflow-panning');
  applyWorkflowViewport();
}

function screenToWorkflowPoint(x, y) {
  const rect = document.getElementById('workflowCanvas')?.getBoundingClientRect();
  const vp = getWorkflowViewport();
  return {
    x: ((x - (rect?.left || 0)) - vp.panX) / vp.zoom,
    y: ((y - (rect?.top || 0)) - vp.panY) / vp.zoom
  };
}

function workflowToScreenPoint(x, y) {
  const rect = document.getElementById('workflowCanvas')?.getBoundingClientRect();
  const vp = getWorkflowViewport();
  return { x: (rect?.left || 0) + vp.panX + x * vp.zoom, y: (rect?.top || 0) + vp.panY + y * vp.zoom };
}

function getWorkflowCanvasPoint(event) {
  return screenToWorkflowPoint(event.clientX, event.clientY);
}

function isWorkflowInputFocused() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = String(active.tagName || '').toLowerCase();
  return ['input', 'textarea', 'select'].includes(tag) || !!active.isContentEditable;
}

function setWorkflowSelection({ nodeId = null, edgeId = null } = {}) {
  ensureOmni();
  omni.workflow.selectedNodeId = nodeId;
  omni.workflow.selectedEdgeId = edgeId;
  workflowInteractionState.selectedNodeId = nodeId;
  workflowInteractionState.selectedEdgeId = edgeId;
}

function clearWorkflowTemporaryInteraction() {
  workflowPortLink = null;
  workflowInteractionState.mode = 'idle';
  workflowInteractionState.draggingNodeId = null;
  workflowInteractionState.connectingFromNodeId = null;
  workflowInteractionState.connectingFromPort = null;
  workflowInteractionState.tempPointerX = null;
  workflowInteractionState.tempPointerY = null;
  if (omni?.workflow) omni.workflow.selectedFrom = null;
}

function clampWorkflowFloatingPoint(x, y, width = 360, height = 430) {
  const margin = 14;
  return {
    x: Math.max(margin, Math.min(window.innerWidth - width - margin, x)),
    y: Math.max(margin, Math.min(window.innerHeight - height - margin, y))
  };
}

function closeWorkflowNodeQuickMenu() {
  workflowInteractionState.quickMenuNodeId = null;
  document.getElementById('workflowNodeQuickMenu')?.remove();
}

function closeWorkflowEdgeToolbar() {
  workflowInteractionState.edgeToolbarId = null;
  document.getElementById('workflowEdgeToolbar')?.remove();
}

function renderWorkflowNodeQuickMenu(node) {
  const sopOptions = (omni.sops || []).map(s => `<option value="${s.id}" ${node.linkedSopId === s.id ? 'selected' : ''}>${escapeHtml(s.code || s.title)} - ${escapeHtml(s.title)}</option>`).join('');
  const machineOptions = (omni.machines || []).map(m => `<option value="${m.id}" ${node.linkedMachineId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
  const packOptions = (omni.opPacks || []).map(p => `<option value="${p.id}" ${node.linkedOperationPackId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  return `
    <div class="workflow-quick-menu-head">
      <b>تعديل البطاقة</b>
      <button class="icon-btn" onclick="closeWorkflowNodeQuickMenu()" title="إغلاق"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="workflow-quick-menu-grid">
      <label>العنوان<input id="wfQuickTitle" class="workflow-insp-input" value="${escapeHtml(node.title || '')}"></label>
      <label>النوع<select id="wfQuickType" class="workflow-insp-input">${WORKFLOW_NODE_TYPES.map(t => `<option value="${t}" ${node.type === t ? 'selected' : ''}>${escapeHtml(getWorkflowNodeLabel(t))}</option>`).join('')}</select></label>
      <label class="workflow-quick-menu-wide">الوصف<textarea id="wfQuickDescription" class="workflow-insp-input" rows="3">${escapeHtml(node.description || '')}</textarea></label>
      <label>الدور المسؤول<input id="wfQuickRole" class="workflow-insp-input" value="${escapeHtml(node.assignedRole || '')}"></label>
      <label>الدقائق<input id="wfQuickMinutes" type="number" min="0" class="workflow-insp-input" value="${Number(node.estimatedMinutes) || 0}"></label>
      <label>أثر الكلفة<input id="wfQuickCost" type="number" min="0" class="workflow-insp-input" value="${Number(node.costImpact) || 0}"></label>
      <label>SOP<select id="wfQuickSop" class="workflow-insp-input"><option value="">بدون SOP</option>${sopOptions}</select></label>
      <label>الماكينة<select id="wfQuickMachine" class="workflow-insp-input"><option value="">بدون ماكينة</option>${machineOptions}</select></label>
      <label class="workflow-quick-menu-wide">باقة العمليات<select id="wfQuickPack" class="workflow-insp-input"><option value="">بدون باقة عمليات</option>${packOptions}</select></label>
    </div>
    <div class="workflow-quick-menu-actions">
      <button class="btn-primary" onclick="saveWorkflowNodeQuickEdit('${node.id}')"><i class="fa-solid fa-check"></i> حفظ</button>
      <button class="btn-secondary" onclick="openWorkflowNodeInspector('${node.id}', 0); closeWorkflowNodeQuickMenu();"><i class="fa-solid fa-up-right-from-square"></i> فتح المفتش الكامل</button>
      <button class="btn-secondary" onclick="duplicateWorkflowNode('${node.id}')"><i class="fa-solid fa-copy"></i> نسخ العقدة</button>
      <button class="btn-danger" onclick="confirmDeleteWorkflowNodeFromQuickMenu('${node.id}')"><i class="fa-solid fa-trash"></i> حذف العقدة</button>
      <button class="btn-secondary" onclick="closeWorkflowNodeQuickMenu()">إغلاق</button>
    </div>
  `;
}

function openWorkflowNodeQuickMenu(nodeId, screenX, screenY, focusTitle = false) {
  ensureOmni();
  if (omni.adminSettings?.workflow?.quickEditEnabled === false) return openWorkflowNodeInspector(nodeId, 0);
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  closeWorkflowEdgeToolbar();
  closeWorkflowNodeQuickMenu();
  const point = clampWorkflowFloatingPoint(screenX + 12, screenY - 28, 380, 520);
  const menu = document.createElement('div');
  menu.id = 'workflowNodeQuickMenu';
  menu.className = 'workflow-node-quick-menu';
  menu.style.left = `${point.x}px`;
  menu.style.top = `${point.y}px`;
  menu.dir = 'rtl';
  menu.innerHTML = renderWorkflowNodeQuickMenu(node);
  menu.addEventListener('pointerdown', event => event.stopPropagation());
  menu.addEventListener('click', event => event.stopPropagation());
  document.body.appendChild(menu);
  workflowInteractionState.quickMenuNodeId = nodeId;
  workflowInteractionState.quickMenuX = point.x;
  workflowInteractionState.quickMenuY = point.y;
  if (focusTitle) setTimeout(() => document.getElementById('wfQuickTitle')?.focus(), 0);
}

function saveWorkflowNodeQuickEdit(nodeId) {
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  const patch = {
    title: document.getElementById('wfQuickTitle')?.value?.trim() || node.title,
    type: document.getElementById('wfQuickType')?.value || node.type,
    description: document.getElementById('wfQuickDescription')?.value?.trim() || '',
    assignedRole: document.getElementById('wfQuickRole')?.value?.trim() || '',
    estimatedMinutes: Number(document.getElementById('wfQuickMinutes')?.value) || 0,
    costImpact: Number(document.getElementById('wfQuickCost')?.value) || 0,
    linkedSopId: document.getElementById('wfQuickSop')?.value || '',
    linkedMachineId: document.getElementById('wfQuickMachine')?.value || '',
    linkedOperationPackId: document.getElementById('wfQuickPack')?.value || ''
  };
  pushWorkflowUndoSnapshot('node_quick_edit');
  Object.assign(node, patch);
  addWorkflowNodeActivity(nodeId, 'تم تحديث البطاقة من القائمة السريعة');
  saveData();
  renderWorkflowStudio();
  const screen = workflowToScreenPoint(Number(node.x) || 0, Number(node.y) || 0);
  openWorkflowNodeQuickMenu(nodeId, screen.x, screen.y);
  showToast('تم تحديث البطاقة', 'success');
}

function duplicateWorkflowNode(nodeId) {
  ensureOmni();
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  pushWorkflowUndoSnapshot('node_duplicate');
  const copy = JSON.parse(JSON.stringify(node));
  copy.id = makeId('wf');
  copy.title = `${node.title || 'خطوة'} - نسخة`;
  copy.x = snapWorkflowPoint((Number(node.x) || 0) + 42);
  copy.y = snapWorkflowPoint((Number(node.y) || 0) + 42);
  copy.successPath = '';
  copy.failurePath = '';
  copy.activityLog = [{ date: new Date().toISOString(), text: 'تم نسخ العقدة' }];
  omni.workflow.nodes.push(copy);
  setWorkflowSelection({ nodeId: copy.id });
  saveData();
  renderWorkflowStudio();
  const screen = workflowToScreenPoint(copy.x, copy.y);
  openWorkflowNodeQuickMenu(copy.id, screen.x, screen.y);
  showToast('تم نسخ العقدة', 'success');
}

async function confirmDeleteWorkflowNodeFromQuickMenu(nodeId) {
  closeWorkflowNodeQuickMenu();
  await deleteWorkflowNode(nodeId);
}

function startWorkflowNodePointer(event, nodeId) {
  if (event.button !== 0 || event.target.closest?.('.workflow-node-port, button, input, textarea, select')) return;
  if (isWorkflowReadOnly()) return;
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  const point = getWorkflowCanvasPoint(event);
  workflowInteractionState.mode = 'node_pointer_down';
  workflowInteractionState.draggingNodeId = nodeId;
  workflowInteractionState.dragStartX = point.x;
  workflowInteractionState.dragStartY = point.y;
  workflowInteractionState.nodeStartX = Number(node.x) || 0;
  workflowInteractionState.nodeStartY = Number(node.y) || 0;
  workflowInteractionState.didDrag = false;
  workflowInteractionState.pointerDownTarget = 'node';
  workflowInteractionState.lastPointerDownAt = Date.now();
  document.addEventListener('pointermove', moveWorkflowNodePointer);
  document.addEventListener('pointerup', endWorkflowNodePointer, { once: true });
}

function moveWorkflowNodePointer(event) {
  const nodeId = workflowInteractionState.draggingNodeId;
  const node = nodeId ? getWorkflowNodeById(nodeId) : null;
  if (!node) return;
  const point = getWorkflowCanvasPoint(event);
  const dx = point.x - workflowInteractionState.dragStartX;
  const dy = point.y - workflowInteractionState.dragStartY;
  const moved = Math.hypot(dx, dy);
  if (moved <= 3 && !workflowInteractionState.didDrag) return;
  if (!workflowInteractionState.didDrag) {
    pushWorkflowUndoSnapshot('node_move');
    workflowInteractionState.didDrag = true;
    workflowInteractionState.mode = 'drag';
    closeWorkflowNodeQuickMenu();
  }

  node.x = Math.max(10, Math.round(workflowInteractionState.nodeStartX + dx));
  node.y = Math.max(10, Math.round(workflowInteractionState.nodeStartY + dy));

  const el = document.querySelector(`[data-workflow-node-id="${CSS.escape(nodeId)}"]`);
  if (el) {
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
  }
}

function endWorkflowNodePointer() {
  document.removeEventListener('pointermove', moveWorkflowNodePointer);
  const nodeId = workflowInteractionState.draggingNodeId;
  const node = nodeId ? getWorkflowNodeById(nodeId) : null;
  if (node && workflowInteractionState.didDrag) {
    node.x = Math.max(10, snapWorkflowPoint(node.x));
    node.y = Math.max(10, snapWorkflowPoint(node.y));

    addWorkflowNodeActivity(nodeId, 'تم نقل الخطوة على لوحة العملية');
    saveData();
    renderWorkflowStudio();
  }
  workflowInteractionState.mode = 'idle';
  workflowInteractionState.draggingNodeId = null;
}

function updateWorkflowTemporaryEdge(event) {
  if (!workflowPortLink) return;
  const point = getWorkflowCanvasPoint(event);
  workflowInteractionState.tempPointerX = point.x;
  workflowInteractionState.tempPointerY = point.y;
  const temp = document.querySelector('#workflowCanvas .workflow-temp-edge');
  if (!temp) return renderWorkflowStudio();
  const sourceNode = getWorkflowNodeById(workflowPortLink.nodeId);
  if (!sourceNode) return;
  const source = getWorkflowNodePortPosition(sourceNode, workflowPortLink.portName || 'output');
  const target = point;
  temp.setAttribute('d', buildWorkflowPathBetweenPoints(source, target, { sourcePort: workflowPortLink.portName || 'output' }));
}

function getWorkflowCanvasSettings() {
  try {
    workflowCanvasSettings = { ...workflowCanvasSettings, ...JSON.parse(localStorage.getItem('workflow_canvas_settings_v1') || '{}') };
  } catch (_) {}
  const adminWorkflow = omni?.adminSettings?.workflow || {};
  if (adminWorkflow.snapToGrid !== undefined && localStorage.getItem('workflow_canvas_settings_v1') === null) workflowCanvasSettings.snapToGrid = !!adminWorkflow.snapToGrid;
  if (Number(adminWorkflow.gridSize) > 0 && localStorage.getItem('workflow_canvas_settings_v1') === null) workflowCanvasSettings.gridSize = Number(adminWorkflow.gridSize);
  return workflowCanvasSettings;
}

function updateWorkflowCanvasSettings(patch) {
  workflowCanvasSettings = { ...getWorkflowCanvasSettings(), ...patch };
  localStorage.setItem('workflow_canvas_settings_v1', JSON.stringify(workflowCanvasSettings));
  if (patch.snapToGrid !== undefined) setAdminSetting('workflow.snapToGrid', !!patch.snapToGrid, { silent: true });
  if (patch.gridSize !== undefined) setAdminSetting('workflow.gridSize', Number(patch.gridSize) || 24, { silent: true });
  renderWorkflowStudio();
}

function snapWorkflowPoint(value) {
  const settings = getWorkflowCanvasSettings();
  return settings.snapToGrid ? Math.round(Number(value || 0) / settings.gridSize) * settings.gridSize : Math.round(Number(value || 0));
}

function normalizeWorkflowPortName(port) {
  if (port === 'in') return 'input';
  if (port === 'out') return 'output';
  if (port === 'fail') return 'failure';
  return port || 'output';
}

function getWorkflowNodeSemantic(type) {
  if (type === 'inventory') return 'material';
  if (['sop', 'machine', 'qc', 'finance', 'approval', 'notification'].includes(type)) return type;
  if (type === 'rework') return 'rework';
  return 'process';
}

function getWorkflowPortSemantic(node, portName) {
  portName = normalizeWorkflowPortName(portName);
  if (['success', 'failure', 'rework'].includes(portName)) return portName;
  return getWorkflowNodeSemantic(node?.type);
}

function getWorkflowEdgeNodeIds(edge) {
  return {
    fromId: edge.from || edge.source || edge.sourceNodeId,
    toId: edge.to || edge.target || edge.targetNodeId
  };
}

function getWorkflowEdgeSemantic(edge, sourceNode, targetNode) {
  const sourcePort = normalizeWorkflowPortName(edge.sourcePort || edge.type || 'output');
  if (['success', 'failure', 'rework'].includes(sourcePort)) return sourcePort;
  const sourceSemantic = getWorkflowNodeSemantic(sourceNode?.type);
  const targetSemantic = getWorkflowNodeSemantic(targetNode?.type);
  if (targetSemantic !== 'process') return targetSemantic;
  if (sourceSemantic !== 'process') return sourceSemantic;
  return 'process';
}

function getWorkflowConnectionStyle(semantic) {
  return WORKFLOW_CONNECTION_STYLES[semantic] || WORKFLOW_CONNECTION_STYLES.process;
}

function isWorkflowPortConnected(nodeId, portName) {
  portName = normalizeWorkflowPortName(portName);
  return (omni.workflow?.edges || []).some(edge => {
    const { fromId, toId } = getWorkflowEdgeNodeIds(edge);
    const sourcePort = normalizeWorkflowPortName(edge.sourcePort || 'output');
    const targetPort = normalizeWorkflowPortName(edge.targetPort || 'input');
    return (fromId === nodeId && sourcePort === portName) || (toId === nodeId && targetPort === portName);
  });
}

function getWorkflowNodePorts(node) {
  const ports = [{ name: 'input', type: 'input', label: 'مدخل' }, { name: 'output', type: 'output', label: 'مخرج' }];
  if (['condition', 'approval', 'qc', 'inventory'].includes(node.type)) {
    ports.push({ name: 'success', type: 'output', label: 'مسار نجاح' });
    ports.push({ name: 'failure', type: 'output', label: 'مسار فشل' });
  }
  if (['qc', 'rework'].includes(node.type)) ports.push({ name: 'rework', type: 'output', label: 'إعادة عمل' });
  return ports;
}

function getWorkflowNodePortPosition(node, port) {
  port = normalizeWorkflowPortName(port);
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const w = WORKFLOW_NODE_SIZE.width;
  const h = WORKFLOW_NODE_SIZE.height;
  const positions = {
    input: { x, y: y + h / 2 },
    output: { x: x + w, y: y + h / 2 },
    success: { x: x + w, y: y + h * 0.32 },
    failure: { x: x + w, y: y + h * 0.62 },
    rework: { x: x + w / 2, y: y + h }
  };
  return positions[port] || positions.output;
}

function buildWorkflowPathBetweenPoints(source, target, edge = {}) {
  const sourcePort = normalizeWorkflowPortName(edge.sourcePort || 'output');
  const targetIsAhead = target.x >= source.x + 48;
  if (sourcePort === 'rework') {
    const bendY = Math.max(source.y + 84, target.y + 84);
    const approachX = target.x - 86;
    return `M ${source.x} ${source.y} C ${source.x} ${bendY}, ${approachX} ${bendY}, ${approachX} ${target.y} C ${approachX + 38} ${target.y}, ${target.x - 34} ${target.y}, ${target.x} ${target.y}`;
  }
  if (!targetIsAhead) {
    const laneY = Math.max(source.y, target.y) + 96;
    const laneX = Math.max(source.x, target.x) + 84;
    return `M ${source.x} ${source.y} C ${laneX} ${source.y}, ${laneX} ${laneY}, ${(source.x + target.x) / 2} ${laneY} C ${target.x - 86} ${laneY}, ${target.x - 86} ${target.y}, ${target.x} ${target.y}`;
  }
  const dx = Math.max(96, Math.min(180, Math.abs(target.x - source.x) * 0.46));
  return `M ${source.x} ${source.y} C ${source.x + dx} ${source.y}, ${target.x - dx} ${target.y}, ${target.x} ${target.y}`;
}

function getWorkflowEdgePoints(sourceNode, targetNode, edge) {
  return {
    source: getWorkflowNodePortPosition(sourceNode, edge.sourcePort || 'output'),
    target: getWorkflowNodePortPosition(targetNode, edge.targetPort || 'input')
  };
}

function buildWorkflowEdgePath(sourceNode, targetNode, edge) {
  const { source, target } = getWorkflowEdgePoints(sourceNode, targetNode, edge);
  return buildWorkflowPathBetweenPoints(source, target, edge);
}

function getWorkflowEdgeMidpoint(sourceNode, targetNode, edge) {
  const { source, target } = getWorkflowEdgePoints(sourceNode, targetNode, edge);
  return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 - 10 };
}

function renderWorkflowEdgesSvg(nodes, edges) {
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const renderedEdges = (edges || []).map(edge => {
    const { fromId, toId } = getWorkflowEdgeNodeIds(edge);
    const from = nodeById[fromId], to = nodeById[toId];
    const broken = !from || !to || fromId === toId;
    if (!from || !to) return '';
    const path = buildWorkflowEdgePath(from, to, edge);
    const { source, target } = getWorkflowEdgePoints(from, to, edge);
    const mid = getWorkflowEdgeMidpoint(from, to, edge);
    const selected = omni.workflow.selectedEdgeId === edge.id;
    const semantic = getWorkflowEdgeSemantic(edge, from, to);
    const style = getWorkflowConnectionStyle(semantic);
    const cls = `workflow-edge workflow-edge-${semantic} ${selected ? 'workflow-edge-path-selected' : ''} ${broken ? 'workflow-edge-path-warning' : ''}`;
    return `<g class="${cls}" style="--workflow-edge-color:${style.color};--workflow-edge-glow:${style.glow}" onclick="event.stopPropagation(); selectWorkflowEdge('${edge.id}', event)">
      <path class="workflow-edge-hitbox" d="${path}"></path>
      <path class="workflow-edge-path" d="${path}"></path>
      <circle class="workflow-edge-terminal workflow-edge-terminal-source" cx="${source.x}" cy="${source.y}" r="4.5"></circle>
      <circle class="workflow-edge-terminal workflow-edge-terminal-target" cx="${target.x}" cy="${target.y}" r="4.5"></circle>
      <text class="workflow-edge-label" x="${mid.x}" y="${mid.y}">${escapeHtml(edge.label || edge.condition || style.label || '')}</text>
    </g>`;
  }).join('');
  return renderedEdges + renderWorkflowTemporaryEdge(nodes);
}

function renderWorkflowTemporaryEdge(nodes) {
  if (!workflowPortLink || workflowInteractionState.tempPointerX === null || workflowInteractionState.tempPointerY === null) return '';
  const sourceNode = nodes.find(n => n.id === workflowPortLink.nodeId);
  if (!sourceNode) return '';
  const source = getWorkflowNodePortPosition(sourceNode, workflowPortLink.portName || 'output');
  const target = { x: workflowInteractionState.tempPointerX, y: workflowInteractionState.tempPointerY };
  const semantic = getWorkflowPortSemantic(sourceNode, workflowPortLink.portName || 'output');
  const style = getWorkflowConnectionStyle(semantic);
  const path = buildWorkflowPathBetweenPoints(source, target, { sourcePort: workflowPortLink.portName || 'output' });
  return `<path class="workflow-temp-edge workflow-edge-${semantic}" style="--workflow-edge-color:${style.color};--workflow-edge-glow:${style.glow}" d="${path}"></path>`;
}

function startWorkflowPortLink(nodeId, portName) {
  const node = getWorkflowNodeById(nodeId);
  portName = normalizeWorkflowPortName(portName);
  if (!node || portName === 'input') return;
  workflowPortLink = { nodeId, portName };
  workflowInteractionState.mode = 'connect';
  workflowInteractionState.connectingFromNodeId = nodeId;
  workflowInteractionState.connectingFromPort = portName;
  omni.workflow.selectedFrom = nodeId;
  showToast('اختر مدخل الخطوة التالية لإكمال الربط', 'info');
  renderWorkflowStudio();
}

function previewWorkflowLink() {}

function completeWorkflowPortLink(targetNodeId, targetPort = 'input') {
  ensureOmni();
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  if (!workflowPortLink) return;
  targetPort = normalizeWorkflowPortName(targetPort);
  if (workflowPortLink.nodeId === targetNodeId) {
    showToast('لا يمكن ربط الخطوة بنفسها', 'warning');
    return cancelWorkflowPortLink();
  }
  const sourceNode = getWorkflowNodeById(workflowPortLink.nodeId);
  const targetNode = getWorkflowNodeById(targetNodeId);
  if (!sourceNode || !targetNode) return cancelWorkflowPortLink();
  const exists = (omni.workflow.edges || []).some(e => e.from === sourceNode.id && e.to === targetNode.id && e.sourcePort === workflowPortLink.portName && e.targetPort === targetPort);
  if (exists) {
    showToast('هذا الربط موجود مسبقاً', 'warning');
    return cancelWorkflowPortLink();
  }
  pushWorkflowUndoSnapshot('edge_create');
  const sourcePort = workflowPortLink.portName;
  const type = sourcePort === 'success' ? 'success' : sourcePort === 'failure' ? 'failure' : sourcePort === 'rework' ? 'rework' : 'normal';
  omni.workflow.edges.push({ id: makeId('edge'), from: sourceNode.id, to: targetNode.id, source: sourceNode.id, target: targetNode.id, sourceNodeId: sourceNode.id, targetNodeId: targetNode.id, sourcePort, targetPort, type, label: sourcePort === 'success' ? 'نجاح' : sourcePort === 'failure' ? 'فشل' : sourcePort === 'rework' ? 'إعادة عمل' : 'التالي', createdAt: new Date().toISOString() });
  if (sourcePort === 'success') sourceNode.successPath = targetNode.id;
  if (sourcePort === 'failure') sourceNode.failurePath = targetNode.id;
  addWorkflowNodeActivity(sourceNode.id, `تم الربط مع ${targetNode.title}`);
  workflowPortLink = null;
  workflowInteractionState.mode = 'idle';
  workflowInteractionState.connectingFromNodeId = null;
  workflowInteractionState.connectingFromPort = null;
  omni.workflow.selectedFrom = null;
  saveData();
  renderWorkflowStudio();
  showToast('تم ربط الخطوة', 'success');
}

function cancelWorkflowPortLink() {
  workflowPortLink = null;
  workflowInteractionState.mode = 'idle';
  workflowInteractionState.connectingFromNodeId = null;
  workflowInteractionState.connectingFromPort = null;
  workflowInteractionState.tempPointerX = null;
  workflowInteractionState.tempPointerY = null;
  if (omni.workflow) omni.workflow.selectedFrom = null;
  renderWorkflowStudio();
}

function getWorkflowNodeDepths(nodes, edges) {
  const starts = nodes.filter(n => n.type === 'trigger' || !edges.some(e => e.to === n.id));
  const depths = {};
  const queue = starts.length ? starts.map(n => ({ id: n.id, depth: 0 })) : nodes.slice(0, 1).map(n => ({ id: n.id, depth: 0 }));
  while (queue.length) {
    const item = queue.shift();
    if (depths[item.id] !== undefined && depths[item.id] <= item.depth) continue;
    depths[item.id] = item.depth;
    edges.filter(e => e.from === item.id && e.to !== item.id).forEach(e => queue.push({ id: e.to, depth: item.depth + 1 }));
  }
  nodes.forEach((n, idx) => { if (depths[n.id] === undefined) depths[n.id] = idx; });
  return depths;
}

function preventWorkflowNodeOverlap(nodes) {
  const occupied = new Set();
  nodes.forEach(node => {
    let x = snapWorkflowPoint(node.x);
    let y = snapWorkflowPoint(node.y);
    while (occupied.has(`${x}:${y}`)) y += WORKFLOW_NODE_SIZE.rowGap;
    occupied.add(`${x}:${y}`);
    node.x = x; node.y = y;
  });
  return nodes;
}

function calculateWorkflowAutoLayout(workflow) {
  const nodes = (workflow.nodes || []).map(n => ({ ...n }));
  const depths = getWorkflowNodeDepths(nodes, workflow.edges || []);
  const columns = {};
  nodes.forEach(node => {
    const d = depths[node.id] || 0;
    if (!columns[d]) columns[d] = [];
    columns[d].push(node);
  });
  Object.keys(columns).forEach(d => {
    columns[d].forEach((node, idx) => {
      node.x = 80 + Number(d) * WORKFLOW_NODE_SIZE.colGap;
      node.y = 90 + idx * WORKFLOW_NODE_SIZE.rowGap;
    });
  });
  return preventWorkflowNodeOverlap(nodes);
}

async function applyWorkflowAutoLayout() {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const ok = await showOmniModal('ترتيب تلقائي', '<p>سيتم ترتيب الخطوات تلقائياً. هل تريد المتابعة؟</p>', () => true);
  if (!ok) return;
  pushWorkflowUndoSnapshot('auto_layout');
  const layout = calculateWorkflowAutoLayout(omni.workflow);
  layout.forEach(next => {
    const node = getWorkflowNodeById(next.id);
    if (node) { node.x = next.x; node.y = next.y; }
  });
  saveData();
  fitWorkflowToScreen();
  renderWorkflowStudio();
}

const WORKFLOW_MINIMAP_NODE_FILL = {
  trigger: '#10b981',
  human_task: '#60a5fa',
  action: '#38bdf8',
  approval: '#f59e0b',
  operation: '#a78bfa',
  sop: '#22d3ee',
  machine: '#94a3b8',
  inventory: '#fb923c',
  qc: '#34d399',
  finance: '#eab308',
  condition: '#f472b6',
  delay: '#a3a3a3',
  notification: '#fde047',
  rework: '#fb7185',
  archive: '#64748b'
};

function getWorkflowMinimapBounds(nodes) {
  // Always include the canvas viewport in the world bounds so the tracker
  // rectangle stays visible even when the user has panned to empty space.
  const canvas = document.getElementById('workflowCanvas');
  const crect = canvas?.getBoundingClientRect();
  const vp = workflowViewport;
  const viewWorld = crect ? {
    x: -vp.panX / vp.zoom,
    y: -vp.panY / vp.zoom,
    w: crect.width / vp.zoom,
    h: crect.height / vp.zoom
  } : null;
  let minX = Math.min(...nodes.map(n => Number(n.x) || 0));
  let minY = Math.min(...nodes.map(n => Number(n.y) || 0));
  let maxX = Math.max(...nodes.map(n => (Number(n.x) || 0) + WORKFLOW_NODE_SIZE.width));
  let maxY = Math.max(...nodes.map(n => (Number(n.y) || 0) + WORKFLOW_NODE_SIZE.height));
  if (viewWorld) {
    minX = Math.min(minX, viewWorld.x);
    minY = Math.min(minY, viewWorld.y);
    maxX = Math.max(maxX, viewWorld.x + viewWorld.w);
    maxY = Math.max(maxY, viewWorld.y + viewWorld.h);
  }
  // Add 8% padding for breathing room.
  const padX = Math.max(40, (maxX - minX) * 0.08);
  const padY = Math.max(40, (maxY - minY) * 0.08);
  return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
}

function renderWorkflowMinimap(nodes) {
  const host = document.getElementById('workflowMinimap');
  if (!host) return;
  if (!getWorkflowCanvasSettings().showMinimap) { host.style.display = 'none'; return; }
  host.style.display = '';
  if (!nodes.length) {
    host.innerHTML = `
      <div class="wf-mini-head"><b><i class="fa-solid fa-map"></i> خريطة العملية</b><span class="wf-mini-count">0</span></div>
      <div class="wf-mini-empty"><i class="fa-solid fa-diagram-project"></i>أضف خطوة لعرض الخريطة</div>`;
    return;
  }
  const MINI_W = 204, MINI_H = 130;
  const { minX, minY, maxX, maxY } = getWorkflowMinimapBounds(nodes);
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const scale = Math.min(MINI_W / w, MINI_H / h);
  const offX = (MINI_W - w * scale) / 2;
  const offY = (MINI_H - h * scale) / 2;
  const toMini = (x, y) => ({ x: offX + (x - minX) * scale, y: offY + (y - minY) * scale });

  const edges = (omni.workflow?.edges || []).map(edge => {
    const fromId = edge.from || edge.source || edge.sourceNodeId;
    const toId = edge.to || edge.target || edge.targetNodeId;
    const from = nodes.find(n => n.id === fromId);
    const to = nodes.find(n => n.id === toId);
    if (!from || !to) return '';
    const a = toMini((Number(from.x) || 0) + WORKFLOW_NODE_SIZE.width, (Number(from.y) || 0) + WORKFLOW_NODE_SIZE.height / 2);
    const b = toMini((Number(to.x) || 0), (Number(to.y) || 0) + WORKFLOW_NODE_SIZE.height / 2);
    return `<path class="wf-mini-edge" d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}"></path>`;
  }).join('');

  const nodeRects = nodes.map(n => {
    const p = toMini(Number(n.x) || 0, Number(n.y) || 0);
    const nw = Math.max(4, WORKFLOW_NODE_SIZE.width * scale);
    const nh = Math.max(3, WORKFLOW_NODE_SIZE.height * scale);
    const fill = WORKFLOW_MINIMAP_NODE_FILL[n.type] || '#38bdf8';
    const sel = omni.workflow?.selectedNodeId === n.id ? ' is-selected' : '';
    return `<rect class="wf-mini-node${sel}" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${nw.toFixed(1)}" height="${nh.toFixed(1)}" rx="1.4" fill="${fill}"></rect>`;
  }).join('');

  // Viewport tracker
  const canvas = document.getElementById('workflowCanvas');
  const crect = canvas?.getBoundingClientRect();
  let viewportRect = '';
  if (crect) {
    const vp = workflowViewport;
    const vx = -vp.panX / vp.zoom;
    const vy = -vp.panY / vp.zoom;
    const vw = crect.width / vp.zoom;
    const vh = crect.height / vp.zoom;
    const tl = toMini(vx, vy);
    const vmw = vw * scale;
    const vmh = vh * scale;
    viewportRect = `<rect class="wf-mini-viewport" x="${tl.x.toFixed(1)}" y="${tl.y.toFixed(1)}" width="${vmw.toFixed(1)}" height="${vmh.toFixed(1)}" rx="2"></rect>`;
  }

  host.innerHTML = `
    <div class="wf-mini-head">
      <b><i class="fa-solid fa-map"></i> خريطة العملية</b>
      <span class="wf-mini-count">${nodes.length} خطوة</span>
    </div>
    <svg class="wf-mini-svg" viewBox="0 0 ${MINI_W} ${MINI_H}" preserveAspectRatio="xMidYMid meet"
         onpointerdown="startWorkflowMinimapDrag(event)">
      <rect class="wf-mini-bg" x="0" y="0" width="${MINI_W}" height="${MINI_H}"></rect>
      ${edges}
      ${nodeRects}
      ${viewportRect}
    </svg>
    <div class="wf-mini-legend">
      <span><i style="background:#10b981"></i>بداية</span>
      <span><i style="background:#f59e0b"></i>اعتماد</span>
      <span><i style="background:#34d399"></i>جودة</span>
      <span><i style="background:#f472b6"></i>شرط</span>
      <span><i style="background:#fb7185"></i>إعادة</span>
    </div>`;
  host.dataset.miniMinX = minX;
  host.dataset.miniMinY = minY;
  host.dataset.miniScale = scale;
  host.dataset.miniOffX = offX;
  host.dataset.miniOffY = offY;
}

function panWorkflowToMinimapPoint(svg, clientX, clientY) {
  const host = document.getElementById('workflowMinimap');
  const canvas = document.getElementById('workflowCanvas');
  if (!host || !canvas) return;
  const rect = svg.getBoundingClientRect();
  const MINI_W = 204, MINI_H = 130;
  const mx = (clientX - rect.left) * (MINI_W / rect.width);
  const my = (clientY - rect.top) * (MINI_H / rect.height);
  const minX = parseFloat(host.dataset.miniMinX) || 0;
  const minY = parseFloat(host.dataset.miniMinY) || 0;
  const scale = parseFloat(host.dataset.miniScale) || 1;
  const offX = parseFloat(host.dataset.miniOffX) || 0;
  const offY = parseFloat(host.dataset.miniOffY) || 0;
  const worldX = (mx - offX) / scale + minX;
  const worldY = (my - offY) / scale + minY;
  const crect = canvas.getBoundingClientRect();
  workflowViewport.panX = crect.width / 2 - worldX * workflowViewport.zoom;
  workflowViewport.panY = crect.height / 2 - worldY * workflowViewport.zoom;
  applyWorkflowViewport();
}

function startWorkflowMinimapDrag(event) {
  event.preventDefault();
  const svg = event.currentTarget;
  panWorkflowToMinimapPoint(svg, event.clientX, event.clientY);
  const move = ev => panWorkflowToMinimapPoint(svg, ev.clientX, ev.clientY);
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

// Legacy entry point kept for any inline handlers that may still reference it.
function moveWorkflowViewportFromMinimap(event) {
  const svg = event.currentTarget.tagName === 'svg' ? event.currentTarget : event.currentTarget.querySelector('svg');
  if (svg) panWorkflowToMinimapPoint(svg, event.clientX, event.clientY);
}

function pushWorkflowUndoSnapshot(reason) {
  ensureOmni();
  workflowUndoStack.push({ reason, data: JSON.stringify({ nodes: omni.workflow.nodes, edges: omni.workflow.edges }) });
  if (workflowUndoStack.length > 20) workflowUndoStack.shift();
  workflowRedoStack = [];
}

function restoreWorkflowSnapshot(snapshot) {
  if (!snapshot) return;
  const data = JSON.parse(snapshot.data);
  omni.workflow.nodes = data.nodes || [];
  omni.workflow.edges = data.edges || [];
  saveData();
  renderWorkflowStudio();
}

function undoWorkflowChange() {
  if (!workflowUndoStack.length) return showToast('لا توجد خطوة للتراجع', 'info');
  workflowRedoStack.push({ reason: 'redo', data: JSON.stringify({ nodes: omni.workflow.nodes, edges: omni.workflow.edges }) });
  restoreWorkflowSnapshot(workflowUndoStack.pop());
}

function redoWorkflowChange() {
  if (!workflowRedoStack.length) return showToast('لا توجد خطوة للإعادة', 'info');
  workflowUndoStack.push({ reason: 'undo', data: JSON.stringify({ nodes: omni.workflow.nodes, edges: omni.workflow.edges }) });
  restoreWorkflowSnapshot(workflowRedoStack.pop());
}

function localizeWorkflowPage() {
  const page = document.getElementById('pageWorkflow');
  if (!page) return;
  const title = page.querySelector('.page-title');
  const subtitle = page.querySelector('.page-subtitle');
  const actions = page.querySelector('.page-header-actions');
  const paletteTitle = page.querySelector('.workflow-palette .section-title');
  if (title) title.innerHTML = '<span class="title-icon">🔀</span> مصمم العمليات وسير التنفيذ';
  if (subtitle) subtitle.textContent = 'لوحة إنتاج شبيهة n8n: خطوات واضحة، روابط عملية، وارتباط مباشر مع SOP والمكائن والمواد والجودة.';
  if (paletteTitle) paletteTitle.textContent = 'عناصر العملية';
  if (actions) {
    const isPublished = isWorkflowReadOnly();
    const publishButton = isPublished
      ? `<button class="btn-primary" style="background:#ef4444" onclick="unpublishWorkflow()"><i class="fa-solid fa-ban"></i> إلغاء النشر</button>`
      : `<button class="btn-primary" style="background:var(--accent-green)" onclick="publishWorkflow()"><i class="fa-solid fa-check-circle"></i> نشر العملية</button>`;

    actions.innerHTML = `
      <div class="workflow-header-summary" id="workflowSummary"></div>
      <button class="btn-primary" onclick="runWorkflowSimulation()"><i class="fa-solid fa-vial"></i> اختبار وفحص العملية</button>
      <button class="btn-primary" onclick="openWorkflowExecutionPreview()"><i class="fa-solid fa-eye"></i> معاينة التنفيذ</button>
      ${publishButton}
      <button class="btn-secondary" onclick="openWorkflowVersionHistoryModal()"><i class="fa-solid fa-clock-rotate-left"></i> سجل الإصدارات</button>
      <button class="btn-secondary" onclick="triggerWorkflowExecution()"><i class="fa-solid fa-rocket"></i> تنفيذ سير العمل</button>
      <button class="btn-secondary" onclick="openWorkflowTemplates()"><i class="fa-solid fa-layer-group"></i> قوالب جاهزة</button>
      <button class="btn-secondary" onclick="openComprehensiveWorkflowDemoModal()"><i class="fa-solid fa-flask-vial"></i> مثال فحص شامل</button>
      <button class="btn-primary" onclick="addWorkflowNode()" ${isPublished ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>إضافة خطوة</button>
      <button class="btn-primary" onclick="clearWorkflowSelection()">إلغاء الربط</button>`;
  }
}

function bindWorkflowKeyboardShortcuts() {
  if (workflowKeyboardBound) return;
  workflowKeyboardBound = true;
  document.addEventListener('keydown', handleWorkflowKeyboardShortcuts);
}

function handleWorkflowKeyboardShortcuts(event) {
  if (currentPage !== 'workflow') return;
  if (isWorkflowInputFocused()) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelWorkflowPortLink();
    omni.workflow.selectedEdgeId = null;
    closeWorkflowNodeQuickMenu();
    closeWorkflowEdgeToolbar();
    renderWorkflowStudio();
  } else if (event.key === 'Delete') {
    if (omni.workflow.selectedEdgeId) {
      event.preventDefault();
      deleteWorkflowEdge(omni.workflow.selectedEdgeId);
    } else if (omni.workflow.selectedNodeId) {
      event.preventDefault();
      deleteWorkflowNode(omni.workflow.selectedNodeId);
    }
  } else if (event.ctrlKey && (event.key === '+' || event.key === '=')) {
    event.preventDefault();
    zoomWorkflow(0.1);
  } else if (event.ctrlKey && event.key === '-') {
    event.preventDefault();
    zoomWorkflow(-0.1);
  } else if (event.ctrlKey && event.key === '0') {
    event.preventDefault();
    resetWorkflowViewport();
  } else if (event.ctrlKey && String(event.key).toLowerCase() === 'f') {
    event.preventDefault();
    fitWorkflowToScreen();
  }
}

function calculateWorkflowNodeReadiness(node) {
  let score = 0, total = 1;
  if (node.title) score++;
  if (workflowNodeNeedsSop(node)) { total++; if (node.linkedSopId) score++; }
  if (workflowNodeNeedsMachine(node)) { total++; if (node.linkedMachineId) score++; }
  if ((node.materialRequirements || []).length) {
    total++;
    if ((node.materialRequirements || []).every(req => materialAvailabilityStatus(req) === 'available')) score++;
  }
  if (['condition', 'approval', 'qc', 'inventory'].includes(node.type)) {
    total += 2;
    if (node.successPath || (omni.workflow.edges || []).some(e => e.from === node.id && e.sourcePort === 'success')) score++;
    if (node.failurePath || (omni.workflow.edges || []).some(e => e.from === node.id && e.sourcePort === 'failure')) score++;
  }
  return total ? Math.round((score / total) * 100) : 100;
}

function validateWorkflowDeep(workflow = omni.workflow) {
  ensureOmni();
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];
  const errors = [];
  const warnings = [];
  const suggestions = [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const startNodes = nodes.filter(n => n.type === 'trigger');
  const edgeKeys = new Set();

  if (!nodes.length) errors.push({ severity: 'خطأ', text: 'لا توجد خطوات في العملية' });
  if (!startNodes.length) errors.push({ severity: 'خطأ', text: 'لا توجد نقطة بداية' });
  if (startNodes.length > 1) warnings.push({ severity: 'تحذير', text: 'توجد أكثر من نقطة بداية' });

  nodes.forEach(node => {
    const outEdges = edges.filter(e => (e.from || e.source || e.sourceNodeId) === node.id);
    const inEdges = edges.filter(e => (e.to || e.target || e.targetNodeId) === node.id);
    if (!node.title || node.title === 'خطوة جديدة' || node.title === 'New step') warnings.push({ severity: 'تحذير', nodeId: node.id, text: 'خطوة بدون عنوان واضح' });
    if (!outEdges.length && node.type !== 'archive') warnings.push({ severity: 'تحذير', nodeId: node.id, text: `${node.title} بدون مخرج` });
    if (!inEdges.length && node.type !== 'trigger' && nodes.length > 1) warnings.push({ severity: 'تحذير', nodeId: node.id, text: `${node.title} معزولة أو بدون مدخل` });
    if (['condition', 'approval', 'inventory'].includes(node.type)) {
      if (!outEdges.some(e => e.sourcePort === 'success') && !node.successPath) errors.push({ severity: 'خطأ', nodeId: node.id, text: `${node.title} تحتاج مسار نجاح` });
      if (!outEdges.some(e => e.sourcePort === 'failure') && !node.failurePath) errors.push({ severity: 'خطأ', nodeId: node.id, text: `${node.title} تحتاج مسار فشل` });
    }
    if (node.type === 'qc') {
      if (!outEdges.some(e => e.sourcePort === 'success') && !node.qcPassPath && !node.successPath) errors.push({ severity: 'خطأ', nodeId: node.id, text: `${node.title} تحتاج مسار نجاح QC` });
      if (!outEdges.some(e => e.sourcePort === 'failure') && !node.qcFailPath && !node.failurePath) errors.push({ severity: 'خطأ', nodeId: node.id, text: `${node.title} تحتاج مسار فشل QC` });
      if (!outEdges.some(e => e.sourcePort === 'rework') && !node.qcReworkPath) warnings.push({ severity: 'تحذير', nodeId: node.id, text: `${node.title} بدون مسار إعادة عمل` });
    }
    if (workflowNodeNeedsSop(node) && !node.linkedSopId) warnings.push({ severity: 'تحذير', nodeId: node.id, text: `${node.title} بدون SOP مرتبط` });
    if (workflowNodeNeedsMachine(node) && !node.linkedMachineId) warnings.push({ severity: 'تحذير', nodeId: node.id, text: `${node.title} بدون ماكينة مرتبطة` });
    (node.materialRequirements || []).forEach(req => {
      if (materialAvailabilityStatus(req) !== 'available') warnings.push({ severity: 'تحذير', nodeId: node.id, text: `${node.title} لديها مادة غير كافية أو مفقودة` });
    });
    if (node.type === 'qc' && !node.linkedSopId && !(node.qcCriteria || []).length) suggestions.push({ severity: 'اقتراح', nodeId: node.id, text: `${node.title}: اربط SOP أو معايير فحص` });
    if (node.type === 'finance' && !Number(node.costImpact || 0)) suggestions.push({ severity: 'اقتراح', nodeId: node.id, text: `${node.title}: أضف أثر كلفة تقديري` });
  });

  edges.forEach(edge => {
    const fromId = edge.from || edge.source || edge.sourceNodeId;
    const toId = edge.to || edge.target || edge.targetNodeId;
    const sourcePort = normalizeWorkflowPortName(edge.sourcePort || 'output');
    const targetPort = normalizeWorkflowPortName(edge.targetPort || 'input');
    if (!nodeIds.has(fromId) || !nodeIds.has(toId)) errors.push({ severity: 'خطأ', edgeId: edge.id, text: 'رابط مكسور بين خطوات غير موجودة' });
    if (fromId === toId) errors.push({ severity: 'خطأ', edgeId: edge.id, nodeId: fromId, text: 'لا يمكن ربط الخطوة بنفسها' });
    const key = `${fromId}:${toId}:${sourcePort}:${targetPort}`;
    if (edgeKeys.has(key)) warnings.push({ severity: 'تحذير', edgeId: edge.id, text: 'رابط مكرر' });
    edgeKeys.add(key);
    const source = getWorkflowNodeById(fromId);
    const validPorts = source ? getWorkflowNodePorts(source).map(p => p.name) : [];
    if (source && !validPorts.includes(sourcePort)) warnings.push({ severity: 'تحذير', edgeId: edge.id, text: 'منفذ رابط غير صالح' });
  });

  const base = calculateWorkflowReadiness(workflow);
  if (base.hasCycle) warnings.push({ severity: 'تحذير', text: 'توجد دورة في المسار، تأكد أنها مقصودة وآمنة' });
  const score = Math.max(0, Math.min(100, base.score - errors.length * 15 - warnings.length * 4));
  return { score, errors, warnings, suggestions, nodesChecked: nodes.length, edgesChecked: edges.length, readyToPublish: errors.length === 0 };
}

function calculateWorkflowReadiness(workflow = omni.workflow) {
  ensureOmni();
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const missingSops = [];
  const missingMachines = [];
  const missingMaterials = [];
  const brokenEdges = [];
  const warnings = [];

  nodes.forEach(node => {
    if (workflowNodeNeedsSop(node) && !node.linkedSopId) missingSops.push(node);
    if (workflowNodeNeedsMachine(node) && !node.linkedMachineId) missingMachines.push(node);
    (node.materialRequirements || []).forEach(req => {
      if (materialAvailabilityStatus(req) !== 'available') missingMaterials.push({ node, requirement: req });
    });
    const outgoing = edges.filter(e => (e.from || e.source || e.sourceNodeId) === node.id);
    if (!outgoing.length && !node.successPath && node.type !== 'archive') warnings.push({ type: 'no_output', nodeId: node.id, text: `${node.title} has no output route` });
    if (node.successPath && node.successPath === node.id) warnings.push({ type: 'self_success', nodeId: node.id, text: `${node.title} success path points to itself` });
    if (node.failurePath && node.failurePath === node.id) warnings.push({ type: 'self_failure', nodeId: node.id, text: `${node.title} failure path points to itself` });
    if (node.successPath && !nodeIds.has(node.successPath)) warnings.push({ type: 'missing_success', nodeId: node.id, text: `${node.title} success path is missing` });
    if (node.failurePath && !nodeIds.has(node.failurePath)) warnings.push({ type: 'missing_failure', nodeId: node.id, text: `${node.title} failure path is missing` });
  });

  edges.forEach(edge => {
    const fromId = edge.from || edge.source || edge.sourceNodeId;
    const toId = edge.to || edge.target || edge.targetNodeId;
    if (!nodeIds.has(fromId) || !nodeIds.has(toId)) brokenEdges.push(edge);
  });

  const connected = new Set();
  edges.forEach(edge => {
    const fromId = edge.from || edge.source || edge.sourceNodeId;
    const toId = edge.to || edge.target || edge.targetNodeId;
    if (nodeIds.has(fromId)) connected.add(fromId);
    if (nodeIds.has(toId)) connected.add(toId);
  });
  nodes.filter(n => nodes.length > 1 && !connected.has(n.id)).forEach(node => {
    warnings.push({ type: 'isolated', nodeId: node.id, text: `${node.title} is isolated` });
  });

  const adjacency = {};
  nodes.forEach(n => { adjacency[n.id] = []; });
  edges.forEach(e => {
    const fromId = e.from || e.source || e.sourceNodeId;
    const toId = e.to || e.target || e.targetNodeId;
    if (adjacency[fromId]) adjacency[fromId].push(toId);
  });
  nodes.forEach(n => {
    if (n.successPath) adjacency[n.id]?.push(n.successPath);
    if (n.failurePath) adjacency[n.id]?.push(n.failurePath);
  });
  const visiting = new Set();
  const visited = new Set();
  let hasCycle = false;
  function visit(id) {
    if (visiting.has(id)) { hasCycle = true; return; }
    if (visited.has(id) || !adjacency[id]) return;
    visiting.add(id);
    adjacency[id].forEach(next => visit(next));
    visiting.delete(id);
    visited.add(id);
  }
  nodes.forEach(n => visit(n.id));
  if (hasCycle) warnings.push({ type: 'cycle', text: 'Cycle detected in workflow routing' });

  const possible = Math.max(1, nodes.length * 3 + edges.length);
  const penalty = missingSops.length + missingMachines.length + missingMaterials.length + brokenEdges.length + warnings.length;
  return {
    score: Math.max(0, Math.min(100, Math.round(((possible - penalty) / possible) * 100))),
    missingSops,
    missingMachines,
    missingMaterials,
    brokenEdges,
    warnings
  };
}

function simulateWorkflowRun() {
  ensureOmni();
  const workflow = omni.workflow;
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const materialMap = {};
  const machineIds = new Set();
  const sopIds = new Set();

  nodes.forEach(node => {
    if (node.linkedMachineId) machineIds.add(node.linkedMachineId);
    if (node.linkedSopId) sopIds.add(node.linkedSopId);
    (node.materialRequirements || []).forEach(req => {
      const material = getMaterialById(req.materialId);
      const key = req.materialId || makeId('missing_mat');
      if (!materialMap[key]) materialMap[key] = { materialId: req.materialId, name: material?.name || 'Missing material', qty: 0, unit: req.unit || material?.unit || '', available: material ? getMaterialAvailableQty(material) : 0 };
      materialMap[key].qty += getMaterialRequirementQty(req);
    });
  });

  const readiness = calculateWorkflowReadiness(workflow);
  return {
    nodesCount: nodes.length,
    edgesCount: edges.length,
    totalEstimatedMinutes: nodes.reduce((sum, n) => sum + (Number(n.estimatedMinutes) || 0), 0),
    totalCostImpact: nodes.reduce((sum, n) => sum + (Number(n.costImpact) || 0), 0),
    materials: Object.values(materialMap),
    missingMaterials: Object.values(materialMap).filter(m => !m.materialId || m.available < m.qty),
    machines: [...machineIds].map(id => getMachineById(id)).filter(Boolean),
    sops: [...sopIds].map(id => getSopById(id)).filter(Boolean),
    nodesWithoutSop: readiness.missingSops,
    nodesWithoutMachine: readiness.missingMachines,
    routingWarnings: [...readiness.brokenEdges.map(edge => ({ type: 'broken_edge', text: `Broken edge ${edge.from || edge.source || edge.sourceNodeId} -> ${edge.to || edge.target || edge.targetNodeId}` })), ...readiness.warnings],
    readiness
  };
}


function renderWorkflowStudio() {
  ensureOmni();
  localizeWorkflowPage();
  normalizeWorkflowRelations();
  getWorkflowViewport();
  getWorkflowCanvasSettings();
  bindWorkflowKeyboardShortcuts();
  const canvas = document.getElementById('workflowCanvas');
  const palette = document.getElementById('workflowPalette');
  const summary = document.getElementById('workflowSummary');
  if (!canvas || !palette) return;
  const readiness = validateWorkflowDeep(omni.workflow);
  const simulation = simulateWorkflowRun();
  if (summary) {
    summary.innerHTML = `
      <div class="workflow-header-stat"><b>${readiness.score}%</b><span>جاهزية</span></div>
      <div class="workflow-header-stat"><b>${simulation.totalEstimatedMinutes}</b><span>دقائق</span></div>
      <div class="workflow-header-stat"><b>${simulation.nodesCount}</b><span>خطوات</span></div>
      <div class="workflow-header-stat"><b>${readiness.errors.length + readiness.warnings.length}</b><span>تحذيرات</span></div>
    `;
  }
  palette.innerHTML = [
    ['trigger', 'نقطة بداية', 'fa-play'],
    ['human_task', 'مهمة بشرية', 'fa-user'],
    ['action', 'إجراء', 'fa-bolt'],
    ['approval', 'اعتماد', 'fa-check-double'],
    ['operation', 'تشغيل ورشة', 'fa-gears'],
    ['sop', 'SOP', 'fa-book'],
    ['machine', 'ماكينة', 'fa-cog'],
    ['inventory', 'مخزون', 'fa-boxes-stacked'],
    ['qc', 'فحص جودة', 'fa-microscope'],
    ['finance', 'مالية', 'fa-coins'],
    ['condition', 'شرط', 'fa-code-branch'],
    ['delay', 'تأخير', 'fa-clock'],
    ['notification', 'إشعار', 'fa-bell'],
    ['rework', 'إعادة عمل', 'fa-rotate-left'],
    ['archive', 'أرشفة', 'fa-box-archive']
  ].map(item => `<div class="workflow-tool" draggable="true" ondragstart="omniDragNodeType(event, '${item[0]}')"><i class="fa-solid ${item[2]}"></i><span>${item[1]}</span></div>`).join('');

  const edges = renderWorkflowEdgesSvg(omni.workflow.nodes || [], omni.workflow.edges || []);
  let emptyState = '';
  if (omni.workflow.nodes.length === 0) {
    emptyState = `
      <div class="workflow-empty-state">
        <i class="fa-solid fa-wand-magic-sparkles" style="font-size:32px;color:var(--primary);margin-bottom:16px;"></i>
        <h3>مرحباً بك في مصمم العمليات</h3>
        <p>ابدأ بتصميم عملية جديدة أو حمّل مثال فحص شامل لتجربة كل الإمكانيات.</p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="btn-primary" onclick="addWorkflowNode('trigger')" style="width:100%;"><i class="fa-solid fa-play"></i> إضافة نقطة بداية</button>
          <button class="btn-primary" onclick="openComprehensiveWorkflowDemoModal()" style="width:100%;"><i class="fa-solid fa-flask-vial"></i> تحميل مثال فحص شامل</button>
          <button class="btn-secondary" onclick="openWorkflowTemplates()" style="width:100%;"><i class="fa-solid fa-gears"></i> قوالب جاهزة</button>
        </div>
      </div>
    `;
  }

  canvas.classList.toggle('workflow-grid-hidden', !workflowCanvasSettings.showGrid);
  const readOnlyBanner = isWorkflowReadOnly() ? `
    <div class="workflow-readonly-banner" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; padding: 10px 16px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px; font-size: 13px; backdrop-filter: blur(8px); direction: rtl;">
      <span style="display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-lock"></i> <b>سير العمل منشور حالياً (إصدار ${omni.workflow?.version || 1}) وهو للقراءة فقط.</b></span>
      <button class="btn-secondary" style="padding: 4px 12px; background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.3); color: #ef4444; font-size:11px;" onclick="unpublishWorkflow()"><i class="fa-solid fa-pencil"></i> إلغاء النشر للتعديل</button>
    </div>
  ` : '';
  canvas.innerHTML = `
    ${readOnlyBanner}
    <div class="workflow-canvas-toolbar workflow-toolbar-v2">
      <button class="btn-ghost" onclick="zoomWorkflow(0.1)" title="تكبير"><i class="fa-solid fa-plus"></i> تكبير</button>
      <button class="btn-ghost" onclick="zoomWorkflow(-0.1)" title="تصغير"><i class="fa-solid fa-minus"></i> تصغير</button>
      <span id="workflowZoomLabel" class="workflow-zoom-label">${Math.round(workflowViewport.zoom * 100)}%</span>
      <button class="btn-ghost" onclick="fitWorkflowToScreen()"><i class="fa-solid fa-expand"></i> ملاءمة الشاشة</button>
      <button class="btn-ghost" onclick="resetWorkflowViewport()"><i class="fa-solid fa-rotate-left"></i> إعادة ضبط العرض</button>
      <button class="btn-ghost" onclick="applyWorkflowAutoLayout()"><i class="fa-solid fa-diagram-project"></i> ترتيب تلقائي</button>
      <button class="btn-ghost" onclick="openComprehensiveWorkflowDemoModal()"><i class="fa-solid fa-flask-vial"></i> مثال فحص شامل</button>
      <button class="btn-ghost" onclick="undoWorkflowChange()"><i class="fa-solid fa-rotate-left"></i> تراجع</button>
      <button class="btn-ghost" onclick="redoWorkflowChange()"><i class="fa-solid fa-rotate-right"></i> إعادة</button>
      <label class="workflow-toggle"><input type="checkbox" ${workflowCanvasSettings.snapToGrid ? 'checked' : ''} onchange="updateWorkflowCanvasSettings({snapToGrid:this.checked})"> محاذاة للشبكة</label>
      <label class="workflow-toggle"><input type="checkbox" ${workflowCanvasSettings.showGrid ? 'checked' : ''} onchange="updateWorkflowCanvasSettings({showGrid:this.checked})"> إظهار الشبكة</label>
    </div>
    <div class="workflow-canvas-inner">
      <svg class="workflow-lines" viewBox="0 0 6000 4000" preserveAspectRatio="xMinYMin meet">${edges}</svg>
      ${emptyState}
      ${omni.workflow.nodes.map(node => {
    const badges = [
      node.linkedSopId ? '<span title="SOP مرتبط"><i class="fa-solid fa-book"></i></span>' : workflowNodeNeedsSop(node) ? '<span class="workflow-node-warn" title="SOP مفقود"><i class="fa-solid fa-book"></i></span>' : '',
      node.linkedMachineId ? '<span title="ماكينة مرتبطة"><i class="fa-solid fa-gear"></i></span>' : workflowNodeNeedsMachine(node) ? '<span class="workflow-node-warn" title="ماكينة مفقودة"><i class="fa-solid fa-gear"></i></span>' : '',
      (node.materialRequirements || []).length ? `<span title="مواد"><i class="fa-solid fa-cube"></i> ${(node.materialRequirements || []).length}</span>` : '',
      node.estimatedMinutes ? `<span title="دقائق تقديرية"><i class="fa-solid fa-clock"></i> ${node.estimatedMinutes}</span>` : ''
    ].filter(Boolean).join('');
    const nodeValidation = validateWorkflowDeep({ nodes: omni.workflow.nodes || [], edges: omni.workflow.edges || [] });
    const nodeWarning = [...nodeValidation.errors, ...nodeValidation.warnings].some(item => item.nodeId === node.id);
    const nodeReadiness = calculateWorkflowNodeReadiness(node);
    const ports = getWorkflowNodePorts(node).map(port => {
      const semantic = getWorkflowPortSemantic(node, port.name);
      const style = getWorkflowConnectionStyle(semantic);
      const connected = isWorkflowPortConnected(node.id, port.name);
      const active = workflowPortLink?.nodeId === node.id && workflowPortLink?.portName === port.name;
      const title = `${port.label} · ${style.label}${connected ? ' · متصل' : ' · غير متصل'}`;
      return `<button class="workflow-node-port workflow-node-port-${port.name} workflow-node-port-${port.type} workflow-port-${semantic} ${connected ? 'is-connected' : 'is-empty'} ${active ? 'workflow-node-port-active' : ''}" style="--workflow-port-color:${style.color};--workflow-port-glow:${style.glow}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation(); ${port.type === 'input' ? `completeWorkflowPortLink('${node.id}', '${port.name}')` : `startWorkflowPortLink('${node.id}', '${port.name}')`}"></button>`;
    }).join('');
    return `
    <div class="workflow-node workflow-node-v2 node-${escapeHtml(node.type)} ${omni.workflow.selectedNodeId === node.id ? 'workflow-node-selected workflow-node-selected-v2' : ''} ${nodeWarning ? 'workflow-node-warning' : ''}" data-workflow-node-id="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px" onpointerdown="startWorkflowNodePointer(event, '${node.id}')" onclick="selectWorkflowNode('${node.id}', event)">
      ${ports}
      <span class="workflow-node-readiness">${nodeReadiness}%</span>
      <div class="node-type">${escapeHtml(getWorkflowNodeLabel(node.type))}</div><h4 ondblclick="event.stopPropagation(); openWorkflowNodeQuickMenu('${node.id}', event.clientX, event.clientY, true)">${escapeHtml(node.title)}</h4><p>${escapeHtml(node.description || '')}</p><div class="workflow-node-badges">${badges}</div>
    </div>`;
  }).join('')}
    </div>
    <div id="workflowMinimap" class="workflow-minimap"></div>`;
  canvas.onpointerdown = startWorkflowPan;
  canvas.onpointermove = function(event) { moveWorkflowPan(event); updateWorkflowTemporaryEdge(event); };
  canvas.onpointerup = endWorkflowPan;
  canvas.onpointercancel = endWorkflowPan;
  canvas.onclick = function(event) {
    if (event.target.closest?.('.workflow-node, .workflow-node-quick-menu, .workflow-edge, .workflow-canvas-toolbar, .workflow-minimap')) return;
    closeWorkflowNodeQuickMenu();
    closeWorkflowEdgeToolbar();
    clearWorkflowTemporaryInteraction();
    setWorkflowSelection({});
    renderWorkflowStudio();
  };
  canvas.onwheel = function(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.altKey) {
      const step = event.ctrlKey || event.metaKey ? 0.16 : 0.1;
      setWorkflowZoom(workflowViewport.zoom + (event.deltaY < 0 ? step : -step), event.clientX, event.clientY);
      return;
    }
    if (event.shiftKey) {
      workflowViewport.panX -= event.deltaY;
    } else {
      workflowViewport.panX -= event.deltaX;
      workflowViewport.panY -= event.deltaY;
    }
    applyWorkflowViewport({ skipSave: true, skipMinimap: true });
    clearTimeout(workflowViewportCommitTimer);
    workflowViewportCommitTimer = setTimeout(() => applyWorkflowViewport(), 120);
  };
  applyWorkflowViewport();
}

function omniDragNodeType(ev, type) {
  omniDraggedNodeType = type;
  ev.dataTransfer.setData('nodeType', type);
}

function omniDragExistingNode(ev, nodeId) {
  ev.dataTransfer.setData('nodeId', nodeId);
}

function workflowCanvasDrop(ev) {
  ev.preventDefault();
  ensureOmni();
  const point = screenToWorkflowPoint(ev.clientX, ev.clientY);
  const nodeId = ev.dataTransfer.getData('nodeId');
  if (nodeId) {
    const node = omni.workflow.nodes.find(n => n.id === nodeId);
    if (node) {
      pushWorkflowUndoSnapshot('node_move');
      node.x = Math.max(10, snapWorkflowPoint(point.x - 100));
      node.y = Math.max(10, snapWorkflowPoint(point.y - 56));
      addWorkflowNodeActivity(node.id, 'تم نقل الخطوة على لوحة العملية');
    }
  } else {
    const type = omniDraggedNodeType || ev.dataTransfer.getData('nodeType') || 'action';
    pushWorkflowUndoSnapshot('node_create');
    omni.workflow.nodes.push({ id: makeId('wf'), type, title: getWorkflowNodeLabel(type), x: Math.max(10, snapWorkflowPoint(point.x - 100)), y: Math.max(10, snapWorkflowPoint(point.y - 56)), sop: '', description: 'اضغط لتعديل التفاصيل', linkedSopId: '', linkedMachineId: '', linkedOperationPackId: '', linkedCardId: '', linkedTaskId: '', linkedQcRecordId: '', orderId: '', department: '', branch: '', materialRequirements: [], assignedRole: '', estimatedMinutes: 0, costImpact: 0, successPath: '', failurePath: '', activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء الخطوة' }] });
  }
  omniDraggedNodeType = null;
  saveData();
  renderWorkflowStudio();
}

function selectWorkflowNode(nodeId, event) {
  ensureOmni();
  event?.stopPropagation?.();
  if (workflowInteractionState.didDrag) {
    workflowInteractionState.didDrag = false;
    return;
  }

  if (workflowPortLink && workflowInteractionState.mode === 'connect') {
    if (workflowPortLink.nodeId !== nodeId) {
      completeWorkflowPortLink(nodeId, 'input');
      return;
    }
  }

  const node = omni.workflow.nodes.find(n => n.id === nodeId);
  if (!node) return;
  setWorkflowSelection({ nodeId: node.id, edgeId: null });
  closeWorkflowEdgeToolbar();
  const screen = event ? { x: event.clientX, y: event.clientY } : workflowToScreenPoint(Number(node.x) || 0, Number(node.y) || 0);
  renderWorkflowStudio();
  openWorkflowNodeQuickMenu(node.id, screen.x, screen.y);
  return;
}

function addWorkflowNode(type = 'action') {
  ensureOmni();
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  pushWorkflowUndoSnapshot('node_create');
  omni.workflow.nodes.push({ id: makeId('wf'), type, title: getWorkflowNodeLabel(type), x: 120, y: 140, sop: '', description: 'اضغط لتعديل التفاصيل', linkedSopId: '', linkedMachineId: '', linkedOperationPackId: '', linkedCardId: '', linkedTaskId: '', linkedQcRecordId: '', orderId: '', department: '', branch: '', materialRequirements: [], assignedRole: '', estimatedMinutes: 0, costImpact: 0, successPath: '', failurePath: '', activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء الخطوة' }] });
  saveData();
  renderWorkflowStudio();
}

function clearWorkflowSelection() {
  ensureOmni();
  omni.workflow.selectedFrom = null;
  omni.workflow.selectedEdgeId = null;
  workflowPortLink = null;
  showToast('تم إلغاء التحديد والربط', 'info');
  renderWorkflowStudio();
}

function renderWorkflowEdgeToolbar(edge) {
  const from = getWorkflowNodeById(edge.from || edge.source || edge.sourceNodeId);
  const to = getWorkflowNodeById(edge.to || edge.target || edge.targetNodeId);
  return `
    <div class="workflow-edge-toolbar-head">
      <b>رابط العملية</b>
      <button class="icon-btn" onclick="closeWorkflowEdgeToolbar()" title="إغلاق"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <small>${escapeHtml(from?.title || edge.from || '')} ← ${escapeHtml(to?.title || edge.to || '')}</small>
    <label>التسمية<input id="wfEdgeQuickLabel" class="workflow-insp-input" value="${escapeHtml(edge.label || '')}"></label>
    <div class="workflow-edge-toolbar-actions">
      <button class="btn-primary" onclick="saveWorkflowEdgeQuickEdit('${edge.id}')"><i class="fa-solid fa-check"></i> حفظ</button>
      <button class="btn-secondary" onclick="openWorkflowEdgeInspector('${edge.id}'); closeWorkflowEdgeToolbar();"><i class="fa-solid fa-sliders"></i> تحرير متقدم</button>
      <button class="btn-danger" onclick="deleteWorkflowEdgeExplicit('${edge.id}')"><i class="fa-solid fa-trash"></i> حذف الرابط</button>
    </div>
  `;
}

function openWorkflowEdgeToolbar(edgeId, screenX, screenY) {
  const edge = (omni.workflow.edges || []).find(e => e.id === edgeId);
  if (!edge) return;
  closeWorkflowNodeQuickMenu();
  closeWorkflowEdgeToolbar();
  const point = clampWorkflowFloatingPoint(screenX + 10, screenY - 12, 320, 230);
  const toolbar = document.createElement('div');
  toolbar.id = 'workflowEdgeToolbar';
  toolbar.className = 'workflow-edge-toolbar';
  toolbar.style.left = `${point.x}px`;
  toolbar.style.top = `${point.y}px`;
  toolbar.dir = 'rtl';
  toolbar.innerHTML = renderWorkflowEdgeToolbar(edge);
  toolbar.addEventListener('pointerdown', event => event.stopPropagation());
  toolbar.addEventListener('click', event => event.stopPropagation());
  document.body.appendChild(toolbar);
  workflowInteractionState.edgeToolbarId = edgeId;
  workflowInteractionState.edgeToolbarX = point.x;
  workflowInteractionState.edgeToolbarY = point.y;
}

function saveWorkflowEdgeQuickEdit(edgeId) {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const edge = (omni.workflow.edges || []).find(e => e.id === edgeId);
  if (!edge) return;
  edge.label = document.getElementById('wfEdgeQuickLabel')?.value?.trim() || edge.label || '';
  saveData();
  renderWorkflowStudio();
  openWorkflowEdgeToolbar(edgeId, workflowInteractionState.edgeToolbarX, workflowInteractionState.edgeToolbarY);
  showToast('تم تحديث الرابط', 'success');
}

async function deleteWorkflowEdgeExplicit(edgeId) {
  closeWorkflowEdgeToolbar();
  await deleteWorkflowEdge(edgeId, { skipConfirm: true });
}

function openWorkflowEdgeInspector(edgeId) {
  ensureOmni();
  omni.workflow.selectedEdgeId = edgeId;
  const edge = (omni.workflow.edges || []).find(e => e.id === edgeId);
  const from = edge ? getWorkflowNodeById(edge.from || edge.source || edge.sourceNodeId) : null;
  const to = edge ? getWorkflowNodeById(edge.to || edge.target || edge.targetNodeId) : null;
  renderWorkflowStudio();
  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!panel || !edge) return;
  title.textContent = 'رابط العملية';
  tabs.innerHTML = '<button class="insp-tab active">الرابط</button>';
  body.innerHTML = `
    <div class="insp-section"><h4>من</h4><p>${escapeHtml(from?.title || edge.from)}</p></div>
    <div class="insp-section"><h4>إلى</h4><p>${escapeHtml(to?.title || edge.to)}</p></div>
    <div class="insp-section"><h4>التسمية</h4><input class="workflow-insp-input" value="${escapeHtml(edge.label || '')}" onchange="updateWorkflowEdgeLabel('${edge.id}', this.value)"></div>
    <div class="workflow-insp-grid">
      <label>منفذ المصدر<select class="workflow-insp-input" onchange="updateWorkflowEdgePort('${edge.id}', 'sourcePort', this.value)">
        ${['output','success','failure','rework'].map(p => `<option value="${p}" ${edge.sourcePort === p ? 'selected' : ''}>${p === 'output' ? 'مخرج' : p === 'success' ? 'نجاح' : p === 'failure' ? 'فشل' : 'إعادة عمل'}</option>`).join('')}
      </select></label>
      <label>نوع الرابط<select class="workflow-insp-input" onchange="updateWorkflowEdgePort('${edge.id}', 'type', this.value)">
        ${['normal','success','failure','rework'].map(p => `<option value="${p}" ${edge.type === p ? 'selected' : ''}>${p === 'normal' ? 'عادي' : p === 'success' ? 'نجاح' : p === 'failure' ? 'فشل' : 'إعادة عمل'}</option>`).join('')}
      </select></label>
    </div>
    <div class="insp-actions"><button class="btn-danger" onclick="deleteWorkflowEdge('${edge.id}')"><i class="fa-solid fa-trash"></i> حذف الرابط</button></div>
  `;
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function selectWorkflowEdge(edgeId, event) {
  ensureOmni();
  event?.stopPropagation?.();
  const edge = (omni.workflow.edges || []).find(e => e.id === edgeId);
  if (!edge) return;
  setWorkflowSelection({ nodeId: null, edgeId });
  renderWorkflowStudio();
  if (event) {
    openWorkflowEdgeToolbar(edgeId, event.clientX, event.clientY);
  } else {
    const from = getWorkflowNodeById(edge.from || edge.source || edge.sourceNodeId);
    const to = getWorkflowNodeById(edge.to || edge.target || edge.targetNodeId);
    const mid = from && to ? getWorkflowEdgeMidpoint(from, to, edge) : { x: 160, y: 160 };
    const screen = workflowToScreenPoint(mid.x, mid.y);
    openWorkflowEdgeToolbar(edgeId, screen.x, screen.y);
  }
}

function updateWorkflowEdgeLabel(edgeId, label) {
  const edge = (omni.workflow.edges || []).find(e => e.id === edgeId);
  if (!edge) return;
  edge.label = label;
  saveData();
  renderWorkflowStudio();
  openWorkflowEdgeInspector(edgeId);
}

function updateWorkflowEdgePort(edgeId, field, value) {
  const edge = (omni.workflow.edges || []).find(e => e.id === edgeId);
  if (!edge) return;
  edge[field] = value;
  if (field === 'type' && ['success', 'failure', 'rework'].includes(value)) edge.sourcePort = value;
  if (field === 'sourcePort') edge.type = normalizeWorkflowPortName(value) === 'output' ? 'normal' : normalizeWorkflowPortName(value);
  if (field === 'sourcePort' || field === 'targetPort') edge[field] = normalizeWorkflowPortName(edge[field]);
  saveData();
  renderWorkflowStudio();
  openWorkflowEdgeInspector(edgeId);
}

function setWorkflowLinkSource(nodeId) {
  ensureOmni();
  startWorkflowPortLink(nodeId, 'output');
}

function openWorkflowNodeInspector(nodeId, activeTab = 0) {
  ensureOmni();
  const node = getWorkflowNodeById(nodeId);
  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!node || !panel || !overlay || !title || !tabs || !body) return;
  omni.workflow.selectedNodeId = node.id;
  title.textContent = node.title || 'خطوة في العملية';
  const tabList = ['نظرة عامة', 'روابط', 'مواد', 'مسارات', 'محاكاة', 'نشاط', 'روابط خلفية'];

  function renderTab(tabIdx) {
    const current = getWorkflowNodeById(nodeId);
    if (!current) return;
    tabs.innerHTML = tabList.map((t, i) => `<button class="insp-tab ${i === tabIdx ? 'active' : ''}" onclick="renderWorkflowInspectorTab('${nodeId}', ${i})">${escapeHtml(t)}</button>`).join('');
    if (tabIdx === 0) {
      body.innerHTML = renderWorkflowOverviewTab(current);
    } else if (tabIdx === 1) {
      body.innerHTML = renderWorkflowLinksTab(current);
    } else if (tabIdx === 2) {
      body.innerHTML = renderWorkflowMaterialsTab(current);
    } else if (tabIdx === 3) {
      body.innerHTML = renderWorkflowRoutingTab(current);
    } else if (tabIdx === 4) {
      body.innerHTML = renderWorkflowSimulationTab();
    } else if (tabIdx === 5) {
      body.innerHTML = `
        <div class="insp-section"><h4>النشاط</h4>
          ${(current.activityLog || []).map(item => `<div class="insp-linked-item"><b>${escapeHtml(item.text)}</b><small>${escapeHtml(item.date)}</small></div>`).join('') || '<p>لا يوجد نشاط بعد</p>'}
        </div>
      `;
    } else {
      body.innerHTML = renderWorkflowNodeRelations(nodeId);
    }
  }

  renderTab(activeTab);
  window.renderWorkflowInspectorTab = function(nid, idx) { openWorkflowNodeInspector(nid, idx); };
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function renderWorkflowOverviewTab(node) {
  const validation = validateWorkflowDeep(omni.workflow);
  const warnings = [...validation.errors, ...validation.warnings].filter(item => item.nodeId === node.id);
  return `
    <div class="workflow-node-inspector-summary">
      <span><b>النوع</b>${escapeHtml(getWorkflowNodeLabel(node.type))}</span>
      <span><b>الجاهزية</b>${calculateWorkflowNodeReadiness(node)}%</span>
      <span><b>SOP</b>${escapeHtml(getSopById(node.linkedSopId)?.title || '-')}</span>
      <span><b>الماكينة</b>${escapeHtml(getMachineById(node.linkedMachineId)?.name || '-')}</span>
      <span><b>المواد</b>${(node.materialRequirements || []).length}</span>
      <span><b>التحذيرات</b>${warnings.length}</span>
    </div>
    <div class="workflow-insp-grid">
      <label>العنوان<input class="workflow-insp-input" value="${escapeHtml(node.title || '')}" onchange="workflowNodeFieldChanged('${node.id}', 'title', this.value, 'تم تحديث العنوان')"></label>
      <label>النوع<select class="workflow-insp-input" onchange="workflowNodeFieldChanged('${node.id}', 'type', this.value, 'تم تحديث النوع')">${WORKFLOW_NODE_TYPES.map(t => `<option value="${t}" ${node.type === t ? 'selected' : ''}>${getWorkflowNodeLabel(t)}</option>`).join('')}</select></label>
      <label>الوصف<textarea class="workflow-insp-input" onchange="workflowNodeFieldChanged('${node.id}', 'description', this.value, 'تم تحديث الوصف')">${escapeHtml(node.description || '')}</textarea></label>
      <label>الدور المسؤول<input class="workflow-insp-input" value="${escapeHtml(node.assignedRole || '')}" onchange="workflowNodeFieldChanged('${node.id}', 'assignedRole', this.value, 'تم تحديث الدور المسؤول')"></label>
      <label>القسم<input class="workflow-insp-input" value="${escapeHtml(node.department || '')}" onchange="workflowNodeFieldChanged('${node.id}', 'department', this.value, 'تم تحديث القسم')"></label>
      <label>الفرع<input class="workflow-insp-input" value="${escapeHtml(node.branch || '')}" onchange="workflowNodeFieldChanged('${node.id}', 'branch', this.value, 'تم تحديث الفرع')"></label>
      <label>الدقائق التقديرية<input type="number" min="0" class="workflow-insp-input" value="${Number(node.estimatedMinutes) || 0}" onchange="workflowNodeFieldChanged('${node.id}', 'estimatedMinutes', this.value, 'تم تحديث الوقت التقديري')"></label>
      <label>أثر الكلفة<input type="number" min="0" class="workflow-insp-input" value="${Number(node.costImpact) || 0}" onchange="workflowNodeFieldChanged('${node.id}', 'costImpact', this.value, 'تم تحديث أثر الكلفة')"></label>
    </div>
    <div class="insp-actions">
      <button class="btn-primary" onclick="setWorkflowLinkSource('${node.id}')"><i class="fa-solid fa-link"></i> بدء الربط</button>
      <button class="btn-danger" onclick="deleteWorkflowNode('${node.id}')"><i class="fa-solid fa-trash"></i> حذف الخطوة</button>
    </div>
  `;
}

function renderWorkflowLinksTab(node) {
  return `
    <div class="workflow-insp-grid">
      <label>SOP<select class="workflow-insp-input" onchange="workflowNodeSelectChanged('${node.id}', 'linkedSopId', this.value, 'تم ربط SOP')">
        <option value="">بدون SOP</option>${(omni.sops || []).map(s => `<option value="${s.id}" ${node.linkedSopId === s.id ? 'selected' : ''}>${escapeHtml(s.code || s.title)} - ${escapeHtml(s.title)}</option>`).join('')}
      </select></label>
      <label>ماكينة<select class="workflow-insp-input" onchange="workflowNodeSelectChanged('${node.id}', 'linkedMachineId', this.value, 'تم ربط ماكينة')">
        <option value="">بدون ماكينة</option>${(omni.machines || []).map(m => `<option value="${m.id}" ${node.linkedMachineId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
      </select></label>
      <label>باقة عمليات<select class="workflow-insp-input" onchange="workflowNodeSelectChanged('${node.id}', 'linkedOperationPackId', this.value, 'تم ربط باقة عمليات')">
        <option value="">بدون باقة عمليات</option>${(omni.opPacks || []).map(p => `<option value="${p.id}" ${node.linkedOperationPackId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select></label>
      <label>بطاقة اللوحة<select class="workflow-insp-input" onchange="workflowNodeSelectChanged('${node.id}', 'linkedCardId', this.value, 'تم ربط بطاقة اللوحة')">
        <option value="">بدون بطاقة</option>${(omni.kanban?.cards || []).map(c => `<option value="${c.id}" ${node.linkedCardId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('')}
      </select></label>
      <label>سجل QC<select class="workflow-insp-input" onchange="workflowNodeSelectChanged('${node.id}', 'linkedQcRecordId', this.value, 'تم ربط سجل QC')">
        <option value="">بدون QC</option>${(omni.qcRecords || []).map(q => `<option value="${q.id}" ${node.linkedQcRecordId === q.id ? 'selected' : ''}>${escapeHtml(q.type || q.id)} - ${escapeHtml(q.result || '')}</option>`).join('')}
      </select></label>
      <label>رقم الطلب<input class="workflow-insp-input" value="${escapeHtml(node.orderId || '')}" onchange="workflowNodeSelectChanged('${node.id}', 'orderId', this.value, 'تم تحديث رقم الطلب')"></label>
    </div>
    <div class="insp-section"><h4>الروابط الحالية</h4>
      <p>SOP: ${escapeHtml(getSopById(node.linkedSopId)?.title || '-')}</p>
      <p>الماكينة: ${escapeHtml(getMachineById(node.linkedMachineId)?.name || '-')}</p>
      <p>باقة العمليات: ${escapeHtml(getOperationPackById(node.linkedOperationPackId)?.name || '-')}</p>
      <p>بطاقة اللوحة: ${escapeHtml((omni.kanban?.cards || []).find(c => c.id === node.linkedCardId)?.title || '-')}</p>
    </div>
  `;
}

function getWorkflowNodeRelations(node) {
  return [
    node.linkedSopId && { type: 'sop', id: node.linkedSopId, title: getSopById(node.linkedSopId)?.title || node.linkedSopId, label: 'SOP' },
    node.linkedMachineId && { type: 'machine', id: node.linkedMachineId, title: getMachineById(node.linkedMachineId)?.name || node.linkedMachineId, label: 'ماكينة' },
    node.linkedOperationPackId && { type: 'op_pack', id: node.linkedOperationPackId, title: getOperationPackById(node.linkedOperationPackId)?.name || node.linkedOperationPackId, label: 'باقة عمليات' },
    node.linkedCardId && { type: 'kanban_card', id: node.linkedCardId, title: (omni.kanban?.cards || []).find(c => c.id === node.linkedCardId)?.title || node.linkedCardId, label: 'بطاقة اللوحة' },
    node.linkedQcRecordId && { type: 'qc_record', id: node.linkedQcRecordId, title: getQcRecordById(node.linkedQcRecordId)?.type || node.linkedQcRecordId, label: 'QC' },
    node.orderId && { type: 'order', id: node.orderId, title: getOrderById(node.orderId)?.title || node.orderId, label: 'طلب' },
    ...(node.materialRequirements || []).map(req => ({ type: 'material', id: req.materialId, title: getMaterialById(req.materialId)?.name || req.materialId, label: 'مادة' }))
  ].filter(Boolean);
}

function renderWorkflowNodeRelations(nodeId) {
  const node = getWorkflowNodeById(nodeId);
  if (!node) return '';
  const relations = getWorkflowNodeRelations(node);
  return `
    <div class="insp-section"><h4>روابط هذه الخطوة</h4>
      ${relations.map(r => `<div class="insp-linked-item workflow-inspector-linked-card" onclick="openOmniEntity('${r.type}', '${r.id}')" style="cursor:pointer"><b>${escapeHtml(r.label)}: ${escapeHtml(r.title)}</b><small>${escapeHtml(r.id)}</small></div>`).join('') || '<p>لا توجد روابط بعد</p>'}
    </div>
    <div class="insp-section"><h4>الروابط الخلفية</h4>
      ${typeof renderEntityRelationsPanel === 'function' ? renderEntityRelationsPanel('workflow_node', nodeId) : '<p>لوحة الروابط الخلفية غير متاحة</p>'}
    </div>
  `;
}

function linkWorkflowNodeToEntity(nodeId, entityType, entityId) {
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  const fieldMap = { sop: 'linkedSopId', machine: 'linkedMachineId', op_pack: 'linkedOperationPackId', kanban_card: 'linkedCardId', task: 'linkedTaskId', qc_record: 'linkedQcRecordId', order: 'orderId' };
  const field = fieldMap[entityType];
  if (!field) return;
  node[field] = entityId || '';
  addWorkflowNodeActivity(nodeId, `تم تحديث رابط ${entityType}`);
  saveData();
  openWorkflowNodeInspector(nodeId, 6);
}

function unlinkWorkflowNodeEntity(nodeId, entityType) {
  linkWorkflowNodeToEntity(nodeId, entityType, '');
}

function renderWorkflowMaterialsTab(node) {
  return `
    <div class="insp-section"><h4>المواد المطلوبة</h4>
      ${(node.materialRequirements || []).map((req, idx) => {
        const mat = getMaterialById(req.materialId);
        const qty = getMaterialRequirementQty(req);
        const status = materialAvailabilityStatus(req);
        const label = status === 'available' ? 'متوفر' : status === 'short' ? 'ناقص' : 'مفقود';
        return `<div class="workflow-material-row">
          <div><b>${escapeHtml(mat?.name || req.materialId || 'مادة مفقودة')}</b><small>مطلوب ${qty} ${escapeHtml(req.unit || mat?.unit || '')} / متاح ${mat ? getMaterialAvailableQty(mat) : 0}</small></div>
          <span class="workflow-status-pill workflow-status-${status}">${label}</span>
          <button class="btn-xs btn-danger" onclick="removeWorkflowNodeMaterial('${node.id}', ${idx})"><i class="fa-solid fa-times"></i></button>
        </div>`;
      }).join('') || '<p>لا توجد مواد مرتبطة</p>'}
    </div>
    <div class="workflow-insp-grid">
      <label>المادة<select class="workflow-insp-input" id="workflowMaterialSelect">${(omni.materials || []).map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${getMaterialAvailableQty(m)} ${escapeHtml(m.unit || '')})</option>`).join('')}</select></label>
      <label>الكمية<input class="workflow-insp-input" id="workflowMaterialQty" type="number" min="0" step="0.01" value="1"></label>
      <label>الوحدة<input class="workflow-insp-input" id="workflowMaterialUnit" value=""></label>
    </div>
    <div class="insp-actions"><button class="btn-primary" onclick="addWorkflowNodeMaterial('${node.id}')"><i class="fa-solid fa-plus"></i> إضافة مادة</button></div>
  `;
}

function renderWorkflowRoutingTab(node) {
  const options = (omni.workflow.nodes || []).filter(n => n.id !== node.id).map(n => `<option value="${n.id}">${escapeHtml(n.title)}</option>`).join('');
  const outEdges = (omni.workflow.edges || []).filter(e => (e.from || e.source || e.sourceNodeId) === node.id);
  const inEdges = (omni.workflow.edges || []).filter(e => (e.to || e.target || e.targetNodeId) === node.id);
  return `
    <div class="workflow-insp-grid">
      <label>مسار نجاح<select class="workflow-insp-input" onchange="workflowNodeSelectChanged('${node.id}', 'successPath', this.value, 'تم تحديث مسار النجاح')"><option value="">بدون مسار نجاح</option>${(omni.workflow.nodes || []).filter(n => n.id !== node.id).map(n => `<option value="${n.id}" ${node.successPath === n.id ? 'selected' : ''}>${escapeHtml(n.title)}</option>`).join('')}</select></label>
      <label>مسار فشل<select class="workflow-insp-input" onchange="workflowNodeSelectChanged('${node.id}', 'failurePath', this.value, 'تم تحديث مسار الفشل')"><option value="">بدون مسار فشل</option>${(omni.workflow.nodes || []).filter(n => n.id !== node.id).map(n => `<option value="${n.id}" ${node.failurePath === n.id ? 'selected' : ''}>${escapeHtml(n.title)}</option>`).join('')}</select></label>
    </div>
    <div class="insp-section"><h4>الروابط</h4>
      ${outEdges.map(e => `<div class="insp-linked-item"><b>خارج إلى ${escapeHtml(getWorkflowNodeById(e.to || e.target || e.targetNodeId)?.title || e.to || e.target || e.targetNodeId)}</b><small>${escapeHtml(e.label || '')}</small><button class="btn-xs btn-danger" onclick="deleteWorkflowEdge('${e.id}')">حذف الرابط</button></div>`).join('') || '<p>لا توجد روابط خارجة</p>'}
      ${inEdges.map(e => `<div class="insp-linked-item"><b>داخل من ${escapeHtml(getWorkflowNodeById(e.from || e.source || e.sourceNodeId)?.title || e.from || e.source || e.sourceNodeId)}</b><small>${escapeHtml(e.label || '')}</small></div>`).join('')}
    </div>
    <div class="insp-actions"><button class="btn-primary" onclick="setWorkflowLinkSource('${node.id}')"><i class="fa-solid fa-link"></i> بدء الربط من هذه الخطوة</button></div>
  `;
}

function renderWorkflowSimulationTab() {
  const result = simulateWorkflowRun();
  return `
    <div class="workflow-sim-score"><b>${result.readiness.score}%</b><span>جاهزية العملية</span></div>
    <div class="workflow-sim-grid">
      <div><b>${result.nodesCount}</b><span>خطوات</span></div>
      <div><b>${result.edgesCount}</b><span>روابط</span></div>
      <div><b>${result.totalEstimatedMinutes}</b><span>دقائق</span></div>
      <div><b>${result.totalCostImpact.toLocaleString()}</b><span>كلفة</span></div>
    </div>
    <div class="insp-section"><h4>المواد</h4>${result.materials.map(m => `<div class="insp-linked-item"><b>${escapeHtml(m.name)}</b><small>مطلوب ${m.qty} ${escapeHtml(m.unit)} / متاح ${m.available}</small></div>`).join('') || '<p>لا توجد مواد مطلوبة</p>'}</div>
    <div class="insp-section"><h4>مواد ناقصة</h4>${result.missingMaterials.map(m => `<div class="insp-linked-item"><b>${escapeHtml(m.name)}</b><small>مطلوب ${m.qty} / متاح ${m.available}</small></div>`).join('') || '<p>لا يوجد نقص مواد</p>'}</div>
    <div class="insp-section"><h4>المكائن</h4>${result.machines.map(m => `<div class="insp-linked-item"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(translateMachineStatus(m.status))} / طابور ${getMachineQueueCount(m)}</small></div>`).join('') || '<p>لا توجد مكائن مطلوبة</p>'}</div>
    <div class="insp-section"><h4>SOPs</h4>${result.sops.map(s => `<div class="insp-linked-item"><b>${escapeHtml(s.title)}</b><small>${escapeHtml(s.code || '')}</small></div>`).join('') || '<p>No SOPs linked</p>'}</div>
    <div class="insp-section"><h4>تحذيرات</h4>${result.routingWarnings.map(w => `<div class="insp-linked-item"><b>${escapeHtml(w.text || w.type)}</b></div>`).join('') || '<p>لا توجد تحذيرات مسار</p>'}</div>
    <div class="insp-actions"><button class="btn-primary" onclick="runWorkflowSimulation()"><i class="fa-solid fa-play"></i> اختبار وفحص العملية</button></div>
  `;
}

function workflowNodeFieldChanged(nodeId, field, value, logText) {
  const patch = {};
  patch[field] = field === 'estimatedMinutes' || field === 'costImpact' ? Number(value) || 0 : value;
  updateWorkflowNode(nodeId, patch);
  addWorkflowNodeActivity(nodeId, logText);
  saveData();
  openWorkflowNodeInspector(nodeId, 0);
}

function workflowNodeSelectChanged(nodeId, field, value, logText) {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  if ((field === 'successPath' || field === 'failurePath') && value === nodeId) return showToast('A node cannot route to itself', 'warning');
  node[field] = value;
  addWorkflowNodeActivity(nodeId, logText);
  saveData();
  renderWorkflowStudio();
  openWorkflowNodeInspector(nodeId, field === 'successPath' || field === 'failurePath' ? 3 : 1);
}

function addWorkflowNodeMaterial(nodeId) {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const node = getWorkflowNodeById(nodeId);
  const materialId = document.getElementById('workflowMaterialSelect')?.value;
  if (!node || !materialId) return;
  const material = getMaterialById(materialId);
  const qty = Number(document.getElementById('workflowMaterialQty')?.value) || 1;
  const unit = document.getElementById('workflowMaterialUnit')?.value || material?.unit || '';
  node.materialRequirements.push({ materialId, qty, unit });
  addWorkflowNodeActivity(nodeId, `Material added: ${material?.name || materialId}`);
  saveData();
  renderWorkflowStudio();
  openWorkflowNodeInspector(nodeId, 2);
}

function removeWorkflowNodeMaterial(nodeId, idx) {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const node = getWorkflowNodeById(nodeId);
  if (!node || !node.materialRequirements?.[idx]) return;
  const req = node.materialRequirements[idx];
  const material = getMaterialById(req.materialId);
  node.materialRequirements.splice(idx, 1);
  addWorkflowNodeActivity(nodeId, `Material removed: ${material?.name || req.materialId}`);
  saveData();
  renderWorkflowStudio();
  openWorkflowNodeInspector(nodeId, 2);
}

function buildWorkflowExecutionPreview(workflow = omni.workflow) {
  const nodes = [...(workflow.nodes || [])].sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0) || (Number(a.y) || 0) - (Number(b.y) || 0));
  const sops = nodes.map(n => getSopById(n.linkedSopId)).filter(Boolean);
  const machines = nodes.map(n => getMachineById(n.linkedMachineId)).filter(Boolean);
  const materialsMap = {};
  nodes.forEach(node => (node.materialRequirements || []).forEach(req => {
    const mat = getMaterialById(req.materialId);
    const key = req.materialId || 'missing';
    if (!materialsMap[key]) materialsMap[key] = { materialId: key, name: mat?.name || key, qty: 0, unit: req.unit || mat?.unit || '', available: mat ? getMaterialAvailableQty(mat) : 0 };
    materialsMap[key].qty += getMaterialRequirementQty(req);
  }));
  const materials = Object.values(materialsMap);
  return {
    steps: nodes,
    sops,
    machines,
    materials,
    estimatedMinutes: nodes.reduce((sum, n) => sum + (Number(n.estimatedMinutes) || 0), 0),
    estimatedCost: nodes.reduce((sum, n) => sum + (Number(n.costImpact) || 0), 0),
    bottlenecks: machines.filter(m => getMachineQueueCount(m) > 3 || /maintenance|offline|down|صيانة|متوقفة/i.test(String(m.status || ''))),
    missingLinks: validateWorkflowDeep(workflow).warnings.concat(validateWorkflowDeep(workflow).errors),
    expectedCards: nodes.map(n => ({ title: n.title, sopIds: n.linkedSopId ? [n.linkedSopId] : [], machineIds: n.linkedMachineId ? [n.linkedMachineId] : [] }))
  };
}

function renderWorkflowExecutionPreview(preview) {
  return `
    <div class="workflow-validation-panel" style="direction: rtl;">
      <div class="workflow-sim-grid">
        <div><b>${preview.steps.length}</b><span>خطوات</span></div>
        <div><b>${preview.estimatedMinutes}</b><span>دقائق</span></div>
        <div><b>${preview.estimatedCost.toLocaleString()}</b><span>كلفة تقديرية</span></div>
        <div><b>${preview.expectedCards.length}</b><span>بطاقات متوقعة</span></div>
      </div>
      <div class="insp-section"><h4>الخطوات المرتبة</h4>${preview.steps.map((n, i) => `<div class="insp-linked-item"><b>${i + 1}. ${escapeHtml(n.title)}</b><small>${escapeHtml(getWorkflowNodeLabel(n.type))} · ${Number(n.estimatedMinutes) || 0} دقيقة</small></div>`).join('') || '<p>لا توجد خطوات</p>'}</div>

      <div class="insp-section">
        <h4>البطاقات والمهام المتوقع توليدها في الكانبان</h4>
        ${preview.steps.map((n, i) => {
          const colName = i === 0 ? 'جاهز للتنفيذ (kb_ready)' : 'قائمة الانتظار (kb_backlog)';
          const priorityHtml = i === 0
            ? '<span style="color:#ef4444; font-weight:bold; font-size:11px; background:rgba(239,68,68,0.1); padding:2px 6px; border-radius:4px;">عالي Priority</span>'
            : '<span style="color:var(--text-muted); font-size:11px; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">عادي Priority</span>';
          return `
            <div class="insp-linked-item" style="border-inline-start: 3px solid ${i === 0 ? '#ef4444' : 'var(--primary)'}; padding-inline-start:12px; display:block; text-align:right;">
              <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:4px;">
                <b>${escapeHtml(n.title)}</b>
                ${priorityHtml}
              </div>
              <small style="display:block; color:var(--text-muted); font-size:11px;">
                القسم: ${escapeHtml(n.department || 'عام')} · المسؤول: ${escapeHtml(n.assignedRole || 'النظام')} · العمود: ${colName}
              </small>
              <div style="margin-top:6px; display:flex; gap:12px; font-size:11px; color:var(--text-muted);">
                ${n.linkedSopId ? '<span><i class="fa-solid fa-book" style="color:var(--primary);"></i> SOP مرتبط</span>' : ''}
                ${n.linkedMachineId ? '<span><i class="fa-solid fa-cog" style="color:var(--primary);"></i> ماكينة</span>' : ''}
                ${(n.materialRequirements || []).length ? '<span><i class="fa-solid fa-boxes-stacked" style="color:var(--primary);"></i> ' + (n.materialRequirements || []).length + ' مواد</span>' : ''}
                ${n.estimatedMinutes ? '<span><i class="fa-solid fa-clock" style="color:var(--primary);"></i> ' + n.estimatedMinutes + ' دقيقة</span>' : ''}
              </div>
            </div>
          `;
        }).join('') || '<p>لا توجد بطاقات للتوليد</p>'}
      </div>

      <div class="insp-section"><h4>SOPs المطلوبة</h4>${preview.sops.map(s => `<div class="insp-linked-item"><b>${escapeHtml(s.title)}</b><small>${escapeHtml(s.code || '')}</small></div>`).join('') || '<p>لا توجد SOPs مرتبطة</p>'}</div>
      <div class="insp-section"><h4>المكائن المطلوبة</h4>${preview.machines.map(m => `<div class="insp-linked-item"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(translateMachineStatus(m.status || ''))} · طابور ${getMachineQueueCount(m)}</small></div>`).join('') || '<p>لا توجد مكائن مرتبطة</p>'}</div>
      <div class="insp-section"><h4>المواد المطلوبة</h4>${preview.materials.map(m => `<div class="insp-linked-item"><b>${escapeHtml(m.name)}</b><small>مطلب ${m.qty} ${escapeHtml(m.unit)} · متاح ${m.available}</small></div>`).join('') || '<p>لا توجد مواد مطلوبة</p>'}</div>
      <div class="insp-section"><h4>اختناقات محتملة</h4>${preview.bottlenecks.map(m => `<div class="insp-linked-item"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.status || '')} · طابور ${getMachineQueueCount(m)}</small></div>`).join('') || '<p>لا توجد اختناقات واضحة</p>'}</div>
      <div class="insp-section"><h4>روابط مفقودة</h4>${preview.missingLinks.slice(0, 12).map(w => `<div class="insp-linked-item"><b>${escapeHtml(w.severity || 'تحذير')}</b><small>${escapeHtml(w.text || '')}</small></div>`).join('') || '<p>لا توجد روابط مفقودة مؤثرة</p>'}</div>
    </div>`;
}

function openWorkflowExecutionPreview() {
  const preview = buildWorkflowExecutionPreview(omni.workflow);
  showOmniModal('معاينة التنفيذ', renderWorkflowExecutionPreview(preview), () => true);
}

function runWorkflowSimulation() {
  ensureOmni();
  const validation = validateWorkflowDeep(omni.workflow);
  const group = (title, items) => `<div class="insp-section"><h4>${title} (${items.length})</h4>${items.map(item => `<div class="insp-linked-item"><b>${escapeHtml(item.severity || '')}</b><small>${escapeHtml(item.text || '')}</small></div>`).join('') || '<p>لا يوجد</p>'}</div>`;
  const resultHtml = `
    <div class="workflow-validation-panel">
      <h3>نتائج اختبار وفحص العملية</h3>
      <div class="workflow-sim-score"><b>${validation.score}%</b><span>جاهزية النشر</span></div>
      <div class="workflow-sim-grid">
        <div><b>${validation.nodesChecked}</b><span>خطوات مفحوصة</span></div>
        <div><b>${validation.edgesChecked}</b><span>روابط مفحوصة</span></div>
        <div><b>${validation.errors.length}</b><span>أخطاء</span></div>
        <div><b>${validation.warnings.length}</b><span>تحذيرات</span></div>
      </div>
      ${group('أخطاء', validation.errors)}
      ${group('تحذيرات', validation.warnings)}
      ${group('اقتراحات', validation.suggestions)}
      <div class="insp-actions">
        <button class="btn-secondary" onclick="closeInspector()">إغلاق</button>
        <button class="btn-primary" onclick="openWorkflowExecutionPreview()"><i class="fa-solid fa-eye"></i> معاينة التنفيذ</button>
        ${validation.readyToPublish ? `<button class="btn-primary" style="background:#10b981;" onclick="publishWorkflow()"><i class="fa-solid fa-rocket"></i> نشر العملية</button>` : ''}
      </div>
    </div>`;

  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');

  if (panel && body) {
    title.textContent = 'اختبار وفحص العملية';
    tabs.innerHTML = '';
    body.innerHTML = resultHtml;
    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
}

async function publishWorkflow() {
  ensureOmni();
  const validation = validateWorkflowDeep(omni.workflow);
  if (validation.errors.length) {
    runWorkflowSimulation();
    return showToast('لا يمكن نشر العملية قبل معالجة الأخطاء', 'error');
  }
  if (validation.warnings.length) {
    const ok = await showOmniModal('نشر مع تحذيرات', `<p>توجد ${validation.warnings.length} تحذيرات. هل تريد نشر العملية رغم ذلك؟</p>`, () => true);
    if (!ok) return;
  }

  if (!Array.isArray(omni.workflowHistory)) {
    omni.workflowHistory = [];
  }

  const newVersion = Number(omni.workflow.version || 0) + 1;
  omni.workflow.version = newVersion;
  omni.workflow.published = true;
  omni.workflow.publishedAt = new Date().toISOString();
  omni.workflow.publishedBy = 'System';
  omni.workflow.status = 'published';

  omni.workflowHistory.push({
    version: newVersion,
    nodes: JSON.parse(JSON.stringify(omni.workflow.nodes || [])),
    edges: JSON.parse(JSON.stringify(omni.workflow.edges || [])),
    publishedAt: omni.workflow.publishedAt,
    publishedBy: omni.workflow.publishedBy,
    note: `نشر تلقائي للإصدار ${newVersion}`
  });

  saveData();
  closeInspector();
  showToast('تم نشر العملية بنجاح! الإصدار ' + omni.workflow.version, 'success');
  renderWorkflowStudio();
}

// T0.4 dedup (2026-07-12): dead copy, shadowed by the live definition below
// (adds a confirmation modal + audit event logging). Kept per add-only rule.
function unpublishWorkflow_deprecated_dup1() {
  ensureOmni();
  omni.workflow.status = 'draft';
  omni.workflow.published = false;
  saveData();
  renderWorkflowStudio();
}

function getWorkflowPublishStatus() {
  ensureOmni();
  return { status: omni.workflow.status || 'draft', version: omni.workflow.version || 1, publishedAt: omni.workflow.publishedAt || '', publishedBy: omni.workflow.publishedBy || '' };
}

async function triggerWorkflowExecution() {
  ensureOmni();
  if (omni.workflow.status !== 'published') return showToast('يجب نشر سير العمل أولاً قبل التنفيذ', 'warning');
  const client = await showOmniPrompt('اسم المشروع / الطلب لتوليد مهام Kanban:', '');
  if(!client) return;

  // Sort nodes left-to-right to generate cards in sequence
  const sortedNodes = [...omni.workflow.nodes].sort((a,b) => a.x - b.x);
  sortedNodes.forEach((node, i) => {
    const card = {
      id: makeId('card'), columnId: i === 0 ? 'kb_ready' : 'kb_backlog',
      title: `${client}: ${node.title}`,
      owner: node.assignedRole || 'System',
      assigneeId: node.assignedRole || '', // Auto assignment by role
      priority: i === 0 ? 'High' : 'Normal',
      dueDate: todayISO(), tags: ['Workflow'],
      description: `${node.description || ''}\nمن مسار العمل الإصدار ${omni.workflow.version}`,
      checklist: [],
      sopIds: node.linkedSopId ? [node.linkedSopId] : [],
      machineIds: node.linkedMachineId ? [node.linkedMachineId] : [],
      materialRequirements: node.materialRequirements || [],
      estimatedMinutes: node.estimatedMinutes || 0,
      costImpact: node.costImpact || 0,
      activityLog: [{ date: new Date().toISOString(), text: `Generated by Workflow Execution for ${client}` }]
    };
    omni.kanban.cards.push(card);

    // reserve materials
    (node.materialRequirements||[]).forEach(req => reserveMaterial(req.materialId, getMaterialRequirementQty(req), 'workflow', 'wf_run', `${client}: ${node.title}`));
  });
  saveData();
  showToast(`تم توليد ${sortedNodes.length} مهمة في اللوحة التنفيذية`, 'success');
  switchPage('kanban');
}

function getWorkflowDemoEntityDefaults() {
  ensureOmni();
  const sops = omni.sops || [];
  const machines = omni.machines || [];
  const materials = omni.materials || [];
  const opPacks = omni.opPacks || [];
  const qcTemplates = typeof getQcTemplates === 'function' ? getQcTemplates() : (omni.qcTemplates || []);
  const approvedSop = sops.find(s => ['approved', 'active', 'published', 'معتمد'].includes(String(s.status || s.approvalStatus || '').toLowerCase()));
  const availableMachine = machines.find(m => ['available', 'active', 'ready', 'متاح', 'جاهز'].includes(String(m.status || '').toLowerCase()));
  const qcTemplate = qcTemplates.find(t => /جودة|QC|فحص|تغليف|قياسات/i.test(`${t.title || ''} ${t.type || ''}`)) || qcTemplates[0] || null;
  const materialRequirements = [
    { materialId: materials[0]?.id || '', qty: 2, unit: materials[0]?.unit || 'لوح' },
    { materialId: materials[1]?.id || '', qty: 1, unit: materials[1]?.unit || 'علبة' }
  ];
  return {
    sopId: (approvedSop || sops[0] || {}).id || '',
    machineId: (availableMachine || machines[0] || {}).id || '',
    materialRequirements,
    operationPackId: (opPacks[0] || {}).id || '',
    qcTemplateId: (qcTemplate || {}).id || ''
  };
}

function buildComprehensiveWorkflowDemo() {
  const defaults = getWorkflowDemoEntityDefaults();
  const now = new Date().toISOString();
  const ids = {
    start: makeId('wf_demo'),
    design: makeId('wf_demo'),
    approval: makeId('wf_demo'),
    designRework: makeId('wf_demo'),
    materialCheck: makeId('wf_demo'),
    materialDelay: makeId('wf_demo'),
    operationPack: makeId('wf_demo'),
    machine: makeId('wf_demo'),
    sop: makeId('wf_demo'),
    qc: makeId('wf_demo'),
    qcRework: makeId('wf_demo'),
    finance: makeId('wf_demo'),
    notification: makeId('wf_demo'),
    delivery: makeId('wf_demo')
  };
  const activityLog = [{ date: now, text: 'تم إنشاء الخطوة ضمن مثال الفحص الشامل' }];
  const node = (key, payload) => ({
    id: ids[key],
    x: payload.x,
    y: payload.y,
    title: payload.title,
    type: payload.type,
    description: payload.description,
    assignedRole: payload.assignedRole || '',
    estimatedMinutes: payload.estimatedMinutes || 0,
    costImpact: payload.costImpact || 0,
    department: payload.department || '',
    branch: payload.branch || '',
    linkedSopId: payload.linkedSopId || '',
    linkedMachineId: payload.linkedMachineId || '',
    linkedOperationPackId: payload.linkedOperationPackId || '',
    linkedCardId: '',
    linkedTaskId: '',
    linkedQcRecordId: '',
    linkedQcTemplateId: payload.linkedQcTemplateId || '',
    orderId: '',
    materialRequirements: payload.materialRequirements || [],
    qcRequired: !!payload.qcRequired,
    successPath: payload.successPath || '',
    failurePath: payload.failurePath || '',
    qcPassPath: payload.qcPassPath || '',
    qcFailPath: payload.qcFailPath || '',
    qcReworkPath: payload.qcReworkPath || '',
    activityLog: activityLog.map(item => ({ ...item }))
  });
  const nodes = [
    node('start', { type: 'trigger', title: 'استلام طلب العميل', description: 'بداية العملية بعد تسجيل طلب إنتاج جديد.', assignedRole: 'المبيعات / الإدارة', estimatedMinutes: 10, x: 100, y: 220 }),
    node('design', { type: 'action', title: 'تجهيز التصميم والقياسات', description: 'تحضير ملف التصميم، القياسات، الألوان، ومراجعة متطلبات العميل.', assignedRole: 'قسم التصميم', estimatedMinutes: 45, x: 360, y: 220 }),
    node('approval', { type: 'approval', title: 'اعتماد التصميم من العميل', description: 'مسار نجاح عند الموافقة، ومسار فشل عند طلب تعديل.', assignedRole: 'الإدارة / خدمة العملاء', estimatedMinutes: 15, x: 620, y: 220, successPath: ids.materialCheck, failurePath: ids.designRework }),
    node('designRework', { type: 'rework', title: 'تعديل التصميم', description: 'إعادة تعديل التصميم حسب ملاحظات العميل ثم الرجوع للاعتماد.', assignedRole: 'قسم التصميم', estimatedMinutes: 30, costImpact: 5000, x: 620, y: 420, successPath: ids.approval }),
    node('materialCheck', { type: 'inventory', title: 'فحص توفر المواد', description: 'فحص توفر الأكريلك، الفوم، اللاصق أو أي مواد مطلوبة قبل التشغيل.', assignedRole: 'المخزون', estimatedMinutes: 10, x: 900, y: 220, materialRequirements: defaults.materialRequirements, successPath: ids.operationPack, failurePath: ids.materialDelay }),
    node('materialDelay', { type: 'delay', title: 'انتظار تجهيز المواد', description: 'تأخير العملية إلى حين توفر المواد الناقصة.', assignedRole: 'المخزون / المشتريات', x: 900, y: 420 }),
    node('operationPack', { type: 'operation', title: 'تنفيذ باقة الإنتاج', description: 'تحويل العمل إلى خطوات تشغيلية مرتبطة بالماكينة والمواد.', assignedRole: 'مشرف الورشة', estimatedMinutes: 15, x: 1180, y: 220, linkedOperationPackId: defaults.operationPackId }),
    node('machine', { type: 'machine', title: 'تشغيل ماكينة القص / الطباعة', description: 'تنفيذ العمل على الماكينة المطلوبة حسب نوع الطلب.', assignedRole: 'مشغل الماكينة', estimatedMinutes: 90, costImpact: 15000, x: 1460, y: 220, linkedMachineId: defaults.machineId }),
    node('sop', { type: 'sop', title: 'اتباع SOP التشغيل', description: 'التأكد من تنفيذ خطوات التشغيل حسب الإجراء المعتمد.', assignedRole: 'مشغل الماكينة', estimatedMinutes: 10, x: 1460, y: 420, linkedSopId: defaults.sopId }),
    node('qc', { type: 'qc', title: 'فحص جودة المنتج', description: 'فحص القياسات، النظافة، التشطيب، اللون، ومطابقة طلب العميل.', assignedRole: 'مسؤول الجودة', estimatedMinutes: 20, x: 1740, y: 220, linkedSopId: defaults.sopId, linkedQcTemplateId: defaults.qcTemplateId, qcRequired: true, qcPassPath: ids.finance, qcFailPath: ids.qcRework, qcReworkPath: ids.qcRework }),
    node('qcRework', { type: 'rework', title: 'إعادة عمل بسبب فشل QC', description: 'إصلاح الملاحظات الناتجة من فحص الجودة ثم إعادة الفحص.', assignedRole: 'فريق الورشة', estimatedMinutes: 45, costImpact: 10000, x: 1740, y: 420 }),
    node('finance', { type: 'finance', title: 'تسجيل الكلفة النهائية', description: 'احتساب كلفة المواد والتشغيل وإعادة العمل إن وجدت.', assignedRole: 'الإدارة المالية', estimatedMinutes: 10, x: 2020, y: 220 }),
    node('notification', { type: 'notification', title: 'إشعار العميل بالجاهزية', description: 'إرسال إشعار للعميل بأن العمل جاهز للاستلام أو التسليم.', assignedRole: 'خدمة العملاء', estimatedMinutes: 5, x: 2280, y: 220 }),
    node('delivery', { type: 'archive', title: 'تسليم وأرشفة الطلب', description: 'تسليم المنتج، إغلاق الطلب، وأرشفة تفاصيل العملية.', assignedRole: 'الإدارة / التسليم', estimatedMinutes: 10, x: 2540, y: 220 })
  ];
  const edge = (from, to, label, sourcePort = 'out', type = sourcePort === 'out' ? 'normal' : sourcePort) => ({
    id: makeId('edge'),
    from: ids[from],
    to: ids[to],
    sourcePort,
    targetPort: 'in',
    label,
    type,
    createdAt: now
  });
  const edges = [
    edge('start', 'design', 'بدء'),
    edge('design', 'approval', 'جاهز للاعتماد'),
    edge('approval', 'materialCheck', 'موافق', 'success'),
    edge('approval', 'designRework', 'تعديل مطلوب', 'failure'),
    edge('designRework', 'approval', 'إعادة اعتماد', 'rework'),
    edge('materialCheck', 'operationPack', 'المواد متوفرة', 'success'),
    edge('materialCheck', 'materialDelay', 'مواد ناقصة', 'failure'),
    edge('materialDelay', 'materialCheck', 'إعادة فحص'),
    edge('operationPack', 'machine', 'بدء التنفيذ'),
    edge('machine', 'sop', 'تشغيل'),
    edge('sop', 'qc', 'جاهز للفحص'),
    edge('qc', 'finance', 'ناجح', 'success'),
    edge('qc', 'qcRework', 'فشل الجودة', 'failure'),
    edge('qcRework', 'qc', 'إعادة فحص', 'rework'),
    edge('finance', 'notification', 'تم احتساب الكلفة'),
    edge('notification', 'delivery', 'جاهز للتسليم')
  ];
  return {
    name: 'مثال شامل: طلب إنتاج لوحة واجهة محل',
    description: 'مثال تجريبي يمر بكل مراحل العمل: استلام الطلب، التصميم، الاعتماد، تجهيز المواد، تشغيل الماكينة، فحص الجودة، إعادة العمل عند الفشل، الكلفة، والتسليم.',
    nodes,
    edges,
    defaults
  };
}

async function openComprehensiveWorkflowDemoModal() {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const html = `
    <div class="workflow-demo-modal">
      <p>هذا المثال سيضيف عملية إنتاج كاملة لاختبار كل إمكانيات المصمم. هل تريد إضافته للعملية الحالية أو استبدال العملية الحالية؟</p>
      <label>طريقة التحميل</label>
      <select id="workflowDemoMode" class="form-input">
        <option value="append">إضافة إلى الحالية</option>
        <option value="replace">استبدال الحالية</option>
      </select>
    </div>`;
  const result = await showOmniModal('مثال فحص شامل', html, body => ({ mode: body.querySelector('#workflowDemoMode')?.value || 'append' }));
  if (result?.mode) loadComprehensiveWorkflowDemo(result.mode);
}

async function loadComprehensiveWorkflowDemo(mode = 'append') {
  ensureOmni();
  mode = mode === 'replace' ? 'replace' : 'append';
  const hasWorkflow = (omni.workflow.nodes || []).length || (omni.workflow.edges || []).length;
  if (mode === 'replace' && hasWorkflow) {
    const ok = await showOmniModal('تأكيد استبدال العملية', '<p>سيتم استبدال خطوات وروابط العملية الحالية بمثال الفحص الشامل. لن يتم لمس أي صفحات أو بيانات أخرى. هل تريد المتابعة؟</p>', () => true);
    if (!ok) return;
  }
  pushWorkflowUndoSnapshot('comprehensive_demo');
  const demo = buildComprehensiveWorkflowDemo();
  if (mode === 'append' && hasWorkflow) {
    const maxX = Math.max(...(omni.workflow.nodes || []).map(n => Number(n.x) || 0));
    const offsetX = Math.max(0, maxX + 320 - 100);
    demo.nodes.forEach(node => { node.x += offsetX; });
  }
  if (mode === 'replace') {
    omni.workflow.nodes = demo.nodes;
    omni.workflow.edges = demo.edges;
    omni.workflow.name = demo.name;
    omni.workflow.title = demo.name;
    omni.workflow.description = demo.description;
  } else {
    omni.workflow.nodes.push(...demo.nodes);
    omni.workflow.edges.push(...demo.edges);
  }
  omni.workflow.lastDemoLoadedAt = new Date().toISOString();
  omni.workflow.selectedNodeId = '';
  omni.workflow.selectedEdgeId = '';
  if (typeof normalizeWorkflowNodes === 'function') normalizeWorkflowNodes();
  normalizeWorkflowRelations();
  saveData();
  renderWorkflowStudio();
  if (typeof fitWorkflowToScreen === 'function') setTimeout(fitWorkflowToScreen, 50);
  showToast('تم تحميل مثال الفحص الشامل', 'success');
  showComprehensiveWorkflowDemoLoadedModal(demo);
}

function showComprehensiveWorkflowDemoLoadedModal(demo) {
  const linked = demo.defaults || {};
  const validation = validateWorkflowDeep({ nodes: demo.nodes, edges: demo.edges });
  const html = `
    <div class="workflow-demo-summary">
      <p>تم تحميل مثال الفحص الشامل بنجاح.</p>
      <div class="workflow-demo-summary-grid">
        <span><b>${demo.nodes.length}</b> خطوات</span>
        <span><b>${demo.edges.length}</b> روابط</span>
        <span><b>${validation.errors.length}</b> أخطاء متوقعة</span>
        <span><b>${validation.warnings.length}</b> تحذيرات</span>
      </div>
      <ul>
        <li>SOP: ${linked.sopId ? 'مرتبط' : 'غير مرتبط - سيظهر كتحذير'}</li>
        <li>ماكينة: ${linked.machineId ? 'مرتبطة' : 'غير مرتبطة - سيظهر كتحذير'}</li>
        <li>مواد: ${(linked.materialRequirements || []).some(req => req.materialId) ? 'مرتبطة جزئياً' : 'غير مرتبطة - سيظهر كتحذير'}</li>
        <li>باقة عمليات: ${linked.operationPackId ? 'مرتبطة' : 'غير مرتبطة'}</li>
        <li>قالب QC: ${linked.qcTemplateId ? 'مرتبط' : 'غير مرتبط'}</li>
      </ul>
      <div class="workflow-demo-actions">
        <button class="btn-primary" onclick="runWorkflowSimulation()"><i class="fa-solid fa-vial"></i> اختبار وفحص العملية</button>
        <button class="btn-secondary" onclick="publishWorkflow()"><i class="fa-solid fa-check-circle"></i> نشر بعد الفحص</button>
      </div>
    </div>`;
  showOmniModal('تم تحميل مثال الفحص الشامل', html, () => true);
}

// getWorkflowTemplates() moved to modules/data-providers.js (GO 16 de-monolith Phase 1)

async function openWorkflowTemplates() {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const templates = getWorkflowTemplates();
  const html = `
    <label>القالب</label>
    <select id="workflowTemplateId" class="form-input">${templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select>
    <label>طريقة التطبيق</label>
    <select id="workflowTemplateMode" class="form-input">
      <option value="append">إضافة إلى العملية الحالية</option>
      <option value="replace">استبدال العملية الحالية</option>
    </select>`;
  const result = await showOmniModal('قوالب جاهزة', html, body => ({ templateId: body.querySelector('#workflowTemplateId')?.value, mode: body.querySelector('#workflowTemplateMode')?.value || 'append' }));
  if (result?.templateId) applyWorkflowTemplate(result.templateId, result.mode);
}

async function applyWorkflowTemplate(templateId, mode = 'append') {
  ensureOmni();
  const template = getWorkflowTemplates().find(t => t.id === templateId);
  if (!template) return;
  if (template.builder === buildComprehensiveWorkflowDemo) return loadComprehensiveWorkflowDemo(mode);
  if ((omni.workflow.nodes || []).length && mode === 'replace') {
    const ok = await showOmniModal('استبدال العملية', '<p>سيتم استبدال العملية الحالية بالقالب المختار. هل تريد المتابعة؟</p>', () => true);
    if (!ok) return;
  }
  pushWorkflowUndoSnapshot('template');
  const baseX = mode === 'append' && (omni.workflow.nodes || []).length ? Math.max(...omni.workflow.nodes.map(n => Number(n.x) || 0)) + 300 : 80;
  const baseY = mode === 'append' ? 120 : 180;
  const nodes = template.nodes.map((item, idx) => ({
    id: makeId('wf'), type: item[0], title: item[1], x: baseX + idx * 260, y: baseY,
    description: 'خطوة من قالب جاهز', linkedSopId: '', linkedMachineId: '', linkedOperationPackId: '',
    linkedCardId: '', linkedTaskId: '', linkedQcRecordId: '', orderId: '', department: '', branch: '',
    materialRequirements: [], assignedRole: '', estimatedMinutes: item[0] === 'machine' || item[0] === 'operation' ? 45 : 15,
    costImpact: 0, successPath: '', failurePath: '', activityLog: [{ date: new Date().toISOString(), text: 'تمت الإضافة من قالب جاهز' }]
  }));
  const edges = nodes.slice(0, -1).map((node, idx) => ({ id: makeId('edge'), from: node.id, to: nodes[idx + 1].id, sourcePort: 'out', targetPort: 'in', type: 'normal', label: 'التالي', createdAt: new Date().toISOString() }));
  if (mode === 'replace') {
    omni.workflow.nodes = nodes;
    omni.workflow.edges = edges;
  } else {
    omni.workflow.nodes.push(...nodes);
    omni.workflow.edges.push(...edges);
  }
  saveData();
  renderWorkflowStudio();
  fitWorkflowToScreen();
  showToast('تم تطبيق القالب الجاهز', 'success');
}

// ─── Version History & Rollback System ───
function openWorkflowVersionHistoryModal() {
  ensureOmni();
  if (!Array.isArray(omni.workflowHistory)) omni.workflowHistory = [];

  let historyRowsHtml = '';
  if (omni.workflowHistory.length === 0) {
    historyRowsHtml = `<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--text-muted);">لا يوجد سجل إصدارات منشور بعد</td></tr>`;
  } else {
    const sortedHistory = [...omni.workflowHistory].sort((a,b) => b.version - a.version);
    historyRowsHtml = sortedHistory.map(h => {
      const dateStr = new Date(h.publishedAt).toLocaleString('en-GB');
      return `
        <tr>
          <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.1);"><b>إصدار ${h.version}</b> ${h.version === omni.workflow.version && omni.workflow.status === 'published' ? '<span style="background:#10b981; color:#fff; padding:2px 6px; font-size:11px; margin-right:6px; border-radius:4px; display:inline-block;">نشط حالياً</span>' : ''}</td>
          <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.1);"><small>${dateStr}</small></td>
          <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:12px;">${h.nodes.length} خطوات · dots روابط</td>
          <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.1); text-align:left; display:flex; gap:6px; justify-content:flex-end;">
            <button class="btn-xs btn-primary" style="padding:4px 8px; font-size:11px;" onclick="previewWorkflowHistoryVersion(${h.version})"><i class="fa-solid fa-eye"></i> معاينة</button>
            <button class="btn-xs btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="rollbackWorkflowToVersion(${h.version})"><i class="fa-solid fa-rotate-left"></i> استعادة</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const contentHtml = `
    <div style="padding: 16px; direction: rtl; text-align: right;">
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">عند نشر سير عمل، يتم حفظ نسخة غير قابلة للتعديل تلقائياً. يمكنك استعادة أي نسخة سابقة للعودة إليها كمسودة نشطة.</p>
      <div style="max-height: 350px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;">
        <table style="width:100%; border-collapse:collapse; text-align:right; font-size:13px;">
          <thead>
            <tr style="background: rgba(255,255,255,0.05);">
              <th style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.15); text-align:right;">الإصدار</th>
              <th style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.15); text-align:right;">تاريخ النشر</th>
              <th style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.15); text-align:right;">العناصر</th>
              <th style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.15); text-align:left;">التحكم</th>
            </tr>
          </thead>
          <tbody>
            ${historyRowsHtml}
          </tbody>
        </table>
      </div>
      <div class="insp-actions" style="margin-top:20px; display:flex; justify-content:flex-end;">
        <button class="btn-secondary" onclick="closeInspector()">إغلاق</button>
      </div>
    </div>
  `;

  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');

  if (panel && body) {
    title.textContent = 'سجل الإصدارات والنسخ الاحتياطية';
    tabs.innerHTML = '';
    body.innerHTML = contentHtml;
    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
}

async function rollbackWorkflowToVersion(versionNum) {
  ensureOmni();
  const historyItem = (omni.workflowHistory || []).find(h => h.version === versionNum);
  if (!historyItem) return showToast('الإصدار غير موجود', 'error');

  const ok = await showOmniModal('تأكيد استعادة النسخة', `<p>هل أنت متأكد من استعادة النسخة رقم ${versionNum}؟ سيتم استبدال المسودة الحالية.</p>`, () => true);
  if (!ok) return;

  omni.workflow.nodes = JSON.parse(JSON.stringify(historyItem.nodes || []));
  omni.workflow.edges = JSON.parse(JSON.stringify(historyItem.edges || []));
  omni.workflow.status = 'draft';
  omni.workflow.published = false;

  recordAuditEvent({
    event_type: 'WORKFLOW_ROLLBACK',
    record_id: 'workflow',
    data: { note: `تم استعادة نسخة سير العمل إلى الإصدار ${versionNum}` },
    source: 'مصمم العمليات'
  });

  saveData();
  showToast(`تمت استعادة الإصدار ${versionNum} كمسودة بنجاح!`, 'success');
  closeInspector();
  renderWorkflowStudio();
}

function previewWorkflowHistoryVersion(versionNum) {
  ensureOmni();
  const historyItem = (omni.workflowHistory || []).find(h => h.version === versionNum);
  if (!historyItem) return showToast('الإصدار غير موجود', 'error');

  const preview = buildWorkflowExecutionPreview(historyItem);
  const resultHtml = renderWorkflowExecutionPreview(preview);

  showOmniModal(`معاينة الإصدار ${versionNum}`, `
    <div style="padding: 16px; direction: rtl; text-align: right;">
      <h3 style="margin-top:0; color:var(--primary); margin-bottom:8px;"><i class="fa-solid fa-eye"></i> معاينة الإصدار المنشور رقم ${versionNum}</h3>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:20px;">تاريخ النشر: ${new Date(historyItem.publishedAt).toLocaleString('en-GB')}</p>
      ${resultHtml}
    </div>
  `, () => true);
}

async function unpublishWorkflow() {
  ensureOmni();
  const ok = await showOmniModal('إلغاء النشر', '<p>هل أنت متأكد من إلغاء نشر العملية وإعادتها لحالة المسودة؟ سيمكنك تعديلها مجدداً.</p>', () => true);
  if (!ok) return;

  omni.workflow.status = 'draft';
  omni.workflow.published = false;

  recordAuditEvent({
    event_type: 'WORKFLOW_UNPUBLISH',
    record_id: 'workflow',
    data: { note: 'تم إلغاء نشر سير العمل وإعادته كمسودة للتعديل عليها' },
    source: 'مصمم العمليات'
  });

  saveData();
  showToast('تم إلغاء النشر بنجاح وإعادة العملية إلى مسودة.', 'info');
  renderWorkflowStudio();
}

function generateTemplateWorkflow() {
  applyWorkflowTemplate('general_order', 'replace');
}
