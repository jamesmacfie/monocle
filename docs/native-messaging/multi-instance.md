# Multiple instances

> **Status: multi-browser implemented (macOS M0+M1).** The fixed-port daemon
> now tracks **all** connected browser relays at once, identifies each via the
> connect-time `meta/info` handshake, lists them at `GET /instances`, and routes
> a caller request to one via the `X-Monocle-Target` header. Raycast renders a
> browser picker when ≥2 are connected. The canonical build status lives in
> [README.md](./README.md) and the project `CLAUDE.md`.

Native messaging launches **one relay process per connecting extension
instance**. Those relays connect to one persistent daemon over
`~/.monocle/bridge.sock`; the daemon owns the fixed loopback port
(`127.0.0.1:8765` by default) and keeps a **map of all connected relays**, keyed
by browser id.

It is **not only** a Chrome-vs-Firefox problem. Several copies of the host can
exist on one machine:

- Chrome **and** Firefox both running Monocle.
- Multiple **profiles** in the same browser (each spawns its own host).
- Different **channels/builds** — stable, Dev, an unpacked development load.

The implemented model handles the first case; profiles/channels of the same
browser **collapse to one entry** (browser-type-only identity, last relay wins)
— see "Identity granularity" below.

---

## Implemented: one daemon, many relays, caller-selected target

The daemon binds a **fixed port** (no port fight) and multiplexes every connected
browser over the one loopback server:

- **Connect-time handshake.** When a relay connects to the UDS, the daemon sends
  the unauthenticated `meta/info` down it, reads `browser.{name,channel,
  extensionVersion}`, and registers the relay's write-half under its browser id
  (`"chrome"`/`"firefox"`, lowercased `name`). A reconnecting browser replaces
  its own entry (last relay wins for that id). Identity learning needs **no
  extension change** — `meta/info` already reports the browser.
- **Per-connection nonce.** Each relay gets a unique nonce; on disconnect the
  read loop evicts only its own entry, so a newer same-id relay that replaced it
  is not removed.
- **`GET /instances`** (daemon-local, unauthenticated) lists the live browsers
  for the caller's picker — no browser round-trip, served from the cached
  handshake metadata:

  ```jsonc
  { "instances": [ { "id": "chrome", "name": "Chrome", "channel": "stable", "extensionVersion": "0.1.0" } ] }
  ```

- **`X-Monocle-Target` header** on `POST /` names the browser to route to. Absent
  + exactly one connected → that one (back-compat with single-browser clients);
  absent + none → `not_enabled`; absent + ≥2 → `bad_request` (the caller must
  choose); present but not connected → `not_enabled`. The header is stripped by
  the daemon and never reaches the extension.

Pairing and tokens are **per browser** — a token minted by Chrome's extension is
only accepted by Chrome's. Raycast stores a token per browser id and pairs with
each browser on demand (the pairing request is itself targeted). The daemon
injects whichever bearer token the caller sent; it holds no tokens.

### Identity granularity

Identity is **browser type only** (`name` from `meta/info`). Two profiles or
channels of the same browser share one id and the last relay to connect wins the
slot. Per-profile selection would need the extension to report a profile id in
`meta/info` and the daemon to key on `name+profile` — deferred until it's a real
need (see v_next below).

### `status` / `GET /status`

The daemon (`GET /status`, unauthenticated) exposes loopback liveness:

```jsonc
{
  "ok": true,
  "bridge": "monocle",
  "connected": true,
  "loopbackPort": 8765,
  "portOwner": true
}
```

The protocol `status` method over `POST /` gives extension-level identity
(`browser`, `channel`, `extensionVersion`, `bridgeEnabled`,
`executionEnabled`). The app can combine these if it needs to explain what it
reached.

---

## v_next: profile-level identity

The shipped model selects **browsers**, not profiles. To select among multiple
profiles/channels of the same browser, the natural next step keeps the one-daemon
design and only sharpens identity:

- The extension reports a profile/channel discriminator in `meta/info` (e.g.
  `profile`, a stable per-profile id).
- The daemon keys relays on `name + profile` instead of `name` alone, and
  `/instances` returns one entry per profile (`id: "chrome-default"`, etc.).
- Raycast's picker already renders whatever `/instances` returns, so it needs no
  structural change — just richer labels.

This stays within the current architecture (no ephemeral ports, no filesystem
registry — those were an earlier sketch the in-memory daemon registry obsoleted).
Pairing/tokens remain per entry, exactly as the per-browser model already works.

---

## Related docs

- [native-host.md](./native-host.md) — port binding and the host binary.
- [protocol.md](./protocol.md) — the `status` method.
- [roadmap.md](./roadmap.md) — where v2 selection sits in the phasing.
