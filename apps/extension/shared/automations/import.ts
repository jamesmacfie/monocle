// Architecture: shared automation ingress. Converts untrusted JSON-shaped
// values (files or LLM output) into a validated AutomationDraft. Identity and
// provenance stay background/product-owned, and automatic triggers always
// arrive disarmed for explicit review. See docs/automations.md.
import type { AutomationDraft } from "../types/automationValidation"
import { validateAutomationDraft } from "../types/automationValidation"

export type PreparedAutomationImport =
  | { ok: true; draft: AutomationDraft }
  | { ok: false; errors: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Prepares an untrusted automation envelope or bare script for review. This is
 * intentionally shared by file import and LLM generation so neither path can
 * bypass identity stripping, trigger disarming, provenance, or validation.
 */
export const prepareUntrustedAutomation = (
  input: unknown,
  now: () => number = Date.now,
): PreparedAutomationImport => {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Expected a JSON object"] }
  }

  const document = isRecord(input.script) ? input.script : input
  const { id, createdAt, updatedAt, source, owner, ...candidate } = document
  void id
  void createdAt
  void updatedAt
  void source
  void owner

  if (Array.isArray(candidate.triggers)) {
    candidate.triggers = candidate.triggers.map((trigger) =>
      isRecord(trigger) && trigger.type !== "manual"
        ? { ...trigger, disarmed: true }
        : trigger,
    )
  }

  candidate.source = { kind: "imported", importedAt: now() }
  const validation = validateAutomationDraft(candidate)
  if (!validation.success) {
    return {
      ok: false,
      errors: validation.errors.map((issue) =>
        issue.path ? `${issue.path}: ${issue.message}` : issue.message,
      ),
    }
  }

  return { ok: true, draft: validation.automation }
}
