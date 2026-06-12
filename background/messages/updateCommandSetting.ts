import type {
  CommandUrlRulesSetting,
  KeybindingRequirements,
  UpdateCommandSettingMessage,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { validateKeybindingRequirements } from "../../shared/utils/keybinding-requirements"
import { resolveCommandById } from "../commands/query"
import { invalidateSearchIndex } from "../commands/searchIndex"
import {
  removeCommandSetting,
  updateCommandSettings,
  updateCommandUrlRules,
} from "../commands/settings"
import { getSettingsCatalogCommandById } from "../commands/settingsCatalog"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { invalidateKeybindingEntriesCache } from "../keybindings/source"
import { allowsKeybinding, getKeybindingRequirements } from "../utils/commands"
import { validateUrlPattern } from "../utils/urlFilter"
import { showToast } from "./showToast"

const validateUrlRulesSetting = (urlRules: CommandUrlRulesSetting): void => {
  for (const [field, patterns] of Object.entries(urlRules)) {
    if (patterns === undefined) {
      continue
    }

    if (!Array.isArray(patterns)) {
      throw new Error(`${field} must be an array of URL patterns`)
    }

    for (const pattern of patterns) {
      const validation = validateUrlPattern(pattern)
      if (validation !== true) {
        throw new Error(`Invalid pattern "${pattern}": ${validation}`)
      }
    }
  }
}

type KeybindingTarget =
  | { allowed: false }
  | { allowed: true; requirements?: KeybindingRequirements }

const resolveKeybindingTarget = async (
  commandId: string,
  message: UpdateCommandSettingMessage,
  siteSdk: Awaited<ReturnType<typeof prepareSiteSdkCommandLoadOptions>>,
): Promise<KeybindingTarget> => {
  const resolved = await resolveCommandById(commandId, message.context, {
    siteSdk,
  })

  if (resolved) {
    return allowsKeybinding(resolved.command)
      ? {
          allowed: true,
          requirements: getKeybindingRequirements(resolved.command),
        }
      : { allowed: false }
  }

  const catalogCommand = await getSettingsCatalogCommandById(commandId)
  return catalogCommand?.capabilities.canSetKeybinding === true
    ? { allowed: true, requirements: catalogCommand.keybindingRequirements }
    : { allowed: false }
}

export async function updateCommandSetting(
  message: UpdateCommandSettingMessage,
  sender?: any,
) {
  const { commandId, setting, value } = message
  const siteSdk = await prepareSiteSdkCommandLoadOptions(
    sender,
    message.context,
  )

  if (setting === "keybinding") {
    const settingValue = normalizeKeybinding(String(value ?? ""))

    if (!settingValue) {
      await removeCommandSetting(commandId, "keybinding")
      await refreshKeybindingRegistry()
      return { success: true }
    }

    const target = await resolveKeybindingTarget(commandId, message, siteSdk)
    if (!target.allowed) {
      throw new Error(`Command cannot be assigned a keybinding: ${commandId}`)
    }

    // Per-command requirement gate (e.g. snippet bindings must carry a
    // non-shift modifier in every stroke). The capture UIs block earlier via
    // check-keybinding-conflict; this is the backstop on persist.
    const requirementResult = validateKeybindingRequirements(
      settingValue,
      target.requirements,
    )
    if (!requirementResult.valid) {
      throw new Error(
        `Keybinding not allowed for ${commandId}: ${requirementResult.message}`,
      )
    }

    await updateCommandSettings(commandId, {
      keybinding: settingValue,
    })
    await refreshKeybindingRegistry()

    // Show success toast for keybinding updates
    await showToast({
      type: "show-toast",
      level: "success",
      message: `Keybinding set to ${settingValue}`,
    })
  }

  if (setting === "urlRules") {
    validateUrlRulesSetting(value)
    await updateCommandUrlRules(commandId, value)
    invalidateSearchIndex()
    // URL rules change which commands are visible to the keybinding source.
    invalidateKeybindingEntriesCache()
  }

  if (setting === "hidden") {
    await updateCommandSettings(commandId, {
      hidden: value,
    })
    await refreshKeybindingRegistry()
    invalidateSearchIndex()
  }

  return { success: true }
}
