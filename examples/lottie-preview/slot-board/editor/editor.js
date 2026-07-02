/**
 * Slot Board Editor — create / manage config, layout tabs.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "slot-board-editor.active-config.v5";
  var STORAGE_KEY_LEGACY = "slot-board-editor.active-config.v4";
  var STORAGE_KEY_LEGACY_V3 = "slot-board-editor.active-config.v3";
  var VIEW_STORAGE_KEY = "slot-board-editor.view-options.v1";
  var ANIM_PARAMS_STORAGE_KEY = "slot-board-editor.anim-params.v5";
  var TAB_GROUPS = {
    project: { label: "工程", tabs: ["basic", "file"] },
    board: { label: "盘面", tabs: ["layout", "frames", "board"] },
    anim: { label: "动画", tabs: ["anim", "flow"] },
    assets: { label: "资源", tabs: ["symlib", "fxlib"] },
  };
  var TAB_GROUP_FOR = {};
  Object.keys(TAB_GROUPS).forEach(function (groupId) {
    TAB_GROUPS[groupId].tabs.forEach(function (tabId) {
      TAB_GROUP_FOR[tabId] = groupId;
    });
  });
  var TAB_IDS = ["basic", "layout", "frames", "board", "anim", "flow", "symlib", "fxlib", "file"];

  var state = {
    config: null,
    runtime: null,
    activeTab: "basic",
    activeGroup: "project",
    symbolCatalog: [],
    effectCatalog: [],
    selectedSymbol: "s1.png",
    selectedCell: null,
    view: {
      showRulers: false,
      showGuides: false,
      previewMode: "board",
      previewZoom: 1,
    },
    anim: {
      activeSequenceId: null,
      activeStepIndex: 0,
      steps: [],
      playing: false,
      enterMode: false,
      pickEliminateCells: false,
      hiddenCells: {},
      effectOverlays: [],
      _effectOverlayMap: {},
      _effectAtlasImage: null,
      markCells: null,
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
        hiddenCells: state.anim.hiddenCells,
        effectOverlays: state.anim.effectOverlays,
        markCells: state.anim.markCells,
        pickEliminateCells: !!state.anim.pickEliminateCells,
        highlightCols: null,
        enterMode: !!state.anim.enterMode,
      };
    }
    var onCellClick = null;
    if (state.activeTab === "board") {
      onCellClick = onCanvasCellClick;
    } else if (state.activeTab === "anim" && state.anim.pickEliminateCells) {
      onCellClick = onAnimEliminateCellClick;
    }
    return Object.assign({}, getViewOptions(), {
      selectedCell: state.activeTab === "board" ? state.selectedCell : null,
      onCellClick: onCellClick,
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

  function getActiveStep() {
    ensureAnimSteps();
    return state.anim.steps[state.anim.activeStepIndex] || state.anim.steps[0];
  }

  function stepBindingLabel(step) {
    if (!window.SlotBoardAnim || !step) return "Step";
    try {
      var tmpl = window.SlotBoardAnim.getAnimTemplate(step.type);
      if (tmpl.frameBinding === "exit") return "Exit";
      if (tmpl.frameBinding === "enter") return "Enter";
      if (tmpl.frameBinding === "eliminate") return "消除";
      if (tmpl.frameBinding === "cascade") return "下落";
      return tmpl.label || step.id;
    } catch (e) {
      return step.id || "Step";
    }
  }

  function ensureAnimSteps() {
    if (state.anim.steps.length) return;
    var f0 = state.config && state.config.frames[0] ? state.config.frames[0].id : "f0";
    var f1 =
      state.config && state.config.frames[1] ? state.config.frames[1].id : f0;
    state.anim.steps = [
      {
        id: "s1",
        type: "boardDropOut",
        fromFrameId: f0,
        params: templateDefaultParams("boardDropOut"),
      },
      {
        id: "s2",
        type: "boardDropIn",
        toFrameId: f1,
        params: templateDefaultParams("boardDropIn"),
      },
    ];
    state.anim.activeStepIndex = 0;
  }

  function getStepBinding(type) {
    if (!type || !window.SlotBoardAnim) return "exit";
    try {
      return window.SlotBoardAnim.getAnimTemplate(type).frameBinding;
    } catch (e) {
      return "exit";
    }
  }

  function defaultStepType(index, step) {
    step = step || {};
    if (step.type) return step.type;
    if (step.fromFrameId && step.toFrameId) {
      if (step.type === "boardCascadeDrop") return "boardCascadeDrop";
      return "boardEliminate";
    }
    if (step.toFrameId && !step.fromFrameId) return "boardDropIn";
    if (step.fromFrameId) return "boardDropOut";
    return index === 0 ? "boardDropOut" : index === 1 ? "boardDropIn" : "boardEliminate";
  }

  function normalizeEditorAnimStep(step, index) {
    if (!step || typeof step !== "object") step = {};
    step.type = defaultStepType(index, step);
    if (!step.id) step.id = "s" + (index + 1);
    return step;
  }

  function normalizeEditorAnimSteps(steps) {
    return (steps || []).map(function (step, index) {
      return normalizeEditorAnimStep(step, index);
    });
  }

  function templateDefaultParams(type) {
    if (!window.SlotBoardAnim || !type) return {};
    try {
      return SlotBoardConfig.deepClone(
        window.SlotBoardAnim.getAnimTemplate(type).defaultParams
      );
    } catch (e) {
      return {};
    }
  }

  function ensureAnimDefaults() {
    ensureAnimSteps();
    state.anim.steps = normalizeEditorAnimSteps(state.anim.steps);
    if (!window.SlotBoardAnim || !window.SlotBoardAnim.pickTemplateParams) return;
    state.anim.steps.forEach(function (step) {
      if (!step.type) return;
      if (!step.params) step.params = templateDefaultParams(step.type);
      else {
        try {
          step.params = window.SlotBoardAnim.pickTemplateParams(step.type, step.params);
        } catch (e) {
          step.params = templateDefaultParams(step.type);
        }
      }
    });
  }

  function loadAnimParams() {
    try {
      var raw = localStorage.getItem(ANIM_PARAMS_STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed.steps) && parsed.steps.length) {
        state.anim.steps = normalizeEditorAnimSteps(parsed.steps);
        state.anim.activeStepIndex = parsed.activeStepIndex || 0;
        return;
      }
      if (parsed.exit || parsed.enter) {
        state.anim.steps = [];
        if (parsed.exit) {
          state.anim.steps.push({
            id: "s1",
            type: parsed.exit.type || "boardDropOut",
            fromFrameId: parsed.exit.fromFrameId || "f0",
            params: parsed.exit.params || null,
          });
        }
        if (parsed.enter) {
          state.anim.steps.push({
            id: "s2",
            type: parsed.enter.type || "boardDropIn",
            toFrameId: parsed.enter.toFrameId || "f1",
            params: parsed.enter.params || null,
          });
        }
        state.anim.activeStepIndex =
          parsed.editMode === "enter" && state.anim.steps.length > 1 ? 1 : 0;
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
        activeStepIndex: state.anim.activeStepIndex,
        steps: state.anim.steps,
      })
    );
  }

  function getAnimTemplateSchema(type) {
    if (!window.SlotBoardAnim || !type) return [];
    try {
      return window.SlotBoardAnim.getAnimTemplate(type).paramSchema || [];
    } catch (e) {
      return [];
    }
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
    if (fieldDef.key === "effectId" && els.animParamEffectId) {
      return els.animParamEffectId.value;
    }
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

  function syncEffectIdOptions() {
    if (!els.animParamEffectId) return;
    var step = getActiveStep();
    var current = (step.params && step.params.effectId) || "bingo_frame";
    els.animParamEffectId.innerHTML = "";
    var options = state.effectCatalog.length
      ? state.effectCatalog.map(function (e) {
          return { value: e.id, label: e.id + " (" + e.frameCount + "f)" };
        })
      : [{ value: "bingo_frame", label: "bingo_frame" }];
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === current) o.selected = true;
      els.animParamEffectId.appendChild(o);
    });
  }

  function syncAnimParamUi() {
    if (!els.animParamFields) return;
    var step = getActiveStep();
    var schema = getAnimTemplateSchema(step.type);
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
      if (field.type === "select" && key !== "effectId") {
        var select = label.querySelector("select");
        if (select) syncSelectOptions(select, field);
      }
    });
    if (visible.effectId) syncEffectIdOptions();
    syncEliminateHideOffsetUi();
  }

  function syncEliminateHideOffsetUi() {
    var step = getActiveStep();
    var field = getParamFieldEl("hideSymbolOffset");
    if (!field) return;
    var show =
      step &&
      step.type === "boardEliminate" &&
      step.params &&
      step.params.hideSymbolAt === "timeOffset";
    field.classList.toggle("hidden", !show);
  }

  function readCurrentBlockFromUi() {
    if (!state.config) return;
    var step = getActiveStep();
    if (els.animTemplate && els.animTemplate.value) {
      step.type = els.animTemplate.value;
    }
    if (!step.type) {
      normalizeEditorAnimStep(step, state.anim.activeStepIndex);
    }
    var binding = getStepBinding(step.type);
    if (els.animFrame) {
      if (binding === "enter") step.toFrameId = els.animFrame.value;
      else step.fromFrameId = els.animFrame.value;
    }
    if (els.animFrameTo && (binding === "eliminate" || binding === "cascade")) {
      step.toFrameId = els.animFrameTo.value;
    }
    var schema = getAnimTemplateSchema(step.type);
    var raw = Object.assign({}, step.params || templateDefaultParams(step.type));
    if (step.type === "boardEliminate" && Array.isArray(step.params && step.params.cellList)) {
      raw.cellList = step.params.cellList.slice();
    }
    schema.forEach(function (field) {
      var control = field.key === "effectId" ? els.animParamEffectId : getParamControl(field.key);
      raw[field.key] = readSchemaField(field, control);
    });
    if (window.SlotBoardAnim && window.SlotBoardAnim.pickTemplateParams) {
      step.params = window.SlotBoardAnim.pickTemplateParams(step.type, raw);
    } else {
      step.params = raw;
    }
    saveAnimParams();
  }

  function writeCurrentBlockToUi() {
    ensureAnimDefaults();
    var step = getActiveStep();
    var p = step.params;
    syncTemplateSelect();
    if (els.animTemplate) els.animTemplate.value = step.type;
    syncAnimFrameSelect();
    syncAnimParamUi();
    var schema = getAnimTemplateSchema(step.type);
    schema.forEach(function (field) {
      var control =
        field.key === "effectId" ? els.animParamEffectId : getParamControl(field.key);
      writeSchemaField(field, control, p[field.key]);
    });
    syncEliminatePanel();
    syncEliminateHideOffsetUi();
  }

  function buildStepFromState(step, index) {
    var params = step.params;
    if (window.SlotBoardAnim && window.SlotBoardAnim.pickTemplateParams) {
      params = window.SlotBoardAnim.pickTemplateParams(step.type, step.params);
    }
    var out = {
      id: step.id || "s" + (index + 1),
      type: step.type,
      params: SlotBoardConfig.deepClone(params),
    };
    if (step.fromFrameId) out.fromFrameId = step.fromFrameId;
    if (step.toFrameId) out.toFrameId = step.toFrameId;
    return out;
  }

  function buildStepFromIndex(index) {
    readCurrentBlockFromUi();
    var step = state.anim.steps[index];
    if (!step) throw new Error("无效步骤索引");
    return buildStepFromState(step, index);
  }

  function loadSequenceToState(sequence) {
    if (!sequence || !sequence.steps) return;
    state.anim.activeSequenceId = sequence.id;
    state.anim.steps = sequence.steps.map(function (step, index) {
      var normalized = normalizeEditorAnimStep(
        {
          id: step.id || "s" + (index + 1),
          type: step.type,
          fromFrameId: step.fromFrameId,
          toFrameId: step.toFrameId,
          params: step.params,
        },
        index
      );
      normalized.params = window.SlotBoardAnim
        ? window.SlotBoardAnim.pickTemplateParams(
            normalized.type,
            normalized.params || templateDefaultParams(normalized.type)
          )
        : normalized.params || templateDefaultParams(normalized.type);
      return normalized;
    });
    state.anim.activeStepIndex = 0;
    state.anim.pickEliminateCells = false;
    ensureAnimDefaults();
    writeCurrentBlockToUi();
    syncAnimStepTabs();
    syncAnimLinkPresetUi();
  }

  function getWorkingSequence() {
    readCurrentBlockFromUi();
    var existing = state.anim.activeSequenceId
      ? SlotBoardConfig.getSequence(state.config, state.anim.activeSequenceId)
      : null;
    var steps = state.anim.steps.map(function (s, i) {
      return buildStepFromState(s, i);
    });
    var name = SlotBoardConfig.formatLinkLabel(state.config, {
      id: existing ? existing.id : "new",
      steps: steps,
    });
    return {
      id: existing ? existing.id : undefined,
      name: name,
      steps: steps,
    };
  }

  function getAnimDrawState() {
    return {
      offsets: state.anim.offsets,
      hiddenCells: state.anim.hiddenCells,
      effectOverlays: state.anim.effectOverlays,
      markCells: state.anim.markCells,
      highlightCols: null,
      enterMode: !!state.anim.enterMode,
    };
  }

  function formatAnimReadyLabel() {
    if (!state.config) return "就绪";
    var step = getActiveStep();
    ensureAnimDefaults();
    var tmpl = window.SlotBoardAnim.getAnimTemplate(step.type);
    var binding = tmpl.frameBinding;
    var frameHint =
      binding === "enter"
        ? step.toFrameId
        : binding === "eliminate" || binding === "cascade"
          ? (step.fromFrameId || "?") + "→" + (step.toFrameId || "?")
          : step.fromFrameId;
    return (
      "就绪 · " +
      stepBindingLabel(step) +
      " · " +
      tmpl.label +
      " · " +
      frameHint
    );
  }

  function syncTemplateSelect() {
    if (!els.animTemplate || !window.SlotBoardAnim) return;
    var step = getActiveStep();
    var binding = getStepBinding(step.type);
    var list = window.SlotBoardAnim.listAnimTemplates().filter(function (t) {
      return t.frameBinding === binding;
    });
    els.animTemplate.innerHTML = "";
    list.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.type;
      opt.textContent = t.type + " — " + t.label;
      if (t.type === step.type) opt.selected = true;
      els.animTemplate.appendChild(opt);
    });
  }

  function syncAnimFrameSelect() {
    if (!els.animFrame || !state.config) return;
    var step = getActiveStep();
    var binding = getStepBinding(step.type);
    var selectedFrom = step.fromFrameId || state.config.frames[0].id;
    var selectedTo =
      step.toFrameId ||
      (state.config.frames[1] ? state.config.frames[1].id : selectedFrom);
    var excludeId = state.anim.activeSequenceId;

    if (els.animFrameWrap) {
      els.animFrameWrap.classList.toggle("hidden", binding === "enter" && false);
    }
    if (els.animFrameToWrap) {
      els.animFrameToWrap.classList.toggle(
        "hidden",
        binding !== "eliminate" && binding !== "cascade"
      );
    }

    els.animFrame.innerHTML = "";
    state.config.frames.forEach(function (frame) {
      var opt = document.createElement("option");
      opt.value = frame.id;
      var label = frame.id + " · " + frame.name;
      var occupied = null;
      if (binding === "exit" || binding === "eliminate" || binding === "cascade") {
        occupied = SlotBoardConfig.findSequenceByFromFrame(
          state.config,
          frame.id,
          excludeId
        );
      } else {
        occupied = SlotBoardConfig.findSequenceByToFrame(
          state.config,
          frame.id,
          excludeId
        );
      }
      if (occupied) label += " (已占用)";
      opt.textContent = label;
      var selected =
        binding === "enter" ? frame.id === selectedTo : frame.id === selectedFrom;
      if (selected) opt.selected = true;
      if (occupied && !selected) opt.disabled = true;
      els.animFrame.appendChild(opt);
    });

    if (els.animFrameTo) {
      els.animFrameTo.innerHTML = "";
      state.config.frames.forEach(function (frame) {
        var opt = document.createElement("option");
        opt.value = frame.id;
        var label = frame.id + " · " + frame.name;
        var occupied = SlotBoardConfig.findSequenceByToFrame(
          state.config,
          frame.id,
          excludeId
        );
        if (occupied) label += " (已占用)";
        opt.textContent = label;
        if (frame.id === selectedTo) opt.selected = true;
        if (occupied && frame.id !== selectedTo) opt.disabled = true;
        els.animFrameTo.appendChild(opt);
      });
    }

    if (els.animFrameLabel) {
      if (binding === "enter") els.animFrameLabel.textContent = "to 帧";
      else if (binding === "eliminate" || binding === "cascade")
        els.animFrameLabel.textContent = "from 帧";
      else els.animFrameLabel.textContent = "from 帧";
    }
    syncAnimLinkEndpoints();
  }

  function syncAnimLinkEndpoints() {
    if (!els.animLinkEndpoints || !state.config) return;
    if (!state.anim.activeSequenceId) {
      els.animLinkEndpoints.textContent = "请选择或新建动画实例";
      return;
    }
    var ends = SlotBoardConfig.getSequenceEndpoints({ steps: state.anim.steps });
    var fromId = ends.fromFrameId;
    var toId = ends.toFrameId;
    var text = "链路 " + (fromId || "?") + " → " + (toId || "?");
    if (fromId && toId && fromId === toId) text += " · from / to 不能相同";
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

  function syncAnimStepTabs() {
    if (!els.animStepTabs) return;
    ensureAnimSteps();
    els.animStepTabs.innerHTML = "";
    state.anim.steps.forEach(function (step, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "anim-mode" + (index === state.anim.activeStepIndex ? " active" : "");
      btn.dataset.stepIndex = String(index);
      btn.textContent = stepBindingLabel(step);
      btn.addEventListener("click", function () {
        switchAnimStepIndex(index);
      });
      els.animStepTabs.appendChild(btn);
    });
  }

  function resolveAnimPreviewFrameId(step) {
    if (!step || !state.config) return null;
    var binding = getStepBinding(step.type);
    if (binding === "enter") return step.toFrameId || null;
    if (binding === "cascade") return step.fromFrameId || null;
    return step.fromFrameId || null;
  }

  function syncBoardPreviewToFrame(frameId) {
    if (!state.config || !frameId) return;
    if (state.config.activeFrameId === frameId) {
      syncPreviewFrameSelect();
      refreshRuntimeView();
      return;
    }
    try {
      if (state.anim.playing) stopAnimPreview(false);
      state.config = SlotBoardConfig.setActiveFrame(state.config, frameId);
      saveDraft();
      syncFrameUi();
      refreshBoardPanel();
      if (state.runtime) {
        state.runtime.setConfig(state.config);
        refreshRuntimeView();
      }
    } catch (e) {
      alert(e.message);
    }
  }

  function syncBoardToAnimStepFrame() {
    if (state.activeTab !== "anim" && state.activeTab !== "flow") return;
    var frameId = resolveAnimPreviewFrameId(getActiveStep());
    if (frameId) syncBoardPreviewToFrame(frameId);
  }

  function formatEliminatePickStatus(list) {
    var count = list ? list.length : 0;
    var hint =
      count > 0
        ? list
            .slice(0, 4)
            .map(function (c) {
              return "c" + (c.col + 1) + "r" + (c.row + 1);
            })
            .join(", ") + (count > 4 ? "…" : "")
        : "尚未选格";
    return "点选中 · 已选 " + count + " 格" + (count ? " (" + hint + ")" : "");
  }

  function syncEliminatePanel() {
    var step = getActiveStep();
    var isEliminate = step && step.type === "boardEliminate";
    var isCascade = step && step.type === "boardCascadeDrop";
    if (els.animEliminateExtra) {
      els.animEliminateExtra.classList.toggle("hidden", !isEliminate && !isCascade);
    }
    if (!isEliminate && !isCascade) {
      state.anim.markCells = null;
      return;
    }
    if (!state.config) {
      state.anim.markCells = null;
      return;
    }
    var eliminatedStep = step;
    if (step.type === "boardCascadeDrop" && state.anim.activeStepIndex > 0) {
      var prior = state.anim.steps[state.anim.activeStepIndex - 1];
      if (prior && prior.type === "boardEliminate") eliminatedStep = prior;
    }
    if (step.params && step.params.cells) {
      var cellsControl = getParamControl("cells");
      if (cellsControl && step.type === "boardEliminate") {
        cellsControl.value = step.params.cells;
      }
    }
    var cells = SlotBoardConfig.computeEliminateCells(state.config, {
      fromFrameId: eliminatedStep.fromFrameId || step.fromFrameId,
      toFrameId: eliminatedStep.toFrameId || step.toFrameId,
      params: eliminatedStep.params || step.params,
    });
    if (els.animEliminateCellsSummary) {
      var modeLabel =
        eliminatedStep.params && eliminatedStep.params.cells === "explicit"
          ? "手动点选"
          : "帧差分";
      var prefix = isCascade ? "下落 · 沿用消除格 · " : "";
      els.animEliminateCellsSummary.textContent =
        prefix +
        modeLabel +
        " · " +
        cells.length +
        " 格" +
        (cells.length
          ? " (" +
            cells
              .slice(0, 6)
              .map(function (c) {
                return "c" + (c.col + 1) + "r" + (c.row + 1);
              })
              .join(", ") +
            (cells.length > 6 ? "…" : "") +
            ")"
          : "");
    }
    state.anim.markCells = cells.slice();
    if (els.btnAnimPickCells) {
      els.btnAnimPickCells.classList.toggle("primary", !!state.anim.pickEliminateCells);
      els.btnAnimPickCells.textContent = state.anim.pickEliminateCells
        ? "点选中…"
        : "盘面点选";
    }
    if (state.anim.pickEliminateCells && state.activeTab === "anim") {
      refreshRuntimeView();
    }
  }

  function switchAnimStepIndex(index) {
    if (index < 0 || index >= state.anim.steps.length) return;
    readCurrentBlockFromUi();
    state.anim.activeStepIndex = index;
    state.anim.pickEliminateCells = false;
    syncAnimStepTabs();
    syncTemplateSelect();
    syncAnimFrameSelect();
    writeCurrentBlockToUi();
    if (state.runtime) state.runtime.setViewOptions(getRuntimeViewOptions());
    syncBoardToAnimStepFrame();
    setAnimStatus(formatAnimReadyLabel());
  }

  function syncAnimEditModeUi() {
    syncAnimStepTabs();
    syncTemplateSelect();
    syncAnimFrameSelect();
    writeCurrentBlockToUi();
    syncAnimLinkPresetUi();
    syncBoardToAnimStepFrame();
  }

  function syncAnimSequenceSelect() {
    syncAnimLinkSelect();
  }

  function syncAnimPanel() {
    if (!state.config) return;
    syncAnimLinkSelect();
    if (state.anim.activeSequenceId) {
      var seq = SlotBoardConfig.getSequence(state.config, state.anim.activeSequenceId);
      if (seq) loadSequenceToState(seq);
    } else if (state.config.sequences && state.config.sequences.length) {
      loadSequenceToState(state.config.sequences[0]);
    } else {
      ensureAnimSteps();
      ensureAnimDefaults();
      syncAnimEditModeUi();
    }
    updateAnimButtons();
    if (!state.anim.playing) setAnimStatus(formatAnimReadyLabel());
  }

  function switchAnimEditMode(mode) {
    var index = mode === "enter" ? 1 : 0;
    switchAnimStepIndex(index);
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
    state.anim.hiddenCells = {};
    state.anim.effectOverlays = [];
    state.anim._effectOverlayMap = {};
    state.anim._effectAtlasImage = null;
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

  function makeAnimHooks(meta) {
    var hooks = {
      onOffsetsReset: resetAnimOffsets,
      onUpdate: function (c, row, dy, alpha, sym) {
        var key = c + "," + row;
        if (sym) {
          state.anim.offsets[key] = { dy: dy, alpha: alpha, sym: sym };
        } else {
          state.anim.offsets[key] = { dy: dy, alpha: alpha };
        }
        if (state.runtime) state.runtime.redraw(getAnimDrawState());
      },
      onHiddenChange: function (col, row, hidden) {
        var key = col + "," + row;
        if (hidden) state.anim.hiddenCells[key] = true;
        else delete state.anim.hiddenCells[key];
        if (state.runtime) state.runtime.redraw(getAnimDrawState());
      },
      onEffectFrame: function (data) {
        if (!state.anim._effectOverlayMap) state.anim._effectOverlayMap = {};
        if (!data || data.col == null || data.row == null) return;
        var key = data.col + "," + data.row;
        if (!data.atlasRect) {
          delete state.anim._effectOverlayMap[key];
        } else {
          state.anim._effectOverlayMap[key] = {
            placement: data.placement,
            atlasRect: data.atlasRect,
            image: data.image || state.anim._effectAtlasImage,
          };
        }
        state.anim.effectOverlays = Object.keys(state.anim._effectOverlayMap).map(function (k) {
          return state.anim._effectOverlayMap[k];
        });
        if (state.runtime) state.runtime.redraw(getAnimDrawState());
      },
      onError: function (err) {
        setAnimStatus((err && err.message) || "特效播放失败", "error");
      },
      onCascadeComplete: function (toFrameId) {
        if (!state.config || !state.runtime || !toFrameId || !window.SlotBoardAnim) return;
        try {
          var runtimeConfig = window.SlotBoardAnim.configWithFrameGrid(
            state.config,
            toFrameId
          );
          if (window.SBTrace) {
            window.SBTrace.boardSnapshot("afterCascadeComplete", runtimeConfig, getAnimDrawState(), {
              toFrameId: toFrameId,
            });
          }
          state.anim.offsets = {};
          state.anim.hiddenCells = {};
          state.runtime.applyConfig(runtimeConfig, getAnimDrawState());
        } catch (e) {
          console.warn(e);
        }
      },
      onStepStart: function (step, runtimeConfig) {
        resetAnimOffsets();
        var stepTmpl = window.SlotBoardAnim && window.SlotBoardAnim.getAnimTemplate(step.type);
        state.anim.enterMode = !!(stepTmpl && stepTmpl.frameBinding === "enter");
        if (window.SBTrace) {
          window.SBTrace.boardSnapshot("onStepStart", runtimeConfig, getAnimDrawState(), {
            stepType: step.type,
            fromFrameId: step.fromFrameId,
            toFrameId: step.toFrameId,
          });
        }
        if (state.runtime) {
          try {
            state.runtime.applyConfig(runtimeConfig, getAnimDrawState());
          } catch (e) {
            console.warn(e);
          }
        }
      },
    };
    if (window.SBTrace && window.SBTrace.wrapAnimHooks) {
      return window.SBTrace.wrapAnimHooks(hooks, meta || {});
    }
    return hooks;
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
      var stepLabel = stepBindingLabel(getActiveStep());
      setAnimStatus("已保存实例 " + stepLabel + " · " + seq.name);
    } catch (e) {
      alert(e.message);
    }
  }

  function persistActiveSequenceEdits() {
    if (!state.config || !state.anim.activeSequenceId) return;
    try {
      var seq = getWorkingSequence();
      state.config = SlotBoardConfig.upsertSequence(state.config, seq);
      saveDraft();
    } catch (e) {
      console.warn("persistActiveSequenceEdits:", e);
    }
  }

  function buildAnimStepCtx(stepIndex, step) {
    readCurrentBlockFromUi();
    var meta = {
      stepIndex: stepIndex,
      stepType: step && step.type,
      sequenceId: state.anim.activeSequenceId,
    };
    var hooks = makeAnimHooks(meta);
    var priorEliminate = null;
    if (step.type === "boardCascadeDrop" && stepIndex > 0) {
      var prior = buildStepFromState(
        state.anim.steps[stepIndex - 1],
        stepIndex - 1
      );
      if (prior.type === "boardEliminate") priorEliminate = prior;
    }
    return Object.assign({}, hooks, {
      sequenceSteps: state.anim.steps.map(function (s, i) {
        return buildStepFromState(s, i);
      }),
      stepIndex: stepIndex,
      priorEliminateStep: priorEliminate,
    });
  }

  function playStepPreview() {
    if (!state.config || state.anim.playing) return;
    if (!window.SlotBoardAnim) {
      setAnimStatus("AnimTemplates 未加载", "error");
      return;
    }
    stopAnimPreview(false);
    resetAnimOffsets();
    var stepIndex = state.anim.activeStepIndex;
    var step;
    var stepCtx;
    try {
      step = buildStepFromIndex(stepIndex);
      stepCtx = buildAnimStepCtx(stepIndex, step);
      window.SlotBoardAnim.validateAnimStep(step, state.config, stepCtx);
      if (window.SBTrace) {
        window.SBTrace.log("editor", "playStepPreview", {
          stepIndex: stepIndex,
          type: step.type,
          fromFrameId: step.fromFrameId,
          toFrameId: step.toFrameId,
          priorEliminate: stepCtx.priorEliminateStep
            ? {
                cells: stepCtx.priorEliminateStep.params &&
                  stepCtx.priorEliminateStep.params.cellList,
                cellsMode: stepCtx.priorEliminateStep.params &&
                  stepCtx.priorEliminateStep.params.cells,
              }
            : null,
        });
      }
    } catch (e) {
      setAnimStatus(e.message, "error");
      return;
    }
    var tmpl = window.SlotBoardAnim.getAnimTemplate(step.type);
    state.anim.enterMode = tmpl.frameBinding === "enter";
    state.anim.playing = true;
    updateAnimButtons();
    setAnimStatus(
      "播放 " + stepBindingLabel(getActiveStep()) + " · " + tmpl.label + "…",
      "playing"
    );

    function startPlay() {
      var runtimeConfig = window.SlotBoardAnim.getStepRuntimeConfig(
        step,
        state.config,
        stepCtx
      );
      if (state.runtime) {
        state.runtime.applyConfig(runtimeConfig, getAnimDrawState());
      }
      var anim = window.SlotBoardAnim.buildStepAnim(step, state.config, stepCtx);
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

    if (step.type === "boardEliminate" && step.params && step.params.effectId) {
      window.SlotBoardAnim.loadEffect(step.params.effectId)
        .then(function (loaded) {
          state.anim._effectAtlasImage = loaded.atlas;
          startPlay();
        })
        .catch(function (err) {
          state.anim.playing = false;
          updateAnimButtons();
          setAnimStatus((err && err.message) || "特效加载失败", "error");
        });
      return;
    }
    startPlay();
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
      persistActiveSequenceEdits();
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
    if (window.SBTrace) {
      window.SBTrace.log("editor", "playFlowPreview", {
        chainLength: chain.length,
        startFrameId: startId,
      });
    }
    var animChain = window.SlotBoardAnim.Director.playChain(
      chain,
      state.config,
      makeAnimHooks({ mode: "flow", startFrameId: startId })
    );
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

  function effectIdForPreset() {
    return (state.effectCatalog[0] && state.effectCatalog[0].id) || "bingo_frame";
  }

  function detectSequencePreset(steps) {
    if (!steps || !steps.length) return "swapWave";
    if (steps.length === 1 && steps[0].type === "boardEliminate") return "eliminateWave";
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].type === "boardEliminate") return "eliminateWave";
    }
    return "swapWave";
  }

  function presetLabel(presetId) {
    if (presetId === "eliminateWave") return "消除 (序列帧)";
    return "换盘 (滚出+滚入)";
  }

  function editorStepsFromPreset(presetId, fromFrameId, toFrameId) {
    var seq = SlotBoardConfig.createSequenceFromPreset(
      fromFrameId,
      toFrameId,
      presetId,
      effectIdForPreset()
    );
    return seq.steps.map(function (step, index) {
      var normalized = normalizeEditorAnimStep(
        {
          id: step.id || "s" + (index + 1),
          type: step.type,
          fromFrameId: step.fromFrameId,
          toFrameId: step.toFrameId,
          params: step.params,
        },
        index
      );
      if (window.SlotBoardAnim && window.SlotBoardAnim.pickTemplateParams) {
        normalized.params = window.SlotBoardAnim.pickTemplateParams(
          normalized.type,
          normalized.params || templateDefaultParams(normalized.type)
        );
      }
      return normalized;
    });
  }

  function getCurrentLinkFramePair() {
    var ends = SlotBoardConfig.getSequenceEndpoints({ steps: state.anim.steps });
    if (ends.fromFrameId && ends.toFrameId) {
      return { fromFrameId: ends.fromFrameId, toFrameId: ends.toFrameId };
    }
    if (!state.config || !state.config.frames.length) return null;
    var fromId = state.config.frames[0].id;
    var toId =
      state.config.frames.length > 1 ? state.config.frames[1].id : fromId;
    var step = getActiveStep();
    if (step && step.fromFrameId) fromId = step.fromFrameId;
    if (step && step.toFrameId) toId = step.toFrameId;
    return { fromFrameId: fromId, toFrameId: toId };
  }

  function syncAnimLinkPresetUi() {
    if (!els.animLinkPreset) return;
    els.animLinkPreset.value = detectSequencePreset(state.anim.steps);
  }

  function applyPresetToWorkingSteps(presetId, persist) {
    var pair = getCurrentLinkFramePair();
    if (!pair || !pair.fromFrameId || !pair.toFrameId) {
      alert("无法确定 from / to 帧");
      return false;
    }
    if (pair.fromFrameId === pair.toFrameId) {
      alert("from / to 帧不能相同");
      return false;
    }
    state.anim.steps = editorStepsFromPreset(
      presetId,
      pair.fromFrameId,
      pair.toFrameId
    );
    state.anim.activeStepIndex = 0;
    state.anim.pickEliminateCells = false;
    ensureAnimDefaults();
    syncAnimEditModeUi();
    if (persist && state.anim.activeSequenceId) {
      var builtSteps = state.anim.steps.map(function (s, i) {
        return buildStepFromState(s, i);
      });
      state.config = SlotBoardConfig.upsertSequence(state.config, {
        id: state.anim.activeSequenceId,
        name: SlotBoardConfig.formatLinkLabel(state.config, { steps: builtSteps }),
        steps: builtSteps,
      });
      saveDraft();
      syncAnimLinkSelect();
      syncFlowPanel();
    }
    syncAnimLinkPresetUi();
    if (state.runtime) {
      state.runtime.setViewOptions(getRuntimeViewOptions());
    }
    return true;
  }

  function onAnimLinkPresetChange() {
    if (!state.config || !els.animLinkPreset) return;
    var preset = els.animLinkPreset.value || "swapWave";
    var current = detectSequencePreset(state.anim.steps);
    if (preset === current) return;

    if (
      state.anim.activeSequenceId &&
      !confirm(
        "将当前实例改为「" +
          presetLabel(preset) +
          "」？原有步骤与参数会被替换。"
      )
    ) {
      els.animLinkPreset.value = current;
      return;
    }

    if (
      applyPresetToWorkingSteps(preset, !!state.anim.activeSequenceId)
    ) {
      setAnimStatus("已切换为「" + presetLabel(preset) + "」");
    } else {
      els.animLinkPreset.value = current;
    }
  }

  function onAddAnimLink() {
    if (!state.config) return;
    try {
      persistActiveSequenceEdits();
      var pair = SlotBoardConfig.suggestNextLinkFrames(state.config);
      if (!pair) {
        alert("没有可用的帧对新建实例（每帧至多一个起点/终点）");
        return;
      }
      var preset =
        els.animLinkPreset && els.animLinkPreset.value
          ? els.animLinkPreset.value
          : "swapWave";
      var effectId =
        state.effectCatalog[0] && state.effectCatalog[0].id
          ? state.effectCatalog[0].id
          : "bingo_frame";
      var seq = SlotBoardConfig.createSequenceFromPreset(
        pair.fromFrameId,
        pair.toFrameId,
        preset,
        effectId
      );
      state.config = SlotBoardConfig.upsertSequence(state.config, seq);
      state.anim.activeSequenceId =
        state.config.sequences[state.config.sequences.length - 1].id;
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
      state.anim.steps = [];
      state.anim.activeStepIndex = 0;
      ensureAnimSteps();
      syncAnimEditModeUi();
    }
    syncAnimLinkSelect();
    syncAnimEditModeUi();
    syncFlowPanel();
    setAnimStatus("已删除实例");
  }

  function onAnimLinkChange() {
    if (!els.animLinkSelect || !state.config) return;
    var id = els.animLinkSelect.value;
    if (!id || id === state.anim.activeSequenceId) return;
    persistActiveSequenceEdits();
    state.anim.activeSequenceId = id;
    var seq = SlotBoardConfig.getSequence(state.config, id);
    if (seq) loadSequenceToState(seq);
    syncAnimEditModeUi();
    syncFlowPanel();
    resetAnimOffsets();
    setAnimStatus(formatAnimReadyLabel());
  }

  function onAnimTemplateChange() {
    var step = getActiveStep();
    step.type = els.animTemplate.value;
    step.params = templateDefaultParams(step.type);
    syncAnimParamUi();
    syncAnimFrameSelect();
    writeCurrentBlockToUi();
    saveAnimParams();
    setAnimStatus(formatAnimReadyLabel());
  }

  function onAnimFrameChange() {
    if (!els.animFrame || !state.config) return;
    var step = getActiveStep();
    var binding = getStepBinding(step.type);
    var value = els.animFrame.value;
    var excludeId = state.anim.activeSequenceId;
    if (binding === "exit" || binding === "eliminate" || binding === "cascade") {
      var fromConflict = SlotBoardConfig.findSequenceByFromFrame(
        state.config,
        value,
        excludeId
      );
      if (fromConflict) {
        alert("帧 " + value + " 已被实例 " + fromConflict.id + " 作为起点占用");
        writeCurrentBlockToUi();
        return;
      }
    }
    if (binding === "enter") {
      var toConflict = SlotBoardConfig.findSequenceByToFrame(
        state.config,
        value,
        excludeId
      );
      if (toConflict) {
        alert("帧 " + value + " 已被实例 " + toConflict.id + " 作为终点占用");
        writeCurrentBlockToUi();
        return;
      }
    }
    readCurrentBlockFromUi();
    syncEliminatePanel();
    syncBoardToAnimStepFrame();
    setAnimStatus(formatAnimReadyLabel());
  }

  function onAnimFrameToChange() {
    if (!els.animFrameTo || !state.config) return;
    readCurrentBlockFromUi();
    syncEliminatePanel();
    setAnimStatus(formatAnimReadyLabel());
  }

  function onRefreshEliminateDiff() {
    var step = getActiveStep();
    if (!step || step.type !== "boardEliminate") return;
    step.params.cells = "diff";
    step.params.cellList = [];
    writeCurrentBlockToUi();
    setAnimStatus("已从帧差分刷新消除格");
  }

  function onTogglePickEliminateCells() {
    var step = getActiveStep();
    if (!step || step.type !== "boardEliminate") return;
    state.anim.pickEliminateCells = !state.anim.pickEliminateCells;
    if (state.anim.pickEliminateCells) {
      step.params.cells = "explicit";
      if (!Array.isArray(step.params.cellList)) step.params.cellList = [];
    }
    syncEliminatePanel();
    if (state.runtime) state.runtime.setViewOptions(getRuntimeViewOptions());
    setAnimStatus(
      state.anim.pickEliminateCells
        ? formatEliminatePickStatus(step.params.cellList)
        : formatAnimReadyLabel()
    );
    syncBoardToAnimStepFrame();
  }

  function onAnimEliminateCellClick(col, row) {
    var step = getActiveStep();
    if (!step || step.type !== "boardEliminate" || !state.anim.pickEliminateCells) return;
    if (!Array.isArray(step.params.cellList)) step.params.cellList = [];
    var list = step.params.cellList;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].col === col && list[i].row === row) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) list.splice(idx, 1);
    else list.push({ col: col, row: row });
    step.params.cells = "explicit";
    syncEliminatePanel();
    saveAnimParams();
    refreshRuntimeView();
    setAnimStatus(
      (idx >= 0 ? "已取消 " : "已标记 ") +
        "c" +
        (col + 1) +
        "r" +
        (row + 1) +
        " · " +
        formatEliminatePickStatus(list)
    );
  }

  function onAnimParamInput() {
    readCurrentBlockFromUi();
    syncEliminatePanel();
    syncEliminateHideOffsetUi();
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

  function switchGroup(groupId) {
    if (!TAB_GROUPS[groupId]) return;
    var tabs = TAB_GROUPS[groupId].tabs;
    var target =
      tabs.indexOf(state.activeTab) >= 0 ? state.activeTab : tabs[0];
    state.activeGroup = groupId;
    switchTab(target);
  }

  function syncTabNavUi() {
    if (els.mainTabs) {
      els.mainTabs.forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.group === state.activeGroup);
      });
    }
    if (els.subTabNavs) {
      els.subTabNavs.forEach(function (nav) {
        nav.classList.toggle("hidden", nav.dataset.group !== state.activeGroup);
      });
    }
    if (els.subTabs) {
      els.subTabs.forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
      });
    }
  }

  function switchTab(tabId) {
    if (TAB_IDS.indexOf(tabId) < 0) return;
    if ((state.activeTab === "anim" || state.activeTab === "flow") && tabId !== "anim" && tabId !== "flow") {
      stopAnimPreview(false);
    }
    state.activeTab = tabId;
    state.activeGroup = TAB_GROUP_FOR[tabId] || state.activeGroup;
    syncTabNavUi();
    TAB_IDS.forEach(function (id) {
      $("tab-" + id).classList.toggle("hidden", id !== tabId);
    });
    if (tabId === "anim") {
      syncAnimPanel();
      syncBoardToAnimStepFrame();
      refreshRuntimeView();
      if (state.runtime) state.runtime.redraw(getAnimDrawState());
    }
    if (tabId === "flow") {
      syncFlowPanel();
      refreshRuntimeView();
      if (state.runtime) state.runtime.redraw(getAnimDrawState());
    }
    if (tabId === "fxlib") {
      renderEffectLibrary();
    }
    if (tabId === "anim") {
      syncEliminatePanel();
      if (state.runtime) state.runtime.setViewOptions(getRuntimeViewOptions());
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

  function loadEffectCatalog(done) {
    fetch("/effects/index.json")
      .then(function (res) {
        return res.json();
      })
      .then(function (list) {
        state.effectCatalog = Array.isArray(list) ? list : [];
        updateEffectCatalogHint();
        renderEffectLibrary();
        if (state.activeTab === "anim" || state.activeTab === "fxlib") {
          syncEffectIdOptions();
          syncEliminatePanel();
        }
        if (done) done();
      })
      .catch(function () {
        state.effectCatalog = [];
        updateEffectCatalogHint();
        renderEffectLibrary();
        if (state.activeTab === "anim" || state.activeTab === "fxlib") {
          syncEffectIdOptions();
          syncEliminatePanel();
        }
        if (done) done();
      });
  }

  function updateEffectCatalogHint() {
    var n = state.effectCatalog.length;
    if (els.fxLibCount) els.fxLibCount.textContent = String(n);
  }

  function setFxImportStatus(message, isError) {
    if (!els.fxImportStatus) return;
    if (!message) {
      els.fxImportStatus.classList.add("hidden");
      els.fxImportStatus.textContent = "";
      return;
    }
    els.fxImportStatus.textContent = message;
    els.fxImportStatus.classList.remove("hidden");
    els.fxImportStatus.classList.toggle("error", !!isError);
  }

  function uploadEffectFile(file) {
    var contentType = file.type || "application/octet-stream";
    if (/\.json$/i.test(file.name)) contentType = "application/json";
    else if (/\.webp$/i.test(file.name)) contentType = "image/webp";
    else if (/\.png$/i.test(file.name)) contentType = "image/png";
    else if (/\.jpe?g$/i.test(file.name)) contentType = "image/jpeg";

    return fetch("/effects/upload?name=" + encodeURIComponent(file.name), {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file,
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          if (res.status === 405 || res.status === 404) {
            throw new Error(
              "服务端未启用序列帧 API（" +
                res.status +
                "）。请重启：npm run slot-board:editor"
            );
          }
          throw new Error(res.status + ": " + text.slice(0, 120));
        }
        if (!res.ok || !data.ok) {
          throw new Error((data && data.error) || "上传失败");
        }
        return data;
      });
    });
  }

  function importEffectFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return (
        /\.json$/i.test(f.name) ||
        /\.png$/i.test(f.name) ||
        /\.webp$/i.test(f.name) ||
        /\.jpe?g$/i.test(f.name) ||
        f.type === "application/json" ||
        /^image\//.test(f.type || "")
      );
    });
    if (!files.length) {
      setFxImportStatus("请选择 JSON / PNG / WebP 文件", true);
      return Promise.resolve();
    }

    setFxImportStatus("正在导入 " + files.length + " 个文件…", false);
    var chain = Promise.resolve();
    var imported = [];
    var errors = [];

    files.forEach(function (file) {
      chain = chain.then(function () {
        return uploadEffectFile(file)
          .then(function (data) {
            imported.push(data.name);
          })
          .catch(function (e) {
            errors.push(file.name + ": " + e.message);
          });
      });
    });

    return chain.then(function () {
      return loadEffectCatalog(function () {
        if (errors.length) {
          setFxImportStatus(
            "成功 " + imported.length + "，失败 " + errors.length + "：" + errors.join("；"),
            true
          );
        } else {
          setFxImportStatus("已导入 " + imported.length + " 个：" + imported.join(", "), false);
        }
      });
    });
  }

  function deleteEffect(id) {
    if (!id) return;
    if (!confirm("删除序列帧 " + id + " 及其关联资源？")) return;

    fetch("/effects/delete?id=" + encodeURIComponent(id), { method: "DELETE" })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error((data && data.error) || "删除失败");
          return data;
        });
      })
      .then(function () {
        return loadEffectCatalog(function () {
          setFxImportStatus("已删除 " + id, false);
        });
      })
      .catch(function (e) {
        setFxImportStatus(e.message, true);
      });
  }

  function renderEffectLibrary() {
    if (!els.effectLibrary) return;
    els.effectLibrary.innerHTML = "";

    if (!state.effectCatalog.length) {
      var empty = document.createElement("p");
      empty.className = "muted-note";
      empty.textContent = "暂无序列帧，请导入 manifest 与 atlas/anim 资源。";
      els.effectLibrary.appendChild(empty);
      return;
    }

    state.effectCatalog.forEach(function (entry) {
      var item = document.createElement("div");
      item.className = "sym-lib-item";

      var thumb = document.createElement("div");
      thumb.className = "sym-lib-thumb";
      if (entry.thumb) {
        var img = document.createElement("img");
        img.src = "/effects/" + encodeURIComponent(entry.thumb);
        img.alt = entry.id;
        img.addEventListener("error", function () {
          thumb.textContent = "—";
        });
        thumb.appendChild(img);
      } else {
        thumb.textContent = "—";
      }

      var meta = document.createElement("div");
      meta.className = "sym-lib-meta";
      var title = document.createElement("div");
      title.className = "sym-lib-name mono";
      title.textContent = entry.id;
      meta.appendChild(title);

      var detail = document.createElement("div");
      detail.className = "fx-lib-detail";
      var detailParts = [];
      if (entry.frameCount) detailParts.push(entry.frameCount + " 帧");
      if (entry.fps) detailParts.push(entry.fps + " fps");
      if (entry.cellW && entry.cellH) detailParts.push(entry.cellW + "×" + entry.cellH);
      detail.textContent = detailParts.length ? detailParts.join(" · ") : entry.name || "—";
      meta.appendChild(detail);

      if (!entry.thumb) {
        var missing = document.createElement("div");
        missing.className = "fx-lib-missing";
        missing.textContent = "缺少 atlas/anim 预览图";
        meta.appendChild(missing);
      }

      var actions = document.createElement("div");
      actions.className = "sym-lib-actions";
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn ghost sym-lib-del";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", function () {
        deleteEffect(entry.id);
      });
      actions.appendChild(delBtn);

      item.appendChild(thumb);
      item.appendChild(meta);
      item.appendChild(actions);
      els.effectLibrary.appendChild(item);
    });
  }

  function bindEffectImportUi() {
    function openPicker() {
      if (els.fileImportEffects) els.fileImportEffects.click();
    }

    if (els.btnImportEffects) els.btnImportEffects.addEventListener("click", openPicker);
    if (els.fileImportEffects) {
      els.fileImportEffects.addEventListener("change", function (e) {
        var files = e.target.files;
        if (files && files.length) importEffectFiles(files);
        e.target.value = "";
      });
    }

    var dropZone = els.fxDropZone;
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
        importEffectFiles(e.dataTransfer.files);
      }
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
    state.activeGroup = "project";
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
      state.activeGroup = "board";
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
    els.mainTabs = Array.prototype.slice.call(document.querySelectorAll(".main-tab"));
    els.subTabNavs = Array.prototype.slice.call(document.querySelectorAll(".sub-tabs"));
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
    els.effectLibrary = $("effect-library");
    els.fxLibCount = $("fx-lib-count");
    els.fxDropZone = $("fx-drop-zone");
    els.fxImportStatus = $("fx-import-status");
    els.btnImportEffects = $("btn-import-effects");
    els.fileImportEffects = $("file-import-effects");
    els.frameList = $("frame-list");
    els.boardFrameLabel = $("board-frame-label");
    els.btnFrameAdd = $("btn-frame-add");
    els.btnFrameDup = $("btn-frame-dup");
    els.animStepTabs = $("anim-step-tabs");
    els.animLinkPreset = $("anim-link-preset");
    els.animFrameTo = $("anim-frame-to");
    els.animFrameToWrap = $("anim-frame-to-wrap");
    els.animEliminateExtra = $("anim-eliminate-extra");
    els.animEliminateCellsSummary = $("anim-eliminate-cells-summary");
    els.btnAnimRefreshDiff = $("btn-anim-refresh-diff");
    els.btnAnimPickCells = $("btn-anim-pick-cells");
    els.animParamEffectId = $("anim-param-effect-id");
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

    if (els.mainTabs) {
      els.mainTabs.forEach(function (btn) {
        btn.addEventListener("click", function () {
          switchGroup(btn.dataset.group);
        });
      });
    }

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
    bindEffectImportUi();

    if (els.animTemplate) els.animTemplate.addEventListener("change", onAnimTemplateChange);
    if (els.animFrame) els.animFrame.addEventListener("change", onAnimFrameChange);
    if (els.animFrameTo) els.animFrameTo.addEventListener("change", onAnimFrameToChange);
    if (els.btnAnimRefreshDiff) {
      els.btnAnimRefreshDiff.addEventListener("click", onRefreshEliminateDiff);
    }
    if (els.btnAnimPickCells) {
      els.btnAnimPickCells.addEventListener("click", onTogglePickEliminateCells);
    }
    if (els.animLinkSelect) els.animLinkSelect.addEventListener("change", onAnimLinkChange);
    if (els.btnAnimLinkAdd) els.btnAnimLinkAdd.addEventListener("click", onAddAnimLink);
    if (els.btnAnimLinkDel) els.btnAnimLinkDel.addEventListener("click", onDeleteAnimLink);
    if (els.animLinkPreset) {
      els.animLinkPreset.addEventListener("change", onAnimLinkPresetChange);
    }
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

    if (window.SBTrace) {
      window.SBTrace.log("editor", "boot", {
        trace: window.SBTrace.isEnabled(),
        remoteConsole: window.SlotBoardRemoteConsole
          ? window.SlotBoardRemoteConsole.getSessionName()
          : null,
        url: typeof location !== "undefined" ? location.href : "",
      });
    }

    loadSymbolCatalog(function () {
      loadEffectCatalog(function () {
        var draft = loadDraft();
        if (draft) {
          openConfig(draft);
        } else {
          showMode("create");
        }
      });
    });
  }

  boot();
})();
