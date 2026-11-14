(function initializeDiagnostics() {
  "use strict";

  const MAX_ENTRIES = 250;
  const entries = [];

  function serializeDetail(detail) {
    if (detail === undefined) return "";
    if (detail instanceof Error) {
      return detail.stack || `${detail.name}: ${detail.message}`;
    }
    if (typeof detail === "string") return detail;
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  function log(event, detail = "") {
    const entry = {
      time: new Date().toISOString(),
      event: String(event || "event"),
      detail: serializeDetail(detail),
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
    return entry;
  }

  function getDiagnostics() {
    return {
      version: chrome.runtime?.getManifest?.().version || "unknown",
      url: location.href,
      loggedAt: new Date().toISOString(),
      globals: {
        rooms: Boolean(globalThis.SanGuoShaRooms),
        panelState: Boolean(globalThis.SanGuoShaPanelState),
        lobbyData: Boolean(globalThis.SanGuoShaLobbyData),
        runtimeEventBridge: true,
      },
      panelExists: Boolean(
        document.getElementById("san-guo-sha-rooms-helper-root"),
      ),
      entries: [...entries],
    };
  }

  window.addEventListener("error", (event) => {
    log("window.error", {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    log("window.unhandledrejection", event.reason);
  });

  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "ROOMS_HELPER_GET_DIAGNOSTICS") return undefined;
    sendResponse({ ok: true, diagnostics: getDiagnostics() });
    return undefined;
  });

  globalThis.RoomsHelperDiagnostics = Object.freeze({
    getDiagnostics,
    log,
  });
  log("content.start", {
    readyState: document.readyState,
    url: location.href,
  });
})();
