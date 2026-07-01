/**
 * Director — 播放 sequences[].steps[]
 */
(function (global) {
  "use strict";

  var A = global.SlotBoardAnim;

  function playSequence(sequence, config, hooks) {
    hooks = hooks || {};
    A.validateAnimSequence(sequence, config);

    var steps = sequence.steps;
    var index = 0;
    var currentAnim = null;

    function playNext() {
      if (index >= steps.length) return Promise.resolve();
      var step = steps[index++];
      var runtimeConfig = A.getStepRuntimeConfig(step, config);

      if (hooks.onStepStart) hooks.onStepStart(step, runtimeConfig, index - 1);
      if (hooks.onOffsetsReset) hooks.onOffsetsReset();

      var ctx = {
        onUpdate: hooks.onUpdate,
      };
      currentAnim = A.buildStepAnim(step, config, ctx);

      return currentAnim
        .play()
        .catch(function (err) {
          if (err && err.name === "CancelledError") throw err;
          throw err;
        })
        .then(function () {
          if (hooks.onStepEnd) hooks.onStepEnd(step, index - 1);
          return playNext();
        });
    }

    var chain = playNext();

    chain.cancel = function () {
      if (currentAnim && currentAnim.isPlaying) currentAnim.cancel();
    };

    return chain;
  }

  function playSequenceWithQueue(sequence, config, hooks) {
    var q = new A.SerialAnimQueue();
    hooks = hooks || {};
    A.validateAnimSequence(sequence, config);

    sequence.steps.forEach(function (step) {
      q.enqueue(function () {
        var runtimeConfig = A.getStepRuntimeConfig(step, config);
        if (hooks.onStepStart) hooks.onStepStart(step, runtimeConfig);
        if (hooks.onOffsetsReset) hooks.onOffsetsReset();
        var anim = A.buildStepAnim(step, config, { onUpdate: hooks.onUpdate });
        return q.playOne(anim).then(function () {
          if (hooks.onStepEnd) hooks.onStepEnd(step);
        });
      });
    });

    return q.run();
  }

  function playChain(sequences, config, hooks) {
    hooks = hooks || {};
    if (!sequences || !sequences.length) return Promise.resolve();

    var index = 0;
    var currentAnim = null;
    var cancelled = false;

    function playNext() {
      if (cancelled || index >= sequences.length) return Promise.resolve();
      var seq = sequences[index++];
      currentAnim = playSequence(seq, config, hooks);
      return currentAnim
        .catch(function (err) {
          if (err && err.name === "CancelledError") throw err;
          throw err;
        })
        .then(function () {
          currentAnim = null;
          return playNext();
        });
    }

    var chain = playNext();
    chain.cancel = function () {
      cancelled = true;
      if (currentAnim && currentAnim.cancel) currentAnim.cancel();
    };
    return chain;
  }

  A.Director = {
    playSequence: playSequence,
    playSequenceWithQueue: playSequenceWithQueue,
    playChain: playChain,
  };
})(typeof window !== "undefined" ? window : globalThis);
