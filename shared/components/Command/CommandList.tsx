import { Command } from "cmdk"
import { Loader2, SearchX } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "../../hooks/useToast"
import type { Page } from "../../store/slices/navigation.slice"
import {
  collectInputFieldsFromSuggestions,
  validateFormValues,
} from "../../utils/forms"
import { CommandItem } from "./CommandItem"

export interface CommandListProps {
  currentPage: Page
  onSelect: (id: string) => void
  isLoading?: boolean
}

export function CommandList({
  currentPage,
  onSelect,
  isLoading = false,
}: CommandListProps) {
  const toast = useToast()
  const listRef = useRef<HTMLDivElement>(null)
  const prevSearchRef = useRef<string>("")

  const searchValue = currentPage.searchValue
  const trimmedQuery = searchValue.trim()

  // Form pages bypass search entirely: all rows stay visible while typing.
  // Display rows (NoOp empty/error states) intentionally don't count.
  const isFormPage = (currentPage.commands.suggestions || []).some(
    (suggestion) => suggestion.type === "input" || suggestion.type === "submit",
  )

  // Search-type pages (dynamicChildren) keep their get-children flow and
  // render results through commands.suggestions, not searchResults
  const isSearchDriven =
    trimmedQuery.length > 0 && !isFormPage && !currentPage.dynamicChildren

  // Track when user is actively typing to show loader during the debounce
  // window before the background search/refresh dispatches
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    if (trimmedQuery) {
      setIsTyping(true)
      const timer = setTimeout(() => {
        setIsTyping(false)
      }, 250) // Matches the search/refresh debounce timing
      return () => clearTimeout(timer)
    } else {
      setIsTyping(false)
    }
  }, [trimmedQuery])

  // Scroll to top when search value changes
  useEffect(() => {
    if (searchValue !== prevSearchRef.current && listRef.current) {
      prevSearchRef.current = searchValue
      // Use requestAnimationFrame to ensure DOM updates are complete before scrolling
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: 0, behavior: "instant" })
      })
    }
  })

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

  const showSpinner =
    isLoading || isTyping || currentPage.searchLoading === true

  return (
    <Command.List ref={listRef} className="cmdk-command-list">
      {/* Command.Empty renders only when no items are mounted */}
      {showSpinner ? (
        <Command.Empty>
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </Command.Empty>
      ) : (
        trimmedQuery && (
          <Command.Empty>
            <div className="flex flex-col items-center justify-center gap-2 py-4">
              <SearchX className="h-8 w-8 text-gray-400" />
              <span className="text-sm text-gray-500">No results</span>
            </div>
          </Command.Empty>
        )
      )}
      {isSearchDriven ? (
        // Background-ranked results: a single flat group that includes
        // deep-search matches inline
        (currentPage.searchResults || []).length > 0 && (
          <Command.Group heading="Results">
            {(currentPage.searchResults || []).map((item) => (
              <CommandItem
                key={item.id}
                suggestion={item}
                onSelect={onSelect}
                currentPage={currentPage}
              />
            ))}
          </Command.Group>
        )
      ) : (
        <>
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
        </>
      )}
    </Command.List>
  )
}
