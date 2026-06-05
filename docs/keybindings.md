# Keybindings

## Current Status

Status: working with review notes.

Monocle has a substantial keybinding system: canonical key formats, global
event capture, multi-stroke sequences, command execution from keybindings,
custom keybinding capture, conflict checks, and display formatting. The code
builds, canonical parsing is shared across capture/storage/display/registry
paths, and registry coverage is now context-aware. Manual browser validation is
still needed before considering the feature fully stable in Chrome and Firefox.

## How It Is Hooked Together

- `shared/utils/key-normalizer.ts` normalizes keyboard events and stored
  keybinding strings into canonical forms such as `<cmd-shift-k>`.
- `shared/utils/event-filter.ts` decides when page/editable events should pass
  through or be considered for extension keybindings.
- `shared/utils/robust-key-capture.ts` installs capture listeners at multiple
  DOM levels and can suppress known handled shortcuts before awaiting the
  background response.
- `shared/hooks/useGlobalKeybindings.tsx` installs `RobustKeyCapture` and sends
  `get-keybinding-state` and `execute-keybinding` messages to the background.
- `background/keybindings/source.ts` loads globally bindable commands from the
  current command context, including UI commands, new-tab commands when
  relevant, website commands when URL-visible, Firefox commands, deep-search
  items, and custom-bound nested commands.
- `background/keybindings/registry.ts` builds normalized registry snapshots and
  matches exact bindings or sequence prefixes.
- `background/messages/executeKeybinding.ts` handles sender-scoped sequence
  state, delayed single-stroke execution, and final command execution.
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
3. UI checks its cached exact bindings and sequence prefixes to suppress known
   handled shortcuts synchronously.
4. UI sends `execute-keybinding`.
5. Background appends the stroke to sender-scoped sequence state.
6. A context-aware registry snapshot finds exact or prefix matches.
7. Background executes the matching command or waits for another stroke.

## Test Coverage

Automated test coverage: improved but still not a browser integration suite.

Build checks that currently touch this feature:

- `pnpm run tsc` validates keybinding types and message shapes.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm run build` validates content/new-tab/background bundles.
- `shared/utils/key-normalizer.test.ts` covers canonical equivalence for
  modifier order, case, aliases, special keys, arrows, punctuation, function
  keys, keyboard events, display formatting, and sequences.
- `background/keybindings/registry.test.ts` covers normalized registry lookup,
  conflict detection, sequence prefixes, confirmation-required command
  exclusion, and command-source coverage for browser, tool, UI, new-tab,
  website, Firefox, and deep-search commands.
- `background/utils/validation.test.ts` covers message validation for canonical
  keybindings with punctuation, arrows, and sequences.
- `background/commands/browser-commands.test.ts` covers the high-risk policy
  that confirmation-required browser commands are not globally keybindable.

Remaining gaps are manual or browser-level: editable passthrough, page shortcut
passthrough, real browser default suppression timing, action-menu capture UX,
and full Chrome/Firefox smoke coverage.

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
- Registry and conflict detection now use the same context-aware keybinding
  source and normalize both sides before comparing.
- Custom keybinding capture now uses the shared event normalizer instead of a
  separate glyph conversion path.
- Sequence state is scoped by sender tab/document when sender data is available,
  with a context fallback for extension pages and tests.
- Commands with `confirmAction: true` remain excluded from default and custom
  global keybindings.
- Manual browser smoke is still needed for actual shortcut suppression timing,
  editable passthrough, and cross-browser modifier behavior.
