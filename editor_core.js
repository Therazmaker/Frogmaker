const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const TIMELINE_FRAME_WIDTH = 18;
const COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#D4537E', '#BA7517', '#639922', '#7F77DD', '#E24B4A', '#0F6E56', '#993C1D'];
const MESH_THEME = {
  contourStroke: 'rgba(0, 235, 255, 0.95)',
  contourPreviewStroke: 'rgba(0, 235, 255, 0.88)',
  contourPreviewFill: 'rgba(0, 235, 255, 0.10)',
  internalStroke: 'rgba(236, 244, 248, 0.55)',
  normalVertexFill: '#27dbe5',
  normalVertexStroke: 'rgba(255,255,255,0.92)',
  selectedVertexFill: '#ffbf47',
  selectedVertexStroke: '#fff4d1',
  softVertexFill: 'rgba(120,220,255,0.65)',
  pinStroke: 'rgba(255,209,90,0.30)',
  selectedPinStroke: 'rgba(255,124,98,0.70)',
  pinFill: '#ffd15a',
  selectedPinFill: '#ff7c62',
  pinRadiusFill: 'rgba(255,209,90,0.18)',
  manualContourPointFill: '#00ebff',
  manualInteriorPointFill: '#ffbf47',
  manualStartPointFill: '#ff7c62',
  manualPointStroke: 'rgba(18,28,35,0.9)'
};
let bones = [
  { id: 0, name: 'root', parent: null, x: 500, y: 500, ex: 500, ey: 420, orig_x: 500, orig_y: 500, orig_ex: 500, orig_ey: 420, color: '#888780' }
];
let nextId = 1;
let selectedId = 0;
let selectedLayerIndex = null;
let activeTool = 'bone';
let psdLayers = [];
let sceneWidth = 1000;
let sceneHeight = 1000;
let layers = { bones: true, names: true, images: true, grid: false };
let view = { x: 0, y: 0, scale: 1 };
let dragging = false;
let dragStart = null;
let dragPreview = null;
let movingBone = null;
let movingHandle = null;
let movingLayer = null;
let movingGizmo = null;
let dragLastAngle = 0;
let panning = false;
let panStart = null;
let draggingTimelineKey = null;
let nextLayerUid = 1;
let pinDragState = null;
let meshPinDragState = null;
let meshSelectionBox = null;
let undoStack = [];
let isRestoringHistory = false;
let videoReferenceElement = null;
let videoReferenceFrameElement = null;
let videoReferenceObjectUrl = null;
let motionCanvas = null;
let motionCtx = null;
let motionDragging = false;
let motionDragStart = null;
let motionDragPreview = null;
let motionMovingBone = null;
let motionMovingHandle = null;
let motionDragLastAngle = 0;
let motionView = { x: 0, y: 0, scale: 1 };
let weightBrushPainting = false;
let weightBrushWorld = null;
let weightBrushWarnedMissingWeights = false;
let weightBrushStrokeChanged = false;
let stitchBrushPainting = false;
let stitchBrushWorld = null;
let stitchBrushStrokeChanged = false;
let cameraDragState = null;
let layerDndState = { sourceType: null, sourceIndex: null, sourceGroupPath: null };
let _dndCurrentEl = null;


let cameraMiniGizmo = {
  visible: false,
  anchorType: null,
  anchorId: null,
  dragging: false,
  dragOffsetWorld: null
};
let secondaryMotionRuntime = {
  chainStates: {},
  lastTimestampMs: 0,
  lastRenderMs: 0
};

const projectState = {
  editorMode: 'rig',
  bindPose: { bones: {}, slots: {} },
  animations: [],
  playback: {
    currentAnimationId: null,
    currentFrame: 0,
    isPlaying: false,
    lastTickMs: 0,
    autoKey: true
  },
  timeline: {
    selectedType: 'bone',
    selectedTargetId: 0,
    selectedFrame: null,
    selectedFrames: [],
    clipboard: null
  },
  meshEditor: {
    selectedVertexIds: [],
    selectedPinId: null,
    manualMode: false,
    manualLayerUid: null,
    manualContourPoints: [],
    manualInteriorPoints: [],
    manualStage: 'contour',
    addVertexMode: false,
    mode: 'select',
    softSelectionEnabled: true,
    softSelectionRadius: 90,
    softSelectionStrength: 0.65,
    generationPreset: 'medium'
  },
  videoReference: {
    dataUrl: null,
    name: '',
    enabled: false,
    showInMain: false,
    opacity: 0.45,
    width: 0,
    height: 0,
    durationSeconds: 0,
    frameRate: 24,
    frames: [],
    currentTime: 0
  },
  heatmap: {
    enabled: false,
    mode: 'dominant',
    selectedBoneId: null,
    opacity: 0.65
  },
  weightBrush: {
    active: false,
    targetBoneId: null,
    radius: 60,
    strength: 0.08,
    mode: 'add',
    falloff: 'linear'
  },
  stitchBrush: {
    active: false,
    sourceLayerUid: null,
    targetLayerUid: null,
    radius: 50,
    strength: 1.0,
    mode: 'weld',
    falloff: 'linear',
    smoothRadius: 35
  },
  meshStitches: [],
  ikConstraints: [],
  drivenConstraints: [],
  secondaryMotion: {
    enabled: true,
    autoBakeOnExport: true,
    maxActiveBones: 24,
    chains: []
  },
  switchDefaults: {},
  layerTree: {
    collapsedGroups: {},
    soloGroup: null
  },
  camera: {
    enabled: true,
    x: sceneWidth / 2,
    y: sceneHeight / 2,
    zoom: 1,
    width: 1920,
    height: 1080,
    showFrame: true
  },
  onionSkin: {
    enabled: false,
    before: 2,
    after: 2,
    step: 1,
    opacity: 0.28,
    tint: true
  },
  lipsync: {
    group: '',
    autoAdvance: true,
    advanceFrames: 2
  }
};

const SECONDARY_MOTION_PRESETS = {
  cabello: { stiffness: 16, damping: 9, drag: 0.18, gravity: 10, gravityAngle: 90, maxAngle: 42, iterations: 1 },
  trenza: { stiffness: 12, damping: 8, drag: 0.22, gravity: 14, gravityAngle: 90, maxAngle: 56, iterations: 2 },
  falda: { stiffness: 10, damping: 7, drag: 0.2, gravity: 18, gravityAngle: 90, maxAngle: 48, iterations: 2 },
  tela: { stiffness: 8, damping: 6, drag: 0.24, gravity: 16, gravityAngle: 90, maxAngle: 62, iterations: 2 }
};

const FrogmakerModules = window.FrogmakerModules = window.FrogmakerModules || {};
const frogmakerRuntime = FrogmakerModules.runtime = FrogmakerModules.runtime || {};
const frogmakerProfiler = () => FrogmakerModules.ui && FrogmakerModules.ui.profiler;
Object.defineProperties(frogmakerRuntime, {
  canvas: { get: () => canvas },
  ctx: { get: () => ctx },
  sceneWidth: { get: () => sceneWidth, set: value => { sceneWidth = value; } },
  sceneHeight: { get: () => sceneHeight, set: value => { sceneHeight = value; } },
  nextId: { get: () => nextId, set: value => { nextId = value; } },
  nextLayerUid: { get: () => nextLayerUid, set: value => { nextLayerUid = value; } },
  selectedId: { get: () => selectedId, set: value => { selectedId = value; } },
  selectedLayerIndex: { get: () => selectedLayerIndex, set: value => { selectedLayerIndex = value; } },
  activeTool: { get: () => activeTool, set: value => { activeTool = value; } },
  layers: { get: () => layers, set: value => { layers = value; } },
  view: { get: () => view, set: value => { view = value; } },
  bones: { get: () => bones, set: value => { bones = value; } },
  psdLayers: { get: () => psdLayers, set: value => { psdLayers = value; } },
  undoStack: { get: () => undoStack, set: value => { undoStack = value; } },
  isRestoringHistory: { get: () => isRestoringHistory, set: value => { isRestoringHistory = value; } },
  projectState: { get: () => projectState },
  videoReferenceObjectUrl: { get: () => videoReferenceObjectUrl, set: value => { videoReferenceObjectUrl = value; } }
});

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function sortNumeric(a, b) { return a - b; }
function clampAngleAround(target, angle, maxDelta) {
  const delta = normalizeAngleDeg(angle - target);
  return normalizeAngleDeg(target + clamp(delta, -Math.abs(maxDelta || 0), Math.abs(maxDelta || 0)));
}
function getBoneById(id) { return bones.find(b => b.id === id) || null; }
function getLayerByIndex(index) { return psdLayers[index] || null; }
function getLayerByUid(uid) { return psdLayers.find(layer => layer.uid === uid) || null; }
function getBoneLength(bone) { return Math.hypot(bone.ex - bone.x, bone.ey - bone.y); }
function getBoneRotationDeg(bone) { return Math.atan2(bone.ey - bone.y, bone.ex - bone.x) * 180 / Math.PI; }

function ensureSecondaryMotionState() {
  const state = projectState.secondaryMotion || {};
  if (!Array.isArray(state.chains)) state.chains = [];
  state.enabled = state.enabled !== false;
  state.autoBakeOnExport = state.autoBakeOnExport !== false;
  state.maxActiveBones = clamp(Math.round(state.maxActiveBones || 24), 1, 96);
  state.chains = state.chains.map(chain => {
    const preset = String(chain && chain.preset || 'cabello').trim().toLowerCase();
    const defaults = SECONDARY_MOTION_PRESETS[preset] || SECONDARY_MOTION_PRESETS.cabello;
    return Object.assign({
      id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: 'Fisica secundaria',
      enabled: true,
      preset,
      rootBoneId: null,
      boneIds: [],
      stiffness: defaults.stiffness,
      damping: defaults.damping,
      drag: defaults.drag,
      gravity: defaults.gravity,
      gravityAngle: defaults.gravityAngle,
      maxAngle: defaults.maxAngle,
      iterations: defaults.iterations,
      enabledInRig: true,
      enabledInPlayback: true
    }, chain || {});
  });
  projectState.secondaryMotion = state;
  return state;
}

function resetSecondaryMotionState(_reason = 'manual') {
  secondaryMotionRuntime = {
    chainStates: {},
    lastTimestampMs: 0,
    lastRenderMs: 0
  };
}
function getColor(depth) { return COLORS[depth % COLORS.length]; }

function ensureProjectCamera() {
  if (!projectState.camera) projectState.camera = {};
  projectState.camera = Object.assign({
    enabled: true,
    x: sceneWidth / 2,
    y: sceneHeight / 2,
    zoom: 1,
    width: 1920,
    height: 1080,
    showFrame: true
  }, projectState.camera);
  projectState.camera.x = Number.isFinite(+projectState.camera.x) ? +projectState.camera.x : sceneWidth / 2;
  projectState.camera.y = Number.isFinite(+projectState.camera.y) ? +projectState.camera.y : sceneHeight / 2;
  projectState.camera.zoom = clamp(+projectState.camera.zoom || 1, 0.05, 20);
  projectState.camera.width = Math.max(1, Math.round(+projectState.camera.width || 1920));
  projectState.camera.height = Math.max(1, Math.round(+projectState.camera.height || 1080));
  projectState.camera.enabled = projectState.camera.enabled !== false;
  projectState.camera.showFrame = projectState.camera.showFrame !== false;
  return projectState.camera;
}

function ensureOnionSkin() {
  if (!projectState.onionSkin) projectState.onionSkin = {};
  projectState.onionSkin = Object.assign({
    enabled: false,
    before: 2,
    after: 2,
    step: 1,
    opacity: 0.28,
    tint: true
  }, projectState.onionSkin);
  projectState.onionSkin.before = clamp(Math.round(+projectState.onionSkin.before || 0), 0, 8);
  projectState.onionSkin.after = clamp(Math.round(+projectState.onionSkin.after || 0), 0, 8);
  projectState.onionSkin.step = clamp(Math.round(+projectState.onionSkin.step || 1), 1, 12);
  projectState.onionSkin.opacity = clamp(+projectState.onionSkin.opacity || 0.28, 0.02, 0.85);
  projectState.onionSkin.enabled = !!projectState.onionSkin.enabled;
  projectState.onionSkin.tint = projectState.onionSkin.tint !== false;
  return projectState.onionSkin;
}

function ensureLipsyncState() {
  if (!projectState.lipsync) projectState.lipsync = {};
  projectState.lipsync = Object.assign({
    group: '',
    autoAdvance: true,
    advanceFrames: 2
  }, projectState.lipsync);
  projectState.lipsync.group = String(projectState.lipsync.group || '').trim();
  projectState.lipsync.autoAdvance = projectState.lipsync.autoAdvance !== false;
  projectState.lipsync.advanceFrames = clamp(Math.round(+projectState.lipsync.advanceFrames || 2), 1, 12);
  return projectState.lipsync;
}

function ensureMeshEditorState() {
  if (!projectState.meshEditor) projectState.meshEditor = {};
  projectState.meshEditor = Object.assign({
    selectedVertexIds: [],
    selectedPinId: null,
    manualMode: false,
    manualLayerUid: null,
    manualContourPoints: [],
    manualInteriorPoints: [],
    manualStage: 'contour',
    addVertexMode: false,
    mode: 'select',
    softSelectionEnabled: true,
    softSelectionRadius: 90,
    softSelectionStrength: 0.65,
    generationPreset: 'medium'
  }, projectState.meshEditor);
  if (!['select', 'move', 'pin', 'addVertex', 'createPin'].includes(projectState.meshEditor.mode)) {
    projectState.meshEditor.mode = 'select';
  }
  projectState.meshEditor.selectedVertexIds = Array.isArray(projectState.meshEditor.selectedVertexIds)
    ? [...new Set(projectState.meshEditor.selectedVertexIds.map(id => Math.max(0, Math.round(+id || 0))))]
    : [];
  projectState.meshEditor.selectedPinId = projectState.meshEditor.selectedPinId || null;
  projectState.meshEditor.manualMode = !!projectState.meshEditor.manualMode;
  projectState.meshEditor.manualLayerUid = projectState.meshEditor.manualLayerUid || null;
  const legacyManualPoints = Array.isArray(projectState.meshEditor.manualPoints) ? projectState.meshEditor.manualPoints : [];
  projectState.meshEditor.manualContourPoints = Array.isArray(projectState.meshEditor.manualContourPoints)
    ? projectState.meshEditor.manualContourPoints
    : legacyManualPoints;
  projectState.meshEditor.manualInteriorPoints = Array.isArray(projectState.meshEditor.manualInteriorPoints)
    ? projectState.meshEditor.manualInteriorPoints
    : [];
  projectState.meshEditor.manualStage = projectState.meshEditor.manualStage === 'interior' ? 'interior' : 'contour';
  delete projectState.meshEditor.manualPoints;
  projectState.meshEditor.addVertexMode = !!projectState.meshEditor.addVertexMode;
  projectState.meshEditor.softSelectionEnabled = projectState.meshEditor.softSelectionEnabled !== false;
  projectState.meshEditor.softSelectionRadius = clamp(+projectState.meshEditor.softSelectionRadius || 90, 10, 400);
  projectState.meshEditor.softSelectionStrength = clamp(+projectState.meshEditor.softSelectionStrength || 0.65, 0, 1);
  if (!['low', 'medium', 'high'].includes(projectState.meshEditor.generationPreset)) {
    projectState.meshEditor.generationPreset = 'medium';
  }
  return projectState.meshEditor;
}

function toggleOnionSkin(enabled) {
  const onion = ensureOnionSkin();
  onion.enabled = !!enabled;
  render();
  pushUndoSnapshot();
}

function setOnionSkinNumber(prop, value) {
  const onion = ensureOnionSkin();
  if (prop === 'before' || prop === 'after') onion[prop] = clamp(Math.round(+value || 0), 0, 8);
  if (prop === 'step') onion.step = clamp(Math.round(+value || 1), 1, 12);
  render();
  pushUndoSnapshot();
}

function setOnionSkinOpacity(value) {
  const onion = ensureOnionSkin();
  onion.opacity = clamp((+value || 0) / 100, 0.02, 0.85);
  render();
  pushUndoSnapshot();
}

function toggleOnionSkinTint(enabled) {
  const onion = ensureOnionSkin();
  onion.tint = !!enabled;
  render();
  pushUndoSnapshot();
}

function getBoneDepth(bone) {
  let depth = 0;
  let current = bone;
  while (current && current.parent !== null) {
    current = getBoneById(current.parent);
    if (!current) break;
    depth++;
  }
  return depth;
}

function normalizeAngleDeg(value) {
  let angle = value;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

function rotatePoint(px, py, cx, cy, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: cos * (px - cx) - sin * (py - cy) + cx,
    y: sin * (px - cx) + cos * (py - cy) + cy
  };
}

function localPointToWorld(localX, localY, parentX, parentY, parentRotationDeg) {
  const angle = parentRotationDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: parentX + localX * cos - localY * sin,
    y: parentY + localX * sin + localY * cos
  };
}

function toWorld(cx, cy) { return { x: (cx - view.x) / view.scale, y: (cy - view.y) / view.scale }; }
function toLocalFromLayer(layer, worldX, worldY) {
  const dx = worldX - layer.center_x;
  const dy = worldY - layer.center_y;
  const cos = Math.cos(-(layer.rotation || 0));
  const sin = Math.sin(-(layer.rotation || 0));
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function ensureLayerIdentity(layer) {
  if (!layer.uid) layer.uid = `layer_${nextLayerUid++}`;
  if (!layer.role) layer.role = 'controller';
  if (!layer.meshPins) layer.meshPins = [];
  if (layer.switchGroup === undefined || layer.switchGroup === null) layer.switchGroup = '';
  if (layer.switchKey === undefined || layer.switchKey === null) layer.switchKey = '';
  if (layer.uiGroup === undefined || layer.uiGroup === null) layer.uiGroup = '';
  layer.uiGroup = normalizeLayerUiGroup(layer.uiGroup);
  return layer;
}

function normalizeLayerUiGroup(value) {
  return String(value || '')
    .split('/')
    .map(segment => String(segment || '').trim())
    .filter(Boolean)
    .join('/');
}

function getLayerUiGroup(layer) {
  return normalizeLayerUiGroup(layer && layer.uiGroup ? layer.uiGroup : '');
}

function getLayerUiGroupSegments(layer) {
  const group = getLayerUiGroup(layer);
  return group ? group.split('/') : [];
}

function ensureLayerTreeState() {
  if (!projectState.layerTree) projectState.layerTree = {};
  if (!projectState.layerTree.collapsedGroups) projectState.layerTree.collapsedGroups = {};
  if (projectState.layerTree.soloGroup === undefined) projectState.layerTree.soloGroup = null;
  return projectState.layerTree;
}

function ensureIkConstraints() {
  if (!Array.isArray(projectState.ikConstraints)) projectState.ikConstraints = [];
  projectState.ikConstraints = projectState.ikConstraints.map(constraint => Object.assign({
    id: `ik_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    rootBoneId: null,
    midBoneId: null,
    endBoneId: null,
    targetBoneId: null,
    targetLayerUid: null,
    bendDirection: 1,
    enabled: true,
    mix: 1
  }, constraint || {}));
  return projectState.ikConstraints;
}

function getIkConstraintById(id) {
  return ensureIkConstraints().find(item => item.id === id) || null;
}

function getIkConstraintForBoneId(boneId) {
  return ensureIkConstraints().find(item =>
    item.rootBoneId === boneId ||
    item.midBoneId === boneId ||
    item.endBoneId === boneId ||
    item.targetBoneId === boneId
  ) || null;
}

function getIkConstraintsForTargetBone(targetBoneId) {
  return ensureIkConstraints().filter(item => item.targetBoneId === targetBoneId);
}

function ensureDrivenConstraints() {
  if (!Array.isArray(projectState.drivenConstraints)) projectState.drivenConstraints = [];
  projectState.drivenConstraints = projectState.drivenConstraints.map(constraint => Object.assign({
    id: `driven_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    driverType: 'bone',
    driverId: null,
    driverLayerUid: null,
    drivenType: 'bone',
    drivenId: null,
    drivenLayerUid: null,
    channel: 'rotation',
    factor: -1,
    offset: 0,
    restDriverRotation: 0,
    restDrivenRotation: 0
  }, constraint || {}));
  return projectState.drivenConstraints;
}

function getDrivenConstraintById(id) {
  return ensureDrivenConstraints().find(item => item.id === id) || null;
}

function getDrivenConstraintNodeKey(type, value) {
  if (type === 'bone' && value !== null && value !== undefined) return `bone:${value}`;
  if (type === 'layer' && value) return `layer:${value}`;
  return null;
}

function getDrivenConstraintSubjectKey(constraint, side) {
  if (!constraint) return null;
  if (side === 'driver') {
    return constraint.driverType === 'layer'
      ? getDrivenConstraintNodeKey('layer', constraint.driverLayerUid)
      : getDrivenConstraintNodeKey('bone', constraint.driverId);
  }
  return constraint.drivenType === 'layer'
    ? getDrivenConstraintNodeKey('layer', constraint.drivenLayerUid)
    : getDrivenConstraintNodeKey('bone', constraint.drivenId);
}

function getDrivenConstraintLabel(type, value) {
  if (type === 'bone') {
    const bone = getBoneById(value);
    return bone ? bone.name : '(bone faltante)';
  }
  if (type === 'layer') {
    const layer = getLayerByUid(value);
    return layer ? layer.name : '(capa faltante)';
  }
  return '(sin objetivo)';
}

function getDrivenConstraintsForSubject(type, value) {
  const key = getDrivenConstraintNodeKey(type, value);
  if (!key) return [];
  return ensureDrivenConstraints().filter(item =>
    getDrivenConstraintSubjectKey(item, 'driver') === key ||
    getDrivenConstraintSubjectKey(item, 'driven') === key
  );
}

function getDrivenConstraintDriverRotationDeg(constraint) {
  if (!constraint) return null;
  if (constraint.driverType === 'bone') {
    const bone = getBoneById(constraint.driverId);
    return bone ? getBoneRotationDeg(bone) : null;
  }
  const layer = getLayerByUid(constraint.driverLayerUid);
  return layer ? (layer.rotation || 0) * 180 / Math.PI : null;
}

function getDrivenConstraintDrivenRotationDeg(constraint) {
  if (!constraint) return null;
  if (constraint.drivenType === 'bone') {
    const bone = getBoneById(constraint.drivenId);
    return bone ? getBoneRotationDeg(bone) : null;
  }
  const layer = getLayerByUid(constraint.drivenLayerUid);
  return layer ? (layer.rotation || 0) * 180 / Math.PI : null;
}

function captureDrivenConstraintRestPose(constraint, options = {}) {
  if (!constraint) return false;
  const driverRotation = getDrivenConstraintDriverRotationDeg(constraint);
  const drivenRotation = getDrivenConstraintDrivenRotationDeg(constraint);
  if (!Number.isFinite(driverRotation) || !Number.isFinite(drivenRotation)) return false;
  const preserveDrivenRotation = options.preserveDrivenRotation !== false;
  const factor = Number.isFinite(+constraint.factor) ? +constraint.factor : -1;
  const offset = Number.isFinite(+constraint.offset) ? +constraint.offset : 0;
  const previousRestDriver = Number.isFinite(+constraint.restDriverRotation) ? +constraint.restDriverRotation : driverRotation;
  const previousRestDriven = Number.isFinite(+constraint.restDrivenRotation) ? +constraint.restDrivenRotation : drivenRotation;
  constraint.restDriverRotation = driverRotation;
  if (preserveDrivenRotation) {
    constraint.restDrivenRotation = drivenRotation - (driverRotation - constraint.restDriverRotation) * factor - offset;
  } else {
    constraint.restDrivenRotation = previousRestDriven + (driverRotation - previousRestDriver) * factor;
  }
  return true;
}

function recalibrateDrivenConstraintOffset(constraint) {
  if (!constraint) return false;
  const driverRotation = getDrivenConstraintDriverRotationDeg(constraint);
  const drivenRotation = getDrivenConstraintDrivenRotationDeg(constraint);
  if (!Number.isFinite(driverRotation) || !Number.isFinite(drivenRotation)) return false;
  const factor = Number.isFinite(+constraint.factor) ? +constraint.factor : -1;
  const restDriverRotation = Number.isFinite(+constraint.restDriverRotation) ? +constraint.restDriverRotation : driverRotation;
  const restDrivenRotation = Number.isFinite(+constraint.restDrivenRotation) ? +constraint.restDrivenRotation : drivenRotation;
  constraint.offset = normalizeAngleDeg(drivenRotation - (restDrivenRotation + (driverRotation - restDriverRotation) * factor));
  return true;
}

function recalibrateDrivenConstraintsForSubject(type, value) {
  const subjectKey = getDrivenConstraintNodeKey(type, value);
  if (!subjectKey) return false;
  let changed = false;
  ensureDrivenConstraints().forEach(constraint => {
    if (!constraint || constraint.enabled === false) return;
    if (getDrivenConstraintSubjectKey(constraint, 'driven') !== subjectKey) return;
    changed = recalibrateDrivenConstraintOffset(constraint) || changed;
  });
  return changed;
}

function hasDrivenConstraintCycle(constraint, overrideDriverKey = null, overrideDrivenKey = null) {
  const driverKey = overrideDriverKey || getDrivenConstraintSubjectKey(constraint, 'driver');
  const drivenKey = overrideDrivenKey || getDrivenConstraintSubjectKey(constraint, 'driven');
  if (!driverKey || !drivenKey || driverKey === drivenKey) return true;
  const adjacency = new Map();
  ensureDrivenConstraints().forEach(item => {
    if (!item || item.id === constraint.id || item.enabled === false) return;
    const source = getDrivenConstraintSubjectKey(item, 'driver');
    const target = getDrivenConstraintSubjectKey(item, 'driven');
    if (!source || !target || source === target) return;
    if (!adjacency.has(source)) adjacency.set(source, new Set());
    adjacency.get(source).add(target);
  });
  if (!adjacency.has(driverKey)) adjacency.set(driverKey, new Set());
  adjacency.get(driverKey).add(drivenKey);
  const stack = [drivenKey];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === driverKey) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const next = adjacency.get(current);
    if (!next) continue;
    next.forEach(item => stack.push(item));
  }
  return false;
}

function isValidDrivenConstraint(constraint) {
  if (!constraint || constraint.channel !== 'rotation') return false;
  const driverKey = getDrivenConstraintSubjectKey(constraint, 'driver');
  const drivenKey = getDrivenConstraintSubjectKey(constraint, 'driven');
  if (!driverKey || !drivenKey || driverKey === drivenKey) return false;
  if (constraint.driverType === 'bone' && !getBoneById(constraint.driverId)) return false;
  if (constraint.driverType === 'layer' && !getLayerByUid(constraint.driverLayerUid)) return false;
  if (constraint.drivenType === 'bone' && !getBoneById(constraint.drivenId)) return false;
  if (constraint.drivenType === 'layer' && !getLayerByUid(constraint.drivenLayerUid)) return false;
  if (hasDrivenConstraintCycle(constraint, driverKey, drivenKey)) return false;
  return true;
}

function getDrivenConstraintPhase(constraint) {
  if (!constraint) return 'postLayer';
  return constraint.driverType === 'bone' && constraint.drivenType === 'bone'
    ? 'preLayer'
    : 'postLayer';
}

function applyDrivenRotationToBone(bone, targetRotationDeg) {
  if (!bone) return false;
  const deltaDeg = normalizeAngleDeg(targetRotationDeg - getBoneRotationDeg(bone));
  if (Math.abs(deltaDeg) < 0.0001) return false;
  rotateBoneHierarchy(bone, deltaDeg * Math.PI / 180, bone.x, bone.y);
  return true;
}

function applyDrivenRotationToLayer(layer, targetRotationDeg) {
  if (!layer) return false;
  const targetRadians = targetRotationDeg * Math.PI / 180;
  if (Math.abs((layer.rotation || 0) - targetRadians) < 0.000001) return false;
  layer.rotation = targetRadians;
  return true;
}

function applyDrivenConstraint(constraint, phase = 'all') {
  if (!constraint || constraint.enabled === false) return false;
  const constraintPhase = getDrivenConstraintPhase(constraint);
  if (phase !== 'all' && phase !== constraintPhase) return false;
  if (!isValidDrivenConstraint(constraint)) return false;
  if (constraint.drivenType === 'bone' && movingBone && movingBone.id === constraint.drivenId) return false;
  if (constraint.drivenType === 'bone' && motionMovingBone && motionMovingBone.id === constraint.drivenId) return false;
  if (constraint.drivenType === 'layer' && movingLayer && movingLayer.uid === constraint.drivenLayerUid) return false;
  const driverRotation = getDrivenConstraintDriverRotationDeg(constraint);
  if (!Number.isFinite(driverRotation)) return false;
  const factor = Number.isFinite(+constraint.factor) ? +constraint.factor : -1;
  const offset = Number.isFinite(+constraint.offset) ? +constraint.offset : 0;
  const restDriverRotation = Number.isFinite(+constraint.restDriverRotation) ? +constraint.restDriverRotation : driverRotation;
  const restDrivenRotation = Number.isFinite(+constraint.restDrivenRotation) ? +constraint.restDrivenRotation : getDrivenConstraintDrivenRotationDeg(constraint);
  const targetRotation = normalizeAngleDeg(restDrivenRotation + (driverRotation - restDriverRotation) * factor + offset);
  if (constraint.drivenType === 'bone') {
    return applyDrivenRotationToBone(getBoneById(constraint.drivenId), targetRotation);
  }
  return applyDrivenRotationToLayer(getLayerByUid(constraint.drivenLayerUid), targetRotation);
}

function applyDrivenConstraints(phase = 'all') {
  ensureDrivenConstraints().forEach(constraint => applyDrivenConstraint(constraint, phase));
}

function drawDrivenConstraints(drawCtx) {
  const selectedBoneKey = selectedId !== null ? getDrivenConstraintNodeKey('bone', selectedId) : null;
  const selectedLayer = selectedLayerIndex !== null ? getLayerByIndex(selectedLayerIndex) : null;
  const selectedLayerKey = selectedLayer ? getDrivenConstraintNodeKey('layer', selectedLayer.uid) : null;
  ensureDrivenConstraints().forEach(constraint => {
    const driverKey = getDrivenConstraintSubjectKey(constraint, 'driver');
    const drivenKey = getDrivenConstraintSubjectKey(constraint, 'driven');
    if (!driverKey || !drivenKey) return;
    const relevant = driverKey === selectedBoneKey || drivenKey === selectedBoneKey || driverKey === selectedLayerKey || drivenKey === selectedLayerKey;
    if (!relevant) return;
    const driverPoint = constraint.driverType === 'bone'
      ? getBoneById(constraint.driverId)
      : getLayerByUid(constraint.driverLayerUid);
    const drivenPoint = constraint.drivenType === 'bone'
      ? getBoneById(constraint.drivenId)
      : getLayerByUid(constraint.drivenLayerUid);
    if (!driverPoint || !drivenPoint) return;
    const startX = constraint.driverType === 'bone' ? driverPoint.x : driverPoint.center_x;
    const startY = constraint.driverType === 'bone' ? driverPoint.y : driverPoint.center_y;
    const endX = constraint.drivenType === 'bone' ? drivenPoint.x : drivenPoint.center_x;
    const endY = constraint.drivenType === 'bone' ? drivenPoint.y : drivenPoint.center_y;
    drawCtx.save();
    drawCtx.strokeStyle = isValidDrivenConstraint(constraint)
      ? (constraint.enabled === false ? 'rgba(150,150,150,0.45)' : 'rgba(115,218,255,0.95)')
      : 'rgba(255,120,120,0.85)';
    drawCtx.lineWidth = 1.5 / view.scale;
    drawCtx.setLineDash([5 / view.scale, 4 / view.scale]);
    drawCtx.beginPath();
    drawCtx.moveTo(startX, startY);
    drawCtx.lineTo(endX, endY);
    drawCtx.stroke();
    drawCtx.setLineDash([]);
    drawCtx.beginPath();
    drawCtx.arc(startX, startY, 5 / view.scale, 0, Math.PI * 2);
    drawCtx.fillStyle = 'rgba(115,218,255,0.2)';
    drawCtx.fill();
    drawCtx.beginPath();
    drawCtx.arc(endX, endY, 6 / view.scale, 0, Math.PI * 2);
    drawCtx.fillStyle = 'rgba(115,218,255,0.32)';
    drawCtx.fill();
    drawCtx.restore();
  });
}

function getSecondaryMotionChainById(chainId) {
  return ensureSecondaryMotionState().chains.find(chain => chain.id === chainId) || null;
}

function getSecondaryMotionChainForBoneId(boneId) {
  return ensureSecondaryMotionState().chains.find(chain =>
    chain.rootBoneId === boneId || (Array.isArray(chain.boneIds) && chain.boneIds.includes(boneId))
  ) || null;
}

function collectSecondaryMotionBoneChain(startBoneId, maxBones = 5) {
  const ids = [];
  let current = getBoneById(startBoneId);
  while (current && ids.length < Math.max(1, maxBones)) {
    ids.push(current.id);
    const children = bones.filter(item => item.parent === current.id);
    if (children.length !== 1) break;
    current = children[0];
  }
  return ids;
}

function getSecondaryMotionPresetName(chain) {
  const preset = String(chain && chain.preset || 'cabello').trim().toLowerCase();
  return SECONDARY_MOTION_PRESETS[preset] ? preset : 'cabello';
}

function isBoneInAnyIkChain(boneId) {
  if (boneId === null || boneId === undefined) return false;
  return ensureIkConstraints().some(constraint =>
    constraint.enabled !== false && (
      constraint.rootBoneId === boneId ||
      constraint.midBoneId === boneId ||
      constraint.endBoneId === boneId ||
      constraint.targetBoneId === boneId
    )
  );
}

function getSecondaryMotionChainConflictReason(chain) {
  if (!chain) return 'Sin cadena';
  if (!Array.isArray(chain.boneIds) || chain.boneIds.length < 2) return 'Necesita al menos 2 bones';
  const firstBone = getBoneById(chain.boneIds[0]);
  if (!firstBone || firstBone.id === 0) return 'No uses root como hueso fisico';
  if (chain.rootBoneId === null || chain.rootBoneId === undefined || chain.rootBoneId === 0) return 'Necesita un parent estable, no root';
  const missingBone = chain.boneIds.find(id => !getBoneById(id));
  if (missingBone !== undefined) return 'Hay bones faltantes en la cadena';
  const ikBoneId = chain.boneIds.find(id => isBoneInAnyIkChain(id));
  if (ikBoneId !== undefined) return 'Conflicto con IK en la misma cadena';
  return '';
}

function isValidSecondaryMotionChain(chain) {
  return !getSecondaryMotionChainConflictReason(chain);
}

function applySecondaryMotionPreset(chain, presetName, preserveBones = true) {
  if (!chain) return false;
  const preset = String(presetName || 'cabello').trim().toLowerCase();
  const defaults = SECONDARY_MOTION_PRESETS[preset] || SECONDARY_MOTION_PRESETS.cabello;
  chain.preset = preset;
  chain.stiffness = defaults.stiffness;
  chain.damping = defaults.damping;
  chain.drag = defaults.drag;
  chain.gravity = defaults.gravity;
  chain.gravityAngle = defaults.gravityAngle;
  chain.maxAngle = defaults.maxAngle;
  chain.iterations = defaults.iterations;
  if (!preserveBones || !Array.isArray(chain.boneIds) || !chain.boneIds.length) {
    const sourceBoneId = chain.boneIds && chain.boneIds.length ? chain.boneIds[0] : selectedId;
    chain.boneIds = collectSecondaryMotionBoneChain(sourceBoneId, preset === 'trenza' ? 6 : 5);
  }
  chain.name = `Fisica ${preset}`;
  return true;
}

function createSecondaryMotionChainForSelectedBone(presetName = 'cabello') {
  const bone = getBoneById(selectedId);
  if (!bone || bone.id === 0) return;
  if (isBoneInAnyIkChain(bone.id)) {
    alert('No puedes crear fisica secundaria sobre un bone que ya pertenece a una cadena IK.');
    return;
  }
  const state = ensureSecondaryMotionState();
  let chain = getSecondaryMotionChainForBoneId(bone.id);
  if (!chain) {
    chain = {
      id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      rootBoneId: bone.parent,
      boneIds: collectSecondaryMotionBoneChain(bone.id, String(presetName).toLowerCase() === 'trenza' ? 6 : 5)
    };
    state.chains.push(chain);
  } else if (!Array.isArray(chain.boneIds) || !chain.boneIds.length) {
    chain.boneIds = collectSecondaryMotionBoneChain(bone.id, 5);
  }
  if (chain.rootBoneId === undefined) chain.rootBoneId = bone.parent;
  applySecondaryMotionPreset(chain, presetName, true);
  const conflict = getSecondaryMotionChainConflictReason(chain);
  if (conflict) {
    state.chains = state.chains.filter(item => item.id !== chain.id);
    alert(`No se pudo crear la fisica secundaria: ${conflict}.`);
    updateProps();
    render();
    return;
  }
  resetSecondaryMotionState('create-secondary-motion');
  updateProps();
  render();
  pushUndoSnapshot();
}

function refreshSecondaryMotionChainFromSelection() {
  const bone = getBoneById(selectedId);
  const chain = bone ? getSecondaryMotionChainForBoneId(bone.id) : null;
  if (!bone || !chain) return;
  chain.rootBoneId = bone.parent;
  chain.boneIds = collectSecondaryMotionBoneChain(bone.id, getSecondaryMotionPresetName(chain) === 'trenza' ? 6 : 5);
  const conflict = getSecondaryMotionChainConflictReason(chain);
  if (conflict) {
    alert(`La cadena fisica ya no es valida: ${conflict}.`);
  }
  resetSecondaryMotionState('refresh-secondary-motion');
  updateProps();
  render();
  pushUndoSnapshot();
}

function deleteSecondaryMotionChain(chainId) {
  const state = ensureSecondaryMotionState();
  const before = state.chains.length;
  state.chains = state.chains.filter(chain => chain.id !== chainId);
  if (state.chains.length === before) return;
  resetSecondaryMotionState('delete-secondary-motion');
  updateProps();
  render();
  pushUndoSnapshot();
}

function updateSecondaryMotionField(chainId, field, value) {
  const chain = getSecondaryMotionChainById(chainId);
  if (!chain) return;
  if (field === 'enabled' || field === 'enabledInRig' || field === 'enabledInPlayback') chain[field] = !!value;
  else if (field === 'preset') applySecondaryMotionPreset(chain, value, true);
  else if (field === 'name') chain.name = String(value || '').trim() || chain.name;
  else if (field === 'gravityAngle') chain.gravityAngle = normalizeAngleDeg(+value || 0);
  else if (field === 'iterations') chain.iterations = clamp(Math.round(+value || 1), 1, 4);
  else if (field === 'maxAngle') chain.maxAngle = clamp(+value || 0, 0, 180);
  else if (field === 'stiffness') chain.stiffness = clamp(+value || 0, 0, 40);
  else if (field === 'damping') chain.damping = clamp(+value || 0, 0, 30);
  else if (field === 'drag') chain.drag = clamp(+value || 0, 0, 1);
  else if (field === 'gravity') chain.gravity = clamp(+value || 0, -60, 60);
  resetSecondaryMotionState(`update-secondary-motion-${field}`);
  updateProps();
  render();
  pushUndoSnapshot();
}

function toggleSecondaryMotionEnabled(value) {
  const state = ensureSecondaryMotionState();
  state.enabled = !!value;
  resetSecondaryMotionState('toggle-secondary-motion');
  render();
  updateProps();
  pushUndoSnapshot();
}

function shouldApplySecondaryMotionChain(chain, phase = 'animation') {
  if (!chain || chain.enabled === false) return false;
  const state = ensureSecondaryMotionState();
  if (state.enabled === false) return false;
  if (!isValidSecondaryMotionChain(chain)) return false;
  if (phase === 'rig' && chain.enabledInRig === false) return false;
  if (phase !== 'rig' && chain.enabledInPlayback === false) return false;
  if (!Array.isArray(chain.boneIds) || !chain.boneIds.length) return false;
  return true;
}

function isSecondaryMotionBoneBeingEdited(chain) {
  if (!chain || !Array.isArray(chain.boneIds)) return false;
  if (movingBone && chain.boneIds.includes(movingBone.id)) return true;
  if (motionMovingBone && chain.boneIds.includes(motionMovingBone.id)) return true;
  return false;
}

function getSecondaryMotionDeltaTime() {
  const now = performance.now();
  if (!secondaryMotionRuntime.lastTimestampMs) {
    secondaryMotionRuntime.lastTimestampMs = now;
    return 1 / 60;
  }
  const dt = clamp((now - secondaryMotionRuntime.lastTimestampMs) / 1000, 1 / 240, 1 / 15);
  secondaryMotionRuntime.lastTimestampMs = now;
  return dt;
}

function setBoneWorldRotationFromParentAnchor(bone, worldRotationDeg) {
  if (!bone) return false;
  const length = Math.max(0.0001, getBoneLength(bone));
  if (bone.parent !== null) {
    const parent = getBoneById(bone.parent);
    if (parent) {
      bone.x = parent.ex;
      bone.y = parent.ey;
    }
  }
  const radians = worldRotationDeg * Math.PI / 180;
  bone.ex = bone.x + Math.cos(radians) * length;
  bone.ey = bone.y + Math.sin(radians) * length;
  return true;
}

function hasSecondaryMotionActivity() {
  const chainStates = secondaryMotionRuntime.chainStates || {};
  return Object.values(chainStates).some(state =>
    state && Object.values(state).some(item =>
      item && Math.abs(+item.velocity || 0) > 0.02
    )
  );
}

function shouldRunSecondaryMotionLoop() {
  const state = ensureSecondaryMotionState();
  if (projectState.editorMode !== 'rig') return false;
  if (state.enabled === false) return false;
  const hasEnabledChains = state.chains.some(chain => shouldApplySecondaryMotionChain(chain, 'rig'));
  if (!hasEnabledChains) return false;
  if (movingBone || motionMovingBone) return true;
  return hasSecondaryMotionActivity();
}

function secondaryMotionLoop() {
  if (shouldRunSecondaryMotionLoop()) {
    const now = performance.now();
    const activeDrag = !!(movingBone || motionMovingBone);
    const minFrameMs = activeDrag ? 16 : 33;
    if (!secondaryMotionRuntime.lastRenderMs || (now - secondaryMotionRuntime.lastRenderMs) >= minFrameMs) {
      secondaryMotionRuntime.lastRenderMs = now;
      render();
    }
  } else {
    secondaryMotionRuntime.lastTimestampMs = 0;
    secondaryMotionRuntime.lastRenderMs = 0;
  }
  requestAnimationFrame(secondaryMotionLoop);
}

function applySecondaryMotion(deltaTime = 1 / 60, phase = 'animation') {
  const state = ensureSecondaryMotionState();
  if (state.enabled === false) return false;
  const cappedDelta = clamp(deltaTime || 1 / 60, 1 / 240, 1 / 15);
  let applied = false;
  let activeBones = 0;
  state.chains.forEach(chain => {
    if (!shouldApplySecondaryMotionChain(chain, phase)) return;
    if (isSecondaryMotionBoneBeingEdited(chain)) return;
    const boneIds = chain.boneIds.filter(id => !!getBoneById(id));
    if (!boneIds.length) return;
    activeBones += boneIds.length;
    if (activeBones > state.maxActiveBones) return;
    const targetLocalRotations = new Map();
    boneIds.forEach(id => {
      const bone = getBoneById(id);
      if (!bone) return;
      const localRotation = getCurrentBoneLocalTransform(bone).rotation;
      targetLocalRotations.set(id, localRotation);
    });
    if (!secondaryMotionRuntime.chainStates[chain.id]) secondaryMotionRuntime.chainStates[chain.id] = {};
    const chainState = secondaryMotionRuntime.chainStates[chain.id];
    const iterations = clamp(Math.round(chain.iterations || 1), 1, 4);
    for (let iteration = 0; iteration < iterations; iteration++) {
      boneIds.forEach(id => {
        const bone = getBoneById(id);
        if (!bone) return;
        const parent = bone.parent !== null ? getBoneById(bone.parent) : null;
        const parentRotation = parent ? getBoneRotationDeg(parent) : 0;
        const currentLocal = normalizeAngleDeg(getBoneRotationDeg(bone) - parentRotation);
        const targetLocal = targetLocalRotations.get(id);
        if (!Number.isFinite(targetLocal)) return;
        if (!chainState[id]) chainState[id] = { angle: currentLocal, velocity: 0 };
        const item = chainState[id];
        if (!Number.isFinite(item.angle)) item.angle = currentLocal;
        if (!Number.isFinite(item.velocity)) item.velocity = 0;
        const worldAngle = parentRotation + item.angle;
        const gravityAngle = Number.isFinite(+chain.gravityAngle) ? +chain.gravityAngle : 90;
        const gravityForce = Number.isFinite(+chain.gravity) ? +chain.gravity : 0;
        const stiffness = Number.isFinite(+chain.stiffness) ? +chain.stiffness : 0;
        const damping = Number.isFinite(+chain.damping) ? +chain.damping : 0;
        const drag = Number.isFinite(+chain.drag) ? +chain.drag : 0;
        const springDelta = normalizeAngleDeg(targetLocal - item.angle);
        const gravityTorque = Math.sin((gravityAngle - worldAngle) * Math.PI / 180) * gravityForce;
        let acceleration = springDelta * stiffness + gravityTorque - item.velocity * damping;
        item.velocity += acceleration * cappedDelta;
        item.velocity *= Math.max(0, 1 - drag * cappedDelta * 6);
        item.angle = normalizeAngleDeg(item.angle + item.velocity * cappedDelta);
        item.angle = clampAngleAround(targetLocal, item.angle, chain.maxAngle);
        const desiredWorld = normalizeAngleDeg(parentRotation + item.angle);
        setBoneWorldRotationFromParentAnchor(bone, desiredWorld);
        applied = true;
      });
    }
  });
  return applied;
}

function buildSecondaryMotionMarkup(selectedBone, animationMode = false) {
  const state = ensureSecondaryMotionState();
  const chain = selectedBone ? getSecondaryMotionChainForBoneId(selectedBone.id) : null;
  const selectedPreset = chain ? getSecondaryMotionPresetName(chain) : 'cabello';
  const conflict = chain ? getSecondaryMotionChainConflictReason(chain) : '';
  const affectedNames = chain && Array.isArray(chain.boneIds)
    ? chain.boneIds.map(id => {
      const bone = getBoneById(id);
      return bone ? bone.name : null;
    }).filter(Boolean).join(' -> ')
    : '';
  const bakeDisabled = !animationMode || !getCurrentAnimation() || !chain ? 'disabled' : '';
  const createButtons = Object.keys(SECONDARY_MOTION_PRESETS).map(preset => `
    <button class="tiny-btn ${selectedPreset === preset ? 'active' : ''}" onclick="createSecondaryMotionChainForSelectedBone('${preset}')">${preset}</button>
  `).join('');
  if (!selectedBone || selectedBone.id === 0) {
    return `
      <div class="section-title" style="margin-top:10px">Fisica secundaria</div>
      <div class="prop-row"><span class="prop-label">Estado</span><input type="text" value="Selecciona un bone hijo para crearla" disabled></div>
    `;
  }
  if (!chain) {
    return `
      <div class="section-title" style="margin-top:10px">Fisica secundaria</div>
      <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${state.enabled ? 'checked' : ''} onchange="toggleSecondaryMotionEnabled(this.checked)"> Sistema global activo</label>
      <div class="prop-row"><span class="prop-label">Estado</span><input type="text" value="${isBoneInAnyIkChain(selectedBone.id) ? 'No disponible: bone usado por IK' : 'Sin cadena fisica'}" disabled></div>
      <div class="inline-actions">${createButtons}</div>
    `;
  }
  return `
    <div class="section-title" style="margin-top:10px">Fisica secundaria</div>
    <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${state.enabled ? 'checked' : ''} onchange="toggleSecondaryMotionEnabled(this.checked)"> Sistema global activo</label>
    <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${chain.enabled !== false ? 'checked' : ''} onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'enabled', this.checked)"> Cadena activa</label>
    <div class="inline-actions">${createButtons}</div>
    <div class="prop-row"><span class="prop-label">Nombre</span><input type="text" value="${escapeAttr(chain.name || 'Fisica secundaria')}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'name', this.value)"></div>
    <div class="prop-row"><span class="prop-label">Preset</span><select onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'preset', this.value)">${Object.keys(SECONDARY_MOTION_PRESETS).map(preset => `<option value="${preset}" ${selectedPreset === preset ? 'selected' : ''}>${preset}</option>`).join('')}</select></div>
    <div class="prop-row"><span class="prop-label">Estado</span><input type="text" value="${escapeAttr(conflict || 'Lista')}" disabled></div>
    <div class="prop-row"><span class="prop-label">Root</span><input type="text" value="${escapeAttr(chain.rootBoneId !== null && chain.rootBoneId !== undefined ? (getBoneById(chain.rootBoneId)?.name || '(faltante)') : '(sin root)')}" disabled></div>
    <div class="prop-row"><span class="prop-label">Bones</span><input type="text" value="${escapeAttr(affectedNames || selectedBone.name)}" disabled></div>
    <div class="prop-row"><span class="prop-label">Rigidez</span><input type="number" min="0" max="40" step="0.5" value="${(+chain.stiffness || 0).toFixed(1)}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'stiffness', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Damping</span><input type="number" min="0" max="30" step="0.5" value="${(+chain.damping || 0).toFixed(1)}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'damping', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Drag</span><input type="number" min="0" max="1" step="0.02" value="${(+chain.drag || 0).toFixed(2)}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'drag', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Gravedad</span><input type="number" min="-60" max="60" step="0.5" value="${(+chain.gravity || 0).toFixed(1)}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'gravity', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Ang. grav</span><input type="number" min="-180" max="180" step="1" value="${Math.round(+chain.gravityAngle || 0)}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'gravityAngle', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Limite</span><input type="number" min="0" max="180" step="1" value="${Math.round(+chain.maxAngle || 0)}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'maxAngle', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Iteraciones</span><input type="number" min="1" max="4" step="1" value="${Math.round(+chain.iterations || 1)}" onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'iterations', +this.value)"></div>
    <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${chain.enabledInRig !== false ? 'checked' : ''} onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'enabledInRig', this.checked)"> Preview en rig</label>
    <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${chain.enabledInPlayback !== false ? 'checked' : ''} onchange="updateSecondaryMotionField('${escapeAttr(chain.id)}', 'enabledInPlayback', this.checked)"> Preview en playback</label>
    <div class="inline-actions"><button class="tiny-btn" onclick="refreshSecondaryMotionChainFromSelection()">Refrescar cadena</button><button class="tiny-btn" onclick="resetSecondaryMotionState('inspector'); render();">Reset sim</button><button class="tiny-btn" ${bakeDisabled} onclick="bakeSelectedSecondaryMotionToAnimation()">Hornear a keys</button><button class="tiny-btn danger" onclick="deleteSecondaryMotionChain('${escapeAttr(chain.id)}')">Borrar</button></div>
  `;
}

function createDrivenConstraintForSelection() {
  const selectedLayer = selectedLayerIndex !== null ? getLayerByIndex(selectedLayerIndex) : null;
  const drivenType = selectedLayer ? 'layer' : 'bone';
  const drivenId = selectedLayer ? null : selectedId;
  const drivenLayerUid = selectedLayer ? selectedLayer.uid : null;
  if ((drivenType === 'bone' && (drivenId === null || drivenId === undefined)) || (drivenType === 'layer' && !drivenLayerUid)) {
    return;
  }
  const driverBone = drivenType === 'bone'
    ? bones.find(item => item.id !== drivenId)
    : bones[0];
  const driverLayer = drivenType === 'layer'
    ? psdLayers.find(item => item.uid !== drivenLayerUid)
    : null;
  const driverType = driverLayer ? 'layer' : 'bone';
  const driverId = driverType === 'bone' ? (driverBone ? driverBone.id : null) : null;
  const driverLayerUid = driverType === 'layer' ? driverLayer.uid : null;
  ensureDrivenConstraints().push({
    id: `driven_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    driverType,
    driverId,
    driverLayerUid,
    drivenType,
    drivenId,
    drivenLayerUid,
    channel: 'rotation',
    factor: -1,
    offset: 0,
    restDriverRotation: driverType === 'bone' ? getBoneRotationDeg(getBoneById(driverId)) : ((getLayerByUid(driverLayerUid)?.rotation || 0) * 180 / Math.PI),
    restDrivenRotation: drivenType === 'bone' ? getBoneRotationDeg(getBoneById(drivenId)) : ((getLayerByUid(drivenLayerUid)?.rotation || 0) * 180 / Math.PI)
  });
  updateProps();
  render();
  pushUndoSnapshot();
}

function updateDrivenConstraintField(constraintId, field, value) {
  const constraint = getDrivenConstraintById(constraintId);
  if (!constraint) return;
  if (field === 'enabled') constraint.enabled = !!value;
  else if (field === 'driverType') {
    constraint.driverType = value === 'layer' ? 'layer' : 'bone';
    if (constraint.driverType === 'bone') constraint.driverLayerUid = null;
    else constraint.driverId = null;
  } else if (field === 'drivenType') {
    constraint.drivenType = value === 'layer' ? 'layer' : 'bone';
    if (constraint.drivenType === 'bone') constraint.drivenLayerUid = null;
    else constraint.drivenId = null;
  } else if (field === 'driverId' || field === 'drivenId') {
    const parsed = value === '' || value === null ? null : +value;
    constraint[field] = Number.isFinite(parsed) ? parsed : null;
  } else if (field === 'driverLayerUid' || field === 'drivenLayerUid') {
    constraint[field] = value === '' || value === null ? null : String(value);
  } else if (field === 'factor' || field === 'offset') {
    constraint[field] = Number.isFinite(+value) ? +value : (field === 'factor' ? -1 : 0);
  } else if (field === 'channel') {
    constraint.channel = 'rotation';
  }
  if (field === 'driverId' || field === 'driverLayerUid' || field === 'drivenId' || field === 'drivenLayerUid') {
    captureDrivenConstraintRestPose(constraint);
    constraint.offset = 0;
  }
  updateProps();
  render();
  pushUndoSnapshot();
}

function invertDrivenConstraint(constraintId) {
  const constraint = getDrivenConstraintById(constraintId);
  if (!constraint) return;
  constraint.factor = -(Number.isFinite(+constraint.factor) ? +constraint.factor : -1);
  updateProps();
  render();
  pushUndoSnapshot();
}

function setDrivenConstraintRestPose(constraintId) {
  const constraint = getDrivenConstraintById(constraintId);
  if (!constraint) return;
  captureDrivenConstraintRestPose(constraint);
  constraint.offset = 0;
  updateProps();
  render();
  pushUndoSnapshot();
}

function deleteDrivenConstraint(constraintId) {
  const constraints = ensureDrivenConstraints();
  const index = constraints.findIndex(item => item.id === constraintId);
  if (index === -1) return;
  constraints.splice(index, 1);
  updateProps();
  render();
  pushUndoSnapshot();
}

function inferTwoBoneChainFromEndBone(endBone) {
  if (!endBone) return null;
  const midBone = endBone.parent !== null ? getBoneById(endBone.parent) : null;
  const rootBone = midBone && midBone.parent !== null ? getBoneById(midBone.parent) : null;
  if (!midBone || !rootBone) return null;
  return { rootBone, midBone, endBone };
}

function isValidIkConstraint(constraint) {
  if (!constraint) return false;
  const rootBone = getBoneById(constraint.rootBoneId);
  const midBone = getBoneById(constraint.midBoneId);
  const endBone = getBoneById(constraint.endBoneId);
  const targetBone = getBoneById(constraint.targetBoneId);
  if (!rootBone || !midBone || !endBone || !targetBone) return false;
  if (midBone.parent !== rootBone.id) return false;
  if (endBone.parent !== midBone.id) return false;
  if ([rootBone.id, midBone.id, endBone.id].includes(targetBone.id)) return false;
  return true;
}

function getIkTargetWorld(constraint) {
  const targetBone = getBoneById(constraint && constraint.targetBoneId);
  if (targetBone) return { x: targetBone.x, y: targetBone.y };
  return null;
}

function blendScalar(fromValue, toValue, mix) {
  return fromValue + (toValue - fromValue) * mix;
}

function applyTwoBoneIkConstraint(constraint) {
  if (!constraint || constraint.enabled === false || (constraint.mix !== undefined && constraint.mix <= 0)) return false;
  if (!isValidIkConstraint(constraint)) return false;

  const rootBone = getBoneById(constraint.rootBoneId);
  const midBone = getBoneById(constraint.midBoneId);
  const endBone = getBoneById(constraint.endBoneId);
  const target = getIkTargetWorld(constraint);
  if (!rootBone || !midBone || !endBone || !target) return false;

  const len1 = Math.max(0.0001, getBoneLength(rootBone));
  const len2 = Math.max(0.0001, getBoneLength(midBone));
  const endLocal = getCurrentBoneLocalTransform(endBone) || { rotation: 0, length: getBoneLength(endBone) };
  const mix = clamp(constraint.mix === undefined ? 1 : +constraint.mix || 0, 0, 1);
  const rootStart = { x: rootBone.x, y: rootBone.y };
  const dx = target.x - rootStart.x;
  const dy = target.y - rootStart.y;
  const distance = Math.max(0.0001, Math.hypot(dx, dy));
  const maxReach = len1 + len2;
  const minReach = Math.max(0.0001, Math.abs(len1 - len2));
  const solvedDistance = clamp(distance, minReach, maxReach);
  const baseAngle = Math.atan2(dy, dx);
  const bendSign = constraint.bendDirection === -1 ? -1 : 1;
  const shoulderOffset = Math.acos(clamp((solvedDistance * solvedDistance + len1 * len1 - len2 * len2) / (2 * solvedDistance * len1), -1, 1));
  const jointAngle = baseAngle + bendSign * shoulderOffset;
  const joint = {
    x: rootStart.x + Math.cos(jointAngle) * len1,
    y: rootStart.y + Math.sin(jointAngle) * len1
  };
  const wrist = distance > maxReach
    ? {
        x: rootStart.x + Math.cos(baseAngle) * maxReach,
        y: rootStart.y + Math.sin(baseAngle) * maxReach
      }
    : {
        x: target.x,
        y: target.y
      };

  const nextRoot = {
    x: rootBone.x,
    y: rootBone.y,
    ex: blendScalar(rootBone.ex, joint.x, mix),
    ey: blendScalar(rootBone.ey, joint.y, mix)
  };
  const nextMid = {
    x: blendScalar(midBone.x, nextRoot.ex, mix),
    y: blendScalar(midBone.y, nextRoot.ey, mix),
    ex: blendScalar(midBone.ex, wrist.x, mix),
    ey: blendScalar(midBone.ey, wrist.y, mix)
  };
  const midRotation = Math.atan2(nextMid.ey - nextMid.y, nextMid.ex - nextMid.x);
  const endRotation = midRotation + (endLocal.rotation || 0) * Math.PI / 180;
  const endLength = Math.max(0.0001, endLocal.length || getBoneLength(endBone));
  const nextEnd = {
    x: blendScalar(endBone.x, nextMid.ex, mix),
    y: blendScalar(endBone.y, nextMid.ey, mix)
  };
  nextEnd.ex = nextEnd.x + Math.cos(endRotation) * endLength;
  nextEnd.ey = nextEnd.y + Math.sin(endRotation) * endLength;

  rootBone.ex = nextRoot.ex;
  rootBone.ey = nextRoot.ey;
  midBone.x = nextMid.x;
  midBone.y = nextMid.y;
  midBone.ex = nextMid.ex;
  midBone.ey = nextMid.ey;
  endBone.x = nextEnd.x;
  endBone.y = nextEnd.y;
  endBone.ex = nextEnd.ex;
  endBone.ey = nextEnd.ey;
  return true;
}

function applyIkConstraints() {
  ensureIkConstraints().forEach(applyTwoBoneIkConstraint);
}

function drawIkConstraints(drawCtx) {
  ensureIkConstraints().forEach(constraint => {
    if (!isValidIkConstraint(constraint)) return;
    const rootBone = getBoneById(constraint.rootBoneId);
    const midBone = getBoneById(constraint.midBoneId);
    const endBone = getBoneById(constraint.endBoneId);
    const targetBone = getBoneById(constraint.targetBoneId);
    if (!rootBone || !midBone || !endBone || !targetBone) return;
    drawCtx.save();
    drawCtx.strokeStyle = constraint.enabled === false ? 'rgba(160,160,160,0.45)' : 'rgba(255,209,90,0.9)';
    drawCtx.lineWidth = 1.5 / view.scale;
    drawCtx.setLineDash([6 / view.scale, 5 / view.scale]);
    drawCtx.beginPath();
    drawCtx.moveTo(rootBone.x, rootBone.y);
    drawCtx.lineTo(midBone.x, midBone.y);
    drawCtx.lineTo(endBone.x, endBone.y);
    drawCtx.lineTo(targetBone.x, targetBone.y);
    drawCtx.stroke();
    drawCtx.setLineDash([]);
    drawCtx.beginPath();
    drawCtx.arc(targetBone.x, targetBone.y, 8 / view.scale, 0, Math.PI * 2);
    drawCtx.fillStyle = constraint.enabled === false ? 'rgba(120,120,120,0.55)' : 'rgba(255,209,90,0.22)';
    drawCtx.fill();
    drawCtx.strokeStyle = constraint.enabled === false ? '#8a8a8a' : '#ffd15a';
    drawCtx.lineWidth = 2 / view.scale;
    drawCtx.stroke();
    drawCtx.restore();
  });
}

function createIkConstraintForSelectedBone() {
  const endBone = getBoneById(selectedId);
  const chain = inferTwoBoneChainFromEndBone(endBone);
  if (!chain) {
    alert('Selecciona el tercer bone de una cadena de 3 bones para crear IK.');
    return;
  }
  if (getIkConstraintForBoneId(chain.endBone.id) || getIkConstraintForBoneId(chain.midBone.id) || getIkConstraintForBoneId(chain.rootBone.id)) {
    alert('Esta cadena ya tiene un IK asignado.');
    return;
  }
  const targetLength = Math.max(18, Math.min(42, getBoneLength(chain.endBone) * 0.5));
  const targetBone = {
    id: nextId++,
    name: `${chain.endBone.name}_ik_target`,
    parent: null,
    x: chain.endBone.x,
    y: chain.endBone.y,
    ex: chain.endBone.x + targetLength,
    ey: chain.endBone.y,
    color: '#ffd15a'
  };
  bones.push(targetBone);
  ensureIkConstraints().push({
    id: `ik_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    rootBoneId: chain.rootBone.id,
    midBoneId: chain.midBone.id,
    endBoneId: chain.endBone.id,
    targetBoneId: targetBone.id,
    targetLayerUid: null,
    bendDirection: 1,
    enabled: true,
    mix: 1
  });
  document.getElementById('st-bones').textContent = `${bones.length} bones`;
  saveBindPose();
  updateTree();
  updateProps();
  render();
  pushUndoSnapshot();
}

function updateIkConstraintField(constraintId, field, value) {
  const constraint = getIkConstraintById(constraintId);
  if (!constraint) return;
  if (['rootBoneId', 'midBoneId', 'endBoneId', 'targetBoneId'].includes(field)) {
    const parsed = value === '' || value === null ? null : +value;
    constraint[field] = Number.isFinite(parsed) ? parsed : null;
  } else if (field === 'enabled') {
    constraint.enabled = !!value;
  } else if (field === 'bendDirection') {
    constraint.bendDirection = String(value) === '-1' ? -1 : 1;
  } else if (field === 'mix') {
    constraint.mix = clamp(+value || 0, 0, 1);
  }
  updateProps();
  render();
  pushUndoSnapshot();
}

function deleteIkConstraint(constraintId) {
  const constraints = ensureIkConstraints();
  const index = constraints.findIndex(item => item.id === constraintId);
  if (index === -1) return;
  constraints.splice(index, 1);
  updateProps();
  render();
  pushUndoSnapshot();
}

function cloneVertices(vertices) {
  return (vertices || []).map(v => ({ x: v.x, y: v.y }));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isTopLeftMesh(layer) {
  return !!(layer && layer.mesh && layer.mesh.origin === 'top-left');
}

function meshPointToLayerLocal(layer, point) {
  if (!point) return point;
  return isTopLeftMesh(layer)
    ? { x: point.x - layer.width / 2, y: point.y - layer.height / 2 }
    : point;
}

function layerLocalToMeshPoint(layer, localX, localY) {
  return isTopLeftMesh(layer)
    ? { x: localX + layer.width / 2, y: localY + layer.height / 2 }
    : { x: localX, y: localY };
}

function getMeshVertexCount(layer) {
  return layer && layer.mesh && layer.mesh.bindVertices ? layer.mesh.bindVertices.length : 0;
}

function isMeshVertexArrayCompatible(layer, vertices) {
  const expected = getMeshVertexCount(layer);
  return !!(vertices && (!expected || vertices.length === expected));
}

function getRenderMeshVertices(layer) {
  if (!layer || !layer.mesh) return [];
  const mesh = layer.mesh;
  if (isMeshVertexArrayCompatible(layer, mesh.runtimeVertices)) return mesh.runtimeVertices;
  if (isMeshVertexArrayCompatible(layer, mesh.animatedVertices)) return mesh.animatedVertices;
  if (isMeshVertexArrayCompatible(layer, mesh.bindVertices)) return mesh.bindVertices;
  return mesh.vertices || [];
}

function getEditableMeshVertices(layer) {
  if (!layer || !layer.mesh) return [];
  if (projectState.editorMode === 'animation' && isMeshVertexArrayCompatible(layer, layer.mesh.animatedVertices)) {
    return layer.mesh.animatedVertices;
  }
  return layer.mesh.bindVertices || [];
}

function createImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function createVideoFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => resolve(video);
    video.onerror = reject;
    video.src = dataUrl;
  });
}

function attachVideoReferenceElement(video) {
  const displayVideo = document.getElementById('motion-video');
  videoReferenceElement = displayVideo || video;
  if (!videoReferenceElement) return;
  videoReferenceElement.muted = true;
  videoReferenceElement.playsInline = true;
  videoReferenceElement.preload = 'auto';
  videoReferenceElement.onseeked = () => {
    renderMotionWindow();
    render();
  };
  videoReferenceElement.onloadeddata = () => {
    renderMotionWindow();
    render();
  };
  videoReferenceElement.onloadedmetadata = () => {
    projectState.videoReference.width = videoReferenceElement.videoWidth || projectState.videoReference.width;
    projectState.videoReference.height = videoReferenceElement.videoHeight || projectState.videoReference.height;
    projectState.videoReference.durationSeconds = videoReferenceElement.duration || projectState.videoReference.durationSeconds;
    resizeMotionCanvas();
  };
  if (video && video.src && videoReferenceElement.src !== video.src) {
    videoReferenceElement.src = video.src;
    videoReferenceElement.load();
  }
  videoReferenceElement.style.opacity = clamp(projectState.videoReference.opacity ?? 0.75, 0, 1);
}

function setVideoReferenceSource(src) {
  if (!videoReferenceElement) attachVideoReferenceElement(null);
  if (!videoReferenceElement || !src) return;
  videoReferenceElement.src = src;
  videoReferenceElement.load();
}

function playMotionVideo() {
  if (projectState.videoReference && (projectState.videoReference.frames || []).length) {
    if (projectState.editorMode !== 'animation') switchEditorMode('animation');
    if (!getCurrentAnimation()) createAnimationClip();
    projectState.playback.isPlaying = true;
    projectState.playback.lastTickMs = 0;
    document.getElementById('play-btn').textContent = 'Pause';
    return;
  }
  if (!videoReferenceElement) return;
  videoReferenceElement.play().catch(error => console.warn('No se pudo reproducir el video', error));
}

function pauseMotionVideo() {
  if (projectState.videoReference && (projectState.videoReference.frames || []).length) {
    projectState.playback.isPlaying = false;
    document.getElementById('play-btn').textContent = 'Play';
    return;
  }
  if (videoReferenceElement) videoReferenceElement.pause();
}

function toggleMotionBonesOverlay() {
  if (!motionCanvas) return;
  motionCanvas.classList.toggle('overlay-off');
}

function serializeLayer(layer) {
  return {
    uid: layer.uid,
    name: layer.name,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    data_url: layer.data_url,
    bone_id: layer.bone_id,
    center_x: layer.center_x,
    center_y: layer.center_y,
    rotation: layer.rotation || 0,
    visible: layer.visible !== false,
    runtime_visible: layer.runtime_visible !== false,
    zOrder: layer.zOrder,
    runtime_z: layer.runtime_z,
    role: layer.role || 'controller',
    uiGroup: getLayerUiGroup(layer),
    switchGroup: layer.switchGroup || '',
    switchKey: layer.switchKey || '',
    mesh: layer.mesh ? deepClone({
      vertices: layer.mesh.vertices || [],
      bindVertices: layer.mesh.bindVertices || [],
      runtimeVertices: layer.mesh.runtimeVertices || [],
      uvs: layer.mesh.uvs || [],
      indices: layer.mesh.indices || [],
      origin: layer.mesh.origin || 'center',
      uvSpace: layer.mesh.uvSpace || 'pixels',
      skinWeights: layer.mesh.skinWeights || null,
      skinBindTransforms: layer.mesh.skinBindTransforms || null,
      skinBindLayerTransform: layer.mesh.skinBindLayerTransform || null
    }) : null,
    meshPins: deepClone(layer.meshPins || []),
    orig_center_x: layer.orig_center_x,
    orig_center_y: layer.orig_center_y,
    orig_rotation: layer.orig_rotation,
    orig_visible: layer.orig_visible,
    orig_zOrder: layer.orig_zOrder,
    orig_role: layer.orig_role,
    orig_mesh_bindVertices: deepClone(layer.orig_mesh_bindVertices || [])
  };
}

function serializeProjectData() {
  return FrogmakerModules.projectIO.serializeProjectData();
}

function sanitizeProjectData(data) {
  return FrogmakerModules.state.sanitizeProjectData(data);
}

function captureUndoState() {
  return FrogmakerModules.history.captureUndoState();
}

function pushUndoSnapshot() {
  return FrogmakerModules.history.pushUndoSnapshot();
}

async function loadProjectData(data, options = {}) {
  return FrogmakerModules.projectIO.loadProjectData(data, options);
}

async function undoLastAction() {
  return FrogmakerModules.history.undoLastAction();
}

function resizeCanvas() {
  const area = document.getElementById('canvas-area');
  canvas.width = area.clientWidth;
  canvas.height = area.clientHeight;
  if (FrogmakerModules.pixiRenderer && FrogmakerModules.pixiRenderer.isAvailable()) {
    FrogmakerModules.pixiRenderer.resize();
  }
  render();
}

function getCameraWorldRect() {
  const camera = ensureProjectCamera();
  const zoom = Math.max(0.05, camera.zoom || 1);
  return {
    x: camera.x - camera.width / (2 * zoom),
    y: camera.y - camera.height / (2 * zoom),
    width: camera.width / zoom,
    height: camera.height / zoom
  };
}

function canShowCameraMiniGizmo() {
  return activeTool === 'select' || activeTool === 'move' || activeTool === 'pose';
}

function getCameraMiniGizmoAnchor() {
  if (!canShowCameraMiniGizmo()) return null;
  if (selectedLayerIndex !== null && selectedLayerIndex !== undefined) {
    const layer = getLayerByIndex(selectedLayerIndex);
    if (!layer) return null;
    return {
      type: 'layer',
      id: selectedLayerIndex,
      x: layer.center_x + 30 / view.scale,
      y: layer.center_y - 30 / view.scale
    };
  }
  if (selectedId !== null && selectedId !== undefined) {
    const bone = getBoneById(selectedId);
    if (!bone) return null;
    return {
      type: 'bone',
      id: bone.id,
      x: bone.x + 30 / view.scale,
      y: bone.y - 30 / view.scale
    };
  }
  return null;
}

function syncCameraMiniGizmo() {
  const anchor = getCameraMiniGizmoAnchor();
  if (!anchor) {
    cameraMiniGizmo.visible = false;
    cameraMiniGizmo.anchorType = null;
    cameraMiniGizmo.anchorId = null;
    if (!cameraMiniGizmo.dragging) cameraMiniGizmo.dragOffsetWorld = null;
    return null;
  }
  cameraMiniGizmo.visible = true;
  cameraMiniGizmo.anchorType = anchor.type;
  cameraMiniGizmo.anchorId = anchor.id;
  return anchor;
}

function getCameraMiniGizmoMetrics() {
  const anchor = syncCameraMiniGizmo();
  if (!anchor) return null;
  return {
    x: anchor.x,
    y: anchor.y,
    radius: 11 / view.scale,
    hitRadius: 18 / view.scale,
    arm: 18 / view.scale
  };
}

function getCameraMiniGizmoHit(worldX, worldY) {
  const gizmo = getCameraMiniGizmoMetrics();
  if (!gizmo) return null;
  if (Math.hypot(worldX - gizmo.x, worldY - gizmo.y) <= gizmo.hitRadius) return gizmo;
  return null;
}

function drawCameraMiniGizmo(drawCtx) {
  const gizmo = getCameraMiniGizmoMetrics();
  if (!gizmo) return;
  drawCtx.save();
  drawCtx.globalAlpha = 0.98;
  drawCtx.beginPath();
  drawCtx.arc(gizmo.x, gizmo.y, gizmo.radius, 0, Math.PI * 2);
  drawCtx.fillStyle = cameraMiniGizmo.dragging ? '#ffd15a' : '#ffe08a';
  drawCtx.fill();
  drawCtx.strokeStyle = '#111';
  drawCtx.lineWidth = 2 / view.scale;
  drawCtx.stroke();

  drawCtx.beginPath();
  drawCtx.moveTo(gizmo.x - gizmo.arm, gizmo.y);
  drawCtx.lineTo(gizmo.x + gizmo.arm, gizmo.y);
  drawCtx.moveTo(gizmo.x, gizmo.y - gizmo.arm);
  drawCtx.lineTo(gizmo.x, gizmo.y + gizmo.arm);
  drawCtx.strokeStyle = 'rgba(255,224,138,0.95)';
  drawCtx.lineWidth = 3 / view.scale;
  drawCtx.stroke();

  drawCtx.beginPath();
  drawCtx.moveTo(gizmo.x - gizmo.arm, gizmo.y);
  drawCtx.lineTo(gizmo.x + gizmo.arm, gizmo.y);
  drawCtx.moveTo(gizmo.x, gizmo.y - gizmo.arm);
  drawCtx.lineTo(gizmo.x, gizmo.y + gizmo.arm);
  drawCtx.strokeStyle = 'rgba(24,24,24,0.8)';
  drawCtx.lineWidth = 1 / view.scale;
  drawCtx.stroke();
  drawCtx.restore();
}

function setProjectCameraPosition(x, y) {
  const camera = ensureProjectCamera();
  camera.x = x;
  camera.y = y;
}

function finishCameraDragInteraction() {
  if (projectState.editorMode === 'animation' && typeof captureCameraToAnimation === 'function' && getCurrentAnimation()) {
    if (projectState.playback.autoKey) {
      captureCameraToAnimation(projectState.playback.currentFrame, 'linear');
      if (typeof applyAnimationAtCurrentFrame === 'function') applyAnimationAtCurrentFrame();
    } else {
      render();
      pushUndoSnapshot();
    }
  } else {
    render();
    pushUndoSnapshot();
  }
  updateProps();
}

function drawCameraFrame(drawCtx) {
  const camera = ensureProjectCamera();
  if (!camera.showFrame) return;
  const rect = getCameraWorldRect();
  drawCtx.save();
  drawCtx.strokeStyle = camera.enabled ? 'rgba(255,213,90,0.95)' : 'rgba(180,180,180,0.65)';
  drawCtx.lineWidth = 2 / view.scale;
  drawCtx.setLineDash([10 / view.scale, 6 / view.scale]);
  drawCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  drawCtx.setLineDash([]);
  drawCtx.fillStyle = camera.enabled ? 'rgba(255,213,90,0.13)' : 'rgba(180,180,180,0.08)';
  drawCtx.fillRect(rect.x, rect.y, rect.width, rect.height);
  drawCtx.fillStyle = camera.enabled ? '#ffe08a' : '#ccc';
  drawCtx.font = `${12 / view.scale}px sans-serif`;
  drawCtx.fillText(`Camara ${camera.width}x${camera.height}  zoom ${camera.zoom.toFixed(2)}x`, rect.x + 8 / view.scale, rect.y - 10 / view.scale);
  drawCtx.beginPath();
  drawCtx.arc(camera.x, camera.y, 5 / view.scale, 0, Math.PI * 2);
  drawCtx.fill();
  drawCtx.strokeStyle = 'rgba(20,20,20,0.8)';
  drawCtx.lineWidth = 1 / view.scale;
  drawCtx.stroke();
  drawCtx.restore();
}

function isPointInCameraFrame(worldX, worldY) {
  const rect = getCameraWorldRect();
  return worldX >= rect.x && worldX <= rect.x + rect.width && worldY >= rect.y && worldY <= rect.y + rect.height;
}

function selectCameraTool() {
  ensureProjectCamera();
  selectedId = null;
  selectedLayerIndex = null;
  projectState.timeline.selectedType = 'camera';
  projectState.timeline.selectedTargetId = 'camera';
  setTool('camera');
  updateTree();
  updateLayerList();
  updateProps();
  if (typeof renderTimeline === 'function') renderTimeline();
  render();
}

function resetCameraToScene() {
  const camera = ensureProjectCamera();
  camera.x = sceneWidth / 2;
  camera.y = sceneHeight / 2;
  camera.zoom = 1;
  camera.width = 1920;
  camera.height = 1080;
  camera.enabled = true;
  camera.showFrame = true;
  updateProps();
  render();
  pushUndoSnapshot();
}

function toggleCameraFrame(visible) {
  const camera = ensureProjectCamera();
  camera.showFrame = !!visible;
  render();
  pushUndoSnapshot();
}

function toggleCameraEnabled(enabled) {
  const camera = ensureProjectCamera();
  camera.enabled = !!enabled;
  updateProps();
  render();
  pushUndoSnapshot();
}

function setCameraOutputSize(width, height) {
  const camera = ensureProjectCamera();
  camera.width = Math.max(1, Math.round(+width || 1920));
  camera.height = Math.max(1, Math.round(+height || 1080));
  updateProps();
  render();
  pushUndoSnapshot();
}

function getRenderableLayers() {
  return [...psdLayers]
    .map((layer, index) => ({
      layer,
      index,
      z: layer.runtime_z !== undefined ? layer.runtime_z : (layer.zOrder !== undefined ? layer.zOrder : index)
    }))
    .sort((a, b) => b.z - a.z);
}

function getLayerSwitchGroup(layer) {
  return String(layer && layer.switchGroup ? layer.switchGroup : '').trim();
}

function getLayerSwitchKey(layer) {
  return String(layer && layer.switchKey ? layer.switchKey : '').trim();
}

function getSwitchGroups() {
  const groups = {};
  psdLayers.forEach((layer, index) => {
    ensureLayerIdentity(layer);
    const group = getLayerSwitchGroup(layer);
    const key = getLayerSwitchKey(layer);
    if (!group || !key) return;
    if (!groups[group]) groups[group] = [];
    groups[group].push({ layer, index, key });
  });
  return groups;
}

function getSwitchDefaultKey(groupName) {
  const group = String(groupName || '').trim();
  if (!group) return '';
  if (projectState.switchDefaults && projectState.switchDefaults[group]) return projectState.switchDefaults[group];
  const match = psdLayers.find(layer => getLayerSwitchGroup(layer) === group && getLayerSwitchKey(layer));
  return match ? getLayerSwitchKey(match) : '';
}

function evaluateSwitchTrack(track, frame, defaultKey = '') {
  if (!Array.isArray(track) || !track.length) return defaultKey;
  let value = defaultKey;
  track.forEach(keyframe => {
    if (!keyframe || !Number.isFinite(+keyframe.frame)) return;
    if (+keyframe.frame <= frame) value = String(keyframe.value || '');
  });
  return value || defaultKey;
}

function getActiveSwitchKey(groupName, animation = null, frame = null) {
  const group = String(groupName || '').trim();
  if (!group) return '';
  const currentAnimation = animation || (typeof getCurrentAnimation === 'function' ? getCurrentAnimation() : null);
  const currentFrame = Number.isFinite(+frame) ? +frame : (projectState.playback ? projectState.playback.currentFrame : 0);
  const defaultKey = getSwitchDefaultKey(group);
  if (!currentAnimation || !currentAnimation.switchTimelines) return defaultKey;
  return evaluateSwitchTrack(currentAnimation.switchTimelines[group], currentFrame, defaultKey);
}

function isLayerSwitchVisible(layer, animation = null, frame = null) {
  const group = getLayerSwitchGroup(layer);
  const key = getLayerSwitchKey(layer);
  if (!group || !key) return true;
  return key === getActiveSwitchKey(group, animation, frame);
}

function isLayerVisibleInSoloGroup(layer) {
  const tree = ensureLayerTreeState();
  const soloGroup = normalizeLayerUiGroup(tree.soloGroup || '');
  if (!soloGroup) return true;
  const layerGroup = getLayerUiGroup(layer);
  return layerGroup === soloGroup || layerGroup.startsWith(soloGroup + '/');
}

function getLayerRenderVisible(layer, animation = null, frame = null) {
  const uiGroup = typeof getLayerUiGroup === 'function' ? getLayerUiGroup(layer) : (layer.uiGroup || '').trim();
  if (uiGroup && typeof ParticleManager !== 'undefined' && ParticleManager.isEmitter(uiGroup)) {
    return false;
  }
  const baseVisible = layer.runtime_visible !== undefined ? layer.runtime_visible : layer.visible !== false;
  return !!baseVisible && isLayerSwitchVisible(layer, animation, frame) && isLayerVisibleInSoloGroup(layer);
}

function getLayerZ(layer, index) {
  return layer.runtime_z !== undefined ? layer.runtime_z : (layer.zOrder !== undefined ? layer.zOrder : index);
}

function drawTexturedTriangle(drawCtx, img, p0, p1, p2, uv0, uv1, uv2) {
  if (!p0 || !p1 || !p2 || !uv0 || !uv1 || !uv2) return;
  const maxU = Math.max(Math.abs(uv0.u), Math.abs(uv1.u), Math.abs(uv2.u));
  const maxV = Math.max(Math.abs(uv0.v), Math.abs(uv1.v), Math.abs(uv2.v));
  if (maxU <= 1.0001 && maxV <= 1.0001) {
    uv0 = { u: uv0.u * img.width, v: uv0.v * img.height };
    uv1 = { u: uv1.u * img.width, v: uv1.v * img.height };
    uv2 = { u: uv2.u * img.width, v: uv2.v * img.height };
  }

  drawCtx.save();
  drawCtx.beginPath();
  drawCtx.moveTo(p0.x, p0.y);
  drawCtx.lineTo(p1.x, p1.y);
  drawCtx.lineTo(p2.x, p2.y);
  drawCtx.closePath();
  drawCtx.clip();

  const d = uv0.u * (uv1.v - uv2.v) - uv1.u * uv0.v + uv1.u * uv2.v + uv2.u * uv0.v - uv2.u * uv1.v;
  if (Math.abs(d) < 0.0001) {
    drawCtx.restore();
    return;
  }

  const a = (p0.x * (uv1.v - uv2.v) - p1.x * uv0.v + p1.x * uv2.v + p2.x * uv0.v - p2.x * uv1.v) / d;
  const b = (p0.y * (uv1.v - uv2.v) - p1.y * uv0.v + p1.y * uv2.v + p2.y * uv0.v - p2.y * uv1.v) / d;
  const c = (uv0.u * (p1.x - p2.x) - uv1.u * p0.x + uv1.u * p2.x + uv2.u * p0.x - uv2.u * p1.x) / d;
  const e = (uv0.u * (p1.y - p2.y) - uv1.u * p0.y + uv1.u * p2.y + uv2.u * p0.y - uv2.u * p1.y) / d;
  const f = (uv0.u * (uv1.v * p2.x - uv2.v * p1.x) - uv1.u * (uv0.v * p2.x - uv2.v * p0.x) + uv2.u * (uv0.v * p1.x - uv1.v * p0.x)) / d;
  const g = (uv0.u * (uv1.v * p2.y - uv2.v * p1.y) - uv1.u * (uv0.v * p2.y - uv2.v * p0.y) + uv2.u * (uv0.v * p1.y - uv1.v * p0.y)) / d;

  drawCtx.transform(a, b, c, e, f, g);
  drawCtx.drawImage(img, 0, 0);
  drawCtx.restore();
}

function syncVideoReferenceToFrame() {
  if (!projectState.videoReference.enabled) return;
  const refFrames = projectState.videoReference.frames || [];
  if (refFrames.length && videoReferenceFrameElement) {
    const frameIndex = clamp(Math.round(projectState.playback.currentFrame), 0, refFrames.length - 1);
    if (videoReferenceFrameElement.src !== refFrames[frameIndex]) videoReferenceFrameElement.src = refFrames[frameIndex];
    projectState.videoReference.currentTime = frameIndex / Math.max(1, projectState.videoReference.frameRate || 24);
    renderMotionWindow();
    return;
  }
  if (!videoReferenceElement) return;
  if (!videoReferenceElement.src && projectState.videoReference.dataUrl) {
    videoReferenceElement.src = projectState.videoReference.dataUrl;
    videoReferenceElement.load();
  }
  const animation = typeof getCurrentAnimation === 'function' ? getCurrentAnimation() : null;
  const fps = animation ? Math.max(1, animation.frameRate || 24) : 24;
  const nextTime = projectState.playback.currentFrame / fps;
  const safeTime = Math.min(Math.max(0, nextTime), Math.max(0, (videoReferenceElement.duration || nextTime) - 0.001));
  projectState.videoReference.currentTime = safeTime;
  if (Number.isFinite(safeTime) && Math.abs((videoReferenceElement.currentTime || 0) - safeTime) > 0.025) {
    try {
      videoReferenceElement.currentTime = safeTime;
    } catch (error) {
      console.warn('No se pudo sincronizar el video de referencia', error);
    }
  }
}

function drawVideoReference() {
  const ref = projectState.videoReference;
  if (!ref || !ref.enabled || !videoReferenceElement || videoReferenceElement.readyState < 2) return;
  if (!ref.showInMain) return;
  if (!document.getElementById('motion-window')?.classList.contains('hidden')) return;
  ctx.save();
  ctx.globalAlpha = clamp(ref.opacity ?? 0.45, 0, 1);
  ctx.drawImage(videoReferenceElement, 0, 0, sceneWidth, sceneHeight);
  ctx.restore();
}

function getMotionSceneSize() {
  return {
    width: projectState.videoReference.width || sceneWidth || 1000,
    height: projectState.videoReference.height || sceneHeight || 1000
  };
}

function resizeMotionCanvas() {
  if (!motionCanvas) return;
  const rect = motionCanvas.getBoundingClientRect();
  motionCanvas.width = Math.max(1, Math.round(rect.width));
  motionCanvas.height = Math.max(1, Math.round(rect.height));
  const size = getMotionSceneSize();
  const scaleX = motionCanvas.width / size.width;
  const scaleY = motionCanvas.height / size.height;
  motionView.scale = Math.min(scaleX, scaleY);
  motionView.x = (motionCanvas.width - size.width * motionView.scale) / 2;
  motionView.y = (motionCanvas.height - size.height * motionView.scale) / 2;
  renderMotionWindow();
}

function toMotionWorld(cx, cy) {
  return { x: (cx - motionView.x) / motionView.scale, y: (cy - motionView.y) / motionView.scale };
}

function drawMotionBoneShape(drawCtx, bone, selected) {
  const color = selected ? '#ffd15a' : (bone.color || getColor(getBoneDepth(bone)));
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = selected ? 7 / motionView.scale : 5 / motionView.scale;
  drawCtx.lineCap = 'round';
  drawCtx.beginPath();
  drawCtx.moveTo(bone.x, bone.y);
  drawCtx.lineTo(bone.ex, bone.ey);
  drawCtx.stroke();
  drawCtx.beginPath();
  drawCtx.arc(bone.x, bone.y, 6 / motionView.scale, 0, Math.PI * 2);
  drawCtx.fillStyle = color;
  drawCtx.fill();
  drawCtx.strokeStyle = '#fff';
  drawCtx.lineWidth = 1.5 / motionView.scale;
  drawCtx.stroke();
}

function renderMotionWindow() {
  if (!motionCanvas || !motionCtx) return;
  motionCtx.clearRect(0, 0, motionCanvas.width, motionCanvas.height);
  motionCtx.save();
  motionCtx.translate(motionView.x, motionView.y);
  motionCtx.scale(motionView.scale, motionView.scale);
  bones.forEach(bone => drawMotionBoneShape(motionCtx, bone, bone.id === selectedId));
  if (motionDragPreview) drawMotionBoneShape(motionCtx, motionDragPreview, true);
  motionCtx.restore();

  const label = document.getElementById('motion-frame-label');
  const animation = typeof getCurrentAnimation === 'function' ? getCurrentAnimation() : null;
  if (label) label.textContent = animation
    ? `Frame ${projectState.playback.currentFrame}/${animation.duration} · ${animation.frameRate} fps`
    : `Frame ${projectState.playback.currentFrame}`;
}

function showMotionWindow() {
  const modal = document.getElementById('motion-window');
  if (!modal) return;
  modal.classList.remove('hidden');
  videoReferenceFrameElement = document.getElementById('motion-frame-image');
  if (videoReferenceFrameElement) videoReferenceFrameElement.style.opacity = clamp(projectState.videoReference.opacity ?? 0.75, 0, 1);
  if (videoReferenceElement && projectState.videoReference.dataUrl && !videoReferenceElement.src) {
    videoReferenceElement.src = projectState.videoReference.dataUrl;
    videoReferenceElement.load();
  }
  if (videoReferenceElement) videoReferenceElement.style.opacity = clamp(projectState.videoReference.opacity ?? 0.75, 0, 1);
  const nameLabel = document.getElementById('motion-video-name');
  if (nameLabel) nameLabel.textContent = projectState.videoReference.name || 'Video de referencia';
  resizeMotionCanvas();
  syncVideoReferenceToFrame();
  renderMotionWindow();
}

function hideMotionWindow() {
  const modal = document.getElementById('motion-window');
  if (modal) modal.classList.add('hidden');
}

function getMotionBoneAt(wx, wy) {
  const r = 16 / motionView.scale;
  return [...bones].reverse().find(bone => {
    const dStart = Math.hypot(bone.x - wx, bone.y - wy);
    if (dStart < r) return true;
    return Math.hypot(bone.ex - wx, bone.ey - wy) < r;
  });
}

function createGridMeshForLayer(layer, cols = 3, rows = 3) {
  ensureLayerIdentity(layer);
  const vertices = [];
  const uvs = [];
  const indices = [];

  for (let y = 0; y <= rows; y++) {
    const ny = y / rows;
    const ly = -layer.height / 2 + ny * layer.height;
    for (let x = 0; x <= cols; x++) {
      const nx = x / cols;
      const lx = -layer.width / 2 + nx * layer.width;
      vertices.push({ x: lx, y: ly });
      uvs.push({ u: nx * layer.width, v: ny * layer.height });
    }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const stride = cols + 1;
      const i0 = y * stride + x;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }
  }

  layer.mesh = {
    vertices: cloneVertices(vertices),
    bindVertices: cloneVertices(vertices),
    runtimeVertices: cloneVertices(vertices),
    uvs,
    indices
  };
  layer.meshPins = [];
  layer.role = 'deformable';
}

function createDenseGridMeshForSeparatedShapes(layer, options = {}) {
  const width = Math.max(1, Number(layer && layer.width) || 1);
  const height = Math.max(1, Number(layer && layer.height) || 1);
  const longestSide = Math.max(width, height);
  const shortestSide = Math.max(1, Math.min(width, height));
  const density = clamp(Math.round(longestSide / 18), 5, 16);
  const aspectRatio = longestSide / shortestSide;
  const cols = width >= height
    ? density
    : clamp(Math.round(density / Math.max(1, aspectRatio)), 4, density);
  const rows = height > width
    ? density
    : clamp(Math.round(density / Math.max(1, aspectRatio)), 4, density);
  createGridMeshForLayer(layer, options.cols || cols, options.rows || rows);
  return true;
}

function createCanvasForImageRead(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  return tempCanvas;
}

function getLayerRasterImage(layer) {
  return layer.image || layer.img_element || null;
}

function contourKey(x, y) {
  return `${x},${y}`;
}

function parseContourKey(key) {
  const parts = key.split(',');
  return { x: Number(parts[0]), y: Number(parts[1]) };
}

function polygonSignedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || 0.000001) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

function removeNearDuplicatePoints(points, minDistance = 0.01) {
  const result = [];
  points.forEach(point => {
    const previous = result[result.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= minDistance) {
      result.push(point);
    }
  });
  if (result.length > 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < minDistance) result.pop();
  }
  return result;
}

function dedupeMeshPoints(points, precision = 1000) {
  const seen = new Set();
  return points.filter(point => {
    const key = `${Math.round(point.x * precision)},${Math.round(point.y * precision)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAlphaMaskFromLayer(layer, options) {
  const image = getLayerRasterImage(layer);
  if (!image) return null;
  const sourceWidth = image.naturalWidth || image.width || layer.width;
  const sourceHeight = image.naturalHeight || image.height || layer.height;
  const maxSampleSize = Math.max(64, options.maxSampleSize || 512);
  const scale = Math.min(1, maxSampleSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(2, Math.round(sourceWidth * scale));
  const height = Math.max(2, Math.round(sourceHeight * scale));
  const tempCanvas = createCanvasForImageRead(width, height);
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  tempCtx.clearRect(0, 0, width, height);
  tempCtx.drawImage(image, 0, 0, width, height);
  const imageData = tempCtx.getImageData(0, 0, width, height);
  const threshold = options.alphaThreshold ?? 10;
  const mask = new Uint8Array(width * height);
  for (let i = 0, pixel = 0; i < imageData.data.length; i += 4, pixel++) {
    mask[pixel] = imageData.data[i + 3] >= threshold ? 1 : 0;
  }
  return { mask, width, height, scaleX: layer.width / width, scaleY: layer.height / height };
}

function traceAlphaContours(alphaData) {
  const { mask, width, height } = alphaData;
  const edgesByStart = new Map();
  const addEdge = (x1, y1, x2, y2) => {
    const key = contourKey(x1, y1);
    if (!edgesByStart.has(key)) edgesByStart.set(key, []);
    edgesByStart.get(key).push(contourKey(x2, y2));
  };
  const isOpaque = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  // Boundary edges are emitted with a consistent winding around opaque pixels.
  // Chaining those edges produces ordered loops instead of an unordered cloud.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isOpaque(x, y)) continue;
      if (!isOpaque(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!isOpaque(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!isOpaque(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!isOpaque(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const loops = [];
  while (edgesByStart.size > 0) {
    const startKey = edgesByStart.keys().next().value;
    let currentKey = startKey;
    const loop = [];
    let guard = 0;
    while (currentKey && guard++ < width * height * 8) {
      loop.push(parseContourKey(currentKey));
      const nextList = edgesByStart.get(currentKey);
      if (!nextList || nextList.length === 0) break;
      const nextKey = nextList.shift();
      if (nextList.length === 0) edgesByStart.delete(currentKey);
      currentKey = nextKey;
      if (currentKey === startKey) break;
    }
    const cleaned = removeNearDuplicatePoints(loop, 0.001);
    if (cleaned.length >= 3 && Math.abs(polygonSignedArea(cleaned)) > 1) loops.push(cleaned);
  }
  return loops.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)));
}

function sampleContourAdaptive(points, targetCount, curvatureWeight) {
  if (!points || points.length <= targetCount) return [...points];
  const weights = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const inAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const outAngle = Math.atan2(next.y - curr.y, next.x - curr.x);
    let turn = Math.abs(outAngle - inAngle);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    const segmentLength = Math.hypot(next.x - curr.x, next.y - curr.y);
    const weight = Math.max(0.0001, segmentLength * (1 + curvatureWeight * (turn / Math.PI)));
    total += weight;
    weights.push({ index: i, cumulative: total });
  }

  // We sample along cumulative curvature-weighted length, so corners naturally
  // receive more vertices while long straight spans are represented sparsely.
  const sampled = [];
  for (let s = 0; s < targetCount; s++) {
    const t = (s / targetCount) * total;
    const entry = weights.find(item => item.cumulative >= t) || weights[weights.length - 1];
    const prevCumulative = entry.index > 0 ? weights[entry.index - 1].cumulative : 0;
    const localRatio = clamp((t - prevCumulative) / Math.max(0.0001, entry.cumulative - prevCumulative), 0, 1);
    const a = points[entry.index];
    const b = points[(entry.index + 1) % points.length];
    sampled.push({ x: a.x + (b.x - a.x) * localRatio, y: a.y + (b.y - a.y) * localRatio });
  }
  return removeNearDuplicatePoints(sampled, 0.25);
}

function getInteriorTargetCount(layer, density, contourCount) {
  if (density === 'low') return Math.round(contourCount * 0.5);
  if (density === 'medium') return Math.round(contourCount * 1.25);
  if (density === 'high') return Math.round(contourCount * 2.5);
  const area = Math.max(1, layer.width * layer.height);
  return clamp(Math.round(area / 12000), Math.round(contourCount * 0.35), Math.round(contourCount * 1.8));
}

function generateInteriorPointsForPolygon(layer, outer, holes, targetCount) {
  if (targetCount <= 0) return [];
  const minX = Math.max(0, Math.min(...outer.map(point => point.x)));
  const maxX = Math.min(layer.width, Math.max(...outer.map(point => point.x)));
  const minY = Math.max(0, Math.min(...outer.map(point => point.y)));
  const maxY = Math.min(layer.height, Math.max(...outer.map(point => point.y)));
  const area = Math.max(1, (maxX - minX) * (maxY - minY));
  const step = Math.max(8, Math.sqrt(area / Math.max(1, targetCount)));
  const points = [];

  // Lightweight grid sampling with a deterministic offset. It behaves like a
  // simple poisson-ish distribution without running an expensive rejection loop.
  for (let y = minY + step * 0.5; y < maxY && points.length < targetCount; y += step) {
    const rowOffset = (Math.floor(y / step) % 2) * step * 0.37;
    for (let x = minX + step * 0.5 + rowOffset; x < maxX && points.length < targetCount; x += step) {
      const point = { x, y };
      if (!pointInPolygon(point, outer)) continue;
      if (holes.some(hole => pointInPolygon(point, hole))) continue;
      points.push(point);
    }
  }
  return points;
}

function circumcircleContains(triangle, point, vertices) {
  const a = vertices[triangle[0]];
  const b = vertices[triangle[1]];
  const c = vertices[triangle[2]];
  const ax = a.x - point.x;
  const ay = a.y - point.y;
  const bx = b.x - point.x;
  const by = b.y - point.y;
  const cx = c.x - point.x;
  const cy = c.y - point.y;
  const det = (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  const orientation = polygonSignedArea([a, b, c]);
  return orientation > 0 ? det > 0.000001 : det < -0.000001;
}

function createDelaunayTriangles(points) {
  if (points.length < 3) return [];
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const delta = Math.max(maxX - minX, maxY - minY, 1);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const vertices = [
    ...points,
    { x: midX - delta * 20, y: midY - delta * 20 },
    { x: midX, y: midY + delta * 20 },
    { x: midX + delta * 20, y: midY - delta * 20 }
  ];
  const superStart = points.length;
  let triangles = [[superStart, superStart + 1, superStart + 2]];

  points.forEach((point, pointIndex) => {
    const badTriangles = triangles.filter(triangle => circumcircleContains(triangle, point, vertices));
    const edgeCount = new Map();
    badTriangles.forEach(triangle => {
      [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]].forEach(edge => {
        const sorted = edge[0] < edge[1] ? edge : [edge[1], edge[0]];
        const key = `${sorted[0]},${sorted[1]}`;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      });
    });
    triangles = triangles.filter(triangle => !badTriangles.includes(triangle));
    edgeCount.forEach((count, key) => {
      if (count !== 1) return;
      const edge = key.split(',').map(Number);
      triangles.push([edge[0], edge[1], pointIndex]);
    });
  });

  return triangles.filter(triangle => triangle.every(index => index < points.length));
}

function triangleInsideShape(triangle, vertices, outer, holes) {
  const a = vertices[triangle[0]];
  const b = vertices[triangle[1]];
  const c = vertices[triangle[2]];
  const samples = [
    { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 },
    { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 },
    { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 }
  ];
  return samples.every(point => pointInPolygon(point, outer) && !holes.some(hole => pointInPolygon(point, hole)));
}

function triangleInsideMultiShape(triangle, vertices, outers, holes) {
  const a = vertices[triangle[0]];
  const b = vertices[triangle[1]];
  const c = vertices[triangle[2]];
  if (!a || !b || !c) return false;
  const samples = [
    { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 },
    { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 },
    { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 }
  ];
  return samples.every(point => (
    outers.some(outer => pointInPolygon(point, outer)) &&
    !holes.some(hole => pointInPolygon(point, hole))
  ));
}

function estimateLoopLength(loop) {
  if (!Array.isArray(loop) || loop.length < 2) return 0;
  let length = 0;
  for (let i = 0; i < loop.length; i++) {
    const current = loop[i];
    const next = loop[(i + 1) % loop.length];
    length += Math.hypot((next.x || 0) - (current.x || 0), (next.y || 0) - (current.y || 0));
  }
  return length;
}

function pointInTriangle(point, a, b, c, epsilon = 0.0001) {
  const bary = getBarycentricCoordinates(point, a, b, c);
  return !!(bary && bary[0] >= -epsilon && bary[1] >= -epsilon && bary[2] >= -epsilon);
}

function findContainingMeshTriangle(point, vertices, indices) {
  if (!vertices || !indices) return null;
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    const a = vertices[i0];
    const b = vertices[i1];
    const c = vertices[i2];
    if (!a || !b || !c) continue;
    const bary = getBarycentricCoordinates(point, a, b, c);
    if (bary && bary[0] >= -0.0001 && bary[1] >= -0.0001 && bary[2] >= -0.0001) {
      return { indices: [i0, i1, i2], barycentric: bary, triangleOffset: i };
    }
  }
  return null;
}

function pointInsideMeshDomain(point, vertices, indices) {
  return !!findContainingMeshTriangle(point, vertices, indices);
}

function appendOrientedTriangle(target, vertices, i0, i1, i2, preferredOrientation = null) {
  const a = vertices[i0];
  const b = vertices[i1];
  const c = vertices[i2];
  if (!a || !b || !c) return;
  const orientation = polygonSignedArea([a, b, c]);
  if (preferredOrientation === 'cw') target.push(i0, i2, i1);
  else if (preferredOrientation === 'ccw') target.push(i0, i1, i2);
  else if (orientation < 0) target.push(i0, i2, i1);
  else target.push(i0, i1, i2);
}

function insertVertexIntoMeshTopology(vertices, indices, point) {
  const baseVertices = cloneVertices(vertices || []);
  const baseIndices = [...(indices || [])];
  if (!baseVertices.length || baseIndices.length < 3 || !pointInsideMeshDomain(point, baseVertices, baseIndices)) return null;
  const containingTriangle = findContainingMeshTriangle(point, baseVertices, baseIndices);
  if (!containingTriangle || containingTriangle.triangleOffset === undefined) return null;
  const newVertexIndex = baseVertices.length;
  const nextVertices = [...baseVertices, { x: point.x, y: point.y }];
  const baseOrientation = polygonSignedArea(containingTriangle.indices.map(index => baseVertices[index]));
  const preferredOrientation = baseOrientation < 0 ? 'cw' : 'ccw';
  const nextIndices = [];
  for (let i = 0; i < baseIndices.length; i += 3) {
    if (i === containingTriangle.triangleOffset) {
      const [i0, i1, i2] = containingTriangle.indices;
      appendOrientedTriangle(nextIndices, nextVertices, i0, i1, newVertexIndex, preferredOrientation);
      appendOrientedTriangle(nextIndices, nextVertices, i1, i2, newVertexIndex, preferredOrientation);
      appendOrientedTriangle(nextIndices, nextVertices, i2, i0, newVertexIndex, preferredOrientation);
      continue;
    }
    nextIndices.push(baseIndices[i], baseIndices[i + 1], baseIndices[i + 2]);
  }
  return { vertices: nextVertices, indices: nextIndices, newVertexIndex, containingTriangle };
}

function triangulateSimplePolygon(outer) {
  if (!Array.isArray(outer) || outer.length < 3) return null;
  const polygon = [...outer];
  const vertexOrder = polygon.map((_, index) => index);
  const ccw = polygonSignedArea(polygon) >= 0;
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const pointInTriangleStrict = (point, a, b, c) => pointInTriangle(point, a, b, c, 0.000001);
  const indices = [];
  let guard = 0;
  while (vertexOrder.length > 3 && guard++ < polygon.length * polygon.length) {
    let earFound = false;
    for (let i = 0; i < vertexOrder.length; i++) {
      const prevIndex = vertexOrder[(i - 1 + vertexOrder.length) % vertexOrder.length];
      const currentIndex = vertexOrder[i];
      const nextIndex = vertexOrder[(i + 1) % vertexOrder.length];
      const prev = polygon[prevIndex];
      const current = polygon[currentIndex];
      const next = polygon[nextIndex];
      const turn = cross(prev, current, next);
      if ((ccw && turn <= 0.000001) || (!ccw && turn >= -0.000001)) continue;
      let containsOther = false;
      for (let j = 0; j < vertexOrder.length; j++) {
        const candidateIndex = vertexOrder[j];
        if (candidateIndex === prevIndex || candidateIndex === currentIndex || candidateIndex === nextIndex) continue;
        if (pointInTriangleStrict(polygon[candidateIndex], prev, current, next)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;
      appendOrientedTriangle(indices, polygon, prevIndex, currentIndex, nextIndex, ccw ? 'ccw' : 'cw');
      vertexOrder.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) return null;
  }
  if (vertexOrder.length === 3) {
    appendOrientedTriangle(indices, polygon, vertexOrder[0], vertexOrder[1], vertexOrder[2], ccw ? 'ccw' : 'cw');
  }
  return indices.length ? { vertices: polygon, indices } : null;
}
function triangleInsideMeshDomain(triangle, newVertices, oldVertices, oldIndices) {
  const a = newVertices[triangle[0]];
  const b = newVertices[triangle[1]];
  const c = newVertices[triangle[2]];
  if (!a || !b || !c) return false;
  const samples = [
    { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 },
    { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 },
    { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 }
  ];
  return samples.every(point => pointInsideMeshDomain(point, oldVertices, oldIndices));
}

function triangulateContoursWithEarcut(outer, holes) {
  if (typeof earcut !== 'function') return null;
  const contourVertices = [...outer, ...holes.flat()];
  const flat = [];
  contourVertices.forEach(point => {
    flat.push(point.x, point.y);
  });
  const holeIndices = [];
  let cursor = outer.length;
  holes.forEach(hole => {
    holeIndices.push(cursor);
    cursor += hole.length;
  });
  const indices = earcut(flat, holeIndices, 2);
  return indices && indices.length ? { vertices: contourVertices, indices } : null;
}

function createContourMeshForLayer(layer, options = {}) {
  ensureLayerIdentity(layer);
  const config = Object.assign({
    alphaThreshold: 10,
    contourPoints: 48,
    interiorDensity: 'auto',
    curvatureWeight: 2.0,
    ignoreHoles: true,
    maxSampleSize: 512
  }, options);

  const alphaData = buildAlphaMaskFromLayer(layer, config);
  if (!alphaData) return false;
  const loops = traceAlphaContours(alphaData);
  if (!loops.length) return false;

  const scaleLoopToLayer = loop => loop.map(point => ({
    x: clamp(point.x * alphaData.scaleX, 0, layer.width),
    y: clamp(point.y * alphaData.scaleY, 0, layer.height)
  }));

  const positiveLoops = loops.filter(loop => polygonSignedArea(loop) > 0);
  const outerSources = positiveLoops.length ? positiveLoops : [loops[0]];
  const regions = [];
  let totalArea = 0;

  outerSources.forEach(outerSource => {
    let outer = scaleLoopToLayer(outerSource);
    if (polygonSignedArea(outer) < 0) outer.reverse();
    outer = sampleContourAdaptive(outer, Math.max(8, config.contourPoints | 0), config.curvatureWeight);
    outer = removeNearDuplicatePoints(outer, 0.2);
    if (polygonSignedArea(outer) < 0) outer.reverse();
    if (outer.length < 3) return;

    const holes = [];
    if (!config.ignoreHoles) {
      loops.forEach(loop => {
        if (loop === outerSource || polygonSignedArea(loop) >= 0) return;
        let hole = scaleLoopToLayer(loop);
        if (!hole.length || !pointInPolygon(hole[0], outer)) return;
        hole = sampleContourAdaptive(hole, Math.max(8, Math.round((config.contourPoints || 48) * 0.35)), config.curvatureWeight);
        hole = removeNearDuplicatePoints(hole, 0.2);
        if (polygonSignedArea(hole) > 0) hole.reverse();
        if (hole.length >= 3) holes.push(hole);
      });
    }

    let topology = null;
    if (holes.length) {
      const fallback = triangulateContoursWithEarcut(outer, holes);
      if (fallback) topology = { vertices: fallback.vertices.map(point => ({ x: point.x, y: point.y })), indices: [...fallback.indices] };
    }
    if (!topology) {
      const simple = triangulateSimplePolygon(outer);
      if (!simple) return;
      topology = { vertices: simple.vertices.map(point => ({ x: point.x, y: point.y })), indices: [...simple.indices] };
    }

    const area = Math.max(1, Math.abs(polygonSignedArea(outer)));
    totalArea += area;
    regions.push({ outer, holes, topology, area });
  });

  if (!regions.length) return false;

  const totalInteriorTarget = getInteriorTargetCount(layer, config.interiorDensity, regions.reduce((sum, region) => sum + region.outer.length, 0));
  let remainingInteriorTarget = totalInteriorTarget;

  regions.forEach((region, regionIndex) => {
    const isLast = regionIndex === regions.length - 1;
    const regionTarget = isLast
      ? Math.max(0, remainingInteriorTarget)
      : Math.max(0, Math.round(totalInteriorTarget * (region.area / Math.max(1, totalArea))));
    remainingInteriorTarget = Math.max(0, remainingInteriorTarget - regionTarget);
    if (regionTarget <= 0) return;
    const interiorPoints = generateInteriorPointsForPolygon(layer, region.outer, region.holes, regionTarget);
    interiorPoints.forEach(point => {
      const inserted = insertVertexIntoMeshTopology(region.topology.vertices, region.topology.indices, point);
      if (inserted) {
        region.topology.vertices = inserted.vertices;
        region.topology.indices = inserted.indices;
      }
    });
  });

  const mergedVertices = [];
  const mergedIndices = [];
  regions.forEach(region => {
    const offset = mergedVertices.length;
    region.topology.vertices.forEach(vertex => mergedVertices.push({ x: vertex.x, y: vertex.y }));
    region.topology.indices.forEach(index => mergedIndices.push(index + offset));
  });

  const uvs = mergedVertices.map(vertex => ({
    u: clamp(vertex.x / Math.max(1, layer.width), 0, 1),
    v: clamp(vertex.y / Math.max(1, layer.height), 0, 1)
  }));

  layer.mesh = {
    vertices: cloneVertices(mergedVertices),
    bindVertices: cloneVertices(mergedVertices),
    runtimeVertices: cloneVertices(mergedVertices),
    uvs,
    indices: mergedIndices,
    origin: 'top-left',
    uvSpace: 'normalized'
  };
  layer.meshPins = [];
  layer.role = 'deformable';
  return true;
}

function debugDrawMesh(drawCtx, layer) {
  if (!drawCtx || !layer || !layer.mesh) return;
  const vertices = getRenderMeshVertices(layer);
  const indices = layer.mesh.indices || [];
  drawCtx.save();
  if (Number.isFinite(layer.center_x) && Number.isFinite(layer.center_y)) {
    drawCtx.translate(layer.center_x, layer.center_y);
    drawCtx.rotate(layer.rotation || 0);
  } else {
    drawCtx.translate(layer.x || 0, layer.y || 0);
  }
  drawCtx.strokeStyle = MESH_THEME.contourStroke;
  drawCtx.fillStyle = MESH_THEME.normalVertexFill;
  drawCtx.lineWidth = typeof view !== 'undefined' ? 1 / view.scale : 1;
  for (let i = 0; i < indices.length; i += 3) {
    const a = Number.isFinite(layer.center_x) ? meshPointToLayerLocal(layer, vertices[indices[i]]) : vertices[indices[i]];
    const b = Number.isFinite(layer.center_x) ? meshPointToLayerLocal(layer, vertices[indices[i + 1]]) : vertices[indices[i + 1]];
    const c = Number.isFinite(layer.center_x) ? meshPointToLayerLocal(layer, vertices[indices[i + 2]]) : vertices[indices[i + 2]];
    if (!a || !b || !c) continue;
    drawCtx.beginPath();
    drawCtx.moveTo(a.x, a.y);
    drawCtx.lineTo(b.x, b.y);
    drawCtx.lineTo(c.x, c.y);
    drawCtx.closePath();
    drawCtx.stroke();
  }
  vertices.forEach(vertex => {
    const local = Number.isFinite(layer.center_x) ? meshPointToLayerLocal(layer, vertex) : vertex;
    drawCtx.beginPath();
    drawCtx.arc(local.x, local.y, typeof view !== 'undefined' ? 2.5 / view.scale : 2.5, 0, Math.PI * 2);
    drawCtx.fill();
  });
  drawCtx.restore();
}

function getLayerCenterX(layer) {
  return Number.isFinite(layer.center_x) ? layer.center_x : (Number.isFinite(layer.x) ? layer.x : 0);
}

function getLayerCenterY(layer) {
  return Number.isFinite(layer.center_y) ? layer.center_y : (Number.isFinite(layer.y) ? layer.y : 0);
}

function getLayerWorldTransform(layer) {
  return {
    x: getLayerCenterX(layer),
    y: getLayerCenterY(layer),
    rotation: layer.rotation || 0
  };
}

function getBoneWorldTransform(bone) {
  return {
    x: bone.x,
    y: bone.y,
    rotation: Math.atan2(bone.ey - bone.y, bone.ex - bone.x)
  };
}

function meshPointToWorld(layer, point, layerTransform = getLayerWorldTransform(layer)) {
  const local = meshPointToLayerLocal(layer, point);
  const cos = Math.cos(layerTransform.rotation || 0);
  const sin = Math.sin(layerTransform.rotation || 0);
  return {
    x: layerTransform.x + local.x * cos - local.y * sin,
    y: layerTransform.y + local.x * sin + local.y * cos
  };
}

function worldPointToMeshPoint(layer, worldX, worldY, layerTransform = getLayerWorldTransform(layer)) {
  const dx = worldX - layerTransform.x;
  const dy = worldY - layerTransform.y;
  const cos = Math.cos(-(layerTransform.rotation || 0));
  const sin = Math.sin(-(layerTransform.rotation || 0));
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return layerLocalToMeshPoint(layer, localX, localY);
}

function layerLocalPointToWorld(layer, localPoint, layerTransform = getLayerWorldTransform(layer)) {
  const cos = Math.cos(layerTransform.rotation || 0);
  const sin = Math.sin(layerTransform.rotation || 0);
  return {
    x: layerTransform.x + localPoint.x * cos - localPoint.y * sin,
    y: layerTransform.y + localPoint.x * sin + localPoint.y * cos
  };
}

function distancePointToSegment(point, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 0.000001) return Math.hypot(point.x - ax, point.y - ay);
  const t = clamp(((point.x - ax) * abx + (point.y - ay) * aby) / lengthSq, 0, 1);
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function getLayerDominantBoneId(layer) {
  if (layer.boneId !== undefined && layer.boneId !== null) return layer.boneId;
  if (layer.bone_id !== undefined && layer.bone_id !== null) return layer.bone_id;
  return null;
}

function normalizeInfluences(influences, minWeight, maxBonesPerVertex) {
  let total = influences.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return [];
  influences.forEach(item => { item.weight /= total; });
  let filtered = influences
    .filter(item => item.weight >= minWeight)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxBonesPerVertex);
  if (!filtered.length) {
    filtered = influences.sort((a, b) => b.weight - a.weight).slice(0, 1);
  }
  total = filtered.reduce((sum, item) => sum + item.weight, 0);
  filtered.forEach(item => { item.weight /= Math.max(total, 0.000001); });
  return filtered;
}

function bindAutoSkin(layer, boneList = bones) {
  if (!layer || !layer.mesh || !layer.mesh.skinWeights) return false;
  const relevantBoneIds = new Set();
  layer.mesh.skinWeights.forEach(vertexWeights => {
    (vertexWeights || []).forEach(influence => relevantBoneIds.add(influence.boneId));
  });
  const transforms = {};
  boneList.forEach(bone => {
    if (!relevantBoneIds.has(bone.id)) return;
    transforms[bone.id] = getBoneWorldTransform(bone);
  });
  layer.mesh.skinBindTransforms = transforms;
  layer.mesh.skinBindLayerTransform = getLayerWorldTransform(layer);
  return true;
}

function autoSkinLayerToBones(layer, boneList = bones, options = {}) {
  if (!layer || !layer.mesh || !layer.mesh.vertices || !boneList || boneList.length === 0) return false;
  const config = Object.assign({
    maxRadius: 400,
    falloffExp: 2,
    minWeight: 0.05,
    maxBonesPerVertex: 4,
    dominantBoneBoost: 1.5
  }, options);
  const vertices = layer.mesh.bindVertices || layer.mesh.vertices;
  const dominantBoneId = getLayerDominantBoneId(layer);
  const layerTransform = getLayerWorldTransform(layer);
  const epsilon = 0.0001;

  layer.mesh.skinWeights = vertices.map(vertex => {
    const world = meshPointToWorld(layer, vertex, layerTransform);
    const influences = [];
    boneList.forEach(bone => {
      const distance = distancePointToSegment(world, bone.x, bone.y, bone.ex, bone.ey);
      if (distance > config.maxRadius) return;
      let weight = 1 / (Math.pow(Math.max(distance, epsilon), config.falloffExp) + epsilon);
      if (dominantBoneId !== null && bone.id === dominantBoneId) {
        weight *= config.dominantBoneBoost;
      }
      influences.push({ boneId: bone.id, weight });
    });

    return normalizeInfluences(influences, config.minWeight, Math.max(1, config.maxBonesPerVertex | 0));
  });

  bindAutoSkin(layer, boneList);
  return true;
}

function applyAutoSkinAtFrame(layer, boneList = bones) {
  const mesh = layer && layer.mesh;
  if (!mesh || !mesh.skinWeights || !mesh.skinBindTransforms || !mesh.bindVertices) return false;
  const bindVertices = mesh.bindVertices;
  const runtimeVertices = mesh._skinRuntimeVertices && mesh._skinRuntimeVertices.length === bindVertices.length
    ? mesh._skinRuntimeVertices
    : bindVertices.map(vertex => ({ x: vertex.x, y: vertex.y }));
  mesh._skinRuntimeVertices = runtimeVertices;

  const bindLayer = mesh.skinBindLayerTransform || getLayerWorldTransform(layer);
  const currentLayer = getLayerWorldTransform(layer);
  const currentBoneTransforms = mesh._skinCurrentBoneTransforms || {};
  mesh._skinCurrentBoneTransforms = currentBoneTransforms;
  const activeBoneIds = new Set(boneList.map(bone => String(bone.id)));
  Object.keys(currentBoneTransforms).forEach(boneId => {
    if (!mesh.skinBindTransforms[boneId] || !activeBoneIds.has(boneId)) delete currentBoneTransforms[boneId];
  });
  boneList.forEach(bone => {
    if (!mesh.skinBindTransforms[bone.id]) return;
    if (!currentBoneTransforms[bone.id]) currentBoneTransforms[bone.id] = { x: 0, y: 0, rotation: 0 };
    currentBoneTransforms[bone.id].x = bone.x;
    currentBoneTransforms[bone.id].y = bone.y;
    currentBoneTransforms[bone.id].rotation = Math.atan2(bone.ey - bone.y, bone.ex - bone.x);
  });
  const bindLayerCos = Math.cos(bindLayer.rotation || 0);
  const bindLayerSin = Math.sin(bindLayer.rotation || 0);
  const currentLayerInvCos = Math.cos(-(currentLayer.rotation || 0));
  const currentLayerInvSin = Math.sin(-(currentLayer.rotation || 0));

  for (let i = 0; i < bindVertices.length; i++) {
    const bindVertex = bindVertices[i];
    const bindLocal = meshPointToLayerLocal(layer, bindVertex);
    const bindWorldX = bindLayer.x + bindLocal.x * bindLayerCos - bindLocal.y * bindLayerSin;
    const bindWorldY = bindLayer.y + bindLocal.x * bindLayerSin + bindLocal.y * bindLayerCos;
    const influences = mesh.skinWeights[i] || [];
    let worldX = 0;
    let worldY = 0;
    let totalWeight = 0;

    for (let j = 0; j < influences.length; j++) {
      const influence = influences[j];
      const currentBone = currentBoneTransforms[influence.boneId];
      const bindBone = mesh.skinBindTransforms[influence.boneId];
      if (!currentBone || !bindBone) continue;
      const deltaRotation = currentBone.rotation - bindBone.rotation;
      const cos = Math.cos(deltaRotation);
      const sin = Math.sin(deltaRotation);
      const relX = bindWorldX - bindBone.x;
      const relY = bindWorldY - bindBone.y;
      const transformedX = currentBone.x + relX * cos - relY * sin;
      const transformedY = currentBone.y + relX * sin + relY * cos;
      worldX += transformedX * influence.weight;
      worldY += transformedY * influence.weight;
      totalWeight += influence.weight;
    }

    if (totalWeight <= 0) {
      runtimeVertices[i].x = bindVertex.x;
      runtimeVertices[i].y = bindVertex.y;
      continue;
    }
    if (Math.abs(totalWeight - 1) > 0.0001) {
      worldX /= totalWeight;
      worldY /= totalWeight;
    }
    const dx = worldX - currentLayer.x;
    const dy = worldY - currentLayer.y;
    const localX = dx * currentLayerInvCos - dy * currentLayerInvSin;
    const localY = dx * currentLayerInvSin + dy * currentLayerInvCos;
    const meshPoint = layerLocalToMeshPoint(layer, localX, localY);
    runtimeVertices[i].x = meshPoint.x;
    runtimeVertices[i].y = meshPoint.y;
  }

  mesh.runtimeVertices = runtimeVertices;
  mesh.vertices = cloneVertices(runtimeVertices);
  return true;
}

function parseCssColorToRgb(color) {
  const named = { red: '#ff0000', green: '#00ff00', blue: '#0000ff', white: '#ffffff', black: '#000000' };
  let value = named[color] || color || '#44dddd';
  if (value[0] === '#') {
    if (value.length === 4) value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    const number = Number.parseInt(value.slice(1, 7), 16);
    if (Number.isFinite(number)) return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
  }
  return { r: 68, g: 221, b: 221 };
}

function mixRgb(a, b, ratio) {
  const t = clamp(ratio, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

function rgbToCss(color, alpha = 1) {
  return `rgba(${color.r},${color.g},${color.b},${clamp(alpha, 0, 1)})`;
}

function weightToThermalColor(t) {
  const cold = { r: 0x3B, g: 0x8B, b: 0xD4 };
  const mid = { r: 0xD8, g: 0xD8, b: 0x32 };
  const hot = { r: 0xE2, g: 0x4B, b: 0x4A };
  const value = clamp(t, 0, 1);
  return value < 0.5
    ? mixRgb(cold, mid, value / 0.5)
    : mixRgb(mid, hot, (value - 0.5) / 0.5);
}

function getWeightForBone(vertexWeights, boneId) {
  if (!vertexWeights || boneId === null || boneId === undefined) return 0;
  const found = vertexWeights.find(item => String(item.boneId) === String(boneId));
  return found ? found.weight : 0;
}

function getDominantInfluence(vertexWeights) {
  if (!vertexWeights || vertexWeights.length === 0) return null;
  return vertexWeights.reduce((best, item) => item.weight > best.weight ? item : best, vertexWeights[0]);
}

function drawTriangleHeatSample(drawCtx, a, b, c, color, alpha) {
  drawCtx.beginPath();
  drawCtx.moveTo(a.x, a.y);
  drawCtx.lineTo(b.x, b.y);
  drawCtx.lineTo(c.x, c.y);
  drawCtx.closePath();
  drawCtx.fillStyle = rgbToCss(color, alpha);
  drawCtx.fill();
}

function drawSelectedWeightTriangle(drawCtx, p0, p1, p2, w0, w1, w2, opacity, subdivisions = 4) {
  // Canvas 2D has no native barycentric fragment shader, so this subdivides
  // the triangle into small cells and colors each cell by sampled weights.
  for (let row = 0; row < subdivisions; row++) {
    for (let col = 0; col < subdivisions - row; col++) {
      const a0 = row / subdivisions;
      const b0 = col / subdivisions;
      const a1 = (row + 1) / subdivisions;
      const b1 = col / subdivisions;
      const a2 = row / subdivisions;
      const b2 = (col + 1) / subdivisions;
      const first = barycentricPoint(p0, p1, p2, a0, b0);
      const second = barycentricPoint(p0, p1, p2, a1, b1);
      const third = barycentricPoint(p0, p1, p2, a2, b2);
      const weight = barycentricWeight(w0, w1, w2, (a0 + a1 + a2) / 3, (b0 + b1 + b2) / 3);
      drawTriangleHeatSample(drawCtx, first, second, third, weightToThermalColor(weight), opacity);

      if (col + row >= subdivisions - 1) continue;
      const a3 = (row + 1) / subdivisions;
      const b3 = (col + 1) / subdivisions;
      const fourth = barycentricPoint(p0, p1, p2, a3, b3);
      const weight2 = barycentricWeight(w0, w1, w2, (a1 + a2 + a3) / 3, (b1 + b2 + b3) / 3);
      drawTriangleHeatSample(drawCtx, second, fourth, third, weightToThermalColor(weight2), opacity);
    }
  }
}

function barycentricPoint(p0, p1, p2, a, b) {
  const c = 1 - a - b;
  return {
    x: p0.x * c + p1.x * b + p2.x * a,
    y: p0.y * c + p1.y * b + p2.y * a
  };
}

function barycentricWeight(w0, w1, w2, a, b) {
  const c = 1 - a - b;
  return clamp(w0 * c + w1 * b + w2 * a, 0, 1);
}

function drawSkinWeightHeatmap(drawCtx, layer, boneList = bones, options = {}) {
  if (!drawCtx || !layer || !layer.mesh || !layer.mesh.skinWeights || !layer.mesh.indices) return;
  const config = Object.assign({
    mode: 'dominant',
    selectedBoneId: null,
    opacity: 0.65,
    showVertexDots: true,
    vertexDotRadius: 4
  }, options);
  const vertices = layer.mesh.runtimeVertices || layer.mesh.bindVertices || layer.mesh.vertices || [];
  const weights = layer.mesh.skinWeights || [];
  const boneById = new Map();
  boneList.forEach(bone => boneById.set(bone.id, bone));
  const scale = typeof view !== 'undefined' && view.scale ? view.scale : 1;

  drawCtx.save();
  drawCtx.globalCompositeOperation = 'source-over';
  const indices = layer.mesh.indices;
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    const p0 = meshPointToLayerLocal(layer, vertices[i0]);
    const p1 = meshPointToLayerLocal(layer, vertices[i1]);
    const p2 = meshPointToLayerLocal(layer, vertices[i2]);
    if (!p0 || !p1 || !p2) continue;

    if (config.mode === 'selected') {
      const w0 = getWeightForBone(weights[i0], config.selectedBoneId);
      const w1 = getWeightForBone(weights[i1], config.selectedBoneId);
      const w2 = getWeightForBone(weights[i2], config.selectedBoneId);
      drawSelectedWeightTriangle(drawCtx, p0, p1, p2, w0, w1, w2, config.opacity);
      continue;
    }

    const dominantByBone = new Map();
    [weights[i0], weights[i1], weights[i2]].forEach(vertexWeights => {
      (vertexWeights || []).forEach(influence => {
        dominantByBone.set(influence.boneId, (dominantByBone.get(influence.boneId) || 0) + influence.weight / 3);
      });
    });
    let dominantBoneId = null;
    let dominantWeight = 0;
    dominantByBone.forEach((weight, boneId) => {
      if (weight > dominantWeight) {
        dominantWeight = weight;
        dominantBoneId = boneId;
      }
    });
    const bone = boneById.get(dominantBoneId);
    const color = parseCssColorToRgb(bone ? bone.color : '#44dddd');
    drawTriangleHeatSample(drawCtx, p0, p1, p2, color, config.opacity * clamp(dominantWeight, 0.05, 1));
  }

  if (config.showVertexDots) {
    vertices.forEach((vertex, index) => {
      const local = meshPointToLayerLocal(layer, vertex);
      if (!local) return;
      const vertexWeights = weights[index] || [];
      const dominant = config.mode === 'selected'
        ? { boneId: config.selectedBoneId, weight: getWeightForBone(vertexWeights, config.selectedBoneId) }
        : getDominantInfluence(vertexWeights);
      if (!dominant) return;
      const bone = boneById.get(dominant.boneId);
      const color = config.mode === 'selected'
        ? weightToThermalColor(dominant.weight)
        : parseCssColorToRgb(bone ? bone.color : '#44dddd');
      drawCtx.beginPath();
      drawCtx.arc(local.x, local.y, (config.vertexDotRadius || 4) / scale, 0, Math.PI * 2);
      drawCtx.fillStyle = rgbToCss(color, clamp(0.35 + dominant.weight * 0.65, 0.35, 1));
      drawCtx.fill();
      drawCtx.strokeStyle = 'rgba(255,255,255,0.75)';
      drawCtx.lineWidth = 0.75 / scale;
      drawCtx.stroke();
    });
  }

  drawCtx.restore();
}

function toggleHeatmap(mode = null, selectedBoneId = null) {
  if (!projectState.heatmap) {
    projectState.heatmap = { enabled: false, mode: 'dominant', selectedBoneId: null, opacity: 0.65 };
  }
  const previousMode = projectState.heatmap.mode;
  const previousBoneId = projectState.heatmap.selectedBoneId;
  if (mode) projectState.heatmap.mode = mode;
  if (selectedBoneId !== undefined) projectState.heatmap.selectedBoneId = selectedBoneId;
  if (projectState.heatmap.mode === 'selected' && (projectState.heatmap.selectedBoneId === null || projectState.heatmap.selectedBoneId === undefined)) {
    projectState.heatmap.selectedBoneId = resolveWeightBrushTargetBoneId(getLayerByIndex(selectedLayerIndex));
  }
  const layer = getLayerByIndex(selectedLayerIndex);
  if (layer && layer.mesh && !layer.mesh.skinWeights) ensureLayerSkinWeights(layer);
  const changedTarget = previousMode !== projectState.heatmap.mode || previousBoneId !== projectState.heatmap.selectedBoneId;
  projectState.heatmap.enabled = changedTarget ? true : !projectState.heatmap.enabled;
  render();
}

function setWeightBrushRadius(value) {
  projectState.weightBrush.radius = Math.max(1, Number(value) || 1);
  render();
}

function setWeightBrushStrength(value) {
  projectState.weightBrush.strength = clamp(Number(value) || 0, 0, 1);
}

function setWeightBrushMode(value) {
  projectState.weightBrush.mode = ['add', 'subtract', 'smooth'].includes(value) ? value : 'add';
}

function setWeightBrushFalloff(value) {
  projectState.weightBrush.falloff = ['linear', 'smooth', 'constant'].includes(value) ? value : 'linear';
}

function resolveWeightBrushTargetBoneId(layer = null) {
  if (selectedId !== null && selectedId !== undefined) return selectedId;
  if (projectState.weightBrush && projectState.weightBrush.targetBoneId !== null && projectState.weightBrush.targetBoneId !== undefined) {
    return projectState.weightBrush.targetBoneId;
  }
  if (layer) {
    const layerBoneId = getLayerDominantBoneId(layer);
    if (layerBoneId !== null && layerBoneId !== undefined) return layerBoneId;
  }
  return bones.length ? bones[0].id : null;
}

function ensureLayerSkinWeights(layer) {
  if (!layer || !layer.mesh) return false;
  if (layer.mesh.skinWeights && layer.mesh.skinWeights.length === (layer.mesh.bindVertices || layer.mesh.vertices || []).length) return true;
  if (typeof autoSkinLayerToBones === 'function' && bones.length) {
    const targetBoneId = resolveWeightBrushTargetBoneId(layer);
    const previousBoneId = layer.bone_id;
    if ((layer.bone_id === null || layer.bone_id === undefined) && targetBoneId !== null && targetBoneId !== undefined) {
      layer.bone_id = targetBoneId;
    }
    const created = autoSkinLayerToBones(layer, bones, {
      maxRadius: 400,
      falloffExp: 2,
      minWeight: 0.01,
      maxBonesPerVertex: 4,
      dominantBoneBoost: 1.5
    });
    if (previousBoneId === null || previousBoneId === undefined) layer.bone_id = previousBoneId;
    if (created) {
      weightBrushWarnedMissingWeights = false;
      return true;
    }
  }
  const targetBoneId = resolveWeightBrushTargetBoneId(layer);
  if (targetBoneId === null || targetBoneId === undefined) return false;
  const vertices = layer.mesh.bindVertices || layer.mesh.vertices || [];
  layer.mesh.skinWeights = vertices.map(() => [{ boneId: targetBoneId, weight: 1 }]);
  bindAutoSkin(layer, bones);
  weightBrushWarnedMissingWeights = false;
  return true;
}

function useSelectedBoneForWeightBrush() {
  const layer = getLayerByIndex(selectedLayerIndex);
  projectState.weightBrush.targetBoneId = resolveWeightBrushTargetBoneId(layer);
  if (layer && layer.mesh) ensureLayerSkinWeights(layer);
  projectState.heatmap.selectedBoneId = projectState.weightBrush.targetBoneId;
  projectState.heatmap.mode = 'selected';
  projectState.heatmap.enabled = true;
  setTool('weightBrush');
  render();
}

function debugDrawSkinWeights(drawCtx, layer, boneList = bones) {
  if (!drawCtx || !layer || !layer.mesh || !layer.mesh.skinWeights) return;
  const vertices = getRenderMeshVertices(layer);
  const boneById = new Map();
  boneList.forEach(bone => boneById.set(bone.id, bone));
  drawCtx.save();
  if (Number.isFinite(layer.center_x) && Number.isFinite(layer.center_y)) {
    drawCtx.translate(layer.center_x, layer.center_y);
    drawCtx.rotate(layer.rotation || 0);
  } else {
    drawCtx.translate(layer.x || 0, layer.y || 0);
  }
  vertices.forEach((vertex, index) => {
    const weights = layer.mesh.skinWeights[index] || [];
    if (!weights.length) return;
    const dominant = weights.reduce((best, item) => item.weight > best.weight ? item : best, weights[0]);
    const bone = boneById.get(dominant.boneId);
    const color = parseCssColorToRgb(bone ? bone.color : '#44dddd');
    const local = Number.isFinite(layer.center_x) ? meshPointToLayerLocal(layer, vertex) : vertex;
    if (!local) return;
    drawCtx.beginPath();
    drawCtx.arc(local.x, local.y, typeof view !== 'undefined' ? 4 / view.scale : 4, 0, Math.PI * 2);
    drawCtx.fillStyle = `rgba(${color.r},${color.g},${color.b},${clamp(0.25 + dominant.weight * 0.75, 0.25, 1)})`;
    drawCtx.fill();
  });
  drawCtx.restore();
}

function buildVertexNeighbors(mesh) {
  if (!mesh || !mesh.indices) return {};
  const neighborSets = {};
  const addNeighbor = (a, b) => {
    if (!neighborSets[a]) neighborSets[a] = new Set();
    neighborSets[a].add(b);
  };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    addNeighbor(a, b);
    addNeighbor(a, c);
    addNeighbor(b, a);
    addNeighbor(b, c);
    addNeighbor(c, a);
    addNeighbor(c, b);
  }
  const neighbors = {};
  Object.keys(neighborSets).forEach(index => {
    neighbors[index] = Array.from(neighborSets[index]);
  });
  return neighbors;
}

function getVertexWeight(vertexWeights, boneId) {
  const entry = (vertexWeights || []).find(item => String(item.boneId) === String(boneId));
  return entry ? entry.weight : 0;
}

function setVertexWeight(vertexWeights, boneId, weight) {
  let entry = vertexWeights.find(item => String(item.boneId) === String(boneId));
  if (!entry && weight > 0) {
    entry = { boneId, weight: 0 };
    vertexWeights.push(entry);
  }
  if (entry) entry.weight = Math.max(0, weight);
}

function renormalizeWeights(vertexWeights, targetBoneId, minWeight = 0.01) {
  if (!vertexWeights) vertexWeights = [];
  let total = vertexWeights.reduce((sum, item) => sum + Math.max(0, item.weight || 0), 0);
  if (total <= 0) {
    vertexWeights.length = 0;
    vertexWeights.push({ boneId: targetBoneId, weight: 1 });
    return vertexWeights;
  }

  vertexWeights.forEach(item => { item.weight = Math.max(0, item.weight || 0) / total; });
  for (let i = vertexWeights.length - 1; i >= 0; i--) {
    if (vertexWeights[i].weight < minWeight) vertexWeights.splice(i, 1);
  }
  total = vertexWeights.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    vertexWeights.length = 0;
    vertexWeights.push({ boneId: targetBoneId, weight: 1 });
    return vertexWeights;
  }
  vertexWeights.forEach(item => { item.weight /= total; });
  return vertexWeights;
}

function getBrushFalloffFactor(distance, radius, falloff) {
  const ratio = clamp(distance / Math.max(radius, 0.0001), 0, 1);
  if (falloff === 'constant') return 1;
  if (falloff === 'smooth') return 1 - ratio * ratio;
  return 1 - ratio;
}

function paintWeightAtPoint(layer, worldX, worldY, options = {}) {
  if (!layer || !layer.mesh) return false;
  const mesh = layer.mesh;
  if (!mesh.skinWeights) {
    if (!ensureLayerSkinWeights(layer)) {
      if (!weightBrushWarnedMissingWeights) {
        console.warn('No se puede pintar weights: layer.mesh.skinWeights no existe.');
        weightBrushWarnedMissingWeights = true;
      }
      return false;
    }
  }

  const config = Object.assign({
    targetBoneId: null,
    radius: 60,
    strength: 0.08,
    mode: 'add',
    falloff: 'linear'
  }, options);
  if (config.targetBoneId === null || config.targetBoneId === undefined) return false;
  const vertices = mesh.bindVertices || mesh.vertices || [];
  if (!vertices.length) return false;
  if (config.mode === 'smooth' && !mesh.vertexNeighbors) mesh.vertexNeighbors = buildVertexNeighbors(mesh);
  const radius = Math.max(1, config.radius || 1);
  const strength = clamp(config.strength ?? 0.08, 0, 1);
  const parsedTargetBoneId = Number(config.targetBoneId);
  const targetBoneId = Number.isNaN(parsedTargetBoneId) ? config.targetBoneId : parsedTargetBoneId;
  const brushPoint = { x: worldX, y: worldY };
  let touched = false;

  for (let i = 0; i < vertices.length; i++) {
    const vertexWorld = meshPointToWorld(layer, vertices[i]);
    const distance = Math.hypot(vertexWorld.x - brushPoint.x, vertexWorld.y - brushPoint.y);
    if (distance > radius) continue;
    const factor = getBrushFalloffFactor(distance, radius, config.falloff);
    const amount = strength * factor;
    const vertexWeights = mesh.skinWeights[i] || [];
    mesh.skinWeights[i] = vertexWeights;
    const current = getVertexWeight(vertexWeights, targetBoneId);

    if (config.mode === 'smooth') {
      const neighbors = mesh.vertexNeighbors && mesh.vertexNeighbors[i] ? mesh.vertexNeighbors[i] : [];
      if (!neighbors.length) continue;
      let neighborTotal = 0;
      neighbors.forEach(neighborIndex => {
        neighborTotal += getVertexWeight(mesh.skinWeights[neighborIndex] || [], targetBoneId);
      });
      const average = neighborTotal / neighbors.length;
      setVertexWeight(vertexWeights, targetBoneId, current + (average - current) * amount);
    } else if (config.mode === 'subtract') {
      setVertexWeight(vertexWeights, targetBoneId, current - amount);
    } else {
      setVertexWeight(vertexWeights, targetBoneId, current + amount);
    }

    renormalizeWeights(vertexWeights, targetBoneId, 0.01);
    touched = true;
  }
  return touched;
}

function drawWeightBrush(drawCtx, worldX, worldY) {
  if (!projectState.weightBrush || projectState.weightBrush.targetBoneId === null || projectState.weightBrush.targetBoneId === undefined) return;
  const bone = bones.find(item => item.id === projectState.weightBrush.targetBoneId);
  const color = bone ? bone.color : '#44dddd';
  const radius = Math.max(1, projectState.weightBrush.radius || 1);
  drawCtx.save();
  drawCtx.beginPath();
  drawCtx.arc(worldX, worldY, radius, 0, Math.PI * 2);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = 1.5 / view.scale;
  drawCtx.setLineDash([7 / view.scale, 5 / view.scale]);
  drawCtx.stroke();
  drawCtx.setLineDash([]);
  drawCtx.beginPath();
  drawCtx.arc(worldX, worldY, 5 / view.scale, 0, Math.PI * 2);
  drawCtx.fillStyle = color;
  drawCtx.fill();
  drawCtx.strokeStyle = 'rgba(255,255,255,0.85)';
  drawCtx.lineWidth = 1 / view.scale;
  drawCtx.stroke();
  drawCtx.restore();
}

function resolveStitchSourceLayer() {
  const selectedLayer = getLayerByIndex(selectedLayerIndex);
  if (selectedLayer && selectedLayer.mesh) {
    ensureLayerIdentity(selectedLayer);
    projectState.stitchBrush.sourceLayerUid = selectedLayer.uid;
    return selectedLayer;
  }
  return getLayerByUid(projectState.stitchBrush.sourceLayerUid);
}

function resolveStitchTargetLayer(sourceLayer = null) {
  const target = getLayerByUid(projectState.stitchBrush.targetLayerUid);
  if (target && target !== sourceLayer && target.mesh) return target;
  const fallback = psdLayers.find(layer => {
    ensureLayerIdentity(layer);
    return layer.mesh && (!sourceLayer || layer.uid !== sourceLayer.uid);
  }) || null;
  projectState.stitchBrush.targetLayerUid = fallback ? fallback.uid : null;
  return fallback;
}

function updateStitchTargetOptions() {
  const select = document.getElementById('stitch-target-layer');
  if (!select) return;
  const current = projectState.stitchBrush && projectState.stitchBrush.targetLayerUid;
  select.innerHTML = '<option value="">Target...</option>' + psdLayers
    .map(layer => {
      ensureLayerIdentity(layer);
      const disabled = layer.uid === projectState.stitchBrush.sourceLayerUid || !layer.mesh;
      const suffix = layer.mesh ? '' : ' (sin mesh)';
      return `<option value="${layer.uid}" ${current === layer.uid ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${layer.name}${suffix}</option>`;
    })
    .join('');
}

function setStitchBrushRadius(value) {
  projectState.stitchBrush.radius = clamp(+value || 1, 1, 500);
  render();
}

function setStitchBrushStrength(value) {
  projectState.stitchBrush.strength = clamp(+value || 0, 0, 1);
  render();
}

function setStitchBrushMode(value) {
  projectState.stitchBrush.mode = ['attach', 'weld', 'detach'].includes(value) ? value : 'attach';
}

function setStitchBrushFalloff(value) {
  projectState.stitchBrush.falloff = ['linear', 'smooth', 'constant'].includes(value) ? value : 'linear';
}

function setStitchSmoothRadius(value) {
  projectState.stitchBrush.smoothRadius = clamp(+value || 0, 0, 300);
  render();
}

function setStitchTargetLayer(uid) {
  projectState.stitchBrush.targetLayerUid = uid || null;
  updateStitchTargetOptions();
  render();
}

function useSelectedLayerForStitchBrush() {
  const source = resolveStitchSourceLayer();
  if (!source) {
    console.warn('Stitch Brush necesita una capa con mesh como source.');
  } else {
    resolveStitchTargetLayer(source);
  }
  setTool('stitchBrush');
  updateStitchTargetOptions();
  render();
}

function getBarycentricCoordinates(point, a, b, c) {
  const v0x = b.x - a.x;
  const v0y = b.y - a.y;
  const v1x = c.x - a.x;
  const v1y = c.y - a.y;
  const v2x = point.x - a.x;
  const v2y = point.y - a.y;
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 0.000001) return null;
  const v = (v2x * v1y - v1x * v2y) / den;
  const w = (v0x * v2y - v2x * v0y) / den;
  const u = 1 - v - w;
  return [u, v, w];
}

function pointFromBarycentric(a, b, c, bary) {
  return {
    x: a.x * bary[0] + b.x * bary[1] + c.x * bary[2],
    y: a.y * bary[0] + b.y * bary[1] + c.y * bary[2]
  };
}

function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.000001) return { x: a.x, y: a.y };
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function closestPointOnTriangle(point, a, b, c) {
  const bary = getBarycentricCoordinates(point, a, b, c);
  if (bary && bary[0] >= 0 && bary[1] >= 0 && bary[2] >= 0) {
    return { point, bary, distance: 0 };
  }

  const candidates = [
    closestPointOnSegment(point, a, b),
    closestPointOnSegment(point, b, c),
    closestPointOnSegment(point, c, a)
  ];
  let best = null;
  candidates.forEach(candidate => {
    const candidateBary = getBarycentricCoordinates(candidate, a, b, c);
    if (!candidateBary) return;
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (!best || distance < best.distance) best = { point: candidate, bary: candidateBary, distance };
  });
  return best;
}

function findClosestTriangleOnLayer(layer, worldPoint) {
  if (!layer || !layer.mesh || !layer.mesh.indices) return null;
  const vertices = getRenderMeshVertices(layer);
  const indices = layer.mesh.indices;
  let best = null;
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];
    if (!v0 || !v1 || !v2) continue;
    const p0 = meshPointToWorld(layer, v0);
    const p1 = meshPointToWorld(layer, v1);
    const p2 = meshPointToWorld(layer, v2);
    const closest = closestPointOnTriangle(worldPoint, p0, p1, p2);
    if (!closest) continue;
    if (!best || closest.distance < best.distance) {
      best = {
        triangle: [i0, i1, i2],
        barycentric: closest.bary,
        point: closest.point,
        distance: closest.distance
      };
      if (closest.distance === 0) break;
    }
  }
  return best;
}

function getStitchGroup(sourceLayerUid, targetLayerUid, create = false) {
  if (!sourceLayerUid || !targetLayerUid || sourceLayerUid === targetLayerUid) return null;
  if (!Array.isArray(projectState.meshStitches)) projectState.meshStitches = [];
  let stitch = projectState.meshStitches.find(item => item.sourceLayerUid === sourceLayerUid && item.targetLayerUid === targetLayerUid);
  if (!stitch && create) {
    stitch = {
      id: `stitch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceLayerUid,
      targetLayerUid,
      links: []
    };
    projectState.meshStitches.push(stitch);
  }
  return stitch;
}

function paintStitchAtPoint(sourceLayer, worldX, worldY, options = {}) {
  if (!sourceLayer || !sourceLayer.mesh) return false;
  ensureLayerIdentity(sourceLayer);
  const config = Object.assign({
    targetLayerUid: null,
    radius: 50,
    strength: 1,
    mode: 'attach',
    falloff: 'linear',
    smoothRadius: 35
  }, options);
  const targetLayer = getLayerByUid(config.targetLayerUid);
  if (!targetLayer || !targetLayer.mesh || targetLayer.uid === sourceLayer.uid) return false;

  const sourceVertices = getRenderMeshVertices(sourceLayer);
  const radius = Math.max(1, config.radius || 1);
  const brushPoint = { x: worldX, y: worldY };
  const group = getStitchGroup(sourceLayer.uid, targetLayer.uid, config.mode !== 'detach');
  if (!group) return false;
  let touched = false;

  for (let i = 0; i < sourceVertices.length; i++) {
    const sourceVertex = sourceVertices[i];
    if (!sourceVertex) continue;
    const sourceWorld = meshPointToWorld(sourceLayer, sourceVertex);
    const distance = Math.hypot(sourceWorld.x - brushPoint.x, sourceWorld.y - brushPoint.y);
    if (distance > radius) continue;

    if (config.mode === 'detach') {
      const previousLength = group.links.length;
      group.links = group.links.filter(link => link.sourceVertexId !== i);
      touched = touched || group.links.length !== previousLength;
      continue;
    }

    const closest = findClosestTriangleOnLayer(targetLayer, sourceWorld);
    if (!closest) continue;
    const falloffFactor = getBrushFalloffFactor(distance, radius, config.falloff);
    const strength = clamp((config.strength ?? 1) * falloffFactor, 0, 1);
    const existing = group.links.find(link => link.sourceVertexId === i);
    const link = existing || { sourceVertexId: i };
    link.targetTriangle = closest.triangle;
    link.targetBarycentric = closest.barycentric;
    link.bindOffset = config.mode === 'weld'
      ? { x: 0, y: 0 }
      : {
        x: sourceWorld.x - closest.point.x,
        y: sourceWorld.y - closest.point.y
      };
    link.strength = strength;
    link.smoothRadius = clamp(config.smoothRadius ?? radius * 0.7, 0, 300);
    link.mode = config.mode === 'weld' ? 'weld' : 'attach';
    if (!existing) group.links.push(link);
    touched = true;
  }

  if (group.links.length === 0) {
    projectState.meshStitches = projectState.meshStitches.filter(item => item !== group);
  }
  return touched;
}

function applyMeshStitches() {
  const stitches = projectState.meshStitches || [];
  stitches.forEach(stitch => {
    const sourceLayer = getLayerByUid(stitch.sourceLayerUid);
    const targetLayer = getLayerByUid(stitch.targetLayerUid);
    if (!sourceLayer || !targetLayer || !sourceLayer.mesh || !targetLayer.mesh) return;
    const sourceVertices = sourceLayer.mesh.runtimeVertices || getRenderMeshVertices(sourceLayer);
    const sourceBindVertices = sourceLayer.mesh.bindVertices || sourceVertices;
    const targetVertices = getRenderMeshVertices(targetLayer);
    const accum = sourceVertices.map(() => ({ x: 0, y: 0, w: 0 }));
    (stitch.links || []).forEach(link => {
      const sourceVertex = sourceVertices[link.sourceVertexId];
      if (!sourceVertex || !link.targetTriangle || !link.targetBarycentric) return;
      const t0 = targetVertices[link.targetTriangle[0]];
      const t1 = targetVertices[link.targetTriangle[1]];
      const t2 = targetVertices[link.targetTriangle[2]];
      if (!t0 || !t1 || !t2) return;
      const world0 = meshPointToWorld(targetLayer, t0);
      const world1 = meshPointToWorld(targetLayer, t1);
      const world2 = meshPointToWorld(targetLayer, t2);
      const targetWorld = pointFromBarycentric(world0, world1, world2, link.targetBarycentric);
      const desiredWorld = {
        x: targetWorld.x + (link.bindOffset ? link.bindOffset.x : 0),
        y: targetWorld.y + (link.bindOffset ? link.bindOffset.y : 0)
      };
      const currentWorld = meshPointToWorld(sourceLayer, sourceVertex);
      const strength = clamp(link.strength ?? 1, 0, 1);
      const nextWorld = {
        x: currentWorld.x + (desiredWorld.x - currentWorld.x) * strength,
        y: currentWorld.y + (desiredWorld.y - currentWorld.y) * strength
      };
      const nextMeshPoint = worldPointToMeshPoint(sourceLayer, nextWorld.x, nextWorld.y);
      const deltaX = nextMeshPoint.x - sourceVertex.x;
      const deltaY = nextMeshPoint.y - sourceVertex.y;
      const sourceBind = sourceBindVertices[link.sourceVertexId] || sourceVertex;
      const smoothRadius = Math.max(0, link.smoothRadius || 0);
      if (smoothRadius > 0) {
        sourceBindVertices.forEach((bindVertex, index) => {
          if (!bindVertex) return;
          const distance = Math.hypot(bindVertex.x - sourceBind.x, bindVertex.y - sourceBind.y);
          if (distance > smoothRadius) return;
          const ratio = distance / Math.max(smoothRadius, 0.0001);
          const falloff = index === link.sourceVertexId ? 1 : Math.pow(1 - ratio, 2) * 0.65;
          if (falloff <= 0) return;
          accum[index].x += deltaX * falloff;
          accum[index].y += deltaY * falloff;
          accum[index].w += falloff;
        });
      } else {
        accum[link.sourceVertexId].x += deltaX;
        accum[link.sourceVertexId].y += deltaY;
        accum[link.sourceVertexId].w += 1;
      }
    });
    sourceVertices.forEach((vertex, index) => {
      const item = accum[index];
      if (!item || item.w <= 0) return;
      const factor = item.w > 1 ? 1 / item.w : 1;
      vertex.x += item.x * factor;
      vertex.y += item.y * factor;
    });
    sourceLayer.mesh.runtimeVertices = sourceVertices;
    sourceLayer.mesh.vertices = cloneVertices(sourceVertices);
  });
}

function drawMeshStitches(drawCtx) {
  const stitches = projectState.meshStitches || [];
  drawCtx.save();
  drawCtx.lineWidth = 1.3 / view.scale;
  stitches.forEach(stitch => {
    const sourceLayer = getLayerByUid(stitch.sourceLayerUid);
    const targetLayer = getLayerByUid(stitch.targetLayerUid);
    if (!sourceLayer || !targetLayer || !sourceLayer.mesh || !targetLayer.mesh) return;
    const sourceVertices = getRenderMeshVertices(sourceLayer);
    const targetVertices = getRenderMeshVertices(targetLayer);
    (stitch.links || []).forEach(link => {
      const sourceVertex = sourceVertices[link.sourceVertexId];
      if (!sourceVertex || !link.targetTriangle || !link.targetBarycentric) return;
      const t0 = targetVertices[link.targetTriangle[0]];
      const t1 = targetVertices[link.targetTriangle[1]];
      const t2 = targetVertices[link.targetTriangle[2]];
      if (!t0 || !t1 || !t2) return;
      const sourceWorld = meshPointToWorld(sourceLayer, sourceVertex);
      const targetWorld = pointFromBarycentric(
        meshPointToWorld(targetLayer, t0),
        meshPointToWorld(targetLayer, t1),
        meshPointToWorld(targetLayer, t2),
        link.targetBarycentric
      );
      drawCtx.beginPath();
      drawCtx.moveTo(sourceWorld.x, sourceWorld.y);
      drawCtx.lineTo(targetWorld.x, targetWorld.y);
      drawCtx.strokeStyle = 'rgba(78,201,176,0.65)';
      drawCtx.stroke();
      drawCtx.beginPath();
      drawCtx.arc(sourceWorld.x, sourceWorld.y, 3.5 / view.scale, 0, Math.PI * 2);
      drawCtx.fillStyle = '#4ec9b0';
      drawCtx.fill();
      drawCtx.beginPath();
      drawCtx.arc(targetWorld.x, targetWorld.y, 3 / view.scale, 0, Math.PI * 2);
      drawCtx.fillStyle = '#ffd15a';
      drawCtx.fill();
    });
  });
  drawCtx.restore();
}

function drawStitchBrush(drawCtx, worldX, worldY) {
  const sourceLayer = resolveStitchSourceLayer();
  const targetLayer = resolveStitchTargetLayer(sourceLayer);
  const color = targetLayer ? '#4ec9b0' : '#ff7c62';
  const radius = Math.max(1, projectState.stitchBrush.radius || 1);
  drawCtx.save();
  drawCtx.beginPath();
  drawCtx.arc(worldX, worldY, radius, 0, Math.PI * 2);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = 1.5 / view.scale;
  drawCtx.setLineDash([8 / view.scale, 5 / view.scale]);
  drawCtx.stroke();
  drawCtx.setLineDash([]);
  drawCtx.beginPath();
  drawCtx.arc(worldX, worldY, 5 / view.scale, 0, Math.PI * 2);
  drawCtx.fillStyle = color;
  drawCtx.fill();
  if (sourceLayer && targetLayer) {
    drawCtx.font = `${11 / view.scale}px sans-serif`;
    drawCtx.fillStyle = '#dfffee';
    drawCtx.fillText(`${sourceLayer.name} -> ${targetLayer.name}`, worldX + 9 / view.scale, worldY - 9 / view.scale);
  }
  drawCtx.restore();
}

function orderPolygonPoints(points) {
  if (!points || points.length < 3) return points || [];
  const center = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  return [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

function sanitizeManualMeshPoints(points, maxX, maxY) {
  return (Array.isArray(points) ? points : [])
    .map(point => ({
      x: clamp(+point.x || 0, -maxX, maxX),
      y: clamp(+point.y || 0, -maxY, maxY)
    }))
    .filter((point, index, arr) => arr.findIndex(other => Math.hypot(other.x - point.x, other.y - point.y) < 0.001) === index);
}

function getManualMeshPreview(contourPoints, interiorPoints) {
  const orderedContour = orderPolygonPoints(contourPoints || []);
  if (orderedContour.length < 3) return null;
  const vertices = [
    ...orderedContour.map(point => ({ x: point.x, y: point.y })),
    ...(interiorPoints || []).map(point => ({ x: point.x, y: point.y }))
  ];
  const triangles = createDelaunayTriangles(vertices)
    .filter(triangle => triangleInsideShape(triangle, vertices, orderedContour, []));
  if (!triangles.length) return null;
  const indices = [];
  triangles.forEach(triangle => {
    const a = vertices[triangle[0]];
    const b = vertices[triangle[1]];
    const c = vertices[triangle[2]];
    if (polygonSignedArea([a, b, c]) < 0) indices.push(triangle[0], triangle[2], triangle[1]);
    else indices.push(triangle[0], triangle[1], triangle[2]);
  });
  if (!indices.length) return null;
  return { contour: orderedContour, vertices, indices };
}

function createFreeformManualMeshForLayer(layer, contourPoints, interiorPoints = []) {
  ensureLayerIdentity(layer);
  const maxX = layer.width / 2;
  const maxY = layer.height / 2;
  const contour = sanitizeManualMeshPoints(contourPoints, maxX, maxY);
  const interior = sanitizeManualMeshPoints(interiorPoints, maxX, maxY)
    .filter(point => pointInPolygon(point, contour));
  if (contour.length < 3) return false;
  const preview = getManualMeshPreview(contour, interior);
  if (!preview) {
    alert('No se pudo triangulizar el mesh manual con esos puntos. Ajusta el contorno o reduce puntos superpuestos.');
    return false;
  }
  const uvs = preview.vertices.map(vertex => ({
    u: clamp(vertex.x + layer.width / 2, 0, layer.width),
    v: clamp(vertex.y + layer.height / 2, 0, layer.height)
  }));
  layer.mesh = {
    vertices: cloneVertices(preview.vertices),
    bindVertices: cloneVertices(preview.vertices),
    runtimeVertices: cloneVertices(preview.vertices),
    uvs,
    indices: [...preview.indices]
  };
  layer.meshPins = [];
  layer.role = 'deformable';
  return true;
}

function interpolateWeightsAtTriangle(weights, triangleInfo) {
  if (!weights || !triangleInfo) return null;
  const combined = new Map();
  triangleInfo.indices.forEach((vertexIndex, corner) => {
    const factor = triangleInfo.barycentric[corner] || 0;
    (weights[vertexIndex] || []).forEach(item => {
      const key = String(item.boneId);
      const current = combined.get(key) || { boneId: item.boneId, weight: 0 };
      current.weight += (item.weight || 0) * factor;
      combined.set(key, current);
    });
  });
  const result = Array.from(combined.values()).filter(item => item.weight > 0.0001);
  if (!result.length) return null;
  const dominant = result.reduce((best, item) => item.weight > best.weight ? item : best, result[0]);
  return renormalizeWeights(result, dominant.boneId, 0.01);
}

function getMeshUvForPoint(layer, point) {
  const mesh = layer.mesh || {};
  const normalized = mesh.uvSpace === 'normalized' || isTopLeftMesh(layer) || (mesh.uvs || []).every(uv => !uv || (Math.abs(uv.u) <= 1.0001 && Math.abs(uv.v) <= 1.0001));
  if (normalized) {
    const topLeftPoint = isTopLeftMesh(layer) ? point : { x: point.x + layer.width / 2, y: point.y + layer.height / 2 };
    return {
      u: clamp(topLeftPoint.x / Math.max(1, layer.width), 0, 1),
      v: clamp(topLeftPoint.y / Math.max(1, layer.height), 0, 1)
    };
  }
  const localPoint = isTopLeftMesh(layer) ? { x: point.x - layer.width / 2, y: point.y - layer.height / 2 } : point;
  return {
    u: clamp(localPoint.x + layer.width / 2, 0, layer.width),
    v: clamp(localPoint.y + layer.height / 2, 0, layer.height)
  };
}

function addMeshVertexAtPoint(layer, worldX, worldY) {
  if (!layer || !layer.mesh || !layer.mesh.bindVertices || !layer.mesh.indices) return false;
  const mesh = layer.mesh;
  const meshPoint = worldPointToMeshPoint(layer, worldX, worldY);
  const oldVertices = cloneVertices(mesh.bindVertices);
  const oldIndices = [...mesh.indices];
  if (!pointInsideMeshDomain(meshPoint, oldVertices, oldIndices)) return false;
  if (oldVertices.some(vertex => Math.hypot(vertex.x - meshPoint.x, vertex.y - meshPoint.y) < 2 / Math.max(view.scale, 0.0001))) return false;

  const containingTriangle = findContainingMeshTriangle(meshPoint, oldVertices, oldIndices);
  if (!containingTriangle || containingTriangle.triangleOffset === undefined) return false;

  const newVertexIndex = oldVertices.length;
  const newVertices = [...oldVertices, { x: meshPoint.x, y: meshPoint.y }];
  const baseTriangle = containingTriangle.indices.map(index => oldVertices[index]);
  const baseOrientation = polygonSignedArea(baseTriangle);
  const appendTriangle = (target, i0, i1, i2) => {
    const a = newVertices[i0];
    const b = newVertices[i1];
    const c = newVertices[i2];
    if (!a || !b || !c) return;
    const orientation = polygonSignedArea([a, b, c]);
    if (baseOrientation < 0) target.push(i0, i2, i1);
    else if (baseOrientation > 0) target.push(i0, i1, i2);
    else if (orientation < 0) target.push(i0, i2, i1);
    else target.push(i0, i1, i2);
  };

  const newIndices = [];
  for (let i = 0; i < oldIndices.length; i += 3) {
    if (i === containingTriangle.triangleOffset) {
      const [i0, i1, i2] = containingTriangle.indices;
      appendTriangle(newIndices, i0, i1, newVertexIndex);
      appendTriangle(newIndices, i1, i2, newVertexIndex);
      appendTriangle(newIndices, i2, i0, newVertexIndex);
      continue;
    }
    newIndices.push(oldIndices[i], oldIndices[i + 1], oldIndices[i + 2]);
  }

  const currentVertices = getRenderMeshVertices(layer);
  const currentNewPoint = currentVertices.length === oldVertices.length
    ? pointFromBarycentric(
      currentVertices[containingTriangle.indices[0]],
      currentVertices[containingTriangle.indices[1]],
      currentVertices[containingTriangle.indices[2]],
      containingTriangle.barycentric
    )
    : { x: meshPoint.x, y: meshPoint.y };

  mesh.bindVertices = cloneVertices(newVertices);
  mesh.vertices = [...cloneVertices(currentVertices.length === oldVertices.length ? currentVertices : oldVertices), { x: currentNewPoint.x, y: currentNewPoint.y }];
  mesh.runtimeVertices = cloneVertices(mesh.vertices);
  if (mesh.animatedVertices && mesh.animatedVertices.length === oldVertices.length) {
    const animatedNewPoint = pointFromBarycentric(
      mesh.animatedVertices[containingTriangle.indices[0]],
      mesh.animatedVertices[containingTriangle.indices[1]],
      mesh.animatedVertices[containingTriangle.indices[2]],
      containingTriangle.barycentric
    );
    mesh.animatedVertices = [...cloneVertices(mesh.animatedVertices), animatedNewPoint];
  } else {
    mesh.animatedVertices = null;
  }
  mesh.uvs = [...(mesh.uvs || []), getMeshUvForPoint(layer, meshPoint)];
  mesh.indices = newIndices;
  mesh.vertexNeighbors = null;

  if (mesh.skinWeights && mesh.skinWeights.length === oldVertices.length) {
    const newWeights = interpolateWeightsAtTriangle(mesh.skinWeights, containingTriangle);
    mesh.skinWeights = [...mesh.skinWeights.map(weights => weights.map(item => ({ boneId: item.boneId, weight: item.weight }))), newWeights || [{ boneId: resolveWeightBrushTargetBoneId(layer) ?? 0, weight: 1 }]];
  }
  projectState.meshEditor.selectedVertexIds = [newVertexIndex];
  projectState.meshEditor.selectedPinId = null;
  return true;
}

function toggleAddMeshVertexMode() {
  if (projectState.editorMode !== 'rig') {
    alert('Agregar vertices cambia la topologia del mesh. Hazlo en modo Rig.');
    return;
  }
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.mesh) {
    alert('Selecciona una capa con mesh para agregar vertices.');
    return;
  }
  projectState.meshEditor.addVertexMode = !projectState.meshEditor.addVertexMode;
  if (projectState.meshEditor.addVertexMode) {
    projectState.meshEditor.manualMode = false;
    projectState.meshEditor.manualLayerUid = null;
    clearManualMeshPoints();
    projectState.meshEditor.manualStage = 'contour';
    projectState.meshEditor.mode = 'addVertex';
  } else if (projectState.meshEditor.mode === 'addVertex') {
    projectState.meshEditor.mode = 'select';
  }
  setTool('pins');
  render();
}

function clearManualMeshPoints() {
  projectState.meshEditor.manualContourPoints = [];
  projectState.meshEditor.manualInteriorPoints = [];
}

function setManualMeshStage(stage) {
  const editor = ensureMeshEditorState();
  if (!editor.manualMode) return;
  editor.manualStage = stage === 'interior' ? 'interior' : 'contour';
  updateProps();
  render();
}

function beginManualMeshForSelectedLayer() {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  ensureLayerIdentity(layer);
  projectState.meshEditor.manualMode = true;
  projectState.meshEditor.manualLayerUid = layer.uid;
  clearManualMeshPoints();
  projectState.meshEditor.manualStage = 'contour';
  projectState.meshEditor.addVertexMode = false;
  projectState.meshEditor.selectedVertexIds = [];
  projectState.meshEditor.selectedPinId = null;
  setTool('pins');
  updateProps();
  render();
}

function cancelManualMeshCreation() {
  projectState.meshEditor.manualMode = false;
  projectState.meshEditor.manualLayerUid = null;
  clearManualMeshPoints();
  projectState.meshEditor.manualStage = 'contour';
  updateProps();
  render();
}

function addManualMeshPoint(localX, localY) {
  const layer = getLayerByUid(projectState.meshEditor.manualLayerUid);
  if (!layer) return;
  const maxX = layer.width / 2;
  const maxY = layer.height / 2;
  const nextPoint = {
    x: clamp(localX, -maxX, maxX),
    y: clamp(localY, -maxY, maxY)
  };
  const target = projectState.meshEditor.manualStage === 'interior'
    ? projectState.meshEditor.manualInteriorPoints
    : projectState.meshEditor.manualContourPoints;
  const duplicate = target.some(point => Math.hypot(point.x - nextPoint.x, point.y - nextPoint.y) < 2 / Math.max(view.scale, 0.0001));
  if (duplicate) return;
  if (projectState.meshEditor.manualStage === 'interior') {
    const contour = orderPolygonPoints(projectState.meshEditor.manualContourPoints || []);
    if (contour.length < 3 || !pointInPolygon(nextPoint, contour)) return;
  }
  target.push(nextPoint);
  updateProps();
  render();
}

function removeLastManualMeshPoint() {
  if (!projectState.meshEditor.manualMode) return;
  const target = projectState.meshEditor.manualStage === 'interior'
    ? projectState.meshEditor.manualInteriorPoints
    : projectState.meshEditor.manualContourPoints;
  target.pop();
  updateProps();
  render();
}

function finalizeManualMeshForSelectedLayer() {
  const layer = getLayerByUid(projectState.meshEditor.manualLayerUid);
  const contourPoints = projectState.meshEditor.manualContourPoints || [];
  const interiorPoints = projectState.meshEditor.manualInteriorPoints || [];
  if (!layer || contourPoints.length < 3) {
    alert('Necesitas al menos 3 puntos de contorno para crear el mesh manual.');
    return;
  }
  const created = createFreeformManualMeshForLayer(layer, contourPoints, interiorPoints);
  if (!created) return;
  projectState.meshEditor.manualMode = false;
  projectState.meshEditor.manualLayerUid = null;
  clearManualMeshPoints();
  projectState.meshEditor.manualStage = 'contour';
  projectState.meshEditor.addVertexMode = false;
  projectState.meshEditor.selectedVertexIds = [];
  projectState.meshEditor.selectedPinId = null;
  saveBindPose();
  pushUndoSnapshot();
  updateLayerList();
  updateProps();
  render();
}

function ensureLayerMesh(layer) {
  ensureLayerIdentity(layer);
  if (!layer.mesh) createGridMeshForLayer(layer);
  if (!layer.mesh.bindVertices) layer.mesh.bindVertices = cloneVertices(layer.mesh.vertices || []);
  if (!layer.mesh.runtimeVertices) layer.mesh.runtimeVertices = cloneVertices(layer.mesh.bindVertices);
  if (!layer.meshPins) layer.meshPins = [];
  ensureMeshEditorState();
}

function getMeshGenerationPresetOptions(preset = null) {
  const value = preset || ensureMeshEditorState().generationPreset || 'medium';
  if (value === 'low') {
    return {
      contourPoints: 28,
      curvatureWeight: 1.2,
      gridCols: 2,
      gridRows: 2
    };
  }
  if (value === 'high') {
    return {
      contourPoints: 72,
      curvatureWeight: 2.6,
      gridCols: 5,
      gridRows: 5
    };
  }
  return {
    contourPoints: 48,
    curvatureWeight: 2.0,
    gridCols: 3,
    gridRows: 3
  };
}

function updateAllPinCenters(layer) {
  if (!layer || !layer.meshPins) return;
  layer.meshPins.forEach(pin => updatePinCenterFromVertices(layer, pin));
}

function applyEditedMeshVertices(layer, vertices, options = {}) {
  if (!layer || !layer.mesh) return false;
  const mesh = layer.mesh;
  const nextVertices = cloneVertices(vertices || []);
  mesh.vertices = cloneVertices(nextVertices);
  mesh.runtimeVertices = cloneVertices(nextVertices);
  if (projectState.editorMode === 'animation') {
    mesh.animatedVertices = cloneVertices(nextVertices);
  } else {
    mesh.bindVertices = cloneVertices(nextVertices);
    mesh.animatedVertices = null;
  }
  updateAllPinCenters(layer);
  if (options.refreshSkinNeighbors !== false) mesh.vertexNeighbors = null;
  return true;
}

function commitSelectedLayerMeshEdit(options = {}) {
  const editor = ensureMeshEditorState();
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.mesh) return false;
  const captureAnimation = options.captureAnimation !== false;
  const pushUndo = options.pushUndo !== false;
  if (projectState.editorMode === 'animation' && captureAnimation && typeof captureSelectedLayerMeshToAnimation === 'function' && getCurrentAnimation()) {
    captureSelectedLayerMeshToAnimation(projectState.playback.currentFrame, 'linear');
    applyAnimationAtCurrentFrame();
  } else {
    saveBindPose();
    updateProps();
    render();
  }
  if (pushUndo) pushUndoSnapshot();
  return true;
}

function getSelectedMeshVertexWorldPoints(layer) {
  const vertices = getEditableMeshVertices(layer);
  return ensureMeshEditorState().selectedVertexIds
    .map(id => vertices[id])
    .filter(Boolean)
    .map(vertex => meshPointToWorld(layer, vertex));
}

function getSelectedMeshCentroid(layer) {
  const points = getSelectedMeshVertexWorldPoints(layer);
  if (!points.length) return null;
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function buildSoftSelectionWeights(layer, selectedIds, radius, strength) {
  const vertices = getEditableMeshVertices(layer);
  const weights = new Map();
  if (!vertices.length || !selectedIds.length) return weights;
  const worldVertices = vertices.map(vertex => meshPointToWorld(layer, vertex));
  const selectedSet = new Set(selectedIds);
  selectedIds.forEach(id => weights.set(id, 1));
  if (!ensureMeshEditorState().softSelectionEnabled || radius <= 0 || strength <= 0) return weights;
  worldVertices.forEach((candidate, index) => {
    if (selectedSet.has(index)) return;
    let best = 0;
    selectedIds.forEach(selectedId => {
      const source = worldVertices[selectedId];
      if (!source) return;
      const distance = Math.hypot(candidate.x - source.x, candidate.y - source.y);
      if (distance > radius) return;
      best = Math.max(best, getBrushFalloffFactor(distance, radius, 'smooth') * strength);
    });
    if (best > 0.001) weights.set(index, clamp(best, 0, 1));
  });
  return weights;
}

function translateMeshVertexSelection(layer, worldDx, worldDy, weightMap) {
  if (!layer || !layer.mesh || !weightMap || !weightMap.size) return false;
  const vertices = getEditableMeshVertices(layer).map(vertex => ({ x: vertex.x, y: vertex.y }));
  const currentTransform = getLayerWorldTransform(layer);
  const targetTransform = currentTransform;
  weightMap.forEach((weight, vertexId) => {
    const vertex = vertices[vertexId];
    if (!vertex) return;
    const world = meshPointToWorld(layer, vertex, currentTransform);
    const nextMeshPoint = worldPointToMeshPoint(layer, world.x + worldDx * weight, world.y + worldDy * weight, targetTransform);
    vertex.x = nextMeshPoint.x;
    vertex.y = nextMeshPoint.y;
  });
  applyEditedMeshVertices(layer, vertices);
  return true;
}

function rotateMeshVertexSelection(layer, deltaDeg, weightMap, pivotWorld = null) {
  if (!layer || !layer.mesh || !weightMap || !weightMap.size) return false;
  const pivot = pivotWorld || getSelectedMeshCentroid(layer);
  if (!pivot) return false;
  const vertices = getEditableMeshVertices(layer).map(vertex => ({ x: vertex.x, y: vertex.y }));
  weightMap.forEach((weight, vertexId) => {
    const vertex = vertices[vertexId];
    if (!vertex) return;
    const world = meshPointToWorld(layer, vertex);
    const rotated = rotatePoint(world.x, world.y, pivot.x, pivot.y, deltaDeg * Math.PI / 180 * weight);
    const next = worldPointToMeshPoint(layer, rotated.x, rotated.y);
    vertex.x = next.x;
    vertex.y = next.y;
  });
  applyEditedMeshVertices(layer, vertices);
  return true;
}

function scaleMeshVertexSelection(layer, scaleFactor, weightMap, pivotWorld = null) {
  if (!layer || !layer.mesh || !weightMap || !weightMap.size) return false;
  const pivot = pivotWorld || getSelectedMeshCentroid(layer);
  if (!pivot) return false;
  const vertices = getEditableMeshVertices(layer).map(vertex => ({ x: vertex.x, y: vertex.y }));
  weightMap.forEach((weight, vertexId) => {
    const vertex = vertices[vertexId];
    if (!vertex) return;
    const world = meshPointToWorld(layer, vertex);
    const effectiveScale = 1 + (scaleFactor - 1) * weight;
    const scaled = {
      x: pivot.x + (world.x - pivot.x) * effectiveScale,
      y: pivot.y + (world.y - pivot.y) * effectiveScale
    };
    const next = worldPointToMeshPoint(layer, scaled.x, scaled.y);
    vertex.x = next.x;
    vertex.y = next.y;
  });
  applyEditedMeshVertices(layer, vertices);
  return true;
}

function setMeshEditMode(mode) {
  const editor = ensureMeshEditorState();
  editor.mode = ['select', 'move', 'pin', 'addVertex', 'createPin'].includes(mode) ? mode : 'select';
  editor.addVertexMode = editor.mode === 'addVertex';
  if (editor.mode !== 'pin') editor.selectedPinId = null;
  if (editor.mode === 'addVertex') {
    editor.manualMode = false;
    editor.manualLayerUid = null;
  }
  setTool('pins');
  render();
}

function setMeshSoftSelection(enabled) {
  ensureMeshEditorState().softSelectionEnabled = !!enabled;
  updateProps();
  render();
}

function setMeshSoftSelectionRadius(value) {
  ensureMeshEditorState().softSelectionRadius = clamp(+value || 1, 10, 400);
  updateProps();
  render();
}

function setMeshSoftSelectionStrength(value) {
  ensureMeshEditorState().softSelectionStrength = clamp(+value || 0, 0, 1);
  updateProps();
  render();
}

function setMeshGenerationPreset(value) {
  ensureMeshEditorState().generationPreset = ['low', 'medium', 'high'].includes(value) ? value : 'medium';
  updateProps();
}

function getControllerTransform(layerId) {
  const controller = psdLayers.find(layer => layer.uid === layerId);
  if (!controller) return null;
  return {
    x: controller.center_x,
    y: controller.center_y,
    rotation: (controller.rotation || 0)
  };
}

function updatePinCenterFromVertices(layer, pin) {
  if (!layer.mesh || !pin.vertexIds || pin.vertexIds.length === 0) return;
  const sourceVertices = getEditableMeshVertices(layer);
  let sumX = 0;
  let sumY = 0;
  pin.vertexIds.forEach(vertexId => {
    const vertex = sourceVertices[vertexId];
    if (vertex) {
      sumX += vertex.x;
      sumY += vertex.y;
    }
  });
  pin.centerLocal = {
    x: sumX / pin.vertexIds.length,
    y: sumY / pin.vertexIds.length
  };
}

function createPinFromSelection() {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  ensureLayerMesh(layer);
  const selectedVertices = [...projectState.meshEditor.selectedVertexIds];
  if (selectedVertices.length === 0) return;
  const pinId = `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pin = {
    id: pinId,
    vertexIds: selectedVertices,
    controllerLayerId: null,
    bindLocalOffset: { x: 0, y: 0 },
    radius: Math.max(layer.width, layer.height) * 0.35,
    falloff: 1.5,
    strength: 1,
    centerLocal: { x: 0, y: 0 },
    bindControllerWorld: null
  };
  updatePinCenterFromVertices(layer, pin);
  layer.meshPins.push(pin);
  projectState.meshEditor.selectedPinId = pinId;
  layer.role = 'deformable';
  saveBindPose();
  updateProps();
  render();
}

function deleteSelectedPin() {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.meshPins) return;
  layer.meshPins = layer.meshPins.filter(pin => pin.id !== projectState.meshEditor.selectedPinId);
  projectState.meshEditor.selectedPinId = null;
  saveBindPose();
  updateProps();
  render();
}

function applyMeshControllers() {
  psdLayers.forEach(layer => {
    ensureLayerIdentity(layer);
    if (!layer.mesh || !layer.mesh.bindVertices) return;

    const hasAutoSkin = applyAutoSkinAtFrame(layer, bones);
    const baseVertices = hasAutoSkin
      ? layer.mesh.runtimeVertices
      : getEditableMeshVertices(layer);
    const runtimeVertices = cloneVertices(baseVertices);
    const layerRotation = layer.rotation || 0;
    const invCos = Math.cos(-layerRotation);
    const invSin = Math.sin(-layerRotation);

    (layer.meshPins || []).forEach(pin => {
      if (!pin.controllerLayerId) return;
      const bindController = pin.bindControllerWorld;
      const currentController = getControllerTransform(pin.controllerLayerId);
      if (!bindController || !currentController) return;

      const worldDx = currentController.x - bindController.x;
      const worldDy = currentController.y - bindController.y;
      const localDx = worldDx * invCos - worldDy * invSin;
      const localDy = worldDx * invSin + worldDy * invCos;
      const deltaRotation = normalizeAngleDeg((currentController.rotation - bindController.rotation) * 180 / Math.PI) * Math.PI / 180;

      const accum = baseVertices.map(() => ({ x: 0, y: 0, w: 0 }));
      baseVertices.forEach((vertex, index) => {
        const dist = Math.hypot(vertex.x - pin.centerLocal.x, vertex.y - pin.centerLocal.y);
        if (dist > pin.radius) return;
        const baseWeight = 1 - dist / Math.max(pin.radius, 0.0001);
        const weight = Math.pow(baseWeight, Math.max(0.1, pin.falloff || 1)) * Math.max(0, pin.strength || 0);
        if (weight <= 0) return;
        const rotated = rotatePoint(vertex.x, vertex.y, pin.centerLocal.x, pin.centerLocal.y, deltaRotation * weight);
        accum[index].x += (rotated.x - vertex.x) + localDx * weight;
        accum[index].y += (rotated.y - vertex.y) + localDy * weight;
        accum[index].w += weight;
      });

      runtimeVertices.forEach((vertex, index) => {
        if (!accum[index].w) return;
        const factor = accum[index].w > 1 ? 1 / accum[index].w : 1;
        vertex.x += accum[index].x * factor;
        vertex.y += accum[index].y * factor;
      });
    });

    layer.mesh.runtimeVertices = runtimeVertices;
    layer.mesh.vertices = cloneVertices(runtimeVertices);
  });
  applyMeshStitches();
}

function getMeshVertexAt(layer, localX, localY, tolerance = 10 / view.scale) {
  const vertices = getEditableMeshVertices(layer);
  if (!vertices.length) return null;
  const meshPoint = layerLocalToMeshPoint(layer, localX, localY);
  let bestIndex = null;
  let bestDistance = tolerance;
  vertices.forEach((vertex, index) => {
    const dist = Math.hypot(vertex.x - meshPoint.x, vertex.y - meshPoint.y);
    if (dist <= bestDistance) {
      bestDistance = dist;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getMeshPinAt(layer, localX, localY, tolerance = 12 / view.scale) {
  if (!layer.meshPins) return null;
  const meshPoint = layerLocalToMeshPoint(layer, localX, localY);
  return layer.meshPins.find(pin => Math.hypot(pin.centerLocal.x - meshPoint.x, pin.centerLocal.y - meshPoint.y) <= Math.max(tolerance, pin.radius * 0.15)) || null;
}

function getMeshVerticesInLocalRect(layer, x1, y1, x2, y2) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const vertices = getEditableMeshVertices(layer);
  const ids = [];
  vertices.forEach((vertex, index) => {
    const local = meshPointToLayerLocal(layer, vertex);
    if (!local) return;
    if (local.x >= minX && local.x <= maxX && local.y >= minY && local.y <= maxY) ids.push(index);
  });
  return ids;
}

function getLayerAt(worldX, worldY) {
  const renderable = getRenderableLayers().slice().reverse();
  for (const entry of renderable) {
    const layer = entry.layer;
    if (!getLayerRenderVisible(layer)) continue;
    const local = toLocalFromLayer(layer, worldX, worldY);
    if (Math.abs(local.x) <= layer.width / 2 && Math.abs(local.y) <= layer.height / 2) {
      return entry.index;
    }
  }
  return null;
}

function normalizeBaseLayerOrder() {
  const sorted = [...psdLayers]
    .map((layer, index) => ({ layer, index, z: layer.zOrder !== undefined ? layer.zOrder : index }))
    .sort((a, b) => a.z - b.z);
  sorted.forEach((entry, orderIndex) => {
    entry.layer.zOrder = orderIndex;
    if (projectState.editorMode !== 'animation') entry.layer.runtime_z = orderIndex;
  });
}

function getLayerStackEntries(useCurrentRuntime = false) {
  return [...psdLayers]
    .map((layer, index) => ({
      layer,
      index,
      z: useCurrentRuntime ? getLayerZ(layer, index) : (layer.zOrder !== undefined ? layer.zOrder : index)
    }))
    .sort((a, b) => a.z - b.z);
}

function isLayerInsideGroupPath(layer, groupPath) {
  const normalized = normalizeLayerUiGroup(groupPath || '');
  if (!normalized) return false;
  const layerGroup = getLayerUiGroup(layer);
  return layerGroup === normalized || layerGroup.startsWith(normalized + '/');
}

function getGroupMoveState(groupPath) {
  const normalized = normalizeLayerUiGroup(groupPath || '');
  if (!normalized) return { canMoveUp: false, canMoveDown: false };
  const useCurrentRuntime = projectState.editorMode === 'animation' && typeof getCurrentAnimation === 'function' && getCurrentAnimation();
  const ordered = getLayerStackEntries(!!useCurrentRuntime);
  const selectedPositions = [];
  ordered.forEach((entry, position) => {
    if (isLayerInsideGroupPath(entry.layer, normalized)) selectedPositions.push(position);
  });
  if (!selectedPositions.length) return { canMoveUp: false, canMoveDown: false };
  const minPos = Math.min(...selectedPositions);
  const maxPos = Math.max(...selectedPositions);
  const canMoveDown = ordered.slice(0, minPos).some(entry => !isLayerInsideGroupPath(entry.layer, normalized));
  const canMoveUp = ordered.slice(maxPos + 1).some(entry => !isLayerInsideGroupPath(entry.layer, normalized));
  return { canMoveUp, canMoveDown };
}

function applyLayerStackOrder(orderedEntries, options = {}) {
  const { runtime = false } = options;
  const previousSelectedLayerIndex = selectedLayerIndex;
  const changedIndices = [];
  orderedEntries.forEach((entry, orderIndex) => {
    const currentValue = runtime
      ? getLayerZ(entry.layer, entry.index)
      : (entry.layer.zOrder !== undefined ? entry.layer.zOrder : entry.index);
    if (currentValue !== orderIndex) changedIndices.push(entry.index);
    if (runtime) entry.layer.runtime_z = orderIndex;
    else {
      entry.layer.zOrder = orderIndex;
      entry.layer.runtime_z = orderIndex;
    }
  });

  if (runtime && typeof captureSelectedLayerToAnimation === 'function') {
    changedIndices.forEach(index => {
      selectedLayerIndex = index;
      captureSelectedLayerToAnimation(projectState.playback.currentFrame, 'step');
    });
    selectedLayerIndex = previousSelectedLayerIndex;
    if (typeof applyAnimationAtCurrentFrame === 'function') applyAnimationAtCurrentFrame();
    updateLayerList();
    updateProps();
    render();
    return;
  }

  saveBindPose();
  updateLayerList();
  updateProps();
  render();
}

function moveLayerInStack(layerIndex, direction) {
  const layer = getLayerByIndex(layerIndex);
  if (!layer) return;

  if (projectState.editorMode === 'animation' && typeof getCurrentAnimation === 'function' && getCurrentAnimation()) {
    const sorted = [...psdLayers]
      .map((item, index) => ({ item, index, z: getLayerZ(item, index) }))
      .sort((a, b) => a.z - b.z);
    const currentPos = sorted.findIndex(entry => entry.index === layerIndex);
    const swapPos = direction === 'up' ? currentPos + 1 : currentPos - 1;
    if (currentPos < 0 || swapPos < 0 || swapPos >= sorted.length) return;
    const target = sorted[swapPos];
    const currentZ = getLayerZ(layer, layerIndex);
    const targetZ = getLayerZ(target.item, target.index);
    layer.runtime_z = targetZ;
    target.item.runtime_z = currentZ;
    if (typeof captureSelectedLayerToAnimation === 'function') {
      selectedLayerIndex = layerIndex;
      captureSelectedLayerToAnimation(projectState.playback.currentFrame, 'step');
      selectedLayerIndex = target.index;
      captureSelectedLayerToAnimation(projectState.playback.currentFrame, 'step');
      selectedLayerIndex = layerIndex;
    }
    if (typeof applyAnimationAtCurrentFrame === 'function') applyAnimationAtCurrentFrame();
    return;
  }

  const currentZ = layer.zOrder !== undefined ? layer.zOrder : layerIndex;
  const targetZ = currentZ + (direction === 'up' ? 1 : -1);
  const swapLayer = psdLayers.find((item, index) => index !== layerIndex && (item.zOrder !== undefined ? item.zOrder : index) === targetZ);
  if (!swapLayer) return;
  swapLayer.zOrder = currentZ;
  layer.zOrder = targetZ;
  normalizeBaseLayerOrder();
  saveBindPose();
  updateLayerList();
  updateProps();
  render();
}

function moveLayerGroupInStack(groupPath, direction) {
  const normalized = normalizeLayerUiGroup(groupPath || '');
  if (!normalized) return;
  const useCurrentRuntime = projectState.editorMode === 'animation' && typeof getCurrentAnimation === 'function' && getCurrentAnimation();
  const ordered = getLayerStackEntries(!!useCurrentRuntime);
  const movingEntries = ordered.filter(entry => isLayerInsideGroupPath(entry.layer, normalized));
  if (!movingEntries.length) return;

  const movingIndexSet = new Set(movingEntries.map(entry => entry.index));
  const movingPositions = ordered
    .map((entry, position) => movingIndexSet.has(entry.index) ? position : -1)
    .filter(position => position !== -1);
  const minPos = Math.min(...movingPositions);
  const maxPos = Math.max(...movingPositions);

  let adjacentBlock = [];
  if (direction === 'up') {
    let startPos = -1;
    for (let pos = maxPos + 1; pos < ordered.length; pos++) {
      if (movingIndexSet.has(ordered[pos].index)) continue;
      startPos = pos;
      break;
    }
    if (startPos === -1) return;
    adjacentBlock.push(ordered[startPos]);
    for (let pos = startPos + 1; pos < ordered.length; pos++) {
      if (movingIndexSet.has(ordered[pos].index)) break;
      adjacentBlock.push(ordered[pos]);
    }
  } else {
    let startPos = -1;
    for (let pos = minPos - 1; pos >= 0; pos--) {
      if (movingIndexSet.has(ordered[pos].index)) continue;
      startPos = pos;
      break;
    }
    if (startPos === -1) return;
    adjacentBlock.unshift(ordered[startPos]);
    for (let pos = startPos - 1; pos >= 0; pos--) {
      if (movingIndexSet.has(ordered[pos].index)) break;
      adjacentBlock.unshift(ordered[pos]);
    }
  }
  if (!adjacentBlock.length) return;

  const remainingEntries = ordered.filter(entry => !movingIndexSet.has(entry.index));
  const referenceIndex = direction === 'up'
    ? adjacentBlock[adjacentBlock.length - 1].index
    : adjacentBlock[0].index;
  const targetIndexInRemaining = remainingEntries.findIndex(entry => entry.index === referenceIndex);
  if (targetIndexInRemaining === -1) return;
  const insertIndex = direction === 'up' ? targetIndexInRemaining + 1 : targetIndexInRemaining;
  const nextOrdered = [
    ...remainingEntries.slice(0, insertIndex),
    ...movingEntries,
    ...remainingEntries.slice(insertIndex)
  ];

  applyLayerStackOrder(nextOrdered, { runtime: !!useCurrentRuntime });
}

function drawGrid() {
  const step = 100;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1 / view.scale;
  for (let x = -2000; x < 2000; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, -2000);
    ctx.lineTo(x, 2000);
    ctx.stroke();
  }
  for (let y = -2000; y < 2000; y += step) {
    ctx.beginPath();
    ctx.moveTo(-2000, y);
    ctx.lineTo(2000, y);
    ctx.stroke();
  }
}

function drawBoneShape(x, y, ex, ey, color, selected) {
  const dx = ex - x;
  const dy = ey - y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len;
  const ny = dx / len;
  const w = Math.max(4, Math.min(12, len * 0.12)) / view.scale;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * 0.2 + nx * w, y + dy * 0.2 + ny * w);
  ctx.lineTo(ex, ey);
  ctx.lineTo(x + dx * 0.2 - nx * w, y + dy * 0.2 - ny * w);
  ctx.closePath();
  ctx.fillStyle = color + (selected ? 'cc' : '66');
  ctx.fill();
  ctx.strokeStyle = MESH_THEME.normalVertexStroke;
  ctx.lineWidth = selected ? 2 / view.scale : 1 / view.scale;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 5 / view.scale, 0, Math.PI * 2);
  ctx.fillStyle = selected ? color : color + 'aa';
  ctx.fill();
  ctx.strokeStyle = MESH_THEME.normalVertexStroke;
  ctx.lineWidth = 1 / view.scale;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ex, ey, 3 / view.scale, 0, Math.PI * 2);
  ctx.fillStyle = color + '88';
  ctx.fill();
}

function getBoneGizmoRadius(bone) {
  return Math.max(42 / view.scale, Math.min(120 / view.scale, getBoneLength(bone) * 0.72));
}

function getBoneGizmoHit(bone, wx, wy) {
  if (!bone || activeTool !== 'pose') return null;
  const radius = getBoneGizmoRadius(bone);
  const distance = Math.hypot(wx - bone.x, wy - bone.y);
  const lineWidth = 14 / view.scale;
  if (Math.abs(distance - radius) <= lineWidth) return { bone, radius };
  return null;
}

function getAnyBoneGizmoHit(wx, wy) {
  if (activeTool !== 'pose') return null;
  const selectedBone = getBoneById(selectedId);
  const selectedHit = getBoneGizmoHit(selectedBone, wx, wy);
  if (selectedHit) return selectedHit;
  for (const bone of [...bones].reverse()) {
    const hit = getBoneGizmoHit(bone, wx, wy);
    if (hit) return hit;
  }
  return null;
}

function drawRotationGizmo(bone) {
  if (!bone || activeTool !== 'pose' || !layers.bones) return;
  const radius = getBoneGizmoRadius(bone);
  const lineWidth = 8 / view.scale;
  const colors = [
    { color: '#ff5f57', start: -Math.PI * 0.05, end: Math.PI * 0.55 },
    { color: '#4ec9b0', start: Math.PI * 0.62, end: Math.PI * 1.22 },
    { color: '#569cff', start: Math.PI * 1.29, end: Math.PI * 1.88 }
  ];

  ctx.save();
  ctx.globalAlpha = 0.95;
  colors.forEach(segment => {
    ctx.beginPath();
    ctx.arc(bone.x, bone.y, radius, segment.start, segment.end);
    ctx.strokeStyle = segment.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.arc(bone.x, bone.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2 / view.scale;
  ctx.setLineDash([6 / view.scale, 7 / view.scale]);
  ctx.stroke();
  ctx.setLineDash([]);

  const angle = getBoneRotationDeg(bone) * Math.PI / 180;
  const handleX = bone.x + Math.cos(angle) * radius;
  const handleY = bone.y + Math.sin(angle) * radius;
  ctx.beginPath();
  ctx.arc(handleX, handleY, 8 / view.scale, 0, Math.PI * 2);
  ctx.fillStyle = '#fff4a8';
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2 / view.scale;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(bone.x, bone.y, 7 / view.scale, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.stroke();
  ctx.restore();
}

function drawBone(bone) {
  if (!layers.bones) return;
  const selected = bone.id === selectedId;
  const depth = getBoneDepth(bone);
  const color = bone.id === 0 ? '#888780' : getColor(depth);
  bone.color = color;

  if (bone.parent !== null) {
    const parent = getBoneById(bone.parent);
    if (parent) {
      ctx.beginPath();
      ctx.moveTo(parent.ex, parent.ey);
      ctx.lineTo(bone.x, bone.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / view.scale;
      ctx.setLineDash([4 / view.scale, 4 / view.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawBoneShape(bone.x, bone.y, bone.ex, bone.ey, color, selected);

  const shouldDrawNames = layers.names && !(projectState.playback && projectState.playback.isPlaying);
  if (shouldDrawNames) {
    ctx.fillStyle = '#fff';
    ctx.font = `${12 / view.scale}px sans-serif`;
    ctx.fillText(bone.name, bone.x + 10 / view.scale, bone.y - 6 / view.scale);
  }
}

function render() {
  const profiler = frogmakerProfiler();
  if (profiler && profiler.isEnabled()) profiler.beginFrame('render');
  let meshTriangles = 0;
  let overlayTriangles = 0;
  let meshLayerCount = 0;
  const renderLayers = layers.images ? getRenderableLayers() : [];
  const usePixiLayerRenderer = !!(
    layers.images &&
    FrogmakerModules.pixiRenderer &&
    FrogmakerModules.pixiRenderer.isAvailable() &&
    FrogmakerModules.pixiRenderer.ensureApp()
  );

  (profiler && profiler.isEnabled() ? () => profiler.measureStage('applyMeshControllers', () => applyMeshControllers()) : () => applyMeshControllers())();
  (profiler && profiler.isEnabled() ? () => profiler.measureStage('applyIkConstraints', () => applyIkConstraints()) : () => applyIkConstraints())();
  if (projectState.editorMode === 'rig') {
    (profiler && profiler.isEnabled() ? () => profiler.measureStage('syncRigLayers', () => syncRigBoundLayersToBones()) : () => syncRigBoundLayersToBones())();
  }
  (profiler && profiler.isEnabled() ? () => profiler.measureStage('applyDrivenConstraints', () => applyDrivenConstraints('all')) : () => applyDrivenConstraints('all'))();
  if (projectState.editorMode === 'rig') {
    (profiler && profiler.isEnabled()
      ? () => profiler.measureStage('applySecondaryMotion', () => applySecondaryMotion(getSecondaryMotionDeltaTime(), 'rig'))
      : () => applySecondaryMotion(getSecondaryMotionDeltaTime(), 'rig'))();
  }
  if (usePixiLayerRenderer) {
    (profiler && profiler.isEnabled()
      ? () => profiler.measureStage('pixiRender', () => FrogmakerModules.pixiRenderer.renderScene(renderLayers, {
          getRenderMeshVertices,
          getLayerRenderVisible,
          getLayerZ
        }))
      : () => FrogmakerModules.pixiRenderer.renderScene(renderLayers, {
          getRenderMeshVertices,
          getLayerRenderVisible,
          getLayerZ
        }))();
  } else if (FrogmakerModules.pixiRenderer && FrogmakerModules.pixiRenderer.isActive()) {
    FrogmakerModules.pixiRenderer.renderScene([], {
      getRenderMeshVertices,
      getLayerRenderVisible,
      getLayerZ
    });
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);

  if (layers.grid) {
    (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawGrid', () => drawGrid()) : () => drawGrid())();
  }
  (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawVideoReference', () => drawVideoReference()) : () => drawVideoReference())();

  if (layers.images && typeof drawOnionSkins === 'function') {
    (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawOnionSkins', () => drawOnionSkins(ctx)) : () => drawOnionSkins(ctx))();
  }

  if (layers.images) {
    if (profiler && profiler.isEnabled()) profiler.setCounter('renderableLayers', renderLayers.length);
    if (usePixiLayerRenderer) {
      renderLayers.forEach(({ layer }) => {
        if (layer && layer.mesh && layer.mesh.indices && layer.mesh.uvs) {
          meshLayerCount += 1;
          meshTriangles += Math.floor(layer.mesh.indices.length / 3);
        }
      });
    }
    ctx.globalAlpha = 1;
    (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawLayers', () => {
      renderLayers.forEach(({ layer, index }) => {
        if (!layer.img_element) return;
        
        if (!getLayerRenderVisible(layer)) return;
        ctx.save();
        ctx.translate(layer.center_x, layer.center_y);
        ctx.rotate(layer.rotation || 0);

        if (!usePixiLayerRenderer && layer.mesh && layer.mesh.indices && layer.mesh.uvs) {
          meshLayerCount += 1;
          const vertices = getRenderMeshVertices(layer);
          const triangleCount = Math.floor(layer.mesh.indices.length / 3);
          meshTriangles += triangleCount;
          for (let i = 0; i < layer.mesh.indices.length; i += 3) {
            const i0 = layer.mesh.indices[i];
            const i1 = layer.mesh.indices[i + 1];
            const i2 = layer.mesh.indices[i + 2];
            if (!vertices[i0] || !vertices[i1] || !vertices[i2] || !layer.mesh.uvs[i0] || !layer.mesh.uvs[i1] || !layer.mesh.uvs[i2]) continue;
            drawTexturedTriangle(
              ctx,
              layer.img_element,
              meshPointToLayerLocal(layer, vertices[i0]),
              meshPointToLayerLocal(layer, vertices[i1]),
              meshPointToLayerLocal(layer, vertices[i2]),
              layer.mesh.uvs[i0],
              layer.mesh.uvs[i1],
              layer.mesh.uvs[i2]
            );
          }

          if (projectState.heatmap && projectState.heatmap.enabled && layer.mesh.skinWeights) {
            drawSkinWeightHeatmap(ctx, layer, bones, {
              mode: projectState.heatmap.mode,
              selectedBoneId: projectState.heatmap.selectedBoneId,
              opacity: projectState.heatmap.opacity
            });
          }

          if (activeTool === 'pins' && selectedLayerIndex === index) {
            const meshEditor = ensureMeshEditorState();
            const overlayVertices = getEditableMeshVertices(layer);
            const softWeights = meshEditor.selectedVertexIds.length
              ? buildSoftSelectionWeights(layer, meshEditor.selectedVertexIds, meshEditor.softSelectionRadius, meshEditor.softSelectionStrength)
              : new Map();
            ctx.strokeStyle = MESH_THEME.internalStroke;
            ctx.lineWidth = 1 / view.scale;
            overlayTriangles += triangleCount;
            for (let i = 0; i < layer.mesh.indices.length; i += 3) {
              const i0 = layer.mesh.indices[i];
              const i1 = layer.mesh.indices[i + 1];
              const i2 = layer.mesh.indices[i + 2];
              if (!overlayVertices[i0] || !overlayVertices[i1] || !overlayVertices[i2]) continue;
              const p0 = meshPointToLayerLocal(layer, overlayVertices[i0]);
              const p1 = meshPointToLayerLocal(layer, overlayVertices[i1]);
              const p2 = meshPointToLayerLocal(layer, overlayVertices[i2]);
              ctx.beginPath();
              ctx.moveTo(p0.x, p0.y);
              ctx.lineTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.closePath();
              ctx.stroke();
            }

            overlayVertices.forEach((vertex, vertexIndex) => {
              const localVertex = meshPointToLayerLocal(layer, vertex);
              const selected = projectState.meshEditor.selectedVertexIds.includes(vertexIndex);
              const softWeight = softWeights.get(vertexIndex) || 0;
              ctx.beginPath();
              ctx.arc(localVertex.x, localVertex.y, (selected ? 5 : 4) / view.scale, 0, Math.PI * 2);
              ctx.fillStyle = selected ? '#ffcf5a' : (softWeight > 0 ? `rgba(120,220,255,${clamp(0.2 + softWeight * 0.6, 0.2, 0.8)})` : '#44dddd');
              ctx.fill();
              ctx.strokeStyle = MESH_THEME.normalVertexStroke;
              ctx.lineWidth = 0.8 / view.scale;
              ctx.stroke();
            });

            (layer.meshPins || []).forEach(pin => {
              const pinLocal = meshPointToLayerLocal(layer, pin.centerLocal);
              const selected = projectState.meshEditor.selectedPinId === pin.id;
              ctx.beginPath();
              ctx.arc(pinLocal.x, pinLocal.y, pin.radius, 0, Math.PI * 2);
              ctx.strokeStyle = selected ? MESH_THEME.selectedPinStroke : MESH_THEME.pinStroke;
              ctx.lineWidth = 1 / view.scale;
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(pinLocal.x, pinLocal.y, 6 / view.scale, 0, Math.PI * 2);
              ctx.fillStyle = selected ? MESH_THEME.selectedPinFill : MESH_THEME.pinFill;
              ctx.fill();
              ctx.strokeStyle = MESH_THEME.normalVertexStroke;
              ctx.stroke();
              if (selected) {
                ctx.strokeStyle = MESH_THEME.pinStroke;
                ctx.lineWidth = 1 / view.scale;
                pin.vertexIds.forEach(vertexId => {
                  const pinVertex = overlayVertices[vertexId];
                  if (!pinVertex) return;
                  const pinVertexLocal = meshPointToLayerLocal(layer, pinVertex);
                  ctx.beginPath();
                  ctx.moveTo(pinLocal.x, pinLocal.y);
                  ctx.lineTo(pinVertexLocal.x, pinVertexLocal.y);
                  ctx.stroke();
                });
              }
            });

            if (meshSelectionBox && meshSelectionBox.layerIndex === index) {
              const box = meshSelectionBox;
              const minX = Math.min(box.startLocal.x, box.currentLocal.x);
              const minY = Math.min(box.startLocal.y, box.currentLocal.y);
              const width = Math.abs(box.currentLocal.x - box.startLocal.x);
              const height = Math.abs(box.currentLocal.y - box.startLocal.y);
              ctx.save();
              ctx.fillStyle = 'rgba(79,180,255,0.12)';
              ctx.strokeStyle = 'rgba(79,180,255,0.85)';
              ctx.lineWidth = 1 / view.scale;
              ctx.setLineDash([5 / view.scale, 4 / view.scale]);
              ctx.fillRect(minX, minY, width, height);
              ctx.strokeRect(minX, minY, width, height);
              ctx.restore();
            }
          }
        } else if (!usePixiLayerRenderer) {
          ctx.drawImage(layer.img_element, -layer.width / 2, -layer.height / 2);
        }

        if (projectState.editorMode === 'rig' && activeTool === 'pins' && projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === layer.uid) {
          const contourPoints = projectState.meshEditor.manualContourPoints || [];
          const interiorPoints = projectState.meshEditor.manualInteriorPoints || [];
          const preview = getManualMeshPreview(contourPoints, interiorPoints);
          if (preview && preview.indices.length) {
            ctx.save();
            ctx.lineWidth = 1.1 / view.scale;
            ctx.strokeStyle = MESH_THEME.internalStroke;
            overlayTriangles += Math.floor(preview.indices.length / 3);
            for (let i = 0; i < preview.indices.length; i += 3) {
              const a = preview.vertices[preview.indices[i]];
              const b = preview.vertices[preview.indices[i + 1]];
              const c = preview.vertices[preview.indices[i + 2]];
              if (!a || !b || !c) continue;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.lineTo(c.x, c.y);
              ctx.closePath();
              ctx.stroke();
            }
            ctx.restore();
          }
          if (contourPoints.length > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
            for (let i = 1; i < contourPoints.length; i++) ctx.lineTo(contourPoints[i].x, contourPoints[i].y);
            if (contourPoints.length >= 3) ctx.closePath();
            ctx.strokeStyle = MESH_THEME.contourPreviewStroke;
            ctx.lineWidth = 2 / view.scale;
            ctx.stroke();
            if (contourPoints.length >= 3) {
              ctx.fillStyle = MESH_THEME.contourPreviewFill;
              ctx.fill();
            }
            ctx.restore();
          }
          contourPoints.forEach((point, index) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 / view.scale, 0, Math.PI * 2);
            ctx.fillStyle = index === 0 ? MESH_THEME.manualStartPointFill : MESH_THEME.manualContourPointFill;
            ctx.fill();
            ctx.strokeStyle = MESH_THEME.manualPointStroke;
            ctx.lineWidth = 1 / view.scale;
            ctx.stroke();
          });
          interiorPoints.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4.4 / view.scale, 0, Math.PI * 2);
            ctx.fillStyle = MESH_THEME.manualInteriorPointFill;
            ctx.fill();
            ctx.strokeStyle = MESH_THEME.manualPointStroke;
            ctx.lineWidth = 1 / view.scale;
            ctx.stroke();
          });
        }
        ctx.restore();
      });
    }) : () => {
      getRenderableLayers().forEach(({ layer, index }) => {
      if (!layer.img_element) return;
      if (!getLayerRenderVisible(layer)) return;
      ctx.save();
      ctx.translate(layer.center_x, layer.center_y);
      ctx.rotate(layer.rotation || 0);

      if (!usePixiLayerRenderer && layer.mesh && layer.mesh.indices && layer.mesh.uvs) {
        const vertices = getRenderMeshVertices(layer);
        for (let i = 0; i < layer.mesh.indices.length; i += 3) {
          const i0 = layer.mesh.indices[i];
          const i1 = layer.mesh.indices[i + 1];
          const i2 = layer.mesh.indices[i + 2];
          if (!vertices[i0] || !vertices[i1] || !vertices[i2] || !layer.mesh.uvs[i0] || !layer.mesh.uvs[i1] || !layer.mesh.uvs[i2]) continue;
          drawTexturedTriangle(
            ctx,
            layer.img_element,
            meshPointToLayerLocal(layer, vertices[i0]),
            meshPointToLayerLocal(layer, vertices[i1]),
            meshPointToLayerLocal(layer, vertices[i2]),
            layer.mesh.uvs[i0],
            layer.mesh.uvs[i1],
            layer.mesh.uvs[i2]
          );
        }

        if (projectState.heatmap && projectState.heatmap.enabled && layer.mesh.skinWeights) {
          drawSkinWeightHeatmap(ctx, layer, bones, {
            mode: projectState.heatmap.mode,
            selectedBoneId: projectState.heatmap.selectedBoneId,
            opacity: projectState.heatmap.opacity
          });
        }

        if (activeTool === 'pins' && selectedLayerIndex === index) {
          const meshEditor = ensureMeshEditorState();
          const overlayVertices = getEditableMeshVertices(layer);
          const softWeights = meshEditor.selectedVertexIds.length
            ? buildSoftSelectionWeights(layer, meshEditor.selectedVertexIds, meshEditor.softSelectionRadius, meshEditor.softSelectionStrength)
            : new Map();
          ctx.strokeStyle = MESH_THEME.internalStroke;
          ctx.lineWidth = 1 / view.scale;
          for (let i = 0; i < layer.mesh.indices.length; i += 3) {
            const i0 = layer.mesh.indices[i];
            const i1 = layer.mesh.indices[i + 1];
            const i2 = layer.mesh.indices[i + 2];
            if (!overlayVertices[i0] || !overlayVertices[i1] || !overlayVertices[i2]) continue;
            const p0 = meshPointToLayerLocal(layer, overlayVertices[i0]);
            const p1 = meshPointToLayerLocal(layer, overlayVertices[i1]);
            const p2 = meshPointToLayerLocal(layer, overlayVertices[i2]);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.stroke();
          }

          overlayVertices.forEach((vertex, vertexIndex) => {
            const localVertex = meshPointToLayerLocal(layer, vertex);
            const selected = projectState.meshEditor.selectedVertexIds.includes(vertexIndex);
            const softWeight = softWeights.get(vertexIndex) || 0;
            ctx.beginPath();
            ctx.arc(localVertex.x, localVertex.y, (selected ? 5 : 4) / view.scale, 0, Math.PI * 2);
            ctx.fillStyle = selected ? '#ffcf5a' : (softWeight > 0 ? `rgba(120,220,255,${clamp(0.2 + softWeight * 0.6, 0.2, 0.8)})` : '#44dddd');
            ctx.fill();
            ctx.strokeStyle = MESH_THEME.normalVertexStroke;
            ctx.lineWidth = 0.8 / view.scale;
            ctx.stroke();
          });

          (layer.meshPins || []).forEach(pin => {
            const pinLocal = meshPointToLayerLocal(layer, pin.centerLocal);
            const selected = projectState.meshEditor.selectedPinId === pin.id;
            ctx.beginPath();
            ctx.arc(pinLocal.x, pinLocal.y, pin.radius, 0, Math.PI * 2);
            ctx.strokeStyle = selected ? MESH_THEME.selectedPinStroke : MESH_THEME.pinStroke;
            ctx.lineWidth = 1 / view.scale;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(pinLocal.x, pinLocal.y, 6 / view.scale, 0, Math.PI * 2);
            ctx.fillStyle = selected ? MESH_THEME.selectedPinFill : MESH_THEME.pinFill;
            ctx.fill();
            ctx.strokeStyle = MESH_THEME.normalVertexStroke;
            ctx.stroke();
            if (selected) {
              ctx.strokeStyle = MESH_THEME.pinStroke;
              ctx.lineWidth = 1 / view.scale;
              pin.vertexIds.forEach(vertexId => {
                const pinVertex = overlayVertices[vertexId];
                if (!pinVertex) return;
                const pinVertexLocal = meshPointToLayerLocal(layer, pinVertex);
                ctx.beginPath();
                ctx.moveTo(pinLocal.x, pinLocal.y);
                ctx.lineTo(pinVertexLocal.x, pinVertexLocal.y);
                ctx.stroke();
              });
            }
          });

          if (meshSelectionBox && meshSelectionBox.layerIndex === index) {
            const box = meshSelectionBox;
            const minX = Math.min(box.startLocal.x, box.currentLocal.x);
            const minY = Math.min(box.startLocal.y, box.currentLocal.y);
            const width = Math.abs(box.currentLocal.x - box.startLocal.x);
            const height = Math.abs(box.currentLocal.y - box.startLocal.y);
            ctx.save();
            ctx.fillStyle = 'rgba(79,180,255,0.12)';
            ctx.strokeStyle = 'rgba(79,180,255,0.85)';
            ctx.lineWidth = 1 / view.scale;
            ctx.setLineDash([5 / view.scale, 4 / view.scale]);
            ctx.fillRect(minX, minY, width, height);
            ctx.strokeRect(minX, minY, width, height);
            ctx.restore();
          }
        }
      } else if (!usePixiLayerRenderer) {
        ctx.drawImage(layer.img_element, -layer.width / 2, -layer.height / 2);
      }

      if (projectState.editorMode === 'rig' && activeTool === 'pins' && projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === layer.uid) {
        const contourPoints = projectState.meshEditor.manualContourPoints || [];
        const interiorPoints = projectState.meshEditor.manualInteriorPoints || [];
        const preview = getManualMeshPreview(contourPoints, interiorPoints);
        if (preview && preview.indices.length) {
          ctx.save();
          ctx.lineWidth = 1.1 / view.scale;
          ctx.strokeStyle = MESH_THEME.internalStroke;
          for (let i = 0; i < preview.indices.length; i += 3) {
            const a = preview.vertices[preview.indices[i]];
            const b = preview.vertices[preview.indices[i + 1]];
            const c = preview.vertices[preview.indices[i + 2]];
            if (!a || !b || !c) continue;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.closePath();
            ctx.stroke();
          }
          ctx.restore();
        }
        if (contourPoints.length > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
          for (let i = 1; i < contourPoints.length; i++) ctx.lineTo(contourPoints[i].x, contourPoints[i].y);
          if (contourPoints.length >= 3) ctx.closePath();
          ctx.strokeStyle = MESH_THEME.contourPreviewStroke;
          ctx.lineWidth = 2 / view.scale;
          ctx.stroke();
          if (contourPoints.length >= 3) {
            ctx.fillStyle = MESH_THEME.contourPreviewFill;
            ctx.fill();
          }
          ctx.restore();
        }
        contourPoints.forEach((point, index) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5 / view.scale, 0, Math.PI * 2);
          ctx.fillStyle = index === 0 ? MESH_THEME.manualStartPointFill : MESH_THEME.manualContourPointFill;
          ctx.fill();
          ctx.strokeStyle = MESH_THEME.manualPointStroke;
          ctx.lineWidth = 1 / view.scale;
          ctx.stroke();
        });
        interiorPoints.forEach(point => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4.4 / view.scale, 0, Math.PI * 2);
          ctx.fillStyle = MESH_THEME.manualInteriorPointFill;
          ctx.fill();
          ctx.strokeStyle = MESH_THEME.manualPointStroke;
          ctx.lineWidth = 1 / view.scale;
          ctx.stroke();
        });
      }
      ctx.restore();
      });
    })();
    ctx.globalAlpha = 1;
  }

  if (activeTool === 'stitchBrush') {
    (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawMeshStitches', () => drawMeshStitches(ctx)) : () => drawMeshStitches(ctx))();
  }

  if (activeTool === 'weightBrush' && weightBrushWorld) {
    (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawWeightBrush', () => drawWeightBrush(ctx, weightBrushWorld.x, weightBrushWorld.y)) : () => drawWeightBrush(ctx, weightBrushWorld.x, weightBrushWorld.y))();
  }
  if (activeTool === 'stitchBrush' && stitchBrushWorld) {
    (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawStitchBrush', () => drawStitchBrush(ctx, stitchBrushWorld.x, stitchBrushWorld.y)) : () => drawStitchBrush(ctx, stitchBrushWorld.x, stitchBrushWorld.y))();
  }

  (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawBones', () => bones.forEach(drawBone)) : () => bones.forEach(drawBone))();
  (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawIkConstraints', () => drawIkConstraints(ctx)) : () => drawIkConstraints(ctx))();
  (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawDrivenConstraints', () => drawDrivenConstraints(ctx)) : () => drawDrivenConstraints(ctx))();
  (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawRotationGizmo', () => drawRotationGizmo(getBoneById(selectedId))) : () => drawRotationGizmo(getBoneById(selectedId)))();

  if (dragPreview) {
    ctx.strokeStyle = '#378ADD';
    ctx.lineWidth = 2 / view.scale;
    ctx.setLineDash([4 / view.scale, 4 / view.scale]);
    drawBoneShape(dragPreview.x, dragPreview.y, dragPreview.ex, dragPreview.ey, '#378ADD', false);
    ctx.setLineDash([]);
  }

  (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawCameraFrame', () => drawCameraFrame(ctx)) : () => drawCameraFrame(ctx))();
  (profiler && profiler.isEnabled() ? () => profiler.measureStage('drawCameraMiniGizmo', () => drawCameraMiniGizmo(ctx)) : () => drawCameraMiniGizmo(ctx))();

  ctx.restore();
  if (profiler && profiler.isEnabled()) {
    profiler.setCounter('meshTriangles', meshTriangles);
    profiler.setCounter('overlayTriangles', overlayTriangles);
    profiler.setCounter('meshLayers', meshLayerCount);
    profiler.setCounter('boneCount', bones.length);
    profiler.setCounter('layerCount', psdLayers.length);
    profiler.endFrame();
  }
}

function getBoneAt(wx, wy) {
  const r = 15 / view.scale;
  return [...bones].reverse().find(bone => {
    const dStart = Math.hypot(bone.x - wx, bone.y - wy);
    if (dStart < r) return true;
    return Math.hypot(bone.ex - wx, bone.ey - wy) < r;
  });
}

function getCurrentBoneLocalTransform(bone) {
  const rotation = getBoneRotationDeg(bone);
  const length = getBoneLength(bone);
  if (bone.parent === null) return { x: bone.x, y: bone.y, rotation, length };
  const parent = getBoneById(bone.parent);
  if (!parent) return { x: bone.x, y: bone.y, rotation, length };
  const parentRotation = getBoneRotationDeg(parent) * Math.PI / 180;
  const relX = bone.x - parent.ex;
  const relY = bone.y - parent.ey;
  return {
    x: relX * Math.cos(-parentRotation) - relY * Math.sin(-parentRotation),
    y: relX * Math.sin(-parentRotation) + relY * Math.cos(-parentRotation),
    rotation: normalizeAngleDeg(rotation - getBoneRotationDeg(parent)),
    length
  };
}

function getCurrentLayerLocalTransform(layerIndex) {
  const layer = getLayerByIndex(layerIndex);
  if (!layer) return null;
  const parentBone = layer.bone_id !== null ? getBoneById(layer.bone_id) : null;
  const zOrder = layer.runtime_z !== undefined ? layer.runtime_z : (layer.zOrder !== undefined ? layer.zOrder : layerIndex);
  const visible = layer.runtime_visible !== undefined ? layer.runtime_visible : layer.visible !== false;
  if (!parentBone) {
    return { x: layer.center_x, y: layer.center_y, rotation: (layer.rotation || 0) * 180 / Math.PI, zOrder, visible };
  }
  const parentRotation = getBoneRotationDeg(parentBone) * Math.PI / 180;
  const relX = layer.center_x - parentBone.x;
  const relY = layer.center_y - parentBone.y;
  return {
    x: relX * Math.cos(-parentRotation) - relY * Math.sin(-parentRotation),
    y: relX * Math.sin(-parentRotation) + relY * Math.cos(-parentRotation),
    rotation: normalizeAngleDeg((layer.rotation || 0) * 180 / Math.PI - getBoneRotationDeg(parentBone)),
    zOrder,
    visible
  };
}

function syncBoundLayerTransforms(slotResolver, options = {}) {
  const includeUnbound = !!options.includeUnbound;
  psdLayers.forEach((layer, index) => {
    const slotLocal = slotResolver(index, layer);
    if (!slotLocal) return;
    const parentBone = layer.bone_id !== null && layer.bone_id !== undefined ? getBoneById(layer.bone_id) : null;
    if (!parentBone && !includeUnbound) return;
    if (!parentBone) {
      layer.center_x = slotLocal.x;
      layer.center_y = slotLocal.y;
      layer.rotation = (slotLocal.rotation || 0) * Math.PI / 180;
    } else {
      const start = localPointToWorld(slotLocal.x, slotLocal.y, parentBone.x, parentBone.y, getBoneRotationDeg(parentBone));
      layer.center_x = start.x;
      layer.center_y = start.y;
      layer.rotation = (getBoneRotationDeg(parentBone) + (slotLocal.rotation || 0)) * Math.PI / 180;
    }
    if (slotLocal.visible !== undefined) layer.runtime_visible = slotLocal.visible;
    if (slotLocal.zOrder !== undefined) layer.runtime_z = slotLocal.zOrder;
  });
}

function syncRigBoundLayersToBones() {
  const slotLocals = projectState.bindPose && projectState.bindPose.slots ? projectState.bindPose.slots : {};
  syncBoundLayerTransforms(index => slotLocals[index] || null, { includeUnbound: false });
}
function captureBindPose() {
  projectState.bindPose.bones = {};
  bones.forEach(bone => { projectState.bindPose.bones[bone.id] = getCurrentBoneLocalTransform(bone); });
  projectState.bindPose.slots = {};
  psdLayers.forEach((layer, index) => { projectState.bindPose.slots[index] = getCurrentLayerLocalTransform(index); });
}

function saveBindPose() {
  resetSecondaryMotionState('save-bind-pose');
  bones.forEach(bone => {
    bone.orig_x = bone.x;
    bone.orig_y = bone.y;
    bone.orig_ex = bone.ex;
    bone.orig_ey = bone.ey;
  });
  psdLayers.forEach((layer, index) => {
    ensureLayerIdentity(layer);
    layer.orig_center_x = layer.center_x;
    layer.orig_center_y = layer.center_y;
    layer.orig_rotation = layer.rotation || 0;
    layer.orig_visible = layer.visible !== false;
    layer.orig_zOrder = layer.zOrder !== undefined ? layer.zOrder : index;
    layer.orig_role = layer.role || 'controller';
    if (layer.mesh) {
      ensureLayerMesh(layer);
      layer.mesh.animatedVertices = null;
      layer.orig_mesh_bindVertices = cloneVertices(layer.mesh.bindVertices);
      layer.mesh.runtimeVertices = cloneVertices(layer.mesh.bindVertices);
      layer.mesh.vertices = cloneVertices(layer.mesh.bindVertices);
    }
    if (layer.meshPins) {
      layer.meshPins.forEach(pin => {
        pin.bindControllerWorld = pin.controllerLayerId ? getControllerTransform(pin.controllerLayerId) : null;
        updatePinCenterFromVertices(layer, pin);
      });
      layer.orig_meshPins = JSON.parse(JSON.stringify(layer.meshPins));
    }
  });
  captureBindPose();
  if (typeof applyAnimationAtCurrentFrame === 'function' && projectState.editorMode === 'animation' && getCurrentAnimation()) applyAnimationAtCurrentFrame();
  else render();
  pushUndoSnapshot();
}

function restorePose() {
  resetSecondaryMotionState('restore-pose');
  bones.forEach(bone => {
    if (bone.orig_x !== undefined) {
      bone.x = bone.orig_x;
      bone.y = bone.orig_y;
      bone.ex = bone.orig_ex;
      bone.ey = bone.orig_ey;
    }
  });
  psdLayers.forEach((layer, index) => {
    if (layer.orig_center_x !== undefined) {
      ensureLayerIdentity(layer);
      layer.center_x = layer.orig_center_x;
      layer.center_y = layer.orig_center_y;
      layer.rotation = layer.orig_rotation || 0;
      layer.visible = layer.orig_visible !== false;
      layer.runtime_visible = layer.visible;
      layer.zOrder = layer.orig_zOrder !== undefined ? layer.orig_zOrder : index;
      layer.runtime_z = layer.zOrder;
      layer.role = layer.orig_role || layer.role || 'controller';
      if (layer.mesh && layer.orig_mesh_bindVertices) {
        layer.mesh.bindVertices = cloneVertices(layer.orig_mesh_bindVertices);
        layer.mesh.animatedVertices = null;
        layer.mesh.runtimeVertices = cloneVertices(layer.orig_mesh_bindVertices);
        layer.mesh.vertices = cloneVertices(layer.orig_mesh_bindVertices);
      }
      if (layer.orig_meshPins) {
        layer.meshPins = JSON.parse(JSON.stringify(layer.orig_meshPins));
      }
    }
  });
  render();
}

function updateTree() {
  const tree = document.getElementById('bone-tree');
  tree.innerHTML = '';

  function renderNode(bone, depth) {
    const div = document.createElement('div');
    div.className = 'bone-item' + (bone.id === selectedId ? ' selected' : '');
    div.style.paddingLeft = (8 + depth * 12) + 'px';
    div.innerHTML = `<span class="bone-dot" style="background:${bone.color || '#888'}"></span><span>${bone.name}</span>`;
    div.onclick = () => {
      selectedId = bone.id;
      selectedLayerIndex = null;
      projectState.timeline.selectedType = 'bone';
      projectState.timeline.selectedTargetId = bone.id;
      updateTree();
      updateLayerList();
      updateProps();
      if (typeof renderTimeline === 'function') renderTimeline();
      render();
    };
    tree.appendChild(div);
    bones.filter(child => child.parent === bone.id).forEach(child => renderNode(child, depth + 1));
  }

  bones.filter(bone => bone.parent === null).forEach(rootBone => renderNode(rootBone, 0));
}

function toggleLayerTreeGroupCollapsed(groupPath) {
  const treeState = ensureLayerTreeState();
  const key = String(groupPath || '');
  treeState.collapsedGroups[key] = !treeState.collapsedGroups[key];
  updateLayerList();
}

function isLayerTreeGroupCollapsed(groupPath) {
  const treeState = ensureLayerTreeState();
  return !!treeState.collapsedGroups[String(groupPath || '')];
}

function setSoloLayerGroup(groupPath = null) {
  const treeState = ensureLayerTreeState();
  const normalized = normalizeLayerUiGroup(groupPath || '');
  treeState.soloGroup = normalized || null;
  updateLayerList();
  updateProps();
  render();
}

function isSoloLayerGroup(groupPath) {
  const treeState = ensureLayerTreeState();
  return normalizeLayerUiGroup(treeState.soloGroup || '') === normalizeLayerUiGroup(groupPath || '');
}

function selectLayerEntry(index, layer) {
  selectedId = null;
  selectedLayerIndex = index;
  if (activeTool === 'stitchBrush') {
    projectState.stitchBrush.sourceLayerUid = layer.uid;
    if (projectState.stitchBrush.targetLayerUid === layer.uid) projectState.stitchBrush.targetLayerUid = null;
    resolveStitchTargetLayer(layer);
  }
  projectState.timeline.selectedType = 'slot';
  projectState.timeline.selectedTargetId = index;
  updateTree();
  updateLayerList();
  updateProps();
  if (typeof renderTimeline === 'function') renderTimeline();
  render();
}

function setLayerVisibilityFromList(index, layer) {
  if (projectState.editorMode === 'animation' && typeof captureSelectedLayerToAnimation === 'function' && getCurrentAnimation()) {
    selectedLayerIndex = index;
    layer.runtime_visible = !(layer.runtime_visible !== false);
    captureSelectedLayerToAnimation(projectState.playback.currentFrame, 'step');
    applyAnimationAtCurrentFrame();
  } else {
    layer.visible = layer.visible === false ? true : false;
    layer.runtime_visible = layer.visible;
    saveBindPose();
    render();
  }
  updateLayerList();
  updateProps();
}

function activateLayerVariant(index, options = {}) {
  const { skipSelection = false } = options;
  const layer = getLayerByIndex(index);
  if (!layer) return;
  ensureLayerIdentity(layer);
  const group = getLayerSwitchGroup(layer);
  const key = getLayerSwitchKey(layer);
  if (!group || !key) {
    if (!skipSelection) selectLayerEntry(index, layer);
    return;
  }
  if (!projectState.switchDefaults) projectState.switchDefaults = {};
  projectState.switchDefaults[group] = key;
  if (projectState.editorMode === 'animation' && typeof captureSwitchKey === 'function' && getCurrentAnimation()) {
    captureSwitchKey(group, key, projectState.playback.currentFrame);
  } else {
    if (typeof renderLipsyncPanel === 'function') renderLipsyncPanel();
    render();
    pushUndoSnapshot();
  }
  if (!skipSelection) selectLayerEntry(index, layer);
  else {
    updateLayerList();
    updateProps();
    render();
  }
}

function createLayerTreeNode(name, path, depth, sortIndex = Number.POSITIVE_INFINITY) {
  return {
    name,
    path,
    depth,
    sortIndex,
    groups: [],
    groupMap: new Map(),
    layers: []
  };
}

function buildLayerTreeData(orderedLayers) {
  const root = createLayerTreeNode('', '', 0, -1);
  orderedLayers.forEach(entry => {
    const segments = getLayerUiGroupSegments(entry.layer);
    let node = root;
    let currentPath = '';
    segments.forEach((segment, depthIndex) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (!node.groupMap.has(segment)) {
        const child = createLayerTreeNode(segment, currentPath, depthIndex + 1, entry.orderIndex);
        node.groupMap.set(segment, child);
        node.groups.push(child);
      }
      const childNode = node.groupMap.get(segment);
      childNode.sortIndex = Math.min(childNode.sortIndex, entry.orderIndex);
      node = childNode;
    });
    node.layers.push(entry);
  });
  return root;
}

function sortLayerTreeNodes(node) {
  node.groups.sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
  node.groups.forEach(sortLayerTreeNodes);
}

function countLayersInTreeNode(node) {
  return node.layers.length + node.groups.reduce((sum, group) => sum + countLayersInTreeNode(group), 0);
}

function createLayerRowElement(tree, entry, visualIndex, totalCount, depth, options = {}) {
  const { variant = false, activeVariant = false } = options;
  const { layer, index } = entry;
  const div = document.createElement('div');
  div.className = 'layer-item' + (selectedLayerIndex === index ? ' selected' : '') + (variant ? ' variant-option' : '');
  div.style.paddingLeft = (8 + depth * 14) + 'px';
  const visible = layer.runtime_visible !== undefined ? layer.runtime_visible : layer.visible !== false;
  const canMoveUp = visualIndex > 0;
  const canMoveDown = visualIndex < totalCount - 1;
  const badge = layer.mesh ? 'deformable' : layer.role;
  const switchKey = getLayerSwitchKey(layer);
  const label = variant && switchKey ? switchKey : layer.name;
  div.innerHTML = `<span style="width:22px;color:#888;font-size:10px">#${totalCount - visualIndex}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>${activeVariant ? '<span class="layer-tree-pill active">activa</span>' : ''}<span class="layer-badge">${badge}</span><span class="layer-order-btn" data-up="1" style="${canMoveUp ? '' : 'opacity:.3;pointer-events:none'}">^</span><span class="layer-order-btn" data-down="1" style="${canMoveDown ? '' : 'opacity:.3;pointer-events:none'}">v</span><span data-eye="1">${visible ? 'o' : '.'}</span>`;
  div.onclick = () => {
    if (variant && getLayerSwitchGroup(layer) && getLayerSwitchKey(layer)) activateLayerVariant(index);
    else selectLayerEntry(index, layer);
  };
  div.querySelector('[data-eye="1"]').onclick = event => {
    event.stopPropagation();
    setLayerVisibilityFromList(index, layer);
  };
  div.querySelector('[data-up="1"]').onclick = event => {
    event.stopPropagation();
    moveLayerInStack(index, 'up');
  };
  div.querySelector('[data-down="1"]').onclick = event => {
    event.stopPropagation();
    moveLayerInStack(index, 'down');
  };
  // ── Drag and Drop ──────────────────────────────────────
  if (!variant) {
    div.setAttribute('draggable', 'true');
    div.addEventListener('dragstart', event => {
      layerDndState.sourceType = 'layer';
      layerDndState.sourceIndex = index;
      layerDndState.sourceGroupPath = null;
      event.dataTransfer.effectAllowed = 'move';
      setTimeout(() => div.classList.add('dnd-dragging'), 0);
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dnd-dragging');
      _dndClearAll();
    });
    div.addEventListener('dragover', event => {
      if (!layerDndState.sourceType) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = div.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (event.clientY < midY) _dndSetHover(div, 'dnd-over-top');
      else _dndSetHover(div, 'dnd-over-bottom');
    });
    // No dragleave - _dndSetHover on the next element clears the previous
    div.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      const rect = div.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = event.clientY < midY ? 'top' : 'bottom';
      _dndClearAll();
      handleLayerDrop({ type: 'layer', index }, position);
    });
  }
  // ────────────────────────────────────────────────────────
  tree.appendChild(div);
}


function createGroupRowElement(tree, title, path, depth, options = {}) {
  const { count = 0, variantGroup = false, activeValue = '', canMoveUp = false, canMoveDown = false } = options;
  const div = document.createElement('div');
  div.className = 'layer-group-row' + (variantGroup ? ' variant-group' : '');
  div.style.paddingLeft = (8 + depth * 14) + 'px';
  const collapsed = isLayerTreeGroupCollapsed(path);
  const soloActive = !variantGroup && isSoloLayerGroup(path);
  const countLabel = variantGroup && activeValue
    ? `${count} variantes | ${activeValue}`
    : (count ? `${count}` : '');
  const isEmitter = typeof ParticleManager !== 'undefined' && ParticleManager.isEmitter(path);
  div.innerHTML = `<span class="layer-group-toggle">${collapsed ? '>' : 'v'}</span><span class="layer-group-name">${title}</span>${countLabel ? `<span class="layer-tree-pill">${countLabel}</span>` : ''}${variantGroup ? '' : `<span class="layer-order-btn" data-up="1" style="${canMoveUp ? '' : 'opacity:.3;pointer-events:none'}">^</span><span class="layer-order-btn" data-down="1" style="${canMoveDown ? '' : 'opacity:.3;pointer-events:none'}">v</span><span class="layer-tree-pill ${soloActive ? 'active' : ''}" data-solo="1">${soloActive ? 'viendo' : 'solo'}</span><span class="layer-tree-pill ${isEmitter ? 'active' : ''}" data-emitter="1" title="Convertir en Partículas">🌧️</span>`}`;
  div.querySelector('.layer-group-toggle').onclick = event => {
    event.stopPropagation();
    toggleLayerTreeGroupCollapsed(path);
  };
  if (!variantGroup) {
    div.querySelector('[data-up="1"]').onclick = event => {
      event.stopPropagation();
      moveLayerGroupInStack(path, 'up');
    };
    div.querySelector('[data-down="1"]').onclick = event => {
      event.stopPropagation();
      moveLayerGroupInStack(path, 'down');
    };
    div.querySelector('[data-solo="1"]').onclick = event => {
      event.stopPropagation();
      setSoloLayerGroup(soloActive ? null : path);
    };
    div.querySelector('[data-emitter="1"]').onclick = event => {
      event.stopPropagation();
      if (typeof ParticleManager !== 'undefined') {
        ParticleManager.toggleEmitter(path);
        updateLayerList();
        updateProps();
        if (typeof render === 'function') render();
      }
    };
    // ── Drag and Drop ──────────────────────────────────────
    div.setAttribute('draggable', 'true');
    div.addEventListener('dragstart', event => {
      layerDndState.sourceType = 'group';
      layerDndState.sourceIndex = null;
      layerDndState.sourceGroupPath = path;
      event.dataTransfer.effectAllowed = 'move';
      setTimeout(() => div.classList.add('dnd-dragging'), 0);
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dnd-dragging');
      _dndClearAll();
    });
    div.addEventListener('dragover', event => {
      if (!layerDndState.sourceType) return;
      if (layerDndState.sourceType === 'group' &&
          (path === layerDndState.sourceGroupPath || path.startsWith(layerDndState.sourceGroupPath + '/'))) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = div.getBoundingClientRect();
      const zone = rect.height / 3;
      if (event.clientY < rect.top + zone) _dndSetHover(div, 'dnd-over-top');
      else if (event.clientY > rect.bottom - zone) _dndSetHover(div, 'dnd-over-bottom');
      else _dndSetHover(div, 'dnd-over-inside');
    });
    // No dragleave - _dndSetHover on the next element clears the previous
    div.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      if (layerDndState.sourceType === 'group' &&
          (path === layerDndState.sourceGroupPath || path.startsWith(layerDndState.sourceGroupPath + '/'))) return;
      const rect = div.getBoundingClientRect();
      const zone = rect.height / 3;
      let position;
      if (event.clientY < rect.top + zone) position = 'top';
      else if (event.clientY > rect.bottom - zone) position = 'bottom';
      else position = 'inside';
      _dndClearAll();
      handleLayerDrop({ type: 'group', path }, position);
    });
    // ────────────────────────────────────────────────────────
  }
  tree.appendChild(div);
  return collapsed;
}


function renderLayerTreeNode(tree, node, totalCount) {
  const orderedChildren = [
    ...node.groups.map(group => ({ type: 'group', sortIndex: group.sortIndex, node: group })),
    ...node.layers.map(entry => ({ type: 'layer', sortIndex: entry.orderIndex, entry }))
  ].sort((a, b) => a.sortIndex - b.sortIndex);

    orderedChildren.forEach(child => {
      if (child.type === 'group') {
        const descendantCount = countLayersInTreeNode(child.node);
        const moveState = getGroupMoveState(child.node.path);
        const collapsed = createGroupRowElement(tree, child.node.name, child.node.path, child.node.depth - 1, {
          count: descendantCount,
          canMoveUp: moveState.canMoveUp,
          canMoveDown: moveState.canMoveDown
        });
        if (!collapsed) renderLayerTreeNode(tree, child.node, totalCount);
        return;
      }

    const switchGroup = getLayerSwitchGroup(child.entry.layer);
    const variantEntries = switchGroup
      ? node.layers.filter(entry => getLayerSwitchGroup(entry.layer) === switchGroup && switchGroup)
      : [];
    if (switchGroup && variantEntries.length > 1 && variantEntries[0].index === child.entry.index) {
      const variantPath = `${node.path || '__root__'}::${switchGroup}`;
      const activeKey = getActiveSwitchKey(switchGroup);
      const collapsed = createGroupRowElement(tree, switchGroup, variantPath, node.depth, {
        count: variantEntries.length,
        variantGroup: true,
        activeValue: activeKey || getSwitchDefaultKey(switchGroup)
      });
      if (!collapsed) {
        variantEntries.forEach(entry => {
          const targetKey = activeKey || getSwitchDefaultKey(switchGroup);
          createLayerRowElement(tree, entry, entry.orderIndex, totalCount, node.depth + 1, {
            variant: true,
            activeVariant: getLayerSwitchKey(entry.layer) === targetKey
          });
        });
      }
      return;
    }
    if (switchGroup && variantEntries.length > 1) return;
    createLayerRowElement(tree, child.entry, child.entry.orderIndex, totalCount, node.depth);
  });
}

// ── DnD helpers ─────────────────────────────────────────────────────────────
/**
 * Set hover class on a DnD target element, clearing the previously hovered el.
 * This prevents flickering caused by dragleave/dragenter ordering on child elements.
 */
function _dndSetHover(el, className) {
  if (_dndCurrentEl && _dndCurrentEl !== el) {
    _dndCurrentEl.classList.remove('dnd-over-top', 'dnd-over-bottom', 'dnd-over-inside');
  }
  _dndCurrentEl = el;
  el.classList.remove('dnd-over-top', 'dnd-over-bottom', 'dnd-over-inside');
  el.classList.add(className);
}

function _dndClearAll() {
  if (_dndCurrentEl) {
    _dndCurrentEl.classList.remove('dnd-over-top', 'dnd-over-bottom', 'dnd-over-inside');
    _dndCurrentEl = null;
  }
  // Fallback: clear any stragglers
  document.querySelectorAll('.dnd-over-top, .dnd-over-bottom, .dnd-over-inside')
    .forEach(el => el.classList.remove('dnd-over-top', 'dnd-over-bottom', 'dnd-over-inside'));
}

/**
 * Core of Drag and Drop logic.
 * target = { type: 'layer', index } | { type: 'group', path } | { type: 'root' }
 * position = 'top' | 'bottom' | 'inside'
 */
function handleLayerDrop(target, position) {
  const src = layerDndState;
  // Reset state
  layerDndState = { sourceType: null, sourceIndex: null, sourceGroupPath: null };

  if (!src.sourceType) return;

  const useRuntime = projectState.editorMode === 'animation' &&
    typeof getCurrentAnimation === 'function' && getCurrentAnimation();

  // ── Case 1: Moving a LAYER ────────────────────────────────────────────────
  if (src.sourceType === 'layer') {
    const srcLayer = getLayerByIndex(src.sourceIndex);
    if (!srcLayer) return;
    ensureLayerIdentity(srcLayer);

    if (target.type === 'root') {
      // Drop onto the root zone -> remove from any group
      srcLayer.uiGroup = '';
      _commitLayerDndChanges(false);
      if (useRuntime) applyAnimationAtCurrentFrame();
      return;
    }

    if (target.type === 'group') {
      if (position === 'inside') {
        // Move layer into the group
        srcLayer.uiGroup = target.path;
        _commitLayerDndChanges(false);
        if (useRuntime) applyAnimationAtCurrentFrame();
        return;
      }
      // top / bottom of a group row -> inherit parent group of that group and reorder
      const targetGroupParent = target.path.includes('/')
        ? target.path.split('/').slice(0, -1).join('/')
        : '';
      srcLayer.uiGroup = targetGroupParent;
      // Now reorder: move source close to where the group sits in the stack
      _reorderLayerNextToGroup(src.sourceIndex, target.path, position, false);
      if (useRuntime) applyAnimationAtCurrentFrame();
      return;
    }

    if (target.type === 'layer') {
      if (src.sourceIndex === target.index) return;
      const tgtLayer = getLayerByIndex(target.index);
      if (!tgtLayer) return;
      ensureLayerIdentity(tgtLayer);
      // Adopt the same uiGroup as the target
      srcLayer.uiGroup = tgtLayer.uiGroup || '';
      // Reorder in the stack
      _reorderLayerNextToLayer(src.sourceIndex, target.index, position, false);
      if (useRuntime) applyAnimationAtCurrentFrame();
      return;
    }
  }

  // ── Case 2: Moving a GROUP ────────────────────────────────────────────────
  if (src.sourceType === 'group') {
    _reorderGroupToTarget(src.sourceGroupPath, target, position, false);
    if (useRuntime) applyAnimationAtCurrentFrame();
    return;
  }
}

/** Reorder srcLayer to sit just above or below the target layer in the z-stack */
function _reorderLayerNextToLayer(srcIndex, tgtIndex, position, useRuntime) {
  const ordered = getLayerStackEntries(!!useRuntime);
  const srcPos = ordered.findIndex(e => e.index === srcIndex);
  const tgtPos = ordered.findIndex(e => e.index === tgtIndex);
  if (srcPos === -1 || tgtPos === -1) { _commitLayerDndChanges(useRuntime); return; }

  // Remove src from ordered list
  const newOrder = ordered.filter((_, i) => i !== srcPos);
  // Find new position of target after removal
  const newTgtPos = newOrder.findIndex(e => e.index === tgtIndex);
  // In our array, index 0 is LOWEST Z (visual bottom). So 'bottom' -> smaller index (newTgtPos).
  const insertAt = position === 'top' ? newTgtPos + 1 : newTgtPos;
  newOrder.splice(insertAt, 0, ordered[srcPos]);

  applyLayerStackOrder(newOrder, { runtime: !!useRuntime });
}

/** Reorder srcLayer to sit just before or after a whole group block in the z-stack */
function _reorderLayerNextToGroup(srcIndex, groupPath, position, useRuntime) {
  const normalized = normalizeLayerUiGroup(groupPath || '');
  const ordered = getLayerStackEntries(!!useRuntime);
  const srcPos = ordered.findIndex(e => e.index === srcIndex);
  if (srcPos === -1) { _commitLayerDndChanges(useRuntime); return; }

  // Recalculate group bounds AFTER removing the source layer
  const newOrder = ordered.filter((_, i) => i !== srcPos);
  
  const groupPositions = newOrder
    .map((e, i) => isLayerInsideGroupPath(e.layer, normalized) ? i : -1)
    .filter(i => i !== -1);
    
  if (!groupPositions.length) { _commitLayerDndChanges(useRuntime); return; }

  const minGrp = Math.min(...groupPositions);
  const maxGrp = Math.max(...groupPositions);
  
  // minGrp is Lowest Z (bottom visually). maxGrp is Highest Z (top visually).
  const insertAt = position === 'top' ? maxGrp + 1 : minGrp;
  newOrder.splice(insertAt, 0, ordered[srcPos]);

  applyLayerStackOrder(newOrder, { runtime: !!useRuntime });
}

/** Move an entire group of layers to sit next to or inside a target */
function _reorderGroupToTarget(srcGroupPath, target, position, useRuntime) {
  const normalizedSrc = normalizeLayerUiGroup(srcGroupPath || '');
  if (!normalizedSrc) return;

  const ordered = getLayerStackEntries(!!useRuntime);
  
  // 1. Identify all entries that belong to the moving group
  const movingEntries = ordered.filter(e => isLayerInsideGroupPath(e.layer, normalizedSrc));
  if (!movingEntries.length) { _commitLayerDndChanges(useRuntime); return; }
  const movingIndexSet = new Set(movingEntries.map(e => e.index));

  // 2. Determine the new parent path
  let newParentPath = '';
  if (target.type === 'root') {
    newParentPath = '';
  } else if (target.type === 'group') {
    if (position === 'inside') {
      newParentPath = normalizeLayerUiGroup(target.path || '');
    } else {
      const tp = target.path || '';
      newParentPath = tp.includes('/') ? tp.split('/').slice(0, -1).join('/') : '';
    }
  } else if (target.type === 'layer') {
    const tgtLayer = getLayerByIndex(target.index);
    newParentPath = tgtLayer ? getLayerUiGroup(tgtLayer) || '' : '';
  }

  // 3. Rename uiGroup for all layers in the moving group (if it changed)
  const srcName = normalizedSrc.split('/').pop();
  const newPath = newParentPath ? `${newParentPath}/${srcName}` : srcName;

  if (newPath !== normalizedSrc) {
    if (newPath === normalizedSrc || newPath.startsWith(normalizedSrc + '/')) return; // cycle nesting drop check
    psdLayers.forEach(layer => {
      ensureLayerIdentity(layer);
      const curr = getLayerUiGroup(layer);
      if (curr === normalizedSrc) layer.uiGroup = newPath;
      else if (curr.startsWith(normalizedSrc + '/')) {
        layer.uiGroup = newPath + curr.slice(normalizedSrc.length);
      }
    });
  }

  // 4. Calculate new order block by slicing out the moving elements
  const newOrder = ordered.filter(e => !movingIndexSet.has(e.index));

  // 5. Calculate where to insert the group block
  let insertAt = newOrder.length; // safe default
  if (target.type === 'root') {
    insertAt = newOrder.length; // array end = Highest Z = visual top. If we want bottom, 0. Let's make root drops send to bottom.
    insertAt = 0;
  } else if (target.type === 'layer') {
    const tgtPos = newOrder.findIndex(e => e.index === target.index);
    if (tgtPos !== -1) {
      insertAt = position === 'top' ? tgtPos + 1 : tgtPos;
    }
  } else if (target.type === 'group') {
    // Find bounds of target group
    const targetNorm = normalizeLayerUiGroup(target.path || '');
    const targetPosList = newOrder.map((e, i) => isLayerInsideGroupPath(e.layer, targetNorm) ? i : -1).filter(i => i !== -1);
    
    if (targetPosList.length) {
      if (position === 'inside') {
        insertAt = Math.min(...targetPosList); // append at visual bottom (Lowest Z)
      } else {
        const minTgt = Math.min(...targetPosList);
        const maxTgt = Math.max(...targetPosList);
        insertAt = position === 'top' ? maxTgt + 1 : minTgt;
      }
    }
  }

  newOrder.splice(insertAt, 0, ...movingEntries);
  applyLayerStackOrder(newOrder, { runtime: !!useRuntime });
}

function _commitLayerDndChanges(useRuntime) {
  if (useRuntime) {
    if (typeof applyAnimationAtCurrentFrame === 'function' && getCurrentAnimation()) applyAnimationAtCurrentFrame();
    updateLayerList();
    updateProps();
    render();
  } else {
    saveBindPose();
    updateLayerList();
    updateProps();
    render();
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function updateLayerList() {
  const tree = document.getElementById('layer-tree');
  tree.innerHTML = '';
  if (psdLayers.length === 0) {
    tree.textContent = 'No hay capas';
    return;
  }

  ensureLayerTreeState();
  const orderedLayers = [...psdLayers]
    .map((layer, index) => ({ layer, index, z: getLayerZ(layer, index) }))
    .sort((a, b) => b.z - a.z)
    .map((entry, orderIndex) => {
      ensureLayerIdentity(entry.layer);
      return Object.assign({ orderIndex }, entry);
    });

  const layerTree = buildLayerTreeData(orderedLayers);
  sortLayerTreeNodes(layerTree);

  if (projectState.layerTree.soloGroup) {
    const soloNotice = document.createElement('div');
    soloNotice.className = 'layer-tree-notice';
    soloNotice.innerHTML = `<span>Solo: ${projectState.layerTree.soloGroup}</span><button class="tiny-btn" type="button" onclick="setSoloLayerGroup('')">Mostrar todo</button>`;
    tree.appendChild(soloNotice);
  }

  renderLayerTreeNode(tree, layerTree, orderedLayers.length);

  // Root drop zone (soltar aquí saca la capa/grupo de cualquier carpeta)
  const rootZone = document.createElement('div');
  rootZone.className = 'layer-tree-drop-root';
  rootZone.textContent = '↓ Soltar aquí para quitar de carpeta';
  rootZone.addEventListener('dragover', event => {
    if (!layerDndState.sourceType) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    rootZone.classList.add('dnd-over-inside');
  });
  rootZone.addEventListener('dragleave', () => rootZone.classList.remove('dnd-over-inside'));
  rootZone.addEventListener('drop', event => {
    event.preventDefault();
    rootZone.classList.remove('dnd-over-inside');
    _dndClearAll();
    handleLayerDrop({ type: 'root' }, 'inside');
  });
  tree.appendChild(rootZone);

  updateStitchTargetOptions();
}

function legacyFlatUpdateLayerList() {
  const tree = document.getElementById('layer-tree');
  tree.innerHTML = '';
  if (psdLayers.length === 0) {
    tree.textContent = 'No hay capas';
    return;
  }

  const orderedLayers = [...psdLayers]
    .map((layer, index) => ({ layer, index, z: getLayerZ(layer, index) }))
    .sort((a, b) => b.z - a.z);

  orderedLayers.forEach(({ layer, index }, visualIndex) => {
    ensureLayerIdentity(layer);
    const div = document.createElement('div');
    div.className = 'layer-item' + (selectedLayerIndex === index ? ' selected' : '');
    const visible = layer.runtime_visible !== undefined ? layer.runtime_visible : layer.visible !== false;
    const canMoveUp = visualIndex > 0;
    const canMoveDown = visualIndex < orderedLayers.length - 1;
    const badge = layer.mesh ? 'deformable' : layer.role;
    div.innerHTML = `<span style="width:22px;color:#888;font-size:10px">#${orderedLayers.length - visualIndex}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${layer.name}</span><span class="layer-badge">${badge}</span><span class="layer-order-btn" data-up="1" style="${canMoveUp ? '' : 'opacity:.3;pointer-events:none'}">▲</span><span class="layer-order-btn" data-down="1" style="${canMoveDown ? '' : 'opacity:.3;pointer-events:none'}">▼</span><span data-eye="1">${visible ? 'o' : '.'}</span>`;
    div.onclick = () => {
      selectedId = null;
      selectedLayerIndex = index;
      if (activeTool === 'stitchBrush') {
        projectState.stitchBrush.sourceLayerUid = layer.uid;
        if (projectState.stitchBrush.targetLayerUid === layer.uid) projectState.stitchBrush.targetLayerUid = null;
        resolveStitchTargetLayer(layer);
      }
      projectState.timeline.selectedType = 'slot';
      projectState.timeline.selectedTargetId = index;
      updateTree();
      updateLayerList();
      updateProps();
      if (typeof renderTimeline === 'function') renderTimeline();
      render();
    };
    div.querySelector('[data-eye="1"]').onclick = event => {
      event.stopPropagation();
      if (projectState.editorMode === 'animation' && typeof captureSelectedLayerToAnimation === 'function' && getCurrentAnimation()) {
        selectedLayerIndex = index;
        layer.runtime_visible = !(layer.runtime_visible !== false);
        captureSelectedLayerToAnimation(projectState.playback.currentFrame, 'step');
        applyAnimationAtCurrentFrame();
      } else {
        layer.visible = layer.visible === false ? true : false;
        layer.runtime_visible = layer.visible;
        saveBindPose();
        render();
      }
      updateLayerList();
      updateProps();
    };
    div.querySelector('[data-up="1"]').onclick = event => {
      event.stopPropagation();
      moveLayerInStack(index, 'up');
    };
    div.querySelector('[data-down="1"]').onclick = event => {
      event.stopPropagation();
      moveLayerInStack(index, 'down');
    };
    tree.appendChild(div);
  });
  updateStitchTargetOptions();
}

function setRigBoneValue(boneId, prop, value) {
  const bone = getBoneById(boneId);
  if (!bone) return;
  if (prop === 'x') {
    const dx = value - bone.x;
    bone.x = value;
    bone.ex += dx;
  } else if (prop === 'y') {
    const dy = value - bone.y;
    bone.y = value;
    bone.ey += dy;
  }
  saveBindPose();
  updateProps();
  render();
}

function setBoneParent(boneId, parentValue) {
  const bone = getBoneById(boneId);
  if (!bone) return;
  bone.parent = parentValue === '' ? null : +parentValue;
  saveBindPose();
  updateTree();
  render();
}

function renameBone(id, name) {
  const bone = getBoneById(id);
  if (!bone) return;
  bone.name = name;
  pushUndoSnapshot();
  updateTree();
  if (typeof renderTimeline === 'function') renderTimeline();
  render();
}

function assignLayerToBone(boneId, layerIndexStr) {
  psdLayers.forEach(layer => { if (layer.bone_id === boneId) layer.bone_id = null; });
  if (layerIndexStr !== '') {
    const index = parseInt(layerIndexStr, 10);
    if (!Number.isNaN(index) && psdLayers[index]) psdLayers[index].bone_id = boneId;
  }
  saveBindPose();
  updateLayerList();
  updateProps();
  if (projectState.editorMode === 'animation' && typeof applyAnimationAtCurrentFrame === 'function' && getCurrentAnimation()) applyAnimationAtCurrentFrame();
}

function deleteSelectedBone() {
  if (selectedId === null || selectedId === 0) return;
  const boneId = selectedId;
  projectState.ikConstraints = ensureIkConstraints().filter(constraint =>
    constraint.rootBoneId !== boneId &&
    constraint.midBoneId !== boneId &&
    constraint.endBoneId !== boneId &&
    constraint.targetBoneId !== boneId
  );
  projectState.drivenConstraints = ensureDrivenConstraints().filter(constraint =>
    !(constraint.driverType === 'bone' && constraint.driverId === boneId) &&
    !(constraint.drivenType === 'bone' && constraint.drivenId === boneId)
  );
  ensureSecondaryMotionState().chains = ensureSecondaryMotionState().chains.filter(chain =>
    chain.rootBoneId !== boneId && !(Array.isArray(chain.boneIds) && chain.boneIds.includes(boneId))
  );
  bones = bones.filter(bone => bone.id !== boneId);
  bones.forEach(bone => { if (bone.parent === boneId) bone.parent = 0; });
  psdLayers.forEach(layer => { if (layer.bone_id === boneId) layer.bone_id = null; });
  projectState.animations.forEach(animation => { if (animation.boneTimelines) delete animation.boneTimelines[boneId]; });
  selectedId = 0;
  resetSecondaryMotionState('delete-bone');
  saveBindPose();
  updateTree();
  updateLayerList();
  updateProps();
  if (typeof renderTimeline === 'function') renderTimeline();
  render();
  document.getElementById('st-bones').textContent = `${bones.length} bones`;
}

function setTool(toolName) {
  const meshEditor = ensureMeshEditorState();
  const motionWindowOpen = !document.getElementById('motion-window')?.classList.contains('hidden');
  if (projectState.editorMode === 'animation' && toolName === 'bone' && !motionWindowOpen) return;
  if (toolName !== 'pins' && projectState.meshEditor.manualMode) cancelManualMeshCreation();
  if (toolName !== 'pins' && projectState.meshEditor.addVertexMode) projectState.meshEditor.addVertexMode = false;
  activeTool = toolName;
  const app = document.getElementById('app');
  if (app) app.dataset.tool = toolName;
  if (toolName === 'weightBrush') {
    const layer = getLayerByIndex(selectedLayerIndex);
    projectState.weightBrush.targetBoneId = resolveWeightBrushTargetBoneId(layer);
    if (layer && layer.mesh) ensureLayerSkinWeights(layer);
    projectState.heatmap.mode = 'selected';
    projectState.heatmap.selectedBoneId = projectState.weightBrush.targetBoneId;
    projectState.heatmap.enabled = true;
    if (layer && layer.mesh && !layer.mesh.vertexNeighbors) layer.mesh.vertexNeighbors = buildVertexNeighbors(layer.mesh);
  } else {
    weightBrushPainting = false;
    weightBrushWorld = null;
    if (projectState.weightBrush) projectState.weightBrush.active = false;
  }
  if (toolName === 'stitchBrush') {
    const sourceLayer = resolveStitchSourceLayer();
    resolveStitchTargetLayer(sourceLayer);
    updateStitchTargetOptions();
  } else {
    stitchBrushPainting = false;
    stitchBrushWorld = null;
    if (projectState.stitchBrush) projectState.stitchBrush.active = false;
  }
  document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
  const cameraToolButton = document.getElementById('tool-camera');
  if (cameraToolButton) cameraToolButton.classList.remove('active');
  const activeButton = document.getElementById('tool-' + toolName);
  if (activeButton) activeButton.classList.add('active');
  if (!canShowCameraMiniGizmo()) {
    cameraMiniGizmo.visible = false;
    cameraMiniGizmo.dragging = false;
    cameraMiniGizmo.dragOffsetWorld = null;
  }

  const hints = {
    bone: 'Drag para crear bones nuevos',
    select: 'Click para seleccionar bone o capa',
    move: projectState.editorMode === 'animation' ? 'Arrastra para mover y grabar keyframes' : 'Arrastra para mover el bone',
    pose: projectState.editorMode === 'animation' ? 'Arrastra para rotar y grabar keyframes' : 'Arrastra para posar el bone',
    pins: meshEditor.mode === 'move'
      ? 'Arrastra vertices seleccionados; usa falloff para suavizar'
      : (meshEditor.mode === 'pin'
        ? 'Click sobre un pin para moverlo y deformar el mesh'
        : (meshEditor.mode === 'addVertex'
          ? 'Click dentro del mesh para agregar vertices'
          : (meshEditor.mode === 'createPin'
            ? 'Selecciona vertices y crea un pin de control'
            : 'Click para seleccionar vertices; arrastra vacio para box select'))),
    weightBrush: 'Pinta pesos del bone seleccionado sobre el mesh',
    stitchBrush: 'Pinta costuras entre la capa seleccionada y una capa target con mesh',
    camera: 'Arrastra el marco para mover la camara de export'
  };
  document.getElementById('st-tool').textContent = 'Modo: ' + toolName;
  document.getElementById('st-hint').textContent = hints[toolName] || '';
  updateProps();
}

function toggleLayer(layerName) {
  layers[layerName] = !layers[layerName];
  document.getElementById('v-' + layerName).classList.toggle('active', layers[layerName]);
  render();
}

function updateProps() {
  if (typeof updateEditorProps === 'function') {
    updateEditorProps();
    return;
  }
  document.getElementById('props-content').textContent = 'Cargando inspector...';
}

function translateBoneHierarchy(bone, dx, dy) {
  bone.x += dx;
  bone.y += dy;
  bone.ex += dx;
  bone.ey += dy;
  psdLayers.forEach(layer => {
    if (layer.bone_id === bone.id) {
      layer.center_x += dx;
      layer.center_y += dy;
    }
  });
  bones.forEach(child => { if (child.parent === bone.id) translateBoneHierarchy(child, dx, dy); });
}

function rotateBoneHierarchy(bone, angle, cx, cy) {
  const activeRootId = movingBone ? movingBone.id : (motionMovingBone ? motionMovingBone.id : bone.id);
  if (bone.id !== activeRootId) {
    const nextStart = rotatePoint(bone.x, bone.y, cx, cy, angle);
    bone.x = nextStart.x;
    bone.y = nextStart.y;
  }
  const nextEnd = rotatePoint(bone.ex, bone.ey, cx, cy, angle);
  bone.ex = nextEnd.x;
  bone.ey = nextEnd.y;
  psdLayers.forEach(layer => {
    if (layer.bone_id === bone.id) {
      const nextCenter = rotatePoint(layer.center_x, layer.center_y, cx, cy, angle);
      layer.center_x = nextCenter.x;
      layer.center_y = nextCenter.y;
      layer.rotation = (layer.rotation || 0) + angle;
    }
  });
  bones.forEach(child => { if (child.parent === bone.id) rotateBoneHierarchy(child, angle, cx, cy); });
}

function switchEditorMode(mode) {
  projectState.editorMode = mode;
  resetSecondaryMotionState(`switch-mode-${mode}`);
  if (mode === 'animation' && projectState.meshEditor.manualMode) cancelManualMeshCreation();
  document.getElementById('app').classList.toggle('animation-mode', mode === 'animation');
  document.getElementById('mode-rig-btn').classList.toggle('active', mode === 'rig');
  document.getElementById('mode-animation-btn').classList.toggle('active', mode === 'animation');
  if (mode === 'animation') {
    if (typeof ensureAnimationReady === 'function') ensureAnimationReady();
    if (activeTool === 'bone') setTool('pose');
    if (typeof applyAnimationAtCurrentFrame === 'function' && getCurrentAnimation()) applyAnimationAtCurrentFrame();
  } else {
    projectState.playback.isPlaying = false;
    document.getElementById('play-btn').textContent = 'Play';
    restorePose();
    if (typeof renderTimeline === 'function') renderTimeline();
  }
  updateProps();
  resizeCanvas();
}

function resetView() {
  if (sceneWidth && sceneHeight) {
    const scaleX = canvas.width / sceneWidth;
    const scaleY = canvas.height / sceneHeight;
    view.scale = Math.min(scaleX, scaleY) * 0.8;
    view.x = (canvas.width - sceneWidth * view.scale) / 2;
    view.y = (canvas.height - sceneHeight * view.scale) / 2;
  } else {
    view = { x: 0, y: 0, scale: 1 };
  }
  render();
}

function zoomIn() { view.scale *= 1.2; render(); }
function zoomOut() { view.scale /= 1.2; render(); }

function resetProjectForNewAsset() {
  bones = [{
    id: 0,
    name: 'root',
    parent: null,
    x: sceneWidth / 2,
    y: sceneHeight / 2,
    ex: sceneWidth / 2,
    ey: sceneHeight / 2 - 60,
    orig_x: sceneWidth / 2,
    orig_y: sceneHeight / 2,
    orig_ex: sceneWidth / 2,
    orig_ey: sceneHeight / 2 - 60,
    color: '#888780'
  }];
  nextId = 1;
  selectedId = 0;
  selectedLayerIndex = null;
  projectState.meshEditor.selectedVertexIds = [];
  projectState.meshEditor.selectedPinId = null;
  projectState.meshEditor.manualMode = false;
  projectState.meshEditor.manualLayerUid = null;
  clearManualMeshPoints();
  projectState.meshEditor.manualStage = 'contour';
  projectState.meshEditor.addVertexMode = false;
  projectState.weightBrush.active = false;
  projectState.weightBrush.targetBoneId = null;
  projectState.weightBrush.radius = 60;
  projectState.weightBrush.strength = 0.08;
  projectState.weightBrush.mode = 'add';
  projectState.weightBrush.falloff = 'linear';
  projectState.stitchBrush.active = false;
  projectState.stitchBrush.sourceLayerUid = null;
  projectState.stitchBrush.targetLayerUid = null;
  projectState.stitchBrush.radius = 50;
  projectState.stitchBrush.strength = 1.0;
  projectState.stitchBrush.mode = 'weld';
  projectState.stitchBrush.falloff = 'linear';
  projectState.stitchBrush.smoothRadius = 35;
  projectState.meshStitches = [];
  projectState.ikConstraints = [];
  projectState.drivenConstraints = [];
  projectState.secondaryMotion = {
    enabled: true,
    autoBakeOnExport: true,
    maxActiveBones: 24,
    chains: []
  };
  projectState.switchDefaults = {};
  projectState.layerTree = {
    collapsedGroups: {},
    soloGroup: null
  };
  projectState.camera = {
    enabled: true,
    x: sceneWidth / 2,
    y: sceneHeight / 2,
    zoom: 1,
    width: 1920,
    height: 1080,
    showFrame: true
  };
  projectState.onionSkin = {
    enabled: false,
    before: 2,
    after: 2,
    step: 1,
    opacity: 0.28,
    tint: true
  };
  projectState.lipsync = {
    group: '',
    autoAdvance: true,
    advanceFrames: 2
  };
  projectState.animations = [];
  projectState.playback.currentAnimationId = null;
  projectState.playback.currentFrame = 0;
  projectState.playback.isPlaying = false;
  resetSecondaryMotionState('reset-project');
  psdLayers.forEach((layer, index) => {
    ensureLayerIdentity(layer);
    layer.visible = true;
    layer.runtime_visible = true;
    layer.zOrder = index;
    layer.runtime_z = index;
  });
  document.getElementById('st-bones').textContent = `${bones.length} bones`;
  saveBindPose();
  resetView();
  updateTree();
  updateLayerList();
  updateProps();
  if (typeof renderClipList === 'function') renderClipList();
  if (typeof updateAnimationControls === 'function') updateAnimationControls();
  if (typeof renderTimeline === 'function') renderTimeline();
  render();
  undoStack = [];
  pushUndoSnapshot();
}

async function loadFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.psd')) {
    document.getElementById('loading-overlay').style.display = 'flex';
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('http://localhost:8000/upload-psd', { method: 'POST', body: formData });
      const data = await response.json();
      processReceivedLayers(data);
    } catch (error) {
      alert('Error conectando al servidor FastAPI: ' + error);
    } finally {
      document.getElementById('loading-overlay').style.display = 'none';
    }
    return;
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await createImageFromDataUrl(dataUrl);
  psdLayers = [{
    name: 'Background_Image',
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
    data_url: dataUrl,
    img_element: image,
    bone_id: null,
    center_x: image.width / 2,
    center_y: image.height / 2,
    rotation: 0,
    visible: true,
    runtime_visible: true,
    zOrder: 0,
    runtime_z: 0
  }];
  ensureLayerIdentity(psdLayers[0]);
  sceneWidth = image.width;
  sceneHeight = image.height;
  resetProjectForNewAsset();
  event.target.value = '';
}

function processReceivedLayers(data) {
  sceneWidth = data.width;
  sceneHeight = data.height;
  psdLayers = [];
  let loadedCount = 0;
  if (data.layers.length === 0) {
    alert('El PSD no tiene capas visibles.');
    return;
  }
  data.layers.forEach((layerData, index) => {
    const image = new Image();
    image.onload = () => {
      layerData.img_element = image;
      layerData.bone_id = null;
      layerData.visible = true;
      layerData.runtime_visible = true;
      if (layerData.ui_group !== undefined && layerData.uiGroup === undefined) {
        layerData.uiGroup = layerData.ui_group;
      }
      if (!Array.isArray(layerData.group_path) && Array.isArray(layerData.groupPath)) {
        layerData.group_path = layerData.groupPath;
      }
      layerData.center_x = layerData.x + layerData.width / 2;
      layerData.center_y = layerData.y + layerData.height / 2;
      layerData.rotation = 0;
      layerData.zOrder = index;
      layerData.runtime_z = index;
      ensureLayerIdentity(layerData);
      psdLayers.push(layerData);
      loadedCount++;
      if (loadedCount === data.layers.length) resetProjectForNewAsset();
    };
    image.src = layerData.data_url;
  });
}

async function loadVideoReference(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-overlay').textContent = 'Extrayendo frames del video...';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fps', '24');
    formData.append('max_frames', '1200');
    const response = await fetch('http://localhost:8000/extract-video-frames', { method: 'POST', body: formData });
    if (!response.ok) throw new Error(await response.text());
    const extracted = await response.json();
    if (!extracted.frames || extracted.frames.length === 0) {
      throw new Error('No se pudo extraer ningun frame del video.');
    }

    videoReferenceFrameElement = document.getElementById('motion-frame-image');
    projectState.videoReference = {
      dataUrl: null,
      name: file.name,
      enabled: true,
      showInMain: false,
      opacity: 0.9,
      width: extracted.width || sceneWidth,
      height: extracted.height || sceneHeight,
      durationSeconds: extracted.durationSeconds || 0,
      frameRate: extracted.frameRate || 24,
      frames: extracted.frames,
      currentTime: 0
    };
    if (videoReferenceFrameElement) {
      videoReferenceFrameElement.src = extracted.frames[0];
      videoReferenceFrameElement.style.opacity = projectState.videoReference.opacity;
    }

    if (psdLayers.length === 0) {
      sceneWidth = projectState.videoReference.width || sceneWidth;
      sceneHeight = projectState.videoReference.height || sceneHeight;
      resetProjectForNewAsset();
    }
    if (!getCurrentAnimation()) createAnimationClip();
    const animation = getCurrentAnimation();
    if (animation) {
      animation.frameRate = projectState.videoReference.frameRate;
      animation.duration = Math.max(1, extracted.durationFrames || extracted.frames.length - 1);
      projectState.playback.currentFrame = 0;
      renderClipList();
      updateAnimationControls();
      renderTimeline();
    }
    if (projectState.editorMode !== 'animation') switchEditorMode('animation');
    syncVideoReferenceToFrame();
    showMotionWindow();
    updateProps();
    render();
    pushUndoSnapshot();
    if (extracted.limited) {
      alert('El video era largo; se importaron los primeros frames permitidos para mantener el editor fluido.');
    }
  } catch (error) {
    alert('No se pudo extraer el video a frames: ' + error);
  } finally {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('loading-overlay').textContent = 'Procesando...';
    event.target.value = '';
  }
}

async function loadVideoReferenceLegacy(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-overlay').textContent = 'Cargando video...';
    if (videoReferenceObjectUrl) URL.revokeObjectURL(videoReferenceObjectUrl);
    videoReferenceObjectUrl = URL.createObjectURL(file);
    attachVideoReferenceElement(null);
    setVideoReferenceSource(videoReferenceObjectUrl);
    showMotionWindow();

    const metadata = await new Promise(resolve => {
      const done = () => resolve({
        width: videoReferenceElement.videoWidth || sceneWidth,
        height: videoReferenceElement.videoHeight || sceneHeight,
        durationSeconds: videoReferenceElement.duration || 0
      });
      if (videoReferenceElement.readyState >= 1) done();
      else videoReferenceElement.onloadedmetadata = done;
    });
    projectState.videoReference = {
      dataUrl: null,
      name: file.name,
      enabled: true,
      showInMain: false,
      opacity: 0.75,
      width: metadata.width,
      height: metadata.height,
      durationSeconds: metadata.durationSeconds,
      currentTime: 0
    };
    attachVideoReferenceElement(null);
    setVideoReferenceSource(videoReferenceObjectUrl);
    if (psdLayers.length === 0) {
      sceneWidth = projectState.videoReference.width || sceneWidth;
      sceneHeight = projectState.videoReference.height || sceneHeight;
      resetProjectForNewAsset();
    }
    if (projectState.editorMode !== 'animation') switchEditorMode('animation');
    syncVideoReferenceToFrame();
    showMotionWindow();
    updateProps();
    render();
    pushUndoSnapshot();
  } catch (error) {
    alert('No se pudo cargar el video: ' + error);
  } finally {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('loading-overlay').textContent = 'Procesando...';
    event.target.value = '';
  }
}

function saveProjectFile() {
  return FrogmakerModules.projectIO.saveProjectFile();
}

async function loadProjectFile(event) {
  return FrogmakerModules.projectIO.loadProjectFile(event);
}

async function exportProject() {
  if (psdLayers.length === 0) {
    alert('No hay imagenes o capas cargadas para exportar.');
    return;
  }

  restorePose();
  const boneList = bones.map(bone => {
    const local = projectState.bindPose.bones[bone.id] || getCurrentBoneLocalTransform(bone);
    const entry = {
      name: bone.name,
      length: Math.round(local.length),
      transform: {
        x: Math.round(local.x * 100) / 100,
        y: Math.round(local.y * 100) / 100,
        skX: Math.round(local.rotation * 100) / 100,
        skY: Math.round(local.rotation * 100) / 100
      }
    };
    const parent = bone.parent !== null ? getBoneById(bone.parent) : null;
    if (parent) entry.parent = parent.name;
    return entry;
  });

  const slots = [];
  const skins = { name: 'default', slot: [] };
  const exportLayers = [...psdLayers]
    .map((layer, index) => ({
      layer,
      index,
      z: projectState.bindPose.slots[index] ? projectState.bindPose.slots[index].zOrder : (layer.zOrder !== undefined ? layer.zOrder : index)
    }))
    .sort((a, b) => a.z - b.z);
  exportLayers.forEach(({ layer, index }, exportZ) => {
    const parentBone = layer.bone_id !== null ? getBoneById(layer.bone_id) : null;
    const slotName = layer.name + '_slot';
    slots.push({ name: slotName, parent: parentBone ? parentBone.name : 'root', z: exportZ });
    const bind = projectState.bindPose.slots[index] || getCurrentLayerLocalTransform(index);
    skins.slot.push({
      name: slotName,
      display: [{
        name: layer.name,
        transform: {
          x: Math.round(bind.x * 100) / 100,
          y: Math.round(bind.y * 100) / 100,
          skX: Math.round(bind.rotation * 100) / 100,
          skY: Math.round(bind.rotation * 100) / 100
        }
      }]
    });
  });

  const ske = {
    frameRate: 24,
    name: 'Armature',
    version: '5.0',
    isGlobal: 0,
    armature: [{
      type: 'Armature',
      name: 'Armature',
      frameRate: 24,
      defaultActions: [{ gotoAndPlay: '' }],
      bone: boneList,
      ik: ensureIkConstraints()
        .filter(isValidIkConstraint)
        .map(constraint => {
          const midBone = getBoneById(constraint.midBoneId);
          const targetBone = getBoneById(constraint.targetBoneId);
          if (!midBone || !targetBone) return null;
          return {
            name: constraint.id,
            bone: midBone.name,
            target: targetBone.name,
            chain: 1,
            bendPositive: constraint.bendDirection !== -1,
            weight: Math.round(clamp(constraint.mix === undefined ? 1 : +constraint.mix || 0, 0, 1) * 100)
          };
        })
        .filter(Boolean),
      slot: slots,
      skin: [skins],
      animation: typeof serializeAnimationsForExport === 'function' ? serializeAnimationsForExport() : []
    }]
  };

  const payload = {
    ske_json: ske,
    images: psdLayers.map(layer => ({ name: layer.name, data_url: layer.data_url }))
  };

  document.getElementById('loading-overlay').style.display = 'flex';
  try {
    const response = await fetch('http://localhost:8000/export-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Error en la exportacion');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'FrogmakerProject.zip';
    document.body.appendChild(anchor);
    anchor.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert('Error al exportar: ' + error);
  } finally {
    document.getElementById('loading-overlay').style.display = 'none';
  }
}

canvas.addEventListener('mousedown', event => {
  if (event.button === 1 || event.altKey) {
    panning = true;
    panStart = { x: event.clientX - view.x, y: event.clientY - view.y };
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const world = toWorld(event.clientX - rect.left, event.clientY - rect.top);
  const hitCameraMiniGizmo = getCameraMiniGizmoHit(world.x, world.y);
  const hitGizmo = getAnyBoneGizmoHit(world.x, world.y);
  const hitBone = getBoneAt(world.x, world.y);
  const hitLayerIndex = getLayerAt(world.x, world.y);

  if (hitCameraMiniGizmo) {
    const camera = ensureProjectCamera();
    cameraMiniGizmo.dragging = true;
    cameraMiniGizmo.dragOffsetWorld = {
      x: camera.x - world.x,
      y: camera.y - world.y
    };
    render();
    return;
  }

  if (activeTool === 'camera') {
    ensureProjectCamera();
    if (isPointInCameraFrame(world.x, world.y)) {
      cameraDragState = { startWorld: world, startX: projectState.camera.x, startY: projectState.camera.y };
      projectState.timeline.selectedType = 'camera';
      projectState.timeline.selectedTargetId = 'camera';
      if (typeof renderTimeline === 'function') renderTimeline();
      updateProps();
      render();
    }
    return;
  }

  if (activeTool === 'stitchBrush') {
    stitchBrushWorld = world;
    if (selectedLayerIndex === null && hitLayerIndex !== null) {
      selectedLayerIndex = hitLayerIndex;
      updateLayerList();
      updateProps();
    }
    const sourceLayer = resolveStitchSourceLayer();
    if (!sourceLayer || !sourceLayer.mesh) return;
    const hitLayer = getLayerByIndex(hitLayerIndex);
    if (hitLayer && hitLayer.mesh && hitLayer.uid !== sourceLayer.uid) {
      ensureLayerIdentity(hitLayer);
      projectState.stitchBrush.targetLayerUid = hitLayer.uid;
    }
    const targetLayer = resolveStitchTargetLayer(sourceLayer);
    if (!targetLayer || !targetLayer.mesh) {
      console.warn('Stitch Brush necesita una capa target con mesh.');
      return;
    }
    stitchBrushPainting = true;
    stitchBrushStrokeChanged = false;
    projectState.stitchBrush.active = true;
    projectState.stitchBrush.sourceLayerUid = sourceLayer.uid;
    projectState.stitchBrush.targetLayerUid = targetLayer.uid;
    pushUndoSnapshot();
    stitchBrushStrokeChanged = paintStitchAtPoint(sourceLayer, world.x, world.y, projectState.stitchBrush) || stitchBrushStrokeChanged;
    updateStitchTargetOptions();
    render();
    return;
  }

  if (activeTool === 'weightBrush') {
    weightBrushWorld = world;
    if (selectedLayerIndex === null && hitLayerIndex !== null) {
      selectedLayerIndex = hitLayerIndex;
      updateLayerList();
      updateProps();
    }
    if (projectState.weightBrush.targetBoneId === null || projectState.weightBrush.targetBoneId === undefined) {
      projectState.weightBrush.targetBoneId = resolveWeightBrushTargetBoneId(getLayerByIndex(selectedLayerIndex));
    }
    const layer = getLayerByIndex(selectedLayerIndex);
    if (!layer || !layer.mesh || projectState.weightBrush.targetBoneId === null || projectState.weightBrush.targetBoneId === undefined) return;
    ensureLayerSkinWeights(layer);
    if (projectState.weightBrush.mode === 'smooth' && !layer.mesh.vertexNeighbors) layer.mesh.vertexNeighbors = buildVertexNeighbors(layer.mesh);
    weightBrushPainting = true;
    weightBrushStrokeChanged = false;
    projectState.weightBrush.active = true;
    pushUndoSnapshot();
    weightBrushStrokeChanged = paintWeightAtPoint(layer, world.x, world.y, projectState.weightBrush) || weightBrushStrokeChanged;
    render();
    return;
  }

  if (activeTool === 'pins') {
    const meshEditor = ensureMeshEditorState();
    if (selectedLayerIndex === null && hitLayerIndex !== null) {
      selectedLayerIndex = hitLayerIndex;
      selectedId = null;
      updateTree();
      updateLayerList();
      updateProps();
    }
    const layer = getLayerByIndex(selectedLayerIndex);
    if (!layer) return;
    if (projectState.editorMode === 'rig' && projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === layer.uid) {
      const local = toLocalFromLayer(layer, world.x, world.y);
      addManualMeshPoint(local.x, local.y);
      return;
    }
    ensureLayerMesh(layer);
    const local = toLocalFromLayer(layer, world.x, world.y);
    if (projectState.editorMode === 'rig' && (projectState.meshEditor.addVertexMode || meshEditor.mode === 'addVertex')) {
      const added = addMeshVertexAtPoint(layer, world.x, world.y);
      if (added) {
        saveBindPose();
        pushUndoSnapshot();
        updateLayerList();
        updateProps();
      }
      render();
      return;
    }
    const pin = getMeshPinAt(layer, local.x, local.y);
    const vertexIndex = getMeshVertexAt(layer, local.x, local.y);

    if (pin && vertexIndex === null) {
      projectState.meshEditor.selectedPinId = pin.id;
      projectState.meshEditor.selectedVertexIds = [...pin.vertexIds];
      if (meshEditor.mode === 'pin') {
        meshPinDragState = {
          layerIndex: selectedLayerIndex,
          pinId: pin.id,
          startWorld: world,
          baseVertices: cloneVertices(getEditableMeshVertices(layer))
        };
      }
      updateProps();
      render();
      return;
    }

    if (vertexIndex !== null) {
      projectState.meshEditor.selectedPinId = null;
      if (event.shiftKey) {
        if (projectState.meshEditor.selectedVertexIds.includes(vertexIndex)) {
          projectState.meshEditor.selectedVertexIds = projectState.meshEditor.selectedVertexIds.filter(id => id !== vertexIndex);
        } else {
          projectState.meshEditor.selectedVertexIds = [...projectState.meshEditor.selectedVertexIds, vertexIndex];
        }
      } else if (!projectState.meshEditor.selectedVertexIds.includes(vertexIndex)) {
        projectState.meshEditor.selectedVertexIds = [vertexIndex];
      }
      if (meshEditor.mode === 'move' && projectState.meshEditor.selectedVertexIds.includes(vertexIndex)) {
        const selectedIds = [...projectState.meshEditor.selectedVertexIds];
        pinDragState = {
          layerIndex: selectedLayerIndex,
          startWorld: world,
          baseVertices: cloneVertices(getEditableMeshVertices(layer)),
          selectedIds,
          weights: buildSoftSelectionWeights(layer, selectedIds, meshEditor.softSelectionRadius, meshEditor.softSelectionStrength)
        };
      }
      updateProps();
      render();
      return;
    }

    const shouldStartBoxSelection = meshEditor.mode === 'select' || meshEditor.mode === 'createPin';
    if (shouldStartBoxSelection) {
      meshSelectionBox = {
        layerIndex: selectedLayerIndex,
        startLocal: local,
        currentLocal: local,
        append: !!event.shiftKey
      };
      if (!event.shiftKey) {
        projectState.meshEditor.selectedVertexIds = [];
        projectState.meshEditor.selectedPinId = null;
      }
      updateProps();
      render();
      return;
    }

    if (!event.shiftKey) {
      projectState.meshEditor.selectedVertexIds = [];
      projectState.meshEditor.selectedPinId = null;
      updateProps();
      render();
    }
    return;
  }

  if (activeTool === 'pose' && hitGizmo) {
    selectedId = hitGizmo.bone.id;
    selectedLayerIndex = null;
    projectState.timeline.selectedType = 'bone';
    projectState.timeline.selectedTargetId = hitGizmo.bone.id;
    movingBone = hitGizmo.bone;
    movingGizmo = 'rotate';
    movingHandle = 'gizmo';
    dragLastAngle = Math.atan2(world.y - movingBone.y, world.x - movingBone.x);
    updateTree();
    updateLayerList();
    updateProps();
    if (typeof renderTimeline === 'function') renderTimeline();
    render();
    return;
  }

  if (activeTool === 'select' || activeTool === 'move' || activeTool === 'pose') {
    if (hitBone) {
      selectedId = hitBone.id;
      selectedLayerIndex = null;
      projectState.timeline.selectedType = 'bone';
      projectState.timeline.selectedTargetId = hitBone.id;
    } else if (hitLayerIndex !== null) {
      selectedId = null;
      selectedLayerIndex = hitLayerIndex;
      projectState.timeline.selectedType = 'slot';
      projectState.timeline.selectedTargetId = hitLayerIndex;
    }
    updateTree();
    updateLayerList();
    updateProps();
    if (typeof renderTimeline === 'function') renderTimeline();
  }

  if ((activeTool === 'move' || activeTool === 'pose') && hitBone) {
    movingBone = hitBone;
    dragStart = world;
    if (projectState.editorMode === 'rig' && activeTool === 'move') {
      const r = 12 / view.scale;
      const dStart = Math.hypot(hitBone.x - world.x, hitBone.y - world.y);
      const dEnd = Math.hypot(hitBone.ex - world.x, hitBone.ey - world.y);
      if (dStart <= r && dStart <= dEnd) movingHandle = 'start';
      else if (dEnd <= r) movingHandle = 'end';
      else movingHandle = 'whole';
    } else movingHandle = 'whole';
    if (activeTool === 'pose') {
      movingGizmo = 'direct';
      dragLastAngle = Math.atan2(world.y - hitBone.y, world.x - hitBone.x);
    }
    return;
  }

  if ((activeTool === 'move' || activeTool === 'pose') && hitLayerIndex !== null) {
    movingLayer = getLayerByIndex(hitLayerIndex);
    selectedLayerIndex = hitLayerIndex;
    if (activeTool === 'pose') {
      movingGizmo = null;
      dragLastAngle = Math.atan2(world.y - movingLayer.center_y, world.x - movingLayer.center_x);
    }
    dragStart = world;
    updateLayerList();
    updateProps();
    render();
    return;
  }

  if (projectState.editorMode === 'rig' && activeTool === 'bone') {
    dragging = true;
    let sx = world.x;
    let sy = world.y;
    if (selectedId !== null) {
      const parent = getBoneById(selectedId);
      if (parent) {
        sx = parent.ex;
        sy = parent.ey;
      }
    }
    dragStart = { x: sx, y: sy };
    dragPreview = { x: sx, y: sy, ex: world.x, ey: world.y };
    render();
  }
});

canvas.addEventListener('mousemove', event => {
  const rect = canvas.getBoundingClientRect();
  const world = toWorld(event.clientX - rect.left, event.clientY - rect.top);
  document.getElementById('st-coords').textContent = `x: ${Math.round(world.x)} y: ${Math.round(world.y)}`;
  weightBrushWorld = activeTool === 'weightBrush' ? world : null;
  stitchBrushWorld = activeTool === 'stitchBrush' ? world : null;

  if (panning) {
    view.x = event.clientX - panStart.x;
    view.y = event.clientY - panStart.y;
    render();
    return;
  }

  if (activeTool === 'weightBrush') {
    if (weightBrushPainting) {
      const layer = getLayerByIndex(selectedLayerIndex);
      if (layer) weightBrushStrokeChanged = paintWeightAtPoint(layer, world.x, world.y, projectState.weightBrush) || weightBrushStrokeChanged;
    }
    render();
    return;
  }

  if (activeTool === 'stitchBrush') {
    if (stitchBrushPainting) {
      const sourceLayer = resolveStitchSourceLayer();
      if (sourceLayer) stitchBrushStrokeChanged = paintStitchAtPoint(sourceLayer, world.x, world.y, projectState.stitchBrush) || stitchBrushStrokeChanged;
    }
    render();
    return;
  }

  if (activeTool === 'camera' && cameraDragState) {
    const dx = world.x - cameraDragState.startWorld.x;
    const dy = world.y - cameraDragState.startWorld.y;
    setProjectCameraPosition(cameraDragState.startX + dx, cameraDragState.startY + dy);
    render();
    updateProps();
    return;
  }

  if (cameraMiniGizmo.dragging && cameraMiniGizmo.dragOffsetWorld) {
    setProjectCameraPosition(
      world.x + cameraMiniGizmo.dragOffsetWorld.x,
      world.y + cameraMiniGizmo.dragOffsetWorld.y
    );
    render();
    updateProps();
    return;
  }

  if (meshSelectionBox) {
    const layer = getLayerByIndex(meshSelectionBox.layerIndex);
    if (!layer) {
      meshSelectionBox = null;
      render();
      return;
    }
    meshSelectionBox.currentLocal = toLocalFromLayer(layer, world.x, world.y);
    render();
    return;
  }

  if (meshPinDragState) {
    const layer = getLayerByIndex(meshPinDragState.layerIndex);
    if (!layer || !layer.mesh) return;
    const pin = (layer.meshPins || []).find(item => item.id === meshPinDragState.pinId);
    if (!pin) return;
    const dx = world.x - meshPinDragState.startWorld.x;
    const dy = world.y - meshPinDragState.startWorld.y;
    const vertices = cloneVertices(meshPinDragState.baseVertices);
    pin.vertexIds.forEach(vertexId => {
      const base = meshPinDragState.baseVertices[vertexId];
      if (!base || !vertices[vertexId]) return;
      const worldBase = meshPointToWorld(layer, base);
      const moved = worldPointToMeshPoint(layer, worldBase.x + dx, worldBase.y + dy);
      vertices[vertexId].x = moved.x;
      vertices[vertexId].y = moved.y;
    });
    applyEditedMeshVertices(layer, vertices);
    render();
    return;
  }

  if (pinDragState) {
    const layer = getLayerByIndex(pinDragState.layerIndex);
    if (!layer || !layer.mesh) return;
    const dx = world.x - pinDragState.startWorld.x;
    const dy = world.y - pinDragState.startWorld.y;
    const vertices = cloneVertices(pinDragState.baseVertices);
    pinDragState.weights.forEach((weight, vertexId) => {
      const base = pinDragState.baseVertices[vertexId];
      if (!base || !vertices[vertexId]) return;
      const worldBase = meshPointToWorld(layer, base);
      const moved = worldPointToMeshPoint(layer, worldBase.x + dx * weight, worldBase.y + dy * weight);
      vertices[vertexId].x = moved.x;
      vertices[vertexId].y = moved.y;
    });
    applyEditedMeshVertices(layer, vertices);
    render();
    return;
  }

  if (movingLayer) {
    if (activeTool === 'move') {
      const dx = world.x - dragStart.x;
      const dy = world.y - dragStart.y;
      movingLayer.center_x += dx;
      movingLayer.center_y += dy;
      dragStart = world;
    } else if (activeTool === 'pose') {
      const currentAngle = Math.atan2(world.y - movingLayer.center_y, world.x - movingLayer.center_x);
      const deltaAngle = currentAngle - dragLastAngle;
      dragLastAngle = currentAngle;
      movingLayer.rotation = (movingLayer.rotation || 0) + deltaAngle;
    }
    render();
    return;
  }

  if (movingBone) {
    if (activeTool === 'move') {
      const dx = world.x - dragStart.x;
      const dy = world.y - dragStart.y;
      if (projectState.editorMode === 'animation') translateBoneHierarchy(movingBone, dx, dy);
      else if (movingHandle === 'start') {
        movingBone.x += dx;
        movingBone.y += dy;
      } else if (movingHandle === 'end') {
        movingBone.ex += dx;
        movingBone.ey += dy;
      } else {
        movingBone.x += dx;
        movingBone.y += dy;
        movingBone.ex += dx;
        movingBone.ey += dy;
      }
      dragStart = world;
    } else if (activeTool === 'pose') {
      const currentAngle = Math.atan2(world.y - movingBone.y, world.x - movingBone.x);
      const deltaAngle = currentAngle - dragLastAngle;
      dragLastAngle = currentAngle;
      rotateBoneHierarchy(movingBone, deltaAngle, movingBone.x, movingBone.y);
    }
    render();
    return;
  }

  if (dragging && dragPreview) {
    dragPreview.ex = world.x;
    dragPreview.ey = world.y;
    render();
  }
});

canvas.addEventListener('mouseup', event => {
  if (cameraMiniGizmo.dragging) {
    cameraMiniGizmo.dragging = false;
    cameraMiniGizmo.dragOffsetWorld = null;
    finishCameraDragInteraction();
    return;
  }
  if (cameraDragState) {
    cameraDragState = null;
    finishCameraDragInteraction();
    return;
  }
  if (meshSelectionBox) {
    const layer = getLayerByIndex(meshSelectionBox.layerIndex);
    if (layer) {
      const ids = getMeshVerticesInLocalRect(
        layer,
        meshSelectionBox.startLocal.x,
        meshSelectionBox.startLocal.y,
        meshSelectionBox.currentLocal.x,
        meshSelectionBox.currentLocal.y
      );
      projectState.meshEditor.selectedVertexIds = meshSelectionBox.append
        ? [...new Set([...projectState.meshEditor.selectedVertexIds, ...ids])]
        : ids;
      if (projectState.meshEditor.mode === 'createPin' && projectState.meshEditor.selectedVertexIds.length) {
        createPinFromSelection();
      }
      updateProps();
    }
    meshSelectionBox = null;
    render();
    return;
  }
  if (meshPinDragState) {
    const layer = getLayerByIndex(meshPinDragState.layerIndex);
    meshPinDragState = null;
    if (projectState.editorMode === 'animation' && typeof captureSelectedLayerMeshToAnimation === 'function' && getCurrentAnimation()) {
      if (layer) {
        selectedLayerIndex = psdLayers.findIndex(item => item.uid === layer.uid);
        captureSelectedLayerMeshToAnimation(projectState.playback.currentFrame, 'linear');
        applyAnimationAtCurrentFrame();
      }
    } else saveBindPose();
    updateProps();
    return;
  }
  if (stitchBrushPainting) {
    stitchBrushPainting = false;
    projectState.stitchBrush.active = false;
    if (stitchBrushStrokeChanged) pushUndoSnapshot();
    stitchBrushStrokeChanged = false;
    updateProps();
    render();
    return;
  }
  if (weightBrushPainting) {
    weightBrushPainting = false;
    projectState.weightBrush.active = false;
    if (weightBrushStrokeChanged) pushUndoSnapshot();
    weightBrushStrokeChanged = false;
    updateProps();
    render();
    return;
  }
  if (panning) {
    panning = false;
    return;
  }
  if (pinDragState) {
    const finishedPinDrag = pinDragState;
    const layer = getLayerByIndex(finishedPinDrag.layerIndex);
    pinDragState = null;
    if (projectState.editorMode === 'animation' && typeof captureSelectedLayerMeshToAnimation === 'function' && getCurrentAnimation()) {
      if (layer) {
        selectedLayerIndex = finishedPinDrag.layerIndex;
        captureSelectedLayerMeshToAnimation(projectState.playback.currentFrame, 'linear');
        applyAnimationAtCurrentFrame();
      }
    } else saveBindPose();
    updateProps();
    return;
  }
  if (movingLayer) {
    const affectedLayer = movingLayer;
    movingLayer = null;
    if (projectState.editorMode === 'rig' && activeTool === 'pose') {
      recalibrateDrivenConstraintsForSubject('layer', affectedLayer.uid);
    }
    if (projectState.editorMode === 'animation' && typeof captureSelectedLayerToAnimation === 'function' && getCurrentAnimation()) {
      selectedLayerIndex = psdLayers.findIndex(layer => layer.uid === affectedLayer.uid);
      if (projectState.playback.autoKey) captureSelectedLayerToAnimation(projectState.playback.currentFrame, 'linear');
      applyAnimationAtCurrentFrame();
    } else {
      saveBindPose();
      render();
    }
    updateProps();
    return;
  }
  if (movingBone) {
    const affectedBoneId = movingBone.id;
    movingBone = null;
    movingHandle = null;
    movingGizmo = null;
    if (projectState.editorMode === 'rig' && activeTool === 'pose') {
      recalibrateDrivenConstraintsForSubject('bone', affectedBoneId);
    }
    if (projectState.editorMode === 'animation' && typeof captureSelectedBoneToAnimation === 'function' && getCurrentAnimation()) {
      selectedId = affectedBoneId;
      if (projectState.playback.autoKey) {
        captureSelectedBoneToAnimation(projectState.playback.currentFrame);
        if (typeof captureIkResolvedBonesForTargetBone === 'function') {
          captureIkResolvedBonesForTargetBone(affectedBoneId, projectState.playback.currentFrame);
        }
      }
      applyAnimationAtCurrentFrame();
    } else if (activeTool === 'move') saveBindPose();
    else render();
    updateProps();
    return;
  }
  if (!dragging) return;
  dragging = false;

  const rect = canvas.getBoundingClientRect();
  const world = toWorld(event.clientX - rect.left, event.clientY - rect.top);
  const len = Math.hypot(world.x - dragStart.x, world.y - dragStart.y);
  if (projectState.editorMode === 'rig' && activeTool === 'bone' && len > 5 / view.scale) {
    const parentId = selectedId !== null ? selectedId : 0;
    const parentBone = getBoneById(parentId);
    const depth = parentBone ? getBoneDepth(parentBone) + 1 : 0;
    const bone = {
      id: nextId++,
      name: `bone_${nextId - 1}`,
      parent: parentId,
      x: dragStart.x,
      y: dragStart.y,
      ex: world.x,
      ey: world.y,
      color: getColor(depth)
    };
    bones.push(bone);
    selectedId = bone.id;
    saveBindPose();
    updateTree();
    updateProps();
    if (typeof renderTimeline === 'function') renderTimeline();
    document.getElementById('st-bones').textContent = `${bones.length} bones`;
  }
  dragPreview = null;
  render();
});

canvas.addEventListener('mouseleave', () => {
  weightBrushWorld = null;
  stitchBrushWorld = null;
  meshSelectionBox = null;
  meshPinDragState = null;
  if (cameraMiniGizmo.dragging) {
    cameraMiniGizmo.dragging = false;
    cameraMiniGizmo.dragOffsetWorld = null;
    finishCameraDragInteraction();
    return;
  }
  if (stitchBrushPainting) {
    stitchBrushPainting = false;
    projectState.stitchBrush.active = false;
    if (stitchBrushStrokeChanged) pushUndoSnapshot();
    stitchBrushStrokeChanged = false;
    updateProps();
  }
  if (weightBrushPainting) {
    weightBrushPainting = false;
    projectState.weightBrush.active = false;
    if (weightBrushStrokeChanged) pushUndoSnapshot();
    weightBrushStrokeChanged = false;
    updateProps();
  }
  render();
});

canvas.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (!(projectState.editorMode === 'rig' && activeTool === 'pins' && projectState.meshEditor.manualMode)) return;
  removeLastManualMeshPoint();
});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = event.clientX - rect.left;
  const cy = event.clientY - rect.top;
  const factor = event.deltaY < 0 ? 1.1 : 0.9;
  if (activeTool === 'camera' && event.ctrlKey) {
    const camera = ensureProjectCamera();
    camera.zoom = clamp(camera.zoom * factor, 0.05, 20);
    updateProps();
    render();
    return;
  }
  view.x = cx - (cx - view.x) * factor;
  view.y = cy - (cy - view.y) * factor;
  view.scale *= factor;
  render();
}, { passive: false });

window.addEventListener('resize', resizeCanvas);
window.addEventListener('resize', resizeMotionCanvas);
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undoLastAction();
  }
});

setTimeout(() => {
  motionCanvas = document.getElementById('motion-canvas');
  motionCtx = motionCanvas ? motionCanvas.getContext('2d') : null;
  if (!motionCanvas) return;

  motionCanvas.addEventListener('mousedown', event => {
    const rect = motionCanvas.getBoundingClientRect();
    const world = toMotionWorld(event.clientX - rect.left, event.clientY - rect.top);
    const hitBone = getMotionBoneAt(world.x, world.y);

    if ((activeTool === 'select' || activeTool === 'move' || activeTool === 'pose') && hitBone) {
      selectedId = hitBone.id;
      selectedLayerIndex = null;
      projectState.timeline.selectedType = 'bone';
      projectState.timeline.selectedTargetId = hitBone.id;
      motionMovingBone = hitBone;
      motionDragStart = world;
      motionMovingHandle = activeTool === 'move' ? 'whole' : 'pose';
      motionDragLastAngle = Math.atan2(world.y - hitBone.y, world.x - hitBone.x);
      updateTree();
      updateLayerList();
      updateProps();
      if (typeof renderTimeline === 'function') renderTimeline();
      renderMotionWindow();
      render();
      return;
    }

    if (projectState.editorMode === 'animation' && activeTool === 'bone') {
      motionDragging = true;
      let sx = world.x;
      let sy = world.y;
      const parent = selectedId !== null ? getBoneById(selectedId) : null;
      if (parent) {
        sx = parent.ex;
        sy = parent.ey;
      }
      motionDragStart = { x: sx, y: sy };
      motionDragPreview = { x: sx, y: sy, ex: world.x, ey: world.y, color: '#ffd15a' };
      renderMotionWindow();
    }
  });

  motionCanvas.addEventListener('mousemove', event => {
    const rect = motionCanvas.getBoundingClientRect();
    const world = toMotionWorld(event.clientX - rect.left, event.clientY - rect.top);
    if (motionMovingBone) {
      if (activeTool === 'move') {
        const dx = world.x - motionDragStart.x;
        const dy = world.y - motionDragStart.y;
        translateBoneHierarchy(motionMovingBone, dx, dy);
        motionDragStart = world;
      } else {
        const currentAngle = Math.atan2(world.y - motionMovingBone.y, world.x - motionMovingBone.x);
        const deltaAngle = currentAngle - motionDragLastAngle;
        motionDragLastAngle = currentAngle;
        rotateBoneHierarchy(motionMovingBone, deltaAngle, motionMovingBone.x, motionMovingBone.y);
      }
      renderMotionWindow();
      render();
      return;
    }
    if (motionDragging && motionDragPreview) {
      motionDragPreview.ex = world.x;
      motionDragPreview.ey = world.y;
      renderMotionWindow();
    }
  });

  motionCanvas.addEventListener('mouseup', event => {
    if (motionMovingBone) {
      const affectedBoneId = motionMovingBone.id;
      motionMovingBone = null;
      motionMovingHandle = null;
      selectedId = affectedBoneId;
      if (projectState.editorMode === 'animation' && typeof captureSelectedBoneToAnimation === 'function' && getCurrentAnimation()) {
        if (projectState.playback.autoKey) captureSelectedBoneToAnimation(projectState.playback.currentFrame);
        applyAnimationAtCurrentFrame();
      } else saveBindPose();
      updateProps();
      renderMotionWindow();
      return;
    }
    if (!motionDragging) return;
    motionDragging = false;
    const rect = motionCanvas.getBoundingClientRect();
    const world = toMotionWorld(event.clientX - rect.left, event.clientY - rect.top);
    const len = Math.hypot(world.x - motionDragStart.x, world.y - motionDragStart.y);
    if (projectState.editorMode === 'animation' && activeTool === 'bone' && len > 5 / motionView.scale) {
      const parentId = selectedId !== null ? selectedId : 0;
      const parentBone = getBoneById(parentId);
      const depth = parentBone ? getBoneDepth(parentBone) + 1 : 0;
      const bone = {
        id: nextId++,
        name: `bone_${nextId - 1}`,
        parent: parentId,
        x: motionDragStart.x,
        y: motionDragStart.y,
        ex: world.x,
        ey: world.y,
        color: getColor(depth)
      };
      bones.push(bone);
      selectedId = bone.id;
      saveBindPose();
      if (typeof captureSelectedBoneToAnimation === 'function' && getCurrentAnimation()) {
        captureSelectedBoneToAnimation(projectState.playback.currentFrame);
      }
      updateTree();
      updateProps();
      if (typeof renderTimeline === 'function') renderTimeline();
      document.getElementById('st-bones').textContent = `${bones.length} bones`;
    }
    motionDragPreview = null;
    renderMotionWindow();
    render();
  });
}, 100);

setTimeout(() => {
  resizeCanvas();
  saveBindPose();
  document.getElementById('st-bones').textContent = `${bones.length} bones`;
  updateTree();
  updateLayerList();
  updateProps();
  if (typeof renderClipList === 'function') renderClipList();
  if (typeof updateAnimationControls === 'function') updateAnimationControls();
  if (typeof renderTimeline === 'function') renderTimeline();
  render();
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('boot-visible');
    overlay.style.display = 'none';
    overlay.textContent = 'Procesando...';
  }
}, 100);

requestAnimationFrame(secondaryMotionLoop);


















