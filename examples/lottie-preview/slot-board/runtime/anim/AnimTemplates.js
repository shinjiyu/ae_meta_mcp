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

  function pickTemplateParams(type, raw) {
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
  };

  function getTemplate(type) {
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

  function validateStep(step, config) {
    if (!step || !step.type) throw new Error("动画 step 缺少 type");
    var template = getTemplate(step.type);
    template.validate(step, config);
    return step;
  }

  function validateSequence(sequence, config) {
    if (!sequence || !Array.isArray(sequence.steps) || !sequence.steps.length) {
      throw new Error("序列至少包含一个 step");
    }
    for (var i = 0; i < sequence.steps.length; i++) {
      validateStep(sequence.steps[i], config);
    }
    return sequence;
  }

  function buildStepAnim(step, config, ctx) {
    var template = getTemplate(step.type);
    var runtimeConfig = template.runtimeConfig(config, step);
    return template.build(step, runtimeConfig, ctx);
  }

  function getStepRuntimeConfig(step, config) {
    return getTemplate(step.type).runtimeConfig(config, step);
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
