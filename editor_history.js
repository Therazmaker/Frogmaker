(function initializeEditorHistoryModule() {
  const modules = window.FrogmakerModules = window.FrogmakerModules || {};
  const stateModule = modules.state;
  const historyModule = modules.history = modules.history || {};

  function getRuntime() {
    return stateModule.getRuntime();
  }

  function captureUndoState() {
    return JSON.stringify(modules.projectIO.serializeProjectData());
  }

  function pushUndoSnapshot() {
    const runtime = getRuntime();
    if (runtime.isRestoringHistory) return;
    const snapshot = captureUndoState();
    if (runtime.undoStack.length > 0 && runtime.undoStack[runtime.undoStack.length - 1] === snapshot) return;
    runtime.undoStack = [...runtime.undoStack, snapshot];
    if (runtime.undoStack.length > 80) {
      runtime.undoStack = runtime.undoStack.slice(runtime.undoStack.length - 80);
    }
  }

  async function undoLastAction() {
    const runtime = getRuntime();
    if (runtime.undoStack.length <= 1) return;
    const nextUndoStack = runtime.undoStack.slice(0, -1);
    const previous = nextUndoStack[nextUndoStack.length - 1];
    if (!previous) return;
    runtime.undoStack = nextUndoStack;
    await modules.projectIO.loadProjectData(JSON.parse(previous), { resetUndo: false });
  }

  historyModule.captureUndoState = captureUndoState;
  historyModule.pushUndoSnapshot = pushUndoSnapshot;
  historyModule.undoLastAction = undoLastAction;
})();
