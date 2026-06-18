import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getPreferenceValues } from "@raycast/api";
import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMethod,
  type BridgeParams,
  type BridgeReply,
  type BridgeResult,
  type Prefs,
} from "./types";

// Resolution order: port preference → ~/.monocle/bridge.json → 8765.
export async function resolvePort(): Promise<number> {
  const { port } = getPreferenceValues<Prefs>();
  if (port && port.trim()) {
    const n = Number(port.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  try {
    const disc = JSON.parse(await readFile(join(homedir(), ".monocle", "bridge.json"), "utf8"));
    if (typeof disc.loopbackPort === "number") return disc.loopbackPort;
  } catch {
    // fall through to default
  }
  return 8765;
}

function resolveHost(): string {
  const { host } = getPreferenceValues<Prefs>();
  return host && host.trim() ? host.trim() : "127.0.0.1";
}

/**
 * POST an RPC envelope to the loopback daemon. Never sends an `Origin` header
 * (Node `fetch` omits it by default — keep it that way; the daemon 403s on it).
 * The daemon injects `auth.token` from the Bearer header, so the client only
 * passes the raw token.
 */
export async function bridgeRequest<M extends BridgeMethod>(
  method: M,
  params: BridgeParams<M>,
  token?: string,
): Promise<BridgeReply<BridgeResult<M>>> {
  const host = resolveHost();
  const port = await resolvePort();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  // The daemon has a 30s RPC timeout; keep the client a bit longer so its
  // protocol-shaped `internal` timeout wins over an abort.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const res = await fetch(`http://${host}:${port}/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        v: BRIDGE_PROTOCOL_VERSION,
        id: randomUUID(),
        method,
        params,
      }),
      signal: controller.signal,
    });
    return (await res.json()) as BridgeReply<BridgeResult<M>>;
  } catch (err) {
    // ECONNREFUSED (daemon not running) or an abort (timeout). Map to the normal
    // error envelope so callers never have to try/catch the transport.
    const aborted = err instanceof Error && err.name === "AbortError";
    return aborted
      ? { ok: false, error: { code: "internal", message: "Bridge timed out" } }
      : { ok: false, error: { code: "not_enabled", message: "Monocle Bridge app is not running" } };
  } finally {
    clearTimeout(timer);
  }
}
