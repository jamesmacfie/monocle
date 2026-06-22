# Setup

> **Status: implemented.** The `apps/raycast/` directory exists. This is the
> project-setup doc for the in-repo Raycast client: layout, the manifest, the
> `ray` dev/build workflow, monorepo isolation, and the runtime prerequisites
> the bridge/extension must satisfy before suggestions return.

## Prerequisites

- Raycast installed (macOS).
- Raycast signed in. The built-in **Create Extension** / **Import Extension**
  development commands require a signed-in Raycast account.
- Node **22.14+** (current Raycast extension-tooling requirement).
- The Monocle Bridge app running, and the extension's bridge enabled and paired
  — see [Runtime prerequisites](#runtime-prerequisites) below. You can build and
  run the Raycast extension before pairing, but suggestions only return once
  paired.

## Layout

The parts that matter:

```text
apps/raycast/
├── package.json          # The Raycast manifest (commands, preferences) — see "Manifest" below
├── tsconfig.json
├── eslint.config.js
├── assets/               # Raycast extension icon
├── src/
│   ├── search-monocle.tsx   # entry for the `search-monocle` command (List view)
│   ├── pair-monocle.tsx     # entry for the `pair-monocle` command (Detail view)
│   ├── components/
│   │   ├── BrowserCommands.tsx # one connected browser's active-tab command list
│   │   ├── BrowserPicker.tsx   # "choose a browser" list, shared by both entries
│   │   ├── CommandList.tsx     # nested group/search pages (recursive)
│   │   └── CommandRow.tsx      # ExternalSuggestion -> List.Item
│   └── lib/
│       ├── bridge.ts        # HTTP client + GET /instances (protocol-client.md)
│       ├── auth.ts          # per-browser token + instanceId in LocalStorage (pairing.md)
│       ├── execute.ts       # commands/execute result handling (execution.md)
│       ├── types.ts         # Raycast prefs + re-exported protocol type shim
│       └── icons.ts         # Lucide-name → Raycast Icon map (suggestions-and-navigation.md)
└── node_modules/         # local Raycast app dependencies
```

Each `commands[].name` in `package.json` maps to a `src/<name>.tsx` file whose
default export is the command component.

## Manifest (`package.json`)

The Raycast manifest is a superset of npm's `package.json`, at
`apps/raycast/package.json`. Field reference:
<https://developers.raycast.com/information/manifest>.

```jsonc
{
  "$schema": "https://www.raycast.com/schemas/extension.json",
  "name": "monocle",
  "title": "Monocle",
  "description": "Search and run the active browser tab's Monocle commands from Raycast.",
  "icon": "monocle-icon.png",            // assets/monocle-icon.png
  "author": "james_macfie",
  "categories": ["Productivity", "Web"],
  "license": "MIT",
  "platforms": ["macOS"],
  "commands": [
    {
      "name": "search-monocle",          // → src/search-monocle.tsx
      "title": "Search Monocle",
      "subtitle": "Active browser tab",
      "description": "List and run the active tab's Monocle commands.",
      "mode": "view"
    },
    {
      "name": "pair-monocle",            // → src/pair-monocle.tsx
      "title": "Pair Monocle",
      "subtitle": "Connect to the browser",
      "description": "Pair Raycast with a running Monocle browser via the native bridge.",
      "mode": "view"
    }
  ],
  "preferences": [
    {
      "name": "port",
      "type": "textfield",
      "required": false,
      "title": "Bridge port",
      "description": "Loopback port the Monocle Bridge listens on. Leave blank to auto-discover from ~/.monocle/bridge.json (default 8765).",
      "default": "8765"
    },
    {
      "name": "host",
      "type": "textfield",
      "required": false,
      "title": "Bridge host",
      "description": "Loopback host. Almost always 127.0.0.1.",
      "default": "127.0.0.1"
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.99.0",
    "@raycast/utils": "^1.19.0"
  },
  "scripts": {
    "dev": "ray develop",
    "build": "ray build",
    "lint": "ray lint",
    "fix-lint": "ray lint --fix"
  }
}
```

**Commands.** Two `view`-mode commands:

- `search-monocle` — the main `List` view. Asks the daemon which browsers are
  connected, then renders one browser's active-tab suggestions, drills into
  groups, and executes. See [suggestions-and-navigation.md](./suggestions-and-navigation.md)
  and [execution.md](./execution.md).
- `pair-monocle` — a `Detail` view that runs the pairing handshake. See
  [pairing.md](./pairing.md).

`mode` is `"view"` for both (they render UI). `name` maps 1:1 to the entry file
in `src/`.

**Preferences (extension-level).** `port` and `host` are user-editable,
non-secret connection settings. They are inherited by every command. Read them
with `getPreferenceValues<Prefs>()`; the app keeps a small local `Prefs` type in
`src/lib/types.ts` so bare TypeScript checks work without relying on generated
Raycast env types. Commands inherit extension preferences and may override an
entry with the same `name`; `port`/`host` stay at the extension level so both
commands share one connection config.

> The **token and `instanceId` are NOT preferences.** Secrets and derived ids
> belong in `LocalStorage` (encrypted, not user-editable, never logged), not in
> plain-text preferences. Tokens are stored per-browser (`monocle.token.<browserId>`)
> and `instanceId` once (`monocle.instanceId`). See [pairing.md](./pairing.md).

**Icon.** A PNG in `assets/`, referenced by filename. This is the *extension*
icon shown in Raycast; per-row icons come from suggestion data — see
[suggestions-and-navigation.md](./suggestions-and-navigation.md).

**Distribution — dev-mode / private only.** Loaded locally via
`pnpm run dev:raycast`. The Store-required fields (screenshots, strict
categories, `ray lint` passing clean) are not gates. Keep `ray lint` roughly
clean anyway so the build stays healthy; a future Store submission would add an
icon/screenshot/review pass.

## Develop

From the repo root, use the wrapper scripts:

```bash
pnpm run dev:raycast       # ray develop: builds + hot-reloads, registers the extension in dev mode
pnpm run build:raycast     # ray build
```

Inside `apps/raycast`, the underlying package scripts remain the Raycast CLI
commands (`ray develop`, `ray build`, `ray lint`). Prefer the root
`pnpm run *:raycast` wrappers from the repo root.

`pnpm run dev:raycast` (`ray develop`):

- Builds the extension and registers it in Raycast's root search at the top
  (dev extensions are marked as such).
- Hot-reloads on save; surfaces TypeScript/lint errors in the terminal.
- `⌃C` stops the dev server. **The extension stays installed** — its commands
  remain in Raycast's root search; you just lose hot reload until you restart
  the dev script.

`pnpm run build:raycast` (`ray build`) produces a production build (for a
store/zip artifact).

## Monorepo isolation

Monocle is a pnpm + Turborepo monorepo. The Raycast extension stays
**isolated**: enrolling it under `apps/*` would make root pnpm/Turbo commands
treat it like a normal workspace package. This mirrors the bridge's isolation,
but Raycast is excluded entirely from pnpm's workspace graph.

**1. Exclude it from the pnpm workspace** (`pnpm-workspace.yaml`). The repo
uses explicit app entries with the Raycast app negated:

```yaml
packages:
  - apps/extension
  - apps/bridge
  - "!apps/raycast"   # Raycast app, isolated from the pnpm workspace
  - packages/*
```

> Without the exclusion, pnpm would adopt `apps/raycast`. Excluding it keeps the
> Raycast toolchain out of default workspace checks. (`apps/marketing` is
> already a non-workspace dir, so the precedent for "an app pnpm doesn't manage"
> exists.)

**2. Root convenience scripts** (`package.json`), mirroring
`dev:bridge`/`build:bridge`. These shell into the dir rather than going through
Turbo:

```jsonc
{
  "scripts": {
    "dev:raycast": "pnpm --dir apps/raycast run dev",
    "build:raycast": "pnpm --dir apps/raycast run build"
  }
}
```

**3. Keep it out of the Turbo pipeline.** Do not add a `@monocle/raycast` entry
to `turbo.json`'s default `build`/`test`/`tsc` tasks. Its lint/build run only
via the isolated `*:raycast` scripts (exactly how the bridge's cargo tasks are
isolated). `pnpm run build` / `pnpm test` / `pnpm run tsc` at the repo root must
not invoke the Raycast toolchain.

**`.gitignore`.** The root `node_modules` ignore already catches nested
`node_modules/` directories. Keep the scaffolded `apps/raycast/.gitignore` and
add Raycast-specific build/cache output there if the scaffold does not already
cover it.

## Runtime prerequisites

No protocol or bridge changes are required — the bridge contract already covers
everything the Raycast client needs (read suggestions, nested navigation via
`suggestions/get-children`, execute + return values via `commands/execute`, and
Direction-B pairing). The Raycast app uses this contract without new code in
`apps/bridge` or `apps/extension/background/features/nativeMessaging/`. Runtime
success still depends on the user-side toggles below.

For the extension to return suggestions and run commands, these must be true at
runtime:

1. **Monocle Bridge app installed and running** (`apps/bridge`). It owns the
   loopback server on `127.0.0.1:8765` and writes `~/.monocle/bridge.json`.
   Without it, the client's `fetch` gets `ECONNREFUSED`.
2. **The bridge feature enabled in the extension.** It is **off by default**.
   The user enables it in the extension's settings (this also requests the
   `nativeMessaging` + `tabs` permissions). While off, pairing and suggestion
   calls return `not_enabled`.
3. **Paired** (once per browser). See [pairing.md](./pairing.md). Pairing only
   needs the browser's **Integrations** settings page open to type the code — no
   special active tab is required.
4. **For execution only:** the global **Allow command execution** opt-in toggled
   on in the extension settings. Off by default. While off, `commands/execute`
   returns `execution_disabled` even though the token carries the
   `commands:execute` scope. Probe `meta/info.executionEnabled` to reflect this
   in the UI ([execution.md](./execution.md)).

## Caveats inherited from the bridge (not client work, but worth knowing)

- **Commands return values only if annotated.** A command returns a `value` over
  the bridge only if its definition sets `external.result: "value"` (and
  `focusBrowser` for focus-and-act). Annotating the full catalog is **ongoing
  extension-side work** — see
  [`../native-messaging/execution.md`](../native-messaging/execution.md). Until
  annotated, `commands/execute` still runs the command (`ran:true`) but won't
  return data / raise the window. Treat a missing `value`/`focused` as the
  "silent side-effect" shape, not a bug.
- **Chrome `key` pin / dev-load.** On Firefox the host manifest's
  allowed-extension id is stable. On Chrome the extension id isn't pinned yet, so
  the native-host manifest's `allowed_origins` may not match an unpacked dev
  build until a `key` is set
  ([`../native-messaging/extension-integration.md`](../native-messaging/extension-integration.md)).
  A Chrome dev build's bridge "won't connect" is usually this, not a Raycast
  issue.
- **Multi-browser is implemented, browser-type-only.** The daemon tracks all
  connected relays and the client picks which browser answers (see
  [architecture.md](./architecture.md)). Identity is browser-TYPE-only
  (profiles/channels collapse, last relay wins); profile-level selection is still
  deferred ([`../native-messaging/multi-instance.md`](../native-messaging/multi-instance.md)).
- **Site-SDK commands absent**; **incognito excluded**. Both are documented v1
  gaps ([architecture.md](./architecture.md)).

## Quick "is the environment ready?" sequence

The client can self-diagnose on startup:

1. `GET /status` (daemon) reachable? No → "Start the Monocle Bridge app."
   (`ECONNREFUSED`)
2. `GET /instances` returns ≥1 browser (or `status.connected` /
   `meta/info.bridgeEnabled` true)? No → "Open your browser and enable the
   Monocle bridge."
3. Token in `LocalStorage` for that browser? No → prompt to pair.
4. Want to run commands and `meta/info.executionEnabled` false? → "Enable *Allow
   command execution* in Monocle settings."
