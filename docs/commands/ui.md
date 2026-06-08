# UI / Settings Commands

UI commands are palette commands that change Monocle's own configuration rather than acting on the browser. Three live in `background/commands/ui/` and are aggregated by `background/commands/ui/index.ts` into `uiCommands`, which `background/commands/source.ts` (`loadAllCommands`) merges into the global command set: a theme toggle and two URL-rule managers (allow list and deny list). A fourth Monocle-state command, Clear Favorites, is defined in `background/commands/favorites.ts` and appended directly by `loadAllCommands`; it is cataloged here because it also mutates Monocle's own state.

## Summary

| Command | Id | Node type | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Toggle Theme | `toggle-theme` | `action` | Cycle the palette theme system -> light -> dark -> system | Dynamic name/description/icon reflect current mode |
| Themes | `theme` | `group` | Pick any theme; applies immediately | Children from `THEME_OPTIONS`; Check marks the current one |
| Manage Command Allow List | `manage-allow-list` | `group` | Edit per-command allow URL patterns | One subgroup per user-configurable command |
| Manage Command Deny List | `manage-deny-list` | `group` | Edit per-command deny URL patterns | Mirror of the allow-list command |
| Clear favorites | `clear-favorites` | `action` | Remove all favorited commands | Defined in `favorites.ts`, registered directly in `source.ts` |

Registration:

```ts
// background/commands/ui/index.ts
export const uiCommands = [
  toggleTheme,
  selectTheme,
  manageAllowList,
  manageDenyList,
]

// background/commands/source.ts (loadAllCommands)
const commands: CommandNode[] = [
  ...browserCommands,
  ...toolCommands,
  ...uiCommands,
  ...websiteCommands,
  clearFavoritesCommand,
]
```

---

## Toggle Theme

Source: `background/commands/ui/theme.ts`, exported as `toggleTheme` (`ActionCommandNode`). Id `toggle-theme`, `supportedBrowsers: ["chrome", "firefox"]`.

A single `action` that cycles the persisted theme mode. Its `name`, `description`, and `icon` are async functions that read the current mode via `getThemeSettings()` (from `background/commands/settings.ts`) so the palette row reflects state:

| Current mode | Row name | Icon |
| --- | --- | --- |
| `system` (default) | "Switch to Light Theme" | `Monitor` |
| `light` | "Switch to Dark Theme" | `Sun` |
| `dark` | "Switch to System Theme" | `Moon` |

On execute it computes the next mode (`system -> light -> dark -> system`) and persists it with `updateThemeSettings({ mode: nextMode })`. Keywords: `theme`, `dark`, `light`, `system`, `appearance`, `mode`.

This command only writes the `mode` setting. The actual theme application (how the mode resolves against the OS preference and is applied to the overlay shadow DOM and the new-tab DOM, plus the picker structure used in the new-tab settings UI) is documented in [../new-tab-and-theme.md](../new-tab-and-theme.md). Settings persistence shape lives in [../settings.md](../settings.md).

---

## Themes

Source: `background/commands/ui/selectTheme.ts`, exported as `selectTheme` (`GroupCommandNode`). Id `theme`, `supportedBrowsers: ["chrome", "firefox"]`, `enableDeepSearch: true`.

A `group` whose `children` are generated (async) from `THEME_OPTIONS` in `shared/utils/themes.ts` — the OS-aware trio (`system`, `light`, `dark`) followed by the always-on named themes (`solarized-light`, `solarized-dark`, `monokai`, `nord`, the four `catppuccin-*`, `one-dark`, `dracula`). Each child is an `action`:

- `name` is the theme label; `id` is `theme-<mode>`.
- The currently active theme (read via `getThemeSettings()`) shows a `Check` icon and the description "Current theme"; others show `Monitor`/`Sun`/`Moon` (the trio) or `Palette` (named themes) and "Switch to <label>".
- `execute` persists the theme with `updateThemeSettings({ mode })`. `remainOpenOnSelect: true` keeps the palette open, so the overlay/new-tab reapply live (via the `storage.onChanged` listeners) and the `Check` marker moves on the automatic refresh.

Whereas Toggle Theme cycles the trio, this command exposes every theme directly. Both write only the `mode` setting; application is covered in [../new-tab-and-theme.md](../new-tab-and-theme.md).

---

## Manage Command Allow List / Manage Command Deny List

Sources: `background/commands/ui/manageAllowList.ts` (`manageAllowList`) and `background/commands/ui/manageDenyList.ts` (`manageDenyList`). Both are `GroupCommandNode`s and are structurally identical apart from allow-vs-deny wording, icons (`Shield` vs `ShieldX`), keywords, the setting field they read/write, and the `updateCommandUrlRules` key they update. They provide the manual editing surface for per-command `urlRules`. For matching semantics (wildcards, domain extraction, allow/deny precedence), see [../url-filtering.md](../url-filtering.md).

### UX flow

Selecting the top-level command produces one child **subgroup per user-configurable command**. The candidate list comes from `loadUserConfigurableCommands()` (`background/commands/userConfigurableCommands.ts`), which is a deduplicated, platform-filtered registry of browser, tool, theme, website, new-tab, clear-favorites, and Firefox commands. Note it deliberately does **not** include the manage allow/deny commands themselves, so they cannot be configured against each other.

Each per-command subgroup (`<command.id>-allow-group` / `<command.id>-deny-group`) takes the underlying command's name and icon and, when opened, shows two children:

1. An `input` row (`<command.id>-allow-patterns` / `-deny-patterns`) with a `text-list` field. Its `defaultValue` is loaded from current settings: `getCommandSettings(command.id)?.urlRules?.allowUrls` (or `denyUrls`), so existing patterns are pre-populated. The placeholder demonstrates the pattern format, e.g. `*://*.github.com/*` or `*://localhost:3000/*`.
2. A `submit` row ("Save Allow List" / "Save Deny List", `actionLabel: "Save"`, icon `Save`) with `remainOpenOnSelect: true`.

### Listing, adding, removing rules

There is no separate add/remove UI. The `text-list` field is the full, editable rule set:

- **Listing** is the pre-populated `defaultValue` showing existing patterns.
- **Adding** is appending a pattern in the list field.
- **Removing** is deleting a pattern from the list field.

On submit, the executor reads the field value, splits on commas, trims, and drops empties:

```ts
const raw = String(values?.["allow-patterns"] || "")
const patterns = raw
  .split(",")
  .map((pattern) => pattern.trim())
  .filter((pattern) => pattern.length > 0)
```

Each pattern is validated with `validateUrlPattern` (from `background/utils/urlFilter.ts`); any invalid pattern throws `Invalid pattern "<pattern>": <reason>` and aborts the save. Valid patterns are persisted via `updateCommandUrlRules(command.id, { allowUrls: patterns.length > 0 ? patterns : undefined })` (deny list uses `{ denyUrls: ... }`). Passing `undefined` when the list is empty clears that rule set. A success toast ("Allow list updated" / "Deny list updated") is shown. Because the submit sets `remainOpenOnSelect: true`, the palette stays open and the UI refreshes the command list so visibility changes take effect immediately.

`updateCommandUrlRules` is the dedicated helper that shallow-merges into the command's `urlRules`; per the project settings contract it preserves the sibling rule set (e.g. saving an allow list does not wipe a previously stored deny list). See [../settings.md](../settings.md) and [../url-filtering.md](../url-filtering.md).

### Relationship to the generated "Hide from Domain" action

The deny list is also written by the generated "Hide from Domain" action that the suggestion-conversion layer attaches to commands when a current URL exists; that path stores a deny pattern for the current domain. The Manage Command Deny List command is the way to view and remove patterns added that way. The generated action itself is documented in [../url-filtering.md](../url-filtering.md) and [../execution-and-actions.md](../execution-and-actions.md).

### Known issues and test coverage

- Rule sets are keyed per command id. Dynamic-id commands (e.g. the website prototype generating many ids) can fragment settings; the managers only list `loadUserConfigurableCommands()` entries, which are stable-id commands.
- URL pattern validation (`validateUrlPattern`) is custom. The manage URL rules test (`background/commands/ui/manageUrlRules.test.ts`) covers validating and persisting allow-list and deny-list patterns and rejecting invalid patterns (e.g. `ftp://...`). The settings test (`background/commands/settings.test.ts`) asserts allow/deny saves preserve sibling command settings (e.g. saving an allow list keeps an existing deny list).
- Manual checks worth keeping: add an allow pattern and confirm the command only appears on matching URLs; add allow + deny and confirm deny wins; use Hide from Domain then remove the pattern via the deny manager and confirm the command returns; test wildcard (`*://*.github.com/*`) and local (`*://localhost:3000/*`) patterns.

---

## Clear Favorites

Source: `background/commands/favorites.ts`, exported as `clearFavoritesCommand` (`ActionCommandNode`). Id `clear-favorites`, name "Clear favorites", icon `Trash2`. Unlike the other commands in this catalog it is not part of `uiCommands`; `loadAllCommands` (`background/commands/source.ts`) appends it directly to the global command set.

On execute it removes the `monocle-favoriteCommandIds` key from `chrome.storage.local` — the storage that backs the favorites feature (how commands become favorites and how favorites are surfaced is documented in [../search-and-ranking.md](../search-and-ranking.md)).

After clearing (or on failure) it sends a `monocle-alert` event (`level: "success"` or `"error"`) to the active tab via `tabs.sendMessage`. Known issue: no mounted UI component listens for `monocle-alert` (see [../execution-and-actions.md](../execution-and-actions.md)), so this feedback is silently dropped today — the favorites are cleared, but the user sees no confirmation.

It is included in `loadUserConfigurableCommands()` (`background/commands/userConfigurableCommands.ts`), so it can receive custom keybindings and URL rules like other stable-id commands.

---

## Related docs

- [../command-types.md](../command-types.md) - `action`, `group`, `input`, and `submit` node behavior.
- [../command-schema.md](../command-schema.md) - the `text-list` `FormField` and `remainOpenOnSelect`.
- [../url-filtering.md](../url-filtering.md) - URL rule matching semantics, the Hide from Domain action, and management.
- [../settings.md](../settings.md) - command settings storage and `updateCommandUrlRules` merge behavior.
- [../new-tab-and-theme.md](../new-tab-and-theme.md) - theme application and the theme picker.
- [../authoring-commands.md](../authoring-commands.md) - adding commands and category registration.
