// Architecture: background layer. Storage module for automations — typed
// CRUD over the `monocle-automations` key in chrome.storage.local, guarded
// by withStorageLock against concurrent updates. Mirrors the snippets
// module (background/commands/snippets.ts): an independent lifecycle from
// `monocle-settings` (clearing settings never deletes scripts). Every write
// re-validates the document against the shared schema
// (shared/types/automationValidation.ts) so direct callers cannot persist a
// document the message boundary would reject; reads migrate documents
// forward by schemaVersion. Per-script keybinding/hidden/urlRules overrides
// intentionally do NOT live here — they ride on CommandSettings keyed by the
// generated command id (shared/types/automations.ts).
import type { Automation } from "../../shared/types"
import {
  type AutomationDraft,
  AutomationSchema,
  USER_SCRIPT_MAX_COUNT,
} from "../../shared/types/automationValidation"
import { createStorageArea } from "../utils/storageArea"
import { withStorageLock } from "../utils/storageMutex"

const STORAGE_KEY = "monocle-automations"

// Transport only — migration (reads) and validation + the locked CRUD (writes)
// below are automation-specific and stay here. See createStorageArea.
const automationsArea = createStorageArea<Automation[]>({
  key: STORAGE_KEY,
  defaults: () => [],
  label: "automations",
})

const loadAutomationsRaw = (): Promise<Automation[]> => automationsArea.load()
const saveAutomations = (scripts: Automation[]): Promise<void> =>
  automationsArea.save(scripts)

/**
 * Migrates a stored document to the current schemaVersion. Version 1 is
 * current; unknown (newer) versions are dropped from reads with an error —
 * never silently coerced — so a downgraded extension cannot misinterpret a
 * newer document.
 */
const migrateAutomation = (script: Automation): Automation | null => {
  if (script.schemaVersion === 1) {
    return script
  }

  console.error(
    `[Automations] Dropping script ${script.id}: unsupported schemaVersion`,
    script.schemaVersion,
  )
  return null
}

/** All stored scripts, migrated to the current schema version. */
export const getAutomations = async (): Promise<Automation[]> => {
  const scripts = await loadAutomationsRaw()
  return scripts
    .map(migrateAutomation)
    .filter((script): script is Automation => script !== null)
}

/** One script by document id. */
export const getAutomation = async (
  id: string,
): Promise<Automation | undefined> => {
  const scripts = await getAutomations()
  return scripts.find((script) => script.id === id)
}

const assertValidDocument = (script: Automation): void => {
  const result = AutomationSchema.safeParse(script)
  if (!result.success) {
    throw new Error(
      `Automation failed validation: ${result.error.issues
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
export const addAutomation = async (
  draft: AutomationDraft,
): Promise<Automation> =>
  withStorageLock(STORAGE_KEY, async () => {
    // Feature automations are projected at read time, never stored. Reject a
    // draft that claims feature ownership so the automation store stays the
    // exclusive home of user-authored documents.
    if (draft.owner && draft.owner.kind !== "user") {
      throw new Error(
        "Feature-owned automations cannot be created via the automation store",
      )
    }

    const scripts = await getAutomations()

    if (scripts.length >= USER_SCRIPT_MAX_COUNT) {
      throw new Error(
        `Cannot store more than ${USER_SCRIPT_MAX_COUNT} automations`,
      )
    }

    const now = Date.now()
    const script: Automation = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }

    assertValidDocument(script)

    scripts.push(script)
    await saveAutomations(scripts)
    return script
  })

/**
 * Replaces a script's draft fields (id/createdAt are preserved, updatedAt
 * bumps). Returns undefined when the id is unknown.
 */
export const updateAutomation = async (
  id: string,
  draft: AutomationDraft,
): Promise<Automation | undefined> =>
  withStorageLock(STORAGE_KEY, async () => {
    const scripts = await getAutomations()
    const index = scripts.findIndex((script) => script.id === id)

    if (index === -1) {
      return undefined
    }

    const updated: Automation = {
      ...draft,
      id: scripts[index].id,
      createdAt: scripts[index].createdAt,
      updatedAt: Date.now(),
    }

    assertValidDocument(updated)

    scripts[index] = updated
    await saveAutomations(scripts)
    return updated
  })

/** Deletes a script document. Settings cleanup happens at the message layer. */
export const deleteAutomation = async (id: string): Promise<boolean> =>
  withStorageLock(STORAGE_KEY, async () => {
    const scripts = await getAutomations()
    const index = scripts.findIndex((script) => script.id === id)

    if (index === -1) {
      return false
    }

    scripts.splice(index, 1)
    await saveAutomations(scripts)
    return true
  })
