// Architecture: background generation orchestration. Reads the key and safe
// snippet metadata, calls OpenAI, normalizes through canonical validation, and
// performs at most one semantic repair. It never persists an automation.
import {
  AUTOMATION_GENERATION_MODEL,
  type AutomationGenerationResult,
} from "../../../shared/types/automationGeneration"
import { getSnippets } from "../../commands/snippets"
import { normalizeAutomationGeneration } from "./normalize"
import { requestOpenAiAutomation } from "./openai"
import { buildAutomationGenerationInstructions } from "./prompt"
import { getAutomationGenerationApiKey } from "./settings"

export const generateAutomationDraft = async ({
  request,
  signal,
  fetchImpl,
}: {
  request: string
  signal: AbortSignal
  fetchImpl?: typeof fetch
}): Promise<AutomationGenerationResult> => {
  const apiKey = await getAutomationGenerationApiKey()
  if (!apiKey) {
    return {
      ok: false,
      code: "missing-api-key",
      message: "Add an OpenAI API key before generating an automation.",
      retryable: false,
    }
  }

  const snippets = (await getSnippets()).map(({ id, name }) => ({ id, name }))
  const instructions = buildAutomationGenerationInstructions(snippets)
  const first = await requestOpenAiAutomation({
    apiKey,
    instructions,
    request,
    signal,
    ...(fetchImpl ? { fetchImpl } : {}),
  })
  if (!first.ok) return first

  const normalized = normalizeAutomationGeneration(first.ir)
  if (normalized.ok) {
    return {
      ok: true,
      draft: normalized.draft,
      note: first.ir.note || undefined,
      model: AUTOMATION_GENERATION_MODEL,
      repaired: false,
    }
  }

  const repair = await requestOpenAiAutomation({
    apiKey,
    instructions,
    request,
    signal,
    repair: { previous: first.ir, errors: normalized.errors },
    ...(fetchImpl ? { fetchImpl } : {}),
  })
  if (!repair.ok) return repair
  const repaired = normalizeAutomationGeneration(repair.ir)
  if (!repaired.ok) {
    return {
      ok: false,
      code: "invalid-output",
      message: `The generated automation did not pass validation: ${repaired.errors.slice(0, 3).join("; ")}`,
      retryable: true,
    }
  }
  return {
    ok: true,
    draft: repaired.draft,
    note: repair.ir.note || undefined,
    model: AUTOMATION_GENERATION_MODEL,
    repaired: true,
  }
}
