/**
 * SlotBoardAnim — Phase 1 barrel (IAnim core, port from Candy common/anim)
 */
(function (global) {
  "use strict";

  var SB = global.SlotBoardAnim;
  if (!SB || !SB.CancelledError || !SB.seq) {
    throw new Error("SlotBoardAnim: load IAnim.js, Anim.js, compose.js, SerialAnimQueue.js first");
  }

  global.SlotBoardAnim.VERSION = 1;
})(typeof window !== "undefined" ? window : globalThis);
