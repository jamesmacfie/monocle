import type {
  CommandNode,
  CommandSettings,
  KeybindingBehavior,
  KeybindingRequirements,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import {
  allowsKeybinding,
  getKeybindingBehavior,
  getKeybindingRequirements,
} from "../utils/commands"

export type KeybindingTargetMetadata = {
  allowed: boolean
  behavior: KeybindingBehavior
  defaultKeybinding?: string
  effectiveKeybinding?: string
  requirements?: KeybindingRequirements
}

export const getKeybindingTargetMetadata = (
  command: CommandNode,
  settings?: CommandSettings,
): KeybindingTargetMetadata => {
  const behavior = getKeybindingBehavior(command)

  if (!allowsKeybinding(command)) {
    return { allowed: false, behavior }
  }

  const defaultKeybinding =
    normalizeKeybinding(command.keybinding || "") || undefined
  const effectiveKeybinding =
    normalizeKeybinding(settings?.keybinding || defaultKeybinding || "") ||
    undefined

  return {
    allowed: true,
    behavior,
    defaultKeybinding,
    effectiveKeybinding,
    requirements: getKeybindingRequirements(command),
  }
}

export const resolveEffectiveKeybinding = (
  command: CommandNode,
  settings?: CommandSettings,
): string =>
  getKeybindingTargetMetadata(command, settings).effectiveKeybinding ?? ""
