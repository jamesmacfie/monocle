# Messaging Protocol

Monocle's UI surfaces (content overlay and new-tab page) never call privileged browser APIs directly. Instead they send typed messages to the background service worker, which owns command definitions, browser API access, settings, permissions, keybindings, and workflow forwarding. This document is the complete reference for that message protocol: every message the background accepts, the request/response shapes, the handler files, the send-side utilities, the validation/security layer, and how the background pushes messages back to a specific tab. All message type strings, payloads, and responses below are verified against source; where a response shape is implicit (a handler returning a plain object), it is described from the handler return value.

## Transport And Wiring

There are two transport directions, both built on `chrome.runtime` / `browser.runtime`:

- **UI -> background**: `chrome.runtime.sendMessage(...)`. The background registers a single listener (see `background/index.ts`, `initializeBackground`) via `addRuntimeListener` + `createCrossBrowserMessageHandler` (both in `background/utils/runtime.ts`), which calls `handleMessage` (`background/messages/index.ts`).
- **background -> a specific tab**: `chrome.tabs.sendMessage(tabId, ...)` (Chrome) / `browser.tabs.sendMessage` (Firefox). These messages are received by listeners mounted inside the palette UI (`shared/hooks/useCommandPaletteStateRedux.tsx`, `shared/components/ToastContainer.tsx`, `shared/components/Listeners/NewTabListener.tsx`).

`createCrossBrowserMessageHandler` is the bridge. It:

1. Validates the sender (`validateMessageSender` in `background/utils/runtime.ts`) — rejects messages from other extension IDs, direct web-page messages that are not extension pages, and suspicious URLs (`data:`, `javascript:`, `about:blank`).
2. Calls the wrapped handler with `(message, enhancedSender)` where `enhancedSender` adds `validationContext` (`senderId`, `senderUrl`, `senderTab`, `timestamp`).
3. In Chrome, returns `true` and resolves the handler promise into `sendResponse` (async response pattern). In Firefox, returns the promise directly. Errors are caught and returned as `{ error: string }`.

`handleMessage` (`background/messages/index.ts`) then runs a second validation pass — `validateIncomingMessage` (`background/utils/validation.ts`) against the Zod `MessageSchema` discriminated union in `shared/types/validation.ts`. On failure it returns `{ error: "Message validation failed: ...", validationIssues }` and never reaches a handler. On success it routes the validated message with `ts-pattern`'s `match` on `message.type`. Unknown types throw `Unknown message type: ...`.

## Message Catalog

Every entry below is registered in `handleMessage`. "Direction" is always UI -> background unless noted. Request shapes are defined in `shared/types/messaging.ts`; the send-side appends `context` automatically for most messages (see [Send-Side Utilities](#send-side-utilities)).

| Type string | Direction | Request payload | Response shape | Handler file / symbol | Purpose |
| --- | --- | --- | --- | --- | --- |
| `get-commands` | UI -> bg | `{ context }` | `{ favorites: Suggestion[], suggestions: Suggestion[], deepSearchItems: Suggestion[] }` | `background/messages/getCommands.ts`, `getCommands` | Load root palette: ranked suggestions, favorites, flattened deep-search items. |
| `get-children-commands` | UI -> bg | `{ id, context, parentPath?, searchValue? }` | `{ children: Suggestion[], openPage?: boolean, dynamicChildren?: boolean }` | `background/messages/getChildrenCommands.ts`, `getChildrenCommands` | Resolve children of a `group`/`search` node for the next palette page. |
| `execute-command` | UI -> bg | `{ id, context, formValues?, parentNames?, executionScope? }` | `{ success: true }` or `{ error }` | `background/messages/executeCommand.ts`, `executeCommand` | Run a command's executor with form values and execution scope. |
| `execute-keybinding` | UI -> bg | `{ keybinding, context }` | sequence/exec result (see below) or `{ error }` | `background/messages/executeKeybinding.ts`, `executeKeybinding` | Resolve a key stroke against the registry, handle chords, execute matches. |
| `get-keybinding-state` | UI -> bg | `{ context }` | `{ exactKeybindings: string[], sequencePrefixes: string[] }` or `{ error }` | `background/messages/getKeybindingState.ts`, `getKeybindingState` | Snapshot the active keybindings so the UI knows which strokes to capture. |
| `check-keybinding-conflict` | UI -> bg | `{ keybinding, excludeCommandId?, context? }` | `{ hasConflict: boolean, conflictingCommand: { id, name } \| null }` | `background/messages/checkKeybindingConflict.ts`, `checkKeybindingConflict` | Detect whether a proposed custom keybinding collides with an existing one. |
| `get-permissions` | UI -> bg | `{}` (no context) | `{ isLoaded: true, access: Record<string, boolean> }` or throws | `background/messages/getPermissions.ts`, `getPermissions` | Report which optional permissions are currently granted. |
| `request-permission` | UI -> bg | `{ permission }` (no context) | `{ granted: boolean, error? }` (`RequestPermissionResponse`) | `background/messages/requestPermission.ts`, `requestPermission` | Trigger the browser permission prompt and report the result. |
| `open-permission-grant-page` | UI -> bg | `{ permission }` (no context) | `{ success: true }` | `background/messages/openPermissionGrantPage.ts`, `openPermissionGrantPage` | Open the new-tab page with a `grantPermission` query so the prompt runs in a user-gesture-friendly context. |
| `update-command-setting` | UI -> bg | discriminated by `setting` (see below) | `{ success: true }` or throws | `background/messages/updateCommandSetting.ts`, `updateCommandSetting` | Persist a per-command `keybinding` or `urlRules` setting. |
| `request-toast` | UI -> bg | `{ level, message }` | `{ success: true, rateLimited? }` | `background/messages/requestToast.ts`, `requestToast` | UI-originated toast request; forwarded to `showToast`. |
| `show-toast` | UI -> bg | `{ level, message }` | `{ success: true, rateLimited? }` | `background/messages/showToast.ts`, `showToast` | Rate-limited toast; pushes a `monocle-toast` message to the active tab. |
| `get-unsplash-background` | UI -> bg | `{ context }` | `UnsplashBackgroundResponse` | `background/messages/getUnsplashBackground.ts`, `getUnsplashBackground` | Fetch a random Unsplash landscape photo for the new-tab background. |
| `execute-workflow` | UI -> bg | `{ workflow, context, tabId? }` | `{ result: WorkflowResult }` | `background/messages/executeWorkflow.ts`, `executeWorkflow` | Resolve the target tab and forward the workflow to that tab's content script. |

Background -> tab messages (not part of `handleMessage`; sent via `tabs.sendMessage`):

| Type string | Direction | Payload | Sent from | Received by |
| --- | --- | --- | --- | --- |
| `execute-workflow-content` | bg -> content | `{ workflow, context }` | `background/workflows/execution.ts`, `executeWorkflowOnTargetTab` | `shared/hooks/useCommandPaletteStateRedux.tsx` (responds `{ result }`) |
| `monocle-toast` | bg -> tab | `{ level, message }` | `background/messages/showToast.ts` and several command executors (e.g. `background/utils/browserTabs.ts`) | `shared/components/ToastContainer.tsx` |
| `toggle-ui` | bg -> tab | `{}` | `background/utils/contentPalette.ts`, plus `debugWorkflow`/`github` command executors | `shared/hooks/useCommandPaletteStateRedux.tsx` (responds `{ received: true }`) |
| `show-ui` | bg -> tab | `{}` | `background/utils/contentPalette.ts`, `toggleContentPalette` | `shared/hooks/useCommandPaletteStateRedux.tsx` (responds `{ received: true }`) |
| `monocle-newTab` | bg -> tab | `{ url }` | command executors (e.g. `background/commands/browser/history.ts`, `bookmarks.ts`) | `shared/components/Listeners/NewTabListener.tsx` (`window.open(url, "_blank")` for http(s) only) |

> **`get-deep-search-commands` does not exist as a message.** `background/messages/getDeepSearchCommands.ts` exports `flattenDeepSearchCommands` (used inside the `get-commands` handler) and a standalone `getDeepSearchCommands()` function, but neither is wired into `handleMessage` and no `get-deep-search-commands` type string is sent anywhere in the repo. Deep-search items are delivered through `get-commands` as the `deepSearchItems` field.

## Shared Request Building Blocks

`Browser.Context` (`shared/types/browser.ts`) rides along with most messages:

```ts
export namespace Browser {
  export interface Context {
    url: string
    title: string
    modifierKey: "shift" | "cmd" | "alt" | "ctrl" | null
    isNewTab?: boolean
  }
}
```

The Zod `BrowserContextSchema` (`shared/types/validation.ts`) requires a non-empty `url`, a string `title`, a nullable enum `modifierKey`, and optional boolean `isNewTab`. Because validation requires `url` to be non-empty, messages that carry context cannot be sent from a context without a URL.

`CommandExecutionScope` is attached to `execute-command` to pin execution to a specific palette page:

```ts
export type CommandExecutionScope = {
  pageId: string
  parentPath?: string[]
  searchValue?: string
}
```

## Message Groups In Detail

### Commands

**`get-commands`** — `getCommands` calls `getCommands(context)` from `background/commands`, then converts the three command-node buckets to `Suggestion[]` via `commandsToSuggestions` and flattens deep-search groups with `flattenDeepSearchCommands`. Returns:

```ts
{ favorites: Suggestion[], suggestions: Suggestion[], deepSearchItems: Suggestion[] }
```

See [search-and-ranking.md](search-and-ranking.md) for how `suggestions` are ranked and how `deepSearchItems` are weighted and deduped, and [command-types.md](command-types.md) for the underlying node families.

**`get-children-commands`** — `getChildrenCommands` rebuilds the current page with `getCommandPageCommands(context, parentPath, searchValue)`, finds the target by `id`, and branches:

- Target is a `group`: returns `{ children, openPage: true, dynamicChildren: false }`.
- Target is a `search`: returns `{ children, openPage: true, dynamicChildren: true }` and forwards `searchValue` so dynamic results recompute.
- Target not found / not a container: returns `{ children: [] }`.

`children` are `Suggestion[]` produced by `commandsToSuggestions(targetPage.commands, context, parentName, inheritedPermissions)`. The `dynamicChildren` flag tells the navigation slice whether typing in the page should re-request children. See [palette-ui-and-navigation.md](palette-ui-and-navigation.md).

**`execute-command`** — `executeCommand` delegates to `executeCommand(id, context, formValues ?? {}, parentNames, executionScope)` from `background/commands` and returns `{ success: true }`. Permission checks, executor dispatch, and usage recording all happen inside that call. See [execution-and-actions.md](execution-and-actions.md). `formValues` is `Record<string, string | string[]>`; multi-value fields are normalized downstream.

### Keybindings

**`execute-keybinding`** — `executeKeybinding` is the most stateful handler. It normalizes the stroke, maintains a per-scope `SequenceState` (chord buffer) keyed by `getSequenceScopeKey` (tab + document, or context-derived for new-tab/page), and uses an 800 ms `CHORD_TIMEOUT_MS`. Outcomes from `evaluateSequence`:

| Situation | Returned object |
| --- | --- |
| Exact match, no longer sequence possible | `{ success: true, executed: true }` (or `{ success: false, error }` on executor failure) |
| Exact match but a longer chord exists | `{ success: true, executed: false, pending: true }` (schedules delayed single execution) |
| No exact match but a chord prefix matches | `{ success: true, executed: false, pending: true }` |
| Invalid stroke | `{ success: false, error: "Invalid keybinding: ..." }` |
| No registered command | `{ success: false, error: "No command registered for keybinding: ..." }` |
| Thrown error | `{ error: "Failed to execute keybinding" }` |

Note this handler is **not** wrapped by `createMessageHandler`; it has its own try/catch. Sequence state is global to the service worker, so concurrent tabs share the `sequenceStates` map (scoped by key). See [keybindings.md](keybindings.md).

**`get-keybinding-state`** — `getKeybindingState` returns `{ exactKeybindings, sequencePrefixes }` from the registry snapshot. The UI uses this to decide which key events to intercept before passing them to `execute-keybinding`.

**`check-keybinding-conflict`** — `checkKeybindingConflict` normalizes the proposed binding, loads all keybinding-capable command entries for the context, and returns the first non-excluded command with a matching normalized binding as `conflictingCommand`. Errors are swallowed and reported as no conflict. This handler is not wrapped by `createMessageHandler` either.

### Permissions

These three messages are the only ones the send hook does **not** attach `context` to (see `useSendMessage`):

- **`get-permissions`** — `getPermissions` calls `permissions.getAll()` and maps known permission names into a boolean `access` object (`activeTab`, `bookmarks`, `browsingData`, `contextualIdentities` (Firefox only), `cookies`, `downloads`, `history`, `sessions`, `storage`, `tabs`). On failure it throws (surfaced as `{ error }` by the cross-browser wrapper).
- **`request-permission`** — `requestPermission` calls `permissions.request` then `permissions.contains`, returning `RequestPermissionResponse` = `{ granted: boolean, error? }`.
- **`open-permission-grant-page`** — `openPermissionGrantPage` opens `/newtab.html?grantPermission=<permission>` in a new active tab so the prompt fires from a stable extension page; returns `{ success: true }`.

Browser permission state is authoritative; Redux mirrors it. See [permissions.md](permissions.md).

### Settings

**`update-command-setting`** is a discriminated union on `setting`:

```ts
type UpdateKeybindingSettingMessage = {
  type: "update-command-setting"
  commandId: string
  setting: "keybinding"
  value?: string | null
  context?: Browser.Context
}

type UpdateUrlRulesSettingMessage = {
  type: "update-command-setting"
  commandId: string
  setting: "urlRules"
  value: CommandUrlRulesSetting
  context?: Browser.Context
}
```

`updateCommandSetting` behavior:

- `setting: "keybinding"` — normalizes the value. Empty/invalid removes the stored keybinding and refreshes the registry. Otherwise it resolves the command, rejects (`throw`) if the command does not allow keybindings, persists via `updateCommandSettings`, refreshes the registry, and emits a success `show-toast`.
- `setting: "urlRules"` — runs custom `validateUrlRulesSetting` (each field must be an array of valid URL patterns; invalid patterns `throw`), then `updateCommandUrlRules`.

Returns `{ success: true }`. See [settings.md](settings.md) and [url-filtering.md](url-filtering.md).

### Workflows

**`execute-workflow`** (UI -> bg) carries `{ workflow, context, tabId? }`. `executeWorkflow` calls `executeWorkflowOnTargetTab` (`background/workflows/execution.ts`), which resolves the target tab in this priority order (`resolveWorkflowTargetTabId`):

1. Explicit `tabId` (must be a positive integer, else throws).
2. `sender.tab.id` / `sender.validationContext.senderTab`.
3. A tab whose URL matches `context.url` (throws for new-tab context, since a page workflow cannot run from the new-tab page).
4. The active tab.

It then sends **`execute-workflow-content`** `{ workflow, context }` to that tab via `tabs.sendMessage`. The content listener in `useCommandPaletteStateRedux.tsx` runs `workflowExecutor.executeWorkflow(workflow)` and responds `{ result }`. The background unwraps it (`unwrapWorkflowResult`) and returns `{ result: WorkflowResult }`. On any thrown error the handler returns `{ result: { success: false, error } }`.

Only `click` and `wait` steps are actually executed; the workflow type model is broader than the executor. See [workflow-automation.md](workflow-automation.md).

### Toasts

Two near-identical messages exist. `request-toast` is the UI-facing alias that simply forwards to `showToast`. `show-toast` is the real implementation: it rate-limits duplicate `level:message` pairs within `RATE_LIMIT_WINDOW` (500 ms), then sends a `monocle-toast` message to the active tab (errors on non-receiving tabs like `chrome://` pages are swallowed). Both return `{ success: true }` (and `{ success: true, rateLimited: true }` when suppressed). The `monocle-toast` message is received by `ToastContainer.tsx`.

### New Tab

**`get-unsplash-background`** — `getUnsplashBackground` reads the access key from `WXT_UNSPLASH_ACCESS_KEY` / `EXTENSION_PUBLIC_UNSPLASH_ACCESS_KEY` and fetches a random landscape photo. Response (`UnsplashBackgroundResponse`):

```ts
{ imageUrl, photographerName, photographerUrl, photoUrl, error? }
```

If the key is missing or the fetch fails, all string fields are empty and `error` is set. See [new-tab-and-theme.md](new-tab-and-theme.md).

## Send-Side Utilities

### `useSendMessage` (UI components)

`shared/hooks/useSendMessage.tsx` returns a `sendMessage(message, contextOverride?)` callback. It:

- Builds a base context `{ title: document.title, url: window.location.href, modifierKey: <current modifier> }` and shallow-merges `contextOverride`.
- Attaches `context` to every message **except** `get-permissions`, `request-permission`, and `open-permission-grant-page`.
- Wraps `chrome.runtime.sendMessage` in a Promise; rejects with `chrome.runtime.lastError` if set, otherwise resolves with the raw response.

Its `SendableMessage` union uses context-stripped variants (`Omit<..., "context">`) for the command/keybinding messages because the hook supplies context. The current modifier key is tracked through a ref fed by `useIsModifierKeyPressed`, so modifier-aware execution (e.g. enter vs cmd-enter) reflects the live key state.

### `createPaletteSendMessage` (store)

`shared/store/sendMessage.ts` exports `createPaletteSendMessage(extraContext)`, a factory used by the palette stores. It attaches `{ title, url, modifierKey: null, ...extraContext }` as `context` to every message and wraps `chrome.runtime.sendMessage` with the same `lastError` handling. New-tab stores pass `{ isNewTab: true }` as `extraContext`.

### Response And Error Shapes

There is no envelope type — responses are whatever the handler returns. Two conventions:

- **Success-flag handlers** return `{ success: true, ... }` (e.g. `execute-command`, `update-command-setting`, toasts).
- **Data handlers** return their data object directly (e.g. `get-commands`, `get-keybinding-state`).

Errors surface in three layered ways:

1. **Validation failure** (in `handleMessage`): `{ error: "Message validation failed: ...", validationIssues }`.
2. **`createMessageHandler` wrapper** (`background/utils/messages.ts`): handlers wrapped by `createMessageHandler` catch any throw and return `{ error: <customErrorMessage> }`. `getCommands`, `getChildrenCommands`, `executeCommand`, `getKeybindingState` use this. `withErrorHandling` is an alternative async factory with the same behavior.
3. **Cross-browser wrapper** (`createCrossBrowserMessageHandler`): a rejected handler promise becomes `sendResponse({ error: error.message })`.

Callers must therefore check for `response.error` themselves; a rejected `sendMessage` Promise only happens for transport-level `lastError`, not for handler-returned `{ error }`.

## Background -> Tab Messaging

The background reaches a specific tab through `tabs.sendMessage`, never `runtime.sendMessage`:

- `background/utils/contentPalette.ts` (`toggleContentPalette`) sends `toggle-ui`. If no content script is present (`Could not establish connection` / `Receiving end does not exist`), it injects `content-scripts/content.js` via `scripting.executeScript`, then retries `show-ui` up to 5 times with a 75 ms delay. `The message port closed before a response was received` is treated as success (the listener fired but did not respond synchronously).
- `background/utils/runtime.ts` (`sendMessageToActiveTab`) is a generic helper that resolves the active tab and calls `sendTabMessage`.
- `background/messages/showToast.ts` and various command executors target the active tab with `monocle-toast`.
- `background/workflows/execution.ts` targets a resolved tab with `execute-workflow-content`.

Content-side receivers live in the shared UI so both overlay and new-tab modes handle them: `useCommandPaletteStateRedux.tsx` (`toggle-ui`, `show-ui`, `execute-workflow-content`), `ToastContainer.tsx` (`monocle-toast`), and `NewTabListener.tsx` (`monocle-newTab`).

## Adding A New Message Type End To End

1. **Define the request type** in `shared/types/messaging.ts`, add it to the `Message` union, and export any response interface there.
2. **Add a Zod schema** in `shared/types/validation.ts` and include it in the `MessageSchema` discriminated union — `validateIncomingMessage` rejects anything not in the union, so an unschema'd message can never reach a handler.
3. **Write the handler** in `background/messages/<name>.ts`. Wrap it with `createMessageHandler(handler, "Failed to ...")` unless you need bespoke error shaping (as `executeKeybinding`/`checkKeybindingConflict` do).
4. **Register it** in `background/messages/index.ts`: import the handler and add a `.with({ type: "<name>" }, ...)` arm to the `match` chain.
5. **Expose it to the UI** by adding the (optionally context-stripped) type to `SendableMessage` in `shared/hooks/useSendMessage.tsx`. Decide whether the message needs `context`; if not, add the type to the exclusion check in the hook.
6. **If it is a background -> tab message**, send it with `tabs.sendMessage` from the background and add a listener arm in the appropriate content-side component (`useCommandPaletteStateRedux.tsx`, `ToastContainer.tsx`, or a new listener), returning `true` for async responses.
7. **Account for both error layers**: callers should check `response?.error`; the handler should either throw (caught by the wrapper) or return an explicit error object.

## Known Issues / Notes

- The `Message` union in `shared/types/messaging.ts`, the `MessageSchema` discriminated union in `shared/types/validation.ts`, and the `match` chain in `handleMessage` all enumerate the same 14 message types. `MessageSchema` and `handleMessage` are the runtime source of truth (validation rejects anything not in the union before it reaches a handler); the `Message` union is the type-level mirror. Note that `useSendMessage`'s `SendableMessage` union is deliberately narrower — it omits `ShowToastMessage` and `GetUnsplashBackgroundMessage` (sent from stores / non-hook paths rather than the hook) and uses context-stripped variants for the command/keybinding messages.
- `executeKeybinding` and `checkKeybindingConflict` are not wrapped by `createMessageHandler`; their error contracts differ (they return domain-shaped fallbacks, not `{ error: <generic> }`).
- `getDeepSearchCommands()` and the standalone `getDeepSearchCommands` export are effectively dead-code paths today; deep-search delivery goes through `get-commands`.
- Keybinding sequence state is global to the service worker; multi-tab chord interactions can interfere. See [keybindings.md](keybindings.md).

## Manual Test Checklist

- Open the palette in both content overlay and new-tab modes and confirm `get-commands` populates favorites, suggestions, and deep-search items.
- Navigate into a `group` and a `search` node; confirm `get-children-commands` returns `openPage: true` and that `search` recomputes as you type (`dynamicChildren: true`).
- Execute a command with enter and with the modifier held; confirm the modifier reaches the background (visible in execution behavior / usage).
- Set, change, and clear a custom keybinding; confirm `check-keybinding-conflict` flags collisions and `update-command-setting` shows the success toast and refreshes the registry.
- Trigger a permission-gated command in Chrome and Firefox; confirm `request-permission` / `open-permission-grant-page` flows and that `get-permissions` reflects the grant.
- Run a `click` workflow from a normal tab and confirm `execute-workflow` -> `execute-workflow-content` round-trips a `WorkflowResult`; confirm a new-tab-origin page workflow is rejected.
- Fire duplicate toasts within 500 ms and confirm rate limiting.

## Related Docs

- [architecture.md](architecture.md) — runtime modes, boundaries, and core data flows.
- [command-schema.md](command-schema.md) — `CommandNode` and `FormField` shapes referenced by command messages.
- [command-types.md](command-types.md) — the six node families behind `get-commands` / `get-children-commands`.
- [execution-and-actions.md](execution-and-actions.md) — what `execute-command` does downstream.
- [keybindings.md](keybindings.md) — registry, sequences, and conflict semantics.
- [permissions.md](permissions.md) — grant flows behind the permission messages.
- [settings.md](settings.md) — persistence behind `update-command-setting`.
- [url-filtering.md](url-filtering.md) — `urlRules` validation and matching.
- [workflow-automation.md](workflow-automation.md) — workflow executor vs the type model.
- [new-tab-and-theme.md](new-tab-and-theme.md) — Unsplash background and new-tab listeners.
