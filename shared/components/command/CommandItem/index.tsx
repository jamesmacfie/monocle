import { Command, useCommandState } from "cmdk"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { usePermissionsGranted } from "../../../hooks/usePermissionsGranted"
import { useToast } from "../../../hooks/useToast"
import type { CommandItemProps } from "../../../types/command"
import { Icon } from "../../Icon"
import { KeybindingDisplay } from "../../KeybindingDisplay"
import { CommandName } from "../CommandName"

interface Props extends CommandItemProps {
  children?: ReactNode
}

export function CommandItem({
  suggestion,
  onSelect,
  currentPage,
  children,
}: Props) {
  const toast = useToast()
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const focusedValue = useCommandState((state) => state.value)
  const { isGrantedAllPermissions } = usePermissionsGranted(
    suggestion.permissions || [],
  )
  const inputRef = useRef<HTMLInputElement | null>(null)

  const type = suggestion.type
  const isInlineInput = type === "input"
  const isDisplayOnly = type === "display"

  // Check if this command requires confirmation
  const requiresConfirmation =
    type !== "group" && !isInlineInput && suggestion.confirmAction === true

  // Reset confirmation state when suggestion changes (navigation)
  useEffect(() => {
    setAwaitingConfirmation(false)
  }, [])

  // Clear confirmation when this item is no longer focused
  useEffect(() => {
    if (awaitingConfirmation && focusedValue !== suggestion.id) {
      setAwaitingConfirmation(false)
    }
  }, [focusedValue, suggestion.id, awaitingConfirmation])

  // Focus inline input when this item becomes focused
  useEffect(() => {
    if (isInlineInput && focusedValue === suggestion.id) {
      inputRef.current?.focus()
    }
  }, [focusedValue, suggestion.id, isInlineInput])

  const handleSelect = () => {
    // Do nothing for inline input or display rows
    if (isInlineInput || isDisplayOnly) {
      return
    }
    if (!isGrantedAllPermissions) {
      toast(
        "error",
        "Permissions required. Check the action menu to give these",
      )
      return
    }
    if (requiresConfirmation && !awaitingConfirmation) {
      // First press - show confirmation
      setAwaitingConfirmation(true)
    } else {
      // Second press (confirmation) or no confirmation needed - execute
      setAwaitingConfirmation(false)
      onSelect(suggestion.id)
    }
  }

  // Process the display name based on context
  // If we're viewing children of a parent, don't show parent names even for favorited commands
  const getContextualDisplayName = (name: string | string[]) => {
    // If we're viewing children of a parent and the name is an array (parent > child format),
    // only show the child name (first element) since the parent context is already clear
    if (currentPage.parent && Array.isArray(name)) {
      return name[0] // Just show the command name, not "parent > child"
    }
    return name // Show as-is for top-level views
  }

  const displayName = awaitingConfirmation
    ? "Are you sure?"
    : getContextualDisplayName(suggestion.name)

  const inputField = suggestion.inputField
  const onInlineInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault()
      const searchInput = document.querySelector(
        "input[cmdk-input]",
      ) as HTMLInputElement | null
      searchInput?.focus()
    }
  }

  return (
    <Command.Item
      value={suggestion.id}
      keywords={suggestion.keywords}
      onSelect={handleSelect}
    >
      <Icon icon={suggestion.icon} color={suggestion.color} />
      <div className="command-item-content">
        {suggestion.isFavorite && <Icon name="Star" color="#fbbf24" />}
        {isInlineInput && inputField?.type === "text" ? (
          <div className="command-item-inline-input">
            {inputField.label && (
              <label className="command-item-label" htmlFor={inputField.id}>
                {inputField.label}
              </label>
            )}
            <input
              id={inputField.id}
              ref={inputRef}
              type="text"
              placeholder={inputField.placeholder}
              defaultValue={inputField.defaultValue}
              onKeyDown={onInlineInputKeyDown}
            />
          </div>
        ) : (
          <CommandName
            permissions={suggestion.permissions}
            name={displayName}
            className="command-item-name"
          />
        )}
      </div>
      {suggestion.keybinding && (
        <KeybindingDisplay keybinding={suggestion.keybinding} />
      )}
      <span cmdk-raycast-meta="">
        {type === "input"
          ? "Input"
          : type === "display"
            ? "Display"
            : type === "group"
              ? "Group"
              : "Command"}
      </span>
      {children}
    </Command.Item>
  )
}
