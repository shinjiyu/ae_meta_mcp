/**
 * Integration test: effects library upload + index + static serve.
 *
 * Spawns serve-slot-board-editor on a temp port / temp EFFECTS_DIR,
 * uploads bingo_frame bundle from examples/effect/output, validates manifest.
 *
 * Usage: node scripts/test-slot-board-effects-import.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "examples", "effect", "output");
const SERVER = path.join(__dirname, "serve-slot-board-editor.mjs");

const BUNDLE_FILES = [
  "bingo_frame.json",
  "bingo_frame.atlas.webp",
  "bingo_frame.anim.webp",
];

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(baseUrl, attempts) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(baseUrl + "/effects/index.json");
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(120);
  }
  throw new Error("server did not become ready: " + baseUrl);
}

async function uploadFile(baseUrl, filePath) {
  const name = path.basename(filePath);
  const body = fs.readFileSync(filePath);
  const ext = path.extname(name).toLowerCase();
  const type =
    ext === ".json"
      ? "application/json"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".png"
          ? "image/png"
          : "application/octet-stream";

  const res = await fetch(baseUrl + "/effects/upload?name=" + encodeURIComponent(name), {
    method: "POST",
    headers: { "Content-Type": type },
    body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("upload " + name + " -> " + res.status + " " + text.slice(0, 120));
  }
  if (!res.ok || !data.ok) {
    throw new Error("upload " + name + " -> " + ((data && data.error) || res.status));
  }
  return data;
}

function validateManifest(manifest, effectsDir) {
  assert(manifest.version === 1, "manifest.version === 1");
  assert(manifest.frameCount === manifest.frames.length, "frameCount matches frames.length");
  assert(manifest.frames.length === 24, "bingo_frame has 24 frames");

  const atlas = manifest.atlas || {};
  const atlasFile = atlas.webp || atlas.png;
  assert(!!atlasFile, "manifest atlas file ref");
  assert(fs.existsSync(path.join(effectsDir, atlasFile)), "atlas file on disk: " + atlasFile);

  if (manifest.anim && manifest.anim.webp) {
    assert(
      fs.existsSync(path.join(effectsDir, manifest.anim.webp)),
      "anim webp on disk"
    );
  }

  const aw = atlas.width || 0;
  const ah = atlas.height || 0;
  assert(aw > 0 && ah > 0, "atlas dimensions present");

  manifest.frames.forEach(function (frame, i) {
    const a = frame.atlas;
    assert(!!a, "frame " + i + " has atlas rect");
    assert(a.w > 0 && a.h > 0, "frame " + i + " non-zero size");
    assert(a.x >= 0 && a.y >= 0, "frame " + i + " origin in bounds");
    assert(a.x + a.w <= aw + 1, "frame " + i + " within atlas width");
    assert(a.y + a.h <= ah + 1, "frame " + i + " within atlas height");
  });
}

async function main() {
  for (const file of BUNDLE_FILES) {
    const p = path.join(SOURCE_DIR, file);
    assert(fs.existsSync(p), "source bundle exists: " + file);
  }
  if (failed) {
    console.error("Abort: missing source files in " + SOURCE_DIR);
    process.exit(1);
  }

  const effectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "slot-board-effects-"));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const baseUrl = "http://127.0.0.1:" + port;

  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), EFFECTS_DIR: effectsDir },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForServer(baseUrl, 40);

    for (const file of BUNDLE_FILES) {
      const data = await uploadFile(baseUrl, path.join(SOURCE_DIR, file));
      assert(data.ok === true, "upload ok: " + file);
      assert(data.name === file, "upload name preserved: " + file);
    }

    const indexRes = await fetch(baseUrl + "/effects/index.json");
    assert(indexRes.ok, "GET /effects/index.json");
    const list = await indexRes.json();
    assert(Array.isArray(list) && list.length === 1, "index lists one effect");
    assert(list[0].id === "bingo_frame", "index id bingo_frame");
    assert(list[0].frameCount === 24, "index frameCount 24");
    assert(list[0].thumb === "bingo_frame.atlas.webp", "index thumb from atlas webp");

    const atlasRes = await fetch(baseUrl + "/effects/bingo_frame.atlas.webp");
    assert(atlasRes.ok, "GET static atlas webp");
    const atlasBuf = Buffer.from(await atlasRes.arrayBuffer());
    assert(
      atlasBuf.length === fs.statSync(path.join(SOURCE_DIR, "bingo_frame.atlas.webp")).size,
      "atlas bytes match source"
    );

    const manifest = JSON.parse(
      fs.readFileSync(path.join(effectsDir, "bingo_frame.json"), "utf8")
    );
    validateManifest(manifest, effectsDir);

    const badRes = await fetch(baseUrl + "/effects/upload?name=bad.txt", {
      method: "POST",
      body: "x",
    });
    const badText = await badRes.text();
    let badData;
    try {
      badData = JSON.parse(badText);
    } catch {
      assert(false, "reject bad ext returns JSON, got: " + badText.slice(0, 80));
      badData = {};
    }
    assert(!badRes.ok && badData.error, "reject unsupported file type");

    console.log("slot-board-effects-import: " + passed + " passed, " + failed + " failed");
    console.log("  temp effects dir:", effectsDir);
    if (failed) process.exit(1);
  } finally {
    child.kill();
    try {
      fs.rmSync(effectsDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    if (failed && stderr) console.error(stderr);
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
