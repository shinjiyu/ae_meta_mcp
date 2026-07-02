/**
 * Node smoke test for SlotBoardAnim (loads browser IIFEs via vm).
 */
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const animDir = path.join(
  __dirname,
  "../examples/lottie-preview/slot-board/runtime/anim"
);
const runtimeDir = path.join(
  __dirname,
  "../examples/lottie-preview/slot-board/runtime"
);

const files = [];

const sandbox = {
  globalThis: {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (cb) => setTimeout(() => cb(performance.now()), 0),
  cancelAnimationFrame: clearTimeout,
  performance,
};
sandbox.window = sandbox.globalThis;
sandbox.globalThis.setTimeout = setTimeout;
sandbox.globalThis.clearTimeout = clearTimeout;
sandbox.globalThis.requestAnimationFrame = sandbox.requestAnimationFrame;
sandbox.globalThis.cancelAnimationFrame = sandbox.cancelAnimationFrame;
sandbox.globalThis.performance = performance;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(runtimeDir, "config.js"), "utf8"),
  sandbox,
  { filename: "config.js" }
);

for (const file of [
  "easing.js",
  "IAnim.js",
  "Anim.js",
  "compose.js",
  "SerialAnimQueue.js",
  "index.js",
  "dropOut.js",
  "dropIn.js",
  "effectLoader.js",
  "eliminate.js",
  "cascadeDrop.js",
  "AnimTemplates.js",
  "Director.js",
]) {
  const code = fs.readFileSync(path.join(animDir, file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

const A = sandbox.globalThis.SlotBoardAnim;
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  console.error("FAIL:", msg);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// seq + delay
{
  const order = [];
  const anim = A.seq(
    A.delay(0.05),
    A.call(() => order.push(1)),
    A.delay(0.05),
    A.call(() => order.push(2))
  );
  await anim.play();
  assert(order.join(",") === "1,2", "seq order");
}

// par
{
  const t0 = Date.now();
  await A.par(A.delay(0.08), A.delay(0.08)).play();
  const dt = Date.now() - t0;
  assert(dt < 150, "par runs in parallel (~80ms not ~160ms)");
}

// cancel
{
  const anim = A.seq(A.delay(1), A.call(() => {}));
  const p = anim.play();
  anim.cancel();
  let cancelled = false;
  try {
    await p;
  } catch (e) {
    cancelled = e instanceof A.CancelledError;
  }
  assert(cancelled, "cancel rejects with CancelledError");
}

// SerialAnimQueue
{
  const order = [];
  const q = new A.SerialAnimQueue();
  q.enqueueAnim(
    A.seq(
      A.call(() => order.push("a")),
      A.delay(0.02)
    )
  );
  q.enqueueAnim(A.call(() => order.push("b")));
  await q.run();
  assert(order.join(",") === "a,b", "SerialAnimQueue order");
}

// loop
{
  let n = 0;
  await A.loop(3, A.call(() => n++)).play();
  assert(n === 3, "loop 3 times");
}

// starterAnim dispose
{
  let disposed = false;
  await A.starterAnim((done) => {
    setTimeout(done, 10);
    return () => {
      disposed = true;
    };
  }).play();
  assert(!disposed, "starterAnim dispose not called on complete");
  const anim2 = A.starterAnim((done) => {
    setTimeout(done, 200);
    return () => {
      disposed = true;
    };
  });
  const p2 = anim2.play();
  anim2.cancel();
  try {
    await p2;
  } catch (_) {}
  await sleep(20);
  assert(disposed, "starterAnim dispose on cancel");
}

// board dropOut
{
  const mockConfig = {
    board: {
      cols: 3,
      rows: 2,
      layout: { symbolW: 10, symbolH: 10, colGap: 0, rowGap: 0, padding: 0 },
    },
    grid: [
      ["a.png", "b.png", null],
      ["c.png", null, "d.png"],
    ],
  };
  const colsHit = new Set();
  await A.buildBoardDropOutAnim({
    config: mockConfig,
    cols: [0, 2],
    colStagger: 0.01,
    fallDuration: 0.04,
    rowStagger: 0,
    extraFallPx: 8,
    onUpdate(col) {
      colsHit.add(col);
    },
  }).play();
  assert(colsHit.has(0) && colsHit.has(2) && !colsHit.has(1), "board dropOut animates selected cols");
  const summary = A.summarizeDropOut(mockConfig, { scope: "board", cols: [0, 2] });
  assert(summary.symbolCount === 3, "summarizeDropOut counts symbols");
  const routed = A.buildDropOutAnim({ scope: "column", col: 1, config: mockConfig, onUpdate() {} });
  assert(routed && typeof routed.play === "function", "buildDropOutAnim routes column scope");
}

// board dropIn enter initial state
{
  const mockConfig = {
    board: {
      cols: 2,
      rows: 2,
      layout: { symbolW: 10, symbolH: 10, colGap: 0, rowGap: 0, padding: 0 },
    },
    grid: [
      ["a.png", "b.png"],
      ["c.png", null],
    ],
  };
  const primed = [];
  A.primeEnterBoard(mockConfig, {}, function (col, row, dy, alpha) {
    primed.push({ col: col, row: row, dy: dy, alpha: alpha });
  });
  assert(primed.length === 3, "primeEnterBoard seeds filled cells");
  assert(
    primed.every(function (p) {
      return p.alpha === 0 && p.dy < 0;
    }),
    "enter starts hidden above board"
  );
  primed.forEach(function (p) {
    const layout = mockConfig.board.layout;
    const cellY = layout.padding + p.row * (layout.symbolH + layout.rowGap);
    assert(cellY + p.dy <= 0, "each symbol starts above board top");
  });

  let firstAlpha = null;
  await A.buildBoardDropInAnim({
    config: mockConfig,
    fallDuration: 0.03,
    rowStagger: 0,
    colStagger: 0,
    onUpdate(col, row, dy, alpha) {
      if (firstAlpha == null) firstAlpha = alpha;
    },
  }).play();
  assert(firstAlpha === 0, "board dropIn play begins from hidden state");
}

// pickTemplateParams strips foreign keys
{
  const picked = A.pickTemplateParams("boardDropOut", {
    fallDuration: 0.5,
    extraRisePx: 99,
    delayBefore: 1,
    fadeIn: false,
    unknown: true,
  });
  assert(picked.fallDuration === 0.5, "pick keeps allowed keys");
  assert(picked.extraRisePx == null, "pick drops enter-only keys from exit template");
  assert(picked.delayBefore == null, "pick drops delayBefore from exit template");
  assert(picked.unknown == null, "pick drops unknown keys");
  assert(picked.extraFallPx != null, "pick merges exit defaults");
}

// frame link occupancy + chain
{
  const SB = sandbox.globalThis.SlotBoardConfig;
  const baseCfg = {
    version: 5,
    id: "t",
    name: "t",
    createdAt: "2020-01-01T00:00:00.000Z",
    board: {
      cols: 2,
      rows: 2,
      locked: true,
      layout: { symbolW: 10, symbolH: 10, colGap: 0, rowGap: 0, padding: 0 },
    },
    symbols: { cellFill: 0.9, scaleMul: {} },
    activeFrameId: "f0",
    frames: [
      { id: "f0", name: "a", grid: [[null, null], [null, null]] },
      { id: "f1", name: "b", grid: [[null, null], [null, null]] },
      { id: "f2", name: "c", grid: [[null, null], [null, null]] },
    ],
    sequences: [],
  };
  const cfg = SB.normalizeConfig(baseCfg);
  const s0 = SB.createDefaultWaveSequence("f0", "f1");
  const s1 = SB.createDefaultWaveSequence("f1", "f2");
  cfg.sequences = [s0, s1];
  SB.normalizeSequences(cfg);
  const chain = SB.buildChainFromFrame(cfg, "f0");
  assert(chain.length === 2, "buildChainFromFrame follows from→to links");
  let dupErr = null;
  try {
    SB.normalizeSequences(
      Object.assign(SB.deepClone(cfg), {
        sequences: cfg.sequences.concat([SB.createDefaultWaveSequence("f0", "f2")]),
      })
    );
  } catch (e) {
    dupErr = e;
  }
  assert(dupErr && /起点占用/.test(dupErr.message), "reject duplicate from frame");

  const cfgOne = SB.normalizeConfig(SB.deepClone(baseCfg));
  cfgOne.sequences = [SB.createDefaultWaveSequence("f0", "f1")];
  SB.normalizeSequences(cfgOne);
  const next = SB.suggestNextLinkFrames(cfgOne);
  assert(next && next.fromFrameId === "f1" && next.toFrameId === "f2", "suggest extends chain f1→f2");
}

// sequence director
{
  const SB = sandbox.globalThis.SlotBoardConfig;
  const cfg = SB.normalizeConfig({
    version: 5,
    id: "t",
    name: "t",
    createdAt: "2020-01-01T00:00:00.000Z",
    board: {
      cols: 2,
      rows: 2,
      locked: true,
      layout: { symbolW: 10, symbolH: 10, colGap: 0, rowGap: 0, padding: 0 },
    },
    symbols: { cellFill: 0.9, scaleMul: {} },
    activeFrameId: "f0",
    frames: [
      {
        id: "f0",
        name: "a",
        grid: [
          ["a.png", "b.png"],
          ["c.png", "d.png"],
        ],
      },
      {
        id: "f1",
        name: "b",
        grid: [
          [null, "b.png"],
          ["c.png", null],
        ],
      },
    ],
    sequences: [],
  });
  const seq = SB.createDefaultWaveSequence("f0", "f1");
  let stepsSeen = 0;
  await A.Director.playSequence(seq, cfg, {
    onStepStart() {
      stepsSeen++;
    },
    onOffsetsReset() {},
    onUpdate() {},
  });
  assert(stepsSeen === 2, "Director plays exit + enter steps");
}

// eliminate cells diff + validate
{
  const SB = sandbox.globalThis.SlotBoardConfig;
  const cfg = SB.normalizeConfig({
    version: 5,
    id: "t",
    name: "t",
    createdAt: "2020-01-01T00:00:00.000Z",
    board: {
      cols: 3,
      rows: 2,
      locked: true,
      layout: { symbolW: 10, symbolH: 10, colGap: 0, rowGap: 0, padding: 0 },
    },
    symbols: { cellFill: 0.9, scaleMul: {} },
    activeFrameId: "f0",
    frames: [
      {
        id: "f0",
        name: "a",
        grid: [
          ["a.png", "b.png", null],
          ["c.png", null, "d.png"],
        ],
      },
      {
        id: "f1",
        name: "b",
        grid: [
          [null, "b.png", null],
          ["c.png", null, null],
        ],
      },
    ],
    sequences: [],
  });
  const cells = SB.computeEliminateCells(cfg, {
    fromFrameId: "f0",
    toFrameId: "f1",
    params: { cells: "diff" },
  });
  assert(cells.length === 2, "diff finds eliminated cells");
  assert(cells.some(function (c) { return c.col === 0 && c.row === 0; }), "diff includes c1r1");
  assert(cells.some(function (c) { return c.col === 2 && c.row === 1; }), "diff includes c3r2");

  const seq = SB.createDefaultEliminateSequence("f0", "f1");
  A.validateAnimStep(seq.steps[0], cfg);
  assert(seq.steps[0].type === "boardEliminate", "eliminate sequence step type");

  const preset = SB.createSequenceFromPreset("f0", "f1", "eliminateWave");
  assert(preset.steps.length === 2, "eliminateWave preset has eliminate + cascade");
  assert(preset.steps[0].type === "boardEliminate", "eliminate step first");
  assert(preset.steps[1].type === "boardCascadeDrop", "cascade step second");

  const picked = A.pickTemplateParams("boardEliminate", {
    cells: "explicit",
    cellList: [{ col: 1, row: 0 }, { col: 2, row: 1 }],
    effectId: "bingo_frame",
    anchor: "cellCenter",
  });
  assert(Array.isArray(picked.cellList) && picked.cellList.length === 2, "pickTemplateParams keeps cellList");
  const explicitCells = SB.computeEliminateCells(cfg, {
    fromFrameId: "f0",
    toFrameId: "f1",
    params: picked,
  });
  assert(explicitCells.length === 2, "explicit cellList used for eliminate cells");
  assert(explicitCells[0].col === 1 && explicitCells[0].row === 0, "explicit cell col/row preserved");

  assert(A.isEliminateSimultaneous({ colOrder: "simultaneous", stagger: 0.1 }), "col simultaneous flag");
  assert(A.isEliminateSimultaneous({ colOrder: "leftFirst", rowOrder: "simultaneous", stagger: 0.1 }), "row simultaneous flag");
  assert(A.isEliminateSimultaneous({ colOrder: "leftFirst", rowOrder: "bottomFirst", stagger: 0 }), "zero stagger is simultaneous");
  assert(A.cellStartDelayForEliminate(2, { colOrder: "simultaneous", stagger: 0.1 }) === 0, "simultaneous zero start delay");
  assert(A.cellStartDelayForEliminate(2, { colOrder: "leftFirst", rowOrder: "bottomFirst", stagger: 0.1 }) === 0.2, "stagger scales by index");

  var parStarts = [];
  var parEnds = [];
  var p1 = A.starterAnim(function (done) {
    parStarts.push("a");
    setTimeout(function () {
      parEnds.push("a");
      done();
    }, 30);
  });
  var p2 = A.starterAnim(function (done) {
    parStarts.push("b");
    setTimeout(function () {
      parEnds.push("b");
      done();
    }, 30);
  });
  await A.par(p1, p2).play();
  assert(parStarts.length === 2, "par starts both anims");
  assert(parStarts[0] === "a" && parStarts[1] === "b", "par starts in registration order");
  assert(parEnds.length === 2, "par waits for both anims");

  var cfg2 = SB.deepClone(cfg);
  cfg2 = SB.upsertSequence(cfg2, SB.createDefaultWaveSequence("f0", "f1"));
  assert(cfg2.sequences.length === 1, "first upsert adds sequence");
  var id1 = cfg2.sequences[0].id;
  cfg2.frames.push({
    id: "f2",
    name: "c",
    grid: SB.emptyGrid(3, 2),
  });
  cfg2 = SB.upsertSequence(cfg2, SB.createDefaultEliminateSequence("f1", "f2"));
  assert(cfg2.sequences.length === 2, "second upsert adds sequence");
  assert(cfg2.sequences[0].id === id1, "first sequence id preserved on add");
  assert(cfg2.sequences[1].id !== id1, "second sequence gets distinct id");

  var cascadeCfg = SB.deepClone(cfg);
  cascadeCfg.frames[0].grid = [
    ["a.png", "b.png"],
    ["c.png", "d.png"],
  ];
  cascadeCfg.frames[1].grid = [
    ["x.png", "a.png"],
    ["c.png", "d.png"],
  ];
  cascadeCfg.board.cols = 2;
  cascadeCfg.board.rows = 2;
  var eliminateStep = {
    type: "boardEliminate",
    fromFrameId: "f0",
    toFrameId: "f1",
    params: { cells: "explicit", cellList: [{ col: 1, row: 0 }] },
  };
  var cascadeStep = {
    type: "boardCascadeDrop",
    fromFrameId: "f0",
    toFrameId: "f1",
    params: {},
  };
  var eliminated = SB.getEliminateCellsForCascade(cascadeCfg, cascadeStep, eliminateStep);
  assert(eliminated.length === 1, "cascade reads eliminate step cells");
  var moves = A.computeCascadeMoves(cascadeCfg, cascadeStep, eliminated);
  assert(moves.length >= 1, "cascade computes moves after eliminate");
  assert(
    moves.some(function (m) {
      return m.isNew && m.col === 1 && m.toRow === 0;
    }),
    "cascade includes new symbol drop"
  );
  A.validateAnimStep(cascadeStep, cascadeCfg, { priorEliminateStep: eliminateStep });
}

console.log(`slot-board-anim: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
