import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const backgroundSource = readFileSync(
  new URL("../extension/background.js", import.meta.url),
  "utf8",
);

function createHarness() {
  const commands = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    chrome: {
      action: {
        setBadgeBackgroundColor: async () => undefined,
        setBadgeText: async () => undefined,
      },
      debugger: {
        attach: async () => undefined,
        detach: async () => undefined,
        sendCommand: async (_target, method) => {
          commands.push(method);
          if (method === "Runtime.evaluate") {
            return { result: { value: 1 } };
          }
          return {};
        },
        onDetach: { addListener() {} },
      },
      runtime: { onMessage: { addListener() {} } },
      storage: {
        local: { get: async () => ({}), set: async () => undefined },
        session: {
          get: async () => ({}),
          set: async () => undefined,
        },
      },
      tabs: {
        get: async () => ({ id: 17, active: true, windowId: 2 }),
        sendMessage: async () => undefined,
        onRemoved: { addListener() {} },
        onUpdated: { addListener() {} },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(backgroundSource, context, {
    filename: "extension/background.js",
  });
  return { context, commands };
}

test("prepares the debugger only once per tab session", async () => {
  const { context, commands } = createHarness();

  await vm.runInContext("ensureDebugger(17)", context);
  await vm.runInContext("ensureDebugger(17)", context);

  assert.deepEqual(commands, ["Runtime.evaluate"]);
});

test("attaches once and reuses the prepared tab session", async () => {
  const { context, commands } = createHarness();
  context.chrome.debugger.attach = async () => {
    commands.push("attach");
  };
  context.chrome.debugger.sendCommand = async (_target, method) => {
    commands.push(method);
    if (method === "Runtime.evaluate") throw new Error("not attached");
    return {};
  };

  await vm.runInContext("ensureDebugger(17)", context);
  await vm.runInContext("ensureDebugger(17)", context);

  assert.deepEqual(commands, [
    "Runtime.evaluate",
    "attach",
  ]);
});
