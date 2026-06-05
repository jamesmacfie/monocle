# Permissions And Settings Fix Plan

## Current Data Flow

Settings persist in `chrome.storage.local` under `monocle-settings` through
`background/commands/settings.ts`. Redux mirrors theme, new-tab settings, and
permission state through `shared/store/slices/settings.slice.ts`. Command-level
settings include custom keybindings and URL rules.

Permission-protected commands declare `permissions` on command nodes. UI checks
suggestion permissions through `usePermissionsGranted`, and execution checks
permissions again in the background before protected work.

Settings updates flow through command executors, generated actions, and
`update-command-setting`.

## Boundaries And Contracts

- Browser permission APIs are authoritative. Redux permission state is only a
  UI cache.
- Settings persistence should remain centralized in
  `background/commands/settings.ts`.
- Updating one command setting must preserve sibling settings unless the caller
  explicitly removes them.
- Runtime setting update messages must validate both the setting key and value
  shape before persisting.
- URL rule updates must preserve existing nested rule state unless replacing a
  specific allow or deny list intentionally.

## Confirmed Gaps

- Resetting a custom keybinding deletes the whole command settings object by
  calling `removeCommandSettings`, which also removes URL rules for that
  command.
- `update-command-setting` accepts any setting name and any value after only
  checking setting-name characters.
- `updateCommandSettings` shallow-merges command settings. Current URL-rule
  callers usually preserve nested state, but this is not enforced by tests.
- Permission-protected dynamic groups can show empty data when optional
  permissions are missing because lower-level browser readers return empty
  arrays.
- Allow/deny management uses context-free `allCommands`, so context-specific
  commands are missed.

## Required Fixes

- Add field-level command setting removal, for example
  `removeCommandSetting(commandId, "keybinding")`, and use it for reset
  keybinding actions.
- Preserve `urlRules` when resetting keybindings and preserve `keybinding` when
  updating URL rules.
- Replace stringly typed `UpdateCommandSettingMessage.setting` with an
  allowlisted command-setting key type.
- Validate `update-command-setting` payloads:
  - `keybinding` must be empty/removed or canonical valid keybinding text.
  - `urlRules.allowUrls` and `urlRules.denyUrls` must be arrays of valid URL
    patterns.
  - Unknown keys must be rejected.
- Add compatibility tests for missing settings, old settings without nested
  objects, and mixed keybinding plus URL-rule settings.
- Make permission UI refresh paths re-check browser truth after grant, denial,
  and revoke.
- Move permission-missing child-page behavior out of browser utility silent
  fallbacks and into command/page responses that can render a grant action.

## Required Tests

- Unit tests for loading default settings from empty storage.
- Unit tests for shallow vs nested command setting updates, including
  preserving sibling settings.
- Tests for field-level keybinding removal preserving URL rules.
- Tests for invalid `update-command-setting` keys and malformed values.
- Tests for URL-rule validation through both management commands and direct
  update messages.
- Tests for permission request responses: grant, deny, browser error, and
  already-granted.
- Manual Chrome and Firefox checks for grant, denial, already-granted, and
  revoked permission states.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New settings, validation, URL-rule, and permission-flow tests pass.
- Manual smoke: set a custom keybinding and deny URL rule on the same command,
  reset the keybinding, reload the extension, and verify the deny rule remains.
