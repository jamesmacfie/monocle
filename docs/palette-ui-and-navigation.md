# Palette UI and Navigation

Monocle renders a VS Code / Raycast-style command palette in two surfaces — a
content-script overlay injected into webpages (inside a closed shadow DOM) and a
new-tab page replacement. Both surfaces mount the **same** shared React
components under `shared/components/Command/`, drive navigation through the
**same** Redux `navigation` slice, and execute commands through the same typed
background messages. They differ almost entirely in two dimensions: visibility
(the overlay toggles open/closed; the new-tab palette is always mounted) and
context (`{ isNewTab: true }` is attached to new-tab command fetches and
executions). This document covers the component tree, the navigation model, the
inline-input/form system, palette keyboard semantics, the fragile CMDK↔Redux
search synchronization, surface-specific wiring, and error/toast rendering.

## Component Tree

The palette is composed from these components (all under
`shared/components/Command/` unless noted):

| Component | File | Responsibility |
| --- | --- | --- |
| `CommandPalette` | `CommandPalette.tsx` | Top-level shell. Owns the action-menu state and the keybinding-refresh callback. Wraps everything in CMDK's `<Command shouldFilter={false}>` — filtering and ranking are background-owned (see [search-and-ranking.md](./search-and-ranking.md)); CMDK only renders lists and handles keyboard navigation. |
| `CommandContent` | `CommandPalette.tsx` (local) | Inner body: reads CMDK focused value, resolves the focused `Suggestion` (from favorites, suggestions, or the page's `searchResults`), runs the palette keyboard handler, and renders header/list/footer. |
| `CommandHeader` | `CommandHeader.tsx` | Back-chevron (when not on root), `Command.Input`, dynamic placeholder, and the Raycast top-shine/loader chrome. |
| `CommandList` | `CommandList.tsx` | Explicit render logic: `Favorites`/`Suggestions` groups for the empty state, a flat `Results` group from `searchResults` while searching, the form-page search bypass, and the empty/loading states. Owns typing-debounce and scroll-to-top behavior. |
| `CommandItem` | `CommandItem/index.tsx` | Per-row dispatcher (memoized with `React.memo`). Chooses the variant component based on `suggestion.type` (and `inputField.type` for inputs). Holds the stable `value={suggestion.id}` and manages confirmation state. |
| `CommandFooter` | `CommandFooter.tsx` | Parent breadcrumb (icon + name), primary action button (Enter), and the `Actions` (Alt) button when the focused row supports a menu. |
| `CommandName` | `CommandName.tsx` | Renders a command name, the `parent > child` array form, and a red "Missing permissions" suffix. Exports `getDisplayName`. |
| `CommandActions` | `CommandActions.tsx` | The secondary action menu (covered in [execution-and-actions.md](./execution-and-actions.md)). |
| `CommandNavigationError` | `../CommandNavigationError.tsx` | Inline dismissible error banner above the palette. |
| `ToastContainer` / `Toast` | `../ToastContainer.tsx`, `../Toast.tsx` | Transient runtime toasts driven by `monocle-toast` runtime messages. |

### CommandItem variant selection

`CommandItem` is the single dispatch point. It selects a variant with a
`ts-pattern` `match(suggestion.type)`:

| `suggestion.type` | `inputField.type` | Rendered variant | Notes |
| --- | --- | --- | --- |
| `input` | `text` | `CommandItemInput` | Text field with JSON-schema validation dot. |
| `input` | `select` | `CommandItemSelect` | Native `<select>`; Left/Right cycle options. |
| `input` | `checkbox` / `switch` | `CommandItemSwitch` | On/Off toggle button (`role="switch"`). |
| `input` | `multi` | `CommandItemMulti` | Multi-select chips; Left/Right move focus, Enter/Space toggles. |
| `input` | `color` | `CommandItemColor` | Swatch button opening a hidden native color picker. |
| `input` | `text-list` | `CommandItemTextList` | **Early-returned** before the `match` — renders multiple `Command.Item` rows (one per list entry). |
| `submit` | — | `CommandItemSubmit` | Focusable submit `<button>`; validates the page form before `onSelect`. |
| `display` | — | `CommandItemDisplay` | Static row. Meta label is the literal string `Todo`. Non-executable. |
| `action`, `group`, `search` | — | `CommandItemAction` (the `.otherwise` branch) | Icon, favorite star, name, optional `KeybindingDisplay`, and a meta label (`Group` for groups, otherwise `Command`). |

`CommandItem` always renders an outer `Command.Item` with `value={suggestion.id}`
(stable id so focus/selection logic keyed on ids keeps working). With
`shouldFilter={false}` no match keywords are passed — the background scores
queries against its own index. The `text-list` variant is the exception: it
renders its own `Command.Item` per row with values `"<suggestion.id>__<index>"`.

#### Confirmation rows

For `action`/`submit` suggestions with `confirmAction === true`, `CommandItem`
shows a two-step confirm: the first `onSelect` flips local state to render the
name as `"Are you sure?"`; the second executes. Confirmation auto-resets when
the row loses CMDK focus (`focusedValue !== suggestion.id`).

#### Permission gating

`CommandItem.handleSelect` checks `usePermissionsGranted(suggestion.permissions)`
and, if not all granted, fires an error toast ("Permissions required. Check the
action menu to give these") instead of executing. `CommandName` additionally
renders the missing-permission list inline. See [permissions.md](./permissions.md).

## Navigation Model

State lives in `shared/store/slices/navigation.slice.ts`. The palette is a stack
of **pages**, and the current page is always the last element.

### Page shape

```ts
type Page = {
  id: string                       // "root" for the root page, else the parent command id
  commands: { favorites: Suggestion[]; suggestions: Suggestion[] }
  searchValue: string
  parent?: Suggestion              // the command whose children this page shows (breadcrumb)
  parentPath: string[]             // chain of parent command ids used by the background to locate children
  formValues?: Record<string, string | string[]>  // inline input values for this page
  dynamicChildren?: boolean        // page children are driven by the search input
  searchResults?: Suggestion[]     // background search-commands results for searchValue
  searchLoading?: boolean          // a search-commands request is in flight
  searchSeq?: number               // last applied search sequence number (staleness guard)
}
```

`NavigationState` also holds `initialCommands` (root favorites/suggestions),
`loading`, `error`, and `refreshRequest` (the in-flight dynamic-refresh request
id used for race-protection).

### Reducers and thunks worth knowing

Synchronous reducers (`navigationSlice.actions`):

| Action | Effect |
| --- | --- |
| `setInitialCommands(commands)` | Replaces `initialCommands` and rewrites the root page's `commands`. This is how root favorites/suggestions refresh without resetting the stack. |
| `updateSearchValue(string)` | Sets `searchValue` on the current page. Clearing the value also clears `searchResults`/`searchLoading` so the non-search rendering restores instantly. For `dynamicChildren` pages, when the trimmed value is empty it **also clears** `commands` to `{ favorites: [], suggestions: [] }` so stale search results disappear immediately. |
| `clearSearchResults()` | Drops the current page's `searchResults` and `searchLoading` (dispatched by the hook when the query empties). |
| `navigateBack()` | Pops the current page. No-op on root (`pages.length <= 1`). |
| `setFormValue({ fieldId, value })` | Writes an inline form value on the current page. `value` may be a `string` or `string[]`. |
| `addPage(page)` | Pushes a page. The navigate thunk's fulfilled case pushes directly (`state.pages.push`) rather than via this action; `addPage` is currently exercised only by tests. |
| `clearError()` | Clears `error`. |

Async thunks:

- **`navigateToCommand({ id, currentPage })`** — sends
  `get-children-commands` with the computed `parentPath`. A new page is pushed
  when the response has `openPage === true` or a non-empty `children` array. The
  new page starts with `searchValue: ""`, child suggestions in `suggestions`
  (child pages never inherit favorites), `formValues` seeded by
  `computeDefaultFormValues`, and `dynamicChildren` mirrored from the response.
- **`refreshCurrentPage({ currentPage })`** — re-fetches the current child
  page's children (root is a no-op; refreshed via `setInitialCommands` instead).
  For dynamic pages with an empty search it returns empty commands while
  preserving current `formValues`. Otherwise it merges fresh input defaults
  under existing form values (`{ ...defaults, ...currentValues }`).
- **`searchCurrentPage({ pageId, parentPath, query, seq })`** — sends
  `search-commands` (root pages send `parentPath: []`). The fulfilled reducer
  writes `searchResults` onto the current page only when the page id still
  matches, the echoed `seq` is not older than the last applied one, and the
  echoed `query` still equals the page's `searchValue`. Failures stop the
  spinner and keep prior results.

#### Dynamic-search race protection

`refreshCurrentPage.pending` stamps `state.refreshRequest` with the thunk's
`requestId`, the page id, and the search value. The `fulfilled` reducer ignores
any response whose `requestId` no longer matches the latest pending request, or
whose page id / search value has changed since dispatch. This prevents a slow
response for an older query from overwriting newer results — verified by tests in
`navigation.slice.test.ts`.

### useCommandNavigation (imperative wrapper)

`shared/hooks/useCommandNavigation.tsx` is the imperative API the palette
consumes. It subscribes to the slice selectors and exposes:

| Method | Behavior |
| --- | --- |
| `updateSearchValue(search)` | Dispatches `updateSearchValue`, unless the `ignoreSearchUpdate` ref is set (programmatic CMDK writes). |
| `navigateTo(id)` | Guarded by `loading`; dispatches `navigateToCommand`, then clears the CMDK input on success. |
| `navigateBack()` | Pops the page **and** restores the previous page's `searchValue` into the CMDK input via direct DOM write, re-focusing and selecting the text. |
| `selectCommand(id)` | The central select handler (below). |
| `refreshCurrentPage()` | Re-fetches child page commands. |
| `clearError()` | Dispatches `clearError`. |

`selectCommand` resolves the suggestion (searching favorites, suggestions, and
the page's `searchResults` via `findCommandInPage`) and branches:

- `input` / `display` → no-op (non-executable).
- `action` with `executionContext.type === "setKeybinding"` → dispatch
  `startCapture(targetCommandId)` and stop (begins keybinding capture, not normal
  execution).
- `group` / `search` → `navigateTo(id)` (push a child page).
- everything else → build a request via `buildCommandExecutionRequest` and call
  the surface's `executeCommand`. See [execution-and-actions.md](./execution-and-actions.md).

The hook also runs two debounced effects keyed on the Redux `searchValue`:

- a **250 ms refresh** for pages with `dynamicChildren`, re-fetching children as
  the search value changes — this is how `search` command pages stream results;
- a **200 ms `searchCurrentPage` dispatch** for every other page with a
  non-empty query (root and child group pages), tagged with a monotonic `seq`
  from a `useRef` counter. Form pages (any `input`/`submit` suggestion on the
  page) are excluded — they bypass search entirely. An emptied query dispatches
  `clearSearchResults` immediately instead.

## CMDK ↔ Redux Search Synchronization (fragile)

CMDK keeps its own internal search string. Monocle keeps the authoritative value
in Redux per page. Keeping the two aligned requires **direct DOM manipulation**
of the `input[cmdk-input]` element, gated behind an `ignoreSearchUpdate` ref so
the programmatic writes don't get persisted back as user edits.

Two effects/handlers in `useCommandNavigation` do this:

1. **Page change** — when `currentPage.id` changes and the input's value differs
   from the page's `searchValue`, it sets `ignoreSearchUpdate = true`, writes
   `inputElement.value`, and dispatches a synthetic `input` event so CMDK
   re-reads it.
2. **navigateBack** — after popping, it restores the previous page's
   `searchValue` to the input on the next tick (`setTimeout(…, 0)`), refocuses,
   and selects the restored text for easy editing.

`_clearAndResetSearch` does the same dance to blank the input when navigating
into a child page. `CommandList` independently scrolls the list to top whenever
the page's `searchValue` changes and shows a spinner while typing (250 ms,
matching the search debounce) or while `searchLoading` is set, to avoid a flash
of "No results". Because the background-search dispatch is keyed on the *Redux*
`searchValue` (not CMDK's internal string), the programmatic DOM pokes cannot
trigger spurious searches — `ignoreSearchUpdate` filters them before Redux.

> This sync is the most fragile part of the UI. Any change to navigation,
> Escape/Backspace handling, or search restoration needs manual regression
> checks in both surfaces.

## CommandList Render Logic

With `shouldFilter={false}`, `CommandList` decides explicitly what to render:

- **Root or child page, empty query** — `Favorites` + `Suggestions` groups from
  `page.commands` (the child case has only `Suggestions`).
- **Root or child group page, non-empty query** — a single flat `Results` group
  from `page.searchResults` (background-ranked; deep-search matches arrive
  inline). See [search-and-ranking.md](./search-and-ranking.md).
- **Form pages** (any `input` or `submit` suggestion present) — search is
  bypassed and all rows always render, so typing in the palette input can never
  hide form fields. Display rows alone do not trigger the bypass.
- **`search`-type pages** (`dynamicChildren`) — results stream through
  `commands.suggestions` via `get-children-commands`, unchanged.
- **Empty/loading** — `Command.Empty` (which only renders when no items are
  mounted) shows a spinner while loading/typing, else "No results" when a query
  is present.

## Inline Inputs and Forms

Input nodes render as ordinary list rows but contain a focusable form control.
Typed values are stored in the current page's `formValues` map keyed by the
field id, written through `setFormValue`. Most fields store **strings**; `multi`
and `text-list` store **string arrays**. The background normalizes these for
older executors (see [command-schema.md](./command-schema.md)).

### Focus management

`CommandItem` focuses the inner control when the row becomes the CMDK focused
value: text inputs and selects get `.focus()`, submit rows focus their button.
`text-list` focuses the row matching `"<id>__<index>"`.

### Shared inline keyboard rules — `useInlineInputKeys`

`shared/hooks/useInlineInputKeys.ts` centralizes the interaction contract every
input variant follows via `handleCommonKeys`:

| Key | Behavior inside an inline input |
| --- | --- |
| `ArrowUp` / `ArrowDown` | `preventDefault` + `stopPropagation`, then forward a synthetic event to the CMDK search input so list navigation still works. ArrowUp on the first selectable item focuses the search input instead. |
| `Escape` | Focus the search input (does not close the palette from inside an input). |
| `Backspace` | `stopPropagation` only — prevents bubbling to the shell so it never triggers `navigate-back` while editing text. |

Variant-specific keys layered on top: `select` uses Left/Right to cycle options;
`multi` uses Left/Right to move chip focus and Enter/Space to toggle; `color` and
`switch` use Enter/Space to activate; `text` and `select` call `onSubmit` on
Enter (which validates and submits the page's first `submit` command). The
`text-list` variant adds Backspace-on-empty-row to delete that row and Up/Down to
move between rows.

### Submitting a form

`CommandItemSubmit` and `CommandList.handleInputSubmit` both validate before
submitting: they collect input fields via `collectInputFieldsFromSuggestions`,
run `validateFormValues` against the page `formValues`, toast
"Form is invalid. Check inputs." on failure, and otherwise call `onSelect` for
the first `submit` suggestion on the page. Per-field validity is shown live by a
`validation-dot` driven by `validateWithJsonSchema`.

## Palette Keyboard Semantics

Shell-level keys are decided by a pure function,
`shared/components/Command/paletteKeyboard.ts` `getPaletteKeyboardCommand`, which
returns one of `open-actions | navigate-back | close | none`:

| Condition | Result |
| --- | --- |
| Action menu open (`isActionsOpen`) | `none` — shell ignores keys; the menu owns them. |
| `Alt` and focused row supports a menu (`canOpenActionMenu`) | `open-actions` |
| `Escape` and `pageCount > 1` | `navigate-back` |
| `Escape` and on root | `close` |
| `Backspace` and empty search and `pageCount > 1` | `navigate-back` |
| otherwise | `none` |

`CommandContent.handleKeyDown` reads the live input value from
`input[cmdk-input]`, calls this function, and maps the result to
`onOpenActions` / `navigateBack` / `close`. Decisions are covered by
`paletteKeyboard.test.ts`. Note the key distinction: **Backspace only pops when
the search box is empty** — otherwise it falls through to normal text deletion.
Arrow navigation itself is handled by CMDK; inline inputs forward arrows back to
CMDK as described above.

The action menu does not close on every focus change blindly: `CommandContent`
closes it when the focused value changes away from the row it was opened for (or
focus is lost), but `CommandPalette.handleCloseActions` keeps it open while a
keybinding capture is active (`selectIsCapturing`) unless forced.

## Palette Open/Close State

`shared/store/slices/commandPaletteState.slice.ts` holds a single boolean
`isOpen` with `showUI` / `hideUI` / `toggleUI` reducers and a `selectIsOpen`
selector. `shared/hooks/useCommandPaletteStateRedux.tsx` wraps it and also:

- Installs a **capture-phase** `keydown` listener on `window` that toggles the
  palette on `Cmd/Ctrl+Shift+K` (`event.stopImmediatePropagation` so the page
  never sees it).
- While the palette is open, swallows lone alphabetic keypresses
  (`/^[a-zA-Z]$/`) via `stopImmediatePropagation` so host-page keyboard handlers
  don't fire underneath the overlay.
- Listens for background runtime messages `toggle-ui`, `show-ui`, and
  `execute-workflow-content` (the last forwards to `workflowExecutor`).

This hook is used by the **content overlay**; the new-tab palette does not gate
on `isOpen` (it is always mounted).

## Surface Differences

### Content overlay

Mounting chain: `entrypoints/content.tsx` defines the WXT content script
(`matches: ["<all_urls>"]`, `cssInjectionMode: "ui"`) and creates a **closed**
shadow-root UI (`mode: "closed"`) anchored to `body`, with host id
`extension-root`. `content/scripts.tsx` `renderContentCommandPalette` mounts
`ContentCommandPaletteWithState` into the shadow container, wrapping content in a
`content_script raycast` div.

- **Store creation**: `ContentCommandPaletteWithState` builds a per-overlay
  Redux store with `createAppStore(createPaletteSendMessage())`, so navigation
  thunks have a `sendMessage` available.
- **Visibility**: `ContentCommandPalette` renders the palette only when
  `isOpen`. It also renders a full-screen `command-palette-overlay` div whose
  `onClick` closes the palette. Pressing Escape on root closes; executing a
  command with `navigateBack` true calls `hideUI()`.
- **Theme isolation**: theme is applied to the **shadow host** element in
  `entrypoints/content.tsx` via `applyThemeToHost`, reacting to
  `monocle-settings` storage changes. React components inside the closed shadow
  root cannot read `shadowHost.shadowRoot`. See [new-tab-and-theme.md](./new-tab-and-theme.md).
- **Command freshness**: commands are re-fetched whenever the palette closes
  (`!isOpen`) so the next open is current.
- **Focus trapping**: there is no explicit focus trap; the overlay relies on the
  closed shadow DOM plus the capture-phase key swallowing described above.

### New-tab mode

`newtab/components/NewTabCommandPalette.tsx` is always rendered (no `isOpen`
gate). It fetches commands with `useGetCommands({ isNewTab: true })` and executes
with `sendMessage(message, { isNewTab: true })`, so new-tab-only commands and
context appear. `autoFocus` is supported (`CommandPalette` focuses the input
after a 100 ms delay when set, to let the new-tab DOM settle). Execution only
calls `onClose` when one is supplied — by default the new-tab palette stays
mounted after a command runs (unlike the overlay, which closes). After certain
executions (`id.includes("clock")`/`"settings"`) it reloads settings into Redux.

## Error and Toast Rendering

- **Navigation errors**: `CommandPalette` renders `CommandNavigationError` above
  the CMDK root whenever `navigation.error` is set (e.g. a failed
  `get-children-commands`). It is a dismissible banner styled with theme error
  tokens; `clearError` removes it.
- **Toasts**: `ToastContainer` (rendered in the content overlay; the new-tab app
  renders its own where applicable) listens for `monocle-toast` runtime messages
  and stacks `Toast` components top-right. Each `Toast` auto-dismisses after its
  duration (`ToastContainer` uses `5000` ms; `Toast` defaults to `3000`),
  animating in and out. Levels are `info | warning | success | error` with
  matching icon and theme-token styling. Because toasts are driven by runtime
  messages, they render inside whichever DOM (shadow or new-tab) hosts the
  container.

## Known Issues / Review Notes

- `CommandPalette.tsx` carries several concerns at once: action-menu state,
  keybinding-refresh handling, and the execute callback. Workable, but a good
  candidate for splitting if it grows.
- Search synchronization relies on direct DOM writes against `input[cmdk-input]`
  with an `ignoreSearchUpdate` ref. This is the most fragile area; treat any
  navigation/Escape/Backspace/search-restoration change as needing manual checks.
- Inline keyboard behavior is split between `CommandItem.onInlineInputKeyDown`,
  `useInlineInputKeys.handleCommonKeys`, and per-variant handlers. New input
  types must follow the same interaction contract.
- The closed shadow root is good for page isolation but harder to debug; theme
  must be applied via the host element, not from inside React.
- `ContentCommandPaletteWithState` builds context that may not carry the same
  modifier as direct execution; navigation thunks using the store-provided sender
  can differ from `useSendMessage`'s modifier tracking.
- `CommandItemDisplay` still shows a literal `Todo` meta label.

## Manual Test Checklist

- Open a normal webpage, press `Cmd/Ctrl+Shift+K`, confirm the overlay opens
  above page content; click the backdrop and confirm it closes.
- On root, press Escape and confirm the overlay closes; on a child page, confirm
  Escape navigates back instead.
- Enter a group, type a search, navigate back, and confirm the parent page's
  search is restored and selected (and re-runs the background search once, not
  repeatedly).
- Type on root and confirm a flat Results group replaces Favorites/Suggestions;
  clear the query and confirm the empty state restores instantly.
- On a form page, type into the palette input and confirm all form fields stay
  visible.
- Confirm Backspace pops only when the nested search box is empty (and deletes
  text otherwise).
- Open a group with inline inputs, edit text/select/switch/multi/color/text-list
  values, and execute a submit; confirm validation dots and the invalid-form
  toast.
- Open the action menu with Alt on action/submit/search/group rows; confirm it
  closes when focus moves and stays open during keybinding capture.
- Open a `search` command and confirm dynamic results stream in and clear when
  the search empties; verify a slow older query cannot overwrite newer results.
- Open the new-tab page and confirm the palette is visible and focused without
  any toggle; confirm it stays mounted after running a command.
- Verify theme class changes apply in both the content shadow DOM and new-tab DOM.
- Trigger a `monocle-toast` (e.g. a permission-denied select) and confirm the
  toast stacks and auto-dismisses in both surfaces.

## Related docs

- [architecture.md](./architecture.md) — runtime modes, boundaries, data flows.
- [command-types.md](./command-types.md) — the six node types rendered as rows.
- [command-schema.md](./command-schema.md) — `FormField` variants and value shapes.
- [execution-and-actions.md](./execution-and-actions.md) — selection, Enter vs Alt, action menu.
- [search-and-ranking.md](./search-and-ranking.md) — keywords, filter weighting, deep search.
- [keybindings.md](./keybindings.md) — capture, sequences, the palette shortcut.
- [permissions.md](./permissions.md) — permission gating and missing-permission UI.
- [new-tab-and-theme.md](./new-tab-and-theme.md) — new-tab mode and theme application.
