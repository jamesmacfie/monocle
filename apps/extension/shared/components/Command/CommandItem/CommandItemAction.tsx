import type { Suggestion } from "../../../../shared/types"
import { Icon } from "../../Icon"
import { KeybindingDisplay } from "../../KeybindingDisplay"
import { CommandName } from "../CommandName"

interface CommandItemActionProps {
  suggestion: Suggestion
  displayName: string | string[]
}

export function CommandItemAction({
  suggestion,
  displayName,
}: CommandItemActionProps) {
  const getMetaLabel = () => {
    switch (suggestion.type) {
      case "group":
        return "Group"
      case "action":
        return "Command"
      default:
        return "Command"
    }
  }

  return (
    <>
      <div className="command-item-content">
        <Icon icon={suggestion.icon} color={suggestion.color} />
        {suggestion.isFavorite && (
          <Icon name="Star" color="var(--color-favorite)" />
        )}
        <CommandName
          permissions={suggestion.permissions}
          name={displayName}
          className="command-item-name"
        />
      </div>
      {suggestion.keybinding && (
        <KeybindingDisplay keybinding={suggestion.keybinding} />
      )}
      <span cmdk-raycast-meta="">{getMetaLabel()}</span>
    </>
  )
}
