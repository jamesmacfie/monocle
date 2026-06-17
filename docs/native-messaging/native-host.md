# The native host

> **Status: proposed (v1 design).** Not yet built.

The native host is a small native binary that lives **outside the extension
bundle**. The browser launches it when the extension calls
`runtime.connectNative("com.monocle.bridge")`, exchanges JSON with it over
stdio, and the host additionally runs a loopback HTTP server the external app
calls. This document covers the host manifest, per-OS registration, the stdio
framing, and the loopback server's transport rules.

The host holds **no Monocle logic** — it is a relay with a transport gate. All
authentication and suggestion-building happen in the extension background.

---

## Host manifest

Native messaging requires a JSON manifest, named after the host
(`com.monocle.bridge.json`), that points at the binary and lists which extensions
may connect. The browsers differ in one field:

```jsonc
// Chrome / Edge
{
  "name": "com.monocle.bridge",
  "description": "Monocle native messaging bridge",
  "path": "/absolute/path/to/monocle-bridge",   // absolute on macOS/Linux
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
}
```

```jsonc
// Firefox
{
  "name": "com.monocle.bridge",
  "description": "Monocle native messaging bridge",
  "path": "/absolute/path/to/monocle-bridge",
  "type": "stdio",
  "allowed_extensions": ["ff@monocle.com"]
}
```

- **Chrome/Edge** gate by `allowed_origins`, which embeds the **extension ID**.
  Monocle does not currently pin a Chrome `key` in `wxt.config.ts`, so the ID is
  assigned by the store / install and is **not stable across unpacked dev loads**.
  Pin a `key` (and thus a deterministic ID) before shipping, or the manifest's
  `allowed_origins` will not match a dev build. See
  [extension-integration.md](./extension-integration.md).
- **Firefox** gates by `allowed_extensions`, which uses the add-on ID. Monocle
  already declares `browser_specific_settings.gecko.id = "ff@monocle.com"`
  (`wxt.config.ts`), so this value is stable today.

---

## Registration paths

The browser finds the manifest by a per-OS, per-browser convention. `path` must
be **absolute** on macOS and Linux; on Windows it may be relative to the manifest
and registration is via the registry.

| OS | Chrome | Firefox |
| --- | --- | --- |
| **macOS** | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.monocle.bridge.json` | `~/Library/Application Support/Mozilla/NativeMessagingHosts/com.monocle.bridge.json` |
| **Linux** | `~/.config/google-chrome/NativeMessagingHosts/com.monocle.bridge.json` | `~/.mozilla/native-messaging-hosts/com.monocle.bridge.json` |
| **Windows** | Registry key `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.monocle.bridge` → manifest path | Registry key `HKCU\Software\Mozilla\NativeMessagingHosts\com.monocle.bridge` → manifest path |

(System-wide variants exist under `HKLM` / `/Library/...` / `/etc/...`; v1 uses
per-user install.) An installer ships the binary and writes the right manifest to
the right locations for the browsers present.

---

## Stdio framing

Native messaging frames each JSON message with a **32-bit length prefix in the
machine's native byte order** (not a fixed endianness), followed by the UTF-8
JSON body:

```text
[ uint32 length, native byte order ][ UTF-8 JSON body of exactly that length ]
```

Size caps (per Chrome's documentation):

- **host → browser**: a single message is capped at **1 MB**. Suggestion
  responses must stay under this — page large result sets and cap the count
  (the protocol's `limit` field; see [protocol.md](./protocol.md)).
- **browser → host**: a much larger cap (multi-GB). Requests are tiny, so this is
  never a concern.

The host reads the same framing from the app side conceptually, but the app↔host
link is HTTP (below), so the host translates HTTP bodies to/from stdio frames.

---

## Loopback server

The host binds an HTTP server on **`127.0.0.1` only** (never `0.0.0.0`) on a
fixed v1 port. Transport rules enforced by the host before anything reaches the
extension:

- Require method **`POST`** (reject `GET` on data routes; allow `GET /status`).
- Require `Content-Type: application/json`.
- Require an `Authorization: Bearer <token>` header on authenticated routes.
- **Reject requests carrying a browser `Origin` header** by default — this blocks
  web pages from driving the bridge via loopback `fetch`. No permissive CORS
  headers are ever sent.
- Expose only the narrow route set defined in [protocol.md](./protocol.md).

These are necessary-but-not-sufficient; the real authorization is the bearer
token checked in the background. See
[authentication-and-security.md](./authentication-and-security.md) for the threat
model and the signed-request upgrade path.

---

## Install and distribution (v1)

v1 ships the host as a **manually installed** artifact (a downloaded installer or
a Raycast-extension-bundled helper) that writes the manifest(s) and binary. The
binary must be code-signed/notarized on macOS to run without Gatekeeper friction.
Auto-update and signing pipeline are a v2 concern — see [roadmap.md](./roadmap.md).

---

## Related docs

- [architecture.md](./architecture.md) — where the host sits in the system.
- [protocol.md](./protocol.md) — the routes the loopback server exposes.
- [multi-instance.md](./multi-instance.md) — what happens when two browsers each
  launch a host.

External references: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
[MDN native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging),
[MDN native manifests](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests).
