import { useCommandState } from "cmdk"
import type { Suggestion } from "../../types"
import { CommandItem } from "./CommandItem"

interface DeepSearchItemsProps {
  currentPage: {
    id: string
    commands: {
      favorites: Suggestion[]
      suggestions: Suggestion[]
    }
    searchValue: string
    parent?: Suggestion
    parentPath: string[]
  }
  onSelect: (commandId: string) => void
  deepSearchItems: Suggestion[]
}

export function DeepSearchItems({
  currentPage,
  onSelect,
  deepSearchItems,
}: DeepSearchItemsProps) {
  const search = useCommandState((state) => state.search)

  // Only show deep search items when searching and we're at the top level (no parent)
  const shouldShowDeepSearchItems = search && !currentPage.parent

  // Don't render anything if we're not searching or if we're in a nested view
  if (!shouldShowDeepSearchItems) {
    return null
  }

  return (
    <>
      {deepSearchItems.map((item) => (
        <CommandItem
          key={`deep-search-${item.id}`}
          suggestion={item}
          onSelect={onSelect}
          currentPage={currentPage}
        />
      ))}
    </>
  )
}
