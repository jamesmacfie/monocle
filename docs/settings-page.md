# Settings Page (Design Proposal)

> **Status: design proposal, not current behavior.** Unlike the rest of `docs/`,
> which describes verified, shipped behavior, this document proposes a feature
> that does **not exist yet**. Sections are explicitly split into **Exists today**
> (accurate to the cited source) and **Proposed**. Nothing here is implemented;
> treat type/message/storage shapes as design intent to be reviewed, not contracts.

Monocle's configuration is, today, entirely **palette-native**: you change a
setting by running a command. That is elegant for quick toggles but has a low
ceiling — there is no overview, no bulk editing, no way to globally hide a
command you never want to see, and no place to grow toward richer per-command
configuration or user scripts. This document designs a **dedicated settings page**:
a standalone extension page with a sidebar and real sub-pages, built on the
stack the project already uses, that becomes the long-term home for everything
configurable in Monocle.

Locked decisions (agreed before writing this doc):

- **Delivery vehicle:** a dedicated WXT **options-page entrypoint**, not a route
  inside the new-tab app.
- **Scope:** comprehensive vision — near-term and future capabilities are
  designed at comparable depth.
- **Tech stack:** **shadcn/ui + Tailwind** for the page chrome, **Redux** for
  state (already used), and **Wouter** (hash routing) for sidebar navigation.

---

## 1. What exists today

Every configuration surface is a command or a generated action, rendered by the
same palette used for everything else. There is **no** `options_ui` /
`options_page` entrypoint — the new-tab override is the only extension page.

| Concern | How it's configured today | Source |
| --- | --- | --- |
| Theme (`light`/`dark`/`system`) | `toggle-theme` command (cycles modes) | `background/commands/ui/theme.ts` |
| New-tab clock visibility | `toggle-clock-visibility` (under the `new-tab-clock` group) | `background/commands/newTab/` |
| New-tab background | Auto-fetched from Unsplash, cached in `localStorage`; gradient fallback | `newtab/components/BackgroundImage.tsx`, `newtab/backgroundImageModel.ts` |
| Per-command visibility (per domain) | `manage-allow-list` / `manage-deny-list` group commands + generated **Hide from Domain** action | `background/commands/ui/manageAllowList.ts`, `manageDenyList.ts`, `background/commands/index.ts` |
| Per-command keybinding | Generated **Set / Reset Custom Keybinding** actions in the action menu | `background/commands/index.ts`, `shared/components/Command/CommandActionsList.tsx` |
| Favorites | Inline ♡ toggle action per command; `clear-favorites` command | `background/commands/favorites.ts` |
| Permissions | Inline grant actions on permission-gated rows; new-tab grant panel | `shared/components/Command/PermissionActions.tsx`, `newtab/components/PermissionGrantPanel.tsx` |
| Clear browser data | `clear-browser-data` nested group (data type × time span) | `background/commands/browser/clearBrowserData.ts` |

### Storage model (the foundation everything builds on)

Three independent `chrome.storage.local` keys, deliberately separate (see
[settings.md](./settings.md)):

| Key | Owner | Shape |
| --- | --- | --- |
| `monocle-settings` | `background/commands/settings.ts` | `{ theme, newTab, commands }` |
| `monocle-favoriteCommandIds` | `background/commands/favorites.ts` | `string[]` of command ids |
| `monocle-commandUsage` | `background/commands/usage.ts` | `{ commandStats, lastCleanup }` |

`CommandSettings` (per command, keyed by id) is currently **only**:

```ts
// shared/types/settings.ts (exists today)
export interface CommandSettings {
  keybinding?: string
  urlRules?: UrlRules // { allowUrls?: string[]; denyUrls?: string[] }
}
```

Four properties of this model matter for the design below:

1. **Additive-only, no migrations.** Compatibility relies on defaulting missing
   fields to `{}` on load. New fields must be optional and tolerant of partial
   documents.
2. **`mergeCommandSettings` special-cases `urlRules`** with a second merge level
   so updating `allowUrls` preserves `denyUrls`. **Any new nested setting needs
   its own merge branch and test** — a naive add will be clobbered on update.
3. **Query-time filtering precedent.** `urlRules` are not baked into the catalog;
   they are applied *when the palette asks for commands* (root empty-state, search
   index, children). Management surfaces still see filtered commands. A global
   "hidden" flag fits this exact stage.
4. **Favorites and usage are not in `CommandSettings`** — they are separate keys,
   so a settings page that touches them talks to `favorites.ts` / `usage.ts`, not
   the settings document.

### Reusable building blocks

- **Form field renderers**: `shared/components/Command/CommandItem/*` —
  `CommandItemInput`, `CommandItemSelect`, `CommandItemSwitch`,
  `CommandItemMulti`, `CommandItemTextList`, `CommandItemColor`,
  `CommandItemDisplay`.
- **Primitives**: `shared/components/Icon.tsx` (Lucide + URL/SVG),
  `KeybindingDisplay.tsx`, `Toast.tsx` / `ToastContainer.tsx`.
- **State**: `shared/store/*` — `createAppStore`, the `settings` / `navigation` /
  `keybinding` / `commandPaletteState` slices, and `createPaletteSendMessage`.
- **Boot template**: `newtab/NewTabApp.tsx` shows how to stand up a React+Redux
  extension page (store creation, `loadSettings`/`loadPermissions`, theme
  application, and a `storage.onChanged` listener that re-hydrates settings).
- **Update path**: `update-command-setting` message
  (`background/messages/updateCommandSetting.ts`) with Zod + business-logic
  validation already handles `keybinding` and `urlRules`.

---

## 2. Why a dedicated page (and not more commands)

The palette is optimised for *doing one thing fast*. Configuration has different
needs the palette serves poorly:

- **Overview.** "Which commands have I hidden / rebound / favorited?" has no
  answer today short of walking every command's action menu.
- **Bulk operations.** Hiding twenty commands one action-menu-at-a-time is
  painful; a list with checkboxes is not.
- **No global hide.** You can hide a command *per domain* via deny rules, but
  there is no "I never want to see this, anywhere" — the headline gap this design
  closes.
- **Room to grow.** Per-command schema-driven settings, user scripts, workflow
  management, and import/export have no sensible palette home. They need pages.

A dedicated page does **not** replace the palette flows — quick toggles
(favorite, hide-from-domain, set-keybinding) stay in the action menu. The page is
the *management and overview* surface; the action menu is the *in-context quick
action* surface. They share the same underlying storage and messages.

---

## 3. Information architecture (sidebar)

A left sidebar with these sections (Wouter hash routes in parentheses):

| Section | Route | Purpose |
| --- | --- | --- |
| **General** | `#/` | Theme, default behaviors, link to keyboard shortcuts. |
| **New Tab** | `#/new-tab` | Clock, greeting, background image controls. |
| **Commands** | `#/commands` | The core: every command, grouped by category, with hide/favorite/keybinding/URL-rules/per-command settings. |
| **Favorites** | `#/favorites` | View, remove, and (future) reorder favorites. |
| **Keyboard Shortcuts** | `#/keyboard` | All bindings in one table, conflicts, reset. |
| **Sites & URL Rules** | `#/sites` | Domain-centric view of allow/deny rules; read-only session site-SDK registrations. |
| **Permissions** | `#/permissions` | Grant/revoke optional permissions. |
| **User Scripts** | `#/user-scripts` | *(Future)* Author/import page-scoped scripts. |
| **Workflows** | `#/workflows` | *(Future)* Manage and test automation workflows. |
| **Data & Privacy** | `#/data` | Export/import settings, granular reset, usage analytics, clear-data shortcuts. |
| **About** | `#/about` | Version, links, credits. |

Deep-linkability matters: `chrome.runtime.openOptionsPage()` plus a hash lets a
palette command or an action-menu item jump straight to a section (e.g. "Open
Settings → Keyboard Shortcuts", or the future "Hide command…" opening
`#/commands` filtered to that command).

---

## 4. Feature designs

Each feature is specified as **data model → storage → background message → UI →
enforcement**, so the page stays a pure UI surface (renders metadata, sends
messages — no executable functions, per the background-ownership contract).

### 4.1 Hide commands globally (headline feature)

The new capability: mark a command as **hidden** so it never appears in the
palette — root empty-state, search results, or as a child — regardless of URL.

**Data model (additive).**

```ts
// shared/types/settings.ts (proposed)
export interface CommandSettings {
  keybinding?: string
  urlRules?: UrlRules
  hidden?: boolean // proposed: true => never shown in the palette
  // config?: Record<string, unknown>   // see 4.2
}
```

`hidden` is a leaf boolean, so the existing shallow merge in
`mergeCommandSettings` handles it correctly — **no new merge branch needed** (only
nested structures like `config` need one). `pruneCommandSettings` should drop
`hidden: false` so the default never persists.

**Storage.** Reuses `monocle-settings → commands[id].hidden` via
`updateCommandSettings(id, { hidden })`.

**Background message.** Extend the `update-command-setting` discriminated union
with a `"hidden"` variant (`value: boolean`). No business-logic validation beyond
the boolean. The handler writes the setting and **invalidates the search index**
(`background/commands/searchIndex.ts`) so a hidden command disappears from search
immediately, mirroring how the index is event/TTL-invalidated today.

**Enforcement (query-time, not catalog-time).** Apply `hidden` in the same filter
stage that applies `urlRules` — `background/commands/query.ts` /
`background/commands/index.ts` — so it covers root, search index, and children in
one place. Crucially, the **settings catalog endpoint (§6) must bypass this
filter**, so hidden commands remain visible *in the settings page* to be un-hidden.

**Hide-vs-disable semantics (recommended default + variant).** Recommended:
hidden = removed from *view and search* only; a custom **keybinding still fires**.
This lets power users de-clutter the palette without losing muscle-memory
shortcuts. A stricter variant — `hidden` also removes the command from the
keybinding registry — is a one-line change at registry-build time if desired.
This is an open question (§9) to confirm with the user, but the recommended
default is "hidden from view, keybinding still works".

**Action-menu entry point.** Add a generated `hide-command-<id>` action alongside
the existing favorite / hide-from-domain / set-keybinding actions in
`background/commands/index.ts`, plus a `unhide-command-<id>` when already hidden
(mirroring set/reset-keybinding). This is the in-context quick-hide that
complements the page's bulk view. (The user noted the Alt-menu addition is a
follow-up; the design accounts for it now so the data model doesn't change later.)

### 4.2 Per-command schema-driven settings

Some commands want their own typed configuration (e.g. a "default download
folder", a "screenshot format", a calculator's "decimal precision"). Today there
is no mechanism. Proposed:

**Declarative schema on the command.**

```ts
// shared/types/commands.ts (proposed)
interface CommandNodeBase {
  // ...existing fields...
  settingsSchema?: FormField[] // reuse the existing FormField union
}
```

Reusing the existing `FormField` variants means the settings page renders these
with the **same `CommandItem/*` components** the palette already uses for inline
forms — no new field types.

**Storage (nested → needs a merge branch).** Values live under a new nested field:

```ts
// shared/types/settings.ts (proposed)
export interface CommandSettings {
  // ...
  config?: Record<string, unknown> // values keyed by FormField name
}
```

Because `config` is nested, `mergeCommandSettings` **must gain a `config` branch**
(spread inner object over existing) and a focused test, exactly as `urlRules` has.
This is the project's documented hazard (`docs/settings.md`): "any future nested
command setting will be replaced, not merged, unless it gets its own explicit
branch." The design calls for that branch up front.

**Background message.** A `"config"` variant on `update-command-setting`, with
business-logic validation that checks the value against the command's
`settingsSchema` (types, required, ranges) before persisting.

**Execution.** Command executors read their values via `getCommandSettings(id)`'s
`config` at run time — settings are read in the background, never injected from
the UI.

**Phasing.** This is intentionally a later phase: it requires the schema field,
the merge branch + tests, a validation layer, and executor adoption. The page
should render a clean "no configurable settings" state for commands without a
`settingsSchema` so the Commands page works before any command opts in.

### 4.3 Favorites management

The page's Favorites section reads/writes the **existing**
`monocle-favoriteCommandIds` key through `favorites.ts` (`getFavoriteCommandIds`,
`removeFromFavoriteCommandIds`, `toggleFavoriteCommandId`) — **no migration, no
schema change**. The Commands page also exposes a per-row favorite toggle that
calls the same path.

Reordering favorites would be new (favorites are an unordered `string[]` today);
if desired, that is an additive change to make the array order-significant plus a
"set favorites order" message — flagged as an open question (§9) since it touches
how favorites feed ranking ([search-and-ranking.md](./search-and-ranking.md)).

### 4.4 Keybindings, URL rules, permissions (page equivalents of existing flows)

These reuse existing storage and messages; the page is a richer UI over them:

- **Keyboard Shortcuts** — a table of every command with its effective binding
  (default vs custom), conflict highlighting via the existing
  `checkKeybindingConflict`, and set/reset using the existing
  `update-command-setting` `keybinding` path. Renders bindings with
  `KeybindingDisplay`. Honors `allowCustomKeybinding`.
- **Sites & URL Rules** — the **domain-centric inverse** of the per-command
  allow/deny commands: list domains that have rules and which commands they
  affect, plus per-command editors backed by `updateCommandUrlRules`. Patterns
  validate through the existing `validateUrlPattern`. Also shows a **read-only**
  list of current **session site-SDK registrations** per origin
  ([site-sdk.md](./site-sdk.md)) — informational, since those are session-only.
- **Permissions** — a grant/revoke table over the optional permissions, reusing
  the `get-permissions` round-trip and the Chrome/Firefox grant flows behind
  `PermissionActions` / `requestPermission` ([permissions.md](./permissions.md)).

---

## 5. Future vision

Designed at full depth so the data model and page structure don't need rework
when these land.

### 5.1 User scripts

Page-scoped automation the user authors themselves. Two distinct flavors, with
very different risk profiles:

- **Declarative workflows** (lower risk) — author steps using the existing
  workflow model ([workflow-automation.md](./workflow-automation.md)). Safe-ish
  because the executor is constrained, but today only `click` + `wait` are
  implemented, so a workflow authoring UI is gated on executor breadth.
- **JavaScript user scripts** (higher risk) — Greasemonkey-style scripts run on
  matching pages. The sanctioned MV3 path is the **`chrome.userScripts` API**
  (not `eval`/injected `<script>`), which has its own permission and toggle. This
  carries real **CSP** and **store-review** implications — arbitrary user JS is a
  classic single-purpose / "code execution" rejection risk
  ([store-submission.md](./store-submission.md)). Treat as a deliberate,
  separately-reviewed feature, likely behind an explicit opt-in.

**Proposed model & storage** (new key, keeping `monocle-settings` focused):

```ts
// proposed — monocle-userscripts (chrome.storage.local)
interface UserScript {
  id: string
  name: string
  enabled: boolean
  matches: UrlRules           // reuse allow/deny patterns
  runAt: "document_start" | "document_end" | "document_idle"
  kind: "workflow" | "js"
  source: WorkflowDefinition | string
}
```

**Page UI** — list, enable/disable, match-pattern editor, an editor (workflow
builder or code editor), and import/export. Execution routes through the existing
`executeWorkflowOnTargetTab` path (workflows) or the `userScripts` API (JS).

### 5.2 Workflow management

A page to list built-in and user workflows, edit steps, and **test-run** them
(the `debug-workflow` tool command already exercises the executor). Explicitly
gated on executor support — the UI must not present unimplemented step types as
working ([workflow-automation.md](./workflow-automation.md)).

### 5.3 Settings export / import & analytics

- **Export/import** a single JSON bundle spanning the three storage keys
  (`monocle-settings`, favorites, usage — usage optional). Centralised storage
  makes this cheap; the importer must validate and tolerate partial/old bundles
  (no migration framework).
- **Usage analytics** — surface `monocle-commandUsage` as a "most used" view and
  offer "clear usage history" (it feeds ranking, so clearing is a real action).

---

## 6. Architecture

How the page physically slots into the codebase.

### Entrypoint

A new WXT entrypoint `entrypoints/options/` (`index.html` + `main.tsx` shim) that
renders `options/OptionsApp.tsx` — structured like `newtab/`. WXT auto-detects an
`options` entrypoint and wires the manifest `options_ui` (Chrome) /
`options_ui` (Firefox) with `open_in_tab: true`; confirm against the current
`wxt.config.ts` (which builds the manifest as a function) and add explicit
`options_ui` config if auto-detection needs a nudge. Add an **`Open Settings`**
palette command (in `background/commands/ui/`) that calls
`chrome.runtime.openOptionsPage()`, optionally with a target hash.

### The command-enumeration problem (biggest lift)

The Commands page must list **every** command. But `allCommands` is **context-free
and misses context-only sources** — new-tab commands (gated on `isNewTab`),
website commands, and session site-SDK commands (per [CLAUDE.md] known risks).
The page therefore needs a **new background message — `get-settings-catalog`** —
that unions all sources and returns, per command:

- identity + category + icon + `supportedBrowsers`
- effective settings (`hidden`, `keybinding`, `urlRules`, `config`)
- capabilities (`allowCustomKeybinding`, whether it accepts `urlRules`, whether it
  declares a `settingsSchema`)
- favorite state (from `favorites.ts`) and usage stats (from `usage.ts`)

Critically, this endpoint **bypasses the query-time `hidden`/`urlRules` filter** so
hidden commands remain manageable. Session site-SDK commands are included as
read-only (they can't be persisted-hidden meaningfully since they're ephemeral).

### State

Reuse `createAppStore`. Add a dedicated **`settingsCatalog` slice** (thunk:
`loadSettingsCatalog` → `get-settings-catalog`; optimistic per-command updates →
`update-command-setting`) rather than bloating the shared `settings` slice, which
intentionally mirrors only `theme`/`newTab`/`permissions` and **not** `commands`.
Theme, new-tab, and permissions reuse the existing `settings` slice and thunks.

### Tech stack

- **Tailwind (already present, v4.1.13).** v4 uses CSS-first config (`@theme`, no
  `tailwind.config.js`). Ensure the options entrypoint's CSS is in scope and that
  **theme tokens are shared with the palette** so light/dark stays consistent.
  `clsx` and `lucide-react` are already installed.
- **shadcn/ui (new dependency).** Page chrome — sidebar, cards, tabs, switches,
  inputs, dialogs, tables, tooltips. Copy-in components on **Radix + Tailwind**;
  adding it pulls in Radix primitives, `class-variance-authority`, `tailwind-merge`
  and a `components.json` (none present today). shadcn supports Tailwind v4 (note
  the v4 init step). Renders in the options page's normal DOM, so no shadow-DOM
  containment concerns (unlike the content overlay). **Consistency risk:** the
  palette has its own `CommandItem/*` renderers. Rule of thumb — reuse the
  genuinely shared primitives (`Icon`, `KeybindingDisplay`) and use shadcn for
  everything else, with shared theme tokens for visual coherence.
- **Redux (already used)** for data; route state stays out of Redux. Clean split:
  router = "which page", Redux = "the data".
- **Wouter (new dependency) for routing.** For ~10 sidebar sections, full
  `react-router` is heavier than needed and `TanStack Router` heavier still.
  Wouter (~2KB, hooks-based) with **hash routing** fits an extension page (static
  `chrome-extension://…/options.html` URL — hash routes avoid history/base-path
  friction) and makes sections **deep-linkable** for `openOptionsPage()` jumps.
  Alternative considered: no router, active section in `useState`/Redux — simpler
  but loses deep-linking and back/forward; recommendation is Wouter.

---

## 7. Data-model & message changes (summary)

All additive and tolerant of partial documents (no migration framework).

| Change | Where | Notes |
| --- | --- | --- |
| `CommandSettings.hidden?: boolean` | `shared/types/settings.ts` | Leaf; shallow merge OK; prune `false`. |
| `CommandSettings.config?: Record<string, unknown>` | `shared/types/settings.ts` | **Nested → needs a `config` branch in `mergeCommandSettings` + test.** |
| `CommandNodeBase.settingsSchema?: FormField[]` | `shared/types/commands.ts` | Declarative; rendered by existing `CommandItem/*`. |
| `update-command-setting` gains `"hidden"`, `"config"` variants | `shared/types/validation.ts`, `background/messages/updateCommandSetting.ts` | `hidden`: boolean; `config`: validated against `settingsSchema`. |
| New `get-settings-catalog` message | `background/messages/`, `docs/messaging.md` | Context-free union of all command sources + settings/usage/favorites; bypasses query-time filter. |
| `hidden` enforcement | `background/commands/query.ts` / `index.ts` | Same stage as `urlRules`; invalidate `searchIndex` on write. |
| Generated `hide-command-<id>` / `unhide-command-<id>` actions | `background/commands/index.ts` | Action-menu quick-hide. |
| New `monocle-userscripts` key | *(future)* | Separate key, like favorites/usage. |

---

## 8. Cross-cutting risks

- **Command enumeration completeness** — the catalog must union *all* sources;
  missing new-tab/website/site-SDK commands would silently make them
  unmanageable. This is the single biggest correctness risk.
- **Live propagation** — edits in the options *tab* must reflect in open palettes.
  `NewTabApp` already re-hydrates on `storage.onChanged`; extend the same listener
  to the content overlay, and ensure background settings writes invalidate the
  search index so hides/rule changes take effect without a reload.
- **Merge/prune correctness for nested fields** — `config` must get its own merge
  branch and test, or updates will clobber sibling values (documented hazard).
- **Store-review risk** — JS user scripts are a single-purpose / code-execution
  red flag; gate behind explicit opt-in and the `userScripts` API
  ([store-submission.md](./store-submission.md)).
- **Third pure-UI surface** — the options page must stay executable-function-free:
  it renders metadata and sends messages, exactly like the palette. Command
  definitions stay background-owned.
- **Two component systems** — shadcn vs the palette's `CommandItem/*`; keep them
  visually coherent via shared theme tokens and reuse shared primitives.

---

## 9. Open questions

1. **Hide vs disable** — does a hidden command's custom keybinding still fire
   (recommended) or get removed from the registry too?
2. **Favorites ordering** — keep favorites an unordered set, or make the page
   support reordering (requires order-significant storage + a new message)?
3. **User scripts: workflow-only vs JS** — start with declarative workflows only
   (lower review risk) and defer `chrome.userScripts` JS, or design both now?
4. **Settings-page-only sources** — should ephemeral session site-SDK commands be
   listed at all (read-only), or omitted to avoid implying persistence?

---

## 10. Phased delivery

1. **MVP** — options entrypoint + shell (sidebar, Wouter, shadcn, store); **General**
   (theme) + **New Tab** (clock/background) + **Commands** page with **hide**,
   favorite toggle, keybinding, and URL rules. Ships the headline "hide command"
   value. Requires: `hidden` field + enforcement, `get-settings-catalog`, the
   action-menu `hide-command` action.
2. **Management depth** — **Keyboard Shortcuts** (conflicts), **Sites & URL Rules**,
   **Permissions**, **Favorites**.
3. **Schema-driven settings** — `settingsSchema` + `config` storage (with merge
   branch + tests) + validation; adopt in a few commands.
4. **Data & Privacy** — export/import, granular reset, usage analytics.
5. **Workflows** — management/test UI (as the executor grows).
6. **User scripts** — workflows first, then (if approved) `userScripts` JS.

---

## Related docs

- [settings.md](./settings.md) — storage shape, merge/prune semantics, the
  `update-command-setting` message, and the Redux mirror (the foundation here).
- [url-filtering.md](./url-filtering.md) — `urlRules` matching/precedence and the
  query-time filter stage `hidden` plugs into.
- [keybindings.md](./keybindings.md) — canonical format, registry, conflicts.
- [permissions.md](./permissions.md) — grant flows and the permission mirror.
- [search-and-ranking.md](./search-and-ranking.md) — favorites and usage data.
- [new-tab-and-theme.md](./new-tab-and-theme.md) — the React+Redux page template.
- [workflow-automation.md](./workflow-automation.md) — executor limits for the
  future workflow/user-script pages.
- [store-submission.md](./store-submission.md) — review risk for user scripts.
- [site-sdk.md](./site-sdk.md) — session site-SDK registrations.
