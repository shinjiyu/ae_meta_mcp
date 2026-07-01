/**
 * Slot Board Editor — create / manage config, layout tabs.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "slot-board-editor.active-config.v5";
  var STORAGE_KEY_LEGACY = "slot-board-editor.active-config.v4";
  var STORAGE_KEY_LEGACY_V3 = "slot-board-editor.active-config.v3";
  var VIEW_STORAGE_KEY = "slot-board-editor.view-options.v1";
  var ANIM_PARAMS_STORAGE_KEY = "slot-board-editor.anim-params.v4";
  var TAB_IDS = ["basic", "layout", "frames", "board", "anim", "flow", "symlib", "file"];

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
    anim: {
      editMode: "exit",
      activeSequenceId: null,
      exit: {
        type: "boardDropOut",
        fromFrameId: "f0",
        params: null,
      },
      enter: {
        type: "boardDropIn",
        toFrameId: "f1",
        params: null,
      },
      enterMode: false,
      playing: false,
      currentAnim: null,
      offsets: {},
    },
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function loadDraft() {
    var keys = [STORAGE_KEY, STORAGE_KEY_LEGACY, STORAGE_KEY_LEGACY_V3];
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
    var animState = null;
    if (state.activeTab === "anim" || state.activeTab === "flow") {
      animState = {
        offsets: state.anim.offsets,
        highlightCols: null,
        enterMode: !!state.anim.enterMode,
      };
    }
    return Object.assign({}, getViewOptions(), {
      selectedCell: state.activeTab === "board" ? state.selectedCell : null,
      onCellClick: state.activeTab === "board" ? onCanvasCellClick : null,
      animState: animState,
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
    if (state.activeTab === "anim" || state.activeTab === "flow") stopAnimPreview(false);
    switchToFrame(els.previewFrame.value, { keepSelection: false });
  }

  function getAnimBlock(mode) {
    return mode === "enter" ? state.anim.enter : state.anim.exit;
  }

  function templateDefaultParams(type) {
    if (!window.SlotBoardAnim) return {};
    return SlotBoardConfig.deepClone(window.SlotBoardAnim.getAnimTemplate(type).defaultParams);
  }

  function ensureAnimDefaults() {
    if (!window.SlotBoardAnim || !window.SlotBoardAnim.pickTemplateParams) {
      if (!state.anim.exit.params) {
        state.anim.exit.params = templateDefaultParams(state.anim.exit.type);
      }
      if (!state.anim.enter.params) {
        state.anim.enter.params = templateDefaultParams(state.anim.enter.type);
      }
      return;
    }
    if (!state.anim.exit.params) {
      state.anim.exit.params = templateDefaultParams(state.anim.exit.type);
    } else {
      state.anim.exit.params = window.SlotBoardAnim.pickTemplateParams(
        state.anim.exit.type,
        state.anim.exit.params
      );
    }
    if (!state.anim.enter.params) {
      state.anim.enter.params = templateDefaultParams(state.anim.enter.type);
    } else {
      state.anim.enter.params = window.SlotBoardAnim.pickTemplateParams(
        state.anim.enter.type,
        state.anim.enter.params
      );
    }
  }

  function loadAnimParams() {
    try {
      var raw = localStorage.getItem(ANIM_PARAMS_STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed.editMode === "enter" || parsed.editMode === "exit") {
        state.anim.editMode = parsed.editMode;
      }
      if (parsed.exit) {
        if (parsed.exit.type) state.anim.exit.type = parsed.exit.type;
        if (parsed.exit.fromFrameId) state.anim.exit.fromFrameId = parsed.exit.fromFrameId;
        if (parsed.exit.params) state.anim.exit.params = parsed.exit.params;
      }
      if (parsed.enter) {
        if (parsed.enter.type) state.anim.enter.type = parsed.enter.type;
        if (parsed.enter.toFrameId) state.anim.enter.toFrameId = parsed.enter.toFrameId;
        if (parsed.enter.params) state.anim.enter.params = parsed.enter.params;
      }
    } catch (e) {
      localStorage.removeItem(ANIM_PARAMS_STORAGE_KEY);
    }
  }

  function saveAnimParams() {
    ensureAnimDefaults();
    localStorage.setItem(
      ANIM_PARAMS_STORAGE_KEY,
      JSON.stringify({
        editMode: state.anim.editMode,
        exit: state.anim.exit,
        enter: state.anim.enter,
      })
    );
  }

  function getAnimTemplateSchema(type) {
    if (!window.SlotBoardAnim) return [];
    return window.SlotBoardAnim.getAnimTemplate(type).paramSchema || [];
  }

  function getParamFieldEl(key) {
    if (!els.animParamFields) return null;
    for (var i = 0; i < els.animParamFields.length; i++) {
      if (els.animParamFields[i].dataset.paramKey === key) return els.animParamFields[i];
    }
    return null;
  }

  function getParamControl(key) {
    var label = getParamFieldEl(key);
    if (!label) return null;
    return label.querySelector("input, select");
  }

  function readSchemaField(fieldDef, control) {
    if (!control) return undefined;
    if (fieldDef.type === "checkbox") return control.checked;
    if (fieldDef.type === "select") return control.value;
    if (fieldDef.type === "number") {
      var n = Number(control.value);
      var v = isNaN(n) ? 0 : n;
      if (fieldDef.min != null) v = Math.max(fieldDef.min, v);
      if (fieldDef.max != null) v = Math.min(fieldDef.max, v);
      return v;
    }
    return control.value;
  }

  function writeSchemaField(fieldDef, control, value) {
    if (!control) return;
    if (fieldDef.type === "checkbox") {
      control.checked = value !== false;
      return;
    }
    if (fieldDef.type === "select") {
      if (fieldDef.options) {
        syncSelectOptions(control, fieldDef);
      }
      control.value = value != null ? String(value) : control.options[0] ? control.options[0].value : "";
      return;
    }
    control.value = value != null ? String(value) : "";
  }

  function syncSelectOptions(select, fieldDef) {
    if (!fieldDef.options || !select) return;
    var current = select.value;
    select.innerHTML = "";
    fieldDef.options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
    var hasCurrent = fieldDef.options.some(function (opt) {
      return opt.value === current;
    });
    if (hasCurrent) select.value = current;
    else if (fieldDef.options.length) select.value = fieldDef.options[0].value;
  }

  function syncAnimParamUi() {
    if (!els.animParamFields) return;
    var block = getAnimBlock(state.anim.editMode);
    var schema = getAnimTemplateSchema(block.type);
    var visible = {};
    schema.forEach(function (field) {
      visible[field.key] = field;
    });
    els.animParamFields.forEach(function (label) {
      var key = label.dataset.paramKey;
      var field = visible[key];
      label.classList.toggle("hidden", !field);
      if (!field) return;
      var title = label.querySelector(".anim-param-label");
      if (title) title.textContent = field.label;
      if (field.type === "select") {
        var select = label.querySelector("select");
        if (select) syncSelectOptions(select, field);
      }
    });
  }

  function readCurrentBlockFromUi() {
    if (!state.config) return;
    var block = getAnimBlock(state.anim.editMode);
    if (els.animTemplate) block.type = els.animTemplate.value;
    if (els.animFrame) {
      if (state.anim.editMode === "exit") block.fromFrameId = els.animFrame.value;
      else block.toFrameId = els.animFrame.value;
    }
    var schema = getAnimTemplateSchema(block.type);
    var raw = Object.assign({}, block.params || templateDefaultParams(block.type));
    schema.forEach(function (field) {
      var control = getParamControl(field.key);
      raw[field.key] = readSchemaField(field, control);
    });
    if (window.SlotBoardAnim && window.SlotBoardAnim.pickTemplateParams) {
      block.params = window.SlotBoardAnim.pickTemplateParams(block.type, raw);
    } else {
      block.params = raw;
    }
    saveAnimParams();
  }

  function writeCurrentBlockToUi() {
    ensureAnimDefaults();
    var block = getAnimBlock(state.anim.editMode);
    var p = block.params;
    if (els.animTemplate) els.animTemplate.value = block.type;
    syncAnimFrameSelect();
    syncAnimParamUi();
    var schema = getAnimTemplateSchema(block.type);
    schema.forEach(function (field) {
      writeSchemaField(field, getParamControl(field.key), p[field.key]);
    });
  }

  function buildStepFromMode(mode) {
    readCurrentBlockFromUi();
    var block = getAnimBlock(mode);
    var params = block.params;
    if (window.SlotBoardAnim && window.SlotBoardAnim.pickTemplateParams) {
      params = window.SlotBoardAnim.pickTemplateParams(block.type, block.params);
    }
    var step = {
      id: mode === "exit" ? "s1" : "s2",
      type: block.type,
      params: SlotBoardConfig.deepClone(params),
    };
    if (mode === "exit") step.fromFrameId = block.fromFrameId;
    else step.toFrameId = block.toFrameId;
    return step;
  }

  function loadSequenceToState(sequence) {
    if (!sequence || !sequence.steps) return;
    state.anim.activeSequenceId = sequence.id;
    sequence.steps.forEach(function (step) {
      var tmpl = window.SlotBoardAnim && window.SlotBoardAnim.getAnimTemplate(step.type);
      if (!tmpl) return;
      if (tmpl.frameBinding === "exit") {
        state.anim.exit.type = step.type;
        state.anim.exit.fromFrameId = step.fromFrameId || state.anim.exit.fromFrameId;
        state.anim.exit.params = window.SlotBoardAnim.pickTemplateParams(
          step.type,
          step.params || templateDefaultParams(step.type)
        );
      } else if (tmpl.frameBinding === "enter") {
        state.anim.enter.type = step.type;
        state.anim.enter.toFrameId = step.toFrameId || state.anim.enter.toFrameId;
        state.anim.enter.params = window.SlotBoardAnim.pickTemplateParams(
          step.type,
          step.params || templateDefaultParams(step.type)
        );
      }
    });
    writeCurrentBlockToUi();
  }

  function getWorkingSequence() {
    readCurrentBlockFromUi();
    var existing = state.anim.activeSequenceId
      ? SlotBoardConfig.getSequence(state.config, state.anim.activeSequenceId)
      : null;
    var name = SlotBoardConfig.formatLinkLabel(state.config, {
      id: existing ? existing.id : "new",
      steps: [buildStepFromMode("exit"), buildStepFromMode("enter")],
    });
    return {
      id: existing ? existing.id : undefined,
      name: name,
      steps: [buildStepFromMode("exit"), buildStepFromMode("enter")],
    };
  }

  function getAnimDrawState() {
    return {
      offsets: state.anim.offsets,
      highlightCols: null,
      enterMode: !!state.anim.enterMode,
    };
  }

  function formatAnimReadyLabel() {
    if (!state.config) return "就绪";
    var mode = state.anim.editMode === "enter" ? "Enter" : "Exit";
    var block = getAnimBlock(state.anim.editMode);
    ensureAnimDefaults();
    var tmpl = window.SlotBoardAnim.getAnimTemplate(block.type);
    var frameId = state.anim.editMode === "exit" ? block.fromFrameId : block.toFrameId;
    return "就绪 · " + mode + " 步骤 · " + tmpl.label + " · " + frameId;
  }

  function syncTemplateSelect() {
    if (!els.animTemplate || !window.SlotBoardAnim) return;
    var list =
      state.anim.editMode === "enter"
        ? window.SlotBoardAnim.listEnterAnimTemplates()
        : window.SlotBoardAnim.listExitAnimTemplates();
    var block = getAnimBlock(state.anim.editMode);
    els.animTemplate.innerHTML = "";
    list.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.type;
      opt.textContent = t.type + " — " + t.label;
      if (t.type === block.type) opt.selected = true;
      els.animTemplate.appendChild(opt);
    });
  }

  function syncAnimFrameSelect() {
    if (!els.animFrame || !state.config) return;
    var block = getAnimBlock(state.anim.editMode);
    var selected = state.anim.editMode === "exit" ? block.fromFrameId : block.toFrameId;
    var excludeId = state.anim.activeSequenceId;
    els.animFrame.innerHTML = "";
    state.config.frames.forEach(function (frame) {
      var opt = document.createElement("option");
      opt.value = frame.id;
      var label = frame.id + " · " + frame.name;
      var occupied = null;
      if (state.anim.editMode === "exit") {
        occupied = SlotBoardConfig.findSequenceByFromFrame(state.config, frame.id, excludeId);
      } else {
        occupied = SlotBoardConfig.findSequenceByToFrame(state.config, frame.id, excludeId);
      }
      if (occupied) label += " (已占用)";
      opt.textContent = label;
      if (frame.id === selected) opt.selected = true;
      if (occupied && frame.id !== selected) opt.disabled = true;
      els.animFrame.appendChild(opt);
    });
    if (els.animFrameLabel) {
      els.animFrameLabel.textContent = state.anim.editMode === "exit" ? "from 帧" : "to 帧";
    }
    syncAnimLinkEndpoints();
  }

  function syncAnimLinkEndpoints() {
    if (!els.animLinkEndpoints || !state.config) return;
    if (!state.anim.activeSequenceId) {
      els.animLinkEndpoints.textContent = "请选择或新建动画实例";
      return;
    }
    var fromId = state.anim.exit.fromFrameId;
    var toId = state.anim.enter.toFrameId;
    var text = "链路 " + fromId + " → " + toId;
    if (fromId === toId) text += " · from / to 不能相同";
    els.animLinkEndpoints.textContent = text;
  }

  function syncAnimLinkSelect() {
    if (!els.animLinkSelect || !state.config) return;
    var list = state.config.sequences || [];
    els.animLinkSelect.innerHTML = "";
    if (!list.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "（点击新建）";
      els.animLinkSelect.appendChild(empty);
      if (els.btnAnimLinkDel) els.btnAnimLinkDel.disabled = true;
      return;
    }
    if (els.btnAnimLinkDel) els.btnAnimLinkDel.disabled = false;
    list.forEach(function (seq) {
      var opt = document.createElement("option");
      opt.value = seq.id;
      opt.textContent = seq.id + " · " + SlotBoardConfig.formatLinkLabel(state.config, seq);
      if (seq.id === state.anim.activeSequenceId) opt.selected = true;
      els.animLinkSelect.appendChild(opt);
    });
    if (!state.anim.activeSequenceId && list.length) {
      state.anim.activeSequenceId = list[0].id;
      els.animLinkSelect.value = list[0].id;
    }
  }

  function syncAnimEditModeUi() {
    if (els.animModeTabs) {
      els.animModeTabs.forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.mode === state.anim.editMode);
      });
    }
    syncTemplateSelect();
    syncAnimFrameSelect();
    writeCurrentBlockToUi();
  }

  function syncAnimSequenceSelect() {
    syncAnimLinkSelect();
  }

  function syncAnimPanel() {
    if (!state.config) return;
    ensureAnimDefaults();
    if (state.config.frames.length >= 2) {
      if (!state.anim.exit.fromFrameId) state.anim.exit.fromFrameId = state.config.frames[0].id;
      if (!state.anim.enter.toFrameId) state.anim.enter.toFrameId = state.config.frames[1].id;
    }
    syncAnimLinkSelect();
    if (state.anim.activeSequenceId) {
      var seq = SlotBoardConfig.getSequence(state.config, state.anim.activeSequenceId);
      if (seq) loadSequenceToState(seq);
    } else if (state.config.sequences && state.config.sequences.length) {
      loadSequenceToState(state.config.sequences[0]);
    }
    syncAnimEditModeUi();
    updateAnimButtons();
    if (!state.anim.playing) setAnimStatus(formatAnimReadyLabel());
  }

  function switchAnimEditMode(mode) {
    if (mode !== "exit" && mode !== "enter") return;
    readCurrentBlockFromUi();
    state.anim.editMode = mode;
    syncAnimEditModeUi();
    setAnimStatus(formatAnimReadyLabel());
  }

  function setAnimStatus(text, kind) {
    if (!els.animStatus) return;
    els.animStatus.textContent = text;
    els.animStatus.classList.remove("playing", "error");
    if (kind === "playing") els.animStatus.classList.add("playing");
    if (kind === "error") els.animStatus.classList.add("error");
  }

  function updateAnimButtons() {
    var busy = state.anim.playing;
    if (els.btnAnimPreviewStep) els.btnAnimPreviewStep.disabled = busy || !state.config;
    if (els.btnAnimSaveStep) els.btnAnimSaveStep.disabled = !state.config;
    if (els.btnAnimStop) els.btnAnimStop.disabled = !busy;
    updateFlowButtons();
  }

  function updateFlowButtons() {
    var busy = state.anim.playing;
    if (els.btnFlowPlay) els.btnFlowPlay.disabled = busy || !state.config;
    if (els.btnFlowStop) els.btnFlowStop.disabled = !busy;
  }

  function setFlowStatus(text, kind) {
    if (!els.flowStatus) return;
    els.flowStatus.textContent = text;
    els.flowStatus.classList.remove("playing", "error");
    if (kind === "playing") els.flowStatus.classList.add("playing");
    if (kind === "error") els.flowStatus.classList.add("error");
  }

  function resetAnimOffsets() {
    state.anim.offsets = {};
    if (state.runtime && (state.activeTab === "anim" || state.activeTab === "flow")) {
      state.runtime.redraw(getAnimDrawState());
    }
  }

  function stopAnimPreview(showStatus) {
    if (state.anim.currentAnim) {
      if (state.anim.currentAnim.cancel) state.anim.currentAnim.cancel();
      state.anim.currentAnim = null;
    }
    state.anim.playing = false;
    state.anim.enterMode = false;
    resetAnimOffsets();
    updateAnimButtons();
    if (showStatus !== false) {
      if (state.activeTab === "flow") setFlowStatus("已停止");
      else setAnimStatus("已停止");
    }
  }

  function makeAnimHooks() {
    return {
      onOffsetsReset: resetAnimOffsets,
      onUpdate: function (c, row, dy, alpha) {
        state.anim.offsets[c + "," + row] = { dy: dy, alpha: alpha };
        if (state.runtime) state.runtime.redraw(getAnimDrawState());
      },
      onStepStart: function (step, runtimeConfig) {
        resetAnimOffsets();
        var stepTmpl = window.SlotBoardAnim && window.SlotBoardAnim.getAnimTemplate(step.type);
        state.anim.enterMode = !!(stepTmpl && stepTmpl.frameBinding === "enter");
        if (state.runtime) {
          try {
            state.runtime.setConfig(runtimeConfig);
            state.runtime.redraw(getAnimDrawState());
          } catch (e) {
            console.warn(e);
          }
        }
      },
    };
  }

  function saveCurrentStepToConfig() {
    if (!state.config) return;
    try {
      var seq = getWorkingSequence();
      var seqId = seq.id;
      state.config = SlotBoardConfig.upsertSequence(state.config, seq);
      if (seqId) {
        state.anim.activeSequenceId = seqId;
      } else {
        for (var i = state.config.sequences.length - 1; i >= 0; i--) {
          if (state.config.sequences[i].name === seq.name) {
            state.anim.activeSequenceId = state.config.sequences[i].id;
            break;
          }
        }
      }
      saveDraft();
      syncAnimLinkSelect();
      syncFlowPanel();
      var modeLabel = state.anim.editMode === "exit" ? "Exit" : "Enter";
      setAnimStatus("已保存实例 " + modeLabel + " · " + seq.name);
    } catch (e) {
      alert(e.message);
    }
  }

  function playStepPreview() {
    if (!state.config || state.anim.playing) return;
    if (!window.SlotBoardAnim) {
      setAnimStatus("AnimTemplates 未加载", "error");
      return;
    }
    stopAnimPreview(false);
    resetAnimOffsets();
    var mode = state.anim.editMode;
    var step;
    try {
      step = buildStepFromMode(mode);
      window.SlotBoardAnim.validateAnimStep(step, state.config);
    } catch (e) {
      setAnimStatus(e.message, "error");
      return;
    }
    var tmpl = window.SlotBoardAnim.getAnimTemplate(step.type);
    state.anim.enterMode = tmpl.frameBinding === "enter";
    state.anim.playing = true;
    updateAnimButtons();
    setAnimStatus("播放 " + mode + " 步骤 · " + tmpl.label + "…", "playing");
    var runtimeConfig = window.SlotBoardAnim.getStepRuntimeConfig(step, state.config);
    if (state.runtime) {
      state.runtime.setConfig(runtimeConfig);
      state.runtime.redraw(getAnimDrawState());
    }
    var anim = window.SlotBoardAnim.buildStepAnim(step, state.config, makeAnimHooks());
    state.anim.currentAnim = anim;
    anim
      .play()
      .then(function () {
        if (state.anim.currentAnim !== anim) return;
        state.anim.currentAnim = null;
        state.anim.playing = false;
        updateAnimButtons();
        setAnimStatus(tmpl.label + " 完成");
      })
      .catch(function (err) {
        if (state.anim.currentAnim !== anim) return;
        state.anim.currentAnim = null;
        state.anim.playing = false;
        resetAnimOffsets();
        updateAnimButtons();
        if (err && err.name === "CancelledError") setAnimStatus("已取消");
        else setAnimStatus((err && err.message) || "播放失败", "error");
      });
  }

  function appendFlowNode(parent, kind, text) {
    var span = document.createElement("span");
    span.className = "flow-node " + kind;
    span.textContent = text;
    parent.appendChild(span);
  }

  function appendFlowArrow(parent) {
    var span = document.createElement("span");
    span.className = "flow-arrow";
    span.textContent = "→";
    parent.appendChild(span);
  }

  function appendFlowLinkNode(parent, seq, orphan) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "flow-node link" + (orphan ? " orphan" : "");
    if (seq.id === state.anim.activeSequenceId) btn.classList.add("active");
    btn.textContent = seq.id;
    btn.title = SlotBoardConfig.formatLinkLabel(state.config, seq);
    btn.addEventListener("click", function () {
      state.anim.activeSequenceId = seq.id;
      loadSequenceToState(seq);
      syncAnimLinkSelect();
      syncAnimEditModeUi();
      switchTab("anim");
    });
    parent.appendChild(btn);
  }

  function renderFlowChain() {
    if (!els.flowChain || !state.config) return;
    els.flowChain.innerHTML = "";
    var frames = state.config.frames;
    if (!frames.length) {
      els.flowChain.textContent = "无帧";
      if (els.flowChainMeta) els.flowChainMeta.textContent = "—";
      return;
    }
    var startId = frames[0].id;
    var chain = SlotBoardConfig.buildChainFromFrame(state.config, startId);
    var chainIds = {};
    chain.forEach(function (s) {
      chainIds[s.id] = true;
    });
    var startFrame = SlotBoardConfig.getFrame(state.config, startId);
    appendFlowNode(els.flowChain, "frame", startFrame.id + " · " + startFrame.name);
    if (!chain.length) {
      if (els.flowChainMeta) {
        els.flowChainMeta.textContent = "首帧 " + startId + " 尚无连出的动画实例";
      }
    } else {
      chain.forEach(function (seq) {
        appendFlowArrow(els.flowChain);
        appendFlowLinkNode(els.flowChain, seq, false);
        appendFlowArrow(els.flowChain);
        var ends = SlotBoardConfig.getSequenceEndpoints(seq);
        var toFrame = SlotBoardConfig.getFrame(state.config, ends.toFrameId);
        appendFlowNode(
          els.flowChain,
          "frame",
          toFrame.id + " · " + toFrame.name
        );
      });
      if (els.flowChainMeta) {
        els.flowChainMeta.textContent =
          "从首帧连通 " + (chain.length + 1) + " 帧 · " + chain.length + " 段动画";
      }
    }
    var orphans = (state.config.sequences || []).filter(function (s) {
      return !chainIds[s.id];
    });
    if (orphans.length) {
      var wrap = document.createElement("div");
      wrap.className = "flow-orphans";
      var label = document.createElement("span");
      label.className = "muted";
      label.textContent = "未接入主链：";
      wrap.appendChild(label);
      orphans.forEach(function (seq) {
        appendFlowLinkNode(wrap, seq, true);
      });
      els.flowChain.appendChild(wrap);
    }
  }

  function syncFlowPanel() {
    if (!state.config) return;
    renderFlowChain();
    updateFlowButtons();
    if (!state.anim.playing) setFlowStatus("就绪");
  }

  function playFlowPreview() {
    if (!state.config || state.anim.playing) return;
    if (!window.SlotBoardAnim || !window.SlotBoardAnim.Director) {
      setFlowStatus("Director 未加载", "error");
      return;
    }
    if (!state.config.frames.length) {
      setFlowStatus("无帧可播放", "error");
      return;
    }
    var startId = state.config.frames[0].id;
    var chain = SlotBoardConfig.buildChainFromFrame(state.config, startId);
    if (!chain.length) {
      setFlowStatus("首帧无连出实例", "error");
      return;
    }
    stopAnimPreview(false);
    resetAnimOffsets();
    state.anim.playing = true;
    updateAnimButtons();
    setFlowStatus("播放连通链 · " + chain.length + " 段…", "playing");
    var animChain = window.SlotBoardAnim.Director.playChain(chain, state.config, makeAnimHooks());
    state.anim.currentAnim = animChain;
    animChain
      .then(function () {
        if (state.anim.currentAnim !== animChain) return;
        state.anim.currentAnim = null;
        state.anim.playing = false;
        state.anim.enterMode = false;
        updateAnimButtons();
        setFlowStatus("连通链播放完成");
        if (state.runtime) state.runtime.setConfig(state.config);
      })
      .catch(function (err) {
        if (state.anim.currentAnim !== animChain) return;
        state.anim.currentAnim = null;
        state.anim.playing = false;
        state.anim.enterMode = false;
        resetAnimOffsets();
        updateAnimButtons();
        if (err && err.name === "CancelledError") setFlowStatus("已取消");
        else setFlowStatus((err && err.message) || "播放失败", "error");
      });
  }

  function onAddAnimLink() {
    if (!state.config) return;
    try {
      var pair = SlotBoardConfig.suggestNextLinkFrames(state.config);
      if (!pair) {
        alert("没有可用的帧对新建实例（每帧至多一个起点/终点）");
        return;
      }
      readCurrentBlockFromUi();
      var seq = SlotBoardConfig.createDefaultWaveSequence(pair.fromFrameId, pair.toFrameId);
      state.config = SlotBoardConfig.upsertSequence(state.config, seq);
      state.anim.activeSequenceId = seq.id;
      saveDraft();
      loadSequenceToState(
        SlotBoardConfig.getSequence(state.config, seq.id) || state.config.sequences[state.config.sequences.length - 1]
      );
      syncAnimLinkSelect();
      syncFlowPanel();
      setAnimStatus("已新建实例 · " + SlotBoardConfig.formatLinkLabel(state.config, seq));
    } catch (e) {
      alert(e.message);
    }
  }

  function onDeleteAnimLink() {
    if (!state.config || !state.anim.activeSequenceId) return;
    if (!confirm("删除当前动画实例？")) return;
    var id = state.anim.activeSequenceId;
    state.config = SlotBoardConfig.deleteSequence(state.config, id);
    state.anim.activeSequenceId = null;
    saveDraft();
    if (state.config.sequences.length) {
      state.anim.activeSequenceId = state.config.sequences[0].id;
      loadSequenceToState(state.config.sequences[0]);
    } else {
      ensureAnimDefaults();
      writeCurrentBlockToUi();
    }
    syncAnimLinkSelect();
    syncAnimEditModeUi();
    syncFlowPanel();
    setAnimStatus("已删除实例");
  }

  function onAnimLinkChange() {
    if (!els.animLinkSelect || !state.config) return;
    var id = els.animLinkSelect.value;
    if (!id) return;
    readCurrentBlockFromUi();
    state.anim.activeSequenceId = id;
    var seq = SlotBoardConfig.getSequence(state.config, id);
    if (seq) loadSequenceToState(seq);
    syncAnimEditModeUi();
    syncFlowPanel();
    resetAnimOffsets();
    setAnimStatus(formatAnimReadyLabel());
  }

  function onAnimTemplateChange() {
    var block = getAnimBlock(state.anim.editMode);
    block.type = els.animTemplate.value;
    block.params = templateDefaultParams(block.type);
    syncAnimParamUi();
    writeCurrentBlockToUi();
    saveAnimParams();
    setAnimStatus(formatAnimReadyLabel());
  }

  function onAnimParamInput() {
    readCurrentBlockFromUi();
  }

  function onAnimFrameChange() {
    if (!els.animFrame || !state.config) return;
    var value = els.animFrame.value;
    var excludeId = state.anim.activeSequenceId;
    if (state.anim.editMode === "exit") {
      var fromConflict = SlotBoardConfig.findSequenceByFromFrame(state.config, value, excludeId);
      if (fromConflict) {
        alert("帧 " + value + " 已被实例 " + fromConflict.id + " 作为起点占用");
        writeCurrentBlockToUi();
        return;
      }
      if (value === state.anim.enter.toFrameId) {
        alert("from 帧不能与 to 帧相同");
        writeCurrentBlockToUi();
        return;
      }
    } else {
      var toConflict = SlotBoardConfig.findSequenceByToFrame(state.config, value, excludeId);
      if (toConflict) {
        alert("帧 " + value + " 已被实例 " + toConflict.id + " 作为终点占用");
        writeCurrentBlockToUi();
        return;
      }
      if (value === state.anim.exit.fromFrameId) {
        alert("to 帧不能与 from 帧相同");
        writeCurrentBlockToUi();
        return;
      }
    }
    readCurrentBlockFromUi();
    setAnimStatus(formatAnimReadyLabel());
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
      if (state.activeTab === "anim" || state.activeTab === "flow") {
        stopAnimPreview(false);
        syncAnimPanel();
        if (state.activeTab === "flow") syncFlowPanel();
      }
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
    if ((state.activeTab === "anim" || state.activeTab === "flow") && tabId !== "anim" && tabId !== "flow") {
      stopAnimPreview(false);
    }
    state.activeTab = tabId;
    els.subTabs.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    TAB_IDS.forEach(function (id) {
      $("tab-" + id).classList.toggle("hidden", id !== tabId);
    });
    if (tabId === "anim") {
      syncAnimPanel();
      refreshRuntimeView();
      if (state.runtime) state.runtime.redraw(getAnimDrawState());
    }
    if (tabId === "flow") {
      syncFlowPanel();
      refreshRuntimeView();
      if (state.runtime) state.runtime.redraw(getAnimDrawState());
    }
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
    if (state.anim.playing) stopAnimPreview(false);
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
    syncAnimPanel();
    syncFlowPanel();
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
    stopAnimPreview(false);
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
    els.animModeTabs = Array.prototype.slice.call(document.querySelectorAll(".anim-mode"));
    els.animTemplate = $("anim-template");
    els.animFrame = $("anim-frame");
    els.animFrameLabel = $("anim-frame-label");
    els.animParamFields = Array.prototype.slice.call(
      document.querySelectorAll("#anim-param-fields .anim-param-field")
    );
    els.animLinkSelect = $("anim-link-select");
    els.btnAnimLinkAdd = $("btn-anim-link-add");
    els.btnAnimLinkDel = $("btn-anim-link-del");
    els.animLinkEndpoints = $("anim-link-endpoints");
    els.btnAnimPreviewStep = $("btn-anim-preview-step");
    els.btnAnimSaveStep = $("btn-anim-save-step");
    els.btnAnimStop = $("btn-anim-stop");
    els.btnAnimReset = $("btn-anim-reset");
    els.animStatus = $("anim-status");
    els.flowChain = $("flow-chain");
    els.flowChainMeta = $("flow-chain-meta");
    els.btnFlowPlay = $("btn-flow-play");
    els.btnFlowStop = $("btn-flow-stop");
    els.flowStatus = $("flow-status");
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

    if (els.animModeTabs) {
      els.animModeTabs.forEach(function (btn) {
        btn.addEventListener("click", function () {
          switchAnimEditMode(btn.dataset.mode);
        });
      });
    }
    if (els.animTemplate) els.animTemplate.addEventListener("change", onAnimTemplateChange);
    if (els.animFrame) els.animFrame.addEventListener("change", onAnimFrameChange);
    if (els.animLinkSelect) els.animLinkSelect.addEventListener("change", onAnimLinkChange);
    if (els.btnAnimLinkAdd) els.btnAnimLinkAdd.addEventListener("click", onAddAnimLink);
    if (els.btnAnimLinkDel) els.btnAnimLinkDel.addEventListener("click", onDeleteAnimLink);
    if (els.btnFlowPlay) els.btnFlowPlay.addEventListener("click", playFlowPreview);
    if (els.btnFlowStop) els.btnFlowStop.addEventListener("click", function () {
      stopAnimPreview(true);
    });
    if (els.btnAnimPreviewStep) els.btnAnimPreviewStep.addEventListener("click", playStepPreview);
    if (els.btnAnimSaveStep) els.btnAnimSaveStep.addEventListener("click", saveCurrentStepToConfig);
    if (els.btnAnimStop) els.btnAnimStop.addEventListener("click", function () {
      stopAnimPreview(true);
    });
    if (els.btnAnimReset) els.btnAnimReset.addEventListener("click", function () {
      stopAnimPreview(false);
      if (state.config && state.anim.activeSequenceId) {
        var seq = SlotBoardConfig.getSequence(state.config, state.anim.activeSequenceId);
        if (seq) loadSequenceToState(seq);
      }
      if (state.runtime && state.config) {
        state.runtime.setConfig(state.config);
      }
      setAnimStatus(formatAnimReadyLabel());
    });
    if (els.animParamFields) {
      els.animParamFields.forEach(function (label) {
        var control = label.querySelector("input, select");
        if (!control) return;
        control.addEventListener("change", onAnimParamInput);
        if (control.type === "number" || control.tagName === "SELECT") {
          control.addEventListener("input", onAnimParamInput);
        }
      });
    }
  }

  function boot() {
    cacheElements();
    loadViewOptions();
    loadAnimParams();
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
