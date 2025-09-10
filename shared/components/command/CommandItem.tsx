import { Command, useCommandState } from "cmdk"
import { type ReactNode, useEffect, useState } from "react"
import { usePermissionsGranted } from "../../hooks/usePermissionsGranted"
import { useToast } from "../../hooks/useToast"
import type { CommandItemProps } from "../../types/command"
import { Icon } from "../Icon"
import { KeybindingDisplay } from "../KeybindingDisplay"
import { CommandName } from "./CommandName"

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

  // Check if this command requires confirmation
  const requiresConfirmation =
    !suggestion.isParentCommand &&
    !suggestion.ui &&
    suggestion.confirmAction === true

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

  const handleSelect = () => {
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

  return (
    <Command.Item
      value={suggestion.id}
      keywords={suggestion.keywords}
      onSelect={handleSelect}
    >
      <Icon icon={suggestion.icon} color={suggestion.color} />
      <div className="command-item-content">
        {suggestion.isFavorite && <Icon name="Star" color="#fbbf24" />}
        <CommandName
          permissions={suggestion.permissions}
          name={displayName}
          className="command-item-name"
        />
      </div>
      {suggestion.keybinding && (
        <KeybindingDisplay keybinding={suggestion.keybinding} />
      )}
      <span cmdk-raycast-meta="">
        {suggestion.isParentCommand ? "Group" : "Command"}
      </span>
      {children}
    </Command.Item>
  )
}
