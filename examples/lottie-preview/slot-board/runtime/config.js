/**
 * Slot board config schema (v4).
 * 布局：board.layout → computeBoardSize()
 * 盘面：frames[] 多帧 grid，activeFrameId 为当前编辑/预览帧
 */
(function (global) {
  "use strict";

  var CONFIG_VERSION = 4;
  var DEFAULT_COMP = { w: 720, h: 1280 };
  var DEFAULT_LAYOUT = {
    symbolW: 84,
    symbolH: 64,
    colGap: 0,
    rowGap: 0,
    padding: 0,
  };
  var DEFAULT_SYMBOLS = {
    cellFill: 0.9,
    scaleMul: {
      "s1.png": 1,
      "s2.png": 1,
      "s3.png": 1,
      "s4.png": 1,
      "s5_.png": 1.48,
      "s6_.png": 1.48,
      "s7.png": 1.45,
      "s8.png": 1.58,
      "s9.png": 1.58,
    },
  };
  var MIN_DIM = 2;
  var MAX_COLS = 12;
  var MAX_ROWS = 12;
  var MAX_FRAMES = 32;

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function newConfigId() {
    return "cfg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newFrameId(frames) {
    var max = -1;
    (frames || []).forEach(function (f) {
      var m = /^f(\d+)$/.exec(f.id || "");
      if (m) max = Math.max(max, Number(m[1]));
    });
    return "f" + (max + 1);
  }

  function emptyGrid(cols, rows) {
    var grid = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push(null);
      grid.push(row);
    }
    return grid;
  }

  function validateDimensions(cols, rows) {
    if (!Number.isInteger(cols) || cols < MIN_DIM || cols > MAX_COLS) {
      throw new Error("列数须在 " + MIN_DIM + "–" + MAX_COLS + " 之间");
    }
    if (!Number.isInteger(rows) || rows < MIN_DIM || rows > MAX_ROWS) {
      throw new Error("行数须在 " + MIN_DIM + "–" + MAX_ROWS + " 之间");
    }
  }

  function normalizeGridCells(cols, rows, grid) {
    var out = emptyGrid(cols, rows);
    if (!Array.isArray(grid)) return out;
    for (var r = 0; r < rows; r++) {
      if (!Array.isArray(grid[r])) continue;
      for (var c = 0; c < cols; c++) {
        var v = grid[r][c];
        out[r][c] = v == null || v === "" ? null : String(v);
      }
    }
    return out;
  }

  function validateGridShape(cols, rows, grid, label) {
    if (!Array.isArray(grid) || grid.length !== rows) {
      throw new Error((label || "grid") + " 行数与 board.rows 不一致");
    }
    for (var r = 0; r < rows; r++) {
      if (!Array.isArray(grid[r]) || grid[r].length !== cols) {
        throw new Error((label || "grid") + " 第 " + (r + 1) + " 行列数与 board.cols 不一致");
      }
    }
  }

  function getFrame(config, frameId) {
    if (!config.frames) return null;
    for (var i = 0; i < config.frames.length; i++) {
      if (config.frames[i].id === frameId) return config.frames[i];
    }
    return null;
  }

  function syncDerivedGrid(cfg) {
    var frame = getFrame(cfg, cfg.activeFrameId);
    if (!frame) throw new Error("找不到活动帧: " + cfg.activeFrameId);
    cfg.grid = deepClone(frame.grid);
    return cfg;
  }

  function computePlacement(config) {
    var size = computeBoardSize(config);
    var comp = config.comp || DEFAULT_COMP;
    return {
      left: (comp.w - size.width) / 2,
      top: (comp.h - size.height) / 2,
      width: size.width,
      height: size.height,
    };
  }

  function createConfig(options) {
    options = options || {};
    var cols = Number(options.cols);
    var rows = Number(options.rows);
    validateDimensions(cols, rows);

    var name = (options.name || "未命名盘面").trim() || "未命名盘面";
    var grid = emptyGrid(cols, rows);

    return {
      version: CONFIG_VERSION,
      id: newConfigId(),
      name: name,
      createdAt: new Date().toISOString(),
      comp: deepClone(DEFAULT_COMP),
      board: {
        cols: cols,
        rows: rows,
        locked: true,
        layout: deepClone(DEFAULT_LAYOUT),
      },
      symbols: deepClone(DEFAULT_SYMBOLS),
      frames: [{ id: "f0", name: "初始", grid: grid }],
      activeFrameId: "f0",
      grid: deepClone(grid),
    };
  }

  function normalizeSymbols(symbols) {
    var s = Object.assign({}, DEFAULT_SYMBOLS, symbols || {});
    if (s.cellFill <= 0 || s.cellFill > 1) {
      throw new Error("cellFill 须在 0–1 之间");
    }
    s.scaleMul = Object.assign({}, DEFAULT_SYMBOLS.scaleMul, s.scaleMul || {});
    return s;
  }

  function normalizeFrames(cfg) {
    var cols = cfg.board.cols;
    var rows = cfg.board.rows;
    if (!Array.isArray(cfg.frames) || !cfg.frames.length) {
      cfg.frames = [
        {
          id: "f0",
          name: "初始",
          grid: normalizeGridCells(cols, rows, cfg.grid),
        },
      ];
    }
    if (cfg.frames.length > MAX_FRAMES) {
      throw new Error("帧数不能超过 " + MAX_FRAMES);
    }

    var seen = {};
    cfg.frames = cfg.frames.map(function (frame, index) {
      var id = frame.id || newFrameId(cfg.frames.slice(0, index));
      if (seen[id]) id = newFrameId(cfg.frames);
      seen[id] = true;
      var name = (frame.name || "").trim() || "帧 " + id;
      var grid = normalizeGridCells(cols, rows, frame.grid);
      validateGridShape(cols, rows, grid, "帧 " + id);
      return { id: id, name: name, grid: grid };
    });

    if (!cfg.activeFrameId || !getFrame(cfg, cfg.activeFrameId)) {
      cfg.activeFrameId = cfg.frames[0].id;
    }
    return cfg;
  }

  function migrateV3toV4(raw) {
    var cfg = deepClone(raw);
    cfg.version = CONFIG_VERSION;
    var cols = cfg.board.cols;
    var rows = cfg.board.rows;
    cfg.frames = [
      {
        id: "f0",
        name: "初始",
        grid: normalizeGridCells(cols, rows, cfg.grid),
      },
    ];
    cfg.activeFrameId = "f0";
    delete cfg.grid;
    return cfg;
  }

  function setGridCell(config, col, row, symbolId, frameId) {
    var cfg = deepClone(config);
    frameId = frameId || cfg.activeFrameId;
    var frame = getFrame(cfg, frameId);
    if (!frame) throw new Error("找不到帧: " + frameId);
    if (symbolId != null && symbolId !== "") {
      if (typeof symbolId !== "string") throw new Error("symbol 须为文件名或 null");
    } else {
      symbolId = null;
    }
    frame.grid[row][col] = symbolId;
    if (frameId === cfg.activeFrameId) syncDerivedGrid(cfg);
    return cfg;
  }

  function updateGrid(config, grid, frameId) {
    var cfg = deepClone(config);
    frameId = frameId || cfg.activeFrameId;
    var frame = getFrame(cfg, frameId);
    if (!frame) throw new Error("找不到帧: " + frameId);
    validateDimensions(cfg.board.cols, cfg.board.rows);
    frame.grid = normalizeGridCells(cfg.board.cols, cfg.board.rows, grid);
    validateGridShape(cfg.board.cols, cfg.board.rows, frame.grid, "帧 " + frameId);
    if (frameId === cfg.activeFrameId) syncDerivedGrid(cfg);
    return cfg;
  }

  function countFilledCells(config, frameId) {
    var frame = getFrame(config, frameId || config.activeFrameId);
    if (!frame) return { filled: 0, total: config.board.cols * config.board.rows };
    var n = 0;
    var total = config.board.cols * config.board.rows;
    for (var r = 0; r < config.board.rows; r++) {
      for (var c = 0; c < config.board.cols; c++) {
        if (frame.grid[r][c]) n++;
      }
    }
    return { filled: n, total: total };
  }

  function computeBoardSize(config) {
    var board = config.board;
    var layout = board.layout || DEFAULT_LAYOUT;
    var cols = board.cols;
    var rows = board.rows;
    var sw = layout.symbolW;
    var sh = layout.symbolH;
    var cg = layout.colGap;
    var rg = layout.rowGap;
    var pad = layout.padding;

    var width = pad * 2 + cols * sw + Math.max(0, cols - 1) * cg;
    var height = pad * 2 + rows * sh + Math.max(0, rows - 1) * rg;

    return {
      width: width,
      height: height,
      layout: layout,
      cellW: sw,
      cellH: sh,
      colGap: cg,
      rowGap: rg,
      padding: pad,
    };
  }

  function normalizeLayout(layout) {
    var L = Object.assign({}, DEFAULT_LAYOUT, layout || {});
    if (L.symbolW <= 0 || L.symbolH <= 0) {
      throw new Error("symbol 宽高须大于 0");
    }
    if (L.colGap < 0 || L.rowGap < 0 || L.padding < 0) {
      throw new Error("间距与 padding 不能为负");
    }
    return L;
  }

  function updateLayout(config, patch) {
    var cfg = deepClone(config);
    cfg.board.layout = normalizeLayout(Object.assign({}, cfg.board.layout, patch));
    return cfg;
  }

  function updateSymbols(config, patch) {
    var cfg = deepClone(config);
    patch = patch || {};
    var merged = Object.assign({}, cfg.symbols, patch);
    if (patch.scaleMul) {
      merged.scaleMul = Object.assign({}, cfg.symbols.scaleMul, patch.scaleMul);
    }
    cfg.symbols = normalizeSymbols(merged);
    return cfg;
  }

  function setActiveFrame(config, frameId) {
    var cfg = deepClone(config);
    if (!getFrame(cfg, frameId)) throw new Error("找不到帧: " + frameId);
    cfg.activeFrameId = frameId;
    return syncDerivedGrid(cfg);
  }

  function renameFrame(config, frameId, name) {
    var cfg = deepClone(config);
    var frame = getFrame(cfg, frameId);
    if (!frame) throw new Error("找不到帧: " + frameId);
    frame.name = (name || "").trim() || frame.id;
    return cfg;
  }

  function addFrame(config, options) {
    options = options || {};
    var cfg = deepClone(config);
    if (cfg.frames.length >= MAX_FRAMES) {
      throw new Error("帧数不能超过 " + MAX_FRAMES);
    }
    var cols = cfg.board.cols;
    var rows = cfg.board.rows;
    var source = options.duplicateFrom ? getFrame(cfg, options.duplicateFrom) : null;
    if (options.duplicateFrom && !source) {
      throw new Error("找不到要复制的帧: " + options.duplicateFrom);
    }
    var id = newFrameId(cfg.frames);
    var grid = source ? deepClone(source.grid) : emptyGrid(cols, rows);
    var frameName = (options.name || "").trim();
    if (!frameName) {
      frameName = source ? source.name + " 副本" : "帧 " + id;
    }
    cfg.frames.push({ id: id, name: frameName, grid: grid });
    if (options.activate !== false) {
      cfg.activeFrameId = id;
      syncDerivedGrid(cfg);
    }
    return cfg;
  }

  function deleteFrame(config, frameId) {
    var cfg = deepClone(config);
    if (cfg.frames.length <= 1) {
      throw new Error("至少保留一帧");
    }
    var index = -1;
    for (var i = 0; i < cfg.frames.length; i++) {
      if (cfg.frames[i].id === frameId) {
        index = i;
        break;
      }
    }
    if (index < 0) throw new Error("找不到帧: " + frameId);
    cfg.frames.splice(index, 1);
    if (cfg.activeFrameId === frameId) {
      cfg.activeFrameId = cfg.frames[Math.max(0, index - 1)].id;
      syncDerivedGrid(cfg);
    }
    return cfg;
  }

  function moveFrame(config, frameId, delta) {
    var cfg = deepClone(config);
    var index = -1;
    for (var i = 0; i < cfg.frames.length; i++) {
      if (cfg.frames[i].id === frameId) {
        index = i;
        break;
      }
    }
    if (index < 0) throw new Error("找不到帧: " + frameId);
    var next = index + delta;
    if (next < 0 || next >= cfg.frames.length) return cfg;
    var tmp = cfg.frames[index];
    cfg.frames[index] = cfg.frames[next];
    cfg.frames[next] = tmp;
    return cfg;
  }

  function symbolUsedInAnyFrame(config, symbolId) {
    if (!config.frames) return false;
    for (var f = 0; f < config.frames.length; f++) {
      var grid = config.frames[f].grid;
      for (var r = 0; r < grid.length; r++) {
        for (var c = 0; c < grid[r].length; c++) {
          if (grid[r][c] === symbolId) return true;
        }
      }
    }
    return false;
  }

  function normalizeConfig(raw) {
    if (!raw || typeof raw !== "object") {
      throw new Error("无效配置");
    }

    var cfg;
    if (raw.version === 3) {
      cfg = migrateV3toV4(raw);
    } else if (raw.version === CONFIG_VERSION) {
      cfg = deepClone(raw);
    } else {
      throw new Error(
        "不支持的配置版本: " + raw.version + "（需要 " + CONFIG_VERSION + " 或 3）"
      );
    }

    if (!cfg.board || !cfg.board.locked) {
      throw new Error("配置缺少 board.locked，请用编辑器新建");
    }
    validateDimensions(cfg.board.cols, cfg.board.rows);

    delete cfg.ae;
    cfg.comp = cfg.comp || deepClone(DEFAULT_COMP);
    cfg.board.layout = normalizeLayout(cfg.board.layout);
    cfg.symbols = normalizeSymbols(cfg.symbols);
    normalizeFrames(cfg);
    syncDerivedGrid(cfg);
    return cfg;
  }

  function assertSameDimensions(existing, incoming) {
    if (
      existing.board.cols !== incoming.board.cols ||
      existing.board.rows !== incoming.board.rows
    ) {
      throw new Error(
        "行列不可更改（当前 " +
          existing.board.cols +
          "×" +
          existing.board.rows +
          "，导入为 " +
          incoming.board.cols +
          "×" +
          incoming.board.rows +
          "）。请新建配置。"
      );
    }
  }

  global.SlotBoardConfig = {
    VERSION: CONFIG_VERSION,
    DEFAULT_LAYOUT: DEFAULT_LAYOUT,
    DEFAULT_SYMBOLS: DEFAULT_SYMBOLS,
    MIN_DIM: MIN_DIM,
    MAX_COLS: MAX_COLS,
    MAX_ROWS: MAX_ROWS,
    MAX_FRAMES: MAX_FRAMES,
    createConfig: createConfig,
    normalizeConfig: normalizeConfig,
    computeBoardSize: computeBoardSize,
    computePlacement: computePlacement,
    updateLayout: updateLayout,
    updateSymbols: updateSymbols,
    setGridCell: setGridCell,
    updateGrid: updateGrid,
    countFilledCells: countFilledCells,
    normalizeSymbols: normalizeSymbols,
    assertSameDimensions: assertSameDimensions,
    emptyGrid: emptyGrid,
    deepClone: deepClone,
    getFrame: getFrame,
    setActiveFrame: setActiveFrame,
    renameFrame: renameFrame,
    addFrame: addFrame,
    deleteFrame: deleteFrame,
    moveFrame: moveFrame,
    symbolUsedInAnyFrame: symbolUsedInAnyFrame,
  };
})(typeof window !== "undefined" ? window : globalThis);
