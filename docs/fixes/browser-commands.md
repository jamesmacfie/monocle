# Browser Commands Fix Plan

## Current Data Flow

Browser command definitions live under `background/commands/browser/`.
Common browser commands are exported from `background/commands/browser/index.ts`;
Firefox-only commands are exported from `background/commands/browser/firefox/`.
`background/commands/index.ts` loads the browser command set and appends Firefox
commands when the runtime is Firefox.

Dynamic browser groups call helpers in `background/utils/browser.ts` to read or
mutate tabs, windows, bookmarks, history, downloads, sessions, and browsing
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

## Confirmed Gaps

- Parent permissions are not inherited during child execution. The background
  execution path checks only the resolved child command's own `permissions`,
  but generated children such as bookmark items and open-tab actions often have
  no permission metadata.
- Dynamic utility readers return empty arrays when permissions are missing.
  This can collapse "permission missing" into "No bookmarks found",
  "No downloads found", or similar empty states.
- `Open Developer Tools` is URL-filtered to local pages, but currently logs the
  tab id instead of opening DevTools or performing a user-visible action.
- Firefox-specific commands compile, but container identities and reader mode
  need manual browser validation.
- Clear browsing data commands are high-risk and rely on manual confirmation
  through the palette UI; keybinding execution needs separate protection.

## Required Fixes

- Add inherited permission enforcement to recursive command lookup/execution,
  or stamp generated child nodes with their parent permissions when they are
  created.
- Make dynamic group loaders return explicit permission-required display rows
  or metadata before calling browser APIs when permissions are missing.
- Update browser utilities so low-level readers do not silently hide missing
  permissions from callers that need to render permission UI.
- Decide the `Open Developer Tools` policy:
  - Replace it with a supported action if browser APIs can perform it.
  - Or rename/document it as a debug/stub command and remove misleading action
    labels.
  - Or remove it from the command set.
- Add a high-risk command policy for destructive browser commands. Confirmed
  actions must not run directly from keybindings without an equivalent
  confirmation flow.
- Split `background/utils/browser.ts` over time into feature-specific browser
  API helpers once tests pin current behavior.

## Required Tests

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
