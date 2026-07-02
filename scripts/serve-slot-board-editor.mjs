/**
 * Static server for slot-board editor.
 *
 * Usage: node scripts/serve-slot-board-editor.mjs
 * Open:  http://localhost:8765/
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.resolve(__dirname, "../examples");
const SLOT_BOARD = path.join(EXAMPLES, "lottie-preview", "slot-board");
const EDITOR = path.join(SLOT_BOARD, "editor");
const RUNTIME = path.join(SLOT_BOARD, "runtime");
const CONFIGS = path.join(SLOT_BOARD, "configs");
const SYMBOLS = path.join(EXAMPLES, "symbols");
const EFFECTS = process.env.EFFECTS_DIR
  ? path.resolve(process.env.EFFECTS_DIR)
  : path.join(EXAMPLES, "effects");
const PORT = Number(process.env.PORT) || 8765;
const MAX_SYMBOL_BYTES = 8 * 1024 * 1024;
const MAX_EFFECT_BYTES = 32 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj, null, 2), "application/json; charset=utf-8");
}

function resolveFile(url) {
  const clean = decodeURIComponent(url.split("?")[0]);

  if (clean === "/" || clean === "") {
    return path.join(EDITOR, "index.html");
  }
  if (clean.startsWith("/runtime/")) {
    return path.join(RUNTIME, clean.slice("/runtime/".length));
  }
  if (clean.startsWith("/configs/")) {
    return path.join(CONFIGS, clean.slice("/configs/".length));
  }
  if (clean.startsWith("/symbols/")) {
    return path.join(SYMBOLS, clean.slice("/symbols/".length));
  }
  if (clean.startsWith("/effects/")) {
    return path.join(EFFECTS, clean.slice("/effects/".length));
  }
  if (clean.startsWith("/editor/")) {
    return path.join(EDITOR, clean.slice("/editor/".length));
  }
  return path.join(EDITOR, clean.replace(/^\//, ""));
}

function isAllowed(filePath) {
  const resolved = path.resolve(filePath);
  return (
    resolved.startsWith(EDITOR) ||
    resolved.startsWith(RUNTIME) ||
    resolved.startsWith(CONFIGS) ||
    resolved.startsWith(SYMBOLS) ||
    resolved.startsWith(EFFECTS)
  );
}

function ensureEffectsDir() {
  fs.mkdirSync(EFFECTS, { recursive: true });
}

function sanitizeEffectFileName(raw) {
  let base = path.basename(String(raw || "effect.json"));
  base = base.replace(/[^\w.\-]/g, "_");
  if (!base || base === "." || base === "..") base = "effect.json";
  if (base.length > 96) base = base.slice(0, 92) + path.extname(base);
  return base;
}

function effectIdFromManifestName(fileName) {
  return fileName.replace(/\.json$/i, "");
}

function listEffects(cb) {
  ensureEffectsDir();
  fs.readdir(EFFECTS, (err, files) => {
    if (err) return cb(null, []);
    const jsonFiles = files.filter((f) => /\.json$/i.test(f) && f.toLowerCase() !== "index.json");
    const out = [];
    for (const fileName of jsonFiles) {
      try {
        const raw = fs.readFileSync(path.join(EFFECTS, fileName), "utf8");
        const manifest = JSON.parse(raw);
        out.push({
          id: effectIdFromManifestName(fileName),
          name: manifest.name || effectIdFromManifestName(fileName),
          frameCount: manifest.frameCount || (manifest.frames ? manifest.frames.length : 0),
          fps: manifest.fps || 24,
          manifest: fileName,
          thumb:
            (manifest.atlas && (manifest.atlas.webp || manifest.atlas.png)) ||
            (manifest.anim && manifest.anim.webp) ||
            null,
          cellW: manifest.cell && manifest.cell.w,
          cellH: manifest.cell && manifest.cell.h,
        });
      } catch {
        /* skip invalid manifest */
      }
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    cb(null, out);
  });
}

function handleEffectUpload(req, res, url) {
  const params = new URL(url, "http://localhost");
  const rawName = params.searchParams.get("name") || "effect.json";
  const fileName = sanitizeEffectFileName(rawName);
  const ext = path.extname(fileName).toLowerCase();

  readRequestBody(req, MAX_EFFECT_BYTES)
    .then((body) => {
      if (!body.length) {
        return sendJson(res, 400, { ok: false, error: "空文件" });
      }
      if (ext === ".json") {
        try {
          JSON.parse(String(body));
        } catch {
          return sendJson(res, 400, { ok: false, error: "无效的 JSON manifest" });
        }
      } else if (![".png", ".webp", ".jpg", ".jpeg"].includes(ext)) {
        return sendJson(res, 400, { ok: false, error: "不支持的文件类型" });
      }

      ensureEffectsDir();
      const dest = path.join(EFFECTS, fileName);
      fs.writeFile(dest, body, (err) => {
        if (err) return sendJson(res, 500, { ok: false, error: err.message });
        sendJson(res, 200, {
          ok: true,
          name: fileName,
          id: ext === ".json" ? effectIdFromManifestName(fileName) : undefined,
          bytes: body.length,
        });
      });
    })
    .catch((err) => sendJson(res, 400, { ok: false, error: err.message }));
}

function handleEffectDelete(req, res, url) {
  const params = new URL(url, "http://localhost");
  const id = String(params.searchParams.get("id") || "")
    .replace(/[^\w.\-]/g, "_")
    .replace(/\.json$/i, "");
  if (!id) return sendJson(res, 400, { ok: false, error: "缺少 id" });

  ensureEffectsDir();
  fs.readdir(EFFECTS, (err, files) => {
    if (err) return sendJson(res, 500, { ok: false, error: err.message });
    const removed = [];
    files.forEach((f) => {
      if (f === id + ".json" || f.startsWith(id + ".")) {
        try {
          fs.unlinkSync(path.join(EFFECTS, f));
          removed.push(f);
        } catch {
          /* ignore */
        }
      }
    });
    if (!removed.length) {
      return sendJson(res, 404, { ok: false, error: "特效不存在" });
    }
    sendJson(res, 200, { ok: true, id, removed });
  });
}

function ensureSymbolsDir() {
  fs.mkdirSync(SYMBOLS, { recursive: true });
}

function listSymbolPngs(cb) {
  ensureSymbolsDir();
  fs.readdir(SYMBOLS, (err, files) => {
    if (err) {
      const fallback = path.join(CONFIGS, "symbols-catalog.json");
      return fs.readFile(fallback, (e2, data) => {
        if (e2) return cb(null, []);
        try {
          cb(null, JSON.parse(String(data)));
        } catch {
          cb(null, []);
        }
      });
    }
    cb(null, files.filter((f) => /\.png$/i.test(f)).sort());
  });
}

function sanitizeSymbolName(raw) {
  let base = path.basename(String(raw || "symbol.png"));
  base = base.replace(/[^\w.\-()]/g, "_");
  if (!/\.png$/i.test(base)) {
    base = base.replace(/\.[^.]+$/, "") + ".png";
  }
  if (base === ".png" || base === "..png") base = "symbol.png";
  if (base.length > 80) base = base.slice(0, 76) + ".png";
  return base;
}

function isPngBuffer(buf) {
  return (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function uniqueSymbolPath(name) {
  let candidate = sanitizeSymbolName(name);
  let stem = candidate.replace(/\.png$/i, "");
  let n = 1;
  while (fs.existsSync(path.join(SYMBOLS, candidate))) {
    n += 1;
    candidate = stem + "_" + n + ".png";
  }
  return candidate;
}

function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("文件过大（上限 " + Math.round(limit / 1024 / 1024) + "MB）"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function handleSymbolUpload(req, res, url) {
  const params = new URL(url, "http://localhost");
  const rawName = params.searchParams.get("name") || "symbol.png";
  const overwrite = params.searchParams.get("overwrite") === "1";

  readRequestBody(req, MAX_SYMBOL_BYTES)
    .then((body) => {
      if (!body.length) {
        return sendJson(res, 400, { ok: false, error: "空文件" });
      }
      if (!isPngBuffer(body)) {
        return sendJson(res, 400, { ok: false, error: "仅支持 PNG" });
      }

      ensureSymbolsDir();
      let fileName = sanitizeSymbolName(rawName);
      const dest = path.join(SYMBOLS, fileName);
      if (fs.existsSync(dest) && !overwrite) {
        fileName = uniqueSymbolPath(fileName);
      }
      const finalPath = path.join(SYMBOLS, fileName);
      fs.writeFile(finalPath, body, (err) => {
        if (err) return sendJson(res, 500, { ok: false, error: err.message });
        sendJson(res, 200, { ok: true, name: fileName, bytes: body.length });
      });
    })
    .catch((err) => sendJson(res, 400, { ok: false, error: err.message }));
}

function handleSymbolDelete(req, res, url) {
  const params = new URL(url, "http://localhost");
  const name = sanitizeSymbolName(params.searchParams.get("name") || "");
  const dest = path.resolve(SYMBOLS, name);
  if (!dest.startsWith(path.resolve(SYMBOLS))) {
    return sendJson(res, 403, { ok: false, error: "Forbidden" });
  }
  fs.unlink(dest, (err) => {
    if (err && err.code === "ENOENT") {
      return sendJson(res, 404, { ok: false, error: "文件不存在" });
    }
    if (err) return sendJson(res, 500, { ok: false, error: err.message });
    sendJson(res, 200, { ok: true, name });
  });
}

function handler(req, res) {
  const url = req.url || "/";
  const pathname = url.split("?")[0];
  const method = req.method || "GET";

  if (pathname === "/symbols/index.json" && method === "GET") {
    listSymbolPngs((_err, pngs) => {
      send(res, 200, JSON.stringify(pngs, null, 2), "application/json; charset=utf-8");
    });
    return;
  }

  if (pathname === "/symbols/upload" && method === "POST") {
    return handleSymbolUpload(req, res, url);
  }

  if (pathname === "/symbols/delete" && method === "DELETE") {
    return handleSymbolDelete(req, res, url);
  }

  if (pathname === "/effects/index.json" && method === "GET") {
    listEffects((_err, list) => {
      send(res, 200, JSON.stringify(list, null, 2), "application/json; charset=utf-8");
    });
    return;
  }

  if (pathname === "/effects/upload" && method === "POST") {
    return handleEffectUpload(req, res, url);
  }

  if (pathname === "/effects/delete" && method === "DELETE") {
    return handleEffectDelete(req, res, url);
  }

  if (
    method === "OPTIONS" &&
    (pathname === "/symbols/upload" ||
      pathname === "/symbols/delete" ||
      pathname === "/effects/upload" ||
      pathname === "/effects/delete" ||
      pathname === "/symbols/index.json" ||
      pathname === "/effects/index.json")
  ) {
    res.writeHead(204, {
      Allow: "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    return send(res, 405, "Method Not Allowed");
  }

  const filePath = resolveFile(url);
  if (!isAllowed(filePath)) {
    return send(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found: " + (req.url || ""));
    send(res, 200, data, MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  });
}

ensureSymbolsDir();
ensureEffectsDir();
http.createServer(handler).listen(PORT, () => {
  console.log("Slot board editor: http://localhost:" + PORT + "/");
  console.log("  runtime:", RUNTIME);
  console.log("  symbols:", SYMBOLS);
  console.log("  effects:", EFFECTS);
  console.log("  example: http://localhost:" + PORT + "/configs/example-6x5.json");
});
