import type { Suggestion } from "../../../../shared/types"
import { Icon } from "../../Icon"
import { KeybindingDisplay } from "../../KeybindingDisplay"
import { CommandName } from "../CommandName"

interface CommandItemDisplayProps {
  suggestion: Suggestion
  displayName: string | string[]
}

export function CommandItemDisplay({
  suggestion,
  displayName,
}: CommandItemDisplayProps) {
  return (
    <>
      <div className="command-item-content">
        <Icon icon={suggestion.icon} color={suggestion.color} />
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
      <span cmdk-raycast-meta="">Todo</span>
    </>
  )
}
