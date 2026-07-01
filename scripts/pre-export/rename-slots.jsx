/**
 * pre-export Step 1: standardize Slot naming for export pipeline.
 *
 * Run inside AE (File > Scripts > Run Script File) or via ae_exec:
 *   $.evalFile("D:/workspace/ae_meta_mcp/scripts/pre-export/rename-slots.jsx");
 *
 * Renames matched sequence / nested-comp layers to [SLOT:id] and related
 * project items. Writes export-manifest.json beside the AE project file.
 */

(function () {
  var TARGET_COMP = "合成 1";
  var MANIFEST_NAME = "export-manifest.json";

  /** layerNameMatch / sourceNameMatch are RegExp strings */
  var SLOT_RULES = [
    {
      layerNameMatch: "^seth_male_upper",
      sourceNameMatch: "^seth_male_upper",
      slotId: "upper_body",
      layerName: "[SLOT:upper_body]",
      sourceCompName: "SLOT_upper_body",
      footageName: "FOOTAGE_upper_body_seq",
      frameCount: 24,
      fps: 24
    }
  ];

  function findCompByName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }

  function renameItemIfExists(oldName, newName) {
    if (!oldName || oldName === newName) return newName;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it.name === oldName) {
        it.name = newName;
        return newName;
      }
    }
    return oldName;
  }

  function matchName(pattern, name) {
    if (!pattern || !name) return false;
    return new RegExp(pattern, "i").test(name);
  }

  function getTransform(lyr) {
    var tr = lyr.property("ADBE Transform Group");
    return {
      position: tr.property("ADBE Position").value,
      scale: tr.property("ADBE Scale").value,
      anchorPoint: tr.property("ADBE Anchor Point").value,
      opacity: tr.property("ADBE Opacity").value
    };
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

  function jsonValue(v, indent, level) {
    if (v === null) return "null";
    var t = typeof v;
    if (t === "boolean" || t === "number") return String(v);
    if (t === "string") return jsonEscape(v);
    if (v instanceof Array) {
      if (v.length === 0) return "[]";
      var arr = [];
      for (var i = 0; i < v.length; i++) {
        arr.push(spaces(level + 1) + jsonValue(v[i], indent, level + 1));
      }
      return "[\n" + arr.join(",\n") + "\n" + spaces(level) + "]";
    }
    var parts = [];
    for (var k in v) {
      if (v.hasOwnProperty(k)) {
        parts.push(
          spaces(level + 1) + jsonEscape(k) + ": " + jsonValue(v[k], indent, level + 1)
        );
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
    return jsonValue(obj, 2, 0);
  }

  app.beginUndoGroup("pre-export rename slots");

  var comp = findCompByName(TARGET_COMP);
  if (!comp) {
    app.endUndoGroup();
    throw new Error("Target comp not found: " + TARGET_COMP);
  }

  var slots = [];
  var renamed = [];

  for (var li = 1; li <= comp.numLayers; li++) {
    var lyr = comp.layer(li);
    var sourceName = lyr.source ? lyr.source.name : "";
    var rule = null;

    for (var r = 0; r < SLOT_RULES.length; r++) {
      var cand = SLOT_RULES[r];
      if (
        matchName(cand.layerNameMatch, lyr.name) ||
        matchName(cand.sourceNameMatch, sourceName)
      ) {
        rule = cand;
        break;
      }
    }
    if (!rule) continue;

    var oldLayerName = lyr.name;
    var oldSourceName = sourceName;

    if (lyr.source && lyr.source instanceof CompItem) {
      renameItemIfExists(lyr.source.name, rule.sourceCompName);
    }

    for (var fi = 1; fi <= app.project.numItems; fi++) {
      var ft = app.project.item(fi);
      if (ft instanceof FootageItem && matchName(rule.sourceNameMatch, ft.name)) {
        if (ft.name.indexOf("seq") >= 0 || ft.name.indexOf("SEQ") >= 0) {
          renameItemIfExists(ft.name, rule.footageName);
        }
      }
    }

    lyr.name = rule.layerName;

    renamed.push({
      slotId: rule.slotId,
      oldLayerName: oldLayerName,
      newLayerName: rule.layerName,
      oldSourceName: oldSourceName,
      newSourceName: lyr.source ? lyr.source.name : null
    });

    slots.push({
      id: rule.slotId,
      layerName: rule.layerName,
      sourceComp: lyr.source ? lyr.source.name : null,
      frameCount: rule.frameCount,
      fps: rule.fps,
      inPoint: lyr.inPoint,
      outPoint: lyr.outPoint,
      transform: getTransform(lyr)
    });
  }

  var manifest = {
    version: 1,
    generatedAt: new Date().toUTCString(),
    project: app.project.file ? app.project.file.fsName : null,
    comp: comp.name,
    duration: comp.duration,
    frameRate: comp.frameRate,
    loop: true,
    slots: slots
  };

  var manifestPath = null;
  if (app.project.file) {
    var projFile = app.project.file;
    manifestPath =
      projFile.parent.fsName + "/" + MANIFEST_NAME;
    var mf = new File(manifestPath);
    mf.encoding = "UTF-8";
    mf.open("w");
    mf.write(stringify(manifest));
    mf.close();
  }

  app.endUndoGroup();

  ({
    ok: true,
    comp: comp.name,
    renamed: renamed,
    manifestPath: manifestPath,
    slots: slots
  });
})();
