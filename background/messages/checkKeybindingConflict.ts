import type {
  CheckKeybindingConflictMessage,
  CheckKeybindingConflictResponse,
  KeybindingBehavior,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { resolveCommandById } from "../commands/query"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { evaluateKeybindingAssignment } from "../keybindings/conflicts"
import { loadKeybindingCommandEntries } from "../keybindings/source"
import { getKeybindingBehavior } from "../utils/commands"

const NO_CONFLICT: CheckKeybindingConflictResponse = {
  hasConflict: false,
  conflictingCommand: null,
}

export const checkKeybindingConflict = async (
  { keybinding, excludeCommandId, context }: CheckKeybindingConflictMessage,
  sender?: any,
): Promise<CheckKeybindingConflictResponse> => {
  try {
    const normalizedKeybinding = normalizeKeybinding(keybinding)
    if (!normalizedKeybinding) {
      return NO_CONFLICT
    }

    const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)
    const entries = await loadKeybindingCommandEntries(context, { siteSdk })

    // The target command's behavior decides whether sitting on a prefix of an
    // existing sequence is a blocking shadow (open-palette) or just a warning.
    let targetBehavior: KeybindingBehavior = "execute"
    if (excludeCommandId) {
      const resolved = await resolveCommandById(excludeCommandId, context, {
        siteSdk,
      })
      if (resolved) {
        targetBehavior = getKeybindingBehavior(resolved.command)
      }
    }

    const evaluation = evaluateKeybindingAssignment(
      entries,
      normalizedKeybinding,
      excludeCommandId,
      targetBehavior,
    )

    // Optional fields are omitted when empty so existing callers (and exact
    // response assertions) only see them when they carry information.
    const response: CheckKeybindingConflictResponse = {
      hasConflict: evaluation.hasConflict,
      conflictingCommand: evaluation.conflictingCommand,
    }
    if (evaluation.conflictType) {
      response.conflictType = evaluation.conflictType
    }
    if (evaluation.warnings.length > 0) {
      response.warnings = evaluation.warnings
    }
    return response
  } catch (error) {
    console.error("[checkKeybindingConflict] Error checking conflict:", error)
    return NO_CONFLICT
  }
}
