// Architecture: shared palette action-menu UI. Renders generated and
// command-defined row actions, coordinates live custom-keybinding capture,
// and sends typed settings/execution messages without owning persistence.
// Shared by content and new-tab palettes. See docs/execution-and-actions.md
// and docs/keybindings.md.
import { Command } from "cmdk"
import { useEffect, useRef, useState } from "react"
import type { KeybindingRequirements, Suggestion } from "../../../shared/types"
import { useKeybindingCapture } from "../../hooks/useKeybindingCapture"
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
import { KeybindingCaptureField } from "../KeybindingCaptureField"
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
  const captureRef = useRef<HTMLButtonElement>(null)
  const capture = useKeybindingCapture({
    commandId,
    requirements,
    onComplete,
    onCancel,
  })

  useEffect(() => {
    captureRef.current?.focus()
  }, [])

  return (
    <KeybindingCaptureField
      {...capture}
      captureRef={captureRef}
      requirements={requirements}
      onKeyDownCapture={capture.handleKeyDown}
    />
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
