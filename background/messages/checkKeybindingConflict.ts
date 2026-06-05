import type { CheckKeybindingConflictMessage } from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { loadKeybindingCommandEntries } from "../keybindings/source"

export const checkKeybindingConflict = async ({
  keybinding,
  excludeCommandId,
  context,
}: CheckKeybindingConflictMessage) => {
  try {
    const normalizedKeybinding = normalizeKeybinding(keybinding)
    if (!normalizedKeybinding) {
      return { hasConflict: false, conflictingCommand: null }
    }

    const commands = await loadKeybindingCommandEntries(context)

    for (const command of commands) {
      if (command.id === excludeCommandId) continue

      if (normalizeKeybinding(command.keybinding) === normalizedKeybinding) {
        return {
          hasConflict: true,
          conflictingCommand: {
            id: command.id,
            name: command.name,
          },
        }
      }
    }

    return { hasConflict: false, conflictingCommand: null }
  } catch (error) {
    console.error("[checkKeybindingConflict] Error checking conflict:", error)
    return { hasConflict: false, conflictingCommand: null }
  }
}
