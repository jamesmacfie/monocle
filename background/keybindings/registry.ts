import { match } from "ts-pattern"
import type { Command } from "../../types/"
import { browserCommands } from "../commands/browser"
import { firefoxCommands } from "../commands/browser/firefox"
import { debug } from "../commands/debug"
import { getAllCommandSettings } from "../commands/settings"
import { toolCommands } from "../commands/tools"
import { isFirefox } from "../utils/browser"

// Map of keybinding string to command ID
const keybindingRegistry = new Map<string, string>()

// Convert keybinding string to normalized format
function normalizeKeybinding(keybinding: string): string {
  return keybinding
    .toLowerCase()
    .replace(/⌘/g, "cmd")
    .replace(/⌥/g, "alt")
    .replace(/⇧/g, "shift")
    .replace(/⌃/g, "ctrl")
    .replace(/↵/g, "enter")
    .replace(/\s+/g, " ")
    .trim()
}

// Parse keybinding string into key components
export function parseKeybinding(keybinding: string): {
  key: string
  cmd: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
} {
  const normalized = normalizeKeybinding(keybinding)
  const parts = normalized.split(/[\s+]+/)

  const result = {
    key: "",
    cmd: false,
    ctrl: false,
    alt: false,
    shift: false,
  }

  for (const part of parts) {
    match(part)
      .with("cmd", () => {
        result.cmd = true
      })
      .with("ctrl", () => {
        result.ctrl = true
      })
      .with("alt", () => {
        result.alt = true
      })
      .with("shift", () => {
        result.shift = true
      })
      .otherwise(() => {
        result.key = part
      })
  }

  return result
}

// Check if keyboard event matches keybinding
export function matchesKeybinding(
  event: {
    key: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
  },
  keybinding: string,
): boolean {
  const parsed = parseKeybinding(keybinding)
  const eventKey = event.key.toLowerCase()

  const matches =
    eventKey === parsed.key &&
    event.metaKey === parsed.cmd &&
    event.ctrlKey === parsed.ctrl &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift

  return matches
}

// Register a command's keybinding with settings override
function registerCommand(
  command: Command,
  commandSettings: Record<string, any>,
): void {
  // Use settings keybinding if available, otherwise use command's default
  const keybinding =
    commandSettings[command.id]?.keybinding || command.keybinding

  if (keybinding) {
    const normalized = normalizeKeybinding(keybinding)
    keybindingRegistry.set(normalized, command.id)
  }

  // Actions should not be registered globally - they only work within action menus
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
  // Register debug command
  registerCommand(debug, commandSettings)
}

// Get command ID for a keybinding
export function getCommandIdForKeybinding(
  keybinding: string,
): string | undefined {
  const normalized = normalizeKeybinding(keybinding)
  const commandId = keybindingRegistry.get(normalized)
  return commandId
}

// Get all registered keybindings
export function getAllKeybindings(): Map<string, string> {
  return new Map(keybindingRegistry)
}

// Refresh the registry (useful when settings change)
export async function refreshKeybindingRegistry(): Promise<void> {
  await initializeKeybindingRegistry()
}
