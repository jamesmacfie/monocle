import type {
  KeybindingBehavior,
  KeybindingConflictType,
  KeybindingConflictWarning,
} from "../../shared/types"
import {
  normalizeKeybinding,
  splitKeybindingSequence,
} from "../../shared/utils/key-normalizer"
import type { KeybindingCommandEntry } from "./source"

export type KeybindingAssignmentEvaluation = {
  hasConflict: boolean
  conflictingCommand: { id: string; name: string } | null
  conflictType?: KeybindingConflictType
  warnings: KeybindingConflictWarning[]
}

// True when `prefix` is a proper sequence prefix of `strokes` (fewer strokes,
// all matching). Both inputs must already be canonical.
export const isProperStrokePrefix = (
  prefix: string[],
  strokes: string[],
): boolean =>
  prefix.length < strokes.length &&
  prefix.every((stroke, index) => stroke === strokes[index])

// Evaluate assigning `normalizedCandidate` to the command identified by
// `excludeCommandId` (with `targetBehavior`) against the existing entries.
//
// Blocking outcomes:
// - "exact": another command already holds the same canonical binding.
// - "shadowed-by-open-palette": either an existing open-palette binding sits
//   on a proper prefix of the candidate (the candidate sequence could never
//   fire — open-palette matches execute immediately because the chord timer
//   cannot deliver an open-palette response after the message channel
//   closes), or the candidate itself is an open-palette binding sitting on a
//   proper prefix of an existing sequence (saving would make that sequence
//   unreachable).
//
// Non-blocking: prefix overlaps between execute-behavior bindings are
// reported as warnings — the shared prefix still works but only resolves
// after the chord timeout.
export const evaluateKeybindingAssignment = (
  entries: KeybindingCommandEntry[],
  normalizedCandidate: string,
  excludeCommandId: string | undefined,
  targetBehavior: KeybindingBehavior,
): KeybindingAssignmentEvaluation => {
  const candidateStrokes = splitKeybindingSequence(normalizedCandidate)
  const warnings: KeybindingConflictWarning[] = []
  let shadowConflict: { id: string; name: string } | null = null

  for (const entry of entries) {
    if (entry.id === excludeCommandId) {
      continue
    }

    const normalizedEntry = normalizeKeybinding(entry.keybinding)
    if (!normalizedEntry) {
      continue
    }

    if (normalizedEntry === normalizedCandidate) {
      // Exact conflicts dominate every other outcome.
      return {
        hasConflict: true,
        conflictingCommand: { id: entry.id, name: entry.name },
        conflictType: "exact",
        warnings: [],
      }
    }

    const entryStrokes = splitKeybindingSequence(normalizedEntry)

    if (isProperStrokePrefix(entryStrokes, candidateStrokes)) {
      if (entry.behavior === "openPaletteAtCommand") {
        shadowConflict ??= { id: entry.id, name: entry.name }
        continue
      }

      warnings.push({
        type: "prefix-overlap",
        direction: "candidate-extends-existing",
        command: { id: entry.id, name: entry.name },
        keybinding: normalizedEntry,
      })
      continue
    }

    if (isProperStrokePrefix(candidateStrokes, entryStrokes)) {
      if (targetBehavior === "openPaletteAtCommand") {
        shadowConflict ??= { id: entry.id, name: entry.name }
        continue
      }

      warnings.push({
        type: "prefix-overlap",
        direction: "existing-extends-candidate",
        command: { id: entry.id, name: entry.name },
        keybinding: normalizedEntry,
      })
    }
  }

  if (shadowConflict) {
    return {
      hasConflict: true,
      conflictingCommand: shadowConflict,
      conflictType: "shadowed-by-open-palette",
      warnings: [],
    }
  }

  return {
    hasConflict: false,
    conflictingCommand: null,
    warnings,
  }
}
