# UI Shells — Content / New-Tab / Options

Scope: the three host shells that mount the shared palette and its ambient
message listeners — the content overlay (`content/scripts.tsx`,
`ContentCommandPalette*`), the new-tab app (`newtab/`), and the options page
(`options/OptionsApp.tsx` + `OptionsShell`) — plus the wiring they share:
`shared/components/Listeners/`, `SurfaceHost`, `ToastContainer`, the
`commandPaletteState.slice`, store/`sendMessage` factory wiring, and the theme
application paths. The palette core and CMDK↔Redux sync belong to file 20; the
navigation slice to 20; the workflow executor and site-SDK internals to file 30;
the automations editor page to file 22; all other slices to file 23.

Findings are roughly priority-ordered.

---

### SHELL-01: Extract a shared `useExecuteCommand` hook for both palette shells

**Priority:** P1     **Effort:** M     **Type:** dedupe

**Current state**
The `executeCommand` callback passed into `CommandPalette` is implemented twice,
nearly line-for-line:
`apps/extension/content/components/ContentCommandPalette.tsx:90-127
(ContentCommandPalette.executeCommand)` and
`apps/extension/newtab/components/NewTabCommandPalette.tsx:47-92
(NewTabCommandPalette.executeCommand)`. Both take the identical
`(id, formValues, navigateBack, parentNames, executionScope)` signature, send
the same `monocle-command-execute` message, branch on `response.success`,
refresh commands, close on `navigateBack`, and `console.error` in a `catch`. The
extraction target already half-exists:
`apps/extension/shared/hooks/commandExecution.ts:92-96
(shouldRefreshCommandsAfterExecution)` is a pure helper, but only the content
shell calls it (`ContentCommandPalette.tsx:108`). The three real differences are:
(1) sender — content uses `useSendMessage()` directly, new-tab wraps it as
`sendMessageWithNewTab` (`NewTabCommandPalette.tsx:28-33`); (2) refresh policy —
content refreshes only when `shouldRefreshCommandsAfterExecution(navigateBack)`
is true, new-tab refreshes on *every* success (`NewTabCommandPalette.tsx:65`);
(3) close semantics — content calls `hideUI(); onClose?.()`, new-tab calls
`onClose()` only if provided (the always-visible palette usually has no
`onClose`). New-tab also carries the settings-reload heuristic that SHELL-02
removes.

**Why it matters**
Two copies of the execute plumbing means every change to the execution contract
(a new field on `monocle-command-execute`, error surfacing to replace the two
`// TODO: Handle errors` comments, a retry) must be made twice and kept in sync;
the copies have *already* drifted (the refresh policy differs, and only one uses
the shared helper). A new engineer reading one shell cannot tell which
differences are intentional lifecycle divergence and which are accidental drift.

**Proposed change**
Add `useExecuteCommand` to `apps/extension/shared/hooks/commandExecution.ts`
(co-located with the pure helpers it already owns), signature:

```ts
export function useExecuteCommand(options: {
  sendMessage: (message: ExecuteCommandMessageWithoutContext) => Promise<{ success?: boolean }>
  refreshCommands: () => Promise<unknown> | unknown
  onClose?: () => void
  // New-tab palette is always visible, so it refreshes after every success to
  // keep dynamic labels current; the overlay tears its page down on close and
  // only refreshes for commands that stay open (remainOpenOnSelect).
  alwaysRefreshAfterSuccess?: boolean
  logPrefix: string
}): (
  id: string,
  formValues: Record<string, string | string[]>,
  navigateBack?: boolean,
  parentNames?: string[],
  executionScope?: CommandExecutionScope,
) => Promise<void>
```

Body: build and send the message, and on `response.success` run
`refreshCommands()` when `alwaysRefreshAfterSuccess || shouldRefreshCommandsAfterExecution(navigateBack)`,
then `if (navigateBack) onClose?.()`. Content passes `onClose: handleClose`
(which already wraps `hideUI(); onClose?.()`) and `alwaysRefreshAfterSuccess:
false`; new-tab passes `sendMessage: sendMessageWithNewTab`,
`alwaysRefreshAfterSuccess: true`, and its `handleClose`. This keeps the exact
current behavior of each shell (the divergence becomes an explicit, named
option, not two silently different functions).

**Do NOT change / risks**
Keep the two shells' *close functions* distinct — content must still call
`hideUI()` (Redux) whereas new-tab must not (it has no open-state to toggle;
see SHELL-05). Do not fold the sender choice into the hook — the new-tab sender
carries `isNewTab` context (SHELL-06) and the content sender does not. Preserve
the `navigateBack` default of `true`. The message wire shape stays byte-identical.

**Verification**
`pnpm run tsc`; add `commandExecution.test.ts` cases asserting: refresh is
skipped when `navigateBack && !alwaysRefreshAfterSuccess`, refresh runs when
`alwaysRefreshAfterSuccess`, and `onClose` fires only when `navigateBack`.
Manual: run a closing action and a `remainOpenOnSelect` action in **both**
content overlay (closed shadow DOM) and new-tab, confirming label refresh and
palette close behavior are unchanged.

**Related**
SHELL-02 (removes the settings-reload branch this hook would otherwise inherit),
SHELL-06 (the sender-context difference the hook parametrizes), file 20 (owns
`useCommandNavigation`, which calls this `executeCommand` via
`buildCommandExecutionRequest`).

---

### SHELL-02: Replace the `id.includes("clock"|"settings")` settings-reload heuristic

**Priority:** P2     **Effort:** S     **Type:** consistency

**Current state**
After a successful execution the new-tab palette does:

```ts
if (id.includes("clock") || id.includes("settings")) {
  import("../../shared/store/slices/settings.slice").then(({ loadSettings }) => {
    _dispatch(loadSettings())
  })
}
```

`apps/extension/newtab/components/NewTabCommandPalette.tsx:69-76
(NewTabCommandPalette.executeCommand)`. This substring match decides whether to
re-hydrate the Redux settings mirror. It is both a correctness smell — any
future command whose id merely contains "settings" or "clock" (e.g. a
hypothetical `open-settings-page` or `clock-widget-add`) false-positives and
triggers a needless reload — and, more importantly, **redundant**: the new-tab
shell already installs a `chrome.storage.local` `onChanged` listener that
re-dispatches `loadSettings()` whenever `monocle-settings` changes
(`apps/extension/newtab/NewTabApp.tsx:80-93 (NewTabAppContent storage effect)`).
Every settings-mutating command (clock toggle, theme cycle) writes
`monocle-settings`, so the storage listener already re-hydrates the mirror. The
heuristic is a second, fragile path to the same effect. The `_dispatch` local
(`NewTabCommandPalette.tsx:26`) exists only to feed it.

**Why it matters**
It reads as load-bearing routing logic ("settings commands need special
handling") when it is actually a redundant belt-and-suspenders reload gated on a
brittle string match. A reader must go verify the storage listener to learn the
branch is unnecessary; a future command author must know to avoid "settings"/
"clock" substrings in ids or accept spurious reloads.

**Proposed change**
Delete lines 69-76 and the now-unused `_dispatch` (`NewTabCommandPalette.tsx:26`)
and its `useAppDispatch` import. Rely on the existing storage-change listener in
`NewTabApp.tsx:80-93`. If a measured latency gap between "storage written" and
"listener fires" ever proves user-visible (it should not — the write and the
`onChanged` event are same-process), the correct replacement is a `Suggestion`
metadata flag surfaced from the `CommandNode` (e.g. `refreshesSettings?: boolean`
carried through to the UI row), *not* an id substring — but do not add that flag
speculatively; remove the heuristic first.

**Do NOT change / risks**
Keep the `fetchCommands()` call on every success
(`NewTabCommandPalette.tsx:65`) — that refreshes dynamic command *labels* (e.g.
"Show Clock" ↔ "Hide Clock") and is separate from the settings mirror. Only the
`loadSettings()` branch is redundant. Update `docs/new-tab-and-theme.md`, which
currently documents this heuristic verbatim (see doc discrepancy DOCS note
below).

**Verification**
Manual: toggle the clock from the new-tab palette and confirm the clock
appears/disappears without reload (proves the storage listener path works);
cycle the theme and confirm it applies. `pnpm run tsc` (catches the orphaned
import).

**Related**
SHELL-01 (the hook should not carry this branch forward), file 40 (doc rewrite
of `new-tab-and-theme.md`'s "`isNewTab` context flag" section).

---

### SHELL-03: Extract the ambient page-listener mount into one shared component

**Priority:** P2     **Effort:** S     **Type:** dedupe

**Current state**
Both shells hand-mount the same set of always-on message listeners.
Content: `apps/extension/content/components/ContentCommandPalette.tsx:148-154`
mounts `CopyToClipboardListener`, `CopyPageAsMarkdownListener`,
`InsertTextListener`, `NewTabListener`, `ScrollListener`, `ScreenshotListener`,
then `ToastContainer`. New-tab: `apps/extension/newtab/NewTabApp.tsx:149-154`
mounts the identical list **minus `CopyPageAsMarkdownListener`**, then
`ToastContainer`. The one-item difference is intentional and justified — the
new-tab page has no external page DOM for `CopyPageAsMarkdownListener` to read
(it Readability-parses `document.body`, which on the new tab is Monocle's own
launcher), so mounting it there would be meaningless. The other six are
byte-identical across both shells.

**Why it matters**
Adding a new content-message listener (or reordering) requires editing two
files and remembering both, and there is no single place that documents "these
are the ambient listeners every palette host mounts." The set has no forcing
function keeping the two lists aligned; a listener added to only one shell would
silently not fire in the other.

**Proposed change**
Add `apps/extension/shared/components/Listeners/PageMessageListeners.tsx`
exporting a component that renders the shared six plus `ToastContainer`, with a
single opt-in prop for the page-only listener:

```tsx
export function PageMessageListeners({
  includePageMarkdown = false,
}: { includePageMarkdown?: boolean }) { /* renders the 6 + optional CopyPageAsMarkdown + ToastContainer */ }
```

Content renders `<PageMessageListeners includePageMarkdown />`; new-tab renders
`<PageMessageListeners />`. The intentional set difference becomes one explicit,
documented prop rather than two divergent JSX blocks.

**Do NOT change / risks**
Do not move `SurfaceHost` into this component — its `kinds` differ per shell
(content: `["overlay","modal","picker"]` in `content/scripts.tsx:15-18`;
new-tab: `["badge"]` in `NewTabApp.tsx:148`) and that difference is a real
runtime concern, not boilerplate. Keep `ToastContainer` inside the new component
so the "always mounted" comment travels with it. The `includePageMarkdown`
default must be `false` so a caller that forgets the prop does not accidentally
run Readability on non-page hosts.

**Verification**
`pnpm run tsc`; existing listener tests stay green. Manual: in the content
overlay run clipboard-copy, insert-text, screenshot, and copy-page-as-markdown;
on the new tab run clipboard-copy and confirm copy-page-as-markdown is absent.

**Related** SHELL-06 (listener runtime-API consistency).

---

### SHELL-04: Extract a shared `useDocumentTheme` hook for new-tab and options

**Priority:** P2     **Effort:** S     **Type:** dedupe

**Current state**
The new-tab and options shells contain the same three theme effects. New-tab:
`apps/extension/newtab/NewTabApp.tsx:64-77 (NewTabAppContent theme effects)` —
`applyThemeToDocument(themeMode)` on `themeMode` change, plus
`setupSystemThemeListener` guarded on `themeMode === "system"`. Options:
`apps/extension/options/OptionsApp.tsx:52-60 (OptionsAppContent theme effects)`
— identical two effects. Both select `themeMode` via `selectThemeMode`. The
logic is duplicated verbatim.

**Why it matters**
Theme application is the kind of cross-cutting behavior that must stay identical
across every full-DOM shell; having it copy-pasted means a fix (e.g. handling a
new theme mode, or a cleanup-timing bug in the system listener) can land in one
shell and be forgotten in the other. It is also the subtlest correctness surface
in these shells (the `system` re-apply path), so a single tested implementation
is worth more here than elsewhere.

**Proposed change**
Add `useDocumentTheme(themeMode: ThemeMode)` to `apps/extension/shared/utils/`
(a new `shared/hooks/useDocumentTheme.ts`, or exported from a hooks barrel)
containing exactly the two effects. New-tab and options each replace their
`useEffect` pair with `useDocumentTheme(themeMode)`.

**Do NOT change / risks**
Do **not** pull the content shell's theme handling into this hook. Content
themes the *shadow host* element from raw storage in the entrypoint before React
mounts (`apps/extension/entrypoints/content.tsx:32-59 (onMount applyTheme)` via
`applyThemeToHost`), which is a genuinely different mechanism (host `classList`,
not `document.documentElement`, and pre-React so the overlay is never
unstyled) — see the Non-findings. Do not fold the *storage-change* listeners
into this hook: new-tab's reloads only `monocle-settings`
(`NewTabApp.tsx:80-93`) while options' reloads six slices
(`OptionsApp.tsx:62-107`); those are legitimately shell-specific and out of
scope here.

**Verification**
`pnpm run tsc`; manual theme switch (light/dark/system, plus OS-preference flip
while in `system`) on both the new-tab page and the options page.

**Related** file 23 (settings slice / `selectThemeMode`), file 40
(`new-tab-and-theme.md` theme section).

---

### SHELL-05: Document that `commandPaletteState` is content-overlay-only

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
Palette open/close state lives in `apps/extension/shared/store/slices/
commandPaletteState.slice.ts:11-27 (commandPaletteStateSlice)` and is consumed
only through `apps/extension/shared/hooks/useCommandPaletteStateRedux.tsx:21-145
(useCommandPaletteStateRedux)`, which in turn is used only by the content
overlay (`ContentCommandPalette.tsx:44`). The new-tab palette holds no open
state at all — it is always mounted and visible (`NewTabApp.tsx:122-124`) — and
the options shell has no palette. The slice is registered in every store
(`shared/store/index.ts:24`) but is inert outside the content overlay.

**Why it matters**
A reader encountering a Redux slice named `commandPalette` reasonably assumes it
governs the palette in all three shells and may try to "fix" the new-tab palette
to use it, or wire an options palette to it — both wrong. The divergence
(overlay = toggled via Redux + keyboard + background messages; new-tab =
always-on, no open state) is correct and dictated by the different lifecycles,
but nothing in the code says so. This is the resolution of the "converge open-
state ownership" hypothesis: do **not** converge — the lifecycles genuinely
differ — but make the intent explicit.

**Proposed change**
Add a top-of-file comment to `commandPaletteState.slice.ts` and to
`useCommandPaletteStateRedux.tsx`, e.g.:

```
// Open/close state for the CONTENT OVERLAY palette only. The new-tab palette is
// always mounted and visible (NewTabApp) and deliberately has no open-state; the
// options page has no palette. Do not wire those shells to this slice.
```

No behavior change.

**Do NOT change / risks**
Do not remove the slice from the new-tab/options stores — `createAppStore`
builds one reducer map for all shells, and carving out per-shell stores is not
worth it for one inert slice. Do not attempt to give the new-tab palette an
open-state.

**Verification** Comment-only; `pnpm run fmt:check`.

**Related** SHELL-01 (close-function divergence), file 20 (palette navigation).

---

### SHELL-06: Centralize `isNewTab` context stamping in the new-tab shell

**Priority:** P3     **Effort:** M     **Type:** consistency

**Current state**
`isNewTab: true` is threaded through the new-tab shell by hand in five separate
places: the store sender (`apps/extension/newtab/NewTabApp.tsx:162
(createPaletteSendMessage)`), the command fetch
(`NewTabCommandPalette.tsx:24 (useGetCommands)`), the execute sender wrapper
(`NewTabCommandPalette.tsx:28-33 (sendMessageWithNewTab)`), the keybinding hook
(`NewTabCommandPalette.tsx:37 (useGlobalKeybindings)` → resolved at
`shared/hooks/useGlobalKeybindings.tsx:98-100 (getContextOverride)`), and the
background-image request (`newtab/components/BackgroundImage.tsx:30-38`, which
hand-builds the whole `context` object inline including `isNewTab: true`). Any
new new-tab sender that forgets the flag silently sends normal-page context,
which the background uses to gate new-tab-only commands and to bypass URL
filtering — a silent-wrong-behavior class of bug, not a compile error.

**Why it matters**
Five hand-copies of the same context flag is fragile: the failure mode is silent
(commands quietly missing or URL rules quietly applying on the new tab), and it
is exactly the kind of leak that surfaces only in manual testing. `BackgroundImage`
even bypasses `useSendMessage` entirely to restamp the full context, duplicating
the base-context assembly that `useSendMessage`/`createPaletteSendMessage`
already own.

**Proposed change**
Provide the new-tab context override once, at the shell root, and have the
messaging seams read it instead of each caller passing it. Minimal, non-
speculative option: add a small React context, e.g.
`shared/hooks/PaletteContextProvider` carrying `Partial<Browser.Context>`, that
`useSendMessage` merges into its base context; `NewTabApp` wraps its subtree in
`<PaletteContextProvider value={{ isNewTab: true }}>`, and the per-call
`{ isNewTab: true }` overrides in `useGetCommands`, `sendMessageWithNewTab`, and
`useGlobalKeybindings` drop away. Switch `BackgroundImage` to `useSendMessage`
so it inherits the same context instead of hand-building one. The store-level
`createPaletteSendMessage({ isNewTab: true })` stays as-is (it feeds thunks,
which are outside React and cannot read context) — that dual sender is a
documented, justified split (see Non-findings), so this finding only removes the
*hook-side* repetition.

**Do NOT change / risks**
This is a judgment call bordering on over-engineering — if the reviewer/
implementer judges the five sites low-churn, record it as accepted and stop; do
not build the provider "for later." Do **not** merge `useSendMessage` and
`createPaletteSendMessage` (the hook carries live modifier-key tracking the
factory must not grow — see file 12 MSG-04). Coordinate ordering with MSG-04,
which types the send boundary but explicitly keeps the two senders separate.

**Verification**
`pnpm run tsc`; manual: on the new tab, confirm new-tab-only commands (Clock)
still appear, URL-rule-filtered commands are not hidden, a new-tab command's
custom keybinding fires, and the background image still loads.

**Related** file 12 MSG-04 (types the send boundary; do not duplicate the
merge), file 40 (`new-tab-and-theme.md` `isNewTab` section).

---

### SHELL-07: Use `getBrowserAPI().runtime` consistently in the listener components

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
The ambient listeners split between two ways of reaching the runtime API. Five
use the bare `chrome.runtime` global:
`Listeners/CopyToClipboardListener.tsx`, `InsertTextListener.tsx`,
`NewTabListener.tsx`, `ScrollListener.tsx`, `ScreenshotListener.tsx` (each
`chrome.runtime.onMessage.addListener` / `removeListener`). Two use the repo's
cross-browser accessor `getBrowserAPI().runtime`:
`shared/components/ToastContainer.tsx:41-42` and
`shared/hooks/useCommandPaletteStateRedux.tsx:138-139`. `getBrowserAPI()` returns
`typeof chrome` (`shared/utils/extension-api.ts:6`), so the two are
type-equivalent and work today, but the mixed style is a consistency wart in a
tightly-related file group.

**Why it matters**
The repo convention (CLAUDE.md: "UI code uses typed background messages, never
browser-only behavior directly") funnels browser access through
`getBrowserAPI()`; the bare-`chrome` listeners are the odd ones out, and a reader
cannot tell whether the difference is deliberate (it is not). Low stakes, but
it is a five-line cleanup in explicitly in-scope files.

**Proposed change**
In the five bare-`chrome` listeners, import `getBrowserAPI` from
`../../utils/extension-api` and replace `chrome.runtime` with a
`const runtime = getBrowserAPI().runtime` local (matching `ToastContainer`).

**Do NOT change / risks**
Purely a call-site swap; no behavior change. Do not touch the message-handling
bodies or the `validateContentMessage` guards.

**Verification** `pnpm run tsc`; existing listener tests stay green.

**Related** SHELL-03 (same file group).

---

## Non-findings (reviewed, justified)

- **Dual message senders (`createPaletteSendMessage` store factory vs
  `useSendMessage` hook).** Both shells use both: thunks get the store factory,
  the React palette gets the hook. Justified and already documented in
  `shared/store/sendMessage.ts:1-8` — thunks run outside React and cannot use a
  hook, and the hook adds live modifier-key tracking the factory must not grow.
  Typing (not merging) this boundary is file 12 MSG-04.

- **Content themes the shadow host from raw storage in the entrypoint; new-tab/
  options theme `document.documentElement` via Redux.** Not duplication to
  unify: the content overlay lives in a closed shadow root whose `:host` must be
  themed *before* React mounts (`entrypoints/content.tsx:32-59` via
  `applyThemeToHost`), so it reads `monocle-settings` directly and cannot depend
  on the Redux hydration path the full-DOM shells use. SHELL-04 dedupes only the
  two document-mode shells.

- **New-tab omits `CopyPageAsMarkdownListener`.** Intentional — that listener
  Readability-parses `document.body`, which on the new-tab page is Monocle's own
  launcher, not an external document. Captured as the single opt-in prop in
  SHELL-03.

- **New-tab palette has no open-state slice.** It is always mounted and visible;
  an open/close model would be dead state. Divergence from the content overlay
  is lifecycle-driven and correct — SHELL-05 documents it rather than converging.

- **`entrypoints/*/main.tsx` one-liners** (`import "../../newtab/scripts"` etc.).
  Thin shims over `newtab/`, `content/`, `options/` are the stated repo
  convention (`new-tab-and-theme.md`); leave them.

- **Options routing (`OptionsApp.tsx:112-130`, `OptionsShell` navItems).** Flat
  wouter `Switch` with a catch-all `Redirect` and a static `navItems` table;
  clean, exhaustive, and consistent. `settings-page.md:494-496` documents the
  wouter/hash-routing choice deliberately. No issue.

- **`SurfaceHost` single generic renderer.** One component turning declarative
  surface data into DOM, kind-filtered per shell via the `kinds` prop; this is
  the intended design (`docs/surfaces.md`) and the correct shape. Host parts in
  scope reviewed; no shell-level change needed.

- **`Clock` `setInterval(…, 1000)` self-tick** (`newtab/components/Clock.tsx`).
  Simple and correct for a wall clock. The "live clock" future item in
  `docs/calculations.md:76` concerns a *calculation-result* clock rendered
  through `ContentBlock`, a different component — it does not pressure this one.

---

## Notes for the summary / cross-file

**Doc discrepancies (for file 40 / DOCS):**
- `docs/new-tab-and-theme.md` documents the `id.includes("clock") ||
  id.includes("settings")` reload as intended behavior ("client-side
  post-execution hook"). SHELL-02 removes it; the doc's `isNewTab` section must
  be rewritten to describe reliance on the storage-change listener instead.
- `docs/new-tab-and-theme.md`'s "Listener components" row lists the exact
  new-tab listener set; if SHELL-03 lands, update it to name
  `PageMessageListeners` and the `includePageMarkdown` distinction.

**Test gaps noticed (for file 41 / TEST):**
- No test covers the execute→refresh→close policy in either palette shell;
  SHELL-01's proposed `commandExecution.test.ts` cases would be the first.
- No test asserts new-tab settings re-hydrate via the storage-change listener
  (the behavior SHELL-02 relies on after removing the heuristic).
- No regression test for the ambient listener set per shell (SHELL-03) — the
  one-item difference is enforced only by convention.

**Interactions with documented future work (for file 42 / FUT):**
- Live-clock future item (`docs/calculations.md:76`) touches the calculations
  `ContentBlock` path, **not** `newtab/components/Clock.tsx` — no conflict with
  any finding here.
- SHELL-06 must be sequenced with file 12 MSG-04 (send-boundary typing); neither
  should merge the two senders.
