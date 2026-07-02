/**
 * SBTrace — slot-board 诊断日志（Remote Console 可检索 [SBTrace]）
 *
 * 默认开启；URL ?sbTrace=0 或 localStorage sbTrace=0 可关闭。
 */
(function (global) {
  "use strict";

  var PREFIX = "[SBTrace]";
  var throttleMap = {};
  var RING_KEY = "sbTraceRing";
  var RING_MAX = 400;

  function hasLocation() {
    return typeof global.location !== "undefined" && global.location.search != null;
  }

  function isEnabled() {
    if (hasLocation()) {
      var p = new URLSearchParams(global.location.search);
      if (p.get("sbTrace") === "0") return false;
      if (p.get("sbTrace") === "1") return true;
    }
    try {
      if (global.localStorage && global.localStorage.getItem("sbTrace") === "0") {
        return false;
      }
    } catch (e) {
      /* ignore */
    }
    return hasLocation();
  }

  function safeJson(obj) {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return String(obj);
    }
  }

  function pushRing(scope, event, data) {
    if (typeof global.sessionStorage === "undefined") return;
    try {
      var ring = JSON.parse(global.sessionStorage.getItem(RING_KEY) || "[]");
      ring.push({
        t: Date.now(),
        scope: scope,
        event: event,
        data: data,
      });
      if (ring.length > RING_MAX) ring = ring.slice(-RING_MAX);
      global.sessionStorage.setItem(RING_KEY, JSON.stringify(ring));
    } catch (e) {
      /* ignore */
    }
  }

  function exportLogs() {
    if (typeof global.sessionStorage === "undefined") return [];
    try {
      return JSON.parse(global.sessionStorage.getItem(RING_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function log(scope, event, data) {
    if (!isEnabled()) return;
    pushRing(scope, event, data);
    var head = PREFIX + ":" + scope + " " + event;
    if (data === undefined) {
      console.info(head);
      return;
    }
    if (typeof data === "string") {
      console.info(head + " " + data);
      return;
    }
    console.info(head, safeJson(data));
  }

  function once(key, scope, event, data) {
    if (throttleMap[key]) return;
    throttleMap[key] = true;
    log(scope, event, data);
  }

  function resetThrottle() {
    throttleMap = {};
  }

  function symShort(sym) {
    if (!sym) return ".";
    return String(sym).replace(/\.png$/i, "").slice(0, 8);
  }

  function compactGrid(config) {
    if (!config || !config.board) return [];
    var rows = config.board.rows;
    var cols = config.board.cols;
    var grid = config.grid || [];
    var lines = [];
    var r;
    for (r = 0; r < rows; r++) {
      var parts = [];
      var c;
      for (c = 0; c < cols; c++) {
        parts.push(symShort(grid[r] ? grid[r][c] : null));
      }
      lines.push("r" + r + " " + parts.join("|"));
    }
    return lines;
  }

  function animStateSummary(animState) {
    if (!animState) return { hidden: [], offsets: [] };
    var hidden = animState.hiddenCells
      ? Object.keys(animState.hiddenCells).sort()
      : [];
    var offsets = [];
    if (animState.offsets) {
      Object.keys(animState.offsets)
        .sort()
        .forEach(function (key) {
          var o = animState.offsets[key];
          offsets.push({
            cell: key,
            dy: o.dy != null ? Math.round(o.dy * 10) / 10 : 0,
            alpha: o.alpha != null ? o.alpha : 1,
            sym: o.sym || null,
          });
        });
    }
    return { hidden: hidden, offsets: offsets, enterMode: !!animState.enterMode };
  }

  function boardSnapshot(label, config, animState, extra) {
    log("board", label, Object.assign(
      {
        grid: compactGrid(config),
        anim: animStateSummary(animState),
      },
      extra || {}
    ));
  }

  function wrapAnimHooks(hooks, meta) {
    if (!isEnabled() || !hooks) return hooks;
    meta = meta || {};
    var out = Object.assign({}, hooks);

    if (hooks.onOffsetsReset) {
      out.onOffsetsReset = function () {
        log("anim", "offsetsReset", meta);
        resetThrottle();
        return hooks.onOffsetsReset.apply(this, arguments);
      };
    }

    if (hooks.onStepStart) {
      out.onStepStart = function (step, runtimeConfig, stepIndex) {
        log("anim", "stepStart", {
          type: step && step.type,
          stepIndex: stepIndex,
          fromFrameId: step && step.fromFrameId,
          toFrameId: step && step.toFrameId,
          grid: compactGrid(runtimeConfig),
          meta: meta,
        });
        return hooks.onStepStart.apply(this, arguments);
      };
    }

    if (hooks.onHiddenChange) {
      out.onHiddenChange = function (col, row, hidden) {
        log("anim", "hiddenChange", {
          cell: col + "," + row,
          hidden: !!hidden,
          meta: meta,
        });
        return hooks.onHiddenChange.apply(this, arguments);
      };
    }

    if (hooks.onUpdate) {
      var updateByCell = {};
      out.onUpdate = function (col, row, dy, alpha, sym) {
        if (meta.traceAllOffsets || sym) {
          var key = col + "," + row;
          var prev = updateByCell[key] || 0;
          updateByCell[key] = prev + 1;
          var n = updateByCell[key];
          if (n <= 2 || n % 20 === 0 || Math.abs(dy) < 1.5) {
            log("anim", "offsetUpdate", {
              cell: key,
              dy: Math.round(dy * 10) / 10,
              alpha: alpha,
              sym: sym || null,
              n: n,
              meta: meta,
            });
          }
        }
        return hooks.onUpdate.apply(this, arguments);
      };
    }

    if (hooks.onCascadeComplete) {
      out.onCascadeComplete = function (toFrameId) {
        log("anim", "cascadeComplete", { toFrameId: toFrameId, meta: meta });
        return hooks.onCascadeComplete.apply(this, arguments);
      };
    }

    return out;
  }

  global.SBTrace = {
    PREFIX: PREFIX,
    isEnabled: isEnabled,
    log: log,
    once: once,
    resetThrottle: resetThrottle,
    compactGrid: compactGrid,
    animStateSummary: animStateSummary,
    boardSnapshot: boardSnapshot,
    wrapAnimHooks: wrapAnimHooks,
    exportLogs: exportLogs,
    copyLogs: function () {
      var text = safeJson(exportLogs());
      if (typeof global.navigator !== "undefined" && global.navigator.clipboard) {
        return global.navigator.clipboard.writeText(text);
      }
      console.info(PREFIX + " logs", text);
      return Promise.resolve(text);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
