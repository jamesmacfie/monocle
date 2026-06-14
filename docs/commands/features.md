# Feature Commands

Feature commands are palette commands contributed by **feature modules** rather than by a static category file. Unlike `browser`/`tools`/`ui`/`new-tab`, there is no `background/commands/features/index.ts`; the rows in this category are projected from the feature registry at command-load time. `background/commands/source.ts` (`loadCommandEntries`) calls `getFeatureCommands(context)` from `background/features/index.ts` and maps the result into the `features` category. Each registered `FeatureModule` returns its palette commands from `feature.commands(context)`; the registry simply flattens them.

Today the registry holds a single feature, **Focus Mode** (`background/features/focus/`), which contributes one state-aware group. For the registry mechanics (config/state stores, the options Features page, lifecycle) see [../features.md](../features.md); for Focus Mode's session model, blocklist, and the declarative overlay/badge it renders see [../focus-mode.md](../focus-mode.md).

## How these commands are loaded

- `background/features/index.ts` holds the static registry (`const features = [focusFeature]`). `getFeatureCommands(context)` is `features.flatMap((f) => f.commands(context))`.
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

---

## Focus Mode

Source: `background/features/focus/commands.ts`, exported as `focusModeGroup` (`GroupCommandNode`). Id `focus-mode` (= `FOCUS_FEATURE_ID` in `background/features/focus/types.ts`), name "Focus Mode", icon `Shield`, color purple. Keywords: `focus`, `block`, `distraction`, `pomodoro`, `concentrate`. `settingsCatalog: { includeChildren: true }` so the group and its stable child rows appear in the options command catalog.

The group's `children()` is **state-aware**: it reads the current session (`getSession()`) and branches on `isSessionActive(session, Date.now())`:

- **No active session** → `Start Focus`, `Start for 30 Minutes`, `Start for 60 Minutes`, `Start Pomodoro`, then `Configure Focus Mode`.
- **Active session** → `Stop Focus`, then `Configure Focus Mode`.

All start/stop actions set `remainOpenOnSelect: true`, so selecting one keeps the palette open and the group re-resolves in place (the same pattern as the new-tab clock toggle) — start it and the children flip to the Stop row without closing.

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

Built by the shared helper `createConfigureFeatureCommand(FOCUS_FEATURE_ID, "Focus Mode")` (`background/features/configureCommand.ts`). It is an `action` with icon `Settings` and keywords `settings`, `configure`, `options`, `focus mode`; on execute it calls `openOptionsPage("/features/focus-mode")` to deep-link straight to the feature's settings page. This is the same generic "Configure <name>" affordance every feature exposes (kept as an explicit helper in `commands()` rather than registry magic). The general Open Settings command lives in [ui.md](./ui.md).

Sessions, the blocklist, the timed/Pomodoro end alarm, and the blocking overlay + new-tab badge (rendered through the Surfaces primitive, not focus-specific UI) are all documented in [../focus-mode.md](../focus-mode.md).

---

## Adding a feature's commands

A new feature contributes palette commands by returning them from its `FeatureModule.commands(context)` and registering the module in `background/features/index.ts`. There is no per-feature edit to `background/commands/source.ts` — the `getFeatureCommands` projection picks them up automatically under the `features` category. Keep `commands()` synchronous and express runtime state through async labels / state-aware `children()`. See [../features.md](../features.md) for the full module contract (config schema, settings page, actions, lifecycle).

## Related docs

- [../features.md](../features.md) — the feature-module registry, config/state stores, options Features page, and lifecycle.
- [../focus-mode.md](../focus-mode.md) — Focus Mode's session model, blocklist, alarm, and Surfaces-rendered overlay/badge.
- [../surfaces.md](../surfaces.md) — the declarative overlay/badge primitive features render through.
- [../command-types.md](../command-types.md) — `group` and `action` node behavior.
- [ui.md](./ui.md) — the generic Open Settings command and theme commands.
- [../authoring-commands.md](../authoring-commands.md) — command authoring conventions.
