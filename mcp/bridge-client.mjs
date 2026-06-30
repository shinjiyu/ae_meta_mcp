/**
 * Thin client around the CEP bridge HTTP API (/health, /exec).
 */

import { fetchBridge } from "./context.mjs";

/**
 * GET /health -> bridge + AE status.
 * Rejects only on network failure (bridge unreachable).
 */
export async function health() {
  const { body } = await fetchBridge("/health", "GET");
  return body;
}

/**
 * POST /exec { mode: "eval", code } -> { ok, result } | { ok:false, error, line }.
 * Rejects only on network failure (bridge unreachable).
 */
export async function exec(code) {
  const { body } = await fetchBridge("/exec", "POST", { mode: "eval", code });
  return body;
}
