/**
 * compose — seq / par / race / loop / forever / delay / call / starterAnim
 * Phase 1 only (no Cocos builders).
 */
(function (global) {
  "use strict";

  var Anim = global.SlotBoardAnim.Anim;
  var CancelledError = global.SlotBoardAnim.CancelledError;
  var animWarn = global.SlotBoardAnim.animWarn;
  var inherit = Anim.inherit;

  // --- delay ---

  var DelayAnim = inherit(function DelayAnim(seconds) {
    Anim.call(this, { infinite: false });
    this._seconds = seconds;
    this._timerId = null;
  }, {
    onStart: function () {
      if (this._seconds <= 0) {
        this._complete();
        return;
      }
      var self = this;
      this._timerId = setTimeout(function () {
        self._timerId = null;
        self._complete();
      }, this._seconds * 1000);
    },
    onCancel: function () {
      if (this._timerId != null) {
        clearTimeout(this._timerId);
        this._timerId = null;
      }
    },
  });

  function delay(seconds) {
    return new DelayAnim(seconds);
  }

  // --- call ---

  var CallAnim = inherit(function CallAnim(fn) {
    Anim.call(this, { infinite: false });
    this._fn = fn;
  }, {
    onStart: function () {
      var result;
      try {
        result = this._fn();
      } catch (e) {
        this._fail(e);
        return;
      }
      if (result && typeof result.then === "function") {
        var self = this;
        result.then(
          function () {
            self._complete();
          },
          function (err) {
            self._fail(err);
          }
        );
      } else {
        this._complete();
      }
    },
    onCancel: function () {},
  });

  function call(fn) {
    return new CallAnim(fn);
  }

  // --- starterAnim ---

  var StarterAnim = inherit(function StarterAnim(starter) {
    Anim.call(this, { infinite: false });
    this._starter = starter;
    this._dispose = undefined;
  }, {
    onStart: function () {
      var self = this;
      try {
        var dispose = this._starter(function () {
          self._complete();
        });
        this._dispose = typeof dispose === "function" ? dispose : undefined;
      } catch (e) {
        this._fail(e);
      }
    },
    onCancel: function () {
      this._runDispose();
    },
    onReset: function () {
      this._runDispose();
    },
    _runDispose: function () {
      var dispose = this._dispose;
      this._dispose = undefined;
      if (!dispose) return;
      try {
        dispose();
      } catch (e) {
        animWarn("StarterAnim dispose threw: " + e);
      }
    },
  });

  function starterAnim(starter) {
    return new StarterAnim(starter);
  }

  // --- seq ---

  var SeqAnim = inherit(function SeqAnim(anims) {
    var hasInfinite = anims.some(function (a) {
      return a.isInfinite;
    });
    Anim.call(this, { infinite: hasInfinite });
    this._anims = anims;
    this._idx = 0;
    for (var i = 0; i < anims.length - 1; i++) {
      if (anims[i] && anims[i].isInfinite) {
        animWarn(
          "seq(): child #" +
            i +
            " is infinite; the following " +
            (anims.length - 1 - i) +
            " child(ren) will never run."
        );
        break;
      }
    }
  }, {
    onStart: function () {
      this._idx = 0;
      this._next();
    },
    _next: function () {
      if (this.state !== "running") return;
      if (this._idx >= this._anims.length) {
        this._complete();
        return;
      }
      var cur = this._anims[this._idx++];
      if (!cur) {
        this._next();
        return;
      }
      if (cur.state !== "idle") cur.reset();
      var self = this;
      cur.play().then(
        function () {
          self._next();
        },
        function (err) {
          if (err instanceof CancelledError) {
            if (self.state === "running") self._fail(err);
            return;
          }
          self._fail(err);
        }
      );
    },
    onCancel: function () {
      var cur = this._anims[this._idx - 1];
      if (cur && cur.isPlaying) cur.cancel();
    },
    onReset: function () {
      for (var i = 0; i < this._anims.length; i++) this._anims[i].reset();
      this._idx = 0;
    },
  });

  function seq() {
    var anims = Array.prototype.slice.call(arguments);
    if (anims.length === 0) return call(function () {});
    if (anims.length === 1) return anims[0];
    return new SeqAnim(anims);
  }

  // --- par ---

  var ParAnim = inherit(function ParAnim(anims) {
    Anim.call(this, {
      infinite: anims.some(function (a) {
        return a.isInfinite;
      }),
    });
    this._anims = anims;
    this._done = 0;
  }, {
    onStart: function () {
      this._done = 0;
      var self = this;
      for (var i = 0; i < this._anims.length; i++) {
        (function (a) {
          if (a.state !== "idle") a.reset();
          a.play().then(
            function () {
              self._onChildDone();
            },
            function (err) {
              self._onChildFailed(err);
            }
          );
        })(this._anims[i]);
      }
    },
    _onChildDone: function () {
      if (this.state !== "running") return;
      this._done++;
      if (this._done >= this._anims.length) this._complete();
    },
    _onChildFailed: function (err) {
      if (this.state !== "running") return;
      for (var i = 0; i < this._anims.length; i++) {
        if (this._anims[i].isPlaying) this._anims[i].cancel();
      }
      if (err instanceof CancelledError) {
        this._fail(err);
        return;
      }
      this._fail(err);
    },
    onCancel: function () {
      for (var i = 0; i < this._anims.length; i++) {
        if (this._anims[i].isPlaying) this._anims[i].cancel();
      }
    },
    onReset: function () {
      for (var i = 0; i < this._anims.length; i++) this._anims[i].reset();
      this._done = 0;
    },
  });

  function par() {
    var anims = Array.prototype.slice.call(arguments);
    if (anims.length === 0) return call(function () {});
    if (anims.length === 1) return anims[0];
    return new ParAnim(anims);
  }

  // --- race ---

  var RaceAnim = inherit(function RaceAnim(anims) {
    Anim.call(this, {
      infinite: anims.length > 0 && anims.every(function (a) {
        return a.isInfinite;
      }),
    });
    this._anims = anims;
  }, {
    onStart: function () {
      var self = this;
      for (var i = 0; i < this._anims.length; i++) {
        (function (a) {
          if (a.state !== "idle") a.reset();
          a.play().then(
            function () {
              self._onChildDone();
            },
            function (err) {
              self._onChildFailed(err);
            }
          );
        })(this._anims[i]);
      }
    },
    _onChildDone: function () {
      if (this.state !== "running") return;
      for (var i = 0; i < this._anims.length; i++) {
        if (this._anims[i].isPlaying) this._anims[i].cancel();
      }
      this._complete();
    },
    _onChildFailed: function (err) {
      if (this.state !== "running") return;
      if (err instanceof CancelledError) {
        var anyAlive = this._anims.some(function (a) {
          return a.isPlaying;
        });
        if (!anyAlive) {
          this._fail(new CancelledError("all race participants cancelled"));
        }
        return;
      }
      for (var i = 0; i < this._anims.length; i++) {
        if (this._anims[i].isPlaying) this._anims[i].cancel();
      }
      this._fail(err);
    },
    onCancel: function () {
      for (var i = 0; i < this._anims.length; i++) {
        if (this._anims[i].isPlaying) this._anims[i].cancel();
      }
    },
    onReset: function () {
      for (var i = 0; i < this._anims.length; i++) this._anims[i].reset();
    },
  });

  function race() {
    var anims = Array.prototype.slice.call(arguments);
    if (anims.length === 0) return call(function () {});
    if (anims.length === 1) return anims[0];
    return new RaceAnim(anims);
  }

  // --- loop ---

  var LoopAnim = inherit(function LoopAnim(times, anim) {
    if (anim.isInfinite) {
      animWarn(
        "loop(" + times + ", ...): inner anim is infinite; the first iteration never completes."
      );
    }
    var inf = !Number.isFinite(times) || anim.isInfinite;
    Anim.call(this, { infinite: inf });
    this._times = times;
    this._anim = anim;
    this._remaining = 0;
    this._gracefulStopRequested = false;
  }, {
    onStart: function () {
      this._gracefulStopRequested = false;
      if (this._times <= 0) {
        this._complete();
        return;
      }
      this._remaining = this._times;
      this._next();
    },
    _next: function () {
      if (this.state !== "running") return;
      if (this._gracefulStopRequested) {
        this._complete();
        return;
      }
      if (this._remaining <= 0) {
        this._complete();
        return;
      }
      this._remaining--;
      this._anim.reset();
      var self = this;
      this._anim.play().then(
        function () {
          self._next();
        },
        function (err) {
          if (err instanceof CancelledError) return;
          self._fail(err);
        }
      );
    },
    gracefulStop: function () {
      if (this.state !== "running") return;
      this._gracefulStopRequested = true;
    },
    onCancel: function () {
      if (this._anim.isPlaying) this._anim.cancel();
    },
    onReset: function () {
      this._anim.reset();
      this._remaining = 0;
      this._gracefulStopRequested = false;
    },
  });

  function loop(times, anim) {
    return new LoopAnim(times, anim);
  }

  // --- forever ---

  var ForeverAnim = inherit(function ForeverAnim(anim) {
    if (anim.isInfinite) {
      animWarn("forever(): inner anim is already infinite; wrapping has no effect.");
    }
    Anim.call(this, { infinite: true });
    this._anim = anim;
    this._gracefulStopRequested = false;
  }, {
    onStart: function () {
      this._gracefulStopRequested = false;
      this._next();
    },
    _next: function () {
      if (this.state !== "running") return;
      if (this._gracefulStopRequested) {
        this._complete();
        return;
      }
      this._anim.reset();
      var self = this;
      this._anim.play().then(
        function () {
          self._next();
        },
        function (err) {
          if (err instanceof CancelledError) return;
          self._fail(err);
        }
      );
    },
    gracefulStop: function () {
      if (this.state !== "running") return;
      this._gracefulStopRequested = true;
    },
    onCancel: function () {
      if (this._anim.isPlaying) this._anim.cancel();
    },
    onReset: function () {
      this._anim.reset();
      this._gracefulStopRequested = false;
    },
  });

  function forever(anim) {
    return new ForeverAnim(anim);
  }

  global.SlotBoardAnim = global.SlotBoardAnim || {};
  Object.assign(global.SlotBoardAnim, {
    delay: delay,
    call: call,
    starterAnim: starterAnim,
    seq: seq,
    par: par,
    race: race,
    loop: loop,
    forever: forever,
  });
})(typeof window !== "undefined" ? window : globalThis);
