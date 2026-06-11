# URL Navigation And Copy Commands

Status: Proposal.

## Problem

Vimium and Tridactyl include URL-centric commands that fit Monocle's browser
command model: moving up URL hierarchy, jumping to site root, incrementing or
decrementing a number in the URL, viewing source, and copying URL variants.
Monocle has some of the copy behavior today, but several commands are nested or
missing.

## Proposed Commands

Add browser-owned commands for URL navigation:

| Behavior | Notes |
| --- | --- |
| Go up URL hierarchy | `/a/b/c` -> `/a/b`; root stays at root. |
| Go to site root | Preserve scheme and host; path becomes `/`. |
| Increment URL number | Change the rightmost numeric URL segment or query value by `+1`. |
| Decrement URL number | Change the rightmost numeric URL segment or query value by `-1`. |
| View source | Navigate to a browser source view for the current page when supported. |

Add or promote copy commands:

| Behavior | Notes |
| --- | --- |
| Copy URL | Top-level action for the full current tab URL. |
| Copy clean URL | Existing no-params behavior promoted out of the nested copy group. |
| Copy domain | Existing domain-only behavior promoted out of the nested copy group. |
| Copy title | Copy current tab title. |
| Copy Markdown link | Existing title-plus-URL Markdown command remains the Markdown variant. |
| Copy canonical URL | Use the page canonical link when available; fall back to current URL. |

## Behavior

- URL transforms should validate the resulting URL before navigation.
- URL increment/decrement should fail with a clear toast if no numeric component
  exists.
- View-source behavior must be browser-aware. If a browser rejects source URLs,
  show a clear unsupported toast.

## Boundaries

- Navigation and tab creation remain background-owned browser commands.
- Reading page canonical URL may require a content message; the background should
  fall back to the active tab URL when content access is unavailable.
- This proposal does not add homepage settings or arbitrary open/search command
  line behavior. See [Features we will not build](./wont-do-vim-browser-features.md).

## Success Criteria

- The Vim template can enable URL hierarchy/root, URL increment/decrement,
  view-source, and top-level copy rows.
- Existing nested copy URL behavior continues to work or is replaced by
  equivalent top-level commands.

## Tests

- Unit tests for URL parent/root transforms.
- Unit tests for increment/decrement on path segments and query values, plus
  missing-number failures.
- Unit tests for copy variants and canonical fallback.
- Browser smoke checks for view-source behavior in Chrome and Firefox.
