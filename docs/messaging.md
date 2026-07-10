# Messaging Protocol

Monocle's UI surfaces (content overlay and new-tab page) never call privileged browser APIs directly; they send typed messages to the background service worker, which owns command definitions, browser API access, settings, permissions, keybindings, and workflow forwarding. This is the complete reference for that protocol: every message the background accepts, the request/response shapes, handler files, send-side utilities, the validation/security layer, and how the background pushes messages back to a specific tab. Where a response shape is implicit (a handler returning a plain object), it is described from the handler return value.

## Transport And Wiring

There are two transport directions, both built on `chrome.runtime` / `browser.runtime`:

- **UI -> background**: `chrome.runtime.sendMessage(...)`. The background registers a single listener (see `background/index.ts`, `initializeBackground`) via `addRuntimeListener` + `createCrossBrowserMessageHandler` (both in `background/utils/runtime.ts`), which calls `handleMessage` (`background/messages/index.ts`).
- **background -> a specific tab**: `chrome.tabs.sendMessage(tabId, ...)` (Chrome) / `browser.tabs.sendMessage` (Firefox). These messages are received by listeners mounted inside the palette UI (`shared/hooks/useCommandPaletteStateRedux.tsx`, `shared/components/ToastContainer.tsx`, `shared/components/Listeners/NewTabListener.tsx`).

`createCrossBrowserMessageHandler` is the bridge. It:

1. Validates the sender (`validateMessageSender` in `background/utils/runtime.ts`) — rejects messages from other extension IDs, direct web-page messages that are not extension pages, and suspicious URLs (`data:`, `javascript:`, `about:blank`).
2. Calls the wrapped handler with `(message, enhancedSender)` where `enhancedSender` adds `validationContext` (`senderId`, `senderUrl`, `senderTab`, `timestamp`).
3. In Chrome, returns `true` and resolves the handler promise into `sendResponse` (async response pattern). In Firefox, returns a wrapped promise directly. On both browsers, thrown handler errors resolve as `{ error: error.message }`.

`handleMessage` (`background/messages/index.ts`) then runs a second validation pass — `validateIncomingMessage` (`background/utils/validation.ts`) against the Zod `MessageSchema` discriminated union in `shared/types/validation.ts`. On failure it returns `{ error: "Message validation failed: ...", validationIssues }` and never reaches a handler. On success it routes the validated message with `ts-pattern`'s exhaustive `match` on `message.type`; the schema rejects unknown types before dispatch.

The reverse direction has its own schema boundary. Background-to-tab payloads are modeled and validated by `shared/types/contentMessageValidation.ts` (`ContentMessageSchema`). `background/utils/browserTabs.ts` types `sendTabMessage` / `broadcastToAllTabs` with that union, and content/new-tab listeners call `validateContentMessage` before acting. This covers palette control messages, `monocle-workflow-content-execute`, `monocle-*` events, Site SDK bridge events, and the `monocle-surfaces-changed` broadcast.

## Naming Conventions

Every message type string follows one scheme:

- **`monocle-` prefix on every type string**, both UI -> bg and bg -> tab. The prefix namespaces Monocle's messages against other extensions and page scripts sharing the `runtime`/`tabs` channels.
- **kebab-case type strings** (`monocle-command-execute`), never camelCase. The earlier camelCase content events (`monocle-copyToClipboard`, `monocle-newTab`, `monocle-insertText`) were renamed to `monocle-clipboard-write`, `monocle-tab-open`, `monocle-text-insert`.
- **Noun-first, verb-last grouping**: `monocle-<entity>[-<subentity>]-<verb>` (`monocle-command-setting-update`, `monocle-snippet-add`, `monocle-keybinding-conflict-check`). Collection reads use the plural entity (`monocle-commands-get`, `monocle-automations-get`); single-entity operations use the singular (`monocle-command-execute`, `monocle-automation-update`). The verb set is deliberately small: `get`, `search`, `add`, `update`, `delete`, `set`, `check`, `request`, `sync`, `open`, and `execute` for invoking a command/keybinding/workflow/feature action. The automation domain uses `run` rather than `execute` (`monocle-automation-run`) to match its pervasive vocabulary (`AutomationRunResult`, `runningIds`, the `runAutomation` thunk); the Site SDK bridge uses `invoke` to call a page-world callback (`monocle-site-sdk-invoke`).
- **Two message classes sit outside the request/response RPC shape.** bg -> tab *content effects* are imperative — most are noun-verb (`monocle-clipboard-write`, `monocle-tab-open`, `monocle-text-insert`, `monocle-ui-toggle`/`-show`/`-hide`), and a few long-standing single-purpose effects keep a bare name (`monocle-toast`, `monocle-scroll`, `monocle-screenshot`). *Notifications* report that something happened and use a past-tense verb (`monocle-surfaces-changed`, `monocle-automation-trigger-fired`).
- **camelCase payload properties.** A message acting on a single entity names that entity `id` (`monocle-command-execute`, `monocle-command-setting-update`, `monocle-command-favorite-set`, the snippet and automation CRUD messages). A message that carries more than one entity reference, or is a cross-context event report, qualifies every id so the roles stay legible: `featureId` + `actionId` (`monocle-feature-action-execute`; `featureId` is kept on `monocle-feature-config-update` for symmetry within the feature domain), `ownerId` + `surfaceId` + `actionId` (`monocle-surface-action`), `automationId` (`monocle-automation-trigger-fired`), `excludeCommandId` (`monocle-keybinding-conflict-check`), and the per-item `commandId` inside `monocle-command-keybindings-update`'s `updates` array. Boolean side-effect results use `{ success }`; reads return their data directly.
- **`type` stays the discriminator.** It is the idiomatic discriminated-union key for both the Zod `discriminatedUnion("type")` schemas and the `ts-pattern` `match`; the apparent "overload" with `CommandNode.type` / `FormField.type` / workflow-step `op` is across distinct object types, never within one message object.

## Message Catalog

Every entry below is registered in `handleMessage`. "Direction" is always UI -> background unless noted. Request shapes are defined in `shared/types/messaging.ts`; the send-side appends `context` automatically for most messages (see [Send-Side Utilities](#send-side-utilities)).

| Type string | Direction | Request payload | Response shape | Handler file / symbol | Purpose |
| --- | --- | --- | --- | --- | --- |
| `monocle-commands-get` | UI -> bg | `{ context }` | `{ favorites: Suggestion[], suggestions: Suggestion[] }` | `background/messages/getCommands.ts`, `getCommands` | Load the root palette empty state: favorites and usage-ranked suggestions. |
| `monocle-commands-search` | UI -> bg | `{ context, query, parentPath?, limit?, seq }` | `{ results: Suggestion[], seq, query }` | `background/messages/searchCommands.ts`, `searchCommands` | Background-owned palette search: score the index (root) or page children (child pages), return the top-N suggestions. |
| `monocle-command-children-get` | UI -> bg | `{ id, context, parentPath?, searchValue? }` | `{ children: Suggestion[], openPage?: boolean, dynamicChildren?: boolean }` | `background/messages/getChildrenCommands.ts`, `getChildrenCommands` | Resolve children of a `group`/`search` node for the next palette page. |
| `monocle-command-execute` | UI -> bg | `{ id, context, formValues?, parentNames?, executionScope? }` | `{ success: true }` or `{ error }` | `background/messages/executeCommand.ts`, `executeCommand` | Run a command's executor with form values and execution scope. |
| `monocle-keybinding-execute` | UI -> bg | `{ keybinding, context }` | sequence/exec result (see below) or `{ error }` | `background/messages/executeKeybinding.ts`, `executeKeybinding` | Resolve a key stroke against the registry, handle chords, execute matches. |
| `monocle-keybinding-state-get` | UI -> bg | `{ context }` | `{ exactKeybindings: string[], sequencePrefixes: string[] }` or `{ error }` | `background/messages/getKeybindingState.ts`, `getKeybindingState` | Snapshot the active keybindings so the UI knows which strokes to capture. |
| `monocle-keybinding-conflict-check` | UI -> bg | `{ keybinding, excludeCommandId?, context? }` | `{ hasConflict: boolean, conflictingCommand: { id, name } \| null, conflictType?, warnings?, requirementViolation? }` | `background/messages/checkKeybindingConflict.ts`, `checkKeybindingConflict` | Detect whether a proposed custom keybinding collides with an existing one (open-palette prefix shadowing, non-blocking prefix-overlap warnings) or violates the target command's `keybindingRequirements` (`requirementViolation: { code, message }`). |
| `monocle-permissions-get` | UI -> bg | `{}` (no context) | `{ isLoaded: true, access: Record<string, boolean> }` or throws | `background/messages/getPermissions.ts`, `getPermissions` | Report which optional permissions are currently granted. |
| `monocle-permission-request` | UI -> bg | `{ permission }` (no context) | `{ granted: boolean, error? }` (`RequestPermissionResponse`) | `background/messages/requestPermission.ts`, `requestPermission` | Trigger the browser permission prompt and report the result. |
| `monocle-permission-grant-page-open` | UI -> bg | `{ permission }` (no context) | `{ success: true }` | `background/messages/openPermissionGrantPage.ts`, `openPermissionGrantPage` | Open the new-tab page with a `grantPermission` query so the prompt runs in a user-gesture-friendly context. |
| `monocle-host-permission-ensure` | UI -> bg | `{ tabId?, url?, reason: "automation" \| "elementHider" }` (no context) | `{ granted: boolean, originPattern?, error? }` | `background/messages/hostPermissions.ts`, `ensureHostPermissionMessage` | Request/check optional host access for one http(s) origin and inject the content script into the target tab when granted. |
| `monocle-command-setting-update` | UI -> bg | discriminated by `setting` (see below) | `{ success: true }` or throws | `background/messages/updateCommandSetting.ts`, `updateCommandSetting` | Persist a per-command `keybinding`, `hidden`, or `urlRules` setting. |
| `monocle-command-keybindings-update` | UI -> bg | `{ updates: { commandId, keybinding? }[], context? }` | `{ success: true, updated: number, conflicts: UpdateCommandKeybindingsConflict[] }` or throws | `background/messages/updateCommandKeybindings.ts`, `updateCommandKeybindings` | Batch-persist keybindings for template application without per-command toasts; conflicting updates are skipped and reported. |
| `monocle-settings-catalog-get` | UI -> bg | `{ platform? }` | `SettingsCatalogResponse` | `background/messages/getSettingsCatalog.ts`, `getSettingsCatalog` | Return durable command rows for the options Commands page, including metadata, settings, favorite state, usage, and capabilities. |
| `monocle-settings-update` | UI -> bg | `{ theme?, newTab? }` | `{ success: true, theme, newTab }` | `background/messages/settings.ts`, `updateSettings` | Apply a locked partial patch to general theme/new-tab settings without replacing command settings. |
| `monocle-command-favorite-set` | UI -> bg | `{ id, favorite }` | `{ success: true }` | `background/messages/setCommandFavorite.ts`, `setCommandFavorite` | Set favorite state directly, including for hidden commands that no longer expose generated palette actions. |
| `monocle-snippets-get` | UI -> bg | `{ context? }` | `{ snippets: Snippet[] }` | `background/messages/getSnippets.ts`, `getSnippets` | Return all saved snippets (options Snippets page; the palette resolves them background-side). |
| `monocle-snippet-add` | UI -> bg | `{ name, body, context? }` | `{ snippet: Snippet }` | `background/messages/addSnippet.ts`, `addSnippet` | Persist a new snippet to `monocle-snippets` and invalidate the search index. |
| `monocle-snippet-update` | UI -> bg | `{ id, name?, body?, context? }` | `{ snippet: Snippet \| null }` | `background/messages/updateSnippet.ts`, `updateSnippet` | Update a snippet's name/body; `null` when the id is unknown. |
| `monocle-snippet-delete` | UI -> bg | `{ id, context? }` | `{ deleted: boolean }` | `background/messages/deleteSnippet.ts`, `deleteSnippet` | Remove a snippet by id. |
| `monocle-toast-show` | UI -> bg | `{ level, message }` | `{ success: true, rateLimited? }` | `background/messages/showToast.ts`, `showToast` | Rate-limited toast; pushes a `monocle-toast` message to the active tab. |
| `monocle-unsplash-background-get` | UI -> bg | `{ context }` | `UnsplashBackgroundResponse` | `background/messages/getUnsplashBackground.ts`, `getUnsplashBackground` | Fetch a random Unsplash landscape photo for the new-tab background. |
| `monocle-workflow-execute` | UI -> bg | `{ workflow, context, tabId? }` | `{ result: WorkflowResult }` | `background/messages/executeWorkflow.ts`, `executeWorkflow` | Resolve the target tab and forward the workflow to that tab's content script. |
| `monocle-site-sdk-sync` | content -> bg | `{ context, registrations }` | `{ success: true }` or `{ success: false, error }` | `background/messages/siteSdkSync.ts`, `siteSdkSync` | Sync validated page-owned SDK registrations for the sender tab/document/origin. |
| `monocle-automations-get` | UI -> bg | `{}` | `{ automations: Automation[] }` | `background/messages/automations.ts`, `getAutomations` | List stored automations for the options Automations page. |
| `monocle-automation-add` | UI -> bg | `{ automation: AutomationDraft }` | `{ automation: Automation }` | `background/messages/automations.ts`, `addAutomation` | Persist a new automation (draft validated by the shared document schema); invalidates the search index and rebuilds the keybinding registry. |
| `monocle-automation-update` | UI -> bg | `{ id, automation: AutomationDraft }` | `{ automation: Automation \| null }` | `background/messages/automations.ts`, `updateAutomation` | Replace an automation's draft fields; `null` when the id is unknown. |
| `monocle-automation-delete` | UI -> bg | `{ id }` | `{ deleted: boolean }` | `background/messages/automations.ts`, `deleteAutomation` | Delete an automation and drop its dangling `CommandSettings` (`automation-<id>`). |
| `monocle-automation-run` | UI -> bg | `{ id, context?, paramValues? }` | `{ result: AutomationRunResult }` | `background/messages/automations.ts`, `runAutomationMessage` | Run an automation by id through the engine; without `context` (options test runs) the engine targets the active tab. |
| `monocle-automation-triggers-get` | content -> bg | `{ url }` | `{ triggers: AutomationPageTriggerSpec[] }` | `background/messages/automations.ts`, `getAutomationTriggers` | The page pulls the armed urlMatch/elementAppears trigger specs whose automation urlRules allow its URL. |
| `monocle-automation-trigger-fired` | content -> bg | `{ automationId, trigger: { type, url, matchedText? } }` | `{ accepted: boolean, reason? }` | `background/messages/automations.ts`, `automationTriggerFired` | A page trigger fired; the background re-validates eligibility (sender tab + sender URL authority, armed state) before the engine runs. |
| `monocle-features-get` | UI -> bg | `{}` | `{ features: FeatureDescriptor[] }` | `background/messages/features.ts`, `getFeatures` | Return UI-safe descriptors for every registered feature: schema, current config, projected lists, and display metadata. |
| `monocle-feature-config-update` | UI -> bg | `{ featureId, config }` | `{ success: boolean, config }` | `background/messages/features.ts`, `updateFeatureConfig` | Validate and replace a feature's durable config, then run its `onConfigChange` hook. |
| `monocle-feature-action-execute` | UI -> bg | `{ featureId, actionId, context?, payload? }` | `{ success: boolean, feature?: FeatureDescriptor }` | `background/messages/features.ts`, `executeFeatureAction` | Run a feature settings/action handler; `payload` carries record-list row data and the response includes a re-projected descriptor. |
| `monocle-surfaces-get` | content/new-tab -> bg | `{ url }` | `{ surfaces: Surface[] }` | `background/messages/surfaces.ts`, `getSurfaces` | Return declarative surfaces whose URL and optional sender-tab gates admit the requesting host. |
| `monocle-surface-action` | content/new-tab -> bg | `{ ownerId, surfaceId, actionId, value?, selection? }` | `{ success: boolean }` | `background/messages/surfaceAction.ts`, `surfaceAction` | Report a surface gesture; `dismiss` removes the surface, feature-owned actions route to the feature's `handleAction`, command-owned actions route to a command-registered handler (`background/commands/surfaceActionHandlers.ts`), and automation owner routing is still an explicit no-op. |

Background -> tab messages (not part of `handleMessage`; sent via `tabs.sendMessage`):

| Type string | Direction | Payload | Sent from | Received by |
| --- | --- | --- | --- | --- |
| `monocle-workflow-content-execute` | bg -> content | `{ workflow, context }` | `background/workflows/execution.ts`, `executeWorkflowOnTargetTab` | `shared/hooks/useCommandPaletteStateRedux.tsx` (responds `{ result }`) |
| `monocle-content-ping` | bg -> content | `{}` | `background/utils/hostPermissions.ts`, `ensureContentScriptForTab` | `shared/hooks/useCommandPaletteStateRedux.tsx` (responds `{ received: true }`) |
| `monocle-toast` | bg -> tab | `{ level, message }` | `background/messages/showToast.ts` and several command executors (e.g. `background/utils/browserTabs.ts`) | `shared/components/ToastContainer.tsx` |
| `monocle-ui-toggle` | bg -> tab | `{}` | `background/utils/contentPalette.ts`, plus `debugWorkflow`/`github` command executors | `shared/hooks/useCommandPaletteStateRedux.tsx` (responds `{ received: true }`) |
| `monocle-ui-show` | bg -> tab | `{}` | `background/utils/contentPalette.ts`, `toggleContentPalette` | `shared/hooks/useCommandPaletteStateRedux.tsx` (responds `{ received: true }`) |
| `monocle-ui-hide` | bg -> tab | `{}` | `background/commands/browser/captureScreenshot.ts` (hide overlay before capture) | `shared/hooks/useCommandPaletteStateRedux.tsx` (hides, then responds `{ received: true }` after two `requestAnimationFrame`s so the overlay is painted out) |
| `monocle-clipboard-write` | bg -> tab | `{ message }` | many command executors (`copyUuidV4.ts`, `copyCurrentTabUrl.ts`, `snippets.ts`, …) | `shared/components/Listeners/CopyToClipboardListener.tsx` (`navigator.clipboard.writeText`) |
| `monocle-tab-open` | bg -> tab | `{ url }` | command executors (e.g. `background/commands/browser/history.ts`, `bookmarks.ts`) | `shared/components/Listeners/NewTabListener.tsx` (`window.open(url, "_blank")` for http(s) only) |
| `monocle-scroll` | bg -> tab | `{ direction: "top" \| "bottom" }` | `background/commands/browser/scrollToTop.ts`, `scrollToBottom.ts` | `shared/components/Listeners/ScrollListener.tsx` (`window.scrollTo` with smooth behavior) |
| `monocle-screenshot` | bg -> tab | `{ mode: "clipboard" \| "download", dataUrl, filename? }` | `background/commands/browser/captureScreenshot.ts` | `shared/components/Listeners/ScreenshotListener.tsx` (Blob → clipboard `ClipboardItem` or blob-URL `<a download>`) |
| `monocle-text-insert` | bg -> tab | `{ text }` | `background/commands/tools/snippets.ts`, `insertSnippet` children | `shared/components/Listeners/InsertTextListener.tsx` (inserts at the caret of the page's last-focused editable element; responds `{ inserted: boolean }` so the executor can fall back to `monocle-clipboard-write` + toast) |
| `monocle-site-sdk-sync-request` | bg -> content bridge | `{}` | `background/commands/siteSdk/index.ts`, `prepareSiteSdkCommandLoadOptions` | the isolated content SDK bridge — replays current page SDK registrations after a service-worker restart (responds `{ registrations }`) |
| `monocle-site-sdk-invoke` | bg -> content bridge | `{ request }` | `background/commands/siteSdk/commands.ts`, SDK wrappers | the content SDK bridge — invokes a page-world SDK callback for execute / dynamic group children / dynamic search (responds `{ success: true, commands? }` or `{ success: false, error }`) |

> **Deep-search items are delivered through `monocle-commands-search`.** They are flattened into the background search index (`background/commands/searchIndex.ts`) and arrive inline in `results` with a `rankWeight` stamp. `monocle-commands-get` no longer returns a `deepSearchItems` field.

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

The Zod `BrowserContextSchema` (`shared/types/validation.ts`) requires a non-empty `url`, a string `title`, a nullable enum `modifierKey`, and optional boolean `isNewTab`. Because `url` must be non-empty, messages carrying context cannot be sent from a context without a URL.

`CommandExecutionScope` is attached to `monocle-command-execute` to pin execution to a specific palette page:

```ts
export type CommandExecutionScope = {
  pageId: string
  parentPath?: string[]
  searchValue?: string
}
```

## Message Groups In Detail

### Commands

**`monocle-commands-get`** — `getCommands` calls `getCommands(context)` from `background/commands` and converts the favorites/suggestions node buckets to `Suggestion[]` via `commandsToSuggestions`. It serves the root **empty state** only — searching goes through `monocle-commands-search`. Returns:

```ts
{ favorites: Suggestion[], suggestions: Suggestion[] }
```

**`monocle-commands-search`** — `searchCommands` answers palette queries:

- **Root** (`parentPath` empty/undefined): scores entries from the in-memory search index (`background/commands/searchIndex.ts`) after query-time URL filtering. An empty root query returns `results: []`.
- **Child pages**: scores ephemeral entries built from `getCommandPageCommands(context, parentPath)`. An empty child query returns all children in load order.
- `limit` caps results (default 40, validation max 200). Only the top-N entries are converted to `Suggestion`s; deep-search results carry `rankWeight`.
- `seq` (a monotonic client counter) and `query` are echoed back so the navigation slice can drop stale or out-of-order responses.

See [search-and-ranking.md](search-and-ranking.md) for the index, scoring tiers, and deep-search weighting/dedupe, and [command-types.md](command-types.md) for the underlying node families.

**`monocle-command-children-get`** — `getChildrenCommands` rebuilds the current page with `getCommandPageCommands(context, parentPath, searchValue)`, finds the target by `id`, and branches:

- Target is a `group`: returns `{ children, openPage: true, dynamicChildren: false }`.
- Target is a `search`: returns `{ children, openPage: true, dynamicChildren: true }` and forwards `searchValue` so dynamic results recompute.
- Target not found / not a container: returns `{ children: [] }`.

`children` are `Suggestion[]` produced by `commandsToSuggestions(targetPage.commands, context, parentName, inheritedPermissions)`. The `dynamicChildren` flag tells the navigation slice whether typing in the page should re-request children. See [palette-ui-and-navigation.md](palette-ui-and-navigation.md).

**`monocle-command-execute`** — `executeCommand` delegates to `executeCommand(id, context, formValues ?? {}, parentNames, executionScope)` from `background/commands` and returns `{ success: true }`. Permission checks, executor dispatch, and usage recording all happen inside that call. See [execution-and-actions.md](execution-and-actions.md). `formValues` is `Record<string, string | string[]>`; multi-value fields are normalized downstream.

**`monocle-site-sdk-sync`** — sent only by `content/siteSdkBridge.ts` after validating
page-world declarations from `window.Monocle`. The handler derives the SDK
scope from `sender.tab.id`, `sender.frameId`, `sender.documentId`, and the
message `context`; only top-frame senders are accepted. Successful sync updates
the in-memory site SDK registry and invalidates the search index. See
[site-sdk.md](site-sdk.md).

### Keybindings

**`monocle-keybinding-execute`** — `executeKeybinding` is the most stateful handler. It normalizes the stroke, maintains a per-scope `SequenceState` (chord buffer) keyed by `getSequenceScopeKey` (tab + document, or context-derived for new-tab/page), and uses an 800 ms `CHORD_TIMEOUT_MS`. Outcomes from `evaluateSequence`:

| Situation | Returned object |
| --- | --- |
| Exact executable match, no longer sequence possible | `{ success: true, executed: true }` (or `{ success: false, error }` on executor failure) |
| Exact open-page match | `{ success: true, executed: false, openPaletteAtCommand: { commandId } }` |
| Exact match but a longer chord exists | `{ success: true, executed: false, pending: true }` (schedules delayed single execution) |
| No exact match but a chord prefix matches | `{ success: true, executed: false, pending: true }` |
| Invalid stroke | `{ success: false, error: "Invalid keybinding: ..." }` |
| No registered command | `{ success: false, error: "No command registered for keybinding: ..." }` |
| Thrown error | `{ error: "Failed to execute keybinding" }` |

Note this handler is **not** wrapped by `createMessageHandler`; it has its own try/catch. Sequence state is global to the service worker, so concurrent tabs share the `sequenceStates` map (scoped by key). See [keybindings.md](keybindings.md).

**`monocle-keybinding-state-get`** — `getKeybindingState` returns `{ exactKeybindings, sequencePrefixes }` from the registry snapshot. The UI uses this to decide which key events to intercept before passing them to `monocle-keybinding-execute`.

**`monocle-keybinding-conflict-check`** — `checkKeybindingConflict` normalizes the proposed binding, loads all keybinding-capable command entries for the context, resolves the target command's keybinding behavior, and delegates to `evaluateKeybindingAssignment` (`background/keybindings/conflicts.ts`). Blocking conflicts carry `conflictType: "exact"` (another command holds the same canonical binding) or `conflictType: "shadowed-by-open-palette"` (the assignment puts an open-palette binding on a proper prefix of a sequence in either direction, which would make the sequence unreachable — open-palette matches execute immediately because the chord timer cannot deliver an open-palette response after the message channel closes). Non-blocking prefix overlaps between execute-behavior bindings are returned as `warnings: KeybindingConflictWarning[]` (the shared prefix only resolves after the chord timeout). The handler also validates the binding against the target command's `keybindingRequirements` (resolved by id, with a settings-catalog fallback) and returns `requirementViolation: { code, message }` when violated — a violation is not a conflict, so `hasConflict` stays false. `conflictType`, `warnings`, and `requirementViolation` are omitted when empty. Errors are swallowed and reported as no conflict. This handler is not wrapped by `createMessageHandler` either.

### Permissions

These four messages are the only ones the send hook does **not** attach `context` to (see `useSendMessage`):

- **`monocle-permissions-get`** — `getPermissions` calls `permissions.getAll()` and maps known permission names into a boolean `access` object (`activeTab`, `bookmarks`, `browsingData`, `contextualIdentities` (Firefox only), `cookies`, `downloads`, `history`, `sessions`, `storage`, `tabs`, `tabGroups` (Chrome only), `management`, `nativeMessaging`). On failure it throws (surfaced as `{ error }` by the cross-browser wrapper).
- **`monocle-permission-request`** — `requestPermission` calls `permissions.request` then `permissions.contains`, returning `RequestPermissionResponse` = `{ granted: boolean, error? }`.
- **`monocle-permission-grant-page-open`** — `openPermissionGrantPage` opens `/newtab.html?grantPermission=<permission>` in a new active tab so the prompt fires from a stable extension page; returns `{ success: true }`.
- **`monocle-host-permission-ensure`** — `ensureHostPermissionMessage` resolves a tab/url, requests a concrete optional http(s) origin when called from a user action, and injects `content-scripts/content.js` into the tab after a grant. It returns `{ granted, originPattern?, error? }`. This is separate from named permission requests and never broadens beyond the single current/destination origin.

Browser permission state is authoritative; Redux mirrors it. See [permissions.md](permissions.md).

### Settings

**`monocle-settings-update`** accepts a partial `theme` and/or `newTab` patch.
The handler routes each branch through the locked background settings writers,
deep-merging the nested clock/greeting fields and preserving the existing
`commands` document. It returns `{ success: true, theme, newTab }` with the
fresh persisted values. Redux theme/new-tab mutation thunks use this message;
they never write `monocle-settings` directly.

**`monocle-command-setting-update`** is a discriminated union on `setting`:

```ts
type UpdateKeybindingSettingMessage = {
  type: "monocle-command-setting-update"
  id: string
  setting: "keybinding"
  value?: string | null
  context?: Browser.Context
}

type UpdateUrlRulesSettingMessage = {
  type: "monocle-command-setting-update"
  id: string
  setting: "urlRules"
  value: CommandUrlRulesSetting
  context?: Browser.Context
}

type UpdateHiddenSettingMessage = {
  type: "monocle-command-setting-update"
  id: string
  setting: "hidden"
  value: boolean
  context?: Browser.Context
}
```

`updateCommandSetting` behavior:

- `setting: "keybinding"` — normalizes the value. Empty/invalid removes the stored keybinding and refreshes the registry. Otherwise it resolves the assignment target through `background/keybindings/assignmentTarget.ts` (live command first, settings-catalog fallback for context-only rows), rejects (`throw`) if the command does not allow keybindings, persists the keybinding, refreshes the registry, and emits a success `monocle-toast-show`.
- `setting: "urlRules"` — runs custom `validateUrlRulesSetting` (each field must be an array of valid URL patterns; invalid patterns `throw`), then writes through `background/commands/settingMutations.ts`, invalidating both the search index and keybinding-entry cache.
- `setting: "hidden"` — writes `commands[id].hidden` through the same mutation helper, refreshes the keybinding registry, and invalidates the search index. Hidden commands are removed from palette views/search, child pages, execution resolution, keybinding snapshots, and conflict checks.

Returns `{ success: true }`. See [settings.md](settings.md) and [url-filtering.md](url-filtering.md).

**`monocle-command-keybindings-update`** batches keybinding updates for template
application:

```ts
type UpdateCommandKeybindingsMessage = {
  type: "monocle-command-keybindings-update"
  updates: Array<{
    commandId: string
    keybinding?: string | null
  }>
  context?: Browser.Context
}
```

The handler validates every non-empty keybinding target before writing, skips
and reports conflicting updates (exact collisions, intra-batch duplicate claims
where the first claimant wins, open-palette prefix shadowing — reported
with `reason: "shadowed-by-open-palette"` — and per-command
`keybindingRequirements` violations, reported with
`reason: "requirement-not-met"` and no `conflictingCommand`), updates the
remaining command settings with one storage save, refreshes the keybinding
registry once, and returns `{ success: true, updated: number, conflicts }`. It
does **not** emit toasts; the per-command `monocle-command-setting-update` keybinding
path remains the toast-producing path for manual edits. Prefix-overlap
warnings are deliberately not reported on the batch path (sequence-heavy
templates would drown in them).

**`monocle-settings-catalog-get`** returns the options-page command catalog:

```ts
type GetSettingsCatalogMessage = {
  type: "monocle-settings-catalog-get"
  platform?: "chrome" | "firefox"
}
```

The response is `{ commands: SettingsCatalogCommand[] }`. Each row is durable
and settings-manageable: resolved display metadata, category, parent path,
effective settings, favorite state, usage stats, and capability flags. The
catalog unions normal and new-tab command sources and bypasses hidden/url-rule
filtering so hidden commands can be unhidden. Stable dynamic rows such as
bookmarks and Firefox container actions are included when their browser APIs are
available; volatile browser-state rows such as open tabs, history, downloads,
and recently closed sessions are omitted. Session site-SDK rows are also omitted
from the editable catalog.

**`monocle-command-favorite-set`** sets favorite state without going through generated
palette actions:

```ts
type SetCommandFavoriteMessage = {
  type: "monocle-command-favorite-set"
  id: string
  favorite: boolean
}
```

It writes the existing `monocle-favoriteCommandIds` key, invalidates the search
index, and returns `{ success: true }`.

### Workflows

**`monocle-workflow-execute`** (UI -> bg) carries `{ workflow, context, tabId? }`. `executeWorkflow` calls `executeWorkflowOnTargetTab` (`background/workflows/execution.ts`), which resolves the target tab in this priority order (`resolveWorkflowTargetTabId`):

1. Explicit `tabId` (must be a positive integer, else throws).
2. `sender.tab.id` / `sender.validationContext.senderTab`.
3. A tab whose URL matches `context.url` (throws for new-tab context, since a page workflow cannot run from the new-tab page).
4. The active tab.

It validates the workflow against `WorkflowSchema` before sending **`monocle-workflow-content-execute`** `{ workflow, context }` to that tab via typed `tabs.sendMessage`. The content listener in `useCommandPaletteStateRedux.tsx` validates the content message again, runs the injected workflow runner, and responds `{ result }`. The background unwraps it (`unwrapWorkflowResult`) and returns `{ result: WorkflowResult }`. On any thrown error the handler returns `{ result: { success: false, error } }`.

The full workflow step vocabulary is implemented and schema-accepted: every op in `shared/types/workflow.ts` (`click`, `wait`, `hover`, `focus`, `blur`, `fill`, `type`, `key`, `select`, `check`, `uncheck`, `submit`, `scroll`, `getText`, `removeElement`, `hideElement`, `injectCss`) has an executor case in `content/workflow/executor.ts` and a matching schema entry in `shared/types/workflowValidation.ts`. Unsupported ops fail loudly rather than succeeding silently (the lockstep invariant). See [workflow-automation.md](workflow-automation.md).

### Toasts

A single UI -> bg message, `monocle-toast-show`, is the toast request path for both UI surfaces and background command executors (the earlier `request-toast`/`show-toast` pair was redundant — `request-toast` only forwarded to `showToast` — and has been collapsed into one). Its handler (`showToast`) rate-limits duplicate `level:message` pairs within `RATE_LIMIT_WINDOW` (500 ms), then sends the distinct bg -> tab `monocle-toast` event to the active tab (errors on non-receiving tabs like `chrome://` pages are swallowed). It returns `{ success: true }` (and `{ success: true, rateLimited: true }` when suppressed). The `monocle-toast` event is received by `ToastContainer.tsx`.

### New Tab

**`monocle-unsplash-background-get`** — `getUnsplashBackground` reads the access key from `WXT_UNSPLASH_ACCESS_KEY` / `EXTENSION_PUBLIC_UNSPLASH_ACCESS_KEY` and fetches a random landscape photo. Response (`UnsplashBackgroundResponse`):

```ts
{ imageUrl, photographerName, photographerUrl, photoUrl, error? }
```

If the key is missing or the fetch fails, all string fields are empty and `error` is set. See [new-tab-and-theme.md](new-tab-and-theme.md).

### Features

Generic Feature-module messages (handler: `background/messages/features.ts`; see [features.md](features.md)):

- **`monocle-features-get`** → `{ features: FeatureDescriptor[] }` — data-only projection of every registered feature (schema + current config), for the options Features pages.
- **`monocle-feature-config-update`** `{ featureId, config }` → `{ success, config }` — validates `config` against the feature's Zod `configSchema`, persists it replace-whole to `monocle-feature-config`, then runs the feature's `onConfigChange` hook.
- **`monocle-feature-action-execute`** `{ featureId, actionId, context?, payload? }` → `{ success, feature? }` — runs a settings-page action button or `record-list` row action via the feature's `handleAction`. `payload` carries scalar row/action data (`itemId`, `childId`, `value`, etc.). The response includes the re-projected feature descriptor so the options page can refresh derived rows without a second request.

### Surfaces

The generic declarative-UI query (handler: `background/messages/surfaces.ts`; see [surfaces.md](surfaces.md)):

- **`monocle-surfaces-get`** `{ url }` → `{ surfaces: Surface[] }` — the `SurfaceHost` (content overlay + new tab) sends its URL and receives every surface whose `urlMatch` admits it and whose optional `targetTabId` matches the sender tab (each stamped with its `ownerId`); the host filters by kind locally. Surfaces are pushed into the store by features (e.g. Focus Mode), automations, and commands (e.g. the QR-code modal); this is the read side. Change notifications arrive via the `monocle-surfaces-changed` broadcast (below).
- **`monocle-surface-action`** `{ ownerId, surfaceId, actionId, value?, selection? }` → `{ success }` (handler: `background/messages/surfaceAction.ts`) — a user interaction reported by the host (e.g. dismissing a modal or a picker reporting a clicked element). The host captures the gesture; the background decides what it means. `dismiss` is universal (any surface → `removeSurface`); any other action routes to the owner — a feature's `handleAction`, or a command's handler registered via `background/commands/surfaceActionHandlers.ts` (the command-owner equivalent) — each receiving the sender tab and optional picker `selection` (which may carry the computed `css` the picker captured for the owner's requested properties). automation owner routing is still an explicit no-op.

## Send-Side Utilities

### `useSendMessage` (UI components)

`shared/hooks/useSendMessage.tsx` returns a `sendMessage(message, contextOverride?)` callback. It:

- Builds a base context `{ title: document.title, url: window.location.href, modifierKey: <current modifier> }` and shallow-merges `contextOverride`.
- Attaches `context` to every message **except** `monocle-permissions-get`, `monocle-permission-request`, `monocle-permission-grant-page-open`, and `monocle-host-permission-ensure`.
- Sends through the shared `sendRuntimeMessage` transport (`shared/utils/extension-api.ts`), which wraps `runtime.sendMessage` in a Promise; rejects with `runtime.lastError` if set, otherwise resolves with the raw response.

Its `SendableMessage` union covers only messages React components send directly and uses context-stripped variants (`Omit<..., "context">`) for command/keybinding messages because the hook supplies context. The current modifier key is tracked through a ref fed by `useIsModifierKeyPressed`, so modifier-aware execution (e.g. enter vs cmd-enter) reflects the live key state.

### `createPaletteSendMessage` (store)

`shared/store/sendMessage.ts` exports `createPaletteSendMessage(extraContext)`, a factory used by the palette stores. It attaches `{ title, url, modifierKey: null, ...extraContext }` as `context` to every message and sends through the same shared `sendRuntimeMessage` transport (`shared/utils/extension-api.ts`) with its `lastError` handling. New-tab stores pass `{ isNewTab: true }` as `extraContext`.

### Response And Error Shapes

There is no envelope type — responses are whatever the handler returns. Two conventions:

- **Success-flag handlers** return `{ success: true, ... }` (e.g. `monocle-command-execute`, `monocle-command-setting-update`, toasts).
- **Data handlers** return their data object directly (e.g. `monocle-commands-get`, `monocle-keybinding-state-get`).

Errors surface in three layered ways:

1. **Validation failure** (in `handleMessage`): `{ error: "Message validation failed: ...", validationIssues }`.
2. **`createMessageHandler` wrapper** (`background/utils/messages.ts`): handlers wrapped by `createMessageHandler` catch any throw and return `{ error: <customErrorMessage> }` — the static wrapper text, not the thrown error's message (the real error is logged background-side). Most routed message types use this. The exceptions are deliberate: `executeKeybinding`, `checkKeybindingConflict`, `executeWorkflow`, `requestPermission`, and `getUnsplashBackground` return domain-shaped fallbacks, while `getPermissions`, `openPermissionGrantPage`, `ensureHostPermissionMessage`, `showToast`, `updateCommandSetting`, and `updateCommandKeybindings` throw through to the cross-browser wrapper so callers receive the specific `error.message`.
3. **Cross-browser wrapper** (`createCrossBrowserMessageHandler`): a rejected handler promise resolves to `{ error: error.message }` on both Chrome and Firefox.

Callers must therefore check for `response.error` themselves; a rejected `sendMessage` Promise only happens for transport-level `lastError`, not for handler-returned `{ error }`.

## Background -> Tab Messaging

The background reaches a specific tab through `tabs.sendMessage`, never `runtime.sendMessage`:

- `background/utils/contentPalette.ts` (`toggleContentPalette`) sends `monocle-ui-toggle`. If no content script is present (`Could not establish connection` / `Receiving end does not exist`), it injects `content-scripts/content.js` via `scripting.executeScript`, then retries `monocle-ui-show` up to 5 times with a 75 ms delay. `The message port closed before a response was received` is treated as success (the listener fired but did not respond synchronously).
- `background/utils/runtime.ts` (`sendMessageToActiveTab`) is a generic helper that resolves the active tab and calls `sendTabMessage`.
- `background/messages/showToast.ts` and various command executors target the active tab with `monocle-toast`.
- `background/workflows/execution.ts` targets a resolved tab with `monocle-workflow-content-execute`.
- `background/commands/siteSdk/` targets the sender tab with
  `monocle-site-sdk-sync-request` and `monocle-site-sdk-invoke`; these are handled by the
  early isolated bridge in `content/siteSdkBridge.ts`, not by the React palette.
- `background/utils/browserTabs.ts` (`broadcastToAllTabs`) sends a message to
  every open tab, swallowing failures on tabs without a content script. The
  surfaces store uses it to broadcast `monocle-surfaces-changed` (no payload) so
  every `SurfaceHost` re-queries `monocle-surfaces-get`.

Content-side receivers are mounted through shared UI. `PageMessageListeners.tsx` owns the ambient clipboard, tab-open, scroll, screenshot, and text-insert listener set in both overlay and new-tab shells; the content shell additionally enables page focus tracking for insert-at-cursor. `useCommandPaletteStateRedux.tsx` handles palette control/workflow messages, `ToastContainer.tsx` handles `monocle-toast`, and `SurfaceHost.tsx` handles `monocle-surfaces-changed`. Each listener validates with `validateContentMessage` before acting, and all mounts live outside the palette-visibility gate.

## Adding A New Message Type End To End

1. **Define the request type** in `shared/types/messaging.ts`, add it to the `Message` union, and export any response interface there.
2. **Add a Zod schema** in `shared/types/validation.ts` and include it in the `MessageSchema` discriminated union — `validateIncomingMessage` rejects anything not in the union, so an unschema'd message can never reach a handler.
3. **Write the handler** in `background/messages/<name>.ts`. Wrap it with `createMessageHandler(handler, "Failed to ...")` unless you need bespoke error shaping (as `executeKeybinding`/`checkKeybindingConflict` do).
4. **Register it** in `background/messages/index.ts`: import the handler and add a `.with({ type: "<name>" }, ...)` arm to the `match` chain.
5. **Expose it to the UI** by adding the (optionally context-stripped) type to `SendableMessage` in `shared/hooks/useSendMessage.tsx`. Decide whether the message needs `context`; if not, add the type to the exclusion check in the hook.
6. **If it is a background -> tab message**, send it with `tabs.sendMessage` from the background and add a listener arm in the appropriate content-side component (`useCommandPaletteStateRedux.tsx`, `ToastContainer.tsx`, or a new listener), returning `true` for async responses.
7. **Account for both error layers**: callers should check `response?.error`; the handler should either throw (caught by the wrapper) or return an explicit error object.

## Known Issues / Notes

- The `Message` union in `shared/types/messaging.ts`, the `MessageSchema` discriminated union in `shared/types/validation.ts`, and the router enumerate the same message types. Compile-time twin assertions keep `Message` and `ValidatedMessage` equal, and the router's `.exhaustive()` makes a missing dispatch arm a type error. Note that `useSendMessage`'s `SendableMessage` union is deliberately narrower — it covers only messages React components send directly, using context-stripped command/keybinding/search variants. Everything else (workflow execution, batch keybinding updates, and automation, feature, surface, settings, and Unsplash messages) is sent by store thunks through `createPaletteSendMessage`, while `SiteSdkSyncMessage` is sent by `content/siteSdkBridge.ts`.
- Eleven handlers are not wrapped by `createMessageHandler` (see [Response And Error Shapes](#response-and-error-shapes)); the split is deliberate — wrapped handlers return a generic `{ error }`, unwrapped ones surface specific error text or a domain-shaped fallback.
- Keybinding sequence state is global to the service worker; multi-tab chord interactions can interfere. See [keybindings.md](keybindings.md).
- All user-facing command feedback goes through `monocle-toast` (rendered by `ToastContainer`). The background helpers `sendToastToActiveTab(level, message)` / `sendSuccessToastToActiveTab` / `sendErrorToastToActiveTab` (`background/utils/browserTabs.ts`) are the single path; the old receiver-less `monocle-alert` event has been removed. UI surfaces send messages through the shared `sendRuntimeMessage` / `sendRuntimeMessageSafe` transport (`shared/utils/extension-api.ts`) — the latter is fire-and-forget (resolves rather than rejects when the worker is unreachable).

## Manual Test Checklist

- Open the palette in both content overlay and new-tab modes and confirm `monocle-commands-get` populates favorites and suggestions, and that typing routes through `monocle-commands-search` (deep-search items appear inline in results).
- Navigate into a `group` and a `search` node; confirm `monocle-command-children-get` returns `openPage: true` and that `search` recomputes as you type (`dynamicChildren: true`); typing on a plain group page filters its children through `monocle-commands-search`.
- Execute a command with enter and with the modifier held; confirm the modifier reaches the background (visible in execution behavior / usage).
- Set, change, and clear a custom keybinding; confirm `monocle-keybinding-conflict-check` flags collisions and `monocle-command-setting-update` shows the success toast and refreshes the registry.
- Hide and unhide a command from the options Commands page; confirm `monocle-settings-catalog-get` still returns the hidden row while `monocle-commands-get`, `monocle-commands-search`, child pages, and keybinding conflict checks omit it.
- Trigger a permission-gated command in Chrome and Firefox; confirm `monocle-permission-request` / `monocle-permission-grant-page-open` flows and that `monocle-permissions-get` reflects the grant.
- Run a `click` workflow from a normal tab and confirm `monocle-workflow-execute` -> `monocle-workflow-content-execute` round-trips a `WorkflowResult`; confirm a new-tab-origin page workflow is rejected.
- Fire duplicate toasts within 500 ms and confirm rate limiting.

## Related Docs

- [architecture.md](architecture.md) — runtime modes, boundaries, and core data flows.
- [command-schema.md](command-schema.md) — `CommandNode` and `FormField` shapes referenced by command messages.
- [command-types.md](command-types.md) — the six node families behind `monocle-commands-get` / `monocle-command-children-get`.
- [execution-and-actions.md](execution-and-actions.md) — what `monocle-command-execute` does downstream.
- [keybindings.md](keybindings.md) — registry, sequences, and conflict semantics.
- [permissions.md](permissions.md) — grant flows behind the permission messages.
- [settings.md](settings.md) — persistence behind `monocle-command-setting-update`.
- [url-filtering.md](url-filtering.md) — `urlRules` validation and matching.
- [workflow-automation.md](workflow-automation.md) — workflow executor vs the type model.
- [new-tab-and-theme.md](new-tab-and-theme.md) — Unsplash background and new-tab listeners.
