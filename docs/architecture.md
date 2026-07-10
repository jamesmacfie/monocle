# Architecture

Monocle is a WXT-built browser extension that adds a VS Code-style command palette to the browser. The palette runs in two UI surfaces — a content-script overlay injected into every page inside a closed shadow DOM, and a new-tab page replacement — both backed by a single background service worker that owns all privileged behavior. Monocle also has a WXT options page for settings management, a Tauri native Bridge app, and a Raycast client that talks to the browser through that bridge. The UI surfaces are deliberately thin: they fetch UI-safe data from the background, render it, and send typed messages back for privileged work. This document maps the runtime modes, entrypoints, background ownership model, Redux store layout, build system, and core data flows, with pointers into the deep-dive docs.

## Runtime modes

Monocle presents the same palette in two distinct DOM/runtime contexts. The shared palette components under `shared/components/Command/` must work in both.

| Mode | Context | Boot path | Store factory | Message context |
| --- | --- | --- | --- | --- |
| Content overlay | Closed shadow DOM injected into any page (`<all_urls>`) | `entrypoints/content.tsx` → `content/scripts.tsx` | `createAppStore` (full app store) | none (default page context) |
| New-tab | Extension page replacing the browser new-tab page | `entrypoints/newtab/main.tsx` → `newtab/NewTabApp.tsx` | `createAppStore` (full app store) | `{ isNewTab: true }` |

The options page is a third extension page surface, but it is not a palette runtime mode. It renders settings-management views from `entrypoints/options/main.tsx` → `options/OptionsApp.tsx`, using the same store factory plus a settings catalog slice.

### Content overlay boot

`entrypoints/content.tsx` defines the content script with `defineContentScript`. Key registration details:

- `matches: ["<all_urls>"]`, `registration: "manifest"`, `cssInjectionMode: "ui"`.
- It waits for `document.body` (`waitForBody`), then calls `createShadowRootUi` with `mode: "closed"`, anchored inline to `body`, named `monocle-command-palette`. The closed shadow root isolates Monocle's styles and DOM from the host page.
- On mount it sets the host element id to `extension-root`, reads `monocle-settings` from `chrome.storage.local`, and applies the theme to the shadow host via `applyThemeToHost` (`shared/utils/theme.ts`). It also subscribes to `storage.onChanged` so theme updates re-apply live.
- `renderContentCommandPalette(container)` (`content/scripts.tsx`) mounts a React root rendering `ContentCommandPaletteWithState`, which wraps `ContentCommandPalette` in a Redux `<Provider>` with its own `createAppStore(sendMessage)` instance.

The overlay is toggled by the toolbar action and by the global keybinding. The toolbar click is handled in `background/index.ts`, which calls `toggleContentPalette(tabId)` (`background/utils/contentPalette.ts`). That helper first tries `monocle-ui-toggle` against the tab; if the content script is not yet present it injects `content-scripts/content.js` via the `scripting` API and retries `monocle-ui-show`. Visibility itself lives in Redux (`commandPaletteState.slice.ts`) and is consumed by `ContentCommandPalette` via `useCommandPaletteStateRedux`.

### New-tab boot

`entrypoints/newtab/main.tsx` is a side-effect import of `newtab/scripts.tsx`, which mounts `NewTabApp` into `#root` of `entrypoints/newtab/index.html` under `React.StrictMode`. `newtab/NewTabApp.tsx`:

- Builds a messaging function bound to the new-tab context with `createPaletteSendMessage({ isNewTab: true })`, then creates a full app store with `createAppStore(sendMessageWithNewTab)` and provides it.
- On mount dispatches `loadSettings()` and `loadPermissions()` thunks.
- Applies the theme to the document root (`applyThemeToDocument`) and subscribes to system theme changes (`setupSystemThemeListener`) and to `storage.onChanged` to reload settings.
- Renders `BackgroundImage`, an optional `Clock`, an optional `PermissionGrantPanel` (driven by a `grantPermission` URL query param), the `NewTabCommandPalette`, and a `ToastContainer`.

See [palette-ui-and-navigation.md](./palette-ui-and-navigation.md) for the shared palette internals and [new-tab-and-theme.md](./new-tab-and-theme.md) for new-tab-specific behavior.

## WXT entrypoints

WXT generates the manifest and bundles these entrypoints under `entrypoints/`:

| Entrypoint | Type | Registers |
| --- | --- | --- |
| `entrypoints/background.ts` | `defineBackground` | Calls `initializeBackground()` from `background/index.ts`. |
| `entrypoints/content.tsx` | `defineContentScript` | Injects the shadow-DOM overlay on `<all_urls>`. |
| `entrypoints/site-sdk.content.ts` | `defineContentScript` | Runs at `document_start` in the main world and installs `window.Monocle` for page-owned site commands. |
| `entrypoints/newtab/` (`index.html` + `main.tsx`) | HTML page | Browser new-tab override; mounts the React new-tab app. |
| `entrypoints/options/` (`index.html` + `main.tsx`) | HTML page | Browser options page (`openInTab: true`); mounts the React settings app. |

`background/index.ts` `initializeBackground()` is the service worker's startup: it initializes the keybinding registry (`initializeKeybindingRegistry`), wires search-index invalidation events and warms the search index (`initializeSearchIndexInvalidation` / `warmSearchIndex` from `background/commands/searchIndex.ts`), registers a cross-browser runtime message listener that routes everything through `handleMessage`, and wires the toolbar `action.onClicked` to `toggleContentPalette`.

## Background ownership and boundaries

The background service worker is the single authority for execution and persisted state. UI surfaces never receive executable command functions. The narrow browser-required exception is a direct `permissions.request` from a user gesture on a trusted extension page (including outbound endpoint/data consent); browser permission truth is immediately re-read and execution always rechecks it in the background.

The background owns:

- **Command definitions** — typed `CommandNode` trees loaded and assembled in `background/commands/`. See [command-schema.md](./command-schema.md) and [command-types.md](./command-types.md).
- **Site command wrappers** — non-privileged page declarations synced through
  `content/siteSdkBridge.ts` are stored per tab/document/origin in
  `background/commands/siteSdk/` and converted into background-owned
  `CommandNode` wrappers. See [site-sdk.md](./site-sdk.md).
- **Browser API access** — all `tabs`, `bookmarks`, `history`, `cookies`, etc. calls go through background utilities.
- **Settings persistence** — stored under `monocle-settings` in `chrome.storage.local`, routed through `background/commands/settings.ts`. See [settings.md](./settings.md).
- **Permissions** — required and optional permission checks and requests. See [permissions.md](./permissions.md).
- **Keybindings** — canonicalization, registry, and execution. See [keybindings.md](./keybindings.md).
- **Workflow forwarding** — receives `monocle-workflow-execute` and forwards it to the resolved target tab's content script. See [workflow-automation.md](./workflow-automation.md).
- **Automations** — declarative automation documents stored under `monocle-automations`, validated/interpreted entirely in the background (`background/automations/`: storage, engine, trigger engine, alarms, command generation, bounded outbound HTTP). See [automations.md](./automations.md).
- **Feature modules** — the `background/features/` registry of `FeatureModule`s, each contributing palette commands, a declarative settings page, runtime state, and a lifecycle hook. Durable config (`monocle-feature-config`) and runtime state (`monocle-feature-state`) live in dedicated stores. See [features.md](./features.md).
- **Surfaces** — the owner-namespaced declarative-UI store (`monocle-surfaces`, `background/surfaces.ts`) of overlays, badges, modals, pickers, and selector-anchored inline controls rendered by the generic `SurfaceHost`. The reusable basis for feature, command, and Automation page UI. See [surfaces.md](./surfaces.md).

The enforced architectural boundaries:

- **Privileged execution APIs are background-only.** UI code uses typed messages (`shared/store/sendMessage.ts`) instead of reaching into browser-only behavior. UI-side exceptions are read-only theme observation and browser-required permission requests made directly from a trusted extension-page user gesture; neither performs product execution.
- **UI receives `Suggestion` values, not executable functions.** The background converts `CommandNode` trees into UI-facing `Suggestion` objects (`shared/types/ui.ts`); the UI renders them and sends `monocle-command-execute` with an id, never invoking a function. See [execution-and-actions.md](./execution-and-actions.md).
- **Shared components must work in both DOMs.** Components under `shared/components/` run inside both the closed content shadow root and the normal new-tab document, so they must not assume `document`-level globals or page-scoped styling.
- **Settings flow through the background.** Persistence and command settings updates go through `background/commands/settings.ts` and the `monocle-command-setting-update` message path; the UI mirrors state into Redux but the storage/permission truth is authoritative in the background.

## Redux store

Monocle uses Redux Toolkit. There are two store factories in `shared/store/`:

| Factory | File | Slices | Used by |
| --- | --- | --- | --- |
| `createAppStore(sendMessage?)` | `shared/store/index.ts` | `settings`, `settingsCatalog`, `navigation`, `commandPalette`, `keybinding`, `snippets`, `automations`, `features` | Content overlay, new-tab, and options page. |
| `createCommandPaletteStore(initialIsOpen?)` | `shared/store/commandPaletteStore.ts` | `commandPalette` only | A minimal palette-only store factory. |

The full app store is instantiated **per mode** (one per content overlay mount, one per new-tab app) inside a React `useMemo`, so each surface has its own isolated store. The `sendMessage` function is injected as the thunk `extraArgument` (`ThunkApi`), giving async thunks access to background messaging without importing it directly.

Slices (`shared/store/slices/`):

| Slice | File | Responsibility |
| --- | --- | --- |
| `settings` | `settings.slice.ts` | Theme mode, new-tab/clock prefs, permission access mirror, loading/error. Has `loadSettings`/`loadPermissions` thunks. |
| `settingsCatalog` | `settingsCatalog.slice.ts` | Options-page command catalog rows and mutations for hidden/favorite/keybinding/URL-rule management. |
| `navigation` | `navigation.slice.ts` | Palette page stack, search values, dynamic child pages, inline form values, loading/errors. |
| `commandPalette` | `commandPaletteState.slice.ts` | Overlay visibility (`isOpen`). |
| `keybinding` | `keybinding.slice.ts` | Keybinding capture state (`isCapturing`, `targetCommandId`, `requirements`). |
| `snippets` | `snippets.slice.ts` | Saved snippets mirror for the options Snippets page; CRUD thunks over the `get/add/update/monocle-snippet-delete` messages. |
| `automations` | `automations.slice.ts` | Automations mirror for the options builder; CRUD + run thunks over the automation messages. |
| `features` | `features.slice.ts` | Feature-module descriptor mirror for the options Features pages; load + config-update + action thunks over the `monocle-features-get` / `monocle-feature-config-update` / `monocle-feature-action-execute` messages. |

Typed hooks (`useAppDispatch`, `useAppSelector`, `useAppStore`) live in `shared/store/hooks.ts`. `createAppStore` ships a `preloadedState` with sensible defaults (theme `system`, clock shown, all permissions `false`, palette closed). `RootState`, `AppDispatch`, and `AppStore` types are exported from `shared/store/index.ts`.

## Repository layout

```text
monocle/
├── apps/
│   ├── extension/       # WXT extension: background/content/newtab/options/shared
│   ├── bridge/          # Tauri native bridge daemon + browser-spawned relay
│   ├── raycast/         # Raycast client, excluded from pnpm workspace
│   └── marketing/       # Static marketing/docs HTML
├── packages/
│   └── native-bridge-protocol/ # Public bridge DTOs, method maps, Zod validation
└── docs/                # Feature/architecture docs
```

Inside `apps/extension/`, paths in this and most feature docs are extension-relative:
`entrypoints/`, `background/`, `content/`, `newtab/`, `options/`, `shared/`, and
`test-inputs.html`.

## Build system

The build is driven by WXT (`wxt.config.ts`) with the React module.

- `manifestVersion: 3`, `targetBrowsers: ["chrome", "firefox"]`, `modules: ["@wxt-dev/module-react"]`, `imports: false` (no WXT auto-imports).
- The `manifest` is generated as a function of `{ browser, command }`:
  - **Permissions** are browser-specific. Chrome gets `["scripting", "activeTab", "alarms", "storage"]`; Firefox additionally gets `contextualIdentities`. `alarms` powers scheduled automation triggers.
  - **Optional permissions** (`bookmarks`, `browsingData`, `cookies`, `downloads`, `history`, `sessions`, `tabs`, `management`, plus Chrome-only `tabGroups`) are declared once and requested on demand at runtime.
  - **Host permissions** cover external hosts: Unsplash API, DuckDuckGo icons.
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
| `pnpm run dev:bridge` / `build:bridge` | Run/build the Tauri bridge app. |
| `pnpm run dev:raycast` / `build:raycast` | Run/build the isolated Raycast client with `pnpm --dir apps/raycast`. |
| `pnpm run tsc` | Type-check only. |
| `pnpm run fmt` / `fmt:check` | Biome write / check. |
| `pnpm test` / `test:watch` | Vitest (focused suite). |
| `pnpm run server` | Local support server. |

Stack: React 19, Redux Toolkit, CMDK (palette), `ts-pattern` (message routing), Zod (validation), Tailwind v4, Biome (lint/format), Vitest (tests).

`packages/native-bridge-protocol` is the only shared package today. It contains the public native-bridge wire contract (`ExternalSuggestion`, bridge error codes, method params/results, request schema, and response helpers). The extension re-exports it from `shared/types/nativeMessaging.ts` for compatibility, and the Raycast client imports the wire types through `apps/raycast/src/lib/types.ts`. Extension-internal `CommandNode`, `Suggestion`, message, store, and browser API types intentionally stay inside `apps/extension`.

## Core data flows

All UI→background communication is a single typed message channel routed in `background/messages/index.ts` via `ts-pattern`, after Zod-backed validation in `validateIncomingMessage`. See [messaging.md](./messaging.md) for the full message catalog.

### Command load and search

1. The UI sends `monocle-commands-get` with current browser context (new-tab mode includes `{ isNewTab: true }`).
2. For content-overlay senders, `getCommands` first prepares the sender's site SDK scope. If the service worker has no registration for that tab/document/origin, it asks the content bridge to replay current registrations with `monocle-site-sdk-sync-request`.
3. `getCommands` (`background/messages/getCommands.ts`) loads command nodes, including any scoped site SDK wrappers, applies browser/context compatibility, applies URL filtering, ranks suggestions, and computes favorites — the root empty state.
4. Nodes are converted to UI-facing `Suggestion` values and the shared palette renders them with CMDK (`shouldFilter={false}` — CMDK never filters).
5. Typing debounces ~200 ms and sends `monocle-commands-search`; `searchCommands` (`background/messages/searchCommands.ts`) scores entries from the in-memory search index (`background/commands/searchIndex.ts` — module-scoped cache, ~30 s TTL plus browser-event invalidation, URL rules applied at query time) and returns the top-N suggestions, deep-search matches inline. Child group pages search the same way via `parentPath`; form pages bypass search.

See [search-and-ranking.md](./search-and-ranking.md), [url-filtering.md](./url-filtering.md), and [command-types.md](./command-types.md).

### Nested navigation

1. Selecting a `group` or `search` command sends `monocle-command-children-get`.
2. `getChildrenCommands` resolves dynamic children, filters them, and converts them to suggestions.
3. `navigation.slice.ts` pushes a new page with child suggestions, search state, and inline form defaults.
4. Actions or submits execute against the current page's form values.

See [palette-ui-and-navigation.md](./palette-ui-and-navigation.md).

### Execution

1. The UI sends `monocle-command-execute` with id, form values, optional `parentNames`, and an optional `executionScope` (the modifier path, e.g. enter vs modifier-enter).
2. The background resolves the command, checks permissions, runs the executor, and records usage. Site SDK executors are wrappers that send `monocle-site-sdk-invoke` to the sender tab's isolated bridge, which calls the page-world callback and returns success/error.
3. On success the palette may refresh commands and close (overlay) or reset.

See [execution-and-actions.md](./execution-and-actions.md).

### Settings and permissions

1. Settings live under `monocle-settings` in `chrome.storage.local`, routed through `background/commands/settings.ts`.
2. Redux mirrors settings and permission state for responsive UI (`settings.slice.ts`).
3. Browser permission APIs remain authoritative — Redux is only a mirror.
4. UI sends `monocle-permissions-get`, `monocle-permission-request`, `monocle-permission-grant-page-open`, `monocle-command-setting-update`, `monocle-settings-catalog-get`, and `monocle-command-favorite-set`; Chrome routes permission requests through the background, while Firefox can request directly where supported.
5. Hidden command settings are enforced through the shared command visibility filter, so hidden commands are omitted from palette views, search, execution resolution, and keybinding registries while remaining visible in the settings catalog.

See [settings.md](./settings.md) and [permissions.md](./permissions.md).

### Keybinding

1. UI capture normalizes key events into canonical strings such as `<cmd-shift-k>` (`shared/utils/key-normalizer.ts`).
2. UI sends `monocle-keybinding-execute` (or `monocle-keybinding-conflict-check` / `monocle-keybinding-state-get` for management).
3. The background registry resolves exact matches or multi-stroke sequence prefixes.
4. Matching commands run through the same execution path.

See [keybindings.md](./keybindings.md).

### Workflow forwarding

1. A command (or the automation engine, per content segment) sends/forwards a workflow.
2. `executeWorkflow` (`background/messages/executeWorkflow.ts`) delegates to `executeWorkflowOnTargetTab` (`background/workflows/execution.ts`), which resolves the target tab and sends `monocle-workflow-content-execute`.
3. The content script runs the executor in `content/workflow/`.
4. Results (including extracted vars) return through the message chain.

The full 17-op step vocabulary (click/wait/fill/select/check/uncheck/submit/focus/blur/scroll/hover/type/key/getText/removeElement/hideElement/injectCss) is implemented and schema-accepted; privileged operations are automation engine ops, never workflow steps. See [workflow-automation.md](./workflow-automation.md).

### Automations

1. A stored document runs via its generated palette command, an armed page trigger (content reports `monocle-automation-trigger-fired`, the background re-validates), or a `chrome.alarms` schedule.
2. The engine (`background/automations/engine.ts`) re-reads the document, interpolates background-side, lowers contiguous content steps to workflows, and executes privileged ops between segments. `httpRequest` remains background-only and is preflighted for private mode, Firefox data consent, and a concrete endpoint grant before values resolve.
3. An inline surface action returns only owner/surface/action ids. The background verifies the real top-frame sender and active render metadata, rereads the document, and runs the current nested action steps with a fresh value bag.

See [automations.md](./automations.md).

### Feature modules

1. The `background/features/` registry contributes palette commands (loaded by `source.ts`), a data-only descriptor for the options page (`monocle-features-get`), and an `init()` startup hook (`background/index.ts`).
2. Durable feature config (`monocle-feature-config`) and transient runtime state (`monocle-feature-state`) are separate stores, both distinct from `monocle-settings`. Feature page UI is rendered through the generic Surfaces primitive (`background/surfaces.ts` + the shared `SurfaceHost`), not per-feature components — a feature pushes declarative surfaces and the host renders them.

See [features.md](./features.md), [surfaces.md](./surfaces.md), and [focus-mode.md](./focus-mode.md).

## Known issues and manual checks (carried from baseline)

- WXT builds emit chunk-size warnings for the content and new-tab bundles and an ineffective-dynamic-import warning for `settings.slice.ts`; these are warnings, not errors. The Firefox build also emits a `data_collection_permissions` warning for new extensions.
- The repo carries intentional untracked work under `.codex/` and `background/commands/websites/` (the GitHub contextual command prototype). Do not remove or overwrite it.
- Automated coverage is narrow and focused; browser-integration behavior (permission prompts, shortcut suppression, shadow-DOM rendering) still needs manual Chrome/Firefox smoke checks. When touching shared palette behavior, verify both the closed-shadow-DOM content overlay and the normal-DOM new-tab mode.

## Related docs

- [messaging.md](./messaging.md) — full background message protocol
- [command-schema.md](./command-schema.md) and [command-types.md](./command-types.md) — command model
- [authoring-commands.md](./authoring-commands.md) — adding background-owned commands
- [site-sdk.md](./site-sdk.md) — page-owned site commands through `window.Monocle`
- [search-and-ranking.md](./search-and-ranking.md), [execution-and-actions.md](./execution-and-actions.md)
- [keybindings.md](./keybindings.md), [url-filtering.md](./url-filtering.md), [permissions.md](./permissions.md), [settings.md](./settings.md)
- [palette-ui-and-navigation.md](./palette-ui-and-navigation.md), [new-tab-and-theme.md](./new-tab-and-theme.md)
- [workflow-automation.md](./workflow-automation.md)
- Command catalogs: [commands/browser.md](./commands/browser.md), [commands/tools.md](./commands/tools.md), [commands/ui.md](./commands/ui.md), [commands/new-tab.md](./commands/new-tab.md), [commands/websites.md](./commands/websites.md)
