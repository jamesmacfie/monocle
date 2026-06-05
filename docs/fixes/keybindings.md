# Keybindings Fix Plan

## Current Data Flow

Content and new-tab surfaces install global capture through
`useGlobalKeybindings` and `RobustKeyCapture`. Keyboard events are normalized by
`shared/utils/key-normalizer.ts`, filtered by `shared/utils/event-filter.ts`,
then sent to the background as `execute-keybinding`.

The background registry in `background/keybindings/registry.ts` maps normalized
keybindings to command ids. `executeKeybinding` manages global sequence state,
looks up exact or prefix matches, and executes the resolved command through the
normal background command execution path.

Custom keybindings are captured in `CommandActionsList`, stored through
`update-command-setting`, and considered by registry refresh and conflict
checks.

## Boundaries And Contracts

- Capture, storage, display, conflict checks, registry matching, and execution
  must all use one canonical keybinding representation.
- UI may capture candidate keybindings, but background remains authoritative
  for conflict checks and command execution.
- Editable page controls and palette inputs must keep normal text-editing
  behavior.
- The registry must use the same command universe as conflict detection.
- Keybinding execution must not bypass safety policies such as `confirmAction`.
- Sequence state should not leak across unrelated tabs or palette surfaces.

## Confirmed Gaps

- Normalization is not canonical enough. Angle-wrapped strings are preserved as
  provided, modifier order can differ, shifted letters can become uppercase,
  and defaults such as `<cmd-alt-i>` or `<alt-cmd-R>` may not match emitted
  event strings.
- Custom capture stores some special keys as display glyphs or display words,
  while execution emits canonical names such as `enter`, `backspace`, and arrow
  names.
- Business validation accepts a narrower keybinding subset than the type model
  and normalizer support.
- Registry initialization omits UI commands, new-tab commands, and website
  commands. Conflict detection uses context-free `allCommands` and raw string
  equality.
- Event suppression happens after awaiting the background response, which is
  too late for reliable prevention of browser defaults for handled shortcuts.
- The browser-command pass chose the default confirmation policy:
  `confirmAction` commands are not registered as global keybindings and do not
  expose Set Custom Keybinding actions. Broader keybinding execution and
  conflict coverage still needs dedicated tests.
- Sequence state is global in the background service worker, so simultaneous
  tabs can interfere.

## Required Fixes

- Implement a true canonical keybinding parser/formatter:
  - Lowercase primary keys except display-only formatting.
  - Sort modifiers in one defined order.
  - Normalize aliases such as `esc` and `escape`.
  - Normalize special keys, arrows, function keys, punctuation, and sequences.
  - Round-trip capture, stored settings, display, conflict checks, and registry
    lookup through the same code.
- Update custom capture to call the shared canonicalizer instead of maintaining
  a separate conversion path.
- Normalize both sides of conflict detection and registry insertion.
- Replace registry initialization with a context-aware command source that
  includes UI commands, new-tab commands when relevant, website commands when
  registered, Firefox commands, dynamic deep-search items, and custom settings.
- Add a content-side synchronous cache of known handled strokes and sequence
  prefixes, or another preflight mechanism, so `RobustKeyCapture` can suppress
  known handled browser shortcuts before awaiting background execution.
- Decide the confirmation policy for keybindings:
  - Do not allow keybindings on `confirmAction` commands.
  - Or route keybinding execution into a confirmation UI/toast flow.
  The current default prevents destructive confirmed commands from being
  registered globally.
- Scope sequence state by sender tab or sender document where possible.

## Required Tests

- Unit tests for canonical equivalence:
  modifier order, case, shifted letters, special keys, arrows, punctuation,
  function keys, plain keys, angle-wrapped keys, and multi-stroke sequences.
- Tests proving capture, storage, display, conflict detection, registry lookup,
  and execution agree on the same canonical string.
- Tests for duplicate custom keybinding conflict detection after normalization.
- Tests for registry coverage of browser, tool, UI, new-tab, Firefox, and
  website command sources after the chosen command-source fix.
- Tests for editable passthrough and page shortcut passthrough when no binding
  exists.
- Tests proving confirmation-required commands do not execute immediately from
  default or custom keybindings.
- Manual checks for `Cmd+W`, `Cmd+R`, palette toggle, custom keybinding
  capture/reset, and multi-stroke sequences in content and new-tab mode.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New keybinding normalizer, registry, conflict, capture, and execution tests
  pass.
- Manual smoke: keybindings execute only intended commands, editable fields are
  not broken, browser defaults are suppressed only for handled bindings, and
  destructive commands require confirmation or cannot be bound.
