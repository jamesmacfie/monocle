# Monocle Documentation

This folder is the reference documentation for Monocle: how the extension is
built, how every subsystem behaves, the full command schema, and catalogs of
every shipped command. The docs describe **verified, current behavior** — each
doc was written against the source it cites, and anywhere the type model is
broader than the implementation (workflow automation especially), the doc says
explicitly what is and is not implemented.

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

## Palette behavior

- [search-and-ranking.md](./search-and-ranking.md) — Palette search (two-stage
  background selection + CMDK filtering), keywords, usage ranking, favorites,
  and deep search.
- [execution-and-actions.md](./execution-and-actions.md) — Execution flow,
  plain Enter vs modifier-Enter, action labels, the action menu, and generated
  actions (favorite / hide-from-domain / custom keybinding).
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

## Specialized subsystems

- [new-tab-and-theme.md](./new-tab-and-theme.md) — New-tab boot, `isNewTab`
  context, clock, Unsplash background, permission-grant panel, and the
  light/dark/system theme system.
- [workflow-automation.md](./workflow-automation.md) — The workflow type model
  vs the implemented executor (`click` + `wait` only), target-tab routing,
  public validation, and the debug command.

## Publishing

- [store-submission.md](./store-submission.md) — Chrome Web Store and Firefox
  AMO submission: review processes, Monocle-specific rejection risks
  (single-purpose, site SDK, permissions), hard pre-submission blockers, and
  reviewer-notes guidance. Describes external policy as researched in
  June 2026, not code behavior.

## Command catalogs

- [commands/browser.md](./commands/browser.md) — Every browser command: tabs,
  windows, navigation, bookmarks, history, downloads, sessions, clear-data,
  and the Firefox container/reader commands.
- [commands/tools.md](./commands/tools.md) — Tool commands: calculator, copy
  UUID v4, debug workflow.
- [commands/ui.md](./commands/ui.md) — UI/settings commands: toggle theme,
  Manage Allow List, Manage Deny List, clear favorites.
- [commands/new-tab.md](./commands/new-tab.md) — New-tab-only commands: the
  Clock group and visibility toggles.
- [commands/websites.md](./commands/websites.md) — Website contextual
  commands: the GitHub prototype (urlRules-scoped repo/PR/issue actions,
  Toggle Star workflow) and how that differs from the page-owned SDK.

## Conventions used in these docs

- Source is cited by repo-relative path and exported symbol name (for example
  `background/commands/index.ts`, `commandsToSuggestions`), never line
  numbers.
- Canonical keybindings use the angle-bracket form: `<cmd-shift-k>`, plain
  `g`, sequences `<cmd-k>, <cmd-s>`.
- "Known issues" sections record verified gaps and risks; "Manual checks"
  sections list browser-integration behavior the automated tests do not cover.
- When behavior changes, update the relevant doc here first, then adjust
  `CLAUDE.md` only if the root guidance changes.
