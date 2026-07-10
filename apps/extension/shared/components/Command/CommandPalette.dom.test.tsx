// @vitest-environment jsdom
//
// Characterization tests for the CMDK↔Redux sync paths CLAUDE.md flags as
// fragile: typing/debounced search, navigation clearing search, Escape and
// Backspace behavior, search restoration on back-nav, and stale-response
// handling. These pin CURRENT behavior — when palette behavior is changed
// intentionally, update the test in the same PR and say so in its name.
import { waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  actionSuggestion,
  createMockSendMessage,
  groupSuggestion,
  renderPalette,
} from "../../test/renderPalette"

const searchCallsOf = (sendMessage: ReturnType<typeof createMockSendMessage>) =>
  sendMessage.mock.calls.filter(([message]) => {
    return (message as { type?: string })?.type === "monocle-commands-search"
  })

describe("CommandPalette CMDK↔Redux sync", () => {
  it("renders the initial suggestions", async () => {
    const { getItem } = renderPalette()

    await waitFor(() => {
      expect(getItem("alpha-action")).toBeTruthy()
      expect(getItem("my-group")).toBeTruthy()
    })
  })

  it("debounces typing into a single search-commands request", async () => {
    const { user, getSearchInput, getNavigationState, sendMessage } =
      renderPalette()

    await user.type(getSearchInput(), "tab")

    await waitFor(() => {
      const { pages } = getNavigationState()
      expect(pages[pages.length - 1].searchValue).toBe("tab")
    })

    await waitFor(() => {
      expect(searchCallsOf(sendMessage)).toHaveLength(1)
    })
    expect(searchCallsOf(sendMessage)[0][0]).toMatchObject({
      type: "monocle-commands-search",
      query: "tab",
    })
  })

  it("navigating into a group pushes a page and clears the search input", async () => {
    const { user, getItem, getSearchInput, getNavigationState } =
      renderPalette()

    await user.click(getItem("my-group"))

    await waitFor(() => {
      expect(getNavigationState().pages).toHaveLength(2)
    })
    expect(getSearchInput().value).toBe("")
    const { pages } = getNavigationState()
    expect(pages[1].searchValue).toBe("")
    await waitFor(() => {
      expect(getItem("child-1")).toBeTruthy()
    })
  })

  it("Backspace on an empty nested search navigates back and restores the parent search", async () => {
    const sendMessage = createMockSendMessage({
      // Make the typed query surface the group so we can navigate from an
      // active search (search results replace suggestions while typing).
      "monocle-commands-search": (message) => ({
        results: [groupSuggestion("my-group", "My Group")],
        seq: message.seq,
        query: message.query,
      }),
    })
    const { user, getItem, getSearchInput, getNavigationState } = renderPalette(
      { sendMessage },
    )

    await user.type(getSearchInput(), "gro")
    await waitFor(() => {
      expect(getItem("my-group")).toBeTruthy()
    })
    await user.click(getItem("my-group"))
    await waitFor(() => {
      expect(getNavigationState().pages).toHaveLength(2)
    })

    await user.keyboard("{Backspace}")

    await waitFor(() => {
      expect(getNavigationState().pages).toHaveLength(1)
    })
    // characterization: back-nav restores the parent page's search text
    await waitFor(() => {
      expect(getSearchInput().value).toBe("gro")
    })
  })

  it("Backspace with a non-empty search edits text instead of navigating", async () => {
    const { user, getItem, getSearchInput, getNavigationState } =
      renderPalette()

    await user.click(getItem("my-group"))
    await waitFor(() => {
      expect(getNavigationState().pages).toHaveLength(2)
    })

    await user.type(getSearchInput(), "y")
    await waitFor(() => {
      const { pages } = getNavigationState()
      expect(pages[pages.length - 1].searchValue).toBe("y")
    })
    await user.keyboard("{Backspace}")

    expect(getNavigationState().pages).toHaveLength(2)
    await waitFor(() => {
      expect(getSearchInput().value).toBe("")
    })
  })

  it("first keystroke immediately after entering a group is not dropped", async () => {
    // PAL-01 regression: the old imperative ignoreSearchUpdate DOM dance held a
    // flag open for ~100ms after navigation and swallowed the first keystroke.
    // With Redux as the single owner of the search string, typing with no delay
    // must register.
    const { user, getItem, getSearchInput, getNavigationState } =
      renderPalette()

    await user.click(getItem("my-group"))
    await waitFor(() => {
      expect(getNavigationState().pages).toHaveLength(2)
    })

    // No delay — type the instant the child page renders.
    await user.type(getSearchInput(), "child")
    await waitFor(() => {
      const { pages } = getNavigationState()
      expect(pages[pages.length - 1].searchValue).toBe("child")
    })
  })

  it("Escape navigates back on a child page and closes on the root page", async () => {
    const { user, getItem, getNavigationState, close } = renderPalette()

    await user.click(getItem("my-group"))
    await waitFor(() => {
      expect(getNavigationState().pages).toHaveLength(2)
    })

    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(getNavigationState().pages).toHaveLength(1)
    })
    expect(close).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1)
    })
  })

  it("drops stale search responses by sequence number", async () => {
    let releaseFirst: (() => void) | undefined
    let callCount = 0

    const sendMessage = createMockSendMessage({
      "monocle-commands-search": async (message) => {
        callCount += 1
        if (callCount === 1) {
          // First request resolves late, AFTER the second's response landed.
          await new Promise<void>((resolve) => {
            releaseFirst = resolve
          })
          return {
            results: [actionSuggestion("stale-result", "Stale Result")],
            seq: message.seq,
            query: message.query,
          }
        }
        return {
          results: [actionSuggestion("fresh-result", "Fresh Result")],
          seq: message.seq,
          query: message.query,
        }
      },
    })
    const { user, getSearchInput, getNavigationState } = renderPalette({
      sendMessage,
    })

    await user.type(getSearchInput(), "a")
    await waitFor(() => {
      expect(callCount).toBe(1)
    })

    await user.type(getSearchInput(), "b")
    await waitFor(() => {
      expect(callCount).toBe(2)
    })
    await waitFor(() => {
      const { pages } = getNavigationState()
      expect(pages[0].searchResults?.[0]?.id).toBe("fresh-result")
    })

    releaseFirst?.()
    // The late seq-1 response must not clobber the fresh seq-2 results.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const { pages } = getNavigationState()
    expect(pages[0].searchResults?.[0]?.id).toBe("fresh-result")
  })

  it("a pending debounced search is cancelled when the query changes before it fires", async () => {
    const { user, getSearchInput, sendMessage } = renderPalette()

    // Type then clear within the 200ms debounce window: each searchValue
    // change cancels the pending timer, and the empty query dispatches no
    // search at all.
    await user.type(getSearchInput(), "boo")
    await user.keyboard("{Backspace}{Backspace}{Backspace}")

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(searchCallsOf(sendMessage)).toHaveLength(0)
  })
})
