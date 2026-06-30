#!/usr/bin/env node
/**
 * ae-meta-mcp entry point. stdio MCP transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools, AE_BRIDGE } from "./core.mjs";

async function main() {
  const server = new McpServer({
    name: "ae-meta-mcp",
    version: "0.1.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr only: stdout is reserved for the MCP protocol.
  console.error(`[ae-meta-mcp] connected. bridge=${AE_BRIDGE}`);
}

main().catch((err) => {
  console.error("[ae-meta-mcp] fatal:", err);
  process.exit(1);
});
