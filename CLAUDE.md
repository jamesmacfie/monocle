# CLAUDE.md

Canonical agent guide for the Monocle browser extension. `AGENTS.md` is a
symlink to this file so Claude Code and Codex read the same instructions.

This file is the stable architecture map, working contract, and feature-status
owner. Detailed behavior lives in `docs/` — treat those as source of truth and
read the relevant one before editing a feature. When behavior changes, update
the doc first; update this file only when the root guidance or status changes.

## Project Overview

Monocle is a WXT + TypeScript + React + Redux browser extension providing a
VS Code-style command palette. It runs in two modes:

- **Content overlay**: injected into pages, isolated in a closed shadow DOM,
  opened with the global palette shortcut.
- **New-tab**: replaces the browser new-tab page with a persistent palette.

The background service worker owns command definitions, browser API access,
settings, permissions, keybindings, and workflow forwarding. UIs fetch UI-safe
`Suggestion` values and execute via typed messages — they never receive
executable command functions.

## Development Commands

Run from repo root (Turbo delegates to `apps/extension`) or inside the package:

```bash
pnpm run dev            # + dev:chrome / dev:firefox
pnpm run tsc
pnpm run fmt            # fmt:check to verify only (biome)
pnpm run build          # + build:firefox
pnpm test               # focused Vitest suite — manual browser checks still required
```

- Always use `pnpm`, never `npm`/`yarn`.
- `build:zip` / `build:firefox:zip` live on the extension package.
- Bridge has isolated tasks: `pnpm run dev:bridge` / `build:bridge`, and
  `cargo test` in `apps/bridge/src-tauri` (not part of `pnpm test`/`build`).

## Repository Shape

pnpm + Turborepo monorepo. Workspace packages: `apps/extension` (the WXT
extension), `apps/bridge` (Tauri native-messaging host), and
`packages/native-bridge-protocol` (shared bridge wire contract). `apps/raycast`
and `apps/marketing` are intentionally outside the workspace (no Turbo enrolment;
marketing is static HTML with no build).

```text
monocle/
├── package.json / turbo.json / pnpm-workspace.yaml   # root orchestration
├── apps/
│   ├── extension/          # WXT extension (own package.json, wxt.config.ts, vitest)
│   │   ├── entrypoints/     # WXT background / content / new-tab entrypoints
│   │   ├── background/      # service worker, commands, messages, keybindings,
│   │   │                    #   automations, features/, surfaces, calculations
│   │   ├── content/         # overlay, workflow executor, automation triggers
│   │   ├── newtab/          # new-tab replacement
│   │   ├── options/         # settings page
│   │   └── shared/          # shared React components, hooks, store, types, utils
│   ├── bridge/             # Tauri native host (one binary: daemon + relay modes)
│   ├── raycast/            # Raycast client (isolated from workspace)
│   └── marketing/          # static HTML (no build)
├── packages/native-bridge-protocol/   # public bridge DTOs + Zod schemas
└── docs/                  # feature and subsystem reference docs
```

All paths in this file and the docs are relative to `apps/extension/`.

**Boundaries:**

- Background code may call privileged browser APIs.
- UI code uses typed background messages, never browser-only behavior directly.
- Shared UI components must work in both content shadow DOM and new-tab DOM.
- Command definitions stay background-owned; UI gets `Suggestion`s, not functions.
- Settings persistence goes through `background/commands/settings.ts`.

## Documentation Map

Read the relevant doc before editing related code.

- `docs/README.md` — documentation index, reading order, conventions.
- `docs/architecture.md` — runtime modes, entrypoints, ownership, store layout, data flows.
- `docs/messaging.md` — full message protocol: every message, payload, handler.
- `docs/command-schema.md` — `CommandNode` reference, `AsyncValue`, `FormField`, node→`Suggestion`.
- `docs/command-types.md` — the six node types and their rendering/selection behavior.
- `docs/authoring-commands.md` — adding/registering a command: folders, loaders, patterns, pitfalls.
- `docs/site-sdk.md` / `docs/site-sdk-security.md` — page-world `window.Monocle` SDK and its threat model.
- `docs/search-and-ranking.md` — palette search, keywords, usage ranking, favorites, deep search.
- `docs/execution-and-actions.md` — execution flow, enter vs modifier-enter, action menu, generated actions.
- `docs/palette-ui-and-navigation.md` — shared palette UI, overlay, new-tab, navigation stack, inline inputs.
- `docs/keybindings.md` — canonical format, global capture, sequences, registry matching, conflicts.
- `docs/url-filtering.md` — command URL visibility, allow/deny precedence, rule management.
- `docs/permissions.md` — required vs optional permissions, grant flows, inheritance, runtime checks.
- `docs/settings.md` / `docs/settings-page.md` — settings storage shape and the options page.
- `docs/workflow-automation.md` — content-executable workflow vocabulary and the lockstep invariant.
- `docs/automations.md` — declarative automation documents: schema, triggers, engine, runCommand policy.
- `docs/automation_context.md` — standalone LLM-authoring context for generating automation JSON blobs.
- `docs/surfaces.md` — declarative overlays/badges/modals/picker rendered by one `SurfaceHost`.
- `docs/features.md` — the `FeatureModule` registry: commands, settings page, state, page UI.
- `docs/focus-mode.md` / `docs/tab-groups.md` / `docs/element-hider.md` — the first three features.
- `docs/calculations.md` — inline calculations and the shared `ContentBlock` renderer.
- `docs/snippets.md` — snippet storage, insert commands, placeholders, keybinding gating.
- `docs/new-tab-and-theme.md` — new-tab override, new-tab-only commands, theme application.
- `docs/store-submission.md` — Chrome/Firefox submission risks and pre-submission blockers.
- `docs/native-messaging/` — the native-messaging bridge (extension + `apps/bridge` host).
- `docs/extension-extension/` — letting other extensions contribute commands to Monocle.
- `docs/commands/` — per-category command catalogs (browser, tools, ui, new-tab, automations, features, websites).

## Current Baseline

Most features are **working with review notes**: focused tests exist, but manual
Chrome/Firefox browser smoke is still needed. See the linked doc for behavior
detail and per-feature manual checklists.

| Feature | Status | Doc |
| --- | --- | --- |
| Command system | Working (review notes) | command-schema, command-types |
| Palette UI and navigation | Working (review notes) | palette-ui-and-navigation |
| Browser commands | Working (review notes) | commands/browser |
| Keybindings | Working (review notes) | keybindings |
| Permissions and settings | Working (review notes) | permissions, settings |
| URL filtering / website commands / site SDK | Partial | url-filtering, site-sdk — `urlRules` works; website commands are still command arrays, not a plugin registry |
| Workflow automation | Working (review notes) | workflow-automation |
| Automations | Working (review notes) | automations |
| New tab and theme | Working (review notes) | new-tab-and-theme |
| Snippets | Working (review notes) | snippets |
| Surfaces | Working (review notes) | surfaces |
| Feature modules | Working (review notes) | features |
| Focus Mode / Tab Groups / Element Hider | Working (review notes) | focus-mode, tab-groups, element-hider |
| Calculations | Working (review notes) | calculations |
| Native Bridge | Partial (extension done; bridge host macOS M0/M1) | native-messaging — open: real browser round-trip, Chrome `key` pin, M2–M4 |
| Extension-to-Extension Commands | Working (review notes) | extension-extension — manual cross-extension smoke still needed |

**Last verified validation:** `pnpm run tsc`, `pnpm run fmt:check`, `pnpm test`
(703 tests, exit 0), `pnpm run build` (Chrome), and `pnpm run build:firefox` all
pass. `apps/bridge`: `cargo test` (4 tests) and `pnpm run build:bridge` pass;
daemon HTTP + UDS relay round-trip verified headless (`MONOCLE_BRIDGE_HEADLESS=1`).

## Core Data Flows

**Command loading, search, execution:**

1. UI sends `monocle-commands-get` with browser context.
2. `background/commands/index.ts` (a thin barrel) loads nodes, applies
   browser/context compatibility + URL filtering, ranks, computes favorites.
3. Nodes convert to UI-facing `Suggestion`s.
4. The shared palette renders with CMDK as a list renderer only (`shouldFilter={false}`).
5. Typing debounces ~200ms → `monocle-commands-search`; background scores an
   in-memory index (`searchIndex.ts`, event/TTL-invalidated) and returns top-N
   with deep-search matches inline. Group pages search via `parentPath`; form
   pages bypass search; `search`-type pages use `monocle-command-children-get`.
6. UI sends `monocle-command-execute` (id, context, modifier, form values).
7. Background resolves, checks permissions, runs the executor, records usage.

**Nested navigation:** selecting a group/search command → `getChildrenCommands`
resolves dynamic children + filtering + suggestions → `navigation.slice.ts`
pushes a page with children, search state, and inline form defaults.

**Settings/permissions:** stored under `monocle-settings` in
`chrome.storage.local`; Redux mirrors for UI but browser permission APIs are
authoritative. Chrome permission requests route through background; Firefox can
request directly where supported.

**Keybindings:** UI normalizes events to canonical strings →
`monocle-keybinding-execute` → background registry resolves exact match or
sequence prefix → executes through the command path.

**Workflow automation:** a command/automation sends a workflow → background
forwards to the target tab as `monocle-workflow-content-execute` → content
executor (`content/workflow/`) runs it → results (incl. `getText` vars) return.
Privileged ops (navigate/openUrl/clipboard/runCommand) are automation engine
ops, never content workflow steps.

**Automations:** run from a generated palette command (`automation-<uuid>`), an
armed page trigger, or a `chrome.alarms` schedule. `engine.ts` re-reads the
document by id, interpolates background-side, lowers contiguous content steps
onto workflows, runs privileged ops between segments, enforces runtime limits.

**Feature modules** (`docs/features.md`): `background/features/` registry holds
`FeatureModule`s — each contributes palette commands, an optional settings page
(FormField schema + Zod config + actions), and an optional `init()`. Durable
config → `monocle-feature-config`; runtime state → `monocle-feature-state` (both
keyed by feature id, both distinct from `monocle-settings`). Page UI is rendered
through Surfaces, not per-feature components.

**Surfaces** (`docs/surfaces.md`): `background/surfaces.ts` is an
owner-namespaced store (`monocle-surfaces`) of overlays/badges/modals/pickers.
Owners are features, automations (`automation:<id>`), or commands
(`command:<id>`; per-session, cleared on startup). The one generic `SurfaceHost`
queries `monocle-surfaces-get {url}` and renders. `monocle-surface-action`:
`dismiss` removes (universal); any other action routes to the owner's
`handleAction` (feature) or registered handler (command).

## Contracts

### Command system

Commands are `CommandNode` values (`shared/types/commands.ts`); UI rows are
`Suggestion` values (`shared/types/ui.ts`). Node families: `action`, `submit`,
`group`, `search`, `input`, `display`.

Authors should: use the discriminated `type`; kebab-case ids; declare optional
`permissions`, `supportedBrowsers`, and `urlRules` when relevant; use canonical
keybinding strings; use dynamic ids sparingly (usually disable custom keybindings
for changing data); prefer NoOp/display rows over alerts for empty states; add
the command to its category index AND confirm the orchestration path loads that
category.

Deep search only flattens `action`/`submit` descendants of groups with
`enableDeepSearch` — not `input`/`display`. Inline form values live in navigation
state; multi-value fields may be arrays in UI state, normalized at execution.

### Palette UI

Both modes use `shared/components/Command/`. Key files: `entrypoints/content.tsx`,
`content/scripts.tsx`, `content/components/ContentCommandPalette.tsx`,
`newtab/NewTabApp.tsx` + `NewTabCommandPalette.tsx`, `CommandPalette.tsx`,
`shared/hooks/useCommandNavigation.tsx`, `navigation.slice.ts`.

CMDK search state syncs with Redux in a few fragile places. Any navigation,
Escape, Backspace, or search-restoration change needs manual regression checks
in **both** content (closed shadow DOM) and new-tab (normal DOM) modes.

### Permissions and settings

Required manifest permissions are in `wxt.config.ts`; optional ones are requested
on demand. Invariants:

- Commands declare required permissions; UI surfaces grant actions when missing;
  execution re-checks in background before protected work.
- Browser permission truth overrides stale Redux state.
- Command settings are keyed by command id. `updateCommandSettings`
  shallow-merges — preserve nested state (e.g. `urlRules`) explicitly.

### URL filtering and website commands

`urlRules` is the visibility layer (not yet a plugin system). Implemented:
command-defined + user allow/deny rules, Hide-from-Domain action, Manage
Allow/Deny List commands, root + child filtering. In progress:
`background/commands/websites/` (GitHub prototype) and `siteSdk/`. Before
broadening: decide whether website commands stay command arrays with `urlRules`
or become a first-class registry.

### Keybindings

Angle-bracket format: `<cmd-k>`, `<alt-shift-f>`, plain `g`/`escape`, sequences
`<cmd-k>, <cmd-s>`. Nodes can declare `keybindingRequirements` (e.g.
`requireNonShiftModifier` so bindings fire inside editable elements — snippets
and typing automations opt in), enforced at assignment and persist
(`shared/utils/keybinding-requirements.ts`). Key files: `key-normalizer.ts`,
`event-filter.ts`, `robust-key-capture.ts`, `useGlobalKeybindings.tsx`,
`keybindings/registry.ts`, `messages/executeKeybinding.ts`. Risk: registry/
conflict coverage is uneven (UI, new-tab, website commands less covered).

### Workflow and automation

The workflow vocabulary (`shared/types/workflow.ts`) is content-executable ops
ONLY, each implemented in `content/workflow/` and accepted by
`workflowValidation.ts`. **Lockstep invariant:** a new op lands as one unit —
type + schema + executor case + tests; unsupported ops fail loudly.

Automations layer on top: documents are data, validated by
`automationValidation.ts` at save/import/message boundary and re-checked by the
engine. Content steps lower 1:1 (`automations/lowering.ts`). Interpolation is
background-side; selectors are never interpolatable. `runCommand` is policy-gated
(`runCommandPolicy.ts`: no confirm-gated/recursive/debug; non-manual restricted
to an allowlist). Imported docs arrive with non-manual triggers disarmed.
**There is deliberately no arbitrary-JS step — do not add one.**

## Known Architectural Risks

- `background/commands/index.ts` is a thin barrel over focused modules
  (`source.ts`, `query.ts`, `execution.ts`, `suggestions.ts`, …). Keep it
  logic-free; add responsibilities to the right module.
- `allCommands` is context-free, so global management surfaces can miss
  context-only sources (e.g. new-tab commands).
- Permission-protected dynamic groups must preserve clear permission UI when
  permissions are missing/revoked.
- Keybinding sequence state lives in the background worker, scoped per sender
  tab/document (`getSequenceScopeKey`); senders without tab data fall back to a
  context key and can collide across tabs.
- Automated tests are narrow — use the manual checklists in `docs/`.

## Working Rules

- Read the relevant `docs/` file before changing a feature.
- Trace data source→sink first: UI event → background message → command/settings/
  browser API → Redux/UI response.
- Keep privileged browser APIs in background; keep UI components
  executable-function-free.
- Match existing command/settings/Redux/message patterns before adding an
  abstraction.
- Touch shared palette behavior → check both content and new-tab modes.
- Touch permissions → test grant, denial, already-granted.
- Touch keybindings → test editable passthrough, capture, display, conflicts,
  execution.
- Touch URL rules → test allow, deny, wildcard, domain patterns, root + child filtering.
- Touch workflows/automations → keep the lockstep invariant; never treat
  unsupported steps as successful.
- Do not remove or overwrite unrelated untracked work (`.codex/` and
  `background/commands/websites/` are intentional in-progress paths).
