import { Command, useCommandState } from "cmdk"
import type { CommandListProps } from "../../types/command"
import { CommandItem } from "./CommandItem"

export function CommandList({ currentPage, onSelect }: CommandListProps) {
  const cmdkSearch = useCommandState((state) => state.search)

  return (
    <Command.List className="cmdk-command-list">
      <Command.Empty>No results found for "{cmdkSearch}"</Command.Empty>
      {(currentPage.commands.favorites || []).length > 0 && (
        <Command.Group heading="Favorites">
          {(currentPage.commands.favorites || []).map((item) => (
            <CommandItem
              key={item.id}
              suggestion={item}
              onSelect={onSelect}
              currentPage={currentPage}
            />
          ))}
        </Command.Group>
      )}
      {(currentPage.commands.recents || []).length > 0 && (
        <Command.Group heading="Recents">
          {(currentPage.commands.recents || []).map((item) => (
            <CommandItem
              key={item.id}
              suggestion={item}
              onSelect={onSelect}
              currentPage={currentPage}
            />
          ))}
        </Command.Group>
      )}
      <Command.Group heading="Suggestions">
        {(currentPage.commands.suggestions || []).map((item) => (
          <CommandItem
            key={item.id}
            suggestion={item}
            onSelect={onSelect}
            currentPage={currentPage}
          />
        ))}
      </Command.Group>
    </Command.List>
  )
}
