/**
 * Build a self-contained playable-ad HTML (single file):
 * Lottie (optimized export, images inlined) + WebP at [SLOT:upper_body].
 *
 * H5 盘面请先用 slot-board-editor 调参导出 config，再单独接入（本脚本暂不嵌入盘面）。
 *
 * Usage:
 *   node scripts/build-playable-lottie.mjs
 *   node scripts/build-playable-lottie.mjs [path/to/comp_1.json]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_LOTTIE =
  "C:/Users/yuzhenyu/Documents/export/lottie/comp_1.optimized.json";
const MANIFEST = "C:/Users/yuzhenyu/Documents/export-manifest.json";
const WEBP = "D:/workspace/HWH5SuperPlay21_2/output/seth_male_1s/anim.webp";
const LOTTIE_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js";
const OUT = path.join(ROOT, "examples/lottie-preview/playable-ad.html");

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function mimeFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function embedExternalAssets(lottie, jsonPath) {
  const clone = structuredClone(lottie);
  const baseDir = path.dirname(jsonPath);

  if (!clone.assets || !Array.isArray(clone.assets)) return clone;

  for (const asset of clone.assets) {
    if (!asset.p || typeof asset.p !== "string") continue;
    if (asset.p.indexOf("data:") === 0) continue;

    const folder = asset.u || "";
    const rel = folder + asset.p;
    const abs = path.join(baseDir, rel.replace(/\//g, path.sep));

    if (!fs.existsSync(abs)) {
      console.warn("  missing asset:", abs);
      continue;
    }

    const buf = fs.readFileSync(abs);
    const mime = mimeFor(asset.p);
    asset.p = "data:" + mime + ";base64," + buf.toString("base64");
    asset.u = "";
    asset.e = 1;
  }

  return clone;
}

function hidePlaceholderLayer(lottie) {
  const clone = structuredClone(lottie);

  function walkLayers(layers) {
    if (!layers) return;
    for (const layer of layers) {
      if (
        layer.nm === "PLACEHOLDER_upper_body" ||
        layer.nm === "[SLOT:upper_body]" ||
        (layer.sc && layer.ty === 1)
      ) {
        if (layer.nm === "PLACEHOLDER_upper_body" || layer.sc === "#ff00ff") {
          layer.ks = layer.ks || {};
          layer.ks.o = { a: 0, k: 0, ix: 11 };
        }
      }
    }
  }

  for (const asset of clone.assets || []) {
    if (asset.layers) walkLayers(asset.layers);
  }
  walkLayers(clone.layers);

  for (const layer of clone.layers || []) {
    if (layer.nm === "[SLOT:upper_body]") {
      layer.ks = layer.ks || {};
      layer.ks.o = { a: 0, k: 0, ix: 11 };
    }
  }

  return clone;
}

function slotRectFromManifest(manifest, slotId) {
  const slot = manifest.slots.find((s) => s.id === slotId);
  if (!slot) throw new Error("slot not found: " + slotId);

  const sx = slot.transform.scale[0] / 100;
  const sy = slot.transform.scale[1] / 100;
  const ax = slot.transform.anchorPoint[0];
  const ay = slot.transform.anchorPoint[1];
  const px = slot.transform.position[0];
  const py = slot.transform.position[1];
  const sourceW = 654;
  const sourceH = 709;

  return {
    left: px - ax * sx,
    top: py - ay * sy,
    width: sourceW * sx,
    height: sourceH * sy,
  };
}

async function fetchLottieLib() {
  const res = await fetch(LOTTIE_CDN);
  if (!res.ok) throw new Error("Failed to fetch lottie-web: " + res.status);
  return res.text();
}

function buildHtml({ lottieLib, animData, webpB64, slot, compW, compH }) {
  const animJson = JSON.stringify(animData);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <meta name="ad.orientation" content="portrait" />
  <title>合成 1 · 试玩广告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: #000;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    #root {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
    }
    #stage-wrap {
      position: relative;
      width: 100%; height: 100%;
      overflow: hidden;
    }
    #stage {
      position: absolute;
      left: 50%; top: 50%;
      width: ${compW}px; height: ${compH}px;
      transform-origin: center center;
      transform: translate(-50%, -50%) scale(var(--s, 1));
      background: #000;
    }
    #lottie, #slot-webp {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
    }
    #slot-webp {
      left: ${slot.left}px;
      top: ${slot.top}px;
      width: ${slot.width}px;
      height: ${slot.height}px;
      object-fit: fill;
      pointer-events: none;
    }
    #cta {
      position: fixed;
      left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      z-index: 20;
      border: none;
      border-radius: 999px;
      padding: 14px 36px;
      font-size: 16px; font-weight: 700; color: #fff;
      background: linear-gradient(180deg, #ff7a18, #ef4444);
      box-shadow: 0 8px 24px rgba(239, 68, 68, 0.45);
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="root">
    <div id="stage-wrap">
      <div id="stage">
        <div id="lottie"></div>
        <img id="slot-webp" alt="upper_body" />
      </div>
    </div>
    <button type="button" id="cta">立即下载</button>
  </div>
  <script>${lottieLib}</script>
  <script>
    (function () {
      var COMP_W = ${compW};
      var COMP_H = ${compH};
      var ANIM_DATA = ${animJson};
      var WEBP_SRC = "data:image/webp;base64,${webpB64}";

      window.super_html = window.super_html || {
        google_play_url: "https://play.google.com/store/apps/details?id=com.finger.hsgame&gl=TW",
        appstore_url: "https://apps.apple.com/tw/app/id1441199787",
        download: function () {
          var ua = navigator.userAgent || "";
          var url = /iPhone|iPad|iPod/i.test(ua) ? this.appstore_url : this.google_play_url;
          window.open(url, "_blank");
        },
        game_end: function () {},
        is_audio: function () { return true; }
      };

      function fitStage() {
        var sw = window.innerWidth;
        var sh = window.innerHeight;
        var scale = Math.min(sw / COMP_W, sh / COMP_H);
        document.getElementById("stage").style.setProperty("--s", String(scale));
      }

      fitStage();
      window.addEventListener("resize", fitStage);

      document.getElementById("slot-webp").src = WEBP_SRC;

      lottie.loadAnimation({
        container: document.getElementById("lottie"),
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: ANIM_DATA
      });

      function onCTA() {
        if (window.FbPlayableAd && window.FbPlayableAd.onCTAClick) {
          window.FbPlayableAd.onCTAClick();
          return;
        }
        window.super_html.download();
        window.super_html.game_end();
      }

      document.getElementById("cta").addEventListener("click", onCTA);
      document.getElementById("root").addEventListener("click", function (e) {
        if (e.target.id === "cta") return;
        onCTA();
      });
    })();
  </script>
</body>
</html>
`;
}

async function main() {
  const lottiePath = process.argv[2] || DEFAULT_LOTTIE;
  if (!fs.existsSync(lottiePath)) {
    throw new Error("Lottie JSON not found: " + lottiePath);
  }

  console.log("Reading:", lottiePath);
  let lottie = loadJson(lottiePath);
  lottie = embedExternalAssets(lottie, lottiePath);
  lottie = hidePlaceholderLayer(lottie);

  const manifest = loadJson(MANIFEST);
  const webpB64 = fs.readFileSync(WEBP).toString("base64");
  const slot = slotRectFromManifest(manifest, "upper_body");

  console.log("Fetching lottie-web...");
  const lottieLib = await fetchLottieLib();

  const html = buildHtml({
    lottieLib,
    animData: lottie,
    webpB64,
    slot,
    compW: lottie.w,
    compH: lottie.h,
  });

  fs.writeFileSync(OUT, html, "utf8");
  const mb = (fs.statSync(OUT).size / (1024 * 1024)).toFixed(2);
  console.log("Wrote " + OUT + " (" + mb + " MB)");
  console.log("Slot rect:", slot);
  console.log("Open directly in browser (file://) — no server needed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
