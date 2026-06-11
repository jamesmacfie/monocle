# Keybindings

Monocle lets commands declare keyboard shortcuts and lets users assign custom ones. Every keybinding — whether typed by a command author, captured from the user, or read off a live keyboard event — is funnelled through a single canonical normalizer so that storage, matching, conflict detection, and display all agree on one string form such as `<cmd-shift-k>`. The UIs (content overlay and new-tab) capture keydown events globally, suppress the ones the background says it handles, and forward the rest to the background as `execute-keybinding` messages. The background owns a context-aware registry that resolves exact matches and multi-stroke sequence prefixes, then executes the matched command through the normal command execution path.

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

Note `mod`/`m`/`meta` all map to `cmd` — there is **no platform-aware "mod" remapping** during normalization. `<mod-k>` always becomes `<cmd-k>` regardless of OS.

### Platform handling

`platform` is detected from the user agent (`"Mac"`, `"Linux"`, `"Windows"`, or `"Unknown"`). It is **not** consulted by `normalizeKeybinding`, `getKeyString`, or registry matching — canonicalization is platform-independent. The only platform-aware helper is the exported `platformNormalize`, which on Mac rewrites `ctrl` modifiers to `cmd`. As of this writing `platformNormalize` is exported but not used in the capture/registry/execution paths documented here; the live system uses `normalizeKeybinding`/`getKeyString` directly.

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

`getKeyString(event)` is the event-to-canonical converter used by both capture paths. It returns `""` for modifier-only keydowns (`MODIFIER_KEYS`). It prefers `event.code` (`getPrimaryFromCode`) so the physical key wins over OS-composed `event.key` — e.g. `Cmd+Alt+R` on Mac reports `event.key === "®"` but `code === "KeyR"`, yielding `<cmd-alt-r>`. Modifier booleans (`metaKey`/`ctrlKey`/`altKey`/`shiftKey`) are appended and sorted. The test `shared/utils/key-normalizer.test.ts` pins these equivalences (event form and string form produce identical canonical output).

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

- **State refresh.** On mount and whenever `monocle-settings` changes in `chrome.storage.local`, it sends `get-keybinding-state` and caches `exactKeybindings` and `sequencePrefixes` sets. It also refreshes on any failed/unmatched execution.
- **Preflight suppression.** `shouldPreemptivelySuppress` returns true if the key (or the continued local sequence) is in the cached exact set or sequence-prefix set. Disabled while `isCapturing` (so the capture UI receives raw keys).
- **Execution.** `onKeyPress` sends `execute-keybinding` with the canonical `keyString` and the context override. On `success`: if the response is `pending` it extends the local sequence buffer (`updateLocalSequenceForPendingStroke`), else it clears it. Non-success clears the buffer and re-refreshes state.
- **Local sequence buffer.** A UI-side buffer (`localSequenceRef`) tracks in-progress sequences with a **900 ms** idle timeout, used only to decide preemptive suppression of the *next* stroke. Authoritative sequence resolution happens in the background.

While capturing (`selectIsCapturing` true), both the preflight and `onKeyPress` short-circuit so global handling never competes with the custom-keybinding capture UI.

### Inline-input key handling

`shared/hooks/useInlineInputKeys.ts` is unrelated to global shortcuts; it governs keyboard behaviour for inline `input` command rows inside CMDK lists: Up/Down forward to CMDK (Up at the first item refocuses the search box), Escape refocuses search, Backspace `stopPropagation` to prevent navigate-back.

## Background Registry

`background/keybindings/registry.ts` builds a `KeybindingRegistrySnapshot`:

```ts
type KeybindingRegistrySnapshot = {
  bindings: Map<string, string>      // canonical keybinding -> command id
  sequencePrefixes: Set<string>      // every proper prefix of a multi-stroke binding
}
```

- `getKeybindingRegistrySnapshot(context, options)` is the **context-aware** entry point. It builds a fresh map from `loadKeybindingCommandEntries` and derives sequence prefixes (`createSequencePrefixes` adds every `strokes.slice(0, n)` for `n < length`).
- `registerBinding` normalizes the keybinding and **first registration wins** — a later command with the same normalized binding is ignored (`registry.has` check), which is the de-facto conflict resolution at registry-build time.
- A module-level singleton map (`keybindingRegistry`) backs the legacy synchronous helpers `getCommandIdForKeybinding`, `hasKeybindingStartingWith`, `registerSingleCommand`, `registerDynamicCommands`, `getAllKeybindings`. `initializeKeybindingRegistry` / `refreshKeybindingRegistry` rebuild it. These are used in tests and by `resetKeybinding` execution; the live message handlers prefer per-request snapshots.

### Which commands contribute bindings

`background/keybindings/source.ts` `loadKeybindingCommandEntries`:

1. Loads command settings and the **filtered root commands for the given context** (`getFilteredRootCommands`) — so global hidden settings, URL filtering, and new-tab/Firefox context already apply.
2. `collectDeepSearchEntries` walks roots and recurses into `group` children only when deep search is enabled (`enableDeepSearch === true`, or inherited and not explicitly disabled), checking merged permissions (`hasRequiredPermissions`) and URL-filtering children before recursing. This is how nested commands (e.g. a specific bookmark) can carry a binding.
3. `collectCustomSettingEntries` adds any command that has a custom `keybinding` in settings, resolved by id via `resolveCommandById` even if it was not reached through deep search.

`getCommandKeybinding` returns `""` unless `allowsKeybinding(command)` is true; otherwise it returns `normalizeKeybinding(customKeybinding || command.keybinding || "")`. Custom settings override the command default. `seenEntries` dedupes on `${id}:${keybinding}`.

Because the snapshot depends on context and visibility settings, the same physical key can be bound in one context and absent in another — the registry test confirms `toggle-clock-visibility` (`<cmd-alt-c>`) resolves only in new-tab context, `github-toggle-star` (`<cmd-alt-g>`) only on a GitHub URL, and hidden commands are omitted even when they have custom bindings.

### Exact match vs sequence prefix, and sequence state

`background/messages/executeKeybinding.ts` owns sequence resolution. Per request it appends the normalized stroke to a **sender-scoped** sequence buffer and calls `evaluateSequence`, which fetches a snapshot and checks the joined prefix:

| `exactId` | `hasLonger` (a longer binding starts with this) | Result |
| --- | --- | --- |
| yes | no | execute immediately (`executeNow`), reset |
| yes | yes | schedule the exact command as `pendingSingle` after the timeout, return `{ pending: true }` |
| no | yes | wait for more strokes, schedule reset, return `{ pending: true }` |
| no | no (as full sequence) | retry treating the latest stroke as a fresh single; if still nothing, reset and return failure |

The chord timeout is **800 ms** (`CHORD_TIMEOUT_MS`). A second stroke arriving before the timer fires clears `pendingSingle`/the timer and continues the sequence; if the timer fires first, the pending single command executes.

**Scope key** (`getSequenceScopeKey`): when sender tab info is available it is `tab:<tabId>:document:<documentId|frameId|top>`; otherwise it falls back to `context:<newtab|page>:<url>`. This scoping mitigates but does not eliminate the known risk that sequence state lives in the background service worker — concurrent tabs that fall back to the context key (e.g. extension pages without sender tab data) can still interfere.

### `get-keybinding-state` and `execute-keybinding`

- `background/messages/getKeybindingState.ts` returns `{ exactKeybindings, sequencePrefixes }` straight from the context-scoped snapshot. The UI caches these for preflight suppression.
- `background/messages/executeKeybinding.ts` returns `{ success, executed }`, `{ success, executed: false, pending: true }`, or `{ success: false, error }`. See [messaging.md](messaging.md) for the full message catalog.

## Custom User Keybindings

Authoring side (`shared/types/commands.ts`): `action` and `submit` commands may declare a default `keybinding` (canonical string) and may opt out of user customization with `allowCustomKeybinding: false`. `allowsKeybinding` (`background/utils/commands.ts`) is the gate used everywhere:

```ts
export function allowsKeybinding(command: CommandNode): boolean {
  if (!isExecutableCommandNode(command)) return false   // only action/submit
  if (command.confirmAction === true) return false        // high-risk policy
  return command.allowCustomKeybinding !== false
}
```

### Capture UI flow

Generated per-command actions come from `background/commands/index.ts`:

- `_createSetKeybindingAction` produces a `set-keybinding-<id>` action ("Set Custom Keybinding") only when `allowsKeybinding` is true. Its `executionContext` is `{ type: "setKeybinding", targetCommandId }` and it is `remainOpenOnSelect`.
- `_createResetKeybindingAction` produces `reset-keybinding-<id>` ("Reset Custom Keybinding") only when a custom keybinding is currently set; its description shows the default it will restore.

`shared/components/Command/CommandActionsList.tsx` drives capture:

1. Selecting the Set action dispatches `startCapture(targetCommandId)` (keybinding slice), which sets `isCapturing` and suspends global capture.
2. The `KeybindingCapture` component focuses a div and listens on `onKeyDownCapture` (capture phase, to beat CMDK). Each non-Enter/Escape keydown is converted with `getKeyString`, appended to a `strokes` array, and the running sequence is conflict-checked.
3. Enter saves: it sends `update-command-setting` with `setting: "keybinding"` and the normalized `strokes.join(", ")`, dispatches `completeCapture`, refreshes commands, and closes the menu. Save is blocked while `hasConflict`.
4. Escape cancels (`cancelCapture`).

### Persistence and registry refresh

The custom keybinding is stored in command settings under the command id (`monocle-settings` -> command settings -> `keybinding`). See [settings.md](settings.md). The `update-command-setting` path persists it and refreshes the registry so subsequent `get-keybinding-state` reflects it. Reset is handled in the background (`background/commands/index.ts`, `resetKeybinding` action): `removeCommandSetting(targetCommandId, "keybinding")` then `refreshKeybindingRegistry()`.

The keybinding Redux slice (`shared/store/slices/keybinding.slice.ts`) is intentionally tiny — `{ isCapturing, targetCommandId }` with `startCapture` / `cancelCapture` / `completeCapture` and `selectIsCapturing` / `selectTargetCommandId`. It carries no keybinding data; the actual bindings live in settings and the background registry.

### Conflict detection

`background/messages/checkKeybindingConflict.ts` normalizes the candidate, loads `loadKeybindingCommandEntries(context)`, and reports a conflict if any **other** command (`id !== excludeCommandId`) normalizes to the same canonical string. A conflict returns `{ hasConflict: true, conflictingCommand: { id, name } }`. What counts as a conflict:

- Comparison is **after canonical normalization**, so `<shift-cmd-U>` conflicts with `<cmd-shift-u>` (`registry.test.ts`).
- It is **context-scoped**: a new-tab-only binding does not conflict in normal page context, and vice versa (`registry.test.ts` "checks new-tab keybinding conflicts only in new-tab context").
- It is **visibility-scoped**: hidden commands are omitted from conflict checks, matching registry snapshot behavior.
- The candidate command itself is excluded via `excludeCommandId`.

The capture UI calls this per stroke and disables save while a conflict exists. Note the registry's own first-wins behaviour means an unchecked duplicate would simply not register, but conflict detection surfaces the collision in the UI before saving.

## High-Risk Command Policy

Commands with `confirmAction: true` (destructive operations such as closing the current tab, clearing browsing data) are **excluded from all global keybindings** — both defaults and custom. The mechanism is `allowsKeybinding` returning false for `confirmAction === true`, which means:

- `getCommandKeybinding` returns `""`, so no entry enters the registry even if the user has a custom keybinding stored in settings (`registry.test.ts` "does not register confirmation-required commands, even with custom settings").
- `_createSetKeybindingAction` returns `null`, so the action menu offers no Set Custom Keybinding option (`browser-commands.test.ts` "does not expose custom keybinding actions for confirmed commands").

Such commands must be executed through a UI path that can show the confirmation step (`ActionItem`'s `awaitingConfirmation` flow). `browser-commands.test.ts` also confirms `<cmd-w>`/`<cmd-shift-x>` for `close-current-tab` never resolve while `<cmd-t>` (`open-new-tab`) still does.

## Display

`shared/components/KeybindingDisplay.tsx` renders a canonical string with `toDisplayFormat`, which maps modifiers to glyphs (`⌘ ⌃ ⌥ ⇧`), special keys to glyphs (`PRIMARY_DISPLAY`: `↵ ⎋ ␣ ⌫` etc.), uppercases single letters, and joins stroke parts with spaces. The component splits on `,` for sequences and renders each part in a `<kbd>`, with an arrow `→` separator between strokes. Example: `<cmd-shift-enter>` -> `⌘ ⇧ ↵`.

## Known Coverage Gaps

Automated coverage is solid for the pure logic and registry behaviour but not for live browser integration:

- Covered by tests: canonical equivalence across modifier order/case/aliases/specials/arrows/punctuation/function keys/events/display/sequences (`shared/utils/key-normalizer.test.ts`); context-aware registry snapshots, sequence prefixes, canonical conflict detection, context-scoped conflicts, and confirmation-required exclusion (`background/keybindings/registry.test.ts`); high-risk policy at registry and suggestion level (`background/commands/browser-commands.test.ts`); message validation for punctuation/arrow/sequence keybindings (`background/utils/validation.test.ts`, per the prior baseline).
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
- [messaging.md](messaging.md) — `execute-keybinding`, `get-keybinding-state`, `check-keybinding-conflict`, `update-command-setting` shapes.
- [command-schema.md](command-schema.md) — `keybinding`, `allowCustomKeybinding`, `confirmAction` fields.
- [execution-and-actions.md](execution-and-actions.md) — generated Set/Reset keybinding actions and the action menu.
- [settings.md](settings.md) — where custom keybindings are persisted.
- [search-and-ranking.md](search-and-ranking.md) — deep search, which also feeds the keybinding source.
