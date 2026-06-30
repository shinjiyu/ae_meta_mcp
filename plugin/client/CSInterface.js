/**************************************************************************************************
 *
 * ADOBE SYSTEMS INCORPORATED
 * Copyright 2013 Adobe Systems Incorporated
 * All Rights Reserved.
 *
 * NOTICE:  Adobe permits you to use, modify, and distribute this file in accordance with the
 * terms of the Adobe license agreement accompanying it.  If you have received this file from a
 * source other than Adobe, then your use, modification, or distribution of it requires the prior
 * written permission of Adobe.
 *
 * Compact subset of the official CSInterface v11 sufficient for ae-meta-mcp:
 * exposes evalScript, getHostEnvironment, getSystemPath and key constants.
 **************************************************************************************************/

function SystemPath() {}
SystemPath.USER_DATA = "userData";
SystemPath.COMMON_FILES = "commonFiles";
SystemPath.MY_DOCUMENTS = "myDocuments";
SystemPath.APPLICATION = "application";
SystemPath.EXTENSION = "extension";
SystemPath.HOST_APPLICATION = "hostApplication";

function CSInterface() {
  this.hostEnvironment = this.getHostEnvironment();
}

/** Get host environment (app name, version, locale, etc.). */
CSInterface.prototype.getHostEnvironment = function () {
  try {
    this.hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
  } catch (e) {
    this.hostEnvironment = null;
  }
  return this.hostEnvironment;
};

/**
 * Evaluate an ExtendScript string in the host (After Effects).
 * @param {string} script
 * @param {function(string)} [callback] receives the result string.
 */
CSInterface.prototype.evalScript = function (script, callback) {
  if (callback === null || callback === undefined) {
    callback = function () {};
  }
  window.__adobe_cep__.evalScript(script, callback);
};

/** Returns the extension ID of this extension. */
CSInterface.prototype.getExtensionID = function () {
  return window.__adobe_cep__.getExtensionId();
};

/** Retrieves a system path of the given type (use SystemPath constants). */
CSInterface.prototype.getSystemPath = function (pathType) {
  var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
  var OSVersion = this.getOSInformation();
  if (OSVersion.indexOf("Windows") >= 0) {
    path = path.replace("file:///", "");
  } else if (OSVersion.indexOf("Mac") >= 0) {
    path = path.replace("file://", "");
  }
  return path;
};

/** Returns the OS information string. */
CSInterface.prototype.getOSInformation = function () {
  var userAgent = navigator.userAgent;
  if (navigator.platform === "Win32" || navigator.platform === "Windows") {
    return "Windows";
  } else if (navigator.platform === "MacIntel" || navigator.platform === "Macintosh") {
    return "Mac";
  }
  return userAgent;
};
