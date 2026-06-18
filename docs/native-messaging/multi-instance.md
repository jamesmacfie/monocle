# Multiple instances

> **Status: extension side implemented; bridge host built at `apps/bridge`
> (macOS M0+M1) — v1 fixed-port daemon with one active browser relay.** This
> document is the design/contract; the canonical build status lives in
> [README.md](./README.md) and the project `CLAUDE.md`.

Native messaging launches **one relay process per connecting extension
instance**. In the current bridge app, those relays connect to one persistent
daemon over `~/.monocle/bridge.sock`; the daemon owns the fixed loopback port
(`127.0.0.1:8765` by default) and keeps a single active relay write-half.

That means v1 avoids a port fight, but it does **not** yet provide browser/profile
selection. If multiple browsers/profiles connect, the newest relay becomes the
responder and an older relay may be displaced. This is the known v1 limitation
and this document is how the design handles it.

It is **not only** a Chrome-vs-Firefox problem. Several copies of the host can
exist on one machine:

- Chrome **and** Firefox both running Monocle.
- Multiple **profiles** in the same browser (each spawns its own host).
- Different **channels/builds** — stable, Dev, an unpacked development load.

---

## v1: assume one active browser relay

v1 keeps this deliberately simple (a single instance is the common case and what
the user signed off on):

- The daemon binds a **fixed port** and writes `~/.monocle/bridge.json`.
- Relays connect to the daemon over a Unix-domain socket.
- The daemon stores one active relay; a newer relay can replace the older one.
- The external app talks to whichever browser relay is currently active. It
  cannot pick.

This is a documented limitation, not a silent failure. `GET /status` tells the
app whether a browser relay is currently connected, and the protocol `status` /
`meta/info` responses identify the browser that answered.

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

## v2: instance registry + selection

When multi-instance becomes a real need (and to power a Raycast "choose your
browser" setting), v1's single-active-relay model is replaced by discovery:

- Each host binds an **ephemeral** port and writes a small registration file to a
  well-known directory, e.g. `~/.monocle/instances/<id>.json`:

  ```jsonc
  {
    "id": "chrome-default",
    "browser": "chrome",
    "profile": "Default",
    "channel": "stable",
    "port": 49621,
    "extensionVersion": "0.1.0",
    "updatedAt": "2026-06-18T10:00:00Z"
  }
  ```

- Hosts remove their file on clean shutdown; the app treats stale files (old
  `updatedAt`, unreachable port) as dead.
- The app **enumerates** the directory, shows the live instances, and lets the
  user pick which to query. The Raycast extension persists the choice as a
  setting.

Pairing and tokens are **per instance** in this model — a token minted by Chrome's
host is not valid against Firefox's. The registry only handles discovery and
selection; auth is unchanged.

This is the cleanest way to handle N browsers/profiles without a shared daemon,
and it degrades gracefully: with one instance running, the list has one entry.

---

## Related docs

- [native-host.md](./native-host.md) — port binding and the host binary.
- [protocol.md](./protocol.md) — the `status` method.
- [roadmap.md](./roadmap.md) — where v2 selection sits in the phasing.
