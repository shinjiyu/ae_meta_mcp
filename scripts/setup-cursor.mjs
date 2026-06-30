#!/usr/bin/env node
/**
 * Print a ready-to-paste Cursor mcp.json snippet pointing at this checkout.
 * Usage: node scripts/setup-cursor.mjs
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(join(here, "..", "mcp", "index.mjs"));

// Cursor mcp.json prefers forward slashes even on Windows.
const entryPosix = entry.replace(/\\/g, "/");

const snippet = {
  mcpServers: {
    "ae-meta-mcp": {
      command: "node",
      args: [entryPosix],
      env: {
        AE_MCP_BRIDGE: "http://127.0.0.1:11488",
      },
    },
  },
};

console.log("Add this to your Cursor mcp.json (~/.cursor/mcp.json or .cursor/mcp.json):\n");
console.log(JSON.stringify(snippet, null, 2));
console.log("\nThen toggle ae-meta-mcp off/on in Cursor's MCP settings.");
