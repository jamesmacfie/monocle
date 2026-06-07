# Architecture

Monocle is a WXT-built browser extension that adds a VS Code-style command palette to the browser. It runs in two UI surfaces — a content-script overlay injected into every page inside a closed shadow DOM, and a new-tab page replacement — both backed by a single background service worker that owns all privileged behavior. The UI surfaces are deliberately thin: they fetch UI-safe `Suggestion` values from the background, render them with CMDK, and send typed messages back to execute. This document maps the runtime modes, the entrypoints, the background ownership model, the Redux store layout, the build system, and the core data flows, with pointers into the deep-dive docs for each subsystem.

## Runtime modes

Monocle presents the same palette in two distinct DOM/runtime contexts. The shared palette components under `shared/components/Command/` must work in both.

| Mode | Context | Boot path | Store factory | Message context |
| --- | --- | --- | --- | --- |
| Content overlay | Closed shadow DOM injected into any page (`<all_urls>`) | `entrypoints/content.tsx` → `content/scripts.tsx` | `createAppStore` (full app store) | none (default page context) |
| New-tab | Extension page replacing the browser new-tab page | `entrypoints/newtab/main.tsx` → `newtab/NewTabApp.tsx` | `createAppStore` (full app store) | `{ isNewTab: true }` |

### Content overlay boot

`entrypoints/content.tsx` defines the content script with `defineContentScript`. Key registration details:

- `matches: ["<all_urls>"]`, `registration: "manifest"`, `cssInjectionMode: "ui"`.
- It waits for `document.body` (`waitForBody`), then calls `createShadowRootUi` with `mode: "closed"`, anchored inline to `body`, named `monocle-command-palette`. The closed shadow root isolates Monocle's styles and DOM from the host page.
- On mount it sets the host element id to `extension-root`, reads `monocle-settings` from `chrome.storage.local`, and applies the theme to the shadow host via `applyThemeToHost` (`shared/utils/theme.ts`). It also subscribes to `storage.onChanged` so theme updates re-apply live.
- `renderContentCommandPalette(container)` (`content/scripts.tsx`) mounts a React root rendering `ContentCommandPaletteWithState`, which wraps `ContentCommandPalette` in a Redux `<Provider>` with its own `createAppStore(sendMessage)` instance.

The overlay is toggled by the toolbar action and by the global keybinding. The toolbar click is handled in `background/index.ts`, which calls `toggleContentPalette(tabId)` (`background/utils/contentPalette.ts`). That helper first tries `toggle-ui` against the tab; if the content script is not yet present it injects `content-scripts/content.js` via the `scripting` API and retries `show-ui`. Visibility itself lives in Redux (`commandPaletteState.slice.ts`) and is consumed by `ContentCommandPalette` via `useCommandPaletteStateRedux`.

### New-tab boot

`entrypoints/newtab/main.tsx` is a side-effect import of `newtab/scripts.tsx`, which mounts `NewTabApp` into `#root` of `entrypoints/newtab/index.html` under `React.StrictMode`. `newtab/NewTabApp.tsx`:

- Builds a messaging function bound to the new-tab context with `createPaletteSendMessage({ isNewTab: true })`, then creates a full app store with `createAppStore(sendMessageWithNewTab)` and provides it.
- On mount dispatches `loadSettings()` and `loadPermissions()` thunks.
- Applies the theme to the document root (`applyThemeToDocument`) and subscribes to system theme changes (`setupSystemThemeListener`) and to `storage.onChanged` to reload settings.
- Renders `BackgroundImage`, an optional `Clock`, an optional `PermissionGrantPanel` (driven by a `grantPermission` URL query param), the `NewTabCommandPalette`, and a `ToastContainer`.

See [palette-ui-and-navigation.md](./palette-ui-and-navigation.md) for the shared palette internals and [new-tab-and-theme.md](./new-tab-and-theme.md) for new-tab-specific behavior.

## WXT entrypoints

WXT generates the manifest and bundles three entrypoints under `entrypoints/`:

| Entrypoint | Type | Registers |
| --- | --- | --- |
| `entrypoints/background.ts` | `defineBackground` | Calls `initializeBackground()` from `background/index.ts`. |
| `entrypoints/content.tsx` | `defineContentScript` | Injects the shadow-DOM overlay on `<all_urls>`. |
| `entrypoints/newtab/` (`index.html` + `main.tsx`) | HTML page | Browser new-tab override; mounts the React new-tab app. |

`background/index.ts` `initializeBackground()` is the service worker's startup: it initializes the keybinding registry (`initializeKeybindingRegistry`), registers a cross-browser runtime message listener that routes everything through `handleMessage`, and wires the toolbar `action.onClicked` to `toggleContentPalette`.

## Background ownership and boundaries

The background service worker is the single authority for everything privileged. The UI surfaces never touch privileged browser APIs directly and never receive executable command functions.

The background owns:

- **Command definitions** — typed `CommandNode` trees loaded and assembled in `background/commands/`. See [command-schema.md](./command-schema.md) and [command-types.md](./command-types.md).
- **Browser API access** — all `tabs`, `bookmarks`, `history`, `cookies`, etc. calls go through background utilities.
- **Settings persistence** — stored under `monocle-settings` in `chrome.storage.local`, routed through `background/commands/settings.ts`. See [settings.md](./settings.md).
- **Permissions** — required and optional permission checks and requests. See [permissions.md](./permissions.md).
- **Keybindings** — canonicalization, registry, and execution. See [keybindings.md](./keybindings.md).
- **Workflow forwarding** — receives `execute-workflow` and forwards it to the active tab's content script. See [workflow-automation.md](./workflow-automation.md).

The enforced architectural boundaries:

- **Privileged APIs are background-only.** UI code uses typed messages (`shared/store/sendMessage.ts`) instead of reaching into browser-only behavior. The one UI-side exception is reading/observing `chrome.storage.local["monocle-settings"]` for theme application, which is read-only.
- **UI receives `Suggestion` values, not executable functions.** The background converts `CommandNode` trees into UI-facing `Suggestion` objects (`shared/types/ui.ts`); the UI renders them and sends `execute-command` with an id, never invoking a function. See [execution-and-actions.md](./execution-and-actions.md).
- **Shared components must work in both DOMs.** Components under `shared/components/` run inside both the closed content shadow root and the normal new-tab document, so they must not assume `document`-level globals or page-scoped styling.
- **Settings flow through the background.** Persistence and command settings updates go through `background/commands/settings.ts` and the `update-command-setting` message path; the UI mirrors state into Redux but the storage/permission truth is authoritative in the background.

## Redux store

Monocle uses Redux Toolkit. There are two store factories in `shared/store/`:

| Factory | File | Slices | Used by |
| --- | --- | --- | --- |
| `createAppStore(sendMessage?)` | `shared/store/index.ts` | `settings`, `navigation`, `commandPalette`, `keybinding` | Content overlay and new-tab — the actual stores in use. |
| `createCommandPaletteStore(initialIsOpen?)` | `shared/store/commandPaletteStore.ts` | `commandPalette` only | A minimal palette-only store factory. |

The full app store is instantiated **per mode** (one per content overlay mount, one per new-tab app) inside a React `useMemo`, so each surface has its own isolated store. The `sendMessage` function is injected as the thunk `extraArgument` (`ThunkApi`), giving async thunks access to background messaging without importing it directly.

Slices (`shared/store/slices/`):

| Slice | File | Responsibility |
| --- | --- | --- |
| `settings` | `settings.slice.ts` | Theme mode, new-tab/clock prefs, permission access mirror, loading/error. Has `loadSettings`/`loadPermissions` thunks. |
| `navigation` | `navigation.slice.ts` | Palette page stack, search values, dynamic child pages, inline form values, loading/errors. |
| `commandPalette` | `commandPaletteState.slice.ts` | Overlay visibility (`isOpen`). |
| `keybinding` | `keybinding.slice.ts` | Keybinding capture state (`isCapturing`, `targetCommandId`). |

Typed hooks (`useAppDispatch`, `useAppSelector`, `useAppStore`) live in `shared/store/hooks.ts`. `createAppStore` ships a `preloadedState` with sensible defaults (theme `system`, clock shown, all permissions `false`, palette closed). `RootState`, `AppDispatch`, and `AppStore` types are exported from `shared/store/index.ts`.

## Repository layout

```text
monocle/
├── entrypoints/         # WXT background, content, and new-tab entrypoints
│   ├── background.ts
│   ├── content.tsx
│   └── newtab/          # index.html + main.tsx
├── background/          # Service worker: commands, messages, keybindings, utils
│   ├── index.ts         # initializeBackground()
│   ├── commands/        # command sources, settings, websites prototype
│   ├── messages/        # message router and handlers
│   ├── keybindings/     # registry
│   └── utils/           # privileged browser API helpers, contentPalette
├── content/             # Content overlay rendering and workflow executor
├── newtab/              # Browser new-tab replacement app
├── shared/              # Shared React components, hooks, store, types, utils
│   ├── components/
│   ├── hooks/
│   ├── store/           # store factories, slices, sendMessage
│   ├── types/           # commands.ts, ui.ts, etc.
│   └── utils/           # key-normalizer, theme, extension-api, validation
├── docs/                # Feature/architecture docs (this folder)
├── server/              # Local support server (node server/index.js)
└── test-inputs.html     # Manual workflow/input fixture page
```

## Build system

The build is driven by WXT (`wxt.config.ts`) with the React module.

- `manifestVersion: 3`, `targetBrowsers: ["chrome", "firefox"]`, `modules: ["@wxt-dev/module-react"]`, `imports: false` (no WXT auto-imports).
- The `manifest` is generated as a function of `{ browser, command }`:
  - **Permissions** are browser-specific. Chrome gets `["scripting", "activeTab", "storage"]`; Firefox additionally gets `contextualIdentities`.
  - **Optional permissions** (`bookmarks`, `browsingData`, `cookies`, `downloads`, `history`, `sessions`, `tabs`) are declared once and requested on demand at runtime.
  - **Host permissions** cover external hosts: Unsplash API, DuckDuckGo icons, Google.
  - **CSP** for extension pages is computed by `getExtensionPagesCsp`; the dev `serve` command relaxes `connect-src`/`script-src` to allow `localhost`/`ws` for HMR.
  - The toolbar **action shortcut** `_execute_action` is bound to `Cmd/Ctrl+Shift+K`, declared for all browser/command combos except Firefox `serve`.
- A `build:manifestGenerated` hook strips Firefox-incompatible fields for Firefox MV3 (`content_security_policy.sandbox` and `use_dynamic_url` on web-accessible resources).

pnpm scripts (`package.json` — always use `pnpm`, never `npm`/`yarn`):

| Script | Purpose |
| --- | --- |
| `pnpm run dev` | WXT dev server (default Chrome target). |
| `pnpm run dev:chrome` / `pnpm run dev:firefox` | Dev server for a specific MV3 target. |
| `pnpm run build` | `tsc --noEmit` then `wxt build` (Chrome MV3). |
| `pnpm run build:firefox` | Type-check then `wxt build -b firefox --mv3`. |
| `pnpm run build:zip` / `build:firefox:zip` | Build and zip for distribution. |
| `pnpm run tsc` | Type-check only. |
| `pnpm run fmt` / `fmt:check` | Biome write / check. |
| `pnpm test` / `test:watch` | Vitest (focused suite). |
| `pnpm run server` | Local support server. |

Stack: React 19, Redux Toolkit, CMDK (palette), `ts-pattern` (message routing), Zod (validation), Tailwind v4, Biome (lint/format), Vitest (tests).

## Core data flows

All UI→background communication is a single typed message channel routed in `background/messages/index.ts` via `ts-pattern`, after Zod-backed validation in `validateIncomingMessage`. See [messaging.md](./messaging.md) for the full message catalog.

### Command load

1. The UI sends `get-commands` with current browser context (new-tab mode includes `{ isNewTab: true }`).
2. `getCommands` (`background/messages/getCommands.ts`) loads command nodes, applies browser/context compatibility, applies URL filtering, ranks suggestions, and computes favorites/deep-search items.
3. Nodes are converted to UI-facing `Suggestion` values.
4. The shared palette renders them with CMDK.

See [search-and-ranking.md](./search-and-ranking.md), [url-filtering.md](./url-filtering.md), and [command-types.md](./command-types.md).

### Nested navigation

1. Selecting a `group` or `search` command sends `get-children-commands`.
2. `getChildrenCommands` resolves dynamic children, filters them, and converts them to suggestions.
3. `navigation.slice.ts` pushes a new page with child suggestions, search state, and inline form defaults.
4. Actions or submits execute against the current page's form values.

See [palette-ui-and-navigation.md](./palette-ui-and-navigation.md).

### Execution

1. The UI sends `execute-command` with id, form values, optional `parentNames`, and an optional `executionScope` (the modifier path, e.g. enter vs modifier-enter).
2. The background resolves the command, checks permissions, runs the executor, and records usage.
3. On success the palette may refresh commands and close (overlay) or reset.

See [execution-and-actions.md](./execution-and-actions.md).

### Settings and permissions

1. Settings live under `monocle-settings` in `chrome.storage.local`, routed through `background/commands/settings.ts`.
2. Redux mirrors settings and permission state for responsive UI (`settings.slice.ts`).
3. Browser permission APIs remain authoritative — Redux is only a mirror.
4. UI sends `get-permissions`, `request-permission`, `open-permission-grant-page`, and `update-command-setting`; Chrome routes permission requests through the background, while Firefox can request directly where supported.

See [settings.md](./settings.md) and [permissions.md](./permissions.md).

### Keybinding

1. UI capture normalizes key events into canonical strings such as `<cmd-shift-k>` (`shared/utils/key-normalizer.ts`).
2. UI sends `execute-keybinding` (or `check-keybinding-conflict` / `get-keybinding-state` for management).
3. The background registry resolves exact matches or multi-stroke sequence prefixes.
4. Matching commands run through the same execution path.

See [keybindings.md](./keybindings.md).

### Workflow forwarding

1. A command sends `execute-workflow`.
2. `executeWorkflow` (`background/messages/executeWorkflow.ts`) delegates to `executeWorkflowOnTargetTab` (`background/workflows/execution.ts`), which validates the workflow and sends it to the target tab as `execute-workflow-content`.
3. The content script runs `content/workflowExecutor.ts`.
4. Results return through the message chain.

Only `click` and `wait` steps are meaningfully implemented and accepted by validation today; the broader workflow type model is future design. See [workflow-automation.md](./workflow-automation.md) for the implemented-vs-modeled breakdown.

## Known issues and manual checks (carried from baseline)

- WXT builds emit chunk-size warnings for the content and new-tab bundles and an ineffective-dynamic-import warning for `settings.slice.ts`; these are warnings, not errors. The Firefox build also emits a `data_collection_permissions` warning for new extensions.
- The repo carries intentional untracked work under `.codex/` and `background/commands/websites/` (the GitHub contextual command prototype). Do not remove or overwrite it.
- Automated coverage is narrow and focused; browser-integration behavior (permission prompts, shortcut suppression, shadow-DOM rendering) still needs manual Chrome/Firefox smoke checks. When touching shared palette behavior, verify both the closed-shadow-DOM content overlay and the normal-DOM new-tab mode.

## Related docs

- [messaging.md](./messaging.md) — full background message protocol
- [command-schema.md](./command-schema.md) and [command-types.md](./command-types.md) — command model
- [authoring-commands.md](./authoring-commands.md) — adding commands
- [search-and-ranking.md](./search-and-ranking.md), [execution-and-actions.md](./execution-and-actions.md)
- [keybindings.md](./keybindings.md), [url-filtering.md](./url-filtering.md), [permissions.md](./permissions.md), [settings.md](./settings.md)
- [palette-ui-and-navigation.md](./palette-ui-and-navigation.md), [new-tab-and-theme.md](./new-tab-and-theme.md)
- [workflow-automation.md](./workflow-automation.md)
- Command catalogs: [commands/browser.md](./commands/browser.md), [commands/tools.md](./commands/tools.md), [commands/ui.md](./commands/ui.md), [commands/new-tab.md](./commands/new-tab.md), [commands/websites.md](./commands/websites.md)
