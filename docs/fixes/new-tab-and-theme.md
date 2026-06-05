# New Tab And Theme Fix Plan

## Current Data Flow

The generated extension manifest overrides the browser new-tab page through
WXT. `newtab/NewTabApp.tsx` loads settings and permissions, applies theme
classes to `document.documentElement`, renders `BackgroundImage`, `Clock`, and
`NewTabCommandPalette`.

New-tab commands are appended by `background/commands/index.ts` only when the
command context includes `isNewTab`. New-tab settings are persisted through
`background/commands/settings.ts` and mirrored through Redux.

Content theme state is applied differently: the content script uses a closed
shadow root, and the effective theme class is applied to the shadow host from
`entrypoints/content.tsx` based on storage changes.

## Boundaries And Contracts

- New-tab-only commands must not appear in normal content-page palettes.
- New-tab command execution must carry `{ isNewTab: true }` through direct UI
  execution and any keybinding path that supports new-tab commands.
- Theme utilities must distinguish normal DOM root updates from closed-shadow
  host updates.
- Background image behavior must degrade deterministically when no Unsplash key,
  network access, image preload, or valid cache is available.
- Visual checks must cover both content overlay and new-tab DOM because they
  use different theme application boundaries.

## Confirmed Gaps

- New-tab command loading is correctly context-gated for palette fetch and
  execute, but keybinding support does not carry the same context. The global
  keybinding hook sends no new-tab override, and the registry omits new-tab
  commands.
- The docs imply shared theme utilities apply theme in both contexts, but the
  content root is closed. `ContentCommandPalette.tsx` cannot access
  `shadowRoot`; the real content path is host-class updates in
  `entrypoints/content.tsx`.
- Unsplash and background image behavior has no automated coverage. The current
  implementation has a graceful no-key fallback and cache-first behavior, but
  it needs deterministic tests around errors and cache corruption.
- Product expectations for the new-tab page are not settled. Current behavior
  is a palette host with clock and background, not a broader dashboard.

## Required Fixes

- Decide the new-tab keybinding policy:
  - Support new-tab-only command keybindings by passing new-tab context through
    `useGlobalKeybindings` and registering new-tab command sources.
  - Or explicitly disable custom/global keybindings for new-tab-only commands.
- Make registry, conflict checks, and execution context follow the chosen
  policy.
- Consolidate content theme application around a host-element helper that works
  with closed shadow roots. Remove dead code paths that try to access
  `shadowRoot` from outside.
- Keep new-tab theme application on `document.documentElement` and test storage
  change behavior separately from content mode.
- Add deterministic background image tests for:
  - No API key.
  - Successful fetch and preload.
  - Fetch failure with cached image.
  - Fetch failure without cache.
  - Corrupt localStorage cache.
- Document the current new-tab product scope as a launcher/palette surface
  until a separate product decision expands it.

## Required Tests

- Unit or component tests for new-tab command loading with and without
  `{ isNewTab: true }`.
- Tests for new-tab keybinding policy: either working execution of a
  `toggle-clock-visibility` binding or explicit absence of custom binding
  support.
- Tests for `updateNewTabSettings` nested merge behavior and clock visibility
  persistence.
- Tests for content host theme class updates from storage changes.
- Tests for new-tab `documentElement` theme class updates.
- Tests for Unsplash background cache/fallback behavior with mocked `fetch`,
  image preload, and localStorage.
- Manual visual checks for content overlay light/dark/system and new-tab
  light/dark/system with and without a background image.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New new-tab, theme, settings, and background image tests pass.
- Manual smoke: open a new tab, verify palette focus, toggle clock visibility,
  reload, toggle theme, verify normal pages do not show new-tab-only commands,
  and verify background fallback is usable without Unsplash configuration.
