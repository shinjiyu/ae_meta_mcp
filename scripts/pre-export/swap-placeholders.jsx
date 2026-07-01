/**
 * pre-export Step 2: swap Slot sequence layers to placeholders before PAG/Lottie export.
 *
 * Run: $.evalFile("D:/workspace/ae_meta_mcp/scripts/pre-export/swap-placeholders.jsx");
 * Restore after export: restore-slots.jsx
 *
 * Reads export-manifest.json (from Step 1). For each slot source comp, replaces
 * sequence footage with a solid placeholder layer. Writes swap-state.json.
 */

(function () {
  var MANIFEST_NAME = "export-manifest.json";
  var SWAP_STATE_NAME = "swap-state.json";

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

  function readJsonFile(path) {
    var f = new File(path);
    if (!f.exists) return null;
    f.open("r");
    var text = f.read();
    f.close();
    return eval("(" + text + ")");
  }

  function jsonEscape(str) {
    str = String(str);
    var out = "";
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (c === "\\") out += "\\\\";
      else if (c === '"') out += '\\"';
      else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else out += c;
    }
    return '"' + out + '"';
  }

  function jsonValue(v, level) {
    if (v === null) return "null";
    var t = typeof v;
    if (t === "boolean" || t === "number") return String(v);
    if (t === "string") return jsonEscape(v);
    if (v instanceof Array) {
      if (v.length === 0) return "[]";
      var arr = [];
      for (var i = 0; i < v.length; i++) {
        arr.push(spaces(level + 1) + jsonValue(v[i], level + 1));
      }
      return "[\n" + arr.join(",\n") + "\n" + spaces(level) + "]";
    }
    var parts = [];
    for (var k in v) {
      if (v.hasOwnProperty(k)) {
        parts.push(spaces(level + 1) + jsonEscape(k) + ": " + jsonValue(v[k], level + 1));
      }
    }
    return "{\n" + parts.join(",\n") + "\n" + spaces(level) + "}";
  }

  function spaces(n) {
    var s = "";
    for (var i = 0; i < n * 2; i++) s += " ";
    return s;
  }

  function stringify(obj) {
    return jsonValue(obj, 0);
  }

  if (!app.project.file) throw new Error("Save the project first.");

  var projDir = app.project.file.parent.fsName;
  var manifestPath = projDir + "/" + MANIFEST_NAME;
  var manifest = readJsonFile(manifestPath);
  if (!manifest || !manifest.slots || manifest.slots.length === 0) {
    throw new Error("Run rename-slots.jsx first. Missing: " + manifestPath);
  }

  app.beginUndoGroup("pre-export swap placeholders");

  var swaps = [];

  for (var s = 0; s < manifest.slots.length; s++) {
    var slot = manifest.slots[s];
    var slotComp = findCompByName(slot.sourceComp);
    if (!slotComp) throw new Error("Slot comp not found: " + slot.sourceComp);

    var seqLayer = null;
    var seqFootageName = null;
    for (var li = 1; li <= slotComp.numLayers; li++) {
      var lyr = slotComp.layer(li);
      if (lyr.source instanceof FootageItem) {
        seqLayer = lyr;
        seqFootageName = lyr.source.name;
        break;
      }
    }

    if (!seqLayer) {
      throw new Error("No footage layer in " + slot.sourceComp);
    }

    var w = slotComp.width;
    var h = slotComp.height;
    var phName = "PLACEHOLDER_" + slot.id;

    for (var pi = 1; pi <= slotComp.numLayers; pi++) {
      if (slotComp.layer(pi).name === phName) {
        throw new Error("Already swapped? Found " + phName + " in " + slot.sourceComp);
      }
    }

    var oldIn = seqLayer.inPoint;
    var oldOut = seqLayer.outPoint;
    var oldStart = seqLayer.startTime;
    var oldIndex = seqLayer.index;

    seqLayer.remove();

    var phLayer = slotComp.layers.addSolid(
      [1, 0, 1],
      phName,
      w,
      h,
      1,
      slotComp.duration
    );
    phLayer.property("ADBE Transform Group").property("ADBE Opacity").setValue(40);
    phLayer.inPoint = oldIn;
    phLayer.outPoint = oldOut;
    phLayer.startTime = oldStart;

    swaps.push({
      slotId: slot.id,
      slotComp: slot.sourceComp,
      originalFootage: seqFootageName,
      placeholderLayer: phName,
      width: w,
      height: h
    });
  }

  var swapState = {
    version: 1,
    swappedAt: new Date().toUTCString(),
    project: app.project.file.fsName,
    swaps: swaps
  };

  var swapPath = projDir + "/" + SWAP_STATE_NAME;
  var sf = new File(swapPath);
  sf.encoding = "UTF-8";
  sf.open("w");
  sf.write(stringify(swapState));
  sf.close();

  app.endUndoGroup();

  ({
    ok: true,
    message: "Placeholders swapped. Export PAG/Lottie now, then run restore-slots.jsx",
    swapPath: swapPath,
    swaps: swaps
  });
})();
