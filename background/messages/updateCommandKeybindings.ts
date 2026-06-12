import type {
  KeybindingBehavior,
  UpdateCommandKeybindingsConflict,
  UpdateCommandKeybindingsMessage,
  UpdateCommandKeybindingsResponse,
} from "../../shared/types"
import {
  normalizeKeybinding,
  splitKeybindingSequence,
} from "../../shared/utils/key-normalizer"
import { validateKeybindingRequirements } from "../../shared/utils/keybinding-requirements"
import { resolveCommandById } from "../commands/query"
import { updateCommandKeybindings as updateCommandKeybindingsSettings } from "../commands/settings"
import { getSettingsCatalogCommandById } from "../commands/settingsCatalog"
import { prepareSiteSdkCommandLoadOptions } from "../commands/siteSdk"
import {
  evaluateKeybindingAssignment,
  isProperStrokePrefix,
} from "../keybindings/conflicts"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { loadKeybindingCommandEntries } from "../keybindings/source"
import {
  allowsKeybinding,
  getKeybindingBehavior,
  getKeybindingRequirements,
} from "../utils/commands"

type PreparedKeybindingUpdate = {
  commandId: string
  keybinding: string | null
  behavior: KeybindingBehavior
}

export async function updateCommandKeybindings(
  message: UpdateCommandKeybindingsMessage,
  sender?: any,
): Promise<UpdateCommandKeybindingsResponse> {
  const siteSdk = await prepareSiteSdkCommandLoadOptions(
    sender,
    message.context,
  )
  const preparedUpdates: PreparedKeybindingUpdate[] = []
  const conflicts: UpdateCommandKeybindingsConflict[] = []

  for (const update of message.updates) {
    const normalizedKeybinding = normalizeKeybinding(update.keybinding || "")

    if (!normalizedKeybinding) {
      preparedUpdates.push({
        commandId: update.commandId,
        keybinding: null,
        behavior: "execute",
      })
      continue
    }

    const resolved = await resolveCommandById(
      update.commandId,
      message.context,
      { siteSdk },
    )
    const catalogCommand = resolved
      ? undefined
      : await getSettingsCatalogCommandById(update.commandId)

    const allowed = resolved
      ? allowsKeybinding(resolved.command)
      : catalogCommand?.capabilities.canSetKeybinding === true

    if (!allowed) {
      throw new Error(
        `Command cannot be assigned a keybinding: ${update.commandId}`,
      )
    }

    // Per-command requirement gate (e.g. snippet bindings must carry a
    // non-shift modifier in every stroke). Violations are skipped and
    // reported like conflicts so the rest of the batch still persists.
    const requirementResult = validateKeybindingRequirements(
      normalizedKeybinding,
      resolved
        ? getKeybindingRequirements(resolved.command)
        : catalogCommand?.keybindingRequirements,
    )
    if (!requirementResult.valid) {
      conflicts.push({
        commandId: update.commandId,
        keybinding: normalizedKeybinding,
        reason: "requirement-not-met",
      })
      continue
    }

    preparedUpdates.push({
      commandId: update.commandId,
      keybinding: normalizedKeybinding,
      // Catalog-only commands (not resolvable in this context) default to
      // execute behavior; shadow checks for them rerun on next assignment.
      behavior: resolved ? getKeybindingBehavior(resolved.command) : "execute",
    })
  }

  // Conflict detection: an update loses when its keybinding is already held by
  // a command outside this batch, was claimed by an earlier update in the same
  // batch, or would create an open-palette shadow (an open-palette binding on
  // a proper prefix of a sequence makes that sequence unreachable).
  // Conflicting updates are skipped and reported, not thrown — the rest of the
  // batch still persists.
  const batchCommandIds = new Set(preparedUpdates.map((u) => u.commandId))
  const existingEntries = await loadKeybindingCommandEntries(message.context, {
    siteSdk,
  })
  const nonBatchEntries = existingEntries.filter(
    (entry) => !batchCommandIds.has(entry.id),
  )

  const applicableUpdates: PreparedKeybindingUpdate[] = []
  const claimedInBatch = new Map<
    string,
    { id: string; behavior: KeybindingBehavior }
  >()

  for (const update of preparedUpdates) {
    if (!update.keybinding) {
      applicableUpdates.push(update)
      continue
    }

    const claimedBy = claimedInBatch.get(update.keybinding)
    if (claimedBy) {
      conflicts.push({
        commandId: update.commandId,
        keybinding: update.keybinding,
        conflictingCommand: { id: claimedBy.id, name: claimedBy.id },
      })
      continue
    }

    // Exact and shadow conflicts against commands outside the batch.
    const evaluation = evaluateKeybindingAssignment(
      nonBatchEntries,
      update.keybinding,
      update.commandId,
      update.behavior,
    )
    if (evaluation.hasConflict && evaluation.conflictingCommand) {
      conflicts.push({
        commandId: update.commandId,
        keybinding: update.keybinding,
        conflictingCommand: evaluation.conflictingCommand,
        ...(evaluation.conflictType && evaluation.conflictType !== "exact"
          ? { reason: evaluation.conflictType }
          : {}),
      })
      continue
    }

    // Shadow checks within the batch: behaviors are known for batch commands.
    const candidateStrokes = splitKeybindingSequence(update.keybinding)
    let batchShadowId: string | null = null
    for (const [claimedBinding, claimed] of claimedInBatch) {
      const claimedStrokes = splitKeybindingSequence(claimedBinding)
      if (
        (claimed.behavior === "openPaletteAtCommand" &&
          isProperStrokePrefix(claimedStrokes, candidateStrokes)) ||
        (update.behavior === "openPaletteAtCommand" &&
          isProperStrokePrefix(candidateStrokes, claimedStrokes))
      ) {
        batchShadowId = claimed.id
        break
      }
    }
    if (batchShadowId) {
      conflicts.push({
        commandId: update.commandId,
        keybinding: update.keybinding,
        conflictingCommand: { id: batchShadowId, name: batchShadowId },
        reason: "shadowed-by-open-palette",
      })
      continue
    }

    claimedInBatch.set(update.keybinding, {
      id: update.commandId,
      behavior: update.behavior,
    })
    applicableUpdates.push(update)
  }

  await updateCommandKeybindingsSettings(
    applicableUpdates.map(({ commandId, keybinding }) => ({
      commandId,
      keybinding,
    })),
  )
  await refreshKeybindingRegistry()

  return { success: true, updated: applicableUpdates.length, conflicts }
}
