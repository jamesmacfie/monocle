# Maintainability Review — Conventions and Index

This directory is the output of a July 2026 whole-repo maintainability review.
Each file is a set of **spec-only findings**: changes to make, why they matter,
and exactly where they take effect. No code was changed by the review itself.
The files are written for a future agent or engineer to implement directly —
each finding is self-contained enough to act on without re-deriving context.

Review values, in order: **simplicity and understandability first**; modularity
without over-engineering; nothing that blocks the future expansion documented
in `docs/` (bridge M2–M4, website-commands plugin-registry decision,
settings-page phases 3–7, extension-extension root placement and type package,
favorites ordering, focus-mode timed sessions, element-hider unhide, site-SDK
Tier-2 hardening, live clock).

## File index

| File | Scope | ID prefix |
| --- | --- | --- |
| `00-summary.md` | Prioritized master index of all findings, with implementation ordering | — |
| `10-background-commands-and-search.md` | Command tree, query, search index, suggestions | `CMD` |
| `11-background-automations.md` | Automation engine, triggers, lowering, policy | `AUTO` |
| `12-background-messaging-and-validation.md` | Message router, handlers, validation layer | `MSG` |
| `13-background-features-and-storage.md` | Feature registry, config/state tiers, surfaces, storage | `FEAT` |
| `14-keybindings-end-to-end.md` | Keybinding registry → sequence machine → capture UI | `KEY` |
| `20-ui-palette-and-navigation.md` | Palette core, CMDK↔Redux sync, navigation slice | `PAL` |
| `21-ui-shells-content-newtab-options.md` | Content/new-tab/options shells, listeners, palette state | `SHELL` |
| `22-ui-automations-editor.md` | Automation editor page, StepRow, editor state | `EDIT` |
| `23-ui-state-management.md` | Redux slices, thunks, feature-state ownership | `STATE` |
| `30-workflows-and-site-sdk.md` | Workflow executor, site SDK, extension SDK | `WF` |
| `31-bridge-protocol-raycast.md` | Rust bridge, protocol package, Raycast client | `BRIDGE` |
| `40-docs-and-comments.md` | Doc accuracy, comment conventions, verbatim rewrites | `DOCS` |
| `41-testing-gaps.md` | Risk-ranked missing tests keyed to findings | `TEST` |
| `42-future-expansion-alignment.md` | Finding ↔ future-plan cross-reference matrix | `FUT` |

**Ownership rule** (prevents the same code being reviewed twice):
`navigation.slice.ts` belongs to file 20; all other slices to 23.
`executeKeybinding.ts` belongs to 14; all other message handlers to 12.
Automations background code belongs to 11; the automations editor UI to 22.
`commandPaletteState.slice.ts` belongs to 21. `features/nativeMessaging/`
belongs to 31.

## Finding template

Every finding uses exactly this structure:

```markdown
### <ID>: <imperative title, e.g. "Extract shared command-tree walker">

**Priority:** P0 | P1 | P2 | P3     **Effort:** S | M | L     **Type:** decompose | dedupe | dead-code | consistency | doc-rewrite | test-gap

**Current state**
What exists now, with citations in the form
`apps/extension/background/commands/query.ts:130-194 (findFavoritedCommands)`.
Every citation names path, line range, AND the symbol at that location —
the symbol makes citations survive line drift.

**Why it matters**
Concrete maintainability cost: what a new engineer misreads, what change
becomes risky, what bug class it invites. One paragraph max. No abstract
appeals to "clean code".

**Proposed change**
Implementable spec: new/changed file paths, load-bearing function signatures,
which call sites move, ordering of steps if multi-step. For doc/comment
rewrites: the replacement text verbatim.

**Do NOT change / risks**
Explicit boundaries: adjacent code that looks related but is justified as-is;
behavior that must stay byte-identical (search ranking output, message wire
shapes); migration notes for stored data.

**Verification**
How the implementer proves it worked: existing tests to keep green, new tests
to add (named), manual checks.

**Related**
Other finding IDs (dependencies/ordering) and future-work docs it touches.
```

Rules:

- One finding = one independently implementable change. If two changes must
  land together, they are one finding with ordered steps.
- Findings are numbered `<PREFIX>-01`, `<PREFIX>-02`, … within their file,
  roughly priority-ordered.
- Every file ends with a **Non-findings (reviewed, justified)** section:
  things that look like problems but were examined and deliberately left
  alone, with a one-line reason each. This stops future reviewers from
  re-litigating them.

## Priority and effort

Score each finding on **Impact** (3 = active bug risk or routinely misleads
readers; 2 = materially slows comprehension or change; 1 = polish) and
**Blast radius** (3 = touched by most feature work; 2 = one subsystem;
1 = leaf file). **Effort:** S ≤ half a day, M ≤ 2 days, L > 2 days for an
agent-assisted implementer.

- **P0** — impact 3 with correctness risk, regardless of effort.
- **P1** — impact × radius ≥ 6 and effort S/M.
- **P2** — impact × radius ≥ 4, or ≥ 6 with effort L.
- **P3** — everything else worth recording.

## Do-NOT-recommend guard list (binding on every finding)

- **No speculative abstractions**: no plugin systems, generic CRUD layers, or
  event buses "for later". The website-commands plugin registry is a
  documented *pending decision* (`docs/commands/websites.md`) — do not
  preempt it.
- **No rewrites of working, tested subsystems for style** (search scoring,
  calculations, Rust bridge, protocol package, Raycast client).
- **Do not replace the explicit message router** with dynamic dispatch that
  loses exhaustive type checking; only reduce per-message ceremony.
- **No framework or library swaps** — cmdk, Redux Toolkit, WXT, and Tauri
  stay.
- **No stored-data shape changes without an explicit migration spec** in the
  finding; prefer changes that leave storage keys and shapes untouched.
- **Extend existing repo patterns, never introduce competing ones**
  (top-of-file architecture blocks, feature-dir layout, co-located `.test.ts`,
  `docs/` structure).
- **Nothing that blocks documented future work** (list at top of this file).
- An abstraction with exactly one call site or one implementation today is
  banned. Big-but-linear files (lookup tables, flat switches with consistent
  branches) are fine as-is.

## How to implement from these files

1. Start from `00-summary.md`; it orders findings by priority and dependency.
2. Open the owning file for the full spec. Follow "Proposed change" steps in
   order; respect "Do NOT change".
3. Run the "Verification" steps, plus the repo-wide gates:
   `pnpm run tsc`, `pnpm run fmt:check`, `pnpm test`, `pnpm run build`.
4. Anything touching the shared palette needs manual checks in **both**
   content (closed shadow DOM) and new-tab modes — see the manual checklists
   in the relevant `docs/` files.
