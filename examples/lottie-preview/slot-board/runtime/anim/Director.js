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
      var stepIndex = index;
      var step = steps[index++];
      var SB = global.SlotBoardConfig;
      var stepCtx = {
        onUpdate: hooks.onUpdate,
        onHiddenChange: hooks.onHiddenChange,
        onEffectFrame: hooks.onEffectFrame,
        onError: hooks.onError,
        onCascadeComplete: hooks.onCascadeComplete,
        sequenceSteps: steps,
        stepIndex: stepIndex,
        priorEliminateStep: SB.findPriorStepOfType(
          steps,
          stepIndex,
          "boardEliminate"
        ),
      };
      var runtimeConfig = A.getStepRuntimeConfig(step, config, stepCtx);

      if (hooks.onStepStart) hooks.onStepStart(step, runtimeConfig, stepIndex);
      if (hooks.onOffsetsReset) hooks.onOffsetsReset();

      currentAnim = A.buildStepAnim(step, config, stepCtx);

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

    sequence.steps.forEach(function (step, stepIndex) {
      q.enqueue(function () {
        var SB = global.SlotBoardConfig;
        var stepCtx = {
          onUpdate: hooks.onUpdate,
          onHiddenChange: hooks.onHiddenChange,
          onEffectFrame: hooks.onEffectFrame,
          onError: hooks.onError,
          onCascadeComplete: hooks.onCascadeComplete,
          sequenceSteps: sequence.steps,
          stepIndex: stepIndex,
          priorEliminateStep: SB.findPriorStepOfType(
            sequence.steps,
            stepIndex,
            "boardEliminate"
          ),
        };
        var runtimeConfig = A.getStepRuntimeConfig(step, config, stepCtx);
        if (hooks.onStepStart) hooks.onStepStart(step, runtimeConfig);
        if (hooks.onOffsetsReset) hooks.onOffsetsReset();
        var anim = A.buildStepAnim(step, config, stepCtx);
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
