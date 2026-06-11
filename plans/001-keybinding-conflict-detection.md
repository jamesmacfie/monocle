# Plan 001: Detect and report keybinding conflicts in the bulk update path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: This plan targets files that were UNCOMMITTED
> (modified or untracked) at planning time, so `git diff <SHA>..HEAD` is not a
> reliable drift signal. Instead, open each file listed in "Current state" and
> compare against the excerpts. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a8d89c2` (plus uncommitted working-tree changes), 2026-06-11

## Why this matters

Monocle's options page has a new bulk keybinding feature (keybinding templates,
e.g. a vim template that assigns ~dozens of bindings at once) that persists
bindings through the `update-command-keybindings` background message. Unlike
the single-binding edit dialog — which calls `check-keybinding-conflict`
before saving — the bulk path performs **no conflict detection at all**. The
keybinding registry then silently drops whichever conflicting command
registers second (`registerBinding` returns early if the key is already in the
map). The user ends up with a persisted setting that never fires, with no
error, no warning, and no indication of which command "won". Applying the vim
template is exactly the scenario that mass-produces this.

## Current state

Relevant files:

- `background/messages/updateCommandKeybindings.ts` — the bulk update handler
  (untracked file, new in the in-flight keybinding-template work). Validates
  each update with `canAssignKeybinding`, then persists all of them. No
  conflict check.
- `background/messages/checkKeybindingConflict.ts` — existing single-binding
  conflict checker. This is the pattern to reuse.
- `background/keybindings/registry.ts` — `registerBinding` silently skips
  duplicates (around lines 38–49).
- `background/keybindings/source.ts` — exports `loadKeybindingCommandEntries`,
  which returns every command that currently has a binding (built-in or
  custom). `checkKeybindingConflict.ts` imports it from
  `../keybindings/source`.
- `background/messages/updateCommandKeybindings.test.ts` — existing happy-path
  test for the handler (untracked). Use its mocking setup as the pattern.
- `shared/store/slices/settingsCatalog.slice.ts` — line ~145 sends the
  `update-command-keybindings` message from the options UI (template apply
  path).

`background/messages/updateCommandKeybindings.ts` as written today (full
handler body, abridged only at the import block):

```ts
export async function updateCommandKeybindings(
  message: UpdateCommandKeybindingsMessage,
  sender?: any,
) {
  const siteSdk = await prepareSiteSdkCommandLoadOptions(
    sender,
    message.context,
  )
  const preparedUpdates: PreparedKeybindingUpdate[] = []

  for (const update of message.updates) {
    const normalizedKeybinding = normalizeKeybinding(update.keybinding || "")

    if (!normalizedKeybinding) {
      preparedUpdates.push({
        commandId: update.commandId,
        keybinding: null,
      })
      continue
    }

    if (!(await canAssignKeybinding(update.commandId, message, siteSdk))) {
      throw new Error(
        `Command cannot be assigned a keybinding: ${update.commandId}`,
      )
    }

    preparedUpdates.push({
      commandId: update.commandId,
      keybinding: normalizedKeybinding,
    })
  }

  await updateCommandKeybindingsSettings(preparedUpdates)
  await refreshKeybindingRegistry()

  return { success: true, updated: preparedUpdates.length }
}
```

The existing conflict-check pattern, `background/messages/checkKeybindingConflict.ts`:

```ts
const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)
const commands = await loadKeybindingCommandEntries(context, { siteSdk })

for (const command of commands) {
  if (command.id === excludeCommandId) continue

  if (normalizeKeybinding(command.keybinding) === normalizedKeybinding) {
    return {
      hasConflict: true,
      conflictingCommand: { id: command.id, name: command.name },
    }
  }
}
```

The silent-drop behavior in `background/keybindings/registry.ts`:

```ts
const registerBinding = (registry, entry, keybinding): void => {
  const normalized = normalizeKeybinding(keybinding)
  if (!normalized || registry.has(normalized)) {
    return
  }
  registry.set(normalized, entry)
}
```

Repo conventions: TypeScript, no classes for handlers — plain exported async
functions. Message payload/response types live in `shared/types/messaging.ts`
and Zod validation schemas in `shared/types/validation.ts` (the
`update-command-keybindings` schema is at validation.ts:109). Tests use
vitest; `pnpm` only, never npm/yarn. The repo has a PostToolUse hook that runs
tsc + biome on edits and strips unused imports — if an import you added
disappears, it was unused.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `pnpm run tsc`                                       | exit 0              |
| Tests     | `pnpm test`                                          | all pass            |
| One file  | `pnpm test -- background/messages/updateCommandKeybindings.test.ts` | all pass |
| Format    | `pnpm run fmt:check`                                 | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `background/messages/updateCommandKeybindings.ts`
- `background/messages/updateCommandKeybindings.test.ts`
- `shared/types/messaging.ts` (only the `UpdateCommandKeybindings` response
  type, if a response type exists there; otherwise the inline return type)
- `shared/store/slices/settingsCatalog.slice.ts` (only to surface the new
  `conflicts` field in the thunk's returned/displayed result)
- `options/components/KeybindingTemplateDialog.tsx` (only to display conflicts
  returned from apply, if the dialog renders apply results)

**Out of scope** (do NOT touch, even though they look related):
- `background/keybindings/registry.ts` — the silent-skip in `registerBinding`
  is the registry's defense; do not change registry semantics.
- `background/messages/checkKeybindingConflict.ts` — keep the single-binding
  path as is.
- `options/lib/keybindingTemplates.ts` — template content is not this plan.
- `background/commands/settings.ts` — persistence layer unchanged.

## Git workflow

- The working tree already contains uncommitted in-flight work that this plan
  builds on. Do NOT commit, stage, stash, or revert anything unless the
  operator instructed it — just edit the files.
- If instructed to commit: branch `advisor/001-keybinding-conflicts`, message
  style follows the repo's conventional-ish prefixes (`fix:`, `feat:`,
  `docs:` — see `git log --oneline -10`).

## Steps

### Step 1: Add conflict detection to the handler

In `background/messages/updateCommandKeybindings.ts`:

1. Import `loadKeybindingCommandEntries` from `../keybindings/source`.
2. After preparing `preparedUpdates` (the existing loop), build the conflict
   report **before** persisting:
   - Call `loadKeybindingCommandEntries(message.context, { siteSdk })` once.
   - Build `existing: Map<normalizedKeybinding, { id, name }>` from those
     entries, skipping entries whose `id` is in the batch (a batch update for
     a command replaces its old binding, so its old binding is not a
     conflict).
   - Walk `preparedUpdates` in order. For each update with a non-null
     keybinding: it conflicts if the key is in `existing`, or if an earlier
     update in the same batch already claimed the same key (track a
     `claimed: Map<string, string /* commandId */>`).
3. Collect conflicts as
   `{ commandId, keybinding, conflictingCommand: { id, name } }[]`
   (for intra-batch conflicts, `conflictingCommand` is the earlier batch
   command's id; use the command's catalog name if cheaply available,
   otherwise its id as the name).
4. Behavior: **skip conflicting updates, persist the rest**, and return them
   in the response:
   `{ success: true, updated: <count actually persisted>, conflicts }`.
   Do not throw for conflicts — throwing fails the whole batch and is the
   existing (bad) behavior for unassignable commands; conflicts are expected
   user-level outcomes, not protocol errors.

### Step 2: Type the response

Find the response shape for `update-command-keybindings`. If
`shared/types/messaging.ts` declares a response type for it, add
`conflicts?: Array<{ commandId: string; keybinding: string; conflictingCommand: { id: string; name: string } }>`.
If the response is currently untyped/inline, add and export the type next to
the message type in `shared/types/messaging.ts` and use it in the handler's
return type.

**Verify**: `pnpm run tsc` → exit 0

### Step 3: Surface conflicts in the options UI

In `shared/store/slices/settingsCatalog.slice.ts`, the thunk that sends
`update-command-keybindings` (around line 145) currently treats any
`success: true` as a clean apply. Pass the `conflicts` array through the
thunk's fulfilled payload. In `options/components/KeybindingTemplateDialog.tsx`,
after apply, if `conflicts.length > 0`, render a non-blocking notice listing
each skipped binding: `"<keybinding> not applied — already used by <name>"`.
Match the dialog's existing styling/markup patterns (Tailwind classes, same
text-size conventions as the surrounding rows). If the dialog closes
immediately on apply with no result UI, keep the change minimal: keep the
dialog open when conflicts exist and show the list with the existing
button row.

**Verify**: `pnpm run tsc` → exit 0

### Step 4: Tests

See test plan below.

**Verify**: `pnpm test -- background/messages/updateCommandKeybindings.test.ts` → all pass

## Test plan

Extend `background/messages/updateCommandKeybindings.test.ts`, following its
existing mocking setup (it already mocks command resolution and settings):

1. **Conflict with an existing binding**: registry/source has command A bound
   to `<cmd-shift-k>`; batch assigns `<cmd-shift-k>` to command B → response
   has `updated: 0`, one conflict naming A; settings update was called with
   an empty list (or not called for B).
2. **Intra-batch conflict**: batch assigns the same key to B and C → B
   persists, C reported as conflict.
3. **Re-assigning a command's own key is not a conflict**: A already has
   `<cmd-shift-k>`; batch sets A to `<cmd-shift-k>` (or moves A to a new key
   while assigning A's old key to B) → no conflict.
4. **Null/cleared keybindings never conflict**: batch entry with empty
   keybinding clears the binding and is counted in `updated`.
5. Keep the existing happy-path test green.

Verification: `pnpm test` → all pass, including ≥4 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm run tsc` exits 0
- [ ] `pnpm run fmt:check` exits 0
- [ ] `pnpm test` exits 0; new conflict tests exist and pass
- [ ] `grep -n "conflicts" background/messages/updateCommandKeybindings.ts` shows the conflict report being built and returned
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `background/messages/updateCommandKeybindings.ts` no longer matches the
  excerpt above (the in-flight work moved on).
- `loadKeybindingCommandEntries` does not exist in
  `background/keybindings/source.ts` or has a different signature than its
  use in `checkKeybindingConflict.ts`.
- Surfacing conflicts in the dialog requires restructuring the template
  dialog's apply flow (more than ~30 lines of UI change) — land the
  background half and report the UI half back instead.
- The Zod schema in `shared/types/validation.ts` rejects your response shape
  (responses shouldn't be validated, but if they are, report back).

## Maintenance notes

- Any future bulk-mutation message (e.g. bulk URL-rule import) should follow
  this shape: validate per item, skip-and-report rather than throw-on-first.
- Reviewer should scrutinize the intra-batch `claimed` ordering — first writer
  wins must match the order the template defines.
- Deferred: the handler still **throws** on the first unassignable command
  (`canAssignKeybinding` false), failing the whole batch. Converting that to
  per-item skip-and-report is a natural follow-up; it was left out to keep
  this plan's diff reviewable.
