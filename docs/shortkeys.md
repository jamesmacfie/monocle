# Shortkeys Gap Analysis

> **Status: RESEARCH.** This doc is a gap analysis against the Shortkeys
> extension (https://github.com/crittermike/shortkeys, examined June 2026 at
> the WXT/TypeScript rewrite, ~135 selectable actions), not a description of
> Monocle behavior. It maps which Shortkeys actions Monocle already has,
> which are easy wins under the current architecture, and which to skip.
> Command details for shipped behavior live in `docs/commands/`.

Shortkeys is the closest product analog to Monocle's keybinding surface: a
WXT-based extension binding keyboard shortcuts to a fixed action vocabulary
(plus custom JS), with per-site scoping and sequence support. Monocle's
architecture is a superset of what most of its actions need — background
commands over `chrome.tabs`/`windows`/`bookmarks`/`sessions`, content
effects via the `monocle-scroll`/`monocle-insertText` event family or
`scripting.executeScript` (the `stop-loading-current-tab` /
`copy-canonical-url` pattern), palette-form parameters, and a strictly
stronger keybinding system (canonical format, registry, conflicts,
sequences — `docs/keybindings.md`).

Counting it up: of Shortkeys' ~111 core actions, **roughly half are already
shipped Monocle commands**, and most of the rest are an afternoon each using
existing patterns. The genuinely hard ones are a short list at the bottom.

## Already covered by shipped Monocle commands

No action needed; listed so nobody re-implements them. Monocle ids per
`docs/commands/browser.md`.

| Shortkeys | Monocle |
| --- | --- |
| All 12 scrolling actions | `scroll-*` family (`monocle-scroll` events) |
| `back` / `forward` / `reload` / `hardreload` | `go-back`, `go-forward`, `reload-current-tab` (cmd = hard reload), `hard-reload-current-tab` |
| `copyurl` / `copypagetitle` | `copy-current-url`, `copy-current-title` (plus `copy-clean-current-url`, `copy-current-domain`, `copy-canonical-url` beyond Shortkeys) |
| `urlup` / `urlroot` / `urlinc` / `urldec` | `go-to-parent-url`, `go-to-root-url`, `increment-url-number`, `decrement-url-number` |
| `viewsource` | `view-source-current-tab` |
| `newtab` / `closetab` / `clonetab` | `open-new-tab`, `close-current-tab`, `duplicate-current-tab` |
| `onlytab` / `closelefttabs` / `closerighttabs` / `closeduplicatetabs` | `close-other-tabs`, `close-tabs-to-left/right`, `close-duplicate-tabs` |
| `nexttab` / `prevtab` / `firsttab` / `lasttab` / `lastusedtab` / `audibletab` | `focus-next/previous/first/last-tab`, `focus-last-active-tab`, `focus-audible-tab` |
| `gototab` / `gototabbytitle` | `goto-tab` / `open-tabs` groups (palette search beats per-shortcut match patterns) |
| `togglepin` / `togglemute` | `toggle-pin-current-tab`, `toggle-mute-current-tab` |
| `movetableft` / `movetabright` / `movetabtonewwindow` | `move-tab-left/right`, `move-current-tab-to-a-new-window` (+ popup-window variant) |
| `zoomin` / `zoomout` / `zoomreset` | `zoom-in`, `zoom-out`, `zoom-reset` (`tabs.setZoom`) |
| `fullscreen` | `toggle-fullscreen` (`windows.update({state})`) |
| `reopentab` | `reopen-last-closed-tab` (+ the richer `recently-closed` group) |
| `newwindow` / `newprivatewindow` / `closewindow` | `open-new-window`, `open-new-private-window`, `close-current-window` |
| `openbookmark*` | `bookmarks` group (deep search); `add-bookmark` |
| `opensettings` / `openextensions` / `openshortcuts` | `open-browser-page` group (Chrome) |
| `showlatestdownload` | `downloads` group |
| `cleardownloads` | `clear-browser-data` group |
| `capturescreenshot` | `capture-screenshot` (`captureVisibleTab`, no debugger) |
| `inserttext` | Snippets (`insert-snippet`) — strictly richer: placeholders, counters, clipboard fallback |
| `openurl` | Palette + `monocle-newTab` paths; a dedicated parameterized command is trivial if wanted |
| `disable` (block a site's shortcut) | Mostly free already — see "Ideas worth borrowing" |

Shortkeys' shortcut packs (vim.json etc.) correspond to Monocle's
Vim-template keybinding targets already noted throughout
`docs/commands/browser.md`.

## Easy wins — new commands with existing patterns

Each of these is a standard `CommandNode` in an existing category file
(`docs/authoring-commands.md` flow), using APIs/patterns Monocle already
exercises. Grouped by pattern, easiest first.

### Pure background, no new permissions

| Proposed command | Shortkeys source | Mechanics |
| --- | --- | --- |
| Move tab to first / last | `movetabtofirst`/`movetabtolast` | `tabs.move({index: 0 / -1})` — completes the existing move-tab family. |
| Sort tabs by title | `sorttabs` | Query, `localeCompare` on unpinned, sequential `tabs.move`. |
| Suspend (discard) tab | `discardtab` | Activate neighbor first, then `tabs.discard` — mirrors Shortkeys' active-tab workaround. |
| Go to tab by index | `gototabbyindex` | Either N actions for 1–8 (Vim-template-style keybinding targets `<cmd-1>`…) or a palette form. |
| Extend tab selection left/right | `selecttableft`/`selecttabright` | `tabs.query({highlighted:true})` → `tabs.highlight`. Niche; cheap. |
| Copy title + URL / markdown link | `copytitleurl`/`copytitleurlmarkdown` | Two more children in the existing `copyCurrentTabUrl` group. |
| Toggle bookmark | `togglebookmark` | `bookmarks.search({url})` → create/remove; `bookmarks` permission already declared by the bookmark commands; state-aware name like `toggle-pin-current-tab`. |
| Open page in incognito | `openincognito` | `windows.create({url, incognito:true})`. |

### Background + `scripting.executeScript` (the `stop-loading-current-tab` / `copy-canonical-url` pattern)

| Proposed command | Shortkeys source | Mechanics |
| --- | --- | --- |
| Print page | `print` | Inject `window.print()`. |
| Focus first input | `focusinput` | Inject visible-input query + `.focus()`; toast if none (NoOp/display conventions). |
| Next page / Previous page | `nextpage`/`prevpage` | Inject the `rel=next/prev` + link-text heuristic and click. The heuristic list in Shortkeys (`next`, `›`, `»`, `older`…) is proven — copy it. Pairs perfectly with `increment-url-number`. |
| Video controls group | 8 `video*` actions | One `group` ("Video") with play/pause, mute, fullscreen, speed ±/reset, skip ±10s against `document.querySelector("video")`. High value for the keybinding crowd; state doesn't need to be read back (fire-and-forget + toast). |
| Search selection on… | `searchgoogle`/`youtube`/`wikipedia`/`github` | Inject `getSelection().toString()`, then `tabs.create` with the provider URL. Do it as one `group` with provider children rather than four flat commands; provider list is data. |
| Toggle dark mode (invert) | `toggledarkmode` | Inject/remove a tagged `<style>` with the invert+hue-rotate filter. Note: this is exactly the shipped `injectCss`/`hideElement` workflow ops (`docs/user-scripts.md`) — ship it as a bundled example automation instead of a bespoke command. |

### Optional-permission flows (existing grant machinery, `docs/permissions.md`)

| Proposed command | Shortkeys source | Mechanics |
| --- | --- | --- |
| Open URL from clipboard (current/new tab) | `openclipboardurl*` | Optional `clipboardRead` request at execute time (Shortkeys does the same), inject `navigator.clipboard.readText()`, prefix `https://`, navigate. |

Tab groups (`grouptab` etc.) are **already shipped** as part of the Tab Groups
feature (`background/features/tabGroups/`): Chrome-only native commands (add tab
to group, group window, rename/recolor/collapse/ungroup) gated
`supportedBrowsers: ["chrome"]` + optional `tabGroups` permission, exactly as
this row would have proposed. No action needed.

## Not easy, or not worth copying

| Shortkeys feature | Verdict |
| --- | --- |
| `javascript` (custom JS via `chrome.userScripts`, MAIN world) | **Do not bolt on.** User scripts shipped deliberately without a `runJs` step (`docs/user-scripts.md`, Store posture); do not reintroduce it as a one-off command. |
| `macro` (chained steps with delays, JS steps via `new Function`) | Superseded by shipped user scripts (`docs/user-scripts.md`) — a validated step document beats a 10-step action list with string-eval'd JS. |
| 24 bundled "page scripts" (reader mode, hide sticky, table→CSV, PiP…) | The *ideas* are good; the mechanism (`new Function(code)` over bundled strings) is not Monocle's style. Cherry-pick the best (PiP, hide-sticky) as ordinary typed commands later, or as bundled example user scripts. |
| `linkhints` / `linkhintsnew` (Vimium-style link hints) | Genuinely large content-UI feature (overlay rendering, key capture modes, shadow-DOM traversal). Real value, but a project of its own — not an "easy win." |
| Full-page screenshots via `chrome.debugger` | The `debugger` permission is a store-review red flag Monocle deliberately avoids (`docs/store-submission.md`); visible-area capture already ships. Skip. |
| `editurl` (fake in-page address bar) | The palette is a better URL editor; skip. |
| `openapp` (`management.launchApp`) | Chrome Apps are deprecated; `management` permission for a dead feature. Skip. |
| `showcheatsheet` | The palette largely is the cheat sheet; a "show my keybindings" palette group could come from the registry snapshot, but it's a nicety, not a gap. |

## Ideas worth borrowing beyond actions

- **"Do nothing" as a first-class concept.** Shortkeys' most clever action
  blocks a site's own shortcut by binding it and `preventDefault`ing.
  Monocle's capture already suppresses bound keys preemptively
  (`shouldPreemptivelySuppress`, `shared/hooks/useGlobalKeybindings.tsx`),
  so a bindable NoOp command ("Block page shortcut") is nearly free and
  makes that behavior an intentional user feature.
- **Per-shortcut `activeInInputs`.** Monocle's editable-element passthrough
  is global policy plus per-command `keybindingRequirements`; Shortkeys
  makes it a per-binding user choice. Worth considering as a
  `CommandSettings` flag if users ask for plain-key bindings inside inputs.
- **Bookmarklet execution** and Shortkeys' `externally_connectable` import
  channel are both **anti-patterns** from Monocle's policy posture
  (see the store posture in `docs/user-scripts.md` and `docs/store-submission.md`) — listed here so they are
  rejected deliberately, not rediscovered.

## Suggested implementation order

1. Move-to-first/last, toggle bookmark, copy title+URL variants — pure
   background, zero risk, rounds out parity. (Zoom and fullscreen already
   shipped — see the "Already covered" table.)
2. Video controls group, next/previous page, print, focus-first-input —
   the injection pattern, high keybinding value.
3. Search-selection group, open-URL-from-clipboard — small new surface
   (selection read, optional `clipboardRead`).

Tab groups (Chrome-only) — the one real new permission conversation — has
since shipped as the Tab Groups feature (`background/features/tabGroups/`).

Each lands per `docs/authoring-commands.md`: category file +
registration + catalog row in `docs/commands/browser.md` (or `tools.md`),
keybinding-conflict awareness, and the high-risk keybinding policy for
anything destructive.
