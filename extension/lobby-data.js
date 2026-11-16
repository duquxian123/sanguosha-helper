(function initializeLobbyData(global) {
  "use strict";

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

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

  function clampPlayerCount(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(number)));
  }

  function childNodes(node) {
    if (Array.isArray(node?._children)) return node._children;
    if (Array.isArray(node?.children)) return node.children;
    if (typeof node?.numChildren === "number" && typeof node?.getChildAt === "function") {
      return Array.from(
        { length: node.numChildren },
        (_, index) => node.getChildAt(index),
      );
    }
    return [];
  }

  function findAdapter(root) {
    if (!root) return null;
    const stack = [root];
    const visited = new Set();
    let best = null;
    let bestScore = -1;
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object" || visited.has(node)) continue;
      visited.add(node);
      if (
        Array.isArray(node.roomUIS) &&
        node.hallManager &&
        Array.isArray(node.hallManager.tableList)
      ) {
        const candidate = {
          windowObject: node,
          manager: node.hallManager,
          rows: node.roomUIS,
        };
        const score =
          (node.visible === false ? 0 : 1000) +
          node.roomUIS.filter((row) => row?.visible).length * 10 +
          node.hallManager.tableList.length;
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      const children = childNodes(node);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }
    return best;
  }

  function roomFromTable(table) {
    const stats = numberOrNull(table?.TableNowStats);
    const seconds = numberOrNull(table?.TableGameTimer);
    const currentPlayers = numberOrNull(table?.TableNowPlayer);
    const maxPlayers = numberOrNull(table?.TableMaxPlayer);
    const hasPassword =
      typeof table?.HasPass === "boolean" ? table.HasPass : null;
    const forbidChat =
      typeof table?.ForbidChat === "boolean" ? table.ForbidChat : null;
    const banItem =
      typeof table?.IsBanItem === "boolean" ? table.IsBanItem : null;
    return {
      tableId: cleanText(table?.TableID ?? table?.id),
      name: cleanText(table?.TableName ?? table?.Name ?? table?.name),
      seconds,
      currentPlayers,
      maxPlayers,
      status: stats === 1 ? "等待中" : stats === null ? "未知" : "游戏中",
      full:
        Number.isInteger(currentPlayers) && Number.isInteger(maxPlayers)
          ? currentPlayers >= maxPlayers
          : null,
      hasPassword,
      forbidChat,
      banItem,
    };
  }

  function normalizeFilters(rawFilters = {}) {
    const filters = Object.fromEntries(
      Object.entries(DEFAULT_FILTERS).map(([key, fallback]) => {
        const value = rawFilters?.[key];
        if (FILTER_VALUES[key]) {
          return [key, FILTER_VALUES[key].has(value) ? value : fallback];
        }
        return [key, value];
      }),
    );
    filters.playerMin = clampPlayerCount(
      rawFilters?.playerMin,
      DEFAULT_FILTERS.playerMin,
    );
    filters.playerMax = clampPlayerCount(
      rawFilters?.playerMax,
      DEFAULT_FILTERS.playerMax,
    );
    if (filters.playerMin > filters.playerMax) {
      filters.playerMin = filters.playerMax;
    }
    return filters;
  }

  function hasActiveExtraFilters(rawFilters = {}) {
    const filters = normalizeFilters(rawFilters);
    return (
      filters.playerMin !== DEFAULT_FILTERS.playerMin ||
      filters.playerMax !== DEFAULT_FILTERS.playerMax ||
      filters.password !== "any" ||
      filters.chat !== "any" ||
      filters.items !== "any"
    );
  }

  function matchesFilters(room, rawSettings = {}) {
    const thresholdSeconds =
      typeof rawSettings === "number"
        ? rawSettings
        : Number(rawSettings.thresholdSeconds ?? 15);
    const filters =
      typeof rawSettings === "number"
        ? DEFAULT_FILTERS
        : normalizeFilters(rawSettings.filters);
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

  function isEligible(room, settings) {
    return matchesFilters(room, settings);
  }

  function buildSnapshot(adapter, rawSettings = {}) {
    const settings =
      typeof rawSettings === "number"
        ? { thresholdSeconds: rawSettings, filters: DEFAULT_FILTERS }
        : {
            thresholdSeconds: Number(rawSettings.thresholdSeconds ?? 15),
            filters: normalizeFilters(rawSettings.filters),
          };
    if (!adapter?.manager || !adapter?.windowObject) {
      return {
        available: false,
        roomCount: 0,
        rooms: [],
      };
    }
    const tableList = Array.isArray(adapter.manager.tableList)
      ? adapter.manager.tableList
      : [];
    const rooms = tableList
      .map(roomFromTable)
      .filter((room) => room.tableId)
      .map((room) => ({
        ...room,
        eligible: isEligible(room, settings),
      }));
    const windowObject = adapter.windowObject;
    return {
      available: true,
      modeId: numberOrNull(windowObject.modeId),
      groupId: numberOrNull(windowObject.groupId),
      waitingOnly: Boolean(windowObject.isWaitCheckBox?.selected),
      roomCount: rooms.length,
      rooms,
      highlights: rooms.filter((room) => room.eligible),
    };
  }

  global.SanGuoShaLobbyData = Object.freeze({
    buildSnapshot,
    DEFAULT_FILTERS,
    findAdapter,
    hasActiveExtraFilters,
    isEligible,
    MAX_PLAYERS,
    matchesFilters,
    MIN_PLAYERS,
    normalizeFilters,
    roomFromTable,
  });
})(globalThis);
