/**
 * Populate SLOT_BOARD with real symbols: 6 cols x 5 rows, uniform scale, named cells.
 * Preserves SLOT_BOARD size/position in main comp; rebuilds REEL_COL_* internals only.
 *
 * Run: $.evalFile("D:/workspace/ae_meta_mcp/scripts/pre-export/populate-slot-symbols.jsx");
 */

(function () {
  var MAIN_COMP = "\u5408\u6210 1";
  var BOARD_COMP = "SLOT_BOARD";
  var SYMBOLS_DIR = "D:/workspace/ae_meta_mcp/examples/symbols";
  var COL_PREFIX = "REEL_COL_";
  var COLS = 6;
  var ROWS = 5;
  var CELL_FILL = 0.9;

  // Non-gem = thematic icons (s1-s4). Gems need extra scale (more padding in PNG).
  var SCALE_MUL = {
    "s1.png": 1,
    "s2.png": 1,
    "s3.png": 1,
    "s4.png": 1,
    "s5_.png": 1.48,
    "s6_.png": 1.48,
    "s7.png": 1.45,
    "s8.png": 1.58,
    "s9.png": 1.58
  };

  // Default 6x5 board layout
  var GRID = [
    ["s1.png", "s2.png", "s3.png", "s4.png", "s5_.png", "s6_.png"],
    ["s7.png", "s8.png", "s9.png", "s1.png", "s2.png", "s3.png"],
    ["s4.png", "s5_.png", "s6_.png", "s7.png", "s8.png", "s9.png"],
    ["s2.png", "s4.png", "s6_.png", "s8.png", "s1.png", "s3.png"],
    ["s5_.png", "s7.png", "s9.png", "s2.png", "s4.png", "s6_.png"]
  ];

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

  function resetComp(name, w, h, fps, duration) {
    var comp = findCompByName(name);
    if (!comp) {
      return app.project.items.addComp(name, Math.round(w), Math.round(h), 1, duration, fps);
    }
    clearCompLayers(comp);
    comp.width = Math.round(w);
    comp.height = Math.round(h);
    comp.duration = duration;
    comp.frameRate = fps;
    return comp;
  }

  function setPosition(layer, x, y) {
    layer.property("ADBE Transform Group").property("ADBE Position").setValue([x, y, 0]);
  }

  function setUniformScale(layer, pct) {
    layer.property("ADBE Transform Group").property("ADBE Scale").setValue([pct, pct, 100]);
  }

  function scaleForSymbol(fileName, baseScale) {
    var mul = SCALE_MUL[fileName];
    if (mul === undefined || mul === null) mul = 1;
    return baseScale * mul;
  }

  function uniformScaleForSet(footages, cellW, cellH) {
    var minSc = 999999;
    for (var i = 0; i < footages.length; i++) {
      var ft = footages[i];
      var sx = (cellW * CELL_FILL / ft.width) * 100;
      var sy = (cellH * CELL_FILL / ft.height) * 100;
      var sc = Math.min(sx, sy);
      if (sc < minSc) minSc = sc;
    }
    return minSc;
  }

  function buildStrip(colIndex, colW, rowH, innerH, symbolFootages, uniformScale, fps, duration) {
    var stripName = COL_PREFIX + (colIndex + 1) + "_STRIP";
    var strip = resetComp(stripName, colW, innerH, fps, duration);

    for (var row = 0; row < ROWS; row++) {
      var fileName = GRID[row][colIndex];
      var footage = symbolFootages[fileName];
      if (!footage) throw new Error("Symbol not loaded: " + fileName);

      var lyr = strip.layers.add(footage);
      lyr.name = "sym_c" + (colIndex + 1) + "r" + (row + 1);
      setUniformScale(lyr, scaleForSymbol(fileName, uniformScale));
      setPosition(lyr, colW / 2, rowH * (row + 0.5));
    }
    return strip;
  }

  function buildColumn(colIndex, colW, rowH, innerH, symbolFootages, uniformScale, fps, duration) {
    var colName = COL_PREFIX + (colIndex + 1);
    var colComp = resetComp(colName, colW, innerH, fps, duration);
    var strip = buildStrip(colIndex, colW, rowH, innerH, symbolFootages, uniformScale, fps, duration);
    var stripLayer = colComp.layers.add(strip);
    stripLayer.name = "REEL_STRIP";
    return colComp;
  }

  function writeManifest(board, colW, rowH, uniformScale, manifestPath, main, boardLayer) {
    var cells = [];
    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        cells.push({
          col: col + 1,
          row: row + 1,
          layer: "sym_c" + (col + 1) + "r" + (row + 1),
          symbol: GRID[row][col]
        });
      }
    }
    var transform = null;
    var display = null;
    if (boardLayer) {
      var tr = boardLayer.property("ADBE Transform Group");
      var pos = tr.property("ADBE Position").value;
      var scale = tr.property("ADBE Scale").value;
      var anchor = tr.property("ADBE Anchor Point").value;
      transform = {
        position: [Math.round(pos[0] * 10) / 10, Math.round(pos[1] * 10) / 10],
        scale: [Math.round(scale[0] * 10) / 10, Math.round(scale[1] * 10) / 10],
        anchorPoint: [Math.round(anchor[0] * 10) / 10, Math.round(anchor[1] * 10) / 10]
      };
      var sx = transform.scale[0] / 100;
      var sy = transform.scale[1] / 100;
      display = {
        left: Math.round((transform.position[0] - transform.anchorPoint[0] * sx) * 10) / 10,
        top: Math.round((transform.position[1] - transform.anchorPoint[1] * sy) * 10) / 10,
        width: Math.round(board.width * sx * 10) / 10,
        height: Math.round(board.height * sy * 10) / 10,
        cellW: Math.round(colW * sx * 10) / 10,
        cellH: Math.round(rowH * sy * 10) / 10
      };
    }
    var data = {
      version: 2,
      source: "ae-populate-slot-symbols",
      generatedAt: new Date().toUTCString(),
      mainComp: main ? { name: main.name, w: main.width, h: main.height } : null,
      boardComp: BOARD_COMP,
      cols: COLS,
      rows: ROWS,
      size: { w: board.width, h: board.height },
      cell: { w: Math.round(colW * 10) / 10, h: Math.round(rowH * 10) / 10 },
      transform: transform,
      display: display,
      uniformScale: Math.round(uniformScale * 1000) / 1000,
      scaleMul: SCALE_MUL,
      grid: GRID,
      cells: cells
    };
    var f = new File(manifestPath);
    f.encoding = "UTF-8";
    f.open("w");
    f.write(JSON.stringify(data, null, 2));
    f.close();
  }

  var main = findCompByName(MAIN_COMP);
  if (!main) throw new Error("Comp not found: " + MAIN_COMP);

  var board = findCompByName(BOARD_COMP);
  if (!board) throw new Error("SLOT_BOARD not found. Run build-slot-grid.jsx first.");

  var innerW = board.width;
  var innerH = board.height;
  var colW = innerW / COLS;
  var rowH = innerH / ROWS;
  var fps = main.frameRate;
  var duration = main.duration;

  app.beginUndoGroup("populate slot symbols");

  var symbolFootages = {};
  var allFootages = [];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var fn = GRID[r][c];
      if (!symbolFootages[fn]) {
        symbolFootages[fn] = importSymbol(fn);
        allFootages.push(symbolFootages[fn]);
      }
    }
  }

  var uniformScale = uniformScaleForSet(allFootages, colW, rowH);

  for (var ci = 0; ci < COLS; ci++) {
    buildColumn(ci, colW, rowH, innerH, symbolFootages, uniformScale, fps, duration);

    var colLayer = null;
    for (var li = 1; li <= board.numLayers; li++) {
      if (board.layer(li).name === COL_PREFIX + (ci + 1)) {
        colLayer = board.layer(li);
        break;
      }
    }
    if (!colLayer) {
      var colComp = findCompByName(COL_PREFIX + (ci + 1));
      colLayer = board.layers.add(colComp);
      colLayer.name = COL_PREFIX + (ci + 1);
    }
    setPosition(colLayer, colW * (ci + 0.5), innerH / 2);
  }

  var manifestPath = null;
  var boardLayer = null;
  for (var mi = 1; mi <= main.numLayers; mi++) {
    if (main.layer(mi).name === BOARD_COMP) {
      boardLayer = main.layer(mi);
      break;
    }
  }
  if (app.project.file) {
    manifestPath = app.project.file.parent.fsName + "/slot-board-manifest.json";
    writeManifest(board, colW, rowH, uniformScale, manifestPath, main, boardLayer);
  }

  app.endUndoGroup();

  ({
    ok: true,
    board: BOARD_COMP,
    size: { w: innerW, h: innerH, colW: Math.round(colW * 10) / 10, rowH: Math.round(rowH * 10) / 10 },
    uniformScale: Math.round(uniformScale * 1000) / 1000,
    cells: COLS * ROWS,
    manifest: manifestPath,
    note: "Layers named sym_c{col}r{row}. WINDOW_MASK removed. Edit GRID in script to change layout."
  });
})();
