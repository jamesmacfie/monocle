import { Command } from "cmdk"
import { useEffect, useRef, useState } from "react"
import type {
  CheckKeybindingConflictResponse,
  KeybindingConflictType,
  KeybindingConflictWarning,
  KeybindingRequirements,
  Suggestion,
} from "../../../shared/types"
import {
  getKeyString,
  normalizeKeybinding,
  toDisplayFormat,
} from "../../../shared/utils/key-normalizer"
import { describeKeybindingRequirements } from "../../../shared/utils/keybinding-requirements"
import { useSendMessage } from "../../hooks/useSendMessage"
import { useAppDispatch, useAppSelector } from "../../store/hooks"
import {
  cancelCapture,
  completeCapture,
  selectCaptureRequirements,
  selectIsCapturing,
  selectTargetCommandId,
  startCapture,
} from "../../store/slices/keybinding.slice"
import { KeybindingDisplay } from "../KeybindingDisplay"
import { CommandName } from "./CommandName"

// Inline keybinding-capture widget rendered in place of an action row while the
// "Set keybinding" action is active. Collects a sequence of canonical strokes
// (getKeyString), live-checks each partial sequence for conflicts/requirement
// violations against the background, and blocks save until clean. Uses
// onKeyDownCapture so it intercepts keys before cmdk routes them to the palette
// search field. See docs/keybindings.md.
function KeybindingCapture({
  onComplete,
  onCancel,
  commandId,
  requirements,
}: {
  onComplete: (keybinding: string) => void
  onCancel: () => void
  commandId?: string
  requirements?: KeybindingRequirements | null
}) {
  // Sequence capture: array of completed canonical strokes.
  const [strokes, setStrokes] = useState<string[]>([])
  const [hasConflict, setHasConflict] = useState(false)
  const [conflictType, setConflictType] =
    useState<KeybindingConflictType | null>(null)
  const [conflictingCommand, setConflictingCommand] = useState<{
    id: string
    name: string
  } | null>(null)
  const [warnings, setWarnings] = useState<KeybindingConflictWarning[]>([])
  const [requirementViolation, setRequirementViolation] = useState<
    string | null
  >(null)
  const captureRef = useRef<HTMLDivElement>(null)
  const sendMessage = useSendMessage()
  const requirementHint = describeKeybindingRequirements(
    requirements ?? undefined,
  )

  useEffect(() => {
    // Focus the capture area when component mounts
    if (captureRef.current) {
      captureRef.current.focus()
    }
  }, [])

  // Function to check for keybinding conflicts
  const checkForConflict = async (keybinding: string) => {
    try {
      const response = (await sendMessage({
        type: "monocle-keybinding-conflict-check",
        keybinding,
        excludeCommandId: commandId,
      })) as CheckKeybindingConflictResponse

      setHasConflict(response.hasConflict)
      setConflictingCommand(response.conflictingCommand || null)
      setConflictType(response.conflictType ?? null)
      setWarnings(response.warnings ?? [])
      setRequirementViolation(response.requirementViolation?.message ?? null)
    } catch (error) {
      console.error("[KeybindingCapture] Failed to check conflict:", error)
      setHasConflict(false)
      setConflictingCommand(null)
      setConflictType(null)
      setWarnings([])
      setRequirementViolation(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === "Enter" && strokes.length > 0) {
      // Don't save if there's a conflict or a requirement violation
      if (hasConflict || requirementViolation) {
        return
      }

      // Save the sequence (strokes separated by comma)
      const keybinding = normalizeKeybinding(strokes.join(", "))
      onComplete(keybinding)
      return
    }

    if (e.key === "Escape") {
      // Cancel capture
      onCancel()
      return
    }

    const canonicalStroke = getKeyString(e.nativeEvent)
    if (canonicalStroke) {
      const newStrokes = [...strokes, canonicalStroke]
      const normalizedSequence = normalizeKeybinding(newStrokes.join(", "))
      setStrokes(newStrokes)

      // Check for conflicts on the completed sequence so far
      checkForConflict(normalizedSequence)
    }
  }

  // Make the div focusable to receive keyboard events
  const divProps = {
    ref: captureRef,
    className: "keybinding-capture",
    tabIndex: 0,
    // Use capture phase to intercept before CMDK routes input to its search field
    onKeyDownCapture: handleKeyDown as any,
  }

  return (
    <div className="w-full">
      <div
        {...divProps}
        className={`w-full p-2 px-3 border-2 rounded-md bg-[var(--background)] outline-none text-sm font-mono min-h-[32px] flex items-center cursor-text focus:outline-none ${
          hasConflict || requirementViolation
            ? "border-[var(--color-error-border)]"
            : "border-[var(--color-focus-ring)]"
        }`}
      >
        {strokes.length === 0 ? (
          <span className="text-[var(--cmdk-muted-foreground)] text-xs">
            {requirementHint
              ? `Press keys in sequence. Enter to save · ${requirementHint}`
              : "Press keys in sequence. Enter to save"}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            {strokes.map((stroke, idx) => {
              // Convert canonical format to display format for proper kbd rendering
              const displayStroke = toDisplayFormat(stroke)
              const parts = displayStroke.split(" ").filter(Boolean)

              return (
                <div key={`stroke-${idx}`} className="flex items-center gap-1">
                  {parts.map((k: string, kIdx: number) => (
                    <kbd
                      key={`${idx}-${kIdx}`}
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        hasConflict
                          ? "bg-[var(--color-error-bg)] border border-[var(--color-error-border)] text-[var(--color-error-fg)]"
                          : "bg-[var(--cmdk-list-item-background-active)]"
                      }`}
                    >
                      {k}
                    </kbd>
                  ))}
                  {idx < strokes.length - 1 && (
                    <span className="px-1 text-xs text-[var(--cmdk-muted-foreground)]">
                      →
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {strokes.length > 0 && hasConflict && conflictingCommand && (
        <div className="mt-1 px-1 text-xs text-[var(--color-error-fg)]">
          {conflictType === "shadowed-by-open-palette"
            ? `Blocked: shares a prefix with "${conflictingCommand.name}", whose open-palette binding would make the longer sequence unreachable`
            : `Already assigned to "${conflictingCommand.name}"`}
        </div>
      )}
      {strokes.length > 0 && requirementViolation && (
        <div className="mt-1 px-1 text-xs text-[var(--color-error-fg)]">
          {requirementViolation}
        </div>
      )}
      {strokes.length > 0 && !hasConflict && warnings.length > 0 && (
        <div className="mt-1 px-1 text-xs text-[var(--color-warning-fg)]">
          {`Overlaps with "${warnings[0].command.name}" — the shared prefix only executes after a short delay`}
        </div>
      )}
    </div>
  )
}

// One row in the per-suggestion action menu. Most actions just call onSelect,
// but two carry extra UI state machines: confirm-gated actions require a second
// press ("Are you sure?"), and the setKeybinding action swaps itself for the
// KeybindingCapture widget (driven by the keybinding.slice capture state) when
// chosen, then commits the captured binding via handleKeybindingComplete.
function ActionItem({
  action,
  onSelect,
  onRefresh,
  onClose,
  inputRef,
}: {
  action: Suggestion
  onSelect: (id: string) => void
  onRefresh?: () => void
  onClose?: (force?: boolean) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const dispatch = useAppDispatch()
  const isCapturing = useAppSelector(selectIsCapturing)
  const targetCommandId = useAppSelector(selectTargetCommandId)
  const captureRequirements = useAppSelector(selectCaptureRequirements)
  const sendMessage = useSendMessage()

  // Add confirmation state
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  // Check if this action requires confirmation
  const requiresConfirmation =
    action.type === "action" && action.confirmAction === true

  // Check if this is a setKeybinding action that's currently being captured
  const isSetKeybindingAction =
    action.type === "action" &&
    action.executionContext?.type === "setKeybinding"
  const isThisActionBeingCaptured =
    isCapturing &&
    isSetKeybindingAction &&
    action.type === "action" &&
    targetCommandId === action.executionContext?.targetCommandId

  // Reset confirmation state when action changes (similar to CommandItem pattern)
  useEffect(() => {
    setAwaitingConfirmation(false)
  }, [])

  // Clear confirmation when action menu loses focus or closes
  useEffect(() => {
    if (awaitingConfirmation) {
      const handleKeyDown = (event: KeyboardEvent) => {
        // Clear confirmation on Escape or when navigating away
        if (
          event.key === "Escape" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown"
        ) {
          setAwaitingConfirmation(false)
        }
      }

      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("keydown", handleKeyDown)
      }
    }
  }, [awaitingConfirmation])

  const handleSelect = () => {
    // If this is a setKeybinding action, start the capture flow instead of executing the command
    if (
      action.type === "action" &&
      action.executionContext?.type === "setKeybinding"
    ) {
      dispatch(
        startCapture({
          commandId: action.executionContext.targetCommandId,
          requirements: action.executionContext.requirements,
        }),
      )
      return
    }

    // Handle confirmation logic (skip confirmation for reset keybinding actions)
    if (
      requiresConfirmation &&
      !awaitingConfirmation &&
      (action.type !== "action" ||
        action.executionContext?.type !== "resetKeybinding")
    ) {
      // First press - show confirmation
      setAwaitingConfirmation(true)
      return
    }

    // Handle reset keybinding action
    if (
      action.type === "action" &&
      action.executionContext?.type === "resetKeybinding"
    ) {
      // This will be handled by the background script's executeCommand function
      setAwaitingConfirmation(false)
      onSelect(action.id)
      return
    }

    // Execute action (confirmation passed or not needed)
    setAwaitingConfirmation(false)
    onSelect(action.id)
  }

  // Persist a captured keybinding for the target command, then tear down the
  // capture flow. Order matters: complete the Redux capture, refresh so the new
  // shortcut renders, then FORCE-close the action menu (handleCloseActions
  // normally refuses to close while capture is active) and refocus search. On
  // failure the capture is left active so the user can retry.
  const handleKeybindingComplete = async (keybinding: string) => {
    if (!targetCommandId) {
      console.error("No target command ID for keybinding")
      return
    }

    try {
      await sendMessage({
        type: "monocle-command-setting-update",
        id: targetCommandId,
        setting: "keybinding",
        value: keybinding,
      })

      dispatch(completeCapture())

      // Refresh commands to show updated keybinding
      if (onRefresh) {
        onRefresh()
      }

      // Close the action menu after successful keybinding update
      // Use force close to bypass the _isCapturing check
      if (onClose) {
        onClose(true)
      }

      // Focus the main command palette input after closing
      setTimeout(() => {
        inputRef?.current?.focus()
      }, 50)
    } catch (error) {
      console.error("Failed to save keybinding:", error)
      // Keep capture active on error so user can try again
    }
  }

  const handleKeybindingCancel = () => {
    dispatch(cancelCapture())
  }

  // If this is the setKeybinding action being captured, show the capture UI
  if (isThisActionBeingCaptured) {
    return (
      <Command.Item>
        <KeybindingCapture
          onComplete={handleKeybindingComplete}
          onCancel={handleKeybindingCancel}
          commandId={targetCommandId ?? undefined}
          requirements={captureRequirements}
        />
      </Command.Item>
    )
  }

  // Show confirmation message when awaiting confirmation
  const displayName = awaitingConfirmation ? "Are you sure?" : action.name

  return (
    <Command.Item
      value={action.id}
      keywords={[
        typeof action.name === "string"
          ? action.name
          : action.name?.join(" ") || "",
      ]}
      onSelect={handleSelect}
    >
      <CommandName name={displayName} />
      {action.keybinding && (
        <KeybindingDisplay keybinding={action.keybinding} />
      )}
    </Command.Item>
  )
}

interface CommandActionsListProps {
  actions: Suggestion[]
  onActionSelect: (id: string) => void
  onRefresh?: () => void
  onClose?: (force?: boolean) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
}

export function CommandActionsList({
  actions,
  onActionSelect,
  onRefresh,
  onClose,
  inputRef,
}: CommandActionsListProps) {
  return (
    <>
      {actions.map((action) => (
        <ActionItem
          key={action.id}
          action={action}
          onSelect={onActionSelect}
          onRefresh={onRefresh}
          onClose={onClose}
          inputRef={inputRef}
        />
      ))}
    </>
  )
}
