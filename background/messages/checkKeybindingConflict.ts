import type { CheckKeybindingConflictMessage } from "../../types/messaging"
import { allCommands } from "../commands"
import { getAllCommandSettings } from "../commands/settings"

export const checkKeybindingConflict = async ({
  keybinding,
  excludeCommandId,
}: CheckKeybindingConflictMessage) => {
  try {
    // Check default keybindings from all commands
    for (const command of allCommands) {
      if (command.id === excludeCommandId) continue
      if (command.keybinding === keybinding) {
        return {
          hasConflict: true,
          conflictingCommand: {
            id: command.id,
            name: typeof command.name === "string" ? command.name : command.id,
          },
        }
      }
    }

    // Check custom keybindings from settings
    const commandSettings = await getAllCommandSettings()
    for (const [commandId, settings] of Object.entries(commandSettings)) {
      if (commandId === excludeCommandId) continue
      if (settings.keybinding === keybinding) {
        // Find the command to get its name
        const command = allCommands.find((c: any) => c.id === commandId)
        return {
          hasConflict: true,
          conflictingCommand: {
            id: commandId,
            name:
              command && typeof command.name === "string"
                ? command.name
                : commandId,
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
