# Store Submission

Research-backed guide to publishing Monocle on the Chrome Web Store and Firefox
Add-ons (AMO): what each review process involves, where Monocle is at risk of
rejection, what is verified safe, and the prep work required before first
submission. This doc is the source for the store-readiness code round — the
[Readiness checklist](#readiness-checklist) at the end is the concrete hand-off.

Unlike the other docs in this folder, this one describes **external review policy
as researched in June 2026**, not code behavior. Store policies change; re-verify
the hard rules (Chrome single-purpose, Mozilla's `data_collection_permissions`,
and the Firefox source-archive process) before submitting. Code citations follow
the usual doc conventions and describe verified current behavior. Authoritative
policy URLs are in [Sources](#sources).

**v1 scope:** the first submission ships the full current feature set, including
the **Native Bridge** and **Extension-to-Extension** integrations. Both are off by
default, but both are present in the manifest and both transmit data outside the
browser, which changes the data-disclosure posture below.

## Summary risk read

| Store | First-pass outlook | Dominant risk |
| --- | --- | --- |
| Firefox AMO | Low risk **if** the mechanical prep is done; near-certain signing rejection if not | Process compliance: source archive, **`data_collection_permissions`** (no longer declarable as bare "none"), gecko id |
| Chrome Web Store | Approvable, expect manual review and possibly one rejection cycle | The integration surface — `externally_connectable: {ids:["*"]}`, `nativeMessaging`, and wildcard `optional_host_permissions` — plus two `<all_urls>` content scripts |

Three areas commonly feared turned out to be in good shape:

- **The site SDK is policy-safe.** Pages supply declarative data only; the
  extension never executes page-supplied code (see [Site SDK and remote-code
  policy](#site-sdk-and-remote-code-policy)).
- **The permission structure is what reviewers want.** The required set is minimal
  (`scripting`, `activeTab`, `storage`, `alarms` — plus `contextualIdentities` on
  Firefox); everything sensitive is optional, requested on demand, and re-checked
  at execution (`background/utils/permissions.ts`, `checkPermissions`, called from
  `background/commands/execution.ts`).
- **Single purpose is defensible, not a coin flip.** Chrome's quality-guidelines
  FAQ explicitly permits NTP extensions that provide **vertical search** ("searching
  through a list of open tabs or a specific platform"). Monocle's palette is exactly
  that (see [Single purpose](#single-purpose)).

## Hard blockers (fail before a human reviews)

These must be fixed before either store will accept a submission:

1. **Listing assets.** The manifest declares 16/32/48/128 icons (`wxt.config.ts`,
   `icons` block) and the PNGs exist in `public/images/`, so the manifest side is
   covered. Chrome still requires a 128×128 *store* icon and at least one screenshot
   in the listing itself; missing either is an automatic rejection. Prepare listing
   assets from the real packaged build.
2. **Firefox `data_collection_permissions`.** Mandatory for all *new* extensions
   submitted to AMO since 2025-11-03 (all extensions in H1 2026), under
   `browser_specific_settings.gecko`. **Correction from earlier guidance:** Monocle
   can no longer declare a bare `"required": ["none"]`. The Native Bridge transmits
   the active tab's URL/title to a locally-installed app, and Extension-to-Extension
   forwards user selections to a peer — Mozilla counts both as transmission "outside
   the add-on or the local browser." The correct shape is `required: ["none"]`
   (baseline collects nothing) **plus** an `optional` list for the opt-in integration
   flows. See [Firefox data collection](#data_collection_permissions) for the exact
   category mapping. Omitting or mis-declaring this is rejected at signing.
3. **Pin the Chrome `key`.** No `key` is set in the manifest (`wxt.config.ts`), so
   the published Chrome extension ID is unknown until first upload. The Native Bridge
   host (`apps/bridge`) declares `allowed_origins` with the **exact** extension ID
   (no wildcards allowed), so the bridge cannot connect on Chrome until the ID is
   pinned and the host manifest matches it. This was previously deferred; with the
   bridge shipping in v1 it is a blocker. (Firefox's id is stable via gecko id, so
   the Firefox bridge path is unaffected.)
4. **Firefox source-code submission.** The shipped output is minified WXT/Vite
   bundles, so a source archive is mandatory: full pre-build source, `pnpm-lock.yaml`,
   and a README with exact build steps. The reviewer rebuilds and diffs against the
   package — there must be **no differences**, and all dependencies must come bundled
   or from official registries. The README must spell out the corepack + pnpm v11
   requirement and the exact commands (`pnpm install`, `pnpm run build:firefox`).
5. **Privacy policy.** Under Chrome's definition, reading page content
   (`content/workflow/`), capturing keystrokes for keybindings
   (`shared/hooks/useGlobalKeybindings.tsx`), and transmitting the active tab to a
   paired app (the bridge) all count as "handling user data." A privacy policy URL,
   accurate data-disclosure checkboxes, and a Limited Use disclosure statement are
   required; a missing policy is a hard Chrome rejection.
6. **Gecko ID.** `browser_specific_settings.gecko.id` is `ff@monocle.com`
   (`wxt.config.ts`), a domain not owned by this project. The ID is permanent once
   published — it is the update identity and can never change. Set it to an ID on a
   controlled domain (or a braced GUID) before first submission.
7. **Version mismatch.** Manifest version is `0.0.1` (`wxt.config.ts`) while
   `package.json` says `0.1.0`. Cosmetic, but sync before submitting.

## Feature surface for review

Reviewers (and the listing) must account for every advertised function. The listing
copy must mention everything user-visible; undisclosed functionality is a rejection
category on both stores. The full set:

- **Command palette** in two contexts — an all-pages overlay (closed shadow DOM)
  and a new-tab-page replacement. This is the single purpose; everything else is a
  command.
- **New-tab override** with theme, clock, and an optional Unsplash background image.
- **Browser commands** — tabs, windows, navigation, bookmarks, history, downloads,
  sessions, cookies, browsing data, extension management; Firefox containers/reader;
  Chrome native tab groups. Each behind an optional permission.
- **Keybindings** — global capture that only suppresses/forwards keys matching
  registered bindings (`shared/hooks/useGlobalKeybindings.tsx`).
- **Snippets, calculations** — local text insertion (write-only clipboard) and
  inline math/units/time.
- **Automations + workflow automation** — user-authored declarative documents over
  a fixed, bundled step vocabulary, including consent-gated HTTPS/exact-loopback
  requests to user-chosen endpoints (see [Verified non-issues](#verified-non-issues)).
- **Feature modules** — Focus Mode, Tab Groups, Element Hider (interactive picker;
  reads, never mutates until the user confirms).
- **Site SDK** — page-declared, session-only commands ([below](#site-sdk-and-remote-code-policy)).
- **Native Bridge** — opt-in desktop-app integration ([below](#native-messaging-bridge)).
- **Extension-to-Extension** — opt-in peer-extension commands ([below](#extension-to-extension)).

## Firefox AMO

Submit Firefox first: its risks are mechanical and fully satisfiable up front, and a
live, reviewed AMO listing is useful leverage for the Chrome single-purpose case.

### Process

- All add-ons are signed by Mozilla. Listed submissions pass automated validation,
  get signed (typically within 24 hours), and may get human review before or after
  publication. Broad permissions and source-code involvement push toward human
  review (hours to weeks).
- A rejected version is simply not distributed; resubmission means a new version
  addressing only the cited feedback — bundling unrelated changes causes delays.
- Firefox MV3 specifics that matter here:
  - The background must be declared as `background.scripts` (event page), not only
    `service_worker`. WXT branches per-browser (`wxt.config.ts`); verify the
    firefox-mv3 output manifest emits `scripts`.
  - Host permissions are not auto-granted in Firefox MV3 — users opt in per site.
    This softens the wildcard-host concern relative to Chrome.
  - New submissions should target MV3 (`build:firefox` already does).

### `data_collection_permissions`

The 2025-11-03 requirement: declare data collection under
`browser_specific_settings.gecko.data_collection_permissions`, with `required` and
`optional` arrays. Mozilla's definition of transmission is broad — "any data
collected, used, transferred, shared, or handled outside the add-on or the local
browser" — and **explicitly includes locally-installed native applications and other
extensions**. Once an extension adopts these keys it must keep them in every
subsequent version.

Valid category keys: `authenticationInfo`, `bookmarksInfo`, `browsingActivity`,
`financialAndPaymentInfo`, `healthInfo`, `locationInfo`, `personalCommunications`,
`personallyIdentifyingInfo`, `searchTerms`, `technicalAndInteraction` (optional
only), `websiteActivity`, `websiteContent`.

Mapping for Monocle:

- **Baseline (palette, commands, non-outbound automations, snippets, focus/tab-groups/element-hider):**
  collects nothing off-device. Unsplash and DuckDuckGo are remote *image/icon*
  fetches, not user-data transmission. → contributes `none` to `required`.
- **Native Bridge (opt-in):** transmits the active tab's URL/title to the paired
  local app, and the palette query string used to find commands. → `browsingActivity`
  (active-tab URL/title) and `searchTerms` (the palette query), declared **optional**
  since the feature is off by default.
- **Extension-to-Extension (opt-in):** forwards user selections/form values to an
  approved peer extension. Whether this needs its own category beyond the above is a
  judgment call — most selections are command ids, not personal data.
- **Outbound Automations (opt-in):** user-authored HTTP steps can transmit
  integration credentials, current/derived URLs, page interactions, identifying
  values, and page content to a user-configured endpoint. The shipped optional
  set is `authenticationInfo`, `browsingActivity`,
  `personallyIdentifyingInfo`, `searchTerms`, `websiteActivity`, and
  `websiteContent`; execution rechecks consent before values resolve or a request
  starts.

Current declaration (re-verify against Mozilla policy for every release):

```jsonc
"data_collection_permissions": {
  "required": ["none"],
  "optional": [
    "authenticationInfo", "browsingActivity", "personallyIdentifyingInfo",
    "searchTerms", "websiteActivity", "websiteContent"
  ]
}
```

A mismatch between the declaration and actual behavior is a classic rejection, so
keep this list honest and re-audit it whenever a data-transmitting command is added.

### Mozilla-specific hard rules

- **No remote code, no CSP relaxation.** Verified clean (see [Site SDK and
  remote-code policy](#site-sdk-and-remote-code-policy)). Fetching/parsing remote
  JSON/data is permitted; executing it is not.
- **No remote new-tab page.** The new-tab document and scripts are fully local
  (`entrypoints/newtab/`); the Unsplash background is a remote *image* fetch
  (`background/messages/getUnsplashBackground.ts`), which is permitted.
- **Unexpected functionality must be disclosed.** The listing must clearly state the
  new-tab override, the global keyboard shortcut, all-pages injection, site-defined
  commands, Native Bridge, Extension-to-Extension, and outbound automation requests.
  Mozilla's opt-in expectation for
  settings changes has a carve-out when the change is the add-on's clear advertised
  purpose — so the new-tab override must be headline listing copy.
- **Extension-to-Extension on Firefox.** Firefox does not support the
  `externally_connectable` manifest key, so it is omitted there; Firefox still
  delivers `onMessageExternal`, and the handler's approved-id allowlist
  (`background/features/extensionRegistry/handler.ts`) is the cross-browser gate.
  Note this in reviewer notes.
- **Native messaging host install.** The native host is installed separately
  (`apps/bridge`); the add-on only declares the optional `nativeMessaging` permission
  and connects on demand. Mention that the host is user-installed and the feature is
  off by default.
- The AMO linter warns on `innerHTML` in React's compiled output — a known benign
  framework warning that does not block, provided no remote/untrusted content is
  assigned (none is).

## Chrome Web Store

### Process

- One-time $5 developer registration fee.
- Single review pipeline mixing automated and manual review; no fast lane. Broad
  content-script matches, new developers, and large codebases all push toward manual
  review — Monocle hits all three. Turnaround is days, can stretch to weeks.
- The dashboard's Privacy practices tab must be completed before publishing:
  single-purpose description, per-permission justifications, broad-host
  justification, remote-code declaration, data-collection disclosures, and a privacy
  policy link.
- **One appeal per violation** (policy since January 2025). Re-appeals after a
  verdict are not allowed, so listing copy and justifications must be complete and
  careful before the first submission.

### Single purpose

Chrome's single-purpose policy accepts either "one narrow focus area" or "one narrow
browser function" — and the quality-guidelines FAQ lists "new tab page", "tab
management", and "web search provider" as valid functions. Crucially, the FAQ
distinguishes **vertical search** (a specific content/context, e.g. "searching
through a list of open tabs or a specific platform") from **horizontal/web search**
(general web results). NTP extensions providing vertical search or AI chatbots are
**explicitly allowed**; only web-search experiences must route through the
`chrome.search` API and respect the user's default engine.

This places Monocle on the safe side: it is a **command launcher with vertical
search over the user's tabs, bookmarks, history, and commands** — rendered in two
contexts (overlay + new tab). The defense, stated consistently across the listing,
the single-purpose dashboard field, and the screenshots: *"Raycast for the browser —
one command launcher, two contexts."* Cite the vertical-search allowance if
challenged. Still write tightly: avoid "suite," "all-in-one," or feature-list
framing.

Sub-rules:

- **NTP web-search rule.** Monocle ships no web-search surface (the old Google
  autosuggest command, which transmitted typed input to `google.com/complete/search`,
  was removed). The "Search selection on Google" command
  (`background/commands/browser/searchSelection.ts`) is a *local* operation — it
  reads the page selection and opens a Google results tab; it transmits nothing and
  is not a search interface. If a true web-search surface returns, route it through
  `chrome.search.query()`.
- **Fallback.** If rejected on single-purpose grounds, the levers are: make the NTP
  override opt-in, or split the new-tab experience into a separate listing. Decide
  appeal-vs-restructure before spending the single appeal.

### Permissions

- Required set is minimal: `scripting`, `activeTab`, `storage`, `alarms`
  (`wxt.config.ts`; `alarms` powers scheduled automation triggers).
- **`host_permissions`** is two specific hosts (`https://api.unsplash.com/*`,
  `https://icons.duckduckgo.com/*`) — no `<all_urls>`.
- **`optional_host_permissions: ["http://*/*", "https://*/*"]`** — broad wildcard
  host access is the declaration ceiling for page-scoped Automations, Element
  Hider, and user-authored outbound HTTPS/exact-loopback destinations. Runtime
  requests remain concrete scheme+host patterns. This is still a review flag;
  the dashboard must explain the user-authored destination model and why a
  static host allowlist cannot represent it.
- All sensitive API permissions are optional and requested at runtime
  (`background/messages/requestPermission.ts`), then re-verified at execution
  (`background/utils/permissions.ts`). `management` (can disable/uninstall other
  extensions) and `nativeMessaging` are the highest-scrutiny members — keep their
  grant flows visibly user-initiated.
- The **two `<all_urls>` content scripts** — the palette overlay
  (`entrypoints/content.tsx`, ISOLATED) and the MAIN-world site-SDK shim
  (`entrypoints/site-sdk.content.ts`, top-frame only) — guarantee manual review. The
  justification is legitimate (a keyboard-summoned palette must exist on every page)
  but must be written tightly and tied to the single stated purpose.

### Site SDK and remote-code policy

Chrome's MV3 remotely-hosted-code policy allows loading external **data** but
prohibits external **logic**, with an explicit catch-all against "building an
interpreter to run complex commands fetched from a remote source, even if those
commands are fetched as data." Monocle's site SDK is on the right side, verified
against the code:

- Registration is purely declarative. Page callbacks never cross the boundary — they
  stay in page memory and are replaced with string `callbackId` references before
  serialization (`content/siteSdkFacade.ts`).
- On execution the extension runs no page-supplied logic. The background executor
  (`background/commands/siteSdk/commands.ts`, `invokeSiteSdk`) sends an invoke
  message to the owning tab, and **the page runs its own callback in its own world**.
  There is no interpreter to point at.
- No `eval`, `new Function`, string-arg timers, `dangerouslySetInnerHTML`, or CSP
  relaxation anywhere (verified by repo-wide search). The only `innerHTML` is a
  read in copy-page-as-Markdown.
- Declarations are schema-validated (strict Zod), capped (20 registrations, 100
  commands, depth 5), session-only (`background/commands/siteSdk/registry.ts`),
  top-frame only, and trust derives from the extension message sender, not
  page-supplied data (`background/commands/siteSdk/scope.ts`).
- SDK commands carry no `permissions` and cannot bind custom keybindings
  (`background/commands/siteSdk/commands.ts`).

The residual risk is **reviewer comprehension, not policy**: a MAIN-world content
script plus a postMessage command channel pattern-matches on known abuse vectors
(the Urban VPN postMessage-injection incident is the canonical example). Pre-empt it
in [reviewer notes](#reviewer-notes-both-stores).

### Native messaging

`nativeMessaging` is an optional permission, requested when the user enables the
bridge. There is **no `native_connections` manifest key** in Chrome MV3 — the
extension only declares the permission; the *host* manifest declares `allowed_origins`
with the exact extension ID. See [Native Messaging Bridge](#native-messaging-bridge)
for the full posture and reviewer guidance. The store-review essentials: it is
off by default, requires an explicit permission grant, talks only to a
locally-installed host, and is the reason the Chrome `key` must be pinned.

### Extension-to-extension

`externally_connectable: {ids: ["*"]}` (Chrome only) lets any peer extension
*announce*; the real gate is explicit user approval on the Integrations page. See
[Extension-to-Extension](#extension-to-extension). Reviewers will want to see the
approval flow — name the Integrations page and the approved-id allowlist in reviewer
notes.

### Other Chrome rules to respect

- NTP override uses `chrome_url_overrides` (it does — `wxt.config.ts`).
- No banned promotional words in the listing ("Free," "Best," "#1," "Award-winning," …).
- Functionality must match the listing exactly. The expected-functionality list must
  mention user-defined outbound automations, Native Bridge, and
  Extension-to-Extension now that they ship.
- Fake or mismatched screenshots are a fast rejection — screenshot the real packaged
  build.

## Native Messaging Bridge

An **off-by-default** integration letting an external desktop app (first target:
Raycast) drive Monocle. Code: `background/features/nativeMessaging/`; the host is the
separate Tauri app in `apps/bridge` (macOS M0/M1). Full design in
[native-messaging/](./native-messaging/).

- **Permissions & opt-in.** Optional `nativeMessaging` (+ `tabs`), requested via the
  enable command's grant flow. `connectNative("com.monocle.bridge")` runs only while
  the feature is enabled (`background/features/nativeMessaging/port.ts`).
- **Data that crosses the boundary.** Active-tab URL/title and the palette query
  (to resolve command suggestions), plus command ids/results. **Incognito tabs are
  excluded.** The site SDK is absent over the bridge (no content sender). This is the
  off-device flow that drives the Firefox `data_collection_permissions` `optional`
  list and the Chrome Limited Use disclosure.
- **Auth.** Bluetooth-style Direction-B pairing
  (`background/features/nativeMessaging/pairing.ts`): the extension generates a
  6-digit code shown on the Integrations page; the user types it into the app; a
  bearer token is minted and stored **SHA-256 hashed** (constant-time compare,
  attempt cap, expiry). Tokens are per-client and revocable.
- **Execution (v2).** A second global `allowExecution` opt-in (off by default) lets
  paired apps run commands (`background/features/nativeMessaging/execute.ts`).
  Preflight reuses the runCommand policy: confirm-gated, automation, and debug
  commands are always denied. Disclose as "paired apps can run commands only if you
  enable it in settings."
- **Transport/threat model.** The host runs a `127.0.0.1` loopback server + a UDS
  relay; it injects the bearer token and frames envelopes to the browser. Loopback
  only — no network exposure. The host's `allowed_origins` must list the published
  extension ID (Chrome `key` dependency — see hard blocker 3).
- **Disclosure.** Listing copy must mention the integration and that it requires a
  separately installed native app; reviewer notes must state it is off by default,
  locally scoped, token-authed, and revocable.

## Extension-to-Extension

An **off-by-default** integration letting peer browser extensions contribute
commands to Monocle's palette. Code: `background/features/extensionRegistry/`,
`background/commands/extensionSdk/`. Full design in
[extension-extension/](./extension-extension/).

- **Trust model.** Approval-only, no pairing code or token. A peer announces over
  `onMessageExternal`; the user approves it on the Integrations page; the
  browser-verified `sender.id` is the identity, added to an approved-id allowlist
  (`background/features/extensionRegistry/handler.ts`).
- **Data flow.** Peer → Monocle: declarative command trees (ids, titles, icons) and
  the peer's manifest name. Monocle → peer: the user's selection and form values when
  a peer command runs (over a `chrome.runtime.connect` port — not the native bridge).
  Monocle does not expose tab URL/content to a peer.
- **Manifest gate.** Chrome: `externally_connectable: {ids: ["*"]}` lets any peer
  announce; approval is the real gate. Firefox: no `externally_connectable` key, so
  the handler allowlist is the only gate.
- **Disclosure.** Listing: "integrate with other extensions you approve on the
  Integrations page." Reviewer notes: approval is explicit and revocable; commands
  are declarative; there is no arbitrary-code path.

## Reviewer notes (both stores)

Both stores accept reviewer notes; on AMO they are the single biggest lever for
shortening human review. Explain, up front:

1. **Site SDK architecture** — pages post declarative descriptors; the extension
   validates against a strict schema, wraps them in extension-owned `CommandNode`
   values, and never executes page code. On invoke, the page runs its own callback;
   the extension only sends an ID. Registrations are session-only, capped, top-frame
   only, and carry no privileges. No `eval`, no `new Function`, no CSP changes.
2. **Why two `<all_urls>` content scripts** — a keyboard-summoned palette must exist
   on every page; the MAIN-world shim only installs `window.Monocle` and relays
   validated messages.
3. **Keystroke handling scope** — the global listener only suppresses/forwards keys
   matching registered keybindings or sequence prefixes
   (`shared/hooks/useGlobalKeybindings.tsx`); it is not a keylogger and nothing
   leaves the device.
4. **Native Bridge** — off by default; requires a separately installed native host;
   optional `nativeMessaging` permission; bearer-token (hashed) Bluetooth-style
   pairing; loopback-only; per-client revoke; command execution gated behind a second
   `allowExecution` opt-in with confirm/automation/debug commands always denied.
5. **Extension-to-Extension** — peers announce via `onMessageExternal`; the user
   approves each peer on the Integrations page; identity is the browser-verified
   extension id; commands are declarative; approval is revocable.
6. **A test page** demonstrating the site SDK (point at the fixtures in `server/`,
   or host a static demo) so the reviewer can exercise the postMessage channel.

## Verified non-issues

- **Workflow automation / automations** — the executor (`content/workflow/`)
  interprets a fixed, bundled step vocabulary; documents are locally stored config
  validated by `shared/types/automationValidation.ts` and interpreted by
  `background/automations/engine.ts`. Nothing is fetched remotely; no code is
  evaluated. Keep the listing honest ("automations" / "user-defined commands" — avoid
  "scripting" language) and name these files in reviewer notes. See
  [automations.md](./automations.md).
- **mathjs is hardened** — the calculation engine (`background/calculations/mathInstance.ts`)
  disables injection functions (`import`, `evaluate`, `parse`, `createUnit`, …) and
  lives in the background bundle only. Not a remote-code path.
- **SVG icons render as `data:` URIs** — validated (no scripts/handlers/external
  refs) and rendered via `<img src="data:image/svg+xml,…">`, never injected as HTML
  (`shared/utils/svg-icon.ts`).
- **Network surface** — required hosts remain Unsplash and DuckDuckGo. Outbound
  Automations add arbitrary HTTPS and exact-loopback HTTP only after a concrete
  optional scheme+host grant and Firefox data consent; requests omit ambient
  credentials/referrers, reject redirects/retries/private windows, and cap both
  directions at 64 KiB. There is no analytics or telemetry.
- **Storage** — local-only; no `storage.sync`; nothing transmitted off-device except
  the opt-in bridge flow above. Bridge tokens are stored hashed.
- **Clipboard** — write-only (`shared/hooks/useCopyToClipboard.tsx` and the automation
  engine's privileged `clipboardWrite` op). No clipboard *read* path; clipboard is not
  in the content workflow vocabulary.
- **`server/`** — a local dev fixture server, not referenced by the extension at
  runtime; `localhost` appears in the CSP only for dev `serve` builds.

## Operational notes

- **Unsplash API key** — baked into the bundle at build time
  (`background/messages/getUnsplashBackground.ts`; the `EXTENSION_PUBLIC_`-prefixed
  env name guarantees embedding). Anyone can extract it and burn the rate limit. Not a
  rejection issue, but reviewers notice embedded keys — consider proxying the request
  or shipping gradient-only until a proxy exists.
- **Wildcard `optional_host_permissions`** — Outbound Automations now make the
  arbitrary-host consumer explicit. Keep the declaration, concrete-grant UI,
  privacy policy, and dashboard justification aligned; reviewers scrutinize
  broad host access even when optional.
- **Chrome `key` ↔ host `allowed_origins`** — pinning the key is a prerequisite for the
  Chrome bridge path (see hard blocker 3).
- **License** — PolyForm Noncommercial 1.0.0 (`package.json`). Neither store objects
  to source-available licenses; irrelevant to review.

## Prep order

1. Fix the hard blockers: version sync, gecko id, **pin the Chrome `key`** (and set
   the bridge host `allowed_origins` to match), privacy policy, and the corrected
   `data_collection_permissions` block (`required:["none"]` + opt-in `optional`).
2. Add the documented Outbound Automations justification for wildcard
   `optional_host_permissions` to the store dashboards and privacy policy.
3. Write reviewer notes and the Chrome single-purpose / permission justification copy
   (these share most of their content), including the Native Bridge and
   Extension-to-Extension notes.
4. Build and verify the Firefox source archive: clean clone, README with corepack/pnpm
   v11 + Node version, confirm `pnpm install && pnpm run build:firefox` reproduces the
   package with **no diff** on a machine matching the reviewer environment.
5. Prepare listing assets (128px icon, screenshots of the real packaged build,
   promo-word-free copy that tells the single-purpose / vertical-search story and
   discloses the NTP override, all-pages overlay, outbound automations, Native Bridge,
   and Extension-to-Extension).
6. Submit Firefox first; then Chrome, pointing to the live AMO listing.

## Readiness checklist

The concrete hand-off for the store-readiness code round:

- [ ] Sync manifest version with `package.json` (`wxt.config.ts`).
- [ ] Set `browser_specific_settings.gecko.id` to a controlled-domain id.
- [ ] Pin the Chrome `key` in the manifest; set `apps/bridge` host `allowed_origins`
      to the resulting extension id.
- [x] Add the `data_collection_permissions` block (`required:["none"]` + the six
      outbound opt-in categories); category names re-verified 2026-07-11.
- [ ] Publish the Outbound Automations justification for
      `optional_host_permissions: ["http://*/*","https://*/*"]`.
- [ ] Decide Unsplash key handling (proxy vs gradient-only vs ship-as-is).
- [ ] Author the privacy policy + Limited Use disclosure string; wire the URL.
- [x] Verify the Firefox build emits `background.scripts` (event page).
- [ ] Confirm reproducible Firefox build (no diff) + write the source-archive README.
- [ ] Produce listing assets (128px store icon, real-build screenshots, copy).
- [ ] Draft reviewer notes (site SDK, two `<all_urls>` scripts, keystroke scope,
      Native Bridge, Extension-to-Extension, Outbound Automations, test page).

## Sources

External policy was researched in June 2026; Firefox built-in consent was
re-checked on 2026-07-11. Re-verify everything before submitting:

- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Chrome quality-guidelines FAQ (single purpose / NTP vertical search)](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
- [Chrome Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Chrome disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)
- [Chrome 2025 policy updates (one appeal per violation)](https://developer.chrome.com/blog/cws-policy-updates-2025)
- [Chrome native messaging concept doc (no `native_connections`; host `allowed_origins`)](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Mozilla: data collection consent changes for new extensions (2025-10-23)](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/)
- [Firefox built-in data consent (categories, transmission definition)](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Firefox source-code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
