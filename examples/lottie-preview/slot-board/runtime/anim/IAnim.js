/**
 * IAnim 契约 — Phase 1（port from illyasviel-candy/common/anim）
 * 纯编排层，无 Cocos / Playfield 依赖。
 */
(function (global) {
  "use strict";

  function CancelledError(message) {
    this.message = message || "anim cancelled";
    this.name = "CancelledError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CancelledError);
    }
  }
  CancelledError.prototype = Object.create(Error.prototype);
  CancelledError.prototype.constructor = CancelledError;

  global.SlotBoardAnim = global.SlotBoardAnim || {};
  global.SlotBoardAnim.CancelledError = CancelledError;
})(typeof window !== "undefined" ? window : globalThis);
