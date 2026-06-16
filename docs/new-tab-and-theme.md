# New Tab and Theme

Monocle replaces the browser's new-tab page with a dedicated React app that
renders the shared command palette on top of a clock and a full-bleed
background image, then layers a theme system (light / dark / system) that also
governs the content-script overlay. This doc covers the new-tab boot sequence,
the `isNewTab` context flag and how it shapes command loading, the clock,
background images (Unsplash fetch + cache + fallback), the permission-grant
panel, and the theme application mechanics shared across both runtime modes.
The theme *command* surface (labels, cycle order) is documented in
[commands/ui.md](commands/ui.md); the mechanics live here.

## How the new-tab page is wired

WXT discovers the entrypoint from the directory layout, not from an explicit
`chrome_url_overrides` block in `wxt.config.ts`:

- `entrypoints/newtab/index.html` is an HTML entrypoint. Its presence makes WXT
  emit `chrome_url_overrides.newtab` in the generated manifest automatically.
  The page mounts into `<div id="root">` and loads `./main.tsx` as a module.
- `entrypoints/newtab/main.tsx` is a one-liner: `import "../../newtab/scripts"`.
  Keeping logic out of `entrypoints/` matches the repo convention that
  entrypoints are thin shims over `newtab/`, `content/`, etc.
- `newtab/scripts.tsx` creates the React root on `#root` and renders
  `<NewTabApp />` inside `React.StrictMode`, importing `./styles.css`.
- `newtab/NewTabApp.tsx` is the app shell. It builds a palette `sendMessage`
  bound to `{ isNewTab: true }`, constructs the Redux store, and renders the
  page content.

There is no separate `chrome_url_overrides` literal to maintain; do not add one
unless you intend to override WXT's inference.

### Boot sequence (`newtab/NewTabApp.tsx`)

`NewTabApp` (the default export) does the store/messaging wiring; the inner
`NewTabAppContent` does the rendering and effects.

1. `createPaletteSendMessage({ isNewTab: true })` produces a messaging function
   that stamps every palette message with the new-tab context. It is memoized
   so the store is created once.
2. `createAppStore(sendMessageWithNewTab)` builds the Redux store, injecting the
   messaging function into thunks. `<Provider>` wraps `NewTabAppContent`.
3. On mount, `NewTabAppContent` dispatches `loadSettings()` and
   `loadPermissions()` (from `shared/store/slices/settings.slice.ts`) to hydrate
   the Redux mirror from `monocle-settings` and from the browser permission
   APIs.
4. A `themeMode` effect calls `applyThemeToDocument(themeMode)` whenever the
   selected theme mode changes (see [Theme system](#theme-system)).
5. A second effect installs a system-theme listener via
   `setupSystemThemeListener` *only* when `themeMode === "system"`, re-applying
   the theme when the OS preference flips.
6. A storage-change listener watches `chrome.storage.local` for changes to the
   `monocle-settings` key and re-dispatches `loadSettings()`. This is how the
   new-tab UI stays in sync after a command mutates settings (clock visibility,
   theme, etc.) without a full reload.

### Rendered layout

`NewTabAppContent` renders, in order:

| Element | Source | Notes |
| --- | --- | --- |
| `<BackgroundImage />` | `newtab/components/BackgroundImage.tsx` | Fixed, full-screen background behind everything. |
| `<Clock />` | `newtab/components/Clock.tsx` | Rendered only when `selectClockVisibility` is true. |
| `<PermissionGrantPanel />` | `newtab/components/PermissionGrantPanel.tsx` | Rendered only when a valid `?grantPermission=` query param is present. |
| `<NewTabCommandPalette autoFocus />` | `newtab/components/NewTabCommandPalette.tsx` | The shared palette, wrapped in `.raycast.new-tab-palette`. |
| Hint text | inline | "Press Cmd+Shift+K on any webpage…". |
| Listener components | `shared/components/Listeners/` | `CopyToClipboardListener`, `InsertTextListener`, `NewTabListener`, `ScrollListener`, `ScreenshotListener` — always mounted so background → tab messages (clipboard copy, snippet insert fallback, etc.) work on the new-tab page; see [messaging.md](./messaging.md). |
| `<ToastContainer />` | `shared/components/ToastContainer` | Shared toast host. |

The product scope here is intentionally a lightweight launcher surface
(palette + clock + background), not a dashboard.

## The `isNewTab` context flag

Both the palette messaging (`NewTabApp`) and the command fetch
(`NewTabCommandPalette` via `useGetCommands({ isNewTab: true })`) attach
`isNewTab: true` to the browser context. This single flag drives several
behaviors in the background:

- **New-tab-only commands are appended.** `background/commands/source.ts`
  pushes `newTabCommands` (from `background/commands/newTab/index.ts`) into the
  command set *only* when `context?.isNewTab` is true. On a normal page these
  commands never appear. Today `newTabCommands` is just `[clockCommand]`.
- **URL filtering is bypassed.** In `background/commands/query.ts`
  (`filterForContext` → `filterCommandsByUrl`), URL-rule filtering treats the
  new-tab page as having no meaningful page URL (the `!context.url ||
  context.isNewTab` condition), so contextual `urlRules` do not hide or surface
  commands there. See [url-filtering.md](url-filtering.md).
- **Keybindings resolve in new-tab context.** `useGlobalKeybindings({ isNewTab:
  true })` sends `monocle-keybinding-execute` with the new-tab context, and the
  background registry builds a context-aware snapshot, so a new-tab command's
  custom keybinding only matches when the incoming context includes `isNewTab`.
  See [keybindings.md](keybindings.md).

`NewTabCommandPalette.executeCommand` also has a small client-side
post-execution hook: after any command whose id `includes("clock")` or
`includes("settings")`, it dynamically imports and dispatches `loadSettings()`
to refresh the Redux mirror immediately (in addition to the storage-change
listener). It also re-runs `fetchCommands()` after every successful execution so
dynamic labels (for example the clock toggle's "Show/Hide Clock") update.

## Clock

The clock has two halves: a background settings command and a presentational
React component.

### Clock visibility command

`background/commands/newTab/clock.ts` defines:

- `clockCommand` — a `group` command (`id: "new-tab-clock"`, name "Clock") whose
  `children` resolver returns `[toggleClockVisibility]`. Supported on Chrome and
  Firefox.
- `toggleClockVisibility` — an `action` (`id: "toggle-clock-visibility"`) with
  dynamic `name`/`description` derived from current settings: it reads
  `getNewTabClockSettings()`, treats `show ?? true` as the current visibility,
  and labels itself "Hide Clock" / "Show Clock" accordingly. Its `execute`
  flips the value via `updateNewTabClockSettings({ show: !isCurrentlyVisible })`.

```ts
const toggleClockVisibility: CommandNode = {
  type: "action",
  id: "toggle-clock-visibility",
  name: async () => {
    const settings = await getNewTabClockSettings()
    const isCurrentlyVisible = settings.show ?? true // default visible
    return isCurrentlyVisible ? "Hide Clock" : "Show Clock"
  },
  // ...
  execute: async () => {
    const current = await getNewTabClockSettings()
    await updateNewTabClockSettings({ show: !(current.show ?? true) })
  },
}
```

Persistence flows through `background/commands/settings.ts`:
`updateNewTabClockSettings` → `updateNewTabSettings({ clock })`, which
**deep-merges** (`merge(existingNewTab, partialSettings)`) into
`settings.newTab` before saving. The deep merge matters: writing `clock` must
not clobber sibling `newTab` fields such as `greeting` or `backgroundCategories`.

The Redux mirror reads it through `selectClockVisibility`, which returns
`state.settings.newTab.clock?.show ?? true` — clock is visible by default.

### Clock component

`newtab/components/Clock.tsx` is purely presentational. It holds a `Date` in
state and updates it every second via `setInterval`. There is currently **no
format/timezone setting wired through** — the format is hard-coded:

- Time: `toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12:
  true })` (12-hour with AM/PM, no seconds).
- Date: `toLocaleDateString([], { weekday: "long", year: "numeric", month:
  "long", day: "numeric" })`.

The `NewTabSettings.clock` type comments reserve room for `format`/`timezone`,
but only `show` is implemented. The component is mounted/unmounted by the
`{showClock && <Clock />}` guard in `NewTabApp`, so toggling visibility starts
and stops the interval cleanly.

## Background image

The background uses an Unsplash random landscape photo, fetched through the
background service worker, with a `localStorage` cache and a deterministic
gradient fallback. There are three pieces: the component, the local
state-machine model, and the background message handler.

### `BackgroundImage` component

`newtab/components/BackgroundImage.tsx` owns three local states:
`backgroundData`, `isLoading`, and `error`. On mount it calls
`initializeBackgroundImage` with:

- `cache: localStorage`
- `requestBackground`: sends `{ type: "monocle-unsplash-background-get", context }` to
  the background via `sendRuntimeMessage` (`shared/utils/extension-api.ts`),
  which is a Promise wrapper over `runtime.sendMessage` that rejects on
  `runtime.lastError`.
- `preloadImage`: a module-level helper that loads the URL into an `Image()` and
  resolves on `onload` / rejects on `onerror`.
- `onBackground` / `onFallback`: state setters guarded by an `isMounted` flag so
  late callbacks after unmount are ignored.

Render branches:

| Condition | Output |
| --- | --- |
| `isLoading` | Gradient placeholder (`--color-hero-start` → `--color-hero-end`) with an overlay. |
| `error` or no `imageUrl` | Same gradient fallback. |
| usable image | Full-screen `bg-cover` div using the image URL, an overlay, and (if present) a "Photo by … on Unsplash" attribution credit with photographer/photo links. |

### Background image model (`newtab/backgroundImageModel.ts`)

This module is the testable state machine. It is framework-agnostic (cache,
fetch, and preload are injected) so it can be unit-tested without a DOM. Key
exports: `BACKGROUND_IMAGE_CACHE_KEY` (`"monocle-unsplash-background"`),
`getCachedBackground`, `setCachedBackground`, `hasUsableBackgroundImage`, and
`initializeBackgroundImage`.

`initializeBackgroundImage` behavior:

1. Read the cache. `getCachedBackground` JSON-parses the stored value and
   normalizes it (string `imageUrl` required; other fields coerced to strings).
   Corrupt JSON or a missing `imageUrl` causes the entry to be removed via
   `removeItem` and treated as no cache.
2. If the cache has a usable image (`hasUsableBackgroundImage` = non-empty
   string `imageUrl`), call `onBackground` immediately and mark
   `hasShownCachedImage = true` so the user sees something instantly.
3. Call `requestBackground()` (the fresh fetch).
4. On a fresh response with no `error` and a usable image: `preloadImage`
   (preload failures are logged but non-fatal), write it to cache, and call
   `onBackground` **only if a cached image was not already shown** (avoids a
   flash/replace when cache and fresh agree).
5. On a fresh response that errored or lacks an image: log, and call
   `onFallback(response.error ?? "Failed to load background")` only if no cached
   image was shown.
6. On a thrown error (network/`lastError`): log, and call `onFallback` with the
   error message only if no cached image was shown.

The net effect: a cached image always wins for first paint and is *never*
replaced by a same-session fetch failure — the page degrades gracefully and
keeps the last-known-good image.

### Unsplash fetch (`background/messages/getUnsplashBackground.ts`)

Registered in `background/messages/index.ts` under
`{ type: "monocle-unsplash-background-get" }`. The handler `getUnsplashBackground` reads
`backgroundCategories` from `getNewTabSettings()`, maps them to search queries
via `getCategoryQueries` (`shared/utils/unsplash-categories.ts`), and — when one
or more categories are enabled — picks one query at random per request so
backgrounds rotate across the user's chosen categories. It then delegates to the
testable `fetchUnsplashBackground({ accessKey, query })` (an omitted `query`
means a fully random photo).

- The access key comes from `import.meta.env.WXT_UNSPLASH_ACCESS_KEY ||
  import.meta.env.EXTENSION_PUBLIC_UNSPLASH_ACCESS_KEY` (env prefixes allowed by
  `wxt.config.ts`). **If no key is configured, it returns a structured error
  response** `{ imageUrl: "", …, error: "Unsplash API key not configured" }`
  rather than throwing — the page then shows the gradient.
- With a key, it GETs
  `https://api.unsplash.com/photos/random?orientation=landscape&w=1920&h=1080`
  (plus `&query=<category>` when a category query was selected) with an
  `Authorization: Client-ID <key>` header. A non-OK status throws
  `Unsplash API error: <status>`, which is caught and converted into an `error`
  response.
- A success maps the `UnsplashPhoto` into an `UnsplashBackgroundResponse`:
  `imageUrl = photo.urls.regular`, plus `photographerName`, `photographerUrl`
  (`photo.user.links.html`), and `photoUrl` (`photo.links.html`).

The `UnsplashBackgroundResponse` shape (`shared/types/ui.ts`):

| Field | Type | Meaning |
| --- | --- | --- |
| `imageUrl` | `string` | Empty string signals "no image" / fallback. |
| `photographerName` | `string` | Attribution name (may be empty). |
| `photographerUrl` | `string` | Link to photographer profile. |
| `photoUrl` | `string` | Link to the photo on Unsplash. |
| `error` | `string?` | Present on any failure path. |

`api.unsplash.com` is declared in `host_permissions` and the extension-pages CSP
`connect-src` in `wxt.config.ts`; without those the fetch would be blocked.

## Permission-grant panel

`newtab/components/PermissionGrantPanel.tsx` renders only when the new-tab URL
carries a `?grantPermission=<name>` query parameter that
`normalizeGrantPermission` recognizes. The allow-list (`grantablePermissions`)
covers `activeTab`, `bookmarks`, `browsingData`, `contextualIdentities`,
`cookies`, `downloads`, `history`, `sessions`, `storage`, and `tabs`; any other
value yields `null` and the panel is not shown.

Why it exists: some browsers (notably Firefox in certain flows) refuse optional
permission prompts triggered from a content-script/overlay or non-user-gesture
context. The new-tab page is a trusted extension page where a button click is a
clean user gesture, so a command that needs a permission can deep-link the user
to `chrome-extension://…/newtab.html?grantPermission=tabs` and present an
explicit "Grant Tabs" button.

On click, `handleGrant`:

1. Calls `browserAPI.permissions.request({ permissions: [permission] })`.
2. Re-checks with `browserAPI.permissions.contains(...)` and sets local status
   to `granted` / `denied`.
3. Dispatches `refreshPermissions()` to update the Redux permission mirror.

It surfaces success, denial, or an error message inline and disables the button
once granted. See [permissions.md](permissions.md) for the broader optional-
permission model.

## Theme system

Theme state is a single `mode` stored under `settings.theme` (`ThemeSettings` in
`shared/types/settings.ts`). The `ThemeMode` union is the OS-aware trio
(`light` / `dark` / `system`) plus the always-on named themes (`solarized-light`,
`solarized-dark`, `monokai`, `nord`, the four `catppuccin-*`, `one-dark`,
`dracula`). The value is applied verbatim as a class on the palette root. The
mechanics live in `shared/utils/theme.ts` and apply to both runtime modes.

### Color tokens (CSS structure)

The actual colors live in CSS as **self-contained named-theme blocks**, keyed by
a class on the palette root. Each block defines two layers:

- **Primitive scales**: `--gray*`, `--grayA*`, `--blue*`.
- **Semantic tokens**: `--color-*` (backgrounds, text, border, accent, status,
  hero). All component rules consume only `--color-*` — never a primitive
  directly — so any theme is a complete swap of one variable set.

`content/styles.css` defines these on `:host(...)` (the closed shadow host) and
`newtab/styles.css` defines them on `:root(...)` (the new-tab `<html>`), because
CSS variables are scoped per tree. The two stylesheets are kept in sync;
`newtab/styles.css` additionally `@import`s the content stylesheet for the
shared component rules.

The OS-aware trio:

- **Light** — `:host, :host(.light)` / `:root, :root.light` (also the default).
- **Dark** — `:host(.dark)` / `:root.dark`.
- **System** — `@media (prefers-color-scheme: dark) { :host(.system) }` /
  `:root.system` re-applies the dark theme; OS-light falls through to the light
  defaults.

**Always-on named themes** are fixed schemes that do not follow the OS (no
light/dark variant). They live in `content/styles.css` after the system block,
each defined once with a combined `:host(.<id>), :root.<id>` selector (the
new-tab page sees them via the `@import`) and setting only the `--color-*`
tokens with concrete values — no primitive scale needed. Available ids:
`solarized-light`, `solarized-dark`, `monokai`, `nord`, `catppuccin-latte`,
`catppuccin-frappe`, `catppuccin-macchiato`, `catppuccin-mocha`, `one-dark`,
`dracula`.

To add a theme, add a block of the same variables keyed on its own root class.

### Values and normalization

- Modes: `light`, `dark`, `system`. `system` resolves to the OS preference.
- `normalizeThemeMode` coerces missing/invalid values to the default `system`.
- `getThemeModeFromSettings(settings)` reads `settings?.theme?.mode` and
  normalizes it — tolerant of both `{ theme }` and storage-shaped objects.
- `getEffectiveTheme(mode)` resolves `system` to `light`/`dark` via
  `window.matchMedia("(prefers-color-scheme: dark)")`, defaulting to `light`
  when `window`/`matchMedia` is unavailable (e.g. in a service worker / test).

### Applying the theme: two DOM targets

The crucial design point is that the **theme class is applied to a different
element in each mode**, because the content overlay lives in a closed shadow
DOM while the new-tab page is ordinary DOM. CSS variables/theme classes are
scoped per-tree, so the class must land on the right root.

| Mode | Target element | Entry point |
| --- | --- | --- |
| New-tab page | `document.documentElement` | `applyThemeToDocument(mode)` |
| Content overlay | The shadow host element | `applyThemeToHost(hostElement, settings)` |

Both ultimately call `applyThemeClass(element, mode)`, which removes every known
theme class (`THEME_CLASSES`, derived from `THEME_IDS`) and adds the current one. Existing
non-theme classes on the element are preserved (verified in
`shared/utils/theme.test.ts`). `getThemeClassTarget` transparently unwraps a
`ShadowRoot` to its `.host`, so callers may pass either the host or the root.

Note the class added is the raw `mode` string — including `system`. The
mapping from `system` to an actual light/dark appearance is left to CSS
(`prefers-color-scheme`) plus the system-theme listener re-applying on change;
`applyThemeClass` does not resolve `system` to `light`/`dark` itself.

### System-theme listening

`setupSystemThemeListener(callback)` subscribes to
`(prefers-color-scheme: dark)` changes (using `addEventListener` with an
`addListener` legacy fallback) and returns a cleanup function. `NewTabApp`
only installs it while `themeMode === "system"`. It is a no-op when `window` or
`matchMedia` is absent.

### Theme command and persistence

`background/commands/ui/theme.ts` exports `toggleTheme` (`id: "toggle-theme"`),
registered through `background/commands/ui/index.ts`. It is a single action that
**cycles** `system → light → dark → system` (note: the cycle in `execute` is
`system→light`, `light→dark`, default→`system`). Its `name`, `description`, and
`icon` are dynamic and reflect the current mode (Sun / Moon / Monitor). On
execute it calls `updateThemeSettings({ mode: nextMode })`.

`background/commands/ui/selectTheme.ts` exports `selectTheme` (`id: "theme"`), a
group command also registered through `ui/index.ts`. Its children are generated
from `THEME_OPTIONS` (`shared/utils/themes.ts`, the DOM-free single source of
truth for selectable themes) — the OS-aware trio plus the always-on named
themes. Each child applies its theme immediately via
`updateThemeSettings({ mode })`; the content overlay and new-tab page reapply on
the resulting `storage.onChanged` event, so no extra wiring is needed.
`remainOpenOnSelect` keeps the palette open so the change is visible live and the
"current" marker (a Check icon) refreshes. `enableDeepSearch` lets a theme name
match from the root palette.

`updateThemeSettings` (`background/commands/settings.ts`) shallow-merges into
`settings.theme` and saves. Because `ThemeSettings` is flat (`{ mode }`), the
shallow merge is sufficient here — unlike `newTab`, which uses a deep `merge`.

The Redux mirror exposes the mode via `selectThemeMode`
(`state.settings.theme.mode ?? "system"`). The catalog details of the theme
command (exact labels, ordering, icon mapping) belong to
[commands/ui.md](commands/ui.md).

## Known issues / gotchas

- **Clock format is hard-coded.** `NewTabSettings.clock` reserves `format`/
  `timezone`, but only `show` is implemented. Don't document or rely on a
  configurable format.
- **`system` is applied as a literal class.** The actual light/dark resolution
  is done by CSS (`prefers-color-scheme`) plus the system listener, not by
  `applyThemeClass`. If you add code that needs the resolved appearance, use
  `getEffectiveTheme`.
- **Background depends on an env-injected Unsplash key.** With no key the page
  always shows the gradient. This is intentional and tested; it is not a bug.
- **External image + CSP coupling.** Background fetch requires both the
  `api.unsplash.com` host permission and the `connect-src` CSP entry in
  `wxt.config.ts`. Removing either silently degrades to the gradient.
- **Two refresh paths can both fire.** Settings changes are picked up by the
  `storage.onChanged` listener *and* by the explicit `loadSettings()` dispatch
  in `executeCommand`. This is redundant-but-harmless; don't assume only one
  fires.

## Manual test checklist

Automated coverage exists for the background-image model
(`newtab/backgroundImageModel.test.ts`: no-key fallback, fresh fetch
preload+cache, cached-image-survives-failure, no-cache failure, corrupt-cache
removal), theme utilities (`shared/utils/theme.test.ts`: normalization, host vs
`documentElement` application, effective-theme without `window`), and the
context-gated new-tab command/keybinding loading. There are **no visual or
browser-E2E tests**, so still verify manually:

- Open a new tab and confirm the Monocle UI replaces the browser default, with
  the palette auto-focused.
- Search clock visibility, toggle it, and confirm the clock shows/hides and the
  command label flips between "Show Clock"/"Hide Clock".
- Reload the new tab and confirm clock visibility persists.
- Cycle the theme (system → light → dark → system) and confirm the new-tab page
  updates, then confirm the content overlay on a normal page reflects the same
  theme (shadow-DOM host class).
- With `themeMode = system`, change the OS appearance and confirm the page
  re-applies without reload.
- Confirm new-tab-only commands (e.g. Clock group) do **not** appear in the
  content overlay on a normal page.
- Confirm the background loads an Unsplash image when a key is configured, shows
  attribution, caches across reloads, and falls back to the gradient with no key
  or on network failure (and that a previously cached image survives a failed
  refresh).
- Visit `newtab.html?grantPermission=tabs` (or a real deep link) and confirm the
  grant panel appears, requests the permission, and reflects granted/denied.

## Related docs

- [architecture.md](architecture.md) — runtime modes, boundaries, data flows.
- [messaging.md](messaging.md) — full background message protocol, including
  `monocle-unsplash-background-get`.
- [settings.md](settings.md) — settings storage shape, persistence, Redux mirror.
- [permissions.md](permissions.md) — optional permission grant flows.
- [keybindings.md](keybindings.md) — context-aware keybinding resolution.
- [url-filtering.md](url-filtering.md) — why new-tab bypasses URL rules.
- [palette-ui-and-navigation.md](palette-ui-and-navigation.md) — shared palette
  shared by content overlay and new-tab.
- [commands/ui.md](commands/ui.md) — the theme command catalog entry.
- [commands/new-tab.md](commands/new-tab.md) — the new-tab-only command catalog.
