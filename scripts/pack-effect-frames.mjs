/**
 * Pack PNG sequence → sprite atlas + animated WebP + manifest.
 *
 * Usage:
 *   node scripts/pack-effect-frames.mjs
 *   node scripts/pack-effect-frames.mjs examples/effect --fps 24 --cols 6
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

function listFrames(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function baseNameFromFrames(files) {
  const first = path.basename(files[0], path.extname(files[0]));
  const m = first.match(/^(.+?)_(\d+)$/);
  return m ? m[1] : first.replace(/\d+$/, "").replace(/_+$/, "") || "effect";
}

function pickGrid(count, cols) {
  if (cols) {
    const c = Number(cols);
    return { cols: c, rows: Math.ceil(count / c) };
  }
  let best = null;
  for (let c = 1; c <= count; c++) {
    const r = Math.ceil(count / c);
    const waste = c * r - count;
    const score = waste * 1_000_000 + Math.max(c, r) * 1000 + c * r;
    if (!best || score < best.score) best = { cols: c, rows: r, score, waste };
  }
  return best;
}

async function trimBounds(filePath, alphaThreshold = 8) {
  const { info, data } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) {
    return { left: 0, top: 0, width, height, trimmed: false };
  }

  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const trimmed = tw < width || th < height;
  return { left: minX, top: minY, width: tw, height: th, trimmed, sourceW: width, sourceH: height };
}

async function loadFrameBuffer(filePath, bounds, pad) {
  let img = sharp(filePath).ensureAlpha();
  if (bounds.trimmed) {
    img = img.extract({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    });
  }
  if (pad > 0) {
    img = img.extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  return img.png().toBuffer({ resolveWithObject: true });
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(positional[0] || path.join(ROOT, "examples/effect"));
  const outDir = path.resolve(flags.out || path.join(inputDir, "output"));
  const fps = Number(flags.fps || 24);
  const pad = Number(flags.pad || 0);
  const quality = Number(flags.quality || 88);
  const colsFlag = flags.cols ? Number(flags.cols) : null;

  if (!fs.existsSync(inputDir)) {
    console.error("Input dir not found:", inputDir);
    process.exit(1);
  }

  const files = listFrames(inputDir);
  if (!files.length) {
    console.error("No frames in:", inputDir);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const name = flags.name || baseNameFromFrames(files);
  const frameDelay = Math.round(1000 / fps);

  console.log("Packing", files.length, "frames from", inputDir);

  const boundsList = [];
  for (const f of files) {
    boundsList.push(await trimBounds(path.join(inputDir, f)));
  }

  const anyTrimmed = boundsList.some((b) => b.trimmed);
  let cellW = 0;
  let cellH = 0;
  for (const b of boundsList) {
    const w = b.width + pad * 2;
    const h = b.height + pad * 2;
    cellW = Math.max(cellW, w);
    cellH = Math.max(cellH, h);
  }

  const grid = pickGrid(files.length, colsFlag);
  const atlasW = grid.cols * cellW;
  const atlasH = grid.rows * cellH;

  const frameBuffers = [];
  const frameMeta = [];

  for (let i = 0; i < files.length; i++) {
    const { data, info } = await loadFrameBuffer(path.join(inputDir, files[i]), boundsList[i], pad);
    frameBuffers.push(data);

    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    const ax = col * cellW + Math.floor((cellW - info.width) / 2);
    const ay = row * cellH + Math.floor((cellH - info.height) / 2);

    frameMeta.push({
      index: i,
      file: files[i],
      atlas: { x: ax, y: ay, w: info.width, h: info.height },
      cell: { w: cellW, h: cellH },
      source: boundsList[i].trimmed
        ? {
            w: boundsList[i].sourceW,
            h: boundsList[i].sourceH,
            trim: {
              left: boundsList[i].left,
              top: boundsList[i].top,
              width: boundsList[i].width,
              height: boundsList[i].height,
            },
          }
        : { w: boundsList[i].width, h: boundsList[i].height },
    });
  }

  const composites = frameMeta.map((f) => ({
    input: frameBuffers[f.index],
    left: f.atlas.x,
    top: f.atlas.y,
  }));

  const atlasPngPath = path.join(outDir, name + ".atlas.png");
  const atlasWebpPath = path.join(outDir, name + ".atlas.webp");
  const animWebpPath = path.join(outDir, name + ".anim.webp");
  const manifestPath = path.join(outDir, name + ".json");

  await sharp({
    create: {
      width: atlasW,
      height: atlasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toFile(atlasPngPath);

  await sharp(atlasPngPath)
    .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: false })
    .toFile(atlasWebpPath);

  const delays = Array(files.length).fill(frameDelay);
  await sharp(frameBuffers, { animated: true, delay: delays })
    .webp({
      quality,
      alphaQuality: 100,
      effort: 6,
      loop: 0,
      delay: delays,
    })
    .toFile(animWebpPath);

  let rawTotal = 0;
  for (const f of files) rawTotal += fs.statSync(path.join(inputDir, f)).size;

  const manifest = {
    version: 1,
    name,
    frameCount: files.length,
    fps,
    frameDelayMs: frameDelay,
    loop: true,
    trimApplied: anyTrimmed,
    cell: { w: cellW, h: cellH },
    atlas: {
      png: path.basename(atlasPngPath),
      webp: path.basename(atlasWebpPath),
      width: atlasW,
      height: atlasH,
      cols: grid.cols,
      rows: grid.rows,
    },
    anim: {
      webp: path.basename(animWebpPath),
      width: cellW,
      height: cellH,
    },
    frames: frameMeta,
    bytes: {
      sourcePng: rawTotal,
      atlasPng: fs.statSync(atlasPngPath).size,
      atlasWebp: fs.statSync(atlasWebpPath).size,
      animWebp: fs.statSync(animWebpPath).size,
    },
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("");
  console.log("Atlas grid:", grid.cols + "×" + grid.rows, "→", atlasW + "×" + atlasH);
  console.log("Cell size:", cellW + "×" + cellH, anyTrimmed ? "(trimmed)" : "(full canvas, no trim gain)");
  console.log("");
  console.log("Output:", outDir);
  console.log("  manifest  ", path.basename(manifestPath));
  console.log("  atlas png ", fmtBytes(manifest.bytes.atlasPng), " ", path.basename(atlasPngPath));
  console.log("  atlas webp", fmtBytes(manifest.bytes.atlasWebp), " ", path.basename(atlasWebpPath));
  console.log("  anim webp ", fmtBytes(manifest.bytes.animWebp), " ", path.basename(animWebpPath));
  console.log("");
  console.log("Source PNG total:", fmtBytes(rawTotal));
  console.log(
    "Saved vs source:",
    fmtBytes(rawTotal - manifest.bytes.animWebp),
    "(" +
      Math.round((1 - manifest.bytes.animWebp / rawTotal) * 100) +
      "% smaller anim webp)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
