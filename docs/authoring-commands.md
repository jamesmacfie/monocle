# Authoring Commands

This is a practical, end-to-end guide to adding a new command to Monocle. A command is a typed `CommandNode` defined in the background, registered in a category index, loaded by `background/commands/source.ts`, converted to a UI-facing `Suggestion` by `commandsToSuggestions` in `background/commands/index.ts`, and executed by `executeCommand`. UI code never sees your `execute` function; it only renders the suggestion and sends a message. This guide assumes you have read the schema and type references and focuses on the workflow, conventions, and pitfalls.

For the underlying contracts see [command-schema.md](./command-schema.md) (every `CommandNode`/`FormField` field), [command-types.md](./command-types.md) (the six node types in depth), [execution-and-actions.md](./execution-and-actions.md), [search-and-ranking.md](./search-and-ranking.md), [keybindings.md](./keybindings.md), [url-filtering.md](./url-filtering.md), and [permissions.md](./permissions.md).

## The five-minute version

1. Pick a category folder under `background/commands/` (browser, tools, ui, newTab, websites).
2. Create one file exporting a typed `CommandNode`.
3. Import and add it to that folder's `index.ts` array.
4. Confirm the array is actually loaded by `background/commands/source.ts` (and, for keybinding/URL management surfaces, by `background/commands/userConfigurableCommands.ts`).
5. Add a focused Vitest case, then run the manual checklist for the surfaces you touched.

## Step 1: Choose a category

Source commands live under `background/commands/`, grouped into folders. Pick the one that matches the command's nature, not just where it is convenient.

| Folder | Index export | When to use | Loaded for |
| --- | --- | --- | --- |
| `browser/` | `browserCommands` | Anything calling privileged browser APIs: tabs, windows, bookmarks, history, downloads, navigation, browsing data. | Always |
| `browser/firefox/` | `firefoxCommands` | Firefox-only browser features (containers, reader mode). | Firefox platform only |
| `tools/` | `toolCommands` | Self-contained utilities that do not depend on a specific browser API surface: calculator, UUID generator, Google search, workflow debug. | Always |
| `ui/` | `uiCommands` | Commands that change Monocle's own state or settings: theme toggle, allow/deny list management. | Always |
| `newTab/` | `newTabCommands` | Commands that only make sense on the new-tab page (clock visibility). | New-tab context only |
| `websites/` | `websiteCommands` | Contextual commands scoped to a specific site via `urlRules` (GitHub prototype). | Always (visibility gated by `urlRules`) |

Notes:

- `websites/` is currently command arrays with `urlRules`, not a first-class plugin registry. See [url-filtering.md](./url-filtering.md) before broadening it.
- There is no separate "favorites" category for authors. `clearFavoritesCommand` is a one-off added directly in `source.ts`.

## Step 2: Create the command file

Each command lives in its own file and exports a single `CommandNode` (or a small helper plus the node). Type the export with the most specific node type you can (`ActionCommandNode`, `SubmitCommandNode`, `GroupCommandNode`, `SearchCommandNode`) so TypeScript checks your `execute`/`children`/`getResults` signatures.

A minimal action command (adapted from `background/commands/tools/copyUuidV4.ts`, `copyUuidV4`):

```ts
import { v4 as uuidv4 } from "uuid"
import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyUuidV4: ActionCommandNode = {
  id: "uuidv4",
  type: "action",
  name: "Copy UUID v4",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  execute: async () => {
    const uuid = uuidv4()
    const activeTab = await getActiveTab()
    if (activeTab?.id) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-copyToClipboard",
        message: uuid,
      })
    }
  },
}
```

Privileged browser work must go through helpers in `background/utils/browser.ts` (`queryTabs`, `createTab`, `callBrowserAPI`, `sendTabMessage`, the toast helpers, etc.) rather than reaching into `chrome`/`browser` directly from the command body where a helper exists.

## Step 3: Register in the category index

Import your command into the folder's `index.ts` and add it to the exported array. Example from `background/commands/browser/index.ts` (`browserCommands`):

```ts
import { duplicateCurrentTab } from "./duplicateCurrentTab"
// ...
export const browserCommands = [
  // ...
  duplicateCurrentTab,
  // ...
]
```

`tools/index.ts`, `ui/index.ts`, `newTab/index.ts`, and `websites/index.ts` follow the same shape. Firefox-only commands go in `browser/firefox/index.ts` (`firefoxCommands`), which `browser/index.ts` re-exports.

## Step 4: Verify the category is actually loaded

Registering in the index is not enough on its own; the array must be pulled into the two loaders.

`background/commands/source.ts`, `loadAllCommands`, builds the live command set:

```ts
const commands: CommandNode[] = [
  ...browserCommands,
  ...toolCommands,
  ...uiCommands,
  ...websiteCommands,
  clearFavoritesCommand,
]
if (context?.isNewTab) commands.push(...newTabCommands)
if (platform === "firefox") commands.push(...firefoxCommands)
return commands.filter((command) => supportsPlatform(command, platform))
```

Key facts:

- All five base categories (browser, tools, ui, websites) plus the firefox set are wired in. If you add a brand-new folder, you must add its spread here too.
- `newTabCommands` are only loaded when `context.isNewTab` is true.
- `firefoxCommands` are only loaded on the Firefox platform, and the final `supportsPlatform` filter additionally drops any command whose `supportedBrowsers` excludes the active platform.

### The `allCommands` context-free trap

`source.ts` also exports `allCommands = loadAllCommands()` — built with **no context and no platform options**. Because there is no context, `isNewTab` is false, so `allCommands` never contains new-tab commands, and it reflects the build-host platform.

Global, context-free surfaces should therefore not rely on `allCommands` to see every command. The keybinding/URL-rule management surfaces instead use `background/commands/userConfigurableCommands.ts`, `loadUserConfigurableCommands`, which deliberately includes `...newTabCommands` (and `toggleTheme` from the UI set, plus website commands) and de-duplicates by id:

```ts
const commands: CommandNode[] = [
  ...browserCommands,
  ...toolCommands,
  toggleTheme,
  ...websiteCommands,
  ...newTabCommands,
  clearFavoritesCommand,
]
if (platform === "firefox") commands.push(...firefoxCommands)
return uniqueById(commands.filter((c) => supportsPlatform(c, platform)))
```

If you add a new-tab-only command and want it to be configurable from a global management surface (custom keybinding, allow/deny lists), confirm it flows through `loadUserConfigurableCommands`. `manageAllowList`/`manageDenyList` are covered by tests asserting both `github-*` and `new-tab-clock-*` groups appear (see `background/commands/command-system.test.ts`, "includes website and new-tab command sources in URL-rule management").

## Conventions

Follow the [command-schema.md](./command-schema.md) field rules. The conventions that matter most when authoring:

- **Discriminated `type`.** Always set `type` to one of `action`, `submit`, `group`, `search`, `input`, `display`. Code branches on it everywhere.
- **kebab-case ids.** `duplicate-current-tab`, `open-new-tab`. Ids must be globally unique; `uniqueById` in `userConfigurableCommands.ts` silently drops later duplicates, so a clash hides a command. Generated action ids derive from the command id (`<id>-enter-action`, `toggle-favorite-<id>`, etc.), so collisions corrupt the action menu too.
- **`AsyncValue` for context-dependent display.** `name`, `description`, `icon`, `color`, `keywords`, and `executionPayload` are resolved through `resolveAsyncProperty(value, context)` in `commandsToSuggestions`. They can be a literal, a function of context, or a promise. Use this for site- or tab-aware labels (the GitHub group's `name` is an async function returning a `"GitHub: acme/widgets"` style label from the current URL).
- **Empty/error states use display rows, not alerts.** Return a `display` node from a `group.children`/`search.getResults` instead of throwing or firing a toast. Use the `createNoOpCommand(id, name, description, icon?)` helper in `background/utils/commands.ts`, which returns a gray `display` node. `bookmarks` and `history` both do this for empty results.
- **Dynamic ids sparingly, with custom keybindings disabled.** When a command id encodes volatile data (a specific tab, a search result), set `allowCustomKeybinding: false` so users can't bind a shortcut to an id that won't exist next time. `googleSearch`'s generated result actions do exactly this.
- **`actionLabel` on executables.** Action/submit/search/group rows surface a primary label; set `actionLabel` (groups default to "Open"). Add `modifierActionLabel` to advertise modifier-key behavior (see [execution-and-actions.md](./execution-and-actions.md)).

## Permissions

Declare required browser permissions with the `permissions` array. Example from `background/commands/browser/history.ts` (`browsingHistory`): `permissions: ["history"]`; `bookmarks` uses `permissions: ["bookmarks"]`.

What happens automatically:

- `commandsToSuggestions` computes `effectivePermissions = mergePermissions(inheritedPermissions, node.permissions)` and attaches them to the suggestion, so child commands inherit a parent group's permissions. The UI surfaces a grant affordance when a declared permission is missing — you do not write grant UI per command.
- At execution time, `executeResolvedCommand` calls `checkPermissions(permissions)` before running `execute`. If anything is missing it shows a "Missing permissions" toast and returns without executing. Declaring `permissions` is therefore both the UI hint and the runtime guard.

See [permissions.md](./permissions.md) for the optional-permission request flow and Chrome-vs-Firefox differences.

## Platform scoping (`supportedBrowsers`)

For browser-specific commands, set `supportedBrowsers` to the platforms that support them. `supportsPlatform` (in `background/commands/platform.ts`) treats a missing `supportedBrowsers` as "all platforms"; otherwise the command is kept only if the active platform is listed.

Two patterns exist and both are valid:

- **Firefox folder pattern (preferred for Firefox-only).** Put the file in `browser/firefox/`, add it to `firefoxCommands`, and it is only spread in on Firefox. You may still set `supportedBrowsers: ["firefox"]` as belt-and-suspenders; `toggleReaderMode` does (`background/commands/browser/firefox/toggleReaderMode.ts`).
- **`supportedBrowsers` field in a shared file.** Keep the command in a normal folder and rely on the field to filter. Use this when a command is "Chrome only" but conceptually belongs with the rest of its category.

## URL scoping (`urlRules`)

To make a command contextual to certain pages, declare `urlRules` with `allowUrls`/`denyUrls` glob patterns. Root and child commands are filtered by the current page URL before they reach the UI, and execution of a URL-denied command is blocked (tests assert both filtering and direct/keybinding execution refusal). Website commands such as the GitHub prototype are simply command arrays carrying `urlRules`. See [url-filtering.md](./url-filtering.md) for matching semantics, the user-managed allow/deny lists, and the generated "Hide from <domain>" action.

## Default keybindings and the high-risk policy

Assign a default keybinding to an action/submit command with the canonical angle-bracket format, e.g. `keybinding: "<cmd-t>"` (`openNewTab`). See [keybindings.md](./keybindings.md) for the full format, sequences, and capture details.

The **high-risk policy is enforced in code**, not by convention: `allowsKeybinding` in `background/utils/commands.ts` returns false when `confirmAction === true` (or `allowCustomKeybinding === false`, or the node is not executable). Consequences, verified by `background/commands/browser-commands.test.ts` ("high-risk browser commands"):

- A command with `confirmAction: true` (e.g. `closeCurrentTab`, which also declares `keybinding: "<cmd-w>"`) is **not registered in the keybinding registry**, and a user-set custom keybinding for it is ignored.
- Its suggestion has no `keybinding` and no "Set Custom Keybinding" action in the action menu.

So a destructive command may still declare a `keybinding` for documentation/intent, but if it sets `confirmAction: true` that binding will not fire. Decide deliberately: confirmation-gated or keybindable, not both.

## Form-style commands (group + input + submit)

There is no single "form" node type. A form is a `group` whose `children` return one or more `input` rows plus a terminal `submit`. Field values entered into the `input` rows are kept in navigation state (Redux) and handed to the `submit` command's `execute` as its second argument.

Adapted from `background/commands/tools/calculator.ts` (`calculator`):

```ts
export const calculator: CommandNode = {
  type: "group",
  id: "calculator",
  name: "Calculator",
  icon: { type: "lucide", name: "Calculator" },
  color: "teal",
  async children() {
    return [
      {
        type: "input",
        id: "calculator-input",
        name: "Expression",
        field: {
          id: "calculation",            // <-- key in the values object
          label: "Expression",
          type: "text",
          placeholder: "1 + 2",
          validation: { type: "string", pattern: "[0-9+\\-*/\\s()^%|]+" },
        },
      },
      {
        type: "submit",
        id: "calculator-execute",
        name: "Calculate",
        actionLabel: "Calculate",
        async execute(context, values) {
          const expression = values?.calculation || ""
          // ...compute and toast the result
        },
      },
    ]
  },
}
```

How values reach the executor:

- Each `input` row's `field.id` becomes a key in the `values` object the `submit.execute` receives. `calculation`, `precision`, `theme`, `copy` in the example.
- Before reaching `execute`, the background runs `normalizeFormValues` (in `background/commands/index.ts`): every value is coerced to a string, and array-valued fields (`multi`) are joined with commas. Executors therefore always read strings — `values?.copy === "true"`, `parseInt(values?.precision || "2", 10)`, etc. Field validation `enum`/`pattern` describe the string forms.
- `submit` commands are recorded in recents unless you set `doNotAddToRecents: true` (see `shouldRecordUsage`).

Field variants (`text`, `select`, `multi`, `switch`, `color`, etc.) are documented in [command-schema.md](./command-schema.md). Deep search does **not** flatten `input`/`display` rows, so a form group's fields never leak into root search — only its `action`/`submit` descendants do, and only if the group opts into `enableDeepSearch`.

## Search commands (`getResults`)

A `search` node renders a dedicated page whose results are produced dynamically from the current query. Provide `getResults(context, search)` returning `CommandNode[]`, and optionally an `execute` for when the search row itself is actioned.

Sketch from `background/commands/tools/googleSearch.ts` (`googleSearch`):

```ts
export const googleSearch: SearchCommandNode = {
  type: "search",
  id: "google-search",
  name: "Google Search",
  icon: { type: "lucide", name: "Search" },
  color: "teal",
  actionLabel: "Search",
  async getResults(_context, search) {
    const query = (search || "").trim()
    if (!query) return []
    const nodes: CommandNode[] = []
    nodes.push(createSearchQueryAction(`google-search-q-${safe(query)}`, query))
    // ...append remote autosuggest result actions
    return nodes
  },
  async execute(_context, values) {
    // optional: handle the search row being executed directly
  },
}
```

Conventions for search results: build per-result `action` nodes with stable-but-derived ids (sanitize the query into the id), set `allowCustomKeybinding: false` because those ids are ephemeral, and return `[]` (not an error) for an empty query. Note that `getResults` is invoked with the page's current `searchValue` — generated actions on search results execute via an `executionScope` carrying `pageId`/`parentPath`/`searchValue` (see [execution-and-actions.md](./execution-and-actions.md)).

## New-tab-only commands

Put commands that only make sense on the new-tab page in `newTab/` and add them to `newTabCommands` (`background/commands/newTab/index.ts`, currently just `clockCommand`). They are loaded only when `context.isNewTab` is true. Keybindings for new-tab commands fire only in new-tab context — `command-system.test.ts` ("executes new-tab-only command keybindings only with new-tab context") confirms a clock keybinding succeeds with new-tab context and fails with normal context. Remember the `allCommands` trap: ensure global management visibility via `loadUserConfigurableCommands`, which already includes `newTabCommands`. See [new-tab-and-theme.md](./new-tab-and-theme.md).

## Platform-conditional logic

Two helpers in `background/commands/platform.ts` drive platform behavior:

- `getPlatform(options?)` resolves to `options.platform ?? (isFirefox ? "firefox" : "chrome")`. Tests pass an explicit `platform` to exercise both.
- `supportsPlatform(command, platform)` is the per-command filter described above.

If a command needs runtime platform branching inside `execute`, import `isFirefox` from `shared/utils/browser` or use Firefox-specific utilities in `background/utils/firefox.ts` (as `toggleReaderMode` does). Prefer the folder/`supportedBrowsers` split for whole-command differences and reserve in-body branching for small forks.

## Testing

Add a focused Vitest case alongside the existing suites in `background/commands/*.test.ts`. Patterns to copy:

- **Loading/context/platform**: `command-system.test.ts` ("loads commands by page context and platform") asserts a command id is present/absent across normal, new-tab, GitHub, and Firefox loads. Use `getCommands(context)` and `loadAllCommands(context, { platform })`.
- **Execution and usage**: call `executeCommand(id, context, values)` and assert side effects via stubbed `chrome` APIs (`installChromeStubs`) and `getCommandUsageStats(id)`.
- **Form submit**: resolve the group's `children`, find the `submit`, and call `submit.execute(context, values)` directly (the URL-rule management tests do this).
- **Generated actions**: assert `commandsToSuggestions([node], context)` attaches `<id>-enter-action`, `toggle-favorite-<id>`, `hide-from-domain-<id>`.
- **High-risk policy**: if your command sets `confirmAction`, assert no registry binding and no "Set Custom Keybinding" action (mirror `browser-commands.test.ts`).

Tests use `fakeBrowser` from `wxt/testing` plus a hand-rolled `chrome` stub; reset settings with `clearAllSettings()` in `beforeEach`. Run `pnpm test`, `pnpm run tsc`, and `pnpm run fmt:check`.

### Manual checks still required

Automated coverage is narrow. After adding a command, manually verify the surfaces you touched (carried forward from the command-system baseline):

- Load with `pnpm run dev`, open the palette (`Cmd+Shift+K`), confirm the command renders and is searchable.
- If it is a group/form/search, open it, enter values/queries, submit, and confirm Escape navigates back and search state restores.
- If it declares `permissions`, test the missing, denied, and already-granted states (grant prompt appears; execution blocks when missing).
- If it declares `urlRules`, test allow, deny, wildcard, root filtering, and child filtering on real pages.
- If it has a keybinding, test capture, display, conflict detection, and execution; for `confirmAction` commands confirm no binding fires.
- If it is new-tab-only, test in both content overlay (should be absent) and the new-tab page.
- Test `remainOpenOnSelect` if set, and confirm `doNotAddToRecents` behavior for submits.

## Common pitfalls

- Adding to the index but not confirming `source.ts`/`userConfigurableCommands.ts` actually spread the array.
- Duplicate ids silently dropped by `uniqueById`.
- Expecting `allCommands` to include new-tab commands (it cannot).
- Setting both `confirmAction: true` and relying on `keybinding` to fire — it won't.
- Throwing/alerting from `children`/`getResults` instead of returning a `display`/NoOp row.
- Assuming `input`/`display` rows participate in deep search — they don't.
- Reading `values` as non-strings in a submit executor — they are normalized to strings (arrays comma-joined).

## Related docs

- [command-schema.md](./command-schema.md) — field-by-field schema and `FormField` variants.
- [command-types.md](./command-types.md) — the six node types in depth.
- [execution-and-actions.md](./execution-and-actions.md) — execution flow, modifier-enter, action menus, generated actions.
- [search-and-ranking.md](./search-and-ranking.md) — search, keywords, usage ranking, favorites, deep search.
- [keybindings.md](./keybindings.md) — canonical key format, capture, sequences, registry, conflicts.
- [url-filtering.md](./url-filtering.md) — `urlRules` allow/deny lists and management commands.
- [permissions.md](./permissions.md) — required vs optional permissions and grant flows.
- [new-tab-and-theme.md](./new-tab-and-theme.md) — new-tab mode specifics.
- Command catalogs: [browser](./commands/browser.md), [tools](./commands/tools.md), [ui](./commands/ui.md), [new-tab](./commands/new-tab.md), [websites](./commands/websites.md).
