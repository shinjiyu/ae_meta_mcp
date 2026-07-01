/**
 * dropOut — 单列 / 整盘重力落出（IAnim 组合）
 *
 * buildDropOutAnim({ scope: 'column'|'board', ... })
 *   column → buildColumnDropOutAnim
 *   board  → par(seq(colStagger, columnAnim)…)
 */
(function (global) {
  "use strict";

  var A = global.SlotBoardAnim;
  var applyEasing = A.applyEasing;

  var DEFAULT_DROP_OUT = {
    fallDuration: 0.4,
    rowStagger: 0.1,
    order: "bottomFirst",
    extraFallPx: 48,
    easing: "easeInQuad",
    fadeOut: true,
    colStagger: 0.08,
    colOrder: "leftFirst",
    delayAfter: 0,
  };

  function computeCellFallDistance(config, row, extraPx) {
    var size = global.SlotBoardConfig.computeBoardSize(config);
    var layout = config.board.layout;
    var pad = layout.padding;
    var sh = layout.symbolH;
    var rg = layout.rowGap;
    var cellY = pad + row * (sh + rg);
    return size.height - cellY + (extraPx || 0);
  }

  function applyEasingLocal(name, t) {
    return applyEasing(name, t);
  }

  function tweenCellFall(col, row, distance, durationSec, easing, onUpdate, fadeOut) {
    return A.starterAnim(function (done) {
      var start = (global.performance || performance).now();
      var rafId = null;
      var durationMs = Math.max(1, durationSec * 1000);

      function tick(now) {
        var t = Math.min(1, (now - start) / durationMs);
        var eased = applyEasingLocal(easing, t);
        var dy = distance * eased;
        var alpha = 1;
        if (fadeOut && t > 0.82) {
          alpha = Math.max(0, 1 - (t - 0.82) / 0.18);
        }
        onUpdate(col, row, dy, alpha);
        if (t < 1) {
          rafId = global.requestAnimationFrame(tick);
        } else {
          onUpdate(col, row, distance, 0);
          done();
        }
      }

      onUpdate(col, row, 0, 1);
      rafId = global.requestAnimationFrame(tick);

      return function () {
        if (rafId != null && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
      };
    });
  }

  function countFilledInColumn(grid, col) {
    var n = 0;
    if (!grid) return n;
    for (var r = 0; r < grid.length; r++) {
      if (grid[r] && grid[r][col]) n++;
    }
    return n;
  }

  function orderColumnIndices(indices, colOrder) {
    var list = indices.slice();
    if (colOrder === "rightFirst") list.reverse();
    return list;
  }

  /**
   * @param {object} config
   * @param {'all'|number|number[]|null|undefined} colsSpec
   * @returns {number[]}
   */
  function resolveDropOutColumns(config, colsSpec) {
    var total = config.board.cols;
    var all = [];
    var c;
    for (c = 0; c < total; c++) all.push(c);

    if (colsSpec == null || colsSpec === "all") return all;

    if (typeof colsSpec === "number") {
      var col = Math.max(0, Math.min(total - 1, colsSpec));
      return [col];
    }

    if (Array.isArray(colsSpec)) {
      var seen = {};
      var out = [];
      for (c = 0; c < colsSpec.length; c++) {
        var idx = Math.max(0, Math.min(total - 1, Number(colsSpec[c])));
        if (!seen[idx]) {
          seen[idx] = true;
          out.push(idx);
        }
      }
      out.sort(function (a, b) {
        return a - b;
      });
      return out;
    }

    return all;
  }

  function pickDropOutParams(opts) {
    return {
      fallDuration:
        opts.fallDuration != null ? opts.fallDuration : DEFAULT_DROP_OUT.fallDuration,
      rowStagger: opts.rowStagger != null ? opts.rowStagger : DEFAULT_DROP_OUT.rowStagger,
      order: opts.order === "topFirst" ? "topFirst" : "bottomFirst",
      extraFallPx: opts.extraFallPx != null ? opts.extraFallPx : DEFAULT_DROP_OUT.extraFallPx,
      easing: opts.easing || DEFAULT_DROP_OUT.easing,
      fadeOut: opts.fadeOut !== false,
      delayAfter: opts.delayAfter != null ? opts.delayAfter : DEFAULT_DROP_OUT.delayAfter,
    };
  }

  function wrapDelayAfter(anim, delayAfter) {
    if (!delayAfter || delayAfter <= 0) return anim;
    return A.seq(anim, A.delay(delayAfter));
  }

  /**
   * @param {object} opts
   * @param {number} opts.col
   * @param {object} opts.config
   * @param {function(number,number,number,number)} opts.onUpdate
   */
  function buildColumnDropOutAnim(opts) {
    opts = opts || {};
    var col = opts.col;
    var config = opts.config;
    var onUpdate = opts.onUpdate;
    var params = pickDropOutParams(opts);

    if (col == null || !config || !onUpdate) {
      throw new Error("buildColumnDropOutAnim: col, config, onUpdate required");
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

      var distance = computeCellFallDistance(config, r, params.extraFallPx);
      var delaySec = staggerIndex * params.rowStagger;
      staggerIndex++;

      parts.push(
        A.seq(
          A.delay(delaySec),
          tweenCellFall(
            col,
            r,
            distance,
            params.fallDuration,
            params.easing,
            onUpdate,
            params.fadeOut
          )
        )
      );
    }

    if (!parts.length) return A.call(function () {});
    return A.par.apply(A, parts);
  }

  /**
   * @param {object} opts
   * @param {object} opts.config
   * @param {'all'|number|number[]} [opts.cols='all']
   * @param {number} [opts.colStagger=0.08]
   * @param {'leftFirst'|'rightFirst'|'simultaneous'} [opts.colOrder='leftFirst']
   * @param {function(number,number,number,number)} opts.onUpdate
   */
  function buildBoardDropOutAnim(opts) {
    opts = opts || {};
    var config = opts.config;
    var onUpdate = opts.onUpdate;
    if (!config || !onUpdate) {
      throw new Error("buildBoardDropOutAnim: config, onUpdate required");
    }

    var colStagger =
      opts.colStagger != null ? opts.colStagger : DEFAULT_DROP_OUT.colStagger;
    var colOrder = opts.colOrder || DEFAULT_DROP_OUT.colOrder;
    var cols = resolveDropOutColumns(config, opts.cols != null ? opts.cols : "all");
    cols = orderColumnIndices(cols, colOrder === "rightFirst" ? "rightFirst" : "leftFirst");

    var grid = config.grid || [];
    var parts = [];
    var playIndex = 0;

    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      if (!countFilledInColumn(grid, col)) continue;

      var colAnim = buildColumnDropOutAnim(
        Object.assign({}, opts, pickDropOutParams(opts), { col: col, delayAfter: 0 })
      );
      var delaySec = colOrder === "simultaneous" ? 0 : playIndex * colStagger;
      playIndex++;
      parts.push(A.seq(A.delay(delaySec), colAnim));
    }

    if (!parts.length) return A.call(function () {});
    return wrapDelayAfter(A.par.apply(A, parts), pickDropOutParams(opts).delayAfter);
  }

  /**
   * @param {object} opts
   * @param {'column'|'board'} [opts.scope='board']
   */
  function buildDropOutAnim(opts) {
    opts = opts || {};
    var scope = opts.scope;
    if (!scope) {
      scope = opts.col != null && opts.cols == null ? "column" : "board";
    }
    if (scope === "column") {
      return wrapDelayAfter(buildColumnDropOutAnim(opts), pickDropOutParams(opts).delayAfter);
    }
    return buildBoardDropOutAnim(opts);
  }

  function summarizeDropOut(config, opts) {
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
    return {
      scope: "board",
      columns: cols,
      symbolCount: total,
    };
  }

  A.DEFAULT_DROP_OUT = DEFAULT_DROP_OUT;
  A.computeCellFallDistance = computeCellFallDistance;
  A.resolveDropOutColumns = resolveDropOutColumns;
  A.countFilledInColumn = countFilledInColumn;
  A.buildColumnDropOutAnim = buildColumnDropOutAnim;
  A.buildBoardDropOutAnim = buildBoardDropOutAnim;
  A.buildDropOutAnim = buildDropOutAnim;
  A.summarizeDropOut = summarizeDropOut;
})(typeof window !== "undefined" ? window : globalThis);
