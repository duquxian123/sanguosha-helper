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
    autoRefreshEnabled: true,
    refreshIntervalSeconds: 5,
    filters: {
      playerMin: 1,
      playerMax: 8,
      password: "any",
      chat: "any",
      items: "any",
    },
  });
  const DEFAULT_FILTERS = Object.freeze({
    playerMin: 1,
    playerMax: 8,
    password: "any",
    chat: "any",
    items: "any",
  });
  const FILTER_VALUES = Object.freeze({
    password: new Set(["any", "none", "has"]),
    chat: new Set(["any", "allowed", "forbidden"]),
    items: new Set(["any", "allowed", "banned"]),
  });
  const MIN_PLAYERS = 1;
  const MAX_PLAYERS = 8;
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

  const {
    clampPanelPosition,
    normalizePanelState,
    normalizeRefreshInterval,
    shouldDisableAutoRefreshAfterRefresh,
  } =
    globalThis.SanGuoShaPanelState;

  function normalizeFilters(rawFilters = {}) {
    const normalized =
      globalThis.SanGuoShaLobbyData?.normalizeFilters?.(rawFilters);
    if (normalized) return normalized;
    const filters = Object.fromEntries(
      Object.entries(DEFAULT_FILTERS).map(([key, fallback]) => {
        const value = rawFilters?.[key];
        if (FILTER_VALUES[key]) {
          return [key, FILTER_VALUES[key].has(value) ? value : fallback];
        }
        return [key, value];
      }),
    );
    const clamp = (value, fallback) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(number)));
    };
    filters.playerMin = clamp(rawFilters?.playerMin, DEFAULT_FILTERS.playerMin);
    filters.playerMax = clamp(rawFilters?.playerMax, DEFAULT_FILTERS.playerMax);
    if (filters.playerMin > filters.playerMax) {
      filters.playerMin = filters.playerMax;
    }
    return filters;
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
    if (
      !Number.isInteger(room.currentPlayers) ||
      room.currentPlayers < filters.playerMin ||
      room.currentPlayers > filters.playerMax
    ) {
      return false;
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
      font: 13px/1.45 "Microsoft YaHei UI", "PingFang SC", sans-serif;
    }
    .panel {
      position: fixed;
      right: 10px;
      bottom: 10px;
      display: flex;
      width: min(292px, calc(100vw - 16px));
      max-height: calc(100vh - 20px);
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(220, 184, 101, 0.56);
      border-radius: 4px;
      background: rgba(12, 18, 19, 0.96);
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.45);
      color: #ded5c3;
      pointer-events: auto;
      user-select: none;
      transition: width 150ms ease;
    }
    .panel.collapsed { width: min(170px, calc(100vw - 16px)); }
    .panel.dragging { box-shadow: 0 20px 58px rgba(0, 0, 0, 0.58); }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 37px;
      padding: 7px 8px 7px 10px;
      border-bottom: 1px solid rgba(220, 184, 101, 0.18);
      background: linear-gradient(120deg, rgba(220, 184, 101, 0.13), transparent);
      cursor: grab;
      touch-action: none;
    }
    .panel.dragging .panel-head { cursor: grabbing; }
    .panel.collapsed .panel-head { border-bottom: 0; }
    .panel.collapsed .body { display: none; }
    .panel.collapsed .panel-footer { display: none; }
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
      font-size: 14px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .error-dot {
      width: 7px;
      height: 7px;
      flex: 0 0 7px;
      border-radius: 50%;
      background: #d47768;
      box-shadow: 0 0 0 3px rgba(212, 119, 104, 0.13);
    }
    .error-dot[hidden] { display: none; }
    .collapse {
      display: grid;
      width: 25px;
      height: 25px;
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
    .body {
      min-height: 0;
      overflow-y: auto;
      padding: 10px 11px 9px;
    }
    .basic-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 9px;
    }
    label {
      display: grid;
      gap: 4px;
      color: #9fa9a4;
      font-size: 11px;
    }
    select,
    input {
      width: 100%;
      height: 31px;
      box-sizing: border-box;
      border: 1px solid rgba(220, 184, 101, 0.22);
      border-radius: 2px;
      background: rgba(4, 8, 8, 0.62);
      color: #e8dfcc;
      font: 12px "Microsoft YaHei UI", sans-serif;
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
      font-size: 11px;
      transform: translateY(-50%);
      pointer-events: none;
    }
    .filters-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 9px;
      padding: 10px 0;
      border-top: 1px solid rgba(220, 184, 101, 0.14);
    }
    .filter-row {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: #9fa9a4;
      font-size: 11px;
    }
    .filter-row .seconds-field input { height: 29px; }
    .range-filter {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .range-filter input {
      width: 100%;
      height: 29px;
      padding: 0 4px;
      text-align: center;
    }
    .range-filter span {
      color: #7f8b88;
      font-size: 10px;
      white-space: nowrap;
    }
    .segmented {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      overflow: hidden;
      border: 1px solid rgba(220, 184, 101, 0.2);
      border-radius: 3px;
    }
    .segmented button {
      min-width: 0;
      height: 29px;
      padding: 0 2px;
      border: 0;
      border-right: 1px solid rgba(220, 184, 101, 0.14);
      background: rgba(0, 0, 0, 0.22);
      color: #87918d;
      font: 11px "Microsoft YaHei UI", sans-serif;
      cursor: pointer;
      white-space: nowrap;
    }
    .segmented button:last-child { border-right: 0; }
    .segmented button[aria-pressed="true"] {
      background: rgba(82, 201, 120, 0.2);
      color: #bff1cc;
      box-shadow: inset 0 -2px #52c978;
    }
    .auto-controls {
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 8px;
      margin-top: 9px;
      padding-top: 8px;
      border-top: 1px solid rgba(220, 184, 101, 0.12);
    }
    .auto-toggle {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 31px;
      color: #c5d8cc;
    }
    .auto-toggle input {
      width: 16px;
      height: 16px;
      padding: 0;
      accent-color: #52c978;
    }
    .progress-area { margin-top: 7px; }
    .progress-area[hidden] { display: none; }
    .progress-head {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      color: #87a493;
      font-size: 10px;
    }
    .progress-track {
      height: 5px;
      overflow: hidden;
      border: 1px solid rgba(91, 220, 135, 0.18);
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.34);
    }
    .progress-fill {
      display: block;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #3fa862, #74e19e);
      transform-origin: left center;
      transition: width 120ms linear;
    }
    .refresh {
      width: 100%;
      min-height: 36px;
      margin-top: 9px;
      border: 1px solid rgba(220, 184, 101, 0.52);
      border-radius: 2px;
      background: linear-gradient(135deg, #9b7437, #5d431d);
      color: #fff0c7;
      font: 700 13px "Microsoft YaHei UI", sans-serif;
      cursor: pointer;
    }
    .refresh:disabled {
      cursor: wait;
      filter: grayscale(0.55);
      opacity: 0.65;
    }
    .error-banner {
      margin-top: 8px;
      padding: 6px 8px;
      border-left: 2px solid #d47768;
      background: rgba(120, 47, 38, 0.14);
      color: #e3a398;
      font-size: 11px;
      line-height: 1.45;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .error-banner[hidden] { display: none; }
    .panel-footer {
      flex: 0 0 auto;
      padding: 8px 12px 7px;
      border-top: 1px solid rgba(220, 184, 101, 0.18);
      background: rgba(8, 13, 14, 0.76);
    }
    .footer-meta {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
      color: #70817f;
      font-size: 10px;
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
        <span class="error-dot" data-error-dot hidden title="出现错误"></span>
      </div>
      <div class="panel-actions">
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
      <div class="basic-grid">
        <label>
          <span>玩法</span>
          <select data-target-mode>
            <option value="身份标准">身份标准</option>
          </select>
        </label>
      </div>
      <div class="filters-grid">
        <div class="filter-row">
          <span>出手时间</span>
          <span class="seconds-field">
            <input
              data-threshold
              type="number"
              min="1"
              max="99"
              step="1"
              aria-label="出手时间上限"
            />
            <span>秒</span>
          </span>
        </div>
        <div class="filter-row">
          <span>人数</span>
          <div class="range-filter" role="group" aria-label="当前人数筛选">
            <input data-player-min type="number" min="1" max="8" step="1" aria-label="最少人数" />
            <span>至</span>
            <input data-player-max type="number" min="1" max="8" step="1" aria-label="最多人数" />
            <span>人</span>
          </div>
        </div>
        <div class="filter-row">
          <span>密码</span>
          <div class="segmented" role="group" aria-label="密码筛选">
            <button type="button" data-filter="password" data-value="any" aria-pressed="true">不限</button>
            <button type="button" data-filter="password" data-value="none" aria-pressed="false">无</button>
            <button type="button" data-filter="password" data-value="has" aria-pressed="false">有</button>
          </div>
        </div>
        <div class="filter-row">
          <span>禁聊</span>
          <div class="segmented" role="group" aria-label="禁聊筛选">
            <button type="button" data-filter="chat" data-value="any" aria-pressed="true">不限</button>
            <button type="button" data-filter="chat" data-value="allowed" aria-pressed="false">允许</button>
            <button type="button" data-filter="chat" data-value="forbidden" aria-pressed="false">禁止</button>
          </div>
        </div>
        <div class="filter-row">
          <span>道具</span>
          <div class="segmented" role="group" aria-label="道具筛选">
            <button type="button" data-filter="items" data-value="any" aria-pressed="true">不限</button>
            <button type="button" data-filter="items" data-value="allowed" aria-pressed="false">允许</button>
            <button type="button" data-filter="items" data-value="banned" aria-pressed="false">禁用</button>
          </div>
        </div>
      </div>
      <div class="auto-controls">
        <label class="auto-toggle">
          <input data-auto-refresh type="checkbox" />
          <span>自动刷新</span>
        </label>
        <label>
          <span>间隔</span>
          <span class="seconds-field">
            <input data-refresh-interval type="number" min="5" max="15" step="1" />
            <span>秒</span>
          </span>
        </label>
      </div>
      <div class="error-banner" data-error role="status" aria-live="polite" hidden></div>
    </div>
    <div class="panel-footer">
      <div class="progress-area" data-progress-area>
        <div class="progress-head">
          <span data-next-refresh>下次刷新 5 秒</span>
          <span data-progress-state>自动</span>
        </div>
        <div
          class="progress-track"
          data-progress
          role="progressbar"
          aria-label="自动刷新倒计时"
          aria-valuemin="0"
          aria-valuemax="5"
          aria-valuenow="5"
        >
          <span class="progress-fill" data-progress-fill></span>
        </div>
      </div>
      <button class="refresh" type="button" data-refresh>刷新并检测</button>
      <div class="footer-meta">
        <span data-version></span>
      </div>
    </div>
  `;
  root.append(panel);
  shadow.append(style, root);
  diagnostics?.log("content.panel-created", {
    version: chrome.runtime.getManifest().version,
  });

  const refs = {
    autoRefresh: shadow.querySelector("[data-auto-refresh]"),
    collapse: shadow.querySelector("[data-collapse]"),
    dragHandle: shadow.querySelector("[data-drag-handle]"),
    errorBanner: shadow.querySelector("[data-error]"),
    errorDot: shadow.querySelector("[data-error-dot]"),
    filterButtons: [...shadow.querySelectorAll("[data-filter]")],
    nextRefresh: shadow.querySelector("[data-next-refresh]"),
    playerMax: shadow.querySelector("[data-player-max]"),
    playerMin: shadow.querySelector("[data-player-min]"),
    progress: shadow.querySelector("[data-progress]"),
    progressArea: shadow.querySelector("[data-progress-area]"),
    progressFill: shadow.querySelector("[data-progress-fill]"),
    progressState: shadow.querySelector("[data-progress-state]"),
    refreshButton: shadow.querySelector("[data-refresh]"),
    refreshInterval: shadow.querySelector("[data-refresh-interval]"),
    targetMode: shadow.querySelector("[data-target-mode]"),
    threshold: shadow.querySelector("[data-threshold]"),
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
  let autoRefreshTimer = null;
  let progressTimer = null;
  let nextRefreshAt = 0;
  let pausedRemainingMs = null;
  const runtimeCommands = new Map();

  function setError(message = "") {
    const hasError = Boolean(message);
    refs.errorDot.hidden = !hasError;
    refs.errorBanner.hidden = !hasError;
    refs.errorBanner.textContent = hasError ? String(message) : "";
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
    panel.classList.toggle("collapsed", panelState.collapsed);
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

  function clearAutoTimers() {
    if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
    if (progressTimer) clearInterval(progressTimer);
    autoRefreshTimer = null;
    progressTimer = null;
    nextRefreshAt = 0;
  }

  function updateAutoProgress() {
    const enabled = Boolean(settings.autoRefreshEnabled);
    refs.autoRefresh.checked = enabled;
    refs.progressArea.hidden = !enabled;
    if (!enabled) return;

    const intervalMs = settings.refreshIntervalSeconds * 1000;
    refs.progress.setAttribute("aria-valuemax", String(settings.refreshIntervalSeconds));
    if (manualBusy) {
      refs.progressFill.style.width = "0%";
      refs.nextRefresh.textContent = "正在刷新";
      refs.progressState.textContent = "自动";
      refs.progress.setAttribute("aria-valuenow", "0");
      refs.progress.setAttribute("aria-valuetext", "正在刷新");
      return;
    }
    let remainingMs;
    if (document.visibilityState !== "visible") {
      remainingMs =
        pausedRemainingMs ??
        (nextRefreshAt > 0 ? Math.max(0, nextRefreshAt - Date.now()) : intervalMs);
      refs.nextRefresh.textContent = `已暂停 · 剩余 ${Math.max(
        0,
        Math.ceil(remainingMs / 1000),
      )} 秒`;
    } else if (nextRefreshAt > 0) {
      remainingMs = Math.max(0, nextRefreshAt - Date.now());
      refs.nextRefresh.textContent = `下次刷新 ${Math.max(
        0,
        Math.ceil(remainingMs / 1000),
      )} 秒`;
    } else {
      remainingMs = intervalMs;
      refs.nextRefresh.textContent = "准备自动刷新";
    }
    const ratio = Math.max(0, Math.min(1, remainingMs / intervalMs));
    refs.progressFill.style.width = `${ratio * 100}%`;
    refs.progressState.textContent = "自动";
    refs.progress.setAttribute(
      "aria-valuenow",
      String(Math.max(0, Math.ceil(remainingMs / 1000))),
    );
    refs.progress.setAttribute(
      "aria-valuetext",
      refs.nextRefresh.textContent,
    );
  }

  function scheduleAutoRefresh(delayMs = settings.refreshIntervalSeconds * 1000) {
    clearAutoTimers();
    pausedRemainingMs = null;
    if (!settings.autoRefreshEnabled) {
      updateAutoProgress();
      return;
    }
    if (document.visibilityState !== "visible") {
      pausedRemainingMs = Math.max(0, delayMs);
      updateAutoProgress();
      return;
    }
    nextRefreshAt = Date.now() + delayMs;
    updateAutoProgress();
    progressTimer = setInterval(updateAutoProgress, 100);
    autoRefreshTimer = setTimeout(() => {
      clearAutoTimers();
      manualRefresh({ trigger: "auto" }).catch(() => undefined);
    }, delayMs);
  }

  async function disableAutoRefreshAfterMatch() {
    settings = { ...settings, autoRefreshEnabled: false };
    refs.autoRefresh.checked = false;
    clearAutoTimers();
    pausedRemainingMs = null;
    updateAutoProgress();
    diagnostics?.log("auto-refresh.stopped-after-match", {
      matchingRooms: lastRuntimeSnapshot?.highlights?.length || 0,
    });
    await chrome.storage.local
      .set({ [SETTINGS_KEY]: settings })
      .catch(() => undefined);
  }

  function restartAutoRefresh() {
    clearAutoTimers();
    pausedRemainingMs = null;
    if (!settings.autoRefreshEnabled) {
      updateAutoProgress();
      return;
    }
    scheduleAutoRefresh(settings.refreshIntervalSeconds * 1000);
  }

  function filteredRuntimeSnapshot(snapshot) {
    const rooms = Array.isArray(snapshot?.rooms) ? snapshot.rooms : [];
    const highlights = rooms.filter((room) => matchesFilters(room, settings));
    return { ...snapshot, rooms, highlights };
  }

  function renderRuntimeSnapshot(snapshot) {
    const filtered = filteredRuntimeSnapshot(snapshot);
    lastRuntimeSnapshot = filtered;
    setError("");
    sendMessage({
      type: "ROOMS_HELPER_STATUS",
    });
    return filtered;
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

  async function manualRefresh({ trigger = "manual" } = {}) {
    if (manualBusy) return;
    const stoppedAutoForManual =
      trigger === "manual" && settings.autoRefreshEnabled;
    if (stoppedAutoForManual) {
      settings = { ...settings, autoRefreshEnabled: false };
      refs.autoRefresh.checked = false;
    }
    clearAutoTimers();
    pausedRemainingMs = null;
    manualBusy = true;
    diagnostics?.log(`${trigger}-refresh.start`, settings);
    refs.refreshButton.disabled = true;
    refs.refreshButton.textContent = "刷新中…";
    setError("");
    updateAutoProgress();
    if (stoppedAutoForManual) {
      diagnostics?.log("auto-refresh.stopped-for-manual", settings);
      await chrome.storage.local
        .set({ [SETTINGS_KEY]: settings })
        .catch(() => undefined);
    }
    let matchingRoomCount = 0;
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
      const filtered = renderRuntimeSnapshot(snapshot);
      matchingRoomCount = filtered.highlights.length;
      diagnostics?.log(`${trigger}-refresh.runtime-complete`, {
        rooms: snapshot.rooms.length,
        highlights: snapshot.highlights.length,
      });
    } catch (runtimeError) {
      pendingRuntimeRefresh = null;
      diagnostics?.log(`${trigger}-refresh.runtime-error`, runtimeError);
      lastRuntimeSnapshot = null;
      runtimeCommand("stopRender").catch(() => undefined);
      setError(
        `${runtimeError?.message || "实时读取失败"}，请点击扩展图标复制 Log`,
      );
      await sendMessage({
        type: "ROOMS_HELPER_STATUS",
        error: "刷新失败",
      });
    } finally {
      manualBusy = false;
      refs.refreshButton.disabled = false;
      refs.refreshButton.textContent = "刷新并检测";
      if (trigger === "auto" && settings.autoRefreshEnabled) {
        if (
          shouldDisableAutoRefreshAfterRefresh({
            trigger,
            autoRefreshEnabled: settings.autoRefreshEnabled,
            matchingRoomCount,
          })
        ) {
          await disableAutoRefreshAfterMatch();
        } else {
          scheduleAutoRefresh(settings.refreshIntervalSeconds * 1000);
        }
      } else {
        updateAutoProgress();
      }
    }
  }

  function setFilterValue(key, value) {
    for (const button of refs.filterButtons) {
      if (button.dataset.filter !== key) continue;
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.value === value),
      );
    }
  }

  function filterValue(key) {
    return (
      refs.filterButtons.find(
        (button) =>
          button.dataset.filter === key &&
          button.getAttribute("aria-pressed") === "true",
      )?.dataset.value || "any"
    );
  }

  function renderSettings() {
    refs.targetMode.value = settings.targetMode;
    refs.threshold.value = String(settings.thresholdSeconds);
    refs.autoRefresh.checked = settings.autoRefreshEnabled;
    refs.refreshInterval.value = String(settings.refreshIntervalSeconds);
    refs.playerMin.value = String(settings.filters.playerMin);
    refs.playerMax.value = String(settings.filters.playerMax);
    setFilterValue("password", settings.filters.password);
    setFilterValue("chat", settings.filters.chat);
    setFilterValue("items", settings.filters.items);
  }

  async function saveSettings() {
    const previousAutoRefreshEnabled = settings.autoRefreshEnabled;
    const previousRefreshIntervalSeconds = settings.refreshIntervalSeconds;
    settings = {
      targetMode: refs.targetMode.value || DEFAULT_SETTINGS.targetMode,
      thresholdSeconds: Math.min(
        99,
        Math.max(1, Number(refs.threshold.value) || 15),
      ),
      autoRefreshEnabled: refs.autoRefresh.checked,
      refreshIntervalSeconds: normalizeRefreshInterval(
        refs.refreshInterval.value,
      ),
      filters: normalizeFilters({
        playerMin: refs.playerMin.value,
        playerMax: refs.playerMax.value,
        password: filterValue("password"),
        chat: filterValue("chat"),
        items: filterValue("items"),
      }),
    };
    diagnostics?.log("settings.changed", settings);
    renderSettings();
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    if (lastRuntimeSnapshot) {
      renderRuntimeSnapshot(lastRuntimeSnapshot);
    }
    if (
      previousAutoRefreshEnabled !== settings.autoRefreshEnabled ||
      previousRefreshIntervalSeconds !== settings.refreshIntervalSeconds
    ) {
      restartAutoRefresh();
    } else {
      updateAutoProgress();
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
    settings.autoRefreshEnabled = settings.autoRefreshEnabled !== false;
    settings.refreshIntervalSeconds = normalizeRefreshInterval(
      settings.refreshIntervalSeconds,
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
  refs.autoRefresh.addEventListener("change", () => {
    saveSettings().catch(() => undefined);
  });
  refs.refreshInterval.addEventListener("change", () => {
    saveSettings().catch(() => undefined);
  });
  refs.playerMin.addEventListener("change", () => {
    saveSettings().catch(() => undefined);
  });
  refs.playerMax.addEventListener("change", () => {
    saveSettings().catch(() => undefined);
  });
  for (const button of refs.filterButtons) {
    button.addEventListener("click", () => {
      setFilterValue(button.dataset.filter, button.dataset.value);
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

  document.addEventListener("visibilitychange", () => {
    if (
      !settings.autoRefreshEnabled ||
      manualBusy
    ) {
      return;
    }
    if (document.visibilityState !== "visible") {
      pausedRemainingMs =
        nextRefreshAt > 0
          ? Math.max(0, nextRefreshAt - Date.now())
          : settings.refreshIntervalSeconds * 1000;
      clearAutoTimers();
      updateAutoProgress();
      return;
    }
    scheduleAutoRefresh(
      pausedRemainingMs ?? settings.refreshIntervalSeconds * 1000,
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
    }
  });

  (async () => {
    await Promise.all([loadSettings(), loadPanelState()]);
    restartAutoRefresh();
  })().catch((error) => setError(error?.message || "初始化失败"));
})();
