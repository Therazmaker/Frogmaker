function ensureAnimationShape(animation) {
  if (!animation.boneTimelines) animation.boneTimelines = {};
  if (!animation.slotTimelines) animation.slotTimelines = {};
  if (!animation.switchTimelines) animation.switchTimelines = {};
  if (!animation.cameraTimeline) animation.cameraTimeline = { x: [], y: [], zoom: [] };
  return animation;
}

function createDefaultAnimation(name = null) {
  const clipId = 'anim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  return ensureAnimationShape({
    id: clipId,
    name: name || `Animacion ${projectState.animations.length + 1}`,
    duration: 48,
    loop: true,
    frameRate: 24,
    boneTimelines: {},
    slotTimelines: {},
    switchTimelines: {},
    cameraTimeline: { x: [], y: [], zoom: [] }
  });
}

function ensureAnimationReady() {
  if (!getCurrentAnimation()) createAnimationClip();
}

function getCurrentAnimation() {
  return projectState.animations.find(animation => animation.id === projectState.playback.currentAnimationId) || null;
}

function selectAnimation(animationId) {
  projectState.playback.currentAnimationId = animationId;
  projectState.playback.currentFrame = 0;
  projectState.timeline.selectedFrame = null;
  projectState.timeline.selectedFrames = [];
  if (typeof resetSecondaryMotionState === 'function') resetSecondaryMotionState('select-animation');
  updateAnimationControls();
  renderClipList();
  applyAnimationAtCurrentFrame();
}

function createAnimationClip() {
  const animation = createDefaultAnimation();
  projectState.animations.push(animation);
  selectAnimation(animation.id);
  pushUndoSnapshot();
}

function duplicateCurrentAnimation() {
  const current = getCurrentAnimation();
  if (!current) {
    createAnimationClip();
    return;
  }
  const copy = JSON.parse(JSON.stringify(current));
  copy.id = 'anim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  copy.name = current.name + ' copia';
  projectState.animations.push(copy);
  selectAnimation(copy.id);
  pushUndoSnapshot();
}

function deleteCurrentAnimation() {
  const current = getCurrentAnimation();
  if (!current) return;
  projectState.animations = projectState.animations.filter(animation => animation.id !== current.id);
  if (projectState.animations.length > 0) selectAnimation(projectState.animations[0].id);
  else {
    projectState.playback.currentAnimationId = null;
    projectState.playback.currentFrame = 0;
    projectState.playback.isPlaying = false;
    updateAnimationControls();
    renderClipList();
    renderTimeline();
    restorePose();
  }
  pushUndoSnapshot();
}

function renderClipList() {
  const list = document.getElementById('clip-list');
  list.innerHTML = '';
  if (projectState.animations.length === 0) {
    list.innerHTML = '<div style="color:#666; font-size:11px;">Sin clips</div>';
    return;
  }
  projectState.animations.forEach(animation => {
    const div = document.createElement('div');
    div.className = 'clip-item' + (animation.id === projectState.playback.currentAnimationId ? ' selected' : '');
    div.innerHTML = `<span style="flex:1">${animation.name}</span><small>${animation.duration}f</small>`;
    div.onclick = () => selectAnimation(animation.id);
    list.appendChild(div);
  });
}

function updateAnimationControls() {
  const animation = getCurrentAnimation();
  const meta = document.getElementById('timeline-meta');
  const slider = document.getElementById('frame-slider');
  const fpsInput = document.getElementById('timeline-fps-input');
  const durationInput = document.getElementById('timeline-duration-input');
  const videoToggle = document.getElementById('video-ref-toggle');
  const videoOpacity = document.getElementById('video-opacity-input');
  const onionToggle = document.getElementById('onion-toggle');
  const onionBefore = document.getElementById('onion-before-input');
  const onionAfter = document.getElementById('onion-after-input');
  const onionOpacity = document.getElementById('onion-opacity-input');
  if (videoToggle) videoToggle.checked = !!(projectState.videoReference && projectState.videoReference.enabled);
  if (videoOpacity) videoOpacity.value = Math.round(((projectState.videoReference && projectState.videoReference.opacity) ?? 0.45) * 100);
  const onion = typeof ensureOnionSkin === 'function' ? ensureOnionSkin() : projectState.onionSkin;
  if (onionToggle) onionToggle.checked = !!(onion && onion.enabled);
  if (onionBefore) onionBefore.value = onion ? onion.before : 2;
  if (onionAfter) onionAfter.value = onion ? onion.after : 2;
  if (onionOpacity) onionOpacity.value = Math.round(((onion && onion.opacity) || 0.28) * 100);
  if (!animation) {
    meta.textContent = 'Sin clip';
    slider.max = 48;
    slider.value = 0;
    if (fpsInput) fpsInput.value = 24;
    if (durationInput) durationInput.value = 48;
    document.getElementById('timeline-empty').style.display = '';
    document.getElementById('timeline-grid').innerHTML = '';
    renderLipsyncPanel();
    return;
  }
  slider.max = animation.duration;
  slider.value = projectState.playback.currentFrame;
  if (fpsInput) fpsInput.value = animation.frameRate;
  if (durationInput) durationInput.value = animation.duration;
  meta.textContent = `${animation.name} · ${projectState.playback.currentFrame}/${animation.duration}f · ${animation.frameRate} fps`;
  renderLipsyncPanel();
}

function updateTimelinePlayhead() {
  const animation = getCurrentAnimation();
  const grid = document.getElementById('timeline-grid');
  if (!grid || !animation || projectState.editorMode !== 'animation') return;
  const left = `${projectState.playback.currentFrame * TIMELINE_FRAME_WIDTH + 8}px`;
  grid.querySelectorAll('.timeline-current-line').forEach(node => {
    node.style.left = left;
  });
}

function updateAnimationPlaybackUi() {
  updateAnimationControls();
  updateTimelinePlayhead();
}

function getUnionFrames(tracks) {
  const frames = new Set();
  tracks.forEach(track => (track || []).forEach(item => frames.add(item.frame)));
  return [...frames].sort(sortNumeric);
}

function upsertFrame(track, frame, value, interpolation) {
  const existing = track.find(item => item.frame === frame);
  if (existing) {
    existing.value = value;
    existing.interpolation = interpolation || existing.interpolation || 'linear';
  } else {
    track.push({ frame, value, interpolation: interpolation || 'linear' });
    track.sort((a, b) => a.frame - b.frame);
  }
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function renderDrivenConstraintSelect(constraint, side, selectedType) {
  const typeField = side === 'driver' ? 'driverType' : 'drivenType';
  const idField = side === 'driver' ? 'driverId' : 'drivenId';
  const layerField = side === 'driver' ? 'driverLayerUid' : 'drivenLayerUid';
  const currentType = constraint[typeField] === 'layer' ? 'layer' : 'bone';
  const currentValue = currentType === 'layer' ? constraint[layerField] : constraint[idField];
  const options = currentType === 'layer'
    ? `<option value="">(ninguna)</option>${psdLayers.map(layer => `<option value="${escapeAttr(layer.uid)}" ${layer.uid === currentValue ? 'selected' : ''}>${escapeHTML(layer.name)}</option>`).join('')}`
    : `<option value="">(ninguno)</option>${bones.map(bone => `<option value="${bone.id}" ${bone.id === currentValue ? 'selected' : ''}>${escapeHTML(bone.name)}</option>`).join('')}`;
  return `
    <div class="prop-row"><span class="prop-label">${side === 'driver' ? 'Tipo' : 'Driven'}</span><select onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', '${typeField}', this.value)"><option value="bone" ${currentType === 'bone' ? 'selected' : ''}>bone</option><option value="layer" ${currentType === 'layer' ? 'selected' : ''}>layer</option></select></div>
    <div class="prop-row"><span class="prop-label">${currentType === 'layer' ? 'Capa' : 'Bone'}</span><select onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', '${currentType === 'layer' ? layerField : idField}', this.value)">${options}</select></div>
  `;
}

function buildDrivenConstraintMarkup(selectedType, selectedEntity) {
  const selectedValue = selectedType === 'layer' ? selectedEntity.uid : selectedEntity.id;
  const constraints = typeof getDrivenConstraintsForSubject === 'function'
    ? getDrivenConstraintsForSubject(selectedType, selectedValue)
    : [];
  const itemsMarkup = constraints.length ? constraints.map(constraint => {
    const valid = typeof isValidDrivenConstraint === 'function' ? isValidDrivenConstraint(constraint) : true;
    const driverLabel = typeof getDrivenConstraintLabel === 'function'
      ? getDrivenConstraintLabel(constraint.driverType, constraint.driverType === 'layer' ? constraint.driverLayerUid : constraint.driverId)
      : '';
    const drivenLabel = typeof getDrivenConstraintLabel === 'function'
      ? getDrivenConstraintLabel(constraint.drivenType, constraint.drivenType === 'layer' ? constraint.drivenLayerUid : constraint.drivenId)
      : '';
    return `
      <div style="margin-top:8px; padding-top:8px; border-top:1px solid #3c3c3c">
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${constraint.enabled !== false ? 'checked' : ''} onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', 'enabled', this.checked)"> Activo</label>
        <div class="prop-row"><span class="prop-label">Estado</span><input type="text" value="${valid ? `${driverLabel} -> ${drivenLabel}` : 'Constraint invalida'}" disabled></div>
        <div class="prop-row"><span class="prop-label">Driver</span><select onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', 'driverType', this.value)"><option value="bone" ${constraint.driverType === 'bone' ? 'selected' : ''}>bone</option><option value="layer" ${constraint.driverType === 'layer' ? 'selected' : ''}>layer</option></select></div>
        <div class="prop-row"><span class="prop-label">${constraint.driverType === 'layer' ? 'Capa' : 'Bone'}</span><select onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', '${constraint.driverType === 'layer' ? 'driverLayerUid' : 'driverId'}', this.value)">${constraint.driverType === 'layer'
          ? `<option value="">(ninguna)</option>${psdLayers.map(layer => `<option value="${escapeAttr(layer.uid)}" ${layer.uid === constraint.driverLayerUid ? 'selected' : ''}>${escapeHTML(layer.name)}</option>`).join('')}`
          : `<option value="">(ninguno)</option>${bones.map(bone => `<option value="${bone.id}" ${bone.id === constraint.driverId ? 'selected' : ''}>${escapeHTML(bone.name)}</option>`).join('')}`}</select></div>
        <div class="prop-row"><span class="prop-label">Driven</span><select onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', 'drivenType', this.value)"><option value="bone" ${constraint.drivenType === 'bone' ? 'selected' : ''}>bone</option><option value="layer" ${constraint.drivenType === 'layer' ? 'selected' : ''}>layer</option></select></div>
        <div class="prop-row"><span class="prop-label">${constraint.drivenType === 'layer' ? 'Capa' : 'Bone'}</span><select onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', '${constraint.drivenType === 'layer' ? 'drivenLayerUid' : 'drivenId'}', this.value)">${constraint.drivenType === 'layer'
          ? `<option value="">(ninguna)</option>${psdLayers.map(layer => `<option value="${escapeAttr(layer.uid)}" ${layer.uid === constraint.drivenLayerUid ? 'selected' : ''}>${escapeHTML(layer.name)}</option>`).join('')}`
          : `<option value="">(ninguno)</option>${bones.map(bone => `<option value="${bone.id}" ${bone.id === constraint.drivenId ? 'selected' : ''}>${escapeHTML(bone.name)}</option>`).join('')}`}</select></div>
        <div class="prop-row"><span class="prop-label">Factor</span><input type="number" step="0.1" value="${Number.isFinite(+constraint.factor) ? +constraint.factor : -1}" onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', 'factor', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Offset</span><input type="number" step="0.1" value="${Number.isFinite(+constraint.offset) ? +constraint.offset : 0}" onchange="updateDrivenConstraintField('${escapeAttr(constraint.id)}', 'offset', +this.value)"></div>
        <div class="inline-actions"><button class="tiny-btn" onclick="invertDrivenConstraint('${escapeAttr(constraint.id)}')">Invertir</button><button class="tiny-btn" onclick="setDrivenConstraintRestPose('${escapeAttr(constraint.id)}')">Tomar pose</button><button class="tiny-btn danger" onclick="deleteDrivenConstraint('${escapeAttr(constraint.id)}')">Borrar</button></div>
      </div>
    `;
  }).join('') : `
    <div class="prop-row"><span class="prop-label">Estado</span><input type="text" value="Sin contramovimiento" disabled></div>
  `;
  return `
    <div class="section-title" style="margin-top:10px">Contramovimiento</div>
    ${itemsMarkup}
    <div class="inline-actions" style="margin-top:8px"><button class="tiny-btn" onclick="createDrivenConstraintForSelection()">Crear contramovimiento</button></div>
  `;
}

function ensureBoneTimeline(animation, boneId) {
  ensureAnimationShape(animation);
  if (!animation.boneTimelines[boneId]) animation.boneTimelines[boneId] = { x: [], y: [], rotation: [] };
  return animation.boneTimelines[boneId];
}

function ensureSlotTimeline(animation, layerIndex) {
  ensureAnimationShape(animation);
  if (!animation.slotTimelines[layerIndex]) animation.slotTimelines[layerIndex] = { x: [], y: [], rotation: [], visible: [], zOrder: [], displayIndex: [], mesh: [] };
  return animation.slotTimelines[layerIndex];
}

function ensureSwitchTimeline(animation, groupName) {
  ensureAnimationShape(animation);
  const group = String(groupName || '').trim();
  if (!group) return null;
  if (!animation.switchTimelines[group]) animation.switchTimelines[group] = [];
  return animation.switchTimelines[group];
}

function ensureCameraTimeline(animation) {
  ensureAnimationShape(animation);
  if (!animation.cameraTimeline) animation.cameraTimeline = { x: [], y: [], zoom: [] };
  if (!animation.cameraTimeline.x) animation.cameraTimeline.x = [];
  if (!animation.cameraTimeline.y) animation.cameraTimeline.y = [];
  if (!animation.cameraTimeline.zoom) animation.cameraTimeline.zoom = [];
  return animation.cameraTimeline;
}

function upsertMeshFrame(track, frame, vertices, interpolation = 'linear') {
  const payload = cloneVertices(vertices);
  const existing = track.find(item => item.frame === frame);
  if (existing) {
    existing.vertices = payload;
    existing.interpolation = interpolation || existing.interpolation || 'linear';
  } else {
    track.push({ frame, vertices: payload, interpolation: interpolation || 'linear' });
    track.sort((a, b) => a.frame - b.frame);
  }
}

function interpolateVertexArrays(a, b, ratio, interpolation) {
  const eased = easeRatio(ratio, interpolation || 'linear');
  return a.map((vertex, index) => {
    const target = b[index] || vertex;
    return {
      x: vertex.x + (target.x - vertex.x) * eased,
      y: vertex.y + (target.y - vertex.y) * eased
    };
  });
}

function evaluateMeshTrack(track, frame, baseVertices) {
  if (!track || track.length === 0) return cloneVertices(baseVertices);
  const sorted = [...track].sort((a, b) => a.frame - b.frame);
  let previous = null;
  let next = null;
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (item.frame === frame) return cloneVertices(item.vertices);
    if (item.frame < frame) previous = item;
    if (item.frame > frame) {
      next = item;
      break;
    }
  }
  if (!previous && !next) return cloneVertices(baseVertices);
  if (!previous) return cloneVertices(baseVertices);
  if (!next) return cloneVertices(previous.vertices);
  const ratio = clamp((frame - previous.frame) / Math.max(1, next.frame - previous.frame), 0, 1);
  return interpolateVertexArrays(previous.vertices, next.vertices, ratio, previous.interpolation || 'linear');
}

function easeRatio(ratio, interpolation) {
  if (interpolation === 'step') return 0;
  if (interpolation === 'easeInOut') return ratio < 0.5 ? 2 * ratio * ratio : 1 - Math.pow(-2 * ratio + 2, 2) / 2;
  return ratio;
}

function interpolateValue(a, b, ratio, interpolation) {
  if (interpolation === 'step') return a;
  return a + (b - a) * easeRatio(ratio, interpolation);
}

function interpolateAngleDeg(a, b, ratio, interpolation) {
  if (interpolation === 'step') return a;
  let delta = normalizeAngleDeg(b - a);
  return a + delta * easeRatio(ratio, interpolation);
}

function evaluateTrack(track, frame, defaultValue, isAngle = false) {
  if (!track || track.length === 0) return defaultValue;
  const sorted = [...track].sort((a, b) => a.frame - b.frame);
  let previous = null;
  let next = null;
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (item.frame === frame) return item.value;
    if (item.frame < frame) previous = item;
    if (item.frame > frame) {
      next = item;
      break;
    }
  }
  if (!previous && !next) return defaultValue;
  if (!previous) return defaultValue;
  if (!next) return previous.value;
  const ratio = clamp((frame - previous.frame) / Math.max(1, next.frame - previous.frame), 0, 1);
  return isAngle ? interpolateAngleDeg(previous.value, next.value, ratio, previous.interpolation || 'linear') : interpolateValue(previous.value, next.value, ratio, previous.interpolation || 'linear');
}

function getSwitchTrackValue(animation, groupName, frame) {
  const group = String(groupName || '').trim();
  const defaultKey = typeof getSwitchDefaultKey === 'function' ? getSwitchDefaultKey(group) : '';
  return typeof getActiveSwitchKey === 'function'
    ? getActiveSwitchKey(group, animation, frame)
    : evaluateSwitchTrack(animation && animation.switchTimelines ? animation.switchTimelines[group] : [], frame, defaultKey);
}

function applySwitchTimelinesAtFrame(animation, frame) {
  if (!animation || typeof getSwitchGroups !== 'function') return;
  ensureAnimationShape(animation);
  const groups = getSwitchGroups();
  Object.keys(groups).forEach(groupName => {
    const activeKey = getSwitchTrackValue(animation, groupName, frame);
    groups[groupName].forEach(entry => {
      const baseVisible = entry.layer.visible !== false;
      entry.layer.runtime_visible = !!baseVisible && entry.key === activeKey;
    });
  });
}

function getCameraValue(animation, frame) {
  const camera = typeof ensureProjectCamera === 'function' ? ensureProjectCamera() : (projectState.camera || {});
  const timeline = animation ? ensureCameraTimeline(animation) : null;
  return {
    x: evaluateTrack(timeline ? timeline.x : [], frame, Number.isFinite(+camera.x) ? +camera.x : sceneWidth / 2),
    y: evaluateTrack(timeline ? timeline.y : [], frame, Number.isFinite(+camera.y) ? +camera.y : sceneHeight / 2),
    zoom: clamp(evaluateTrack(timeline ? timeline.zoom : [], frame, Number.isFinite(+camera.zoom) ? +camera.zoom : 1), 0.05, 20),
    width: Math.max(1, Math.round(+camera.width || 1920)),
    height: Math.max(1, Math.round(+camera.height || 1080)),
    enabled: camera.enabled !== false,
    showFrame: camera.showFrame !== false
  };
}

function applyCameraAtFrame(animation, frame) {
  if (typeof ensureProjectCamera !== 'function') return;
  const camera = ensureProjectCamera();
  const value = getCameraValue(animation, frame);
  camera.x = value.x;
  camera.y = value.y;
  camera.zoom = value.zoom;
}

function getBoneAnimationValue(animation, boneId, frame) {
  const bind = projectState.bindPose.bones[boneId];
  if (!bind) return null;
  const timeline = animation && animation.boneTimelines ? animation.boneTimelines[boneId] : null;
  return {
    x: evaluateTrack(timeline ? timeline.x : [], frame, bind.x),
    y: evaluateTrack(timeline ? timeline.y : [], frame, bind.y),
    rotation: evaluateTrack(timeline ? timeline.rotation : [], frame, bind.rotation, true),
    length: bind.length
  };
}

function getSlotAnimationValue(animation, layerIndex, frame) {
  const bind = projectState.bindPose.slots[layerIndex];
  if (!bind) return null;
  const timeline = animation && animation.slotTimelines ? animation.slotTimelines[layerIndex] : null;
  return {
    x: evaluateTrack(timeline ? timeline.x : [], frame, bind.x),
    y: evaluateTrack(timeline ? timeline.y : [], frame, bind.y),
    rotation: evaluateTrack(timeline ? timeline.rotation : [], frame, bind.rotation, true),
    visible: evaluateTrack(timeline ? timeline.visible : [], frame, bind.visible ? 1 : 0) >= 0.5,
    zOrder: Math.round(evaluateTrack(timeline ? timeline.zOrder : [], frame, bind.zOrder))
  };
}

function getSlotMeshVertices(animation, layerIndex, frame) {
  const layer = getLayerByIndex(layerIndex);
  if (!layer || !layer.mesh || !layer.mesh.bindVertices) return null;
  const timeline = animation && animation.slotTimelines ? animation.slotTimelines[layerIndex] : null;
  const evaluated = evaluateMeshTrack(timeline ? timeline.mesh : [], frame, layer.mesh.bindVertices);
  return evaluated && evaluated.length === layer.mesh.bindVertices.length ? evaluated : null;
}

function buildBonePoseMap(animation, frame) {
  const poseMap = {};
  function resolveBone(bone) {
    const local = getBoneAnimationValue(animation, bone.id, frame);
    if (!local) return;
    if (bone.parent === null) {
      poseMap[bone.id] = {
        x: local.x,
        y: local.y,
        rotation: local.rotation,
        ex: local.x + Math.cos(local.rotation * Math.PI / 180) * local.length,
        ey: local.y + Math.sin(local.rotation * Math.PI / 180) * local.length
      };
      return;
    }
    const parentPose = poseMap[bone.parent];
    if (!parentPose) return;
    const start = localPointToWorld(local.x, local.y, parentPose.ex, parentPose.ey, parentPose.rotation);
    const rotation = normalizeAngleDeg(parentPose.rotation + local.rotation);
    poseMap[bone.id] = {
      x: start.x,
      y: start.y,
      rotation,
      ex: start.x + Math.cos(rotation * Math.PI / 180) * local.length,
      ey: start.y + Math.sin(rotation * Math.PI / 180) * local.length
    };
  }
  bones.filter(bone => bone.parent === null).forEach(rootBone => {
    const queue = [rootBone];
    while (queue.length) {
      const current = queue.shift();
      resolveBone(current);
      bones.filter(child => child.parent === current.id).forEach(child => queue.push(child));
    }
  });
  return poseMap;
}

function getLayerAnimationStateAtFrame(animation, layer, layerIndex, frame, poseMap) {
  const bind = projectState.bindPose.slots[layerIndex];
  const slotValue = getSlotAnimationValue(animation, layerIndex, frame);
  if (!bind || !slotValue) return null;
  const group = typeof getLayerSwitchGroup === 'function' ? getLayerSwitchGroup(layer) : '';
  const key = typeof getLayerSwitchKey === 'function' ? getLayerSwitchKey(layer) : '';
  if (group && key) {
    const activeKey = getSwitchTrackValue(animation, group, frame);
    if (key !== activeKey) return null;
  }
  const parentBone = layer.bone_id !== null ? getBoneById(layer.bone_id) : null;
  let centerX = slotValue.x;
  let centerY = slotValue.y;
  let rotation = slotValue.rotation * Math.PI / 180;
  if (parentBone) {
    const parentPose = poseMap[parentBone.id];
    if (!parentPose) return null;
    const start = localPointToWorld(slotValue.x, slotValue.y, parentPose.x, parentPose.y, parentPose.rotation);
    centerX = start.x;
    centerY = start.y;
    rotation = (parentPose.rotation + slotValue.rotation) * Math.PI / 180;
  }
  return {
    centerX,
    centerY,
    rotation,
    visible: slotValue.visible,
    zOrder: slotValue.zOrder,
    meshVertices: layer.mesh ? getSlotMeshVertices(animation, layerIndex, frame) : null
  };
}

function drawLayerWithState(drawCtx, layer, state) {
  if (!state || !state.visible || !layer.img_element) return;
  drawCtx.save();
  drawCtx.translate(state.centerX, state.centerY);
  drawCtx.rotate(state.rotation || 0);
  if (layer.mesh && layer.mesh.indices && layer.mesh.uvs) {
    const vertices = state.meshVertices || layer.mesh.bindVertices || layer.mesh.vertices || [];
    for (let i = 0; i < layer.mesh.indices.length; i += 3) {
      const i0 = layer.mesh.indices[i];
      const i1 = layer.mesh.indices[i + 1];
      const i2 = layer.mesh.indices[i + 2];
      if (!vertices[i0] || !vertices[i1] || !vertices[i2] || !layer.mesh.uvs[i0] || !layer.mesh.uvs[i1] || !layer.mesh.uvs[i2]) continue;
      drawTexturedTriangle(
        drawCtx,
        layer.img_element,
        meshPointToLayerLocal(layer, vertices[i0]),
        meshPointToLayerLocal(layer, vertices[i1]),
        meshPointToLayerLocal(layer, vertices[i2]),
        layer.mesh.uvs[i0],
        layer.mesh.uvs[i1],
        layer.mesh.uvs[i2]
      );
    }
  } else {
    drawCtx.drawImage(layer.img_element, -layer.width / 2, -layer.height / 2);
  }
  drawCtx.restore();
}

function drawAnimationFrameGhost(drawCtx, animation, frame, opacity, direction) {
  const poseMap = buildBonePoseMap(animation, frame);
  const entries = psdLayers
    .map((layer, index) => ({ layer, index, state: getLayerAnimationStateAtFrame(animation, layer, index, frame, poseMap) }))
    .filter(entry => entry.state && entry.state.visible)
    .sort((a, b) => b.state.zOrder - a.state.zOrder);
  if (!entries.length) return;
  drawCtx.save();
  drawCtx.globalAlpha = opacity;
  if (projectState.onionSkin && projectState.onionSkin.tint && 'filter' in drawCtx) {
    drawCtx.filter = direction < 0
      ? 'sepia(1) saturate(3.2) hue-rotate(145deg)'
      : 'sepia(1) saturate(3.2) hue-rotate(300deg)';
  }
  const renderedEmitters = new Set();
  entries.forEach(entry => {
    const uiGroup = typeof getLayerUiGroup === 'function' ? getLayerUiGroup(entry.layer) : (entry.layer.uiGroup || '').trim();
    if (uiGroup && typeof ParticleManager !== 'undefined' && ParticleManager.isEmitter(uiGroup)) {
       if (!renderedEmitters.has(uiGroup)) {
           renderedEmitters.add(uiGroup);
           const children = psdLayers.filter(l => (typeof getLayerUiGroup === 'function' ? getLayerUiGroup(l) : (l.uiGroup || '').trim()) === uiGroup);
           // Calculate elapsed time from frame for deterministic view in Onion/Ghosts
           const fps = animation.frameRate || 24;
           ParticleManager.renderEmitter(drawCtx, uiGroup, children, frame / fps);
       }
       return;
    }
    drawLayerWithState(drawCtx, entry.layer, entry.state);
  });
  drawCtx.restore();
}

function drawOnionSkins(drawCtx) {
  const onion = typeof ensureOnionSkin === 'function' ? ensureOnionSkin() : null;
  const animation = getCurrentAnimation();
  if (!onion || !onion.enabled || projectState.editorMode !== 'animation' || !animation) return;
  const currentFrame = projectState.playback.currentFrame;
  const step = Math.max(1, onion.step || 1);
  const baseOpacity = clamp(onion.opacity || 0.28, 0.02, 0.85);

  for (let i = onion.before; i >= 1; i--) {
    const frame = currentFrame - i * step;
    if (frame < 0) continue;
    drawAnimationFrameGhost(drawCtx, animation, frame, baseOpacity * (1 - (i - 1) / Math.max(1, onion.before + 1)), -1);
  }
  for (let i = 1; i <= onion.after; i++) {
    const frame = currentFrame + i * step;
    if (frame > animation.duration) continue;
    drawAnimationFrameGhost(drawCtx, animation, frame, baseOpacity * (1 - (i - 1) / Math.max(1, onion.after + 1)), 1);
  }
}

function applyAnimationAtCurrentFrame(options = {}) {
  const profiler = window.FrogmakerModules && window.FrogmakerModules.ui && window.FrogmakerModules.ui.profiler;
  const {
    skipRender = false,
    skipUi = false,
    suppressSecondaryMotion = false,
    deltaTimeOverride = null
  } = options;
  const run = () => {
    const animation = getCurrentAnimation();
    if (!animation) {
      restorePose();
      if (!skipUi) {
        renderTimeline();
        updateProps();
      }
      return;
    }

    const frame = projectState.playback.currentFrame;
    if (typeof syncVideoReferenceToFrame === 'function') syncVideoReferenceToFrame();
    const poseMap = buildBonePoseMap(animation, frame);
    bones.forEach(bone => {
      const pose = poseMap[bone.id];
      if (!pose) return;
      bone.x = pose.x;
      bone.y = pose.y;
      bone.ex = pose.ex;
      bone.ey = pose.ey;
    });
    if (typeof applyIkConstraints === 'function') applyIkConstraints();
    if (typeof applyDrivenConstraints === 'function') applyDrivenConstraints('preLayer');

    syncBoundLayerTransforms(index => {
      const bind = projectState.bindPose.slots[index];
      const slotValue = getSlotAnimationValue(animation, index, frame);
      return bind && slotValue ? slotValue : null;
    }, { includeUnbound: true });
    psdLayers.forEach((layer, index) => {
      const bind = projectState.bindPose.slots[index];
      const slotValue = getSlotAnimationValue(animation, index, frame);
      if (!bind || !slotValue) return;
      if (layer.mesh && layer.mesh.bindVertices) {
        layer.mesh.animatedVertices = getSlotMeshVertices(animation, index, frame);
      }
    });
    if (typeof applyDrivenConstraints === 'function') applyDrivenConstraints('postLayer');
    if (!suppressSecondaryMotion && typeof applySecondaryMotion === 'function') {
      const deltaTime = Number.isFinite(deltaTimeOverride) ? deltaTimeOverride : (1 / Math.max(1, animation.frameRate || 24));
      applySecondaryMotion(deltaTime, 'animation');
    }
    applySwitchTimelinesAtFrame(animation, frame);
    applyCameraAtFrame(animation, frame);

    if (!skipUi) {
      if (projectState.playback.isPlaying) {
        updateAnimationPlaybackUi();
      } else {
        updateAnimationControls();
        renderTimeline();
        updateProps();
      }
    }
    if (!skipRender) render();
    if (!skipUi && typeof renderMotionWindow === 'function') renderMotionWindow();
  };
  if (profiler && profiler.isEnabled()) {
    return profiler.measureAction('applyAnimationAtCurrentFrame', async () => run(), `bones=${bones.length} layers=${psdLayers.length}`);
  }
  return run();
}

function setCurrentFrame(frame, options = {}) {
  const { preserveSecondaryMotion = false } = options;
  const animation = getCurrentAnimation();
  const maxFrame = animation ? animation.duration : 48;
  projectState.playback.currentFrame = clamp(frame, 0, maxFrame);
  document.getElementById('frame-slider').value = projectState.playback.currentFrame;
  if (typeof syncVideoReferenceToFrame === 'function') syncVideoReferenceToFrame();
  if (!preserveSecondaryMotion && typeof resetSecondaryMotionState === 'function') resetSecondaryMotionState('set-current-frame');
  if (projectState.editorMode === 'animation' && animation) applyAnimationAtCurrentFrame({ suppressSecondaryMotion: false });
  else render();
  if (typeof renderMotionWindow === 'function') renderMotionWindow();
  updateAnimationControls();
}

function getSafeExportName(name) {
  return (name || 'animacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'animacion';
}

function setLoadingOverlayMessage(message) {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('boot-visible');
  overlay.textContent = message || 'Procesando...';
  overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('boot-visible');
  overlay.style.display = 'none';
  overlay.textContent = 'Procesando...';
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

const AI_ANIMATION_SYSTEM_PROMPT = `Eres un experto en animacion 2D. Recibiras un JSON con una animacion de personaje.
Cada track contiene keyframes con {frame, value, interpolation}.
'frame' es el numero de frame (entero). 'value' es la posicion o rotacion en ese frame.
'interpolation' puede ser 'linear', 'easeInOut' o 'step'.
Puedes anadir, eliminar o modificar keyframes.
Puedes cambiar interpolaciones para suavizar o dar enfasis.
No cambies los nombres de bones ni layers.
No cambies la estructura del JSON.
Devuelve unicamente el JSON completo modificado, sin explicaciones adicionales.
Las rotaciones estan en grados.
tracks.switches contiene cambios discretos de variantes visuales como boca u ojos: value es el switchKey activo y debe usar interpolation 'step'.
tracks.camera controla el encuadre de export con x, y y zoom.
Principios que puedes aplicar segun las instrucciones del usuario:
- Ease in/out: cambiar interpolacion a 'easeInOut' en movimientos que deben sentirse organicos
- Anticipacion: anadir un keyframe previo con movimiento opuesto pequeno antes de una accion
- Follow-through: anadir keyframes despues del punto de llegada que se sobrepasen levemente
- Overlapping: desfasar ligeramente los keyframes entre bones conectados (brazo vs antebrazo)
- Secondary motion: pequenas oscilaciones en bones secundarios despues del movimiento principal`;

const AI_ANIMATION_INTERPOLATIONS = ['linear', 'easeInOut', 'step'];

function cloneAITrack(track) {
  return (track || []).map(key => ({
    frame: Math.round(Number(key.frame)),
    value: Number(key.value),
    interpolation: AI_ANIMATION_INTERPOLATIONS.includes(key.interpolation) ? key.interpolation : 'linear'
  })).filter(key => Number.isFinite(key.frame) && Number.isFinite(key.value))
    .sort((a, b) => a.frame - b.frame);
}

function getAIInstructionsValue() {
  const toolbarInput = document.getElementById('ai-animation-instructions-toolbar');
  if (toolbarInput && toolbarInput.value.trim()) return toolbarInput.value.trim();
  const input = document.getElementById('ai-animation-instructions');
  return input ? input.value.trim() : '';
}

function getSafeAITrackName(name, fallback, usedNames) {
  const base = (name || fallback || 'unnamed').toString().trim() || 'unnamed';
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) candidate = `${base}_${suffix++}`;
  usedNames.add(candidate);
  return candidate;
}

function getAIAnimationHints(animation) {
  const frames = new Set();
  const bonesAnimated = [];
  let totalKeyframes = 0;
  Object.entries(animation.boneTimelines || {}).forEach(([boneId, timeline]) => {
    const bone = getBoneById(+boneId);
    let count = 0;
    ['x', 'y', 'rotation'].forEach(prop => {
      (timeline[prop] || []).forEach(key => {
        frames.add(key.frame);
        count++;
        totalKeyframes++;
      });
    });
    if (count && bone) bonesAnimated.push(bone.name);
  });
  Object.values(animation.slotTimelines || {}).forEach(timeline => {
    ['x', 'y', 'rotation', 'visible', 'zOrder'].forEach(prop => {
      (timeline[prop] || []).forEach(key => {
        frames.add(key.frame);
        totalKeyframes++;
      });
    });
  });
  Object.values(animation.switchTimelines || {}).forEach(timeline => {
    (timeline || []).forEach(key => {
      frames.add(key.frame);
      totalKeyframes++;
    });
  });
  const cameraTimeline = animation.cameraTimeline || {};
  ['x', 'y', 'zoom'].forEach(prop => {
    (cameraTimeline[prop] || []).forEach(key => {
      frames.add(key.frame);
      totalKeyframes++;
    });
  });
  return {
    totalKeyframes,
    bonesAnimated,
    framesWithActivity: [...frames].sort(sortNumeric),
    suggestedImprovements: []
  };
}

function exportAnimationForAI(animation = getCurrentAnimation(), options = {}) {
  if (!animation) {
    alert('Crea o selecciona una animacion antes de exportar para IA.');
    return null;
  }
  const boneNameById = {};
  const usedBoneNames = new Set();
  bones.forEach(bone => {
    boneNameById[bone.id] = getSafeAITrackName(bone.name, `bone_${bone.id}`, usedBoneNames);
  });
  const layerNameByIndex = {};
  const usedLayerNames = new Set();
  psdLayers.forEach((layer, index) => {
    layerNameByIndex[index] = getSafeAITrackName(layer.name, `layer_${index}`, usedLayerNames);
  });
  const payload = {
    meta: {
      frameRate: animation.frameRate || 24,
      duration: animation.duration || 0,
      durationSeconds: Math.round(((animation.duration || 0) / Math.max(1, animation.frameRate || 24)) * 1000) / 1000,
      animationName: animation.name || 'animation',
      exportedAt: new Date().toISOString(),
      instructions: options.instructions !== undefined ? options.instructions : getAIInstructionsValue(),
      systemPrompt: AI_ANIMATION_SYSTEM_PROMPT
    },
    bones: bones.map(bone => {
      const parent = bone.parent !== null ? getBoneById(bone.parent) : null;
      return { id: bone.id, name: boneNameById[bone.id], parentName: parent ? boneNameById[parent.id] : null };
    }),
    layers: psdLayers.map((layer, index) => {
      const boneId = layer.boneId ?? layer.bone_id;
      return {
        uid: layer.uid,
        name: layerNameByIndex[index],
        boneName: boneId !== null && boneId !== undefined ? (boneNameById[boneId] || null) : null,
        switchGroup: getLayerSwitchGroup(layer) || null,
        switchKey: getLayerSwitchKey(layer) || null
      };
    }),
    tracks: { bones: {}, slots: {}, switches: {}, camera: { x: [], y: [], zoom: [] } },
    aiHints: getAIAnimationHints(animation)
  };
  Object.entries(animation.boneTimelines || {}).forEach(([boneId, timeline]) => {
    const boneName = boneNameById[boneId];
    if (!boneName) return;
    payload.tracks.bones[boneName] = {
      x: cloneAITrack(timeline.x),
      y: cloneAITrack(timeline.y),
      rotation: cloneAITrack(timeline.rotation)
    };
  });
  Object.entries(animation.slotTimelines || {}).forEach(([layerIndex, timeline]) => {
    const layerName = layerNameByIndex[layerIndex];
    if (!layerName) return;
    payload.tracks.slots[layerName] = {
      x: cloneAITrack(timeline.x),
      y: cloneAITrack(timeline.y),
      rotation: cloneAITrack(timeline.rotation),
      alpha: cloneAITrack(timeline.visible),
      zOrder: cloneAITrack(timeline.zOrder)
    };
  });
  Object.entries(animation.switchTimelines || {}).forEach(([groupName, timeline]) => {
    payload.tracks.switches[groupName] = (timeline || []).map(key => ({
      frame: key.frame,
      value: key.value,
      interpolation: 'step'
    }));
  });
  const cameraTimeline = animation.cameraTimeline || {};
  payload.tracks.camera = {
    x: cloneAITrack(cameraTimeline.x),
    y: cloneAITrack(cameraTimeline.y),
    zoom: cloneAITrack(cameraTimeline.zoom)
  };
  const json = JSON.stringify(payload, null, 2);
  const filename = `${getSafeExportName(animation.name || 'animation')}_ai.json`;
  if (options.mode === 'download') {
    downloadBlob(new Blob([json], { type: 'application/json' }), filename);
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).catch(() => downloadBlob(new Blob([json], { type: 'application/json' }), filename));
  } else {
    downloadBlob(new Blob([json], { type: 'application/json' }), filename);
  }
  return payload;
}

function validateAIAnimationJSON(data) {
  const errors = [];
  const validTrackProps = new Set(['x', 'y', 'rotation', 'alpha', 'visible', 'zOrder', 'zoom']);
  if (!data || typeof data !== 'object') {
    errors.push('El JSON raiz debe ser un objeto.');
    return { valid: false, errors };
  }
  if (!data.meta || typeof data.meta !== 'object') errors.push('Falta meta.');
  if (!Array.isArray(data.bones)) errors.push('Falta bones como array.');
  if (!data.tracks || typeof data.tracks !== 'object') errors.push('Falta tracks.');
  if (data.tracks && (!data.tracks.bones || typeof data.tracks.bones !== 'object')) errors.push('Falta tracks.bones como objeto.');

  const validateTrackGroup = (group, label) => {
    Object.entries(group || {}).forEach(([targetName, timeline]) => {
      if (!timeline || typeof timeline !== 'object') {
        errors.push(`${label}.${targetName} debe ser un objeto.`);
        return;
      }
      Object.entries(timeline).forEach(([prop, keys]) => {
        if (!validTrackProps.has(prop)) return;
        if (!Array.isArray(keys)) {
          errors.push(`${label}.${targetName}.${prop} debe ser un array.`);
          return;
        }
        keys.forEach((key, index) => {
          if (!key || typeof key !== 'object') errors.push(`${label}.${targetName}.${prop}[${index}] no es un objeto.`);
          else {
            if (!Number.isFinite(Number(key.frame))) errors.push(`${label}.${targetName}.${prop}[${index}].frame debe ser numero.`);
            if (!Number.isFinite(Number(key.value))) errors.push(`${label}.${targetName}.${prop}[${index}].value debe ser numero.`);
            if (key.interpolation !== undefined && !AI_ANIMATION_INTERPOLATIONS.includes(key.interpolation)) {
              errors.push(`${label}.${targetName}.${prop}[${index}].interpolation invalida: ${key.interpolation}.`);
            }
          }
        });
      });
    });
  };
  if (data && data.tracks) {
    validateTrackGroup(data.tracks.bones || {}, 'tracks.bones');
    validateTrackGroup(data.tracks.slots || {}, 'tracks.slots');
    if (data.tracks.camera) validateTrackGroup({ camera: data.tracks.camera }, 'tracks');
    Object.entries(data.tracks.switches || {}).forEach(([groupName, keys]) => {
      if (!Array.isArray(keys)) {
        errors.push(`tracks.switches.${groupName} debe ser un array.`);
        return;
      }
      keys.forEach((key, index) => {
        if (!key || typeof key !== 'object') errors.push(`tracks.switches.${groupName}[${index}] no es un objeto.`);
        else {
          if (!Number.isFinite(Number(key.frame))) errors.push(`tracks.switches.${groupName}[${index}].frame debe ser numero.`);
          if (typeof key.value !== 'string') errors.push(`tracks.switches.${groupName}[${index}].value debe ser texto.`);
        }
      });
    });
  }
  return { valid: errors.length === 0, errors };
}

function showAIAnimationErrors(errors) {
  const panel = document.getElementById('ai-animation-errors');
  if (!panel) {
    if (errors && errors.length) alert(errors.join('\n'));
    return;
  }
  if (!errors || !errors.length) {
    panel.style.display = 'none';
    panel.textContent = '';
    return;
  }
  panel.style.display = 'block';
  panel.textContent = errors.join('\n');
}

function normalizeAIKeyframes(keys, warnings, path) {
  const result = [];
  if (!Array.isArray(keys)) {
    warnings.push(`Saltado track invalido en ${path}: debe ser un array.`);
    return result;
  }
  (keys || []).forEach((key, index) => {
    const frame = Math.round(Number(key && key.frame));
    const value = Number(key && key.value);
    if (!Number.isFinite(frame) || !Number.isFinite(value)) {
      warnings.push(`Saltado keyframe invalido en ${path}[${index}].`);
      return;
    }
    const interpolation = AI_ANIMATION_INTERPOLATIONS.includes(key.interpolation) ? key.interpolation : 'linear';
    result.push({ frame, value, interpolation });
  });
  result.sort((a, b) => a.frame - b.frame);
  return result;
}

function normalizeAISwitchKeyframes(keys, warnings, path) {
  const result = [];
  if (!Array.isArray(keys)) {
    warnings.push(`Saltado switch invalido en ${path}: debe ser un array.`);
    return result;
  }
  keys.forEach((key, index) => {
    const frame = Math.round(Number(key && key.frame));
    const value = String((key && key.value) || '').trim();
    if (!Number.isFinite(frame) || !value) {
      warnings.push(`Saltado switch key invalido en ${path}[${index}].`);
      return;
    }
    result.push({ frame, value, interpolation: 'step' });
  });
  result.sort((a, b) => a.frame - b.frame);
  return result;
}

function importAnimationFromAI(jsonString) {
  let data;
  try {
    data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
  } catch (error) {
    showAIAnimationErrors(['No se pudo parsear el JSON: ' + error.message]);
    return false;
  }
  const validation = validateAIAnimationJSON(data);
  const fatalErrors = validation.errors.filter(error =>
    error === 'El JSON raiz debe ser un objeto.' ||
    error === 'Falta meta.' ||
    error === 'Falta tracks.' ||
    error === 'Falta tracks.bones como objeto.'
  );
  if (fatalErrors.length) {
    showAIAnimationErrors(validation.errors);
    return false;
  }
  const animation = getCurrentAnimation();
  if (!animation) {
    showAIAnimationErrors(['No hay animacion activa para importar.']);
    return false;
  }

  const warnings = [...validation.errors];
  const boneIdByName = {};
  bones.forEach(bone => { boneIdByName[bone.name] = bone.id; });
  (data.bones || []).forEach(entry => {
    if (!entry || !entry.name) return;
    const matchingBone = bones.find(bone => bone.id === entry.id) || bones.find(bone => bone.name === entry.name);
    if (matchingBone) boneIdByName[entry.name] = matchingBone.id;
  });
  const layerIndexByName = {};
  psdLayers.forEach((layer, index) => { layerIndexByName[layer.name] = index; });
  (data.layers || []).forEach(entry => {
    if (!entry || !entry.name) return;
    const matchingIndex = psdLayers.findIndex(layer => layer.uid === entry.uid || layer.name === entry.name);
    if (matchingIndex >= 0) layerIndexByName[entry.name] = matchingIndex;
  });
  ensureAnimationShape(animation);
  pushUndoSnapshot();

  Object.entries(data.tracks.bones || {}).forEach(([boneName, timeline]) => {
    const boneId = boneIdByName[boneName];
    if (boneId === undefined) {
      warnings.push(`Bone no existe en el proyecto actual: ${boneName}`);
      console.warn('AI import: bone inexistente', boneName);
      return;
    }
    const target = ensureBoneTimeline(animation, boneId);
    ['x', 'y', 'rotation'].forEach(prop => {
      if (timeline[prop] === undefined) return;
      target[prop] = normalizeAIKeyframes(timeline[prop], warnings, `tracks.bones.${boneName}.${prop}`);
    });
  });

  Object.entries((data.tracks && data.tracks.slots) || {}).forEach(([layerName, timeline]) => {
    const layerIndex = layerIndexByName[layerName];
    if (layerIndex === undefined) {
      warnings.push(`Layer no existe en el proyecto actual: ${layerName}`);
      console.warn('AI import: layer inexistente', layerName);
      return;
    }
    const target = ensureSlotTimeline(animation, layerIndex);
    ['x', 'y', 'rotation', 'zOrder'].forEach(prop => {
      if (timeline[prop] === undefined) return;
      target[prop] = normalizeAIKeyframes(timeline[prop], warnings, `tracks.slots.${layerName}.${prop}`);
    });
    if (timeline.alpha !== undefined) target.visible = normalizeAIKeyframes(timeline.alpha, warnings, `tracks.slots.${layerName}.alpha`);
    if (timeline.visible !== undefined) target.visible = normalizeAIKeyframes(timeline.visible, warnings, `tracks.slots.${layerName}.visible`);
  });

  Object.entries((data.tracks && data.tracks.switches) || {}).forEach(([groupName, timeline]) => {
    const groupExists = Object.keys(getSwitchGroups()).includes(groupName);
    if (!groupExists) {
      warnings.push(`Switch group no existe en el proyecto actual: ${groupName}`);
      console.warn('AI import: switch group inexistente', groupName);
      return;
    }
    animation.switchTimelines[groupName] = normalizeAISwitchKeyframes(timeline, warnings, `tracks.switches.${groupName}`);
  });

  if (data.tracks && data.tracks.camera) {
    const target = ensureCameraTimeline(animation);
    ['x', 'y', 'zoom'].forEach(prop => {
      if (data.tracks.camera[prop] === undefined) return;
      target[prop] = normalizeAIKeyframes(data.tracks.camera[prop], warnings, `tracks.camera.${prop}`);
    });
  }

  showAIAnimationErrors(warnings);
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
  renderTimeline();
  updateProps();
  render();
  return true;
}

async function loadAIAnimationFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    importAnimationFromAI(text);
  } finally {
    event.target.value = '';
  }
}

function toggleVideoReference(enabled) {
  if (!projectState.videoReference) return;
  projectState.videoReference.enabled = !!enabled && !!projectState.videoReference.dataUrl;
  if (enabled && !projectState.videoReference.dataUrl) {
    const toggle = document.getElementById('video-ref-toggle');
    if (toggle) toggle.checked = false;
    alert('Primero importa un video de referencia.');
    return;
  }
  syncVideoReferenceToFrame();
  render();
  pushUndoSnapshot();
}

function setVideoReferenceOpacity(value) {
  if (!projectState.videoReference) return;
  projectState.videoReference.opacity = clamp(Number.isFinite(value) ? value : 0.45, 0, 1);
  if (videoReferenceElement) videoReferenceElement.style.opacity = projectState.videoReference.opacity;
  if (videoReferenceFrameElement) videoReferenceFrameElement.style.opacity = projectState.videoReference.opacity;
  render();
  if (typeof renderMotionWindow === 'function') renderMotionWindow();
  pushUndoSnapshot();
}

function cloneBoneTimelinesByName(animation) {
  const timelines = {};
  bones.forEach(bone => {
    const timeline = animation.boneTimelines && animation.boneTimelines[bone.id];
    if (timeline) timelines[bone.name] = deepClone(timeline);
  });
  return timelines;
}

function serializeCurrentMotionClip() {
  const animation = getCurrentAnimation();
  if (!animation) return null;
  return {
    version: 'frogmotion-1',
    name: animation.name,
    frameRate: animation.frameRate,
    duration: animation.duration,
    loop: animation.loop,
    sourceBones: bones.map(bone => ({
      id: bone.id,
      name: bone.name,
      parentName: bone.parent !== null && getBoneById(bone.parent) ? getBoneById(bone.parent).name : null,
      color: bone.color || getColor(getBoneDepth(bone)),
      bind: deepClone(projectState.bindPose.bones[bone.id] || getCurrentBoneLocalTransform(bone))
    })),
    boneTimelinesByName: cloneBoneTimelinesByName(animation)
  };
}

function saveMotionFile() {
  const motion = serializeCurrentMotionClip();
  if (!motion) {
    alert('Selecciona una animacion antes de guardar .frogmotion.');
    return;
  }
  const blob = new Blob([JSON.stringify(motion, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${getSafeExportName(motion.name)}.frogmotion`);
}

function loadMotionBonesIntoRig(motion) {
  const sourceBones = motion.sourceBones || [];
  if (!sourceBones.length) return false;
  const byName = {};
  const created = {};
  let nextMotionId = 0;

  function createSourceBone(source) {
    if (created[source.name]) return created[source.name];
    const parentSource = source.parentName ? sourceBones.find(item => item.name === source.parentName) : null;
    const parentBone = parentSource ? createSourceBone(parentSource) : null;
    const bind = source.bind || { x: sceneWidth / 2, y: sceneHeight / 2, rotation: -90, length: 80 };
    let startX = bind.x;
    let startY = bind.y;
    let rotation = bind.rotation || 0;
    if (parentBone) {
      const parentRotation = getBoneRotationDeg(parentBone);
      const start = localPointToWorld(bind.x, bind.y, parentBone.ex, parentBone.ey, parentRotation);
      startX = start.x;
      startY = start.y;
      rotation = parentRotation + (bind.rotation || 0);
    }
    const length = Math.max(1, bind.length || 80);
    const bone = {
      id: nextMotionId++,
      name: source.name,
      parent: parentBone ? parentBone.id : null,
      x: startX,
      y: startY,
      ex: startX + Math.cos(rotation * Math.PI / 180) * length,
      ey: startY + Math.sin(rotation * Math.PI / 180) * length,
      color: source.color || getColor(parentBone ? getBoneDepth(parentBone) + 1 : 0)
    };
    created[source.name] = bone;
    byName[source.name] = bone;
    return bone;
  }

  sourceBones.forEach(createSourceBone);
  bones = sourceBones.map(source => byName[source.name]).filter(Boolean);
  nextId = Math.max(1, ...bones.map(bone => bone.id)) + 1;
  selectedId = bones[0] ? bones[0].id : null;
  selectedLayerIndex = null;
  saveBindPose();
  updateTree();
  updateLayerList();
  updateProps();
  document.getElementById('st-bones').textContent = `${bones.length} bones`;
  return true;
}

function importMotionClip(motion) {
  if (!motion || motion.version !== 'frogmotion-1') {
    alert('Este archivo no parece ser un .frogmotion valido.');
    return;
  }
  const existingNames = new Set(bones.map(bone => bone.name));
  const motionNames = Object.keys(motion.boneTimelinesByName || {});
  let canMap = motionNames.some(name => existingNames.has(name));
  if (!canMap && (motion.sourceBones || []).length) {
    const shouldLoadRig = bones.length <= 1 || confirm('No hay bones con los mismos nombres. Quieres cargar tambien la armadura del .frogmotion?');
    if (shouldLoadRig) {
      canMap = loadMotionBonesIntoRig(motion);
    }
  }
  const animation = ensureAnimationShape({
    id: 'anim_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: motion.name ? `${motion.name} import` : `Motion ${projectState.animations.length + 1}`,
    duration: Math.max(1, Math.round(motion.duration || 48)),
    loop: motion.loop !== false,
    frameRate: Math.max(1, Math.round(motion.frameRate || 24)),
    boneTimelines: {},
    slotTimelines: {}
  });
  let mappedCount = 0;
  const motionTimelines = motion.boneTimelinesByName || {};
  Object.keys(motionTimelines).forEach(sourceName => {
    const targetBone = bones.find(bone => bone.name === sourceName);
    if (!targetBone) return;
    animation.boneTimelines[targetBone.id] = deepClone(motionTimelines[sourceName]);
    mappedCount++;
  });
  if (mappedCount === 0) {
    if (canMap && (motion.sourceBones || []).length) {
      (motion.sourceBones || []).forEach(source => {
        const targetBone = bones.find(bone => bone.name === source.name);
        if (targetBone && !animation.boneTimelines[targetBone.id]) {
          animation.boneTimelines[targetBone.id] = { x: [], y: [], rotation: [] };
          mappedCount++;
        }
      });
    }
  }
  if (mappedCount === 0) {
    alert('No se encontraron bones con nombres compatibles para cargar este motion.');
    return;
  }
  projectState.animations.push(animation);
  selectAnimation(animation.id);
  pushUndoSnapshot();
  alert(`Motion cargado: ${mappedCount} bones mapeados por nombre.`);
}

async function loadMotionFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    importMotionClip(JSON.parse(text));
  } catch (error) {
    alert('No se pudo cargar el .frogmotion: ' + error);
  } finally {
    event.target.value = '';
  }
}

function getMediaExportBackground() {
  const select = document.getElementById('media-background-select');
  const value = select ? select.value : 'transparent';
  if (value === 'white') return { value, color: '#ffffff' };
  if (value === 'black') return { value, color: '#000000' };
  return { value: 'transparent', color: null };
}

function drawCurrentSceneToContext(drawCtx, width, height, scale = 1, background = null) {
  applyMeshControllers();
  const camera = typeof ensureProjectCamera === 'function' ? ensureProjectCamera() : null;
  const useCamera = !!(camera && camera.enabled);
  drawCtx.clearRect(0, 0, width, height);
  if (background && background.color) {
    drawCtx.save();
    drawCtx.fillStyle = background.color;
    drawCtx.fillRect(0, 0, width, height);
    drawCtx.restore();
  }
  drawCtx.save();
  if (useCamera) {
    drawCtx.translate(width / 2, height / 2);
    drawCtx.scale((camera.zoom || 1) * scale, (camera.zoom || 1) * scale);
    drawCtx.translate(-camera.x, -camera.y);
  } else {
    drawCtx.scale(scale, scale);
  }

  const currentAnimation = getCurrentAnimation();
  const currentFrame = projectState.playback.currentFrame;

  getRenderableLayers().forEach(({ layer }) => {
    if (!layer.img_element) return;
    if (typeof getLayerRenderVisible === 'function') {
      if (!getLayerRenderVisible(layer, currentAnimation, currentFrame)) return;
    } else {
      const visible = layer.runtime_visible !== undefined ? layer.runtime_visible : layer.visible !== false;
      if (!visible) return;
    }

    drawCtx.save();
    drawCtx.translate(layer.center_x, layer.center_y);
    drawCtx.rotate(layer.rotation || 0);
    if (layer.mesh && layer.mesh.indices && layer.mesh.uvs) {
      const vertices = typeof getRenderMeshVertices === 'function'
        ? getRenderMeshVertices(layer)
        : (layer.mesh.runtimeVertices || layer.mesh.animatedVertices || layer.mesh.bindVertices || layer.mesh.vertices);
      for (let i = 0; i < layer.mesh.indices.length; i += 3) {
        const i0 = layer.mesh.indices[i];
        const i1 = layer.mesh.indices[i + 1];
        const i2 = layer.mesh.indices[i + 2];
        if (!vertices[i0] || !vertices[i1] || !vertices[i2] || !layer.mesh.uvs[i0] || !layer.mesh.uvs[i1] || !layer.mesh.uvs[i2]) continue;
        drawTexturedTriangle(
          drawCtx,
          layer.img_element,
          meshPointToLayerLocal(layer, vertices[i0]),
          meshPointToLayerLocal(layer, vertices[i1]),
          meshPointToLayerLocal(layer, vertices[i2]),
          layer.mesh.uvs[i0],
          layer.mesh.uvs[i1],
          layer.mesh.uvs[i2]
        );
      }
    } else {
      drawCtx.drawImage(layer.img_element, -layer.width / 2, -layer.height / 2);
    }
    drawCtx.restore();
  });
  drawCtx.restore();
}

function renderCurrentAnimationFrameDataUrl(scale = 1, background = null) {
  const camera = typeof ensureProjectCamera === 'function' ? ensureProjectCamera() : null;
  const useCamera = !!(camera && camera.enabled);
  const width = Math.max(1, Math.round((useCamera ? camera.width : sceneWidth) * scale));
  const height = Math.max(1, Math.round((useCamera ? camera.height : sceneHeight) * scale));
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext('2d');
  drawCurrentSceneToContext(exportCtx, width, height, scale, background);
  return exportCanvas.toDataURL('image/png');
}

async function captureAnimationFramesForExport(options = {}) {
  const animation = getCurrentAnimation();
  if (!animation) {
    alert('Crea o selecciona una animacion antes de exportar.');
    return null;
  }
  if (psdLayers.length === 0) {
    alert('No hay capas para exportar.');
    return null;
  }

  const previousMode = projectState.editorMode;
  const previousFrame = projectState.playback.currentFrame;
  const wasPlaying = projectState.playback.isPlaying;
  const frames = [];
  const background = options.background || getMediaExportBackground();
  const exportScale = options.scale || 1;
  const stateBackup = typeof ensureSecondaryMotionState === 'function' && ensureSecondaryMotionState().enabled && ensureSecondaryMotionState().autoBakeOnExport
    ? JSON.parse(JSON.stringify(animation))
    : null;

  projectState.playback.isPlaying = false;
  const playButton = document.getElementById('play-btn');
  if (playButton) playButton.textContent = 'Play';
  if (stateBackup && typeof bakeSecondaryMotionToAnimation === 'function') {
    bakeSecondaryMotionToAnimation(animation.id, { temporary: true });
  }

  for (let frame = 0; frame <= animation.duration; frame++) {
    setLoadingOverlayMessage(`Renderizando frame ${frame}/${animation.duration}...`);
    projectState.editorMode = 'animation';
    projectState.playback.currentFrame = frame;
    applyAnimationAtCurrentFrame({ skipUi: true, suppressSecondaryMotion: true });

    // Garantizar que los controladores de malla y otros estados globales se apliquen
    if (typeof applyMeshControllers === 'function') applyMeshControllers();
    if (typeof applyIkConstraints === 'function') applyIkConstraints();

    frames.push({ frame, data_url: renderCurrentAnimationFrameDataUrl(exportScale, background) });
    if (frame % 6 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }

  if (stateBackup) {
    const index = projectState.animations.findIndex(item => item.id === animation.id);
    if (index !== -1) projectState.animations[index] = stateBackup;
    if (typeof ensureAnimationShape === 'function') ensureAnimationShape(projectState.animations[index]);
    if (typeof resetSecondaryMotionState === 'function') resetSecondaryMotionState('restore-export-animation');
  }

  projectState.editorMode = previousMode;
  projectState.playback.isPlaying = wasPlaying && previousMode === 'animation';
  setCurrentFrame(previousFrame);
  if (playButton) playButton.textContent = projectState.playback.isPlaying ? 'Pause' : 'Play';

  return { animation, frames, background };
}

async function exportAnimationMedia(format, options = {}) {
  const captured = await captureAnimationFramesForExport(options);
  if (!captured) return;

  const { animation, frames, background } = captured;
  const endpoint = format === 'gif' ? '/export-animation-gif' : '/export-animation-png-sequence';
  const filename = `${getSafeExportName(animation.name)}.${format === 'gif' ? 'gif' : 'zip'}`;
  const payload = {
    name: getSafeExportName(animation.name),
    fps: options.fps || Math.max(1, Math.round(animation.frameRate || 24)),
    background: background.value,
    frames
  };

  try {
    setLoadingOverlayMessage(format === 'gif' ? 'Creando GIF transparente...' : 'Creando ZIP de PNGs...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    downloadBlob(blob, filename);
  } catch (error) {
    alert('Error al exportar animacion: ' + error);
  } finally {
    hideLoadingOverlay();
  }
}


function bakeSecondaryMotionToAnimation(animationId, options = {}) {
  const { temporary = false } = options;
  const animation = projectState.animations.find(item => item.id === animationId);
  if (!animation || typeof ensureSecondaryMotionState !== 'function') return false;
  const state = ensureSecondaryMotionState();
  const chains = state.chains.filter(chain => shouldApplySecondaryMotionChain(chain, 'animation'));
  if (!chains.length) return false;
  const previousMode = projectState.editorMode;
  const previousFrame = projectState.playback.currentFrame;
  const wasPlaying = projectState.playback.isPlaying;
  projectState.playback.isPlaying = false;
  projectState.editorMode = 'animation';
  if (typeof resetSecondaryMotionState === 'function') resetSecondaryMotionState('bake-secondary-motion');
  chains.forEach(chain => (chain.boneIds || []).forEach(boneId => ensureBoneTimeline(animation, boneId)));
  for (let frame = 0; frame <= animation.duration; frame++) {
    projectState.playback.currentFrame = frame;
    applyAnimationAtCurrentFrame({
      skipRender: true,
      skipUi: true,
      suppressSecondaryMotion: false,
      deltaTimeOverride: 1 / Math.max(1, animation.frameRate || 24)
    });
    chains.forEach(chain => {
      (chain.boneIds || []).forEach(boneId => {
        const bone = getBoneById(boneId);
        if (!bone) return;
        const timeline = ensureBoneTimeline(animation, bone.id);
        upsertFrame(timeline.rotation, frame, getCurrentBoneLocalTransform(bone).rotation, 'linear');
      });
    });
  }
  if (typeof resetSecondaryMotionState === 'function') resetSecondaryMotionState('finish-bake-secondary-motion');
  projectState.editorMode = previousMode;
  projectState.playback.isPlaying = wasPlaying && previousMode === 'animation';
  setCurrentFrame(previousFrame);
  if (!temporary) {
    renderTimeline();
    updateProps();
    pushUndoSnapshot();
  }
  return true;
}

function bakeSelectedSecondaryMotionToAnimation() {
  const animation = getCurrentAnimation();
  const chain = typeof getSecondaryMotionChainForBoneId === 'function' ? getSecondaryMotionChainForBoneId(selectedId) : null;
  if (!animation || !chain) {
    alert('Selecciona un bone con fisica secundaria y una animacion activa.');
    return;
  }
  bakeSecondaryMotionToAnimation(animation.id, { temporary: false });
}

function toggleAutoKey(enabled) {
  projectState.playback.autoKey = enabled;
}

function stepFrame(delta) {
  setCurrentFrame(projectState.playback.currentFrame + delta);
}

function togglePlayback() {
  const animation = getCurrentAnimation();
  if (!animation) return;
  projectState.playback.isPlaying = !projectState.playback.isPlaying;
  projectState.playback.lastTickMs = 0;
  if (!projectState.playback.isPlaying && typeof resetSecondaryMotionState === 'function') resetSecondaryMotionState('toggle-playback-stop');
  document.getElementById('play-btn').textContent = projectState.playback.isPlaying ? 'Pause' : 'Play';
}

function stopPlayback() {
  projectState.playback.isPlaying = false;
  projectState.playback.lastTickMs = 0;
  if (typeof resetSecondaryMotionState === 'function') resetSecondaryMotionState('stop-playback');
  document.getElementById('play-btn').textContent = 'Play';
  setCurrentFrame(0);
}

function playbackLoop(ts) {
  if (projectState.playback.isPlaying && projectState.editorMode === 'animation') {
    const animation = getCurrentAnimation();
    if (animation) {
      if (!projectState.playback.lastTickMs) projectState.playback.lastTickMs = ts;
      const deltaMs = ts - projectState.playback.lastTickMs;
      const frameAdvance = deltaMs / (1000 / animation.frameRate);
      if (frameAdvance >= 1) {
        let nextFrame = projectState.playback.currentFrame + Math.floor(frameAdvance);
        projectState.playback.lastTickMs = ts;
        if (nextFrame > animation.duration) {
          if (animation.loop) nextFrame = nextFrame % (animation.duration + 1);
          else {
            nextFrame = animation.duration;
            projectState.playback.isPlaying = false;
            document.getElementById('play-btn').textContent = 'Play';
          }
        }
        setCurrentFrame(nextFrame, { preserveSecondaryMotion: true });
      } else if (projectState.particleEmitters && Object.keys(projectState.particleEmitters).length > 0) {
        // No frame advance yet, but particles need continuous redraw
        if (typeof render === 'function') render();
      }
    }
  }
  requestAnimationFrame(playbackLoop);
}

function captureBoneToAnimationById(boneId, frame = projectState.playback.currentFrame, interpolation = 'linear', options = {}) {
  const { skipUndo = false } = options;
  const animation = getCurrentAnimation();
  const bone = getBoneById(boneId);
  if (!animation || !bone) return false;
  const local = getCurrentBoneLocalTransform(bone);
  const timeline = ensureBoneTimeline(animation, bone.id);
  upsertFrame(timeline.x, frame, local.x, interpolation);
  upsertFrame(timeline.y, frame, local.y, interpolation);
  upsertFrame(timeline.rotation, frame, local.rotation, interpolation);
  renderTimeline();
  updateProps();
  if (!skipUndo) pushUndoSnapshot();
  return true;
}

function captureSelectedBoneToAnimation(frame = projectState.playback.currentFrame, interpolation = 'linear') {
  captureBoneToAnimationById(selectedId, frame, interpolation);
}

function captureIkResolvedBonesForTargetBone(targetBoneId, frame = projectState.playback.currentFrame, interpolation = 'linear') {
  if (typeof getIkConstraintsForTargetBone !== 'function') return false;
  const constraints = getIkConstraintsForTargetBone(targetBoneId);
  if (!constraints.length) return false;
  let changed = false;
  constraints.forEach(constraint => {
    [constraint.rootBoneId, constraint.midBoneId, constraint.endBoneId].forEach(boneId => {
      changed = captureBoneToAnimationById(boneId, frame, interpolation, { skipUndo: true }) || changed;
    });
  });
  if (changed) pushUndoSnapshot();
  return changed;
}

function captureSelectedLayerToAnimation(frame = projectState.playback.currentFrame, interpolation = 'step') {
  const animation = getCurrentAnimation();
  if (!animation || selectedLayerIndex === null) return;
  const timeline = ensureSlotTimeline(animation, selectedLayerIndex);
  const local = getCurrentLayerLocalTransform(selectedLayerIndex);
  upsertFrame(timeline.x, frame, local.x, 'linear');
  upsertFrame(timeline.y, frame, local.y, 'linear');
  upsertFrame(timeline.rotation, frame, local.rotation, 'linear');
  upsertFrame(timeline.visible, frame, local.visible ? 1 : 0, 'step');
  upsertFrame(timeline.zOrder, frame, local.zOrder, interpolation);
  renderTimeline();
  updateProps();
  pushUndoSnapshot();
}

function captureSelectedLayerMeshToAnimation(frame = projectState.playback.currentFrame, interpolation = 'linear') {
  const animation = getCurrentAnimation();
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!animation || !layer || !layer.mesh) return;
  const timeline = ensureSlotTimeline(animation, selectedLayerIndex);
  const sourceVertices = layer.mesh.animatedVertices || layer.mesh.bindVertices;
  upsertMeshFrame(timeline.mesh, frame, sourceVertices, interpolation);
  renderTimeline();
  updateProps();
  pushUndoSnapshot();
}

function getSwitchGroupKeys(groupName) {
  const group = String(groupName || '').trim();
  if (!group) return [];
  const keys = [];
  psdLayers.forEach(layer => {
    const layerGroup = typeof getLayerSwitchGroup === 'function' ? getLayerSwitchGroup(layer) : String(layer.switchGroup || '').trim();
    const key = typeof getLayerSwitchKey === 'function' ? getLayerSwitchKey(layer) : String(layer.switchKey || '').trim();
    if (layerGroup === group && key && !keys.includes(key)) keys.push(key);
  });
  return keys;
}

function captureSwitchKey(groupName, value = null, frame = projectState.playback.currentFrame) {
  const animation = getCurrentAnimation();
  const group = String(groupName || '').trim();
  if (!animation || !group) return;
  const keys = getSwitchGroupKeys(group);
  const key = value !== null && value !== undefined
    ? String(value)
    : getSwitchTrackValue(animation, group, frame);
  const finalKey = keys.includes(key) ? key : (keys[0] || key);
  if (!finalKey) return;
  const timeline = ensureSwitchTimeline(animation, group);
  upsertFrame(timeline, frame, finalKey, 'step');
  setTimelineSelection('switch', group, [frame]);
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
}

function getLipsyncGroupNames() {
  if (typeof getSwitchGroups !== 'function') return [];
  const groups = Object.keys(getSwitchGroups());
  const rankGroup = name => {
    const lower = String(name || '').toLowerCase();
    if (/^(mouth|boca|labio|labios|lip|lips)$/.test(lower)) return 0;
    if (/mouth|boca|lab|lip/.test(lower)) return 1;
    return 2;
  };
  return groups.sort((a, b) => rankGroup(a) - rankGroup(b) || a.localeCompare(b));
}

function resolveLipsyncGroup() {
  const state = typeof ensureLipsyncState === 'function'
    ? ensureLipsyncState()
    : (projectState.lipsync || (projectState.lipsync = { group: '', autoAdvance: true, advanceFrames: 2 }));
  const groups = getLipsyncGroupNames();
  if (groups.includes(state.group)) return state.group;
  state.group = groups[0] || '';
  return state.group;
}

function setLipsyncGroup(groupName) {
  const state = typeof ensureLipsyncState === 'function' ? ensureLipsyncState() : projectState.lipsync;
  state.group = String(groupName || '').trim();
  renderLipsyncPanel();
  updateProps();
  pushUndoSnapshot();
}

function setLipsyncAutoAdvance(enabled) {
  const state = typeof ensureLipsyncState === 'function' ? ensureLipsyncState() : projectState.lipsync;
  state.autoAdvance = !!enabled;
  renderLipsyncPanel();
  pushUndoSnapshot();
}

function setLipsyncAdvanceFrames(value) {
  const state = typeof ensureLipsyncState === 'function' ? ensureLipsyncState() : projectState.lipsync;
  state.advanceFrames = clamp(Math.round(+value || 2), 1, 12);
  renderLipsyncPanel();
  pushUndoSnapshot();
}

function getLipsyncKeyLabel(key) {
  const lower = String(key || '').toLowerCase();
  const labels = {
    closed: 'Cerrada',
    close: 'Cerrada',
    rest: 'Rest',
    neutral: 'Neutral',
    a: 'A',
    e: 'E',
    i: 'I',
    o: 'O',
    u: 'U',
    m: 'M/B/P',
    b: 'M/B/P',
    p: 'M/B/P',
    f: 'F/V',
    v: 'F/V',
    l: 'L',
    smile: 'Smile'
  };
  return labels[lower] || String(key || '');
}

function sortLipsyncKeys(keys) {
  const order = ['closed', 'close', 'rest', 'neutral', 'm', 'b', 'p', 'a', 'e', 'i', 'o', 'u', 'f', 'v', 'l', 'smile'];
  const rank = key => {
    const index = order.indexOf(String(key || '').toLowerCase());
    return index >= 0 ? index : order.length;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b)));
}

function insertLipsyncKey(key) {
  const animation = getCurrentAnimation();
  const group = resolveLipsyncGroup();
  if (!animation || !group || key === undefined || key === null) return;
  captureSwitchKey(group, key, projectState.playback.currentFrame);
  const state = typeof ensureLipsyncState === 'function' ? ensureLipsyncState() : projectState.lipsync;
  if (state && state.autoAdvance) {
    setCurrentFrame(projectState.playback.currentFrame + state.advanceFrames);
  }
  renderLipsyncPanel();
}

function nudgeLipsyncFrame(delta) {
  setCurrentFrame(projectState.playback.currentFrame + delta);
  renderLipsyncPanel();
}

function renderLipsyncPanel() {
  const panel = document.getElementById('lipsync-panel');
  if (!panel) return;
  if (projectState.editorMode !== 'animation') {
    panel.innerHTML = '';
    return;
  }
  const animation = getCurrentAnimation();
  const groups = getLipsyncGroupNames();
  if (!groups.length) {
    panel.innerHTML = '<span class="lipsync-title">Lipsync</span><span class="lipsync-empty">Crea un Switch Group en las capas de boca, por ejemplo: mouth, closed, A, E, O, M.</span>';
    return;
  }
  const state = typeof ensureLipsyncState === 'function' ? ensureLipsyncState() : projectState.lipsync;
  const group = resolveLipsyncGroup();
  const keys = sortLipsyncKeys(getSwitchGroupKeys(group));
  const activeKey = animation && group ? getSwitchTrackValue(animation, group, projectState.playback.currentFrame) : '';
  const frame = projectState.playback.currentFrame;
  const groupOptions = groups.map(name => `<option value="${escapeAttr(name)}" ${name === group ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('');
  const keyButtons = keys.map(key => `
    <button class="lipsync-btn ${key === activeKey ? 'active' : ''}" data-key="${escapeAttr(key)}" onclick="insertLipsyncKey(this.dataset.key)">
      ${escapeHTML(getLipsyncKeyLabel(key))}
      <small>${escapeHTML(key)}</small>
    </button>
  `).join('');

  panel.innerHTML = `
    <span class="lipsync-title">Lipsync</span>
    <select class="lipsync-group-select" onchange="setLipsyncGroup(this.value)">${groupOptions}</select>
    <button class="lipsync-mini-btn" onclick="nudgeLipsyncFrame(-1)">&lt;</button>
    <span class="lipsync-frame">Frame ${frame}</span>
    <button class="lipsync-mini-btn" onclick="nudgeLipsyncFrame(1)">&gt;</button>
    ${keyButtons || '<span class="lipsync-empty">Este grupo no tiene keys de capa.</span>'}
    <label class="check-row"><input type="checkbox" ${state.autoAdvance ? 'checked' : ''} onchange="setLipsyncAutoAdvance(this.checked)"> Auto avance</label>
    <label class="timeline-field">Paso <input type="number" min="1" max="12" value="${state.advanceFrames}" onchange="setLipsyncAdvanceFrames(+this.value)"></label>
  `;
}

function captureCameraToAnimation(frame = projectState.playback.currentFrame, interpolation = 'linear') {
  const animation = getCurrentAnimation();
  if (!animation) return;
  const camera = ensureProjectCamera();
  const timeline = ensureCameraTimeline(animation);
  upsertFrame(timeline.x, frame, camera.x, interpolation);
  upsertFrame(timeline.y, frame, camera.y, interpolation);
  upsertFrame(timeline.zoom, frame, camera.zoom, interpolation);
  setTimelineSelection('camera', 'camera', [frame]);
  renderTimeline();
  updateProps();
  pushUndoSnapshot();
}

function setCameraKeyValue(prop, value) {
  const camera = ensureProjectCamera();
  if (!['x', 'y', 'zoom'].includes(prop)) return;
  camera[prop] = prop === 'zoom' ? clamp(+value || 1, 0.05, 20) : (+value || 0);
  if (projectState.editorMode === 'animation' && getCurrentAnimation()) {
    const timeline = ensureCameraTimeline(getCurrentAnimation());
    upsertFrame(timeline[prop], projectState.playback.currentFrame, camera[prop], getSelectedKeyInterpolation());
    setTimelineSelection('camera', 'camera', [projectState.playback.currentFrame]);
    renderTimeline();
  }
  render();
  updateProps();
  pushUndoSnapshot();
}

function setSwitchKeyAtCurrentFrame(groupName, value) {
  captureSwitchKey(groupName, value, projectState.playback.currentFrame);
  renderLipsyncPanel();
}

function setSelectedLayerUiGroup(value) {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  ensureLayerIdentity(layer);
  layer.uiGroup = typeof normalizeLayerUiGroup === 'function'
    ? normalizeLayerUiGroup(value)
    : String(value || '').trim();
  saveBindPose();
  updateLayerList();
  updateProps();
  render();
  pushUndoSnapshot();
}

function setSelectedLayerSwitchGroup(value) {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  ensureLayerIdentity(layer);
  layer.switchGroup = String(value || '').trim();
  if (!layer.switchGroup) layer.switchKey = '';
  if (layer.switchGroup && !projectState.switchDefaults[layer.switchGroup] && layer.switchKey) {
    projectState.switchDefaults[layer.switchGroup] = layer.switchKey;
  }
  saveBindPose();
  updateLayerList();
  updateProps();
  renderLipsyncPanel();
  render();
  pushUndoSnapshot();
}

function setSelectedLayerSwitchKey(value) {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  ensureLayerIdentity(layer);
  layer.switchKey = String(value || '').trim();
  const group = getLayerSwitchGroup(layer);
  if (group && layer.switchKey && !projectState.switchDefaults[group]) projectState.switchDefaults[group] = layer.switchKey;
  saveBindPose();
  updateLayerList();
  updateProps();
  renderLipsyncPanel();
  render();
  pushUndoSnapshot();
}

function setSwitchDefaultKey(groupName, key) {
  const group = String(groupName || '').trim();
  if (!group) return;
  if (!projectState.switchDefaults) projectState.switchDefaults = {};
  projectState.switchDefaults[group] = String(key || '').trim();
  updateProps();
  renderLipsyncPanel();
  render();
  pushUndoSnapshot();
}

function insertKeyframeForSelection() {
  if (projectState.editorMode !== 'animation') return;
  if (projectState.timeline.selectedType === 'switch') {
    captureSwitchKey(projectState.timeline.selectedTargetId);
    return;
  }
  if (projectState.timeline.selectedType === 'camera' || activeTool === 'camera') {
    captureCameraToAnimation();
    return;
  }
  if (projectState.timeline.selectedType === 'slot' && selectedLayerIndex !== null) captureSelectedLayerToAnimation();
  else captureSelectedBoneToAnimation();
  applyAnimationAtCurrentFrame();
}

function getSelectedTimelineFrame() {
  const frames = getSelectedTimelineFrames();
  return frames.length ? frames[0] : (projectState.timeline.selectedFrame === null ? projectState.playback.currentFrame : projectState.timeline.selectedFrame);
}

function getSelectedTimelineFrames() {
  const frames = projectState.timeline.selectedFrames || [];
  if (frames.length) return [...frames].sort(sortNumeric);
  return projectState.timeline.selectedFrame === null ? [] : [projectState.timeline.selectedFrame];
}

function setTimelineSelection(type, targetId, frames) {
  const normalized = [...new Set((frames || []).map(frame => +frame).filter(frame => Number.isFinite(frame)))].sort(sortNumeric);
  projectState.timeline.selectedType = type;
  projectState.timeline.selectedTargetId = targetId;
  projectState.timeline.selectedFrames = normalized;
  projectState.timeline.selectedFrame = normalized.length ? normalized[0] : null;
}

function isTimelineFrameSelected(type, targetId, frame) {
  if (projectState.timeline.selectedType !== type || projectState.timeline.selectedTargetId !== targetId) return false;
  return getSelectedTimelineFrames().includes(frame);
}

function getTimelineForTarget(type, targetId) {
  const animation = getCurrentAnimation();
  if (!animation) return null;
  if (type === 'switch') return animation.switchTimelines ? animation.switchTimelines[targetId] : null;
  if (type === 'camera') return ensureCameraTimeline(animation);
  return type === 'slot' ? animation.slotTimelines[targetId] : animation.boneTimelines[targetId];
}

function getTimelinePropNames(type) {
  if (type === 'switch') return ['value'];
  if (type === 'camera') return ['x', 'y', 'zoom'];
  return type === 'slot' ? ['x', 'y', 'rotation', 'visible', 'zOrder', 'displayIndex', 'mesh'] : ['x', 'y', 'rotation'];
}

function copySelectedTimelineFrames() {
  const animation = getCurrentAnimation();
  const frames = getSelectedTimelineFrames();
  const type = projectState.timeline.selectedType;
  const targetId = projectState.timeline.selectedTargetId;
  if (!animation || !frames.length) return false;
  const timeline = getTimelineForTarget(type, targetId);
  if (!timeline) return false;
  const propNames = getTimelinePropNames(type);
  const payload = { type, targetId, frames: frames.map(frame => ({ frame, props: {} })), baseFrame: frames[0] };
  payload.frames.forEach(frameEntry => {
    propNames.forEach(prop => {
      const item = type === 'switch'
        ? timeline.find(entry => entry.frame === frameEntry.frame)
        : (timeline[prop] || []).find(entry => entry.frame === frameEntry.frame);
      if (!item) return;
      if (payload.type === 'switch') frameEntry.props[prop] = { value: item.value, interpolation: item.interpolation };
      else frameEntry.props[prop] = prop === 'mesh'
        ? { vertices: cloneVertices(item.vertices), interpolation: item.interpolation }
        : { value: item.value, interpolation: item.interpolation };
    });
  });
  projectState.timeline.clipboard = payload;
  updateProps();
  return true;
}

function pasteTimelineFrames() {
  const animation = getCurrentAnimation();
  const clipboard = projectState.timeline.clipboard;
  if (!animation || !clipboard || !clipboard.frames || !clipboard.frames.length) return false;
  const pasteAt = projectState.playback.currentFrame;
  const propNames = getTimelinePropNames(clipboard.type);
  const timeline = clipboard.type === 'switch'
    ? ensureSwitchTimeline(animation, clipboard.targetId)
    : clipboard.type === 'camera'
    ? ensureCameraTimeline(animation)
    : clipboard.type === 'slot'
    ? ensureSlotTimeline(animation, clipboard.targetId)
    : ensureBoneTimeline(animation, clipboard.targetId);
  const pastedFrames = [];

  clipboard.frames.forEach(frameEntry => {
    const newFrame = clamp(pasteAt + (frameEntry.frame - clipboard.baseFrame), 0, animation.duration);
    pastedFrames.push(newFrame);
    propNames.forEach(prop => {
      const entry = frameEntry.props[prop];
      if (!entry) return;
      if (clipboard.type === 'switch') upsertFrame(timeline, newFrame, entry.value, 'step');
      else if (clipboard.type === 'camera') upsertFrame(timeline[prop], newFrame, entry.value, entry.interpolation);
      else if (prop === 'mesh') upsertMeshFrame(timeline[prop], newFrame, entry.vertices, entry.interpolation);
      else upsertFrame(timeline[prop], newFrame, entry.value, entry.interpolation);
    });
  });

  setTimelineSelection(clipboard.type, clipboard.targetId, pastedFrames);
  if (clipboard.type === 'bone') {
    selectedId = clipboard.targetId;
    selectedLayerIndex = null;
  } else if (clipboard.type === 'slot') {
    selectedLayerIndex = clipboard.targetId;
  }
  applyAnimationAtCurrentFrame();
  updateTree();
  updateLayerList();
  updateProps();
  pushUndoSnapshot();
  return true;
}

function getSelectedKeyInterpolation() {
  const animation = getCurrentAnimation();
  if (!animation) return 'linear';
  const frame = getSelectedTimelineFrame();
  if (projectState.timeline.selectedType === 'switch') return 'step';
  if (projectState.timeline.selectedType === 'camera') {
    const timeline = ensureCameraTimeline(animation);
    const item = [...timeline.x, ...timeline.y, ...timeline.zoom].find(entry => entry.frame === frame);
    return item ? item.interpolation || 'linear' : 'linear';
  }
  if (projectState.timeline.selectedType === 'slot') {
    const timeline = animation.slotTimelines[projectState.timeline.selectedTargetId];
    if (!timeline) return 'step';
    const item = [...timeline.x, ...timeline.y, ...timeline.rotation, ...timeline.visible, ...timeline.zOrder, ...timeline.mesh].find(entry => entry.frame === frame);
    return item ? item.interpolation || 'step' : 'step';
  }
  const timeline = animation.boneTimelines[projectState.timeline.selectedTargetId];
  if (!timeline) return 'linear';
  const item = [...timeline.x, ...timeline.y, ...timeline.rotation].find(entry => entry.frame === frame);
  return item ? item.interpolation || 'linear' : 'linear';
}

function setSelectedKeyInterpolation(value) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  const frames = getSelectedTimelineFrames();
  if (!frames.length) return;
  if (projectState.timeline.selectedType === 'switch') {
    const timeline = animation.switchTimelines[projectState.timeline.selectedTargetId];
    if (!timeline) return;
    timeline.forEach(item => { if (frames.includes(item.frame)) item.interpolation = 'step'; });
  } else if (projectState.timeline.selectedType === 'camera') {
    const timeline = ensureCameraTimeline(animation);
    ['x', 'y', 'zoom'].forEach(prop => (timeline[prop] || []).forEach(item => { if (frames.includes(item.frame)) item.interpolation = value; }));
  } else if (projectState.timeline.selectedType === 'slot') {
    const timeline = animation.slotTimelines[projectState.timeline.selectedTargetId];
    if (!timeline) return;
    ['x', 'y', 'rotation', 'visible', 'zOrder', 'mesh'].forEach(prop => (timeline[prop] || []).forEach(item => { if (frames.includes(item.frame)) item.interpolation = value; }));
  } else {
    const timeline = animation.boneTimelines[projectState.timeline.selectedTargetId];
    if (!timeline) return;
    ['x', 'y', 'rotation'].forEach(prop => (timeline[prop] || []).forEach(item => { if (frames.includes(item.frame)) item.interpolation = value; }));
  }
  pushUndoSnapshot();
  renderTimeline();
  updateProps();
}

function deleteSelectedTimelineKey() {
  const animation = getCurrentAnimation();
  if (!animation) return;
  const frames = getSelectedTimelineFrames();
  if (!frames.length) return;
  if (projectState.timeline.selectedType === 'switch') {
    const timeline = animation.switchTimelines[projectState.timeline.selectedTargetId];
    if (!timeline) return;
    animation.switchTimelines[projectState.timeline.selectedTargetId] = timeline.filter(item => !frames.includes(item.frame));
  } else if (projectState.timeline.selectedType === 'camera') {
    const timeline = ensureCameraTimeline(animation);
    ['x', 'y', 'zoom'].forEach(prop => { timeline[prop] = timeline[prop].filter(item => !frames.includes(item.frame)); });
  } else if (projectState.timeline.selectedType === 'slot') {
    const timeline = animation.slotTimelines[projectState.timeline.selectedTargetId];
    if (!timeline) return;
    ['x', 'y', 'rotation', 'visible', 'zOrder', 'displayIndex', 'mesh'].forEach(prop => { timeline[prop] = timeline[prop].filter(item => !frames.includes(item.frame)); });
  } else {
    const timeline = animation.boneTimelines[projectState.timeline.selectedTargetId];
    if (!timeline) return;
    ['x', 'y', 'rotation'].forEach(prop => { timeline[prop] = timeline[prop].filter(item => !frames.includes(item.frame)); });
  }
  projectState.timeline.selectedFrames = [];
  projectState.timeline.selectedFrame = null;
  renderTimeline();
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
}

function moveKeyframe(type, targetId, oldFrame, newFrame, frameGroup = null) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  const selectedFrames = (frameGroup && frameGroup.length ? frameGroup : [oldFrame]).sort(sortNumeric);
  const delta = newFrame - oldFrame;
  const minAllowedDelta = -selectedFrames[0];
  const maxAllowedDelta = animation.duration - selectedFrames[selectedFrames.length - 1];
  const finalDelta = clamp(delta, minAllowedDelta, maxAllowedDelta);
  if (finalDelta === 0) return;
  if (type === 'switch') {
    const timeline = animation.switchTimelines[targetId];
    if (!timeline) return;
    const movedItems = timeline
      .filter(entry => selectedFrames.includes(entry.frame))
      .map(entry => ({ frame: clamp(entry.frame + finalDelta, 0, animation.duration), value: entry.value, interpolation: 'step' }));
    animation.switchTimelines[targetId] = timeline
      .filter(entry => !selectedFrames.includes(entry.frame) && !movedItems.some(item => item.frame === entry.frame));
    animation.switchTimelines[targetId].push(...movedItems);
    animation.switchTimelines[targetId].sort((a, b) => a.frame - b.frame);
    setTimelineSelection(type, targetId, selectedFrames.map(frame => clamp(frame + finalDelta, 0, animation.duration)));
    renderTimeline();
    applyAnimationAtCurrentFrame();
    pushUndoSnapshot();
    return;
  }
  if (type === 'camera') {
    const timeline = ensureCameraTimeline(animation);
    ['x', 'y', 'zoom'].forEach(prop => {
      const entries = timeline[prop] || [];
      const movedItems = entries
        .filter(entry => selectedFrames.includes(entry.frame))
        .map(entry => ({ frame: clamp(entry.frame + finalDelta, 0, animation.duration), value: entry.value, interpolation: entry.interpolation }));
      timeline[prop] = entries.filter(entry => !selectedFrames.includes(entry.frame) && !movedItems.some(item => item.frame === entry.frame));
      timeline[prop].push(...movedItems);
      timeline[prop].sort((a, b) => a.frame - b.frame);
    });
    setTimelineSelection(type, targetId, selectedFrames.map(frame => clamp(frame + finalDelta, 0, animation.duration)));
    renderTimeline();
    applyAnimationAtCurrentFrame();
    pushUndoSnapshot();
    return;
  }
  const propNames = type === 'slot' ? ['x', 'y', 'rotation', 'visible', 'zOrder', 'displayIndex', 'mesh'] : ['x', 'y', 'rotation'];
  const timeline = type === 'slot' ? animation.slotTimelines[targetId] : animation.boneTimelines[targetId];
  if (!timeline) return;
  propNames.forEach(prop => {
    const entries = timeline[prop] || [];
    const movedItems = entries.filter(entry => selectedFrames.includes(entry.frame)).map(entry => (
      prop === 'mesh'
        ? { frame: clamp(entry.frame + finalDelta, 0, animation.duration), vertices: cloneVertices(entry.vertices), interpolation: entry.interpolation }
        : { frame: clamp(entry.frame + finalDelta, 0, animation.duration), value: entry.value, interpolation: entry.interpolation }
    ));
    timeline[prop] = entries.filter(entry => !selectedFrames.includes(entry.frame) && !movedItems.some(item => item.frame === entry.frame));
    timeline[prop].push(...movedItems);
    timeline[prop].sort((a, b) => a.frame - b.frame);
  });
  setTimelineSelection(type, targetId, selectedFrames.map(frame => clamp(frame + finalDelta, 0, animation.duration)));
  renderTimeline();
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
}

function getTargetFrames(type, targetId) {
  const animation = getCurrentAnimation();
  if (!animation) return [];
  if (type === 'slot') {
    const timeline = animation.slotTimelines[targetId];
    if (!timeline) return [];
    return getUnionFrames([timeline.x, timeline.y, timeline.rotation, timeline.visible, timeline.zOrder, timeline.displayIndex, timeline.mesh]);
  }
  if (type === 'switch') {
    const timeline = animation.switchTimelines ? animation.switchTimelines[targetId] : null;
    return (timeline || []).map(item => item.frame).sort(sortNumeric);
  }
  if (type === 'camera') {
    const timeline = ensureCameraTimeline(animation);
    return getUnionFrames([timeline.x, timeline.y, timeline.zoom]);
  }
  const timeline = animation.boneTimelines[targetId];
  if (!timeline) return [];
  return getUnionFrames([timeline.x, timeline.y, timeline.rotation]);
}

function renderTimeline() {
  const profiler = window.FrogmakerModules && window.FrogmakerModules.ui && window.FrogmakerModules.ui.profiler;
  const run = () => {
    const animation = getCurrentAnimation();
    const empty = document.getElementById('timeline-empty');
    const grid = document.getElementById('timeline-grid');
    if (projectState.editorMode !== 'animation' || !animation) {
      empty.style.display = '';
      grid.innerHTML = '';
      renderLipsyncPanel();
      return;
    }

    empty.style.display = 'none';
    const width = (animation.duration + 1) * TIMELINE_FRAME_WIDTH + 20;
    let html = `<div class="timeline-ruler"><div class="timeline-ruler-label">Timeline</div><div class="timeline-ruler-track" style="width:${width}px">`;
    for (let frame = 0; frame <= animation.duration; frame++) html += `<span class="frame-mark" style="left:${frame * TIMELINE_FRAME_WIDTH + 8}px">${frame}</span>`;
    html += `<div class="timeline-current-line" style="left:${projectState.playback.currentFrame * TIMELINE_FRAME_WIDTH + 8}px"></div></div></div>`;

    bones.forEach(bone => {
    const frames = getTargetFrames('bone', bone.id);
    const selected = projectState.timeline.selectedType === 'bone' && projectState.timeline.selectedTargetId === bone.id;
    html += `<div class="timeline-row ${selected ? 'selected' : ''}"><div class="timeline-label"><span class="bone-dot" style="background:${bone.color || '#888'}"></span><span>${bone.name}</span><small>transform</small></div><div class="timeline-track" data-row-type="bone" data-row-id="${bone.id}" style="width:${width}px"><div class="timeline-current-line" style="left:${projectState.playback.currentFrame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
    frames.forEach(frame => {
      const keySelected = isTimelineFrameSelected('bone', bone.id, frame);
      html += `<div class="timeline-key ${keySelected ? 'selected' : ''}" data-key-type="bone" data-key-id="${bone.id}" data-frame="${frame}" style="left:${frame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
    });
    html += '</div></div>';
  });

    {
      const frames = getTargetFrames('camera', 'camera');
      const selected = projectState.timeline.selectedType === 'camera';
      html += `<div class="timeline-row ${selected ? 'selected' : ''}"><div class="timeline-label"><span style="width:8px;height:8px;border-radius:50%;background:#ffd55a;display:inline-block"></span><span>Camara</span><small>x/y/zoom</small></div><div class="timeline-track" data-row-type="camera" data-row-id="camera" style="width:${width}px"><div class="timeline-current-line" style="left:${projectState.playback.currentFrame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
      frames.forEach(frame => {
        const keySelected = isTimelineFrameSelected('camera', 'camera', frame);
        html += `<div class="timeline-key camera ${keySelected ? 'selected' : ''}" data-key-type="camera" data-key-id="camera" data-frame="${frame}" style="left:${frame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
      });
      html += '</div></div>';
    }

    psdLayers.forEach((layer, index) => {
    const frames = getTargetFrames('slot', index);
    const selected = projectState.timeline.selectedType === 'slot' && projectState.timeline.selectedTargetId === index;
    html += `<div class="timeline-row ${selected ? 'selected' : ''}"><div class="timeline-label"><span style="width:8px;height:8px;border-radius:50%;background:#d8a54c;display:inline-block"></span><span>${layer.name}</span><small>slot</small></div><div class="timeline-track" data-row-type="slot" data-row-id="${index}" style="width:${width}px"><div class="timeline-current-line" style="left:${projectState.playback.currentFrame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
    frames.forEach(frame => {
      const keySelected = isTimelineFrameSelected('slot', index, frame);
      html += `<div class="timeline-key slot ${keySelected ? 'selected' : ''}" data-key-type="slot" data-key-id="${index}" data-frame="${frame}" style="left:${frame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
    });
    html += '</div></div>';
  });

    if (typeof getSwitchGroups === 'function') {
      const groups = getSwitchGroups();
      Object.keys(groups).forEach(groupName => {
        const frames = getTargetFrames('switch', groupName);
        const selected = projectState.timeline.selectedType === 'switch' && projectState.timeline.selectedTargetId === groupName;
        html += `<div class="timeline-row ${selected ? 'selected' : ''}"><div class="timeline-label"><span style="width:8px;height:8px;border-radius:50%;background:#7bdcff;display:inline-block"></span><span>${escapeHTML(groupName)}</span><small>switch</small></div><div class="timeline-track" data-row-type="switch" data-row-id="${escapeAttr(groupName)}" style="width:${width}px"><div class="timeline-current-line" style="left:${projectState.playback.currentFrame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
        frames.forEach(frame => {
          const keySelected = isTimelineFrameSelected('switch', groupName, frame);
          html += `<div class="timeline-key switch ${keySelected ? 'selected' : ''}" data-key-type="switch" data-key-id="${escapeAttr(groupName)}" data-frame="${frame}" style="left:${frame * TIMELINE_FRAME_WIDTH + 8}px"></div>`;
        });
        html += '</div></div>';
      });
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.timeline-track').forEach(track => {
    track.addEventListener('click', event => {
      if (event.target.classList.contains('timeline-key')) return;
      const frame = clamp(Math.round((event.offsetX - 8) / TIMELINE_FRAME_WIDTH), 0, animation.duration);
      const rowType = track.dataset.rowType;
      const rowId = (rowType === 'switch' || rowType === 'camera') ? track.dataset.rowId : +track.dataset.rowId;
      setTimelineSelection(rowType, rowId, [frame]);
      if (track.dataset.rowType === 'bone') {
        selectedId = rowId;
        selectedLayerIndex = null;
      } else if (track.dataset.rowType === 'slot') selectedLayerIndex = rowId;
      else if (track.dataset.rowType === 'camera') {
        selectedId = null;
        selectedLayerIndex = null;
        setTool('camera');
      }
      setCurrentFrame(frame);
      updateTree();
      updateLayerList();
      updateProps();
      renderTimeline();
    });
    });

    grid.querySelectorAll('.timeline-key').forEach(key => {
    key.addEventListener('click', event => {
      event.stopPropagation();
      const type = key.dataset.keyType;
      const targetId = (type === 'switch' || type === 'camera') ? key.dataset.keyId : +key.dataset.keyId;
      const frame = +key.dataset.frame;
      const sameTrack = projectState.timeline.selectedType === type && projectState.timeline.selectedTargetId === targetId;
      if ((event.ctrlKey || event.metaKey || event.shiftKey) && sameTrack) {
        const frames = getSelectedTimelineFrames();
        const nextFrames = frames.includes(frame) ? frames.filter(item => item !== frame) : [...frames, frame];
        setTimelineSelection(type, targetId, nextFrames.length ? nextFrames : [frame]);
      } else {
        setTimelineSelection(type, targetId, [frame]);
      }
      if (key.dataset.keyType === 'bone') {
        selectedId = targetId;
        selectedLayerIndex = null;
      } else if (key.dataset.keyType === 'slot') selectedLayerIndex = targetId;
      else if (key.dataset.keyType === 'camera') {
        selectedId = null;
        selectedLayerIndex = null;
        setTool('camera');
      }
      setCurrentFrame(+key.dataset.frame);
      updateTree();
      updateLayerList();
      updateProps();
      renderTimeline();
    });
    key.addEventListener('mousedown', event => {
      event.stopPropagation();
      const type = key.dataset.keyType;
      const targetId = (type === 'switch' || type === 'camera') ? key.dataset.keyId : +key.dataset.keyId;
      const oldFrame = +key.dataset.frame;
      const frameGroup = isTimelineFrameSelected(type, targetId, oldFrame) ? getSelectedTimelineFrames() : [oldFrame];
      draggingTimelineKey = {
        type,
        targetId,
        oldFrame,
        frameGroup,
        trackElement: key.parentElement
      };
    });
    });
  };
  if (profiler && profiler.isEnabled()) {
    return profiler.measureAction('renderTimeline', async () => run(), `bones=${bones.length} layers=${psdLayers.length}`);
  }
  return run();
}

function updateEditorProps() {
  const panel = document.getElementById('props-content');
  const selectedBone = getBoneById(selectedId);
  const selectedLayer = getLayerByIndex(selectedLayerIndex);
  const animation = getCurrentAnimation();
  const cameraSelected = activeTool === 'camera' || projectState.timeline.selectedType === 'camera';

  if (projectState.editorMode === 'animation') {
    if (cameraSelected) {
      const camera = ensureProjectCamera();
      const interpolation = getSelectedKeyInterpolation();
      panel.innerHTML = `
        <div class="prop-row"><span class="prop-label">Camara</span><input type="text" value="${camera.enabled ? 'activa' : 'desactivada'}" disabled></div>
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${camera.enabled ? 'checked' : ''} onchange="toggleCameraEnabled(this.checked)"> Usar en export</label>
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${camera.showFrame ? 'checked' : ''} onchange="toggleCameraFrame(this.checked)"> Ver marco</label>
        <div class="prop-row"><span class="prop-label">X</span><input type="number" value="${camera.x.toFixed(2)}" onchange="setCameraKeyValue('x', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Y</span><input type="number" value="${camera.y.toFixed(2)}" onchange="setCameraKeyValue('y', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Zoom</span><input type="number" step="0.01" min="0.05" value="${camera.zoom.toFixed(2)}" onchange="setCameraKeyValue('zoom', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Salida</span><input type="text" value="${camera.width} x ${camera.height}" disabled></div>
        <div class="prop-row"><span class="prop-label">Interp</span><select onchange="setSelectedKeyInterpolation(this.value)"><option value="step" ${interpolation === 'step' ? 'selected' : ''}>step</option><option value="linear" ${interpolation === 'linear' ? 'selected' : ''}>linear</option><option value="easeInOut" ${interpolation === 'easeInOut' ? 'selected' : ''}>easeInOut</option></select></div>
        <div class="inline-actions"><button class="tiny-btn" onclick="captureCameraToAnimation()">Key camera</button><button class="tiny-btn" onclick="resetCameraToScene()">Reset cam</button><button class="tiny-btn danger" onclick="deleteSelectedTimelineKey()">Borrar key</button></div>
      `;
      return;
    }
    if (selectedLayer) {
      const current = getCurrentLayerLocalTransform(selectedLayerIndex);
      const interpolation = getSelectedKeyInterpolation();
      const canEditMesh = !!(selectedLayer.mesh && activeTool === 'pins');
      const meshEditor = typeof ensureMeshEditorState === 'function' ? ensureMeshEditorState() : projectState.meshEditor;
      const selectedUiGroup = typeof getLayerUiGroup === 'function' ? getLayerUiGroup(selectedLayer) : String(selectedLayer.uiGroup || '').trim();
      const switchGroup = typeof getLayerSwitchGroup === 'function' ? getLayerSwitchGroup(selectedLayer) : String(selectedLayer.switchGroup || '').trim();
      const switchKey = typeof getLayerSwitchKey === 'function' ? getLayerSwitchKey(selectedLayer) : String(selectedLayer.switchKey || '').trim();
      const switchKeys = switchGroup ? getSwitchGroupKeys(switchGroup) : [];
      const activeSwitchKey = switchGroup ? getSwitchTrackValue(animation, switchGroup, projectState.playback.currentFrame) : '';
      const switchMarkup = switchGroup && switchKeys.length ? `
        <div class="prop-row"><span class="prop-label">${escapeHTML(switchGroup)}</span><select id="switch-key-select" data-group="${escapeAttr(switchGroup)}" onchange="setSwitchKeyAtCurrentFrame(this.dataset.group, this.value)">
          ${switchKeys.map(key => `<option value="${escapeAttr(key)}" ${key === activeSwitchKey ? 'selected' : ''}>${escapeHTML(key)}</option>`).join('')}
        </select></div>
        <div class="inline-actions"><button class="tiny-btn" data-group="${escapeAttr(switchGroup)}" onclick="captureSwitchKey(this.dataset.group, document.getElementById('switch-key-select').value)">Key switch</button></div>
      ` : `<div class="prop-row"><span class="prop-label">Switch</span><input type="text" value="${switchGroup ? 'Agrega keys al grupo' : 'Sin grupo'}" disabled></div>`;
      
      const emitterMarkup = (selectedUiGroup && typeof ParticleManager !== 'undefined' && ParticleManager.isEmitter(selectedUiGroup))
        ? ParticleManager.renderInspector(selectedUiGroup) : '';

      panel.innerHTML = `
        <div class="prop-row"><span class="prop-label">Slot</span><input type="text" value="${selectedLayer.name}" disabled></div>
        <div class="prop-row"><span class="prop-label">Carpeta</span><input type="text" value="${escapeAttr(selectedUiGroup)}" placeholder="Cara/Boca" onchange="setSelectedLayerUiGroup(this.value)"></div>
        <div class="prop-row"><span class="prop-label">Frame</span><input type="number" value="${projectState.playback.currentFrame}" onchange="setCurrentFrame(+this.value)"></div>
        <div class="prop-row"><span class="prop-label">X</span><input type="number" value="${current ? current.x.toFixed(2) : 0}" onchange="setLayerKeyValue('x', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Y</span><input type="number" value="${current ? current.y.toFixed(2) : 0}" onchange="setLayerKeyValue('y', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Rot</span><input type="number" value="${current ? current.rotation.toFixed(2) : 0}" onchange="setLayerKeyValue('rotation', +this.value)"></div>
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${current && current.visible ? 'checked' : ''} onchange="toggleSlotVisibilityKey(${selectedLayerIndex}, this.checked)"> Visible</label>
        <div class="prop-row"><span class="prop-label">Z</span><input type="number" value="${current ? current.zOrder : selectedLayerIndex}" onchange="setSlotZOrderKey(${selectedLayerIndex}, +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Interp</span><select onchange="setSelectedKeyInterpolation(this.value)"><option value="step" ${interpolation === 'step' ? 'selected' : ''}>step</option><option value="linear" ${interpolation === 'linear' ? 'selected' : ''}>linear</option><option value="easeInOut" ${interpolation === 'easeInOut' ? 'selected' : ''}>easeInOut</option></select></div>
        <div class="inline-actions"><button class="tiny-btn" onclick="captureSelectedLayerToAnimation()">Key slot</button><button class="tiny-btn" ${canEditMesh ? '' : 'disabled'} onclick="captureSelectedLayerMeshToAnimation()">Key mesh</button><button class="tiny-btn danger" onclick="deleteSelectedTimelineKey()">Borrar key</button></div>
        ${switchMarkup}
        ${emitterMarkup}
        <div class="prop-row"><span class="prop-label">Mesh</span><input type="text" value="${canEditMesh ? 'Usa Pins para mover vertices en este frame' : 'Selecciona Pins y una capa con mesh'}" disabled></div>
        <div class="section-title" style="margin-top:10px">Mesh editor</div>
        <div class="inline-actions">
          <button class="tiny-btn ${meshEditor.mode === 'select' ? 'active' : ''}" onclick="setMeshEditMode('select')">Select</button>
          <button class="tiny-btn ${meshEditor.mode === 'move' ? 'active' : ''}" onclick="setMeshEditMode('move')">Move</button>
          <button class="tiny-btn ${meshEditor.mode === 'pin' ? 'active' : ''}" onclick="setMeshEditMode('pin')">Pin</button>
          <button class="tiny-btn ${meshEditor.mode === 'createPin' ? 'active' : ''}" onclick="setMeshEditMode('createPin')">Crear pin</button>
        </div>
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${meshEditor.softSelectionEnabled ? 'checked' : ''} onchange="setMeshSoftSelection(this.checked)"> Soft selection</label>
        <div class="prop-row"><span class="prop-label">Radio</span><input type="number" min="10" max="400" value="${Math.round(meshEditor.softSelectionRadius || 90)}" onchange="setMeshSoftSelectionRadius(+this.value)"></div>
        <div class="prop-row"><span class="prop-label">Fuerza</span><input type="number" min="0" max="1" step="0.05" value="${(meshEditor.softSelectionStrength || 0.65).toFixed(2)}" onchange="setMeshSoftSelectionStrength(+this.value)"></div>
        <div class="inline-actions">
          <button class="tiny-btn" onclick="rotateSelectedMeshVertices(-8)" ${meshEditor.selectedVertexIds.length ? '' : 'disabled'}>-Rot</button>
          <button class="tiny-btn" onclick="rotateSelectedMeshVertices(8)" ${meshEditor.selectedVertexIds.length ? '' : 'disabled'}>+Rot</button>
          <button class="tiny-btn" onclick="scaleSelectedMeshVertices(0.94)" ${meshEditor.selectedVertexIds.length ? '' : 'disabled'}>-Scale</button>
          <button class="tiny-btn" onclick="scaleSelectedMeshVertices(1.06)" ${meshEditor.selectedVertexIds.length ? '' : 'disabled'}>+Scale</button>
        </div>
        <div class="inline-actions">
          <button class="tiny-btn" onclick="resetSelectedLayerMeshToBind()" ${selectedLayer.mesh ? '' : 'disabled'}>Reset a bind</button>
          <button class="tiny-btn" onclick="commitCurrentMeshToCurrentFrame()" ${selectedLayer.mesh ? '' : 'disabled'}>Guardar frame</button>
        </div>
        ${buildDrivenConstraintMarkup('layer', selectedLayer)}
      `;
      return;
    }

    if (selectedBone) {
      const local = getCurrentBoneLocalTransform(selectedBone);
      const interpolation = getSelectedKeyInterpolation();
      panel.innerHTML = `
        <div class="prop-row"><span class="prop-label">Clip</span><input type="text" value="${animation ? animation.name : ''}" onchange="renameCurrentAnimation(this.value)"></div>
        <div class="prop-row"><span class="prop-label">Bone</span><input type="text" value="${selectedBone.name}" disabled></div>
        <div class="prop-row"><span class="prop-label">Dur</span><input type="number" value="${animation ? animation.duration : 48}" onchange="setAnimationDuration(+this.value)"></div>
        <div class="prop-row"><span class="prop-label">FPS</span><input type="number" value="${animation ? animation.frameRate : 24}" onchange="setAnimationFrameRate(+this.value)"></div>
        <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${animation && animation.loop ? 'checked' : ''} onchange="setAnimationLoop(this.checked)"> Loop</label>
        <div class="prop-row"><span class="prop-label">X</span><input type="number" value="${local ? local.x.toFixed(2) : 0}" onchange="setBoneKeyValue('x', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Y</span><input type="number" value="${local ? local.y.toFixed(2) : 0}" onchange="setBoneKeyValue('y', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Rot</span><input type="number" value="${local ? local.rotation.toFixed(2) : 0}" onchange="setBoneKeyValue('rotation', +this.value)"></div>
        <div class="prop-row"><span class="prop-label">Interp</span><select onchange="setSelectedKeyInterpolation(this.value)"><option value="step" ${interpolation === 'step' ? 'selected' : ''}>step</option><option value="linear" ${interpolation === 'linear' ? 'selected' : ''}>linear</option><option value="easeInOut" ${interpolation === 'easeInOut' ? 'selected' : ''}>easeInOut</option></select></div>
        <div class="inline-actions"><button class="tiny-btn" onclick="captureSelectedBoneToAnimation()">Key bone</button><button class="tiny-btn danger" onclick="deleteSelectedTimelineKey()">Borrar key</button></div>
        ${typeof buildSecondaryMotionMarkup === 'function' ? buildSecondaryMotionMarkup(selectedBone, true) : ''}
        ${buildDrivenConstraintMarkup('bone', selectedBone)}
      `;
      return;
    }

    panel.textContent = 'Selecciona un bone o una capa para editar keys';
    return;
  }

  if (selectedLayer) {
    const meshEditor = typeof ensureMeshEditorState === 'function' ? ensureMeshEditorState() : projectState.meshEditor;
    ensureLayerIdentity(selectedLayer);
    const selectedPin = (selectedLayer.meshPins || []).find(pin => pin.id === projectState.meshEditor.selectedPinId) || null;
    const controllerOptions = `<option value="">(Sin controlador)</option>` + psdLayers
      .map(layer => ensureLayerIdentity(layer))
      .filter(layer => layer.uid !== selectedLayer.uid)
      .map(layer => `<option value="${layer.uid}" ${selectedPin && selectedPin.controllerLayerId === layer.uid ? 'selected' : ''}>${layer.name}</option>`)
      .join('');
    const pinsMarkup = (selectedLayer.meshPins || []).length
      ? selectedLayer.meshPins.map(pin => `<button class="tiny-btn ${projectState.meshEditor.selectedPinId === pin.id ? 'active' : ''}" onclick="selectMeshPin('${pin.id}')">${pin.id.slice(-4)}</button>`).join('')
      : '<span style="color:#777">Sin pins</span>';
    const stitchCount = (projectState.meshStitches || [])
      .filter(stitch => stitch.sourceLayerUid === selectedLayer.uid || stitch.targetLayerUid === selectedLayer.uid)
      .reduce((sum, stitch) => sum + (stitch.links ? stitch.links.length : 0), 0);
    const selectedUiGroup = typeof getLayerUiGroup === 'function' ? getLayerUiGroup(selectedLayer) : String(selectedLayer.uiGroup || '').trim();
    const selectedSwitchGroup = getLayerSwitchGroup(selectedLayer);
    const selectedSwitchKey = getLayerSwitchKey(selectedLayer);
    const selectedSwitchKeys = selectedSwitchGroup ? getSwitchGroupKeys(selectedSwitchGroup) : [];
    const switchDefault = selectedSwitchGroup ? getSwitchDefaultKey(selectedSwitchGroup) : '';
    const switchDefaultMarkup = selectedSwitchGroup && selectedSwitchKeys.length ? `
      <div class="prop-row"><span class="prop-label">Default</span><select data-group="${escapeAttr(selectedSwitchGroup)}" onchange="setSwitchDefaultKey(this.dataset.group, this.value)">
        ${selectedSwitchKeys.map(key => `<option value="${escapeAttr(key)}" ${key === switchDefault ? 'selected' : ''}>${escapeHTML(key)}</option>`).join('')}
      </select></div>
    ` : '';
    
    const emitterMarkup = (selectedUiGroup && typeof ParticleManager !== 'undefined' && ParticleManager.isEmitter(selectedUiGroup))
        ? ParticleManager.renderInspector(selectedUiGroup) : '';

    panel.innerHTML = `
      <div class="prop-row"><span class="prop-label">Capa</span><input type="text" value="${selectedLayer.name}" disabled></div>
      <div class="prop-row"><span class="prop-label">Carpeta</span><input type="text" value="${escapeAttr(selectedUiGroup)}" placeholder="Cara/Boca" onchange="setSelectedLayerUiGroup(this.value)"></div>
      <div class="prop-row"><span class="prop-label">Rol</span>
        <select onchange="setSelectedLayerRole(this.value)">
          <option value="controller" ${selectedLayer.role === 'controller' ? 'selected' : ''}>controller</option>
          <option value="deformable" ${selectedLayer.role === 'deformable' ? 'selected' : ''}>deformable</option>
        </select>
      </div>
      <div class="prop-row"><span class="prop-label">Grupo</span><input type="text" value="${escapeAttr(selectedSwitchGroup)}" placeholder="mouth" onchange="setSelectedLayerSwitchGroup(this.value)"></div>
      <div class="prop-row"><span class="prop-label">Key</span><input type="text" value="${escapeAttr(selectedSwitchKey)}" placeholder="A / O / closed" onchange="setSelectedLayerSwitchKey(this.value)"></div>
      ${switchDefaultMarkup}
      ${selectedUiGroup ? `<div class="inline-actions"><button class="tiny-btn" onclick="setSoloLayerGroup('${escapeAttr(selectedUiGroup)}')">Solo carpeta</button><button class="tiny-btn" onclick="setSelectedLayerUiGroup('')">Sacar de carpeta</button></div>` : ''}
      ${emitterMarkup}
      <div class="section-title" style="margin-top:10px">Mesh editor</div>
      <div class="inline-actions">
        <button class="tiny-btn ${meshEditor.mode === 'select' ? 'active' : ''}" onclick="setMeshEditMode('select')">Select</button>
        <button class="tiny-btn ${meshEditor.mode === 'move' ? 'active' : ''}" onclick="setMeshEditMode('move')">Move</button>
        <button class="tiny-btn ${meshEditor.mode === 'pin' ? 'active' : ''}" onclick="setMeshEditMode('pin')">Pin</button>
        <button class="tiny-btn ${meshEditor.mode === 'addVertex' ? 'active' : ''}" onclick="setMeshEditMode('addVertex')" ${selectedLayer.mesh ? '' : 'disabled'}>Add vertex</button>
        <button class="tiny-btn ${meshEditor.mode === 'createPin' ? 'active' : ''}" onclick="setMeshEditMode('createPin')">Crear pin</button>
      </div>
      <div class="prop-row"><span class="prop-label">Preset</span><select onchange="setMeshGenerationPreset(this.value)"><option value="low" ${meshEditor.generationPreset === 'low' ? 'selected' : ''}>low</option><option value="medium" ${meshEditor.generationPreset === 'medium' ? 'selected' : ''}>medium</option><option value="high" ${meshEditor.generationPreset === 'high' ? 'selected' : ''}>high</option></select></div>
      <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${meshEditor.softSelectionEnabled ? 'checked' : ''} onchange="setMeshSoftSelection(this.checked)"> Soft selection</label>
      <div class="prop-row"><span class="prop-label">Radio</span><input type="number" min="10" max="400" value="${Math.round(meshEditor.softSelectionRadius || 90)}" onchange="setMeshSoftSelectionRadius(+this.value)"></div>
      <div class="prop-row"><span class="prop-label">Fuerza</span><input type="number" min="0" max="1" step="0.05" value="${(meshEditor.softSelectionStrength || 0.65).toFixed(2)}" onchange="setMeshSoftSelectionStrength(+this.value)"></div>
      <div class="inline-actions">
        <button class="tiny-btn" onclick="createMeshForSelectedLayer()">${selectedLayer.mesh ? 'Regenerar mesh' : 'Crear mesh'}</button>
        <button class="tiny-btn" onclick="createGridMeshFromPresetForSelectedLayer()">Grid mesh</button>
        <button class="tiny-btn ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? 'active' : ''}" onclick="beginManualMeshForSelectedLayer()">${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? 'Editando manual' : 'Mesh manual'}</button>
        <button class="tiny-btn ${projectState.meshEditor.addVertexMode ? 'active' : ''}" onclick="toggleAddMeshVertexMode()" ${selectedLayer.mesh ? '' : 'disabled'}>${projectState.meshEditor.addVertexMode ? 'Click para agregar' : 'Add vertex'}</button>
        <button class="tiny-btn" onclick="clearMeshSelection()">Limpiar seleccion</button>
        <button class="tiny-btn" onclick="createPinFromSelection()" ${projectState.meshEditor.selectedVertexIds.length ? '' : 'disabled'}>Crear pin</button>
        <button class="tiny-btn danger" onclick="deleteSelectedPin()" ${selectedPin ? '' : 'disabled'}>Borrar pin</button>
      </div>
      <div class="inline-actions">
        <button class="tiny-btn" onclick="rotateSelectedMeshVertices(-8)" ${projectState.meshEditor.selectedVertexIds.length ? '' : 'disabled'}>-Rot</button>
        <button class="tiny-btn" onclick="rotateSelectedMeshVertices(8)" ${projectState.meshEditor.selectedVertexIds.length ? '' : 'disabled'}>+Rot</button>
        <button class="tiny-btn" onclick="scaleSelectedMeshVertices(0.94)" ${projectState.meshEditor.selectedVertexIds.length ? '' : 'disabled'}>-Scale</button>
        <button class="tiny-btn" onclick="scaleSelectedMeshVertices(1.06)" ${projectState.meshEditor.selectedVertexIds.length ? '' : 'disabled'}>+Scale</button>
      </div>
      <div class="inline-actions">
        <button class="tiny-btn ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid && projectState.meshEditor.manualStage !== 'interior' ? 'active' : ''}" onclick="setManualMeshStage('contour')" ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? '' : 'disabled'}>Contorno</button>
        <button class="tiny-btn ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid && projectState.meshEditor.manualStage === 'interior' ? 'active' : ''}" onclick="setManualMeshStage('interior')" ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? '' : 'disabled'}>Puntos internos</button>
        <button class="tiny-btn" onclick="clearManualMeshPoints(); updateProps(); render();" ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? '' : 'disabled'}>Limpiar puntos</button>
        <button class="tiny-btn" onclick="finalizeManualMeshForSelectedLayer()" ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? '' : 'disabled'}>Finalizar manual</button>
        <button class="tiny-btn danger" onclick="cancelManualMeshCreation()" ${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? '' : 'disabled'}>Cancelar manual</button>
      </div>
      <div class="inline-actions">
        <button class="tiny-btn" onclick="commitCurrentMeshToBind()" ${selectedLayer.mesh ? '' : 'disabled'}>Tomar como bind</button>
        <button class="tiny-btn" onclick="resetSelectedLayerMeshToBind()" ${selectedLayer.mesh ? '' : 'disabled'}>Reset bind</button>
      </div>
      <div class="prop-row"><span class="prop-label">Verts</span><input type="text" value="${projectState.meshEditor.selectedVertexIds.length} seleccionados" disabled></div>
      <div class="prop-row"><span class="prop-label">Manual</span><input type="text" value="${projectState.meshEditor.manualMode && projectState.meshEditor.manualLayerUid === selectedLayer.uid ? `${projectState.meshEditor.manualContourPoints.length} contorno / ${projectState.meshEditor.manualInteriorPoints.length} internos / ${projectState.meshEditor.manualStage === 'interior' ? 'editando internos' : 'editando contorno'}` : (projectState.meshEditor.addVertexMode ? 'click sobre el mesh agrega vertices' : 'inactivo')}" disabled></div>
      <div class="prop-row stack"><span class="prop-label" style="width:auto">Pins</span><div class="inline-actions">${pinsMarkup}</div></div>
      <div class="prop-row"><span class="prop-label">Ctrl</span><select onchange="bindSelectedPinController(this.value)" ${selectedPin ? '' : 'disabled'}>${controllerOptions}</select></div>
      <div class="prop-row"><span class="prop-label">Radio</span><input type="number" value="${selectedPin ? selectedPin.radius.toFixed(1) : 0}" onchange="updateSelectedPinNumeric('radius', +this.value)" ${selectedPin ? '' : 'disabled'}></div>
      <div class="prop-row"><span class="prop-label">Falloff</span><input type="number" step="0.1" value="${selectedPin ? selectedPin.falloff.toFixed(2) : 0}" onchange="updateSelectedPinNumeric('falloff', +this.value)" ${selectedPin ? '' : 'disabled'}></div>
      <div class="prop-row"><span class="prop-label">Fuerza</span><input type="number" step="0.1" value="${selectedPin ? selectedPin.strength.toFixed(2) : 0}" onchange="updateSelectedPinNumeric('strength', +this.value)" ${selectedPin ? '' : 'disabled'}></div>
      <div class="prop-row"><span class="prop-label">Stitch</span><input type="text" value="${stitchCount} links" disabled></div>
      <div class="prop-row"><span class="prop-label">Hint</span><input type="text" value="Usa Pins para seleccionar vertices y crear controladores" disabled></div>
      ${buildDrivenConstraintMarkup('layer', selectedLayer)}
    `;
    return;
  }

  if (cameraSelected) {
    const camera = ensureProjectCamera();
    panel.innerHTML = `
      <div class="prop-row"><span class="prop-label">Camara</span><input type="text" value="produccion/export" disabled></div>
      <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${camera.enabled ? 'checked' : ''} onchange="toggleCameraEnabled(this.checked)"> Usar en export</label>
      <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${camera.showFrame ? 'checked' : ''} onchange="toggleCameraFrame(this.checked)"> Ver marco</label>
      <div class="prop-row"><span class="prop-label">X</span><input type="number" value="${camera.x.toFixed(2)}" onchange="projectState.camera.x=+this.value; render(); pushUndoSnapshot(); updateProps();"></div>
      <div class="prop-row"><span class="prop-label">Y</span><input type="number" value="${camera.y.toFixed(2)}" onchange="projectState.camera.y=+this.value; render(); pushUndoSnapshot(); updateProps();"></div>
      <div class="prop-row"><span class="prop-label">Zoom</span><input type="number" step="0.01" min="0.05" value="${camera.zoom.toFixed(2)}" onchange="projectState.camera.zoom=clamp(+this.value||1,0.05,20); render(); pushUndoSnapshot(); updateProps();"></div>
      <div class="prop-row"><span class="prop-label">Salida</span><input type="text" value="${camera.width} x ${camera.height}" disabled></div>
      <div class="inline-actions"><button class="tiny-btn" onclick="resetCameraToScene()">Reset cam</button></div>
    `;
    return;
  }

  if (!selectedBone) {
    panel.textContent = 'Selecciona un bone o una capa';
    return;
  }

  const parentOptions = bones.filter(item => item.id !== selectedBone.id).map(item =>
    `<option value="${item.id}" ${item.id === selectedBone.parent ? 'selected' : ''}>${item.name}</option>`
  ).join('');
  const layerOptions = `<option value="">(Ninguna)</option>` + psdLayers.map((layer, index) => {
    const selected = layer.bone_id === selectedBone.id ? 'selected' : '';
    const disabled = layer.bone_id !== null && layer.bone_id !== selectedBone.id ? 'disabled' : '';
    const label = layer.bone_id !== null && layer.bone_id !== selectedBone.id ? `(Vinculada) ${layer.name}` : layer.name;
    return `<option value="${index}" ${selected} ${disabled}>${label}</option>`;
  }).join('');
  const ikConstraint = typeof getIkConstraintForBoneId === 'function' ? getIkConstraintForBoneId(selectedBone.id) : null;
  const ikBoneOptions = bones.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  const ikSelect = (field, currentValue) => `<select onchange="updateIkConstraintField('${escapeAttr(ikConstraint.id)}', '${field}', this.value)"><option value="">(ninguno)</option>${bones.map(item => `<option value="${item.id}" ${item.id === currentValue ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select>`;
  const ikMarkup = ikConstraint ? `
    <div class="section-title" style="margin-top:10px">IK 2-bones</div>
    <label class="check-row" style="margin-bottom:8px"><input type="checkbox" ${ikConstraint.enabled !== false ? 'checked' : ''} onchange="updateIkConstraintField('${escapeAttr(ikConstraint.id)}', 'enabled', this.checked)"> Activo</label>
    <div class="prop-row"><span class="prop-label">Root</span>${ikSelect('rootBoneId', ikConstraint.rootBoneId)}</div>
    <div class="prop-row"><span class="prop-label">Mid</span>${ikSelect('midBoneId', ikConstraint.midBoneId)}</div>
    <div class="prop-row"><span class="prop-label">End</span>${ikSelect('endBoneId', ikConstraint.endBoneId)}</div>
    <div class="prop-row"><span class="prop-label">Target</span>${ikSelect('targetBoneId', ikConstraint.targetBoneId)}</div>
    <div class="prop-row"><span class="prop-label">Bend</span><select onchange="updateIkConstraintField('${escapeAttr(ikConstraint.id)}', 'bendDirection', this.value)"><option value="1" ${ikConstraint.bendDirection !== -1 ? 'selected' : ''}>positive</option><option value="-1" ${ikConstraint.bendDirection === -1 ? 'selected' : ''}>negative</option></select></div>
    <div class="prop-row"><span class="prop-label">Mix</span><input type="number" min="0" max="1" step="0.05" value="${(ikConstraint.mix === undefined ? 1 : ikConstraint.mix).toFixed(2)}" onchange="updateIkConstraintField('${escapeAttr(ikConstraint.id)}', 'mix', +this.value)"></div>
    <div class="inline-actions"><button class="tiny-btn" onclick="updateIkConstraintField('${escapeAttr(ikConstraint.id)}', 'bendDirection', ${ikConstraint.bendDirection === -1 ? 1 : -1})">Invertir</button><button class="tiny-btn danger" onclick="deleteIkConstraint('${escapeAttr(ikConstraint.id)}')">Borrar IK</button></div>
  ` : `
    <div class="section-title" style="margin-top:10px">IK 2-bones</div>
    <div class="prop-row"><span class="prop-label">Estado</span><input type="text" value="Sin IK" disabled></div>
    <div class="inline-actions"><button class="tiny-btn" onclick="createIkConstraintForSelectedBone()">Crear IK 2-bones</button></div>
  `;
  panel.innerHTML = `
    <div class="prop-row"><span class="prop-label">Nombre</span><input type="text" value="${selectedBone.name}" onchange="renameBone(${selectedBone.id}, this.value)"></div>
    <div class="prop-row"><span class="prop-label">X</span><input type="number" value="${Math.round(selectedBone.x)}" onchange="setRigBoneValue(${selectedBone.id}, 'x', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Y</span><input type="number" value="${Math.round(selectedBone.y)}" onchange="setRigBoneValue(${selectedBone.id}, 'y', +this.value)"></div>
    <div class="prop-row"><span class="prop-label">Parent</span><select onchange="setBoneParent(${selectedBone.id}, this.value)">${selectedBone.parent === null ? '<option value="">(root)</option>' : ''}${parentOptions}</select></div>
    <div class="prop-row stack"><span class="prop-label" style="width:auto">Vincular capa</span><select onchange="assignLayerToBone(${selectedBone.id}, this.value)">${layerOptions}</select></div>
    ${ikMarkup}
    ${typeof buildSecondaryMotionMarkup === 'function' ? buildSecondaryMotionMarkup(selectedBone, false) : ''}
    ${buildDrivenConstraintMarkup('bone', selectedBone)}
  `;
}

function renameCurrentAnimation(name) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  animation.name = name || animation.name;
  pushUndoSnapshot();
  renderClipList();
  updateAnimationControls();
}

function scaleTrackFrames(track, ratio, maxFrame) {
  if (!track) return;
  track.forEach(item => { item.frame = clamp(Math.round(item.frame * ratio), 0, maxFrame); });
  track.sort((a, b) => a.frame - b.frame);
}

function scaleAnimationKeys(animation, oldDuration, newDuration) {
  const ratio = oldDuration <= 0 ? 1 : newDuration / oldDuration;
  Object.values(animation.boneTimelines || {}).forEach(timeline => {
    ['x', 'y', 'rotation'].forEach(prop => scaleTrackFrames(timeline[prop], ratio, newDuration));
  });
  Object.values(animation.slotTimelines || {}).forEach(timeline => {
    ['x', 'y', 'rotation', 'visible', 'zOrder', 'displayIndex', 'mesh'].forEach(prop => scaleTrackFrames(timeline[prop], ratio, newDuration));
  });
  Object.values(animation.switchTimelines || {}).forEach(timeline => {
    scaleTrackFrames(timeline, ratio, newDuration);
  });
  const cameraTimeline = ensureCameraTimeline(animation);
  ['x', 'y', 'zoom'].forEach(prop => scaleTrackFrames(cameraTimeline[prop], ratio, newDuration));
}

function setAnimationDuration(value, shouldScale = false) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  const oldDuration = animation.duration;
  const nextDuration = Math.max(1, Math.round(value || 1));
  if (shouldScale && oldDuration !== nextDuration) scaleAnimationKeys(animation, oldDuration, nextDuration);
  animation.duration = nextDuration;
  projectState.playback.currentFrame = clamp(projectState.playback.currentFrame, 0, animation.duration);
  pushUndoSnapshot();
  renderClipList();
  updateAnimationControls();
  renderTimeline();
  applyAnimationAtCurrentFrame();
}

function scaleAnimationDurationFromToolbar() {
  const input = document.getElementById('timeline-duration-input');
  setAnimationDuration(input ? +input.value : 48, true);
}

function setAnimationFrameRate(value) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  animation.frameRate = Math.max(1, Math.round(value || 1));
  pushUndoSnapshot();
  updateAnimationControls();
}

function setAnimationLoop(value) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  animation.loop = value;
  pushUndoSnapshot();
}

function setBoneKeyValue(prop, value) {
  const animation = getCurrentAnimation();
  const bone = getBoneById(selectedId);
  if (!animation || !bone) return;
  const timeline = ensureBoneTimeline(animation, bone.id);
  upsertFrame(timeline[prop], projectState.playback.currentFrame, value, getSelectedKeyInterpolation());
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
}

function setLayerKeyValue(prop, value) {
  const animation = getCurrentAnimation();
  if (!animation || selectedLayerIndex === null) return;
  const timeline = ensureSlotTimeline(animation, selectedLayerIndex);
  upsertFrame(timeline[prop], projectState.playback.currentFrame, value, getSelectedKeyInterpolation());
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
}

function toggleSlotVisibilityKey(layerIndex, visible) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  const timeline = ensureSlotTimeline(animation, layerIndex);
  upsertFrame(timeline.visible, projectState.playback.currentFrame, visible ? 1 : 0, 'step');
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
}

function setSlotZOrderKey(layerIndex, value) {
  const animation = getCurrentAnimation();
  if (!animation) return;
  const timeline = ensureSlotTimeline(animation, layerIndex);
  upsertFrame(timeline.zOrder, projectState.playback.currentFrame, Math.round(value), getSelectedKeyInterpolation());
  applyAnimationAtCurrentFrame();
  pushUndoSnapshot();
}

function createMeshForSelectedLayer() {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  if (projectState.meshEditor.manualMode) cancelManualMeshCreation();
  const preset = typeof getMeshGenerationPresetOptions === 'function'
    ? getMeshGenerationPresetOptions(projectState.meshEditor && projectState.meshEditor.generationPreset)
    : { contourPoints: 48, curvatureWeight: 2, gridCols: 3, gridRows: 3 };
  const created = createContourMeshForLayer(layer, {
    alphaThreshold: 10,
    contourPoints: preset.contourPoints,
    interiorDensity: 'auto',
    curvatureWeight: preset.curvatureWeight,
    ignoreHoles: true
  });
  if (!created) createGridMeshForLayer(layer, preset.gridCols, preset.gridRows);
  projectState.meshEditor.selectedVertexIds = [];
  projectState.meshEditor.selectedPinId = null;
  saveBindPose();
  updateProps();
  render();
}

function createGridMeshFromPresetForSelectedLayer() {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  const preset = typeof getMeshGenerationPresetOptions === 'function'
    ? getMeshGenerationPresetOptions(projectState.meshEditor && projectState.meshEditor.generationPreset)
    : { gridCols: 3, gridRows: 3 };
  createGridMeshForLayer(layer, preset.gridCols, preset.gridRows);
  projectState.meshEditor.selectedVertexIds = [];
  projectState.meshEditor.selectedPinId = null;
  saveBindPose();
  updateProps();
  render();
}

function resetSelectedLayerMeshToBind() {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.mesh || !layer.mesh.bindVertices) return;
  applyEditedMeshVertices(layer, layer.mesh.bindVertices, { refreshSkinNeighbors: false });
  if (projectState.editorMode === 'animation') {
    if (typeof captureSelectedLayerMeshToAnimation === 'function' && getCurrentAnimation()) {
      captureSelectedLayerMeshToAnimation(projectState.playback.currentFrame, 'linear');
      applyAnimationAtCurrentFrame();
    }
  } else {
    saveBindPose();
    render();
  }
  updateProps();
  pushUndoSnapshot();
}

function commitCurrentMeshToBind() {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.mesh) return;
  const source = getEditableMeshVertices(layer);
  layer.mesh.bindVertices = cloneVertices(source);
  layer.mesh.runtimeVertices = cloneVertices(source);
  layer.mesh.vertices = cloneVertices(source);
  layer.mesh.animatedVertices = null;
  saveBindPose();
  updateProps();
  render();
  pushUndoSnapshot();
}

function commitCurrentMeshToCurrentFrame() {
  if (typeof captureSelectedLayerMeshToAnimation !== 'function' || !getCurrentAnimation()) return;
  captureSelectedLayerMeshToAnimation(projectState.playback.currentFrame, 'linear');
  applyAnimationAtCurrentFrame();
}

function rotateSelectedMeshVertices(deltaDeg) {
  const layer = getLayerByIndex(selectedLayerIndex);
  const editor = ensureMeshEditorState();
  if (!layer || !layer.mesh || !editor.selectedVertexIds.length) return;
  const weights = buildSoftSelectionWeights(layer, editor.selectedVertexIds, editor.softSelectionRadius, editor.softSelectionStrength);
  if (!rotateMeshVertexSelection(layer, deltaDeg, weights)) return;
  updateProps();
  render();
  pushUndoSnapshot();
}

function scaleSelectedMeshVertices(factor) {
  const layer = getLayerByIndex(selectedLayerIndex);
  const editor = ensureMeshEditorState();
  if (!layer || !layer.mesh || !editor.selectedVertexIds.length) return;
  const weights = buildSoftSelectionWeights(layer, editor.selectedVertexIds, editor.softSelectionRadius, editor.softSelectionStrength);
  if (!scaleMeshVertexSelection(layer, factor, weights)) return;
  updateProps();
  render();
  pushUndoSnapshot();
}

function clearMeshSelection() {
  projectState.meshEditor.selectedVertexIds = [];
  projectState.meshEditor.selectedPinId = null;
  projectState.meshEditor.addVertexMode = false;
  updateProps();
  render();
}

function selectMeshPin(pinId) {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.meshPins) return;
  const pin = layer.meshPins.find(item => item.id === pinId);
  if (!pin) return;
  projectState.meshEditor.selectedPinId = pinId;
  projectState.meshEditor.selectedVertexIds = [...pin.vertexIds];
  updateProps();
  render();
}

function bindSelectedPinController(layerId) {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.meshPins) return;
  const pin = layer.meshPins.find(item => item.id === projectState.meshEditor.selectedPinId);
  if (!pin) return;
  pin.controllerLayerId = layerId || null;
  pin.bindControllerWorld = pin.controllerLayerId ? getControllerTransform(pin.controllerLayerId) : null;
  saveBindPose();
  updateProps();
  render();
}

function updateSelectedPinNumeric(field, value) {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer || !layer.meshPins) return;
  const pin = layer.meshPins.find(item => item.id === projectState.meshEditor.selectedPinId);
  if (!pin) return;
  if (field === 'radius') pin.radius = Math.max(1, value || 1);
  if (field === 'falloff') pin.falloff = Math.max(0.1, value || 0.1);
  if (field === 'strength') pin.strength = Math.max(0, value || 0);
  pushUndoSnapshot();
  updateProps();
  render();
}

function setSelectedLayerRole(role) {
  const layer = getLayerByIndex(selectedLayerIndex);
  if (!layer) return;
  ensureLayerIdentity(layer);
  layer.role = role;
  if (role === 'deformable' && !layer.mesh) createGridMeshForLayer(layer);
  pushUndoSnapshot();
  updateLayerList();
  updateProps();
  render();
}

function serializeBoneFrames(animation, bone) {
  const timeline = animation.boneTimelines[bone.id];
  if (!timeline) return null;
  const bind = projectState.bindPose.bones[bone.id];
  const translateFrames = getUnionFrames([timeline.x, timeline.y]);
  const rotateFrames = getUnionFrames([timeline.rotation]);
  return {
    name: bone.name,
    translateFrame: translateFrames.map((frame, index) => {
      const nextFrame = translateFrames[index + 1] !== undefined ? translateFrames[index + 1] : animation.duration + 1;
      return {
        duration: Math.max(1, nextFrame - frame),
        x: Math.round(evaluateTrack(timeline.x, frame, bind.x) * 100) / 100,
        y: Math.round(evaluateTrack(timeline.y, frame, bind.y) * 100) / 100,
        tweenEasing: (timeline.x.find(item => item.frame === frame) || timeline.y.find(item => item.frame === frame) || {}).interpolation || 'linear'
      };
    }),
    rotateFrame: rotateFrames.map((frame, index) => {
      const nextFrame = rotateFrames[index + 1] !== undefined ? rotateFrames[index + 1] : animation.duration + 1;
      return {
        duration: Math.max(1, nextFrame - frame),
        rotate: Math.round(evaluateTrack(timeline.rotation, frame, bind.rotation, true) * 100) / 100,
        tweenEasing: (timeline.rotation.find(item => item.frame === frame) || {}).interpolation || 'linear'
      };
    })
  };
}

function serializeSlotFrames(animation, layer, index) {
  const timeline = animation.slotTimelines[index];
  if (!timeline) return null;
  const bind = projectState.bindPose.slots[index];
  const visibleFrames = getUnionFrames([timeline.visible]);
  const zFrames = getUnionFrames([timeline.zOrder]);
  return {
    name: layer.name + '_slot',
    displayFrame: visibleFrames.map((frame, idx) => {
      const nextFrame = visibleFrames[idx + 1] !== undefined ? visibleFrames[idx + 1] : animation.duration + 1;
      return {
        duration: Math.max(1, nextFrame - frame),
        value: evaluateTrack(timeline.visible, frame, bind.visible ? 1 : 0) >= 0.5 ? 0 : -1
      };
    }),
    zOrderFrame: zFrames.map((frame, idx) => {
      const nextFrame = zFrames[idx + 1] !== undefined ? zFrames[idx + 1] : animation.duration + 1;
      return {
        duration: Math.max(1, nextFrame - frame),
        z: Math.round(evaluateTrack(timeline.zOrder, frame, bind.zOrder))
      };
    })
  };
}

function serializeAnimationsForExport() {
  return projectState.animations.map(animation => ({
    name: animation.name,
    duration: animation.duration + 1,
    playTimes: animation.loop ? 0 : 1,
    fadeInTime: 0,
    bone: bones.map(bone => serializeBoneFrames(animation, bone)).filter(Boolean),
    slot: psdLayers.map((layer, index) => serializeSlotFrames(animation, layer, index)).filter(Boolean)
  }));
}

document.addEventListener('mousemove', event => {
  if (!draggingTimelineKey) return;
  const animation = getCurrentAnimation();
  if (!animation) return;
  const rect = draggingTimelineKey.trackElement.getBoundingClientRect();
  const frame = clamp(Math.round((event.clientX - rect.left - 8) / TIMELINE_FRAME_WIDTH), 0, animation.duration);
  projectState.timeline.selectedType = draggingTimelineKey.type;
  projectState.timeline.selectedTargetId = draggingTimelineKey.targetId;
  projectState.timeline.selectedFrame = frame;
  renderTimeline();
});

document.addEventListener('mouseup', event => {
  if (!draggingTimelineKey) return;
  const animation = getCurrentAnimation();
  if (!animation) {
    draggingTimelineKey = null;
    return;
  }
  const rect = draggingTimelineKey.trackElement.getBoundingClientRect();
  const frame = clamp(Math.round((event.clientX - rect.left - 8) / TIMELINE_FRAME_WIDTH), 0, animation.duration);
  moveKeyframe(draggingTimelineKey.type, draggingTimelineKey.targetId, draggingTimelineKey.oldFrame, frame, draggingTimelineKey.frameGroup);
  draggingTimelineKey = null;
});

document.addEventListener('keydown', event => {
  if (projectState.editorMode !== 'animation') return;
  const target = event.target;
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  if (typing) return;

  const lowerKey = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && lowerKey === 'c') {
    if (copySelectedTimelineFrames()) event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && lowerKey === 'v') {
    if (pasteTimelineFrames()) event.preventDefault();
  }
});

requestAnimationFrame(playbackLoop);



