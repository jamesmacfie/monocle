# 13 — Background Features and Storage (`FEAT`)

Scope: `background/features/` (registry, config/state tiers, focus, tabGroups,
elementHider, extensionRegistry; nativeMessaging skimmed for registry-contract
consistency only — internals owned by pass 31), `background/surfaces.ts`, the
`createStorageArea` / `withStorageLock` primitives, and the cross-cutting audit
of every storage consumer (settings, favorites, usage, snippets, automations,
feature config/state, extension registrations, surfaces). Message-handler
review here is registry-facing behavior only; router ergonomics belong to
pass 12.

---

### FEAT-01: Make palette enable/disable of Extension Integrations run the same disable cleanup as the settings page

**Priority:** P0     **Effort:** S     **Type:** consistency

**Current state**
`onConfigChange` is invoked from exactly one place: the settings-page message
path, `apps/extension/background/messages/features.ts:22-40
(handleUpdateFeatureConfig)` at line 37. The extension-registry feature relies
on it to drop cached peer command trees and rebuild the search index when the
feature is turned off:
`apps/extension/background/features/extensionRegistry/index.ts:107-115
(onConfigChange)`. But the feature's own palette commands write config with a
bare `setFeatureConfig`, bypassing `onConfigChange` entirely:
`apps/extension/background/features/extensionRegistry/commands.ts:25-31
(setEnabled)` and `:46-57 (disableCommand)`. The file's header comment even
claims the opposite — "disabling also drops cached peer trees, handled by the
module's onConfigChange"
(`apps/extension/background/features/extensionRegistry/commands.ts:1-5`).
Cached trees are durable and warmed into an in-memory cache at startup
(`apps/extension/background/commands/extensionSdk/registry.ts:32-38
(initExtensionRegistry)`), and the sync command loader reads them without
checking the `enabled` flag
(`apps/extension/background/commands/extensionSdk/index.ts:20-23
(loadExtensionSdkCommands)`). Native Messaging shows the intended pattern: its
palette commands duplicate the port side-effects explicitly
(`apps/extension/background/features/nativeMessaging/commands.ts:41-63
(enableCommand/disableCommand)`), and its module comments document that
convention (`apps/extension/background/features/nativeMessaging/index.ts:158-168
(onConfigChange)`).

**Why it matters**
This is an active trust bug, not just drift: a user who runs "Disable extension
integrations" from the palette sees a success toast, but every approved peer's
commands keep rendering in the palette — across service-worker restarts,
because the trees are durable and re-warmed at startup. Only the
Integrations-page toggle actually cleans up. The wrong comment in `commands.ts`
actively teaches the next feature author that `onConfigChange` fires on every
config write, which it does not (see FEAT-03 for the doc side).

**Proposed change**
Mirror the Native Messaging convention: the palette command performs the
disable side-effects itself.

1. Add a small cleanup function in a new leaf file
   `apps/extension/background/features/extensionRegistry/cleanup.ts` (a leaf
   file avoids the `index.ts ↔ commands.ts` import cycle):

   ```ts
   export const dropAllPeerTrees = async (): Promise<void> => {
     const { clearAllExtensionRegistrations } = await import(
       "../../commands/extensionSdk"
     )
     await clearAllExtensionRegistrations()
     const { invalidateSearchIndex } = await import(
       "../../commands/searchIndex"
     )
     invalidateSearchIndex()
   }
   ```

   (Dynamic imports mirror the existing cycle-avoidance in
   `apps/extension/background/features/extensionRegistry/index.ts:33-36
   (rebuildIndex)`.)
2. Call `await dropAllPeerTrees()` from `disableCommand.execute` after
   `setEnabled(false)` in
   `apps/extension/background/features/extensionRegistry/commands.ts:46-57
   (disableCommand)`.
3. Replace the body of `onConfigChange` in
   `apps/extension/background/features/extensionRegistry/index.ts:107-115` with
   a call to the same `dropAllPeerTrees()` when `!config.enabled`.
4. Rewrite the stale header comment in `commands.ts:1-5` verbatim to:

   ```
   // Architecture: background feature layer (extension-to-extension). The palette
   // commands that toggle the feature. No optional permission to request —
   // cross-extension messaging is a static manifest capability. Disabling also
   // drops cached peer trees and rebuilds the search index; like the native
   // bridge, the palette command performs those side effects itself, because
   // onConfigChange only fires on the settings-page path
   // (monocle-feature-config-update). See
   // docs/extension-extension/extension-integration.md.
   ```

**Do NOT change / risks**
Do not move `onConfigChange` invocation into `setFeatureConfig` — the config
store (`background/features/config.ts`) is deliberately below the registry and
cannot see `FeatureModule`s without a cycle; `onConfigChange` firing on every
internal write would also surprise features whose mutators write config from
inside `handleAction`. Do not touch Native Messaging's commands (pass 31 owns
that file; it is already correct). `enableCommand` needs no cleanup call —
the ER `onConfigChange` only acts on disable. Keep the message wire shapes and
the `monocle-extension-registrations` storage shape untouched.

**Verification**
New test in
`apps/extension/background/features/extensionRegistry/extensionRegistry.test.ts`:
approve a peer, register a tree, execute `external-extensions-disable`, assert
`getAllExtensionEntries()` is empty and `loadExtensionSdkCommands()` returns
`[]`. Keep the existing "dispose clears a peer's registered commands" and
handler tests green. Manual: enable via palette, approve + register a test
peer, disable via palette, confirm peer commands vanish from the palette
without opening the options page.

**Related**
FEAT-03 (documents the two-path `onConfigChange` contract in `docs/features.md`);
pass 31 (`BRIDGE`) for the Native Messaging twin; pass 12 (`MSG`) owns
`handleUpdateFeatureConfig` ergonomics. Touches
`docs/extension-extension/` behavior claims — flag to pass 40.

---

### FEAT-02: Add locked read-modify-write helpers for feature config/state and convert the unlocked mutation paths

**Priority:** P1     **Effort:** M     **Type:** consistency

**Current state**
`createStorageArea.update` is the locked read-modify-write primitive
(`apps/extension/background/utils/storageArea.ts:67-72 (update)`, over
`apps/extension/background/utils/storageMutex.ts:13-36 (withStorageLock)`), and
favorites/snippets/usage use it correctly
(`apps/extension/background/commands/favorites.ts:33-45
(toggleFavoriteCommandId)`,
`apps/extension/background/commands/snippets.ts:34-51 (updateSnippet)`,
`apps/extension/background/commands/usage.ts:199-240 (recordCommandUsage)`).
The feature tiers expose only per-feature replace writes —
`apps/extension/background/features/config.ts:36-41 (setFeatureConfig)` and
`apps/extension/background/features/state.ts:24-29 (setFeatureState)` — whose
internal lock protects the *store map*, not the caller's read-modify-write of
a feature's own value. Every feature therefore composes outside the lock:

- Tab Groups: `apps/extension/background/features/tabGroups/storage.ts:34-40
  (addSavedGroup)`, `:42-54 (renameSavedGroup)`, `:56-62 (deleteSavedGroup)`,
  `:65-83 (toggleSavedTabPin)` — each is `getTabGroupsConfig()` then
  `setFeatureConfig`.
- Element Hider: `apps/extension/background/features/elementHider/index.ts:111-122
  (handleElementPicked)` (read rules, append, replace) and `:178-187
  (handleAction "delete-rule")`.
- Extension Registry: `apps/extension/background/features/extensionRegistry/store.ts:46-53
  (addPendingPeer)`, `:57-76 (approvePeer)`, `:85-91 (revokePeer)`, `:94-105
  (touchPeerSeen)`, plus
  `apps/extension/background/features/extensionRegistry/commands.ts:25-31
  (setEnabled)`.
- Native Messaging repeats the same shape (`nativeMessaging/commands.ts:25-31
  (setEnabled)`, `nativeMessaging/index.ts:144-156 (handleAction "revoke")`,
  `nativeMessaging/pairing.ts`, `nativeMessaging/auth.ts`) — internals owned
  by pass 31, cited here to show the pattern is systemic.

The realistic races: two peer extensions announcing near-simultaneously at
browser startup interleave in `addPendingPeer` and one announcement is lost;
`touchPeerSeen` (fires on every register/announce) racing `approvePeer`/
`revokePeer` resurrects a just-revoked peer's config entry; an Element Hider
`element-picked` surface action racing a settings-page save loses the new rule.

**Why it matters**
This is the exact lost-write bug class `withStorageLock` exists to prevent, and
the code *looks* protected — `setFeatureConfig` runs `configArea.update`, and
`docs/features.md` says "Both stores use `withStorageLock`" — so a reader
reasonably assumes these paths are serialized when they are not. Every new
feature copies the read-then-set idiom (four features already have, ~11 call
sites), so the hazard compounds with each feature added.

**Proposed change**
Extend the existing tier modules (≥3 features use the identical shape today, so
this passes the no-single-consumer guard).

1. In `apps/extension/background/features/config.ts` add:

   ```ts
   // Locked read-modify-write of ONE feature's config. The mutator receives
   // the persisted config merged over `defaults` and returns the full next
   // config (replace-whole per feature). NOT re-entrant: the mutator must not
   // call setFeatureConfig/updateFeatureConfig. Throwing inside the mutator
   // aborts without writing.
   export const updateFeatureConfig = async <
     TConfig extends Record<string, unknown>,
   >(
     featureId: string,
     defaults: TConfig,
     mutate: (config: TConfig) => TConfig,
   ): Promise<TConfig>
   ```

   Implemented over `configArea.update`, merging defaults inside the lock.
2. In `apps/extension/background/features/state.ts` add the analogue:

   ```ts
   export const updateFeatureState = async <TState>(
     featureId: string,
     mutate: (state: TState | undefined) => TState | undefined,
   ): Promise<void>
   ```

   Returning `undefined` from the mutator deletes the entry (subsumes the
   `clearFeatureState` shape at `state.ts:31-40`).
3. Convert call sites, one feature per commit:
   - `tabGroups/storage.ts`: each of the four mutators becomes one
     `updateFeatureConfig(TAB_GROUPS_FEATURE_ID, tabGroupsConfigDefaults, mutator)`;
     keep the Zod re-validation from `:19-25 (writeTabGroupsConfig)` inside the
     mutator (throw on failure — the lock queue is rejection-safe, see
     `storageMutex.ts:18-27`).
   - `elementHider/index.ts`: the rule append in `handleElementPicked` and the
     `delete-rule` filter become single mutators. The host-permission check,
     `hideNow`, and toasts stay outside the mutator.
   - `extensionRegistry/store.ts`: `addPendingPeer` and `dismissPendingPeer`
     via `updateFeatureState`; `approvePeer`'s config append, `revokePeer`, and
     `touchPeerSeen` via `updateFeatureConfig`. `approvePeer` stays two
     sequential locked writes on two keys (see Non-findings for why cross-key
     atomicity is not needed).
   - `extensionRegistry/commands.ts` `setEnabled` via `updateFeatureConfig`
     (compose with FEAT-01's cleanup call, which stays outside the mutator).
   - Native Messaging call sites: list handed to pass 31; do not convert them
     in this finding's implementation.

**Do NOT change / risks**
Storage keys and stored shapes are byte-identical — no migration.
`setFeatureConfig` stays as-is for the two legitimate replace-whole writers
(the message handler persisting a freshly validated payload, and mutator-free
overwrites); do not deprecate it. The message handler
(`messages/features.ts:22-40`) is *not* converted: the settings page sends a
complete validated document and replace-whole is its contract — a concurrent
settings save can still clobber a just-picked Element Hider rule, but that is
inherent to draft-based form saves and is a UI-freshness question for pass 23,
not a locking one. The lock is not re-entrant — the new helpers' doc comments
must repeat the warning from `storageArea.ts:8-13`, and mutators must stay
side-effect-free (no surface pushes, no toasts, no other locked writes).

**Verification**
Existing suites stay green: `registry.test.ts`, `tabGroups.test.ts`
("adds, renames, toggles a pin, and deletes"), `elementHider.test.ts`
(`handleAction` describe), `extensionRegistry.test.ts`, `storageArea.test.ts`,
`storageMutex.test.ts`. New tests: in `registry.test.ts`, fire two concurrent
`updateFeatureConfig` mutators for the same feature (`Promise.all`) and assert
both edits land; in `extensionRegistry.test.ts`, two concurrent
`addPendingPeer` calls for different peers both appear in
`listPendingPeers()`.

**Related**
FEAT-01 (its `setEnabled` conversion composes with this), FEAT-03 (rewrites the
prose that currently over-promises locking). Settings-page phase 4
(`docs/settings-page.md` §10, schema-driven *command* config) will ride the
`monocle-settings` merge branch in `background/commands/settings.ts`, not this
store — no extra pre-work needed beyond this helper existing as the pattern to
copy. Pass 31 for the Native Messaging call-site list; pass 41 for the
concurrency test entries.

---

### FEAT-03: Rewrite the stale storage-contract prose: config "single writer", the four-key inventory, and initSurfaces coverage

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
Three claims have drifted from the code:

1. "the settings page is its single writer, so no merge-branch complexity" —
   `docs/features.md:171-175` (Three stores, three lifecycles) and the same
   claim in `apps/extension/background/features/config.ts:1-6` (header
   comment). In reality config is written by palette commands
   (`tabGroups/commands.ts:48-75 (saveTabsAsGroup submit)`), surface gestures
   (`elementHider/index.ts:79-135 (handleElementPicked)`), row actions, and
   feature-internal stores — see the FEAT-02 citation list.
2. "Monocle uses four independent `chrome.storage.local` keys" —
   `docs/settings.md:14-16` (Storage layout). There are nine:
   `monocle-settings`, `monocle-favoriteCommandIds`, `monocle-commandUsage`,
   `monocle-snippets`, `monocle-automations`, `monocle-feature-config`,
   `monocle-feature-state`, `monocle-surfaces`,
   `monocle-extension-registrations`.
3. "`initSurfaces()` | Startup: drop per-session (`automation:*`) owners" —
   `docs/surfaces.md:105` (store table). The code also drops `command:*`
   (`apps/extension/background/surfaces.ts:23 (SESSION_OWNER_PREFIXES)`,
   `:190-204 (initSurfaces)`); the prose at `docs/surfaces.md:110-114` gets it
   right, so the table row contradicts its own doc.

Also small: `docs/features.md:39` types `commands` as
`(context: Browser.Context)` but the module type is optional
(`apps/extension/background/features/types.ts:70 (commands)`); and the
find-replace artifact "automation automation(s)" appears at
`apps/extension/background/surfaces.ts:5-6` (header comment) and
`docs/surfaces.md:5-6`.

**Why it matters**
The "single writer" claim is load-bearing: it is the stated justification for
replace-whole writes with no merge branch, so a reader auditing the FEAT-02
race concludes the code is safe by design. The "four keys" claim reads as a
complete inventory to anyone locating stored data (export/reset/debugging) and
silently omits five keys, including two holding durable user data (automations,
feature config).

**Proposed change**
After FEAT-02 lands (its helper is referenced):

1. Replace `docs/features.md:172-175` ("Config is keyed … `withStorageLock` …")
   with, verbatim:

   > Config is keyed by feature id and **replace-whole per feature** on write.
   > It has multiple writers — the settings page
   > (`monocle-feature-config-update`), palette commands (e.g. Save Tabs as
   > Group), and surface gestures (e.g. Element Hider's picker) — so any
   > read-modify-write of a feature's own config must go through the locked
   > `updateFeatureConfig` helper (`background/features/config.ts`);
   > `setFeatureConfig` is reserved for replacing a freshly validated whole
   > document. `onConfigChange` fires only on the settings-page message path —
   > a palette command that mutates config performs its own side effects (see
   > the native bridge and extension-registry toggles). Both stores serialize
   > writes with `withStorageLock` (`background/utils/storageMutex.ts`).

2. Rewrite `apps/extension/background/features/config.ts:1-6` to match (durable
   per-feature config; multiple writers; point RMW callers at
   `updateFeatureConfig`; keep the "distinct from `monocle-settings` and
   `monocle-feature-state`" sentence).
3. Replace `docs/settings.md:14-16` with, verbatim:

   > Settings-adjacent data lives under four independent
   > `chrome.storage.local` keys, listed below. Only the first is the
   > "settings document"; the others are documented here because they are
   > frequently confused with settings. Monocle has further self-owned keys
   > documented with their subsystems: `monocle-automations`
   > ([automations.md](./automations.md)), `monocle-feature-config` /
   > `monocle-feature-state` ([features.md](./features.md)),
   > `monocle-surfaces` ([surfaces.md](./surfaces.md)), and
   > `monocle-extension-registrations`
   > ([extension-extension/](./extension-extension/)).

4. Fix the `docs/surfaces.md:105` table row to "Startup: drop per-session
   (`automation:*` and `command:*`) owners; features rebuild their own in
   `init`." Fix `docs/features.md:39` to `commands: (context?: Browser.Context)
   => CommandNode[]`. Fix the "automation automation" artifacts in
   `surfaces.ts:5-6` ("or an automation (`automation:<id>`)") and
   `docs/surfaces.md:5-6` ("Focus Mode and automations are the first
   consumers.").

**Do NOT change / risks**
Do not restructure either doc beyond these passages — pass 40 owns doc-wide
conventions and may batch these; coordinate so the same lines aren't rewritten
twice. The three-store table itself (`docs/features.md:165-169`) is accurate —
leave it.

**Verification**
`pnpm run fmt:check` (docs are not biome-checked, but the `.ts` comment edits
are). Grep-level check: `grep -rn "single writer" docs/ apps/extension/background/features/`
returns nothing; `grep -n "four independent" docs/settings.md` returns the new
scoped sentence.

**Related**
FEAT-01, FEAT-02 (this documents their post-change contract — land last).
Pass 40 (`DOCS`) for batching; pass 42 (`FUT`) — the replace-whole rationale
matters to settings-page phase 4.

---

### FEAT-04: Replace the hand-rolled `toast` helpers in the registry-feature palette commands with `sendToastToActiveTab`

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
`apps/extension/background/utils/browserTabs.ts:71-83 (sendToastToActiveTab)`
already does "query active tab, send `monocle-toast`", and is used across the
command system (e.g. `apps/extension/background/commands/favorites.ts:91-99
(clearFavoritesCommand)`,
`apps/extension/background/features/tabGroups/commands.ts:8-10` imports the
success/error wrappers). The two newest feature command files each re-implement
it verbatim as a private `toast(level, message)`:
`apps/extension/background/features/extensionRegistry/commands.ts:15-23 (toast)`
and `apps/extension/background/features/nativeMessaging/commands.ts:15-23
(toast)`.

**Why it matters**
Two copies of active-tab targeting means a future fix (e.g. falling back to a
different surface when no tab can receive the toast) lands in the shared helper
and silently misses these two features; it also signals to the next feature
author that hand-rolling is the pattern.

**Proposed change**
In both files, delete the local `toast` and import
`sendToastToActiveTab` from `../../utils/browser` (the established import path;
`getActiveTab`/`sendTabMessage` imports can then be dropped where unused).
Call sites change from `toast("success", …)` to
`sendToastToActiveTab("success", …)`.

**Do NOT change / risks**
`nativeMessaging/commands.ts` is pass-31 territory — hand that half over rather
than editing it here if pass 31 is in flight. Behavior is identical (same
message shape, same silent no-op when there is no active tab); do not "improve"
the no-tab case in this finding.

**Verification**
`pnpm run tsc`; existing extensionRegistry and nativeMessaging tests stay
green. Manual: run enable/disable from the palette on a normal page and
confirm the toasts still appear.

**Related**
Pass 31 (`BRIDGE`) for the nativeMessaging file.

---

### FEAT-05: Fail loudly when a feature declares `automations` without `settings`

**Priority:** P3     **Effort:** S     **Type:** consistency

**Current state**
`apps/extension/background/features/index.ts:75-100 (getFeatureAutomations)`
guards with `if (!feature.automations || !feature.settings) continue` at
line 78 — a feature that declares `automations` but no `settings` is silently
skipped, because the projection needs `settings.defaults` to build the config
argument. Nothing in
`apps/extension/background/features/types.ts:58-80 (FeatureModule)` or
`docs/features.md:128-157` (Feature-owned automations) states this coupling;
today only Element Hider uses `automations` and it has `settings`, so the trap
is latent.

**Why it matters**
A future feature author who adds `automations` to a settings-less feature gets
no error, no log, and no projected automations — the failure mode is "my
page-load behavior just doesn't run", which is expensive to debug because every
individual piece looks correct.

**Proposed change**
Keep the guard but make the invalid combination loud:

1. In `getFeatureAutomations`, split the condition: `!feature.automations` →
   `continue` silently; `feature.automations && !feature.settings` →
   `console.error("[features] \"" + feature.id + "\" declares automations but no settings (defaults are required to project config); skipping")`
   then `continue`.
2. Add one sentence to `docs/features.md` in the "Feature-owned automations"
   section (after the "Projected, never stored" bullet), verbatim:
   > Declaring `automations` requires `settings` — the projection is computed
   > from `settings.defaults` merged with stored config, so a settings-less
   > feature's automations are skipped (with a console error).

**Do NOT change / risks**
Do not restructure `FeatureModule` to type-enforce the pairing (e.g. splitting
into `FeatureModuleWithSettings`) — a two-variant union for one latent trap is
exactly the speculative complexity the guard list bans. Do not throw: startup
projection failures must never take down user automations (matching the
existing posture at `features/index.ts:71-74`).

**Verification**
New case in `apps/extension/background/features/registry.test.ts`: a stub
module with `automations` and no `settings` passed through a projection helper
logs an error and contributes nothing (may require exporting the loop body or
testing via a temporary registry entry — follow the file's existing style).

**Related**
Pass 11 (`AUTO`) owns the consuming merge in `automations/registry.ts` —
no change needed there.

---

## Non-findings (reviewed, justified)

- **Surface validation happens at store time (seeded hypothesis 2) — refuted.**
  Every producer funnels through `setOwnerSurfaces`/`upsertSurface`
  (`apps/extension/background/surfaces.ts:68-83, 98-115`), which call
  `validateSurfaces` (`surfaces.ts:51-65`) before the locked write: features
  (`focus/session.ts:51-63 (syncFocusSurfaces)`,
  `elementHider/commands.ts:70-81`), the automation engine
  (`automations/engine.ts:639, 660`), and command handlers
  (`commands/tools/urlAsQrCode.ts:49`, `commands/tools/inspectElementFonts.ts:104`).
  Store time *is* the single choke point; validate-at-creation would duplicate
  the same check at five call sites for no added safety.
- **"Each feature hand-rolls its own storage CRUD" (seeded hypothesis 1) —
  refuted as stated.** No feature creates its own storage area; all go through
  the `config.ts`/`state.ts` tier accessors. The per-feature layers that exist
  (`tabGroups/storage.ts` validated CRUD, `extensionRegistry/store.ts` peer
  store) differ in genuine domain semantics (Zod re-validation, pending caps,
  approve-moves-between-tiers) and should not merge. The one identical
  repeated fragment — read-merge-write of a feature's own value — is exactly
  what FEAT-02's helpers absorb.
- **Raw `withStorageLock` (instead of `area.update`) in `surfaces.ts`,
  `commands/settings.ts`, and `automations/storage.ts`.** Deliberate and
  documented in-file (`surfaces.ts:30-31`, `settings.ts:87-89`,
  `automations/storage.ts:23-24`): these mutators need early-return-without-save
  and value-returning semantics `update` cannot express, and the lock key
  always equals the area key, so serialization is intact. Forcing them through
  `update` would add no-op writes for zero clarity gain.
- **`config` vs `state` tier boundary (seeded hypothesis 3) — honored by all
  five features.** Durable: blocklists, saved groups, hider rules, approved
  peers, paired clients (all in `monocle-feature-config`). Transient: focus
  session, pending peer announcements, pending pairings (all in
  `monocle-feature-state`, cleared by `init` hooks). No violations found; the
  drifted *prose* about writers is FEAT-03, not a boundary breach.
- **`approvePeer` writes two keys non-atomically**
  (`extensionRegistry/store.ts:57-76`). A crash between the config and state
  writes leaves a peer approved *and* pending; startup `clearPendingPeers`
  (`extensionRegistry/index.ts:66`) and the approved-check in `addPendingPeer`
  make it self-healing. Cross-key transactions are not worth building for this.
- **`focus/block.ts` `isUrlBlocked` has zero production call sites**
  (`focus/block.ts:7-12`; runtime blocking is the surface's `urlMatch`).
  Explicitly documented as a tested helper, not the live path
  (`docs/focus-mode.md:74-78`), and plausibly the seam for the documented
  focus-mode timed-sessions expansion. Deleting saves 13 lines and loses a
  documented, tested semantic anchor — leave it.
- **Static feature registry array with `FeatureModule<any>` entries**
  (`features/index.ts:26-32`). Documented deliberate staging
  (`features/index.ts:24-25`, `docs/features.md:289-292`); the `any` is the
  standard existential-config erasure at the registry seam and each module is
  fully typed internally. Promoting to dynamic registration is explicitly
  deferred future work.
- **Feature runtime state has no push channel (seeded hypothesis 6) —
  background-side statement.** There is no `monocle-feature-state-changed`
  broadcast and no state-read message; state reaches UIs only via surfaces
  (`monocle-surfaces-changed`), async command-name resolvers
  (`focus/commands.ts:82-96 (stopFocus)`), and descriptor `lists` projections
  refreshed on `monocle-features-get`/action responses. That is a deliberate
  "features produce data, hosts render it" posture (`docs/features.md:179-197`);
  whether the options UI needs fresher pending-peer rows is pass 23's call.
- **`FeatureModule` contract adherence (seeded hypothesis 5) — consistent.**
  All five modules implement `commands()` meaningfully; `init`/`settings`/
  `automations` are optional and omitted only where genuinely unneeded
  (tabGroups has no `init`; only elementHider has `automations`). No
  do-nothing boilerplate exists to trim; the one loud-failure gap is FEAT-05.
- **`broadcastChanged` fires even for no-op surface mutations** (e.g.
  `clearOwnerSurfaces` of an absent owner, `surfaces.ts:85-95`). Cost is one
  redundant `monocle-surfaces-get` round-trip per tab on rare paths; a
  changed-flag would complicate every mutator for negligible gain.
- **Settings-page phases 3–4 storage pre-work (seeded hypothesis 7) — none
  needed here.** Phase 3 (permissions page) stores nothing new (browser APIs
  are authoritative); phase 4 (schema-driven command `config`) lands in the
  `monocle-settings` merge branch owned by `background/commands/settings.ts`,
  which this pass leaves untouched. FEAT-02's locked-update helper is the
  pattern phase 4 should copy, not a dependency.
