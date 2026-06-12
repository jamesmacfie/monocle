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
- `docs/workflow-automation.md`: workflow type model, background-to-content
  execution path, implemented click behavior, and unsupported operations.
- `docs/new-tab-and-theme.md`: new-tab override, new-tab-only commands,
  background image behavior, clock settings, and theme application.
- `docs/store-submission.md`: Chrome Web Store / Firefox AMO submission
  processes, Monocle-specific rejection risks, hard pre-submission blockers,
  and reviewer-notes guidance (external policy research, June 2026).
- `docs/commands/`: per-category command catalogs: `browser.md`, `tools.md`,
  `ui.md`, `new-tab.md`, and `websites.md` (the GitHub prototype and the
  in-progress website command direction).

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
| Workflow automation | Partial | Click workflows and focused wait conditions work; validation/routing/debug feedback have focused tests, and most operations remain unsupported. |
| New tab and theme | Working with review notes | New-tab command context, theme targets, settings persistence, and background fallback behavior have focused tests; visual/manual coverage is still needed. |
| Snippets | Working with review notes | Create/insert palette commands, `monocle-snippets` storage, options Snippets page, and caret insertion via `monocle-insertText`; storage CRUD and message validation have focused tests; manual insertion smoke (inputs, textareas, contenteditable, new-tab fallback) is still needed. |

Last verified validation:

- `pnpm run tsc` passes.
- `pnpm run fmt:check` passes.
- `pnpm test` passes with focused command-system, palette-search
  (index/scoring/search-commands/slice staleness), browser-command, keybinding,
  URL-filtering, settings-management, snippet-storage, workflow automation,
  new-tab/theme/background, and GitHub parsing coverage.
- `pnpm run build` passes for the Chrome MV3 target.
- `pnpm run build:firefox` passes for the Firefox MV3 target.

Always use `pnpm`, not `npm` or `yarn`.

## Repository Shape

```text
monocle/
├── entrypoints/         # WXT background, content, and new-tab entrypoints
├── background/          # Service worker, commands, messages, keybindings
├── content/             # Content-script overlay and workflow executor
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

1. A command sends `execute-workflow`.
2. Background forwards the workflow to the active tab as
   `execute-workflow-content`.
3. The content script runs `content/workflowExecutor.ts`.
4. Results return through the message chain.

Only click workflows are meaningfully implemented today. Do not imply that the
full workflow type model is supported.

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

## Workflow Automation Contract

The workflow types are intentionally broader than the current executor.

Implemented in `content/workflowExecutor.ts`:

- CSS selector lookup.
- Text selector lookup.
- Scoped text lookup.
- Basic visibility checks.
- Scroll into view.
- Click execution.
- Modifier flags for fallback click events.
- Wait conditions for `timeMs`, selector attached/visible/hidden/detached,
  `urlIncludes`, and document `readyState`.
- Per-step retry and timeout handling for supported content-side steps.

Not implemented or incomplete:

- Navigation.
- Hover, focus, blur, fill, type, key combo, select, check, uncheck, submit,
  scroll, copy, and clipboard write.
- Variable interpolation.
- Background privileged operations such as tab navigation and clipboard write.

Public workflow message validation currently accepts only implemented `click`
and `wait` steps. Treat the broader workflow type model as future design until
each operation is implemented and tested.

## Known Architectural Risks

These are the easy traps to avoid:

- `background/commands/index.ts` is already overloaded with loading,
  filtering, ranking, action generation, execution dispatch, and settings
  effects. Avoid adding more unrelated responsibilities there.
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
- If you touch workflow automation, add or use fixture-page checks. Do not
  silently treat unsupported workflow steps as successful.
- Do not remove or overwrite unrelated untracked work. The untracked `.codex/`
  and `background/commands/websites/` paths are intentional in-progress work.
