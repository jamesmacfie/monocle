# Multiple instances

> **Status: proposed (v1 design).** Not yet built.

Native messaging launches **one host process per connecting extension instance**.
If Monocle is installed and running in more than one browser at once, each
browser independently calls `connectNative` and spawns its own copy of the host.
Each copy wants the same fixed loopback port — only one can bind it. This is the
known limitation of the native-messaging transport, and this document is how the
design handles it.

It is **not only** a Chrome-vs-Firefox problem. Several copies of the host can
exist on one machine:

- Chrome **and** Firefox both running Monocle.
- Multiple **profiles** in the same browser (each spawns its own host).
- Different **channels/builds** — stable, Dev, an unpacked development load.

---

## v1: assume a single reachable instance

v1 keeps this deliberately simple (a single instance is the common case and what
the user signed off on):

- The host binds a **fixed port**. **First to bind wins.**
- A second host that finds the port taken does **not** crash — it stays running
  for its own browser's stdio link (so the extension still works) but reports
  itself as **not** the port owner and serves no app traffic.
- The external app talks to whoever owns the port. It cannot pick.

This is a documented limitation, not a silent failure: the `status` endpoint
(below) lets the app **tell the user which instance it reached**, so a surprising
answer ("why are these Firefox's tabs?") is explainable rather than mysterious.

### `status` / `GET /status`

Both the host (`GET /status`, unauthenticated) and the protocol (`status` method)
expose enough identity for the app to surface what it connected to:

```jsonc
{
  "ok": true,
  "browser": "chrome",
  "profile": "Default",       // when derivable
  "channel": "stable",
  "extensionVersion": "0.0.1",
  "bridgeEnabled": true,
  "portOwner": true
}
```

The app shows this in its UI ("Connected to Chrome · Default"). If `bridgeEnabled`
is false or the port is unreachable, the app guides the user to enable the bridge.

---

## v2: instance registry + selection

When multi-instance becomes a real need (and to power the Raycast "choose your
browser" setting), v1's first-to-bind is replaced by discovery:

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
