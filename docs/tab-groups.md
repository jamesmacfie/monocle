# Tab Groups

> **Status: implemented.** Tab Groups is the second feature module
> (`background/features/tabGroups/`). Cross-browser **saved collections** and
> Chrome-only **native tab-group** commands work; manual Chrome/Firefox smoke is
> still listed below. CLAUDE.md owns the authoritative feature status.

Tab Groups lets a user **save the current window's tabs as a named collection**
and **restore it later**, plus — on Chrome only — manipulate the browser's live
tab-strip groups. It is a feature module: it contributes palette commands, a
typed config, and a `record-list` settings page through the generic feature
registry (see [features.md](./features.md)); it has no bespoke UI.

The feature splits in two:

- **Saved collections** — cross-browser, durable, Session-Buddy / OneTab style.
- **Native groups** — Chrome-only, operating on the browser's real tab-strip
  groups; nothing is persisted.

## Data model

Durable config lives in the feature-config store (`monocle-feature-config`, key
`tab-groups`); `background/features/tabGroups/types.ts` is the single Zod schema,
used both as the message-boundary validator and the storage-mutation guard
(`storage.ts` re-validates before every write).

```ts
type SavedTab = {
  id: string            // stable handle for per-tab row actions (pin toggle)
  url: string
  title?: string
  pinned?: boolean
  cookieStoreId?: string // Firefox container id (see below)
  muted?: boolean        // cross-browser audio mute state
}

type SavedGroup = {
  id: string
  name: string
  color?: string
  tabs: SavedTab[]
  createdAt: number
  updatedAt: number
}

type TabGroupsConfig = {
  savedGroups: SavedGroup[]
  openRestoredInNewWindow: boolean  // restore into a new window
  closeTabsAfterSave: boolean       // OneTab style; off by default
}
```

`cookieStoreId` is persisted on every browser but only **reapplied on Firefox
restore** — Chrome has no container concept and rejects the id. `muted` is
captured and reapplied cross-browser.

## Commands

The full command catalog (ids, node types, visibility) is in
[commands/features.md](./commands/features.md#tab-groups). In summary:

- **Saved collections** (`commands.ts`, cross-browser): *Save Tabs as Group*
  (`tab-groups-save`, a name-input form), *Restore Tab Group*
  (`tab-groups-restore`, a group listing each collection → "Open all N tabs"
  plus one action per tab), *Configure Tab Groups* (`feature-tab-groups-configure`).
- **Native groups** (`nativeCommands.ts`, Chrome only — `supportedBrowsers:
  ["chrome"]`, `permissions: ["tabGroups", "tabs"]`): add tab to a group / new
  group, group all tabs in the window, rename / recolor / collapse-expand /
  ungroup the current group. These are filtered out on Firefox by the standard
  `supportsPlatform` pass.

## Capture and restore

- **Capture** (`captureCurrentWindow` in `operations.ts`) reads the focused
  window's tabs, recording each tab's `pinned`, `cookieStoreId`, and `muted`.
  `addSavedGroup` persists; if `closeTabsAfterSave` is set, the captured tabs are
  closed after the save.
- **Restore** reopens each tab, honoring `pinned`, reapplying `muted` via
  `tabs.update` after creation, and — on Firefox only — reopening each tab in its
  saved `cookieStoreId` container. `openRestoredInNewWindow` controls whether the
  group opens in a new window or the current one.

Native-group commands wrap `chrome.tabs.group`/`ungroup` + `chrome.tabGroups.*`
in `background/utils/browserTabGroups.ts`; they mutate the live tab strip and
persist nothing.

## Settings page

The settings page renders through the generic `record-list` FormField (see
[features.md](./features.md)): per-group **Restore** / **Rename** (inline) /
**Delete**, per-tab **Pin/Unpin** on expanded rows, plus the two behavioral
switches (`openRestoredInNewWindow`, `closeTabsAfterSave`). Row actions dispatch
`monocle-feature-action-execute` with a scalar `payload`; `handleAction`
(`index.ts`) routes `restore-group` / `rename-group` / `delete-group` /
`toggle-pin`.

## Files

- `background/features/tabGroups/index.ts` — the `FeatureModule`: config schema,
  settings page, `commands(context)`, `handleAction`.
- `background/features/tabGroups/commands.ts` — saved-collection commands.
- `background/features/tabGroups/nativeCommands.ts` — Chrome-only native-group
  commands.
- `background/features/tabGroups/operations.ts` — capture/restore logic.
- `background/features/tabGroups/storage.ts` — validated CRUD over the config.
- `background/features/tabGroups/types.ts` — config types + Zod schema + defaults.
- `background/utils/browserTabGroups.ts` — the Chrome `tabGroups` API wrapper.

## Manual checks

- Save the current window as a group; confirm pinned/muted/container state is
  captured.
- Restore it (current window and new window); confirm pinned tabs come back
  pinned, muted tabs muted, and — on Firefox — tabs reopen in their container.
- On Chrome: add a tab to a group, group a window, rename/recolor/collapse and
  ungroup; confirm the native commands are absent on Firefox.
- Toggle `closeTabsAfterSave` and confirm the captured tabs close on save.

## Related docs

- [features.md](./features.md) — the feature-module registry, config/state
  stores, `record-list` field, and the options Features pages.
- [commands/features.md](./commands/features.md) — the full command catalog.
- [permissions.md](./permissions.md) — the optional `tabGroups` permission flow.
