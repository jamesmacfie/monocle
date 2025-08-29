import { Command } from "cmdk"
import { useEffect, useRef } from "react"
import { useOnClickOutside } from "usehooks-ts"
import type { CommandSuggestion } from "../../../types"
import type { CommandActionsProps } from "../../types/command"
import { CommandName } from "./CommandName"

function ActionItem({
  action,
  onSelect,
}: {
  action: CommandSuggestion
  onSelect: (id: string) => void
}) {
  const handleSelect = () => {
    onSelect(action.id)
  }

  return (
    <Command.Item onSelect={handleSelect}>
      <CommandName name={action.name} />
      {action.keybinding && (
        <div cmdk-raycast-submenu-shortcuts="">
          {action.keybinding.split(" ").map((key) => {
            // Normalize key symbols for better display
            const normalizedKey = key
              .replace(/⌃/g, "Ctrl")
              .replace(/⌘/g, "Cmd")
              .replace(/⌥/g, "Alt")
              .replace(/⇧/g, "Shift")
              .replace(/↵/g, "↵")

            return <kbd key={key}>{normalizedKey}</kbd>
          })}
        </div>
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
}: CommandActionsProps) {
  const actionInputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useOnClickOutside(overlayRef, onClose)

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
