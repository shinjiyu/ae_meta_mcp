/**
 * Standalone ae_scene_info script (ES3). Kept in sync with mcp/core.mjs
 * SCENE_INFO_JSX. Useful for manual testing via File -> Scripts -> Run Script File.
 */
(function () {
  var out = {
    aeVersion: app.version,
    project: app.project.file ? app.project.file.fsName : null,
    numItems: app.project.numItems,
    comps: [],
    activeComp: null
  };
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem) {
      out.comps.push({
        name: item.name,
        width: item.width,
        height: item.height,
        duration: item.duration,
        numLayers: item.numLayers
      });
    }
  }
  var active = app.project.activeItem;
  if (active instanceof CompItem) {
    out.activeComp = { name: active.name, numLayers: active.numLayers, layers: [] };
    for (var j = 1; j <= active.numLayers; j++) {
      var lyr = active.layer(j);
      out.activeComp.layers.push({ index: j, name: lyr.name, enabled: lyr.enabled });
    }
  }
  return out;
})();
