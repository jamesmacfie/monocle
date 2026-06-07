# Permissions

Monocle splits browser permissions into a small set of **required** manifest
permissions (granted at install time) and a larger set of **optional**
permissions that are requested on demand the first time a user reaches a command
that needs them. Commands declare the permissions they require; the UI surfaces
grant actions when they are missing; and the background re-checks permissions
against the live browser API before running any protected work. The browser
permission API is always the source of truth — Redux mirrors it only for UI
responsiveness.

## Required vs optional permissions

Required permissions are declared in `wxt.config.ts` under `permissions` and are
always present once the extension is installed. Optional permissions are
declared under `optional_permissions` and are dormant until requested.

| Permission | Class | Notes |
| --- | --- | --- |
| `activeTab` | Required | Lets the background act on the focused tab. |
| `storage` | Required | Backs `monocle-settings` persistence. |
| `scripting` | Required | Lets the shortcut/action path inject the WXT content script into a tab that has no palette receiver yet. |
| `contextualIdentities` | Required (Firefox only) | Added to the required list only on the Firefox build; powers container-tab commands. |
| `bookmarks` | Optional | Bookmark browse/open commands. |
| `browsingData` | Optional | Clear browser data. |
| `cookies` | Optional | Clear browser data (combined with others). |
| `downloads` | Optional | Downloads browse/open commands. |
| `history` | Optional | History search and open commands. |
| `sessions` | Optional | Recently-closed and reopen-last-closed-tab commands. |
| `tabs` | Optional | Tab management commands. |

`host_permissions` (`api.unsplash.com`, `icons.duckduckgo.com`, `www.google.com`)
are separate host grants for new-tab background images and favicons, not part of
the command permission model documented here.

The optional set is defined once in `wxt.config.ts` as `baseOptionalPermissions`
and spread into both Chrome and Firefox manifests. The required list branches on
`browser`: Firefox gets `contextualIdentities` added, Chrome does not.

## The `BrowserPermission` union

The canonical permission type is `BrowserPermission` in
`shared/types/commands.ts`:

```ts
export type BrowserPermission =
  | "activeTab"
  | "bookmarks"
  | "browsingData"
  | "contextualIdentities"
  | "cookies"
  | "downloads"
  | "history"
  | "sessions"
  | "storage"
  | "tabs"
```

A command declares its needs through the optional `permissions` array on
`CommandNodeBase`, so any node family (action, submit, group, search, input,
display) can carry permissions. See [command-schema.md](command-schema.md) for
the full node schema.

The UI uses a parallel `PermissionKey` union (same members) in
`shared/hooks/usePermissionsGranted.tsx`, and `Suggestion.permissions` in
`shared/types/ui.ts` carries the resolved permission list to the palette.

## Which commands declare which permissions

These declarations live on the command nodes themselves (`permissions: [...]`).

| Permission | Commands (source under `background/commands/`) |
| --- | --- |
| `bookmarks` | `browser/bookmarks.ts` |
| `browsingData`, `history`, `cookies`, `sessions` | `browser/clearBrowserData.ts` (declares all four together) |
| `tabs` | `browser/closeOtherTabs.ts`, `browser/closeTabsToLeft.ts`, `browser/closeTabsToRight.ts`, `browser/copyTabUrl.ts`, `browser/gotoTab.ts`, `browser/moveCurrentTabToANewWindow.ts`, `browser/moveCurrentTabToPopupWindow.ts`, `browser/openTabs.ts` |
| `downloads` | `browser/downloads.ts` |
| `history` | `browser/history.ts` |
| `sessions` | `browser/recentlyClosed.ts`, `browser/reopenLastClosedTab.ts` |
| `contextualIdentities` | `browser/firefox/openContainerTab.tsx` |
| `tabs` + `contextualIdentities` | `browser/firefox/openCurrentTabInContainer.tsx` |

For full per-command detail see [commands/browser.md](commands/browser.md). The
list above is the authoritative summary of permission-bearing commands at the
time of writing; grep `permissions:` under `background/commands/` to refresh it.

## Permission inheritance for groups and children

Permissions accumulate down the navigation tree. `mergePermissions(inherited,
own)` in `background/commands/query.ts` unions a parent's permissions with a
child's, deduplicating. This means:

- A `group` that declares `permissions: ["bookmarks"]` propagates that
  requirement to every child resolved underneath it, even if individual children
  declare nothing.
- A child that adds its own permission ends up requiring the union of its own
  plus all ancestors'.

Inheritance is applied in three places (two in `query.ts`, one in
`index.ts`):

- `getCommandPageCommands` walks `parentPath`, merging `pageCommand.permissions`
  into `inheritedPermissions` at each level before resolving children.
- `findCommandRecursive` / `resolveCommandById` accumulate the same way while
  locating an executable command, and the resolved record carries the merged
  `permissions`.
- `commandsToSuggestions` (in `background/commands/index.ts`) stamps the
  merged `effectivePermissions` onto each `Suggestion.permissions`, so the UI sees the full
  inherited set rather than only a node's own declarations.

### Permission-required display rows for protected groups

When the user navigates into a `group` or opens a `search` page whose
inherited permissions are not all granted, `getCommandPageCommands` does **not**
call the protected child resolver. Instead it returns a single synthetic
`display` row produced by `createMissingPermissionsCommand`:

```ts
{
  type: "display",
  id: `missing-permissions-${permissions.join("-")}`,
  name: "Permission Required",
  description: `Grant ${permissionList} permission${permissions.length === 1 ? "" : "s"} to view these commands.`,
  icon: { type: "lucide", name: "ShieldAlert" },
  color: "red",
  permissions,
}
```

Because this row still carries `permissions`, the palette renders the same
grant affordances on it (see below), giving the user a path to grant the missing
permission without ever invoking the protected resolver. This is the
"permission-protected dynamic group preserves a grant path" invariant.

## How missing permissions surface in the palette UI

Three shared components react to permission state:

- `shared/hooks/usePermissionsGranted.tsx` reads the Redux permission mirror and
  returns `{ isGrantedAllPermissions, missingPermissions }` for a list of
  required permissions. While the mirror is not yet loaded
  (`permissions.isLoaded === false`) it reports not-granted with an empty
  missing list. The hook also fires a throttled `refreshPermissions()` (max once
  per `PERMISSION_REFRESH_THROTTLE_MS = 1000` ms, tracked by a module-level
  timestamp shared across all rows) so the UI recovers from stale state such as
  a revocation made in browser settings.
- `shared/components/Command/CommandItem/index.tsx` calls the hook for the row's
  permissions. If `!isGrantedAllPermissions`, selecting the row does **not**
  execute — it shows an error toast: "Permissions required. Check the action
  menu to give these."
- `shared/components/Command/CommandName.tsx` appends an inline
  "> Missing permissions: ..." label to a row that lacks its permissions, using
  a human-readable join (single, "X and Y", or "X, Y and N others").
- `shared/components/Command/CommandActions.tsx` is the action menu. When the
  selected suggestion's permissions are not all granted, it renders
  `PermissionActions` (the grant list) **instead of** the normal action list.
  This is why granting is reached through the action menu (modifier-Enter /
  the actions affordance), not the row's primary Enter.

## Grant flows

Grant requests are issued from `shared/components/Command/PermissionActions.tsx`.
The flow branches by browser and by whether the permissions API is callable from
the current (content-script or new-tab) context.

| Context | Path |
| --- | --- |
| Firefox, `browser.permissions.request` available directly | Calls `permissions.request` then `permissions.contains` in-page; no background round-trip. |
| Firefox, permissions API not callable in-page | Sends `open-permission-grant-page`, closes the menu, and shows an info toast asking the user to grant in the opened Monocle tab. |
| Chrome (and Firefox sandboxed fallback) | Sends `request-permission` to the background, which performs the request and returns post-request browser truth. |

After any path that completes in-page or via the background, the component
dispatches `refreshPermissions()` and then shows a success or warning toast
based on the resulting `granted` boolean.

### Chrome: routing through the background

`background/messages/requestPermission.ts` (`requestPermission`) calls
`browserAPI.permissions.request`, then immediately re-reads
`browserAPI.permissions.contains` and returns `{ granted }` — it never trusts the
request's own return value as truth. On a thrown browser error it returns
`{ granted: false, error }` with a descriptive message. `requestPermission.test.ts`
covers four states: already-granted, request-then-grant, request-then-deny, and a
structured browser error.

### Firefox: the dedicated grant page

Some Firefox contexts (notably the sandboxed content overlay) cannot satisfy the
user-gesture requirement for `permissions.request`. In that case
`PermissionActions` sends `open-permission-grant-page`.
`background/messages/openPermissionGrantPage.ts` opens a new active tab at:

```
/newtab.html?grantPermission=<encoded-permission>
```

`newtab/NewTabApp.tsx` reads the `grantPermission` query param, validates it via
`normalizeGrantPermission` (only members of the `BrowserPermission` set are
accepted; anything else yields `null` and renders nothing), and renders
`PermissionGrantPanel` for that permission.

`newtab/components/PermissionGrantPanel.tsx` is a normal-DOM, user-initiated
button. Clicking "Grant <Name>" calls `permissions.request` then
`permissions.contains` directly (the new-tab page is privileged enough), sets
local `granted`/`denied`/error status, and dispatches `refreshPermissions()`.
`openPermissionGrantPage.test.ts` verifies the constructed URL and tab creation;
`PermissionGrantPanel.test.ts` covers the in-page grant flow.

## Execution-time permission checks

UI-side gating is convenience only. The authoritative check happens in the
background before any protected work runs.

`background/messages/executeCommand.ts` forwards to `executeCommand` in
`background/commands/index.ts`, which resolves the command and calls
`executeResolvedCommand`. That function uses the **resolved** permission set
(`resolved.permissions`, already merged with inherited ancestors) and calls
`checkPermissions` from `background/utils/permissions.ts`:

```ts
if (permissions.length > 0) {
  const { hasAllPermissions, missingPermissions } =
    await checkPermissions(permissions)
  if (!hasAllPermissions) {
    await showMissingPermissionsToast(missingPermissions)
    return
  }
}
```

If any permission is missing the executor returns early, shows an error toast
("Missing permissions: ..."), and the command's `execute` is never called.
Generated actions resolve their target command the same way and inherit the same
permission record before executing.

`checkPermissions` queries each permission concurrently via
`permissions.contains`, skips the Chrome-incompatible `contextualIdentities`
check when not on Firefox, and — defensively — treats any thrown error as "all
requested permissions missing." See [execution-and-actions.md](execution-and-actions.md)
for the full execution path.

## Browser truth vs Redux mirror

The Redux mirror (`shared/store/slices/settings.slice.ts`,
`permissions: { isLoaded, access }`) exists only for UI responsiveness. It is
populated and refreshed by sending `get-permissions` to the background:

- `background/messages/getPermissions.ts` (`getPermissions`) calls
  `permissions.getAll()` and returns `{ isLoaded: true, access }`, where `access`
  is a fixed-key boolean map. `contextualIdentities` reports `true` only on
  Firefox; on Chrome it is hard-coded `false`.
- `loadPermissions` populates the mirror on startup; `refreshPermissions` re-reads
  it after any grant/denial/error and from the throttled hook effect.

Authoritative checks always go back to the live browser API:

- `getPermissions` reads `permissions.getAll()` at call time.
- `requestPermission` returns `permissions.contains()` after the request, not the
  request result.
- `PermissionActions` and `PermissionGrantPanel` re-check `permissions.contains()`
  in-page after a direct request.
- `executeResolvedCommand` calls `checkPermissions` immediately before protected
  work, so a stale "granted" mirror cannot cause a protected `execute` to run
  without the real permission.

## Behavior on grant, denial, revocation

- **Grant.** Browser truth flips to granted; `refreshPermissions()` updates the
  mirror; `PermissionActions` fires `onRefresh` to re-fetch commands and shows a
  success toast; the row becomes executable without an extension reload.
- **Denial.** `granted` resolves `false`; the mirror is refreshed (still
  not-granted); a warning toast ("Permission was denied" or a specific error) is
  shown; the row stays gated and the grant action remains available.
- **Revocation** (user removes a permission in browser settings while Monocle is
  open). Browser truth becomes not-granted. The mirror can be stale until the
  next refresh, but the throttled `usePermissionsGranted` effect re-fetches truth,
  and the execution-time `checkPermissions` blocks any protected run regardless of
  the mirror, so a revoked permission cannot silently execute.

## Known issues / notes

- Permission state is intentionally duplicated between browser truth and Redux.
  The browser API remains authoritative everywhere it matters; the mirror is a
  responsiveness optimization only.
- The throttle timestamp in `usePermissionsGranted` is module-global and shared
  by every mounted permissioned row, so refreshes are coalesced extension-wide,
  not per row.
- `contextualIdentities` is special-cased in two layers (`checkPermissions` skips
  the Chrome check; `getPermissions` reports `false` on Chrome). Keep both in
  sync if the set of Firefox-only permissions changes.

## Manual test checklist

Automated coverage exists for `requestPermission`, `openPermissionGrantPage`, and
`PermissionGrantPanel`. The following still require manual browser verification:

- Start from a fresh install or after clearing `monocle-settings`.
- Open a permission-protected command (e.g. bookmarks). Confirm the row shows a
  missing-permissions label and that pressing Enter shows the
  "Permissions required" toast rather than executing.
- Open the action menu on that row and confirm a "Grant <Name> permission" item
  appears.
- Chrome: grant via the action item and confirm the command becomes executable
  without reloading the extension; confirm a success toast.
- Chrome: deny the prompt and confirm a warning toast and that the row stays
  gated.
- Firefox content overlay: confirm the grant action opens a Monocle tab with a
  Grant button, and that clicking it grants the permission and updates state.
- Firefox where the in-page permissions API is available: confirm the direct
  in-page grant path works without opening a new tab.
- Navigate into a permission-protected group/search page while the permission is
  missing and confirm the "Permission Required" display row appears with a working
  grant path (no protected resolver runs).
- Revoke a granted permission from browser extension settings while Monocle is
  open, then confirm the row re-gates and execution is blocked.

## Related docs

- [architecture.md](architecture.md) — runtime modes and background boundary.
- [messaging.md](messaging.md) — `get-permissions`, `request-permission`,
  `open-permission-grant-page` message shapes.
- [command-schema.md](command-schema.md) — the `permissions` field on command
  nodes.
- [execution-and-actions.md](execution-and-actions.md) — execution flow and the
  action menu.
- [settings.md](settings.md) — the settings store and Redux mirror.
- [commands/browser.md](commands/browser.md) — per-command permission detail.
