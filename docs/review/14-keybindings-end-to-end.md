# 14 — Keybindings End-to-End (`KEY`)

Scope: the full keybinding pipeline — the background registry and source
(`background/keybindings/`), the sequence state machine
(`background/messages/executeKeybinding.ts`) plus the `getKeybindingState` /
`checkKeybindingConflict` / `updateCommandKeybindings` handlers, the shared
normalization/capture utilities (`shared/utils/key-normalizer.ts`,
`event-filter.ts`, `robust-key-capture.ts`, `keybinding-requirements.ts`,
`keybinding-timing.ts`), the page-side dispatcher
(`shared/hooks/useGlobalKeybindings.tsx`) and its Redux slice
(`shared/store/slices/keybinding.slice.ts`), the two live capture UIs, the
template dialog, and the accuracy of `docs/keybindings.md`.

Overall assessment: this subsystem is in strong shape and unusually
well-commented — the module headers on `executeKeybinding.ts`, `source.ts`,
`useGlobalKeybindings.tsx` and `keybinding-timing.ts` document the hard parts
(chord serialization, timer epochs, cache generations, the UI-outlives-background
timing invariant) accurately, and `docs/keybindings.md` is one of the most
faithful docs in the repo. The genuine maintainability cost is one duplicated
capture state machine across two UIs whose copies have silently drifted, and the
keybinding-side adoption of the shared command-tree walker that file 10 (CMD-01)
delegated here. The sequence state machine, the normalizer's lookup tables, and
the timing/requirements helpers were examined and are deliberately left alone
(see Non-findings).

Two hypotheses in the brief were **refuted** and are recorded as non-findings:
the "capture is triplicated" claim (it is duplicated across **two** sites, not
three — `KeybindingTemplateDialog.tsx` does no keystroke capture), and the
sequence-collision "spec the clarifying comment" ask (the verbatim comment
already exists at `executeKeybinding.ts:51-54`).

---

### KEY-01: Extract a shared keybinding-capture hook behind the two live capture UIs

**Priority:** P1     **Effort:** M     **Type:** dedupe

**Current state**
The interactive "press keys to set a shortcut" state machine is implemented
twice, and the two copies have drifted:

- `apps/extension/shared/components/Command/CommandActionsList.tsx:35-205
  (KeybindingCapture)` — the in-palette action-menu widget. State: `strokes`,
  `hasConflict`, `conflictType`, `conflictingCommand`, `warnings`,
  `requirementViolation`. `checkForConflict` (`:73-94`) sends
  `monocle-keybinding-conflict-check` via the `useSendMessage` hook (which
  auto-attaches page context, `useSendMessage.tsx:81-97`) and consumes the
  **full** response — conflict type, warnings, and requirement violation.
  `handleKeyDown` (`:96-127`) does `preventDefault`/`stopPropagation`, saves on
  `Enter` (gated on `!hasConflict && !requirementViolation`), cancels on
  `Escape`, else appends `getKeyString` and re-checks. **No Backspace.** Renders
  strokes as hand-built `<kbd>` chips with `→` separators and distinguishes the
  `shadowed-by-open-palette` conflict message (`:186-202`).
- `apps/extension/options/components/KeybindingDialog.tsx:86-252
  (KeybindingDialog)` — the options-page dialog. State: `strokes`, `conflict`
  (`{id,name}` only), `requirementViolation` — it **drops** `conflictType` and
  `warnings` (`checkConflict` at `:59-84` reads only `conflictingCommand` and
  `requirementViolation.message`). It sends the message via `sendRuntimeMessage`
  directly with a hand-built context (`getConflictContext`, `:46-57`, which sets
  `isNewTab` for new-tab-category commands). `handleKeyDown` (`:132-170`)
  **does** support Backspace (`:141-151`) and renders via the shared
  `KeybindingDisplay` component, but shows only a generic `Conflict: {name}`
  line (`:215-219`) with no shadow explanation and **no warnings display**.

Both funnel to the same background handler
(`apps/extension/background/messages/checkKeybindingConflict.ts:31-95
(checkKeybindingConflict)`), which already returns the full
`{ hasConflict, conflictingCommand, conflictType?, warnings?, requirementViolation? }`
shape. The core loop — accumulate canonical strokes, re-check the partial
sequence per stroke, normalize with `normalizeKeybinding`, gate save on
conflict/requirement, cancel on Escape — is identical in intent; only the
peripheral behavior (Backspace, which response fields are surfaced, new-tab
context, transport) differs, and that divergence is drift, not design.

**Why it matters**
The options dialog silently swallows two things the palette widget shows: the
`shadowed-by-open-palette` explanation (the user sees only "Conflict: X" with no
hint that the block is a prefix-shadow, not an exact clash) and prefix-overlap
**warnings** (the options user is never told a binding will only resolve after
the 800 ms chord timeout). `docs/keybindings.md:230` asserts "The capture UI
shows blocking conflicts in error text … and warnings in warning text" as if
both UIs behave identically — they do not. Conversely the palette widget lacks
Backspace, so a mis-typed stroke there forces a full restart. Any future change
to capture semantics (a new conflict type, a new requirement rule, a
sequence-editing affordance) must be made twice and will keep drifting. This is
the exact class of bug the review values guard against: two copies of one
interaction, disagreeing on what the user is told.

**Proposed change**
Add a shared hook + a presentational component; keep both dialogs' surrounding
chrome (the options `<Dialog>`, the palette `Command.Item`) intact.

1. New `apps/extension/shared/hooks/useKeybindingCapture.ts` owning the state
   machine and conflict round-trip:

```ts
export type KeybindingCaptureState = {
  strokes: string[]
  keybinding: string            // normalized strokes.join(", ")
  conflict: { id: string; name: string } | null
  conflictType: KeybindingConflictType | null
  warnings: KeybindingConflictWarning[]
  requirementViolation: string | null
  canSave: boolean              // Boolean(keybinding) && !conflict && !requirementViolation
}

export type UseKeybindingCaptureOptions = {
  commandId?: string
  requirements?: KeybindingRequirements | null
  contextOverride?: Partial<Browser.Context>   // options dialog passes { isNewTab }
  onComplete: (keybinding: string) => void
  onCancel: () => void
}

export function useKeybindingCapture(
  options: UseKeybindingCaptureOptions,
): KeybindingCaptureState & {
  handleKeyDown: (event: React.KeyboardEvent) => void   // preventDefault/stop, Enter/Escape/Backspace/append
}
```

   The hook always requests the full response (conflict type + warnings +
   requirement) and threads `contextOverride` into the message so the caller
   controls new-tab framing. **Backspace and Enter-to-save are unconditional** —
   both UIs get both. Use `useSendMessage` inside the hook (so context is
   auto-attached and the transport is uniform); the options dialog drops its
   bespoke `sendRuntimeMessage` + `getConflictContext` in favor of passing
   `contextOverride: { isNewTab }`.

2. New `apps/extension/shared/components/KeybindingCaptureField.tsx` — a
   presentational component rendering the capture box, the requirement hint
   (`describeKeybindingRequirements`), the strokes (via the existing
   `KeybindingDisplay`, replacing `CommandActionsList`'s hand-built `<kbd>`
   chips), the blocking-conflict line **with** the shadow-vs-exact distinction,
   the requirement-violation line, and the non-blocking warning line. Props are
   the `KeybindingCaptureState` plus a `captureRef` and `onKeyDownCapture`
   binding.

3. Migrate the two call sites:
   - `CommandActionsList.tsx`: replace the inner `KeybindingCapture`
     (`:35-205`) with `useKeybindingCapture` + `<KeybindingCaptureField>`
     rendered inside the existing `Command.Item` (`:364-374`), keeping
     `onKeyDownCapture` (must still beat CMDK) and the `handleKeybindingComplete`
     / `handleKeybindingCancel` wiring (`:322-361`) unchanged.
   - `KeybindingDialog.tsx`: replace the inline state + `handleKeyDown`
     (`:93-170`) with the hook, passing `contextOverride: command.categoryId ===
     "new-tab" ? { isNewTab: true } : {}`; keep the `<Dialog>`, Reset button,
     and focus-on-open effect.

4. `KeybindingTemplateDialog.tsx` is **not** migrated — it does no keystroke
   capture (see Non-findings §1).

**Do NOT change / risks**
- The `onKeyDownCapture` (capture-phase) binding in the palette widget is
  load-bearing — it intercepts before CMDK routes keys to the search field
  (`CommandActionsList.tsx:134-135`). The hook must expose `handleKeyDown` for
  the caller to attach as `onKeyDownCapture`, not swallow it internally.
- Message wire shape is unchanged; `checkKeybindingConflict` already returns all
  fields. Do not widen or narrow the response.
- The options dialog's Reset button and "No shortcut"/effective-keybinding
  header stay dialog-local (not hook concerns).
- Keep save-blocking identical to today's stricter copy: block on `conflict ||
  requirementViolation`; do not block on non-blocking `warnings`.
- This is a shared-palette change: manual regression in **both** content
  (closed shadow DOM) and new-tab modes, plus the options page.

**Verification**
- New `useKeybindingCapture.test.ts` (jsdom): append stroke → normalized
  keybinding; Enter with conflict does not call `onComplete`; Backspace pops a
  stroke and re-checks; Escape calls `onCancel`; requirement violation blocks
  save; warnings do not block save.
- Manual: in the options dialog, assign a binding that prefix-shadows an
  open-palette sequence and confirm the shadow explanation now shows; assign a
  prefix-overlapping execute binding and confirm the warning now shows; Backspace
  works in the palette widget.
- `pnpm run tsc`, `pnpm test`, then the content + new-tab + options smoke.

**Related**
KEY-04 (makes `docs/keybindings.md:230` accurate). PAL / SHELL files (palette
and shell owners) for the manual shadow-DOM regression.

---

### KEY-02: Adopt the CMD-01 shared command-tree walker in `keybindings/source.ts`

**Priority:** P2     **Effort:** M     **Type:** dedupe

**Current state**
`apps/extension/background/keybindings/source.ts:73-136
(collectDeepSearchEntries)` is the fourth hand-rolled recursive command-tree
walk in the repo. It merges inherited permissions
(`mergePermissions`, imported from `../commands/query` which re-exports it from
`traversal.ts`), gates descent on a permission probe
(`hasRequiredPermissions`, `source.ts:40-45`), calls `group.children(context)`
inside a per-group `try/catch` that logs and continues (`:112-134`), URL-filters
the resolved children per level (`filterCommandsByUrl`, `:114-118`), resolves a
breadcrumb name (`resolveCommandName`, inside `addKeybindingEntry` at `:67`), and
recurses. The one structural difference from the two query.ts walks
(`findFavoritedCommands`, `findCommandRecursive`) is the **descent gate**: query
descends every *permitted* group, while this walk descends only
*deep-search-enabled* groups, using the inheritance formula
`enableFlag === true || (inheritedDeepSearch && enableFlag !== false)`
(`source.ts:95-97`) — the exact formula CMD-02 extracts as
`shouldDeepSearchGroup`.

CMD-01 (file 10) specs `walkCommandTree` in `traversal.ts` with a
`shouldDescend?: (group) => boolean` gate (default: always descend) and
explicitly delegates this keybinding adoption to file 14, asserting only that
the walker's `shouldDescend` be "expressive enough … deep-search-only descent
via the CMD-02 helper."

**This walk is dedupable (unlike `walkGroups`).** Checked against the four
dimensions that excluded `searchIndex.ts` `walkGroups` from CMD-01: (a) it
URL-filters **per level** (`:114-118`), not via deferred per-entry rule chains;
(b) it carries **no per-branch source weight**; (c) it **visits each node**
(`addKeybindingEntry` per node, `:83-89`) then recurses, rather than building
entries from typed children; (d) its descend condition is **purely
deep-search**, with no favorites-existence mixing. On every axis it matches the
query walks, not `walkGroups`. The only extra it needs is deep-search-gated
descent, which is a shared formula, not walk-specific plumbing.

**Why it matters**
Descent semantics — permission gating, per-level URL-visibility ordering, and
the "a failing `children()` skips its subtree without sinking siblings" error
contract — currently live in three near-identical copies across two subsystems
(palette favorites/resolution and the keybinding registry). CMD-01 consolidates
the palette pair; leaving `source.ts` out means the keybinding registry keeps a
private fourth copy that can silently diverge — e.g. a permission-revocation or
URL-deny that hides a command from the palette while its default keybinding
still registers. Folding it in is what makes CMD-01's "one descent contract"
claim actually true across the codebase.

**Proposed change**
Land CMD-02 and CMD-01 first, then:

1. **One-line extension to CMD-01's walker** (coordinate with CMD-01): have
   `walkCommandTree` thread inherited deep-search down each branch exactly as it
   already threads inherited permissions, computing it with the CMD-02
   `shouldDeepSearchGroup` helper, and expose it on `WalkNode` as
   `deepSearchEnabled: boolean`. This is not a single-consumer accumulator of
   the banned `walkGroups` kind: it reuses the already-shared CMD-02 helper, is
   the same shape of branch-state the walker already carries for permissions, and
   is what turns `shouldDescend` from an always-true stub into a real gate. The
   query walks omit `shouldDescend` and ignore the field (behavior unchanged).
2. Rewrite `collectDeepSearchEntries` as a `walkCommandTree` call:
   - `visit: (node) => addKeybindingEntry(entries, seenEntries, node.command, context, commandSettings)` — collects a keybinding entry for **every** visited node (matching today's "visit each node" behavior; the entry is skipped internally when the node carries no effective keybinding, `source.ts:58-59`).
   - `shouldDescend: (group) => group.deepSearchEnabled`.
   The walker owns `mergePermissions`, the permission probe (CMD-02
   `hasAllPermissions`), the per-level `filterCommandsByUrl`, and the per-group
   `try/catch`; delete those from `source.ts`.
3. `collectCustomSettingEntries` (`source.ts:138-163`) is **not** a tree walk
   (it iterates `commandSettings` and resolves by id) — leave it untouched.
4. Replace the local `hasRequiredPermissions` (`source.ts:40-45`) with the
   CMD-02 `hasAllPermissions` and the formula at `:95-97` with
   `shouldDeepSearchGroup` regardless of whether the full walker adoption lands
   in the same PR (that part is CMD-02 and can precede this).

**Do NOT change / risks**
- Entry output must stay byte-identical: same `seenEntries` dedupe key
  (`${id}:${keybinding}`), same order (roots then deep-search descendants then
  custom-setting entries), same URL-filter-per-level semantics. The registry's
  first-registration-wins behavior (`registry.ts:41-64`) depends on entry order.
- The entries cache (`source.ts:193-320`) and its invalidation are orthogonal —
  do not touch them; the walker change is purely inside
  `buildKeybindingCommandEntries` (`:165-191`).
- If CMD-01 has not landed, do **not** invent a private walker here — this
  finding is explicitly a follow-on; without CMD-01 the correct action is the
  CMD-02-only slice (step 4).

**Verification**
- `background/keybindings/registry.test.ts` (context-aware snapshots for
  browser/tool/UI/new-tab/website/deep-search, `:123`; hidden omitted, `:205`;
  new-tab-only, `:227`; cache hit/TTL, `:394`/`:419`) and
  `container-keybinding.test.ts` stay green with no edits — that is the parity
  gate.
- Add a `traversal.test.ts` case (owned by CMD-01) asserting deep-search-gated
  descent via `shouldDescend`/`deepSearchEnabled` matches the pre-refactor
  keybinding entries for a fixture tree.

**Related**
CMD-01 (prerequisite; this completes its delegated keybinding adoption and
requests the `deepSearchEnabled` field), CMD-02 (prerequisite helpers).

---

### KEY-03: Add direct unit tests for the pure conflict engine `conflicts.ts`

**Priority:** P3     **Effort:** S     **Type:** test-gap

**Current state**
`apps/extension/background/keybindings/conflicts.ts:21-120
(isProperStrokePrefix, evaluateKeybindingAssignment)` is the pure heart of
conflict detection — exact clash, open-palette shadow in both directions, and
prefix-overlap warnings. It has **no co-located unit test**; it is exercised only
transitively through two async integration paths
(`background/keybindings/registry.test.ts` via the message handlers, and
`background/messages/updateCommandKeybindings.test.ts` for the batch path). There
is no `conflicts.test.ts`.

**Why it matters**
The shadow logic is subtle and asymmetric (an existing open-palette prefix
shadows a candidate sequence; a candidate open-palette binding shadows an
existing sequence — `conflicts.ts:76-103`), and exact conflicts must dominate
every other outcome (`:64-72`). This is exactly the kind of pure, branch-heavy
function that earns a direct table test: today a regression in the shadow
direction or the exact-dominates rule would only surface through a
heavier-weight integration test that also depends on the registry, entries
cache, and context resolution, making failures harder to localize.

**Proposed change**
Add `apps/extension/background/keybindings/conflicts.test.ts` covering
`evaluateKeybindingAssignment` directly over hand-built `KeybindingCommandEntry[]`
fixtures: exact match dominates a co-existing prefix warning; existing
open-palette on a candidate's prefix → `shadowed-by-open-palette`; candidate
open-palette on an existing sequence's prefix → `shadowed-by-open-palette`;
two execute bindings sharing a prefix → non-blocking `prefix-overlap` warning in
each `direction`; `excludeCommandId` skips the target; unparseable entry
keybindings are skipped. Add a small `isProperStrokePrefix` truth-table case.

**Do NOT change / risks**
Test-only; no source change. Do not duplicate the integration assertions already
in `registry.test.ts` — this test targets the pure function in isolation.

**Verification**
`pnpm test` includes the new file; `pnpm run tsc`.

**Related**
TEST file 41 (risk-ranked test gaps); KEY-01 (both capture UIs consume this
engine's full output).

---

### KEY-04: Correct three stale details in `docs/keybindings.md`

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
`docs/keybindings.md` is highly accurate, but three specifics have drifted from
the code:

1. §"Capture UI flow" step 1 (`docs/keybindings.md:198`): "dispatches
   `startCapture(targetCommandId)`". The action creator takes an **object**:
   `startCapture({ commandId, requirements })`
   (`shared/store/slices/keybinding.slice.ts:26-36`;
   `CommandActionsList.tsx:280-285`).
2. §"Capture UI flow" step 3 (`docs/keybindings.md:200`): "Save is blocked while
   `hasConflict`." Save is blocked while `hasConflict || requirementViolation`
   (`CommandActionsList.tsx:100-104`).
3. §"Conflict detection" (`docs/keybindings.md:230`): "The capture UI shows
   blocking conflicts in error text (save disabled) and warnings in warning text
   (save allowed)." This is true of the palette widget but not the options
   dialog, which currently drops `conflictType` and `warnings`
   (`KeybindingDialog.tsx:77-83, 215-225`) — see KEY-01.

**Why it matters**
Items 1–2 are the kind of small inaccuracy that misleads someone editing the
capture flow (wrong action signature, wrong save gate). Item 3 asserts a
behavioral parity that does not hold until KEY-01 lands, so the doc currently
over-promises the options dialog's conflict surfacing.

**Proposed change**
1. Change `docs/keybindings.md:198` to: "Selecting the Set action dispatches
   `startCapture({ commandId, requirements })` (keybinding slice), which sets
   `isCapturing`, records the target's requirements, and suspends global
   capture."
2. Change `docs/keybindings.md:200` to end: "… Save is blocked while a conflict
   **or** a requirement violation is present."
3. If KEY-01 lands, `docs/keybindings.md:230` becomes accurate as written and
   needs no edit. If KEY-01 has **not** landed, append to that sentence: "(the
   in-palette widget surfaces both; the options dialog currently shows the
   blocking conflict only, without the shadow distinction or non-blocking
   warnings — see the capture-UI dedupe finding)." Remove that parenthetical
   when KEY-01 lands.

**Do NOT change / risks**
Doc-only. Do not restructure the section; the broader doc sweep belongs to file
40. Item 3's wording is coupled to KEY-01 ordering — apply the matching variant.

**Verification**
Read the edited lines against the cited code; `pnpm run fmt:check` (unaffected —
Markdown).

**Related**
KEY-01 (item 3), DOCS file 40.

---

## Non-findings (reviewed, justified)

1. **Capture is duplicated across TWO sites, not triplicated —
   `KeybindingTemplateDialog.tsx` is not a capture UI.** The brief's hypothesis 1
   named three files; `apps/extension/options/components/KeybindingTemplateDialog.tsx:45-304`
   does **no** keystroke capture — it is a bulk template preview/apply flow
   (`getTemplatePreviewRows` / `getTemplateSaveOperations`, a checkbox, a table,
   an apply button routing to `monocle-command-keybindings-update`). It shares
   no state machine with the two real capture UIs and is correctly excluded from
   KEY-01. (Also note: the brief cited `CommandActions.tsx`; the live capture
   widget is actually in `CommandActionsList.tsx`.)

2. **`executeKeybinding.ts` sequence state machine — acceptable as-is; the
   cross-tab-collision clarifying comment already exists verbatim.** Hypothesis 2
   asked whether to spec the comment; it is already present at
   `background/messages/executeKeybinding.ts:51-54 (getSequenceScopeKey)` and
   the risk is documented at three levels (CLAUDE.md, `docs/keybindings.md:163`,
   and the inline comment). The collision is negligible on the hot path:
   content-script strokes always carry `sender.tab` (tab-scoped keys, no
   collision), and new-tab/options pages normally carry tab data too; the
   context-key fallback (`:67-68`) can only collide for a mid-sequence
   multi-stroke chord across two tabs that *both* lack sender tab data *and*
   share the same context key within the 800 ms window. State transitions are
   testable and tested under fake timers
   (`background/messages/sequence-keybinding.test.ts:63-185`) and documented as a
   truth table (`docs/keybindings.md:152-157`). The `timerEpoch` +
   `runSerialized` machinery (`:95-102, 421-442`) is intricate but each piece is
   commented with the concrete race it prevents. No change; not P0/P1.

3. **`key-normalizer.ts` (~550 LOC) — big-but-linear lookup tables, guard-list
   exempt.** `shared/utils/key-normalizer.ts:35-186` is dominated by flat alias
   maps (`MODIFIER_ALIASES`, `SPECIAL_KEY_ALIASES`, `DISPLAY_KEY_ALIASES`,
   `CODE_KEY_ALIASES`, `SHIFTED_SYMBOL_ALIASES`, `PRIMARY_DISPLAY`) plus small
   pure functions (`parseKeyStroke`, `normalizeKeybinding`, `getKeyString`,
   `toDisplayFormat`). It is heavily pinned by `key-normalizer.test.ts`. This is
   exactly the "big-but-linear file … fine as-is" case in the guard list.
   Hypothesis 4 confirmed as a non-finding.

4. **`keybinding-timing.ts` and `keybinding-requirements.ts` are already the
   correctly-placed shared homes — not consolidation-worthy.**
   `shared/utils/keybinding-timing.ts:1-11` is two constants
   (`CHORD_TIMEOUT_MS`, `UI_SEQUENCE_IDLE_TIMEOUT_MS`) with a comment explaining
   why the UI timer must outlive the background one, pinned by
   `keybinding-timing.test.ts`; both constants have genuinely separate consumers
   (background handler vs UI hook) and merging them into either side would
   recreate the coupling the shared file removes.
   `shared/utils/keybinding-requirements.ts:31-67` is the single validator
   consumed by four paths (both capture UIs via `describeKeybindingRequirements`,
   and `checkKeybindingConflict` + `updateCommandKeybindings` +
   `updateCommandSetting` via `validateKeybindingRequirements`). Both are the
   dedup target, not dedup candidates. Hypothesis 6 → non-finding.

5. **Module-scoped singleton caches in `source.ts` / `registry.ts` — the repo's
   documented service-worker-lifetime idiom.** The entries cache
   (`source.ts:201-320`) and the legacy synchronous registry singleton
   (`registry.ts:25, 145-200`) mirror the pattern their own headers
   cross-reference (`commands/searchIndex.ts`). A cache class would be a
   competing pattern (guard list). Left alone.

6. **`registry.ts` legacy synchronous helpers
   (`getCommandIdForKeybinding`, `hasKeybindingStartingWith`,
   `registerSingleCommand`, `registerDynamicCommands`, `getAllKeybindings`,
   `registry.ts:106-192`) coexisting with the per-request snapshot path.** They
   back the `resetKeybinding` execution path and tests, are documented as
   compatibility helpers (`docs/keybindings.md:130, 148`), and the live message
   handlers already prefer snapshots. Removing them is out of scope and risks the
   reset path; not drift.

7. **`robust-key-capture.ts` double-listener + `handledEvents` WeakSet dedupe.**
   `shared/utils/robust-key-capture.ts:38-43, 116-124` deliberately registers on
   both `window` and `document` (capture phase) for redundancy and de-dupes the
   resulting double invocation with a per-event WeakSet — the comment explains
   the concrete corruption it prevents ("g, p, r" arriving as "g, p, p, r, r").
   Intentional and correct.

8. **`event-filter.ts` broad editable-element detection
   (`isEditableElement`, `event-filter.ts:73-209`).** A long but flat allow-list
   of editor libraries (Monaco, CodeMirror, Ace, Lexical, ProseMirror, Google
   Docs, Notion, Slate/Quill/Medium, design canvases). Big-but-linear; each
   branch is one editor family; adding one is a one-line change. Fine as-is.

9. **`assignmentTarget.ts` and `targets.ts` are correctly factored small
   modules.** `background/keybindings/assignmentTarget.ts:24-58` (live-command →
   catalog → missing resolution) and `background/keybindings/targets.ts:22-52`
   (assignable/behavior/default/effective/requirements metadata) each own one
   responsibility and are consumed from multiple handlers. No consolidation
   warranted.

10. **Registry/conflict source coverage — the logic is uniform; the gap is
    test breadth, already tracked.** Conflict detection operates over
    `loadKeybindingCommandEntries(context)`, so it checks against exactly the
    entries that would register at runtime for that context — UI, new-tab, and
    website command sources included (`registry.test.ts:123` builds snapshots
    across all of them). There is no *logic* gap for those sources; the
    remaining unevenness is that cross-source **conflict** cases are exercised
    less than browser/deep-search, which `docs/keybindings.md:258` already flags
    and KEY-03 partially addresses. Not a code finding.
