# Browser Commands Fix Plan

Status: implemented for the background/browser-command permission, keybinding,
utility-boundary, and mocked tab/window behavior issues. Manual Chrome/Firefox
browser validation is still required.

## Current Data Flow

Browser command definitions live under `background/commands/browser/`.
Common browser commands are exported from `background/commands/browser/index.ts`;
Firefox-only commands are exported from `background/commands/browser/firefox/`.
`background/commands/source.ts` loads the browser command set and appends Firefox
commands when the runtime is Firefox.

Dynamic browser groups call the stable helper barrel in
`background/utils/browser.ts`, which now re-exports feature-specific browser API
helpers for tabs, windows, bookmarks, history, downloads, sessions, and browsing
data. Optional permissions are declared on parent command nodes and checked in
the UI and background before execution.

## Boundaries And Contracts

- Privileged browser APIs must stay in background utilities or background
  commands.
- Parent commands that require optional permissions must not expose child
  execution paths that bypass those permissions.
- Missing permission is a different state from an empty browser data set.
- Dynamic browser data should generally opt out of custom keybindings because
  ids and availability change over time.
- Destructive commands, especially tab/window close and browsing-data clearing,
  must preserve explicit confirmation behavior across UI and keybinding paths.

## Implemented Fixes

- Inherited permissions now flow through command page lookup, direct recursive
  lookup, generated child suggestions, favorites, and deep-search suggestions.
- Permission-protected dynamic groups return an explicit "Permission Required"
  display row before protected browser API child loaders are called.
- Low-level bookmark, download, history, and session readers no longer convert
  missing permissions or API failures into empty arrays.
- The misleading `Open Developer Tools` stub was removed from the command set.
- Confirmed commands are excluded from keybinding registration and do not expose
  custom keybinding actions. Palette confirmation metadata is preserved for
  destructive browser commands.
- `background/utils/browser.ts` was split into feature-specific browser API
  helper modules while preserving its existing public export surface.
- Representative tab/window command behavior tests now cover open, close,
  duplicate, move, pin, mute, reload, back, forward, and window-moving paths.

## Remaining Gaps

- Firefox-specific commands compile, but container identities and reader mode
  still need manual browser validation.
- Real browser integration coverage is still missing for permission prompts and
  cross-browser API behavior.

## Original Required Fixes

- Add inherited permission enforcement to recursive command lookup/execution,
  or stamp generated child nodes with their parent permissions when they are
  created. Implemented.
- Make dynamic group loaders return explicit permission-required display rows
  or metadata before calling browser APIs when permissions are missing.
  Implemented.
- Update browser utilities so low-level readers do not silently hide missing
  permissions from callers that need to render permission UI. Implemented.
- Decide the `Open Developer Tools` policy:
  - Replace it with a supported action if browser APIs can perform it.
  - Or rename/document it as a debug/stub command and remove misleading action
    labels.
  - Or remove it from the command set. Implemented by removal.
- Add a high-risk command policy for destructive browser commands. Confirmed
  actions must not run directly from keybindings without an equivalent
  confirmation flow. Implemented by excluding confirmed commands from
  keybinding registration.
- Split `background/utils/browser.ts` over time into feature-specific browser
  API helpers once tests pin current behavior. Implemented.

## Added Tests

- `background/commands/browser-commands.test.ts` covers inherited permission
  checks on generated bookmark, tab, history, download, and session child
  commands.
- Tests prove missing optional permissions render a permission state rather than
  empty data rows and do not call the protected browser API loader.
- Tests cover stale permission state: permission present while the child page is
  loaded, then revoked in the browser before execution is attempted.
- Tests cover confirmed-command keybinding exclusion and clearing-data
  confirmation metadata/start-time calculation.
- `background/commands/browser-tab-window-commands.test.ts` covers
  representative tab/window command behavior with mocked browser APIs: open,
  close, duplicate, move, pin, mute, reload, back, forward, and moving the
  current tab into regular/popup windows.

## Remaining Tests

- Manual Chrome checks for tabs, windows, bookmarks, history, downloads,
  sessions, copy URL, and browsing-data commands.
- Manual Firefox checks for container tab commands and reader mode.

Original requested coverage:

- Unit tests for inherited permission checks on generated bookmark, tab,
  history, download, and session child commands.
- Tests proving missing optional permissions render a grant/permission state
  rather than empty data rows.
- Tests for stale permission state: permission was present in Redux, revoked in
  the browser, then execution is attempted.
- Tests for tab/window command behaviors with mocked browser APIs:
  open, close, duplicate, move, pin, mute, reload, back, and forward.
- Tests for clear browsing data start-time calculation and confirmation
  metadata.
- Manual Chrome checks for tabs, windows, bookmarks, history, downloads,
  sessions, copy URL, and browsing-data commands.
- Manual Firefox checks for container tab commands and reader mode.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New browser-command and permission-inheritance tests pass.
- Manual smoke: permission-protected dynamic groups show a permission path when
  missing, show real data after grant, and do not execute generated children
  after the underlying browser permission is revoked.
