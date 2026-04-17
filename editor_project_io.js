(function initializeEditorProjectIoModule() {
  const modules = window.FrogmakerModules = window.FrogmakerModules || {};
  const stateModule = modules.state;
  const uiModule = modules.ui || {};
  const projectIOModule = modules.projectIO = modules.projectIO || {};

  function getRuntime() {
    return stateModule.getRuntime();
  }

  function deepClone(value) {
    return stateModule.deepClone(value);
  }

  function runEditorAction(label, action) {
    if (typeof uiModule.runEditorAction === 'function') {
      return uiModule.runEditorAction(label, action);
    }
    return action();
  }

  function serializeProjectData() {
    const runtime = getRuntime();
    return {
      version: 'frog-1',
      schemaVersion: stateModule.PROJECT_SCHEMA_VERSION,
      sceneWidth: runtime.sceneWidth,
      sceneHeight: runtime.sceneHeight,
      nextId: runtime.nextId,
      nextLayerUid: runtime.nextLayerUid,
      selectedId: runtime.selectedId,
      selectedLayerIndex: runtime.selectedLayerIndex,
      activeTool: runtime.activeTool,
      layers: deepClone(runtime.layers),
      view: deepClone(runtime.view),
      bones: deepClone(runtime.bones),
      psdLayers: runtime.psdLayers.map(layer => serializeLayer(layer)),
      projectState: deepClone(runtime.projectState)
    };
  }

  async function loadProjectData(data, options = {}) {
    const runtime = getRuntime();
    const normalized = stateModule.sanitizeProjectData(data);
    const resetUndo = options.resetUndo === true;

    runtime.isRestoringHistory = true;
    try {
      runtime.sceneWidth = normalized.sceneWidth;
      runtime.sceneHeight = normalized.sceneHeight;
      runtime.nextId = normalized.nextId;
      runtime.nextLayerUid = normalized.nextLayerUid;
      runtime.selectedId = normalized.selectedId;
      runtime.selectedLayerIndex = normalized.selectedLayerIndex;
      runtime.activeTool = normalized.activeTool;
      runtime.layers = Object.assign({ bones: true, names: true, images: true, grid: false }, normalized.layers || {});
      runtime.view = Object.assign({ x: 0, y: 0, scale: 1 }, normalized.view || {});
      runtime.bones = deepClone(normalized.bones || []);
      runtime.psdLayers = [];

      const serializedLayers = normalized.psdLayers || [];
      for (const layerData of serializedLayers) {
        const layer = deepClone(layerData);
        ensureLayerIdentity(layer);
        if (layer.data_url) {
          try {
            layer.img_element = await createImageFromDataUrl(layer.data_url);
          } catch (error) {
            console.warn('No se pudo reconstruir una imagen del proyecto .frog', error);
            layer.img_element = null;
          }
        } else {
          layer.img_element = null;
        }
        runtime.psdLayers.push(layer);
      }

      const loadedProjectState = deepClone(normalized.projectState || {});
      runtime.projectState.editorMode = loadedProjectState.editorMode || 'rig';
      runtime.projectState.bindPose = loadedProjectState.bindPose || { bones: {}, slots: {} };
      runtime.projectState.animations = loadedProjectState.animations || [];
      if (typeof ensureAnimationShape === 'function') runtime.projectState.animations.forEach(ensureAnimationShape);
      runtime.projectState.playback = Object.assign({
        currentAnimationId: null,
        currentFrame: 0,
        isPlaying: false,
        lastTickMs: 0,
        autoKey: true
      }, loadedProjectState.playback || {});
      runtime.projectState.playback.isPlaying = false;
      runtime.projectState.timeline = Object.assign({
        selectedType: 'bone',
        selectedTargetId: 0,
        selectedFrame: null,
        selectedFrames: [],
        clipboard: null
      }, loadedProjectState.timeline || {});
      runtime.projectState.meshEditor = Object.assign({
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
      }, loadedProjectState.meshEditor || {});
      ensureMeshEditorState();
      runtime.projectState.videoReference = Object.assign({
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
      }, loadedProjectState.videoReference || {});
      runtime.projectState.heatmap = Object.assign({
        enabled: false,
        mode: 'dominant',
        selectedBoneId: null,
        opacity: 0.65
      }, loadedProjectState.heatmap || {});
      runtime.projectState.weightBrush = Object.assign({
        active: false,
        targetBoneId: null,
        radius: 60,
        strength: 0.08,
        mode: 'add',
        falloff: 'linear'
      }, loadedProjectState.weightBrush || {});
      runtime.projectState.stitchBrush = Object.assign({
        active: false,
        sourceLayerUid: null,
        targetLayerUid: null,
        radius: 50,
        strength: 1,
        mode: 'weld',
        falloff: 'linear',
        smoothRadius: 35
      }, loadedProjectState.stitchBrush || {});
      runtime.projectState.meshStitches = Array.isArray(loadedProjectState.meshStitches)
        ? loadedProjectState.meshStitches
        : [];
      runtime.projectState.ikConstraints = Array.isArray(loadedProjectState.ikConstraints)
        ? loadedProjectState.ikConstraints
        : [];
      ensureIkConstraints();
      runtime.projectState.drivenConstraints = Array.isArray(loadedProjectState.drivenConstraints)
        ? loadedProjectState.drivenConstraints
        : [];
      ensureDrivenConstraints();
      runtime.projectState.secondaryMotion = Object.assign({
        enabled: true,
        autoBakeOnExport: true,
        maxActiveBones: 24,
        chains: []
      }, loadedProjectState.secondaryMotion || {});
      ensureSecondaryMotionState();
      runtime.projectState.switchDefaults = Object.assign({}, loadedProjectState.switchDefaults || {});
      runtime.projectState.layerTree = Object.assign({
        collapsedGroups: {},
        soloGroup: null
      }, loadedProjectState.layerTree || {});
      ensureLayerTreeState();
      runtime.projectState.camera = Object.assign({
        enabled: true,
        x: runtime.sceneWidth / 2,
        y: runtime.sceneHeight / 2,
        zoom: 1,
        width: 1920,
        height: 1080,
        showFrame: true
      }, loadedProjectState.camera || {});
      ensureProjectCamera();
      runtime.projectState.onionSkin = Object.assign({
        enabled: false,
        before: 2,
        after: 2,
        step: 1,
        opacity: 0.28,
        tint: true
      }, loadedProjectState.onionSkin || {});
      ensureOnionSkin();
      runtime.projectState.lipsync = Object.assign({
        group: '',
        autoAdvance: true,
        advanceFrames: 2
      }, loadedProjectState.lipsync || {});
      ensureLipsyncState();

      if (runtime.videoReferenceObjectUrl) {
        URL.revokeObjectURL(runtime.videoReferenceObjectUrl);
        runtime.videoReferenceObjectUrl = null;
      }
      if (runtime.projectState.videoReference.dataUrl) {
        try {
          const video = await createVideoFromDataUrl(runtime.projectState.videoReference.dataUrl);
          attachVideoReferenceElement(video);
        } catch (error) {
          console.warn('No se pudo reconstruir el video de referencia del proyecto .frog', error);
          attachVideoReferenceElement(null);
          runtime.projectState.videoReference.enabled = false;
        }
      } else {
        attachVideoReferenceElement(null);
      }

      if (!runtime.bones.some(bone => bone && bone.id === runtime.selectedId)) {
        runtime.selectedId = runtime.bones[0] ? runtime.bones[0].id : 0;
      }
      if (runtime.selectedLayerIndex !== null && !runtime.psdLayers[runtime.selectedLayerIndex]) {
        runtime.selectedLayerIndex = null;
      }

      resetSecondaryMotionState('load-project');

      if (resetUndo) runtime.undoStack = [];

      document.getElementById('st-bones').textContent = `${runtime.bones.length} bones`;
      document.getElementById('auto-key-toggle').checked = runtime.projectState.playback.autoKey !== false;
      switchEditorMode(runtime.projectState.editorMode || 'rig');
      setTool(runtime.activeTool || (runtime.projectState.editorMode === 'animation' ? 'move' : 'bone'));
      if (runtime.projectState.editorMode === 'animation' && typeof applyAnimationAtCurrentFrame === 'function' && getCurrentAnimation()) {
        applyAnimationAtCurrentFrame();
      } else {
        restorePose();
      }
      updateTree();
      updateLayerList();
      updateProps();
      if (typeof renderClipList === 'function') renderClipList();
      if (typeof updateAnimationControls === 'function') updateAnimationControls();
      if (typeof renderTimeline === 'function') renderTimeline();
      render();
      if (resetUndo) modules.history.pushUndoSnapshot();
    } finally {
      runtime.isRestoringHistory = false;
    }
  }

  function saveProjectFile() {
    const runtime = getRuntime();
    if (runtime.psdLayers.length === 0) {
      alert('No hay proyecto para guardar.');
      return;
    }
    return runEditorAction('Guardar proyecto', async () => {
      const payload = serializeProjectData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'proyecto.frog';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      if (typeof uiModule.notify === 'function') uiModule.notify('Proyecto guardado.', 'info', 2200);
    });
  }

  async function loadProjectFile(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    await runEditorAction('Abrir proyecto', async () => {
      try {
        if (typeof uiModule.setLoading === 'function') uiModule.setLoading(true, 'Abriendo proyecto...');
        if (file.size > 150 * 1024 * 1024) {
          throw new Error('El archivo .frog es demasiado grande.');
        }
        const text = await file.text();
        const data = JSON.parse(text);
        await loadProjectData(data, { resetUndo: true });
        if (typeof uiModule.notify === 'function') uiModule.notify('Proyecto cargado.', 'info', 2400);
      } finally {
        if (typeof uiModule.setLoading === 'function') uiModule.setLoading(false, 'Procesando...');
        event.target.value = '';
      }
    });
  }

  projectIOModule.serializeProjectData = serializeProjectData;
  projectIOModule.loadProjectData = loadProjectData;
  projectIOModule.saveProjectFile = saveProjectFile;
  projectIOModule.loadProjectFile = loadProjectFile;
})();
