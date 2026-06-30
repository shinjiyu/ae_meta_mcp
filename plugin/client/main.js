/**
 * CEP panel bootstrap: create CSInterface, wire evalScript -> Node http bridge.
 * Runs in the panel's mixed Node+browser context.
 */

(function () {
  var cs = new CSInterface();

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(state, text) {
    var dot = $("status-dot");
    var label = $("status-text");
    if (dot) dot.className = "dot " + state;
    if (label) label.textContent = text;
  }

  function log(line) {
    var el = $("log");
    if (!el) return;
    var ts = new Date().toLocaleTimeString();
    el.textContent = "[" + ts + "] " + line + "\n" + el.textContent;
  }

  /** Promise wrapper around CSInterface.evalScript. */
  function evalScriptAsync(script) {
    return new Promise(function (resolve, reject) {
      try {
        cs.evalScript(script, function (result) {
          if (result === "EvalScript error.") {
            reject(new Error("EvalScript error"));
            return;
          }
          resolve(result);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function resolvePort() {
    // window.process exists because Node integration is enabled.
    try {
      if (window.process && window.process.env && window.process.env.AE_MCP_PORT) {
        var p = parseInt(window.process.env.AE_MCP_PORT, 10);
        if (!isNaN(p)) return p;
      }
    } catch (e) {}
    return 11488;
  }

  function startBridge() {
    if (!window.require) {
      setStatus("error", "Node integration unavailable");
      log("window.require missing. Check --enable-nodejs in manifest.");
      return;
    }

    var path = window.require("path");
    var fs = window.require("fs");
    var serverModule;
    try {
      // __dirname points at client/; host is a sibling folder.
      var hostPath = path.join(__dirname, "..", "host", "server.js");
      serverModule = window.require(hostPath);
    } catch (e) {
      setStatus("error", "Failed to load host server");
      log("require(host/server.js) failed: " + String(e));
      return;
    }

    var port = resolvePort();

    try {
      serverModule.startServer({
        evalScriptAsync: evalScriptAsync,
        readFileUtf8: function (p) {
          return fs.readFileSync(p, "utf8");
        },
        port: port,
        log: function () {
          var msg = Array.prototype.slice.call(arguments).join(" ");
          log(msg);
        },
      });
      setStatus("ok", "Bridge running on 127.0.0.1:" + port);
      log("Bridge started. ae_exec is now available to Cursor.");
    } catch (e) {
      setStatus("error", "Bridge failed to start");
      log("startServer failed: " + String(e));
    }
  }

  function showHostInfo() {
    var env = cs.getHostEnvironment();
    if (env && env.appName) {
      $("host-info").textContent =
        env.appName + " " + env.appVersion + " (" + env.appLocale + ")";
    } else {
      $("host-info").textContent = "Host info unavailable";
    }
  }

  function pingAe() {
    evalScriptAsync("app.version")
      .then(function (v) {
        log("AE app.version = " + v);
      })
      .catch(function (e) {
        log("ping failed: " + String(e));
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    showHostInfo();
    startBridge();
    var btn = $("ping-btn");
    if (btn) btn.addEventListener("click", pingAe);
  });
})();
