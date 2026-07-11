import type { AutomationDraft } from "./automationValidation"

export const AUTOMATION_GENERATION_MODEL = "gpt-5.6-terra"
export const AUTOMATION_GENERATION_ORIGIN = "https://api.openai.com/*"
export const AUTOMATION_GENERATION_MAX_REQUEST_LENGTH = 10_000
export const AUTOMATION_GENERATION_MAX_API_KEY_LENGTH = 512

export type AutomationGenerationSettingsStatus = {
  hasApiKey: boolean
  model: string
}

export type AutomationGenerationErrorCode =
  | "missing-api-key"
  | "permission-denied"
  | "busy"
  | "cancelled"
  | "timeout"
  | "network"
  | "invalid-api-key"
  | "forbidden"
  | "rate-limited"
  | "quota-exceeded"
  | "model-unavailable"
  | "refusal"
  | "incomplete"
  | "invalid-output"
  | "service-error"

export type AutomationGenerationFailure = {
  ok: false
  code: AutomationGenerationErrorCode
  message: string
  retryable: boolean
  requestId?: string
}

export type AutomationGenerationSuccess = {
  ok: true
  draft: AutomationDraft
  note?: string
  model: string
  repaired: boolean
}

export type AutomationGenerationResult =
  | AutomationGenerationSuccess
  | AutomationGenerationFailure
