(function initializeEditorPixiRendererModule() {
  const modules = window.FrogmakerModules = window.FrogmakerModules || {};
  const rendererModule = modules.pixiRenderer = modules.pixiRenderer || {};

  let app = null;
  let root = null;
  let hostCanvas = null;
  const layerEntries = new Map();

  function isAvailable() {
    return !!window.PIXI;
  }

  function isActive() {
    return isAvailable() && !!app;
  }

  function ensureApp() {
    if (!isAvailable()) return null;
    if (app) return app;
    const area = document.getElementById('canvas-area');
    const overlayCanvas = document.getElementById('main-canvas');
    if (!area || !overlayCanvas) return null;

    area.style.position = 'relative';
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.inset = '0';
    overlayCanvas.style.zIndex = '5';
    overlayCanvas.style.background = 'transparent';

    app = new PIXI.Application({
      width: Math.max(1, area.clientWidth),
      height: Math.max(1, area.clientHeight),
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      powerPreference: 'high-performance',
      autoStart: false,
    });

    hostCanvas = app.view;
    hostCanvas.id = 'pixi-layer-canvas';
    hostCanvas.style.position = 'absolute';
    hostCanvas.style.inset = '0';
    hostCanvas.style.width = '100%';
    hostCanvas.style.height = '100%';
    hostCanvas.style.zIndex = '1';
    hostCanvas.style.pointerEvents = 'none';
    area.insertBefore(hostCanvas, overlayCanvas);

    root = new PIXI.Container();
    root.sortableChildren = true;
    app.stage.addChild(root);
    return app;
  }

  function resize() {
    if (!isActive()) return;
    const area = document.getElementById('canvas-area');
    if (!area) return;
    app.renderer.resize(Math.max(1, area.clientWidth), Math.max(1, area.clientHeight));
  }

  function getViewportWorldRect(runtime) {
    const width = runtime.canvas ? runtime.canvas.width : 1;
    const height = runtime.canvas ? runtime.canvas.height : 1;
    const scale = runtime.view && runtime.view.scale ? runtime.view.scale : 1;
    return {
      x: -runtime.view.x / scale,
      y: -runtime.view.y / scale,
      width: width / scale,
      height: height / scale,
    };
  }

  function intersectsViewport(layer, rect) {
    const halfWidth = layer.width / 2;
    const halfHeight = layer.height / 2;
    const rotation = layer.rotation || 0;
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const extentX = halfWidth * cos + halfHeight * sin;
    const extentY = halfWidth * sin + halfHeight * cos;
    const minX = layer.center_x - extentX;
    const minY = layer.center_y - extentY;
    const maxX = layer.center_x + extentX;
    const maxY = layer.center_y + extentY;
    return !(maxX < rect.x || maxY < rect.y || minX > rect.x + rect.width || minY > rect.y + rect.height);
  }

  function destroyLayerEntry(entry) {
    if (!entry) return;
    try {
      if (entry.displayObject && entry.displayObject.parent) entry.displayObject.parent.removeChild(entry.displayObject);
      if (entry.displayObject) entry.displayObject.destroy();
    } catch (_error) {}
    try {
      if (entry.texture) entry.texture.destroy(true);
    } catch (_error) {}
  }

  function normalizeUvs(layer) {
    const uvs = layer && layer.mesh && Array.isArray(layer.mesh.uvs) ? layer.mesh.uvs : [];
    const result = new Float32Array(uvs.length * 2);
    const width = Math.max(1, layer.width || 1);
    const height = Math.max(1, layer.height || 1);
    for (let i = 0; i < uvs.length; i++) {
      const uv = uvs[i] || { u: 0, v: 0 };
      const u = Math.abs(uv.u) <= 1.0001 ? uv.u : (uv.u / width);
      const v = Math.abs(uv.v) <= 1.0001 ? uv.v : (uv.v / height);
      result[i * 2] = u;
      result[i * 2 + 1] = v;
    }
    return result;
  }

  function buildVertexArray(layer, getRenderMeshVertices) {
    const vertices = getRenderMeshVertices(layer);
    const result = new Float32Array(vertices.length * 2);
    for (let i = 0; i < vertices.length; i++) {
      const local = window.meshPointToLayerLocal ? window.meshPointToLayerLocal(layer, vertices[i]) : vertices[i];
      result[i * 2] = local ? local.x : 0;
      result[i * 2 + 1] = local ? local.y : 0;
    }
    return result;
  }

  function buildIndexArray(layer) {
    const indices = layer && layer.mesh && Array.isArray(layer.mesh.indices) ? layer.mesh.indices : [];
    return new Uint16Array(indices.map(value => Math.max(0, Math.round(+value || 0))));
  }

  function createTextureForLayer(layer) {
    return PIXI.Texture.from(layer.img_element || layer.data_url);
  }

  function ensureLayerEntry(layer, helpers) {
    const uid = layer.uid || layer.name;
    let entry = layerEntries.get(uid);
    const textureKey = `${uid}:${layer.data_url ? layer.data_url.length : 0}:${layer.width}x${layer.height}`;
    const isMesh = !!(layer.mesh && layer.mesh.indices && layer.mesh.uvs);

    if (!entry || entry.kind !== (isMesh ? 'mesh' : 'sprite') || entry.textureKey !== textureKey) {
      if (entry) destroyLayerEntry(entry);
      const texture = createTextureForLayer(layer);
      if (isMesh) {
        const vertices = buildVertexArray(layer, helpers.getRenderMeshVertices);
        const uvs = normalizeUvs(layer);
        const indices = buildIndexArray(layer);
        const mesh = new PIXI.SimpleMesh(texture, vertices, uvs, indices);
        mesh.autoUpdate = false;
        entry = {
          uid,
          kind: 'mesh',
          textureKey,
          texture,
          displayObject: mesh,
          mesh,
          vertexCount: vertices.length / 2,
          indexCount: indices.length,
        };
      } else {
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        entry = {
          uid,
          kind: 'sprite',
          textureKey,
          texture,
          displayObject: sprite,
          sprite,
        };
      }
      root.addChild(entry.displayObject);
      layerEntries.set(uid, entry);
    }
    return entry;
  }

  function updateMeshEntry(entry, layer, helpers) {
    const vertexArray = buildVertexArray(layer, helpers.getRenderMeshVertices);
    if (entry.vertexCount !== vertexArray.length / 2 || entry.indexCount !== (layer.mesh.indices || []).length) {
      destroyLayerEntry(entry);
      layerEntries.delete(entry.uid);
      return null;
    }
    entry.mesh.verticesBuffer.data.set(vertexArray);
    entry.mesh.verticesBuffer.update();
    entry.mesh.position.set(layer.center_x, layer.center_y);
    entry.mesh.rotation = layer.rotation || 0;
    entry.mesh.alpha = 1;
    entry.mesh.visible = true;
    return entry;
  }

  function updateSpriteEntry(entry, layer) {
    entry.sprite.position.set(layer.center_x, layer.center_y);
    entry.sprite.rotation = layer.rotation || 0;
    entry.sprite.width = layer.width;
    entry.sprite.height = layer.height;
    entry.sprite.alpha = 1;
    entry.sprite.visible = true;
  }

  function renderScene(renderLayers, helpers = {}) {
    if (!ensureApp()) return false;
    const runtime = modules.runtime;
    if (!runtime) return false;

    resize();

    const viewport = getViewportWorldRect(runtime);
    root.position.set(runtime.view.x, runtime.view.y);
    root.scale.set(runtime.view.scale, runtime.view.scale);

    const visibleIds = new Set();
    renderLayers.forEach(({ layer, index }) => {
      if (!layer || !layer.img_element) return;
      if (helpers.getLayerRenderVisible && !helpers.getLayerRenderVisible(layer)) return;
      if (!intersectsViewport(layer, viewport)) return;
      const entry = ensureLayerEntry(layer, helpers);
      if (!entry) return;
      visibleIds.add(entry.uid);
      entry.displayObject.zIndex = helpers.getLayerZ ? helpers.getLayerZ(layer, index) : index;
      if (entry.kind === 'mesh') {
        const nextEntry = updateMeshEntry(entry, layer, helpers);
        if (!nextEntry) return;
      } else {
        updateSpriteEntry(entry, layer);
      }
    });

    layerEntries.forEach((entry, uid) => {
      entry.displayObject.visible = visibleIds.has(uid);
    });

    app.render();
    return true;
  }

  rendererModule.ensureApp = ensureApp;
  rendererModule.resize = resize;
  rendererModule.renderScene = renderScene;
  rendererModule.isAvailable = isAvailable;
  rendererModule.isActive = isActive;
})();
