import { useCommandState } from "cmdk"
import { useEffect } from "react"
import type { Suggestion } from "../../types/command"
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
  onDeepSearchItemsChange?: (items: Suggestion[]) => void
  deepSearchItems: Suggestion[]
}

export function DeepSearchItems({
  currentPage,
  onSelect,
  onDeepSearchItemsChange,
  deepSearchItems,
}: DeepSearchItemsProps) {
  const search = useCommandState((state) => state.search)

  // Only show deep search items when searching and we're at the top level (no parent)
  const shouldShowDeepSearchItems = search && !currentPage.parent

  // Notify parent component of the current deep search items
  useEffect(() => {
    if (shouldShowDeepSearchItems) {
      onDeepSearchItemsChange?.(deepSearchItems)
    } else {
      onDeepSearchItemsChange?.([])
    }
  }, [shouldShowDeepSearchItems, deepSearchItems, onDeepSearchItemsChange])

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
