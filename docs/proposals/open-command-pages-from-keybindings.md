# Open Command Pages From Keybindings

Status: Proposal.

## Problem

Monocle keybindings currently execute commands. That works for leaf actions, but
it does not work for useful command pages and forms such as Add Bookmark. Add
Bookmark already has the right page shape today: a group opens a form with title,
URL, folder, and submit rows. The missing behavior is a command-declared shortcut
that opens the palette directly at that command page instead of trying to execute
the group.

## Proposed Design

Add command-level keybinding metadata that can opt a shortcut into opening the
palette at a target command page.

- Keep current behavior as the default: executable `action` and `submit`
  commands run when their keybinding is pressed.
- Allow `group` and `search` commands to declare a keybinding only when they also
  declare a keyboard behavior of `openPaletteAtCommand`.
- Allow `action` and `submit` commands to use the same behavior when a shortcut
  should show the command in context rather than run it immediately.
- Treat this as command metadata, not a persisted user preference. Users still
  customize the keybinding value through existing command settings; they do not
  choose the behavior independently.

Suggested type direction:

```ts
type KeybindingBehavior = "execute" | "openPaletteAtCommand"

type CommandNodeBase = {
  keybinding?: string
  keybindingBehavior?: KeybindingBehavior
}
```

The registry should include both executable shortcuts and open-page shortcuts.
When an open-page shortcut matches, the background must not execute the command.
Instead, it should return an explicit open-palette result that includes the
target command id and enough page path information for the UI to open the
palette and navigate to that page.

## Behavior

- Pressing the Add Bookmark shortcut opens the content overlay or new-tab palette
  directly on the Add Bookmark form with current tab defaults populated.
- Pressing a group/search open shortcut should respect the same context,
  permissions, URL rules, and browser support filters as normal palette
  navigation.
- Missing permissions should open the target page to the normal permission row,
  not silently fail and not execute anything.
- Open-page shortcuts must still honor editable-element passthrough and critical
  browser shortcut filtering from the current keybinding system.
- Generated action-menu rows are not targets for this proposal.

## Boundaries

- Background remains the owner of command resolution, visibility, permissions,
  and keybinding matching.
- UI remains the owner of showing the palette and moving the navigation stack.
- This proposal does not add an ex command line, arbitrary input prefill, or
  mode-specific shortcut handling.

## Success Criteria

- A command author can declare Add Bookmark with a shortcut that opens its form.
- Existing action shortcuts continue to execute with no migration required.
- The Keyboard settings page can display and edit open-page shortcuts the same
  way it displays executable command shortcuts.
- The Vim shortcut template can include Add Bookmark as an enabled row once this
  proposal is implemented.

## Tests

- Unit test registry entries for executable and open-page command metadata.
- Unit test `execute-keybinding` returns an open-palette response for an
  `openPaletteAtCommand` binding and does not call the command executor.
- Navigation test opens a group/form page from an open-palette response and
  preserves default form values.
- Permission test verifies a permission-gated group shortcut opens to the
  permission-required row when permission is missing.
