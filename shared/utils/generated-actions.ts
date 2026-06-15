import type { Browser } from "../types"

export type GeneratedCommandAction =
  | {
      type: "favorite"
      targetCommandId: string
    }
  | {
      type: "setKeybinding"
      targetCommandId: string
    }
  | {
      type: "resetKeybinding"
      targetCommandId: string
    }
  | {
      type: "hideDomain"
      targetCommandId: string
    }
  | {
      type: "hideCommand"
      targetCommandId: string
    }
  | {
      type: "modifier"
      targetCommandId: string
      modifierKey: Browser.ModifierKey
    }
  | {
      type: "primary"
      targetCommandId: string
    }

export const GENERATED_ACTION_PREFIXES = [
  "toggle-favorite-",
  "set-keybinding-",
  "reset-keybinding-",
  "hide-from-domain-",
  "hide-command-",
] as const

export const GENERATED_ACTION_SUFFIXES = [
  "-enter-action",
  "-cmd-enter-action",
  "-shift-enter-action",
  "-alt-enter-action",
  "-ctrl-enter-action",
] as const

const generatedPrefixes = [
  { prefix: "toggle-favorite-", type: "favorite" as const },
  { prefix: "set-keybinding-", type: "setKeybinding" as const },
  { prefix: "reset-keybinding-", type: "resetKeybinding" as const },
  { prefix: "hide-from-domain-", type: "hideDomain" as const },
  { prefix: "hide-command-", type: "hideCommand" as const },
]

export const generatedActionIds = {
  favorite: (targetCommandId: string): string =>
    `toggle-favorite-${targetCommandId}`,
  setKeybinding: (targetCommandId: string): string =>
    `set-keybinding-${targetCommandId}`,
  resetKeybinding: (targetCommandId: string): string =>
    `reset-keybinding-${targetCommandId}`,
  hideDomain: (targetCommandId: string): string =>
    `hide-from-domain-${targetCommandId}`,
  hideCommand: (targetCommandId: string): string =>
    `hide-command-${targetCommandId}`,
  modifier: (
    targetCommandId: string,
    modifierKey: Browser.ModifierKey,
  ): string => `${targetCommandId}-${modifierKey}-enter-action`,
  primary: (targetCommandId: string): string =>
    `${targetCommandId}-enter-action`,
} as const

export const parseGeneratedCommandAction = (
  id: string,
): GeneratedCommandAction | null => {
  for (const { prefix, type } of generatedPrefixes) {
    if (id.startsWith(prefix)) {
      return {
        type,
        targetCommandId: id.slice(prefix.length),
      }
    }
  }

  const modifierMatch = id.match(/^(.*)-(cmd|shift|alt|ctrl)-enter-action$/)
  if (modifierMatch) {
    return {
      type: "modifier",
      targetCommandId: modifierMatch[1],
      modifierKey: modifierMatch[2] as Browser.ModifierKey,
    }
  }

  if (id.endsWith("-enter-action")) {
    return {
      type: "primary",
      targetCommandId: id.slice(0, -"enter-action".length - 1),
    }
  }

  return null
}

export const isGeneratedCommandActionId = (id: string): boolean =>
  parseGeneratedCommandAction(id) !== null
