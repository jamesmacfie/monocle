# Command Node Types

Monocle commands are a discriminated union of six node families defined in
`shared/types/commands.ts` (`CommandNode`): `action`, `submit`, `group`,
`search`, `input`, and `display`. The `type` field selects the variant and
determines what extra fields a node carries, how the background converts it into
a UI-facing `Suggestion`, how the shared palette renders it, and what selecting
the row does. This doc covers each family in depth. For the full field-by-field
schema (including `FormField` variants used by `input`) see
[command-schema.md](./command-schema.md); for how rows are searched and ranked
see [search-and-ranking.md](./search-and-ranking.md); for execution mechanics
and the action menu see [execution-and-actions.md](./execution-and-actions.md).

## Shared shape and rendering pipeline

Every node extends `CommandNodeBase` (id, `name`, optional `description`,
`icon`, `color`, `keywords`, `permissions`, `urlRules`, `executionPayload`).
Most string-producing fields are `AsyncValue<T>` — either a literal or a
`(context) => Promise<T>` resolver. The background resolves these in
`commandsToSuggestions` (`background/commands/suggestions.ts`) before sending plain
`Suggestion` values to the UI; the UI never receives executable functions.

In the shared palette, `shared/components/Command/CommandList.tsx` renders each
suggestion through `shared/components/Command/CommandItem/index.tsx`, which
branches on `suggestion.type` via `ts-pattern`:

| Node type | Component rendered | Meta label (right side) |
| --- | --- | --- |
| `action` | `CommandItemAction` | `Command` |
| `group` | `CommandItemAction` | `Group` |
| `search` | `CommandItemAction` (falls through `.otherwise`) | `Command` |
| `submit` | `CommandItemSubmit` (a focusable button) | none |
| `input` | one of `CommandItemInput`/`Select`/`Switch`/`Multi`/`Color`/`TextList` keyed off `inputField.type` | none |
| `display` | `CommandItemDisplay` | `Todo` (placeholder text) |

`CommandItem.handleSelect` is the single entry point for selecting a row. It is
the dispatch point that distinguishes "do nothing" rows (`input`, `display`)
from executable rows, checks permissions before executing, and applies the
two-press confirmation flow for `confirmAction` nodes.

---

## `action`

Purpose: a single executable command. This is the most common node and the only
one that always carries an `execute` function plus the full set of
execution-related metadata.

Type: `ActionCommandNode` extends `CommandNodeBase` and `ActionLabel`.

Key fields beyond the base:

| Field | Required | Meaning |
| --- | --- | --- |
| `execute` | yes | `CommandExecutor` run in the background on selection |
| `actionLabel` / `modifierActionLabel` | no | primary and per-modifier labels (from `ActionLabel`) |
| `confirmAction` | no | require a second Enter ("Are you sure?") before executing |
| `remainOpenOnSelect` | no | keep the palette open after execution |
| `allowCustomKeybinding` | no | when `false`, suppresses custom-keybinding actions (default behaves as allowed) |
| `keybinding` | no | canonical default binding string, e.g. `<cmd-k>` |
| `dedupeKey` | no | URL-style key used to collapse duplicates in deep search |

Rendering: `CommandItemAction`, showing the icon, an optional favorite star, the
name (only the first element of a `name` array when inside a child page), an
optional `KeybindingDisplay`, and the `Command` meta label.

Selecting: `handleSelect` checks `isGrantedAllPermissions` first (toasts and
aborts if missing), then either enters confirmation state or calls
`onSelect(suggestion.id)`, which sends `execute-command`. The background
(`executeCommand` in `background/commands/execution.ts`) resolves the node, re-checks
permissions, runs `execute(context, normalizedFormValues)`, and records usage
(`recordCommandUsage`) since `shouldRecordUsage` returns `true` for actions.

Keybindings, favorites, recents, deep search:
- Keybindings: actions are the primary keybindable family. `allowsKeybinding`
  (`background/utils/commands.ts`) returns `true` for actions unless
  `allowCustomKeybinding === false` or `confirmAction === true`.
- Favorites: every action gets a generated "Add/Remove from Favorites" action in
  its action menu (`createFavoriteToggleAction`).
- Recents/usage: counted on execution.
- Deep search: actions are flattened from groups that opt into
  `enableDeepSearch` — see the dedicated section below.

Nesting: actions are leaf nodes; they have no children.

Real example — switching to an open tab (`background/commands/browser/gotoTab.ts`,
a child produced by the `goto-tab` group):

```typescript
const node: CommandNode = {
  type: "action",
  id: `go-to-tab-${tab.id}`,
  name: async () => tab.title!,
  icon: async () => getFaviconIcon({ browserFaviconUrl: tab.favIconUrl, url: tab.url }),
  allowCustomKeybinding: false, // dynamic id — see "Dynamic ids" below
  execute: async () => {
    await updateTab(tab.id, { active: true })
    const updatedTab = await getTab(tab.id)
    if (updatedTab.windowId) await updateWindow(updatedTab.windowId, { focused: true })
  },
}
```

A modifier-aware example lives in `background/commands/browser/history.ts`, which
declares `modifierActionLabel: { cmd: "Open in New Tab" }` and branches on
`context?.modifierKey === "cmd"` inside `execute`. See
[execution-and-actions.md](./execution-and-actions.md) for how modifier Enter
generates extra action-menu entries.

---

## `submit`

Purpose: the executable button at the bottom of a form-style page. A `submit`
node is paired with sibling `input` nodes; on submit it collects all the page's
form values and runs once.

Type: `SubmitCommandNode` extends `CommandNodeBase` and `ActionLabel`. It mirrors
`action` (it has `execute`, `confirmAction`, `remainOpenOnSelect`,
`allowCustomKeybinding`, `keybinding`, `dedupeKey`) and adds:

| Field | Required | Meaning |
| --- | --- | --- |
| `doNotAddToRecents` | no | when `true`, suppresses usage recording |

Rendering: `CommandItemSubmit` renders an actual `<button>` (not a plain row).
When the submit row gains focus, `CommandItem` focuses the button via a ref.
Enter or Space on the button triggers `onSubmit`; Escape returns focus to the
CMDK search input.

Selecting / submitting: before execution the UI validates all inline inputs on
the current page. `CommandItem`'s submit handler calls
`collectInputFieldsFromSuggestions` + `validateFormValues`; if invalid it toasts
"Form is invalid. Check inputs." and does not execute. `CommandList` also exposes
`handleInputSubmit`, which finds the first `submit` suggestion on the page and
triggers it — this is how pressing Enter inside an `input` submits the form.
On success it sends `execute-command`; the background runs `execute(context,
values)` with all collected form values normalized
(`normalizeFormValues` joins array values with commas for legacy executors).

Recents: `shouldRecordUsage` records usage for submits unless
`doNotAddToRecents === true`.

Keybindings / favorites / deep search: same generated-action treatment as
`action` (it is one of the two executable families). Deep search flattens submit
descendants of opted-in groups just like actions.

Nesting: a submit is a leaf. It is meaningful only on a page that also contains
`input` rows whose values it consumes.

Real example — the Calculate button of the calculator group
(`background/commands/tools/calculator.ts`), shown with one of its sibling
inputs:

```typescript
{
  type: "input",
  id: "calculator-input",
  name: "Expression",
  field: { id: "calculation", label: "Expression", type: "text", placeholder: "1 + 2" },
},
{
  type: "submit",
  id: "calculator-execute",
  name: "Calculate",
  actionLabel: "Calculate",
  async execute(context, values) {
    const expression = values?.calculation || ""
    const result = stringMath(expression)
    // ...format and toast the result, optionally copy to clipboard
  },
}
```

---

## `group`

Purpose: a dynamic container that, when opened, produces a child page of command
nodes. Groups replace what would otherwise be multi-field forms or sub-menus.

Type: `GroupCommandNode` extends `CommandNodeBase` and adds:

| Field | Required | Meaning |
| --- | --- | --- |
| `children` | yes | `(context) => Promise<CommandNode[]>` resolver for child nodes |
| `enableDeepSearch` | no | opt the group's `action`/`submit` descendants into root deep search |

Groups are not in `ActionLabel` and have no `execute`. Their suggestion
`actionLabel` is hard-coded to `"Open"` in `commandsToSuggestions`.

Rendering: `CommandItemAction` with the `Group` meta label.

Selecting: opening a group does not execute anything. The UI sends
`get-children-commands`; `getChildrenCommands` (`background/messages/getChildrenCommands.ts`)
detects `type === "group"`, resolves the children for the target path via
`getCommandPageCommands`, converts them with `commandsToSuggestions`, and returns
`{ children, openPage: true, dynamicChildren: false }`. The navigation slice then
pushes a new page. (If a generated "primary"/Enter action targets a group, the
background's `executeGeneratedAction` returns early without executing — groups
are never executed.) See [palette-ui-and-navigation.md](./palette-ui-and-navigation.md)
for the page stack.

Children: a group may contain any `CommandNode` type, including nested groups,
`search`, `action`, `submit`, `input`, and `display` rows. The calculator group,
for example, returns four `input` nodes plus a `submit`; the history group
returns nested `group` time-period nodes that each resolve `action` children.

Keybindings: groups themselves are not keybindable (`allowsKeybinding` returns
`false` for non-executable nodes). They still receive a favorite-toggle action in
their action menu, and a generated "Open" primary action.

Deep search: only groups with `enableDeepSearch === true` (or nested groups that
inherit it and do not set `enableDeepSearch: false`) contribute their `action`
and `submit` descendants to root deep search — covered below.

Real example — recently closed tabs (`background/commands/browser/recentlyClosed.ts`):

```typescript
export const recentlyClosed: CommandNode = {
  type: "group",
  id: "recently-closed",
  name: "Recently Closed",
  permissions: ["sessions"],
  enableDeepSearch: true,
  children: async () => {
    const sessions = await getRecentlyClosed()
    if (!sessions || sessions.length === 0) {
      return [createNoOpCommand("no-recently-closed", "No Recently Closed Items", "...")]
    }
    // ...map sessions to `action` nodes that restore tabs/windows
  },
}
```

---

## `search`

Purpose: a dynamic, search-input-driven page. Unlike a group (whose children are
fixed once resolved for the page), a `search` node re-resolves its results from
the current search text on each keystroke.

Type: `SearchCommandNode` extends `CommandNodeBase` and `ActionLabel` and adds:

| Field | Required | Meaning |
| --- | --- | --- |
| `getResults` | yes | `(context, search) => Promise<CommandNode[]>` resolver keyed off search text |
| `execute` | no | optional executor used when the UI executes the parent directly (e.g. open a dynamic URL) |

Rendering: `CommandItemAction` (it falls through the `.otherwise` branch), with
the `Command` meta label and the resolved `actionLabel`.

Selecting: like a group, opening a search node pushes a page rather than running
`execute`. `getChildrenCommands` detects `type === "search"`, resolves results
via `getCommandPageCommands` (passing `searchValue`), and returns
`{ children, openPage: true, dynamicChildren: true }`. The `dynamicChildren: true`
flag tells the navigation layer to re-fetch children when the search value
changes. The optional `execute` runs only when the parent search command itself
is executed (its `getResults` items typically pass an `executionPayload.dynamicUrl`
that the parent's `execute` consumes).

Children: `getResults` may return any node types; in practice these are `action`
nodes. Items are produced fresh per query rather than filtered client-side.

Keybindings / favorites: search nodes are not keybindable (non-executable) but
receive favorite-toggle and a generated "primary" action like groups.

Deep search: search results are not flattened into root deep search (deep search
only walks `group` children — `collectDeepSearchEntries` skips any
non-`group` command).

Illustrative example (there is currently no static `search` command in the tree; site SDK registrations in `background/commands/siteSdk/commands.ts` are the live producer of search nodes):

```typescript
export const mySearch: SearchCommandNode = {
  type: "search",
  id: "my-search",
  name: "My Search",
  actionLabel: "Search",
  async execute(_context, values) {
    const url = (values as any)?.dynamicUrl
    if (typeof url === "string" && /^https?:\/\//i.test(url)) { /* open url */ }
  },
  async getResults(_context, search) {
    const query = (search || "").trim()
    if (!query) return []
    // returns `action` nodes derived from the query
  },
}
```

---

## `input`

Purpose: a single inline form field rendered as a list item. Each field that
would have lived in a multi-field form is its own `input` node, sharing a page
with a `submit` node.

Type: `InputCommandNode` extends `CommandNodeBase` and adds:

| Field | Required | Meaning |
| --- | --- | --- |
| `field` | yes | a `FormField` describing the control (see [command-schema.md](./command-schema.md)) |

Rendering: `CommandItem` dispatches on `field.type`:

| `field.type` | Component |
| --- | --- |
| `text` | `CommandItemInput` |
| `select` | `CommandItemSelect` |
| `checkbox` / `switch` | `CommandItemSwitch` |
| `multi` | `CommandItemMulti` |
| `color` | `CommandItemColor` |
| `text-list` | `CommandItemTextList` (handled by an early return before the main switch) |

Selecting: an input row does nothing on Enter from `handleSelect` (it returns
early for `isInlineInput`). Instead the input's own control manages keyboard
behavior: ArrowUp/ArrowDown are forwarded to the CMDK search input so list
navigation still works while a field is focused, and submitting from a text input
calls `onInputSubmit`, which `CommandList` routes to the first `submit` row on the
page (after validation). Field values are stored in navigation `formValues`, not
executed directly.

Keybindings / favorites / recents / deep search: inputs are non-executable, so
they are not keybindable, do not record usage, and are intentionally skipped by
deep search (`collectDeepSearchEntries` flattens only `action` and `submit`
descendants — input rows never flatten into root search). `commandsToSuggestions`
does not attach an action menu to input suggestions.

Nesting: inputs are leaves and only make sense alongside a sibling `submit`.

Real example — the precision selector of the calculator group
(`background/commands/tools/calculator.ts`):

```typescript
{
  type: "input",
  id: "calculator-precision",
  name: "Precision",
  field: {
    id: "precision",
    label: "Decimal Places",
    type: "select",
    options: [
      { value: "0", label: "None (integers)" },
      { value: "2", label: "2 decimal places" },
    ],
    defaultValue: "2",
    validation: { type: "string", enum: ["0", "2", "4", "6"] },
  },
}
```

---

## `display`

Purpose: a non-executable, informational row — headings, help text, empty-state
and error-state placeholders. This is the canonical way to communicate "nothing
to show" or "something failed" instead of firing an alert.

Type: `DisplayCommandNode` extends `CommandNodeBase` with no extra fields.

Rendering: `CommandItemDisplay`, showing icon, optional favorite star, name, and
an optional keybinding. Note the meta label is currently the placeholder string
`Todo`.

Selecting: nothing happens (`handleSelect` returns early for `isDisplayOnly`).

Keybindings / favorites / recents / deep search: display rows are non-executable
and are never keybindable, recorded, or flattened into deep search. No action
menu is attached.

Convention — empty/error states: child resolvers should return a single display
row produced by `createNoOpCommand` (`background/utils/commands.ts`) rather than
showing an alert. `createNoOpCommand` returns a gray `display` node:

```typescript
export function createNoOpCommand(id, name, description, icon = { type: "lucide", name: "Info" }): CommandNode {
  return { type: "display", id, name, description, icon, color: "gray" }
}
```

Both `recentlyClosed` and `browsingHistory` use it for empty and catch-block
states, e.g. `createNoOpCommand("no-recently-closed", "No Recently Closed Items",
"...")` and `createNoOpCommand("sessions-error", "Error Loading Sessions", "...",
{ type: "lucide", name: "AlertTriangle" })`.

---

## Deep search: which descendants flatten

Deep search is computed at search-index build time in
`background/commands/searchIndex.ts` (the `walkGroups` flatten); matches are
returned by the `search-commands` message. The rules, verified in code:

- Only `group` nodes are walked. A group participates when
  `enableDeepSearch === true`, or when a parent group already opted in and the
  child does not set `enableDeepSearch: false` (inheritance with explicit
  opt-out).
- Within an opted-in group, only `action` and `submit` children are flattened
  into root deep-search suggestions. `input` and `display` rows are skipped —
  do not expect form-like groups to flatten cleanly.
- Nested groups recurse, threading the resolved source rank weight
  (`DEEP_SEARCH_RANK_WEIGHTS`) down to descendants.
- Flattened child names become breadcrumb arrays (`[childName, ...reversedPath]`)
  and parent path tokens are merged into keywords for matching.
- Permission-gated groups are skipped when their permissions are not granted
  (`checkPermissions`).
- Results are deduped by suggestion id, then by `dedupeKey` (keeping the
  highest-weight source).

See [search-and-ranking.md](./search-and-ranking.md) for ranking specifics.

---

## Conventions for command authors

- **kebab-case ids.** All node ids are kebab-case and must be unique across the
  loaded command set (favorites, settings, keybindings, and dedupe all key off
  id). Dynamic ids embed a stable token, e.g. `go-to-tab-${tab.id}`,
  `history-${item.id}`, `restore-tab-${tab.sessionId}`.
- **Dynamic ids disable custom keybindings.** Nodes whose id changes between
  loads (tabs, history entries, sessions) set `allowCustomKeybinding: false`.
  A custom binding stored against a transient id would be meaningless after the
  underlying data changes. `allowsKeybinding` also refuses to bind nodes with
  `confirmAction === true`.
- **NoOp/display rows over alerts.** Use `createNoOpCommand` for empty and error
  child states so the palette renders an inline, navigable row instead of
  interrupting with a toast/alert.
- **`AsyncValue` for context-dependent fields.** Use a resolver for `name`,
  `icon`, `description`, etc. when the value depends on live state — see
  `toggleClockVisibility` in `background/commands/newTab/clock.ts`, whose `name`
  resolves to "Hide Clock" or "Show Clock" from current settings.
- **Pair `input` with `submit`.** Inputs alone do nothing; always provide a
  `submit` sibling on the page (typically the last child of a group). See the
  calculator group for the canonical layout.
- **Declare `permissions`, `supportedBrowsers`, `urlRules` on the node** rather
  than enforcing them in `execute`. The background filters and gates on these
  before the executor runs. See [permissions.md](./permissions.md) and
  [url-filtering.md](./url-filtering.md).

## Known issues / review notes

- The `display` meta label is the placeholder text `Todo` in
  `CommandItemDisplay` — cosmetic, but it ships to users.
- `commandsToSuggestions` attaches the same generated action menu (favorite,
  hide-from-domain, set/reset keybinding) to every `action`, `submit`, `group`,
  and `search` node. Some of these actions do not make sense for every command
  and should be audited per the command-system review notes.
- Deep search skipping `input`/`display` is intentional but easy to forget; keep
  it explicit in any future form-group work.

## Manual test checklist

- Open a `group` (bookmarks, downloads, history, open tabs, calculator) and
  confirm a child page opens and Escape navigates back.
- Open the calculator group, fill the `input` fields, and confirm the `submit`
  button validates and executes; confirm invalid input toasts and blocks submit.
- Open a `search` node (e.g. a site SDK search command) and confirm results re-resolve as you type.
- Trigger an empty/error child state (e.g. revoke `sessions` then open Recently
  Closed) and confirm a `display`/NoOp row appears rather than an alert.
- Execute an `action` and confirm the palette closes; execute one with
  `remainOpenOnSelect` and confirm it stays open.
- Confirm a `confirmAction` action shows "Are you sure?" on first Enter.
- Search inside a deep-search-enabled group and confirm its `action`/`submit`
  descendants appear in root deep search but `input` rows do not.

## Related docs

- [command-schema.md](./command-schema.md) — full field tables and `FormField` variants
- [authoring-commands.md](./authoring-commands.md) — adding and registering commands
- [search-and-ranking.md](./search-and-ranking.md) — search, keywords, ranking, deep search
- [execution-and-actions.md](./execution-and-actions.md) — execution flow and the action menu
- [palette-ui-and-navigation.md](./palette-ui-and-navigation.md) — page stack and inline forms
- [keybindings.md](./keybindings.md) — keybinding format and registry
- [messaging.md](./messaging.md) — `get-children-commands` and `execute-command` protocol
