# Getting started

> **Status: implemented.** The `apps/raycast/` directory exists. This doc is for
> running and maintaining the in-repo Raycast client.

## Prerequisites

- Raycast installed (macOS).
- Raycast signed in. The built-in **Create Extension** / **Import Extension** development commands
  require a signed-in Raycast account.
- Node **22.14+** (current Raycast extension-tooling requirement).
- The Monocle Bridge app running and the extension's bridge enabled and paired — see
  [`bridge-and-extension-prerequisites.md`](./bridge-and-extension-prerequisites.md). You can build
  and run the Raycast extension before pairing, but suggestions only return once paired.

## Layout

Current layout (the parts that matter):

```text
apps/raycast/
├── package.json          # The Raycast manifest (commands, preferences) — see manifest.md
├── tsconfig.json
├── eslint.config.js
├── assets/               # Raycast extension icon
├── src/
│   ├── search-monocle.tsx   # entry for the `search-monocle` command (List view)
│   ├── pair-monocle.tsx     # entry for the `pair-monocle` command (Form view)
│   ├── components/
│   │   ├── CommandList.tsx   # nested group/search pages
│   │   └── CommandRow.tsx    # ExternalSuggestion -> List.Item
│   └── lib/
│       ├── bridge.ts        # HTTP client (protocol-client.md)
│       ├── auth.ts          # token + instanceId in LocalStorage (pairing.md, settings-and-storage.md)
│       ├── execute.ts       # commands/execute result handling
│       ├── types.ts         # Raycast prefs + shared protocol type shim
│       └── icons.ts         # Lucide-name → Raycast Icon map (suggestions-and-mapping.md)
└── node_modules/         # local Raycast app dependencies
```

Each `commands[].name` in `package.json` maps to a `src/<name>.tsx` file whose default export is
the command component.

## Develop

From the repo root, use the wrapper scripts:

```bash
pnpm run dev:raycast       # ray develop: builds + hot-reloads, registers the extension in dev mode
pnpm run build:raycast     # ray build
```

Inside `apps/raycast`, the underlying package scripts remain the Raycast CLI
commands (`ray develop`, `ray build`, `ray lint`). Prefer the root `pnpm run
*:raycast` wrappers when working from the repo root.

`pnpm run dev:raycast`:

- Builds the extension and registers it in Raycast's root search at the top (dev extensions are
  marked as such).
- Hot-reloads on save; surfaces TypeScript/lint errors in the terminal.
- `⌃C` stops the dev server. **The extension stays installed** — its commands remain in Raycast's
  root search; you just lose hot reload until you start the dev script again.

Root wrappers:

| Root script | What it does |
|--------|--------------|
| `pnpm run dev:raycast` | `ray develop` — dev mode with hot reload |
| `pnpm run build:raycast` | `ray build` — production build (for a store/zip artifact) |

## Monorepo isolation

Monocle is a pnpm + Turborepo monorepo. The Raycast extension should stay
**isolated** because enrolling it under `apps/*` would make root pnpm/Turbo
commands treat a Raycast app like a normal workspace package. This mirrors the
bridge's isolation from the default extension pipeline, but Raycast is excluded
entirely from pnpm's workspace graph.

**1. Exclude it from the pnpm workspace** (`pnpm-workspace.yaml`). The current repo uses
`apps/*`; before adding `apps/raycast`, replace that broad include with explicit app entries:

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

**2. Add root convenience scripts** (`package.json`), mirroring `dev:bridge`/`build:bridge`. These
shell into the dir rather than going through Turbo:

```jsonc
{
  "scripts": {
    "dev:raycast": "pnpm --dir apps/raycast run dev",
    "build:raycast": "pnpm --dir apps/raycast run build"
  }
}
```

**3. Keep it out of the Turbo pipeline.** Do not add a `@monocle/raycast` entry to `turbo.json`'s
default `build`/`test`/`tsc` tasks. Its lint/build are run only via the isolated `*:raycast` scripts
(again, exactly how the bridge's cargo tasks are isolated). `pnpm run build` / `pnpm test` /
`pnpm run tsc` at the repo root must not invoke the Raycast toolchain.

## `.gitignore`

The root `node_modules` ignore already catches nested `node_modules/` directories. Keep the
scaffolded `apps/raycast/.gitignore` and add Raycast-specific build/cache output there if the
scaffold does not already cover it.
