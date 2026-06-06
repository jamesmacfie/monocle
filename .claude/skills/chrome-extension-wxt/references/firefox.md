# Firefox Extension Development with WXT

Differences between Firefox and Chrome extensions, Firefox-only capabilities, and how to handle both browsers from a single WXT codebase.

**Official Documentation:**
- Firefox Extension Workshop: https://extensionworkshop.com
- MDN WebExtensions: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- Chrome incompatibilities: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities
- API support tables: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs

## Quick Reference: Firefox vs Chrome

| Feature | Firefox | Chrome |
|---------|---------|--------|
| API namespace | `browser.*` (and `chrome.*` alias) | `chrome.*` only |
| Async style | Promises everywhere | Promises (MV3), callbacks (MV2) |
| MV3 background | Event page (`background.scripts`) | Service worker (`background.service_worker`) |
| MV3 host permissions | Optional — user can grant/revoke at any time | Granted at install (revocable since Chrome 132) |
| Extension ID | `browser_specific_settings.gecko.id`, required to sign | Derived from `key` / store |
| Extension URLs | `moz-extension://<random-UUID-per-install>/` | `chrome-extension://<fixed-id>/` |
| Sidebar | `sidebar_action` + `sidebarAction` API | `side_panel` + `sidePanel` API |
| Message cloning | Structured clone (richer types) | JSON serialization |
| Store | addons.mozilla.org (AMO), source ZIP required | Chrome Web Store |
| Default WXT manifest version | MV2 (override with `--mv3`) | MV3 |

## Building for Firefox with WXT

### Commands

```bash
# Dev mode — launches Firefox automatically via web-ext
wxt -b firefox

# Firefox still defaults to MV2 in WXT; pass --mv3 explicitly for MV3
wxt -b firefox --mv3
wxt build -b firefox --mv3
wxt zip -b firefox --mv3
```

Typical package.json scripts:

```json
{
  "scripts": {
    "dev:firefox": "wxt -b firefox --mv3",
    "build:firefox": "wxt build -b firefox --mv3",
    "build:firefox:zip": "wxt zip -b firefox --mv3"
  }
}
```

### Compile-Time Browser Detection

WXT exposes build-target constants — dead branches are tree-shaken out of the other browser's bundle:

```typescript
if (import.meta.env.FIREFOX) {
  // Firefox-only code
}

if (import.meta.env.BROWSER === 'firefox') {
  // Equivalent
}

if (import.meta.env.MANIFEST_VERSION === 2) {
  // MV2-only code
}
```

### Per-Browser Entrypoints

```typescript
// entrypoints/sidebar.content.ts — only included in Firefox builds
export default defineContentScript({
  include: ['firefox'],
  matches: ['<all_urls>'],
  main(ctx) {},
});
```

```html
<!-- HTML entrypoints: exclude from Firefox builds -->
<meta name="manifest.exclude" content="['firefox']" />
```

### Per-Browser Manifest

The `manifest` config accepts a function receiving `{ browser, command, manifestVersion }`:

```typescript
export default defineConfig({
  targetBrowsers: ['chrome', 'firefox'],
  manifest: ({ browser }) => ({
    permissions:
      browser === 'firefox'
        ? ['storage', 'activeTab', 'contextualIdentities']
        : ['storage', 'activeTab'],
    browser_specific_settings: {
      gecko: { id: 'my-extension@example.com' },
    },
  }),
});
```

Chrome warns about unknown keys like `browser_specific_settings` but ignores them, so it is safe to declare unconditionally.

### Post-Processing the Generated Manifest

WXT may emit Chromium-only manifest fields that Firefox's validator rejects. Strip them with the `build:manifestGenerated` hook:

```typescript
export default defineConfig({
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser === 'firefox' && wxt.config.manifestVersion === 3) {
        // Firefox MV3 doesn't support the CSP `sandbox` key
        if (typeof manifest.content_security_policy === 'object') {
          delete manifest.content_security_policy.sandbox;
        }
        // Firefox doesn't support use_dynamic_url on web_accessible_resources
        manifest.web_accessible_resources?.forEach((resource) => {
          if (typeof resource === 'object') {
            delete resource.use_dynamic_url;
          }
        });
      }
    },
  },
});
```

### Dev Browser Configuration

Configure which Firefox binary WXT launches in `web-ext.config.ts` (git-ignored) or `wxt.config.ts`:

```typescript
// web-ext.config.ts
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  binaries: {
    firefox: 'firefoxdeveloperedition',
  },
  firefoxArgs: ['--profile=/path/to/profile'],
  // disabled: true, // load the extension manually instead
});
```

## API Namespace and Promises

- Firefox's primary namespace is `browser.*` and every async API returns a Promise. It also aliases `chrome.*` for compatibility.
- Chrome only has `chrome.*`. MV3 supports promises; MV2 is callback-only.

WXT's `browser` export handles this — it is **not** a polyfill, just the right global:

```typescript
import { browser } from 'wxt/browser';
// = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome

// Promise style works in both browsers under MV3
const tabs = await browser.tabs.query({ active: true });
```

Types come from the `Browser` namespace:

```typescript
import { type Browser } from 'wxt/browser';

function handleMessage(message: unknown, sender: Browser.runtime.MessageSender) {}
```

Because API surface differs per browser, feature-detect at runtime — TypeScript types won't catch a missing API:

```typescript
// Optional chaining for APIs that may not exist in this browser
browser.sidebarAction?.toggle();

if (browser.contextualIdentities) {
  const containers = await browser.contextualIdentities.query({});
}
```

## Manifest Differences

### `browser_specific_settings.gecko` (Required for MV3 Signing)

Firefox MV3 extensions **must** declare an add-on ID to be signed (AMO or self-distributed):

```json
{
  "browser_specific_settings": {
    "gecko": {
      "id": "my-extension@example.com",
      "strict_min_version": "115.0",
      "data_collection_permissions": {
        "required": ["none"]
      }
    },
    "gecko_android": {}
  }
}
```

- `id`: email-like format (`name@example.com`, `@addon-name`) or GUID. Max 80 chars. AMO enforces uniqueness.
- `strict_min_version`: minimum Firefox version. Updates require ≥ 115.0 (ESR) or 128.0 due to the March 2025 root certificate expiry.
- `data_collection_permissions`: **required for new AMO submissions since November 3, 2025.** Declare collected data types (`browsingActivity`, `websiteContent`, `locationInfo`, …) or `["none"]`.
- `gecko_android`: presence (even `{}`) marks Firefox for Android support.

### Background: Event Pages, Not Service Workers

Firefox MV3 does **not** support `background.service_worker`. It uses non-persistent event pages:

```json
// Firefox MV3
"background": { "scripts": ["background.js"] }

// Chrome MV3
"background": { "service_worker": "background.js", "type": "module" }
```

WXT generates the correct key per target from a single `entrypoints/background.ts`. Practical consequences for shared background code:

- Don't use service-worker-only globals (`self.skipWaiting`, SW lifecycle events).
- DOM APIs technically exist in Firefox's event page but not in Chrome's worker — don't rely on them if you target both.
- Both are non-persistent: persist state in `storage`, re-register listeners synchronously at the top level of `main()`.
- `alert()` / `confirm()` / `prompt()` are **not** available in Firefox background pages (Chrome MV2 background pages had them; MV3 workers don't either).

### Sidebar vs Side Panel

```json
// Firefox
"sidebar_action": {
  "default_panel": "sidebar.html",
  "default_title": "My Sidebar",
  "default_icon": "icon.png"
}

// Chrome
"side_panel": { "default_path": "sidepanel.html" },
"permissions": ["sidePanel"]
```

APIs differ too: Firefox `browser.sidebarAction.open()/close()/toggle()` vs Chrome `chrome.sidePanel.open()`. Declare both keys (each browser ignores the other's) or branch in the manifest function, and feature-detect in code.

### Content Security Policy

- Firefox MV3 only allows `'self'` and `'wasm-unsafe-eval'` in `script-src` — no remote code, same spirit as Chrome.
- Firefox does **not** support the `sandbox` property inside `content_security_policy` (strip it — see hook above).
- `localhost` script sources for dev/HMR must be added explicitly in dev builds.

### web_accessible_resources

- Firefox supports `resources`, `matches`, and `extension_ids` but **not** `use_dynamic_url`.
- Firefox already serves each install from a random UUID origin (`moz-extension://<uuid>/`), which is its built-in equivalent to dynamic URLs — pages can't fingerprint your extension by probing a fixed URL.
- Corollary: never hardcode extension URLs; always use `browser.runtime.getURL('/path')`.

## Permission Behavior Differences

The biggest MV3 behavioral difference:

- **Firefox:** `host_permissions` are treated as *optional*. They appear in the install prompt (Firefox 127+), but users can grant or revoke any host permission at any time from about:addons. Never assume host access.
- **Chrome:** `host_permissions` are granted at install (user revocation UI exists but defaults to granted).

Defensive pattern that works in both browsers:

```typescript
async function ensureHostAccess(origin: string): Promise<boolean> {
  const granted = await browser.permissions.contains({ origins: [origin] });
  if (granted) return true;
  // Must be called from a user input handler (click, command, etc.)
  return await browser.permissions.request({ origins: [origin] });
}
```

Notes:

- `permissions.request()` requires a user gesture in both browsers. Firefox is stricter about what counts as a gesture and where the call can originate — prefer requesting directly from the UI event handler rather than round-tripping through the background.
- Listen to `browser.permissions.onAdded` / `onRemoved` to keep UI state in sync; the browser's permission state is authoritative, not your cached copy.
- `optional_permissions` work in both browsers; Firefox additionally exposes per-site controls to users that Chrome does not.

## APIs Firefox Has That Chrome Doesn't

| API | Description |
|-----|-------------|
| `contextualIdentities` | Firefox Containers — list/create/update container identities; open tabs in a container via `tabs.create({ cookieStoreId })`. Requires the `contextualIdentities` permission. |
| `sidebarAction` | Control the extension sidebar (`open`, `close`, `toggle`, set panel/icon/title). |
| `menus` | Superset of `contextMenus`: extra context types (`bookmark`, `tab`, `tools_menu`), icons on items, `menus.overrideContext()`. The `contextMenus` alias also works. |
| `find` | Programmatic find-in-page with match highlighting (`find.find()`, `find.highlightResults()`). |
| `search` | Query installed search engines and run a search with a specific engine (`search.get()`, `search.search()`). Chrome's `chrome.search` is a more limited cousin (default engine only). |
| `dns` | Resolve hostnames from the extension. |
| `theme` | Read and dynamically set the browser theme (`theme.update()`). |
| `captivePortal` | Detect captive-portal network state. |
| `pkcs11` | Enumerate PKCS #11 security modules for keys/certificates. |
| `pageAction` (MV3) | Firefox keeps `page_action` as a separate API in MV3; Chrome merged it into `action`. |

Firefox-specific behavior worth knowing:

- `tabs.Tab` has extra fields like `cookieStoreId` (container) and `isArticle` (Reader Mode eligible); `tabs.toggleReaderMode()` is Firefox-only.
- `webRequest` blocking is still available in Firefox MV3 (Chrome MV3 removed blocking in favor of `declarativeNetRequest`; Firefox supports **both**).
- `userScripts` exists in both, but Firefox's MV3 version is incompatible with its MV2 version, and AMO only approves its use for user-script managers.

## APIs Chrome Has That Firefox Doesn't

| API | Notes / Firefox alternative |
|-----|------------------------------|
| `sidePanel` | Use `sidebarAction` + `sidebar_action`. |
| `offscreen` | Not needed — Firefox event pages can use DOM APIs directly. |
| `debugger` | Not supported ([bug 1316741](https://bugzil.la/1316741)). |
| `declarativeContent` | Not supported ([bug 1435864](https://bugzil.la/1435864)); use `pageAction` show/hide or content scripts. |
| `identity.getAuthToken()` | Not supported — use `identity.launchWebAuthFlow()` (supported in both) for OAuth. |
| `tts` / `ttsEngine` | Not supported; use the standard Web Speech API where possible. |
| `gcm` / `instanceID` | Not supported. |
| `enterprise.*` | Not supported. |

Always feature-detect (`chrome.sidePanel?.open`) rather than branching on user-agent.

## Content Script Differences

These are subtle and cause real cross-browser bugs:

- **Isolation model:** Firefox uses Xray vision — the content script global is *not* `window`, and you cannot share variables with the page via `window.foo = x`. Chrome's isolated world shares the `window` identity (but not JS variables). To talk to the page, use `window.postMessage`, a `world: 'MAIN'` script, or DOM events.
- **`window.eval()`:** in Firefox it runs in the *page* context; in Chrome it runs in the *content script* context. Avoid it entirely.
- **Event handler properties:** assigning `element.onclick = fn` in a Firefox content script overwrites the page's handler (single slot shared with the page). Always use `addEventListener()`.
- **Navigation lifecycle:** Chrome destroys content scripts on navigation; Firefox keeps the script alive but tears down `window` properties. Listen for `pageshow` / `pagehide` if you need symmetric behavior.
- **fetch/XHR URLs:** relative URLs in Firefox content scripts resolve against the *extension* origin; in Chrome they resolve against the *page* origin. Always use absolute URLs.
- **Injected CSS `url()`:** Firefox resolves relative to the CSS file, Chrome relative to the page. Use absolute URLs or `browser.runtime.getURL()`.
- **Cross-origin requests:** prohibited from MV3 content scripts in both browsers — proxy them through the background script.

WXT's `createShadowRootUi()` works identically in both browsers and sidesteps most style-isolation differences.

## Messaging and Data Cloning

Firefox clones messages with the **structured clone algorithm**; Chrome uses **JSON serialization**. Things that work in Firefox but break in Chrome: `Map`, `Set`, `Date`, `RegExp`, `Blob`, circular references. Things that differ the other way: objects with a `toJSON()` method JSON-serialize in Chrome but may not structured-clone.

For cross-browser safety, keep messages plain-JSON:

```typescript
await browser.runtime.sendMessage(JSON.parse(JSON.stringify(payload)));
```

## Other Runtime Differences

- **Notifications:** `iconUrl` is optional in Firefox, required in Chrome. Firefox clears a notification immediately on click; Chrome persists it. Rapid sequential `notifications.create()` calls may drop notifications in Firefox.
- **`windows.onFocusChanged`:** fires multiple times per focus change in Firefox, once in Chrome — debounce it.
- **`tabs.remove()`:** Firefox's promise resolves *after* `beforeunload`; Chrome's callback doesn't wait.
- **Zoom:** persists across navigation in Firefox; per-origin reset behavior differs in Chrome (`tabs.ZoomSettingsScope`).
- **`commands` (keyboard shortcuts):** both support `commands`; Firefox lets users edit shortcuts via about:addons and supports `commands.update()` for programmatic rebinding (Chrome's equivalent is the chrome://extensions/shortcuts page only).
- **Native messaging:** manifest key is `allowed_extensions` (Firefox) vs `allowed_origins` (Chrome); host manifest locations differ; Firefox kills native subprocesses when the connection closes.
- **Proxy:** `proxy.onRequest` (Firefox) and `chrome.proxy` (Chrome) are completely incompatible designs.

## Development and Debugging

```bash
wxt -b firefox   # launches Firefox with the extension via web-ext
```

- **Inspect the extension:** `about:debugging#/runtime/this-firefox` → your extension → **Inspect** (background, popup, sidebar consoles).
- **Browser Console** (`Cmd/Ctrl-Shift-J`): aggregated logging across all extension contexts.
- **Temporary install:** "Load Temporary Add-on…" in about:debugging loads an unsigned build until restart — no `gecko.id` needed for temporary installs (Firefox generates one).
- **Manifest validation:** Firefox is stricter than Chrome; check the Browser Console for manifest warnings right after loading. `web-ext lint` (which AMO also runs) catches most issues:

```bash
npx web-ext lint --source-dir .output/firefox-mv3
```

## Publishing to AMO

Unlike Chrome, **all** Firefox extensions must be signed by Mozilla — even self-distributed ones.

```bash
# Produces both the extension ZIP and a sources ZIP
wxt zip -b firefox --mv3
```

AMO requires a **source code ZIP** because reviewers rebuild bundled/minified extensions. WXT generates it automatically and excludes config/hidden/test files, but verify it can actually rebuild:

- Include a `README.md` or `SOURCE_CODE_REVIEW.md` with exact build commands and Node/pnpm versions.
- The build from extracted sources must be byte-identical to the submitted ZIP — local `.env` files can change chunk hashes; delete them or use `zip.includeSources`.
- For private registries, use `zip.downloadPackages` so you don't ship auth tokens to reviewers.

Automated submission:

```bash
wxt submit --dry-run \
  --firefox-zip .output/{name}-{version}-firefox.zip \
  --firefox-sources-zip .output/{name}-{version}-sources.zip
```

Required environment variables: `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` (API keys from https://addons.mozilla.org/developers/addon/api/key/).

## Firefox for Android

Firefox for Android (Fenix, 120+) supports an open extension ecosystem from AMO:

- Opt in with `browser_specific_settings.gecko_android` (even `{}`).
- No `windows` API on Android; `browserAction`/`action` popups behave differently (full-screen).
- Test with `web-ext run --target firefox-android`.

## Cross-Browser Checklist

When a single WXT codebase targets both browsers:

1. Use `browser` from `wxt/browser` and promise-style APIs everywhere.
2. Declare `browser_specific_settings.gecko.id` (+ `data_collection_permissions` for new AMO listings).
3. Keep background code free of service-worker-only and DOM-only assumptions.
4. Treat all host permissions as revocable; check `permissions.contains()` before privileged work.
5. Feature-detect optional APIs (`browser.sidebarAction?`, `chrome.sidePanel?`) — never user-agent sniff.
6. Keep runtime messages plain-JSON serializable.
7. Use absolute URLs in content script fetches and `runtime.getURL()` for extension resources.
8. Strip Chromium-only manifest fields (`use_dynamic_url`, CSP `sandbox`) in a `build:manifestGenerated` hook.
9. Run `web-ext lint` against the Firefox build output before submitting.
10. Smoke-test both targets — `wxt -b chrome` and `wxt -b firefox --mv3` — for permission prompts, keyboard shortcuts, and content script UI.
