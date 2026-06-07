# Store Submission

Research-backed guide to publishing Monocle on the Chrome Web Store and
Firefox Add-ons (AMO): what each review process involves, where Monocle is at
risk of rejection, what is verified to be safe, and the prep work required
before first submission.

Unlike the other docs in this folder, this one describes **external review
policy as researched in June 2026**, not code behavior. Store policies change;
re-verify the hard rules (especially Chrome single-purpose enforcement and
Mozilla's data-collection manifest requirements) before actually submitting.
Code citations below follow the usual doc conventions and describe verified
current behavior.

## Summary risk read

| Store | First-pass outlook | Dominant risk |
| --- | --- | --- |
| Chrome Web Store | Approvable, but expect manual review and possibly one rejection cycle | Single-purpose policy: new-tab override + all-pages overlay + broad command set |
| Firefox AMO | Low risk **if** the mechanical prep is done; near-certain signing rejection if not | Process compliance (source archive, `data_collection_permissions`), not architecture |

Two commonly feared areas turned out to be in good shape:

- **The site SDK is policy-safe.** Pages supply declarative data only; the
  extension never executes page-supplied code (see
  [Site SDK and remote-code policy](#site-sdk-and-remote-code-policy)).
- **The permission structure is what reviewers want.** The required set is
  minimal (`activeTab`, `storage`, `scripting`); everything sensitive (`tabs`,
  `history`, `bookmarks`, `cookies`, `browsingData`, `downloads`, `sessions`)
  is optional, requested on demand, and re-checked at execution time
  (`background/utils/permissions.ts`, `ensurePermissions`).

## Hard blockers (fail before a human reviews)

These must be fixed before either store will accept a submission:

1. **Icons.** The manifest declares a single 48px icon
   (`wxt.config.ts`, the `icons` block). Chrome requires a 128×128 store icon
   and at least one screenshot in the listing; missing either is an automatic
   rejection. Provide 16/32/48/128 manifest icons plus listing assets.
2. **Firefox `data_collection_permissions`.** Mandatory for all new
   extensions submitted to AMO since November 2025, under
   `browser_specific_settings.gecko`. Omitting it or declaring it incorrectly
   is rejected at the signing step. With the Google Search command removed
   (the former search-terms transmission to `google.com/complete/search`),
   Monocle has no off-device user-data flow and can declare
   `"required": ["none"]`. Re-audit this if any command that transmits typed
   input is added later.
3. **Firefox source-code submission.** The shipped output is minified
   WXT/Vite bundles, which makes a source archive mandatory: full pre-build
   source, `pnpm-lock.yaml`, and a README with exact build steps. The reviewer
   default environment is Ubuntu 24.04 / Node 24 / npm — the README must spell
   out the corepack + pnpm v11 requirement and the exact commands
   (`pnpm install`, `pnpm run build:firefox`). The build must reproduce the
   submitted package on the reviewer's machine. All dependencies must come
   from official package registries during the build.
4. **Privacy policy.** Under Chrome's definition, reading page content
   (`content/workflowExecutor.ts`) and capturing keystrokes for keybindings
   (`shared/hooks/useGlobalKeybindings.tsx`) count as "handling user data" —
   even when local-only. A privacy policy URL
   and accurate data-disclosure checkboxes in the dashboard are required;
   a missing policy is a hard rejection on Chrome.
5. **Gecko ID.** `browser_specific_settings.gecko.id` is currently
   `ff@monocle.com` (`wxt.config.ts`), a domain not owned by this project. The
   ID is permanent once published — it is the update identity and can never
   change. Set it to an ID on a controlled domain (or a braced GUID) before
   first submission.
6. **Version mismatch.** Manifest version is `0.0.1` (`wxt.config.ts`) while
   `package.json` says `0.1.0`. Cosmetic, but sync before submitting.

## Chrome Web Store

### Process

- One-time $5 developer registration fee.
- Single review pipeline mixing automated and manual review; no fast lane.
  Typical turnaround is days, can stretch to weeks. Broad content-script
  matches, new developers, and large codebases all push toward manual review —
  Monocle will hit all three.
- The dashboard's Privacy practices tab must be completed before publishing:
  single-purpose description, per-permission justifications, broad-host
  justification, remote-code declaration, data-collection disclosures, and a
  privacy policy link.
- **One appeal per violation** (policy since January 2025). Re-appeals after a
  verdict are not allowed, so listing copy and justifications deserve real
  care before the first submission, and any appeal must be complete the first
  time.

### Single purpose — the biggest genuine risk

Chrome's single-purpose policy accepts either "one narrow focus area" or "one
browser function." Monocle spans a new-tab page replacement, an all-pages
overlay, and a command set covering tabs, history, bookmarks, downloads,
calculator, site commands, and workflow automation. The policy
docs do not directly address an NTP-override + content-overlay combination —
it is a genuine grey area decided by the reviewer you draw.

The defense: **one browser function — command launching — rendered in two
contexts.** "Raycast for the browser," not a productivity suite. For this to
hold, the store listing, the single-purpose dashboard field, and the
screenshots must all tell the same one-sentence story. Avoid "suite,"
"all-in-one," or feature-list framing anywhere in the listing.

Sub-risks inside this:

- **NTP search rules.** Extensions overriding the new tab page may not alter
  the user's search experience except via the `chrome.search` API. With the
  Google Search command removed, Monocle no longer ships a web-search surface,
  which takes this off the table. If a search command returns, route it
  through `chrome.search.query()` on the new tab or be ready to defend it.
- **Fallback plan.** If rejected on single-purpose grounds, the levers are:
  make the NTP override opt-in, or split the new-tab experience into a
  separate listing. Decide the appeal-vs-restructure call before burning the
  single allowed appeal.

### Permissions

- Required set is minimal: Chrome gets `scripting`, `activeTab`, `storage`
  (`wxt.config.ts`).
- `host_permissions` is two specific hosts (`api.unsplash.com`,
  `icons.duckduckgo.com`), not `<all_urls>`.
- All sensitive permissions are optional and requested at runtime
  (`background/messages/requestPermission.ts`), then re-verified at execution
  time (`background/utils/permissions.ts`). This is the pattern reviewers ask
  for.
- The real flag is the **two `<all_urls>` content scripts**: the palette
  overlay (`entrypoints/content.tsx`) and the MAIN-world site-SDK shim
  (`entrypoints/site-sdk.content.ts`). This guarantees manual review. The
  justification is legitimate — a keyboard-summoned palette must be present on
  every page — but it must be written tightly in the dashboard, tied to the
  single stated purpose.

### Site SDK and remote-code policy

Chrome's MV3 remotely-hosted-code policy allows loading external **data** but
prohibits external **logic**, with an explicit catch-all: "building an
interpreter to run complex commands fetched from a remote source, even if
those commands are fetched as data." Monocle's site SDK is on the right side
of this line, verified against the code:

- Registration is purely declarative. Page callbacks never cross the
  boundary — they stay in page memory and are replaced with string
  `callbackId` references before serialization
  (`content/siteSdkFacade.ts`).
- On execution, the extension runs no page-supplied logic. The background
  executor (`background/commands/siteSdk/commands.ts`, `invokeSiteSdk`) sends
  an invoke message back to the owning tab, and **the page runs its own
  callback in its own world**. There is no interpreter to point at.
- No `eval`, `new Function`, string-arg timers, `innerHTML`, or CSP
  relaxation anywhere in the codebase (verified by repo-wide search).
- Declarations are schema-validated (`shared/types/siteSdk.ts`, strict Zod),
  capped (20 registrations, 100 commands, depth 5), session-only
  (`background/commands/siteSdk/registry.ts`), top-frame only, and trust is
  derived from the extension message sender, not page-supplied data
  (`background/commands/siteSdk/scope.ts`).
- SDK commands carry no `permissions` field and cannot bind custom
  keybindings (`background/commands/siteSdk/commands.ts`).

The residual risk is **reviewer comprehension, not policy**. A MAIN-world
content script plus a postMessage command channel pattern-matches on known
abuse vectors (the Urban VPN postMessage-command-injection incident is the
canonical example reviewers know). Pre-empt this in reviewer notes — see
[Reviewer notes](#reviewer-notes-both-stores).

### Other Chrome rules to respect

- NTP override must use `chrome_url_overrides` (it does — `wxt.config.ts`).
- No banned promotional words in the listing: "Free," "Best," "Top," "#1,"
  "Award-winning," etc.
- Functionality must match the listing exactly. Do not list or imply the
  unimplemented workflow operations (`shared/types/workflow.ts` declares far
  more than `content/workflowExecutor.ts` implements — only `click` and
  `wait` exist). "Claimed features not directly provided" is a rejection
  category.
- Fake or mismatched screenshots are a fast rejection; screenshot the real
  packaged build.

## Firefox AMO

### Process

- All add-ons must be signed by Mozilla. Listed submissions pass automated
  validation, get signed (typically within 24 hours), and may receive human
  review before or after publication. Human review, when triggered, ranges
  from hours to weeks; broad permissions and source-code involvement push
  toward it.
- A rejected version is simply not distributed; resubmission means uploading
  a new version that addresses only the cited feedback. Bundling unrelated
  changes into a corrective version causes further delays.
- Firefox MV3 differences that matter here:
  - The background must be declared as `background.scripts` (event page),
    not only `service_worker`. The WXT config branches per-browser
    (`wxt.config.ts`); verify the firefox-mv3 output manifest emits
    `scripts` before submitting.
  - Host permissions are not auto-granted in Firefox MV3 — users opt in
    per-site. This softens the `<all_urls>` concern relative to Chrome.
  - Mozilla still supports MV2, but new submissions should target MV3 (the
    `build:firefox` script already does).

### Mozilla-specific hard rules

- **No remote code, no CSP relaxation.** Verified clean (see the site SDK
  section above). Fetching and parsing remote JSON/data is explicitly
  permitted; executing it is not.
- **No remote new-tab page.** The new-tab document and scripts must be local.
  Monocle's new tab is fully local (`entrypoints/newtab/`); the Unsplash
  background is a remote *image* fetch
  (`background/messages/getUnsplashBackground.ts`), which is permitted.
- **Data-disclosure mismatch** between the `data_collection_permissions`
  declaration and actual behavior is a classic rejection. No off-device
  user-data flow remains (the Google autosuggest transmission was removed
  with the Google Search command); everything is local `chrome.storage` /
  `localStorage` (`background/commands/settings.ts`,
  `background/commands/usage.ts`, `background/commands/favorites.ts`,
  `newtab/backgroundImageModel.ts`).
- **Unexpected functionality must be disclosed.** The listing must clearly
  state: the new-tab override, the global keyboard shortcut, all-pages
  injection, and the site-defined-commands feature. Mozilla's opt-in
  expectation for settings changes has a carve-out when the feature is the
  add-on's clear advertised purpose — so the new-tab override must be
  headline listing copy, not a buried side effect.
- The AMO linter will warn on `innerHTML` in React's compiled output. This is
  a known, benign framework warning — it does not block, provided no remote
  or untrusted content is ever assigned (none is).

## Reviewer notes (both stores)

Both stores accept reviewer notes. Monocle's should explain, explicitly and
up front:

1. **Site SDK architecture** — pages post declarative descriptors; the
   extension validates them against a strict schema, wraps them in
   extension-owned `CommandNode` values, and never executes page code. On
   invoke, the page runs its own callback; the extension only sends an ID.
   Registrations are session-only, capped, top-frame only, and carry no
   privileges. Spell out: no `eval`, no `new Function`, no CSP changes.
2. **Why two `<all_urls>` content scripts** — a keyboard-summoned palette
   must exist on every page; the MAIN-world shim only installs
   `window.Monocle` and relays validated messages.
3. **Keystroke handling scope** — the global listener only suppresses and
   forwards keys matching registered keybindings or sequence prefixes
   (`shared/hooks/useGlobalKeybindings.tsx`); it is not a keylogger and
   nothing leaves the device.
4. **A test page** demonstrating the site SDK (point at the fixtures served
   by `server/`, or host a static demo page) so the reviewer can exercise the
   postMessage channel themselves.

On AMO, attach these notes plus the source archive; clear notes are the
single biggest lever for shortening human review.

## Verified non-issues

- **Workflow automation**: only `click` and `wait` are implemented
  (`content/workflowExecutor.ts`), triggered solely by explicit command
  execution routed through `background/workflows/execution.ts`. Both stores
  host far more aggressive automation tools. Just keep the listing honest
  about what is implemented.
- **Network surface**: exactly two external hosts, both matching declared
  `host_permissions` and CSP — Unsplash backgrounds and DuckDuckGo favicons
  (`background/utils/favicon.ts`). No analytics or telemetry of any kind.
- **Storage**: local-only; no `storage.sync`, nothing transmitted off-device.
- **Clipboard**: write-only, via explicit copy commands
  (`shared/hooks/useCopyToClipboard.tsx`). The clipboard workflow types are
  declared but unimplemented.
- **`server/`**: a local dev fixture server, not referenced by the extension
  at runtime; `localhost` appears in the CSP only for dev `serve` builds.

## Operational notes

- **Unsplash API key**: baked into the bundle at build time
  (`background/messages/getUnsplashBackground.ts`). Anyone can extract it
  from the shipped extension and burn the rate limit. Not a store-rejection
  issue, but reviewers notice embedded keys. Consider proxying the request or
  shipping gradient-only until a proxy exists. Note the
  `EXTENSION_PUBLIC_`-prefixed env var name guarantees bundle embedding.
- **License**: PolyForm Noncommercial 1.0.0 (`package.json`). Neither store
  objects to source-available licenses; irrelevant to review.

## Prep order

1. Fix the hard blockers: icons, gecko ID, version sync, privacy policy,
   `data_collection_permissions` (now declarable as `"required": ["none"]`
   since the Google Search command was removed).
2. Write the reviewer notes and the Chrome single-purpose / permission
   justification copy. These share most of their content.
3. Build and verify the Firefox source archive: clean clone, README with
   corepack/pnpm v11 + Node version, confirm `pnpm install &&
   pnpm run build:firefox` reproduces the package on a machine matching the
   reviewer environment.
4. Prepare listing assets (128px icon, screenshots of the real packaged
   build, promo-word-free copy that tells the single-purpose story).
5. Submit Firefox first — its concerns are mechanical and fully satisfiable
   up front; Chrome's single-purpose interpretation risk benefits from having
   a live, reviewed AMO listing to point at.
