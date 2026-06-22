# Protocol client

> The protocol is fixed and owned by
> [`../native-messaging/protocol.md`](../native-messaging/protocol.md). Types live in
> `packages/native-bridge-protocol/src/wire.ts`. This doc is the client view:
> how a Node process inside Raycast talks to the loopback daemon correctly.

## Transport rules (a Node client MUST obey)

The daemon (`apps/bridge/src-tauri/src/daemon.rs`) is strict about transport before anything reaches
the extension:

| Rule | Why | Failure |
|------|-----|---------|
| `POST` JSON to `/` for all RPC | `/` is the only RPC route | — |
| JSON body | body is parsed as JSON | `400 invalid json` |
| Envelope must include a string `id` | the daemon routes replies by `id` | `400 missing id` |
| **Never send an `Origin` header** | blocks web pages driving the bridge via `fetch` | `403 origin not allowed` |
| `Authorization: Bearer <token>` on authed methods | daemon injects it into `env.auth.token` | `unauthorized` from extension |
| `X-Monocle-Target: <browserId>` when ≥2 browsers | names which connected browser answers | `bad_request` if ambiguous and unset; `not_enabled` if the named browser is gone |
| No CORS needed | not a browser context | — |

> Node's global `fetch` does **not** set `Origin` by default — good. Do not add one, and do not use a
> library that injects `Origin`. The daemon rejects any request that carries it.

Raycast runs extensions in a Node runtime without further networking sandboxing, so Node's built-in
`fetch` against `127.0.0.1` is the intended local transport. Keep the client a small Node module;
there is no browser/CORS layer in the Raycast process.

The daemon also surfaces two transport-level outcomes as protocol-shaped error envelopes (so you can
branch on `error.code` uniformly):

- No browser connected → `{ ok:false, error:{ code:"not_enabled", message:"no browser connected" } }`
- Extension didn't answer within 30s → `{ ok:false, error:{ code:"internal", message:"no response from extension" } }`

## Endpoints

| HTTP | Purpose |
|------|---------|
| `POST /` | All RPC methods (envelope in body) |
| `GET /status` | **Daemon-level** health check (no auth, no body). Returns `{ ok, bridge:"monocle", connected, loopbackPort, portOwner }`. `connected` is true when *any* relay is attached. Use it to verify the daemon is up before showing the UI. |
| `GET /instances` | **Daemon-local** list of connected browsers (no auth, no body, no browser round-trip). Returns `{ instances: [{ id, name, channel?, extensionVersion? }] }`. The client (`listInstances`) calls this first to pick a target: 0 → nothing connected, 1 → that browser, ≥2 → show a picker. Returns `[]`/unreachable identically (nothing to target). |

> Note there are **two** "status" responses: the daemon's `GET /status` above (bridge/relay
> liveness), and the protocol `status` *method* over `POST /` (extension-level identity, below).
> They are different shapes — don't conflate them.

## Discovering the port

Default is `8765` (`MONOCLE_BRIDGE_PORT` overrides it on the daemon side). Rather than hardcode,
read the discovery file the daemon writes on startup.

`~/.monocle/bridge.json`:

```jsonc
{ "version": 1, "loopbackPort": 8765, "ipcPath": "/Users/you/.monocle/bridge.sock", "pid": 12345 }
```

Resolution order for the client:

1. If the `port` preference is set and non-blank → use it.
2. Else read `~/.monocle/bridge.json` → `loopbackPort`.
3. Else fall back to `8765`.

(`host` is `127.0.0.1` essentially always; expose it as a preference for completeness.)

## The envelope

Request:

```jsonc
{
  "v": 1,
  "id": "<uuid>",          // client-generated, echoed back; required
  "method": "<method>",
  "params": { /* method-specific; omit/empty for meta/info & status */ }
  // auth is NOT set by the client — the daemon injects it from the Bearer header
}
```

Response (success / error):

```jsonc
{ "v": 1, "id": "<uuid>", "ok": true,  "result": { /* method-specific */ } }
{ "v": 1, "id": "<uuid>", "ok": false, "error": { "code": "<BridgeErrorCode>", "message": "…" } }
```

## Methods

| Method | Auth scope | Params | Result |
|--------|-----------|--------|--------|
| `meta/info` | none | — | `{ protocolVersions:[1], scopes, bridgeEnabled, executionEnabled, browser:{ name, channel, extensionVersion } }` |
| `status` | none | — | `{ ok:true, browser, channel, extensionVersion, bridgeEnabled, executionEnabled, portOwner:true }` |
| `pair/request` | none | `{ client:{ name, instanceId } }` | `{ pairingId, code, expiresInSeconds }` — the app **displays** `code` for the human to type in the browser (Direction B; see [pairing.md](./pairing.md)) |
| `pair/poll-status` | none | `{ pairingId }` | `{ status:"pending" }` \| `{ status:"approved", token, scopes }` \| `{ status:"expired" }` \| `{ status:"rejected" }` |
| `suggestions/get-for-active-tab` | `suggestions:read` | `{ limit?, includeFavorites? }` (optional) | `{ url, title, suggestions: ExternalSuggestion[] }` |
| `suggestions/search-active-tab` | `suggestions:read` | `{ query, limit? }` | `{ url, title, query, suggestions: ExternalSuggestion[] }` |
| `suggestions/get-children` | `suggestions:read` | `{ path: string[] (1..20), query?, limit? }` | `{ url, title, path, suggestions: ExternalSuggestion[] }` |
| `commands/execute` | `commands:execute` | `{ id, confirmed? }` | `{ ran:true, focused?, value?, contentType? }` |

`limit` is clamped server-side to `[1, 200]`, default `50`. `includeFavorites` defaults to `true`.
A paired token carries **both** scopes (`suggestions:read`, `commands:execute`), but execution is
additionally gated by a global opt-in (see below).

`meta/info` vs `status` for the client:

- `meta/info` — capability probe before showing the UI. `bridgeEnabled` tells you the feature is on;
  `executionEnabled` tells you whether to offer Run actions (see [execution.md](./execution.md)).
- `status` — extension-level identity ("you reached Chrome"). `portOwner:true` is always returned by
  the responder; in a multi-browser setup the relevant signal is *which* browser answered.

## Error codes → user-facing handling

The app branches on `code`, never on `message`.

| `code` | Meaning | Suggested handling |
|--------|---------|--------------------|
| `bad_request` | Malformed envelope/params, or ≥2 browsers connected and no `X-Monocle-Target` set | Fix the envelope, or set the target header (the client picks a browser first — see [architecture.md](./architecture.md)) |
| `unauthorized` | Missing/invalid/revoked token | Clear stored token, route to Pair (pairing.md) |
| `forbidden_scope` | Token lacks the required scope | Re-pair (tokens grant both scopes today) |
| `not_enabled` | Bridge off, no browser connected, or `X-Monocle-Target` names a browser that isn't connected | "Enable the bridge in Monocle / open your browser" + retry |
| `pairing_expired` | Reserved. Expiry surfaces as `pair/poll-status` → `{ status:"expired" }`, not this code | Restart pairing |
| `pairing_rejected` | Reserved. Rejection/attempt-cap surfaces as `pair/poll-status` → `{ status:"rejected" }` | Restart pairing |
| `no_active_tab` | No active tab, or it's incognito | "Switch to a normal browser tab" |
| `not_found` | Command id / path doesn't resolve | Refresh the list (stale id); for paths, pop the view |
| `forbidden` | Command not available to external apps | Disable/hide its Run action with a tooltip |
| `execution_disabled` | Global "Allow execution" opt-in is off | Tell the user to enable it in Monocle settings |
| `execution_failed` | Command threw | Toast "Command failed to run", offer retry |
| `internal` | Daemon/extension error or RPC timeout | Toast "Bridge error", retry |
| `rate_limited` | Reserved (not currently emitted) | Back off |

## A minimal client (`src/lib/bridge.ts`)

The real client adds two things over a bare POST helper: the optional `target`
(set as `X-Monocle-Target`) and a `listInstances()` helper that hits
`GET /instances`. It also maps transport failures (`ECONNREFUSED`, abort) onto the
normal error envelope so callers never `try/catch` the transport.

```ts
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getPreferenceValues } from "@raycast/api";

type Ok<T> = { ok: true; result: T };
type Err = { ok: false; error: { code: string; message: string } };

async function resolvePort(): Promise<number> {
  const { port } = getPreferenceValues<Prefs>();
  if (port && port.trim()) return Number(port.trim());
  try {
    const disc = JSON.parse(await readFile(join(homedir(), ".monocle", "bridge.json"), "utf8"));
    if (typeof disc.loopbackPort === "number") return disc.loopbackPort;
  } catch {
    /* fall through */
  }
  return 8765;
}

export async function bridgeRequest<T>(
  method: string,
  params: unknown,
  token?: string,
  target?: string,
): Promise<Ok<T> | Err> {
  const { host } = getPreferenceValues<Prefs>();
  const port = await resolvePort();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;       // never set Origin
  if (target) headers["X-Monocle-Target"] = target;            // route to a specific browser
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  try {
    const res = await fetch(`http://${host?.trim() || "127.0.0.1"}:${port}/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ v: 1, id: randomUUID(), method, params }),
      signal: controller.signal,
    });
    return (await res.json()) as Ok<T> | Err;
  } catch (err) {
    // ECONNREFUSED (daemon down) / abort (timeout) → protocol-shaped envelope.
    const aborted = err instanceof Error && err.name === "AbortError";
    return aborted
      ? { ok: false, error: { code: "internal", message: "Bridge timed out" } }
      : { ok: false, error: { code: "not_enabled", message: "Monocle Bridge app is not running" } };
  } finally {
    clearTimeout(timeout);
  }
}

// The browsers currently connected, for the picker. [] if the daemon is unreachable.
export async function listInstances(): Promise<{ id: string; name: string }[]> {
  const { host } = getPreferenceValues<Prefs>();
  const port = await resolvePort();
  try {
    const res = await fetch(`http://${host?.trim() || "127.0.0.1"}:${port}/instances`);
    return ((await res.json()).instances ?? []);
  } catch {
    return [];
  }
}
```

The daemon has its own 30s RPC timeout; the client timeout is intentionally longer so the daemon can
return its protocol-shaped `internal` timeout first. When the daemon isn't running, `bridgeRequest`
returns a `not_enabled` envelope (and `listInstances` returns `[]`) — tell the user to launch the
Monocle Bridge app (see [testing-and-troubleshooting.md](./testing-and-troubleshooting.md)).
