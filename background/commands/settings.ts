import { merge } from "lodash"
import type {
  CommandSettingKey,
  CommandSettings,
  CommandUrlRulesSetting,
  NewTabSettings,
  Settings,
  ThemeSettings,
  UrlRules,
} from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"

// Cross-browser compatibility layer
const browserAPI = getBrowserAPI()

const STORAGE_KEY = "monocle-settings"

const isEmptyObject = (value: object): boolean => {
  return Object.keys(value).length === 0
}

const pruneUrlRules = (urlRules?: UrlRules): UrlRules | undefined => {
  if (!urlRules) {
    return undefined
  }

  const nextRules: UrlRules = {}

  if (urlRules.allowUrls !== undefined) {
    nextRules.allowUrls = urlRules.allowUrls
  }

  if (urlRules.denyUrls !== undefined) {
    nextRules.denyUrls = urlRules.denyUrls
  }

  return isEmptyObject(nextRules) ? undefined : nextRules
}

const pruneCommandSettings = (
  commandSettings: CommandSettings,
): CommandSettings => {
  const nextSettings: CommandSettings = {}

  if (commandSettings.keybinding !== undefined) {
    nextSettings.keybinding = commandSettings.keybinding
  }

  const urlRules = pruneUrlRules(commandSettings.urlRules)
  if (urlRules) {
    nextSettings.urlRules = urlRules
  }

  return nextSettings
}

export const mergeCommandSettings = (
  existingSettings: CommandSettings,
  partialSettings: Partial<CommandSettings>,
): CommandSettings => {
  const mergedSettings: CommandSettings = {
    ...existingSettings,
    ...partialSettings,
  }

  if ("urlRules" in partialSettings) {
    mergedSettings.urlRules =
      partialSettings.urlRules === undefined
        ? undefined
        : {
            ...existingSettings.urlRules,
            ...partialSettings.urlRules,
          }
  }

  return pruneCommandSettings(mergedSettings)
}

// Load settings from storage
const loadSettings = async (): Promise<Settings> => {
  try {
    const result = (await browserAPI.storage.local.get(STORAGE_KEY)) as Record<
      string,
      Settings | undefined
    >
    const settings = result[STORAGE_KEY] || {}

    return {
      theme: settings.theme || {},
      newTab: settings.newTab || {},
      commands: settings.commands || {},
    }
  } catch (error) {
    console.error("Failed to load settings:", error)
    return {
      theme: {},
      newTab: {},
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
  const nextSettings = mergeCommandSettings(existingSettings, partialSettings)

  if (isEmptyObject(nextSettings)) {
    delete settings.commands[commandId]
  } else {
    settings.commands[commandId] = nextSettings
  }

  await saveSettings(settings)
}

// Update URL rules for a command while preserving sibling rule lists
export const updateCommandUrlRules = async (
  commandId: string,
  urlRules: CommandUrlRulesSetting,
): Promise<void> => {
  await updateCommandSettings(commandId, {
    urlRules,
  })
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

// Remove one command setting field while preserving sibling settings
export const removeCommandSetting = async (
  commandId: string,
  setting: CommandSettingKey,
): Promise<void> => {
  const settings = await loadSettings()
  const existingSettings = settings.commands?.[commandId]

  if (!existingSettings) {
    return
  }

  const nextSettings: CommandSettings = { ...existingSettings }
  delete nextSettings[setting]

  const prunedSettings = pruneCommandSettings(nextSettings)

  if (isEmptyObject(prunedSettings)) {
    if (settings.commands) {
      delete settings.commands[commandId]
    }
  } else if (settings.commands) {
    settings.commands[commandId] = prunedSettings
  }

  await saveSettings(settings)
}

// Get theme settings
export const getThemeSettings = async (): Promise<ThemeSettings> => {
  const settings = await loadSettings()
  return settings.theme || {}
}

// Set theme settings
export const setThemeSettings = async (
  themeSettings: ThemeSettings,
): Promise<void> => {
  const settings = await loadSettings()
  settings.theme = themeSettings
  await saveSettings(settings)
}

// Update theme settings (merging with existing)
export const updateThemeSettings = async (
  partialSettings: Partial<ThemeSettings>,
): Promise<void> => {
  const settings = await loadSettings()

  const existingTheme = settings.theme || {}
  settings.theme = {
    ...existingTheme,
    ...partialSettings,
  }

  await saveSettings(settings)
}

// Get new tab settings
export const getNewTabSettings = async (): Promise<NewTabSettings> => {
  const settings = await loadSettings()
  return settings.newTab || {}
}

// Set new tab settings
export const setNewTabSettings = async (
  newTabSettings: NewTabSettings,
): Promise<void> => {
  const settings = await loadSettings()
  settings.newTab = newTabSettings
  await saveSettings(settings)
}

// Update new tab settings (merging with existing)
export const updateNewTabSettings = async (
  partialSettings: Partial<NewTabSettings>,
): Promise<void> => {
  const settings = await loadSettings()

  const existingNewTab = settings.newTab || {}
  settings.newTab = merge(existingNewTab, partialSettings)

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

// Convenience methods for nested newTab settings access

// Get new tab clock settings
export const getNewTabClockSettings = async () => {
  const settings = await getNewTabSettings()
  return settings.clock || {}
}

// Update new tab clock settings
export const updateNewTabClockSettings = async (
  clockSettings: Partial<NonNullable<NewTabSettings["clock"]>>,
): Promise<void> => {
  await updateNewTabSettings({
    clock: clockSettings,
  })
}

// Get new tab greeting settings
export const getNewTabGreetingSettings = async () => {
  const settings = await getNewTabSettings()
  return settings.greeting || {}
}

// Update new tab greeting settings
export const updateNewTabGreetingSettings = async (
  greetingSettings: Partial<NonNullable<NewTabSettings["greeting"]>>,
): Promise<void> => {
  await updateNewTabSettings({
    greeting: greetingSettings,
  })
}
