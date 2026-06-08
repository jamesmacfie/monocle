# Command Execution and Actions

This document describes what happens when a user acts on a command in the Monocle palette: how the UI builds an `execute-command` request, how the background resolves and runs the command, how plain Enter differs from modifier-Enter, how the action menu and its generated actions work, and how side effects (clipboard, new tab, toasts) flow back to the page. Execution is always background-owned: the UI sends typed messages with a command id, context, modifier, and form values; the background resolves a `CommandNode`, checks permissions, runs the executor, and records usage. The UI never holds executable functions.

## End-to-end execute-command flow

1. **User acts on a focused row.** Pressing Enter (or clicking the footer primary button) calls `selectCommand(id)` from `shared/hooks/useCommandNavigation.tsx`. Input and display rows are non-executable and return early; group and search rows navigate to children; `setKeybinding` actions start the capture flow instead of executing.
2. **The UI builds an execution request.** For a leaf (`action`/`submit`, including generated actions, which are themselves `action`-typed rows), `buildCommandExecutionRequest` in `shared/hooks/commandExecution.ts` produces:
   - `id`: the suggestion id (which may be a generated action id such as `toggle-favorite-<id>`).
   - `formValues`: the current page's `formValues` shallow-merged with the suggestion's `executionPayload` (payload wins on key collisions).
   - `shouldNavigateBack`: `true` for `action`/`submit` unless `remainOpenOnSelect` is set; `true` for any other type the function is called with.
   - `parentNames`: breadcrumb names used for usage attribution (see `extractParentNames`).
   - `executionScope`: a `CommandExecutionScope` (`pageId`, `parentPath`, `searchValue`) for non-root pages, else `undefined`.
3. **The UI sends `execute-command`.** The palette's `executeCommand` prop forwards these fields to the background `execute-command` message. See [messaging.md](messaging.md) for the message envelope and [palette-ui-and-navigation.md](palette-ui-and-navigation.md) for how the navigation hook wraps it.
4. **Background message handler.** `background/messages/executeCommand.ts` (`handleExecuteCommand`) calls `executeCommand(id, context, formValues ?? {}, parentNames, executionScope)` from `background/commands/index.ts`.
5. **Background resolution.** `executeCommand` normalizes the context, then:
   - If the id parses as a generated action (`parseGeneratedCommandAction`), it routes to `executeGeneratedAction` (see [Generated actions](#generated-actions)).
   - Otherwise it resolves the command with `resolveCommandInPage(id, ctx, executionScope)` when a scope is present, or `resolveCommandById(id, ctx)` for root commands. A missing command throws `Command not found: <id>`.
6. **Permission check.** `executeResolvedCommand` requires the resolved node to be `action`, `submit`, or `search` (otherwise it throws `Command <id> is not executable`). If the command declares permissions, `checkPermissions` runs; on a miss it calls `showMissingPermissionsToast` and returns without executing. See [permissions.md](permissions.md).
7. **Executor runs.** `command.execute?.(context, normalizeFormValues(formValues))` is awaited. `normalizeFormValues` flattens values to strings — array values are joined with `,`, and `null`/`undefined` become `""` — for backward compatibility with older executors.
8. **Usage recording.** If `shouldRecordUsage(command)` is true, `recordCommandUsage(command.id, parentNames ?? resolved.parentNames)` is awaited (see [Usage recording](#usage-recording)).
9. **Response.** The handler returns `{ success: true }`. Side effects (toasts, clipboard, navigation) are emitted by the executor as tab messages, not via this return value.
10. **Post-execution UI refresh.** `shouldRefreshCommandsAfterExecution(shouldNavigateBack)` returns `true` only when the command stays open (`shouldNavigateBack === false`), prompting the palette to re-fetch the current page so mutated state (favorites, settings) is reflected.

### Message payload fields

| Field | Source | Purpose |
| --- | --- | --- |
| `id` | focused suggestion id | Resolved to a `CommandNode` or parsed as a generated action |
| `context` | `Browser.Context` from the palette | Tab/url/new-tab flags; carries `modifierKey` for modifier execution |
| `formValues` | page form values + `executionPayload` | Inline form inputs and per-suggestion payload |
| `parentNames` | breadcrumb names | Usage attribution for nested commands |
| `executionScope` | non-root `Page` identity | Lets the background re-resolve dynamic/scoped children |

## Plain Enter vs modifier-Enter

Modifier *execution* (running a command with `context.modifierKey` set, e.g. "open in new tab on Cmd") is delivered through generated modifier actions selected from the action menu — see below. It is distinct from the **Cmd/Ctrl+Enter "execute and close" shortcut**, which `CommandContent` (in `shared/components/Command/CommandPalette.tsx`) intercepts directly: when a focused `action`/`submit` row is Cmd/Ctrl+Entered (and the action menu is closed), it `selectCommand(id, { forceClose: true })`, which forces `shouldNavigateBack` true in `buildCommandExecutionRequest` so the command runs and the palette closes even if it declares `remainOpenOnSelect`. It runs the base command and does **not** set `modifierKey`. The handler `stopPropagation`s so cmdk's own Enter does not also fire. The generated-modifier-action mechanism below has three parts.

### Modifier tracking and the footer label

`shared/hooks/useIsModifierKeyPressed.tsx` listens to `window` `keydown`/`keyup` and tracks a single active `ModifierKey` (`"shift" | "cmd" | "alt" | "ctrl" | null`), checked in that priority order. `shared/hooks/useActionLabel.tsx` consumes it to compute the footer primary-button label for the focused suggestion:

- `input`/`display` rows resolve to an empty label (no primary button).
- With no modifier held, the label is the suggestion's `actionLabel` (or the `defaultLabel`, `"Run"`).
- With a modifier held, if the focused `action`/`submit` suggestion has a matching entry in `modifierActionLabel[modifier]`, that label is shown; otherwise it falls back to `defaultLabel`.

`shared/components/Command/CommandFooter.tsx` renders the primary button using this label (groups always show `"Open"`), so the footer text changes live as the user holds a modifier.

### How the modifier reaches the executor

A focused row's label changing does **not** by itself change what plain Enter does — pressing Enter calls `selectCommand` for the base command id with no `modifierKey` set. Modifier execution is performed by selecting a **generated modifier action** from the action menu. For every modifier that has a `modifierActionLabel` entry, `commandsToSuggestions` (in `background/commands/index.ts`) emits an action with id `<commandId>-<modifier>-enter-action`, a display keybinding of `<cmd-enter>` / `<shift-enter>` / etc., and `executionContext: { type: "modifier", targetCommandId, modifierKey }`. When that action id is executed, `executeGeneratedAction` re-runs the target command with `{ ...context, modifierKey }`, so the executor sees `context.modifierKey === "cmd"` (etc.).

Example — history items open in the current tab on Enter, in a new tab on Cmd (`background/commands/browser/history.ts`):

```ts
{
  type: "action",
  actionLabel: "Open",
  modifierActionLabel: { cmd: "Open in New Tab" },
  execute: async (context) => {
    if (context?.modifierKey === "cmd") {
      // open in a new tab
    } else {
      // navigate the current tab
    }
  },
}
```

Some commands instead split behavior into separate child actions keyed by literal `keybinding` strings (e.g. `copyCurrentTabUrl` has children bound to `enter`, `<cmd-enter>`, `<cmd-shift-enter>`). Those are ordinary commands distinguished by their declared keybindings rather than `modifierActionLabel`.

## actionLabel resolution

`actionLabel` and `modifierActionLabel` are declared on the `CommandNode` as `AsyncValue<string>` (`shared/types/commands.ts`) — either a literal or a `(context) => Promise<string>`. They are resolved once in the background during suggestion conversion via `resolveActionLabel` and `resolveModifierActionLabels`, so the UI always receives plain strings. `groups` are forced to `"Open"`; `input`/`display` suggestions carry no `actionLabel`. The UI-side `useActionLabel` only chooses between already-resolved strings based on the live modifier; it does not run async resolution at render time.

## The action menu

The action menu is the secondary "Actions" surface (footer button labelled `Actions` + `Alt`, or the `open-actions` keyboard command). It lists a command's actions including generated ones.

### Eligibility and contents

`shared/components/Command/actionMenu.ts`:

- `getSuggestionActions(suggestion)` returns `suggestion.actions ?? []` only for `action`, `submit`, `search`, and `group` types (empty for `input`/`display`).
- `canOpenActionMenu(suggestion)` is `true` when there is at least one action. The footer renders the Actions button only when this is true.
- `getPrimaryNavigationActionTarget(source, action)` returns the `targetCommandId` when the source is a `group`/`search` and the action is a `primary` generated action — these "Open" actions navigate into children rather than executing.

### Action ordering

`commandsToSuggestions` pushes generated actions onto `actions` in a fixed order:

1. **Primary** (`<id>-enter-action`) — for `group`/`search`/`action`/`submit`. Label is `"Open"` for groups (icon `FolderOpen`) or the resolved action label otherwise (icon `Play`); display keybinding `enter`.
2. **Modifier** actions (`<id>-<modifier>-enter-action`) — only for `action`/`submit` that declare `modifierActionLabel`, iterated in fixed order `cmd`, `shift`, `alt`, `ctrl`; each gets a `<modifier-enter>` display keybinding.
3. **Favorite toggle** (`toggle-favorite-<id>`) — always added.
4. **Hide from domain** (`hide-from-domain-<id>`) — only when there is a real page URL (not new tab).
5. **Set custom keybinding** (`set-keybinding-<id>`) — only when `allowsKeybinding(command)`.
6. **Reset custom keybinding** (`reset-keybinding-<id>`) — only when a custom keybinding setting exists (and the command is not a group / does not opt out via `allowCustomKeybinding === false`).

### Rendering and interaction

`shared/components/Command/CommandActions.tsx` renders a CMDK sub-list with its own search input (`"Search for actions..."`). It closes on Escape, on outside pointer-down, or after an action is selected (then refocuses the main input). If the parent command has missing permissions, it renders `PermissionActions` instead of the action list.

`shared/components/Command/CommandActionsList.tsx` renders each action as an `ActionItem`, showing the action name and, when present, a `KeybindingDisplay` for `action.keybinding`. `ActionItem` handles three special cases:

- **setKeybinding**: selecting it dispatches `startCapture` and swaps the row for an inline `KeybindingCapture` (sequence capture with live conflict checking via `check-keybinding-conflict`). On save it sends `update-command-setting` with `setting: "keybinding"`, completes capture, refreshes, and force-closes the menu. See [keybindings.md](keybindings.md).
- **resetKeybinding**: skips confirmation and selects immediately.
- **confirmAction**: see below.

When an action is selected, `CommandPalette.handleActionSelect` checks `getPrimaryNavigationActionTarget` first (navigate instead of execute for group/search primary actions). Otherwise it calls the shared `executeCommand` with `navigateBack: false` and the current page's execution scope, then refreshes. For `favorite`, `resetKeybinding`, and `hideDomain` execution types it also refreshes the current child page so visibility/state updates immediately; for `setKeybinding` it keeps the menu open.

## Generated actions

Generated actions are synthetic `Suggestion`s whose ids encode a target command and an operation. The background parses them with `parseGeneratedCommandAction` (`background/commands/generatedActions.ts`) and dispatches via `executeGeneratedAction` (`background/commands/index.ts`).

| Type | Id pattern | When created | Effect on execution |
| --- | --- | --- | --- |
| `primary` | `<id>-enter-action` | action/submit/search/group | For groups, no-op (UI navigates instead); otherwise re-runs the target command normally |
| `modifier` | `<id>-<cmd\|shift\|alt\|ctrl>-enter-action` | action/submit with `modifierActionLabel[key]` | Re-runs the target with `context.modifierKey = key` |
| `favorite` | `toggle-favorite-<id>` | always | `toggleFavoriteCommandId(targetId)` |
| `setKeybinding` | `set-keybinding-<id>` | when `allowsKeybinding` | Handled in the UI (capture flow); background only warns if it ever reaches it |
| `resetKeybinding` | `reset-keybinding-<id>` | when a custom keybinding setting exists | `removeCommandSetting(targetId, "keybinding")` + `refreshKeybindingRegistry()` |
| `hideDomain` | `hide-from-domain-<id>` | when a real page URL exists | Adds a deny-URL rule for the current domain via `updateCommandUrlRules` (see [url-filtering.md](url-filtering.md)) |

`parseGeneratedCommandAction` matches the prefix table first, then the `-(cmd\|shift\|alt\|ctrl)-enter-action` modifier regex, then the bare `-enter-action` suffix. The `modifier`/`primary` regex ordering matters: a modifier suffix is checked before the generic `-enter-action` suffix.

## confirmAction (two-step confirmation)

When an `action`/`submit` has `confirmAction: true`, the row requires two presses. The first select sets `awaitingConfirmation` and the display name changes to `"Are you sure?"`; the second select executes. This is implemented twice for the two surfaces:

- Main list rows: `shared/components/Command/CommandItem/index.tsx` (`handleSelect` / `awaitingConfirmation`).
- Action menu rows: `ActionItem` in `CommandActionsList.tsx`, which also clears confirmation on Escape/ArrowUp/ArrowDown and skips confirmation for `resetKeybinding` actions.

Confirmation is enforced purely in the UI; the background does not re-check it. Generated `primary` actions carry the source command's `confirmAction` so they confirm consistently.

## remainOpenOnSelect

`remainOpenOnSelect` (on `action`/`submit`) keeps the palette open after execution. It drives `shouldNavigateBack` in `buildCommandExecutionRequest`: when set, `shouldNavigateBack` is `false` and the palette does not navigate back (unless the user forces it with Cmd/Ctrl+Enter — `buildCommandExecutionRequest`'s `forceClose` option overrides `remainOpenOnSelect` and closes). Two refresh paths then re-resolve labels so state-aware commands (async `name`/`icon`/`description`) don't show stale text after toggling their own state:

- Root page: `shouldRefreshCommandsAfterExecution` returns `true`, so the palette calls `fetchCommands()` (`get-commands` → `setInitialCommands`), replacing the root suggestions.
- Child page: `selectCommand` (in `useCommandNavigation`) calls `refreshCurrentPage()` after a remain-open leaf executes, re-fetching that page's children via `get-children-commands` (`refreshCurrentPage` no-ops on root). Without this, the child page keeps its frozen suggestion snapshot and a toggle like `toggle-clock-visibility` would still read "Hide Clock" after hiding the clock.

Generated favorite/set-keybinding/hide-domain actions set `remainOpenOnSelect: true` to keep the action menu context stable; reset-keybinding uses `false`.

## executionPayload and SuggestionExecutionPayload

`SuggestionExecutionPayload` is `Record<string, string | string[]>` (`shared/types/ui.ts`). A command node may declare `executionPayload` as an `AsyncValue`; it is resolved during suggestion conversion and merged into `formValues` at selection time (`{ ...page.formValues, ...suggestion.executionPayload }`). This carries per-suggestion data (for example a `dynamicUrl` on a search result) into the executor without an inline form. The background `normalizeFormValues` then flattens it to strings before calling `execute`.

## Side-effect events (clipboard, new tab)

Executors run in the background service worker and cannot touch the page DOM or clipboard directly. They emit typed events to the active tab (via `sendTabMessage` / `chrome.tabs.sendMessage`), which content/new-tab listeners handle. Event shapes live in `shared/types/events.ts`.

| Event | `type` | Handled by | Behavior |
| --- | --- | --- | --- |
| Copy to clipboard | `monocle-copyToClipboard` | `shared/components/Listeners/CopyToClipboardListener.tsx` | Calls `useCopyToClipboard().copy(message)` (`navigator.clipboard.writeText`) |
| Open new tab | `monocle-newTab` | `shared/components/Listeners/NewTabListener.tsx` | `window.open(url, "_blank")`, but only for `http:`/`https:` URLs; other schemes are blocked |
| Screenshot | `monocle-screenshot` | `shared/components/Listeners/ScreenshotListener.tsx` | Converts the PNG `dataUrl` to a Blob; `mode: "clipboard"` writes it via `navigator.clipboard.write([new ClipboardItem(...)])`, `mode: "download"` triggers a blob-URL `<a download>` with `filename`. Emitted by `capture-screenshot` |
| Toast | `monocle-toast` | `ToastContainer` | Renders a transient toast |
| Alert | `monocle-alert` | (no listener mounted) | Type is defined in `events.ts` and emitted by some commands (history, downloads, etc.), but no UI component currently handles it; it carries `message`, optional `icon`, and `copyText` |

Both listeners are mounted in the palette (`CopyToClipboardListener` and `NewTabListener` are rendered inside `CommandPalette`). They respond to `chrome.runtime.onMessage` and reply `{ received: true }`. `useCopyToClipboard` warns and returns `false` when `navigator.clipboard` is unavailable or the write fails.

Typical executor pattern (`copyCurrentTabUrl`):

```ts
await sendTabMessage(activeTab.id, { type: "monocle-copyToClipboard", message: activeTab.url })
await sendTabMessage(activeTab.id, { type: "monocle-toast", level: "success", message: "URL copied to clipboard" })
```

## Toast feedback paths

There are two background message entry points for toasts, plus the missing-permissions helper:

- `useToast()` (`shared/hooks/useToast.tsx`) sends a `request-toast` message (`{ level, message }`). `background/messages/requestToast.ts` forwards it to `showToast`.
- Executors can call `showToast` directly (or emit a `monocle-toast` tab event).
- `showToast` (`background/messages/showToast.ts`) rate-limits duplicate `level:message` pairs within a 500ms window, then sends a `monocle-toast` event **only to the active tab**, swallowing send errors for tabs that cannot receive messages (e.g. `chrome://` pages).
- `showMissingPermissionsToast` (in `background/commands/index.ts`) is the permission-denied path: it builds a capitalized permission list and calls `showToast` with `level: "error"`.

`level` is one of `"info" | "warning" | "success" | "error"`.

## Usage recording

`recordCommandUsage(commandId, parentNames?)` (`background/commands/usage.ts`) is awaited after a successful execute when `shouldRecordUsage` is true:

- `action` commands: always recorded.
- `submit` commands: recorded unless `doNotAddToRecents === true`.
- All other types: never recorded.

Recording updates `totalUsage`, `lastUsed`, the 24-slot `hourlyUsage` histogram, an EMA score, and (when provided) `parentNames`, persisting to `monocle-commandUsage` in `chrome.storage.local`. Data older than 90 days is pruned opportunistically. The resulting scores feed ranking and the recents surface — see [search-and-ranking.md](search-and-ranking.md). `doNotAddToRecents` therefore only affects `submit` commands; `action` commands are always counted.

## Known issues and review notes

- Every `action`/`submit`/`group`/`search` suggestion inherits the favorite and (when on a page) hide-from-domain actions unconditionally. There is no per-command opt-out for these generated actions, so they appear even where they make little sense.
- `confirmAction` is enforced only in the UI (twice, once per surface). The background does not re-check it, so a direct `execute-command` message bypasses confirmation.
- `useIsModifierKeyPressed` tracks a single modifier and resolves it by priority (`shift` first), so combined modifiers map to one key; modifier-Enter execution itself runs through generated modifier actions rather than direct key interception.
- The toast rate limiter and active-tab targeting mean toasts can be silently dropped (duplicate within 500ms, or no eligible active tab).

## Manual test checklist

- Execute an `action` command and confirm the palette closes; execute one with `remainOpenOnSelect` and confirm it stays open and refreshes.
- Hold Cmd over a command with a `cmd` `modifierActionLabel` and confirm the footer label changes; open the action menu and run the modifier action; confirm the executor saw the modifier (e.g. history "Open in New Tab").
- Trigger a `confirmAction` command and confirm the first press shows "Are you sure?" and the second executes, in both the main list and the action menu.
- Run a command that copies to clipboard and one that opens a new tab; confirm the clipboard contents and that non-http(s) URLs are blocked.
- Favorite/unfavorite from the action menu and confirm the list refreshes; reset a custom keybinding and confirm the action disappears.
- Run a command with missing permissions and confirm the error toast and `PermissionActions` path appear instead of silent failure.

## Related docs

- [architecture.md](architecture.md) — runtime modes and core data flows
- [messaging.md](messaging.md) — `execute-command`, `request-toast`, `show-toast` envelopes
- [command-schema.md](command-schema.md) and [command-types.md](command-types.md) — `CommandNode` fields including `actionLabel`, `modifierActionLabel`, `confirmAction`, `remainOpenOnSelect`, `executionPayload`
- [search-and-ranking.md](search-and-ranking.md) — usage recording and ranking
- [keybindings.md](keybindings.md) — custom keybinding capture/reset actions
- [url-filtering.md](url-filtering.md) — hide-from-domain action
- [permissions.md](permissions.md) — execution-time permission checks
- [palette-ui-and-navigation.md](palette-ui-and-navigation.md) — navigation hook and footer UI
