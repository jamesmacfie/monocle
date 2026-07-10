import { useCallback, useMemo, useRef, useState } from "react"
import type {
  Browser,
  CheckKeybindingConflictResponse,
  KeybindingConflictType,
  KeybindingConflictWarning,
  KeybindingRequirements,
} from "../types"
import { getKeyString, normalizeKeybinding } from "../utils/key-normalizer"
import { useSendMessage } from "./useSendMessage"

export type KeybindingCaptureState = {
  strokes: string[]
  keybinding: string
  conflict: { id: string; name: string } | null
  conflictType: KeybindingConflictType | null
  warnings: KeybindingConflictWarning[]
  requirementViolation: string | null
  canSave: boolean
}

export type UseKeybindingCaptureOptions = {
  commandId?: string
  requirements?: KeybindingRequirements | null
  contextOverride?: Partial<Browser.Context>
  onComplete: (keybinding: string) => void
  onCancel: () => void
}

type KeybindingCheckResult = Pick<
  KeybindingCaptureState,
  "conflict" | "conflictType" | "warnings" | "requirementViolation"
>

const EMPTY_RESULT: KeybindingCheckResult = {
  conflict: null,
  conflictType: null,
  warnings: [],
  requirementViolation: null,
}

export function useKeybindingCapture({
  commandId,
  contextOverride,
  onComplete,
  onCancel,
}: UseKeybindingCaptureOptions): KeybindingCaptureState & {
  handleKeyDown: (event: React.KeyboardEvent) => void
} {
  const sendMessage = useSendMessage()
  const [strokes, setStrokes] = useState<string[]>([])
  const [checkResult, setCheckResult] =
    useState<KeybindingCheckResult>(EMPTY_RESULT)
  const requestSequence = useRef(0)
  const keybinding = useMemo(
    () => normalizeKeybinding(strokes.join(", ")),
    [strokes],
  )
  const canSave =
    Boolean(keybinding) &&
    checkResult.conflict === null &&
    checkResult.requirementViolation === null

  const checkForConflict = useCallback(
    async (candidate: string) => {
      const requestId = ++requestSequence.current
      if (!candidate) {
        setCheckResult(EMPTY_RESULT)
        return
      }

      try {
        const response = (await sendMessage(
          {
            type: "monocle-keybinding-conflict-check",
            keybinding: candidate,
            excludeCommandId: commandId,
          },
          contextOverride,
        )) as CheckKeybindingConflictResponse

        if (requestId !== requestSequence.current) {
          return
        }
        setCheckResult({
          conflict: response.conflictingCommand ?? null,
          conflictType: response.conflictType ?? null,
          warnings: response.warnings ?? [],
          requirementViolation: response.requirementViolation?.message ?? null,
        })
      } catch (error) {
        if (requestId !== requestSequence.current) {
          return
        }
        console.error("[KeybindingCapture] Failed to check conflict:", error)
        setCheckResult(EMPTY_RESULT)
      }
    },
    [commandId, contextOverride, sendMessage],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === "Escape") {
        onCancel()
        return
      }

      if (event.key === "Backspace") {
        const nextStrokes = strokes.slice(0, -1)
        const nextKeybinding = normalizeKeybinding(nextStrokes.join(", "))
        setStrokes(nextStrokes)
        void checkForConflict(nextKeybinding)
        return
      }

      const isPlainEnter =
        event.key === "Enter" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      if (isPlainEnter && strokes.length > 0) {
        if (canSave) {
          onComplete(keybinding)
        }
        return
      }

      const stroke = getKeyString(event.nativeEvent)
      if (!stroke) {
        return
      }

      const nextStrokes = [...strokes, stroke]
      const nextKeybinding = normalizeKeybinding(nextStrokes.join(", "))
      setStrokes(nextStrokes)
      void checkForConflict(nextKeybinding)
    },
    [canSave, checkForConflict, keybinding, onCancel, onComplete, strokes],
  )

  return {
    strokes,
    keybinding,
    ...checkResult,
    canSave,
    handleKeyDown,
  }
}
