# Permissions And Settings

## Current Status

Status: working with review notes.

Monocle uses required base permissions plus optional permissions requested on
demand. Settings are persisted in `chrome.storage.local` under
`monocle-settings` and include theme, new-tab settings, and per-command
settings such as custom keybindings and URL rules.

## How It Is Hooked Together

- `wxt.config.ts` declares required permissions `activeTab`, `storage`, and
  `scripting`. The `scripting` permission lets the background shortcut/action
  path inject the WXT content script when the active tab has no palette
  receiver yet. Firefox also declares contextual identities.
- `wxt.config.ts` declares optional permissions for bookmarks, browsing data,
  cookies, downloads, history, sessions, and tabs.
- Commands declare their required permissions through `permissions` on
  `CommandNodeBase`.
- `shared/store/slices/settings.slice.ts` loads permissions and settings into
  Redux for UI use.
- `shared/hooks/usePermissionsGranted.tsx` checks whether a suggestion's
  permissions are currently granted.
- `shared/components/Command/PermissionActions.tsx` shows grant actions in the
  action menu when permissions are missing.
- Chrome permission requests route through
  `background/messages/requestPermission.ts`. Firefox can request permissions
  directly from the content side where supported.
- `background/utils/permissions.ts` checks granted permissions in the
  background.
- `background/commands/settings.ts` loads, saves, updates, and removes
  persisted settings.
- `background/messages/updateCommandSetting.ts` updates individual command
  settings, including custom keybindings.
- `background/commands/ui/manageAllowList.ts` and
  `background/commands/ui/manageDenyList.ts` expose URL rule settings through
  inline text-list inputs.

The settings shape is:

- `theme`: theme mode.
- `newTab`: background categories, clock visibility, greeting visibility.
- `commands`: per-command settings, currently keybinding and URL rules.
- `permissions`: represented in shared types and Redux, but actual permission
  truth comes from the browser permission API.

## Test Coverage

Automated test coverage: missing.

Build checks that currently touch this feature:

- `pnpm run tsc` validates settings, permissions, and message types.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm run build` validates bundle compilation.

There are no tests for storage migration/compatibility, permission request
flows, command settings merging, URL rule validation, or cross-tab storage
sync.

## Manual Test Checklist

- Start from a fresh extension install or clear `monocle-settings`.
- Open a permission-protected command such as bookmarks.
- Confirm missing permissions are shown in the action menu.
- Grant the permission and confirm the command becomes executable without a
  full extension reload.
- Deny a permission request and confirm the UI recovers cleanly.
- Add a custom keybinding and confirm it persists after reloading the
  extension.
- Reset the custom keybinding and confirm the setting is removed.
- Use Manage Command Allow List to add a pattern for a harmless command.
- Use Manage Command Deny List or Hide from Domain to hide a command on the
  current site.
- Reload the page and confirm URL rules persist.
- Change theme mode and confirm content overlay and new-tab page update.
- Repeat permission request behavior in Chrome and Firefox.

## Code Review Notes

- Settings persistence is centralized, which is good. The primary risk is lack
  of compatibility tests for future settings shape changes.
- `updateCommandSettings` shallow-merges command settings. Nested settings such
  as `urlRules` are replaced by the caller's merged object. Current callers
  usually preserve nested state, but this should be covered by tests before
  adding more nested command settings.
- Permission state is duplicated between browser truth and Redux. That is
  normal for UI responsiveness, but the browser API must remain authoritative.
- Permission-protected dynamic groups can return empty arrays when permission is
  missing. That avoids exceptions, but can make missing permission look like an
  empty data set.
- The allow/deny management commands are generated from `allCommands`, so they
  do not currently cover every context-specific command source.
- URL pattern validation is custom and should get focused tests before the
  pattern language grows.
