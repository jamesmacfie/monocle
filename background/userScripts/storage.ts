// Architecture: background layer. Storage module for user scripts — typed
// CRUD over the `monocle-userscripts` key in chrome.storage.local, guarded
// by withStorageLock against concurrent updates. Mirrors the snippets
// module (background/commands/snippets.ts): an independent lifecycle from
// `monocle-settings` (clearing settings never deletes scripts). Every write
// re-validates the document against the shared schema
// (shared/types/userScriptValidation.ts) so direct callers cannot persist a
// document the message boundary would reject; reads migrate documents
// forward by schemaVersion. Per-script keybinding/hidden/urlRules overrides
// intentionally do NOT live here — they ride on CommandSettings keyed by the
// generated command id (shared/types/userScripts.ts).
import type { UserScript } from "../../shared/types"
import {
  USER_SCRIPT_MAX_COUNT,
  type UserScriptDraft,
  UserScriptSchema,
} from "../../shared/types/userScriptValidation"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { withStorageLock } from "../utils/storageMutex"

const STORAGE_KEY = "monocle-userscripts"

const loadUserScriptsRaw = async (): Promise<UserScript[]> => {
  try {
    const result = (await getBrowserAPI().storage.local.get(
      STORAGE_KEY,
    )) as Record<string, UserScript[] | undefined>
    return result[STORAGE_KEY] || []
  } catch (error) {
    console.error("Failed to load user scripts:", error)
    return []
  }
}

const saveUserScripts = async (scripts: UserScript[]): Promise<void> => {
  try {
    await getBrowserAPI().storage.local.set({
      [STORAGE_KEY]: scripts,
    })
  } catch (error) {
    console.error("Failed to save user scripts:", error)
  }
}

/**
 * Migrates a stored document to the current schemaVersion. Version 1 is
 * current; unknown (newer) versions are dropped from reads with an error —
 * never silently coerced — so a downgraded extension cannot misinterpret a
 * newer document.
 */
const migrateUserScript = (script: UserScript): UserScript | null => {
  if (script.schemaVersion === 1) {
    return script
  }

  console.error(
    `[UserScripts] Dropping script ${script.id}: unsupported schemaVersion`,
    script.schemaVersion,
  )
  return null
}

/** All stored scripts, migrated to the current schema version. */
export const getUserScripts = async (): Promise<UserScript[]> => {
  const scripts = await loadUserScriptsRaw()
  return scripts
    .map(migrateUserScript)
    .filter((script): script is UserScript => script !== null)
}

/** One script by document id. */
export const getUserScript = async (
  id: string,
): Promise<UserScript | undefined> => {
  const scripts = await getUserScripts()
  return scripts.find((script) => script.id === id)
}

const assertValidDocument = (script: UserScript): void => {
  const result = UserScriptSchema.safeParse(script)
  if (!result.success) {
    throw new Error(
      `User script failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    )
  }
}

/**
 * Persists a new script from a validated draft. Storage assigns the id and
 * timestamps; the document is re-validated as a whole before writing.
 * Throws on validation failure or when the stored-script cap is reached.
 */
export const addUserScript = async (
  draft: UserScriptDraft,
): Promise<UserScript> =>
  withStorageLock(STORAGE_KEY, async () => {
    // Feature automations are projected at read time, never stored. Reject a
    // draft that claims feature ownership so the user-script store stays the
    // exclusive home of user-authored documents.
    if (draft.owner && draft.owner.kind !== "user") {
      throw new Error(
        "Feature-owned automations cannot be created via the user-script store",
      )
    }

    const scripts = await getUserScripts()

    if (scripts.length >= USER_SCRIPT_MAX_COUNT) {
      throw new Error(
        `Cannot store more than ${USER_SCRIPT_MAX_COUNT} user scripts`,
      )
    }

    const now = Date.now()
    const script: UserScript = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }

    assertValidDocument(script)

    scripts.push(script)
    await saveUserScripts(scripts)
    return script
  })

/**
 * Replaces a script's draft fields (id/createdAt are preserved, updatedAt
 * bumps). Returns undefined when the id is unknown.
 */
export const updateUserScript = async (
  id: string,
  draft: UserScriptDraft,
): Promise<UserScript | undefined> =>
  withStorageLock(STORAGE_KEY, async () => {
    const scripts = await getUserScripts()
    const index = scripts.findIndex((script) => script.id === id)

    if (index === -1) {
      return undefined
    }

    const updated: UserScript = {
      ...draft,
      id: scripts[index].id,
      createdAt: scripts[index].createdAt,
      updatedAt: Date.now(),
    }

    assertValidDocument(updated)

    scripts[index] = updated
    await saveUserScripts(scripts)
    return updated
  })

/** Deletes a script document. Settings cleanup happens at the message layer. */
export const deleteUserScript = async (id: string): Promise<boolean> =>
  withStorageLock(STORAGE_KEY, async () => {
    const scripts = await getUserScripts()
    const index = scripts.findIndex((script) => script.id === id)

    if (index === -1) {
      return false
    }

    scripts.splice(index, 1)
    await saveUserScripts(scripts)
    return true
  })
