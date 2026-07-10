# 22 — UI: Automations Editor

Scope: `apps/extension/options/pages/automations/` (editor page, StepRow,
editorState, TriggersEditor, VariablesEditor, SelectorFields, ScopeRuleList,
importExport, examples), `apps/extension/options/pages/AutomationsPage.tsx`,
and the editor-facing use of `shared/store/slices/automations.slice.ts`
(slice conventions in general belong to file 23). Cross-checked against
`shared/types/automations.ts`, `shared/types/automationValidation.ts`, and
`background/automations/lowering.ts`. ID prefix: `EDIT`.

Overall shape is healthy: the editor derives every step/trigger/variable type
from `shared/types` (no parallel definitions), validates with the exact shared
Zod schema the background enforces, and keeps unformable steps round-tripping
as JSON so nothing is silently dropped. The findings below are about the
*editor-local op tables* — four stringly-typed structures that must be updated
in lockstep with zero compile-time linkage — plus a handful of small
consistency and test gaps.

---

### EDIT-01: Consolidate per-op editor knowledge into a typed step-editor registry and split StepRow's form fields by op family

**Priority:** P2     **Effort:** M     **Type:** decompose

**Current state**
Knowledge about "how the builder edits op X" is spread across four unlinked,
stringly-typed structures:

1. `apps/extension/options/pages/automations/editorState.ts:190-213 (FORM_OPS)`
   — a `Set<string>` of ops that get a form row.
2. `apps/extension/options/pages/automations/editorState.ts:215-241 (STEP_OP_OPTIONS)`
   — `Array<{ op: string; label: string }>` driving both the per-row op
   `<Select>` and the "Add Step" picker.
3. `apps/extension/options/pages/automations/editorState.ts:262-338 (createDefaultStepRow)`
   — a `switch (op: string)` producing the default step per op.
4. `apps/extension/options/pages/automations/StepRow.tsx:72-632 (renderFormFields)`
   — a ~560-line `switch (step.op)` of per-op JSX. Branch map:
   click `StepRow.tsx:74-86`; fill `87-106`; select `107-183`;
   check/uncheck/focus/blur/hover `184-196`; submit `197-208`; scroll
   `209-253`; wait `254-381`; getText `382-420`;
   removeElement/hideElement `421-447`; injectCss `448-458`; toast `459-488`;
   setVariable `489-513`; insertSnippet `514-556`; navigate `557-566`;
   openUrl `567-598`; clipboardWrite `599-611`; runCommand `612-628`;
   default→null `629-630`. The click/submit `expectNavigation` checkbox is a
   local closure `StepRow.tsx:52-70 (navigationToggle)`.

The row shell (index badge, op select, move/delete buttons, JSON textarea,
error list) is `StepRow.tsx:634-741 (StepRow)`.

**Why it matters**
Adding one op today means editing four places keyed by bare strings, and the
compiler enforces none of them: forget `FORM_OPS` and the op silently falls
back to JSON editing; forget `createDefaultStepRow` and the default case
silently substitutes a *toast* step (`editorState.ts:335-337`); forget
`STEP_OP_OPTIONS` and the op is unaddable (this has already happened — see
EDIT-02). A per-op registry is justified by the guard list here: the plurality
already exists (22 form ops + 3 JSON-edited control-flow ops), and the flat
switch's branches are *not* uniform — they range from 5 lines (navigate) to
~125 (wait), so the "consistent flat switch" exemption does not apply to the
lockstep problem, only to the JSX itself.

**Proposed change**
Create `apps/extension/options/pages/automations/stepEditors/` and make it the
single owner of per-op editor knowledge. One registry entry per op:

```ts
// stepEditors/types.ts
export type StepFormProps<Op extends AutomationStep["op"]> = {
  step: Extract<AutomationStep, { op: Op }>
  snippets: Snippet[]
  update: (step: AutomationStep) => void
}
export type StepEditorEntry<Op extends AutomationStep["op"]> = {
  label: string
  createDefault: () => Extract<AutomationStep, { op: Op }>
  Form: (props: StepFormProps<Op>) => React.ReactElement | null
}
```

Files to create, and which JSX moves where (all content verbatim from
`renderFormFields`, only re-wired to `props.step` / `props.update`):

- `stepEditors/interactionSteps.tsx` — click, submit (sharing an
  `ExpectNavigationToggle` component lifted from `StepRow.tsx:52-70`), fill,
  select, one shared `TargetOnlyForm` reused by check/uncheck/focus/blur/hover
  (identical params: `target` only, per `StepRow.tsx:184-196`), scroll.
- `stepEditors/observationSteps.tsx` — wait (`StepRow.tsx:254-381`), getText
  (`382-420`).
- `stepEditors/pageEditSteps.tsx` — a shared form for
  removeElement/hideElement (identical params `target` + `all`,
  `StepRow.tsx:421-447`), injectCss.
- `stepEditors/engineSteps.tsx` — toast, setVariable, insertSnippet, navigate,
  openUrl, clipboardWrite, runCommand (`StepRow.tsx:459-628`).
- `stepEditors/index.ts` — the registry plus derived tables:

```ts
export const STEP_EDITORS: { [Op in FormOp]: StepEditorEntry<Op> } = { … }
// JSON-edited ops (control flow today; EDIT-02 adds type/key/show/hideSurface):
export const JSON_STEP_OPTIONS: Array<{
  op: AutomationStep["op"]; label: string; createDefaultJson: () => AutomationStep
}> = [ … ]
export const STEP_OP_OPTIONS = [
  ...orderedFormOps.map(op => ({ op, label: STEP_EDITORS[op].label })),
  ...JSON_STEP_OPTIONS.map(({ op, label }) => ({ op, label })),
]
export const FORM_OPS: ReadonlySet<string> = new Set(Object.keys(STEP_EDITORS))
export const createDefaultStepRow = (op: AutomationStep["op"]): StepRowState => { … }
```

Steps, in order:

1. Move `createDefaultSelector` (`editorState.ts:146-149`) into
   `stepEditors/` (re-export from `editorState.ts` for `TriggersEditor.tsx:23`
   and `StepRow` consumers) so imports flow one way:
   `stepEditors → shared/types` only, `editorState → stepEditors`.
2. Move the four structures listed above into the registry; delete them from
   `editorState.ts` and re-export `STEP_OP_OPTIONS`/`createDefaultStepRow`
   from `editorState.ts` (or update the two importers:
   `AutomationEditorPage.tsx:42-52`, `StepRow.tsx:11-16`).
3. Shrink `StepRow.tsx` to the shell: header row, JSON-row textarea
   (`StepRow.tsx:687-729` stays), error list, and a single dispatch —
   `const entry = getStepEditor(step.op)` where `getStepEditor` performs the
   one localized cast that Record-keyed dispatch over a discriminated union
   needs (`STEP_EDITORS[op as FormOp]`), returning `null` for non-form ops.
4. Keep `stepRowFromStep` (`editorState.ts:250-260`) in `editorState.ts`,
   importing `FORM_OPS`; the scroll-object special case
   (`editorState.ts:253-255`) stays with it.

**Do NOT change / risks**
Keep everything page-local under `options/pages/automations/` — settings-page
phase 6 (workflows management UI) *may* become a second consumer of
`SelectorFields`/step forms, but lifting to `shared/` now would be a
one-call-site abstraction (guard list). Do not add a visual editor for
branch/forEach/while — JSON round-tripping is a documented deliberate choice
(`editorState.ts:5-9`). Do not design for JS steps (deliberately absent). The
`StepRowState` shape, `assembleDraft` output, and saved document bytes must be
unchanged — this is a pure code-motion + typing change. Registry keys must
stay exactly the op strings so unknown/imported ops keep falling back to JSON
rows (`StepRow.tsx:647-648` renders the `{op} (JSON)` option — keep it).

**Verification**
`pnpm run tsc` proves the `{ [Op in FormOp]: … }` mapped type rejects a
missing entry. New test `stepEditors/index.test.ts`: every `STEP_OP_OPTIONS`
op round-trips through `createDefaultStepRow` with a matching `op`, and every
JSON-op default parses under `AutomationStepSchema`. Existing
`examples.test.ts` stays green. Manual: open each op in the builder, confirm
identical fields; load "Example: Dismiss cookie banner" and confirm
branch renders as JSON.

**Related**
EDIT-02 (land first — it changes the tables this finding relocates), EDIT-03.
Future: settings-page phase 6/7 (`docs/settings-page.md:580-581`).

---

### EDIT-02: Make every documented step op addable in the builder and remove the silent toast fallback

**Priority:** P2     **Effort:** S     **Type:** consistency

**Current state**
The `AutomationStep` union has 29 ops: 17 workflow content ops
(`apps/extension/shared/types/workflow.ts:61-78 (Step)`) plus 12 engine ops
(`apps/extension/shared/types/automations.ts:266-278 (AutomationEngineStep)`).
`STEP_OP_OPTIONS` (`apps/extension/options/pages/automations/editorState.ts:215-241`)
lists only 25: it omits `type` and `key`
(`shared/types/workflow.ts:120-131 (TypeStep, KeyComboStep)`) and
`showSurface`/`hideSurface`
(`shared/types/automations.ts:226-238 (ShowSurfaceStep, HideSurfaceStep)`),
all four of which validate (`shared/types/automationValidation.ts:400-447
(AutomationStepSchema)`) and execute (`background/automations/lowering.ts:18-31
(ENGINE_OPS)` covers the surface ops; type/key lower as content steps). They
round-trip as JSON rows when present in a loaded document
(`editorState.ts:256-258 (stepRowFromStep)`), but a user cannot *add* one —
the only workaround is adding a "Branch (edit as JSON)" row and hand-rewriting
its JSON. Separately, `createDefaultStepRow`'s default case silently returns a
toast step for any unknown op string (`editorState.ts:335-337`), and both op
tables are typed as bare `string` (`editorState.ts:190, 215`), so a future op
added to the union produces no compile-time signal anywhere in the editor.

**Why it matters**
The builder is documented as covering the vocabulary ("per-op form rows for
the flat vocabulary, JSON editing for control-flow steps",
`docs/automations.md:222`), and `docs/surfaces.md` documents automations
pushing surfaces — yet the only supported authoring path for a `showSurface`
step is the branch-row JSON trick, which no one will discover. The silent
toast fallback is a latent wrong-op bug: unreachable from today's dropdown,
but the first typo'd registry key or new-op omission turns "add step X" into
"added a toast" with no error.

**Proposed change**
All in `editorState.ts` (relocated by EDIT-01 if that lands after):

1. Add four entries to `STEP_OP_OPTIONS`, JSON-edited like the control-flow
   ops: `{ op: "type", label: "Type keys (edit as JSON)" }`,
   `{ op: "key", label: "Press keys (edit as JSON)" }`,
   `{ op: "showSurface", label: "Show surface (edit as JSON)" }`,
   `{ op: "hideSurface", label: "Hide surface (edit as JSON)" }`.
2. Add matching `createDefaultStepRow` cases returning
   `jsonRowFromStep(…)` with minimal valid documents (mirroring the
   branch/forEach/while pattern at `editorState.ts:311-334`), e.g.
   `{ op: "key", keys: ["Enter"] }` and
   `{ op: "showSurface", surfaceId: "notice", kind: "badge", content: { text: "Done" } }`
   — exact shapes proven by the validation test in step 4.
3. Type the tables against the union: change `createDefaultStepRow(op: string)`
   to `op: AutomationStep["op"]`, and add a coverage assertion
   `const STEP_OP_LABELS = { … } satisfies Record<AutomationStep["op"], string>`
   from which `STEP_OP_OPTIONS` derives its labels — a new union member then
   fails `tsc` in the editor. Replace the default fallback with a JSON row for
   the requested op (`jsonRowFromStep({ op } as AutomationStep)` is
   unreachable once the parameter is union-typed; keep it as the safe
   fallback rather than a toast).
4. New test in `editorState.test.ts` (see EDIT-03): every `STEP_OP_OPTIONS`
   entry's default row validates — form rows may carry empty-string fields
   (validation errors are the guidance UX), but JSON-row defaults must parse
   under `AutomationStepSchema`.
5. Doc touch-up, `docs/automations.md:222`, replace the step-list clause with
   (verbatim): "and the step list — per-op form rows for most of the flat
   vocabulary, JSON editing for control-flow steps and the JSON-only ops
   (`type`, `key`, `showSurface`, `hideSurface`)."

**Do NOT change / risks**
Do not build form UIs for the four ops — key-sequence and surface-content
editors are real design work and JSON rows are the established pattern for
low-traffic ops. Do not touch `FORM_OPS`. Wire shapes and stored documents
are unaffected. `rowOp`'s `"branch"` fallback for never-parsed JSON rows
(`StepRow.tsx:32-33`) is unrelated; leave it.

**Verification**
`pnpm run tsc`; new `editorState.test.ts` cases from step 4; manual: add each
new op in the builder, confirm a pre-filled JSON row appears and the document
saves; confirm a saved `showSurface` automation runs (surface appears).

**Related**
EDIT-01 (relocates these tables; land EDIT-02 first), EDIT-03 (test file),
DOCS file 40 for the doc line.

---

### EDIT-03: Add tests for import sanitization and editor round-trip (currently zero coverage)

**Priority:** P2     **Effort:** S     **Type:** test-gap

**Current state**
The only test under the editor is
`apps/extension/options/pages/automations/examples.test.ts:11-64` (examples
validate/disarmed/unique). Untested:
`apps/extension/options/pages/automations/importExport.ts:67-111
(prepareImportedDraft)` — the safety-critical import path that strips
id/createdAt/updatedAt (`importExport.ts:85`), forces non-manual triggers
`disarmed: true` (`importExport.ts:90-96`), and stamps imported provenance
(`importExport.ts:98`) — and all of
`apps/extension/options/pages/automations/editorState.ts` (`assembleDraft`
`:391-461`, `stepRowFromStep` `:250-260`, `collectTemplateWarnings`
`:471-499`).

**Why it matters**
Disarm-on-import is the import trust contract (`docs/automations.md`
"Security and trust model") and nothing would catch a regression — a refactor
that drops the `disarmed` forcing ships silent non-gesture execution for
imported documents. `assembleDraft` is the function that decides what gets
saved; a field silently dropped there (e.g. the `options`/`source`
preservation at `editorState.ts:456-457`) corrupts documents on every edit.

**Proposed change**
Two co-located test files (repo pattern: co-located `.test.ts`):

1. `importExport.test.ts`: envelope unwrap vs bare document accepted
   (`importExport.ts:84`); id/createdAt/updatedAt stripped; every non-manual
   trigger forced `disarmed: true` while manual triggers are untouched;
   `source` stamped `{ kind: "imported", importedAt }` even when the file
   claims `local`; invalid JSON → single "Not valid JSON" error; schema
   failure → path-prefixed errors. Reuse an `EXAMPLE_AUTOMATIONS` entry
   (armed manually in the fixture) as input.
2. `editorState.test.ts`: the round-trip invariant — for every entry in
   `EXAMPLE_AUTOMATIONS`, `assembleDraft(editorStateFromScript({ …example,
   id, createdAt, updatedAt } as Automation)).draft` deep-equals the original
   draft (this pins `options`/`source`/vars-order preservation and the
   JSON-row round-trip for control-flow steps); duplicate variable names
   produce an issue and would otherwise be coalesced by `Object.fromEntries`
   (`editorState.ts:417-423, 450-453`); a JSON row with `parsed: null` yields
   `draft: null`; `collectTemplateWarnings` flags unknown names but not
   declared vars, `forEach` bindings, or `trigger./params./snippet:`
   namespaces; plus the per-op default-row validity cases from EDIT-02.

**Do NOT change / risks**
Test-only. Do not export internals to make testing easier — everything named
above is already exported. Do not snapshot-test JSX (StepRow rendering is
covered by the manual checklist; DOM tests here would be brittle for little
signal).

**Verification**
`pnpm test` — new files pass; mutate `prepareImportedDraft` to skip disarming
and confirm the suite fails.

**Related**
EDIT-02 (shares `editorState.test.ts`), TEST file 41.

---

### EDIT-04: Extract the duplicated validation-issue grouping in AutomationEditorPage

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
`apps/extension/options/pages/automations/AutomationEditorPage.tsx:141-154
(stepErrors)` and `:156-169 (triggerErrors)` are two byte-identical `useMemo`
blocks differing only in the regex prefix (`steps` vs `triggers`), each
building a `Record<number, string[]>` from `validation.errors` paths;
`:171-177 (generalErrors)` re-encodes the same two prefixes a third time in
its exclusion regex.

**Why it matters**
Three copies of one path-parsing convention: when a third indexed collection
gets inline errors (variables are a natural candidate — duplicate-name issues
currently render only in the bottom panel), the pattern gets pasted a fourth
time, and a change to the error-path format must be found in three regexes.

**Proposed change**
Add to `editorState.ts` (it already owns draft-shape knowledge and is pure):

```ts
export const groupIssuesByIndex = (
  issues: Array<{ path: string; message: string }>,
  collection: "steps" | "triggers",
): Record<number, string[]> => { /* current regex body, parameterized */ }
```

Replace both memos with
`useMemo(() => groupIssuesByIndex(validationErrors, "steps"), [validationErrors])`
(and `"triggers"`); derive `generalErrors` from the same prefix list. Unit
tests in `editorState.test.ts` (EDIT-03): nested path detail formatting
(`steps.2.target.value: …`), index-only paths, non-matching paths ignored.

**Do NOT change / risks**
Keep the rendered error strings byte-identical (`detail` formatting at
`AutomationEditorPage.tsx:147-149`). Don't move the memos themselves out of
the page — React concerns stay in the component.

**Verification**
`pnpm run tsc`, new unit tests; manual: break a step selector and a trigger
field, confirm errors still appear on the right rows.

**Related**
EDIT-03.

---

### EDIT-05: Use the exported validation caps in TriggersEditor instead of re-hardcoding them

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
`shared/types/automationValidation.ts:27-40` exports the caps, but
`apps/extension/options/pages/automations/TriggersEditor.tsx` re-hardcodes
three of them: `MAX_TRIGGERS = 5` (`TriggersEditor.tsx:25`, duplicating
`USER_SCRIPT_MAX_TRIGGERS`), the delay input's `max={10000}` and label text
"max 10000" (`TriggersEditor.tsx:179-184`, duplicating
`USER_SCRIPT_TRIGGER_MAX_DELAY_MS`), and the throttle input's `min={250}` /
"min 250" (`TriggersEditor.tsx:216-221`, duplicating
`USER_SCRIPT_ELEMENT_APPEARS_MIN_THROTTLE_MS`).

**Why it matters**
If a cap changes in the schema, the editor's add-button gating and input
bounds silently disagree with validation: the UI lets the user build a
document the shared schema then rejects with a bottom-panel error instead of
preventing it at the control — exactly the drift the shared-schema design
exists to avoid.

**Proposed change**
Import the three constants in `TriggersEditor.tsx`; delete `MAX_TRIGGERS`;
interpolate them into the two labels (template literals: ``` `Delay after
match (ms, max ${USER_SCRIPT_TRIGGER_MAX_DELAY_MS})` ```). While there, use
them for the `max`/`min` props.

**Do NOT change / risks**
The throttle input's `max={60000}` matches an inline literal in the schema
(`automationValidation.ts:146` region, `.max(60_000)`) with no exported
constant — exporting one is optional; if added, name it
`USER_SCRIPT_ELEMENT_APPEARS_MAX_THROTTLE_MS` alongside the others. No
behavior change.

**Verification**
`pnpm run tsc`; grep confirms no remaining numeric literals for these caps in
`TriggersEditor.tsx`; manual: sixth-trigger add stays disabled.

**Related**
—

---

### EDIT-06: Show the current icon in the editor's icon select when it is outside the curated list

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
The editor's icon `<Select>` renders only `AUTOMATION_ICON_OPTIONS`
(`apps/extension/options/pages/automations/AutomationEditorPage.tsx:377-393`;
list at `editorState.ts:75-108` — a 32-name curated subset of the full
`IconName` set the schema accepts). `editorStateFromScript` preserves any
valid icon (`editorState.ts:361`), so a document whose icon is outside the
subset renders a controlled select whose value matches no `<option>` — the
control displays blank, looking like "None", even though the value is intact.
Five of the eleven shipped examples hit this today: `Cookie`
(`examples.ts:21`), `Copy` (`:57`), `ArrowDownToLine` (`:286`), `Sun`
(`:329`), `ArrowLeft` (`:354`). `StepRow` already solved the identical
problem for unknown ops with a synthesized option (`StepRow.tsx:647-648`).

**Why it matters**
Editing any of those examples (or an imported document) shows a misleading
blank icon control; a user who then touches the select can't get the original
icon back because it isn't offered. It also quietly contradicts
`examples.test.ts`'s premise that examples are valid documents the UI
faithfully edits.

**Proposed change**
Mirror the StepRow pattern in the icon select: before mapping
`AUTOMATION_ICON_OPTIONS`, render
`{state.icon && !AUTOMATION_ICON_OPTIONS.includes(state.icon) && (<option value={state.icon}>{state.icon}</option>)}`.
Alternatively (equally acceptable): add the five example icons to
`AUTOMATION_ICON_OPTIONS` *and* keep the fallback option for imported
documents — the fallback is the part that fixes the class of bug. Colors need
no change: `AUTOMATION_COLOR_OPTIONS` (`editorState.ts:110-123`) exactly
matches the schema's closed `COLOR_NAMES` set
(`automationValidation.ts:42-55`).

**Do NOT change / risks**
Don't widen `AUTOMATION_ICON_OPTIONS` to all of `ICON_NAMES` — the curation
keeps the dropdown usable; the fallback option covers the tail.

**Verification**
Manual: edit "Example: Dismiss cookie banner", the icon select shows
`Cookie`; save without touching it and the icon persists. Optional unit test
in `editorState.test.ts`: every `EXAMPLE_AUTOMATIONS` icon is either in
`AUTOMATION_ICON_OPTIONS` or the finding's fallback rule applies (guards
future examples).

**Related**
EDIT-03.

---

## Non-findings (reviewed, justified)

- **Converting `editorState.ts` to a reducer with named actions** — refuted
  premise: `editorState.ts` is pure data transforms (row constructors,
  defaults, assembly), not an imperative mutation store; page state is one
  immutable `useState` (`AutomationEditorPage.tsx:98`) with ~10 simple spread
  updates, and there is no undo/redo to justify action semantics. A
  `useReducer` would add action-type ceremony without removing any complexity.
- **Parallel editor-side step/trigger types** — refuted: every step, trigger,
  and variable type is imported from `shared/types`
  (`editorState.ts:10-25`); only *label/default tables* are editor-local
  (their typing is fixed by EDIT-01/02, not a type unification).
- **Validation re-implementation** — refuted: the editor validates
  exclusively via `validateAutomationDraft`
  (`AutomationEditorPage.tsx:126-132`); the editor-only checks in
  `assembleDraft` (unparseable JSON rows, duplicate variable names,
  `editorState.ts:396-423`) are pre-schema row concerns Zod structurally
  cannot see (duplicates would be silently coalesced by `Object.fromEntries`).
- **AutomationEditorPage size (~589 LOC)** — beyond EDIT-04 it is linear page
  assembly; the heavy sections are already delegated to `TriggersEditor`,
  `VariablesEditor`, `ScopeRuleList`, and `StepRow`, matching other options
  pages.
- **Delete without confirmation on AutomationsPage**
  (`AutomationsPage.tsx:319-330`) — matches the established options
  convention (`SnippetsPage.tsx:191` deletes without confirm); export offers
  recovery; adding a confirm dialog is a product decision, not a
  maintainability fix.
- **`key={index}` on step/trigger/variable rows** — rows are fully controlled
  (all state lives in the row data, which moves with the array on
  reorder/delete), so index keys cannot corrupt state; synthetic ids would
  complicate `EditorDraftState` for no behavioral gain.
- **`toDraft` (`AutomationsPage.tsx:69-75`) vs the identity strip in
  `prepareImportedDraft` (`importExport.ts:85`)** — same three fields but
  different type levels (typed `Automation` vs untrusted record); a shared
  helper would obscure the import sanitization path.
- **`ScopeRuleList` calling `chrome.permissions` directly** — required to
  preserve the user gesture; documented in its header
  (`ScopeRuleList.tsx:1-10`) and consistent with `PermissionActions`.
- **JSON textareas for control-flow steps instead of nested visual editors**
  — deliberate, documented scope choice (`editorState.ts:5-9`); a recursive
  step UI is a large speculative build the JSON fallback makes unnecessary.
- **`examples.ts` as one 389-line data literal** — it is data, locked by
  `examples.test.ts`, and intentionally doubles as living documentation.
- **Op change discarding the row's fields**
  (`StepRow.tsx:643-646` replaces the row with `createDefaultStepRow`) —
  preserving overlapping fields across ops would need a field-mapping table
  for marginal benefit; reset-on-change is predictable.
- **`automations.slice.ts` thunk/mirror shape** — idiomatic for its
  editor-facing use (load/add/update/delete/run + test-run state); slice
  conventions in general are owned by file 23.
