(function initializeEditorUiModule() {
  const modules = window.FrogmakerModules = window.FrogmakerModules || {};
  const uiModule = modules.ui = modules.ui || {};
  let noticeTimer = null;
  const perfState = {
    enabled: false,
    samples: [],
    slowEvents: [],
    counters: {},
    lastSummary: null,
    panelTimer: null,
    frameStart: null,
    currentFrame: null
  };

  function ensureNoticeHost() {
    let host = document.getElementById('editor-toast');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'editor-toast';
    host.style.position = 'fixed';
    host.style.right = '18px';
    host.style.bottom = '18px';
    host.style.maxWidth = '360px';
    host.style.padding = '10px 12px';
    host.style.borderRadius = '10px';
    host.style.background = 'rgba(18, 24, 31, 0.96)';
    host.style.color = '#f5f7fa';
    host.style.font = '13px/1.45 "Segoe UI", sans-serif';
    host.style.boxShadow = '0 14px 30px rgba(0,0,0,0.35)';
    host.style.zIndex = '9999';
    host.style.display = 'none';
    document.body.appendChild(host);
    return host;
  }

  function notify(message, type = 'info', timeoutMs = 4200) {
    const host = ensureNoticeHost();
    host.textContent = String(message || 'Operacion completada.');
    host.style.display = 'block';
    host.style.border = type === 'error'
      ? '1px solid rgba(255, 110, 110, 0.55)'
      : '1px solid rgba(90, 172, 255, 0.35)';
    if (noticeTimer) window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      host.style.display = 'none';
    }, timeoutMs);
  }

  function setLoading(visible, message = 'Procesando...') {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.textContent = message;
    overlay.style.display = visible ? 'flex' : 'none';
  }

  async function runEditorAction(label, action) {
    try {
      return await action();
    } catch (error) {
      console.error(`[Frogmaker:${label}]`, error);
      notify(`${label}: ${error && error.message ? error.message : error}`, 'error');
      throw error;
    }
  }

  function nowMs() {
    return (window.performance && typeof window.performance.now === 'function')
      ? window.performance.now()
      : Date.now();
  }

  function ensurePerfPanel() {
    let panel = document.getElementById('perf-profiler-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'perf-profiler-panel';
    panel.style.position = 'fixed';
    panel.style.left = '18px';
    panel.style.bottom = '18px';
    panel.style.width = '350px';
    panel.style.maxHeight = '55vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '12px';
    panel.style.borderRadius = '12px';
    panel.style.background = 'rgba(12, 16, 22, 0.96)';
    panel.style.border = '1px solid rgba(100, 180, 255, 0.25)';
    panel.style.color = '#e8eef5';
    panel.style.font = '12px/1.45 "Segoe UI", sans-serif';
    panel.style.boxShadow = '0 16px 34px rgba(0,0,0,0.38)';
    panel.style.zIndex = '9998';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <strong>Profiler</strong>
        <div style="display:flex;gap:6px;">
          <button id="perf-profiler-copy" type="button" style="background:#17324a;color:#e8eef5;border:1px solid rgba(115,182,255,.28);border-radius:8px;padding:4px 8px;cursor:pointer;">Copiar</button>
          <button id="perf-profiler-clear" type="button" style="background:#2a1f1f;color:#f4eaea;border:1px solid rgba(255,120,120,.2);border-radius:8px;padding:4px 8px;cursor:pointer;">Limpiar</button>
          <button id="perf-profiler-close" type="button" style="background:#1b232e;color:#dce7f1;border:1px solid rgba(255,255,255,.09);border-radius:8px;padding:4px 8px;cursor:pointer;">Cerrar</button>
        </div>
      </div>
      <pre id="perf-profiler-output" style="margin:0;white-space:pre-wrap;"></pre>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#perf-profiler-copy').onclick = async () => {
      const text = getPerformanceReport();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          notify('Reporte del profiler copiado.', 'info', 1800);
        } else {
          throw new Error('Clipboard no disponible');
        }
      } catch (_error) {
        window.prompt('Copia este reporte:', text);
      }
    };
    panel.querySelector('#perf-profiler-clear').onclick = () => {
      clearPerformanceStats();
      updatePerformancePanel();
    };
    panel.querySelector('#perf-profiler-close').onclick = () => {
      togglePerformanceProfiler(false);
    };
    return panel;
  }

  function summarizeSamples() {
    const recent = perfState.samples.slice(-120);
    if (!recent.length) return null;
    const average = recent.reduce((sum, item) => sum + item.totalMs, 0) / recent.length;
    const slowFrames = recent.filter(item => item.totalMs >= 16.7).length;
    const maxFrame = recent.reduce((max, item) => Math.max(max, item.totalMs), 0);
    const latest = recent[recent.length - 1];
    const stageTotals = {};
    recent.forEach(sample => {
      Object.entries(sample.stages || {}).forEach(([stage, duration]) => {
        stageTotals[stage] = (stageTotals[stage] || 0) + duration;
      });
    });
    const topStages = Object.entries(stageTotals)
      .map(([stage, total]) => ({ stage, avg: total / recent.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 6);
    const counters = {};
    recent.forEach(sample => {
      Object.entries(sample.counters || {}).forEach(([key, value]) => {
        counters[key] = Math.max(counters[key] || 0, value);
      });
    });
    perfState.lastSummary = { average, slowFrames, maxFrame, latest, topStages, counters, sampleCount: recent.length };
    return perfState.lastSummary;
  }

  function getPerformanceReport() {
    const summary = summarizeSamples();
    if (!summary) return 'Profiler sin datos todavía.';
    const latest = summary.latest;
    const topStages = summary.topStages.map(item => `${item.stage}: ${item.avg.toFixed(2)} ms`).join('\n');
    const counters = Object.entries(summary.counters).map(([key, value]) => `${key}: ${value}`).join('\n');
    const slowEvents = perfState.slowEvents.slice(-10).map(item =>
      `${item.kind} ${item.label} - ${item.durationMs.toFixed(2)} ms${item.meta ? ` - ${item.meta}` : ''}`
    ).join('\n');
    return [
      'Frogmaker Profiler Report',
      `Frames analizados: ${summary.sampleCount}`,
      `Promedio frame: ${summary.average.toFixed(2)} ms`,
      `Peor frame: ${summary.maxFrame.toFixed(2)} ms`,
      `Frames lentos (>16.7 ms): ${summary.slowFrames}/${summary.sampleCount}`,
      '',
      'Ultimo frame:',
      `Total: ${latest.totalMs.toFixed(2)} ms`,
      ...Object.entries(latest.stages || {}).map(([stage, duration]) => `${stage}: ${duration.toFixed(2)} ms`),
      ...Object.entries(latest.counters || {}).map(([key, value]) => `${key}: ${value}`),
      '',
      'Etapas promedio (top):',
      topStages || 'Sin etapas',
      '',
      'Picos de complejidad:',
      counters || 'Sin contadores',
      '',
      'Eventos lentos recientes:',
      slowEvents || 'Sin eventos lentos'
    ].join('\n');
  }

  function updatePerformancePanel() {
    const panel = ensurePerfPanel();
    const output = panel.querySelector('#perf-profiler-output');
    const summary = summarizeSamples();
    if (!summary) {
      output.textContent = 'Esperando datos...';
      return;
    }
    output.textContent = getPerformanceReport();
  }

  function recordSlowEvent(kind, label, durationMs, meta = '') {
    perfState.slowEvents.push({ kind, label, durationMs, meta, at: Date.now() });
    if (perfState.slowEvents.length > 40) perfState.slowEvents.shift();
  }

  function togglePerformanceProfiler(forceState) {
    perfState.enabled = typeof forceState === 'boolean' ? forceState : !perfState.enabled;
    const panel = ensurePerfPanel();
    panel.style.display = perfState.enabled ? 'block' : 'none';
    if (perfState.enabled) {
      updatePerformancePanel();
      if (!perfState.panelTimer) {
        perfState.panelTimer = window.setInterval(updatePerformancePanel, 1000);
      }
    } else if (perfState.panelTimer) {
      window.clearInterval(perfState.panelTimer);
      perfState.panelTimer = null;
    }
    return perfState.enabled;
  }

  function clearPerformanceStats() {
    perfState.samples = [];
    perfState.slowEvents = [];
    perfState.counters = {};
    perfState.lastSummary = null;
    perfState.currentFrame = null;
    perfState.frameStart = null;
  }

  function beginFrame(label = 'render') {
    if (!perfState.enabled) return null;
    const start = nowMs();
    perfState.frameStart = start;
    perfState.currentFrame = {
      label,
      startedAt: start,
      stages: {},
      counters: {}
    };
    return perfState.currentFrame;
  }

  function measureStage(name, fn) {
    if (!perfState.enabled || !perfState.currentFrame) return fn();
    const start = nowMs();
    try {
      return fn();
    } finally {
      perfState.currentFrame.stages[name] = (perfState.currentFrame.stages[name] || 0) + (nowMs() - start);
    }
  }

  function setCounter(name, value) {
    if (!perfState.enabled || !perfState.currentFrame) return;
    perfState.currentFrame.counters[name] = value;
    perfState.counters[name] = Math.max(perfState.counters[name] || 0, value);
  }

  function endFrame(extra = {}) {
    if (!perfState.enabled || !perfState.currentFrame) return null;
    const finishedAt = nowMs();
    const sample = {
      label: perfState.currentFrame.label,
      totalMs: finishedAt - perfState.currentFrame.startedAt,
      stages: Object.assign({}, perfState.currentFrame.stages),
      counters: Object.assign({}, perfState.currentFrame.counters, extra.counters || {}),
      at: Date.now()
    };
    perfState.samples.push(sample);
    if (perfState.samples.length > 240) perfState.samples.shift();
    if (sample.totalMs >= 16.7) {
      recordSlowEvent('frame', sample.label, sample.totalMs, `triangles=${sample.counters.meshTriangles || 0}`);
    }
    perfState.currentFrame = null;
    perfState.frameStart = null;
    return sample;
  }

  async function measureAction(label, fn, meta = '') {
    const start = nowMs();
    try {
      return await fn();
    } finally {
      const durationMs = nowMs() - start;
      if (durationMs >= 12) recordSlowEvent('action', label, durationMs, meta);
      if (perfState.enabled) updatePerformancePanel();
    }
  }

  if (!window.__frogmakerGlobalErrorsInstalled) {
    window.__frogmakerGlobalErrorsInstalled = true;
    window.addEventListener('error', event => {
      const message = event && event.error && event.error.message
        ? event.error.message
        : (event && event.message) || 'Error inesperado';
      notify(message, 'error');
    });
    window.addEventListener('unhandledrejection', event => {
      const reason = event && event.reason;
      const message = reason && reason.message ? reason.message : String(reason || 'Operacion rechazada');
      notify(message, 'error');
    });
  }

  uiModule.notify = notify;
  uiModule.runEditorAction = runEditorAction;
  uiModule.setLoading = setLoading;
  uiModule.profiler = {
    beginFrame,
    measureStage,
    setCounter,
    endFrame,
    toggle: togglePerformanceProfiler,
    clear: clearPerformanceStats,
    getReport: getPerformanceReport,
    measureAction,
    updatePanel: updatePerformancePanel,
    isEnabled: () => perfState.enabled
  };
  window.togglePerformanceProfiler = togglePerformanceProfiler;
  window.copyPerformanceReport = () => {
    const text = getPerformanceReport();
    window.prompt('Copia este reporte:', text);
    return text;
  };
  window.clearPerformanceStats = clearPerformanceStats;

  window.showExportDialog = function() {
    const dialog = document.getElementById('export-dialog-window');
    if (!dialog) return;
    const animation = typeof getCurrentAnimation === 'function' ? getCurrentAnimation() : null;
    if (!animation) {
      alert('Crea o selecciona una animación antes de exportar.');
      return;
    }
    const fpsInput = document.getElementById('export-fps');
    if (fpsInput) fpsInput.value = Math.max(1, Math.round(animation.frameRate || 24));
    dialog.classList.remove('hidden');
  };

  window.hideExportDialog = function() {
    const dialog = document.getElementById('export-dialog-window');
    if (dialog) dialog.classList.add('hidden');
  };

  window.confirmExport = function() {
    const format = document.getElementById('export-format').value;
    const scale = parseFloat(document.getElementById('export-scale').value) || 1;
    const fps = parseInt(document.getElementById('export-fps').value) || 24;
    const bgValue = document.getElementById('export-background').value;

    let background = { value: 'transparent', color: null };
    if (bgValue === 'white') background = { value: 'white', color: '#ffffff' };
    if (bgValue === 'black') background = { value: 'black', color: '#000000' };

    hideExportDialog();

    if (typeof exportAnimationMedia === 'function') {
      exportAnimationMedia(format, { scale, fps, background });
    }
  };
})();
