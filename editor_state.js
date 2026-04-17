(function initializeEditorStateModule() {
  const modules = window.FrogmakerModules = window.FrogmakerModules || {};
  const stateModule = modules.state = modules.state || {};

  stateModule.PROJECT_SCHEMA_VERSION = 2;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number.isFinite(+value) ? +value : fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  function createDefaultRootBone() {
    return {
      id: 0,
      name: 'root',
      parent: null,
      x: 500,
      y: 500,
      ex: 500,
      ey: 420,
      orig_x: 500,
      orig_y: 500,
      orig_ex: 500,
      orig_ey: 420,
      color: '#888780'
    };
  }

  function getRuntime() {
    if (!modules.runtime) {
      throw new Error('Frogmaker runtime is not ready yet.');
    }
    return modules.runtime;
  }

  function sanitizeProjectData(raw) {
    const runtime = getRuntime();
    const source = isPlainObject(raw) ? raw : {};
    const bones = Array.isArray(source.bones) && source.bones.length > 0
      ? deepClone(source.bones)
      : [createDefaultRootBone()];
    const psdLayers = Array.isArray(source.psdLayers) ? deepClone(source.psdLayers) : [];
    const layerCount = psdLayers.length;
    const boneIds = new Set(bones.map(bone => bone && bone.id).filter(id => id !== undefined && id !== null));
    const selectedId = boneIds.has(source.selectedId) ? source.selectedId : (bones[0] && bones[0].id !== undefined ? bones[0].id : 0);
    const selectedLayerIndex = Number.isInteger(source.selectedLayerIndex) && source.selectedLayerIndex >= 0 && source.selectedLayerIndex < layerCount
      ? source.selectedLayerIndex
      : null;

    return {
      version: typeof source.version === 'string' ? source.version : 'frog-1',
      schemaVersion: Number.isInteger(source.schemaVersion)
        ? source.schemaVersion
        : (typeof source.version === 'string' ? 1 : stateModule.PROJECT_SCHEMA_VERSION),
      sceneWidth: Math.max(1, Math.round(Number.isFinite(+source.sceneWidth) ? +source.sceneWidth : runtime.sceneWidth || 1000)),
      sceneHeight: Math.max(1, Math.round(Number.isFinite(+source.sceneHeight) ? +source.sceneHeight : runtime.sceneHeight || 1000)),
      nextId: Math.max(1, Math.round(Number.isFinite(+source.nextId) ? +source.nextId : runtime.nextId || 1)),
      nextLayerUid: Math.max(1, Math.round(Number.isFinite(+source.nextLayerUid) ? +source.nextLayerUid : runtime.nextLayerUid || 1)),
      selectedId,
      selectedLayerIndex,
      activeTool: typeof source.activeTool === 'string' && source.activeTool ? source.activeTool : 'bone',
      layers: isPlainObject(source.layers) ? deepClone(source.layers) : { bones: true, names: true, images: true, grid: false },
      view: isPlainObject(source.view)
        ? {
            x: Number.isFinite(+source.view.x) ? +source.view.x : 0,
            y: Number.isFinite(+source.view.y) ? +source.view.y : 0,
            scale: clampNumber(source.view.scale, 0.02, 32, 1),
          }
        : { x: 0, y: 0, scale: 1 },
      bones,
      psdLayers,
      projectState: isPlainObject(source.projectState) ? deepClone(source.projectState) : {}
    };
  }

  stateModule.deepClone = deepClone;
  stateModule.getRuntime = getRuntime;
  stateModule.sanitizeProjectData = sanitizeProjectData;
})();
