import assert from "node:assert/strict";
import test from "node:test";

await import("../extension/lobby-data.js");

const {
  buildSnapshot,
  findAdapter,
  hasActiveExtraFilters,
  matchesFilters,
  normalizeFilters,
  roomFromTable,
} = globalThis.SanGuoShaLobbyData;

test("maps public game table fields into room snapshots", () => {
  const room = roomFromTable({
    TableID: 63645,
    TableName: "身份标准",
    TableGameTimer: 10,
    TableNowPlayer: 8,
    TableMaxPlayer: 8,
    TableNowStats: 1,
  });

  assert.deepEqual(room, {
    tableId: "63645",
    name: "身份标准",
    seconds: 10,
    currentPlayers: 8,
    maxPlayers: 8,
    status: "等待中",
    full: true,
    hasPassword: null,
    forbidChat: null,
    banItem: null,
  });
});

test("finds the active room window through the Laya scene graph", () => {
  const manager = {
    tableList: [
      {
        TableID: 1,
        TableName: "身份标准",
        TableGameTimer: 20,
        TableNowPlayer: 4,
        TableMaxPlayer: 8,
        TableNowStats: 0,
      },
      {
        TableID: 2,
        TableName: "身份标准",
        TableGameTimer: 10,
        TableNowPlayer: 3,
        TableMaxPlayer: 8,
        TableNowStats: 1,
      },
    ],
  };
  const roomWindow = {
    roomUIS: [],
    hallManager: manager,
    isWaitCheckBox: { selected: true },
    modeId: 31,
    groupId: 1,
  };
  const stage = {
    _children: [{ _children: [{}, roomWindow] }],
  };

  const adapter = findAdapter(stage);
  assert.equal(adapter.manager, manager);
  assert.equal(adapter.windowObject, roomWindow);
});

test("builds real-time eligibility from room fields", () => {
  const roomWindow = {
    roomUIS: [],
    hallManager: {
      tableList: [
        {
          TableID: 1,
          TableName: "身份标准",
          TableGameTimer: 10,
          TableNowPlayer: 8,
          TableMaxPlayer: 8,
          TableNowStats: 1,
        },
        {
          TableID: 2,
          TableName: "身份标准",
          TableGameTimer: 20,
          TableNowPlayer: 5,
          TableMaxPlayer: 8,
          TableNowStats: 1,
        },
        {
          TableID: 3,
          TableName: "身份标准",
          TableGameTimer: 5,
          TableNowPlayer: 4,
          TableMaxPlayer: 8,
          TableNowStats: 0,
        },
      ],
    },
    isWaitCheckBox: { selected: true },
  };
  const snapshot = buildSnapshot(
    {
      manager: roomWindow.hallManager,
      windowObject: roomWindow,
      rows: [],
    },
    { thresholdSeconds: 15 },
  );

  assert.equal(snapshot.waitingOnly, true);
  assert.deepEqual(
    snapshot.highlights.map((room) => room.tableId),
    ["1"],
  );
});

test("combines player range, password, chat and item filters with AND logic", () => {
  const room = {
    tableId: "9001",
    name: "身份标准",
    seconds: 10,
    currentPlayers: 7,
    maxPlayers: 8,
    status: "等待中",
    full: false,
    hasPassword: false,
    forbidChat: false,
    banItem: false,
  };
  const settings = {
    thresholdSeconds: 15,
    filters: {
      playerMin: 4,
      playerMax: 8,
      password: "none",
      chat: "allowed",
      items: "allowed",
    },
  };

  assert.equal(matchesFilters(room, settings), true);
  assert.equal(hasActiveExtraFilters(settings.filters), true);
  assert.equal(
    matchesFilters(
      { ...room, forbidChat: true },
      settings,
    ),
    false,
  );
  assert.equal(
    matchesFilters(
      { ...room, hasPassword: true },
      settings,
    ),
    false,
  );
});

test("does not match a room when the current player count is unknown", () => {
  const room = {
    tableId: "9002",
    name: "身份标准",
    seconds: 10,
    currentPlayers: null,
    maxPlayers: 8,
    status: "等待中",
    full: false,
    hasPassword: null,
    forbidChat: null,
    banItem: null,
  };

  assert.equal(
    matchesFilters(room, {
      thresholdSeconds: 15,
      filters: {
        playerMin: 1,
        playerMax: 8,
        password: "none",
        chat: "any",
        items: "any",
      },
    }),
    false,
  );
});

test("supports inclusive custom player ranges and positive filter directions", () => {
  const base = {
    tableId: "9100",
    name: "身份标准",
    seconds: 10,
    currentPlayers: 3,
    maxPlayers: 8,
    status: "等待中",
    full: false,
    hasPassword: false,
    forbidChat: false,
    banItem: false,
  };
  const filter = (patch) =>
    matchesFilters(base, {
      thresholdSeconds: 15,
      filters: {
        playerMin: 1,
        playerMax: 8,
        password: "any",
        chat: "any",
        items: "any",
        ...patch,
      },
    });

  assert.equal(filter({ playerMin: 3, playerMax: 7 }), true);
  assert.equal(filter({ playerMin: 4, playerMax: 8 }), false);
  assert.equal(filter({ playerMin: 4, playerMax: 6 }), false);
  assert.equal(filter({ password: "none" }), true);
  assert.equal(filter({ password: "has" }), false);
  assert.equal(filter({ chat: "allowed" }), true);
  assert.equal(filter({ chat: "forbidden" }), false);
  assert.equal(filter({ items: "allowed" }), true);
  assert.equal(filter({ items: "banned" }), false);

  const matchesRange = (currentPlayers) =>
    matchesFilters(
      { ...base, currentPlayers },
      {
        thresholdSeconds: 15,
        filters: {
          playerMin: 4,
          playerMax: 7,
          password: "any",
          chat: "any",
          items: "any",
        },
      },
    );
  assert.equal(matchesRange(3), false);
  assert.equal(matchesRange(4), true);
  assert.equal(matchesRange(7), true);
  assert.equal(matchesRange(8), false);
});

test("normalizes player range boundaries and reversed ranges", () => {
  assert.deepEqual(normalizeFilters({}), {
    playerMin: 1,
    playerMax: 8,
    password: "any",
    chat: "any",
    items: "any",
  });
  assert.deepEqual(normalizeFilters({ playerMin: -3, playerMax: 20 }), {
    playerMin: 1,
    playerMax: 8,
    password: "any",
    chat: "any",
    items: "any",
  });
  assert.equal(
    normalizeFilters({ playerMin: 7, playerMax: 4 }).playerMin,
    4,
  );
  assert.equal(
    normalizeFilters({ playerMin: 7, playerMax: 4 }).playerMax,
    4,
  );

  const room = {
    tableId: "9200",
    seconds: 10,
    maxPlayers: 8,
    status: "等待中",
    hasPassword: false,
    forbidChat: false,
    banItem: false,
  };
  const matchesDefaultRange = (currentPlayers) =>
    matchesFilters(
      { ...room, currentPlayers },
      { thresholdSeconds: 15, filters: normalizeFilters({}) },
    );
  assert.equal(matchesDefaultRange(1), true);
  assert.equal(matchesDefaultRange(8), true);
  assert.equal(matchesDefaultRange(0), false);
  assert.equal(matchesDefaultRange(9), false);
});
