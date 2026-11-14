(function initializePanelState(global) {
  "use strict";

  const MIN_VISIBLE_PX = 8;

  function finiteOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizePanelState(rawState) {
    return {
      left: finiteOrNull(rawState?.left),
      top: finiteOrNull(rawState?.top),
      collapsed: Boolean(rawState?.collapsed),
    };
  }

  function clampPanelPosition({
    left,
    top,
    panelWidth,
    panelHeight,
    viewportWidth,
    viewportHeight,
    margin = MIN_VISIBLE_PX,
  }) {
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const safePanelWidth = Math.max(1, Number(panelWidth) || 1);
    const safePanelHeight = Math.max(1, Number(panelHeight) || 1);
    const safeMargin = Math.max(0, Number(margin) || 0);
    const maxLeft = Math.max(safeMargin, safeViewportWidth - safeMargin);
    const maxTop = Math.max(safeMargin, safeViewportHeight - safeMargin);

    return {
      left: Math.min(
        Math.max(safeMargin, Number(left) || 0),
        Math.max(safeMargin, maxLeft),
      ),
      top: Math.min(
        Math.max(safeMargin, Number(top) || 0),
        Math.max(safeMargin, maxTop),
      ),
    };
  }

  global.SanGuoShaPanelState = Object.freeze({
    MIN_VISIBLE_PX,
    clampPanelPosition,
    normalizePanelState,
  });
})(globalThis);
