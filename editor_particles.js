// editor_particles.js
// Procedural Particle System Module

const ParticleManager = (function() {
  
  // Rango pseudo-aleatorio determinista muy rapido (basado en Mulberry32)
  function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }

  // Linear interpolation
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Get the default configuration for an emitter
  function getDefaultConfig() {
    return {
      type: 'box', // 'box', 'radial', 'directional'
      rate: 30, // particles per second
      boxWidth: 200,
      boxHeight: 20,
      lifetime: 2.0,
      lifetimeVar: 0.5,
      speed: 100,
      speedVar: 20,
      angle: 90, // degrees
      angleVar: 10,
      gravity: 500, // positive Y is down
      startScale: 1.0,
      endScale: 0.5,
      startAlpha: 1.0,
      endAlpha: 0.0,
      prewarm: true // Whether to simulate from t=0 so the system is fully populated
    };
  }

  // Configuración de un emisor de grupo
  function getGroupEmitterConfig(groupPath) {
    if (!projectState.particleEmitters) return null;
    return projectState.particleEmitters[groupPath] || null;
  }

  function setGroupEmitterConfig(groupPath, conf) {
    if (!projectState.particleEmitters) projectState.particleEmitters = {};
    projectState.particleEmitters[groupPath] = Object.assign({}, getDefaultConfig(), conf);
  }

  function toggleGroupEmitter(groupPath) {
    if (!projectState.particleEmitters) projectState.particleEmitters = {};
    if (projectState.particleEmitters[groupPath]) {
      delete projectState.particleEmitters[groupPath];
    } else {
      projectState.particleEmitters[groupPath] = getDefaultConfig();
    }
  }

  // Evaluate the state of particle 'i' at absolute time 'elapsed_T'
  function evalParticle(i, T, config, texturesCount) {
    const t_spawn = i / Math.max(0.1, config.rate);
    const age = T - t_spawn;
    
    // Si aun no nace
    if (age <= 0) return null;

    // Semilla determinista unica para esta particula en base a 'i'
    const rnd = mulberry32(i + 1337);

    const actualLifetime = config.lifetime + (rnd() * 2 - 1) * (config.lifetimeVar || 0);
    // Si ya murio
    if (age > actualLifetime) return null;

    // Ratio de vida (0 a 1)
    const t = age / actualLifetime;

    const angleDeg = config.angle + (rnd() * 2 - 1) * (config.angleVar || 0);
    const angleRad = angleDeg * Math.PI / 180;
    const actualSpeed = config.speed + (rnd() * 2 - 1) * (config.speedVar || 0);

    let oX = 0, oY = 0;
    if (config.type === 'box') {
      oX = (rnd() - 0.5) * (config.boxWidth || 0);
      oY = (rnd() - 0.5) * (config.boxHeight || 0);
    } else if (config.type === 'radial') {
      // Ignora box, sale del centro (0,0) u offset radial si hubiese
    }

    const vx = Math.cos(angleRad) * actualSpeed;
    const vy = Math.sin(angleRad) * actualSpeed;

    const currentX = oX + vx * age;
    const currentY = oY + vy * age + 0.5 * (config.gravity || 0) * age * age;
    
    const currentScale = lerp(config.startScale || 1, config.endScale || 1, t);
    const currentAlpha = lerp(config.startAlpha ?? 1, config.endAlpha ?? 0, t);
    
    const texIndex = Math.floor(rnd() * texturesCount);

    return {
      x: currentX,
      y: currentY,
      scale: currentScale,
      alpha: clamp(currentAlpha, 0, 1),
      rotation: angleRad, // Align particle to its movement angle (optional) o start rotation
      texIndex: texIndex
    };
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // Render an emitter's particles based on pure Math instead of physics states.
  function renderEmitter(drawCtx, groupPath, childrenLayers, absoluteTime) {
    const config = getGroupEmitterConfig(groupPath);
    if (!config || childrenLayers.length === 0) return;

    // Use the first child as the anchor for emitter transform
    const anchorLayer = childrenLayers[0];
    if (!anchorLayer) return;

    // Determinar desde que momento la particula debio empezar
    let T = absoluteTime;
    
    // Si no estamos jugando o estamos en rigging, usar un timepo constante largo para que se vea completo.
    // Usaremos un truco: En modo Rig o si es decorativo sin animar, fijarlo en un 'Loop' de 100 segundos
    if (!T || isNaN(T)) {
       T = (performance.now() / 1000) % 100;
       if (config.prewarm) T += config.lifetime; // asegurar que este poblado
    }

    // Calcular cuantas particulas historicas podrian estar vivas en este segundo.
    const maxAlive = Math.ceil(config.rate * (config.lifetime + config.lifetimeVar));
    const currentParticleIndex = Math.floor(T * config.rate);

    drawCtx.save();
    
    // El emitter tomara el transform del primer anchor (asumiendo que todos en el grupo se mueven igual o el anchor marca el origen local)
    drawCtx.translate(anchorLayer.center_x, anchorLayer.center_y);
    drawCtx.rotate(anchorLayer.rotation || 0);

    for (let i = currentParticleIndex - maxAlive; i <= currentParticleIndex; i++) {
       if (i < 0 && !config.prewarm) continue; 
       const p = evalParticle(i, T, config, childrenLayers.length);
       if (p) {
          const texLayer = childrenLayers[p.texIndex];
          if (!texLayer || !texLayer.img_element) continue;

          drawCtx.save();
          drawCtx.globalAlpha = p.alpha;
          // Apply local particle transforms
          drawCtx.translate(p.x, p.y);
          // Opcional: rotar la particula respecto a su trayecto
          // drawCtx.rotate(p.rotation); 
          drawCtx.scale(p.scale, p.scale);
          
          // Centro del sprite = 0,0 localmente
          drawCtx.drawImage(texLayer.img_element, -texLayer.width / 2, -texLayer.height / 2);
          drawCtx.restore();
       }
    }
    drawCtx.restore();
  }

  // Public Interface UI Inspector
  function renderInspector(groupPath) {
    const config = getGroupEmitterConfig(groupPath);
    if (!config) return '';

    // Safe string for UI binding
    const safePath = groupPath.replace(/'/g, "\\'");

    return `
      <div class="props-group">
        <div class="section-title">Emisor (Partículas)</div>
        <div class="inline-actions" style="margin-bottom:8px">
           <button class="clip-btn danger" onclick="ParticleManager.toggleEmitter('${safePath}'); updateLayerList(); updateProps();">Desactivar Emisor</button>
        </div>
        <div class="prop-row">
          <span class="prop-label">Emisión:</span>
          <select onchange="ParticleManager.updateField('${safePath}', 'type', this.value)">
            <option value="box" ${config.type === 'box' ? 'selected' : ''}>Caja</option>
            <option value="radial" ${config.type === 'radial' ? 'selected' : ''}>Radial</option>
          </select>
        </div>
        <div class="prop-row">
          <span class="prop-label">Tasa/Seg:</span>
          <input type="number" step="1" value="${config.rate}" onchange="ParticleManager.updateField('${safePath}', 'rate', +this.value)">
        </div>
        
        <label style="display:block; margin-top:8px; font-size:11px; font-weight:600; color:#5ca0e3">Vida (Lifetime)</label>
        <div class="prop-row">
          <span class="prop-label">Duración:</span>
          <input type="number" step="0.1" value="${config.lifetime}" onchange="ParticleManager.updateField('${safePath}', 'lifetime', +this.value)">
        </div>
        <div class="prop-row">
          <span class="prop-label">Var(+/-):</span>
          <input type="number" step="0.1" value="${config.lifetimeVar}" onchange="ParticleManager.updateField('${safePath}', 'lifetimeVar', +this.value)">
        </div>

        <label style="display:block; margin-top:8px; font-size:11px; font-weight:600; color:#5ca0e3">Box Area</label>
        <div class="prop-row">
          <span class="prop-label">Ancho:</span>
          <input type="number" step="10" value="${config.boxWidth}" onchange="ParticleManager.updateField('${safePath}', 'boxWidth', +this.value)">
        </div>
        <div class="prop-row">
          <span class="prop-label">Alto:</span>
          <input type="number" step="10" value="${config.boxHeight}" onchange="ParticleManager.updateField('${safePath}', 'boxHeight', +this.value)">
        </div>

        <label style="display:block; margin-top:8px; font-size:11px; font-weight:600; color:#5ca0e3">Físicas / Movimiento</label>
        <div class="prop-row">
          <span class="prop-label">Gravedad:</span>
          <input type="number" step="10" value="${config.gravity}" onchange="ParticleManager.updateField('${safePath}', 'gravity', +this.value)">
        </div>
        <div class="prop-row">
          <span class="prop-label">Fuerza Vel:</span>
          <input type="number" step="10" value="${config.speed}" onchange="ParticleManager.updateField('${safePath}', 'speed', +this.value)">
        </div>
        <div class="prop-row">
          <span class="prop-label">Var Veloc:</span>
          <input type="number" step="10" value="${config.speedVar}" onchange="ParticleManager.updateField('${safePath}', 'speedVar', +this.value)">
        </div>
        <div class="prop-row">
          <span class="prop-label">Ángulo:</span>
          <input type="number" step="5" value="${config.angle}" onchange="ParticleManager.updateField('${safePath}', 'angle', +this.value)">
        </div>
        <div class="prop-row">
          <span class="prop-label">Var Ángulo:</span>
          <input type="number" step="5" value="${config.angleVar}" onchange="ParticleManager.updateField('${safePath}', 'angleVar', +this.value)">
        </div>

        <label style="display:block; margin-top:8px; font-size:11px; font-weight:600; color:#5ca0e3">Estilo</label>
        <div style="display:flex; justify-content:space-between;">
           <div class="prop-row" style="flex:1;"><span class="prop-label">Escala In:</span><input type="number" step="0.1" value="${config.startScale}" onchange="ParticleManager.updateField('${safePath}', 'startScale', +this.value)"></div>
           <div class="prop-row" style="flex:1;"><span class="prop-label">Escala Fin:</span><input type="number" step="0.1" value="${config.endScale}" onchange="ParticleManager.updateField('${safePath}', 'endScale', +this.value)"></div>
        </div>
        <div style="display:flex; justify-content:space-between;">
           <div class="prop-row" style="flex:1;"><span class="prop-label">Alfa In:</span><input type="number" step="0.1" value="${config.startAlpha}" onchange="ParticleManager.updateField('${safePath}', 'startAlpha', +this.value)"></div>
           <div class="prop-row" style="flex:1;"><span class="prop-label">Alfa Fin:</span><input type="number" step="0.1" value="${config.endAlpha}" onchange="ParticleManager.updateField('${safePath}', 'endAlpha', +this.value)"></div>
        </div>
      </div>
    `;
  }

  function updateField(groupPath, field, value) {
    if (!projectState.particleEmitters) projectState.particleEmitters = {};
    if (!projectState.particleEmitters[groupPath]) projectState.particleEmitters[groupPath] = getDefaultConfig();
    projectState.particleEmitters[groupPath][field] = value;
    
    // Disparar update general en el editor principal
    if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot();
    if (typeof render === 'function') render();
  }

  // Retornamos modulos publicos
  return {
    toggleEmitter: toggleGroupEmitter,
    isEmitter: (groupPath) => projectState.particleEmitters && !!projectState.particleEmitters[groupPath],
    renderEmitter: renderEmitter,
    renderInspector: renderInspector,
    updateField: updateField
  };

})();
