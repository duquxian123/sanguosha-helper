import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

await import("../extension/lobby-data.js");

const runtimeSource = readFileSync(
  new URL("../extension/lobby-runtime.js", import.meta.url),
  "utf8",
);

function createHarness({ waitingSelected = false } = {}) {
  const listeners = new Map();
  const responses = [];
  const filterSelections = [];
  let tableListHandler = null;
  let enterPageRequests = 0;
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  class Sprite {
    constructor() {
      this.destroyed = false;
      this.visible = true;
      this.graphics = {
        operations: [],
        clear() {
          this.operations.length = 0;
        },
        drawRect(...args) {
          this.operations.push(args);
        },
      };
    }

    destroy() {
      this.destroyed = true;
    }
  }

  const manager = {
    tableList: [
      {
        TableID: 63645,
        TableName: "身份标准",
        TableGameTimer: 10,
        TableNowPlayer: 8,
        TableMaxPlayer: 8,
        TableNowStats: 1,
      },
      {
        TableID: 63832,
        TableName: "身份标准",
        TableGameTimer: 20,
        TableNowPlayer: 5,
        TableMaxPlayer: 8,
        TableNowStats: 1,
      },
    ],
    Ged: {
      on(_type, _context, handler) {
        tableListHandler = handler;
      },
      off() {
        tableListHandler = null;
      },
    },
    EnterPageReq() {
      enterPageRequests += 1;
    },
  };
  const rows = manager.tableList.map((table) => ({
    tableInfo: table,
    visible: true,
    width: 900,
    height: 28,
    children: [],
    addChild(child) {
      this.children.push(child);
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
    },
  }));
  const roomWindow = {
    roomUIS: rows,
    hallManager: manager,
    isWaitCheckBox: { selected: waitingSelected },
    modeId: 31,
    groupId: 1,
    onChangeHandler() {
      filterSelections.push(this.isWaitCheckBox.selected);
      manager.EnterPageReq();
    },
  };
  const context = {
    console,
    setTimeout: (callback) => {
      callback();
      return 1;
    },
    clearTimeout() {},
    queueMicrotask,
    CustomEvent,
    SanGuoShaLobbyData: globalThis.SanGuoShaLobbyData,
    Laya: {
      stage: { _children: [roomWindow] },
      Sprite,
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatchEvent(event) {
      if (event.type === "__san_guo_sha_lobby_response_v1__") {
        responses.push(event.detail);
      }
      listeners.get(event.type)?.(event);
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(runtimeSource, context, {
    filename: "extension/lobby-runtime.js",
  });
  return {
    context,
    manager,
    responses,
    filterSelections,
    roomWindow,
    rows,
    emitTableList() {
      tableListHandler?.();
    },
    enterPageRequests() {
      return enterPageRequests;
    },
  };
}

async function flushAsync() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

test("manual refresh enables waiting filter and renders runtime highlights", async () => {
  const harness = createHarness();
  harness.context.dispatchEvent(
    new harness.context.CustomEvent("__san_guo_sha_lobby_command_v1__", {
      detail: {
        id: "refresh-1",
        command: "refresh",
        settings: { thresholdSeconds: 15 },
      },
    }),
  );
  await flushAsync();

  assert.equal(harness.roomWindow.isWaitCheckBox.selected, true);
  assert.equal(harness.enterPageRequests(), 1);
  assert.equal(harness.responses[0].ok, true);
  assert.equal(harness.rows[0].__sanGuoShaRoomsHighlight.visible, true);
  assert.equal(
    harness.rows[0].__sanGuoShaRoomsHighlight.graphics.operations[0][5],
    "rgba(82,221,128,0.95)",
  );
  assert.equal(harness.rows[1].__sanGuoShaRoomsHighlight, undefined);
});

test("checked waiting filter is cancelled and checked again before refresh", async () => {
  const harness = createHarness({ waitingSelected: true });
  harness.context.dispatchEvent(
    new harness.context.CustomEvent("__san_guo_sha_lobby_command_v1__", {
      detail: {
        id: "refresh-checked",
        command: "refresh",
        settings: { thresholdSeconds: 15 },
      },
    }),
  );
  await flushAsync();

  assert.deepEqual(harness.filterSelections, [false, true]);
  assert.equal(harness.roomWindow.isWaitCheckBox.selected, true);
  assert.equal(harness.enterPageRequests(), 2);
  assert.equal(harness.responses[0].ok, true);
});

test("room-list events update highlights without another refresh request", async () => {
  const harness = createHarness();
  harness.context.dispatchEvent(
    new harness.context.CustomEvent("__san_guo_sha_lobby_command_v1__", {
      detail: {
        id: "refresh-2",
        command: "refresh",
        settings: { thresholdSeconds: 15 },
      },
    }),
  );
  await flushAsync();
  const requestsAfterRefresh = harness.enterPageRequests();

  harness.manager.tableList[0].TableGameTimer = 20;
  harness.manager.tableList[1].TableGameTimer = 5;
  harness.emitTableList();
  await Promise.resolve();

  assert.equal(harness.enterPageRequests(), requestsAfterRefresh);
  assert.equal(harness.rows[0].__sanGuoShaRoomsHighlight.visible, false);
  assert.equal(harness.rows[1].__sanGuoShaRoomsHighlight.visible, true);
});
