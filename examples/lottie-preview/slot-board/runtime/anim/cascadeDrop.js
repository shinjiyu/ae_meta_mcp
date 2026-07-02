/**
 * cascadeDrop — 消除后列内重力下落（from 帧 → to 帧）
 * 消除格必须来自前序 boardEliminate 步骤（含手动点选 cellList）
 */
(function (global) {
  "use strict";

  var A = global.SlotBoardAnim;
  var SB = global.SlotBoardConfig;
  var applyEasing = A.applyEasing;
  var resolveDropOutColumns = A.resolveDropOutColumns;

  var DEFAULT_CASCADE = {
    fallDuration: 0.35,
    rowStagger: 0.04,
    colStagger: 0.06,
    colOrder: "leftFirst",
    order: "bottomFirst",
    extraRisePx: 48,
    easing: "easeOutQuad",
    delayBefore: 0,
    cols: "affected",
  };

  function pickCascadeParams(opts) {
    return Object.assign({}, DEFAULT_CASCADE, opts || {});
  }

  function cellStride(config) {
    var layout = config.board.layout;
    return layout.symbolH + layout.rowGap;
  }

  function computeRiseDistance(config, row, extraPx) {
    var layout = config.board.layout;
    var pad = layout.padding;
    var sh = layout.symbolH;
    var rg = layout.rowGap;
    var cellY = pad + row * (sh + rg);
    return cellY + (extraPx || 0);
  }

  function eliminatedMapFrom(cells) {
    var map = {};
    (cells || []).forEach(function (c) {
      map[c.col + "," + c.row] = true;
    });
    return map;
  }

  /**
   * @param {object} config — 可为 post-eliminate 网格（消除格已为 null）
   * @param {object} step — boardCascadeDrop step（from/to 帧）
   * @param {Array<{col,row}>} eliminatedCells — 前序消除步骤的格列表
   */
  function computeCascadeMoves(config, step, eliminatedCells) {
    var fromId = step.fromFrameId;
    var toId = step.toFrameId;
    if (!fromId || !toId) return [];

    var fromFrame = SB.getFrame(config, fromId);
    var toFrame = SB.getFrame(config, toId);
    if (!fromFrame || !toFrame) return [];

    var eliminated =
      eliminatedCells && eliminatedCells.length
        ? eliminatedCells
        : SB.getEliminateCellsForCascade(config, step, null);
    var eliminatedMap = eliminatedMapFrom(eliminated);

    var fromGrid = fromFrame.grid || [];
    var cols = config.board.cols;
    var rows = config.board.rows;
    var moves = [];

    for (var c = 0; c < cols; c++) {
      var fromList = [];
      var r;
      for (r = rows - 1; r >= 0; r--) {
        if (eliminatedMap[c + "," + r]) continue;
        var fs = fromGrid[r] ? fromGrid[r][c] : null;
        if (fs) fromList.push({ row: r, sym: fs });
      }
      var toList = [];
      for (r = rows - 1; r >= 0; r--) {
        var ts = toFrame.grid[r] ? toFrame.grid[r][c] : null;
        if (ts) toList.push({ row: r, sym: ts });
      }
      if (!toList.length) continue;

      var newCount = Math.max(0, toList.length - fromList.length);
      for (var i = 0; i < toList.length; i++) {
        var target = toList[i];
        if (i >= toList.length - newCount) {
          moves.push({
            col: c,
            fromRow: null,
            toRow: target.row,
            sym: target.sym,
            isNew: true,
          });
          continue;
        }
        var source = fromList[i];
        if (source.row === target.row && source.sym === target.sym) continue;
        moves.push({
          col: c,
          fromRow: source.row,
          toRow: target.row,
          sym: target.sym,
          isNew: false,
        });
      }
    }
    return moves;
  }

  function affectedColumns(eliminatedCells) {
    var set = {};
    (eliminatedCells || []).forEach(function (c) {
      set[c.col] = true;
    });
    return Object.keys(set)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
  }

  function resolveCascadeColumns(config, step, params, eliminatedCells) {
    if (params.cols === "all") {
      return resolveDropOutColumns(config, "all");
    }
    var affected = affectedColumns(eliminatedCells);
    return affected.length ? affected : resolveDropOutColumns(config, "all");
  }

  function trace(scope, event, data) {
    if (global.SBTrace && global.SBTrace.log) {
      global.SBTrace.log(scope, event, data);
    }
  }

  function tweenCascadeMove(move, config, params, onUpdate, onHiddenChange) {
    var stride = cellStride(config);
    var startDy = move.isNew
      ? -computeRiseDistance(config, move.toRow, params.extraRisePx)
      : (move.fromRow - move.toRow) * stride;

    function emit(col, row, dy, alpha) {
      onUpdate(col, row, dy, alpha, move.sym);
    }

    function hideSourceIfNeeded() {
      if (
        !move.isNew &&
        move.fromRow != null &&
        move.fromRow !== move.toRow &&
        onHiddenChange
      ) {
        onHiddenChange(move.col, move.fromRow, true);
      }
    }

    return A.starterAnim(function (done) {
      var start = (global.performance || performance).now();
      var rafId = null;
      var durationMs = Math.max(1, params.fallDuration * 1000);
      var lastLoggedT = -1;

      function tick(now) {
        var t = Math.min(1, (now - start) / durationMs);
        var eased = applyEasing(params.easing, t);
        var dy = startDy * (1 - eased);
        emit(move.col, move.toRow, dy, 1);
        if (lastLoggedT < 0 || t >= 1 || (t >= 0.5 && lastLoggedT < 0.5)) {
          trace("cascade", "tween", {
            col: move.col,
            fromRow: move.fromRow,
            toRow: move.toRow,
            isNew: !!move.isNew,
            sym: move.sym,
            t: Math.round(t * 100) / 100,
            dy: Math.round(dy * 10) / 10,
            startDy: Math.round(startDy * 10) / 10,
          });
          lastLoggedT = t;
        }
        if (t < 1) {
          rafId = global.requestAnimationFrame(tick);
        } else {
          emit(move.col, move.toRow, 0, 1);
          trace("cascade", "tweenDone", {
            col: move.col,
            toRow: move.toRow,
            sym: move.sym,
          });
          done();
        }
      }

      trace("cascade", "tweenStart", {
        col: move.col,
        fromRow: move.fromRow,
        toRow: move.toRow,
        isNew: !!move.isNew,
        sym: move.sym,
        startDy: Math.round(startDy * 10) / 10,
        fallDuration: params.fallDuration,
      });
      hideSourceIfNeeded();
      emit(move.col, move.toRow, startDy, 1);
      rafId = global.requestAnimationFrame(tick);

      return function () {
        if (rafId != null && global.cancelAnimationFrame) {
          global.cancelAnimationFrame(rafId);
        }
      };
    });
  }

  function buildCascadeDropAnim(opts) {
    opts = opts || {};
    var config = opts.config;
    var step = opts.step;
    var onUpdate = opts.onUpdate;
    var onHiddenChange = opts.onHiddenChange;
    var onComplete = opts.onComplete;
    var eliminatedCells = opts.eliminatedCells;
    if (!config || !step || !onUpdate) {
      throw new Error("buildCascadeDropAnim: config, step, onUpdate required");
    }
    if (!eliminatedCells || !eliminatedCells.length) {
      throw new Error("boardCascadeDrop: 缺少消除格（需前序消除步骤的选中格）");
    }

    var params = pickCascadeParams(step.params);
    var allMoves = computeCascadeMoves(config, step, eliminatedCells);
    var colSet = {};
    resolveCascadeColumns(config, step, params, eliminatedCells).forEach(function (c) {
      colSet[c] = true;
    });
    var moves = allMoves.filter(function (m) {
      return colSet[m.col];
    });
    if (!moves.length) {
      throw new Error("没有可下落的符号（检查 from/to 帧与消除格）");
    }

    trace("cascade", "build", {
      fromFrameId: step.fromFrameId,
      toFrameId: step.toFrameId,
      eliminated: eliminatedCells,
      moveCount: moves.length,
      moves: moves.map(function (m) {
        return {
          col: m.col,
          fromRow: m.fromRow,
          toRow: m.toRow,
          isNew: !!m.isNew,
          sym: m.sym,
        };
      }),
    });

    var rowOrder = [];
    var r;
    for (r = 0; r < config.board.rows; r++) rowOrder.push(r);
    if (params.order === "bottomFirst") rowOrder.reverse();

    function prime() {
      trace("cascade", "prime", {
        hideEliminated: eliminatedCells,
      });
      eliminatedCells.forEach(function (c) {
        if (onHiddenChange) onHiddenChange(c.col, c.row, true);
      });
    }

    var colToMoves = {};
    moves.forEach(function (move) {
      if (!colToMoves[move.col]) colToMoves[move.col] = [];
      colToMoves[move.col].push(move);
    });

    var cols = Object.keys(colToMoves)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    if (params.colOrder === "rightFirst") cols.reverse();

    var colParts = [];
    var playIndex = 0;
    cols.forEach(function (col) {
      var list = colToMoves[col];
      list.sort(function (a, b) {
        var ai = rowOrder.indexOf(a.toRow);
        var bi = rowOrder.indexOf(b.toRow);
        return ai - bi;
      });
      var rowParts = [];
      var staggerIndex = 0;
      list.forEach(function (move) {
        var delaySec = staggerIndex * params.rowStagger;
        staggerIndex++;
        rowParts.push(
          A.seq(
            A.delay(delaySec),
            tweenCascadeMove(move, config, params, onUpdate, onHiddenChange)
          )
        );
      });
      var colAnim = rowParts.length ? A.par.apply(A, rowParts) : A.call(function () {});
      var colDelay =
        params.colOrder === "simultaneous" ? 0 : playIndex * params.colStagger;
      playIndex++;
      colParts.push(A.seq(A.delay(colDelay), colAnim));
    });

    var body = A.par.apply(A, colParts);
    var chain = A.seq(A.call(prime), body);
    if (params.delayBefore > 0) {
      chain = A.seq(A.delay(params.delayBefore), chain);
    }
    if (onComplete) {
      return A.seq(
        chain,
        A.call(function () {
          onComplete(step.toFrameId);
        })
      );
    }
    return chain;
  }

  A.DEFAULT_CASCADE = DEFAULT_CASCADE;
  A.computeCascadeMoves = computeCascadeMoves;
  A.buildCascadeDropAnim = buildCascadeDropAnim;
})(typeof window !== "undefined" ? window : globalThis);
