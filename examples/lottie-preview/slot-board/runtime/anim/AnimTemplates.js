/**
 * AnimTemplates — 枚举动画模板注册表（exit / enter）
 */
(function (global) {
  "use strict";

  var A = global.SlotBoardAnim;
  var DEFAULT_OUT = A.DEFAULT_DROP_OUT || {};
  var DEFAULT_IN = A.DEFAULT_DROP_IN || {};

  var COL_ORDER_OPTIONS = [
    { value: "leftFirst", label: "从左到右" },
    { value: "rightFirst", label: "从右到左" },
    { value: "simultaneous", label: "同时" },
  ];

  var ROW_ORDER_EXIT_OPTIONS = [
    { value: "bottomFirst", label: "自下而上" },
    { value: "topFirst", label: "自上而下" },
  ];

  var ROW_ORDER_ELIMINATE_OPTIONS = ROW_ORDER_EXIT_OPTIONS.concat([
    { value: "simultaneous", label: "同时" },
  ]);

  var ROW_ORDER_ENTER_OPTIONS = [
    { value: "topFirst", label: "自上而下" },
    { value: "bottomFirst", label: "自下而上" },
  ];

  var SHARED_NUMBER = {
    fallDuration: {
      key: "fallDuration",
      label: "时长 (s)",
      type: "number",
      min: 0.05,
      max: 3,
      step: 0.05,
    },
    rowStagger: {
      key: "rowStagger",
      label: "行交错 (s)",
      type: "number",
      min: 0,
      max: 1,
      step: 0.05,
    },
    colStagger: {
      key: "colStagger",
      label: "列交错 (s)",
      type: "number",
      min: 0,
      max: 1,
      step: 0.01,
    },
    colOrder: {
      key: "colOrder",
      label: "列顺序",
      type: "select",
      options: COL_ORDER_OPTIONS,
    },
  };

  function mergeParams(defaults, params) {
    var out = Object.assign({}, defaults, params || {});
    if (params && params.cols === "all") out.cols = "all";
    return out;
  }

  function configWithFrameGrid(config, frameId) {
    var cfg = global.SlotBoardConfig.deepClone(config);
    var frame = global.SlotBoardConfig.getFrame(cfg, frameId);
    if (!frame) throw new Error("找不到帧: " + frameId);
    cfg.grid = global.SlotBoardConfig.deepClone(frame.grid);
    return cfg;
  }

  function resolveCascadeEliminated(config, step, ctx) {
    ctx = ctx || {};
    var eliminateStep = ctx.priorEliminateStep;
    if (!eliminateStep && ctx.sequenceSteps && ctx.stepIndex != null) {
      eliminateStep = global.SlotBoardConfig.findPriorStepOfType(
        ctx.sequenceSteps,
        ctx.stepIndex,
        "boardEliminate"
      );
    }
    return global.SlotBoardConfig.getEliminateCellsForCascade(
      config,
      step,
      eliminateStep
    );
  }

  function pickTemplateParams(type, raw) {
    if (!type) return raw && typeof raw === "object" ? global.SlotBoardConfig.deepClone(raw) : {};
    var tmpl = getTemplate(type);
    var out = global.SlotBoardConfig.deepClone(tmpl.defaultParams);
    if (!raw) return out;
    var allowed = {};
    (tmpl.paramSchema || []).forEach(function (field) {
      allowed[field.key] = true;
    });
    Object.keys(raw).forEach(function (key) {
      if (allowed[key]) out[key] = raw[key];
    });
    if (type === "boardEliminate" && raw && Array.isArray(raw.cellList)) {
      out.cellList = global.SlotBoardConfig.deepClone(raw.cellList);
    }
    return out;
  }

  var TEMPLATES = {
    boardDropOut: {
      type: "boardDropOut",
      label: "整盘滚出",
      frameBinding: "exit",
      enterTypes: false,
      defaultParams: Object.assign(
        {
          scope: "board",
          cols: "all",
          delayAfter: 0,
        },
        DEFAULT_OUT
      ),
      paramSchema: [
        SHARED_NUMBER.fallDuration,
        SHARED_NUMBER.rowStagger,
        SHARED_NUMBER.colStagger,
        {
          key: "extraFallPx",
          label: "额外落出 (px)",
          type: "number",
          min: 0,
          max: 400,
          step: 4,
        },
        SHARED_NUMBER.colOrder,
        {
          key: "order",
          label: "行落出顺序",
          type: "select",
          options: ROW_ORDER_EXIT_OPTIONS,
        },
        {
          key: "delayAfter",
          label: "结束后停顿 (s)",
          type: "number",
          min: 0,
          max: 2,
          step: 0.05,
        },
        {
          key: "fadeOut",
          label: "离场淡出",
          type: "checkbox",
        },
      ],
      validate: function (step, config) {
        if (!step.fromFrameId) throw new Error("boardDropOut 需要 fromFrameId");
        if (!global.SlotBoardConfig.getFrame(config, step.fromFrameId)) {
          throw new Error("找不到 from 帧: " + step.fromFrameId);
        }
      },
      runtimeConfig: function (config, step) {
        return configWithFrameGrid(config, step.fromFrameId);
      },
      build: function (step, runtimeConfig, ctx) {
        var params = mergeParams(
          TEMPLATES.boardDropOut.defaultParams,
          pickTemplateParams("boardDropOut", step.params)
        );
        return A.buildDropOutAnim(
          Object.assign({}, params, {
            config: runtimeConfig,
            onUpdate: ctx.onUpdate,
          })
        );
      },
    },
    boardDropIn: {
      type: "boardDropIn",
      label: "整盘滚入",
      frameBinding: "enter",
      enterTypes: true,
      defaultParams: Object.assign(
        {
          scope: "board",
          cols: "all",
          delayBefore: 0,
        },
        DEFAULT_IN
      ),
      paramSchema: [
        SHARED_NUMBER.fallDuration,
        SHARED_NUMBER.rowStagger,
        SHARED_NUMBER.colStagger,
        {
          key: "extraRisePx",
          label: "额外落入 (px)",
          type: "number",
          min: 0,
          max: 400,
          step: 4,
        },
        SHARED_NUMBER.colOrder,
        {
          key: "order",
          label: "行落入顺序",
          type: "select",
          options: ROW_ORDER_ENTER_OPTIONS,
        },
        {
          key: "delayBefore",
          label: "开始前等待 (s)",
          type: "number",
          min: 0,
          max: 2,
          step: 0.05,
        },
        {
          key: "fadeIn",
          label: "入场淡入",
          type: "checkbox",
        },
      ],
      validate: function (step, config) {
        if (!step.toFrameId) throw new Error("boardDropIn 需要 toFrameId");
        if (!global.SlotBoardConfig.getFrame(config, step.toFrameId)) {
          throw new Error("找不到 to 帧: " + step.toFrameId);
        }
      },
      runtimeConfig: function (config, step) {
        return configWithFrameGrid(config, step.toFrameId);
      },
      build: function (step, runtimeConfig, ctx) {
        var params = mergeParams(
          TEMPLATES.boardDropIn.defaultParams,
          pickTemplateParams("boardDropIn", step.params)
        );
        return A.buildDropInAnim(
          Object.assign({}, params, {
            config: runtimeConfig,
            onUpdate: ctx.onUpdate,
          })
        );
      },
    },
    boardEliminate: {
      type: "boardEliminate",
      label: "格级消除",
      frameBinding: "eliminate",
      enterTypes: false,
      defaultParams: Object.assign({}, A.DEFAULT_ELIMINATE || {}),
      paramSchema: [
        {
          key: "effectId",
          label: "序列帧",
          type: "select",
          options: [{ value: "bingo_frame", label: "bingo_frame" }],
        },
        {
          key: "cells",
          label: "目标格",
          type: "select",
          options: [
            { value: "diff", label: "帧差分 (from→to)" },
            { value: "explicit", label: "手动点选" },
          ],
        },
        {
          key: "anchor",
          label: "锚点",
          type: "select",
          options: [
            { value: "cellCenter", label: "格心" },
            { value: "cellTopLeft", label: "格左上" },
            { value: "cellBottomCenter", label: "格底中" },
          ],
        },
        {
          key: "offsetX",
          label: "偏移 X (px)",
          type: "number",
          min: -200,
          max: 200,
          step: 1,
        },
        {
          key: "offsetY",
          label: "偏移 Y (px)",
          type: "number",
          min: -200,
          max: 200,
          step: 1,
        },
        {
          key: "scale",
          label: "缩放",
          type: "number",
          min: 0.1,
          max: 3,
          step: 0.05,
        },
        {
          key: "stagger",
          label: "格交错 (s)",
          type: "number",
          min: 0,
          max: 1,
          step: 0.01,
        },
        SHARED_NUMBER.colOrder,
        {
          key: "rowOrder",
          label: "行顺序",
          type: "select",
          options: ROW_ORDER_ELIMINATE_OPTIONS,
        },
        {
          key: "hideSymbolAt",
          label: "symbol 隐藏",
          type: "select",
          options: [
            { value: "effectEnd", label: "特效结束" },
            { value: "effectStart", label: "特效开始" },
            { value: "timeOffset", label: "时间偏移" },
          ],
        },
        {
          key: "hideSymbolOffset",
          label: "隐藏偏移 (s)",
          type: "number",
          min: 0,
          max: 3,
          step: 0.01,
        },
        {
          key: "delayAfter",
          label: "结束后停顿 (s)",
          type: "number",
          min: 0,
          max: 2,
          step: 0.05,
        },
      ],
      validate: function (step, config) {
        if (!step.fromFrameId) throw new Error("boardEliminate 需要 fromFrameId");
        if (!global.SlotBoardConfig.getFrame(config, step.fromFrameId)) {
          throw new Error("找不到 from 帧: " + step.fromFrameId);
        }
        if (step.toFrameId && !global.SlotBoardConfig.getFrame(config, step.toFrameId)) {
          throw new Error("找不到 to 帧: " + step.toFrameId);
        }
        var cells = global.SlotBoardConfig.computeEliminateCells(config, step);
        if (!cells.length) {
          throw new Error("没有可消除的格子（检查 from/to 帧差分或 cellList）");
        }
      },
      runtimeConfig: function (config, step) {
        return configWithFrameGrid(config, step.fromFrameId);
      },
      build: function (step, runtimeConfig, ctx) {
        var params = pickTemplateParams("boardEliminate", step.params);
        return A.buildEliminateAnim({
          config: runtimeConfig,
          step: Object.assign({}, step, { params: params }),
          hooks: {
            onHiddenChange: ctx.onHiddenChange,
            onEffectFrame: ctx.onEffectFrame,
            onError: ctx.onError,
          },
        });
      },
    },
    boardCascadeDrop: {
      type: "boardCascadeDrop",
      label: "重力下落",
      frameBinding: "cascade",
      enterTypes: false,
      defaultParams: Object.assign({}, A.DEFAULT_CASCADE || {}),
      paramSchema: [
        {
          key: "cols",
          label: "列范围",
          type: "select",
          options: [
            { value: "affected", label: "有消除的列" },
            { value: "all", label: "整盘" },
          ],
        },
        SHARED_NUMBER.fallDuration,
        SHARED_NUMBER.rowStagger,
        SHARED_NUMBER.colStagger,
        SHARED_NUMBER.colOrder,
        {
          key: "order",
          label: "行下落顺序",
          type: "select",
          options: ROW_ORDER_EXIT_OPTIONS,
        },
        {
          key: "extraRisePx",
          label: "新符号落入 (px)",
          type: "number",
          min: 0,
          max: 400,
          step: 4,
        },
        {
          key: "delayBefore",
          label: "开始前等待 (s)",
          type: "number",
          min: 0,
          max: 2,
          step: 0.05,
        },
      ],
      validate: function (step, config, ctx) {
        if (!step.fromFrameId) throw new Error("boardCascadeDrop 需要 fromFrameId");
        if (!step.toFrameId) throw new Error("boardCascadeDrop 需要 toFrameId");
        if (!global.SlotBoardConfig.getFrame(config, step.fromFrameId)) {
          throw new Error("找不到 from 帧: " + step.fromFrameId);
        }
        if (!global.SlotBoardConfig.getFrame(config, step.toFrameId)) {
          throw new Error("找不到 to 帧: " + step.toFrameId);
        }
        var eliminated = resolveCascadeEliminated(config, step, ctx);
        if (!eliminated.length) {
          throw new Error("下落需要消除格（请先配置消除步骤的选中格）");
        }
        var fromCfg = configWithFrameGrid(config, step.fromFrameId);
        var moves = A.computeCascadeMoves(fromCfg, step, eliminated);
        if (!moves.length) {
          throw new Error("没有可下落的符号（检查 from/to 帧与消除格）");
        }
      },
      runtimeConfig: function (config, step, ctx) {
        return configWithFrameGrid(config, step.fromFrameId);
      },
      build: function (step, runtimeConfig, ctx) {
        ctx = ctx || {};
        var params = pickTemplateParams("boardCascadeDrop", step.params);
        var eliminated = resolveCascadeEliminated(runtimeConfig, step, ctx);
        return A.buildCascadeDropAnim({
          config: runtimeConfig,
          step: Object.assign({}, step, { params: params }),
          eliminatedCells: eliminated,
          onUpdate: ctx.onUpdate,
          onHiddenChange: ctx.onHiddenChange,
          onComplete: ctx.onCascadeComplete,
        });
      },
    },
  };

  function getTemplate(type) {
    if (!type) throw new Error("未知动画类型: (空)");
    var t = TEMPLATES[type];
    if (!t) throw new Error("未知动画类型: " + type);
    return t;
  }

  function listTemplates() {
    return Object.keys(TEMPLATES).map(function (key) {
      var t = TEMPLATES[key];
      return {
        type: t.type,
        label: t.label,
        frameBinding: t.frameBinding,
        enterTypes: !!t.enterTypes,
        defaultParams: global.SlotBoardConfig.deepClone(t.defaultParams),
        paramSchema: global.SlotBoardConfig.deepClone(t.paramSchema || []),
      };
    });
  }

  function listEnterTemplates() {
    return listTemplates().filter(function (t) {
      return t.enterTypes;
    });
  }

  function validateStep(step, config, ctx) {
    if (!step || !step.type) throw new Error("动画 step 缺少 type");
    var template = getTemplate(step.type);
    template.validate(step, config, ctx || {});
    return step;
  }

  function validateSequence(sequence, config) {
    if (!sequence || !Array.isArray(sequence.steps) || !sequence.steps.length) {
      throw new Error("序列至少包含一个 step");
    }
    for (var i = 0; i < sequence.steps.length; i++) {
      validateStep(sequence.steps[i], config, {
        sequenceSteps: sequence.steps,
        stepIndex: i,
        priorEliminateStep: global.SlotBoardConfig.findPriorStepOfType(
          sequence.steps,
          i,
          "boardEliminate"
        ),
      });
    }
    return sequence;
  }

  function buildStepAnim(step, config, ctx) {
    ctx = ctx || {};
    var template = getTemplate(step.type);
    var runtimeConfig = template.runtimeConfig(config, step, ctx);
    return template.build(step, runtimeConfig, ctx);
  }

  function getStepRuntimeConfig(step, config, ctx) {
    return getTemplate(step.type).runtimeConfig(config, step, ctx || {});
  }

  A.AnimTemplates = TEMPLATES;
  A.listExitAnimTemplates = function () {
    return listTemplates().filter(function (t) {
      return t.frameBinding === "exit";
    });
  };
  A.listEnterAnimTemplates = function () {
    return listTemplates().filter(function (t) {
      return t.frameBinding === "enter";
    });
  };
  A.listEliminateAnimTemplates = function () {
    return listTemplates().filter(function (t) {
      return t.frameBinding === "eliminate" || t.frameBinding === "cascade";
    });
  };
  A.getAnimTemplate = getTemplate;
  A.listAnimTemplates = listTemplates;
  A.listEnterAnimTemplates = listEnterTemplates;
  A.pickTemplateParams = pickTemplateParams;
  A.validateAnimStep = validateStep;
  A.validateAnimSequence = validateSequence;
  A.buildStepAnim = buildStepAnim;
  A.getStepRuntimeConfig = getStepRuntimeConfig;
  A.configWithFrameGrid = configWithFrameGrid;
})(typeof window !== "undefined" ? window : globalThis);
