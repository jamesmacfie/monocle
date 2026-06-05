# Palette UI And Navigation

## Current Status

Status: working with review notes.

Monocle has two palette surfaces: a content-script overlay on webpages and a
new-tab page. Both use the shared command palette components under
`shared/components/Command/`, the same command-fetching hook, and the same
Redux-backed navigation model.

## How It Is Hooked Together

- `entrypoints/content.tsx` defines the WXT content script, creates a closed
  shadow DOM host, injects the content CSS through WXT, and mounts
  `ContentCommandPaletteWithState` through `content/scripts.tsx`.
- `background/utils/contentPalette.ts` handles toolbar and browser shortcut
  toggles. Chrome declares the shortcut as `_execute_action`. Firefox does not
  declare `Cmd+Shift+K` as a browser command because Firefox can consume the
  assigned shortcut without reliably delivering the command path in WXT MV3
  dev mode; Firefox content tabs use the content-side keyboard capture instead.
  The toolbar/action path first messages the active tab, then injects WXT's
  generated content script and shows the palette if the tab has no receiver yet.
- `wxt.config.ts` keeps Firefox's MV3 manifest CSP-valid in dev mode while
  allowing WXT's localhost dev server connection. Firefox content tabs rely on
  WXT's runtime content-script registration in dev and manifest registration in
  production builds, so content-bundle dependencies must avoid `eval`/`Function`
  usage that Firefox blocks under extension CSP.
- `content/components/ContentCommandPaletteWithState.tsx` creates the Redux
  store for the content overlay and supplies background messaging to thunks.
- `content/components/ContentCommandPalette.tsx` controls overlay visibility,
  fetches commands, loads settings and permissions, wires global keybindings,
  and renders the shared `CommandPalette`.
- `entrypoints/newtab/index.html`, `entrypoints/newtab/main.tsx`,
  `newtab/scripts.tsx`, and `newtab/NewTabApp.tsx` mount the new-tab app.
  `newtab/components/NewTabCommandPalette.tsx` renders the shared palette with
  `{ isNewTab: true }` context.
- `shared/components/Command/CommandPalette.tsx` is the main shared shell. It
  owns action-menu state and delegates page navigation to
  `useCommandNavigation`.
- `shared/store/slices/navigation.slice.ts` owns the page stack, current search
  values, loading/errors, dynamic child pages, and inline form values.
- `shared/hooks/useCommandNavigation.tsx` wraps the Redux slice with the
  imperative API the palette needs: navigate, back, select, refresh, and update
  search.
- `shared/components/Command/CommandList.tsx` renders favorites, suggestions,
  and deep-search items using CMDK.
- `shared/components/Command/CommandItem/*` renders each suggestion type,
  including text, select, switch, color, multi, text-list, submit, display, and
  action rows.

The main UI data flow is:

1. Palette fetches `CommandData` from the background.
2. The navigation slice stores root commands as page `root`.
3. Selecting a group/search command requests children from the background.
4. A new page is pushed with child suggestions and default form values.
5. Selecting an action/submit command sends the id and form values for
   execution.
6. Generated actions open in a secondary action menu and route through the same
   execution path or through keybinding capture.

## Test Coverage

Automated test coverage: missing.

Build checks that currently touch this feature:

- `pnpm run tsc` validates React, Redux, and type contracts.
- `pnpm run fmt:check` checks formatting/lint.
- `pnpm run build` validates that content and new-tab bundles compile.

There are no component tests for navigation stack behavior, inline inputs,
action menus, search restoration, deep search rendering, or content/new-tab
differences.

## Manual Test Checklist

- Open a normal webpage and press `Cmd+Shift+K`; confirm the overlay opens
  above page content.
- Click outside the palette and confirm it closes.
- Press Escape on root and confirm the content overlay closes.
- Open a group command, type a search, press Escape, and confirm search state is
  restored when navigating back.
- Open a group with inline inputs, edit values, and execute a submit command.
- Confirm Backspace on an empty nested search navigates back.
- Open the action menu with Alt on a focused action and confirm it closes when
  focus changes.
- Open the new-tab page and confirm the palette is visible/focused without
  using the overlay.
- Confirm content mode closes after normal command execution while new-tab mode
  stays available unless a closeable wrapper is provided.
- Verify theme class changes apply in content shadow DOM and new-tab DOM.

## Code Review Notes

- The shared palette architecture is the right high-level shape. Content mode
  and new-tab mode differ mostly in context and visibility, while rendering and
  navigation are shared.
- `CommandPalette.tsx` still carries several responsibilities: CMDK filtering,
  action menu state, keybinding refresh handling, deep search plumbing, and
  command execution callbacks. It is workable, but future UI changes should
  consider splitting action-menu state and filtering helpers into smaller units.
- Search synchronization uses direct DOM writes to keep CMDK state aligned with
  Redux. That is understandable with CMDK, but it is fragile and needs manual
  regression checks around navigation and back behavior.
- Inline input keyboard behavior is split between item-level handlers and
  individual input components. The existing pattern works, but any new input
  type should follow the same interaction rules.
- The content script uses a closed shadow root. This is good for page isolation
  but makes debugging harder and means theme application must go through the
  host element carefully.
- `ContentCommandPaletteWithState` creates context with `modifierKey: null`,
  while `useSendMessage` tracks the actual modifier. Navigation thunks that use
  the store-provided sender may not receive the same modifier context as direct
  command execution.
