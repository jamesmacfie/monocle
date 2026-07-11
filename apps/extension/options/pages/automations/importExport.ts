// Architecture: options/ page-local helpers for Automations import/export.
// Export wraps the full stored document in a small envelope (with a note
// that keybindings live in command settings, not the document — see the
// trailer comment in shared/types/automations.ts) and triggers a download.
// Import is the safety-critical half: it strips identity fields, forces
// every non-manual trigger to arrive disarmed, stamps imported provenance,
// and validates with the exact schema the background enforces — the caller
// then shows the summarizeAutomation review before anything is saved
// (the import contract in docs/automations/).

import {
  type PreparedAutomationImport,
  prepareUntrustedAutomation,
} from "../../../shared/automations/import"
import type { Automation } from "../../../shared/types"

const EXPORT_FORMAT = "monocle-automation@1"
const EXPORT_NOTE =
  "Keybindings are not exported: shortcuts are personal command settings, not part of the automation document."

/** Serializes a script for export (full document inside a small envelope). */
export const serializeAutomationExport = (script: Automation): string =>
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
export const exportFileName = (script: Automation): string => {
  const safe = script.name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${safe || "automation"}.monocle-automation.json`
}

/** Triggers a browser download of the serialized script. */
export const downloadAutomationExport = (script: Automation): void => {
  const blob = new Blob([serializeAutomationExport(script)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = exportFileName(script)
  anchor.click()
  URL.revokeObjectURL(url)
}

export type PreparedImport = PreparedAutomationImport

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

  return prepareUntrustedAutomation(parsed)
}
