/**
 * Slot board runtime — Canvas 2D 预览（v3）。
 * canvas 逻辑像素 = CSS 像素 = AE 像素；可选 720×1280 合成框与预览缩放。
 */
(function (global) {
  "use strict";

  var RULER = 20;
  var REF_BAR = 100;

  var COLORS = {
    bg: "rgba(26, 16, 40, 0.92)",
    cellFill: "rgba(255, 255, 255, 0.05)",
    cellStroke: "rgba(255, 255, 255, 0.12)",
    border: "rgba(56, 189, 248, 0.55)",
    label: "rgba(148, 163, 184, 0.75)",
    dimLabel: "rgba(249, 115, 22, 0.95)",
    rulerBg: "#0b1220",
    rulerTick: "rgba(148, 163, 184, 0.55)",
    rulerText: "rgba(148, 163, 184, 0.9)",
    rulerAccent: "#f97316",
    guideMajor: "rgba(56, 189, 248, 0.35)",
    guideMinor: "rgba(56, 189, 248, 0.12)",
    guideEdge: "rgba(249, 115, 22, 0.7)",
    guideCell: "rgba(167, 139, 250, 0.45)",
    selectStroke: "rgba(56, 189, 248, 0.95)",
    compBg: "#05060a",
    compBorder: "rgba(148, 163, 184, 0.35)",
    compLabel: "rgba(148, 163, 184, 0.65)",
  };

  var DEFAULT_VIEW = {
    showRulers: false,
    showGuides: false,
    previewMode: "board",
    previewZoom: 1,
  };

  function SlotBoardRuntime(container, config, viewOptions) {
    this.container = container;
    this.config = config;
    this.viewOptions = Object.assign({}, DEFAULT_VIEW, viewOptions || {});
    this.stage = null;
    this.canvas = null;
    this.guideCanvas = null;
    this.zoomShell = null;
    this._cols = config.board.cols;
    this._rows = config.board.rows;
    this.render();
  }

  SlotBoardRuntime.prototype.getSize = function () {
    return SlotBoardConfig.computeBoardSize(this.config);
  };

  SlotBoardRuntime.prototype.getCompSize = function () {
    var comp = this.config.comp || { w: 720, h: 1280 };
    return { w: comp.w, h: comp.h };
  };

  SlotBoardRuntime.prototype.setViewOptions = function (viewOptions) {
    this.viewOptions = Object.assign({}, this.viewOptions, viewOptions || {});
    this.render();
  };

  SlotBoardRuntime.prototype.getViewOptions = function () {
    return Object.assign({}, this.viewOptions);
  };

  SlotBoardRuntime.prototype.getMetrics = function () {
    var size = this.getSize();
    var layout = size.layout;
    var zoom = Number(this.viewOptions.previewZoom) || 1;
    var rect = this.canvas ? this.canvas.getBoundingClientRect() : null;
    return {
      boardW: size.width,
      boardH: size.height,
      symbolW: layout.symbolW,
      symbolH: layout.symbolH,
      canvasDomW: rect ? Math.round(rect.width) : null,
      canvasDomH: rect ? Math.round(rect.height) : null,
      zoom: zoom,
      previewMode: this.viewOptions.previewMode || "comp",
      compW: this.getCompSize().w,
      compH: this.getCompSize().h,
    };
  };

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

  function hitTestCell(config, px, py) {
    var cols = config.board.cols;
    var rows = config.board.rows;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var rect = cellRect(config, c, r);
        if (px >= rect.x && px < rect.x + rect.w && py >= rect.y && py < rect.y + rect.h) {
          return { col: c, row: r };
        }
      }
    }
    return null;
  }

  function collectUniqueSymbols(config) {
    var names = [];
    var seen = {};
    function scanGrid(grid) {
      if (!grid) return;
      for (var r = 0; r < grid.length; r++) {
        if (!grid[r]) continue;
        for (var c = 0; c < grid[r].length; c++) {
          var sym = grid[r][c];
          if (sym && !seen[sym]) {
            seen[sym] = true;
            names.push(sym);
          }
        }
      }
    }
    if (config.frames && config.frames.length) {
      config.frames.forEach(function (frame) {
        scanGrid(frame.grid);
      });
    } else {
      scanGrid(config.grid || []);
    }
    return names;
  }

  function loadSymbolImages(fileNames, done) {
    var images = {};
    var pending = fileNames.length;
    if (!pending) {
      done(images);
      return;
    }
    fileNames.forEach(function (name) {
      var img = new Image();
      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        if (img.naturalWidth > 0) images[name] = img;
        pending--;
        if (pending === 0) done(images);
      }
      img.onload = finish;
      img.onerror = finish;
      img.src = "/symbols/" + encodeURIComponent(name);
    });
  }

  function scaleMulFor(config, symbolId) {
    if (!symbolId || !config.symbols || !config.symbols.scaleMul) return 1;
    var mul = config.symbols.scaleMul[symbolId];
    return mul == null ? 1 : mul;
  }

  function drawSymbolInCell(ctx, img, x, y, sw, sh, cellFill, mul) {
    if (!img) return;
    var fill = cellFill != null ? cellFill : 0.9;
    var maxW = sw * fill * mul;
    var maxH = sh * fill * mul;
    var scale = Math.min(maxW / img.width, maxH / img.height);
    var dw = img.width * scale;
    var dh = img.height * scale;
    var dx = x + (sw - dw) / 2;
    var dy = y + (sh - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function drawBoard(ctx, config, w, h, showDimLabels, images, selectedCell, animState) {
    var layout = config.board.layout;
    var cols = config.board.cols;
    var rows = config.board.rows;
    var pad = layout.padding;
    var sw = layout.symbolW;
    var sh = layout.symbolH;
    var cg = layout.colGap;
    var rg = layout.rowGap;
    var grid = config.grid || [];
    var cellFill = config.symbols ? config.symbols.cellFill : 0.9;
    var offsets = animState && animState.offsets ? animState.offsets : null;
    var highlightCol =
      animState && animState.highlightCol != null ? animState.highlightCol : null;
    var highlightCols =
      animState && animState.highlightCols ? animState.highlightCols : null;

    function isHighlightCol(c) {
      if (highlightCols && highlightCols.length) {
        return highlightCols.indexOf(c) >= 0;
      }
      if (highlightCol != null) return highlightCol === c;
      return false;
    }

    function cellOffset(col, row, sym) {
      if (!offsets) return { dy: 0, alpha: 1 };
      var key = col + "," + row;
      var o = offsets[key];
      if (o) {
        return {
          dy: o.dy != null ? o.dy : 0,
          alpha: o.alpha != null ? o.alpha : 1,
        };
      }
      if (animState && animState.enterMode && sym) {
        return { dy: 0, alpha: 0 };
      }
      return { dy: 0, alpha: 1 };
    }

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var rect = cellRect(config, c, r);
        var x = rect.x;
        var y = rect.y;
        var sym = grid[r] ? grid[r][c] : null;
        var off = cellOffset(c, r, sym);

        ctx.fillStyle = COLORS.cellFill;
        ctx.fillRect(x, y, sw, sh);

        if (isHighlightCol(c)) {
          ctx.fillStyle = "rgba(56, 189, 248, 0.14)";
          ctx.fillRect(x, y, sw, sh);
        }

        if (sym && images && images[sym] && off.alpha > 0.01) {
          ctx.save();
          ctx.globalAlpha = off.alpha;
          drawSymbolInCell(
            ctx,
            images[sym],
            x,
            y + off.dy,
            sw,
            sh,
            cellFill,
            scaleMulFor(config, sym)
          );
          ctx.restore();
        } else if (sym && off.alpha > 0.01) {
          ctx.save();
          ctx.globalAlpha = off.alpha;
          ctx.fillStyle = COLORS.label;
          ctx.font = "9px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sym.replace(/\.png$/i, ""), x + sw / 2, y + sh / 2 + off.dy);
          ctx.restore();
        } else if (!sym) {
          ctx.fillStyle = COLORS.label;
          ctx.font = "10px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(c + 1 + "," + (r + 1), x + sw / 2, y + sh / 2);
        } else {
          ctx.fillStyle = COLORS.label;
          ctx.font = "10px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(c + 1 + "," + (r + 1), x + sw / 2, y + sh / 2);
        }

        ctx.strokeStyle = COLORS.cellStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, sw - 1, sh - 1);

        if (
          selectedCell &&
          selectedCell.col === c &&
          selectedCell.row === r
        ) {
          ctx.strokeStyle = COLORS.selectStroke;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, sw - 2, sh - 2);
        }
      }
    }

    if (showDimLabels) {
      ctx.fillStyle = COLORS.dimLabel;
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(sw + "×" + sh, pad + 2, pad + 2);
    }

    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
  }

  function drawHorizontalRuler(ctx, w) {
    ctx.fillStyle = COLORS.rulerBg;
    ctx.fillRect(0, 0, w, RULER);
    ctx.strokeStyle = COLORS.rulerTick;
    ctx.fillStyle = COLORS.rulerText;
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (var x = 0; x <= w; x++) {
      if (x % 10 !== 0 && x !== w) continue;
      var major = x % 100 === 0;
      var mid = x % 50 === 0;
      var tickH = major ? 12 : mid ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, RULER);
      ctx.lineTo(x + 0.5, RULER - tickH);
      ctx.stroke();
      if (major && x < w) ctx.fillText(String(x), x, 2);
    }

    ctx.strokeStyle = COLORS.rulerAccent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, RULER - 1);
    ctx.lineTo(Math.min(REF_BAR, w), RULER - 1);
    ctx.stroke();
  }

  function drawVerticalRuler(ctx, h) {
    ctx.fillStyle = COLORS.rulerBg;
    ctx.fillRect(0, 0, RULER, h);
    ctx.strokeStyle = COLORS.rulerTick;
    ctx.fillStyle = COLORS.rulerText;
    ctx.font = "9px ui-monospace, monospace";

    for (var y = 0; y <= h; y++) {
      if (y % 10 !== 0 && y !== h) continue;
      var major = y % 100 === 0;
      var mid = y % 50 === 0;
      var tickW = major ? 12 : mid ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(RULER, y + 0.5);
      ctx.lineTo(RULER - tickW, y + 0.5);
      ctx.stroke();
      if (major && y > 0 && y < h) {
        ctx.save();
        ctx.translate(2, y);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(String(y), 0, 0);
        ctx.restore();
      }
    }
  }

  function drawGuides(ctx, config, w, h) {
    var layout = config.board.layout;
    var cols = config.board.cols;
    var rows = config.board.rows;
    var pad = layout.padding;
    var sw = layout.symbolW;
    var sh = layout.symbolH;
    var cg = layout.colGap;
    var rg = layout.rowGap;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = COLORS.guideMinor;
    ctx.lineWidth = 1;
    for (var gx = 100; gx < w; gx += 100) {
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, 0);
      ctx.lineTo(gx + 0.5, h);
      ctx.stroke();
    }
    for (var gy = 100; gy < h; gy += 100) {
      ctx.beginPath();
      ctx.moveTo(0, gy + 0.5);
      ctx.lineTo(w, gy + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.guideCell;
    ctx.setLineDash([2, 2]);
    for (var c = 0; c <= cols; c++) {
      var vx =
        c === 0
          ? pad
          : c === cols
            ? pad + cols * sw + (cols - 1) * cg
            : pad + c * (sw + cg);
      ctx.beginPath();
      ctx.moveTo(vx + 0.5, 0);
      ctx.lineTo(vx + 0.5, h);
      ctx.stroke();
    }
    for (var r = 0; r <= rows; r++) {
      var hy =
        r === 0
          ? pad
          : r === rows
            ? pad + rows * sh + (rows - 1) * rg
            : pad + r * (sh + rg);
      ctx.beginPath();
      ctx.moveTo(0, hy + 0.5);
      ctx.lineTo(w, hy + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.guideEdge;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    ctx.strokeStyle = COLORS.guideMajor;
    ctx.beginPath();
    ctx.moveTo(w / 2 + 0.5, 0);
    ctx.lineTo(w / 2 + 0.5, h);
    ctx.moveTo(0, h / 2 + 0.5);
    ctx.lineTo(w, h / 2 + 0.5);
    ctx.stroke();
  }

  function getCanvasDpr() {
    var dpr = window.devicePixelRatio || 1;
    return Math.min(Math.max(dpr, 1), 3);
  }

  function prepareCanvas2d(canvas, logicalW, logicalH) {
    var dpr = getCanvasDpr();
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    canvas.style.width = logicalW + "px";
    canvas.style.height = logicalH + "px";
    canvas.dataset.logicalW = String(logicalW);
    canvas.dataset.logicalH = String(logicalH);
    canvas.dataset.dpr = String(dpr);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
    return ctx;
  }

  function makeCanvas(w, h, className) {
    var canvas = document.createElement("canvas");
    canvas.className = className;
    canvas.style.display = "block";
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    prepareCanvas2d(canvas, w, h);
    return canvas;
  }

  function buildBoardStage(config, w, h, showRulers, showGuides, images, viewOptions) {
    var stage = document.createElement("div");
    stage.className = "sb-stage";
    stage.style.display = "inline-block";
    stage.style.lineHeight = "0";
    stage.style.flex = "none";

    var selectedCell = viewOptions ? viewOptions.selectedCell : null;
    var animState = viewOptions ? viewOptions.animState : null;

    if (showRulers) {
      var topRow = document.createElement("div");
      topRow.className = "sb-ruler-row";
      topRow.style.display = "flex";
      topRow.style.height = RULER + "px";

      var corner = document.createElement("div");
      corner.style.width = RULER + "px";
      corner.style.height = RULER + "px";
      corner.style.background = COLORS.rulerBg;
      corner.style.flex = "none";

      var rulerH = makeCanvas(w, RULER, "sb-ruler-h");
      drawHorizontalRuler(rulerH.getContext("2d"), w);

      topRow.appendChild(corner);
      topRow.appendChild(rulerH);
      stage.appendChild(topRow);
    }

    var bodyRow = document.createElement("div");
    bodyRow.className = "sb-body-row";
    bodyRow.style.display = "flex";
    bodyRow.style.flex = "none";

    if (showRulers) {
      var rulerV = makeCanvas(RULER, h, "sb-ruler-v");
      drawVerticalRuler(rulerV.getContext("2d"), h);
      bodyRow.appendChild(rulerV);
    }

    var boardWrap = document.createElement("div");
    boardWrap.className = "sb-board-wrap";
    boardWrap.style.position = "relative";
    boardWrap.style.width = w + "px";
    boardWrap.style.height = h + "px";
    boardWrap.style.flex = "none";

    var canvas = makeCanvas(w, h, "sb-canvas");
    canvas.dataset.boardWidth = String(w);
    canvas.dataset.boardHeight = String(h);
    drawBoard(
      canvas.getContext("2d"),
      config,
      w,
      h,
      showGuides,
      images,
      selectedCell,
      animState
    );

    if (viewOptions && viewOptions.onCellClick) {
      canvas.style.cursor = "pointer";
      canvas.addEventListener("click", function (e) {
        var rect = canvas.getBoundingClientRect();
        var boardW = Number(canvas.dataset.logicalW) || w;
        var boardH = Number(canvas.dataset.logicalH) || h;
        var scaleX = boardW / rect.width;
        var scaleY = boardH / rect.height;
        var px = (e.clientX - rect.left) * scaleX;
        var py = (e.clientY - rect.top) * scaleY;
        var hit = hitTestCell(config, px, py);
        if (hit) viewOptions.onCellClick(hit.col, hit.row, e.altKey);
      });
    }

    boardWrap.appendChild(canvas);

    var guideCanvas = null;
    if (showGuides) {
      guideCanvas = makeCanvas(w, h, "sb-guides");
      guideCanvas.style.position = "absolute";
      guideCanvas.style.left = "0";
      guideCanvas.style.top = "0";
      guideCanvas.style.pointerEvents = "none";
      drawGuides(guideCanvas.getContext("2d"), config, w, h);
      boardWrap.appendChild(guideCanvas);
    }

    bodyRow.appendChild(boardWrap);
    stage.appendChild(bodyRow);

    if (showRulers) {
      var refRow = document.createElement("div");
      refRow.style.marginTop = "6px";
      refRow.style.marginLeft = RULER + "px";
      refRow.style.display = "flex";
      refRow.style.alignItems = "center";
      refRow.style.gap = "8px";
      refRow.style.font = "10px ui-monospace, monospace";
      refRow.style.color = COLORS.rulerText;
      refRow.style.lineHeight = "1";

      var refBar = document.createElement("div");
      refBar.style.width = REF_BAR + "px";
      refBar.style.height = "6px";
      refBar.style.background = COLORS.rulerAccent;
      refBar.style.flex = "none";

      var refLabel = document.createElement("span");
      refLabel.textContent = REF_BAR + " CSS px";

      refRow.appendChild(refBar);
      refRow.appendChild(refLabel);
      stage.appendChild(refRow);
    }

    return { stage: stage, canvas: canvas, guideCanvas: guideCanvas };
  }

  function wrapInCompFrame(stage, boardW, boardH, compW, compH, showRulers, placement) {
    var frame = document.createElement("div");
    frame.className = "sb-comp-frame";
    frame.style.width = compW + "px";
    frame.style.height = compH + "px";
    frame.style.position = "relative";
    frame.style.boxSizing = "border-box";
    frame.style.border = "2px solid " + COLORS.compBorder;
    frame.style.background = COLORS.compBg;
    frame.style.flex = "none";
    frame.style.overflow = "visible";

    var label = document.createElement("div");
    label.className = "sb-comp-label";
    label.textContent = compW + " × " + compH + " · playable 合成";
    label.style.position = "absolute";
    label.style.left = "8px";
    label.style.top = "6px";
    label.style.font = "11px ui-monospace, monospace";
    label.style.color = COLORS.compLabel;
    label.style.pointerEvents = "none";
    label.style.zIndex = "2";
    frame.appendChild(label);

    var place = placement || {
      left: (compW - boardW) / 2,
      top: (compH - boardH) / 2,
    };
    var offset = showRulers ? RULER : 0;
    var slot = document.createElement("div");
    slot.className = "sb-comp-slot";
    slot.style.position = "absolute";
    slot.style.left = Math.round(place.left) - offset + "px";
    slot.style.top = Math.round(place.top) - offset + "px";
    slot.style.overflow = "visible";
    slot.appendChild(stage);
    frame.appendChild(slot);

    return frame;
  }

  function applyZoomWrap(container, content, logicalW, logicalH, zoom) {
    var shell = document.createElement("div");
    shell.className = "sb-zoom-shell";
    shell.style.width = Math.round(logicalW * zoom) + "px";
    shell.style.height = Math.round(logicalH * zoom) + "px";
    shell.style.overflow = "visible";
    shell.style.flex = "none";

    var inner = document.createElement("div");
    inner.className = "sb-zoom-inner";
    inner.style.width = logicalW + "px";
    inner.style.height = logicalH + "px";
    inner.style.transform = zoom !== 1 ? "scale(" + zoom + ")" : "none";
    inner.style.transformOrigin = "0 0";
    inner.style.willChange = zoom !== 1 ? "transform" : "auto";
    inner.appendChild(content);

    shell.appendChild(inner);
    container.appendChild(shell);
    return shell;
  }

  SlotBoardRuntime.prototype._paintStage = function (images) {
    var config = this.config;
    var size = this.getSize();
    var w = size.width;
    var h = size.height;
    var showRulers = !!this.viewOptions.showRulers;
    var showGuides = !!this.viewOptions.showGuides;
    var previewMode = this.viewOptions.previewMode === "board" ? "board" : "comp";
    var zoom = Math.max(0.1, Math.min(2, Number(this.viewOptions.previewZoom) || 1));
    var comp = this.getCompSize();

    this.container.innerHTML = "";
    this.container.style.cssText =
      "display:inline-block;line-height:0;vertical-align:top;width:auto;height:auto;transform:none;";

    var built = buildBoardStage(
      config,
      w,
      h,
      showRulers,
      showGuides,
      images,
      this.viewOptions
    );
    this.stage = built.stage;
    this.canvas = built.canvas;
    this.guideCanvas = built.guideCanvas;

    var content;
    var logicalW;
    var logicalH;

    if (previewMode === "comp") {
      var placement = SlotBoardConfig.computePlacement(config);
      content = wrapInCompFrame(
        built.stage,
        w,
        h,
        comp.w,
        comp.h,
        showRulers,
        placement
      );
      logicalW = comp.w;
      logicalH = comp.h;
    } else {
      content = built.stage;
      logicalW = showRulers ? RULER + w : w;
      logicalH = showRulers ? RULER + h + 14 : h;
    }

    this.zoomShell = applyZoomWrap(this.container, content, logicalW, logicalH, zoom);
  };

  SlotBoardRuntime.prototype.render = function () {
    var self = this;
    loadSymbolImages(collectUniqueSymbols(this.config), function (images) {
      self._images = images;
      self._paintStage(images);
    });
  };

  SlotBoardRuntime.prototype.setConfig = function (config) {
    if (
      config.board.cols !== this._cols ||
      config.board.rows !== this._rows
    ) {
      throw new Error("SlotBoardRuntime: 行列不可变更，请销毁后重建");
    }
    this.config = config;
    this.render();
  };

  SlotBoardRuntime.prototype.redraw = function (animState) {
    if (!this.canvas || !this._images) return;
    var size = this.getSize();
    var w = size.width;
    var h = size.height;
    var state =
      animState != null
        ? animState
        : this.viewOptions
          ? this.viewOptions.animState
          : null;
    drawBoard(
      this.canvas.getContext("2d"),
      this.config,
      w,
      h,
      !!this.viewOptions.showGuides,
      this._images,
      this.viewOptions ? this.viewOptions.selectedCell : null,
      state
    );
  };

  global.SlotBoardRuntime = SlotBoardRuntime;
})(typeof window !== "undefined" ? window : globalThis);
