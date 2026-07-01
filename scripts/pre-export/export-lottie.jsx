/**

 * pre-export Step 3: export Lottie JSON via Bodymovin (no panel UI).

 *

 * Modes (set MODE before evalFile):

 *   "start" — kick off Bodymovin render and return immediately (recommended for MCP)

 *   "poll"  — check whether output JSON exists yet

 *   "full"  — start + block until file appears (may stall Bodymovin scheduleTask)

 *

 * Run:

 *   $.evalFile("D:/workspace/ae_meta_mcp/scripts/pre-export/export-lottie.jsx");

 */



(function () {

  var TARGET_COMP = "\u5408\u6210 1";

  var BODYMOVIN_INIT =

    "C:/Users/yuzhenyu/AppData/Roaming/Adobe/CEP/extensions/bodymovin/jsx/initializer.jsx";

  var SWAP_SCRIPT = "D:/workspace/ae_meta_mcp/scripts/pre-export/swap-placeholders.jsx";

  var SWAP_STATE = "swap-state.json";

  var OUTPUT_SUBDIR = "export/lottie";

  var OUTPUT_FILE = "comp_1.json";

  var STATUS_FILE = "export/lottie/.export-status.json";

  // Override: $.global.__aeLottieExportMode = "poll" | "start" | "full"
  var MODE =
    $.global && $.global.__aeLottieExportMode
      ? $.global.__aeLottieExportMode
      : "start";

  var WAIT_MS = 180000;

  var POLL_MS = 500;



  function findCompByName(name) {

    for (var i = 1; i <= app.project.numItems; i++) {

      var it = app.project.item(i);

      if (it instanceof CompItem && it.name === name) return it;

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



  function writeJsonFile(path, data) {

    var f = new File(path);

    f.encoding = "UTF-8";

    f.open("w");

    f.write(JSON.stringify(data));

    f.close();

  }



  function defaultSettings() {

    return {

      segmented: false,

      segmentedTime: 10,

      standalone: false,

      avd: false,

      glyphs: true,

      includeExtraChars: false,

      bundleFonts: false,

      inlineFonts: false,

      hiddens: false,

      original_assets: false,

      original_names: false,

      should_encode_images: false,

      should_compress: false,

      should_skip_images: false,

      should_reuse_images: false,

      should_include_av_assets: false,

      compression_rate: 80,

      extraComps: { active: false, list: [] },

      guideds: false,

      ignore_expression_properties: false,

      export_old_format: false,

      use_source_names: false,

      shouldTrimData: false,

      skip_default_properties: false,

      not_supported_properties: false,

      pretty_print: false,

      useCompNamesAsIds: false,

      export_mode: "standard",

      export_modes: {

        standard: true,

        demo: false,

        standalone: false,

        banner: false,

        avd: false,

        smil: false,

        rive: false,

        reports: false

      },

      demoData: { backgroundColor: [1, 1, 1] },

      banner: {

        lottie_origin: "local",

        lottie_path: "https://",

        lottie_library: "5.12.2",

        lottie_renderer: "svg",

        width: 500,

        height: 500,

        use_original_sizes: true,

        original_width: 500,

        original_height: 500,

        click_tag: "https://",

        zip_files: false,

        shouldIncludeAnimationDataInTemplate: false,

        shouldLoop: false,

        loopCount: 0,

        localPath: null

      },

      expressions: {

        shouldBake: true,

        shouldCacheExport: false,

        shouldBakeBeyondWorkArea: false,

        sampleSize: 1

      },

      audio: {

        isEnabled: false,

        shouldRaterizeWaveform: true,

        bitrate: 128

      },

      metadata: { includeFileName: false, customProps: [] },

      template: { active: false, id: 0, errors: [] },

      essentialProperties: {

        active: false,

        useSlots: false,

        skipExternalComp: false

      }

    };

  }



  function randomId(len) {

    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";

    var s = "";

    for (var i = 0; i < len; i++) {

      s += chars.charAt(Math.floor(Math.random() * chars.length));

    }

    return s;

  }



  function getPaths() {

    if (!app.project.file) throw new Error("Save the AE project first.");

    var projDir = app.project.file.parent.fsName;

    var outFolder = new Folder(projDir + "/" + OUTPUT_SUBDIR);

    if (!outFolder.exists) outFolder.create();

    var outFile = new File(outFolder.fsName + "/" + OUTPUT_FILE);

    var statusFile = new File(projDir + "/" + STATUS_FILE);

    return {

      projDir: projDir,

      outFolder: outFolder,

      outFile: outFile,

      statusFile: statusFile,

      swapPath: projDir + "/" + SWAP_STATE

    };

  }



  function ensureBodymovin() {

    var initFile = new File(BODYMOVIN_INIT);

    if (!initFile.exists) {

      throw new Error("Bodymovin not found: " + BODYMOVIN_INIT);

    }

    $.evalFile(initFile.fsName);

    if (!$.__bodymovin || !$.__bodymovin.bm_compsManager) {

      throw new Error("Bodymovin jsx failed to load");

    }

    $.__bodymovin.bm_projectManager.checkProject();

  }



  function startExport() {

    var paths = getPaths();



    if (!readJsonFile(paths.swapPath)) {

      $.evalFile(SWAP_SCRIPT);

    }



    var comp = findCompByName(TARGET_COMP);

    if (!comp) throw new Error("Comp not found: " + TARGET_COMP);



    comp.openInViewer();

    comp.workAreaStart = 0;

    comp.workAreaDuration = comp.duration;



    if (paths.outFile.exists) paths.outFile.remove();



    ensureBodymovin();



    if (!$.__bodymovin.bm_fileManager.createTemporaryFolder()) {

      throw new Error(

        "Bodymovin temp folder failed. Enable Preferences > Scripting > Allow Scripts to Write Files."

      );

    }



    var uid = randomId(20);

    var compositionData = {

      id: comp.id,

      name: comp.name,

      width: comp.width,

      height: comp.height,

      absoluteURI: paths.outFile.absoluteURI,

      destination: paths.outFile.fsName,

      uid: uid,

      settings: defaultSettings()

    };



    writeJsonFile(paths.statusFile.fsName, {

      state: "rendering",

      startedAt: new Date().toUTCString(),

      outputJson: paths.outFile.fsName,

      comp: comp.name

    });



    $.__bodymovin.bm_compsManager.renderComposition(compositionData);



    return {

      ok: true,

      mode: "start",

      comp: comp.name,

      outputJson: paths.outFile.fsName,

      outputFolder: paths.outFolder.fsName,

      note: "Poll with MODE='poll' or run restore-slots.jsx after export"

    };

  }



  function pollExport() {

    var paths = getPaths();

    var outExists = paths.outFile.exists;

    var status = readJsonFile(paths.statusFile.fsName);



    if (outExists) {

      writeJsonFile(paths.statusFile.fsName, {

        state: "done",

        finishedAt: new Date().toUTCString(),

        outputJson: paths.outFile.fsName

      });

      return {

        ok: true,

        mode: "poll",

        done: true,

        outputJson: paths.outFile.fsName,

        outputFolder: paths.outFolder.fsName,

        bytes: paths.outFile.length

      };

    }



    return {

      ok: true,

      mode: "poll",

      done: false,

      outputJson: paths.outFile.fsName,

      status: status

    };

  }



  function waitForExport() {

    var paths = getPaths();

    var start = new Date().getTime();

    while (!paths.outFile.exists) {

      $.sleep(POLL_MS);

      if (new Date().getTime() - start > WAIT_MS) {

        throw new Error("Timed out waiting for export file: " + paths.outFile.fsName);

      }

      paths.outFile = new File(paths.outFile.fsName);

    }

    return pollExport();

  }



  if (MODE === "poll") {

    return pollExport();

  }



  var started = startExport();



  if (MODE === "start") {

    return started;

  }



  return waitForExport();

})();


