import assert from "node:assert/strict";
import test from "node:test";

await import("../extension/panel-state.js");

const { clampPanelPosition, normalizePanelState } = globalThis.SanGuoShaPanelState;

test("normalizes saved panel state without trusting malformed values", () => {
  assert.deepEqual(normalizePanelState(null), {
    left: null,
    top: null,
    collapsed: false,
  });
  assert.deepEqual(
    normalizePanelState({ left: "120", top: "invalid", collapsed: 1 }),
    {
      left: 120,
      top: null,
      collapsed: true,
    },
  );
});

test("keeps at least eight pixels of the panel inside the viewport", () => {
  const clamped = clampPanelPosition({
    left: 900,
    top: -20,
    panelWidth: 265,
    panelHeight: 150,
    viewportWidth: 800,
    viewportHeight: 600,
  });

  assert.deepEqual(clamped, { left: 792, top: 8 });
});

test("clamps panel coordinates to the visible viewport", () => {
  const clamped = clampPanelPosition({
    left: 500,
    top: 480,
    panelWidth: 200,
    panelHeight: 100,
    viewportWidth: 640,
    viewportHeight: 520,
  });

  assert.deepEqual(clamped, { left: 500, top: 480 });
});
