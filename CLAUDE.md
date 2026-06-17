# CLAUDE.md

This is the canonical agent guide for the Monocle browser extension.
`AGENTS.md` is intentionally a symlink to this file so Claude Code and Codex
read the same project instructions.

Keep this file as a stable architecture map and working contract. The detailed
feature documentation lives in `docs/`. When behavior or verification changes,
update the relevant feature doc first, then adjust this file only if the root
guidance changes. Feature status and validation state are owned by this file
(the docs describe behavior, not status).

## Project Overview

Monocle is a browser extension built with WXT, TypeScript, React, and Redux. It
provides a VS Code-style command palette for browser operations.

It runs in two primary modes:

- Content overlay mode: injected into webpages, isolated in a shadow DOM, and
  opened with the global palette shortcut.
- New-tab mode: replaces the browser new-tab page with a persistent Monocle
  palette experience.

The background service worker owns command definitions, browser API access,
settings persistence, permissions, keybinding execution, and workflow message
forwarding. Content and new-tab UIs fetch UI-safe command suggestions from the
background and execute commands through message handlers. The options UI fetches
durable command catalog rows from the background and sends settings/favorite
messages; it does not receive executable command functions.

## Documentation Map

Use the feature docs as the source of truth before editing related code:

- `docs/README.md`: documentation index, reading order, and doc conventions.
- `docs/architecture.md`: runtime modes, entrypoints, ownership boundaries,
  Redux store layout, WXT build system, and core data-flow walkthroughs.
- `docs/messaging.md`: complete message protocol reference: every
  UI-to-background and background-to-tab message, payloads, and handlers.
- `docs/command-schema.md`: field-by-field `CommandNode` reference,
  `AsyncValue` semantics, action/modifier labels, all `FormField` variants,
  and node-to-`Suggestion` conversion.
- `docs/command-types.md`: the six command node types (action, submit, group,
  search, input, display) with rendering and selection behavior.
- `docs/authoring-commands.md`: how to add and register a command: category
  folders, loaders, conventions, form/search patterns, and pitfalls.
- `docs/site-sdk.md`: page-world `window.Monocle` SDK for non-privileged,
  session-only site commands.
- `docs/site-sdk-security.md`: site SDK threat model — attacker model,
  containment guarantees, page-reachable risks, and defense-in-depth gaps.
- `docs/search-and-ranking.md`: palette search, keywords, usage ranking,
  favorites, and deep search.
- `docs/execution-and-actions.md`: execution flow, enter vs modifier-enter,
  action labels, the action menu, and generated actions.
- `docs/palette-ui-and-navigation.md`: shared palette UI, content overlay,
  new-tab palette, Redux navigation stack, and inline inputs.
- `docs/keybindings.md`: canonical key format, global capture, multi-stroke
  sequences, registry matching, custom capture, and conflict checks.
- `docs/url-filtering.md`: command URL visibility rules, allow/deny matching
  and precedence semantics, and rule management.
- `docs/permissions.md`: required vs optional permissions, grant flows,
  inheritance, and execution-time checks.
- `docs/settings.md`: settings storage shape, command settings, merge/prune
  semantics, and the Redux mirror.
- `docs/settings-page.md`: options-page MVP, command catalog, global hidden
  commands, and future settings-page direction.
- `docs/workflow-automation.md`: the implemented workflow step vocabulary
  (the content executor in `content/workflow/`), background-to-content
  execution path, public validation, and the lockstep invariant.
- `docs/automations.md`: automations ("Automations") — document schema and
  caps, triggers, the engine (interpolation/segments/lowering/control flow),
  runCommand policy, options builder, import safety, and store posture.
- `docs/automation_context.md`: standalone LLM-authoring context for automations
  — the full self-contained document schema (every step/trigger/condition with
  caps, the complete icon list, interpolation rules, the runCommand allowlist),
  worked example envelopes, and a "what fails validation" checklist. Paste into
  an LLM to generate/extend an automation JSON blob (the paste-import/copy-export
  sharing flow on the Automations page); references no source files and the
  examples are kept import-valid.
- `docs/surfaces.md`: the Surfaces primitive — a background-owned,
  owner-namespaced store of declarative overlays/badges rendered by one generic
  `SurfaceHost`; `monocle-surfaces-get` + the `monocle-surfaces-changed` broadcast. The
  reusable basis for feature and automation page UI.
- `docs/features.md`: the Feature-module registry — how a feature contributes
  commands, a typed config + settings page, runtime state, and page UI (via
  surfaces); the `monocle-feature-config` / `monocle-feature-state` stores.
- `docs/focus-mode.md`: Focus Mode, the first feature — blocklist, timed/
  Pomodoro sessions, and a hard-block overlay + new-tab badge expressed entirely
  as declarative surfaces (no focus-specific UI or messages).
- `docs/element-hider.md`: Element Hider, the third feature — the first consumer
  of three generic extensions: the interactive `picker` surface (element
  selection reported back via `monocle-surface-action`), generic `monocle-surface-action` owner
  routing to a feature's `handleAction`, and feature-owned (projected)
  automations that re-hide on page load via the existing `hideElement` op.
- `docs/calculations.md`: inline calculations — the shared `ContentBlock`
  schema + `ContentBlocks` renderer (the seed of the shared `ui/` layer), the
  background calculation provider registry (Math/Units via mathjs, Time via
  `Intl`), prepending results to root search, and the `calculation` suggestion's
  copy-on-select. First custom-UI-in-palette case and stepping stone to v_next
  Surfaces.
- `docs/new-tab-and-theme.md`: new-tab override, new-tab-only commands,
  background image behavior, clock settings, and theme application.
- `docs/store-submission.md`: Chrome Web Store / Firefox AMO submission
  processes, Monocle-specific rejection risks, hard pre-submission blockers,
  and reviewer-notes guidance (external policy research, June 2026).
- `docs/native-messaging/`: **proposed (not built)** design for a native-messaging
  bridge letting an external desktop app (first target: Raycast) request the
  active tab's command suggestions. Folder covers architecture, the native host
  (manifests/registration/framing/loopback server), the wire protocol +
  `ExternalSuggestion` DTO, bluetooth-style pairing/auth + loopback threat model,
  the one-host-per-browser/profile problem, and extension wiring (a
  `native-messaging` feature module reusing `getCommands`/`commandsToSuggestions`
  + the search index, the pairing modal surface, and `nativeMessaging`/`tabs`/
  Chrome-`key` manifest changes).
- `docs/commands/`: per-category command catalogs: `browser.md`, `tools.md`,
  `ui.md`, `new-tab.md`, `automations.md` (automation rows),
  `features.md` (feature-module commands, including Focus Mode), and
  `websites.md` (the GitHub prototype and the in-progress website command
  direction).

## Current Baseline

Current feature status:

| Feature | Status | Notes |
| --- | --- | --- |
| Command system | Working with review notes | Core `CommandNode` to `Suggestion` pipeline is buildable, context-aware, and shared by both palette modes. |
| Palette UI and navigation | Working with review notes | Content overlay and new-tab mode share command palette components and Redux navigation. |
| Browser commands | Working with review notes | Permission inheritance and high-risk keybinding policy have focused tests; manual Chrome/Firefox validation is still needed. |
| Keybindings | Working with review notes | Canonicalization, context-aware registry coverage, custom conflicts, and scoped sequence state have focused tests; manual browser smoke is still needed. |
| Permissions and settings | Working with review notes | Optional permission requests, command-setting compatibility, global hidden command behavior, settings catalog, update validation, and URL-rule management have focused tests; manual Chrome/Firefox permission prompts and options-page smoke still need checks. |
| URL filtering, website commands, and site SDK | Partial | `urlRules` works; the GitHub/contextual command prototype is loaded but not a full plugin system. `window.Monocle` supports non-privileged session-only site commands. |
| Workflow automation | Working with review notes | The full step vocabulary (click/wait/fill/type/key/select/check/uncheck/submit/focus/blur/scroll/hover/getText/removeElement/hideElement/injectCss) is implemented in `content/workflow/`, schema-accepted, and covered by linkedom tests; privileged ops are automation engine ops. Manual fixture-page smoke is still needed. |
| Automations (Automations) | Working with review notes | Declarative automation documents: schema + caps validation, `monocle-automations` storage, background engine (interpolation, segmentation, lowering, branch/forEach/while, runCommand policy), manual/urlMatch/elementAppears/interval/schedule/onStartup triggers, generated palette commands, and the options builder with validated import/export. Storage, validation, lowering, conditions, policy, command generation, engine, and trigger-engine behavior have focused tests; manual browser smoke (triggers, schedules, builder) is still needed. |
| New tab and theme | Working with review notes | New-tab command context, theme targets, settings persistence, and background fallback behavior have focused tests; visual/manual coverage is still needed. |
| Snippets | Working with review notes | Create/insert palette commands, `monocle-snippets` storage, options Snippets page, caret insertion via `monocle-text-insert`, custom shortcuts gated by `keybindingRequirements` (modifier required so bindings fire inside inputs), and insert-time placeholders (`{date:FORMAT}` via date-fns, `{i}` persisted counter, `{url}`/`{title}`/`{domain}`/`{path}`/`{uuid}`/`{timestamp}`); storage CRUD, message validation, requirement enforcement, catalog rows, delete-cleanup, and placeholder interpolation have focused tests; manual insertion/shortcut smoke is still needed. |
| Surfaces | Working with review notes | Generic declarative-UI primitive: background-owned, owner-namespaced store (`monocle-surfaces`) of overlays/badges/modals (`{kind, urlMatch, targetTabId?, blocking, content:{icon,title,text,countdownTo,blocks}}`), rendered by one `SurfaceHost` mounted in the closed content shadow root (`overlay`+`modal`) and on the new tab (`badge`). `modal` is a centered, dismissible card built on the shared shadcn Dialog (`shared/components/ui/dialog.tsx`, portal-container-aware so it stays inside the closed shadow root) that renders structured `ContentBlock`s (the shared calculation/`ContentBlocks` vocabulary) and is the first kind triggered by a **command** — `execute()` runs in background and calls the store directly (owner `command:<id>`, per-session like `automation:*`, both cleared on startup). `monocle-surfaces-get {url}` filters by URL and optional sender-tab target (stamps `ownerId`) + `monocle-surfaces-changed` broadcast; `monocle-surface-action {ownerId,surfaceId,actionId,value?,selection?}` reports interactions: `dismiss` → `removeSurface` (universal); any other action **routes to the owner**: feature owners to the feature's `handleAction` (the same path as `monocle-feature-action-execute`, with the picker `selection` + sender tab in context), and **command owners (`command:<id>`) to a handler the command registered via `background/commands/surfaceActionHandlers.ts`** (the command-side equivalent of `handleAction`); automation owner routing still deferred. A fourth, interactive kind `picker` (content-only, mounted alongside `overlay`+`modal`) puts the page into element pick-mode: `content/picker/` highlights on hover, suppresses page pointer gestures while active, and on click resolves a stable CSS selector and reports a rich `PickedElement` (`shared/types/picker.ts`) via `monocle-surface-action element-picked` — it never mutates the page. An owner can also set the picker's optional `content.css` (a list of CSS property names) to have content capture `getComputedStyle` values into `selection.css` (used by the `inspect-element-fonts` command). URL gating reuses `matchesUrlPattern`; picker surfaces also use `targetTabId` to avoid duplicate same-URL tabs entering pick-mode. Store get/set/clear/upsert/remove + URL/tab gating + `ownerId` stamping + `command:`/`automation:` cleanup, modal render + dismiss (dual-DOM), `monocle-surface-action` validation + feature/command owner routing, picker selector generation + computed-css capture, and picker gesture suppression have focused tests; manual overlay/badge/modal/picker smoke is still needed. |
| Feature modules | Working with review notes | Background-owned `FeatureModule` registry (`background/features/`) contributing palette commands, a declarative settings page (FormField schema + Zod config validation + action buttons), runtime state, and lifecycle. Three stores: command settings (unchanged), `monocle-feature-config` (durable), `monocle-feature-state` (runtime). Generic `monocle-features-get`/`monocle-feature-config-update`/`monocle-feature-action-execute` messages; options Features pages with `SchemaForm`. Page UI is rendered through the generic Surfaces primitive, not per-feature components. The schema also supports a `record-list` FormField (per-row + per-child action buttons, rows projected via `settings.lists`, actions dispatched with a scalar `payload`) for features that manage a list of records. A feature may also contribute read-only **projected automations** via the optional `automations(config)` hook — merged into the automation engine/trigger system by `background/automations/registry.ts` (`getAllAutomations`/`getAutomationById`), never stored, tagged `owner:{kind:"feature"}`, and shown read-only on the Automations page. Config/state stores, registry projection (incl. lists), command contribution, automation merge, and message validation (incl. payload) have focused tests; manual options + cross-tab smoke is still needed. |
| Focus Mode | Working with review notes | First feature: URL blocklist, timestamp-based session (indefinite/timed/Pomodoro) in `monocle-feature-state` with a single `chrome.alarms` end alarm. UI is built entirely on the Surfaces primitive — `projectFocusSurfaces` emits a blocking overlay (scoped to the blocklist) + a new-tab badge; no focus-specific UI/messages. `isUrlBlocked`, session timing, config schema, and surface projection have focused tests; manual overlay/countdown smoke is still needed. |
| Calculations | Working with review notes | Inline calculations (`background/calculations/`, a sibling registry to features). Providers are data + one pure synchronous `parse` (Math/Units via **mathjs**, Time via `Intl.DateTimeFormat`); `runCalculationProviders` is called from `handleSearchCommands` and **prepends** ephemeral `calculation` suggestions to root search (no new message, excluded from favorites/usage/index). Results render structured `ContentBlock`s (`shared/types/content.ts` + Zod `contentValidation.ts`) via the shared `ContentBlocks` renderer (`shared/components/ContentBlocks/`, built on the new `shared/components/ui/` boundary — the shadcn-consolidation seed). The `calculation` suggestion copies `copyValue` on select (copy-and-stay) via `useCopyToClipboard`/`useToast`. mathjs is hardened (injection functions disabled) and lives in the background bundle only. Replaced the old `calculator` group command. The Units provider splits on the last `in`/`to` keyword and normalizes the source for natural weight/height notation (alias pre-pass incl. `pounds`/`st`, foot-inch symbols `5'10"`, and `+`-summed multi-unit phrases like `6 stone 4 lb`). Provider parsing (incl. weight/height notation), content-block validation, and dual-DOM ContentBlocks rendering have focused tests; manual palette smoke (both modes) still needed. |
| Tab Groups | Working with review notes | Second feature (`background/features/tabGroups/`). Cross-browser **saved collections** (named tab lists with per-tab `pinned`, Firefox container `cookieStoreId`, and `muted` audio state, stored in `monocle-feature-config`): Save Tabs as Group, Restore Tab Group, managed on the settings page via the `record-list` field (Restore/Rename/Delete per group, Pin/Unpin per tab). Restore reapplies `muted` cross-browser and reopens tabs in their saved container on Firefox only (Chrome ignores `cookieStoreId`). Chrome-only **native-group** commands (`chrome.tabs.group`/`chrome.tabGroups.*`, wrapped in `background/utils/browserTabGroups.ts`, gated `supportedBrowsers:["chrome"]` + optional `tabGroups` permission): add tab to group, group window, rename/recolor/collapse/ungroup. Capture/restore (pinned + container + mute), storage CRUD + pin toggle, handleAction routing, lists projection, and native `supportedBrowsers` have focused tests; manual Chrome/Firefox smoke still needed. |
| Element Hider | Working with review notes | Third feature (`background/features/elementHider/`) and first consumer of the picker/owner-routing/feature-automation extensions. Config (`monocle-feature-config`) is per-domain `{id,urlPattern,selector,label}` rules. "Hide element on this page" pushes a tab-targeted `picker` surface; on click the feature `handleAction("element-picked")` saves a domain rule (`*://host/*`, preserving non-default ports), removes the picker, and hides immediately via a one-shot `hideElement` workflow. `automations(config)` projects one read-only `elementAppears` automation per rule (one `hideElement` step) so stale selectors cannot block unrelated hides. Settings page manages rules via `record-list` (Delete per row). Projection (per-rule + every doc valid against `AutomationSchema` + deterministic ids), `handleAction` (picked/delete), selector round-trip, picker gesture suppression, and the merged registry have focused tests; manual pick/hide/reload smoke still needed. |

Last verified validation:

- `pnpm run tsc` passes.
- `pnpm run fmt:check` passes.
- `pnpm test` passes cleanly (exit 0, 611 tests) with focused command-system,
  palette-search (index/scoring/monocle-commands-search/slice staleness),
  browser-command, keybinding, URL-filtering, settings-management,
  snippet-storage, workflow-executor (full op vocabulary), automation
  (storage/validation/lowering/conditions/policy/commands/engine/trigger-engine/
  scheduled-alarm sync), template-interpolation, new-tab/theme/background,
  feature-registry (config/state stores, projection incl. record-list lists,
  command contribution),
  feature-owned-automation merge (`getAllAutomations`/`getAutomationById`),
  element-hider (config-to-automation projection + every doc valid against
  `AutomationSchema`, handleAction picked/delete) and picker selector generation,
  monocle-surface-action owner routing,
  focus-mode (URL blocking, session timing, config schema, surface projection),
  tab-groups (capture/restore with pinned + Firefox container + mute,
  saved-group storage CRUD + pin toggle, handleAction routing, lists
  projection, native supportedBrowsers),
  calculations (Math/Units/Time providers, runCalculationProviders, content-block
  validation, dual-DOM ContentBlocks rendering),
  surfaces-store (owner set/clear/upsert/remove, URL gating, session-owner
  cleanup incl. `command:`, `ownerId` stamping, change broadcast), modal surface
  render + dismiss (dual-DOM SurfaceHost), QR generation (background SVG data
  URL), feature/surfaces/monocle-surface-action-message validation, and GitHub
  parsing coverage. (Note: a fire-and-forget toast that rejects when the
  background is unreachable used to surface as an unhandled rejection and make
  the run exit non-zero despite all tests passing — `useToast` now swallows that
  rejection, and the DOM-test harness registers a `fakeBrowser` message
  listener.)
- `pnpm run build` passes for the Chrome MV3 target.
- `pnpm run build:firefox` passes for the Firefox MV3 target.

Always use `pnpm`, not `npm` or `yarn`.

## Repository Shape

This is a pnpm + Turborepo monorepo. Today there is one workspace package,
`apps/extension` (the WXT extension); `packages/*` is reserved for shared code
to be extracted later. Root scripts (`pnpm run build`, `test`, `tsc`, `dev:*`)
delegate to the package through Turbo; `fmt`/`fmt:check` run biome via
`pnpm --filter`. `apps/marketing/` is hand-authored static HTML with no build
step and no `package.json`, so pnpm skips it as a workspace package.

```text
monocle/
├── package.json         # Workspace root: Turbo orchestrator scripts
├── turbo.json           # Task pipeline (build/test/tsc/dev, .output caching)
├── pnpm-workspace.yaml   # packages: apps/* + packages/*
├── apps/
│   ├── extension/       # The WXT extension (its own package.json + configs:
│   │   │                #   wxt.config.ts, tsconfig.json, biome.json, vitest)
│   │   ├── entrypoints/ # WXT background, content, and new-tab entrypoints
│   │   ├── background/  # Service worker, commands, messages, keybindings,
│   │   │                #   automations (storage/engine/triggers/alarms),
│   │   │                #   features (registry/config/state, focus/, tabGroups/, elementHider/), surfaces,
│   │   │                #   calculations (inline-calculation provider registry)
│   │   ├── content/     # Content-script overlay, workflow executor
│   │   │                #   (content/workflow/), automation trigger service
│   │   ├── newtab/      # Browser new-tab replacement
│   │   ├── options/     # Browser options/settings page
│   │   ├── shared/      # Shared React components, hooks, store, types, utils
│   │   └── test-inputs.html  # Manual workflow/input fixture page
│   └── marketing/       # Static marketing/docs HTML site (no build, no package.json)
└── docs/                # Feature and subsystem reference docs
```

All paths in the feature docs and below are relative to `apps/extension/`.

The important boundaries are:

- Background code may call privileged browser APIs.
- UI code should use typed background messages instead of directly reaching
  into browser-only behavior.
- Shared UI components must work in both content shadow DOM and new-tab DOM.
- Command definitions must stay background-owned; UI receives `Suggestion`
  values, not executable functions.
- Settings persistence should go through `background/commands/settings.ts` and
  the established message/update paths.

## Core Data Flows

Command loading, search, and execution:

1. Content or new-tab UI sends `monocle-commands-get` with current browser context.
2. `background/commands/index.ts` loads command nodes, applies browser/context
   compatibility, applies URL filtering, ranks suggestions, and computes
   favorites — the root empty state.
3. Commands are converted into UI-facing `Suggestion` values.
4. The shared palette renders suggestions with CMDK as a list renderer only
   (`shouldFilter={false}`).
5. Typing debounces ~200ms and sends `monocle-commands-search`; the background scores
   entries from an in-memory search index
   (`background/commands/searchIndex.ts`, event/TTL-invalidated, URL rules
   applied at query time) and returns top-N suggestions with deep-search
   matches inline. Child group pages search via `parentPath`; form pages
   bypass search; `search`-type pages keep `monocle-command-children-get`.
6. UI sends `monocle-command-execute` with command id, context, modifier, and form
   values.
7. Background resolves the command, checks permissions, runs the executor, and
   records usage.

Nested command navigation:

1. Selecting a group or search command asks the background for child commands.
2. `getChildrenCommands` resolves dynamic children, applies filtering, and
   converts them to suggestions.
3. `shared/store/slices/navigation.slice.ts` pushes a new page with child
   suggestions, search state, and inline form defaults.
4. Actions or submits execute with the current page form values.

Settings and permissions:

1. Settings are stored under `monocle-settings` in `chrome.storage.local`.
2. Redux mirrors settings and permission state for responsive UI.
3. Browser permission APIs remain authoritative.
4. Chrome permission requests route through the background. Firefox can request
   directly where supported.

Keybindings:

1. UI capture normalizes key events into canonical strings such as
   `<cmd-shift-k>`.
2. UI sends `monocle-keybinding-execute`.
3. The background registry resolves exact matches or sequence prefixes.
4. Matching commands execute through the same command execution path.

Workflow automation:

1. A command (or the automation engine, per content segment) sends a workflow.
2. Background forwards it to the resolved target tab as
   `monocle-workflow-content-execute`.
3. The content script runs the executor in `content/workflow/`.
4. Results (including `getText` var extractions) return through the chain.

The full content step vocabulary is implemented and schema-accepted; privileged
operations (navigate/openUrl/clipboard/runCommand) are automation engine ops,
never workflow steps.

Automations (Automations):

1. A stored document runs from its generated palette command
   (`automation-<uuid>`), an armed page trigger (content reports
   `monocle-automation-trigger-fired`; the background re-validates), or a
   `chrome.alarms` schedule.
2. `background/automations/engine.ts` re-reads the document by id,
   interpolates background-side, lowers contiguous content steps onto
   workflows, runs privileged ops between segments, and enforces the runtime
   limits (concurrency, cooldowns, loop caps, runCommand policy).

Feature modules (`docs/features.md`):

1. The `background/features/` registry holds `FeatureModule`s. Each contributes
   palette commands (added to `source.ts` under the `features` category), an
   optional settings page (FormField schema + Zod `configSchema` + actions),
   and an optional `init()` lifecycle hook (called from `background/index.ts`).
2. Durable feature config lives in `monocle-feature-config` (replace-whole,
   validated); transient runtime state lives in `monocle-feature-state` —
   both keyed by feature id, both distinct from `monocle-settings`.
3. The options Features pages render descriptors via `monocle-features-get` and persist
   through `monocle-feature-config-update` / run actions via `monocle-feature-action-execute`.
4. Feature page UI is rendered through the generic Surfaces primitive (below),
   not per-feature components — a feature pushes surfaces from its lifecycle.

Surfaces (`docs/surfaces.md`):

1. `background/surfaces.ts` is an owner-namespaced store (`monocle-surfaces`) of
   declarative overlays/badges/modals. Owners are features (e.g. `focus-mode`),
   automations (`automation:<id>`), or commands (`command:<id>`); every mutation
   broadcasts `monocle-surfaces-changed`. `command:`/`automation:` owners are
   per-session (cleared on startup).
2. The one generic `SurfaceHost` (mounted in the closed content shadow root with
   `overlay`+`modal`+`picker`, and on the new tab with `badge`) queries
   `monocle-surfaces-get {url}` on mount/navigation/broadcast and renders the surfaces of
   the kinds it owns. URL gating reuses `matchesUrlPattern`; the closed shadow
   root makes a `blocking` overlay a true hard block. A `modal` renders
   structured `ContentBlock`s; the interactive `picker` kind enters element
   pick-mode and reports the clicked element via `monocle-surface-action`.
3. `monocle-surface-action` handling: `dismiss` removes the surface (universal); any
   other action routes to the owner — a feature's `handleAction` (same path as
   `monocle-feature-action-execute`) or a command's registered handler
   (`background/commands/surfaceActionHandlers.ts`), each carrying the picker
   `selection` + sender tab.
4. Focus Mode projects its overlay+badge here (`projectFocusSurfaces`);
   automations push surfaces via the `showSurface`/`hideSurface` engine ops; a
   command pushes from its `execute()` (e.g. the QR-code modal in
   `tools/urlAsQrCode.ts`, Element Hider's `picker`, or the
   `inspect-element-fonts` font picker).

## Command System Contract

Commands are typed `CommandNode` values in `shared/types/commands.ts`. UI rows
are typed `Suggestion` values in `shared/types/ui.ts`.

Supported command node families include:

- `action`: executable command.
- `submit`: form-style executable command.
- `group`: dynamic container with child commands.
- `search`: dynamic search-backed command page.
- `input`: inline field rendered as a command item.
- `display`: static non-executable row.

Command authors should:

- Use the discriminated `type` field.
- Use kebab-case ids.
- Declare optional permissions through `permissions`.
- Declare browser support through `supportedBrowsers` when relevant.
- Declare URL visibility through `urlRules` when a command is contextual.
- Use canonical keybinding strings, for example `<cmd-shift-k>`.
- Use dynamic ids sparingly and usually disable custom keybindings for data
  that changes over time.
- Prefer NoOp/display rows for empty/error child states over alerts.
- Add commands to the appropriate category index, then make sure the relevant
  orchestration path actually loads that category.

Deep search currently flattens action and submit descendants from groups that
opt into `enableDeepSearch`. Do not assume input or display rows flatten into
root search.

Inline form values live in navigation state. Text/select/radio/color-style
fields store strings; multi-value fields can store arrays in UI state and are
normalized by background execution paths for compatibility with older command
executors.

## Palette UI Contract

Both content overlay and new-tab mode use the shared components under
`shared/components/Command/`.

Important files:

- `entrypoints/content.tsx`: defines the WXT content script and injects the
  content overlay host.
- `content/scripts.tsx`: renders the content palette into the WXT shadow host.
- `content/components/ContentCommandPalette.tsx`: controls overlay visibility,
  settings, permissions, command fetching, and global keybindings.
- `newtab/NewTabApp.tsx`: loads new-tab settings and renders the new-tab app.
- `newtab/components/NewTabCommandPalette.tsx`: fetches commands with
  `{ isNewTab: true }`.
- `shared/components/Command/CommandPalette.tsx`: shared palette shell.
- `shared/hooks/useCommandNavigation.tsx`: imperative wrapper over the
  navigation slice.
- `shared/store/slices/navigation.slice.ts`: page stack, search values,
  dynamic child pages, loading/errors, and form values.

When changing shared palette behavior, check both:

- Content mode in a closed shadow DOM.
- New-tab mode in normal DOM.

CMDK search state is synchronized with Redux in a few direct/fragile places.
Any navigation, Escape, Backspace, or search restoration change needs manual
regression checks.

## Permissions And Settings Contract

Required generated manifest permissions are declared in `wxt.config.ts`.
Optional permissions are requested on demand for browser command groups.

Permission and setting changes should respect these invariants:

- Commands declare required permissions; UI surfaces grant actions when missing.
- Execution still checks permissions in the background before protected work.
- Browser permission truth must override stale Redux state.
- Command settings are keyed by command id.
- `updateCommandSettings` shallow-merges command settings. Preserve nested
  state explicitly when updating nested structures such as `urlRules`.
- URL rule validation is custom; matching, update validation, and nested-merge
  behavior have focused tests (`urlFilter.test.ts`, `validation.test.ts`,
  `settings.test.ts`).

## URL Filtering And Website Commands

`urlRules` is the current command visibility layer. It is not yet a full plugin
system.

Implemented:

- Command-defined allow/deny URL rules.
- User-persisted allow/deny rules per command.
- Hide from Domain generated action.
- Manage Command Allow List / Deny List commands.
- Root and child command filtering by current page URL.

In progress:

- `background/commands/websites/` contains a GitHub contextual command
  prototype.
- `websiteCommands` is loaded by `background/commands/source.ts`, but website
  commands are still command arrays with URL rules rather than a first-class
  plugin registry.
- `background/commands/siteSdk/` stores page-owned SDK registrations per
  tab/document/origin and converts validated declarations into background-owned
  `CommandNode` wrappers.

Before broadening website commands, decide whether they are just command arrays
with `urlRules` or a first-class registry with metadata, activation policy, and
plugin-owned hooks.

## Keybinding Contract

Canonical keybindings use angle-bracket format:

- Single stroke: `<cmd-k>`, `<ctrl-d>`, `<alt-shift-f>`.
- Plain keys: `g`, `escape`, `space`, `enter`.
- Sequences: `<cmd-k>, <cmd-s>` or `g, g`.

Executable nodes can declare `keybindingRequirements` (e.g.
`requireNonShiftModifier` for commands whose shortcuts must fire while an
editable element is focused — snippets and typing automations opt in). Requirements are enforced at
assignment time in both capture UIs and on persist
(`shared/utils/keybinding-requirements.ts`); see `docs/keybindings.md`.

Important files:

- `shared/utils/key-normalizer.ts`
- `shared/utils/event-filter.ts`
- `shared/utils/robust-key-capture.ts`
- `shared/hooks/useGlobalKeybindings.tsx`
- `background/keybindings/registry.ts`
- `background/messages/executeKeybinding.ts`
- `shared/components/KeybindingDisplay.tsx`
- `shared/components/Command/CommandActionsList.tsx`

Known risk: registry and conflict coverage is not uniform across every command
source. Browser, tool, Firefox, and deep-search commands are covered more
explicitly than UI, new-tab, and website commands.

## Workflow And Automation Contract

The workflow vocabulary (`shared/types/workflow.ts`) contains ONLY
content-executable operations, and every member is implemented in
`content/workflow/` and accepted by the public schema
(`shared/types/workflowValidation.ts`). The lockstep invariant is binding: a
new op lands as one unit — type, schema entry, executor case, tests — and
unsupported ops fail loudly, never silently.

Automations (`docs/automations.md`) layer on top:

- Documents are data, never code: validated by the shared Zod schema
  (`shared/types/automationValidation.ts`) at save, import, the message
  boundary, and re-checked structurally by the engine at run time.
- Content steps reuse the workflow vocabulary verbatim and lower 1:1
  (`background/automations/lowering.ts` is the single mapping site, tested
  against the public schema). Privileged ops (navigate, openUrl,
  clipboardWrite, runCommand, insertSnippet, toast, showSurface/hideSurface)
  and control flow run in the engine between content segments.
- Interpolation is background-side (`{{var}}` templates + snippet
  placeholders); the content executor never learns templating, and selector
  values are never interpolatable.
- `runCommand` is policy-gated (`background/automations/runCommandPolicy.ts`):
  no confirm-gated commands, no recursion, no debug tools; non-manual runs are
  restricted to a static allowlist.
- Imported documents arrive with non-manual triggers disarmed and are saved
  only after the user reviews the generated summary.
- There is deliberately no arbitrary-JS step; do not add one (store policy —
  see `docs/automations.md`).

## Known Architectural Risks

These are the easy traps to avoid:

- `background/commands/index.ts` is now a thin barrel over focused modules
  (`source.ts`, `query.ts`, `execution.ts`, `suggestions.ts`, ...). Keep it
  logic-free; add new responsibilities to the right module (or a new one),
  never back to the root.
- `allCommands` is context-free, so global management surfaces can miss
  context-only command sources such as new-tab commands.
- Permission-protected dynamic groups should preserve clear permission UI paths
  when permissions are missing or revoked.
- Keybinding sequence state lives in the background service worker, scoped per
  sender tab/document (`getSequenceScopeKey` in
  `background/messages/executeKeybinding.ts`). Senders without tab data fall
  back to a context key and can still collide across tabs.
- Automated tests are narrow. Use the manual checklists in `docs/` for browser
  integration behavior in the feature area you touch.

## Development Commands

Run these from the repo root; Turbo delegates to `apps/extension` (or run them
inside `apps/extension/` directly):

```bash
pnpm run dev
pnpm run dev:chrome
pnpm run dev:firefox
pnpm run tsc
pnpm run fmt:check
pnpm run build
pnpm run build:firefox
```

`build:zip` / `build:firefox:zip` exist on the extension package (run via
`pnpm --filter @monocle/extension run build:zip` or from inside the package).
`pnpm run fmt` writes formatting changes (biome, via `pnpm --filter`).
`pnpm test` runs the focused Vitest suite, but manual browser checks are still
required for extension API behavior.

## Working Rules For Future Changes

- Read the relevant doc in `docs/` before changing a feature.
- Trace data from source to sink before editing. For Monocle, this usually
  means UI event -> background message -> command/settings/browser API boundary
  -> Redux/UI response.
- Keep privileged browser API usage in background utilities or background
  commands unless an extension API explicitly requires a content-side flow.
- Keep UI components executable-function-free. They render suggestions and send
  messages.
- Match existing command, settings, Redux, and message patterns before adding a
  new abstraction.
- If you touch shared palette behavior, manually check both content overlay and
  new-tab mode.
- If you touch permissions, test grant, denial, and already-granted states.
- If you touch keybindings, test editable passthrough, capture, display,
  conflict detection, and execution.
- If you touch URL rules, test allow, deny, wildcard, domain-generated patterns,
  root filtering, and child filtering.
- If you touch workflow automation or automations, keep the lockstep
  invariant (schema + executor + tests land together), add or use
  fixture-page checks, and never treat unsupported steps as successful.
- Do not remove or overwrite unrelated untracked work. The untracked `.codex/`
  and `background/commands/websites/` paths are intentional in-progress work.
