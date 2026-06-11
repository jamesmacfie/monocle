import type { UpdateCommandKeybindingsMessage } from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { resolveCommandById } from "../commands/query"
import { updateCommandKeybindings as updateCommandKeybindingsSettings } from "../commands/settings"
import { getSettingsCatalogCommandById } from "../commands/settingsCatalog"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { allowsKeybinding } from "../utils/commands"

type PreparedKeybindingUpdate = {
  commandId: string
  keybinding: string | null
}

const canAssignKeybinding = async (
  commandId: string,
  message: UpdateCommandKeybindingsMessage,
  siteSdk: Awaited<ReturnType<typeof prepareSiteSdkCommandLoadOptions>>,
): Promise<boolean> => {
  const resolved = await resolveCommandById(commandId, message.context, {
    siteSdk,
  })

  if (resolved) {
    return allowsKeybinding(resolved.command)
  }

  const catalogCommand = await getSettingsCatalogCommandById(commandId)
  return catalogCommand?.capabilities.canSetKeybinding === true
}

export async function updateCommandKeybindings(
  message: UpdateCommandKeybindingsMessage,
  sender?: any,
) {
  const siteSdk = await prepareSiteSdkCommandLoadOptions(
    sender,
    message.context,
  )
  const preparedUpdates: PreparedKeybindingUpdate[] = []

  for (const update of message.updates) {
    const normalizedKeybinding = normalizeKeybinding(update.keybinding || "")

    if (!normalizedKeybinding) {
      preparedUpdates.push({
        commandId: update.commandId,
        keybinding: null,
      })
      continue
    }

    if (!(await canAssignKeybinding(update.commandId, message, siteSdk))) {
      throw new Error(
        `Command cannot be assigned a keybinding: ${update.commandId}`,
      )
    }

    preparedUpdates.push({
      commandId: update.commandId,
      keybinding: normalizedKeybinding,
    })
  }

  await updateCommandKeybindingsSettings(preparedUpdates)
  await refreshKeybindingRegistry()

  return { success: true, updated: preparedUpdates.length }
}
