import type {
  UpdateCommandKeybindingsConflict,
  UpdateCommandKeybindingsMessage,
  UpdateCommandKeybindingsResponse,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { resolveCommandById } from "../commands/query"
import { updateCommandKeybindings as updateCommandKeybindingsSettings } from "../commands/settings"
import { getSettingsCatalogCommandById } from "../commands/settingsCatalog"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { loadKeybindingCommandEntries } from "../keybindings/source"
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
): Promise<UpdateCommandKeybindingsResponse> {
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

  // Conflict detection: an update loses when its keybinding is already held by
  // a command outside this batch, or was claimed by an earlier update in the
  // same batch. Conflicting updates are skipped and reported, not thrown — the
  // rest of the batch still persists.
  const batchCommandIds = new Set(preparedUpdates.map((u) => u.commandId))
  const existingEntries = await loadKeybindingCommandEntries(message.context, {
    siteSdk,
  })
  const existingByBinding = new Map<string, { id: string; name: string }>()

  for (const entry of existingEntries) {
    if (batchCommandIds.has(entry.id)) {
      continue
    }

    const normalized = normalizeKeybinding(entry.keybinding)
    if (normalized && !existingByBinding.has(normalized)) {
      existingByBinding.set(normalized, { id: entry.id, name: entry.name })
    }
  }

  const conflicts: UpdateCommandKeybindingsConflict[] = []
  const applicableUpdates: PreparedKeybindingUpdate[] = []
  const claimedInBatch = new Map<string, string>()

  for (const update of preparedUpdates) {
    if (!update.keybinding) {
      applicableUpdates.push(update)
      continue
    }

    const existing = existingByBinding.get(update.keybinding)
    if (existing) {
      conflicts.push({
        commandId: update.commandId,
        keybinding: update.keybinding,
        conflictingCommand: existing,
      })
      continue
    }

    const claimedBy = claimedInBatch.get(update.keybinding)
    if (claimedBy) {
      conflicts.push({
        commandId: update.commandId,
        keybinding: update.keybinding,
        conflictingCommand: { id: claimedBy, name: claimedBy },
      })
      continue
    }

    claimedInBatch.set(update.keybinding, update.commandId)
    applicableUpdates.push(update)
  }

  await updateCommandKeybindingsSettings(applicableUpdates)
  await refreshKeybindingRegistry()

  return { success: true, updated: applicableUpdates.length, conflicts }
}
