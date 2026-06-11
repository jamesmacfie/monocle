# Settings

Monocle persists user preferences and per-command configuration in
`chrome.storage.local`. The primary settings document lives under a single key,
`monocle-settings`, and is owned by the background service worker through
`background/commands/settings.ts`. The UI never writes this document directly
except for two narrow theme/clock thunks in the Redux mirror; everything else
flows through background functions and the `update-command-setting` message.
Favorites and usage statistics are deliberately stored under *separate* storage
keys and are not part of the `monocle-settings` document.

## Storage layout

Monocle uses three independent `chrome.storage.local` keys. Only the first is
the "settings document"; the other two are documented here for completeness
because they are frequently confused with settings.

| Storage key | Owner | Shape | Covered by |
| --- | --- | --- | --- |
| `monocle-settings` | `background/commands/settings.ts` | `Settings` (theme, newTab, commands) | this doc |
| `monocle-favoriteCommandIds` | `background/commands/favorites.ts` | `string[]` of command ids | [search-and-ranking.md](./search-and-ranking.md) |
| `monocle-commandUsage` | `background/commands/usage.ts` | `{ commandStats, lastCleanup }` | [search-and-ranking.md](./search-and-ranking.md) |

Because favorites and usage live outside `monocle-settings`, clearing settings
(`clearAllSettings`) does **not** clear favorites or usage data, and vice
versa.

## The settings document shape

The persisted document is typed by `Settings` and `PersistedSettings` in
`shared/types/settings.ts`. In practice the background loader only ever
hydrates and writes `theme`, `newTab`, and `commands`; `permissions` exists in
the type and the Redux mirror but is never written into `monocle-settings`
(browser permission APIs are the source of truth — see
[permissions.md](./permissions.md)).

```ts
// shared/types/settings.ts
export interface Settings {
  theme?: ThemeSettings
  newTab?: NewTabSettings
  commands?: Record<string, CommandSettings>
  permissions?: PermissionSettings // not persisted by settings.ts
}
```

### `theme: ThemeSettings`

| Field | Type | Notes |
| --- | --- | --- |
| `mode` | `"light" \| "dark" \| "system"` (optional) | Theme preference. Redux defaults to `"system"` when absent. |

Consumed by the theme system; see [new-tab-and-theme.md](./new-tab-and-theme.md).

### `newTab: NewTabSettings`

| Field | Type | Notes |
| --- | --- | --- |
| `backgroundCategories` | `string[]` (optional) | Unsplash background category preferences for the new-tab page. |
| `clock.show` | `boolean` (optional) | Whether the new-tab clock is shown. Redux defaults to `true`. The type leaves room for future `format`, `timezone`. |
| `greeting.show` | `boolean` (optional) | Whether the new-tab greeting is shown. Type leaves room for `customText`, `name`. |

Consumed by the new-tab page; see [new-tab-and-theme.md](./new-tab-and-theme.md).

### `commands: Record<string, CommandSettings>`

Per-command settings keyed by command id. Three fields are persisted today:

```ts
// shared/types/settings.ts
export interface CommandSettings {
  keybinding?: string
  hidden?: boolean
  urlRules?: UrlRules // { allowUrls?: string[]; denyUrls?: string[] }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `keybinding` | `string` (optional) | Canonical keybinding text such as `<cmd-shift-u>`. See [keybindings.md](./keybindings.md). |
| `hidden` | `boolean` (optional) | `true` disables the command everywhere outside settings; `false` is pruned. |
| `urlRules.allowUrls` | `string[]` (optional) | User-defined allow patterns for command visibility. See [url-filtering.md](./url-filtering.md). |
| `urlRules.denyUrls` | `string[]` (optional) | User-defined deny patterns for command visibility. |

`urlRules` reuses the `UrlRules` type from `shared/types/commands.ts`, the same
type a command author can declare statically. The persisted command `urlRules`
are user overrides layered on top of the command's own declared rules.

> Favorites and usage stats are **not** in `CommandSettings`. The prior
> review baseline mentioned "favorites, custom keybindings, urlRules, usage
> data" together, but only keybinding, hidden, and urlRules actually live in
> `monocle-settings`. Favorites and usage are separate keys (see table above).

## Background settings API

All functions live in `background/commands/settings.ts`. They share a private
`loadSettings`/`saveSettings` pair that reads and writes the `monocle-settings`
key.

### Read/write internals

- `loadSettings()` (private): reads `monocle-settings`, returns
  `{ theme, newTab, commands }` with each missing top-level field defaulted to
  `{}`. On any storage error it logs and returns the same empty defaults.
  Note: it does **not** hydrate `permissions`.
- `saveSettings(settings)` (private): writes the whole document back under
  `monocle-settings`. Storage errors are caught and logged, not thrown.

### Whole-document and theme/new-tab functions

| Function | Behavior |
| --- | --- |
| `getAllSettings()` | Returns the full loaded document (`theme`/`newTab`/`commands` defaulted to `{}`). |
| `clearAllSettings()` | Removes the entire `monocle-settings` key. |
| `getThemeSettings()` | Returns `settings.theme` (or `{}`). |
| `setThemeSettings(theme)` | Replaces `theme` wholesale. |
| `updateThemeSettings(partial)` | Shallow-merges `{ ...existing, ...partial }` into `theme`. |
| `getNewTabSettings()` | Returns `settings.newTab` (or `{}`). |
| `setNewTabSettings(newTab)` | Replaces `newTab` wholesale. |
| `updateNewTabSettings(partial)` | Deep-merges with lodash `merge` (so nested `clock`/`greeting` are merged, not replaced). |
| `getNewTabClockSettings()` | Convenience: returns `newTab.clock` (or `{}`). |
| `updateNewTabClockSettings(partial)` | Convenience over `updateNewTabSettings({ clock })`. |
| `getNewTabGreetingSettings()` | Convenience: returns `newTab.greeting` (or `{}`). |
| `updateNewTabGreetingSettings(partial)` | Convenience over `updateNewTabSettings({ greeting })`. |

`updateNewTabSettings` uses lodash `merge`, which deep-merges objects. This is
why `updateNewTabClockSettings({ show: false })` preserves a sibling
`greeting.show` and `backgroundCategories` (verified in `settings.test.ts`,
"persists clock visibility while preserving sibling new-tab settings").

### Command-settings functions

| Function | Behavior |
| --- | --- |
| `getCommandSettings(commandId)` | Returns `commands[commandId]` or `undefined`. |
| `getAllCommandSettings()` | Returns the whole `commands` record. |
| `setCommandSettings(commandId, settings)` | Replaces a command's settings wholesale. |
| `updateCommandSettings(commandId, partial)` | Merges via `mergeCommandSettings`, prunes empty results, deletes the command entry if nothing remains. |
| `updateCommandUrlRules(commandId, urlRules)` | Thin wrapper: `updateCommandSettings(commandId, { urlRules })`. Preserves sibling keybinding and the other allow/deny list. |
| `removeCommandSettings(commandId)` | Deletes the command entry entirely. |
| `removeCommandSetting(commandId, setting)` | Removes a single field (`keybinding`, `hidden`, or `urlRules`), prunes, and deletes the command entry if it becomes empty. |

## Shallow-merge semantics and the urlRules hazard

`updateCommandSettings` does **not** do a naive shallow spread. It delegates to
the exported `mergeCommandSettings`, which is shallow for top-level fields but
intentionally merges `urlRules` one level deeper:

```ts
// background/commands/settings.ts (mergeCommandSettings, condensed)
const merged = { ...existingSettings, ...partialSettings }
if ("urlRules" in partialSettings) {
  merged.urlRules =
    partialSettings.urlRules === undefined
      ? undefined
      : { ...existingSettings.urlRules, ...partialSettings.urlRules }
}
return pruneCommandSettings(merged)
```

Consequences and rules:

- **`urlRules` is the only nested structure that gets a second merge level.**
  Updating `{ urlRules: { allowUrls: [...] } }` preserves an existing
  `denyUrls` list, because the inner object is spread over the existing one.
  Verified in `settings.test.ts` ("merges URL rules one level deeper").
- **Any future nested command setting will be replaced, not merged**, unless it
  gets its own explicit branch like `urlRules`. If you add a nested command
  setting, add a merge case and a merge test before relying on it.
- **Setting a nested list to `undefined` clears just that list.** Passing
  `{ urlRules: { allowUrls: undefined } }` removes `allowUrls` while keeping
  `denyUrls` (verified). `pruneUrlRules` then drops `urlRules` entirely if both
  lists are gone.
- **Empty settings are pruned, not stored.** If a merge/removal leaves a
  command with no fields, the command's entry is deleted from `commands`. This
  keeps the document from accumulating empty `{}` records.
- **`hidden: false` is pruned.** Only the non-default `hidden: true` value is
  persisted. Setting `hidden` back to `false` preserves sibling `keybinding` and
  `urlRules` settings, then drops the `hidden` field.
- **`removeCommandSetting('keybinding')` does not touch `urlRules`** (and vice
  versa). Resetting a keybinding leaves URL rules intact (verified).
- **Old documents without nested `urlRules` are forward-compatible.** A
  pre-existing `{ keybinding }` command record gains `urlRules` cleanly when
  `updateCommandUrlRules` is called; there is no migration step because the
  loader and merge tolerate missing fields (verified, "preserves old command
  settings that do not yet have nested URL rules").

There is no explicit version field or migration routine in the settings
document. Compatibility is achieved purely by defaulting missing fields to `{}`
on load. Keep future schema changes additive and tolerant of partial documents.

## The `update-command-setting` message

UI surfaces (keybinding editor, allow/deny list management commands) update
command settings by sending the `update-command-setting` message, handled by
`background/messages/updateCommandSetting.ts` (`updateCommandSetting`). The
message is a discriminated union on `setting`, validated in two layers.

### Schema validation (`shared/types/validation.ts`)

`UpdateCommandSettingMessageSchema` is a Zod `discriminatedUnion("setting", …)`:

| `setting` | `value` schema | Notes |
| --- | --- | --- |
| `"keybinding"` | `string \| null`, optional | Any string accepted at the schema layer. |
| `"hidden"` | `boolean` | Global command hide toggle. |
| `"urlRules"` | `{ allowUrls?: string[]; denyUrls?: string[] }` `.strict()` | Rejects unknown keys; lists must be arrays of strings. |

`commandId` must be a non-empty string; `context` (a `BrowserContext`) is
optional. The strict object on `urlRules` means any field other than
`allowUrls`/`denyUrls` fails schema validation.

### Business-logic validation (`background/utils/validation.ts`)

`validateBusinessLogic` adds a second layer for `update-command-setting`:

- **keybinding**: empty/null/`""` values short-circuit as valid (this is the
  "remove keybinding" path). A non-empty value must be already-canonical —
  `normalizeKeybinding(value)` must succeed *and* equal the original value, or
  the message is rejected with "Keybinding setting must be canonical keybinding
  text".
- **hidden**: boolean only; no additional business validation.
- **urlRules**: each present list must be an array, and every pattern must pass
  `validateUrlPattern` (see [url-filtering.md](./url-filtering.md)). Invalid
  patterns are rejected with `Invalid <field> pattern "<pattern>": <reason>`.

Command ids reaching this handler are also constrained by the
`execute-command`/`get-children-commands` id regex elsewhere, but the
`update-command-setting` branch itself only validates the setting payload.

### Handler behavior (`updateCommandSetting`)

The handler re-validates inside the background and applies side effects beyond
storage:

- **keybinding, empty value**: normalizes to `""`, calls
  `removeCommandSetting(commandId, "keybinding")`, then
  `refreshKeybindingRegistry()` and returns. URL rules are untouched.
- **keybinding, non-empty value**: resolves the command via
  `resolveCommandById(commandId, context)` and checks `allowsKeybinding`. If the
  command is missing or does not allow keybindings, it throws
  `Command cannot be assigned a keybinding: <id>`. Otherwise it calls
  `updateCommandSettings(commandId, { keybinding })`, refreshes the registry,
  and shows a success toast.
- **urlRules**: runs `validateUrlRulesSetting` (mirrors the business-logic
  pattern check), then `updateCommandUrlRules(commandId, value)`, which
  preserves the sibling allow/deny list and the command's keybinding, then
  invalidates the search index.
- **hidden**: calls `updateCommandSettings(commandId, { hidden })`, refreshes
  the keybinding registry, and invalidates the search index.

All paths return `{ success: true }`. Updating a keybinding or hidden state
triggers a keybinding registry refresh so the new behavior is live without an
extension reload. Updating URL rules and hidden state invalidates the search
index so visibility changes apply immediately.

## Redux mirror (`shared/store/slices/settings.slice.ts`)

The store keeps a *responsive* mirror of a subset of settings plus live
permission state. It is intentionally narrower than the persisted document.

`SettingsState`:

| Field | Source | Default |
| --- | --- | --- |
| `theme: ThemeSettings` | `monocle-settings.theme` | `{ mode: "system" }` |
| `newTab: NewTabSettings` | `monocle-settings.newTab` | `{ clock: { show: true } }` |
| `permissions: PermissionSettings` | `get-permissions` message round-trip | all `false`, `isLoaded: false` |
| `loading: boolean` / `error: string \| null` | thunk lifecycle | `false` / `null` |

Note the slice mirrors only `theme`, `newTab`, and `permissions`. It does
**not** mirror `commands` (per-command keybindings/hidden/urlRules); those are
read on demand from the background, not from this slice.

### Thunks

- `loadSettings`: reads `monocle-settings` directly from
  `chrome.storage.local` and returns `{ theme, newTab }`. The fulfilled reducer
  re-applies defaults (`theme.mode` → `"system"`, `newTab.clock.show` →
  `true`) over the loaded values, and spreads loaded `newTab` over the existing
  state so unmentioned new-tab fields survive.
- `loadPermissions` / `refreshPermissions`: send `get-permissions` to the
  background and store the returned `PermissionSettings`. On
  `loadPermissions.rejected`, `permissions.isLoaded` is forced `false`.
- `updateThemeMode(mode)`: reads the current `monocle-settings`, shallow-merges
  the new `theme.mode`, writes the whole document back, then updates state.
- `updateClockVisibility(show)`: reads the current document, shallow-merges
  `newTab.clock.show`, writes back, then updates state.

`updateThemeMode` and `updateClockVisibility` are the only two places the UI
writes `monocle-settings` directly (bypassing `background/commands/settings.ts`).
Both do a manual read-modify-write spread of the whole document, which is safe
because they touch a single leaf each, but it means they do not benefit from
the background pruning/merge helpers. All other settings writes go through the
background API or the `update-command-setting` message.

## Settings catalog mirror (`shared/store/slices/settingsCatalog.slice.ts`)

The options page has a separate `settingsCatalog` slice for command-management
data. It loads rows through `get-settings-catalog`, not through direct storage,
because the catalog needs background-owned command metadata, effective settings,
favorite state, usage stats, and capabilities.

The slice owns thunks for:

- `loadSettingsCatalog`
- `setCatalogCommandHidden`
- `setCatalogCommandFavorite`
- `setCatalogCommandKeybinding`
- `setCatalogCommandUrlRules`

Those thunks send `update-command-setting` or `set-command-favorite` messages
and update the local row optimistically after the background confirms success.
This keeps per-command settings out of the narrower `settings` slice while still
giving the options page responsive controls.

### Staleness rules vs storage truth

- **Theme and new-tab**: storage is the truth; the slice is a cache loaded on
  app start and updated optimistically by its own thunks. Because both the
  background API and the slice write the same `monocle-settings` key, a slice
  read after a background write reflects the latest document, but the slice is
  not automatically re-hydrated on external writes — call `loadSettings` to
  refresh.
- **Permissions**: the browser permission API is authoritative. The slice
  holds a cached snapshot fetched via `get-permissions`; it can go stale if a
  permission is revoked from the browser's extension settings while Monocle is
  open. UI paths re-fetch (`refreshPermissions`) to recover. See
  [permissions.md](./permissions.md).
- **Command settings**: not in the `settings` slice. The options page mirrors
  them through `settingsCatalog`; other consumers fetch current values from the
  background.

### Selectors

| Selector | Returns |
| --- | --- |
| `selectThemeMode` | `theme.mode ?? "system"` |
| `selectClockVisibility` | `newTab.clock?.show ?? true` |
| `selectPermissions` | `permissions` |

## How each consumer reads its settings

| Area | How it reads | Reference |
| --- | --- | --- |
| Theme | `getThemeSettings` (background) / `selectThemeMode` (Redux) | [new-tab-and-theme.md](./new-tab-and-theme.md) |
| New tab (clock, greeting, background) | `getNewTabSettings` + convenience getters / `selectClockVisibility` | [new-tab-and-theme.md](./new-tab-and-theme.md) |
| Keybindings | `getAllCommandSettings`/`getCommandSettings` for the `keybinding` field; registry refresh on update | [keybindings.md](./keybindings.md) |
| Hidden commands | `getAllCommandSettings`/`getCommandSettings` for the `hidden` field; enforced before URL-rule checks | [url-filtering.md](./url-filtering.md) |
| URL rules | `getCommandSettings` for `urlRules`, layered over command-declared rules during filtering | [url-filtering.md](./url-filtering.md) |
| Favorites | separate `monocle-favoriteCommandIds` key (not settings) | [search-and-ranking.md](./search-and-ranking.md) |
| Usage / ranking | separate `monocle-commandUsage` key (not settings) | [search-and-ranking.md](./search-and-ranking.md) |

## Known issues and review notes

- Settings persistence is centralized in `background/commands/settings.ts`.
  There is no migration framework; compatibility relies on tolerant defaulting.
  Keep schema changes additive.
- `updateCommandSettings` merges `urlRules` one level deeper than other fields.
  This protects sibling allow/deny lists but is special-cased — future nested
  command settings need their own merge branch and tests.
- Resetting a custom keybinding removes only the `keybinding` field; it does not
  delete URL rules for the same command.
- The Redux slice does not mirror `commands` settings, and only `theme`/`newTab`
  are written by its thunks. Two thunks write `monocle-settings` directly,
  bypassing the background merge/prune helpers; keep them limited to
  single-leaf updates.
- Permission state is duplicated between browser truth and Redux for UI
  responsiveness; the browser API remains authoritative.
- URL pattern validation is custom (`validateUrlPattern`) and has focused tests;
  grow the pattern language in lockstep with its tests.

## Manual test checklist

- Start from a fresh install or clear `monocle-settings`; confirm defaults
  (system theme, clock shown).
- Add a custom keybinding to a command, reload the extension, confirm it
  persists and is live without a full reload (registry refresh).
- Reset that keybinding (empty value) and confirm the `keybinding` field is
  removed while any URL rules for the same command survive.
- Hide a command, reload the extension, and confirm the row remains visible in
  Settings but disappears from palette suggestions/search/children and its
  shortcut no longer fires.
- Unhide the command in Settings and confirm its palette visibility and shortcut
  behavior return.
- Use Manage Command Allow List / Deny List (or Hide from Domain) to add a
  pattern, reload the page, and confirm URL rules persist and merge with
  sibling lists rather than overwriting them.
- Toggle clock visibility and confirm `backgroundCategories`/`greeting` survive.
- Change theme mode and confirm both content overlay and new-tab page update.
- Reject an invalid URL pattern (e.g. `ftp://…`) through a management command
  and confirm the update is refused with a clear error.

## Related docs

- [architecture.md](./architecture.md) — system overview and data flows.
- [messaging.md](./messaging.md) — full message protocol, including
  `update-command-setting`.
- [permissions.md](./permissions.md) — permission state vs browser truth.
- [keybindings.md](./keybindings.md) — canonical keybinding format and registry.
- [url-filtering.md](./url-filtering.md) — `urlRules` matching and management.
- [search-and-ranking.md](./search-and-ranking.md) — favorites and usage data.
- [new-tab-and-theme.md](./new-tab-and-theme.md) — theme and new-tab consumers.
