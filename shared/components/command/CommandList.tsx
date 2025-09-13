import { Command, useCommandState } from "cmdk"
import { Loader2 } from "lucide-react"
import type { Suggestion } from "../../../types/"
import type { Page } from "../../types/command"
import { CommandItem } from "./CommandItem"
import { DeepSearchItems } from "./DeepSearchItems"

export interface CommandListProps {
  currentPage: Page
  onSelect: (id: string) => void
  isLoading?: boolean
}

export function CommandList({
  currentPage,
  onSelect,
  onDeepSearchItemsChange,
  deepSearchItems = [],
  isLoading = false,
}: CommandListProps & {
  onDeepSearchItemsChange?: (items: Suggestion[]) => void
  deepSearchItems?: Suggestion[]
}) {
  const cmdkSearch = useCommandState((state) => state.search)

  return (
    <Command.List className="cmdk-command-list">
      {isLoading ? (
        <Command.Empty>
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </Command.Empty>
      ) : (
        <Command.Empty>No results found for "{cmdkSearch}"</Command.Empty>
      )}
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
      <DeepSearchItems
        currentPage={currentPage}
        onSelect={onSelect}
        onDeepSearchItemsChange={onDeepSearchItemsChange}
        deepSearchItems={deepSearchItems}
      />
    </Command.List>
  )
}
