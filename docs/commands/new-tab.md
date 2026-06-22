# New-Tab Commands

New-tab commands only make sense on Monocle's new-tab page replacement, so they are shown only when the palette runs in new-tab mode. They live in `background/commands/newTab/` and are aggregated by `background/commands/newTab/index.ts` into `newTabCommands`. This category contains a single command today: a Clock settings group with a visibility toggle.

## Summary

| Command | Id | Node type | Purpose | Visibility |
| --- | --- | --- | --- | --- |
| Clock | `new-tab-clock` | `group` | New-tab clock settings | New-tab mode only |
| └ Hide/Show Clock | `toggle-clock-visibility` | `action` | Toggle whether the new-tab clock is shown | Child of the Clock group |

Registration:

```ts
// background/commands/newTab/index.ts
export const newTabCommands = [clockCommand]
```

## `isNewTab` gating

These commands are not part of the always-on command set. In `background/commands/source.ts`, `loadAllCommands(context, options)` only appends `newTabCommands` when the request context indicates new-tab mode:

```ts
if (context?.isNewTab) {
  commands.push(...newTabCommands)
}
```

`newtab/components/NewTabCommandPalette.tsx` fetches with `{ isNewTab: true }`. The content overlay does not set the flag, so new-tab commands never appear in the in-page overlay.

Two consequences:

- `allCommands`, the module-level export in `source.ts`, is `loadAllCommands()` with no context, so it is context-free and **excludes** new-tab commands. Any global surface that reads `allCommands` will not see them.
- `loadUserConfigurableCommands()` (`background/commands/userConfigurableCommands.ts`) **does** include `...newTabCommands` unconditionally, so the Clock group appears as a configurable command in the Manage Allow/Deny List surfaces even though it is only executable in new-tab mode.

---

## Clock

Source: `background/commands/newTab/clock.ts`, exported as `clockCommand` (`type: "group"`). Id `new-tab-clock`, name `"Clock"`, icon `Clock`, `supportedBrowsers: ["chrome", "firefox"]`, keywords `clock`, `time`, `new tab`.

A `group` whose `children()` returns a single child, the visibility toggle. It is a group to leave room for future clock settings.

### Toggle Clock Visibility

Defined inline as `toggleClockVisibility` (`type: "action"`, id `toggle-clock-visibility`). Its `name` and `description` are async functions that read current state via `getNewTabClockSettings()` (from `background/commands/settings.ts`), defaulting `show` to `true` when undefined:

| Current `show` | Row name | Description |
| --- | --- | --- |
| `true` (default) | "Hide Clock" | "Hide the clock on new tab page" |
| `false` | "Show Clock" | "Show the clock on new tab page" |

On execute it flips the persisted flag:

```ts
const currentSettings = await getNewTabClockSettings()
const isCurrentlyVisible = currentSettings.show ?? true
await updateNewTabClockSettings({ show: !isCurrentlyVisible })
```

This command only persists the `show` flag. How the clock is rendered (and other new-tab features such as the background image and theme picker, configured through the new-tab settings UI rather than dedicated palette commands) is documented in [../new-tab-and-theme.md](../new-tab-and-theme.md). The settings storage shape and Redux mirror are in [../settings.md](../settings.md).

---

## Related docs

- [../new-tab-and-theme.md](../new-tab-and-theme.md) - new-tab mode, clock rendering, background image, and theme.
- [../settings.md](../settings.md) - `getNewTabClockSettings` / `updateNewTabClockSettings` storage shape.
- [../command-types.md](../command-types.md) - `group` and `action` node behavior.
- [../palette-ui-and-navigation.md](../palette-ui-and-navigation.md) - how the new-tab palette fetches commands with `isNewTab`.
- [../authoring-commands.md](../authoring-commands.md) - adding a command and context-gated registration.
