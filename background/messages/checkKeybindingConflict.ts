import type {
  CheckKeybindingConflictMessage,
  CheckKeybindingConflictResponse,
  KeybindingBehavior,
  KeybindingRequirements,
} from "../../shared/types"
import { normalizeKeybinding } from "../../shared/utils/key-normalizer"
import { validateKeybindingRequirements } from "../../shared/utils/keybinding-requirements"
import { resolveCommandById } from "../commands/query"
import { getSettingsCatalogCommandById } from "../commands/settingsCatalog"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import { evaluateKeybindingAssignment } from "../keybindings/conflicts"
import { loadKeybindingCommandEntries } from "../keybindings/source"
import {
  getKeybindingBehavior,
  getKeybindingRequirements,
} from "../utils/commands"

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
    // The same resolution also yields the command's keybinding requirements.
    let targetBehavior: KeybindingBehavior = "execute"
    let targetRequirements: KeybindingRequirements | undefined
    if (excludeCommandId) {
      const resolved = await resolveCommandById(excludeCommandId, context, {
        siteSdk,
      })
      if (resolved) {
        targetBehavior = getKeybindingBehavior(resolved.command)
        targetRequirements = getKeybindingRequirements(resolved.command)
      } else {
        // Context-restricted commands fall back to the catalog row, mirroring
        // the canSetKeybinding fallback in updateCommandSetting.
        const catalogCommand =
          await getSettingsCatalogCommandById(excludeCommandId)
        targetRequirements = catalogCommand?.keybindingRequirements
      }
    }

    const requirementResult = validateKeybindingRequirements(
      normalizedKeybinding,
      targetRequirements,
    )

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
