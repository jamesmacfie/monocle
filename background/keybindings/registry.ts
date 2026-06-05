import type { CommandNode } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"
import {
  getKeyString,
  normalizeKeybinding,
} from "../../shared/utils/key-normalizer"
import { browserCommands } from "../commands/browser"
import { firefoxCommands } from "../commands/browser/firefox"
import { getAllCommandSettings } from "../commands/settings"
import { toolCommands } from "../commands/tools"
import { allowsKeybinding } from "../utils/commands"

// Re-export for compatibility
export { normalizeKeybinding }

// Map of keybinding string to command ID
const keybindingRegistry = new Map<string, string>()

// Check if keyboard event matches keybinding (using canonical format)
export function matchesKeybinding(
  event: KeyboardEvent,
  keybinding: string,
): boolean {
  const eventKeyString = getKeyString(event)
  const normalizedKeybinding = normalizeKeybinding(keybinding)

  return eventKeyString === normalizedKeybinding
}

// --- Sequence helpers ---

// Returns the command ID if the full keybinding (single or sequence) matches
export function getCommandIdForKeybinding(
  keybinding: string,
): string | undefined {
  const normalized = normalizeKeybinding(keybinding)

  const commandId = keybindingRegistry.get(normalized)
  return commandId
}

// Returns true if any registered keybinding starts with the given prefix (sequence)
export function hasKeybindingStartingWith(prefix: string): boolean {
  const normalizedPrefix = normalizeKeybinding(prefix)
  const prefixStrokes = normalizedPrefix
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  for (const key of keybindingRegistry.keys()) {
    const candidateStrokes = key
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    if (candidateStrokes.length > prefixStrokes.length) {
      let startsWith = true
      for (let i = 0; i < prefixStrokes.length; i++) {
        if (candidateStrokes[i] !== prefixStrokes[i]) {
          startsWith = false
          break
        }
      }
      if (startsWith) return true
    }
  }
  return false
}

// Register a command's keybinding with settings override
function registerCommand(
  command: CommandNode,
  commandSettings: Record<string, any>,
): void {
  if (!allowsKeybinding(command)) {
    return
  }

  // Use settings keybinding if available, otherwise use command's default
  const id = command.id
  const defaultKey = "keybinding" in command ? command.keybinding : undefined
  const keybinding = commandSettings[id]?.keybinding || defaultKey

  if (keybinding) {
    const normalized = normalizeKeybinding(keybinding)
    keybindingRegistry.set(normalized, id)
  }

  // Actions should not be registered globally - they only work within action menus
}

// Register a single command with its keybinding
export function registerSingleCommand(
  commandId: string,
  keybinding: string,
): void {
  if (keybinding) {
    const normalized = normalizeKeybinding(keybinding)
    keybindingRegistry.set(normalized, commandId)
  }
}

// Register multiple commands from dynamic sources (like deep search)
export function registerDynamicCommands(
  commands: Array<{ id: string; keybinding?: string }>,
): void {
  for (const command of commands) {
    if (command.keybinding) {
      registerSingleCommand(command.id, command.keybinding)
    }
  }
}

// Initialize the registry with all commands
export async function initializeKeybindingRegistry(): Promise<void> {
  keybindingRegistry.clear()

  // Load user settings for keybinding overrides
  const commandSettings = await getAllCommandSettings()

  // Register browser commands
  for (const command of browserCommands) {
    registerCommand(command, commandSettings)
  }

  // Register tool commands
  for (const command of toolCommands) {
    registerCommand(command, commandSettings)
  }

  // Register Firefox-specific commands
  if (isFirefox) {
    for (const command of firefoxCommands) {
      registerCommand(command, commandSettings)
    }
  }

  // Register deep search commands that have keybindings
  await registerDeepSearchCommands(commandSettings)
}

// Register deep search commands with keybindings
async function registerDeepSearchCommands(
  commandSettings: Record<string, any>,
): Promise<void> {
  try {
    // Import dynamically to avoid circular dependencies
    const { getDeepSearchCommands } = await import(
      "../messages/getDeepSearchCommands"
    )
    const { deepSearchItems } = await getDeepSearchCommands()

    // Register keybindings for deep search items that have them
    for (const item of deepSearchItems) {
      // Check if the command has a keybinding (either from settings or default)
      const settingsKeybinding = commandSettings[item.id]?.keybinding
      const defaultKeybinding = item.keybinding
      const keybinding = settingsKeybinding || defaultKeybinding

      if (keybinding) {
        registerSingleCommand(item.id, keybinding)
      }
    }
  } catch (error) {
    console.error(
      "[KeybindingRegistry] Failed to register deep search commands:",
      error,
    )
  }
}

// Get command ID for a keybinding
// Get all registered keybindings
export function getAllKeybindings(): Map<string, string> {
  return new Map(keybindingRegistry)
}

// Refresh the registry (useful when settings change)
export async function refreshKeybindingRegistry(): Promise<void> {
  await initializeKeybindingRegistry()
}
