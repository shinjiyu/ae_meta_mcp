/**
 * dropIn — 单列 / 整盘重力落入（enter 模板）
 */
(function (global) {
  "use strict";

  var A = global.SlotBoardAnim;
  var applyEasing = A.applyEasing;
  var resolveDropOutColumns = A.resolveDropOutColumns;
  var countFilledInColumn = A.countFilledInColumn;

  var DEFAULT_DROP_IN = {
    fallDuration: 0.4,
    rowStagger: 0.1,
    order: "topFirst",
    extraRisePx: 48,
    easing: "easeOutQuad",
    fadeIn: true,
    colStagger: 0.08,
    colOrder: "leftFirst",
    delayBefore: 0,
  };

  function computeCellRiseDistance(config, row, extraPx) {
    var layout = config.board.layout;
    var pad = layout.padding;
    var sh = layout.symbolH;
    var rg = layout.rowGap;
    var cellY = pad + row * (sh + rg);
    // 负 dy 向上偏移：起点在盘面上方 cellY + dy <= -extra
    return cellY + (extraPx || 0);
  }

  function tweenCellRise(col, row, distance, durationSec, easing, onUpdate, fadeIn) {
    return A.starterAnim(function (done) {
      var start = (global.performance || performance).now();
      var rafId = null;
      var durationMs = Math.max(1, durationSec * 1000);

      function tick(now) {
        var t = Math.min(1, (now - start) / durationMs);
        var eased = applyEasing(easing, t);
        var dy = -distance * (1 - eased);
        var alpha = 1;
        if (fadeIn && t < 0.18) {
          alpha = t / 0.18;
        }
        onUpdate(col, row, dy, alpha);
        if (t < 1) {
          rafId = global.requestAnimationFrame(tick);
        } else {
          onUpdate(col, row, 0, 1);
          done();
        }
      }

      onUpdate(col, row, -distance, fadeIn ? 0 : 1);
      rafId = global.requestAnimationFrame(tick);

      return function () {
        if (rafId != null && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
      };
    });
  }

  function pickDropInParams(opts) {
    return {
      fallDuration:
        opts.fallDuration != null ? opts.fallDuration : DEFAULT_DROP_IN.fallDuration,
      rowStagger: opts.rowStagger != null ? opts.rowStagger : DEFAULT_DROP_IN.rowStagger,
      order: opts.order === "bottomFirst" ? "bottomFirst" : "topFirst",
      extraRisePx:
        opts.extraRisePx != null
          ? opts.extraRisePx
          : opts.extraFallPx != null
            ? opts.extraFallPx
            : DEFAULT_DROP_IN.extraRisePx,
      easing: opts.easing || DEFAULT_DROP_IN.easing,
      fadeIn: opts.fadeIn !== false,
      delayBefore: opts.delayBefore != null ? opts.delayBefore : DEFAULT_DROP_IN.delayBefore,
    };
  }

  /** Enter 初始态：所有待落入符号在屏外且不可见 */
  function primeEnterBoard(config, opts, onUpdate) {
    if (!config || !onUpdate) return;
    var params = pickDropInParams(opts || {});
    var cols = resolveDropOutColumns(config, opts && opts.cols != null ? opts.cols : "all");
    if (opts && opts.col != null && opts.cols == null) {
      cols = resolveDropOutColumns(config, opts.col);
    }
    var grid = config.grid || [];
    var rows = config.board.rows;
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      for (var r = 0; r < rows; r++) {
        var sym = grid[r] ? grid[r][col] : null;
        if (!sym) continue;
        var distance = computeCellRiseDistance(config, r, params.extraRisePx);
        onUpdate(col, r, -distance, params.fadeIn ? 0 : 1);
      }
    }
  }

  function wrapEnterAnim(config, opts, onUpdate, body) {
    var params = pickDropInParams(opts || {});
    var prime = A.call(function () {
      primeEnterBoard(config, opts, onUpdate);
    });
    if (params.delayBefore > 0) {
      return A.seq(prime, A.delay(params.delayBefore), body);
    }
    return A.seq(prime, body);
  }

  function buildColumnDropInAnim(opts) {
    opts = opts || {};
    var col = opts.col;
    var config = opts.config;
    var onUpdate = opts.onUpdate;
    var params = pickDropInParams(opts);

    if (col == null || !config || !onUpdate) {
      throw new Error("buildColumnDropInAnim: col, config, onUpdate required");
    }

    var rows = config.board.rows;
    var grid = config.grid || [];
    var rowOrder = [];
    var r;
    for (r = 0; r < rows; r++) rowOrder.push(r);
    if (params.order === "bottomFirst") rowOrder.reverse();

    var parts = [];
    var staggerIndex = 0;
    for (var i = 0; i < rowOrder.length; i++) {
      r = rowOrder[i];
      var sym = grid[r] ? grid[r][col] : null;
      if (!sym) continue;

      var distance = computeCellRiseDistance(config, r, params.extraRisePx);
      var delaySec = staggerIndex * params.rowStagger;
      staggerIndex++;

      parts.push(
        A.seq(
          A.delay(delaySec),
          tweenCellRise(
            col,
            r,
            distance,
            params.fallDuration,
            params.easing,
            onUpdate,
            params.fadeIn
          )
        )
      );
    }

    if (!parts.length) return A.call(function () {});
    return A.par.apply(A, parts);
  }

  function buildBoardDropInAnim(opts) {
    opts = opts || {};
    var config = opts.config;
    var onUpdate = opts.onUpdate;
    if (!config || !onUpdate) {
      throw new Error("buildBoardDropInAnim: config, onUpdate required");
    }

    var colStagger = opts.colStagger != null ? opts.colStagger : DEFAULT_DROP_IN.colStagger;
    var colOrder = opts.colOrder || DEFAULT_DROP_IN.colOrder;
    var cols = resolveDropOutColumns(config, opts.cols != null ? opts.cols : "all");
    if (colOrder === "rightFirst") cols = cols.slice().reverse();

    var grid = config.grid || [];
    var parts = [];
    var playIndex = 0;

    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      if (!countFilledInColumn(grid, col)) continue;

      var colAnim = buildColumnDropInAnim(
        Object.assign({}, opts, pickDropInParams(opts), { col: col })
      );
      var delaySec = colOrder === "simultaneous" ? 0 : playIndex * colStagger;
      playIndex++;
      parts.push(A.seq(A.delay(delaySec), colAnim));
    }

    if (!parts.length) return A.call(function () {});
    var body = A.par.apply(A, parts);
    return wrapEnterAnim(config, opts, onUpdate, body);
  }

  function buildDropInAnim(opts) {
    opts = opts || {};
    var scope = opts.scope;
    if (!scope) {
      scope = opts.col != null && opts.cols == null ? "column" : "board";
    }
    if (scope === "column") {
      var colAnim = buildColumnDropInAnim(opts);
      return wrapEnterAnim(opts.config, opts, opts.onUpdate, colAnim);
    }
    return buildBoardDropInAnim(opts);
  }

  function summarizeDropIn(config, opts) {
    opts = opts || {};
    var scope = opts.scope || "board";
    if (scope === "column") {
      var col = resolveDropOutColumns(config, opts.col != null ? opts.col : 0)[0];
      return {
        scope: "column",
        columns: [col],
        symbolCount: countFilledInColumn(config.grid, col),
      };
    }
    var cols = resolveDropOutColumns(config, opts.cols != null ? opts.cols : "all");
    var total = 0;
    for (var i = 0; i < cols.length; i++) {
      total += countFilledInColumn(config.grid, cols[i]);
    }
    return { scope: "board", columns: cols, symbolCount: total };
  }

  A.DEFAULT_DROP_IN = DEFAULT_DROP_IN;
  A.computeCellRiseDistance = computeCellRiseDistance;
  A.primeEnterBoard = primeEnterBoard;
  A.buildColumnDropInAnim = buildColumnDropInAnim;
  A.buildBoardDropInAnim = buildBoardDropInAnim;
  A.buildDropInAnim = buildDropInAnim;
  A.summarizeDropIn = summarizeDropIn;
})(typeof window !== "undefined" ? window : globalThis);
