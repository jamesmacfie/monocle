# Docs and comments — maintainability review (pass 12)

Scope: cross-subsystem doc accuracy that no single subsystem pass owned, plus a
codebase-wide **comment convention** (top-of-file architecture blocks and
doc-comments). This pass does **not** re-litigate doc rewrites already specced
in files 10–31; those are listed under "Deferred to owning files" below and are
referenced, not duplicated.

All citations are `path:line-range (symbol or "top-of-file")`, relative to the
repo root, verified against the code/doc at review time. Line numbers drift;
the symbol/anchor is the durable locator.

## Deferred to owning files (do not duplicate here)

These doc/comment rewrites are already specced as findings in other review
files. Implement them there; this file only fills the gaps they leave.

| Doc / comment | Owning finding | File |
| --- | --- | --- |
| `searchIndex.ts` header comment (misleading) | CMD-04 | 10 |
| `search-and-ranking.md` (invalidation list, stale-serve + child-page caches, `parentIds`) | CMD-05 | 10 |
| `authoring-commands.md` excerpt (`loadExtensionSdkCommands`) | CMD-06 | 10 |
| `messaging.md` (wrapped/unwrapped handler counts, dead `withErrorHandling`, `nativeMessaging` perm, `SendableMessage` omissions) | MSG-08 | 12 |
| Storage-contract prose (config single-writer, four-key inventory, `initSurfaces`) | FEAT-03 | 13 |
| `keybindings.md` (`startCapture` signature, save gate, capture-warning claim) | KEY-04 | 14 |
| `palette-ui-and-navigation.md` (DOM-manipulation claim, dead `onInlineInputKeyDown`, `resetNavigation` omission) | PAL-06 | 20 |
| `automations.md:222` (per-op form rows; `type`/`key`/`showSurface`/`hideSurface`) | EDIT-02 | 22 |
| `automations.md:5` "code and ids use the automations naming" (code still `USER_SCRIPT_*`/`script.id`) — resolution is code-side | AUTO-04 | 11 |
| `new-tab-and-theme.md` (`id.includes` reload heuristic; Listener-components table) — resolution is code-side | SHELL-02 / SHELL-03 | 21 |
| `CLAUDE.md` / `architecture.md` "Settings persistence goes through `background/commands/settings.ts`" (violated by `settings.slice`) — resolution is code-side | STATE-01 | 23 |
| Bridge `confirmAction` (protocol.md + execution.md); Direction-A pairing remnants; `poll` rejected-vs-expired; `native-host.md` `GET /instances` | BRIDGE-01/04/05/06 | 31 |

The naming claim in `automations.md:5`, the new-tab reload heuristic, and the
settings-persistence claim all become **correct** once their code finding lands.
Per the review rule ("update the doc only if the resolution is doc-side") they
are not restated here. If a maintainer decides *not* to do the code fix, the
doc must instead be corrected to match reality — flagged, not owned.

---

### DOCS-01: Correct the workflow step vocabulary in architecture.md (missing `uncheck`)

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
`docs/architecture.md:213 ("Workflow forwarding" section)` lists the workflow
step vocabulary as 16 ops:
`click/wait/fill/select/check/submit/focus/blur/scroll/hover/type/key/getText/removeElement/hideElement/injectCss`.
The actual vocabulary is **17 ops** — `uncheck` is missing from the list.
Verified: `apps/extension/shared/types/workflow.ts` declares 17 distinct `op:`
literals (including `op: "uncheck"` at `UncheckStep`,
`shared/types/workflow.ts:142`), and `docs/workflow-automation.md:152` correctly
says "exactly the 17 implemented ops". So architecture.md contradicts both the
code and its own sibling doc.

**Why it matters**
architecture.md is the first doc a new engineer reads and the one that seeds the
mental model of the workflow layer. An enumerated list that silently drops one
op reads as authoritative and invites a reader to conclude `uncheck` is not
implemented (it is, with a schema + executor + test). The lockstep invariant
(WF, file 30) depends on the op set being stated consistently everywhere.

**Proposed change**
Replace the parenthetical in `docs/architecture.md:213` verbatim:

> The full 17-op step vocabulary
> (`click`/`wait`/`fill`/`select`/`check`/`uncheck`/`submit`/`focus`/`blur`/`scroll`/`hover`/`type`/`key`/`getText`/`removeElement`/`hideElement`/`injectCss`)
> is implemented and schema-accepted; privileged operations are automation
> engine ops, never workflow steps.

Stating the count ("17-op") makes the next drift detectable by eye and matches
the phrasing already used in `docs/workflow-automation.md:152`.

**Do NOT change / risks**
Do not renumber or re-order the ops elsewhere — `docs/workflow-automation.md`'s
per-op table is already correct and complete. This is a single-line list fix,
no behavior implication.

**Verification**
`grep -oE 'op: "[a-zA-Z]+"' apps/extension/shared/types/workflow.ts | sort -u | wc -l`
returns 17; the doc list now has 17 entries and includes `uncheck`.

**Related**
WF-01/02/03 (file 30, lockstep + executor); `docs/workflow-automation.md`.

---

### DOCS-02: Refresh CLAUDE.md "Last verified validation" numbers (cargo test count)

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
`CLAUDE.md` "Current Baseline → Last verified validation" states
`apps/bridge: cargo test (4 tests)`. The actual bridge test count is **10 test
functions**: `#[test]`/`#[tokio::test]` across
`apps/bridge/src-tauri/src/framing.rs` (2) and
`apps/bridge/src-tauri/src/daemon.rs` (8). This was flagged out-of-remit by the
BRIDGE pass (file 31) and belongs here as root-guidance maintenance.

**Why it matters**
CLAUDE.md is the canonical agent guide (and `AGENTS.md` symlinks to it — verified
`AGENTS.md -> CLAUDE.md`). A stale count is low-harm on its own but this line is
the single place an agent trusts to know "did the last full validation pass and
at what scope". A number that is off by 2.5× erodes trust in the whole baseline
block.

**Proposed change**
In `CLAUDE.md` change `cargo test (4 tests)` to `cargo test (10 tests)`. Treat
the "Last verified validation" paragraph (test counts, the "703 tests" figure)
as a point-in-time snapshot: append a short editorial note in the docs-update
workflow reminding maintainers these counts are refreshed on each full-gate run,
not per-change — or drop the exact counts in favor of "all suites green" if the
project prefers not to maintain them. Recommended minimal fix: correct the two
Rust counts (framing 2 + daemon 8 = 10) and leave prose as-is.

**Do NOT change / risks**
Do not touch the feature status table or the architecture map in the same edit;
this is a numbers-only correction. Do not re-run the full extension suite just
to re-verify "703" unless doing a full-gate pass.

**Verification**
`grep -rn "#\[test\]\|#\[tokio::test\]" apps/bridge/src-tauri/src | wc -l` = 10.

**Related**
File 31 (BRIDGE) baseline notes.

---

### DOCS-03: Fix the stale "validates nothing" claim in site-sdk-security.md (item 2.7)

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
`docs/site-sdk-security.md:233` (Tier-2 weakness 2.7) states the content-side
workflow listener "validates nothing" and that `message.workflow` is "cast
without re-validation". This is false and contradicts
`docs/workflow-automation.md:56`. The listener **does** re-validate the full
workflow: `apps/extension/shared/hooks/useCommandPaletteStateRedux.tsx:76`
calls `validateContentMessage`, and
`apps/extension/shared/types/contentMessageValidation.ts:126-132
(ExecuteWorkflowContentMessageSchema)` embeds `workflow: WorkflowSchema` (the
complete deep schema), returning `null` on malformed input. The accurate
residual gap is narrower: only the **`sender.id` check** is missing (the
`_sender` param at `useCommandPaletteStateRedux.tsx:73` is unused). File 30
(WF) diagnosed this and explicitly handed the doc fix to this pass.

**Why it matters**
This is a security-model doc. A stated weakness that overstates the exposure
("validates nothing") will drive a reader to add a redundant re-validation layer
(recommendation #6 currently asks for exactly that), while the *real* residual —
a missing extension-sender check — reads as already covered. Two docs
contradicting each other on a security property is worse than either being
wrong alone.

**Proposed change**
1. Rewrite the 2.7 row in the weakness table (`docs/site-sdk-security.md:233`).
   Replace the "Weakness" and "Note" cells verbatim:

   > | 2.7 | Content-side workflow listener does not check `sender.id` | `handleBackgroundMessage` in `useCommandPaletteStateRedux` (`shared/hooks/useCommandPaletteStateRedux.tsx`) | The `_sender` param is unused, so a same-extension sender check is missing. The workflow payload itself **is** re-validated: the listener calls `validateContentMessage`, whose `ExecuteWorkflowContentMessageSchema` embeds the full `WorkflowSchema` and rejects malformed input. Not page-reachable (pages cannot post to a content script's `runtime.onMessage`), but the absent sender check is asymmetric with the background's rigorous sender checks. |

2. In "Recommended priorities" item 6 (`docs/site-sdk-security.md:273-277`),
   drop the redundant re-validation clause. Change
   `add a content-side workflow `sender.id` check plus schema re-validation;`
   to:
   `add a content-side workflow `sender.id` check;`

**Do NOT change / risks**
Do not weaken the framing of the *other* Tier-2 rows (2.1–2.9) — WF verified
those accurate. Do not claim the listener is fully hardened; the `sender.id`
gap is real and stays listed. `docs/workflow-automation.md:56` is already
correct — leave it.

**Verification**
`useCommandPaletteStateRedux.tsx:76` shows the `validateContentMessage` call;
`contentMessageValidation.ts:126-132` shows `workflow: WorkflowSchema`. The two
docs no longer contradict each other on this point.

**Related**
File 30 WF "Doc discrepancies noted (for file 40)"; the code half of 2.7 (the
`sender.id` check) is file 21's scope, not a doc change.

---

### DOCS-04: Remove the "(Automations)" title residue in automations.md and the README index

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
`docs/automations.md:1` is titled `# Automations (Automations)` — a
find/replace residue from a rename (the parenthetical once held the old feature
name). `docs/README.md:105` mirrors it: `[automations.md](./automations.md) —
Automations ("Automations"):`. Both render a meaningless doubled label.

**Why it matters**
Low harm, but it is the first line of the automations doc and its index entry;
a doubled title reads as an unfinished rename and undermines the "every doc
describes verified, current behavior" claim in `docs/README.md:6`.

**Proposed change**
- `docs/automations.md:1`: change `# Automations (Automations)` to
  `# Automations`.
- `docs/README.md:105`: change `Automations ("Automations"):` to `Automations:`.

**Do NOT change / risks**
Do not touch `automations.md:5`'s naming sentence in this finding — that is the
code-side AUTO-04 resolution (see the deferral table). This is only the title
parenthetical.

**Verification**
`grep -n "Automations (Automations)\|Automations (\"Automations\")" docs/`
returns nothing.

**Related**
AUTO-04 (file 11) — land together if AUTO-04 is being implemented; DOCS-07
(comment residues from the same rename).

---

### DOCS-05: Adopt a top-of-file architecture-block convention (write it down; fill the ~10 highest-value gaps)

**Priority:** P2     **Effort:** M     **Type:** consistency

**Current state**
The `background/` tree has a strong, near-consistent convention — a top-of-file
block starting `// Architecture: <layer>. <role, inputs/outputs, boundaries>`
often ending `See docs/<x>.md.` It is genuinely good and worth codifying.
Exemplars (verified, all have a clear leading block):

- `apps/extension/background/commands/source.ts:1-6 (top-of-file)` — "Architecture: background command system. Command loading and category registration…"
- `apps/extension/background/commands/query.ts:1-9 (top-of-file)` — "Architecture: background command system, resolution layer…"
- `apps/extension/background/commands/searchIndex.ts:1-12 (top-of-file)` — "In-memory search index for background-owned palette search…"
- `apps/extension/background/automations/engine.ts:1-13 (top-of-file)`
- `apps/extension/background/surfaces.ts:1-8 (top-of-file)`
- `apps/extension/background/features/index.ts:1-8 (top-of-file)`
- `apps/extension/background/commands/execution.ts:1-3 (top-of-file)`
- `apps/extension/background/keybindings/source.ts (top-of-file)`
- `apps/extension/background/messages/index.ts (top-of-file)`
- `apps/extension/background/commands/suggestions.ts (top-of-file)`

But the convention is unwritten and coverage is uneven. Counting non-test files
with vs. without any leading comment: `background/` HAS 98 / LACK 129;
`shared/` HAS 47 / LACK 70. Several of the "lack" files are large,
boundary-crossing modules that would benefit most — comparable in size and role
to the exemplars but with no orienting block:

- `apps/extension/background/commands/settings.ts:1 (top-of-file)` — 339 LOC; **the** settings-persistence module (`getCommandSettings`/`updateCommandSettings`) named as authoritative in architecture.md; no block.
- `apps/extension/background/keybindings/registry.ts:1 (top-of-file)` — 200 LOC; the module-scoped keybinding registry the searchIndex block even points at as a pattern sibling; no block of its own.
- `apps/extension/background/messages/searchCommands.ts:1 (top-of-file)` — 217 LOC; a message handler (most peers under `background/messages/` have blocks; this one starts with an inline `//` mid-file at line 44, not a header).
- `apps/extension/shared/hooks/useCommandNavigation.tsx:1 (top-of-file)` — 383 LOC; the core navigation hook, dual-DOM.
- `apps/extension/shared/components/Command/CommandPalette.tsx:1 (top-of-file)` — 368 LOC; the shared palette root, runs in both DOMs.
- `apps/extension/shared/components/Command/CommandActionsList.tsx:1 (top-of-file)` — 427 LOC; the live keybinding-capture UI (KEY-01's target).
- `apps/extension/shared/store/slices/settings.slice.ts:1 (top-of-file)` — 353 LOC; cross-process writer (STATE-01).
- `apps/extension/shared/store/slices/settingsCatalog.slice.ts:1 (top-of-file)` — 363 LOC.
- `apps/extension/shared/store/slices/snippets.slice.ts:1 (top-of-file)` — 215 LOC.
- `apps/extension/shared/types/siteSdk.ts:1 (top-of-file)` — 660 LOC; the site-SDK type/contract surface.

**Why it matters**
The `background/` blocks are the fastest orientation tool in the repo — they tell
a reader the layer, the data in/out, and the boundary in five lines, and point
at the deep-dive doc. Where they are absent (notably `settings.ts`,
`registry.ts`, and the large shared UI files), a new engineer must reverse-
engineer the module's role and its cross-process contract from the body. The
inconsistency also makes the block feel optional, so new files skip it and the
convention decays.

**Proposed change**
Add a short **Comment conventions** section to `docs/README.md` ("Conventions
used in these docs" already exists — add a sibling for code comments), stating:

> **Top-of-file architecture block.** Any file that is either >150 LOC **or**
> crosses an architectural boundary (background↔UI message surface, a Redux
> slice, a storage owner, a feature/automation module, a shared dual-DOM
> component) opens with a leading comment block:
> `// Architecture: <layer>. <what this module owns, its inputs and outputs,
> the boundary it sits on>`, ending with `See docs/<relevant>.md.` when a
> deep-dive doc exists. Keep it to 3–12 lines. Do **not** restate the export
> list or narrate control flow — describe role and contracts.
> **Exempt:** big-but-linear lookup/definition files (icon registries, flat
> command-definition arrays, enum/const tables) — a one-line "what this table
> is" comment suffices; they need no architecture block.

Then, as a **bounded** one-time sweep, add a block to the ~10 files listed above
(and any other >150-LOC boundary file lacking one). Do this file-by-file, using
the exemplars' voice. This is net-positive signal on the highest-traffic gaps —
it is explicitly **not** a mandate to comment every file.

**Do NOT change / risks**
Do NOT mass-insert blocks into leaf components, small utilities, or the
big-but-linear files — that is noise generation and violates the review guard
list. Exempt (leave alone): `apps/extension/shared/components/iconRegistry.ts`
(401 LOC lookup table), the `background/commands/browser/*` command-definition
files (linear `CommandNode` arrays — a one-line intro at most), and any file
under ~150 LOC whose role is obvious from its name. The convention must hold
comment volume roughly flat while raising signal, not inflate it.

**Verification**
The convention text lands in `docs/README.md`. Every file in the "gap" list
above opens with an `// Architecture:` block. No new block is added to an
exempt file. `pnpm run fmt:check` stays green (blocks are plain comments).

**Related**
KEY-01 (file 14) touches `CommandActionsList.tsx`; STATE-01 (file 23) touches
`settings.slice.ts` — batch the block with those edits where they overlap.
DOCS-06 (doc-comment convention) is the function-level companion to this
file-level convention.

---

### DOCS-06: Write down the doc-comment (JSDoc) convention; delete restating comments; add ~4 boundary doc-comments

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
`/**…*/` JSDoc is used in 68 non-test files under `background/`+`shared/` but
with no stated rule for *when*. The result is two failure modes side by side:

Restating/noise comments that duplicate the next line (delete candidates):
- `apps/extension/background/utils/runtime.ts:101 (createCrossBrowserMessageHandler)` — `// Get the runtime API (Chrome or Firefox)` immediately above `const runtime = isFirefox ? browser.runtime : chrome.runtime`.
- `apps/extension/background/messages/index.ts:62 (handleMessage)` — `// Return structured error response` above `return { error: … }`.
- `apps/extension/background/commands/usage.ts:242 (getCommandUsageStats)` — `// Get usage stats for a command` above the identically-named function; likewise `:250 (getAllUsageStats)` `// Get all command usage stats`.
- `apps/extension/background/messages/getPermissions.ts:12 (handleGetPermissions)` — `// Create the access object` above `const access = { … }` (the useful line — the Firefox/`contextualIdentities` note on the next line — should stay).
- `apps/extension/background/commands/usage.ts:208-232 (updateCommandUsage)` — the string of `// Get or create stats…` / `// Update stats` / `// Check if we need to clean up…` restates trivially; keep only `// Update EMA score` if the EMA math is non-obvious.

Exported boundary functions with a non-obvious contract but no doc-comment
(add-a-doc-comment candidates):
- `apps/extension/background/commands/settings.ts:138-160 (updateCommandSettings)` — has only `// Update settings for a specific command (merging with existing)`; the load-bearing contract (shallow-merge; callers must preserve nested lists like `urlRules` explicitly — a documented invariant in CLAUDE.md and a real bug source) is not stated.
- `apps/extension/background/workflows/execution.ts:136 (resolveWorkflowTargetTabId)` — no doc-comment; embeds the security-relevant "trusts caller-supplied `tabId` over the sender's tab" behavior (weakness 2.5 in site-sdk-security.md).
- `apps/extension/background/workflows/execution.ts:176 (executeWorkflowOnTargetTab)` — the tab-wide (not document/frame-scoped) delivery contract (weakness 2.6) is undocumented at the call boundary.
- `apps/extension/background/commands/settings.ts:118 (setCommandSettings)` — `// Set settings…` restates the name; the *replace-vs-merge* distinction from `updateCommandSettings` is the thing worth documenting.

**Why it matters**
Restating comments cost signal: a reader learns to skim comments as noise, then
misses the ones that carry a real invariant. The reverse gap is worse — the
merge-semantics of `updateCommandSettings` and the tab-wide targeting of the
workflow helpers are exactly the contracts that cause silent bugs when a caller
assumes the other behavior; those deserve the one doc-comment each.

**Proposed change**
Add to the `docs/README.md` "Comment conventions" section (alongside DOCS-05):

> **Doc-comments.** Use a `/**…*/` doc-comment on an **exported** function only
> when it crosses a module boundary **and** has a contract a caller cannot infer
> from the signature — merge-vs-replace semantics, locking, trust/targeting
> boundaries, units, or a documented invariant. Never write a doc-comment (or
> `//` comment) that restates the function name or the line beneath it. Prefer
> deleting a comment over letting it echo the code.

Then: (a) delete the ~5 restating comments listed above (net comment reduction);
(b) add one-to-three-line doc-comments to the ~4 boundary exports listed,
stating the merge/replace and targeting contracts. For `updateCommandSettings`,
state verbatim the CLAUDE.md invariant: *"Shallow-merges `partialSettings` into
existing command settings; nested lists (e.g. `urlRules`) are replaced, not
merged — callers must read-modify-write them explicitly."*

**Do NOT change / risks**
Do not sweep-add doc-comments to every export — most are self-describing and a
doc-comment there is noise. Keep useful *inline* rationale comments (the "why"
comments in `settings.ts`, `urlFilter.ts:199`, `reconnect.ts:21`, etc.); this
finding targets only comments that restate. Do not convert working `//` headers
to `/**…*/` for style.

**Verification**
The convention text lands in `docs/README.md`. The five restating comments are
gone; the four boundary functions have accurate doc-comments. Net comment line
count in the touched files is flat or lower. `pnpm run fmt:check` green.

**Related**
DOCS-05 (file-level companion); STATE-01 touches `settings.ts` merge paths —
land the `updateCommandSettings` doc-comment with it.

---

### DOCS-07: Sweep the "automation automation" / "a automation" rename residue in code comments

**Priority:** P3     **Effort:** S     **Type:** doc-rewrite

**Current state**
The `script → automation` rename left grammatical residue in comments/JSDoc: a
find/replace turned "script" into "automation" without fixing the surrounding
words, producing "automation automation" and "a automation" (should be "an
automation") and "automations/automations". Verified occurrences:

- `apps/extension/background/surfaces.ts:6 (top-of-file)` — "or a automation automation ("automation:<id>")".
- `apps/extension/shared/types/surface.ts:8 (top-of-file)` — "feature, automation automation, OR command can push surfaces."
- `apps/extension/shared/types/events.ts:44` — "a feature like Focus Mode, or a automation automation".
- `apps/extension/background/features/elementHider/automations.ts:2 (top-of-file)` — "read-only automation automations — one per saved rule".
- `apps/extension/background/commands/source.ts:3 (top-of-file)` — "automations/automations, new-tab, Firefox".
- `apps/extension/background/automations/engine.ts:136 (runAutomation JSDoc)` — "Runs a automation end to end".
- `apps/extension/background/commands/execution.ts:3 (top-of-file)` — "a generated row action, or a automation".
- `apps/extension/shared/types/workflow.ts:185` — "so a caller (e.g. a automation) can scope".
- `apps/extension/shared/utils/automation-summary.ts:2 (top-of-file)` — "a automation document — the import-safety surface".

**Why it matters**
Several of these are in the exemplary top-of-file architecture blocks DOCS-05
holds up as the standard — "automation automation" in the very blocks a new
engineer is meant to trust reads as an unfinished migration and cheapens the
convention.

**Proposed change**
Mechanical text fix, no behavior: "automation automation" → "automation";
"a automation" → "an automation"; "automations/automations" → "automations".
Do it in one commit with AUTO-04 (the code-side naming migration) if that is
being implemented, since AUTO-04's find/replace should include comment bodies.

**Do NOT change / risks**
Text-only. Do not alter constant/variable names here (that is AUTO-04's scope) —
only the prose in comments. Verify no code identifier literally contains
"automation automation".

**Verification**
`grep -rn "automation automation\|a automation\|automations/automations"
apps/extension --include='*.ts' --include='*.tsx' | grep -v '.test.'` returns
nothing after the fix.

**Related**
AUTO-04 (file 11); DOCS-04 (the title residue from the same rename).

---

## Non-findings (reviewed, justified)

- **`docs/README.md` index completeness.** All 27 top-level docs are linked; the
  three multi-doc subsystems (`native-messaging/`, `extension-extension/`,
  `raycast/` — 24 files) are indexed via their folder `README.md`, and every
  `docs/…` path referenced in `CLAUDE.md` resolves to an existing file
  (verified). This folder-README structure is deliberate and consistent — not a
  gap. Do not flatten it into one giant index.
- **`architecture.md` store-layout and data-flow sections.** The two
  store-factory table (`createAppStore`/`createCommandPaletteStore`), the
  eight-slice table, and the six core data-flow walkthroughs were spot-checked
  against `shared/store/index.ts`, the slice files, and `background/messages/`
  and match the code. The only defect is DOCS-01 (workflow op list). The
  settings-persistence claim (lines 64/77/189) is code-side (STATE-01), deferred.
- **`architecture.md` build/permissions section.** Optional-permission list,
  Chrome-only `tabGroups`, and `host_permissions` (Unsplash, DuckDuckGo)
  match `wxt.config.ts` (verified). No change.
- **`docs/workflow-automation.md` and `docs/site-sdk.md`** — verified accurate by
  file 30 (WF) against code (17-op table, lockstep, executor split, schema/limits).
  Only `site-sdk-security.md:233` (DOCS-03) is stale.
- **`AGENTS.md`** — a symlink to `CLAUDE.md` (verified `AGENTS.md -> CLAUDE.md`);
  there is nothing to keep in sync. No finding.
- **Useful "why" comments are not touched.** Comments that explain a non-obvious
  decision (`urlFilter.ts:199`, `reconnect.ts:21` idempotency note,
  `keybindings/source.ts:260` storage.onChanged rationale, `port.ts:25` gate)
  carry real signal and are explicitly out of DOCS-06's deletion set.
- **`docs/` "no line numbers" convention.** The docs deliberately cite source by
  path + symbol, never line number (`docs/README.md:179-181`). This review's
  findings supply line numbers only as review-time locators; the doc edits
  themselves must keep using symbol/anchor references, matching the convention.
