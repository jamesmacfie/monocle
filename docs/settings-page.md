# Settings Page

> **Status: Phase 1 plus management pages implemented.** Monocle now has a WXT
> options page with General, New Tab, Commands, Favorites, Keyboard, Snippets,
> Automations, URL Rules, and About sections. Later sections in this document
> remain future design unless explicitly described as implemented.

Monocle's configuration is split between **palette-native quick actions** and a
dedicated **settings page**. The palette remains the fastest way to toggle or
run something in context; the options page is the overview and management
surface for broader command settings such as global hiding, favorites,
keybindings, and URL rules.

Locked decisions (agreed before writing this doc):

- **Delivery vehicle:** a dedicated WXT **options-page entrypoint**, not a route
  inside the new-tab app.
- **Scope:** comprehensive vision — near-term and future capabilities are
  designed at comparable depth.
- **Tech stack:** local shadcn-style primitives + Tailwind for the page chrome,
  **Redux** for state (already used), and **Wouter** (hash routing) for sidebar
  navigation.

---

## 1. What exists today

The Phase 1 options page is a standalone WXT options entrypoint at
`entrypoints/options/`, rendered by `options/OptionsApp.tsx`. It uses Redux,
Wouter hash routes, Tailwind, and local shadcn-style primitives.

| Concern | How it's configured today | Source |
| --- | --- | --- |
| Options page | General, New Tab, Commands, Favorites, Keyboard, Snippets, Automations, URL Rules, and About pages | `entrypoints/options/`, `options/` |
| Open settings | `open-settings` command opens `options.html#/` | `background/commands/ui/openSettings.ts` |
| Theme (`light`/`dark`/`system`) | General page selector; `toggle-theme` command still exists | `options/pages/GeneralPage.tsx`, `background/commands/ui/theme.ts` |
| New-tab clock visibility | New Tab page switch; `toggle-clock-visibility` still exists under `new-tab-clock` | `options/pages/NewTabPage.tsx`, `background/commands/newTab/` |
| New-tab background | Auto-fetched from Unsplash, cached in `localStorage`; options page can preview/refresh cache | `newtab/components/BackgroundImage.tsx`, `newtab/backgroundImageModel.ts`, `options/pages/NewTabPage.tsx` |
| Global command visibility | Commands page hide toggles; generated **Hide Command** action | `background/commands/settingsCatalog.ts`, `background/commands/index.ts`, `options/pages/CommandsPage.tsx` |
| Per-command visibility (per domain) | Commands and URL Rules page editors; `manage-allow-list` / `manage-deny-list` commands + generated **Hide from Domain** action | `options/components/UrlRulesDialog.tsx`, `options/pages/UrlRulesPage.tsx`, `background/commands/ui/manageAllowList.ts`, `manageDenyList.ts`, `background/commands/index.ts` |
| Per-command keybinding | Commands and Keyboard page keybinding dialogs; Keyboard page templates; generated **Set / Reset Custom Keybinding** actions in the action menu | `options/components/KeybindingDialog.tsx`, `options/components/KeybindingTemplateDialog.tsx`, `options/pages/KeyboardPage.tsx`, `options/lib/keybindingTemplates.ts`, `background/commands/index.ts`, `shared/components/Command/CommandActionsList.tsx` |
| Favorites | Commands and Favorites page favorite toggles; inline ♡ toggle action per command; `clear-favorites` command | `options/pages/FavoritesPage.tsx`, `background/commands/favorites.ts` |
| Snippets | Snippets page: list, create, edit, and delete saved snippets (independent `monocle-snippets` storage); mirrors palette-created snippets via `storage.onChanged` | `options/pages/SnippetsPage.tsx`, `shared/store/slices/snippets.slice.ts`, `background/commands/snippets.ts`; see [commands/tools.md](./commands/tools.md) |
| Automations | List + builder for user scripts: metadata/scope/trigger/variable/step editors, validate-as-you-type with the shared document schema, test-run on the active tab, JSON export, import with a review summary (non-manual triggers arrive disarmed), and an Add Examples button that seeds curated example automations | `options/pages/UserScriptsPage.tsx`, `options/pages/userScripts/`, `shared/store/slices/userScripts.slice.ts`; see [user-scripts.md](./user-scripts.md) |
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

`CommandSettings` (per command, keyed by id) currently persists:

```ts
// shared/types/settings.ts (exists today)
export interface CommandSettings {
  keybinding?: string
  hidden?: boolean
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
3. **Query-time filtering.** `hidden` and `urlRules` are not baked into the
   catalog; they are applied *when the palette asks for commands* (root
   empty-state, search index, children, execution/keybindings). Management
   surfaces still see hidden commands so they can be unhidden.
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
| **General** | `#/` | Theme and default behaviors. |
| **New Tab** | `#/new-tab` | Clock, greeting, background image controls. |
| **Commands** | `#/commands` | The core: every command, grouped by category, with hide/favorite/keybinding/URL-rules/per-command settings. |
| **Favorites** | `#/favorites` | View, remove, and (future) reorder favorites. |
| **Keyboard Shortcuts** | `#/keyboard` | All bindings in one table, conflicts, reset. |
| **Snippets** | `#/snippets` | Manage saved text snippets (create/edit/delete; bodies support insert-time placeholders). |
| **Automations** | `#/automations` | Build, test, import/export, and arm user scripts (implemented — see [user-scripts.md](./user-scripts.md)). |
| **URL Rules** | `#/url-rules` | Per-command allow/deny rule overview and bulk clearing. |
| **Permissions** | `#/permissions` | Grant/revoke optional permissions. |
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

Mark a command as **hidden** so it is disabled everywhere outside settings:
root empty-state, search results, child pages, deep-search descendants, direct
execution, keybinding registry snapshots, and keybinding conflict checks.

**Data model (additive).**

```ts
// shared/types/settings.ts
export interface CommandSettings {
  keybinding?: string
  urlRules?: UrlRules
  hidden?: boolean // true => disabled everywhere outside settings
  // config?: Record<string, unknown>   // see 4.2
}
```

`hidden` is a leaf boolean, so the existing shallow merge in
`mergeCommandSettings` handles it correctly — **no new merge branch needed** (only
nested structures like `config` need one). `pruneCommandSettings` drops
`hidden: false` so the default never persists.

**Storage.** Reuses `monocle-settings → commands[id].hidden` via
`updateCommandSettings(id, { hidden })`.

**Background message.** `update-command-setting` includes a `"hidden"` variant
(`value: boolean`). The handler writes the setting, refreshes the keybinding
registry, and **invalidates the search index**
(`background/commands/searchIndex.ts`) so a hidden command disappears
immediately.

**Enforcement (query-time, not catalog-time).** `hidden` is enforced in
`background/utils/urlFilter.ts` before URL-rule checks and before the empty-URL
"visible by default" shortcut. This makes hidden global, including new-tab
contexts. The **settings catalog endpoint (§6) bypasses this filter**, so hidden
commands remain visible *in the settings page* to be unhidden.

**Hide-vs-disable semantics.** Implemented behavior is strict: hidden commands
are disabled everywhere outside settings, including keyboard shortcuts. This is
intentional so a command hidden from the catalog does not keep running invisibly.

**Action-menu entry point.** A generated `hide-command-<id>` action is added
alongside the existing favorite / hide-from-domain / set-keybinding actions in
`background/commands/index.ts`. There is no generated unhide action because
hidden rows disappear from the palette; unhide happens from the Commands page.

### 4.2 Per-command schema-driven settings

> **Superseded for rich settings by the Feature-module registry**
> ([features.md](./features.md)). Capabilities that need a full settings page +
> persistent state are now modeled as *features* (schema-driven settings page,
> `monocle-feature-config` / `monocle-feature-state` stores, content/new-tab
> surfaces) rather than as `CommandSettings.config` on an individual command.
> The proposal below is kept for historical context; a lightweight
> per-command `config` was intentionally **not** built (it would mix durable
> config with runtime state and duplicate the feature mechanism).

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

The implemented Commands and Favorites pages expose favorite management over the
**existing** `monocle-favoriteCommandIds` key through the `set-command-favorite`
message. This is intentionally separate from generated palette actions so
settings can update favorites even when a command is hidden.

The Favorites page builds on the same key through `favorites.ts`
(`getFavoriteCommandIds`, `removeFromFavoriteCommandIds`,
`toggleFavoriteCommandId`) — **no migration, no schema change**. It is an
overview and cleanup surface: search/filter favorites, remove selected
favorites, and jump to the shared keybinding / URL-rule dialogs.

Reordering favorites would be new (favorites are an unordered `string[]` today);
if desired, that is an additive change to make the array order-significant plus a
"set favorites order" message — flagged as an open question (§9) since it touches
how favorites feed ranking ([search-and-ranking.md](./search-and-ranking.md)).

### 4.4 Keybindings, URL rules, permissions

The implemented Commands, Keyboard, and URL Rules pages provide per-command
keybinding and URL-rule editors over existing storage/messages:

- **Commands page keybindings** — per-row set/reset dialogs use the existing
  `update-command-setting` `keybinding` path and conflict checks via
  `checkKeybindingConflict`. Bindings render with `KeybindingDisplay`. Honors
  `allowCustomKeybinding`.
- **Commands page URL rules** — per-command allow/deny editors are backed by
  `update-command-setting` `urlRules`; patterns validate through the existing
  `validateUrlPattern`.
- **Keyboard Shortcuts page** — a searchable/filterable table of commands with
  default/custom/unbound filtering, set/reset actions, and bulk reset for
  selected custom bindings. The **Use Template** modal has a side-panel template
  list and a preview table of commands/keybindings. `Default` clears custom
  keybindings only when **Override custom keybindings** is checked, restoring
  built-in defaults. `Vim` applies Vimium/Tridactyl-style bindings to ready
  commands; unchecked override preserves commands that already have custom
  bindings, checked override replaces them. Pending rows are preview-only and
  are never saved. Template saves use one `update-command-keybindings` batch
  message, one settings write, one registry refresh, and no per-command toasts.
- **URL Rules page** — a searchable/filterable per-command overview of allow and
  deny patterns, shared URL-rule editing, and bulk clearing for selected rules.

Future management depth:

- **Sites & URL Rules** — the **domain-centric inverse** of the per-command
  allow/deny commands: list domains that have rules and which commands they
  affect. Also shows a **read-only** list of current **session site-SDK
  registrations** per origin ([site-sdk.md](./site-sdk.md)) if that future
  read-only surface is wanted.
- **Permissions** — a grant/revoke table over the optional permissions, reusing
  the `get-permissions` round-trip and the Chrome/Firefox grant flows behind
  `PermissionActions` / `requestPermission` ([permissions.md](./permissions.md)).

### 4.5 New-tab background categories (Unsplash) — future

The MVP New Tab page exposes the existing background cache state and a manual
refresh control. Category preferences remain deferred until the Unsplash fetch
path actually consumes them.

Future idea: let the user **opt into** which kinds of Unsplash imagery the
new-tab background draws from, via a grid of **on/off toggles, one per
category**. This would live **only in the settings page** — deliberately *not* a
palette command, since it's a multi-value preference, not a quick action.

**Exists today.** `newTab.backgroundCategories?: string[]` is already declared in
`shared/types/settings.ts` but is **unused** — nothing writes it and the fetch
ignores it. `getUnsplashBackground` (`background/messages/getUnsplashBackground.ts`)
requests `https://api.unsplash.com/photos/random?orientation=landscape&w=1920&h=1080`
with no topic/query filter, so backgrounds are fully random. So this feature is
mostly **wiring an already-reserved field**, not a new data shape.

**Data model.** Reuse the existing `newTab.backgroundCategories: string[]` —
the set of *enabled* category keys. **Empty/absent = current behavior** (fully
random, no filter). No type change required; persisted via the existing
`updateNewTabSettings` (lodash deep-merge, so it composes with `clock`/`greeting`).

**Category list.** Unsplash's old `/categories` endpoint is deprecated; the modern
equivalent is **Topics** (stable public slugs). The settings UI shows a curated,
fixed list mapped to topic slugs, e.g. `wallpapers`, `nature`, `3d-renders`,
`textures-patterns`, `architecture-interior`, `travel`, `street-photography`,
`animals`, `experimental`, `people`, `business-work`, `food-drink`. The
display-name → slug mapping is a constant the settings page and the fetch share.

**Fetch wiring.** `getUnsplashBackground` reads
`getNewTabSettings().backgroundCategories` and, when non-empty, appends
`&topics=<comma-separated slugs>` to the random-photo request (the `/photos/random`
endpoint accepts a `topics` filter; `query` is the fallback if topic slugs prove
unreliable). Reading from settings in the background keeps a single source of
truth; alternatively the new-tab UI (which already has the value in Redux) could
pass the selection in the `get-unsplash-background` message — recommend the
background-reads-settings approach for consistency with other settings consumers.

**Cache invalidation.** The background is cached under a single `localStorage` key
(`monocle-unsplash-background`, see `newtab/backgroundImageModel.ts`). Changing the
enabled categories should **refresh** the background rather than show the stale
cached image — clear/bypass the cache on a category change (e.g. the settings write
triggers the new-tab `storage.onChanged` listener, which drops the cache and
re-requests). A manual "Refresh background now" button on the New Tab page is a
natural companion control.

**UI.** A `New Tab → Background` group of shadcn `Switch` toggles (or a toggle
grid), default all-off, with a one-line "leave all off for fully random" hint and
the manual-refresh button. No palette surface.

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

The WXT entrypoint `entrypoints/options/` (`index.html` + `main.tsx` shim)
renders `options/OptionsApp.tsx` — structured like `newtab/`. The entrypoint is
marked `openInTab: true`, so WXT wires the manifest options page. The
**Open Settings** palette command in `background/commands/ui/openSettings.ts`
opens `options.html#/`.

### The command-enumeration problem (biggest lift)

The Commands page must list **every** command. But `allCommands` is **context-free
and misses context-only sources** — new-tab commands (gated on `isNewTab`),
website commands, and session site-SDK commands (per [CLAUDE.md] known risks).
The page uses the background message **`get-settings-catalog`**, which unions
normal and new-tab sources and returns, per command:

- identity + category + icon + `supportedBrowsers`
- effective settings (`hidden`, `keybinding`, `urlRules`)
- capabilities (`canHide`, `canFavorite`, `canSetKeybinding`,
  `canEditUrlRules`, `hasUrlRules`)
- favorite state (from `favorites.ts`) and usage stats (from `usage.ts`)

Critically, this endpoint **bypasses the query-time `hidden`/`urlRules` filter** so
hidden commands remain manageable. The catalog includes stable dynamic browser
rows that are durable enough to configure, such as bookmarks and Firefox
container actions, while volatile rows such as open tabs, history, downloads,
and recently closed sessions remain omitted. Session site-SDK commands are also
omitted because they are in-memory, document-scoped, and not persistently
configurable.

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
- **Local shadcn-style primitives.** Page chrome uses small local components on
  Radix + Tailwind (`options/components/ui.tsx`) rather than a generated
  `components.json` install. Added dependencies include Radix switch/dialog/
  tooltip/checkbox/slot, `class-variance-authority`, and `tailwind-merge`.
  Renders in the options page's normal DOM, so no shadow-DOM containment
  concerns (unlike the content overlay). **Consistency risk:** the palette has
  its own `CommandItem/*` renderers. Rule of thumb — reuse the genuinely shared
  primitives (`Icon`, `KeybindingDisplay`) and use the local options primitives
  for page chrome, with shared theme tokens for visual coherence.
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

## 7. Data-model & message changes

Implemented Phase 1 changes are additive and tolerant of partial documents (no
migration framework).

| Change | Where | Notes |
| --- | --- | --- |
| `CommandSettings.hidden?: boolean` | `shared/types/settings.ts` | Leaf; shallow merge OK; prune `false`. |
| `CommandNodeBase.settingsCatalog?: { includeChildren?: boolean; configurable?: boolean }` | `shared/types/commands.ts` | Opt-in traversal for stable nested rows; opt-out for volatile rows. |
| `update-command-setting` gains `"hidden"` variant | `shared/types/validation.ts`, `background/messages/updateCommandSetting.ts` | Boolean; refreshes keybinding registry and invalidates search. |
| New `get-settings-catalog` message | `background/messages/`, `docs/messaging.md` | Context-free union of all command sources + settings/usage/favorites; bypasses query-time filter. |
| New `set-command-favorite` message | `background/messages/`, `docs/messaging.md` | Lets settings update favorites even when a command is hidden. |
| `hidden` enforcement | `background/utils/urlFilter.ts`, keybinding source | Same stage as `urlRules`; also disables execution/keybindings. |
| Generated `hide-command-<id>` action | `background/commands/index.ts` | Action-menu quick-hide for durable/configurable rows. |

Future changes:

| Change | Where | Notes |
| --- | --- | --- |
| `CommandSettings.config?: Record<string, unknown>` | `shared/types/settings.ts` | **Nested → needs a `config` branch in `mergeCommandSettings` + test.** |
| `CommandNodeBase.settingsSchema?: FormField[]` | `shared/types/commands.ts` | Declarative; rendered by existing `CommandItem/*`. |
| `update-command-setting` gains `"config"` variant | `shared/types/validation.ts`, `background/messages/updateCommandSetting.ts` | Validate against `settingsSchema`. |
| Wire `newTab.backgroundCategories` (Unsplash topics) | `background/messages/getUnsplashBackground.ts`, settings UI | **No type change** (field already reserved); fetch reads it and appends `&topics=…`; empty = random; refresh cache on change. |
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
- **Two component systems** — local options primitives vs the palette's
  `CommandItem/*`; keep them visually coherent via shared theme tokens and
  reuse shared primitives.

---

## 9. Open questions

1. **Favorites ordering** — keep favorites an unordered set, or make the page
   support reordering (requires order-significant storage + a new message)?
2. **User scripts: workflow-only vs JS** — start with declarative workflows only
   (lower review risk) and defer `chrome.userScripts` JS, or design both now?
3. **Settings-page-only sources** — should ephemeral session site-SDK commands be
   listed read-only later, or stay omitted to avoid implying persistence?

---

## 10. Phased delivery

1. **MVP (implemented)** — options entrypoint + shell (sidebar, Wouter, local
   shadcn-style primitives, store); **General** (theme) + **New Tab**
   (clock/background) + **Commands** page with **hide**, favorite toggle,
   keybinding, and URL rules. Ships the headline "hide command" value. Includes
   `hidden` field + enforcement, `get-settings-catalog`, `set-command-favorite`,
   and the action-menu `hide-command` action.
2. **Management pages (implemented)** — **Favorites**, **Keyboard Shortcuts**,
   **URL Rules**, and **About**. These reuse the catalog, settings, favorite,
   keybinding, and URL-rule messages rather than introducing new storage.
3. **Permissions** — a dedicated optional-permissions table and revoke flows.
4. **Schema-driven settings** — `settingsSchema` + `config` storage (with merge
   branch + tests) + validation; adopt in a few commands.
5. **Data & Privacy** — export/import, granular reset, usage analytics.
6. **Workflows** — management/test UI (as the executor grows).
7. **User scripts** — workflows first, then (if approved) `userScripts` JS.

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
