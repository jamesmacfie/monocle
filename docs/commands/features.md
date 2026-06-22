# Feature Commands

Feature commands are palette commands contributed by **feature modules** rather than by a static category file. Unlike `browser`/`tools`/`ui`/`new-tab`, there is no `background/commands/features/index.ts`; the rows in this category are projected from the feature registry at command-load time. `background/commands/source.ts` (`loadCommandEntries`) calls `getFeatureCommands(context)` from `background/features/index.ts` and maps the result into the `features` category. Each registered `FeatureModule` returns its palette commands from `feature.commands(context)`; the registry flattens them.

The registry holds five features: **Focus Mode** (`background/features/focus/`), one state-aware group; **Tab Groups** (`background/features/tabGroups/`), cross-browser saved-collection commands plus a Chrome-only native-group command layer; **Element Hider** (`background/features/elementHider/`), a picker-launching action plus a manage action; **Native Bridge** (`background/features/nativeMessaging/`), enable/disable toggle commands; and **Extension Integrations** (`background/features/extensionRegistry/`), enable/disable toggle commands. The last two are `hiddenFromFeaturesPage` and managed on the bespoke **Integrations** options page rather than the generic Features pages, but their palette commands still flow through the same `getFeatureCommands` projection. See [../features.md](../features.md) for registry mechanics (config/state stores, options Features page, lifecycle), [../focus-mode.md](../focus-mode.md) for Focus Mode's session model, [../element-hider.md](../element-hider.md) for Element Hider, [../native-messaging/README.md](../native-messaging/README.md) for the Native Bridge, and [../extension-extension/README.md](../extension-extension/README.md) for Extension Integrations.

## How these commands are loaded

- `background/features/index.ts` holds the static registry (`const features = [focusFeature, tabGroupsFeature, elementHiderFeature, nativeMessagingFeature, extensionRegistryFeature]`). `getFeatureCommands(context)` is `features.flatMap((f) => f.commands(context))`.
- `background/commands/source.ts` maps those commands into the `features` category (`{ id: "features", label: "Features" }`) alongside the other sources. They are part of the always-on command set (not gated like new-tab commands), then run through the standard `supportsPlatform` filter.
- The loader is synchronous, so a feature's `commands()` must be synchronous. Runtime state (e.g. whether a focus session is active) shows through **async node labels** and through which children a group resolves at navigation time, not through changing the command list.

## Summary

| Command | Id | Node type | Purpose | Visibility |
| --- | --- | --- | --- | --- |
| Focus Mode | `focus-mode` | `group` | Start/stop focus sessions and open settings | All contexts |
| └ Start Focus | `focus-start` | `action` | Start an indefinite blocking session | Child, when no session is active |
| └ Start for 30 Minutes | `focus-start-30` | `action` | Start a 30-minute timed session | Child, when no session is active |
| └ Start for 60 Minutes | `focus-start-60` | `action` | Start a 60-minute timed session | Child, when no session is active |
| └ Start Pomodoro | `focus-start-pomodoro` | `action` | Start a session for the configured default duration | Child, when no session is active |
| └ Stop Focus | `focus-stop` | `action` | End the current focus session | Child, when a session is active |
| └ Configure Focus Mode | `feature-focus-mode-configure` | `action` | Open the Focus Mode settings page | Child, always |
| Save Tabs as Group | `tab-groups-save` | `group` (form) | Save this window's tabs as a named group | All contexts |
| Restore Tab Group | `tab-groups-restore` | `group` | Reopen a saved group (all tabs or one at a time) | All contexts |
| Configure Tab Groups | `feature-tab-groups-configure` | `action` | Open the Tab Groups settings page | All contexts |
| Add Tab to Group | `tab-groups-native-add` | `group` | Add the current tab to a native group (or a new one) | Chrome only |
| Group All Tabs in Window | `tab-groups-native-group-window` | `action` | Group every tab in the window | Chrome only |
| Rename Current Group | `tab-groups-native-rename` | `group` (form) | Rename the current tab's native group | Chrome only |
| Set Group Color | `tab-groups-native-color` | `group` | Recolor the current tab's native group | Chrome only |
| Collapse/Expand Current Group | `tab-groups-native-collapse` | `action` | Toggle the group's collapsed state | Chrome only |
| Ungroup Current Tab | `tab-groups-native-ungroup` | `action` | Remove the current tab from its group | Chrome only |
| Hide element on this page | `element-hider-pick` | `action` | Enter element pick-mode to hide an element on this site | All contexts |
| Manage hidden elements | `element-hider-manage` | `action` | Open the Element Hider settings page | All contexts |
| Enable native bridge | `native-messaging-enable` | `action` | Turn on the native bridge (requests `nativeMessaging`/`tabs`) and connect the host | All contexts |
| Disable native bridge | `native-messaging-disable` | `action` | Turn off the native bridge and disconnect the host | All contexts |
| Enable extension integrations | `external-extensions-enable` | `action` | Let approved browser extensions add commands to Monocle | All contexts |
| Disable extension integrations | `external-extensions-disable` | `action` | Stop other extensions from adding commands | All contexts |

---

## Focus Mode

Source: `background/features/focus/commands.ts`, exported as `focusModeGroup` (`GroupCommandNode`). Id `focus-mode` (= `FOCUS_FEATURE_ID` in `background/features/focus/types.ts`), name "Focus Mode", icon `Shield`, color purple. Keywords: `focus`, `block`, `distraction`, `pomodoro`, `concentrate`. `settingsCatalog: { includeChildren: true }` so the group and its stable child rows appear in the options command catalog.

The group's `children()` is **state-aware**: it reads the current session (`getSession()`) and branches on `isSessionActive(session, Date.now())`:

- **No active session** → `Start Focus`, `Start for 30 Minutes`, `Start for 60 Minutes`, `Start Pomodoro`, then `Configure Focus Mode`.
- **Active session** → `Stop Focus`, then `Configure Focus Mode`.

All start/stop actions set `remainOpenOnSelect: true`, so selecting one keeps the palette open and the group re-resolves in place (the same pattern as the new-tab clock toggle): start it and the children flip to the Stop row without closing.

### Start actions

| Command | Behavior |
| --- | --- |
| `focus-start` ("Start Focus") | `startSession("indefinite")` — blocks distracting sites until stopped. |
| `focus-start-30` ("Start for 30 Minutes") | `startSession("timed", 30)` — ends automatically after 30 minutes. |
| `focus-start-60` ("Start for 60 Minutes") | `startSession("timed", 60)` — ends automatically after 60 minutes. |
| `focus-start-pomodoro` ("Start Pomodoro") | Reads `defaultDurationMinutes` from feature config at execute time, then `startSession("pomodoro", duration)`. The duration always reflects the latest "Pomodoro / default duration" setting (default 25). |

### `focus-stop` ("Stop Focus")

`execute` calls `stopSession()`. Its `name` is dynamic: when the session has an end time it reads the remaining milliseconds (`remainingMs`) and renders `"Stop Focus (M:SS left)"`; an indefinite session renders just `"Stop Focus"`.

### `feature-focus-mode-configure` ("Configure Focus Mode")

Built by the shared helper `createConfigureFeatureCommand(FOCUS_FEATURE_ID, "Focus Mode")` (`background/features/configureCommand.ts`). It is an `action` with icon `Settings` and keywords `settings`, `configure`, `options`, `focus mode`; on execute it calls `openOptionsPage("/features/focus-mode")` to deep-link to the feature's settings page. This is the generic "Configure <name>" affordance every feature exposes (kept as an explicit helper in `commands()` rather than registry magic). The general Open Settings command lives in [ui.md](./ui.md).

Sessions, the blocklist, the timed/Pomodoro end alarm, and the blocking overlay + new-tab badge (rendered through the Surfaces primitive, not focus-specific UI) are all documented in [../focus-mode.md](../focus-mode.md).

---

## Tab Groups

Source: `background/features/tabGroups/`. The feature splits into two command families:

**Saved collections** (`commands.ts`, cross-browser) — durable named lists of tabs, Session Buddy / OneTab style, persisted in the feature config (`monocle-feature-config`, key `tab-groups`, `config.savedGroups`):

- **Save Tabs as Group** (`tab-groups-save`) — a form group (name `input` + `submit`). On submit, `captureCurrentWindow` reads the focused window's tabs (recording each tab's `pinned`, its Firefox container `cookieStoreId`, and `muted` audio state), `addSavedGroup` persists, and (if `closeTabsAfterSave`) the captured tabs are closed.
- **Restore Tab Group** (`tab-groups-restore`) — a `group` listing each saved collection; each expands to "Open all N tabs" plus one `action` per tab. Restore honors per-tab `pinned`, reapplies `muted` (cross-browser, via `tabs.update` after creation), and — on Firefox only — reopens each tab in its saved `cookieStoreId` container (the id is persisted everywhere but ignored on Chrome, which has no container concept and would reject it). Also honors the `openRestoredInNewWindow` setting.
- **Configure Tab Groups** (`feature-tab-groups-configure`) — opens the settings page.

**Native groups** (`nativeCommands.ts`, Chrome only — `supportedBrowsers: ["chrome"]`, `permissions: ["tabGroups", "tabs"]`) — operate on the browser's live tab-strip groups via `chrome.tabs.group/ungroup` + `chrome.tabGroups.*` (wrapped in `background/utils/browserTabGroups.ts`); nothing is persisted. They are filtered out on Firefox by the standard `supportsPlatform` pass: add current tab to a group / new group, group all tabs in the window, rename / recolor / collapse-expand the current group, ungroup the current tab.

The settings page manages saved groups through the generic `record-list` field (see [../features.md](../features.md)): per-group **Restore** / **Rename** (inline) / **Delete**, and per-tab **Pin/Unpin** on expanded rows, plus the two behavioral switches. Row actions dispatch `monocle-feature-action-execute` with a `payload`; `handleAction` (`index.ts`) routes `restore-group` / `rename-group` / `delete-group` / `toggle-pin`.

## Element Hider

Source: `background/features/elementHider/commands.ts`, exported as `elementHiderCommands` (a function returning the two `ActionCommandNode`s). The feature id is `element-hider` (`ELEMENT_HIDER_FEATURE_ID` in `background/features/elementHider/types.ts`). Both commands are top-level actions (not a group), color purple.

- **Hide element on this page** (`element-hider-pick`, icon `EyeOff`, keywords `hide`/`element`/`block`/`declutter`/`remove`/`picker`). On a real `http(s)` page it `upsertSurface`s a tab-targeted `picker` surface owned by the feature id and URL-gated to the current page; on a non-web page it warns via toast and returns. It does not hide anything itself — content reports the picked element and the feature's `handleAction("element-picked")` saves a per-domain rule and hides it. See [../element-hider.md](../element-hider.md).
- **Manage hidden elements** (`element-hider-manage`, icon `Eye`, keywords `hidden`/`elements`/`manage`/`unhide`/`settings`). Calls `openOptionsPage("/features/element-hider")`. This feature uses its own named manage action rather than the shared `createConfigureFeatureCommand` helper / `feature-<id>-configure` id that Focus Mode and Tab Groups use.

The per-domain rules, the picker round-trip, and the projected `elementAppears` automations are documented in [../element-hider.md](../element-hider.md).

## Native Bridge

Source: `background/features/nativeMessaging/commands.ts`, exported as `nativeMessagingCommands`. Two always-present top-level `action`s that flip the feature's `enabled` config flag:

- **Enable native bridge** (`native-messaging-enable`, icon `Link`, `permissions: ["nativeMessaging", "tabs"]`) — sets `enabled: true` and opens the `connectNative` port (via a lazy `./port` import that keeps the port→pump chain out of the registry's static graph).
- **Disable native bridge** (`native-messaging-disable`, icon `Link`) — sets `enabled: false` and disconnects the port.

The feature is `hiddenFromFeaturesPage`; pairing, tokens, and the Allow-execution toggle are managed on the bespoke **Integrations** options page. See [../native-messaging/README.md](../native-messaging/README.md).

## Extension Integrations

Source: `background/features/extensionRegistry/commands.ts`, exported as `extensionRegistryCommands`. Two always-present top-level `action`s that flip the feature's `enabled` config flag:

- **Enable extension integrations** (`external-extensions-enable`, icon `Puzzle`) — sets `enabled: true`, allowing approved peer extensions to contribute commands.
- **Disable extension integrations** (`external-extensions-disable`, icon `Puzzle`) — sets `enabled: false`.

The feature is `hiddenFromFeaturesPage`; peer approval/revocation lives on the **Integrations** options page. See [../extension-extension/README.md](../extension-extension/README.md).

## Adding a feature's commands

A new feature contributes palette commands by returning them from its `FeatureModule.commands(context)` and registering the module in `background/features/index.ts`. There is no per-feature edit to `background/commands/source.ts` — the `getFeatureCommands` projection picks them up under the `features` category. Keep `commands()` synchronous and express runtime state through async labels / state-aware `children()`. See [../features.md](../features.md) for the full module contract (config schema, settings page, actions, lifecycle).

## Related docs

- [../features.md](../features.md) — the feature-module registry, config/state stores, options Features page, and lifecycle.
- [../focus-mode.md](../focus-mode.md) — Focus Mode's session model, blocklist, alarm, and Surfaces-rendered overlay/badge.
- [../surfaces.md](../surfaces.md) — the declarative overlay/badge primitive features render through.
- [../command-types.md](../command-types.md) — `group` and `action` node behavior.
- [ui.md](./ui.md) — the generic Open Settings command and theme commands.
- [../authoring-commands.md](../authoring-commands.md) — command authoring conventions.
