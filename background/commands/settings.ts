import type { CommandSettings, GlobalSettings, Settings } from "../../types/"

// Cross-browser compatibility layer
const browserAPI = typeof browser !== "undefined" ? browser : chrome

const STORAGE_KEY = "monocle-settings"

// Load settings from storage
const loadSettings = async (): Promise<Settings> => {
  try {
    const result = await browserAPI.storage.local.get(STORAGE_KEY)
    const settings = result[STORAGE_KEY] || {}

    return {
      global: settings.global || {},
      commands: settings.commands || {},
    }
  } catch (error) {
    console.error("Failed to load settings:", error)
    return {
      global: {},
      commands: {},
    }
  }
}

// Save settings to storage
const saveSettings = async (settings: Settings): Promise<void> => {
  try {
    await browserAPI.storage.local.set({
      [STORAGE_KEY]: settings,
    })
  } catch (error) {
    console.error("Failed to save settings:", error)
  }
}

// Get settings for a specific command
export const getCommandSettings = async (
  commandId: string,
): Promise<CommandSettings | undefined> => {
  const settings = await loadSettings()
  return settings.commands?.[commandId]
}

// Get all command settings
export const getAllCommandSettings = async (): Promise<
  Record<string, CommandSettings>
> => {
  const settings = await loadSettings()
  return settings.commands || {}
}

// Set settings for a specific command
export const setCommandSettings = async (
  commandId: string,
  commandSettings: CommandSettings,
): Promise<void> => {
  const settings = await loadSettings()

  if (!settings.commands) {
    settings.commands = {}
  }

  settings.commands[commandId] = commandSettings
  await saveSettings(settings)
}

// Update settings for a specific command (merging with existing)
export const updateCommandSettings = async (
  commandId: string,
  partialSettings: Partial<CommandSettings>,
): Promise<void> => {
  const settings = await loadSettings()

  if (!settings.commands) {
    settings.commands = {}
  }

  const existingSettings = settings.commands[commandId] || {}
  settings.commands[commandId] = {
    ...existingSettings,
    ...partialSettings,
  }

  await saveSettings(settings)
}

// Remove settings for a specific command
export const removeCommandSettings = async (
  commandId: string,
): Promise<void> => {
  const settings = await loadSettings()

  if (settings.commands?.[commandId]) {
    delete settings.commands[commandId]
    await saveSettings(settings)
  }
}

// Get global settings
export const getGlobalSettings = async (): Promise<GlobalSettings> => {
  const settings = await loadSettings()
  return settings.global || {}
}

// Set global settings
export const setGlobalSettings = async (
  globalSettings: GlobalSettings,
): Promise<void> => {
  const settings = await loadSettings()
  settings.global = globalSettings
  await saveSettings(settings)
}

// Update global settings (merging with existing)
export const updateGlobalSettings = async (
  partialSettings: Partial<GlobalSettings>,
): Promise<void> => {
  const settings = await loadSettings()

  const existingGlobal = settings.global || {}
  settings.global = {
    ...existingGlobal,
    ...partialSettings,
  }

  await saveSettings(settings)
}

// Clear all settings
export const clearAllSettings = async (): Promise<void> => {
  try {
    await browserAPI.storage.local.remove(STORAGE_KEY)
  } catch (error) {
    console.error("Failed to clear settings:", error)
  }
}

// Get all settings
export const getAllSettings = async (): Promise<Settings> => {
  return await loadSettings()
}
