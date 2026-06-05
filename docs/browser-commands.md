# Browser Commands

## Current Status

Status: working with unknowns.

The browser command category is the largest command surface. It includes tab,
window, bookmark, history, download, browsing-data, recently-closed, clipboard,
pin/mute, movement, and Firefox container/reader commands. The code compiles,
but most commands depend on browser APIs and optional permissions, so manual
browser verification is required.

## How It Is Hooked Together

- `background/commands/browser/index.ts` exports the Chrome/common browser
  command list.
- `background/commands/browser/firefox/index.ts` exports Firefox-only command
  additions.
- `background/commands/index.ts` adds common browser commands for all contexts
  and Firefox commands when `isFirefox` is true.
- `background/utils/browser.ts` wraps browser APIs such as tabs, windows,
  bookmarks, browsing data, downloads, history, and sessions.
- Optional-permission commands declare `permissions` on their command nodes.
  `commandsToSuggestions` carries those permissions into the UI.
- The UI checks permissions with `usePermissionsGranted`, and execution checks
  permissions again in the background before running protected commands.
- Dynamic groups such as bookmarks, open tabs, history, downloads, and recently
  closed generate children from browser API calls at navigation time.
- Groups such as open tabs and recently closed opt into `enableDeepSearch`.

Representative command areas:

- Tabs/windows: open, close, duplicate, move, pin, mute, reload, back/forward,
  focus tab, move current tab to another window or popup.
- Data/library: bookmarks, history, downloads, recently closed, current tab URL
  copying.
- Privacy/data clearing: clear browsing data by type and time period.
- Firefox: container tab commands and reader mode.

## Test Coverage

Automated test coverage: missing.

Build checks that currently touch this feature:

- `pnpm run tsc` validates command definitions and browser utility types.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm run build` validates bundling.

There are no browser integration tests for tab mutations, permission prompts,
bookmark/history/download queries, recently closed sessions, or Firefox-only
commands.

## Manual Test Checklist

- In Chrome, load the extension and execute simple tab commands: open new tab,
  reload current tab, duplicate current tab, close current tab.
- Execute window commands: open new window, open private window, move current
  tab to a new window.
- Execute pin/mute commands on a normal tab and confirm paired unpin/unmute
  behavior.
- Grant `tabs` permission and test open tabs, go to tab, copy tab URL, close
  tabs to left/right, and close other tabs.
- Grant `bookmarks` permission and test bookmark tree navigation and opening a
  bookmark.
- Grant `history` permission and test history groups and opening a history item.
- Grant `downloads` permission and test recent downloads, open download, and
  show download.
- Grant `sessions` permission and test recently closed tabs/windows.
- Test clear browsing data with a safe narrow option before broad options such
  as all-time/all-data.
- In Firefox, test container tab commands and reader mode separately.
- Confirm permission-denied states show a clear action path rather than empty
  or broken command pages.

## Code Review Notes

- The browser utility wrapper is a useful boundary, but it is broad. It mixes
  API compatibility helpers with domain-specific commands for bookmarks,
  browsing data, downloads, history, and sessions. Future work should avoid
  continuing to grow this file without extracting feature-specific browser API
  helpers.
- Permission handling is intentionally defensive: dynamic API readers often
  return empty arrays when permission is missing, while execution also checks
  permission before running. This avoids crashes but can hide the difference
  between "no data" and "permission missing" on some child pages.
- `allCommands` is context-free, so command-management UIs built from it do not
  include new-tab-only commands and currently do not include website commands.
- Dynamic commands use generated ids and often opt out of custom keybindings.
  That is the right default because browser data changes over time.
- Clear browsing data commands should be treated as higher risk. They need
  confirmation coverage and manual checks because browser behavior varies by
  platform and data type.
- Firefox-specific behavior needs real Firefox validation. TypeScript passing is
  not enough for APIs such as contextual identities and reader mode.

