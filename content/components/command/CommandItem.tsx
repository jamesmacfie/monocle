import type { ReactNode } from "react";
import { Command } from "cmdk";
import type { CommandItemProps } from "../../types/command";
import { Icon } from "../icon";
import { CommandName, getDisplayName } from "./CommandName";

interface Props extends CommandItemProps {
  children?: ReactNode;
}

export function CommandItem({
  suggestion,
  onSelect,
  currentPage,
  children,
}: Props) {
  const handleSelect = () => {
    onSelect(suggestion.id);
  };

  // Process the display name based on context
  // If we're viewing children of a parent, don't show parent names even for favorited commands
  const getContextualDisplayName = (name: string | string[]) => {
    // If we're viewing children of a parent and the name is an array (parent > child format),
    // only show the child name (first element) since the parent context is already clear
    if (currentPage.parent && Array.isArray(name)) {
      return name[0]; // Just show the command name, not "parent > child"
    }
    return name; // Show as-is for top-level views
  };

  const displayName = getContextualDisplayName(suggestion.name);

  return (
    <Command.Item
      value={getDisplayName(suggestion.name)}
      keywords={suggestion.keywords}
      onSelect={handleSelect}
    >
      <Icon
        name={suggestion.icon?.name}
        url={suggestion.icon?.url}
        color={suggestion.color}
      />
      <div className="command-item-content">
        {suggestion.isFavorite && <Icon name="Star" color="#fbbf24" />}
        <CommandName name={displayName} className="command-item-name" />
      </div>
      {suggestion.keybinding && (
        <div cmdk-raycast-submenu-shortcuts="">
          {suggestion.keybinding.split(" ").map((key) => {
            // Normalize key symbols for better display
            const normalizedKey = key
              .replace(/⌃/g, "Ctrl")
              .replace(/⌘/g, "Cmd")
              .replace(/⌥/g, "Alt")
              .replace(/⇧/g, "Shift")
              .replace(/↵/g, "↵");

            return <kbd key={key}>{normalizedKey}</kbd>;
          })}
        </div>
      )}
      <span cmdk-raycast-meta="">
        {suggestion.hasCommands ? "Group" : "Command"}
      </span>
      {children}
    </Command.Item>
  );
}
