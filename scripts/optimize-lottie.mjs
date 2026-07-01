/**
 * Post-export Lottie optimizer.
 * - Minify JSON
 * - Resize image assets to on-screen display size (Bodymovin exports source resolution)
 * - Extract inline base64 images to images/ (if any)
 * - Optional PNG recompress via sharp
 *
 * Usage:
 *   node scripts/optimize-lottie.mjs [path/to/comp_1.json]
 *   node scripts/optimize-lottie.mjs comp_1.json --no-resize
 *   node scripts/optimize-lottie.mjs comp_1.json --resize-scale 2
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));

const inputJson =
  positional[0] || "C:/Users/yuzhenyu/Documents/export/lottie/comp_1.json";
const resizeToDisplay = !flags.has("--no-resize");
const resizeScale = (() => {
  const idx = argv.indexOf("--resize-scale");
  if (idx >= 0 && argv[idx + 1]) {
    const n = Number(argv[idx + 1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  return 1;
})();

function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

function isBase64Asset(p) {
  return typeof p === "string" && p.indexOf("data:image") === 0;
}

function extFromDataUri(uri) {
  if (uri.indexOf("image/png") >= 0) return ".png";
  if (uri.indexOf("image/jpeg") >= 0 || uri.indexOf("image/jpg") >= 0) return ".jpg";
  if (uri.indexOf("image/webp") >= 0) return ".webp";
  return ".png";
}

function getScaleXY(s) {
  if (!s || s.k === undefined || s.k === null) return [100, 100];
  if (s.a) {
    const k = s.k;
    if (Array.isArray(k) && k.length && k[0].s) {
      const v = k[0].s;
      return [v[0], v[1] ?? v[0]];
    }
    return [100, 100];
  }
  const k = s.k;
  if (Array.isArray(k)) return [k[0], k[1] ?? k[0]];
  return [k, k];
}

function multiplyTransformProp(prop, mulX, mulY) {
  if (!prop || prop.k === undefined || prop.k === null) return;
  if (prop.a) {
    for (const kf of prop.k) {
      if (!kf.s) continue;
      kf.s[0] *= mulX;
      if (kf.s.length > 1) kf.s[1] *= mulY;
    }
    return;
  }
  const k = prop.k;
  if (Array.isArray(k)) {
    prop.k = [k[0] * mulX, (k[1] ?? k[0]) * mulY, k[2] ?? 0];
  } else {
    prop.k = k * mulX;
  }
}

function walkCompLayers(layers, assets, mul, sizes) {
  for (const layer of layers || []) {
    const [lsx, lsy] = getScaleXY(layer.ks?.s);
    const mulX = mul.x * (lsx / 100);
    const mulY = mul.y * (lsy / 100);

    if (layer.ty === 2 && layer.refId) {
      const asset = assets.find((a) => a.id === layer.refId && a.w && a.h);
      if (asset) {
        const dw = asset.w * mulX;
        const dh = asset.h * mulY;
        const cur = sizes.get(layer.refId) || { dw: 0, dh: 0, uses: 0 };
        cur.dw = Math.max(cur.dw, dw);
        cur.dh = Math.max(cur.dh, dh);
        cur.uses++;
        sizes.set(layer.refId, cur);
      }
    }

    if (layer.ty === 0 && layer.refId) {
      const sub = assets.find((a) => a.id === layer.refId && a.layers);
      if (sub) walkCompLayers(sub.layers, assets, { x: mulX, y: mulY }, sizes);
    }
  }
}

function computeAssetDisplaySizes(data) {
  const sizes = new Map();
  walkCompLayers(data.layers, data.assets, { x: 1, y: 1 }, sizes);
  return sizes;
}

function walkAllLayers(layers, assets, visit) {
  for (const layer of layers || []) {
    visit(layer);
    if (layer.ty === 0 && layer.refId) {
      const sub = assets.find((a) => a.id === layer.refId && a.layers);
      if (sub) walkAllLayers(sub.layers, assets, visit);
    }
  }
}

function adjustLayersForResizedAsset(data, refId, oldW, oldH, newW, newH) {
  const scaleMulX = oldW / newW;
  const scaleMulY = oldH / newH;
  const anchorMulX = newW / oldW;
  const anchorMulY = newH / oldH;

  walkAllLayers(data.layers, data.assets, (layer) => {
    if (layer.refId !== refId || layer.ty !== 2) return;
    if (layer.ks?.s) multiplyTransformProp(layer.ks.s, scaleMulX, scaleMulY);
    if (layer.ks?.a) multiplyTransformProp(layer.ks.a, anchorMulX, anchorMulY);
  });
}

async function resizeImagesToDisplay(data, imagesDir, sharp, options) {
  const { scaleFactor, minSavingsRatio = 0.08 } = options;
  const sizes = computeAssetDisplaySizes(data);
  const results = [];

  for (const asset of data.assets || []) {
    if (!asset.w || !asset.h || !asset.p || isBase64Asset(asset.p)) continue;
    if (!asset.p.match(/\.(png|jpe?g|webp)$/i)) continue;

    const display = sizes.get(asset.id);
    if (!display || display.uses === 0) continue;

    const targetW = Math.max(1, Math.ceil(display.dw * scaleFactor));
    const targetH = Math.max(1, Math.ceil(display.dh * scaleFactor));

    if (targetW >= asset.w && targetH >= asset.h) {
      results.push({
        id: asset.id,
        file: asset.p,
        skipped: true,
        reason: "already at or below display size",
        src: `${asset.w}x${asset.h}`,
        display: `${display.dw.toFixed(1)}x${display.dh.toFixed(1)}`,
      });
      continue;
    }

    const savingsRatio = 1 - (targetW * targetH) / (asset.w * asset.h);
    if (savingsRatio < minSavingsRatio) {
      results.push({
        id: asset.id,
        file: asset.p,
        skipped: true,
        reason: "savings below threshold",
        src: `${asset.w}x${asset.h}`,
        target: `${targetW}x${targetH}`,
      });
      continue;
    }

    const rel = (asset.u || "") + asset.p;
    const filePath = path.join(imagesDir, rel.replace(/^images\//, ""));

    if (!fs.existsSync(filePath)) {
      results.push({
        id: asset.id,
        file: asset.p,
        skipped: true,
        reason: "file not found",
        path: filePath,
      });
      continue;
    }

    const beforeBytes = fs.statSync(filePath).size;
    const oldW = asset.w;
    const oldH = asset.h;

    const resized = await sharp(filePath)
      .resize(targetW, targetH, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer({ resolveWithObject: true });

    const newW = resized.info.width;
    const newH = resized.info.height;

    if (newW >= oldW && newH >= oldH) {
      results.push({
        id: asset.id,
        file: asset.p,
        skipped: true,
        reason: "sharp did not shrink",
        src: `${oldW}x${oldH}`,
        actual: `${newW}x${newH}`,
      });
      continue;
    }

    fs.writeFileSync(filePath, resized.data);
    asset.w = newW;
    asset.h = newH;
    adjustLayersForResizedAsset(data, asset.id, oldW, oldH, newW, newH);

    const afterBytes = fs.statSync(filePath).size;
    results.push({
      id: asset.id,
      file: asset.p,
      resized: true,
      from: `${oldW}x${oldH}`,
      to: `${newW}x${newH}`,
      display: `${display.dw.toFixed(1)}x${display.dh.toFixed(1)}`,
      uses: display.uses,
      bytesBefore: beforeBytes,
      bytesAfter: afterBytes,
    });
  }

  return results;
}

function extractBase64Assets(data, imagesDir) {
  if (!data.assets || !Array.isArray(data.assets)) return 0;
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  let extracted = 0;
  for (let i = 0; i < data.assets.length; i++) {
    const asset = data.assets[i];
    if (!isBase64Asset(asset.p)) continue;

    const comma = asset.p.indexOf(",");
    if (comma < 0) continue;
    const buf = Buffer.from(asset.p.slice(comma + 1), "base64");
    const ext = extFromDataUri(asset.p);
    const fileName = (asset.id || "image_" + i) + ext;
    const outPath = path.join(imagesDir, fileName);
    fs.writeFileSync(outPath, buf);

    asset.u = "images/";
    asset.p = fileName;
    asset.e = 0;
    delete asset.base64;
    extracted++;
  }
  return extracted;
}

async function trySharpCompress(imagesDir) {
  try {
    const sharp = (await import("sharp")).default;
    const files = fs.readdirSync(imagesDir).filter((f) => /\.png$/i.test(f));
    let saved = 0;
    for (const file of files) {
      const fp = path.join(imagesDir, file);
      const before = fs.statSync(fp).size;
      const out = await sharp(fp).png({ compressionLevel: 9, palette: true }).toBuffer();
      if (out.length < before) {
        fs.writeFileSync(fp, out);
        saved += before - out.length;
      }
    }
    return { ok: true, files: files.length, saved };
  } catch {
    return { ok: false, reason: "sharp not installed (optional)" };
  }
}

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

function sumImagesBytes(imagesDir) {
  if (!fs.existsSync(imagesDir)) return 0;
  let total = 0;
  for (const f of fs.readdirSync(imagesDir)) {
    total += fs.statSync(path.join(imagesDir, f)).size;
  }
  return total;
}

async function main() {
  if (!fs.existsSync(inputJson)) {
    console.error("Not found:", inputJson);
    process.exit(1);
  }

  const dir = path.dirname(inputJson);
  const base = path.basename(inputJson, ".json");
  const imagesDir = path.join(dir, "images");
  const outJson = path.join(dir, base + ".optimized.json");
  const reportPath = path.join(dir, "optimize-report.json");

  const raw = fs.readFileSync(inputJson, "utf8");
  const beforeBytes = Buffer.byteLength(raw);
  const data = JSON.parse(raw);

  const extracted = extractBase64Assets(data, imagesDir);

  let resizeResult = { enabled: false, items: [] };
  let imagesBytesBeforeResize = sumImagesBytes(imagesDir);

  if (resizeToDisplay) {
    const sharp = await loadSharp();
    if (!sharp) {
      console.warn("  resize skipped: install sharp (npm install sharp)");
      resizeResult = { enabled: false, error: "sharp not installed" };
    } else {
      resizeResult = {
        enabled: true,
        scaleFactor: resizeScale,
        items: await resizeImagesToDisplay(data, imagesDir, sharp, {
          scaleFactor: resizeScale,
        }),
      };
      const resized = resizeResult.items.filter((r) => r.resized);
      if (resized.length) {
        console.log("  resized", resized.length, "images to display size:");
        for (const r of resized) {
          console.log(
            "   ",
            r.file,
            r.from,
            "->",
            r.to,
            "(display",
            r.display + ")",
            fmtBytes(r.bytesBefore),
            "->",
            fmtBytes(r.bytesAfter)
          );
        }
      }
    }
  }

  const minified = JSON.stringify(data);
  fs.writeFileSync(outJson, minified, "utf8");

  let imagesBytes = sumImagesBytes(imagesDir);

  const sharpResult = await trySharpCompress(imagesDir);
  if (sharpResult.ok && sharpResult.saved > 0) {
    imagesBytes = sumImagesBytes(imagesDir);
  }

  const afterJsonBytes = fs.statSync(outJson).size;
  const totalAfter = afterJsonBytes + imagesBytes;
  const imagesSaved = imagesBytesBeforeResize - imagesBytes;

  const report = {
    input: inputJson,
    output: outJson,
    imagesDir,
    before: { json: beforeBytes, images: imagesBytesBeforeResize, total: beforeBytes + imagesBytesBeforeResize },
    after: { json: afterJsonBytes, images: imagesBytes, total: totalAfter },
    saved: beforeBytes + imagesBytesBeforeResize - totalAfter,
    imagesSaved,
    extractedBase64: extracted,
    resize: resizeResult,
    sharp: sharpResult,
    at: new Date().toISOString(),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("Lottie optimize done");
  console.log("  input :", inputJson, fmtBytes(beforeBytes));
  console.log("  output:", outJson, fmtBytes(afterJsonBytes));
  console.log("  images:", imagesDir, fmtBytes(imagesBytes));
  if (imagesSaved > 0) console.log("  images saved:", fmtBytes(imagesSaved));
  console.log("  total :", fmtBytes(totalAfter));
  console.log("  base64 extracted:", extracted);
  console.log("  report:", reportPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
