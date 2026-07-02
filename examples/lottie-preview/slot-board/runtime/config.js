/**
 * Slot board config schema (v5).
 * 布局：board.layout → computeBoardSize()
 * 盘面：frames[] 多帧 grid，activeFrameId 为当前编辑/预览帧
 * 动画：sequences[] 帧间链路实例（Exit + Enter 两步），每帧至多一个起点/终点
 */
(function (global) {
  "use strict";

  var CONFIG_VERSION = 5;
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
  var MAX_SEQUENCES = 16;
  var MAX_STEPS = 8;

  var VALID_STEP_TYPES = ["boardDropOut", "boardDropIn", "boardEliminate", "boardCascadeDrop"];

  var LINK_PRESETS = {
    swapWave: {
      id: "swapWave",
      label: "换盘 (滚出+滚入)",
      steps: ["boardDropOut", "boardDropIn"],
    },
    eliminateWave: {
      id: "eliminateWave",
      label: "消除 (序列帧)",
      steps: ["boardEliminate", "boardCascadeDrop"],
    },
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function newConfigId() {
    return "cfg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function newSequenceId(sequences) {
    var max = -1;
    (sequences || []).forEach(function (s) {
      var m = /^seq_(\d+)$/.exec(s.id || "");
      if (m) max = Math.max(max, Number(m[1]));
    });
    return "seq_" + (max + 1);
  }

  function newStepId(steps) {
    var max = -1;
    (steps || []).forEach(function (s) {
      var m = /^s(\d+)$/.exec(s.id || "");
      if (m) max = Math.max(max, Number(m[1]));
    });
    return "s" + (max + 1);
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
      sequences: [],
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

  function migrateV4toV5(raw) {
    var cfg = deepClone(raw);
    cfg.version = CONFIG_VERSION;
    if (!Array.isArray(cfg.sequences)) cfg.sequences = [];
    return cfg;
  }

  function normalizeStep(step, index) {
    if (!step || typeof step !== "object") {
      throw new Error("无效动画 step");
    }
    if (VALID_STEP_TYPES.indexOf(step.type) < 0) {
      throw new Error("不支持的动画类型: " + step.type);
    }
    var out = {
      id: step.id || newStepId([]),
      type: step.type,
      params: step.params && typeof step.params === "object" ? deepClone(step.params) : {},
    };
    if (step.fromFrameId) out.fromFrameId = String(step.fromFrameId);
    if (step.toFrameId) out.toFrameId = String(step.toFrameId);
    if (out.type === "boardDropOut" && !out.fromFrameId) {
      throw new Error("step " + out.id + ": boardDropOut 需要 fromFrameId");
    }
    if (out.type === "boardDropIn" && !out.toFrameId) {
      throw new Error("step " + out.id + ": boardDropIn 需要 toFrameId");
    }
    if (out.type === "boardEliminate" && !out.fromFrameId) {
      throw new Error("step " + out.id + ": boardEliminate 需要 fromFrameId");
    }
    if (out.type === "boardCascadeDrop" && !out.fromFrameId) {
      throw new Error("step " + out.id + ": boardCascadeDrop 需要 fromFrameId");
    }
    if (out.type === "boardCascadeDrop" && !out.toFrameId) {
      throw new Error("step " + out.id + ": boardCascadeDrop 需要 toFrameId");
    }
    return out;
  }

  /** from 有 symbol、to 变 null 的格 */
  function computeEliminateCells(config, step) {
    var params = (step && step.params) || {};
    if (params.cells === "explicit" && Array.isArray(params.cellList) && params.cellList.length) {
      return params.cellList.map(function (cell) {
        return { col: Number(cell.col), row: Number(cell.row) };
      });
    }
    var fromId = step.fromFrameId;
    var toId = step.toFrameId;
    if (!fromId || !toId) return [];
    var fromFrame = getFrame(config, fromId);
    var toFrame = getFrame(config, toId);
    if (!fromFrame || !toFrame) return [];
    var cols = config.board.cols;
    var rows = config.board.rows;
    var out = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var before = fromFrame.grid[r] ? fromFrame.grid[r][c] : null;
        var after = toFrame.grid[r] ? toFrame.grid[r][c] : null;
        if (before && !after) out.push({ col: c, row: r });
      }
    }
    return out;
  }

  function findPriorStepOfType(steps, stepIndex, type) {
    if (!steps || stepIndex == null || stepIndex <= 0) return null;
    for (var i = stepIndex - 1; i >= 0; i--) {
      if (steps[i] && steps[i].type === type) return steps[i];
    }
    return null;
  }

  /** 下落步骤：消除格来自前序 boardEliminate（含手动点选），否则回退帧差分 */
  function getEliminateCellsForCascade(config, cascadeStep, eliminateStep) {
    if (eliminateStep && eliminateStep.type === "boardEliminate") {
      return computeEliminateCells(config, eliminateStep);
    }
    return computeEliminateCells(config, {
      fromFrameId: cascadeStep.fromFrameId,
      toFrameId: cascadeStep.toFrameId,
      params: { cells: "diff" },
    });
  }

  /** from 帧盘面，去掉消除格后的网格（下落初始态） */
  function configWithPostEliminateGrid(config, frameId, eliminatedCells) {
    var cfg = deepClone(config);
    var frame = getFrame(cfg, frameId);
    if (!frame) throw new Error("找不到帧: " + frameId);
    cfg.grid = deepClone(frame.grid);
    (eliminatedCells || []).forEach(function (cell) {
      if (cfg.grid[cell.row]) cfg.grid[cell.row][cell.col] = null;
    });
    return cfg;
  }

  function normalizeSequences(cfg) {
    if (!Array.isArray(cfg.sequences)) cfg.sequences = [];
    if (cfg.sequences.length > MAX_SEQUENCES) {
      throw new Error("序列数不能超过 " + MAX_SEQUENCES);
    }
    var seen = {};
    cfg.sequences = cfg.sequences.map(function (seq, index) {
      var id = seq.id || newSequenceId(cfg.sequences.slice(0, index));
      if (seen[id]) id = newSequenceId(cfg.sequences);
      seen[id] = true;
      var name = (seq.name || "").trim() || "序列 " + id;
      if (!Array.isArray(seq.steps) || !seq.steps.length) {
        throw new Error("序列 " + id + " 至少需要一个 step");
      }
      if (seq.steps.length > MAX_STEPS) {
        throw new Error("序列 " + id + " step 数不能超过 " + MAX_STEPS);
      }
      var steps = seq.steps.map(function (step, si) {
        var s = normalizeStep(step, si);
        if (s.fromFrameId && !getFrame(cfg, s.fromFrameId)) {
          throw new Error("序列 " + id + " 引用未知 from 帧: " + s.fromFrameId);
        }
        if (s.toFrameId && !getFrame(cfg, s.toFrameId)) {
          throw new Error("序列 " + id + " 引用未知 to 帧: " + s.toFrameId);
        }
        return s;
      });
      return { id: id, name: name, steps: steps };
    });
    assertFrameLinkOccupancy(cfg);
    return cfg;
  }

  /** 从 steps 提取链路端点（Exit from / Enter to） */
  function getSequenceEndpoints(seq) {
    var fromFrameId = null;
    var toFrameId = null;
    if (!seq || !Array.isArray(seq.steps)) {
      return { fromFrameId: null, toFrameId: null };
    }
    for (var i = 0; i < seq.steps.length; i++) {
      var step = seq.steps[i];
      if (step.fromFrameId) fromFrameId = step.fromFrameId;
      if (step.toFrameId) toFrameId = step.toFrameId;
    }
    return { fromFrameId: fromFrameId, toFrameId: toFrameId };
  }

  function findSequenceByFromFrame(config, frameId, excludeSequenceId) {
    var list = config.sequences || [];
    for (var i = 0; i < list.length; i++) {
      var seq = list[i];
      if (excludeSequenceId && seq.id === excludeSequenceId) continue;
      if (getSequenceEndpoints(seq).fromFrameId === frameId) return seq;
    }
    return null;
  }

  function findSequenceByToFrame(config, frameId, excludeSequenceId) {
    var list = config.sequences || [];
    for (var i = 0; i < list.length; i++) {
      var seq = list[i];
      if (excludeSequenceId && seq.id === excludeSequenceId) continue;
      if (getSequenceEndpoints(seq).toFrameId === frameId) return seq;
    }
    return null;
  }

  function assertFrameLinkOccupancy(cfg) {
    var fromMap = {};
    var toMap = {};
    (cfg.sequences || []).forEach(function (seq) {
      var ends = getSequenceEndpoints(seq);
      if (!ends.fromFrameId || !ends.toFrameId) {
        throw new Error("序列 " + seq.id + " 须同时包含 Exit(from) 与 Enter(to) 帧");
      }
      if (ends.fromFrameId === ends.toFrameId) {
        throw new Error("序列 " + seq.id + " 的 from / to 帧不能相同");
      }
      if (fromMap[ends.fromFrameId]) {
        throw new Error(
          "帧 " + ends.fromFrameId + " 已被 " + fromMap[ends.fromFrameId] + " 作为起点占用"
        );
      }
      fromMap[ends.fromFrameId] = seq.id;
      if (toMap[ends.toFrameId]) {
        throw new Error("帧 " + ends.toFrameId + " 已被 " + toMap[ends.toFrameId] + " 作为终点占用");
      }
      toMap[ends.toFrameId] = seq.id;
    });
  }

  /** 从起始帧沿 from→to 链路向下追踪 */
  function buildChainFromFrame(config, startFrameId) {
    var chain = [];
    if (!startFrameId || !getFrame(config, startFrameId)) return chain;
    var current = startFrameId;
    var guard = 0;
    while (current && guard <= MAX_SEQUENCES) {
      guard++;
      var seq = findSequenceByFromFrame(config, current);
      if (!seq) break;
      chain.push(seq);
      current = getSequenceEndpoints(seq).toFrameId;
    }
    return chain;
  }

  /** 建议新建实例可用的 from / to 帧对（优先沿首帧主链向后延伸） */
  function suggestNextLinkFrames(config, excludeSequenceId) {
    var frames = config.frames || [];
    if (frames.length < 2) return null;

    function frameIndex(frameId) {
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].id === frameId) return i;
      }
      return -1;
    }

    function tryPair(fromId) {
      if (findSequenceByFromFrame(config, fromId, excludeSequenceId)) return null;
      var fromIdx = frameIndex(fromId);
      if (fromIdx < 0) return null;
      for (var j = fromIdx + 1; j < frames.length; j++) {
        var toId = frames[j].id;
        if (toId === fromId) continue;
        if (findSequenceByToFrame(config, toId, excludeSequenceId)) continue;
        return { fromFrameId: fromId, toFrameId: toId };
      }
      return null;
    }

    var chain = buildChainFromFrame(config, frames[0].id);
    var extendFrom = frames[0].id;
    if (chain.length) {
      var lastEnds = getSequenceEndpoints(chain[chain.length - 1]);
      if (lastEnds.toFrameId) extendFrom = lastEnds.toFrameId;
    }
    var extended = tryPair(extendFrom);
    if (extended) return extended;

    for (var i = 0; i < frames.length; i++) {
      var pair = tryPair(frames[i].id);
      if (pair) return pair;
    }
    return null;
  }

  function formatLinkLabel(config, seq) {
    var ends = getSequenceEndpoints(seq);
    var from = getFrame(config, ends.fromFrameId);
    var to = getFrame(config, ends.toFrameId);
    var fromLabel = from ? from.id + " · " + from.name : ends.fromFrameId || "?";
    var toLabel = to ? to.id + " · " + to.name : ends.toFrameId || "?";
    return fromLabel + " → " + toLabel;
  }

  function getSequence(config, sequenceId) {
    if (!config.sequences) return null;
    for (var i = 0; i < config.sequences.length; i++) {
      if (config.sequences[i].id === sequenceId) return config.sequences[i];
    }
    return null;
  }

  function upsertSequence(config, sequence) {
    var cfg = deepClone(config);
    if (!Array.isArray(cfg.sequences)) cfg.sequences = [];
    var idx = -1;
    for (var i = 0; i < cfg.sequences.length; i++) {
      if (cfg.sequences[i].id === sequence.id) {
        idx = i;
        break;
      }
    }
    var payload = {
      id: sequence.id || newSequenceId(cfg.sequences),
      name: (sequence.name || "").trim() || "新序列",
      steps: sequence.steps,
    };
    if (idx >= 0) cfg.sequences[idx] = payload;
    else {
      if (cfg.sequences.length >= MAX_SEQUENCES) {
        throw new Error("序列数不能超过 " + MAX_SEQUENCES);
      }
      cfg.sequences.push(payload);
    }
    normalizeSequences(cfg);
    return cfg;
  }

  function deleteSequence(config, sequenceId) {
    var cfg = deepClone(config);
    cfg.sequences = (cfg.sequences || []).filter(function (s) {
      return s.id !== sequenceId;
    });
    return cfg;
  }

  function createDefaultEliminateSequence(fromFrameId, toFrameId, effectId) {
    effectId = effectId || "bingo_frame";
    return {
      name: fromFrameId + " → " + toFrameId + " 消除",
      steps: [
        {
          id: "s1",
          type: "boardEliminate",
          fromFrameId: fromFrameId,
          toFrameId: toFrameId,
          params: {
            cells: "diff",
            cellList: [],
            effectId: effectId,
            anchor: "cellCenter",
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            stagger: 0.06,
            colOrder: "leftFirst",
            rowOrder: "bottomFirst",
            hideSymbolAt: "effectEnd",
            hideSymbolOffset: 0,
            delayAfter: 0,
          },
        },
        {
          id: "s2",
          type: "boardCascadeDrop",
          fromFrameId: fromFrameId,
          toFrameId: toFrameId,
          params: {
            cols: "affected",
            fallDuration: 0.35,
            rowStagger: 0.04,
            colStagger: 0.06,
            colOrder: "leftFirst",
            order: "bottomFirst",
            extraRisePx: 48,
            easing: "easeOutQuad",
            delayBefore: 0,
          },
        },
      ],
    };
  }

  function createSequenceFromPreset(fromFrameId, toFrameId, presetId, effectId) {
    presetId = presetId || "swapWave";
    if (presetId === "eliminateWave") {
      return createDefaultEliminateSequence(fromFrameId, toFrameId, effectId);
    }
    return createDefaultWaveSequence(fromFrameId, toFrameId);
  }

  function createDefaultWaveSequence(fromFrameId, toFrameId, enterType) {
    enterType = enterType || "boardDropIn";
    return {
      name: fromFrameId + " → " + toFrameId,
      steps: [
        {
          id: "s1",
          type: "boardDropOut",
          fromFrameId: fromFrameId,
          params: {
            scope: "board",
            cols: "all",
            colStagger: 0.08,
            colOrder: "leftFirst",
            fallDuration: 0.4,
            rowStagger: 0.1,
            order: "bottomFirst",
            extraFallPx: 48,
            easing: "easeInQuad",
            fadeOut: true,
            delayAfter: 0,
          },
        },
        {
          id: "s2",
          type: enterType,
          toFrameId: toFrameId,
          params: {
            scope: "board",
            cols: "all",
            colStagger: 0.08,
            colOrder: "leftFirst",
            fallDuration: 0.4,
            rowStagger: 0.1,
            order: "topFirst",
            extraRisePx: 48,
            easing: "easeOutQuad",
            fadeIn: true,
            delayBefore: 0,
          },
        },
      ],
    };
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
      cfg = migrateV4toV5(migrateV3toV4(raw));
    } else if (raw.version === 4) {
      cfg = migrateV4toV5(raw);
    } else if (raw.version === CONFIG_VERSION) {
      cfg = deepClone(raw);
    } else {
      throw new Error(
        "不支持的配置版本: " + raw.version + "（需要 " + CONFIG_VERSION + "、4 或 3）"
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
    normalizeSequences(cfg);
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
    MAX_SEQUENCES: MAX_SEQUENCES,
    VALID_STEP_TYPES: VALID_STEP_TYPES,
    LINK_PRESETS: LINK_PRESETS,
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
    getSequence: getSequence,
    upsertSequence: upsertSequence,
    deleteSequence: deleteSequence,
    createDefaultWaveSequence: createDefaultWaveSequence,
    createDefaultEliminateSequence: createDefaultEliminateSequence,
    createSequenceFromPreset: createSequenceFromPreset,
    computeEliminateCells: computeEliminateCells,
    findPriorStepOfType: findPriorStepOfType,
    getEliminateCellsForCascade: getEliminateCellsForCascade,
    configWithPostEliminateGrid: configWithPostEliminateGrid,
    normalizeSequences: normalizeSequences,
    getSequenceEndpoints: getSequenceEndpoints,
    findSequenceByFromFrame: findSequenceByFromFrame,
    findSequenceByToFrame: findSequenceByToFrame,
    buildChainFromFrame: buildChainFromFrame,
    suggestNextLinkFrames: suggestNextLinkFrames,
    formatLinkLabel: formatLinkLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
