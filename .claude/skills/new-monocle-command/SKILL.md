---
name: new-monocle-command
description: Add a new command to the Monocle browser extension's command palette. Use when asked to "add a command", "create a new command", "make a palette action/group/form", or to wire up a new tab/window/bookmark/site/tool action in Monocle. Covers the CommandNode authoring workflow — file, registration, conventions, tests.
metadata:
  version: "1.0.0"
---

# Add a New Monocle Command

A Monocle command is a typed `CommandNode` defined in the background, registered in a category index, loaded by `background/commands/source.ts`, turned into a UI `Suggestion` by `commandsToSuggestions` (`background/commands/index.ts`), and run by `executeCommand`. The UI never sees your `execute` function — it renders the suggestion and posts a message. Get the data shape and registration right and everything else follows.

**The in-repo docs are the source of truth — read them before non-trivial work:**
- `docs/authoring-commands.md` — the end-to-end authoring guide (the basis for this skill).
- `docs/command-schema.md` — every `CommandNode` / `FormField` field.
- `docs/command-types.md` — the six node types in depth.
- `docs/execution-and-actions.md`, `docs/search-and-ranking.md`, `docs/keybindings.md`, `docs/permissions.md`, `docs/url-filtering.md`.
- Catalogs of what already exists: `docs/commands/{browser,tools,ui,new-tab,websites}.md`.

## When to use this skill

Use it whenever the task is "make the palette do a new thing": a one-shot action, a dynamic group of children, a site-scoped action, a form, or a search surface. If you're changing how *existing* commands rank, render, or execute, this is the wrong skill — go to the relevant doc above instead.

## The workflow (five steps)

1. **Pick a category folder** under `background/commands/` (table below). Choose by the command's *nature*, not convenience.
2. **Create one file** exporting a single, specifically-typed `CommandNode`.
3. **Register it** in that folder's `index.ts` array.
4. **Confirm it's actually loaded** — the array must be spread into `background/commands/source.ts` (`loadAllCommands`), and, for keybinding/allow-deny management visibility, into `background/commands/userConfigurableCommands.ts`.
5. **Add a focused Vitest case**, then run `pnpm run tsc`, `pnpm test`, `pnpm run fmt:check`, and the manual checks for the surfaces you touched.

## Step 1 — choose a category

| Folder | Index export | Use for | Loaded |
| --- | --- | --- | --- |
| `browser/` | `browserCommands` | Privileged browser APIs: tabs, windows, bookmarks, history, downloads, navigation, browsing data | Always |
| `browser/firefox/` | `firefoxCommands` | Firefox-only features (containers, reader mode) | Firefox only |
| `tools/` | `toolCommands` | Self-contained utilities (calculator, UUID, workflow debug) | Always |
| `ui/` | `uiCommands` | Changes Monocle's own state/settings (theme, allow/deny lists) | Always |
| `newTab/` | `newTabCommands` | Only meaningful on the new-tab page (clock) | New-tab context only |
| `websites/` | `websiteCommands` | Site-scoped via `urlRules` (GitHub prototype) | Always (gated by `urlRules`) |

## Step 2 — write the file

One file, one exported `CommandNode`, typed with the most specific node type (`ActionCommandNode`, `GroupCommandNode`, `SubmitCommandNode`, `SearchCommandNode`) so TypeScript checks your `execute` / `children` / `getResults` signatures.

Minimal action command (modeled on `background/commands/tools/copyUuidV4.ts`):

```ts
import { v4 as uuidv4 } from "uuid"
import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyUuidV4: ActionCommandNode = {
  id: "uuidv4",                          // kebab-case, globally unique
  type: "action",                        // required discriminant
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
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "UUID copied to clipboard",
      })
    }
  },
}
```

**All privileged browser work goes through `background/utils/browser.ts`** (`queryTabs`, `createTab`, `removeTab`, `callBrowserAPI`, `sendTabMessage`, toast helpers) — never reach into `chrome`/`browser` directly where a helper exists. Clipboard and user-facing feedback are owned by the content script: send `monocle-copyToClipboard` / `monocle-toast` messages, don't call `navigator.clipboard` from the command body.

### Choosing the node type

| `type` | Use for | Key field |
| --- | --- | --- |
| `action` | One-shot executable | `execute(context, values)` |
| `group` | Dynamic list of children | `children(context) => Promise<CommandNode[]>` |
| `search` | Query-driven results page | `getResults(context, search)` |
| `submit` | Terminal button of a form | `execute(context, values)` |
| `input` | A single form field | `field: FormField` |
| `display` | Read-only / empty / error row | — (use `createNoOpCommand`) |

A **form** is not a node type — it's a `group` whose `children` return `input` rows plus a terminal `submit`. Each `input` field's `field.id` becomes a key in the `values` object the submit's `execute` receives. Values are normalized to **strings** (arrays comma-joined) before `execute` — read `values?.precision`, `values?.copy === "true"`, etc. See `background/commands/tools/calculator.ts`.

## Step 3 & 4 — register and confirm it loads

Add the import + array entry in the folder's `index.ts`:

```ts
import { copyUuidV4 } from "./copyUuidV4"
export const toolCommands = [calculator, copyUuidV4, debugWorkflow]
```

Then confirm the array is spread into `loadAllCommands` in `background/commands/source.ts`. The existing five categories (+ firefox) are already wired; **a brand-new folder needs its own spread added here**. New-tab commands only load when `context.isNewTab` is true; firefox commands only on Firefox (plus a final `supportsPlatform` filter).

**The `allCommands` trap:** `source.ts` exports `allCommands = loadAllCommands()` built with no context/platform, so it never contains new-tab commands. Global management surfaces (custom keybindings, allow/deny lists) read `loadUserConfigurableCommands` (`userConfigurableCommands.ts`) instead, which dedupes by id and explicitly includes `newTabCommands`, `toggleTheme`, and `websiteCommands`. If your command must be configurable from those surfaces, confirm it flows through there.

## Critical conventions

- **kebab-case, globally unique ids.** `uniqueById` silently drops later duplicates, so a clash hides a command. Generated action ids derive from the command id (`<id>-enter-action`, `toggle-favorite-<id>`), so collisions corrupt the action menu too.
- **Registered icon names only.** Lucide `name` is the closed `IconName` set in `shared/types/icons.ts`. A new icon must be added to `ICON_NAMES` there *and* `ICON_MAP` in `shared/components/iconRegistry.ts`, or `tsc` fails.
- **`AsyncValue` for context-dependent display.** `name`, `description`, `icon`, `color`, `keywords`, `executionPayload` may be a literal, a function of `context`, or a promise — resolved at suggestion time. Use it for tab/site-aware labels (see `ui/theme.ts`, the GitHub group).
- **Empty/error states return a `display` row, never throw or toast.** Use `createNoOpCommand(id, name, description, icon?)` from `background/utils/commands.ts` inside `children` / `getResults`. See `bookmarks` and `history`.
- **`confirmAction` vs keybinding is mutually exclusive in code.** `allowsKeybinding` returns false when `confirmAction === true` (or `allowCustomKeybinding === false`). A destructive command may declare a `keybinding` for intent, but it will not fire — pick one, deliberately.
- **Dynamic ids → `allowCustomKeybinding: false`.** When an id encodes a specific tab/result that won't exist next time, disable custom keybinding (see `gotoTab` children, search results).
- **Permissions are both hint and guard.** Declare `permissions: ["tabs"]` etc.; the UI shows a grant affordance and `executeResolvedCommand` re-checks at run time. Children inherit a parent group's permissions.
- **Platform scoping.** Whole-command Firefox/Chrome differences → folder split or `supportedBrowsers`. Reserve in-`execute` `isFirefox` branching for small forks.
- **Keybindings** use canonical angle-bracket format: `<cmd-t>`, `<cmd-shift-k>`, `<alt-left>`, multi-stroke `<cmd-k>, <cmd-s>`. `<cmd-…>` maps to Ctrl on Windows/Linux. See `docs/keybindings.md`.

## Step 5 — test and verify

Add a focused case to `background/commands/*.test.ts`. Patterns to copy (`command-system.test.ts`, `browser-commands.test.ts`):
- **Loading/context/platform:** `loadAllCommands(context, { platform })` / `getCommands(context)` — assert presence/absence across normal, new-tab, GitHub, Firefox.
- **Execution & usage:** `executeCommand(id, context, values)`, assert side effects via the `chrome` stub and `getCommandUsageStats(id)`.
- **Form submit:** resolve the group's `children`, find the `submit`, call `submit.execute(context, values)` directly.
- **Generated actions:** `commandsToSuggestions([node], context)` attaches `<id>-enter-action`, `toggle-favorite-<id>`, `hide-from-domain-<id>`.
- **High-risk policy:** if you set `confirmAction`, assert no registry binding and no "Set Custom Keybinding" action.

Tests use `fakeBrowser` from `wxt/testing` + a hand-rolled `chrome` stub; reset with `clearAllSettings()` in `beforeEach`. Then run:

```bash
pnpm run tsc && pnpm test && pnpm run fmt:check
```

Automated coverage is narrow — also load `pnpm run dev`, open the palette (`Cmd+Shift+K`), and confirm the command renders, is searchable, and (for groups/forms/search) navigates, submits, and restores state. Test permission, `urlRules`, keybinding, and new-tab states for whichever your command declares.

## Common pitfalls

- Registering in `index.ts` but not confirming `source.ts` / `userConfigurableCommands.ts` spread the array.
- Duplicate ids silently dropped by `uniqueById`.
- Expecting `allCommands` to include new-tab commands (it can't).
- Setting `confirmAction: true` and relying on `keybinding` to fire — it won't.
- Throwing / toasting from `children` / `getResults` instead of returning a `display` / NoOp row.
- Reading `values` as non-strings in a submit executor — they're normalized to strings (arrays comma-joined).
- Using an unregistered Lucide icon name — `tsc` fails until it's in `ICON_NAMES` + `ICON_MAP`.
