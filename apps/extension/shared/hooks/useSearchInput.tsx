import { useCallback } from "react"

/**
 * Custom hook to interact with the CMDK search input element
 * Provides a consistent way to find and focus the search input across components
 */
export function useSearchInput() {
  const getSearchInput = useCallback((): HTMLInputElement | null => {
    return document.querySelector(
      "input[cmdk-input]",
    ) as HTMLInputElement | null
  }, [])

  const focusSearchInput = useCallback((): void => {
    const searchInput = getSearchInput()
    searchInput?.focus()
  }, [getSearchInput])

  return {
    getSearchInput,
    focusSearchInput,
  }
}
