// Architecture: background layer. Storage module for automations — typed
// CRUD over the `monocle-automations` key in chrome.storage.local, guarded
// by withStorageLock against concurrent updates. Mirrors the snippets
// module (background/commands/snippets.ts): an independent lifecycle from
// `monocle-settings` (clearing settings never deletes automations). Every write
// re-validates the document against the shared schema
// (shared/types/automationValidation.ts) so direct callers cannot persist a
// document the message boundary would reject; reads migrate documents
// forward by schemaVersion. Per-automation keybinding/hidden/urlRules overrides
// intentionally do NOT live here — they ride on CommandSettings keyed by the
// generated command id (shared/types/automations.ts).
import type { Automation } from "../../shared/types"
import {
  AUTOMATION_MAX_COUNT,
  type AutomationDraft,
  AutomationSchema,
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
const saveAutomations = (automations: Automation[]): Promise<void> =>
  automationsArea.save(automations)

/**
 * Migrates a stored document to the current schemaVersion. Version 1 is
 * current; unknown (newer) versions are dropped from reads with an error —
 * never silently coerced — so a downgraded extension cannot misinterpret a
 * newer document.
 */
const migrateAutomation = (automation: Automation): Automation | null => {
  if (automation.schemaVersion === 1) {
    return automation
  }

  console.error(
    `[Automations] Dropping automation ${automation.id}: unsupported schemaVersion`,
    automation.schemaVersion,
  )
  return null
}

/** All stored automations, migrated to the current schema version. */
export const getAutomations = async (): Promise<Automation[]> => {
  const automations = await loadAutomationsRaw()
  return automations
    .map(migrateAutomation)
    .filter((automation): automation is Automation => automation !== null)
}

const assertValidDocument = (automation: Automation): void => {
  const result = AutomationSchema.safeParse(automation)
  if (!result.success) {
    throw new Error(
      `Automation failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    )
  }
}

/**
 * Persists a new automation from a validated draft. Storage assigns the id and
 * timestamps; the document is re-validated as a whole before writing.
 * Throws on validation failure or when the stored-automation cap is reached.
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

    const automations = await getAutomations()

    if (automations.length >= AUTOMATION_MAX_COUNT) {
      throw new Error(
        `Cannot store more than ${AUTOMATION_MAX_COUNT} automations`,
      )
    }

    const now = Date.now()
    const automation: Automation = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }

    assertValidDocument(automation)

    automations.push(automation)
    await saveAutomations(automations)
    return automation
  })

/**
 * Replaces an automation's draft fields (id/createdAt are preserved, updatedAt
 * bumps). Returns undefined when the id is unknown.
 */
export const updateAutomation = async (
  id: string,
  draft: AutomationDraft,
): Promise<Automation | undefined> =>
  withStorageLock(STORAGE_KEY, async () => {
    const automations = await getAutomations()
    const index = automations.findIndex((automation) => automation.id === id)

    if (index === -1) {
      return undefined
    }

    const updated: Automation = {
      ...draft,
      id: automations[index].id,
      createdAt: automations[index].createdAt,
      updatedAt: Date.now(),
    }

    assertValidDocument(updated)

    automations[index] = updated
    await saveAutomations(automations)
    return updated
  })

/** Deletes an automation document. Settings cleanup happens at the message layer. */
export const deleteAutomation = async (id: string): Promise<boolean> =>
  withStorageLock(STORAGE_KEY, async () => {
    const automations = await getAutomations()
    const index = automations.findIndex((automation) => automation.id === id)

    if (index === -1) {
      return false
    }

    automations.splice(index, 1)
    await saveAutomations(automations)
    return true
  })
