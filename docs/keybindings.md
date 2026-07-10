# Keybindings

Monocle lets commands declare keyboard shortcuts and lets users assign custom ones. Every keybinding — typed by a command author, captured from the user, or read off a live keyboard event — is funnelled through a single canonical normalizer so storage, matching, conflict detection, and display all agree on one string form such as `<cmd-shift-k>`. The UIs (content overlay and new-tab) capture keydown events globally, suppress the ones the background says it handles, and forward the rest as `monocle-keybinding-execute` messages. The background owns a context-aware registry that resolves exact matches and multi-stroke sequence prefixes, then either executes the matched command through the normal execution path or tells the UI to open the palette at a command page.

This doc covers the canonical format, normalization rules, event filtering, capture, the background registry, custom user bindings, conflict detection, the high-risk command policy, display, and known coverage gaps.

## Canonical Key Format

Canonical keybindings use angle-bracket strokes joined by `, ` for sequences. The grammar:

| Form | Examples | Notes |
| --- | --- | --- |
| Modified single stroke | `<cmd-k>`, `<ctrl-d>`, `<alt-shift-f>`, `<cmd-shift-enter>` | Modifiers always inside angle brackets, dash-separated, key last. |
| Plain key (no modifiers) | `g`, `escape`, `space`, `enter`, `f12`, `/` | No angle brackets when there are no modifiers. |
| Multi-stroke sequence | `<cmd-k>, <cmd-s>`, `g, g`, `g, <alt-cmd-u>` | Strokes separated by `, `. Each stroke normalized independently. |

Source of truth: `shared/utils/key-normalizer.ts`, function `normalizeKeybinding`. `formatKeyStroke` produces a bare key string when there are no modifiers and an `<…>` wrapped string otherwise.

### Modifier ordering and names

The four canonical modifier names are `cmd`, `ctrl`, `alt`, `shift`, and they are always emitted in that order (`MODIFIER_ORDER`). `sortModifiers` reorders any input set into this order, so `<alt-cmd-R>` normalizes to `<cmd-alt-r>`.

Many aliases collapse to those four (`MODIFIER_ALIASES`):

| Canonical | Accepted aliases |
| --- | --- |
| `cmd` | `cmd`, `command`, `meta`, `mod`, `m` |
| `ctrl` | `ctrl`, `control`, `c` |
| `alt` | `alt`, `option`, `opt`, `a` |
| `shift` | `shift`, `s` |

`mod`/`m`/`meta` all map to `cmd` — there is **no platform-aware "mod" remapping** during normalization. `<mod-k>` always becomes `<cmd-k>` regardless of OS.

### Platform handling

`platform` is detected from the user agent (`"Mac"`, `"Linux"`, `"Windows"`, or `"Unknown"`). It is **not** consulted by `normalizeKeybinding`, `getKeyString`, or registry matching — canonicalization is platform-independent. The only platform-aware helper is the exported `platformNormalize`, which on Mac rewrites `ctrl` modifiers to `cmd`; it is exported but not used in the capture/registry/execution paths documented here — the live system uses `normalizeKeybinding`/`getKeyString` directly.

### Key aliasing

Primary keys are lowercased and aliased so that visually different inputs converge (`normalizePrimaryKey`, plus the code/display tables):

- Special keys: `esc`/`escape` -> `escape`, `return`/`enter` -> `enter`, `spacebar`/`space`/`" "` -> `space`, `del`/`delete` -> `delete`, arrow long names -> `up`/`down`/`left`/`right`, plus `home`, `end`, `pageup`, `pagedown`, `insert`, `tab`, `backspace`.
- Display glyphs in (legacy) stored strings: `⌫⌦⎋␣↵⇞⇟⇥←↑→↓↖↘` map back to their key names; modifier glyphs `⌘⌃⌥⇧` are tokenized back to `cmd ctrl alt shift`.
- Function keys: `f1`..`f24`.
- Punctuation by `code`: `Backquote`->`` ` ``, `Minus`->`-`, `Slash`->`/`, `Comma`->`,`, `Backslash`->`\`, etc. (`CODE_KEY_ALIASES`).
- **Shifted symbols fold to base key + shift**: `?` -> `<shift-/>`, `!` -> `<shift-1>`, `@` -> `<shift-2>`, `+` -> `<shift-=>`, `<` -> `<shift-,>`, `{` -> `<shift-[>`, etc. (`SHIFTED_SYMBOL_ALIASES`). So `<cmd-?>` normalizes to `<cmd-shift-/>`.

`normalizeKeybinding` returns `""` for anything it cannot parse (including a modifier-only string like `<cmd>`), and `isValidKeybinding` is simply `normalizeKeybinding(x) !== ""`.

### Parsing inputs other than canonical

`parseKeyStroke` accepts three input shapes so older/loose strings still parse:

1. Angle-bracket dashed: `<cmd-shift-k>` (the canonical form).
2. Display/glyph or space-tokenized: `⌘ ⇧ K` -> `<cmd-shift-k>`.
3. Bare dashed without brackets when it starts with a modifier prefix: `cmd-k`.

`splitKeybindingSequence` splits a sequence on top-level commas only — commas inside `<…>` are preserved via angle-depth tracking, and a lone `,` is treated as the comma key.

### Reading live keyboard events

`getKeyString(event)` is the event-to-canonical converter used by both capture paths. It returns `""` for modifier-only keydowns (`MODIFIER_KEYS`). It prefers `event.code` (`getPrimaryFromCode`) so the physical key wins over OS-composed `event.key` — `Cmd+Alt+R` on Mac reports `event.key === "®"` but `code === "KeyR"`, yielding `<cmd-alt-r>`. Modifier booleans (`metaKey`/`ctrlKey`/`altKey`/`shiftKey`) are appended and sorted. `shared/utils/key-normalizer.test.ts` pins these equivalences (event form and string form produce identical canonical output).

## Quick Reference

| You type / press | Canonical | Display (`toDisplayFormat`) |
| --- | --- | --- |
| `<alt-cmd-R>` | `<cmd-alt-r>` | `⌘ ⌥ R` |
| `⌘ ⇧ K` | `<cmd-shift-k>` | `⌘ ⇧ K` |
| `<m-s-k>` | `<cmd-shift-k>` | `⌘ ⇧ K` |
| `<cmd-esc>` | `<cmd-escape>` | `⌘ ⎋` |
| `?` | `<shift-/>` | `⇧ /` |
| `<cmd-,>` | `<cmd-,>` | `⌘ ,` |
| `<shift-F12>` | `<shift-f12>` | `⇧ f12` |
| `G, <alt-cmd-R>, ⌘ ⇧ K` | `g, <cmd-alt-r>, <cmd-shift-k>` | `G, ⌘ ⌥ R, ⌘ ⇧ K` |
| `<cmd>` (modifier only) | `""` (invalid) | — |

## Event Filtering (passthrough vs capture)

`shared/utils/event-filter.ts` `shouldCapture(event)` decides whether a keydown is even a candidate for an extension shortcut. It returns `false` (let the page/browser handle it) when:

- The key is a modifier-only key.
- The event originates **inside the palette UI** (`isWithinCommandPalette`): the extension shadow host `#extension-root`, `[cmdk-root]`, `.raycast-submenu-overlay`, `[data-command-palette]`, `.content_script`, or `.raycast`. This lets CMDK handle its own input.
- The target is an **editable element** (`isEditableElement`) AND either the event is a known text-editing shortcut (`isTextEditingShortcut`) or it has no non-shift modifier. Editable detection is broad: `input`/`textarea`/`select`, `contenteditable` (`true`/empty/`plaintext-only`), `inputmode`, ARIA roles (`textbox`, `combobox`, `searchbox`, `spinbutton`, `listbox`, `grid`), and many editor libraries (Monaco, CodeMirror, Ace, Lexical, ProseMirror, Google Docs/Kix, Notion, Slate/Quill/Medium via data attributes, design canvases).
- The shortcut is a critical system shortcut (`isCriticalBrowserShortcut`): Alt+Tab, Cmd+Tab, Ctrl+Alt+Delete, bare F11, Cmd+Q.

Inside an editable element, a combination with a non-shift modifier (Cmd/Ctrl/Alt) that is **not** a text-editing shortcut is allowed through to be checked against keybindings (`hasNonShiftModifier`). `isTextEditingShortcut` blocks the usual editing combos (Cmd+A/C/V/X/Z/Y/B/I/U/K/E/L/R/J, word nav, Tab, Enter, Escape, Alt+arrows, etc.).

`getActualEventTarget` uses `composedPath()[0]` so shadow-DOM retargeting does not hide the real editable element.

## Global Capture in the UIs

`shared/utils/robust-key-capture.ts` (`RobustKeyCapture`) installs **capture-phase, non-passive** `keydown` listeners at both `window` and `document` for redundancy. On each event it:

1. Runs `shouldCapture`; bails if false.
2. Computes `getKeyString`; bails if empty.
3. If `shouldPreemptivelySuppress(keyString, event)` returns true, suppresses immediately (`preventDefault` + `stopImmediatePropagation`) *before* awaiting the async handler — this prevents the browser default firing during the round-trip for shortcuts already known to be handled.
4. Calls `onKeyPress`; if it resolves `true` and the event was not already preemptively suppressed, suppresses then.

`shared/hooks/useGlobalKeybindings.tsx` wires `RobustKeyCapture` into both palette modes (`isNewTab` option flows into the context override sent on each message). Its responsibilities:

- **State refresh.** On mount and whenever `monocle-settings` changes in `chrome.storage.local`, it sends `monocle-keybinding-state-get` and caches `exactKeybindings` and `sequencePrefixes` sets. It also refreshes on any failed/unmatched execution.
- **Preflight suppression.** `shouldPreemptivelySuppress` returns true if the key (or the continued local sequence) is in the cached exact set or sequence-prefix set. Disabled while `isCapturing` (so the capture UI receives raw keys).
- **Execution.** `onKeyPress` sends `monocle-keybinding-execute` with the canonical `keyString` and the context override. On `success`: if the response contains `openPaletteAtCommand`, it calls the surface-provided opener callback (`useOpenPaletteAtCommand`); if the response is `pending` it extends the local sequence buffer (`updateLocalSequenceForPendingStroke`), else it clears it. Non-success clears the buffer and re-refreshes state.
- **Open-page shortcuts.** `useOpenPaletteAtCommand` fetches fresh root commands, resets navigation to root, and dispatches `navigateToCommand` for the returned command id. Content mode first shows the overlay; new-tab mode reuses the already-mounted palette.
- **Local sequence buffer.** A UI-side buffer (`localSequenceRef`) tracks in-progress sequences with a `UI_SEQUENCE_IDLE_TIMEOUT_MS` idle timeout (`shared/utils/keybinding-timing.ts`: the background chord window plus 100 ms, because the UI timer starts after the round-trip resolves and must strictly outlive the background timer), used only to decide preemptive suppression of the *next* stroke. Authoritative sequence resolution happens in the background.

While capturing (`selectIsCapturing` true), both the preflight and `onKeyPress` short-circuit so global handling never competes with the custom-keybinding capture UI.

### Inline-input key handling

`shared/hooks/useInlineInputKeys.ts` is unrelated to global shortcuts; it governs keyboard behaviour for inline `input` command rows inside CMDK lists: Up/Down forward to CMDK (Up at the first item refocuses the search box), Escape refocuses search, Backspace `stopPropagation` to prevent navigate-back.

## Background Registry

`background/keybindings/registry.ts` builds a `KeybindingRegistrySnapshot`:

```ts
type KeybindingRegistrySnapshot = {
  bindings: Map<string, {
    commandId: string
    behavior: "execute" | "openPaletteAtCommand"
  }>
  sequencePrefixes: Set<string>      // every proper prefix of a multi-stroke binding
}
```

- `getKeybindingRegistrySnapshot(context, options)` is the **context-aware** entry point. It builds a fresh map from `loadKeybindingCommandEntries` and derives sequence prefixes (`createSequencePrefixes` adds every `strokes.slice(0, n)` for `n < length`).
- `registerBinding` normalizes the keybinding and **first registration wins** — a later command with the same normalized binding is dropped with a `console.warn` naming both commands, the de-facto conflict resolution at registry-build time (save-time conflict checks should prevent it from ever firing).
- A module-level singleton map (`keybindingRegistry`) backs the legacy synchronous helpers `getCommandIdForKeybinding`, `hasKeybindingStartingWith`, `registerSingleCommand`, `registerDynamicCommands`, `getAllKeybindings`. `initializeKeybindingRegistry` / `refreshKeybindingRegistry` rebuild it. These are used in tests and by `resetKeybinding` execution; the live message handlers prefer per-request snapshots.

### Which commands contribute bindings

`background/keybindings/source.ts` `loadKeybindingCommandEntries`:

1. Loads command settings and the **filtered root commands for the given context** (`getFilteredRootCommands`) — so global hidden settings, URL filtering, and new-tab/Firefox context already apply.
2. `collectDeepSearchEntries` walks roots and recurses into `group` children only when deep search is enabled (`enableDeepSearch === true`, or inherited and not explicitly disabled), checking merged permissions (`hasRequiredPermissions`) and URL-filtering children before recursing. This is how nested commands (e.g. a specific bookmark) can carry a binding.
3. `collectCustomSettingEntries` adds any command that has a custom `keybinding` in settings, resolved by id via `resolveCommandById` even if it was not reached through deep search.

`background/keybindings/targets.ts` owns keybinding target metadata: whether a command is assignable, its behavior, default/effective binding, and requirements. Custom settings override the command default. `seenEntries` dedupes on `${id}:${keybinding}`.

`loadKeybindingCommandEntries` is cached at module scope (same service-worker lifetime pattern as `background/commands/searchIndex.ts`): entries are keyed by `isNewTab|url|platform` plus the site-SDK `scopeKey:revision` when present, with a ~30s TTL, an ~8-context cap, and inflight-build dedupe. Because entries are URL-filtered at build time, the key includes the URL — one rebuild per navigation, while every keystroke funnelling through `monocle-keybinding-execute`/`monocle-keybinding-state-get` on the same page is a Map lookup instead of a full command-tree traversal. Invalidation: `invalidateKeybindingEntriesCache()` is called synchronously from `refreshKeybindingRegistry()` (all settings write paths) and URL-rule mutation helpers, and `initializeKeybindingEntriesInvalidation()` (wired in `background/index.ts`) listens to `monocle-settings` storage changes and permission grant/revoke events. Tab/history/bookmark events are deliberately not wired (they fire constantly and dynamic children almost never carry default keybindings); the TTL covers that drift.

Because the snapshot depends on context and visibility settings, the same physical key can be bound in one context and absent in another — the registry test confirms `toggle-clock-visibility` (`<cmd-alt-c>`) resolves only in new-tab context, `github-toggle-star` (`<cmd-alt-g>`) only on a GitHub URL, and hidden commands are omitted even when they have custom bindings.

### Exact match vs sequence prefix, and sequence state

`behavior` defaults to `"execute"`. Commands that set `keybindingBehavior: "openPaletteAtCommand"` are still stored in the same registry, but an exact match returns an open-page instruction instead of calling the executor. `getCommandIdForKeybinding`, `getCommandIdFromSnapshot`, and `getAllKeybindings` remain compatibility helpers that project the richer entry back down to command ids.

`background/messages/executeKeybinding.ts` owns sequence resolution. When there is no active sequence for the sender scope, it first checks the current stroke against the context-aware snapshot. If the stroke is an exact match and no longer binding starts with that same stroke, it executes immediately without creating sequence state. Only ambiguous first strokes (`exact + longer`) or prefix-only first strokes enter the sender-scoped sequence buffer. Once a sequence is active, each request appends the normalized stroke and checks the joined prefix:

| `exactId` | `hasLonger` (a longer binding starts with this) | Result |
| --- | --- | --- |
| yes | no | execute immediately, or return `openPaletteAtCommand` for open-page bindings, then reset |
| yes | yes | schedule the exact command as `pendingSingle` after the timeout, return `{ pending: true }` |
| no | yes | wait for more strokes, schedule reset, return `{ pending: true }` |
| no | no (as full sequence) | retry treating the latest stroke as a fresh single; if still nothing, reset and return failure |

The chord timeout is **800 ms** (`CHORD_TIMEOUT_MS` in `shared/utils/keybinding-timing.ts`, shared with the UI buffer constant). A second stroke arriving before the timer fires disarms the timer via `clearSequenceTimer` (which also drops `pendingSingle` and bumps the state's `timerEpoch`) and continues the sequence; if the timer fires first, the pending single command executes.

Chord timer callbacks (`schedulePendingSingle`, `scheduleReset`) run **inside the per-scope serialization queue** (`runSerialized`), so a timer firing as a continuation stroke arrives cannot interleave with the stroke handler and double-execute. Each armed timer captures a monotonic `timerEpoch`; the queued callback bails if the state's epoch has moved on (or the state is gone), so a fired-but-queued stale timer is a no-op even after the state is deleted and recreated.

**Scope key** (`getSequenceScopeKey`): when sender tab info is available it is `tab:<tabId>:document:<documentId|frameId|top>`; otherwise it falls back to `context:<newtab|page>:<url>`. This scoping mitigates but does not eliminate the known risk that sequence state lives in the background service worker — concurrent tabs that fall back to the context key (e.g. extension pages without sender tab data) can still interfere.

### `monocle-keybinding-state-get` and `monocle-keybinding-execute`

- `background/messages/getKeybindingState.ts` returns `{ exactKeybindings, sequencePrefixes }` straight from the context-scoped snapshot. The UI caches these for preflight suppression.
- `background/messages/executeKeybinding.ts` returns `{ success, executed }`, `{ success, executed: false, pending: true }`, `{ success, executed: false, openPaletteAtCommand: { commandId } }`, or `{ success: false, error }`. See [messaging.md](messaging.md) for the full message catalog.

## Custom User Keybindings

Authoring side (`shared/types/commands.ts`): commands may declare a default `keybinding` (canonical string). `action` and `submit` commands execute by default and may opt out of user customization with `allowCustomKeybinding: false`. `group` and `search` commands can opt into keybinding support by declaring `keybindingBehavior: "openPaletteAtCommand"`; those bindings open the palette at the command page instead of executing anything.

`allowsKeybinding` (`background/utils/commands.ts`) is the gate used everywhere:

```ts
export function allowsKeybinding(command: CommandNode): boolean {
  if (getKeybindingBehavior(command) === "openPaletteAtCommand") {
    return command.type === "group" || command.type === "search"
  }
  if (!isExecutableCommandNode(command)) return false
  if (command.confirmAction === true) return false
  return command.allowCustomKeybinding !== false
}
```

The `add-bookmark` form group is the first built-in open-page command. It has no default shortcut, but it can receive one from the Keyboard page or the Vim template.

### Capture UI flow

Generated per-command actions come from `background/commands/suggestions.ts`:

- `createSetKeybindingAction` produces a `set-keybinding-<id>` action ("Set Custom Keybinding") only when `allowsKeybinding` is true. Its `executionContext` is `{ type: "setKeybinding", targetCommandId }` and it is `remainOpenOnSelect`.
- `createResetKeybindingAction` produces `reset-keybinding-<id>` ("Reset Custom Keybinding") only when a custom keybinding is currently set; its description shows the default it will restore.

`shared/components/Command/CommandActionsList.tsx` drives capture:

1. Selecting the Set action dispatches `startCapture({ commandId, requirements })` (keybinding slice), which sets `isCapturing`, records the target's requirements, and suspends global capture.
2. The inline widget and options dialog share `useKeybindingCapture` plus `KeybindingCaptureField`. The field focuses a native button and listens on `onKeyDownCapture` (capture phase, to beat CMDK). Each non-Enter/Escape keydown is converted with `getKeyString`, appended to `strokes`, and the running sequence is conflict-checked.
3. Enter saves when `canSave`: the palette sends `monocle-command-setting-update` with `setting: "keybinding"` and the normalized sequence, dispatches `completeCapture`, refreshes commands, and closes the menu. Save is blocked while a conflict or requirement violation is present.
4. Escape cancels (`cancelCapture`).

### Persistence and registry refresh

The custom keybinding is stored in command settings under the command id (`monocle-settings` -> command settings -> `keybinding`). See [settings.md](settings.md). The `monocle-command-setting-update` path persists it and refreshes the registry so subsequent `monocle-keybinding-state-get` reflects it. Reset is handled in the background (`background/commands/execution.ts`, `resetKeybinding` action branch in `executeGeneratedAction`): `removeCommandSetting(targetCommandId, "keybinding")` then `refreshKeybindingRegistry()`.

The keybinding Redux slice (`shared/store/slices/keybinding.slice.ts`) is intentionally tiny — `{ isCapturing, targetCommandId, requirements }` with `startCapture` / `cancelCapture` / `completeCapture` and `selectIsCapturing` / `selectTargetCommandId` / `selectCaptureRequirements`. It carries no keybinding data; the actual bindings live in settings and the background registry. `requirements` holds the target command's `KeybindingRequirements` (delivered via the `setKeybinding` execution context) so the palette capture box can hint constraints before the first stroke.

### Per-command keybinding requirements

Executable nodes (action/submit) can declare constraints on which custom keybindings they accept via `keybindingRequirements` (`shared/types/commands.ts`):

- `requireNonShiftModifier: true` — every stroke in the binding (including each stroke of a sequence) must include `cmd`, `ctrl`, or `alt`. Shift alone does not count, and plain keys are rejected. Required for commands whose shortcuts must fire **while an editable element is focused**: the content event filter (`shared/utils/event-filter.ts`, `hasNonShiftModifier`) only forwards editable-element keystrokes that carry a non-shift modifier, so a plain-key or shift-only binding would never reach the handler while typing. Snippet commands (`snippet-<uuid>`) opt in because insert-at-cursor is their whole purpose.

The shared validator is `validateKeybindingRequirements` / `describeKeybindingRequirements` (`shared/utils/keybinding-requirements.ts`); the type is extensible — new rule fields are added to `KeybindingRequirements` as commands need them. Enforcement points:

1. `monocle-keybinding-conflict-check` resolves the assignment target through `background/keybindings/assignmentTarget.ts` (live command first, settings-catalog fallback), evaluates the target's requirements per stroke, and returns `requirementViolation: { code, message }` (a violation is not a conflict — `hasConflict` stays false). Both capture UIs render the message and block save; requirements flow to the options dialog via the settings catalog (`keybindingRequirements` on `SettingsCatalogCommand`) and to the palette capture via the `setKeybinding` execution context.
2. `monocle-command-setting-update` (keybinding case) re-validates on persist and throws — the backstop against stale or forged messages. Clearing a binding always passes.
3. `monocle-command-keybindings-update` (batch/template path) skips violating updates and reports them in `conflicts` with `reason: "requirement-not-met"` and no `conflictingCommand`; the rest of the batch persists.

Enforcement is **assignment-time only**: a stored binding that violates a later-added requirement stays registered and degrades harmlessly (the event filter drops it inside editables; it still fires with page focus outside inputs). The next edit through either UI forces compliance.

### Conflict detection

`background/messages/checkKeybindingConflict.ts` normalizes the candidate, loads `loadKeybindingCommandEntries(context)`, resolves the target command's keybinding behavior via `assignmentTarget.ts`, and delegates to `evaluateKeybindingAssignment` (`background/keybindings/conflicts.ts`). A blocking conflict returns `{ hasConflict: true, conflictingCommand: { id, name }, conflictType }`:

- `conflictType: "exact"` — another command normalizes to the same canonical string.
- `conflictType: "shadowed-by-open-palette"` — the assignment puts an open-palette binding on a proper prefix of a sequence, in either direction: an existing open-palette binding shadows the candidate sequence, or the candidate (when the target command is open-palette) would shadow an existing sequence. Open-palette bindings execute immediately on exact match even when longer bindings share the prefix — the chord timer cannot deliver an `openPaletteAtCommand` response after the message channel closes — so the shadowed sequence could never fire. (Pushing a background-to-tab "open palette" message from the timer would lift this constraint; until then shadowing is blocked at save time.)

Prefix overlaps between two execute-behavior bindings are **not** blocking: they are returned as `warnings` (`{ type: "prefix-overlap", direction, command, keybinding }`) because the shared prefix still works — it just resolves after the chord timeout. The capture UI shows blocking conflicts in error text (save disabled) and warnings in warning text (save allowed). What counts as a conflict:

- Comparison is **after canonical normalization**, so `<shift-cmd-U>` conflicts with `<cmd-shift-u>` (`registry.test.ts`).
- It is **context-scoped**: a new-tab-only binding does not conflict in normal page context, and vice versa (`registry.test.ts` "checks new-tab keybinding conflicts only in new-tab context").
- It is **visibility-scoped**: hidden commands are omitted from conflict checks, matching registry snapshot behavior.
- The candidate command itself is excluded via `excludeCommandId`.

The capture UI calls this per stroke and disables save while a conflict exists. The registry's own first-wins behaviour means an unchecked duplicate would simply not register, but conflict detection surfaces the collision in the UI before saving.

## High-Risk Command Policy

Commands with `confirmAction: true` (destructive operations such as closing the current tab, clearing browsing data) are **excluded from all global keybindings** — both defaults and custom. The mechanism is `allowsKeybinding` returning false for `confirmAction === true`, which means:

- `getCommandKeybinding` returns `""`, so no entry enters the registry even if the user has a custom keybinding stored in settings (`registry.test.ts` "does not register confirmation-required commands, even with custom settings").
- `createSetKeybindingAction` returns `null`, so the action menu offers no Set Custom Keybinding option (`browser-commands.test.ts` "does not expose custom keybinding actions for confirmed commands").

Such commands must be executed through a UI path that can show the confirmation step (`ActionItem`'s `awaitingConfirmation` flow). `browser-commands.test.ts` also confirms `<cmd-w>`/`<cmd-shift-x>` for `close-current-tab` never resolve while `<cmd-t>` (`open-new-tab`) still does.

## Display

`shared/components/KeybindingDisplay.tsx` renders a canonical string with `toDisplayFormat`, which maps modifiers to glyphs (`⌘ ⌃ ⌥ ⇧`), special keys to glyphs (`PRIMARY_DISPLAY`: `↵ ⎋ ␣ ⌫` etc.), uppercases single letters, and joins stroke parts with spaces. The component splits on `,` for sequences and renders each part in a `<kbd>`, with an arrow `→` separator between strokes. Example: `<cmd-shift-enter>` -> `⌘ ⇧ ↵`.

## Known Coverage Gaps

Automated coverage is solid for the pure logic and registry behaviour but not for live browser integration:

- Covered by tests: canonical equivalence across modifier order/case/aliases/specials/arrows/punctuation/function keys/events/display/sequences (`shared/utils/key-normalizer.test.ts`); context-aware registry snapshots, sequence prefixes, canonical conflict detection, context-scoped conflicts, confirmation-required exclusion, entries-cache hit/invalidate/TTL behavior, duplicate-binding warnings, open-palette shadow blocking, and prefix-overlap warnings (`background/keybindings/registry.test.ts`); sequential and overlapping multi-stroke resolution plus pending-single chord-timer semantics under fake timers (`background/messages/sequence-keybinding.test.ts`); batch conflict/shadow skips (`background/messages/updateCommandKeybindings.test.ts`); the UI/background timing invariant (`shared/utils/keybinding-timing.test.ts`); high-risk policy at registry and suggestion level (`background/commands/browser-commands.test.ts`); message validation for punctuation/arrow/sequence keybindings (`background/utils/validation.test.ts`, per the prior baseline).
- Not covered (manual / browser-level): real `preventDefault` suppression timing, editable-element passthrough on real sites, page-shortcut passthrough, action-menu capture UX, and full Chrome/Firefox modifier smoke. `platformNormalize`'s Mac ctrl→cmd rewrite is exported but unused in live paths.
- Architectural risk: background sequence state is per-worker; the sender-scope key mitigates cross-tab interference only when sender tab data is present (context-key fallback can still collide). Registry coverage is more uniform now but UI/new-tab/website command sources are exercised less explicitly than browser/tool/Firefox/deep-search.

### Manual test checklist

- On a normal page with a text field, confirm typing is not intercepted.
- Press `Cmd+Shift+K` (or your bound open key) and confirm the palette opens.
- Execute a command via its default keybinding (e.g. a tab/window command).
- Add a custom keybinding from the action menu; confirm it shows in the UI and executes.
- Reset the custom keybinding; confirm the default returns.
- Assign a duplicate keybinding; confirm the conflict state blocks saving.
- Configure and test a multi-stroke sequence (e.g. `g, g`).
- Confirm unregistered page shortcuts still pass through to the page/browser.
- Repeat in both content overlay and new-tab mode, and on Firefox if cross-browser is in scope.

## Related docs

- [architecture.md](architecture.md) — runtime modes, boundaries, data flows.
- [messaging.md](messaging.md) — `monocle-keybinding-execute`, `monocle-keybinding-state-get`, `monocle-keybinding-conflict-check`, `monocle-command-setting-update` shapes.
- [command-schema.md](command-schema.md) — `keybinding`, `allowCustomKeybinding`, `confirmAction` fields.
- [execution-and-actions.md](execution-and-actions.md) — generated Set/Reset keybinding actions and the action menu.
- [settings.md](settings.md) — where custom keybindings are persisted.
- [search-and-ranking.md](search-and-ranking.md) — deep search, which also feeds the keybinding source.
