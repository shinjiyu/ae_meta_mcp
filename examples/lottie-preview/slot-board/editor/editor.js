/**
 * Slot Board Editor — create / manage config, layout tabs.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "slot-board-editor.active-config.v4";
  var STORAGE_KEY_LEGACY = "slot-board-editor.active-config.v3";
  var VIEW_STORAGE_KEY = "slot-board-editor.view-options.v1";
  var TAB_IDS = ["basic", "layout", "frames", "board", "symlib", "file"];

  var state = {
    config: null,
    runtime: null,
    activeTab: "basic",
    symbolCatalog: [],
    selectedSymbol: "s1.png",
    selectedCell: null,
    view: {
      showRulers: false,
      showGuides: false,
      previewMode: "board",
      previewZoom: 1,
    },
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function loadDraft() {
    var keys = [STORAGE_KEY, STORAGE_KEY_LEGACY];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var cfg = SlotBoardConfig.normalizeConfig(JSON.parse(raw));
        if (keys[i] !== STORAGE_KEY) saveDraft(cfg);
        return cfg;
      } catch (e) {
        console.warn("draft load failed:", e.message);
        localStorage.removeItem(keys[i]);
      }
    }
    return null;
  }

  function saveDraft(config) {
    var payload = config || state.config;
    if (payload) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function loadViewOptions() {
    try {
      var raw = localStorage.getItem(VIEW_STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      state.view.showRulers = !!parsed.showRulers;
      state.view.showGuides = !!parsed.showGuides;
      if (parsed.previewMode === "board" || parsed.previewMode === "comp") {
        state.view.previewMode = parsed.previewMode;
      }
      if (parsed.previewZoom) state.view.previewZoom = Number(parsed.previewZoom) || 1;
    } catch (e) {
      localStorage.removeItem(VIEW_STORAGE_KEY);
    }
  }

  function saveViewOptions() {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(state.view));
  }

  function syncViewToggles() {
    if (!els.toggleRulers || !els.toggleGuides) return;
    els.toggleRulers.checked = state.view.showRulers;
    els.toggleGuides.checked = state.view.showGuides;
    if (els.previewMode) els.previewMode.value = state.view.previewMode;
    if (els.previewZoom) els.previewZoom.value = String(state.view.previewZoom);
  }

  function getViewOptions() {
    return {
      showRulers: state.view.showRulers,
      showGuides: state.view.showGuides,
      previewMode: state.view.previewMode,
      previewZoom: state.view.previewZoom,
    };
  }

  function getRuntimeViewOptions() {
    return Object.assign({}, getViewOptions(), {
      selectedCell: state.selectedCell,
      onCellClick: onCanvasCellClick,
    });
  }

  function applyViewOptions() {
    saveViewOptions();
    syncViewToggles();
    if (state.runtime) {
      state.runtime.setViewOptions(getRuntimeViewOptions());
      requestAnimationFrame(refreshBoardSizeMeta);
    }
  }

  function onViewToggleChange() {
    state.view.showRulers = els.toggleRulers.checked;
    state.view.showGuides = els.toggleGuides.checked;
    applyViewOptions();
  }

  function onPreviewControlChange() {
    state.view.previewMode = els.previewMode.value === "board" ? "board" : "comp";
    state.view.previewZoom = Number(els.previewZoom.value) || 1;
    applyViewOptions();
  }

  function onPreviewFrameChange() {
    if (!state.config || !els.previewFrame) return;
    switchToFrame(els.previewFrame.value, { keepSelection: false });
  }

  function getActiveFrame() {
    if (!state.config) return null;
    return SlotBoardConfig.getFrame(state.config, state.config.activeFrameId);
  }

  function switchToFrame(frameId, options) {
    if (!state.config || state.config.activeFrameId === frameId) {
      syncFrameUi();
      return;
    }
    options = options || {};
    try {
      state.config = SlotBoardConfig.setActiveFrame(state.config, frameId);
      if (!options.keepSelection) state.selectedCell = null;
      saveDraft();
      syncFrameUi();
      refreshBoardPanel();
      if (state.runtime) state.runtime.setConfig(state.config);
      refreshRuntimeView();
    } catch (e) {
      alert(e.message);
      syncFrameUi();
    }
  }

  function syncPreviewFrameSelect() {
    if (!els.previewFrame || !state.config) return;
    var active = state.config.activeFrameId;
    els.previewFrame.innerHTML = "";
    state.config.frames.forEach(function (frame, index) {
      var opt = document.createElement("option");
      opt.value = frame.id;
      opt.textContent = index + " · " + frame.id + " · " + frame.name;
      if (frame.id === active) opt.selected = true;
      els.previewFrame.appendChild(opt);
    });
  }

  function renderFrameList() {
    if (!els.frameList || !state.config) return;
    els.frameList.innerHTML = "";
    state.config.frames.forEach(function (frame, index) {
      var stats = SlotBoardConfig.countFilledCells(state.config, frame.id);
      var item = document.createElement("div");
      item.className =
        "frame-item" + (frame.id === state.config.activeFrameId ? " active" : "");

      var head = document.createElement("div");
      head.className = "frame-item-head";

      var badge = document.createElement("span");
      badge.className = "frame-badge";
      badge.textContent = frame.id;

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "frame-name-input";
      nameInput.value = frame.name;
      nameInput.maxLength = 48;
      nameInput.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      nameInput.addEventListener("change", function () {
        onFrameRename(frame.id, nameInput.value);
      });
      nameInput.addEventListener("blur", function () {
        onFrameRename(frame.id, nameInput.value);
      });

      head.appendChild(badge);
      head.appendChild(nameInput);

      var meta = document.createElement("div");
      meta.className = "frame-meta";
      meta.textContent =
        "序号 " + index + " · 已填 " + stats.filled + "/" + stats.total;

      var actions = document.createElement("div");
      actions.className = "frame-item-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn ghost";
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        switchToFrame(frame.id);
        switchTab("board");
      });

      var upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "btn ghost";
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        onMoveFrame(frame.id, -1);
      });

      var downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "btn ghost";
      downBtn.textContent = "↓";
      downBtn.disabled = index === state.config.frames.length - 1;
      downBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        onMoveFrame(frame.id, 1);
      });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn ghost";
      delBtn.textContent = "删除";
      delBtn.disabled = state.config.frames.length <= 1;
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        onDeleteFrame(frame.id);
      });

      actions.appendChild(editBtn);
      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(delBtn);

      item.appendChild(head);
      item.appendChild(meta);
      item.appendChild(actions);

      item.addEventListener("click", function () {
        switchToFrame(frame.id);
      });

      els.frameList.appendChild(item);
    });
  }

  function syncFrameUi() {
    renderFrameList();
    syncPreviewFrameSelect();
    if (els.boardFrameLabel && state.config) {
      var frame = getActiveFrame();
      els.boardFrameLabel.textContent = frame
        ? frame.id + " · " + frame.name
        : state.config.activeFrameId;
    }
  }

  function onFrameRename(frameId, name) {
    if (!state.config) return;
    try {
      state.config = SlotBoardConfig.renameFrame(state.config, frameId, name);
      saveDraft();
      syncFrameUi();
    } catch (e) {
      alert(e.message);
      syncFrameUi();
    }
  }

  function onAddFrameEmpty() {
    if (!state.config) return;
    try {
      state.config = SlotBoardConfig.addFrame(state.config, { name: "", activate: true });
      state.selectedCell = null;
      saveDraft();
      syncFrameUi();
      refreshBoardPanel();
      mountRuntime();
    } catch (e) {
      alert(e.message);
    }
  }

  function onDuplicateActiveFrame() {
    if (!state.config) return;
    try {
      state.config = SlotBoardConfig.addFrame(state.config, {
        duplicateFrom: state.config.activeFrameId,
        activate: true,
      });
      state.selectedCell = null;
      saveDraft();
      syncFrameUi();
      refreshBoardPanel();
      mountRuntime();
    } catch (e) {
      alert(e.message);
    }
  }

  function onDeleteFrame(frameId) {
    if (!state.config) return;
    var frame = SlotBoardConfig.getFrame(state.config, frameId);
    if (!frame) return;
    if (!confirm("删除帧 " + frame.id + " · " + frame.name + "？")) return;
    try {
      state.config = SlotBoardConfig.deleteFrame(state.config, frameId);
      state.selectedCell = null;
      saveDraft();
      syncFrameUi();
      refreshBoardPanel();
      mountRuntime();
    } catch (e) {
      alert(e.message);
    }
  }

  function onMoveFrame(frameId, delta) {
    if (!state.config) return;
    try {
      state.config = SlotBoardConfig.moveFrame(state.config, frameId, delta);
      saveDraft();
      syncFrameUi();
    } catch (e) {
      alert(e.message);
    }
  }

  function getPageScale() {
    if (window.visualViewport && window.visualViewport.scale) {
      return window.visualViewport.scale;
    }
    return 1;
  }

  function formatSizeText(size) {
    var L = size.layout;
    var c = state.config.board;
    return (
      size.width +
      " × " +
      size.height +
      " px\n" +
      c.cols +
      "×" +
      c.rows +
      " · symbol " +
      L.symbolW +
      "×" +
      L.symbolH +
      " · 列距 " +
      L.colGap +
      " · 行距 " +
      L.rowGap +
      " · 内边距 " +
      L.padding
    );
  }

  function refreshBoardSizeMeta() {
    if (!state.config) return;
    var size = SlotBoardConfig.computeBoardSize(state.config);
    var text = formatSizeText(size);
    els.metaBoardSize.textContent =
      Math.round(size.width) + " × " + Math.round(size.height) + " px";
    if (els.layoutCalc) els.layoutCalc.textContent = text;

    var domW = size.width;
    var domH = size.height;
    var symbolW = size.layout.symbolW;
    var symbolH = size.layout.symbolH;
    var zoom = state.view.previewZoom;
    var pageScale = getPageScale();

    if (state.runtime) {
      var m = state.runtime.getMetrics();
      domW = m.canvasDomW != null ? m.canvasDomW : domW;
      domH = m.canvasDomH != null ? m.canvasDomH : domH;
      symbolW = m.symbolW;
      symbolH = m.symbolH;
      zoom = m.zoom;
    }

    var parts = [
      "盘面 " + Math.round(size.width) + "×" + Math.round(size.height) + " px",
      "格子 " + symbolW + "×" + symbolH,
      "canvas " + domW + "×" + domH,
    ];

    if (zoom !== 1) parts.push("显示 @" + Math.round(zoom * 100) + "%");
    if (pageScale !== 1) parts.push("页缩放 " + Math.round(pageScale * 100) + "%");
    if (zoom === 1 && (domW !== size.width || domH !== size.height)) parts.push("⚠ canvas尺寸异常");

    els.previewSize.textContent = parts.join(" · ");
    els.previewSize.classList.remove("hidden");
  }

  function syncLayoutInputs() {
    if (!state.config) return;
    var L = state.config.board.layout;
    els.layoutSymbolW.value = L.symbolW;
    els.layoutSymbolH.value = L.symbolH;
    els.layoutColGap.value = L.colGap;
    els.layoutRowGap.value = L.rowGap;
    els.layoutPadding.value = L.padding;
  }

  function syncBasicInputs() {
    if (!state.config) return;
    els.editName.value = state.config.name;
    els.metaId.textContent = state.config.id;
    els.metaCreated.textContent = new Date(state.config.createdAt).toLocaleString();
    els.metaDimsVal.textContent = state.config.board.cols + " × " + state.config.board.rows;
  }

  function switchTab(tabId) {
    if (TAB_IDS.indexOf(tabId) < 0) return;
    state.activeTab = tabId;
    els.subTabs.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    TAB_IDS.forEach(function (id) {
      $("tab-" + id).classList.toggle("hidden", id !== tabId);
    });
  }

  function applyLayoutFromInputs() {
    if (!state.config) return;
    try {
      state.config = SlotBoardConfig.updateLayout(state.config, {
        symbolW: Number(els.layoutSymbolW.value),
        symbolH: Number(els.layoutSymbolH.value),
        colGap: Number(els.layoutColGap.value),
        rowGap: Number(els.layoutRowGap.value),
        padding: Number(els.layoutPadding.value),
      });
      saveDraft();
      mountRuntime();
    } catch (e) {
      alert(e.message);
      syncLayoutInputs();
    }
  }

  function showMode(mode) {
    var isManage = mode === "manage";
    els.panelCreate.classList.toggle("hidden", isManage);
    els.panelManage.classList.toggle("hidden", !isManage);
    els.modeBadge.textContent = isManage ? "管理中" : "新建";
    els.modeBadge.classList.toggle("active", isManage);
    els.previewHint.classList.toggle("hidden", isManage);
    els.previewToolbar.classList.toggle("hidden", !isManage);
  }

  function mountRuntime() {
    var view = getRuntimeViewOptions();
    if (state.runtime) {
      try {
        state.runtime.setViewOptions(view);
        state.runtime.setConfig(state.config);
        refreshBoardSizeMeta();
        requestAnimationFrame(refreshBoardSizeMeta);
        return;
      } catch (e) {
        state.runtime = null;
        els.boardHost.innerHTML = "";
      }
    }
    state.runtime = new SlotBoardRuntime(els.boardHost, state.config, view);
    refreshBoardSizeMeta();
    requestAnimationFrame(refreshBoardSizeMeta);
  }

  function refreshRuntimeView() {
    if (state.runtime) state.runtime.setViewOptions(getRuntimeViewOptions());
  }

  function applyGridChange() {
    saveDraft();
    syncFrameUi();
    refreshBoardPanel();
    if (state.runtime) state.runtime.setConfig(state.config);
  }

  function loadSymbolCatalog(done) {
    fetch("/symbols/index.json")
      .then(function (res) {
        return res.json();
      })
      .then(function (list) {
        state.symbolCatalog = Array.isArray(list) ? list : [];
        if (state.symbolCatalog.length) {
          if (
            !state.selectedSymbol ||
            state.symbolCatalog.indexOf(state.selectedSymbol) < 0
          ) {
            state.selectedSymbol = state.symbolCatalog[0];
          }
        }
        updateCatalogHint();
        renderSymbolLibrary();
        if (done) done();
      })
      .catch(function () {
        state.symbolCatalog = [];
        updateCatalogHint();
        renderSymbolLibrary();
        if (done) done();
      });
  }

  function updateCatalogHint() {
    var n = state.symbolCatalog.length;
    var text = n ? "符号库：" + n + " 个 PNG" : "符号库：空（请导入 PNG）";
    if (els.symCatalogHint) els.symCatalogHint.textContent = text;
    if (els.symLibCount) els.symLibCount.textContent = String(n);
  }

  function setImportStatus(message, isError) {
    if (!els.symImportStatus) return;
    if (!message) {
      els.symImportStatus.classList.add("hidden");
      els.symImportStatus.textContent = "";
      return;
    }
    els.symImportStatus.textContent = message;
    els.symImportStatus.classList.remove("hidden");
    els.symImportStatus.classList.toggle("error", !!isError);
  }

  function uploadSymbolFile(file) {
    return fetch("/symbols/upload?name=" + encodeURIComponent(file.name), {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: file,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.ok) {
          throw new Error((data && data.error) || "上传失败");
        }
        return data;
      });
    });
  }

  function importSymbolFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return /\.png$/i.test(f.name) || f.type === "image/png";
    });
    if (!files.length) {
      setImportStatus("请选择 PNG 文件", true);
      return Promise.resolve();
    }

    setImportStatus("正在导入 " + files.length + " 个文件…", false);
    var chain = Promise.resolve();
    var imported = [];
    var errors = [];

    files.forEach(function (file) {
      chain = chain.then(function () {
        return uploadSymbolFile(file)
          .then(function (data) {
            imported.push(data.name);
          })
          .catch(function (e) {
            errors.push(file.name + ": " + e.message);
          });
      });
    });

    return chain.then(function () {
      return loadSymbolCatalog(function () {
        if (state.config) {
          refreshBoardPanel();
          if (state.runtime) state.runtime.setConfig(state.config);
        } else {
          renderSymbolPalette();
        }
        if (errors.length) {
          setImportStatus(
            "成功 " + imported.length + "，失败 " + errors.length + "：" + errors.join("；"),
            true
          );
        } else {
          setImportStatus("已导入 " + imported.length + " 个：" + imported.join(", "), false);
        }
      });
    });
  }

  function deleteSymbol(name) {
    if (!name) return;
    if (state.config && symbolUsedInGrid(name)) {
      if (!confirm(name + " 仍在盘面中使用，确定删除？")) return;
    } else if (!confirm("删除符号 " + name + "？")) {
      return;
    }

    fetch("/symbols/delete?name=" + encodeURIComponent(name), { method: "DELETE" })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error((data && data.error) || "删除失败");
          return data;
        });
      })
      .then(function () {
        if (state.selectedSymbol === name) {
          state.selectedSymbol = state.symbolCatalog[0] || null;
        }
        return loadSymbolCatalog(function () {
          if (state.config) refreshBoardPanel();
          setImportStatus("已删除 " + name, false);
        });
      })
      .catch(function (e) {
        setImportStatus(e.message, true);
      });
  }

  function symbolUsedInGrid(name) {
    if (!state.config) return false;
    return SlotBoardConfig.symbolUsedInAnyFrame(state.config, name);
  }

  function renderSymbolLibrary() {
    if (!els.symbolLibrary) return;
    els.symbolLibrary.innerHTML = "";

    if (!state.symbolCatalog.length) {
      var empty = document.createElement("p");
      empty.className = "muted-note";
      empty.textContent = "暂无符号，请导入 PNG。";
      els.symbolLibrary.appendChild(empty);
      return;
    }

    state.symbolCatalog.forEach(function (name) {
      var item = document.createElement("div");
      item.className = "sym-lib-item";

      var thumb = document.createElement("div");
      thumb.className = "sym-lib-thumb";
      var img = document.createElement("img");
      img.src = "/symbols/" + encodeURIComponent(name);
      img.alt = name;
      thumb.appendChild(img);

      var meta = document.createElement("div");
      meta.className = "sym-lib-meta";
      var title = document.createElement("div");
      title.className = "sym-lib-name mono";
      title.textContent = name;
      meta.appendChild(title);

      var actions = document.createElement("div");
      actions.className = "sym-lib-actions";
      var useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.className = "btn ghost sym-lib-use";
      useBtn.textContent = "选为笔刷";
      useBtn.addEventListener("click", function () {
        state.selectedSymbol = name;
        renderSymbolPalette();
        if (state.activeTab !== "board") switchTab("board");
      });
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn ghost sym-lib-del";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", function () {
        deleteSymbol(name);
      });
      actions.appendChild(useBtn);
      actions.appendChild(delBtn);

      item.appendChild(thumb);
      item.appendChild(meta);
      item.appendChild(actions);
      els.symbolLibrary.appendChild(item);
    });
  }

  function bindSymbolImportUi() {
    function openPicker() {
      if (els.fileImportSymbols) els.fileImportSymbols.click();
    }

    if (els.btnImportSymbols) els.btnImportSymbols.addEventListener("click", openPicker);
    if (els.btnImportSymbolsCreate) {
      els.btnImportSymbolsCreate.addEventListener("click", openPicker);
    }
    if (els.fileImportSymbols) {
      els.fileImportSymbols.addEventListener("change", function (e) {
        var files = e.target.files;
        if (files && files.length) importSymbolFiles(files);
        e.target.value = "";
      });
    }

    var dropZone = els.symDropZone;
    if (!dropZone) return;

    ["dragenter", "dragover"].forEach(function (ev) {
      dropZone.addEventListener(ev, function (e) {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      dropZone.addEventListener(ev, function (e) {
        e.preventDefault();
        dropZone.classList.remove("dragover");
      });
    });
    dropZone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) {
        importSymbolFiles(e.dataTransfer.files);
      }
    });
  }

  function symbolShortName(fileName) {
    return fileName.replace(/\.png$/i, "");
  }

  function renderSymbolPalette() {
    if (!els.symbolPalette) return;
    els.symbolPalette.innerHTML = "";

    var eraser = document.createElement("button");
    eraser.type = "button";
    eraser.className =
      "sym-btn sym-eraser" + (state.selectedSymbol === null ? " active" : "");
    eraser.title = "擦除 (Alt+点击格子)";
    eraser.textContent = "∅";
    eraser.addEventListener("click", function () {
      state.selectedSymbol = null;
      renderSymbolPalette();
    });
    els.symbolPalette.appendChild(eraser);

    state.symbolCatalog.forEach(function (name) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sym-btn" + (state.selectedSymbol === name ? " active" : "");
      btn.title = name;
      btn.addEventListener("click", function () {
        state.selectedSymbol = name;
        renderSymbolPalette();
      });

      var img = document.createElement("img");
      img.src = "/symbols/" + encodeURIComponent(name);
      img.alt = name;
      img.onerror = function () {
        btn.innerHTML = "";
        var span = document.createElement("span");
        span.className = "sym-label";
        span.textContent = symbolShortName(name);
        btn.appendChild(span);
      };
      btn.appendChild(img);
      els.symbolPalette.appendChild(btn);
    });
  }

  function renderScaleMulList() {
    if (!els.symbolScaleList || !state.config) return;
    els.symbolScaleList.innerHTML = "";

    var names = state.symbolCatalog.slice();
    Object.keys(state.config.symbols.scaleMul || {}).forEach(function (n) {
      if (names.indexOf(n) < 0) names.push(n);
    });

    names.forEach(function (name) {
      var row = document.createElement("div");
      row.className = "scale-row";

      var label = document.createElement("label");
      label.textContent = symbolShortName(name);

      var input = document.createElement("input");
      input.type = "number";
      input.min = "0.1";
      input.max = "3";
      input.step = "0.01";
      input.dataset.symbol = name;
      input.value =
        state.config.symbols.scaleMul[name] != null
          ? state.config.symbols.scaleMul[name]
          : 1;
      input.addEventListener("change", onScaleMulChange);
      input.addEventListener("input", onScaleMulChange);

      row.appendChild(label);
      row.appendChild(input);
      els.symbolScaleList.appendChild(row);
    });
  }

  function refreshBoardPanel() {
    if (!state.config) return;
    if (els.symCellFill) {
      els.symCellFill.value = state.config.symbols.cellFill;
    }
    renderSymbolPalette();
    renderScaleMulList();

    var stats = SlotBoardConfig.countFilledCells(state.config);
    if (els.symGridStats) {
      els.symGridStats.textContent = stats.filled + " / " + stats.total;
    }
    if (els.symSelectedCell) {
      if (state.selectedCell) {
        var c = state.selectedCell.col;
        var r = state.selectedCell.row;
        var sym = state.config.grid[r][c];
        els.symSelectedCell.textContent =
          "c" + (c + 1) + " r" + (r + 1) + (sym ? " · " + symbolShortName(sym) : " · 空");
      } else {
        els.symSelectedCell.textContent = "—";
      }
    }
  }

  function onScaleMulChange(e) {
    if (!state.config) return;
    var name = e.target.dataset.symbol;
    var val = Number(e.target.value);
    if (!name || !Number.isFinite(val) || val <= 0) {
      e.target.value =
        state.config.symbols.scaleMul[name] != null
          ? state.config.symbols.scaleMul[name]
          : 1;
      return;
    }
    try {
      state.config = SlotBoardConfig.updateSymbols(state.config, {
        scaleMul: (function () {
          var patch = {};
          patch[name] = val;
          return patch;
        })(),
      });
      saveDraft();
      if (state.runtime) state.runtime.setConfig(state.config);
    } catch (err) {
      alert(err.message);
    }
  }

  function applyCellFillFromInput() {
    if (!state.config) return;
    try {
      state.config = SlotBoardConfig.updateSymbols(state.config, {
        cellFill: Number(els.symCellFill.value),
      });
      saveDraft();
      if (state.runtime) state.runtime.setConfig(state.config);
    } catch (e) {
      alert(e.message);
      els.symCellFill.value = state.config.symbols.cellFill;
    }
  }

  function onCanvasCellClick(col, row, altKey) {
    if (!state.config) return;
    state.selectedCell = { col: col, row: row };
    if (altKey) {
      state.config = SlotBoardConfig.setGridCell(state.config, col, row, null);
    } else {
      state.config = SlotBoardConfig.setGridCell(
        state.config,
        col,
        row,
        state.selectedSymbol
      );
    }
    applyGridChange();
    refreshRuntimeView();
  }

  function clearSelectedCell() {
    if (!state.config || !state.selectedCell) return;
    var c = state.selectedCell.col;
    var r = state.selectedCell.row;
    state.config = SlotBoardConfig.setGridCell(state.config, c, r, null);
    applyGridChange();
  }

  function clearBoard() {
    if (!state.config) return;
    if (!confirm("清空当前帧的所有符号？")) return;
    state.config = SlotBoardConfig.updateGrid(
      state.config,
      SlotBoardConfig.emptyGrid(state.config.board.cols, state.config.board.rows)
    );
    applyGridChange();
  }

  function refreshManagePanel() {
    syncBasicInputs();
    syncLayoutInputs();
    syncFrameUi();
    refreshBoardPanel();
    refreshBoardSizeMeta();
  }

  function openConfig(config) {
    state.config = SlotBoardConfig.normalizeConfig(config);
    saveDraft();
    showMode("manage");
    switchTab(state.activeTab);
    refreshManagePanel();
    mountRuntime();
  }

  function closeConfig() {
    state.config = null;
    state.runtime = null;
    state.activeTab = "basic";
    state.selectedCell = null;
    els.boardHost.innerHTML = "";
    els.previewSize.classList.add("hidden");
    saveDraft();
    showMode("create");
  }

  function onCreate() {
    try {
      var cols = Number(els.createCols.value);
      var rows = Number(els.createRows.value);
      var config = SlotBoardConfig.createConfig({
        name: els.createName.value,
        cols: cols,
        rows: rows,
      });
      state.activeTab = "layout";
      openConfig(config);
    } catch (e) {
      alert(e.message);
    }
  }

  function onExport() {
    if (!state.config) return;
    var payload = SlotBoardConfig.deepClone(state.config);
    delete payload.grid;
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = state.config.id + ".json";
    a.click();
  }

  function onImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var incoming = SlotBoardConfig.normalizeConfig(JSON.parse(reader.result));
        if (state.config) {
          SlotBoardConfig.assertSameDimensions(state.config, incoming);
          incoming.id = state.config.id;
          incoming.createdAt = state.config.createdAt;
        }
        openConfig(incoming);
      } catch (e) {
        alert("导入失败: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  function onNewConfig() {
    if (
      state.config &&
      !confirm("放弃当前配置并新建？未导出的修改将丢失。")
    ) {
      return;
    }
    closeConfig();
  }

  function onNameChange() {
    if (!state.config) return;
    state.config.name = els.editName.value.trim() || "未命名盘面";
    saveDraft();
  }

  function cacheElements() {
    els.previewPane = $("preview-pane");
    els.boardHost = $("board-host");
    els.previewHint = $("preview-hint");
    els.previewToolbar = $("preview-toolbar");
    els.previewSize = $("preview-size");
    els.toggleRulers = $("toggle-rulers");
    els.toggleGuides = $("toggle-guides");
    els.previewMode = $("preview-mode");
    els.previewZoom = $("preview-zoom");
    els.previewFrame = $("preview-frame");
    els.metaBoardSize = $("meta-board-size");
    els.layoutCalc = $("layout-calc");
    els.modeBadge = $("mode-badge");
    els.panelCreate = $("panel-create");
    els.panelManage = $("panel-manage");
    els.subTabs = Array.prototype.slice.call(document.querySelectorAll(".sub-tab"));
    els.createName = $("create-name");
    els.createCols = $("create-cols");
    els.createRows = $("create-rows");
    els.editName = $("edit-name");
    els.metaId = $("meta-id");
    els.metaCreated = $("meta-created");
    els.metaDimsVal = $("meta-dims-val");
    els.layoutSymbolW = $("layout-symbol-w");
    els.layoutSymbolH = $("layout-symbol-h");
    els.layoutColGap = $("layout-col-gap");
    els.layoutRowGap = $("layout-row-gap");
    els.layoutPadding = $("layout-padding");
    els.symbolPalette = $("symbol-palette");
    els.symbolScaleList = $("symbol-scale-list");
    els.symCellFill = $("sym-cell-fill");
    els.symGridStats = $("sym-grid-stats");
    els.symSelectedCell = $("sym-selected-cell");
    els.symbolLibrary = $("symbol-library");
    els.symLibCount = $("sym-lib-count");
    els.symDropZone = $("sym-drop-zone");
    els.symImportStatus = $("sym-import-status");
    els.symCatalogHint = $("sym-catalog-hint");
    els.btnImportSymbols = $("btn-import-symbols");
    els.btnImportSymbolsCreate = $("btn-import-symbols-create");
    els.fileImportSymbols = $("file-import-symbols");
    els.frameList = $("frame-list");
    els.boardFrameLabel = $("board-frame-label");
    els.btnFrameAdd = $("btn-frame-add");
    els.btnFrameDup = $("btn-frame-dup");
  }

  function bindEvents() {
    $("btn-create").addEventListener("click", onCreate);
    $("btn-export").addEventListener("click", onExport);
    $("btn-import").addEventListener("click", function () {
      $("file-import").click();
    });
    $("file-import").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) onImport(f);
      e.target.value = "";
    });
    $("btn-new").addEventListener("click", onNewConfig);

    els.subTabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchTab(btn.dataset.tab);
      });
    });

    els.editName.addEventListener("change", onNameChange);
    els.editName.addEventListener("blur", onNameChange);

    ["layoutSymbolW", "layoutSymbolH", "layoutColGap", "layoutRowGap", "layoutPadding"].forEach(function (key) {
      els[key].addEventListener("change", applyLayoutFromInputs);
      els[key].addEventListener("input", applyLayoutFromInputs);
    });

    els.toggleRulers.addEventListener("change", onViewToggleChange);
    els.toggleGuides.addEventListener("change", onViewToggleChange);
    els.previewMode.addEventListener("change", onPreviewControlChange);
    els.previewZoom.addEventListener("change", onPreviewControlChange);
    if (els.previewFrame) els.previewFrame.addEventListener("change", onPreviewFrameChange);

    if (els.btnFrameAdd) els.btnFrameAdd.addEventListener("click", onAddFrameEmpty);
    if (els.btnFrameDup) els.btnFrameDup.addEventListener("click", onDuplicateActiveFrame);

    if (els.symCellFill) {
      els.symCellFill.addEventListener("change", applyCellFillFromInput);
      els.symCellFill.addEventListener("input", applyCellFillFromInput);
    }
    $("btn-clear-cell").addEventListener("click", clearSelectedCell);
    $("btn-clear-board").addEventListener("click", clearBoard);
    bindSymbolImportUi();
  }

  function boot() {
    cacheElements();
    loadViewOptions();
    syncViewToggles();
    bindEvents();

    loadSymbolCatalog(function () {
      var draft = loadDraft();
      if (draft) {
        openConfig(draft);
      } else {
        showMode("create");
      }
    });
  }

  boot();
})();
