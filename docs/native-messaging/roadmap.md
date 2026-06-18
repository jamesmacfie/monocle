# Roadmap and open questions

> **Status: extension side built; bridge app M0+M1 built (macOS).** The host now
> lives at `apps/bridge` (Tauri daemon+relay). Remaining v1 work is the real
> end-to-end smoke test, the Chrome `key` pin, and signing; M2–M4 (cross-platform,
> distribution, multi-instance) are still ahead.

Phasing for the bridge, and the decisions still to settle before/while building.

---

## v1 — the smoke-test integration

- Native-messaging host + loopback server — **built** as the Monocle Bridge Tauri
  app (`apps/bridge`, macOS): auto-registers manifests, daemon owns the loopback
  port + relay UDS, browser-spawned relay pumps stdio⇄UDS.
- Opt-in toggle, off by default.
- Bluetooth-style pairing with a scoped, hashed, revocable bearer token.
- Read-only suggestions for the active tab: `suggestions/get-for-active-tab`
  (root) and `suggestions/search-active-tab` (query).
- `meta/info` + `status` for capability/identity discovery.
- Single reachable instance (first-to-bind); `status` reports who that is.
- **Excluded:** command execution, site-SDK commands, incognito windows,
  multi-instance selection.

Goal: a Raycast extension can pair once and list/search the active tab's commands.

## v2 — a useful integration

- **Multi-instance selection**: the instance registry + per-instance pairing, and
  a Raycast setting to choose the browser/profile (see
  [multi-instance.md](./multi-instance.md)).
- **The Raycast extension itself** (new isolated `apps/raycast` app): pairing UI,
  suggestion list/search views, nested navigation, execution result handling, and
  eventually an instance picker.
- **Command execution** through the bridge — **built (extension side)**, see
  [execution.md](./execution.md). Done: the `external` config field on
  `CommandNodeBase`; the bridge execution policy (`runCommandPolicy` extended
  with `executionMode`); the widened `CommandExecutor`/`CommandResult` + the
  `clipboardDelivery` produce-and-return seam; the `commands:execute` scope +
  `commands/execute` method + the global **Allow execution** opt-in; and a
  representative catalog annotation (copy family `result:"value"`, a focus-and-act
  example, deny on UI commands — default-allow covers the rest). Remaining:
  finish annotating the full catalog, a **user-facing** per-command opt-out
  (stored in `monocle-settings` like `hidden`), and a surface-modal path for
  `confirmAction` confirmation.
- **Site-SDK inclusion** by reconstructing a top-frame tab scope so bridge results
  match the palette (the [architecture.md](./architecture.md) gap).
- **Signed-request auth** (client key pair) if local-malware/token-theft is in
  scope (see [authentication-and-security.md](./authentication-and-security.md)).
- **Host distribution**: signed/notarized installer and auto-update.

---

## Open questions

- **`nativeMessaging`: optional or required?** Can it live in
  `optional_permissions` (requested on enable, off the default warning) or must it
  be a required permission with an always-visible warning? Resolve against current
  Chrome/Firefox rules; prefer optional to match the opt-in posture.
- **Chrome extension ID stability.** A `key` must be pinned in `wxt.config.ts` so
  the host manifest's `allowed_origins` matches; decide the key/ID strategy for
  dev vs store builds.
- **Host distribution & signing.** The host app exists (`apps/bridge`, macOS
  `.app`/`.dmg`); still open: code-signing + macOS notarization, how users install
  it (bundled with the Raycast extension? standalone installer?), and Windows/Linux
  artifacts.
- **SW-lifecycle robustness.** Confirm the persistent `connectNative` port reliably
  keeps the worker alive across browsers, and that the reconnect-on-disconnect
  path is solid.
- **Store-submission impact.** The `nativeMessaging` permission and an external
  data path interact with the single-purpose / permissions concerns tracked in
  [../store-submission.md](../store-submission.md). Confirm reviewer-notes wording
  before submitting a build that ships the bridge.
- **Result fidelity disclosure.** Decide how the app communicates that bridge
  results exclude site-SDK commands and incognito tabs, and that some command
  types are intentionally not executable from external apps.

---

## Related docs

- [README.md](./README.md) — overview and v1 scope.
- [architecture.md](./architecture.md) — the site-SDK gap and lifecycle.
- [multi-instance.md](./multi-instance.md) — the v2 registry.
- [../store-submission.md](../store-submission.md) — submission risk.
