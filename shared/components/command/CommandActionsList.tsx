import { Command } from "cmdk"
import { useEffect, useRef, useState } from "react"
import type { Suggestion } from "../../../shared/types"
import { useSendMessage } from "../../hooks/useSendMessage"
import { useAppDispatch, useAppSelector } from "../../store/hooks"
import {
  cancelCapture,
  completeCapture,
  selectIsCapturing,
  selectTargetCommandId,
  startCapture,
} from "../../store/slices/keybinding.slice"
import { KeybindingDisplay } from "../KeybindingDisplay"
import { CommandName } from "./CommandName"

// Keybinding capture component
function KeybindingCapture({
  onComplete,
  onCancel,
  commandId,
}: {
  onComplete: (keybinding: string) => void
  onCancel: () => void
  commandId?: string
}) {
  // Sequence capture: array of completed strokes (e.g., ["⌘ K", "G"]) and current stroke parts
  const [strokes, setStrokes] = useState<string[]>([])
  const [currentKeys, setCurrentKeys] = useState<string[]>([])
  const [hasConflict, setHasConflict] = useState(false)
  // Saving the conflicting command for if we want to display it via a tooltip or something
  const [_conflictingCommand, setConflictingCommand] = useState<{
    id: string
    name: string
  } | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)
  const sendMessage = useSendMessage()

  useEffect(() => {
    // Focus the capture area when component mounts
    if (captureRef.current) {
      captureRef.current.focus()
    }
  }, [])

  // Function to check for keybinding conflicts
  const checkForConflict = async (keybinding: string) => {
    try {
      const response = await sendMessage({
        type: "check-keybinding-conflict",
        keybinding,
        excludeCommandId: commandId,
      })

      setHasConflict(response.hasConflict)
      setConflictingCommand(response.conflictingCommand || null)
    } catch (error) {
      console.error("[KeybindingCapture] Failed to check conflict:", error)
      setHasConflict(false)
      setConflictingCommand(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === "Enter" && (strokes.length > 0 || currentKeys.length > 0)) {
      // Don't save if there's a conflict
      if (hasConflict) {
        console.log(
          "[KeybindingCapture] Cannot save - keybinding conflict exists",
        )
        return
      }

      // Complete the current stroke if it has a primary key
      let finalStrokes = [...strokes]
      if (
        currentKeys.some(
          (k) => k !== "⌘" && k !== "⌃" && k !== "⌥" && k !== "⇧",
        )
      ) {
        finalStrokes = [...finalStrokes, currentKeys.join(" ")]
      }

      // Save the sequence (strokes separated by comma)
      const keybinding = finalStrokes.join(", ")
      console.log("[KeybindingCapture] Saving keybinding:", keybinding)
      onComplete(keybinding)
      return
    }

    if (e.key === "Escape") {
      // Cancel capture
      onCancel()
      return
    }

    // Build current keybinding string for real-time display (one stroke)
    const current: string[] = []

    if (e.metaKey) current.push("⌘")
    if (e.ctrlKey) current.push("⌃")
    if (e.altKey) current.push("⌥")
    if (e.shiftKey) current.push("⇧")

    // Use e.code for better consistency and prevent macOS key composition issues
    // Only add non-modifier keys
    if (
      ![
        "MetaLeft",
        "MetaRight",
        "ControlLeft",
        "ControlRight",
        "AltLeft",
        "AltRight",
        "ShiftLeft",
        "ShiftRight",
      ].includes(e.code)
    ) {
      // Convert e.code to a clean key representation
      let keyName = ""

      // Handle special keys
      if (e.code === "Space") {
        keyName = "SPACE"
      } else if (e.code === "Backspace") {
        keyName = "⌫"
      } else if (e.code === "Delete") {
        keyName = "⌦"
      } else if (e.code === "Tab") {
        keyName = "⇥"
      } else if (e.code === "Enter") {
        keyName = "↵"
      } else if (e.code.startsWith("Key")) {
        // KeyA -> A, KeyB -> B, etc.
        keyName = e.code.slice(3)
      } else if (e.code.startsWith("Digit")) {
        // Digit1 -> 1, Digit2 -> 2, etc.
        keyName = e.code.slice(5)
      } else if (e.code.startsWith("Arrow")) {
        // ArrowUp -> ↑, etc.
        const arrows: Record<string, string> = {
          ArrowUp: "↑",
          ArrowDown: "↓",
          ArrowLeft: "←",
          ArrowRight: "→",
        }
        keyName = arrows[e.code] || e.code
      } else if (e.code.startsWith("F") && /^F\d+$/.test(e.code)) {
        // F1, F2, etc.
        keyName = e.code
      } else if (e.code === "Semicolon") {
        keyName = ";"
      } else if (e.code === "Equal") {
        keyName = "="
      } else if (e.code === "Comma") {
        keyName = ","
      } else if (e.code === "Period") {
        keyName = "."
      } else if (e.code === "Slash") {
        keyName = "/"
      } else if (e.code === "Backquote") {
        keyName = "`"
      } else if (e.code === "BracketLeft") {
        keyName = "["
      } else if (e.code === "BracketRight") {
        keyName = "]"
      } else if (e.code === "Backslash") {
        keyName = "\\"
      } else if (e.code === "Quote") {
        keyName = "'"
      } else if (e.code === "Minus") {
        keyName = "-"
      } else {
        // For other keys, use the key value but sanitized
        keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key
      }

      if (keyName) {
        current.push(keyName)
      }
    }

    // Only update if we have at least one key (including just modifiers)
    if (current.length > 0) {
      // Update the current stroke display
      setCurrentKeys(current)

      // If a non-modifier key is present, finalize this stroke
      const hasPrimary = current.some((k) => !["⌘", "⌃", "⌥", "⇧"].includes(k))
      if (hasPrimary) {
        const newStrokes = [...strokes, current.join(" ")]
        setStrokes(newStrokes)
        setCurrentKeys([])

        // Check for conflicts on the completed sequence so far
        checkForConflict(newStrokes.join(", "))
      }
    }
  }

  // Make the div focusable to receive keyboard events
  const divProps = {
    ref: captureRef,
    className: "keybinding-capture",
    tabIndex: 0,
    onKeyDown: handleKeyDown,
  }

  return (
    <div className="w-full">
      <div
        {...divProps}
        className={`w-full p-2 px-3 border-2 rounded-md bg-[var(--background)] outline-none text-sm font-mono min-h-[32px] flex items-center cursor-text focus:outline-none ${
          hasConflict ? "border-red-500" : "border-blue-500"
        }`}
      >
        {strokes.length === 0 && currentKeys.length === 0 ? (
          <span className="text-[var(--cmdk-muted-foreground)] text-xs">
            Press keys in sequence. Enter to save
          </span>
        ) : (
          <div className="flex items-center gap-1">
            {strokes.map((stroke, idx) => (
              <div key={`stroke-${idx}`} className="flex items-center gap-1">
                {stroke.split(" ").map((k, kIdx) => (
                  <kbd
                    key={`${idx}-${kIdx}`}
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      hasConflict
                        ? "bg-red-100 border border-red-300 text-red-700"
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
            ))}
            {currentKeys.length > 0 && (
              <div className="flex items-center gap-1">
                {currentKeys.map((k, kIdx) => (
                  <kbd
                    key={`current-${kIdx}`}
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      hasConflict
                        ? "bg-red-100 border border-red-300 text-red-700"
                        : "bg-[var(--cmdk-list-item-background-active)]"
                    }`}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

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
      dispatch(startCapture(action.executionContext.targetCommandId))
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

  const handleKeybindingComplete = async (keybinding: string) => {
    if (!targetCommandId) {
      console.error("No target command ID for keybinding")
      return
    }

    try {
      await sendMessage({
        type: "update-command-setting",
        commandId: targetCommandId,
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
