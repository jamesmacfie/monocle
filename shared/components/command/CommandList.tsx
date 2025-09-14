import { Command, useCommandState } from "cmdk"
import { Loader2, SearchX } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { Suggestion } from "../../../shared/types"
import { useToast } from "../../hooks/useToast"
import type { Page } from "../../store/slices/navigation.slice"
import {
  collectInputFieldsFromSuggestions,
  validateFormValues,
} from "../../utils/forms"
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
  const toast = useToast()

  // Track when user is actively typing to show loader during debounce period
  const [isTyping, setIsTyping] = useState(false)

  // Debounce typing state to prevent flash of "No results" during search
  useEffect(() => {
    if (cmdkSearch) {
      setIsTyping(true)
      const timer = setTimeout(() => {
        setIsTyping(false)
      }, 250) // Standard debounce timing for search responsiveness
      return () => clearTimeout(timer)
    } else {
      setIsTyping(false)
    }
  }, [cmdkSearch])

  const handleInputSubmit = useCallback(() => {
    // Validate form inputs before triggering first submit
    const fields = collectInputFieldsFromSuggestions(
      currentPage.commands.suggestions || [],
    )
    const result = validateFormValues(currentPage.formValues || {}, fields)
    if (!result.isValid) {
      toast("error", "Form is invalid. Check inputs.")
      return
    }
    const firstSubmitCommand = currentPage.commands.suggestions?.find(
      (cmd) => cmd.type === "submit",
    )
    if (firstSubmitCommand) {
      onSelect(firstSubmitCommand.id)
    }
  }, [
    currentPage.commands.suggestions,
    currentPage.formValues,
    onSelect,
    toast,
  ])

  return (
    <Command.List className="cmdk-command-list">
      {isLoading || isTyping ? (
        <Command.Empty>
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </Command.Empty>
      ) : (
        cmdkSearch && (
          <Command.Empty>
            <div className="flex flex-col items-center justify-center gap-2 py-4">
              <SearchX className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-gray-500">No results</span>
            </div>
          </Command.Empty>
        )
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
      {(currentPage.commands.suggestions || []).length > 0 && (
        <Command.Group heading="Suggestions">
          {(currentPage.commands.suggestions || []).map((item) => (
            <CommandItem
              key={item.id}
              suggestion={item}
              onSelect={onSelect}
              currentPage={currentPage}
              onInputSubmit={handleInputSubmit}
            />
          ))}
        </Command.Group>
      )}
      <DeepSearchItems
        currentPage={currentPage}
        onSelect={onSelect}
        onDeepSearchItemsChange={onDeepSearchItemsChange}
        deepSearchItems={deepSearchItems}
      />
    </Command.List>
  )
}
