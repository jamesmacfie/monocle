import { Command } from "cmdk"
import { useEffect, useRef, useState } from "react"
import { useOnClickOutside } from "usehooks-ts"
import type { CommandSuggestion } from "../../../types/"
import { useSendMessage } from "../../hooks/useSendMessage"
import { useAppDispatch, useAppSelector } from "../../store/hooks"
import {
  cancelCapture,
  completeCapture,
  selectIsCapturing,
  selectTargetCommandId,
  startCapture,
} from "../../store/slices/keybinding.slice"
import type { CommandActionsProps } from "../../types/command"
import { KeybindingDisplay } from "../KeybindingDisplay"
import { CommandName } from "./CommandName"

// Keybinding capture component
function KeybindingCapture({
  onComplete,
  onCancel,
}: {
  onComplete: (keybinding: string) => void
  onCancel: () => void
}) {
  const [capturedKeys, setCapturedKeys] = useState<string[]>([])
  const [currentKeys, setCurrentKeys] = useState<string[]>([])
  const [, setIsCapturing] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Focus the capture area when component mounts
    if (captureRef.current) {
      captureRef.current.focus()
    }
    setIsCapturing(true)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === "Enter" && capturedKeys.length > 0) {
      // Save the most recent keybinding combination
      const keybinding = capturedKeys.join(" ")
      console.log("[KeybindingCapture] Saving keybinding:", keybinding)
      onComplete(keybinding)
      return
    }

    if (e.key === "Escape") {
      // Cancel capture
      onCancel()
      return
    }

    // Build current keybinding string for real-time display
    const currentKeys: string[] = []

    if (e.metaKey) currentKeys.push("⌘")
    if (e.ctrlKey) currentKeys.push("⌃")
    if (e.altKey) currentKeys.push("⌥")
    if (e.shiftKey) currentKeys.push("⇧")

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
        currentKeys.push(keyName)
      }
    }

    // Only update if we have at least one key (including just modifiers)
    if (currentKeys.length > 0) {
      // Always update both the current display AND the captured keys for saving
      setCurrentKeys(currentKeys)
      // Save the most recent keys pressed - this will be used when Enter is pressed
      setCapturedKeys([...currentKeys])
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
    <div
      {...divProps}
      className="w-full p-2 px-3 border-2 border-blue-500 rounded-md bg-[var(--background)] outline-none text-sm font-mono min-h-[32px] flex items-center cursor-text focus:outline-none"
    >
      {currentKeys.length > 0 ? (
        <div className="flex items-center gap-1">
          {currentKeys.map((key, index) => (
            <kbd
              key={index}
              className="px-1.5 py-0.5 bg-[var(--cmdk-list-item-background-active)] rounded text-xs"
            >
              {key}
            </kbd>
          ))}
        </div>
      ) : (
        <span className="text-[var(--cmdk-muted-foreground)] text-xs">
          Press keys. Enter to save
        </span>
      )}
    </div>
  )
}

function ActionItem({
  action,
  onSelect,
  onRefresh,
  onClose,
}: {
  action: CommandSuggestion
  onSelect: (id: string) => void
  onRefresh?: () => void
  onClose?: (force?: boolean) => void
}) {
  const dispatch = useAppDispatch()
  const isCapturing = useAppSelector(selectIsCapturing)
  const targetCommandId = useAppSelector(selectTargetCommandId)
  const sendMessage = useSendMessage()

  // Check if this is a setKeybinding action that's currently being captured
  const isSetKeybindingAction =
    action.executionContext?.type === "setKeybinding"
  const isThisActionBeingCaptured =
    isCapturing &&
    isSetKeybindingAction &&
    targetCommandId === action.executionContext?.targetCommandId

  const handleSelect = () => {
    // If this is a setKeybinding action, start the capture flow instead of executing the command
    if (action.executionContext?.type === "setKeybinding") {
      dispatch(startCapture(action.executionContext.targetCommandId))
      return
    }

    // Handle reset keybinding action
    if (action.executionContext?.type === "resetKeybinding") {
      // This will be handled by the background script's executeCommand function
      onSelect(action.id)
      return
    }

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

      // Focus the input after closing the action menu
      setTimeout(() => {
        // Find the input through the action's parent context
        // We need to look for the cmdk-input in the main command palette
        const cmdkInput = document.querySelector(
          "[cmdk-input]",
        ) as HTMLInputElement
        if (cmdkInput) {
          cmdkInput.focus()
        }
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
        />
      </Command.Item>
    )
  }

  return (
    <Command.Item onSelect={handleSelect}>
      <CommandName name={action.name} />
      {action.keybinding && (
        <KeybindingDisplay keybinding={action.keybinding} />
      )}
    </Command.Item>
  )
}

export function CommandActions({
  open,
  selectedValue,
  inputRef,
  actions = [],
  onActionSelect,
  onClose,
  onRefresh,
}: CommandActionsProps) {
  console.log(
    `[DEBUG] CommandActions rendered with ${actions.length} actions:`,
    actions.map((a) => a.name),
  )

  const actionInputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useOnClickOutside(overlayRef, (_event) => {
    onClose?.()
  })

  useEffect(() => {
    if (open && actionInputRef.current) {
      setTimeout(() => {
        actionInputRef.current?.focus()
      }, 50)
    }
  }, [open])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        setTimeout(() => {
          inputRef?.current?.focus()
        }, 50)
      }
    }

    if (open) {
      document.addEventListener("keydown", handleEscape)
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open, onClose, inputRef])

  const handleActionSelect = (actionId: string) => {
    if (onActionSelect) {
      onActionSelect(actionId)
    }
    onClose()
    setTimeout(() => {
      inputRef?.current?.focus()
    }, 50)
  }

  if (!selectedValue || !actions.length || !open) {
    return null
  }

  return (
    <div
      ref={overlayRef}
      className="raycast-submenu-overlay"
      data-state={open ? "open" : "closed"}
    >
      <div className="raycast-submenu">
        <Command loop>
          <Command.List className="cmdk-subcommand-list">
            <Command.Group>
              {actions.map((action) => (
                <ActionItem
                  key={action.id}
                  action={action}
                  onSelect={handleActionSelect}
                  onRefresh={onRefresh}
                  onClose={onClose}
                />
              ))}
            </Command.Group>
          </Command.List>
          <Command.Input
            ref={actionInputRef}
            placeholder="Search for actions..."
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                onClose()
                setTimeout(() => {
                  inputRef?.current?.focus()
                }, 50)
              }
            }}
          />
        </Command>
      </div>
    </div>
  )
}
