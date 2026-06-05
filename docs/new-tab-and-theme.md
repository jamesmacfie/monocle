# New Tab And Theme

## Current Status

Status: working with focused tests and manual-browser review notes.

The extension overrides the browser new-tab page and renders a dedicated
Monocle interface with the shared command palette, clock, background image, and
theme support. New-tab-specific commands are loaded only when the command
context includes `isNewTab`.

The current product scope is intentionally a lightweight launcher/palette
surface with a clock and background image. It is not a broader dashboard until
a separate product decision defines additional dashboard content and workflows.

## How It Is Hooked Together

- `wxt.config.ts` plus `entrypoints/newtab/index.html` define
  `chrome_url_overrides.newtab` in the generated manifest.
- `newtab/scripts.tsx` mounts the React new-tab app.
- `newtab/NewTabApp.tsx` loads initial settings and permissions and renders the
  new-tab experience.
- `newtab/components/NewTabCommandPalette.tsx` fetches commands with
  `{ isNewTab: true }`, sends execution/keybinding messages with the same
  context, and renders the shared `CommandPalette`.
- `background/commands/index.ts` appends `newTabCommands` only when
  `context?.isNewTab` is true.
- `background/commands/newTab/index.ts` exports the new-tab command set.
- `background/commands/newTab/clock.ts` exposes clock visibility commands.
- `newtab/components/Clock.tsx` renders clock UI based on settings.
- `newtab/components/BackgroundImage.tsx` renders the new-tab background image.
- `newtab/backgroundImageModel.ts` owns cache parsing, fallback decisions,
  preload behavior, and cache writes for the background image component.
- `background/messages/getUnsplashBackground.ts` supports Unsplash background
  fetching where configured and returns deterministic error responses when
  there is no API key or Unsplash fails.
- `background/commands/ui/theme.ts` exposes theme toggling.
- `shared/utils/theme.ts` applies theme classes to `document.documentElement`
  for new-tab mode and to the content shadow host element for content mode.
- Theme and new-tab preferences persist through `background/commands/settings.ts`
  and the Redux settings slice.
- `background/keybindings/source.ts` and `background/messages/executeKeybinding.ts`
  build context-aware keybinding snapshots, so custom new-tab command
  keybindings execute only when the incoming context includes `isNewTab`.

## Test Coverage

Automated test coverage now includes:

- New-tab command loading with and without `{ isNewTab: true }`.
- Context-aware new-tab keybinding execution for `toggle-clock-visibility`.
- Context-aware new-tab keybinding conflict checks.
- Nested `updateNewTabSettings` / clock visibility persistence behavior.
- Content host theme-class application from storage-shaped settings.
- New-tab `documentElement` theme-class application.
- Unsplash no-key, successful fetch, API failure, cache, preload, and corrupt
  cache fallback behavior.

Build checks that currently touch this feature:

- `pnpm run tsc` validates new-tab React code and settings types.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm test` runs the focused new-tab/theme/background tests above.
- `pnpm run build` validates the new-tab bundle and HTML output.

There are still no visual tests or browser E2E tests for the new-tab page.

## Manual Test Checklist

- Load the extension and open a new tab.
- Confirm the Monocle new-tab UI appears instead of the browser default.
- Confirm the command palette is focused and usable.
- Search for new-tab-only commands such as clock visibility and confirm they
  appear only on the new-tab page.
- Toggle clock visibility and confirm the UI updates.
- Reload the new-tab page and confirm clock visibility persists.
- Toggle theme mode and confirm the new-tab UI updates.
- Open a normal webpage and confirm new-tab-only commands do not appear.
- Confirm shared commands execute correctly from the new-tab palette.
- Confirm background image behavior works or falls back to the gradient when
  external image access or Unsplash configuration is unavailable.

## Code Review Notes

- Context-gated loading for new-tab commands is the right model, and
  keybinding registry snapshots now follow that context. Keep future new-tab
  commands behind `context.isNewTab` unless they are deliberately global.
- New-tab-only commands support custom keybindings when registry, conflict, and
  execution calls include the new-tab context.
- New-tab and content modes share the core palette, which keeps behavior
  consistent. Any changes to shared navigation or action menus should be checked
  in both contexts.
- Background image fetching depends on external access and CSP host permissions.
  The cache/fallback decisions have tests, but real browser network behavior
  still needs manual checks.
- Theme application differs between regular DOM and content closed-shadow DOM.
  Shared utilities now encode both targets, but manual checks should still
  cover both because CSS scope and browser theme preferences can vary.
