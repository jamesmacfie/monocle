// Architecture: options/ page-local helpers for Automations import/export.
// Export wraps the full stored document in a small envelope (with a note
// that keybindings live in command settings, not the document — see the
// trailer comment in shared/types/userScripts.ts) and triggers a download.
// Import is the safety-critical half: it strips identity fields, forces
// every non-manual trigger to arrive disarmed, stamps imported provenance,
// and validates with the exact schema the background enforces — the caller
// then shows the summarizeUserScript review before anything is saved
// (the import contract in docs/userscripts/).
import type { UserScript } from "../../../shared/types"
import {
  type UserScriptDraft,
  validateUserScriptDraft,
} from "../../../shared/types/userScriptValidation"

const EXPORT_FORMAT = "monocle-automation@1"
const EXPORT_NOTE =
  "Keybindings are not exported: shortcuts are personal command settings, not part of the automation document."

/** Serializes a script for export (full document inside a small envelope). */
export const serializeUserScriptExport = (script: UserScript): string =>
  JSON.stringify(
    {
      format: EXPORT_FORMAT,
      note: EXPORT_NOTE,
      script,
    },
    null,
    2,
  )

/** Download filename: `<name>.monocle-automation.json`, filesystem-safe. */
export const exportFileName = (script: UserScript): string => {
  const safe = script.name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${safe || "automation"}.monocle-automation.json`
}

/** Triggers a browser download of the serialized script. */
export const downloadUserScriptExport = (script: UserScript): void => {
  const blob = new Blob([serializeUserScriptExport(script)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = exportFileName(script)
  anchor.click()
  URL.revokeObjectURL(url)
}

export type PreparedImport =
  | { ok: true; draft: UserScriptDraft }
  | { ok: false; errors: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Parses raw import file text into a validated draft: unwraps the export
 * envelope (or accepts a bare document), strips id/createdAt/updatedAt,
 * forces non-manual triggers to `disarmed: true`, and stamps imported
 * provenance before running the shared schema.
 */
export const prepareImportedDraft = (raw: string): PreparedImport => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      ok: false,
      errors: [
        `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }

  if (!isRecord(parsed)) {
    return { ok: false, errors: ["Expected a JSON object"] }
  }

  const document = isRecord(parsed.script) ? parsed.script : parsed
  const { id, createdAt, updatedAt, ...candidate } = document
  void id
  void createdAt
  void updatedAt

  if (Array.isArray(candidate.triggers)) {
    candidate.triggers = candidate.triggers.map((trigger) =>
      isRecord(trigger) && trigger.type !== "manual"
        ? { ...trigger, disarmed: true }
        : trigger,
    )
  }

  candidate.source = { kind: "imported", importedAt: Date.now() }

  const validation = validateUserScriptDraft(candidate)
  if (!validation.success) {
    return {
      ok: false,
      errors: validation.errors.map((issue) =>
        issue.path ? `${issue.path}: ${issue.message}` : issue.message,
      ),
    }
  }

  return { ok: true, draft: validation.script }
}
