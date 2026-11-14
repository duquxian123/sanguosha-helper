(function initializeRoomsHelper() {
  "use strict";

  const ROOT_ID = "san-guo-sha-rooms-helper-root";
  const SETTINGS_KEY = "roomsHelperSettings";
  const PANEL_STATE_KEY = "roomsHelperPanelState";
  const RUNTIME_UPDATE_EVENT = "__san_guo_sha_lobby_update_v1__";
  const RUNTIME_COMMAND_EVENT = "__san_guo_sha_lobby_command_v1__";
  const RUNTIME_RESPONSE_EVENT = "__san_guo_sha_lobby_response_v1__";
  const DEFAULT_SETTINGS = Object.freeze({
    targetMode: "身份标准",
    thresholdSeconds: 15,
    filters: {
      full: "any",
      password: "any",
      chat: "any",
      items: "any",
    },
  });
  const DEFAULT_FILTERS = Object.freeze({
    full: "any",
    password: "any",
    chat: "any",
    items: "any",
  });
  const FILTER_VALUES = Object.freeze({
    full: new Set(["any", "notFull", "full"]),
    password: new Set(["any", "none", "has"]),
    chat: new Set(["any", "allowed", "forbidden"]),
    items: new Set(["any", "allowed", "banned"]),
  });
  const diagnostics = globalThis.RoomsHelperDiagnostics;
  diagnostics?.log("content.dependencies", {
    panelState: Boolean(globalThis.SanGuoShaPanelState),
    lobbyData: Boolean(globalThis.SanGuoShaLobbyData),
  });
  if (!globalThis.SanGuoShaPanelState) {
    const failure = document.createElement("div");
    failure.id = ROOT_ID;
    failure.textContent = "房间助手脚本未完整加载，请刷新游戏页面";
    Object.assign(failure.style, {
      position: "fixed",
      right: "16px",
      bottom: "18px",
      zIndex: "2147483647",
      padding: "10px 12px",
      border: "1px solid #b66",
      background: "rgba(24, 12, 12, 0.96)",
      color: "#ffd2d2",
      font: "12px sans-serif",
    });
    document.documentElement.append(failure);
    diagnostics?.log("content.incomplete", {
      panelState: Boolean(globalThis.SanGuoShaPanelState),
    });
    return;
  }
  if (
    document.getElementById(ROOT_ID)
  ) {
    diagnostics?.log("content.already-mounted");
    return;
  }

  const { clampPanelPosition, normalizePanelState } =
    globalThis.SanGuoShaPanelState;

  function normalizeFilters(rawFilters = {}) {
    const normalized =
      globalThis.SanGuoShaLobbyData?.normalizeFilters?.(rawFilters);
    if (normalized) return normalized;
    return Object.fromEntries(
      Object.entries(DEFAULT_FILTERS).map(([key, fallback]) => {
        const value = rawFilters?.[key];
        return [key, FILTER_VALUES[key].has(value) ? value : fallback];
      }),
    );
  }

  function matchesFilters(room, rawSettings = {}) {
    const fallbackMatcher = globalThis.SanGuoShaLobbyData?.matchesFilters;
    if (fallbackMatcher) return fallbackMatcher(room, rawSettings);
    const thresholdSeconds = Number(rawSettings.thresholdSeconds ?? 15);
    const filters = normalizeFilters(rawSettings.filters);
    if (
      room.status !== "等待中" ||
      !Number.isFinite(room.seconds) ||
      room.seconds > thresholdSeconds
    ) {
      return false;
    }
    if (filters.full !== "any") {
      if (room.full === null) return false;
      if (filters.full === "notFull" && room.full) return false;
      if (filters.full === "full" && !room.full) return false;
    }
    if (filters.password !== "any") {
      if (room.hasPassword === null) return false;
      if (filters.password === "none" && room.hasPassword) return false;
      if (filters.password === "has" && !room.hasPassword) return false;
    }
    if (filters.chat !== "any") {
      if (room.forbidChat === null) return false;
      if (filters.chat === "allowed" && room.forbidChat) return false;
      if (filters.chat === "forbidden" && !room.forbidChat) return false;
    }
    if (filters.items !== "any") {
      if (room.banItem === null) return false;
      if (filters.items === "allowed" && room.banItem) return false;
      if (filters.items === "banned" && !room.banItem) return false;
    }
    return true;
  }
  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .root {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      pointer-events: none;
      font: 12px/1.45 "Microsoft YaHei UI", "PingFang SC", sans-serif;
    }
    .panel {
      position: fixed;
      right: 16px;
      bottom: 18px;
      width: 282px;
      overflow: hidden;
      border: 1px solid rgba(220, 184, 101, 0.56);
      border-radius: 4px;
      background: rgba(12, 18, 19, 0.96);
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.45);
      color: #ded5c3;
      pointer-events: auto;
      user-select: none;
    }
    .panel.dragging { box-shadow: 0 20px 58px rgba(0, 0, 0, 0.58); }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 35px;
      padding: 7px 8px 7px 10px;
      border-bottom: 1px solid rgba(220, 184, 101, 0.18);
      background: linear-gradient(120deg, rgba(220, 184, 101, 0.13), transparent);
      cursor: grab;
      touch-action: none;
    }
    .panel.dragging .panel-head { cursor: grabbing; }
    .panel.collapsed .panel-head { border-bottom: 0; }
    .panel.collapsed .body { display: none; }
    .panel-title,
    .panel-actions {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .panel-title { flex: 1; }
    .title {
      overflow: hidden;
      color: #f0d49a;
      font-size: 13px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .header-count {
      display: inline-grid;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      place-items: center;
      border: 1px solid rgba(255, 210, 119, 0.38);
      border-radius: 9px;
      background: rgba(211, 168, 79, 0.13);
      color: #ffd98e;
      font: 10px/1 Georgia, serif;
    }
    .version {
      color: #7f918f;
      font: 10px/1 Georgia, serif;
      white-space: nowrap;
    }
    .collapse {
      display: grid;
      width: 23px;
      height: 23px;
      padding: 0;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.11);
      border-radius: 2px;
      background: rgba(0, 0, 0, 0.16);
      color: #b9c2bd;
      font: 16px/1 Georgia, serif;
      cursor: pointer;
    }
    .collapse:hover { border-color: rgba(220, 184, 101, 0.55); color: #ffe1a3; }
    .collapse:focus-visible,
    .refresh:focus-visible,
    select:focus-visible,
    input:focus-visible {
      outline: 2px solid #e5c678;
      outline-offset: 1px;
    }
    .body { padding: 9px 10px 10px; }
    .controls {
      display: grid;
      grid-template-columns: 1fr 88px;
      gap: 8px;
    }
    label {
      display: grid;
      gap: 4px;
      color: #9fa9a4;
      font-size: 10px;
    }
    select,
    input {
      width: 100%;
      height: 29px;
      box-sizing: border-box;
      border: 1px solid rgba(220, 184, 101, 0.22);
      border-radius: 2px;
      background: rgba(4, 8, 8, 0.62);
      color: #e8dfcc;
      font: 11px "Microsoft YaHei UI", sans-serif;
      outline: none;
    }
    select { padding: 0 7px; }
    input { padding: 0 22px 0 7px; }
    .seconds-field { position: relative; }
    .seconds-field span {
      position: absolute;
      top: 50%;
      right: 7px;
      color: #74817e;
      font-size: 10px;
      transform: translateY(-50%);
      pointer-events: none;
    }
    .filter-note {
      margin-top: 7px;
      color: #788986;
      font-size: 9px;
    }
    .filter-title {
      margin-top: 9px;
      color: #8fa59a;
      font-size: 9px;
      letter-spacing: 0.08em;
    }
    .extra-filters {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      margin-top: 5px;
    }
    .refresh {
      width: 100%;
      min-height: 34px;
      margin-top: 9px;
      border: 1px solid rgba(220, 184, 101, 0.52);
      border-radius: 2px;
      background: linear-gradient(135deg, #9b7437, #5d431d);
      color: #fff0c7;
      font: 700 12px "Microsoft YaHei UI", sans-serif;
      cursor: pointer;
    }
    .refresh:disabled {
      cursor: wait;
      filter: grayscale(0.55);
      opacity: 0.65;
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 9px;
      color: #9dafac;
      font-size: 10px;
    }
    .dot {
      width: 7px;
      height: 7px;
      flex: 0 0 7px;
      border-radius: 50%;
      background: #d8a747;
      box-shadow: 0 0 0 3px rgba(216, 167, 71, 0.12);
    }
    .status-row.ok .dot { background: #65ae7f; box-shadow: 0 0 0 3px rgba(101, 174, 127, 0.13); }
    .status-row.error .dot { background: #c86b58; box-shadow: 0 0 0 3px rgba(200, 107, 88, 0.14); }
    .count {
      margin-top: 7px;
      padding: 6px 8px;
      border-left: 2px solid #d3a84f;
      background: rgba(211, 168, 79, 0.08);
      color: #c8b98f;
      font-size: 10px;
    }
    .count strong { color: #ffd78b; font-size: 16px; }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 6px;
      color: #70817f;
      font-size: 9px;
    }
  `;

  const root = document.createElement("div");
  root.className = "root";
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="panel-head" data-drag-handle>
      <div class="panel-title">
        <span class="title">房间监控</span>
        <span class="header-count" data-header-count>0</span>
      </div>
      <div class="panel-actions">
        <span class="version" data-version></span>
        <button
          class="collapse"
          type="button"
          data-collapse
          aria-expanded="true"
          aria-label="收起房间监控"
          title="收起"
        >−</button>
      </div>
    </div>
    <div class="body">
      <div class="controls">
        <label>
          <span>玩法</span>
          <select data-target-mode>
            <option value="身份标准">身份标准</option>
          </select>
        </label>
        <label>
          <span>高亮上限</span>
          <span class="seconds-field">
            <input data-threshold type="number" min="1" max="99" step="1" />
            <span>秒</span>
          </span>
        </label>
      </div>
      <div class="filter-title">额外筛选</div>
      <div class="extra-filters">
        <label>
          <span>满员</span>
          <select data-filter-full>
            <option value="any">不限</option>
            <option value="notFull">仅未满</option>
            <option value="full">仅已满</option>
          </select>
        </label>
        <label>
          <span>密码</span>
          <select data-filter-password>
            <option value="any">不限</option>
            <option value="none">仅无密码</option>
            <option value="has">仅有密码</option>
          </select>
        </label>
        <label>
          <span>禁聊</span>
          <select data-filter-chat>
            <option value="any">不限</option>
            <option value="allowed">仅允许聊天</option>
            <option value="forbidden">仅禁止聊天</option>
          </select>
        </label>
        <label>
          <span>道具</span>
          <select data-filter-items>
            <option value="any">不限</option>
            <option value="allowed">仅允许道具</option>
            <option value="banned">仅禁用道具</option>
          </select>
        </label>
      </div>
      <div class="filter-note">多个条件同时启用时，需要全部满足</div>
      <button class="refresh" type="button" data-refresh>刷新并检测</button>
      <div class="status-row" data-status-row>
        <span class="dot"></span>
        <span data-status>等待手动刷新</span>
      </div>
      <div class="count">
        <span data-threshold-label>15 秒内</span>符合条件：<strong data-count>0</strong> 个
      </div>
      <div class="meta">
        <span data-refresh-time>尚未刷新</span>
        <span data-source>等待读取</span>
      </div>
    </div>
  `;
  root.append(panel);
  shadow.append(style, root);
  diagnostics?.log("content.panel-created", {
    version: chrome.runtime.getManifest().version,
  });

  const refs = {
    collapse: shadow.querySelector("[data-collapse]"),
    count: shadow.querySelector("[data-count]"),
    dragHandle: shadow.querySelector("[data-drag-handle]"),
    filterChat: shadow.querySelector("[data-filter-chat]"),
    filterFull: shadow.querySelector("[data-filter-full]"),
    filterItems: shadow.querySelector("[data-filter-items]"),
    filterPassword: shadow.querySelector("[data-filter-password]"),
    headerCount: shadow.querySelector("[data-header-count]"),
    refreshButton: shadow.querySelector("[data-refresh]"),
    refreshTime: shadow.querySelector("[data-refresh-time]"),
    source: shadow.querySelector("[data-source]"),
    status: shadow.querySelector("[data-status]"),
    statusRow: shadow.querySelector("[data-status-row]"),
    targetMode: shadow.querySelector("[data-target-mode]"),
    threshold: shadow.querySelector("[data-threshold]"),
    thresholdLabel: shadow.querySelector("[data-threshold-label]"),
    version: shadow.querySelector("[data-version]"),
  };
  refs.version.textContent = `v${chrome.runtime.getManifest().version}`;

  let settings = { ...DEFAULT_SETTINGS };
  let panelState = normalizePanelState(null);
  let dragState = null;
  let resizeSaveTimer = null;
  let manualBusy = false;
  let lastRuntimeSnapshot = null;
  let pendingRuntimeRefresh = null;
  let runtimeCommandSequence = 0;
  const runtimeCommands = new Map();

  function setStatus(message, kind = "") {
    refs.status.textContent = message;
    refs.statusRow.classList.toggle("ok", kind === "ok");
    refs.statusRow.classList.toggle("error", kind === "error");
  }

  function sendMessage(message) {
    return chrome.runtime.sendMessage(message).catch((error) => ({
      ok: false,
      error: error?.message || "扩展后台连接失败",
    }));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 400 &&
      rect.height > 300
    );
  }

  function gameCanvas() {
    return [...document.querySelectorAll("canvas")]
      .filter(visible)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;
  }

  function gameRect() {
    const canvas = gameCanvas();
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      return {
        left: Math.max(0, rect.left),
        top: Math.max(0, rect.top),
        width: Math.min(window.innerWidth - Math.max(0, rect.left), rect.width),
        height: Math.min(window.innerHeight - Math.max(0, rect.top), rect.height),
      };
    }
    return { left: 0, top: 0, width: innerWidth, height: innerHeight };
  }

  function pointFromAnalysis(_analysis, kind) {
    const game = gameRect();
    const fallback = {
      mode: { x: 0.54, y: 0.066 },
      filter: { x: 0.136, y: 0.748 },
      refresh: { x: 0.105, y: 0.748 },
    }[kind];
    return {
      x: game.left + game.width * fallback.x,
      y: game.top + game.height * fallback.y,
    };
  }

  async function click(kind, analysis) {
    const point = pointFromAnalysis(analysis, kind);
    const response = await sendMessage({
      type: "ROOMS_HELPER_CLICK",
      point,
      kind,
    });
    if (!response?.ok) {
      const target = document.elementFromPoint(point.x, point.y);
      target?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          button: 0,
        }),
      );
    }
  }

  function applyPanelStyles(nextState) {
    panelState = normalizePanelState(nextState);
    if (
      Number.isFinite(panelState.left) &&
      Number.isFinite(panelState.top)
    ) {
      const clamped = clampPanelPosition({
        left: panelState.left,
        top: panelState.top,
        panelWidth: panel.offsetWidth,
        panelHeight: panel.offsetHeight,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      });
      panel.style.left = `${clamped.left}px`;
      panel.style.top = `${clamped.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panelState.left = clamped.left;
      panelState.top = clamped.top;
    } else {
      panel.style.removeProperty("left");
      panel.style.removeProperty("top");
      panel.style.removeProperty("right");
      panel.style.removeProperty("bottom");
    }
    panel.classList.toggle("collapsed", panelState.collapsed);
    refs.collapse.textContent = panelState.collapsed ? "+" : "−";
    refs.collapse.setAttribute("aria-expanded", String(!panelState.collapsed));
    refs.collapse.setAttribute(
      "aria-label",
      panelState.collapsed ? "展开房间监控" : "收起房间监控",
    );
    refs.collapse.title = panelState.collapsed ? "展开" : "收起";
  }

  function currentPanelState() {
    const rect = panel.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      collapsed: panel.classList.contains("collapsed"),
    };
  }

  async function savePanelState() {
    panelState = currentPanelState();
    await chrome.storage.local.set({
      [PANEL_STATE_KEY]: panelState,
    });
  }

  async function loadPanelState() {
    const stored = await chrome.storage.local.get(PANEL_STATE_KEY);
    applyPanelStyles(stored[PANEL_STATE_KEY] || null);
  }

  function setCollapsed(collapsed) {
    if (!panel.style.left && !panel.style.top) {
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
    panel.classList.toggle("collapsed", collapsed);
    refs.collapse.textContent = collapsed ? "+" : "−";
    refs.collapse.setAttribute("aria-expanded", String(!collapsed));
    refs.collapse.setAttribute(
      "aria-label",
      collapsed ? "展开房间监控" : "收起房间监控",
    );
    refs.collapse.title = collapsed ? "展开" : "收起";
    const rect = panel.getBoundingClientRect();
    const clamped = clampPanelPosition({
      left: rect.left,
      top: rect.top,
      panelWidth: rect.width,
      panelHeight: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    });
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
    savePanelState().catch(() => undefined);
  }

  function updateCount(count) {
    refs.count.textContent = String(count);
    refs.headerCount.textContent = String(count);
  }

  function setSource(label) {
    refs.source.textContent = label;
  }

  function filteredRuntimeSnapshot(snapshot) {
    const rooms = Array.isArray(snapshot?.rooms) ? snapshot.rooms : [];
    const highlights = rooms.filter((room) => matchesFilters(room, settings));
    return { ...snapshot, rooms, highlights };
  }

  function renderRuntimeSnapshot(snapshot) {
    const filtered = filteredRuntimeSnapshot(snapshot);
    lastRuntimeSnapshot = filtered;
    updateCount(filtered.highlights.length);
    setSource("实时读取");
    setStatus(
      filtered.highlights.length
        ? "实时数据已更新"
        : "实时读取中，当前没有符合条件的房间",
      "ok",
    );
    sendMessage({
      type: "ROOMS_HELPER_STATUS",
      count: filtered.highlights.length,
    });
  }

  function runtimeCommand(command, extra = {}) {
    const id = `rooms-${Date.now()}-${++runtimeCommandSequence}`;
    diagnostics?.log("runtime.command", { id, command });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        runtimeCommands.delete(id);
        reject(new Error("大厅实时桥接没有响应"));
      }, 2500);
      runtimeCommands.set(id, {
        resolve(value) {
          clearTimeout(timeout);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timeout);
          reject(error);
        },
      });
      window.dispatchEvent(
        new CustomEvent(RUNTIME_COMMAND_EVENT, {
          detail: { id, command, settings, ...extra },
        }),
      );
    });
  }

  function waitForRuntimeSnapshot(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRuntimeRefresh = null;
        reject(new Error("刷新后没有收到大厅实时数据"));
      }, timeoutMs);
      pendingRuntimeRefresh = {
        resolve(snapshot) {
          clearTimeout(timeout);
          pendingRuntimeRefresh = null;
          resolve(snapshot);
        },
      };
    });
  }

  async function ensureRuntimeMode() {
    let response = await runtimeCommand("setSettings");
    if (!response?.ok) return response?.snapshot || null;
    let snapshot = response.snapshot;
    const names = (snapshot?.rooms || []).map((room) => room.name);
    if (
      snapshot?.available &&
      (!names.length ||
        !names.some((name) => name.includes(settings.targetMode)))
    ) {
      await click("mode", null);
      await delay(500);
      response = await runtimeCommand("setSettings");
      snapshot = response?.snapshot || snapshot;
    }
    return snapshot;
  }

  async function manualRefresh() {
    if (manualBusy) return;
    manualBusy = true;
    diagnostics?.log("manual-refresh.start", settings);
    refs.refreshButton.disabled = true;
    refs.refreshButton.textContent = "刷新中…";
    setSource("正在连接实时数据");
    setStatus("正在刷新房间并检测…");
    try {
      const current = await ensureRuntimeMode();
      if (!current?.available) throw new Error("游戏运行态暂不可用");
      const response = await runtimeCommand("refresh");
      if (!response?.ok) throw new Error(response?.error || "实时刷新失败");
      const snapshotWait = waitForRuntimeSnapshot();
      const snapshot = await snapshotWait;
      if (!snapshot?.available) {
        throw new Error("刷新后没有获得大厅运行态");
      }
      renderRuntimeSnapshot(snapshot);
      refs.refreshTime.textContent = `刷新 ${formatTime()}`;
      diagnostics?.log("manual-refresh.runtime-complete", {
        rooms: snapshot.rooms.length,
        highlights: snapshot.highlights.length,
      });
    } catch (runtimeError) {
      pendingRuntimeRefresh = null;
      diagnostics?.log("manual-refresh.runtime-error", runtimeError);
      updateCount(0);
      lastRuntimeSnapshot = null;
      runtimeCommand("stopRender").catch(() => undefined);
      setSource("刷新失败");
      setStatus(
        `${runtimeError?.message || "实时读取失败"}，请点击扩展图标复制 Log`,
        "error",
      );
      await sendMessage({
        type: "ROOMS_HELPER_STATUS",
        count: 0,
        error: "刷新失败",
      });
    } finally {
      manualBusy = false;
      refs.refreshButton.disabled = false;
      refs.refreshButton.textContent = "刷新并检测";
    }
  }

  function formatTime() {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
  }

  function renderSettings() {
    refs.targetMode.value = settings.targetMode;
    refs.threshold.value = String(settings.thresholdSeconds);
    refs.thresholdLabel.textContent = `${settings.thresholdSeconds} 秒内`;
    refs.filterFull.value = settings.filters.full;
    refs.filterPassword.value = settings.filters.password;
    refs.filterChat.value = settings.filters.chat;
    refs.filterItems.value = settings.filters.items;
  }

  async function saveSettings() {
    settings = {
      targetMode: refs.targetMode.value || DEFAULT_SETTINGS.targetMode,
      thresholdSeconds: Math.min(
        99,
        Math.max(1, Number(refs.threshold.value) || 15),
      ),
      filters: normalizeFilters({
        full: refs.filterFull.value,
        password: refs.filterPassword.value,
        chat: refs.filterChat.value,
        items: refs.filterItems.value,
      }),
    };
    diagnostics?.log("settings.changed", settings);
    renderSettings();
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    if (lastRuntimeSnapshot) {
      renderRuntimeSnapshot(lastRuntimeSnapshot);
    }
    await runtimeCommand("setSettings").catch(() => undefined);
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
    settings.thresholdSeconds = Math.min(
      99,
      Math.max(1, Number(settings.thresholdSeconds) || 15),
    );
    settings.filters = normalizeFilters(settings.filters);
    renderSettings();
  }

  refs.collapse.addEventListener("click", (event) => {
    event.stopPropagation();
    setCollapsed(!panel.classList.contains("collapsed"));
  });

  refs.refreshButton.addEventListener("click", () => {
    manualRefresh().catch(() => undefined);
  });

  refs.targetMode.addEventListener("change", () => {
    saveSettings().catch(() => undefined);
  });
  refs.threshold.addEventListener("change", () => {
    saveSettings().catch(() => undefined);
  });
  for (const filter of [
    refs.filterFull,
    refs.filterPassword,
    refs.filterChat,
    refs.filterItems,
  ]) {
    filter.addEventListener("change", () => {
      saveSettings().catch(() => undefined);
    });
  }

  refs.dragHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    panel.classList.add("dragging");
    refs.dragHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  refs.dragHandle.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const clamped = clampPanelPosition({
      left: event.clientX - dragState.offsetX,
      top: event.clientY - dragState.offsetY,
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    });
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });
  function finishDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState = null;
    panel.classList.remove("dragging");
    if (refs.dragHandle.hasPointerCapture(event.pointerId)) {
      refs.dragHandle.releasePointerCapture(event.pointerId);
    }
    savePanelState().catch(() => undefined);
  }
  refs.dragHandle.addEventListener("pointerup", finishDrag);
  refs.dragHandle.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    if (!panel.style.left && !panel.style.top) return;
    const rect = panel.getBoundingClientRect();
    const clamped = clampPanelPosition({
      left: rect.left,
      top: rect.top,
      panelWidth: rect.width,
      panelHeight: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    });
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
    clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(
      () => savePanelState().catch(() => undefined),
      180,
    );
  });

  window.addEventListener(RUNTIME_RESPONSE_EVENT, (event) => {
    const detail = event.detail;
    const pending = runtimeCommands.get(detail?.id);
    if (!pending) return;
    runtimeCommands.delete(detail.id);
    diagnostics?.log("runtime.response", {
      id: detail.id,
      ok: Boolean(detail.ok),
      error: detail.error || "",
    });
    if (detail.ok) pending.resolve(detail);
    else pending.reject(new Error(detail.error || "大厅命令失败"));
  });

  window.addEventListener(RUNTIME_UPDATE_EVENT, (event) => {
    const snapshot = event.detail;
    diagnostics?.log("runtime.update", {
      available: Boolean(snapshot?.available),
      rooms: snapshot?.rooms?.length || 0,
      highlights: snapshot?.highlights?.length || 0,
    });
    if (!snapshot?.available) {
      if (pendingRuntimeRefresh) {
        pendingRuntimeRefresh.resolve(snapshot);
      }
      return;
    }
    if (pendingRuntimeRefresh) {
      pendingRuntimeRefresh.resolve(snapshot);
      return;
    }
    if (lastRuntimeSnapshot || snapshot.source === "runtime") {
      renderRuntimeSnapshot(snapshot);
      refs.refreshTime.textContent = `更新 ${formatTime()}`;
    }
  });

  (async () => {
    await Promise.all([loadSettings(), loadPanelState()]);
  })().catch((error) => setStatus(error?.message || "初始化失败", "error"));
})();
