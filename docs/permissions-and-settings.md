# Permissions And Settings

## Current Status

Status: working with focused tests and manual-browser review notes.

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
- `background/commands/settings.ts` loads, saves, updates, removes, and
  field-removes persisted settings. Command setting updates preserve sibling
  fields, and URL-rule updates merge nested allow/deny lists.
- `background/messages/updateCommandSetting.ts` updates individual command
  settings after validating the allowlisted setting key and value shape.
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

Automated test coverage: focused.

Covered by Vitest:

- Empty-storage default settings loading.
- Compatibility with old command settings that have no nested URL-rule object.
- Mixed command settings where custom keybindings and URL rules coexist.
- Field-level keybinding removal preserving URL rules.
- Nested URL-rule updates preserving sibling allow/deny lists and sibling
  command settings.
- `update-command-setting` schema and background business validation for
  unknown keys, canonical keybinding values, malformed URL-rule shapes, and
  invalid URL patterns.
- URL-rule validation through Manage Command Allow List and Manage Command Deny
  List commands.
- Permission request responses for already-granted, granted, denied, and
  browser-error states.

Build checks that currently touch this feature:

- `pnpm run tsc` validates settings, permissions, and message types.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm run build` validates bundle compilation.
- `pnpm run build:firefox` validates Firefox MV3 bundle compilation.

Still manual or uncovered:

- Chrome and Firefox interactive permission prompts, including user denial.
- Permission revocation from browser extension settings while Monocle is open.
- Cross-tab storage sync beyond new-tab storage change handling.

## Manual Test Checklist

- Start from a fresh extension install or clear `monocle-settings`.
- Open a permission-protected command such as bookmarks.
- Confirm missing permissions are shown in the action menu.
- Grant the permission and confirm the command becomes executable without a
  full extension reload.
- In Firefox content overlay mode, confirm the grant action opens a Monocle tab
  with a grant button, and that clicking that button grants the permission.
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

- Settings persistence remains centralized in `background/commands/settings.ts`.
  Keep future settings migrations compatible with existing partial settings.
- `updateCommandSettings` now merges `urlRules` one level deeper than other
  command settings. That protects allow/deny sibling lists, but future nested
  command settings should get their own merge tests before being added.
- Resetting a custom keybinding removes only the `keybinding` field. It does
  not delete URL rules for the same command.
- Permission state is duplicated between browser truth and Redux. That is
  normal for UI responsiveness, but the browser API remains authoritative:
  request responses return post-request browser truth, direct permission actions
  refresh Redux after grant/denial/error, and permission-protected rows trigger
  a throttled browser-truth refresh to recover from stale revoked state.
- Permission-protected dynamic pages now return a permission-required display
  row before calling protected child resolvers when permissions are missing.
- Allow/deny management commands are generated from
  `loadUserConfigurableCommands`, so they include browser, tool, UI, new-tab,
  website, Firefox, and favorites-management command sources, but they are
  still command-setting management surfaces rather than a first-class plugin
  registry.
- URL pattern validation is custom and now has focused tests. Grow the pattern
  language cautiously and keep validation tests in lockstep.
