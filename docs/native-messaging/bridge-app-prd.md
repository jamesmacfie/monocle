# PRD: Monocle Bridge — the cross-platform host app

> **Status: proposed (design).** Not yet built. This PRD specifies the **bridge
> app** — the downloadable native component that sits between the Monocle
> browser extension and an external caller (e.g. Raycast). It operationalizes
> the "host distribution & signing" open question in [roadmap.md](./roadmap.md)
> and refines the single-binary host in [native-host.md](./native-host.md).

---

## 1. Summary

The three-part bridge is **extension → bridge → caller**
([architecture.md](./architecture.md)). The extension half is built
(`apps/extension/background/features/nativeMessaging/`). The **bridge** — the
native relay that holds the loopback socket and the stdio pipe — is not, and a
browser extension fundamentally cannot ship it (MV3 can't open a socket; the
relay must be a native binary outside the browser).

This PRD proposes shipping that relay as a **minimal cross-platform tray /
menu-bar app built with Tauri**, so distribution is a normal "download and run"
rather than hand-run scripts. The app is a **dumb relay with a tray icon** — it
holds no Monocle logic, exactly as [native-host.md](./native-host.md) requires.
All real decisions (active tab, suggestions, pairing, tokens) stay in the
extension.

Target platforms: **macOS, Windows, Linux** — the extension runs on all three,
so the bridge must too.

---

## 2. Goals / Non-goals

**Goals**

- One downloadable, signed installer per OS that a non-technical user can run.
- A persistent background process the caller can always reach (so the caller
  gets "browser not connected", never "connection refused").
- Registers the native-messaging manifest(s) for every installed supported
  browser automatically, idempotently, on launch.
- A minimal tray UI: status, quit, open-at-login. No Monocle settings.
- Carries the existing wire protocol ([protocol.md](./protocol.md)) **verbatim**
  — the app never parses or understands it beyond routing by request `id`.

**Non-goals (v1 of the app)**

- No Monocle logic (no suggestion building, no pairing decision, no tokens —
  those live in the extension).
- No app window / preferences beyond the tray menu.
- No auto-update (fast-follow; see §11).
- No multi-browser *selection* UI (the app may relay one connected browser in
  v1; caller-side selection is a protocol concern — see
  [multi-instance.md](./multi-instance.md)).

---

## 3. The architecture decision (read this first)

A tray app is **persistent** (it runs until quit, survives browser restarts). A
native-messaging host is **transient** — the browser spawns a *fresh child
process per `connectNative`* from the manifest's `path` and kills it when the
port closes. `connectNative` can **never** attach to an already-running process.
These two models must be reconciled. There are two viable designs.

### Recommended: persistent daemon + a thin connectNative relay (one binary, two modes)

Split the host into a **persistent daemon** (the tray app) and a **transient
relay** the browser spawns — both are the *same binary* in different modes:

```
                       ┌─────────────────────────────────────────────┐
   caller (Raycast)    │            BRIDGE APP (one binary)           │
        │              │                                             │
        │  HTTP /      │   ┌──────────────┐   local IPC   ┌────────┐ │   stdio   ┌───────────┐
        └─127.0.0.1───►│   │  daemon mode │◄─────────────►│ relay  │◄┼──pipe────►│ extension │
                       │   │  (tray UI +  │  (UDS / pipe) │ mode   │ │connectNative (browser) │
                       │   │  loopback +  │               └────────┘ │           └───────────┘
                       │   │  router)     │  spawned by browser per  │
                       │   └──────────────┘  connectNative, exits    │
                       └─────────────────────────────────────────────┘
```

- **Daemon mode** (launched at login / by the user): shows the tray icon, owns
  the **caller-facing loopback HTTP server**, and listens on a **local IPC
  endpoint** (Unix domain socket on macOS/Linux, named pipe on Windows) for
  relays.
- **Relay mode** (launched by the browser via `connectNative`): the manifest's
  `path` points at the same binary; it detects it was spawned as a native host
  (an extension-origin argv / non-TTY stdin), connects to the daemon's IPC, and
  pumps frames **stdio ⇄ IPC** until the browser closes the pipe, then exits.

Why this is the right call:

- **Keeps the cryptographic origin binding.** Native messaging's
  `allowed_origins` / `allowed_extensions` still proves the peer is *Monocle's
  extension*. For a loopback port any local process can reach, that guarantee is
  worth the extra moving part.
- **Zero changes to the built extension** — it still calls
  `connectNative("com.monocle.bridge")` and speaks the protocol over stdio.
- **Solves multi-instance** ([multi-instance.md](./multi-instance.md)): one
  daemon owns the loopback port; every browser's relay multiplexes into it, so
  there's no "first-to-bind-wins" port fight.
- **Caller always has someone to talk to**: the daemon answers even when no
  browser is connected (returns a "no connected browser" status).

Cost: a per-OS manifest registration step (the app automates it) and the
relay/IPC plumbing. Both are bounded and one-time.

### Alternative: WebSocket daemon (extension connects out, no native messaging)

The daemon runs a loopback **WebSocket** server; the extension connects *out*
with `new WebSocket("ws://127.0.0.1:<port>")` (the SW can make outbound
connections). No manifest registration, no relay shim, no Chrome-key
dependency — a strictly simpler app.

Rejected for v1 because: it **drops the `allowed_origins` binding** (any local
process can pose as the extension, so the extension↔daemon link needs its own
auth layer), it **rewrites the extension transport** (`port.ts` becomes a WS
client — though `pump`/`pairing`/`auth`/`suggestions` are untouched), and it
re-opens the **SW-lifetime** question on Firefox. Keep it documented as the
fallback if manifest registration proves too brittle in the field.

---

## 4. Why Tauri

- **True cross-platform from one Rust/TS codebase** with native installers
  (`.dmg`/`.app`, `.msi`/`.exe`, `.deb`/`.AppImage`/`.rpm`).
- **First-class tray support** (Tauri v2 `TrayIconBuilder` + `menu`), and can run
  **window-less** (macOS `ActivationPolicy::Accessory` → no Dock icon).
- **Maintained plugins for exactly our needs**: `tauri-plugin-autostart`
  (open-at-login, all three OSes) and `tauri-plugin-single-instance` (ensure one
  daemon).
- **Small footprint** vs Electron (uses the OS webview; for a tray-only app we
  barely use a webview at all — the relay/daemon core is plain Rust + tokio).
- Native-messaging stdio framing (u32-LE length prefix + UTF-8 JSON) and
  UDS/named-pipe IPC are straightforward in Rust/tokio.

The relay path is pure Rust (no webview): `fn main()` branches on argv/stdin
*before* the Tauri runtime starts, runs a minimal async stdio⇄IPC loop, and
exits — so a browser-spawned relay never boots a GUI.

---

## 5. App responsibilities

1. **Register manifests** (the "installer" job). On launch (idempotent), detect
   installed supported browsers and write `com.monocle.bridge.json` to each
   browser's NativeMessagingHosts location, with `path` = this binary and the
   right `allowed_origins` (Chrome/Edge) / `allowed_extensions` (Firefox). See
   §8.
2. **Run the daemon**: tray icon, caller-facing loopback HTTP server (transport
   rules from [native-host.md](./native-host.md): `127.0.0.1` only, `POST`+JSON,
   reject browser `Origin`, `Authorization` passthrough), and the IPC endpoint.
3. **Relay**: when spawned by a browser, pump frames between the browser's stdio
   and the daemon; route caller requests to a connected browser and responses
   back by `id`.
4. **Report status**: which browsers are connected, the loopback port, whether
   the bridge is reachable — surfaced in the tray menu and the `status` route.
5. **Lifecycle**: open-at-login toggle, single-instance, clean quit (close
   servers, optionally leave manifests in place).

It does **not** build suggestions, decide pairing, mint/store tokens, or render
the pairing code — all of that is the extension's job and travels through the
relay as opaque JSON.

---

## 6. Tray UI (minimal)

A single tray menu. No window unless a future setting needs one.

```
Monocle Bridge
────────────────────────
● Connected: Chrome · Default        (status line, disabled)
  Listening on 127.0.0.1:8765        (status line, disabled)
────────────────────────
☑ Open at login
  Re-register browsers               (re-run manifest registration)
  Copy diagnostics                   (paste-able status for bug reports)
────────────────────────
  Quit Monocle Bridge
```

- **Status lines**: live connection state; "No browser connected" when idle.
- **Open at login**: `tauri-plugin-autostart`.
- **Re-register browsers**: re-runs §8 (for a browser installed after the app).
- **Copy diagnostics**: OS, version, registered manifests, connected browsers,
  port — no secrets.
- **Quit**: closes servers and exits; relays die with their browser ports.

Deliberately **no** pairing UI, token list, or Monocle settings — those live in
the extension's options page and the caller app.

---

## 7. What the app must NOT do

- Never see or store the bearer token in cleartext beyond passing the
  `Authorization` header through to the extension.
- Never make a pairing decision or show the code (the extension shows the modal;
  the caller types it back).
- Never call Monocle command logic. If the protocol grows, the app needs **no**
  change unless transport framing changes.

---

## 8. Manifest registration (per OS / browser)

The app writes the host manifest to the conventional location for each detected
browser (reuses the table in [native-host.md](./native-host.md)). `path` = this
app's binary (on macOS, the inner Mach-O at `…/Contents/MacOS/monocle-bridge`).

| OS | Chrome/Chromium/Edge | Firefox |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` | `~/Library/Application Support/Mozilla/NativeMessagingHosts/` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/` | `~/.mozilla/native-messaging-hosts/` |
| Windows | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.monocle.bridge` → manifest path | `HKCU\Software\Mozilla\NativeMessagingHosts\com.monocle.bridge` |

Per-user install (no admin). Registration is **idempotent** and re-run on every
launch so newly installed browsers get picked up. Uninstalling the app should
remove the manifests.

**Hard dependency:** the manifest needs the extension's ID.

- **Firefox** is stable today (`gecko.id = "ff@monocle.com"`).
- **Chrome** has no pinned ID yet — a `key` must be pinned in `wxt.config.ts`
  (the open question in [extension-integration.md](./extension-integration.md))
  *or* the app must let the user paste their Chrome extension ID (needed for
  unpacked dev loads regardless). The app should ship the known store IDs and
  allow an override.

---

## 9. Local IPC (relay ⇄ daemon)

- **Transport**: Unix domain socket (`~/.monocle/bridge.sock`) on macOS/Linux;
  named pipe (`\\.\pipe\monocle-bridge`) on Windows.
- **Discovery**: the daemon writes a small registration file (e.g.
  `~/.monocle/bridge.json`: `{ version, loopbackPort, ipcPath, pid }`) so a relay
  (and, later, the caller's instance picker) can find it — the v2 registry shape
  in [multi-instance.md](./multi-instance.md), brought forward.
- **Framing**: same length-prefixed JSON as the stdio side; the relay is a pure
  byte-pump and never inspects payloads beyond `id` for routing.
- If a relay starts and finds **no daemon** (app not running), it should fail
  cleanly so the extension's `port.onDisconnect` fires; the extension already
  logs this and can hint "Is the Monocle Bridge app running?".

---

## 10. Distribution & signing

| OS | Artifact | Signing |
| --- | --- | --- |
| macOS | `.dmg` (drag-to-Applications) | Developer ID + **notarization** (required to launch without Gatekeeper friction). |
| Windows | `.msi` / `.exe` | Authenticode code-signing (avoid SmartScreen warnings). |
| Linux | `.AppImage` + `.deb`/`.rpm` | Detached signature / repo signing (best-effort). |

Hosted as a normal download (and, longer term, bundled with / linked from the
caller — e.g. the Raycast extension's onboarding). First launch performs §8
registration.

---

## 11. Open questions

- **Chrome `key` / ID strategy** (blocks Chrome registration) — pin a key, ship
  known IDs, support a user override, or all three. See §8.
- **IPC choice** — UDS+named-pipe (recommended) vs a loopback TCP control port.
- **Auto-update** — Tauri updater vs OS package managers; signing channel.
- **Caller↔instance selection** — when 2+ browsers are connected, does the
  daemon expose them for the caller to pick (protocol `status`/registry), or
  relay a single "primary"? v1 may relay one; design the protocol now.
- **Should the app offer the WebSocket transport** (§3 alternative) as a
  fallback toggle if native-messaging registration is unreliable on some setup?
- **Uninstall hygiene** — guarantee manifests + IPC files are removed.

---

## 12. Milestones

- **M0 — spike**: Tauri tray app (macOS) that registers a Chrome manifest and
  round-trips one hardcoded message browser→relay→daemon→stdout. Proves the
  two-mode binary + IPC.
- **M1 — working relay (macOS, unsigned dev)**: full daemon (loopback HTTP +
  IPC), relay mode, one browser; Raycast-style `curl` pairs and lists commands
  end-to-end. Replaces the `test-host/` scripts.
- **M2 — cross-platform + lifecycle**: Windows + Linux; autostart,
  single-instance, tray status, re-register, clean quit.
- **M3 — distributable**: signing/notarization, installers, auto-update.
- **M4 — multi-browser**: connected-browser routing + caller instance selection.

---

## 13. Success criteria

- A user downloads one installer, runs it, and the tray icon appears; no
  terminal, no manifest editing.
- Enabling the bridge in the extension + pairing from the caller works
  end-to-end, and survives a browser restart (daemon persists).
- "Open at login" works on all three OSes; Quit cleanly stops servers.
- With the app **not** running, the extension surfaces a clear "bridge app not
  running" hint rather than a silent failure.

---

## 14. Related docs

- [README.md](./README.md) — three-part overview and current status.
- [architecture.md](./architecture.md) — why native messaging; the relay's place.
- [native-host.md](./native-host.md) — manifest, registration paths, transport
  rules, stdio framing (this app *is* that host).
- [protocol.md](./protocol.md) — the wire protocol the app carries verbatim.
- [multi-instance.md](./multi-instance.md) — the registry/selection this app's
  daemon brings forward.
- [roadmap.md](./roadmap.md) — where host distribution sits in the phasing.
- `test-host/` — the throwaway script harness this app replaces.
