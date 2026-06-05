# Keybindings

## Current Status

Status: partial.

Monocle has a substantial keybinding system: canonical key formats, global
event capture, multi-stroke sequences, command execution from keybindings,
custom keybinding capture, conflict checks, and display formatting. The code
builds, but registry coverage is uneven and needs manual validation before
keybindings can be considered stable across all command categories.

## How It Is Hooked Together

- `shared/utils/key-normalizer.ts` normalizes keyboard events and stored
  keybinding strings into canonical forms such as `<cmd-shift-k>`.
- `shared/utils/event-filter.ts` decides when page/editable events should pass
  through or be considered for extension keybindings.
- `shared/utils/robust-key-capture.ts` installs capture listeners at multiple
  DOM levels and suppresses events only when the extension handles them.
- `shared/hooks/useGlobalKeybindings.tsx` installs `RobustKeyCapture` and sends
  `execute-keybinding` messages to the background.
- `background/keybindings/registry.ts` owns the keybinding registry and matches
  exact bindings or sequence prefixes.
- `background/messages/executeKeybinding.ts` handles sequence state, delayed
  single-stroke execution, and final command execution.
- `shared/components/KeybindingDisplay.tsx` renders canonical keybindings in a
  user-facing format.
- `shared/components/Command/CommandActionsList.tsx` implements custom
  keybinding capture and saving.
- `background/messages/updateCommandSetting.ts` persists custom keybindings and
  refreshes the registry.
- `background/messages/checkKeybindingConflict.ts` checks default and custom
  keybinding conflicts.
- Commands with `confirmAction: true` are excluded from registry insertion and
  do not expose Set Custom Keybinding actions. They must be executed through a
  UI path that can show confirmation.

The main data flow is:

1. User presses a key.
2. Content or new-tab UI normalizes/captures the event.
3. UI sends `execute-keybinding`.
4. Background appends the stroke to sequence state.
5. Registry finds exact or prefix matches.
6. Background executes the matching command or waits for another stroke.

## Test Coverage

Automated test coverage: narrow.

Build checks that currently touch this feature:

- `pnpm run tsc` validates keybinding types and message shapes.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm run build` validates content/new-tab/background bundles.
- `background/commands/browser-commands.test.ts` covers the high-risk policy
  that confirmation-required browser commands are not globally keybindable.

There are still no tests for canonical normalization, editable passthrough,
multi-stroke timing, conflict detection, custom capture, full registry refresh,
or cross-platform modifier behavior.

## Manual Test Checklist

- Open a normal webpage with an editable text field.
- Confirm normal text input is not intercepted.
- Press `Cmd+Shift+K` and confirm the palette opens.
- Execute a command with a default keybinding such as a tab/window command.
- Add a custom keybinding from the action menu and confirm it appears in the UI.
- Execute the command through the custom keybinding.
- Reset the custom keybinding and confirm the default behavior returns.
- Attempt to assign a duplicate keybinding and confirm conflict state appears.
- Test a multi-stroke sequence if one is configured or after adding one.
- Confirm page-level shortcuts pass through when they are not registered by
  Monocle.
- Repeat core checks in both content overlay and new-tab mode.
- Repeat modifier checks on Firefox if cross-browser support is a goal for the
  next pass.

## Code Review Notes

- The keybinding architecture is more robust than a simple document keydown
  listener. Separating normalization, filtering, capture, registry matching,
  and UI display is the right structure.
- Registry initialization currently registers browser commands, tool commands,
  Firefox commands, and deep-search commands. It does not register UI commands,
  new-tab commands, or website commands uniformly. This is the main correctness
  risk.
- Conflict detection uses `allCommands`, which is context-free and excludes
  some command sources. This can miss conflicts for command categories that are
  not in `allCommands`.
- Custom keybinding capture has its own conversion path in
  `CommandActionsList.tsx`. It should be tested against the shared normalizer
  so capture, storage, display, and execution always agree.
- Sequence state lives globally in the background service worker. That is
  simple, but multiple tabs using sequences at the same time could interfere.
- `execute-keybinding` validation currently permits a narrower subset of
  canonical forms than the type-level keybinding model suggests. Special keys
  and uncommon sequences need manual checks.
