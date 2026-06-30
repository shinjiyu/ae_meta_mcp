/**
 * Shared MCP <-> CEP bridge context.
 * Mirrors cocos-meta-mcp's context.mjs: one base URL + a thin fetch helper.
 */

export const AE_BRIDGE =
  process.env.AE_MCP_BRIDGE ||
  process.env.AE_MCP_HTTP_URL ||
  "http://127.0.0.1:11488";

/**
 * Call the CEP bridge and return a normalized { status, ok, body } shape.
 * Never throws on non-2xx; network failures reject so callers can surface
 * a "bridge unreachable" message.
 */
export async function fetchBridge(pathname, method = "GET", jsonBody) {
  const url = `${AE_BRIDGE.replace(/\/$/, "")}${pathname}`;
  const init = { method };
  if (jsonBody !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(jsonBody);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, ok: res.ok, body };
}

/**
 * Human-readable hint shown when the bridge cannot be reached.
 */
export function bridgeUnreachableHint(err) {
  return [
    `Cannot reach AE bridge at ${AE_BRIDGE}.`,
    `Reason: ${err && err.message ? err.message : String(err)}`,
    "",
    "Checklist:",
    "  1. After Effects is running.",
    "  2. Window -> Extensions -> ae-meta-mcp panel is open.",
    "  3. Preferences -> Scripting & Expressions -> Allow Scripts to Write Files and Access Network is checked.",
  ].join("\n");
}
