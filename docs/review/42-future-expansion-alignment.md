# 42 — Future-Expansion Alignment (`FUT`)

Scope: the cross-cutting pass. Two jobs, no new subsystem code review:

- **Half A — cross-cutting trace.** Follow two end-to-end flows across every
  layer they touch and surface any layering issue that a single-subsystem pass
  (files 10–31) structurally could not see (redundant cross-layer
  validation/transform, meaning-shifting names across a boundary, a value
  threaded through many layers a single owner could hold). Genuine cross-layer
  problems become `FUT-##` findings; clean seams are recorded as Non-findings so
  they are not re-litigated.
- **Half B — future-plan alignment matrix.** For every documented future-work
  item, cross-reference which existing findings **help / are prerequisite**,
  which are **neutral-but-touch**, and which would **hurt / conflict**; run a
  **veto check** verifying no finding blocks a documented plan; and produce an
  ordered **pre-work guide**.

This file adds **no `FUT-##` findings** — Half A found both traced flows clean
(the cross-layer risks that do exist were already caught as MSG-04, PAL-01, and
SHELL-06), and the guard list forbids manufacturing findings or designing future
features. The deliverable is the matrix, the veto check, and the pre-work guide.

All citations are `path:line (symbol)` or `finding-ID in file NN`; paths relative
to repo root.

---

## Half A — Cross-cutting trace

Both traces were followed at the seams (not full files). Every cross-layer seam
is clean or already owned by a subsystem finding. No new `FUT` finding results;
the verified seams are recorded as Non-findings at the end of this file.

### Trace 1 — keystroke → search → render

`useCommandNavigation` debounced effect
(`apps/extension/shared/hooks/useCommandNavigation.tsx:156-187`) →
`searchCurrentPage` thunk → `monocle-commands-search` →
`handleSearchCommands` (`apps/extension/background/messages/searchCommands.ts:115-212`) →
`getSearchIndex`/`getChildPageSearchData` → `navigation.slice` `searchCurrentPage.fulfilled`
(`apps/extension/shared/store/slices/navigation.slice.ts:538-567`) → render.

Findings from the trace:

- **The staleness contract is a genuine cross-layer invariant, and it holds.**
  The UI owns `seq` (monotonic ref, `useCommandNavigation.tsx:89,167`) and
  `query` (`currentPage.searchValue`); the background echoes **both** on every
  one of its four return paths (`searchCommands.ts:137,171,204-207,211`); the
  reducer drops any response whose `pageId`, `seq`, or `query` disagrees
  (`navigation.slice.ts:545,548-553,557-559`). A subsystem pass on file 10 sees
  the echo but not the guard's owner (file 20) and vice-versa — exactly the seam
  this pass exists to check — and it is correct and uniform. No forgotten return
  path, no meaning shift. Already documented by PAL Non-finding 1 (file 20) and
  the `searchCommands.ts` header comments; nothing to add.
- **No redundant validation across the boundary.** The Zod schema validates the
  inbound message once at the router boundary (file 12); the handler only
  `normalizeContext`s (a transform, not a re-validation, `searchCommands.ts:119`).
  Suggestion conversion happens once, background-side
  (`entriesToSuggestions`/`commandsToSuggestions`). No double transform.
- **The one real cross-layer weakness is already MSG-04.** The search message
  crosses `createPaletteSendMessage`/thunk `extra.sendMessage` typed `any`
  (`MSG-04 in file 12`); that is the only place the flow loses type safety, and
  it is already specced.
- **The child-page address `(parentPath, searchValue/query)` is shared by two
  flows but consistent.** It is the addressing key in both search
  (`searchCommands.ts:123,157`) and execute
  (`getPageExecutionScope`, `apps/extension/shared/hooks/commandExecution.ts:23-35`).
  Assembled by different UI helpers, consumed by different background resolvers
  (`getChildPageSearchData` vs `resolveCommandInPage`), but the semantics match
  and each half is schema-validated. Not duplication of code, not a finding.

### Trace 2 — Enter → execute → permission recheck → close/refresh

`buildCommandExecutionRequest` (`commandExecution.ts:60-84`) →
`useExecuteCommand`-equivalent shell callback (see `SHELL-01 in file 21`) →
`monocle-command-execute` → `handleExecuteCommand`
(`apps/extension/background/messages/executeCommand.ts:6-24`) →
`executeResolvedCommand` permission recheck
(`apps/extension/background/commands/execution.ts:112-120`) →
surface action / listener → refresh + close.

Findings from the trace:

- **The execute handler is a thin adapter — no redundant work.** It threads
  `id/context/formValues/parentNames/executionScope` straight through
  (`executeCommand.ts:15-22`); resolution, permission recheck, and usage
  recording live once behind `executeResolvedCommand` (confirmed by MSG
  Non-finding 3, file 12).
- **The execute-time permission recheck is *not* a fourth copy of the CMD-02
  fast-path probe.** `execution.ts:112-120` calls `checkPermissions` **directly**
  because it needs `missingPermissions` for the toast — which is exactly the
  pattern `CMD-02 in file 10` endorses ("keep … only where the caller needs
  `missingPermissions` … call `checkPermissions` directly"). So CMD-02's stated
  scope (three wrappers to fold: `query.ts`, `keybindings/source.ts`,
  `searchIndex.ts`) is verified **complete** — the execution path is already on
  the recommended shape and must be left alone.
- **The close/refresh divergence between shells is already SHELL-01**, and the
  refresh-policy inversion is the pure helper `shouldRefreshCommandsAfterExecution`
  (`commandExecution.ts:92-96`). The `isNewTab` context leak across the five
  new-tab senders is already SHELL-06 (file 21). Nothing new.

**Conclusion:** both traces are clean; the three cross-layer risks that exist
(untyped send boundary, dual search-string ownership, hand-copied `isNewTab`
context) are already MSG-04, PAL-01, and SHELL-06. No `FUT-##` finding is
warranted.

---

## Half B — Future-plan alignment matrix

Documented future-work items are taken from `docs/` (bridge `bridge-app-prd.md`
§12; `docs/commands/websites.md` + `url-filtering.md`; `docs/settings-page.md`
§10 phases 3–7; `docs/extension-extension/`; and the review README's future
list). Columns: **Prereq / helps** (do-first pre-work or a finding that lands the
future work's plumbing), **Neutral-but-touches** (same files/area, no
dependency), **Hurts / conflicts** (would block or complicate the plan).

| Future item (doc) | Prereq / helps | Neutral-but-touches | Hurts / conflicts |
| --- | --- | --- | --- |
| **Bridge M2** cross-platform Windows/Linux (`bridge-app-prd.md` §9,§12) | `BRIDGE-03 in 31` (transport-rule tests guard the `handle_rpc` refactor named-pipe work will do); `MSG-06 in 12` (keeps size/rate limits central) | `BRIDGE-01/04/05/06 in 31` (bridge doc-set rewrites); file 31 §"Future-alignment notes" locates the macOS-only assumptions (`paths.rs`, `relay.rs`/`daemon.rs` `UnixStream`, `registry.rs`) | **None.** Framing codec is already transport-generic (`framing.rs` `AsyncRead`/`AsyncWrite`); no finding hardcodes Unix-only |
| **Bridge M3** signing/notarization + auto-update (`bridge-app-prd.md` §12) | — (file 31 confirms `current_exe` re-register self-heals; no protocol negotiation needed) | `BRIDGE-01/04 in 31` (doc-set) | **None** |
| **Bridge M4** profile-level routing/identity (`multi-instance.md`) | — | `BRIDGE-06 in 31` (`GET /instances` doc); file 31 M4 note: `daemon.rs` relay keys by browser name, `name+profile` v_next fits current structure | **None** |
| **Chrome `key` pin** hard blocker (`registry.rs`, store-submission memory) | — | file 31 §Future note flags it as the tracked blocker | **None** — no finding touches it |
| **Website-commands plugin-registry decision** (`docs/commands/websites.md`, `url-filtering.md`) | — (deliberately untouched; documented *pending decision*) | `CMD-01 in 10` walker takes `CommandNode[]` and leaves `walkGroups`/rule-chains free; CMD Non-finding 9 (websites/ stays a command array — nothing preempts) | **None** — see veto check (CMD-01 does not preempt the decision) |
| **Settings phase 3** permissions page (`settings-page.md` §10) | — (stores nothing new; browser APIs authoritative — FEAT Non-finding 7) | — | **None** |
| **Settings phase 4** schema-driven command config (`settings-page.md` §10) | `FEAT-02 in 13` (locked RMW helper is *the pattern phase 4 copies*); `STATE-01 in 23` (mirrors the same lost-write class); `FEAT-03 in 13` (documents the replace-whole rationale phase 4 relies on) | `CMD-02 in 10` (permission helper) | **None** — phase 4 lands in the `monocle-settings` merge branch (`background/commands/settings.ts`), which FEAT-02 leaves untouched |
| **Settings phase 5** data/privacy (`settings-page.md` §10) | `MSG-07 in 12` (stop logging user payloads — aligns with store-submission data scrutiny) | — | **None** |
| **Settings phase 6** workflows management UI (`settings-page.md` §10) | `EDIT-01 in 22` (typed step-editor registry — the structured, page-local base phase 6 would *lift* into a second consumer) | `EDIT-02 in 22` (all ops addable) | **None** — EDIT-01 explicitly keeps editors page-local and forbids premature lifting ("lift then") |
| **Settings phase 7** automations JS flavor / `chrome.userScripts` (`settings-page.md` §10) | `AUTO-03 in 11` (engine-op single source *sharpens* the lockstep a JS flavor rides beside); `AUTO-04 in 11` (finishes the automation-naming migration the JS flavor's docs assume) | `EDIT-01/EDIT-02 in 22` (registry + JSON-row fallback tolerates future op kinds; unknown-op `{op} (JSON)` select preserved) | **None** — see veto check (JS flavor is a *sibling document shape*, not a step op; AUTO-03 and EDIT-01 both explicitly refuse to preempt it) |
| **Extension-extension** root placement + published type package (`docs/extension-extension/`) | `MSG-03 in 12` (drift-proof `Message`↔`ValidatedMessage` wire contract benefits a published type package); `WF-01 in 30` (shared callback re-validation lands once for both providers); `WF-03 in 30` (peer-transport tests de-risk it); `FEAT-01 in 13` (fixes the palette-disable trust bug in the ER feature) | `CMD-06 in 10` (peer-extension excerpt in `authoring-commands.md`); `FEAT-04 in 13` (toast dedup in ER commands) | **None** — see veto check (MSG-03 does not lock the future package's shape) |
| **Favorites ordering** (review README future list) | — | `CMD-01 in 10` consolidates the favorites walk while keeping breadcrumb output byte-identical (cross-pass note: "favorites-ordering unaffected") | **None** — CMD-01 preserves *name* ordering within a breadcrumb, not the *list* order, so a downstream user-ordering feature is not blocked (veto check) |
| **Focus-mode timed sessions** (`docs/focus-mode.md`) | — (review *preserves* the seam) | `FEAT` Non-finding: `focus/block.ts` `isUrlBlocked` (0 call sites) is deliberately **kept** as the plausible seam for timed sessions | **None** — no finding deletes the seam (deletion was considered and rejected) |
| **Element-hider unhide** (`docs/element-hider.md`) | `FEAT-02 in 13` (converts `elementHider` `delete-rule` to a locked RMW mutator — unhide rides the same helper) | — | **None** |
| **Site-SDK Tier-2 hardening** (`docs/site-sdk-security.md` §2) | `WF-01 in 30` (a control added to callback re-validation lands once for both providers) | `WF-02/WF-03 in 30`; file 30 §"Tier-2 choke-point readiness" confirms every control attaches at an existing single-function boundary | **None** — file 30's doc-discrepancy note (2.7 is *partly stale*: the content listener already re-validates the workflow; only the `sender.id` check is missing) should be applied so Tier-2 work targets the correct residual |
| **Live clock** (`docs/calculations.md:76`) | — | SHELL Non-finding + file 21 future note: it touches the calculations `ContentBlock`, **not** `newtab/components/Clock.tsx` | **None** — orthogonal to every finding |

---

## Veto check (verified, not repeated)

Prior passes each claimed their findings do not block documented future work.
This pass re-derived that claim against every finding's **Proposed change** and
the guard list, spot-checking the four riskiest. **Result: no conflicts,
verified — no finding needs softening.**

- **`EDIT-01 in 22` (typed step-editor registry) vs future op kinds / phase-7 JS
  flavor.** The registry is `{ [Op in FormOp]: StepEditorEntry<Op> }` over
  *current* form ops, with `JSON_STEP_OPTIONS` for control-flow ops and a JSON
  fallback for unknown/imported ops (`StepRow.tsx:647-648`, explicitly
  preserved). `EDIT-02`'s `satisfies Record<AutomationStep["op"], string>` makes
  a *new op added to the union* fail `tsc` in the editor — a helpful lockstep
  signal, not a block; the op defaults to a JSON row. A phase-7 JS flavor is a
  **sibling document capability outside the step vocabulary** (AUTO Non-finding
  "Future `chrome.userScripts` JS flavor"; EDIT-01 "Do not design for JS steps"),
  so it never becomes a `STEP_OP_OPTIONS` entry. **No conflict, no softening.**
- **`CMD-01 in 10` (shared walker) vs website-commands registry + favorites
  ordering.** The walker takes `commands: CommandNode[]` + a visitor and
  explicitly excludes `walkGroups`/rule-chains (CMD Non-finding 1) — whatever a
  future website-command registry *produces* still walks unchanged, so the
  pending registry decision is not preempted (CMD Non-finding 9). Its Do-NOT-
  change pins *breadcrumb name* order byte-identical, which is orthogonal to a
  future user-defined *favorites list* order applied downstream. **No conflict.**
- **`MSG-03 in 12` (exhaustive router + `Message`↔`ValidatedMessage` twin) vs
  ext-ext published type package.** MSG-03 makes the *internal* wire contract
  drift-proof; it exports no new public shape and does not lock the future
  package's DTOs (the bridge already ships a separate `native-bridge-protocol`
  package as the precedent). It is pure pre-work benefit. **No conflict.**
- **Bridge M2–M4 readiness (file 31).** File 31's own §"Future-alignment notes"
  confirms none of BRIDGE-01…06 warrant changes now, locates the macOS-only
  assumptions, and notes the framing codec is already transport-generic.
  `BRIDGE-03` (transport-rule tests) actively *protects* the M2 `handle_rpc`
  refactor. No finding hardcodes a single-platform assumption. **No conflict.**

Across the full matrix, no finding's Proposed change hard-codes an assumption
that a documented plan must later undo. Two findings' Do-NOT-change sections are
what *guarantee* this (they were written to protect future work): `EDIT-01`
("keep page-local … settings-page phase 6 may become a second consumer … lifting
now would be a one-call-site abstraction") and the `FEAT` decision to **keep**
`focus/block.ts:isUrlBlocked` as the timed-sessions seam.

---

## Pre-work guide (ordered: "before starting plan X, do finding Y")

If you are about to start a documented plan, land these findings first — each
makes the plan materially cheaper or safer, in the order shown.

1. **Ext-ext type package** → `MSG-03 in 12` (drift-proof wire) → `WF-01 in 30`
   (shared callback re-validation) → `WF-03 in 30` (peer-transport tests) →
   `FEAT-01 in 13` (fix the palette-disable trust bug first).
2. **Settings phase 4** (schema-driven command config) → `FEAT-02 in 13` (the
   locked-RMW helper is the exact pattern to copy) → `STATE-01 in 23` (removes
   the twin UI-side unlocked writer on the same key).
3. **Settings phase 7** (automations JS flavor) → `AUTO-03 in 11` (op-set single
   source sharpens the lockstep the JS flavor sits beside) → `AUTO-04 in 11`
   (finish the automation-naming migration its docs assume).
4. **Bridge M2** (cross-platform) → `BRIDGE-03 in 31` (transport-rule tests so
   the named-pipe `handle_rpc` refactor cannot silently drop the Origin/token
   checks) → `MSG-06 in 12` (keep size/rate limits central).
5. **Site-SDK Tier-2** → `WF-01 in 30` (one shared callback-validation choke
   point for both providers); also apply file 30's 2.7 doc fix so the work
   targets the real residual (content-side `sender.id` check).

Lower-priority couplings (not top-5): **Settings phase 5** ← `MSG-07 in 12`
(stop payload logging); **element-hider unhide** ← `FEAT-02 in 13` (locked
delete-rule RMW).

---

## Non-findings (reviewed, justified)

- **Half A Trace 1 (search) is clean.** The `seq`+`query` staleness contract is
  a real cross-layer invariant that holds on all four background return paths
  (`searchCommands.ts:137,171,204-207,211`) against the reducer guards
  (`navigation.slice.ts:545-559`); no redundant validation; the only typing gap
  is already `MSG-04 in 12`. Recorded so a future reviewer does not re-trace it.
- **Half A Trace 2 (execute) is clean.** Thin adapter handler; the permission
  recheck at `execution.ts:112-120` correctly calls `checkPermissions` directly
  (needs `missingPermissions`) — it is the shape `CMD-02 in 10` endorses, not a
  fourth wrapper, confirming CMD-02's three-site scope is complete.
- **The child-page address `(parentPath, searchValue)` shared by the search and
  execute flows is consistent, not duplicated code** — different UI helpers,
  different background resolvers, matching semantics, each half schema-validated.
  Not a finding under the guard list (no shared abstraction with a single real
  concept is warranted).
- **No finding conflicts with any documented plan** — the veto check above is the
  justification; recorded here so the "prior passes claim none conflict" line is
  not taken on faith by the next reviewer.
- **This file intentionally contains no `FUT-##` findings.** Half A found the
  traced seams clean, and the guard list bans manufacturing findings or designing
  future features; the alignment matrix, veto check, and pre-work guide are the
  deliverable.
