import type { Command } from "../../types";
import { browserCommands } from "../commands/browser";
import { toolCommands } from "../commands/tools";
import { firefoxCommands } from "../commands/browser/firefox";
import { debug } from "../commands/debug";
import { isFirefox } from "../utils/browser";
import { match } from "ts-pattern";

// Map of keybinding string to command ID
const keybindingRegistry = new Map<string, string>();

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
    .trim();
}

// Parse keybinding string into key components
export function parseKeybinding(keybinding: string): {
  key: string;
  cmd: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
} {
  const normalized = normalizeKeybinding(keybinding);
  const parts = normalized.split(/[\s+]+/);

  const result = {
    key: "",
    cmd: false,
    ctrl: false,
    alt: false,
    shift: false,
  };

  for (const part of parts) {
    match(part)
      .with("cmd", () => {
        result.cmd = true;
      })
      .with("ctrl", () => {
        result.ctrl = true;
      })
      .with("alt", () => {
        result.alt = true;
      })
      .with("shift", () => {
        result.shift = true;
      })
      .otherwise(() => {
        result.key = part;
      });
  }

  return result;
}

// Check if keyboard event matches keybinding
export function matchesKeybinding(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  keybinding: string
): boolean {
  const parsed = parseKeybinding(keybinding);
  const eventKey = event.key.toLowerCase();

  const matches = (
    eventKey === parsed.key &&
    event.metaKey === parsed.cmd &&
    event.ctrlKey === parsed.ctrl &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );

  return matches;
}

// Register a command's keybinding
function registerCommand(command: Command): void {
  if (command.keybinding) {
    const normalized = normalizeKeybinding(command.keybinding);
    keybindingRegistry.set(normalized, command.id);
  }

  // Also register action keybindings
  if (command.actions) {
    for (const action of command.actions) {
      registerCommand(action);
    }
  }
}

// Initialize the registry with all commands
export async function initializeKeybindingRegistry(): Promise<void> {
  keybindingRegistry.clear();

  // Register browser commands
  for (const command of browserCommands) {
    registerCommand(command);
  }

  // Register tool commands
  for (const command of toolCommands) {
    registerCommand(command);
  }

  // Register Firefox-specific commands
  if (isFirefox) {
    for (const command of firefoxCommands) {
      registerCommand(command);
    }
  }
  // Register debug command
  registerCommand(debug);
}

// Get command ID for a keybinding
export function getCommandIdForKeybinding(keybinding: string): string | undefined {
  const normalized = normalizeKeybinding(keybinding);
  const commandId = keybindingRegistry.get(normalized);
  return commandId;
}

// Get all registered keybindings
export function getAllKeybindings(): Map<string, string> {
  return new Map(keybindingRegistry);
} 