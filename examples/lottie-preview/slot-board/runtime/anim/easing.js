(function (global) {
  "use strict";

  global.SlotBoardAnim = global.SlotBoardAnim || {};
  global.SlotBoardAnim.EASINGS = {
    linear: function (t) {
      return t;
    },
    easeInQuad: function (t) {
      return t * t;
    },
    easeInCubic: function (t) {
      return t * t * t;
    },
    easeOutQuad: function (t) {
      return t * (2 - t);
    },
    easeOutCubic: function (t) {
      var u = t - 1;
      return u * u * u + 1;
    },
  };

  global.SlotBoardAnim.applyEasing = function (name, t) {
    var fn = global.SlotBoardAnim.EASINGS[name] || global.SlotBoardAnim.EASINGS.easeInQuad;
    return fn(Math.max(0, Math.min(1, t)));
  };
})(typeof window !== "undefined" ? window : globalThis);
