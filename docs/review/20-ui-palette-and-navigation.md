# 20 — UI Palette and Navigation (`PAL`)

Scope: the shared palette core and its CMDK↔Redux synchronization —
`shared/hooks/useCommandNavigation.tsx`, `useSearchInput.tsx`,
`useInlineInputKeys.ts`, `useCommandPaletteStateRedux.tsx`;
`shared/store/slices/navigation.slice.ts` (+ its test — owned here);
`shared/components/Command/` (`CommandPalette.tsx`, `CommandList.tsx`,
`CommandHeader.tsx`, `CommandItem/*`, `actionMenu.ts`, `paletteKeyboard.ts`,
`CommandActions.tsx`, and the `.dom.test.tsx` files); and the accuracy of
`docs/palette-ui-and-navigation.md` and the UI-side of
`docs/search-and-ranking.md`. Content/new-tab shell wiring is file 21's;
keybinding capture UI is file 14's; background search is file 10's (`CMD`).

Overall assessment: the *background-owned* half of this subsystem is in good
shape — the navigation slice is one well-commented, cohesive state machine, and
the async-response staleness guards (`searchSeq` + echoed `query` +
`refreshRequest`) are correct and tested. The fragility CLAUDE.md flags is
concentrated in one place and is real: the palette runs **two** search-value
ownership models at once — a declarative controlled `Command.Input` **and** an
imperative `ignoreSearchUpdate` DOM-poking layer — and the overlap is a
confirmed, test-documented keystroke-drop race (PAL-01). The rest is
consolidation of a now-dead inline-key path, one live shadow-DOM bug in the
multi-select row, a dead hook, and doc drift that all follow from collapsing to
a single owner.

---

### PAL-01: Collapse the palette search input onto a single owner (remove the `ignoreSearchUpdate` DOM dance)

**Priority:** P0     **Effort:** M     **Type:** decompose

**Current state**
The palette search input is **already a controlled React input**. `CommandHeader`
renders `<Command.Input value={currentPage.searchValue} onValueChange={onSearchChange}/>`
(`apps/extension/shared/components/Command/CommandHeader.tsx:32-42 (CommandHeader)`).
In cmdk 1.1.1, passing a non-null `value` makes the `<input>` fully controlled:
its rendered value is `e.value` and its `onChange` only calls `onValueChange`
(it does **not** write cmdk's internal `state.search`); a separate cmdk effect
mirrors `state.search` from the `value` prop on every change
(`node_modules/.pnpm/cmdk@1.1.1/.../dist/index.js`, `De` input component:
`i = e.value != null`, `value: i ? e.value : f`, `useEffect(... setState("search", e.value) ..., [e.value])`).
So React already drives both the visible input and cmdk's internal search from
`currentPage.searchValue`, and user typing already flows back via
`updateSearchValue`.

On top of that, `useCommandNavigation` runs a **second, imperative** ownership
layer that writes `inputRef.current.value` directly and dispatches a synthetic
`input` event, gated by an `ignoreSearchUpdate` ref:

- `apps/extension/shared/hooks/useCommandNavigation.tsx:26-45 (_clearAndResetSearch)`
  — sets the flag, blanks `inputElement.value`, dispatches `input`, then clears
  the flag on `setTimeout(…, 100)`. Called on `navigateTo` success (`:223`).
- `apps/extension/shared/hooks/useCommandNavigation.tsx:105-120` (page-change
  effect) — on `currentPage.id` change, if the DOM value differs it sets the
  flag, writes `inputElement.value`, dispatches `input`.
- `apps/extension/shared/hooks/useCommandNavigation.tsx:237-271 (navigateBack)`
  — sets the flag, dispatches `navigateBack`, then on `setTimeout(…, 0)` writes
  `inputRef.current.value`, dispatches `input`, focuses, and `setSelectionRange`.
- `apps/extension/shared/hooks/useCommandNavigation.tsx:193-201 (updateSearchValue)`
  — swallows the next real `onValueChange` whenever the flag is set.

Because the input is controlled, setting `.value` directly and firing a native
`input` event does not reliably re-enter React's `onChange` (React's value
tracker sees no delta), so the flag is **not** consumed synchronously — it stays
set for the full `setTimeout` window. During that window a genuine user
keystroke's `updateSearchValue` is silently dropped. This is not theoretical:
`apps/extension/shared/components/Command/CommandPalette.dom.test.tsx:112-116`
documents and works around it verbatim — "for ~100ms after navigation the
`ignoreSearchUpdate` flag … can swallow the first keystroke … Real users don't
type that fast; wait out the window before typing" — and sleeps 120 ms before
typing to make the test pass.

**Why it matters**
Two authorities for one string is the exact failure mode CLAUDE.md warns about,
and it has already produced a real dropped-input bug that the test suite pins
rather than fixes. Every future change to navigation/Escape/Backspace/restore
has to reason about the flag's lifetime across `setTimeout`, React's controlled
re-render, cmdk's internal `state.search` effect, and the synthetic-event path
simultaneously — in a closed shadow DOM where they can't easily be observed. The
imperative layer earns none of this: the controlled input already does the work.

**Proposed change**
Make Redux (via the controlled `Command.Input`) the single owner of the search
string and delete the imperative layer. Concretely, in `useCommandNavigation.tsx`:

1. Delete `_clearAndResetSearch` (`:26-45`) and the `ignoreSearchUpdate` ref
   (`:87`) and `prevPageRef` (`:88`).
2. `updateSearchValue` becomes unconditional: `dispatch(updateSearchValueAction(search))`
   (drop the flag check at `:194-198`).
3. Delete the page-change sync effect (`:105-120`). The controlled input already
   reflects `currentPage.searchValue` on render, and cmdk's own `[e.value]`
   effect keeps `state.search` (and therefore `Command.Empty`) in sync.
4. In `navigateTo` success (`:221-225`), just `return true` — do not touch the
   DOM. The pushed child page carries `searchValue: ""`
   (`navigation.slice.ts:146`), so the controlled input renders empty.
5. In `navigateBack` (`:237-271`), remove the flag, the `.value` write, and the
   synthetic `input` event. Keep only focus + text-selection, and move it into a
   single effect so it runs *after* React has committed the restored value:

   ```ts
   // Focus the search box on every page change and select any restored text
   // (back-nav restores the parent query; forward-nav is empty, so the range
   // is a no-op). Runs after commit so inputRef.current.value is up to date.
   useEffect(() => {
     const el = inputRef.current
     if (!el) return
     el.focus()
     el.setSelectionRange(0, el.value.length)
   }, [currentPage?.id, inputRef])
   ```

   `navigateBack` then reduces to the guard + `dispatch(navigateBackAction())`.

No slice changes are required — the reducers already produce the correct
`searchValue` for every transition.

**State ownership after the change (implementable as-is):**

- **Single source of truth:** `navigation.pages[last].searchValue` in Redux.
  `Command.Input` is controlled from it; cmdk's internal `state.search` mirrors
  it via cmdk's own effect. There is no other writer.
- **User typing:** keystroke → cmdk `onChange` → `onValueChange` →
  `updateSearchValue` → `updateSearchValueAction` writes Redux → re-render sets
  the input value. No flag, no drop.
- **Page push (`navigateTo`):** thunk pushes a child page with `searchValue: ""`
  → controlled input renders empty → focus effect fires (selects nothing).
- **Back-navigation restore (`navigateBack`):** reducer pops the stack →
  `currentPage` becomes the parent with its retained `searchValue` → controlled
  input renders it → focus effect selects the restored text.
- **Escape / Backspace clearing:** these are page/close intents decided by
  `getPaletteKeyboardCommand` and routed to `navigateBack`/`close`; they never
  write the input directly. Deleting text is ordinary controlled typing (empty
  query → `clearSearchResults`, unchanged).
- **Search-response arrival:** unchanged — `searchCurrentPage.fulfilled` writes
  `searchResults` under the seq/query/page-id guards; rendering keys off Redux.

**Do NOT change / risks**
- Keep `Command.Input` controlled (`value=`/`onValueChange`) — do **not** switch
  to uncontrolled; that would re-introduce a second owner from the other side.
- Do not remove the two **debounced** effects (`:122-149`, `:156-187`); they are
  keyed on the Redux `searchValue` and are correct — only the DOM-poking is
  being removed. The search dispatch was already immune to the synthetic events
  (it never keyed on cmdk's string), so removing them cannot spawn spurious
  searches.
- This is shared-palette behavior: it must be manually regression-checked in
  **both** the content overlay (closed shadow DOM) and new-tab modes.

**Verification**
- Update `CommandPalette.dom.test.tsx`: the "Backspace with a non-empty search
  edits text instead of navigating" test (`:103-129`) must have its 120 ms
  `setTimeout` workaround and the `:112-116` comment **removed** — typing the
  first keystroke immediately after navigation must now register. Add a new test
  "first keystroke immediately after entering a group is not dropped" that
  navigates into a group and types with no delay, asserting the page's
  `searchValue` equals the typed text.
- Keep green: "navigating into a group … clears the search input" (`:52-67`),
  "Backspace on an empty nested search … restores the parent search"
  (`:69-101`), the Escape test (`:131-149`), and all `navigation.slice.test.ts`.
- Manual regression matrix (run in **content overlay** and **new-tab**):
  type on root; enter a group (input clears, focus lands in search); type a
  child query; Backspace-on-empty to go back (parent query restored **and
  selected**); Escape to go back then to close on root; open a form page and
  confirm typing never hides fields; assign a keybinding via the action menu and
  confirm search still restores. Watch specifically for a dropped first keystroke
  after any navigation (the bug being fixed) and for any input/Redux divergence.

**Related**
Feeds PAL-06 (the doc's "requires direct DOM manipulation" claim becomes false).
Interacts with PAL-03 (both simplify the fragile keyboard/search surface; land
PAL-01 first, then PAL-03). No dependency on file 14, but the manual matrix
overlaps the keybinding-capture checks there.

---

### PAL-02: Fix the shadow-DOM-broken `document.querySelector` in the multi-select focus effect

**Priority:** P2     **Effort:** S     **Type:** consistency

**Current state**
`apps/extension/shared/components/Command/CommandItem/CommandItemMulti.tsx:46-52`
focuses the active checkbox with
`document.querySelector(`input[name="${field.id}-…"]`)`. In content-overlay mode
the palette lives in a **closed** shadow root, which `document.querySelector`
cannot pierce (this is exactly why `useInlineInputKeys` resolves the input via
`getRootNode()` — see its comment at `useInlineInputKeys.ts:11-13`). So
Left/Right chip-focus movement in a `multi` inline input silently does nothing in
the overlay; it only works on the new-tab page (normal DOM).

**Why it matters**
It is a real, mode-specific interaction bug in the primary surface, and it is the
kind of thing that stays invisible because tests run in jsdom (light DOM) where
`document.querySelector` works. A new engineer copying this pattern into another
row spreads the breakage.

**Proposed change**
Resolve the query root from an element inside the component instead of `document`.
The fieldset already receives `onKeyDown` — give it a `ref` and query within it,
or resolve `const root = fieldsetRef.current?.getRootNode() as ParentNode`. Since
`useInlineInputKeys` already centralizes shadow-safe lookup, prefer exposing/using
its root-resolution: query with
`(fieldsetRef.current?.getRootNode() ?? document).querySelector(...)`. Keep the
`name`-based selector; only change the root.

**Do NOT change / risks**
- Don't switch to `document`-free logic elsewhere in this file speculatively;
  only the focus effect uses `document`.
- The `focusIndex` state machine and Left/Right wrap-around are correct — leave
  them.

**Verification**
`pnpm run tsc`; manual check: open a group with a `multi` inline input in the
**content overlay**, press Left/Right, confirm focus moves between chips (it
currently does not). Confirm new-tab still works.

**Related**
PAL-03 (same shadow-DOM-lookup class of bug), PAL-04.

---

### PAL-03: Delete the dead, shadow-broken `onInlineInputKeyDown` and route inline arrows solely through `useInlineInputKeys`

**Priority:** P2     **Effort:** S     **Type:** dead-code

**Current state**
`apps/extension/shared/components/Command/CommandItem/index.tsx:163-190 (onInlineInputKeyDown)`
handles ArrowUp/ArrowDown by resolving the search input via
`document.querySelector("input[cmdk-input]")` (`:169`) — shadow-DOM-broken — and
is passed as `onKeyDown` to `CommandItemInput`, `CommandItemSwitch`,
`CommandItemMulti`, and `CommandItemColor`. But every one of those variants calls
`handleCommonKeys(e)` **first** and returns if it handled the key
(`CommandItemInput.tsx:48-49`, `CommandItemSwitch.tsx:41-42,54`,
`CommandItemMulti.tsx:62-64`, `CommandItemColor.tsx:42-43`), and
`handleCommonKeys` (`useInlineInputKeys.ts:56-87`) already handles ArrowUp/Down
(plus Escape/Backspace) and returns `true` for them. Since `onInlineInputKeyDown`
only handles ArrowUp/Down, it is **never reached** — it is dead code, and would
be broken in the overlay if it were reached.

**Why it matters**
`docs/palette-ui-and-navigation.md:383-385` lists
`CommandItem.onInlineInputKeyDown` as one of three active inline-keyboard paths,
so a reader believes there are two live arrow handlers to keep in sync (one of
them shadow-broken). This is a maintenance trap: someone "fixing" arrow behavior
may edit the dead path and see nothing change, or resurrect the broken
`document.querySelector` route.

**Proposed change**
1. Delete `onInlineInputKeyDown` (`index.tsx:163-190`) and stop passing
   `onKeyDown` to the four variants.
2. Drop the now-unused `onKeyDown` prop from `CommandItemInput`,
   `CommandItemSwitch`, `CommandItemMulti`, `CommandItemColor` and their
   `handleKeyDown` fall-through (`if (handleCommonKeys(e)) return; onKeyDown(e)`
   becomes `handleCommonKeys(e)`). `handleCommonKeys` already owns the
   first-selectable-item → focus-search behavior (`useInlineInputKeys.ts:62-65`)
   that `onInlineInputKeyDown` duplicated.
3. Remove the unused `itemRef`-based first-item lookup in `index.tsx` if nothing
   else uses `itemRef` after the deletion (keep `itemRef` if it is still the
   `Command.Item` ref — it is set at `:201`, so keep the ref, remove only the
   lookup inside the deleted handler).

**Do NOT change / risks**
- `CommandItemTextarea` deliberately does **not** use `handleCommonKeys` for
  arrows (it moves the caret and only forwards at the first/last position via
  `forwardArrowToCmdk` — `CommandItemTextarea.tsx:26,76`). Leave it alone.
- Keep the per-variant Left/Right and Enter/Space handlers — they are variant
  contracts, not duplication.

**Verification**
`pnpm run tsc`; `CommandItem.dom.test.tsx` stays green. Manual (both modes): in a
group with inline inputs, ArrowUp/Down from a text/switch/multi/color row still
moves the CMDK selection, and ArrowUp on the first row focuses the search box.

**Related**
PAL-01 (both shrink the fragile keyboard/search surface), PAL-06 (doc update),
PAL-02.

---

### PAL-04: Delete the unused `useSearchInput` hook

**Priority:** P3     **Effort:** S     **Type:** dead-code

**Current state**
`apps/extension/shared/hooks/useSearchInput.tsx:7-23 (useSearchInput)` exports
`getSearchInput`/`focusSearchInput` built on `document.querySelector("input[cmdk-input]")`.
It has **zero consumers** anywhere in `apps/` (verified by grep — the only match
is its own definition). It is also the shadow-DOM-broken `document`-based variant
that `useInlineInputKeys` was written to replace.

**Why it matters**
A dead hook that models the wrong (shadow-broken) lookup pattern is an attractive
nuisance: it looks like the canonical "focus the palette search" helper and will
be imported by the next component that needs it, re-introducing the overlay bug.

**Proposed change**
Delete `apps/extension/shared/hooks/useSearchInput.tsx`. Components needing the
search input use `useInlineInputKeys`'s `getSearchInput`/`focusSearchInput`
(shadow-safe via `getRootNode`).

**Do NOT change / risks**
Confirm no barrel re-exports it (none found). Pure deletion.

**Verification**
`pnpm run tsc` (an import would fail the build); `pnpm test`.

**Related**
PAL-02, PAL-03 (same lookup-pattern hygiene).

---

### PAL-05: Drop the redundant `pages` prop from `CommandContent` (derive count from a single source)

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
`CommandPalette` passes both `pages` and `currentPage` into `CommandContent`
(`apps/extension/shared/components/Command/CommandPalette.tsx:338-350`), and
`CommandContent` also derives the focused suggestion from `currentPage`. Inside,
`pages` is used only for `pages.length` (as `pageCount` in `handleKeyDown` at
`:117`, and forwarded to `CommandHeader` which uses `pages.length > 1`).
`currentPage` is always `pages[pages.length - 1]`. Passing both invites a reader
to wonder whether `currentPage` can ever diverge from `pages` (it cannot).

**Why it matters**
Minor, but it is a derivable-prop smell in the most safety-critical component:
the less independent state flowing through `CommandContent`/`CommandHeader`, the
fewer "can these disagree?" questions during a palette change.

**Proposed change**
Replace the `pages: Page[]` prop with `pageCount: number` (pass
`pages.length`), and have `CommandHeader` take `pageCount` too (it only needs
`pages.length > 1`). `currentPage` stays the single content source. This is a
prop-shape cleanup only.

**Do NOT change / risks**
Do not try to eliminate `currentPage` in favor of indexing `pages` — that would
scatter `pages[pages.length-1]` across the tree, which is worse. Keep
`currentPage` as the passed prop.

**Verification**
`pnpm run tsc`; `CommandPalette.dom.test.tsx` and `paletteKeyboard.test.ts` stay
green (Escape/Backspace still key off page count).

**Related**
—

---

### PAL-06: Correct `docs/palette-ui-and-navigation.md` for the controlled input, the dead inline-key path, and the reducer list

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
Three inaccuracies, two of which stem from PAL-01/PAL-03 and one that is already
wrong today:

1. The "CMDK ↔ Redux Search Synchronization (fragile)" section
   (`docs/palette-ui-and-navigation.md:174-201`) states "CMDK keeps its own
   internal search string … Aligning the two requires **direct DOM manipulation**
   of the `input[cmdk-input]` element, gated behind an `ignoreSearchUpdate` ref".
   The input is in fact a **controlled** `Command.Input` (`value={currentPage.searchValue}`),
   so React already aligns them; the DOM manipulation is redundant (the subject
   of PAL-01), not required.
2. The "Known Issues / Review Notes" bullet
   (`docs/palette-ui-and-navigation.md:383-385`) lists
   `CommandItem.onInlineInputKeyDown` as a live inline-keyboard path; it is dead
   code shadowed by `handleCommonKeys` (PAL-03).
3. The reducer table (`docs/palette-ui-and-navigation.md:100-108`) omits the
   `resetNavigation` reducer (`navigation.slice.ts:444-455`), which the shells
   dispatch on palette close to return to root.

**Why it matters**
This is the doc CLAUDE.md points every engineer to before touching the palette.
Telling them the sync "requires direct DOM manipulation" is precisely the
misconception that keeps the fragile layer alive; listing a dead handler as live
doubles their mental model of the keyboard path.

**Proposed change**
Sequence after PAL-01 and PAL-03 land (so the doc matches code):

1. Rewrite the sync section (`:174-201`) to: the search string is owned by Redux
   (`page.searchValue`); `Command.Input` is controlled from it and cmdk mirrors
   its internal `state.search` from the `value` prop; user typing flows back
   through `onValueChange` → `updateSearchValue`. `navigateBack` restores the
   parent query purely by popping the stack (the controlled input re-renders it);
   a single focus effect then selects the restored text. Keep the
   "manual-regression-in-both-modes" warning.
2. Replace the `onInlineInputKeyDown` bullet (`:383-385`) with: inline arrow/
   Escape/Backspace behavior is centralized in `useInlineInputKeys.handleCommonKeys`;
   only `CommandItemTextarea` deviates (caret-aware forwarding).
3. Add a `resetNavigation` row to the reducer table: "Resets the stack to a fresh
   root page (dispatched on palette close so reopening starts at home)."

**Do NOT change / risks**
Doc-only. If PAL-01/PAL-03 have not landed, apply only edit #3 (the reducer
row) — do not describe the controlled-only model before the code matches it.

**Verification**
Read the edited section against `CommandHeader.tsx:32-42` and the post-PAL-01
`useCommandNavigation.tsx`; confirm the reducer row against
`navigation.slice.ts:444-455`.

**Related**
PAL-01, PAL-03. DOCS file 40.

---

## Non-findings (reviewed, justified)

1. **`searchCurrentPage` staleness guards (hypothesis 2) are complete.** The
   fulfilled reducer (`navigation.slice.ts:538-567`) guards all three race
   classes: response-after-navigation (page-id mismatch, `:545`), out-of-order
   (`payload.seq < currentPage.searchSeq`, `:548-553`), and response-after-clear
   / typed-past (`payload.query !== currentPage.searchValue`, `:557-559`, which
   also covers the emptied-query case since `searchValue` is then `""`). The seq
   counter is a single monotonic ref (`useCommandNavigation.tsx:89,167`); cross-
   page reuse is safe because the page-id guard fires first. `refreshCurrentPage`
   uses the parallel `refreshRequest` stamp (`:475-522`). Tested by
   `navigation.slice.test.ts:152-253` and `CommandPalette.dom.test.tsx:151-199`.
   (See test-gap note below for the two guards without a dedicated unit test.)
2. **`navigation.slice.ts` (635 LOC) is not split-worthy.** It is one cohesive
   state machine — page stack + per-page search state + form values + the two
   async-refresh guards — and its top-of-file architecture block
   (`:1-19`) explains the whole contract in one place. Splitting the stack from
   the search/refresh reducers would scatter interdependent invariants (e.g.
   `updateSearchValue` clearing `searchResults`, `navigateBack` popping while a
   search is in flight) across files with no cohesion win. Leave it whole.
3. **`CommandContent`'s focused-value ↔ action-menu effect and the
   `selectIsCapturing` check (hypothesis 3) are working as intended.** The effect
   (`CommandPalette.tsx:76-87`) auto-closes the menu when cmdk's focused row moves
   away from the row it was opened for; `handleCloseActions` (`:244-259`) keeps it
   open during keybinding capture. This is a genuine cross-concern, but keeping
   the menu open while capture lives inside it is inherent, not accidental — a
   shared capture hook (file 14) could centralize *reading* `isCapturing` but
   cannot remove the coupling. No out-of-sync close was found: opening the menu
   does not change cmdk `state.value`, so the effect does not immediately close
   what it opened. Not worth a refactor on its own; if file 14 introduces a
   capture hook, fold the read there opportunistically.
4. **`CommandActions` using `document.addEventListener` and
   `event.composedPath()` (`CommandActions.tsx:50-71,81-99`) is correct in the
   closed shadow DOM.** Composed events bubble to `document`, and `composedPath()`
   crosses shadow boundaries, so outside-click and Escape detection work in both
   modes. This is the *right* pattern for document-level listeners, unlike the
   `document.querySelector` element lookups flagged in PAL-02/04.
5. **`useCommandPaletteStateRedux` alphabetic-key swallowing and the
   `monocle-ui-hide` double-`requestAnimationFrame`
   (`useCommandPaletteStateRedux.tsx:41-142`) are deliberate and commented.**
   The capture-phase listener and the `!isCapturing` exception are load-bearing
   (page handlers vs capture UI); the two rAFs guarantee the overlay is unmounted
   before a screenshot ack. (Content/new-tab shell wiring around this hook is
   file 21's.)
6. **`CommandList`'s ref-stabilized callbacks and 250 ms typing spinner
   (`CommandList.tsx:78-129`) are justified.** The `onSelectRef`/`suggestionsRef`/
   `formValuesRef` indirection exists to keep memoized `CommandItem` rows from
   re-rendering per keystroke — documented at `:78-80` and mirrored by the row's
   own memo note (`CommandItem/index.tsx:293-296`). Not indirection-for-its-own-
   sake.
7. **`useInlineInputKeys` (hypothesis 5, the surviving hook) is a legitimate
   multi-consumer helper**, not single-consumer indirection: seven inline
   variants use it, and it is the shadow-safe replacement for the deleted
   `useSearchInput`. Keep it. (Only `useSearchInput` — PAL-04 — was the dead
   twin.)
8. **`paletteKeyboard.ts` / `actionMenu.ts` are already correctly factored** as
   pure, unit-tested functions (`paletteKeyboard.test.ts`, `actionMenu.test.ts`);
   no change.
```
