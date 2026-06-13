# Command Schema Reference

Every command in Monocle is a typed `CommandNode` value defined in `shared/types/commands.ts`. The background owns these nodes (including their executable functions and dynamic resolvers); the React UI never sees a `CommandNode`. Instead, the background resolves each node's async values against the current `Browser.Context` and converts it into a serializable `Suggestion` (`shared/types/ui.ts`) via `commandsToSuggestions` in `background/commands/index.ts`. This document is the field-by-field reference for authoring nodes: the shared base, the six node types, the `AsyncValue` resolution model, action labels, the full `FormField` catalog, and exactly which fields survive the node-to-suggestion conversion.

For how to register and place a command, see [authoring-commands.md](authoring-commands.md). For the six types in narrative depth, see [command-types.md](command-types.md). For the executor flow and generated action menus, see [execution-and-actions.md](execution-and-actions.md).

Page-owned site commands use a validated public subset of this model exposed as
`window.Monocle`. That schema lives in `shared/types/siteSdk.ts` and is
documented in [site-sdk.md](site-sdk.md). It supports the same six node
families, but does not expose `permissions`, `supportedBrowsers`, default
`keybinding`, or custom-keybinding fields; SDK wrappers are background-owned
`CommandNode`s after validation.

## The `AsyncValue<T>` model

```ts
export type AsyncValue<T> = T | ((context: Browser.Context) => Promise<T>)
```

Source: `shared/types/commands.ts`, `AsyncValue`.

Most display-facing fields on `CommandNodeBase` accept either a **static value** or an **async function of `Browser.Context`**. The async form lets a command render differently depending on the current page, the active modifier key, or persisted settings. `toggleTheme` (`background/commands/ui/theme.ts`) uses async `name`, `description`, and `icon` to reflect the current theme mode; `gotoTab` (`background/commands/browser/gotoTab.ts`) uses an async `name`/`icon` per tab.

### Where and when resolution happens

`AsyncValue` fields are resolved during suggestion conversion, not at render time. `commandsToSuggestions` calls `resolveAsyncProperty` (`background/utils/commands.ts`) on each async-capable field:

```ts
export async function resolveAsyncProperty<T>(
  property: AsyncProperty<T> | undefined,
  context: Browser.Context,
): Promise<T | undefined> {
  if (property === undefined) return undefined
  return typeof property === "function" ? await property(context) : property
}
```

Implications for authors:

- Resolver functions run **once per palette fetch** (root load, child page load, or search). They must be fast; expensive work blocks the whole suggestion batch (`Promise.all` over all commands in `commandsToSuggestions`).
- The `context` passed in is the live `Browser.Context` (`shared/types/browser.ts`): `{ url, title, modifierKey, isNewTab? }`. `modifierKey` reflects the modifier held when the palette fetch occurred, so it is generally `null` during a normal load. Do not rely on it inside `name`/`icon` resolvers for per-keystroke behavior; use `modifierActionLabel` and read `context.modifierKey` inside `execute` instead.
- The resolved name falls back to `"Unnamed Command"` if it resolves to `undefined` (`commandsToSuggestions`).

## `Browser.Context`

```ts
export namespace Browser {
  export type ModifierKey = "shift" | "cmd" | "alt" | "ctrl"
  export type Platform = "chrome" | "firefox"
  export interface Context {
    url: string
    title: string
    modifierKey: ModifierKey | null
    isNewTab?: boolean
  }
}
```

Source: `shared/types/browser.ts`. This is the only argument given to `AsyncValue` resolvers and the first argument to executors.

## `CommandNodeBase`

Every node extends this base (`shared/types/commands.ts`, `CommandNodeBase`).

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable identifier. Use kebab-case for static commands. Generated/dynamic ids embed runtime data (e.g. `bookmark-folder-${node.id}`). The id is used as the CMDK row value, the favorites key, the usage-ranking key, the command-settings key, and the keybinding key, so it must be unique within a page and stable across loads. |
| `name` | `AsyncValue<string \| string[]>` | yes | Display name. An **array** means `[childName, ...ancestorNames]` (a breadcrumb). The first element is the primary display name; trailing elements are ancestor/context names. See [name as string vs array](#name-as-string-vs-array). |
| `description` | `AsyncValue<string>` | no | Secondary line. Also fed into the fuzzy-search keyword set for the row (`CommandItem`). Bookmarks use the URL as the description so URLs are searchable. |
| `icon` | `AsyncValue<CommandIcon>` | no | Lucide icon or remote URL. See [CommandIcon](#commandicon). |
| `color` | `AsyncValue<CommandColor \| string>` | no | Icon tint. Accepts a preset object, a custom-hex object, or a bare string (preset name or raw CSS color). See [CommandColor](#commandcolor). |
| `keywords` | `AsyncValue<string[]>` | no | Extra fuzzy-search tokens beyond the name/description. |
| `permissions` | `BrowserPermission[]` | no | Optional browser permissions this command requires. Inherited down group children (see [permission inheritance](#permission-inheritance)). |
| `urlRules` | `UrlRules` | no | Page-URL allow/deny visibility rules. See [url-filtering.md](url-filtering.md). |
| `supportedBrowsers` | `Browser.Platform[]` | no | Restricts the command to `"chrome"` and/or `"firefox"`. Omit to support both. |
| `executionPayload` | `AsyncValue<SuggestionExecutionPayload>` | no | Pre-baked values surfaced on the suggestion and available to dynamic execution paths. See [executionPayload](#executionpayload). |
| `keybinding` | `string` | no | Author-default keybinding in canonical angle-bracket format, e.g. `<cmd-t>`. User overrides in command settings take precedence. See [keybindings.md](keybindings.md). |
| `keybindingBehavior` | `"execute" \| "openPaletteAtCommand"` | no | Defaults to `"execute"`. `action`/`submit` commands execute by default; `group`/`search` commands may opt into `"openPaletteAtCommand"` so their shortcut opens the palette at that command page. |

> `permissions` is declared on the base (not just on action nodes) so that groups, inputs, and search nodes can also participate in permission gating and inheritance. Note that `permissions` is **not** an `AsyncValue` — it is a plain static array.

### `name` as string vs array

`name` is `string | string[]`. The array form encodes a breadcrumb where index 0 is the command's own name and later indices are ancestor names:

- The UI's `CommandItem` shows the full array (e.g. `Parent > Child`) at the top level, but when you are viewing a parent's children page it shows only `name[0]` (`getContextualDisplayName` in `shared/components/Command/CommandItem/index.tsx`), since the parent context is already visible.
- For ranking/search, `name[0]` is weighted highest and the remaining tokens are merged in as keywords (`CommandItem` builds `mergedKeywords`).
- `getDisplayName` / `resolveCommandName` (`background/utils/commands.ts`) collapse an array to its first element when a single string is needed.

A static string is the common case; use the array form for flattened deep-search results that need ancestor context.

### `CommandIcon`

```ts
export type CommandIcon =
  | { type: "lucide"; name: IconName }
  | { type: "url"; url: string }
  | { type: "svg"; svg: string }
```

Source: `shared/types/commands.ts`, `CommandIcon`.

| Variant | Shape | Use |
| --- | --- | --- |
| Lucide | `{ type: "lucide", name: "Bookmark" }` | Named [Lucide](https://lucide.dev) icon. `name` is the PascalCase Lucide component name and must be a registered `IconName`. |
| URL | `{ type: "url", url: faviconUrl }` | Remote image, typically a favicon (`getFaviconUrl` / `getFaviconIcon` in `background/utils/`). If the page or network blocks the image, the UI falls back to a generic icon. |
| SVG | `{ type: "svg", svg: "<svg ...>...</svg>" }` | Inline SVG markup, primarily for site SDK brand icons. Rendered only as a static `<img>` data URI (`svgIconToDataUri` in `shared/utils/svg-icon.ts`), never injected inline, so scripts, event handlers, and external references are inert. Site SDK input is additionally validated by `validateSvgIconMarkup`. |

`IconName` is the curated, closed set of Lucide icons Monocle ships, defined in
`shared/types/icons.ts` (`ICON_NAMES`). Only registered icons are bundled, so the
palette UI resolves icons through the explicit map in
`shared/components/iconRegistry.ts` instead of a namespace import that would ship
the entire icon library. The bundled set covers common browser, document,
commerce, communication, analytics, developer, and generic site-command
concepts. Use `{ type: "url" }` for site logos, brand marks, or highly specific
imagery. To use a new Lucide icon, add its name to `ICON_NAMES` and its component
import to `ICON_MAP`; `tsc` enforces that the two stay in sync and that every
command references a registered icon.

### `CommandColor`

```ts
export type ColorName =
  | "red" | "green" | "blue" | "amber" | "lightBlue" | "gray"
  | "purple" | "orange" | "teal" | "pink" | "indigo" | "yellow"
export type CommandColor = { preset: ColorName } | { custom: string }
```

Source: `shared/types/commands.ts`, `ColorName` / `CommandColor`. The node `color` field is typed `AsyncValue<CommandColor | string>`, so three forms are all valid:

| Form | Example | Notes |
| --- | --- | --- |
| Bare preset string | `color: "blue"` | Most commands use this. Must be one of the `ColorName` values to map to a theme color. |
| Preset object | `color: { preset: "teal" }` | Equivalent, explicit. |
| Custom object | `color: { custom: "#ff8800" }` | Arbitrary CSS color. |
| Bare custom string | `color: "#ff8800"` | A raw string that is not a preset name is passed through as a CSS color by the `Icon` component. |

The resolved color is carried onto the suggestion as a plain string (`baseProps.color` in `commandsToSuggestions`).

### `executionPayload`

```ts
export type SuggestionExecutionPayload = Record<string, string | string[]>
```

`executionPayload` is an `AsyncValue<SuggestionExecutionPayload>` resolved onto the suggestion. It carries command-specific data the UI may pass back during execution — for example, a dynamic search result can set `executionPayload: { dynamicUrl: url }` so the parent `SearchCommandNode.execute` can open the selected child's URL via `values.dynamicUrl`. Site SDK commands pass declared payloads through the same field (`background/commands/siteSdk/commands.ts`). Use it for static-per-row data that execution needs; for form input use [`InputCommandNode`](#inputcommandnode) instead.

### Permission inheritance

`commandsToSuggestions` accepts an `inheritedPermissions` array and computes `effectivePermissions = mergePermissions(inheritedPermissions, node.permissions)`. Group children inherit the group's permissions, so a child of a `permissions: ["tabs"]` group is treated as requiring `tabs` even if the child does not declare it. The merged set is what appears on the suggestion and what `executeResolvedCommand` checks before running. See [permissions.md](permissions.md).

### `BrowserPermission`

```ts
export type BrowserPermission =
  | "activeTab" | "bookmarks" | "browsingData" | "contextualIdentities"
  | "cookies" | "downloads" | "history" | "sessions" | "storage" | "tabs"
```

Source: `shared/types/commands.ts`, `BrowserPermission`. These are the optional permission strings a command may request; see [permissions.md](permissions.md) for the grant flow.

## `ActionLabel` (shared by action, submit, search)

```ts
export type ActionLabel = {
  actionLabel?: AsyncValue<string>
  modifierActionLabel?: { [K in Browser.ModifierKey]?: AsyncValue<string> }
}
```

Source: `shared/types/commands.ts`, `ActionLabel`. Mixed into `ActionCommandNode`, `SubmitCommandNode`, and `SearchCommandNode`.

- **`actionLabel`** is the footer verb shown when the row is focused (e.g. `"Open"`, `"Search"`, `"New tab →"`). It is resolved via `resolveActionLabel`, which falls back to `"Run"` when absent. Groups always get `"Open"` (hard-coded in `commandsToSuggestions`, ignoring any author value).
- **`modifierActionLabel`** maps each modifier key (`cmd`/`shift`/`alt`/`ctrl`) to an alternate footer label. When present, the footer shows the modifier label while that key is held, and the matching generated modifier action is added to the action menu (see below).

What modifier labels change:

1. The footer label updates per held modifier.
2. `commandsToSuggestions` generates a per-modifier action (id `${node.id}-${key}-enter-action`, keybinding `<{key}-enter>`) for each label present, with `executionContext: { type: "modifier", modifierKey: key }`. Executing it runs the command with `context.modifierKey` set to that key.

A label does **not** itself change behavior — the executor must inspect `context.modifierKey`. `openNewTab` declares `modifierActionLabel: { shift: "New tab ←" }` and `bookmarks` declares `modifierActionLabel: { cmd: "Open in New Tab" }`, and each branches on `context?.modifierKey` inside `execute`.

## Node types

```ts
export type CommandNode =
  | GroupCommandNode
  | ActionCommandNode
  | SubmitCommandNode
  | InputCommandNode
  | DisplayCommandNode
  | SearchCommandNode
```

All share the discriminated `type` field. The six are summarized in [command-types.md](command-types.md); the per-type fields follow.

### `ActionCommandNode`

```ts
export interface ActionCommandNode extends CommandNodeBase, ActionLabel {
  type: "action"
  execute: CommandExecutor
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  allowCustomKeybinding?: boolean
  keybindingRequirements?: KeybindingRequirements
  dedupeKey?: string
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `execute` | `CommandExecutor` | Required. `(context?, values?) => void \| Promise<void>`. Runs in the background. Receives the normalized `Browser.Context` and form values (see [CommandExecutor & form value normalization](#commandexecutor--form-value-normalization)). |
| `confirmAction` | `boolean` | If `true`, the row requires a second Enter ("Are you sure?") before executing (`CommandItem`), and the command is **excluded from custom keybindings** (`allowsKeybinding` in `background/utils/commands.ts`). |
| `remainOpenOnSelect` | `boolean` | If `true`, the palette stays open after execution instead of closing. |
| `allowCustomKeybinding` | `boolean` | Defaults to allowed. Set `false` to forbid user-assigned keybindings — used for dynamic commands whose ids churn (e.g. `gotoTab` children, dynamic search results). |
| `keybindingRequirements` | `KeybindingRequirements` | Optional constraints on which custom keybindings may be assigned. `requireNonShiftModifier: true` requires cmd/ctrl/alt in every stroke (shift alone doesn't count) — needed when the shortcut must fire while an editable element is focused (e.g. snippet insertion). Enforced at assignment time in both capture UIs and on persist; see [keybindings.md](keybindings.md). |
| `dedupeKey` | `string` | Stable key used to de-duplicate rows that point at the same target across sources (bookmarks use `normalizeUrlForDedupe(node.url)`). Distinct from `id`; see [search-and-ranking.md](search-and-ranking.md). |

Minimal example (`background/commands/browser/openNewTab.ts`):

```ts
export const openNewTab: CommandNode = {
  type: "action",
  id: "open-new-tab",
  name: "Open new tab",
  icon: { type: "lucide", name: "PlusSquare" },
  color: "purple",
  keybinding: "<cmd-t>",
  actionLabel: "New tab →",
  modifierActionLabel: { shift: "New tab ←" },
  execute: async (context) => {
    await createTab({ index: context?.modifierKey === "cmd" ? 0 : undefined })
  },
}
```

### `SubmitCommandNode`

```ts
export interface SubmitCommandNode extends CommandNodeBase, ActionLabel {
  type: "submit"
  execute: CommandExecutor
  doNotAddToRecents?: boolean
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  allowCustomKeybinding?: boolean
  keybindingRequirements?: KeybindingRequirements
  dedupeKey?: string
}
```

Identical to `ActionCommandNode` plus `doNotAddToRecents`, and rendered as a button rather than a normal row. A submit's `execute` receives all inline form values from the current page (collected from sibling `input` nodes). Before running, the UI validates every inline field on the page (`CommandItem` → `validateFormValues`) and blocks submission on failure.

| Extra field | Type | Notes |
| --- | --- | --- |
| `doNotAddToRecents` | `boolean` | If `true`, executing the submit does **not** record usage (`shouldRecordUsage` in `background/commands/index.ts`). Actions always record; submits record unless this is set. |

### `GroupCommandNode`

```ts
export interface GroupCommandNode extends CommandNodeBase {
  type: "group"
  children: (context: Browser.Context) => Promise<CommandNode[]>
  enableDeepSearch?: boolean
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `children` | `(context) => Promise<CommandNode[]>` | Required resolver returning child nodes. Always a function (not `AsyncValue`); always receives context. Return [`createNoOpCommand`](#display-only-helper) display rows for empty/error states rather than throwing or alerting. |
| `enableDeepSearch` | `boolean` | If `true`, the group's `action` and `submit` descendants are flattened into root search results via the background search index (`background/commands/searchIndex.ts`). **`input` and `display` children are not flattened.** See [search-and-ranking.md](search-and-ranking.md). |

Groups are not executable; their suggestion `actionLabel` is forced to `"Open"`. Example (`background/commands/browser/gotoTab.ts`):

```ts
export const gotoTab: CommandNode = {
  type: "group",
  id: "goto-tab",
  name: "Go to tab",
  icon: { type: "lucide", name: "ArrowRightSquare" },
  color: "green",
  permissions: ["tabs"],
  children: async () => {
    const tabs = await queryTabs({ currentWindow: true })
    return tabs.filter((t) => !!t.title).map((tab) => ({
      type: "action",
      id: `go-to-tab-${tab.id}`,
      name: async () => tab.title!,
      icon: async () => getFaviconIcon({ browserFaviconUrl: tab.favIconUrl, url: tab.url }),
      allowCustomKeybinding: false,
      execute: async () => { await updateTab(tab.id, { active: true }) },
    }))
  },
}
```

### `SearchCommandNode`

```ts
export interface SearchCommandNode extends CommandNodeBase, ActionLabel {
  type: "search"
  execute?: CommandExecutor
  getResults: (context: Browser.Context, search: string) => Promise<CommandNode[]>
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `getResults` | `(context, search) => Promise<CommandNode[]>` | Required. Re-invoked as the user types on the search page; returns the dynamic result nodes for the current `search` text. |
| `execute` | `CommandExecutor` | **Optional.** Used when the UI executes the search parent itself (e.g. opening the selected result's URL via its `executionPayload.dynamicUrl`). |

Unlike `group`, a search node is conceptually executable (its `actionLabel` is its own, not forced to `"Open"`), and `getResults` keys off the live search string rather than returning a fixed child set. There is currently no static `search` command in the tree; site SDK registrations (`background/commands/siteSdk/commands.ts`) are the live producer of search nodes.

### `InputCommandNode`

```ts
export interface InputCommandNode extends CommandNodeBase {
  type: "input"
  field: FormField
}
```

A single inline form field rendered as a list row. Selecting it does nothing (`handleSelect` no-ops for inputs); its value lives in navigation form state keyed by `field.id` and is collected by a sibling [`SubmitCommandNode`](#submitcommandnode). The `field` is the full [`FormField`](#formfield-reference) shape. A "form" is therefore a group whose children are several `input` nodes plus one `submit` node.

### `DisplayCommandNode`

```ts
export interface DisplayCommandNode extends CommandNodeBase {
  type: "display"
}
```

A static, non-executable row (headings, help text, empty/error states). No extra fields. Selection is a no-op. Use the helper rather than hand-rolling:

#### Display-only helper

```ts
export function createNoOpCommand(
  id: string, name: string, description: string,
  icon: CommandIcon = { type: "lucide", name: "Info" },
): CommandNode
```

`background/utils/commands.ts`, `createNoOpCommand` — builds a gray `display` node. Prefer it for empty/error child states (bookmarks use `BookmarkX` / `AlertTriangle` no-ops).

## `CommandExecutor` & form value normalization

```ts
export type CommandExecutor = (
  context?: Browser.Context,
  values?: Record<string, string>,
) => void | Promise<void>
```

Source: `shared/types/commands.ts`, `CommandExecutor`. Used by `action`, `submit`, and (optionally) `search` nodes.

The executor's `values` are **always strings**, even though UI form state stores some fields as arrays. `executeResolvedCommand` calls `normalizeFormValues` (`background/commands/index.ts`) before invoking `execute`:

```ts
const normalizeFormValues = (formValues = {}) =>
  Object.fromEntries(
    Object.entries(formValues).map(([k, v]) =>
      [k, Array.isArray(v) ? v.join(",") : (v ?? "")]),
  )
```

So a `multi` or `text-list` field whose UI state is `["a", "b"]` arrives at your executor as `"a,b"`. Split on commas if you need the array back. Permission checks run before `execute` (`executeResolvedCommand`); if the merged permissions are not granted, a toast is shown and the executor does not run.

## `FormField` reference

```ts
export type FormField = {
  id: string
  label: string
  required?: boolean
  validation?: JSONSchema
} & ( /* one of the variants below */ )
```

Source: `shared/types/ui.ts`, `FormField`. Common fields apply to every variant; the `type` discriminator selects the variant-specific fields. `validation` is a JSON Schema object (typically from `z.toJSONSchema()`) checked by `validateWithJsonSchema`.

| Common field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Key under which the value is stored in page form state and passed to the executor. |
| `label` | `string` | Shown in the row's right-aligned meta slot. |
| `required` | `boolean` | Enforced by `validateFormValues` on submit. |
| `validation` | `JSONSchema` | Optional per-field schema; drives the inline valid/invalid dot. |

### Field variants

| `type` | Variant fields | Renders as (component) | Stored value | Default (`getDefaultValue`) |
| --- | --- | --- | --- | --- |
| `text` | `placeholder?`, `defaultValue?: string` | text input — `CommandItemInput` | `string` | `defaultValue \|\| ""` |
| `textarea` | `placeholder?`, `defaultValue?: string`, `rows?` | multi-line textarea — `CommandItemTextarea` | `string` | `defaultValue \|\| ""` |
| `select` | `options: {value,label}[]`, `defaultValue?: string`, `placeholder?` | native `<select>` — `CommandItemSelect` | `string` | `defaultValue \|\| ""` |
| `checkbox` \| `switch` | `defaultChecked?: boolean` | On/Off toggle button — `CommandItemSwitch` | `"true"` / `"false"` (string) | `defaultChecked ? "true" : "false"` |
| `radio` | `options: {value,label}[]`, `defaultValue?: string` | **not rendered** (see note) | `string` | `defaultValue \|\| options[0]?.value \|\| ""` |
| `multi` | `options: {value,label}[]`, `defaultValue?: string[]` | multi-select chips — `CommandItemMulti` | `string[]` | `defaultValue \|\| []` |
| `text-list` | `placeholder?`, `defaultValue?: string[]`, `maxItems?` | repeatable text rows — `CommandItemTextList` | `string[]` | `defaultValue \|\| []` |
| `color` | `defaultValue?: string` (`#RRGGBB`), `placeholder?` | swatch button + native color picker — `CommandItemColor` | `string` (hex) | `defaultValue \|\| "#000000"` |
| `number` | `defaultValue?: number`, `min?`, `max?`, `step?`, `placeholder?` | **no palette renderer** — used by feature settings schemas (options-page `SchemaForm`, see [features.md](./features.md)) | `string` | `defaultValue != null ? String(defaultValue) : ""` |

Defaults come from `getDefaultValue` in `shared/utils/forms.ts`; `computeDefaultFormValues` seeds page form state from all `input` rows on a page.

Notes on rendering and storage:

- **`radio` has no renderer.** `FormField` declares a `radio` variant and `getDefaultValue` handles it, but `CommandItem`'s `match` on `inputField.type` covers only `text`, `textarea`, `select`, `checkbox`/`switch`, `multi`, and `color` (plus `text-list` via an early return). A `radio` input row therefore renders nothing today. Prefer `select` or `multi`.
- **`textarea` owns Enter and arrow keys.** Plain Enter inserts a newline (Cmd/Ctrl+Enter submits the form), and Up/Down move the caret inside the field; arrows only hand navigation back to CMDK when the caret is already at the first/last position (`CommandItemTextarea`).
- **`checkbox`/`switch` store strings**, not booleans: `"true"`/`"false"`. The toggle reads `raw === "true"` (`CommandItemSwitch`).
- **`multi` and `text-list` store arrays** in UI state. `multi` toggles option values into a `string[]`; `text-list` keeps a normalized `string[]` (auto-appends a trailing empty row, Backspace on an empty row removes it). Both are flattened to comma-joined strings before reaching the executor (see normalization above). `validateFormValues` (`shared/utils/forms.ts`) splits/joins these for schema validation, treating a `required` empty array as invalid.
- **`text-list`** is handled by a dedicated early return in `CommandItem` and renders one `Command.Item` per entry (`CommandItemTextList`). `maxItems` is part of the type but is not enforced by the renderer.
- Every inline input forwards Up/Down arrows to the CMDK search input so list navigation still works while a field is focused (`useInlineInputKeys`).

## Node-to-Suggestion conversion

`commandsToSuggestions` (`background/commands/index.ts`) maps each `CommandNode` to a `Suggestion` (`shared/types/ui.ts`). This is the boundary between background-owned commands and the UI. Authors should know which fields cross it.

### Base fields carried onto every suggestion

Resolved into `baseProps` and spread onto the suggestion:

| Suggestion field | Source | Notes |
| --- | --- | --- |
| `id` | `node.id` | Verbatim. |
| `name` | resolved `node.name` | Collapsed to `string` (or kept as the resolved string/array). `undefined` → `"Unnamed Command"`. |
| `description` | resolved `node.description` | |
| `executionPayload` | resolved `node.executionPayload` | |
| `icon` | resolved `node.icon` | |
| `keywords` | resolved `node.keywords` | |
| `color` | resolved `node.color` | Coerced to a string. |
| `keybinding` | settings override → `node.keybinding` → `""` | Only set when `allowsKeybinding(node)` is true; normalized via `normalizeKeybinding`. `action`/`submit` commands are allowed unless high-risk or explicitly opted out; `group`/`search` commands are allowed only with `keybindingBehavior: "openPaletteAtCommand"`. |
| `isFavorite` | favorites store | `favoriteCommandIds.includes(node.id)`. |
| `permissions` | merged | `mergePermissions(inheritedPermissions, node.permissions)`. |

### Per-type suggestion fields

| Node type | Suggestion `type` | `actionLabel` | `modifierActionLabel` | Other |
| --- | --- | --- | --- | --- |
| `action` | `action` | resolved (`"Run"` fallback) | resolved map | `confirmAction`, `remainOpenOnSelect`, `actions[]` |
| `submit` | `submit` | resolved | resolved map | `confirmAction`, `remainOpenOnSelect`, `actions[]` |
| `search` | `search` | resolved | — | `actions[]` |
| `group` | `group` | forced `"Open"` | — | `actions[]` |
| `input` | `input` | `undefined` | — | `inputField: node.field` |
| `display` | `display` | `undefined` | — | — |

### Fields that do NOT cross the boundary

These exist on the node but are **background-only** and are never serialized onto the suggestion:

- `execute` / `getResults` / `children` — executable functions and resolvers stay in the background. The UI triggers them by sending `execute-command` / `get-children-commands` with the command id; see [messaging.md](messaging.md).
- `urlRules`, `supportedBrowsers` — consumed during loading/filtering before conversion, not surfaced to the UI.
- `dedupeKey`, `doNotAddToRecents`, `allowCustomKeybinding`, `keybindingRequirements`, `keybindingBehavior`, `enableDeepSearch` — consumed by ranking/usage/keybinding/deep-search logic in the background, not placed on the suggestion. (`keybindingRequirements` does reach the UI, but only inside the `setKeybinding` action's execution context and the settings catalog row, not on the command's own suggestion.)
- The raw `keybinding` string from settings is used to compute the suggestion `keybinding`, but `allowCustomKeybinding` itself is not exposed.
- Site SDK commands force `allowCustomKeybinding: false`, so they receive
  Favorite and Hide from Domain generated actions but not Set/Reset Keybinding
  actions.

### Generated actions (`actions[]`)

For `action`, `submit`, `group`, and `search` nodes, `commandsToSuggestions` attaches an `actions: Suggestion[]` action menu, each entry carrying an `executionContext`:

- A primary `…-enter-action` (`executionContext.type === "primary"`, keybinding `enter`).
- One `…-{modifier}-enter-action` per defined `modifierActionLabel` (`type: "modifier"`, keybinding `<{modifier}-enter>`).
- A favorite toggle, a hide-from-domain action (when a domain is available), and set/reset custom keybinding actions (when `allowsKeybinding` is true).

The `actions` array and `executionContext` are entirely background-generated — authors do not write them. See [execution-and-actions.md](execution-and-actions.md) for the full action-menu catalog and how `executionContext` routes execution.

## Worked examples

### URL-scoped command

A command visible only on matching pages via `urlRules` (semantics in [url-filtering.md](url-filtering.md)):

```ts
export const exampleScoped: CommandNode = {
  type: "action",
  id: "copy-issue-link",
  name: "Copy issue link",
  icon: { type: "lucide", name: "Link" },
  color: "blue",
  urlRules: { allowUrls: ["https://github.com/*/issues/*"] },
  execute: async (context) => { /* … */ },
}
```

### Form (group + input children + submit)

```ts
export const exampleForm: GroupCommandNode = {
  type: "group",
  id: "create-note",
  name: "Create note",
  icon: { type: "lucide", name: "FilePlus" },
  children: async () => [
    { type: "input", id: "title", name: "Title",
      field: { id: "title", label: "Title", type: "text", required: true } },
    { type: "input", id: "tags", name: "Tags",
      field: { id: "tags", label: "Tags", type: "multi",
        options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] } },
    { type: "submit", id: "create-note-submit", name: "Create",
      actionLabel: "Create",
      execute: async (_ctx, values) => {
        // values.title is a string; values.tags is "a,b" (array joined)
      } },
  ],
}
```

The `submit`'s `execute` receives `{ title, tags }` with `tags` comma-joined per [form value normalization](#commandexecutor--form-value-normalization).

For a minimal action see `openNewTab` above; for a dynamic group see `gotoTab`; for search nodes see the site SDK conversion (`background/commands/siteSdk/commands.ts`); for modifier labels and a per-row `dedupeKey` see `bookmarks` (`background/commands/browser/bookmarks.ts`).

## Known issues / gotchas

- **`radio` renders nothing.** The variant exists in the type and `getDefaultValue`, but `CommandItem` has no `radio` case. Do not author `radio` inputs until a renderer is added.
- **`maxItems` on `text-list` is unenforced** by `CommandItemTextList`.
- **Async resolvers run on every fetch** and serially share one `Promise.all`; keep them cheap.
- **`modifierActionLabel` is label-only.** It generates a modifier action and footer label but does not change behavior — the executor must branch on `context.modifierKey`.
- **`group.actionLabel` is ignored** (forced to `"Open"`).
- **Executor values are always strings.** Array-typed fields (`multi`, `text-list`) are comma-joined before reaching `execute`.

## Related docs

- [command-types.md](command-types.md) — the six node types in depth.
- [authoring-commands.md](authoring-commands.md) — adding, registering, conventions.
- [execution-and-actions.md](execution-and-actions.md) — execution flow, action menus, generated actions.
- [search-and-ranking.md](search-and-ranking.md) — keywords, ranking, favorites, deep search, `dedupeKey`.
- [keybindings.md](keybindings.md) — canonical key format and custom bindings.
- [url-filtering.md](url-filtering.md) — `urlRules` matching semantics.
- [permissions.md](permissions.md) — required vs optional permissions and grant flows.
- [settings.md](settings.md) — command settings storage (keybinding overrides, URL rules).
- [messaging.md](messaging.md) — the background message protocol that drives loading and execution.
