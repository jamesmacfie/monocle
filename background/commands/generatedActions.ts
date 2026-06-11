import type { Browser } from "../../shared/types"

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

const generatedPrefixes = [
  { prefix: "toggle-favorite-", type: "favorite" as const },
  { prefix: "set-keybinding-", type: "setKeybinding" as const },
  { prefix: "reset-keybinding-", type: "resetKeybinding" as const },
  { prefix: "hide-from-domain-", type: "hideDomain" as const },
  { prefix: "hide-command-", type: "hideCommand" as const },
]

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
