# Vim-Style Browser Shortcuts

Status: Proposal.

## Problem

Monocle already has many browser commands that map well to Vimium and Tridactyl
shortcuts, but several high-value tab and browser operations are missing as
direct commands. The goal is to support the buildable browser-command subset of
the Vim template without adding a full Vim browser mode.

## Proposed Commands

Use existing commands where possible and add small browser-owned commands where
needed.

Existing commands that only need template bindings:

| Behavior | Existing command |
| --- | --- |
| Back / forward | `go-back`, `go-forward` |
| Reload | `reload-current-tab` |
| New tab | `open-new-tab` |
| Duplicate tab | `duplicate-current-tab` |
| Reopen closed tab | `reopen-last-closed-tab` |
| Move tab left / right | `move-tab-left`, `move-tab-right` |
| Move tab to new window | `move-current-tab-to-a-new-window` |
| Toggle pin / mute | `toggle-pin-current-tab`, `toggle-mute-current-tab` |
| Firefox reader mode | `toggle-reader-mode` |

New commands:

| Behavior | Notes |
| --- | --- |
| Previous / next tab | Activate adjacent tab in current window, wrapping at ends. |
| First / last tab | Activate first or last tab in current window. |
| Last active tab | Track tab activation history and switch to the previous active tab. |
| Audible tab | Activate the first audible tab, preferring the current window. |
| Hard reload | Dedicated wrapper for bypass-cache reload; do not bind generated modifier actions directly. |
| Stop loading | Stop current page load through the safest available browser/content path. |
| Restore closed window | Restore the most recent closed window when available. |

## Behavior

- Commands should live in the browser command category because they are
  privileged browser/tab operations.
- Commands that require `tabs` or `sessions` must declare those permissions and
  reuse the normal permission UI.
- Tab-selection commands operate within the current window unless explicitly
  documented otherwise.
- Last-active-tab state should be background-owned and updated from browser tab
  activation events.
- Destructive tab/window close shortcuts are not part of this proposal because
  Monocle's high-risk keybinding policy excludes confirmation-required commands.

## Success Criteria

- The Vim template can bind browser-navigation rows without inventing wrapper
  UI-only behavior.
- Existing browser commands keep their current behavior and just receive template
  bindings.
- New commands are discoverable in the command palette and settings catalog.
- Permission-gated commands show the existing missing-permission path.

## Tests

- Unit tests for previous/next/first/last tab selection, including wraparound.
- Unit tests for audible-tab selection across current and other windows.
- Unit tests for last-active-tab tracking and fallback when the previous tab no
  longer exists.
- Unit test hard reload passes `bypassCache: true`.
- Browser smoke checks for Chrome and Firefox tab navigation, reader mode where
  supported, and stop-loading behavior.
