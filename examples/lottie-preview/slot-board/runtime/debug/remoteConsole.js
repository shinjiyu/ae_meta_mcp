/**
 * Remote Console bootstrap for Slot Board Editor.
 *
 * Default ON on localhost; ?remoteConsole=0 to disable.
 * Custom session: ?remoteConsole=slot-board@my-machine
 */
(function (global) {
  "use strict";

  var SDK_URL =
    "https://kuroneko.chat/remote-console/sdk/remote-console.legacy.umd.js";
  var DEFAULT_WS = "wss://kuroneko.chat/remote-console/ws";

  var initialized = false;
  var ready = false;
  var readyResolve = null;
  var readyPromise = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  function trace(scope, event, data) {
    if (global.SBTrace && global.SBTrace.log) {
      global.SBTrace.log(scope, event, data);
      return;
    }
    console.info("[RemoteConsole] " + event, data || "");
  }

  function isEnabled() {
    if (typeof global.location === "undefined") return false;
    var p = new URLSearchParams(global.location.search);
    if (p.get("remoteConsole") === "0") return false;
    if (p.get("remoteConsole") === "1") return true;
    var host = global.location.hostname || "";
    return host === "localhost" || host === "127.0.0.1";
  }

  function resolveSessionName() {
    var p = new URLSearchParams(global.location.search);
    var fromUrl = p.get("remoteConsole");
    if (fromUrl && fromUrl !== "0" && fromUrl !== "1") return fromUrl;
    var host = global.location.hostname || "local";
    var port = global.location.port || "8765";
    return "slot-board@" + host + "-" + port;
  }

  function markReady(info) {
    if (ready) return;
    ready = true;
    if (readyResolve) readyResolve(info || null);
    readyResolve = null;
    updateBadge(info);
  }

  function updateBadge(info) {
    if (typeof document === "undefined") return;
    var badge = document.getElementById("rc-badge");
    if (!badge) return;
    if (!info || !info.sessionId) {
      badge.classList.add("hidden");
      badge.textContent = "";
      badge.title = "";
      return;
    }
    badge.classList.remove("hidden");
    badge.classList.add("active");
    badge.textContent = "RC " + String(info.sessionId).slice(0, 8);
    badge.title =
      "Remote Console\nname=" +
      info.name +
      "\nsessionId=" +
      info.sessionId +
      "\nconnected=" +
      info.connected;
  }

  function loadSdk() {
    if (global.RemoteConsole && global.RemoteConsole.init) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-remote-console-sdk="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        }, { once: true });
        existing.addEventListener("error", function () {
          reject(new Error("RemoteConsole SDK load failed"));
        }, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.src = SDK_URL;
      script.crossOrigin = "anonymous";
      script.async = true;
      script.dataset.remoteConsoleSdk = "1";
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("RemoteConsole SDK load failed"));
      };
      document.head.appendChild(script);
    });
  }

  function boot() {
    if (initialized) return readyPromise;
    initialized = true;

    if (!isEnabled()) {
      trace("rc", "disabled", { hint: "add ?remoteConsole=1 on non-localhost" });
      markReady(null);
      return readyPromise;
    }

    var sessionName = resolveSessionName();
    var attempts = 0;
    var maxAttempts = 20;
    var retryDelayMs = 1000;

    function tryInit() {
      loadSdk()
        .then(function () {
          var rc = global.RemoteConsole;
          if (!rc || !rc.init) {
            throw new Error("RemoteConsole.init missing");
          }
          rc.init({
            autoConnect: true,
            serverUrl: DEFAULT_WS,
            name: sessionName,
          });
          rc.connect && rc.connect();
          var info = {
            name: sessionName,
            sessionId: rc.getSessionId ? rc.getSessionId() : null,
            connected: rc.isConnected ? rc.isConnected() : null,
          };
          trace("rc", "connected", info);
          console.info(
            "[RemoteConsole] connected name=" +
              info.name +
              " sessionId=" +
              info.sessionId +
              " — Agent 可用 MCP get_logs search=SBTrace 拉取日志"
          );
          markReady(info);
        })
        .catch(function (err) {
          attempts++;
          if (attempts < maxAttempts) {
            global.setTimeout(tryInit, retryDelayMs);
            return;
          }
          trace("rc", "initFailed", { error: String(err && err.message ? err.message : err) });
          console.warn("[RemoteConsole] init failed:", err);
          markReady(null);
        });
    }

    tryInit();
    return readyPromise;
  }

  global.SlotBoardRemoteConsole = {
    boot: boot,
    whenReady: function () {
      return readyPromise;
    },
    isEnabled: isEnabled,
    getSessionName: resolveSessionName,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
