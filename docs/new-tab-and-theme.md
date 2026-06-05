# New Tab And Theme

## Current Status

Status: working with unknowns.

The extension overrides the browser new-tab page and renders a dedicated
Monocle interface with the shared command palette, clock, background image, and
theme support. New-tab-specific commands are loaded only when the command
context includes `isNewTab`.

## How It Is Hooked Together

- `manifest.json` defines `chrome_url_overrides.newtab` as `newtab/index.html`.
- `newtab/scripts.tsx` mounts the React new-tab app.
- `newtab/NewTabApp.tsx` loads initial settings and permissions and renders the
  new-tab experience.
- `newtab/components/NewTabCommandPalette.tsx` fetches commands with
  `{ isNewTab: true }` and renders the shared `CommandPalette`.
- `background/commands/index.ts` appends `newTabCommands` only when
  `context?.isNewTab` is true.
- `background/commands/newTab/index.ts` exports the new-tab command set.
- `background/commands/newTab/clock.ts` exposes clock visibility commands.
- `newtab/components/Clock.tsx` renders clock UI based on settings.
- `newtab/components/BackgroundImage.tsx` renders the new-tab background image.
- `background/messages/getUnsplashBackground.ts` supports Unsplash background
  fetching where configured.
- `background/commands/ui/theme.ts` exposes theme toggling.
- `shared/utils/theme.ts` applies theme classes in both new-tab and content
  contexts.
- Theme and new-tab preferences persist through `background/commands/settings.ts`
  and the Redux settings slice.

## Test Coverage

Automated test coverage: missing.

Build checks that currently touch this feature:

- `npm run tsc` validates new-tab React code and settings types.
- `npm run fmt:check` validates formatting/lint.
- `npm run build` validates the new-tab bundle and HTML output.

There are no visual tests, browser E2E tests, settings persistence tests, or
Unsplash/background fallback tests.

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
- Confirm background image behavior works or fails gracefully when external
  image access is unavailable.

## Code Review Notes

- Context-gated loading for new-tab commands is the right model, but it creates
  a secondary command source that some global management code can miss.
- Keybinding registry initialization does not register `newTabCommands`
  directly. If new-tab commands should support keybindings, registry loading
  needs a context-aware strategy.
- New-tab and content modes share the core palette, which keeps behavior
  consistent. Any changes to shared navigation or action menus should be checked
  in both contexts.
- Background image fetching depends on external access and CSP host permissions.
  Manual failure-mode checks are needed because network and API configuration
  can vary.
- Theme application differs between regular DOM and content shadow DOM. Manual
  checks should cover both because a fix in one context can miss the other.
- The current docs do not establish product expectations for the new-tab page:
  whether it is a lightweight launcher, a full dashboard, or only a host for the
  palette. That decision affects future UI work.

