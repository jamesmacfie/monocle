# Getting started

> **Status: design-only.** The `apps/raycast/` directory does not exist yet. This is how to create
> and run it.

## Prerequisites

- Raycast installed (macOS).
- Raycast signed in. The built-in **Create Extension** / **Import Extension** development commands
  require a signed-in Raycast account.
- Node **22.14+** and npm 7+ (current Raycast extension-tooling requirement).
- The Monocle Bridge app running and the extension's bridge enabled and paired — see
  [`bridge-and-extension-prerequisites.md`](./bridge-and-extension-prerequisites.md). You can build
  and run the Raycast extension before pairing, but suggestions only return once paired.

## Scaffold

Raycast extensions are scaffolded from inside Raycast, then moved into the repo:

1. In Raycast, run **Create Extension**, pick the **List** template, name it "Monocle".
2. Raycast writes the project to the location you choose. Move/clone it to `apps/raycast/`.
3. From `apps/raycast/`, run `npm install`.

Resulting layout (the parts that matter):

```text
apps/raycast/
├── package.json          # The Raycast manifest (commands, preferences) — see manifest.md
├── tsconfig.json
├── .eslintrc.json
├── assets/               # 512px PNG extension icon (+ @dark variant)
├── src/
│   ├── search-monocle.tsx   # entry for the `search-monocle` command (List view)
│   ├── pair-monocle.tsx     # entry for the `pair-monocle` command (Form view)
│   └── lib/
│       ├── bridge.ts        # HTTP client (protocol-client.md)
│       ├── auth.ts          # token + instanceId in LocalStorage (pairing.md, settings-and-storage.md)
│       └── icons.ts         # Lucide-name → Raycast Icon map (suggestions-and-mapping.md)
└── node_modules/         # npm-managed (NOT pnpm) — see "Monorepo isolation" below
```

Each `commands[].name` in `package.json` maps to a `src/<name>.tsx` file whose default export is
the command component.

## Develop

The Raycast toolchain is npm-centric in the official docs (`@raycast/api` ships the `ray` CLI):

```bash
cd apps/raycast
npm install          # once
npm run dev          # ray develop: builds + hot-reloads, registers the extension in dev mode
```

`npm run dev`:

- Builds the extension and registers it in Raycast's root search at the top (dev extensions are
  marked as such).
- Hot-reloads on save; surfaces TypeScript/lint errors in the terminal.
- `⌃C` stops the dev server. **The extension stays installed** — its commands remain in Raycast's
  root search; you just lose hot reload until you `npm run dev` again.

Other `ray` scripts (present in the scaffolded `package.json`):

| Script | What it does |
|--------|--------------|
| `npm run dev` | `ray develop` — dev mode with hot reload |
| `npm run build` | `ray build` — production build (for a store/zip artifact) |
| `npm run lint` | `ray lint` — Raycast's lint rules |
| `npm run fix-lint` | `ray lint --fix` |

## Monorepo isolation

Monocle is a pnpm + Turborepo monorepo. The Raycast extension should stay **isolated** and
npm-managed because Raycast's scaffold and docs use `package-lock.json`, `npm install`, and
`npm run dev`, and because enrolling it under `apps/*` would make root `pnpm`/Turbo commands treat a
Raycast app like a workspace package. This mirrors the bridge's isolation from the default extension
pipeline, but with npm instead of pnpm.

**1. Exclude it from the pnpm workspace** (`pnpm-workspace.yaml`). The current repo uses
`apps/*`; before adding `apps/raycast`, replace that broad include with explicit app entries:

```yaml
packages:
  - apps/extension
  - apps/bridge
  - "!apps/raycast"   # npm-managed Raycast app
  - packages/*
```

> Without the exclusion, pnpm would adopt `apps/raycast`. Excluding it lets `npm install` manage the
> `node_modules` and `package-lock.json` Raycast expects inside `apps/raycast`. (`apps/marketing` is
> already a non-workspace dir, so the precedent for "an app pnpm doesn't manage" exists.)

**2. Add root convenience scripts** (`package.json`), mirroring `dev:bridge`/`build:bridge`. These
shell into the dir rather than going through Turbo:

```jsonc
{
  "scripts": {
    "dev:raycast": "npm --prefix apps/raycast run dev",
    "build:raycast": "npm --prefix apps/raycast run build"
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
scaffold does not already cover it. Commit `apps/raycast/package-lock.json`; it is the lockfile for
this isolated npm-managed app.
