const preparedTabs = new Set();
const lastClickAt = new Map();
const backgroundEntries = [];

function debugLog(event, detail = "") {
  let serialized = "";
  if (detail instanceof Error) {
    serialized = detail.stack || detail.message;
  } else if (typeof detail === "string") {
    serialized = detail;
  } else if (detail !== undefined) {
    try {
      serialized = JSON.stringify(detail);
    } catch {
      serialized = String(detail);
    }
  }
  backgroundEntries.push({
    time: new Date().toISOString(),
    event: String(event || "event"),
    detail: serialized,
  });
  if (backgroundEntries.length > 250) backgroundEntries.shift();
}

function normalizeError(error) {
  const message = error?.message || String(error || "未知错误");
  debugLog("error", error?.stack || message);
  return message;
}

async function setBadge(tabId, text, color = "#4f866b") {
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: String(text || "") }).catch(
      () => undefined,
    ),
    chrome.action
      .setBadgeBackgroundColor({ tabId, color })
      .catch(() => undefined),
  ]);
}

async function ensureDebugger(tabId) {
  if (!Number.isInteger(tabId)) {
    throw new Error("没有找到当前游戏标签页");
  }
  if (preparedTabs.has(tabId)) return;

  let attached = false;
  try {
    await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
      expression: "1",
      returnByValue: true,
    });
    attached = true;
  } catch {
    attached = false;
  }

  if (!attached) {
    await chrome.debugger.attach({ tabId }, "1.3");
    debugLog("debugger.attached", { tabId });
  }
  preparedTabs.add(tabId);
}

async function clickLobbyPoint(tabId, point, kind) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error("房间助手收到无效点击坐标");
  }
  const key = `${tabId}:${kind || "point"}`;
  const now = Date.now();
  if (now - Number(lastClickAt.get(key) || 0) < 700) {
    return { ok: true, skipped: true };
  }
  lastClickAt.set(key, now);
  debugLog("click", { tabId, kind, point });

  await ensureDebugger(tabId);
  const base = {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  };
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", base);
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
    ...base,
    type: "mouseReleased",
    buttons: 0,
  });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderTabId = sender.tab?.id;
  if (message?.type === "ROOMS_HELPER_GET_BACKGROUND_DIAGNOSTICS") {
    sendResponse({
      ok: true,
      diagnostics: {
        version: chrome.runtime.getManifest().version,
        loggedAt: new Date().toISOString(),
        preparedTabs: [...preparedTabs],
        entries: [...backgroundEntries],
      },
    });
    return undefined;
  }
  debugLog("message", {
    type: message?.type || "unknown",
    tabId: senderTabId ?? null,
  });

  if (message?.type === "ROOMS_HELPER_CLICK") {
    const tabId = senderTabId ?? message.tabId;
    clickLobbyPoint(tabId, message.point, message.kind)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: normalizeError(error) }),
      );
    return true;
  }

  if (message?.type === "ROOMS_HELPER_STATUS") {
    const tabId = senderTabId;
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false });
      return undefined;
    }
    const badge = message.error ? "!" : "";
    setBadge(tabId, badge, message.error ? "#8f554a" : "#4f866b").catch(
      () => undefined,
    );
    sendResponse({ ok: true });
    return undefined;
  }

  return undefined;
});

chrome.debugger.onDetach.addListener((source) => {
  if (!Number.isInteger(source.tabId)) return;
  debugLog("debugger.detached", { tabId: source.tabId });
  preparedTabs.delete(source.tabId);
  setBadge(source.tabId, "").catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  preparedTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  preparedTabs.delete(tabId);
  setBadge(tabId, "").catch(() => undefined);
});
