// Architecture: background-only credential storage for automation generation.
// UI callers receive status only; the recoverable key never crosses back out.
import {
  AUTOMATION_GENERATION_MAX_API_KEY_LENGTH,
  AUTOMATION_GENERATION_MODEL,
} from "../../../shared/types/automationGeneration"
import { getBrowserAPI } from "../../../shared/utils/extension-api"

const STORAGE_KEY = "monocle-automation-generation-settings"

type StoredGenerationSettings = {
  version: 1
  apiKey?: string
}

const load = async (): Promise<StoredGenerationSettings> => {
  const result = (await getBrowserAPI().storage.local.get(
    STORAGE_KEY,
  )) as Record<string, StoredGenerationSettings | undefined>
  const stored = result[STORAGE_KEY]
  return stored?.version === 1 ? stored : { version: 1 }
}

export const getAutomationGenerationSettingsStatus = async () => {
  const settings = await load()
  return {
    hasApiKey: Boolean(settings.apiKey),
    model: AUTOMATION_GENERATION_MODEL,
  }
}

export const getAutomationGenerationApiKey = async (): Promise<
  string | undefined
> => (await load()).apiKey

export const setAutomationGenerationApiKey = async (
  apiKey: string,
): Promise<void> => {
  const value = apiKey.trim()
  if (!value) throw new Error("API key cannot be empty")
  if (value.length > AUTOMATION_GENERATION_MAX_API_KEY_LENGTH) {
    throw new Error("API key is too long")
  }
  await getBrowserAPI().storage.local.set({
    [STORAGE_KEY]: {
      version: 1,
      apiKey: value,
    } satisfies StoredGenerationSettings,
  })
}

export const clearAutomationGenerationApiKey = async (): Promise<void> => {
  await getBrowserAPI().storage.local.remove(STORAGE_KEY)
}
