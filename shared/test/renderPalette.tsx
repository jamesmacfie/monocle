// Shared harness for DOM-level palette tests.
//
// Convention: DOM tests are named `*.dom.test.tsx` and opt into jsdom with a
// `// @vitest-environment jsdom` pragma on line 1 — everything else stays on
// the default node environment (see vitest.config.ts). This harness mirrors
// the production store wiring in
// content/components/ContentCommandPaletteWithState.tsx with a mocked
// message function so tests exercise the real CommandPalette + Redux +
// cmdk integration without a browser.
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Provider } from "react-redux"
import { vi } from "vitest"
import { CommandPalette } from "../components/Command/CommandPalette"
import { createAppStore } from "../store"
import { loadPermissions } from "../store/slices/settings.slice"
import type { CommandData, Suggestion } from "../types"

// jsdom lacks a few DOM APIs cmdk/Radix touch; stub them once per import.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = () => {}
}
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollTo !== "function"
) {
  Element.prototype.scrollTo = () => {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

export const actionSuggestion = (
  id: string,
  name: string = id,
): Suggestion => ({
  type: "action",
  id,
  name,
  actionLabel: "Run",
})

export const groupSuggestion = (id: string, name: string = id): Suggestion => ({
  type: "group",
  id,
  name,
  actionLabel: "Open",
})

type MessageHandlers = Record<
  string,
  (message: Record<string, unknown>) => unknown
>

// vi.fn dispatching on message.type with palette-shaped defaults. Override
// per test to control children/search responses.
export const createMockSendMessage = (overrides: MessageHandlers = {}) => {
  const defaults: MessageHandlers = {
    "get-children-commands": () => ({
      children: [actionSuggestion("child-1"), actionSuggestion("child-2")],
    }),
    "search-commands": (message) => ({
      results: [actionSuggestion("search-result")],
      seq: message.seq,
      query: message.query,
    }),
  }
  const handlers = { ...defaults, ...overrides }

  return vi.fn(async (message: { type?: string }) => {
    const handler = message?.type ? handlers[message.type] : undefined
    if (!handler) {
      return { success: true }
    }
    return await handler(message as Record<string, unknown>)
  })
}

export const defaultItems = (): CommandData => ({
  favorites: [],
  suggestions: [
    actionSuggestion("alpha-action", "Alpha Action"),
    actionSuggestion("beta-action", "Beta Action"),
    groupSuggestion("my-group", "My Group"),
  ],
})

export const renderPalette = (
  options: {
    items?: CommandData
    sendMessage?: ReturnType<typeof createMockSendMessage>
  } = {},
) => {
  const sendMessage = options.sendMessage ?? createMockSendMessage()
  const store = createAppStore(sendMessage)
  const items = options.items ?? defaultItems()
  const executeCommand = vi.fn(async () => {})
  const close = vi.fn()
  const onRefreshCommands = vi.fn(async () => {})
  const user = userEvent.setup()

  // Production palettes dispatch loadPermissions() on mount; rows treat
  // unloaded permissions as not-granted and refuse selection. Seed the same
  // state the thunk would produce.
  store.dispatch(
    loadPermissions.fulfilled(
      {
        isLoaded: true,
        access: {
          activeTab: true,
          bookmarks: true,
          browsingData: true,
          contextualIdentities: true,
          cookies: true,
          downloads: true,
          history: true,
          sessions: true,
          storage: true,
          tabs: true,
        },
      },
      "test",
    ),
  )

  const result = render(
    <Provider store={store}>
      <CommandPalette
        items={items}
        executeCommand={executeCommand}
        close={close}
        onRefreshCommands={onRefreshCommands}
      />
    </Provider>,
  )

  const getSearchInput = (): HTMLInputElement => {
    const input = result.container.querySelector("input[cmdk-input]")
    if (!input) {
      throw new Error("cmdk search input not found")
    }
    return input as HTMLInputElement
  }

  // Suggestion names can render in several places (row, footer); target the
  // cmdk item by its stable data-value (= suggestion id) instead of text.
  const getItem = (id: string): HTMLElement => {
    const item = result.container.querySelector(
      `[cmdk-item][data-value="${id}"]`,
    )
    if (!item) {
      throw new Error(`cmdk item not found for id: ${id}`)
    }
    return item as HTMLElement
  }

  const getNavigationState = () => {
    const state = store.getState() as {
      navigation: {
        pages: Array<{
          id: string
          searchValue: string
          searchResults?: Suggestion[]
        }>
      }
    }
    return state.navigation
  }

  return {
    ...result,
    store,
    user,
    sendMessage,
    executeCommand,
    close,
    onRefreshCommands,
    getSearchInput,
    getItem,
    getNavigationState,
  }
}
