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
- `docs/user-scripts.md`: user scripts ("Automations") — document schema and
  caps, triggers, the engine (interpolation/segments/lowering/control flow),
  runCommand policy, options builder, import safety, and store posture.
- `docs/surfaces.md`: the Surfaces primitive — a background-owned,
  owner-namespaced store of declarative overlays/badges rendered by one generic
  `SurfaceHost`; `get-surfaces` + the `monocle-surfaces-changed` broadcast. The
  reusable basis for feature and automation page UI.
- `docs/features.md`: the Feature-module registry — how a feature contributes
  commands, a typed config + settings page, runtime state, and page UI (via
  surfaces); the `monocle-feature-config` / `monocle-feature-state` stores.
- `docs/focus-mode.md`: Focus Mode, the first feature — blocklist, timed/
  Pomodoro sessions, and a hard-block overlay + new-tab badge expressed entirely
  as declarative surfaces (no focus-specific UI or messages).
- `docs/new-tab-and-theme.md`: new-tab override, new-tab-only commands,
  background image behavior, clock settings, and theme application.
- `docs/store-submission.md`: Chrome Web Store / Firefox AMO submission
  processes, Monocle-specific rejection risks, hard pre-submission blockers,
  and reviewer-notes guidance (external policy research, June 2026).
- `docs/commands/`: per-category command catalogs: `browser.md`, `tools.md`,
  `ui.md`, `new-tab.md`, `automations.md` (user-script rows), and
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
| Workflow automation | Working with review notes | The full step vocabulary (click/wait/fill/type/key/select/check/uncheck/submit/focus/blur/scroll/hover/getText/removeElement/hideElement/injectCss) is implemented in `content/workflow/`, schema-accepted, and covered by linkedom tests; privileged ops are user-script engine ops. Manual fixture-page smoke is still needed. |
| User scripts (Automations) | Working with review notes | Declarative automation documents: schema + caps validation, `monocle-userscripts` storage, background engine (interpolation, segmentation, lowering, branch/forEach/while, runCommand policy), manual/urlMatch/elementAppears/interval/schedule/onStartup triggers, generated palette commands, and the options builder with validated import/export. Storage, validation, lowering, conditions, policy, command generation, engine, and trigger-engine behavior have focused tests; manual browser smoke (triggers, schedules, builder) is still needed. |
| New tab and theme | Working with review notes | New-tab command context, theme targets, settings persistence, and background fallback behavior have focused tests; visual/manual coverage is still needed. |
| Snippets | Working with review notes | Create/insert palette commands, `monocle-snippets` storage, options Snippets page, caret insertion via `monocle-insertText`, custom shortcuts gated by `keybindingRequirements` (modifier required so bindings fire inside inputs), and insert-time placeholders (`{date:FORMAT}` via date-fns, `{i}` persisted counter, `{url}`/`{title}`/`{domain}`/`{path}`/`{uuid}`/`{timestamp}`); storage CRUD, message validation, requirement enforcement, catalog rows, delete-cleanup, and placeholder interpolation have focused tests; manual insertion/shortcut smoke is still needed. |
| Surfaces | Working with review notes | Generic declarative-UI primitive: background-owned, owner-namespaced store (`monocle-surfaces`) of overlays/badges (`{kind, urlMatch, blocking, content:{icon,title,text,countdownTo}}`), rendered by one `SurfaceHost` mounted in the closed content shadow root and on the new tab. `get-surfaces {url}` query + `monocle-surfaces-changed` broadcast; URL gating reuses `matchesUrlPattern`; per-session (`userscript:*`) owners cleared on startup. Store get/set/clear/upsert/remove + URL gating have focused tests; manual overlay/badge smoke is still needed. |
| Feature modules | Working with review notes | Background-owned `FeatureModule` registry (`background/features/`) contributing palette commands, a declarative settings page (FormField schema + Zod config validation + action buttons), runtime state, and lifecycle. Three stores: command settings (unchanged), `monocle-feature-config` (durable), `monocle-feature-state` (runtime). Generic `get-features`/`update-feature-config`/`execute-feature-action` messages; options Features pages with `SchemaForm`. Page UI is rendered through the generic Surfaces primitive, not per-feature components. Config/state stores, registry projection, command contribution, and message validation have focused tests; manual options + cross-tab smoke is still needed. |
| Focus Mode | Working with review notes | First feature: URL blocklist, timestamp-based session (indefinite/timed/Pomodoro) in `monocle-feature-state` with a single `chrome.alarms` end alarm. UI is built entirely on the Surfaces primitive — `projectFocusSurfaces` emits a blocking overlay (scoped to the blocklist) + a new-tab badge; no focus-specific UI/messages. `isUrlBlocked`, session timing, config schema, and surface projection have focused tests; manual overlay/countdown smoke is still needed. |

Last verified validation:

- `pnpm run tsc` passes.
- `pnpm run fmt:check` passes.
- `pnpm test` passes with focused command-system, palette-search
  (index/scoring/search-commands/slice staleness), browser-command, keybinding,
  URL-filtering, settings-management, snippet-storage, workflow-executor
  (full op vocabulary), user-script (storage/validation/lowering/conditions/
  policy/commands/engine/trigger-engine), template-interpolation,
  new-tab/theme/background, feature-registry (config/state stores, projection,
  command contribution), focus-mode (URL blocking, session timing, config
  schema, surface projection), surfaces-store (owner set/clear/upsert/remove,
  URL gating, session-owner cleanup), feature/surfaces-message validation, and
  GitHub parsing coverage.
- `pnpm run build` passes for the Chrome MV3 target.
- `pnpm run build:firefox` passes for the Firefox MV3 target.

Always use `pnpm`, not `npm` or `yarn`.

## Repository Shape

```text
monocle/
├── entrypoints/         # WXT background, content, and new-tab entrypoints
├── background/          # Service worker, commands, messages, keybindings,
│                        #   userScripts (storage/engine/triggers/alarms),
│                        #   features (registry/config/state, focus/), surfaces
├── content/             # Content-script overlay, workflow executor
│                        #   (content/workflow/), user-script trigger service
├── newtab/              # Browser new-tab replacement
├── options/             # Browser options/settings page
├── shared/              # Shared React components, hooks, store, types, utils
├── docs/                # Feature and subsystem reference docs
├── server/              # Local support server
└── test-inputs.html     # Manual workflow/input fixture page
```

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

1. Content or new-tab UI sends `get-commands` with current browser context.
2. `background/commands/index.ts` loads command nodes, applies browser/context
   compatibility, applies URL filtering, ranks suggestions, and computes
   favorites — the root empty state.
3. Commands are converted into UI-facing `Suggestion` values.
4. The shared palette renders suggestions with CMDK as a list renderer only
   (`shouldFilter={false}`).
5. Typing debounces ~200ms and sends `search-commands`; the background scores
   entries from an in-memory search index
   (`background/commands/searchIndex.ts`, event/TTL-invalidated, URL rules
   applied at query time) and returns top-N suggestions with deep-search
   matches inline. Child group pages search via `parentPath`; form pages
   bypass search; `search`-type pages keep `get-children-commands`.
6. UI sends `execute-command` with command id, context, modifier, and form
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
2. UI sends `execute-keybinding`.
3. The background registry resolves exact matches or sequence prefixes.
4. Matching commands execute through the same command execution path.

Workflow automation:

1. A command (or the user-script engine, per content segment) sends a workflow.
2. Background forwards it to the resolved target tab as
   `execute-workflow-content`.
3. The content script runs the executor in `content/workflow/`.
4. Results (including `getText` var extractions) return through the chain.

The full content step vocabulary is implemented and schema-accepted; privileged
operations (navigate/openUrl/clipboard/runCommand) are user-script engine ops,
never workflow steps.

User scripts (Automations):

1. A stored document runs from its generated palette command
   (`userscript-<uuid>`), an armed page trigger (content reports
   `user-script-trigger-fired`; the background re-validates), or a
   `chrome.alarms` schedule.
2. `background/userScripts/engine.ts` re-reads the document by id,
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
3. The options Features pages render descriptors via `get-features` and persist
   through `update-feature-config` / run actions via `execute-feature-action`.
4. Feature page UI is rendered through the generic Surfaces primitive (below),
   not per-feature components — a feature pushes surfaces from its lifecycle.

Surfaces (`docs/surfaces.md`):

1. `background/surfaces.ts` is an owner-namespaced store (`monocle-surfaces`) of
   declarative overlays/badges. Owners are features (e.g. `focus-mode`) or
   automations (`userscript:<id>`); every mutation broadcasts
   `monocle-surfaces-changed`.
2. The one generic `SurfaceHost` (mounted in the closed content shadow root and
   on the new tab) queries `get-surfaces {url}` on mount/navigation/broadcast and
   renders the surfaces of the kinds it owns. URL gating reuses
   `matchesUrlPattern`; the closed shadow root makes a `blocking` overlay a true
   hard block.
3. Focus Mode projects its overlay+badge here (`projectFocusSurfaces`);
   automations push surfaces via the `showSurface`/`hideSurface` engine ops.

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
editable element is focused — snippets and typing user scripts opt in). Requirements are enforced at
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

## Workflow And User Script Contract

The workflow vocabulary (`shared/types/workflow.ts`) contains ONLY
content-executable operations, and every member is implemented in
`content/workflow/` and accepted by the public schema
(`shared/types/workflowValidation.ts`). The lockstep invariant is binding: a
new op lands as one unit — type, schema entry, executor case, tests — and
unsupported ops fail loudly, never silently.

User scripts (`docs/user-scripts.md`) layer on top:

- Documents are data, never code: validated by the shared Zod schema
  (`shared/types/userScriptValidation.ts`) at save, import, the message
  boundary, and re-checked structurally by the engine at run time.
- Content steps reuse the workflow vocabulary verbatim and lower 1:1
  (`background/userScripts/lowering.ts` is the single mapping site, tested
  against the public schema). Privileged ops (navigate, openUrl,
  clipboardWrite, runCommand, insertSnippet, toast, showSurface/hideSurface)
  and control flow run in the engine between content segments.
- Interpolation is background-side (`{{var}}` templates + snippet
  placeholders); the content executor never learns templating, and selector
  values are never interpolatable.
- `runCommand` is policy-gated (`background/userScripts/runCommandPolicy.ts`):
  no confirm-gated commands, no recursion, no debug tools; non-manual runs are
  restricted to a static allowlist.
- Imported documents arrive with non-manual triggers disarmed and are saved
  only after the user reviews the generated summary.
- There is deliberately no arbitrary-JS step; do not add one (store policy —
  see `docs/user-scripts.md`).

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

Use pnpm scripts:

```bash
pnpm run dev
pnpm run dev:chrome
pnpm run dev:firefox
pnpm run tsc
pnpm run fmt:check
pnpm run build
pnpm run build:firefox
pnpm run build:zip
pnpm run build:firefox:zip
```

`pnpm run fmt` writes formatting changes. `pnpm test` runs the focused Vitest
suite, but manual browser checks are still required for extension API behavior.

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
- If you touch workflow automation or user scripts, keep the lockstep
  invariant (schema + executor + tests land together), add or use
  fixture-page checks, and never treat unsupported steps as successful.
- Do not remove or overwrite unrelated untracked work. The untracked `.codex/`
  and `background/commands/websites/` paths are intentional in-progress work.
