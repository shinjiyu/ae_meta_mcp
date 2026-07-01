/**
 * Build 5x6 slot symbol grid inside frame2, with frame3 as border overlay.
 * Creates SLOT_BOARD + REEL_COL_1..6 + REEL_COL_*_STRIP.
 *
 * Run: $.evalFile("D:/workspace/ae_meta_mcp/scripts/pre-export/build-slot-grid.jsx");
 */

(function () {
  var MAIN_COMP = "\u5408\u6210 1";
  var SYMBOLS_DIR = "D:/workspace/ae_meta_mcp/examples/symbols";
  var SYMBOL_FILES = [
    "s1.png",
    "s2.png",
    "s3.png",
    "s4.png",
    "s5_.png",
    "s6_.png",
    "s7.png",
    "s8.png",
    "s9.png"
  ];
  var COLS = 6;
  var ROWS = 5;
  var PAD_X = 0.06;
  var PAD_Y = 0.08;
  var CELL_FILL = 0.88;
  var BOARD_COMP = "SLOT_BOARD";
  var COL_PREFIX = "REEL_COL_";

  function findCompByName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }

  function findFootageByName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof FootageItem && it.name === name) return it;
    }
    return null;
  }

  function findLayerByName(comp, name) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === name) return comp.layer(i);
    }
    return null;
  }

  function importSymbol(fileName) {
    var existing = findFootageByName(fileName);
    if (existing) return existing;
    var f = new File(SYMBOLS_DIR + "/" + fileName);
    if (!f.exists) throw new Error("Missing symbol: " + f.fsName);
    var io = new ImportOptions(f);
    io.importAs = ImportAsType.FOOTAGE;
    return app.project.importFile(io);
  }

  function clearCompLayers(comp) {
    while (comp.numLayers > 0) comp.layer(1).remove();
  }

  function getOrResetComp(name, w, h, fps, duration) {
    var comp = findCompByName(name);
    if (comp) {
      clearCompLayers(comp);
      comp.width = Math.round(w);
      comp.height = Math.round(h);
      comp.duration = duration;
      comp.frameRate = fps;
      return comp;
    }
    return app.project.items.addComp(
      name,
      Math.round(w),
      Math.round(h),
      1,
      duration,
      fps
    );
  }

  function layerDisplayBounds(lyr) {
    var tr = lyr.property("ADBE Transform Group");
    var sc = tr.property("ADBE Scale").value;
    var pos = tr.property("ADBE Position").value;
    var ap = tr.property("ADBE Anchor Point").value;
    var src = lyr.source;
    var sw = src.width * sc[0] / 100;
    var sh = src.height * sc[1] / 100;
    return {
      width: sw,
      height: sh,
      centerX: pos[0],
      centerY: pos[1]
    };
  }

  function setPosition(layer, x, y) {
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([x, y, 0]);
  }

  function setUniformScale(layer, pct) {
    layer.property("ADBE Transform Group").property("ADBE Scale").setValue([pct, pct, 100]);
  }

  function fitScale(footage, cellW, cellH) {
    var sx = (cellW * CELL_FILL / footage.width) * 100;
    var sy = (cellH * CELL_FILL / footage.height) * 100;
    return Math.min(sx, sy);
  }

  function buildStrip(colIndex, colW, rowH, innerH, symbols, fps, duration) {
    var stripName = COL_PREFIX + (colIndex + 1) + "_STRIP";
    var strip = getOrResetComp(stripName, colW, innerH, fps, duration);
    for (var row = 0; row < ROWS; row++) {
      var sym = symbols[(colIndex + row) % symbols.length];
      var lyr = strip.layers.add(sym);
      lyr.name = "sym_r" + (row + 1);
      var sc = fitScale(sym, colW, rowH);
      setUniformScale(lyr, sc);
      setPosition(lyr, colW / 2, rowH * (row + 0.5));
    }
    return strip;
  }

  function buildColumn(colIndex, colW, rowH, innerH, symbols, fps, duration) {
    var colName = COL_PREFIX + (colIndex + 1);
    var colComp = getOrResetComp(colName, colW, innerH, fps, duration);
    var strip = buildStrip(colIndex, colW, rowH, innerH, symbols, fps, duration);
    var stripLayer = colComp.layers.add(strip);
    stripLayer.name = "REEL_STRIP";
    return colComp;
  }

  function restoreMultiplierLayers(main, boardLayer) {
    var specs = [
      { name: "5.png", x: 106 },
      { name: "6.png", x: 278.333343505859 },
      { name: "7.png", x: 450.666656494141 },
      { name: "8.png", x: 623 }
    ];
    var y = 528;
    var scale = 18.4126987457275;

    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      if (findLayerByName(main, spec.name)) continue;
      var footage = findFootageByName(spec.name);
      if (!footage) continue;
      var lyr = main.layers.add(footage);
      lyr.name = spec.name;
      setUniformScale(lyr, scale);
      setPosition(lyr, spec.x, y);
      if (boardLayer) lyr.moveBefore(boardLayer);
    }
  }

  var main = findCompByName(MAIN_COMP);
  if (!main) throw new Error("Comp not found: " + MAIN_COMP);

  var frame2Layer = findLayerByName(main, "frame2.png");
  if (!frame2Layer) throw new Error("frame2.png layer not found in main comp");

  var bounds = layerDisplayBounds(frame2Layer);
  var innerW = bounds.width * (1 - 2 * PAD_X);
  var innerH = bounds.height * (1 - 2 * PAD_Y);
  var colW = innerW / COLS;
  var rowH = innerH / ROWS;
  var centerX = bounds.centerX;
  var centerY = bounds.centerY;

  app.beginUndoGroup("build slot grid");

  var symbols = [];
  for (var si = 0; si < SYMBOL_FILES.length; si++) {
    symbols.push(importSymbol(SYMBOL_FILES[si]));
  }

  var board = getOrResetComp(BOARD_COMP, innerW, innerH, main.frameRate, main.duration);
  var columns = [];
  for (var c = 0; c < COLS; c++) {
    var colComp = buildColumn(c, colW, rowH, innerH, symbols, main.frameRate, main.duration);
    columns.push(colComp);
    var colLayer = board.layers.add(colComp);
    colLayer.name = COL_PREFIX + (c + 1);
    setPosition(colLayer, colW * (c + 0.5), innerH / 2);
  }

  var existingBoard = findLayerByName(main, BOARD_COMP);
  if (existingBoard) existingBoard.remove();

  var boardLayer = main.layers.add(board);
  boardLayer.name = BOARD_COMP;
  setPosition(boardLayer, centerX, centerY);

  var frame3Layer = findLayerByName(main, "frame3.png");
  if (frame3Layer) {
    boardLayer.moveAfter(frame3Layer);
  } else {
    boardLayer.moveAfter(frame2Layer);
  }

  restoreMultiplierLayers(main, boardLayer);

  var colNames = [];
  for (var cn = 0; cn < columns.length; cn++) {
    colNames.push(columns[cn].name);
  }

  app.endUndoGroup();

  ({
    ok: true,
    boardComp: BOARD_COMP,
    size: {
      innerW: Math.round(innerW),
      innerH: Math.round(innerH),
      colW: Math.round(colW * 10) / 10,
      rowH: Math.round(rowH * 10) / 10
    },
    position: { x: Math.round(centerX), y: Math.round(centerY) },
    columns: COLS,
    rows: ROWS,
    columnComps: colNames,
    note: "No WINDOW_MASK solid (avoids visible center bar). Add reel scroll mask later via Set Matte."
  });
})();
