/**
 * MVP tool registration: ae_health, ae_exec, ae_scene_info.
 */

import { z } from "zod";
import { AE_BRIDGE, bridgeUnreachableHint } from "./context.mjs";
import { health, exec } from "./bridge-client.mjs";

/** Embedded ES3 scene summary script (see DEV.md 9.3). */
const SCENE_INFO_JSX = `(function () {
  var out = {
    aeVersion: app.version,
    project: app.project.file ? app.project.file.fsName : null,
    numItems: app.project.numItems,
    comps: [],
    activeComp: null
  };
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem) {
      out.comps.push({
        name: item.name,
        width: item.width,
        height: item.height,
        duration: item.duration,
        numLayers: item.numLayers
      });
    }
  }
  var active = app.project.activeItem;
  if (active instanceof CompItem) {
    out.activeComp = { name: active.name, numLayers: active.numLayers, layers: [] };
    for (var j = 1; j <= active.numLayers; j++) {
      var lyr = active.layer(j);
      out.activeComp.layers.push({ index: j, name: lyr.name, enabled: lyr.enabled });
    }
  }
  return out;
})()`;

function textResult(value, isError = false) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], isError };
}

const AE_EXEC_DESCRIPTION = [
  "Execute arbitrary ExtendScript inside the running After Effects (like Blender's execute_blender_code / Cocos cocosmcp_exec).",
  "The script runs in AE's ES3 engine. Constraints:",
  "  - NO let/const (use var)",
  "  - NO arrow functions (use function(){})",
  "  - NO template literals (use string concatenation)",
  "  - NO for..of / async / await / class",
  "The last expression (or a 'return') is serialized to JSON and returned.",
  "Example: app.project.activeItem ? app.project.activeItem.name : null",
].join("\n");

export function registerTools(server) {
  server.tool(
    "ae_health",
    "Check whether the After Effects CEP bridge is reachable; returns AE version and project info.",
    {},
    async () => {
      try {
        const body = await health();
        return textResult(body);
      } catch (err) {
        return textResult(bridgeUnreachableHint(err), true);
      }
    }
  );

  server.tool(
    "ae_exec",
    AE_EXEC_DESCRIPTION,
    { code: z.string().describe("ExtendScript (ES3) expression or IIFE body.") },
    async ({ code }) => {
      try {
        const body = await exec(code);
        return textResult(body, body && body.ok === false);
      } catch (err) {
        return textResult(bridgeUnreachableHint(err), true);
      }
    }
  );

  server.tool(
    "ae_scene_info",
    "Summarize the AE project: compositions, active comp and its layers (like Blender get_scene_info).",
    {},
    async () => {
      try {
        const body = await exec(SCENE_INFO_JSX);
        return textResult(body, body && body.ok === false);
      } catch (err) {
        return textResult(bridgeUnreachableHint(err), true);
      }
    }
  );
}

export { AE_BRIDGE };
