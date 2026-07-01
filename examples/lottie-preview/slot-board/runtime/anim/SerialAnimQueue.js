/**
 * SerialAnimQueue — 串行动画队列
 */
(function (global) {
  "use strict";

  var CancelledError = global.SlotBoardAnim.CancelledError;

  function SerialAnimQueue() {
    this._tasks = [];
    this._running = false;
    this._currentAnim = null;
  }

  SerialAnimQueue.prototype.enqueue = function (task) {
    this._tasks.push(task);
  };

  SerialAnimQueue.prototype.enqueueAll = function (tasks) {
    for (var i = 0; i < tasks.length; i++) {
      this.enqueue(tasks[i]);
    }
  };

  SerialAnimQueue.prototype.enqueueAnim = function (anim) {
    var self = this;
    this.enqueue(function () {
      return self.playOne(anim);
    });
  };

  SerialAnimQueue.prototype.clear = function () {
    this._tasks.length = 0;
  };

  SerialAnimQueue.prototype.getPendingCount = function () {
    return this._tasks.length;
  };

  Object.defineProperty(SerialAnimQueue.prototype, "pendingCount", {
    get: function () {
      return this._tasks.length;
    },
  });

  Object.defineProperty(SerialAnimQueue.prototype, "isRunning", {
    get: function () {
      return this._running;
    },
  });

  SerialAnimQueue.prototype.cancelAll = function () {
    if (this._currentAnim) this._currentAnim.cancel();
    this._currentAnim = null;
    this.clear();
  };

  SerialAnimQueue.prototype.run = function () {
    var self = this;
    if (this._running) {
      return Promise.reject(new Error("[SerialAnimQueue] already running"));
    }
    this._running = true;
    var chain = Promise.resolve();
    while (this._tasks.length > 0) {
      (function (task) {
        chain = chain.then(function () {
          return task();
        });
      })(this._tasks.shift());
    }
    return chain
      .then(function () {
        self._currentAnim = null;
        self._running = false;
      })
      .catch(function (err) {
        self._currentAnim = null;
        self._running = false;
        throw err;
      });
  };

  SerialAnimQueue.prototype.playOne = function (anim) {
    var self = this;
    this.trackAnim(anim);
    return anim
      .play()
      .catch(function (e) {
        if (!(e instanceof CancelledError)) throw e;
      })
      .finally(function () {
        if (self._currentAnim === anim) self._currentAnim = null;
      });
  };

  SerialAnimQueue.prototype.trackAnim = function (anim) {
    if (this._currentAnim && this._currentAnim !== anim) {
      this._currentAnim.cancel();
    }
    this._currentAnim = anim;
  };

  global.SlotBoardAnim = global.SlotBoardAnim || {};
  global.SlotBoardAnim.SerialAnimQueue = SerialAnimQueue;
})(typeof window !== "undefined" ? window : globalThis);
