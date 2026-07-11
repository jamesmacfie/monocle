// Architecture: background message boundary for OpenAI-backed generation.
// Settings return status only; generation rechecks browser permissions and is
// cancellable/concurrency-bounded before any remote request starts.
import type {
  CancelAutomationGenerationMessage,
  CancelAutomationGenerationResponse,
  ClearAutomationGenerationApiKeyMessage,
  ClearAutomationGenerationApiKeyResponse,
  GenerateAutomationMessage,
  GenerateAutomationResponse,
  GetAutomationGenerationSettingsMessage,
  GetAutomationGenerationSettingsResponse,
  SetAutomationGenerationApiKeyMessage,
  SetAutomationGenerationApiKeyResponse,
} from "../../shared/types"
import { AUTOMATION_GENERATION_ORIGIN } from "../../shared/types/automationGeneration"
import { isFirefox } from "../../shared/utils/browser"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { generateAutomationDraft } from "../automations/generation/service"
import {
  clearAutomationGenerationApiKey,
  getAutomationGenerationSettingsStatus,
  setAutomationGenerationApiKey,
} from "../automations/generation/settings"
import { hasOutboundDataConsent } from "../automations/outboundDataConsent"

const activeGenerations = new Map<string, AbortController>()

export const getAutomationGenerationSettings = async (
  _message: GetAutomationGenerationSettingsMessage,
): Promise<GetAutomationGenerationSettingsResponse> =>
  await getAutomationGenerationSettingsStatus()

export const setAutomationGenerationKey = async (
  message: SetAutomationGenerationApiKeyMessage,
): Promise<SetAutomationGenerationApiKeyResponse | { error: string }> => {
  try {
    await setAutomationGenerationApiKey(message.apiKey)
    return {
      saved: true,
      status: await getAutomationGenerationSettingsStatus(),
    }
  } catch {
    return { error: "Failed to save the OpenAI API key" }
  }
}

export const clearAutomationGenerationKey = async (
  _message: ClearAutomationGenerationApiKeyMessage,
): Promise<ClearAutomationGenerationApiKeyResponse | { error: string }> => {
  try {
    await clearAutomationGenerationApiKey()
    return {
      cleared: true,
      status: await getAutomationGenerationSettingsStatus(),
    }
  } catch {
    return { error: "Failed to remove the OpenAI API key" }
  }
}

const hasOpenAiPermission = async (): Promise<boolean> => {
  const permissions = getBrowserAPI().permissions as unknown as {
    contains: (request: { origins: string[] }) => Promise<boolean>
  }
  return await permissions.contains({ origins: [AUTOMATION_GENERATION_ORIGIN] })
}

export const generateAutomationMessage = async (
  message: GenerateAutomationMessage,
): Promise<GenerateAutomationResponse> => {
  if (activeGenerations.size > 0) {
    return {
      ok: false,
      code: "busy",
      message: "Another automation is already being generated.",
      retryable: true,
    }
  }
  if (
    !(await hasOpenAiPermission()) ||
    (isFirefox && !(await hasOutboundDataConsent()))
  ) {
    return {
      ok: false,
      code: "permission-denied",
      message: "Grant OpenAI endpoint access before generating an automation.",
      retryable: false,
    }
  }

  const controller = new AbortController()
  activeGenerations.set(message.generationId, controller)
  try {
    return await generateAutomationDraft({
      request: message.request,
      signal: controller.signal,
    })
  } finally {
    activeGenerations.delete(message.generationId)
  }
}

export const cancelAutomationGeneration = async (
  message: CancelAutomationGenerationMessage,
): Promise<CancelAutomationGenerationResponse> => {
  const controller = activeGenerations.get(message.generationId)
  controller?.abort()
  return { cancelled: Boolean(controller) }
}
