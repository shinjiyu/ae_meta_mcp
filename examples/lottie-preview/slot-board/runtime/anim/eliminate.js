/**
 * eliminate — 格级消除 + 序列帧特效
 */
(function (global) {
  "use strict";

  var A = global.SlotBoardAnim;
  var SB = global.SlotBoardConfig;

  var DEFAULT_ELIMINATE = {
    cells: "diff",
    cellList: [],
    effectId: "bingo_frame",
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
  };

  function pickEliminateParams(opts) {
    return Object.assign({}, DEFAULT_ELIMINATE, opts || {});
  }

  function cellRect(config, col, row) {
    var layout = config.board.layout;
    var pad = layout.padding;
    var sw = layout.symbolW;
    var sh = layout.symbolH;
    var cg = layout.colGap;
    var rg = layout.rowGap;
    return {
      x: pad + col * (sw + cg),
      y: pad + row * (sh + rg),
      w: sw,
      h: sh,
    };
  }

  function anchorPoint(cell, anchor) {
    if (anchor === "cellTopLeft") return { x: cell.x, y: cell.y };
    if (anchor === "cellBottomCenter") {
      return { x: cell.x + cell.w / 2, y: cell.y + cell.h };
    }
    return { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 };
  }

  function computeEffectPlacement(config, col, row, manifest, params) {
    var cell = cellRect(config, col, row);
    var pt = anchorPoint(cell, params.anchor || "cellCenter");
    var scale = params.scale != null ? params.scale : 1;
    var ew = (manifest.cell && manifest.cell.w) || cell.w;
    var eh = (manifest.cell && manifest.cell.h) || cell.h;
    ew *= scale;
    eh *= scale;
    var ox = params.offsetX != null ? params.offsetX : 0;
    var oy = params.offsetY != null ? params.offsetY : 0;
    return {
      x: pt.x + ox - ew / 2,
      y: pt.y + oy - eh / 2,
      w: ew,
      h: eh,
    };
  }

  function orderCells(cells, colOrder, rowOrder) {
    var list = cells.slice();
    list.sort(function (a, b) {
      if (colOrder !== "simultaneous") {
        var colCmp =
          colOrder === "rightFirst" ? b.col - a.col : a.col - b.col;
        if (colCmp !== 0) return colCmp;
      }
      if (rowOrder === "simultaneous") return 0;
      return rowOrder === "topFirst" ? a.row - b.row : b.row - a.row;
    });
    return list;
  }

  function isEliminateSimultaneous(params) {
    params = pickEliminateParams(params);
    return (
      params.colOrder === "simultaneous" ||
      params.rowOrder === "simultaneous" ||
      params.stagger <= 0
    );
  }

  function cellStartDelay(index, params) {
    params = pickEliminateParams(params);
    if (isEliminateSimultaneous(params)) return 0;
    return index * params.stagger;
  }

  function playCellEffect(loaded, config, col, row, params, hooks) {
    var manifest = loaded.manifest;
    var frames = manifest.frames || [];
    var fps = manifest.fps || 24;
    var frameDelayMs =
      manifest.frameDelayMs != null
        ? manifest.frameDelayMs
        : Math.round(1000 / Math.max(1, fps));
    var durationSec = (frames.length * frameDelayMs) / 1000;
    var hideAtStart = params.hideSymbolAt === "effectStart";
    var hideAtOffset =
      params.hideSymbolAt === "timeOffset" &&
      params.hideSymbolOffset != null &&
      params.hideSymbolOffset >= 0;
    var hideOffsetMs = hideAtOffset ? params.hideSymbolOffset * 1000 : 0;

    return A.starterAnim(function (done) {
      var start = (global.performance || performance).now();
      var rafId = null;
      var hidden = false;

      function setHidden(val) {
        if (hidden === val) return;
        hidden = val;
        if (hooks.onHiddenChange) hooks.onHiddenChange(col, row, val);
      }

      function tick(now) {
        var elapsed = now - start;
        var frameIndex = Math.min(
          frames.length - 1,
          Math.floor(elapsed / frameDelayMs)
        );
        var frame = frames[frameIndex];
        var placement = computeEffectPlacement(config, col, row, manifest, params);
        var atlasRect = frame && frame.atlas ? frame.atlas : null;

        if (hideAtStart && frameIndex === 0) setHidden(true);
        if (hideAtOffset && elapsed >= hideOffsetMs) setHidden(true);
        if (!hideAtStart && !hideAtOffset && frameIndex >= frames.length - 1) setHidden(true);

        if (hooks.onEffectFrame) {
          hooks.onEffectFrame({
            col: col,
            row: row,
            placement: placement,
            atlasRect: atlasRect,
            frameIndex: frameIndex,
            image: loaded.atlas,
          });
        }

        if (elapsed >= frames.length * frameDelayMs) {
          setHidden(true);
          if (hooks.onEffectFrame) {
            hooks.onEffectFrame({ col: col, row: row, atlasRect: null });
          }
          done();
          return;
        }
        rafId = global.requestAnimationFrame(tick);
      }

      if (hideAtStart) setHidden(true);
      rafId = global.requestAnimationFrame(tick);

      return function () {
        if (rafId != null && global.cancelAnimationFrame) {
          global.cancelAnimationFrame(rafId);
        }
        if (hooks.onEffectFrame) {
          hooks.onEffectFrame({ col: col, row: row, atlasRect: null });
        }
      };
    });
  }

  function buildEliminateAnim(opts) {
    opts = opts || {};
    var config = opts.config;
    var step = opts.step;
    var hooks = opts.hooks || {};
    var onHiddenChange = hooks.onHiddenChange;
    var onEffectFrame = hooks.onEffectFrame;

    if (!config || !step) {
      throw new Error("buildEliminateAnim: config, step required");
    }

    var params = pickEliminateParams(
      Object.assign({}, step.params, {
        cells: step.params && step.params.cells,
        cellList: step.params && step.params.cellList,
      })
    );

    var cells = SB.computeEliminateCells(config, step);
    if (!cells.length) return A.call(function () {});

    cells = orderCells(cells, params.colOrder, params.rowOrder);

    return A.starterAnim(function (done) {
      var cancelled = false;
      var cancelInner = null;

      A.loadEffect(params.effectId)
        .then(function (loaded) {
          if (cancelled) return;
          var cellAnims = cells.map(function (cell, index) {
            return A.seq(
              A.delay(cellStartDelay(index, params)),
              playCellEffect(loaded, config, cell.col, cell.row, params, {
                onHiddenChange: onHiddenChange,
                onEffectFrame: onEffectFrame,
              })
            );
          });
          var body = A.par.apply(A, cellAnims);
          var chainAnim =
            params.delayAfter > 0
              ? A.seq(body, A.delay(params.delayAfter))
              : body;
          chainAnim
            .play()
            .then(function () {
              if (!cancelled) done();
            })
            .catch(function () {
              if (!cancelled) done();
            });
          cancelInner = chainAnim;
        })
        .catch(function (err) {
          if (!cancelled && hooks.onError) hooks.onError(err);
          done();
        });

      return function () {
        cancelled = true;
        if (cancelInner && cancelInner.cancel) cancelInner.cancel();
      };
    });
  }

  A.DEFAULT_ELIMINATE = DEFAULT_ELIMINATE;
  A.buildEliminateAnim = buildEliminateAnim;
  A.computeEffectPlacement = computeEffectPlacement;
  A.isEliminateSimultaneous = isEliminateSimultaneous;
  A.cellStartDelayForEliminate = cellStartDelay;
  A.orderEliminateCells = orderCells;
})(typeof window !== "undefined" ? window : globalThis);
