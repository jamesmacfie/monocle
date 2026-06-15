# Monocle Documentation

This folder is the reference documentation for Monocle: how the extension is
built, how every subsystem behaves, the full command schema, and catalogs of
every shipped command. Unless a file lives under `docs/proposals/`, the docs
describe **verified, current behavior** — each doc was written against the
source it cites, and anywhere the type model is broader than the implementation
(workflow automation especially), the doc says explicitly what is and is not
implemented.

Proposal docs under `docs/proposals/` are different: they describe future design
direction and must not be treated as shipped behavior until the relevant feature
has been implemented and the verified docs below have been updated.

Read [architecture.md](./architecture.md) first if you are new to the codebase.
If you are adding a command, the fast path is
[authoring-commands.md](./authoring-commands.md) →
[command-schema.md](./command-schema.md).

## Start here

- [architecture.md](./architecture.md) — System overview: the two runtime modes
  (content overlay vs new-tab), background-ownership boundaries, Redux store
  layout, WXT build system, and the core data flows.
- [messaging.md](./messaging.md) — Complete background message protocol:
  every UI→background message, background→tab messages, request/response
  shapes, validation layers, and the send-side utilities.

## Command model

- [command-schema.md](./command-schema.md) — Field-by-field `CommandNode`
  reference: `CommandNodeBase`, `AsyncValue`, action labels and modifier
  labels, all `FormField` variants, and which fields cross into `Suggestion`.
- [command-types.md](./command-types.md) — The six command node types
  (`action`, `submit`, `group`, `search`, `input`, `display`) in depth, with
  rendering and selection behavior for each.
- [authoring-commands.md](./authoring-commands.md) — Practical guide to adding
  and registering a command: category folders, loaders, conventions,
  form/search patterns, and common pitfalls.
- [site-sdk.md](./site-sdk.md) — Page-world `window.Monocle` SDK for
  non-privileged, session-only site commands.
- [site-sdk-security.md](./site-sdk-security.md) — Threat model for the site
  SDK: attacker model, containment guarantees, page-reachable risks, and
  defense-in-depth gaps.

## Palette behavior

- [search-and-ranking.md](./search-and-ranking.md) — Palette search (two-stage
  background selection + CMDK filtering), keywords, usage ranking, favorites,
  and deep search.
- [execution-and-actions.md](./execution-and-actions.md) — Execution flow,
  plain Enter vs modifier-Enter, action labels, the action menu, and generated
  actions (favorite / hide-command / hide-from-domain / custom keybinding).
- [palette-ui-and-navigation.md](./palette-ui-and-navigation.md) — Shared
  palette component tree, the navigation page stack, inline inputs/forms,
  CMDK↔Redux sync, and overlay vs new-tab differences.
- [keybindings.md](./keybindings.md) — Canonical key format, event
  capture/passthrough, multi-stroke sequences, the context-aware registry,
  custom bindings, and conflict detection.

## Configuration and gating

- [url-filtering.md](./url-filtering.md) — `urlRules` allow/deny lists,
  matching and precedence semantics, Hide from Domain, and the Manage
  Allow/Deny List commands.
- [permissions.md](./permissions.md) — Required vs optional permissions, grant
  flows (Chrome vs Firefox), inheritance, and execution-time checks vs the
  Redux mirror.
- [settings.md](./settings.md) — Settings storage shape (`monocle-settings`),
  command settings, merge/prune semantics, the `update-command-setting`
  message, and the Redux mirror.
- [settings-page.md](./settings-page.md) — Options-page settings catalog, global
  hidden commands, favorites, keyboard shortcuts, URL rules, and future
  settings-page direction.

## Specialized subsystems

- [surfaces.md](./surfaces.md) — The Surfaces primitive: a background-owned,
  owner-namespaced store of declarative overlays, badges, modals, and pickers
  rendered by one generic
  `SurfaceHost`; the `get-surfaces` query and `monocle-surfaces-changed`
  broadcast. The reusable basis for feature and automation page UI.
- [features.md](./features.md) — The Feature-module registry: how a feature
  contributes commands, a typed config + settings page, runtime state, and
  page UI (via surfaces); the two stores (`monocle-feature-config`,
  `monocle-feature-state`).
- [focus-mode.md](./focus-mode.md) — Focus Mode, the first feature: blocklist,
  timed/Pomodoro sessions, the hard-block content overlay, and the new-tab
  status widget.
- [element-hider.md](./element-hider.md) — Element Hider, the third feature:
  the interactive `picker` surface, generic `surface-action` owner routing, and
  feature-owned (projected) automations that re-hide elements on page load.
- [calculations.md](./calculations.md) — Inline calculations: the shared
  `ContentBlock` schema + `ContentBlocks` renderer, the background calculation
  provider registry (Math/Units via mathjs, Time via `Intl`), how results are
  prepended to root search, and the `calculation` suggestion's copy-on-select.
- [new-tab-and-theme.md](./new-tab-and-theme.md) — New-tab boot, `isNewTab`
  context, clock, Unsplash background, permission-grant panel, and the
  light/dark/system theme system.
- [workflow-automation.md](./workflow-automation.md) — The implemented workflow
  step vocabulary (the content executor in `content/workflow/`), target-tab
  routing, public validation, the lockstep invariant, and the debug command.
- [user-scripts.md](./user-scripts.md) — User scripts ("Automations"):
  declarative user-authored automation documents — schema and caps, triggers
  (manual, urlMatch, elementAppears, schedules), the engine
  (interpolation/segments/lowering/control flow), runCommand policy, the
  options builder, import safety, and store posture.

## Future proposals

- [proposals/README.md](./proposals/README.md) — Future-design proposals. These
  are intentionally not current behavior; promote details into the verified docs
  only after implementation.
- [shortkeys.md](./shortkeys.md) — Research: gap analysis against the
  Shortkeys extension's action catalog — which of its actions Monocle
  already ships, which are easy wins under the current architecture, and
  which to skip. Research, not behavior documentation.

## Publishing

- [store-submission.md](./store-submission.md) — Chrome Web Store and Firefox
  AMO submission: review processes, Monocle-specific rejection risks
  (single-purpose, site SDK, permissions), hard pre-submission blockers, and
  reviewer-notes guidance. Describes external policy as researched in
  June 2026, not code behavior.
- [marketing-site.md](./marketing-site.md) — Build spec for the one-page
  marketing site: design direction, visual tokens, full HTML structure, copy
  deck, and screenshot capture list. Describes a site to be built, not
  current extension behavior.

## Command catalogs

- [commands/browser.md](./commands/browser.md) — Every browser command: tabs,
  windows, navigation, bookmarks, history, downloads, sessions, clear-data,
  and the Firefox container/reader commands.
- [commands/tools.md](./commands/tools.md) — Tool commands: copy UUID v4, debug
  workflow, snippets. (Arithmetic is now an inline calculation, not a command —
  see [calculations.md](./calculations.md).)
- [commands/ui.md](./commands/ui.md) — UI/settings commands: toggle theme,
  Manage Allow List, Manage Deny List, clear favorites.
- [commands/new-tab.md](./commands/new-tab.md) — New-tab-only commands: the
  Clock group and visibility toggles.
- [commands/websites.md](./commands/websites.md) — Website contextual
  commands: the GitHub prototype (urlRules-scoped repo/PR/issue actions,
  Toggle Star workflow) and how that differs from the page-owned SDK.
- [commands/automations.md](./commands/automations.md) — The Automations
  category: the user-scripts group, generated per-script rows, and the
  Create/Manage commands.
- [commands/features.md](./commands/features.md) — The Features category:
  commands contributed by feature modules, including the Focus Mode commands.

## Conventions used in these docs

- Source is cited by repo-relative path and exported symbol name (for example
  `background/commands/suggestions.ts`, `commandsToSuggestions`), never line
  numbers.
- Canonical keybindings use the angle-bracket form: `<cmd-shift-k>`, plain
  `g`, sequences `<cmd-k>, <cmd-s>`.
- "Known issues" sections record verified gaps and risks; "Manual checks"
  sections list browser-integration behavior the automated tests do not cover.
- When behavior changes, update the relevant doc here first, then adjust
  `CLAUDE.md` only if the root guidance changes.
