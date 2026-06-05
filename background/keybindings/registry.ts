import type { Browser } from "../../shared/types"
import {
  getKeyString,
  normalizeKeybinding,
  splitKeybindingSequence,
} from "../../shared/utils/key-normalizer"
import type { CommandLoadOptions } from "../commands/source"
import { loadKeybindingCommandEntries } from "./source"

export { normalizeKeybinding }

export type KeybindingRegistrySnapshot = {
  bindings: Map<string, string>
  sequencePrefixes: Set<string>
}

const keybindingRegistry = new Map<string, string>()

const createSequencePrefixes = (bindings: Iterable<string>): Set<string> => {
  const prefixes = new Set<string>()

  for (const keybinding of bindings) {
    const strokes = splitKeybindingSequence(keybinding)

    for (let length = 1; length < strokes.length; length += 1) {
      prefixes.add(strokes.slice(0, length).join(", "))
    }
  }

  return prefixes
}

const registerBinding = (
  registry: Map<string, string>,
  commandId: string,
  keybinding: string,
): void => {
  const normalized = normalizeKeybinding(keybinding)
  if (!normalized || registry.has(normalized)) {
    return
  }

  registry.set(normalized, commandId)
}

const buildRegistry = async (
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<Map<string, string>> => {
  const registry = new Map<string, string>()
  const entries = await loadKeybindingCommandEntries(context, options)

  for (const entry of entries) {
    registerBinding(registry, entry.id, entry.keybinding)
  }

  return registry
}

export async function getKeybindingRegistrySnapshot(
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<KeybindingRegistrySnapshot> {
  const bindings = await buildRegistry(context, options)

  return {
    bindings,
    sequencePrefixes: createSequencePrefixes(bindings.keys()),
  }
}

export function matchesKeybinding(
  event: KeyboardEvent,
  keybinding: string,
): boolean {
  const eventKeyString = getKeyString(event)
  const normalizedKeybinding = normalizeKeybinding(keybinding)

  return eventKeyString === normalizedKeybinding
}

export function getCommandIdForKeybinding(
  keybinding: string,
): string | undefined {
  const normalized = normalizeKeybinding(keybinding)
  return keybindingRegistry.get(normalized)
}

export function hasKeybindingStartingWith(prefix: string): boolean {
  const normalizedPrefix = normalizeKeybinding(prefix)
  if (!normalizedPrefix) return false

  return createSequencePrefixes(keybindingRegistry.keys()).has(normalizedPrefix)
}

export function getCommandIdFromSnapshot(
  snapshot: KeybindingRegistrySnapshot,
  keybinding: string,
): string | undefined {
  const normalized = normalizeKeybinding(keybinding)
  return snapshot.bindings.get(normalized)
}

export function snapshotHasKeybindingStartingWith(
  snapshot: KeybindingRegistrySnapshot,
  prefix: string,
): boolean {
  const normalizedPrefix = normalizeKeybinding(prefix)
  if (!normalizedPrefix) return false

  return snapshot.sequencePrefixes.has(normalizedPrefix)
}

export function registerSingleCommand(
  commandId: string,
  keybinding: string,
): void {
  registerBinding(keybindingRegistry, commandId, keybinding)
}

export function registerDynamicCommands(
  commands: Array<{ id: string; keybinding?: string }>,
): void {
  for (const command of commands) {
    if (command.keybinding) {
      registerSingleCommand(command.id, command.keybinding)
    }
  }
}

export async function initializeKeybindingRegistry(
  context?: Browser.Context,
  options?: CommandLoadOptions,
): Promise<void> {
  keybindingRegistry.clear()

  const snapshot = await getKeybindingRegistrySnapshot(context, options)
  for (const [keybinding, commandId] of snapshot.bindings.entries()) {
    keybindingRegistry.set(keybinding, commandId)
  }
}

export function getAllKeybindings(): Map<string, string> {
  return new Map(keybindingRegistry)
}

export async function refreshKeybindingRegistry(): Promise<void> {
  await initializeKeybindingRegistry()
}
