/**
 * pre-export Step 2b: restore real sequence footage after export.
 *
 * Run: $.evalFile("D:/workspace/ae_meta_mcp/scripts/pre-export/restore-slots.jsx");
 */

(function () {
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

  if (!app.project.file) throw new Error("Save the project first.");

  var swapPath = app.project.file.parent.fsName + "/" + SWAP_STATE_NAME;
  var swapState = readJsonFile(swapPath);
  if (!swapState || !swapState.swaps) {
    throw new Error("No swap state found. Run swap-placeholders.jsx first: " + swapPath);
  }

  app.beginUndoGroup("pre-export restore slots");

  var restored = [];

  for (var i = 0; i < swapState.swaps.length; i++) {
    var swap = swapState.swaps[i];
    var slotComp = findCompByName(swap.slotComp);
    if (!slotComp) throw new Error("Slot comp not found: " + swap.slotComp);

    var phLayer = null;
    for (var li = 1; li <= slotComp.numLayers; li++) {
      if (slotComp.layer(li).name === swap.placeholderLayer) {
        phLayer = slotComp.layer(li);
        break;
      }
    }
    if (!phLayer) throw new Error("Placeholder layer not found: " + swap.placeholderLayer);

    var footage = findFootageByName(swap.originalFootage);
    if (!footage) throw new Error("Original footage not found: " + swap.originalFootage);

    var oldIndex = phLayer.index;
    var oldIn = phLayer.inPoint;
    var oldOut = phLayer.outPoint;
    var oldStart = phLayer.startTime;

    phLayer.remove();

    var seqLayer = slotComp.layers.add(footage);
    seqLayer.name = swap.originalFootage;
    seqLayer.inPoint = oldIn;
    seqLayer.outPoint = oldOut;
    seqLayer.startTime = oldStart;

    restored.push({
      slotId: swap.slotId,
      slotComp: swap.slotComp,
      restoredFootage: swap.originalFootage
    });
  }

  app.endUndoGroup();

  ({
    ok: true,
    message: "Real footage restored. You can continue editing in AE.",
    restored: restored
  });
})();
