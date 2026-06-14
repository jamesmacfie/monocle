import { useCallback } from "react"

/**
 * Shared helpers for inline input keyboard behavior inside CMDK lists.
 * - Up/Down: navigate CMDK items (focus search on Up at first item)
 * - Escape: focus search input
 * - Backspace: stop propagation (prevent navigateBack)
 */
export function useInlineInputKeys() {
  // Resolve the search input from the focused element's root node rather than
  // `document`. In content-overlay mode the palette lives in a *closed* shadow
  // root, which `document.querySelector` cannot pierce; querying the shared
  // root node finds the input in both the shadow DOM and the new-tab DOM.
  const getSearchInput = useCallback(
    (from?: Element | null): HTMLInputElement | null => {
      const root = (from?.getRootNode?.() ?? document) as Document | ShadowRoot
      return root.querySelector("input[cmdk-input]") as HTMLInputElement | null
    },
    [],
  )

  const focusSearchInput = useCallback(
    (from?: Element | null) => {
      getSearchInput(from)?.focus()
    },
    [getSearchInput],
  )

  const isFirstSelectableItem = useCallback((target: Element | null) => {
    const itemEl = target?.closest("[cmdk-item]") as HTMLElement | null
    const list = itemEl?.closest("[cmdk-list]")
    const firstItem = list?.querySelector(
      '[cmdk-item]:not([data-disabled="true"])',
    ) as HTMLElement | null
    return !!itemEl && !!firstItem && itemEl === firstItem
  }, [])

  const forwardArrowToCmdk = useCallback(
    (key: "ArrowUp" | "ArrowDown", from?: Element | null) => {
      const searchInput = getSearchInput(from)
      if (!searchInput) return
      const ev = new KeyboardEvent("keydown", { key, bubbles: true })
      searchInput.dispatchEvent(ev)
    },
    [getSearchInput],
  )

  const stopBackspaceNavigate = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      e.stopPropagation()
      return true
    }
    return false
  }, [])

  const handleCommonKeys = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // Up/Down -> navigate CMDK
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === "ArrowUp" && isFirstSelectableItem(e.currentTarget)) {
          focusSearchInput(e.currentTarget)
          return true
        }
        forwardArrowToCmdk(e.key, e.currentTarget)
        return true
      }

      // Escape -> focus search
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        focusSearchInput(e.currentTarget)
        return true
      }

      // Backspace -> don't bubble to container (don’t navigate back)
      if (e.key === "Backspace") {
        e.stopPropagation()
        return true
      }

      return false
    },
    [focusSearchInput, forwardArrowToCmdk, isFirstSelectableItem],
  )

  return {
    getSearchInput,
    focusSearchInput,
    isFirstSelectableItem,
    forwardArrowToCmdk,
    stopBackspaceNavigate,
    handleCommonKeys,
  }
}
