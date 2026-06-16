import type {
  CheckKeybindingConflictMessage,
  CheckKeybindingConflictResponse,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { validateKeybindingRequirements } from "../../shared/utils/keybinding-requirements"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import {
  type KeybindingAssignmentTarget,
  resolveKeybindingAssignmentTarget,
} from "../keybindings/assignmentTarget"
import { evaluateKeybindingAssignment } from "../keybindings/conflicts"
import { loadKeybindingCommandEntries } from "../keybindings/source"

const NO_CONFLICT: CheckKeybindingConflictResponse = {
  hasConflict: false,
  conflictingCommand: null,
}

/**
 * Single-binding pre-assignment check used by the capture UIs. Evaluates three
 * independent layers and reports them together: (1) per-command requirement
 * gating (e.g. snippet bindings must carry a non-shift modifier), (2)
 * exact-binding conflicts, and (3) open-palette shadows (a binding sitting on a
 * proper prefix of a sequence). The target command's behavior decides whether a
 * prefix overlap is a hard shadow or just a warning, so it's resolved (falling
 * back to the catalog row for context-restricted commands). Errors degrade to
 * NO_CONFLICT — a check failure must never block assignment. See
 * docs/keybindings.md.
 */
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
    // The same resolution also yields the command's keybinding requirements.
    let target: KeybindingAssignmentTarget = {
      allowed: true,
      behavior: "execute" as const,
      source: "missing",
    }
    if (excludeCommandId) {
      target = await resolveKeybindingAssignmentTarget({
        commandId: excludeCommandId,
        context,
        options: { siteSdk },
      })
    }

    const requirementResult = validateKeybindingRequirements(
      normalizedKeybinding,
      target.requirements,
    )

    const evaluation = evaluateKeybindingAssignment(
      entries,
      normalizedKeybinding,
      excludeCommandId,
      target.behavior,
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
    if (!requirementResult.valid) {
      response.requirementViolation = {
        code: requirementResult.violation,
        message: requirementResult.message,
      }
    }
    return response
  } catch (error) {
    console.error("[checkKeybindingConflict] Error checking conflict:", error)
    return NO_CONFLICT
  }
}
