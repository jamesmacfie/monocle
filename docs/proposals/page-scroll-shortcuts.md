# Page Scroll Shortcuts

Status: Proposal.

## Problem

Monocle has scroll-to-top and scroll-to-bottom commands, but Vim-style browsing
expects small vertical scrolls, page and half-page scrolls, horizontal scrolling,
and left/right edge jumps. The current `monocle-scroll` content message only
supports top and bottom, so the scroll surface needs to expand before the Vim
template can enable these rows.

## Proposed Design

Extend the existing background-to-content scroll path instead of routing these
through workflow automation. Scrolling is a page-control primitive, not a user
authored workflow.

Add scroll commands for:

| Behavior | Suggested keybindings |
| --- | --- |
| Scroll line down / up | `j`, `k`, `<ctrl-e>`, `<ctrl-y>` |
| Scroll half page down / up | `<ctrl-d>`, `<ctrl-u>` |
| Scroll full page down / up | `<ctrl-f>`, `<ctrl-b>` |
| Scroll right / left | `l`, `h` |
| Scroll to top / bottom | `g, g`, `<shift-g>` |
| Scroll to left / right edge | `<shift-6>`, `<shift-4>` |

Extend the scroll message shape to express operation and axis:

```ts
type ScrollCommand =
  | { type: "line"; axis: "x" | "y"; amount: number }
  | { type: "page"; axis: "x" | "y"; amount: number }
  | { type: "edge"; axis: "x" | "y"; edge: "start" | "end" }
```

The content listener should compute pixels from the current viewport and use the
page's scrolling element. It should keep smooth behavior consistent with the
existing top/bottom commands unless tests show it makes repeated key presses
feel laggy.

## Behavior

- Shortcuts must not fire while typing in editable elements; preserve the
  existing keybinding event filter.
- Scroll commands should target the main page scroll container for v1. Nested
  scroll-container discovery is out of scope.
- Commands should no-op safely on extension pages or restricted pages where the
  content listener is unavailable.
- Existing `scroll-to-top` and `scroll-to-bottom` remain valid commands and can
  be implemented through the expanded message shape.

## Success Criteria

- The Vim template can enable line, page, horizontal, and edge scroll rows.
- Existing top/bottom commands still work.
- Repeated `j`/`k` key presses feel responsive on normal pages.
- Editable fields keep normal text entry behavior.

## Tests

- Unit test message construction for each scroll command.
- Content listener tests for vertical line/page/edge scrolling.
- Content listener tests for horizontal scroll and edge behavior.
- Browser smoke check on a long page and a horizontally scrollable page.
- Editable passthrough smoke check on an input-heavy page.
