import { Command } from "cmdk"
import type { ReactNode } from "react"
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
  const handleSelect = () => {
    onSelect(suggestion.id)
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

  const displayName = getContextualDisplayName(suggestion.name)

  return (
    <Command.Item
      value={suggestion.id}
      keywords={suggestion.keywords}
      onSelect={handleSelect}
    >
      <Icon icon={suggestion.icon} color={suggestion.color} />
      <div className="command-item-content">
        {suggestion.isFavorite && <Icon name="Star" color="#fbbf24" />}
        <CommandName name={displayName} className="command-item-name" />
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
