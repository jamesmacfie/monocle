// Architecture: background command system, generated-action encoding. The
// palette UI never holds executable functions — it only holds Suggestions with
// ids and sends execute-command. So the per-row affordances the UI generates
// (favorite toggle, hide, hide-from-domain, reset-keybinding, the modifier-
// enter variants, the primary enter action) are encoded INTO synthetic command
// ids by prefixing/suffixing the target id. This module is the decoder: it maps
// such an id back to a structured GeneratedCommandAction + the real target id,
// which execution.ts dispatches. Keeping the encoding here and the dispatch in
// execution.ts means generated actions reuse the exact execute-command path
// real commands take. See docs/execution-and-actions.md.
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

/**
 * Decodes a synthetic generated-action id into its action + target command id,
 * or null if `id` is an ordinary command id. Prefix forms (toggle-favorite-,
 * hide-command-, …) wrap the target; the suffix forms encode the enter/modifier
 * row actions (`<id>-cmd-enter-action`, `<id>-enter-action`). Order matters:
 * the modifier regex is tried before the bare `-enter-action` suffix so a
 * modifier action isn't misread as the primary one.
 */
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
