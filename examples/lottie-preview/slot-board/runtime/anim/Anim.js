/**
 * Anim — IAnim 抽象基类（H5 版，无 Node destroy 自动 cancel）
 */
(function (global) {
  "use strict";

  var CancelledError = global.SlotBoardAnim.CancelledError;

  function animWarn(msg) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[anim] " + msg);
    }
  }

  function Anim(opts) {
    opts = opts || {};
    this._state = "idle";
    this._promise = undefined;
    this._resolve = undefined;
    this._reject = undefined;
    this.isInfinite = opts.infinite === true;
  }

  Object.defineProperty(Anim.prototype, "state", {
    get: function () {
      return this._state;
    },
  });

  Object.defineProperty(Anim.prototype, "isPlaying", {
    get: function () {
      return this._state === "running";
    },
  });

  Object.defineProperty(Anim.prototype, "isFinished", {
    get: function () {
      return this._state === "completed" || this._state === "cancelled";
    },
  });

  Anim.prototype.play = function () {
    if (this._state === "running") {
      return this._promise;
    }
    if (this._state === "completed") {
      return Promise.resolve();
    }
    if (this._state === "cancelled") {
      return Promise.reject(
        new CancelledError("Anim is cancelled; call replay() or reset() before playing again.")
      );
    }

    this._state = "running";
    var self = this;
    var inflight = new Promise(function (resolve, reject) {
      self._resolve = resolve;
      self._reject = reject;
    });
    this._promise = inflight;

    try {
      this.onStart();
    } catch (err) {
      this._fail(err);
    }
    return inflight;
  };

  Anim.prototype.cancel = function () {
    if (this._state !== "running") return;
    try {
      this.onCancel();
    } catch (e) {
      animWarn("onCancel threw: " + e);
    }
    this._state = "cancelled";
    var reject = this._reject;
    this._resolve = undefined;
    this._reject = undefined;
    this._promise = undefined;
    if (reject) reject(new CancelledError());
  };

  Anim.prototype.reset = function () {
    if (this._state === "running") {
      this.cancel();
    }
    this._state = "idle";
    this._promise = undefined;
    this._resolve = undefined;
    this._reject = undefined;
    try {
      this.onReset();
    } catch (e) {
      animWarn("onReset threw: " + e);
    }
  };

  Anim.prototype.replay = function () {
    this.reset();
    return this.play();
  };

  Anim.prototype.onStart = function () {
    throw new Error("Anim.onStart() must be implemented");
  };

  Anim.prototype.onCancel = function () {};

  Anim.prototype.onReset = function () {};

  Anim.prototype._complete = function () {
    if (this._state !== "running") return;
    this._state = "completed";
    var resolve = this._resolve;
    this._resolve = undefined;
    this._reject = undefined;
    this._promise = undefined;
    if (resolve) resolve();
  };

  Anim.prototype._fail = function (err) {
    if (this._state !== "running") return;
    this._state = "cancelled";
    var reject = this._reject;
    this._resolve = undefined;
    this._reject = undefined;
    this._promise = undefined;
    if (reject) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  };

  Anim.inherit = function (Ctor, proto) {
    Ctor.prototype = Object.create(Anim.prototype);
    Ctor.prototype.constructor = Ctor;
    if (proto) {
      Object.assign(Ctor.prototype, proto);
    }
    return Ctor;
  };

  global.SlotBoardAnim = global.SlotBoardAnim || {};
  global.SlotBoardAnim.Anim = Anim;
  global.SlotBoardAnim.animWarn = animWarn;
})(typeof window !== "undefined" ? window : globalThis);
