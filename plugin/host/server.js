/**
 * CEP host HTTP bridge (CommonJS, Node built-in `http` only -- no node_modules
 * shipped into the CEP extensions folder).
 *
 * Runs inside the CEP panel's Node context (--enable-nodejs --mixed-context),
 * so it shares the JS context with CSInterface and can call evalScript.
 *
 * Exposes:
 *   GET  /health  -> bridge + AE status
 *   POST /exec    -> { mode:"eval", code } -> { ok, result } | { ok:false, error }
 */

var http = require("http");

var BRIDGE_NAME = "ae-meta-mcp";
var BRIDGE_VERSION = "0.1.0";
var DEFAULT_PORT = 11488;

/** Result larger than this is written to a temp file (see DEV.md 6.3). */
var FILE_THRESHOLD = 32 * 1024;
var FILE_PREFIX = "__FILE__:";

/**
 * Wrap user ExtendScript so it always returns a JSON string.
 * The body is run via `new Function(...)`, so the user's final expression must
 * be `return`-ed OR be a bare expression (we auto-return single expressions by
 * letting `new Function` body decide; users should end with an expression).
 */
function wrapEvalCode(userCode) {
  var escaped = String(userCode)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n");
  return (
    "(function(){ try {" +
    '  var __fn = new Function("' +
    escaped +
    '");' +
    "  var __r = __fn();" +
    "  var __json = JSON.stringify({ ok: true, result: __r });" +
    "  if (__json && __json.length > " +
    FILE_THRESHOLD +
    ") {" +
    '    var __f = new File(Folder.temp.fsName + "/ae-meta-mcp-result.json");' +
    '    __f.open("w"); __f.write(__json); __f.close();' +
    '    return "' +
    FILE_PREFIX +
    '" + __f.fsName;' +
    "  }" +
    "  return __json;" +
    "} catch(e) {" +
    "  return JSON.stringify({ ok: false, error: String(e), line: (e && e.line) || null });" +
    "} })()"
  );
}

function readBody(req) {
  return new Promise(function (resolve) {
    var chunks = "";
    req.on("data", function (c) {
      chunks += c;
    });
    req.on("end", function () {
      resolve(chunks);
    });
  });
}

function sendJson(res, status, obj) {
  var payload = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * @param {object} opts
 * @param {function(string):Promise<string>} opts.evalScriptAsync resolves with raw evalScript result
 * @param {function(string):string} [opts.readFileUtf8] read temp file content (for large results)
 * @param {number} [opts.port]
 * @param {function(...any):void} [opts.log]
 */
function startServer(opts) {
  var evalScriptAsync = opts.evalScriptAsync;
  var readFileUtf8 = opts.readFileUtf8;
  var port = opts.port || DEFAULT_PORT;
  var log = opts.log || function () {};

  function resolveResult(raw) {
    // raw is the JSON string produced by wrapEvalCode, possibly a __FILE__ pointer.
    if (typeof raw === "string" && raw.indexOf(FILE_PREFIX) === 0) {
      var path = raw.slice(FILE_PREFIX.length);
      if (readFileUtf8) {
        try {
          return readFileUtf8(path);
        } catch (e) {
          return JSON.stringify({
            ok: false,
            error: "Failed to read result file: " + String(e),
          });
        }
      }
    }
    return raw;
  }

  var server = http.createServer(function (req, res) {
    var url = req.url || "/";

    if (req.method === "GET" && url.indexOf("/health") === 0) {
      // Best-effort AE info; bridge stays ok:true even if evalScript fails.
      evalScriptAsync(
        '(function(){ try { return JSON.stringify({' +
          " aeVersion: app.version," +
          " projectPath: app.project.file ? app.project.file.fsName : null," +
          " projectName: app.project.file ? app.project.file.name : null" +
          " }); } catch(e){ return null; } })()"
      )
        .then(function (raw) {
          var info = {};
          try {
            info = JSON.parse(raw) || {};
          } catch (e) {
            info = {};
          }
          sendJson(res, 200, {
            ok: true,
            bridge: BRIDGE_NAME,
            version: BRIDGE_VERSION,
            port: port,
            aeVersion: info.aeVersion || null,
            projectPath: info.projectPath || null,
            projectName: info.projectName || null,
          });
        })
        .catch(function () {
          sendJson(res, 200, {
            ok: true,
            bridge: BRIDGE_NAME,
            version: BRIDGE_VERSION,
            port: port,
            aeVersion: null,
            projectPath: null,
            projectName: null,
          });
        });
      return;
    }

    if (req.method === "POST" && url.indexOf("/exec") === 0) {
      readBody(req).then(function (body) {
        var parsed;
        try {
          parsed = JSON.parse(body || "{}");
        } catch (e) {
          sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
          return;
        }
        if (!parsed.code || typeof parsed.code !== "string") {
          sendJson(res, 400, { ok: false, error: "Missing 'code' string" });
          return;
        }
        var script = wrapEvalCode(parsed.code);
        evalScriptAsync(script)
          .then(function (raw) {
            var resolved = resolveResult(raw);
            var out;
            try {
              out = JSON.parse(resolved);
            } catch (e) {
              out = { ok: false, error: "Non-JSON result", raw: resolved };
            }
            sendJson(res, 200, out);
          })
          .catch(function (err) {
            sendJson(res, 200, {
              ok: false,
              error: "evalScript failed: " + String(err),
            });
          });
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found: " + req.method + " " + url });
  });

  server.on("error", function (err) {
    log("[ae-meta-mcp] server error:", err && err.message ? err.message : err);
  });

  server.listen(port, "127.0.0.1", function () {
    log("[ae-meta-mcp] bridge listening on http://127.0.0.1:" + port);
  });

  return server;
}

module.exports = { startServer: startServer, wrapEvalCode: wrapEvalCode };
