/**
 * effectLoader — 从 /effects/ 加载 manifest + atlas 图
 */
(function (global) {
  "use strict";

  var cache = Object.create(null);

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("无法加载特效图: " + url));
      };
      img.src = url;
    });
  }

  function effectManifestUrl(effectId) {
    return "/effects/" + encodeURIComponent(effectId + ".json");
  }

  function effectAssetUrl(fileName) {
    return "/effects/" + encodeURIComponent(fileName);
  }

  function loadEffect(effectId) {
    if (!effectId) return Promise.reject(new Error("缺少 effectId"));
    if (cache[effectId]) return Promise.resolve(cache[effectId]);

    return fetch(effectManifestUrl(effectId))
      .then(function (res) {
        if (!res.ok) throw new Error("找不到特效 manifest: " + effectId);
        return res.json();
      })
      .then(function (manifest) {
        var atlasFile =
          (manifest.atlas && (manifest.atlas.webp || manifest.atlas.png)) || null;
        if (!atlasFile) throw new Error("特效 " + effectId + " 缺少 atlas");
        return loadImage(effectAssetUrl(atlasFile)).then(function (atlas) {
          var loaded = { id: effectId, manifest: manifest, atlas: atlas };
          cache[effectId] = loaded;
          return loaded;
        });
      });
  }

  function clearEffectCache() {
    cache = Object.create(null);
  }

  global.SlotBoardAnim = global.SlotBoardAnim || {};
  global.SlotBoardAnim.loadEffect = loadEffect;
  global.SlotBoardAnim.clearEffectCache = clearEffectCache;
})(typeof window !== "undefined" ? window : globalThis);
