# Raycast extension

> **Status: design-only. No Raycast client exists yet.**
> This folder is the build spec for a Raycast extension that drives Monocle through the native
> messaging bridge. It describes the *client* side; the *protocol* it speaks is owned by
> [`../native-messaging/`](../native-messaging/README.md) and is the source of truth for any wire
> shape quoted here. Canonical build status lives in the project `CLAUDE.md`.

## What we are building

A Raycast extension that, once paired with a running Monocle browser, lets you search and run the
**active tab's** Monocle commands from Raycast:

1. Install the extension in Raycast in development mode → "Monocle" appears in Raycast's root search.
2. Open it and type → Raycast shows the active tab's command suggestions as list items.
3. Drill into groups (`History`, `Bookmarks`, …) the same way you would in the Monocle palette.
4. Select a command → it executes back in the browser via the bridge, and any value it produces
   (a copied URL, a generated UUID) comes back into Raycast.

The bridge contract is already complete for this. **This work adds no protocol or extension code** —
it is a new, isolated app under `apps/raycast/` plus the few user-side prerequisites in
[`bridge-and-extension-prerequisites.md`](./bridge-and-extension-prerequisites.md).

## Locked decisions

- **Tooling — isolated, like `apps/bridge`.** `apps/raycast` is excluded from the pnpm workspace and
  managed with **npm + the `ray` CLI**. Raycast's current docs scaffold extensions with
  `package-lock.json`, `npm install`, and `npm run dev`; keep that project isolated unless a future
  build pass proves Raycast's bundler is happy inside pnpm's workspace layout. Root convenience
  scripts (`dev:raycast` / `build:raycast`) delegate in. See
  [`getting-started.md`](./getting-started.md).
- **Distribution — dev-mode / private only.** We load it locally via `npm run dev`. Raycast Store
  rules (icon specs, lint gates, review) are noted but are not a blocker.

## Raycast facts verified externally

Checked against Raycast's developer docs on 2026-06-18:

- Raycast extensions are TypeScript/React/Node projects and the current prerequisites are Raycast
  1.26.0+, **Node 22.14+**, and npm 7+.
- Development is local: scaffold with **Create Extension**, then run `npm install && npm run dev`;
  `npm run dev` registers the extension in Raycast and hot-reloads it.
- Commands are files under `src/`; each `commands[].name` in the manifest maps to
  `src/<name>.tsx`/`.ts`.
- `view` commands render Raycast UI (`List`, `Form`, `Detail`). `no-view` is for commands that
  perform a direct side effect without a main view, so this extension's search and pairing commands
  stay `view`.
- Raycast extension runtime is Node and is not further sandboxed for networking/file I/O, so a Node
  client can call the local loopback bridge. Raycast APIs expose feedback primitives, preferences,
  and `LocalStorage`; Raycast documents password preferences and local storage as stored in its
  local encrypted database and scoped to the owning extension.

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
| 1 | [architecture.md](./architecture.md) | The four actors (Raycast → bridge daemon → relay → extension → active tab) and the end-to-end search+execute flow. |
| 2 | [getting-started.md](./getting-started.md) | Scaffolding, the npm/`ray` workflow, dev-mode install, monorepo isolation, pnpm/turbo wiring. |
| 3 | [manifest.md](./manifest.md) | The `package.json` manifest: commands, preferences, icon. |
| 4 | [protocol-client.md](./protocol-client.md) | The HTTP client: envelope, transport rules, port discovery, every method, every error code. |
| 5 | [pairing.md](./pairing.md) | The pairing command and data flow: `pair/request` → browser modal → code → `pair/submit-code` → token. |
| 6 | [suggestions-and-mapping.md](./suggestions-and-mapping.md) | `ExternalSuggestion` → `List.Item`, `type`-driven action routing, icon mapping. |
| 7 | [nested-navigation.md](./nested-navigation.md) | Rendering nested command groups via `suggestions/get-children` and a navigation stack. |
| 8 | [execution.md](./execution.md) | Running a command via `commands/execute` and handling the result. |
| 9 | [settings-and-storage.md](./settings-and-storage.md) | Preferences vs `LocalStorage`: what lives where. |
| 10 | [bridge-and-extension-prerequisites.md](./bridge-and-extension-prerequisites.md) | What the user/dev must enable; no protocol changes required. |
| 11 | [testing-and-troubleshooting.md](./testing-and-troubleshooting.md) | End-to-end checklist + `curl` snippets + a symptom→cause table. |

## Relationship to the native-messaging docs

The native-messaging folder is the protocol authority. This folder never re-defines a wire shape;
it links to the source. Key references:

- Protocol envelope + methods: [`../native-messaging/protocol.md`](../native-messaging/protocol.md)
- Pairing + auth + threat model: [`../native-messaging/authentication-and-security.md`](../native-messaging/authentication-and-security.md)
- Command execution (v2): [`../native-messaging/execution.md`](../native-messaging/execution.md)
- The host app (daemon/relay, ports, discovery): [`../native-messaging/bridge-app-prd.md`](../native-messaging/bridge-app-prd.md)
- Source of truth for types: `apps/extension/shared/types/nativeMessaging.ts`

## Handoff boundaries

The Raycast build should add **one new app** and avoid touching the implemented bridge contract:

| Component | Developer entry point | Exit/interface it owns | Should not own |
|---|---|---|---|
| Raycast extension (`apps/raycast`) | `src/search-monocle.tsx`, `src/pair-monocle.tsx`, `src/lib/*` | `GET /status` and `POST /` over `http://127.0.0.1:<port>`; `Authorization: Bearer <token>` header; Raycast `LocalStorage` for token/instance id | Monocle command resolution, token minting, browser permission checks |
| Native bridge daemon (`apps/bridge`) | already built | Loopback HTTP, discovery file `~/.monocle/bridge.json`, UDS `~/.monocle/bridge.sock`, bearer-token injection into the envelope | Monocle command logic, token persistence, pairing decisions |
| Relay/native messaging | already built | Browser-spawned stdio pipe to `chrome.runtime.connectNative("com.monocle.bridge")` | Caller UI, auth policy |
| Monocle extension (`apps/extension`) | already built `background/features/nativeMessaging/*` | Protocol validation, pairing modal, token hashes, active-tab suggestions/search/children/execute | Raycast UI or local HTTP transport |

If implementation discovers a missing capability, update `docs/native-messaging/protocol.md` first,
then the bridge/extension code, then this folder. Do not silently invent Raycast-only protocol fields.

## Definition of done

A developer can call the Raycast extension complete when:

1. `apps/raycast` exists as an npm-managed Raycast extension and root scripts can run
   `dev:raycast` / `build:raycast` without enrolling it in pnpm/Turbo's default extension tasks.
2. `Search Monocle` renders active-tab root suggestions, server-side search, nested
   `group`/`search` pages, empty/error states, and permission/type accessories.
3. `Pair Monocle` completes `pair/request` → browser modal → `pair/submit-code`, stores only the
   token and stable `instanceId` in Raycast `LocalStorage`, and re-pairs cleanly after
   `unauthorized` / `forbidden_scope`.
4. `commands/execute` is offered only when `meta/info.executionEnabled` allows it, handles
   `value`/`focused`/silent results correctly, and maps all bridge errors to calm Raycast feedback.
5. Manual verification covers daemon health, pairing, list/search, drill-in, execute, token
   revocation, `Origin` rejection, no-browser/bridge-off states, incognito, and the no-surface-host
   pairing caveat in [`testing-and-troubleshooting.md`](./testing-and-troubleshooting.md).
