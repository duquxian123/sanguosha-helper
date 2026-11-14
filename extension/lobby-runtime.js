(function initializeLobbyRuntime() {
  "use strict";

  const UPDATE_EVENT = "__san_guo_sha_lobby_update_v1__";
  const COMMAND_EVENT = "__san_guo_sha_lobby_command_v1__";
  const RESPONSE_EVENT = "__san_guo_sha_lobby_response_v1__";
  const TABLE_LIST_EVENT = "GET_TABLELIST";
  const markerProperty = "__sanGuoShaRoomsHighlight";
  const data = globalThis.SanGuoShaLobbyData;
  if (!data) return;

  let adapter = null;
  let subscribedManager = null;
  let renderEnabled = false;
  let thresholdSeconds = 15;
  let filterSettings = data.DEFAULT_FILTERS;
  let fallbackTimer = null;
  let localPollTimer = null;
  let eventPublishQueued = false;
  const listenerContext = {};

  function dispatch(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function unsubscribe() {
    if (subscribedManager?.Ged?.off) {
      subscribedManager.Ged.off(
        TABLE_LIST_EVENT,
        listenerContext,
        handleTableList,
      );
    }
    subscribedManager = null;
  }

  function stopLocalPolling() {
    if (localPollTimer) clearInterval(localPollTimer);
    localPollTimer = null;
  }

  function startLocalPolling() {
    if (localPollTimer) return;
    localPollTimer = setInterval(() => {
      if (renderEnabled) publish();
    }, 250);
  }

  function clearHighlights() {
    for (const row of adapter?.rows || []) {
      const marker = row?.[markerProperty];
      if (!marker) continue;
      try {
        if (row.removeChild) row.removeChild(marker);
        if (!marker.destroyed) marker.destroy();
      } catch {
        // The game may already have recycled this row.
      }
      try {
        delete row[markerProperty];
      } catch {
        row[markerProperty] = null;
      }
    }
  }

  function ensureMarker(row) {
    if (row?.[markerProperty] && !row[markerProperty].destroyed) {
      return row[markerProperty];
    }
    if (!window.Laya?.Sprite) return null;
    const marker = new window.Laya.Sprite();
    marker.name = "rooms-helper-highlight";
    marker.mouseEnabled = false;
    marker.mouseThrough = true;
    marker.zOrder = 99999;
    marker[markerProperty] = true;
    row[markerProperty] = marker;
    if (typeof row.addChild === "function") row.addChild(marker);
    return marker;
  }

  function renderHighlights(snapshot) {
    if (!renderEnabled || !adapter) return;
    const eligibleIds = new Set(
      snapshot.highlights.map((room) => room.tableId),
    );
    for (const row of adapter.rows) {
      const tableId = String(row?.tableInfo?.TableID ?? "");
      const eligible = row?.visible && eligibleIds.has(tableId);
      const marker = eligible ? ensureMarker(row) : row?.[markerProperty];
      if (!marker || marker.destroyed) continue;
      marker.visible = eligible;
      if (!eligible) continue;
      marker.graphics.clear();
      marker.graphics.drawRect(
        0,
        0,
        Math.max(1, Number(row.width) || 1),
        Math.max(1, Number(row.height) || 1),
        "rgba(80,210,120,0.13)",
        "rgba(82,221,128,0.95)",
        2,
      );
    }
  }

  function publish() {
    if (!adapter) {
      dispatch(UPDATE_EVENT, {
        available: false,
        roomCount: 0,
        rooms: [],
        highlights: [],
      });
      return null;
    }
    const snapshot = data.buildSnapshot(adapter, {
      thresholdSeconds,
      filters: filterSettings,
    });
    snapshot.source = "runtime";
    snapshot.waitingOnly = Boolean(
      adapter.windowObject.isWaitCheckBox?.selected,
    );
    renderHighlights(snapshot);
    dispatch(UPDATE_EVENT, snapshot);
    return snapshot;
  }

  function handleTableList() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (eventPublishQueued) return;
    eventPublishQueued = true;
    queueMicrotask(() => {
      eventPublishQueued = false;
      publish();
    });
  }

  function subscribe(nextAdapter) {
    if (subscribedManager === nextAdapter.manager) return true;
    unsubscribe();
    const nextDispatcher = nextAdapter.manager.Ged;
    if (!nextDispatcher?.on) return false;
    nextDispatcher.on(TABLE_LIST_EVENT, listenerContext, handleTableList);
    subscribedManager = nextAdapter.manager;
    return true;
  }

  function discover() {
    const next = data.findAdapter(window.Laya?.stage);
    if (!next) return null;
    if (adapter?.windowObject !== next.windowObject) clearHighlights();
    adapter = next;
    if (subscribe(next)) stopLocalPolling();
    else startLocalPolling();
    return next;
  }

  function ensureWaitingFilter() {
    const windowObject = adapter.windowObject;
    const manager = adapter.manager;
    const modeId =
      Number(windowObject.modeId) || Number(window.V2t?.GetModeType?.());
    const groupId =
      Number(windowObject.groupId) || Number(window.V2t?.GetGroupID?.());
    const checkbox = windowObject.isWaitCheckBox;
    if (!checkbox) {
      manager.EnterPageReq?.(modeId, groupId);
      return;
    }
    if (!checkbox.selected) {
      checkbox.selected = true;
      if (typeof windowObject.onChangeHandler === "function") {
        windowObject.onChangeHandler();
        return;
      }
    }
    manager.EnterPageReq?.(modeId, groupId);
  }

  function response(id, payload) {
    dispatch(RESPONSE_EVENT, { id, ...payload });
  }

  function handleCommand(event) {
    const detail = event?.detail;
    if (!detail || typeof detail.id !== "string") return;
    const type = detail.command;
    try {
      if (type === "refresh") {
        if (!discover()) {
          response(detail.id, {
            ok: false,
            error: "没有找到大厅房间列表",
          });
          return;
        }
        renderEnabled = true;
        ensureWaitingFilter();
        const snapshot = data.buildSnapshot(adapter, {
          thresholdSeconds,
          filters: filterSettings,
        });
        snapshot.source = "runtime";
        renderHighlights(snapshot);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => {
          fallbackTimer = null;
          publish();
        }, 900);
        response(detail.id, { ok: true, snapshot });
        return;
      }
      if (type === "setSettings") {
        thresholdSeconds = Math.max(
          1,
          Number(detail.settings?.thresholdSeconds) || thresholdSeconds,
        );
        filterSettings = data.normalizeFilters(detail.settings?.filters);
        discover();
        const snapshot = publish();
        response(detail.id, { ok: true, snapshot });
        return;
      }
      if (type === "stopRender") {
        renderEnabled = false;
        stopLocalPolling();
        clearHighlights();
        unsubscribe();
        adapter = null;
        response(detail.id, { ok: true });
        return;
      }
      response(detail.id, { ok: false, error: "未知的大厅命令" });
    } catch (error) {
      response(detail.id, {
        ok: false,
        error: error?.message || "大厅命令执行失败",
      });
    }
  }

  window.addEventListener(COMMAND_EVENT, handleCommand);
  window.addEventListener("pagehide", () => {
    renderEnabled = false;
    stopLocalPolling();
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    clearHighlights();
    unsubscribe();
  });
})();
