# 23 — UI State Management (`STATE`)

Scope: `apps/extension/shared/store/` (store setup, hooks, `sendMessage`
plumbing, and every slice except `navigation.slice.ts` (pass 20) and
`commandPaletteState.slice.ts` (pass 21)): `settings.slice`,
`settingsCatalog.slice`, `snippets.slice`, `automations.slice`,
`features.slice`, and `keybinding.slice` (slice-shape only — pass 14 owns its
domain). Also `shared/hooks/` (single-consumer / consistency audit) and
`options/hooks` + `options/lib`. Background counterparts
(`background/features/config.ts`, `state.ts`, `background/commands/settings.ts`)
were read read-only for the ownership map; their internals belong to pass 13.

The store layer is in good shape overall: five async slices already share one
posture (`extra.sendMessage` → typed background message → `rejectWithValue`
envelope → optimistic reducer), the feature-state sync channel that seeded
hypothesis 2 predicted missing already exists, and permission staleness is
cosmetic exactly as the architecture claims. The findings below are three
consistency/dedup cleanups; the largest is the lone slice that reaches past the
message layer into `chrome.storage.local`.

---

### STATE-01: Route `settings.slice` writes through the background message layer instead of writing `chrome.storage.local` directly

**Priority:** P2     **Effort:** M     **Type:** consistency

**Current state**
Four of the five async slices persist through the background message layer via
the thunk `extra.sendMessage` (`settingsCatalog`, `snippets`, `automations`,
`features`). `settings.slice` is the exception: it imports `getBrowserAPI` and
writes `monocle-settings` directly from the UI process. `updateThemeMode`
(`apps/extension/shared/store/slices/settings.slice.ts:114-143`),
`updateClockVisibility` (`:146-180`), and `updateBackgroundCategories`
(`:183-214`) each do an un-serialized read-modify-write:
`browserAPI.storage.local.get(STORAGE_KEY)` → spread-merge → `set`.
`loadSettings` (`:62-81`) reads the same key directly.

The background already owns locked writers for exactly these fields, and they
share the `monocle-settings` key with command settings:
`apps/extension/background/commands/settings.ts:255-269 (updateThemeSettings)`,
`:287-298 (updateNewTabSettings)`, and `:318-330 (updateNewTabClockSettings)`
each run inside `withStorageLock(STORAGE_KEY, …)`
(`apps/extension/background/commands/settings.ts:119-120` header;
`:162-188 (updateCommandKeybindings)` is a sibling writer on the same key). The
slice header comment even says it "mirrors background/commands/settings.ts"
(`settings.slice.ts:14-15`), implying a read-only mirror when it is in fact a
second, unlocked *writer* of that key.

**Why it matters**
`monocle-settings` has two writers on two different processes: the options-page
UI (unlocked, here) and the background worker (locked). `withStorageLock` is an
in-process mutex in the background worker — it cannot serialize against a
`chrome.storage.local.set` issued from the options page. So a theme toggle whose
`get` runs before a concurrent background keybinding save, but whose `set` runs
after it, silently drops the keybinding write (or vice-versa). Both edits
originate from the same options page (theme lives on GeneralPage/NewTabPage,
keybindings on KeyboardPage), so an in-flight background settings write racing a
theme change is a real, if low-probability, lost-write. Beyond the race, this is
the one slice that violates the documented boundary ("Settings persistence goes
through `background/commands/settings.ts`"; "UI code uses typed background
messages, never browser-only behavior directly") and re-implements
merge/spread logic that already exists, locked, in the background.

**Proposed change**
Add one message and wire it to the existing locked background writers — no new
persistence logic.

1. Add a `monocle-settings-update` message to `shared/types/messaging.ts`
   carrying a partial settings patch, e.g.
   `{ type: "monocle-settings-update"; theme?: Partial<ThemeSettings>; newTab?: Partial<NewTabSettings> }`,
   plus its `UpdateSettingsResponse` (`{ success: true; theme: ThemeSettings; newTab: NewTabSettings }`).
   (Coordinate the exact envelope with pass 12 — this is a new router entry.)
2. Add a handler in `apps/extension/background/messages/settings.ts` (new file
   or the nearest existing settings-message file) built with
   `createMessageHandler`, following
   `apps/extension/background/messages/features.ts:16-40 (handleUpdateFeatureConfig)`.
   It dispatches to the existing locked updaters: `theme` →
   `updateThemeSettings`, `newTab.clock` → `updateNewTabClockSettings`,
   `newTab.backgroundCategories` → `updateNewTabSettings`. Return the freshly
   read `getThemeSettings()` / `getNewTabSettings()`.
3. Convert the three write thunks to `extra.sendMessage` (matching the other
   four slices; also see STATE-02's helper). `loadSettings` can stay a direct
   read, or move to a `monocle-settings-get` for full boundary consistency —
   reads are not the lost-write hazard, so this is optional and can be a
   follow-up.
4. Drop the now-unused `getBrowserAPI`/`browserAPI` import from
   `settings.slice.ts` once no thunk touches storage directly.

**Do NOT change / risks**
`loadPermissions`/`refreshPermissions` already go through
`monocle-permissions-get` (`settings.slice.ts:17-19, 84-111`) — leave them.
Storage key and shape stay byte-identical (`monocle-settings`), so no
migration. Preserve the exact default-fallback merge the reducers apply on load
(`settings.slice.ts:232-247`) — theme defaults to `"system"`, clock to
`show: true`. Do not fold command-settings writes into this message; those
already have their own handlers. The `preloadedState` in `createAppStore`
(`shared/store/index.ts:38-81`) must stay in sync with `initialState`.

**Verification**
`pnpm run tsc`, `pnpm run fmt:check`. New test:
`apps/extension/background/messages/settings.test.ts` asserting
`monocle-settings-update` with a theme patch calls the locked updater and
leaves command settings on the same key untouched (write a `commands` entry
first, update theme, assert both survive — this is the regression the race
would break). Manual: change theme on the options General page and confirm it
persists across reload and applies in the new-tab page (which reloads on
`monocle-settings` `onChanged`, `newtab/NewTabApp.tsx:82`).

**Related**
Pass 12 (`MSG`) owns the router entry and MSG-04's send-boundary typing — the
new message rides that boundary. Pass 13 FEAT-02 is the background twin of this
lost-write class (locked read-modify-write helpers). Touches the CLAUDE.md
"Settings persistence" boundary claim — flag to pass 40 if it needs a doc note.

---

### STATE-02: Collapse the repeated async-thunk message envelope into a shared `createMessageThunk` factory

**Priority:** P2     **Effort:** M     **Type:** dedupe

**Current state**
Four slices define an identical private `getSendMessage(extra)` accessor and an
identical local `ThunkApi` type, then repeat the same try / error-envelope /
catch body in every thunk:

- `apps/extension/shared/store/slices/settingsCatalog.slice.ts:10-12 (CatalogThunkApi)`,
  `:28-29 (getSendMessage)`, six thunks (`:31-206`).
- `apps/extension/shared/store/slices/snippets.slice.ts:10-12 (SnippetsThunkApi)`,
  `:28-29 (getSendMessage)`, four thunks (`:31-123`).
- `apps/extension/shared/store/slices/automations.slice.ts:20-22 (AutomationsThunkApi)`,
  `:42-43 (getSendMessage)`, five thunks (`:45-163`).
- `apps/extension/shared/store/slices/features.slice.ts:9-11 (FeaturesThunkApi)`,
  `:27-28 (getSendMessage)`, three thunks (`:30-111`).

That is 18 thunks, each ~10 lines of identical scaffolding, plus four duplicate
`*ThunkApi` type aliases — when `ThunkApi` is already exported from
`apps/extension/shared/store/index.ts:12-14` and consumed by `navigation.slice`
(`navigation.slice.ts:27, 101, 185, 279`). Every thunk body is:

```ts
try {
  const response = (await getSendMessage(extra)({ type: "…", …args })) as R & { error?: string }
  if (response?.error) return rejectWithValue(response.error)
  return <map response>
} catch (error) {
  return rejectWithValue(error instanceof Error ? error.message : "Failed to …")
}
```

Only three things vary: the message object, the success mapping, and the
fallback error string.

**Why it matters**
This is real repetition (≈180 lines), not a 3-line tax, and it fans out with
every new snippet/automation/feature/catalog operation — the next author
copy-pastes the envelope and the private `getSendMessage`, and any fix to the
error-envelope contract (e.g. handling a new `{ error, code }` shape) has to be
applied 18 times. The four divergent `ThunkApi` aliases also mean a reader can't
tell whether the differences are meaningful (they are not — all four are
structurally `{ sendMessage }`).

**Proposed change**
Add `apps/extension/shared/store/messageThunk.ts`:

```ts
import { createAsyncThunk } from "@reduxjs/toolkit"
import type { ThunkApi } from "./index" // type-only; no runtime cycle

// Wraps the shared send → error-envelope → rejectWithValue scaffolding that
// every message-backed thunk repeats. `build` returns the full message
// (including `type`); `map` shapes the fulfilled payload; `fallbackError` is
// used only when the transport throws with a non-Error. Control flow is
// identical to the hand-written thunks: an `{ error }` envelope rejects, a
// thrown transport error rejects, anything else fulfils with `map`.
export const createMessageThunk = <Returned, Arg = void>(
  typePrefix: string,
  build: (arg: Arg) => Record<string, unknown>,
  map: (response: any, arg: Arg) => Returned,
  fallbackError: string,
) =>
  createAsyncThunk<Returned, Arg, { extra: ThunkApi; rejectValue: string }>(
    typePrefix,
    async (arg, { extra, rejectWithValue }) => {
      try {
        const response = (await extra.sendMessage(build(arg))) as any
        if (response && "error" in response && response.error) {
          return rejectWithValue(response.error as string)
        }
        return map(response, arg)
      } catch (error) {
        return rejectWithValue(
          error instanceof Error ? error.message : fallbackError,
        )
      }
    },
  )
```

Before (`snippets.slice.ts:53-75`) → after:

```ts
export const addSnippet = createMessageThunk<Snippet, { name: string; body: string }>(
  "snippets/add",
  ({ name, body }) => ({ type: "monocle-snippet-add", name, body }),
  (r: AddSnippetResponse) => r.snippet,
  "Failed to add snippet",
)
```

Convert all 18 thunks, one slice per commit; delete each slice's
`*ThunkApi` alias and `getSendMessage`. Widen `ThunkApi.sendMessage` in
`index.ts` from `(message: any) => Promise<any>` to
`(message: unknown) => Promise<unknown>` to match what the per-slice aliases
already assert (or leave as-is if pass 12/MSG-04 is about to type it — see
Related).

**Do NOT change / risks**
Keep each thunk's exact generic signature and its `map` output byte-identical —
several are load-bearing (`settingsCatalog`'s
`setCatalogCommandKeybindings` filters conflicted ids at `:160-171`; it stays a
custom `map` callback, the factory does not flatten it). Reducers key off
`action.meta.arg` and `action.payload` shapes — those are unchanged. The
`load`-style thunks use `"error" in response && response.error` while mutations
use `response?.error`; the factory's `response && "error" in response &&
response.error` covers both — verify each converted thunk still rejects on the
error envelope. Do NOT push the reducer/`extraReducers` wiring into the factory;
this finding only removes the async-body scaffolding.

**Verification**
`pnpm run tsc`, `pnpm test`. Add
`apps/extension/shared/store/messageThunk.test.ts`: a fulfilled path, an
`{ error }`-envelope rejection, and a thrown-transport rejection (asserting the
`fallbackError`). Existing option-page flows (add/edit/delete snippet,
automation, feature toggle, catalog hide/favorite/keybinding/urlRules) must
behave identically — exercise via the options page.

**Related**
Pass 12 (`MSG`) MSG-04 types the send boundary; if it lands first, the factory's
`build` return type and the `as any` cast can tighten to the message union and
`map` can take the typed response — land STATE-02 either before (independent) or
after (tighter) MSG-04, not concurrently on the same files. Depends on nothing
in this file; STATE-03 can fold into the same conversion commits.

---

### STATE-03: Extract the four verbatim copies of the `setUpdating` / `updatingIds` toggler

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
The same 10-line "add id if updating, else filter it out" helper is copy-pasted
into four slices:
`apps/extension/shared/store/slices/settingsCatalog.slice.ts:208-221 (setUpdating)`,
`apps/extension/shared/store/slices/snippets.slice.ts:125-134 (setUpdating)`,
`apps/extension/shared/store/slices/automations.slice.ts:165-178 (setUpdating)`,
`apps/extension/shared/store/slices/features.slice.ts:113-121 (setUpdating)`.
`automations.slice.ts:180-193 (setRunning)` is the identical shape against
`runningIds`. All operate on a `string[]` of in-flight ids.

**Why it matters**
Five verbatim copies of a mutation helper is exactly the kind of drift trap a
new list-oriented slice inherits by copy-paste; a future tweak (e.g. dedup via a
`Set`, or tracking a count for re-entrant updates) has to be repeated five
times. It also inflates each slice, obscuring the parts that are genuinely
per-domain.

**Proposed change**
Add `apps/extension/shared/store/updatingIds.ts`:

```ts
// Toggle membership of an id in an in-flight-tracking string[] (updatingIds,
// runningIds). Idempotent on add; safe on remove of an absent id.
export const toggleId = (ids: string[], id: string, on: boolean): string[] =>
  on
    ? ids.includes(id)
      ? ids
      : [...ids, id]
    : ids.filter((current) => current !== id)
```

Replace each `setUpdating(state, id, true/false)` call with
`state.updatingIds = toggleId(state.updatingIds, id, on)` (and `runningIds`
likewise in `automations`). Note the current helpers mutate in place via
`push`/reassignment inside Immer; `toggleId` returns a new array and the caller
reassigns — both are Immer-safe. Delete the five local helpers.

**Do NOT change / risks**
Behavior is identical (idempotent add, filter remove). Do not change what the
reducers track or when they call it. Leave `keybinding.slice` alone — it has no
list state. If STATE-02 is in flight, do these edits in the same commits to
avoid re-touching the four files twice.

**Verification**
`pnpm run tsc`, `pnpm test`. Add a tiny
`apps/extension/shared/store/updatingIds.test.ts` (add, add-again idempotent,
remove, remove-absent). Existing slice-driven option flows unchanged.

**Related**
STATE-02 (same four files; batch the edits). No behavior contract or future-work
interaction.

---

## Non-findings (reviewed, justified)

- **Feature-state sync channel is missing (seeded hypothesis 2) — refuted.**
  The options page already re-hydrates every slice from a
  `chrome.storage.local.onChanged` listener that maps storage keys to load
  thunks: `monocle-feature-config`/`monocle-feature-state` →
  `loadFeatures()`, plus `monocle-settings`, `monocle-favoriteCommandIds`,
  `monocle-commandUsage`, `monocle-snippets`, `monocle-automations`
  (`apps/extension/options/OptionsApp.tsx:62-107`). So a palette command that
  saves a tab group or starts a focus session, or a surface gesture that adds an
  Element Hider rule, refreshes the open options page without a reload — this is
  the exact channel hypothesis 2 predicted absent, and it matches the repo's
  `onChanged`-driven pattern (`newtab/NewTabApp.tsx:82`,
  `entrypoints/content.tsx:51`). The content/new-tab palette surfaces
  feature *runtime* state through `monocle-surfaces-changed` + `SurfaceHost`,
  and re-fetches commands on open, so it has no stale-runtime-state window
  either. The one edge the listener does not cover is
  `monocle-extension-registrations` (peer command *trees*, distinct from the
  peer-approval config in `monocle-feature-config`); the Integrations page shows
  approved/pending peers (which ride feature-config/state and *are* covered), so
  a peer registering new commands while the page is open is the only miss — too
  niche to spec a channel for, and pass 13 FEAT-01 already reworks that path.
  Coordinated with pass 13's "no push channel" non-finding, which explicitly
  deferred the options-freshness call to this pass: the answer is the channel
  already exists and is sufficient.

- **Permissions truth is authoritative in the background; Redux mirror is
  cosmetic (seeded hypothesis 4) — confirmed.** `usePermissionsGranted`
  (`apps/extension/shared/hooks/usePermissionsGranted.tsx:26-63`) throttle-
  refreshes via `refreshPermissions` and reads `selectPermissions`, but every
  consumer uses it only to render grant affordances — `CommandItem`,
  `CommandActions`, `CommandName`, `PermissionActions`. No protective code path
  trusts the Redux mirror: command execution re-checks permissions in the
  background before protected work (per architecture), and the browser
  permission API is authoritative. The module-level
  `lastPermissionRefreshAt` throttle (`:23-24`) is shared across all hook
  instances, but `fetchPermissions` always returns the *full*
  `PermissionSettings`, so a throttled second consumer still sees fresh data via
  the shared Redux slice — self-healing, not a bug.

- **Single-consumer shared hooks (seeded hypothesis 5) — only `useActionLabel`,
  and it earns its place.** Consumer counts: `usePermissionsGranted` 4,
  `useToast` 5, `useCopyToClipboard` 3, `useGetCommands` 2 (content + new-tab),
  `useOpenPaletteAtCommand` 2 (content + new-tab),
  `useIsModifierKeyPressed` 2 (`useSendMessage`, `useActionLabel`),
  `useCatalogCommandActions` 4 (options pages). Only `useActionLabel`
  (`apps/extension/shared/hooks/useActionLabel.tsx:5-46`) has a single consumer
  (`CommandPalette.tsx`), but it is a cohesive derivation that reaches into
  cmdk's `useCommandState` and branches on modifier + suggestion type; inlining
  it into `CommandPalette` would bury ~40 lines of focus-label logic in an
  already-large component and lose its testability seam. Keep as-is.

- **Derived fields cached in `settingsCatalog` (`effectiveKeybinding`,
  `capabilities.hasUrlRules`) — leave.** These are re-derived optimistically in
  reducers (`settingsCatalog.slice.ts:289-292, 329-336`) rather than via a
  selector. They are, however, *projected by the background* into the
  `SettingsCatalogCommand` descriptor; the reducer patch exists only to keep the
  mirror truthful between an optimistic update and the next
  `loadSettingsCatalog`. Turning them into selectors would split one projection
  across the background/UI boundary and force every read site (catalog rows,
  `options/lib/catalog.ts` filters) to recompute — more fragmentation, not less.

- **`keybinding.slice` shape differs from the four async slices — correct.** It
  has no `loading`/`error`/`updatingIds` because it is pure synchronous UI
  capture state (`isCapturing`, `targetCommandId`, `requirements`)
  (`keybinding.slice.ts:5-11`) with no thunks. It also uses RTK's `selectors`
  block rather than free selector functions; that is a defensible local choice
  for a self-contained UI slice and not worth normalizing. Pass 14 owns its
  domain behavior.

- **`settings.slice` uses a single `loading` boolean rather than
  `updatingIds`.** Its writes are singletons (theme mode, clock, background
  categories), not per-id list rows, so an id-keyed in-flight set does not
  apply. A shared `loading` that flips on every settings write is acceptable for
  a settings form and not a fragmentation smell.

- **`automations.slice` extra fields `runningIds` + `lastRunResult`
  (`automations.slice.ts:29-30`) — genuine domain state.** They back the
  "Test on Active Tab" feedback in the builder (documented in the slice header
  `:1-7`); this is real per-automation transient UI state, not accidental
  divergence from the snippets slice it is modeled on. `setRunning` is folded
  into STATE-03's `toggleId`.

- **`createPaletteSendMessage` vs the `useSendMessage` hook — both justified.**
  `shared/store/sendMessage.ts:9-21` is the non-hook context-stamped sender for
  store wiring (`createAppStore` extraArgument); `useSendMessage`
  (`shared/hooks/useSendMessage.tsx:68-103`) is the React sender that also reads
  the live modifier key. The header comment already explains the split; they are
  not redundant.
</content>
</invoke>
