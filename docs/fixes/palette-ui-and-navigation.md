# Palette UI And Navigation Fix Plan

Status: implemented for the shared palette/navigation contract fixes. Manual
content-overlay and new-tab browser validation is still required.

## Implemented Fixes

- Encoded the supported action-menu matrix for action, submit, search, and
  group rows through shared palette helpers.
- Search and group generated primary actions now route back through navigation
  instead of background no-op execution.
- Dynamic search results now carry typed `Suggestion.executionPayload` data,
  and dynamic child execution uses page execution scope instead of parsing URLs
  from descriptions.
- Dynamic search pages clear stale children on empty search, and refresh
  responses are guarded by request id plus page search value.
- Browser context validation allows untitled pages while still requiring a
  string URL.
- Dead closed-shadow `shadowRoot` theme access was removed from
  `ContentCommandPalette.tsx`; theme application stays on the content host in
  `entrypoints/content.tsx`.

## Remaining Gaps

- CMDK search restoration and content/new-tab visual behavior still need manual
  browser smoke checks.
- DOM component tests are still not present; the added coverage is focused on
  pure palette helpers, Redux navigation, message validation, and form helpers.

## Current Data Flow

Content mode mounts a closed-shadow overlay from `entrypoints/content.tsx` and
renders `ContentCommandPaletteWithState`. New-tab mode mounts
`NewTabCommandPalette` from the new-tab app. Both surfaces use
`CommandPalette`, `useCommandNavigation`, and
`shared/store/slices/navigation.slice.ts`.

The palette fetches root `CommandData`, stores it as the root navigation page,
pushes child pages after `get-children-commands`, stores inline form values on
the current page, and executes leaf suggestions through the background
`execute-command` path.

## Boundaries And Contracts

- Shared palette components must work in both content shadow DOM and new-tab
  normal DOM.
- UI owns rendering, navigation state, inline form values, and action-menu
  interaction. It must not own privileged browser behavior.
- Background owns command resolution and execution.
- CMDK search state and Redux search state must remain synchronized across
  navigation, Escape, Backspace, dynamic search refreshes, and page refreshes.
- Dynamic search results need an explicit data contract; the UI must not infer
  execution payloads from display-only fields such as descriptions.

## Confirmed Gaps

- Action-menu support is inconsistent by suggestion type. `commandsToSuggestions`
  creates actions for submit and search nodes, but the UI exposes action menus
  only for action and group rows in key places.
- Dynamic search pages can retain stale children after the search value is
  cleared because the refresh effect skips empty search values.
- Dynamic search selection is coupled to the selected child's `description`
  being an HTTP URL. The UI executes the parent search command and passes
  `dynamicUrl` only when the child description looks like a URL.
- Runtime message context validation rejects empty titles, while content mode
  builds context from `document.title`. Untitled pages can fail otherwise valid
  palette messages.
- The content palette attempts to use `shadowHost.shadowRoot`, but the content
  root is closed. The effective content theme path is the host-class storage
  listener in `entrypoints/content.tsx`.
- Navigation and CMDK synchronization rely on direct DOM writes, which makes
  search restoration and request races fragile.

## Required Fixes

- Decide and encode the supported action-menu matrix:
  - Action rows: executable actions are supported.
  - Submit rows: generated actions are supported if submit commands can be
    favorited, hidden, or assigned custom keybindings.
  - Search rows: either expose generated actions consistently or stop generating
    them.
  - Group rows: open/favorite/hide actions remain supported.
- Align `commandsToSuggestions`, `CommandFooter`, `CommandActions`, and
  command-item handling with that matrix.
- Make dynamic search clearing explicit. When a dynamic page search value is
  empty, clear child suggestions or request an empty result from the background.
- Replace `description`-as-URL dynamic execution with a typed field in
  `Suggestion` or a dedicated `SearchCommandNode` result contract.
- Relax `BrowserContextSchema` to allow empty titles where browser pages allow
  them, while still validating that context has a string `url` and title.
- Remove dead closed-shadow theme access from `ContentCommandPalette.tsx` or
  route it through a host-element helper that works with a closed shadow root.
- Add request ordering or cancellation guards for dynamic child refreshes so
  slower search responses cannot overwrite newer ones.

## Required Tests

- Redux navigation tests for pushing a child page, navigating back, preserving
  previous search state, and restoring focus.
- Tests for Backspace on empty nested search and Escape behavior on root vs
  child pages.
- Tests proving dynamic search results clear when the search is emptied.
- Tests for dynamic search request races: older responses must not overwrite
  newer search results.
- Component tests for action-menu exposure on action, submit, search, and group
  rows based on the chosen matrix.
- Tests for inline form default values, value updates, validation, and submit
  execution payloads.
- Message validation tests for untitled pages and new-tab contexts.
- Manual checks in both content overlay and new-tab mode after any shared
  palette change.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New navigation, dynamic search, action-menu, and context-validation tests
  pass.
- Manual smoke: content overlay opens and closes on a normal page and untitled
  page; new-tab palette stays focused; nested navigation, inline inputs, action
  menus, Escape, Backspace, and dynamic search all behave consistently.
