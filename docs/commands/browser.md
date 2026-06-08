# Browser Commands Catalog

The browser command category is the largest command surface in Monocle. It wraps the privileged `chrome`/`browser` extension APIs (tabs, windows, bookmarks, history, downloads, sessions, browsing data, navigation, plus Firefox contextual identities and reader mode) as `CommandNode` values. Every command lives in `background/commands/browser/`, is exported from `background/commands/browser/index.ts` as `browserCommands`, and is loaded for all UI contexts by `background/commands/source.ts`. Firefox-only additions live in `background/commands/browser/firefox/`, are exported as `firefoxCommands`, and are appended only when the runtime is Firefox. All privileged calls go through the helper barrel `background/utils/browser.ts` (re-exporting feature-specific helpers such as `background/utils/browserTabs.ts`).

This doc is a catalog. For the schema behind each field see [../command-schema.md](../command-schema.md); for node-type semantics see [../command-types.md](../command-types.md); for how children/permissions/actions resolve at runtime see [../execution-and-actions.md](../execution-and-actions.md), [../permissions.md](../permissions.md), and [../search-and-ranking.md](../search-and-ranking.md).

## How these commands are loaded

- `background/commands/browser/index.ts` exports `browserCommands` (the common Chrome + Firefox list) and re-exports `firefoxCommands`.
- `background/commands/source.ts` spreads `browserCommands` into the command set for every context, then pushes `firefoxCommands` when the resolved `platform === "firefox"` (via `getPlatform`). A final `supportsPlatform` filter also drops any command whose `supportedBrowsers` excludes the current platform.
- Optional-permission commands declare `permissions` on the command node. Parent permissions are inherited by generated child rows and by direct child execution (verified in `background/commands/browser-commands.test.ts`, "carries inherited permissions on generated bookmark, tab, history, download, and session rows").
- Permission-protected dynamic groups surface a "Permission Required" path before their browser API loader runs when the real browser permission is missing; the background re-checks permissions at execution time so stale Redux state cannot bypass them.
- Dynamic groups generate children from live browser API calls at navigation time. Empty/error states return NoOp/display rows via `createNoOpCommand` (`background/utils/commands.ts`) rather than throwing or showing blank pages.

## High-risk keybinding policy

Commands with `confirmAction: true` are never registered in the global keybinding registry and never offered a custom keybinding. `allowsKeybinding` in `background/utils/commands.ts` returns `false` when `command.confirmAction === true` (and also when `allowCustomKeybinding === false`). Note that `close-current-tab` (`<cmd-w>`) and `close-current-window` (`<cmd-shift-w>`) declare both a default `keybinding` and `confirmAction: true` — the declared default is effectively inert because `allowsKeybinding` short-circuits on `confirmAction`, so these will not fire from the registry. Many dynamic rows (`goto-tab`, history, downloads, sessions) also set `allowCustomKeybinding: false` because their ids change over time. Note this is not uniform: `open-tabs` and `copy-tab-url` rows have dynamic ids but do **not** set `allowCustomKeybinding: false`.

## Summary table

| Command id | Name | Type | Permissions | Default keybinding | Browsers | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `bookmarks` | Bookmarks | group | `bookmarks` | — | all | Deep search; recursive folder tree |
| `capture-screenshot` | Capture screenshot | action | — | — | all | Visible-area `captureVisibleTab` (activeTab). Enter → copy to clipboard; Cmd → download. Page-side via `monocle-screenshot` |
| `clear-browser-data` | Clear Browser Data | group | `browsingData`, `history`, `cookies`, `sessions` | — | all | 11 data types × 5 time spans; leaf actions `confirmAction` |
| `close-current-tab` | Close current tab | action | — | `<cmd-w>` (inert) | all | `confirmAction`; keybinding suppressed |
| `close-current-window` | Close current window | action | — | `<cmd-shift-w>` (inert) | all | `confirmAction`; keybinding suppressed |
| `close-duplicate-tabs` | Close duplicate tabs | action | `tabs` | — | all | `confirmAction`; closes duplicate-URL tabs across all windows, keeping one per URL (prefers pinned, then active, then current window); never closes pinned tabs |
| `close-other-tabs` | Close other tabs | action | `tabs` | — | all | `confirmAction`; closes all non-active tabs in window |
| `close-tabs-to-left` | Close tabs to the left | action | `tabs` | — | all | `confirmAction` |
| `close-tabs-to-right` | Close tabs to the right | action | `tabs` | — | all | `confirmAction` |
| `copyCurrentTabUrl` | Copy current tab URL | group | — | — | all | 3 child variants with per-child keybindings |
| `copy-tab-url` | Copy tab URL | group | `tabs` | — | all | One child per open tab in current window |
| `downloads` | Downloads | group | `downloads` | — | all | Up to 50 recent completed downloads |
| `duplicate-current-tab` | Duplicate current tab | action | — | — | all | Modifier labels: shift / cmd |
| `go-back` | Go Back | action | — | `<alt-left>` | all | Dynamic name; heuristic availability |
| `go-forward` | Go Forward | action | — | `<alt-right>` | all | Dynamic name; heuristic availability |
| `goto-tab` | Go to tab | group | `tabs` | — | all | One child per tab in current window |
| `history` | History | group | `history` | — | all | Time-period subgroups; deep search |
| `move-current-tab-to-a-new-window` | Move this tab to a new window | action | `tabs` | — | all | |
| `move-current-tab-to-popup-window` | Move current tab to popup window | action | `tabs` | — | all | |
| `move-tab-left` | Move tab left | action | — | — | all | Wraps to end at index 0 |
| `move-tab-right` | Move tab right | action | — | — | all | Wraps to start at last index |
| `open-new-private-window` | Open new private window | action | — | `<cmd-shift-n>` | all | `incognito: true` |
| `open-new-tab` | Open new tab | action | — | `<cmd-t>` | all | Modifier label: shift |
| `open-new-window` | Open new window | action | — | `<cmd-n>` | all | |
| `open-tabs` | Open Tabs | group | `tabs` | — | all | All windows; deep search; rich modifiers |
| `recently-closed` | Recently Closed | group | `sessions` | — | all | Closed tabs and windows; deep search |
| `reload-current-tab` | Reload current tab | action | — | `<cmd-r>` | all | Cmd modifier action: hard reload (bypass cache) |
| `reopen-last-closed-tab` | Reopen Last Closed Tab | action | `sessions` | — | all | Most recent closed tab only |
| `scroll-to-top` | Scroll to top | action | — | — | all | Sends `monocle-scroll` to active tab; smooth scroll |
| `scroll-to-bottom` | Scroll to bottom | action | — | — | all | Sends `monocle-scroll` to active tab; smooth scroll |
| `toggle-mute-current-tab` | Mute / Unmute current tab | action | — | — | all | State-aware label/icon from `mutedInfo.muted` |
| `toggle-pin-current-tab` | Pin / Unpin current tab | action | — | — | all | State-aware label/icon from `pinned` |
| `open-container-tab` | Open container tab | group | `contextualIdentities`, `cookies` | — | firefox | Per-container children |
| `open-current-tab-in-container` | Open current tab in container | group | `tabs`, `contextualIdentities`, `cookies` | — | firefox | Reopens current URL, closes original |
| `toggle-reader-mode` | Toggle Reader Mode | action | — | `<alt-cmd-R>` | firefox | |

"Browsers: all" means the command is in `browserCommands` with no `supportedBrowsers` restriction. The browser command files do not declare `urlRules`; none of these are URL-scoped.

## Tab management

### `open-new-tab` (action)
Opens a blank tab via `createTab`. Default label "New tab →". With the **shift** modifier the label becomes "New tab ←". Index logic: when `modifierKey === "cmd"` the tab is created at index `0` (far left); otherwise the default position. Keybinding `<cmd-t>`.

```ts
export const openNewTab: CommandNode = {
  type: "action",
  id: "open-new-tab",
  keybinding: "<cmd-t>",
  actionLabel: "New tab →",
  modifierActionLabel: { shift: "New tab ←" },
  execute: async (context) => {
    await createTab({ index: context?.modifierKey === "cmd" ? 0 : undefined })
  },
}
```

### `duplicate-current-tab` (action)
Duplicates the active tab. Prefers the native `tabs.duplicate` API (preserves history); falls back to `tabs.create` with the same URL when unavailable. Modifier labels: **shift** "Duplicate to left" (moves the duplicate to index 0), **cmd** "Duplicate in background" (keeps the original active). Emits success/error toasts.

### `close-current-tab` (action)
Closes the active tab in the current window (`queryTabs({active, currentWindow}) → removeTab`). `confirmAction: true`. Declares `<cmd-w>` but the keybinding is suppressed by the high-risk policy.

### `close-duplicate-tabs` (action)
Closes tabs that share a URL with another tab, keeping exactly one tab per unique URL. Looks across **all** windows (`queryTabs({})`), since a duplicate is a duplicate regardless of window. To choose which tab in each URL group to keep, it sorts candidates by a keeper score — pinned (highest), then active, then in the user's current window (so it doesn't favour a background window just because its per-window `index` is lower) — and keeps the first one seen. Pinned tabs are never closed, even when they duplicate another tab. Requires `tabs`. `confirmAction: true`. Toasts the count closed.

### `close-other-tabs` (action)
Closes every tab in the current window except the active tab. It does **not** spare pinned tabs — it only checks `tab.id !== activeTab.id`. Requires `tabs`. `confirmAction: true`. Toasts the count closed.

### `close-tabs-to-left` / `close-tabs-to-right` (actions)
Close tabs whose `index` is `< activeTab.index` (left) or `> activeTab.index` (right). Requires `tabs`. Both `confirmAction: true`. No pinned-tab exception.

### `move-tab-left` / `move-tab-right` (actions)
Move the active tab one position via `tabs.move`. Wrap-around: moving left from index 0 jumps to the last index ("Tab moved to end"); moving right from the last index jumps to 0 ("Tab moved to beginning"). No permission declared.

### `toggle-pin-current-tab` (action)
A single state-aware command (modelled on `toggle-theme` / `toggle-clock-visibility`). Reads the active tab's `pinned` flag to render the label ("Pin current tab" vs "Unpin current tab") and icon (`Pin` vs `PinOff`), then flips `pinned` via `updateTab`. Success toast reflects the resulting state.

### `toggle-mute-current-tab` (action)
A single state-aware command. Mute state is **read** from `mutedInfo.muted` (the browser-API shape) but **set** via `updateTab({ muted })`. Renders "Mute current tab"/"Unmute current tab" with `VolumeX`/`Volume2` icons accordingly. Success toast reflects the resulting state.

### `reload-current-tab` (action)
On plain Enter, `callBrowserAPI("tabs", "reload")` with no tab id (reloads the active tab). Keybinding `<cmd-r>`. Declares `modifierActionLabel.cmd = "Hard reload (bypass cache)"`; the Cmd modifier action resolves the active tab and calls `callBrowserAPI("tabs", "reload", tabId, { bypassCache: true })` (tab id passed explicitly so the reloadProperties object is correct in both Chrome and Firefox).

### `capture-screenshot` (action)
Captures the visible area of the active tab. The background first sends a `hide-ui` message and awaits its acknowledgement so the palette overlay is painted out **before** the capture (otherwise `captureVisibleTab` would include the palette); the content `useCommandPaletteStateRedux` handler hides the palette and acks after two `requestAnimationFrame`s. The send is best-effort — surfaces without that handler (e.g. the new tab page) simply don't respond. It then resolves the active tab and calls `captureVisibleTab(windowId)` (`callBrowserAPI("tabs", "captureVisibleTab", windowId, { format: "png" })`), which relies on the `activeTab` permission (always granted when the palette is invoked) — no `downloads` permission is required. Finally it sends a `monocle-screenshot` event to the active tab; the page-side `ScreenshotListener` converts the PNG data URL to a Blob (without `fetch`, so a page CSP can't block it) and either writes it to the clipboard via `navigator.clipboard.write([new ClipboardItem(...)])` or triggers a blob-URL `<a download>`, then a success toast confirms the result. `ScreenshotListener` is mounted alongside `ToastContainer` (always mounted, outside the palette-visibility gate) so it still receives the event after the palette hides. Declares `actionLabel = "Copy to clipboard"` and `modifierActionLabel.cmd = "Download"`: plain Enter copies to the clipboard; Cmd downloads to the browser's downloads folder with filename `screenshot-<host>-<timestamp>.png`. The clipboard path requires a secure context (https) and document focus.

### `goto-tab` (group, `tabs`)
Lists one child action per tab in the **current window** (`queryTabs({currentWindow})`, filtered to tabs with a title). Each child's name resolves to the tab title and its icon resolves via `getFaviconIcon`. Executing a child activates the tab (`updateTab({active:true})`) and focuses its window. Children set `allowCustomKeybinding: false`. No explicit empty-state row (an empty window simply yields no children).

### `open-tabs` (group, `tabs`)
Lists tabs across **all windows** (`queryTabs({})`). `enableDeepSearch: true`. Structure:

- Single window: tab rows directly, sorted by tab index.
- Multiple windows: one subgroup per window named "Current Window (N tabs)" / "Other Window (N tabs)" with `WindowMaximize`/`Window` icons; selecting it lists that window's tabs.

Each tab row uses `dedupeKey` from `normalizeUrlForDedupe(url)`, a state-aware favicon fallback (pinned/audible/muted), and a `ts-pattern` color (active→green, pinned→blue, audible→orange, else gray). Default action "Go to Tab". Modifier actions: **cmd** "Duplicate Tab", **shift** "Close Tab", **alt** "Pin/Unpin Tab". Empty state: `no-open-tabs` NoOp row; errors: `tabs-error` NoOp row.

## Window management

### `open-new-window` (action)
`createWindow({})`. Keybinding `<cmd-n>`.

### `open-new-private-window` (action)
`createWindow({ incognito: true })`. Keybinding `<cmd-shift-n>`. (Requires the extension to be allowed in incognito; not a declared optional permission.)

### `close-current-window` (action)
`getCurrentWindow → removeWindow`. `confirmAction: true`. Declares `<cmd-shift-w>` but the keybinding is suppressed by the high-risk policy.

### `move-current-tab-to-a-new-window` (action, `tabs`)
Moves the active tab into a brand-new focused window via `createWindow({ tabId, focused: true })`.

### `move-current-tab-to-popup-window` (action, `tabs`)
Same as above but `createWindow({ tabId, type: "popup" })` (popup window chrome, not focused).

## Navigation

### `go-back` / `go-forward` (actions)
`callBrowserAPI("tabs", "goBack"|"goForward", tabId)`. Chrome has no API to read navigation availability, so both use a heuristic: back is "available" unless the URL is a new-tab/extension page; forward additionally excludes `chrome://` and `about:` URLs. The command **name is dynamic** — "Go Back"/"No Back History" and "Go Forward"/"No Forward History". When unavailable, execution shows an info alert instead of navigating. Keybindings `<alt-left>` / `<alt-right>`.

## Data library groups

### `bookmarks` (group, `bookmarks`)
Reads the full tree via `getBookmarkTree` and recursively flattens it (`processBookmarkNode`). `enableDeepSearch: true`. Behavior:

- Folders become nested `group` nodes (`bookmark-folder-<id>`, Folder icon, amber) whose children are produced lazily.
- Bookmarks with a valid HTTP/HTTPS URL (`isValidUrl`) become `action` nodes (`bookmark-<id>`) with a favicon icon and `dedupeKey` from the normalized URL.
- Separators are skipped; untyped nodes with children are recursed (Chrome compatibility).

Bookmark action label "Open"; modifier **cmd** "Open in New Tab". Default execution uses `focusOrGoToUrl` (switch to an existing tab with that URL, else navigate the current tab); cmd opens via a `monocle-newTab` content message. Empty tree → `no-bookmarks` NoOp; error → `bookmarks-error` NoOp. Top-level results are sorted alphabetically.

### `history` (group, `history`)
Two-level group. The top group lists five fixed time-period subgroups built by `createTimePeriodCommands`: Today, Yesterday, Last Week, Last Month, Older. `enableDeepSearch: true` on the top group; the subgroups set `enableDeepSearch: period.deepSearch ? undefined : false`, so Today and Yesterday leave it undefined (inherit/no explicit setting) while Last Week, Last Month, and Older set `enableDeepSearch: false`.

Selecting a period calls `getHistoryItems({ text:"", startTime, endTime, maxResults:100 })`, sorts newest-first, and renders one `history-<id>` action per item with favicon, `dedupeKey`, and description "`url • visitTime`". Action label "Open"; modifier **cmd** "Open in New Tab" (same `focusOrGoToUrl` vs new-tab behavior as bookmarks). Children set `allowCustomKeybinding: false`. Empty/error states render `no-history-<period>` / `history-error-<period>` NoOp rows.

### `downloads` (group, `downloads`)
`getRecentDownloads(50)`, filtered to items that are `complete` and have a filename. Each `download-<id>` action shows the basename, a size/time description (`formatFileSize`, `formatDownloadTime`), and an icon chosen by MIME type then file extension (`getFileTypeIcon`). Action label "Show in Finder"; executing calls `showDownload(id)` (reveals in the OS file manager) and alerts on failure. Children set `allowCustomKeybinding: false`. Empty → `no-downloads` NoOp; error → `downloads-error` NoOp. Note: rows are sorted alphabetically by name despite the "newest first" comment.

### `recently-closed` (group, `sessions`)
`getRecentlyClosed()` returns sessions that are either a closed tab or a closed window. `enableDeepSearch: true`.

- Closed tab → `restore-tab-<sessionId>` action, label "Restore Tab", favicon icon, description "`url • Closed Xago`", `dedupeKey` from the URL.
- Closed window → `restore-window-<sessionId>` action, label "Restore Window", Monitor icon, named after the first tab, description "Window with N tabs • Closed Xago".

Executing either calls `restoreSession(sessionId)` and alerts success/failure. Children set `allowCustomKeybinding: false`. Empty → `no-recently-closed` NoOp; error → `sessions-error` NoOp. Sorting is alphabetical (the code comments acknowledge it cannot sort by timestamp here).

### `reopen-last-closed-tab` (action, `sessions`)
Convenience action that reads `getRecentlyClosed()`, finds the first session with a `.tab`, and restores it. Shows an info alert when there are no closed tabs (or only closed windows). Action label "Reopen".

## Clipboard / URL utilities

### `copyCurrentTabUrl` (group, no permission)
Static group of three copy variants for the active tab, each with its own keybinding:

| Child id | Name | Keybinding | Copies |
| --- | --- | --- | --- |
| `copyCurrentTabUrl-copy-url` | Copy URL | `enter` | Full `tab.url` |
| `copyCurrentTabUrl-copy-url-no-params` | Copy URL without parameters | `<cmd-enter>` | `protocol//host/pathname` |
| `copyCurrentTabUrl-copy-domain` | Copy domain only | `<cmd-shift-enter>` | `url.hostname` |

Copying is delegated to the active tab via a `monocle-copyToClipboard` content message (the content script owns clipboard access), followed by a `monocle-toast`. URL parsing failures fall back to copying the raw URL. Because the children are static action ids, their per-child keybindings are registrable.

### `copy-tab-url` (group, `tabs`)
Lists one `copy-tab-url-<id>` action per tab in the current window (filtered to titled tabs), each named after the tab title with a resolved favicon. Executing copies that tab's URL via the active tab's clipboard message and toasts.

## Clear browser data

### `clear-browser-data` (group, `browsingData` + `history` + `cookies` + `sessions`)
Three-level destructive group. The top group lists 11 data types; each data type is itself a group listing five time spans; each time span is an `action` that calls the matching clear helper.

Data types (id → clear helper): `all`→`clearAllBrowserData`, `cookies`→`clearCookies`, `history`→`clearHistory`, `cache`→`clearCache`, `downloads`→`clearDownloads`, `form-data`→`clearFormData`, `local-storage`→`clearLocalStorage`, `indexed-db`→`clearIndexedDB`, `service-workers`→`clearServiceWorkers`, `passwords`→`clearPasswords`, `plugin-data`→`clearPluginData`.

Time spans → `startTime` passed to the clear function:

| Time span id | Label | startTime |
| --- | --- | --- |
| `5-mins` | Last 5 Minutes | `now − 5m` |
| `30-mins` | Last 30 Minutes | `now − 30m` |
| `60-mins` | Last Hour | `now − 60m` |
| `today` | Today | midnight today (`minutes: null`) |
| `all-time` | All Time | `0` (everything) |

Every leaf action sets `confirmAction: true`, so the palette requires confirmation and none of them are keybindable. Success/error toasts are emitted (`background/commands/browser-commands.test.ts` asserts the "Last 5 Minutes" leaf has `confirmAction === true`).

## Firefox-specific commands

Loaded only when the resolved platform is Firefox. All declare `supportedBrowsers: ["firefox"]` and live under `background/commands/browser/firefox/`. Container commands use `queryContainers` / `createTab({ cookieStoreId })` from `background/utils/firefox.ts`.

### `open-container-tab` (group, `contextualIdentities` + `cookies`)
Lists one child per contextual identity from `queryContainers({})`. Each child is named after the container, colored from its `colorCode` (with `toolbar`→gray and default→lightBlue normalization) and icon-ed from `container.iconUrl`. Action label "New tab →"; modifier **cmd** "New tab ←" (creates at index 0). Executing calls `createTab({ cookieStoreId, index })`. Firefox requires the `cookies` permission (in addition to `contextualIdentities`) to pass `cookieStoreId` to `tabs.create`; without it the group surfaces a "Permission Required" grant row. On query failure it returns an empty array (no NoOp row).

### `open-current-tab-in-container` (group, `tabs` + `contextualIdentities` + `cookies`)
Same container listing, but executing reopens the **current tab's URL** in the chosen container (`createTab({ url, cookieStoreId })`) and then closes the original tab (`removeTab(currentTab.id)`). On query failure returns an empty array.

### `toggle-reader-mode` (action, no extra permission)
Calls `toggleReaderMode(tabId)` from `background/utils/firefox.ts` against the active tab. Keybinding `<alt-cmd-R>`. Alerts success, or "Reader Mode not available for this page" on failure.

## Known issues / review notes

- `downloads` and `recently-closed` sort alphabetically even though comments imply newest-first; timestamp data is not threaded through to the sort.
- `go-back` / `go-forward` availability is heuristic (URL-pattern based), not a true navigation-state check, so the dynamic name can be wrong.
- `close-current-tab` and `close-current-window` declare default keybindings that never fire because of the `confirmAction` policy; the declarations are misleading.
- Container commands swallow query errors into empty arrays rather than emitting a NoOp/permission row.

## Manual test checklist

Carried forward from the prior docs baseline, verified against current code:

- Chrome: open new tab, reload, duplicate, close current tab.
- Window commands: new window, private window, move current tab to a new window / popup window.
- Pin/mute and their paired unpin/unmute.
- Grant `tabs` and test open tabs, go to tab, copy tab URL, close tabs left/right, close other tabs (confirm pinned tabs are also closed — that is the current behavior).
- Grant `bookmarks` and walk the folder tree, open a bookmark with and without cmd.
- Grant `history` and open items inside the time-period subgroups.
- Grant `downloads` and use "Show in Finder".
- Grant `sessions` and restore a closed tab and a closed window; test `reopen-last-closed-tab`.
- Clear browsing data with a narrow option before any all-time/all-data option; confirm the confirmation prompt appears and the action is not keybindable.
- Firefox: container tab commands and reader mode (require real Firefox; TypeScript passing is insufficient for contextual identities and reader mode).
- Confirm permission-denied groups show a clear grant path rather than blank/broken pages.

## Related docs

- [../command-types.md](../command-types.md) — action vs group semantics
- [../command-schema.md](../command-schema.md) — field reference (`permissions`, `modifierActionLabel`, `confirmAction`, `dedupeKey`, `enableDeepSearch`)
- [../permissions.md](../permissions.md) — optional permission grant flow and inheritance
- [../execution-and-actions.md](../execution-and-actions.md) — enter vs modifier-enter, action labels
- [../keybindings.md](../keybindings.md) — canonical key format and the high-risk policy
- [../search-and-ranking.md](../search-and-ranking.md) — deep search and `dedupeKey`
- [new-tab.md](./new-tab.md), [tools.md](./tools.md), [ui.md](./ui.md), [websites.md](./websites.md) — sibling catalogs
