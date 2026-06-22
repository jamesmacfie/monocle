# Raycast extension

> **Status: implemented as `apps/raycast`, private/dev-mode.**
> Documents the *client* side of the native messaging bridge. Protocol behavior is
> owned by [`../native-messaging/`](../native-messaging/README.md); the shared
> TypeScript wire contract lives in `packages/native-bridge-protocol`. Canonical
> build status lives in the project `CLAUDE.md`.

## What we are building

A Raycast extension that, once paired with a running Monocle browser, lets you search and run the
**active tab's** Monocle commands from Raycast:

1. Install the extension in Raycast in development mode → "Monocle" appears in Raycast's root search.
2. Open it and type → Raycast shows the active tab's command suggestions as list items.
3. Drill into groups (`History`, `Bookmarks`, …) the same way you would in the Monocle palette.
4. Select a command → it executes back in the browser via the bridge, and any value it produces
   (a copied URL, a generated UUID) comes back into Raycast.

When more than one browser is connected, Raycast shows a browser picker and keys
its token per browser; with one it goes straight in.

The bridge contract is complete for this. The app lives under `apps/raycast/`
and depends on the runtime prerequisites in [`setup.md`](./setup.md).

## Locked decisions

- **Tooling — isolated, like `apps/bridge`.** `apps/raycast` is excluded from
  the pnpm workspace and uses the Raycast `ray` CLI. Root convenience scripts
  (`dev:raycast` / `build:raycast`) delegate in with `pnpm --dir apps/raycast`.
  Keep the app isolated unless a future build pass proves Raycast's bundler is happy
  inside pnpm's workspace layout. See [`setup.md`](./setup.md).
- **Distribution — dev-mode / private only.** Loaded locally via `pnpm run dev:raycast`. Raycast Store
  rules (icon specs, lint gates, review) are noted but are not a blocker.

## Raycast facts verified externally

Checked against Raycast's developer docs on 2026-06-18:

- Raycast extensions are TypeScript/React/Node projects; current prerequisites are Raycast
  1.26.0+, **Node 22.14+**, and npm 7+.
- Development is local: `pnpm run dev:raycast` runs `ray develop`, registers the
  extension in Raycast, and hot-reloads it.
- Commands are files under `src/`; each `commands[].name` in the manifest maps to
  `src/<name>.tsx`/`.ts`.
- `view` commands render Raycast UI (`List`, `Form`, `Detail`). `no-view` is for direct side effects
  without a main view, so this extension's search and pairing commands stay `view`.
- The runtime is Node and is not further sandboxed for networking/file I/O, so a Node
  client can call the local loopback bridge. Raycast documents password preferences and
  `LocalStorage` as stored in its local encrypted database and scoped to the owning extension.

References: Raycast [Getting Started](https://developers.raycast.com/basics/getting-started),
[Create Your First Extension](https://developers.raycast.com/basics/create-your-first-extension),
[File Structure](https://developers.raycast.com/information/file-structure),
[Manifest](https://developers.raycast.com/information/manifest),
[Security](https://developers.raycast.com/information/security),
[Preferences](https://developers.raycast.com/api-reference/preferences), and
[Storage](https://developers.raycast.com/api-reference/storage).

## Reading order

| # | Doc | What it covers |
|---|-----|----------------|
| 1 | [architecture.md](./architecture.md) | The four actors (Raycast → bridge daemon → relay → extension → active tab), the multi-browser routing model, and the end-to-end search+execute flow. |
| 2 | [setup.md](./setup.md) | Project setup: layout, the `package.json` manifest, the `ray` dev/build workflow, monorepo isolation, and the runtime prerequisites checklist. |
| 3 | [protocol-client.md](./protocol-client.md) | The HTTP client: envelope, transport rules (incl. `X-Monocle-Target`), port discovery, `GET /instances`, every method, every error code. |
| 4 | [pairing.md](./pairing.md) | Direction-B pairing (`pair/request` → human types the code in the browser → `pair/poll-status` → token), per-browser tokens, and the preferences-vs-`LocalStorage` split. |
| 5 | [suggestions-and-navigation.md](./suggestions-and-navigation.md) | `ExternalSuggestion` → `List.Item` mapping, `type`-driven action routing, icon mapping, and nested drill-in via `suggestions/get-children`. |
| 6 | [execution.md](./execution.md) | Running a command via `commands/execute`, the `confirmAction` confirm contract, and handling the result. |
| 7 | [testing-and-troubleshooting.md](./testing-and-troubleshooting.md) | End-to-end checklist + `curl` snippets + a symptom→cause table. |

## Relationship to the native-messaging docs

The native-messaging folder is the protocol authority. This folder never re-defines a wire shape; it
links to the source:

- Protocol envelope + methods: [`../native-messaging/protocol.md`](../native-messaging/protocol.md)
- Pairing + auth + threat model: [`../native-messaging/authentication-and-security.md`](../native-messaging/authentication-and-security.md)
- Command execution (v2): [`../native-messaging/execution.md`](../native-messaging/execution.md)
- The host app (daemon/relay, ports, discovery): [`../native-messaging/bridge-app-prd.md`](../native-messaging/bridge-app-prd.md)
- Source of truth for types: `packages/native-bridge-protocol/src/wire.ts`

## Handoff boundaries

The Raycast app stays a client of the implemented bridge contract:

| Component | Developer entry point | Exit/interface it owns | Should not own |
|---|---|---|---|
| Raycast extension (`apps/raycast`) | `src/search-monocle.tsx`, `src/pair-monocle.tsx`, `src/lib/*` | `GET /status`, `GET /instances`, and `POST /` over `http://127.0.0.1:<port>`; `Authorization: Bearer <token>` + `X-Monocle-Target` headers; choosing the target browser; Raycast `LocalStorage` for per-browser tokens + instance id | Monocle command resolution, token minting, browser permission checks |
| Native bridge daemon (`apps/bridge`) | already built | Loopback HTTP, discovery file `~/.monocle/bridge.json`, UDS `~/.monocle/bridge.sock`, multi-relay tracking + `X-Monocle-Target` routing, bearer-token injection into the envelope | Monocle command logic, token persistence, pairing decisions |
| Relay/native messaging | already built | Browser-spawned stdio pipe to `chrome.runtime.connectNative("com.monocle.bridge")` | Caller UI, auth policy |
| Monocle extension (`apps/extension`) | already built `background/features/nativeMessaging/*` | Protocol validation, Direction-B pairing (code on the Integrations page), token hashes, active-tab suggestions/search/children/execute | Raycast UI or local HTTP transport |

If implementation discovers a missing capability, update `docs/native-messaging/protocol.md` first,
then the bridge/extension code, then this folder. Do not silently invent Raycast-only protocol fields.

## Definition of done

A developer can call the Raycast extension complete when:

1. `apps/raycast` exists as an isolated Raycast extension and root scripts can run
   `dev:raycast` / `build:raycast` without enrolling it in pnpm/Turbo's default extension tasks.
2. `Search Monocle` lists connected browsers (`GET /instances`), shows a picker when ≥2 (skips it for
   one), then renders active-tab root suggestions, server-side search, nested `group`/`search` pages,
   empty/error states, and permission/type accessories.
3. `Pair Monocle` completes Direction-B pairing (`pair/request` → the human types the displayed code
   on the browser's Integrations page → `pair/poll-status` returns the token once), stores only the
   per-browser token (`monocle.token.<browserId>`) and stable `instanceId` in Raycast `LocalStorage`,
   and re-pairs cleanly after `unauthorized` / `forbidden_scope`.
4. `commands/execute` is offered only when `meta/info.executionEnabled` allows it, confirms
   `confirmAction` commands before sending `confirmed:true`, handles `value`/`focused`/silent results
   correctly, and maps all bridge errors to calm Raycast feedback.
5. Manual verification covers daemon health, the browser picker (≥2 browsers), pairing, list/search,
   drill-in, execute, token revocation, `Origin` rejection, and no-browser/bridge-off/incognito states
   per [`testing-and-troubleshooting.md`](./testing-and-troubleshooting.md).
